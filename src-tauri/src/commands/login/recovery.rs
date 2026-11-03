//! Retain failed Advanced data saves in backend memory, never in IPC payloads.

use super::*;
use crate::app_state::PendingLogin;
use crate::commands::credential_recovery::{
    can_save_file, RecoveryStatus, StorageChoice, RETENTION,
};
use crate::models::error::HeadlessProblem;
use std::time::Instant;

pub(crate) fn is_store_error(error: &ZeppBridgeError) -> bool {
    matches!(
        error,
        ZeppBridgeError::CredentialStore(_)
            | ZeppBridgeError::Headless(HeadlessProblem::NoCredentialStore { .. })
    )
}

pub(crate) fn clear(state: &AppState) {
    if let Ok(mut pending) = state.login.pending_credentials.lock() {
        *pending = None;
    }
}

fn clear_epoch(state: &AppState, epoch: u64) {
    if let Ok(mut pending) = state.login.pending_credentials.lock() {
        if pending.as_ref().is_some_and(|value| value.epoch == epoch) {
            *pending = None;
        }
    }
}

pub(crate) fn remember(
    state: &AppState,
    auth: AuthInfo,
    epoch: u64,
    confidence: Option<&'static str>,
) {
    if let Ok(mut pending) = state.login.pending_credentials.lock() {
        if state.login.epoch.load(Ordering::SeqCst) != epoch {
            return;
        }
        *pending = Some(PendingLogin {
            auth,
            epoch,
            confidence,
            received: Instant::now(),
        });
    }
    let cache = state.login.pending_credentials.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(RETENTION).await;
        if let Ok(mut pending) = cache.lock() {
            if pending.as_ref().is_some_and(|value| value.epoch == epoch) {
                *pending = None;
            }
        }
    });
}

fn snapshot(state: &AppState) -> Option<PendingLogin> {
    let mut pending = state.login.pending_credentials.lock().ok()?;
    if pending.as_ref().is_some_and(|value| {
        value.epoch != state.login.epoch.load(Ordering::SeqCst)
            || value.received.elapsed() >= RETENTION
    }) {
        *pending = None;
    }
    pending.clone()
}

pub(crate) fn status(state: &AppState) -> Option<LoginStatus> {
    snapshot(state)?;
    let mut status = LoginStatus::new(
        "failed",
        "err.core.credential_store",
        "无法访问凭据存储",
        "",
    );
    status.credential_recovery = Some(RecoveryStatus::current());
    Some(status)
}

pub(crate) fn expired() -> LoginStatus {
    LoginStatus::new(
        "failed",
        "err.login.timeout",
        "登录超时，请重新连接高级数据",
        "",
    )
}

async fn recover(state: &AppState, storage: StorageChoice) -> Result<LoginStatus, AppError> {
    let _command_guard = state.lock_sync_commands().await;
    let Some(pending) = snapshot(state) else {
        return Ok(expired());
    };
    super::super::claim_library_for_login(&state.data_dir, &pending.auth.user_id).await?;
    if state.login.epoch.load(Ordering::SeqCst) != pending.epoch {
        return Ok(expired());
    }
    let manager = match storage {
        StorageChoice::System => state.auth.clone(),
        StorageChoice::File => {
            if !can_save_file() {
                return Ok(status(state).unwrap_or_else(expired));
            }
            #[cfg(unix)]
            {
                std::sync::Arc::new(crate::auth::AuthManager::with_credential_backend(
                    state.data_dir.clone(),
                    std::sync::Arc::new(zeppbridge_core::auth::FileCredentialBackend::new(
                        &state.data_dir,
                    )),
                ))
            }
            #[cfg(not(unix))]
            {
                return Ok(status(state).unwrap_or_else(expired));
            }
        }
    };
    let auth = pending.auth.clone();
    let saved = crate::commands::join_blocking(
        tokio::task::spawn_blocking(move || manager.save_auth(&auth)).await,
    )?;
    if let Err(error) = saved {
        return if is_store_error(&error) {
            Ok(status(state).unwrap_or_else(expired))
        } else {
            Err(error.into())
        };
    }
    // Keep the installed manager consistent with disk even if cancellation raced the save.
    let result = if let Some(confidence) = pending.confidence {
        super::apply_persisted_login(state, pending.auth, confidence)
            .await
            .map_err(|failure| failure.error)?;
        LoginStatus::new("connected", "err.login.connected", "已连接 Zepp 账号", "")
    } else {
        crate::commands::auth::install_saved_auth(state, pending.auth).await?;
        // Manual credentials are saved, not yet verified. Do not trigger an automatic sync.
        LoginStatus::new("configured", "", "", "")
    };
    clear_epoch(state, pending.epoch);
    if state.login.epoch.load(Ordering::SeqCst) != pending.epoch {
        return Ok(expired());
    }
    Ok(result)
}

#[tauri::command]
pub async fn recover_advanced_credentials(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
    storage: StorageChoice,
) -> Result<LoginStatus, AppError> {
    let epoch = state.login.epoch.load(Ordering::SeqCst);
    let status = recover(&state, storage).await?;
    if state.login.epoch.load(Ordering::SeqCst) == epoch {
        publish_status(&app, &state, status.clone()).await;
        if matches!(status.state.as_str(), "connected" | "configured") {
            close_login_window_for_epoch(&app, epoch);
        }
    }
    Ok(status)
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use std::os::unix::fs::PermissionsExt;

    fn fixture() -> (AppState, AuthInfo) {
        let dir = std::env::temp_dir().join(format!(
            "zeppbridge-advanced-recovery-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let state = AppState::isolated_test_state(dir).unwrap();
        let auth = AuthInfo {
            app_token: "fixture-advanced-secret".into(),
            user_id: "fixture-user".into(),
            region_host: "https://api-mifit.zepp.com".into(),
        };
        (state, auth)
    }

    #[tokio::test]
    async fn manual_file_recovery_saves_without_claiming_verification_or_exposing_the_token() {
        let (state, auth) = fixture();
        remember(&state, auth.clone(), 0, None);
        let public = serde_json::to_string(&status(&state).unwrap()).unwrap();
        assert!(!public.contains(&auth.app_token));
        assert!(!state.data_dir.join("credentials.json").exists());
        let result = recover(&state, StorageChoice::File).await.unwrap();
        assert_eq!(result.state, "configured");
        assert_eq!(*state.auth_state.read().await, "configured");
        assert_eq!(
            state.auth.load_auth().unwrap().unwrap().app_token,
            auth.app_token
        );
        assert_eq!(
            std::fs::metadata(state.data_dir.join("credentials.json"))
                .unwrap()
                .permissions()
                .mode()
                & 0o777,
            0o600
        );
        assert!(status(&state).is_none());
        std::fs::remove_dir_all(&state.data_dir).unwrap();
    }

    #[tokio::test]
    async fn verified_web_login_installs_the_synchronizer_after_file_recovery() {
        let (state, auth) = fixture();
        remember(&state, auth, 0, Some("identified"));
        let result = recover(&state, StorageChoice::File).await.unwrap();
        assert_eq!(result.state, "connected");
        assert_eq!(*state.auth_state.read().await, "verified");
        assert!(state.sync.read().await.is_some());
        assert_eq!(*state.region_confidence.read().await, "identified");
        assert!(status(&state).is_none());
        std::fs::remove_dir_all(&state.data_dir).unwrap();
    }

    #[tokio::test]
    async fn cancelled_or_expired_credentials_never_reach_the_file() {
        let (state, auth) = fixture();
        remember(&state, auth.clone(), 0, Some("identified"));
        state.login.epoch.fetch_add(1, Ordering::SeqCst);
        assert_eq!(
            recover(&state, StorageChoice::File).await.unwrap().state,
            "failed"
        );
        assert!(!state.data_dir.join("credentials.json").exists());
        remember(&state, auth, 1, None);
        state
            .login
            .pending_credentials
            .lock()
            .unwrap()
            .as_mut()
            .unwrap()
            .received = Instant::now() - RETENTION;
        assert!(status(&state).is_none());
        assert_eq!(
            recover(&state, StorageChoice::File).await.unwrap().state,
            "failed"
        );
        assert!(!state.data_dir.join("auth.json").exists());
        std::fs::remove_dir_all(&state.data_dir).unwrap();
    }

    #[test]
    fn unrelated_failures_do_not_offer_a_storage_fallback() {
        assert!(is_store_error(&ZeppBridgeError::CredentialStore(
            "locked".into()
        )));
        assert!(is_store_error(&ZeppBridgeError::Headless(
            HeadlessProblem::NoCredentialStore {
                detail: "no default wallet".into()
            }
        )));
        assert!(!is_store_error(&ZeppBridgeError::ParseError(
            "invalid token".into()
        )));
    }
}
