use super::*;
use serde_json::json;

fn at(text: &str) -> DateTime<Utc> {
    DateTime::parse_from_rfc3339(text)
        .unwrap()
        .with_timezone(&Utc)
}

/// 窗口起点每 15 分钟往后挪一次；对齐之后同一天的起点必须一动不动，
/// 否则后一次报文不是前一次的超集，覆盖时会丢掉最早那天的条目。
#[test]
fn sliding_windows_on_the_same_day_share_one_aligned_start() {
    let now = at("2026-09-27T15:50:17Z");
    let earlier =
        utc_day_aligned_millis(at("2026-08-28T15:35:00Z"), at("2026-09-27T15:35:00Z"), now);
    let later = utc_day_aligned_millis(at("2026-08-28T15:50:17Z"), at("2026-09-27T15:50:17Z"), now);
    assert_eq!(earlier.0, later.0);
    assert_eq!(earlier.0, at("2026-08-28T00:00:00Z").timestamp_millis());
    // 今天只取到此刻；后一次覆盖得更多。
    assert!(later.1 >= earlier.1);
    assert_eq!(later.1, now.timestamp_millis());
}

/// 历史块的终点在过去：取到那一天的最后一毫秒，零点整的条目留给下一天。
#[test]
fn a_past_chunk_extends_to_the_last_millisecond_of_its_final_day() {
    let now = at("2026-09-27T12:00:00Z");
    let (from, to) =
        utc_day_aligned_millis(at("2026-07-31T16:00:00Z"), at("2026-08-31T16:00:00Z"), now);
    assert_eq!(from, at("2026-07-31T00:00:00Z").timestamp_millis());
    assert_eq!(to, at("2026-09-01T00:00:00Z").timestamp_millis() - 1);
    // 终点恰好是零点：那一天不算在里面。
    let (_, to) =
        utc_day_aligned_millis(at("2026-07-01T00:00:00Z"), at("2026-08-01T00:00:00Z"), now);
    assert_eq!(to, at("2026-08-01T00:00:00Z").timestamp_millis() - 1);
}

#[test]
fn items_split_by_utc_day_in_order_and_keep_other_top_level_fields() {
    let payload = json!({
        "next": "cursor",
        "items": [
            {"eventType": "readiness", "timestamp": 1790470021000_i64, "value": {"a": 2}},
            {"eventType": "readiness", "timestamp": "1790470020000", "value": {"a": 1}},
            {"eventType": "readiness", "timestamp": 1790295001000_i64, "value": {"a": 0}},
            {"eventType": "readiness", "value": {"a": 9}},
        ]
    });
    let split = split_by_utc_day(&payload).unwrap();
    let days: Vec<_> = split.days.iter().map(|(day, _)| day.to_string()).collect();
    assert_eq!(days, ["2026-09-25", "2026-09-27"]);
    let (_, same_day) = &split.days[1];
    assert_eq!(same_day["next"], "cursor");
    // 同一天的两条保持响应里的先后。
    assert_eq!(same_day["items"][0]["value"]["a"], 2);
    assert_eq!(same_day["items"][1]["value"]["a"], 1);
    // 没有时间戳的条目不能丢，也不能硬塞进某一天。
    let residual = split.residual.unwrap();
    assert_eq!(residual["items"].as_array().unwrap().len(), 1);
    assert_eq!(residual["next"], "cursor");
}

#[test]
fn an_empty_or_unexpected_response_is_left_whole() {
    assert!(split_by_utc_day(&json!({"items": []})).is_none());
    assert!(split_by_utc_day(&json!({"data": [1]})).is_none());
    assert!(split_by_utc_day(&json!([1, 2])).is_none());
}

#[test]
fn only_the_old_window_keys_are_recognised_as_a_family() {
    assert_eq!(
        window_key_family("events:Charge:real_data:1787932217291:1790524217291"),
        Some("events:Charge:real_data")
    );
    assert_eq!(
        window_key_family("events:Charge:real_data:day:2026-09-27"),
        None
    );
    assert_eq!(
        window_key_family("WatchSportStatistics:VO2_MAX:2026-09-01:2026-09-27"),
        None
    );
    assert_eq!(
        window_key_family("events:hrv_sdnn:2026-09-01:2026-09-27"),
        None
    );
    assert_eq!(window_key_family("sport_history:run:1:2"), None);
    assert_eq!(
        day_source_key(
            "Charge",
            "real_data",
            NaiveDate::from_ymd_opt(2026, 9, 27).unwrap()
        ),
        "events:Charge:real_data:day:2026-09-27"
    );
}
