//! BETA1 A7-P3 的十个 `ai_task*` / `ai_template*` 命令。
//!
//! 分工与协议一致：
//! - 读命令走 `spawn_independent_read`（只读连接，不占写锁）；
//! - 写命令走 `with_write(WritePurpose::Metadata)`；
//! - `ai_task_prepare` 会往 `data_dir/exports/ai-tasks/` 写文件，也归写命令；
//! - `ai_task_attachment_stat` 纯 stat 不碰库，直接在线程外做。
//!
//! 错误码全部来自 core 侧（`err.ai_task.*` / `err.ai_template.*`），
//! 这层只做薄适配——不在命令层猜实体。

use super::{spawn_independent_read, with_write};
use crate::app_state::AppState;
use crate::ipc_error::AppError;
use zeppbridge_core::ai_tasks::{
    stat_attachment_paths, AiTask, AiTaskAttachmentStat, AiTaskPrepareResult, AiTaskPreview,
    AiTaskSummary, AiTaskTemplate,
};
use zeppbridge_core::storage::write_lock::WritePurpose;

/// `ai_task_attachment_stat` 的单次路径数上限——它只是个 stat 批量接口，
/// 不是让前端把整盘文件列表塞进来的。
const MAX_STAT_PATHS: usize = 256;

/// 列出全部任务（按更新时间倒序），只走索引列。
#[tauri::command]
pub async fn ai_task_list(
    state: tauri::State<'_, AppState>,
) -> std::result::Result<Vec<AiTaskSummary>, AppError> {
    spawn_independent_read(state.data_dir.clone(), |db| db.list_ai_tasks()).await
}

/// 取一个任务的完整对象；不存在 → `err.ai_task.not_found`。
#[tauri::command]
pub async fn ai_task_get(
    state: tauri::State<'_, AppState>,
    id: String,
) -> std::result::Result<AiTask, AppError> {
    spawn_independent_read(state.data_dir.clone(), move |db| db.require_ai_task(&id)).await
}

/// 保存任务（新建或更新）。后端填 id/时间戳；`mcp_shared` 开关走此命令。
#[tauri::command]
pub async fn ai_task_save(
    state: tauri::State<'_, AppState>,
    task: AiTask,
) -> std::result::Result<AiTask, AppError> {
    with_write(&state.data_dir, &state.db, WritePurpose::Metadata, |db| {
        db.save_ai_task(&task)
    })
    .await
}

/// 删除任务行；附件原件不动。
#[tauri::command]
pub async fn ai_task_delete(
    state: tauri::State<'_, AppState>,
    id: String,
) -> std::result::Result<(), AppError> {
    with_write(&state.data_dir, &state.db, WritePurpose::Metadata, |db| {
        db.delete_ai_task(&id)
    })
    .await
}

/// 模板列表，内置模板在前。
#[tauri::command]
pub async fn ai_template_list(
    state: tauri::State<'_, AppState>,
) -> std::result::Result<Vec<AiTaskTemplate>, AppError> {
    spawn_independent_read(state.data_dir.clone(), |db| db.list_ai_task_templates()).await
}

/// 保存用户模板。内置模板只读：`err.ai_template.builtin_readonly`。
#[tauri::command]
pub async fn ai_template_save(
    state: tauri::State<'_, AppState>,
    template: AiTaskTemplate,
) -> std::result::Result<AiTaskTemplate, AppError> {
    with_write(&state.data_dir, &state.db, WritePurpose::Metadata, |db| {
        db.save_ai_task_template(&template)
    })
    .await
}

/// 删除用户模板。
#[tauri::command]
pub async fn ai_template_delete(
    state: tauri::State<'_, AppState>,
    id: String,
) -> std::result::Result<(), AppError> {
    with_write(&state.data_dir, &state.db, WritePurpose::Metadata, |db| {
        db.delete_ai_task_template(&id)
    })
    .await
}

/// 预览任务的覆盖事实与警告。未保存的草稿（空 id）也收。
/// `workout_ids` 里有本机不存在的运动 → `err.ai_task.workout_not_found`。
#[tauri::command]
pub async fn ai_task_preview(
    state: tauri::State<'_, AppState>,
    task: AiTask,
) -> std::result::Result<AiTaskPreview, AppError> {
    spawn_independent_read(state.data_dir.clone(), move |db| db.ai_task_preview(&task)).await
}

/// 生成 `health-context.json` + `prompt.txt` 到
/// `data_dir/exports/ai-tasks/<task_id>/`。`missing` 附件 → `blocked`。
///
/// 写文件所以拿写锁（`Metadata`），同步/备份期间会排队而不是各写各的。
#[tauri::command]
pub async fn ai_task_prepare(
    state: tauri::State<'_, AppState>,
    task: AiTask,
    coverage_note: String,
) -> std::result::Result<AiTaskPrepareResult, AppError> {
    let output_root = state.data_dir.join("exports").join("ai-tasks");
    with_write(&state.data_dir, &state.db, WritePurpose::Metadata, |db| {
        db.ai_task_prepare(&task, &coverage_note, &output_root)
    })
    .await
}

/// 批量 stat 用户挑的附件路径——本机核对用，`path` 在这里合法返回。
#[tauri::command]
pub async fn ai_task_attachment_stat(
    paths: Vec<String>,
) -> std::result::Result<Vec<AiTaskAttachmentStat>, AppError> {
    if paths.len() > MAX_STAT_PATHS {
        return Err(AppError::new(
            "err.ai_task.invalid",
            "一次最多检查 256 个附件路径",
        ));
    }
    Ok(stat_attachment_paths(&paths))
}
