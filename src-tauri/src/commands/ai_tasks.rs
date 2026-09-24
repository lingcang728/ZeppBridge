//! BETA1 A7-P3 的十个 `ai_task*` / `ai_template*` 命令。
//!
//! 分工与协议一致：
//! - 读命令走 `spawn_independent_read`（只读连接，不占写锁）；
//! - 写命令走 `with_write(WritePurpose::Metadata)`；
//! - `ai_task_prepare` 分两段：bundle 构建走 `spawn_independent_read`，
//!   落盘是纯文件 IO 走 `spawn_blocking`——写出的是 exports 下的新文件
//!   而不是 zepp.db，不占 `state.db` 也不需要跨进程写锁；
//! - `ai_task_attachment_stat` 纯 stat 不碰库，走 `spawn_blocking`。
//!
//! 错误码全部来自 core 侧（`err.ai_task.*` / `err.ai_template.*`），
//! 这层只做薄适配——不在命令层猜实体。

use super::{join_blocking, spawn_independent_read, with_write};
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

/// 生成 `health-context.json` + `prompt.txt`（+ 附件原件副本）到
/// 桌面 `ZeppBridge AI/<任务名>_<时间>/`，用户直接从桌面拖进 AI 对话框；
/// 取不到桌面时回落 `data_dir/exports/ai-tasks/`。`missing` 附件 → `blocked`。
///
/// 分两段：构建（校验、锚点、coverage、bundle、序列化）在独立只读连接上
/// 跑，不占 `state.db`；落盘是纯文件 IO。写出的是新文件而不是
/// zepp.db——跨进程写锁管的是库的写者，这里不需要它。
#[tauri::command]
pub async fn ai_task_prepare(
    state: tauri::State<'_, AppState>,
    task: AiTask,
    coverage_note: String,
    direction_text: Option<String>,
) -> std::result::Result<AiTaskPrepareResult, AppError> {
    let output_root = directories::UserDirs::new()
        .and_then(|dirs| dirs.desktop_dir().map(|path| path.join("ZeppBridge AI")))
        .unwrap_or_else(|| state.data_dir.join("exports").join("ai-tasks"));
    let plan = spawn_independent_read(state.data_dir.clone(), move |db| {
        db.ai_task_prepare_plan(
            &task,
            &coverage_note,
            direction_text.as_deref(),
            &output_root,
        )
    })
    .await?;
    join_blocking(tokio::task::spawn_blocking(move || plan.finish()).await)
        .and_then(|result| result.map_err(AppError::from))
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
    join_blocking(tokio::task::spawn_blocking(move || stat_attachment_paths(&paths)).await)
}
