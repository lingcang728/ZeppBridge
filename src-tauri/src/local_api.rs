//! 本机 API 的 Tauri 适配层。
//!
//! 生命周期、鉴权、解析上限和数据读取都在 `zeppbridge_core::local_api`：
//! 这里只把 controller 的实时状态和三个用户动作暴露成命令。

use crate::ipc_error::AppError;
use std::sync::Arc;
use zeppbridge_core::local_api::{LocalApiController, LocalApiStatus};

/// Tauri 管理的 controller 句柄。
pub struct LocalApi(pub Arc<LocalApiController>);

#[tauri::command]
pub fn get_local_api_status(state: tauri::State<'_, LocalApi>) -> LocalApiStatus {
    state.0.status()
}

#[tauri::command]
pub fn set_local_api_enabled(
    state: tauri::State<'_, LocalApi>,
    enabled: bool,
) -> Result<LocalApiStatus, AppError> {
    Ok(state.0.set_enabled(enabled))
}

/// 界面默认遮罩 token，只有用户点击「显示」或「复制」时才走到这里。
#[tauri::command]
pub fn reveal_local_api_token(state: tauri::State<'_, LocalApi>) -> Result<String, AppError> {
    state
        .0
        .reveal_token()
        .map_err(|message| AppError::new("err.local_api.token_unavailable", message))
}

#[tauri::command]
pub fn rotate_local_api_token(state: tauri::State<'_, LocalApi>) -> Result<String, AppError> {
    state
        .0
        .rotate_token()
        .map_err(|message| AppError::new("err.local_api.token_rotate_failed", message))
}
