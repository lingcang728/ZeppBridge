//! 主观层：鞋认得对、里程不编、PB 不比真实快、比赛成绩优先、用户写的东西校验不过就不存。
use super::*;
use crate::storage::life_events::LifeEventInput;
use crate::storage::logbook::annotations::AnnotationInput;
use crate::storage::logbook::injuries::InjuryInput;
use crate::storage::logbook::races::RaceInput;
use crate::storage::logbook::records::{fastest_span, fastest_splits};
use crate::storage::logbook::shoes::ShoeInput;

fn workout(
    db: &Database,
    id: &str,
    kind: &str,
    date: (i32, u32, u32),
    km: f64,
    gear: Option<&str>,
) {
    let mut w = workout_with_type(None, kind, "verified");
    w.workout_id = id.into();
    w.start_time = Local
        .with_ymd_and_hms(date.0, date.1, date.2, 7, 0, 0)
        .unwrap()
        .with_timezone(&Utc);
    w.end_time = w.start_time + chrono::Duration::seconds((km * 330.0) as i64);
    w.distance_meters = Some(km * 1000.0);
    w.gear_id = gear.map(str::to_string);
    db.insert_workout(&w).unwrap();
}

fn shoe(name: &str, sport: &str, default: bool, gear: Option<&str>) -> ShoeInput {
    ShoeInput {
        id: None,
        name: name.into(),
        sport: sport.into(),
        is_default: default,
        zepp_gear_id: gear.map(str::to_string),
        start_km: 0.0,
        retire_km: 700.0,
        started_on: "2026-01-01".into(),
        retired_on: None,
        notes: String::new(),
    }
}

fn feel(id: &str, mode: &str, shoe_id: Option<i64>) -> AnnotationInput {
    AnnotationInput {
        workout_id: id.into(),
        rpe: None,
        soreness: vec![],
        shoe_mode: mode.into(),
        shoe_id,
    }
}

#[test]
fn shoes_are_credited_by_choice_then_zepp_then_default_and_never_by_guess() {
    let db = Database::in_memory().unwrap();
    workout(&db, "zepp", "run", (2026, 3, 1), 10.0, Some("g-1"));
    workout(&db, "plain", "run", (2026, 3, 2), 8.0, None);
    workout(&db, "trail", "trail_running", (2026, 3, 3), 12.0, None);
    workout(&db, "before", "run", (2025, 12, 30), 5.0, None);
    workout(
        &db,
        "unknown-gear",
        "walking",
        (2026, 3, 4),
        3.0,
        Some("g-2"),
    );
    workout(&db, "ride", "ride", (2026, 3, 5), 40.0, None);
    let daily = db.save_shoe(&shoe("Daily", "running", true, None)).unwrap();
    let mut racer = shoe("Racer", "running", false, Some("g-1"));
    racer.start_km = 100.0;
    let racer = db.save_shoe(&racer).unwrap();

    let (shoes, gear) = db.shoe_overview().unwrap();
    let km = |id: i64| {
        shoes
            .iter()
            .find(|s| s.shoe.input.id == Some(id))
            .unwrap()
            .km
    };
    // Zepp 编号认到 Racer；没编号的按默认鞋；越野跑没有越野默认时用跑鞋默认；服役前那次不算。
    assert_eq!(km(racer), 110.0);
    assert_eq!(km(daily), 20.0);
    assert_eq!(gear.len(), 1);
    assert_eq!(gear[0].zepp_gear_id, "g-2");
    assert_eq!(gear[0].sport, Some("walking"));

    // 用户指定的压过一切；明说没穿登记的鞋就哪双都不算。
    db.save_workout_feel(&feel("zepp", "chosen", Some(daily)))
        .unwrap();
    db.save_workout_feel(&feel("plain", "none", None)).unwrap();
    let (shoes, _) = db.shoe_overview().unwrap();
    let km = |id: i64| {
        shoes
            .iter()
            .find(|s| s.shoe.input.id == Some(id))
            .unwrap()
            .km
    };
    assert_eq!(km(racer), 100.0);
    assert_eq!(km(daily), 22.0);
    let view = db.workout_feel("zepp").unwrap().unwrap();
    assert_eq!(view.assigned.unwrap().how, "chosen");
    assert!(db.workout_feel("ride").unwrap().unwrap().footwear.is_none());

    // 同一用途只能有一双默认；删鞋把指定它的运动放回自动。
    db.save_shoe(&shoe("Second", "running", true, None))
        .unwrap();
    let defaults = db
        .list_shoe_rows()
        .unwrap()
        .iter()
        .filter(|s| s.input.is_default)
        .count();
    assert_eq!(defaults, 1);
    db.delete_shoe(daily).unwrap();
    assert_eq!(db.workout_feel("zepp").unwrap().unwrap().shoe_mode, "auto");
    // 一个 Zepp 编号只能认到一双鞋。
    assert!(db
        .save_shoe(&shoe("Copy", "running", false, Some("g-1")))
        .is_err());
}

#[test]
fn wear_warns_near_and_at_the_retire_distance() {
    let db = Database::in_memory().unwrap();
    workout(&db, "long", "run", (2026, 3, 1), 30.0, None);
    let mut near = shoe("Near", "running", true, None);
    near.start_km = 610.0;
    db.save_shoe(&near).unwrap();
    let (shoes, _) = db.shoe_overview().unwrap();
    assert_eq!((shoes[0].km, shoes[0].wear), (640.0, "near"));
    let mut due = near.clone();
    due.id = shoes[0].shoe.input.id;
    due.start_km = 680.0;
    db.save_shoe(&due).unwrap();
    assert_eq!(db.shoe_overview().unwrap().0[0].wear, "due");
    let mut bad = shoe("Bad", "skates", false, None);
    assert!(db.save_shoe(&bad).is_err());
    bad.sport = "running".into();
    bad.retire_km = 20.0;
    assert!(db.save_shoe(&bad).is_err());
}

#[test]
fn feelings_keep_the_watch_rpe_and_refuse_unknown_body_parts() {
    let db = Database::in_memory().unwrap();
    let mut w = workout_with_type(None, "run", "verified");
    w.rpe = Some(6);
    db.insert_workout(&w).unwrap();
    let mut input = feel("same-workout", "auto", None);
    input.rpe = Some(8);
    input.soreness = vec!["knee_l".into(), "calf_r".into(), "knee_l".into()];
    db.save_workout_feel(&input).unwrap();
    let view = db.workout_feel("same-workout").unwrap().unwrap();
    assert_eq!((view.rpe, view.watch_rpe), (Some(8), Some(6)));
    assert_eq!(view.soreness, ["calf_r", "knee_l"]);

    for bad in [
        AnnotationInput {
            rpe: Some(11),
            ..input.clone()
        },
        AnnotationInput {
            soreness: vec!["elbow".into()],
            ..input.clone()
        },
        AnnotationInput {
            workout_id: "missing".into(),
            ..input.clone()
        },
        feel("same-workout", "chosen", Some(99)),
    ] {
        assert!(db.save_workout_feel(&bad).is_err());
    }
    // 全清空就不留行。
    db.save_workout_feel(&feel("same-workout", "auto", None))
        .unwrap();
    let rows: i64 = db
        .conn
        .query_row("SELECT COUNT(*) FROM workout_annotations", [], |r| r.get(0))
        .unwrap();
    assert_eq!(rows, 0);
}

#[test]
fn fastest_span_never_reports_less_distance_than_asked() {
    // 4 m/s 匀速，中间一段 5 m/s；采样 1 秒一个。
    let mut points = Vec::new();
    let mut d = 0.0;
    for t in 0..3000 {
        points.push((t, d));
        d += if (1000..1500).contains(&t) { 5.0 } else { 4.0 };
    }
    // 1000 m 最快：全在快段里 200 秒。
    assert_eq!(fastest_span(&points, 1000.0), Some(200));
    // 距离倒退会切断窗口：后半截从 0 重新累计，跨不过去。
    let mut reset = points[..300].to_vec();
    reset.extend((0..300).map(|t| (300 + t, t as f64 * 4.0)));
    assert_eq!(fastest_span(&reset, 1500.0), None);
    assert_eq!(fastest_span(&reset, 1000.0), Some(250));

    let splits = [
        (1, 1000.0, 300, false),
        (2, 1000.0, 290, false),
        (3, 640.0, 200, true),
        (4, 1000.0, 250, false),
        (5, 1000.0, 250, false),
    ];
    assert_eq!(fastest_splits(&splits, 2), Some(500));
    assert_eq!(fastest_splits(&splits, 3), None);
}

#[test]
fn personal_records_prefer_race_results_and_drop_impossible_paces() {
    let db = Database::in_memory().unwrap();
    workout(&db, "tempo", "run", (2026, 4, 1), 6.0, None);
    workout(&db, "gps-glitch", "run", (2026, 4, 2), 6.0, None);
    workout(&db, "race-day", "run", (2026, 4, 12), 10.1, None);
    let insert = |id: &str, pace: f64| {
        let mut statement = db
            .conn
            .prepare(
                "INSERT INTO workout_samples(workout_id, timestamp, distance_m) VALUES(?1, ?2, ?3)",
            )
            .unwrap();
        for t in 0..2000_i64 {
            let at = DateTime::from_timestamp(1_775_000_000 + t, 0)
                .unwrap()
                .to_rfc3339();
            statement
                .execute(params![id, at, t as f64 * 1000.0 / pace])
                .unwrap();
        }
    };
    insert("tempo", 270.0); // 4:30/km → 5K 1350 秒
    insert("gps-glitch", 100.0); // 1:40/km，不可能
    let race = db
        .save_race(&RaceInput {
            id: None,
            name: "City 10K".into(),
            race_date: "2026-04-12".into(),
            sport: "running".into(),
            distance_m: Some(10_000.0),
            goal_seconds: Some(2700),
            priority: "a".into(),
            result_seconds: Some(2650),
            workout_id: Some("race-day".into()),
            notes: String::new(),
        })
        .unwrap();
    let records = db.personal_records().unwrap();
    let row = |key: &str| {
        records
            .records
            .iter()
            .find(|r| r.key == key)
            .unwrap()
            .clone()
    };
    let five = row("5k").best.unwrap();
    assert_eq!(
        (five.seconds, five.method, five.workout_id.as_deref()),
        (1350, "samples", Some("tempo"))
    );
    let ten = row("10k").best.unwrap();
    assert_eq!(
        (ten.seconds, ten.method, ten.race_id),
        (2650, "race", Some(race))
    );
    assert!(
        row("10k").runners_up.is_empty(),
        "比赛认到的那次运动不重复列"
    );
    assert!(row("half").best.is_none());
}

#[test]
fn a_past_race_without_result_suggests_the_closest_workout_that_day() {
    let db = Database::in_memory().unwrap();
    workout(&db, "warmup", "run", (2026, 5, 3), 2.0, None);
    workout(&db, "the-race", "run", (2026, 5, 3), 21.3, None);
    workout(&db, "ride", "ride", (2026, 5, 3), 21.0, None);
    let input = RaceInput {
        id: None,
        name: "Half".into(),
        race_date: "2026-05-03".into(),
        sport: "running".into(),
        distance_m: Some(21_097.5),
        goal_seconds: None,
        priority: "a".into(),
        result_seconds: None,
        workout_id: None,
        notes: String::new(),
    };
    db.save_race(&input).unwrap();
    let candidate = db.list_races().unwrap()[0].candidate.clone().unwrap();
    assert_eq!(candidate.workout_id, "the-race");
    for bad in [
        RaceInput {
            priority: "z".into(),
            ..input.clone()
        },
        RaceInput {
            race_date: "2026-02-30".into(),
            ..input.clone()
        },
        RaceInput {
            result_seconds: Some(0),
            ..input.clone()
        },
        RaceInput {
            name: "  ".into(),
            ..input.clone()
        },
    ] {
        assert!(db.save_race(&bad).is_err());
    }
}

#[test]
fn injuries_and_epochs_round_trip() {
    let db = Database::in_memory().unwrap();
    let injury = InjuryInput {
        id: None,
        title: "左膝外侧痛".into(),
        body_part: Some("knee_l".into()),
        severity: Some(2),
        start_date: "2026-06-01".into(),
        end_date: None,
        notes: String::new(),
    };
    db.save_injury(&injury).unwrap();
    db.save_injury(&InjuryInput {
        end_date: Some("2026-05-20".into()),
        start_date: "2026-05-01".into(),
        ..injury.clone()
    })
    .unwrap();
    let list = db.list_injuries().unwrap();
    assert!(list[0].input.end_date.is_none(), "没好的排前面");
    assert!(db
        .save_injury(&InjuryInput {
            body_part: Some("tail".into()),
            ..injury.clone()
        })
        .is_err());
    assert!(db
        .save_injury(&InjuryInput {
            severity: Some(4),
            ..injury.clone()
        })
        .is_err());

    let id = db
        .save_life_event(&LifeEventInput {
            id: None,
            title: "备战首马".into(),
            category: "training".into(),
            start_date: "2026-06-01".into(),
            end_date: Some("2026-10-20".into()),
            notes: String::new(),
            epoch: true,
        })
        .unwrap();
    let events = db.list_life_events(None, None).unwrap();
    assert_eq!(
        (events[0].input.id, events[0].input.epoch),
        (Some(id), true)
    );
}

#[test]
fn the_ai_gets_open_and_recent_injuries_shoes_in_use_and_how_workouts_felt() {
    let db = Database::in_memory().unwrap();
    let today = Local::now().date_naive();
    let day = |offset: i64| (today + chrono::Duration::days(offset)).to_string();
    let injury = |title: &str, start: i64, end: Option<i64>| InjuryInput {
        id: None,
        title: title.into(),
        body_part: Some("knee_l".into()),
        severity: Some(2),
        start_date: day(start),
        end_date: end.map(day),
        notes: String::new(),
    };
    db.save_injury(&injury("still", -10, None)).unwrap();
    db.save_injury(&injury("recent", -60, Some(-30))).unwrap();
    db.save_injury(&injury("long ago", -400, Some(-300)))
        .unwrap();
    let mut retired = shoe("Old", "running", false, None);
    retired.retired_on = Some("2026-02-01".into());
    db.save_shoe(&retired).unwrap();
    db.save_shoe(&shoe("Daily", "running", true, None)).unwrap();

    let journal = db.journal_for_ai().unwrap();
    let titles: Vec<_> = journal.injuries.iter().map(|i| i.title.as_str()).collect();
    assert_eq!(titles, ["still", "recent"], "90 天前好的不交给 AI");
    let shoes: Vec<_> = journal.shoes.iter().map(|s| s.name.as_str()).collect();
    assert_eq!(shoes, ["Daily"], "退役的鞋不交给 AI");

    let date = today - chrono::Duration::days(2);
    let date = (date.year(), date.month(), date.day());
    workout(&db, "felt", "run", date, 8.0, None);
    db.save_workout_feel(&AnnotationInput {
        rpe: Some(8),
        soreness: vec!["calf_r".into()],
        ..feel("felt", "auto", None)
    })
    .unwrap();
    let context = db.training_context(7).unwrap();
    let run = context
        .workouts
        .iter()
        .find(|w| w.workout_id == "felt")
        .unwrap();
    assert_eq!(
        (run.user_rpe, run.soreness.clone()),
        (Some(8), vec!["calf_r".to_string()])
    );
}
