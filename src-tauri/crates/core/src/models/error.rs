use thiserror::Error;

/// 只有无头环境才会撞上的那几种失败。
///
/// 单独列出来，是因为它们需要**自己的错误码**。桌面端按码取本地化文案，
/// 所以那边一直没问题；而命令行没有 i18n 层，它把 `user_message()` 原样
/// 印出来——那是中文。issue #40 那位 Linux 用户就是这样在一个英文命令行上
/// 收到了两句中文：「无法读取系统密钥环…」和「本机数据库还是 v19…」。
///
/// 有了码，命令行就能自己出英文，而桌面端两种语言都不受影响。
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum HeadlessProblem {
    /// 这台机器上没有在跑 Secret Service。无头服务器和容器通常没有。
    NoCredentialStore {
        /// keyring 给的原话，用来分辨是没装还是被策略挡了。
        detail: String,
    },
    /// 库的 schema 比这个程序旧，而只读连接升不了级。
    SchemaUpgradeRequired { found: i64, required: i64 },
    /// `auth.json` 在，但凭据存储里没有这个账号的令牌。
    ///
    /// 最常见的出处不是「凭据坏了」，而是**有人把另一台机器的 data 文件夹
    /// 整个拷了过来**：库和 auth.json 都能拷，令牌不能——它在那台机器的
    /// 凭据管理器 / 钥匙串 / Secret Service 里。
    TokenNotInStore,
}

impl HeadlessProblem {
    fn code(&self) -> &'static str {
        match self {
            Self::NoCredentialStore { .. } => "err.headless.no_credential_store",
            Self::SchemaUpgradeRequired { .. } => "err.headless.schema_upgrade",
            Self::TokenNotInStore => "err.headless.token_not_in_store",
        }
    }

    /// 中文原文。桌面端的中文界面直接用它；英文界面按码取自己的文案。
    fn message(&self) -> String {
        match self {
            Self::NoCredentialStore { detail } => format!(
                "{detail}。这台机器上可能没有运行 Secret Service（GNOME Keyring / \
                 KWallet）——无头服务器和容器通常没有。改用 \
                 ZEPPBRIDGE_CREDENTIAL_STORE=file（令牌以 0600 写在数据目录里），\
                 或 ZEPPBRIDGE_CREDENTIAL_STORE=env 配合 ZEPPBRIDGE_APP_TOKEN"
            ),
            Self::SchemaUpgradeRequired { found, required } => format!(
                "本机数据库还是 v{found}，这个程序需要 v{required}。只读连接无法\
                 升级——无头环境请跑一次 `zeppbridge-cli reprocess`，有桌面应用就\
                 启动一次（两条路都会在升级前自动生成备份），再重试。"
            ),
            Self::TokenNotInStore => "认证元数据在，但凭据管理器里没有这个账号的\
                 令牌。库能跨机器拷，令牌不能。请重新登录，或设 \
                 ZEPPBRIDGE_CREDENTIAL_STORE=file / =env 后重试"
                .to_string(),
        }
    }

    /// 英文。命令行印这一份——它没有 i18n 层，而它的读者多半读不懂中文。
    ///
    /// 两个环境变量名和路径本来就是 ASCII，所以即使只读得懂其中一半，
    /// 能动手的那部分也认得出来。
    pub fn english(&self) -> String {
        match self {
            Self::NoCredentialStore { detail } => format!(
                "{detail}. There may be no Secret Service running on this machine \
                 (GNOME Keyring / KWallet) -- headless servers and containers \
                 usually have none. Use ZEPPBRIDGE_CREDENTIAL_STORE=file (the token \
                 is written 0600 into the data directory) or \
                 ZEPPBRIDGE_CREDENTIAL_STORE=env together with ZEPPBRIDGE_APP_TOKEN"
            ),
            Self::SchemaUpgradeRequired { found, required } => format!(
                "This library is still v{found} and this build needs v{required}. A \
                 read-only connection cannot upgrade it: run `zeppbridge-cli \
                 reprocess` on a headless machine, or launch the desktop app once. \
                 Both take a backup before upgrading. Then try again."
            ),
            Self::TokenNotInStore => "The account metadata is here but the credential \
                 store has no token for it. A library copies between machines; a token \
                 does not. Sign in again, or set ZEPPBRIDGE_CREDENTIAL_STORE=file / \
                 =env and retry"
                .to_string(),
        }
    }
}

impl std::fmt::Display for HeadlessProblem {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(&self.message())
    }
}

#[derive(Error, Debug)]
pub enum ZeppBridgeError {
    #[error("认证错误: {0}")]
    AuthError(String),

    /// 无头环境才会撞上的那几种失败。见 [`HeadlessProblem`]。
    #[error("{0}")]
    Headless(HeadlessProblem),

    /// 系统凭据存储（Windows 凭据管理器 / macOS 钥匙串）拒绝了这次读写。
    ///
    /// 和 `AuthError` 分开，是因为这两件事用户能做的完全不同：认证错误是
    /// 「重新连一次」，这一条是「你这台机器存不下这个令牌」——可能被组策略
    /// 禁用了，也可能令牌长得超出了凭据管理器的容量。混在「认证出错了」里，
    /// 用户看不出该往哪个方向查。
    #[error("凭据存储错误: {0}")]
    CredentialStore(String),

    #[error("网络请求失败: {0}")]
    NetworkError(#[from] reqwest::Error),

    /// The server explicitly told us that the saved credential cannot be used.
    /// Keeping this separate from a generic network error lets callers surface a
    /// re-authentication action without looking at an error string.
    #[error("需要重新认证: {0}")]
    NeedsReauth(String),

    /// A request was well formed, but this regional account does not expose the
    /// requested capability (or the resource is not present).
    #[error("数据不可用: {0}")]
    Unavailable(String),

    /// The user cancelled the in-flight sync. Kept distinct from a generic
    /// failure so callers can record a `cancelled` outcome instead of `failed`.
    #[error("同步已取消")]
    Cancelled,

    /// A retryable response remained retryable after the bounded retry budget.
    #[error("暂时无法访问 Zepp 服务 (HTTP {status}): {message}")]
    RetryExhausted { status: u16, message: String },

    /// An endpoint returned a non-success status that is neither auth nor an
    /// optional/unavailable capability.
    #[error("Zepp 服务返回 HTTP {status}: {message}")]
    HttpStatus { status: u16, message: String },

    /// HTTP 是 200，但报文自己写着「不成功」。
    ///
    /// 和 `HttpStatus` 分开：那一条说的是传输层拒绝，这一条是传输层成功、
    /// 业务层拒绝。混在一起会让「HTTP 200」这句话在日志里自相矛盾。
    ///
    /// 和 `ParseError` 分开更重要——之前这类响应正是落进 ParseError 的：
    /// 云端说不成功、没给 `data`，归一化器找不到东西，抛一句「数据无法解析」。
    /// 用户看到的是既不提示重新登录、又永远拉不到数据的假死态。
    #[error("Zepp 返回业务错误 code={code}: {message}")]
    CloudRejected { code: i64, message: String },

    #[error("不安全的 Zepp 区域主机: {0}")]
    InvalidHost(String),

    #[error("数据库错误: {0}")]
    DatabaseError(#[from] rusqlite::Error),

    #[error("数据解析错误: {0}")]
    ParseError(String),

    #[error("数据不可用: {0}")]
    DataUnavailable(String),

    #[error("配置错误: {0}")]
    ConfigError(String),

    /// 另一个进程正在写同一个数据库。
    ///
    /// 和 `ConfigError` 分开，是因为调用方对这两件事的处理完全不同：
    /// busy 是「等一会儿再来」，配置错误是「你得改点什么」。混在一起，
    /// 调度脚本就只能去匹配错误文案。
    #[error("{0}")]
    Busy(String),

    #[error("IO 错误: {0}")]
    IoError(#[from] std::io::Error),

    #[allow(dead_code)]
    #[error("未知错误: {0}")]
    Unknown(String),
}

pub type Result<T> = std::result::Result<T, ZeppBridgeError>;

impl ZeppBridgeError {
    pub fn needs_reauth(&self) -> bool {
        matches!(self, Self::NeedsReauth(_))
    }

    /// 另一个写者占着库。可重试，不是失败。
    pub fn is_busy(&self) -> bool {
        matches!(self, Self::Busy(_))
    }

    pub fn is_unavailable(&self) -> bool {
        matches!(self, Self::Unavailable(_) | Self::DataUnavailable(_))
    }

    pub fn is_cancelled(&self) -> bool {
        matches!(self, Self::Cancelled)
    }

    #[allow(dead_code)]
    pub fn is_retryable(&self) -> bool {
        matches!(self, Self::RetryExhausted { .. } | Self::NetworkError(_))
    }

    /// 稳定的错误码。
    ///
    /// 界面按码取本地化文案，`user_message()` 只作为取不到时的兜底。这两件事
    /// 必须分开：上一版界面直接显示后端返回的字符串，而这些字符串全是中文，
    /// 于是英文界面上每一个后端错误都是中文。
    ///
    /// 码是对外契约的一部分——改名等于让已经翻好的文案失效，加新码要同时加
    /// 中英文案（`npm run i18n:check` 会挡住漏的那一个）。
    pub fn code(&self) -> &'static str {
        match self {
            Self::NetworkError(_) => "err.core.network",
            Self::NeedsReauth(_) => "err.core.needs_reauth",
            Self::Unavailable(_) | Self::DataUnavailable(_) => "err.core.unavailable",
            Self::RetryExhausted { .. } => "err.core.retry_exhausted",
            Self::HttpStatus { .. } => "err.core.http_status",
            Self::CloudRejected { .. } => "err.core.cloud_rejected",
            Self::Cancelled => "err.core.cancelled",
            Self::AuthError(_) => "err.core.auth",
            Self::Headless(problem) => problem.code(),
            Self::CredentialStore(_) => "err.core.credential_store",
            Self::InvalidHost(_) => "err.core.invalid_host",
            Self::ConfigError(_) => "err.core.config",
            Self::Busy(_) => "err.core.busy",
            Self::ParseError(_) => "err.core.parse",
            Self::DatabaseError(_) => "err.core.database",
            Self::IoError(_) => "err.core.io",
            Self::Unknown(_) => "err.core.unknown",
        }
    }

    /// Short, token-free, URL-free copy for the desktop UI.
    ///
    /// 中文原文。界面优先用 `code()` 查本地化文案，这里是兜底；CLI 和日志
    /// 一直用它，不跟界面语言走。
    pub fn user_message(&self) -> String {
        match self {
            Self::NetworkError(_) => "无法连接 Zepp 区域，请检查网络后重试".into(),
            Self::NeedsReauth(_) => "认证已失效，请重新连接 Zepp".into(),
            Self::Unavailable(_) | Self::DataUnavailable(_) => {
                sanitize_user_text(&self.to_string())
            }
            Self::RetryExhausted { status, .. } => {
                format!("Zepp 服务暂时不可用（HTTP {status}），请稍后重试")
            }
            Self::HttpStatus { status, .. } => {
                format!("Zepp 服务返回 HTTP {status}，请稍后重试")
            }
            // 把 code 和云端原话都带上：这是目前唯一能让下一份反馈报告告诉
            // 我们「失效到底长什么样」的途径。`sanitize_user_text` 会去掉
            // 里面可能出现的地址。
            Self::CloudRejected { code, message } => sanitize_user_text(&format!(
                "Zepp 云端拒绝了这次请求（code {code}）：{message}。如果反复出现，请在设置里重新连接 Zepp 账号。"
            )),
            Self::Cancelled => "同步已取消".into(),
            Self::AuthError(message)
            | Self::CredentialStore(message)
            | Self::InvalidHost(message)
            | Self::ConfigError(message)
            | Self::Busy(message) => sanitize_user_text(message),
            // 不过 `sanitize_user_text`：那一层有 140 字上限，而这几句的
            // 全部价值就在于把两个环境变量名和该跑哪条命令说完整。它们是
            // 我们自己写死的常量，里面没有地址，也没有云端回来的内容。
            Self::Headless(problem) => problem.to_string(),
            Self::ParseError(_) => "Zepp 返回的数据无法解析".into(),
            Self::DatabaseError(_) => "本地数据库暂时不可用".into(),
            Self::IoError(_) => "读写本地文件失败".into(),
            Self::Unknown(message) => sanitize_user_text(message),
        }
    }
}

pub fn sanitize_user_text(source: &str) -> String {
    let without_url = regex_replace_urls(source);
    let trimmed = without_url.trim();
    if trimmed.chars().count() > 140 {
        format!("{}…", trimmed.chars().take(137).collect::<String>())
    } else {
        trimmed.to_string()
    }
}

fn regex_replace_urls(source: &str) -> String {
    let mut output = String::with_capacity(source.len());
    let mut rest = source;
    while let Some(start) = rest.find("http://").or_else(|| rest.find("https://")) {
        output.push_str(&rest[..start]);
        output.push_str("[已隐藏地址]");
        let after = &rest[start..];
        let end = after
            .find(|character: char| {
                character.is_whitespace() || matches!(character, ')' | '"' | '\'' | '>' | ']')
            })
            .unwrap_or(after.len());
        rest = &after[end..];
    }
    output.push_str(rest);
    output
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn user_message_strips_request_urls() {
        let error = ZeppBridgeError::ConfigError(
            "error sending request for url (https://api-mifit.huami.com/users/abc123/heartRate)"
                .into(),
        );
        let message = error.user_message();
        assert!(!message.contains("abc123"));
        assert!(!message.contains("https://"));
        assert!(message.contains("已隐藏地址"));
    }
}
