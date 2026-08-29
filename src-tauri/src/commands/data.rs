use crate::app_state::AppState;
use crate::connectors::ZeppConnector;
use crate::device_catalog::{match_catalog, CatalogMatchInput, CatalogMatchStatus};
use crate::export_formats;
use crate::insight::{WeeklyReport, WorkoutInsight};
use crate::ipc_types::CleanupResult;
use crate::models::{
    AiHandoffMetadata, AiHandoffResult, CapabilityOverview, DailyPoint, DeviceCacheMetadata,
    DeviceCatalogOption, DeviceMatchStatus, DeviceProfile, DeviceProfilesResult,
    DiagnosticAssignedModel, DiagnosticDeviceCandidate, DiagnosticDeviceEvidence, DiagnosticField,
    DiagnosticObjectShape, DiagnosticReport, ExportDetail, ExportResult, ExportScope,
    ExportSelection, FeedbackSubmissionResult, HealthOverview, HeartRatePoint,
    HeartRateZoneOptions, HeartRateZonePreference, MetricSeries, SleepSession, StorageEstimate,
    TrainingBalancePoint, UserPrefs, Workout, WorkoutSeries,
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
) -> std::result::Result<HealthOverview, String> {
    let result = {
        let db = state.db.lock().await;
        db.get_health_overview().map_err(|error| error.to_string())
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
) -> std::result::Result<CapabilityOverview, String> {
    let db = state.db.lock().await;
    db.capability_overview().map_err(|error| error.to_string())
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
pub async fn get_workout_series(
    state: tauri::State<'_, AppState>,
    workout_id: String,
) -> std::result::Result<WorkoutSeries, String> {
    let db = state.db.lock().await;
    db.get_workout_series(&workout_id)
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
) -> std::result::Result<Vec<MetricSeries>, String> {
    let db = state.db.lock().await;
    db.metric_series(&metrics, days)
        .map_err(|error| error.to_string())
}

/// Acute (7 day) versus chronic (28 day) training load, day by day.
#[tauri::command]
pub async fn get_training_balance(
    state: tauri::State<'_, AppState>,
    days: i64,
) -> std::result::Result<Vec<TrainingBalancePoint>, String> {
    let window = days.clamp(1, 1825);
    let end = chrono::Local::now().date_naive();
    let start = end - chrono::Duration::days(window - 1);
    let db = state.db.lock().await;
    db.training_load_balance(start, end)
        .map_err(|error| error.to_string())
}

/// The heart-rate zone picker's state: measured bases, the models they
/// support, the user's choice and the zones that choice produces.
#[tauri::command]
pub async fn get_heart_rate_zones(
    state: tauri::State<'_, AppState>,
    days: i64,
) -> std::result::Result<HeartRateZoneOptions, String> {
    let db = state.db.lock().await;
    db.heart_rate_zone_options(days)
        .map_err(|error| error.to_string())
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
) -> std::result::Result<HeartRateZoneOptions, String> {
    let db = state.db.lock().await;
    db.set_heart_rate_zone_preference(&HeartRateZonePreference {
        model,
        max_basis,
        resting_basis,
        threshold_basis,
    })
    .map_err(|error| error.to_string())?;
    db.heart_rate_zone_options(days)
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
        let streams = db
            .reprocess_raw_records()
            .map_err(|error| error.to_string())?;
        // 手动重新解析记在自己的时间线上，云端同步时间原样不动。
        db.record_local_replay(true)
            .map_err(|error| error.to_string())?;
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
) -> std::result::Result<WorkoutInsight, String> {
    let db = state.db.lock().await;
    db.workout_insight(&workout_id)
        .map_err(|error| error.user_message())
}

/// 本地周报：最近 7 天对比你自己此前 28 天。
///
/// 不和任何人群基准比较 —— 项目没有人群数据，也不打算有。
#[tauri::command]
pub async fn get_weekly_report(
    state: tauri::State<'_, AppState>,
) -> std::result::Result<WeeklyReport, String> {
    let db = state.db.lock().await;
    db.weekly_report(Utc::now())
        .map_err(|error| error.user_message())
}

/// 数据健康中心的后端契约。
///
/// 这个调用不触网，也不跑 `integrity_check`：打开页面必须是便宜的。完整性
/// 检查是显式动作，见 `run_database_integrity_check`。
#[tauri::command]
pub async fn get_data_health(
    state: tauri::State<'_, AppState>,
    window_days: Option<i64>,
) -> std::result::Result<DataHealth, String> {
    let database_bytes = std::fs::metadata(state.data_dir.join("zepp.db"))
        .map(|meta| meta.len())
        .unwrap_or(0);
    let db = state.db.lock().await;
    db.data_health(window_days.unwrap_or(90), database_bytes)
        .map_err(|error| error.user_message())
}

/// 对整库跑一次 SQLite `integrity_check` 并记录结果。
///
/// 大库上这是一次全表扫描，所以只在用户主动点击时执行；页面平时显示上一次的
/// 结论和时间。
#[tauri::command]
pub async fn run_database_integrity_check(
    state: tauri::State<'_, AppState>,
) -> std::result::Result<IntegrityCheckResult, String> {
    let db = state.db.lock().await;
    db.run_integrity_check()
        .map_err(|error| error.user_message())
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
) -> std::result::Result<Vec<WorkoutCodeLabel>, String> {
    let db = state.db.lock().await;
    db.unknown_workout_code_labels()
        .map_err(|error| error.user_message())
}

/// 给一个未识别编号起名字（传 `null` 撤销）。所有同编号的记录一起生效。
#[tauri::command]
pub async fn set_workout_code_label(
    state: tauri::State<'_, AppState>,
    zepp_type: i32,
    label: Option<String>,
) -> std::result::Result<Vec<WorkoutCodeLabel>, String> {
    let db = state.db.lock().await;
    db.set_workout_code_label(zepp_type, label.as_deref())
        .map_err(|error| error.user_message())?;
    db.unknown_workout_code_labels()
        .map_err(|error| error.user_message())
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
) -> std::result::Result<(), String> {
    let db = state.db.lock().await;
    db.set_device_model_override(&device_key, catalog_id.as_deref())
        .map_err(|error| error.user_message())
}

#[tauri::command]
pub async fn set_workout_type_override(
    state: tauri::State<'_, AppState>,
    workout_id: String,
    user_override: Option<String>,
) -> std::result::Result<Workout, String> {
    let db = state.db.lock().await;
    db.set_workout_type_override(&workout_id, user_override.as_deref())
        .map_err(|error| error.user_message())?;
    db.get_workout_detail(&workout_id)
        .map_err(|error| error.user_message())?
        .ok_or_else(|| "运动记录不存在".to_owned())
}

/// Build an allowlist-only report. The cloud response is examined
/// in memory and is never copied into the result or persisted as a diagnostic.
#[tauri::command]
pub async fn get_diagnostic_report(
    state: tauri::State<'_, AppState>,
) -> std::result::Result<DiagnosticReport, String> {
    build_diagnostic_report(&state, false).await
}

/// 组装诊断报告。
///
/// `include_assignments` 为真时附上「用户指认的型号 ↔ 这台设备的型号类编号」。
/// 这一对是内置目录唯一可能的成长来源，但它仍然是用户主动交出来的东西：
/// 只有在选择器里勾选了「帮忙补充目录」的那一次提交才会带上。
async fn build_diagnostic_report(
    state: &AppState,
    include_assignments: bool,
) -> std::result::Result<DiagnosticReport, String> {
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
        schema_version: db
            .diagnostic_schema_version()
            .map_err(|error| error.user_message())?,
        normalizer_revision: NORMALIZER_REVISION.into(),
        operating_system: std::env::consts::OS.into(),
        device_evidence,
        user_assigned_models,
        unknown_workout_codes: db
            .diagnostic_unknown_workout_codes()
            .map_err(|error| error.user_message())?,
        workout_type_conflicts: db
            .diagnostic_workout_type_conflicts()
            .map_err(|error| error.user_message())?,
    })
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
) -> std::result::Result<FeedbackSubmissionResult, String> {
    let report = build_diagnostic_report(&state, false).await?;
    post_diagnostic_report(report).await
}

/// 把「用户指认的型号 ↔ 这台设备的型号类编号」交回来，让下一版目录能自动
/// 识别同款设备。
///
/// 单独一个命令而不是在指认时自动发送：用户在选择器里勾选了才会走到这里，
/// 设置页那句「应用不会自动上报任何使用行为」才不会变成空话。
#[tauri::command]
pub async fn submit_device_model_assignment(
    state: tauri::State<'_, AppState>,
) -> std::result::Result<FeedbackSubmissionResult, String> {
    let report = build_diagnostic_report(&state, true).await?;
    if report.user_assigned_models.is_empty() {
        return Err("这台设备没有可用于补充目录的型号编号，暂时不需要提交".into());
    }
    post_diagnostic_report(report).await
}

async fn post_diagnostic_report(
    report: DiagnosticReport,
) -> std::result::Result<FeedbackSubmissionResult, String> {
    let has_reportable_issue = report.device_evidence.unknown_device_count > 0
        || !report.user_assigned_models.is_empty()
        || !report.unknown_workout_codes.is_empty()
        || report.workout_type_conflicts > 0;
    if !has_reportable_issue {
        return Err("当前没有检测到未识别设备或运动类型，无需提交报告".into());
    }

    // This client is intentionally separate from the Zepp connector: it has
    // no cookie jar and receives no account token or cloud headers.
    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(5))
        .timeout(Duration::from_secs(12))
        .user_agent(format!("ZeppBridge/{} feedback", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|_| "无法初始化错误报告连接".to_string())?;
    let response = client
        .post(FEEDBACK_ENDPOINT)
        .json(&report)
        .send()
        .await
        .map_err(|_| "错误报告发送失败，请检查网络后重试".to_string())?;
    if !response.status().is_success() {
        return Err("错误报告服务暂时不可用，请稍后重试".into());
    }
    response
        .json::<FeedbackSubmissionResult>()
        .await
        .map_err(|_| "错误报告服务返回了无法识别的结果".to_string())
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
) -> std::result::Result<ExportResult, String> {
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
) -> std::result::Result<ExportResult, String> {
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
) -> std::result::Result<ExportResult, String> {
    // CSV rows and GPX track points come from the per-second series, which the
    // summary export omits by design. These formats are archival, so they
    // always read the full payload regardless of what the UI has selected.
    selection.detail = ExportDetail::Full;
    let (encoded, record_count) = {
        let db = state.db.lock().await;
        db.build_ai_export(&selection)
            .map_err(|error| error.to_string())?
    };
    if record_count == 0 {
        return Err("这段时间没有可导出的记录".to_string());
    }
    let export: Value =
        serde_json::from_str(&encoded).map_err(|error| format!("读取导出数据失败: {error}"))?;
    let (converted, converted_count) = convert(&export)?;

    let generated_at = Utc::now();
    write_file_atomically(&path, converted.as_bytes())
        .map_err(|error| format!("写入 {label} 导出失败: {error}"))?;
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
) -> std::result::Result<AiHandoffResult, String> {
    let prompt = sanitize_clipboard_text(prompt.trim());
    if prompt.is_empty() {
        return Err("请先填写提示词".to_string());
    }

    let (encoded, record_count) = {
        let db = state.db.lock().await;
        db.build_ai_export(&selection)
            .map_err(|error| error.to_string())?
    };
    if record_count == 0 {
        return Err("这段时间没有可交接的记录".to_string());
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
        std::fs::create_dir_all(&target_dir)
            .map_err(|error| format!("创建数据包导出目录失败: {error}"))?;
        let path = target_dir.join("zeppbridge-ai-handoff.json");
        write_file_atomically(&path, redacted.as_bytes())
            .map_err(|error| format!("写入脱敏 AI 数据到桌面失败: {error}"))?;
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
) -> std::result::Result<(String, Vec<String>), String> {
    let mut value: Value = serde_json::from_str(encoded)
        .map_err(|error| format!("解析 AI 导出 JSON 失败: {error}"))?;
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

    let encoded = serde_json::to_string_pretty(&value)
        .map_err(|error| format!("编码脱敏 AI 导出失败: {error}"))?;
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

/// Return every device bound to the current account. The command is
/// cache-first; a caller opts into the bounded network refresh explicitly so
/// an offline account can still inspect its last known device list.
#[tauri::command]
pub async fn get_device_profiles(
    state: tauri::State<'_, AppState>,
    refresh: Option<bool>,
) -> std::result::Result<DeviceProfilesResult, String> {
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
) -> std::result::Result<DeviceProfile, String> {
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
        db.lookup_device_profile(device_id)
            .map_err(|error| error.to_string())?
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
) -> std::result::Result<Vec<DeviceProfile>, String> {
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
) -> std::result::Result<DeviceProfile, String> {
    if profile.display_name.is_none() {
        profile.display_name = profile.name.clone();
    }
    if profile.match_status == DeviceMatchStatus::Unknown {
        let model_codes = profile.device_id.as_deref().into_iter().collect::<Vec<_>>();
        let names = profile.name.as_deref().into_iter().collect::<Vec<_>>();
        let display_name = profile.display_name.as_deref();
        if let Some(matched) = match_catalog(&CatalogMatchInput {
            model_codes,
            product_names: names.clone(),
            device_names: names,
            display_name,
        }) {
            apply_catalog_match(&mut profile, matched.entry, matched.status);
        }
    }
    // Some accounts' device response has no product-name field at all, so no
    // matcher can name the watch. When the user has told us which model it is,
    // use that — and mark it as a user correction rather than a match.
    if profile.match_status == DeviceMatchStatus::Unknown {
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
            db.device_model_override(&keys)
                .map_err(|error| error.to_string())?
        };
        if let Some(assigned) = assigned {
            if let Some(entry) = crate::device_catalog::catalog_entries()
                .iter()
                .find(|entry| entry.catalog_id == assigned.catalog_id)
            {
                apply_catalog_match(&mut profile, entry, CatalogMatchStatus::Exact);
                profile.match_status = DeviceMatchStatus::UserAssigned;
            }
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
        db.device_data_summary(&aliases)
            .map_err(|error| error.to_string())?
    };
    profile.has_local_data = has_local_data;
    profile.last_data_at = last_data_at;
    Ok(profile)
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

fn validate_json_export_path(value: &str) -> std::result::Result<PathBuf, String> {
    validate_export_path(value, "json")
}

/// Validate a user-picked export destination for one concrete format.
///
/// The extension check is not cosmetic: it keeps a mistyped destination from
/// silently producing a file whose contents do not match its name.
fn validate_export_path(value: &str, extension: &str) -> std::result::Result<PathBuf, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(format!(
            "请选择 {} 文件的保存位置",
            extension.to_ascii_uppercase()
        ));
    }
    let path = PathBuf::from(trimmed);
    if !path.is_absolute() {
        return Err("保存位置必须是绝对路径".to_string());
    }
    let matches_extension = path
        .extension()
        .and_then(|value| value.to_str())
        .is_some_and(|value| value.eq_ignore_ascii_case(extension));
    if !matches_extension {
        return Err(format!("导出文件必须使用 .{extension} 扩展名"));
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
    use super::{
        ai_handoff_mode_for_bytes, build_device_diagnostic, merge_cached_device_profile,
        parse_device_profile, parse_device_profiles, read_device_profile_cache, redact_ai_export,
        unknown_device_profile, validate_json_export_path, AI_HANDOFF_INLINE_LIMIT_BYTES,
    };
    use crate::models::DeviceMatchStatus;
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
}

/// Open the application's local data directory in the platform file manager.
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

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&state.data_dir)
            .spawn()
            .map(|_| ())
            .map_err(|error| format!("打开数据文件夹失败: {error}"))
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        let _ = state;
        Err("打开数据文件夹仅支持 Windows/macOS".to_string())
    }
}
