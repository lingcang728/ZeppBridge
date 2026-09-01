use crate::app_state::AppState;
use crate::connectors::ZeppConnector;
use crate::device_catalog::{match_catalog, CatalogMatchInput, CatalogMatchStatus};
use crate::export_formats;
use crate::insight::{WeeklyReport, WorkoutInsight};
use crate::ipc_error::AppError;
use crate::ipc_types::CleanupResult;
use crate::models::{
    AiHandoffMetadata, AiHandoffResult, CapabilityOverview, DailyHeartRateExtreme, DailyPoint,
    DeviceCacheMetadata, DeviceCatalogOption, DeviceMatchStatus, DeviceProfile,
    DeviceProfilesResult, DiagnosticAssignedModel, DiagnosticDeviceCandidate,
    DiagnosticDeviceEvidence, DiagnosticField, DiagnosticObjectShape, DiagnosticReport,
    ExportDetail, ExportResult, ExportScope, ExportSelection, FeedbackSubmissionResult,
    HealthOverview, HeartRatePoint, HeartRateZoneOptions, HeartRateZonePreference, MetricSeries,
    RawPayloadCompaction, SleepSession, StorageEstimate, TrainingBalancePoint, UserPrefs, Workout,
    WorkoutSeries, DIAGNOSTIC_NOTE_MAX_CHARS,
};
use crate::storage::corrections::WorkoutCodeLabel;
use crate::storage::provenance::{DataHealth, IntegrityCheckResult};
use crate::storage::NORMALIZER_REVISION;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::collections::BTreeSet;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::Duration;

const DEVICE_CACHE_MAX_AGE_SECONDS: i64 = 24 * 60 * 60;
pub(crate) const AI_HANDOFF_INLINE_LIMIT_BYTES: usize = 2 * 1024 * 1024;

/// Return the latest health metrics persisted in the local database.
#[tauri::command]
pub async fn get_health_overview(
    state: tauri::State<'_, AppState>,
) -> std::result::Result<HealthOverview, AppError> {
    let result = {
        let db = state.db.lock().await;
        db.get_health_overview().map_err(AppError::from)
    };
    result
}

/// What this account can actually give an AI, and what it cannot.
///
/// Read from stored data wherever the library already proves the answer, which
/// is most of it; the rest comes from the last silent capability check that ran
/// during a sync. Nothing here costs a request.
#[tauri::command]
pub async fn get_capability_overview(
    state: tauri::State<'_, AppState>,
) -> std::result::Result<CapabilityOverview, AppError> {
    let db = state.db.lock().await;
    db.capability_overview().map_err(AppError::from)
}

/// 一页记录，外加本机的总条数。
///
/// 总数是分页的另一半：没有它，界面只能说「显示了 500 条」，说不出「共
/// 2317 条」——而用户问的恰恰是「剩下的呢」（Reddit p6zxyo7）。
/// 写成两个具体类型而不是一个泛型 `Page<T>`：`#[tauri::command]` 生成的
/// 代码要对返回类型做类型推导，泛型参数在那里会退化成 never 类型，报出来的
/// 错误（`!: Deserialize` / never type fallback）完全指不到这里。
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SleepPage {
    pub items: Vec<SleepSession>,
    /// 本机库里的总条数，不受本次分页影响。
    pub total: i64,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkoutPage {
    pub items: Vec<Workout>,
    pub total: i64,
}

/// 单页最多几条。
///
/// 它是**页大小的上限**，不是「这个应用最多让你看到多少条」。以前
/// `get_recent_*` 的 `clamp(1, 500)` 同时扮演了这两个角色：SQL 里没有
/// `OFFSET`，所以第 501 条之后的记录在应用里根本没有入口。
const MAX_PAGE_SIZE: usize = 500;

/// Return the most recent persisted sleep sessions.
#[tauri::command]
pub async fn get_recent_sleep(
    state: tauri::State<'_, AppState>,
    limit: usize,
) -> std::result::Result<Vec<SleepSession>, AppError> {
    let limit = limit.clamp(1, 500);
    let result = {
        let db = state.db.lock().await;
        db.get_recent_sleep_sessions(limit).map_err(AppError::from)
    };
    result
}

/// 分页取睡眠记录，最新在前。
#[tauri::command]
pub async fn get_sleep_page(
    state: tauri::State<'_, AppState>,
    limit: usize,
    offset: usize,
) -> std::result::Result<SleepPage, AppError> {
    let limit = limit.clamp(1, MAX_PAGE_SIZE);
    let db = state.db.lock().await;
    Ok(SleepPage {
        items: db.sleep_sessions_page(limit, offset)?,
        total: db.count_sleep_sessions()?,
    })
}

/// Return one persisted sleep session by its stable source identifier.
#[tauri::command]
pub async fn get_sleep_detail(
    state: tauri::State<'_, AppState>,
    sleep_id: String,
) -> std::result::Result<Option<SleepSession>, AppError> {
    let db = state.db.lock().await;
    db.get_sleep_detail(&sleep_id).map_err(AppError::from)
}

/// Return the most recent persisted workouts.
#[tauri::command]
pub async fn get_recent_workouts(
    state: tauri::State<'_, AppState>,
    limit: usize,
) -> std::result::Result<Vec<Workout>, AppError> {
    let limit = limit.clamp(1, 500);
    let result = {
        let db = state.db.lock().await;
        db.get_recent_workouts(limit).map_err(AppError::from)
    };
    result
}

/// 分页取运动记录，最新在前。
#[tauri::command]
pub async fn get_workout_page(
    state: tauri::State<'_, AppState>,
    limit: usize,
    offset: usize,
) -> std::result::Result<WorkoutPage, AppError> {
    let limit = limit.clamp(1, MAX_PAGE_SIZE);
    let db = state.db.lock().await;
    Ok(WorkoutPage {
        items: db.workouts_page(limit, offset)?,
        total: db.count_workouts()?,
    })
}

/// Return one persisted workout by its stable source identifier.
#[tauri::command]
pub async fn get_workout_detail(
    state: tauri::State<'_, AppState>,
    workout_id: String,
) -> std::result::Result<Option<Workout>, AppError> {
    let db = state.db.lock().await;
    db.get_workout_detail(&workout_id).map_err(AppError::from)
}

#[tauri::command]
pub async fn get_workout_series(
    state: tauri::State<'_, AppState>,
    workout_id: String,
) -> std::result::Result<WorkoutSeries, AppError> {
    let db = state.db.lock().await;
    db.get_workout_series(&workout_id).map_err(AppError::from)
}

#[tauri::command]
pub async fn get_heart_rate_series(
    state: tauri::State<'_, AppState>,
    hours: i64,
) -> std::result::Result<Vec<HeartRatePoint>, AppError> {
    let db = state.db.lock().await;
    db.heart_rate_series(hours).map_err(AppError::from)
}

#[tauri::command]
pub async fn get_training_load_series(
    state: tauri::State<'_, AppState>,
    days: i64,
) -> std::result::Result<Vec<DailyPoint>, AppError> {
    let db = state.db.lock().await;
    db.training_load_series(days).map_err(AppError::from)
}

/// Daily series for the body and training screens.
///
/// One round trip fills a whole screen: the caller names the metrics it wants
/// and gets each one back with its unit, its source table and how many days of
/// the window actually carry data.
#[tauri::command]
pub async fn get_metric_series(
    state: tauri::State<'_, AppState>,
    metrics: Vec<String>,
    days: i64,
) -> std::result::Result<Vec<MetricSeries>, AppError> {
    let db = state.db.lock().await;
    db.metric_series(&metrics, days).map_err(AppError::from)
}

/// 按天的原始心率极值。
///
/// Zepp App 显示的日最高心率是**过滤过的**（有人报告 App 显示 104，而原始
/// 数据里的峰值超过 120）。这个命令给的是本机原始样本的按日 max，不做过滤，
/// 并把每天的样本数一起返回——样本稀疏的那一天，那个「最高」只是这几个点
/// 里的最高。
#[tauri::command]
pub async fn get_daily_heart_rate_extremes(
    state: tauri::State<'_, AppState>,
    days: i64,
) -> std::result::Result<Vec<DailyHeartRateExtreme>, AppError> {
    let db = state.db.lock().await;
    db.daily_heart_rate_extremes(days).map_err(AppError::from)
}

/// Acute (7 day) versus chronic (28 day) training load, day by day.
#[tauri::command]
pub async fn get_training_balance(
    state: tauri::State<'_, AppState>,
    days: i64,
) -> std::result::Result<Vec<TrainingBalancePoint>, AppError> {
    let window = days.clamp(1, 1825);
    let end = chrono::Local::now().date_naive();
    let start = end - chrono::Duration::days(window - 1);
    let db = state.db.lock().await;
    db.training_load_balance(start, end).map_err(AppError::from)
}

/// The heart-rate zone picker's state: measured bases, the models they
/// support, the user's choice and the zones that choice produces.
#[tauri::command]
pub async fn get_heart_rate_zones(
    state: tauri::State<'_, AppState>,
    days: i64,
) -> std::result::Result<HeartRateZoneOptions, AppError> {
    let db = state.db.lock().await;
    db.heart_rate_zone_options(days).map_err(AppError::from)
}

/// Record which zone model and which measured bases the user picked.
///
/// Every field is optional and clearing them all is a valid state: nothing
/// here is chosen on the user's behalf, so "not decided yet" has to survive a
/// round trip.
#[tauri::command]
pub async fn set_heart_rate_zone_preference(
    state: tauri::State<'_, AppState>,
    model: Option<String>,
    max_basis: Option<String>,
    resting_basis: Option<String>,
    threshold_basis: Option<String>,
    days: i64,
) -> std::result::Result<HeartRateZoneOptions, AppError> {
    let db = state.db.lock().await;
    db.set_heart_rate_zone_preference(&HeartRateZonePreference {
        model,
        max_basis,
        resting_basis,
        threshold_basis,
    })?;
    db.heart_rate_zone_options(days).map_err(AppError::from)
}

#[tauri::command]
pub async fn get_storage_estimate(
    state: tauri::State<'_, AppState>,
    days: i64,
) -> std::result::Result<StorageEstimate, AppError> {
    let db = state.db.lock().await;
    db.storage_estimate(days, &state.data_dir)
        .map_err(AppError::from)
}

/// 当前的保留 / 补拉 / 归档偏好。
///
/// `AppStatus` 只带了保留期和补拉窗口，归档开关不在里面；界面需要一个能单独
/// 读到完整偏好的入口，否则归档面板只能靠猜。
#[tauri::command]
pub async fn get_user_prefs(
    state: tauri::State<'_, AppState>,
) -> std::result::Result<UserPrefs, AppError> {
    let db = state.db.lock().await;
    db.user_prefs().map_err(AppError::from)
}

#[tauri::command]
pub async fn set_user_prefs(
    state: tauri::State<'_, AppState>,
    retention_days: i64,
    history_sync_days: i64,
    archive_enabled: Option<bool>,
) -> std::result::Result<UserPrefs, AppError> {
    let db = state.db.lock().await;
    // 没传归档开关的旧调用方保持原状，不会被静默关掉归档。
    let archive_enabled = match archive_enabled {
        Some(value) => value,
        None => db
            .user_prefs()
            .map(|prefs| prefs.archive_enabled)
            .unwrap_or(false),
    };
    db.set_user_prefs(&UserPrefs {
        retention_days,
        history_sync_days,
        archive_enabled,
    })
    .map_err(AppError::from)
}

/// Remove records older than the requested retention window.
/// 把存量的原始报文压缩掉。
///
/// 单独一个命令、由用户点一次触发，而不是塞进同步：老库里可能有上千条报文、
/// 一 GB 以上的文本，压一遍要完整读写一轮。放进同步会让一次「看看有没有新
/// 数据」变成几分钟的等待。
#[tauri::command]
pub async fn compact_raw_payloads(
    state: tauri::State<'_, AppState>,
) -> std::result::Result<RawPayloadCompaction, AppError> {
    let _write_guard = zeppbridge_core::storage::write_lock::acquire_with_timeout(
        &state.data_dir,
        zeppbridge_core::storage::write_lock::WritePurpose::Compaction,
        std::time::Duration::from_secs(20),
    )?;
    let db = state.db.lock().await;
    db.compact_raw_payloads().map_err(AppError::from)
}

#[tauri::command]
pub async fn cleanup_old_data(
    state: tauri::State<'_, AppState>,
    days: i64,
) -> std::result::Result<CleanupResult, AppError> {
    if !(1..=365).contains(&days) {
        return Err(AppError::new(
            "err.prefs.retention_out_of_range",
            "保留天数必须在 1 到 365 天之间",
        ));
    }

    let result = {
        let _write_guard = zeppbridge_core::storage::write_lock::acquire_with_timeout(
            &state.data_dir,
            zeppbridge_core::storage::write_lock::WritePurpose::Cleanup,
            std::time::Duration::from_secs(20),
        )?;
        let db = state.db.lock().await;
        db.cleanup_old_data(days).map_err(AppError::from)
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
) -> std::result::Result<serde_json::Value, AppError> {
    let streams = {
        // 重放会重写全部派生数据，必须和同步、迁移、恢复互斥。
        let _write_guard = zeppbridge_core::storage::write_lock::acquire_with_timeout(
            &state.data_dir,
            zeppbridge_core::storage::write_lock::WritePurpose::Reprocess,
            std::time::Duration::from_secs(20),
        )?;
        let db = state.db.lock().await;
        let streams = db.reprocess_raw_records()?;
        // 手动重新解析记在自己的时间线上，云端同步时间原样不动。
        db.record_local_replay(true)?;
        streams
    };
    let total_records: i64 = streams.values().sum();
    Ok(serde_json::json!({
        "total_records": total_records,
        "streams": streams,
        "message": "已使用新版解析器重新处理本地原始响应"
    }))
}

/// 单次运动的确定性洞察。
///
/// 后端只给可追溯的事实、比较和依据，一句自然语言都不产生：文案归界面，
/// AI 只能解释这些事实，不能改写它们。
#[tauri::command]
pub async fn get_workout_insight(
    state: tauri::State<'_, AppState>,
    workout_id: String,
) -> std::result::Result<WorkoutInsight, AppError> {
    let db = state.db.lock().await;
    db.workout_insight(&workout_id).map_err(AppError::from)
}

/// 本地周报：最近 7 天对比你自己此前 28 天。
///
/// 不和任何人群基准比较 —— 项目没有人群数据，也不打算有。
#[tauri::command]
pub async fn get_weekly_report(
    state: tauri::State<'_, AppState>,
) -> std::result::Result<WeeklyReport, AppError> {
    let db = state.db.lock().await;
    db.weekly_report(Utc::now()).map_err(AppError::from)
}

/// 数据健康中心的后端契约。
///
/// 这个调用不触网，也不跑 `integrity_check`：打开页面必须是便宜的。完整性
/// 检查是显式动作，见 `run_database_integrity_check`。
#[tauri::command]
pub async fn get_data_health(
    state: tauri::State<'_, AppState>,
    window_days: Option<i64>,
) -> std::result::Result<DataHealth, AppError> {
    let database_bytes = std::fs::metadata(state.data_dir.join("zepp.db"))
        .map(|meta| meta.len())
        .unwrap_or(0);
    let db = state.db.lock().await;
    db.data_health(window_days.unwrap_or(90), database_bytes)
        .map_err(AppError::from)
}

/// 对整库跑一次 SQLite `integrity_check` 并记录结果。
///
/// 大库上这是一次全表扫描，所以只在用户主动点击时执行；页面平时显示上一次的
/// 结论和时间。
#[tauri::command]
pub async fn run_database_integrity_check(
    state: tauri::State<'_, AppState>,
) -> std::result::Result<IntegrityCheckResult, AppError> {
    let db = state.db.lock().await;
    db.run_integrity_check().map_err(AppError::from)
}

/// 随包运动目录里的全部可选项，供纠正下拉框渲染。
///
/// 目录被 `include_str!` 编进二进制，所以这份列表和后端的允许值天然一致，
/// 界面不需要再维护一份会漂移的副本。
#[tauri::command]
pub fn get_workout_type_options() -> Vec<zeppbridge_core::sport_catalog::SportOption> {
    zeppbridge_core::sport_catalog::options().to_vec()
}

/// 本机所有还没有名字的 Zepp 运动编号。
///
/// Zepp 的自定义训练模板会给出目录里没有的编号（真实反馈里是 12 和 226）。
/// 我们没有证据说这些编号是什么运动，所以不猜；把它们连同影响到的记录数交给
/// 用户，由用户起一次名字。
#[tauri::command]
pub async fn get_unknown_workout_codes(
    state: tauri::State<'_, AppState>,
) -> std::result::Result<Vec<WorkoutCodeLabel>, AppError> {
    let db = state.db.lock().await;
    db.unknown_workout_code_labels().map_err(AppError::from)
}

/// 给一个未识别编号起名字（传 `null` 撤销）。所有同编号的记录一起生效。
#[tauri::command]
pub async fn set_workout_code_label(
    state: tauri::State<'_, AppState>,
    zepp_type: i32,
    label: Option<String>,
) -> std::result::Result<Vec<WorkoutCodeLabel>, AppError> {
    let db = state.db.lock().await;
    db.set_workout_code_label(zepp_type, label.as_deref())?;
    db.unknown_workout_code_labels().map_err(AppError::from)
}

/// 随包设备目录里可供用户指认的型号。
#[tauri::command]
pub fn get_device_catalog_options() -> Vec<DeviceCatalogOption> {
    let mut options = zeppbridge_core::device_catalog::catalog_entries()
        .iter()
        .filter(|entry| entry.supported && entry.status == "active")
        .map(|entry| DeviceCatalogOption {
            catalog_id: entry.catalog_id.clone(),
            canonical_name: entry.canonical_name.clone(),
            name_zh: entry.name_zh.clone(),
            kind: entry.kind.clone(),
        })
        .collect::<Vec<_>>();
    options.sort_by(|a, b| a.canonical_name.cmp(&b.canonical_name));
    options
}

/// 用户指认某台设备的型号（传 `null` 撤销）。
///
/// 这不是识别结果，是用户纠正：`match_status` 会是 `user_assigned`，界面必须
/// 如实标注，不能伪装成自动识别。
#[tauri::command]
pub async fn set_device_model_override(
    state: tauri::State<'_, AppState>,
    device_key: String,
    catalog_id: Option<String>,
) -> std::result::Result<(), AppError> {
    let db = state.db.lock().await;
    db.set_device_model_override(&device_key, catalog_id.as_deref())
        .map_err(AppError::from)
}

#[tauri::command]
pub async fn set_workout_type_override(
    state: tauri::State<'_, AppState>,
    workout_id: String,
    user_override: Option<String>,
) -> std::result::Result<Workout, AppError> {
    let db = state.db.lock().await;
    db.set_workout_type_override(&workout_id, user_override.as_deref())?;
    db.get_workout_detail(&workout_id)?
        .ok_or_else(|| AppError::new("err.workout.not_found", "运动记录不存在"))
}

/// Build an allowlist-only report. The cloud response is examined
/// in memory and is never copied into the result or persisted as a diagnostic.
#[tauri::command]
pub async fn get_diagnostic_report(
    state: tauri::State<'_, AppState>,
) -> std::result::Result<DiagnosticReport, AppError> {
    build_diagnostic_report(&state, false, None).await
}

/// 组装诊断报告。
///
/// `include_assignments` 为真时附上「用户指认的型号 ↔ 这台设备的型号类编号」。
/// 这一对是内置目录唯一可能的成长来源，但它仍然是用户主动交出来的东西：
/// 只有在选择器里勾选了「帮忙补充目录」的那一次提交才会带上。
async fn build_diagnostic_report(
    state: &AppState,
    include_assignments: bool,
    user_note: Option<&str>,
) -> std::result::Result<DiagnosticReport, AppError> {
    let device_payload = match state.auth.load_auth() {
        Ok(Some(auth)) => match ZeppConnector::new(auth) {
            Ok(connector) => match connector.fetch_devices().await {
                Ok(payload) => Ok(payload),
                Err(_) => Err("request_failed"),
            },
            Err(_) => Err("connection_unavailable"),
        },
        Ok(None) => Err("not_configured"),
        Err(_) => Err("authentication_unavailable"),
    };
    let device_evidence = match &device_payload {
        Ok(payload) => build_device_diagnostic(payload),
        Err(status) => empty_device_diagnostic(status),
    };
    let db = state.db.lock().await;
    let user_assigned_models = match (&device_payload, include_assignments) {
        (Ok(payload), true) => collect_assigned_models(&db, payload),
        _ => Vec::new(),
    };
    Ok(DiagnosticReport {
        format: "zeppbridge.feedback.v1".into(),
        app_version: env!("CARGO_PKG_VERSION").into(),
        schema_version: db.diagnostic_schema_version()?,
        normalizer_revision: NORMALIZER_REVISION.into(),
        operating_system: std::env::consts::OS.into(),
        device_evidence,
        user_assigned_models,
        unknown_workout_codes: db.diagnostic_unknown_workout_codes()?,
        workout_type_corrections: db.diagnostic_workout_type_corrections()?,
        workout_type_conflicts: db.diagnostic_workout_type_conflicts()?,
        // 类型由调用方按需要填；这个构造函数只负责本机能自动查到的事实。
        category: None,
        user_note: user_note.and_then(sanitize_diagnostic_note),
    })
}

/// 把用户写的自由文本收拾成可以发出去的样子。
///
/// 报告的其它部分都是固定白名单字段，唯独这一段是用户自己敲的，所以这里替他
/// 兜住三件事：去掉本机路径（沿用剪贴板那套判断）、抹掉看起来像凭据或长串标识
/// 的东西、截到长度上限。空白内容返回 None，让整个字段不出现在 JSON 里，而不是
/// 发一个空字符串出去。
fn sanitize_diagnostic_note(note: &str) -> Option<String> {
    let without_paths = sanitize_clipboard_text(note.trim());
    let mut cleaned = String::with_capacity(without_paths.len());
    for (index, token) in without_paths
        .split_inclusive(char::is_whitespace)
        .enumerate()
    {
        let _ = index;
        let trimmed = token.trim_end();
        if looks_like_secret(trimmed) {
            cleaned.push_str("[已移除]");
            if token.len() > trimmed.len() {
                cleaned.push_str(&token[trimmed.len()..]);
            }
        } else {
            cleaned.push_str(token);
        }
    }
    let mut collapsed = cleaned.split_whitespace().collect::<Vec<_>>().join(" ");
    if collapsed.chars().count() > DIAGNOSTIC_NOTE_MAX_CHARS {
        collapsed = collapsed
            .chars()
            .take(DIAGNOSTIC_NOTE_MAX_CHARS)
            .collect::<String>();
    }
    (!collapsed.is_empty()).then_some(collapsed)
}

/// 一个词看起来像不像凭据、序列号或设备 ID。
///
/// 判断只看形状，不看它自称是什么：长串的十六进制、长串数字、带 @ 的地址、
/// MAC 形状，都直接换掉。宁可多抹一个型号编号，也不要漏出一个 token。
fn looks_like_secret(token: &str) -> bool {
    let value = token.trim_matches(|character: char| {
        !character.is_alphanumeric() && character != '@' && character != ':' && character != '-'
    });
    if value.chars().count() < 8 {
        return false;
    }
    if value.contains('@') && value.contains('.') {
        return true;
    }
    // aa:bb:cc:dd:ee:ff 形状的 MAC 地址
    let colon_groups: Vec<&str> = value.split(':').collect();
    if colon_groups.len() >= 6
        && colon_groups
            .iter()
            .all(|group| group.len() == 2 && group.chars().all(|c| c.is_ascii_hexdigit()))
    {
        return true;
    }
    let alnum = value.chars().filter(|c| c.is_ascii_alphanumeric()).count();
    let digits = value.chars().filter(|c| c.is_ascii_digit()).count();
    if alnum >= 16
        && value
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return true;
    }
    digits >= 10
}

/// 逐台设备把「用户指认的型号」和「这台设备的型号类编号」配成对。
///
/// 一份响应里可能有好几台设备，所以配对必须在设备粒度上做，不能把一堆编号和
/// 一堆型号平铺在一起让服务端去猜。没有编号可交的设备直接跳过：只有型号没有
/// 编号，对补目录没有任何用处。
fn collect_assigned_models(
    db: &zeppbridge_core::storage::Database,
    payload: &Value,
) -> Vec<DiagnosticAssignedModel> {
    let mut out = Vec::new();
    for item in device_items(payload) {
        let mut hints = BTreeSet::new();
        collect_model_identifier_hints(&item, &mut hints);
        if hints.is_empty() {
            continue;
        }
        let extra = flattened_device_metadata(&item);
        let device_id = first_string(&item, &["deviceId", "device_id", "macAddress"])
            .or_else(|| first_string(&extra, &["deviceId", "device_id"]));
        let serial = first_string(&extra, &["sn", "serial", "serialNumber"])
            .or_else(|| first_string(&item, &["sn", "serial", "serialNumber"]));
        let keys = [device_id.as_deref(), serial.as_deref()]
            .into_iter()
            .flatten()
            .collect::<Vec<_>>();
        if keys.is_empty() {
            continue;
        }
        let Ok(Some(assigned)) = db.device_model_override(&keys) else {
            continue;
        };
        out.push(DiagnosticAssignedModel {
            catalog_id: assigned.catalog_id,
            model_identifier_hints: hints.into_iter().take(8).collect(),
        });
    }
    out.sort_by(|a, b| a.catalog_id.cmp(&b.catalog_id));
    out.dedup();
    out
}

const FEEDBACK_ENDPOINT: &str = "https://zeppbridge.pages.dev/api/feedback";

#[tauri::command]
pub async fn submit_diagnostic_report(
    state: tauri::State<'_, AppState>,
    note: Option<String>,
    category: Option<String>,
) -> std::result::Result<FeedbackSubmissionResult, AppError> {
    let mut report = build_diagnostic_report(&state, false, note.as_deref()).await?;
    report.category = normalize_report_category(category.as_deref());
    post_diagnostic_report(report).await
}

/// 用户选的问题类型。只认固定几个取值——这是个分类，不是又一个自由文本框。
fn normalize_report_category(value: Option<&str>) -> Option<String> {
    const ALLOWED: [&str; 4] = ["device", "workout", "data", "other"];
    let value = value?.trim();
    ALLOWED
        .iter()
        .find(|allowed| **allowed == value)
        .map(|allowed| (*allowed).to_string())
}

/// 把「用户指认的型号 ↔ 这台设备的型号类编号」交回来，让下一版目录能自动
/// 识别同款设备。
///
/// 单独一个命令而不是在指认时自动发送：用户在选择器里勾选了才会走到这里，
/// 设置页那句「应用不会自动上报任何使用行为」才不会变成空话。
#[tauri::command]
pub async fn submit_device_model_assignment(
    state: tauri::State<'_, AppState>,
    note: Option<String>,
) -> std::result::Result<FeedbackSubmissionResult, AppError> {
    let report = build_diagnostic_report(&state, true, note.as_deref()).await?;
    if report.user_assigned_models.is_empty() {
        return Err(AppError::new(
            "err.diagnostic.nothing_to_submit",
            "这台设备没有可用于补充目录的型号编号，暂时不需要提交",
        ));
    }
    post_diagnostic_report(report).await
}

async fn post_diagnostic_report(
    report: DiagnosticReport,
) -> std::result::Result<FeedbackSubmissionResult, AppError> {
    // 自动检测到问题，或者用户自己说了「我要报什么」，两条路都算数。
    //
    // 以前只认前者：本机没检测到异常时，用户哪怕手打了一整段说明也会被
    // 「无需提交报告」顶回去，而界面上又没有任何地方让他说明报的是什么。
    // 用户比检测器更清楚自己遇到了什么。
    let has_reportable_issue = report.device_evidence.unknown_device_count > 0
        || !report.user_assigned_models.is_empty()
        || !report.unknown_workout_codes.is_empty()
        // 一次运动类型纠正本身就是一条可处理的线索：它说的是「这个编号你们
        // 认错了」。以前这种情况本机检测不到——编号我们认识，只是认错了——
        // 于是报告会被判成「没有可处理的内容」顶回去。
        || !report.workout_type_corrections.is_empty()
        || report.workout_type_conflicts > 0
        || report.category.is_some();
    if !has_reportable_issue {
        return Err(AppError::new(
            "err.diagnostic.empty_report",
            "请先选择要反馈的问题类型，或写一句说明——否则这份报告里没有任何可处理的内容",
        ));
    }

    // This client is intentionally separate from the Zepp connector: it has
    // no cookie jar and receives no account token or cloud headers.
    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(5))
        .timeout(Duration::from_secs(12))
        .user_agent(format!("ZeppBridge/{} feedback", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|_| {
            AppError::new(
                "err.diagnostic.client_init_failed",
                "无法初始化错误报告连接",
            )
        })?;
    let response = client
        .post(FEEDBACK_ENDPOINT)
        .json(&report)
        .send()
        .await
        .map_err(|_| {
            AppError::new(
                "err.diagnostic.send_failed",
                "错误报告发送失败，请检查网络后重试",
            )
        })?;
    // 状态码要带出来。只说「服务暂时不可用」的话，字段被拒（4xx）和服务端
    // 真的挂了（5xx）长得一模一样，谁也查不下去。响应体不带——那是别人的
    // 服务器写的内容，不该原样显示给用户。
    let status = response.status();
    if !status.is_success() {
        // 限流要有自己的码：它和「字段对不上」都是 4xx，但用户要做的事完全
        // 不同——一个是等一会儿再来，一个是升级客户端。共用一个码时，界面
        // 只能显示同一句「服务返回了错误」，等于什么都没说。
        if status.as_u16() == 429 {
            return Err(AppError::new(
                "err.diagnostic.rate_limited",
                "短时间内提交了太多份报告，请过一会儿再试",
            ));
        }
        let hint = if status.is_client_error() {
            "这个版本发出的报告字段和服务端对不上（可能服务端还没更新）"
        } else {
            "错误报告服务暂时不可用，请稍后重试"
        };
        return Err(AppError::new(
            "err.diagnostic.http_error",
            format!("{hint}（HTTP {}）", status.as_u16()),
        )
        .with_params(serde_json::json!({ "status": status.as_u16() })));
    }
    response
        .json::<FeedbackSubmissionResult>()
        .await
        .map_err(|_| {
            AppError::new(
                "err.diagnostic.bad_response",
                "错误报告服务返回了无法识别的结果",
            )
        })
}

#[tauri::command]
pub async fn get_export_json(
    state: tauri::State<'_, AppState>,
    selection: ExportSelection,
) -> std::result::Result<String, AppError> {
    let result = {
        let db = state.db.lock().await;
        db.build_ai_export(&selection).map_err(AppError::from)
    }?;
    Ok(result.0)
}

#[tauri::command]
pub async fn save_json_export(
    state: tauri::State<'_, AppState>,
    selection: ExportSelection,
    path: String,
) -> std::result::Result<ExportResult, AppError> {
    let path = validate_json_export_path(&path)?;
    write_export(&state, selection, Some(path), false).await
}

#[tauri::command]
pub async fn publish_ai_export(
    state: tauri::State<'_, AppState>,
    selection: ExportSelection,
) -> std::result::Result<ExportResult, AppError> {
    write_export(&state, selection, None, true).await
}

/// Save the selection as a tidy CSV table.
///
/// `record_count` is the number of data rows, not the number of source
/// records: one sleep session or workout expands into one row per metric it
/// actually has.
#[tauri::command]
pub async fn save_csv_export(
    state: tauri::State<'_, AppState>,
    selection: ExportSelection,
    path: String,
) -> std::result::Result<ExportResult, AppError> {
    let path = validate_export_path(&path, "csv")?;
    write_converted_export(&state, selection, path, export_formats::to_csv, "CSV").await
}

/// Save the GPS tracks of the selection as GPX 1.1.
///
/// `record_count` is the number of track points. Workouts without decoded
/// route points contribute nothing, and a selection with no points at all is
/// an error rather than an empty file.
#[tauri::command]
pub async fn save_gpx_export(
    state: tauri::State<'_, AppState>,
    selection: ExportSelection,
    path: String,
) -> std::result::Result<ExportResult, AppError> {
    let path = validate_export_path(&path, "gpx")?;
    write_converted_export(&state, selection, path, export_formats::to_gpx, "GPX").await
}

/// Shared body for the non-JSON exports: build the same canonical payload the
/// JSON export uses, convert it, then write atomically. Conversion failures
/// (including "nothing to write") happen before any file is touched.
async fn write_converted_export(
    state: &AppState,
    mut selection: ExportSelection,
    path: PathBuf,
    convert: fn(&Value) -> std::result::Result<(String, usize), String>,
    label: &str,
) -> std::result::Result<ExportResult, AppError> {
    // CSV rows and GPX track points come from the per-second series, which the
    // summary export omits by design. These formats are archival, so they
    // always read the full payload regardless of what the UI has selected.
    selection.detail = ExportDetail::Full;
    let (encoded, record_count) = {
        let db = state.db.lock().await;
        db.build_ai_export(&selection)?
    };
    if record_count == 0 {
        return Err(AppError::new(
            "err.export.empty_range",
            "这段时间没有可导出的记录",
        ));
    }
    let export: Value = serde_json::from_str(&encoded).map_err(|error| {
        AppError::new(
            "err.export.read_failed",
            format!("读取导出数据失败: {error}"),
        )
    })?;
    let (converted, converted_count) = convert(&export).map_err(|message| {
        AppError::new("err.export.convert_failed", message)
            .with_params(serde_json::json!({ "format": label }))
    })?;

    let generated_at = Utc::now();
    write_file_atomically(&path, converted.as_bytes()).map_err(|error| {
        AppError::new(
            "err.export.write_failed",
            format!("写入 {label} 导出失败: {error}"),
        )
        .with_params(serde_json::json!({ "format": label }))
    })?;
    Ok(ExportResult {
        path: path.to_string_lossy().into_owned(),
        record_count: converted_count,
        bytes: converted.len(),
        generated_at: generated_at.to_rfc3339(),
    })
}

/// Prepare a privacy-preserving payload for an external AI provider.
///
/// This deliberately calls the same database export builder as the normal
/// local export paths, then applies a second, recursive redaction pass. The
/// existing `get_export_json`, `save_json_export`, and `publish_ai_export`
/// commands remain unchanged so local exports retain their current semantics.
#[tauri::command]
pub async fn prepare_ai_handoff(
    state: tauri::State<'_, AppState>,
    selection: ExportSelection,
    prompt: String,
    include_precise_route: Option<bool>,
) -> std::result::Result<AiHandoffResult, AppError> {
    let prompt = sanitize_clipboard_text(prompt.trim());
    if prompt.is_empty() {
        return Err(AppError::new(
            "err.handoff.prompt_required",
            "请先填写提示词",
        ));
    }

    let (encoded, record_count) = {
        let db = state.db.lock().await;
        db.build_ai_export(&selection)?
    };
    if record_count == 0 {
        return Err(AppError::new(
            "err.handoff.empty_range",
            "这段时间没有可交接的记录",
        ));
    }

    let include_precise_route = include_precise_route.unwrap_or(false);
    let (redacted, redactions) = redact_ai_export(&encoded, include_precise_route)?;
    let bytes = redacted.len();
    let mode = ai_handoff_mode_for_bytes(bytes);
    let (clipboard_text, file_path) = if mode == "inline" {
        (
            format!("{prompt}\n\n以下是已脱敏的健康数据（JSON）：\n{redacted}"),
            None,
        )
    } else {
        let target_dir = directories::UserDirs::new()
            .and_then(|u| u.desktop_dir().map(|p| p.to_path_buf()))
            .unwrap_or_else(|| state.data_dir.join("exports"));
        std::fs::create_dir_all(&target_dir).map_err(|error| {
            AppError::new(
                "err.handoff.mkdir_failed",
                format!("创建数据包导出目录失败: {error}"),
            )
        })?;
        let path = target_dir.join("zeppbridge-ai-handoff.json");
        write_file_atomically(&path, redacted.as_bytes()).map_err(|error| {
            AppError::new(
                "err.handoff.write_failed",
                format!("写入脱敏 AI 数据到桌面失败: {error}"),
            )
        })?;
        (
            format!("{prompt}\n\n数据包已导出到桌面（zeppbridge-ai-handoff.json），拖入 AI 对话框即可。"),
            Some(path.to_string_lossy().into_owned()),
        )
    };

    Ok(AiHandoffResult {
        mode: mode.to_string(),
        clipboard_text,
        file_path,
        bytes,
        records: record_count,
        redactions,
        metadata: AiHandoffMetadata {
            precise_route_included: include_precise_route,
            authentication_fields_removed: true,
            identity_fields_removed: true,
        },
    })
}

pub(crate) fn ai_handoff_mode_for_bytes(bytes: usize) -> &'static str {
    if bytes <= AI_HANDOFF_INLINE_LIMIT_BYTES {
        "inline"
    } else {
        "attachment"
    }
}

/// Recursively remove authentication, account/device identifiers, and (by
/// default) all precise route coordinates from an export JSON document.
///
/// The redaction list is policy-oriented rather than a list of user values;
/// it can therefore be safely returned to the UI and included in metadata.
pub(crate) fn redact_ai_export(
    encoded: &str,
    include_precise_route: bool,
) -> std::result::Result<(String, Vec<String>), AppError> {
    let mut value: Value = serde_json::from_str(encoded).map_err(|error| {
        AppError::new(
            "err.handoff.parse_failed",
            format!("解析 AI 导出 JSON 失败: {error}"),
        )
    })?;
    let mut redactions = BTreeSet::from([
        "authentication_fields".to_string(),
        "identity_fields".to_string(),
    ]);
    if !include_precise_route {
        redactions.insert("precise_route".to_string());
    }
    redact_value(&mut value, include_precise_route, &mut redactions);

    if let Some(root) = value.as_object_mut() {
        let redaction_values = redactions
            .iter()
            .cloned()
            .map(Value::String)
            .collect::<Vec<_>>();
        root.insert("redactions".to_string(), Value::Array(redaction_values));
        root.insert(
            "metadata".to_string(),
            serde_json::json!({
                "ai_handoff": true,
                "precise_route_included": include_precise_route,
                "authentication_fields_removed": true,
                "identity_fields_removed": true,
            }),
        );
    }

    let encoded = serde_json::to_string_pretty(&value).map_err(|error| {
        AppError::new(
            "err.handoff.encode_failed",
            format!("编码脱敏 AI 导出失败: {error}"),
        )
    })?;
    Ok((encoded, redactions.into_iter().collect()))
}

fn redact_value(value: &mut Value, include_precise_route: bool, redactions: &mut BTreeSet<String>) {
    match value {
        Value::Object(object) => redact_object(object, include_precise_route, redactions),
        Value::Array(items) => {
            for item in items {
                redact_value(item, include_precise_route, redactions);
            }
        }
        Value::String(text) => {
            let sanitized = sanitize_clipboard_text(text);
            if sanitized != *text {
                *text = sanitized;
                redactions.insert("local_paths".to_string());
            }
        }
        _ => {}
    }
}

fn redact_object(
    object: &mut Map<String, Value>,
    include_precise_route: bool,
    redactions: &mut BTreeSet<String>,
) {
    let keys = object.keys().cloned().collect::<Vec<_>>();
    for key in keys {
        let normalized = normalize_json_key(&key);
        let remove_auth = is_authentication_key(&normalized);
        let remove_identity = is_identity_key(&normalized);
        let remove_route = !include_precise_route && is_precise_route_key(&normalized);
        let remove_path = is_local_path_key(&normalized);
        if remove_auth || remove_identity || remove_route || remove_path {
            object.remove(&key);
            if remove_auth {
                redactions.insert("authentication_fields".to_string());
            } else if remove_identity {
                redactions.insert("identity_fields".to_string());
            } else if remove_route {
                redactions.insert("precise_route".to_string());
            } else {
                redactions.insert("local_paths".to_string());
            }
            continue;
        }
        if let Some(child) = object.get_mut(&key) {
            redact_value(child, include_precise_route, redactions);
        }
    }
}

fn normalize_json_key(key: &str) -> String {
    key.chars()
        .filter(|character| character.is_ascii_alphanumeric())
        .flat_map(|character| character.to_lowercase())
        .collect()
}

fn is_authentication_key(key: &str) -> bool {
    key.contains("token")
        || key.contains("auth")
        || key.contains("credential")
        || key.contains("secret")
        || key.contains("password")
        || key == "cookie"
        || key == "cookies"
        || key == "apikey"
        || key == "authorization"
}

fn is_identity_key(key: &str) -> bool {
    matches!(
        key,
        "user"
            | "username"
            | "userid"
            | "useraccount"
            | "account"
            | "accountid"
            | "accountname"
            | "serial"
            | "serialnumber"
            | "device"
            | "deviceid"
            | "record"
            | "workoutid"
            | "workout"
            | "sleepid"
            | "sleep"
            | "sessionid"
            | "recordid"
            | "sampleid"
            | "metricid"
            | "dailyid"
            | "sourceid"
            | "rawid"
            | "id"
            | "useridentifier"
            | "accountidentifier"
            | "deviceidentifier"
            | "serialidentifier"
            | "recordidentifier"
            | "workoutidentifier"
            | "sleepidentifier"
            | "sessionidentifier"
            | "useremail"
            | "accountemail"
            | "userphone"
            | "accountphone"
            | "email"
            | "phone"
            | "phonenumber"
            | "uuid"
            | "guid"
            | "identifier"
    ) || (key.ends_with("id")
        && [
            "user", "account", "device", "record", "workout", "sleep", "session", "sample",
            "metric", "daily", "source", "raw",
        ]
        .iter()
        .any(|prefix| key.starts_with(prefix)))
        || ([
            "user", "account", "device", "record", "workout", "sleep", "session", "serial",
        ]
        .iter()
        .any(|prefix| key.starts_with(prefix))
            && ["identifier", "uuid", "guid", "key", "number"]
                .iter()
                .any(|suffix| key.ends_with(suffix)))
        || key.contains("serial")
}

fn is_precise_route_key(key: &str) -> bool {
    matches!(
        key,
        "route"
            | "routepoints"
            | "routepoint"
            | "gps"
            | "location"
            | "locations"
            | "geolocation"
            | "geo"
            | "track"
            | "trackpoints"
            | "latitude"
            | "longitude"
            | "lat"
            | "lng"
            | "lon"
            | "coordinates"
            | "polyline"
    ) || key.contains("latitude")
        || key.contains("longitude")
        || key.contains("coordinate")
        || (key.starts_with("lat")
            && key
                .chars()
                .skip(3)
                .all(|character| character.is_ascii_digit() || character == 'e'))
        || (key.starts_with("lng")
            && key
                .chars()
                .skip(3)
                .all(|character| character.is_ascii_digit() || character == 'e'))
        || (key.starts_with("lon")
            && key
                .chars()
                .skip(3)
                .all(|character| character.is_ascii_digit() || character == 'e'))
        || key.contains("routepoint")
        || key.contains("trackpoint")
        || key == "latlng"
        || (key.starts_with("gps")
            && (key.contains("route")
                || key.contains("point")
                || key.contains("coord")
                || key.contains("track")))
}

fn is_local_path_key(key: &str) -> bool {
    matches!(
        key,
        "path"
            | "filepath"
            | "filename"
            | "file"
            | "sourcepath"
            | "databasepath"
            | "localpath"
            | "exportpath"
            | "directory"
            | "dirname"
    ) || key.ends_with("filepath")
        || key.ends_with("pathname")
}

fn sanitize_clipboard_text(text: &str) -> String {
    let mut output = String::with_capacity(text.len());
    let mut chars = text.chars().peekable();
    while let Some(character) = chars.next() {
        let previous = output.chars().last();
        let at_boundary = previous.is_none()
            || previous.is_some_and(|value| {
                value.is_whitespace() || matches!(value, '"' | '\'' | '(' | '[' | '{' | '=')
            });
        let is_windows_drive = at_boundary
            && character.is_ascii_alphabetic()
            && chars.peek() == Some(&':')
            && chars
                .clone()
                .nth(1)
                .is_some_and(|next| next == '\\' || next == '/');
        let is_unc = at_boundary && character == '\\' && chars.peek() == Some(&'\\');
        let is_unix =
            at_boundary && character == '/' && chars.peek().is_some_and(|next| *next != ' ');
        if is_windows_drive || is_unc || is_unix {
            output.push_str("[本地路径已移除]");
            if is_windows_drive {
                let _ = chars.next();
            }
            while let Some(next) = chars.peek() {
                if next.is_whitespace() || *next == '"' || *next == '\'' || *next == ')' {
                    break;
                }
                let _ = chars.next();
            }
        } else {
            output.push(character);
        }
    }
    output
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
) -> std::result::Result<ExportResult, AppError> {
    let (encoded, record_count) = {
        let db = state.db.lock().await;
        db.build_ai_export(&selection)?
    };
    // A zero-record export must not leave a misleading empty file on disk:
    // report an error before anything is written.
    if record_count == 0 {
        return Err(AppError::new(
            "err.export.empty_range",
            "这段时间没有可导出的记录",
        ));
    }
    let generated_at = Utc::now();
    let path = if let Some(path) = selected_path {
        path
    } else {
        let export_dir = state.data_dir.join("exports");
        std::fs::create_dir_all(&export_dir).map_err(|error| {
            AppError::new(
                "err.export.mkdir_failed",
                format!("创建导出目录失败: {error}"),
            )
        })?;
        let file_name = if stable_ai_feed {
            "zeppbridge-ai-feed.json".to_string()
        } else {
            // 文件名跟着范围走，所以单次运动导出不会和当天的整段导出撞名。
            let label = match selection.resolve_scope() {
                Ok(ExportScope::DateRange { start, end }) => format!("{start}-{end}"),
                Ok(ExportScope::Workout { workout_id }) => format!("workout-{workout_id}"),
                Err(_) => "export".to_string(),
            };
            format!(
                "zeppbridge-{label}-{}.json",
                generated_at.format("%Y%m%d-%H%M%S")
            )
        };
        export_dir.join(file_name)
    };
    write_file_atomically(&path, encoded.as_bytes()).map_err(|error| {
        AppError::new(
            "err.export.write_json_failed",
            format!("写入 JSON 导出失败: {error}"),
        )
    })?;
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

    if refresh.unwrap_or(false) {
        match refresh_device_profiles_from_cloud(&state).await {
            Ok((remote_profiles, fetched_at)) => {
                profiles = remote_profiles;
                cached_at = Some(fetched_at);
                refreshed = true;
            }
            Err(error) => {
                // Keep the last good cache and expose a safe, non-secret error
                // string for the settings surface.
                refresh_error = Some(error);
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
        },
    })
}

pub(crate) async fn refresh_device_profile(state: &AppState) {
    let _ = refresh_device_profiles_from_cloud(state).await;
}

async fn refresh_device_profiles_from_cloud(
    state: &AppState,
) -> std::result::Result<(Vec<DeviceProfile>, DateTime<Utc>), String> {
    let auth = state
        .auth
        .load_auth()
        .map_err(|_| "当前认证不可用".to_string())?
        .ok_or_else(|| "尚未配置 Zepp 认证".to_string())?;
    let connector = ZeppConnector::new(auth).map_err(|_| "无法建立 Zepp 连接".to_string())?;
    let payload = connector
        .fetch_devices()
        .await
        .map_err(|_| "设备目录刷新失败".to_string())?;
    let profiles = parse_device_profiles(&payload);
    if profiles.is_empty() {
        return Err("Zepp 未返回设备".to_string());
    }

    {
        let db = state.db.lock().await;
        for hint in profiles.iter().map(device_hint_from_profile) {
            db.upsert_device_identity(&hint)
                .map_err(|_| "本地设备索引写入失败".to_string())?;
        }
    }

    let cached_at = Utc::now();
    let cache_file = DeviceProfilesFile {
        version: 1,
        cached_at,
        profiles: profiles.clone(),
    };
    let encoded =
        serde_json::to_vec_pretty(&cache_file).map_err(|_| "设备目录缓存编码失败".to_string())?;
    write_file_atomically(&state.data_dir.join("devices.json"), &encoded)
        .map_err(|_| "设备目录缓存写入失败".to_string())?;
    Ok((profiles, cached_at))
}

async fn resolve_device_profile(
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
        return enrich_profile_with_local_data(state, profile, Some(device_id)).await;
    }
    if let Some(profile) = cached_profile {
        return enrich_profile_with_local_data(state, profile, Some(device_id)).await;
    }
    Ok(unknown_device_profile(device_id))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct DeviceProfilesFile {
    #[serde(default = "default_device_cache_version")]
    version: u32,
    cached_at: DateTime<Utc>,
    profiles: Vec<DeviceProfile>,
}

fn default_device_cache_version() -> u32 {
    1
}

#[derive(Debug, Default)]
struct CachedDeviceProfiles {
    profiles: Vec<DeviceProfile>,
    cached_at: Option<DateTime<Utc>>,
}

fn read_device_profile_cache(data_dir: &std::path::Path) -> CachedDeviceProfiles {
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

fn modified_at(path: &Path) -> Option<DateTime<Utc>> {
    let modified = std::fs::metadata(path).ok()?.modified().ok()?;
    Some(DateTime::<Utc>::from(modified))
}

fn profile_matches(profile: &DeviceProfile, needle: &str) -> bool {
    [&profile.device_id, &profile.serial]
        .into_iter()
        .flatten()
        .any(|value| value.eq_ignore_ascii_case(needle))
}

/// SQLite's identity index intentionally stores only stable lookup fields and
/// the user-facing name. Keep that nickname as the primary value while
/// recovering the versioned catalog fields from the richer devices.json cache
/// after an application restart.
fn merge_cached_device_profile(mut indexed: DeviceProfile, cached: DeviceProfile) -> DeviceProfile {
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

fn unknown_device_profile(device_id: &str) -> DeviceProfile {
    let device_id = device_id.trim();
    DeviceProfile {
        name: Some("设备未确定".into()),
        display_name: Some("设备未确定".into()),
        device_id: (!device_id.is_empty()).then(|| device_id.to_string()),
        match_status: DeviceMatchStatus::Unknown,
        ..DeviceProfile::default()
    }
}

async fn enrich_profiles_with_local_data(
    state: &AppState,
    profiles: Vec<DeviceProfile>,
) -> std::result::Result<Vec<DeviceProfile>, AppError> {
    let mut enriched = Vec::with_capacity(profiles.len());
    for profile in profiles {
        enriched.push(enrich_profile_with_local_data(state, profile, None).await?);
    }
    Ok(enriched)
}

async fn enrich_profile_with_local_data(
    state: &AppState,
    mut profile: DeviceProfile,
    requested_device_id: Option<&str>,
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
    let (has_local_data, last_data_at) = {
        let db = state.db.lock().await;
        db.device_data_summary(&aliases)?
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
fn apply_user_assignment(profile: &mut DeviceProfile, catalog_id: &str) -> bool {
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

fn apply_catalog_match(
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

fn empty_device_diagnostic(status: &str) -> DiagnosticDeviceEvidence {
    DiagnosticDeviceEvidence {
        status: status.into(),
        object_count: 0,
        unknown_device_count: 0,
        id_alias_objects: 0,
        serial_alias_objects: 0,
        name_field_objects: 0,
        firmware_field_objects: 0,
        candidates: Vec::new(),
        unmatched_product_hints: Vec::new(),
        model_identifier_hints: Vec::new(),
        shapes: Vec::new(),
    }
}

fn safe_product_hint(value: &str) -> Option<String> {
    let value = value.trim();
    if !(2..=64).contains(&value.chars().count())
        || value.contains(['@', '\\', ':'])
        || !value.chars().all(|ch| {
            ch.is_alphanumeric()
                || ch.is_whitespace()
                || matches!(ch, '-' | '_' | '/' | '(' | ')' | '.')
        })
    {
        return None;
    }
    let compact = value
        .chars()
        .filter(|ch| ch.is_alphanumeric())
        .collect::<String>();
    let looks_like_long_identifier =
        compact.len() >= 12 && compact.chars().all(|ch| ch.is_ascii_hexdigit());
    (!looks_like_long_identifier).then(|| value.to_owned())
}

fn collect_unmatched_product_hints(value: &Value, hints: &mut BTreeSet<String>, depth: usize) {
    if depth > 6 || hints.len() >= 12 {
        return;
    }
    match value {
        Value::Array(items) => {
            for item in items.iter().take(8) {
                collect_unmatched_product_hints(item, hints, depth + 1);
            }
        }
        Value::Object(object) => {
            for (key, child) in object {
                let is_product_hint = matches!(
                    key.as_str(),
                    "productName"
                        | "product_name"
                        | "modelName"
                        | "model"
                        | "modelCode"
                        | "model_code"
                        | "modelNumber"
                        | "hardwareModel"
                        | "productCode"
                        | "deviceType"
                );
                if is_product_hint {
                    if let Some(hint) = child.as_str().and_then(safe_product_hint) {
                        hints.insert(hint);
                    }
                }
                collect_unmatched_product_hints(child, hints, depth + 1);
                if key == "additionalInfo" || key == "bind_device" || key == "bindDevice" {
                    if let Some(raw) = child.as_str() {
                        if let Ok(decoded) = serde_json::from_str::<Value>(raw) {
                            collect_unmatched_product_hints(&decoded, hints, depth + 1);
                        }
                    }
                }
            }
        }
        _ => {}
    }
}

fn diagnostic_json_type(value: &Value) -> &'static str {
    match value {
        Value::Null => "null",
        Value::Bool(_) => "boolean",
        Value::Number(_) => "number",
        Value::String(_) => "string",
        Value::Array(_) => "array",
        Value::Object(_) => "object",
    }
}

fn diagnostic_field_name(key: &str) -> String {
    let safe = key.len() <= 64
        && key
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '_' | '-'))
        && key.chars().filter(|ch| ch.is_ascii_digit()).count() <= 12;
    if safe {
        key.to_owned()
    } else {
        "<dynamic_key>".into()
    }
}

fn collect_device_shapes(
    value: &Value,
    path: &str,
    evidence: &mut DiagnosticDeviceEvidence,
    shapes: &mut BTreeSet<DiagnosticObjectShape>,
    depth: usize,
) {
    if depth > 8 || shapes.len() >= 40 {
        return;
    }
    match value {
        Value::Array(items) => {
            for item in items.iter().take(8) {
                collect_device_shapes(item, &format!("{path}[]"), evidence, shapes, depth + 1);
            }
        }
        Value::Object(object) => {
            evidence.object_count += 1;
            let has_any = |names: &[&str]| names.iter().any(|name| object.contains_key(*name));
            evidence.id_alias_objects += usize::from(has_any(&[
                "device_id",
                "deviceId",
                "deviceid",
                "deviceSource",
                "macAddress",
            ]));
            evidence.serial_alias_objects +=
                usize::from(has_any(&["sn", "serial", "serialNumber"]));
            evidence.name_field_objects += usize::from(has_any(&[
                "displayName",
                "deviceName",
                "productName",
                "product_name",
                "modelName",
                "model",
                "nickname",
                "name",
            ]));
            evidence.firmware_field_objects += usize::from(has_any(&[
                "productVersion",
                "firmwareVersion",
                "hardwareVersion",
                "fwVersion",
                "bind_device",
                "bindDevice",
            ]));
            let mut fields = object
                .iter()
                .map(|(name, value)| DiagnosticField {
                    name: diagnostic_field_name(name),
                    json_type: diagnostic_json_type(value).into(),
                })
                .collect::<Vec<_>>();
            fields.sort();
            fields.dedup();
            shapes.insert(DiagnosticObjectShape {
                path: path.into(),
                fields,
            });
            for (key, child) in object {
                let child_path = format!("{path}.{}", diagnostic_field_name(key));
                collect_device_shapes(child, &child_path, evidence, shapes, depth + 1);
                if key == "additionalInfo" {
                    if let Some(raw) = child.as_str() {
                        if let Ok(decoded) = serde_json::from_str::<Value>(raw) {
                            collect_device_shapes(
                                &decoded,
                                &format!("{child_path}<json>"),
                                evidence,
                                shapes,
                                depth + 1,
                            );
                        }
                    }
                }
            }
        }
        _ => {}
    }
}

fn build_device_diagnostic(value: &Value) -> DiagnosticDeviceEvidence {
    let mut evidence = empty_device_diagnostic("available");
    let mut shapes = BTreeSet::new();
    collect_device_shapes(value, "$", &mut evidence, &mut shapes, 0);
    evidence.shapes = shapes.into_iter().collect();
    let mut seen = BTreeSet::new();
    let mut unmatched_product_hints = BTreeSet::new();
    let mut model_identifier_hints = BTreeSet::new();
    for item in device_items(value) {
        collect_model_identifier_hints(&item, &mut model_identifier_hints);
        let Some(profile) = parse_device_profiles(&item).into_iter().next() else {
            continue;
        };
        if profile.match_status == DeviceMatchStatus::Unknown {
            evidence.unknown_device_count += 1;
            collect_unmatched_product_hints(&item, &mut unmatched_product_hints, 0);
        }
        let (Some(catalog_id), Some(canonical_name)) = (profile.catalog_id, profile.canonical_name)
        else {
            continue;
        };
        if seen.insert(catalog_id.clone()) {
            evidence.candidates.push(DiagnosticDeviceCandidate {
                catalog_id,
                canonical_name,
                firmware: profile.firmware,
                match_status: profile.match_status,
            });
        }
    }
    evidence
        .candidates
        .sort_by(|a, b| a.catalog_id.cmp(&b.catalog_id));
    evidence.unmatched_product_hints = unmatched_product_hints.into_iter().collect();
    evidence.model_identifier_hints = model_identifier_hints.into_iter().take(8).collect();
    evidence
}

/// 收集型号类的数字标识。
///
/// 这些是「哪一款表」而不是「哪一台表」：只取整数，`deviceSource` 和
/// `deviceType` 在 Zepp 的接口里都是型号维度的取值。序列号、MAC、绑定时间和
/// 任何字符串一律不收 —— 没有它们这份报告也够补目录，收了就越界了。
/// 设备条目里的 `deviceSource` 数字。
///
/// **只取 `deviceSource`**。`deviceType` 长得像同一类东西，却是族码：反馈库里
/// `deviceType:0` 一个值就横跨二十款表，拿它去查目录只会张冠李戴。
fn device_source_numbers(item: &Value, extra: &Value) -> Vec<i64> {
    let mut out = Vec::new();
    for source in [item, extra] {
        let Some(object) = source.as_object() else {
            continue;
        };
        for key in ["deviceSource", "device_source"] {
            let Some(Value::Number(number)) = object.get(key) else {
                continue;
            };
            if let Some(value) = number.as_i64() {
                if value > 0 && !out.contains(&value) {
                    out.push(value);
                }
            }
        }
    }
    out
}

fn collect_model_identifier_hints(item: &Value, out: &mut BTreeSet<String>) {
    let extra = flattened_device_metadata(item);
    for (source, keys) in [
        (
            item,
            ["deviceSource", "device_source", "deviceType", "device_type"],
        ),
        (
            &extra,
            ["deviceSource", "device_source", "deviceType", "device_type"],
        ),
    ] {
        let Some(object) = source.as_object() else {
            continue;
        };
        for key in keys {
            let Some(Value::Number(number)) = object.get(key) else {
                continue;
            };
            let Some(value) = number.as_i64() else {
                continue;
            };
            if !(0..=99_999_999).contains(&value) {
                continue;
            }
            let canonical = if key.starts_with("deviceS") || key.starts_with("device_s") {
                "deviceSource"
            } else {
                "deviceType"
            };
            out.insert(format!("{canonical}:{value}"));
        }
    }
}

pub(crate) fn parse_device_profiles(value: &serde_json::Value) -> Vec<DeviceProfile> {
    let items = device_items(value);
    items
        .into_iter()
        .map(|item| {
            let extra = flattened_device_metadata(&item);
            let display_name =
                first_string(&item, &["displayName", "deviceName", "nickname", "name"]).or_else(
                    || first_string(&extra, &["displayName", "deviceName", "nickname", "name"]),
                );
            let mut product_names = merged_string_values(
                &item,
                &extra,
                &["productName", "product_name", "modelName", "model"],
            );
            // `productId` / `hardwareVersion` are sometimes the internal
            // codename ("amazfit_balance2"), which normalizes to exactly the
            // same string as the catalog alias "Amazfit Balance 2". Alias
            // matching is equality on the normalized form, so a value that is
            // not a product name simply matches nothing.
            product_names.extend(merged_string_values(
                &item,
                &extra,
                &["productId", "product_id", "hardwareVersion"],
            ));
            product_names.sort();
            product_names.dedup();
            let mut model_codes = string_values(
                &item,
                &[
                    "modelCode",
                    "model_code",
                    "modelNumber",
                    "hardwareModel",
                    "productCode",
                ],
            );
            model_codes.extend(string_values(
                &extra,
                &[
                    "modelCode",
                    "model_code",
                    "modelNumber",
                    "hardwareModel",
                    "productCode",
                ],
            ));
            // Some accounts' device list carries no product-name field at all
            // (issue #4: nameFieldObjects = 0). The only model-class facts in
            // that payload are these numeric/short identifiers, so they have to
            // reach the matcher — otherwise the watch is unidentifiable by
            // construction no matter how complete the catalog gets.
            //
            // Feeding them in does not invent a mapping: the bundled catalog
            // still has to carry the value before anything matches.
            model_codes.extend(merged_string_values(
                &item,
                &extra,
                &[
                    "deviceSource",
                    "device_source",
                    "deviceType",
                    "device_type",
                    "productId",
                    "product_id",
                    "hardwareVersion",
                ],
            ));
            model_codes.sort();
            model_codes.dedup();
            // deviceSource 另走一条路，不跟上面那些字符串混在一起。
            //
            // 上面那一坨里 `deviceType` 也在，而它是族码——光 deviceType:0 一个
            // 值在反馈库里就横跨二十款表。两者一旦并成一列，目录里就没办法只
            // 收 deviceSource 而不误收 deviceType。
            let device_source_codes = device_source_numbers(&item, &extra);
            let device_names = merged_string_values(&item, &extra, &["deviceName", "deviceType"]);
            let device_id = first_string(
                &item,
                &["deviceId", "device_id", "deviceSource", "macAddress"],
            )
            .or_else(|| first_string(&extra, &["deviceId", "device_id", "macAddress"]));
            if let Some(device_id) = device_id.as_deref() {
                if device_id.starts_with('A')
                    && device_id.chars().skip(1).all(|c| c.is_ascii_digit())
                {
                    model_codes.push(device_id.to_string());
                }
            }
            let names = product_names.iter().map(String::as_str).collect::<Vec<_>>();
            let device_name_refs = device_names.iter().map(String::as_str).collect::<Vec<_>>();
            let model_code_refs = model_codes.iter().map(String::as_str).collect::<Vec<_>>();
            let matched = match_catalog(&CatalogMatchInput {
                device_source_codes,
                model_codes: model_code_refs,
                product_names: names,
                device_names: device_name_refs,
                display_name: display_name.as_deref(),
            });
            let mut profile = DeviceProfile {
                name: display_name
                    .clone()
                    .or_else(|| product_names.first().cloned()),
                display_name,
                canonical_name: None,
                catalog_id: None,
                kind: None,
                image_key: None,
                match_status: DeviceMatchStatus::Unknown,
                has_local_data: false,
                last_data_at: None,
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
                device_id,
                timezone: first_string(&extra, &["bind_timezone", "timezone", "tz"]).filter(
                    |value| value.contains('/') || value.chars().any(|ch| ch.is_ascii_alphabetic()),
                ),
            };
            if let Some(matched) = matched {
                apply_catalog_match(&mut profile, matched.entry, matched.status);
            }
            profile
        })
        .filter(|profile| {
            profile.device_id.is_some() || profile.serial.is_some() || profile.name.is_some()
        })
        .collect()
}

fn merge_device_metadata(target: &mut Map<String, Value>, value: &Value, depth: usize) {
    if depth > 6 {
        return;
    }
    let decoded;
    let value = if let Some(raw) = value.as_str() {
        decoded = serde_json::from_str::<Value>(raw).ok();
        decoded.as_ref().unwrap_or(value)
    } else {
        value
    };
    let Some(object) = value.as_object() else {
        return;
    };
    for (key, child) in object {
        target.entry(key.clone()).or_insert_with(|| child.clone());
        if matches!(
            key.as_str(),
            "additionalInfo" | "bind_device" | "bindDevice" | "deviceInfo" | "device_info"
        ) {
            merge_device_metadata(target, child, depth + 1);
        }
    }
}

fn flattened_device_metadata(item: &Value) -> Value {
    let mut merged = Map::new();
    merge_device_metadata(&mut merged, item, 0);
    Value::Object(merged)
}

fn device_items(value: &serde_json::Value) -> Vec<serde_json::Value> {
    if let Some(array) = value.as_array() {
        return array.clone();
    }
    if let Some(object) = value.as_object() {
        for key in ["items", "devices", "list", "results", "data"] {
            if let Some(child) = object.get(key) {
                let items = device_items(child);
                if !items.is_empty() {
                    return items;
                }
            }
        }
    }
    vec![value.clone()]
}

fn string_values(value: &serde_json::Value, keys: &[&str]) -> Vec<String> {
    let Some(object) = value.as_object() else {
        return Vec::new();
    };
    let mut values = Vec::new();
    for key in keys {
        match object.get(*key) {
            Some(serde_json::Value::String(text)) if !text.trim().is_empty() => {
                values.push(text.trim().to_string());
            }
            Some(serde_json::Value::Number(number)) => values.push(number.to_string()),
            Some(serde_json::Value::Array(items)) => {
                values.extend(items.iter().filter_map(|item| match item {
                    serde_json::Value::String(text) if !text.trim().is_empty() => {
                        Some(text.trim().to_string())
                    }
                    serde_json::Value::Number(number) => Some(number.to_string()),
                    _ => None,
                }));
            }
            _ => {}
        }
    }
    values.sort();
    values.dedup();
    values
}

fn merged_string_values(
    primary: &serde_json::Value,
    secondary: &serde_json::Value,
    keys: &[&str],
) -> Vec<String> {
    let mut values = string_values(primary, keys);
    values.extend(string_values(secondary, keys));
    values.sort();
    values.dedup();
    values
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

fn validate_json_export_path(value: &str) -> std::result::Result<PathBuf, AppError> {
    validate_export_path(value, "json")
}

/// Validate a user-picked export destination for one concrete format.
///
/// The extension check is not cosmetic: it keeps a mistyped destination from
/// silently producing a file whose contents do not match its name.
fn validate_export_path(value: &str, extension: &str) -> std::result::Result<PathBuf, AppError> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(AppError::new(
            "err.export.path_required",
            format!("请选择 {} 文件的保存位置", extension.to_ascii_uppercase()),
        )
        .with_params(serde_json::json!({ "format": extension.to_ascii_uppercase() })));
    }
    let path = PathBuf::from(trimmed);
    if !path.is_absolute() {
        return Err(AppError::new(
            "err.export.path_not_absolute",
            "保存位置必须是绝对路径",
        ));
    }
    let matches_extension = path
        .extension()
        .and_then(|value| value.to_str())
        .is_some_and(|value| value.eq_ignore_ascii_case(extension));
    if !matches_extension {
        return Err(AppError::new(
            "err.export.bad_extension",
            format!("导出文件必须使用 .{extension} 扩展名"),
        )
        .with_params(serde_json::json!({ "extension": extension })));
    }
    let Some(parent) = path
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
    else {
        return Err(AppError::new(
            "err.export.path_no_parent",
            "保存位置缺少有效的文件夹",
        ));
    };
    if !parent.is_dir() {
        return Err(AppError::new(
            "err.export.parent_missing",
            "所选保存文件夹不存在",
        ));
    }
    Ok(path)
}

#[cfg(test)]
mod tests {
    use super::{
        ai_handoff_mode_for_bytes, apply_user_assignment, build_device_diagnostic,
        device_source_numbers, merge_cached_device_profile, parse_device_profile,
        parse_device_profiles, read_device_profile_cache, redact_ai_export,
        sanitize_diagnostic_note, unknown_device_profile, validate_json_export_path,
        AI_HANDOFF_INLINE_LIMIT_BYTES, DIAGNOSTIC_NOTE_MAX_CHARS,
    };
    use crate::models::{DeviceMatchStatus, DeviceProfile};
    use serde_json::json;
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

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
    fn diagnostic_device_report_contains_shapes_but_never_payload_values() {
        let token = "SECRET-APP-TOKEN-DO-NOT-LEAK";
        let serial = "SERIAL-PRIVATE-998877";
        let account = "ACCOUNT-PRIVATE-112233";
        let payload = json!({
            "accountId": account,
            "appToken": token,
            "items": [{
                "deviceId": "MAC-PRIVATE-AA-BB-CC",
                "displayName": "My private nickname",
                "additionalInfo": serde_json::to_string(&json!({
                    "productName": "Amazfit Balance 2",
                    "productVersion": "6.2.208.7",
                    "sn": serial,
                    "gps": { "latitude": 31.2345, "longitude": 121.4567 },
                    "heartRate": 188,
                    "futureSecret": "UNKNOWN-FIELD-VALUE"
                })).unwrap()
            }]
        });
        let report = build_device_diagnostic(&payload);
        let encoded = serde_json::to_string(&report).unwrap();
        for secret in [
            token,
            serial,
            account,
            "MAC-PRIVATE-AA-BB-CC",
            "My private nickname",
            "31.2345",
            "121.4567",
            "188",
            "UNKNOWN-FIELD-VALUE",
        ] {
            assert!(!encoded.contains(secret), "diagnostic leaked {secret}");
        }
        assert!(encoded.contains("additionalInfo"));
        assert!(encoded.contains("productName"));
        assert!(encoded.contains("Amazfit Balance 2"));
        assert!(encoded.contains("6.2.208.7"));
        assert_eq!(report.id_alias_objects, 1);
        assert_eq!(report.serial_alias_objects, 1);
    }

    /// 真实反馈（issue #4）里的设备响应形状：整个对象没有任何产品名字段，
    /// 只有 `deviceSource` / `deviceType` / `productId` 这类数字。
    ///
    /// 这个用例钉住两件事：目录里没有对应编号时必须诚实地判为未识别（不能
    /// 靠猜一个型号来「修好」），以及诊断报告必须带上型号类数字，否则内置
    /// 目录永远补不全，这台表对每个用户都会一直是未识别。
    #[test]
    fn a_device_response_with_no_product_name_stays_unknown_and_reports_model_numbers() {
        let payload = json!({
            "items": [{
                "deviceId": "0123456789abcdef",
                "deviceSource": 7930112,
                "deviceType": 5,
                "macAddress": "AA:BB:CC:DD:EE:FF",
                "sn": "SERIAL-PRIVATE-998877",
                "firmwareVersion": "6.2.208.7",
                "additionalInfo": serde_json::to_string(&json!({
                    "productId": "8290304",
                    "productVersion": "6.2.208.7",
                    "hardwareVersion": "1.0",
                    "btmac": "AA:BB:CC:DD:EE:FF",
                    "sn": "SERIAL-PRIVATE-998877"
                })).unwrap()
            }]
        });

        let profile = parse_device_profile(&payload);
        assert_eq!(
            profile.match_status,
            DeviceMatchStatus::Unknown,
            "目录里没有这些编号时不许猜一个型号出来"
        );
        assert!(profile.canonical_name.is_none());
        assert_eq!(profile.firmware.as_deref(), Some("6.2.208.7"));

        let report = build_device_diagnostic(&payload);
        assert_eq!(report.name_field_objects, 0, "这份响应里确实没有名字字段");
        assert_eq!(report.unknown_device_count, 1);
        assert!(
            report
                .model_identifier_hints
                .contains(&"deviceSource:7930112".to_string()),
            "缺了型号编号，内置目录就永远补不上: {:?}",
            report.model_identifier_hints
        );
        assert!(report
            .model_identifier_hints
            .contains(&"deviceType:5".to_string()));

        // 型号线索只能是「哪一款」，不能夹带「哪一台」。
        let encoded = serde_json::to_string(&report.model_identifier_hints).unwrap();
        for private in [
            "SERIAL-PRIVATE-998877",
            "AA:BB:CC:DD:EE:FF",
            "0123456789abcdef",
        ] {
            assert!(!encoded.contains(private), "型号线索泄露了 {private}");
        }
    }

    /// 反馈汇总出来的 deviceSource 一旦进了目录，同款设备就自动认得出来。
    ///
    /// 这是上面那条用例的另一半：`7930112` 没有第二份报告，所以仍然是未识别；
    /// `8716547` 有七份用户指认，所以现在直接就是 T-Rex 3——用户不必再手动指认
    /// 一次。整条回路（用户指认 → 反馈库 → 目录 → 自动识别）就是靠这个闭上的。
    #[test]
    fn a_contributed_device_source_number_is_recognised_without_any_product_name() {
        let payload = json!({
            "items": [{
                "deviceId": "0123456789abcdef",
                "deviceSource": 8716547,
                "deviceType": 0,
                "macAddress": "AA:BB:CC:DD:EE:FF",
                "sn": "SERIAL-PRIVATE-998877",
                "firmwareVersion": "6.2.208.7"
            }]
        });

        let profile = parse_device_profile(&payload);
        assert_eq!(profile.catalog_id.as_deref(), Some("amazfit-t-rex-3"));
        assert_eq!(profile.match_status, DeviceMatchStatus::Exact);
    }

    /// `deviceType` 绝不能用来查目录。
    ///
    /// 反馈库里 `deviceType:0` 一个值横跨二十款表。它和 `deviceSource` 长得像，
    /// 就挨着放在同一个 JSON 对象里，很容易被顺手一起喂进匹配器——那样每一台
    /// 设备都会被认成同一款。
    #[test]
    fn device_type_is_never_used_to_look_up_the_catalog() {
        let extra = json!({});
        let item = json!({ "deviceType": 8716547, "deviceSource": 0 });
        assert!(
            device_source_numbers(&item, &extra).is_empty(),
            "deviceType 的值不该被当成 deviceSource"
        );

        let item = json!({ "deviceSource": 8716547, "deviceType": 0 });
        assert_eq!(device_source_numbers(&item, &extra), vec![8716547]);
    }

    /// `productId` / `hardwareVersion` 有时就是内部代号，归一化之后和目录别名
    /// 完全相同。把它们喂进匹配器不是在猜，而是让本来就存在的等价关系生效。
    #[test]
    fn internal_codename_fields_can_still_match_a_catalog_alias() {
        let value = json!({
            "items": [{
                "deviceId": "0123456789abcdef",
                "additionalInfo": {
                    "productId": "amazfit_t-rex_3",
                    "productVersion": "1.2.3.4"
                }
            }]
        });
        let profile = parse_device_profile(&value);
        assert_eq!(
            profile.canonical_name.as_deref(),
            Some("Amazfit T-Rex 3 48mm")
        );
        assert_eq!(profile.match_status, DeviceMatchStatus::Alias);
    }

    #[test]
    fn parse_device_profiles_reads_model_names_from_additional_info() {
        let value = json!({
            "items": [{
                "deviceId": "device-pro",
                "displayName": "我的 Pro 表",
                "additionalInfo": {
                    "productName": "Amazfit T-Rex 3 Pro",
                    "deviceName": "T-Rex 3 Pro 48mm",
                    "model": "T-Rex 3 Pro"
                }
            }]
        });
        let profile = parse_device_profile(&value);
        assert_eq!(profile.name.as_deref(), Some("我的 Pro 表"));
        assert_eq!(
            profile.canonical_name.as_deref(),
            Some("Amazfit T-Rex 3 Pro 48mm/44mm")
        );
        assert_eq!(profile.match_status, DeviceMatchStatus::Alias);
    }

    #[test]
    fn parse_device_profiles_reads_double_nested_bind_metadata() {
        let nested = serde_json::to_string(&json!({
            "bindDevice": serde_json::to_string(&json!({
                "productName": "Amazfit Balance 2",
                "productVersion": "6.2.208.7"
            })).unwrap()
        }))
        .unwrap();
        let value = json!({
            "items": [{
                "deviceId": "private-device-id",
                "displayName": "我的手表",
                "additionalInfo": nested
            }]
        });
        let profile = parse_device_profile(&value);
        assert_eq!(profile.catalog_id.as_deref(), Some("amazfit-balance-2"));
        assert_eq!(profile.canonical_name.as_deref(), Some("Amazfit Balance 2"));
        assert_eq!(profile.firmware.as_deref(), Some("6.2.208.7"));
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
    fn catalog_matching_preserves_nickname_and_covers_real_devices() {
        let value = json!({
            "items": [
                {
                    "deviceId": "A2323",
                    "displayName": "我的户外表",
                    "productName": "Amazfit T-Rex 3"
                },
                {
                    "deviceId": "strap-1",
                    "displayName": "训练带",
                    "productName": "Helio Strap"
                },
                {
                    "deviceId": "A2321",
                    "displayName": "夜间戒指",
                    "productName": "Amazfit Helio Ring"
                },
                {
                    "deviceId": "unknown-1",
                    "displayName": "未知设备"
                }
            ]
        });
        let profiles = parse_device_profiles(&value);
        assert_eq!(profiles.len(), 4);
        assert_eq!(profiles[0].name.as_deref(), Some("我的户外表"));
        assert_eq!(
            profiles[0].canonical_name.as_deref(),
            Some("Amazfit T-Rex 3 48mm")
        );
        assert_eq!(profiles[0].catalog_id.as_deref(), Some("amazfit-t-rex-3"));
        assert_eq!(profiles[0].match_status, DeviceMatchStatus::Exact);
        assert_eq!(
            profiles[1].catalog_id.as_deref(),
            Some("amazfit-helio-strap")
        );
        assert_eq!(profiles[1].match_status, DeviceMatchStatus::Alias);
        assert_eq!(
            profiles[2].catalog_id.as_deref(),
            Some("amazfit-helio-ring")
        );
        assert_eq!(profiles[2].match_status, DeviceMatchStatus::Exact);
        assert_eq!(profiles[3].match_status, DeviceMatchStatus::Unknown);
        assert!(profiles[3].catalog_id.is_none());
    }

    #[test]
    fn indexed_identity_keeps_nickname_and_recovers_cached_catalog_fields() {
        let indexed = super::DeviceProfile {
            name: Some("我的户外表".into()),
            device_id: Some("A2323".into()),
            match_status: DeviceMatchStatus::Unknown,
            ..Default::default()
        };
        let cached = super::DeviceProfile {
            name: Some("我的户外表".into()),
            display_name: Some("我的户外表".into()),
            canonical_name: Some("Amazfit T-Rex 3 48mm".into()),
            catalog_id: Some("amazfit-t-rex-3".into()),
            kind: Some("watch".into()),
            image_key: Some("amazfit-t-rex-3".into()),
            match_status: DeviceMatchStatus::Exact,
            device_id: Some("A2323".into()),
            ..Default::default()
        };
        let merged = merge_cached_device_profile(indexed, cached);
        assert_eq!(merged.name.as_deref(), Some("我的户外表"));
        assert_eq!(
            merged.canonical_name.as_deref(),
            Some("Amazfit T-Rex 3 48mm")
        );
        assert_eq!(merged.catalog_id.as_deref(), Some("amazfit-t-rex-3"));
        assert_eq!(merged.match_status, DeviceMatchStatus::Exact);
    }

    #[test]
    fn legacy_devices_json_is_read_with_new_defaults() {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("zeppbridge-device-cache-{suffix}"));
        fs::create_dir_all(&dir).unwrap();
        fs::write(
            dir.join("devices.json"),
            r#"[{"name":"Legacy T-Rex","device_id":"SN-LEGACY"}]"#,
        )
        .unwrap();
        let cache = read_device_profile_cache(&dir);
        assert_eq!(cache.profiles.len(), 1);
        assert_eq!(cache.profiles[0].name.as_deref(), Some("Legacy T-Rex"));
        assert_eq!(cache.profiles[0].match_status, DeviceMatchStatus::Unknown);
        assert!(cache.cached_at.is_some());
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn fused_and_unknown_profiles_never_claim_a_catalog_device() {
        let fused = super::DeviceProfile {
            name: Some("融合来源".to_string()),
            match_status: DeviceMatchStatus::Unknown,
            ..Default::default()
        };
        assert!(fused.catalog_id.is_none());
        let unknown = unknown_device_profile("mystery");
        assert_eq!(unknown.match_status, DeviceMatchStatus::Unknown);
        assert!(unknown.catalog_id.is_none());
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

    #[test]
    fn ai_handoff_redacts_nested_identifiers_and_precise_route_by_default() {
        let source = json!({
            "user": { "id": "user-secret", "name": "private" },
            "token": "token-secret",
            "user_identifier": "user-identifier-secret",
            "device_uuid": "device-uuid-secret",
            "email": "private@example.com",
            "uuid": "generic-uuid-secret",
            "lat_e7": 312000000,
            "lng_e7": 1215000000,
            "file_path": "C:\\Users\\private\\secret.json",
            "nested": [{
                "device_id": "device-secret",
                "serial_number": "serial-secret",
                "record_id": "record-secret",
                "workout_id": "workout-secret",
                "sleep_id": "sleep-secret",
                "gps_route": [{ "lat_e7": 312000000, "lng_e7": 1215000000 }],
                "route": [{ "latitude": 31.2, "longitude": 121.5 }],
                "value": 42
            }]
        });
        let (redacted, redactions) = redact_ai_export(&source.to_string(), false).unwrap();
        let value: serde_json::Value = serde_json::from_str(&redacted).unwrap();
        assert!(value.get("user").is_none());
        assert!(value.get("token").is_none());
        assert!(value.get("user_identifier").is_none());
        assert!(value.get("device_uuid").is_none());
        assert!(value.get("email").is_none());
        assert!(value.get("uuid").is_none());
        assert!(value.get("lat_e7").is_none());
        assert!(value.get("lng_e7").is_none());
        assert!(value.get("file_path").is_none());
        assert!(value["nested"][0].get("device_id").is_none());
        assert!(value["nested"][0].get("serial_number").is_none());
        assert!(value["nested"][0].get("record_id").is_none());
        assert!(value["nested"][0].get("workout_id").is_none());
        assert!(value["nested"][0].get("sleep_id").is_none());
        assert!(value["nested"][0].get("gps_route").is_none());
        assert!(value["nested"][0].get("route").is_none());
        assert!(!value.to_string().contains("secret"));
        assert!(redactions
            .iter()
            .any(|item| item == "authentication_fields"));
        assert!(redactions.iter().any(|item| item == "identity_fields"));
        assert!(redactions.iter().any(|item| item == "precise_route"));
        assert!(redactions.iter().any(|item| item == "local_paths"));
        assert!(!redacted.contains("C:\\Users\\private"));
    }

    #[test]
    fn ai_handoff_precise_route_requires_explicit_opt_in_but_keeps_identifiers_removed() {
        let source = json!({
            "device_id": "device-secret",
            "route": [{ "latitude": 31.2, "longitude": 121.5 }],
            "coordinates": { "lat": 31.2, "lon": 121.5 }
        });
        let (redacted, redactions) = redact_ai_export(&source.to_string(), true).unwrap();
        let value: serde_json::Value = serde_json::from_str(&redacted).unwrap();
        assert!(value.get("device_id").is_none());
        assert!(value.get("route").is_some());
        assert!(value.get("coordinates").is_some());
        assert!(!redactions.iter().any(|item| item == "precise_route"));
        assert!(value.to_string().contains("31.2"));
    }

    #[test]
    fn ai_handoff_clipboard_sanitizes_local_paths_without_touching_urls() {
        let source = json!({
            "note": "C:\\Users\\private\\data.json /tmp/private/data.json https://example.com/path"
        });
        let (redacted, redactions) = redact_ai_export(&source.to_string(), false).unwrap();
        assert!(!redacted.contains("C:\\Users\\private"));
        assert!(!redacted.contains("/tmp/private"));
        assert!(redacted.contains("https://example.com/path"));
        assert!(redactions.iter().any(|item| item == "local_paths"));
    }

    #[test]
    fn ai_handoff_inline_limit_includes_exact_two_mib_boundary() {
        assert_eq!(
            ai_handoff_mode_for_bytes(AI_HANDOFF_INLINE_LIMIT_BYTES),
            "inline"
        );
        assert_eq!(
            ai_handoff_mode_for_bytes(AI_HANDOFF_INLINE_LIMIT_BYTES + 1),
            "attachment"
        );
    }

    #[test]
    fn ai_provider_opener_allowlist_has_exactly_seven_https_destinations() {
        let capability: serde_json::Value =
            serde_json::from_str(include_str!("../../capabilities/default.json")).unwrap();
        let permissions = capability["permissions"].as_array().unwrap();
        let opener = permissions
            .iter()
            .find(|permission| permission["identifier"] == "opener:allow-open-url")
            .expect("opener allowlist");
        let urls = opener["allow"]
            .as_array()
            .unwrap()
            .iter()
            .map(|entry| entry["url"].as_str().unwrap())
            .collect::<Vec<_>>();
        assert_eq!(
            urls,
            vec![
                "https://chatgpt.com/",
                "https://claude.ai/",
                "https://gemini.google.com/app",
                "https://www.kimi.com/",
                "https://www.doubao.com/chat/",
                "https://chat.deepseek.com/",
                "https://grok.com/",
            ]
        );
        assert!(urls.iter().all(|url| url.starts_with("https://")));
    }

    #[test]
    fn a_user_assignment_overrides_even_a_confident_auto_match() {
        // 这条用例来自一个真实的坏法：指认逻辑被包在
        // `if match_status == Unknown` 里，于是一台已经被目录别名匹配上的表，
        // 用户点了「不对，我来指认」之后型号根本不变——指认存进了库，界面上
        // 却永远是那个错的。自动识别会错，用户的话必须能盖过它。
        let target = crate::device_catalog::catalog_entries()
            .iter()
            .find(|entry| entry.image_key.is_some())
            .expect("随包目录里至少要有一款带图的设备");
        let target_id = target.catalog_id.clone();
        let target_name = target.canonical_name.clone();

        let mut profile = DeviceProfile {
            canonical_name: Some("被自动认错的型号".into()),
            match_status: DeviceMatchStatus::Alias,
            ..Default::default()
        };
        assert!(apply_user_assignment(&mut profile, &target_id));
        assert_eq!(
            profile.canonical_name.as_deref(),
            Some(target_name.as_str())
        );
        // 来源要如实标成「用户指认」，不能伪装成识别结果。
        assert_eq!(profile.match_status, DeviceMatchStatus::UserAssigned);

        // 目录里没有的 id 什么都不改，而不是把设备清空成未知。
        let mut untouched = DeviceProfile {
            canonical_name: Some("原样保留".into()),
            match_status: DeviceMatchStatus::Exact,
            ..Default::default()
        };
        assert!(!apply_user_assignment(&mut untouched, "no-such-catalog-id"));
        assert_eq!(untouched.canonical_name.as_deref(), Some("原样保留"));
        assert_eq!(untouched.match_status, DeviceMatchStatus::Exact);
    }

    #[test]
    fn a_report_note_keeps_the_useful_sentence() {
        // 用户写这句话的目的就是让收报告的人知道这是哪一款表，
        // 脱敏不能把这句话本身也吃掉。
        let note =
            sanitize_diagnostic_note("我的表是 Balance 2，固件 3.5.1，但显示未识别").unwrap();
        assert!(note.contains("Balance 2"));
        assert!(note.contains("未识别"));
    }

    #[test]
    fn a_report_note_drops_pasted_credentials_and_paths() {
        let note = sanitize_diagnostic_note(
            r"设备没识别 token=a1b2c3d4e5f6a7b8c9d0e1f2 邮箱 someone@example.com 日志在 C:\Users\me\zepp.db",
        )
        .unwrap();
        assert!(note.contains("设备没识别"));
        assert!(
            !note.contains("a1b2c3d4e5f6a7b8c9d0e1f2"),
            "长串标识必须被抹掉：{note}"
        );
        assert!(
            !note.contains("someone@example.com"),
            "邮箱必须被抹掉：{note}"
        );
        assert!(!note.contains("Users"), "本机路径必须被抹掉：{note}");
    }

    #[test]
    fn a_report_note_is_capped_and_can_be_absent() {
        let long = "设".repeat(DIAGNOSTIC_NOTE_MAX_CHARS + 200);
        let note = sanitize_diagnostic_note(&long).unwrap();
        assert_eq!(note.chars().count(), DIAGNOSTIC_NOTE_MAX_CHARS);
        // 空白备注不该变成一个空字符串发出去。
        assert!(sanitize_diagnostic_note(
            "   
  "
        )
        .is_none());
    }
}

/// Open the application's local data directory in the platform file manager.
#[tauri::command]
pub fn open_data_folder(state: tauri::State<'_, AppState>) -> std::result::Result<(), AppError> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&state.data_dir)
            .spawn()
            .map(|_| ())
            .map_err(|error| {
                AppError::new(
                    "err.data_folder.open_failed",
                    format!("打开数据文件夹失败: {error}"),
                )
            })
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&state.data_dir)
            .spawn()
            .map(|_| ())
            .map_err(|error| {
                AppError::new(
                    "err.data_folder.open_failed",
                    format!("打开数据文件夹失败: {error}"),
                )
            })
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        let _ = state;
        Err(AppError::new(
            "err.data_folder.unsupported_os",
            "打开数据文件夹仅支持 Windows/macOS",
        ))
    }
}
