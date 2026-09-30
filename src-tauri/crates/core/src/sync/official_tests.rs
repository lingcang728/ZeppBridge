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
