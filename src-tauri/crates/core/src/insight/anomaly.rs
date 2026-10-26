//! 「比平时高 / 低」：只和用户自己比的确定性标记（精修批次 6.2）。
//!
//! 规则全部是常量，测试钉住：
//! - 基线 = 最新一次读数**之前** 28 天里的读数（不含最新这天）；
//! - 少于 14 天有读数就不标（数据不够，说不出「平时」）；
//! - 平时 = 中位数，波动 = 1.4826 × 中位绝对偏差（对偶尔一两天的极端值不敏感），太小时按中位数的 2% 兜底；
//! - 最新读数离中位数超过 2 个波动才标「比平时高 / 低」，同时给出差值；
//! - 最新读数要在最近 3 天内，太旧的不算「现在」；
//! - 另给一条**常态带**（3.1，卡片底行「状态词 ←→ 范围」）：最新读数之前 90 天里中间八成的读数
//!   （第 10 到第 90 百分位）。也只和自己比，不用人群常模；少于 14 天不给。
//! - **长期常态**（3.1 之后，「用十年历史算你的常态」）：最新读数之前**全部**历史（最多十年）
//!   中间八成，外加逐年的中位数和带。历史跨度不满一年或读数少于 120 天不给——
//!   不到一年的「常态」只是季节，不是你。官方接口只给近期窗口，这一条只有本机给得出。
//!
//! 不下诊断、不给训练建议：只给方向、差值和基线本身，界面按 `message_code` 说一句「比平时高 6」。

use chrono::{Duration, NaiveDate};
use serde::Serialize;

pub const BASELINE_DAYS: i64 = 28;
pub const MIN_DAYS: usize = 14;
pub const THRESHOLD: f64 = 2.0;
pub const FRESH_DAYS: i64 = 3;
const MAD_SCALE: f64 = 1.4826;
const MIN_RELATIVE_SPREAD: f64 = 0.02;
/// 常态带往回看多少天。
pub const USUAL_RANGE_DAYS: i64 = 90;
const USUAL_LOW_QUANTILE: f64 = 0.1;
const USUAL_HIGH_QUANTILE: f64 = 0.9;
/// 长期常态至少要跨这么多天（第一条到最新一条）。
pub const LONG_TERM_MIN_SPAN_DAYS: i64 = 365;
/// 长期常态至少要有这么多天的读数。
pub const LONG_TERM_MIN_DAYS: usize = 120;
/// 长期常态最多回看这么多天（十年）。
pub const LONG_TERM_MAX_DAYS: i64 = 3660;

/// 某一个自然年里的常态。
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct YearNorm {
    pub year: i32,
    pub days: usize,
    pub median: f64,
    pub low: f64,
    pub high: f64,
}

/// 你的长期常态：全部历史中间八成。
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct LongTermNorm {
    /// 最早一条读数。
    pub since: NaiveDate,
    /// 用了几天的读数。
    pub days: usize,
    pub median: f64,
    /// 第 10 / 第 90 百分位。
    pub low: f64,
    pub high: f64,
    /// 逐年（读数够 14 天的年份），从早到晚。
    pub years: Vec<YearNorm>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum BaselineDirection {
    Above,
    Below,
    Usual,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct MetricBaseline {
    pub metric: String,
    pub latest_date: NaiveDate,
    pub latest: f64,
    /// 最新读数之前 28 天的中位数。
    pub median: f64,
    /// 稳健的波动（1.4826 × MAD，有下限）。
    pub spread: f64,
    /// 基线里有读数的天数。
    pub days: usize,
    pub direction: BaselineDirection,
    /// 最新读数 − 中位数。
    pub delta: f64,
    /// `ui.metric_baseline.above` / `below` / `usual`。
    pub message_code: &'static str,
    /// 常态带：之前 90 天第 10 / 第 90 百分位。天数不够为 `None`。
    pub usual_low: Option<f64>,
    pub usual_high: Option<f64>,
    /// 常态带用了几天的读数。
    pub usual_days: usize,
    /// 长期常态（最新读数之前的全部历史）。历史不够一年为 `None`。
    pub long_term: Option<LongTermNorm>,
}

fn band(values: &mut [f64]) -> (f64, f64, f64) {
    values.sort_by(|a, b| a.total_cmp(b));
    (
        quantile(values, USUAL_LOW_QUANTILE),
        median(values),
        quantile(values, USUAL_HIGH_QUANTILE),
    )
}

/// 一项指标在 `before` 之前全部读数的长期常态（任意顺序，同一天只取一个）。
pub fn long_term_norm(points: &[(NaiveDate, f64)], before: NaiveDate) -> Option<LongTermNorm> {
    use chrono::Datelike;
    let mut history: Vec<(NaiveDate, f64)> = points
        .iter()
        .copied()
        .filter(|(date, v)| v.is_finite() && *date < before)
        .collect();
    history.sort_by_key(|(date, _)| *date);
    let (since, _) = *history.first()?;
    let (last, _) = *history.last()?;
    if history.len() < LONG_TERM_MIN_DAYS || (last - since).num_days() < LONG_TERM_MIN_SPAN_DAYS {
        return None;
    }
    let mut years = Vec::new();
    for year in since.year()..=last.year() {
        let mut values: Vec<f64> = history
            .iter()
            .filter(|(date, _)| date.year() == year)
            .map(|(_, v)| *v)
            .collect();
        if values.len() < MIN_DAYS {
            continue;
        }
        let (low, median, high) = band(&mut values);
        years.push(YearNorm {
            year,
            days: values.len(),
            median,
            low,
            high,
        });
    }
    let mut values: Vec<f64> = history.iter().map(|(_, v)| *v).collect();
    let (low, median, high) = band(&mut values);
    Some(LongTermNorm {
        since,
        days: values.len(),
        median,
        low,
        high,
        years,
    })
}

/// 已排序数组的线性插值分位数。
fn quantile(sorted: &[f64], q: f64) -> f64 {
    let at = q * (sorted.len() - 1) as f64;
    let lo = at.floor() as usize;
    let hi = at.ceil() as usize;
    sorted[lo] + (sorted[hi] - sorted[lo]) * (at - lo as f64)
}

fn median(sorted: &[f64]) -> f64 {
    let n = sorted.len();
    if n % 2 == 1 {
        sorted[n / 2]
    } else {
        (sorted[n / 2 - 1] + sorted[n / 2]) / 2.0
    }
}

/// 一项指标的逐日读数（任意顺序，同一天只取一个）→ 和自己比的结论。数据不够、最新读数太旧就是 `None`。
pub fn metric_baseline(
    metric: &str,
    points: &[(NaiveDate, f64)],
    today: NaiveDate,
) -> Option<MetricBaseline> {
    let mut points: Vec<(NaiveDate, f64)> = points
        .iter()
        .copied()
        .filter(|(_, v)| v.is_finite())
        .collect();
    points.sort_by_key(|(date, _)| *date);
    let &(latest_date, latest) = points.last()?;
    if latest_date < today - Duration::days(FRESH_DAYS) {
        return None;
    }
    let from = latest_date - Duration::days(BASELINE_DAYS);
    let mut window: Vec<f64> = points
        .iter()
        .filter(|(date, _)| *date >= from && *date < latest_date)
        .map(|(_, v)| *v)
        .collect();
    if window.len() < MIN_DAYS {
        return None;
    }
    window.sort_by(|a, b| a.total_cmp(b));
    let center = median(&window);
    let mut deviations: Vec<f64> = window.iter().map(|v| (v - center).abs()).collect();
    deviations.sort_by(|a, b| a.total_cmp(b));
    let spread = (MAD_SCALE * median(&deviations))
        .max(center.abs() * MIN_RELATIVE_SPREAD)
        .max(1e-9);
    let delta = latest - center;
    let usual_from = latest_date - Duration::days(USUAL_RANGE_DAYS);
    let mut usual: Vec<f64> = points
        .iter()
        .filter(|(date, _)| *date >= usual_from && *date < latest_date)
        .map(|(_, v)| *v)
        .collect();
    usual.sort_by(|a, b| a.total_cmp(b));
    let (usual_low, usual_high) = if usual.len() >= MIN_DAYS {
        (
            Some(quantile(&usual, USUAL_LOW_QUANTILE)),
            Some(quantile(&usual, USUAL_HIGH_QUANTILE)),
        )
    } else {
        (None, None)
    };
    let direction = if delta / spread >= THRESHOLD {
        BaselineDirection::Above
    } else if delta / spread <= -THRESHOLD {
        BaselineDirection::Below
    } else {
        BaselineDirection::Usual
    };
    Some(MetricBaseline {
        metric: metric.to_string(),
        latest_date,
        latest,
        median: center,
        spread,
        days: window.len(),
        direction,
        delta,
        message_code: match direction {
            BaselineDirection::Above => "ui.metric_baseline.above",
            BaselineDirection::Below => "ui.metric_baseline.below",
            BaselineDirection::Usual => "ui.metric_baseline.usual",
        },
        usual_low,
        usual_high,
        usual_days: usual.len(),
        long_term: long_term_norm(&points, latest_date),
    })
}
