//! 凭据后端：Windows 凭据管理器、macOS 钥匙串、Secret Service、环境变量与文件（从 auth/mod.rs 拆出，逻辑不变）。

use super::*;

/// A small abstraction around the platform credential store.  Keeping this
/// boundary explicit makes tests deterministic without ever putting a token
/// in `auth.json`.
pub trait CredentialBackend: Send + Sync {
    fn set(&self, user_id: &str, token: &str) -> std::result::Result<(), String>;
    fn get(&self, user_id: &str) -> std::result::Result<Option<String>, String>;
    fn delete(&self, user_id: &str) -> std::result::Result<(), String>;

    /// 能不能按名字分开存多条。环境变量后端不管问哪个名字都返回同一个旧通道
    /// 令牌，官方授权的令牌放进去会被读成旧令牌——所以它说不能。
    fn supports_named_entries(&self) -> bool {
        true
    }
}

/// 把系统凭据存储的真实失败原因带出来。
///
/// 以前每一处都是 `map_err(|_| "无法写入 Windows 凭据管理器")`：底层错误被整个
/// 丢掉，包括 Win32 错误码，以及「某个字段超长」这种已经说得很清楚的原因。
/// 用户报上来一句「无法写入」，我们和他都无从下手。
#[cfg(any(windows, unix))]
pub(super) fn describe_keyring_error(action: &str, error: &keyring::Error) -> String {
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

/// Select credential storage: `keychain` / `file` on macOS, or
/// `secret-service` / `file` / `env` on Linux. Windows uses Credential Manager.
/// File storage must be opted into; a locked system store never enables it.
pub const CREDENTIAL_STORE_ENV: &str = "ZEPPBRIDGE_CREDENTIAL_STORE";

/// 由环境直接给出的令牌（只读存储）。
pub const APP_TOKEN_ENV: &str = "ZEPPBRIDGE_APP_TOKEN";

/// 文件存储的文件名，放在数据目录里。
#[cfg(unix)]
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
pub(super) fn describe_secret_service_error(action: &str, error: &keyring::Error) -> String {
    let base = describe_keyring_error(action, error);
    match error {
        // 走 `HeadlessProblem`，这样它有自己的错误码。命令行没有 i18n 层，
        // 只能按码取英文——issue #40 那位 Linux 用户就是在英文命令行上收到了
        // 这一句的中文原文。
        keyring::Error::NoStorageAccess(_) | keyring::Error::PlatformFailure(_) => {
            format!("{HEADLESS_NO_STORE_MARKER}{base}")
        }
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
    pub(super) fn token() -> Option<String> {
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

    fn supports_named_entries(&self) -> bool {
        false
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
/// 或无法解锁钥匙串的 macOS 上可能根本用不了系统存储——而把令牌塞进
/// shell 历史或者 `docker inspect` 看得见的地方比这更糟。
///
/// 所以它必须被显式选中（`ZEPPBRIDGE_CREDENTIAL_STORE=file`），不会在密钥环
/// 不可用时被静默启用。
#[cfg(unix)]
#[derive(Debug)]
pub struct FileCredentialBackend {
    pub(super) path: PathBuf,
}

#[cfg(unix)]
#[derive(Debug, Default, Serialize, Deserialize)]
pub(super) struct StoredCredentials {
    #[serde(default = "default_credential_file_version")]
    pub(super) version: u32,
    #[serde(default)]
    pub(super) tokens: std::collections::BTreeMap<String, String>,
}

#[cfg(unix)]
pub(super) fn default_credential_file_version() -> u32 {
    1
}

#[cfg(unix)]
impl FileCredentialBackend {
    pub fn new(data_dir: &Path) -> Self {
        Self {
            path: data_dir.join(CREDENTIAL_FILE),
        }
    }

    pub(super) fn read(&self) -> std::result::Result<StoredCredentials, String> {
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

    pub(super) fn write(&self, stored: &StoredCredentials) -> std::result::Result<(), String> {
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
            fs::set_permissions(parent, fs::Permissions::from_mode(0o700))
                .map_err(|error| format!("无法保护凭据目录 {}：{error}", parent.display()))?;
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

#[cfg(unix)]
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
#[cfg(unix)]
#[derive(Debug)]
pub(super) struct InvalidCredentialStoreBackend {
    pub(super) value: String,
}

#[cfg(unix)]
impl InvalidCredentialStoreBackend {
    pub(super) fn error(&self) -> String {
        #[cfg(target_os = "macos")]
        let choices = "keychain、file";
        #[cfg(not(target_os = "macos"))]
        let choices = "secret-service、file、env";
        format!(
            "{CREDENTIAL_STORE_ENV} 的值无法识别：{}。可用的是 {choices}",
            self.value
        )
    }
}

#[cfg(unix)]
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
pub(super) struct UnavailableCredentialBackend;

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

/// File-store tests run on both macOS and Linux CI, without system credentials.
#[cfg(all(test, unix))]
mod unix_credential_tests {
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
            assert!(error.contains("file"), "{error}");
            #[cfg(target_os = "macos")]
            assert!(error.contains("keychain"), "{error}");
            #[cfg(not(target_os = "macos"))]
            assert!(error.contains("secret-service"), "{error}");
            #[cfg(not(target_os = "macos"))]
            assert!(error.contains("env"), "{error}");
        }
    }

    #[test]
    #[cfg(not(target_os = "macos"))]
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
