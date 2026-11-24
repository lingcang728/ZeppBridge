//! 发牌要用的原始事实：每次运动的概要和起终点、每一晚的时长与恢复读数，以及几次运动的小图。
//!
//! 只是事实，不判断——「同一路线」「刷新 PR」「比赛」「恢复异常」都在界面的发牌规则里
//! （`src/lib/cards/hands/`，纯函数，有测试）。坐标只留四位小数（约 10 米），够比路线、画缩略图；
//! 这些只在本机界面里用，不进导出、不写日志。

use super::*;
use rusqlite::params;

/// 发牌最多往回看多少天。
pub const MAX_FACT_DAYS: i64 = 3650;
/// 一次最多给几次运动画小图。
pub const MAX_LINE_WORKOUTS: usize = 40;
/// 轨迹缩略取多少个点、心率小线取多少个点。
pub const ROUTE_POINTS: i64 = 24;
pub const HR_POINTS: i64 = 32;

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct HandWorkout {
    pub workout_id: String,
    pub workout_type: String,
    pub start_time: String,
    /// 本地日。
    pub date: String,
    pub distance_m: Option<f64>,
    pub duration_s: i64,
    pub avg_hr: Option<f64>,
    pub training_load: Option<f64>,
    /// 比赛记录里挂了这一次。
    pub race: bool,
    /// 轨迹起点、终点 `[纬度, 经度]`，没有轨迹就是 `None`。
    pub start: Option<[f64; 2]>,
    pub end: Option<[f64; 2]>,
}

/// 一晚（按醒来那天）：睡眠取主睡眠那一段；HRV、静息心率取那天的日度值。哪一项没有就是 `None`。
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct HandNight {
    pub date: String,
    pub duration_min: Option<f64>,
    pub deep_min: Option<f64>,
    pub hrv: Option<f64>,
    pub resting_hr: Option<f64>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct HandFacts {
    pub today: String,
    /// 旧 → 新。
    pub workouts: Vec<HandWorkout>,
    /// 旧 → 新。
    pub nights: Vec<HandNight>,
}

/// 一次运动的小图：轨迹缩略（`[纬度, 经度]`）和心率小线（bpm），各自没有就是空的。
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct HandLines {
    pub workout_id: String,
    pub route: Vec<[f64; 2]>,
    pub hr: Vec<f64>,
}

fn round4(value: f64) -> f64 {
    (value * 10_000.0).round() / 10_000.0
}

fn point(lat: Option<f64>, lng: Option<f64>) -> Option<[f64; 2]> {
    match (lat, lng) {
        (Some(lat), Some(lng)) if lat.is_finite() && lng.is_finite() => {
            Some([round4(lat), round4(lng)])
        }
        _ => None,
    }
}

impl Database {
    /// 最近 `days` 天（含今天）的运动和每一晚。
    pub fn hand_facts(&self, today: NaiveDate, days: i64) -> Result<HandFacts> {
        let days = days.clamp(1, MAX_FACT_DAYS);
        let start = saturating_days_before(today, days - 1).to_string();
        let end = today.to_string();
        let mut statement = self.conn.prepare(&format!(
            "SELECT w.workout_id, {EFFECTIVE_TYPE}, w.start_time, date(w.start_time, 'localtime'),
                    w.distance_meters, {DURATION_S}, w.avg_hr, w.training_load,
                    EXISTS (SELECT 1 FROM races r WHERE r.workout_id = w.workout_id),
                    (SELECT latitude FROM route_points p WHERE p.workout_id = w.workout_id ORDER BY timestamp LIMIT 1),
                    (SELECT longitude FROM route_points p WHERE p.workout_id = w.workout_id ORDER BY timestamp LIMIT 1),
                    (SELECT latitude FROM route_points p WHERE p.workout_id = w.workout_id ORDER BY timestamp DESC LIMIT 1),
                    (SELECT longitude FROM route_points p WHERE p.workout_id = w.workout_id ORDER BY timestamp DESC LIMIT 1)
               FROM workouts_visible w
              WHERE date(w.start_time, 'localtime') BETWEEN ?1 AND ?2
              ORDER BY w.start_time"
        ))?;
        let workouts = statement
            .query_map(params![start, end], |row| {
                Ok(HandWorkout {
                    workout_id: row.get(0)?,
                    workout_type: row.get(1)?,
                    start_time: row.get(2)?,
                    date: row.get(3)?,
                    distance_m: row.get::<_, Option<f64>>(4)?.filter(|m| *m > 0.0),
                    duration_s: row.get::<_, Option<i64>>(5)?.unwrap_or(0).max(0),
                    avg_hr: row.get::<_, Option<f64>>(6)?.filter(|v| *v > 0.0),
                    training_load: row.get::<_, Option<f64>>(7)?,
                    race: row.get(8)?,
                    start: point(row.get(9)?, row.get(10)?),
                    end: point(row.get(11)?, row.get(12)?),
                })
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;

        let mut nights: std::collections::BTreeMap<String, HandNight> = Default::default();
        let blank = |date: &str| HandNight {
            date: date.to_string(),
            duration_min: None,
            deep_min: None,
            hrv: None,
            resting_hr: None,
        };
        let (from, to) = (saturating_days_before(today, days - 1), today);
        for (date, duration, deep) in self.main_nights(from, to)? {
            let night = nights.entry(date.clone()).or_insert_with(|| blank(&date));
            night.duration_min = Some(round1(duration));
            night.deep_min = deep.map(round1);
        }
        // HRV：夜间 HRV 优先，再退到另外两个名字（和周报一样，漏一个就等于说那些天没有）。
        for (metrics, is_hrv) in [
            (&["sleep_hrv", "hrv", "hrv_rmssd"][..], true),
            (&["resting_hr"][..], false),
        ] {
            for metric in metrics {
                let samples = self.collect_samples(
                    &format!(
                        "SELECT date, value, source_scope FROM daily_metrics
                          WHERE metric = '{metric}' AND date BETWEEN ?1 AND ?2"
                    ),
                    &from.to_string(),
                    &to.to_string(),
                )?;
                for (date, value) in samples.dates.iter().zip(samples.values) {
                    let night = nights.entry(date.clone()).or_insert_with(|| blank(date));
                    let slot = if is_hrv {
                        &mut night.hrv
                    } else {
                        &mut night.resting_hr
                    };
                    if slot.is_none() {
                        *slot = Some(round1(value));
                    }
                }
            }
        }
        Ok(HandFacts {
            today: today.to_string(),
            workouts,
            nights: nights.into_values().collect(),
        })
    }

    /// 几次运动的小图（最多 [`MAX_LINE_WORKOUTS`] 次）：轨迹和心率各均匀取若干个点。
    pub fn hand_lines(&self, workout_ids: &[String]) -> Result<Vec<HandLines>> {
        let ids: Vec<&String> = workout_ids.iter().take(MAX_LINE_WORKOUTS).collect();
        let mut out: Vec<HandLines> = ids
            .iter()
            .map(|id| HandLines {
                workout_id: (*id).clone(),
                route: Vec::new(),
                hr: Vec::new(),
            })
            .collect();
        let mut route = self.conn.prepare(
            "SELECT latitude, longitude FROM (
                 SELECT latitude, longitude,
                        row_number() OVER (ORDER BY timestamp) AS rn, count(*) OVER () AS n
                   FROM route_points WHERE workout_id = ?1)
              WHERE rn = 1 OR rn = n OR (rn - 1) % MAX(1, n / ?2) = 0",
        )?;
        let mut hr = self.conn.prepare(
            "SELECT AVG(heart_rate) FROM (
                 SELECT heart_rate, ntile(?2) OVER (ORDER BY timestamp) AS bucket
                   FROM workout_samples WHERE workout_id = ?1 AND heart_rate > 0)
              GROUP BY bucket ORDER BY bucket",
        )?;
        for line in &mut out {
            line.route = route
                .query_map(params![line.workout_id, ROUTE_POINTS], |row| {
                    Ok(point(row.get(0)?, row.get(1)?))
                })?
                .filter_map(|row| row.ok().flatten())
                .collect();
            line.hr = hr
                .query_map(params![line.workout_id, HR_POINTS], |row| {
                    row.get::<_, Option<f64>>(0)
                })?
                .filter_map(|row| row.ok().flatten().map(round1))
                .collect();
        }
        Ok(out)
    }
}
