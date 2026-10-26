//! 「带走我的一切」（批次 7）：用户自己写下、整理的记录一份 JSON 全部导出（core::storage::my_records）。

use std::path::PathBuf;

use crate::app_state::AppState;
use crate::commands::{join_blocking, spawn_independent_read};
use crate::ipc_error::AppError;

/// 写到用户在保存对话框里选的位置，返回一共多少条记录。
#[tauri::command]
pub async fn export_my_records(
    state: tauri::State<'_, AppState>,
    path: String,
) -> std::result::Result<u64, AppError> {
    let failed = || AppError::new("err.export.my_records", "没能写出这份文件");
    let path = PathBuf::from(path);
    if !path
        .extension()
        .is_some_and(|ext| ext.eq_ignore_ascii_case("json"))
    {
        return Err(failed());
    }
    let export = spawn_independent_read(state.data_dir.clone(), |db| {
        db.export_my_records(chrono::Utc::now())
    })
    .await?;
    let total = export["counts"]
        .as_object()
        .map_or(0, |counts| counts.values().filter_map(|v| v.as_u64()).sum());
    join_blocking(
        tokio::task::spawn_blocking(move || {
            let text = serde_json::to_vec_pretty(&export).map_err(|_| failed())?;
            std::fs::write(&path, text).map_err(|_| failed())
        })
        .await,
    )??;
    Ok(total)
}
