use chrono::Utc;
use tauri::{AppHandle, Emitter};

use crate::app_state::AppState;
use crate::ipc_error::AppError;
use crate::ipc_types::{ui_sync_report, UiSyncReport};
use crate::models::{CapabilityProbe, UserPrefs};
use crate::storage::coverage::CoverageLedger;
use crate::sync::{StreamStatus, SyncManager, SyncProgress, SyncReport};
use std::collections::BTreeMap;
use std::sync::Arc;
use std::time::Duration;
use zeppbridge_core::storage::write_lock::{self, WritePurpose};

use super::with_write;

/// Run the first 30-day sync and return per-stream progress to the UI.
///
/// The manager is taken after `sync_command_lock` so a concurrent save/clear
/// cannot leave this command writing with a credential that was just replaced.
/// A report with failed streams remains a successful IPC response so the UI
/// can render each stream's actual state; only an underlying
/// transport/database error is returned as `Err`.
pub async fn start_initial_sync(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
    days: Option<i64>,
) -> std::result::Result<UiSyncReport, AppError> {
    let days = match days {
        Some(value) => UserPrefs::clamp_days(value)
            .map_err(|message| AppError::new("err.sync.history_days_out_of_range", message))?,
        None => {
            let database = state.db.lock().await;
            database
                .user_prefs()
                .map(|prefs| prefs.history_sync_days)
                .unwrap_or(UserPrefs::DEFAULT_HISTORY_SYNC_DAYS)
        }
    };
    run_sync(&app, &state, Some(days)).await
}

#[tauri::command]
pub async fn start_history_sync(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
    days: i64,
) -> std::result::Result<UiSyncReport, AppError> {
    start_initial_sync(app, state, Some(days)).await
}

/// Run the overlap-window incremental sync and return per-stream progress.
#[tauri::command]
pub async fn start_incremental_sync(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
) -> std::result::Result<UiSyncReport, AppError> {
    if state.auth_state.read().await.as_str() != "verified" {
        return Err(AppError::new(
            "err.sync.not_verified",
            "请先完成连接验证，再同步最近数据",
        ));
    }
    run_sync(&app, &state, None).await
}

/// Probe the optional Zepp event streams and report what answers.
///
/// This exists because "another tool can read HRV, so ZeppBridge should too"
/// is not a fact about *this* account: stream availability varies by device
/// and region, and the endpoint offers no discovery call. The probe makes a
/// handful of requests and reports status plus field names. It saves only
/// probe metadata so the capability board can reflect the same result.
#[tauri::command]
pub async fn probe_data_capabilities(
    state: tauri::State<'_, AppState>,
) -> std::result::Result<Vec<CapabilityProbe>, AppError> {
    let _command_guard = state.sync_command_lock.lock().await;
    if state.auth_state.read().await.as_str() != "verified" {
        return Err(AppError::new(
            "err.sync.not_verified_probe",
            "请先完成连接验证，再探测数据能力",
        ));
    }
    let manager = require_manager(&state).await?;
    manager.probe_capabilities().await.map_err(AppError::from)
}

/// 完整历史补拉。
///
/// 和常规同步不是一回事：按自然月分块、逐块记账、可中断续传，而且**不做清理**。
/// 每次调用处理有限块数并返回账本，界面据此显示进度并决定是否继续，
/// 于是一次几年的补拉不会变成一个无法取消的长任务。
#[tauri::command]
pub async fn start_history_backfill(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
    from_date: String,
    max_chunks: Option<usize>,
) -> std::result::Result<CoverageLedger, AppError> {
    if state.auth_state.read().await.as_str() != "verified" {
        return Err(AppError::new(
            "err.sync.not_verified_backfill",
            "请先完成连接验证，再补拉历史",
        ));
    }
    let from = chrono::NaiveDate::parse_from_str(from_date.trim(), "%Y-%m-%d").map_err(|_| {
        AppError::new(
            "err.backfill.bad_start_date",
            "补拉起点日期无效，需要 YYYY-MM-DD",
        )
    })?;
    let to = Utc::now().date_naive();
    if from > to {
        return Err(AppError::new(
            "err.backfill.start_in_future",
            "补拉起点不能晚于今天",
        ));
    }
    // 没有下限的话，一个异常早的起点（哪怕只是笔误）会让 `plan_backfill`
    // 按自然月对六条流展开成几十万个同步块，卡住整个 app（同时占着写锁）。
    // 和其它所有时间窗口一样，上限是 `MAX_HISTORY_SYNC_DAYS`：再早 Zepp
    // 也不会有记录。
    if (to - from).num_days() > UserPrefs::MAX_HISTORY_SYNC_DAYS {
        return Err(AppError::new(
            "err.backfill.bad_start_date",
            format!(
                "补拉起点太早：最多只能补拉最近 {} 天",
                UserPrefs::MAX_HISTORY_SYNC_DAYS
            ),
        ));
    }
    let _command_guard = state.sync_command_lock.lock().await;
    if let Some(kind) = local_maintenance_deferred() {
        return Err(deferred_app_error(kind));
    }
    let manager = require_manager(&state).await?;
    match manager
        .history_backfill(from, to, max_chunks.unwrap_or(24), |progress| {
            emit_sync_progress(&app, progress)
        })
        .await
    {
        Ok(ledger) => Ok(ledger),
        Err(error) if error.is_busy() => Err(deferred_app_error(busy_deferred_kind())),
        Err(error) => Err(error.into()),
    }
}

/// 当前的历史覆盖账本。
#[tauri::command]
pub async fn get_coverage_ledger(
    state: tauri::State<'_, AppState>,
) -> std::result::Result<CoverageLedger, AppError> {
    let db = state.db.lock().await;
    db.coverage_ledger().map_err(AppError::from)
}

/// 清空账本，重新规划一次补拉。
///
/// 只清账本，不删任何已经写进本机库的数据。
#[tauri::command]
pub async fn reset_coverage_ledger(
    state: tauri::State<'_, AppState>,
) -> std::result::Result<CoverageLedger, AppError> {
    let _command_guard = state.sync_command_lock.lock().await;
    with_write(&state.data_dir, &state.db, WritePurpose::Metadata, |db| {
        db.reset_coverage_ledger()?;
        db.coverage_ledger()
    })
    .await
}

/// 让失败的块重新进入自动补拉队列。
///
/// 和「清空账本」的区别很重要：这个动作只碰 `failed`，已经写入和云端确认
/// 为空的块原样不动。用户为了重试一个失败的月份而不得不清掉整个账本、
/// 把几年历史重拉一遍——那是上一版逼出来的操作，不该继续存在。
#[tauri::command]
pub async fn retry_failed_backfill_chunks(
    state: tauri::State<'_, AppState>,
) -> std::result::Result<CoverageLedger, AppError> {
    let _command_guard = state.sync_command_lock.lock().await;
    with_write(&state.data_dir, &state.db, WritePurpose::Metadata, |db| {
        db.reset_failed_backfill_chunks()?;
        db.coverage_ledger()
    })
    .await
}

#[tauri::command]
pub async fn cancel_sync(state: tauri::State<'_, AppState>) -> std::result::Result<(), AppError> {
    if let Some(manager) = state.sync.read().await.clone() {
        manager.request_cancel();
    }
    Ok(())
}

async fn require_manager(state: &AppState) -> std::result::Result<Arc<SyncManager>, AppError> {
    state
        .sync
        .read()
        .await
        .clone()
        .ok_or_else(|| AppError::new("err.sync.not_connected", "尚未连接 Zepp，请先完成连接"))
}

async fn run_sync(
    app: &AppHandle,
    state: &AppState,
    history_days: Option<i64>,
) -> std::result::Result<UiSyncReport, AppError> {
    let _command_guard = state.sync_command_lock.lock().await;
    // Re-read after the lock: save/clear may have swapped the manager while
    // this command waited, and the handle cloned beforehand would keep writing
    // with the old credential.
    let manager = require_manager(state).await?;
    // A `NORMALIZER_REVISION` bump makes the next launch replay every stored
    // raw payload, which writes in bulk for as long as a quarter of an hour on
    // a large library. A sync starting in the middle of that used to lose the
    // race for SQLite's write lock and surface as "workouts 失败：本地数据库
    // 暂时不可用" — alarming wording for a library that is busy healing
    // itself and has lost nothing. Standing aside and coming back is both
    // truthful and what the user would want.
    // 装上新版本后的第一次启动会在后台压缩存量报文，而应用启动时又会自动同步
    // 一次——两件事同时开始，同步抢不到写锁，用户看到的是一行红字
    // 「另一个写入操作正在进行」。压缩是我们自己安排的、正常的一次性维护，
    // 不该让它把用户吓一跳。和重放一样让路重试。
    if let Some(kind) = local_maintenance_deferred() {
        return Ok(deferred_ui_report(kind));
    }
    let before = {
        let database = state.db.lock().await;
        database.newest_samples()?
    };
    let started_at = Utc::now().to_rfc3339();
    let report_result = if let Some(days) = history_days {
        manager
            .history_sync_report_with_progress(days, |progress| emit_sync_progress(app, progress))
            .await
    } else {
        manager
            .incremental_sync_report_with_progress(|progress| emit_sync_progress(app, progress))
            .await
    };
    let finished_at = Utc::now().to_rfc3339();
    let report = match report_result {
        Ok(report) => report,
        Err(error) if error.is_busy() => {
            return Ok(deferred_ui_report(busy_deferred_kind()));
        }
        Err(error) if error.is_cancelled() => {
            // A user-initiated cancellation is a deliberate terminal outcome,
            // not a failure: report it as `cancelled` so the UI can show a
            // neutral banner instead of a red error.
            record_cloud_sync_locked(state, &finished_at, "cancelled", 0).await?;
            return Ok(ui_sync_report(
                SyncReport {
                    success: false,
                    core_ok: false,
                    streams: Vec::new(),
                    records_written: 0,
                    message: Some("同步已取消".into()),
                },
                started_at,
                finished_at,
                "cancelled".to_string(),
                &BTreeMap::new(),
            ));
        }
        Err(error) => {
            record_cloud_sync_locked(state, &finished_at, "failed", 0).await?;
            if error.needs_reauth() {
                *state.auth_state.write().await = "needs_reauth".to_string();
            }
            return Err(error.into());
        }
    };
    let (freshness, after) = {
        let database = state.db.lock().await;
        let freshness = database.stream_freshness()?;
        let after = freshness
            .iter()
            .map(|(stream, value)| (stream.clone(), value.newest_sample_at.clone()))
            .collect::<BTreeMap<_, _>>();
        (freshness, after)
    };
    let outcome = classify_outcome(&report, &before, &after);
    record_cloud_sync_locked(state, &finished_at, outcome, report.records_written).await?;

    if report.streams.iter().any(|stream| stream.needs_reauth) {
        *state.auth_state.write().await = "needs_reauth".to_string();
    } else if report.core_ok {
        // 主干数据流通了就说明这份凭据是好的。一条支流（sleep / hrv……）失败
        // 不代表登录状态有问题，不该把用户推回「需要重新认证」。
        *state.auth_state.write().await = "verified".to_string();
        // A successful sync proves the credential works: clear the transient
        // verify/auth warning so the UI never shows "已连接" next to a stale
        // red error banner (startup migration notices are intentionally kept).
        *state.auth_warning.write().await = None;
    }

    Ok(ui_sync_report(
        report,
        started_at,
        finished_at,
        outcome.to_string(),
        &freshness,
    ))
}

/// 把一次同步归成界面上的一个词。
///
/// 这里以前和 `SyncManager::sync_report` 各写了一遍「只有三个核心流算数」，
/// 于是 sleep / hrv / wellness / workout_detail 真的取失败时，两边一致地
/// 给出「已更新」。现在判据只有一条：**任何真实 `Failed` 都不能是绿的。**
///
/// `Unavailable` / `Unverified` 依旧中性——那是这块表没有这个能力，不是错误。
fn classify_outcome(
    report: &SyncReport,
    before: &BTreeMap<String, Option<String>>,
    after: &BTreeMap<String, Option<String>>,
) -> &'static str {
    let any_failed = report
        .streams
        .iter()
        .any(|stream| stream.status == StreamStatus::Failed);
    let has_success = report
        .streams
        .iter()
        .any(|stream| stream.status == StreamStatus::Success);
    // 一条都没成功（或者根本没有流，例如上游整个挂掉）时才叫 failed。
    if (any_failed || !report.success) && !has_success {
        return "failed";
    }
    // 有成功也有失败：partial。少了一条流这件事必须让用户看见。
    if any_failed {
        return "partial";
    }
    if samples_advanced(before, after) {
        "updated"
    } else {
        "no_new_data"
    }
}

fn samples_advanced(
    before: &BTreeMap<String, Option<String>>,
    after: &BTreeMap<String, Option<String>>,
) -> bool {
    after
        .iter()
        .any(|(stream, newest)| match (before.get(stream), newest) {
            (Some(Some(previous)), Some(current)) => current > previous,
            (_, Some(_)) => true,
            _ => false,
        })
}

fn emit_sync_progress(app: &AppHandle, progress: SyncProgress) {
    let _ = app.emit("sync://progress", progress);
}

async fn record_cloud_sync_locked(
    state: &AppState,
    finished_at: &str,
    outcome: &str,
    records_written: i64,
) -> std::result::Result<(), AppError> {
    let _write_guard = write_lock::acquire_with_timeout(
        &state.data_dir,
        WritePurpose::Metadata,
        Duration::from_secs(10),
    )?;
    let database = state.db.lock().await;
    database
        .record_cloud_sync(finished_at, outcome, records_written)
        .map_err(AppError::from)
}

fn local_maintenance_deferred() -> Option<(&'static str, &'static str)> {
    if crate::storage::compaction_in_progress() {
        Some((
            "err.sync.deferred_compaction",
            "正在压缩历史报文以节省磁盘空间，本次云端同步稍后自动重试",
        ))
    } else if crate::storage::replay_in_progress() {
        Some((
            "err.sync.deferred_replay",
            "正在用本地原始报文重建派生数据，本次云端同步稍后自动重试",
        ))
    } else {
        None
    }
}

fn busy_deferred_kind() -> (&'static str, &'static str) {
    local_maintenance_deferred().unwrap_or((
        "err.sync.deferred_busy",
        "另一个写入操作正在进行，本次云端同步稍后自动重试",
    ))
}

fn deferred_app_error(kind: (&'static str, &'static str)) -> AppError {
    AppError::new(kind.0, kind.1)
}

fn deferred_ui_report(kind: (&'static str, &'static str)) -> UiSyncReport {
    let (code, message) = kind;
    let now = Utc::now().to_rfc3339();
    let mut deferred = ui_sync_report(
        SyncReport {
            success: false,
            core_ok: false,
            streams: Vec::new(),
            records_written: 0,
            message: Some(message.into()),
        },
        now.clone(),
        now,
        "deferred".to_string(),
        &BTreeMap::new(),
    );
    deferred.message_code = Some(code.to_string());
    deferred
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::CapabilityStatus;
    use crate::sync::{is_core_stream, StreamReport};

    fn report(statuses: &[StreamStatus], success: bool) -> SyncReport {
        SyncReport {
            success,
            core_ok: success,
            streams: statuses
                .iter()
                .enumerate()
                .map(|(index, status)| StreamReport {
                    stream: format!("stream-{index}"),
                    status: *status,
                    records_written: 0,
                    raw_records: 0,
                    capability: CapabilityStatus::Verified,
                    needs_reauth: false,
                    message: None,
                })
                .collect(),
            records_written: 0,
            message: None,
        }
    }

    #[test]
    fn classifies_new_samples_and_successful_empty_cloud_response() {
        let before = BTreeMap::from([("heart_rate".into(), Some("2026-08-12T10:00:00Z".into()))]);
        let unchanged = before.clone();
        let advanced = BTreeMap::from([("heart_rate".into(), Some("2026-08-12T10:01:00Z".into()))]);
        let success = report(&[StreamStatus::Success], true);

        assert_eq!(
            classify_outcome(&success, &before, &unchanged),
            "no_new_data"
        );
        assert_eq!(classify_outcome(&success, &before, &advanced), "updated");
    }

    /// 只给流起名字的报告构造器。`report()` 生成的是 `stream-0` / `stream-1`，
    /// 而这条回归测试要说的恰恰是「哪条流失败」这件事。
    fn named_report(streams: &[(&str, StreamStatus)]) -> SyncReport {
        let any_failed = streams
            .iter()
            .any(|(_, status)| *status == StreamStatus::Failed);
        let core_failed = streams
            .iter()
            .any(|(name, status)| is_core_stream(name) && *status == StreamStatus::Failed);
        SyncReport {
            success: !any_failed,
            core_ok: !core_failed,
            streams: streams
                .iter()
                .map(|(name, status)| StreamReport {
                    stream: (*name).to_string(),
                    status: *status,
                    records_written: 0,
                    raw_records: 0,
                    capability: CapabilityStatus::Verified,
                    needs_reauth: false,
                    message: None,
                })
                .collect(),
            records_written: 0,
            message: None,
        }
    }

    /// 这条测试钉住的就是那个「假绿」：心率成功、睡眠**真的失败**，
    /// 界面不许说「已更新」。
    #[test]
    fn an_optional_stream_failure_is_partial_not_success() {
        let before = BTreeMap::from([("heart_rate".into(), Some("2026-08-12T10:00:00Z".into()))]);
        let advanced = BTreeMap::from([("heart_rate".into(), Some("2026-08-12T10:01:00Z".into()))]);
        let mixed = named_report(&[
            ("heart_rate", StreamStatus::Success),
            ("sleep", StreamStatus::Failed),
        ]);

        assert!(!mixed.success, "支流失败时整体不能算成功");
        assert!(mixed.core_ok, "核心流没失败，凭据不该被判成有问题");
        assert_eq!(classify_outcome(&mixed, &before, &advanced), "partial");
        // 样本没前进也一样：不能退回 `no_new_data` 把失败藏起来。
        assert_eq!(classify_outcome(&mixed, &before, &before), "partial");
    }

    /// 反过来：设备没有这个能力不是失败，不许把整次同步染成 partial。
    #[test]
    fn an_unavailable_stream_stays_neutral() {
        let samples = BTreeMap::new();
        let report = named_report(&[
            ("heart_rate", StreamStatus::Success),
            ("hrv", StreamStatus::Unavailable),
            ("wellness", StreamStatus::Unverified),
        ]);
        assert!(report.success);
        assert_eq!(classify_outcome(&report, &samples, &samples), "no_new_data");
    }

    #[test]
    fn classifies_partial_and_failed_reports() {
        let samples = BTreeMap::new();
        assert_eq!(
            classify_outcome(
                &report(&[StreamStatus::Success, StreamStatus::Unavailable], true),
                &samples,
                &samples,
            ),
            "no_new_data"
        );
        assert_eq!(
            classify_outcome(
                &report(&[StreamStatus::Failed, StreamStatus::Unavailable], false),
                &samples,
                &samples,
            ),
            "failed"
        );
    }

    #[test]
    fn a_busy_writer_is_deferred_not_a_failed_red_bar() {
        let report = deferred_ui_report((
            "err.sync.deferred_busy",
            "另一个写入操作正在进行，本次云端同步稍后自动重试",
        ));
        assert_eq!(report.outcome, "deferred");
        assert_eq!(
            report.message_code.as_deref(),
            Some("err.sync.deferred_busy")
        );
        assert!(!report.success);
        assert_eq!(report.total_records, 0);
    }
}
