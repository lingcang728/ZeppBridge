#![cfg(unix)]

use std::{
    fs,
    process::Command,
    sync::{Arc, Barrier},
};
use zeppbridge_core::{
    auth::{AuthManager, CredentialBackend, FileCredentialBackend},
    models::AuthInfo,
};

#[test]
fn live_manager_uses_consented_file_without_restart() {
    const CHILD: &str = "ZEPPBRIDGE_TEST_LIVE_CREDENTIAL_DIR";
    if let Some(dir) = std::env::var_os(CHILD) {
        let dir = std::path::PathBuf::from(dir);
        let running = AuthManager::new(dir.clone());
        assert!(running.load_auth().unwrap().is_none());
        let file = Arc::new(FileCredentialBackend::new(&dir));
        file.set("official:fixture-user:access", "fixture-official")
            .unwrap();
        let consented = AuthManager::with_credential_backend(dir.clone(), file.clone());
        let mut auth = AuthInfo {
            app_token: "fixture-advanced-token".into(),
            user_id: "fixture-user".into(),
            region_host: "https://api-mifit.zepp.com".into(),
        };
        consented.save_auth(&auth).unwrap();
        assert_eq!(
            running.load_auth().unwrap().unwrap().app_token,
            auth.app_token
        );
        auth.app_token = "updated-advanced-token".into();
        running.save_auth(&auth).unwrap();
        assert_eq!(
            AuthManager::new(dir.clone())
                .load_auth()
                .unwrap()
                .unwrap()
                .app_token,
            auth.app_token
        );
        running.clear_auth().unwrap();
        assert!(file.get("fixture-user").unwrap().is_none());
        assert_eq!(
            file.get("official:fixture-user:access").unwrap().as_deref(),
            Some("fixture-official")
        );
        return;
    }
    let dir = std::env::temp_dir().join(format!(
        "zeppbridge-live-credentials-{}",
        std::process::id()
    ));
    fs::create_dir_all(&dir).unwrap();
    let output = Command::new(std::env::current_exe().unwrap())
        .args([
            "--exact",
            "live_manager_uses_consented_file_without_restart",
            "--nocapture",
        ])
        .env(CHILD, &dir)
        .env_remove("ZEPPBRIDGE_CREDENTIAL_STORE")
        .env_remove("ZEPPBRIDGE_APP_TOKEN")
        .output()
        .unwrap();
    fs::remove_dir_all(dir).unwrap();
    assert!(
        output.status.success(),
        "{}\n{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
}

#[test]
fn concurrent_stores_preserve_every_login_entry() {
    let dir = std::env::temp_dir().join(format!(
        "zeppbridge-concurrent-credentials-{}",
        std::process::id()
    ));
    fs::create_dir_all(&dir).unwrap();
    let barrier = Arc::new(Barrier::new(8));
    let workers: Vec<_> = (0..8)
        .map(|index| {
            let barrier = barrier.clone();
            let dir = dir.clone();
            std::thread::spawn(move || {
                let backend = FileCredentialBackend::new(&dir);
                barrier.wait();
                for value in 0..12 {
                    backend
                        .set(&format!("entry-{index}"), &format!("value-{value}"))
                        .unwrap();
                }
            })
        })
        .collect();
    for worker in workers {
        worker.join().unwrap();
    }
    let backend = FileCredentialBackend::new(&dir);
    for index in 0..8 {
        assert_eq!(
            backend.get(&format!("entry-{index}")).unwrap().as_deref(),
            Some("value-11")
        );
    }
    fs::remove_dir_all(dir).unwrap();
}
