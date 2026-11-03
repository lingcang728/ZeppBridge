//! Apple 健康的「导出所有健康数据」：`export.zip` 里的 `export.xml`（常有好几 GB），
//! 加上 `workout-routes/` 下每次户外运动的 GPX 路线。
//!
//! 只取 `<Workout>`：类型、起止、距离、热量、心率均值 / 最高（新格式在 `WorkoutStatistics`
//! 里，老格式在属性里），有路线就挂上路线。几百万条逐项记录（`<Record>`）一条不碰，
//! 逐行流式读，内存只留运动那几行。

use std::io::{BufRead, BufReader, Read, Seek};

use super::gpx::parse_gpx;
use super::xml::{attr, elements, number, parse_time};
use super::{text_sport, ParsedActivity, ParsedFile, MAX_IMPORT_FILE_BYTES};

/// 读 `export.zip`。
pub fn parse_apple_archive<R: Read + Seek>(reader: R) -> Option<ParsedFile> {
    let mut archive = zip::ZipArchive::new(reader).ok()?;
    let export = (0..archive.len()).find_map(|i| {
        let entry = archive.by_index(i).ok()?;
        let name = entry.name().to_string();
        name.rsplit('/')
            .next()
            .is_some_and(|tail| tail == "export.xml")
            .then_some(name)
    })?;
    let root = export.strip_suffix("export.xml").unwrap_or("").to_string();
    let workouts = {
        let entry = archive.by_name(&export).ok()?;
        workout_elements(BufReader::new(entry))
    };
    let mut file = ParsedFile::default();
    for element in workouts {
        let Some(mut activity) = activity_from_workout(&element) else {
            file.unreadable += 1;
            continue;
        };
        if let Some(path) = route_path(&element) {
            let name = format!("{root}{}", path.trim_start_matches('/'));
            if let Some(route) = read_text(&mut archive, &name).and_then(|text| {
                parse_gpx(&text, Some(&activity.sport))
                    .activities
                    .into_iter()
                    .next()
            }) {
                activity.elevation_gain_m = route.elevation_gain_m;
                if activity.distance_m.is_none() {
                    activity.distance_m = route.distance_m;
                }
                activity.decoded = route.decoded;
            }
        }
        file.activities.push(activity);
    }
    Some(file)
}

/// 直接给的 `export.xml`（用户自己解压过）：没有路线可挂，只有汇总。
pub fn parse_apple_xml<R: Read>(reader: R) -> ParsedFile {
    let mut file = ParsedFile::default();
    for element in workout_elements(BufReader::new(reader)) {
        match activity_from_workout(&element) {
            Some(activity) => file.activities.push(activity),
            None => file.unreadable += 1,
        }
    }
    file
}

/// 逐行扫出每个 `<Workout …>…</Workout>`。
fn workout_elements<R: BufRead>(mut reader: R) -> Vec<String> {
    let mut out = Vec::new();
    let mut current: Option<String> = None;
    let mut line = Vec::new();
    loop {
        line.clear();
        match reader.read_until(b'\n', &mut line) {
            Ok(0) | Err(_) => break,
            Ok(_) => {}
        }
        let text = String::from_utf8_lossy(&line);
        let trimmed = text.trim();
        if let Some(element) = current.as_mut() {
            element.push_str(trimmed);
            element.push('\n');
            if trimmed.starts_with("</Workout>") {
                out.extend(current.take());
            }
        } else if trimmed.starts_with("<Workout ") {
            if trimmed.ends_with("/>") {
                out.push(trimmed.to_string());
            } else {
                current = Some(format!("{trimmed}\n"));
            }
        }
    }
    out
}

fn activity_from_workout(element: &str) -> Option<ParsedActivity> {
    let start_time = attr(element, "startDate").and_then(|t| parse_time(&t))?;
    let end_time = attr(element, "endDate").and_then(|t| parse_time(&t))?;
    if end_time <= start_time {
        return None;
    }
    let kind = attr(element, "workoutActivityType").unwrap_or_default();
    let head = &element[..element.find('>').unwrap_or(element.len())];
    let mut distance_m = number(attr(head, "totalDistance"))
        .and_then(|v| to_meters(v, &attr(head, "totalDistanceUnit").unwrap_or_default()));
    let mut calories = number(attr(head, "totalEnergyBurned"))
        .and_then(|v| to_kcal(v, &attr(head, "totalEnergyBurnedUnit").unwrap_or_default()));
    let mut avg_hr = None;
    let mut max_hr = None;
    for stat in elements(element, "WorkoutStatistics") {
        let kind = attr(stat, "type").unwrap_or_default();
        let unit = attr(stat, "unit").unwrap_or_default();
        if kind.starts_with("HKQuantityTypeIdentifierDistance") {
            distance_m =
                distance_m.or_else(|| number(attr(stat, "sum")).and_then(|v| to_meters(v, &unit)));
        } else if kind == "HKQuantityTypeIdentifierActiveEnergyBurned" {
            calories =
                calories.or_else(|| number(attr(stat, "sum")).and_then(|v| to_kcal(v, &unit)));
        } else if kind == "HKQuantityTypeIdentifierHeartRate" {
            avg_hr = number(attr(stat, "average")).map(|v| v.round() as i32);
            max_hr = number(attr(stat, "maximum")).map(|v| v.round() as i32);
        }
    }
    let moving_seconds = number(attr(head, "duration")).and_then(|v| {
        let seconds = match attr(head, "durationUnit").as_deref() {
            Some("s") | Some("sec") => v,
            Some("h") | Some("hr") => v * 3600.0,
            _ => v * 60.0,
        };
        (seconds > 0.0).then(|| seconds.round() as i64)
    });
    Some(ParsedActivity {
        sport: apple_sport(&kind).to_string(),
        start_time,
        end_time,
        distance_m: distance_m.filter(|d| *d > 0.0),
        moving_seconds,
        calories: calories.filter(|c| *c > 0.0).map(|c| c.round() as i32),
        avg_hr,
        max_hr,
        elevation_gain_m: None,
        decoded: None,
        name: None,
    })
}

fn route_path(element: &str) -> Option<String> {
    let route = elements(element, "WorkoutRoute").into_iter().next()?;
    let reference = elements(route, "FileReference").into_iter().next()?;
    attr(reference, "path")
}

fn read_text<R: Read + Seek>(archive: &mut zip::ZipArchive<R>, name: &str) -> Option<String> {
    let entry = archive.by_name(name).ok()?;
    if entry.size() > MAX_IMPORT_FILE_BYTES {
        return None;
    }
    let mut text = String::new();
    entry
        .take(MAX_IMPORT_FILE_BYTES)
        .read_to_string(&mut text)
        .ok()?;
    Some(text)
}

fn to_meters(value: f64, unit: &str) -> Option<f64> {
    let factor = match unit {
        "km" => 1000.0,
        "m" => 1.0,
        "mi" => 1609.344,
        "yd" => 0.9144,
        "ft" => 0.3048,
        _ => return None,
    };
    Some(value * factor)
}

fn to_kcal(value: f64, unit: &str) -> Option<f64> {
    match unit {
        "kcal" | "Cal" => Some(value),
        "kJ" => Some(value / 4.184),
        _ => None,
    }
}

/// `HKWorkoutActivityTypeRunning` → 运动目录 key。
pub fn apple_sport(kind: &str) -> &'static str {
    let name = kind.strip_prefix("HKWorkoutActivityType").unwrap_or(kind);
    match name {
        "TraditionalStrengthTraining" | "FunctionalStrengthTraining" => "strength",
        "Swimming" => "pool_swimming",
        "Dance" | "SocialDance" | "CardioDance" => "dance",
        "MixedCardio" | "MixedMetabolicCardioTraining" => "aerobics",
        "CoreTraining" => "core_training",
        "StairClimbing" | "Stairs" => "stair_climber",
        "Flexibility" => "flexibility",
        "TableTennis" => "table_tennis",
        "MartialArts" => "martial_arts",
        "Boxing" => "boxing",
        "Climbing" => "rock_climbing",
        "Volleyball" => "volleyball",
        "JumpRope" => "jump_rope",
        "Golf" | "Cooldown" | "Other" => "activity",
        other => text_sport(other),
    }
}
