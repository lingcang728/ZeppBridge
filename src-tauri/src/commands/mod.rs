mod ai_tasks;
mod auth;
mod backup;
mod data;
mod login;
mod status;
mod sync;

use crate::ipc_error::AppError;
use std::path::{Path, PathBuf};
use std::time::Duration;
use tokio::sync::Mutex;
use zeppbridge_core::storage::write_lock::{self, WritePurpose};
use zeppbridge_core::storage::Database;

pub(crate) fn join_blocking<T>(result: Result<T, tokio::task::JoinError>) -> Result<T, AppError> {
    result.map_err(|_| AppError::new("err.storage.worker_failed", "后台数据库任务被中断"))
}

pub(crate) async fn with_write<T>(
    data_dir: &Path,
    database: &Mutex<Database>,
    purpose: WritePurpose,
    mutation: impl FnOnce(&Database) -> zeppbridge_core::models::error::Result<T>,
) -> Result<T, AppError> {
    let _write_guard = write_lock::try_acquire(data_dir, purpose)?;
    let db = database.lock().await;
    Ok(mutation(&db)?)
}

pub(crate) async fn spawn_independent_write<T, F>(
    data_dir: PathBuf,
    purpose: WritePurpose,
    work: F,
) -> Result<T, AppError>
where
    T: Send + 'static,
    F: FnOnce(&Database) -> zeppbridge_core::models::error::Result<T> + Send + 'static,
{
    join_blocking(
        tokio::task::spawn_blocking(move || -> Result<T, AppError> {
            let _replay = matches!(purpose, WritePurpose::Reprocess)
                .then(zeppbridge_core::storage::ReplayGuard::enter);
            let _compaction = matches!(purpose, WritePurpose::Compaction)
                .then(zeppbridge_core::storage::CompactionGuard::enter);
            let _write_guard =
                write_lock::acquire_with_timeout(&data_dir, purpose, Duration::from_secs(20))?;
            let db = Database::open_without_migration(data_dir.join("zepp.db"))?;
            work(&db).map_err(AppError::from)
        })
        .await,
    )?
}

pub(crate) async fn spawn_independent_read<T, F>(data_dir: PathBuf, work: F) -> Result<T, AppError>
where
    T: Send + 'static,
    F: FnOnce(&Database) -> zeppbridge_core::models::error::Result<T> + Send + 'static,
{
    join_blocking(
        tokio::task::spawn_blocking(move || {
            let db = Database::open_read_only(data_dir.join("zepp.db"))?;
            work(&db)
        })
        .await,
    )?
    .map_err(AppError::from)
}

pub(crate) use ai_tasks::{
    ai_task_attachment_stat, ai_task_delete, ai_task_get, ai_task_list, ai_task_prepare,
    ai_task_preview, ai_task_save, ai_template_delete, ai_template_list, ai_template_save,
};
pub(crate) use auth::{clear_auth, import_from_har, manual_auth, verify_auth};
pub(crate) use backup::{
    cancel_pending_restore, create_manual_backup, get_pending_restore, get_restore_preview,
    list_backups, set_backup_pinned, stage_restore, verify_backup,
};
pub(crate) use data::{
    cleanup_old_data, compact_raw_payloads, estimate_export, get_capability_overview,
    get_daily_heart_rate_extremes, get_data_health, get_device_profile, get_device_profiles,
    get_export_json, get_health_overview, get_heart_rate_series, get_heart_rate_zones,
    get_metric_series, get_recent_sleep, get_recent_workouts, get_sleep_detail, get_sleep_page,
    get_storage_estimate, get_stress_series, get_training_balance, get_unknown_workout_codes,
    get_user_prefs, get_weekly_report, get_workout_detail, get_workout_insight, get_workout_page,
    get_workout_series, get_workout_type_options, open_data_folder, prepare_ai_handoff,
    publish_ai_export, reprocess_local_data, run_database_integrity_check, save_csv_export,
    save_fit_export, save_gpx_export, save_json_export, set_device_model_override,
    set_heart_rate_zone_preference, set_user_prefs, set_workout_code_label,
    set_workout_type_override, submit_device_model_assignment, submit_diagnostic_report,
};
pub(crate) use login::{cancel_web_login, get_login_status, start_web_login};
pub(crate) use status::get_app_status;
pub(crate) use sync::{
    cancel_sync, get_coverage_ledger, probe_data_capabilities, reset_coverage_ledger,
    retry_failed_backfill_chunks, start_history_backfill, start_history_sync,
    start_incremental_sync,
};

mod life_events;
pub(crate) use life_events::{delete_life_event, list_life_events, save_life_event};
