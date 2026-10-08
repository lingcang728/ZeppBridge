//! 一次运动里主要的爬升 / 下降段。
//!
//! 只从手表记的逐点海拔识别，不看地图、不补点：没有海拔采样就是 `None`（界面不出卡），
//! 有海拔但没有够格的段就是空列表（界面写「没有明显爬升」）。距离靠逐点速度积分，
//! 速度缺得太多时距离不可信，同样给 `None`，不拿时间去冒充距离。
//!
//! 做法：海拔先按时间做居中滑动平均（压掉气压计 / GPS 的抖动），再用回撤阈值找拐点
//! （从最高点回落超过阈值才算这段上坡结束，下坡反之），相邻拐点之间就是一段；
//! 落差和平均坡度都够格的段才留下。所有阈值都在 [`ClimbMethod`] 里随结果一起给出，
//! 界面的「怎么算的」直接读它，不另写一份数字。

use chrono::DateTime;
use serde::{Deserialize, Serialize};

use crate::models::WorkoutSeriesSample;

/// 海拔平滑窗口（秒，居中）。
pub const SMOOTHING_WINDOW_S: f64 = 30.0;
/// 从段内最高（最低）点回撤超过这么多米，这一段才算结束。
pub const REVERSAL_M: f64 = 10.0;
/// 一段至少要有这么大的落差。
pub const MIN_CHANGE_M: f64 = 30.0;
/// 一段的平均坡度（绝对值）至少这么陡。
pub const MIN_GRADE_PCT: f64 = 3.0;
/// 速度低于它的时间不算移动时间（垂直速度、配速都按移动时间算）。
pub const MOVING_SPEED_M_S: f64 = 0.5;

/// 一段至少要走这么远，否则坡度只是速度积分的噪声。
const MIN_DISTANCE_M: f64 = 100.0;
/// 两个采样之间超过这么久，只按这么久积分距离（暂停、信号断开时不凭空多出距离）。
const MAX_GAP_S: f64 = 10.0;
/// 相邻两个海拔读数跳变超过这么多米视为传感器断层，不计入落差（与汇总的累计爬升同一规则）。
const MAX_STEP_M: f64 = 50.0;
/// 有速度的采样少于这个比例时，距离不可信。
const MIN_SPEED_COVERAGE: f64 = 0.8;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ClimbKind {
    Climb,
    Descent,
}

/// 识别用的参数，随结果一起交出去，说明文字只读这里。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ClimbMethod {
    pub smoothing_window_s: f64,
    pub reversal_m: f64,
    pub min_change_m: f64,
    pub min_grade_pct: f64,
    pub moving_speed_m_s: f64,
}

impl Default for ClimbMethod {
    fn default() -> Self {
        Self {
            smoothing_window_s: SMOOTHING_WINDOW_S,
            reversal_m: REVERSAL_M,
            min_change_m: MIN_CHANGE_M,
            min_grade_pct: MIN_GRADE_PCT,
            moving_speed_m_s: MOVING_SPEED_M_S,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ClimbSegment {
    pub kind: ClimbKind,
    pub start_time: String,
    pub end_time: String,
    /// 从运动开始算起的距离（米，逐点速度积分）。
    pub start_distance_m: f64,
    pub end_distance_m: f64,
    /// 平滑后的落差，上坡为正、下坡为负。
    pub elevation_change_m: f64,
    /// 平均坡度（%），符号同落差。
    pub average_grade_pct: f64,
    pub moving_seconds: i64,
    /// 垂直速度（米 / 小时，取绝对值），按移动时间算；没有移动时间时为空。
    pub vertical_speed_m_per_h: Option<f64>,
    pub average_hr: Option<f64>,
    /// 段内平均配速（分钟 / 公里），按移动时间算。
    pub average_pace_min_per_km: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct WorkoutClimbs {
    pub method: ClimbMethod,
    /// 按时间先后。空列表 = 有海拔，但没有够格的爬升或下降。
    pub segments: Vec<ClimbSegment>,
}

/// 一个有海拔读数的采样点。
struct Point {
    sample: usize,
    t: f64,
    /// 去掉断层后的连续海拔。
    altitude: f64,
}

/// `recorded_distance_m` 是这次运动记录的总距离：给了就把速度积分出的距离按它等比校准
/// （逐点速度在信号差时偏低，实测一次 13 km 的徒步积分出来只有 11.2 km，坡度会被高估）；
/// 两者差得离谱（不在 0.5–2 倍之间）时不校准，宁可用积分值。
pub fn detect_climbs(
    samples: &[WorkoutSeriesSample],
    recorded_distance_m: Option<f64>,
) -> Option<WorkoutClimbs> {
    let times: Vec<Option<f64>> = samples
        .iter()
        .map(|sample| {
            DateTime::parse_from_rfc3339(&sample.timestamp)
                .ok()
                .map(|time| time.timestamp_millis() as f64 / 1000.0)
        })
        .collect();

    let timed = times.iter().filter(|time| time.is_some()).count();
    let with_speed = samples
        .iter()
        .zip(&times)
        .filter(|(sample, time)| time.is_some() && plausible_speed(sample.speed).is_some())
        .count();
    if timed < 2 || (with_speed as f64) < (timed as f64) * MIN_SPEED_COVERAGE {
        return None;
    }

    // 累计距离与累计移动时间，下标与 samples 对齐。
    let mut distance = vec![0.0; samples.len()];
    let mut moving = vec![0.0; samples.len()];
    let mut previous: Option<f64> = None;
    for (index, sample) in samples.iter().enumerate() {
        if index > 0 {
            distance[index] = distance[index - 1];
            moving[index] = moving[index - 1];
        }
        let Some(t) = times[index] else { continue };
        if let Some(prev) = previous {
            let dt = (t - prev).clamp(0.0, MAX_GAP_S);
            if let Some(speed) = plausible_speed(sample.speed) {
                distance[index] += speed * dt;
                if speed >= MOVING_SPEED_M_S {
                    moving[index] += dt;
                }
            }
        }
        previous = Some(t);
    }
    let integrated = distance.last().copied().unwrap_or(0.0);
    if let Some(recorded) = recorded_distance_m.filter(|value| value.is_finite() && *value > 0.0) {
        let scale = recorded / integrated;
        if integrated > 0.0 && (0.5..=2.0).contains(&scale) {
            distance.iter_mut().for_each(|value| *value *= scale);
        }
    }

    let mut points: Vec<Point> = Vec::new();
    let mut last_raw: Option<f64> = None;
    for (index, sample) in samples.iter().enumerate() {
        let (Some(t), Some(raw)) = (times[index], plausible_altitude(sample.altitude_m)) else {
            continue;
        };
        let altitude = match (last_raw, points.last()) {
            (Some(prev_raw), Some(prev)) => {
                let step = raw - prev_raw;
                prev.altitude + if step.abs() > MAX_STEP_M { 0.0 } else { step }
            }
            _ => raw,
        };
        last_raw = Some(raw);
        points.push(Point {
            sample: index,
            t,
            altitude,
        });
    }
    if points.len() < 2 {
        return None;
    }

    let smoothed = smooth(&points);
    let pivots = pivots(&smoothed);

    let mut segments = Vec::new();
    for pair in pivots.windows(2) {
        let (from, to) = (pair[0], pair[1]);
        let change = smoothed[to] - smoothed[from];
        let (start, end) = (points[from].sample, points[to].sample);
        let run = distance[end] - distance[start];
        if change.abs() < MIN_CHANGE_M || run < MIN_DISTANCE_M {
            continue;
        }
        let grade = change / run * 100.0;
        if grade.abs() < MIN_GRADE_PCT {
            continue;
        }
        let moving_s = moving[end] - moving[start];
        let heart_rates: Vec<f64> = samples[start..=end]
            .iter()
            .filter_map(|sample| sample.heart_rate)
            .filter(|hr| (30..=250).contains(hr))
            .map(f64::from)
            .collect();
        segments.push(ClimbSegment {
            kind: if change > 0.0 {
                ClimbKind::Climb
            } else {
                ClimbKind::Descent
            },
            start_time: samples[start].timestamp.clone(),
            end_time: samples[end].timestamp.clone(),
            start_distance_m: round1(distance[start]),
            end_distance_m: round1(distance[end]),
            elevation_change_m: round1(change),
            average_grade_pct: round1(grade),
            moving_seconds: moving_s.round() as i64,
            vertical_speed_m_per_h: (moving_s >= 1.0)
                .then(|| round1(change.abs() / moving_s * 3600.0)),
            average_hr: (!heart_rates.is_empty())
                .then(|| round1(heart_rates.iter().sum::<f64>() / heart_rates.len() as f64)),
            average_pace_min_per_km: (moving_s >= 1.0)
                .then(|| (moving_s / 60.0 / (run / 1000.0) * 100.0).round() / 100.0),
        });
    }

    Some(WorkoutClimbs {
        method: ClimbMethod::default(),
        segments,
    })
}

/// 按时间居中的滑动平均；采样不等间隔也成立。
fn smooth(points: &[Point]) -> Vec<f64> {
    let half = SMOOTHING_WINDOW_S / 2.0;
    let (mut lo, mut hi) = (0usize, 0usize);
    let mut sum = 0.0;
    let mut out = Vec::with_capacity(points.len());
    for point in points {
        while hi < points.len() && points[hi].t <= point.t + half {
            sum += points[hi].altitude;
            hi += 1;
        }
        while points[lo].t < point.t - half {
            sum -= points[lo].altitude;
            lo += 1;
        }
        out.push(sum / (hi - lo) as f64);
    }
    out
}

/// 回撤阈值找拐点。返回的下标单调递增，相邻两个拐点之间单调上升或下降（容忍小于阈值的回撤）。
fn pivots(altitude: &[f64]) -> Vec<usize> {
    let mut out = Vec::new();
    let (mut high, mut low) = (0usize, 0usize);
    // 0 = 还没定方向，1 = 正在上坡，-1 = 正在下坡；extreme 是这一段到目前的最高（最低）点。
    let mut direction = 0i8;
    let mut extreme = 0usize;
    for index in 1..altitude.len() {
        let value = altitude[index];
        match direction {
            0 => {
                if value > altitude[high] {
                    high = index;
                }
                if value < altitude[low] {
                    low = index;
                }
                if altitude[high] - altitude[low] >= REVERSAL_M {
                    if high > low {
                        out.push(low);
                        direction = 1;
                        extreme = high;
                    } else {
                        out.push(high);
                        direction = -1;
                        extreme = low;
                    }
                }
            }
            1 => {
                if value >= altitude[extreme] {
                    extreme = index;
                } else if altitude[extreme] - value >= REVERSAL_M {
                    out.push(extreme);
                    direction = -1;
                    extreme = index;
                }
            }
            _ => {
                if value <= altitude[extreme] {
                    extreme = index;
                } else if value - altitude[extreme] >= REVERSAL_M {
                    out.push(extreme);
                    direction = 1;
                    extreme = index;
                }
            }
        }
    }
    if direction != 0 {
        out.push(extreme);
    }
    out
}

fn plausible_speed(speed: Option<f64>) -> Option<f64> {
    speed.filter(|value| value.is_finite() && (0.0..=60.0).contains(value))
}

fn plausible_altitude(altitude: Option<f64>) -> Option<f64> {
    altitude.filter(|value| value.is_finite() && (-500.0..=10_000.0).contains(value))
}

fn round1(value: f64) -> f64 {
    (value * 10.0).round() / 10.0
}

#[cfg(test)]
mod tests;
