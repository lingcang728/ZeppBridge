use super::*;
use serde_json::json;

#[tokio::test]
async fn empty_heart_rate_page_is_kept_without_a_second_request() {
    let start = DateTime::from_timestamp(1_800_000_000, 0).unwrap();
    let window = FetchWindow::between(start, start + Duration::hours(1)).unwrap();
    let original = json!({"code":200,"data":{"items":[]},"serverNote":"no samples"});
    let mut calls = 0;
    let records = fetch_heart_rate_pages_with(window, |_, _| {
        calls += 1;
        std::future::ready(if calls == 1 {
            Ok(original.clone())
        } else {
            Err(ZeppBridgeError::Unavailable("unexpected retry".into()))
        })
    })
    .await
    .unwrap();
    assert_eq!(calls, 1);
    assert_eq!(records.len(), 1);
    assert_eq!(records[0].raw.payload, original);
}

#[tokio::test]
async fn paginated_heart_rate_keeps_each_original_response_and_cursor() {
    let start = DateTime::from_timestamp(1_800_000_000, 0).unwrap();
    let window = FetchWindow::between(start, start + Duration::hours(1)).unwrap();
    let first = json!({"code":200,"items":(0..1000).map(|index| json!({"timestamp":start.timestamp()+index,"value":60})).collect::<Vec<_>>(),"pageMarker":"first"});
    let second = json!({"data":{"items":[{"timestamp":start.timestamp()+1000,"value":70}]},"pageMarker":"second"});
    let originals = vec![first, second];
    let mut pending = std::collections::VecDeque::from(originals.clone());
    let mut cursors = Vec::new();
    let records = fetch_heart_rate_pages_with(window, |cursor, end| {
        cursors.push((cursor, end));
        std::future::ready(
            pending
                .pop_front()
                .ok_or_else(|| ZeppBridgeError::Unknown("unexpected request".into())),
        )
    })
    .await
    .unwrap();
    assert_eq!(
        cursors,
        vec![
            (start.timestamp(), window.end_utc.timestamp()),
            (start.timestamp() + 1000, window.end_utc.timestamp())
        ]
    );
    assert_eq!(
        records
            .iter()
            .map(|record| record.raw.payload.clone())
            .collect::<Vec<_>>(),
        originals
    );
    assert_ne!(records[0].raw.source_key, records[1].raw.source_key);
    assert_ne!(
        records[0].raw.source_key,
        format!(
            "heart_rate:{}:{}",
            window.start_utc.timestamp(),
            window.end_utc.timestamp()
        )
    );
    let samples = records
        .iter()
        .flat_map(|record| {
            crate::normalizer::Normalizer::normalize_heart_rate(&record.raw.payload).unwrap()
        })
        .collect::<Vec<_>>();
    assert_eq!(samples.len(), 1001);
    assert_eq!(samples.last().unwrap().value, 70.0);
    let db = crate::storage::Database::in_memory().unwrap();
    let mut written = 0;
    for record in &records {
        written += db
            .persist_fetched_record(&record.raw)
            .unwrap()
            .1
            .primary_records;
    }
    assert_eq!(written, 1001);
    assert_eq!(db.count_raw_records().unwrap(), 2);
    assert_eq!(
        db.reprocess_raw_records().unwrap().get("heart_rate"),
        Some(&1001)
    );
}

#[test]
fn exclusive_midnight_does_not_fetch_the_next_day() {
    let date = |value: &str| {
        DateTime::parse_from_rfc3339(value)
            .unwrap()
            .with_timezone(&Utc)
    };
    let window =
        FetchWindow::between(date("2026-01-25T00:00:00Z"), date("2026-02-08T00:00:00Z")).unwrap();
    let chunks = window.chunks(7);
    assert_eq!(
        chunks
            .iter()
            .map(|chunk| (chunk.start_day(), chunk.end_day()))
            .collect::<Vec<_>>(),
        vec![
            ("2026-01-25".into(), "2026-01-31".into()),
            ("2026-02-01".into(), "2026-02-07".into())
        ]
    );
    for end in ["2026-02-08T00:00:00.000000001Z", "2026-02-08T12:00:00Z"] {
        assert_eq!(
            FetchWindow::between(window.start_utc, date(end))
                .unwrap()
                .end_day(),
            "2026-02-08"
        );
    }
    assert_eq!(
        FetchWindow::between(date("2024-02-28T00:00:00Z"), date("2024-03-01T00:00:00Z"))
            .unwrap()
            .end_day(),
        "2024-02-29"
    );
}

#[test]
fn window_bounds_are_limited() {
    assert!(FetchWindow::days(0).is_err());
    assert!(FetchWindow::days(366).is_err());
    let window = FetchWindow::days(1).unwrap();
    assert!(window.end_utc > window.start_utc);
    assert_eq!(FetchWindow::days(30).unwrap().chunks(7).len(), 5);
}

#[test]
fn heart_rate_items_accepts_known_payload_shapes() {
    let direct = json!({ "items": [{"timestamp": 1}, {"timestamp": 2}] });
    assert_eq!(heart_rate_items(&direct).len(), 2);
    let nested = json!({ "data": { "items": [{"timestamp": 3}] } });
    assert_eq!(heart_rate_items(&nested).len(), 1);
    let array = json!([{"timestamp": 4}]);
    assert_eq!(heart_rate_items(&array).len(), 1);
    assert!(heart_rate_items(&json!({ "other": true })).is_empty());
}

#[test]
fn heart_rate_cursor_advances_past_max_timestamp() {
    let items = vec![
        json!({ "timestamp": 1_700_000_000i64, "value": 72 }),
        json!({ "time": "1700003600", "value": 80 }),
        json!({ "timeStamp": 1700007200000i64, "value": 88 }),
        json!({ "value": 99 }), // malformed: skipped
        json!("not an object"), // malformed: skipped
    ];
    // 最大值是 1700007200000（毫秒），游标必须换算成秒再进一格。
    assert_eq!(heart_rate_cursor(&items), Some(1_700_007_201i64));
    assert_eq!(heart_rate_cursor(&[]), None);
}

/// 游标和 `end` 必须是同一个单位。
///
/// 这是上一版真正出问题的地方：旧实现对毫秒时间戳返回毫秒，而调用点拿它
/// 去和秒级的 `end` 比较、再原样发进请求。断言游标值本身是不够的——要断言
/// 它落在窗口里。
#[test]
fn heart_rate_cursor_stays_in_the_same_unit_as_the_window_end() {
    let window_start = 1_700_000_000i64;
    let window_end = 1_700_604_800i64;
    // 服务端回的是毫秒时间戳，落在窗口正中间。
    let items = vec![json!({ "timestamp": 1_700_300_000_000i64, "value": 70 })];
    let cursor = heart_rate_cursor(&items).expect("有可用时间戳时必须给出游标");
    assert!(
        cursor > window_start && cursor < window_end,
        "游标 {cursor} 落到了窗口 [{window_start}, {window_end}] 外面，下一页会返回空"
    );
}

#[test]
fn payload_items_only_accept_structured_wrappers() {
    assert_eq!(payload_items(&json!({"items": [1, 2]})).len(), 2);
    assert_eq!(payload_items(&json!({"data": "encoded"})).len(), 0);
}

#[test]
fn odi_dates_use_device_zone_and_exclusive_end() {
    for (start, end, zone, expected_start, expected_end) in [
        (
            "2026-09-14T15:31:25.715671100Z",
            "2026-09-21T15:31:25.715671100Z",
            "Asia/Shanghai",
            "2026-09-14",
            "2026-09-21",
        ),
        (
            "2026-09-21T16:00:00Z",
            "2026-09-22T16:00:00Z",
            "Asia/Shanghai",
            "2026-09-22",
            "2026-09-22",
        ),
        (
            "2026-09-22T00:30:00Z",
            "2026-09-22T01:00:00Z",
            "America/Los_Angeles",
            "2026-09-21",
            "2026-09-21",
        ),
        (
            "2026-03-08T05:00:00Z",
            "2026-03-09T04:00:00Z",
            "America/New_York",
            "2026-03-08",
            "2026-03-08",
        ),
        (
            "2026-09-21T00:00:00Z",
            "2026-09-22T00:00:00Z",
            "UTC",
            "2026-09-21",
            "2026-09-21",
        ),
    ] {
        let window = FetchWindow::between(start.parse().unwrap(), end.parse().unwrap()).unwrap();
        let (from, to) = window.local_days(zone).unwrap();
        assert_eq!(from.to_string(), expected_start);
        assert_eq!(to.to_string(), expected_end);
    }
    assert!(FetchWindow::days(1)
        .unwrap()
        .local_days("Not/AZone")
        .is_err());
}

#[test]
fn partial_fetch_retains_original_error() {
    let records = conclude_slices(
        vec![sample_fetched()],
        Some(ZeppBridgeError::HttpStatus {
            status: 400,
            message: "Bad request".into(),
        }),
        "empty",
    )
    .unwrap();
    assert!(records[0].incomplete);
    assert!(records[0]
        .incomplete_reason
        .as_deref()
        .unwrap()
        .contains("HTTP 400"));
}

fn sample_fetched() -> FetchedRecord {
    FetchedRecord::from_raw(RawRecord {
        stream: "heart_rate".into(),
        source_key: "heart_rate_page:1:2".into(),
        source_scope: SourceScope::UserFused,
        device_id: None,
        start_utc: DateTime::from_timestamp(1_800_000_000, 0).unwrap(),
        end_utc: None,
        payload: json!({"items": []}),
        capability: CapabilityStatus::Verified,
    })
}

#[tokio::test]
async fn daily_summary_history_keeps_good_months_and_marks_bad_month_for_retry() {
    let start = DateTime::from_timestamp(1_735_689_600, 0).unwrap();
    let window = FetchWindow::between(start, start + Duration::days(365)).unwrap();
    let mut slices = Vec::new();
    let records = fetch_daily_summary_slices_with(window, |slice| {
        slices.push(slice);
        std::future::ready(if slices.len() == 2 {
            Err(ZeppBridgeError::ParseError(
                "bad historical response".into(),
            ))
        } else {
            let mut record = sample_fetched();
            record.raw.stream = "daily_summary".into();
            record.raw.source_key = format!("daily:{}", slice.start_utc.timestamp());
            Ok(vec![record])
        })
    })
    .await
    .unwrap();

    assert_eq!(slices.len(), 13);
    assert_eq!(slices[0].start_utc, window.start_utc);
    assert_eq!(slices.last().unwrap().end_utc, window.end_utc);
    assert!(slices
        .iter()
        .all(|slice| slice.end_utc - slice.start_utc <= Duration::days(30)));
    assert!(slices
        .windows(2)
        .all(|pair| pair[0].end_utc == pair[1].start_utc));
    assert_eq!(records.len(), 12);
    assert!(records.iter().all(|record| record.incomplete));
    assert!(records.iter().all(|record| record
        .incomplete_reason
        .as_deref()
        .unwrap()
        .contains("bad historical response")));
}

#[tokio::test]
async fn daily_summary_auth_failure_stops_after_the_failing_slice() {
    let mut calls = 0;
    let result = fetch_daily_summary_slices_with(FetchWindow::days(90).unwrap(), |_| {
        calls += 1;
        std::future::ready(if calls == 1 {
            Ok(vec![sample_fetched()])
        } else {
            Err(ZeppBridgeError::NeedsReauth("expired".into()))
        })
    })
    .await;
    assert!(matches!(result, Err(ZeppBridgeError::NeedsReauth(_))));
    assert_eq!(calls, 2);
}

#[tokio::test]
async fn sleep_failure_keeps_successful_slices_and_still_requests_latest() {
    let window = FetchWindow::days(21).unwrap();
    let mut calls = 0;
    let records = fetch_sleep_slices_with(window, |_| {
        calls += 1;
        std::future::ready(if calls == 2 {
            Err(ZeppBridgeError::RetryExhausted {
                status: 503,
                message: "test".into(),
            })
        } else {
            Ok(sample_fetched())
        })
    })
    .await
    .unwrap();
    assert_eq!(calls, 3);
    assert_eq!(records.len(), 2);
    assert!(records.iter().all(|record| record.incomplete));
}

#[tokio::test]
async fn sleep_auth_and_cancel_abort_without_requesting_more_slices() {
    for error in [
        ZeppBridgeError::Cancelled,
        ZeppBridgeError::NeedsReauth("test".into()),
    ] {
        let mut error = Some(error);
        let mut calls = 0;
        let result = fetch_sleep_slices_with(FetchWindow::days(21).unwrap(), |_| {
            calls += 1;
            std::future::ready(if calls == 1 {
                Ok(sample_fetched())
            } else {
                Err(error.take().unwrap())
            })
        })
        .await;
        assert!(is_abort_error(&result.unwrap_err()));
        assert_eq!(calls, 2);
    }
}

#[tokio::test]
async fn sleep_all_failed_preserves_request_error_over_later_unavailable() {
    let mut calls = 0;
    let error = fetch_sleep_slices_with(FetchWindow::days(14).unwrap(), |_| {
        calls += 1;
        std::future::ready(Err(if calls == 1 {
            ZeppBridgeError::RetryExhausted {
                status: 503,
                message: "test".into(),
            }
        } else {
            ZeppBridgeError::Unavailable("test".into())
        }))
    })
    .await
    .unwrap_err();
    assert!(matches!(
        error,
        ZeppBridgeError::RetryExhausted { status: 503, .. }
    ));
    assert_eq!(calls, 2);
}

#[test]
fn cancelled_slice_is_not_swallowed_when_other_records_exist() {
    let error = conclude_slices(
        vec![sample_fetched()],
        Some(ZeppBridgeError::Cancelled),
        "empty",
    )
    .unwrap_err();
    assert!(error.is_cancelled());
    assert!(!matches!(error, ZeppBridgeError::ConfigError(_)));
}

#[test]
fn needs_reauth_slice_is_not_swallowed_when_other_records_exist() {
    let error = conclude_slices(
        vec![sample_fetched()],
        Some(ZeppBridgeError::NeedsReauth("expired".into())),
        "empty",
    )
    .unwrap_err();
    assert!(error.needs_reauth());
}

#[test]
fn a_404_inner_slice_marks_the_window_incomplete() {
    let records = conclude_slices(
        vec![sample_fetched()],
        Some(ZeppBridgeError::Unavailable("HTTP 404".into())),
        "empty",
    )
    .unwrap();
    assert!(records.iter().all(|record| record.incomplete));
}

#[test]
fn an_all_404_window_stays_unavailable() {
    let error = conclude_slices(
        Vec::new(),
        Some(ZeppBridgeError::Unavailable("HTTP 404".into())),
        "empty",
    )
    .unwrap_err();
    assert!(error.is_unavailable());
}

#[test]
fn a_wellness_page_at_the_server_cap_is_incomplete() {
    let items: Vec<Value> = (0..WELLNESS_PAGE_LIMIT)
        .map(|index| json!({"timestamp": index, "value": 97}))
        .collect();
    assert!(wellness_page_hits_cap(
        &json!({"items": items}),
        WELLNESS_PAGE_LIMIT
    ));
    let under: Vec<Value> = (0..WELLNESS_PAGE_LIMIT - 1)
        .map(|index| json!({"timestamp": index}))
        .collect();
    assert!(!wellness_page_hits_cap(
        &json!({"items": under}),
        WELLNESS_PAGE_LIMIT
    ));
}

#[test]
fn a_truncated_spo2_page_is_not_a_full_window() {
    let start = DateTime::from_timestamp(1_800_000_000, 0).unwrap();
    let slice = FetchWindow::between(start, start + Duration::days(SPO2_CHUNK_DAYS)).unwrap();
    let items: Vec<Value> = (0..WELLNESS_PAGE_LIMIT)
        .map(|index| json!({"timestamp": start.timestamp() + index, "value": 96}))
        .collect();
    let record = fetched_wellness_record(
        "spo2",
        ProbeSurface::UserEvents,
        &slice,
        json!({"items": items}),
        WELLNESS_PAGE_LIMIT,
    );
    assert!(record.incomplete);
    assert_eq!(payload_items(&record.raw.payload).len(), 1000);

    let short = fetched_wellness_record(
        "spo2",
        ProbeSurface::UserEvents,
        &slice,
        json!({"items": [{"timestamp": start.timestamp(), "value": 96}]}),
        WELLNESS_PAGE_LIMIT,
    );
    assert!(!short.incomplete);
}

#[test]
fn spo2_chunks_stay_under_the_five_minute_page_cap() {
    let spo2 = WELLNESS_STREAMS
        .iter()
        .find(|stream| stream.0 == "spo2")
        .expect("spo2 is a wellness stream");
    assert_eq!(spo2.4, Some(SPO2_CHUNK_DAYS));
    // 5-minute samples over the chunk must fit in one page; otherwise a
    // typical week of blood oxygen would always look complete and drop
    // the rest of the window.
    const {
        assert!(SPO2_CHUNK_DAYS * 24 * (60 / 5) < WELLNESS_PAGE_LIMIT);
    }
}

#[test]
fn cancelled_is_still_not_swallowed_by_a_truncated_page() {
    let start = DateTime::from_timestamp(1_800_000_000, 0).unwrap();
    let slice = FetchWindow::between(start, start + Duration::days(1)).unwrap();
    let items: Vec<Value> = (0..WELLNESS_PAGE_LIMIT)
        .map(|index| json!({"timestamp": index}))
        .collect();
    let truncated = fetched_wellness_record(
        "spo2",
        ProbeSurface::UserEvents,
        &slice,
        json!({"items": items}),
        WELLNESS_PAGE_LIMIT,
    );
    let error =
        conclude_slices(vec![truncated], Some(ZeppBridgeError::Cancelled), "empty").unwrap_err();
    assert!(error.is_cancelled());
}

/// 每日事件窗口按日拆成稳定键；空响应照旧整窗留一条（「这个窗口是空的」
/// 也是事实），而且它的键在同一天里不变，重拉是覆盖。
#[test]
fn daily_event_windows_become_one_record_per_utc_day() {
    let from = 1_790_380_800_000; // 2026-09-26T00:00Z
    let to = 1_790_524_217_291;
    let payload = json!({"items": [
        {"eventType": "Charge", "timestamp": 1_790_467_200_000_i64, "value": {}},
        {"eventType": "Charge", "timestamp": 1_790_380_800_000_i64, "value": {}},
    ]});
    let records = event_day_records("Charge", "real_data", from, to, payload);
    let keys: Vec<_> = records.iter().map(|r| r.raw.source_key.as_str()).collect();
    assert_eq!(
        keys,
        [
            "events:Charge:real_data:day:2026-09-26",
            "events:Charge:real_data:day:2026-09-27"
        ]
    );
    assert_eq!(
        records[0].raw.start_utc,
        DateTime::from_timestamp_millis(from).unwrap()
    );
    assert_eq!(records[0].raw.payload["items"].as_array().unwrap().len(), 1);

    let empty = event_day_records("Charge", "real_data", from, to, json!({"items": []}));
    let later = event_day_records(
        "Charge",
        "real_data",
        from,
        to + 900_000,
        json!({"items": []}),
    );
    assert_eq!(empty.len(), 1);
    assert_eq!(empty[0].raw.source_key, later[0].raw.source_key);
    assert_eq!(
        empty[0].raw.source_key,
        "events:Charge:real_data:1790380800000:1790553599999"
    );
}
