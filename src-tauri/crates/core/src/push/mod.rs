//! 推送到用户自己的服务器。
//!
//! 现在只有一种目标：PA 站点（ZeppBridge-Cloud 的 Worker，加密上传）。SparkyFitness
//! 不在这里——它改成了由对方来拉本机的只读 REST（`/v1/records`），见 `local_api`。
//!
//! 硬规则（每条都有测试守着）：
//! 1. **闸门**：没有已启用的目标，就一个请求都不发、一个库文件都不读。
//! 2. **只发往用户自己填的地址**。PA 只允许 https（照搬组件的 site 规则）；重定向不跟随。
//! 3. **联网时不拿写锁**。取数走只读连接；清单存在 `data/push/<目标>.manifest.json`，
//!    不加数据库迁移。
//! 4. **日志只记条数、字节数和结论**；错误信息里的 `zb[rw]_…` 一律脱敏。
//! 5. **密钥进系统凭据库**（账号名 `push:<目标>`），配置文件里出现像密钥的字段就拒绝。
//! 6. **坐标**：发出前硬检查，发现坐标字段就整次中止。
//!
//! 配置文件 `data/push/targets.json`（不含密钥）：
//!
//! ```json
//! { "version": 1, "targets": [
//!   { "id": "pa", "kind": "pa", "enabled": true, "site": "example.com",
//!     "retention_days": 90, "summary_days": 30, "full_resolution_workouts": false } ] }
//! ```

pub mod client;
pub mod pa;
pub mod setup;

use crate::auth::{default_credential_backend_in, CredentialBackend};
use crate::storage::Database;
use chrono::{Local, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, SystemTime};

pub const PUSH_DIR: &str = "push";
pub const TARGETS_FILE: &str = "targets.json";

/// 同一个目标同一时刻只跑一份（桌面同步后的后台推送和 CLI 可能撞上）。
/// 锁超过这么久视为上次异常退出留下的。
const STALE_LOCK: Duration = Duration::from_secs(40 * 60);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TargetKind {
    Pa,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TargetConfig {
    pub id: String,
    pub kind: TargetKind,
    #[serde(default)]
    pub enabled: bool,
    pub site: String,
    #[serde(default = "default_retention")]
    pub retention_days: u32,
    #[serde(default = "default_summary")]
    pub summary_days: u32,
    #[serde(default)]
    pub full_resolution_workouts: bool,
    /// 只给测试和本地自测：放行 `http://127.0.0.1:<端口>`。
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub dev_loopback: bool,
}

fn default_retention() -> u32 {
    90
}

fn default_summary() -> u32 {
    30
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
struct TargetsFile {
    #[serde(default)]
    targets: Vec<TargetConfig>,
}

/// 配置错误。`code` 是稳定码（`err.push.*`）。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PushError {
    pub code: &'static str,
    pub detail: String,
}

fn push_error(code: &'static str, detail: impl Into<String>) -> PushError {
    PushError {
        code,
        detail: detail.into(),
    }
}

pub fn push_dir(data_dir: &Path) -> PathBuf {
    data_dir.join(PUSH_DIR)
}

/// 找出配置里像密钥的字段（照搬组件 config.mjs 的 `findSecretField`）。
pub fn find_secret_field(value: &Value, path: &str) -> Option<String> {
    fn secret_name(name: &str) -> bool {
        let lower = name.to_ascii_lowercase();
        matches!(lower.as_str(), "dk" | "key")
            || [
                "writekey",
                "write_key",
                "readkey",
                "read_key",
                "token",
                "secret",
                "password",
                "passwd",
                "credential",
                "apikey",
                "api_key",
                "private",
            ]
            .iter()
            .any(|needle| lower.contains(needle))
    }
    fn secret_value(text: &str) -> bool {
        let looks_like_key = ["zbr_", "zbw_"].iter().any(|prefix| {
            text.match_indices(prefix).any(|(at, _)| {
                let tail = &text[at + 4..];
                tail.len() > 10
                    && tail.as_bytes()[10] == b'_'
                    && tail[..10]
                        .bytes()
                        .all(|byte| byte.is_ascii_lowercase() || (b'2'..=b'7').contains(&byte))
            })
        });
        let looks_like_jwt = text.starts_with("eyJ")
            && text.len() > 13
            && text[3..13]
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-')
            && text[13..].contains('.');
        looks_like_key || looks_like_jwt
    }
    match value {
        Value::Array(items) => items
            .iter()
            .enumerate()
            .find_map(|(index, item)| find_secret_field(item, &format!("{path}[{index}]"))),
        Value::Object(map) => map.iter().find_map(|(name, child)| {
            let here = if path.is_empty() {
                name.clone()
            } else {
                format!("{path}.{name}")
            };
            if secret_name(name) {
                Some(here)
            } else {
                find_secret_field(child, &here)
            }
        }),
        Value::String(text) if secret_value(text) => Some(if path.is_empty() {
            "(root)".into()
        } else {
            path.to_string()
        }),
        _ => None,
    }
}

/// 读目标配置。没有文件 = 没有目标（不是错误）。
pub fn load_targets(data_dir: &Path) -> Result<Vec<TargetConfig>, PushError> {
    let path = push_dir(data_dir).join(TARGETS_FILE);
    let text = match std::fs::read_to_string(&path) {
        Ok(text) => text,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(push_error("err.push.config_unreadable", error.to_string())),
    };
    let raw: Value = serde_json::from_str(text.trim_start_matches('\u{feff}'))
        .map_err(|error| push_error("err.push.config_invalid", error.to_string()))?;
    if let Some(field) = find_secret_field(&raw, "") {
        return Err(push_error("err.push.config_has_secret", field));
    }
    let file: TargetsFile = serde_json::from_value(raw)
        .map_err(|error| push_error("err.push.config_invalid", error.to_string()))?;
    let mut seen = std::collections::BTreeSet::new();
    for target in &file.targets {
        let id_ok = !target.id.is_empty()
            && target.id.len() <= 32
            && target
                .id
                .bytes()
                .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-');
        if !id_ok || !seen.insert(target.id.clone()) {
            return Err(push_error("err.push.config_invalid", "target id"));
        }
        if !(1..=365).contains(&target.retention_days) || !(1..=365).contains(&target.summary_days)
        {
            return Err(push_error("err.push.config_invalid", "days must be 1-365"));
        }
    }
    Ok(file.targets)
}

/// 凭据库里这个目标的账号名。
pub fn secret_account(target_id: &str) -> String {
    format!("push:{target_id}")
}

/// 存 PA 目标的密钥（JSON：tenant、dk、writeKey）。环境变量后端不能按名字分条，拒绝。
pub fn store_pa_secrets(
    credentials: &dyn CredentialBackend,
    target_id: &str,
    secrets: &pa::PaSecrets,
) -> Result<(), PushError> {
    secrets
        .validate()
        .map_err(|code| push_error(code, "secrets"))?;
    if !credentials.supports_named_entries() {
        return Err(push_error("err.push.credential_store_unnamed", ""));
    }
    let text = serde_json::to_string(secrets)
        .map_err(|error| push_error("err.push.config_invalid", error.to_string()))?;
    credentials
        .set(&secret_account(target_id), &text)
        .map_err(|error| push_error("err.push.credential_store_failed", client::redact(&error)))
}

fn read_pa_secrets(
    credentials: &dyn CredentialBackend,
    target_id: &str,
) -> Result<pa::PaKeys, PushError> {
    if !credentials.supports_named_entries() {
        return Err(push_error("err.push.credential_store_unnamed", ""));
    }
    let text = credentials
        .get(&secret_account(target_id))
        .map_err(|error| push_error("err.push.credential_store_failed", client::redact(&error)))?
        .ok_or_else(|| push_error("err.push.secrets_missing", ""))?;
    let secrets: pa::PaSecrets = serde_json::from_str(&text)
        .map_err(|_| push_error("err.push.secrets_missing", "unreadable"))?;
    secrets.validate().map_err(|code| push_error(code, ""))
}

/// 一个目标这一轮的结论。只有条数、字节数和错误码。
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct TargetOutcome {
    pub id: String,
    /// `ok` / `unchanged` / `skipped_locked` / `failed`。
    pub result: &'static str,
    pub stats: pa::UploadStats,
    pub error_code: Option<String>,
    /// 已脱敏的一句原因（不含数据、地址里的凭据和密钥）。
    pub error: Option<String>,
    pub at: String,
}

/// 一轮推送的结论。
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
pub struct PushReport {
    /// 没有已启用的目标：什么都没读、什么都没发。
    pub gated: bool,
    pub targets: Vec<TargetOutcome>,
}

struct TargetLock(PathBuf);

impl TargetLock {
    fn acquire(dir: &Path, id: &str) -> Option<Self> {
        let path = dir.join(format!("{id}.lock"));
        if let Ok(meta) = std::fs::metadata(&path) {
            let stale = meta
                .modified()
                .ok()
                .and_then(|at| SystemTime::now().duration_since(at).ok())
                .is_some_and(|age| age > STALE_LOCK);
            if stale {
                let _ = std::fs::remove_file(&path);
            }
        }
        std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&path)
            .ok()
            .map(|_| Self(path))
    }
}

impl Drop for TargetLock {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.0);
    }
}

fn manifest_path(dir: &Path, id: &str) -> PathBuf {
    dir.join(format!("{id}.manifest.json"))
}

fn write_json(path: &Path, value: &impl Serialize) {
    if let Ok(text) = serde_json::to_vec_pretty(value) {
        let _ = crate::paths::write_file_atomically(path, &text);
    }
}

fn system_time_zone() -> String {
    jiff::tz::TimeZone::system()
        .iana_name()
        .map(str::to_string)
        .unwrap_or_else(|| Local::now().format("%:z").to_string())
}

/// 跑一轮：每个已启用的目标各推一次。同步成功之后调用；也可以单独跑。
pub async fn run(data_dir: &Path, credentials: Arc<dyn CredentialBackend>) -> PushReport {
    let targets = match load_targets(data_dir) {
        Ok(targets) => targets,
        Err(error) => {
            eprintln!("push: configuration unusable ({})", error.code);
            return PushReport {
                gated: true,
                targets: Vec::new(),
            };
        }
    };
    let enabled: Vec<TargetConfig> = targets
        .into_iter()
        .filter(|target| target.enabled)
        .collect();
    // 闸门：没有目标就到此为止——不打开数据库，不建任何连接。
    if enabled.is_empty() {
        return PushReport {
            gated: true,
            targets: Vec::new(),
        };
    }
    let mut report = PushReport::default();
    for target in enabled {
        let outcome = run_target(data_dir, credentials.as_ref(), &target).await;
        match &outcome.error_code {
            None => eprintln!(
                "push: {} {} objects={} deleted={} unchanged={} json={} sent={}",
                outcome.id,
                outcome.result,
                outcome.stats.objects,
                outcome.stats.deleted,
                outcome.stats.unchanged,
                outcome.stats.bytes_plain,
                outcome.stats.bytes_sent
            ),
            Some(code) => eprintln!("push: {} {} ({code})", outcome.id, outcome.result),
        }
        write_json(
            &push_dir(data_dir).join(format!("{}.status.json", outcome.id)),
            &outcome,
        );
        report.targets.push(outcome);
    }
    report
}

/// 同步之后在后台推一轮，不挡调用方。推送失败不影响同步的结论，下一轮再试。
pub fn spawn_after_sync(data_dir: PathBuf) {
    // 闸门先在这里判一次：没有目标连任务都不起。
    if !load_targets(&data_dir).is_ok_and(|targets| targets.iter().any(|target| target.enabled)) {
        return;
    }
    let credentials = default_credential_backend_in(&data_dir);
    tokio::spawn(async move {
        let _ = run(&data_dir, credentials).await;
    });
}

async fn run_target(
    data_dir: &Path,
    credentials: &dyn CredentialBackend,
    target: &TargetConfig,
) -> TargetOutcome {
    let at = Utc::now().to_rfc3339();
    let failed = |code: &str, detail: String| TargetOutcome {
        id: target.id.clone(),
        result: "failed",
        stats: pa::UploadStats::default(),
        error_code: Some(code.to_string()),
        error: (!detail.is_empty()).then(|| client::redact(&detail)),
        at: at.clone(),
    };
    let site = match client::normalize_pa_site(&target.site, target.dev_loopback) {
        Ok(site) => site,
        Err(code) => return failed("err.push.site_invalid", code.to_string()),
    };
    let keys = match read_pa_secrets(credentials, &target.id) {
        Ok(keys) => keys,
        Err(error) => return failed(error.code, error.detail),
    };
    let dir = push_dir(data_dir);
    if let Err(error) = std::fs::create_dir_all(&dir) {
        return failed("err.push.state_unwritable", error.to_string());
    }
    let Some(_lock) = TargetLock::acquire(&dir, &target.id) else {
        return TargetOutcome {
            id: target.id.clone(),
            result: "skipped_locked",
            stats: pa::UploadStats::default(),
            error_code: None,
            error: None,
            at,
        };
    };
    let manifest_file = manifest_path(&dir, &target.id);
    let previous: pa::Manifest = std::fs::read(&manifest_file)
        .ok()
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        .unwrap_or_default();

    // 取数：只读连接，不拿写锁。读完就关，联网期间不占库。
    let plan = {
        let db_path = data_dir.join("zepp.db");
        if !db_path.exists() {
            return failed("err.push.no_local_data", String::new());
        }
        let db = match Database::open_read_only(db_path) {
            Ok(db) => db,
            Err(error) => {
                return failed("err.push.local_data_unavailable", error.code().to_string())
            }
        };
        let status = pa::LocalStatus::read(&db);
        let options = pa::PaOptions {
            retention_days: target.retention_days,
            summary_days: target.summary_days,
            full_resolution_workouts: target.full_resolution_workouts,
        };
        match pa::build_plan(
            &db,
            &options,
            &previous,
            Local::now().date_naive(),
            &status,
            Utc::now(),
            &system_time_zone(),
        ) {
            Ok(plan) => plan,
            Err(error) => {
                return failed("err.push.local_data_unavailable", error.code().to_string())
            }
        }
    };
    if let Err(message) = pa::check_no_coordinates(&plan) {
        return failed("err.push.coordinates_found", message);
    }
    if plan.is_empty() {
        write_json(&manifest_file, &plan.manifest);
        return TargetOutcome {
            id: target.id.clone(),
            result: "unchanged",
            stats: pa::UploadStats {
                unchanged: plan.unchanged,
                ..Default::default()
            },
            error_code: None,
            error: None,
            at,
        };
    }
    match pa::upload(&site, &keys, &plan).await {
        Ok(stats) => {
            write_json(&manifest_file, &plan.manifest);
            TargetOutcome {
                id: target.id.clone(),
                result: "ok",
                stats,
                error_code: None,
                error: None,
                at,
            }
        }
        // 清单不写回：这一轮没传完的下一轮重来。
        Err(message) => failed("err.push.upload_failed", message),
    }
}

#[cfg(test)]
mod tests;
