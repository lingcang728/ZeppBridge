mod ai_tasks;
mod auth;
mod backup;
mod data;
mod login;
mod official;
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

/// 短写入最多等别的写者这么久。
///
/// 同步和补拉现在只在落库的那几段拿写锁（毫秒到秒级），等一小会儿就能写上。
/// 以前这里是「一撞上就报错」：自动同步每 15 分钟要占写锁十几秒，那段时间里
/// 改一个设置、改一个运动类型都会被「另一个写入操作正在进行」挡回去。
#[cfg(not(test))]
const QUICK_WRITE_WAIT: Duration = Duration::from_secs(5);
/// 测试里只需要证明「会等、等不到就报忙」，不必真等五秒。
#[cfg(test)]
const QUICK_WRITE_WAIT: Duration = Duration::from_millis(600);

/// 为一次短写入取写锁：拿不到就在异步里隔一会儿再试，不占运行时的工作线程；
/// 等满 [`QUICK_WRITE_WAIT`] 仍拿不到（备份、重放这类长维护），照旧报可重试的忙。
pub(crate) async fn acquire_quick_write(
    data_dir: &Path,
    purpose: WritePurpose,
) -> Result<write_lock::ExclusiveWriteGuard, write_lock::WriteLockError> {
    let deadline = std::time::Instant::now() + QUICK_WRITE_WAIT;
    loop {
        match write_lock::try_acquire(data_dir, purpose) {
            Err(write_lock::WriteLockError::Busy { .. })
                if std::time::Instant::now() < deadline =>
            {
                tokio::time::sleep(Duration::from_millis(120)).await;
            }
            other => return other,
        }
    }
}

pub(crate) async fn with_write<T>(
    data_dir: &Path,
    database: &Mutex<Database>,
    purpose: WritePurpose,
    mutation: impl FnOnce(&Database) -> zeppbridge_core::models::error::Result<T>,
) -> Result<T, AppError> {
    let _write_guard = acquire_quick_write(data_dir, purpose).await?;
    let mut db = database.lock().await;
    // 启动时撞上别人的写锁、只拿到只读连接的话，锁空出来了就换成可写的。
    db.reopen_writable_if_query_only(data_dir.join("zepp.db"))?;
    Ok(mutation(&db)?)
}

/// 保存新凭据之前核对库归属（代码审查 R06）：库已经属于另一个账号就拒绝，
/// 什么也不写；空库或同一个账号就认下。旧通道与官方授权共用这一个入口。
pub(crate) async fn claim_library_for_login(
    data_dir: &Path,
    user_id: &str,
) -> Result<(), AppError> {
    let known = zeppbridge_core::storage::configured_accounts(data_dir);
    let user_id = user_id.to_string();
    spawn_independent_write(data_dir.to_path_buf(), WritePurpose::Metadata, move |db| {
        db.claim_library_for_login(&user_id, &known)
    })
    .await
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

/// 闲置的只读连接，按库路径归还复用。
///
/// 只读命令以前全挤在 `AppState::db` 那一把锁后面，启动时概览的十来个查询
/// 只能排队一个一个跑，而且是在异步运行时的线程上跑阻塞的 SQLite。WAL 下读
/// 本来就能并发：现在每个只读命令在阻塞线程池里拿一条自己的只读连接。连接
/// 留几条复用，省掉每次约 2.5 ms 的打开和冷的页缓存。闲置连接不持有任何读
/// 快照，不妨碍检查点和写入。
static READ_POOL: std::sync::Mutex<Vec<(PathBuf, Database)>> = std::sync::Mutex::new(Vec::new());
const READ_POOL_IDLE_MAX: usize = 4;

fn take_read_connection(path: &Path) -> zeppbridge_core::models::error::Result<Database> {
    let pooled = READ_POOL.lock().ok().and_then(|mut pool| {
        let index = pool.iter().position(|(p, _)| p == path)?;
        Some(pool.swap_remove(index).1)
    });
    match pooled {
        Some(db) => Ok(db),
        None => Database::open_read_only(path.to_path_buf()),
    }
}

fn return_read_connection(path: PathBuf, db: Database) {
    if let Ok(mut pool) = READ_POOL.lock() {
        if pool.len() < READ_POOL_IDLE_MAX {
            pool.push((path, db));
        }
    }
}

pub(crate) async fn spawn_independent_read<T, F>(data_dir: PathBuf, work: F) -> Result<T, AppError>
where
    T: Send + 'static,
    F: FnOnce(&Database) -> zeppbridge_core::models::error::Result<T> + Send + 'static,
{
    join_blocking(
        tokio::task::spawn_blocking(move || {
            let path = data_dir.join("zepp.db");
            let db = take_read_connection(&path)?;
            let result = work(&db);
            // 出错的连接不回池：库被恢复 / 换掉之后，旧连接会一直报同一个错。
            if result.is_ok() {
                return_read_connection(path, db);
            }
            result
        })
        .await,
    )?
    .map_err(AppError::from)
}

pub(crate) use ai_tasks::{
    ai_task_attachment_stat, ai_task_delete, ai_task_get, ai_task_list, ai_task_prepare,
    ai_task_preview, ai_task_save, ai_template_delete, ai_template_list, ai_template_save,
};
pub(crate) use auth::{clear_auth, manual_auth, verify_auth};
pub(crate) use backup::{
    cancel_pending_restore, create_manual_backup, get_pending_restore, get_restore_preview,
    list_backups, set_backup_pinned, stage_restore, verify_backup,
};
pub(crate) use data::{
    cleanup_old_data, compact_raw_payloads, get_capability_overview, get_daily_heart_rate_extremes,
    get_data_health, get_device_profile, get_device_profiles, get_health_overview,
    get_heart_rate_series, get_heart_rate_zones, get_hourly_steps, get_metric_series,
    get_recent_sleep, get_recent_workouts, get_sleep_detail, get_sleep_page, get_storage_estimate,
    get_stress_series, get_training_balance, get_unknown_workout_codes, get_user_prefs,
    get_weekly_report, get_workout_detail, get_workout_insight, get_workout_page,
    get_workout_series, get_workout_type_options, open_data_folder, prepare_ai_handoff,
    reprocess_local_data, run_database_integrity_check, save_fit_export, set_device_model_override,
    set_heart_rate_zone_preference, set_user_prefs, set_workout_code_label,
    set_workout_type_override, submit_device_model_assignment, submit_diagnostic_report,
};
pub(crate) use login::{cancel_web_login, get_login_status, start_web_login};
pub(crate) use official::{
    cancel_official_login, disconnect_official, get_official_status, start_official_login,
};
pub(crate) use status::get_app_status;
pub(crate) use sync::{
    cancel_sync, get_coverage_ledger, probe_data_capabilities, reset_coverage_ledger,
    retry_failed_backfill_chunks, start_history_backfill, start_history_sync,
    start_incremental_sync,
};

mod life_events;
pub(crate) use life_events::{delete_life_event, list_life_events, save_life_event};
