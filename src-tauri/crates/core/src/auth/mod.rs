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

/// A small abstraction around the platform credential store.  Keeping this
/// boundary explicit makes tests deterministic without ever putting a token
/// in `auth.json`.
pub trait CredentialBackend: Send + Sync {
    fn set(&self, user_id: &str, token: &str) -> std::result::Result<(), String>;
    fn get(&self, user_id: &str) -> std::result::Result<Option<String>, String>;
    fn delete(&self, user_id: &str) -> std::result::Result<(), String>;
}

/// 把系统凭据存储的真实失败原因带出来。
///
/// 以前每一处都是 `map_err(|_| "无法写入 Windows 凭据管理器")`：底层错误被整个
/// 丢掉，包括 Win32 错误码，以及「某个字段超长」这种已经说得很清楚的原因。
/// 用户报上来一句「无法写入」，我们和他都无从下手。
#[cfg(any(windows, unix))]
fn describe_keyring_error(action: &str, error: &keyring::Error) -> String {
    match error {
        keyring::Error::TooLong(attribute, limit) => {
            format!("{action}：{attribute} 超出系统上限 {limit}")
        }
        keyring::Error::Invalid(attribute, reason) => format!("{action}：{attribute} {reason}"),
        keyring::Error::NoStorageAccess(inner) => {
            format!("{action}：系统拒绝访问凭据存储（{inner}）")
        }
        keyring::Error::PlatformFailure(inner) => format!("{action}：{inner}"),
        other => format!("{action}：{other}"),
    }
}

#[cfg(windows)]
#[derive(Debug, Default)]
pub struct WindowsCredentialBackend;

#[cfg(windows)]
impl CredentialBackend for WindowsCredentialBackend {
    fn set(&self, user_id: &str, token: &str) -> std::result::Result<(), String> {
        let entry = keyring::Entry::new(CREDENTIAL_SERVICE, user_id)
            .map_err(|error| describe_keyring_error("无法打开 Windows 凭据管理器条目", &error))?;
        entry
            .set_password(token)
            .map_err(|error| describe_keyring_error("无法写入 Windows 凭据管理器", &error))
    }

    fn get(&self, user_id: &str) -> std::result::Result<Option<String>, String> {
        let entry = keyring::Entry::new(CREDENTIAL_SERVICE, user_id)
            .map_err(|error| describe_keyring_error("无法打开 Windows 凭据管理器条目", &error))?;
        match entry.get_password() {
            Ok(value) => Ok(Some(value)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(error) => Err(describe_keyring_error(
                "无法读取 Windows 凭据管理器",
                &error,
            )),
        }
    }

    fn delete(&self, user_id: &str) -> std::result::Result<(), String> {
        let entry = keyring::Entry::new(CREDENTIAL_SERVICE, user_id)
            .map_err(|error| describe_keyring_error("无法打开 Windows 凭据管理器条目", &error))?;
        match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(error) => Err(describe_keyring_error(
                "无法删除 Windows 凭据管理器条目",
                &error,
            )),
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
            .map_err(|error| describe_keyring_error("无法打开 macOS 钥匙串条目", &error))?;
        entry
            .set_password(token)
            .map_err(|error| describe_keyring_error("无法写入 macOS 钥匙串", &error))
    }

    fn get(&self, user_id: &str) -> std::result::Result<Option<String>, String> {
        let entry = keyring::Entry::new(CREDENTIAL_SERVICE, user_id)
            .map_err(|error| describe_keyring_error("无法打开 macOS 钥匙串条目", &error))?;
        match entry.get_password() {
            Ok(value) => Ok(Some(value)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(error) => Err(describe_keyring_error("无法读取 macOS 钥匙串", &error)),
        }
    }

    fn delete(&self, user_id: &str) -> std::result::Result<(), String> {
        let entry = keyring::Entry::new(CREDENTIAL_SERVICE, user_id)
            .map_err(|error| describe_keyring_error("无法打开 macOS 钥匙串条目", &error))?;
        match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(error) => Err(describe_keyring_error("无法删除 macOS 钥匙串条目", &error)),
        }
    }
}

/// 选哪个凭据存储。取值：`secret-service`、`file`、`env`。
///
/// 只在 Linux 上有意义。Windows 和 macOS 各自只有一个正确答案，多给一个
/// 旋钮只会多一种配错的方式。
pub const CREDENTIAL_STORE_ENV: &str = "ZEPPBRIDGE_CREDENTIAL_STORE";

/// 由环境直接给出的令牌（只读存储）。
pub const APP_TOKEN_ENV: &str = "ZEPPBRIDGE_APP_TOKEN";

/// 文件存储的文件名，放在数据目录里。
#[cfg(all(unix, not(target_os = "macos")))]
pub const CREDENTIAL_FILE: &str = "credentials.json";

/// Secret Service（GNOME Keyring / KWallet）。Linux 桌面上的默认选择。
///
/// 走的是 D-Bus 上的 `org.freedesktop.secrets`。Flatpak 沙箱里需要
/// `--talk-name=org.freedesktop.secrets`，manifest 里已经给了。
#[cfg(all(unix, not(target_os = "macos")))]
#[derive(Debug, Default)]
pub struct SecretServiceCredentialBackend;

#[cfg(all(unix, not(target_os = "macos")))]
impl CredentialBackend for SecretServiceCredentialBackend {
    fn set(&self, user_id: &str, token: &str) -> std::result::Result<(), String> {
        let entry = keyring::Entry::new(CREDENTIAL_SERVICE, user_id)
            .map_err(|error| describe_secret_service_error("无法打开系统密钥环条目", &error))?;
        entry
            .set_password(token)
            .map_err(|error| describe_secret_service_error("无法写入系统密钥环", &error))
    }

    fn get(&self, user_id: &str) -> std::result::Result<Option<String>, String> {
        let entry = keyring::Entry::new(CREDENTIAL_SERVICE, user_id)
            .map_err(|error| describe_secret_service_error("无法打开系统密钥环条目", &error))?;
        match entry.get_password() {
            Ok(value) => Ok(Some(value)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(error) => Err(describe_secret_service_error("无法读取系统密钥环", &error)),
        }
    }

    fn delete(&self, user_id: &str) -> std::result::Result<(), String> {
        let entry = keyring::Entry::new(CREDENTIAL_SERVICE, user_id)
            .map_err(|error| describe_secret_service_error("无法打开系统密钥环条目", &error))?;
        match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(error) => Err(describe_secret_service_error(
                "无法删除系统密钥环条目",
                &error,
            )),
        }
    }
}

/// 在 keyring 的原文后面补一句「这台机器上大概是怎么回事」。
///
/// 没有 Secret Service 的报错原文是一句 D-Bus 层的话（连不上会话总线、
/// 没有实现该接口）。对着无头服务器或容器读到它的人，从那句话里推不出
/// 「这台机器本来就不该用密钥环」——所以这里直接把另外两个选项写出来。
#[cfg(all(unix, not(target_os = "macos")))]
fn describe_secret_service_error(action: &str, error: &keyring::Error) -> String {
    let base = describe_keyring_error(action, error);
    match error {
        keyring::Error::NoStorageAccess(_) | keyring::Error::PlatformFailure(_) => format!(
            "{base}。这台机器上可能没有运行 Secret Service（GNOME Keyring / KWallet）——\
             无头服务器和容器通常没有。改用 {CREDENTIAL_STORE_ENV}=file（令牌以 0600 \
             写在数据目录的 {CREDENTIAL_FILE} 里），或 {CREDENTIAL_STORE_ENV}=env \
             配合 {APP_TOKEN_ENV}"
        ),
        _ => base,
    }
}

/// 令牌由环境变量给出，只读。
///
/// 为容器和 systemd 单元准备的：那两处都有现成的、比文件更好的秘密投递方式
/// （`docker secret`、`LoadCredential=`），令牌不必在磁盘上再留一份。
///
/// 写操作不是「失败」而是「无处可写」——环境变量是调用方给进来的，进程改不了
/// 它。所以 `set` 只在值和已有的一致时当作无事发生（`load_auth` 的旧版迁移
/// 路径会这么调一次），不一致才报错。
#[cfg(all(unix, not(target_os = "macos")))]
#[derive(Debug, Default)]
pub struct EnvCredentialBackend;

#[cfg(all(unix, not(target_os = "macos")))]
impl EnvCredentialBackend {
    fn token() -> Option<String> {
        let value = std::env::var(APP_TOKEN_ENV).ok()?;
        let value = value.trim().to_string();
        if value.is_empty() {
            None
        } else {
            Some(value)
        }
    }
}

#[cfg(all(unix, not(target_os = "macos")))]
impl CredentialBackend for EnvCredentialBackend {
    fn set(&self, _user_id: &str, token: &str) -> std::result::Result<(), String> {
        match Self::token() {
            Some(existing) if existing == token.trim() => Ok(()),
            _ => Err(format!(
                "{CREDENTIAL_STORE_ENV}=env 是只读存储：令牌由 {APP_TOKEN_ENV} 提供，\
                 进程不能改写调用方的环境。要在本机保存令牌请改用 \
                 {CREDENTIAL_STORE_ENV}=file"
            )),
        }
    }

    fn get(&self, _user_id: &str) -> std::result::Result<Option<String>, String> {
        Ok(Self::token())
    }

    fn delete(&self, _user_id: &str) -> std::result::Result<(), String> {
        // 「已经不在了」和「删掉了」对调用方是同一件事。环境里本来就没有，
        // 报错只会让 clear_auth 白白失败一次。
        match Self::token() {
            None => Ok(()),
            Some(_) => Err(format!(
                "{CREDENTIAL_STORE_ENV}=env 是只读存储：请从部署配置里移除 {APP_TOKEN_ENV}"
            )),
        }
    }
}

/// 令牌写在数据目录里的一个 0600 文件里。
///
/// 这是**明摆着的降级**，不是和密钥环平级的选项：文件里的令牌只受文件权限
/// 保护，能读到这个文件的进程就能拿到它。之所以还是提供，是因为无头 Linux
/// 上真正的替代品不是「更安全的存储」而是「根本用不了」——而把令牌塞进
/// shell 历史或者 `docker inspect` 看得见的地方比这更糟。
///
/// 所以它必须被显式选中（`ZEPPBRIDGE_CREDENTIAL_STORE=file`），不会在密钥环
/// 不可用时被静默启用。
#[cfg(all(unix, not(target_os = "macos")))]
#[derive(Debug)]
pub struct FileCredentialBackend {
    path: PathBuf,
}

#[cfg(all(unix, not(target_os = "macos")))]
#[derive(Debug, Default, Serialize, Deserialize)]
struct StoredCredentials {
    #[serde(default = "default_credential_file_version")]
    version: u32,
    #[serde(default)]
    tokens: std::collections::BTreeMap<String, String>,
}

#[cfg(all(unix, not(target_os = "macos")))]
fn default_credential_file_version() -> u32 {
    1
}

#[cfg(all(unix, not(target_os = "macos")))]
impl FileCredentialBackend {
    pub fn new(data_dir: &Path) -> Self {
        Self {
            path: data_dir.join(CREDENTIAL_FILE),
        }
    }

    fn read(&self) -> std::result::Result<StoredCredentials, String> {
        match fs::read(&self.path) {
            Ok(bytes) => serde_json::from_slice(&bytes).map_err(|error| {
                // 不回落到「当作空的」：那会让一次解析失败看起来像是
                // 「你还没登录」，用户照提示重新配对，旧文件被覆盖。
                format!("{} 解析失败：{error}", self.path.display())
            }),
            Err(error) if error.kind() == io::ErrorKind::NotFound => {
                Ok(StoredCredentials::default())
            }
            Err(error) => Err(format!("无法读取 {}：{error}", self.path.display())),
        }
    }

    fn write(&self, stored: &StoredCredentials) -> std::result::Result<(), String> {
        let json = serde_json::to_vec_pretty(stored)
            .map_err(|error| format!("无法序列化凭据文件：{error}"))?;
        let parent = self
            .path
            .parent()
            .ok_or_else(|| format!("{} 没有父目录", self.path.display()))?;
        fs::create_dir_all(parent)
            .map_err(|error| format!("无法创建 {}：{error}", parent.display()))?;
        // 目录也收紧。文件是 0600，但一个 0755 的父目录会让别人看得见
        // 「这里有一份凭据」，也让替换文件这条路留着。
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = fs::set_permissions(parent, fs::Permissions::from_mode(0o700));
        }

        let temp = parent.join(format!(
            ".{CREDENTIAL_FILE}.tmp-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos()
        ));
        let result = (|| -> io::Result<()> {
            let mut options = OpenOptions::new();
            options.write(true).create_new(true);
            // 临时文件从被创建的那一刻就是 0600。先用默认权限建好再 chmod
            // 会留下一个窗口，窗口里这份令牌是全局可读的。
            #[cfg(unix)]
            {
                use std::os::unix::fs::OpenOptionsExt;
                options.mode(0o600);
            }
            let mut file = options.open(&temp)?;
            file.write_all(&json)?;
            file.sync_all()?;
            drop(file);
            replace_file(&temp, &self.path)
        })();
        if result.is_err() {
            let _ = fs::remove_file(&temp);
        }
        result.map_err(|error| format!("无法写入 {}：{error}", self.path.display()))
    }
}

#[cfg(all(unix, not(target_os = "macos")))]
impl CredentialBackend for FileCredentialBackend {
    fn set(&self, user_id: &str, token: &str) -> std::result::Result<(), String> {
        let mut stored = self.read()?;
        stored.version = default_credential_file_version();
        stored.tokens.insert(user_id.to_string(), token.to_string());
        self.write(&stored)
    }

    fn get(&self, user_id: &str) -> std::result::Result<Option<String>, String> {
        Ok(self.read()?.tokens.get(user_id).cloned())
    }

    fn delete(&self, user_id: &str) -> std::result::Result<(), String> {
        let mut stored = self.read()?;
        if stored.tokens.remove(user_id).is_none() {
            return Ok(());
        }
        if stored.tokens.is_empty() {
            // 最后一个令牌被删掉之后不留一个空文件：留着的话，下一次的存储
            // 自动选择会因为「文件存在」继续选文件存储，而用户刚刚做的事
            // 是「断开连接」。
            return match fs::remove_file(&self.path) {
                Ok(()) => Ok(()),
                Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
                Err(error) => Err(format!("无法删除 {}：{error}", self.path.display())),
            };
        }
        self.write(&stored)
    }
}

/// `ZEPPBRIDGE_CREDENTIAL_STORE` 写了一个认不出来的值。
///
/// 不静默回落到默认值：把 `ZEPPBRIDGE_CREDENTIAL_STORE=secretservice` 当成
/// 「没设」，就等于让一处拼写错误安静地改变令牌存到哪里去。
#[cfg(all(unix, not(target_os = "macos")))]
#[derive(Debug)]
struct InvalidCredentialStoreBackend {
    value: String,
}

#[cfg(all(unix, not(target_os = "macos")))]
impl InvalidCredentialStoreBackend {
    fn error(&self) -> String {
        format!(
            "{CREDENTIAL_STORE_ENV} 的值无法识别：{}。可用的是 secret-service、file、env",
            self.value
        )
    }
}

#[cfg(all(unix, not(target_os = "macos")))]
impl CredentialBackend for InvalidCredentialStoreBackend {
    fn set(&self, _user_id: &str, _token: &str) -> std::result::Result<(), String> {
        Err(self.error())
    }

    fn get(&self, _user_id: &str) -> std::result::Result<Option<String>, String> {
        Err(self.error())
    }

    fn delete(&self, _user_id: &str) -> std::result::Result<(), String> {
        Err(self.error())
    }
}

/// 既不是 Windows/macOS 也不是 unix 的平台。没有已知的凭据存储可用。
#[cfg(all(not(windows), not(unix)))]
#[derive(Debug, Default)]
struct UnavailableCredentialBackend;

#[cfg(all(not(windows), not(unix)))]
impl CredentialBackend for UnavailableCredentialBackend {
    fn set(&self, _user_id: &str, _token: &str) -> std::result::Result<(), String> {
        Err("这个平台上没有可用的凭据存储；测试请注入 CredentialBackend".to_string())
    }

    fn get(&self, _user_id: &str) -> std::result::Result<Option<String>, String> {
        Err("这个平台上没有可用的凭据存储；测试请注入 CredentialBackend".to_string())
    }

    fn delete(&self, _user_id: &str) -> std::result::Result<(), String> {
        Err("这个平台上没有可用的凭据存储；测试请注入 CredentialBackend".to_string())
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

/// 平台默认的凭据存储。
///
/// Windows 和 macOS 上这是一个常量：各自只有一个系统存储。Linux 上不是——
/// 桌面有 Secret Service，无头服务器和容器没有——所以要看数据目录和环境，
/// 见 [`CREDENTIAL_STORE_ENV`]。
pub fn default_credential_backend_in(data_dir: &Path) -> Arc<dyn CredentialBackend> {
    #[cfg(windows)]
    {
        let _ = data_dir;
        Arc::new(WindowsCredentialBackend)
    }
    #[cfg(target_os = "macos")]
    {
        let _ = data_dir;
        Arc::new(MacOsCredentialBackend)
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        linux_credential_backend(data_dir)
    }
    #[cfg(all(not(windows), not(unix)))]
    {
        let _ = data_dir;
        Arc::new(UnavailableCredentialBackend)
    }
}

/// 兼容旧签名。数据目录自己解析一次。
///
/// 保留它是因为它是公开 API；新代码请用 [`default_credential_backend_in`]，
/// 那条路上数据目录已经是调用方手里的东西，不必再解析一遍。
pub fn default_credential_backend() -> Arc<dyn CredentialBackend> {
    match crate::paths::resolve_data_dir() {
        Ok(dir) => default_credential_backend_in(&dir),
        // 解析不出数据目录时，文件存储无处可放，但密钥环那条路和数据目录
        // 无关，仍然能用。给一个空路径而不是直接失败。
        Err(_) => default_credential_backend_in(Path::new("")),
    }
}

/// Linux 上按环境和现状挑一个存储。
#[cfg(all(unix, not(target_os = "macos")))]
fn linux_credential_backend(data_dir: &Path) -> Arc<dyn CredentialBackend> {
    let requested = std::env::var(CREDENTIAL_STORE_ENV)
        .ok()
        .map(|value| value.trim().to_ascii_lowercase())
        .filter(|value| !value.is_empty());

    match requested.as_deref() {
        Some("secret-service") | Some("secretservice") | Some("keyring") => {
            Arc::new(SecretServiceCredentialBackend)
        }
        Some("file") => Arc::new(FileCredentialBackend::new(data_dir)),
        Some("env") => Arc::new(EnvCredentialBackend),
        Some(other) => Arc::new(InvalidCredentialStoreBackend {
            value: other.to_string(),
        }),
        // 没显式指定时，按「这台机器上已经存在的事实」推断，而不是一律
        // 假设有桌面：
        //
        // 1. 环境里有令牌 —— 那是一个不会被误解的信号，部署者刚刚把令牌
        //    交给了这个进程。
        // 2. 数据目录里已经有凭据文件 —— 上一次是用文件存储登录的。不认它
        //    的话，第二次运行忘记带上环境变量就会变成「你还没登录」。
        // 3. 都没有 —— 用 Secret Service。桌面上这是对的；不在桌面上时，
        //    报错里会写清另外两个选项。
        None if EnvCredentialBackend::token().is_some() => Arc::new(EnvCredentialBackend),
        None if data_dir.join(CREDENTIAL_FILE).is_file() => {
            Arc::new(FileCredentialBackend::new(data_dir))
        }
        None => Arc::new(SecretServiceCredentialBackend),
    }
}

fn credential_error(error: String) -> ZeppBridgeError {
    // Backends are not allowed to include secret values in their error text.
    //
    // 这是「系统凭据存储不肯配合」，不是「认证信息不对」。分开之后界面才能
    // 给出对得上的说法：一个让人重连，一个让人去看凭据管理器。
    ZeppBridgeError::CredentialStore(error)
}

fn validate_token(raw: &str) -> Result<String> {
    let value = raw.trim();
    if value.is_empty() || value.chars().any(char::is_control) {
        return Err(ZeppBridgeError::AuthError("令牌为空或格式无效".to_string()));
    }
    if value.encode_utf16().count() > CREDENTIAL_MAX_UTF16_UNITS {
        return Err(ZeppBridgeError::CredentialStore(format!(
            "令牌有 {} 个字符，超过系统凭据管理器能存的 {CREDENTIAL_MAX_UTF16_UNITS} 个；\
             这多半说明读到的不是 App Token 本身",
            value.chars().count()
        )));
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

/// Linux 上三个凭据存储的行为。
///
/// 单独一个模块而不是塞进下面的 `tests`：这些测试只在 Linux 上编译，混在
/// 一起会让那个模块的 cfg 门变成一片。
#[cfg(all(test, unix, not(target_os = "macos")))]
mod linux_credential_tests {
    use super::*;

    /// 每个测试一个自己的目录。共用一个会让「删掉最后一个令牌就删文件」
    /// 那条路径影响到别的测试。
    fn temp_dir(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "zeppbridge-cred-{tag}-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos()
        ));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn the_file_store_round_trips_a_token() {
        let dir = temp_dir("roundtrip");
        let backend = FileCredentialBackend::new(&dir);

        assert_eq!(backend.get("user-1").unwrap(), None);
        backend.set("user-1", "token-1").unwrap();
        assert_eq!(backend.get("user-1").unwrap().as_deref(), Some("token-1"));

        // 换账号不该读到上一个账号的令牌。
        backend.set("user-2", "token-2").unwrap();
        assert_eq!(backend.get("user-1").unwrap().as_deref(), Some("token-1"));
        assert_eq!(backend.get("user-2").unwrap().as_deref(), Some("token-2"));

        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn the_file_store_is_not_world_readable() {
        use std::os::unix::fs::PermissionsExt;

        let dir = temp_dir("perms");
        let backend = FileCredentialBackend::new(&dir);
        backend.set("user-1", "token-1").unwrap();

        // 这是这个存储唯一的保护措施。它松掉的话，没有任何别的东西会报警。
        let mode = fs::metadata(dir.join(CREDENTIAL_FILE))
            .unwrap()
            .permissions()
            .mode()
            & 0o777;
        assert_eq!(mode, 0o600, "凭据文件权限是 {mode:o}");

        let dir_mode = fs::metadata(&dir).unwrap().permissions().mode() & 0o777;
        assert_eq!(dir_mode, 0o700, "数据目录权限是 {dir_mode:o}");

        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn deleting_the_last_token_removes_the_file() {
        let dir = temp_dir("delete");
        let backend = FileCredentialBackend::new(&dir);
        backend.set("user-1", "token-1").unwrap();
        backend.set("user-2", "token-2").unwrap();

        backend.delete("user-1").unwrap();
        assert!(
            dir.join(CREDENTIAL_FILE).is_file(),
            "还有一个令牌，文件应当留着"
        );

        // 留下一个空文件的话，存储的自动选择会因为「文件存在」继续选文件
        // 存储——而用户刚做的事是断开连接。
        backend.delete("user-2").unwrap();
        assert!(
            !dir.join(CREDENTIAL_FILE).exists(),
            "最后一个令牌删掉后不该留空文件"
        );

        // 删一个本来就不在的账号不是错误。
        backend.delete("user-3").unwrap();

        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn a_corrupt_file_is_an_error_not_an_empty_store() {
        let dir = temp_dir("corrupt");
        fs::write(dir.join(CREDENTIAL_FILE), b"{ this is not json").unwrap();
        let backend = FileCredentialBackend::new(&dir);

        // 回落成「空的」会把一次解析失败伪装成「你还没登录」，用户照提示
        // 重新配对，那份存着的令牌就被覆盖掉了。
        let error = backend.get("user-1").expect_err("坏文件应当报错");
        assert!(error.contains(CREDENTIAL_FILE), "{error}");

        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn an_unknown_store_name_refuses_instead_of_guessing() {
        let backend = InvalidCredentialStoreBackend {
            value: "secretservice-typo".to_string(),
        };
        for error in [
            backend.get("u").unwrap_err(),
            backend.set("u", "t").unwrap_err(),
            backend.delete("u").unwrap_err(),
        ] {
            // 报错必须把可用的值列出来。只说「无法识别」的话，读到它的人
            // 还得去翻源码才知道该写什么。
            assert!(error.contains("secret-service"), "{error}");
            assert!(error.contains("file"), "{error}");
            assert!(error.contains("env"), "{error}");
        }
    }

    #[test]
    fn the_env_store_refuses_writes_but_reports_a_matching_one_as_done() {
        // 不碰真的环境变量：cargo 把测试跑在一个进程的多个线程里，
        // set_var 会让这些测试互相干扰，失败看起来还像是被测代码的问题。
        // 所以这里直接构造两种情形对应的返回值语义。
        let backend = EnvCredentialBackend;

        // 环境里没有令牌时（这个测试进程里就是如此）：读到 None，
        // 删除是无事发生，写入被拒绝并指向文件存储。
        assert_eq!(backend.get("user-1").unwrap(), None);
        backend.delete("user-1").unwrap();

        let error = backend.set("user-1", "token-1").unwrap_err();
        assert!(error.contains(APP_TOKEN_ENV), "{error}");
        assert!(
            error.contains("file"),
            "报错要指出在本机保存令牌该用哪个存储：{error}"
        );
    }
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
