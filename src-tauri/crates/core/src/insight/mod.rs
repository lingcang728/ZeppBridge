//! 确定性洞察：跑后摘要与本地周报。
//!
//! 这一层**只产生可追溯的事实、比较和依据**，不产生一句自然语言。文案由界面
//! 负责，AI 只能解释这里给出的事实，不能改写它们。这样同一份库在界面、导出、
//! CLI、MCP 和 AI 数据包里给出的数值必然一致，差别只在展示形式。
//!
//! 三条硬规则：
//!
//! 1. **只和用户自己的历史比。** 项目没有人群基准数据，也不打算有。任何
//!    「和普通健康人群相比」的说法都没有本地依据。
//! 2. **证据不足就说不足。** 可比样本不够时返回 `insufficient` 和一句原因，
//!    不硬算一个百分比。
//! 3. **不做诊断、治疗或风险预测。** 这里只有「比你自己最近 N 次快了 3%」
//!    这种事实，没有「你可能有某某问题」。

use crate::models::error::Result;
use crate::storage::Database;
use chrono::{DateTime, Duration, NaiveDate, Utc};
use serde::{Deserialize, Serialize};

/// 单次跑步洞察的基线规则。全部是常量而不是散落在 SQL 里的字面量，
/// 因为它们决定结论，必须能被测试钉住。
pub mod baseline {
    /// 可比跑步的距离容差：±20%。
    pub const DISTANCE_TOLERANCE: f64 = 0.20;
    /// 至少要有这么多次可比跑步才给比较结论。
    pub const MIN_SAMPLES: usize = 3;
    /// 最多取最近这么多次，再多不会更准，只会把几个月前的状态混进来。
    pub const MAX_SAMPLES: usize = 10;
    /// 只回看这么多天。
    pub const WINDOW_DAYS: i64 = 180;
}

/// 周报窗口：最近 7 天对比此前 28 天的个人基线。
pub mod weekly {
    pub const RECENT_DAYS: i64 = 7;
    pub const BASELINE_DAYS: i64 = 28;
    /// 基线里至少要有这么多天有数据，否则这条结论只报现状不报比较。
    pub const MIN_BASELINE_DAYS: i64 = 7;
}

/// 一条事实和它的依据。
///
/// `value` 为 `None` 表示这项本地没有数据 —— 是「没有」，不是 0。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct InsightFact {
    /// 稳定的机器可读 id，例如 `run.pace`、`weekly.resting_hr`。
    /// 界面和 AI 都按它分支，不要按文案分支。
    pub fact_id: String,
    /// 指标名，和数据库里的 metric 名对齐。
    pub metric: String,
    pub value: Option<f64>,
    pub unit: String,
    /// 和个人基线的比较。证据不足时为 `None`。
    pub comparison: Option<Comparison>,
    pub baseline_window: Option<BaselineWindow>,
    /// 基线里实际用了多少个样本。
    pub evidence_count: i64,
    /// `device` / `user_fused` / `unknown`。
    pub source: String,
    pub confidence: Confidence,
    /// 为什么没有比较、为什么置信度低。有结论时也可能有说明。
    ///
    /// 中文原文，给 CLI / MCP / 导出用，不跟界面语言走。界面读下面的
    /// `reason_code`，配合 `baseline_window` 和 `baseline_count` 自己写句子。
    pub reason: Option<String>,
    /// 说明的稳定码：`weekly_thin_baseline` / `weekly_no_recent_data` /
    /// `workout_thin_baseline` / `workout_no_value`。
    #[serde(default)]
    pub reason_code: Option<String>,
    /// 基线里实际找到多少个样本。`evidence_count` 数的是本期的样本数，
    /// 两者不是一回事，界面写「此前 N 天里只有 M 天有数据」时要的是这个。
    #[serde(default)]
    pub baseline_count: i64,
    /// 这条事实指回了库里的哪些行（workout id 或日期），可以逐条查证。
    pub evidence_refs: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Comparison {
    pub baseline_value: f64,
    pub delta: f64,
    pub delta_percent: f64,
    /// `higher` / `lower` / `same`。方向是事实，好坏由界面按指标含义决定 ——
    /// 配速数字变小是变快，静息心率变小通常是好事，这一层不做价值判断。
    pub direction: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct BaselineWindow {
    /// `comparable_runs` 或 `previous_days`。
    pub kind: String,
    pub days: i64,
    pub min_samples: i64,
    pub max_samples: i64,
    /// 距离容差，只有 `comparable_runs` 有。
    pub distance_tolerance_percent: Option<f64>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Confidence {
    High,
    Medium,
    Low,
    /// 证据不够，这条只报现状，不报比较。
    Insufficient,
}

impl Confidence {
    fn from_samples(count: usize) -> Self {
        match count {
            0..=2 => Confidence::Insufficient,
            3..=4 => Confidence::Low,
            5..=7 => Confidence::Medium,
            _ => Confidence::High,
        }
    }
}

/// 一次运动的洞察。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct WorkoutInsight {
    pub workout_id: String,
    /// 这条记录当前生效的运动类型。
    pub workout_type: String,
    /// 是否支持这一类的洞察。第一版只做已验证的跑步。
    pub supported: bool,
    /// 不支持时说明原因；支持时为 `None`。
    pub unsupported_reason: Option<String>,
    /// 不支持原因的稳定码。目前只有 `unsupported_workout_type` 一种。
    #[serde(default)]
    pub unsupported_code: Option<String>,
    pub facts: Vec<InsightFact>,
    /// 实际被纳入基线的记录。
    pub baseline_included: Vec<BaselineEntry>,
    /// 被排除的记录和原因。用户能看到「为什么那次没算进去」。
    pub baseline_excluded: Vec<BaselineExclusion>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct BaselineEntry {
    pub workout_id: String,
    pub start_time: String,
    pub distance_meters: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct BaselineExclusion {
    pub workout_id: String,
    /// 稳定的排除原因：`distance_out_of_tolerance` / `outside_window` /
    /// `missing_distance` / `missing_duration` / `implausible_pace` /
    /// `beyond_max_samples`。
    pub reason: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct WeeklyReport {
    pub generated_at: String,
    pub recent_start: String,
    pub recent_end: String,
    pub baseline_start: String,
    pub baseline_end: String,
    pub facts: Vec<InsightFact>,
}

/// 第一版单次运动洞察只覆盖跑步：跑步是目前唯一同时拥有逐点采样、配速、
/// 功率和跑姿并且经过真实数据验证的类型。其他类型照常查看、纠正和导出，
/// 但这里如实说不支持，而不是套一套没验证过的规则。
const SUPPORTED_WORKOUT_TYPES: [&str; 1] = ["run"];

#[derive(Debug, Clone)]
struct RunRow {
    workout_id: String,
    start_time: DateTime<Utc>,
    end_time: DateTime<Utc>,
    distance_meters: Option<f64>,
    avg_hr: Option<i32>,
    training_load: Option<f64>,
    source_scope: String,
}

impl RunRow {
    fn duration_seconds(&self) -> Option<f64> {
        let seconds = (self.end_time - self.start_time).num_seconds();
        (seconds > 0).then_some(seconds as f64)
    }

    /// 配速，秒每公里。距离或时长缺失就是没有配速，不用 0 顶替。
    fn pace_seconds_per_km(&self) -> Option<f64> {
        let distance = self.distance_meters.filter(|value| *value > 0.0)?;
        let seconds = self.duration_seconds()?;
        let pace = seconds / (distance / 1000.0);
        // 世界纪录约 130 s/km，散步约 900 s/km。超出这个范围的多半是
        // 距离或时长本身有问题，拿去算平均只会污染基线。
        (120.0..=1800.0).contains(&pace).then_some(pace)
    }
}

impl Database {
    /// 单次运动的确定性洞察。
    pub fn workout_insight(&self, workout_id: &str) -> Result<WorkoutInsight> {
        let Some(workout) = self.get_workout_detail(workout_id)? else {
            return Err(crate::models::ZeppBridgeError::DataUnavailable(
                "本地库里没有这条运动记录".into(),
            ));
        };
        let workout_type = workout.effective_type.clone();
        if !SUPPORTED_WORKOUT_TYPES.contains(&workout_type.as_str()) {
            return Ok(WorkoutInsight {
                workout_id: workout_id.to_string(),
                workout_type,
                supported: false,
                unsupported_reason: Some(
                    "暂不支持这类运动的洞察。第一版只做已用真实数据验证过的跑步；其他运动仍可正常查看、纠正和导出。"
                        .into(),
                ),
                unsupported_code: Some("unsupported_workout_type".into()),
                facts: Vec::new(),
                baseline_included: Vec::new(),
                baseline_excluded: Vec::new(),
            });
        }

        let target = self.run_row(workout_id)?.ok_or_else(|| {
            crate::models::ZeppBridgeError::DataUnavailable("本地库里没有这条运动记录".into())
        })?;
        let (included, excluded) = self.comparable_runs(&target)?;

        let window = BaselineWindow {
            kind: "comparable_runs".into(),
            days: baseline::WINDOW_DAYS,
            min_samples: baseline::MIN_SAMPLES as i64,
            max_samples: baseline::MAX_SAMPLES as i64,
            distance_tolerance_percent: Some(baseline::DISTANCE_TOLERANCE * 100.0),
        };

        let facts = vec![
            run_fact(
                "run.distance",
                "distance",
                "m",
                target.distance_meters,
                &included,
                |row| row.distance_meters,
                &window,
                &target.source_scope,
            ),
            run_fact(
                "run.duration",
                "duration",
                "s",
                target.duration_seconds(),
                &included,
                RunRow::duration_seconds,
                &window,
                &target.source_scope,
            ),
            run_fact(
                "run.pace",
                "pace",
                "s/km",
                target.pace_seconds_per_km(),
                &included,
                RunRow::pace_seconds_per_km,
                &window,
                &target.source_scope,
            ),
            run_fact(
                "run.avg_hr",
                "avg_hr",
                "bpm",
                target.avg_hr.map(f64::from),
                &included,
                |row| row.avg_hr.map(f64::from),
                &window,
                &target.source_scope,
            ),
            run_fact(
                "run.training_load",
                "training_load",
                "load",
                target.training_load,
                &included,
                |row| row.training_load,
                &window,
                &target.source_scope,
            ),
        ];

        Ok(WorkoutInsight {
            workout_id: workout_id.to_string(),
            workout_type,
            supported: true,
            unsupported_reason: None,
            unsupported_code: None,
            facts,
            baseline_included: included
                .iter()
                .map(|row| BaselineEntry {
                    workout_id: row.workout_id.clone(),
                    start_time: row.start_time.to_rfc3339(),
                    distance_meters: row.distance_meters.unwrap_or_default(),
                })
                .collect(),
            baseline_excluded: excluded,
        })
    }

    fn run_row(&self, workout_id: &str) -> Result<Option<RunRow>> {
        let row = self.conn.query_row(
            "SELECT workout_id, start_time, end_time, distance_meters, avg_hr,
                    training_load, source_scope
             FROM workouts WHERE workout_id = ?1",
            rusqlite::params![workout_id],
            map_run_row,
        );
        match row {
            Ok(value) => Ok(Some(value?)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(error) => Err(error.into()),
        }
    }

    /// 选出可比的历史跑步，并把每一次排除的理由也带回来。
    ///
    /// 「为什么那次没算进去」是用户会问的问题。只给一个平均值而不解释纳入
    /// 范围，等于让人无法核对。
    fn comparable_runs(&self, target: &RunRow) -> Result<(Vec<RunRow>, Vec<BaselineExclusion>)> {
        let Some(target_distance) = target.distance_meters.filter(|value| *value > 0.0) else {
            return Ok((
                Vec::new(),
                vec![BaselineExclusion {
                    workout_id: target.workout_id.clone(),
                    reason: "missing_distance".into(),
                }],
            ));
        };
        let cutoff = (target.start_time - Duration::days(baseline::WINDOW_DAYS)).to_rfc3339();
        let mut stmt = self.conn.prepare(
            "SELECT workout_id, start_time, end_time, distance_meters, avg_hr,
                    training_load, source_scope
             FROM workouts
             WHERE workout_id <> ?1
               AND COALESCE(workout_type_override, workout_type) = 'run'
               AND start_time < ?2
               AND start_time >= ?3
             ORDER BY start_time DESC",
        )?;
        let rows = stmt.query_map(
            rusqlite::params![target.workout_id, target.start_time.to_rfc3339(), cutoff],
            map_run_row,
        )?;

        let low = target_distance * (1.0 - baseline::DISTANCE_TOLERANCE);
        let high = target_distance * (1.0 + baseline::DISTANCE_TOLERANCE);
        let mut included = Vec::new();
        let mut excluded = Vec::new();
        for row in rows {
            let row = row??;
            let reason = match row.distance_meters {
                None => Some("missing_distance"),
                Some(distance) if !(low..=high).contains(&distance) => {
                    Some("distance_out_of_tolerance")
                }
                _ if row.duration_seconds().is_none() => Some("missing_duration"),
                _ if row.pace_seconds_per_km().is_none() => Some("implausible_pace"),
                _ if included.len() >= baseline::MAX_SAMPLES => Some("beyond_max_samples"),
                _ => None,
            };
            match reason {
                Some(reason) => excluded.push(BaselineExclusion {
                    workout_id: row.workout_id.clone(),
                    reason: reason.into(),
                }),
                None => included.push(row),
            }
        }
        Ok((included, excluded))
    }

    /// 本地周报：最近 7 天对比此前 28 天的**个人**基线。
    ///
    /// 每条结论都带样本数、来源和置信度；不足就说不足。不和任何人群基准比较，
    /// 也不输出诊断、治疗或风险预测。
    pub fn weekly_report(&self, now: DateTime<Utc>) -> Result<WeeklyReport> {
        let today = now.date_naive();
        let recent_start = today - Duration::days(weekly::RECENT_DAYS - 1);
        let baseline_end = recent_start - Duration::days(1);
        let baseline_start = baseline_end - Duration::days(weekly::BASELINE_DAYS - 1);

        let mut facts = Vec::new();
        for (fact_id, metric, unit) in [
            ("weekly.resting_hr", "resting_hr", "bpm"),
            ("weekly.hrv", "hrv", "ms"),
            ("weekly.stress", "stress", "score"),
            ("weekly.sleep_duration", "sleep_duration", "min"),
            (
                "weekly.sleep_start_regularity",
                "sleep_start_regularity",
                "min",
            ),
            ("weekly.workout_count", "workout_count", "次"),
            ("weekly.training_load", "training_load", "load"),
        ] {
            facts.push(self.weekly_fact(
                fact_id,
                metric,
                unit,
                recent_start,
                today,
                baseline_start,
                baseline_end,
            )?);
        }

        Ok(WeeklyReport {
            generated_at: now.to_rfc3339(),
            recent_start: recent_start.to_string(),
            recent_end: today.to_string(),
            baseline_start: baseline_start.to_string(),
            baseline_end: baseline_end.to_string(),
            facts,
        })
    }

    #[allow(clippy::too_many_arguments)]
    fn weekly_fact(
        &self,
        fact_id: &str,
        metric: &str,
        unit: &str,
        recent_start: NaiveDate,
        recent_end: NaiveDate,
        baseline_start: NaiveDate,
        baseline_end: NaiveDate,
    ) -> Result<InsightFact> {
        let recent = self.weekly_samples(metric, recent_start, recent_end)?;
        let baseline = self.weekly_samples(metric, baseline_start, baseline_end)?;
        let window = BaselineWindow {
            kind: "previous_days".into(),
            days: weekly::BASELINE_DAYS,
            min_samples: weekly::MIN_BASELINE_DAYS,
            max_samples: weekly::BASELINE_DAYS,
            distance_tolerance_percent: None,
        };

        let value = mean(&recent.values);
        let source = recent
            .source
            .clone()
            .or_else(|| baseline.source.clone())
            .unwrap_or_else(|| "unknown".into());

        let enough_baseline = baseline.values.len() as i64 >= weekly::MIN_BASELINE_DAYS;
        let baseline_count = baseline.values.len() as i64;
        let (comparison, confidence, reason, reason_code) = match (value, mean(&baseline.values)) {
            (Some(current), Some(previous)) if enough_baseline && previous != 0.0 => {
                let delta = current - previous;
                (
                    Some(Comparison {
                        baseline_value: round1(previous),
                        delta: round1(delta),
                        delta_percent: round1(delta / previous.abs() * 100.0),
                        direction: direction_of(delta),
                    }),
                    Confidence::from_samples(baseline.values.len()),
                    None,
                    None,
                )
            }
            (Some(_), _) => (
                None,
                Confidence::Insufficient,
                Some(format!(
                    "此前 {} 天里只有 {} 天有这项数据，不足 {} 天，所以只报现状不做比较。",
                    weekly::BASELINE_DAYS,
                    baseline.values.len(),
                    weekly::MIN_BASELINE_DAYS
                )),
                Some("weekly_thin_baseline".to_string()),
            ),
            (None, _) => (
                None,
                Confidence::Insufficient,
                Some("最近 7 天本机没有这项数据。".into()),
                Some("weekly_no_recent_data".to_string()),
            ),
        };

        Ok(InsightFact {
            fact_id: fact_id.into(),
            metric: metric.into(),
            value: value.map(round1),
            unit: unit.into(),
            comparison,
            baseline_window: Some(window),
            evidence_count: recent.values.len() as i64,
            source,
            confidence,
            reason,
            reason_code,
            baseline_count,
            evidence_refs: recent.dates,
        })
    }

    fn weekly_samples(
        &self,
        metric: &str,
        start: NaiveDate,
        end: NaiveDate,
    ) -> Result<WeeklySamples> {
        let start_text = start.to_string();
        let end_text = end.to_string();
        match metric {
            "sleep_duration" => self.collect_samples(
                "SELECT substr(end_time, 1, 10), CAST(duration_minutes AS REAL), source_scope
                 FROM sleep_sessions
                 WHERE substr(end_time, 1, 10) BETWEEN ?1 AND ?2",
                &start_text,
                &end_text,
            ),
            // 入睡时间的规律性：每晚入睡的分钟数（自当地午夜起算）本身就是
            // 一个可比的日度值，两段窗口各自取标准差来对比。
            "sleep_start_regularity" => {
                let samples = self.collect_samples(
                    "SELECT substr(start_time, 1, 10),
                            CAST(substr(start_time, 12, 2) AS REAL) * 60
                              + CAST(substr(start_time, 15, 2) AS REAL),
                            source_scope
                     FROM sleep_sessions
                     WHERE substr(start_time, 1, 10) BETWEEN ?1 AND ?2",
                    &start_text,
                    &end_text,
                )?;
                // 跨午夜的入睡时间会在 0 和 1440 之间跳，直接算标准差会把
                // 「23:50 和 00:10」看成相差 23 小时。统一折算到以 18:00
                // 为原点的相对分钟数。
                let shifted: Vec<f64> = samples
                    .values
                    .iter()
                    .map(|minutes| {
                        let shifted = minutes - 18.0 * 60.0;
                        if shifted < -12.0 * 60.0 {
                            shifted + 24.0 * 60.0
                        } else {
                            shifted
                        }
                    })
                    .collect();
                let spread = stdev(&shifted);
                Ok(WeeklySamples {
                    values: spread.map(|value| vec![value]).unwrap_or_default(),
                    dates: samples.dates,
                    source: samples.source,
                })
            }
            "workout_count" => {
                let samples = self.collect_samples(
                    "SELECT substr(start_time, 1, 10), 1.0, source_scope
                     FROM workouts
                     WHERE substr(start_time, 1, 10) BETWEEN ?1 AND ?2",
                    &start_text,
                    &end_text,
                )?;
                // 「次数」是一个总量，不是每天的平均。用一个单元素样本表达
                // 总数，比返回一串 1.0 再去平均要诚实。
                let total = samples.values.len() as f64;
                Ok(WeeklySamples {
                    values: if total > 0.0 { vec![total] } else { Vec::new() },
                    dates: samples.dates,
                    source: samples.source,
                })
            }
            "training_load" => self.collect_samples(
                "SELECT date, value, source_scope FROM daily_metrics
                 WHERE metric = 'training_load' AND date BETWEEN ?1 AND ?2",
                &start_text,
                &end_text,
            ),
            other => {
                // 先看日度表，没有再回落到采样表。
                let daily = self.collect_samples(
                    &format!(
                        "SELECT date, value, source_scope FROM daily_metrics
                         WHERE metric = '{other}' AND date BETWEEN ?1 AND ?2"
                    ),
                    &start_text,
                    &end_text,
                )?;
                if !daily.values.is_empty() {
                    return Ok(daily);
                }
                self.collect_samples(
                    &format!(
                        "SELECT substr(timestamp, 1, 10), value, source_scope FROM metric_samples
                         WHERE metric = '{other}' AND substr(timestamp, 1, 10) BETWEEN ?1 AND ?2"
                    ),
                    &start_text,
                    &end_text,
                )
            }
        }
    }

    fn collect_samples(&self, sql: &str, start: &str, end: &str) -> Result<WeeklySamples> {
        let mut stmt = self.conn.prepare(sql)?;
        let rows = stmt.query_map(rusqlite::params![start, end], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, f64>(1)?,
                row.get::<_, String>(2)?,
            ))
        })?;
        let mut values = Vec::new();
        let mut dates = Vec::new();
        let mut scopes = std::collections::BTreeSet::new();
        for row in rows {
            let (date, value, scope) = row?;
            if !value.is_finite() {
                continue;
            }
            values.push(value);
            dates.push(date);
            scopes.insert(scope);
        }
        dates.sort();
        dates.dedup();
        Ok(WeeklySamples {
            values,
            dates,
            // 一个窗口里混了多种来源时不挑一个当代表，如实说 mixed。
            source: match scopes.len() {
                0 => None,
                1 => scopes.into_iter().next(),
                _ => Some("mixed".into()),
            },
        })
    }
}

struct WeeklySamples {
    values: Vec<f64>,
    dates: Vec<String>,
    source: Option<String>,
}

fn map_run_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Result<RunRow>> {
    let start: String = row.get(1)?;
    let end: String = row.get(2)?;
    Ok((|| {
        Ok(RunRow {
            workout_id: row.get(0)?,
            start_time: parse_time(&start)?,
            end_time: parse_time(&end)?,
            distance_meters: row.get(3)?,
            avg_hr: row.get(4)?,
            training_load: row.get(5)?,
            source_scope: row.get(6)?,
        })
    })())
}

fn parse_time(value: &str) -> Result<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(value)
        .map(|time| time.with_timezone(&Utc))
        .map_err(|error| {
            crate::models::ZeppBridgeError::ParseError(format!("运动时间无效: {error}"))
        })
}

#[allow(clippy::too_many_arguments)]
fn run_fact<F>(
    fact_id: &str,
    metric: &str,
    unit: &str,
    value: Option<f64>,
    baseline: &[RunRow],
    extract: F,
    window: &BaselineWindow,
    source: &str,
) -> InsightFact
where
    F: Fn(&RunRow) -> Option<f64>,
{
    // 基线只统计这项指标确实有值的那几次。一次没记录心率的跑步不该把
    // 心率基线拉低，也不该被当成 0。
    let mut values = Vec::new();
    let mut refs = Vec::new();
    for row in baseline {
        if let Some(sample) = extract(row) {
            values.push(sample);
            refs.push(row.workout_id.clone());
        }
    }

    let enough = values.len() >= baseline::MIN_SAMPLES;
    let (comparison, reason, reason_code) = match (value, mean(&values)) {
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
        (Some(_), _) => (
            None,
            Some(format!(
                "距离相近（±{:.0}%）且有这项数据的历史跑步只有 {} 次，不足 {} 次，所以只报本次数值，不做比较。",
                baseline::DISTANCE_TOLERANCE * 100.0,
                values.len(),
                baseline::MIN_SAMPLES
            )),
            Some("workout_thin_baseline".to_string()),
        ),
        (None, _) => (
            None,
            Some("这次运动没有这项数据。".into()),
            Some("workout_no_value".to_string()),
        ),
    };

    InsightFact {
        fact_id: fact_id.into(),
        metric: metric.into(),
        value: value.map(round1),
        unit: unit.into(),
        comparison,
        baseline_window: Some(window.clone()),
        evidence_count: values.len() as i64,
        source: source.to_string(),
        confidence: if value.is_none() {
            Confidence::Insufficient
        } else {
            Confidence::from_samples(values.len())
        },
        reason,
        reason_code,
        baseline_count: values.len() as i64,
        evidence_refs: refs,
    }
}

fn mean(values: &[f64]) -> Option<f64> {
    if values.is_empty() {
        return None;
    }
    Some(values.iter().sum::<f64>() / values.len() as f64)
}

fn stdev(values: &[f64]) -> Option<f64> {
    if values.len() < 2 {
        return None;
    }
    let average = mean(values)?;
    let variance = values
        .iter()
        .map(|value| (value - average).powi(2))
        .sum::<f64>()
        / values.len() as f64;
    Some(variance.sqrt())
}

fn round1(value: f64) -> f64 {
    (value * 10.0).round() / 10.0
}

fn direction_of(delta: f64) -> String {
    if delta.abs() < f64::EPSILON {
        "same".into()
    } else if delta > 0.0 {
        "higher".into()
    } else {
        "lower".into()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{SleepSession, SourceScope, Workout};
    use chrono::{Datelike, TimeZone};

    fn base() -> DateTime<Utc> {
        Utc.with_ymd_and_hms(2026, 8, 20, 7, 0, 0).unwrap()
    }

    fn db() -> Database {
        Database::in_memory().unwrap()
    }

    /// 一次跑步。`minutes` 是时长，`distance` 是米。
    fn run(
        id: &str,
        days_ago: i64,
        distance: Option<f64>,
        minutes: i64,
        avg_hr: Option<i32>,
    ) -> Workout {
        let start = base() - Duration::days(days_ago);
        Workout {
            workout_id: id.into(),
            workout_type: "run".into(),
            normalized_type: "run".into(),
            type_source: "numeric_mapped".into(),
            user_override: None,
            effective_type: "run".into(),
            custom_label: None,
            start_time: start,
            end_time: start + Duration::minutes(minutes),
            distance_meters: distance,
            calories: None,
            avg_hr,
            max_hr: None,
            training_load: Some(50.0),
            vo2max: None,
            source_scope: SourceScope::Device,
            device_id: Some("device-a".into()),
            synced_at: None,
            gps_available: false,
            sample_count: 0,
            zepp_source: None,
            zepp_type: Some(1),
        }
    }

    fn fact<'a>(insight: &'a WorkoutInsight, id: &str) -> &'a InsightFact {
        insight
            .facts
            .iter()
            .find(|fact| fact.fact_id == id)
            .unwrap_or_else(|| panic!("缺少事实 {id}"))
    }

    fn weekly_fact<'a>(report: &'a WeeklyReport, id: &str) -> &'a InsightFact {
        report
            .facts
            .iter()
            .find(|fact| fact.fact_id == id)
            .unwrap_or_else(|| panic!("缺少事实 {id}"))
    }

    #[test]
    fn only_verified_running_gets_an_insight_and_the_rest_says_so_plainly() {
        let db = db();
        let mut strength = run("strength-1", 1, Some(0.0), 40, Some(120));
        strength.workout_type = "strength".into();
        strength.normalized_type = "strength".into();
        strength.effective_type = "strength".into();
        strength.zepp_type = Some(52);
        db.insert_workout(&strength).unwrap();

        let insight = db.workout_insight("strength-1").unwrap();
        assert!(!insight.supported);
        assert!(insight.facts.is_empty(), "不支持时不许硬凑事实出来");
        let reason = insight.unsupported_reason.unwrap();
        assert!(reason.contains("跑步"));
    }

    #[test]
    fn a_run_without_enough_comparable_history_reports_the_value_but_no_percentage() {
        let db = db();
        db.insert_workout(&run("target", 0, Some(5000.0), 30, Some(150)))
            .unwrap();
        // 只有两次可比历史，低于 MIN_SAMPLES。
        db.insert_workout(&run("prev-1", 7, Some(5100.0), 31, Some(152)))
            .unwrap();
        db.insert_workout(&run("prev-2", 14, Some(4900.0), 32, Some(151)))
            .unwrap();

        let insight = db.workout_insight("target").unwrap();
        assert!(insight.supported);
        let pace = fact(&insight, "run.pace");
        assert!(pace.value.is_some(), "本次数值仍然要给");
        assert!(pace.comparison.is_none(), "样本不足不许硬算百分比");
        assert_eq!(pace.confidence, Confidence::Insufficient);
        let reason = pace.reason.clone().unwrap();
        assert!(reason.contains("不足"), "{reason}");
        assert_eq!(pace.evidence_count, 2);
    }

    #[test]
    fn the_baseline_only_uses_runs_of_a_similar_distance_and_says_what_it_dropped() {
        let db = db();
        db.insert_workout(&run("target", 0, Some(5000.0), 30, Some(150)))
            .unwrap();
        for (index, distance) in [5100.0, 4900.0, 5000.0].into_iter().enumerate() {
            db.insert_workout(&run(
                &format!("near-{index}"),
                (index as i64 + 1) * 3,
                Some(distance),
                31,
                Some(150),
            ))
            .unwrap();
        }
        // 距离差太远：10 公里不该拿来和 5 公里比。
        db.insert_workout(&run("far", 20, Some(10000.0), 62, Some(150)))
            .unwrap();
        // 窗口之外。
        db.insert_workout(&run(
            "old",
            baseline::WINDOW_DAYS + 5,
            Some(5000.0),
            30,
            Some(150),
        ))
        .unwrap();

        let insight = db.workout_insight("target").unwrap();
        let included: Vec<&str> = insight
            .baseline_included
            .iter()
            .map(|entry| entry.workout_id.as_str())
            .collect();
        assert_eq!(included.len(), 3, "{included:?}");
        assert!(!included.contains(&"far"));
        assert!(!included.contains(&"old"), "窗口之外的记录不该进基线");

        let dropped: Vec<(&str, &str)> = insight
            .baseline_excluded
            .iter()
            .map(|entry| (entry.workout_id.as_str(), entry.reason.as_str()))
            .collect();
        assert!(
            dropped.contains(&("far", "distance_out_of_tolerance")),
            "{dropped:?}"
        );

        let pace = fact(&insight, "run.pace");
        let comparison = pace.comparison.clone().expect("三次可比记录应当足够");
        assert_eq!(pace.evidence_count, 3);
        // 本次 30 分钟跑 5 公里 = 360 s/km；基线三次都是 31 分钟。
        assert!(comparison.delta < 0.0, "这次更快，delta 应当为负");
        assert_eq!(comparison.direction, "lower");
        assert_eq!(pace.evidence_refs.len(), 3);
    }

    #[test]
    fn a_run_with_an_impossible_pace_never_pollutes_the_baseline() {
        let db = db();
        db.insert_workout(&run("target", 0, Some(5000.0), 30, Some(150)))
            .unwrap();
        for index in 0..3 {
            db.insert_workout(&run(
                &format!("ok-{index}"),
                index + 1,
                Some(5000.0),
                30,
                Some(150),
            ))
            .unwrap();
        }
        // 5 公里 1 分钟：数据本身坏了，不是一次很快的跑步。
        db.insert_workout(&run("broken", 5, Some(5000.0), 1, Some(150)))
            .unwrap();

        let insight = db.workout_insight("target").unwrap();
        assert!(insight
            .baseline_included
            .iter()
            .all(|entry| entry.workout_id != "broken"));
        assert!(insight
            .baseline_excluded
            .iter()
            .any(|entry| entry.workout_id == "broken" && entry.reason == "implausible_pace"));
    }

    #[test]
    fn a_missing_metric_is_missing_not_zero() {
        let db = db();
        db.insert_workout(&run("target", 0, Some(5000.0), 30, None))
            .unwrap();
        for index in 0..3 {
            db.insert_workout(&run(
                &format!("ok-{index}"),
                index + 1,
                Some(5000.0),
                30,
                None,
            ))
            .unwrap();
        }
        let insight = db.workout_insight("target").unwrap();
        let hr = fact(&insight, "run.avg_hr");
        assert_eq!(hr.value, None, "没有心率就是没有，不能填 0");
        assert!(hr.comparison.is_none());
        assert_eq!(hr.evidence_count, 0, "基线也不该把缺失当成 0 算进去");
        assert_eq!(hr.confidence, Confidence::Insufficient);
    }

    #[test]
    fn the_baseline_never_grows_past_the_max_sample_count() {
        let db = db();
        db.insert_workout(&run("target", 0, Some(5000.0), 30, Some(150)))
            .unwrap();
        for index in 0..(baseline::MAX_SAMPLES + 4) {
            db.insert_workout(&run(
                &format!("prev-{index}"),
                index as i64 + 1,
                Some(5000.0),
                31,
                Some(150),
            ))
            .unwrap();
        }
        let insight = db.workout_insight("target").unwrap();
        assert_eq!(insight.baseline_included.len(), baseline::MAX_SAMPLES);
        assert!(insight
            .baseline_excluded
            .iter()
            .any(|entry| entry.reason == "beyond_max_samples"));
    }

    fn sleep(id: &str, days_ago: i64, start_hour: u32, minutes: i64) -> SleepSession {
        let day = (base() - Duration::days(days_ago)).date_naive();
        let start = Utc
            .with_ymd_and_hms(day.year(), day.month(), day.day(), start_hour, 0, 0)
            .unwrap();
        SleepSession {
            sleep_id: id.into(),
            start_time: start,
            end_time: start + Duration::minutes(minutes),
            score: None,
            duration_minutes: minutes as i32,
            deep_minutes: 0,
            light_minutes: minutes as i32,
            rem_minutes: None,
            awake_minutes: 0,
            synced_at: None,
            time_in_bed_minutes: None,
            wake_count: None,
            stages: Vec::new(),
            source_scope: SourceScope::Device,
            device_id: Some("device-a".into()),
        }
    }

    #[test]
    fn the_weekly_report_compares_you_with_your_own_previous_four_weeks() {
        let db = db();
        // 最近 7 天：每晚 7 小时。此前 28 天：每晚 6 小时。
        for day in 0..7 {
            db.insert_sleep_session(&sleep(&format!("recent-{day}"), day, 23, 420))
                .unwrap();
        }
        // 一夜按「醒来那天」归属，所以 23:00 入睡的那晚算在第二天。
        // 基线从第 8 天起，正好落在此前 28 天窗口里，不会渗进最近 7 天。
        for day in 8..36 {
            db.insert_sleep_session(&sleep(&format!("base-{day}"), day, 23, 360))
                .unwrap();
        }

        let report = db.weekly_report(base()).unwrap();
        let duration = weekly_fact(&report, "weekly.sleep_duration");
        assert_eq!(duration.value, Some(420.0));
        let comparison = duration.comparison.clone().expect("基线够 28 天");
        assert_eq!(comparison.baseline_value, 360.0);
        assert_eq!(comparison.direction, "higher");
        assert!(
            (comparison.delta_percent - 16.7).abs() < 0.2,
            "{comparison:?}"
        );
        assert_eq!(duration.confidence, Confidence::High);
    }

    #[test]
    fn a_thin_baseline_reports_the_current_value_without_a_comparison() {
        let db = db();
        for day in 0..7 {
            db.insert_sleep_session(&sleep(&format!("recent-{day}"), day, 23, 420))
                .unwrap();
        }
        // 此前只有两晚有记录，不足 MIN_BASELINE_DAYS。
        for day in 10..12 {
            db.insert_sleep_session(&sleep(&format!("base-{day}"), day, 23, 360))
                .unwrap();
        }
        let report = db.weekly_report(base()).unwrap();
        let duration = weekly_fact(&report, "weekly.sleep_duration");
        assert_eq!(duration.value, Some(420.0));
        assert!(duration.comparison.is_none());
        assert_eq!(duration.confidence, Confidence::Insufficient);
        assert!(duration.reason.clone().unwrap().contains("不足"));
    }

    #[test]
    fn no_data_at_all_says_no_data_instead_of_zero() {
        let db = db();
        let report = db.weekly_report(base()).unwrap();
        for fact in &report.facts {
            assert_eq!(
                fact.value, None,
                "{} 不该在没有数据时给出数值",
                fact.fact_id
            );
            assert!(fact.comparison.is_none());
            assert_eq!(fact.confidence, Confidence::Insufficient);
        }
    }

    #[test]
    fn the_report_never_mentions_a_population_baseline() {
        let db = db();
        for day in 0..7 {
            db.insert_sleep_session(&sleep(&format!("recent-{day}"), day, 23, 420))
                .unwrap();
        }
        let report = db.weekly_report(base()).unwrap();
        let encoded = serde_json::to_string(&report).unwrap();
        for forbidden in [
            "人群",
            "正常人",
            "平均水平",
            "健康人",
            "诊断",
            "疾病",
            "风险",
        ] {
            assert!(
                !encoded.contains(forbidden),
                "周报出现了没有本地依据的措辞：{forbidden}"
            );
        }
        // 基线窗口必须自报是「你自己的前 28 天」。
        let duration = weekly_fact(&report, "weekly.sleep_duration");
        assert_eq!(
            duration.baseline_window.clone().unwrap().kind,
            "previous_days"
        );
    }

    #[test]
    fn sleep_regularity_does_not_read_midnight_as_a_twenty_three_hour_swing() {
        let db = db();
        // 23:50 和 00:10 相差 20 分钟，不是 23 小时 40 分钟。
        db.insert_sleep_session(&sleep("a", 1, 23, 400)).unwrap();
        db.insert_sleep_session(&sleep("b", 2, 0, 400)).unwrap();
        db.insert_sleep_session(&sleep("c", 3, 23, 400)).unwrap();
        let report = db.weekly_report(base()).unwrap();
        let regularity = weekly_fact(&report, "weekly.sleep_start_regularity");
        let spread = regularity.value.expect("三晚足够算出离散度");
        assert!(
            spread < 120.0,
            "跨午夜被当成了 23 小时的波动：{spread} 分钟"
        );
    }
}
