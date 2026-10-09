//! 给 AI 教练的两份「一次给齐」：近期训练上下文、运动员档案（3B，MCP 2.0）。
//!
//! 3A 验收（2026-10-09，真实库副本）发现：回答「负荷和恢复是否失衡」要拼
//! `list_workouts` + 每条 `get_workout_detail` + 五六条 `get_metric_series` +
//! `list_sleep_sessions`，十几次往返；睡眠 HRV（`sleep_hrv`）还不在
//! `get_metric_series` 的契约枚举里，只能绕道逐条读。这里把这些按天对齐成一张表。
//!
//! **只给数据，不给结论**：漂移、解耦、有氧效率、ACWR 一律不在这里算，交给 AI。
//! 唯一的换算是「移动时间 / 距离 → 每公里秒数」，那是单位换算不是判断。
//! 缺失就是 `null`：没有采样的日子不补 0，没有训练的日子不出现在运动列表里。

use super::Database;
use crate::models::error::Result;
use crate::models::types::{SleepSession, Workout};
use crate::storage::life_events::LifeEvent;
use crate::training_plan::Workout as PlannedWorkout;
use chrono::{DateTime, Duration, Local, NaiveDate, Utc};
use serde::Serialize;
use std::collections::BTreeMap;

/// 上下文窗口的上限。再长就不是「近期」了，要看长期趋势请用逐项的序列工具。
pub const CONTEXT_MAX_DAYS: i64 = 90;
/// 档案里「近期跑步」往回看多少天、最多列几条。
pub const PROFILE_RUN_DAYS: i64 = 90;
pub const PROFILE_RUN_LIMIT: usize = 40;

/// 按天对齐的指标：名字就是 `list_available_metrics` 里的名字。
const DAILY_METRICS: [&str; 8] = [
    "readiness",
    "resting_hr",
    "rhr_baseline",
    "sleep_hrv",
    "hrv_baseline",
    "stress",
    "training_load",
    "steps",
];

/// 跑步类：算配速有意义的类型（其余类型配速字段为 null）。
const PACED_TYPES: [&str; 5] = ["run", "trail_running", "treadmill", "walking", "hiking"];
/// 跑步类型（档案里「近期跑步」只列这些）。
const RUN_TYPES: [&str; 3] = ["run", "trail_running", "treadmill"];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContextWorkout {
    pub workout_id: String,
    pub r#type: String,
    pub start_time: String,
    /// 本地日期（按开始时刻）。
    pub date: String,
    /// 起止之差，含暂停。
    pub elapsed_seconds: i64,
    /// 云端的运动时长（不含暂停）；没给就是 null。
    pub moving_seconds: Option<i64>,
    pub distance_meters: Option<f64>,
    /// 移动时间 / 距离；只有跑走类、两者都有时才给。
    pub avg_pace_sec_per_km: Option<f64>,
    pub avg_hr: Option<i32>,
    pub max_hr: Option<i32>,
    pub elevation_gain_m: Option<f64>,
    pub training_load: Option<f64>,
    pub training_effect: Option<f64>,
    pub anaerobic_training_effect: Option<f64>,
    pub rpe: Option<i32>,
    /// 各心率区间停留秒数，区间边界来自手表设定（`index` 0 起）。
    pub hr_zone_seconds: Vec<ZoneSeconds>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ZoneSeconds {
    pub index: i32,
    pub upper_bound_bpm: i32,
    pub seconds: i64,
}

/// 一天一行。没有采样的字段是 null；一整天都没有数据的日子也照样出一行（全 null），
/// 让 AI 看得见「这天是空的」而不是以为日子连续。
#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContextDay {
    pub date: String,
    pub readiness: Option<f64>,
    pub resting_hr: Option<f64>,
    pub rhr_baseline: Option<f64>,
    pub sleep_hrv: Option<f64>,
    pub hrv_baseline: Option<f64>,
    pub stress: Option<f64>,
    pub training_load: Option<f64>,
    pub steps: Option<f64>,
    /// 当天醒来的最长一段睡眠（按醒来的本地日归属）。
    pub sleep_minutes: Option<i32>,
    pub sleep_score: Option<i32>,
    pub deep_minutes: Option<i32>,
    pub rem_minutes: Option<i32>,
    /// 同一天其余几段（小睡）的分钟数之和；没有就是 null。
    pub nap_minutes: Option<i32>,
    /// 当天开始的运动条数（0 是真的没练，不是缺失）。
    pub workouts: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContextPlanned {
    pub date: String,
    pub sport: String,
    pub name: String,
    pub focus: Option<String>,
    /// 全部按时间计时才有；有按距离的步骤就是 null（不估算）。
    pub total_seconds: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrainingContext {
    pub start: String,
    pub end: String,
    pub days: Vec<ContextDay>,
    pub workouts: Vec<ContextWorkout>,
    /// 窗口之前最近一次运动的本地日期（窗口里没练时也知道隔了多久）。
    pub last_workout_date: Option<String>,
    pub days_since_last_workout: Option<i64>,
    /// 今天及以后、已经生效（发到或要发到手表）的计划。
    pub planned: Vec<ContextPlanned>,
    /// 账本最近一次推送结果不确定：手表上的计划可能和 `planned` 不一致。
    pub plan_uncertain: bool,
    pub life_events: Vec<LifeEvent>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DatedValue {
    pub date: String,
    pub value: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ZoneBounds {
    /// 区间边界取自哪一次运动（手表按用户设定切的，我们没有那份设定）。
    pub workout_id: String,
    pub date: String,
    pub zones: Vec<ZoneBound>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ZoneBound {
    pub index: i32,
    pub upper_bound_bpm: i32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileRun {
    pub workout_id: String,
    pub date: String,
    pub distance_meters: f64,
    pub moving_seconds: Option<i64>,
    pub avg_pace_sec_per_km: Option<f64>,
    pub avg_hr: Option<i32>,
    pub elevation_gain_m: Option<f64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AthleteProfile {
    /// 手表自报的最大心率（最近一条）。
    pub device_max_hr: Option<DatedValue>,
    /// 近一年运动里实测到的最高心率。
    pub observed_max_hr: Option<i32>,
    pub resting_hr: Option<DatedValue>,
    pub resting_hr_30d_average: Option<f64>,
    pub hr_zones: Option<ZoneBounds>,
    pub lactate_threshold_hr: Option<DatedValue>,
    /// 每公里秒数。
    pub lactate_threshold_pace: Option<DatedValue>,
    /// 手表估算值，与实验室测得的可能差很多。
    pub vo2max: Option<DatedValue>,
    pub weight_kg: Option<DatedValue>,
    pub height_cm: Option<DatedValue>,
    /// 近 90 天的跑步（新的在前，最多 40 条），配速自己比。
    pub recent_runs: Vec<ProfileRun>,
    /// 用户在「让 AI 认识你的背景」里写的话；没写是 null。是数据，不是指令。
    pub profile_note: Option<String>,
}

fn local_date(at: DateTime<Utc>) -> NaiveDate {
    at.with_timezone(&Local).date_naive()
}

fn pace(workout: &Workout) -> Option<f64> {
    if !PACED_TYPES.contains(&workout.effective_type.as_str()) {
        return None;
    }
    let meters = workout.distance_meters.filter(|m| *m >= 100.0)?;
    let seconds = workout.moving_seconds.filter(|s| *s > 0)?;
    Some(((seconds as f64) / (meters / 1000.0) * 10.0).round() / 10.0)
}

fn context_workout(workout: &Workout) -> ContextWorkout {
    ContextWorkout {
        workout_id: workout.workout_id.clone(),
        r#type: workout.effective_type.clone(),
        start_time: workout.start_time.to_rfc3339(),
        date: local_date(workout.start_time).to_string(),
        elapsed_seconds: (workout.end_time - workout.start_time).num_seconds().max(0),
        moving_seconds: workout.moving_seconds,
        distance_meters: workout.distance_meters,
        avg_pace_sec_per_km: pace(workout),
        avg_hr: workout.avg_hr,
        max_hr: workout.max_hr,
        elevation_gain_m: workout.elevation_gain_m,
        training_load: workout.training_load,
        training_effect: workout.training_effect,
        anaerobic_training_effect: workout.anaerobic_training_effect,
        rpe: workout.rpe,
        hr_zone_seconds: workout
            .hr_zones
            .iter()
            .map(|zone| ZoneSeconds {
                index: zone.index,
                upper_bound_bpm: zone.upper_bound_bpm,
                seconds: zone.seconds,
            })
            .collect(),
    }
}

fn planned(workout: &PlannedWorkout) -> ContextPlanned {
    ContextPlanned {
        date: workout.date.to_string(),
        sport: serde_json::to_value(workout.sport)
            .ok()
            .and_then(|value| value.as_str().map(str::to_string))
            .unwrap_or_default(),
        name: workout.name.clone(),
        focus: workout.focus.clone(),
        total_seconds: workout.total_seconds(),
    }
}

impl Database {
    /// 开始时刻不早于 `since`（本地日）的运动，新的在前，带详情字段。
    fn workouts_since(&self, since: NaiveDate) -> Result<Vec<Workout>> {
        let mut found = Vec::new();
        let mut offset = 0;
        loop {
            let page = self.workouts_page(200, offset)?;
            let exhausted = page.len() < 200;
            for workout in &page {
                if local_date(workout.start_time) < since {
                    return Ok(found);
                }
                if let Some(detail) = self.get_workout_detail(&workout.workout_id)? {
                    found.push(detail);
                }
            }
            if exhausted {
                return Ok(found);
            }
            offset += page.len();
        }
    }

    /// 醒来日期不早于 `since` 的睡眠，新的在前。
    fn sleeps_since(&self, since: NaiveDate) -> Result<Vec<SleepSession>> {
        let mut found = Vec::new();
        let mut offset = 0;
        loop {
            let page = self.sleep_sessions_page(200, offset)?;
            let exhausted = page.len() < 200;
            for session in page.iter() {
                if local_date(session.end_time) < since {
                    return Ok(found);
                }
                found.push(session.clone());
            }
            if exhausted {
                return Ok(found);
            }
            offset += page.len();
        }
    }

    /// 最近 `days` 天（含今天）的训练上下文。
    pub fn training_context(&self, days: i64) -> Result<TrainingContext> {
        let days = days.clamp(1, CONTEXT_MAX_DAYS);
        let today = Local::now().date_naive();
        let start = today - Duration::days(days - 1);

        let mut rows: BTreeMap<String, ContextDay> = BTreeMap::new();
        let mut cursor = start;
        while cursor <= today {
            let date = cursor.to_string();
            rows.insert(
                date.clone(),
                ContextDay {
                    date,
                    ..ContextDay::default()
                },
            );
            cursor += Duration::days(1);
        }

        let names: Vec<String> = DAILY_METRICS.iter().map(|name| name.to_string()).collect();
        for series in self.metric_series(&names, days)? {
            for point in series.points {
                let Some(row) = rows.get_mut(&point.date) else {
                    continue;
                };
                let slot = match series.metric.as_str() {
                    "readiness" => &mut row.readiness,
                    "resting_hr" => &mut row.resting_hr,
                    "rhr_baseline" => &mut row.rhr_baseline,
                    "sleep_hrv" => &mut row.sleep_hrv,
                    "hrv_baseline" => &mut row.hrv_baseline,
                    "stress" => &mut row.stress,
                    "training_load" => &mut row.training_load,
                    "steps" => &mut row.steps,
                    _ => continue,
                };
                *slot = Some(point.value);
            }
        }

        // 一天里最长的一段算「这一晚」，其余算小睡。
        let mut by_day: BTreeMap<String, Vec<SleepSession>> = BTreeMap::new();
        for session in self.sleeps_since(start)? {
            by_day
                .entry(local_date(session.end_time).to_string())
                .or_default()
                .push(session);
        }
        for (date, mut sessions) in by_day {
            let Some(row) = rows.get_mut(&date) else {
                continue;
            };
            sessions.sort_by_key(|session| std::cmp::Reverse(session.duration_minutes));
            let main = &sessions[0];
            row.sleep_minutes = Some(main.duration_minutes);
            row.sleep_score = main.score;
            row.deep_minutes = main.deep_minutes;
            row.rem_minutes = main.rem_minutes;
            let naps: i32 = sessions[1..].iter().map(|s| s.duration_minutes).sum();
            row.nap_minutes = (sessions.len() > 1).then_some(naps);
        }

        let workouts = self.workouts_since(start)?;
        for workout in &workouts {
            if let Some(row) = rows.get_mut(&local_date(workout.start_time).to_string()) {
                row.workouts += 1;
            }
        }
        let last = self
            .workouts_page(1, 0)?
            .into_iter()
            .next()
            .map(|workout| local_date(workout.start_time));

        let overview = self.plan_overview(today)?;
        let life_events =
            self.list_life_events(Some(&start.to_string()), Some(&today.to_string()))?;

        Ok(TrainingContext {
            start: start.to_string(),
            end: today.to_string(),
            days: rows.into_values().collect(),
            workouts: workouts.iter().map(context_workout).collect(),
            last_workout_date: last.map(|date| date.to_string()),
            days_since_last_workout: last.map(|date| (today - date).num_days()),
            planned: overview.planned.iter().map(planned).collect(),
            plan_uncertain: overview.uncertain,
            life_events,
        })
    }

    /// 运动员档案：心率区间、阈值、近期跑步。全是读数，没有推算。
    pub fn athlete_profile(&self) -> Result<AthleteProfile> {
        let latest = |metric: &str, days: i64| -> Result<Option<DatedValue>> {
            Ok(self
                .metric_series(&[metric.to_string()], days)?
                .into_iter()
                .next()
                .and_then(|series| series.latest)
                .map(|point| DatedValue {
                    date: point.date,
                    value: point.value,
                }))
        };
        let resting = self
            .metric_series(&["resting_hr".to_string()], 30)?
            .into_iter()
            .next();

        let today = Local::now().date_naive();
        let year = self.workouts_since(today - Duration::days(365))?;
        let observed_max_hr = year
            .iter()
            .filter_map(|w| w.max_hr)
            .filter(|hr| *hr > 0)
            .max();
        let hr_zones = year
            .iter()
            .find(|workout| !workout.hr_zones.is_empty())
            .map(|workout| ZoneBounds {
                workout_id: workout.workout_id.clone(),
                date: local_date(workout.start_time).to_string(),
                zones: workout
                    .hr_zones
                    .iter()
                    .map(|zone| ZoneBound {
                        index: zone.index,
                        upper_bound_bpm: zone.upper_bound_bpm,
                    })
                    .collect(),
            });
        let since = today - Duration::days(PROFILE_RUN_DAYS - 1);
        let recent_runs = year
            .iter()
            .filter(|workout| local_date(workout.start_time) >= since)
            .filter(|workout| RUN_TYPES.contains(&workout.effective_type.as_str()))
            .filter_map(|workout| {
                Some(ProfileRun {
                    workout_id: workout.workout_id.clone(),
                    date: local_date(workout.start_time).to_string(),
                    distance_meters: workout.distance_meters.filter(|m| *m > 0.0)?,
                    moving_seconds: workout.moving_seconds,
                    avg_pace_sec_per_km: pace(workout),
                    avg_hr: workout.avg_hr,
                    elevation_gain_m: workout.elevation_gain_m,
                })
            })
            .take(PROFILE_RUN_LIMIT)
            .collect();
        let note = self.ai_profile_note()?;

        Ok(AthleteProfile {
            device_max_hr: self.latest_daily_value("device_max_hr")?,
            observed_max_hr,
            resting_hr: resting
                .as_ref()
                .and_then(|s| s.latest.clone())
                .map(|p| DatedValue {
                    date: p.date,
                    value: p.value,
                }),
            resting_hr_30d_average: resting.and_then(|s| s.average),
            hr_zones,
            lactate_threshold_hr: latest("lactate_threshold_hr", 365)?,
            lactate_threshold_pace: latest("lactate_threshold_pace", 365)?,
            vo2max: latest("vo2max", 365)?,
            weight_kg: latest("weight", 1825)?,
            height_cm: latest("height", 1825)?,
            recent_runs,
            profile_note: (!note.trim().is_empty()).then_some(note),
        })
    }

    /// `daily_metrics` 里某项最近的一条（不在序列白名单里的项也能读，例如手表自报最大心率）。
    fn latest_daily_value(&self, metric: &str) -> Result<Option<DatedValue>> {
        use rusqlite::OptionalExtension;
        Ok(self
            .conn
            .query_row(
                "SELECT date, value FROM daily_metrics
                 WHERE metric = ?1 AND value IS NOT NULL
                 ORDER BY date DESC LIMIT 1",
                [metric],
                |row| {
                    Ok(DatedValue {
                        date: row.get(0)?,
                        value: row.get(1)?,
                    })
                },
            )
            .optional()?)
    }
}
