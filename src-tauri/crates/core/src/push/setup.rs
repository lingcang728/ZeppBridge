//! 推送目标的设置（2026-11-18，桌面设置「推送到你自己的服务器」用）。
//!
//! 读写 `push/targets.json`、存取密钥、解析用户贴进来的连接码、读上一轮结果，
//! 以及从本机装过的 ZeppBridge Cloud 组件把站点和密钥接过来（只读组件的东西，不删）。
//! 规矩和 `mod.rs` 一样：配置文件里没有密钥；密钥只进系统凭据库；错误只带码。

use super::{
    load_targets, pa, push_dir, push_error, secret_account, store_pa_secrets, PushError,
    TargetConfig, TargetKind, TARGETS_FILE,
};
use crate::auth::CredentialBackend;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::Path;

/// 界面只管一个 PA 目标，id 固定。
pub const PA_TARGET_ID: &str = "pa";

/// 写回目标配置（先过一遍和读取一样的校验，不通过就一个字节都不写）。
pub fn save_targets(data_dir: &Path, targets: &[TargetConfig]) -> Result<(), PushError> {
    let dir = push_dir(data_dir);
    std::fs::create_dir_all(&dir)
        .map_err(|error| push_error("err.push.state_unwritable", error.to_string()))?;
    let body = serde_json::json!({ "version": 1, "targets": targets });
    if let Some(field) = super::find_secret_field(&body, "") {
        return Err(push_error("err.push.config_has_secret", field));
    }
    let text = serde_json::to_vec_pretty(&body)
        .map_err(|error| push_error("err.push.config_invalid", error.to_string()))?;
    let path = dir.join(TARGETS_FILE);
    crate::paths::write_file_atomically(&path, &text)
        .map_err(|error| push_error("err.push.state_unwritable", error.to_string()))?;
    // 写完再读一遍：读不回来就说明写坏了。
    load_targets(data_dir).map(|_| ())
}

/// 新建或更新 PA 目标：地址照用户填的存（推送时再规范化），其余选项保留原值。
pub fn upsert_pa_target(data_dir: &Path, site: &str, enabled: bool) -> Result<(), PushError> {
    super::client::normalize_pa_site(site, false)
        .map_err(|code| push_error("err.push.site_invalid", code))?;
    let mut targets = load_targets(data_dir)?;
    match targets.iter_mut().find(|target| target.id == PA_TARGET_ID) {
        Some(target) => {
            target.site = site.trim().to_string();
            target.enabled = enabled;
        }
        None => targets.push(TargetConfig {
            id: PA_TARGET_ID.into(),
            kind: TargetKind::Pa,
            enabled,
            site: site.trim().to_string(),
            retention_days: 90,
            summary_days: 30,
            full_resolution_workouts: false,
            unstrap: false,
            dev_loopback: false,
        }),
    }
    save_targets(data_dir, &targets)
}

/// 只改开关。
pub fn set_enabled(data_dir: &Path, id: &str, enabled: bool) -> Result<(), PushError> {
    let mut targets = load_targets(data_dir)?;
    let target = targets
        .iter_mut()
        .find(|target| target.id == id)
        .ok_or_else(|| push_error("err.push.not_configured", ""))?;
    target.enabled = enabled;
    save_targets(data_dir, &targets)
}

/// 移除目标：配置、密钥、清单和上一轮结果一起删。站点上的东西不动。
pub fn remove_target(
    data_dir: &Path,
    credentials: &dyn CredentialBackend,
    id: &str,
) -> Result<(), PushError> {
    let targets: Vec<TargetConfig> = load_targets(data_dir)?
        .into_iter()
        .filter(|target| target.id != id)
        .collect();
    save_targets(data_dir, &targets)?;
    if credentials.supports_named_entries() {
        let _ = credentials.delete(&secret_account(id));
    }
    let dir = push_dir(data_dir);
    for suffix in ["manifest.json", "status.json"] {
        let _ = std::fs::remove_file(dir.join(format!("{id}.{suffix}")));
    }
    Ok(())
}

/// 凭据库里有没有这个目标能用的密钥（只看能不能解开，不回传任何密钥）。
pub fn has_secrets(credentials: &dyn CredentialBackend, id: &str) -> bool {
    credentials.supports_named_entries()
        && credentials
            .get(&secret_account(id))
            .ok()
            .flatten()
            .and_then(|text| serde_json::from_str::<pa::PaSecrets>(&text).ok())
            .is_some_and(|secrets| secrets.validate().is_ok())
}

/// 解析用户贴进来的连接码：一段 JSON，至少有 `dk` 和 `writeKey`（`tenant` 可选，
/// `node keys.mjs init` 的整行输出也认，多出来的 `readKey` 不要）。允许前后夹着别的字
/// （从 AI 的回答里整段复制过来）。
pub fn parse_connection_code(text: &str) -> Result<pa::PaSecrets, PushError> {
    let invalid = || push_error("err.push.connection_code_invalid", "");
    let start = text.find('{').ok_or_else(invalid)?;
    let end = text.rfind('}').ok_or_else(invalid)?;
    if end < start {
        return Err(invalid());
    }
    let value: Value = serde_json::from_str(&text[start..=end]).map_err(|_| invalid())?;
    let field = |name: &str| value.get(name).and_then(Value::as_str).map(str::trim);
    let secrets = pa::PaSecrets {
        tenant: field("tenant")
            .filter(|tenant| !tenant.is_empty())
            .map(str::to_string),
        dk: field("dk").ok_or_else(invalid)?.to_string(),
        write_key: field("writeKey").ok_or_else(invalid)?.to_string(),
    };
    secrets
        .validate()
        .map_err(|code| push_error(code, "connection code"))?;
    Ok(secrets)
}

/// 存连接码。
pub fn save_connection_code(
    credentials: &dyn CredentialBackend,
    id: &str,
    text: &str,
) -> Result<(), PushError> {
    let secrets = parse_connection_code(text)?;
    store_pa_secrets(credentials, id, &secrets)
}

/// 上一轮结果（`push/<id>.status.json`）。没跑过就是 None。
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct LastPush {
    pub result: String,
    #[serde(default)]
    pub stats: LastPushStats,
    pub error_code: Option<String>,
    pub at: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct LastPushStats {
    #[serde(default)]
    pub objects: usize,
    #[serde(default)]
    pub deleted: usize,
    #[serde(default)]
    pub unchanged: usize,
    #[serde(default)]
    pub bytes_sent: usize,
}

pub fn last_push(data_dir: &Path, id: &str) -> Option<LastPush> {
    let bytes = std::fs::read(push_dir(data_dir).join(format!("{id}.status.json"))).ok()?;
    serde_json::from_slice(&bytes).ok()
}

/// 本机 ZeppBridge Cloud 组件存在凭据管理器里的上传密钥（`ZeppBridgeCloud:<主机>:upload`，
/// 内容是 `{tenant, dk, writeKey}`）。只在 Windows 上有这个组件。
#[cfg(windows)]
pub fn companion_upload_secret(host: &str) -> Option<String> {
    let target = format!("ZeppBridgeCloud:{host}:upload");
    let entry = keyring::Entry::new_with_target(&target, "ZeppBridgeCloud", "").ok()?;
    let bytes = entry.get_secret().ok()?;
    String::from_utf8(bytes).ok()
}

#[cfg(not(windows))]
pub fn companion_upload_secret(_host: &str) -> Option<String> {
    None
}
