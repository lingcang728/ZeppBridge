use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// 数据来源范围
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum SourceScope {
    UserFused, // Zepp 用户级融合结果
    Device,    // 明确的设备级数据
    Unknown,   // 来源未知
}

impl SourceScope {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::UserFused => "user_fused",
            Self::Device => "device",
            Self::Unknown => "unknown",
        }
    }
}

/// 认证信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthInfo {
    pub app_token: String,
    pub user_id: String,
    pub region_host: String,
}

/// 指标样本（心率、HRV 等时间序列）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MetricSample {
    pub metric: String,
    pub timestamp: DateTime<Utc>,
    pub value: f64,
    pub unit: String,
    pub source_scope: SourceScope,
    pub device_id: Option<String>,
}

/// 每日指标
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DailyMetric {
    pub date: String, // YYYY-MM-DD
    pub metric: String,
    pub value: f64,
    pub unit: String,
    pub source_scope: SourceScope,
    pub device_id: Option<String>,
}

/// 真实睡眠阶段时间片。顺序必须来自云端 `stage[]`，禁止按总量拼接。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SleepStageSlice {
    pub stage: String,
    pub start_time: DateTime<Utc>,
    pub end_time: DateTime<Utc>,
}

/// 睡眠会话
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SleepSession {
    pub sleep_id: String,
    pub start_time: DateTime<Utc>,
    pub end_time: DateTime<Utc>,
    pub score: Option<i32>,
    pub duration_minutes: i32,
    pub deep_minutes: i32,
    pub light_minutes: i32,
    pub rem_minutes: Option<i32>,
    pub awake_minutes: i32,
    pub source_scope: SourceScope,
    pub device_id: Option<String>,
    #[serde(default)]
    pub synced_at: Option<DateTime<Utc>>,
    /// 仅当云端提供独立在床字段时才有值。当前 Zepp `ebt`/`obt` 不可靠，恒为 None。
    #[serde(default)]
    pub time_in_bed_minutes: Option<i32>,
    #[serde(default)]
    pub stages: Vec<SleepStageSlice>,
}

/// 运动记录
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Workout {
    pub workout_id: String,
    pub workout_type: String,
    pub start_time: DateTime<Utc>,
    pub end_time: DateTime<Utc>,
    pub distance_meters: Option<f64>,
    pub calories: Option<i32>,
    pub avg_hr: Option<i32>,
    pub max_hr: Option<i32>,
    pub training_load: Option<f64>,
    pub vo2max: Option<f64>,
    pub source_scope: SourceScope,
    pub device_id: Option<String>,
    #[serde(default)]
    pub synced_at: Option<DateTime<Utc>>,
    #[serde(default)]
    pub gps_available: bool,
    #[serde(default)]
    pub sample_count: i64,
    /// History `source` query value required by `/v1/sport/run/detail.json`.
    #[serde(default)]
    pub zepp_source: Option<String>,
    /// Zepp history `type` integer. Running is `1`.
    #[serde(default)]
    pub zepp_type: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct WorkoutRoutePoint {
    pub timestamp: String,
    pub latitude: f64,
    pub longitude: f64,
    pub altitude_m: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct WorkoutSeriesSample {
    pub timestamp: String,
    pub heart_rate: Option<i32>,
    pub speed: Option<f64>,
    pub pace: Option<f64>,
    pub cadence: Option<f64>,
    pub stride_cm: Option<f64>,
    pub altitude_m: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct WorkoutPause {
    pub start_time: String,
    pub end_time: String,
    pub kind: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct WorkoutSeries {
    pub workout_id: String,
    pub samples: Vec<WorkoutSeriesSample>,
    pub route: Vec<WorkoutRoutePoint>,
    pub pauses: Vec<WorkoutPause>,
}

#[derive(Debug, Clone)]
pub struct PendingWorkoutDetail {
    pub workout_id: String,
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HeartRatePoint {
    pub timestamp: String,
    pub value: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DailyPoint {
    pub date: String,
    pub value: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct UserPrefs {
    pub retention_days: i64,
    pub history_sync_days: i64,
}

impl UserPrefs {
    pub const DEFAULT_RETENTION_DAYS: i64 = 365;
    pub const DEFAULT_HISTORY_SYNC_DAYS: i64 = 180;

    pub fn clamp_days(value: i64) -> std::result::Result<i64, String> {
        if (1..=365).contains(&value) {
            Ok(value)
        } else {
            Err("天数必须在 1 到 365 之间".into())
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct StorageEstimate {
    pub free_bytes: u64,
    pub estimated_add_bytes: u64,
    pub database_bytes: u64,
    pub allow_long_history: bool,
    pub warn_tight_space: bool,
    pub message: String,
}

/// 同步状态
#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncState {
    pub stream: String,
    pub last_sync: Option<DateTime<Utc>>,
    pub status: String,
    pub error: Option<String>,
}

/// The storage representation of a sync stream.  `SyncState` above remains the
/// small backwards-compatible view used by the original commands; this richer
/// type carries the cursor/capability bookkeeping needed by the real pipeline.
#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SyncStateInfo {
    pub stream: String,
    pub last_sync: Option<DateTime<Utc>>,
    pub cursor: Option<String>,
    pub status: String,
    pub error: Option<String>,
    pub needs_reauth: bool,
    pub records_written: i64,
    pub capability: String,
    pub message: Option<String>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum CapabilityStatus {
    Verified,
    Unverified,
    Unavailable,
}

impl CapabilityStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Verified => "verified",
            Self::Unverified => "unverified",
            Self::Unavailable => "unavailable",
        }
    }
}

/// A raw response retained before any normalization.  It deliberately contains
/// no credentials and is suitable for passing to `Database::insert_raw_record`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RawRecord {
    pub stream: String,
    pub source_key: String,
    pub source_scope: SourceScope,
    pub device_id: Option<String>,
    pub start_utc: DateTime<Utc>,
    pub end_utc: Option<DateTime<Utc>>,
    pub payload: serde_json::Value,
    pub capability: CapabilityStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DataStatus {
    pub stream: String,
    pub status: String,
    pub last_sync: Option<DateTime<Utc>>,
    pub records_written: i64,
    pub capability: String,
    pub needs_reauth: bool,
    pub message: Option<String>,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecentData {
    pub metric_samples: Vec<MetricSample>,
    pub sleep_sessions: Vec<SleepSession>,
    pub workouts: Vec<Workout>,
}

/// 健康数据概览
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Coverage {
    pub start: String,
    pub end: String,
    pub days: i64,
    pub streams: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthOverview {
    pub current_hr: Option<i32>,
    pub resting_hr: Option<i32>,
    pub hrv: Option<f64>,
    pub last_sleep_score: Option<i32>,
    pub readiness: Option<f64>,
    pub bio_charge: Option<f64>,
    pub hybrid_charge: Option<f64>,
    pub training_load: Option<f64>,
    pub vo2max: Option<f64>,
    pub steps_today: Option<i32>,
    pub active_calories_today: Option<i32>,
    pub latest_heart_rate_at: Option<String>,
    pub last_updated: Option<String>,
    pub coverage: Option<Coverage>,
    pub source_scope: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportSelection {
    pub start_date: String,
    pub end_date: String,
    pub data_types: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportResult {
    pub path: String,
    pub record_count: usize,
    pub bytes: usize,
    pub generated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiHandoffMetadata {
    pub precise_route_included: bool,
    pub authentication_fields_removed: bool,
    pub identity_fields_removed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiHandoffResult {
    pub mode: String,
    pub clipboard_text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_path: Option<String>,
    pub bytes: usize,
    pub records: usize,
    pub redactions: Vec<String>,
    pub metadata: AiHandoffMetadata,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum DeviceMatchStatus {
    Exact,
    Alias,
    #[default]
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq, Eq)]
pub struct DeviceProfile {
    /// Existing display name is retained for backwards compatibility. It may
    /// be a user nickname; `canonical_name` is the official catalog value.
    pub name: Option<String>,
    #[serde(default)]
    pub canonical_name: Option<String>,
    #[serde(default)]
    pub display_name: Option<String>,
    #[serde(default)]
    pub catalog_id: Option<String>,
    #[serde(default)]
    pub kind: Option<String>,
    #[serde(default)]
    pub image_key: Option<String>,
    #[serde(default)]
    pub match_status: DeviceMatchStatus,
    #[serde(default)]
    pub has_local_data: bool,
    #[serde(default)]
    pub last_data_at: Option<String>,
    pub firmware: Option<String>,
    pub serial: Option<String>,
    pub device_id: Option<String>,
    pub timezone: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DeviceCacheMetadata {
    pub status: String,
    #[serde(default)]
    pub cached_at: Option<DateTime<Utc>>,
    #[serde(default)]
    pub age_seconds: Option<i64>,
    #[serde(default)]
    pub refreshed: bool,
    #[serde(default)]
    pub refresh_error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DeviceProfilesResult {
    pub profiles: Vec<DeviceProfile>,
    pub cache: DeviceCacheMetadata,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct DeviceIdentityHint {
    pub aliases: Vec<String>,
    pub name: Option<String>,
    pub firmware: Option<String>,
    pub serial: Option<String>,
    pub device_id: Option<String>,
    pub timezone: Option<String>,
}
