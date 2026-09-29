//! 来源范围、认证元数据、样本、日指标、睡眠、概览与饮食（从 models/types.rs 按领域拆出，形状不变）。

use super::*;

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
    pub deep_minutes: Option<i32>,
    pub light_minutes: Option<i32>,
    pub rem_minutes: Option<i32>,
    pub awake_minutes: Option<i32>,
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

/// 某个本地日里某一小时的步数（Zepp 官方的 `activities?interval=hourly`）。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct HourlySteps {
    /// 本地日历日 YYYY-MM-DD。
    pub date: String,
    /// 本地时间的 0–23 点。
    pub hour: i64,
    pub steps: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DailyPoint {
    pub date: String,
    pub value: f64,
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

/// Allowlisted food-log details, never the raw account response.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FoodEntry {
    pub date: String,
    pub food_log_id: Option<String>,
    pub food_name: Option<String>,
    pub food_text: Option<String>,
    pub meal_type: Option<String>,
    pub mealtime: Option<String>,
    /// Original reported weight; the source does not establish a unit.
    pub measure_weight: Option<f64>,
    pub nutrients: std::collections::BTreeMap<String, f64>,
}
