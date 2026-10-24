//! 跑后打分（批次 7）：推到手表的计划练完了，问一句「感觉怎么样」。
//!
//! 规矩：
//!
//! - **只问对得上的**：同一天、同大类，计划来自账本里真正送达的那一份（[`Database::plan_adherence`]
//!   的口径）。没计划的运动不问——没有可对照的东西，问了也只是打卡。
//! - **不纠缠**：运动结束 48 小时后自动不再问；同时最多一张；「这周别问」到下周一为止；
//!   关掉的那条不再问。不做连续打卡、不记「漏打了几天」。
//! - **达成率只比能比的**：计划按时间写就比时长，按距离写就比距离，混写就不算——不估配速。
//! - 打分属于用户：不挂外键到 `workouts`，重放、保留期清理都不碰。
use super::Database;
use crate::models::{error::Result, ZeppBridgeError};
use crate::storage::plan_adherence::PlannedDay;
use chrono::{DateTime, Datelike, Duration, Local, NaiveDate, Utc};
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// 运动结束后多久还问。
pub const FEEDBACK_WINDOW_HOURS: i64 = 48;
/// 能加的标签。界面按码翻译，后端不出文案。
pub const FEEDBACK_TAGS: [&str; 3] = ["fatigue", "pain", "weather"];
/// 备注最长多少字。
pub const FEEDBACK_NOTE_CHARS: usize = 500;
/// 「这周别问」记到哪天为止（不含）。
const SNOOZE_KEY: &str = "workout_feedback_snooze_until";
/// 因为打分做过的调整。
pub const ADJUSTMENTS: [&str; 1] = ["lighter_10"];

/// 五档的码，给 MCP 和导出看（数据库里存 1–5）。
pub fn rating_code(rating: u8) -> &'static str {
    match rating {
        1 => "too_easy",
        2 => "easy",
        3 => "right",
        4 => "hard",
        _ => "too_hard",
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct FeedbackActual {
    pub workout_id: String,
    pub sport: String,
    pub start_time: String,
    pub end_time: String,
    /// 运动时长（秒）：有移动时长用移动时长，没有用起止时间差。
    pub seconds: Option<u64>,
    pub meters: Option<f64>,
    pub avg_hr: Option<u16>,
}

/// 概览上那张轻卡要的全部东西。
#[derive(Debug, Clone, Serialize)]
pub struct FeedbackPrompt {
    /// 本地日期。
    pub date: String,
    pub planned: PlannedDay,
    pub actual: FeedbackActual,
    /// 实际 / 计划。`None`：两边没有同一种可比的量。
    pub completion: Option<f64>,
    /// `duration` / `distance`。
    pub completion_basis: Option<&'static str>,
    /// 过了这个时刻就不再问（运动结束 + 48 小时）。
    pub expires_at: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct FeedbackInput {
    pub workout_id: String,
    pub rating: u8,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub note: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct WorkoutFeedback {
    pub workout_id: String,
    pub plan_workout_id: Option<i64>,
    /// `rated` / `dismissed`。
    pub state: String,
    pub rating: Option<u8>,
    pub tags: Vec<String>,
    pub note: Option<String>,
    pub adjustment: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    /// 下面几项从运动表和计划账本里带出来，运动行被清掉时为空。
    pub start_time: Option<String>,
    pub sport: Option<String>,
    pub plan_name: Option<String>,
    pub plan_date: Option<String>,
}

fn invalid(message: &str) -> ZeppBridgeError {
    ZeppBridgeError::ConfigError(message.into())
}

fn parse_time(text: &str) -> Option<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(text)
        .ok()
        .map(|t| t.with_timezone(&Utc))
}

/// 下周一（本地日历）。「这周别问」到那天为止。
pub fn next_monday(today: NaiveDate) -> NaiveDate {
    today + Duration::days(7 - i64::from(today.weekday().num_days_from_monday()))
}

pub fn completion(
    planned: &PlannedDay,
    actual: &FeedbackActual,
) -> (Option<f64>, Option<&'static str>) {
    if let (Some(plan), Some(done)) = (planned.seconds, actual.seconds) {
        if plan > 0 {
            return (Some(done as f64 / plan as f64), Some("duration"));
        }
    }
    if let (Some(plan), Some(done)) = (planned.meters, actual.meters) {
        if plan > 0 && done.is_finite() && done >= 0.0 {
            return (Some(done / plan as f64), Some("distance"));
        }
    }
    (None, None)
}

impl Database {
    fn feedback_snoozed(&self, today: NaiveDate) -> Result<bool> {
        Ok(self
            .get_app_meta(SNOOZE_KEY)?
            .and_then(|text| NaiveDate::parse_from_str(&text, "%Y-%m-%d").ok())
            .is_some_and(|until| today < until))
    }

    /// 现在该问哪一条：最近结束、还在 48 小时内、对得上计划、没打过也没关掉的那一条。
    /// 最多一条；这周别问时没有。
    pub fn workout_feedback_prompt(&self, now: DateTime<Utc>) -> Result<Option<FeedbackPrompt>> {
        let today = now.with_timezone(&Local).date_naive();
        if self.feedback_snoozed(today)? {
            return Ok(None);
        }
        let since = now - Duration::hours(FEEDBACK_WINDOW_HOURS);
        let mut statement = self.conn.prepare(
            "SELECT w.workout_id, date(w.start_time,'localtime'), w.start_time, w.end_time,
                    COALESCE(w.workout_type_override, w.workout_type), w.moving_seconds,
                    w.distance_meters, w.avg_hr
               FROM workouts_visible w
              WHERE w.end_time >= ?1 AND w.start_time <= ?2
                AND NOT EXISTS (SELECT 1 FROM workout_feedback f WHERE f.workout_id = w.workout_id)
              ORDER BY w.end_time DESC LIMIT 20",
        )?;
        let rows = statement
            .query_map(params![since.to_rfc3339(), now.to_rfc3339()], |row| {
                Ok((
                    row.get::<_, String>(1)?,
                    FeedbackActual {
                        workout_id: row.get(0)?,
                        start_time: row.get(2)?,
                        end_time: row.get(3)?,
                        sport: row.get(4)?,
                        seconds: row.get::<_, Option<i64>>(5)?.map(|v| v.max(0) as u64),
                        meters: row.get(6)?,
                        avg_hr: row
                            .get::<_, Option<i64>>(7)?
                            .and_then(|v| u16::try_from(v).ok()),
                    },
                ))
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        let mut plans: HashMap<String, Option<PlannedDay>> = HashMap::new();
        for (date, mut actual) in rows {
            let Some(end) = parse_time(&actual.end_time) else {
                continue;
            };
            // 用字符串比较筛过一遍，时区写法不同的行在这里再按时刻核一次。
            if end < since || end > now + Duration::minutes(5) {
                continue;
            }
            if !plans.contains_key(&date) {
                let Ok(day) = NaiveDate::parse_from_str(&date, "%Y-%m-%d") else {
                    continue;
                };
                let planned = self
                    .plan_adherence(day, day)?
                    .into_iter()
                    .next()
                    .and_then(|row| row.planned);
                plans.insert(date.clone(), planned);
            }
            let Some(Some(planned)) = plans.get(&date) else {
                continue;
            };
            if !super::plan_adherence::compatible_sport(planned.sport, &actual.sport) {
                continue;
            }
            if actual.seconds.is_none() {
                actual.seconds = parse_time(&actual.start_time)
                    .map(|start| (end - start).num_seconds())
                    .filter(|s| *s > 0)
                    .map(|s| s as u64);
            }
            let (ratio, basis) = completion(planned, &actual);
            return Ok(Some(FeedbackPrompt {
                date,
                planned: planned.clone(),
                completion: ratio,
                completion_basis: basis,
                expires_at: (end + Duration::hours(FEEDBACK_WINDOW_HOURS)).to_rfc3339(),
                actual,
            }));
        }
        Ok(None)
    }

    /// 这条运动当天、同大类的计划行（打分时由后端自己认，不信界面传来的编号）。
    fn plan_for_workout(&self, workout_id: &str) -> Result<Option<i64>> {
        let row: Option<(String, String)> = self
            .conn
            .query_row(
                "SELECT date(start_time,'localtime'), COALESCE(workout_type_override, workout_type)
                   FROM workouts_visible WHERE workout_id = ?1",
                [workout_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()?;
        let Some((date, sport)) = row else {
            return Err(invalid("找不到这条运动"));
        };
        let Ok(day) = NaiveDate::parse_from_str(&date, "%Y-%m-%d") else {
            return Ok(None);
        };
        Ok(self
            .plan_adherence(day, day)?
            .into_iter()
            .next()
            .and_then(|row| row.planned)
            .filter(|planned| super::plan_adherence::compatible_sport(planned.sport, &sport))
            .map(|planned| planned.plan_workout_id))
    }

    /// 打分（或改分）。标签只收认识的码，备注去掉首尾空白、空的就不存。
    pub fn save_workout_feedback(&self, input: &FeedbackInput) -> Result<()> {
        if !(1..=5).contains(&input.rating) {
            return Err(invalid("评分只能是 1–5"));
        }
        let mut tags: Vec<String> = Vec::new();
        for tag in &input.tags {
            if !FEEDBACK_TAGS.contains(&tag.as_str()) {
                return Err(invalid("不认识的标签"));
            }
            if !tags.contains(tag) {
                tags.push(tag.clone());
            }
        }
        let note = input
            .note
            .as_deref()
            .map(str::trim)
            .filter(|text| !text.is_empty());
        if note.is_some_and(|text| text.chars().count() > FEEDBACK_NOTE_CHARS) {
            return Err(invalid("备注太长"));
        }
        let plan = self.plan_for_workout(&input.workout_id)?;
        let now = Utc::now().to_rfc3339();
        self.conn.execute(
            "INSERT INTO workout_feedback
                (workout_id, plan_workout_id, state, rating, tags, note, created_at, updated_at)
             VALUES(?1, ?2, 'rated', ?3, ?4, ?5, ?6, ?6)
             ON CONFLICT(workout_id) DO UPDATE SET
                plan_workout_id = COALESCE(workout_feedback.plan_workout_id, excluded.plan_workout_id),
                state = 'rated', rating = excluded.rating, tags = excluded.tags,
                note = excluded.note, updated_at = excluded.updated_at",
            params![
                input.workout_id,
                plan,
                i64::from(input.rating),
                serde_json::to_string(&tags)?,
                note,
                now
            ],
        )?;
        Ok(())
    }

    /// 没打分就关掉：这条不再问。已经打过分的不动。
    pub fn dismiss_workout_feedback(&self, workout_id: &str) -> Result<()> {
        let plan = self.plan_for_workout(workout_id)?;
        let now = Utc::now().to_rfc3339();
        self.conn.execute(
            "INSERT INTO workout_feedback(workout_id, plan_workout_id, state, created_at, updated_at)
             VALUES(?1, ?2, 'dismissed', ?3, ?3)
             ON CONFLICT(workout_id) DO NOTHING",
            params![workout_id, plan, now],
        )?;
        Ok(())
    }

    /// 记下因为这次打分对计划做了什么（目前只有「下次同类减 10%」起草了）。
    pub fn mark_feedback_adjustment(&self, workout_id: &str, adjustment: &str) -> Result<()> {
        if !ADJUSTMENTS.contains(&adjustment) {
            return Err(invalid("不认识的调整"));
        }
        let changed = self.conn.execute(
            "UPDATE workout_feedback SET adjustment = ?2, updated_at = ?3
              WHERE workout_id = ?1 AND state = 'rated'",
            params![workout_id, adjustment, Utc::now().to_rfc3339()],
        )?;
        if changed == 0 {
            return Err(invalid("这条运动还没有打分"));
        }
        Ok(())
    }

    /// 「这周别问」：到下周一为止。返回截止日。
    pub fn snooze_workout_feedback(&self, today: NaiveDate) -> Result<NaiveDate> {
        let until = next_monday(today);
        self.set_app_meta(SNOOZE_KEY, &until.to_string())?;
        Ok(until)
    }

    pub fn workout_feedback(&self, workout_id: &str) -> Result<Option<WorkoutFeedback>> {
        Ok(self
            .workout_feedback_rows(Some(workout_id), false, 1)?
            .into_iter()
            .next())
    }

    /// 打过的分，新的在前。不含「关掉没打」的。
    pub fn workout_feedback_history(&self, limit: usize) -> Result<Vec<WorkoutFeedback>> {
        self.workout_feedback_rows(None, true, limit.clamp(1, 500))
    }

    fn workout_feedback_rows(
        &self,
        workout_id: Option<&str>,
        rated_only: bool,
        limit: usize,
    ) -> Result<Vec<WorkoutFeedback>> {
        let mut statement = self.conn.prepare(
            "SELECT f.workout_id, f.plan_workout_id, f.state, f.rating, f.tags, f.note,
                    f.adjustment, f.created_at, f.updated_at, w.start_time,
                    COALESCE(w.workout_type_override, w.workout_type), p.workout, p.workout_date
               FROM workout_feedback f
               LEFT JOIN workouts_visible w ON w.workout_id = f.workout_id
               LEFT JOIN training_plan_workouts p ON p.id = f.plan_workout_id
              WHERE (?1 IS NULL OR f.workout_id = ?1) AND (?2 = 0 OR f.state = 'rated')
                AND NOT EXISTS (SELECT 1 FROM workout_local_state s
                                WHERE s.workout_id = f.workout_id AND s.hidden = 1)
              ORDER BY COALESCE(w.start_time, f.created_at) DESC LIMIT ?3",
        )?;
        let rows = statement.query_map(
            params![workout_id, i64::from(rated_only), limit as i64],
            |row| {
                let plan: Option<String> = row.get(11)?;
                Ok(WorkoutFeedback {
                    workout_id: row.get(0)?,
                    plan_workout_id: row.get(1)?,
                    state: row.get(2)?,
                    rating: row.get::<_, Option<i64>>(3)?.map(|v| v as u8),
                    tags: serde_json::from_str(&row.get::<_, String>(4)?).unwrap_or_default(),
                    note: row.get(5)?,
                    adjustment: row.get(6)?,
                    created_at: row.get(7)?,
                    updated_at: row.get(8)?,
                    start_time: row.get(9)?,
                    sport: row.get(10)?,
                    plan_name: plan
                        .and_then(|text| {
                            serde_json::from_str::<crate::training_plan::Workout>(&text).ok()
                        })
                        .map(|workout| workout.name),
                    plan_date: row.get(12)?,
                })
            },
        )?;
        Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
    }
}
