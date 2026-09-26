use crate::models::error::Result;

use crate::storage::Database;

use chrono::{DateTime, Duration, Local, NaiveDate, Utc};

use serde::{Deserialize, Serialize};

mod weekly_report;
mod workout_insight;

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

/// 心率漂移（前后半程）的成立条件。
///
/// 这些常量决定「算不算」，所以全部写在这里而不是散在函数里 —— 它们必须能被
/// 测试钉住，也必须能被读的人核对。
pub mod drift {
    /// 短于这个时长不算。前十分钟基本都是心率还在爬的过程，把它和后半程比，
    /// 量到的是热身，不是漂移。
    pub const MIN_DURATION_SECONDS: i64 = 20 * 60;
    /// 每一半至少要有这么多个同时带心率和速度的样本。
    pub const MIN_SAMPLES_PER_HALF: usize = 60;
    /// 速度的变异系数超过这个值就不算。间歇跑、红绿灯、爬坡都会把速度打散，
    /// 那种情况下前后半程的差异来自路况而不是身体。
    pub const MAX_SPEED_CV: f64 = 0.20;
    /// 心率低于这个值的样本当作没测到扔掉（贴合不良时会掉到个位数）。
    pub const MIN_PLAUSIBLE_HR: f64 = 40.0;
    /// 速度低于这个值当作停着，不参与统计。
    pub const MIN_PLAUSIBLE_SPEED_MPS: f64 = 0.5;
}

/// 一次运动前后半程的「配速 × 心率」对比。
///
/// 量的是**每一拍心跳跑出多少米**（速度 ÷ 心率）。后半程比前半程低，说明维持
/// 同样的速度要花更多心跳 —— 通常叫心率漂移或者 decoupling。
///
/// 这个指标非常容易被路况污染：红绿灯、爬坡、间歇、GPS 漂移都会让两半程根本
/// 不可比。所以条件不满足时它返回 `None` 和一个原因码，**不硬算一个百分比**
/// —— 这和这个模块其它地方「证据不足就说不足」是同一条规矩。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct HeartRateDrift {
    /// 前半程每拍心跳跑出的米数。
    pub first_half_metres_per_beat: f64,
    /// 后半程每拍心跳跑出的米数。
    pub second_half_metres_per_beat: f64,
    /// 后半程相对前半程的变化百分比。负数表示同样的速度要花更多心跳。
    pub drift_percent: f64,
    pub first_half_avg_hr: f64,
    pub second_half_avg_hr: f64,
    pub first_half_avg_speed_mps: f64,
    pub second_half_avg_speed_mps: f64,
    /// 两半各自参与计算的样本数。
    pub first_half_samples: i64,
    pub second_half_samples: i64,
    /// 速度的变异系数，读的人可以自己判断这次到底稳不稳。
    pub speed_cv: f64,
}

/// 一个同时带心率和速度的采样点。
struct DriftSample {
    unix: i64,
    heart_rate: f64,
    speed_mps: f64,
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
    /// `weekly_zero_baseline` / `workout_thin_baseline` / `workout_no_value` /
    /// `workout_zero_baseline`。
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
    /// 前后半程的「配速 × 心率」对比。条件不满足时为 `None`。
    #[serde(default)]
    pub heart_rate_drift: Option<HeartRateDrift>,
    /// 算不了的时候给一个稳定原因码：`not_enough_samples` / `too_short` /
    /// `pace_too_variable`。**不硬算一个百分比**是这里的规矩。
    #[serde(default)]
    pub heart_rate_drift_unavailable: Option<String>,
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

fn saturating_days_before(date: NaiveDate, days: i64) -> NaiveDate {
    Duration::try_days(days)
        .and_then(|delta| date.checked_sub_signed(delta))
        .unwrap_or(date)
}

/// 变化方向。
///
/// 界面把心率等指标四舍五入成整数再显示。用「基线的 2%」当持平门槛时，
/// 50 vs 51 bpm（−1.3%）会被判成 `same`，于是本周那根条没有颜色，而旁边
/// 数字明明写着两个不同的值。半个显示单位以下才是噪声。
fn direction_of(delta: f64, _previous: f64) -> String {
    if delta.abs() < 0.5 {
        "same".into()
    } else if delta > 0.0 {
        "higher".into()
    } else {
        "lower".into()
    }
}

#[cfg(test)]
mod tests;
