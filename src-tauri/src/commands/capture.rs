use crate::app_state::{mask_user_id, AppState};
use crate::ipc_types::{
    capture_diagnostics_from, capture_session_from, stopped_capture_diagnostics_from,
    CaptureSession, CaptureStatus, CapturedSummary,
};
use crate::models::AuthInfo;
use crate::proxy::{CapturedAuth, ProxyLifecycle, ProxyServer, ProxyStatus};
use std::sync::Arc;

/// Start (or restart) the local capture proxy and return the phone-facing
/// connection details.  The previous proxy is stopped before it is replaced
/// so a port change cannot leave the old listener alive.
#[tauri::command]
pub async fn start_capture(
    state: tauri::State<'_, AppState>,
    port: u16,
) -> std::result::Result<CaptureSession, String> {
    if !(1024..=u16::MAX).contains(&port) {
        return Err("代理端口必须在 1024–65535 之间".to_string());
    }

    // Clone while holding the state lock, then release it before awaiting the
    // proxy shutdown.  A proxy shutdown may wait for active connections.
    let previous = { state.proxy.read().await.clone() };
    previous.stop().await.map_err(|error| error.to_string())?;

    let data_dir = state.data_dir.clone();
    let proxy = Arc::new(ProxyServer::with_data_dir(port, data_dir));
    {
        let mut current = state.proxy.write().await;
        *current = Arc::clone(&proxy);
    }

    let status = proxy.start().await.map_err(|error| error.to_string())?;
    let session = match capture_session_from(&status) {
        Some(session) => session,
        None => {
            let _ = proxy.stop().await;
            return Err(capture_session_error(&status));
        }
    };

    Ok(session)
}

/// Return the current capture state.  Once a complete credential has been
/// observed, persist it through the auth manager and initialize the sync
/// manager before exposing the redacted summary to the frontend.
#[tauri::command]
pub async fn get_capture_status(
    state: tauri::State<'_, AppState>,
) -> std::result::Result<CaptureStatus, String> {
    // The status/captured reads are synchronous proxy operations.  Clone the
    // Arc first so no state lock is held while auth or sync work is performed.
    let proxy = { state.proxy.read().await.clone() };
    let status = proxy.status();
    // A stopped proxy may retain the last watch value for diagnostics, but it
    // must not re-persist that credential on a later status poll.  A fresh
    // start creates a new ProxyServer and therefore a fresh capture window.
    let captured = status.running.then(|| proxy.captured()).flatten();

    let captured_summary = match captured {
        Some(captured) => Some(persist_captured_auth(&state, captured).await?),
        None => None,
    };

    Ok(capture_status_from(&status, captured_summary))
}

/// Complete a partial proxy capture with only the missing user identifier.
///
/// The proxy retains the observed token and region host; callers never send a
/// token through this command.  A stopped proxy is rejected before the
/// accumulator is consulted so an old partial capture cannot be reused.
#[tauri::command]
pub async fn complete_capture_user_id(
    state: tauri::State<'_, AppState>,
    user_id: String,
) -> std::result::Result<CaptureStatus, String> {
    let user_id = validate_capture_user_id(&user_id)?;
    let proxy = { state.proxy.read().await.clone() };
    let before = proxy.status();
    if !before.running {
        let message = "捕获代理未运行，请先开始捕获后重试".to_string();
        mark_capture_warning(&state, message.clone()).await;
        return Err(message);
    }

    let captured = match proxy.supply_user_id(&user_id) {
        Ok(captured) => captured,
        Err(error) => {
            let message = format!("补充用户 ID 失败：{error}");
            mark_auth_capture_failure(&state, message.clone()).await;
            return Err(message);
        }
    };
    let status = proxy.status();
    let captured_summary = persist_captured_auth(&state, captured).await?;

    Ok(capture_status_from(&status, Some(captured_summary)))
}

/// Stop the capture proxy.  Stopping an already-stopped proxy is delegated to
/// `ProxyServer::stop`, which is idempotent; the public result intentionally
/// omits the old session and captured credentials.
#[tauri::command]
pub async fn stop_capture(
    state: tauri::State<'_, AppState>,
) -> std::result::Result<CaptureStatus, String> {
    let proxy = { state.proxy.read().await.clone() };
    let status = proxy.stop().await.map_err(|error| error.to_string())?;
    let diagnostics = stopped_capture_diagnostics_from(&status);

    Ok(CaptureStatus {
        state: lifecycle_name(status.lifecycle).to_string(),
        session: None,
        captured: None,
        diagnostics,
        message: merged_status_message(&status),
        error: status.error,
    })
}

async fn mark_auth_capture_failure(state: &AppState, message: String) {
    {
        let mut auth_state = state.auth_state.write().await;
        *auth_state = "needs_reauth".to_string();
    }
    {
        let mut warning = state.startup_warning.write().await;
        *warning = Some(message);
    }
}

async fn mark_capture_warning(state: &AppState, message: String) {
    let mut warning = state.startup_warning.write().await;
    *warning = Some(message);
}

async fn persist_captured_auth(
    state: &AppState,
    captured: CapturedAuth,
) -> std::result::Result<CapturedSummary, String> {
    let auth = AuthInfo {
        app_token: captured.app_token,
        user_id: captured.user_id.clone(),
        region_host: captured.region_host.clone(),
    };

    if let Err(error) = state.auth.save_auth(&auth) {
        let message = format!("捕获的认证信息保存失败：{error}");
        mark_auth_capture_failure(state, message.clone()).await;
        return Err(message);
    }

    let masked_user_id = mask_user_id(&auth.user_id);
    let region_host = auth.region_host.clone();
    let sync_manager = match AppState::build_sync_manager(auth, &state.data_dir) {
        Ok(manager) => manager,
        Err(error) => {
            let message = format!("捕获的认证信息已保存，但同步管理器初始化失败：{error}");
            mark_auth_capture_failure(state, message.clone()).await;
            return Err(message);
        }
    };

    {
        let mut sync = state.sync.write().await;
        *sync = Some(sync_manager);
    }
    {
        let mut auth_state = state.auth_state.write().await;
        *auth_state = "configured".to_string();
    }
    {
        let mut warning = state.startup_warning.write().await;
        *warning = None;
    }

    Ok(CapturedSummary {
        user_id: masked_user_id,
        region_host,
    })
}

fn capture_status_from(status: &ProxyStatus, captured: Option<CapturedSummary>) -> CaptureStatus {
    CaptureStatus {
        state: lifecycle_name(status.lifecycle).to_string(),
        session: capture_session_from(status),
        captured,
        diagnostics: capture_diagnostics_from(status),
        message: merged_status_message(status),
        error: status.error.clone(),
    }
}

fn validate_capture_user_id(raw: &str) -> std::result::Result<String, String> {
    let value = raw.trim();
    if value.is_empty()
        || value.len() > 64
        || value
            .chars()
            .any(|character| !(character.is_ascii_alphanumeric() || matches!(character, '_' | '-')))
    {
        return Err("用户 ID 为空或格式无效".to_string());
    }
    Ok(value.to_string())
}

fn capture_session_error(status: &ProxyStatus) -> String {
    if status.local_ipv4.is_empty() {
        return "未找到可用的局域网 IP，请确认电脑已连接 Wi‑Fi 或网卡，并与手机处于同一网络后重试"
            .to_string();
    }
    "捕获代理已启动，但连接信息不完整；请检查证书与监听端口后重试".to_string()
}

fn merged_status_message(status: &ProxyStatus) -> Option<String> {
    let mut messages = Vec::<String>::new();
    if status.running {
        let diagnostics = capture_diagnostics_from(status);
        if !diagnostics.guidance.trim().is_empty() {
            messages.push(diagnostics.guidance);
        }
    }
    for message in [
        status.error.as_deref(),
        status.firewall_warning.as_deref(),
        status.certificate_trust_warning.as_deref(),
    ] {
        if let Some(message) = message.filter(|message| !message.trim().is_empty()) {
            if !messages.iter().any(|existing| existing == message) {
                messages.push(message.to_string());
            }
        }
    }
    (!messages.is_empty()).then(|| messages.join("\n"))
}

fn lifecycle_name(lifecycle: ProxyLifecycle) -> &'static str {
    match lifecycle {
        ProxyLifecycle::Stopped => "stopped",
        ProxyLifecycle::Starting => "starting",
        ProxyLifecycle::Running => "running",
        ProxyLifecycle::Stopping => "stopping",
        ProxyLifecycle::Error => "error",
    }
}
