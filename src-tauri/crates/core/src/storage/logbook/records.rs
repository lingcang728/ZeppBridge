//! PB 墙：5K / 10K / 半马 / 全马的最快一段，全在本机算。
//!
//! 每次跑步按这个顺序找，找到就停（`method` 写明是哪种）：
//!
//! 1. `samples`：逐秒采样的累计距离，滑动窗口找覆盖目标距离的最短时间。窗口两头落在采样点上、
//!    不插值，所以距离只会多一点不会少——时间只会偏慢，不会比真实的快。暂停时间算在里面。
//! 2. `splits`：没有采样距离的旧记录，5K / 10K 用连续的整公里分段（每段正好 1000 m）相加。
//! 3. `whole`：整次运动的距离就在目标距离到它的 103% 之间，用开始到结束的时间（多见于比赛）。
//!
//! 另外，用户在比赛日历里填了成绩、距离对得上的比赛（`race`）也算进来——官方成绩比手表准。
//!
//! 快得不可能的（配速快于 2:30/km，比世界纪录还快）当作 GPS 漂移，丢掉，不进墙。
use super::RUN_TYPES;
use crate::models::error::Result;
use crate::storage::Database;
use serde::Serialize;
use std::collections::HashMap;

/// (键, 目标距离 m)。
pub const TARGETS: [(&str, f64); 4] = [
    ("5k", 5000.0),
    ("10k", 10000.0),
    ("half", 21097.5),
    ("marathon", 42195.0),
];
/// 快于这个配速（秒 / km）的「最快一段」不收。
const IMPOSSIBLE_PACE: f64 = 150.0;
/// 每个距离除了最快的，再列几条。
const RUNNERS_UP: usize = 2;

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct Effort {
    pub seconds: i64,
    /// `samples` / `splits` / `whole` / `race`。
    pub method: &'static str,
    pub workout_id: Option<String>,
    pub race_id: Option<i64>,
    pub race_name: Option<String>,
    /// 本地日期。
    pub date: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct RecordRow {
    pub key: &'static str,
    pub distance_m: f64,
    pub best: Option<Effort>,
    /// 其它几次最快的（不同的运动），慢的在后。
    pub runners_up: Vec<Effort>,
}

#[derive(Debug, Clone, Serialize)]
pub struct PersonalRecords {
    pub records: Vec<RecordRow>,
    /// 看了多少次跑步（够长的）。
    pub runs_scanned: usize,
}

/// 纯函数：累计距离序列上覆盖 `target` 米的最短时间。`points` = (秒, 累计米)，按时间排好。
/// 距离倒退（重置、漂移）的点会切断窗口，从那里重新开始。
pub fn fastest_span(points: &[(i64, f64)], target: f64) -> Option<i64> {
    let mut best: Option<i64> = None;
    let mut start = 0usize;
    for end in 0..points.len() {
        if end > 0 && points[end].1 < points[end - 1].1 {
            start = end;
            continue;
        }
        // 把起点往前推到「再推一格就不够目标距离」为止。
        while start + 1 < end && points[end].1 - points[start + 1].1 >= target {
            start += 1;
        }
        if points[end].1 - points[start].1 >= target {
            let span = points[end].0 - points[start].0;
            if span > 0 && best.is_none_or(|b| span < b) {
                best = Some(span);
            }
        }
    }
    best
}

/// 纯函数：连续 `count` 个整公里分段的最短总时间。`splits` = (序号, 米, 秒, 是否不完整)。
pub fn fastest_splits(splits: &[(i64, f64, i64, bool)], count: usize) -> Option<i64> {
    let mut best: Option<i64> = None;
    let mut run: Vec<i64> = Vec::new();
    let mut previous: Option<i64> = None;
    for &(index, meters, seconds, partial) in splits {
        let whole_km = !partial && (meters - 1000.0).abs() <= 1.0 && seconds > 0;
        if !whole_km || previous.is_some_and(|p| index != p + 1) {
            run.clear();
        }
        previous = Some(index);
        if !whole_km {
            continue;
        }
        run.push(seconds);
        if run.len() >= count {
            let sum: i64 = run[run.len() - count..].iter().sum();
            if best.is_none_or(|b| sum < b) {
                best = Some(sum);
            }
        }
    }
    best
}

fn plausible(seconds: i64, distance: f64) -> bool {
    seconds > 0 && (seconds as f64) / (distance / 1000.0) >= IMPOSSIBLE_PACE
}

impl Database {
    pub fn personal_records(&self) -> Result<PersonalRecords> {
        // 够长的跑步。
        let mut statement = self.conn.prepare(&format!(
            "SELECT workout_id, date(start_time, 'localtime'), distance_meters,
                    CAST(ROUND((julianday(end_time) - julianday(start_time)) * 86400) AS INTEGER)
               FROM workouts_visible
              WHERE COALESCE(workout_type_override, workout_type) IN ({})
                AND distance_meters >= ?1",
            RUN_TYPES
                .iter()
                .map(|t| format!("'{t}'"))
                .collect::<Vec<_>>()
                .join(",")
        ))?;
        let runs = statement
            .query_map([TARGETS[0].1 * 0.99], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, f64>(2)?,
                    row.get::<_, i64>(3)?,
                ))
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;

        let mut efforts: HashMap<&'static str, Vec<Effort>> = HashMap::new();
        let mut samples = self.conn.prepare(
            "SELECT CAST(strftime('%s', timestamp) AS INTEGER), distance_m FROM workout_samples
              WHERE workout_id = ?1 AND distance_m IS NOT NULL ORDER BY timestamp",
        )?;
        let mut splits = self.conn.prepare(
            "SELECT split_index, distance_m, duration_seconds, partial FROM workout_splits
              WHERE workout_id = ?1 ORDER BY split_index",
        )?;
        for (workout_id, date, distance, elapsed) in &runs {
            let points = samples
                .query_map([workout_id], |row| {
                    Ok((row.get::<_, i64>(0)?, row.get::<_, f64>(1)?))
                })?
                .collect::<std::result::Result<Vec<_>, _>>()?;
            let km_splits = if points.len() < 2 {
                splits
                    .query_map([workout_id], |row| {
                        Ok((
                            row.get::<_, i64>(0)?,
                            row.get::<_, f64>(1)?,
                            row.get::<_, i64>(2)?,
                            row.get::<_, i64>(3)? != 0,
                        ))
                    })?
                    .collect::<std::result::Result<Vec<_>, _>>()?
            } else {
                Vec::new()
            };
            for (key, target) in TARGETS {
                if *distance < target * 0.99 {
                    continue;
                }
                let found = if points.len() >= 2 {
                    fastest_span(&points, target).map(|s| (s, "samples"))
                } else if target <= 10_000.0 {
                    fastest_splits(&km_splits, (target / 1000.0) as usize).map(|s| (s, "splits"))
                } else {
                    None
                }
                .or_else(|| {
                    (*distance >= target && *distance <= target * 1.03)
                        .then_some((*elapsed, "whole"))
                });
                if let Some((seconds, method)) = found.filter(|(s, _)| plausible(*s, target)) {
                    efforts.entry(key).or_default().push(Effort {
                        seconds,
                        method,
                        workout_id: Some(workout_id.clone()),
                        race_id: None,
                        race_name: None,
                        date: date.clone(),
                    });
                }
            }
        }

        // 用户填了成绩的比赛：距离在目标的 ±1% 以内才算这个距离。
        for race in self.list_races()? {
            let (Some(distance), Some(seconds)) =
                (race.input.distance_m, race.input.result_seconds)
            else {
                continue;
            };
            for (key, target) in TARGETS {
                if (distance - target).abs() <= target * 0.01 && plausible(seconds, target) {
                    let list = efforts.entry(key).or_default();
                    // 比赛认到的那次运动，以比赛成绩为准，不再重复列。
                    if let Some(id) = race.input.workout_id.as_deref() {
                        list.retain(|e| e.workout_id.as_deref() != Some(id));
                    }
                    list.push(Effort {
                        seconds,
                        method: "race",
                        workout_id: race.input.workout_id.clone(),
                        race_id: race.input.id,
                        race_name: Some(race.input.name.clone()),
                        date: race.input.race_date.clone(),
                    });
                }
            }
        }

        let records = TARGETS
            .iter()
            .map(|&(key, distance_m)| {
                let mut list = efforts.remove(key).unwrap_or_default();
                list.sort_by(|a, b| a.seconds.cmp(&b.seconds).then_with(|| a.date.cmp(&b.date)));
                let mut list = list.into_iter();
                let best = list.next();
                RecordRow {
                    key,
                    distance_m,
                    best,
                    runners_up: list.take(RUNNERS_UP).collect(),
                }
            })
            .collect();
        Ok(PersonalRecords {
            records,
            runs_scanned: runs.len(),
        })
    }
}
