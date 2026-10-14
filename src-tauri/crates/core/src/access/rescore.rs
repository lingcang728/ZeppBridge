//! 按授权范围重算洞察：只用范围内的跑步（从 access.rs 拆出，逻辑不变）。

use super::*;

/// 一次已授权运动在基线重算里需要的字段。
#[derive(Debug, Clone)]
pub struct GrantedRun {
    pub workout_id: String,
    pub start_time: DateTime<Utc>,
    pub end_time: DateTime<Utc>,
    pub distance_meters: Option<f64>,
    pub avg_hr: Option<i32>,
    pub training_load: Option<f64>,
}

impl GrantedRun {
    pub fn from_workout(workout: &Workout) -> Self {
        Self {
            workout_id: workout.workout_id.clone(),
            start_time: workout.start_time,
            end_time: workout.end_time,
            distance_meters: workout.distance_meters,
            avg_hr: workout.avg_hr,
            training_load: workout.training_load,
        }
    }

    /// 与 `insight::RunRow::duration_seconds` 同规则。
    pub(super) fn duration_seconds(&self) -> Option<f64> {
        let seconds = (self.end_time - self.start_time).num_seconds();
        (seconds > 0).then_some(seconds as f64)
    }

    /// 候选都来自 `workout_insight` 已筛过的行，配速在入库时已验过
    /// 合理性区间，这里只需原始换算。
    pub(super) fn pace_seconds_per_km(&self) -> Option<f64> {
        let distance = self.distance_meters.filter(|value| *value > 0.0)?;
        let seconds = self.duration_seconds()?;
        Some(seconds / (distance / 1000.0))
    }
}

/// 把一份 `WorkoutInsight` 重算到只剩授权集里的证据。
///
/// `granted` 是授权运动 id 并集；`rows` 是调用方为这些 id（至少覆盖
/// `baseline_included ∪ baseline_excluded ∩ granted`）取回的明细。
/// `heart_rate_drift` 只看目标自己的逐点采样，不在裁剪范围内。
pub fn rescore_insight(
    insight: &mut WorkoutInsight,
    granted: &BTreeSet<String>,
    rows: &BTreeMap<String, GrantedRun>,
) {
    if !insight.supported {
        return;
    }

    // 1. 基线成员先裁到授权集；`beyond_max_samples` 的授权行先挑出来，
    //    名额空出时按原顺序（新→旧）补进，没空出的留在排除表里。
    let mut included: Vec<GrantedRun> = insight
        .baseline_included
        .iter()
        .filter(|entry| granted.contains(&entry.workout_id))
        .filter_map(|entry| rows.get(&entry.workout_id).cloned())
        .collect();
    let mut promotable: Vec<String> = Vec::new();
    let mut excluded: Vec<BaselineExclusion> = Vec::new();
    for entry in insight
        .baseline_excluded
        .iter()
        .filter(|entry| granted.contains(&entry.workout_id))
    {
        if entry.reason == "beyond_max_samples" {
            promotable.push(entry.workout_id.clone());
        } else {
            excluded.push(entry.clone());
        }
    }
    for workout_id in promotable {
        if included.len() >= insight::baseline::MAX_SAMPLES {
            excluded.push(BaselineExclusion {
                workout_id,
                reason: "beyond_max_samples".into(),
            });
        } else if let Some(row) = rows.get(&workout_id) {
            included.push(row.clone());
        }
        // rows 里没有这条（同一连接里不该发生）就只当没有授权——宁可少列，
        // 也不把拿不到数据的 id 挂进基线。
    }
    // 顺序沿用原洞察的语义：included 本来就是新→旧，补位行按原排除表
    // 顺序（同为新→旧）接在后面，不再另排。

    insight.baseline_included = included
        .iter()
        .map(|row| BaselineEntry {
            workout_id: row.workout_id.clone(),
            start_time: row.start_time.to_rfc3339(),
            distance_meters: row.distance_meters.unwrap_or_default(),
        })
        .collect();
    insight.baseline_excluded = excluded;

    // 2. 每条事实按授权后的基线重算。未授权样本既不能出现在引用里，
    //    也不能参与均值——留着一个由未授权数据算出来的 baseline_value，
    //    列表裁得再干净也是泄漏。
    for fact in &mut insight.facts {
        rescore_fact(fact, &included);
    }
}

/// `insight::run_fact` 判定表的授权集版本。逻辑逐行对齐原实现；
/// `baseline_window` 保留原值——它描述的是规则本身，与样本集无关。
pub(super) fn rescore_fact(fact: &mut InsightFact, included: &[GrantedRun]) {
    let extract: fn(&GrantedRun) -> Option<f64> = match fact.metric.as_str() {
        "distance" => |row| row.distance_meters,
        "duration" => |row| row.duration_seconds(),
        "pace" => |row| row.pace_seconds_per_km(),
        "avg_hr" => |row| row.avg_hr.map(f64::from),
        "training_load" => |row| row.training_load,
        _ => |_| None,
    };
    let mut values = Vec::new();
    let mut refs = Vec::new();
    for row in included {
        if let Some(sample) = extract(row) {
            values.push(sample);
            refs.push(row.workout_id.clone());
        }
    }

    let enough = values.len() >= insight::baseline::MIN_SAMPLES;
    let (comparison, reason, reason_code) = match (fact.value, mean(&values)) {
        (Some(current), Some(previous)) if enough && previous != 0.0 => {
            let delta = current - previous;
            (
                Some(Comparison {
                    baseline_value: round1(previous),
                    delta: round1(delta),
                    delta_percent: round1(delta / previous.abs() * 100.0),
                    direction: direction_of(delta),
                }),
                None,
                None,
            )
        }
        (Some(_), Some(previous)) if enough && previous == 0.0 => (
            None,
            Some("已授权记录里该项基线均值为 0，无法计算相对变化。".into()),
            Some("workout_zero_baseline".to_string()),
        ),
        (Some(_), _) => (
            None,
            Some(format!(
                "已授权记录里距离相近（±{:.0}%）且有这项数据的跑步只有 {} 次，不足 {} 次，所以只报本次数值，不做比较。",
                insight::baseline::DISTANCE_TOLERANCE * 100.0,
                values.len(),
                insight::baseline::MIN_SAMPLES
            )),
            Some("workout_thin_baseline".to_string()),
        ),
        (None, _) => (
            None,
            Some("这次运动没有这项数据。".into()),
            Some("workout_no_value".to_string()),
        ),
    };

    fact.comparison = comparison;
    fact.evidence_count = values.len() as i64;
    fact.baseline_count = values.len() as i64;
    fact.confidence = if fact.value.is_none() {
        Confidence::Insufficient
    } else {
        // 与 `insight::Confidence::from_samples` 同一张表（私有函数，这里镜像）。
        match values.len() {
            0..=2 => Confidence::Insufficient,
            3..=4 => Confidence::Low,
            5..=7 => Confidence::Medium,
            _ => Confidence::High,
        }
    };
    fact.reason = reason;
    fact.reason_code = reason_code;
    fact.evidence_refs = refs;
}

/// 与 `insight::direction_of` 同一阈值：半个显示单位以下算持平。
pub(super) fn direction_of(delta: f64) -> String {
    if delta.abs() < 0.5 {
        "same".into()
    } else if delta > 0.0 {
        "higher".into()
    } else {
        "lower".into()
    }
}

pub(super) fn mean(values: &[f64]) -> Option<f64> {
    if values.is_empty() {
        return None;
    }
    Some(values.iter().sum::<f64>() / values.len() as f64)
}

pub(super) fn round1(value: f64) -> f64 {
    (value * 10.0).round() / 10.0
}

/* ------------------------------ 授权装载 ------------------------------

* `ai_tasks` 表是任务存储的载体（S1，v32 迁移）：每行一个任务，JSON 载荷
* 带 `schema_version`，`mcp_shared` 是可索引列。基线分支还没有这张表，
* 所以装载全程防御式：表不在、列不齐、单行载荷坏了，都按「这条没有授权」
* 处理——授权宁可少算一条，也不能因为一处坏数据把整个范围放开或搞崩。*/
