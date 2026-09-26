use std::collections::{BTreeMap, BTreeSet};

use chrono::{DateTime, Duration, NaiveDate, Utc};

use rusqlite::params_from_iter;

use serde::{Deserialize, Serialize};

use crate::insight::{
    self, BaselineEntry, BaselineExclusion, Comparison, Confidence, InsightFact, WorkoutInsight,
};

use crate::models::error::{Result, ZeppBridgeError};

use crate::models::{MetricSeries, Workout};

use crate::storage::Database;

/* ------------------------------ 范围与类别 ------------------------------ */

mod rescore;
mod shared_tasks;

pub use rescore::*;
pub use shared_tasks::*;

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

#[cfg(test)]
mod tests;
