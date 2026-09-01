use super::status::build_app_status;
use crate::app_state::AppState;
use crate::auth::extract_from_har;
use crate::connectors::ZeppConnector;
use crate::ipc_error::AppError;
use crate::ipc_types::AppStatus;
use crate::models::{error::ZeppBridgeError, AuthInfo};
use chrono::{Duration, Utc};
use serde_json::Value;
use std::path::PathBuf;

/// Save authentication metadata and install a ready-to-use synchronizer.
///
/// The credential itself is accepted only by `AuthManager`; this command
/// never includes it in a status value or an error message.  Building the
/// synchronizer opens a separate database connection, so the command-side
/// database lock is not held while doing setup.
#[tauri::command]
pub async fn save_auth(
    state: tauri::State<'_, AppState>,
    app_token: String,
    user_id: String,
    region_host: String,
) -> std::result::Result<AppStatus, AppError> {
    let auth = AuthInfo {
        app_token,
        user_id,
        region_host,
    };

    state.auth.save_auth(&auth)?;

    let manager = match AppState::build_sync_manager(auth, &state.data_dir) {
        Ok(manager) => manager,
        Err(error) => {
            // Metadata and the credential store must not be left configured
            // when the connector/database cannot be initialized.  Clearing is
            // deliberately best effort; the original setup error is the
            // actionable result returned to the caller.
            let message = error.to_string();
            let _ = state.auth.clear_auth();
            {
                let mut sync = state.sync.write().await;
                *sync = None;
            }
            {
                let mut auth_state = state.auth_state.write().await;
                *auth_state = "unconfigured".to_string();
            }
            let failure = AppError::new(
                "err.auth.sync_init_failed",
                format!("无法初始化同步，请检查认证区域后重试：{message}"),
            );
            {
                let mut warning = state.auth_warning.write().await;
                *warning = Some(failure.message.clone());
            }
            return Err(failure);
        }
    };

    {
        let mut sync = state.sync.write().await;
        *sync = Some(manager);
    }
    {
        let mut auth_state = state.auth_state.write().await;
        *auth_state = "configured".to_string();
    }
    {
        let mut warning = state.startup_warning.write().await;
        *warning = None;
    }
    {
        let mut warning = state.auth_warning.write().await;
        *warning = None;
    }

    build_app_status(&state).await
}

/// Verify the saved credential with a real, bounded recent heart-rate query.
///
/// A structured empty response is still a successful authentication check:
/// the account may simply have no heart-rate samples in the two-hour window.
/// Scalars, malformed payloads, and explicit non-success response codes are
/// rejected so that an HTML/error body cannot be reported as verified.
#[tauri::command]
pub async fn verify_auth(
    state: tauri::State<'_, AppState>,
) -> std::result::Result<AppStatus, AppError> {
    let auth = match state.auth.load_auth() {
        Ok(Some(auth)) => auth,
        Ok(None) => {
            return verify_failure(
                &state,
                ZeppBridgeError::AuthError("尚未配置认证信息".to_string()),
            )
            .await
        }
        Err(error) => return verify_failure(&state, error).await,
    };

    if let Err(error) = verify_recent_heart_rate(&auth).await {
        return verify_failure(&state, error).await;
    }

    let manager = match AppState::build_sync_manager(auth, &state.data_dir) {
        Ok(manager) => manager,
        Err(error) => return verify_failure(&state, error).await,
    };

    {
        let mut sync = state.sync.write().await;
        *sync = Some(manager);
    }
    {
        let mut auth_state = state.auth_state.write().await;
        *auth_state = "verified".to_string();
    }
    {
        let mut warning = state.startup_warning.write().await;
        *warning = None;
    }
    {
        let mut warning = state.auth_warning.write().await;
        *warning = None;
    }

    build_app_status(&state).await
}

/// Remove credentials and reset only the in-memory authentication/sync
/// state.  The SQLite database is intentionally retained so clearing an
/// account cannot erase historical health data.
#[tauri::command]
pub async fn clear_auth(
    state: tauri::State<'_, AppState>,
) -> std::result::Result<AppStatus, AppError> {
    state
        .login
        .epoch
        .fetch_add(1, std::sync::atomic::Ordering::SeqCst);
    {
        let mut login = state.login.status.write().await;
        *login = crate::ipc_types::LoginStatus::idle();
    }

    state.auth.clear_auth()?;

    {
        let mut sync = state.sync.write().await;
        *sync = None;
    }
    {
        let mut auth_state = state.auth_state.write().await;
        *auth_state = "unconfigured".to_string();
    }
    {
        let mut warning = state.startup_warning.write().await;
        *warning = None;
    }
    {
        let mut region = state.region_confidence.write().await;
        *region = "unknown".to_string();
    }

    build_app_status(&state).await
}

/// Verify a credential with the same bounded recent heart-rate query used by
/// `verify_auth`.  The request is made without holding application locks.
pub(crate) async fn verify_recent_heart_rate(
    auth: &AuthInfo,
) -> std::result::Result<(), ZeppBridgeError> {
    let connector = ZeppConnector::new(auth.clone())?;
    let end = Utc::now();
    let start = end - Duration::hours(2);
    let payload = connector
        .fetch_heart_rate(start.timestamp(), end.timestamp())
        .await?;
    validate_verify_payload(&payload)
}

/// Validate only the response shape needed to establish authentication.  An
/// object/array may legitimately be empty (no recent samples), while an
/// object carrying a response code must explicitly report a known success
/// value.
pub(crate) fn validate_verify_payload(value: &Value) -> std::result::Result<(), ZeppBridgeError> {
    let object = match value {
        Value::Array(_) => return Ok(()),
        Value::Object(object) => object,
        _ => {
            return Err(ZeppBridgeError::ParseError(
                "认证验证返回了空或无效的 JSON 结构".to_string(),
            ))
        }
    };

    let Some(code) = object.get("code") else {
        return Ok(());
    };

    let success = match code {
        Value::Number(number) => matches!(number.as_i64(), Some(0) | Some(1) | Some(200)),
        // Some regional API versions serialize numeric response codes as
        // strings.  Accept only the same three exact success values.
        Value::String(code) => matches!(code.trim(), "0" | "1" | "200"),
        _ => false,
    };

    if success {
        Ok(())
    } else {
        Err(ZeppBridgeError::ParseError(
            "认证验证返回了失败的响应代码".to_string(),
        ))
    }
}

/// 登录时的区域判定证据强度。
///
/// 「这份凭据还有效吗」和「这个 host 是不是本账号的区域」是两个问题，之前由
/// 同一个判据回答。`validate_verify_payload` 回答的是前者，那里「空」是合法
/// 的——用户可能这两小时没戴表。可后者不行：一个根本不认识这个账号的区域
/// 同样返回结构化空响应，而且因为它压根不去查数据，往往还答得更快。于是在
/// 十来个候选区域的并发竞速里，最先返回的常常是错的那个，被存成
/// `region_host`；之后每一次同步都打向那里，界面显示「已连接」，库里一条
/// 记录也没有。
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub(crate) enum RegionEvidence {
    /// 请求成功了，但没有任何内容能证明这个 host 认识本账号。
    Empty,
    /// 这个 host 按 `user_id` 返回了该账号绑定的设备——它认识这个人。
    Identified,
}

/// 判断某个区域 host 是不是本账号的区域。
///
/// 用 `/users/{user_id}/devices`：路径里带着 `user_id`，所以「区域对但这两
/// 小时没数据」和「这个区域不认识这个用户」不再返回同一个东西。会用
/// ZeppBridge 的人必然绑过一块表，因此拿到设备就是强证据。
///
/// 设备端点因为非鉴权原因失败时，退回到与 `verify_auth` 相同的心率检查，把
/// 结果记成弱证据——宁可退回改动前的判据，也不要让一条从来没出过问题的
/// 登录路径因为换了端点而失败。
pub(crate) async fn probe_region_evidence(
    auth: &AuthInfo,
) -> std::result::Result<RegionEvidence, ZeppBridgeError> {
    let connector = ZeppConnector::new(auth.clone())?;
    match connector.fetch_devices().await {
        Ok(payload) => {
            if super::data::parse_device_profiles(&payload).is_empty() {
                Ok(RegionEvidence::Empty)
            } else {
                Ok(RegionEvidence::Identified)
            }
        }
        // 凭据被明确拒绝是结论，不必再问第二个端点。
        Err(error @ ZeppBridgeError::NeedsReauth(_)) => Err(error),
        Err(_) => verify_recent_heart_rate(auth)
            .await
            .map(|()| RegionEvidence::Empty),
    }
}

/// Record a verification warning and return a Chinese, token-free error.
/// Only an explicit `NeedsReauth` error changes the auth state; transient
/// transport/format failures leave the saved configuration available for a
/// retry while still surfacing the warning in the status stream.
async fn verify_failure(
    state: &AppState,
    error: ZeppBridgeError,
) -> std::result::Result<AppStatus, AppError> {
    let failure = user_facing_verify_error(&error);
    if error.needs_reauth() {
        let mut auth_state = state.auth_state.write().await;
        *auth_state = "needs_reauth".to_string();
    }
    {
        let mut warning = state.auth_warning.write().await;
        *warning = Some(failure.message.clone());
    }
    Err(failure)
}

/// 验证失败分三类，各有各的下一步：网络问题重试就行，凭据失效要重新连接，
/// 其余的才是「说不清」。上一版把它们混成一句中文，英文界面上更是完全读不懂。
fn user_facing_verify_error(error: &ZeppBridgeError) -> AppError {
    match error {
        ZeppBridgeError::NetworkError(_) => AppError::new(
            "err.auth.verify_network",
            "认证验证失败：无法连接 Zepp 服务，请检查网络后重试",
        ),
        ZeppBridgeError::NeedsReauth(_) => AppError::new(
            "err.auth.verify_needs_reauth",
            "认证验证失败：认证已失效，请重新保存认证信息",
        ),
        _ => AppError::new("err.auth.verify_failed", format!("认证验证失败：{error}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn verify_payload_accepts_empty_structured_success() {
        for value in [
            json!([]),
            json!({}),
            json!({"code": 0}),
            json!({"code": "200"}),
        ] {
            assert!(validate_verify_payload(&value).is_ok(), "rejected {value}");
        }
    }

    #[test]
    fn verify_payload_rejects_scalars_and_failure_codes() {
        for value in [json!(null), json!("ok"), json!(42), json!({"code": 500})] {
            assert!(validate_verify_payload(&value).is_err(), "accepted {value}");
        }
    }
}

/// Import authentication credentials from a HAR (HTTP Archive) file.
///
/// Parses a HAR file exported from mitmproxy/Charles/browser devtools,
/// extracts `app_token`, `user_id`, and `region_host`, and saves them
/// using the same flow as `save_auth`.
///
/// The HAR file must contain at least one request to an `api-mifit*` host
/// with the `apptoken` header present.
#[tauri::command]
pub async fn import_from_har(
    state: tauri::State<'_, AppState>,
    har_path: String,
) -> std::result::Result<AppStatus, AppError> {
    let path = PathBuf::from(&har_path);

    let auth = extract_from_har(&path)?;

    // Use the same save flow as manual entry
    save_auth(state, auth.app_token, auth.user_id, auth.region_host).await
}

/// Manually enter authentication credentials.
///
/// This is a convenience wrapper around `save_auth` that accepts the same
/// three parameters. The frontend can use this for a manual entry form or
/// call `save_auth` directly.
#[tauri::command]
pub async fn manual_auth(
    state: tauri::State<'_, AppState>,
    app_token: String,
    user_id: String,
    region_host: String,
) -> std::result::Result<AppStatus, AppError> {
    save_auth(state, app_token, user_id, region_host).await
}
