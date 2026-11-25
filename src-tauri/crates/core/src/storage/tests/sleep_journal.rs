use super::*;
use crate::storage::sleep_journal::{
    behavior_code, mood_code, parse_manual_data, CloudJournalItem, SleepJournalInput,
};

/// 一晚主睡眠：前一天 23 点睡、`date` 那天早上醒。数值都是虚构的。
fn night(db: &Database, date: (i32, u32, u32), minutes: i32, score: i32, deep: i32, wakes: i32) {
    let wake = Local
        .with_ymd_and_hms(date.0, date.1, date.2, 7, 0, 0)
        .unwrap()
        .with_timezone(&Utc);
    db.insert_sleep_session(&SleepSession {
        sleep_id: format!("night-{}-{}-{}", date.0, date.1, date.2),
        start_time: wake - Duration::minutes(minutes.into()),
        end_time: wake,
        score: Some(score),
        duration_minutes: minutes,
        deep_minutes: Some(deep),
        light_minutes: Some(minutes - deep - 30),
        rem_minutes: Some(20),
        awake_minutes: Some(10),
        source_scope: SourceScope::Device,
        device_id: None,
        synced_at: None,
        time_in_bed_minutes: None,
        wake_count: Some(wakes),
        stages: Vec::new(),
    })
    .unwrap();
}

fn input(date: &str, behaviors: &[&str], mood: Option<&str>) -> SleepJournalInput {
    SleepJournalInput {
        date: date.into(),
        behaviors: behaviors.iter().map(|b| b.to_string()).collect(),
        mood: mood.map(str::to_owned),
    }
}

#[test]
fn codes_map_to_stable_english_names() {
    assert_eq!(behavior_code("1"), Some("alcohol"));
    assert_eq!(behavior_code("5"), Some("late_meal"));
    assert_eq!(behavior_code("17"), Some("late_water"));
    assert_eq!(behavior_code("18"), Some("noise"));
    assert_eq!(behavior_code("19"), None);
    assert_eq!(behavior_code("0"), None);
    assert_eq!(mood_code("3"), Some("calm"));
    assert_eq!(mood_code("6"), None);
}

#[test]
fn parses_the_manual_data_payload_and_skips_bad_rows() {
    let payload = serde_json::json!({
        "code": 1,
        "data": [
            {"type": "sleep", "date_time": "2026-11-20", "summary": "{\"sb\":[\"17\",\"3\",\"3\",\"99\"],\"sf\":\"3\"}"},
            {"type": "sleep", "date_time": "2026-11-19", "summary": "{\"sb\":[5]}"},
            {"type": "sleep", "date_time": "not a date", "summary": "{\"sb\":[\"1\"]}"},
            {"type": "sleep", "date_time": "2026-11-18", "summary": "not json"},
            {"type": "weight", "date_time": "2026-11-17", "summary": "{}"}
        ]
    });
    let items = parse_manual_data(&payload);
    assert_eq!(
        items,
        vec![
            CloudJournalItem {
                date: "2026-11-20".into(),
                behaviors: vec!["3".into(), "17".into()],
                mood: Some("3".into()),
            },
            CloudJournalItem {
                date: "2026-11-19".into(),
                behaviors: vec!["5".into()],
                mood: None,
            },
        ]
    );
    assert!(parse_manual_data(&serde_json::json!({"code": 1})).is_empty());
}

#[test]
fn local_edits_survive_a_cloud_pull_until_written_back() {
    let db = Database::in_memory().unwrap();
    let cloud = vec![CloudJournalItem {
        date: "2026-11-20".into(),
        behaviors: vec!["3".into()],
        mood: Some("3".into()),
    }];
    assert_eq!(db.merge_cloud_sleep_journal(&cloud).unwrap(), 1);
    // 内容没变，不算改。
    assert_eq!(db.merge_cloud_sleep_journal(&cloud).unwrap(), 0);

    let saved = db
        .save_sleep_journal(&input("2026-11-20", &["12", "1", "12"], Some("2")))
        .unwrap();
    assert_eq!(saved.behaviors, vec!["1", "12"]);
    assert_eq!(saved.source, "local");
    assert!(saved.pending_upload);
    assert_eq!(saved.zepp_summary(), r#"{"sb":["1","12"],"sf":"2"}"#);

    // 还没写回：云端旧的那份不能把它冲掉。
    assert_eq!(db.merge_cloud_sleep_journal(&cloud).unwrap(), 0);
    let kept = db.sleep_journal_entry("2026-11-20").unwrap().unwrap();
    assert_eq!(kept.behaviors, vec!["1", "12"]);
    assert_eq!(db.pending_sleep_journal().unwrap().len(), 1);

    assert!(db.mark_sleep_journal_uploaded(&kept).unwrap());
    assert!(db.pending_sleep_journal().unwrap().is_empty());
    // 写回之后，云端的新内容照常进来。
    let newer = vec![CloudJournalItem {
        date: "2026-11-20".into(),
        behaviors: vec!["8".into()],
        mood: None,
    }];
    assert_eq!(db.merge_cloud_sleep_journal(&newer).unwrap(), 1);
    let entry = db.sleep_journal_entry("2026-11-20").unwrap().unwrap();
    assert_eq!(entry.behaviors, vec!["8"]);
    assert_eq!(entry.mood, None);
}

#[test]
fn a_write_back_of_an_older_copy_leaves_the_newer_edit_pending() {
    let db = Database::in_memory().unwrap();
    let first = db
        .save_sleep_journal(&input("2026-11-20", &["3"], None))
        .unwrap();
    std::thread::sleep(std::time::Duration::from_millis(5));
    db.save_sleep_journal(&input("2026-11-20", &["3", "17"], None))
        .unwrap();
    assert!(!db.mark_sleep_journal_uploaded(&first).unwrap());
    assert_eq!(db.pending_sleep_journal().unwrap().len(), 1);
}

#[test]
fn rejects_unknown_codes_and_bad_dates() {
    let db = Database::in_memory().unwrap();
    assert!(db
        .save_sleep_journal(&input("2026-11-20", &["19"], None))
        .is_err());
    assert!(db
        .save_sleep_journal(&input("2026-11-20", &["03"], None))
        .is_err());
    assert!(db
        .save_sleep_journal(&input("2026-11-20", &[], Some("9")))
        .is_err());
    assert!(db.save_sleep_journal(&input("11/20", &[], None)).is_err());
    // 空心情当没选。
    let entry = db
        .save_sleep_journal(&input("2026-11-20", &["2"], Some("")))
        .unwrap();
    assert_eq!(entry.mood, None);
}

#[test]
fn asks_about_last_night_once_and_respects_dismiss_and_snooze() {
    let db = Database::in_memory().unwrap();
    night(&db, (2026, 11, 20), 420, 80, 70, 2);
    let wake = Local
        .with_ymd_and_hms(2026, 11, 20, 7, 0, 0)
        .unwrap()
        .with_timezone(&Utc);
    let prompt = db
        .sleep_journal_prompt(wake + Duration::hours(2))
        .unwrap()
        .expect("woke up two hours ago");
    assert_eq!(prompt.date, "2026-11-20");
    assert_eq!(prompt.score, Some(80));
    // 醒来 18 小时之后不再问。
    assert!(db
        .sleep_journal_prompt(wake + Duration::hours(19))
        .unwrap()
        .is_none());

    // 只记了心情也算记过。
    db.save_sleep_journal(&input("2026-11-20", &[], Some("4")))
        .unwrap();
    assert!(db
        .sleep_journal_prompt(wake + Duration::hours(2))
        .unwrap()
        .is_none());

    // 关掉只管今天。
    night(&db, (2026, 11, 21), 400, 75, 60, 3);
    let next = wake + Duration::days(1);
    db.dismiss_sleep_journal_prompt(next.with_timezone(&Local).date_naive())
        .unwrap();
    assert!(db
        .sleep_journal_prompt(next + Duration::hours(1))
        .unwrap()
        .is_none());

    // 「这周别问」到下周一为止。
    night(&db, (2026, 11, 22), 400, 75, 60, 3);
    let sunday = wake + Duration::days(2);
    let until = db
        .snooze_sleep_journal_prompt(sunday.with_timezone(&Local).date_naive())
        .unwrap();
    assert_eq!(until.to_string(), "2026-11-23");
    assert!(db
        .sleep_journal_prompt(sunday + Duration::hours(1))
        .unwrap()
        .is_none());
}

#[test]
fn naps_are_not_last_night() {
    let db = Database::in_memory().unwrap();
    night(&db, (2026, 11, 20), 90, 70, 10, 0);
    let wake = Local
        .with_ymd_and_hms(2026, 11, 20, 7, 0, 0)
        .unwrap()
        .with_timezone(&Utc);
    assert!(db
        .sleep_journal_prompt(wake + Duration::hours(1))
        .unwrap()
        .is_none());
}

#[test]
fn factors_compare_tagged_nights_with_other_journaled_nights() {
    let db = Database::in_memory().unwrap();
    // 三晚喝了咖啡（12）：评分 70、深睡 50、夜醒 4；三晚没喝：评分 82、深睡 80、夜醒 2。
    for day in 1..=3 {
        night(&db, (2026, 11, day), 420, 70, 50, 4);
        db.save_sleep_journal(&input(&format!("2026-11-{day:02}"), &["12", "2"], None))
            .unwrap();
    }
    for day in 4..=6 {
        night(&db, (2026, 11, day), 420, 82, 80, 2);
        db.save_sleep_journal(&input(&format!("2026-11-{day:02}"), &["2"], Some("3")))
            .unwrap();
    }
    // 只喝过一次酒，不够数。
    night(&db, (2026, 11, 7), 420, 60, 40, 5);
    db.save_sleep_journal(&input("2026-11-07", &["1"], None))
        .unwrap();
    // 记了但那天没有主睡眠：不进比较。
    db.save_sleep_journal(&input("2026-11-08", &["12"], None))
        .unwrap();

    let today = NaiveDate::from_ymd_opt(2026, 11, 10).unwrap();
    let factors = db.sleep_journal_factors(today).unwrap();
    assert_eq!(factors.journaled_nights, 7);
    let caffeine = factors.factors.iter().find(|f| f.behavior == "12").unwrap();
    assert_eq!((caffeine.nights, caffeine.baseline_nights), (3, 4));
    // 没喝的四晚：评分 82、82、82、60 → 76.5；深睡均 70；夜醒均 2.75。
    assert_eq!(caffeine.score_delta, Some(-6.5));
    assert_eq!(caffeine.deep_minutes_delta, Some(-20.0));
    assert_eq!(caffeine.wake_count_delta, Some(1.3));
    let alcohol = factors.factors.iter().find(|f| f.behavior == "1").unwrap();
    assert_eq!(alcohol.nights, 1);
    assert_eq!(alcohol.score_delta, None);
    // 读书（2）六晚都有、没有的只一晚：基线不够数。
    let reading = factors.factors.iter().find(|f| f.behavior == "2").unwrap();
    assert_eq!((reading.nights, reading.baseline_nights), (6, 1));
    assert_eq!(reading.score_delta, None);
}
