use super::{spawn_independent_read, spawn_independent_write, with_write};

use crate::app_state::AppState;

use crate::connectors::ZeppConnector;

use crate::device_catalog::{match_catalog, CatalogMatchInput, CatalogMatchStatus};

use crate::export_fit;

use crate::export_formats;

use crate::insight::{WeeklyReport, WorkoutInsight};

use crate::ipc_error::AppError;

use crate::ipc_types::CleanupResult;

use crate::models::{
    AiHandoffMetadata, AiHandoffResult, CapabilityOverview, DailyHeartRateExtreme,
    DeviceCacheMetadata, DeviceMatchStatus, DeviceProfile, DeviceProfilesResult,
    DiagnosticAssignedModel, DiagnosticDeviceCandidate, DiagnosticDeviceEvidence, DiagnosticField,
    DiagnosticObjectShape, DiagnosticReport, ExportDetail, ExportEstimate, ExportResult,
    ExportScope, ExportSelection, FeedbackSubmissionResult, HealthOverview, HeartRatePoint,
    HeartRateZoneOptions, HeartRateZonePreference, MetricSeries, RawPayloadCompaction,
    SleepSession, StorageEstimate, StressPoint, TrainingBalancePoint, UserPrefs, Workout,
    WorkoutSeries, DIAGNOSTIC_NOTE_MAX_CHARS,
};

use crate::storage::corrections::WorkoutCodeLabel;

use crate::storage::provenance::{DataHealth, IntegrityCheckResult};

use crate::storage::{looks_like_firmware_version, NORMALIZER_REVISION};

use chrono::{DateTime, Local, Utc};

use serde::{Deserialize, Serialize};

use serde_json::{Map, Value};

use std::collections::BTreeSet;

use std::path::{Path, PathBuf};

use std::time::Duration;

use zeppbridge_core::storage::write_lock::WritePurpose;

mod device_parse;
mod device_profiles;
mod diagnostic_report;
mod export;
mod redact;
#[cfg(test)]
mod tests;

pub(crate) use device_parse::*;
pub(crate) use device_profiles::*;
pub(crate) use diagnostic_report::*;
pub(crate) use export::*;
pub(crate) use redact::*;

const DEVICE_CACHE_MAX_AGE_SECONDS: i64 = 24 * 60 * 60;

pub(crate) const AI_HANDOFF_INLINE_LIMIT_BYTES: usize = 2 * 1024 * 1024;

/// Return the latest health metrics persisted in the local database.
#[tauri::command]
pub async fn get_health_overview(
    state: tauri::State<'_, AppState>,
) -> std::result::Result<HealthOverview, AppError> {
    spawn_independent_read(state.data_dir.clone(), |db| db.get_health_overview()).await
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
    let today = Local::now().date_naive();
    spawn_independent_read(state.data_dir.clone(), move |db| {
        db.capability_overview(today)
    })
    .await
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
    spawn_independent_read(state.data_dir.clone(), move |db| {
        db.get_recent_sleep_sessions(limit)
    })
    .await
}

/// 分页取睡眠记录，最新在前。
#[tauri::command]
pub async fn get_sleep_page(
    state: tauri::State<'_, AppState>,
    limit: usize,
    offset: usize,
) -> std::result::Result<SleepPage, AppError> {
    let limit = limit.clamp(1, MAX_PAGE_SIZE);
    spawn_independent_read(state.data_dir.clone(), move |db| {
        Ok(SleepPage {
            items: db.sleep_sessions_page(limit, offset)?,
            total: db.count_sleep_sessions()?,
        })
    })
    .await
}

/// Return one persisted sleep session by its stable source identifier.
#[tauri::command]
pub async fn get_sleep_detail(
    state: tauri::State<'_, AppState>,
    sleep_id: String,
) -> std::result::Result<Option<SleepSession>, AppError> {
    spawn_independent_read(state.data_dir.clone(), move |db| {
        db.get_sleep_detail(&sleep_id)
    })
    .await
}

/// Return the most recent persisted workouts.
#[tauri::command]
pub async fn get_recent_workouts(
    state: tauri::State<'_, AppState>,
    limit: usize,
) -> std::result::Result<Vec<Workout>, AppError> {
    let limit = limit.clamp(1, 500);
    spawn_independent_read(state.data_dir.clone(), move |db| {
        db.get_recent_workouts(limit)
    })
    .await
}

/// 分页取运动记录，最新在前。
#[tauri::command]
pub async fn get_workout_page(
    state: tauri::State<'_, AppState>,
    limit: usize,
    offset: usize,
) -> std::result::Result<WorkoutPage, AppError> {
    let limit = limit.clamp(1, MAX_PAGE_SIZE);
    spawn_independent_read(state.data_dir.clone(), move |db| {
        Ok(WorkoutPage {
            items: db.workouts_page(limit, offset)?,
            total: db.count_workouts()?,
        })
    })
    .await
}

/// Return one persisted workout by its stable source identifier.
#[tauri::command]
pub async fn get_workout_detail(
    state: tauri::State<'_, AppState>,
    workout_id: String,
) -> std::result::Result<Option<Workout>, AppError> {
    spawn_independent_read(state.data_dir.clone(), move |db| {
        db.get_workout_detail(&workout_id)
    })
    .await
}

#[tauri::command]
pub async fn get_workout_series(
    state: tauri::State<'_, AppState>,
    workout_id: String,
) -> std::result::Result<WorkoutSeries, AppError> {
    spawn_independent_read(state.data_dir.clone(), move |db| {
        db.get_workout_series(&workout_id)
    })
    .await
}

#[tauri::command]
pub async fn get_heart_rate_series(
    state: tauri::State<'_, AppState>,
    hours: i64,
) -> std::result::Result<Vec<HeartRatePoint>, AppError> {
    spawn_independent_read(state.data_dir.clone(), move |db| {
        db.heart_rate_series(hours)
    })
    .await
}

#[tauri::command]
pub async fn get_stress_series(
    state: tauri::State<'_, AppState>,
    hours: i64,
) -> std::result::Result<Vec<StressPoint>, AppError> {
    spawn_independent_read(state.data_dir.clone(), move |db| db.stress_series(hours)).await
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
    spawn_independent_read(state.data_dir.clone(), move |db| {
        db.metric_series(&metrics, days)
    })
    .await
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
    spawn_independent_read(state.data_dir.clone(), move |db| {
        db.daily_heart_rate_extremes(days)
    })
    .await
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
    spawn_independent_read(state.data_dir.clone(), move |db| {
        db.training_load_balance(start, end)
    })
    .await
}

/// The heart-rate zone picker's state: measured bases, the models they
/// support, the user's choice and the zones that choice produces.
#[tauri::command]
pub async fn get_heart_rate_zones(
    state: tauri::State<'_, AppState>,
    days: i64,
) -> std::result::Result<HeartRateZoneOptions, AppError> {
    spawn_independent_read(state.data_dir.clone(), move |db| {
        db.heart_rate_zone_options(days)
    })
    .await
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
    with_write(&state.data_dir, &state.db, WritePurpose::Metadata, |db| {
        db.set_heart_rate_zone_preference(&HeartRateZonePreference {
            model,
            max_basis,
            resting_basis,
            threshold_basis,
        })?;
        db.heart_rate_zone_options(days)
    })
    .await
}

#[tauri::command]
pub async fn get_storage_estimate(
    state: tauri::State<'_, AppState>,
    days: i64,
) -> std::result::Result<StorageEstimate, AppError> {
    let data_dir = state.data_dir.clone();
    spawn_independent_read(state.data_dir.clone(), move |db| {
        db.storage_estimate(days, &data_dir)
    })
    .await
}

/// 当前的保留 / 补拉 / 归档偏好。
///
/// `AppStatus` 只带了保留期和补拉窗口，归档开关不在里面；界面需要一个能单独
/// 读到完整偏好的入口，否则归档面板只能靠猜。
#[tauri::command]
pub async fn get_user_prefs(
    state: tauri::State<'_, AppState>,
) -> std::result::Result<UserPrefs, AppError> {
    spawn_independent_read(state.data_dir.clone(), |db| db.user_prefs()).await
}

#[tauri::command]
pub async fn set_user_prefs(
    state: tauri::State<'_, AppState>,
    retention_days: i64,
    history_sync_days: i64,
    archive_enabled: Option<bool>,
) -> std::result::Result<UserPrefs, AppError> {
    with_write(&state.data_dir, &state.db, WritePurpose::Metadata, |db| {
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
    })
    .await
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
    spawn_independent_write(state.data_dir.clone(), WritePurpose::Compaction, |db| {
        db.compact_raw_payloads()
    })
    .await
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

    spawn_independent_write(state.data_dir.clone(), WritePurpose::Cleanup, move |db| {
        db.cleanup_old_data(days)
    })
    .await?;

    Ok(CleanupResult {
        days,
        message: Some(format!("已清理 {} 天之前的数据", days)),
    })
}

#[tauri::command]
pub async fn reprocess_local_data(
    state: tauri::State<'_, AppState>,
) -> std::result::Result<serde_json::Value, AppError> {
    let streams = spawn_independent_write(state.data_dir.clone(), WritePurpose::Reprocess, |db| {
        let streams = db.reprocess_raw_records()?;
        // 手动重新解析记在自己的时间线上，云端同步时间原样不动。
        db.record_local_replay(true)?;
        Ok(streams)
    })
    .await?;
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
    spawn_independent_read(state.data_dir.clone(), move |db| {
        db.workout_insight(&workout_id)
    })
    .await
}

/// 本地周报：最近 7 天对比你自己此前 28 天。
///
/// 不和任何人群基准比较 —— 项目没有人群数据，也不打算有。
#[tauri::command]
pub async fn get_weekly_report(
    state: tauri::State<'_, AppState>,
) -> std::result::Result<WeeklyReport, AppError> {
    let now = Local::now();
    spawn_independent_read(state.data_dir.clone(), move |db| db.weekly_report(now)).await
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
    let window_days = window_days.unwrap_or(90);
    spawn_independent_read(state.data_dir.clone(), move |db| {
        db.data_health(window_days, database_bytes)
    })
    .await
}

/// 对整库跑一次 SQLite `integrity_check` 并记录结果。
///
/// 大库上这是一次全表扫描，所以只在用户主动点击时执行；页面平时显示上一次的
/// 结论和时间。
#[tauri::command]
pub async fn run_database_integrity_check(
    state: tauri::State<'_, AppState>,
) -> std::result::Result<IntegrityCheckResult, AppError> {
    spawn_independent_write(state.data_dir.clone(), WritePurpose::Metadata, |db| {
        db.run_integrity_check()
    })
    .await
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
    spawn_independent_read(state.data_dir.clone(), |db| {
        db.unknown_workout_code_labels()
    })
    .await
}

/// 给一个未识别编号起名字（传 `null` 撤销）。所有同编号的记录一起生效。
#[tauri::command]
pub async fn set_workout_code_label(
    state: tauri::State<'_, AppState>,
    zepp_type: i32,
    label: Option<String>,
) -> std::result::Result<Vec<WorkoutCodeLabel>, AppError> {
    with_write(&state.data_dir, &state.db, WritePurpose::Metadata, |db| {
        db.set_workout_code_label(zepp_type, label.as_deref())?;
        db.unknown_workout_code_labels()
    })
    .await
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
    with_write(&state.data_dir, &state.db, WritePurpose::Metadata, |db| {
        db.set_device_model_override(&device_key, catalog_id.as_deref())
    })
    .await
}

#[tauri::command]
pub async fn set_workout_type_override(
    state: tauri::State<'_, AppState>,
    workout_id: String,
    user_override: Option<String>,
) -> std::result::Result<Workout, AppError> {
    let workout = with_write(&state.data_dir, &state.db, WritePurpose::Metadata, |db| {
        db.set_workout_type_override(&workout_id, user_override.as_deref())?;
        db.get_workout_detail(&workout_id)
    })
    .await?;
    workout.ok_or_else(|| AppError::new("err.workout.not_found", "运动记录不存在"))
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

    // Linux 上项目已经为 WebKitGTK、Flatpak、Secret Service、AppImage 做了
    // 大量适配，设置页这一个按钮却直接返回「不支持」。`xdg-open` 是桌面环境
    // 的标准入口，deb / rpm / Flatpak / AppImage 四条渠道都有。
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
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

    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        let _ = state;
        Err(AppError::new(
            "err.data_folder.unsupported_os",
            "打开数据文件夹仅支持 Windows/macOS/Linux",
        ))
    }
}
