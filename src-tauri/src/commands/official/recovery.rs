//! Verified authorization receipts stay in memory until the user chooses a store.
//! Never serialize the receipt, publish it over IPC, or enable a fallback on error.

use super::*;
#[cfg(test)]
use crate::commands::credential_recovery::file_allowed;
use crate::commands::credential_recovery::{can_save_file, RETENTION};
pub use crate::commands::credential_recovery::{RecoveryStatus, StorageChoice};
use std::path::Path;
use zeppbridge_core::official::OfficialTokens;

static PENDING: Mutex<Option<PendingAuthorization>> = Mutex::new(None);

#[derive(Clone)]
struct PendingAuthorization {
    data_dir: PathBuf,
    tokens: OfficialTokens,
    nickname: Option<String>,
    generation: u64,
    received: Instant,
}

impl PendingAuthorization {
    fn valid(&self, data_dir: &Path, generation: u64, now: Instant, unix_now: i64) -> bool {
        self.data_dir == data_dir
            && self.generation == generation
            && now.saturating_duration_since(self.received) < RETENTION
            && self
                .tokens
                .expires_at
                .is_none_or(|expires| expires > unix_now)
    }
}

fn snapshot(data_dir: &Path) -> Option<PendingAuthorization> {
    let mut pending = PENDING.lock().ok()?;
    let current = pending.as_ref()?;
    if !current.valid(
        data_dir,
        zeppbridge_core::official::current_generation(),
        Instant::now(),
        chrono::Utc::now().timestamp(),
    ) {
        *pending = None;
        return None;
    }
    Some(current.clone())
}

pub(super) fn status(data_dir: &Path) -> Option<OfficialStatus> {
    snapshot(data_dir)?;
    let mut status = OfficialStatus::failed(
        "err.official.store",
        "官方授权成功了，但令牌没能存进系统凭据存储",
    );
    status.credential_recovery = Some(RecoveryStatus::current());
    Some(status)
}

pub(super) fn clear() {
    if let Ok(mut pending) = PENDING.lock() {
        *pending = None;
    }
}

fn clear_generation(generation: u64) {
    if let Ok(mut pending) = PENDING.lock() {
        if pending
            .as_ref()
            .is_some_and(|value| value.generation == generation)
        {
            *pending = None;
        }
    }
}

pub(super) fn remember(
    data_dir: &Path,
    tokens: OfficialTokens,
    nickname: Option<String>,
    generation: u64,
) {
    if let Ok(mut pending) = PENDING.lock() {
        if zeppbridge_core::official::current_generation() != generation {
            return;
        }
        *pending = Some(PendingAuthorization {
            data_dir: data_dir.to_path_buf(),
            tokens,
            nickname,
            generation,
            received: Instant::now(),
        });
    }
    // Also drop idle receipts without waiting for another IPC request.
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(RETENTION).await;
        clear_generation(generation);
    });
}

pub(super) fn recover(data_dir: &Path, storage: StorageChoice) -> OfficialStatus {
    if snapshot(data_dir).is_none() {
        return OfficialStatus::failed("err.official.expired", "授权已失效，请重新登录");
    }
    let store = match storage {
        StorageChoice::System => OfficialStore::new(data_dir),
        StorageChoice::File => {
            if !can_save_file() {
                return status(data_dir).unwrap_or_else(|| stored_status(data_dir));
            }
            #[cfg(unix)]
            {
                OfficialStore::with_backend(
                    data_dir,
                    Arc::new(zeppbridge_core::auth::FileCredentialBackend::new(data_dir)),
                )
            }
            #[cfg(not(unix))]
            {
                return status(data_dir).unwrap_or_else(|| stored_status(data_dir));
            }
        }
    };
    recover_with_store(data_dir, store)
}

fn recover_with_store(data_dir: &Path, store: OfficialStore) -> OfficialStatus {
    let Some(pending) = snapshot(data_dir) else {
        return OfficialStatus::failed("err.official.expired", "授权已失效，请重新登录");
    };
    match store.save_login(
        &pending.tokens,
        pending.nickname.as_deref(),
        chrono::Utc::now().timestamp(),
        pending.generation,
    ) {
        Ok(_) => {
            clear_generation(pending.generation);
            stored_status(data_dir)
        }
        Err(_) => status(data_dir).unwrap_or_else(|| stored_status(data_dir)),
    }
}

#[tauri::command]
pub async fn recover_official_credentials(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
    storage: StorageChoice,
) -> Result<OfficialStatus, AppError> {
    let data_dir = state.data_dir.clone();
    let status = super::super::join_blocking(
        tokio::task::spawn_blocking(move || recover(&data_dir, storage)).await,
    )?;
    publish(&app, &status);
    Ok(status)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn receipts_expire_and_cannot_be_reused_after_cancel_or_in_another_library() {
        let now = Instant::now();
        let mut receipt = PendingAuthorization {
            data_dir: PathBuf::from("library"),
            tokens: OfficialTokens {
                access_token: "secret".into(),
                refresh_token: None,
                expires_at: None,
                user_id: "test".into(),
            },
            nickname: None,
            generation: 4,
            received: now,
        };
        assert!(receipt.valid(Path::new("library"), 4, now, 100));
        assert!(!receipt.valid(Path::new("library"), 5, now, 100));
        assert!(!receipt.valid(Path::new("other"), 4, now, 100));
        assert!(!receipt.valid(Path::new("library"), 4, now + RETENTION, 100));
        receipt.tokens.expires_at = Some(100);
        assert!(!receipt.valid(Path::new("library"), 4, now, 100));
    }

    #[test]
    fn explicit_startup_configuration_is_not_overridden_by_the_file_choice() {
        assert_eq!(file_allowed(None, false), cfg!(unix));
        assert_eq!(file_allowed(Some("FILE"), true), cfg!(unix));
        for configured in ["secret-service", "keychain", "env", "invalid"] {
            assert!(!file_allowed(Some(configured), false));
        }
        assert!(!file_allowed(None, true));
    }

    #[cfg(unix)]
    #[test]
    fn failed_system_save_stays_in_memory_until_file_is_explicitly_selected() {
        use std::os::unix::fs::PermissionsExt;
        use zeppbridge_core::auth::{CredentialBackend, FileCredentialBackend};
        struct Unavailable;
        impl CredentialBackend for Unavailable {
            fn set(&self, _: &str, _: &str) -> Result<(), String> {
                Err("locked".into())
            }
            fn get(&self, _: &str) -> Result<Option<String>, String> {
                Err("locked".into())
            }
            fn delete(&self, _: &str) -> Result<(), String> {
                Err("locked".into())
            }
        }
        let _test_guard = TEST_LOCK.lock().unwrap();
        let dir = std::env::temp_dir().join(format!("zeppbridge-recovery-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let tokens = OfficialTokens {
            access_token: "diagnostic-access-secret".into(),
            refresh_token: Some("diagnostic-refresh-secret".into()),
            expires_at: None,
            user_id: "diagnostic".into(),
        };
        let generation = invalidate_pending_logins();
        *PENDING.lock().unwrap() = Some(PendingAuthorization {
            data_dir: dir.clone(),
            tokens: tokens.clone(),
            nickname: None,
            generation,
            received: Instant::now(),
        });
        let failed = recover_with_store(
            &dir,
            OfficialStore::with_backend(&dir, Arc::new(Unavailable)),
        );
        assert_eq!(failed.state, "failed");
        assert!(failed.credential_recovery.is_some());
        assert!(
            !dir.join("credentials.json").exists(),
            "A failed system store must not enable file storage"
        );
        let public_status = serde_json::to_string(&failed).unwrap();
        assert!(!public_status.contains("diagnostic-access-secret"));
        assert!(!public_status.contains("diagnostic-refresh-secret"));

        let file_store =
            || OfficialStore::with_backend(&dir, Arc::new(FileCredentialBackend::new(&dir)));
        let connected = recover_with_store(&dir, file_store());
        assert_eq!(connected.state, "connected");
        assert!(connected.credential_recovery.is_none());
        assert_eq!(file_store().load().unwrap(), Some(tokens.clone()));
        assert_eq!(
            std::fs::metadata(dir.join("credentials.json"))
                .unwrap()
                .permissions()
                .mode()
                & 0o777,
            0o600
        );
        assert!(snapshot(&dir).is_none());

        // A stale receipt after cancellation must never overwrite saved credentials.
        *PENDING.lock().unwrap() = Some(PendingAuthorization {
            data_dir: dir.clone(),
            tokens,
            nickname: None,
            generation,
            received: Instant::now(),
        });
        invalidate_pending_logins();
        let before = std::fs::read(dir.join("credentials.json")).unwrap();
        let expired = recover_with_store(&dir, file_store());
        assert_eq!(
            expired.message_code.as_deref(),
            Some("err.official.expired")
        );
        assert_eq!(std::fs::read(dir.join("credentials.json")).unwrap(), before);
        clear();
        std::fs::remove_dir_all(dir).unwrap();
    }
}
