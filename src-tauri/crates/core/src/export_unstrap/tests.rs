use std::io::{Cursor, Read, Write};

use chrono::{DateTime, Utc};

use super::{build_unstrap_export, unstrap_code};
use crate::import::unstrap::parse_unstrap_archive;
use crate::import::ImportSource;
use crate::storage::Database;

// 2024-05-01T00:00:00Z。
const T0: i64 = 1_714_521_600;

fn zip_of(entries: &[(&str, String)]) -> Vec<u8> {
    let mut out = zip::ZipWriter::new(Cursor::new(Vec::new()));
    let options = zip::write::SimpleFileOptions::default();
    for (name, text) in entries {
        out.start_file(*name, options).unwrap();
        out.write_all(text.as_bytes()).unwrap();
    }
    out.finish().unwrap().into_inner()
}

fn entry(bytes: &[u8], name: &str) -> String {
    let mut archive = zip::ZipArchive::new(Cursor::new(bytes)).unwrap();
    let mut text = String::new();
    archive
        .by_name(name)
        .unwrap()
        .read_to_string(&mut text)
        .unwrap();
    text
}

/// 力量训练有心率和热量；第二天那条什么汇总都没有。
fn seeded() -> Database {
    let source = zip_of(&[
        (
            "workout.csv",
            format!(
                "start,start_epoch,end_epoch,sport_type,exercise_seconds,calories,avg_hr,max_hr,min_hr\n\
                 x,{a},{a_end},52,1500,180,120,150,\n\
                 x,{b},{b_end},999,,,,,\n",
                a = T0,
                a_end = T0 + 1800,
                b = T0 + 86_400,
                b_end = T0 + 86_400 + 600,
            ),
        ),
        (
            "workout_hr.csv",
            format!(
                "workout_start_epoch,epoch,bpm\n{a},{a},110\n{a},{a1},130\n",
                a = T0,
                a1 = T0 + 60
            ),
        ),
    ]);
    let parsed = parse_unstrap_archive(Cursor::new(source)).unwrap();
    let db = Database::in_memory().unwrap();
    let now = DateTime::<Utc>::from_timestamp(T0 + 10 * 86_400, 0).unwrap();
    db.import_activities(ImportSource::Unstrap, None, parsed, now)
        .unwrap();
    db
}

#[test]
fn round_trips_through_unstraps_own_tables_without_inventing_zeros() {
    let db = seeded();
    let export = build_unstrap_export(&db, None).unwrap();
    assert_eq!((export.workouts, export.heart_rate_points), (2, 2));

    let workouts = entry(&export.bytes, "workout.csv");
    let lines: Vec<&str> = workouts.lines().collect();
    assert_eq!(lines[0], super::WORKOUT_HEADER);
    // 新的在前；没有的格子是空的，不是 0；认不出的类型写成通用「活动」。
    assert_eq!(
        lines[1],
        format!(
            "2024-05-02T00:00:00Z,{},{},223,,,,,,,,,,,",
            T0 + 86_400,
            T0 + 86_400 + 600
        )
    );
    assert!(lines[2].starts_with(&format!(
        "2024-05-01T00:00:00Z,{T0},{},52,1500,180,120,150,",
        T0 + 1800
    )));

    // 读回来还是同两条。
    let back = parse_unstrap_archive(Cursor::new(export.bytes)).unwrap();
    let sports: Vec<&str> = back.activities.iter().map(|a| a.sport.as_str()).collect();
    assert_eq!(sports, ["strength", "activity"]);
    assert_eq!(back.activities[0].calories, Some(180));
    let hr: Vec<i32> = back.activities[0]
        .decoded
        .as_ref()
        .unwrap()
        .samples
        .iter()
        .filter_map(|s| s.heart_rate)
        .collect();
    assert_eq!(hr, [110, 130]);
}

#[test]
fn a_range_keeps_only_workouts_from_then_on() {
    let db = seeded();
    let since = DateTime::<Utc>::from_timestamp(T0 + 3600, 0);
    let export = build_unstrap_export(&db, since).unwrap();
    assert_eq!((export.workouts, export.heart_rate_points), (1, 0));
}

#[test]
fn sport_keys_map_back_to_the_codes_the_strap_uses() {
    assert_eq!(unstrap_code("run"), 1);
    assert_eq!(unstrap_code("soccer"), 191);
    assert_eq!(unstrap_code("padel"), 216);
    assert_eq!(unstrap_code("pool_swimming"), 6);
    assert_eq!(unstrap_code("activity"), 223);
    assert_eq!(unstrap_code("golf"), 223);
}
