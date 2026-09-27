//! 设备档案命令：云端刷新、本地缓存、目录匹配与本机数据补全（从 commands/data.rs 拆出）。

use super::*;

#[tauri::command]
pub async fn get_device_profile(
    state: tauri::State<'_, AppState>,
    device_id: Option<String>,
    source_scope: Option<String>,
) -> std::result::Result<DeviceProfile, AppError> {
    resolve_device_profile(&state, device_id.as_deref(), source_scope.as_deref()).await
}

/// Return every device bound to the current account. The command is
/// cache-first; a caller opts into the bounded network refresh explicitly so
/// an offline account can still inspect its last known device list.
#[tauri::command]
pub async fn get_device_profiles(
    state: tauri::State<'_, AppState>,
    refresh: Option<bool>,
) -> std::result::Result<DeviceProfilesResult, AppError> {
    let cached = read_device_profile_cache(&state.data_dir);
    let mut profiles = cached.profiles;
    let mut cached_at = cached.cached_at;
    let mut refreshed = false;
    let mut refresh_error = None;
    let mut refresh_error_code = None;

    if refresh.unwrap_or(false) {
        match refresh_device_profiles_from_cloud(&state).await {
            Ok((remote_profiles, fetched_at)) => {
                profiles = remote_profiles;
                cached_at = Some(fetched_at);
                refreshed = true;
            }
            Err(error) => {
                // Keep the last good cache and expose a safe, non-secret error
                // string plus its stable code for the settings surface.
                refresh_error = Some(error.message.clone());
                refresh_error_code = Some(error.code.clone());
            }
        }
    }

    profiles = enrich_profiles_with_local_data(&state, profiles).await?;
    let now = Utc::now();
    let age_seconds = cached_at.map(|value| (now - value).num_seconds().max(0));
    let status = if refreshed {
        "fresh"
    } else if refresh_error.is_some() {
        if cached_at.is_some() {
            "refresh_failed"
        } else {
            "unavailable"
        }
    } else if cached_at.is_none() {
        "missing"
    } else if age_seconds.unwrap_or(i64::MAX) > DEVICE_CACHE_MAX_AGE_SECONDS {
        "stale"
    } else {
        "fresh"
    };

    Ok(DeviceProfilesResult {
        profiles,
        cache: DeviceCacheMetadata {
            status: status.to_string(),
            cached_at,
            age_seconds,
            refreshed,
            refresh_error,
            refresh_error_code,
        },
    })
}

pub(crate) async fn refresh_device_profile(state: &AppState) {
    let _ = refresh_device_profiles_from_cloud(state).await;
}

pub(super) async fn refresh_device_profiles_from_cloud(
    state: &AppState,
) -> std::result::Result<(Vec<DeviceProfile>, DateTime<Utc>), AppError> {
    let auth = state
        .auth
        .load_auth()
        .map_err(AppError::from)?
        .ok_or_else(|| AppError::new("err.sync.not_connected", "尚未配置 Zepp 认证"))?;
    let connector = ZeppConnector::new(auth).map_err(AppError::from)?;
    let payload = connector.fetch_devices().await.map_err(AppError::from)?;
    let profiles = parse_device_profiles(&payload);
    if profiles.is_empty() {
        return Err(AppError::new("err.core.unavailable", "Zepp 未返回设备"));
    }

    // 这一段写库以前只拿进程内的 `state.db` 互斥锁，没拿跨进程写锁。
    // 重放/压缩/同步握着写锁跑的时候，这里的每条 autocommit upsert 都要在
    // SQLite busy_timeout 里干等——而 `state.db` 一直被占着，后面所有命令
    // （状态、概览、设置页加载）跟着排队，界面看起来就是「点了没反应」。
    // 维护窗口里干脆跳过：目录缓存照常写文件，身份行留给下一次刷新补齐。
    let write_guard =
        if crate::storage::replay_in_progress() || crate::storage::compaction_in_progress() {
            None
        } else {
            match zeppbridge_core::storage::write_lock::try_acquire(
                &state.data_dir,
                WritePurpose::Metadata,
            ) {
                Ok(guard) => Some(guard),
                Err(error @ zeppbridge_core::storage::write_lock::WriteLockError::Busy { .. }) => {
                    crate::diagnostics::log(&format!("设备身份表这次不更新：{error}"));
                    None
                }
                Err(error) => {
                    return Err(AppError::new(
                        "err.core.io",
                        format!("无法取得写锁: {error}"),
                    ));
                }
            }
        };
    if write_guard.is_some() {
        let db = state.db.lock().await;
        for hint in profiles.iter().map(device_hint_from_profile) {
            db.upsert_device_identity(&hint).map_err(AppError::from)?;
        }
    }

    let cached_at = Utc::now();
    let cache_file = DeviceProfilesFile {
        version: 1,
        cached_at,
        profiles: profiles.clone(),
    };
    let encoded = serde_json::to_vec_pretty(&cache_file).map_err(|error| {
        AppError::new("err.core.parse", format!("设备目录缓存编码失败: {error}"))
    })?;
    write_file_atomically(&state.data_dir.join("devices.json"), &encoded)
        .map_err(|error| AppError::new("err.core.io", format!("设备目录缓存写入失败: {error}")))?;
    Ok((profiles, cached_at))
}

pub(super) async fn resolve_device_profile(
    state: &AppState,
    device_id: Option<&str>,
    source_scope: Option<&str>,
) -> std::result::Result<DeviceProfile, AppError> {
    if source_scope
        .map(|scope| scope.eq_ignore_ascii_case("user_fused"))
        .unwrap_or(false)
    {
        return Ok(DeviceProfile {
            name: Some("融合来源".into()),
            display_name: Some("融合来源".into()),
            match_status: DeviceMatchStatus::Unknown,
            ..DeviceProfile::default()
        });
    }
    if source_scope
        .map(|scope| scope.eq_ignore_ascii_case("unknown"))
        .unwrap_or(false)
    {
        return Ok(device_id
            .map(unknown_device_profile)
            .unwrap_or_else(|| unknown_device_profile("")));
    }
    let Some(device_id) = device_id.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(DeviceProfile {
            name: Some("设备未确定".into()),
            display_name: Some("设备未确定".into()),
            match_status: DeviceMatchStatus::Unknown,
            ..DeviceProfile::default()
        });
    };
    let from_db = {
        let db = state.db.lock().await;
        db.lookup_device_profile(device_id)?
    };
    let cached_profile = read_device_profile_cache(&state.data_dir)
        .profiles
        .into_iter()
        .find(|profile| profile_matches(profile, device_id));
    if let Some(profile) = from_db {
        let profile = if let Some(cached) = cached_profile {
            merge_cached_device_profile(profile, cached)
        } else {
            profile
        };
        return enrich_profile_with_local_data(state, profile, Some(device_id), None).await;
    }
    if let Some(profile) = cached_profile {
        return enrich_profile_with_local_data(state, profile, Some(device_id), None).await;
    }
    Ok(unknown_device_profile(device_id))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(super) struct DeviceProfilesFile {
    #[serde(default = "default_device_cache_version")]
    pub(super) version: u32,
    pub(super) cached_at: DateTime<Utc>,
    pub(super) profiles: Vec<DeviceProfile>,
}

pub(super) fn default_device_cache_version() -> u32 {
    1
}

#[derive(Debug, Default)]
pub(super) struct CachedDeviceProfiles {
    pub(super) profiles: Vec<DeviceProfile>,
    pub(super) cached_at: Option<DateTime<Utc>>,
}

pub(super) fn read_device_profile_cache(data_dir: &std::path::Path) -> CachedDeviceProfiles {
    let path = data_dir.join("devices.json");
    let raw = std::fs::read_to_string(path).ok();
    if let Some(raw) = raw {
        if let Ok(file) = serde_json::from_str::<DeviceProfilesFile>(&raw) {
            return CachedDeviceProfiles {
                profiles: file.profiles,
                cached_at: Some(file.cached_at),
            };
        }
        if let Ok(list) = serde_json::from_str::<Vec<DeviceProfile>>(&raw) {
            return CachedDeviceProfiles {
                profiles: list,
                cached_at: modified_at(&data_dir.join("devices.json")),
            };
        }
        if let Ok(single) = serde_json::from_str::<DeviceProfile>(&raw) {
            return CachedDeviceProfiles {
                profiles: vec![single],
                cached_at: modified_at(&data_dir.join("devices.json")),
            };
        }
    }
    let legacy = data_dir.join("device.json");
    std::fs::read_to_string(&legacy)
        .ok()
        .and_then(|raw| serde_json::from_str::<DeviceProfile>(&raw).ok())
        .map(|profile| CachedDeviceProfiles {
            profiles: vec![profile],
            cached_at: modified_at(&legacy),
        })
        .unwrap_or_default()
}

pub(super) fn modified_at(path: &Path) -> Option<DateTime<Utc>> {
    let modified = std::fs::metadata(path).ok()?.modified().ok()?;
    Some(DateTime::<Utc>::from(modified))
}

pub(super) fn profile_matches(profile: &DeviceProfile, needle: &str) -> bool {
    [&profile.device_id, &profile.serial]
        .into_iter()
        .flatten()
        .any(|value| value.eq_ignore_ascii_case(needle))
}

/// SQLite's identity index intentionally stores only stable lookup fields and
/// the user-facing name. Keep that nickname as the primary value while
/// recovering the versioned catalog fields from the richer devices.json cache
/// after an application restart.
pub(super) fn merge_cached_device_profile(
    mut indexed: DeviceProfile,
    cached: DeviceProfile,
) -> DeviceProfile {
    if indexed.display_name.is_none() {
        indexed.display_name = cached.display_name;
    }
    if indexed.canonical_name.is_none() {
        indexed.canonical_name = cached.canonical_name;
    }
    if indexed.catalog_id.is_none() {
        indexed.catalog_id = cached.catalog_id;
    }
    if indexed.kind.is_none() {
        indexed.kind = cached.kind;
    }
    if indexed.image_key.is_none() {
        indexed.image_key = cached.image_key;
    }
    if indexed.match_status == DeviceMatchStatus::Unknown {
        indexed.match_status = cached.match_status;
    }
    if indexed.firmware.is_none() {
        indexed.firmware = cached.firmware;
    }
    if indexed.serial.is_none() {
        indexed.serial = cached.serial;
    }
    if indexed.device_id.is_none() {
        indexed.device_id = cached.device_id;
    }
    if indexed.timezone.is_none() {
        indexed.timezone = cached.timezone;
    }
    indexed
}

pub(super) fn device_hint_from_profile(
    profile: &DeviceProfile,
) -> crate::models::DeviceIdentityHint {
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

pub(super) fn unknown_device_profile(device_id: &str) -> DeviceProfile {
    let device_id = device_id.trim();
    DeviceProfile {
        name: Some("设备未确定".into()),
        display_name: Some("设备未确定".into()),
        device_id: (!device_id.is_empty()).then(|| device_id.to_string()),
        match_status: DeviceMatchStatus::Unknown,
        ..DeviceProfile::default()
    }
}

pub(super) async fn enrich_profiles_with_local_data(
    state: &AppState,
    profiles: Vec<DeviceProfile>,
) -> std::result::Result<Vec<DeviceProfile>, AppError> {
    // 「最近一条数据」对所有设备只查一次（四张表各扫一遍），不再每台设备各扫一遍。
    let index =
        spawn_independent_read(state.data_dir.clone(), |db| db.device_latest_data_index()).await?;
    let mut enriched = Vec::with_capacity(profiles.len());
    for profile in profiles {
        enriched.push(enrich_profile_with_local_data(state, profile, None, Some(&index)).await?);
    }
    Ok(enriched)
}

pub(super) async fn enrich_profile_with_local_data(
    state: &AppState,
    mut profile: DeviceProfile,
    requested_device_id: Option<&str>,
    latest_index: Option<&std::collections::HashMap<String, String>>,
) -> std::result::Result<DeviceProfile, AppError> {
    if profile.display_name.is_none() {
        profile.display_name = profile.name.clone();
    }
    if profile.match_status == DeviceMatchStatus::Unknown {
        let model_codes = profile.device_id.as_deref().into_iter().collect::<Vec<_>>();
        let names = profile.name.as_deref().into_iter().collect::<Vec<_>>();
        let display_name = profile.display_name.as_deref();
        if let Some(matched) = match_catalog(&CatalogMatchInput {
            // 这条路径是从本机已存的 profile 补救的，手上只有 device_id，
            // 没有原始设备响应，也就没有 deviceSource 数字可用。
            device_source_codes: Vec::new(),
            model_codes,
            product_names: names.clone(),
            device_names: names,
            display_name,
        }) {
            apply_catalog_match(&mut profile, matched.entry, matched.status);
        }
    }
    // 用户指认了型号，就用用户说的。
    //
    // 这里以前有个 `if match_status == Unknown` 的前提，意思是「只有本机认不出
    // 来的时候才听用户的」。那等于假设自动识别不会错——可自动识别**恰恰会错**：
    // 目录靠别名匹配，一块别名撞车的表会被认成另一款，而用户点了「不对，我来
    // 指认」之后，指认存进了库却永远不显示，界面上看还是那个错的型号。
    //
    // 现在不管自动识别得出了什么，用户的指认一律优先，并如实标成
    // `UserAssigned`——不是伪装成识别结果。
    {
        let keys = [
            requested_device_id,
            profile.device_id.as_deref(),
            profile.serial.as_deref(),
        ]
        .into_iter()
        .flatten()
        .collect::<Vec<_>>();
        let assigned = {
            let db = state.db.lock().await;
            db.device_model_override(&keys)?
        };
        if let Some(assigned) = assigned {
            apply_user_assignment(&mut profile, &assigned.catalog_id);
        }
    }
    let aliases = [
        requested_device_id,
        profile.device_id.as_deref(),
        profile.serial.as_deref(),
    ]
    .into_iter()
    .flatten()
    .map(str::to_string)
    .collect::<Vec<_>>();
    let (has_local_data, last_data_at) = match latest_index {
        Some(index) => zeppbridge_core::storage::device_summary_from_index(index, &aliases),
        None => {
            let aliases = aliases.clone();
            spawn_independent_read(state.data_dir.clone(), move |db| {
                db.device_data_summary(&aliases)
            })
            .await?
        }
    };
    profile.has_local_data = has_local_data;
    profile.last_data_at = last_data_at;
    Ok(profile)
}

/// 把用户指认的型号套到这份 profile 上。
///
/// 单独一个函数是因为它踩过一次坑：这段逻辑原先藏在一个
/// `if match_status == Unknown` 里，于是已经被自动识别过的设备永远采纳不了
/// 用户的纠正。抽出来才能用测试把「不管识别成了什么，用户说了算」钉住。
///
/// 返回是否真的套上了：目录里没有这个 id 时什么都不改，而不是清空成未知。
pub(super) fn apply_user_assignment(profile: &mut DeviceProfile, catalog_id: &str) -> bool {
    let Some(entry) = crate::device_catalog::catalog_entries()
        .iter()
        .find(|entry| entry.catalog_id == catalog_id)
    else {
        return false;
    };
    apply_catalog_match(profile, entry, CatalogMatchStatus::Exact);
    // 如实标注来源：这是用户指认的，不是识别结果。
    profile.match_status = DeviceMatchStatus::UserAssigned;
    true
}

pub(super) fn apply_catalog_match(
    profile: &mut DeviceProfile,
    entry: &crate::device_catalog::CatalogEntry,
    status: CatalogMatchStatus,
) {
    profile.canonical_name = Some(entry.canonical_name.clone());
    profile.catalog_id = Some(
        entry
            .canonical_device_key
            .clone()
            .unwrap_or_else(|| entry.catalog_id.clone()),
    );
    profile.kind = Some(entry.kind.clone());
    profile.image_key = entry.image_key.clone();
    profile.match_status = match status {
        CatalogMatchStatus::Exact => DeviceMatchStatus::Exact,
        CatalogMatchStatus::Alias => DeviceMatchStatus::Alias,
    };
    if profile.display_name.is_none() {
        profile.display_name = profile
            .name
            .clone()
            .or_else(|| Some(entry.canonical_name.clone()));
    }
}

#[cfg_attr(not(test), allow(dead_code))]
pub(crate) fn parse_device_profile(value: &serde_json::Value) -> DeviceProfile {
    parse_device_profiles(value)
        .into_iter()
        .next()
        .unwrap_or_default()
}
