//! 设置「本地 AI」卡：AI 最近的改动（逐条撤销）和「只给共享任务」开关（3.1.2）。
//!
//! 账本和撤销规则在 core 的 `storage::mcp_writes`；这里只把结局换成稳定码。

use super::{spawn_independent_read, with_write};
use crate::app_state::AppState;
use crate::ipc_error::AppError;
use zeppbridge_core::storage::mcp_writes::{McpWrite, UndoOutcome};
use zeppbridge_core::storage::write_lock::WritePurpose;

/// 界面上最多列多少条。
const LIST_LIMIT: usize = 30;

#[tauri::command]
pub async fn mcp_writes_list(state: tauri::State<'_, AppState>) -> Result<Vec<McpWrite>, AppError> {
    spawn_independent_read(state.data_dir.clone(), |db| db.mcp_writes(LIST_LIMIT)).await
}

#[tauri::command]
pub async fn mcp_write_undo(
    state: tauri::State<'_, AppState>,
    id: i64,
) -> Result<Vec<McpWrite>, AppError> {
    let outcome = with_write(
        &state.data_dir,
        &state.db,
        WritePurpose::Metadata,
        move |db| db.undo_mcp_write(id),
    )
    .await?;
    match outcome {
        UndoOutcome::Undone => {}
        UndoOutcome::Stale => {
            return Err(AppError::new(
                "err.mcp_writes.stale",
                "这条记录之后又被改过，不能照 AI 改之前的样子撤回；请到对应页面手动改",
            ))
        }
        UndoOutcome::Missing => {
            return Err(AppError::new(
                "err.mcp_writes.missing",
                "这次改动已经撤销过，或者找不到了",
            ))
        }
    }
    spawn_independent_read(state.data_dir.clone(), |db| db.mcp_writes(LIST_LIMIT)).await
}

/// 打开后生成的配置带 `--scope task`：AI 只看得到「交给 AI」里共享出去的任务，写工具一律被拒。
#[tauri::command]
pub async fn set_mcp_task_only(
    state: tauri::State<'_, AppState>,
    on: bool,
) -> Result<bool, AppError> {
    with_write(
        &state.data_dir,
        &state.db,
        WritePurpose::Metadata,
        move |db| {
            db.set_mcp_task_scope_only(on)?;
            db.mcp_task_scope_only()
        },
    )
    .await
}
