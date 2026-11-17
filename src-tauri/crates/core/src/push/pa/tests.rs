use super::*;
use crate::models::{SourceScope, Workout};
use chrono::TimeZone;

fn today() -> NaiveDate {
    NaiveDate::from_ymd_opt(2024, 3, 10).unwrap()
}

fn options(full: bool) -> PaOptions {
    PaOptions {
        retention_days: 5,
        summary_days: 2,
        full_resolution_workouts: full,
    }
}

fn plan(db: &Database, previous: &Manifest, full: bool) -> Plan {
    build_plan(
        db,
        &options(full),
        previous,
        today(),
        &LocalStatus::default(),
        Utc::now(),
        "UTC",
    )
    .unwrap()
}

fn with_workout(id: &str) -> Database {
    let db = Database::in_memory().unwrap();
    let start = Local
        .with_ymd_and_hms(2024, 3, 10, 9, 0, 0)
        .single()
        .unwrap()
        .with_timezone(&Utc);
    db.insert_workout(&Workout {
        workout_id: id.into(),
        workout_type: "running".into(),
        normalized_type: "running".into(),
        type_source: "zepp_code".into(),
        effective_type: "running".into(),
        start_time: start,
        end_time: start + ChronoDuration::minutes(20),
        source_scope: SourceScope::Device,
        ..Default::default()
    })
    .unwrap();
    db
}

fn rels(plan: &Plan) -> Vec<&str> {
    plan.outgoing.iter().map(|(rel, _)| rel.as_str()).collect()
}

#[test]
fn first_round_sends_the_whole_window_and_status_last() {
    let db = with_workout("w1");
    let first = plan(&db, &Manifest::default(), false);
    let names = rels(&first);
    for day in days_back(today(), 5) {
        assert!(names.contains(&format!("days/{day}.json").as_str()), "{day}");
    }
    assert!(names.contains(&"workouts/w1.json"));
    assert!(!names.contains(&"workouts/w1.full.json"));
    assert_eq!(*names.last().unwrap(), "status.json");
    assert_eq!(first.days_considered, 5);
    assert!(check_no_coordinates(&first).is_ok());

    // 第二轮：只重新考虑最近 3 天，而且内容一样就不发。
    let second = plan(&db, &first.manifest, false);
    assert_eq!(second.days_considered, RECENT_DAYS);
    assert!(second.is_empty(), "{:?}", rels(&second));
}

#[test]
fn hidden_workouts_and_turned_off_full_resolution_are_deleted() {
    let db = with_workout("w1");
    let first = plan(&db, &Manifest::default(), true);
    assert!(rels(&first).contains(&"workouts/w1.full.json") || first.manifest.workouts["w1"].has_full == false);
    // 关掉逐秒：已经传上去的逐秒版要删。
    let mut previous = first.manifest.clone();
    previous.workouts.get_mut("w1").unwrap().has_full = true;
    let off = plan(&db, &previous, false);
    assert!(off.deletes.contains("workouts/w1.full.json"));

    // 本机隐藏了 / 删掉了这条运动：云端也删。
    let empty = Database::in_memory().unwrap();
    let gone = plan(&empty, &first.manifest, false);
    assert!(gone.deletes.contains("workouts/w1.json"));
    assert!(!gone.manifest.workouts.contains_key("w1"));
    assert_eq!(*rels(&gone).last().unwrap(), "status.json");
}

#[test]
fn days_that_slide_out_of_the_window_are_deleted() {
    let db = Database::in_memory().unwrap();
    let mut previous = Manifest::default();
    previous
        .days
        .insert("2024-01-01".into(), "2024-01-02T00:00:00+00:00".into());
    previous
        .objects
        .insert("days/2024-01-01.json".into(), "x".into());
    previous.workouts.insert(
        "old".into(),
        WorkoutEntry {
            date: "2024-01-01".into(),
            ..Default::default()
        },
    );
    let next = plan(&db, &previous, false);
    assert!(next.deletes.contains("days/2024-01-01.json"));
    assert!(next.deletes.contains("workouts/old.json"));
    assert!(!next.manifest.days.contains_key("2024-01-01"));
    assert!(!next.manifest.objects.contains_key("days/2024-01-01.json"));
}

#[test]
fn coordinates_abort_the_whole_round() {
    let mut bad = Plan::default();
    bad.outgoing
        .push(("days/x.json".into(), "{\"a\":1}".into()));
    bad.outgoing
        .push(("workouts/y.json".into(), "{\"lat\": 31.2}".into()));
    let error = check_no_coordinates(&bad).unwrap_err();
    assert!(error.contains("lat") && error.contains("workouts/y.json"));
}

#[test]
fn sampling_keeps_one_real_point_every_15_seconds() {
    let samples: Vec<Value> = (0..60)
        .map(|second| {
            json!({ "timestamp": format!("2024-03-10T01:00:{second:02}+00:00"), "heart_rate": second })
        })
        .collect();
    let kept = every_15s(&samples);
    let rates: Vec<i64> = kept.iter().map(|s| s["heart_rate"].as_i64().unwrap()).collect();
    assert_eq!(rates, vec![0, 15, 30, 45]);
    assert!(every_15s(&[json!({ "timestamp": "nope" })]).is_empty());
}

#[test]
fn content_hash_ignores_timestamps_only() {
    let a = json!({ "generated_at": "1", "x": 1 });
    let b = json!({ "generated_at": "2", "x": 1 });
    let c = json!({ "generated_at": "2", "x": 2 });
    assert_eq!(content_hash(&a), content_hash(&b));
    assert_ne!(content_hash(&b), content_hash(&c));
}

#[test]
fn secrets_are_validated_before_use() {
    let good = PaSecrets {
        tenant: None,
        dk: crypto::b64url(&[1u8; 32]),
        write_key: format!("zbw_abcdefghij_{}", "C".repeat(43)),
    };
    assert_eq!(good.validate().unwrap().tenant, "abcdefghij");
    let mut short = good.clone();
    short.dk = crypto::b64url(&[1u8; 16]);
    assert_eq!(short.validate().err(), Some("err.push.pa_data_key_malformed"));
    let mut other = good;
    other.tenant = Some("zzzzzzzzzz".into());
    assert_eq!(other.validate().err(), Some("err.push.pa_tenant_mismatch"));
}
