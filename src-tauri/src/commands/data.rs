use crate::app_state::AppState;
use crate::ipc_types::CleanupResult;
use crate::connectors::ZeppConnector;
use crate::models::{
    DailyPoint, DeviceProfile, ExportResult, ExportSelection, HealthOverview, HeartRatePoint,
    SleepSession, StorageEstimate, UserPrefs, Workout,
};
use chrono::Utc;
use std::path::PathBuf;

/// Return the latest health metrics persisted in the local database.
#[tauri::command]
pub async fn get_health_overview(
    state: tauri::State<'_, AppState>,
) -> std::result::Result<HealthOverview, String> {
    let result = {
        let db = state.db.lock().await;
        db.get_health_overview().map_err(|error| error.to_string())
    };
    result
}

/// Return the most recent persisted sleep sessions.
#[tauri::command]
pub async fn get_recent_sleep(
    state: tauri::State<'_, AppState>,
    limit: usize,
) -> std::result::Result<Vec<SleepSession>, String> {
    let limit = limit.clamp(1, 500);
    let result = {
        let db = state.db.lock().await;
        db.get_recent_sleep_sessions(limit)
            .map_err(|error| error.to_string())
    };
    result
}

/// Return one persisted sleep session by its stable source identifier.
#[tauri::command]
pub async fn get_sleep_detail(
    state: tauri::State<'_, AppState>,
    sleep_id: String,
) -> std::result::Result<Option<SleepSession>, String> {
    let db = state.db.lock().await;
    db.get_sleep_detail(&sleep_id)
        .map_err(|error| error.to_string())
}

/// Return the most recent persisted workouts.
#[tauri::command]
pub async fn get_recent_workouts(
    state: tauri::State<'_, AppState>,
    limit: usize,
) -> std::result::Result<Vec<Workout>, String> {
    let limit = limit.clamp(1, 500);
    let result = {
        let db = state.db.lock().await;
        db.get_recent_workouts(limit)
            .map_err(|error| error.to_string())
    };
    result
}

/// Return one persisted workout by its stable source identifier.
#[tauri::command]
pub async fn get_workout_detail(
    state: tauri::State<'_, AppState>,
    workout_id: String,
) -> std::result::Result<Option<Workout>, String> {
    let db = state.db.lock().await;
    db.get_workout_detail(&workout_id)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn get_heart_rate_series(
    state: tauri::State<'_, AppState>,
    hours: i64,
) -> std::result::Result<Vec<HeartRatePoint>, String> {
    let db = state.db.lock().await;
    db.heart_rate_series(hours)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn get_training_load_series(
    state: tauri::State<'_, AppState>,
    days: i64,
) -> std::result::Result<Vec<DailyPoint>, String> {
    let db = state.db.lock().await;
    db.training_load_series(days)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn get_storage_estimate(
    state: tauri::State<'_, AppState>,
    days: i64,
) -> std::result::Result<StorageEstimate, String> {
    let db = state.db.lock().await;
    db.storage_estimate(days, &state.data_dir)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn set_user_prefs(
    state: tauri::State<'_, AppState>,
    retention_days: i64,
    history_sync_days: i64,
) -> std::result::Result<UserPrefs, String> {
    let db = state.db.lock().await;
    db.set_user_prefs(&UserPrefs {
        retention_days,
        history_sync_days,
    })
    .map_err(|error| error.to_string())
}

/// Remove records older than the requested retention window.
#[tauri::command]
pub async fn cleanup_old_data(
    state: tauri::State<'_, AppState>,
    days: i64,
) -> std::result::Result<CleanupResult, String> {
    if !(1..=365).contains(&days) {
        return Err("保留天数必须在 1 到 365 天之间".to_string());
    }

    let result = {
        let db = state.db.lock().await;
        db.cleanup_old_data(days).map_err(|error| error.to_string())
    };
    result?;

    Ok(CleanupResult {
        days,
        message: Some(format!("已清理 {} 天之前的数据", days)),
    })
}

#[tauri::command]
pub async fn reprocess_local_data(
    state: tauri::State<'_, AppState>,
) -> std::result::Result<serde_json::Value, String> {
    let streams = {
        let db = state.db.lock().await;
        db.reprocess_raw_records()
            .map_err(|error| error.to_string())?
    };
    let total_records: i64 = streams.values().sum();
    Ok(serde_json::json!({
        "total_records": total_records,
        "streams": streams,
        "message": "已使用新版解析器重新处理本地原始响应"
    }))
}

#[tauri::command]
pub async fn get_export_json(
    state: tauri::State<'_, AppState>,
    selection: ExportSelection,
) -> std::result::Result<String, String> {
    let result = {
        let db = state.db.lock().await;
        db.build_ai_export(&selection)
            .map_err(|error| error.to_string())
    }?;
    Ok(result.0)
}

#[tauri::command]
pub async fn save_json_export(
    state: tauri::State<'_, AppState>,
    selection: ExportSelection,
    path: String,
) -> std::result::Result<ExportResult, String> {
    let path = validate_json_export_path(&path)?;
    write_export(&state, selection, Some(path), false).await
}

#[tauri::command]
pub async fn publish_ai_export(
    state: tauri::State<'_, AppState>,
    selection: ExportSelection,
) -> std::result::Result<ExportResult, String> {
    write_export(&state, selection, None, true).await
}

async fn write_export(
    state: &AppState,
    selection: ExportSelection,
    selected_path: Option<PathBuf>,
    stable_ai_feed: bool,
) -> std::result::Result<ExportResult, String> {
    let (encoded, record_count) = {
        let db = state.db.lock().await;
        db.build_ai_export(&selection)
            .map_err(|error| error.to_string())?
    };
    let generated_at = Utc::now();
    let path = if let Some(path) = selected_path {
        path
    } else {
        let export_dir = state.data_dir.join("exports");
        std::fs::create_dir_all(&export_dir)
            .map_err(|error| format!("创建导出目录失败: {error}"))?;
        let file_name = if stable_ai_feed {
            "zeppbridge-ai-feed.json".to_string()
        } else {
            format!(
                "zeppbridge-{}-{}-{}.json",
                selection.start_date,
                selection.end_date,
                generated_at.format("%Y%m%d-%H%M%S")
            )
        };
        export_dir.join(file_name)
    };
    std::fs::write(&path, encoded.as_bytes())
        .map_err(|error| format!("写入 JSON 导出失败: {error}"))?;
    Ok(ExportResult {
        path: path.to_string_lossy().into_owned(),
        record_count,
        bytes: encoded.len(),
        generated_at: generated_at.to_rfc3339(),
    })
}

#[tauri::command]
pub async fn get_device_profile(
    state: tauri::State<'_, AppState>,
) -> std::result::Result<DeviceProfile, String> {
    Ok(read_device_profile(&state.data_dir))
}

pub(crate) async fn refresh_device_profile(state: &AppState) {
    let Ok(Some(auth)) = state.auth.load_auth() else {
        return;
    };
    let Ok(connector) = ZeppConnector::new(auth) else {
        return;
    };
    let Ok(payload) = connector.fetch_devices().await else {
        return;
    };
    let profile = parse_device_profile(&payload);
    if profile == DeviceProfile::default() {
        return;
    }
    let path = state.data_dir.join("device.json");
    if let Ok(encoded) = serde_json::to_string_pretty(&profile) {
        let _ = std::fs::write(path, encoded);
    }
}

fn read_device_profile(data_dir: &std::path::Path) -> DeviceProfile {
    let path = data_dir.join("device.json");
    std::fs::read_to_string(path)
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_default()
}

pub(crate) fn parse_device_profile(value: &serde_json::Value) -> DeviceProfile {
    let item = value
        .get("items")
        .and_then(|items| items.as_array())
        .and_then(|items| items.first())
        .cloned()
        .unwrap_or_else(|| value.clone());
    let extra = match item.get("additionalInfo") {
        Some(serde_json::Value::String(raw)) => serde_json::from_str(raw).unwrap_or(item.clone()),
        Some(value) => value.clone(),
        None => item.clone(),
    };
    DeviceProfile {
        name: first_string(&item, &["displayName", "deviceName", "productName", "model"])
            .or_else(|| first_string(&extra, &["displayName", "deviceName", "productName"])),
        firmware: first_string(
            &extra,
            &["productVersion", "firmwareVersion", "hardwareVersion", "fwVersion"],
        ),
        serial: first_string(&extra, &["sn", "serial", "serialNumber"]),
        device_id: first_string(&item, &["deviceId", "device_id", "deviceSource", "macAddress"]),
        timezone: first_string(&extra, &["bind_timezone", "timezone", "tz"]),
    }
}

fn first_string(value: &serde_json::Value, keys: &[&str]) -> Option<String> {
    let object = value.as_object()?;
    for key in keys {
        match object.get(*key) {
            Some(serde_json::Value::String(text)) if !text.trim().is_empty() => {
                return Some(text.trim().to_string());
            }
            Some(serde_json::Value::Number(number)) => return Some(number.to_string()),
            _ => {}
        }
    }
    None
}

fn validate_json_export_path(value: &str) -> std::result::Result<PathBuf, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err("请选择 JSON 文件的保存位置".to_string());
    }
    let path = PathBuf::from(trimmed);
    if !path.is_absolute() {
        return Err("保存位置必须是绝对路径".to_string());
    }
    let is_json = path
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("json"));
    if !is_json {
        return Err("导出文件必须使用 .json 扩展名".to_string());
    }
    let Some(parent) = path
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
    else {
        return Err("保存位置缺少有效的文件夹".to_string());
    };
    if !parent.is_dir() {
        return Err("所选保存文件夹不存在".to_string());
    }
    Ok(path)
}

#[cfg(test)]
mod tests {
    use super::{parse_device_profile, validate_json_export_path};
    use serde_json::json;

    #[test]
    fn parse_device_profile_reads_additional_info() {
        let value = json!({
            "items": [{
                "deviceId": "A194",
                "displayName": "Amazfit GTR 4",
                "additionalInfo": {
                    "productVersion": "3.9.1.2",
                    "sn": "2143123A1B23456"
                }
            }]
        });
        let profile = parse_device_profile(&value);
        assert_eq!(profile.name.as_deref(), Some("Amazfit GTR 4"));
        assert_eq!(profile.firmware.as_deref(), Some("3.9.1.2"));
        assert_eq!(profile.serial.as_deref(), Some("2143123A1B23456"));
        assert_eq!(profile.device_id.as_deref(), Some("A194"));
    }

    #[test]
    fn export_path_requires_absolute_json_in_existing_folder() {
        let temp = std::env::temp_dir();
        let valid = temp.join("zeppbridge-export.JSON");
        assert_eq!(
            validate_json_export_path(valid.to_string_lossy().as_ref()).unwrap(),
            valid
        );
        assert!(validate_json_export_path("relative.json").is_err());
        assert!(
            validate_json_export_path(temp.join("export.txt").to_string_lossy().as_ref()).is_err()
        );
        assert!(validate_json_export_path(
            temp.join("missing-folder")
                .join("export.json")
                .to_string_lossy()
                .as_ref()
        )
        .is_err());
    }
}

/// Open the application's local data directory in Windows Explorer.
#[tauri::command]
pub fn open_data_folder(state: tauri::State<'_, AppState>) -> std::result::Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&state.data_dir)
            .spawn()
            .map(|_| ())
            .map_err(|error| format!("打开数据文件夹失败: {error}"))
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = state;
        Err("打开数据文件夹仅支持 Windows".to_string())
    }
}
