use crate::models::error::HeadlessProblem;

use crate::models::{error::Result, AuthInfo, ZeppBridgeError};

use chrono::Utc;

use serde::{Deserialize, Serialize};

use serde_json::Value;

use std::{
    fs::{self, OpenOptions},
    io::{self, Write},
    path::{Path, PathBuf},
    sync::Arc,
    time::{SystemTime, UNIX_EPOCH},
};

mod backends;
mod select;

pub use backends::*;
pub use select::*;

/// The single service name used for the app token in the platform credential
/// store.  The user id is used as the credential account name so that an
/// account switch cannot accidentally read another account's token.
///
/// Windows, macOS and Linux all consume this now — Credential Manager, Keychain
/// and Secret Service respectively — so the `allow(dead_code)` that used to sit
/// here for the platforms without a real backend is gone, as its own comment
/// said it should be once one appeared.
pub const CREDENTIAL_SERVICE: &str = "com.zeppbridge.app";

/// 令牌最多能有多少个 UTF-16 码元。
///
/// Windows 凭据管理器的 `CRED_MAX_CREDENTIAL_BLOB_SIZE` 是 2560 字节，凭据
/// 以 UTF-16 存放，于是上限就是 1280 个码元。以前这里放行到 16 KB，比真正
/// 存得下的多出六倍：超出的令牌一路走到 `CredWrite` 才失败，用户只看到一句
/// 「无法写入 Windows 凭据管理器」，没有任何线索指向长度。
///
/// 真实的 Zepp App Token 只有几十个字符。会撞上这个上限的，基本都是从页面
/// 存储里捞到的一整段 JSON——那本来就不是令牌，早点认出来比写失败好。
pub const CREDENTIAL_MAX_UTF16_UNITS: usize = 1280;

const AUTH_FILE_VERSION: u32 = 1;

#[derive(Debug, Clone, Serialize, Deserialize)]
struct StoredAuth {
    #[serde(default = "default_version")]
    version: u32,
    user_id: String,
    region_host: String,
    #[serde(default)]
    updated_at: String,
}

fn default_version() -> u32 {
    AUTH_FILE_VERSION
}

/// Public, non-sensitive view of the saved authentication state.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AuthStatus {
    pub configured: bool,
    pub user_id: Option<String>,
    pub region_host: Option<String>,
    pub token_masked: Option<String>,
    pub version: Option<u32>,
    pub updated_at: Option<String>,
}

/// Authentication metadata and credential-store access.
pub struct AuthManager {
    auth_file: PathBuf,
    /// Best-effort copy of the user id kept beside `auth.json` so
    /// `clear_auth` can still remove the credential-store entry when the
    /// metadata file itself is unreadable/corrupt.
    user_id_file: PathBuf,
    credentials: Arc<dyn CredentialBackend>,
}

impl std::fmt::Debug for AuthManager {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("AuthManager")
            .field("auth_file", &self.auth_file)
            .finish_non_exhaustive()
    }
}

impl AuthManager {
    pub fn new(data_dir: PathBuf) -> Self {
        let credentials = default_credential_backend_in(&data_dir);
        Self::with_credential_backend(data_dir, credentials)
    }

    /// Construct an auth manager with an injected backend.  Production code
    /// uses the Windows Credential Manager backend; tests can supply an in
    /// memory backend and avoid changing the user's credentials.
    pub fn with_credential_backend(
        data_dir: PathBuf,
        credentials: Arc<dyn CredentialBackend>,
    ) -> Self {
        Self {
            auth_file: data_dir.join("auth.json"),
            user_id_file: data_dir.join("auth.user-id"),
            credentials,
        }
    }

    /// Saves metadata atomically and stores the token only in the credential
    /// manager.  Inputs are trimmed and validated before either store is
    /// changed.
    pub fn save_auth(&self, auth: &AuthInfo) -> Result<()> {
        let user_id = validate_user_id(&auth.user_id)?;
        let token = validate_token(&auth.app_token)?;
        let region_host = normalize_region_host(&auth.region_host)?;
        let previous_user_id = self.read_stored().ok().map(|(stored, _)| stored.user_id);
        let previous = self.credentials.get(&user_id).map_err(credential_error)?;

        self.credentials
            .set(&user_id, &token)
            .map_err(credential_error)?;

        let stored = StoredAuth {
            version: AUTH_FILE_VERSION,
            user_id: user_id.clone(),
            region_host,
            updated_at: Utc::now().to_rfc3339(),
        };

        if let Err(error) = self.write_stored(&stored) {
            // Best-effort rollback keeps metadata and the platform store
            // consistent if the atomic file replacement fails.
            // Do not delete the previous account's credential: the new id
            // never became current.
            match previous {
                Some(old) => {
                    let _ = self.credentials.set(&user_id, &old);
                }
                None => {
                    let _ = self.credentials.delete(&user_id);
                }
            }
            return Err(error);
        }

        // A→B 换账号后 A 的 keyring 条目不能留着：下一轮 clear 只认当前 id。
        if let Some(raw) = previous_user_id {
            if let Ok(old_id) = validate_user_id(&raw) {
                if old_id != user_id {
                    let _ = self.credentials.delete(&old_id);
                }
            }
        }

        // The user-id hint is best-effort: a failure here must not roll back
        // an otherwise successful save, it only degrades the clear_auth
        // fallback path.
        let _ = self.write_user_id_hint(&user_id);

        Ok(())
    }

    /// Loads metadata and the token from the credential manager.  A metadata
    /// file without a credential is reported as an actionable auth error, not
    /// as a partially populated `AuthInfo`.
    pub fn load_auth(&self) -> Result<Option<AuthInfo>> {
        if !self.auth_file.exists() {
            return Ok(None);
        }

        let (stored, legacy_token) = self.read_stored()?;
        let user_id = validate_user_id(&stored.user_id)?;
        let region_host = normalize_region_host(&stored.region_host)?;
        let token = match self.credentials.get(&user_id).map_err(credential_error)? {
            Some(value) => validate_token(&value)?,
            None => {
                if let Some(ref value) = legacy_token {
                    let value = validate_token(value)?;
                    self.credentials
                        .set(&user_id, &value)
                        .map_err(credential_error)?;
                    value
                } else {
                    // 这句话最常见的出处不是「凭据坏了」，而是**有人把另一台
                    // 机器的 data 文件夹整个拷了过来**（issue #40）：库和
                    // auth.json 都在，令牌却从来不在文件里——它在那台机器的
                    // 凭据管理器 / 钥匙串 / Secret Service 里。所以不能只说
                    // 「请重新配对」，得说清楚往哪配。
                    //
                    // 用 `HeadlessProblem` 而不是 `AuthError`，是为了让它有自己
                    // 的错误码：命令行没有 i18n 层，只有按码才出得了英文，而
                    // 撞上这一条的人多半正在一台无头 Linux 上。
                    return Err(ZeppBridgeError::Headless(HeadlessProblem::TokenNotInStore));
                }
            }
        };

        // Older files lacked version/timestamp and could contain app_token.
        // Rewrite them after the credential has been safely copied to the
        // platform store, removing the legacy secret from disk.
        if stored.version != AUTH_FILE_VERSION
            || stored.updated_at.is_empty()
            || legacy_token.is_some()
            || stored.region_host != region_host
        {
            self.write_stored(&StoredAuth {
                version: AUTH_FILE_VERSION,
                user_id: user_id.clone(),
                region_host: region_host.clone(),
                updated_at: if stored.updated_at.is_empty() {
                    Utc::now().to_rfc3339()
                } else {
                    stored.updated_at
                },
            })?;
        }

        Ok(Some(AuthInfo {
            app_token: token,
            user_id,
            region_host,
        }))
    }

    /// Returns status without exposing the token.  The optional masked value
    /// is deliberately short and suitable for a settings screen.
    pub fn status(&self) -> Result<AuthStatus> {
        if !self.auth_file.exists() {
            return Ok(AuthStatus {
                configured: false,
                user_id: None,
                region_host: None,
                token_masked: None,
                version: None,
                updated_at: None,
            });
        }

        let (stored, legacy_token) = self.read_stored()?;
        let user_id = validate_user_id(&stored.user_id)?;
        let region_host = normalize_region_host(&stored.region_host)?;
        let token = self
            .credentials
            .get(&user_id)
            .map_err(credential_error)?
            .or(legacy_token);

        Ok(AuthStatus {
            configured: token.is_some(),
            user_id: Some(user_id),
            region_host: Some(region_host),
            token_masked: token.as_deref().map(mask_token),
            version: Some(stored.version),
            updated_at: (!stored.updated_at.is_empty()).then_some(stored.updated_at),
        })
    }

    #[cfg(test)]
    pub fn masked_token(&self) -> Result<Option<String>> {
        Ok(self.status()?.token_masked)
    }

    /// Removes both metadata and the corresponding credential-store entry.
    /// A corrupt `auth.json` no longer leaves the credential behind: the
    /// best-effort user-id hint file is consulted as a fallback.
    pub fn clear_auth(&self) -> Result<()> {
        let user_id = self
            .read_stored()
            .ok()
            .map(|(stored, _)| stored.user_id)
            .filter(|value| !value.trim().is_empty())
            .or_else(|| self.read_user_id_hint());

        if let Some(user_id) = user_id {
            let user_id = validate_user_id(&user_id)?;
            self.credentials
                .delete(&user_id)
                .map_err(credential_error)?;
        }
        if self.auth_file.exists() {
            fs::remove_file(&self.auth_file)?;
        }
        if self.user_id_file.exists() {
            let _ = fs::remove_file(&self.user_id_file);
        }
        Ok(())
    }

    fn write_user_id_hint(&self, user_id: &str) -> Result<()> {
        let parent = self
            .user_id_file
            .parent()
            .ok_or_else(|| ZeppBridgeError::ConfigError("认证目录无效".into()))?;
        fs::create_dir_all(parent)?;
        let temp_path = parent.join(format!(
            ".auth.user-id.tmp-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos()
        ));
        let result = (|| -> io::Result<()> {
            let mut file = OpenOptions::new()
                .write(true)
                .create(true)
                .truncate(true)
                .open(&temp_path)?;
            file.write_all(user_id.as_bytes())?;
            file.sync_all()?;
            drop(file);
            replace_file(&temp_path, &self.user_id_file)
        })();
        if result.is_err() {
            let _ = fs::remove_file(&temp_path);
        }
        result.map_err(ZeppBridgeError::IoError)
    }

    fn read_user_id_hint(&self) -> Option<String> {
        let content = fs::read_to_string(&self.user_id_file).ok()?;
        let trimmed = content.trim().to_string();
        (!trimmed.is_empty()).then_some(trimmed)
    }

    fn read_stored(&self) -> Result<(StoredAuth, Option<String>)> {
        let content = fs::read_to_string(&self.auth_file)?;
        let value: Value = serde_json::from_str(&content)
            .map_err(|e| ZeppBridgeError::ParseError(format!("认证元数据格式无效: {e}")))?;
        let legacy_token = value
            .get("app_token")
            .and_then(Value::as_str)
            .map(ToOwned::to_owned);
        let stored: StoredAuth = serde_json::from_value(value)
            .map_err(|e| ZeppBridgeError::ParseError(format!("认证元数据字段无效: {e}")))?;
        Ok((stored, legacy_token))
    }

    fn write_stored(&self, stored: &StoredAuth) -> Result<()> {
        let parent = self
            .auth_file
            .parent()
            .ok_or_else(|| ZeppBridgeError::ConfigError("认证目录无效".to_string()))?;
        fs::create_dir_all(parent)?;

        let json = serde_json::to_vec_pretty(stored)
            .map_err(|e| ZeppBridgeError::ParseError(e.to_string()))?;
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        let temp_path = parent.join(format!(
            ".{}.tmp-{}-{}",
            self.auth_file
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("auth.json"),
            std::process::id(),
            suffix
        ));

        let result = (|| -> io::Result<()> {
            let mut options = OpenOptions::new();
            options.write(true).create_new(true);
            #[cfg(unix)]
            {
                use std::os::unix::fs::OpenOptionsExt;
                options.mode(0o600);
            }
            let mut file = options.open(&temp_path)?;
            file.write_all(&json)?;
            file.sync_all()?;
            drop(file);
            replace_file(&temp_path, &self.auth_file)
        })();

        if result.is_err() {
            let _ = fs::remove_file(&temp_path);
        }
        result.map_err(ZeppBridgeError::IoError)
    }
}

#[cfg(test)]
mod credential_error_tests {
    use super::*;

    #[test]
    fn secret_service_absence_stays_headless_not_generic_store() {
        let error = credential_error(format!("{HEADLESS_NO_STORE_MARKER}cannot talk to dbus"));
        assert!(matches!(
            error,
            ZeppBridgeError::Headless(HeadlessProblem::NoCredentialStore { .. })
        ));
        assert_eq!(error.code(), "err.headless.no_credential_store");
        let generic = credential_error("无法写入 Windows 凭据管理器".into());
        assert!(matches!(generic, ZeppBridgeError::CredentialStore(_)));
        assert_eq!(generic.code(), "err.core.credential_store");
    }
}

#[cfg(test)]
mod tests;
