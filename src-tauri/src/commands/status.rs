use super::spawn_independent_read;
use crate::app_state::{mask_user_id, AppState};
use crate::ipc_error::AppError;
use crate::ipc_types::{capability_views, stream_views, AppStatus, StreamStatusView};
use chrono::Local;

/// Build the non-sensitive snapshot used by the dashboard and settings UI.
///
/// Authentication metadata is read without exposing the credential itself.
/// The database side runs on an independent read-only connection
/// (`spawn_independent_read`) instead of `state.db`, so a long write — sync,
/// migration, compaction — never stalls the status snapshot.  The resulting
/// snapshot owns all values, so no state lock remains held while it is
/// assembled or returned to Tauri.
pub(crate) async fn build_app_status(state: &AppState) -> std::result::Result<AppStatus, AppError> {
    let auth_status = state.auth.status()?;

    let data_dir = state.data_dir.clone();
    let storage_dir = data_dir.clone();
    let today = Local::now().date_naive();
    let (
        statuses,
        freshness,
        (last_cloud_sync_at, last_cloud_sync_outcome),
        prefs,
        storage,
        coverage,
        full_refresh_due,
    ) = spawn_independent_read(data_dir, move |db| {
        let statuses = db.list_data_status()?;
        let freshness = db.stream_freshness()?;
        let cloud_metadata = db.cloud_sync_metadata()?;
        let prefs = db.user_prefs()?;
        let storage = db.storage_estimate(prefs.history_sync_days, &storage_dir)?;
        let coverage = db.local_coverage(today)?;
        let full_refresh_due = db.full_window_refresh_due(chrono::Utc::now())?;
        Ok((
            statuses,
            freshness,
            cloud_metadata,
            prefs,
            storage,
            coverage,
            full_refresh_due,
        ))
    })
    .await?;

    let auth_state = state.auth_state.read().await.clone();
    let startup_warning = state.startup_warning.read().await.clone();
    let auth_warning = state.auth_warning.read().await.clone();
    let region_confidence = state.region_confidence.read().await.clone();

    // 官方授权可以单独撑起一个「已连接」：只连官方的账号同步照跑、首页照样有数。
    let official = zeppbridge_core::official::OfficialStore::new(&state.data_dir)
        .meta()
        .ok()
        .flatten();
    let official_ok = official.as_ref().is_some_and(|meta| !meta.needs_reauth);
    let data_source = match (auth_status.configured, official_ok) {
        (true, true) => "both",
        (true, false) => "legacy",
        (false, true) => "official",
        (false, false) => "none",
    }
    .to_string();
    let connection_state = if !auth_status.configured {
        match official {
            Some(meta) if meta.needs_reauth => "needs_reauth",
            Some(_) => "connected",
            None => "unconfigured",
        }
    } else if auth_state == "needs_reauth" {
        "needs_reauth"
    } else if auth_state == "verified" {
        "connected"
    } else {
        "configured"
    }
    .to_string();

    let mut streams = stream_views(&statuses, &freshness);
    if let Some(warning) = startup_warning {
        streams.push(StreamStatusView {
            stream: "startup".to_string(),
            status: "error".to_string(),
            records: None,
            last_sync: None,
            last_cloud_sync_at: None,
            newest_sample_at: None,
            message: Some(warning),
            needs_reauth: Some(connection_state == "needs_reauth"),
        });
    }
    if let Some(warning) = auth_warning {
        streams.push(StreamStatusView {
            stream: "auth".to_string(),
            status: "error".to_string(),
            records: None,
            last_sync: None,
            last_cloud_sync_at: None,
            newest_sample_at: None,
            message: Some(warning),
            needs_reauth: Some(connection_state == "needs_reauth"),
        });
    }

    Ok(AppStatus {
        configured: auth_status.configured,
        auth_state,
        connection_state,
        data_source,
        masked_user_id: auth_status.user_id.as_deref().map(mask_user_id),
        region_host: auth_status.region_host,
        last_sync: last_cloud_sync_at.clone(),
        last_cloud_sync_at,
        last_cloud_sync_outcome,
        streams,
        capabilities: capability_views(&statuses),
        database_path: Some(
            state
                .data_dir
                .join("zepp.db")
                .to_string_lossy()
                .into_owned(),
        ),
        retention_days: prefs.retention_days,
        history_sync_days: prefs.history_sync_days,
        incremental_sync_days: zeppbridge_core::contract::INCREMENTAL_SYNC_DAYS,
        auto_sync_days: zeppbridge_core::sync::quick_window_days(full_refresh_due),
        storage: Some(storage),
        coverage,
        region_confidence,
        compacting: zeppbridge_core::storage::compaction_in_progress(),
    })
}

/// Return the current local authentication, storage, and stream status.
#[tauri::command]
pub(crate) async fn get_app_status(
    state: tauri::State<'_, AppState>,
) -> std::result::Result<AppStatus, AppError> {
    build_app_status(&state).await
}
