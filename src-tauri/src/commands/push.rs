//! 设置 › 数据 ›「推送到你自己的服务器」（2026-11-18）。
//!
//! 推送本身在 core（`zeppbridge_core::push`）：同步完成后在后台推一轮，没有已启用的目标就什么都不做。
//! 这里只给界面五件事：看状态、填站点和连接码、从本机的 ZeppBridge Cloud 组件接过来、立即推一次、移除。
//! 密钥只进系统凭据库，界面拿到的只有「有没有」；错误只带 `err.push.*` 码。

use crate::{app_state::AppState, ipc_error::AppError};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use zeppbridge_core::auth::default_credential_backend_in;
use zeppbridge_core::push::{self, client, setup, PushError};

/// 同一时刻只推一轮（界面上的「立即推送」连点）。
static RUNNING: AtomicBool = AtomicBool::new(false);

#[derive(Debug, Clone, Serialize, Default)]
pub struct PushState {
    /// 填过站点（有一个 PA 目标）。
    pub configured: bool,
    pub enabled: bool,
    /// 用户填的原样。
    pub site: Option<String>,
    /// 规范化后的站点地址（`https://health.example.com`）。
    pub site_url: Option<String>,
    /// 凭据库里有能解开的密钥。
    pub has_secrets: bool,
    /// 凭据库能不能按名字存（环境变量后端不能）。
    pub credential_store_ok: bool,
    pub last: Option<setup::LastPush>,
    pub running: bool,
    /// 配置文件读不了时的码。
    pub config_error_code: Option<String>,
    /// 本机装过 ZeppBridge Cloud 组件、而且能接过来（有站点、凭据管理器里有上传密钥）：它的站点地址。
    pub companion_site_url: Option<String>,
    /// 组件的计划任务还在：接过来以后两边会各传一份，界面提示删掉。
    pub companion_tasks: bool,
}

fn push_app_error(error: PushError) -> AppError {
    let message = match error.code {
        "err.push.site_invalid" => {
            "站点地址不对：只填域名（例如 example.com），或完整的 https 网址"
        }
        "err.push.connection_code_invalid" => "连接码不对：要整段贴进来，里面有 dk 和 writeKey",
        "err.push.pa_write_key_malformed" => "连接码里的写入密钥格式不对",
        "err.push.pa_data_key_malformed" => "连接码里的数据密钥格式不对",
        "err.push.pa_tenant_mismatch" => "连接码里的租户和写入密钥对不上",
        "err.push.credential_store_unnamed" => "当前的凭据存储不能保存推送密钥",
        "err.push.credential_store_failed" => "推送密钥没能存进系统凭据库",
        "err.push.not_configured" => "还没有设置推送目标",
        "err.push.companion_not_found" => "这台电脑上没找到能接过来的 ZeppBridge Cloud 设置",
        "err.push.config_has_secret" => "推送配置里出现了像密钥的字段，已拒绝",
        "err.push.state_unwritable" => "推送配置写不进数据目录",
        _ => "推送配置读不了",
    };
    AppError::new(error.code, message)
}

/// 组件的站点（`https://health.example.com`）和上传密钥。没装、没配、没密钥都是 None。
fn companion() -> Option<(String, String)> {
    let site_url = super::cloud_companion::companion_site_url()?;
    let host = site_url
        .split_once("://")
        .map(|(_, rest)| rest)
        .unwrap_or(&site_url)
        .split('/')
        .next()?
        .to_string();
    let secret = setup::companion_upload_secret(&host)?;
    setup::parse_connection_code(&secret).ok()?;
    Some((site_url, secret))
}

fn collect(data_dir: &Path) -> PushState {
    let credentials = default_credential_backend_in(data_dir);
    let mut state = PushState {
        credential_store_ok: credentials.supports_named_entries(),
        running: RUNNING.load(Ordering::SeqCst),
        ..PushState::default()
    };
    match push::load_targets(data_dir) {
        Ok(targets) => {
            if let Some(target) = targets.iter().find(|t| t.id == setup::PA_TARGET_ID) {
                state.configured = true;
                state.enabled = target.enabled;
                state.site_url = client::normalize_pa_site(&target.site, target.dev_loopback)
                    .ok()
                    .map(|site| site.base);
                state.site = Some(target.site.clone());
                state.has_secrets = setup::has_secrets(credentials.as_ref(), &target.id);
                state.last = setup::last_push(data_dir, &target.id);
            }
        }
        Err(error) => state.config_error_code = Some(error.code.to_string()),
    }
    if let Some((url, _)) = companion() {
        // 已经接过同一个站点就不再提。
        if state.site_url.as_deref() != Some(url.as_str()) || !state.has_secrets {
            state.companion_site_url = Some(url);
        }
    }
    state.companion_tasks = super::cloud_companion::companion_tasks_present();
    state
}

async fn blocking<T: Send + 'static>(
    work: impl FnOnce() -> T + Send + 'static,
) -> Result<T, AppError> {
    tokio::task::spawn_blocking(work)
        .await
        .map_err(|_| AppError::new("err.push.state_unwritable", "推送配置写不进数据目录"))
}

#[derive(Debug, Clone, Deserialize)]
pub struct PushSaveInput {
    pub site: String,
    /// 空 = 不换密钥（只改地址）。
    pub connection_code: Option<String>,
    pub enabled: bool,
}

#[tauri::command]
pub async fn push_state(state: tauri::State<'_, AppState>) -> Result<PushState, AppError> {
    let dir = state.data_dir.clone();
    blocking(move || collect(&dir)).await
}

#[tauri::command]
pub async fn push_save(
    state: tauri::State<'_, AppState>,
    input: PushSaveInput,
) -> Result<PushState, AppError> {
    let dir = state.data_dir.clone();
    blocking(move || -> Result<PushState, AppError> {
        let credentials = default_credential_backend_in(&dir);
        // 先校验两样都对，再落盘：地址错了不留下半份配置。
        client::normalize_pa_site(&input.site, false).map_err(|code| {
            push_app_error(PushError {
                code: "err.push.site_invalid",
                detail: code.into(),
            })
        })?;
        match input.connection_code.as_deref().map(str::trim) {
            Some(code) if !code.is_empty() => {
                setup::save_connection_code(credentials.as_ref(), setup::PA_TARGET_ID, code)
                    .map_err(push_app_error)?;
            }
            _ if !setup::has_secrets(credentials.as_ref(), setup::PA_TARGET_ID) => {
                return Err(push_app_error(PushError {
                    code: "err.push.connection_code_invalid",
                    detail: String::new(),
                }));
            }
            _ => {}
        }
        setup::upsert_pa_target(&dir, &input.site, input.enabled).map_err(push_app_error)?;
        Ok(collect(&dir))
    })
    .await?
}

#[tauri::command]
pub async fn push_set_enabled(
    state: tauri::State<'_, AppState>,
    enabled: bool,
) -> Result<PushState, AppError> {
    let dir = state.data_dir.clone();
    blocking(move || -> Result<PushState, AppError> {
        setup::set_enabled(&dir, setup::PA_TARGET_ID, enabled).map_err(push_app_error)?;
        Ok(collect(&dir))
    })
    .await?
}

/// 从本机的 ZeppBridge Cloud 组件把站点和上传密钥接过来（只读组件的东西，不删）。
#[tauri::command]
pub async fn push_import_companion(
    state: tauri::State<'_, AppState>,
) -> Result<PushState, AppError> {
    let dir = state.data_dir.clone();
    blocking(move || -> Result<PushState, AppError> {
        let (site_url, secret) = companion().ok_or_else(|| {
            push_app_error(PushError {
                code: "err.push.companion_not_found",
                detail: String::new(),
            })
        })?;
        let credentials = default_credential_backend_in(&dir);
        setup::save_connection_code(credentials.as_ref(), setup::PA_TARGET_ID, &secret)
            .map_err(push_app_error)?;
        setup::upsert_pa_target(&dir, &site_url, true).map_err(push_app_error)?;
        Ok(collect(&dir))
    })
    .await?
}

/// 立即推一轮（不等下一次同步）。推送的失败记在结果里，不当成命令失败。
#[tauri::command]
pub async fn push_run(state: tauri::State<'_, AppState>) -> Result<PushState, AppError> {
    let dir: PathBuf = state.data_dir.clone();
    if RUNNING
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return blocking(move || collect(&dir)).await;
    }
    struct Release;
    impl Drop for Release {
        fn drop(&mut self) {
            RUNNING.store(false, Ordering::SeqCst);
        }
    }
    let _release = Release;
    let credentials = default_credential_backend_in(&dir);
    let _ = push::run(&dir, credentials).await;
    drop(_release);
    blocking(move || collect(&dir)).await
}

/// 移除推送目标：配置、密钥、清单、上一轮结果。站点上的东西不动。
#[tauri::command]
pub async fn push_remove(state: tauri::State<'_, AppState>) -> Result<PushState, AppError> {
    let dir = state.data_dir.clone();
    blocking(move || -> Result<PushState, AppError> {
        let credentials = default_credential_backend_in(&dir);
        setup::remove_target(&dir, credentials.as_ref(), setup::PA_TARGET_ID)
            .map_err(push_app_error)?;
        Ok(collect(&dir))
    })
    .await?
}
