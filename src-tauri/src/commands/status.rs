use crate::app_state::{mask_user_id, AppState};
use crate::ipc_types::{capability_views, stream_views, AppStatus, StreamStatusView};

/// Build the non-sensitive snapshot used by the dashboard and settings UI.
///
/// Authentication metadata is read without exposing the credential itself,
/// while the database lock is held only for the status query.  The resulting
/// snapshot owns all values, so no state lock remains held while it is
/// assembled or returned to Tauri.
pub(crate) async fn build_app_status(state: &AppState) -> std::result::Result<AppStatus, String> {
    let auth_status = state.auth.status().map_err(|error| error.to_string())?;

    let (statuses, freshness, (last_cloud_sync_at, last_cloud_sync_outcome), prefs, storage) = {
        let database = state.db.lock().await;
        let statuses = database
            .list_data_status()
            .map_err(|error| error.to_string())?;
        let freshness = database
            .stream_freshness()
            .map_err(|error| error.to_string())?;
        let cloud_metadata = database
            .cloud_sync_metadata()
            .map_err(|error| error.to_string())?;
        let prefs = database.user_prefs().map_err(|error| error.to_string())?;
        let storage = database
            .storage_estimate(prefs.history_sync_days, &state.data_dir)
            .map_err(|error| error.to_string())?;
        (statuses, freshness, cloud_metadata, prefs, storage)
    };

    let auth_state = state.auth_state.read().await.clone();
    let startup_warning = state.startup_warning.read().await.clone();

    let connection_state = if !auth_status.configured {
        "unconfigured"
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

    Ok(AppStatus {
        configured: auth_status.configured,
        auth_state,
        connection_state,
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
        storage: Some(storage),
    })
}

/// Return the current local authentication, storage, and stream status.
#[tauri::command]
pub(crate) async fn get_app_status(
    state: tauri::State<'_, AppState>,
) -> std::result::Result<AppStatus, String> {
    build_app_status(&state).await
}
