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

    let auth_state = if auth_status.configuration_present && !auth_status.configured {
        "needs_reauth".to_string()
    } else if !auth_status.configuration_present {
        "unconfigured".to_string()
    } else {
        state.auth_state.read().await.clone()
    };
    let startup_warning = state.startup_warning.read().await.clone();
    let auth_warning = auth_status.credential_error.clone().or(state
        .auth_warning
        .read()
        .await
        .clone());
    let region_confidence = state.region_confidence.read().await.clone();

    // 官方授权可以单独撑起一个「已连接」：只连官方的账号同步照跑、首页照样有数。
    let official_store = zeppbridge_core::official::OfficialStore::new(&state.data_dir);
    let official = official_store.meta().ok().flatten();
    let official_tokens = official_store.load().ok().flatten();
    let official_ok = official_channel_available(official.as_ref(), official_tokens.as_ref());
    let data_source = match (auth_status.configured, official_ok) {
        (true, true) => "both",
        (true, false) => "legacy",
        (false, true) => "official",
        (false, false) => "none",
    }
    .to_string();
    let connection_state = connection_state_for_channels(
        auth_status.configuration_present,
        auth_status.configured,
        &auth_state,
        official.is_some(),
        official_ok,
    )
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
            needs_reauth: Some(auth_state == "needs_reauth"),
        });
    }

    Ok(AppStatus {
        configured: auth_status.configured,
        auth_configuration_present: auth_status.configuration_present,
        credential_available: auth_status.configured,
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
        replaying: zeppbridge_core::storage::replay_in_progress(),
    })
}

fn official_channel_available(
    metadata: Option<&zeppbridge_core::official::OfficialMeta>,
    tokens: Option<&zeppbridge_core::official::OfficialTokens>,
) -> bool {
    // Access-token expiry is handled by fresh_tokens when sync starts. Gating
    // sync on it would prevent a readable refresh token from ever being used.
    metadata.is_some_and(|meta| !meta.needs_reauth) && tokens.is_some()
}

fn connection_state_for_channels(
    advanced_present: bool,
    advanced_available: bool,
    advanced_state: &str,
    official_present: bool,
    official_available: bool,
) -> &'static str {
    if official_available || (advanced_available && advanced_state == "verified") {
        "connected"
    } else if advanced_available && advanced_state != "needs_reauth" {
        "configured"
    } else if advanced_present || official_present {
        "needs_reauth"
    } else {
        "unconfigured"
    }
}

#[cfg(test)]
mod tests {
    use super::{connection_state_for_channels, official_channel_available};

    #[test]
    fn expired_official_access_with_readable_refresh_still_allows_sync() {
        let metadata = zeppbridge_core::official::OfficialMeta {
            user_id: "user-a".into(),
            connected_at: 1,
            expires_at: Some(2),
            needs_reauth: false,
            nickname: None,
        };
        let tokens = zeppbridge_core::official::OfficialTokens {
            user_id: "user-a".into(),
            access_token: "expired-access".into(),
            refresh_token: Some("readable-refresh".into()),
            expires_at: Some(2),
        };
        assert!(metadata.is_expired(3));
        let available = official_channel_available(Some(&metadata), Some(&tokens));
        assert!(available);
        assert_eq!(
            connection_state_for_channels(false, false, "unconfigured", true, available),
            "connected"
        );
        assert!(!official_channel_available(Some(&metadata), None));
        let revoked = zeppbridge_core::official::OfficialMeta {
            needs_reauth: true,
            ..metadata
        };
        assert!(!official_channel_available(Some(&revoked), Some(&tokens)));
    }

    #[test]
    fn each_usable_channel_survives_the_other_channels_failure() {
        assert_eq!(
            connection_state_for_channels(true, false, "needs_reauth", true, true),
            "connected"
        );
        assert_eq!(
            connection_state_for_channels(true, true, "verified", true, false),
            "connected"
        );
        assert_eq!(
            connection_state_for_channels(true, false, "needs_reauth", false, false),
            "needs_reauth"
        );
        assert_eq!(
            connection_state_for_channels(false, false, "unconfigured", true, false),
            "needs_reauth"
        );
        assert_eq!(
            connection_state_for_channels(true, true, "configured", true, false),
            "configured"
        );
        assert_eq!(
            connection_state_for_channels(false, false, "verified", false, false),
            "unconfigured"
        );
    }
}

/// Return the current local authentication, storage, and stream status.
#[tauri::command]
pub(crate) async fn get_app_status(
    state: tauri::State<'_, AppState>,
) -> std::result::Result<AppStatus, AppError> {
    build_app_status(&state).await
}
