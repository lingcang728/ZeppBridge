use std::fs;
use std::path::PathBuf;
use std::process::{Command, Output};

use chrono::{Duration, TimeZone, Utc};
use serde_json::{json, Value};
use zeppbridge_core::decoder::workout_detail::{RoutePoint, WorkoutSample};
use zeppbridge_core::decoder::DecodedWorkout;
use zeppbridge_core::models::{
    DailyMetric, DeviceIdentityHint, MetricSample, SourceScope, Workout,
};
use zeppbridge_core::storage::Database;

struct Fixture(PathBuf);

impl Fixture {
    fn new() -> Self {
        let dir = std::env::temp_dir().join(format!(
            "zeppbridge-export-data-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir(&dir).unwrap();
        let fixture = Self(dir);
        let db = Database::open_migrated(&fixture.0.join("zepp.db")).unwrap();
        let start = Utc.with_ymd_and_hms(2023, 11, 5, 12, 0, 0).unwrap();
        let end = start + Duration::minutes(30);
        db.upsert_device_identity(&DeviceIdentityHint {
            aliases: vec!["private-device-id".into()],
            device_id: Some("private-device-id".into()),
            serial: Some("private-serial".into()),
            ..Default::default()
        })
        .unwrap();
        db.insert_daily_metric(&DailyMetric {
            date: "2023-11-05".into(),
            metric: "steps".into(),
            value: 1234.0,
            unit: "steps".into(),
            source_scope: SourceScope::Device,
            device_id: Some("private-device-id".into()),
        })
        .unwrap();
        let workout: Workout = serde_json::from_value(json!({
            "workout_id": "synthetic-run",
            "workout_type": "outdoor_running",
            "normalized_type": "outdoor_running",
            "type_source": "string_field",
            "effective_type": "outdoor_running",
            "start_time": start,
            "end_time": end,
            "source_scope": "device",
            "device_id": "private-device-id"
        }))
        .unwrap();
        db.insert_workout(&workout).unwrap();
        let mut decoded = DecodedWorkout {
            start_time: start,
            end_time: end,
            ..Default::default()
        };
        for (offset, value) in [(0, 72), (60, 84)] {
            let timestamp = start + Duration::seconds(offset);
            db.insert_metric_sample_with_raw(
                &MetricSample {
                    metric: "heart_rate".into(),
                    timestamp,
                    value: f64::from(value),
                    unit: "bpm".into(),
                    source_scope: SourceScope::Device,
                    device_id: Some("private-device-id".into()),
                },
                None,
            )
            .unwrap();
            decoded.route.push(RoutePoint {
                timestamp,
                latitude: 22.0,
                longitude: 114.0,
                altitude_m: None,
            });
            decoded.samples.push(
                serde_json::from_value::<WorkoutSample>(json!({
                    "timestamp": timestamp,
                    "heart_rate": value
                }))
                .unwrap(),
            );
        }
        db.replace_workout_series("synthetic-run", &decoded)
            .unwrap();
        fixture
    }

    fn export(&self, args: &[&str]) -> Output {
        Command::new(env!("CARGO_BIN_EXE_zeppbridge-cli"))
            .arg("export")
            .args(args)
            .env("ZEPPBRIDGE_DATA_DIR", &self.0)
            .output()
            .unwrap()
    }
}

impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

#[test]
fn exports_preserve_data_and_do_not_modify_the_source_database() {
    let fixture = Fixture::new();
    let original_db = fs::read(fixture.0.join("zepp.db")).unwrap();
    let dates = ["--from", "2023-11-01", "--to", "2023-11-30"];

    let output = fixture.export(&dates);
    assert!(output.status.success(), "{output:?}");
    let payload: Value = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(payload["data"]["daily_metrics"][0]["value"], 1234.0);
    assert_eq!(payload["data"]["workouts"].as_array().unwrap().len(), 1);
    assert!(payload["data"]["workouts"][0].get("route").is_none());

    let output =
        fixture.export(&[&dates[..], &["--types", " HEART_RATE ", "--format", "json"]].concat());
    assert!(output.status.success(), "{output:?}");
    let payload: Value = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(payload["data"]["metric_samples"][0]["samples"], 2);

    let output =
        fixture.export(&[&dates[..], &["--types", "heart_rate", "--format", "csv"]].concat());
    assert!(output.status.success(), "{output:?}");
    let csv = String::from_utf8(output.stdout).unwrap();
    assert_eq!(
        csv.lines().count(),
        3,
        "header and both individual readings"
    );
    assert!(csv.contains(",heart_rate,72,"));
    assert!(csv.contains(",heart_rate,84,"));
    assert!(csv.lines().skip(1).all(|line| line.ends_with(",device_1")));
    assert!(!csv.contains("private-device-id"));

    for scope in [&dates[..], &["--workout", "synthetic-run"][..]] {
        let output = fixture.export(&[scope, &["--format", "gpx"]].concat());
        assert!(output.status.success(), "{output:?}");
        let gpx = String::from_utf8(output.stdout).unwrap();
        assert_eq!(gpx.matches("<trkpt ").count(), 2);
        assert_eq!(gpx.matches("<gpxtpx:hr>").count(), 2);
    }

    let fit_dir = fixture.0.join("fit");
    let output = fixture.export(&[
        "--workout",
        "synthetic-run",
        "--format",
        "fit",
        "--out",
        fit_dir.to_str().unwrap(),
        "--json",
    ]);
    assert!(output.status.success(), "{output:?}");
    let files: Vec<_> = fs::read_dir(&fit_dir).unwrap().collect();
    assert_eq!(files.len(), 1);
    let bytes = fs::read(files[0].as_ref().unwrap().path()).unwrap();
    assert_eq!(&bytes[8..12], b".FIT");

    let existing = fixture.0.join("existing.json");
    fs::write(&existing, "keep this file").unwrap();
    let output = fixture.export(&[
        "--workout",
        "synthetic-run",
        "--types",
        "workouts,typo",
        "--out",
        existing.to_str().unwrap(),
        "--json",
    ]);
    assert_eq!(output.status.code(), Some(2));
    assert_eq!(fs::read_to_string(existing).unwrap(), "keep this file");
    assert_eq!(fs::read(fixture.0.join("zepp.db")).unwrap(), original_db);
}
