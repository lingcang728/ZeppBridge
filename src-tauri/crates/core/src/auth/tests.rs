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

/// #145：macOS 上新构建读不了旧钥匙串条目、授权弹窗又答不上来时，删除会失败。
/// 退出登录照样完成：`auth.json` 和提示文件都删掉，之后读不到账号；存储的原话交回去记日志。
#[test]
fn clear_auth_still_signs_out_when_the_store_refuses_to_delete() {
    struct RefusesDelete(MemoryCredentials);
    impl CredentialBackend for RefusesDelete {
        fn set(&self, user_id: &str, token: &str) -> std::result::Result<(), String> {
            self.0.set(user_id, token)
        }
        fn get(&self, user_id: &str) -> std::result::Result<Option<String>, String> {
            self.0.get(user_id)
        }
        fn delete(&self, _user_id: &str) -> std::result::Result<(), String> {
            Err("keychain prompt was not answered".to_string())
        }
    }
    let dir = temp_dir();
    let manager = AuthManager::with_credential_backend(
        dir.clone(),
        Arc::new(RefusesDelete(MemoryCredentials::default())),
    );
    manager
        .save_auth(&AuthInfo {
            app_token: "token-a".to_string(),
            user_id: "user-a".to_string(),
            region_host: "https://api-mifit.zepp.com".to_string(),
        })
        .unwrap();

    let left_behind = manager.clear_auth().unwrap();
    assert!(left_behind.is_some());
    assert!(!dir.join("auth.json").exists());
    assert!(!dir.join("auth.user-id").exists());
    assert!(manager.load_auth().unwrap().is_none());
    let _ = fs::remove_dir_all(dir);
}

#[test]
fn denied_credential_read_preserves_recovery_metadata_and_signout() {
    struct Denied;
    impl CredentialBackend for Denied {
        fn set(&self, _: &str, _: &str) -> std::result::Result<(), String> {
            Ok(())
        }
        fn get(&self, _: &str) -> std::result::Result<Option<String>, String> {
            Err("access denied".into())
        }
        fn delete(&self, _: &str) -> std::result::Result<(), String> {
            Err("access denied".into())
        }
    }
    let dir = temp_dir();
    let manager = AuthManager::with_credential_backend(dir.clone(), Arc::new(Denied));
    manager
        .save_auth(&AuthInfo {
            app_token: "secret-token".into(),
            user_id: "user-a".into(),
            region_host: "https://api-mifit.zepp.com".into(),
        })
        .unwrap();
    let status = manager.status().unwrap();
    assert!(status.configuration_present);
    assert!(!status.configured);
    assert!(status.credential_error.is_some());
    assert!(status.token_masked.is_none());
    assert_eq!(status.user_id.as_deref(), Some("user-a"));
    assert!(manager.load_auth().is_err());
    manager.clear_auth().unwrap();
    assert!(!manager.status().unwrap().configuration_present);
    fs::remove_dir_all(dir).unwrap();
}

#[test]
fn recovery_can_replace_an_unreadable_token_and_sign_out_when_delete_is_denied() {
    use std::sync::atomic::AtomicBool;
    #[derive(Default)]
    struct Recoverable {
        values: MemoryCredentials,
        denied: AtomicBool,
    }
    impl CredentialBackend for Recoverable {
        fn set(&self, id: &str, token: &str) -> std::result::Result<(), String> {
            self.values.set(id, token)
        }
        fn get(&self, id: &str) -> std::result::Result<Option<String>, String> {
            if self.denied.load(Ordering::Relaxed) {
                Err("access denied".into())
            } else {
                self.values.get(id)
            }
        }
        fn delete(&self, _: &str) -> std::result::Result<(), String> {
            Err("delete denied".into())
        }
    }
    let dir = temp_dir();
    let backend = Arc::new(Recoverable::default());
    let manager = AuthManager::with_credential_backend(dir.clone(), backend.clone());
    let mut auth = AuthInfo {
        app_token: "old-token".into(),
        user_id: "user-a".into(),
        region_host: "https://api-mifit.zepp.com".into(),
    };
    manager.save_auth(&auth).unwrap();
    backend.denied.store(true, Ordering::Relaxed);
    assert!(!manager.status().unwrap().configured);
    auth.app_token = "replacement-token".into();
    manager.save_auth(&auth).unwrap();
    backend.denied.store(false, Ordering::Relaxed);
    assert_eq!(
        manager.load_auth().unwrap().unwrap().app_token,
        "replacement-token"
    );
    assert!(manager.status().unwrap().configured);
    assert_eq!(
        manager.clear_auth().unwrap().as_deref(),
        Some("delete denied")
    );
    assert!(backend.values.get("user-a").unwrap().is_some());
    assert!(
        manager.load_auth().unwrap().is_none(),
        "orphaned secret must not sign the user back in"
    );
    assert!(!manager.status().unwrap().configuration_present);
    auth.app_token = "reconnected-token".into();
    manager.save_auth(&auth).unwrap();
    assert_eq!(
        manager.load_auth().unwrap().unwrap().app_token,
        "reconnected-token"
    );
    fs::remove_dir_all(dir).unwrap();
}

#[test]
fn missing_or_invalid_credentials_never_count_as_available() {
    let dir = temp_dir();
    let backend = Arc::new(MemoryCredentials::default());
    let manager = AuthManager::with_credential_backend(dir.clone(), backend.clone());
    manager
        .save_auth(&AuthInfo {
            app_token: "valid-token".into(),
            user_id: "user-a".into(),
            region_host: "https://api-mifit.zepp.com".into(),
        })
        .unwrap();
    for token in [None, Some(""), Some("bad\ntoken")] {
        match token {
            Some(token) => backend.set("user-a", token).unwrap(),
            None => backend.delete("user-a").unwrap(),
        }
        let status = manager.status().unwrap();
        assert!(status.configuration_present);
        assert!(!status.configured);
        assert!(status.token_masked.is_none());
        assert!(status.credential_error.is_some());
        assert!(manager.load_auth().is_err());
    }
    fs::remove_dir_all(dir).unwrap();
}

#[test]
fn corrupt_metadata_remains_visible_and_can_be_cleared() {
    for metadata in ["broken", r#"{"user_id":"invalid/id","region_host":"bad"}"#] {
        let dir = temp_dir();
        let backend = Arc::new(MemoryCredentials::default());
        backend.set("user-a", "token").unwrap();
        fs::write(dir.join("auth.json"), metadata).unwrap();
        fs::write(dir.join("auth.user-id"), "user-a").unwrap();
        let manager = AuthManager::with_credential_backend(dir.clone(), backend.clone());
        let status = manager.status().unwrap();
        assert!(status.configuration_present);
        assert!(!status.configured);
        assert!(status.credential_error.is_some());
        manager.clear_auth().unwrap();
        assert!(backend.get("user-a").unwrap().is_none());
        assert!(!manager.status().unwrap().configuration_present);
        fs::remove_dir_all(dir).unwrap();
    }
}
