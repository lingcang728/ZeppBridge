//! 官方报文落库与「同一晚显示官方那份」。夹具是合成数据。

use super::*;
use crate::official::fetch::{split_records, OfficialKind};

const SHANGHAI_MIDNIGHT: i64 = 1_789_920_000;

fn official_night() -> serde_json::Value {
    serde_json::json!({
        "date": "2026-09-22", "deepSleepTime": 90, "shallowSleepTime": 250, "wakeTime": 10, "rem": 100,
        "start": SHANGHAI_MIDNIGHT + 1443 * 60, "stop": SHANGHAI_MIDNIGHT + 1893 * 60, "sleepScore": 84,
        "stage": [{"start": 1443, "stop": 1600, "mode": 4}], "napStage": []
    })
}

fn legacy_night(start: i64, end: i64) -> SleepSession {
    SleepSession {
        sleep_id: format!("band:dev:{start}:{end}"),
        start_time: DateTime::from_timestamp(start, 0).unwrap(),
        end_time: DateTime::from_timestamp(end, 0).unwrap(),
        score: Some(80),
        duration_minutes: 400,
        deep_minutes: Some(80),
        light_minutes: Some(240),
        rem_minutes: Some(80),
        awake_minutes: Some(20),
        source_scope: SourceScope::Device,
        device_id: Some("dev".into()),
        synced_at: None,
        time_in_bed_minutes: None,
        stages: Vec::new(),
        wake_count: None,
    }
}

fn shown_ids(db: &Database) -> Vec<String> {
    let mut stmt = db
        .conn
        .prepare("SELECT sleep_id FROM sleep_sessions_shown ORDER BY start_time")
        .unwrap();
    stmt.query_map([], |row| row.get(0))
        .unwrap()
        .collect::<std::result::Result<Vec<_>, _>>()
        .unwrap()
}

#[test]
fn the_same_night_is_stored_twice_but_shown_once_as_the_official_one() {
    let db = Database::in_memory().unwrap();
    let start = SHANGHAI_MIDNIGHT + 1443 * 60;
    // 旧通道那份：开始早 5 分钟、结束晚 10 分钟——同一晚，边界对不齐。
    db.insert_sleep_session(&legacy_night(start - 300, start + 450 * 60 + 600))
        .unwrap();
    // 另一晚只有旧通道。
    db.insert_sleep_session(&legacy_night(start - 86_400, start - 86_400 + 400 * 60))
        .unwrap();
    for raw in split_records(OfficialKind::Sleep, vec![official_night()], "Asia/Shanghai") {
        db.persist_fetched_record(&raw).unwrap();
    }
    let total: i64 = db
        .conn
        .query_row("SELECT COUNT(*) FROM sleep_sessions", [], |row| row.get(0))
        .unwrap();
    assert_eq!(total, 3);
    let shown = shown_ids(&db);
    assert_eq!(shown.len(), 2);
    assert!(shown[0].starts_with("band:"));
    assert_eq!(shown[1], format!("official:{start}"));
    let (provider, rem, nap): (String, Option<i64>, Option<i64>) = db
        .conn
        .query_row(
            "SELECT provider, rem_seconds, nap_total_seconds FROM sleep_sessions WHERE sleep_id = ?1",
            [format!("official:{start}")],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .unwrap();
    assert_eq!(
        (provider.as_str(), rem, nap),
        ("official", Some(6000), Some(0))
    );
    // 列表查询走视图：同一晚只出现一次。
    assert_eq!(db.get_recent_sleep_sessions(10).unwrap().len(), 2);
    // 官方那份不带设备：详情借同一晚旧通道那份的设备来认，而不是显示「未提供」。
    let detail = db
        .get_sleep_detail(&format!("official:{start}"))
        .unwrap()
        .unwrap();
    assert_eq!(detail.device_id.as_deref(), Some("dev"));
    assert!(!detail.stages.is_empty());
}

#[test]
fn official_payloads_are_marked_and_replay_through_the_same_path() {
    let db = Database::in_memory().unwrap();
    let hourly = serde_json::json!({"date": "2026-09-28", "hour": 11, "steps": 208});
    for raw in split_records(OfficialKind::ActivityHourly, vec![hourly], "Asia/Shanghai") {
        db.persist_fetched_record(&raw).unwrap();
    }
    let (provider, channel): (String, String) = db
        .conn
        .query_row(
            "SELECT provider, channel FROM raw_records WHERE source_key LIKE 'official:%'",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .unwrap();
    assert_eq!(
        (provider.as_str(), channel.as_str()),
        ("official", "official_pull")
    );
    let (metric, value, row_provider): (String, f64, String) = db
        .conn
        .query_row(
            "SELECT metric, value, provider FROM metric_samples",
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .unwrap();
    assert_eq!(
        (metric.as_str(), value, row_provider.as_str()),
        ("steps_hourly", 208.0, "official")
    );
    // 按范围取（日常活动页跟着 7 天 / 1 个月 / 6 个月走）：带上日期，不补 0。
    let rows = db.hourly_steps("2026-09-27", "2026-09-29").unwrap();
    assert_eq!(rows.len(), 1);
    assert_eq!(
        (rows[0].date.as_str(), rows[0].steps),
        ("2026-09-28", 208.0)
    );
    assert!(db.hourly_steps("2026-09-29", "2026-09-27").is_err());
}
