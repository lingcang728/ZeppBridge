//! 「比平时高 / 低」：只和用户自己比的确定性标记（精修批次 6.2）。
//!
//! 规则全部是常量，测试钉住：
//! - 基线 = 最新一次读数**之前** 28 天里的读数（不含最新这天）；
//! - 少于 14 天有读数就不标（数据不够，说不出「平时」）；
//! - 平时 = 中位数，波动 = 1.4826 × 中位绝对偏差（对偶尔一两天的极端值不敏感），太小时按中位数的 2% 兜底；
//! - 最新读数离中位数超过 2 个波动才标「比平时高 / 低」，同时给出差值；
//! - 最新读数要在最近 3 天内，太旧的不算「现在」。
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
    })
}
