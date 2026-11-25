//! 睡前日志与睡醒心情：Zepp App 里「睡前做了什么」「醒来感觉怎么样」那两项（manualData，type=sleep）。
//!
//! 规矩：
//!
//! - **一行一个醒来那天**：Zepp 把这一晚记在醒来那天的本地日期下，这里照用，对睡眠时按醒来那天找主睡眠。
//! - **码照存**：`behaviors` 是 Zepp 的 sb 码（"1"–"18"），`mood` 是 sf 码（"1"–"5"）。后端不出文案，
//!   界面按码翻译；导出 / MCP 用 [`behavior_code`] / [`mood_code`] 给英文码。
//! - **本机改过的不被云端冲掉**：本机保存记 `pending_upload = 1`，写回 Zepp 成功才清；同步拉回的云端那份
//!   碰到还没写回的行就跳过。
//! - **问一次就够**：首页打卡只问「昨晚」那一晚，醒来后当天有效；记过、关掉、「这周别问」都不再问。
//! - **睡前因素只比记过的晚上**：有这个标签的晚上 vs 记过但没这个标签的晚上，两边都够
//!   [`FACTOR_MIN_NIGHTS`] 晚才给差值。没记的晚上不知道做没做，不当「没有」用。
use super::Database;
use crate::models::{error::Result, ZeppBridgeError};
use chrono::{DateTime, Duration, Local, NaiveDate, Utc};
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// Zepp sb 码（睡前做了什么）。顺序就是 Zepp 的编号 1–18。
pub const BEHAVIOR_CODES: [&str; 18] = [
    "alcohol",
    "reading",
    "music",
    "late_workout",
    "late_meal",
    "late_work",
    "other",
    "late_screen",
    "gaming",
    "tidying",
    "shower",
    "caffeine",
    "anxiety",
    "stress",
    "unwell",
    "tiredness",
    "late_water",
    "noise",
];
/// Zepp sf 码（醒来感觉）。编号 1–5。
pub const MOOD_CODES: [&str; 5] = ["drained", "sleepy", "calm", "great", "sad"];

/// 醒来后多久之内首页还问「昨晚」。
pub const PROMPT_WINDOW_HOURS: i64 = 18;
/// 主睡眠至少多长才算「那一晚」（午睡不算）。
pub const MAIN_SLEEP_MIN_MINUTES: i64 = 180;
/// 睡前因素：有 / 没有这个标签的晚上，两边各至少几晚才给差值。
pub const FACTOR_MIN_NIGHTS: usize = 3;
/// 睡前因素往回看多少天的记录。
pub const FACTOR_WINDOW_DAYS: i64 = 365;

const SNOOZE_KEY: &str = "sleep_journal_snooze_until";
const DISMISSED_KEY: &str = "sleep_journal_dismissed_date";

/// sb 码 → 英文码（导出、MCP 用）。认不出的给 `None`。
pub fn behavior_code(code: &str) -> Option<&'static str> {
    let index: usize = code.parse().ok()?;
    BEHAVIOR_CODES.get(index.checked_sub(1)?).copied()
}

/// sf 码 → 英文码。
pub fn mood_code(code: &str) -> Option<&'static str> {
    let index: usize = code.parse().ok()?;
    MOOD_CODES.get(index.checked_sub(1)?).copied()
}

fn valid_behavior(code: &str) -> bool {
    behavior_code(code).is_some() && !code.starts_with('0')
}

fn valid_mood(code: &str) -> bool {
    mood_code(code).is_some() && !code.starts_with('0')
}

fn invalid(message: &str) -> ZeppBridgeError {
    ZeppBridgeError::ConfigError(message.into())
}

/// 去重、去掉认不出的码，按编号排好。
fn clean_behaviors(codes: &[String]) -> Vec<String> {
    let mut numbers: Vec<u8> = codes
        .iter()
        .filter(|code| valid_behavior(code))
        .filter_map(|code| code.parse().ok())
        .collect();
    numbers.sort_unstable();
    numbers.dedup();
    numbers.into_iter().map(|n| n.to_string()).collect()
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct SleepJournalEntry {
    /// 醒来那天的本地日期。
    pub date: String,
    /// sb 码，按编号排好。
    pub behaviors: Vec<String>,
    /// sf 码。
    pub mood: Option<String>,
    /// `zepp`（从 Zepp 拉回来的）/ `local`（在这里记的）。
    pub source: String,
    /// 本机改过、还没写回 Zepp。
    pub pending_upload: bool,
    pub updated_at: String,
}

impl SleepJournalEntry {
    /// 什么都没勾、也没选心情：Zepp 里打开过但没记，界面当没记。
    pub fn is_empty(&self) -> bool {
        self.behaviors.is_empty() && self.mood.is_none()
    }

    /// 写回 Zepp 的 `summary`：和 Zepp App 自己写的同一个样子。
    pub fn zepp_summary(&self) -> String {
        let mut summary = serde_json::Map::new();
        summary.insert("sb".into(), serde_json::json!(self.behaviors));
        if let Some(mood) = &self.mood {
            summary.insert("sf".into(), serde_json::json!(mood));
        }
        serde_json::Value::Object(summary).to_string()
    }

    /// 导出 / MCP 用：英文码，不带本机状态。没记的晚上给 `None`。
    pub fn export_json(&self) -> Option<serde_json::Value> {
        if self.is_empty() {
            return None;
        }
        let behaviors: Vec<&str> = self
            .behaviors
            .iter()
            .filter_map(|code| behavior_code(code))
            .collect();
        Some(serde_json::json!({
            "date": self.date,
            "beforeBed": behaviors,
            "wakeMood": self.mood.as_deref().and_then(mood_code),
        }))
    }
}

/// 界面保存时传来的一晚。
#[derive(Debug, Clone, Deserialize)]
pub struct SleepJournalInput {
    pub date: String,
    #[serde(default)]
    pub behaviors: Vec<String>,
    #[serde(default)]
    pub mood: Option<String>,
}

/// 从 Zepp 拉回来的一条（已经解析好 summary）。
#[derive(Debug, Clone, PartialEq)]
pub struct CloudJournalItem {
    pub date: String,
    pub behaviors: Vec<String>,
    pub mood: Option<String>,
}

/// 解析 `GET /v1/user/manualData.json` 的整个响应。不认识的行跳过，不让一条坏数据拖垮整批。
pub fn parse_manual_data(payload: &serde_json::Value) -> Vec<CloudJournalItem> {
    let Some(rows) = payload.get("data").and_then(|data| data.as_array()) else {
        return Vec::new();
    };
    let mut items = Vec::new();
    for row in rows {
        if row.get("type").and_then(|v| v.as_str()) != Some("sleep") {
            continue;
        }
        let Some(date) = row
            .get("date_time")
            .and_then(|v| v.as_str())
            .filter(|text| NaiveDate::parse_from_str(text, "%Y-%m-%d").is_ok())
        else {
            continue;
        };
        let Some(summary) = row
            .get("summary")
            .and_then(|v| v.as_str())
            .and_then(|text| serde_json::from_str::<serde_json::Value>(text).ok())
        else {
            continue;
        };
        let behaviors: Vec<String> = summary
            .get("sb")
            .and_then(|v| v.as_array())
            .map(|codes| {
                codes
                    .iter()
                    .filter_map(|code| match code {
                        serde_json::Value::String(text) => Some(text.clone()),
                        serde_json::Value::Number(n) => Some(n.to_string()),
                        _ => None,
                    })
                    .collect()
            })
            .unwrap_or_default();
        let mood = summary
            .get("sf")
            .and_then(|code| match code {
                serde_json::Value::String(text) => Some(text.clone()),
                serde_json::Value::Number(n) => Some(n.to_string()),
                _ => None,
            })
            .filter(|code| valid_mood(code));
        items.push(CloudJournalItem {
            date: date.to_owned(),
            behaviors: clean_behaviors(&behaviors),
            mood,
        });
    }
    items
}

/// 首页打卡：昨晚那一段主睡眠。
#[derive(Debug, Clone, Serialize)]
pub struct SleepJournalPrompt {
    /// 醒来那天（记到这一天下）。
    pub date: String,
    pub sleep_id: String,
    pub start_time: String,
    pub end_time: String,
    pub duration_minutes: i64,
    pub score: Option<i64>,
}

/// 一个标签的睡前因素：有它的晚上减去记过但没它的晚上。
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct SleepFactor {
    /// sb 码。
    pub behavior: String,
    /// 有这个标签、对得上主睡眠的晚上。
    pub nights: usize,
    /// 记过但没这个标签的晚上。
    pub baseline_nights: usize,
    /// 两边都够数时才有值。
    pub score_delta: Option<f64>,
    pub deep_minutes_delta: Option<f64>,
    pub wake_count_delta: Option<f64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct SleepFactors {
    /// 记过（且对得上主睡眠）的晚上一共多少。
    pub journaled_nights: usize,
    /// 每边至少几晚。
    pub min_nights: usize,
    pub factors: Vec<SleepFactor>,
}

#[derive(Default)]
struct NightReading {
    score: Option<f64>,
    deep: Option<f64>,
    wakes: Option<f64>,
}

fn mean(values: impl Iterator<Item = f64>) -> Option<(f64, usize)> {
    let (sum, count) = values.fold((0.0, 0usize), |(s, c), v| (s + v, c + 1));
    (count > 0).then(|| (sum / count as f64, count))
}

/// 两边都够数时给差值（保留一位小数）。
fn delta(
    with: &[&NightReading],
    without: &[&NightReading],
    pick: fn(&NightReading) -> Option<f64>,
) -> Option<f64> {
    let (a, n) = mean(with.iter().filter_map(|night| pick(night)))?;
    let (b, m) = mean(without.iter().filter_map(|night| pick(night)))?;
    (n >= FACTOR_MIN_NIGHTS && m >= FACTOR_MIN_NIGHTS).then(|| ((a - b) * 10.0).round() / 10.0)
}

impl Database {
    fn journal_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<SleepJournalEntry> {
        let behaviors: String = row.get(1)?;
        Ok(SleepJournalEntry {
            date: row.get(0)?,
            behaviors: serde_json::from_str(&behaviors).unwrap_or_default(),
            mood: row.get(2)?,
            source: row.get(3)?,
            pending_upload: row.get::<_, i64>(4)? != 0,
            updated_at: row.get(5)?,
        })
    }

    /// 一段日期里记过的晚上（含两端），新的在前。
    pub fn sleep_journal_range(&self, from: &str, to: &str) -> Result<Vec<SleepJournalEntry>> {
        let mut statement = self.conn.prepare(
            "SELECT date, behaviors, mood, source, pending_upload, updated_at
               FROM sleep_journal WHERE date >= ?1 AND date <= ?2 ORDER BY date DESC",
        )?;
        let rows = statement.query_map(params![from, to], Self::journal_row)?;
        Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
    }

    pub fn sleep_journal_entry(&self, date: &str) -> Result<Option<SleepJournalEntry>> {
        Ok(self
            .conn
            .query_row(
                "SELECT date, behaviors, mood, source, pending_upload, updated_at
                   FROM sleep_journal WHERE date = ?1",
                [date],
                Self::journal_row,
            )
            .optional()?)
    }

    /// 在这里记一晚（或改）。全清空也照存一行：写回 Zepp 是空的 `sb`，两边都当「没记」。
    pub fn save_sleep_journal(&self, input: &SleepJournalInput) -> Result<SleepJournalEntry> {
        if NaiveDate::parse_from_str(&input.date, "%Y-%m-%d").is_err() {
            return Err(invalid("日期格式不对"));
        }
        if input.behaviors.iter().any(|code| !valid_behavior(code)) {
            return Err(invalid("不认识的睡前标签"));
        }
        let mood = input.mood.as_deref().filter(|code| !code.is_empty());
        if mood.is_some_and(|code| !valid_mood(code)) {
            return Err(invalid("不认识的心情"));
        }
        let behaviors = clean_behaviors(&input.behaviors);
        let now = Utc::now().to_rfc3339();
        self.conn.execute(
            "INSERT INTO sleep_journal(date, behaviors, mood, source, pending_upload, updated_at)
             VALUES(?1, ?2, ?3, 'local', 1, ?4)
             ON CONFLICT(date) DO UPDATE SET
                behaviors = excluded.behaviors, mood = excluded.mood, source = 'local',
                pending_upload = 1, updated_at = excluded.updated_at",
            params![input.date, serde_json::to_string(&behaviors)?, mood, now],
        )?;
        self.sleep_journal_entry(&input.date)?
            .ok_or_else(|| invalid("没有存上"))
    }

    /// 同步拉回的云端那份。本机还没写回的行不动；内容没变的行不改时间。返回改了几行。
    pub fn merge_cloud_sleep_journal(&self, items: &[CloudJournalItem]) -> Result<usize> {
        let now = Utc::now().to_rfc3339();
        let mut changed = 0;
        for item in items {
            let behaviors = serde_json::to_string(&item.behaviors)?;
            changed += self.conn.execute(
                "INSERT INTO sleep_journal(date, behaviors, mood, source, pending_upload, cloud_synced_at, updated_at)
                 VALUES(?1, ?2, ?3, 'zepp', 0, ?4, ?4)
                 ON CONFLICT(date) DO UPDATE SET
                    behaviors = excluded.behaviors, mood = excluded.mood,
                    cloud_synced_at = excluded.cloud_synced_at, updated_at = excluded.updated_at
                 WHERE sleep_journal.pending_upload = 0
                   AND (sleep_journal.behaviors != excluded.behaviors
                        OR sleep_journal.mood IS NOT excluded.mood)",
                params![item.date, behaviors, item.mood, now],
            )?;
        }
        Ok(changed)
    }

    /// 还没写回 Zepp 的晚上，旧的在前。
    pub fn pending_sleep_journal(&self) -> Result<Vec<SleepJournalEntry>> {
        let mut statement = self.conn.prepare(
            "SELECT date, behaviors, mood, source, pending_upload, updated_at
               FROM sleep_journal WHERE pending_upload = 1 ORDER BY date ASC",
        )?;
        let rows = statement.query_map([], Self::journal_row)?;
        Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
    }

    /// 写回成功：只有写回的就是现在这一份时才清标记（写回途中又改了，就留着下次再写）。
    pub fn mark_sleep_journal_uploaded(&self, entry: &SleepJournalEntry) -> Result<bool> {
        let changed = self.conn.execute(
            "UPDATE sleep_journal SET pending_upload = 0, cloud_synced_at = ?2
              WHERE date = ?1 AND updated_at = ?3",
            params![entry.date, Utc::now().to_rfc3339(), entry.updated_at],
        )?;
        Ok(changed > 0)
    }

    /// 醒来那天 `date` 的主睡眠：那天醒来、至少 3 小时，取最长的一段。
    fn main_sleep_ending_on(&self, date: &str) -> Result<Option<SleepJournalPrompt>> {
        Ok(self
            .conn
            .query_row(
                "SELECT sleep_id, start_time, end_time, duration_minutes, score
                   FROM sleep_sessions_shown
                  WHERE date(end_time, 'localtime') = ?1 AND duration_minutes >= ?2
                  ORDER BY duration_minutes DESC LIMIT 1",
                params![date, MAIN_SLEEP_MIN_MINUTES],
                |row| {
                    Ok(SleepJournalPrompt {
                        date: date.to_owned(),
                        sleep_id: row.get(0)?,
                        start_time: row.get(1)?,
                        end_time: row.get(2)?,
                        duration_minutes: row.get(3)?,
                        score: row.get::<_, Option<i64>>(4)?.filter(|score| *score > 0),
                    })
                },
            )
            .optional()?)
    }

    /// 首页现在该不该问「昨晚」：今天醒来的那一段主睡眠、醒来 18 小时内、还没记、没关掉、没「这周别问」。
    pub fn sleep_journal_prompt(&self, now: DateTime<Utc>) -> Result<Option<SleepJournalPrompt>> {
        let today = now.with_timezone(&Local).date_naive();
        let snoozed = self
            .get_app_meta(SNOOZE_KEY)?
            .and_then(|text| NaiveDate::parse_from_str(&text, "%Y-%m-%d").ok())
            .is_some_and(|until| today < until);
        if snoozed {
            return Ok(None);
        }
        let date = today.to_string();
        if self.get_app_meta(DISMISSED_KEY)?.as_deref() == Some(date.as_str()) {
            return Ok(None);
        }
        if self
            .sleep_journal_entry(&date)?
            .is_some_and(|entry| !entry.is_empty())
        {
            return Ok(None);
        }
        let Some(night) = self.main_sleep_ending_on(&date)? else {
            return Ok(None);
        };
        let ended = DateTime::parse_from_rfc3339(&night.end_time)
            .map(|t| t.with_timezone(&Utc))
            .ok();
        if ended.is_some_and(|end| now > end + Duration::hours(PROMPT_WINDOW_HOURS)) {
            return Ok(None);
        }
        Ok(Some(night))
    }

    /// 关掉今天这一问（只今天）。
    pub fn dismiss_sleep_journal_prompt(&self, today: NaiveDate) -> Result<()> {
        self.set_app_meta(DISMISSED_KEY, &today.to_string())
    }

    /// 「这周别问」：到下周一为止。返回截止日。
    pub fn snooze_sleep_journal_prompt(&self, today: NaiveDate) -> Result<NaiveDate> {
        let until = super::workout_feedback::next_monday(today);
        self.set_app_meta(SNOOZE_KEY, &until.to_string())?;
        Ok(until)
    }

    /// 睡前因素：往回一年里记过的晚上，按标签比主睡眠的评分、深睡、夜醒次数。
    pub fn sleep_journal_factors(&self, today: NaiveDate) -> Result<SleepFactors> {
        let from = (today - Duration::days(FACTOR_WINDOW_DAYS)).to_string();
        let entries: Vec<SleepJournalEntry> = self
            .sleep_journal_range(&from, &today.to_string())?
            .into_iter()
            .filter(|entry| !entry.is_empty())
            .collect();
        let mut statement = self.conn.prepare(
            "SELECT score, deep_minutes, wake_count, deep_available
               FROM sleep_sessions_shown
              WHERE date(end_time, 'localtime') = ?1 AND duration_minutes >= ?2
              ORDER BY duration_minutes DESC LIMIT 1",
        )?;
        let mut nights: Vec<(Vec<String>, NightReading)> = Vec::new();
        for entry in entries {
            let reading = statement
                .query_row(params![entry.date, MAIN_SLEEP_MIN_MINUTES], |row| {
                    let deep_known = row.get::<_, Option<i64>>(3)?.unwrap_or(1) != 0;
                    Ok(NightReading {
                        score: row
                            .get::<_, Option<i64>>(0)?
                            .filter(|score| *score > 0)
                            .map(|v| v as f64),
                        deep: deep_known
                            .then(|| row.get::<_, Option<i64>>(1))
                            .transpose()?
                            .flatten()
                            .map(|v| v as f64),
                        wakes: row.get::<_, Option<i64>>(2)?.map(|v| v as f64),
                    })
                })
                .optional()?;
            if let Some(reading) = reading {
                nights.push((entry.behaviors, reading));
            }
        }
        let mut seen: BTreeMap<u8, ()> = BTreeMap::new();
        for (behaviors, _) in &nights {
            for code in behaviors {
                if let Ok(number) = code.parse::<u8>() {
                    seen.insert(number, ());
                }
            }
        }
        let factors = seen
            .keys()
            .map(|number| {
                let code = number.to_string();
                let (with, without): (Vec<_>, Vec<_>) = nights
                    .iter()
                    .partition(|(behaviors, _)| behaviors.contains(&code));
                let with: Vec<&NightReading> = with.iter().map(|(_, r)| r).collect();
                let without: Vec<&NightReading> = without.iter().map(|(_, r)| r).collect();
                SleepFactor {
                    behavior: code,
                    nights: with.len(),
                    baseline_nights: without.len(),
                    score_delta: delta(&with, &without, |n| n.score),
                    deep_minutes_delta: delta(&with, &without, |n| n.deep),
                    wake_count_delta: delta(&with, &without, |n| n.wakes),
                }
            })
            .collect();
        Ok(SleepFactors {
            journaled_nights: nights.len(),
            min_nights: FACTOR_MIN_NIGHTS,
            factors,
        })
    }
}
