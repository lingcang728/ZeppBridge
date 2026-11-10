use super::*;
use crate::import::{ImportSource, ParsedActivity, ParsedFile};

fn activity(start: DateTime<Utc>) -> ParsedActivity {
    let gpx = format!(
        r#"<gpx><trk><type>run</type><trkseg>
          <trkpt lat="31" lon="121"><time>{}</time></trkpt>
          <trkpt lat="31.01" lon="121"><time>{}</time></trkpt>
        </trkseg></trk></gpx>"#,
        start.to_rfc3339(),
        (start + chrono::Duration::minutes(6)).to_rfc3339()
    );
    crate::import::gpx::parse_gpx(&gpx, None)
        .activities
        .remove(0)
}

fn file(starts: &[DateTime<Utc>]) -> ParsedFile {
    ParsedFile {
        activities: starts.iter().map(|start| activity(*start)).collect(),
        unreadable: 2,
        ..Default::default()
    }
}

#[test]
fn import_skips_workouts_already_here_and_undo_removes_the_whole_batch() {
    let db = Database::in_memory().unwrap();
    let synced = workout_with_type(None, "run", "numeric_mapped");
    db.insert_workout(&synced).unwrap();
    let minute = chrono::Duration::minutes(1);
    let day = chrono::Duration::days(1);
    // 第一条和云端那条差一分钟（同一次运动），第三条和第二条在同一批里重复。
    let report = db
        .import_activities(
            ImportSource::Gpx,
            Some("a.gpx"),
            file(&[ts() + minute, ts() + day, ts() + day + minute]),
            ts(),
        )
        .unwrap();
    assert_eq!(
        (report.added, report.duplicates, report.unreadable),
        (1, 2, 2)
    );
    let batch = report.batch_id.unwrap();
    let id = format!("import-{batch}-1");
    let stored = db.get_workout_detail(&id).unwrap().unwrap();
    assert_eq!(stored.type_source, "imported");
    assert!(stored.gps_available);
    assert_eq!(
        db.workout_import_sources().unwrap(),
        vec![(id.clone(), "gpx".to_string())]
    );

    // 再导一遍同一份：全是重复，不建空批次。
    let again = db
        .import_activities(ImportSource::Gpx, None, file(&[ts() + day]), ts())
        .unwrap();
    assert_eq!(
        (again.batch_id, again.added, again.duplicates),
        (None, 0, 1)
    );

    assert_eq!(db.undo_import_batch(batch, ts()).unwrap(), 1);
    assert!(db.get_workout_detail(&id).unwrap().is_none());
    let route: i64 = db
        .conn
        .query_row(
            "SELECT COUNT(*) FROM route_points WHERE workout_id = ?1",
            [&id],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(route, 0);
    let batches = db.import_batches().unwrap();
    assert_eq!(batches.len(), 1);
    assert!(batches[0].undone_at.is_some());
    // 云端那条不受影响。
    assert!(db.get_workout_detail(&synced.workout_id).unwrap().is_some());
}

#[test]
fn retention_cleanup_keeps_imported_workouts() {
    let db = Database::in_memory().unwrap();
    let old = Utc::now() - chrono::Duration::days(400);
    let report = db
        .import_activities(ImportSource::Fit, None, file(&[old]), Utc::now())
        .unwrap();
    let id = format!("import-{}-1", report.batch_id.unwrap());
    db.cleanup_old_data(30).unwrap();
    // 导入的运动没有云端明细可拉，不算进明细覆盖。
    let coverage = db.workout_detail_coverage().unwrap();
    assert_eq!((coverage.pending, coverage.unavailable), (0, 0));
    assert!(db.get_workout_detail(&id).unwrap().is_some());
    let samples: i64 = db
        .conn
        .query_row(
            "SELECT COUNT(*) FROM workout_samples WHERE workout_id = ?1",
            [&id],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(samples, 2);
}

#[test]
fn unstrap_batches_pass_the_rebuilt_source_check_and_keep_older_batches() {
    // 新库也会先按 v46 建表、再走 v50 重建：旧批次照搬，'unstrap' 能写进去。
    let db = Database::in_memory().unwrap();
    let day = chrono::Duration::days(1);
    db.import_activities(ImportSource::Gpx, Some("a.gpx"), file(&[ts()]), ts())
        .unwrap();
    let report = db
        .import_activities(
            ImportSource::Unstrap,
            Some("unstrap-backup-2026-11-09.zip"),
            file(&[ts() + day]),
            ts(),
        )
        .unwrap();
    assert_eq!(report.added, 1);
    let sources: Vec<String> = db
        .import_batches()
        .unwrap()
        .into_iter()
        .map(|batch| batch.source)
        .collect();
    assert_eq!(sources.len(), 2);
    assert!(sources.contains(&"gpx".to_string()) && sources.contains(&"unstrap".to_string()));
    let rejected = db.conn.execute(
        "INSERT INTO import_batches(source, imported_at, added, duplicates, unreadable) VALUES('nope', 'x', 0, 0, 0)",
        [],
    );
    assert!(rejected.is_err());
}

fn night(id: &str, start: DateTime<Utc>, hours: i64, device: &str) -> SleepSession {
    let end = start + chrono::Duration::hours(hours);
    SleepSession {
        sleep_id: id.into(),
        start_time: start,
        end_time: end,
        score: None,
        duration_minutes: (hours * 60) as i32,
        deep_minutes: Some(60),
        light_minutes: Some(200),
        rem_minutes: None,
        awake_minutes: Some(10),
        source_scope: SourceScope::Device,
        device_id: Some(device.into()),
        synced_at: None,
        time_in_bed_minutes: None,
        stages: vec![crate::models::SleepStageSlice {
            stage: "deep".into(),
            start_time: start,
            end_time: start + chrono::Duration::hours(1),
            raw_mode: None,
        }],
        wake_count: None,
    }
}

fn imported_rows(db: &Database) -> i64 {
    db.conn
        .query_row(
            "SELECT (SELECT COUNT(*) FROM metric_samples WHERE import_batch_id IS NOT NULL)
                  + (SELECT COUNT(*) FROM daily_metrics WHERE import_batch_id IS NOT NULL)
                  + (SELECT COUNT(*) FROM sleep_sessions WHERE import_batch_id IS NOT NULL)",
            [],
            |r| r.get(0),
        )
        .unwrap()
}

#[test]
fn unstrap_health_only_fills_gaps_survives_retention_and_undoes_with_the_batch() {
    use crate::import::unstrap_health::{HealthDaily, HealthSample, ParsedHealth};
    let db = Database::in_memory().unwrap();
    let t = ts();
    let minute = chrono::Duration::minutes(1);
    let day = chrono::Duration::days(1);
    // 本机（Zepp 同步来的）已有：这一分钟的心率、11-15 的静息心率、头一晚的睡眠。
    db.conn
        .execute(
            "INSERT INTO metric_samples(metric, timestamp, value, unit, source_scope, device_id)
             VALUES('heart_rate', ?1, 60, 'bpm', 'device', 'band')",
            [t.to_rfc3339()],
        )
        .unwrap();
    db.conn
        .execute(
            "INSERT INTO daily_metrics(date, metric, value, unit, source_scope, device_id)
             VALUES('2023-11-15', 'resting_hr', 52, 'bpm', 'device', 'band')",
            [],
        )
        .unwrap();
    db.insert_sleep_session(&night("zepp-night", t, 8, "band"))
        .unwrap();

    let sample = |metric, unit, at, value| HealthSample {
        metric,
        unit,
        timestamp: at,
        value,
    };
    let daily = |date: &str, value| HealthDaily {
        metric: "resting_hr",
        unit: "bpm",
        date: date.into(),
        value,
    };
    let health = || ParsedHealth {
        samples: vec![
            sample("heart_rate", "bpm", t + chrono::Duration::seconds(20), 70.0),
            sample("heart_rate", "bpm", t + minute, 72.0),
            sample("spo2", "%", t, 97.0),
        ],
        daily: vec![daily("2023-11-15", 50.0), daily("2023-11-16", 51.0)],
        sleeps: vec![
            night("unstrap:a", t + chrono::Duration::hours(1), 6, "unstrap"),
            night("unstrap:b", t + day, 7, "unstrap"),
        ],
    };
    let parsed = || ParsedFile {
        health: Some(health()),
        ..Default::default()
    };

    let report = db
        .import_activities(ImportSource::Unstrap, Some("u.zip"), parsed(), t)
        .unwrap();
    // 下一分钟的心率、血氧、11-16 的静息心率、第二晚：4 条；其余本机已有。
    assert_eq!((report.added, report.health_added), (0, 4));
    let batch = report.batch_id.unwrap();
    let zepp: f64 = db
        .conn
        .query_row(
            "SELECT value FROM metric_samples WHERE metric = 'heart_rate' AND timestamp = ?1",
            [t.to_rfc3339()],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(zepp, 60.0);
    assert_eq!(db.import_batches().unwrap()[0].health_added, 4);

    // 再导一遍：全都已有，不建空批次。
    let again = db
        .import_activities(ImportSource::Unstrap, None, parsed(), t)
        .unwrap();
    assert_eq!((again.batch_id, again.health_added), (None, 0));

    // 保留期清理只删同步来的，导入的留着。
    db.cleanup_old_data(30).unwrap();
    assert_eq!(imported_rows(&db), 4);
    let synced: i64 = db
        .conn
        .query_row(
            "SELECT COUNT(*) FROM metric_samples WHERE import_batch_id IS NULL",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(synced, 0);

    // 整批撤销：健康数据和睡眠阶段一起删。
    assert_eq!(db.undo_import_batch(batch, t).unwrap(), 0);
    assert_eq!(imported_rows(&db), 0);
    let stages: i64 = db
        .conn
        .query_row(
            "SELECT COUNT(*) FROM sleep_stages WHERE sleep_id = 'unstrap:b'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(stages, 0);
}

#[test]
fn imported_heart_rate_does_not_count_as_the_newest_cloud_sample() {
    use crate::import::unstrap_health::{HealthSample, ParsedHealth};
    let db = Database::in_memory().unwrap();
    db.conn
        .execute(
            "INSERT INTO metric_samples(metric, timestamp, value, unit, source_scope, device_id)
             VALUES('heart_rate', ?1, 60, 'bpm', 'device', 'band')",
            [ts().to_rfc3339()],
        )
        .unwrap();
    let later = ts() + chrono::Duration::days(3);
    let parsed = ParsedFile {
        health: Some(ParsedHealth {
            samples: vec![HealthSample {
                metric: "heart_rate",
                unit: "bpm",
                timestamp: later,
                value: 66.0,
            }],
            ..Default::default()
        }),
        ..Default::default()
    };
    db.import_activities(ImportSource::Unstrap, None, parsed, ts())
        .unwrap();
    // 同步前的探测拿这个时刻比云端：导入的心率不能把它推到后面。
    let newest = db.stream_freshness().unwrap()["heart_rate"]
        .newest_sample_at
        .clone();
    assert_eq!(newest, Some(ts().to_rfc3339()));
}
