use super::*;
use crate::connectors::ZeppConnector;
use crate::fetcher::DataFetcher;
use crate::models::{AuthInfo, CapabilityStatus};
use crate::storage::Database;
use std::sync::atomic::AtomicBool;

#[test]
fn status_names_are_not_success_for_optional_states() {
    assert_eq!(status_name(&StreamStatus::Unavailable), "unavailable");
    assert_eq!(status_name(&StreamStatus::Unverified), "unverified");
}

#[tokio::test]
async fn incomplete_fetch_persists_data_but_keeps_sync_retryable() {
    let db = Database::in_memory().unwrap();
    let connector = ZeppConnector::new(AuthInfo {
        app_token: "test-token".into(),
        user_id: "user-1".into(),
        region_host: "https://api-mifit.zepp.com".into(),
    })
    .unwrap();
    let manager = SyncManager::new(
        DataFetcher::new(connector),
        db,
        Arc::new(AtomicBool::new(false)),
    );
    let record = FetchedRecord {
        incomplete: true,
        incomplete_reason: Some("spo2_odi: HTTP 400".into()),
        raw: RawRecord {
            stream: "heart_rate".into(),
            source_key: "partial-test".into(),
            source_scope: SourceScope::UserFused,
            device_id: None,
            start_utc: Utc::now(),
            end_utc: None,
            payload: serde_json::json!({"items": [{"timestamp": 1800000000, "value": 70}]}),
            capability: CapabilityStatus::Verified,
        },
    };
    let report = manager
        .persist_records("heart_rate", vec![record])
        .await
        .unwrap();
    assert_eq!(report.status, StreamStatus::Failed);
    assert_eq!(report.raw_records, 1);
    assert_eq!(report.records_written, 1);
    assert_eq!(report.message.as_deref(), Some("spo2_odi: HTTP 400"));
    let db = manager.db.lock().await;
    let state = db.get_sync_state("heart_rate").unwrap().unwrap();
    assert_eq!(state.status, "failed");
    assert_eq!(state.message.as_deref(), Some("spo2_odi: HTTP 400"));
    let (status, written, reason) = classify_backfill_report(&report, true);
    assert_eq!(reason.unwrap().1, "spo2_odi: HTTP 400");
    assert_eq!(status, ChunkStatus::Partial);
    assert_eq!(written, 1);
}

#[tokio::test]
async fn failure_report_preserves_records_written() {
    let dir = std::env::temp_dir().join(format!(
        "zeppbridge-sync-test-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    std::fs::create_dir_all(&dir).unwrap();
    let db = Database::new(dir.join("test.db")).unwrap();
    db.update_sync_state_details(
        "heart_rate",
        None,
        "success",
        None,
        false,
        500,
        CapabilityStatus::Verified,
        None,
    )
    .unwrap();

    let auth = AuthInfo {
        app_token: "test-token".into(),
        user_id: "user-1".into(),
        region_host: "https://api-mifit.zepp.com".into(),
    };
    let connector = ZeppConnector::new(auth).unwrap();
    let fetcher = DataFetcher::new(connector);
    let manager = SyncManager::new(fetcher, db, Arc::new(AtomicBool::new(false)));

    let error = ZeppBridgeError::HttpStatus {
        status: 500,
        message: "boom".into(),
    };
    let report = manager.failure_report("heart_rate", &error).await.unwrap();
    assert_eq!(report.records_written, 500);
    let report = manager.heart_rate_fetch_error(&error).await.unwrap();
    assert_eq!(report.status, StreamStatus::Failed);
    let report = manager
        .heart_rate_fetch_error(&ZeppBridgeError::DataUnavailable("响应 items 为空".into()))
        .await
        .unwrap();
    assert_eq!(report.status, StreamStatus::Unavailable);
    assert_eq!(report.records_written, 500);
    assert!(!report.needs_reauth);
    let unavailable = manager
        .unavailable_report("heart_rate", &error)
        .await
        .unwrap();
    assert_eq!(unavailable.records_written, 500);

    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn cancel_is_cancelled_not_a_config_error() {
    let db = Database::in_memory().unwrap();
    let auth = AuthInfo {
        app_token: "test-token".into(),
        user_id: "user-1".into(),
        region_host: "https://api-mifit.zepp.com".into(),
    };
    let connector = ZeppConnector::new(auth).unwrap();
    let fetcher = DataFetcher::new(connector);
    let manager = SyncManager::new(fetcher, db, Arc::new(AtomicBool::new(false)));
    manager.request_cancel();
    let error = manager.abort_if_cancelled().unwrap_err();
    assert!(error.is_cancelled(), "{error:?}");
    assert_eq!(error.code(), "err.core.cancelled");
    assert!(!matches!(error, ZeppBridgeError::ConfigError(_)));
}

#[test]
fn a_partial_fetch_is_not_recorded_as_persisted() {
    let (status, written, reason) =
        classify_backfill_report(&sample_report(StreamStatus::Success, 9, None), true);
    assert_eq!(status, ChunkStatus::Partial);
    assert_eq!(written, 9);
    assert_eq!(reason.unwrap().0, "err.backfill.partial_window");
    assert!(status.needs_work());
}

#[test]
fn a_failed_stream_with_writes_stays_retryable() {
    let (status, written, reason) = classify_backfill_report(
        &sample_report(StreamStatus::Failed, 4, Some("写不进去")),
        false,
    );
    assert_eq!(status, ChunkStatus::Partial);
    assert_eq!(written, 4);
    assert_eq!(reason.unwrap().0, "err.backfill.partial_window");
}

#[test]
fn unverified_parse_failure_is_not_empty_from_cloud() {
    let (status, written, reason) = classify_backfill_report(
        &sample_report(StreamStatus::Unverified, 0, Some("看不懂")),
        false,
    );
    assert_eq!(status, ChunkStatus::Failed);
    assert_eq!(written, 0);
    assert_eq!(reason.unwrap().0, "err.backfill.no_canonical_records");
    assert!(status.needs_work());
}

#[test]
fn empty_success_is_still_empty_from_cloud() {
    let (status, written, reason) =
        classify_backfill_report(&sample_report(StreamStatus::Success, 0, None), false);
    assert_eq!(status, ChunkStatus::EmptyFromCloud);
    assert_eq!(written, 0);
    assert!(reason.is_none());
    assert!(!status.needs_work());
}

#[test]
fn true_all_success_is_persisted() {
    let (status, written, reason) =
        classify_backfill_report(&sample_report(StreamStatus::Success, 20, None), false);
    assert_eq!(status, ChunkStatus::Persisted);
    assert_eq!(written, 20);
    assert!(reason.is_none());
    assert!(!status.needs_work());
}

#[tokio::test]
async fn cancel_and_wait_sets_the_flag_and_returns_when_idle() {
    let dir = std::env::temp_dir().join(format!(
        "zeppbridge-sync-cancel-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    std::fs::create_dir_all(&dir).unwrap();
    let db = Database::new(dir.join("test.db")).unwrap();
    let auth = AuthInfo {
        app_token: "test-token".into(),
        user_id: "user-1".into(),
        region_host: "https://api-mifit.zepp.com".into(),
    };
    let connector = ZeppConnector::new(auth).unwrap();
    let fetcher = DataFetcher::new(connector);
    let manager = SyncManager::new(fetcher, db, Arc::new(AtomicBool::new(false)));

    assert!(!manager.cancel.load(Ordering::SeqCst));
    manager.cancel_and_wait().await;
    assert!(manager.cancel.load(Ordering::SeqCst));

    let _ = std::fs::remove_dir_all(dir);
}

fn sample_report(status: StreamStatus, written: i64, message: Option<&str>) -> StreamReport {
    StreamReport {
        stream: "heart_rate".into(),
        status,
        records_written: written,
        raw_records: 1,
        capability: match status {
            StreamStatus::Success => CapabilityStatus::Verified,
            StreamStatus::Unverified => CapabilityStatus::Unverified,
            StreamStatus::Failed | StreamStatus::Unavailable => CapabilityStatus::Unavailable,
        },
        needs_reauth: false,
        message: message.map(str::to_owned),
    }
}

#[test]
fn a_failed_record_keeps_the_aggregate_failed() {
    let aggregate = aggregate_stream_reports(
        "heart_rate",
        &[
            sample_report(StreamStatus::Success, 10, None),
            sample_report(StreamStatus::Failed, 0, Some("写不进去")),
        ],
    );
    assert_eq!(aggregate.status, StreamStatus::Failed);
    assert_eq!(aggregate.records_written, 10);
    assert!(
        aggregate.message.is_some(),
        "失败时仍要留下说明：{:?}",
        aggregate.message
    );
}

#[test]
fn unverified_notices_can_fold_into_success_when_nothing_failed() {
    let aggregate = aggregate_stream_reports(
        "sleep",
        &[
            sample_report(StreamStatus::Success, 3, None),
            sample_report(StreamStatus::Unverified, 0, Some("响应没有可识别记录")),
        ],
    );
    assert_eq!(aggregate.status, StreamStatus::Success);
    assert_eq!(aggregate.records_written, 3);
}

#[test]
fn pending_details_all_failed_is_an_error() {
    let http = ZeppBridgeError::HttpStatus {
        status: 500,
        message: "boom".into(),
    };
    assert!(pending_details_outcome(Vec::<StreamReport>::new(), Some(http)).is_err());

    let unavailable = ZeppBridgeError::DataUnavailable("gone".into());
    assert!(pending_details_outcome(Vec::<StreamReport>::new(), Some(unavailable)).is_err());

    assert!(pending_details_outcome(Vec::<StreamReport>::new(), None)
        .unwrap()
        .is_empty());
}

#[test]
fn short_chunk_start_does_not_panic() {
    assert_eq!(chunk_month_label("2026-08-01"), "2026-08");
    assert_eq!(chunk_month_label("2026"), "2026");
    assert_eq!(chunk_month_label(""), "");
}

#[test]
fn cleanup_old_data_rejects_out_of_range_days() {
    // 同步路径用 `if let Err` 接住这条错误，不再 `?` 顶掉整次报告。
    let db = Database::in_memory().unwrap();
    assert!(db.cleanup_old_data(0).is_err());
    assert!(db.cleanup_old_data(366).is_err());
}

#[tokio::test]
async fn empty_pending_details_clears_a_stale_failed_status() {
    let dir = std::env::temp_dir().join(format!(
        "zeppbridge-sync-empty-pending-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    std::fs::create_dir_all(&dir).unwrap();
    let db = Database::new(dir.join("test.db")).unwrap();
    db.update_sync_state_details(
        "workout_detail",
        None,
        "failed",
        Some("上一轮全败"),
        false,
        12,
        CapabilityStatus::Unavailable,
        Some("上一轮全败".into()),
    )
    .unwrap();

    let auth = AuthInfo {
        app_token: "test-token".into(),
        user_id: "user-1".into(),
        region_host: "https://api-mifit.zepp.com".into(),
    };
    let connector = ZeppConnector::new(auth).unwrap();
    let fetcher = DataFetcher::new(connector);
    let manager = SyncManager::new(fetcher, db, Arc::new(AtomicBool::new(false)));

    let report = manager.persist_empty_pending_details().await.unwrap();
    assert_eq!(report.status, StreamStatus::Success);
    assert_eq!(report.records_written, 0);

    let state = {
        let db = manager.db.lock().await;
        db.get_sync_state("workout_detail").unwrap().unwrap()
    };
    assert_eq!(state.status, "success");
    assert_eq!(state.records_written, 12);

    let _ = std::fs::remove_dir_all(dir);
}

/// 定时同步平时只拉最近几天；一天里没有成功的整窗同步（或者从来没有过），
/// 就照旧拉整窗，手表晚几天才上云的数据不会漏。
#[test]
fn auto_sync_pulls_the_full_window_once_a_day_and_a_short_one_in_between() {
    let db = Database::in_memory().unwrap();
    let now = Utc::now();
    assert!(db.full_window_refresh_due(now).unwrap(), "从没整窗同步过");
    assert_eq!(
        quick_window_days(true),
        crate::contract::INCREMENTAL_SYNC_DAYS
    );

    db.record_full_window_refresh(now - Duration::hours(2))
        .unwrap();
    assert!(!db.full_window_refresh_due(now).unwrap());
    assert_eq!(quick_window_days(false), crate::contract::QUICK_SYNC_DAYS);

    db.record_full_window_refresh(now - Duration::hours(25))
        .unwrap();
    assert!(db.full_window_refresh_due(now).unwrap());
}

fn chunk_test_manager() -> SyncManager {
    let connector = ZeppConnector::new(AuthInfo {
        app_token: "test-token".into(),
        user_id: "user-1".into(),
        region_host: "https://api-mifit.zepp.com".into(),
    })
    .unwrap();
    SyncManager::new(
        DataFetcher::new(connector),
        Database::in_memory().unwrap(),
        Arc::new(AtomicBool::new(false)),
    )
}

fn heart_rate_chunk(chunk: FetchWindow) -> Vec<FetchedRecord> {
    let second = chunk.start_utc.timestamp() + 60;
    vec![FetchedRecord {
        incomplete: false,
        incomplete_reason: None,
        raw: RawRecord {
            stream: "heart_rate".into(),
            source_key: format!("chunk-test:{second}"),
            source_scope: SourceScope::UserFused,
            device_id: None,
            start_utc: chunk.start_utc,
            end_utc: Some(chunk.end_utc),
            payload: serde_json::json!({"items": [{"timestamp": second, "value": 70}]}),
            capability: CapabilityStatus::Verified,
        },
    }]
}

/// 首页要先看到最新的数据：块从新到旧拉，每一块落库之后立刻通知一次，
/// 而不是整段窗口拉完才通知。
#[tokio::test]
async fn chunked_sync_commits_the_newest_chunk_first_and_reports_each_commit() {
    let manager = chunk_test_manager();
    let window = FetchWindow::days(20).unwrap();
    let mut seen = Vec::new();
    let mut commits = 0;
    let report = manager
        .sync_chunked_stream(
            "heart_rate",
            window,
            7,
            OnChunkError::Continue,
            |chunk| {
                seen.push(chunk.start_utc);
                let records = heart_rate_chunk(chunk);
                async move { Ok(records) }
            },
            || commits += 1,
        )
        .await
        .unwrap();
    assert_eq!(seen.len(), 3);
    assert!(
        seen.windows(2).all(|pair| pair[0] > pair[1]),
        "newest chunk must come first"
    );
    assert_eq!(commits, 3);
    assert_eq!(report.status, StreamStatus::Success);
    assert_eq!(report.raw_records, 3);
    assert_eq!(report.records_written, 3);
}

/// 后面一块失败时，已经落库的留着，但这条流不能报成功。
#[tokio::test]
async fn a_failed_older_chunk_keeps_committed_data_but_fails_the_stream() {
    let manager = chunk_test_manager();
    let window = FetchWindow::days(20).unwrap();
    let mut calls = 0;
    let report = manager
        .sync_chunked_stream(
            "heart_rate",
            window,
            7,
            OnChunkError::StopUnlessUnavailable,
            |chunk| {
                calls += 1;
                let result = if calls == 1 {
                    Ok(heart_rate_chunk(chunk))
                } else {
                    Err(ZeppBridgeError::ConfigError("offline".into()))
                };
                async move { result }
            },
            || {},
        )
        .await
        .unwrap();
    assert_eq!(calls, 2, "a request failure stops the heart-rate stream");
    assert_eq!(report.status, StreamStatus::Failed);
    assert_eq!(report.records_written, 1);
    let db = manager.db.lock().await;
    assert_eq!(
        db.get_sync_state("heart_rate").unwrap().unwrap().status,
        "failed"
    );
}

#[tokio::test]
async fn a_stream_with_no_committed_chunk_hands_the_error_back() {
    let manager = chunk_test_manager();
    let error = manager
        .sync_chunked_stream(
            "sleep",
            FetchWindow::days(14).unwrap(),
            7,
            OnChunkError::Continue,
            |_| async { Err(ZeppBridgeError::Unavailable("404".into())) },
            || {},
        )
        .await
        .unwrap_err();
    assert!(error.is_unavailable());
}
