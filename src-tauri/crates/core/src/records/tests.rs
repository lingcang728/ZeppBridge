use super::*;
use crate::models::{
    CapabilityStatus, DailyMetric, MetricSample, RawRecord, SleepSession, SourceScope, Workout,
};
use chrono::{Local, TimeZone};

const DAY: &str = "2024-03-10";

fn local_noon() -> DateTime<Utc> {
    Local
        .with_ymd_and_hms(2024, 3, 10, 12, 0, 0)
        .single()
        .unwrap()
        .with_timezone(&Utc)
}

fn raw(db: &Database, key: &str) -> i64 {
    db.insert_raw_record(&RawRecord {
        stream: "test".into(),
        source_key: key.into(),
        source_scope: SourceScope::Device,
        device_id: None,
        start_utc: local_noon(),
        end_utc: None,
        payload: serde_json::json!({ "k": key }),
        capability: CapabilityStatus::Verified,
    })
    .unwrap()
}

fn set_fetched(db: &Database, id: i64, at: &str) {
    db.conn
        .execute(
            "UPDATE raw_records SET fetched_at = ?2 WHERE id = ?1",
            rusqlite::params![id, at],
        )
        .unwrap();
}

fn workout(id: &str, start: DateTime<Utc>) -> Workout {
    Workout {
        workout_id: id.into(),
        workout_type: "running".into(),
        normalized_type: "running".into(),
        type_source: "zepp_code".into(),
        effective_type: "running".into(),
        start_time: start,
        end_time: start + chrono::Duration::minutes(30),
        distance_meters: Some(5000.0),
        calories: Some(300),
        source_scope: SourceScope::Device,
        ..Default::default()
    }
}

fn sleep(id: &str, start: DateTime<Utc>) -> SleepSession {
    SleepSession {
        sleep_id: id.into(),
        start_time: start,
        end_time: start + chrono::Duration::hours(7),
        score: Some(80),
        duration_minutes: 420,
        deep_minutes: Some(90),
        light_minutes: Some(240),
        rem_minutes: Some(60),
        awake_minutes: Some(30),
        source_scope: SourceScope::Device,
        device_id: None,
        synced_at: None,
        time_in_bed_minutes: None,
        stages: Vec::new(),
        wake_count: None,
    }
}

/// 两条运动（一条官方、一条旧通道）、一晚睡眠、一天步数、两个心率点。
fn seeded() -> Database {
    let db = Database::in_memory().unwrap();
    let noon = local_noon();
    let legacy_raw = raw(&db, "legacy");
    let official_raw = raw(&db, "official");
    set_fetched(&db, legacy_raw, "2024-03-10T01:00:00+00:00");
    set_fetched(&db, official_raw, "2024-03-12T01:00:00+00:00");

    db.insert_workout_with_raw(&workout("w-legacy", noon), Some(legacy_raw))
        .unwrap();
    db.insert_workout_with_raw(
        &workout("w-official", noon + chrono::Duration::hours(2)),
        Some(official_raw),
    )
    .unwrap();
    db.insert_sleep_session_with_raw(
        &sleep("official:1", noon - chrono::Duration::hours(10)),
        Some(official_raw),
    )
    .unwrap();
    db.insert_daily_metric_with_raw(
        &DailyMetric {
            date: DAY.into(),
            metric: "steps".into(),
            value: 8000.0,
            unit: "count".into(),
            source_scope: SourceScope::UserFused,
            device_id: None,
        },
        Some(legacy_raw),
    )
    .unwrap();
    for (minutes, raw_id) in [(0, legacy_raw), (1, official_raw)] {
        db.insert_metric_sample_with_raw(
            &MetricSample {
                metric: "heart_rate".into(),
                timestamp: noon + chrono::Duration::minutes(minutes),
                value: 60.0 + minutes as f64,
                unit: "bpm".into(),
                source_scope: SourceScope::Device,
                device_id: None,
            },
            Some(raw_id),
        )
        .unwrap();
    }
    for table in [
        "workouts",
        "sleep_sessions",
        "metric_samples",
        "daily_metrics",
    ] {
        db.conn
            .execute(
                &format!("UPDATE {table} SET provider = 'official' WHERE raw_record_id = ?1"),
                [official_raw],
            )
            .unwrap();
    }
    db
}

fn query(types: &[&str]) -> RecordQuery {
    RecordQuery::range(types, DAY, DAY, None)
}

fn by_id<'a>(value: &'a Value, list: &str, key: &str, id: &str) -> &'a Value {
    value["data"][list]
        .as_array()
        .unwrap()
        .iter()
        .find(|item| item[key] == id)
        .unwrap_or_else(|| panic!("{list} 里没有 {id}"))
}

#[test]
fn every_record_carries_its_provider_as_source() {
    let db = seeded();
    let set = query_records(
        &db,
        &query(&["workouts", "sleep", "daily_activity", "steps", "heart_rate"]),
    )
    .unwrap();
    let value = &set.value;
    assert_eq!(value["records_version"], RECORDS_VERSION);
    assert_eq!(
        by_id(value, "workouts", "workout_id", "w-legacy")["source"],
        "advanced"
    );
    assert_eq!(
        by_id(value, "workouts", "workout_id", "w-official")["source"],
        "official"
    );
    assert_eq!(
        by_id(value, "sleep_sessions", "sleep_id", "official:1")["source"],
        "official"
    );
    assert_eq!(
        by_id(value, "daily_metrics", "metric", "steps")["source"],
        "advanced"
    );
    // 摘要模式下心率按小时聚合，两个来源的点落在同一个小时里。
    let hour = &value["data"]["metric_samples"][0];
    assert_eq!(hour["metric"], "heart_rate");
    assert_eq!(hour["source"], "mixed");
    for list in [
        "workouts",
        "sleep_sessions",
        "daily_metrics",
        "metric_samples",
    ] {
        for item in value["data"][list].as_array().unwrap() {
            assert!(item.get("source").is_some(), "{list} 有一条没带 source");
        }
    }
}

#[test]
fn output_is_a_superset_of_the_ai_export() {
    let db = seeded();
    let types = ["workouts", "sleep", "steps", "heart_rate"];
    let (plain, count) = db
        .build_ai_export_value(&ExportSelection {
            scope: Some(ExportScope::date_range(DAY, DAY)),
            start_date: None,
            end_date: None,
            data_types: types.iter().map(|value| value.to_string()).collect(),
            detail: ExportDetail::Full,
        })
        .unwrap();
    let mut q = query(&types);
    q.detail = ExportDetail::Full;
    q.include_gps = true;
    let set = query_records(&db, &q).unwrap();
    assert_eq!(set.record_count, count);
    assert_eq!(set.value["schema_version"], plain["schema_version"]);
    for (key, original) in plain.as_object().unwrap() {
        if key == "generated_at" || key == "data" {
            continue;
        }
        assert_eq!(&set.value[key], original, "顶层字段 {key} 变了");
    }
    for (list, items) in plain["data"].as_object().unwrap() {
        let enriched = set.value["data"][list].as_array().unwrap();
        for (index, item) in items.as_array().unwrap().iter().enumerate() {
            for (field, original) in item.as_object().unwrap() {
                assert_eq!(&enriched[index][field], original, "{list}[{index}].{field}");
            }
        }
    }
}

#[test]
fn since_keeps_only_records_fetched_after_it() {
    let db = seeded();
    let since = DateTime::parse_from_rfc3339("2024-03-11T00:00:00+00:00")
        .unwrap()
        .with_timezone(&Utc);
    let mut q = query(&["workouts", "sleep", "steps"]);
    q.since = Some(since);
    let set = query_records(&db, &q).unwrap();
    let workouts = set.value["data"]["workouts"].as_array().unwrap();
    assert_eq!(workouts.len(), 1);
    assert_eq!(workouts[0]["workout_id"], "w-official");
    assert_eq!(
        set.value["data"]["sleep_sessions"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
    assert!(set.value["data"]["daily_metrics"]
        .as_array()
        .unwrap()
        .is_empty());
    assert_eq!(set.record_count, 2);
    assert_eq!(set.value["record_count"], 2);
    assert!(set.value["since"]
        .as_str()
        .unwrap()
        .starts_with("2024-03-11"));
}

#[test]
fn late_workout_detail_counts_as_a_change() {
    let db = seeded();
    let detail = raw(&db, "placeholder");
    db.conn
        .execute(
            "UPDATE raw_records SET stream = 'workout_detail',
                source_key = 'workout_detail:w-legacy:run', fetched_at = '2024-03-15T00:00:00+00:00'
             WHERE id = ?1",
            [detail],
        )
        .unwrap();
    let mut q = query(&["workouts"]);
    q.since = Some(
        DateTime::parse_from_rfc3339("2024-03-14T00:00:00+00:00")
            .unwrap()
            .with_timezone(&Utc),
    );
    let set = query_records(&db, &q).unwrap();
    let ids: Vec<&str> = set.value["data"]["workouts"]
        .as_array()
        .unwrap()
        .iter()
        .map(|item| item["workout_id"].as_str().unwrap())
        .collect();
    assert_eq!(ids, vec!["w-legacy"]);
}

#[test]
fn gps_is_dropped_unless_asked_for() {
    let db = seeded();
    let mut q = query(&["workouts"]);
    q.detail = ExportDetail::Full;
    let without = query_records(&db, &q).unwrap();
    assert_eq!(without.value["gps_included"], false);
    for item in without.value["data"]["workouts"].as_array().unwrap() {
        assert!(item.get("route").is_none());
        assert!(item.get("samples").is_some());
    }
    q.include_gps = true;
    let with = query_records(&db, &q).unwrap();
    for item in with.value["data"]["workouts"].as_array().unwrap() {
        assert!(item.get("route").is_some());
    }
}

#[test]
fn flatten_orders_and_labels_records() {
    let db = seeded();
    let set = query_records(&db, &query(&["workouts", "sleep", "steps"])).unwrap();
    let flat = flatten(&set);
    let kinds: Vec<&str> = flat.iter().map(|item| item.record_type).collect();
    assert_eq!(
        kinds,
        vec!["sleep_session", "workout", "workout", "daily_metric"]
    );
    assert!(flat
        .iter()
        .all(|item| item.value["record_type"] == item.record_type));
}

#[test]
fn type_aliases_expand_and_unknown_types_are_reported() {
    assert_eq!(
        expand_types(["activity", "HRV", "steps"]).unwrap(),
        vec!["daily_activity", "steps", "hrv", "hrv_rmssd"]
    );
    assert_eq!(
        expand_types(DEFAULT_RECORD_TYPES).unwrap(),
        vec![
            "sleep",
            "heart_rate",
            "hrv",
            "hrv_rmssd",
            "daily_activity",
            "steps",
            "workouts",
            "weight"
        ]
    );
    assert_eq!(
        expand_types(["sleep", "gps", "nope"]).unwrap_err(),
        vec!["gps", "nope"]
    );
}

#[test]
fn hourly_provenance_uses_the_export_device_bucket_and_actual_inputs() {
    let db = seeded();
    let mut ids = db
        .conn
        .prepare("SELECT DISTINCT provider FROM metric_samples ORDER BY provider")
        .unwrap();
    let providers = ids
        .query_map([], |row| row.get::<_, String>(0))
        .unwrap()
        .collect::<rusqlite::Result<Vec<_>>>()
        .unwrap();
    for (index, provider) in providers.iter().enumerate() {
        let alias = format!("synthetic-device-{index}");
        db.conn
            .execute(
                "INSERT INTO device_identities(alias, updated_at) VALUES(?1, ?2)",
                rusqlite::params![alias, DAY],
            )
            .unwrap();
        db.conn
            .execute(
                "UPDATE metric_samples SET device_id = ?1 WHERE provider = ?2",
                rusqlite::params![alias, provider],
            )
            .unwrap();
    }
    let mut request = query(&["heart_rate"]);
    let summary = query_records(&db, &request).unwrap().value;
    let samples = summary["data"]["metric_samples"].as_array().unwrap();
    assert_eq!(samples.len(), 2);
    for (index, provider) in providers.iter().enumerate() {
        let label = format!("device_{}", index + 1);
        let expected = if provider == "official" {
            "official"
        } else {
            "advanced"
        };
        assert_eq!(
            by_id(&summary, "metric_samples", "device_label", &label)["source"],
            expected
        );
    }
    request.since = Some(
        DateTime::parse_from_rfc3339("2024-03-12T01:00:00+00:00")
            .unwrap()
            .with_timezone(&Utc),
    );
    let filtered = query_records(&db, &request).unwrap().value;
    assert_eq!(
        filtered["data"]["metric_samples"].as_array().unwrap().len(),
        1
    );
    assert!(filtered["data"]["metric_samples"][0]
        .get("_sample_fetched_at")
        .is_none());
}
