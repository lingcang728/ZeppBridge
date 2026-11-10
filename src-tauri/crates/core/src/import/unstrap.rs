//! unstrap（原 OpenStrap，Helio Strap 的开源伴侣应用）的备份 zip：一张表一个 CSV，按列名读。
//!
//! 一期只读运动（计划 C2）：
//! - `workout.csv` + `workout_hr.csv`：心率带自己记的运动，只有汇总和逐秒心率，没有轨迹；
//! - `app_workout.csv` + `app_workout_hr.csv` + `app_workout_route.csv`：手机上开始的运动，
//!   用户选了保留路线才有轨迹。
//!
//! 心率带记的和手机记的常常是同一次（在手机上开始、带子同时在记）：起点两分钟以内的并成一条，
//! 以手机那条为准（有轨迹、有暂停），缺的心率从带子那条补。`workout_deleted.csv` 里的是用户在
//! unstrap 里删掉的，不导回来。
//!
//! 不编数据：unstrap 自己算的分数（恢复时间、训练效果、VO₂max）不进来，不顶替 Zepp 的；
//! 距离只认 GPS 轨迹或手机记下的实测距离，按步数估出来的（`distance_from_steps`）不要。
//! 运动类型是 Zepp OS 协议里的编号，和云端历史不是一套（6 是泳池游泳，不是步行），
//! 所以单独一张表（[`unstrap_sport`]），认不出就是 `activity`。

use std::collections::{BTreeMap, HashMap, HashSet};
use std::io::{Read, Seek};

use chrono::{DateTime, TimeZone, Utc};

use super::strava::{entry_name, parse_csv, read_entry};
use super::{activity_from_track, ParsedActivity, ParsedFile, TrackPoint};
use crate::decoder::PauseInterval;

/// 和存储去重同一个窗口：起点相差这么多秒以内算同一次。
const SAME_WORKOUT_SECONDS: i64 = 120;

/// 一张 CSV 表：表头 + 行，按列名取值，空格子就是没有。
pub(crate) struct Table {
    columns: HashMap<String, usize>,
    pub(crate) rows: Vec<Vec<String>>,
}

impl Table {
    pub(crate) fn parse(text: &str) -> Option<Self> {
        let mut rows = parse_csv(text).into_iter();
        let header = rows.next()?;
        let columns = header
            .iter()
            .enumerate()
            .map(|(i, name)| (name.trim().to_string(), i))
            .collect();
        Some(Self {
            columns,
            rows: rows
                .filter(|row| row.iter().any(|cell| !cell.is_empty()))
                .collect(),
        })
    }

    pub(crate) fn text<'a>(&self, row: &'a [String], column: &str) -> Option<&'a str> {
        let index = *self.columns.get(column)?;
        row.get(index)
            .map(|cell| cell.trim())
            .filter(|cell| !cell.is_empty())
    }

    pub(crate) fn int(&self, row: &[String], column: &str) -> Option<i64> {
        self.text(row, column)?.parse().ok()
    }

    pub(crate) fn float(&self, row: &[String], column: &str) -> Option<f64> {
        self.text(row, column)?
            .parse::<f64>()
            .ok()
            .filter(|v| v.is_finite())
    }

    pub(crate) fn flag(&self, row: &[String], column: &str) -> bool {
        matches!(self.text(row, column), Some("true" | "1"))
    }
}

/// 包里有没有 unstrap 的运动表——没有就不是 unstrap 的备份。
pub fn is_unstrap_archive<R: Read + Seek>(archive: &mut zip::ZipArchive<R>) -> bool {
    entry_name(archive, |name| {
        name == "workout.csv" || name == "app_workout.csv"
    })
    .is_some()
}

pub(crate) fn read_table<R: Read + Seek>(
    archive: &mut zip::ZipArchive<R>,
    file: &str,
) -> Option<Table> {
    let name = entry_name(archive, |name| name == file)?;
    let bytes = read_entry(archive, &name)?;
    Table::parse(&String::from_utf8(bytes).ok()?)
}

pub(crate) fn epoch(seconds: i64) -> Option<DateTime<Utc>> {
    Utc.timestamp_opt(seconds, 0).single()
}

/// 按所属运动的起点（`workout_start_epoch`）分组的逐点表。
fn by_workout(table: Option<Table>) -> (Option<Table>, BTreeMap<i64, Vec<usize>>) {
    let mut groups: BTreeMap<i64, Vec<usize>> = BTreeMap::new();
    if let Some(t) = &table {
        for (i, row) in t.rows.iter().enumerate() {
            if let Some(start) = t.int(row, "workout_start_epoch") {
                groups.entry(start).or_default().push(i);
            }
        }
    }
    (table, groups)
}

/// 一组逐秒心率（`epoch`、`bpm`）→ 轨迹点。不在 25–250 之间的丢掉。
fn heart_points(table: &Option<Table>, rows: Option<&Vec<usize>>) -> Vec<TrackPoint> {
    let (Some(t), Some(rows)) = (table, rows) else {
        return Vec::new();
    };
    rows.iter()
        .filter_map(|&i| {
            let row = &t.rows[i];
            let time = epoch(t.int(row, "epoch")?)?;
            let bpm = t.int(row, "bpm").filter(|bpm| (25..=250).contains(bpm))? as i32;
            Some(TrackPoint {
                time: Some(time),
                heart_rate: Some(bpm),
                ..TrackPoint::default()
            })
        })
        .collect()
}

/// 一次运动：先用逐点数据拼出序列，再用表里的起止与汇总盖上去（表里写的比点算的准）。
struct Summary {
    sport: String,
    start: DateTime<Utc>,
    end: DateTime<Utc>,
    moving_seconds: Option<i64>,
    calories: Option<i32>,
    avg_hr: Option<i32>,
    max_hr: Option<i32>,
    distance_m: Option<f64>,
    pauses: Vec<PauseInterval>,
}

fn build(summary: Summary, points: Vec<TrackPoint>) -> ParsedActivity {
    let mut activity =
        activity_from_track(points, summary.sport.clone(), None).unwrap_or(ParsedActivity {
            sport: summary.sport.clone(),
            start_time: summary.start,
            end_time: summary.end,
            distance_m: None,
            moving_seconds: None,
            calories: None,
            avg_hr: None,
            max_hr: None,
            elevation_gain_m: None,
            decoded: None,
            name: None,
        });
    activity.start_time = summary.start;
    activity.end_time = summary.end;
    activity.moving_seconds = summary.moving_seconds;
    activity.calories = summary.calories;
    activity.avg_hr = summary.avg_hr.or(activity.avg_hr);
    activity.max_hr = summary.max_hr.or(activity.max_hr);
    activity.distance_m = summary.distance_m.or(activity.distance_m);
    if let Some(decoded) = activity.decoded.as_mut() {
        decoded.track_id = summary.start.timestamp();
        decoded.source = Some("import".into());
        decoded.start_time = summary.start;
        decoded.end_time = summary.end;
        decoded.pauses = summary.pauses;
    }
    activity
}

fn positive_int(value: Option<i64>) -> Option<i32> {
    value.filter(|v| *v > 0).and_then(|v| i32::try_from(v).ok())
}

fn heart(value: Option<i64>) -> Option<i32> {
    value.filter(|v| (25..=250).contains(v)).map(|v| v as i32)
}

/// `pauses` 列：`起-止` 成对的秒级时间戳，逗号分隔。读不懂的那一段跳过。
fn parse_pauses(text: Option<&str>) -> Vec<PauseInterval> {
    text.unwrap_or_default()
        .split(',')
        .filter_map(|pair| {
            let (from, to) = pair.trim().split_once('-')?;
            let (from, to) = (from.parse().ok()?, to.parse().ok()?);
            (to > from).then_some(())?;
            Some(PauseInterval {
                start_time: epoch(from)?,
                end_time: epoch(to)?,
                kind: "manual".into(),
            })
        })
        .collect()
}

/// 读整个 unstrap 备份里的运动。不是 unstrap 的包返回 `None`。
pub fn parse_unstrap_archive<R: Read + Seek>(reader: R) -> Option<ParsedFile> {
    let mut archive = zip::ZipArchive::new(reader).ok()?;
    if !is_unstrap_archive(&mut archive) {
        return None;
    }
    let deleted: HashSet<i64> = read_table(&mut archive, "workout_deleted.csv")
        .map(|t| {
            t.rows
                .iter()
                .filter_map(|row| t.int(row, "start_epoch"))
                .collect()
        })
        .unwrap_or_default();
    let strap = read_table(&mut archive, "workout.csv");
    let (strap_hr, strap_hr_groups) = by_workout(read_table(&mut archive, "workout_hr.csv"));
    let phone = read_table(&mut archive, "app_workout.csv");
    let (phone_hr, phone_hr_groups) = by_workout(read_table(&mut archive, "app_workout_hr.csv"));
    let (route, route_groups) = by_workout(read_table(&mut archive, "app_workout_route.csv"));

    let mut file = ParsedFile::default();

    // 心率带记的：起点 → (汇总, 逐秒心率)。
    let mut strap_workouts: BTreeMap<i64, (Summary, Vec<TrackPoint>)> = BTreeMap::new();
    if let Some(t) = &strap {
        for row in &t.rows {
            let (Some(start), Some(end)) = (t.int(row, "start_epoch"), t.int(row, "end_epoch"))
            else {
                file.unreadable += 1;
                continue;
            };
            if deleted.contains(&start) {
                continue;
            }
            let (Some(start_time), Some(end_time)) = (epoch(start), epoch(end)) else {
                file.unreadable += 1;
                continue;
            };
            if end_time <= start_time {
                file.unreadable += 1;
                continue;
            }
            let summary = Summary {
                sport: unstrap_sport(t.int(row, "sport_type").unwrap_or(-1)).to_string(),
                start: start_time,
                end: end_time,
                moving_seconds: t.int(row, "exercise_seconds").filter(|s| *s > 0),
                calories: positive_int(t.int(row, "calories")),
                avg_hr: heart(t.int(row, "avg_hr")),
                max_hr: heart(t.int(row, "max_hr")),
                distance_m: None,
                pauses: Vec::new(),
            };
            let points = heart_points(&strap_hr, strap_hr_groups.get(&start));
            strap_workouts.insert(start, (summary, points));
        }
    }

    if let Some(t) = &phone {
        for row in &t.rows {
            let (Some(start), Some(end)) = (t.int(row, "start_epoch"), t.int(row, "end_epoch"))
            else {
                file.unreadable += 1;
                continue;
            };
            let (Some(start_time), Some(end_time)) = (epoch(start), epoch(end)) else {
                file.unreadable += 1;
                continue;
            };
            if end_time <= start_time {
                file.unreadable += 1;
                continue;
            }
            // 同一次被带子也记了：并进来，带子那条不再单独导入。
            let twin = strap_workouts
                .range(start - SAME_WORKOUT_SECONDS..=start + SAME_WORKOUT_SECONDS)
                .map(|(key, _)| *key)
                .next()
                .and_then(|key| strap_workouts.remove(&key));
            let mut points = heart_points(&phone_hr, phone_hr_groups.get(&start));
            if points.is_empty() {
                if let Some((_, strap_points)) = &twin {
                    points = strap_points.clone();
                }
            }
            if let (Some(rt), Some(rows)) = (&route, route_groups.get(&start)) {
                for &i in rows {
                    let r = &rt.rows[i];
                    let (Some(time), Some(lat), Some(lon)) = (
                        rt.int(r, "epoch").and_then(epoch),
                        rt.float(r, "lat"),
                        rt.float(r, "lon"),
                    ) else {
                        continue;
                    };
                    points.push(TrackPoint {
                        time: Some(time),
                        latitude: Some(lat),
                        longitude: Some(lon),
                        altitude_m: rt.float(r, "altitude_m"),
                        ..TrackPoint::default()
                    });
                }
            }
            let measured = (!t.flag(row, "distance_from_steps"))
                .then(|| t.float(row, "distance_m"))
                .flatten()
                .filter(|d| *d > 0.0);
            let twin_summary = twin.as_ref().map(|(summary, _)| summary);
            let kcal = t
                .float(row, "total_kcal")
                .map(|k| k.round() as i64)
                .and_then(|k| positive_int(Some(k)))
                .or_else(|| twin_summary.and_then(|s| s.calories));
            let summary = Summary {
                sport: unstrap_sport(t.int(row, "sport_type").unwrap_or(-1)).to_string(),
                start: start_time,
                end: end_time,
                moving_seconds: twin_summary.and_then(|s| s.moving_seconds),
                calories: kcal,
                avg_hr: heart(t.int(row, "avg_hr")).or(twin_summary.and_then(|s| s.avg_hr)),
                max_hr: heart(t.int(row, "max_hr")).or(twin_summary.and_then(|s| s.max_hr)),
                distance_m: measured,
                pauses: parse_pauses(t.text(row, "pauses")),
            };
            file.activities.push(build(summary, points));
        }
    }

    file.activities.extend(
        strap_workouts
            .into_values()
            .map(|(summary, points)| build(summary, points)),
    );
    file.activities.sort_by_key(|activity| activity.start_time);
    Some(file)
}

/// unstrap 的运动编号（Zepp OS 协议，`Workouts.SPORT_NAMES`）→ 运动目录 key。
/// 只收确定的；高尔夫、匹克球、HYROX、混合训练、「滑雪」（分不清高山还是越野）、
/// 「攀爬」（分不清攀岩还是登山）目录里没有对应的，是 `activity`，用户可以再改。
pub fn unstrap_sport(code: i64) -> &'static str {
    match code {
        1 => "run",
        2 => "treadmill",
        3 => "walking",
        4 => "ride",
        5 | 16 => "free_training",
        6 => "pool_swimming",
        7 => "open_water_swimming",
        8 => "indoor_cycling",
        9 => "elliptical",
        11 => "trail_running",
        15 | 224 => "hiking",
        17 => "tennis",
        18 | 191 => "soccer",
        21 => "jump_rope",
        23 => "rowing",
        24 => "indoor_fitness",
        40 => "indoor_walking",
        49 => "hiit",
        50 => "core_training",
        51 => "aerobic_combo",
        52 => "strength",
        53 => "stretching",
        55 => "flexibility",
        57 => "stepper",
        58 => "stair_climber",
        60 => "yoga",
        61 => "pilates",
        70 => "rock_climbing",
        76 => "dance",
        85 => "basketball",
        88 => "volleyball",
        89 => "table_tennis",
        92 => "badminton",
        97 => "boxing",
        108 => "stair_climbing",
        109 => "aerobics",
        130 => "cross_training",
        143 => "spinning",
        205 | 216 => "padel",
        215 => "dog_walking",
        225 => "rucking",
        _ => "activity",
    }
}
