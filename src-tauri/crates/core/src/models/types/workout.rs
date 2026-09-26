//! 运动记录与逐点序列（从 models/types.rs 按领域拆出，形状不变）。

use super::*;

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

/// 手表自己记的一圈，从库里读出来的形状。
///
/// 和 [`WorkoutSplitRow`] 并列而不是取代它：split 是我们按每公里切的，
/// lap 是手表在运动当时记的（圈键、按距离自动分段、间歇课的每一段）。
/// 一次跑步可以同时有两者，含义不同。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct WorkoutLapRow {
    pub index: i32,
    pub start_time: String,
    pub end_time: String,
    pub distance_m: f64,
    pub duration_seconds: i64,
    pub avg_hr: Option<i32>,
    pub max_hr: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct WorkoutSeries {
    pub workout_id: String,
    pub samples: Vec<WorkoutSeriesSample>,
    pub route: Vec<WorkoutRoutePoint>,
    pub pauses: Vec<WorkoutPause>,
    pub splits: Vec<WorkoutSplitRow>,
    /// 手表记的圈。空数组表示这次运动没有记圈——绝大多数运动如此。
    #[serde(default)]
    pub laps: Vec<WorkoutLapRow>,
    pub summary: WorkoutSeriesSummary,
}

#[derive(Debug, Clone)]
pub struct PendingWorkoutDetail {
    pub workout_id: String,
    pub source: String,
}
