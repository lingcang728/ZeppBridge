//! 官方同步的测试：本地假服务 + 内存库。

use super::*;
use crate::auth::CredentialBackend;
use crate::models::{SourceScope, Workout};
use crate::official::fake_server::{serve, Reply};

/// 这些用例不碰凭据：明细同步不刷新令牌。
struct NoCredentials;

impl CredentialBackend for NoCredentials {
    fn set(&self, _: &str, _: &str) -> std::result::Result<(), String> {
        Ok(())
    }
    fn get(&self, _: &str) -> std::result::Result<Option<String>, String> {
        Ok(None)
    }
    fn delete(&self, _: &str) -> std::result::Result<(), String> {
        Ok(())
    }
    fn supports_named_entries(&self) -> bool {
        true
    }
}

fn official_workout(db: &Database, id: &str) {
    let start = Utc::now() - Duration::days(1);
    db.insert_workout(&Workout {
        workout_id: id.into(),
        workout_type: "run".into(),
        normalized_type: "run".into(),
        type_source: "numeric_mapped".into(),
        effective_type: "run".into(),
        start_time: start,
        end_time: start + Duration::minutes(30),
        source_scope: SourceScope::UserFused,
        ..Default::default()
    })
    .unwrap();
    db.conn
        .execute(
            "UPDATE workouts SET provider = 'official' WHERE workout_id = ?1",
            [id],
        )
        .unwrap();
}

/// 代码审查 R14：明细接口 5xx 时，汇总留着，但 workout_detail 这条流必须
/// 是失败、说清几条没拉到——以前只写日志，界面上是一次完整成功。
#[tokio::test]
async fn a_failing_detail_endpoint_is_reported_not_logged_away() {
    let db = Database::in_memory().unwrap();
    official_workout(&db, "1789908976");
    let (base, _) = serve(|_| Reply::json(500, r#"{"message":"boom"}"#)).await;
    let dir = std::env::temp_dir();
    let sync = OfficialSync::with_parts(
        None,
        db,
        Arc::new(AtomicBool::new(false)),
        OfficialClient::with_bases(&base, &base).unwrap(),
        OfficialStore::with_backend(&dir, Arc::new(NoCredentials)),
        "Asia/Shanghai".into(),
    );
    let mut tokens = OfficialTokens {
        access_token: "access-fixture".into(),
        refresh_token: None,
        expires_at: None,
        user_id: "1".into(),
    };
    let report = sync
        .sync_details(&mut tokens)
        .await
        .unwrap()
        .expect("有明细没拉到就必须有一份报告");
    assert_eq!(report.stream, "workout_detail");
    assert_eq!(report.status, StreamStatus::Failed);
    assert!(report.message.unwrap().contains("1 条"));
}

/// 同一条明细连续失败 3 次后放下：第 3 次起不再把同步标成失败，也不再
/// 出现在待补列表里；官方明确说没有（400 / -50000）的当场放下。
#[tokio::test]
async fn a_detail_that_keeps_failing_is_set_aside_instead_of_failing_every_sync() {
    let db = Database::in_memory().unwrap();
    official_workout(&db, "1789908976");
    let (base, _) = serve(|_| Reply::json(500, r#"{"message":"boom"}"#)).await;
    let sync = OfficialSync::with_parts(
        None,
        db,
        Arc::new(AtomicBool::new(false)),
        OfficialClient::with_bases(&base, &base).unwrap(),
        OfficialStore::with_backend(&std::env::temp_dir(), Arc::new(NoCredentials)),
        "Asia/Shanghai".into(),
    );
    let mut tokens = OfficialTokens {
        access_token: "access-fixture".into(),
        refresh_token: None,
        expires_at: None,
        user_id: "1".into(),
    };
    for _ in 0..2 {
        let report = sync.sync_details(&mut tokens).await.unwrap().unwrap();
        assert_eq!(report.status, StreamStatus::Failed);
    }
    let third = sync.sync_details(&mut tokens).await.unwrap().unwrap();
    assert_ne!(
        third.status,
        StreamStatus::Failed,
        "第 3 次放下，不再标失败"
    );
    assert!(
        sync.sync_details(&mut tokens).await.unwrap().is_none(),
        "放下后不在待补列表"
    );

    let db = Database::in_memory().unwrap();
    official_workout(&db, "1789900000");
    let (base, _) = serve(|_| Reply::json(400, r#"{"code":-50000,"message":"no"}"#)).await;
    let sync = OfficialSync::with_parts(
        None,
        db,
        Arc::new(AtomicBool::new(false)),
        OfficialClient::with_bases(&base, &base).unwrap(),
        OfficialStore::with_backend(&std::env::temp_dir(), Arc::new(NoCredentials)),
        "Asia/Shanghai".into(),
    );
    let report = sync.sync_details(&mut tokens).await.unwrap().unwrap();
    assert_ne!(report.status, StreamStatus::Failed, "官方说没有：当场放下");
    assert!(sync.sync_details(&mut tokens).await.unwrap().is_none());
}

/// 训练负荷平衡（#120）只认旧通道翻到底的运动列表作「这天运动齐了」的凭据。
/// 官方运动按条拆报文、没有游标：只走官方时不产生凭据，负荷窗口照旧留空；
/// 官方补进来一条旧通道没见过的运动，那一天的旧凭据也随之作废。
#[tokio::test]
async fn official_sports_never_establish_training_load_coverage() {
    use chrono::{Local, TimeZone};
    let db = Database::in_memory().unwrap();
    let today = Local::now().date_naive();
    let midnight = |day: NaiveDate| {
        Local
            .from_local_datetime(&day.and_hms_opt(0, 0, 0).unwrap())
            .single()
            .unwrap()
            .with_timezone(&Utc)
    };
    let window_start = today - Duration::days(10);
    let payload = serde_json::json!({"data":{"items":[],"next":-1}});
    let legacy = FetchedRecord {
        incomplete: false,
        incomplete_reason: None,
        raw: RawRecord {
            stream: "workouts".into(),
            source_key: crate::fetcher::sport_history_key("run", &payload),
            source_scope: SourceScope::Device,
            device_id: None,
            start_utc: midnight(window_start),
            end_utc: Some(midnight(today)),
            payload,
            capability: CapabilityStatus::Verified,
        },
    };
    db.record_workout_day_evidence(&crate::storage::training_coverage::workout_day_evidence(&[
        legacy,
    ]))
    .unwrap();
    let yesterday = today - Duration::days(1);
    let key = |day: NaiveDate| day.format("%Y-%m-%d").to_string();
    assert!(db
        .complete_workout_days(&key(window_start), &key(today))
        .unwrap()
        .contains(&key(yesterday)));

    // 官方回一条昨天中午的运动，没有负荷字段（官方接口本来就没有）。
    let noon = Local
        .from_local_datetime(&yesterday.and_hms_opt(12, 0, 0).unwrap())
        .single()
        .unwrap()
        .timestamp();
    let body = format!(
        r#"{{"items":[{{"trackId":"{noon}","source":"run.1.huami.com","startTime":{noon},"endTime":{},"type":"OUTDOOR_RUN"}}]}}"#,
        noon + 1800
    );
    let (base, _) = serve(move |_| Reply::json(200, body.clone())).await;
    let sync = OfficialSync::with_parts(
        None,
        db,
        Arc::new(AtomicBool::new(false)),
        OfficialClient::with_bases(&base, &base).unwrap(),
        OfficialStore::with_backend(&std::env::temp_dir(), Arc::new(NoCredentials)),
        "UTC".into(),
    );
    let mut tokens = OfficialTokens {
        access_token: "access-fixture".into(),
        refresh_token: None,
        expires_at: None,
        user_id: "1".into(),
    };
    let report = sync
        .sync_kind(
            &mut tokens,
            OfficialKind::Sports,
            today - Duration::days(30),
            today,
            "workouts",
            1,
            1,
            &|_| {},
        )
        .await
        .unwrap();
    assert_eq!(report.status, StreamStatus::Success);
    assert_eq!(report.records_written, 1);
    let db = sync.db.lock().await;
    let covered = db
        .complete_workout_days(&key(today - Duration::days(40)), &key(today))
        .unwrap();
    assert!(
        !covered.contains(&key(yesterday)),
        "官方补进来的运动让旧凭据作废"
    );
    assert!(
        covered.iter().all(|day| *day >= key(window_start)),
        "官方同步不产生新的凭据"
    );
    let point = db
        .training_load_balance(yesterday, yesterday)
        .unwrap()
        .remove(0);
    assert_eq!(point.acute_7d, None);
    assert_eq!(point.acute_chronic_ratio, None);
}
