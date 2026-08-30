use chrono::Utc;
use tauri::{AppHandle, Emitter};

use crate::app_state::AppState;
use crate::ipc_types::{ui_sync_report, UiSyncReport};
use crate::models::{CapabilityProbe, UserPrefs};
use crate::storage::coverage::CoverageLedger;
use crate::sync::{StreamStatus, SyncManager, SyncProgress, SyncReport};
use std::collections::BTreeMap;
use std::sync::Arc;

/// Run the first 30-day sync and return per-stream progress to the UI.
///
/// The manager handle is cloned while holding the state read lock, then the
/// guard is dropped before any network or database work begins.  A report with
/// failed streams remains a successful IPC response so the UI can render each
/// stream's actual state; only an underlying transport/database error is
/// returned as `Err`.
#[tauri::command]
pub async fn start_initial_sync(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
    days: Option<i64>,
) -> std::result::Result<UiSyncReport, String> {
    let manager = require_manager(&state).await?;
    let days = match days {
        Some(value) => UserPrefs::clamp_days(value)?,
        None => {
            let database = state.db.lock().await;
            database
                .user_prefs()
                .map(|prefs| prefs.history_sync_days)
                .unwrap_or(UserPrefs::DEFAULT_HISTORY_SYNC_DAYS)
        }
    };
    run_sync(&app, &state, manager, Some(days)).await
}

#[tauri::command]
pub async fn start_history_sync(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
    days: i64,
) -> std::result::Result<UiSyncReport, String> {
    start_initial_sync(app, state, Some(days)).await
}

/// Run the overlap-window incremental sync and return per-stream progress.
#[tauri::command]
pub async fn start_incremental_sync(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
) -> std::result::Result<UiSyncReport, String> {
    if state.auth_state.read().await.as_str() != "verified" {
        return Err("请先完成连接验证，再同步最近数据".to_string());
    }
    let manager = require_manager(&state).await?;
    run_sync(&app, &state, manager, None).await
}

/// Probe the optional Zepp event streams and report what answers.
///
/// This exists because "another tool can read HRV, so ZeppBridge should too"
/// is not a fact about *this* account: stream availability varies by device
/// and region, and the endpoint offers no discovery call. The probe makes a
/// handful of one-day requests and reports status plus field names, writing
/// nothing to the database and logging nothing.
#[tauri::command]
pub async fn probe_data_capabilities(
    state: tauri::State<'_, AppState>,
) -> std::result::Result<Vec<CapabilityProbe>, String> {
    if state.auth_state.read().await.as_str() != "verified" {
        return Err("请先完成连接验证，再探测数据能力".to_string());
    }
    let manager = require_manager(&state).await?;
    Ok(manager.probe_capabilities().await)
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
) -> std::result::Result<CoverageLedger, String> {
    if state.auth_state.read().await.as_str() != "verified" {
        return Err("请先完成连接验证，再补拉历史".to_string());
    }
    let manager = require_manager(&state).await?;
    let from = chrono::NaiveDate::parse_from_str(from_date.trim(), "%Y-%m-%d")
        .map_err(|_| "补拉起点日期无效，需要 YYYY-MM-DD".to_string())?;
    let to = Utc::now().date_naive();
    if from > to {
        return Err("补拉起点不能晚于今天".to_string());
    }
    let _command_guard = state.sync_command_lock.lock().await;
    manager
        .history_backfill(from, to, max_chunks.unwrap_or(24), |progress| {
            emit_sync_progress(&app, progress)
        })
        .await
        .map_err(|error| error.user_message())
}

/// 当前的历史覆盖账本。
#[tauri::command]
pub async fn get_coverage_ledger(
    state: tauri::State<'_, AppState>,
) -> std::result::Result<CoverageLedger, String> {
    let db = state.db.lock().await;
    db.coverage_ledger().map_err(|error| error.user_message())
}

/// 清空账本，重新规划一次补拉。
///
/// 只清账本，不删任何已经写进本机库的数据。
#[tauri::command]
pub async fn reset_coverage_ledger(
    state: tauri::State<'_, AppState>,
) -> std::result::Result<CoverageLedger, String> {
    let db = state.db.lock().await;
    db.reset_coverage_ledger()
        .map_err(|error| error.user_message())?;
    db.coverage_ledger().map_err(|error| error.user_message())
}

#[tauri::command]
pub async fn cancel_sync(state: tauri::State<'_, AppState>) -> std::result::Result<(), String> {
    if let Some(manager) = state.sync.read().await.clone() {
        manager.request_cancel();
    }
    Ok(())
}

async fn require_manager(state: &AppState) -> std::result::Result<Arc<SyncManager>, String> {
    state
        .sync
        .read()
        .await
        .clone()
        .ok_or_else(|| "尚未连接 Zepp，请先完成连接".to_string())
}

async fn run_sync(
    app: &AppHandle,
    state: &AppState,
    manager: Arc<SyncManager>,
    history_days: Option<i64>,
) -> std::result::Result<UiSyncReport, String> {
    let _command_guard = state.sync_command_lock.lock().await;
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
    if crate::storage::replay_in_progress() || crate::storage::compaction_in_progress() {
        let message = if crate::storage::compaction_in_progress() {
            "正在压缩历史报文以节省磁盘空间，本次云端同步稍后自动重试"
        } else {
            "正在用本地原始报文重建派生数据，本次云端同步稍后自动重试"
        };
        let now = Utc::now().to_rfc3339();
        return Ok(ui_sync_report(
            SyncReport {
                success: false,
                streams: Vec::new(),
                records_written: 0,
                message: Some(message.into()),
            },
            now.clone(),
            now,
            "deferred".to_string(),
            &BTreeMap::new(),
        ));
    }
    let before = {
        let database = state.db.lock().await;
        database
            .newest_samples()
            .map_err(|error| error.to_string())?
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
        Err(error) if error.is_cancelled() => {
            // A user-initiated cancellation is a deliberate terminal outcome,
            // not a failure: report it as `cancelled` so the UI can show a
            // neutral banner instead of a red error.
            let database = state.db.lock().await;
            database
                .record_cloud_sync(&finished_at, "cancelled")
                .map_err(|record_error| record_error.to_string())?;
            return Ok(ui_sync_report(
                SyncReport {
                    success: false,
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
            let database = state.db.lock().await;
            database
                .record_cloud_sync(&finished_at, "failed")
                .map_err(|record_error| record_error.to_string())?;
            if error.needs_reauth() {
                *state.auth_state.write().await = "needs_reauth".to_string();
            }
            return Err(error.user_message());
        }
    };
    let (freshness, after) = {
        let database = state.db.lock().await;
        let freshness = database
            .stream_freshness()
            .map_err(|error| error.to_string())?;
        let after = freshness
            .iter()
            .map(|(stream, value)| (stream.clone(), value.newest_sample_at.clone()))
            .collect::<BTreeMap<_, _>>();
        (freshness, after)
    };
    let outcome = classify_outcome(&report, &before, &after);
    {
        let database = state.db.lock().await;
        database
            .record_cloud_sync(&finished_at, outcome)
            .map_err(|error| error.to_string())?;
    }

    if report.streams.iter().any(|stream| stream.needs_reauth) {
        *state.auth_state.write().await = "needs_reauth".to_string();
    } else if report.success {
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

fn classify_outcome(
    report: &SyncReport,
    before: &BTreeMap<String, Option<String>>,
    after: &BTreeMap<String, Option<String>>,
) -> &'static str {
    let core_failed = report.streams.iter().any(|stream| {
        matches!(
            stream.stream.as_str(),
            "heart_rate" | "daily_summary" | "workouts"
        ) && stream.status == StreamStatus::Failed
    });
    let has_success = report
        .streams
        .iter()
        .any(|stream| stream.status == StreamStatus::Success);
    if (core_failed || !report.success) && !has_success {
        return "failed";
    }
    if core_failed {
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::CapabilityStatus;
    use crate::sync::StreamReport;

    fn report(statuses: &[StreamStatus], success: bool) -> SyncReport {
        SyncReport {
            success,
            streams: statuses
                .iter()
                .enumerate()
                .map(|(index, status)| StreamReport {
                    stream: format!("stream-{index}"),
                    status: status.clone(),
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
}
