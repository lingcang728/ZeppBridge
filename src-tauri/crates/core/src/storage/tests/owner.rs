//! 库归属（代码审查 R06）：一个库只装一个账号的数据，换账号不许静默混库。

use super::*;
use crate::models::CapabilityStatus;

fn with_one_raw_record(db: &Database) {
    db.insert_raw_record(&RawRecord {
        stream: "heart_rate".into(),
        source_key: "owner-test".into(),
        source_scope: SourceScope::UserFused,
        device_id: None,
        start_utc: ts(),
        end_utc: None,
        payload: serde_json::json!({"items": []}),
        capability: CapabilityStatus::Verified,
    })
    .unwrap();
}

#[test]
fn an_empty_library_is_claimed_by_the_first_account_and_refuses_others() {
    let db = Database::in_memory().unwrap();
    assert_eq!(db.library_owner().unwrap(), None);
    db.claim_library_for_login("1000", &[]).unwrap();
    assert_eq!(db.library_owner().unwrap().as_deref(), Some("1000"));

    // 同一账号（旧通道 / 官方通道各连一次）照常。
    db.claim_library_for_login("1000", &["1000".into()])
        .unwrap();
    db.claim_library_for_sync("1000").unwrap();

    // 另一个账号：登录和同步都拒绝，主人不变。
    assert!(matches!(
        db.claim_library_for_login("2000", &[]),
        Err(ZeppBridgeError::AccountMismatch)
    ));
    assert!(matches!(
        db.claim_library_for_sync("2000"),
        Err(ZeppBridgeError::AccountMismatch)
    ));
    assert_eq!(db.library_owner().unwrap().as_deref(), Some("1000"));
}

#[test]
fn an_upgraded_library_with_data_refuses_a_new_account_that_differs_from_the_configured_one() {
    let db = Database::in_memory().unwrap();
    with_one_raw_record(&db);
    // 老库有数据、没有主人：已配置的是 1000，新登录 2000 → 拒绝，不认领。
    assert!(matches!(
        db.claim_library_for_login("2000", &["1000".into()]),
        Err(ZeppBridgeError::AccountMismatch)
    ));
    assert_eq!(db.library_owner().unwrap(), None);
    // 同一个账号重新登录 → 认领（推定归属）。
    db.claim_library_for_login("1000", &["1000".into()])
        .unwrap();
    assert_eq!(db.library_owner().unwrap().as_deref(), Some("1000"));
    assert_eq!(
        db.get_app_meta("library_owner_source").unwrap().as_deref(),
        Some("upgrade")
    );
}

#[test]
fn the_first_sync_after_upgrade_claims_the_library_for_the_syncing_account() {
    let db = Database::in_memory().unwrap();
    with_one_raw_record(&db);
    db.claim_library_for_sync("1000").unwrap();
    assert_eq!(db.library_owner().unwrap().as_deref(), Some("1000"));
    assert!(db.claim_library_for_sync("2000").is_err());
}
