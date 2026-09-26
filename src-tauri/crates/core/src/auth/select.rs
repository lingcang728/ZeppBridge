//! 按平台选凭据后端，以及 token / 用户编号 / 区域主机的校验（从 auth/mod.rs 拆出，逻辑不变）。

use super::*;

/// 平台默认的凭据存储。
///
/// macOS and Linux can explicitly opt into a file store when the system
/// store is inaccessible. Reuse an existing credential file after a restart,
/// but never fall back to a file in response to a system-store error.
pub fn default_credential_backend_in(data_dir: &Path) -> Arc<dyn CredentialBackend> {
    #[cfg(windows)]
    {
        let _ = data_dir;
        Arc::new(WindowsCredentialBackend)
    }
    #[cfg(target_os = "macos")]
    {
        macos_credential_backend(
            data_dir,
            std::env::var(CREDENTIAL_STORE_ENV).ok().as_deref(),
        )
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

/// Resolve the macOS choice without accessing Keychain or changing process
/// environment, so the opt-in and restart rules can be tested on every host.
#[cfg(any(target_os = "macos", test))]
pub(super) fn macos_file_store_selected(
    requested: Option<&str>,
    credential_file_exists: bool,
) -> std::result::Result<bool, String> {
    match requested.map(str::trim).filter(|value| !value.is_empty()) {
        Some(value) if value.eq_ignore_ascii_case("file") => Ok(true),
        Some(value)
            if value.eq_ignore_ascii_case("keychain") || value.eq_ignore_ascii_case("keyring") =>
        {
            Ok(false)
        }
        Some(value) => Err(value.to_string()),
        None => Ok(credential_file_exists),
    }
}

#[cfg(target_os = "macos")]
pub(super) fn macos_credential_backend(
    data_dir: &Path,
    requested: Option<&str>,
) -> Arc<dyn CredentialBackend> {
    match macos_file_store_selected(requested, data_dir.join(CREDENTIAL_FILE).is_file()) {
        Ok(true) => Arc::new(FileCredentialBackend::new(data_dir)),
        Ok(false) => Arc::new(MacOsCredentialBackend),
        Err(value) => Arc::new(InvalidCredentialStoreBackend { value }),
    }
}

/// Linux 上按环境和现状挑一个存储。
#[cfg(all(unix, not(target_os = "macos")))]
pub(super) fn linux_credential_backend(data_dir: &Path) -> Arc<dyn CredentialBackend> {
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

/// Linux Secret Service 在「机器上没有密钥环」时用这个前缀，让
/// [`credential_error`] 把它还原成 [`HeadlessProblem`]，而不是吞进
/// 泛化的 `CredentialStore`（命令行会因此变成退出码 1 + 中文原文）。
pub(super) const HEADLESS_NO_STORE_MARKER: &str = "\u{1e}headless.no_credential_store\u{1e}";

pub(super) fn credential_error(error: String) -> ZeppBridgeError {
    // Backends are not allowed to include secret values in their error text.
    //
    // 这是「系统凭据存储不肯配合」，不是「认证信息不对」。分开之后界面才能
    // 给出对得上的说法：一个让人重连，一个让人去看凭据管理器。
    if let Some(detail) = error.strip_prefix(HEADLESS_NO_STORE_MARKER) {
        return ZeppBridgeError::Headless(HeadlessProblem::NoCredentialStore {
            detail: detail.to_string(),
        });
    }
    ZeppBridgeError::CredentialStore(error)
}

pub(super) fn validate_token(raw: &str) -> Result<String> {
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

pub(super) fn validate_user_id(raw: &str) -> Result<String> {
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
    // 这里存进凭据文件的地址，最终要喂给 `connectors::zepp::validate_region_host`
    // 去真正建连接；那边不允许端口、只认 `api-mifit*.zepp.com` /
    // `api-mifit*.huami.com`。这里如果比那边松，会出现「保存登录时通过、
    // 状态显示已连接，但每次同步都在连接层被拒绝」的死结，而且只能靠清除
    // 凭据重新登录才能摆脱。两处规则必须一致。
    if parsed.port().is_some() {
        return Err(ZeppBridgeError::AuthError(
            "区域主机不允许携带端口".to_string(),
        ));
    }
    let valid_zepp = host.starts_with("api-mifit") && host.ends_with(".zepp.com");
    let valid_huami = host.starts_with("api-mifit") && host.ends_with(".huami.com");
    if !(valid_zepp || valid_huami) {
        return Err(ZeppBridgeError::AuthError(
            "区域主机只能是 api-mifit*.zepp.com 或 api-mifit*.huami.com".to_string(),
        ));
    }
    Ok(format!("https://{host}"))
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

pub(super) fn replace_file(temp: &Path, destination: &Path) -> io::Result<()> {
    // Windows `std::fs::rename` already replaces (`MoveFileExW` +
    // `MOVEFILE_REPLACE_EXISTING`). Removing the destination first is not
    // atomic: a crash in between leaves the target missing.
    fs::rename(temp, destination)
}
