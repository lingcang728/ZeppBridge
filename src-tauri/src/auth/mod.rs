pub mod har;

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

pub use har::extract_from_har;

/// The single service name used for the app token in the platform credential
/// store.  The user id is used as the credential account name so that an
/// account switch cannot accidentally read another account's token.
pub const CREDENTIAL_SERVICE: &str = "com.zeppbridge.app";
const AUTH_FILE_VERSION: u32 = 1;

/// A small abstraction around the platform credential store.  Keeping this
/// boundary explicit makes tests deterministic without ever putting a token
/// in `auth.json`.
pub trait CredentialBackend: Send + Sync {
    fn set(&self, user_id: &str, token: &str) -> std::result::Result<(), String>;
    fn get(&self, user_id: &str) -> std::result::Result<Option<String>, String>;
    fn delete(&self, user_id: &str) -> std::result::Result<(), String>;
}

#[cfg(windows)]
#[derive(Debug, Default)]
pub struct WindowsCredentialBackend;

#[cfg(windows)]
impl CredentialBackend for WindowsCredentialBackend {
    fn set(&self, user_id: &str, token: &str) -> std::result::Result<(), String> {
        let entry = keyring::Entry::new(CREDENTIAL_SERVICE, user_id)
            .map_err(|_| "无法打开 Windows 凭据管理器条目".to_string())?;
        entry
            .set_password(token)
            .map_err(|_| "无法写入 Windows 凭据管理器".to_string())
    }

    fn get(&self, user_id: &str) -> std::result::Result<Option<String>, String> {
        let entry = keyring::Entry::new(CREDENTIAL_SERVICE, user_id)
            .map_err(|_| "无法打开 Windows 凭据管理器条目".to_string())?;
        match entry.get_password() {
            Ok(value) => Ok(Some(value)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(_) => Err("无法读取 Windows 凭据管理器".to_string()),
        }
    }

    fn delete(&self, user_id: &str) -> std::result::Result<(), String> {
        let entry = keyring::Entry::new(CREDENTIAL_SERVICE, user_id)
            .map_err(|_| "无法打开 Windows 凭据管理器条目".to_string())?;
        match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(_) => Err("无法删除 Windows 凭据管理器条目".to_string()),
        }
    }
}

#[cfg(target_os = "macos")]
#[derive(Debug, Default)]
pub struct MacOsCredentialBackend;

#[cfg(target_os = "macos")]
impl CredentialBackend for MacOsCredentialBackend {
    fn set(&self, user_id: &str, token: &str) -> std::result::Result<(), String> {
        let entry = keyring::Entry::new(CREDENTIAL_SERVICE, user_id)
            .map_err(|_| "无法打开 macOS 钥匙串条目".to_string())?;
        entry
            .set_password(token)
            .map_err(|_| "无法写入 macOS 钥匙串".to_string())
    }

    fn get(&self, user_id: &str) -> std::result::Result<Option<String>, String> {
        let entry = keyring::Entry::new(CREDENTIAL_SERVICE, user_id)
            .map_err(|_| "无法打开 macOS 钥匙串条目".to_string())?;
        match entry.get_password() {
            Ok(value) => Ok(Some(value)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(_) => Err("无法读取 macOS 钥匙串".to_string()),
        }
    }

    fn delete(&self, user_id: &str) -> std::result::Result<(), String> {
        let entry = keyring::Entry::new(CREDENTIAL_SERVICE, user_id)
            .map_err(|_| "无法打开 macOS 钥匙串条目".to_string())?;
        match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(_) => Err("无法删除 macOS 钥匙串条目".to_string()),
        }
    }
}

#[cfg(all(not(windows), not(target_os = "macos")))]
#[derive(Debug, Default)]
struct UnavailableCredentialBackend;

#[cfg(all(not(windows), not(target_os = "macos")))]
impl CredentialBackend for UnavailableCredentialBackend {
    fn set(&self, _user_id: &str, _token: &str) -> std::result::Result<(), String> {
        Err("凭据管理器仅在 Windows/macOS 上可用；测试请注入 CredentialBackend".to_string())
    }

    fn get(&self, _user_id: &str) -> std::result::Result<Option<String>, String> {
        Err("凭据管理器仅在 Windows/macOS 上可用；测试请注入 CredentialBackend".to_string())
    }

    fn delete(&self, _user_id: &str) -> std::result::Result<(), String> {
        Err("凭据管理器仅在 Windows/macOS 上可用；测试请注入 CredentialBackend".to_string())
    }
}

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
        Self::with_credential_backend(data_dir, default_credential_backend())
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
                    return Err(ZeppBridgeError::AuthError(
                        "认证元数据存在，但凭据管理器中没有令牌，请重新配对".to_string(),
                    ));
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

    /// Look up a previously stored token by user id.  The token is never
    /// logged and the caller must not send it to the frontend.
    #[allow(dead_code)]
    pub fn token_for_user(&self, user_id: &str) -> Result<Option<String>> {
        let user_id = validate_user_id(user_id)?;
        match self.credentials.get(&user_id).map_err(credential_error)? {
            Some(value) => Ok(Some(validate_token(&value)?)),
            None => Ok(None),
        }
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
        let user_id = if self.auth_file.exists() {
            self.read_stored()
                .ok()
                .map(|(stored, _)| stored.user_id)
                .filter(|value| !value.trim().is_empty())
                .or_else(|| self.read_user_id_hint())
        } else {
            None
        };

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

fn default_credential_backend() -> Arc<dyn CredentialBackend> {
    #[cfg(windows)]
    {
        Arc::new(WindowsCredentialBackend)
    }
    #[cfg(target_os = "macos")]
    {
        Arc::new(MacOsCredentialBackend)
    }
    #[cfg(all(not(windows), not(target_os = "macos")))]
    {
        Arc::new(UnavailableCredentialBackend)
    }
}

fn credential_error(error: String) -> ZeppBridgeError {
    // Backends are not allowed to include secret values in their error text.
    ZeppBridgeError::AuthError(error)
}

fn validate_token(raw: &str) -> Result<String> {
    let value = raw.trim();
    if value.is_empty() || value.len() > 16 * 1024 || value.chars().any(char::is_control) {
        return Err(ZeppBridgeError::AuthError("令牌为空或格式无效".to_string()));
    }
    Ok(value.to_string())
}

fn validate_user_id(raw: &str) -> Result<String> {
    let value = raw.trim();
    if value.is_empty()
        || value.len() > 256
        || value.chars().any(char::is_control)
        || value.contains('/')
    {
        return Err(ZeppBridgeError::AuthError(
            "用户 ID 为空或格式无效".to_string(),
        ));
    }
    Ok(value.to_string())
}

/// Normalize and validate the region host.  Auth metadata only stores an
/// HTTPS origin (no path, query, fragment, or userinfo).
pub fn normalize_region_host(raw: &str) -> Result<String> {
    let value = raw.trim();
    let parsed = reqwest::Url::parse(value)
        .map_err(|_| ZeppBridgeError::AuthError("区域主机地址无效".to_string()))?;
    if parsed.scheme() != "https"
        || parsed.host_str().is_none()
        || parsed.username() != ""
        || parsed.password().is_some()
        || parsed.query().is_some()
        || parsed.fragment().is_some()
        || (!parsed.path().is_empty() && parsed.path() != "/")
    {
        return Err(ZeppBridgeError::AuthError(
            "区域主机必须是 https://host 地址".to_string(),
        ));
    }

    let host = parsed
        .host_str()
        .ok_or_else(|| ZeppBridgeError::AuthError("区域主机地址无效".to_string()))?
        .to_ascii_lowercase();
    let host = if host.contains(':') {
        format!("[{host}]")
    } else {
        host
    };
    let port = parsed
        .port()
        .filter(|port| *port != 443)
        .map(|port| format!(":{port}"))
        .unwrap_or_default();
    Ok(format!("https://{host}{port}"))
}

pub fn mask_token(token: &str) -> String {
    let chars: Vec<char> = token.chars().collect();
    if chars.len() <= 4 {
        return "••••".to_string();
    }
    let prefix: String = chars.iter().take(2).collect();
    let suffix: String = chars
        .iter()
        .rev()
        .take(2)
        .copied()
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect();
    format!("{prefix}…{suffix}")
}

#[cfg(windows)]
fn replace_file(temp: &Path, destination: &Path) -> io::Result<()> {
    // `rename` is atomic when the destination does not exist.  Windows does
    // not replace an existing file with `rename`, so remove-and-rename is the
    // conservative fallback; the temporary file is always in the same
    // directory and never contains a token.
    if destination.exists() {
        fs::remove_file(destination)?;
    }
    fs::rename(temp, destination)
}

#[cfg(not(windows))]
fn replace_file(temp: &Path, destination: &Path) -> io::Result<()> {
    fs::rename(temp, destination)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{collections::HashMap, sync::Mutex};

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
        let path = std::env::temp_dir().join(format!(
            "zeppbridge-auth-test-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&path).unwrap();
        path
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
        assert_eq!(
            manager.token_for_user("user-1").unwrap().as_deref(),
            Some("secret-token")
        );
        assert_eq!(manager.token_for_user("other-user").unwrap(), None);

        manager.clear_auth().unwrap();
        assert!(!dir.join("auth.json").exists());
        assert_eq!(backend.get("user-1").unwrap(), None);
        let _ = fs::remove_dir_all(dir);
    }
}
