use chrono::Utc;
use tauri::{AppHandle, Emitter};

use crate::app_state::AppState;
use crate::ipc_types::{ui_sync_report, UiSyncReport};
use crate::models::UserPrefs;
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
