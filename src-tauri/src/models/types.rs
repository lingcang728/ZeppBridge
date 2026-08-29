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
    /// Times the sleeper woke during the night (`wc`). Distinct from
    /// `awake_minutes`: ten one-minute wakings and one ten-minute waking are
    /// the same duration but not the same night.
    #[serde(default)]
    pub wake_count: Option<i32>,
}

/// 运动记录
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Workout {
    pub workout_id: String,
    /// Backwards-compatible alias for `normalized_type`. Request-path names
    /// are never allowed to populate this field.
    pub workout_type: String,
    /// ZeppBridge's interpretation of the record's own type evidence.
    pub normalized_type: String,
    /// `numeric_mapped`, `unknown_code`, `string_field`, or `missing`.
    pub type_source: String,
    /// Optional local correction. This never overwrites Zepp's raw type or the
    /// normalizer result and therefore survives a raw-record replay.
    #[serde(default)]
    pub user_override: Option<String>,
    /// The type consumers should display: override first, otherwise normalized.
    pub effective_type: String,
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

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
pub struct WorkoutSeriesSample {
    pub timestamp: String,
    pub heart_rate: Option<i32>,
    pub speed: Option<f64>,
    pub pace: Option<f64>,
    pub cadence: Option<f64>,
    pub stride_cm: Option<f64>,
    pub altitude_m: Option<f64>,
    /// Running power in watts (`power_meter`), verified against the workout
    /// summary's `average_power` / `max_power`.
    pub power_watts: Option<f64>,
    /// Ground contact time in milliseconds (`runPosture` field 1), verified
    /// against `averageGct` / `minGct`.
    pub ground_contact_ms: Option<f64>,
    /// Vertical oscillation in millimetres (`runPosture` field 2), verified
    /// against `averageVo` / `maxVo`.
    pub vertical_oscillation_mm: Option<f64>,
    /// Vertical stride ratio in percent (`runPosture` field 3), verified
    /// against `avgVertStrideRatio`.
    pub vertical_ratio_pct: Option<f64>,
    /// Grade-adjusted equivalent pace in seconds per kilometre (`equivPace`),
    /// verified against `bestEquivPace` and `avgEquivPace`.
    pub equivalent_pace_s_per_km: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct WorkoutPause {
    pub start_time: String,
    pub end_time: String,
    pub kind: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
pub struct WorkoutSeriesSummary {
    pub average_pace: Option<f64>,
    pub average_cadence: Option<f64>,
    pub max_cadence: Option<f64>,
    pub average_stride_cm: Option<f64>,
    pub elevation_gain_m: Option<f64>,
    pub elevation_loss_m: Option<f64>,
    pub average_power_watts: Option<f64>,
    pub max_power_watts: Option<f64>,
    pub average_ground_contact_ms: Option<f64>,
    pub average_vertical_oscillation_mm: Option<f64>,
    pub average_vertical_ratio_pct: Option<f64>,
    /// The fastest equivalent pace in the series, in seconds per kilometre.
    pub best_equivalent_pace_s_per_km: Option<f64>,
}

/// One kilometre of a workout, as stored.
///
/// Times are RFC3339 strings to match the rest of the series shapes crossing
/// the IPC boundary.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct WorkoutSplitRow {
    pub index: i32,
    pub start_time: String,
    pub end_time: String,
    pub distance_m: f64,
    pub duration_seconds: i64,
    pub pace_min_per_km: Option<f64>,
    pub avg_hr: Option<i32>,
    pub max_hr: Option<i32>,
    pub elevation_gain_m: Option<f64>,
    pub elevation_loss_m: Option<f64>,
    pub partial: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct WorkoutSeries {
    pub workout_id: String,
    pub samples: Vec<WorkoutSeriesSample>,
    pub route: Vec<WorkoutRoutePoint>,
    pub pauses: Vec<WorkoutPause>,
    pub splits: Vec<WorkoutSplitRow>,
    pub summary: WorkoutSeriesSummary,
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

/// One row of the capability overview shown in settings.
///
/// `status` is deliberately not a boolean. This API answers "200 with no
/// items" for event names that cannot possibly exist, so an absence of data
/// never proves a device lacks a sensor — only an outright rejection does.
/// Telling someone their watch does not support blood pressure when they have
/// simply never measured would send them shopping for hardware they own.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CapabilityItem {
    /// Stable key the UI maps to a label.
    pub stream: String,
    /// `available` — data is on disk.
    /// `no_records` — nothing measured in the window; cause unknown.
    /// `unsupported` — the server rejected the request outright.
    /// `unknown` — never checked.
    pub status: String,
    /// How many rows back this up, when there are any.
    pub records: i64,
    /// Unit for `records`, e.g. `天` or `条`.
    pub records_unit: String,
    /// Newest calendar date behind this capability.
    pub latest_date: Option<String>,
    /// One plain sentence about the data — never a claim about the hardware
    /// unless the server actually rejected the stream.
    pub note: Option<String>,
    /// `derived` when read from stored data, `probed` when it took a request.
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CapabilityOverview {
    pub items: Vec<CapabilityItem>,
    /// When the streams that needed a request were last checked.
    pub probed_at: Option<String>,
}

/// The result of asking the server whether one candidate stream exists.
///
/// Zepp's mobile event endpoint has no discovery call, and which streams
/// answer depends on the account, the devices and the region. A probe records
/// only whether a stream answered and the field *names* it used — never a
/// measured value, and nothing is written to the database.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CapabilityProbe {
    /// The ZeppBridge stream this candidate would feed, e.g. `spo2`.
    pub stream: String,
    /// Which event surface answered: `v2_events`, `user_events` or
    /// `user_events_day`. The same event name behaves differently on each.
    pub surface: String,
    /// `continuous` or `episodic` — how often the stream is measured, which
    /// decides how far back the probe looks and how silence should be read.
    pub cadence: String,
    pub window_days: i64,
    pub event_type: String,
    pub sub_type: String,
    /// `available` | `empty` | `unavailable` | `error`
    pub status: String,
    pub records: usize,
    /// Calendar date of the newest item, for streams measured occasionally.
    pub latest_date: Option<String>,
    pub fields: Vec<String>,
}

/// How much of each stream an export carries.
///
/// The per-second workout series and per-minute heart rate are 99% of an
/// export's bytes; a 30-day `Full` export is ~9 MB, which no model will read.
/// `Summary` aggregates those two and keeps every structured metric intact, so
/// the same window fits in a context window. `Full` stays available for
/// archival and is what the CSV/GPX converters always use.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ExportDetail {
    #[default]
    Summary,
    Full,
}

impl ExportDetail {
    pub fn is_full(self) -> bool {
        matches!(self, ExportDetail::Full)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportSelection {
    pub start_date: String,
    pub end_date: String,
    pub data_types: Vec<String>,
    /// Absent means `Summary`; older callers keep working.
    #[serde(default)]
    pub detail: ExportDetail,
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

/// One allowlisted field description. Only the key and JSON kind are carried;
/// the value is structurally impossible to serialize into a diagnostic report.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticField {
    pub name: String,
    pub json_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticObjectShape {
    pub path: String,
    pub fields: Vec<DiagnosticField>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticDeviceCandidate {
    pub catalog_id: String,
    pub canonical_name: String,
    pub firmware: Option<String>,
    pub match_status: DeviceMatchStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticDeviceEvidence {
    pub status: String,
    pub object_count: usize,
    pub unknown_device_count: usize,
    pub id_alias_objects: usize,
    pub serial_alias_objects: usize,
    pub name_field_objects: usize,
    pub firmware_field_objects: usize,
    pub candidates: Vec<DiagnosticDeviceCandidate>,
    pub unmatched_product_hints: Vec<String>,
    pub shapes: Vec<DiagnosticObjectShape>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticWorkoutCode {
    pub code: i32,
    pub records: i64,
}

/// Strongly typed, allowlist-only issue report. It has no slots for account
/// identifiers, tokens, serial values, GPS, health measurements, raw payloads,
/// or filesystem paths.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticReport {
    pub format: String,
    pub app_version: String,
    pub schema_version: i64,
    pub normalizer_revision: String,
    pub operating_system: String,
    pub device_evidence: DiagnosticDeviceEvidence,
    pub unknown_workout_codes: Vec<DiagnosticWorkoutCode>,
    pub workout_type_conflicts: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FeedbackSubmissionResult {
    pub report_id: String,
    pub submitted_at: DateTime<Utc>,
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

/// One day of a metric, with the spread behind it when the source has one.
///
/// `min` / `max` are only populated where the data really carries them --
/// either a companion daily metric (stress, respiratory rate) or the spread of
/// that day's samples. A day with a single reading reports no spread rather
/// than a zero-width one.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct MetricSeriesPoint {
    pub date: String,
    pub value: f64,
    pub min: Option<f64>,
    pub max: Option<f64>,
    /// How many readings the day's value was computed from, for sample-backed
    /// metrics. Absent for metrics the server already summarised per day.
    pub samples: Option<i64>,
}

/// One metric over a window, plus the facts the UI needs to label it honestly.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct MetricSeries {
    pub metric: String,
    pub unit: String,
    /// `daily_metrics` or `metric_samples` -- which table the values came from.
    pub source: String,
    pub points: Vec<MetricSeriesPoint>,
    pub latest: Option<MetricSeriesPoint>,
    /// Mean of the daily values in the window, not of the raw samples.
    pub average: Option<f64>,
    pub minimum: Option<f64>,
    pub maximum: Option<f64>,
    /// Days in the window that carry a value, so the UI can say how much of
    /// the range is actually covered instead of drawing a line through gaps.
    pub days_with_data: i64,
    pub window_days: i64,
}

/// One day of acute/chronic training load.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TrainingBalancePoint {
    pub date: String,
    pub acute_7d: f64,
    pub acute_days_with_data: i64,
    pub chronic_28d: f64,
    pub chronic_days_with_data: i64,
    /// Absent until the chronic window is mostly covered -- a ratio against a
    /// half-empty window reads as a spike that never happened.
    pub acute_chronic_ratio: Option<f64>,
}

/// One measured number a heart-rate zone model can be built on.
///
/// Every basis names where it came from and when it was measured. Nothing here
/// is estimated: there is deliberately no 220-minus-age entry.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct HeartRateBasis {
    pub id: String,
    /// `max_hr`, `resting_hr` or `threshold_hr` -- which slot it can fill.
    pub kind: String,
    pub label: String,
    pub value: f64,
    pub unit: String,
    /// Where the number is stored, e.g. `max(workouts.max_hr)`.
    pub source: String,
    /// The day it was measured, when the source pins one down.
    pub measured_at: Option<String>,
    pub note: Option<String>,
}

/// One band of a zone model, as a percentage of its basis.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct HeartRateZoneBand {
    pub zone: i32,
    pub label: String,
    pub low_percent: f64,
    pub high_percent: f64,
}

/// A way of turning measured heart rates into five zones.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct HeartRateZoneModel {
    pub id: String,
    pub label: String,
    pub formula: String,
    /// Basis kinds this model needs before it can be computed.
    pub requires: Vec<String>,
    pub bands: Vec<HeartRateZoneBand>,
    /// False when the library holds no basis of a required kind.
    pub available: bool,
}

/// One computed zone with the time spent in it.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct HeartRateZoneRow {
    pub zone: i32,
    pub label: String,
    pub min_bpm: i32,
    pub max_bpm: i32,
    pub seconds: i64,
}

/// Which model and bases the user picked. Every field starts empty: the
/// application does not choose a heart-rate model on someone's behalf.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct HeartRateZonePreference {
    pub model: Option<String>,
    pub max_basis: Option<String>,
    pub resting_basis: Option<String>,
    pub threshold_basis: Option<String>,
}

/// The zones for one chosen model, over one window of workout samples.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct HeartRateZoneReport {
    pub model: String,
    pub model_label: String,
    pub formula: String,
    /// The bases actually used, so the reader can check the arithmetic.
    pub bases: Vec<HeartRateBasis>,
    pub zones: Vec<HeartRateZoneRow>,
    pub below_zone_1_seconds: i64,
    /// Seconds above the model's top boundary. Zepp brackets its own zones the
    /// same way, and keeping the overflow separate means the five labelled
    /// zones stay exactly what their labels say.
    pub above_zone_5_seconds: i64,
    pub total_seconds: i64,
    pub window_days: i64,
    pub source: String,
}

/// Everything the zone picker needs: what can be measured, what can be built
/// from it, what the user chose, and the result of that choice.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct HeartRateZoneOptions {
    pub bases: Vec<HeartRateBasis>,
    pub models: Vec<HeartRateZoneModel>,
    pub preference: HeartRateZonePreference,
    /// Present only once the preference names a model and its bases.
    pub report: Option<HeartRateZoneReport>,
    pub window_days: i64,
}
