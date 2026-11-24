//! 建议卡规则：三种触发各自出、不该出的时候不出；发牌事实的起终点与小图。
//! 时间都按本机本地日造（规则按本地日判断），不受机器时区影响。

use super::*;
use chrono::TimeZone;

const TODAY: (i32, u32, u32) = (2026, 11, 20);

fn today() -> NaiveDate {
    NaiveDate::from_ymd_opt(TODAY.0, TODAY.1, TODAY.2).unwrap()
}

/// 今天往前 `days_ago` 天、本地 `hour` 点。
fn at(days_ago: i64, hour: u32) -> DateTime<Utc> {
    let day = today() - Duration::days(days_ago);
    Local
        .from_local_datetime(&day.and_hms_opt(hour, 0, 0).unwrap())
        .unwrap()
        .with_timezone(&Utc)
}

fn workout(db: &Database, id: &str, kind: &str, days_ago: i64, minutes: i64) {
    let start = at(days_ago, 7);
    db.conn
        .execute(
            "INSERT INTO workouts (workout_id, workout_type, start_time, end_time, distance_meters,
                                   source_scope, synced_at)
             VALUES (?1, ?2, ?3, ?4, 5000, 'device', ?4)",
            params![
                id,
                kind,
                start.to_rfc3339(),
                (start + Duration::minutes(minutes)).to_rfc3339()
            ],
        )
        .unwrap();
}

/// 一晚：醒来那天是今天往前 `days_ago` 天。
fn night(db: &Database, days_ago: i64, minutes: i64, deep: i64) {
    let end = at(days_ago, 7);
    db.conn
        .execute(
            "INSERT INTO sleep_sessions (sleep_id, start_time, end_time, duration_minutes, deep_minutes,
                                         light_minutes, rem_minutes, awake_minutes, source_scope)
             VALUES (?1, ?2, ?3, ?4, ?5, 0, 0, 0, 'device')",
            params![
                format!("night-{days_ago}"),
                (end - Duration::minutes(minutes)).to_rfc3339(),
                end.to_rfc3339(),
                minutes,
                deep
            ],
        )
        .unwrap();
}

fn codes(list: &[Suggestion]) -> Vec<&'static str> {
    list.iter()
        .map(|card| match card {
            Suggestion::WorkoutDone { .. } => "workout_done",
            Suggestion::SleepPoor { .. } => "sleep_poor",
            Suggestion::LongIdle { .. } => "long_idle",
        })
        .collect()
}

#[test]
fn a_fresh_workout_is_offered_for_review_with_its_recent_siblings() {
    let db = Database::in_memory().unwrap();
    for (i, days_ago) in [3, 6, 9, 12, 15, 18].into_iter().enumerate() {
        workout(&db, &format!("run-{i}"), "run", days_ago, 40);
    }
    workout(&db, "ride-old", "ride", 2, 60);
    // 今天：几分钟的自动识别活动不算，40 分钟的跑步算。
    workout(&db, "blip", "activity", 0, 6);
    workout(&db, "today-run", "run", 0, 40);

    let cards = db.suggestions(today()).unwrap();
    assert_eq!(codes(&cards), ["workout_done"]);
    let Suggestion::WorkoutDone {
        key,
        workout_id,
        same_type_ids,
        ..
    } = &cards[0]
    else {
        unreachable!()
    };
    assert_eq!(workout_id, "today-run");
    assert_eq!(key, "workout_done:today-run");
    // 同类最近四次，新 → 旧，不混进骑行。
    assert_eq!(same_type_ids, &["run-0", "run-1", "run-2", "run-3"]);

    // 交给过 AI 以后就不再问「复盘这次」。
    db.conn
        .execute(
            "INSERT INTO ai_exchanges(id, task_id, provider, question, days_before, categories,
                                      workout_ids, sent_at, md_path)
             VALUES ('x', 't', 'chatgpt', 'q', 13, '[]', '[\"today-run\"]', '2026-11-20T08:00:00Z', '')",
            [],
        )
        .unwrap();
    assert!(codes(&db.suggestions(today()).unwrap()).is_empty());
}

#[test]
fn a_short_night_against_the_personal_baseline_is_a_poor_night() {
    let db = Database::in_memory().unwrap();
    for days_ago in 1..=20 {
        night(&db, days_ago, 470, 100);
    }
    // 昨晚 6 小时：比 7 小时 50 分少了 110 分钟、低于 85%。
    night(&db, 0, 360, 95);
    let cards = db.suggestions(today()).unwrap();
    assert_eq!(codes(&cards), ["sleep_poor"]);
    let Suggestion::SleepPoor {
        key,
        short,
        deep_low,
        baseline_duration_min,
        baseline_nights,
        ..
    } = &cards[0]
    else {
        unreachable!()
    };
    assert_eq!(key, &format!("sleep_poor:{}", today()));
    assert!(*short && !*deep_low);
    assert_eq!(*baseline_duration_min, 470.0);
    assert_eq!(*baseline_nights, 20);
}

#[test]
fn deep_sleep_alone_can_make_a_poor_night_and_a_thin_baseline_says_nothing() {
    let db = Database::in_memory().unwrap();
    for days_ago in 1..=10 {
        night(&db, days_ago, 470, 110);
    }
    night(&db, 0, 465, 50);
    let cards = db.suggestions(today()).unwrap();
    let Some(Suggestion::SleepPoor {
        short, deep_low, ..
    }) = cards.first()
    else {
        panic!("{cards:?}")
    };
    assert!(!*short && *deep_low);

    // 只有 5 晚基线：不够周报同一个最少天数，就不下「睡得差」的结论。
    let thin = Database::in_memory().unwrap();
    for days_ago in 1..=5 {
        night(&thin, days_ago, 470, 110);
    }
    night(&thin, 0, 300, 20);
    assert!(codes(&thin.suggestions(today()).unwrap()).is_empty());
}

#[test]
fn long_idle_only_nudges_people_who_used_to_move() {
    let db = Database::in_memory().unwrap();
    for (i, days_ago) in [9, 12, 15, 18, 21].into_iter().enumerate() {
        workout(&db, &format!("w-{i}"), "run", days_ago, 30);
    }
    let cards = db.suggestions(today()).unwrap();
    assert_eq!(codes(&cards), ["long_idle"]);
    let Suggestion::LongIdle { days, key, .. } = &cards[0] else {
        unreachable!()
    };
    assert_eq!(*days, 9);
    assert_eq!(key, "long_idle:w-0");

    // 以前几乎不运动：不催。
    let rare = Database::in_memory().unwrap();
    workout(&rare, "once", "run", 30, 30);
    assert!(codes(&rare.suggestions(today()).unwrap()).is_empty());

    // 五天以内动过：不算很久。
    workout(&db, "recent", "ride", 4, 30);
    assert!(codes(&db.suggestions(today()).unwrap()).is_empty());
}

#[test]
fn hand_facts_carry_route_ends_races_and_nightly_recovery() {
    let db = Database::in_memory().unwrap();
    workout(&db, "loop", "run", 2, 30);
    workout(&db, "race", "run", 1, 30);
    let start = at(2, 7);
    for i in 0..50_i64 {
        db.conn
            .execute(
                "INSERT INTO route_points (workout_id, timestamp, latitude, longitude)
                 VALUES ('loop', ?1, ?2, ?3)",
                params![
                    (start + Duration::seconds(i * 10)).to_rfc3339(),
                    31.123456 + i as f64 * 0.0001,
                    121.5
                ],
            )
            .unwrap();
        db.conn
            .execute(
                "INSERT INTO workout_samples (workout_id, timestamp, heart_rate)
                 VALUES ('loop', ?1, ?2)",
                params![(start + Duration::seconds(i * 10)).to_rfc3339(), 120 + i],
            )
            .unwrap();
    }
    db.conn
        .execute(
            "INSERT INTO races(name, race_date, sport, priority, workout_id, created_at, updated_at)
             VALUES ('10K', '2026-11-19', 'run', 'a', 'race', '', '')",
            [],
        )
        .unwrap();
    night(&db, 1, 450, 90);
    db.conn
        .execute(
            "INSERT INTO daily_metrics (date, metric, value, unit, source_scope)
             VALUES (?1, 'sleep_hrv', 48, 'ms', 'device'), (?1, 'resting_hr', 52, 'bpm', 'device')",
            params![(today() - Duration::days(1)).to_string()],
        )
        .unwrap();

    let facts = db.hand_facts(today(), 30).unwrap();
    let ids: Vec<_> = facts.workouts.iter().map(|w| w.workout_id.as_str()).collect();
    assert_eq!(ids, ["loop", "race"]);
    assert_eq!(facts.workouts[0].start, Some([31.1235, 121.5]));
    assert_eq!(facts.workouts[0].end, Some([31.1284, 121.5]));
    assert!(!facts.workouts[0].race && facts.workouts[1].race);
    assert_eq!(facts.workouts[1].start, None, "没有轨迹就不编起点");
    let last = facts.nights.last().unwrap();
    assert_eq!(
        (last.duration_min, last.hrv, last.resting_hr),
        (Some(450.0), Some(48.0), Some(52.0))
    );

    let lines = db.hand_lines(&["loop".into(), "race".into()]).unwrap();
    assert!(lines[0].route.len() >= 20 && lines[0].route.len() <= 30);
    assert_eq!(lines[0].hr.len() as i64, facts::HR_POINTS);
    assert!(lines[1].route.is_empty() && lines[1].hr.is_empty());
}
