//! 外部只读访问的授权判定（MCP `--scope` 的实现核心）。
//!
//! 这一层只做两件事：
//!
//! * **判定**：`authorize()` 是纯函数——给一个范围、一组已开放任务的授权、
//!   一次工具请求，回 `Permit`（放行并附裁剪后的边界）或 `Denied`
//!   （拒绝并附稳定码）。它不碰数据库，全部行为由单测钉住。
//! * **装载**：`shared_task_grants()` 从本机库读出「开放给 MCP」的任务，
//!   展开成 `TaskGrant`。`ai_tasks` 是后续迁移才进来的表，库还没有它时
//!   返回空授权——任务范围因此是天然的 fail-closed：没有授权就是全部拒绝，
//!   不存在「表不在所以放行」的路径。
//!
//! 三个不变式：
//!
//! 1. **授权只来自库，不来自请求。** 请求参数、`taskId`、`_meta` 都不参与
//!    判定；谁能看什么是用户在任务页写的，不是调用方说了算。
//! 2. **拒绝要说清边界。** `Denied` 只给稳定码和一句中文；允许范围由调用方
//!    用 `granted_windows()` 另行拼装成结构化数据（`permittedRanges`），
//!    模型可以照着重试。
//! 3. **FullReadOnly 是旧行为。** 一个 `if` 分支都不多走，输出形状与今天
//!    逐字节一致——旧配置不带 `--scope`，必须零变化。

use std::collections::{BTreeMap, BTreeSet};

use chrono::{DateTime, Duration, NaiveDate, Utc};
use rusqlite::OptionalExtension;
use serde::{Deserialize, Serialize};

use crate::insight::{
    self, BaselineEntry, BaselineExclusion, Comparison, Confidence, InsightFact, WorkoutInsight,
};
use crate::models::error::{Result, ZeppBridgeError};
use crate::models::{MetricSeries, Workout};
use crate::storage::Database;

/* ------------------------------ 范围与类别 ------------------------------ */

/// MCP 启动时选定的只读范围。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AccessScope {
    /// 旧行为：整库只读。不带 `--scope` 启动就是它，也是唯一兼容旧配置的形态。
    FullReadOnly,
    /// 只读「开放给 MCP」的任务所圈定的数据，每次请求实时重读授权。
    TaskScoped,
}

impl AccessScope {
    /// `full-readonly` / `task`，其余一律 `None`——调用方据此 fail-closed。
    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "full-readonly" => Some(Self::FullReadOnly),
            "task" => Some(Self::TaskScoped),
            _ => None,
        }
    }

    /// 响应里 `scope.mode` 用的字符串，和 argv 取值一致。
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::FullReadOnly => "full-readonly",
            Self::TaskScoped => "task",
        }
    }

    pub fn is_task_scoped(&self) -> bool {
        matches!(self, Self::TaskScoped)
    }
}

/// 任务类别的访问侧镜像。
///
/// 与 `AiTaskCategory`（S1 的任务模型）同名字段一一对应；这里单独定义是因为
/// 授权判定不该依赖任务存储的内部结构——任务模型怎么变，这里只看这八个值。
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum AccessCategory {
    /// 运动记录实体本身，按 workout_id 授权，不走日期窗。
    Workout,
    Sleep,
    Recovery,
    HeartRate,
    Training,
    Body,
    /// 用户自写的说明文字。目前没有工具兑现它，判定上视同不可满足。
    PersonalNote,
    /// 附件元信息。同上，首批只进枚举不进授权窗。
    Attachment,
}

impl AccessCategory {
    pub fn parse(value: &str) -> Option<Self> {
        Some(match value {
            "workout" => Self::Workout,
            "sleep" => Self::Sleep,
            "recovery" => Self::Recovery,
            "heart_rate" => Self::HeartRate,
            "training" => Self::Training,
            "body" => Self::Body,
            "personal_note" => Self::PersonalNote,
            "attachment" => Self::Attachment,
            _ => return None,
        })
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Workout => "workout",
            Self::Sleep => "sleep",
            Self::Recovery => "recovery",
            Self::HeartRate => "heart_rate",
            Self::Training => "training",
            Self::Body => "body",
            Self::PersonalNote => "personal_note",
            Self::Attachment => "attachment",
        }
    }

    /// 按本地日开窗的健康数据类别。`Workout` 按 id 授权、`PersonalNote` /
    /// `Attachment` 是任务内容而不是时间序列，都不产生 `GrantWindow`。
    pub fn is_windowed(&self) -> bool {
        matches!(
            self,
            Self::Sleep | Self::Recovery | Self::HeartRate | Self::Training | Self::Body
        )
    }
}

/* ------------------------------ 授权与窗口 ------------------------------ */

/// 一个类别的一段已授权本地日窗口（含两端）。
///
/// serde 形状 `{category, start, end}` 是给 `permittedRanges` 用的对外契约；
/// `NaiveDate` 序列化为 `YYYY-MM-DD`。
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct GrantWindow {
    pub category: AccessCategory,
    #[serde(rename = "start")]
    pub start_date: NaiveDate,
    #[serde(rename = "end")]
    pub end_date: NaiveDate,
}

impl GrantWindow {
    /// 空窗口（`include_workout_day=false` 且 `days_before=0` 之类）直接丢弃，
    /// 不让一个什么也盖不住的窗口留在授权里。
    pub fn new(
        category: AccessCategory,
        start_date: NaiveDate,
        end_date: NaiveDate,
    ) -> Option<Self> {
        (start_date <= end_date).then_some(Self {
            category,
            start_date,
            end_date,
        })
    }

    pub fn contains(&self, day: NaiveDate) -> bool {
        self.start_date <= day && day <= self.end_date
    }

    /// 与 `[start, end]` 求交，无交为空。
    fn intersect(&self, start: NaiveDate, end: NaiveDate) -> Option<Self> {
        Self::new(
            self.category,
            self.start_date.max(start),
            self.end_date.min(end),
        )
    }
}

/// 一个开放任务展开成的授权：运动按 id，健康数据按类别窗口。
///
/// `windows` 在装载时就已经是绝对日期——`days_before` / `include_workout_day`
/// 这类规则在 `shared_task_grants()` 里展开完，判定侧不再见到它们。
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct TaskGrant {
    pub task_id: String,
    pub workout_ids: Vec<String>,
    pub windows: Vec<GrantWindow>,
}

/// 一次工具调用想要的东西。由 MCP 适配层从工具名 + 参数构造。
#[derive(Debug, Clone, Default)]
pub struct DataRequest {
    /// 工具名，只用于拒绝原因里指明是哪个调用。
    pub tool: &'static str,
    /// 这次请求会碰到的类别。指标按 `metric_category()` 映射进来。
    pub categories: Vec<AccessCategory>,
    /// 请求覆盖的本地日范围（`get_metric_series` 的 days 换算结果）。
    pub date_range: Option<(NaiveDate, NaiveDate)>,
    /// 请求指定的运动 id。空 = 列举型请求（`list_workouts`）。
    pub workout_ids: Vec<String>,
    /// `get_sleep_detail` 未带 id：要的是「授权窗内最近一晚」而不是全库最新。
    pub latest_sleep: bool,
    /// 答案是整库聚合、无法干净裁剪到任务范围的请求（`get_data_health`）。
    /// 任务范围对它的处理是整体拒绝，见 R5。
    pub whole_library: bool,
}

/// 判定结果·放行。
///
/// 里面的集合就是执行侧允许看到的天花板：`workout_ids` 之外的运动不存在，
/// `windows` 之外的日期不存在。
#[derive(Debug, Clone, Default)]
pub struct Permit {
    /// 全部开放任务的 workout_ids 并集。
    pub workout_ids: BTreeSet<String>,
    /// 已按请求类别与日期范围裁剪过的授权窗口。
    pub windows: Vec<GrantWindow>,
    /// 这次判定实际看到的开放任务数（`scope.grants` 的来源）。
    pub grants: usize,
}

impl Permit {
    /// FullReadOnly 的占位。执行侧按 `scope` 分支，不读这里的空集合。
    pub fn unrestricted() -> Self {
        Self::default()
    }

    /// 某个类别的某个本地日是否被授权。
    pub fn day_permitted(&self, category: AccessCategory, day: NaiveDate) -> bool {
        self.windows
            .iter()
            .any(|window| window.category == category && window.contains(day))
    }

    /// 该类别授权窗的并集一共有多少天（重叠合并后计数，不重复算）。
    pub fn permitted_day_count(&self, category: AccessCategory) -> i64 {
        let mut days = 0i64;
        for window in merge_windows(
            self.windows
                .iter()
                .filter(|window| window.category == category)
                .cloned()
                .collect(),
        ) {
            days += (window.end_date - window.start_date).num_days() + 1;
        }
        days
    }

    /// 该类别是否至少有一个授权窗（不管请求范围有没有交上）。
    fn has_window(&self, category: AccessCategory) -> bool {
        self.windows
            .iter()
            .any(|window| window.category == category)
    }
}

/// 判定结果·拒绝。`code` 是稳定的两段式错误码，进结构化错误数据。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Denied {
    pub code: &'static str,
    pub reason: String,
}

pub const SCOPE_DENIED: &str = "err.mcp.scope_denied";
pub const SCOPE_NO_GRANTS: &str = "err.mcp.scope_no_grants";

fn denied(reason: impl Into<String>) -> Denied {
    Denied {
        code: SCOPE_DENIED,
        reason: reason.into(),
    }
}

/* ------------------------------ 判定 ------------------------------ */

/// 统一授权入口。FullReadOnly 直接放行；TaskScoped 按授权逐项裁。
pub fn authorize(
    scope: &AccessScope,
    grants: &[TaskGrant],
    request: &DataRequest,
) -> std::result::Result<Permit, Denied> {
    match scope {
        AccessScope::FullReadOnly => Ok(Permit::unrestricted()),
        AccessScope::TaskScoped => authorize_task(grants, request),
    }
}

fn authorize_task(
    grants: &[TaskGrant],
    request: &DataRequest,
) -> std::result::Result<Permit, Denied> {
    if grants.is_empty() {
        return Err(Denied {
            code: SCOPE_NO_GRANTS,
            reason:
                "还没有任何任务开放给 MCP。在桌面应用的任务页把任务标为「开放给 MCP」之后再试。"
                    .into(),
        });
    }
    // 整库聚合（数据健康）无法干净裁剪到任务窗口：覆盖缺口、最近同步时刻、
    // newest_sample_at 都是全库口径，拼不出一个诚实的子集——整体拒绝，
    // 让调用方知道「这个工具在任务范围里没有意义」，而不是给一份看起来像
    // 全局、实则被裁过的报表。
    if request.whole_library {
        return Err(denied(
            "数据健康是整库视角的报表，没法诚实地裁剪到任务授权范围；任务范围内不提供它。",
        ));
    }

    let workout_ids: BTreeSet<String> = grants
        .iter()
        .flat_map(|grant| grant.workout_ids.iter().cloned())
        .collect();

    // 指名要的运动必须全部在授权并集里——有一个不在就整体拒绝，而不是
    // 悄悄跳过它（悄悄跳过会让人以为那条记录不存在）。
    if let Some(foreign) = request
        .workout_ids
        .iter()
        .find(|id| !workout_ids.contains(*id))
    {
        return Err(denied(format!(
            "运动 {foreign} 不在任何已开放任务的授权列表里。先用 list_workouts 看已开放的记录。"
        )));
    }

    let windows = granted_windows(grants, &request.categories, request.date_range);
    let permit = Permit {
        workout_ids,
        windows,
        grants: grants.len(),
    };

    // 请求的每一个类别都得能兑现，缺一个就整体拒绝（R3）：
    // - Workout：按 id 授权。列举型（不带 id）恒可满足——授权集为空时
    //   如实回空列表；指名型已在上面校验过 ∈ 并集。
    // - 窗口类别：请求范围必须与该类授权窗有交集。悄悄丢掉没授权的指标，
    //   模型会把它当成「没有数据」而不是「没有授权」——这是两种不同的真话。
    // - PersonalNote / Attachment：首批没有工具能兑现，视同不可满足。
    for category in &request.categories {
        let covered = match category {
            AccessCategory::Workout => true,
            AccessCategory::PersonalNote | AccessCategory::Attachment => false,
            windowed => permit.has_window(*windowed),
        };
        if !covered {
            return Err(denied(format!(
                "请求的 {} 类数据不在任何已开放任务的授权范围内，或与授权窗口没有日期交集。错误数据的 permittedRanges 里是实际授权的窗口。",
                category.as_str()
            )));
        }
    }
    Ok(permit)
}

/// 授权窗口查询：某批任务在某批类别、某个日期范围内的有效窗口并集。
///
/// `authorize` 用它做判定，拒绝响应也用它把「实际允许什么」回给调用方。
/// 同类窗口做重叠/相邻合并，免得同一任务 N 次运动造出 N 段几乎一样的窗。
pub fn granted_windows(
    grants: &[TaskGrant],
    categories: &[AccessCategory],
    date_range: Option<(NaiveDate, NaiveDate)>,
) -> Vec<GrantWindow> {
    let windows = grants
        .iter()
        .flat_map(|grant| grant.windows.iter())
        .filter(|window| categories.contains(&window.category))
        .filter_map(|window| match date_range {
            Some((start, end)) => window.intersect(start, end),
            None => Some(window.clone()),
        })
        .collect();
    merge_windows(windows)
}

/// 同类别窗口按起点排序后合并重叠与相邻（首尾相接也并成一段）。
fn merge_windows(mut windows: Vec<GrantWindow>) -> Vec<GrantWindow> {
    windows.sort_by(|a, b| {
        (a.category, a.start_date, a.end_date).cmp(&(b.category, b.start_date, b.end_date))
    });
    let mut merged: Vec<GrantWindow> = Vec::with_capacity(windows.len());
    for window in windows {
        if let Some(last) = merged.last_mut() {
            let adjacent = Duration::try_days(1)
                .and_then(|one| last.end_date.checked_add_signed(one))
                .is_some_and(|next| window.start_date <= next);
            if last.category == window.category && adjacent {
                last.end_date = last.end_date.max(window.end_date);
                continue;
            }
        }
        merged.push(window);
    }
    merged
}

/* ------------------------------ 类别 → 指标映射 ------------------------------

* 契约里能按天取序列的全部指标各自归属哪个任务类别。这张表是访问侧的判定
* 依据：类别决定窗口，窗口决定哪些天能出去。
*
* 落点与 contract.rs 的指标契约分开，是有意的：contract.rs 是版本化对外
* 契约（S1），类别归属是授权策略（本文件）。`AiTaskCategory` 没有「饮食」
* 一类，摄入指标暂归入 body——它们是写进身体账本的输入项；若任务模型后来
* 单列营养类，改这张表就行。*/

/// 指标名 → 任务类别。查不到返回 `None`，任务范围对未登记指标 fail-closed。
pub fn metric_category(metric: &str) -> Option<AccessCategory> {
    Some(match metric {
        // 夜间指标按睡眠归属日：血氧系列在 Zepp 侧就是睡眠期测量。
        "sleep_score" | "spo2" | "spo2_odi" | "spo2_night_score" | "spo2_measured_minutes" => {
            AccessCategory::Sleep
        }
        "readiness" | "physical_readiness" | "mental_readiness" | "hybrid_charge"
        | "physical_charge" | "mental_charge" | "stress" | "respiratory_rate" | "sleep_hrv"
        | "sleep_rhr" | "hrv" | "hrv_rmssd" | "hrv_baseline" | "rhr_baseline" | "ahi_baseline" => {
            AccessCategory::Recovery
        }
        "resting_hr" => AccessCategory::HeartRate,
        // 训练负荷与按日活动量同归一类：它们是「练了多少」的同一份账。
        "training_load"
        | "vo2max"
        | "lactate_threshold_hr"
        | "lactate_threshold_pace"
        | "pai_daily"
        | "pai_low_zone"
        | "pai_medium_zone"
        | "pai_high_zone"
        | "pai_total"
        | "pai_low_zone_minutes"
        | "pai_medium_zone_minutes"
        | "pai_high_zone_minutes"
        | "pai_low_zone_lower_hr"
        | "pai_medium_zone_lower_hr"
        | "pai_high_zone_lower_hr"
        | "steps"
        | "distance"
        | "active_calories"
        | "active_minutes"
        | "step_goal"
        | "calorie_goal"
        | "active_minutes_goal" => AccessCategory::Training,
        "weight" | "bmi" | "height" | "body_fat_rate" | "body_water_rate" | "muscle_mass"
        | "bone_mass" | "protein_rate" | "visceral_fat" | "bmr" | "body_balance_score"
        | "intake_calories" | "intake_protein_g" | "intake_fat_g" | "intake_carbs_g" => {
            AccessCategory::Body
        }
        _ => return None,
    })
}

/* ------------------------------ 序列与结构裁剪 ------------------------------

* 授权之后的二次过滤都在内存里做：SQL 已经把请求范围内的行取了出来，这里
* 只删不加——裁掉的部分不会以任何形式出现在响应里。*/

/// 把 `get_metric_series` 的每条序列裁到它所属类别的授权窗口。
///
/// 裁剪后点数归零的序列整体丢弃（等价于「该类没有授权」），留下来的序列
/// 内部也只有授权日有点；`latest`/`average`/`days_with_data`/`window_days`
/// 按裁后结果重算，让序列自述的就是它实际覆盖的范围。
pub fn clip_metric_series(series: Vec<MetricSeries>, permit: &Permit) -> Vec<MetricSeries> {
    series
        .into_iter()
        .filter_map(|mut series| {
            let category = metric_category(&series.metric)?;
            if !permit.has_window(category) {
                return None;
            }
            series.points.retain(|point| {
                NaiveDate::parse_from_str(&point.date, "%Y-%m-%d")
                    .map(|day| permit.day_permitted(category, day))
                    .unwrap_or(false)
            });
            let values: Vec<f64> = series.points.iter().map(|point| point.value).collect();
            series.latest = series.points.last().cloned();
            series.average = mean(&values).map(round1);
            series.minimum = values.iter().copied().reduce(f64::min);
            series.maximum = values.iter().copied().reduce(f64::max);
            series.days_with_data = series.points.len() as i64;
            series.window_days = permit.permitted_day_count(category);
            Some(series)
        })
        .collect()
}

/// 递归剥掉身份字段。
///
/// 任务范围不对外暴露 `device_id`：它是设备序列号形的标识，对健康问题没有
/// 用，给出去却是实打实的指纹。在白名单挑字段的出口（list_workouts）这层
/// 是冗余保险，在整结构 serde 的出口（sleep detail）这层是实际生效的脱敏。
pub fn strip_identity_fields(value: &mut serde_json::Value) {
    match value {
        serde_json::Value::Object(map) => {
            map.remove("device_id");
            for child in map.values_mut() {
                strip_identity_fields(child);
            }
        }
        serde_json::Value::Array(items) => {
            for item in items {
                strip_identity_fields(item);
            }
        }
        _ => {}
    }
}

/* ------------------------------ 洞察基线重算 ------------------------------

* `workout_insight` 的基线是在全库上算的：baseline_included/excluded 会带出
* 未授权运动的 id、日期、距离，facts 里的 baseline_value/置信度是未授权样本
* 的聚合（R1）。post-filter 只删数组还不行——均值本身也是泄漏。
*
* 所以这里按授权集**重算**基线：候选集仍是 `workout_insight` 自己给出的
* included ∪ excluded（它们已经过了可比性筛选），先裁到授权 id，再把
* `beyond_max_samples` 的授权行按原顺序补进空出的名额，最后每条 fact 按
* 授权后的基线重算比较值、样本数、证据引用与置信度。
*
* 这里的判定表与 `insight::run_fact` 是同一份规则的镜像：样本门槛来自
* `insight::baseline` 的公有常量，原因码沿用原值；若那边调整判定表，
* 这里必须跟着改（已向 S1 提变更请求：由 core 提供带 allowlist 的
* `workout_insight` 变体，届时本函数退役）。*/

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
    fn duration_seconds(&self) -> Option<f64> {
        let seconds = (self.end_time - self.start_time).num_seconds();
        (seconds > 0).then_some(seconds as f64)
    }

    /// 候选都来自 `workout_insight` 已筛过的行，配速在入库时已验过
    /// 合理性区间，这里只需原始换算。
    fn pace_seconds_per_km(&self) -> Option<f64> {
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
fn rescore_fact(fact: &mut InsightFact, included: &[GrantedRun]) {
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
fn direction_of(delta: f64) -> String {
    if delta.abs() < 0.5 {
        "same".into()
    } else if delta > 0.0 {
        "higher".into()
    } else {
        "lower".into()
    }
}

fn mean(values: &[f64]) -> Option<f64> {
    if values.is_empty() {
        return None;
    }
    Some(values.iter().sum::<f64>() / values.len() as f64)
}

fn round1(value: f64) -> f64 {
    (value * 10.0).round() / 10.0
}

/* ------------------------------ 授权装载 ------------------------------

* `ai_tasks` 表是任务存储的载体（S1，v32 迁移）：每行一个任务，JSON 载荷
* 带 `schema_version`，`mcp_shared` 是可索引列。基线分支还没有这张表，
* 所以装载全程防御式：表不在、列不齐、单行载荷坏了，都按「这条没有授权」
* 处理——授权宁可少算一条，也不能因为一处坏数据把整个范围放开或搞崩。*/

/// 从本机库读出所有 `mcp_shared = 1` 的任务，展开成授权。
///
/// 每次工具调用都重新走一遍这里（调用方本来就每请求重开连接），所以
/// 任务页里的授权开关对下一次 MCP 请求立即生效，不需要重启服务。
pub fn shared_task_grants(db: &Database) -> Result<Vec<TaskGrant>> {
    let table_exists: bool = db
        .conn
        .query_row(
            "SELECT COUNT(*) > 0 FROM sqlite_master WHERE type = 'table' AND name = 'ai_tasks'",
            [],
            |row| row.get(0),
        )
        .unwrap_or(false);
    if !table_exists {
        return Ok(Vec::new());
    }

    let mut columns_stmt = db.conn.prepare("PRAGMA table_info(ai_tasks)")?;
    let columns = columns_stmt
        .query_map([], |row| row.get::<_, String>(1))?
        .collect::<std::result::Result<Vec<String>, _>>()?;
    if !(columns.iter().any(|c| c == "payload") && columns.iter().any(|c| c == "mcp_shared")) {
        eprintln!(
            "zeppbridge-mcp: ai_tasks 表缺少 payload/mcp_shared 列（schema 不是预期形态），按零授权处理"
        );
        return Ok(Vec::new());
    }

    let mut stmt = db
        .conn
        .prepare("SELECT payload FROM ai_tasks WHERE mcp_shared = 1")?;
    let payloads = stmt
        .query_map([], |row| row.get::<_, String>(0))?
        .collect::<std::result::Result<Vec<String>, _>>()?;

    let mut grants = Vec::with_capacity(payloads.len());
    for payload in payloads {
        let task: SharedTaskPayload = match serde_json::from_str(&payload) {
            Ok(task) => task,
            Err(error) => {
                eprintln!("zeppbridge-mcp: 跳过一条解析失败的授权任务：{error}");
                continue;
            }
        };
        grants.push(expand_task(db, task)?);
    }
    Ok(grants)
}

/// `ai_tasks.payload` 里授权判定用到的最小子集。其余字段（标题、提示词、
/// 附件等）与访问判定无关，不读也不依赖。
#[derive(Debug, Deserialize)]
struct SharedTaskPayload {
    #[serde(default)]
    id: String,
    #[serde(default)]
    workout_ids: Vec<String>,
    #[serde(default)]
    categories: Vec<SharedCategoryRange>,
}

#[derive(Debug, Deserialize)]
struct SharedCategoryRange {
    /// `AiTaskCategory` 字符串；认不出来的类别不授权，但不会毁掉整个任务。
    category: String,
    /// 缺省按未启用处理：授权方向必须 fail-closed。
    #[serde(default)]
    enabled: bool,
    /// 与任务模型默认值一致：每天窗口 = 运动开始日往前 14 天。
    #[serde(default = "default_days_before")]
    days_before: i64,
    #[serde(default = "default_true")]
    include_workout_day: bool,
}

fn default_days_before() -> i64 {
    14
}

fn default_true() -> bool {
    true
}

/// 把一个任务的「workout_ids × 启用类别」展开成绝对日期窗口。
///
/// 每条运动独立开窗：`[开始日 − days_before, 开始日]`（`include_workout_day`
/// 为假时右端前移一天）。运动 id 查不到开始日（记录已删/未同步）就跳过它，
/// 类别为假、窗口为空同理——这些都不值得让整个授权失败。
fn expand_task(db: &Database, task: SharedTaskPayload) -> Result<TaskGrant> {
    let mut windows = Vec::new();
    for workout_id in &task.workout_ids {
        let Some(day) = workout_local_day(db, workout_id)? else {
            continue;
        };
        for range in &task.categories {
            if !range.enabled {
                continue;
            }
            let Some(category) = AccessCategory::parse(&range.category) else {
                continue;
            };
            if !category.is_windowed() {
                continue;
            }
            let end = if range.include_workout_day {
                day
            } else {
                day - Duration::days(1)
            };
            let start = day - Duration::days(range.days_before.max(0));
            if let Some(window) = GrantWindow::new(category, start, end) {
                windows.push(window);
            }
        }
    }
    Ok(TaskGrant {
        task_id: task.id,
        workout_ids: task.workout_ids,
        windows,
    })
}

/// 运动开始时刻折算成本地日（P4：`date(start_time,'localtime')`）。
fn workout_local_day(db: &Database, workout_id: &str) -> Result<Option<NaiveDate>> {
    let day: Option<String> = db
        .conn
        .query_row(
            "SELECT date(start_time, 'localtime') FROM workouts WHERE workout_id = ?1",
            [workout_id],
            |row| row.get(0),
        )
        .optional()?;
    day.map(|value| {
        NaiveDate::parse_from_str(&value, "%Y-%m-%d")
            .map_err(|error| ZeppBridgeError::ParseError(format!("运动开始日无效: {error}")))
    })
    .transpose()
}

/// 授权窗口内最新一晚睡眠的 id（按醒来本地日归属，与睡眠列表同口径）。
///
/// `get_sleep_detail` 不带 id 在任务范围内不是「全库最新一晚」，而是
/// 「授权窗内最新一晚」——窗口外有更新的记录也不该被看见。
pub fn latest_sleep_in_windows(db: &Database, permit: &Permit) -> Result<Option<String>> {
    let mut stmt = db.conn.prepare(
        "SELECT sleep_id, date(end_time, 'localtime') FROM sleep_sessions
         ORDER BY end_time DESC",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })?;
    for row in rows {
        let (sleep_id, day) = row?;
        let Ok(day) = NaiveDate::parse_from_str(&day, "%Y-%m-%d") else {
            continue;
        };
        if permit.day_permitted(AccessCategory::Sleep, day) {
            return Ok(Some(sleep_id));
        }
    }
    Ok(None)
}

/* ------------------------------ 测试 ------------------------------ */

#[cfg(test)]
mod tests {
    use super::*;
    use crate::contract;
    use crate::insight::InsightFact;
    use crate::models::{SleepSession, SourceScope};
    use chrono::TimeZone;
    use std::path::PathBuf;

    fn day(month: u32, day: u32) -> NaiveDate {
        NaiveDate::from_ymd_opt(2026, month, day).unwrap()
    }

    /// 临时数据目录。和其它 core 测试一样手动建/删，不引 tempfile。
    struct TestDir(PathBuf);

    impl TestDir {
        fn new(tag: &str) -> Self {
            let nonce = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let dir = std::env::temp_dir().join(format!(
                "zeppbridge-access-{tag}-{}-{nonce}",
                std::process::id()
            ));
            std::fs::create_dir_all(&dir).unwrap();
            Self(dir)
        }
    }

    impl Drop for TestDir {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    fn window(category: AccessCategory, start: NaiveDate, end: NaiveDate) -> GrantWindow {
        GrantWindow::new(category, start, end).unwrap()
    }

    fn grant(task_id: &str, workout_ids: &[&str], windows: Vec<GrantWindow>) -> TaskGrant {
        TaskGrant {
            task_id: task_id.into(),
            workout_ids: workout_ids.iter().map(|id| id.to_string()).collect(),
            windows,
        }
    }

    fn request(tool: &'static str) -> DataRequest {
        DataRequest {
            tool,
            ..DataRequest::default()
        }
    }

    /* ---------- AccessScope ---------- */

    #[test]
    fn scope_parses_only_the_two_known_values() {
        assert_eq!(
            AccessScope::parse("full-readonly"),
            Some(AccessScope::FullReadOnly)
        );
        assert_eq!(AccessScope::parse("task"), Some(AccessScope::TaskScoped));
        for bad in ["", "full", "task-scoped", "TASK", " task", "full_readonly"] {
            assert_eq!(AccessScope::parse(bad), None, "{bad:?} 必须 fail-closed");
        }
        assert_eq!(AccessScope::FullReadOnly.as_str(), "full-readonly");
        assert_eq!(AccessScope::TaskScoped.as_str(), "task");
    }

    /* ---------- authorize：通用规则 ---------- */

    #[test]
    fn task_scope_with_zero_grants_denies_with_no_grants() {
        let grants = vec![];
        for tool in [
            "list_workouts",
            "get_workout_insight",
            "get_metric_series",
            "get_sleep_detail",
            "get_data_health",
        ] {
            let mut req = request(tool);
            req.categories = vec![AccessCategory::Workout];
            let error = authorize(&AccessScope::TaskScoped, &grants, &req).unwrap_err();
            assert_eq!(error.code, SCOPE_NO_GRANTS, "{tool} 零授权必须是 no_grants");
        }
    }

    #[test]
    fn full_readonly_ignores_grants_entirely() {
        // 授权集故意为空也放行：full 模式根本不读授权。
        let mut req = request("get_data_health");
        req.whole_library = true;
        assert!(
            authorize(&AccessScope::FullReadOnly, &[], &req).is_ok(),
            "full-readonly 不该被任何授权状态拦住"
        );
    }

    #[test]
    fn whole_library_requests_are_denied_under_task_scope() {
        let grants = vec![grant(
            "t1",
            &["w1"],
            vec![window(AccessCategory::Sleep, day(1, 1), day(1, 31))],
        )];
        let mut req = request("get_data_health");
        req.whole_library = true;
        let error = authorize(&AccessScope::TaskScoped, &grants, &req).unwrap_err();
        assert_eq!(error.code, SCOPE_DENIED);
    }

    #[test]
    fn unlisted_workout_id_is_denied() {
        let grants = vec![grant("t1", &["w1", "w2"], vec![])];
        let mut req = request("get_workout_insight");
        req.categories = vec![AccessCategory::Workout];
        req.workout_ids = vec!["w9".into()];
        assert_eq!(
            authorize(&AccessScope::TaskScoped, &grants, &req)
                .unwrap_err()
                .code,
            SCOPE_DENIED
        );
        req.workout_ids = vec!["w2".into()];
        assert!(authorize(&AccessScope::TaskScoped, &grants, &req).is_ok());
    }

    #[test]
    fn windowed_category_without_overlap_is_denied_not_truncated() {
        // 授权窗 1/1..1/15，请求 2/1..2/10：不相交必须拒绝，不能悄悄截成空。
        let grants = vec![grant(
            "t1",
            &["w1"],
            vec![window(AccessCategory::Recovery, day(1, 1), day(1, 15))],
        )];
        let mut req = request("get_metric_series");
        req.categories = vec![AccessCategory::Recovery];
        req.date_range = Some((day(2, 1), day(2, 10)));
        assert_eq!(
            authorize(&AccessScope::TaskScoped, &grants, &req)
                .unwrap_err()
                .code,
            SCOPE_DENIED
        );
        // 有交集就放行，且窗口被裁到交集。
        req.date_range = Some((day(1, 10), day(2, 10)));
        let permit = authorize(&AccessScope::TaskScoped, &grants, &req).unwrap();
        assert_eq!(permit.windows.len(), 1);
        assert_eq!(permit.windows[0].start_date, day(1, 10));
        assert_eq!(permit.windows[0].end_date, day(1, 15));
    }

    #[test]
    fn a_category_with_no_overlap_denies_the_whole_call() {
        // 请求 sleep+recovery，只有 recovery 有窗：整体拒绝，不悄悄丢掉 sleep。
        // 否则模型会把「没授权」读成「没数据」——这是两种不同的真话。
        let grants = vec![grant(
            "t1",
            &["w1"],
            vec![window(AccessCategory::Recovery, day(1, 1), day(1, 15))],
        )];
        let mut req = request("get_metric_series");
        req.categories = vec![AccessCategory::Sleep, AccessCategory::Recovery];
        let denied = authorize(&AccessScope::TaskScoped, &grants, &req).unwrap_err();
        assert_eq!(denied.code, SCOPE_DENIED);
        assert!(denied.reason.contains("sleep"));
    }

    #[test]
    fn sleep_requests_need_a_sleep_window() {
        let grants = vec![grant(
            "t1",
            &["w1"],
            vec![window(AccessCategory::Recovery, day(1, 1), day(1, 15))],
        )];
        let mut req = request("get_sleep_detail");
        req.categories = vec![AccessCategory::Sleep];
        req.latest_sleep = true;
        assert_eq!(
            authorize(&AccessScope::TaskScoped, &grants, &req)
                .unwrap_err()
                .code,
            SCOPE_DENIED
        );
    }

    #[test]
    fn list_workouts_with_no_granted_ids_permits_an_empty_list() {
        let grants = vec![grant(
            "t1",
            &[],
            vec![window(AccessCategory::Sleep, day(1, 1), day(1, 15))],
        )];
        let mut req = request("list_workouts");
        req.categories = vec![AccessCategory::Workout];
        let permit = authorize(&AccessScope::TaskScoped, &grants, &req).unwrap();
        assert!(permit.workout_ids.is_empty());
        assert_eq!(permit.grants, 1);
    }

    #[test]
    fn grants_from_multiple_tasks_union_together() {
        let grants = vec![
            grant(
                "t1",
                &["w1"],
                vec![window(AccessCategory::Sleep, day(1, 1), day(1, 7))],
            ),
            grant(
                "t2",
                &["w2"],
                vec![window(AccessCategory::Sleep, day(2, 1), day(2, 7))],
            ),
        ];
        let mut req = request("list_workouts");
        req.categories = vec![AccessCategory::Workout];
        let permit = authorize(&AccessScope::TaskScoped, &grants, &req).unwrap();
        assert_eq!(permit.workout_ids.len(), 2);
        assert_eq!(permit.grants, 2);
        let mut sleep_req = request("get_sleep_detail");
        sleep_req.categories = vec![AccessCategory::Sleep];
        let permit = authorize(&AccessScope::TaskScoped, &grants, &sleep_req).unwrap();
        assert_eq!(permit.permitted_day_count(AccessCategory::Sleep), 14);
    }

    #[test]
    fn overlapping_windows_merge_for_display() {
        let grants = vec![grant(
            "t1",
            &["w1"],
            vec![
                window(AccessCategory::Sleep, day(1, 1), day(1, 10)),
                window(AccessCategory::Sleep, day(1, 5), day(1, 20)),
                window(AccessCategory::Sleep, day(1, 21), day(1, 25)),
            ],
        )];
        let merged = granted_windows(&grants, &[AccessCategory::Sleep], None);
        assert_eq!(merged.len(), 1);
        assert_eq!(merged[0].start_date, day(1, 1));
        assert_eq!(merged[0].end_date, day(1, 25));
    }

    /* ---------- metric_category ---------- */

    #[test]
    fn every_contract_metric_has_a_category() {
        for metric in contract::metric_names() {
            assert!(
                metric_category(metric).is_some(),
                "契约指标 {metric} 必须有类别映射，否则任务范围永远拒绝它"
            );
        }
    }

    #[test]
    fn metric_category_is_fail_closed_for_unknown_names() {
        assert_eq!(metric_category("heart_rate"), None);
        assert_eq!(metric_category("made_up_metric"), None);
        assert_eq!(metric_category(""), None);
    }

    /* ---------- clip_metric_series ---------- */

    fn series(metric: &str, dates: &[&str]) -> MetricSeries {
        MetricSeries {
            metric: metric.into(),
            unit: "u".into(),
            source: "daily_metrics".into(),
            points: dates
                .iter()
                .map(|date| crate::models::MetricSeriesPoint {
                    date: date.to_string(),
                    value: 1.0,
                    min: None,
                    max: None,
                    samples: None,
                })
                .collect(),
            latest: None,
            average: None,
            minimum: None,
            maximum: None,
            days_with_data: 0,
            window_days: 0,
        }
    }

    #[test]
    fn clip_metric_series_drops_days_outside_the_window() {
        let mut permit = Permit::unrestricted();
        permit.windows = vec![window(AccessCategory::Training, day(1, 5), day(1, 10))];
        let input = vec![
            series(
                "steps",
                &["2026-01-04", "2026-01-05", "2026-01-10", "2026-01-11"],
            ),
            series("spo2", &["2026-01-06"]), // 类别无窗 → 整条丢
        ];
        let clipped = clip_metric_series(input, &permit);
        assert_eq!(clipped.len(), 1);
        let dates: Vec<&str> = clipped[0]
            .points
            .iter()
            .map(|point| point.date.as_str())
            .collect();
        assert_eq!(dates, ["2026-01-05", "2026-01-10"]);
        assert_eq!(clipped[0].days_with_data, 2);
        assert_eq!(clipped[0].window_days, 6);
        assert_eq!(clipped[0].latest.as_ref().unwrap().date, "2026-01-10");
    }

    /* ---------- strip_identity_fields ---------- */

    #[test]
    fn identity_fields_are_stripped_recursively() {
        let mut value = serde_json::json!({
            "sleep": {"sleep_id": "s1", "device_id": "dev-serial-1"},
            "stages": [{"stage": "deep", "device_id": "x"}],
            "ok": 1
        });
        strip_identity_fields(&mut value);
        let text = value.to_string();
        assert!(!text.contains("device_id"));
        assert!(!text.contains("dev-serial-1"));
        assert_eq!(value["ok"], serde_json::json!(1));
    }

    /* ---------- rescore_insight ---------- */

    fn run(id: &str, day: u32, distance: Option<f64>, avg_hr: Option<i32>) -> GrantedRun {
        let start = Utc.with_ymd_and_hms(2026, 1, day, 8, 0, 0).unwrap();
        GrantedRun {
            workout_id: id.into(),
            start_time: start,
            end_time: start + Duration::minutes(50),
            distance_meters: distance,
            avg_hr,
            training_load: Some(60.0),
        }
    }

    fn fact(metric: &str, value: Option<f64>) -> InsightFact {
        InsightFact {
            fact_id: format!("run.{metric}"),
            metric: metric.into(),
            value,
            unit: "u".into(),
            comparison: None,
            baseline_window: None,
            evidence_count: 0,
            source: "device".into(),
            confidence: Confidence::High,
            reason: None,
            reason_code: None,
            baseline_count: 0,
            evidence_refs: Vec::new(),
        }
    }

    #[test]
    fn rescore_recomputes_baseline_over_granted_runs_only() {
        // 库里可比历史：g1..g4 已授权，x1..x5 未授权。原洞察基线混入 x*。
        let granted: BTreeSet<String> = ["g1", "g2", "g3", "g4", "target"]
            .iter()
            .map(|id| id.to_string())
            .collect();
        let rows: BTreeMap<String, GrantedRun> = ["g1", "g2", "g3", "g4", "x1", "x2"]
            .iter()
            .enumerate()
            .map(|(i, id)| {
                (
                    id.to_string(),
                    run(id, (i + 1) as u32, Some(10_000.0), Some(150)),
                )
            })
            .collect();
        let mut insight = WorkoutInsight {
            workout_id: "target".into(),
            workout_type: "run".into(),
            supported: true,
            unsupported_reason: None,
            unsupported_code: None,
            facts: vec![fact("avg_hr", Some(160.0))],
            baseline_included: ["x1", "x2", "g1", "g2", "g3"]
                .iter()
                .map(|id| BaselineEntry {
                    workout_id: id.to_string(),
                    start_time: Utc
                        .with_ymd_and_hms(2026, 1, 20, 8, 0, 0)
                        .unwrap()
                        .to_rfc3339(),
                    distance_meters: 10_000.0,
                })
                .collect(),
            baseline_excluded: vec![BaselineExclusion {
                workout_id: "x9".into(),
                reason: "distance_out_of_tolerance".into(),
            }],
            heart_rate_drift: None,
            heart_rate_drift_unavailable: Some("not_enough_samples".into()),
        };
        // 原始均值里混着未授权样本——重算前先把比较值塞成一个明显错的标记。
        insight.facts[0].comparison = Some(Comparison {
            baseline_value: 999.0,
            delta: 0.0,
            delta_percent: 0.0,
            direction: "same".into(),
        });
        insight.facts[0].evidence_refs = vec!["x1".into(), "x2".into(), "g1".into()];

        rescore_insight(&mut insight, &granted, &rows);

        let ids: Vec<&str> = insight
            .baseline_included
            .iter()
            .map(|entry| entry.workout_id.as_str())
            .collect();
        assert_eq!(ids, ["g1", "g2", "g3"], "未授权运动不得留在基线");
        assert!(insight
            .baseline_excluded
            .iter()
            .all(|entry| entry.workout_id != "x9"));
        let fact = &insight.facts[0];
        let comparison = fact.comparison.as_ref().unwrap();
        assert_eq!(comparison.baseline_value, 150.0, "基线均值必须只含授权样本");
        assert_eq!(fact.evidence_count, 3);
        assert_eq!(fact.evidence_refs, ["g1", "g2", "g3"]);
        assert_eq!(fact.confidence, Confidence::Low);
    }

    #[test]
    fn rescore_promotes_beyond_max_samples_rows_into_freed_slots() {
        // 原基线满员 10 条，授权后只剩 2 条 included + 2 条可补位的授权排除行。
        let granted: BTreeSet<String> = ["g1", "g2", "p1", "p2", "target"]
            .iter()
            .map(|id| id.to_string())
            .collect();
        let mut rows = BTreeMap::new();
        for (i, id) in ["g1", "g2", "p1", "p2"].iter().enumerate() {
            rows.insert(
                id.to_string(),
                run(id, (i + 1) as u32, Some(10_000.0), Some(140)),
            );
        }
        let mut insight = WorkoutInsight {
            workout_id: "target".into(),
            workout_type: "run".into(),
            supported: true,
            unsupported_reason: None,
            unsupported_code: None,
            facts: vec![fact("distance", Some(10_000.0))],
            baseline_included: ["g1", "g2"]
                .iter()
                .enumerate()
                .map(|(i, id)| BaselineEntry {
                    workout_id: id.to_string(),
                    start_time: Utc
                        .with_ymd_and_hms(2026, 1, 25 - i as u32, 8, 0, 0)
                        .unwrap()
                        .to_rfc3339(),
                    distance_meters: 10_000.0,
                })
                .collect(),
            baseline_excluded: vec![
                BaselineExclusion {
                    workout_id: "p1".into(),
                    reason: "beyond_max_samples".into(),
                },
                BaselineExclusion {
                    workout_id: "x-out".into(), // 未授权，连排除表都不该出现
                    reason: "beyond_max_samples".into(),
                },
                BaselineExclusion {
                    workout_id: "p2".into(),
                    reason: "beyond_max_samples".into(),
                },
            ],
            heart_rate_drift: None,
            heart_rate_drift_unavailable: None,
        };
        rescore_insight(&mut insight, &granted, &rows);
        let ids: Vec<&str> = insight
            .baseline_included
            .iter()
            .map(|entry| entry.workout_id.as_str())
            .collect();
        assert_eq!(ids.len(), 4);
        assert!(ids.contains(&"p1") && ids.contains(&"p2"));
        // 日期重新按新→旧排序：g1(1/25) > p1/p2/g2。
        assert_eq!(ids[0], "g1");
        assert!(insight.baseline_excluded.is_empty());
        assert_eq!(insight.facts[0].evidence_count, 4);
    }

    #[test]
    fn rescore_thins_out_when_few_granted_samples_remain() {
        let granted: BTreeSet<String> = ["g1", "target"].iter().map(|id| id.to_string()).collect();
        let rows: BTreeMap<String, GrantedRun> =
            [("g1".to_string(), run("g1", 1, Some(10_000.0), Some(150)))]
                .into_iter()
                .collect();
        let mut insight = WorkoutInsight {
            workout_id: "target".into(),
            workout_type: "run".into(),
            supported: true,
            unsupported_reason: None,
            unsupported_code: None,
            facts: vec![fact("avg_hr", Some(160.0))],
            baseline_included: vec![BaselineEntry {
                workout_id: "g1".into(),
                start_time: Utc
                    .with_ymd_and_hms(2026, 1, 1, 8, 0, 0)
                    .unwrap()
                    .to_rfc3339(),
                distance_meters: 10_000.0,
            }],
            baseline_excluded: Vec::new(),
            heart_rate_drift: None,
            heart_rate_drift_unavailable: None,
        };
        rescore_insight(&mut insight, &granted, &rows);
        let fact = &insight.facts[0];
        assert!(fact.comparison.is_none());
        assert_eq!(fact.reason_code.as_deref(), Some("workout_thin_baseline"));
        assert_eq!(fact.confidence, Confidence::Insufficient);
    }

    #[test]
    fn rescore_leaves_unsupported_insights_alone() {
        let granted: BTreeSet<String> = ["target"].iter().map(|id| id.to_string()).collect();
        let mut insight = WorkoutInsight {
            workout_id: "target".into(),
            workout_type: "walk".into(),
            supported: false,
            unsupported_reason: Some("暂不支持".into()),
            unsupported_code: Some("unsupported_workout_type".into()),
            facts: Vec::new(),
            baseline_included: Vec::new(),
            baseline_excluded: Vec::new(),
            heart_rate_drift: None,
            heart_rate_drift_unavailable: None,
        };
        let snapshot = insight.clone();
        rescore_insight(&mut insight, &granted, &BTreeMap::new());
        assert_eq!(insight, snapshot);
    }

    /* ---------- shared_task_grants / 窗口展开 ---------- */

    /// 造一个带 ai_tasks 行的库。表本身由 v32 迁移建好（S1）；
    /// `payload` JSON 文本 + `mcp_shared` 索引列的约定若变，
    /// 这里和装载逻辑要一起改。
    fn library_with_tasks(payloads: &[(bool, &str)]) -> (Database, TestDir) {
        let dir = TestDir::new("tasks");
        let db = Database::open_migrated(&dir.0.join("zepp.db")).unwrap();
        for (index, (shared, payload)) in payloads.iter().enumerate() {
            db.conn
                .execute(
                    "INSERT INTO ai_tasks(id, payload, mcp_shared, created_at, updated_at)
                     VALUES(?1, ?2, ?3, '', '')",
                    rusqlite::params![format!("task-{index}"), payload, *shared as i64],
                )
                .unwrap();
        }
        (db, dir)
    }

    fn insert_run(db: &Database, workout_id: &str, month: u32, day: u32) {
        let start = Utc.with_ymd_and_hms(2026, month, day, 8, 0, 0).unwrap();
        let workout = Workout {
            workout_id: workout_id.into(),
            workout_type: "run".into(),
            normalized_type: "run".into(),
            type_source: "numeric_mapped".into(),
            user_override: None,
            effective_type: "run".into(),
            custom_label: None,
            start_time: start,
            end_time: start + Duration::minutes(50),
            distance_meters: Some(10_000.0),
            calories: Some(600),
            avg_hr: Some(150),
            max_hr: Some(170),
            training_load: Some(60.0),
            vo2max: None,
            min_hr: None,
            total_steps: None,
            moving_seconds: None,
            elevation_gain_m: None,
            elevation_loss_m: None,
            max_altitude_m: None,
            min_altitude_m: None,
            training_effect: None,
            anaerobic_training_effect: None,
            rpe: None,
            avg_cadence_spm: None,
            max_cadence_spm: None,
            avg_stride_cm: None,
            hr_zones: Vec::new(),
            source_scope: SourceScope::Device,
            device_id: Some("device-1".into()),
            synced_at: None,
            gps_available: false,
            sample_count: 0,
            zepp_source: None,
            zepp_type: Some(1),
        };
        db.insert_workout(&workout).unwrap();
    }

    #[test]
    fn missing_ai_tasks_table_means_zero_grants() {
        let dir = TestDir::new("no-tasks");
        let db = Database::open_migrated(&dir.0.join("zepp.db")).unwrap();
        // v32 起迁移已建表；删掉它来模拟「还没跑到 v32 的旧库」。
        db.conn.execute_batch("DROP TABLE ai_tasks;").unwrap();
        assert_eq!(shared_task_grants(&db).unwrap(), Vec::new());
    }

    #[test]
    fn shared_task_grants_expands_windows_per_workout() {
        let (db, _dir) = library_with_tasks(&[(
            true,
            r#"{"id":"t1","workout_ids":["w1","w2"],
                "categories":[
                    {"category":"sleep","enabled":true,"days_before":7,"include_workout_day":true},
                    {"category":"recovery","enabled":true,"days_before":3,"include_workout_day":false},
                    {"category":"body","enabled":false,"days_before":5,"include_workout_day":true},
                    {"category":"personal_note","enabled":true,"days_before":9,"include_workout_day":true}
                ]}"#,
        )]);
        insert_run(&db, "w1", 1, 10);
        insert_run(&db, "w2", 1, 20);
        let grants = shared_task_grants(&db).unwrap();
        assert_eq!(grants.len(), 1);
        assert_eq!(grants[0].task_id, "t1");
        assert_eq!(grants[0].workout_ids, ["w1", "w2"]);
        // sleep: 每条运动一个窗，1/3..1/10 与 1/13..1/20
        let sleep: Vec<&GrantWindow> = grants[0]
            .windows
            .iter()
            .filter(|w| w.category == AccessCategory::Sleep)
            .collect();
        assert_eq!(sleep.len(), 2);
        assert_eq!(
            (sleep[0].start_date, sleep[0].end_date),
            (day(1, 3), day(1, 10))
        );
        assert_eq!(
            (sleep[1].start_date, sleep[1].end_date),
            (day(1, 13), day(1, 20))
        );
        // recovery: include_workout_day=false → 右端是开始日前一天
        let recovery: Vec<&GrantWindow> = grants[0]
            .windows
            .iter()
            .filter(|w| w.category == AccessCategory::Recovery)
            .collect();
        assert_eq!(
            (recovery[0].start_date, recovery[0].end_date),
            (day(1, 7), day(1, 9))
        );
        // body 未启用、personal_note 非窗口类别 → 都不该有窗
        assert!(!grants[0].windows.iter().any(|w| matches!(
            w.category,
            AccessCategory::Body | AccessCategory::PersonalNote
        )));
    }

    #[test]
    fn unshared_tasks_and_broken_payloads_grant_nothing() {
        let (db, _dir) = library_with_tasks(&[
            (
                false,
                r#"{"id":"off","workout_ids":["w1"],"categories":[]}"#,
            ),
            (true, "not json"),
            (true, r#"{"id":"on","workout_ids":[],"categories":[]}"#),
        ]);
        let grants = shared_task_grants(&db).unwrap();
        assert_eq!(grants.len(), 1, "只有 mcp_shared=1 且可解析的行才算数");
        assert_eq!(grants[0].task_id, "on");
        assert!(grants[0].windows.is_empty());
    }

    #[test]
    fn grant_changes_take_effect_on_the_next_reload() {
        // 「两次调用之间翻转 mcp_shared」的库层等价物：每次调用都重读，
        // 所以第二次看到的就是新的授权状态。
        let (db, _dir) =
            library_with_tasks(&[(true, r#"{"id":"t1","workout_ids":[],"categories":[]}"#)]);
        assert_eq!(shared_task_grants(&db).unwrap().len(), 1);
        db.conn
            .execute("UPDATE ai_tasks SET mcp_shared = 0 WHERE id = 'task-0'", [])
            .unwrap();
        assert_eq!(shared_task_grants(&db).unwrap().len(), 0);
    }

    #[test]
    fn latest_sleep_in_windows_picks_the_newest_in_window_only() {
        let dir = TestDir::new("sleep-windows");
        let db = Database::open_migrated(&dir.0.join("zepp.db")).unwrap();
        let session = |id: &str, month: u32, day: u32| {
            // end_time（醒来时刻）落在给定日，归属日按它算。
            let end = Utc.with_ymd_and_hms(2026, month, day, 6, 0, 0).unwrap();
            SleepSession {
                sleep_id: id.into(),
                start_time: end - Duration::hours(8),
                end_time: end,
                score: Some(80),
                duration_minutes: 480,
                deep_minutes: None,
                light_minutes: None,
                rem_minutes: None,
                awake_minutes: None,
                source_scope: SourceScope::Device,
                device_id: None,
                synced_at: None,
                time_in_bed_minutes: None,
                stages: Vec::new(),
                wake_count: None,
            }
        };
        db.insert_sleep_session(&session("in-old", 1, 5)).unwrap();
        db.insert_sleep_session(&session("in-new", 1, 12)).unwrap();
        db.insert_sleep_session(&session("outside", 1, 20)).unwrap();

        let mut permit = Permit::unrestricted();
        permit.windows = vec![window(AccessCategory::Sleep, day(1, 1), day(1, 15))];
        // 全库最新是 outside(1/20)，但授权窗只到 1/15 → 只能拿到 in-new。
        assert_eq!(
            latest_sleep_in_windows(&db, &permit).unwrap().as_deref(),
            Some("in-new")
        );
        permit.windows = vec![window(AccessCategory::Sleep, day(1, 1), day(1, 6))];
        assert_eq!(
            latest_sleep_in_windows(&db, &permit).unwrap().as_deref(),
            Some("in-old")
        );
        permit.windows = vec![window(AccessCategory::Sleep, day(2, 1), day(2, 6))];
        assert_eq!(latest_sleep_in_windows(&db, &permit).unwrap(), None);
    }
}
