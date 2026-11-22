#![cfg(target_os = "linux")]

use serde_json::{json, Value};
use std::{fs, process::Command};
use zeppbridge_core::auth::{CredentialBackend, FileCredentialBackend};
use zeppbridge_core::storage::Database;

#[test]
fn default_sync_selects_an_official_only_file_grant_and_reports_reauthorization() {
    let dir = std::env::temp_dir().join(format!(
        "zeppbridge-cli-official-{}",
        zeppbridge_core::unique_suffix()
    ));
    fs::create_dir_all(&dir).unwrap();
    let store = FileCredentialBackend::new(&dir);
    store.set("official:1:access", "fixture-access").unwrap();
    fs::write(
        dir.join("official.json"),
        json!({"user_id":"1","connected_at":1,"expires_at":2}).to_string(),
    )
    .unwrap();
    let run = |args: &[&str]| {
        let output = Command::new(env!("CARGO_BIN_EXE_zeppbridge-cli"))
            .env("ZEPPBRIDGE_DATA_DIR", &dir)
            .env("ZEPPBRIDGE_CREDENTIAL_STORE", "file")
            .args(args)
            .output()
            .unwrap();
        let report = serde_json::from_slice::<Value>(&output.stdout).unwrap();
        (output.status.code().unwrap(), report)
    };
    let (code, sync) = run(&["sync", "--no-reprocess", "--json"]);
    assert_eq!(code, 3, "{sync}");
    assert_eq!(sync["needsReauth"], true);
    assert_eq!(sync["channels"]["official"]["errorKind"], "auth");
    assert!(sync["channels"]["advanced"].is_null());
    let (code, status) = run(&["status", "--json"]);
    assert_eq!(code, 0, "{status}");
    assert_eq!(status["official"]["state"], "needs_reauth");
    assert_eq!(status["official"]["lastSync"]["outcome"], "needs_reauth");
    assert!(status["lastCloudSyncAt"].is_null());
    assert!(store.get("official:1:access").unwrap().is_none());
    assert!(Database::open_read_only(dir.join("zepp.db"))
        .unwrap()
        .library_owner()
        .unwrap()
        .is_none());
    fs::remove_dir_all(dir).unwrap();
}
