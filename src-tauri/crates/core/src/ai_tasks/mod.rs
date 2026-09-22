//! AI 分析任务：存储模型、窗口覆盖、出仓构造与 MCP 授权窗口。
//!
//! BETA1 A7 协议（P1–P4, P6）的 Rust 侧实现。边界：
//!
//! - 本模块只产**事实与形状**：任务/模板 CRUD、按 P4 展开的窗口、
//!   干净的出仓 JSON。提示词文案由前端按码提供（`coverage_note` 参数），
//!   后端不产界面文案。
//! - [`model::AiTaskAttachmentRef`]（带本机 `path`）只在本机流动；
//!   离开本机的附件形态一律是 [`model::AiTaskAttachmentPublicRef`]。
//! - `mcp_shared=1` 的任务由 [`shared_task_grants`] 每次请求现算成
//!   `access::TaskGrant`；展开与判定实现都在 `access.rs`（S5 的文件，
//!   本模块只保证 `ai_tasks` 表形状与它的 `SharedTaskPayload` 解析对齐）。

pub mod coverage;
pub mod export;
pub mod model;
pub mod store;

#[cfg(test)]
mod tests;

pub use crate::access::shared_task_grants;
pub use model::*;
pub use store::stat_attachment_paths;

use crate::models::error::ZeppBridgeError;

/// 任务/模板这层自己的业务失败。
///
/// 为什么要单独一个枚举而不是塞进 `ZeppBridgeError::ConfigError`：
/// 命令层要按码回 IPC（`err.ai_task.invalid` 和 `err.ai_template.invalid`
/// 是两个码，而两者都可能来自「字段校验失败」），码在这里就定好，
/// `AppError::from` 原样透传，不用在命令层再猜一遍是哪个实体。
#[derive(Debug, thiserror::Error)]
pub enum AiTaskError {
    /// 输入校验失败。`code` 是 `err.ai_task.invalid` 或 `err.ai_template.invalid`，
    /// 由产生它的实体决定。
    #[error("{message}")]
    Invalid { code: &'static str, message: String },
    /// 记录不存在：`err.ai_task.not_found` / `err.ai_template.not_found` /
    /// `err.ai_task.workout_not_found`。`params` 只放公开安全的 id。
    #[error("{message}")]
    NotFound {
        code: &'static str,
        message: String,
        params: Option<serde_json::Value>,
    },
    /// 内置模板不能改也不能删——「另存为用户模板」是唯一合法路径。
    #[error("内置模板是只读的，请另存为用户模板")]
    BuiltinReadonly,
    /// 交接文件写盘失败。
    #[error("{message}")]
    WriteFailed { message: String },
    // 注意：不能在这里放 `Storage(#[from] ZeppBridgeError)`——
    // `ZeppBridgeError::AiTask(AiTaskError)` 与它会互相内嵌成无限大的类型。
    // 底层错误走 `ZeppBridgeError` 自己的 #[from]（rusqlite/serde_json/io），
    // 在返回 `ZeppBridgeError` 的函数里直接 `?` 透传即可。
}

impl AiTaskError {
    /// 稳定码——`ZeppBridgeError::AiTask` 与 `AppError::from` 都用它。
    pub fn code(&self) -> &'static str {
        match self {
            Self::Invalid { code, .. } | Self::NotFound { code, .. } => code,
            Self::BuiltinReadonly => "err.ai_template.builtin_readonly",
            Self::WriteFailed { .. } => "err.ai_task.write_failed",
        }
    }

    /// 中文兜底文案。界面按 `code()` 取本地化文本。
    pub fn user_message(&self) -> String {
        match self {
            Self::Invalid { message, .. }
            | Self::NotFound { message, .. }
            | Self::WriteFailed { message } => crate::models::error::sanitize_user_text(message),
            Self::BuiltinReadonly => self.to_string(),
        }
    }

    /// 文案里要填的空（不存在的 id 列表等）。只放公开安全的值。
    pub fn params(&self) -> Option<serde_json::Value> {
        match self {
            Self::NotFound { params, .. } => params.clone(),
            _ => None,
        }
    }

    pub(crate) fn invalid_task(message: impl Into<String>) -> ZeppBridgeError {
        ZeppBridgeError::AiTask(AiTaskError::Invalid {
            code: "err.ai_task.invalid",
            message: message.into(),
        })
    }

    pub(crate) fn invalid_template(message: impl Into<String>) -> ZeppBridgeError {
        ZeppBridgeError::AiTask(AiTaskError::Invalid {
            code: "err.ai_template.invalid",
            message: message.into(),
        })
    }

    pub(crate) fn task_not_found(id: &str) -> ZeppBridgeError {
        ZeppBridgeError::AiTask(AiTaskError::NotFound {
            code: "err.ai_task.not_found",
            message: "分析任务不存在或已删除".to_string(),
            params: Some(serde_json::json!({ "id": id })),
        })
    }

    pub(crate) fn template_not_found(id: &str) -> ZeppBridgeError {
        ZeppBridgeError::AiTask(AiTaskError::NotFound {
            code: "err.ai_template.not_found",
            message: "模板不存在或已删除".to_string(),
            params: Some(serde_json::json!({ "id": id })),
        })
    }

    pub(crate) fn workouts_not_found(ids: Vec<String>) -> ZeppBridgeError {
        ZeppBridgeError::AiTask(AiTaskError::NotFound {
            code: "err.ai_task.workout_not_found",
            message: format!("选中的运动在本机不存在：{}", ids.join(", ")),
            params: Some(serde_json::json!({ "workout_ids": ids })),
        })
    }

    pub(crate) fn builtin_readonly() -> ZeppBridgeError {
        ZeppBridgeError::AiTask(AiTaskError::BuiltinReadonly)
    }

    pub(crate) fn write_failed(message: impl Into<String>) -> ZeppBridgeError {
        ZeppBridgeError::AiTask(AiTaskError::WriteFailed {
            message: message.into(),
        })
    }
}
