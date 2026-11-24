//! 首页建议卡的规则：本地、确定性、模板化。
//!
//! 和每周数据来信用同一套事实引擎（[`super::weekly_report`] 的取样、按日折叠，`weekly` 的基线天数）：
//! 只产出「触发码 + 事实参数」，不写句子——句子由界面按语言写。阈值都在 [`thresholds`]。
//! 不调用模型、不联网；点卡以后做什么（发牌、交给 AI）是界面的事。
//!
//! 发牌要用的原始事实（每次运动的概要、起终点，每一晚的时长与恢复读数）在 [`facts`]。

pub mod facts;

use super::*;
use rusqlite::{params, OptionalExtension};

/// 建议卡的阈值。只在这里定义，界面不再写一份。
pub mod thresholds {
    /// 一次运动至少这么长才算「运动完」「动过」：几分钟的自动识别活动不算。
    pub const MIN_WORKOUT_SECONDS: i64 = 10 * 60;
    /// 「复盘这次」带上同类最近几次。
    pub const REVIEW_SAME_TYPE: usize = 4;
    /// 同类最近几次往回找多少天。
    pub const REVIEW_LOOKBACK_DAYS: i64 = 120;
    /// 昨晚时长低于本人基线的这个比例、并且至少少这么多分钟，才算「睡得差」。
    pub const SHORT_SLEEP_RATIO: f64 = 0.85;
    pub const SHORT_SLEEP_MIN_GAP_MINUTES: f64 = 45.0;
    /// 深睡同理（比例更宽：深睡本来就短、波动大）。
    pub const LOW_DEEP_RATIO: f64 = 0.70;
    pub const LOW_DEEP_MIN_GAP_MINUTES: f64 = 15.0;
    /// 距上次运动超过这么多天算「很久没动」。
    pub const IDLE_DAYS: i64 = 5;
    /// 上次运动之前这么多天里……
    pub const IDLE_HISTORY_DAYS: i64 = 90;
    /// ……至少动过这么多次，才说「很久没动」：从来不运动的人不催。
    pub const IDLE_MIN_HISTORY: i64 = 4;
}

/// 一张建议卡：触发码 + 事实参数。`key` 是「这一次」的身份——同一个 key 关掉以后不再出。
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "code", rename_all = "snake_case")]
pub enum Suggestion {
    /// 今天有一次够长的运动，还没交给过 AI。
    WorkoutDone {
        key: String,
        workout_id: String,
        workout_type: String,
        start_time: String,
        distance_m: Option<f64>,
        duration_s: i64,
        /// 同类最近几次（新 → 旧，不含这一次）。
        same_type_ids: Vec<String>,
    },
    /// 昨晚的时长或深睡明显低于本人近 28 天。
    SleepPoor {
        key: String,
        /// 醒来那天（本地日）。
        night: String,
        duration_min: f64,
        baseline_duration_min: f64,
        deep_min: Option<f64>,
        baseline_deep_min: Option<f64>,
        short: bool,
        deep_low: bool,
        baseline_nights: i64,
    },
    /// 距上次运动超过 [`thresholds::IDLE_DAYS`] 天。
    LongIdle {
        key: String,
        days: i64,
        last_workout_id: String,
        last_workout_type: String,
        last_date: String,
    },
}

/// 有效类型：用户改过就用改过的。
const EFFECTIVE_TYPE: &str = "COALESCE(workout_type_override, workout_type)";
/// 运动时长（秒）：云端给的运动时长优先，没有就用起止时间差。
const DURATION_S: &str = "COALESCE(moving_seconds, CAST(ROUND((julianday(end_time) - julianday(start_time)) * 86400) AS INTEGER))";

impl Database {
    /// 今天该不该出建议卡、出哪几张（按优先级：刚运动完 → 昨晚睡得差 → 很久没动）。
    /// 「同一触发一天内不重复」「关掉」由界面按 `key` 记，这里只报事实。
    pub fn suggestions(&self, today: NaiveDate) -> Result<Vec<Suggestion>> {
        let mut out = Vec::new();
        if let Some(card) = self.suggest_workout_done(today)? {
            out.push(card);
        }
        if let Some(card) = self.suggest_sleep_poor(today)? {
            out.push(card);
        }
        if let Some(card) = self.suggest_long_idle(today)? {
            out.push(card);
        }
        Ok(out)
    }

    fn suggest_workout_done(&self, today: NaiveDate) -> Result<Option<Suggestion>> {
        let day = today.to_string();
        // 今天够长、还没进过任何一次交出去的运动（ai_exchanges.workout_ids 是 JSON 数组）。
        let latest = self
            .conn
            .query_row(
                &format!(
                    "SELECT workout_id, {EFFECTIVE_TYPE}, start_time, distance_meters, {DURATION_S}
                       FROM workouts_visible w
                      WHERE date(start_time, 'localtime') = ?1 AND {DURATION_S} >= ?2
                        AND NOT EXISTS (SELECT 1 FROM ai_exchanges e, json_each(e.workout_ids) j
                                         WHERE j.value = w.workout_id)
                      ORDER BY start_time DESC LIMIT 1"
                ),
                params![day, thresholds::MIN_WORKOUT_SECONDS],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, Option<f64>>(3)?,
                        row.get::<_, i64>(4)?,
                    ))
                },
            )
            .optional()?;
        let Some((workout_id, workout_type, start_time, distance_m, duration_s)) = latest else {
            return Ok(None);
        };
        let since = saturating_days_before(today, thresholds::REVIEW_LOOKBACK_DAYS).to_string();
        let mut statement = self.conn.prepare(&format!(
            "SELECT workout_id FROM workouts_visible
              WHERE {EFFECTIVE_TYPE} = ?1 AND workout_id <> ?2 AND start_time < ?3
                AND date(start_time, 'localtime') >= ?4 AND {DURATION_S} >= ?5
              ORDER BY start_time DESC LIMIT ?6"
        ))?;
        let same_type_ids = statement
            .query_map(
                params![
                    workout_type,
                    workout_id,
                    start_time,
                    since,
                    thresholds::MIN_WORKOUT_SECONDS,
                    thresholds::REVIEW_SAME_TYPE as i64
                ],
                |row| row.get::<_, String>(0),
            )?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(Some(Suggestion::WorkoutDone {
            key: format!("workout_done:{workout_id}"),
            workout_id,
            workout_type,
            start_time,
            distance_m: distance_m.filter(|m| *m > 0.0),
            duration_s,
            same_type_ids,
        }))
    }

    /// 每晚取一段主睡眠（醒来那天时长最长的一段）：(醒来日, 时长, 深睡)。
    fn main_nights(&self, start: NaiveDate, end: NaiveDate) -> Result<Vec<(String, f64, Option<f64>)>> {
        let mut statement = self.conn.prepare(
            "SELECT date(end_time, 'localtime') AS day, MAX(duration_minutes),
                    CASE WHEN COALESCE(deep_available, 1) = 1 THEN deep_minutes END
               FROM sleep_sessions_shown
              WHERE date(end_time, 'localtime') BETWEEN ?1 AND ?2 AND duration_minutes > 0
              GROUP BY day ORDER BY day",
        )?;
        let rows = statement
            .query_map(params![start.to_string(), end.to_string()], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, f64>(1)?,
                    row.get::<_, Option<f64>>(2)?,
                ))
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    fn suggest_sleep_poor(&self, today: NaiveDate) -> Result<Option<Suggestion>> {
        let Some((night, duration, deep)) = self.main_nights(today, today)?.into_iter().next() else {
            return Ok(None);
        };
        // 基线：昨晚之前 28 晚（和周报同一个基线长度与最少天数）。
        let baseline_end = saturating_days_before(today, 1);
        let baseline_start = saturating_days_before(baseline_end, weekly::BASELINE_DAYS - 1);
        let baseline = self.main_nights(baseline_start, baseline_end)?;
        if (baseline.len() as i64) < weekly::MIN_BASELINE_DAYS {
            return Ok(None);
        }
        let durations: Vec<f64> = baseline.iter().map(|(_, minutes, _)| *minutes).collect();
        let deeps: Vec<f64> = baseline.iter().filter_map(|(_, _, deep)| *deep).collect();
        let Some(base_duration) = mean(&durations) else {
            return Ok(None);
        };
        let base_deep = (deeps.len() as i64 >= weekly::MIN_BASELINE_DAYS)
            .then(|| mean(&deeps))
            .flatten();
        let short = duration < base_duration * thresholds::SHORT_SLEEP_RATIO
            && base_duration - duration >= thresholds::SHORT_SLEEP_MIN_GAP_MINUTES;
        let deep_low = match (deep, base_deep) {
            (Some(deep), Some(base)) => {
                deep < base * thresholds::LOW_DEEP_RATIO
                    && base - deep >= thresholds::LOW_DEEP_MIN_GAP_MINUTES
            }
            _ => false,
        };
        if !short && !deep_low {
            return Ok(None);
        }
        Ok(Some(Suggestion::SleepPoor {
            key: format!("sleep_poor:{night}"),
            night,
            duration_min: round1(duration),
            baseline_duration_min: round1(base_duration),
            deep_min: deep.map(round1),
            baseline_deep_min: base_deep.map(round1),
            short,
            deep_low,
            baseline_nights: baseline.len() as i64,
        }))
    }

    fn suggest_long_idle(&self, today: NaiveDate) -> Result<Option<Suggestion>> {
        let last = self
            .conn
            .query_row(
                &format!(
                    "SELECT workout_id, {EFFECTIVE_TYPE}, date(start_time, 'localtime')
                       FROM workouts_visible
                      WHERE {DURATION_S} >= ?1 AND date(start_time, 'localtime') <= ?2
                      ORDER BY start_time DESC LIMIT 1"
                ),
                params![thresholds::MIN_WORKOUT_SECONDS, today.to_string()],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                    ))
                },
            )
            .optional()?;
        let Some((last_workout_id, last_workout_type, last_date)) = last else {
            return Ok(None);
        };
        let Ok(last_day) = NaiveDate::parse_from_str(&last_date, "%Y-%m-%d") else {
            return Ok(None);
        };
        let days = (today - last_day).num_days();
        if days <= thresholds::IDLE_DAYS {
            return Ok(None);
        }
        let history_start = saturating_days_before(last_day, thresholds::IDLE_HISTORY_DAYS);
        let history: i64 = self.conn.query_row(
            &format!(
                "SELECT COUNT(*) FROM workouts_visible
                  WHERE {DURATION_S} >= ?1 AND date(start_time, 'localtime') BETWEEN ?2 AND ?3"
            ),
            params![
                thresholds::MIN_WORKOUT_SECONDS,
                history_start.to_string(),
                last_date
            ],
            |row| row.get(0),
        )?;
        if history < thresholds::IDLE_MIN_HISTORY {
            return Ok(None);
        }
        Ok(Some(Suggestion::LongIdle {
            key: format!("long_idle:{last_workout_id}"),
            days,
            last_workout_id,
            last_workout_type,
            last_date,
        }))
    }
}

#[cfg(test)]
mod tests;
