//! 备份与恢复的 Tauri 适配层。
//!
//! 快照生成、校验、清单和恢复的全部规则都在
//! `zeppbridge_core::storage::backup`；这里只负责拿写锁、把结果交给界面，
//! 以及把「恢复要在下次启动时执行」这件事如实告诉用户。

use crate::app_state::AppState;
use std::time::Duration;
use zeppbridge_core::storage::backup::{
    self, BackupKind, BackupManifest, BackupVerification, PendingRestore, RestorePreview,
};
use zeppbridge_core::storage::write_lock::{acquire_with_timeout, WritePurpose};

const LOCK_TIMEOUT: Duration = Duration::from_secs(30);

/// 全部快照，最新的在前。
#[tauri::command]
pub async fn list_backups(
    state: tauri::State<'_, AppState>,
) -> std::result::Result<Vec<BackupManifest>, String> {
    backup::list_backups(&state.data_dir).map_err(|error| error.user_message())
}

/// 用户主动生成一份快照。
///
/// 走 SQLite Backup API，生成后立刻 `integrity_check` 并算 SHA-256；
/// 校验不过会报错并删掉半成品，而不是留下一份看起来成功的坏备份。
#[tauri::command]
pub async fn create_manual_backup(
    state: tauri::State<'_, AppState>,
) -> std::result::Result<BackupManifest, String> {
    let _guard = acquire_with_timeout(&state.data_dir, WritePurpose::Backup, LOCK_TIMEOUT)
        .map_err(|error| error.to_string())?;
    backup::create_backup(
        &state.data_dir,
        BackupKind::Manual,
        env!("CARGO_PKG_VERSION"),
    )
    .map_err(|error| error.user_message())
}

/// 重新校验一份已有快照：文件、大小、SHA-256 和完整性。
#[tauri::command]
pub async fn verify_backup(
    state: tauri::State<'_, AppState>,
    backup_id: String,
) -> std::result::Result<BackupVerification, String> {
    backup::verify_backup(&state.data_dir, &backup_id).map_err(|error| error.user_message())
}

/// 标记 / 取消标记「不要自动清理这份备份」。
#[tauri::command]
pub async fn set_backup_pinned(
    state: tauri::State<'_, AppState>,
    backup_id: String,
    pinned: bool,
) -> std::result::Result<BackupManifest, String> {
    backup::set_pinned(&state.data_dir, &backup_id, pinned).map_err(|error| error.user_message())
}

/// 恢复前的预览：清单、覆盖范围、和当前库的记录数差异、兼容性判断。
#[tauri::command]
pub async fn get_restore_preview(
    state: tauri::State<'_, AppState>,
    backup_id: String,
) -> std::result::Result<RestorePreview, String> {
    backup::restore_preview(&state.data_dir, &backup_id).map_err(|error| error.user_message())
}

/// 排队一次恢复。
///
/// 排队时就完成全部校验并生成回滚快照；真正的文件替换在下次启动、任何连接
/// 打开之前执行，那是唯一能做到原子替换的时刻。
#[tauri::command]
pub async fn stage_restore(
    state: tauri::State<'_, AppState>,
    backup_id: String,
) -> std::result::Result<PendingRestore, String> {
    let _guard = acquire_with_timeout(&state.data_dir, WritePurpose::Restore, LOCK_TIMEOUT)
        .map_err(|error| error.to_string())?;
    backup::stage_restore(&state.data_dir, &backup_id, env!("CARGO_PKG_VERSION"))
        .map_err(|error| error.user_message())
}

/// 当前是否有排队中的恢复。
#[tauri::command]
pub async fn get_pending_restore(
    state: tauri::State<'_, AppState>,
) -> std::result::Result<Option<PendingRestore>, String> {
    Ok(backup::pending_restore(&state.data_dir))
}

/// 取消排队中的恢复。回滚快照会保留下来，不会顺手删掉用户的备份。
#[tauri::command]
pub async fn cancel_pending_restore(
    state: tauri::State<'_, AppState>,
) -> std::result::Result<(), String> {
    backup::cancel_pending_restore(&state.data_dir).map_err(|error| error.user_message())
}
