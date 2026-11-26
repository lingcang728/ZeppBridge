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

fn at(epoch: i64) -> DateTime<Utc> {
    DateTime::<Utc>::from_timestamp(epoch, 0).unwrap()
}

fn night(id: &str, start: i64, hours: i64, device: &str) -> crate::models::SleepSession {
    use crate::models::{SleepSession, SleepStageSlice, SourceScope};
    let end = start + hours * 3600;
    SleepSession {
        sleep_id: id.into(),
        start_time: at(start),
        end_time: at(end),
        score: Some(81),
        duration_minutes: (hours * 60) as i32,
        deep_minutes: Some(60),
        light_minutes: Some(200),
        rem_minutes: Some(90),
        awake_minutes: Some(10),
        source_scope: SourceScope::Device,
        device_id: Some(device.into()),
        synced_at: None,
        time_in_bed_minutes: None,
        stages: vec![
            SleepStageSlice {
                stage: "light".into(),
                start_time: at(start),
                end_time: at(start + 3600),
                raw_mode: None,
            },
            SleepStageSlice {
                stage: "deep".into(),
                start_time: at(start + 3600),
                end_time: at(end),
                raw_mode: None,
            },
        ],
        wake_count: Some(2),
    }
}

fn health_seeded() -> Database {
    use base64::{engine::general_purpose::STANDARD, Engine as _};
    let db = Database::in_memory().unwrap();
    let sample = |metric: &str, epoch: i64, value: f64, device: &str| {
        db.conn
            .execute(
                "INSERT INTO metric_samples(metric, timestamp, value, unit, source_scope, device_id)
                 VALUES(?1, ?2, ?3, 'x', 'device', ?4)",
                rusqlite::params![metric, at(epoch).to_rfc3339(), value, device],
            )
            .unwrap();
    };
    // 两台设备同一分钟都有心率：unstrap 按时刻为键，只写一条。
    sample("heart_rate", T0, 60.0, "a");
    sample("heart_rate", T0, 70.0, "b");
    sample("heart_rate", T0 + 60, 300.0, "a");
    sample("hrv_rmssd", T0, 40.4, "a");
    sample("hrv", T0, 55.5, "a");
    sample("stress", T0, 30.0, "a");
    sample("spo2", T0, 97.0, "a");
    let day = |metric: &str, value: f64| {
        db.conn
            .execute(
                "INSERT INTO daily_metrics(date, metric, value, unit, source_scope, device_id)
                 VALUES('2024-05-02', ?1, ?2, 'x', 'device', 'a')",
                rusqlite::params![metric, value],
            )
            .unwrap();
    };
    for (metric, value) in [
        ("resting_hr", 52.0),
        ("device_max_hr", 180.0),
        ("device_resting_hr", 52.0),
        ("pai_daily", 10.5),
        ("pai_total", 80.0),
        ("readiness", 75.0),
        ("hrv_readiness", 60.0),
        ("sleep_hrv", 48.0),
        ("respiratory_rate", 15.2),
    ] {
        day(metric, value);
    }
    // 同一晚两台设备都记了：留长的那条。醒来那天是 5-02（正午 UTC 醒来，哪个时区都是这天）。
    let main_start = T0 + 86_400 + 4 * 3600;
    db.insert_sleep_session(&night("long", main_start, 8, "a"))
        .unwrap();
    db.insert_sleep_session(&night("short", main_start + 3600, 5, "b"))
        .unwrap();
    // 主睡上挂的小睡分期：连着的两段算一次小睡。
    let nap = main_start + 10 * 3600;
    for (stage, from, to) in [("light", nap, nap + 600), ("deep", nap + 600, nap + 1200)] {
        db.conn
            .execute(
                "INSERT INTO sleep_nap_stages(sleep_id, stage, start_time, end_time) VALUES('long', ?1, ?2, ?3)",
                rusqlite::params![stage, at(from).to_rfc3339(), at(to).to_rfc3339()],
            )
            .unwrap();
    }
    // 旧通道逐分钟明细：第 0 分钟戴着（高 4 位是带子状态）、走了 5 步、心率 60；第 1 分钟是没写的填充。
    let mut bytes = vec![0u8; 1440 * 8];
    bytes[..8].copy_from_slice(&[0x51, 10, 5, 60, 5, 0, 0, 0]);
    bytes[8..16].copy_from_slice(&[0xFF; 8]);
    let item = serde_json::json!({ "date_time": "2024-05-02", "device_id": "a", "data": STANDARD.encode(bytes) });
    db.conn
        .execute(
            "INSERT INTO raw_records(stream, source_key, source_scope, start_utc, payload, payload_hash, fetched_at)
             VALUES ('sleep', 'band_data:detail:2024-05-02:2024-05-02', 'device', ?1, ?2, 'h', ?1)",
            rusqlite::params![
                at(T0).to_rfc3339(),
                serde_json::json!({ "code": 1, "data": [item] }).to_string()
            ],
        )
        .unwrap();
    db
}

#[test]
fn health_tables_carry_what_unstrap_keeps_once_per_moment() {
    let db = health_seeded();
    let export = build_unstrap_export(&db, None).unwrap();
    let rows: std::collections::HashMap<&str, usize> = export.tables.iter().copied().collect();
    assert_eq!(rows["heart_rate.csv"], 1);
    for name in [
        "hrv.csv",
        "hrv_sdnn.csv",
        "stress.csv",
        "spo2.csv",
        "resting_hr.csv",
        "daily_max_hr.csv",
        "breath_rate.csv",
        "pai.csv",
        "strap_readiness.csv",
    ] {
        assert_eq!(rows[name], 1, "{name}");
    }
    // 主睡一条（短的那条重叠、不写）+ 小睡一次；主睡两段分期 + 小睡两段。
    assert_eq!((rows["sleep_session.csv"], rows["sleep_stage.csv"]), (2, 4));
    // 1440 分钟里少一条没写的填充。
    assert_eq!(rows["activity_minute.csv"], 1439);

    let heart = entry(&export.bytes, "heart_rate.csv");
    assert_eq!(
        heart.lines().nth(1).unwrap(),
        format!("2024-05-01T00:00:00Z,{T0},60,0")
    );
    assert!(entry(&export.bytes, "hrv.csv").contains(&format!("{T0},40\n")));
    assert!(entry(&export.bytes, "hrv_sdnn.csv").contains(&format!("{T0},55.5\n")));

    let midnight =
        super::health::midnight(chrono::NaiveDate::from_ymd_opt(2024, 5, 2).unwrap()).unwrap();
    let activity = entry(&export.bytes, "activity_minute.csv");
    // 类型取低 4 位；心率 0 是没测到，留空。
    assert_eq!(
        activity.lines().nth(1).unwrap().split_once(',').unwrap().1,
        format!("{midnight},5,10,1,60")
    );
    assert!(activity
        .lines()
        .nth(2)
        .unwrap()
        .ends_with(&format!("{},0,0,0,", midnight + 120)));

    let readiness = entry(&export.bytes, "strap_readiness.csv");
    assert_eq!(
        readiness.lines().nth(1).unwrap(),
        format!("{midnight},{midnight},75,60,,,,48,,zepp,2024-05-02")
    );
    let sessions = entry(&export.bytes, "sleep_session.csv");
    let main = sessions.lines().nth(1).unwrap();
    assert!(main.contains(",false,81,,60,200,90,10,2,") && main.ends_with(",2024-05-02,0"));
    assert!(sessions
        .lines()
        .nth(2)
        .unwrap()
        .contains(",true,,,10,10,0,0,,"));

    // 我们自己的 unstrap 导入认得这些表：列名对得上。
    let back = parse_unstrap_archive(Cursor::new(export.bytes)).unwrap();
    let health = back.health.unwrap();
    let metrics: Vec<&str> = health.samples.iter().map(|s| s.metric).collect();
    assert_eq!(metrics, ["heart_rate", "spo2", "hrv_rmssd"]);
    assert_eq!(
        (health.daily[0].metric, health.daily[0].value),
        ("resting_hr", 52.0)
    );
    // 小睡我们自己的导入不收。
    assert_eq!(health.sleeps.len(), 1);
}

#[test]
fn a_range_trims_the_health_tables_too() {
    let db = health_seeded();
    let export = build_unstrap_export(&db, Some(at(T0 + 30 * 86_400))).unwrap();
    assert!(export.tables.is_empty());
}
