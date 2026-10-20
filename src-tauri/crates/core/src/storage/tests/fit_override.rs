//! #140：用户的 .fit 修正要顶住同步和重放，撤销后云端原值原样回来。

use super::*;
use crate::export_fit::{decode_fit_file, to_fit};

fn insert_cloud_workout(db: &Database) {
    db.insert_raw_record(&RawRecord {
        stream: "workouts".into(),
        source_key: "sport_history:run:fit-fixture".into(),
        source_scope: SourceScope::Device,
        device_id: None,
        start_utc: ts(),
        end_utc: None,
        payload: serde_json::json!({
            "data": [{
                "trackid": 1_700_000_000i64,
                "end_time": 1_700_000_600i64,
                "type": 1,
                "dis": "2600"
            }]
        }),
        capability: CapabilityStatus::Verified,
    })
    .unwrap();
    db.insert_raw_record(&RawRecord {
        stream: "workout_detail".into(),
        source_key: "workout_detail:1700000000:run.huami.com".into(),
        source_scope: SourceScope::Device,
        device_id: None,
        start_utc: ts(),
        end_utc: None,
        payload: serde_json::json!({
            "data": {
                "trackid": 1_700_000_000i64,
                "time": "0;300;300;",
                "heart_rate": "0,150;300,2;300,-2;"
            }
        }),
        capability: CapabilityStatus::Verified,
    })
    .unwrap();
    db.reprocess_raw_records().unwrap();
}

/// 一份「被修正过」的文件：同一个起点，距离 2200 m，中间停了 20 秒。
fn corrected_fit() -> Vec<u8> {
    let export = serde_json::json!({ "data": { "workouts": [{
        "workout_id": "1700000000",
        "workout_type": "running",
        "effective_type": "running",
        "start_time": "2023-11-14T22:13:20+00:00",
        "end_time": "2023-11-14T22:23:20+00:00",
        "distance_meters": 2200.0,
        "samples": [
            { "timestamp": "2023-11-14T22:13:20+00:00", "heart_rate": 140, "distance_m": 0.0 },
            { "timestamp": "2023-11-14T22:18:20+00:00", "heart_rate": 150, "distance_m": 1100.0 },
            { "timestamp": "2023-11-14T22:23:20+00:00", "heart_rate": 160, "distance_m": 2200.0 }
        ],
        "pauses": [{
            "start_time": "2023-11-14T22:15:00+00:00",
            "end_time": "2023-11-14T22:15:20+00:00",
            "kind": "manual"
        }]
    }]}});
    to_fit(&export).unwrap().0.remove(0).1
}

fn distance(db: &Database) -> Option<f64> {
    db.conn
        .query_row(
            "SELECT distance_meters FROM workouts WHERE workout_id = '1700000000'",
            [],
            |row| row.get(0),
        )
        .unwrap()
}

fn pause_count(db: &Database) -> i64 {
    db.conn
        .query_row("SELECT COUNT(*) FROM workout_pauses", [], |row| row.get(0))
        .unwrap()
}

#[test]
fn a_fit_correction_survives_replay_and_undo_restores_the_cloud() {
    let db = Database::in_memory().unwrap();
    insert_cloud_workout(&db);
    assert_eq!(distance(&db), Some(2600.0));
    assert_eq!(pause_count(&db), 0);

    let bytes = corrected_fit();
    let imported = decode_fit_file(&bytes).unwrap();
    let outcome = db
        .import_workout_fit("1700000000", Some("river.fit"), &bytes, &imported)
        .unwrap();
    let FitOverrideOutcome::Applied(info) = outcome else {
        panic!("应当接受同一起点的修正文件: {outcome:?}");
    };
    assert_eq!(info.original_distance_m, Some(2600.0));
    assert_eq!(distance(&db), Some(2200.0));
    assert_eq!(pause_count(&db), 1);

    // 重放（推修订号）和再同步都不能把修正冲掉。
    db.reprocess_raw_records().unwrap();
    assert_eq!(distance(&db), Some(2200.0));
    assert_eq!(pause_count(&db), 1);
    let series = db.get_workout_series("1700000000").unwrap();
    assert!(series.samples.iter().any(|s| s.distance_m == Some(2200.0)));

    assert!(db.remove_workout_fit("1700000000").unwrap());
    assert_eq!(distance(&db), Some(2600.0));
    assert_eq!(pause_count(&db), 0);
    assert!(db.workout_fit_override("1700000000").unwrap().is_none());
    // 云端序列回来了：原来的逐秒心率还在。
    let series = db.get_workout_series("1700000000").unwrap();
    assert!(series.samples.iter().any(|s| s.heart_rate == Some(150)));
}

#[test]
fn a_fit_from_another_workout_is_refused() {
    let db = Database::in_memory().unwrap();
    insert_cloud_workout(&db);
    let bytes = corrected_fit();
    let mut imported = decode_fit_file(&bytes).unwrap();
    imported.decoded.start_time += chrono::Duration::hours(3);
    let outcome = db
        .import_workout_fit("1700000000", None, &bytes, &imported)
        .unwrap();
    assert!(matches!(outcome, FitOverrideOutcome::StartMismatch { .. }));
    assert_eq!(distance(&db), Some(2600.0));
    assert!(db.workout_fit_override("1700000000").unwrap().is_none());
}
