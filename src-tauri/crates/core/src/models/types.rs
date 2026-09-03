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
///
/// **不 derive `Debug`。** `app_token` 就是这个账号的全部权限：任何一句
/// `tracing::debug!("{auth:?}")`、任何一个 `.unwrap()` 的 panic 消息、任何
/// 一份用户贴上来的日志，都会把它原样带出去。今天生产代码里确实没有人打印
/// 完整的 `AuthInfo`，但那是靠所有人一直记得，而不是靠类型。
#[derive(Clone, Serialize, Deserialize)]
pub struct AuthInfo {
    pub app_token: String,
    pub user_id: String,
    pub region_host: String,
}

impl std::fmt::Debug for AuthInfo {
    /// 永久打码 `app_token`。
    ///
    /// 连长度都不给：token 长度本身是可以用来做指纹的，而调试时想知道的
    /// 只有「有没有」这一件事。`user_id` 和 `region_host` 保留——排查区域
    /// 探测那类问题时它们是必需的，而且都不是凭据。
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("AuthInfo")
            .field(
                "app_token",
                &if self.app_token.is_empty() {
                    "<empty>"
                } else {
                    "<redacted>"
                },
            )
            .field("user_id", &self.user_id)
            .field("region_host", &self.region_host)
            .finish()
    }
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
    /// `deep` / `light` / `rem` / `awake`，以及认不出来时的 `unknown`。
    ///
    /// **`unknown` 不是 `awake`。** 以前认不出的 mode 被归成清醒「避免阶段条
    /// 出现空洞」——代价是程序替用户断言了那一段他醒着。宁可画一段未知。
    pub stage: String,
    pub start_time: DateTime<Utc>,
    pub end_time: DateTime<Utc>,
    /// 云端给的原始 mode 值。
    ///
    /// 留着它是为了下一次：Zepp 新增一个 stage mode 时，光知道「有一段认不
    /// 出来」没法推进，知道「认不出来的是 13」才能查。和运动编号那件事是同
    /// 一个教训——没有原始码的错分永远缺证据。旧行为 `NULL`。
    #[serde(default)]
    pub raw_mode: Option<i64>,
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

/// 一段心率区间：在 `upper_bound_bpm` 以下（且高于前一段上限）待了多少秒。
///
/// 直接来自云端的 `heart_range`，不是我们自己切的——它用的是用户在表上设定
/// 的区间边界，我们没有那份设定，自己切只会切出另一套数字。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct HeartRateZoneBucket {
    /// 0 起的区间序号。
    pub index: i32,
    /// 这一段的心率上限。
    pub upper_bound_bpm: i32,
    pub seconds: i64,
}

/// 测试专用的 `Default`。
///
/// `Workout` 现在有二十多个字段，其中十几个是「云端给了就有、没给就是 None」
/// 的可选汇总项。测试里只关心其中一两个，却要把每一个都写出来——加一个字段就
/// 得改十几处测试，而那些改动没有任何断言价值。
///
/// 只在测试里存在：生产代码构造 `Workout` 必须逐字段写清楚，一个默认到 UNIX
/// 纪元的时间戳不该有机会溜进真实数据。
#[cfg(test)]
impl Default for Workout {
    fn default() -> Self {
        Self {
            workout_id: String::new(),
            workout_type: String::new(),
            normalized_type: String::new(),
            type_source: "missing".to_string(),
            user_override: None,
            effective_type: String::new(),
            custom_label: None,
            start_time: DateTime::<Utc>::from_timestamp(0, 0).expect("纪元时间有效"),
            end_time: DateTime::<Utc>::from_timestamp(0, 0).expect("纪元时间有效"),
            distance_meters: None,
            calories: None,
            avg_hr: None,
            max_hr: None,
            training_load: None,
            vo2max: None,
            min_hr: None,
            total_steps: None,
            moving_seconds: None,
            elevation_gain_m: None,
            elevation_loss_m: None,
            max_altitude_m: None,
            min_altitude_m: None,
            training_effect: None,
            anaerobic_training_effect: None,
            rpe: None,
            avg_cadence_spm: None,
            max_cadence_spm: None,
            avg_stride_cm: None,
            hr_zones: Vec::new(),
            source_scope: SourceScope::Unknown,
            device_id: None,
            synced_at: None,
            gps_available: false,
            sample_count: 0,
            zepp_source: None,
            zepp_type: None,
        }
    }
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
    /// The name the user gave this Zepp type code, when the bundled catalog
    /// cannot resolve it. Zepp's custom training templates arrive as numbers
    /// with no name attached, and guessing what code 226 means would be
    /// inventing data — so the user names it once and every record with that
    /// code uses it. Never set for codes the catalog already knows.
    #[serde(default)]
    pub custom_label: Option<String>,
    pub start_time: DateTime<Utc>,
    pub end_time: DateTime<Utc>,
    pub distance_meters: Option<f64>,
    pub calories: Option<i32>,
    pub avg_hr: Option<i32>,
    pub max_hr: Option<i32>,
    pub training_load: Option<f64>,
    pub vo2max: Option<f64>,
    /// 这次运动的最低心率。云端一直在给，只是以前没取。
    #[serde(default)]
    pub min_hr: Option<i32>,
    /// 步数。骑行这类不产生步数的运动是 `None`，不是 0——「没有步数」和
    /// 「走了 0 步」是两回事。
    #[serde(default)]
    pub total_steps: Option<i32>,
    /// 运动时长（秒），来自云端的 `run_time`。它和 `end_time - start_time`
    /// 不是一回事：后者含暂停。
    #[serde(default)]
    pub moving_seconds: Option<i64>,
    /// 累计爬升 / 下降（米）。
    ///
    /// 优先取云端自己的值，因为那是用户在 Zepp App 里看到的数字；云端没给时
    /// 才回退到解析器从海拔序列按 1 米噪声底切出来的那个。两者会有出入
    /// （实测一次健走：云端 59 m，我们算 37 m），而「和 App 对不上」会被当成
    /// bug 报上来。
    #[serde(default)]
    pub elevation_gain_m: Option<f64>,
    #[serde(default)]
    pub elevation_loss_m: Option<f64>,
    /// 最高 / 最低海拔（米）。
    #[serde(default)]
    pub max_altitude_m: Option<f64>,
    #[serde(default)]
    pub min_altitude_m: Option<f64>,
    /// 训练效果，有氧与无氧。云端存的是十倍整数（22 表示 2.2）。
    #[serde(default)]
    pub training_effect: Option<f64>,
    #[serde(default)]
    pub anaerobic_training_effect: Option<f64>,
    /// 主观疲劳度（RPE），用户在表上自己选的。
    #[serde(default)]
    pub rpe: Option<i32>,
    /// 平均 / 最高步频，单位是步每分钟。
    ///
    /// 单位是和云端汇总对过账的，见 `export_fit::steps_per_minute_to_fit_cadence`
    /// 上面那张表。
    #[serde(default)]
    pub avg_cadence_spm: Option<f64>,
    #[serde(default)]
    pub max_cadence_spm: Option<f64>,
    /// 平均步幅（厘米）。
    #[serde(default)]
    pub avg_stride_cm: Option<f64>,
    /// 云端算好的心率区间分布。
    ///
    /// Zepp 的 `heart_range` 就是这个，格式是 `秒数,区间上限` 的六段。以前整条
    /// 丢掉了，于是「这次运动在各心率区间待了多久」这件事明明有现成答案，界面
    /// 上却什么都没有。
    #[serde(default)]
    pub hr_zones: Vec<HeartRateZoneBucket>,
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

/// 全天压力曲线上的一个读数。
///
/// 和心率点长得一样，但不合并成一个类型：这两条曲线的单位、量程和空值含义
/// 都不同，共用一个名字只会让调用处读起来像是在画心率。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StressPoint {
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
    /// 本机保留最近多少天。清理在每次成功同步之后执行。
    pub retention_days: i64,
    /// 一次历史补拉往回覆盖多少天。
    ///
    /// 和 `retention_days` **解耦**：保留期决定本机留多久，补拉决定往回取多远。
    /// 以前两者共用一个 1–365 的上限，于是「我想把三年前的记录拿回来」这件事
    /// 在界面上根本表达不出来。
    pub history_sync_days: i64,
    /// 长期归档。开启后成功同步不再自动清理历史，`retention_days` 只作为
    /// 关闭归档时的参考值保留。
    #[serde(default)]
    pub archive_enabled: bool,
}

impl UserPrefs {
    pub const DEFAULT_RETENTION_DAYS: i64 = 365;
    pub const DEFAULT_HISTORY_SYNC_DAYS: i64 = 180;
    /// 历史补拉的上限：十年。再往前 Zepp 也不会有记录，而一个没有上限的
    /// 输入框只会让人不小心排出一个跑几天的任务。
    pub const MAX_HISTORY_SYNC_DAYS: i64 = 3650;

    /// 保留期的取值范围。
    pub fn clamp_days(value: i64) -> std::result::Result<i64, String> {
        if (1..=365).contains(&value) {
            Ok(value)
        } else {
            Err("保留天数必须在 1 到 365 之间".into())
        }
    }

    /// 历史补拉的取值范围。
    pub fn clamp_history_days(value: i64) -> std::result::Result<i64, String> {
        if (1..=Self::MAX_HISTORY_SYNC_DAYS).contains(&value) {
            Ok(value)
        } else {
            Err(format!(
                "历史补拉天数必须在 1 到 {} 之间",
                Self::MAX_HISTORY_SYNC_DAYS
            ))
        }
    }

    /// 这次补拉会不会拉回一批马上又被清掉的数据。
    ///
    /// 「刚补拉完，下一次成功同步就删掉」是最让人失去信任的行为之一，所以
    /// 这个组合要在开始之前就被拦住，而不是事后解释。
    pub fn backfill_would_be_cleaned_up(&self, requested_days: i64) -> bool {
        !self.archive_enabled && requested_days > self.retention_days
    }
}

/// 单条流的占用估算。
///
/// 拆到流一级，是因为「再补三年要多大」这个问题的答案完全取决于用户戴不戴表
/// 睡觉、跑不跑步。一个全局常数对每天跑步的人和一年跑两次的人给出同一个数字，
/// 那个数字对两个人都没用。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct StreamStorageEstimate {
    pub stream: String,
    /// 本机已经存下多少个不同的日子。样本太少就不足以外推。
    pub observed_days: i64,
    /// 本机这条流的原始报文字节数。
    pub observed_bytes: u64,
    pub bytes_per_day: u64,
    /// true = 从本机已有数据量算出来的；false = 本机样本不足，没有估算。
    pub measured: bool,
    pub estimated_add_bytes: u64,
}

/// 一次历史报文压缩的结果。
///
/// 分开报「压了几条」和「跳过几条」：跳过不是失败，但也不能算成功——
/// 用户点了一次按钮，得知道到底动了多少东西。
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RawPayloadCompaction {
    pub compacted: u64,
    pub skipped: u64,
    pub bytes_before: u64,
    pub bytes_after: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct StorageEstimate {
    pub free_bytes: u64,
    pub estimated_add_bytes: u64,
    pub database_bytes: u64,
    pub allow_long_history: bool,
    pub warn_tight_space: bool,
    pub message: String,
    /// `message` 那句话的稳定码。界面按它选自己语言的说法，再用下面这些
    /// 数字自己排版——后端不按 locale 出文案。
    #[serde(default)]
    pub message_code: String,
    /// 这次估算针对多少天。
    #[serde(default)]
    pub requested_days: i64,
    #[serde(default)]
    pub streams: Vec<StreamStorageEstimate>,
    /// 全部六条流都有足够本机样本时才为真。为假时总数只是粗略参考。
    #[serde(default)]
    pub measured: bool,
    /// 非 None 表示空间不足以开始这次补拉，值是给用户看的理由。
    #[serde(default)]
    pub stop_reason: Option<String>,
    /// `stop_reason` 那句话的稳定码。
    #[serde(default)]
    pub stop_reason_code: Option<String>,
    /// 这次补拉预计需要的字节数，含安全余量。界面排 stop_reason 那句话要用。
    #[serde(default)]
    pub needed_bytes: u64,
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
    ///
    /// 这一份是给 CLI / MCP / 本机 API 的：它们的输出不跟界面语言走，改它等于
    /// 改外部工具看到的东西。界面读的是下面的 `records_unit_code`。
    pub records_unit: String,
    /// 单位的稳定码（`days` / `records`），界面按它出文案。
    ///
    /// 后端不按 locale 产出文案是刻意的：GUI / CLI / MCP / 导出四个出口对同一个
    /// 问题必须给同一份回答。所以后端发码，翻译留在界面。
    #[serde(default)]
    pub records_unit_code: String,
    /// 这条流的判定窗口有多少天。界面要用它说「最近 N 天没有记录」。
    #[serde(default)]
    pub window_days: i64,
    /// Newest calendar date behind this capability.
    pub latest_date: Option<String>,
    /// One plain sentence about the data — never a claim about the hardware
    /// unless the server actually rejected the stream.
    pub note: Option<String>,
    /// `derived` when read from stored data, `probed` when it took a request.
    pub source: String,
    /// ZeppBridge 是否真的把这条流读进了本机库。
    ///
    /// 探测说「云端有 42 条」并不等于本机有：体重和血压目前只探测、不归一化。
    /// 不把这两件事分开，能力页会让人以为 ZeppBridge 已经存着他的血压——
    /// 那是这个产品最不该给出的错觉。
    #[serde(default)]
    pub ingested: bool,
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

/// 一次导出覆盖什么。
///
/// 两个变体互斥，不是「都传了谁优先」：一个既带日期范围又带 workout id 的
/// 请求，调用方自己都说不清想要什么，与其替他选一个，不如直接拒绝。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum ExportScope {
    DateRange {
        start: String,
        end: String,
    },
    // 枚举上的 rename_all 只改变体名，不改变体内字段名，所以这里要再标一次，
    // 否则前端发的 `workoutId` 会被当成缺字段。
    #[serde(rename_all = "camelCase")]
    Workout {
        workout_id: String,
    },
}

/// 单次导出的最大跨度。365 天之外的历史请走数据库快照，不要塞进一个
/// 要交给 AI 的 JSON。
pub const MAX_EXPORT_RANGE_DAYS: i64 = 365;

impl ExportScope {
    pub fn date_range(start: impl Into<String>, end: impl Into<String>) -> Self {
        ExportScope::DateRange {
            start: start.into(),
            end: end.into(),
        }
    }

    /// 校验并归一化。日期必须是 `YYYY-MM-DD`，结束不能早于开始，跨度有上限，
    /// workout id 不能为空。
    pub fn validated(&self) -> std::result::Result<ExportScope, String> {
        match self {
            ExportScope::DateRange { start, end } => {
                let parsed_start = chrono::NaiveDate::parse_from_str(start.trim(), "%Y-%m-%d")
                    .map_err(|_| "导出开始日期无效".to_string())?;
                let parsed_end = chrono::NaiveDate::parse_from_str(end.trim(), "%Y-%m-%d")
                    .map_err(|_| "导出结束日期无效".to_string())?;
                if parsed_end < parsed_start {
                    return Err("导出结束日期不能早于开始日期".into());
                }
                if (parsed_end - parsed_start).num_days() > MAX_EXPORT_RANGE_DAYS {
                    return Err("单次导出范围不能超过 366 天".into());
                }
                Ok(ExportScope::DateRange {
                    start: parsed_start.format("%Y-%m-%d").to_string(),
                    end: parsed_end.format("%Y-%m-%d").to_string(),
                })
            }
            ExportScope::Workout { workout_id } => {
                let trimmed = workout_id.trim();
                if trimmed.is_empty() {
                    return Err("workout id 不能为空".into());
                }
                Ok(ExportScope::Workout {
                    workout_id: trimmed.to_string(),
                })
            }
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportSelection {
    /// 新调用方传这个。
    #[serde(default)]
    pub scope: Option<ExportScope>,
    /// 旧调用方的日期范围。短期兼容用，内部一律先转成 `ExportScope`。
    #[serde(default)]
    pub start_date: Option<String>,
    #[serde(default)]
    pub end_date: Option<String>,
    pub data_types: Vec<String>,
    /// Absent means `Summary`; older callers keep working.
    #[serde(default)]
    pub detail: ExportDetail,
}

impl ExportSelection {
    /// 把新旧两种写法收敛成唯一的范围。
    ///
    /// 同时给了 `scope` 和 `startDate/endDate` 是矛盾请求，直接报错而不是
    /// 定一个优先级——优先级规则只会让下一个人写出「我以为传了 workoutId
    /// 就只导这一条」的 bug。
    pub fn resolve_scope(&self) -> std::result::Result<ExportScope, String> {
        let legacy = match (self.start_date.as_deref(), self.end_date.as_deref()) {
            (Some(start), Some(end)) => Some(ExportScope::date_range(start, end)),
            (None, None) => None,
            _ => return Err("导出日期范围必须同时提供开始和结束".into()),
        };
        match (self.scope.as_ref(), legacy) {
            (Some(_), Some(_)) => {
                Err("导出范围只能二选一：日期范围或单次运动，不能同时提供".into())
            }
            (Some(scope), None) => scope.validated(),
            (None, Some(scope)) => scope.validated(),
            (None, None) => Err("导出请求缺少范围：需要日期范围或 workout id".into()),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportResult {
    pub path: String,
    pub record_count: usize,
    pub bytes: usize,
    pub generated_at: String,
    /// 这次导出写了几个文件。
    ///
    /// 只有 FIT 会给出它：FIT 的 activity 文件按约定装一次活动，所以一个日期
    /// 范围导出的是一个目录下的多份文件，而 `path` 指向那个目录。其余格式一次
    /// 只写一个文件，这里是 `None`，界面也就不会去说「共 1 个文件」这种废话。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub file_count: Option<usize>,
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
    /// The user told us which model this is, because the account's device
    /// response carried no product name for ZeppBridge to match on. It is a
    /// correction, not a recognition, and the UI must say so.
    UserAssigned,
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
    /// 型号类数字标识，形如 `deviceSource:7930112` / `deviceType:5`。
    ///
    /// 有些账号的设备响应里根本没有产品名字段，这两个数字是仅有的型号线索。
    /// 它们描述的是「哪一款表」，不是「哪一台表」：没有序列号、MAC、
    /// 绑定时间或任何随设备实例变化的值，所以可以安全地用来补内置目录。
    /// 只收整数，其他一律丢弃。
    #[serde(default)]
    pub model_identifier_hints: Vec<String>,
    pub shapes: Vec<DiagnosticObjectShape>,
}

/// 用户手动指认的型号，配上这台设备的型号类编号。
///
/// 这一对是内置目录唯一可能的成长来源：华米没有公开「编号 → 型号」的对照，
/// 而有些账号的设备响应里除了这些数字什么都没有。一个用户指认一次，下一版
/// 目录就能让所有同款设备自动识别。
///
/// 两半都是型号级事实：`catalog_id` 是随包目录里的产品，`hints` 只含
/// `deviceSource:整数` 这种取值。没有序列号、MAC、账号或任何设备实例信息。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticAssignedModel {
    pub catalog_id: String,
    pub model_identifier_hints: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticWorkoutCode {
    pub code: i32,
    pub records: i64,
}

/// 云端在 HTTP 200 里写的那个「不成功」。
///
/// 只有三个字段，里面没有一个是自由文本：哪条流、哪个 code、什么时候。
/// 云端的原话（`message`）刷意不收——那是服务端给的自由文本，而这份报告
/// 对用户的承诺是只发白名单字段。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticCloudRejection {
    /// 哪条流被拒了（`workouts` / `sleep` / …）。
    pub stream: String,
    /// 报文里的 `code`。成功是 1；其余值目前一个都没观测到过。
    pub code: i64,
    /// RFC3339。取三个阶段里最先有值的那个。
    pub at: Option<String>,
}

/// 用户把某个 Zepp 运动编号纠正成了什么。
///
/// 这是 issue #24 那类问题唯一可能的证据来源。报告者说「越野跑被识别成了
/// 公开水域游泳」，而当时的诊断报告里 `unknown_workout_codes` 是空的、
/// `workout_type_conflicts` 是 0 —— 因为那个编号我们**认识**，只是认错了。
/// 认错和不认识在旧字段里长得完全一样：都没有任何编号信息。
///
/// 三个字段都是类型级事实：云端给的编号、我们的解释、用户的解释。**不含
/// 任何实例信息**——没有 workout_id、没有时间、没有距离、没有 GPS。
/// `corrected` 的取值被随包运动目录的 key 约束死（见
/// `set_workout_type_override`），不是自由文本。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticWorkoutCorrection {
    /// 云端给的原始运动编号。
    pub code: i32,
    /// ZeppBridge 自己解释成的运动 key（例如 `open_water_swimming`）。
    pub interpreted: String,
    /// 用户改成的运动 key（例如 `trail_running`）。
    pub corrected: String,
    /// 用户这样改过多少条记录。一条和二十条的分量不一样。
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
    /// 用户手动指认的型号与该设备的型号类编号。只有用户在选择器里勾选了
    /// 「帮忙补充目录」时才会有内容；没勾选就是空的，报告里也就没有这一段。
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub user_assigned_models: Vec<DiagnosticAssignedModel>,
    pub unknown_workout_codes: Vec<DiagnosticWorkoutCode>,
    /// 用户做过的运动类型纠正，按「编号 → 我们的解释 → 用户的解释」聚合。
    ///
    /// 没有纠正过就整段不出现，报告不会因此变大。
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub workout_type_corrections: Vec<DiagnosticWorkoutCorrection>,
    pub workout_type_conflicts: i64,
    /// 用户自己选的问题类型（`device` / `workout` / `data` / `other`）。
    ///
    /// 本机的自动检测只能发现「有未识别的设备或运动编号」这类问题。用户遇到的
    /// 可能是别的——数据对不上、某项一直是空。没有这个字段时，这些人连报都报
    /// 不了，因为服务端会判定「没有可处理的内容」。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub category: Option<String>,
    /// 用户自己写的一句说明（「我的表是 Balance 2，但没被识别」）。
    ///
    /// 光有字段结构和编号，收到报告的人经常判断不出这到底是哪一款表；一句人话
    /// 往往比十个字段更有用。但它是自由文本，所以在发出之前要过一遍脱敏和长度
    /// 上限——用户可能顺手把 token 或本机路径粘进来。没填就整段不出现。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub user_note: Option<String>,
    /// 最近一次云端业务拒绝。没遇到过就整段不出现。
    ///
    /// 这是为了把 `classify_business_code` 那个环闭上：它已经能把「HTTP 200
    /// 但云端说不成功」认出来了，却故意不敲定它是不是「需要重新登录」——
    /// 因为本机根本没有观测到任何一个失败码。下一份带着具体 code 的报告
    /// 就能把它精确地映成 `NeedsReauth`。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_cloud_rejection: Option<DiagnosticCloudRejection>,
}

/// 自由文本备注的上限。够写清「设备是 Balance 2，固件 3.5.1，运动类型显示成未知」，
/// 又不至于让人把整段日志粘进来。
pub const DIAGNOSTIC_NOTE_MAX_CHARS: usize = 500;

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

/// 供界面渲染「这是我的哪台设备」下拉框的一个选项。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DeviceCatalogOption {
    pub catalog_id: String,
    pub canonical_name: String,
    pub name_zh: Option<String>,
    pub kind: String,
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
    /// 中文说明。CLI / MCP 用它，不跟界面语言走；界面按 `id` 自己出文案。
    pub note: Option<String>,
    /// 说明里带的那个数字（本地统计静息心率用了多少天）。界面要写出这个数，
    /// 就不能只靠 `id` 查一句死文案。
    #[serde(default)]
    pub note_count: Option<i64>,
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

#[cfg(test)]
mod export_scope_tests {
    use super::*;

    fn selection(
        scope: Option<ExportScope>,
        start: Option<&str>,
        end: Option<&str>,
    ) -> ExportSelection {
        ExportSelection {
            scope,
            start_date: start.map(str::to_string),
            end_date: end.map(str::to_string),
            data_types: vec!["workouts".into()],
            detail: ExportDetail::default(),
        }
    }

    #[test]
    fn a_request_that_names_both_a_range_and_a_workout_is_refused() {
        // 这是矛盾请求。定一个优先级只会让下一个人写出「我以为传了 workoutId
        // 就只导这一条」的 bug，所以直接拒绝。
        let both = selection(
            Some(ExportScope::Workout {
                workout_id: "run-1".into(),
            }),
            Some("2026-08-01"),
            Some("2026-08-07"),
        );
        let error = both.resolve_scope().unwrap_err();
        assert!(error.contains("二选一"), "{error}");
    }

    #[test]
    fn a_request_with_no_range_at_all_is_refused() {
        let error = selection(None, None, None).resolve_scope().unwrap_err();
        assert!(error.contains("缺少范围"), "{error}");
    }

    #[test]
    fn half_a_legacy_range_is_refused_rather_than_guessed() {
        assert!(selection(None, Some("2026-08-01"), None)
            .resolve_scope()
            .is_err());
        assert!(selection(None, None, Some("2026-08-07"))
            .resolve_scope()
            .is_err());
    }

    #[test]
    fn legacy_date_fields_still_work_on_their_own() {
        let resolved = selection(None, Some("2026-08-01"), Some("2026-08-07"))
            .resolve_scope()
            .unwrap();
        assert_eq!(
            resolved,
            ExportScope::date_range("2026-08-01", "2026-08-07")
        );
    }

    #[test]
    fn a_reversed_range_is_refused() {
        let error = ExportScope::date_range("2026-08-07", "2026-08-01")
            .validated()
            .unwrap_err();
        assert!(error.contains("不能早于"), "{error}");
    }

    #[test]
    fn an_oversized_range_is_refused_at_the_documented_boundary() {
        // 恰好 365 天之差（366 天含头尾）仍然允许；再多一天就拒绝。
        assert!(ExportScope::date_range("2025-08-01", "2026-08-01")
            .validated()
            .is_ok());
        assert!(ExportScope::date_range("2025-08-01", "2026-08-02")
            .validated()
            .is_err());
    }

    #[test]
    fn a_malformed_date_is_refused_rather_than_silently_clamped() {
        assert!(ExportScope::date_range("not-a-date", "2026-08-01")
            .validated()
            .is_err());
        assert!(ExportScope::date_range("2026-08-01", "2026-13-45")
            .validated()
            .is_err());
    }

    #[test]
    fn an_empty_workout_id_is_refused() {
        let error = ExportScope::Workout {
            workout_id: "   ".into(),
        }
        .validated()
        .unwrap_err();
        assert!(error.contains("不能为空"), "{error}");
    }

    #[test]
    fn scope_round_trips_through_the_ipc_shape_the_frontend_sends() {
        let workout: ExportScope =
            serde_json::from_str(r#"{"kind":"workout","workoutId":"run-1"}"#).unwrap();
        assert_eq!(
            workout,
            ExportScope::Workout {
                workout_id: "run-1".into()
            }
        );
        let range: ExportScope =
            serde_json::from_str(r#"{"kind":"dateRange","start":"2026-08-01","end":"2026-08-07"}"#)
                .unwrap();
        assert_eq!(range, ExportScope::date_range("2026-08-01", "2026-08-07"));
    }
}

/// 某一天原始心率样本的极值和样本数。
///
/// `samples` 不是可选的。一天只有 12 个样本时，`max` 是这 12 个点里的最高，
/// 不是这一天的最高；不把样本数一起交出去，界面只能把它当成完整最大值来
/// 画——那就是在编造事实。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DailyHeartRateExtreme {
    /// 本地时区的日期，`YYYY-MM-DD`。
    pub date: String,
    pub max: i32,
    pub min: i32,
    pub average: i32,
    /// 这一天本机存了多少个原始心率样本。
    pub samples: i64,
}
