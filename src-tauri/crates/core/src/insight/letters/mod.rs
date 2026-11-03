//! 信匣里的数据来信（批次 7）：每周数据来信、时间胶囊、那年今天。
//!
//! 三种都只陈述事实，不生成自然语言，也不和任何人群比较——和本地周报同一条规矩。
//! 每周来信和胶囊是写下那一刻的快照，存进 `data_letters`（v44）：以后补拉、重解析
//! 改了派生数据，旧信也不变。那年今天是现算的，本来就全在本机。
//!
//! 用户排除的指标（[`crate::storage::metric_prefs`]）在读出时去掉，不在写入时去掉：
//! 恢复参与分析后旧信里的那一项会回来。

use super::*;
use crate::models::error::ZeppBridgeError;
use chrono::Datelike;
use rusqlite::{params, OptionalExtension};

/// 胶囊里写给将来的话，上限和回信一样。
pub const CAPSULE_NOTE_MAX_CHARS: usize = 1000;
/// 胶囊最远能封多久。
pub const CAPSULE_MAX_YEARS: i32 = 10;
/// 胶囊快照取写下那天往前多少天的平均。
pub const SNAPSHOT_DAYS: i64 = 28;
/// 那年今天最多回看几年。
pub const ON_THIS_DAY_MAX_YEARS: i32 = 10;

/// 胶囊快照里的几项：写下时和开封时各取一份，摆在一起看。
/// `workout_count` 按窗口折成「每 7 天几次」（和周报同一套算法）。
const SNAPSHOT_METRICS: [(&str, &str); 6] = [
    ("resting_hr", "bpm"),
    ("hrv", "ms"),
    ("sleep_duration", "min"),
    ("steps", "steps"),
    ("workout_count", "per_week"),
    ("training_load", "load"),
];

const ON_THIS_DAY_METRICS: [(&str, &str); 3] = [
    ("steps", "steps"),
    ("sleep_duration", "min"),
    ("resting_hr", "bpm"),
];

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SnapshotValue {
    pub metric: String,
    pub unit: String,
    /// 窗口里有数的那些天的平均；没有就是 `None`，不是 0。
    pub value: Option<f64>,
    pub days: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct LetterSnapshot {
    pub start: String,
    pub end: String,
    pub values: Vec<SnapshotValue>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
struct CapsuleBody {
    written: Option<LetterSnapshot>,
    #[serde(default)]
    opened: Option<LetterSnapshot>,
}

/// 信匣里的一封数据来信。胶囊没到日子时 `note` 是 `None`：原文在库里，但界面拿不到。
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct DataLetter {
    pub id: i64,
    pub kind: String,
    pub written_at: String,
    pub open_on: Option<String>,
    pub opened_at: Option<String>,
    pub sealed: bool,
    pub note: Option<String>,
    pub weekly: Option<WeeklyReport>,
    pub written_snapshot: Option<LetterSnapshot>,
    pub opened_snapshot: Option<LetterSnapshot>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct OnThisDayWorkout {
    pub workout_id: String,
    pub workout_type: String,
    pub start_time: String,
    pub distance_meters: Option<f64>,
    pub duration_seconds: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct OnThisDayYear {
    pub date: String,
    pub years_ago: i32,
    pub values: Vec<SnapshotValue>,
    pub workouts: Vec<OnThisDayWorkout>,
}

/// 最近一个已经过完的周（周一到周日）的最后一天。今天是周日时那周还没完，取上周日。
pub fn last_completed_week_end(today: NaiveDate) -> NaiveDate {
    let back = match today.weekday().num_days_from_sunday() {
        0 => 7,
        n => n,
    };
    today - Duration::days(i64::from(back))
}

/// 往前推若干年的同一天；2 月 29 日落到平年的 2 月 28 日。
fn same_day_years_ago(today: NaiveDate, years: i32) -> Option<NaiveDate> {
    let year = today.year() - years;
    today
        .with_year(year)
        .or_else(|| NaiveDate::from_ymd_opt(year, today.month(), 28))
}

fn invalid(message: &str) -> ZeppBridgeError {
    ZeppBridgeError::ConfigError(message.into())
}

impl Database {
    /// 上一周的来信还没寄就寄一封。那周一天数据都没有就不寄（没有可说的事实）。
    /// 返回这次有没有寄。
    pub fn ensure_weekly_letter(&self, today: NaiveDate, now: DateTime<Utc>) -> Result<bool> {
        let week_end = last_completed_week_end(today);
        let key = format!("weekly:{week_end}");
        let exists: bool = self.conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM data_letters WHERE period_key = ?1)",
            [&key],
            |row| row.get(0),
        )?;
        if exists {
            return Ok(false);
        }
        let report = self.weekly_report_for_day(week_end, now)?;
        if report.facts.iter().all(|fact| fact.value.is_none()) {
            return Ok(false);
        }
        self.conn.execute(
            "INSERT OR IGNORE INTO data_letters(kind, period_key, written_at, body)
             VALUES('weekly', ?1, ?2, ?3)",
            params![key, now.to_rfc3339(), serde_json::to_string(&report)?],
        )?;
        Ok(true)
    }

    /// 写一个时间胶囊：一段写给将来的话 + 写下那天前 28 天的快照。`open_on` 之前打不开。
    pub fn seal_capsule(
        &self,
        note: &str,
        open_on: NaiveDate,
        today: NaiveDate,
        now: DateTime<Utc>,
    ) -> Result<i64> {
        let note = note.trim();
        if note.is_empty() || note.chars().count() > CAPSULE_NOTE_MAX_CHARS {
            return Err(invalid("胶囊内容为空或太长"));
        }
        let latest = same_day_years_ago(today, -CAPSULE_MAX_YEARS).unwrap_or(today);
        if open_on <= today || open_on > latest {
            return Err(invalid("开封日期必须在今天之后、十年以内"));
        }
        let body = CapsuleBody {
            written: Some(self.letter_snapshot(today)?),
            opened: None,
        };
        self.conn.execute(
            "INSERT INTO data_letters(kind, written_at, open_on, note, body)
             VALUES('capsule', ?1, ?2, ?3, ?4)",
            params![
                now.to_rfc3339(),
                open_on.to_string(),
                note,
                serde_json::to_string(&body)?
            ],
        )?;
        Ok(self.conn.last_insert_rowid())
    }

    /// 开封一个到期的胶囊：记下开封时间和那一刻的快照。已经开过的原样返回。
    pub fn open_capsule(
        &self,
        id: i64,
        today: NaiveDate,
        now: DateTime<Utc>,
    ) -> Result<DataLetter> {
        let row: Option<(Option<String>, Option<String>, String)> = self
            .conn
            .query_row(
                "SELECT open_on, opened_at, body FROM data_letters WHERE id = ?1 AND kind = 'capsule'",
                [id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .optional()?;
        let Some((open_on, opened_at, body)) = row else {
            return Err(invalid("没有这个胶囊"));
        };
        if opened_at.is_none() {
            let due = open_on
                .as_deref()
                .and_then(|date| NaiveDate::parse_from_str(date, "%Y-%m-%d").ok())
                .is_some_and(|date| date <= today);
            if !due {
                return Err(invalid("胶囊还没到开封的日子"));
            }
            let mut body: CapsuleBody = serde_json::from_str(&body).unwrap_or_default();
            body.opened = Some(self.letter_snapshot(today)?);
            self.conn.execute(
                "UPDATE data_letters SET opened_at = ?2, body = ?3 WHERE id = ?1",
                params![id, now.to_rfc3339(), serde_json::to_string(&body)?],
            )?;
        }
        self.data_letters()?
            .into_iter()
            .find(|letter| letter.id == id)
            .ok_or_else(|| invalid("没有这个胶囊"))
    }

    /// 全部数据来信，新的在前；去掉用户排除的指标。
    pub fn data_letters(&self) -> Result<Vec<DataLetter>> {
        let excluded = self.excluded_metrics()?;
        let keep = |metric: &str| !excluded.iter().any(|item| item == metric);
        let mut stmt = self.conn.prepare(
            "SELECT id, kind, written_at, open_on, opened_at, note, body
             FROM data_letters ORDER BY written_at DESC, id DESC",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, Option<String>>(3)?,
                row.get::<_, Option<String>>(4)?,
                row.get::<_, String>(5)?,
                row.get::<_, String>(6)?,
            ))
        })?;
        let mut letters = Vec::new();
        for row in rows {
            let (id, kind, written_at, open_on, opened_at, note, body) = row?;
            let mut letter = DataLetter {
                id,
                kind: kind.clone(),
                written_at,
                open_on: open_on.clone(),
                opened_at: opened_at.clone(),
                sealed: false,
                note: None,
                weekly: None,
                written_snapshot: None,
                opened_snapshot: None,
            };
            if kind == "weekly" {
                let Ok(mut report) = serde_json::from_str::<WeeklyReport>(&body) else {
                    continue;
                };
                report.facts.retain(|fact| keep(&fact.metric));
                letter.weekly = Some(report);
            } else {
                let body: CapsuleBody = serde_json::from_str(&body).unwrap_or_default();
                let strip = |snapshot: Option<LetterSnapshot>| {
                    snapshot.map(|mut snapshot| {
                        snapshot.values.retain(|value| keep(&value.metric));
                        snapshot
                    })
                };
                letter.sealed = opened_at.is_none();
                // 没开封的只告诉界面「封着、哪天能开」，话和快照都不给。
                if !letter.sealed {
                    letter.note = Some(note);
                    letter.written_snapshot = strip(body.written);
                    letter.opened_snapshot = strip(body.opened);
                }
            }
            letters.push(letter);
        }
        Ok(letters)
    }

    /// 那年今天：往年同一天的步数、睡眠、静息心率和运动。一点数据都没有的年份不返回。
    pub fn on_this_day(&self, today: NaiveDate) -> Result<Vec<OnThisDayYear>> {
        let excluded = self.excluded_metrics()?;
        let mut years = Vec::new();
        for years_ago in 1..=ON_THIS_DAY_MAX_YEARS {
            let Some(date) = same_day_years_ago(today, years_ago) else {
                continue;
            };
            let mut values = Vec::new();
            for (metric, unit) in ON_THIS_DAY_METRICS {
                if excluded.iter().any(|item| item == metric) {
                    continue;
                }
                let samples = self.weekly_samples(metric, date, date)?;
                if let Some(value) = mean(&samples.values) {
                    values.push(SnapshotValue {
                        metric: metric.into(),
                        unit: unit.into(),
                        value: Some(round1(value)),
                        days: samples.day_count as i64,
                    });
                }
            }
            let workouts = self.workouts_on(date)?;
            if values.is_empty() && workouts.is_empty() {
                continue;
            }
            years.push(OnThisDayYear {
                date: date.to_string(),
                years_ago,
                values,
                workouts,
            });
        }
        Ok(years)
    }

    fn workouts_on(&self, date: NaiveDate) -> Result<Vec<OnThisDayWorkout>> {
        let mut stmt = self.conn.prepare(
            "SELECT workout_id, COALESCE(workout_type_override, workout_type), start_time,
                    distance_meters,
                    CAST((julianday(end_time) - julianday(start_time)) * 86400 AS INTEGER)
             FROM workouts_visible
             WHERE date(start_time, 'localtime') = ?1
             ORDER BY start_time",
        )?;
        let rows = stmt.query_map([date.to_string()], |row| {
            Ok(OnThisDayWorkout {
                workout_id: row.get(0)?,
                workout_type: row.get(1)?,
                start_time: row.get(2)?,
                distance_meters: row.get(3)?,
                duration_seconds: row.get::<_, Option<i64>>(4)?.filter(|value| *value > 0),
            })
        })?;
        Ok(rows.collect::<std::result::Result<_, _>>()?)
    }

    /// 截至 `end`（含）的 28 天快照。
    fn letter_snapshot(&self, end: NaiveDate) -> Result<LetterSnapshot> {
        let start = saturating_days_before(end, SNAPSHOT_DAYS - 1);
        let mut values = Vec::new();
        for (metric, unit) in SNAPSHOT_METRICS {
            let samples = self.weekly_samples(metric, start, end)?;
            values.push(SnapshotValue {
                metric: metric.into(),
                unit: unit.into(),
                value: mean(&samples.values).map(round1),
                days: samples.day_count as i64,
            });
        }
        Ok(LetterSnapshot {
            start: start.to_string(),
            end: end.to_string(),
            values,
        })
    }
}

#[cfg(test)]
mod tests;
