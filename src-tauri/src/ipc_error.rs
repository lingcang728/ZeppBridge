//! 送到界面的错误。
//!
//! 上一版每个命令都返回 `Result<_, String>`，字符串是硬编码中文，前端
//! `toUserMessage` 又原样透传。结果是英文界面上每一个后端错误都是中文——
//! Reddit 上真实走通流程的用户就是被这个绊住的。
//!
//! 这里把「是什么错」和「怎么说这件事」分开：后端只负责给一个稳定的 `code`
//! 和可选的参数，界面按 code 取自己语言的文案。中文原文仍然带着，作为
//! 界面还没来得及翻译时的兜底，也给 CLI 和日志用。
//!
//! 码的命名是 `模块.事由`（`auth.not_configured`、`export.empty_range`）。
//! 它是对外契约：改名会让已经翻好的文案失效；加新码必须同时加中英文案，
//! `npm run i18n:check` 会挡住漏掉的那一半。

use serde::Serialize;
use serde_json::Value;
use zeppbridge_core::models::error::ZeppBridgeError;

#[derive(Debug, Clone, Serialize)]
pub struct AppError {
    /// 稳定错误码。界面按它取本地化文案。
    pub code: String,
    /// 中文原文。界面查不到 code 时兜底显示，CLI 和日志一直用它。
    pub message: String,
    /// 文案里要填的空（数量、月份、HTTP 状态码等）。
    ///
    /// 只放能公开的值：不放 token、cookie、完整 URL、本机绝对路径或健康数据。
    #[serde(skip_serializing_if = "Option::is_none")]
    pub params: Option<Value>,
}

impl AppError {
    pub fn new(code: &str, message: impl Into<String>) -> Self {
        Self {
            code: code.to_string(),
            message: message.into(),
            params: None,
        }
    }

    pub fn with_params(mut self, params: Value) -> Self {
        self.params = Some(params);
        self
    }
}

impl std::fmt::Display for AppError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(&self.message)
    }
}

/// `?` 能直接把 core 的错误抬成界面错误，命令里不必每处都写 `map_err`。
impl From<ZeppBridgeError> for AppError {
    fn from(error: ZeppBridgeError) -> Self {
        let mut app = AppError::new(error.code(), error.user_message());
        // 状态码是文案里要填的空，不是错误身份的一部分。
        match &error {
            ZeppBridgeError::RetryExhausted { status, .. }
            | ZeppBridgeError::HttpStatus { status, .. } => {
                app.params = Some(serde_json::json!({ "status": status }));
            }
            _ => {}
        }
        app
    }
}

/// 写锁的两种失败对用户是两回事：「有人在写」等一下就好，「锁建不起来」
/// 要人去看目录权限。混成一句话，用户就只能靠猜。
impl From<zeppbridge_core::storage::write_lock::WriteLockError> for AppError {
    fn from(error: zeppbridge_core::storage::write_lock::WriteLockError) -> Self {
        use zeppbridge_core::storage::write_lock::WriteLockError;
        match &error {
            WriteLockError::Busy { .. } => AppError::new("err.storage.write_busy", error.to_string()),
            WriteLockError::Unavailable(_) => {
                AppError::new("err.storage.write_lock_unavailable", error.to_string())
            }
        }
    }
}

impl From<std::io::Error> for AppError {
    fn from(error: std::io::Error) -> Self {
        AppError::new("err.core.io", format!("读写本地文件失败：{error}"))
    }
}
