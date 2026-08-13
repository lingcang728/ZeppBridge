use crate::app_state::AppState;
use crate::connectors::ZeppConnector;
use crate::ipc_types::CleanupResult;
use crate::models::{
    DailyPoint, DeviceProfile, ExportResult, ExportSelection, HealthOverview, HeartRatePoint,
    SleepSession, StorageEstimate, UserPrefs, Workout,
};
use chrono::Utc;
use std::io::Write;
use std::path::{Path, PathBuf};

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

/// Write via a same-directory temporary file + rename so an interrupted
/// export (crash, disk full) never leaves a truncated JSON at the target
/// path — in particular the stable AI feed file that is overwritten in place.
fn write_file_atomically(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let parent = path
        .parent()
        .filter(|value| !value.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."));
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("export.json");
    let temp_path = parent.join(format!(
        ".{file_name}.tmp-{}-{}",
        std::process::id(),
        chrono::Utc::now().timestamp_nanos_opt().unwrap_or_default()
    ));
    let result = (|| {
        let mut file = std::fs::OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .open(&temp_path)?;
        file.write_all(bytes)?;
        file.sync_all()?;
        drop(file);
        // Windows cannot rename over an existing file.
        #[cfg(windows)]
        {
            if path.exists() {
                std::fs::remove_file(path)?;
            }
        }
        std::fs::rename(&temp_path, path)
    })();
    if result.is_err() {
        let _ = std::fs::remove_file(&temp_path);
    }
    result
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
    // A zero-record export must not leave a misleading empty file on disk:
    // report an error before anything is written.
    if record_count == 0 {
        return Err("这段时间没有可导出的记录".to_string());
    }
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
    write_file_atomically(&path, encoded.as_bytes())
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
    device_id: Option<String>,
    source_scope: Option<String>,
) -> std::result::Result<DeviceProfile, String> {
    resolve_device_profile(&state, device_id.as_deref(), source_scope.as_deref()).await
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
    let profiles = parse_device_profiles(&payload);
    if profiles.is_empty() {
        return;
    }
    {
        let db = state.db.lock().await;
        for hint in profiles.iter().map(device_hint_from_profile) {
            let _ = db.upsert_device_identity(&hint);
        }
    }
    let path = state.data_dir.join("devices.json");
    if let Ok(encoded) = serde_json::to_string_pretty(&profiles) {
        let _ = std::fs::write(path, encoded);
    }
}

async fn resolve_device_profile(
    state: &AppState,
    device_id: Option<&str>,
    source_scope: Option<&str>,
) -> std::result::Result<DeviceProfile, String> {
    if source_scope
        .map(|scope| scope.eq_ignore_ascii_case("user_fused"))
        .unwrap_or(false)
    {
        return Ok(DeviceProfile {
            name: Some("融合来源".into()),
            ..DeviceProfile::default()
        });
    }
    let Some(device_id) = device_id.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(DeviceProfile {
            name: Some("设备未确定".into()),
            ..DeviceProfile::default()
        });
    };
    let from_db = {
        let db = state.db.lock().await;
        db.lookup_device_profile(device_id)
            .map_err(|error| error.to_string())?
    };
    if let Some(profile) = from_db {
        return Ok(profile);
    }
    if let Some(profile) = read_device_profiles(&state.data_dir)
        .into_iter()
        .find(|profile| profile_matches(profile, device_id))
    {
        return Ok(profile);
    }
    Ok(DeviceProfile {
        name: Some("设备未确定".into()),
        device_id: Some(device_id.to_string()),
        ..DeviceProfile::default()
    })
}

fn read_device_profiles(data_dir: &std::path::Path) -> Vec<DeviceProfile> {
    let path = data_dir.join("devices.json");
    let raw = std::fs::read_to_string(path).ok();
    if let Some(raw) = raw {
        if let Ok(list) = serde_json::from_str::<Vec<DeviceProfile>>(&raw) {
            return list;
        }
        if let Ok(single) = serde_json::from_str::<DeviceProfile>(&raw) {
            return vec![single];
        }
    }
    let legacy = data_dir.join("device.json");
    std::fs::read_to_string(legacy)
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .map(|profile| vec![profile])
        .unwrap_or_default()
}

fn profile_matches(profile: &DeviceProfile, needle: &str) -> bool {
    [&profile.device_id, &profile.serial]
        .into_iter()
        .flatten()
        .any(|value| value.eq_ignore_ascii_case(needle))
}

fn device_hint_from_profile(profile: &DeviceProfile) -> crate::models::DeviceIdentityHint {
    let mut aliases = Vec::new();
    if let Some(device_id) = &profile.device_id {
        aliases.push(device_id.clone());
    }
    if let Some(serial) = &profile.serial {
        aliases.push(serial.clone());
    }
    crate::models::DeviceIdentityHint {
        aliases,
        name: profile.name.clone(),
        firmware: profile.firmware.clone(),
        serial: profile.serial.clone(),
        device_id: profile.device_id.clone(),
        timezone: profile.timezone.clone(),
    }
}

#[cfg_attr(not(test), allow(dead_code))]
pub(crate) fn parse_device_profile(value: &serde_json::Value) -> DeviceProfile {
    parse_device_profiles(value)
        .into_iter()
        .next()
        .unwrap_or_default()
}

pub(crate) fn parse_device_profiles(value: &serde_json::Value) -> Vec<DeviceProfile> {
    let items = value
        .get("items")
        .and_then(|items| items.as_array())
        .cloned()
        .unwrap_or_else(|| vec![value.clone()]);
    items
        .into_iter()
        .map(|item| {
            let extra = match item.get("additionalInfo") {
                Some(serde_json::Value::String(raw)) => {
                    serde_json::from_str(raw).unwrap_or(item.clone())
                }
                Some(value) => value.clone(),
                None => item.clone(),
            };
            DeviceProfile {
                name: first_string(
                    &item,
                    &["displayName", "deviceName", "productName", "model"],
                )
                .or_else(|| first_string(&extra, &["displayName", "deviceName", "productName"])),
                firmware: first_string(
                    &extra,
                    &[
                        "productVersion",
                        "firmwareVersion",
                        "hardwareVersion",
                        "fwVersion",
                    ],
                ),
                serial: first_string(&extra, &["sn", "serial", "serialNumber"]),
                device_id: first_string(
                    &item,
                    &["deviceId", "device_id", "deviceSource", "macAddress"],
                )
                .or_else(|| first_string(&extra, &["deviceId", "device_id", "macAddress"])),
                timezone: first_string(&extra, &["bind_timezone", "timezone", "tz"]).filter(
                    |value| value.contains('/') || value.chars().any(|ch| ch.is_ascii_alphabetic()),
                ),
            }
        })
        .filter(|profile| {
            profile.device_id.is_some() || profile.serial.is_some() || profile.name.is_some()
        })
        .collect()
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
    use super::{parse_device_profile, parse_device_profiles, validate_json_export_path};
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
    fn parse_device_profiles_keeps_every_device() {
        let value = json!({
            "items": [
                {
                    "deviceId": "MAC-ONE",
                    "displayName": "Watch One",
                    "additionalInfo": { "sn": "SN-ONE", "productVersion": "1.0.0" }
                },
                {
                    "deviceId": "MAC-TWO",
                    "displayName": "Watch Two",
                    "additionalInfo": { "sn": "SN-TWO", "productVersion": "2.0.0" }
                }
            ]
        });
        let profiles = parse_device_profiles(&value);
        assert_eq!(profiles.len(), 2);
        assert_eq!(profiles[0].serial.as_deref(), Some("SN-ONE"));
        assert_eq!(profiles[1].device_id.as_deref(), Some("MAC-TWO"));
        assert_ne!(profiles[0].device_id, profiles[1].device_id);
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
