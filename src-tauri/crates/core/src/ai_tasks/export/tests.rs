use super::*;
use crate::models::{SleepSession, SleepStageSlice};
use chrono::{DateTime, TimeZone};

fn at(y: i32, m: u32, d: u32, h: u32, min: u32) -> DateTime<Utc> {
    Utc.with_ymd_and_hms(y, m, d, h, min, 0).unwrap()
}

fn session(id: &str, end: DateTime<Utc>, stages: Vec<SleepStageSlice>) -> SleepSession {
    SleepSession {
        sleep_id: id.to_string(),
        start_time: end - chrono::Duration::hours(7),
        end_time: end,
        score: Some(82),
        duration_minutes: 400,
        deep_minutes: Some(90),
        light_minutes: Some(220),
        rem_minutes: Some(70),
        awake_minutes: Some(20),
        source_scope: crate::models::SourceScope::Device,
        device_id: None,
        synced_at: None,
        time_in_bed_minutes: None,
        stages,
        wake_count: Some(2),
    }
}

/// detailed 的睡眠分期走一遍 `IN` 批量取数：有分期行的 session 带出
/// `stages`（按 start_time 升序），没有的不带 `stages` 键——与逐条
/// `load_sleep_stages` 的出仓形状完全一致。
#[test]
fn detailed_sleep_day_rows_batch_stages() {
    let db = Database::in_memory().unwrap();
    let end1 = at(2026, 9, 10, 22, 0);
    let end2 = at(2026, 9, 11, 6, 30);
    db.insert_sleep_session(&session(
        "s1",
        end1,
        vec![
            SleepStageSlice {
                stage: "light".into(),
                start_time: end1 - chrono::Duration::hours(7),
                end_time: end1 - chrono::Duration::hours(5),
                raw_mode: None,
            },
            SleepStageSlice {
                stage: "deep".into(),
                start_time: end1 - chrono::Duration::hours(5),
                end_time: end1 - chrono::Duration::hours(3),
                raw_mode: Some(4),
            },
        ],
    ))
    .unwrap();
    db.insert_sleep_session(&session("s2", end2, Vec::new()))
        .unwrap();

    let rows = db.sleep_day_rows("2026-09-01", "2026-09-30", true).unwrap();
    assert_eq!(rows.len(), 2);
    let by_id: BTreeMap<&str, &Value> = rows
        .iter()
        .map(|(_, id, _, object)| (id.as_str(), object))
        .collect();
    let stages = by_id["s1"]["stages"].as_array().unwrap();
    assert_eq!(stages.len(), 2);
    assert_eq!(stages[0]["stage"], json!("light"));
    assert_eq!(stages[1]["stage"], json!("deep"));
    assert_eq!(stages[1]["raw_mode"], json!(4));
    // 无分期行的 session：stages 键根本不出现（与单条版 `if !stages.is_empty()` 同语义）。
    assert!(by_id["s2"].get("stages").is_none());
    // 归属日还是按 end_time 本地日。
    for (day, _, _, _) in &rows {
        assert!(day.as_str() >= "2026-09-01");
    }

    // standard 不取分期——连批量查询都不发。
    let standard = db
        .sleep_day_rows("2026-09-01", "2026-09-30", false)
        .unwrap();
    for (_, _, _, object) in &standard {
        assert!(object.get("stages").is_none());
    }
}
