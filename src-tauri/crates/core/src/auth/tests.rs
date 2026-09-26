use super::*;
use std::{
    collections::HashMap,
    sync::{atomic::AtomicU64, atomic::Ordering, Barrier, Mutex},
};

#[test]
fn macos_storage_requires_opt_in_and_remembers_existing_files() {
    assert_eq!(macos_file_store_selected(None, false), Ok(false));
    assert_eq!(macos_file_store_selected(Some("  "), false), Ok(false));
    assert_eq!(macos_file_store_selected(Some(" file "), false), Ok(true));
    assert_eq!(macos_file_store_selected(Some("FILE"), false), Ok(true));
    assert_eq!(macos_file_store_selected(None, true), Ok(true));
    assert_eq!(macos_file_store_selected(Some(""), true), Ok(true));
    assert_eq!(macos_file_store_selected(Some("KEYCHAIN"), true), Ok(false));
    assert_eq!(macos_file_store_selected(Some("keyring"), true), Ok(false));
    for invalid in ["fiel", "env", "secret-service"] {
        for file_exists in [false, true] {
            assert_eq!(
                macos_file_store_selected(Some(invalid), file_exists),
                Err(invalid.to_string()),
            );
        }
    }
}

#[derive(Default)]
struct MemoryCredentials(Mutex<HashMap<String, String>>);

impl CredentialBackend for MemoryCredentials {
    fn set(&self, user_id: &str, token: &str) -> std::result::Result<(), String> {
        self.0
            .lock()
            .unwrap()
            .insert(user_id.to_string(), token.to_string());
        Ok(())
    }

    fn get(&self, user_id: &str) -> std::result::Result<Option<String>, String> {
        Ok(self.0.lock().unwrap().get(user_id).cloned())
    }

    fn delete(&self, user_id: &str) -> std::result::Result<(), String> {
        self.0.lock().unwrap().remove(user_id);
        Ok(())
    }
}

fn temp_dir() -> PathBuf {
    // Wall-clock timestamps can repeat across parallel tests. Claim each
    // directory exclusively, including when a previous process left it behind.
    static NEXT_ID: AtomicU64 = AtomicU64::new(0);
    loop {
        let path = std::env::temp_dir().join(format!(
            "zeppbridge-auth-test-{}-{}",
            std::process::id(),
            NEXT_ID.fetch_add(1, Ordering::Relaxed)
        ));
        match fs::create_dir(&path) {
            Ok(()) => return path,
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => continue,
            Err(error) => panic!("cannot create auth test directory: {error}"),
        }
    }
}

#[test]
fn parallel_auth_roundtrips_keep_separate_files() {
    let barrier = Arc::new(Barrier::new(16));
    let workers: Vec<_> = (0..16)
        .map(|index| {
            let barrier = barrier.clone();
            std::thread::spawn(move || {
                barrier.wait();
                let dir = temp_dir();
                let manager = AuthManager::with_credential_backend(
                    dir.clone(),
                    Arc::new(MemoryCredentials::default()),
                );
                let user_id = format!("user-{index}");
                manager
                    .save_auth(&AuthInfo {
                        app_token: format!("token-{index}"),
                        user_id: user_id.clone(),
                        region_host: "https://api-mifit.zepp.com".to_string(),
                    })
                    .unwrap();
                assert_eq!(manager.load_auth().unwrap().unwrap().user_id, user_id);
                manager.clear_auth().unwrap();
                fs::remove_dir(&dir).unwrap();
                dir
            })
        })
        .collect();
    let paths: std::collections::HashSet<_> = workers
        .into_iter()
        .map(|worker| worker.join().unwrap())
        .collect();
    assert_eq!(paths.len(), 16);
}

#[test]
fn credential_roundtrip_does_not_write_token_to_auth_json() {
    let dir = temp_dir();
    let backend = Arc::new(MemoryCredentials::default());
    let manager = AuthManager::with_credential_backend(dir.clone(), backend.clone());
    manager
        .save_auth(&AuthInfo {
            app_token: "  secret-token  ".to_string(),
            user_id: " user-1 ".to_string(),
            region_host: "https://API-MIFIT.ZEPP.COM/".to_string(),
        })
        .unwrap();

    let file = fs::read_to_string(dir.join("auth.json")).unwrap();
    assert!(!file.contains("secret-token"));
    let loaded = manager.load_auth().unwrap().unwrap();
    assert_eq!(loaded.app_token, "secret-token");
    assert_eq!(loaded.region_host, "https://api-mifit.zepp.com");
    assert_eq!(manager.masked_token().unwrap().as_deref(), Some("se…en"));

    manager.clear_auth().unwrap();
    assert!(!dir.join("auth.json").exists());
    assert_eq!(backend.get("user-1").unwrap(), None);
    let _ = fs::remove_dir_all(dir);
}

#[test]
fn saving_a_different_user_deletes_the_previous_credential() {
    let dir = temp_dir();
    let backend = Arc::new(MemoryCredentials::default());
    let manager = AuthManager::with_credential_backend(dir.clone(), backend.clone());
    manager
        .save_auth(&AuthInfo {
            app_token: "token-a".to_string(),
            user_id: "user-a".to_string(),
            region_host: "https://api-mifit.zepp.com".to_string(),
        })
        .unwrap();
    manager
        .save_auth(&AuthInfo {
            app_token: "token-b".to_string(),
            user_id: "user-b".to_string(),
            region_host: "https://api-mifit.zepp.com".to_string(),
        })
        .unwrap();

    assert_eq!(backend.get("user-a").unwrap(), None);
    assert_eq!(backend.get("user-b").unwrap().as_deref(), Some("token-b"));
    let loaded = manager.load_auth().unwrap().unwrap();
    assert_eq!(loaded.user_id, "user-b");
    let _ = fs::remove_dir_all(dir);
}

#[test]
fn clear_auth_uses_hint_when_auth_json_is_gone() {
    let dir = temp_dir();
    let backend = Arc::new(MemoryCredentials::default());
    let manager = AuthManager::with_credential_backend(dir.clone(), backend.clone());
    manager
        .save_auth(&AuthInfo {
            app_token: "token-a".to_string(),
            user_id: "user-a".to_string(),
            region_host: "https://api-mifit.zepp.com".to_string(),
        })
        .unwrap();
    fs::remove_file(dir.join("auth.json")).unwrap();
    assert!(dir.join("auth.user-id").exists());

    manager.clear_auth().unwrap();
    assert_eq!(backend.get("user-a").unwrap(), None);
    assert!(!dir.join("auth.user-id").exists());
    let _ = fs::remove_dir_all(dir);
}
