use std::{fs, process::Command};
use zeppbridge_core::storage::{write_lock, Database};

#[test]
fn migration_lock_contention_returns_busy_and_preserves_the_database() {
    let dir = std::env::temp_dir().join(format!(
        "zeppbridge-cli-migration-busy-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    fs::create_dir_all(&dir).unwrap();
    let path = dir.join("zepp.db");
    drop(Database::open_migrated(&path).unwrap());
    let before = fs::read(&path).unwrap();
    let guard = write_lock::try_acquire(&dir, write_lock::WritePurpose::Sync).unwrap();
    let output = Command::new(env!("CARGO_BIN_EXE_zeppbridge-cli"))
        .env("ZEPPBRIDGE_DATA_DIR", &dir)
        .args(["reprocess", "--json"])
        .output()
        .unwrap();
    assert_eq!(
        output.status.code(),
        Some(4),
        "{}",
        String::from_utf8_lossy(&output.stdout)
    );
    let payload: serde_json::Value = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(payload["ok"], false);
    assert_eq!(payload["errorKind"], "busy");
    assert_eq!(fs::read(&path).unwrap(), before);
    drop(guard);
    drop(Database::open_migrated(&path).unwrap());
    fs::remove_dir_all(dir).unwrap();
}
