//! unstrap 备份里的健康样本（计划 C2 二期）。逐表的口径见 `docs/development/unstrap-mapping.md`。
//!
//! 只读、只挑：心率（带子存的历史，一分钟一条）、单点血氧、静息心率（按 unstrap 记的本地日）、
//! 睡眠（不含小睡、不含分数）。这里只管把表读成结构，「本机已有就不收」在落库那边做
//! （`storage::import_health`）。

use std::collections::{BTreeMap, HashMap};
use std::io::{Read, Seek};

use chrono::{DateTime, NaiveDate, Utc};

use super::strava::entry_name;
use super::unstrap::{epoch, read_table, Table};
use crate::models::{SleepSession, SleepStageSlice, SourceScope};

/// 导入的健康样本的设备号：和 Zepp 的设备分开，唯一键不会撞。
pub const UNSTRAP_DEVICE: &str = "unstrap";

/// 一条逐点样本。
#[derive(Debug, Clone, PartialEq)]
pub struct HealthSample {
    pub metric: &'static str,
    pub unit: &'static str,
    pub timestamp: DateTime<Utc>,
    pub value: f64,
}

/// 一条按天的值，`date` 是本地日（`YYYY-MM-DD`）。
#[derive(Debug, Clone, PartialEq)]
pub struct HealthDaily {
    pub metric: &'static str,
    pub unit: &'static str,
    pub date: String,
    pub value: f64,
}

#[derive(Debug, Clone, Default)]
pub struct ParsedHealth {
    pub samples: Vec<HealthSample>,
    pub daily: Vec<HealthDaily>,
    pub sleeps: Vec<SleepSession>,
}

impl ParsedHealth {
    pub fn is_empty(&self) -> bool {
        self.samples.is_empty() && self.daily.is_empty() && self.sleeps.is_empty()
    }
}

/// 读一张表；包里有这张表却读不出来（太大、不是 UTF-8）算一条读不出。
fn load<R: Read + Seek>(
    archive: &mut zip::ZipArchive<R>,
    file: &str,
    unreadable: &mut usize,
) -> Option<Table> {
    entry_name(archive, |name| name == file)?;
    let table = read_table(archive, file);
    if table.is_none() {
        *unreadable += 1;
    }
    table
}

fn point_samples(
    table: Option<Table>,
    metric: &'static str,
    unit: &'static str,
    column: &str,
    range: std::ops::RangeInclusive<f64>,
    keep: impl Fn(&Table, &[String]) -> bool,
    out: &mut Vec<HealthSample>,
) -> usize {
    let Some(t) = table else { return 0 };
    let mut unreadable = 0;
    for row in &t.rows {
        if !keep(&t, row) {
            continue;
        }
        let (Some(timestamp), Some(value)) = (
            t.int(row, "epoch").and_then(epoch),
            t.float(row, column).filter(|v| range.contains(v)),
        ) else {
            unreadable += 1;
            continue;
        };
        out.push(HealthSample {
            metric,
            unit,
            timestamp,
            value,
        });
    }
    unreadable
}

fn stage_name(text: &str) -> &'static str {
    match text {
        "awake" | "0" => "awake",
        "light" | "1" => "light",
        "deep" | "2" => "deep",
        "rem" | "3" => "rem",
        _ => "unknown",
    }
}

fn instant(text: Option<&str>) -> Option<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(text?)
        .ok()
        .map(|t| t.with_timezone(&Utc))
}

/// 读备份里的健康样本。返回读出来的和读不出的行数。
pub fn parse_unstrap_health<R: Read + Seek>(
    archive: &mut zip::ZipArchive<R>,
) -> (ParsedHealth, usize) {
    let mut unreadable = 0;
    let mut health = ParsedHealth::default();

    // 心率：只收带子存的历史（source = 0，缺列的老备份都是历史）。
    let heart = load(archive, "heart_rate.csv", &mut unreadable);
    unreadable += point_samples(
        heart,
        "heart_rate",
        "bpm",
        "bpm",
        25.0..=250.0,
        |t, row| t.int(row, "source").unwrap_or(0) == 0,
        &mut health.samples,
    );
    let spo2 = load(archive, "spo2.csv", &mut unreadable);
    unreadable += point_samples(
        spo2,
        "spo2",
        "%",
        "percent",
        50.0..=100.0,
        |_, _| true,
        &mut health.samples,
    );

    // 静息心率：按 unstrap 自己记的本地日；没有 date 列的老备份整张跳过，不拿时区猜。
    if let Some(t) = load(archive, "resting_hr.csv", &mut unreadable) {
        for row in &t.rows {
            let date = t
                .text(row, "date")
                .filter(|d| NaiveDate::parse_from_str(d, "%Y-%m-%d").is_ok());
            let bpm = t.float(row, "bpm").filter(|v| (25.0..=250.0).contains(v));
            match (date, bpm) {
                (Some(date), Some(value)) => health.daily.push(HealthDaily {
                    metric: "resting_hr",
                    unit: "bpm",
                    date: date.to_string(),
                    value,
                }),
                _ => unreadable += 1,
            }
        }
    }

    // 睡眠：用户在 unstrap 里删掉的不要，改过起止的用改过的。
    let mut edits: HashMap<i64, (bool, Option<i64>, Option<i64>)> = HashMap::new();
    if let Some(t) = load(archive, "sleep_edit.csv", &mut unreadable) {
        for row in &t.rows {
            if let Some(strap_start) = t.int(row, "strap_start_epoch") {
                edits.insert(
                    strap_start,
                    (
                        t.flag(row, "deleted"),
                        t.int(row, "start_epoch"),
                        t.int(row, "end_epoch"),
                    ),
                );
            }
        }
    }
    let mut stages: BTreeMap<i64, Vec<SleepStageSlice>> = BTreeMap::new();
    if let Some(t) = load(archive, "sleep_stage.csv", &mut unreadable) {
        for row in &t.rows {
            let (Some(session), Some(start), Some(end)) = (
                t.int(row, "session_start_epoch"),
                instant(t.text(row, "start")),
                instant(t.text(row, "end")),
            ) else {
                unreadable += 1;
                continue;
            };
            if end <= start {
                unreadable += 1;
                continue;
            }
            stages.entry(session).or_default().push(SleepStageSlice {
                stage: stage_name(t.text(row, "stage").unwrap_or_default()).to_string(),
                start_time: start,
                end_time: end,
                raw_mode: None,
            });
        }
    }
    if let Some(t) = load(archive, "sleep_session.csv", &mut unreadable) {
        for row in &t.rows {
            if t.flag(row, "nap") {
                continue;
            }
            let Some(strap_start) = t.int(row, "start_epoch") else {
                unreadable += 1;
                continue;
            };
            let edit = edits.get(&strap_start);
            if edit.is_some_and(|(deleted, _, _)| *deleted) {
                continue;
            }
            let start = edit.and_then(|e| e.1).unwrap_or(strap_start);
            let end = edit.and_then(|e| e.2).or_else(|| t.int(row, "end_epoch"));
            let (Some(start_time), Some(end_time)) = (epoch(start), end.and_then(epoch)) else {
                unreadable += 1;
                continue;
            };
            if end_time <= start_time {
                unreadable += 1;
                continue;
            }
            let minutes = |column: &str| {
                t.int(row, column)
                    .filter(|m| *m >= 0)
                    .and_then(|m| i32::try_from(m).ok())
            };
            let mut slices = stages.remove(&strap_start).unwrap_or_default();
            slices.sort_by_key(|slice| slice.start_time);
            health.sleeps.push(SleepSession {
                sleep_id: format!("{UNSTRAP_DEVICE}:{start}"),
                start_time,
                end_time,
                // 分数是 unstrap / 带子的算法，不顶替 Zepp 的睡眠分。
                score: None,
                duration_minutes: ((end_time - start_time).num_minutes()) as i32,
                deep_minutes: minutes("deep_min"),
                light_minutes: minutes("light_min"),
                rem_minutes: minutes("rem_min"),
                awake_minutes: minutes("awake_min"),
                source_scope: SourceScope::Device,
                device_id: Some(UNSTRAP_DEVICE.to_string()),
                synced_at: None,
                time_in_bed_minutes: None,
                stages: slices,
                wake_count: minutes("wake_count"),
            });
        }
    }
    (health, unreadable)
}
