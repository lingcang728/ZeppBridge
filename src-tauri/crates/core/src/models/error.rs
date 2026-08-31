use thiserror::Error;

#[derive(Error, Debug)]
pub enum ZeppBridgeError {
    #[error("认证错误: {0}")]
    AuthError(String),

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
            Self::Cancelled => "err.core.cancelled",
            Self::AuthError(_) => "err.core.auth",
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
            Self::Cancelled => "同步已取消".into(),
            Self::AuthError(message)
            | Self::InvalidHost(message)
            | Self::ConfigError(message)
            | Self::Busy(message) => sanitize_user_text(message),
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
