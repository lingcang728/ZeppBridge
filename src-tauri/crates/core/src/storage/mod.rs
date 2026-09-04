use crate::decoder::{decode_workout_detail, DecodedWorkout};
use crate::models::{error::*, *};
use crate::normalizer::Normalizer;
use chrono::{DateTime, Duration, Local, NaiveDate, Utc};
use rusqlite::{params, Connection, OptionalExtension};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};
use std::path::{Path, PathBuf};

/// 当前 SQLite schema 版本（`PRAGMA user_version`）。加新版本只能追加迁移
/// 步骤，不要改已有 DDL。
pub const CURRENT_SCHEMA_VERSION: i64 = 20;
/// 写进备份 manifest 的应用版本。Core 是独立 crate，用它自己的包版本。
const APP_VERSION: &str = env!("CARGO_PKG_VERSION");
/// 解析器修订号。**改了运动目录或任何归一化规则，就必须往前走一格。**
///
/// 它是自动重放的唯一触发条件：启动时发现库里存的修订号和这个不一样，就把
/// `raw_records` 重新跑一遍。不动它，新加的编号只对以后同步来的记录生效，
/// 已经存成 `unknown:211` 的那 199 条记录会永远挂着——而报这个问题的人恰恰
/// 是因为历史记录才来报的。
pub const NORMALIZER_REVISION: &str = "zepp-normalizer-2026-09-v21-elliptical";
/// 上一版的修订号。从它升上来时只重放这几条流。
///
/// v20 到 v21 只动了一件事：运动目录里加了 `12 -> elliptical`（椭圆机）。
/// 编号只在 `normalize_workouts_*` 里被翻译成运动名（normalizer/mod.rs 的
/// `zepp_sport_type_name`，全仓库唯一的调用点），所以只有 workouts 这一条流
/// 需要重放。`workout_detail` 里没有类型编号，daily_summary / wellness /
/// sleep / hrv / heart_rate 的解析一个字节都没动。
const PREVIOUS_RELEASE_NORMALIZER_REVISION: &str = "zepp-normalizer-2026-09-v20-cloud-fields";
/// 从上一版升上来时要重放的流。**改归一化规则时必须一起看这里**：漏掉一条
/// 流，那条流的历史记录就永远停在旧规则上，而升级看起来是成功的。
const PREVIOUS_RELEASE_REPLAY_STREAMS: [&str; 1] = ["workouts"];
const LAST_CLOUD_SYNC_AT_KEY: &str = "last_cloud_sync_at";
const LAST_CLOUD_SYNC_OUTCOME_KEY: &str = "last_cloud_sync_outcome";
const LAST_LOCAL_REPROCESS_AT_KEY: &str = "last_local_reprocess_at";
const RETENTION_DAYS_KEY: &str = "retention_days";
const HISTORY_SYNC_DAYS_KEY: &str = "history_sync_days";
const ARCHIVE_ENABLED_KEY: &str = "archive_enabled";
const HEART_RATE_ZONE_PREF_KEY: &str = "heart_rate_zone_preference";
const BYTES_PER_HISTORY_DAY: u64 = 800_000;
/// 一次重放在一个事务里处理多少条原始报文。
///
/// 从前这里没有事务，每插一行派生记录就自动提交一次。842 MB 的库上光重放
/// wellness 一条流就要 237 秒，而那段时间几乎没有一秒花在解析上——全花在
/// 每次提交的 fsync 上。整库包成一个大事务会再快一点，代价是 WAL 得装下全
/// 部派生数据；按批提交拿到同一个数量级的提速，同时把 WAL 峰值钉在一批之内，
/// 而这段代码恰恰要在 NAS 和容器上跑。
const REPLAY_BATCH_RECORDS: usize = 64;
/// 少于这么多天的本机样本，不足以外推占用速率。
const MIN_OBSERVED_DAYS: i64 = 7;
/// 估算之外再留 200 MB。刚好填满磁盘和放不下一样糟糕。
const SPACE_SAFETY_MARGIN_BYTES: u64 = 200 * 1024 * 1024;

pub mod backup;
pub mod corrections;
pub mod coverage;
mod migrations;
pub mod provenance;
pub mod write_lock;

pub struct Database {
    /// crate 内可见：洞察、备份等同属 Core 的模块直接复用这条连接，
    /// 而不是各自再开一条去争锁。crate 之外仍然只能走公开方法。
    pub(crate) conn: Connection,
}

/// True while the startup replay is rewriting derived rows from stored raw
/// payloads.
///
/// The replay writes in bulk on its own connection; an automatic sync landing
/// in the middle of it used to lose the race for the write lock and surface as
/// a red "本地数据库暂时不可用". A sync that knows the replay is running can
/// stand aside and come back instead, which is the honest answer: nothing
/// failed, the library is busy healing itself.
/// 是否正在后台压缩历史报文。
///
/// 和重放同样的做法：界面要能说「正在压缩」，同步也要知道此刻有人在写库。
static COMPACTION_IN_PROGRESS: std::sync::atomic::AtomicBool =
    std::sync::atomic::AtomicBool::new(false);

pub fn compaction_in_progress() -> bool {
    COMPACTION_IN_PROGRESS.load(std::sync::atomic::Ordering::SeqCst)
}

struct CompactionGuard;

impl CompactionGuard {
    fn enter() -> Self {
        COMPACTION_IN_PROGRESS.store(true, std::sync::atomic::Ordering::SeqCst);
        CompactionGuard
    }
}

impl Drop for CompactionGuard {
    fn drop(&mut self) {
        COMPACTION_IN_PROGRESS.store(false, std::sync::atomic::Ordering::SeqCst);
    }
}

static REPLAY_IN_PROGRESS: std::sync::atomic::AtomicBool =
    std::sync::atomic::AtomicBool::new(false);

/// Whether a raw-payload replay is running right now.
pub fn replay_in_progress() -> bool {
    REPLAY_IN_PROGRESS.load(std::sync::atomic::Ordering::SeqCst)
}

/// Clears the replay flag however the replay ends, including on an early
/// return or a panic.
struct ReplayGuard;

impl ReplayGuard {
    fn enter() -> Self {
        REPLAY_IN_PROGRESS.store(true, std::sync::atomic::Ordering::SeqCst);
        Self
    }
}

impl Drop for ReplayGuard {
    fn drop(&mut self) {
        REPLAY_IN_PROGRESS.store(false, std::sync::atomic::Ordering::SeqCst);
    }
}

/// 一批重放的事务边界。
///
/// 提交必须显式调用 `commit()`；`?` 提前返回和 panic 都走 `Drop`，回滚。
/// 手写而不是用 `rusqlite::Transaction`，是因为整个 `Database` 只拿得到
/// `&self.conn`，而 `Transaction` 要借走 `&mut Connection`。
struct ReplayBatch<'a> {
    conn: &'a Connection,
    open: bool,
}

impl<'a> ReplayBatch<'a> {
    fn begin(conn: &'a Connection) -> Result<Self> {
        conn.execute("BEGIN IMMEDIATE", [])?;
        Ok(Self { conn, open: true })
    }

    fn commit(mut self) -> Result<()> {
        self.open = false;
        self.conn.execute("COMMIT", [])?;
        Ok(())
    }
}

impl Drop for ReplayBatch<'_> {
    fn drop(&mut self) {
        if self.open {
            let _ = self.conn.execute("ROLLBACK", []);
        }
    }
}

#[derive(Debug, Clone)]
struct StoredWorkoutType {
    normalized_type: String,
    type_source: String,
    user_override: Option<String>,
    zepp_type: Option<i32>,
    conflict: Option<String>,
}

fn type_evidence_rank(source: &str) -> u8 {
    match source {
        "numeric_mapped" | "unknown_code" => 3,
        "string_field" => 2,
        _ => 1,
    }
}

fn merge_workout_type(
    existing: Option<StoredWorkoutType>,
    incoming: &Workout,
) -> StoredWorkoutType {
    let Some(existing) = existing else {
        return StoredWorkoutType {
            normalized_type: incoming.normalized_type.clone(),
            type_source: incoming.type_source.clone(),
            user_override: incoming.user_override.clone(),
            zepp_type: incoming.zepp_type,
            conflict: None,
        };
    };

    let old_rank = type_evidence_rank(&existing.type_source);
    let new_rank = type_evidence_rank(&incoming.type_source);
    let mut merged = if new_rank > old_rank {
        StoredWorkoutType {
            normalized_type: incoming.normalized_type.clone(),
            type_source: incoming.type_source.clone(),
            user_override: existing.user_override.clone(),
            zepp_type: incoming.zepp_type,
            conflict: existing.conflict.clone(),
        }
    } else if new_rank < old_rank {
        existing.clone()
    } else if new_rank == 3 && incoming.zepp_type == existing.zepp_type {
        // Same raw code, newer normalizer interpretation. This is what makes a
        // revision replay able to correct old rows without losing overrides.
        StoredWorkoutType {
            normalized_type: incoming.normalized_type.clone(),
            type_source: incoming.type_source.clone(),
            user_override: existing.user_override.clone(),
            zepp_type: incoming.zepp_type,
            conflict: existing.conflict.clone(),
        }
    } else if new_rank == 3 {
        // Two different numeric facts for one workout are a server conflict.
        // Pick the smaller code deterministically so request order cannot
        // change the result, and retain every observed code for diagnostics.
        let old_code = existing.zepp_type.unwrap_or(i32::MAX);
        let new_code = incoming.zepp_type.unwrap_or(i32::MAX);
        if new_code < old_code {
            StoredWorkoutType {
                normalized_type: incoming.normalized_type.clone(),
                type_source: incoming.type_source.clone(),
                user_override: existing.user_override.clone(),
                zepp_type: incoming.zepp_type,
                conflict: existing.conflict.clone(),
            }
        } else {
            existing.clone()
        }
    } else if incoming.normalized_type < existing.normalized_type {
        StoredWorkoutType {
            normalized_type: incoming.normalized_type.clone(),
            type_source: incoming.type_source.clone(),
            user_override: existing.user_override.clone(),
            zepp_type: incoming.zepp_type,
            conflict: existing.conflict.clone(),
        }
    } else {
        existing.clone()
    };

    if new_rank == 3 && old_rank == 3 && incoming.zepp_type != existing.zepp_type {
        let mut codes = BTreeSet::new();
        if let Some(raw) = existing.conflict.as_deref() {
            codes.extend(raw.split(',').filter_map(|value| value.parse::<i32>().ok()));
        }
        if let Some(code) = existing.zepp_type {
            codes.insert(code);
        }
        if let Some(code) = incoming.zepp_type {
            codes.insert(code);
        }
        merged.conflict = Some(
            codes
                .into_iter()
                .map(|code| code.to_string())
                .collect::<Vec<_>>()
                .join(","),
        );
    }
    merged.user_override = existing
        .user_override
        .or_else(|| incoming.user_override.clone());
    merged
}

/// The daily metrics the body/training screens can chart, and the unit each
/// carries. Charting is limited to this list so a caller cannot ask for an
/// arbitrary metric name and have the UI invent a label for it.
///
/// `metric_samples` metrics are aggregated to one point per local day; the
/// spread of that day's samples becomes `min` / `max`, which is real rather
/// than derived.
const SERIES_METRICS: [(&str, MetricSource, &str); 41] = [
    ("readiness", MetricSource::Daily(None), "score"),
    ("physical_readiness", MetricSource::Daily(None), "score"),
    ("mental_readiness", MetricSource::Daily(None), "score"),
    ("hybrid_charge", MetricSource::Daily(None), "score"),
    ("physical_charge", MetricSource::Daily(None), "score"),
    ("mental_charge", MetricSource::Daily(None), "score"),
    (
        "stress",
        MetricSource::Daily(Some(("stress_min", "stress_max"))),
        "score",
    ),
    (
        "respiratory_rate",
        MetricSource::Daily(Some(("respiratory_rate_min", "respiratory_rate_max"))),
        "次/分",
    ),
    ("resting_hr", MetricSource::Daily(None), "bpm"),
    // 首页那四张卡要有能点进去的二级页，日活动这几项就得能按天成序列。
    // 它们本来就在 daily_metrics 里，这里只是允许查询它们。
    ("steps", MetricSource::Daily(None), "步"),
    ("distance", MetricSource::Daily(None), "米"),
    ("active_calories", MetricSource::Daily(None), "千卡"),
    ("active_minutes", MetricSource::Daily(None), "分钟"),
    ("spo2_odi", MetricSource::Daily(None), "events/h"),
    ("spo2_night_score", MetricSource::Daily(None), "score"),
    ("spo2_measured_minutes", MetricSource::Daily(None), "分钟"),
    ("training_load", MetricSource::Daily(None), "load"),
    ("vo2max", MetricSource::Daily(None), "ml/kg/min"),
    ("lactate_threshold_hr", MetricSource::Daily(None), "bpm"),
    (
        "lactate_threshold_pace",
        MetricSource::Daily(None),
        "秒/公里",
    ),
    ("pai_daily", MetricSource::Daily(None), "pai"),
    ("pai_low_zone", MetricSource::Daily(None), "pai"),
    ("pai_medium_zone", MetricSource::Daily(None), "pai"),
    ("pai_high_zone", MetricSource::Daily(None), "pai"),
    // v20 取回的那批。全部落在 `daily_metrics` 里，这里只是允许按天查询。
    ("pai_total", MetricSource::Daily(None), "pai"),
    ("pai_low_zone_minutes", MetricSource::Daily(None), "分钟"),
    ("pai_medium_zone_minutes", MetricSource::Daily(None), "分钟"),
    ("pai_high_zone_minutes", MetricSource::Daily(None), "分钟"),
    ("pai_low_zone_lower_hr", MetricSource::Daily(None), "bpm"),
    ("pai_medium_zone_lower_hr", MetricSource::Daily(None), "bpm"),
    ("pai_high_zone_lower_hr", MetricSource::Daily(None), "bpm"),
    ("sleep_hrv", MetricSource::Daily(None), "ms"),
    ("sleep_rhr", MetricSource::Daily(None), "bpm"),
    ("hrv_baseline", MetricSource::Daily(None), "ms"),
    ("rhr_baseline", MetricSource::Daily(None), "bpm"),
    ("ahi_baseline", MetricSource::Daily(None), "events/h"),
    ("step_goal", MetricSource::Daily(None), "步"),
    ("calorie_goal", MetricSource::Daily(None), "千卡"),
    ("active_minutes_goal", MetricSource::Daily(None), "分钟"),
    ("hrv", MetricSource::Samples, "ms"),
    ("hrv_rmssd", MetricSource::Samples, "ms"),
];

/// Sample-backed metrics that are not in `SERIES_METRICS` above because they
/// share a name with a daily metric; charted from `metric_samples`.
const SAMPLE_ONLY_SERIES_METRICS: [(&str, &str); 1] = [("spo2", "%")];

#[derive(Debug, Clone, Copy)]
enum MetricSource {
    /// One row per day in `daily_metrics`, optionally with companion metrics
    /// carrying that day's measured minimum and maximum.
    Daily(Option<(&'static str, &'static str)>),
    /// Individual readings in `metric_samples`, folded to one point per day.
    Samples,
}

/// The three ways Zepp itself splits heart rate into zones.
///
/// The percentages are not invented: the workout summary carries the device's
/// own boundaries (`heart_range`) alongside `heartrate_setting_type`, and for
/// this account's threshold model those boundaries are
/// 113/141/154/162/173/190 against a lactate threshold of 175 bpm — exactly
/// floor(175 x 65/81/88/93/99/109%). The other two models use Zepp's published
/// splits for the same five zones.
/// `(zone, label, low percent, high percent)`.
type ZoneBandSpec = (i32, &'static str, f64, f64);
/// `(id, label, formula, required basis kinds, five bands)`.
type ZoneModelSpec = (
    &'static str,
    &'static str,
    &'static str,
    &'static [&'static str],
    [ZoneBandSpec; 5],
);

const ZONE_MODELS: [ZoneModelSpec; 3] = [
    (
        "max_hr",
        "最大心率区间",
        "区间下界 = 最大心率 x 百分比",
        &["max_hr"],
        [
            (1, "热身", 0.50, 0.60),
            (2, "燃脂", 0.60, 0.70),
            (3, "有氧耐力", 0.70, 0.80),
            (4, "无氧耐力", 0.80, 0.90),
            (5, "极限", 0.90, 1.00),
        ],
    ),
    (
        "hr_reserve",
        "储备心率区间",
        "区间下界 = 静息心率 + (最大心率 - 静息心率) x 百分比",
        &["max_hr", "resting_hr"],
        [
            (1, "热身", 0.50, 0.60),
            (2, "燃脂", 0.60, 0.70),
            (3, "有氧耐力", 0.70, 0.80),
            (4, "无氧耐力", 0.80, 0.90),
            (5, "极限", 0.90, 1.00),
        ],
    ),
    (
        "lactate_threshold",
        "乳酸阈值区间",
        "区间下界 = 乳酸阈值心率 x 百分比",
        &["threshold_hr"],
        [
            (1, "轻松", 0.65, 0.81),
            (2, "耐力", 0.81, 0.88),
            (3, "节奏", 0.88, 0.93),
            (4, "阈值", 0.93, 0.99),
            (5, "无氧", 0.99, 1.09),
        ],
    ),
];

/// Metrics dense enough that a month of them dwarfs everything else in an
/// export. In `Summary` detail these collapse to one row per hour; sparse
/// streams such as HRV keep their exact sample times, which is the whole point
/// of measuring them.
const HOURLY_AGGREGATED_METRICS: [&str; 3] = ["heart_rate", "spo2", "stress"];

/// Export types whose raw payloads are fetched but whose field-by-field
/// normalization has not been verified against a real response yet.
///
/// These need their own status. Reporting `empty_in_range` would say "the
/// stream is wired, you simply have no data", and for these that is false —
/// the data is on disk as a retained raw response, only the parse is pending.
/// Each entry maps an export type to the `wellness` source-key labels that
/// carry its raw payloads.
const RAW_PENDING_STREAMS: [(&str, &[&str]); 6] = [
    ("spo2", &["spo2", "spo2_auto", "spo2_odi"]),
    ("stress", &["stress"]),
    ("respiratory_rate", &["respiratory_rate"]),
    ("hrv_rmssd", &["hrv_rmssd"]),
    ("pai", &["pai"]),
    ("lactate_threshold", &["lactate_threshold"]),
];

#[derive(Debug, Clone, Default)]
struct ExportDeviceProfile {
    model: Option<String>,
    kind: Option<String>,
}

/// Per-export device aliasing. Labels are positional (`device_1`, `device_2`)
/// and carry no identifying information, so they survive the AI-handoff
/// redaction pass that strips serials and device ids.
#[derive(Debug, Default)]
struct ExportDevices {
    label_by_alias: BTreeMap<String, String>,
    profiles: BTreeMap<String, ExportDeviceProfile>,
}

impl ExportDevices {
    fn label(&self, device_id: Option<&str>) -> Option<String> {
        device_id.and_then(|alias| self.label_by_alias.get(alias).cloned())
    }
}

/// One hour of a dense metric, reduced to the shape a reader can actually use.
#[derive(Debug)]
struct HourBucket {
    selected_type: String,
    unit: String,
    source_scope: String,
    device_label: Option<String>,
    min: f64,
    max: f64,
    sum: f64,
    count: usize,
}

impl HourBucket {
    fn new(
        selected_type: String,
        unit: String,
        source_scope: String,
        device_label: Option<String>,
    ) -> Self {
        Self {
            selected_type,
            unit,
            source_scope,
            device_label,
            min: f64::INFINITY,
            max: f64::NEG_INFINITY,
            sum: 0.0,
            count: 0,
        }
    }

    fn push(&mut self, value: f64) {
        self.min = self.min.min(value);
        self.max = self.max.max(value);
        self.sum += value;
        self.count += 1;
    }

    fn render(&self, metric: &str, hour: &str) -> serde_json::Value {
        let average = if self.count == 0 {
            None
        } else {
            Some((self.sum / self.count as f64 * 10.0).round() / 10.0)
        };
        serde_json::json!({
            "metric": metric,
            "hour": hour,
            "min": self.count.gt(&0).then_some(self.min),
            "avg": average,
            "max": self.count.gt(&0).then_some(self.max),
            "samples": self.count,
            "unit": self.unit,
            "source_scope": self.source_scope,
            "device_label": self.device_label,
        })
    }
}

/// All readings of one `(date, metric)` pair across sources.
///
/// Since account-level aggregates stopped being mislabelled as device data,
/// the same day's step count can arrive twice: once fused, once from the watch
/// that measured it. Picking one silently would hide a disagreement, so the
/// fused reading leads and anything that differs is kept beside it.
#[derive(Debug)]
struct DailyMetricGroup {
    date: String,
    metric: String,
    selected_type: String,
    readings: Vec<(f64, String, String, Option<String>)>,
}

impl DailyMetricGroup {
    fn new(date: String, metric: String, selected_type: &str) -> Self {
        Self {
            date,
            metric,
            selected_type: selected_type.to_string(),
            readings: Vec::new(),
        }
    }

    fn push(
        &mut self,
        value: f64,
        unit: String,
        source_scope: String,
        device_label: Option<String>,
    ) {
        self.readings
            .push((value, unit, source_scope, device_label));
    }

    fn render(&self) -> serde_json::Value {
        // user_fused is the account's own reconciliation of its devices, so it
        // leads when present; otherwise the first reading in query order does.
        let primary_index = self
            .readings
            .iter()
            .position(|(_, _, scope, _)| scope == "user_fused")
            .unwrap_or(0);
        let Some((value, unit, source_scope, device_label)) = self.readings.get(primary_index)
        else {
            return serde_json::Value::Null;
        };
        let alternates = self
            .readings
            .iter()
            .enumerate()
            .filter(|(index, (other, _, _, _))| {
                *index != primary_index && (other - value).abs() > f64::EPSILON
            })
            .map(|(_, (other, _, scope, label))| {
                serde_json::json!({
                    "value": other,
                    "source_scope": scope,
                    "device_label": label,
                })
            })
            .collect::<Vec<_>>();
        let mut record = serde_json::json!({
            "date": self.date,
            "metric": self.metric,
            "value": value,
            "unit": unit,
            "source_scope": source_scope,
            "device_label": device_label,
        });
        if !alternates.is_empty() {
            if let Some(object) = record.as_object_mut() {
                object.insert("alternates".into(), serde_json::Value::Array(alternates));
            }
        }
        record
    }
}

/// Where a capability's evidence lives, so the overview can count it without
/// a network request.
enum CapabilityEvidence {
    /// Distinct days in `daily_metrics` whose metric matches a prefix.
    DailyPrefix(&'static str),
    /// Rows in `metric_samples` for one metric name.
    Samples(&'static str),
    /// Rows in a table with a timestamp column.
    Table(&'static str, &'static str),
}

/// The capability list, in display order.
///
/// Nine of these are answered entirely from stored data — the strongest
/// evidence available, since "you have 32 days of stress readings" beats any
/// probe. Only the three with no local trace need a request, and those are the
/// ones where silence is genuinely ambiguous.
const CAPABILITY_ROWS: [(&str, CapabilityEvidence, i64); 17] = [
    ("heart_rate", CapabilityEvidence::Samples("heart_rate"), 30),
    (
        "sleep",
        CapabilityEvidence::Table("sleep_sessions", "start_time"),
        30,
    ),
    (
        "workouts",
        CapabilityEvidence::Table("workouts", "start_time"),
        90,
    ),
    ("steps", CapabilityEvidence::DailyPrefix("steps"), 30),
    (
        "daily_activity",
        CapabilityEvidence::DailyPrefix("distance"),
        30,
    ),
    ("stress", CapabilityEvidence::DailyPrefix("stress"), 30),
    ("spo2", CapabilityEvidence::DailyPrefix("spo2"), 30),
    (
        "respiratory_rate",
        CapabilityEvidence::DailyPrefix("respiratory"),
        30,
    ),
    ("hrv", CapabilityEvidence::Samples("hrv"), 30),
    ("hrv_rmssd", CapabilityEvidence::Samples("hrv_rmssd"), 30),
    ("recovery", CapabilityEvidence::DailyPrefix("readiness"), 30),
    (
        "training_load",
        CapabilityEvidence::DailyPrefix("training_load"),
        30,
    ),
    ("vo2max", CapabilityEvidence::DailyPrefix("vo2max"), 365),
    (
        "lactate_threshold",
        CapabilityEvidence::DailyPrefix("lactate_threshold"),
        365,
    ),
    ("pai", CapabilityEvidence::DailyPrefix("pai"), 30),
    // 体重不再是「只能靠探针」的一条。它现在真的入库，所以证据就是库里的
    // 样本本身——而这正是四个人报的那件事的终点：以前这一行永远显示探针
    // 的结论「最近 365 天没有测量记录」，因为探针打的是一个对谁都空的面。
    ("weight", CapabilityEvidence::Samples("weight"), 365),
    // 饮食记录同理。窗口给 365 天：手动记录是间断的，一周没记不说明这个
    // 账号没有这个功能。
    ("food", CapabilityEvidence::DailyPrefix("intake_"), 365),
];

/// The metric names one weigh-in produces.
///
/// Exports select by *type* (`--types weight`) while `metric_samples` stores by
/// *metric*, and unlike heart rate the two do not share a name — a weigh-in
/// yields eleven differently-named rows. Kept in step with `BODY_METRICS` in
/// the normalizer: a name added there and forgotten here is written to the
/// database and then silently missing from every export.
pub const BODY_COMPOSITION_METRICS: [&str; 11] = [
    "weight",
    "bmi",
    "height",
    "body_fat_rate",
    "body_water_rate",
    "muscle_mass",
    "bone_mass",
    "protein_rate",
    "visceral_fat",
    "bmr",
    "body_balance_score",
];

/// Streams with no local trace at all. Only these cost a request.
///
/// `weight` 和 `food` 都已经不在里面了：两条现在都真的入库，证据是库里的行
/// 而不是一句探针结论。留下的是仍然只能靠探针回答的那两条。
pub const PROBE_ONLY_CAPABILITIES: [&str; 2] = ["blood_pressure", "emotion"];

/// 探测覆盖多久。和探测本身用的范围一致，界面拿它写「过去 N 天没有测量记录」。
const PROBE_WINDOW_DAYS: i64 = 365;

const CAPABILITY_PROBE_RESULT_KEY: &str = "capability_probe_result";
const CAPABILITY_PROBE_AT_KEY: &str = "capability_probe_at";

impl Database {
    /// Build the capability overview: read what the library already proves,
    /// then fold in the stored result of the last probe for the rest.
    pub fn capability_overview(&self) -> Result<CapabilityOverview> {
        let mut items = Vec::new();
        for (stream, evidence, window_days) in CAPABILITY_ROWS {
            let (records, latest, unit) = match evidence {
                CapabilityEvidence::DailyPrefix(prefix) => {
                    let pattern = format!("{prefix}%");
                    let row = self.conn.query_row(
                        "SELECT COUNT(DISTINCT date), MAX(date) FROM daily_metrics
                         WHERE metric LIKE ?1 AND date >= date('now', ?2)",
                        params![pattern, format!("-{window_days} day")],
                        |row| Ok((row.get::<_, i64>(0)?, row.get::<_, Option<String>>(1)?)),
                    )?;
                    (row.0, row.1, ("天", "days"))
                }
                CapabilityEvidence::Samples(metric) => {
                    let row = self.conn.query_row(
                        "SELECT COUNT(*), MAX(date(timestamp)) FROM metric_samples
                         WHERE metric = ?1 AND timestamp >= datetime('now', ?2)",
                        params![metric, format!("-{window_days} day")],
                        |row| Ok((row.get::<_, i64>(0)?, row.get::<_, Option<String>>(1)?)),
                    )?;
                    (row.0, row.1, ("条", "records"))
                }
                CapabilityEvidence::Table(table, column) => {
                    let sql = format!(
                        "SELECT COUNT(*), MAX(date({column})) FROM {table}
                         WHERE {column} >= datetime('now', ?1)"
                    );
                    let row = self.conn.query_row(
                        &sql,
                        params![format!("-{window_days} day")],
                        |row| Ok((row.get::<_, i64>(0)?, row.get::<_, Option<String>>(1)?)),
                    )?;
                    (row.0, row.1, ("条", "records"))
                }
            };
            let (unit_label, unit_code) = unit;
            items.push(CapabilityItem {
                stream: stream.to_string(),
                status: if records > 0 {
                    "available"
                } else {
                    "no_records"
                }
                .to_string(),
                records,
                records_unit: unit_label.to_string(),
                records_unit_code: unit_code.to_string(),
                window_days,
                latest_date: latest,
                note: (records == 0).then(|| format!("最近 {window_days} 天没有记录")),
                source: "derived".to_string(),
                // 这些行的证据本来就是库里的数据，所以按定义已收录。
                ingested: true,
            });
        }

        // Streams that leave no local trace: report the last probe, or say
        // plainly that they have not been checked yet.
        let probed: BTreeMap<String, CapabilityProbe> = self
            .get_app_meta(CAPABILITY_PROBE_RESULT_KEY)?
            .and_then(|raw| serde_json::from_str::<Vec<CapabilityProbe>>(&raw).ok())
            .unwrap_or_default()
            .into_iter()
            .map(|probe| (probe.stream.clone(), probe))
            .collect();
        for stream in PROBE_ONLY_CAPABILITIES {
            let item = match probed.get(stream) {
                Some(probe) if probe.status == "available" => CapabilityItem {
                    stream: stream.to_string(),
                    status: "available".to_string(),
                    records: probe.records as i64,
                    records_unit: "条".to_string(),
                    records_unit_code: "records".to_string(),
                    window_days: PROBE_WINDOW_DAYS,
                    latest_date: probe.latest_date.clone(),
                    // 说清楚这是云端的数量，不是本机的。
                    note: Some(
                        "云端有记录，但 ZeppBridge 还没有收录这条流：缺少可核对的报文样本，贸然归一化只会产出没人能验证的数字。"
                            .to_string(),
                    ),
                    source: "probed".to_string(),
                    ingested: false,
                },
                // Only an outright rejection licenses "your device does not
                // provide this"; an empty answer does not, because this API
                // answers that way for names that cannot exist.
                Some(probe) if probe.status == "unavailable" => CapabilityItem {
                    stream: stream.to_string(),
                    status: "unsupported".to_string(),
                    records: 0,
                    records_unit: "条".to_string(),
                    records_unit_code: "records".to_string(),
                    window_days: PROBE_WINDOW_DAYS,
                    latest_date: None,
                    note: Some("你的账号或设备不提供这项数据".to_string()),
                    source: "probed".to_string(),
                    ingested: false,
                },
                Some(_) => CapabilityItem {
                    stream: stream.to_string(),
                    status: "no_records".to_string(),
                    records: 0,
                    records_unit: "条".to_string(),
                    records_unit_code: "records".to_string(),
                    window_days: PROBE_WINDOW_DAYS,
                    latest_date: None,
                    note: Some("过去一年没有测量记录".to_string()),
                    source: "probed".to_string(),
                    ingested: false,
                },
                None => CapabilityItem {
                    stream: stream.to_string(),
                    status: "unknown".to_string(),
                    records: 0,
                    records_unit: "条".to_string(),
                    records_unit_code: "records".to_string(),
                    window_days: PROBE_WINDOW_DAYS,
                    latest_date: None,
                    note: Some("尚未检测".to_string()),
                    source: "probed".to_string(),
                    ingested: false,
                },
            };
            items.push(item);
        }

        Ok(CapabilityOverview {
            items,
            probed_at: self.get_app_meta(CAPABILITY_PROBE_AT_KEY)?,
        })
    }

    pub fn save_capability_probe(&self, probes: &[CapabilityProbe]) -> Result<()> {
        let encoded = serde_json::to_string(probes)
            .map_err(|error| ZeppBridgeError::ParseError(error.to_string()))?;
        self.set_app_meta(CAPABILITY_PROBE_RESULT_KEY, &encoded)?;
        self.set_app_meta(CAPABILITY_PROBE_AT_KEY, &Utc::now().to_rfc3339())
    }

    /// Whether the request-only streams are due a re-check.
    ///
    /// A first answer is not a permanent one: someone may start measuring
    /// blood pressure, or connect a scale, long after install.
    pub fn capability_probe_is_stale(&self, max_age_days: i64) -> Result<bool> {
        let Some(raw) = self.get_app_meta(CAPABILITY_PROBE_AT_KEY)? else {
            return Ok(true);
        };
        let Ok(probed_at) = DateTime::parse_from_rfc3339(&raw) else {
            return Ok(true);
        };
        Ok((Utc::now() - probed_at.with_timezone(&Utc)).num_days() >= max_age_days)
    }
}

#[derive(Debug, Clone, Default)]
pub struct NormalizationCounts {
    pub primary_records: i64,
    pub band_heart_rate_records: i64,
    pub supplemental_daily_records: i64,
}

/// 这个库欠着的一次重放：从哪一版升到哪一版、要过几条报文。
///
/// 存在的理由是「先说清楚再做」。重放是分钟级的动作，而 `status` 这种命令
/// 必须秒回，所以计算计划（只读、两条 SELECT）和执行计划必须能分开调用：
/// 短命令拿它去说一句「你的历史还停在旧解析器上」，`reprocess` 拿它去干活。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ReplayPlan {
    /// 库里派生数据是哪一版解析器产出的。`None` = 从没重放过。
    pub stored_revision: Option<String>,
    /// 这个程序会把它升到哪一版。
    pub target_revision: String,
    /// 要重放的流。空 = 全部流。
    pub streams: Vec<String>,
    /// 这次重放要过一遍的原始报文条数。0 = 库是空的，重放是瞬间的事。
    pub raw_records: i64,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct StreamFreshness {
    pub last_cloud_sync_at: Option<String>,
    pub newest_sample_at: Option<String>,
}

/// 本机实际有数据的那段日子。
///
/// 存在的理由：界面上到处都能选「6 个月」，但那些选择器读的都是本机库。
/// 库里只有 30 天时，选 6 个月只会把坐标轴拉长，前面五个月是空的——而在此之前
/// 没有任何一处告诉用户这件事，于是「我选了 6 个月却只看到 30 天」被当成 bug
/// 报了上来。它不是 bug，是我们没说。
#[derive(Debug, Clone, Default, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct LocalCoverage {
    /// 最早一天（`YYYY-MM-DD`）。库是空的时候为 `None`。
    pub earliest_day: Option<String>,
    /// 最晚一天（`YYYY-MM-DD`）。
    pub latest_day: Option<String>,
    /// `earliest_day` 到今天的天数。用来和「你选的范围」直接比较。
    pub covered_days: i64,
}

/// The IPC structs are camelCase for the frontend, but an export file is
/// snake_case throughout. Rendering these two shapes by hand keeps one file
/// from carrying both conventions.
fn basis_json(basis: &HeartRateBasis) -> serde_json::Value {
    serde_json::json!({
        "id": basis.id,
        "kind": basis.kind,
        "label": basis.label,
        "value": basis.value,
        "unit": basis.unit,
        "source": basis.source,
        "measured_at": basis.measured_at,
        "note": basis.note,
    })
}

fn zone_json(zone: &HeartRateZoneRow) -> serde_json::Value {
    serde_json::json!({
        "zone": zone.zone,
        "label": zone.label,
        "min_bpm": zone.min_bpm,
        "max_bpm": zone.max_bpm,
        "seconds": zone.seconds,
    })
}

/// Turn one model plus its chosen bases into five zones and the time spent in
/// each.
///
/// Boundaries are floored, matching the device: a lactate threshold of 175 bpm
/// produces 113/141/154/162/173/190 on the watch, and 175 x 0.65 = 113.75 only
/// lands on 113 by flooring.
fn zone_report(
    model: &HeartRateZoneModel,
    used: Vec<HeartRateBasis>,
    histogram: &BTreeMap<i32, i64>,
    window_days: i64,
) -> HeartRateZoneReport {
    let value_of = |kind: &str| -> f64 {
        used.iter()
            .find(|basis| basis.kind == kind)
            .map(|basis| basis.value)
            .unwrap_or_default()
    };
    let boundary = |percent: f64| -> i32 {
        let raw = match model.id.as_str() {
            "hr_reserve" => {
                let max = value_of("max_hr");
                let rest = value_of("resting_hr");
                rest + (max - rest) * percent
            }
            "lactate_threshold" => value_of("threshold_hr") * percent,
            _ => value_of("max_hr") * percent,
        };
        raw.floor() as i32
    };

    let zones = model
        .bands
        .iter()
        .map(|band| {
            let low = boundary(band.low_percent);
            let high = boundary(band.high_percent);
            HeartRateZoneRow {
                zone: band.zone,
                label: band.label.clone(),
                min_bpm: low,
                max_bpm: (high - 1).max(low),
                seconds: histogram.range(low..high).map(|(_, count)| *count).sum(),
            }
        })
        .collect::<Vec<_>>();

    let floor_bpm = zones.first().map(|zone| zone.min_bpm).unwrap_or_default();
    let ceiling_bpm = zones
        .last()
        .map(|zone| zone.max_bpm + 1)
        .unwrap_or_default();
    HeartRateZoneReport {
        model: model.id.clone(),
        model_label: model.label.clone(),
        formula: model.formula.clone(),
        bases: used,
        below_zone_1_seconds: histogram.range(..floor_bpm).map(|(_, count)| *count).sum(),
        above_zone_5_seconds: histogram
            .range(ceiling_bpm..)
            .map(|(_, count)| *count)
            .sum(),
        total_seconds: histogram.values().sum(),
        zones,
        window_days,
        source: "workout_samples".into(),
    }
}

/// One decimal place, which is as much precision as any of these sources
/// actually carries.
fn round1(value: f64) -> f64 {
    (value * 10.0).round() / 10.0
}

fn average_finite(values: impl Iterator<Item = f64>) -> Option<f64> {
    let values: Vec<f64> = values.filter(|value| value.is_finite()).collect();
    if values.is_empty() {
        None
    } else {
        Some(values.iter().sum::<f64>() / values.len() as f64)
    }
}

/// Zepp detail payloads encode speed as metres per second and the companion
/// `pace` field as its reciprocal (seconds per metre).  The frontend contract
/// uses the conventional running unit minutes per kilometre.
fn pace_minutes_per_kilometre(pace: Option<f64>, speed: Option<f64>) -> Option<f64> {
    let from_speed = speed
        .filter(|value| value.is_finite() && *value > 0.0)
        .map(|value| 1_000.0 / (value * 60.0));
    let converted = from_speed.or_else(|| {
        pace.filter(|value| value.is_finite() && *value > 0.0)
            .map(|value| value * 1_000.0 / 60.0)
    });
    converted.filter(|value| *value >= 1.0 && *value < 60.0)
}

/// Drop equivalent-pace readings that describe standing still.
///
/// The device keeps emitting `equivPace` while a runner is stopped, which
/// produces values like 51604 s/km — fourteen hours per kilometre. Zepp's own
/// `avgEquivPace` excludes them by being distance-weighted, and the stored
/// column keeps exactly what the device sent; the filter belongs on the read
/// path, the same place `pace` is turned into minutes per kilometre. The
/// window matches that one: 1:00 to 60:00 per kilometre.
fn plausible_equivalent_pace(seconds: Option<f64>) -> Option<f64> {
    seconds.filter(|value| value.is_finite() && (60.0..3_600.0).contains(value))
}

pub fn is_corrupt_error(error: &ZeppBridgeError) -> bool {
    match error {
        ZeppBridgeError::DatabaseError(inner) => is_corrupt_sqlite(inner),
        other => looks_corrupt(&other.to_string()),
    }
}

fn is_corrupt_sqlite(error: &rusqlite::Error) -> bool {
    match error {
        rusqlite::Error::SqliteFailure(code, message) => {
            matches!(
                code.code,
                rusqlite::ErrorCode::DatabaseCorrupt | rusqlite::ErrorCode::NotADatabase
            ) || message.as_deref().is_some_and(looks_corrupt)
        }
        other => looks_corrupt(&other.to_string()),
    }
}

fn looks_corrupt(text: &str) -> bool {
    let lower = text.to_ascii_lowercase();
    lower.contains("malformed")
        || lower.contains("not a database")
        || lower.contains("database disk image")
        || lower.contains("file is not a database")
}

/// If the SQLite header claims more pages than the file actually has, rewrite
/// the page count. This is the usual leftover of a force-killed WAL checkpoint
/// or index rebuild.
fn salvage_truncated_page_count(path: &Path) -> std::io::Result<bool> {
    use std::fs::OpenOptions;
    use std::io::{Read, Seek, SeekFrom, Write};

    let mut file = OpenOptions::new().read(true).write(true).open(path)?;
    let file_len = file.metadata()?.len();
    let mut header = [0u8; 100];
    if file.read(&mut header)? < 100 {
        return Ok(false);
    }
    if &header[0..16] != b"SQLite format 3\0" {
        return Ok(false);
    }
    let mut page_size = u16::from_be_bytes([header[16], header[17]]) as u64;
    if page_size == 1 {
        page_size = 65_536;
    }
    if page_size == 0 || file_len % page_size != 0 {
        return Ok(false);
    }
    let actual_pages = file_len / page_size;
    let claimed_pages = u32::from_be_bytes([header[28], header[29], header[30], header[31]]) as u64;
    if claimed_pages <= actual_pages || actual_pages == 0 {
        return Ok(false);
    }
    file.seek(SeekFrom::Start(28))?;
    file.write_all(&(u32::try_from(actual_pages).unwrap_or(u32::MAX)).to_be_bytes())?;
    file.flush()?;
    Ok(true)
}

fn workout_series_summary(samples: &[WorkoutSeriesSample]) -> WorkoutSeriesSummary {
    let average_pace = average_finite(
        samples
            .iter()
            .filter_map(|sample| sample.pace)
            .filter(|value| *value > 0.0 && *value < 60.0),
    );
    let cadences: Vec<f64> = samples
        .iter()
        .filter_map(|sample| sample.cadence)
        .filter(|value| value.is_finite() && *value > 0.0 && *value < 300.0)
        .collect();
    let average_cadence = average_finite(cadences.iter().copied());
    let max_cadence = cadences.iter().copied().reduce(f64::max);
    let average_stride_cm = average_finite(
        samples
            .iter()
            .filter_map(|sample| sample.stride_cm)
            .filter(|value| *value > 0.0 && *value < 300.0),
    );

    // Ignore single-sample altitude jumps over 50 m. They are normally GPS or
    // pressure-sensor discontinuities and must not inflate cumulative climb.
    let altitudes: Vec<f64> = samples
        .iter()
        .filter_map(|sample| sample.altitude_m)
        .filter(|value| value.is_finite() && (-500.0..=10_000.0).contains(value))
        .collect();
    let (elevation_gain_m, elevation_loss_m) = if altitudes.len() < 2 {
        (None, None)
    } else {
        let mut gain = 0.0;
        let mut loss = 0.0;
        for pair in altitudes.windows(2) {
            let delta = pair[1] - pair[0];
            if delta.abs() > 50.0 {
                continue;
            }
            if delta > 0.0 {
                gain += delta;
            } else {
                loss += -delta;
            }
        }
        (Some(gain), Some(loss))
    };

    let powers: Vec<f64> = samples
        .iter()
        .filter_map(|sample| sample.power_watts)
        .filter(|value| value.is_finite() && *value >= 0.0 && *value < 2_000.0)
        .collect();

    WorkoutSeriesSummary {
        average_pace,
        average_cadence,
        max_cadence,
        average_stride_cm,
        elevation_gain_m,
        elevation_loss_m,
        average_power_watts: average_finite(powers.iter().copied()),
        max_power_watts: powers.iter().copied().reduce(f64::max),
        average_ground_contact_ms: average_finite(
            samples
                .iter()
                .filter_map(|sample| sample.ground_contact_ms)
                .filter(|value| *value > 0.0 && *value < 2_000.0),
        ),
        average_vertical_oscillation_mm: average_finite(
            samples
                .iter()
                .filter_map(|sample| sample.vertical_oscillation_mm)
                .filter(|value| *value > 0.0 && *value < 1_000.0),
        ),
        average_vertical_ratio_pct: average_finite(
            samples
                .iter()
                .filter_map(|sample| sample.vertical_ratio_pct)
                .filter(|value| *value > 0.0 && *value < 100.0),
        ),
        // The best equivalent pace is the smallest number of seconds, so this
        // is a minimum even though it reads as "best".
        best_equivalent_pace_s_per_km: samples
            .iter()
            .filter_map(|sample| plausible_equivalent_pace(sample.equivalent_pace_s_per_km))
            .reduce(f64::min),
    }
}

impl Database {
    #[cfg(test)]
    pub fn new(db_path: PathBuf) -> Result<Self> {
        Self::open_migrated(&db_path)
    }

    /// Open the local library, repairing a truncated SQLite header when that is
    /// enough, or quarantining a still-unreadable file and starting empty.
    ///
    /// A malformed database must never fail process startup: Tauri treats a
    /// setup-hook error as a panic, which looks like a flash-crash from the
    /// desktop shortcut.
    pub fn open_resilient(db_path: PathBuf) -> Result<(Self, Option<String>)> {
        match Self::open_migrated(&db_path) {
            Ok(db) => Ok((db, None)),
            Err(error) if is_corrupt_error(&error) => {
                if salvage_truncated_page_count(&db_path).unwrap_or(false) {
                    match Self::open_migrated(&db_path) {
                        Ok(db) => {
                            return Ok((
                                db,
                                Some(
                                    "本地库文件被截断，已对齐页头。部分历史数据可能需要重新同步。"
                                        .into(),
                                ),
                            ));
                        }
                        Err(salvage_error) if is_corrupt_error(&salvage_error) => {}
                        Err(salvage_error) => return Err(salvage_error),
                    }
                }
                let quarantined = crate::paths::quarantine_sqlite_group(&db_path);
                let db = Self::open_migrated(&db_path)?;
                let warning = match quarantined {
                    Ok(dir) => format!(
                        "本地库已损坏，已隔离到 {} 并重建空库。请重新同步。",
                        dir.display()
                    ),
                    Err(_) => "本地库已损坏，已重建空库。请重新同步。".into(),
                };
                Ok((db, Some(warning)))
            }
            Err(error) => Err(error),
        }
    }

    /// 打开并迁移。失败就是失败——不做隔离重建。
    ///
    /// `open_resilient` 会在损坏时隔离旧库并重建一个空库，那是桌面应用
    /// 有界面能解释清楚时才该做的事。CLI 这类无交互进程必须拿到错误
    /// 并退出，而不是安静地把用户的库换成一个空的。
    pub fn open_migrated(db_path: &std::path::Path) -> Result<Self> {
        // 迁移前备份和 DDL 必须在同一把跨进程锁下完成：两个进程同时升级同一个
        // 库，是这套系统里最危险的组合。拿不到锁就等，等不到就报可恢复错误。
        let guard = match db_path.parent() {
            Some(data_dir) => write_lock::acquire_with_timeout(
                data_dir,
                write_lock::WritePurpose::Migration,
                std::time::Duration::from_secs(30),
            )
            .map(Some)
            .map_err(|error| ZeppBridgeError::ConfigError(error.to_string()))?,
            None => None,
        };
        Self::backup_before_schema_change(db_path)?;
        let conn = Connection::open(db_path)?;
        let db = Self::from_connection(conn);
        drop(guard);
        db
    }

    /// 在任何 DDL 之前给现有库留一份可校验的快照。
    ///
    /// 迁移只往前走，改坏了没有回头路。备份或校验失败时直接返回可恢复错误，
    /// 让用户看到「升级没有开始」，而不是让一次半成品迁移把库改成谁也认不出的
    /// 状态。全新的空库（`user_version = 0`）没有东西可丢，跳过。
    fn backup_before_schema_change(db_path: &std::path::Path) -> Result<()> {
        let Some(data_dir) = db_path.parent() else {
            return Ok(());
        };
        if !db_path.exists() {
            return Ok(());
        }
        let version = {
            let probe = Connection::open(db_path)?;
            probe
                .query_row("PRAGMA user_version", [], |row| row.get::<_, i64>(0))
                .unwrap_or(0)
        };
        if version == 0 || version >= CURRENT_SCHEMA_VERSION {
            return Ok(());
        }
        match backup::create_backup(data_dir, backup::BackupKind::PreMigration, APP_VERSION) {
            Ok(_) => {
                // 滚动清理只动自动生成的迁移备份，手动备份和标记保留的永远不碰。
                let _ = backup::prune_migration_backups(data_dir);
                Ok(())
            }
            Err(error) => Err(ZeppBridgeError::DataUnavailable(format!(
                "数据库需要升级到新版本，但升级前的自动备份没有成功，所以没有开始升级：{}。请确认数据文件夹所在磁盘还有空间后重试。",
                error.user_message()
            ))),
        }
    }

    /// Open a connection that assumes the schema was already migrated by the
    /// primary connection (`AppState::new`).  Sync workers use this so a
    /// long-running background sync never competes with command paths over
    /// DDL locks (SQLITE_BUSY on ALTER/CREATE INDEX while writing).
    pub fn open_without_migration(db_path: PathBuf) -> Result<Self> {
        let conn = Connection::open(db_path)?;
        conn.execute_batch(
            "PRAGMA foreign_keys = ON;
             PRAGMA busy_timeout = 30000;
             PRAGMA journal_mode = WAL;",
        )?;
        Ok(Self { conn })
    }

    /// Open a query-only connection.
    ///
    /// Read paths that must never write — the local REST API, the MCP server,
    /// `zeppbridge status` — use this so a bug in an adapter cannot mutate the
    /// user's library, and so they never contend for the write lock.
    /// `query_only` is belt-and-braces on top of the read-only open flag.
    /// 只读打开任意版本的库。
    ///
    /// 备份与恢复本身就要读别的版本的库——升级前的快照按定义是旧版本的，
    /// 恢复预览要读的也可能是。所以这一层只提供机制，不带版本判断。
    ///
    /// 回答用户查询的调用方请用 `open_read_only`。
    pub fn open_read_only_any_version(db_path: PathBuf) -> Result<Self> {
        let conn = Connection::open_with_flags(
            db_path,
            rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY | rusqlite::OpenFlags::SQLITE_OPEN_URI,
        )?;
        conn.execute_batch(
            "PRAGMA busy_timeout = 30000;
             PRAGMA query_only = ON;",
        )?;
        Ok(Self { conn })
    }

    /// 只读打开，并先确认 schema 版本对得上。
    ///
    /// 只读连接迁移不了，所以版本不匹配必须在这里变成一句能照做的话。
    /// 否则 CLI / MCP 会一路跑到某个查询上撞见「没有这张表」，
    /// 用户看到的是「数据库暂时不可用」——既不知道原因，也不知道该做什么。
    ///
    /// 这条版本判断是**产品策略**，不是打开文件的机制。把它写进机制里，
    /// 会连带挡住升级前的自动备份——那意味着谁也升级不了。
    pub fn open_read_only(db_path: PathBuf) -> Result<Self> {
        let db = Self::open_read_only_any_version(db_path)?;
        let conn = db.conn;
        let version: i64 = conn.query_row("PRAGMA user_version", [], |row| row.get(0))?;
        match version.cmp(&CURRENT_SCHEMA_VERSION) {
            std::cmp::Ordering::Equal => Ok(Self { conn }),
            std::cmp::Ordering::Less => Err(ZeppBridgeError::ConfigError(format!(
                "本机数据库还是 v{version}，这个程序需要 v{CURRENT_SCHEMA_VERSION}。只读连接无法升级——无头环境请跑一次 `zeppbridge-cli reprocess`，有桌面应用就启动一次（两条路都会在升级前自动生成备份），再重试。"
            ))),
            std::cmp::Ordering::Greater => Err(ZeppBridgeError::ConfigError(format!(
                "本机数据库是 v{version}，比这个程序（v{CURRENT_SCHEMA_VERSION}）新。请把命令行 / MCP 升级到与桌面应用相同的版本，不要用旧版去读新库。"
            ))),
        }
    }

    #[cfg(test)]
    pub fn in_memory() -> Result<Self> {
        Self::from_connection(Connection::open_in_memory()?)
    }

    fn from_connection(conn: Connection) -> Result<Self> {
        // These pragmas are set for every connection, including test databases.
        conn.execute_batch(
            "PRAGMA foreign_keys = ON;
             PRAGMA busy_timeout = 30000;
             PRAGMA journal_mode = WAL;",
        )?;
        let db = Self { conn };
        db.migrate()?;
        Ok(db)
    }

    fn ensure_cloud_sync_metadata(&self) -> Result<()> {
        if self.get_app_meta(LAST_CLOUD_SYNC_AT_KEY)?.is_some() {
            return Ok(());
        }
        let latest_fetch =
            self.conn
                .query_row("SELECT MAX(fetched_at) FROM raw_records", [], |row| {
                    row.get::<_, Option<String>>(0)
                });
        match latest_fetch {
            Ok(Some(timestamp)) => {
                self.set_app_meta(LAST_CLOUD_SYNC_AT_KEY, &timestamp)?;
                self.set_app_meta(LAST_CLOUD_SYNC_OUTCOME_KEY, "updated")?;
            }
            Ok(None) => {}
            Err(error) if is_corrupt_sqlite(&error) => {
                // A truncated library can still boot; the next cloud sync
                // rewrites this metadata.
            }
            Err(error) => return Err(error.into()),
        }
        Ok(())
    }

    pub(crate) fn set_app_meta(&self, key: &str, value: &str) -> Result<()> {
        self.conn.execute(
            "INSERT INTO app_meta(key, value, updated_at)
             VALUES(?1, ?2, ?3)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
            params![key, value, Utc::now().to_rfc3339()],
        )?;
        Ok(())
    }

    pub(crate) fn get_app_meta(&self, key: &str) -> Result<Option<String>> {
        self.conn
            .query_row("SELECT value FROM app_meta WHERE key = ?1", [key], |row| {
                row.get(0)
            })
            .optional()
            .map_err(Into::into)
    }

    pub fn cloud_sync_metadata(&self) -> Result<(Option<String>, Option<String>)> {
        Ok((
            self.get_app_meta(LAST_CLOUD_SYNC_AT_KEY)?,
            self.get_app_meta(LAST_CLOUD_SYNC_OUTCOME_KEY)?,
        ))
    }

    pub fn record_cloud_sync(&self, finished_at: &str, outcome: &str) -> Result<()> {
        self.set_app_meta(LAST_CLOUD_SYNC_AT_KEY, finished_at)?;
        self.set_app_meta(LAST_CLOUD_SYNC_OUTCOME_KEY, outcome)
    }

    pub fn user_prefs(&self) -> Result<UserPrefs> {
        Ok(UserPrefs {
            retention_days: self
                .read_pref_days(RETENTION_DAYS_KEY, UserPrefs::DEFAULT_RETENTION_DAYS)?,
            history_sync_days: self.read_history_days()?,
            archive_enabled: self.get_app_meta(ARCHIVE_ENABLED_KEY)?.as_deref() == Some("1"),
        })
    }

    fn read_history_days(&self) -> Result<i64> {
        match self.get_app_meta(HISTORY_SYNC_DAYS_KEY)? {
            Some(value) => Ok(value
                .parse::<i64>()
                .ok()
                .and_then(|days| UserPrefs::clamp_history_days(days).ok())
                .unwrap_or(UserPrefs::DEFAULT_HISTORY_SYNC_DAYS)),
            None => Ok(UserPrefs::DEFAULT_HISTORY_SYNC_DAYS),
        }
    }

    pub fn set_user_prefs(&self, prefs: &UserPrefs) -> Result<UserPrefs> {
        let retention_days =
            UserPrefs::clamp_days(prefs.retention_days).map_err(ZeppBridgeError::ConfigError)?;
        // 补拉范围和保留期各有各的上限：保留期决定本机留多久，补拉决定往回
        // 取多远。共用一个 365 天上限时，「把三年前的记录拿回来」根本没法表达。
        let history_sync_days = UserPrefs::clamp_history_days(prefs.history_sync_days)
            .map_err(ZeppBridgeError::ConfigError)?;
        self.set_app_meta(RETENTION_DAYS_KEY, &retention_days.to_string())?;
        self.set_app_meta(HISTORY_SYNC_DAYS_KEY, &history_sync_days.to_string())?;
        self.set_app_meta(
            ARCHIVE_ENABLED_KEY,
            if prefs.archive_enabled { "1" } else { "0" },
        )?;
        Ok(UserPrefs {
            retention_days,
            history_sync_days,
            archive_enabled: prefs.archive_enabled,
        })
    }

    fn read_pref_days(&self, key: &str, default: i64) -> Result<i64> {
        match self.get_app_meta(key)? {
            Some(value) => Ok(value
                .parse::<i64>()
                .ok()
                .and_then(|days| UserPrefs::clamp_days(days).ok())
                .unwrap_or(default)),
            None => Ok(default),
        }
    }

    /// 每条流在本机的实际占用速率。
    ///
    /// 用本机已有的原始报文长度除以**这些报文覆盖的日历跨度**，而不是一个
    /// 写死的常数：「再补三年要多大」只有用这个人自己的数据算才有意义。
    ///
    /// 分母刻意不是「有多少个不同的抓取日期」。抓取是按月批量做的，一条
    /// `daily_summary` 报文可能覆盖整整一个月，于是一年的数据只落在十几个
    /// 抓取日上——拿 19 去除 1.5 GB，会得出「每天 76 MB」这种荒唐结论，
    /// 再乘一年就是 27 GB，足够把人吓得不敢补拉。真正的问题是「每天历史
    /// 占多少」，分母就该是这些报文覆盖的天数。
    ///
    /// 跨度不足 `MIN_OBSERVED_DAYS` 天的流标 `measured: false`，宁可说不知道，
    /// 也不拿一个从几天样本外推出来的速率去乘三年。
    fn stream_storage_rates(&self, days: i64) -> Result<Vec<StreamStorageEstimate>> {
        let mut stmt = self.conn.prepare(
            // 占用要算**实际落盘**的那一份：压过的行按压缩后的字节数算，
            // 否则估算会按明文报价，用户看到的数字比真实占用大好几倍。
            "SELECT stream,
                    SUM(CASE
                          WHEN payload_zip IS NOT NULL AND LENGTH(payload_zip) > 0
                            THEN LENGTH(payload_zip)
                          ELSE LENGTH(CAST(payload AS BLOB))
                        END),
                    CAST(julianday(MAX(start_utc)) - julianday(MIN(start_utc)) AS INTEGER) + 1
             FROM raw_records
             GROUP BY stream",
        )?;
        let observed: std::collections::HashMap<String, (u64, i64)> = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    (
                        row.get::<_, i64>(1).unwrap_or(0).max(0) as u64,
                        row.get::<_, i64>(2).unwrap_or(0).max(0),
                    ),
                ))
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?
            .into_iter()
            .collect();

        Ok(coverage::BACKFILL_STREAMS
            .iter()
            .map(|stream| {
                let (bytes, observed_days) = observed.get(*stream).copied().unwrap_or((0, 0));
                let measured = observed_days >= MIN_OBSERVED_DAYS;
                let bytes_per_day = if measured {
                    bytes / observed_days.max(1) as u64
                } else {
                    0
                };
                StreamStorageEstimate {
                    stream: (*stream).to_string(),
                    observed_days,
                    observed_bytes: bytes,
                    bytes_per_day,
                    measured,
                    estimated_add_bytes: bytes_per_day.saturating_mul(days.max(0) as u64),
                }
            })
            .collect())
    }

    pub fn storage_estimate(
        &self,
        days: i64,
        data_dir: &std::path::Path,
    ) -> Result<StorageEstimate> {
        // 这里用补拉的取值范围（最长十年），而不是保留期的 1–365；
        // 「补三年要多大」是这个估算存在的主要原因。
        let days = UserPrefs::clamp_history_days(days).map_err(ZeppBridgeError::ConfigError)?;
        let database_bytes = std::fs::metadata(data_dir.join("zepp.db"))
            .map(|meta| meta.len())
            .unwrap_or(0);

        let streams = self.stream_storage_rates(days)?;
        let measured_bytes: u64 = streams
            .iter()
            .map(|stream| stream.estimated_add_bytes)
            .sum();
        let observed_bytes: u64 = streams.iter().map(|stream| stream.observed_bytes).sum();
        let any_measured = streams.iter().any(|stream| stream.measured);
        let all_measured = streams.iter().all(|stream| stream.measured);

        // 库比原始报文大：还有 canonical 行、索引和 WAL。用本机实测的比例
        // 放大，而不是再猜一个系数；比例只在合理区间内取用。
        let overhead = if observed_bytes > 0 && database_bytes > observed_bytes {
            ((database_bytes as f64) / (observed_bytes as f64)).clamp(1.0, 4.0)
        } else {
            1.0
        };
        let estimated_add_bytes = if any_measured {
            ((measured_bytes as f64) * overhead) as u64
        } else {
            (days as u64).saturating_mul(BYTES_PER_HISTORY_DAY)
        };

        let free_bytes = disk_free_bytes(data_dir).unwrap_or(0);
        // 留一点余量：刚好填满磁盘和放不下一样糟糕。
        let needed_bytes = estimated_add_bytes.saturating_add(SPACE_SAFETY_MARGIN_BYTES);
        let stop_reason = if free_bytes > 0 && needed_bytes > free_bytes {
            Some(format!(
                "这次补拉预计需要 {}（含安全余量），本盘只剩 {}，不会开始。请先腾出空间或缩短范围。",
                format_bytes(needed_bytes),
                format_bytes(free_bytes)
            ))
        } else {
            None
        };
        let stop_reason_code = stop_reason
            .as_ref()
            .map(|_| "ui.estimate.stop_no_space".to_string());

        let warn_tight_space =
            free_bytes < 1_073_741_824 || (free_bytes > 0 && estimated_add_bytes > free_bytes / 5);
        let allow_long_history = stop_reason.is_none()
            && !(free_bytes > 0 && free_bytes < 300 * 1024 * 1024 && days >= 90);
        // 码和中文原文一起给：界面按码排自己的句子（天数和字节它都有），
        // 取不到码才回落到这句中文。
        let (message_code, message) = if let Some(reason) = &stop_reason {
            ("ui.estimate.stop_no_space", reason.clone())
        } else if free_bytes == 0 {
            (
                "ui.estimate.disk_unknown",
                "未能读取磁盘剩余空间，补拉前请确认本机还有足够空间。".to_string(),
            )
        } else if !allow_long_history {
            (
                "ui.estimate.disk_too_small",
                "磁盘剩余不足 300 MB，不能补拉 90 天以上的历史。".to_string(),
            )
        } else if !any_measured {
            (
                "ui.estimate.builtin_guess",
                format!(
                    "本机样本还不够，用的是内置粗略估算：{} 天大约占用 {}，本盘剩余 {}。",
                    days,
                    format_bytes(estimated_add_bytes),
                    format_bytes(free_bytes)
                ),
            )
        } else if all_measured {
            (
                "ui.estimate.measured",
                format!(
                    "按本机已有数据的实际速率推算，{} 天大约占用 {}，本盘剩余 {}。",
                    days,
                    format_bytes(estimated_add_bytes),
                    format_bytes(free_bytes)
                ),
            )
        } else {
            (
                "ui.estimate.partial",
                format!(
                    "只按本机已有样本的那几条流推算，{} 天大约占用 {}（其余流样本不足，未计入），本盘剩余 {}。",
                    days,
                    format_bytes(estimated_add_bytes),
                    format_bytes(free_bytes)
                ),
            )
        };

        Ok(StorageEstimate {
            free_bytes,
            estimated_add_bytes,
            database_bytes,
            allow_long_history,
            warn_tight_space,
            message,
            message_code: message_code.to_string(),
            needed_bytes,
            requested_days: days,
            streams,
            measured: all_measured,
            stop_reason,
            stop_reason_code,
        })
    }

    pub fn heart_rate_series(&self, hours: i64) -> Result<Vec<HeartRatePoint>> {
        let hours = hours.clamp(1, 24 * 14);
        let cutoff = (Utc::now() - chrono::Duration::hours(hours)).to_rfc3339();
        // Two sources (band_data device rows, heartRate API user_fused
        // rows) can hold the same minute; collapse to one row per timestamp
        // preferring user_fused so charts never draw duplicate points.
        let mut stmt = self.conn.prepare(
            "SELECT m.timestamp, m.value
             FROM metric_samples m
             WHERE m.metric = 'heart_rate' AND m.timestamp >= ?1
               AND m.id = (
                   SELECT id FROM metric_samples
                   WHERE metric = 'heart_rate' AND timestamp = m.timestamp
                   ORDER BY CASE source_scope
                       WHEN 'user_fused' THEN 0
                       WHEN 'device' THEN 1
                       ELSE 2 END, id
                   LIMIT 1)
             ORDER BY m.timestamp ASC",
        )?;
        let rows = stmt.query_map([cutoff], |row| {
            Ok(HeartRatePoint {
                timestamp: row.get(0)?,
                value: row.get(1)?,
            })
        })?;
        rows.collect::<std::result::Result<Vec<_>, _>>()
            .map_err(Into::into)
    }

    /// 全天压力曲线：`metric_samples` 里的逐条读数，按时间排列。
    ///
    /// 和心率那条不同，这里不需要按来源去重——压力只有 `all_day_stress`
    /// 一个来源，同一时刻的重复读数只可能来自两块表，那时两条都该留着，
    /// 唯一索引里本来就带 `device_id`。
    ///
    /// 没有采样的时间段不补点。手表整夜没戴就是没数据，画成一条平的 0
    /// 会让人以为那几个小时特别放松。
    pub fn stress_series(&self, hours: i64) -> Result<Vec<StressPoint>> {
        let hours = hours.clamp(1, 24 * 14);
        let cutoff = (Utc::now() - chrono::Duration::hours(hours)).to_rfc3339();
        let mut stmt = self.conn.prepare(
            "SELECT timestamp, value FROM metric_samples
             WHERE metric = 'stress' AND timestamp >= ?1
             ORDER BY timestamp ASC",
        )?;
        let rows = stmt.query_map([cutoff], |row| {
            Ok(StressPoint {
                timestamp: row.get(0)?,
                value: row.get(1)?,
            })
        })?;
        rows.collect::<std::result::Result<Vec<_>, _>>()
            .map_err(Into::into)
    }

    pub fn training_load_series(&self, days: i64) -> Result<Vec<DailyPoint>> {
        let days = days.clamp(1, 365);
        let cutoff = (Utc::now() - chrono::Duration::days(days))
            .date_naive()
            .format("%Y-%m-%d")
            .to_string();
        let mut stmt = self.conn.prepare(
            "SELECT date, value FROM daily_metrics
             WHERE metric = 'training_load' AND date >= ?1
             ORDER BY date ASC",
        )?;
        let rows = stmt.query_map([cutoff], |row| {
            Ok(DailyPoint {
                date: row.get(0)?,
                value: row.get(1)?,
            })
        })?;
        rows.collect::<std::result::Result<Vec<_>, _>>()
            .map_err(Into::into)
    }

    pub fn stream_freshness(&self) -> Result<BTreeMap<String, StreamFreshness>> {
        let mut freshness = BTreeMap::<String, StreamFreshness>::new();
        let mut stmt = self.conn.prepare(
            "SELECT stream, MAX(fetched_at) FROM raw_records GROUP BY stream ORDER BY stream",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?))
        })?;
        for row in rows {
            let (stream, timestamp) = row?;
            freshness.entry(stream).or_default().last_cloud_sync_at = timestamp;
        }

        // Heart-rate can legitimately fall back to minute samples decoded from
        // band_data, so the sleep fetch is also a heart-rate cloud source.
        let sleep_fetch = freshness
            .get("sleep")
            .and_then(|value| value.last_cloud_sync_at.clone());
        if let Some(sleep_fetch) = sleep_fetch {
            let heart_rate = freshness.entry("heart_rate".into()).or_default();
            if heart_rate.last_cloud_sync_at.as_deref() < Some(sleep_fetch.as_str()) {
                heart_rate.last_cloud_sync_at = Some(sleep_fetch);
            }
        }

        for (stream, query) in [
            (
                "heart_rate",
                "SELECT MAX(timestamp) FROM metric_samples WHERE metric = 'heart_rate'",
            ),
            (
                "hrv",
                "SELECT MAX(timestamp) FROM metric_samples WHERE metric = 'hrv'",
            ),
            ("daily_summary", "SELECT MAX(date) FROM daily_metrics"),
            ("sleep", "SELECT MAX(end_time) FROM sleep_sessions"),
            ("workouts", "SELECT MAX(end_time) FROM workouts"),
        ] {
            let timestamp = self
                .conn
                .query_row(query, [], |row| row.get::<_, Option<String>>(0))?;
            freshness.entry(stream.into()).or_default().newest_sample_at = timestamp;
        }
        Ok(freshness)
    }

    /// 本机实际有数据的那段日子。
    ///
    /// 四张表各问一次最早/最晚，取并集：只看其中一张会在「有运动没有日概览」
    /// 这类账号上少报好几个月。返回的是**天**而不是时间戳，因为它要拿去和界面上
    /// 「最近 7 天 / 30 天 / 6 个月」这些以天为单位的选择直接比较。
    pub fn local_coverage(&self) -> Result<LocalCoverage> {
        let mut earliest: Option<String> = None;
        let mut latest: Option<String> = None;
        for query in [
            "SELECT MIN(date), MAX(date) FROM daily_metrics",
            "SELECT MIN(substr(timestamp, 1, 10)), MAX(substr(timestamp, 1, 10)) FROM metric_samples",
            "SELECT MIN(substr(start_time, 1, 10)), MAX(substr(end_time, 1, 10)) FROM sleep_sessions",
            "SELECT MIN(substr(start_time, 1, 10)), MAX(substr(end_time, 1, 10)) FROM workouts",
        ] {
            let (low, high) = self.conn.query_row(query, [], |row| {
                Ok((
                    row.get::<_, Option<String>>(0)?,
                    row.get::<_, Option<String>>(1)?,
                ))
            })?;
            if let Some(low) = low {
                if earliest.as_deref().is_none_or(|current| low.as_str() < current) {
                    earliest = Some(low);
                }
            }
            if let Some(high) = high {
                if latest.as_deref().is_none_or(|current| high.as_str() > current) {
                    latest = Some(high);
                }
            }
        }

        // 覆盖天数从最早那天数到**今天**，不是数到 `latest_day`：用户问的是
        // 「我能往回看多远」，而表没同步的那两天不该让答案变小。
        let covered_days = earliest
            .as_deref()
            .and_then(|day| NaiveDate::parse_from_str(day, "%Y-%m-%d").ok())
            .map(|day| (Local::now().date_naive() - day).num_days() + 1)
            .unwrap_or(0)
            .max(0);

        Ok(LocalCoverage {
            earliest_day: earliest,
            latest_day: latest,
            covered_days,
        })
    }

    pub fn newest_samples(&self) -> Result<BTreeMap<String, Option<String>>> {
        Ok(self
            .stream_freshness()?
            .into_iter()
            .map(|(stream, value)| (stream, value.newest_sample_at))
            .collect())
    }

    fn ensure_table_columns(&self, table: &str, columns: &[(&str, &str)]) -> Result<()> {
        let mut stmt = self.conn.prepare(&format!("PRAGMA table_info({table})"))?;
        let existing = stmt
            .query_map([], |row| row.get::<_, String>(1))?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        for (name, definition) in columns {
            if !existing.iter().any(|value| value == name) {
                self.conn.execute(
                    &format!("ALTER TABLE {table} ADD COLUMN {name} {definition}"),
                    [],
                )?;
            }
        }
        Ok(())
    }

    pub fn insert_raw_record(&self, record: &RawRecord) -> Result<i64> {
        let payload = serde_json::to_string(&record.payload)
            .map_err(|error| ZeppBridgeError::ParseError(error.to_string()))?;
        let mut hasher = Sha256::new();
        hasher.update(payload.as_bytes());
        // 校验和永远针对**未压缩**的 JSON。压缩是存储细节，不该改变
        // 「这份报文是什么」的身份。
        let payload_hash = hex::encode(hasher.finalize());
        let fetched_at = Utc::now().to_rfc3339();
        let payload_zip = compress_payload(&payload)?;
        self.conn.execute(
            "INSERT INTO raw_records
                (stream, source_key, source_scope, device_id, start_utc, end_utc,
                 payload, payload_zip, payload_hash, fetched_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, '', ?7, ?8, ?9)
             ON CONFLICT(stream, source_key) DO UPDATE SET
                source_scope = excluded.source_scope,
                device_id = excluded.device_id,
                start_utc = excluded.start_utc,
                end_utc = excluded.end_utc,
                payload = '',
                payload_zip = excluded.payload_zip,
                payload_hash = excluded.payload_hash,
                fetched_at = excluded.fetched_at",
            params![
                record.stream,
                record.source_key,
                record.source_scope.as_str(),
                record.device_id,
                record.start_utc.to_rfc3339(),
                record.end_utc.map(|value| value.to_rfc3339()),
                payload_zip,
                payload_hash,
                fetched_at,
            ],
        )?;
        self.conn
            .query_row(
                "SELECT id FROM raw_records WHERE stream = ?1 AND source_key = ?2",
                params![record.stream, record.source_key],
                |row| row.get(0),
            )
            .map_err(Into::into)
    }

    pub fn normalize_and_persist_raw(
        &self,
        raw_record_id: i64,
        stream: &str,
        source_key: &str,
        payload: &serde_json::Value,
    ) -> Result<NormalizationCounts> {
        let mut counts = NormalizationCounts::default();
        match stream {
            "heart_rate" => {
                let rows = Normalizer::normalize_heart_rate(payload)?;
                counts.primary_records = rows.len() as i64;
                self.clear_normalized_for_raw(raw_record_id, stream)?;
                for row in rows {
                    self.insert_metric_sample_with_raw(&row, Some(raw_record_id))?;
                }
            }
            "hrv" => {
                let rows = Normalizer::normalize_hrv(payload)?;
                counts.primary_records = rows.len() as i64;
                self.clear_normalized_for_raw(raw_record_id, stream)?;
                for row in rows {
                    self.insert_metric_sample_with_raw(&row, Some(raw_record_id))?;
                }
            }
            // Optional wellness streams. Their payload shapes are not verified
            // field by field yet, so normalization is best-effort and must
            // never fail: `persist_fetched_record` rolls the raw insert back on
            // error, and losing the raw response is what would make verifying
            // those shapes impossible without re-fetching.
            "wellness" => {
                let batch = Normalizer::normalize_wellness(source_key, payload);
                counts.primary_records =
                    (batch.daily_metrics.len() + batch.metric_samples.len()) as i64;
                self.clear_normalized_for_raw(raw_record_id, "daily_summary")?;
                self.clear_normalized_for_raw(raw_record_id, "heart_rate")?;
                for row in batch.daily_metrics {
                    self.insert_daily_metric_with_raw(&row, Some(raw_record_id))?;
                }
                for row in batch.metric_samples {
                    self.insert_metric_sample_with_raw(&row, Some(raw_record_id))?;
                }
            }
            // 体重 / 体成分。和 wellness 一样是尽力而为：`summary` 的字段随
            // 记录来源变，认不出来的只写进 diagnostics，不让整条流失败——
            // 原始报文丢了，就再也没法在不重新同步的情况下把它们认出来。
            "weight" => {
                let batch = Normalizer::normalize_weight(payload);
                counts.primary_records = batch.metric_samples.len() as i64;
                self.clear_normalized_for_raw(raw_record_id, stream)?;
                for row in batch.metric_samples {
                    self.insert_metric_sample_with_raw(&row, Some(raw_record_id))?;
                }
            }
            "daily_summary" => {
                let rows = Normalizer::normalize_daily_summary(payload)?;
                counts.primary_records = rows.len() as i64;
                self.clear_normalized_for_raw(raw_record_id, stream)?;
                for row in rows {
                    self.insert_daily_metric_with_raw(&row, Some(raw_record_id))?;
                }
            }
            "sleep" => {
                let band = Normalizer::normalize_band_data(payload)?;
                if band.sleep_sessions.is_empty()
                    && band.heart_rate_samples.is_empty()
                    && band.daily_metrics.is_empty()
                {
                    let detail = if band.diagnostics.is_empty() {
                        "band_data 没有可识别记录".to_string()
                    } else {
                        band.diagnostics.join("; ")
                    };
                    return Err(ZeppBridgeError::DataUnavailable(detail));
                }
                counts.primary_records = band.sleep_sessions.len() as i64;
                counts.band_heart_rate_records = band.heart_rate_samples.len() as i64;
                counts.supplemental_daily_records = band.daily_metrics.len() as i64;
                self.clear_normalized_for_raw(raw_record_id, stream)?;
                for row in band.sleep_sessions {
                    self.insert_sleep_session_with_raw(&row, Some(raw_record_id))?;
                }
                for row in band.heart_rate_samples {
                    self.insert_metric_sample_with_raw(&row, Some(raw_record_id))?;
                }
                for row in band.daily_metrics {
                    self.insert_daily_metric_with_raw(&row, Some(raw_record_id))?;
                }
                self.harvest_device_identities(payload)?;
            }
            "workouts" => {
                let sport = source_key
                    .strip_prefix("sport_history:")
                    .and_then(|value| value.split(':').next());
                let rows = Normalizer::normalize_workouts_with_sport(payload, sport)?;
                counts.primary_records = rows.len() as i64;
                // 先算出新行，再只删「这条报文以前产出、现在不再产出」的那些。
                // 别的流是「先清空，再插」；workouts 不能那么做，见
                // `clear_workouts_for_raw_except`。
                let keep: Vec<String> = rows.iter().map(|row| row.workout_id.clone()).collect();
                self.clear_workouts_for_raw_except(raw_record_id, &keep)?;
                for row in rows {
                    self.insert_workout_with_raw(&row, Some(raw_record_id))?;
                }
                self.harvest_device_identities(payload)?;
            }
            "workout_detail" => {
                let workout_id = workout_id_from_detail_key(source_key).ok_or_else(|| {
                    ZeppBridgeError::ConfigError("workout_detail source_key 无效".into())
                })?;
                if !self.workout_exists(&workout_id)? {
                    return Err(ZeppBridgeError::DataUnavailable(
                        "detail 对应的训练摘要还不存在".into(),
                    ));
                }
                let summary_end = self.workout_end_time(&workout_id)?;
                let summary_distance = self.workout_distance_meters(&workout_id)?;
                let decoded = decode_workout_detail(payload, summary_end, summary_distance)?;
                self.replace_workout_series(&workout_id, &decoded)?;
                counts.primary_records =
                    (decoded.samples.len() + decoded.route.len() + decoded.pauses.len()) as i64;
            }
            other => return Err(ZeppBridgeError::ConfigError(format!("未知同步流: {other}"))),
        }
        Ok(counts)
    }

    fn clear_normalized_for_raw(&self, raw_record_id: i64, stream: &str) -> Result<()> {
        match stream {
            "heart_rate" | "hrv" | "weight" => {
                self.conn.execute(
                    "DELETE FROM metric_samples WHERE raw_record_id = ?1",
                    [raw_record_id],
                )?;
            }
            "daily_summary" => {
                self.conn.execute(
                    "DELETE FROM daily_metrics WHERE raw_record_id = ?1",
                    [raw_record_id],
                )?;
            }
            "sleep" => {
                self.conn.execute(
                    "DELETE FROM metric_samples WHERE raw_record_id = ?1",
                    [raw_record_id],
                )?;
                self.conn.execute(
                    "DELETE FROM daily_metrics WHERE raw_record_id = ?1",
                    [raw_record_id],
                )?;
                self.conn.execute(
                    "DELETE FROM sleep_sessions WHERE raw_record_id = ?1",
                    [raw_record_id],
                )?;
            }
            // workouts 的清理不在这里：它必须先知道哪些行马上会被重新插回来。
            // 见 `clear_workouts_for_raw_except`。
            "workouts" => {}
            "workout_detail" => {}
            _ => {}
        }
        Ok(())
    }

    /// 删掉这条报文以前产出、而这一次归一化不再产出的运动汇总行。
    ///
    /// 为什么不能像别的流那样「先全删再插」：`workout_samples`、`route_points`、
    /// `workout_pauses`、`workout_splits` 四张表都以 `ON DELETE CASCADE` 挂在
    /// `workouts` 上。删掉一条马上就要插回来的汇总行，级联会把这条运动的逐秒
    /// 序列和 GPS 轨迹一起带走——而它们来自 `workout_detail`，那条流在一次
    /// 局部重放里根本不会被重放（v17→v18 就只重放 workouts 和 sleep）。结果是
    /// 升级报告成功，用户的历史轨迹全没了。
    ///
    /// 汇总行本身不需要先删：`insert_workout_with_raw` 是 upsert，而且它读旧行
    /// 是有意的——`merge_workout_type` 靠那一行才能在纠正旧的归一化结果的同时
    /// 保住用户自己改过的类型。先删一遍恰恰把这个机制废掉了。
    fn clear_workouts_for_raw_except(&self, raw_record_id: i64, keep: &[String]) -> Result<()> {
        if keep.is_empty() {
            self.conn.execute(
                "DELETE FROM workouts WHERE raw_record_id = ?1",
                [raw_record_id],
            )?;
            return Ok(());
        }
        // 参数个数跟着这次产出的运动条数走，不手拼 IN 列表——这些值来自
        // 云端报文，不是编译期常量。
        let placeholders = (2..=keep.len() + 1)
            .map(|index| format!("?{index}"))
            .collect::<Vec<_>>()
            .join(", ");
        let mut parameters: Vec<&dyn rusqlite::ToSql> = Vec::with_capacity(keep.len() + 1);
        parameters.push(&raw_record_id);
        for workout_id in keep {
            parameters.push(workout_id);
        }
        self.conn.execute(
            &format!(
                "DELETE FROM workouts
                 WHERE raw_record_id = ?1 AND workout_id NOT IN ({placeholders})"
            ),
            parameters.as_slice(),
        )?;
        Ok(())
    }

    /// 库里记着的解析器修订号。`None` = 这个库从来没有重放过。
    ///
    /// 和 `NORMALIZER_REVISION` 是两件事：后者说**这个程序**按哪一版规则解析，
    /// 前者说**库里的派生数据**是哪一版规则产出的。两者不相等，就意味着历史
    /// 记录还挂在旧规则上——只有重放能把它们对齐。
    pub fn stored_normalizer_revision(&self) -> Result<Option<String>> {
        self.conn
            .query_row(
                "SELECT value FROM app_meta WHERE key = 'normalizer_revision'",
                [],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .map_err(Into::into)
    }

    /// 这个库现在欠着的重放，`None` = 不欠。
    ///
    /// 只读：两条 SELECT，只读连接也能调。`status`、MCP 的健康报告都要能说出
    /// 「你的历史还停在旧解析器上」，而它们一个字节都不该写库，更不该在一条
    /// 本该秒回的命令里默默跑上几分钟。
    pub fn pending_replay_plan(&self) -> Result<Option<ReplayPlan>> {
        let stored = self.stored_normalizer_revision()?;
        if stored.as_deref() == Some(NORMALIZER_REVISION) {
            return Ok(None);
        }
        // 从 v20 升到 v21 时只重放这一版确实改过的 workouts。
        // 其他更早版本仍走整库重放，避免跳过中间版本带来的归一化变化。
        let streams: Vec<String> =
            if stored.as_deref() == Some(PREVIOUS_RELEASE_NORMALIZER_REVISION) {
                PREVIOUS_RELEASE_REPLAY_STREAMS
                    .iter()
                    .map(|stream| (*stream).to_string())
                    .collect()
            } else {
                Vec::new()
            };
        let raw_records = self.count_raw_records_for_streams(&streams)?;
        Ok(Some(ReplayPlan {
            stored_revision: stored,
            target_revision: NORMALIZER_REVISION.to_string(),
            streams,
            raw_records,
        }))
    }

    /// 库里一共存着多少条原始报文。整库重放前用它把「要过多少条」说清楚。
    pub fn raw_record_count(&self) -> Result<i64> {
        self.count_raw_records_for_streams(&[])
    }

    /// 空的 `streams` 表示全部流，和 `ReplayPlan::streams` 同一个约定。
    fn count_raw_records_for_streams(&self, streams: &[String]) -> Result<i64> {
        if streams.is_empty() {
            return self
                .conn
                .query_row("SELECT COUNT(*) FROM raw_records", [], |row| row.get(0))
                .map_err(Into::into);
        }
        let placeholders = (1..=streams.len())
            .map(|index| format!("?{index}"))
            .collect::<Vec<_>>()
            .join(", ");
        self.conn
            .query_row(
                &format!("SELECT COUNT(*) FROM raw_records WHERE stream IN ({placeholders})"),
                rusqlite::params_from_iter(streams.iter()),
                |row| row.get(0),
            )
            .map_err(Into::into)
    }

    pub fn reprocess_raw_records_if_needed(&self) -> Result<Option<BTreeMap<String, i64>>> {
        let Some(plan) = self.pending_replay_plan()? else {
            return Ok(None);
        };
        let counts = if plan.streams.is_empty() {
            self.reprocess_raw_records_for_stream(None)?
        } else {
            let streams: Vec<&str> = plan.streams.iter().map(String::as_str).collect();
            self.reprocess_raw_records_for_stream(Some(&streams))?
        };
        // 本地重放有自己的时间线。它绝不改写云端同步时间：用户问「数据新
        // 不新」和「你什么时候连过云」是两个问题。
        self.record_local_replay(false)?;
        Ok(Some(counts))
    }

    pub fn reprocess_raw_records(&self) -> Result<BTreeMap<String, i64>> {
        self.reprocess_raw_records_for_stream(None)
    }

    /// 重放 `raw_records`。`stream_filter` 为 `None` 时重放全部。
    ///
    /// 过滤条件是一组流名而不是一个：一次修订往往同时动到不止一条流的归一化
    /// 规则（v18 就同时改了 workouts 和 sleep），只能传一个的话，第二条流要么
    /// 被漏掉，要么只能退回全量重放。
    fn reprocess_raw_records_for_stream(
        &self,
        stream_filter: Option<&[&str]>,
    ) -> Result<BTreeMap<String, i64>> {
        let _replay_guard = ReplayGuard::enter();
        // 先只取 id 和归一化要用的那两个短字段，报文留到循环里一条一条读。
        // 从前是连 payload 一起收进 Vec 的——那等于重放开始之前先把库里全部
        // 报文读进内存，而这段代码恰恰要在 NAS 和有内存上限的容器里跑 842 MB
        // 的库。
        let plan: Vec<(i64, String, String)> = if let Some(streams) = stream_filter {
            // 参数个数跟着流的条数走。手拼 IN 列表是这类代码最容易留下 SQL
            // 注入口子的地方，即使这里的值全是编译期常量。
            let placeholders = (1..=streams.len())
                .map(|index| format!("?{index}"))
                .collect::<Vec<_>>()
                .join(", ");
            let mut stmt = self.conn.prepare(&format!(
                "SELECT id, stream, source_key
                 FROM raw_records WHERE stream IN ({placeholders}) ORDER BY id"
            ))?;
            let rows = stmt.query_map(rusqlite::params_from_iter(streams.iter()), |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                ))
            })?;
            rows.collect::<std::result::Result<Vec<_>, _>>()?
        } else {
            let mut stmt = self
                .conn
                .prepare("SELECT id, stream, source_key FROM raw_records ORDER BY id")?;
            let rows = stmt.query_map([], |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                ))
            })?;
            rows.collect::<std::result::Result<Vec<_>, _>>()?
        };

        let mut counts = BTreeMap::<String, i64>::new();
        let mut band_heart_rate = 0i64;
        // 一批一个事务。批的边界落在报文之间，所以「先删掉这条报文的派生行、
        // 再照新规则插一遍」始终在同一个事务里——中途失败不会留下一条被清空
        // 却没被重建的记录。
        for batch in plan.chunks(REPLAY_BATCH_RECORDS) {
            let transaction = ReplayBatch::begin(&self.conn)?;
            for (id, stream, source_key) in batch {
                // 报文可能在这次重放开始之后被清理掉，跳过即可，不是错误。
                let Some((stored_payload, payload_zip)) = self.raw_payload(*id)? else {
                    continue;
                };
                let encoded_payload = decode_raw_payload(stored_payload, payload_zip)?;
                let payload: serde_json::Value = serde_json::from_str(&encoded_payload)
                    .map_err(|error| ZeppBridgeError::ParseError(error.to_string()))?;
                if let Ok(result) =
                    self.normalize_and_persist_raw(*id, stream, source_key, &payload)
                {
                    *counts.entry(stream.clone()).or_default() += result.primary_records;
                    band_heart_rate += result.band_heart_rate_records;
                }
            }
            transaction.commit()?;
        }
        if band_heart_rate > 0 {
            counts.insert("heart_rate".to_string(), band_heart_rate);
        }

        // 有自己那张表的流，报库里现在的总数（比这一趟的增量更有意义）。
        // 没有自己那张表的流保留这一趟的实测值：`wellness` 的产物落在
        // daily_metrics 和 metric_samples 里，问「wellness 表有多少行」只会
        // 得到 0，而把 0 报给用户，等于说这条流一条都没解出来。
        for stream in counts.keys().cloned().collect::<Vec<_>>() {
            if let Some(total) = self.normalized_stream_count(&stream)? {
                counts.insert(stream.clone(), total);
            }
        }

        self.conn.execute(
            "INSERT INTO app_meta(key, value, updated_at)
             VALUES('normalizer_revision', ?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
            params![NORMALIZER_REVISION, Utc::now().to_rfc3339()],
        )?;
        self.set_app_meta(LAST_LOCAL_REPROCESS_AT_KEY, &Utc::now().to_rfc3339())?;
        Ok(counts)
    }

    /// 单条原始报文的存储表示（可能是压缩过的）。
    fn raw_payload(&self, raw_record_id: i64) -> Result<Option<(String, Option<Vec<u8>>)>> {
        self.conn
            .query_row(
                "SELECT payload, payload_zip FROM raw_records WHERE id = ?1",
                [raw_record_id],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, Option<Vec<u8>>>(1)?)),
            )
            .optional()
            .map_err(Into::into)
    }

    /// `None` = 这条流没有属于自己的规范表，数不出一个只属于它的总数。
    fn normalized_stream_count(&self, stream: &str) -> Result<Option<i64>> {
        let (query, parameter): (&str, Option<&str>) = match stream {
            "heart_rate" => (
                "SELECT COUNT(*) FROM metric_samples WHERE metric = ?1",
                Some("heart_rate"),
            ),
            "hrv" => (
                "SELECT COUNT(*) FROM metric_samples WHERE metric = ?1",
                Some("hrv"),
            ),
            // 按流数，不是整表数：wellness 也往 daily_metrics 里写日行，
            // 而 v20 这次升级两条流都要重放。整表 COUNT(*) 会把 wellness 的
            // 行算进 daily_summary 的账上，用户看到的两个数字加起来大于真实
            // 写入量。
            "daily_summary" => (
                "SELECT COUNT(*) FROM daily_metrics d
                   JOIN raw_records r ON r.id = d.raw_record_id
                  WHERE r.stream = 'daily_summary'",
                None,
            ),
            "sleep" => ("SELECT COUNT(*) FROM sleep_sessions", None),
            "workouts" => ("SELECT COUNT(*) FROM workouts", None),
            "workout_detail" => ("SELECT COUNT(*) FROM workout_samples", None),
            // wellness 没有自己的表，它写进 daily_metrics 和 metric_samples。
            // 不数它的话，一次只重放 wellness 的升级会向用户报「0 条」，而
            // 那次升级的全部意义恰恰就是这条流。
            "wellness" => (
                "SELECT (SELECT COUNT(*) FROM metric_samples s
                           JOIN raw_records r ON r.id = s.raw_record_id
                          WHERE r.stream = 'wellness')
                      + (SELECT COUNT(*) FROM daily_metrics d
                           JOIN raw_records r ON r.id = d.raw_record_id
                          WHERE r.stream = 'wellness')",
                None,
            ),
            // 体重同样没有自己的表，它写进 metric_samples。不数它的话，一次
            // 只重放 weight 的升级会向用户报「0 条」，而那次升级的全部意义
            // 恰恰就是这条流。
            "weight" => (
                "SELECT COUNT(*) FROM metric_samples s
                   JOIN raw_records r ON r.id = s.raw_record_id
                  WHERE r.stream = 'weight'",
                None,
            ),
            _ => return Ok(None),
        };
        let total = if let Some(parameter) = parameter {
            self.conn.query_row(query, [parameter], |row| row.get(0))?
        } else {
            self.conn.query_row(query, [], |row| row.get(0))?
        };
        Ok(Some(total))
    }

    #[cfg(test)]
    pub fn insert_metric_sample(&self, sample: &MetricSample) -> Result<()> {
        self.insert_metric_sample_with_raw(sample, None)
    }

    pub fn insert_metric_sample_with_raw(
        &self,
        sample: &MetricSample,
        raw_record_id: Option<i64>,
    ) -> Result<()> {
        self.conn.execute(
            "INSERT INTO metric_samples
                (metric, timestamp, value, unit, source_scope, device_id, raw_record_id)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
             ON CONFLICT DO UPDATE SET
                value = excluded.value,
                source_scope = excluded.source_scope,
                raw_record_id = COALESCE(excluded.raw_record_id, metric_samples.raw_record_id)",
            params![
                sample.metric,
                sample.timestamp.to_rfc3339(),
                sample.value,
                sample.unit,
                sample.source_scope.as_str(),
                sample.device_id,
                raw_record_id,
            ],
        )?;
        Ok(())
    }

    #[allow(dead_code)]
    #[allow(dead_code)]
    pub fn insert_daily_metric(&self, metric: &DailyMetric) -> Result<()> {
        self.insert_daily_metric_with_raw(metric, None)
    }

    pub fn insert_daily_metric_with_raw(
        &self,
        metric: &DailyMetric,
        raw_record_id: Option<i64>,
    ) -> Result<()> {
        self.conn.execute(
            "INSERT INTO daily_metrics
                (date, metric, value, unit, source_scope, device_id, raw_record_id)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
             ON CONFLICT DO UPDATE SET
                value = excluded.value,
                source_scope = excluded.source_scope,
                raw_record_id = COALESCE(excluded.raw_record_id, daily_metrics.raw_record_id)",
            params![
                metric.date,
                metric.metric,
                metric.value,
                metric.unit,
                metric.source_scope.as_str(),
                metric.device_id,
                raw_record_id,
            ],
        )?;
        Ok(())
    }

    #[allow(dead_code)]
    pub fn insert_sleep_session(&self, sleep: &SleepSession) -> Result<()> {
        self.insert_sleep_session_with_raw(sleep, None)
    }

    pub fn insert_sleep_session_with_raw(
        &self,
        sleep: &SleepSession,
        raw_record_id: Option<i64>,
    ) -> Result<()> {
        let synced_at = sleep
            .synced_at
            .or_else(|| self.fetched_at_for_raw(raw_record_id))
            .unwrap_or_else(Utc::now);
        self.conn.execute(
            "INSERT INTO sleep_sessions
                (sleep_id, start_time, end_time, score, duration_minutes,
                 deep_minutes, light_minutes, rem_minutes, rem_available, awake_minutes,
                 source_scope, device_id, raw_record_id, synced_at, wake_count)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)
             ON CONFLICT(sleep_id) DO UPDATE SET
                start_time = excluded.start_time,
                end_time = excluded.end_time,
                score = excluded.score,
                duration_minutes = excluded.duration_minutes,
                deep_minutes = excluded.deep_minutes,
                light_minutes = excluded.light_minutes,
                rem_minutes = excluded.rem_minutes,
                rem_available = excluded.rem_available,
                awake_minutes = excluded.awake_minutes,
                wake_count = excluded.wake_count,
                source_scope = excluded.source_scope,
                device_id = excluded.device_id,
                raw_record_id = COALESCE(excluded.raw_record_id, sleep_sessions.raw_record_id),
                synced_at = COALESCE(sleep_sessions.synced_at, excluded.synced_at)",
            params![
                sleep.sleep_id,
                sleep.start_time.to_rfc3339(),
                sleep.end_time.to_rfc3339(),
                sleep.score,
                sleep.duration_minutes,
                sleep.deep_minutes,
                sleep.light_minutes,
                sleep.rem_minutes.unwrap_or(0),
                i64::from(sleep.rem_minutes.is_some()),
                sleep.awake_minutes,
                sleep.source_scope.as_str(),
                sleep.device_id,
                raw_record_id,
                synced_at.to_rfc3339(),
                sleep.wake_count,
            ],
        )?;
        self.replace_sleep_stages(&sleep.sleep_id, &sleep.stages)?;
        Ok(())
    }

    #[allow(dead_code)]
    pub fn insert_workout(&self, workout: &Workout) -> Result<()> {
        self.insert_workout_with_raw(workout, None)
    }

    pub fn insert_workout_with_raw(
        &self,
        workout: &Workout,
        raw_record_id: Option<i64>,
    ) -> Result<()> {
        let synced_at = workout
            .synced_at
            .or_else(|| self.fetched_at_for_raw(raw_record_id))
            .unwrap_or_else(Utc::now);
        let existing = self
            .conn
            .query_row(
                "SELECT workout_type, workout_type_source, workout_type_override,
                        zepp_type, workout_type_conflict
                 FROM workouts WHERE workout_id = ?1",
                [&workout.workout_id],
                |row| {
                    Ok(StoredWorkoutType {
                        normalized_type: row.get(0)?,
                        type_source: row.get(1)?,
                        user_override: row.get(2)?,
                        zepp_type: row.get(3)?,
                        conflict: row.get(4)?,
                    })
                },
            )
            .optional()?;
        let merged_type = merge_workout_type(existing, workout);
        self.conn.execute(
            "INSERT INTO workouts
                (workout_id, workout_type, start_time, end_time, distance_meters,
                 calories, avg_hr, max_hr, training_load, vo2max,
                 source_scope, device_id, raw_record_id, synced_at,
                 gps_available, sample_count, zepp_source, zepp_type,
                 workout_type_source, workout_type_override, workout_type_conflict,
                 min_hr, total_steps, moving_seconds, elevation_gain_m, elevation_loss_m,
                 max_altitude_m, min_altitude_m, training_effect, anaerobic_training_effect,
                 rpe, avg_cadence_spm, max_cadence_spm, avg_stride_cm)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21,
                     ?22, ?23, ?24, ?25, ?26, ?27, ?28, ?29, ?30, ?31, ?32, ?33, ?34)
             ON CONFLICT(workout_id) DO UPDATE SET
                workout_type = excluded.workout_type,
                start_time = excluded.start_time,
                end_time = excluded.end_time,
                distance_meters = COALESCE(excluded.distance_meters, workouts.distance_meters),
                calories = COALESCE(excluded.calories, workouts.calories),
                avg_hr = COALESCE(excluded.avg_hr, workouts.avg_hr),
                max_hr = COALESCE(excluded.max_hr, workouts.max_hr),
                training_load = COALESCE(excluded.training_load, workouts.training_load),
                vo2max = COALESCE(excluded.vo2max, workouts.vo2max),
                source_scope = excluded.source_scope,
                device_id = excluded.device_id,
                raw_record_id = COALESCE(excluded.raw_record_id, workouts.raw_record_id),
                synced_at = COALESCE(workouts.synced_at, excluded.synced_at),
                gps_available = CASE
                    WHEN excluded.gps_available > workouts.gps_available THEN excluded.gps_available
                    ELSE workouts.gps_available
                END,
                sample_count = CASE
                    WHEN excluded.sample_count > workouts.sample_count THEN excluded.sample_count
                    ELSE workouts.sample_count
                END,
                zepp_source = COALESCE(excluded.zepp_source, workouts.zepp_source),
                zepp_type = excluded.zepp_type,
                workout_type_source = excluded.workout_type_source,
                workout_type_override = COALESCE(workouts.workout_type_override, excluded.workout_type_override),
                workout_type_conflict = excluded.workout_type_conflict,
                -- 一律 COALESCE：补拉回来的摘要可能缺字段，缺的那次不该把上一次
                -- 已经拿到的值抹成 NULL。
                min_hr = COALESCE(excluded.min_hr, workouts.min_hr),
                total_steps = COALESCE(excluded.total_steps, workouts.total_steps),
                moving_seconds = COALESCE(excluded.moving_seconds, workouts.moving_seconds),
                elevation_gain_m = COALESCE(excluded.elevation_gain_m, workouts.elevation_gain_m),
                elevation_loss_m = COALESCE(excluded.elevation_loss_m, workouts.elevation_loss_m),
                max_altitude_m = COALESCE(excluded.max_altitude_m, workouts.max_altitude_m),
                min_altitude_m = COALESCE(excluded.min_altitude_m, workouts.min_altitude_m),
                training_effect = COALESCE(excluded.training_effect, workouts.training_effect),
                anaerobic_training_effect = COALESCE(
                    excluded.anaerobic_training_effect, workouts.anaerobic_training_effect),
                rpe = COALESCE(excluded.rpe, workouts.rpe),
                avg_cadence_spm = COALESCE(excluded.avg_cadence_spm, workouts.avg_cadence_spm),
                max_cadence_spm = COALESCE(excluded.max_cadence_spm, workouts.max_cadence_spm),
                avg_stride_cm = COALESCE(excluded.avg_stride_cm, workouts.avg_stride_cm)",
            params![
                workout.workout_id,
                merged_type.normalized_type,
                workout.start_time.to_rfc3339(),
                workout.end_time.to_rfc3339(),
                workout.distance_meters,
                workout.calories,
                workout.avg_hr,
                workout.max_hr,
                workout.training_load,
                workout.vo2max,
                workout.source_scope.as_str(),
                workout.device_id,
                raw_record_id,
                synced_at.to_rfc3339(),
                i64::from(workout.gps_available),
                workout.sample_count,
                workout.zepp_source,
                merged_type.zepp_type,
                merged_type.type_source,
                merged_type.user_override,
                merged_type.conflict,
                workout.min_hr,
                workout.total_steps,
                workout.moving_seconds,
                workout.elevation_gain_m,
                workout.elevation_loss_m,
                workout.max_altitude_m,
                workout.min_altitude_m,
                workout.training_effect,
                workout.anaerobic_training_effect,
                workout.rpe,
                workout.avg_cadence_spm,
                workout.max_cadence_spm,
                workout.avg_stride_cm,
            ],
        )?;
        // 心率区间分布。整条替换而不是逐段 upsert：区间边界会随用户在表上的
        // 设定变化，段数也可能不同，留着上一次的段会拼出一个从未存在过的分布。
        // 空的 `hr_zones` 表示这次同步没带这项，不动已经存下来的。
        if !workout.hr_zones.is_empty() {
            self.conn.execute(
                "DELETE FROM workout_hr_zones WHERE workout_id = ?1",
                [&workout.workout_id],
            )?;
            for zone in &workout.hr_zones {
                self.conn.execute(
                    "INSERT INTO workout_hr_zones
                        (workout_id, zone_index, upper_bound_bpm, seconds)
                     VALUES (?1, ?2, ?3, ?4)",
                    params![
                        workout.workout_id,
                        zone.index,
                        zone.upper_bound_bpm,
                        zone.seconds
                    ],
                )?;
            }
        }
        Ok(())
    }

    /// 一次运动的心率区间分布，按区间顺序。
    pub fn workout_hr_zones(&self, workout_id: &str) -> Result<Vec<HeartRateZoneBucket>> {
        let mut stmt = self.conn.prepare(
            "SELECT zone_index, upper_bound_bpm, seconds FROM workout_hr_zones
              WHERE workout_id = ?1 ORDER BY zone_index",
        )?;
        let rows = stmt.query_map([workout_id], |row| {
            Ok(HeartRateZoneBucket {
                index: row.get(0)?,
                upper_bound_bpm: row.get(1)?,
                seconds: row.get(2)?,
            })
        })?;
        Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
    }

    pub fn diagnostic_schema_version(&self) -> Result<i64> {
        self.conn
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .map_err(Into::into)
    }

    /// 最近一次「HTTP 200，但云端说不成功」。
    ///
    /// 只取三样东西：哪条流、哪个 code、什么时候。**不取云端的原话**
    /// ——那是服务端给的自由文本，里面可能带账号信息，而这份报告对用户
    /// 的承诺是只发白名单字段。一个整数就够把「凭据失效长什么样」定下来。
    ///
    /// 为什么需要它：`classify_business_code` 目前把所有非 1 的 code 都归成
    /// `CloudRejected`，而不敎定为「需要重新登录」——因为本机那 1075 条留存
    /// 报文全是 `code = 1`，一个失败码都没观测到。拿到真实的失败码之前，
    /// 把用户踢去重新扫码登录是拿一个确定的坏体验去换一个猜测。
    /// （对得上的真实反馈：D1 `c1f03eb2`「All my readings are showing empty」。）
    pub fn diagnostic_cloud_rejection(&self) -> Result<Option<DiagnosticCloudRejection>> {
        let mut stmt = self.conn.prepare(
            "SELECT stream, last_error_code,
                    COALESCE(last_fetch_error_at, last_parse_error_at, last_write_error_at)
             FROM stream_provenance
             WHERE last_error_code IS NOT NULL
               AND 'cloud_rejected' IN (
                   COALESCE(last_fetch_error_kind, ''),
                   COALESCE(last_parse_error_kind, ''),
                   COALESCE(last_write_error_kind, '')
               )
             ORDER BY updated_at DESC
             LIMIT 1",
        )?;
        let mut rows = stmt.query_map([], |row| {
            Ok(DiagnosticCloudRejection {
                stream: row.get(0)?,
                code: row.get(1)?,
                at: row.get(2)?,
            })
        })?;
        match rows.next() {
            Some(row) => Ok(Some(row?)),
            None => Ok(None),
        }
    }

    pub fn diagnostic_unknown_workout_codes(&self) -> Result<Vec<DiagnosticWorkoutCode>> {
        let mut stmt = self.conn.prepare(
            "SELECT zepp_type, COUNT(*)
             FROM workouts
             WHERE workout_type_source = 'unknown_code' AND zepp_type IS NOT NULL
             GROUP BY zepp_type ORDER BY zepp_type",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(DiagnosticWorkoutCode {
                code: row.get(0)?,
                records: row.get(1)?,
            })
        })?;
        rows.collect::<std::result::Result<Vec<_>, _>>()
            .map_err(Into::into)
    }

    /// 用户做过的运动类型纠正，按「编号 → 我们的解释 → 用户的解释」聚合。
    ///
    /// 只取有 `zepp_type` 的行：没有原始编号的纠正对补目录没有帮助，而这份
    /// 报告存在的唯一理由就是补目录。按三元组分组而不是按记录列出，是为了
    /// 让报告的大小跟「有几种错法」走，而不是跟「用户改了多少条」走。
    pub fn diagnostic_workout_type_corrections(&self) -> Result<Vec<DiagnosticWorkoutCorrection>> {
        let mut stmt = self.conn.prepare(
            "SELECT zepp_type, workout_type, workout_type_override, COUNT(*)
             FROM workouts
             WHERE workout_type_override IS NOT NULL
               AND zepp_type IS NOT NULL
               AND workout_type_override <> workout_type
             GROUP BY zepp_type, workout_type, workout_type_override
             ORDER BY COUNT(*) DESC, zepp_type",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(DiagnosticWorkoutCorrection {
                code: row.get(0)?,
                interpreted: row.get(1)?,
                corrected: row.get(2)?,
                records: row.get(3)?,
            })
        })?;
        rows.collect::<std::result::Result<Vec<_>, _>>()
            .map_err(Into::into)
    }

    pub fn diagnostic_workout_type_conflicts(&self) -> Result<i64> {
        self.conn
            .query_row(
                "SELECT COUNT(*) FROM workouts WHERE workout_type_conflict IS NOT NULL",
                [],
                |row| row.get(0),
            )
            .map_err(Into::into)
    }

    fn workout_exists(&self, workout_id: &str) -> Result<bool> {
        let count: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM workouts WHERE workout_id = ?1",
            [workout_id],
            |row| row.get(0),
        )?;
        Ok(count > 0)
    }

    /// 这条运动的总距离。
    ///
    /// 明细解码走 `kilo_pace` 兜底时要它：那份数据只给整公里，最后那截零头的
    /// 长度只能从汇总来。汇总里没有距离（室内、无 GPS）就返回 None，那时不补
    /// 零头，而不是猜一个。
    fn workout_distance_meters(&self, workout_id: &str) -> Result<Option<f64>> {
        Ok(self
            .conn
            .query_row(
                "SELECT distance_meters FROM workouts WHERE workout_id = ?1",
                [workout_id],
                |row| row.get::<_, Option<f64>>(0),
            )
            .optional()?
            .flatten())
    }

    fn workout_end_time(&self, workout_id: &str) -> Result<Option<DateTime<Utc>>> {
        let value: Option<String> = self
            .conn
            .query_row(
                "SELECT end_time FROM workouts WHERE workout_id = ?1",
                [workout_id],
                |row| row.get(0),
            )
            .optional()?;
        value
            .map(|text| parse_datetime(&text, "workouts.end_time"))
            .transpose()
    }

    pub fn pending_running_details(&self) -> Result<Vec<PendingWorkoutDetail>> {
        let mut stmt = self.conn.prepare(
            "SELECT workout_id, zepp_source FROM workouts
             WHERE zepp_source IS NOT NULL
               AND TRIM(zepp_source) != ''
               AND NOT EXISTS (
                   SELECT 1 FROM raw_records
                   WHERE stream = 'workout_detail'
                     AND source_key = 'workout_detail:' || workouts.workout_id || ':' || workouts.zepp_source
               )
             ORDER BY start_time DESC",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(PendingWorkoutDetail {
                workout_id: row.get(0)?,
                source: row.get(1)?,
            })
        })?;
        rows.collect::<std::result::Result<Vec<_>, _>>()
            .map_err(Into::into)
    }

    pub fn replace_workout_series(&self, workout_id: &str, decoded: &DecodedWorkout) -> Result<()> {
        self.conn.execute(
            "DELETE FROM workout_samples WHERE workout_id = ?1",
            [workout_id],
        )?;
        self.conn.execute(
            "DELETE FROM route_points WHERE workout_id = ?1",
            [workout_id],
        )?;
        self.conn.execute(
            "DELETE FROM workout_pauses WHERE workout_id = ?1",
            [workout_id],
        )?;
        self.conn.execute(
            "DELETE FROM workout_splits WHERE workout_id = ?1",
            [workout_id],
        )?;

        {
            let mut insert = self.conn.prepare(
                "INSERT INTO workout_samples
                    (workout_id, timestamp, heart_rate, pace, speed, cadence, altitude, stride,
                     power_watts, ground_contact_ms, vertical_oscillation_mm, vertical_ratio_pct,
                     equivalent_pace_s)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
            )?;
            for sample in &decoded.samples {
                insert.execute(params![
                    workout_id,
                    sample.timestamp.to_rfc3339(),
                    sample.heart_rate,
                    sample.pace,
                    sample.speed,
                    sample.cadence,
                    sample.altitude_m,
                    sample.stride_cm,
                    sample.power_watts,
                    sample.ground_contact_ms,
                    sample.vertical_oscillation_mm,
                    sample.vertical_ratio_pct,
                    sample.equivalent_pace_s_per_km,
                ])?;
            }
        }
        {
            let mut insert = self.conn.prepare(
                "INSERT INTO route_points
                    (workout_id, timestamp, latitude, longitude, altitude)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
            )?;
            for point in &decoded.route {
                insert.execute(params![
                    workout_id,
                    point.timestamp.to_rfc3339(),
                    point.latitude,
                    point.longitude,
                    point.altitude_m,
                ])?;
            }
        }
        {
            let mut insert = self.conn.prepare(
                "INSERT INTO workout_pauses
                    (workout_id, start_time, end_time, kind)
                 VALUES (?1, ?2, ?3, ?4)",
            )?;
            for pause in &decoded.pauses {
                insert.execute(params![
                    workout_id,
                    pause.start_time.to_rfc3339(),
                    pause.end_time.to_rfc3339(),
                    pause.kind,
                ])?;
            }
        }
        {
            let mut insert = self.conn.prepare(
                "INSERT INTO workout_splits
                    (workout_id, split_index, start_time, end_time, distance_m,
                     duration_seconds, pace_min_per_km, avg_hr, max_hr,
                     elevation_gain_m, elevation_loss_m, partial)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
            )?;
            for split in &decoded.splits {
                insert.execute(params![
                    workout_id,
                    split.index,
                    split.start_time.to_rfc3339(),
                    split.end_time.to_rfc3339(),
                    split.distance_m,
                    split.duration_seconds,
                    split.pace_min_per_km,
                    split.avg_hr,
                    split.max_hr,
                    split.elevation_gain_m,
                    split.elevation_loss_m,
                    i64::from(split.partial),
                ])?;
            }
        }

        self.conn.execute(
            "UPDATE workouts
             SET gps_available = CASE WHEN ?2 > 0 THEN 1 ELSE gps_available END,
                 sample_count = ?3
             WHERE workout_id = ?1",
            params![
                workout_id,
                decoded.route.len() as i64,
                decoded.samples.len() as i64,
            ],
        )?;
        Ok(())
    }

    pub fn get_workout_series(&self, workout_id: &str) -> Result<WorkoutSeries> {
        let mut samples = {
            let mut stmt = self.conn.prepare(
                "SELECT timestamp, heart_rate, pace, speed, cadence, altitude, stride,
                        power_watts, ground_contact_ms, vertical_oscillation_mm,
                        vertical_ratio_pct, equivalent_pace_s
                 FROM workout_samples WHERE workout_id = ?1 ORDER BY timestamp",
            )?;
            let rows = stmt.query_map([workout_id], |row| {
                Ok(WorkoutSeriesSample {
                    timestamp: row.get(0)?,
                    heart_rate: row.get(1)?,
                    pace: row.get(2)?,
                    speed: row.get(3)?,
                    cadence: row.get(4)?,
                    altitude_m: row.get(5)?,
                    stride_cm: row.get(6)?,
                    power_watts: row.get(7)?,
                    ground_contact_ms: row.get(8)?,
                    vertical_oscillation_mm: row.get(9)?,
                    vertical_ratio_pct: row.get(10)?,
                    equivalent_pace_s_per_km: row.get(11)?,
                })
            })?;
            rows.collect::<std::result::Result<Vec<_>, _>>()?
        };
        for sample in &mut samples {
            sample.pace = pace_minutes_per_kilometre(sample.pace, sample.speed);
            sample.equivalent_pace_s_per_km =
                plausible_equivalent_pace(sample.equivalent_pace_s_per_km);
        }

        let route = {
            let mut stmt = self.conn.prepare(
                "SELECT timestamp, latitude, longitude, altitude
                 FROM route_points WHERE workout_id = ?1 ORDER BY timestamp",
            )?;
            let rows = stmt.query_map([workout_id], |row| {
                Ok(WorkoutRoutePoint {
                    timestamp: row.get(0)?,
                    latitude: row.get(1)?,
                    longitude: row.get(2)?,
                    altitude_m: row.get(3)?,
                })
            })?;
            rows.collect::<std::result::Result<Vec<_>, _>>()?
        };

        let pauses = {
            let mut stmt = self.conn.prepare(
                "SELECT start_time, end_time, kind
                 FROM workout_pauses WHERE workout_id = ?1 ORDER BY start_time",
            )?;
            let rows = stmt.query_map([workout_id], |row| {
                Ok(WorkoutPause {
                    start_time: row.get(0)?,
                    end_time: row.get(1)?,
                    kind: row.get(2)?,
                })
            })?;
            rows.collect::<std::result::Result<Vec<_>, _>>()?
        };

        let summary = workout_series_summary(&samples);

        let splits = self.load_workout_splits(workout_id)?;

        Ok(WorkoutSeries {
            workout_id: workout_id.to_owned(),
            samples,
            route,
            pauses,
            splits,
            summary,
        })
    }

    fn fetched_at_for_raw(&self, raw_record_id: Option<i64>) -> Option<DateTime<Utc>> {
        let raw_record_id = raw_record_id?;
        let timestamp: Option<String> = self
            .conn
            .query_row(
                "SELECT fetched_at FROM raw_records WHERE id = ?1",
                [raw_record_id],
                |row| row.get(0),
            )
            .optional()
            .ok()
            .flatten();
        timestamp.and_then(|value| parse_datetime(&value, "raw_records.fetched_at").ok())
    }

    fn replace_sleep_stages(&self, sleep_id: &str, stages: &[SleepStageSlice]) -> Result<()> {
        self.conn
            .execute("DELETE FROM sleep_stages WHERE sleep_id = ?1", [sleep_id])?;
        for stage in stages {
            self.conn.execute(
                "INSERT INTO sleep_stages (sleep_id, stage, start_time, end_time, raw_mode)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                params![
                    sleep_id,
                    stage.stage,
                    stage.start_time.to_rfc3339(),
                    stage.end_time.to_rfc3339(),
                    stage.raw_mode,
                ],
            )?;
        }
        Ok(())
    }

    /// The IANA timezone the devices report, for endpoints that ask for a zone
    /// name rather than an offset.
    pub fn device_time_zone(&self) -> Result<Option<String>> {
        Ok(self
            .conn
            .query_row(
                "SELECT timezone FROM device_identities
                 WHERE timezone IS NOT NULL AND timezone <> ''
                 ORDER BY updated_at DESC LIMIT 1",
                [],
                |row| row.get::<_, String>(0),
            )
            .optional()?)
    }

    /// How many retained `wellness` raw responses carry one of these labels.
    fn count_wellness_raw(&self, labels: &[&str]) -> Result<i64> {
        let mut total = 0i64;
        for label in labels {
            let pattern = format!("wellness:{label}:%");
            total += self.conn.query_row(
                "SELECT COUNT(*) FROM raw_records WHERE stream = 'wellness' AND source_key LIKE ?1",
                [&pattern],
                |row| row.get::<_, i64>(0),
            )?;
        }
        Ok(total)
    }

    fn load_workout_splits(&self, workout_id: &str) -> Result<Vec<WorkoutSplitRow>> {
        let mut stmt = self.conn.prepare(
            "SELECT split_index, start_time, end_time, distance_m, duration_seconds,
                    pace_min_per_km, avg_hr, max_hr, elevation_gain_m, elevation_loss_m, partial
             FROM workout_splits WHERE workout_id = ?1 ORDER BY split_index",
        )?;
        let rows = stmt.query_map([workout_id], |row| {
            Ok(WorkoutSplitRow {
                index: row.get(0)?,
                start_time: row.get(1)?,
                end_time: row.get(2)?,
                distance_m: row.get(3)?,
                duration_seconds: row.get(4)?,
                pace_min_per_km: row.get(5)?,
                avg_hr: row.get(6)?,
                max_hr: row.get(7)?,
                elevation_gain_m: row.get(8)?,
                elevation_loss_m: row.get(9)?,
                partial: row.get::<_, i64>(10)? != 0,
            })
        })?;
        Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
    }

    fn load_sleep_stages(&self, sleep_id: &str) -> Result<Vec<SleepStageSlice>> {
        let mut stmt = self.conn.prepare(
            "SELECT stage, start_time, end_time, raw_mode FROM sleep_stages
             WHERE sleep_id = ?1 ORDER BY start_time, id",
        )?;
        let rows = stmt.query_map([sleep_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, Option<i64>>(3)?,
            ))
        })?;
        let mut stages = Vec::new();
        for row in rows {
            let (stage, start, end, raw_mode) = row?;
            stages.push(SleepStageSlice {
                stage,
                start_time: parse_datetime(&start, "sleep_stages.start_time")?,
                end_time: parse_datetime(&end, "sleep_stages.end_time")?,
                raw_mode,
            });
        }
        Ok(stages)
    }

    pub fn upsert_device_identity(&self, hint: &DeviceIdentityHint) -> Result<()> {
        let updated_at = Utc::now().to_rfc3339();
        let mut aliases = hint.aliases.clone();
        if let Some(device_id) = hint.device_id.as_ref() {
            aliases.push(device_id.clone());
        }
        if let Some(serial) = hint.serial.as_ref() {
            aliases.push(serial.clone());
        }
        aliases.retain(|value| !value.trim().is_empty());
        aliases.sort();
        aliases.dedup();
        for alias in aliases {
            self.conn.execute(
                "INSERT INTO device_identities
                    (alias, name, firmware, serial, device_id, timezone, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
                 ON CONFLICT(alias) DO UPDATE SET
                    name = COALESCE(excluded.name, device_identities.name),
                    firmware = COALESCE(excluded.firmware, device_identities.firmware),
                    serial = COALESCE(excluded.serial, device_identities.serial),
                    device_id = COALESCE(excluded.device_id, device_identities.device_id),
                    timezone = COALESCE(excluded.timezone, device_identities.timezone),
                    updated_at = excluded.updated_at",
                params![
                    alias,
                    hint.name,
                    hint.firmware,
                    hint.serial,
                    hint.device_id,
                    hint.timezone,
                    updated_at,
                ],
            )?;
        }
        Ok(())
    }

    pub fn lookup_device_profile(&self, device_id: &str) -> Result<Option<DeviceProfile>> {
        let trimmed = device_id.trim();
        if trimmed.is_empty() {
            return Ok(None);
        }
        self.conn
            .query_row(
                "SELECT name, firmware, serial, device_id, timezone
                 FROM device_identities WHERE lower(alias) = lower(?1) LIMIT 1",
                [trimmed],
                |row| {
                    Ok(DeviceProfile {
                        name: row.get(0)?,
                        firmware: row.get(1)?,
                        serial: row.get(2)?,
                        device_id: row.get(3)?,
                        timezone: row.get(4)?,
                        ..DeviceProfile::default()
                    })
                },
            )
            .optional()
            .map_err(Into::into)
    }

    /// Derive local-data presence from normalized records without introducing
    /// a product-specific table. User-level fused records are deliberately
    /// excluded: they cannot be attributed to one physical device.
    pub fn device_data_summary(&self, aliases: &[String]) -> Result<(bool, Option<String>)> {
        let mut normalized_aliases = Vec::new();
        for alias in aliases {
            let trimmed = alias.trim();
            if trimmed.is_empty()
                || normalized_aliases
                    .iter()
                    .any(|existing: &String| existing.eq_ignore_ascii_case(trimmed))
            {
                continue;
            }
            normalized_aliases.push(trimmed.to_string());
        }
        if normalized_aliases.is_empty() {
            return Ok((false, None));
        }

        let mut latest: Option<String> = None;
        for alias in &normalized_aliases {
            for (table, column) in [
                ("metric_samples", "timestamp"),
                ("daily_metrics", "date"),
                ("sleep_sessions", "start_time"),
                ("workouts", "start_time"),
            ] {
                let sql = format!(
                    "SELECT MAX({column}) FROM {table}
                     WHERE lower(device_id) = lower(?1)
                       AND lower(source_scope) = 'device'"
                );
                let value: Option<String> = self.conn.query_row(&sql, [alias], |row| row.get(0))?;
                if let Some(value) = value {
                    if latest
                        .as_ref()
                        .map(|current| value.as_str() > current.as_str())
                        .unwrap_or(true)
                    {
                        latest = Some(value);
                    }
                }
            }
        }
        Ok((latest.is_some(), latest))
    }

    fn harvest_device_identities(&self, payload: &serde_json::Value) -> Result<()> {
        for hint in device_identity_hints(payload) {
            self.upsert_device_identity(&hint)?;
        }
        Ok(())
    }

    fn get_latest_heart_rate_sample(&self) -> Result<Option<(i32, String)>> {
        let value: Option<(f64, String)> = self
            .conn
            .query_row(
                "SELECT value, timestamp FROM metric_samples
                 WHERE metric = 'heart_rate'
                 ORDER BY timestamp DESC,
                    CASE source_scope WHEN 'user_fused' THEN 0 WHEN 'device' THEN 1 ELSE 2 END,
                    id DESC LIMIT 1",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()?;
        Ok(value.map(|(value, timestamp)| (value.round() as i32, timestamp)))
    }

    /// 本机一共有多少条睡眠记录。
    ///
    /// 分页要它：没有总数，界面只能说「显示了 500 条」，说不出「共 2317 条」，
    /// 而用户问的恰恰是「剩下的呢」。
    pub fn count_sleep_sessions(&self) -> Result<i64> {
        self.conn
            .query_row("SELECT COUNT(*) FROM sleep_sessions", [], |row| row.get(0))
            .map_err(Into::into)
    }

    pub fn get_recent_sleep_sessions(&self, limit: usize) -> Result<Vec<SleepSession>> {
        self.sleep_sessions_page(limit, 0)
    }

    /// 一页睡眠记录，最新在前。
    ///
    /// `offset` 是这里的新东西。以前 SQL 只有 `LIMIT` 没有 `OFFSET`，所以
    /// 界面上那个 500 是硬上限而不是页大小：一个下载了全部历史的人，第 501
    /// 条之后的记录在应用里根本没有入口（Reddit p6zxyo7）。
    pub fn sleep_sessions_page(&self, limit: usize, offset: usize) -> Result<Vec<SleepSession>> {
        let limit = i64::try_from(limit).unwrap_or(i64::MAX).max(0);
        let offset = i64::try_from(offset).unwrap_or(i64::MAX).max(0);
        let mut stmt = self.conn.prepare(
            "SELECT sleep_id, start_time, end_time, score, duration_minutes,
                    deep_minutes, light_minutes, rem_minutes, rem_available, awake_minutes,
                    source_scope, device_id, synced_at, wake_count
             FROM sleep_sessions ORDER BY start_time DESC LIMIT ?1 OFFSET ?2",
        )?;
        let rows = stmt.query_map([limit, offset], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, Option<i32>>(3)?,
                row.get::<_, i32>(4)?,
                row.get::<_, i32>(5)?,
                row.get::<_, i32>(6)?,
                row.get::<_, i32>(7)?,
                row.get::<_, i64>(8)?,
                row.get::<_, i32>(9)?,
                row.get::<_, String>(10)?,
                row.get::<_, Option<String>>(11)?,
                row.get::<_, Option<String>>(12)?,
                row.get::<_, Option<i32>>(13)?,
            ))
        })?;
        let mut sessions = Vec::new();
        for row in rows {
            let (
                sleep_id,
                start,
                end,
                score,
                duration_minutes,
                deep_minutes,
                light_minutes,
                rem_minutes,
                rem_available,
                awake_minutes,
                scope,
                device_id,
                synced_at,
                wake_count,
            ) = row?;
            sessions.push(SleepSession {
                sleep_id,
                start_time: parse_datetime(&start, "sleep.start_time")?,
                end_time: parse_datetime(&end, "sleep.end_time")?,
                score,
                duration_minutes,
                deep_minutes,
                light_minutes,
                rem_minutes: (rem_available != 0).then_some(rem_minutes),
                awake_minutes,
                source_scope: parse_scope(&scope)?,
                device_id,
                synced_at: synced_at
                    .as_deref()
                    .map(|value| parse_datetime(value, "sleep.synced_at"))
                    .transpose()?,
                time_in_bed_minutes: None,
                stages: Vec::new(),
                wake_count,
            });
        }
        Ok(sessions)
    }

    pub fn get_sleep_detail(&self, sleep_id: &str) -> Result<Option<SleepSession>> {
        let row = self
            .conn
            .query_row(
                "SELECT sleep_id, start_time, end_time, score, duration_minutes,
                        deep_minutes, light_minutes, rem_minutes, rem_available, awake_minutes,
                        source_scope, device_id, synced_at, wake_count
                 FROM sleep_sessions WHERE sleep_id = ?1 LIMIT 1",
                [sleep_id],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, Option<i32>>(3)?,
                        row.get::<_, i32>(4)?,
                        row.get::<_, i32>(5)?,
                        row.get::<_, i32>(6)?,
                        row.get::<_, i32>(7)?,
                        row.get::<_, i64>(8)?,
                        row.get::<_, i32>(9)?,
                        row.get::<_, String>(10)?,
                        row.get::<_, Option<String>>(11)?,
                        row.get::<_, Option<String>>(12)?,
                        row.get::<_, Option<i32>>(13)?,
                    ))
                },
            )
            .optional()?;
        let Some((
            sleep_id,
            start,
            end,
            score,
            duration_minutes,
            deep_minutes,
            light_minutes,
            rem_minutes,
            rem_available,
            awake_minutes,
            scope,
            device_id,
            synced_at,
            wake_count,
        )) = row
        else {
            return Ok(None);
        };
        let stages = self.load_sleep_stages(&sleep_id)?;
        Ok(Some(SleepSession {
            sleep_id,
            start_time: parse_datetime(&start, "sleep.start_time")?,
            end_time: parse_datetime(&end, "sleep.end_time")?,
            score,
            duration_minutes,
            deep_minutes,
            light_minutes,
            rem_minutes: (rem_available != 0).then_some(rem_minutes),
            awake_minutes,
            source_scope: parse_scope(&scope)?,
            device_id,
            synced_at: synced_at
                .as_deref()
                .map(|value| parse_datetime(value, "sleep.synced_at"))
                .transpose()?,
            time_in_bed_minutes: None,
            stages,
            wake_count,
        }))
    }

    /// 本机一共有多少条运动记录。见 `count_sleep_sessions` 的理由。
    pub fn count_workouts(&self) -> Result<i64> {
        self.conn
            .query_row("SELECT COUNT(*) FROM workouts", [], |row| row.get(0))
            .map_err(Into::into)
    }

    pub fn get_recent_workouts(&self, limit: usize) -> Result<Vec<Workout>> {
        self.workouts_page(limit, 0)
    }

    /// 一页运动记录，最新在前。见 `sleep_sessions_page`。
    pub fn workouts_page(&self, limit: usize, offset: usize) -> Result<Vec<Workout>> {
        let limit = i64::try_from(limit).unwrap_or(i64::MAX).max(0);
        let offset = i64::try_from(offset).unwrap_or(i64::MAX).max(0);
        let mut stmt = self.conn.prepare(
            "SELECT workout_id, workout_type, start_time, end_time,
                    distance_meters, calories, avg_hr, max_hr,
                    training_load, vo2max, source_scope, device_id,
                    synced_at, gps_available, sample_count, zepp_type,
                    workout_type_source, workout_type_override
             FROM workouts ORDER BY start_time DESC LIMIT ?1 OFFSET ?2",
        )?;
        let rows = stmt.query_map([limit, offset], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, Option<f64>>(4)?,
                row.get::<_, Option<i32>>(5)?,
                row.get::<_, Option<i32>>(6)?,
                row.get::<_, Option<i32>>(7)?,
                row.get::<_, Option<f64>>(8)?,
                row.get::<_, Option<f64>>(9)?,
                row.get::<_, String>(10)?,
                row.get::<_, Option<String>>(11)?,
                row.get::<_, Option<String>>(12)?,
                row.get::<_, i64>(13)?,
                row.get::<_, i64>(14)?,
                row.get::<_, Option<i32>>(15)?,
                row.get::<_, String>(16)?,
                row.get::<_, Option<String>>(17)?,
            ))
        })?;
        // 一次读完编号别名，再在内存里套到每条记录上：表很小，比给两个大
        // SELECT 各加一个 JOIN 更不容易改错。
        let code_labels = self.workout_code_label_map()?;
        let mut workouts = Vec::new();
        for row in rows {
            let (
                workout_id,
                workout_type,
                start,
                end,
                distance_meters,
                calories,
                avg_hr,
                max_hr,
                training_load,
                vo2max,
                scope,
                device_id,
                synced_at,
                gps_available,
                sample_count,
                zepp_type,
                type_source,
                user_override,
            ) = row?;
            let effective_type = user_override
                .clone()
                .unwrap_or_else(|| workout_type.clone());
            let custom_label = zepp_type.and_then(|code| code_labels.get(&code).cloned());
            workouts.push(Workout {
                workout_id,
                workout_type: workout_type.clone(),
                normalized_type: workout_type,
                type_source,
                user_override,
                effective_type,
                custom_label,
                start_time: parse_datetime(&start, "workout.start_time")?,
                end_time: parse_datetime(&end, "workout.end_time")?,
                distance_meters,
                calories,
                avg_hr,
                max_hr,
                training_load,
                vo2max,
                // 列表视图不读这些：屏幕上只有类型、距离、时长和心率，
                // 为此把 SELECT 加宽十三列再加一个 join，代价落在每一次列表
                // 渲染上。要这些字段请走单条运动的详情查询。
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
                source_scope: parse_scope(&scope)?,
                device_id,
                synced_at: synced_at
                    .as_deref()
                    .map(|value| parse_datetime(value, "workout.synced_at"))
                    .transpose()?,
                gps_available: gps_available != 0,
                sample_count,
                zepp_source: None,
                zepp_type,
            });
        }
        Ok(workouts)
    }

    pub fn get_workout_detail(&self, workout_id: &str) -> Result<Option<Workout>> {
        let row = self
            .conn
            .query_row(
                "SELECT workout_id, workout_type, start_time, end_time,
                        distance_meters, calories, avg_hr, max_hr,
                        training_load, vo2max, source_scope, device_id,
                        synced_at, gps_available, sample_count, zepp_type,
                        workout_type_source, workout_type_override,
                        min_hr, total_steps, moving_seconds,
                        elevation_gain_m, elevation_loss_m,
                        max_altitude_m, min_altitude_m,
                        training_effect, anaerobic_training_effect, rpe,
                        avg_cadence_spm, max_cadence_spm, avg_stride_cm
                 FROM workouts WHERE workout_id = ?1 LIMIT 1",
                [workout_id],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, String>(3)?,
                        row.get::<_, Option<f64>>(4)?,
                        row.get::<_, Option<i32>>(5)?,
                        row.get::<_, Option<i32>>(6)?,
                        row.get::<_, Option<i32>>(7)?,
                        row.get::<_, Option<f64>>(8)?,
                        row.get::<_, Option<f64>>(9)?,
                        row.get::<_, String>(10)?,
                        row.get::<_, Option<String>>(11)?,
                        row.get::<_, Option<String>>(12)?,
                        row.get::<_, i64>(13)?,
                        row.get::<_, i64>(14)?,
                        row.get::<_, Option<i32>>(15)?,
                        row.get::<_, String>(16)?,
                        row.get::<_, Option<String>>(17)?,
                        (
                            row.get::<_, Option<i32>>(18)?,
                            row.get::<_, Option<i32>>(19)?,
                            row.get::<_, Option<i64>>(20)?,
                            row.get::<_, Option<f64>>(21)?,
                            row.get::<_, Option<f64>>(22)?,
                            row.get::<_, Option<f64>>(23)?,
                            row.get::<_, Option<f64>>(24)?,
                            row.get::<_, Option<f64>>(25)?,
                            row.get::<_, Option<f64>>(26)?,
                            row.get::<_, Option<i32>>(27)?,
                            row.get::<_, Option<f64>>(28)?,
                            row.get::<_, Option<f64>>(29)?,
                            row.get::<_, Option<f64>>(30)?,
                        ),
                    ))
                },
            )
            .optional()?;
        let Some((
            workout_id,
            workout_type,
            start,
            end,
            distance_meters,
            calories,
            avg_hr,
            max_hr,
            training_load,
            vo2max,
            scope,
            device_id,
            synced_at,
            gps_available,
            sample_count,
            zepp_type,
            type_source,
            user_override,
            (
                min_hr,
                total_steps,
                moving_seconds,
                elevation_gain_m,
                elevation_loss_m,
                max_altitude_m,
                min_altitude_m,
                training_effect,
                anaerobic_training_effect,
                rpe,
                avg_cadence_spm,
                max_cadence_spm,
                avg_stride_cm,
            ),
        )) = row
        else {
            return Ok(None);
        };
        let hr_zones = self.workout_hr_zones(&workout_id)?;
        let route_points: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM route_points WHERE workout_id = ?1",
            [&workout_id],
            |row| row.get(0),
        )?;
        let stored_samples: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM workout_samples WHERE workout_id = ?1",
            [&workout_id],
            |row| row.get(0),
        )?;
        let effective_type = user_override
            .clone()
            .unwrap_or_else(|| workout_type.clone());
        let custom_label = match zepp_type {
            Some(code) => self.workout_code_label_map()?.get(&code).cloned(),
            None => None,
        };
        Ok(Some(Workout {
            min_hr,
            total_steps,
            moving_seconds,
            elevation_gain_m,
            elevation_loss_m,
            max_altitude_m,
            min_altitude_m,
            training_effect,
            anaerobic_training_effect,
            rpe,
            avg_cadence_spm,
            max_cadence_spm,
            avg_stride_cm,
            hr_zones,
            workout_id,
            workout_type: workout_type.clone(),
            normalized_type: workout_type,
            type_source,
            user_override,
            effective_type,
            custom_label,
            start_time: parse_datetime(&start, "workout.start_time")?,
            end_time: parse_datetime(&end, "workout.end_time")?,
            distance_meters,
            calories,
            avg_hr,
            max_hr,
            training_load,
            vo2max,
            source_scope: parse_scope(&scope)?,
            device_id,
            synced_at: synced_at
                .as_deref()
                .map(|value| parse_datetime(value, "workout.synced_at"))
                .transpose()?,
            gps_available: gps_available != 0 || route_points > 0,
            sample_count: sample_count.max(stored_samples),
            zepp_source: None,
            zepp_type,
        }))
    }

    pub fn get_health_overview(&self) -> Result<HealthOverview> {
        let latest_heart_rate = self.get_latest_heart_rate_sample()?;
        let current_hr = latest_heart_rate.as_ref().map(|(value, _)| *value);
        let latest_heart_rate_at = latest_heart_rate.map(|(_, timestamp)| timestamp);
        let resting_hr = self.latest_daily_i32("resting_hr")?;
        let hrv = self.latest_metric_f64("hrv")?;
        let (last_updated, coverage, source_scope) = self.overview_metadata()?;
        let last_sleep_score = self
            .get_recent_sleep_sessions(1)?
            .into_iter()
            .next()
            .and_then(|sleep| sleep.score);
        Ok(HealthOverview {
            current_hr,
            resting_hr,
            hrv,
            last_sleep_score,
            readiness: self.latest_daily_f64("readiness")?,
            bio_charge: self.latest_daily_f64("bio_charge")?,
            hybrid_charge: self.latest_daily_f64("hybrid_charge")?,
            training_load: self.latest_daily_f64("training_load")?,
            vo2max: self.latest_daily_f64("vo2max")?,
            steps_today: self.latest_daily_i32_for_date("steps", Local::now().date_naive())?,
            active_calories_today: self
                .latest_daily_i32_for_date("active_calories", Local::now().date_naive())?
                .or(self.latest_daily_i32_for_date("calories", Local::now().date_naive())?),
            latest_heart_rate_at,
            last_updated,
            coverage,
            source_scope,
        })
    }

    fn overview_metadata(&self) -> Result<(Option<String>, Option<Coverage>, Option<String>)> {
        let last_updated = self.get_app_meta(LAST_CLOUD_SYNC_AT_KEY)?;
        let (start, end, stream_count, scope_count, only_scope) = self.conn.query_row(
            "SELECT MIN(day), MAX(day), COUNT(DISTINCT stream),
                    COUNT(DISTINCT source_scope), MIN(source_scope)
             FROM (
                 SELECT date(timestamp, 'localtime') AS day, metric AS stream, source_scope
                 FROM metric_samples
                 UNION ALL
                 SELECT date AS day, 'daily_summary' AS stream, source_scope FROM daily_metrics
                 UNION ALL
                 SELECT date(start_time, 'localtime') AS day, 'sleep' AS stream, source_scope
                 FROM sleep_sessions
                 UNION ALL
                 SELECT date(start_time, 'localtime') AS day, 'workouts' AS stream, source_scope
                 FROM workouts
             ) WHERE day IS NOT NULL",
            [],
            |row| {
                Ok((
                    row.get::<_, Option<String>>(0)?,
                    row.get::<_, Option<String>>(1)?,
                    row.get::<_, i64>(2)?,
                    row.get::<_, i64>(3)?,
                    row.get::<_, Option<String>>(4)?,
                ))
            },
        )?;
        let coverage = match (start, end) {
            (Some(start), Some(end)) => {
                let start_date = NaiveDate::parse_from_str(&start, "%Y-%m-%d")
                    .map_err(|error| ZeppBridgeError::ParseError(error.to_string()))?;
                let end_date = NaiveDate::parse_from_str(&end, "%Y-%m-%d")
                    .map_err(|error| ZeppBridgeError::ParseError(error.to_string()))?;
                Some(Coverage {
                    start,
                    end,
                    days: (end_date - start_date).num_days() + 1,
                    streams: stream_count,
                })
            }
            _ => None,
        };
        let source_scope = match scope_count {
            0 => None,
            1 => only_scope,
            _ => Some("mixed".to_string()),
        };
        Ok((last_updated, coverage, source_scope))
    }

    /// Non-identifying device labels for one export.
    ///
    /// Zepp addresses one physical device by several aliases — the Helio Strap
    /// is `2445B138005129` in band summaries and `D85403FFFEE4D576` in
    /// readiness events — so aliases are folded onto a single label via
    /// `device_identities`. Only the catalog's canonical model name and kind
    /// leave the machine; the serial and the user's nickname for the device
    /// never do.
    fn export_devices(&self) -> Result<ExportDevices> {
        let mut stmt = self
            .conn
            .prepare("SELECT alias, name, serial, device_id FROM device_identities")?;
        let rows = stmt.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, Option<String>>(1)?,
                row.get::<_, Option<String>>(2)?,
                row.get::<_, Option<String>>(3)?,
            ))
        })?;
        let mut groups: BTreeMap<String, (BTreeSet<String>, Option<String>)> = BTreeMap::new();
        for row in rows {
            let (alias, name, serial, device_id) = row?;
            // The serial is the stable identity of a physical device: the
            // strap's rows share `2445B138005129` but differ in device_id
            // (`2445B138005129` vs `D85403FFFEE4D576`), so keying on both
            // would report one device twice.
            let key = serial
                .clone()
                .or_else(|| device_id.clone())
                .unwrap_or_else(|| alias.clone());
            let entry = groups.entry(key).or_default();
            entry.0.insert(alias);
            if let Some(serial) = serial {
                entry.0.insert(serial);
            }
            if let Some(device_id) = device_id {
                entry.0.insert(device_id);
            }
            if entry.1.is_none() {
                entry.1 = name;
            }
        }

        let mut devices = ExportDevices::default();
        for (index, (_, (aliases, name))) in groups.into_iter().enumerate() {
            let label = format!("device_{}", index + 1);
            // The stored name is the user's nickname, so it is only ever used
            // to look the product up in the bundled catalog.
            let matched = name.as_deref().and_then(|name| {
                crate::device_catalog::match_catalog(&crate::device_catalog::CatalogMatchInput {
                    device_names: vec![name],
                    display_name: Some(name),
                    ..Default::default()
                })
            });
            devices.profiles.insert(
                label.clone(),
                ExportDeviceProfile {
                    model: matched
                        .as_ref()
                        .map(|found| found.entry.canonical_name.clone()),
                    kind: matched.as_ref().map(|found| found.entry.kind.clone()),
                },
            );
            for alias in aliases {
                devices.label_by_alias.insert(alias, label.clone());
            }
        }
        Ok(devices)
    }

    /// Locally derived analysis that needs no extra network call.
    ///
    /// Everything here is computed from data already on disk and states its own
    /// basis, so a reader can tell a measurement from a derivation.
    fn export_analysis(
        &self,
        start_text: &str,
        end_text: &str,
        selected: &BTreeSet<String>,
        workout_id: Option<&str>,
    ) -> Result<serde_json::Map<String, serde_json::Value>> {
        let mut analysis = serde_json::Map::new();

        if selected.contains("workouts") {
            if let Some(zones) = self.heart_rate_zone_variants(start_text, end_text, workout_id)? {
                analysis.insert("heart_rate_zones".into(), zones);
            }
        }

        // 训练负荷平衡是一条 28 天的窗口统计。单条运动的导出说的是「这一条」，
        // 把四周的日负荷塞进去就又变成了用户没要的范围，所以这里直接不算。
        if workout_id.is_some() {
            return Ok(analysis);
        }

        if selected.contains("training_load") || selected.contains("recovery") {
            // Acute:chronic workload ratio. The chronic window reaches 27 days
            // before the export range, so the first day in range is already
            // backed by a full window instead of ramping up from zero.
            let Some(range_start) = NaiveDate::parse_from_str(start_text, "%Y-%m-%d").ok() else {
                return Ok(analysis);
            };
            let end_date = NaiveDate::parse_from_str(end_text, "%Y-%m-%d")
                .map_err(|_| ZeppBridgeError::ConfigError("导出结束日期无效".into()))?;
            // Same computation the training screen shows, so a chart and an
            // exported file can never quote different ratios for one day.
            let balance = self.training_load_balance(range_start, end_date)?;

            if !balance.is_empty() {
                analysis.insert(
                    "training_load_balance".into(),
                    serde_json::json!({
                        "source": "daily_metrics.training_load",
                        "note": "acute = 最近 7 天负荷之和；chronic = 最近 28 天之和；ratio = acute ÷ (chronic ÷ 4)。chronic 窗口覆盖不足 21 天时不给 ratio。",
                        "days": balance,
                    }),
                );
            }
        }

        Ok(analysis)
    }

    /// Daily series for the body and training screens.
    ///
    /// Only names in `SERIES_METRICS` / `SAMPLE_ONLY_SERIES_METRICS` are
    /// answered; anything else is skipped rather than guessed at, so a typo in
    /// a caller cannot produce a chart with an invented unit.
    /// 按天聚合原始心率样本：这一天的最高、最低、平均，以及有多少个样本。
    ///
    /// 为什么不用 `daily_metrics`：Zepp 的**日**最高心率根本没有被采集进来。
    /// 库里唯一叫 `device_max_hr` 的东西来自 PAI 流的 `maxHr`，那是这块表的
    /// 最大心率**设定值**（用来划分区间的 100–240 那个数），不是当天实测的
    /// 峰值。把它当成日最高心率显示，会是又一个「界面上有个数，但它不是你
    /// 以为的那个意思」。
    ///
    /// 所以这里只做一件事：把本机存着的原始样本按天取 max。用户看到的数字
    /// 和 Zepp App 里的不一样是正常的——Zepp 会过滤，我们不过滤。
    ///
    /// **`samples` 必须一起返回。** 一天只有 12 个样本时，那个「最高值」是
    /// 12 个点里的最高，不是这一天的最高；不把样本数交出去，界面就只能把它
    /// 当成完整最大值来画，而那是在编造事实。
    ///
    /// 日期按本地时区切分：用户问的是「我那天」，不是「那个 UTC 日」。
    pub fn daily_heart_rate_extremes(&self, days: i64) -> Result<Vec<DailyHeartRateExtreme>> {
        let window_days = days.clamp(1, 1825);
        let end = Local::now().date_naive();
        let start = end - Duration::days(window_days - 1);
        // `timestamp` 存的是 RFC 3339（带偏移）。SQLite 的 `localtime` 修饰符
        // 按**本机**时区换算，这正是我们要的分日方式。
        let mut stmt = self.conn.prepare(
            "SELECT date(timestamp, 'localtime') AS day,
                    MAX(value), MIN(value), AVG(value), COUNT(*)
             FROM metric_samples
             WHERE metric = 'heart_rate'
               AND date(timestamp, 'localtime') BETWEEN ?1 AND ?2
             GROUP BY day
             ORDER BY day",
        )?;
        let rows = stmt.query_map(
            [
                start.format("%Y-%m-%d").to_string(),
                end.format("%Y-%m-%d").to_string(),
            ],
            |row| {
                Ok(DailyHeartRateExtreme {
                    date: row.get(0)?,
                    max: row.get::<_, f64>(1)?.round() as i32,
                    min: row.get::<_, f64>(2)?.round() as i32,
                    average: row.get::<_, f64>(3)?.round() as i32,
                    samples: row.get(4)?,
                })
            },
        )?;
        rows.collect::<std::result::Result<Vec<_>, _>>()
            .map_err(Into::into)
    }

    pub fn metric_series(&self, metrics: &[String], days: i64) -> Result<Vec<MetricSeries>> {
        let window_days = days.clamp(1, 1825);
        let end = Local::now().date_naive();
        let start = end - Duration::days(window_days - 1);
        let start_text = start.format("%Y-%m-%d").to_string();
        let end_text = end.format("%Y-%m-%d").to_string();

        let mut result = Vec::new();
        for metric in metrics {
            let daily = SERIES_METRICS
                .iter()
                .find(|(name, _, _)| name == metric)
                .map(|(name, source, unit)| (*name, *source, *unit));
            let sample_only = SAMPLE_ONLY_SERIES_METRICS
                .iter()
                .find(|(name, _)| name == metric)
                .map(|(name, unit)| (*name, MetricSource::Samples, *unit));
            let Some((name, source, unit)) = daily.or(sample_only) else {
                continue;
            };

            let points = match source {
                MetricSource::Daily(spread) => {
                    self.daily_metric_points(name, spread, &start_text, &end_text)?
                }
                MetricSource::Samples => self.sample_metric_points(name, &start_text, &end_text)?,
            };

            let values: Vec<f64> = points.iter().map(|point| point.value).collect();
            result.push(MetricSeries {
                metric: name.to_string(),
                unit: unit.to_string(),
                source: match source {
                    MetricSource::Daily(_) => "daily_metrics".to_string(),
                    MetricSource::Samples => "metric_samples".to_string(),
                },
                latest: points.last().cloned(),
                average: average_finite(values.iter().copied()).map(round1),
                minimum: values.iter().copied().reduce(f64::min),
                maximum: values.iter().copied().reduce(f64::max),
                days_with_data: points.len() as i64,
                window_days,
                points,
            });
        }
        Ok(result)
    }

    /// One point per calendar day from `daily_metrics`.
    ///
    /// Where the same day is reported twice — once by the account's own fused
    /// roll-up, once by the watch — the fused reading wins, the same
    /// precedence the export uses, so a chart and an export never disagree.
    fn daily_metric_points(
        &self,
        metric: &str,
        spread: Option<(&str, &str)>,
        start: &str,
        end: &str,
    ) -> Result<Vec<MetricSeriesPoint>> {
        let pick = |metric: &str| -> Result<BTreeMap<String, f64>> {
            let mut stmt = self.conn.prepare(
                "SELECT date,
                        COALESCE(
                            MAX(CASE WHEN source_scope = 'user_fused' THEN value END),
                            MAX(value)
                        )
                 FROM daily_metrics
                 WHERE metric = ?1 AND date BETWEEN ?2 AND ?3
                 GROUP BY date ORDER BY date",
            )?;
            let rows = stmt.query_map(params![metric, start, end], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, f64>(1)?))
            })?;
            let mut map = BTreeMap::new();
            for row in rows {
                let (date, value) = row?;
                map.insert(date, value);
            }
            Ok(map)
        };

        let values = pick(metric)?;
        let (minima, maxima) = match spread {
            Some((low, high)) => (pick(low)?, pick(high)?),
            None => (BTreeMap::new(), BTreeMap::new()),
        };

        Ok(values
            .into_iter()
            .map(|(date, value)| MetricSeriesPoint {
                min: minima.get(&date).copied().map(round1),
                max: maxima.get(&date).copied().map(round1),
                samples: None,
                value: round1(value),
                date,
            })
            .collect())
    }

    /// One point per local day from `metric_samples`.
    ///
    /// The day's value is the mean of its readings and the spread is the
    /// readings' own minimum and maximum — measured, not modelled. A day with
    /// one reading reports no spread rather than a zero-width one.
    fn sample_metric_points(
        &self,
        metric: &str,
        start: &str,
        end: &str,
    ) -> Result<Vec<MetricSeriesPoint>> {
        let bounds = local_day_range_utc_bounds(start, end);
        let (lower, upper) = match &bounds {
            Some((lower, upper)) => (Some(lower.as_str()), Some(upper.as_str())),
            None => (None, None),
        };
        let mut stmt = self.conn.prepare(
            "SELECT date(timestamp, 'localtime') AS day,
                    AVG(value), MIN(value), MAX(value), COUNT(*)
             FROM metric_samples
             WHERE metric = ?1
               AND (?4 IS NULL OR timestamp >= ?4)
               AND (?5 IS NULL OR timestamp < ?5)
               AND date(timestamp, 'localtime') BETWEEN ?2 AND ?3
             GROUP BY day ORDER BY day",
        )?;
        let rows = stmt.query_map(params![metric, start, end, lower, upper], |row| {
            Ok(MetricSeriesPoint {
                date: row.get(0)?,
                value: round1(row.get::<_, f64>(1)?),
                min: Some(round1(row.get::<_, f64>(2)?)),
                max: Some(round1(row.get::<_, f64>(3)?)),
                samples: Some(row.get::<_, i64>(4)?),
            })
        })?;
        Ok(rows
            .collect::<std::result::Result<Vec<_>, _>>()?
            .into_iter()
            .map(|mut point| {
                if point.samples == Some(1) {
                    point.min = None;
                    point.max = None;
                }
                point
            })
            .collect())
    }

    /// Acute (7 day) against chronic (28 day) training load.
    ///
    /// The chronic window reaches 27 days before the range so the first day
    /// asked for is already backed by a full window instead of ramping up from
    /// zero. Shared with the export so the screen and the file agree.
    pub fn training_load_balance(
        &self,
        start: NaiveDate,
        end: NaiveDate,
    ) -> Result<Vec<TrainingBalancePoint>> {
        let history_start = (start - Duration::days(27)).format("%Y-%m-%d").to_string();
        let end_text = end.format("%Y-%m-%d").to_string();
        let mut stmt = self.conn.prepare(
            "SELECT date, MAX(value) FROM daily_metrics
             WHERE metric = 'training_load' AND date BETWEEN ?1 AND ?2
             GROUP BY date ORDER BY date",
        )?;
        let rows = stmt.query_map(params![history_start, end_text], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, f64>(1)?))
        })?;
        let mut by_date: BTreeMap<String, f64> = BTreeMap::new();
        for row in rows {
            let (date, value) = row?;
            by_date.insert(date, value);
        }

        let mut balance = Vec::new();
        let mut day = start;
        while day <= end {
            let window_sum = |days: i64| -> (f64, i64) {
                let mut total = 0.0;
                let mut present = 0i64;
                for back in 0..days {
                    let key = (day - Duration::days(back)).format("%Y-%m-%d").to_string();
                    if let Some(value) = by_date.get(&key) {
                        total += *value;
                        present += 1;
                    }
                }
                (total, present)
            };
            let (acute, acute_days) = window_sum(7);
            let (chronic, chronic_days) = window_sum(28);
            let chronic_weekly = chronic / 4.0;
            let ratio = (chronic_days >= 21 && chronic_weekly > 0.0)
                .then(|| (acute / chronic_weekly * 100.0).round() / 100.0);
            balance.push(TrainingBalancePoint {
                date: day.format("%Y-%m-%d").to_string(),
                acute_7d: round1(acute),
                acute_days_with_data: acute_days,
                chronic_28d: round1(chronic),
                chronic_days_with_data: chronic_days,
                acute_chronic_ratio: ratio,
            });
            day += Duration::days(1);
        }
        Ok(balance)
    }

    /// Every heart-rate number this library actually measured.
    ///
    /// Five entries at most, each naming its table, its column and the day it
    /// was recorded. There is no age-based estimate here on purpose: 220−age
    /// would be a fabricated basis in a product that promises not to fabricate.
    pub fn heart_rate_bases(&self) -> Result<Vec<HeartRateBasis>> {
        let mut bases = Vec::new();

        let observed: Option<(i32, String)> = self
            .conn
            .query_row(
                "SELECT max_hr, start_time FROM workouts
                 WHERE max_hr IS NOT NULL AND max_hr > 0
                 ORDER BY max_hr DESC, start_time DESC LIMIT 1",
                [],
                |row| Ok((row.get::<_, i32>(0)?, row.get::<_, String>(1)?)),
            )
            .optional()?;
        if let Some((value, observed_at)) = observed {
            bases.push(HeartRateBasis {
                id: "observed_max".into(),
                kind: "max_hr".into(),
                label: "实测最高心率".into(),
                value: f64::from(value),
                unit: "bpm".into(),
                source: "max(workouts.max_hr)".into(),
                measured_at: observed_at.get(..10).map(str::to_owned),
                note: Some("本地记录到的最高心率。没跑到真正的极限时，区间会整体偏窄。".into()),
                note_count: None,
            });
        }

        for (id, metric, label, source, note) in [
            (
                "device_max",
                "device_max_hr",
                "手表自报最大心率",
                "daily_metrics.device_max_hr",
                "手表在 PAI 报文里自报的最大心率，通常来自 Zepp App 的个人设置。",
            ),
            (
                "device_resting",
                "device_resting_hr",
                "手表自报静息心率",
                "daily_metrics.device_resting_hr",
                "手表在 PAI 报文里自报的静息心率。",
            ),
            (
                "lactate_threshold",
                "lactate_threshold_hr",
                "乳酸阈值心率",
                "daily_metrics.lactate_threshold_hr",
                "手表在一次高强度跑步后测出的乳酸阈值心率。",
            ),
        ] {
            let latest: Option<(String, f64)> = self
                .conn
                .query_row(
                    "SELECT date, value FROM daily_metrics
                     WHERE metric = ?1 AND value > 0
                     ORDER BY date DESC LIMIT 1",
                    [metric],
                    |row| Ok((row.get::<_, String>(0)?, row.get::<_, f64>(1)?)),
                )
                .optional()?;
            if let Some((date, value)) = latest {
                bases.push(HeartRateBasis {
                    id: id.into(),
                    kind: if id == "lactate_threshold" {
                        "threshold_hr".into()
                    } else if id == "device_max" {
                        "max_hr".into()
                    } else {
                        "resting_hr".into()
                    },
                    label: label.into(),
                    value: round1(value),
                    unit: "bpm".into(),
                    source: source.into(),
                    measured_at: Some(date),
                    note: Some(note.into()),
                    note_count: None,
                });
            }
        }

        // The rolling resting heart rate ZeppBridge computes itself. It is an
        // average of measured days, not a model, so it carries the window it
        // was taken over instead of a single measurement date.
        let computed: Option<(f64, i64, Option<String>)> = self
            .conn
            .query_row(
                "SELECT AVG(value), COUNT(*), MAX(date) FROM daily_metrics
                 WHERE metric = 'resting_hr' AND value > 0
                   AND date >= date('now', 'localtime', '-30 day')",
                [],
                |row| {
                    Ok((
                        row.get::<_, Option<f64>>(0)?.unwrap_or_default(),
                        row.get::<_, i64>(1)?,
                        row.get::<_, Option<String>>(2)?,
                    ))
                },
            )
            .optional()?;
        if let Some((average, count, latest)) = computed {
            if count > 0 {
                bases.push(HeartRateBasis {
                    id: "computed_resting".into(),
                    kind: "resting_hr".into(),
                    label: "本地统计静息心率".into(),
                    value: average.round(),
                    unit: "bpm".into(),
                    source: "avg(daily_metrics.resting_hr)".into(),
                    measured_at: latest,
                    note: Some(format!("近 30 天里有数据的 {count} 天的平均值。")),
                    note_count: Some(count),
                });
            }
        }

        Ok(bases)
    }

    pub fn heart_rate_zone_preference(&self) -> Result<HeartRateZonePreference> {
        let Some(stored) = self.get_app_meta(HEART_RATE_ZONE_PREF_KEY)? else {
            return Ok(HeartRateZonePreference::default());
        };
        // A preference written by an older build must never block the picker.
        Ok(serde_json::from_str(&stored).unwrap_or_default())
    }

    pub fn set_heart_rate_zone_preference(
        &self,
        preference: &HeartRateZonePreference,
    ) -> Result<HeartRateZonePreference> {
        let encoded = serde_json::to_string(preference)
            .map_err(|error| ZeppBridgeError::ParseError(error.to_string()))?;
        self.set_app_meta(HEART_RATE_ZONE_PREF_KEY, &encoded)?;
        Ok(preference.clone())
    }

    /// The zone picker's whole state: measured bases, the models they can
    /// support, the user's choice, and the zones that choice produces.
    ///
    /// No model is preselected. Until someone picks one, `report` is `None`
    /// and the screen shows the choice rather than a number.
    pub fn heart_rate_zone_options(&self, days: i64) -> Result<HeartRateZoneOptions> {
        let window_days = days.clamp(1, 1825);
        let bases = self.heart_rate_bases()?;
        let has_kind = |kind: &str| bases.iter().any(|basis| basis.kind == kind);

        let models = ZONE_MODELS
            .iter()
            .map(|(id, label, formula, requires, bands)| HeartRateZoneModel {
                id: (*id).to_string(),
                label: (*label).to_string(),
                formula: (*formula).to_string(),
                requires: requires.iter().map(|kind| (*kind).to_string()).collect(),
                bands: bands
                    .iter()
                    .map(|(zone, name, low, high)| HeartRateZoneBand {
                        zone: *zone,
                        label: (*name).to_string(),
                        low_percent: *low,
                        high_percent: *high,
                    })
                    .collect(),
                available: requires.iter().all(|kind| has_kind(kind)),
            })
            .collect::<Vec<_>>();

        let preference = self.heart_rate_zone_preference()?;
        let report = self.heart_rate_zone_report(&bases, &models, &preference, window_days)?;
        Ok(HeartRateZoneOptions {
            bases,
            models,
            preference,
            report,
            window_days,
        })
    }

    fn heart_rate_zone_report(
        &self,
        bases: &[HeartRateBasis],
        models: &[HeartRateZoneModel],
        preference: &HeartRateZonePreference,
        window_days: i64,
    ) -> Result<Option<HeartRateZoneReport>> {
        let Some(model_id) = preference.model.as_deref() else {
            return Ok(None);
        };
        let Some(model) = models.iter().find(|model| model.id == model_id) else {
            return Ok(None);
        };
        let pick = |kind: &str| -> Option<&HeartRateBasis> {
            let chosen = match kind {
                "max_hr" => preference.max_basis.as_deref(),
                "resting_hr" => preference.resting_basis.as_deref(),
                "threshold_hr" => preference.threshold_basis.as_deref(),
                _ => None,
            }?;
            bases
                .iter()
                .find(|basis| basis.id == chosen && basis.kind == kind)
        };
        let mut used = Vec::new();
        for kind in &model.requires {
            let Some(basis) = pick(kind) else {
                return Ok(None);
            };
            used.push(basis.clone());
        }

        let end = Local::now().date_naive();
        let start = end - Duration::days(window_days - 1);
        let histogram = self.workout_heart_rate_histogram(
            &start.format("%Y-%m-%d").to_string(),
            &end.format("%Y-%m-%d").to_string(),
            None,
        )?;

        Ok(Some(zone_report(model, used, &histogram, window_days)))
    }

    /// Every way this library's measured numbers can be turned into zones.
    ///
    /// The export cannot silently pick one: which model a runner trains by is
    /// their decision, and this account holds two candidate maxima and two
    /// candidate resting rates. So every combination that the stored numbers
    /// support is written out, each stating the bases behind it, and
    /// `selected_model` says which one the user actually chose — `null` when
    /// they have not chosen yet.
    fn heart_rate_zone_variants(
        &self,
        start_text: &str,
        end_text: &str,
        workout_id: Option<&str>,
    ) -> Result<Option<serde_json::Value>> {
        let bases = self.heart_rate_bases()?;
        if bases.is_empty() {
            return Ok(None);
        }
        let preference = self.heart_rate_zone_preference()?;
        let histogram = self.workout_heart_rate_histogram(start_text, end_text, workout_id)?;
        let options = self.heart_rate_zone_options(1)?;

        let of_kind = |kind: &str| -> Vec<&HeartRateBasis> {
            bases.iter().filter(|basis| basis.kind == kind).collect()
        };

        let mut variants = Vec::new();
        for model in &options.models {
            if !model.available {
                continue;
            }
            let maxima = if model.requires.iter().any(|kind| kind == "max_hr") {
                of_kind("max_hr")
            } else {
                vec![]
            };
            let restings = if model.requires.iter().any(|kind| kind == "resting_hr") {
                of_kind("resting_hr")
            } else {
                vec![]
            };
            let thresholds = if model.requires.iter().any(|kind| kind == "threshold_hr") {
                of_kind("threshold_hr")
            } else {
                vec![]
            };
            let combinations: Vec<Vec<HeartRateBasis>> = match model.id.as_str() {
                "hr_reserve" => maxima
                    .iter()
                    .flat_map(|max| {
                        restings
                            .iter()
                            .map(|rest| vec![(*max).clone(), (*rest).clone()])
                            .collect::<Vec<_>>()
                    })
                    .collect(),
                "lactate_threshold" => thresholds
                    .iter()
                    .map(|threshold| vec![(*threshold).clone()])
                    .collect(),
                _ => maxima.iter().map(|max| vec![(*max).clone()]).collect(),
            };
            for used in combinations {
                let report = zone_report(model, used, &histogram, 0);
                let selected = preference.model.as_deref() == Some(model.id.as_str())
                    && report.bases.iter().all(|basis| {
                        let chosen = match basis.kind.as_str() {
                            "max_hr" => preference.max_basis.as_deref(),
                            "resting_hr" => preference.resting_basis.as_deref(),
                            _ => preference.threshold_basis.as_deref(),
                        };
                        chosen == Some(basis.id.as_str())
                    });
                variants.push(serde_json::json!({
                    "model": report.model,
                    "label": report.model_label,
                    "formula": report.formula,
                    "selected": selected,
                    "bases": report.bases.iter().map(basis_json).collect::<Vec<_>>(),
                    "zones": report.zones.iter().map(zone_json).collect::<Vec<_>>(),
                    "below_zone_1_seconds": report.below_zone_1_seconds,
                    "above_zone_5_seconds": report.above_zone_5_seconds,
                }));
            }
        }
        if variants.is_empty() {
            return Ok(None);
        }

        Ok(Some(serde_json::json!({
            "unit": "seconds",
            "source": "workout_samples",
            "selected_model": preference.model,
            "measured_bases": bases.iter().map(basis_json).collect::<Vec<_>>(),
            "note": "区间边界一律向下取整，与手表一致（乳酸阈值 175 bpm 在表上就是 113/141/154/162/173/190）。不使用 220−年龄 之类的估算，所有基准都取自本地实测值。用户没有指定模型时 selected 全为 false，这里列出的是全部可算的组合，而不是替他挑一个。",
            "models": variants,
        })))
    }

    /// Seconds spent at each recorded heart rate during workouts in a range.
    fn workout_heart_rate_histogram(
        &self,
        start: &str,
        end: &str,
        workout_id: Option<&str>,
    ) -> Result<BTreeMap<i32, i64>> {
        let mut stmt = self.conn.prepare(
            "SELECT workout_samples.heart_rate, COUNT(*)
             FROM workout_samples
             JOIN workouts ON workouts.workout_id = workout_samples.workout_id
             WHERE workout_samples.heart_rate IS NOT NULL
               AND workout_samples.heart_rate > 0
               AND date(workouts.start_time, 'localtime') BETWEEN ?1 AND ?2
               AND (?3 IS NULL OR workout_samples.workout_id = ?3)
             GROUP BY workout_samples.heart_rate",
        )?;
        let rows = stmt.query_map(params![start, end, workout_id], |row| {
            Ok((row.get::<_, i32>(0)?, row.get::<_, i64>(1)?))
        })?;
        let mut histogram = BTreeMap::new();
        for row in rows {
            let (heart_rate, seconds) = row?;
            *histogram.entry(heart_rate).or_default() += seconds;
        }
        Ok(histogram)
    }

    pub fn build_ai_export(&self, selection: &ExportSelection) -> Result<(String, usize)> {
        let scope = selection
            .resolve_scope()
            .map_err(ZeppBridgeError::ConfigError)?;
        // 「单条运动」就是这一条运动，不是这条运动当天。
        //
        // 早先的实现把它解析成「那条运动所在的那一天」，于是用户从运动详情点
        // 「交给 AI」时，界面写着只导出这一条，实际却带上了整天的心率、睡眠和
        // 日级指标。界面说的和发出去的不一样，这是产品红线。
        //
        // 现在的语义：运动列表只有这一条；逐点指标按这条运动的**实际起止时刻**
        // 截取；日级数据（睡眠、步数、日常活动等）不属于「一条运动」，直接排除
        // 并在 capabilities 里如实写明原因，而不是悄悄少给。
        let (start, end, workout_filter, workout_window) = match &scope {
            ExportScope::DateRange { start, end } => (
                NaiveDate::parse_from_str(start, "%Y-%m-%d")
                    .map_err(|_| ZeppBridgeError::ConfigError("导出开始日期无效".into()))?,
                NaiveDate::parse_from_str(end, "%Y-%m-%d")
                    .map_err(|_| ZeppBridgeError::ConfigError("导出结束日期无效".into()))?,
                None,
                None,
            ),
            ExportScope::Workout { workout_id } => {
                let (day, started_at, ended_at): (String, String, String) = self
                    .conn
                    .query_row(
                        "SELECT date(start_time, 'localtime'), start_time, end_time
                         FROM workouts WHERE workout_id = ?1",
                        params![workout_id],
                        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
                    )
                    .optional()?
                    .ok_or_else(|| {
                        ZeppBridgeError::DataUnavailable("本地库里没有这条运动记录".into())
                    })?;
                let day = NaiveDate::parse_from_str(&day, "%Y-%m-%d")
                    .map_err(|_| ZeppBridgeError::ParseError("运动记录日期无效".into()))?;
                (
                    day,
                    day,
                    Some(workout_id.clone()),
                    Some((started_at, ended_at)),
                )
            }
        };
        let single_workout = workout_filter.is_some();
        // 日级数据流：一条运动没有「昨晚睡了多久」这种字段，硬塞进来就是范围外的数据。
        // 只在 daily_metrics / sleep_sessions 里出现的类型；心率、HRV、血氧这类
        // 逐点指标不在其中，它们会按运动时段截取后照常导出。
        const DAY_LEVEL_TYPES: [&str; 9] = [
            "sleep",
            "steps",
            "daily_activity",
            "recovery",
            "training_load",
            "vo2max",
            "lactate_threshold",
            "pai",
            // 一次称重和某一条运动没有关系。单条运动的导出里不该出现
            // 「体重：0 条」这样一个只会让人困惑的类型。
            "weight",
        ];
        let allowed: BTreeSet<&str> = [
            "heart_rate",
            "hrv",
            "hrv_rmssd",
            "respiratory_rate",
            "pai",
            "lactate_threshold",
            "daily_activity",
            "sleep",
            "workouts",
            "recovery",
            "steps",
            "spo2",
            "stress",
            "training_load",
            "vo2max",
            "weight",
        ]
        .into_iter()
        .collect();
        let selected: BTreeSet<String> = selection
            .data_types
            .iter()
            .map(|value| value.trim().to_ascii_lowercase())
            .filter(|value| allowed.contains(value.as_str()))
            .collect();
        if selected.is_empty() {
            return Err(ZeppBridgeError::ConfigError(
                "请至少选择一种导出数据".into(),
            ));
        }
        let start_text = start.format("%Y-%m-%d").to_string();
        let end_text = end.format("%Y-%m-%d").to_string();
        let full = selection.detail.is_full();
        let devices = self.export_devices()?;
        // How many rows each selected type contributed, so the export can say
        // "available, 30 records" instead of silently omitting a type the user
        // ticked and leaving the reader to guess why.
        let mut produced: BTreeMap<String, usize> = BTreeMap::new();
        // Rows actually written into this export. In summary detail these are
        // far fewer than the readings behind them.
        let mut emitted: BTreeMap<String, usize> = BTreeMap::new();

        let mut metric_samples = Vec::new();
        if selected.contains("heart_rate")
            || selected.contains("hrv")
            || selected.contains("spo2")
            || selected.contains("stress")
            || selected.contains("weight")
        {
            // 单条运动范围下，逐点指标只取这条运动进行期间的采样；日期区间下
            // 仍然按整天取。两条路径共用一条 SQL，避免两处各自解释范围。
            let (window_start, window_end) = match &workout_window {
                Some((started_at, ended_at)) => {
                    (Some(started_at.as_str()), Some(ended_at.as_str()))
                }
                None => (None, None),
            };
            let mut stmt = self.conn.prepare(
                "SELECT metric, timestamp, value, unit, source_scope, device_id
                 FROM metric_samples
                 WHERE (?5 IS NULL OR timestamp >= ?5)
                   AND (?6 IS NULL OR timestamp < ?6)
                   AND date(timestamp, 'localtime') BETWEEN ?1 AND ?2
                   AND (?3 IS NULL OR timestamp >= ?3)
                   AND (?4 IS NULL OR timestamp <= ?4)
                 ORDER BY timestamp",
            )?;
            let day_bounds = local_day_range_utc_bounds(&start_text, &end_text);
            let (day_lower, day_upper) = match &day_bounds {
                Some((lower, upper)) => (Some(lower.as_str()), Some(upper.as_str())),
                None => (None, None),
            };
            let rows = stmt.query_map(
                params![
                    start_text,
                    end_text,
                    window_start,
                    window_end,
                    day_lower,
                    day_upper
                ],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, f64>(2)?,
                        row.get::<_, String>(3)?,
                        row.get::<_, String>(4)?,
                        row.get::<_, Option<String>>(5)?,
                    ))
                },
            )?;
            let mut buckets: BTreeMap<(String, String, String), HourBucket> = BTreeMap::new();
            for row in rows {
                let (metric, timestamp, value, unit, source_scope, device_id) = row?;
                let matched_type = if selected.contains(&metric) {
                    Some(metric.clone())
                } else if metric.contains("spo2") && selected.contains("spo2") {
                    Some("spo2".to_string())
                } else if metric.contains("stress") && selected.contains("stress") {
                    Some("stress".to_string())
                } else if metric.starts_with("respiratory") && selected.contains("respiratory_rate")
                {
                    Some("respiratory_rate".to_string())
                } else if metric == "hrv_rmssd" && selected.contains("hrv_rmssd") {
                    Some("hrv_rmssd".to_string())
                } else if selected.contains("weight")
                    && BODY_COMPOSITION_METRICS.contains(&metric.as_str())
                {
                    Some("weight".to_string())
                } else {
                    None
                };
                let Some(matched_type) = matched_type else {
                    continue;
                };
                *produced.entry(matched_type.clone()).or_default() += 1;
                let device_label = devices.label(device_id.as_deref());
                if !full && HOURLY_AGGREGATED_METRICS.contains(&metric.as_str()) {
                    let moment = parse_datetime(&timestamp, "metric_samples.timestamp")?;
                    let hour = moment.format("%Y-%m-%dT%H:00:00+00:00").to_string();
                    buckets
                        .entry((
                            metric.clone(),
                            device_label.clone().unwrap_or_default(),
                            hour,
                        ))
                        .or_insert_with(|| {
                            HourBucket::new(matched_type, unit, source_scope, device_label)
                        })
                        .push(value);
                } else {
                    *emitted.entry(matched_type).or_default() += 1;
                    metric_samples.push(serde_json::json!({
                        "metric": metric,
                        "timestamp": timestamp,
                        "value": value,
                        "unit": unit,
                        "source_scope": source_scope,
                        "device_label": device_label,
                    }));
                }
            }
            for ((metric, _, hour), bucket) in buckets {
                *emitted.entry(bucket.selected_type.clone()).or_default() += 1;
                metric_samples.push(bucket.render(&metric, &hour));
            }
        }

        let recovery_metrics: BTreeSet<&str> = [
            "resting_hr",
            "readiness",
            "bio_charge",
            "hybrid_charge",
            "physical_charge",
            "mental_charge",
            "physical_readiness",
            "mental_readiness",
            "hrv_readiness",
            "rhr_readiness",
            "skin_temp_readiness",
            "afib_readiness",
            "ahi_readiness",
            "training_load",
            "vo2max",
            "lactate_threshold_hr",
            "lactate_threshold_pace",
            "pai_daily",
            "pai_total",
        ]
        .into_iter()
        .collect();
        let mut daily_metrics = Vec::new();
        if !single_workout
            && (selected.contains("daily_activity")
                || selected.contains("recovery")
                || selected.contains("steps")
                || selected.contains("spo2")
                || selected.contains("stress")
                || selected.contains("training_load")
                || selected.contains("vo2max"))
        {
            let mut stmt = self.conn.prepare(
                "SELECT date, metric, value, unit, source_scope, device_id
                 FROM daily_metrics WHERE date BETWEEN ?1 AND ?2
                 ORDER BY date, metric",
            )?;
            let rows = stmt.query_map(params![start_text, end_text], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, f64>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, Option<String>>(5)?,
                ))
            })?;
            // One (date, metric) can now legitimately arrive twice: once as the
            // account-level aggregate and once from the device that measured
            // it. Fold them so a reader sees one number, and keep a differing
            // second reading as an explicit alternate rather than dropping it.
            let mut folded: BTreeMap<(String, String), DailyMetricGroup> = BTreeMap::new();
            for row in rows {
                let (date, metric, value, unit, source_scope, device_id) = row?;
                let is_recovery = recovery_metrics.contains(metric.as_str());
                let matched_type = if metric == "steps" && selected.contains("steps") {
                    Some("steps")
                } else if metric == "training_load" && selected.contains("training_load") {
                    Some("training_load")
                } else if metric == "vo2max" && selected.contains("vo2max") {
                    Some("vo2max")
                } else if (metric.contains("spo2") || metric == "blood_oxygen")
                    && selected.contains("spo2")
                {
                    Some("spo2")
                } else if metric.contains("stress") && selected.contains("stress") {
                    Some("stress")
                } else if metric.starts_with("respiratory") && selected.contains("respiratory_rate")
                {
                    Some("respiratory_rate")
                } else if metric.starts_with("lactate_threshold")
                    && selected.contains("lactate_threshold")
                {
                    Some("lactate_threshold")
                } else if metric.starts_with("pai") && selected.contains("pai") {
                    Some("pai")
                } else if metric == "hrv_rmssd" && selected.contains("hrv_rmssd") {
                    Some("hrv_rmssd")
                } else if is_recovery && selected.contains("recovery") {
                    Some("recovery")
                } else if !is_recovery && selected.contains("daily_activity") {
                    Some("daily_activity")
                } else {
                    None
                };
                let Some(matched_type) = matched_type else {
                    continue;
                };
                folded
                    .entry((date.clone(), metric.clone()))
                    .or_insert_with(|| DailyMetricGroup::new(date, metric, matched_type))
                    .push(
                        value,
                        unit,
                        source_scope,
                        devices.label(device_id.as_deref()),
                    );
            }
            for group in folded.into_values() {
                *produced.entry(group.selected_type.clone()).or_default() += 1;
                *emitted.entry(group.selected_type.clone()).or_default() += 1;
                daily_metrics.push(group.render());
            }
        }

        let mut sleep_sessions = Vec::new();
        if selected.contains("sleep") && !single_workout {
            let mut stmt = self.conn.prepare(
                "SELECT sleep_id, start_time, end_time, score, duration_minutes,
                        deep_minutes, light_minutes, rem_minutes, rem_available, awake_minutes,
                        source_scope, device_id, wake_count
                 FROM sleep_sessions
                 WHERE date(start_time, 'localtime') BETWEEN ?1 AND ?2
                 ORDER BY start_time",
            )?;
            let rows = stmt.query_map(params![start_text, end_text], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, Option<i32>>(3)?,
                    row.get::<_, i32>(4)?,
                    row.get::<_, i32>(5)?,
                    row.get::<_, i32>(6)?,
                    row.get::<_, i32>(7)?,
                    row.get::<_, i64>(8)?,
                    row.get::<_, i32>(9)?,
                    row.get::<_, String>(10)?,
                    row.get::<_, Option<String>>(11)?,
                    row.get::<_, Option<i32>>(12)?,
                ))
            })?;
            for row in rows {
                let (
                    sleep_id,
                    start_time,
                    end_time,
                    score,
                    duration_minutes,
                    deep_minutes,
                    light_minutes,
                    rem_minutes,
                    rem_available,
                    awake_minutes,
                    source_scope,
                    device_id,
                    wake_count,
                ) = row?;
                // The stage timeline is what turns "slept 7h44" into what the
                // night actually looked like. It has been in the database since
                // the sleep decoder landed but never reached an export, and it
                // is small enough to include in both detail modes.
                let stages = self
                    .load_sleep_stages(&sleep_id)?
                    .into_iter()
                    .map(|stage| {
                        serde_json::json!({
                            "stage": stage.stage,
                            "start_time": stage.start_time.to_rfc3339(),
                            "end_time": stage.end_time.to_rfc3339(),
                        })
                    })
                    .collect::<Vec<_>>();
                sleep_sessions.push(serde_json::json!({
                    "sleep_id": sleep_id,
                    "start_time": start_time,
                    "end_time": end_time,
                    "score": score,
                    "duration_minutes": duration_minutes,
                    "deep_minutes": deep_minutes,
                    "light_minutes": light_minutes,
                    "rem_minutes": (rem_available != 0).then_some(rem_minutes),
                    "awake_minutes": awake_minutes,
                    "wake_count": wake_count,
                    "source_scope": source_scope,
                    "device_label": devices.label(device_id.as_deref()),
                    "stages": stages,
                }));
            }
            produced.insert("sleep".to_string(), sleep_sessions.len());
            emitted.insert("sleep".to_string(), sleep_sessions.len());
        }

        let mut workouts = Vec::new();
        if selected.contains("workouts") {
            let mut stmt = self.conn.prepare(
                "SELECT workout_id, workout_type, start_time, end_time,
                        distance_meters, calories, avg_hr, max_hr,
                        training_load, vo2max, source_scope, device_id,
                        zepp_type, workout_type_source, workout_type_override,
                        min_hr, total_steps, moving_seconds,
                        elevation_gain_m, elevation_loss_m,
                        max_altitude_m, min_altitude_m,
                        training_effect, anaerobic_training_effect, rpe,
                        avg_cadence_spm, max_cadence_spm, avg_stride_cm
                 FROM workouts
                 WHERE date(start_time, 'localtime') BETWEEN ?1 AND ?2
                   AND (?3 IS NULL OR workout_id = ?3)
                 ORDER BY start_time",
            )?;
            let rows = stmt.query_map(params![start_text, end_text, workout_filter], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, Option<f64>>(4)?,
                    row.get::<_, Option<i32>>(5)?,
                    row.get::<_, Option<i32>>(6)?,
                    row.get::<_, Option<i32>>(7)?,
                    row.get::<_, Option<f64>>(8)?,
                    row.get::<_, Option<f64>>(9)?,
                    row.get::<_, String>(10)?,
                    row.get::<_, Option<String>>(11)?,
                    row.get::<_, Option<i32>>(12)?,
                    row.get::<_, String>(13)?,
                    row.get::<_, Option<String>>(14)?,
                    (
                        row.get::<_, Option<i32>>(15)?,
                        row.get::<_, Option<i32>>(16)?,
                        row.get::<_, Option<i64>>(17)?,
                        row.get::<_, Option<f64>>(18)?,
                        row.get::<_, Option<f64>>(19)?,
                        row.get::<_, Option<f64>>(20)?,
                        row.get::<_, Option<f64>>(21)?,
                        row.get::<_, Option<f64>>(22)?,
                        row.get::<_, Option<f64>>(23)?,
                        row.get::<_, Option<i32>>(24)?,
                        row.get::<_, Option<f64>>(25)?,
                        row.get::<_, Option<f64>>(26)?,
                        row.get::<_, Option<f64>>(27)?,
                    ),
                ))
            })?;
            for row in rows {
                let (
                    workout_id,
                    workout_type,
                    start_time,
                    end_time,
                    distance_meters,
                    calories,
                    avg_hr,
                    max_hr,
                    training_load,
                    vo2max,
                    source_scope,
                    device_id,
                    zepp_type,
                    type_source,
                    user_override,
                    (
                        min_hr,
                        total_steps,
                        moving_seconds,
                        elevation_gain_m,
                        elevation_loss_m,
                        max_altitude_m,
                        min_altitude_m,
                        training_effect,
                        anaerobic_training_effect,
                        rpe,
                        avg_cadence_spm,
                        max_cadence_spm,
                        avg_stride_cm,
                    ),
                ) = row?;
                let series = self.get_workout_series(&workout_id)?;
                let hr_zones = self.workout_hr_zones(&workout_id)?;
                let effective_type = user_override
                    .clone()
                    .unwrap_or_else(|| workout_type.clone());
                let mut workout = serde_json::json!({
                    "workout_id": workout_id,
                    "workout_type": effective_type.clone(),
                    "zepp_type": zepp_type,
                    "normalized_type": workout_type,
                    "type_source": type_source,
                    "user_override": user_override,
                    "effective_type": effective_type,
                    "start_time": start_time,
                    "end_time": end_time,
                    "distance_meters": distance_meters,
                    "calories": calories,
                    "avg_hr": avg_hr,
                    "max_hr": max_hr,
                    "training_load": training_load,
                    // 云端汇总里一直有、以前没取出来的那批。缺的仍然是 null，
                    // 不补零——导出契约的规矩没变。
                    "min_hr": min_hr,
                    "total_steps": total_steps,
                    "moving_seconds": moving_seconds,
                    "elevation_gain_m": elevation_gain_m,
                    "elevation_loss_m": elevation_loss_m,
                    "max_altitude_m": max_altitude_m,
                    "min_altitude_m": min_altitude_m,
                    "training_effect": training_effect,
                    "anaerobic_training_effect": anaerobic_training_effect,
                    "rpe": rpe,
                    "avg_cadence_spm": avg_cadence_spm,
                    "max_cadence_spm": max_cadence_spm,
                    "avg_stride_cm": avg_stride_cm,
                    "hr_zones": hr_zones,
                    "vo2max": vo2max,
                    "source_scope": source_scope,
                    "device_label": devices.label(device_id.as_deref()),
                    "sample_count": series.samples.len(),
                    "route_point_count": series.route.len(),
                    "pauses": series.pauses,
                    "splits": series.splits,
                });
                if full {
                    let samples = serde_json::to_value(series.samples)
                        .map_err(|error| ZeppBridgeError::ParseError(error.to_string()))?;
                    let route = serde_json::to_value(series.route)
                        .map_err(|error| ZeppBridgeError::ParseError(error.to_string()))?;
                    if let Some(object) = workout.as_object_mut() {
                        object.insert("samples".into(), samples);
                        object.insert("route".into(), route);
                    }
                }
                workouts.push(workout);
            }
            produced.insert("workouts".to_string(), workouts.len());
            emitted.insert("workouts".to_string(), workouts.len());
        }

        // Every ticked type gets a verdict. A type that produced nothing is
        // either not wired up yet or genuinely empty for this window, and those
        // are very different facts for whoever reads the export.
        let capabilities = selected
            .iter()
            .map(|selected_type| {
                let count = produced.get(selected_type).copied().unwrap_or(0);
                // 单条运动范围下被排除的日级数据流：必须说清是「范围之外」，
                // 而不是让它看起来像「这段时间没有数据」。
                if single_workout && DAY_LEVEL_TYPES.contains(&selected_type.as_str()) {
                    return (
                        selected_type.clone(),
                        serde_json::json!({
                            "status": "excluded_by_scope",
                            "rows_in_export": 0,
                            "note": "这是按天记录的数据，不属于「一条运动」的范围，因此没有包含在这次导出里。需要它请改用日期范围导出。",
                        }),
                    );
                }
                let raw_pending = (count == 0)
                    .then(|| {
                        RAW_PENDING_STREAMS
                            .iter()
                            .find(|(name, _)| *name == selected_type.as_str())
                            .and_then(|(_, labels)| self.count_wellness_raw(labels).ok())
                            .filter(|found| *found > 0)
                    })
                    .flatten();
                let entry = if let Some(raw_records) = raw_pending {
                    serde_json::json!({
                        "status": "raw_pending",
                        "rows_in_export": 0,
                        "raw_records": raw_records,
                        "note": "已从云端抓取并保留原始报文，但字段解析尚未在真实响应上验证，因此没有派生出结构化记录",
                    })
                } else if count == 0 {
                    serde_json::json!({
                        "status": "empty_in_range",
                        "records": 0,
                        "note": if single_workout {
                            "该数据流已接入，但这条运动进行期间没有记录"
                        } else {
                            "该数据流已接入，但这段时间没有记录"
                        },
                    })
                } else {
                    let rows = emitted.get(selected_type).copied().unwrap_or(count);
                    // In summary detail a stream is backed by far more readings
                    // than it emits rows; say both, so nobody has to reconcile
                    // "22517 records" against 423 lines of JSON.
                    serde_json::json!({
                        "status": "available",
                        "source_records": count,
                        "rows_in_export": rows,
                    })
                };
                (selected_type.clone(), entry)
            })
            .collect::<serde_json::Map<String, serde_json::Value>>();

        let device_entries = devices
            .profiles
            .iter()
            .map(|(label, profile)| {
                serde_json::json!({
                    "label": label,
                    "model": profile.model,
                    "kind": profile.kind,
                })
            })
            .collect::<Vec<_>>();

        let analysis =
            self.export_analysis(&start_text, &end_text, &selected, workout_filter.as_deref())?;

        let record_count =
            metric_samples.len() + daily_metrics.len() + sleep_sessions.len() + workouts.len();
        let detail_note = if full {
            "detail=full：逐秒运动序列与逐条心率原样导出。"
        } else {
            "detail=summary：心率按小时聚合为 min/avg/max，逐秒运动序列省略（sample_count 说明有多少条）；结构化指标全部完整。需要原始序列请用 detail=full 重新导出。"
        };
        // 范围要能被读到的人核对。日期区间就写日期区间；单条运动就写这条运动的
        // 真实起止时刻，别再让读者以为自己拿到的是一整天。
        let scope_note = match (&workout_filter, &workout_window) {
            (Some(workout_id), Some((started_at, ended_at))) => serde_json::json!({
                "kind": "workout",
                "workout_id": workout_id,
                "start_time": started_at,
                "end_time": ended_at,
                "note": "只包含这一条运动，以及它进行期间的逐点指标；按天记录的数据流不在范围内。",
            }),
            _ => serde_json::json!({
                "kind": "date_range",
                "start": start_text,
                "end": end_text,
            }),
        };
        let export = serde_json::json!({
            "schema_version": "zeppbridge.ai.v2",
            "generated_at": Utc::now().to_rfc3339(),
            "scope": scope_note,
            "date_range": { "start": start_text, "end": end_text, "timezone": "system_local" },
            "selected_types": selected,
            "detail": if full { "full" } else { "summary" },
            "record_count": record_count,
            "capabilities": capabilities,
            "devices": device_entries,
            "analysis": analysis,
            "provenance": {
                "source": "ZeppBridge local SQLite",
                "normalized": true,
                "raw_payloads_included": false,
                "note": "Missing fields are omitted or null; values are never fabricated. source_scope preserves user_fused, device, or unknown provenance. device_label is a per-export alias and is not a device identifier.",
                "detail_note": detail_note,
            },
            "data": {
                "metric_samples": metric_samples,
                "daily_metrics": daily_metrics,
                "sleep_sessions": sleep_sessions,
                "workouts": workouts,
            }
        });
        let encoded = serde_json::to_string_pretty(&export)
            .map_err(|error| ZeppBridgeError::ParseError(error.to_string()))?;
        Ok((encoded, record_count))
    }

    fn latest_metric_f64(&self, metric: &str) -> Result<Option<f64>> {
        self.conn
            .query_row(
                "SELECT value FROM metric_samples WHERE metric = ?1
                 ORDER BY timestamp DESC,
                    CASE source_scope WHEN 'user_fused' THEN 0 WHEN 'device' THEN 1 ELSE 2 END,
                    id DESC LIMIT 1",
                [metric],
                |row| row.get(0),
            )
            .optional()
            .map_err(Into::into)
    }

    fn latest_daily_f64(&self, metric: &str) -> Result<Option<f64>> {
        self.conn
            .query_row(
                "SELECT value FROM daily_metrics WHERE metric = ?1
                 ORDER BY date DESC,
                    CASE source_scope WHEN 'user_fused' THEN 0 WHEN 'device' THEN 1 ELSE 2 END,
                    id DESC LIMIT 1",
                [metric],
                |row| row.get(0),
            )
            .optional()
            .map_err(Into::into)
    }

    fn latest_daily_i32(&self, metric: &str) -> Result<Option<i32>> {
        Ok(self
            .latest_daily_f64(metric)?
            .map(|value| value.round() as i32))
    }

    fn latest_daily_i32_for_date(&self, metric: &str, date: NaiveDate) -> Result<Option<i32>> {
        self.conn
            .query_row(
                "SELECT value FROM daily_metrics WHERE metric = ?1 AND date = ?2
                 ORDER BY CASE source_scope WHEN 'user_fused' THEN 0 WHEN 'device' THEN 1 ELSE 2 END,
                          id DESC LIMIT 1",
                params![metric, date.format("%Y-%m-%d").to_string()],
                |row| row.get::<_, f64>(0),
            )
            .optional()
            .map(|value| value.map(|value| value.round() as i32))
            .map_err(Into::into)
    }

    pub fn list_data_status(&self) -> Result<Vec<DataStatus>> {
        let mut stmt = self.conn.prepare(
            "SELECT stream, status, last_sync, records_written, capability,
                    needs_reauth, message FROM sync_state ORDER BY stream",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Option<String>>(2)?,
                row.get::<_, i64>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, i64>(5)?,
                row.get::<_, Option<String>>(6)?,
            ))
        })?;
        let mut statuses = Vec::new();
        for row in rows {
            let (stream, status, last_sync, records_written, capability, needs_reauth, message) =
                row?;
            statuses.push(DataStatus {
                stream,
                status,
                last_sync: last_sync
                    .as_deref()
                    .map(|value| parse_datetime(value, "sync_state.last_sync"))
                    .transpose()?,
                records_written,
                capability,
                needs_reauth: needs_reauth != 0,
                message,
            });
        }
        Ok(statuses)
    }

    #[cfg(test)]
    #[allow(dead_code)]
    pub fn get_recent_data(&self, limit: usize) -> Result<RecentData> {
        Ok(RecentData {
            metric_samples: self.get_recent_metric_samples(limit)?,
            sleep_sessions: self.get_recent_sleep_sessions(limit)?,
            workouts: self.get_recent_workouts(limit)?,
        })
    }

    #[cfg(test)]
    #[allow(dead_code)]
    fn get_recent_metric_samples(&self, limit: usize) -> Result<Vec<MetricSample>> {
        let limit = i64::try_from(limit).unwrap_or(i64::MAX).max(0);
        let mut stmt = self.conn.prepare(
            "SELECT metric, timestamp, value, unit, source_scope, device_id
             FROM metric_samples ORDER BY timestamp DESC LIMIT ?1",
        )?;
        let rows = stmt.query_map([limit], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, f64>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, Option<String>>(5)?,
            ))
        })?;
        let mut samples = Vec::new();
        for row in rows {
            let (metric, timestamp, value, unit, scope, device_id) = row?;
            samples.push(MetricSample {
                metric,
                timestamp: parse_datetime(&timestamp, "metric_samples.timestamp")?,
                value,
                unit,
                source_scope: parse_scope(&scope)?,
                device_id,
            });
        }
        Ok(samples)
    }

    /// Backwards-compatible status update. New sync code should use the richer
    /// method below so cursor/capability information is not discarded.
    #[allow(dead_code)]
    pub fn update_sync_state(&self, stream: &str, status: &str, error: Option<&str>) -> Result<()> {
        self.update_sync_state_details(
            stream,
            None,
            status,
            error,
            error.is_some(),
            0,
            if error.is_some() {
                CapabilityStatus::Unavailable
            } else {
                CapabilityStatus::Verified
            },
            error.map(str::to_owned),
        )
    }

    #[allow(clippy::too_many_arguments)]
    pub fn update_sync_state_details(
        &self,
        stream: &str,
        cursor: Option<&str>,
        status: &str,
        error: Option<&str>,
        needs_reauth: bool,
        records_written: i64,
        capability: CapabilityStatus,
        message: Option<String>,
    ) -> Result<()> {
        let now = Utc::now().to_rfc3339();
        self.conn.execute(
            "INSERT INTO sync_state
                (stream, last_sync, cursor, status, error, needs_reauth,
                 records_written, capability, message, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?2)
             ON CONFLICT(stream) DO UPDATE SET
                last_sync = excluded.last_sync,
                cursor = excluded.cursor,
                status = excluded.status,
                error = excluded.error,
                needs_reauth = excluded.needs_reauth,
                records_written = excluded.records_written,
                capability = excluded.capability,
                message = excluded.message,
                updated_at = excluded.updated_at",
            params![
                stream,
                now,
                cursor,
                status,
                error,
                if needs_reauth { 1 } else { 0 },
                records_written,
                capability.as_str(),
                message,
            ],
        )?;
        Ok(())
    }

    #[allow(dead_code)]
    pub fn get_sync_state(&self, stream: &str) -> Result<Option<SyncStateInfo>> {
        let row = self
            .conn
            .query_row(
                "SELECT stream, last_sync, cursor, status, error, needs_reauth,
                        records_written, capability, message, updated_at
                 FROM sync_state WHERE stream = ?1",
                [stream],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, Option<String>>(1)?,
                        row.get::<_, Option<String>>(2)?,
                        row.get::<_, String>(3)?,
                        row.get::<_, Option<String>>(4)?,
                        row.get::<_, i64>(5)?,
                        row.get::<_, i64>(6)?,
                        row.get::<_, String>(7)?,
                        row.get::<_, Option<String>>(8)?,
                        row.get::<_, String>(9)?,
                    ))
                },
            )
            .optional()?;
        row.map(
            |(
                stream,
                last_sync,
                cursor,
                status,
                error,
                needs_reauth,
                records_written,
                capability,
                message,
                updated_at,
            )| {
                Ok(SyncStateInfo {
                    stream,
                    last_sync: last_sync
                        .as_deref()
                        .map(|value| parse_datetime(value, "sync_state.last_sync"))
                        .transpose()?,
                    cursor,
                    status,
                    error,
                    needs_reauth: needs_reauth != 0,
                    records_written,
                    capability,
                    message,
                    updated_at: parse_datetime(&updated_at, "sync_state.updated_at")?,
                })
            },
        )
        .transpose()
    }

    /// 把还没压缩的历史报文压掉，返回压缩前后的字节数。
    ///
    /// 新写入的报文一进库就是压缩的，这个方法只管**装这一版之前**攒下来的
    /// 存量。它是一次性的维护动作，不在同步路径上跑：老库里可能有上千条、
    /// 上 GB 的报文，压一遍要读写一整轮，不该让一次普通同步顺手做这件事。
    ///
    /// 安全边界：**先解压回来比对，一模一样才落库**。原始报文是重放的唯一
    /// 依据，压坏一条就等于永久丢一条——宁可这一条不压。
    pub fn compact_raw_payloads(&self) -> Result<RawPayloadCompaction> {
        let _guard = CompactionGuard::enter();
        let pending: Vec<(i64, String)> = {
            let mut stmt = self.conn.prepare(
                "SELECT id, payload FROM raw_records
                 WHERE (payload_zip IS NULL OR LENGTH(payload_zip) = 0)
                   AND LENGTH(payload) > ?1
                 ORDER BY id",
            )?;
            let rows = stmt.query_map([MIN_COMPRESSIBLE_PAYLOAD_BYTES], |row| {
                Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
            })?;
            rows.collect::<std::result::Result<Vec<_>, _>>()?
        };

        let mut report = RawPayloadCompaction::default();
        for (id, payload) in pending {
            let original = payload.len() as u64;
            let Ok(compressed) = compress_payload(&payload) else {
                report.skipped += 1;
                continue;
            };
            // 压不小就别费这个事，也别冒风险。
            if compressed.len() as u64 >= original {
                report.skipped += 1;
                continue;
            }
            match decompress_payload(&compressed) {
                Ok(round_tripped) if round_tripped == payload => {}
                _ => {
                    report.skipped += 1;
                    continue;
                }
            }
            self.conn.execute(
                "UPDATE raw_records SET payload = '', payload_zip = ?2 WHERE id = ?1",
                params![id, compressed],
            )?;
            report.compacted += 1;
            report.bytes_before += original;
            report.bytes_after += compressed.len() as u64;
        }

        // 压缩腾出来的是**数据库内部**的空闲页：不 VACUUM 的话，磁盘上的文件
        // 一个字节都不会小，用户看不到任何变化。VACUUM 会重建整个文件，过程中
        // 需要差不多一倍的临时空间，所以只在真的压过东西时才做，而且失败不算
        // 整件事失败——数据已经压好了，文件没缩只是没拿到那份收益。
        if report.compacted > 0 {
            if let Err(error) = self.conn.execute_batch("VACUUM") {
                tracing::warn!("压缩后 VACUUM 失败，磁盘占用暂时不会下降: {error}");
            }
        }
        Ok(report)
    }

    /// 还有多少条**值得压**的历史报文。用来决定要不要在启动后台跑一次。
    ///
    /// 门槛必须和 [`compact_raw_payloads`] 用的是同一个，否则会出现这样的循环：
    /// 计数说「还有 10 条待压」→ 界面弹出「正在压缩」→ 压缩函数发现这 10 条
    /// 压完反而更大、全部跳过 → 下次启动同样的 10 条又被算成待压。
    /// 实测就踩了：库里十条 `{"items":[]}`（12 字节的空响应）让横幅每次启动
    /// 都要闪一下。
    pub fn pending_raw_payload_count(&self) -> Result<i64> {
        self.conn
            .query_row(
                "SELECT COUNT(*) FROM raw_records
                 WHERE (payload_zip IS NULL OR LENGTH(payload_zip) = 0)
                   AND LENGTH(payload) > ?1",
                [MIN_COMPRESSIBLE_PAYLOAD_BYTES],
                |row| row.get(0),
            )
            .map_err(Into::into)
    }

    pub fn cleanup_old_data(&self, days: i64) -> Result<()> {
        if !(1..=365).contains(&days) {
            return Err(ZeppBridgeError::ConfigError(
                "retention 天数必须在 1..=365".into(),
            ));
        }
        let cutoff = Utc::now() - chrono::Duration::days(days);
        let cutoff_timestamp = cutoff.to_rfc3339();
        let cutoff_date = cutoff.date_naive().format("%Y-%m-%d").to_string();
        self.conn.execute(
            "DELETE FROM metric_samples WHERE timestamp < ?1",
            [&cutoff_timestamp],
        )?;
        self.conn
            .execute("DELETE FROM daily_metrics WHERE date < ?1", [&cutoff_date])?;
        self.conn.execute(
            "DELETE FROM sleep_sessions WHERE start_time < ?1",
            [&cutoff_timestamp],
        )?;
        self.conn.execute(
            "DELETE FROM workouts WHERE start_time < ?1",
            [&cutoff_timestamp],
        )?;
        self.conn.execute(
            "DELETE FROM workout_samples WHERE timestamp < ?1",
            [&cutoff_timestamp],
        )?;
        self.conn.execute(
            "DELETE FROM route_points WHERE timestamp < ?1",
            [&cutoff_timestamp],
        )?;
        self.conn.execute(
            "DELETE FROM workout_pauses WHERE start_time < ?1",
            [&cutoff_timestamp],
        )?;
        self.conn.execute(
            "DELETE FROM workout_splits WHERE start_time < ?1",
            [&cutoff_timestamp],
        )?;
        // Raw responses are retained from their fetch time, not their query
        // window start. A 30-day request naturally starts near the retention
        // cutoff and must not be deleted seconds after it is fetched.
        self.conn.execute(
            "DELETE FROM raw_records
             WHERE fetched_at < ?1
               AND NOT EXISTS (SELECT 1 FROM metric_samples m WHERE m.raw_record_id = raw_records.id)
               AND NOT EXISTS (SELECT 1 FROM daily_metrics d WHERE d.raw_record_id = raw_records.id)
               AND NOT EXISTS (SELECT 1 FROM sleep_sessions s WHERE s.raw_record_id = raw_records.id)
               AND NOT EXISTS (SELECT 1 FROM workouts w WHERE w.raw_record_id = raw_records.id)",
            [&cutoff_timestamp],
        )?;
        self.conn
            .execute_batch("PRAGMA wal_checkpoint(TRUNCATE); PRAGMA incremental_vacuum;")?;
        Ok(())
    }

    pub fn persist_fetched_record(&self, record: &RawRecord) -> Result<(i64, NormalizationCounts)> {
        self.conn.execute("BEGIN IMMEDIATE", [])?;
        let outcome = (|| {
            let raw_id = self.insert_raw_record(record)?;
            let counts = self.normalize_and_persist_raw(
                raw_id,
                &record.stream,
                &record.source_key,
                &record.payload,
            )?;
            Ok((raw_id, counts))
        })();
        match outcome {
            Ok(value) => {
                self.conn.execute("COMMIT", [])?;
                Ok(value)
            }
            Err(error) => {
                let _ = self.conn.execute("ROLLBACK", []);
                Err(error)
            }
        }
    }

    #[cfg(test)]
    pub fn count_metric_samples(&self) -> Result<i64> {
        self.conn
            .query_row("SELECT COUNT(*) FROM metric_samples", [], |row| row.get(0))
            .map_err(Into::into)
    }

    #[cfg(test)]
    #[allow(dead_code)]
    pub fn count_raw_records(&self) -> Result<i64> {
        self.conn
            .query_row("SELECT COUNT(*) FROM raw_records", [], |row| row.get(0))
            .map_err(Into::into)
    }
}

fn push_alias(aliases: &mut Vec<String>, value: Option<String>) {
    if let Some(value) = value {
        let trimmed = value.trim();
        if trimmed.is_empty() || looks_like_firmware_version(trimmed) {
            return;
        }
        if !aliases.iter().any(|existing| existing == trimmed) {
            aliases.push(trimmed.to_string());
        }
    }
}

/// 这个值看起来是不是一个固件版本号，而不是设备标识。
///
/// 起因：有用户报告侧边栏里冒出三个点不动也删不掉的「未识别数据源」，标签是
/// `0.91.20.5`、`0.91.17.5`。那不是设备，那是固件版本——Zepp 某些报文里
/// `deviceId` / `sn` 位置上放的就是这种字符串，而 `device_identity_hints` 只
/// 认字段名不看值，于是每一个版本号都变成了一台「设备」，固件一升级就再多一
/// 台。
///
/// 判据取自真实数据的形状差异，不是猜的：本地库里真实的设备标识是十六进制
/// MAC（`D8803CFFFEC19AC6`）、纯数字序列号（`23229501001311`）或产品码
/// （`PRUC72 070007001c`）——没有一个带点；而同一张表里的 `firmware` 列长
/// 成 `0.116.137.19`、`0.132.139.2`、`V0.54.131.3`。所以「可选的 V/v 前缀 +
/// 至少三段纯数字」这个形状只会命中版本号。
///
/// 刻意收得很紧：宁可漏掉一个没见过的假设备，也不能把某个厂商真的用点分十进
/// 制当序列号的设备判成幽灵后再也进不来。
pub fn looks_like_firmware_version(value: &str) -> bool {
    let body = value.strip_prefix(['V', 'v']).unwrap_or(value);
    let mut segments = 0usize;
    for segment in body.split('.') {
        if segment.is_empty() || !segment.bytes().all(|byte| byte.is_ascii_digit()) {
            return false;
        }
        segments += 1;
    }
    segments >= 3
}

fn string_field(value: &serde_json::Value, keys: &[&str]) -> Option<String> {
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

fn firmware_from_bind_device(raw: &str) -> Option<String> {
    raw.split(':')
        .next_back()
        .map(str::trim)
        .filter(|value| value.chars().any(|ch| ch.is_ascii_digit()) && value.contains('.'))
        .map(str::to_string)
}

fn collect_objects<'a>(value: &'a serde_json::Value, out: &mut Vec<&'a serde_json::Value>) {
    match value {
        serde_json::Value::Array(items) => {
            for item in items {
                collect_objects(item, out);
            }
        }
        serde_json::Value::Object(object) => {
            out.push(value);
            for key in ["data", "items", "records", "results", "list", "summary"] {
                if let Some(child) = object.get(key) {
                    collect_objects(child, out);
                }
            }
        }
        _ => {}
    }
}

fn device_identity_hints(payload: &serde_json::Value) -> Vec<DeviceIdentityHint> {
    let mut objects = Vec::new();
    collect_objects(payload, &mut objects);
    let mut hints = Vec::new();
    for object in objects {
        let mut aliases = Vec::new();
        push_alias(
            &mut aliases,
            string_field(object, &["device_id", "deviceId", "deviceid"]),
        );
        push_alias(
            &mut aliases,
            string_field(object, &["sn", "serial", "serialNumber"]),
        );
        if aliases.is_empty() {
            continue;
        }
        let bind = string_field(object, &["bind_device", "bindDevice"]);
        // `device_id` 和 `serial` 也要过同一道闸：`upsert_device_identity` 会把
        // 这两个值本身也当成别名写进去，只拦 `aliases` 拦不住它们。
        hints.push(DeviceIdentityHint {
            device_id: string_field(object, &["device_id", "deviceId", "deviceid"])
                .filter(|value| !looks_like_firmware_version(value)),
            serial: string_field(object, &["sn", "serial", "serialNumber"])
                .filter(|value| !looks_like_firmware_version(value)),
            firmware: bind.as_deref().and_then(firmware_from_bind_device),
            timezone: string_field(object, &["syncedTimezone", "timezone", "tz"]).filter(|value| {
                value.contains('/') || value.chars().any(|ch| ch.is_ascii_alphabetic())
            }),
            name: string_field(object, &["displayName", "deviceName", "productName"]),
            aliases,
        });
    }
    hints
}

fn parse_datetime(value: &str, field: &str) -> Result<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(value)
        .map(|dt| dt.with_timezone(&Utc))
        .map_err(|error| ZeppBridgeError::ParseError(format!("{field} 无效: {error}")))
}

fn parse_scope(value: &str) -> Result<SourceScope> {
    match value.trim_matches('"') {
        "user_fused" | "UserFused" => Ok(SourceScope::UserFused),
        "device" | "Device" => Ok(SourceScope::Device),
        "unknown" | "Unknown" => Ok(SourceScope::Unknown),
        other => serde_json::from_str::<SourceScope>(value)
            .map_err(|_| ZeppBridgeError::ParseError(format!("source_scope 无效: {other}"))),
    }
}

fn format_bytes(bytes: u64) -> String {
    if bytes >= 1_073_741_824 {
        format!("{:.1} GB", bytes as f64 / 1_073_741_824.0)
    } else if bytes >= 1_048_576 {
        format!("{:.0} MB", bytes as f64 / 1_048_576.0)
    } else {
        format!("{bytes} B")
    }
}

fn disk_free_bytes(path: &std::path::Path) -> Option<u64> {
    #[cfg(windows)]
    {
        use std::os::windows::ffi::OsStrExt;
        #[link(name = "kernel32")]
        extern "system" {
            fn GetDiskFreeSpaceExW(
                directory: *const u16,
                free_bytes_available: *mut u64,
                total_bytes: *mut u64,
                total_free_bytes: *mut u64,
            ) -> i32;
        }
        let mut wide: Vec<u16> = path.as_os_str().encode_wide().collect();
        wide.push(0);
        let mut free = 0u64;
        let ok = unsafe {
            GetDiskFreeSpaceExW(
                wide.as_ptr(),
                &mut free,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
            )
        };
        (ok != 0).then_some(free)
    }
    // macOS / Linux 走 statvfs。
    //
    // 这里以前直接返回 None，于是每台 Mac 上 `free_bytes` 恒为 0，补拉估算永远
    // 只会说「未能读取磁盘剩余空间」——既给不出占用预估，`allow_long_history`
    // 也拿不到判断依据。README 里写着支持 macOS，这一条就不能只在 Windows 上成立。
    #[cfg(not(windows))]
    {
        use std::ffi::CString;
        use std::os::unix::ffi::OsStrExt;

        let c_path = CString::new(path.as_os_str().as_bytes()).ok()?;
        let mut stat: libc::statvfs = unsafe { std::mem::zeroed() };
        if unsafe { libc::statvfs(c_path.as_ptr(), &mut stat) } != 0 {
            return None;
        }
        // f_bavail 是**非特权用户**真正能用的块数；f_bfree 含保留给 root 的部分，
        // 拿它报给用户会偏大。f_frsize 为 0 的文件系统退回 f_bsize。
        let block = if stat.f_frsize > 0 {
            stat.f_frsize
        } else {
            stat.f_bsize
        };
        if block == 0 {
            return None;
        }
        // 中间走 u128。
        //
        // 这些字段的宽度随平台变：macOS 上 fsblkcnt_t 是 u32、c_ulong 是 u64，
        // Linux 上两个都是 u64。所以「转成 u64」这件事在一个平台上是必要的、
        // 在另一个平台上就是多余的——`as u64` 会被 unnecessary_cast 判错，
        // `u64::from` 会被 useless_conversion 判错，而 CI 是 `-D warnings`，
        // 两种写法都至少在一个平台上过不去。
        //
        // 转到 u128 则在任何平台上都是真实的加宽，没有哪条 lint 能说它多余；
        // 顺带把「块数乘块大小」可能溢出这件事也一并解决了。
        let free = u128::from(stat.f_bavail) * u128::from(block);
        u64::try_from(free).ok()
    }
}

fn workout_id_from_detail_key(source_key: &str) -> Option<String> {
    let rest = source_key.strip_prefix("workout_detail:")?;
    let (workout_id, _) = rest.split_once(':')?;
    if workout_id.is_empty() {
        None
    } else {
        Some(workout_id.to_owned())
    }
}

/// 原始报文的压缩与还原。
///
/// 原始报文是这个库里最占地方的东西：一个用过一年的账号，两千多条
/// `raw_records` 就能吃掉一 GB 出头。它们是 JSON 文本，deflate 之后大约只剩
/// 五分之一，而且解压的代价只在重放时付一次——重放本来就是分钟级的操作。
///
/// 压的是 `serde_json::to_string` 出来的那串字节，还回来必须一模一样：重放、
/// 校验和、导出都依赖这一点，所以 [`decode_raw_payload`] 之后不做任何「修补」。
/// 小于这个字节数的报文不压。
///
/// zlib 自己就有十几字节的头，几百字节以下压不出什么名堂，甚至会更大
/// （空响应 `{"items":[]}` 只有 12 字节，压完反而变长）。省下的那点空间不值
/// 得为它维护「压过但没变小」这种状态。
const MIN_COMPRESSIBLE_PAYLOAD_BYTES: i64 = 512;

fn compress_payload(payload: &str) -> Result<Vec<u8>> {
    use flate2::write::ZlibEncoder;
    use flate2::Compression;
    use std::io::Write;

    let mut encoder = ZlibEncoder::new(Vec::new(), Compression::default());
    encoder
        .write_all(payload.as_bytes())
        .map_err(|error| ZeppBridgeError::ParseError(format!("压缩原始报文失败: {error}")))?;
    encoder
        .finish()
        .map_err(|error| ZeppBridgeError::ParseError(format!("压缩原始报文失败: {error}")))
}

fn decompress_payload(bytes: &[u8]) -> Result<String> {
    use flate2::read::ZlibDecoder;
    use std::io::Read;

    let mut decoder = ZlibDecoder::new(bytes);
    let mut out = String::new();
    decoder
        .read_to_string(&mut out)
        .map_err(|error| ZeppBridgeError::ParseError(format!("解压原始报文失败: {error}")))?;
    Ok(out)
}

/// 取出一条原始报文。
///
/// 压缩是后加的，老库里的行仍然是明文 `payload`，而且**永远**要能读——所以
/// 这里两种形态都认，压缩的优先。
fn decode_raw_payload(payload: String, payload_zip: Option<Vec<u8>>) -> Result<String> {
    match payload_zip {
        Some(bytes) if !bytes.is_empty() => decompress_payload(&bytes),
        _ => Ok(payload),
    }
}

/// 把「本地日期区间」换成一对可以直接比字符串的 UTC 时间戳边界。
///
/// `metric_samples.timestamp` 存的是 RFC3339 UTC（统一以 `+00:00` 结尾），所以
/// 字典序就是时间序。问题出在过滤条件上：`date(timestamp,'localtime')` 是个函数
/// 调用，SQLite 没法拿它去索引里做区间定位，只能把这个 metric 的**全部**采样扫
/// 一遍——一年的心率就是二十多万行，只为了挑出七天。
///
/// 加一层宽松的时间戳边界，索引就能先把范围缩到几天（实测心率 7 天 92ms → 5ms）。
/// 边界各放宽一天，覆盖任何时区偏移（-12..+14 小时），所以它只负责「少扫一点」，
/// 不改变结果：真正决定哪一天算哪一天的，仍然是后面那个 `date(...,'localtime')`。
fn local_day_range_utc_bounds(start: &str, end: &str) -> Option<(String, String)> {
    let start = NaiveDate::parse_from_str(start, "%Y-%m-%d").ok()?;
    let end = NaiveDate::parse_from_str(end, "%Y-%m-%d").ok()?;
    let lower = (start - Duration::days(1))
        .format("%Y-%m-%dT00:00:00")
        .to_string();
    let upper = (end + Duration::days(2))
        .format("%Y-%m-%dT00:00:00")
        .to_string();
    Some((lower, upper))
}

#[cfg(test)]
mod tests {

    /// 云端的业务错误码要能一路走到诊断报告里。
    ///
    /// 这条链路上每一环以前都在，只差最后一步：`classify_business_code` 能认出
    /// 「HTTP 200 但云端说不成功」，provenance 也把它归成了单独一类，但那个
    /// code 只进了一句给人看的中文，诊断报告里一个字都没有。
    #[test]
    fn a_cloud_rejection_code_reaches_the_diagnostic_report() {
        use crate::storage::provenance::{Stage, StageErrorKind, StageOutcome};

        let dir = std::env::temp_dir().join("zeppbridge-cloud-rejection-code");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let db = Database::open_migrated(&dir.join("zepp.db")).unwrap();

        assert_eq!(db.diagnostic_cloud_rejection().unwrap(), None);

        // 先来一条不带 code 的普通失败：它不该被当成业务拒绝上报。
        db.record_stream_stage(
            "sleep",
            Stage::Fetch,
            &StageOutcome::Failed {
                kind: StageErrorKind::Network,
                message: Some("连接超时".into()),
            },
        )
        .unwrap();
        assert_eq!(db.diagnostic_cloud_rejection().unwrap(), None);

        db.record_stream_stage(
            "workouts",
            Stage::Fetch,
            &StageOutcome::Failed {
                kind: StageErrorKind::CloudRejected { code: -1 },
                message: Some("Zepp 云端拒绝了这次请求（code -1）".into()),
            },
        )
        .unwrap();

        let rejection = db
            .diagnostic_cloud_rejection()
            .unwrap()
            .expect("业务拒绝应当能被读回来");
        assert_eq!(rejection.stream, "workouts");
        assert_eq!(rejection.code, -1);
        assert!(rejection.at.is_some());

        // 同一条流后来成功了，就不能再拿旧的 code 去烦收报告的人。
        db.record_stream_stage("workouts", Stage::Fetch, &StageOutcome::Ok)
            .unwrap();
        assert_eq!(db.diagnostic_cloud_rejection().unwrap(), None);

        drop(db);
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// 跑完迁移，版本号必须停在 `CURRENT_SCHEMA_VERSION`。
    ///
    /// `migrate_steps` 是一条平铺的历史，中间会把 `user_version` 先写成 5（第
    /// 319 行那句不在任何守卫里）再一路盖回 19。只要整个 `migrate()` 还包在
    /// 一个事务里，这个中间态就对外不存在。这个测试看着的就是那个事务：
    /// 哪天有人把 `BEGIN IMMEDIATE` 拆了、或者往后面加了一步却忘了推版本号，
    /// 这里会红——而不是等用户的 CLI 报「本机数据库还是 v5」。
    #[test]
    fn migrating_twice_leaves_the_version_at_the_current_schema() {
        let dir = std::env::temp_dir().join("zeppbridge-migration-version-invariant");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("zepp.db");

        let read_version = |db: &Database| -> i64 {
            db.conn
                .query_row("PRAGMA user_version", [], |row| row.get(0))
                .unwrap()
        };

        {
            let db = Database::open_migrated(&path).expect("新库应当能建起来");
            assert_eq!(read_version(&db), CURRENT_SCHEMA_VERSION);
        }
        // 再跑一遍。旧路径下这一遍会把 v19 的库从 5 重新盖到 19；
        // 落定的结果不允许因此变。
        {
            let db = Database::open_migrated(&path).expect("重复升级应当无害");
            assert_eq!(read_version(&db), CURRENT_SCHEMA_VERSION);
        }
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// 已经落库的幽灵设备要被迁移删掉，真设备一行不能少。
    ///
    /// 光在写入侧加闸不够：报告者库里那三行已经存在了，而界面上没有任何入口
    /// 能删它们（点击无反应）。不清库的话，装了新版依然天天看见。
    #[test]
    fn migration_removes_firmware_shaped_devices_and_keeps_real_ones() {
        let dir = std::env::temp_dir().join("zeppbridge-phantom-device-cleanup");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("zepp.db");

        // 先建一个已升级的库，再往里塞进旧版本会写出来的那些行。
        {
            let db = Database::open_migrated(&path).unwrap();
            for (alias, name) in [
                ("0.91.20.5", None),
                ("0.91.17.5", None),
                ("V0.54.131.3", None),
                ("D8803CFFFEC19AC6", Some("T-Rex 3")),
                ("23229501001311", Some("T-Rex 3")),
                ("PRUC72 070007001c", None),
            ] {
                db.conn
                    .execute(
                        "INSERT OR REPLACE INTO device_identities
                            (alias, name, updated_at) VALUES (?1, ?2, ?3)",
                        rusqlite::params![alias, name, "2026-09-02T00:00:00Z"],
                    )
                    .unwrap();
            }
            // 把版本退回去，让下一次打开重新跑一遍清理那一步。
            db.conn.execute_batch("PRAGMA user_version = 17;").unwrap();
        }

        let db = Database::open_migrated(&path).expect("升级应当成功");
        let mut stmt = db
            .conn
            .prepare("SELECT alias FROM device_identities ORDER BY alias")
            .unwrap();
        let aliases: Vec<String> = stmt
            .query_map([], |row| row.get::<_, String>(0))
            .unwrap()
            .filter_map(std::result::Result::ok)
            .collect();

        assert_eq!(
            aliases,
            vec![
                "23229501001311".to_string(),
                "D8803CFFFEC19AC6".to_string(),
                "PRUC72 070007001c".to_string(),
            ],
            "固件版本号那三行要没了，真设备一行不能少"
        );
    }

    /// 固件版本号不是设备标识。
    ///
    /// 真实数据的形状对照（取自本地库 `device_identities`）：
    ///   设备标识 → `D8803CFFFEC19AC6`（十六进制 MAC）、`23229501001311`
    ///              （纯数字序列号）、`PRUC72 070007001c`（产品码）
    ///   固件     → `0.116.137.19`、`0.132.139.2`、`V0.54.131.3`
    #[test]
    fn firmware_versions_are_not_mistaken_for_devices() {
        // 用户报的那三个幽灵「设备」。
        assert!(looks_like_firmware_version("0.91.20.5"));
        assert!(looks_like_firmware_version("0.91.17.5"));
        // 本地库里真实存在的固件字符串。
        assert!(looks_like_firmware_version("0.116.137.19"));
        assert!(looks_like_firmware_version("0.132.139.2"));
        assert!(looks_like_firmware_version("V0.54.131.3"));

        // 真实的设备标识一个都不能被误伤。
        assert!(!looks_like_firmware_version("D8803CFFFEC19AC6"));
        assert!(!looks_like_firmware_version("23229501001311"));
        assert!(!looks_like_firmware_version("PRUC72 070007001c"));
        assert!(!looks_like_firmware_version("2445B138005129"));
        assert!(!looks_like_firmware_version("F75C87FFFE3A9B28"));

        // 两段不算：判据要求至少三段，免得把某些点分的序列号扫进来。
        assert!(!looks_like_firmware_version("1.2"));
        assert!(!looks_like_firmware_version(""));
        assert!(!looks_like_firmware_version("1..2.3"));
        assert!(!looks_like_firmware_version("1.2.3a"));
    }

    /// 幽灵设备不该被记成一台设备。
    #[test]
    fn a_firmware_shaped_device_id_produces_no_identity() {
        let payload = serde_json::json!({
            "items": [
                { "deviceId": "0.91.20.5", "displayName": "Bip 6" },
                { "deviceId": "D8803CFFFEC19AC6", "sn": "23229501001311" }
            ]
        });
        let hints = device_identity_hints(&payload);
        let aliases: Vec<String> = hints.iter().flat_map(|h| h.aliases.clone()).collect();

        assert!(
            !aliases.iter().any(|a| a == "0.91.20.5"),
            "固件版本号不能变成设备别名，实际拿到：{aliases:?}"
        );
        assert!(aliases.iter().any(|a| a == "D8803CFFFEC19AC6"));
        assert!(aliases.iter().any(|a| a == "23229501001311"));
    }

    /// 真设备旁边混进一个固件形状的 `sn` 时，设备本身仍要留下，
    /// 但那个假 `serial` 不能被记进去。
    #[test]
    fn a_firmware_shaped_serial_does_not_poison_a_real_device() {
        let payload = serde_json::json!({
            "items": [{ "deviceId": "D8803CFFFEC19AC6", "sn": "0.91.20.5" }]
        });
        let hints = device_identity_hints(&payload);

        assert_eq!(hints.len(), 1);
        assert_eq!(hints[0].device_id.as_deref(), Some("D8803CFFFEC19AC6"));
        assert_eq!(
            hints[0].serial, None,
            "固件形状的 sn 不能落进 serial —— upsert 会把它也当成别名写进去"
        );
        assert!(!hints[0].aliases.iter().any(|a| a == "0.91.20.5"));
    }
    use super::*;

    fn ts() -> DateTime<Utc> {
        DateTime::from_timestamp(1_700_000_000, 0).unwrap()
    }

    fn export_selection(types: &[&str], detail: ExportDetail) -> ExportSelection {
        ExportSelection {
            scope: Some(ExportScope::date_range("2023-11-01", "2023-11-30")),
            start_date: None,
            end_date: None,
            data_types: types.iter().map(|value| value.to_string()).collect(),
            detail,
        }
    }

    fn workout_with_type(code: Option<i32>, normalized: &str, source: &str) -> Workout {
        Workout {
            workout_id: "same-workout".into(),
            workout_type: normalized.into(),
            normalized_type: normalized.into(),
            type_source: source.into(),
            user_override: None,
            effective_type: normalized.into(),
            custom_label: None,
            start_time: ts(),
            end_time: ts() + chrono::Duration::minutes(30),
            distance_meters: None,
            calories: Some(100),
            avg_hr: None,
            max_hr: None,
            training_load: None,
            vo2max: None,
            source_scope: SourceScope::Device,
            device_id: None,
            synced_at: Some(ts() + chrono::Duration::hours(1)),
            gps_available: false,
            sample_count: 0,
            zepp_source: None,
            zepp_type: code,
            ..Default::default()
        }
    }

    #[test]
    fn a_stream_the_cloud_has_but_we_never_read_is_not_reported_as_available_data() {
        // 体重和血压只探测、不归一化。探测说「云端有 42 条」，本机一条也没有。
        // 把这两件事混在一起，能力页会让人以为 ZeppBridge 已经存着他的血压。
        let db = Database::in_memory().unwrap();
        db.save_capability_probe(&[CapabilityProbe {
            stream: "blood_pressure".into(),
            surface: "v2_events".into(),
            cadence: "episodic".into(),
            window_days: 365,
            event_type: "blood_pressure".into(),
            sub_type: "real_data".into(),
            status: "available".into(),
            records: 42,
            latest_date: Some("2026-08-01".into()),
            fields: Vec::new(),
        }])
        .unwrap();

        let overview = db.capability_overview().unwrap();
        let row = overview
            .items
            .iter()
            .find(|item| item.stream == "blood_pressure")
            .expect("血压应当出现在能力总览里");
        assert_eq!(row.status, "available", "云端确实有，这一点要如实说");
        assert!(!row.ingested, "但本机没有收录，不能混进「已具备」");
        assert!(
            row.note.is_some(),
            "必须说明为什么没有收录，而不是让用户自己去猜"
        );

        // 真正读进库的流仍然算已收录，否则这个标记就没有意义了。
        assert!(overview
            .items
            .iter()
            .filter(|item| item.source == "derived")
            .all(|item| item.ingested));
    }

    /// 真实旧库的升级演练。默认跳过——它需要一个真实的旧数据库。
    ///
    /// 合成的小库证明不了升级安全：真正会出问题的是几百 MB、跨过好几个
    /// schema 版本、里面有各种历史遗留行的库。把这个演练留在仓库里，是为了
    /// 每次加迁移步骤时都能对着真库跑一遍，而不是只在发版当天临时想办法。
    ///
    /// ```powershell
    /// $env:ZEPPBRIDGE_UPGRADE_FIXTURE = "D:/somewhere/a-copy-of/zepp.db"
    /// cargo test --manifest-path src-tauri/Cargo.toml -p zeppbridge-core --jobs 1 `
    ///   -- --ignored upgrade_a_real_old_database
    /// ```
    ///
    /// **传一份副本。** 这个测试会真的迁移你指给它的文件。
    #[test]
    #[ignore = "需要真实旧库，用 ZEPPBRIDGE_UPGRADE_FIXTURE 指定一份副本"]
    fn upgrade_a_real_old_database_without_losing_rows() {
        let Ok(source) = std::env::var("ZEPPBRIDGE_UPGRADE_FIXTURE") else {
            panic!("没有设置 ZEPPBRIDGE_UPGRADE_FIXTURE");
        };
        let source = PathBuf::from(source);
        let dir = std::env::temp_dir().join("zeppbridge-upgrade-drill");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("zepp.db");
        std::fs::copy(&source, &path).expect("复制旧库");

        // 升级前先记下几张关键表的行数。升级只应当增加结构，不应当减少事实。
        let before = {
            let conn = Connection::open(&path).unwrap();
            let version: i64 = conn
                .query_row("PRAGMA user_version", [], |row| row.get(0))
                .unwrap();
            let counts: Vec<(String, i64)> =
                ["raw_records", "workouts", "daily_metrics", "metric_samples"]
                    .iter()
                    .filter_map(|table| {
                        conn.query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |row| {
                            row.get::<_, i64>(0)
                        })
                        .ok()
                        .map(|count| ((*table).to_string(), count))
                    })
                    .collect();
            (version, counts)
        };
        assert!(
            before.0 < CURRENT_SCHEMA_VERSION,
            "这份 fixture 已经是 v{}，演练不了升级",
            before.0
        );

        let db = Database::open_migrated(&path).expect("升级应当成功");
        assert_eq!(
            db.diagnostic_schema_version().unwrap(),
            CURRENT_SCHEMA_VERSION
        );

        for (table, count) in &before.1 {
            let after: i64 = db
                .conn
                .query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |row| {
                    row.get(0)
                })
                .unwrap();
            assert!(
                after >= *count,
                "{table} 从 {count} 掉到了 {after}——升级不该让事实变少"
            );
        }

        // 升级前必须留下一份可用的备份，否则「升级失败可以退回去」是空话。
        let backups = backup::list_backups(&dir).expect("读备份清单");
        let pre = backups
            .iter()
            .find(|item| item.kind == backup::BackupKind::PreMigration)
            .expect("升级前应当自动生成一份备份");
        assert!(pre.integrity_ok, "自动备份必须通过完整性检查");
        assert_eq!(
            pre.schema_version, before.0,
            "自动备份应当是升级之前那个版本的样子"
        );

        let verified = backup::verify_backup(&dir, &pre.id).unwrap();
        assert!(verified.problem.is_none(), "{:?}", verified.problem);
    }

    #[test]
    fn a_read_only_connection_refuses_writes_and_ignores_the_write_lock() {
        // MCP 和 CLI 的查询路径靠这两条性质成立：写不进去是连接层保证的，
        // 不是靠调用方自觉；而且一次长同步持有写锁时，只读查询不该被挡住。
        let dir = std::env::temp_dir().join("zeppbridge-readonly-contract");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("zepp.db");
        drop(Database::open_migrated(&path).unwrap());

        let _writer = write_lock::try_acquire(&dir, write_lock::WritePurpose::Sync)
            .expect("先让一个写者占住锁");

        let reader = Database::open_read_only(path).expect("只读连接不该被写锁挡住");
        assert!(reader.get_recent_workouts(1).is_ok(), "同步进行中也要能查");
        let write_attempt = reader
            .conn
            .execute("DELETE FROM raw_records", [])
            .map_err(|error| error.to_string());
        assert!(write_attempt.is_err(), "只读连接必须在 SQLite 层就拒绝写入");
    }

    #[test]
    fn the_pre_migration_backup_can_still_read_a_database_that_is_out_of_date() {
        // 「只读连接必须版本一致」是给用户查询用的策略，不是打开文件的机制。
        // 把它写进机制里，升级前的自动备份就打不开旧库，于是备份失败，
        // 于是迁移拒绝开始——所有老用户都升不了级。
        let dir = std::env::temp_dir().join("zeppbridge-premigration-open");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("zepp.db");
        drop(Database::open_migrated(&path).unwrap());

        let conn = Connection::open(&path).unwrap();
        conn.execute_batch(&format!(
            "PRAGMA user_version = {};",
            CURRENT_SCHEMA_VERSION - 1
        ))
        .unwrap();
        drop(conn);

        assert!(
            Database::open_read_only(path.clone()).is_err(),
            "面向用户查询的入口仍然要拦住版本不一致的库"
        );
        assert!(
            Database::open_read_only_any_version(path.clone()).is_ok(),
            "备份与恢复必须能读旧版本的库，那正是它们存在的理由"
        );
        // 迁移这条路要能一路走通，包括中间那次自动备份。
        drop(Database::open_migrated(&path).expect("旧库应当能被升级"));
        let backups = backup::list_backups(&dir).unwrap();
        assert!(
            backups
                .iter()
                .any(|item| item.kind == backup::BackupKind::PreMigration),
            "升级前应当留下一份备份"
        );
    }

    #[test]
    fn a_read_only_open_says_which_side_is_out_of_date_instead_of_failing_later() {
        // 旧库 + 新程序会一路撞到「没有这张表」，用户看到的是一句
        // 「数据库暂时不可用」——不知道原因，也不知道该做什么。
        let dir = std::env::temp_dir().join("zeppbridge-readonly-schema");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("zepp.db");
        drop(Database::open_migrated(&path).unwrap());

        // 库比程序旧时给的两条路都要在场。只说「启动一次桌面应用」，
        // 对一个跑在容器里的库等于没说——那里根本没有桌面应用。
        for (version, expected) in [
            (
                CURRENT_SCHEMA_VERSION - 1,
                vec!["zeppbridge-cli reprocess", "桌面应用"],
            ),
            (CURRENT_SCHEMA_VERSION + 1, vec!["请把命令行"]),
        ] {
            let conn = Connection::open(&path).unwrap();
            conn.execute_batch(&format!("PRAGMA user_version = {version};"))
                .unwrap();
            drop(conn);
            let message = match Database::open_read_only(path.clone()) {
                Ok(_) => panic!("版本对不上必须在打开时就报出来"),
                Err(error) => error.user_message(),
            };
            for needle in expected {
                assert!(message.contains(needle), "{message}");
            }
        }
    }

    #[test]
    fn storage_estimate_only_extrapolates_streams_that_have_enough_local_history() {
        let db = Database::in_memory().unwrap();
        // daily_summary：一年的历史，但只在 12 次抓取里拿回来——真实数据就是
        // 这样，一条报文覆盖一个月。分母必须是覆盖的天数，不是抓取的次数。
        for month in 0..12 {
            db.insert_raw_record(&RawRecord {
                stream: "daily_summary".into(),
                source_key: format!("daily-{month}"),
                source_scope: SourceScope::UserFused,
                device_id: None,
                start_utc: ts() + chrono::Duration::days(month * 30),
                end_utc: None,
                payload: serde_json::json!({ "data": [{ "date": "2023-11-14" }] }),
                capability: CapabilityStatus::Verified,
            })
            .unwrap();
        }
        // sleep：只有一天，不够外推。
        db.insert_raw_record(&RawRecord {
            stream: "sleep".into(),
            source_key: "sleep-only-one-day".into(),
            source_scope: SourceScope::Device,
            device_id: None,
            start_utc: ts(),
            end_utc: None,
            payload: serde_json::json!({ "data": [] }),
            capability: CapabilityStatus::Verified,
        })
        .unwrap();

        let estimate = db
            .storage_estimate(365, &std::env::temp_dir())
            .expect("估算不该失败");

        let daily = estimate
            .streams
            .iter()
            .find(|stream| stream.stream == "daily_summary")
            .unwrap();
        assert!(daily.measured, "跨越一年的样本足以外推");
        assert!(
            daily.observed_days > 300,
            "分母应当是覆盖的天数（约 331），拿到的是 {}——如果这里是 12，             说明又在用抓取次数当分母，一年的估算会被放大三十倍",
            daily.observed_days
        );
        assert_eq!(daily.estimated_add_bytes, daily.bytes_per_day * 365);

        let sleep = estimate
            .streams
            .iter()
            .find(|stream| stream.stream == "sleep")
            .unwrap();
        assert!(!sleep.measured, "一天样本不足以外推");
        assert_eq!(
            sleep.estimated_add_bytes, 0,
            "样本不足时应当说不知道，而不是编一个速率乘一年"
        );

        assert!(!estimate.measured, "还有流没有样本，总数不能声称是实测的");
        assert!(
            estimate.message.contains("未计入"),
            "总数只覆盖部分流这件事必须说出来: {}",
            estimate.message
        );
    }

    #[test]
    fn storage_estimate_covers_multi_year_backfill_not_just_the_retention_window() {
        let db = Database::in_memory().unwrap();
        // 保留期上限是 365 天，但补拉可以跨多年；估算必须能回答后者。
        let estimate = db
            .storage_estimate(1095, &std::env::temp_dir())
            .expect("三年的估算不该被保留期的上限挡住");
        assert_eq!(estimate.requested_days, 1095);
        assert!(db.storage_estimate(4000, &std::env::temp_dir()).is_err());
    }

    #[test]
    fn current_schema_marker_survives_repeated_idempotent_migrations() {
        let db = Database::in_memory().unwrap();
        assert_eq!(
            db.diagnostic_schema_version().unwrap(),
            CURRENT_SCHEMA_VERSION
        );
        db.migrate().unwrap();
        assert_eq!(
            db.diagnostic_schema_version().unwrap(),
            CURRENT_SCHEMA_VERSION
        );
    }

    #[test]
    fn previous_release_upgrade_replays_only_the_changed_streams() {
        let db = Database::in_memory().unwrap();
        db.insert_raw_record(&RawRecord {
            stream: "daily_summary".into(),
            source_key: "daily-summary-test".into(),
            source_scope: SourceScope::UserFused,
            device_id: None,
            start_utc: ts(),
            end_utc: None,
            payload: serde_json::json!({
                "data": [{ "date": "2023-11-14", "steps": 1234 }]
            }),
            capability: CapabilityStatus::Verified,
        })
        .unwrap();
        db.insert_raw_record(&RawRecord {
            stream: "workouts".into(),
            source_key: "workouts-test".into(),
            source_scope: SourceScope::Device,
            device_id: None,
            start_utc: ts(),
            end_utc: None,
            payload: serde_json::json!({
                "data": [{
                    "trackid": 1_700_000_000i64,
                    "end_time": 1_700_003_600i64,
                    // v21 加进目录的那个编号。重放前它是 `unknown:12`。
                    "type": 12
                }]
            }),
            capability: CapabilityStatus::Verified,
        })
        .unwrap();
        db.insert_raw_record(&RawRecord {
            stream: "wellness".into(),
            source_key: "wellness:all_day_stress:user_events:2026-09-02:2026-09-03".into(),
            source_scope: SourceScope::Device,
            device_id: None,
            start_utc: ts(),
            end_utc: None,
            payload: serde_json::json!({
                "items": [{
                    "eventType": "all_day_stress",
                    "timestamp": 1788307200000i64,
                    "avgStress": "22",
                    "data": "[{\"time\":1788307200000,\"value\":32},{\"time\":1788307500000,\"value\":25}]"
                }]
            }),
            capability: CapabilityStatus::Verified,
        })
        .unwrap();
        db.conn
            .execute(
                "INSERT INTO app_meta(key, value, updated_at)
                 VALUES('normalizer_revision', ?1, ?2)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                params![PREVIOUS_RELEASE_NORMALIZER_REVISION, ts().to_rfc3339()],
            )
            .unwrap();

        let counts = db.reprocess_raw_records_if_needed().unwrap().unwrap();

        // v20 到 v21 只改了运动目录，所以只有 workouts 这一条流要重放，而且
        // 报上来的条数是真的条数——那一条运动。
        assert_eq!(counts.get("workouts"), Some(&1));
        // 而且重放确实把编号翻译过来了：这正是这一版存在的理由——已经存成
        // `unknown:12` 的历史记录必须变成椭圆机，不然报这个问题的人（他就是
        // 因为历史记录才来报的）升级完看到的还是老样子。
        assert_eq!(
            db.conn
                .query_row("SELECT workout_type FROM workouts", [], |row| row
                    .get::<_, String>(0),)
                .unwrap(),
            "elliptical"
        );
        // daily_summary / wellness 一个字节都没动过，不该被顺手解一遍：白解
        // 一遍就是让升级后第一次启动干等。
        assert!(!counts.contains_key("daily_summary"));
        assert!(!counts.contains_key("wellness"));
        assert_eq!(
            db.normalized_stream_count("daily_summary").unwrap(),
            Some(0)
        );
        assert_eq!(
            db.conn
                .query_row(
                    "SELECT COUNT(*) FROM metric_samples WHERE metric = 'stress'",
                    [],
                    |row| row.get::<_, i64>(0),
                )
                .unwrap(),
            0
        );
        assert_eq!(
            db.conn
                .query_row(
                    "SELECT COUNT(*) FROM daily_metrics WHERE metric = 'steps'",
                    [],
                    |row| row.get::<_, i64>(0),
                )
                .unwrap(),
            0
        );
        let revision: String = db
            .conn
            .query_row(
                "SELECT value FROM app_meta WHERE key = 'normalizer_revision'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(revision, NORMALIZER_REVISION);
    }

    /// 无头用户的库靠什么知道自己欠一次重放。
    ///
    /// 桌面应用启动时会自动重放，命令行没有那次启动。所以「欠不欠」必须能
    /// 在**只读**的前提下问出来：`status` 要能说，MCP 要能报，而它们一个
    /// 字节都不该写库。
    #[test]
    fn a_stale_library_can_be_recognized_without_writing_to_it() {
        let db = Database::in_memory().unwrap();
        db.insert_raw_record(&RawRecord {
            // 这一条必须落在**这一版要重放的那条流**上，否则 raw_records 会是
            // 0，而 0 条报文的库本来就不欠重放——那样这个测试就在验一件不相干
            // 的事。改归一化规则、换了重放的流时，这里要跟着换。
            stream: "workouts".into(),
            source_key: "workouts-plan".into(),
            source_scope: SourceScope::Device,
            device_id: None,
            start_utc: ts(),
            end_utc: None,
            payload: serde_json::json!({
                "data": [{ "trackid": 1_700_000_000i64, "end_time": 1_700_003_600i64, "type": 12 }]
            }),
            capability: CapabilityStatus::Verified,
        })
        .unwrap();
        db.conn
            .execute(
                "INSERT INTO app_meta(key, value, updated_at)
                 VALUES('normalizer_revision', ?1, ?2)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                params![PREVIOUS_RELEASE_NORMALIZER_REVISION, ts().to_rfc3339()],
            )
            .unwrap();

        let plan = db.pending_replay_plan().unwrap().unwrap();
        assert_eq!(
            plan.stored_revision.as_deref(),
            Some(PREVIOUS_RELEASE_NORMALIZER_REVISION)
        );
        assert_eq!(plan.target_revision, NORMALIZER_REVISION);
        assert_eq!(plan.streams, PREVIOUS_RELEASE_REPLAY_STREAMS.to_vec());
        // 只数要重放的那几条流，不是整库。计划里那个数字会直接显示给用户，
        // 它得是这次真的要过的报文条数。
        assert_eq!(plan.raw_records, 1);

        db.reprocess_raw_records_if_needed().unwrap().unwrap();
        assert!(
            db.pending_replay_plan().unwrap().is_none(),
            "重放做完之后就不该再说自己欠着"
        );
    }

    /// 空库不欠重放。
    ///
    /// 全新安装的库没记过修订号，那不是「历史停在旧解析器上」，只是还没有
    /// 历史。对它喊「你的数据需要重放」是一句没有内容的警告，而 `status`
    /// 每一分钟都可能被调度脚本调一次。
    #[test]
    fn a_brand_new_library_is_not_told_it_owes_a_replay() {
        let db = Database::in_memory().unwrap();
        let plan = db.pending_replay_plan().unwrap().unwrap();
        assert_eq!(plan.raw_records, 0);
        assert!(
            !db.data_health(30, 0)
                .unwrap()
                .database
                .normalizer_replay_pending
        );

        // 但它仍然要被盖上当前修订号，否则第一次同步之后会平白重放一次。
        db.reprocess_raw_records_if_needed().unwrap().unwrap();
        assert_eq!(
            db.stored_normalizer_revision().unwrap().as_deref(),
            Some(NORMALIZER_REVISION)
        );
    }

    /// 健康报告要说库的修订号，不是程序自己的常量。
    #[test]
    fn health_reports_the_revision_the_library_actually_has() {
        let db = Database::in_memory().unwrap();
        db.insert_raw_record(&RawRecord {
            // 同上：要落在这一版会重放的那条流上，不然「欠不欠重放」根本不成立。
            stream: "workouts".into(),
            source_key: "workouts-health".into(),
            source_scope: SourceScope::Device,
            device_id: None,
            start_utc: ts(),
            end_utc: None,
            payload: serde_json::json!({
                "data": [{ "trackid": 1_700_000_000i64, "end_time": 1_700_003_600i64, "type": 12 }]
            }),
            capability: CapabilityStatus::Verified,
        })
        .unwrap();
        db.conn
            .execute(
                "INSERT INTO app_meta(key, value, updated_at)
                 VALUES('normalizer_revision', ?1, ?2)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                params![PREVIOUS_RELEASE_NORMALIZER_REVISION, ts().to_rfc3339()],
            )
            .unwrap();

        let health = db.data_health(30, 0).unwrap();
        assert_eq!(health.database.normalizer_revision, NORMALIZER_REVISION);
        assert_eq!(
            health.database.stored_normalizer_revision.as_deref(),
            Some(PREVIOUS_RELEASE_NORMALIZER_REVISION)
        );
        assert!(health.database.normalizer_replay_pending);
        assert!(
            health.actions.iter().any(|action| action.id == "reprocess"),
            "库停在旧解析器上时，健康报告必须给得出那个动作"
        );
    }

    /// 分批提交不能把跨批的记录漏掉。
    ///
    /// 重放现在一批 64 条报文包一个事务。批的边界是新加的东西，而边界正是
    /// 这类改动最容易出错的地方：少提交一次、或者最后不满一批的那几条没被
    /// 处理，用户看到的是「重放跑完了，可还是有一部分记录没变」。
    #[test]
    fn batched_replay_covers_every_record_across_batch_boundaries() {
        let db = Database::in_memory().unwrap();
        let total = REPLAY_BATCH_RECORDS * 2 + 5;
        for index in 0..total {
            let track = 1_700_000_000i64 + index as i64 * 7200;
            db.insert_raw_record(&RawRecord {
                stream: "workouts".into(),
                source_key: format!("sport_history:0:{index}"),
                source_scope: SourceScope::Device,
                device_id: None,
                start_utc: ts(),
                end_utc: None,
                payload: serde_json::json!({
                    "data": [{ "trackid": track, "end_time": track + 3600, "type": 211 }]
                }),
                capability: CapabilityStatus::Verified,
            })
            .unwrap();
        }
        db.conn
            .execute(
                "INSERT INTO app_meta(key, value, updated_at)
                 VALUES('normalizer_revision', ?1, ?2)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                params!["zepp-normalizer-before-selective-replay", ts().to_rfc3339()],
            )
            .unwrap();

        db.reprocess_raw_records_if_needed().unwrap().unwrap();

        assert_eq!(
            db.normalized_stream_count("workouts").unwrap(),
            Some(total as i64)
        );
        let workouts = db.get_recent_workouts(total + 10).unwrap();
        assert_eq!(workouts.len(), total);
        assert!(
            workouts
                .iter()
                .all(|workout| workout.workout_type == "road_cycling"),
            "最后不满一批的那几条也必须走过新规则"
        );
    }

    /// 只重放 workouts 的那条升级路径，不能顺手把运动明细删掉。
    ///
    /// `workout_samples`、`route_points`、`workout_pauses`、`workout_splits`
    /// 四张表都以 `ON DELETE CASCADE` 挂在 `workouts` 上。重放 workouts 时若
    /// 先按 raw_record_id 删掉汇总行，级联会把这条运动的逐秒序列、GPS 轨迹和
    /// 分段一起带走——而这条升级路径并不重放 workout_detail，于是它们再也回
    /// 不来。用户看到的是「升级完，我以前那些运动的轨迹全没了」，而升级本身
    /// 报告成功。
    #[test]
    fn replaying_workout_summaries_does_not_erase_the_detail_series() {
        let db = Database::in_memory().unwrap();
        db.persist_fetched_record(&RawRecord {
            stream: "workouts".into(),
            source_key: "sport_history:0:1".into(),
            source_scope: SourceScope::Device,
            device_id: None,
            start_utc: ts(),
            end_utc: None,
            payload: serde_json::json!({
                "data": [{ "trackid": 1_700_000_000i64, "end_time": 1_700_003_600i64, "type": 211 }]
            }),
            capability: CapabilityStatus::Verified,
        })
        .unwrap();
        db.persist_fetched_record(&RawRecord {
            stream: "workout_detail".into(),
            source_key: "workout_detail:1700000000:run.gps".into(),
            source_scope: SourceScope::Device,
            device_id: None,
            start_utc: ts(),
            end_utc: None,
            payload: serde_json::json!({
                "trackid": 1_700_000_000i64,
                "source": "run.gps",
                "time": "0;1;",
                "longitude_latitude": "4004663552,11629333504;16403,8392;",
                "heart_rate": "1,80;1,2;"
            }),
            capability: CapabilityStatus::Verified,
        })
        .unwrap();
        let samples_before = db.normalized_stream_count("workout_detail").unwrap();
        let route_before: i64 = db
            .conn
            .query_row("SELECT COUNT(*) FROM route_points", [], |row| row.get(0))
            .unwrap();
        assert!(samples_before.unwrap_or(0) > 0 && route_before > 0);

        db.reprocess_raw_records_for_stream(Some(&["workouts"]))
            .unwrap();

        assert_eq!(
            db.normalized_stream_count("workout_detail").unwrap(),
            samples_before,
            "重放运动汇总不该带走逐秒序列"
        );
        let route_after: i64 = db
            .conn
            .query_row("SELECT COUNT(*) FROM route_points", [], |row| row.get(0))
            .unwrap();
        assert_eq!(route_after, route_before, "重放运动汇总不该带走 GPS 轨迹");
        // 汇总本身仍然要按新规则重算过。
        assert_eq!(
            db.get_recent_workouts(10).unwrap()[0].workout_type,
            "road_cycling"
        );
    }

    /// 升级之后，旧的 `unknown:211` 会被重新认成公路骑行。
    ///
    /// 报这个问题的人是为历史记录来的：199 条记录已经存成 `unknown:211` 了。
    /// 只把编号加进目录，新记录会对，旧记录一条都不会变——所以这条用例钉的
    /// 不是目录，而是「目录改了会自动重放」这件事。
    ///
    /// 库里存的是一个更早的修订号，走的是全量重放那条路。**不能用上一版的
    /// 修订号**：那条路只重放当版真正改过的流，而那是随版本变的，钉在这里
    /// 会让这条用例每次换版都假失败一次。
    #[test]
    fn upgrading_replays_history_so_unknown_211_becomes_road_cycling() {
        let db = Database::in_memory().unwrap();
        db.insert_raw_record(&RawRecord {
            stream: "workouts".into(),
            source_key: "workouts-211".into(),
            source_scope: SourceScope::Device,
            device_id: None,
            start_utc: ts(),
            end_utc: None,
            payload: serde_json::json!({
                "data": [{
                    "trackid": 1_700_000_000i64,
                    "end_time": 1_700_003_600i64,
                    "type": 211
                }]
            }),
            capability: CapabilityStatus::Verified,
        })
        .unwrap();
        db.conn
            .execute(
                "INSERT INTO app_meta(key, value, updated_at)
                 VALUES('normalizer_revision', ?1, ?2)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                params!["zepp-normalizer-ancient", ts().to_rfc3339()],
            )
            .unwrap();

        db.reprocess_raw_records_if_needed().unwrap().unwrap();

        let workouts = db.get_recent_workouts(10).unwrap();
        assert_eq!(workouts.len(), 1);
        assert_eq!(workouts[0].workout_type, "road_cycling");
    }

    #[test]
    fn schema_v10_workout_rows_migrate_without_losing_type_facts() {
        let db = Database::in_memory().unwrap();
        db.conn
            .execute_batch(
                "ALTER TABLE workouts DROP COLUMN workout_type_conflict;
                 ALTER TABLE workouts DROP COLUMN workout_type_override;
                 ALTER TABLE workouts DROP COLUMN workout_type_source;
                 DELETE FROM schema_migrations WHERE version = 11;
                 PRAGMA user_version = 10;",
            )
            .unwrap();
        db.conn
            .execute(
                "INSERT INTO workouts
                    (workout_id, workout_type, start_time, end_time, source_scope,
                     synced_at, gps_available, sample_count, zepp_type)
                 VALUES ('legacy', 'run', ?1, ?2, 'device', ?3, 0, 0, 105)",
                params![
                    ts().to_rfc3339(),
                    (ts() + chrono::Duration::minutes(30)).to_rfc3339(),
                    (ts() + chrono::Duration::hours(1)).to_rfc3339(),
                ],
            )
            .unwrap();
        db.migrate().unwrap();
        assert_eq!(
            db.diagnostic_schema_version().unwrap(),
            CURRENT_SCHEMA_VERSION
        );
        let source: String = db
            .conn
            .query_row(
                "SELECT workout_type_source FROM workouts WHERE workout_id = 'legacy'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(source, "numeric_mapped");
        assert_eq!(
            db.get_workout_detail("legacy").unwrap().unwrap().zepp_type,
            Some(105)
        );
    }

    #[test]
    fn workout_type_merge_is_order_independent_and_numeric_evidence_wins() {
        let numeric = workout_with_type(Some(105), "unknown:105", "unknown_code");
        let string = workout_with_type(None, "strength", "string_field");
        let first = Database::in_memory().unwrap();
        first.insert_workout(&string).unwrap();
        first.insert_workout(&numeric).unwrap();
        let second = Database::in_memory().unwrap();
        second.insert_workout(&numeric).unwrap();
        second.insert_workout(&string).unwrap();
        let a = first.get_workout_detail("same-workout").unwrap().unwrap();
        let b = second.get_workout_detail("same-workout").unwrap().unwrap();
        assert_eq!(a.normalized_type, "unknown:105");
        assert_eq!(a.normalized_type, b.normalized_type);
        assert_eq!(a.type_source, b.type_source);
        assert_eq!(a.zepp_type, b.zepp_type);
    }

    #[test]
    fn workout_override_survives_replay_and_does_not_replace_raw_facts() {
        let db = Database::in_memory().unwrap();
        let workout = workout_with_type(Some(105), "unknown:105", "unknown_code");
        db.insert_workout(&workout).unwrap();
        db.set_workout_type_override("same-workout", Some("strength"))
            .unwrap();
        let mut replay = workout.clone();
        replay.synced_at = Some(ts() + chrono::Duration::days(1));
        db.insert_workout(&replay).unwrap();
        let stored = db.get_workout_detail("same-workout").unwrap().unwrap();
        assert_eq!(stored.zepp_type, Some(105));
        assert_eq!(stored.normalized_type, "unknown:105");
        assert_eq!(stored.user_override.as_deref(), Some("strength"));
        assert_eq!(stored.effective_type, "strength");
        assert_eq!(stored.synced_at, workout.synced_at);
        let export = parsed_export(&db, &["workouts"], ExportDetail::Summary);
        let exported = &export["data"]["workouts"][0];
        assert_eq!(exported["zepp_type"], 105);
        assert_eq!(exported["normalized_type"], "unknown:105");
        assert_eq!(exported["type_source"], "unknown_code");
        assert_eq!(exported["user_override"], "strength");
        assert_eq!(exported["effective_type"], "strength");
        assert_eq!(exported["workout_type"], "strength");
        db.set_workout_type_override("same-workout", None).unwrap();
        assert_eq!(
            db.get_workout_detail("same-workout")
                .unwrap()
                .unwrap()
                .effective_type,
            "unknown:105"
        );
    }

    fn parsed_export(db: &Database, types: &[&str], detail: ExportDetail) -> serde_json::Value {
        let (encoded, _) = db
            .build_ai_export(&export_selection(types, detail))
            .unwrap();
        serde_json::from_str(&encoded).unwrap()
    }

    #[test]
    fn summary_export_aggregates_heart_rate_and_drops_the_per_second_series() {
        let db = Database::in_memory().unwrap();
        for (offset, value) in [(0, 60.0), (60, 70.0), (120, 80.0), (3600, 100.0)] {
            db.insert_metric_sample(&MetricSample {
                metric: "heart_rate".into(),
                timestamp: ts() + chrono::Duration::seconds(offset),
                value,
                unit: "bpm".into(),
                source_scope: SourceScope::Device,
                device_id: Some("SN-ONE".into()),
            })
            .unwrap();
        }
        db.insert_workout(&Workout {
            workout_id: "1700000000".into(),
            workout_type: "run".into(),
            normalized_type: "run".into(),
            type_source: "string_field".into(),
            user_override: None,
            effective_type: "run".into(),
            custom_label: None,
            start_time: ts(),
            end_time: ts() + chrono::Duration::minutes(10),
            distance_meters: Some(1000.0),
            calories: Some(80),
            avg_hr: Some(140),
            max_hr: Some(160),
            training_load: Some(20.0),
            vo2max: None,
            source_scope: SourceScope::Device,
            device_id: Some("SN-ONE".into()),
            synced_at: None,
            gps_available: false,
            sample_count: 0,
            zepp_source: None,
            zepp_type: None,
            ..Default::default()
        })
        .unwrap();

        let summary = parsed_export(&db, &["heart_rate", "workouts"], ExportDetail::Summary);
        let samples = summary["data"]["metric_samples"].as_array().unwrap();
        // Three samples inside one hour collapse to one row; the fourth starts
        // the next hour.
        assert_eq!(samples.len(), 2);
        let first = &samples[0];
        assert_eq!(first["min"], 60.0);
        assert_eq!(first["max"], 80.0);
        assert_eq!(first["avg"], 70.0);
        assert_eq!(first["samples"], 3);
        assert!(
            first.get("timestamp").is_none(),
            "aggregated rows have hours"
        );

        let workout = &summary["data"]["workouts"][0];
        assert!(
            workout.get("samples").is_none(),
            "summary must not carry the per-second series"
        );
        assert!(workout.get("route").is_none());
        assert!(workout.get("sample_count").is_some());

        let full = parsed_export(&db, &["heart_rate", "workouts"], ExportDetail::Full);
        assert_eq!(full["data"]["metric_samples"].as_array().unwrap().len(), 4);
        assert!(full["data"]["workouts"][0].get("samples").is_some());
        assert!(full["data"]["workouts"][0].get("route").is_some());
    }

    #[test]
    fn wake_count_survives_the_round_trip_and_is_not_awake_minutes() {
        // Ten one-minute wakings and one ten-minute waking are the same
        // duration but not the same night, so `wc` is its own field.
        let db = Database::in_memory().unwrap();
        db.insert_sleep_session(&SleepSession {
            sleep_id: "sleep-wc".into(),
            start_time: ts(),
            end_time: ts() + chrono::Duration::minutes(400),
            score: Some(80),
            duration_minutes: 380,
            deep_minutes: 80,
            light_minutes: 240,
            rem_minutes: Some(40),
            awake_minutes: 20,
            source_scope: SourceScope::Device,
            device_id: None,
            synced_at: None,
            time_in_bed_minutes: None,
            stages: Vec::new(),
            wake_count: Some(4),
        })
        .unwrap();
        assert_eq!(
            db.get_sleep_detail("sleep-wc").unwrap().unwrap().wake_count,
            Some(4)
        );
        let export = parsed_export(&db, &["sleep"], ExportDetail::Summary);
        let session = &export["data"]["sleep_sessions"][0];
        assert_eq!(session["wake_count"], 4);
        assert_eq!(session["awake_minutes"], 20);
    }

    #[test]
    fn export_carries_the_sleep_stage_timeline() {
        let db = Database::in_memory().unwrap();
        let start = ts();
        db.insert_sleep_session(&SleepSession {
            sleep_id: "sleep-export".into(),
            start_time: start,
            end_time: start + chrono::Duration::minutes(400),
            score: Some(80),
            duration_minutes: 380,
            deep_minutes: 80,
            light_minutes: 240,
            rem_minutes: Some(40),
            awake_minutes: 20,
            source_scope: SourceScope::Device,
            device_id: Some("SN-ONE".into()),
            synced_at: None,
            time_in_bed_minutes: None,
            wake_count: None,
            stages: vec![
                SleepStageSlice {
                    stage: "light".into(),
                    start_time: start,
                    end_time: start + chrono::Duration::minutes(30),
                    raw_mode: None,
                },
                SleepStageSlice {
                    stage: "deep".into(),
                    start_time: start + chrono::Duration::minutes(30),
                    end_time: start + chrono::Duration::minutes(90),
                    raw_mode: None,
                },
            ],
        })
        .unwrap();

        for detail in [ExportDetail::Summary, ExportDetail::Full] {
            let export = parsed_export(&db, &["sleep"], detail);
            let stages = export["data"]["sleep_sessions"][0]["stages"]
                .as_array()
                .unwrap();
            assert_eq!(stages.len(), 2, "{detail:?}");
            assert_eq!(stages[0]["stage"], "light");
            assert_eq!(stages[1]["stage"], "deep");
        }
    }

    #[test]
    fn export_says_why_a_selected_type_is_missing() {
        let db = Database::in_memory().unwrap();
        db.insert_metric_sample(&MetricSample {
            metric: "hrv".into(),
            timestamp: ts(),
            value: 45.0,
            unit: "ms".into(),
            source_scope: SourceScope::Device,
            device_id: Some("SN-ONE".into()),
        })
        .unwrap();

        let export = parsed_export(&db, &["hrv", "spo2", "sleep"], ExportDetail::Summary);
        let capabilities = &export["capabilities"];
        assert_eq!(capabilities["hrv"]["status"], "available");
        assert_eq!(capabilities["hrv"]["source_records"], 1);
        assert_eq!(capabilities["hrv"]["rows_in_export"], 1);
        // Nothing fetched and nothing stored: genuinely empty for this window.
        assert_eq!(capabilities["spo2"]["status"], "empty_in_range");
        assert_eq!(capabilities["sleep"]["status"], "empty_in_range");
    }

    #[test]
    fn compressed_raw_payloads_survive_a_round_trip_and_still_replay() {
        // 原始报文是重放的唯一依据。压缩只能改变它占多少字节，不能改变它是什么——
        // 少一个字节，这条记录就永久毁了。
        let db = Database::in_memory().unwrap();
        let payload = serde_json::json!({
            "items": (0..200).map(|index| serde_json::json!({
                "time": format!("2026-08-{:02}T00:00:00Z", (index % 28) + 1),
                "bpm": 60 + (index % 40),
            })).collect::<Vec<_>>()
        });
        db.insert_raw_record(&RawRecord {
            stream: "wellness".into(),
            source_key: "wellness:spo2:user_events:2026-08-01:2026-08-08".into(),
            source_scope: SourceScope::UserFused,
            device_id: None,
            start_utc: ts(),
            end_utc: Some(ts() + chrono::Duration::days(7)),
            payload: payload.clone(),
            capability: CapabilityStatus::Unverified,
        })
        .unwrap();

        // 存的是压缩形态，而且明显更小。
        let (stored_text, zipped): (String, Option<Vec<u8>>) = db
            .conn
            .query_row(
                "SELECT payload, payload_zip FROM raw_records ORDER BY id DESC LIMIT 1",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(stored_text, "", "压缩之后不该再留一份明文");
        let zipped = zipped.expect("新写入的报文应当是压缩的");
        let expected = serde_json::to_string(&payload).unwrap();
        assert!(
            zipped.len() < expected.len(),
            "压完反而更大就没有意义：{} vs {}",
            zipped.len(),
            expected.len()
        );

        // 还原必须一字不差。
        assert_eq!(
            decode_raw_payload(String::new(), Some(zipped)).unwrap(),
            expected
        );

        // 老库里的明文行仍然照常读。
        assert_eq!(
            decode_raw_payload("{\"legacy\":true}".into(), None).unwrap(),
            "{\"legacy\":true}"
        );
        assert_eq!(
            decode_raw_payload("{\"legacy\":true}".into(), Some(Vec::new())).unwrap(),
            "{\"legacy\":true}"
        );
    }

    #[test]
    fn compacting_history_leaves_the_payload_readable() {
        // 存量报文是这一版之前攒下来的明文。压缩它们不能改变任何一条的内容。
        let db = Database::in_memory().unwrap();
        let text = serde_json::to_string(&serde_json::json!({
            "summary": "x".repeat(4000),
        }))
        .unwrap();
        db.conn
            .execute(
                "INSERT INTO raw_records
                    (stream, source_key, source_scope, device_id, start_utc, end_utc,
                     payload, payload_hash, fetched_at)
                 VALUES ('wellness', 'legacy:1', 'device', NULL, ?1, NULL, ?2, 'hash', ?1)",
                params![ts().to_rfc3339(), text],
            )
            .unwrap();

        let report = db.compact_raw_payloads().unwrap();
        assert_eq!(report.compacted, 1);
        assert_eq!(report.skipped, 0);
        assert!(report.bytes_after < report.bytes_before);

        let (stored, zipped): (String, Option<Vec<u8>>) = db
            .conn
            .query_row(
                "SELECT payload, payload_zip FROM raw_records WHERE source_key = 'legacy:1'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(decode_raw_payload(stored, zipped).unwrap(), text);

        // 再压一次没有可压的了，也不该把已压的行算进去。
        let again = db.compact_raw_payloads().unwrap();
        assert_eq!(again.compacted, 0);
        // 压完之后就不该再被算成「待压」，否则每次启动都会白弹一次进度提示。
        assert_eq!(db.pending_raw_payload_count().unwrap(), 0);
    }

    #[test]
    fn tiny_payloads_are_never_counted_as_pending() {
        // 空响应 `{"items":[]}` 只有 12 字节，压完比原文还大，压缩函数会跳过它。
        // 如果计数函数还把它算成「待压」，就会变成：每次启动都判定有活要干、
        // 弹出「正在压缩」、然后立刻 0 条结束。实测在真实库上就是这样。
        let db = Database::in_memory().unwrap();
        for index in 0..3 {
            db.conn
                .execute(
                    "INSERT INTO raw_records
                        (stream, source_key, source_scope, device_id, start_utc, end_utc,
                         payload, payload_hash, fetched_at)
                     VALUES ('wellness', ?2, 'device', NULL, ?1, NULL, '{\"items\":[]}', 'hash', ?1)",
                    params![ts().to_rfc3339(), format!("empty:{index}")],
                )
                .unwrap();
        }
        assert_eq!(db.pending_raw_payload_count().unwrap(), 0);
        let report = db.compact_raw_payloads().unwrap();
        assert_eq!(report.compacted, 0);
        assert_eq!(report.skipped, 0, "小到不值得压的报文根本不该被取出来");
    }

    #[test]
    fn the_index_window_never_hides_a_day_inside_the_range() {
        // 这层时间戳边界只是为了让索引能定位，不能改变结果。
        // 边界必须比本地日期区间宽出至少一天，否则某些时区下第一天或
        // 最后一天的采样会被悄悄丢掉。
        let (lower, upper) = local_day_range_utc_bounds("2026-08-23", "2026-08-29").unwrap();
        assert!(
            lower.as_str() < "2026-08-23T00:00:00",
            "下界必须早于区间第一天：{lower}"
        );
        assert!(
            upper.as_str() > "2026-08-30T00:00:00",
            "上界必须晚于区间最后一天的末尾：{upper}"
        );
        // 单日区间同样成立。
        let (lower, upper) = local_day_range_utc_bounds("2026-08-28", "2026-08-28").unwrap();
        assert!(lower.as_str() < "2026-08-28T00:00:00");
        assert!(upper.as_str() > "2026-08-29T00:00:00");
        // 日期无效时返回 None，让调用方退回不带边界的查询而不是查空。
        assert!(local_day_range_utc_bounds("not-a-date", "2026-08-29").is_none());
    }

    #[test]
    fn a_single_workout_export_carries_only_that_workout() {
        // 从运动详情点「交给 AI」时，界面说的是「只导出这一条运动」。
        // 早先的实现把范围解析成「这条运动当天」，于是整天的心率、睡眠和步数
        // 都被一起发了出去——界面说的和发出去的不一样。这条用例把它钉住。
        let db = Database::in_memory().unwrap();
        let start = ts();
        let end = start + chrono::Duration::minutes(30);
        db.insert_workout(&Workout {
            workout_id: "target-workout".into(),
            workout_type: "run".into(),
            normalized_type: "run".into(),
            type_source: "string_field".into(),
            user_override: None,
            effective_type: "run".into(),
            custom_label: None,
            start_time: start,
            end_time: end,
            distance_meters: Some(5000.0),
            calories: Some(300),
            avg_hr: Some(150),
            max_hr: Some(170),
            training_load: Some(40.0),
            vo2max: None,
            source_scope: SourceScope::Device,
            device_id: Some("SN-ONE".into()),
            synced_at: None,
            gps_available: false,
            sample_count: 0,
            zepp_source: None,
            zepp_type: None,
            ..Default::default()
        })
        .unwrap();
        // 同一天的另一条运动：日期范围会带上它，单条运动范围不该带。
        db.insert_workout(&Workout {
            workout_id: "other-workout".into(),
            workout_type: "walk".into(),
            normalized_type: "walk".into(),
            type_source: "string_field".into(),
            user_override: None,
            effective_type: "walk".into(),
            custom_label: None,
            start_time: end + chrono::Duration::hours(2),
            end_time: end + chrono::Duration::hours(3),
            distance_meters: Some(2000.0),
            calories: Some(90),
            avg_hr: Some(100),
            max_hr: Some(110),
            training_load: None,
            vo2max: None,
            source_scope: SourceScope::Device,
            device_id: Some("SN-ONE".into()),
            synced_at: None,
            gps_available: false,
            sample_count: 0,
            zepp_source: None,
            zepp_type: None,
            ..Default::default()
        })
        .unwrap();
        for (moment, value) in [
            (start + chrono::Duration::minutes(5), 152.0),
            (end + chrono::Duration::hours(4), 61.0),
        ] {
            db.insert_metric_sample(&MetricSample {
                metric: "heart_rate".into(),
                timestamp: moment,
                value,
                unit: "bpm".into(),
                source_scope: SourceScope::Device,
                device_id: Some("SN-ONE".into()),
            })
            .unwrap();
        }
        db.insert_daily_metric(&DailyMetric {
            date: start.with_timezone(&Local).format("%Y-%m-%d").to_string(),
            metric: "steps".into(),
            value: 9000.0,
            unit: "steps".into(),
            source_scope: SourceScope::Device,
            device_id: Some("SN-ONE".into()),
        })
        .unwrap();
        db.insert_sleep_session(&SleepSession {
            sleep_id: "sleep-1".into(),
            start_time: start - chrono::Duration::hours(8),
            end_time: start - chrono::Duration::hours(1),
            score: Some(80),
            duration_minutes: 420,
            deep_minutes: 90,
            light_minutes: 280,
            rem_minutes: Some(50),
            awake_minutes: 10,
            source_scope: SourceScope::Device,
            device_id: Some("SN-ONE".into()),
            synced_at: None,
            time_in_bed_minutes: None,
            stages: Vec::new(),
            wake_count: Some(1),
        })
        .unwrap();

        let selection = ExportSelection {
            scope: Some(ExportScope::Workout {
                workout_id: "target-workout".into(),
            }),
            start_date: None,
            end_date: None,
            data_types: ["workouts", "heart_rate", "steps", "sleep"]
                .iter()
                .map(|value| value.to_string())
                .collect(),
            detail: ExportDetail::Summary,
        };
        let (encoded, _) = db.build_ai_export(&selection).unwrap();
        let export: serde_json::Value = serde_json::from_str(&encoded).unwrap();

        // 只有这一条运动。
        let workouts = export["data"]["workouts"].as_array().unwrap();
        assert_eq!(workouts.len(), 1);
        assert_eq!(workouts[0]["workout_id"], "target-workout");

        // 逐点心率只截取运动进行期间的采样，四小时后那条不在里面。
        let samples = export["data"]["metric_samples"].as_array().unwrap();
        assert_eq!(samples.len(), 1, "运动时段之外的心率不该被带上");

        // 日级数据整块排除，并且如实说明是范围之外，而不是「这段时间没有」。
        assert!(export["data"]["daily_metrics"]
            .as_array()
            .unwrap()
            .is_empty());
        assert!(export["data"]["sleep_sessions"]
            .as_array()
            .unwrap()
            .is_empty());
        assert_eq!(
            export["capabilities"]["steps"]["status"],
            "excluded_by_scope"
        );
        assert_eq!(
            export["capabilities"]["sleep"]["status"],
            "excluded_by_scope"
        );

        // 范围本身要能被读到的人核对到具体这一条运动。
        assert_eq!(export["scope"]["kind"], "workout");
        assert_eq!(export["scope"]["workout_id"], "target-workout");
    }

    #[test]
    fn a_fetched_but_unparsed_stream_is_not_reported_as_empty() {
        // "empty_in_range" claims the stream is wired and the account has no
        // data. For a stream whose raw responses are on disk but whose field
        // mapping is not verified yet, that is false in a way that would send
        // a reader looking for a device problem that does not exist.
        let db = Database::in_memory().unwrap();
        db.insert_raw_record(&RawRecord {
            stream: "wellness".into(),
            source_key: "wellness:spo2:user_events:2023-11-01:2023-11-08".into(),
            source_scope: SourceScope::UserFused,
            device_id: None,
            start_utc: ts(),
            end_utc: Some(ts() + chrono::Duration::days(7)),
            payload: serde_json::json!({ "items": [] }),
            capability: CapabilityStatus::Unverified,
        })
        .unwrap();

        let export = parsed_export(&db, &["spo2", "sleep"], ExportDetail::Summary);
        let capabilities = &export["capabilities"];
        assert_eq!(capabilities["spo2"]["status"], "raw_pending");
        assert_eq!(capabilities["spo2"]["raw_records"], 1);
        // A stream with no raw responses at all still reports plain emptiness.
        assert_eq!(capabilities["sleep"]["status"], "empty_in_range");
    }

    #[test]
    fn daily_metric_sources_fold_with_the_fused_reading_first() {
        let db = Database::in_memory().unwrap();
        db.insert_daily_metric(&DailyMetric {
            date: "2023-11-15".into(),
            metric: "steps".into(),
            value: 67.0,
            unit: "steps".into(),
            source_scope: SourceScope::UserFused,
            device_id: None,
        })
        .unwrap();
        db.insert_daily_metric(&DailyMetric {
            date: "2023-11-15".into(),
            metric: "steps".into(),
            value: 99.0,
            unit: "steps".into(),
            source_scope: SourceScope::Device,
            device_id: Some("SN-ONE".into()),
        })
        .unwrap();

        let export = parsed_export(&db, &["steps"], ExportDetail::Summary);
        let rows = export["data"]["daily_metrics"].as_array().unwrap();
        assert_eq!(rows.len(), 1, "one day and one metric is one row");
        assert_eq!(rows[0]["value"], 67.0);
        assert_eq!(rows[0]["source_scope"], "user_fused");
        // The disagreeing device reading is kept, not silently dropped.
        let alternates = rows[0]["alternates"].as_array().unwrap();
        assert_eq!(alternates.len(), 1);
        assert_eq!(alternates[0]["value"], 99.0);
        assert_eq!(alternates[0]["source_scope"], "device");
    }

    #[test]
    fn one_physical_device_gets_one_label() {
        // Zepp stores an identity row per alias. The strap's rows share a
        // serial but differ in device_id, and keying a group on both reported
        // one device as two.
        let db = Database::in_memory().unwrap();
        for (alias, device_id) in [
            ("2445B138005129", "2445B138005129"),
            ("D85403FFFEE4D576", "D85403FFFEE4D576"),
        ] {
            db.conn
                .execute(
                    "INSERT INTO device_identities
                        (alias, name, firmware, serial, device_id, timezone, updated_at)
                     VALUES (?1, ?2, NULL, ?3, ?4, NULL, ?5)",
                    params![
                        alias,
                        "凌苍的Helio Strap",
                        "2445B138005129",
                        device_id,
                        Utc::now().to_rfc3339()
                    ],
                )
                .unwrap();
        }
        db.insert_metric_sample(&MetricSample {
            metric: "hrv".into(),
            timestamp: ts(),
            value: 45.0,
            unit: "ms".into(),
            source_scope: SourceScope::Device,
            device_id: Some("D85403FFFEE4D576".into()),
        })
        .unwrap();

        let export = parsed_export(&db, &["hrv"], ExportDetail::Summary);
        let devices = export["devices"].as_array().unwrap();
        assert_eq!(devices.len(), 1, "one strap must not appear twice");
        assert_eq!(devices[0]["label"], "device_1");
        assert_eq!(devices[0]["model"], "Amazfit Helio Strap");
        assert_eq!(devices[0]["kind"], "strap");
        // Neither the serial nor the user's nickname may leave the machine.
        let encoded = serde_json::to_string(&export).unwrap();
        assert!(!encoded.contains("2445B138005129"));
        assert!(!encoded.contains("凌苍"));
        assert_eq!(
            export["data"]["metric_samples"][0]["device_label"],
            "device_1"
        );
    }

    #[test]
    fn heart_rate_zones_offer_every_measured_basis_and_preselect_none() {
        let db = Database::in_memory().unwrap();
        // Nothing measured yet, so there is no defensible basis for any model.
        let empty = parsed_export(&db, &["workouts"], ExportDetail::Summary);
        assert!(
            empty["analysis"].get("heart_rate_zones").is_none(),
            "zones must not appear without a measured basis"
        );

        db.insert_workout(&Workout {
            workout_id: "1700000000".into(),
            workout_type: "run".into(),
            normalized_type: "run".into(),
            type_source: "string_field".into(),
            user_override: None,
            effective_type: "run".into(),
            custom_label: None,
            start_time: ts(),
            end_time: ts() + chrono::Duration::minutes(10),
            distance_meters: Some(1000.0),
            calories: Some(80),
            avg_hr: Some(140),
            max_hr: Some(200),
            training_load: Some(20.0),
            vo2max: None,
            source_scope: SourceScope::Device,
            device_id: None,
            synced_at: None,
            gps_available: false,
            sample_count: 0,
            zepp_source: None,
            zepp_type: None,
            ..Default::default()
        })
        .unwrap();

        let export = parsed_export(&db, &["workouts"], ExportDetail::Summary);
        let zones = &export["analysis"]["heart_rate_zones"];
        assert!(
            zones["selected_model"].is_null(),
            "the export must not choose a model on the user's behalf"
        );
        let models = zones["models"].as_array().unwrap();
        // Only the observed maximum exists, so only the max-HR model can be
        // computed; the reserve model needs a resting rate and the threshold
        // model a threshold, and neither is measured yet.
        assert_eq!(models.len(), 1);
        assert_eq!(models[0]["model"], "max_hr");
        assert_eq!(models[0]["selected"], false);
        assert_eq!(models[0]["bases"][0]["id"], "observed_max");
        assert_eq!(models[0]["bases"][0]["value"], 200.0);
        // 50-60% of 200 bpm.
        assert_eq!(models[0]["zones"][0]["min_bpm"], 100);
        assert_eq!(models[0]["zones"][0]["max_bpm"], 119);
        assert_eq!(models[0]["zones"].as_array().unwrap().len(), 5);
    }

    /// The three models are not house style: the watch ships its own
    /// boundaries in every workout summary. For a lactate threshold of
    /// 175 bpm it sends 113/141/154/162/173/190, and reproducing those exact
    /// integers is what proves the percentages and the flooring are right.
    #[test]
    fn threshold_zone_boundaries_match_the_watch() {
        let db = Database::in_memory().unwrap();
        db.insert_daily_metric(&DailyMetric {
            date: "2026-08-11".into(),
            metric: "lactate_threshold_hr".into(),
            value: 175.0,
            unit: "bpm".into(),
            source_scope: SourceScope::Device,
            device_id: None,
        })
        .unwrap();

        db.set_heart_rate_zone_preference(&HeartRateZonePreference {
            model: Some("lactate_threshold".into()),
            threshold_basis: Some("lactate_threshold".into()),
            ..Default::default()
        })
        .unwrap();
        let options = db.heart_rate_zone_options(30).unwrap();
        let report = options.report.expect("a chosen model produces zones");
        let lower: Vec<i32> = report.zones.iter().map(|zone| zone.min_bpm).collect();
        assert_eq!(lower, vec![113, 141, 154, 162, 173]);
        assert_eq!(
            report.zones[4].max_bpm, 189,
            "the 109% cap is 190 exclusive"
        );
        assert_eq!(report.bases[0].measured_at.as_deref(), Some("2026-08-11"));
    }

    /// A model can only be chosen once its basis is measured, and clearing the
    /// choice has to be a state the picker can return to.
    #[test]
    fn zone_preference_needs_a_measured_basis_and_can_be_cleared() {
        let db = Database::in_memory().unwrap();
        db.set_heart_rate_zone_preference(&HeartRateZonePreference {
            model: Some("lactate_threshold".into()),
            threshold_basis: Some("lactate_threshold".into()),
            ..Default::default()
        })
        .unwrap();
        let chosen = db.heart_rate_zone_options(30).unwrap();
        assert!(
            chosen.report.is_none(),
            "a preference naming a basis nothing measured yields no zones"
        );
        assert!(chosen.models.iter().all(|model| !model.available));

        db.set_heart_rate_zone_preference(&HeartRateZonePreference::default())
            .unwrap();
        let cleared = db.heart_rate_zone_options(30).unwrap();
        assert_eq!(cleared.preference, HeartRateZonePreference::default());
        assert!(cleared.report.is_none());
    }

    /// Charts must read the same numbers the export does, and must say how
    /// much of the window is actually covered rather than drawing through the
    /// gaps.
    #[test]
    fn metric_series_reports_coverage_and_prefers_the_fused_reading() {
        let db = Database::in_memory().unwrap();
        let today = Local::now().date_naive().format("%Y-%m-%d").to_string();
        for (scope, value) in [(SourceScope::Device, 40.0), (SourceScope::UserFused, 26.0)] {
            db.insert_daily_metric(&DailyMetric {
                date: today.clone(),
                metric: "stress".into(),
                value,
                unit: "score".into(),
                source_scope: scope,
                device_id: None,
            })
            .unwrap();
        }
        db.insert_daily_metric(&DailyMetric {
            date: today.clone(),
            metric: "stress_max".into(),
            value: 55.0,
            unit: "score".into(),
            source_scope: SourceScope::UserFused,
            device_id: None,
        })
        .unwrap();

        let series = db.metric_series(&["stress".to_string()], 7).unwrap();
        assert_eq!(series.len(), 1);
        assert_eq!(series[0].unit, "score");
        assert_eq!(series[0].window_days, 7);
        assert_eq!(
            series[0].days_with_data, 1,
            "six of the seven days are empty"
        );
        assert_eq!(series[0].points[0].value, 26.0);
        assert_eq!(series[0].points[0].max, Some(55.0));
        assert_eq!(series[0].points[0].min, None, "no minimum was measured");

        // An unknown name is skipped rather than charted with a made-up unit.
        assert!(db
            .metric_series(&["not_a_metric".to_string()], 7)
            .unwrap()
            .is_empty());
    }

    /// A stopped runner still gets `equivPace` readings, and the device sends
    /// them unchanged — 51604 s/km appears in this account's own library. They
    /// are not paces and must not reach a chart or a summary.
    #[test]
    fn standing_still_is_not_an_equivalent_pace() {
        assert_eq!(plausible_equivalent_pace(Some(355.0)), Some(355.0));
        assert_eq!(plausible_equivalent_pace(Some(51_604.0)), None);
        assert_eq!(plausible_equivalent_pace(Some(0.0)), None);
        assert_eq!(plausible_equivalent_pace(None), None);

        let samples = vec![
            WorkoutSeriesSample {
                timestamp: "1".into(),
                equivalent_pace_s_per_km: Some(51_604.0),
                ..Default::default()
            },
            WorkoutSeriesSample {
                timestamp: "2".into(),
                equivalent_pace_s_per_km: Some(264.0),
                ..Default::default()
            },
        ];
        let summary = workout_series_summary(&samples);
        assert_eq!(summary.best_equivalent_pace_s_per_km, Some(264.0));
    }

    #[test]
    fn acwr_stays_silent_until_the_chronic_window_is_covered() {
        let db = Database::in_memory().unwrap();
        // Nine days of load: enough for the acute window, nowhere near the
        // chronic one. A ratio here would read as a spike that never happened.
        for day in 1..=9 {
            db.insert_daily_metric(&DailyMetric {
                date: format!("2023-11-{day:02}"),
                metric: "training_load".into(),
                value: 100.0,
                unit: "load".into(),
                source_scope: SourceScope::Unknown,
                device_id: None,
            })
            .unwrap();
        }
        let export = parsed_export(&db, &["training_load"], ExportDetail::Summary);
        let days = export["analysis"]["training_load_balance"]["days"]
            .as_array()
            .unwrap();
        let ninth = days
            .iter()
            .find(|day| day["date"] == "2023-11-09")
            .expect("day in range");
        assert_eq!(ninth["acute_7d"], 700.0);
        assert_eq!(ninth["acute_days_with_data"], 7);
        assert!(
            ninth["acute_chronic_ratio"].is_null(),
            "a ratio against a partly empty chronic window is misleading"
        );
    }

    #[test]
    fn agreeing_daily_sources_do_not_produce_noise() {
        let db = Database::in_memory().unwrap();
        for (scope, device) in [
            (SourceScope::UserFused, None),
            (SourceScope::Device, Some("SN-ONE".to_string())),
        ] {
            db.insert_daily_metric(&DailyMetric {
                date: "2023-11-15".into(),
                metric: "steps".into(),
                value: 67.0,
                unit: "steps".into(),
                source_scope: scope,
                device_id: device,
            })
            .unwrap();
        }
        let export = parsed_export(&db, &["steps"], ExportDetail::Summary);
        let rows = export["data"]["daily_metrics"].as_array().unwrap();
        assert_eq!(rows.len(), 1);
        assert!(
            rows[0].get("alternates").is_none(),
            "sources that agree need no alternates block"
        );
    }

    #[test]
    fn zepp_pace_is_remapped_to_minutes_per_kilometre() {
        let from_speed = pace_minutes_per_kilometre(Some(0.4), Some(2.5)).unwrap();
        let from_reciprocal = pace_minutes_per_kilometre(Some(0.4), None).unwrap();
        assert!((from_speed - 6.666_666_666).abs() < 0.000_001);
        assert!((from_reciprocal - 6.666_666_666).abs() < 0.000_001);
        assert_eq!(pace_minutes_per_kilometre(Some(0.0), Some(0.0)), None);
    }

    #[test]
    fn workout_summary_uses_valid_samples_and_ignores_altitude_jumps() {
        let samples = vec![
            WorkoutSeriesSample {
                timestamp: "1".into(),
                heart_rate: None,
                speed: None,
                pace: Some(6.0),
                cadence: Some(160.0),
                stride_cm: Some(98.0),
                altitude_m: Some(10.0),
                ..Default::default()
            },
            WorkoutSeriesSample {
                timestamp: "2".into(),
                heart_rate: None,
                speed: None,
                pace: Some(7.0),
                cadence: Some(170.0),
                stride_cm: Some(102.0),
                altitude_m: Some(14.0),
                ..Default::default()
            },
            WorkoutSeriesSample {
                timestamp: "3".into(),
                heart_rate: None,
                speed: None,
                pace: Some(0.0),
                cadence: Some(0.0),
                stride_cm: None,
                altitude_m: Some(100.0),
                ..Default::default()
            },
        ];
        let summary = workout_series_summary(&samples);
        assert_eq!(summary.average_pace, Some(6.5));
        assert_eq!(summary.average_cadence, Some(165.0));
        assert_eq!(summary.max_cadence, Some(170.0));
        assert_eq!(summary.average_stride_cm, Some(100.0));
        assert_eq!(summary.elevation_gain_m, Some(4.0));
        assert_eq!(summary.elevation_loss_m, Some(0.0));
    }

    #[test]
    fn prefs_default_to_365_and_180_without_writing_old_30_day_retention() {
        let db = Database::in_memory().unwrap();
        let prefs = db.user_prefs().unwrap();
        assert_eq!(prefs.retention_days, 365);
        assert_eq!(prefs.history_sync_days, 180);
        assert!(db.get_app_meta("retention_days").unwrap().is_none());
    }

    #[test]
    fn local_coverage_is_empty_on_a_fresh_library() {
        let db = Database::in_memory().unwrap();
        let coverage = db.local_coverage().unwrap();
        assert_eq!(coverage.earliest_day, None);
        assert_eq!(coverage.latest_day, None);
        // 0 而不是「今天到今天 = 1 天」：库里一条都没有，覆盖就是零。
        assert_eq!(coverage.covered_days, 0);
    }

    #[test]
    fn local_coverage_takes_the_union_across_tables() {
        let db = Database::in_memory().unwrap();
        // 只有运动、没有日概览的账号是真实存在的。只查 daily_metrics 会把这类
        // 账号的覆盖范围少报好几个月——正是这里要防的。
        db.conn
            .execute(
                "INSERT INTO daily_metrics (date, metric, value, unit, source_scope)                  VALUES ('2026-06-10', 'steps', 1000.0, 'count', 'user_fused')",
                [],
            )
            .unwrap();
        db.conn
            .execute(
                "INSERT INTO workouts (workout_id, workout_type, start_time, end_time,                  source_scope) VALUES ('w1', 'run', '2026-03-02T07:00:00Z',                  '2026-03-02T08:00:00Z', 'device')",
                [],
            )
            .unwrap();

        let coverage = db.local_coverage().unwrap();
        assert_eq!(coverage.earliest_day.as_deref(), Some("2026-03-02"));
        assert_eq!(coverage.latest_day.as_deref(), Some("2026-06-10"));
        assert!(coverage.covered_days > 0);
    }

    #[test]
    fn missing_rem_is_stored_as_unavailable() {
        let db = Database::in_memory().unwrap();
        db.insert_sleep_session(&SleepSession {
            sleep_id: "sleep-no-rem".into(),
            start_time: ts(),
            end_time: ts() + chrono::Duration::minutes(400),
            score: Some(70),
            duration_minutes: 400,
            deep_minutes: 80,
            light_minutes: 200,
            rem_minutes: None,
            awake_minutes: 20,
            source_scope: SourceScope::Device,
            device_id: None,
            synced_at: None,
            time_in_bed_minutes: None,
            wake_count: None,
            stages: Vec::new(),
        })
        .unwrap();
        assert_eq!(
            db.get_sleep_detail("sleep-no-rem")
                .unwrap()
                .unwrap()
                .rem_minutes,
            None
        );
    }

    #[test]
    fn capability_overview_never_calls_missing_data_unsupported() {
        // This API answers "200 with no items" for event names that cannot
        // exist, so an absence never proves a device lacks a sensor. Saying
        // "your watch does not support blood pressure" to someone who simply
        // has not measured would send them shopping for hardware they own.
        let db = Database::in_memory().unwrap();
        let overview = db.capability_overview().unwrap();
        let by_stream: std::collections::BTreeMap<_, _> = overview
            .items
            .iter()
            .map(|item| (item.stream.as_str(), item))
            .collect();

        // Nothing synced yet: everything is absent, and nothing is condemned.
        assert!(overview
            .items
            .iter()
            .all(|item| item.status != "unsupported"));
        assert_eq!(by_stream["heart_rate"].status, "no_records");
        // A stream that needs a request and has never been checked says so.
        assert_eq!(by_stream["blood_pressure"].status, "unknown");
        assert_eq!(by_stream["blood_pressure"].source, "probed");

        db.insert_metric_sample(&MetricSample {
            metric: "heart_rate".into(),
            timestamp: Utc::now() - chrono::Duration::hours(2),
            value: 60.0,
            unit: "bpm".into(),
            source_scope: SourceScope::Device,
            device_id: None,
        })
        .unwrap();
        let overview = db.capability_overview().unwrap();
        let heart_rate = overview
            .items
            .iter()
            .find(|item| item.stream == "heart_rate")
            .unwrap();
        assert_eq!(heart_rate.status, "available");
        assert_eq!(heart_rate.records, 1);
        // Derived from stored rows, so it cost no request.
        assert_eq!(heart_rate.source, "derived");
    }

    #[test]
    fn only_an_outright_rejection_licenses_unsupported() {
        let db = Database::in_memory().unwrap();
        let probe = |status: &str| CapabilityProbe {
            stream: "blood_pressure".into(),
            surface: "v2_events".into(),
            cadence: "episodic".into(),
            window_days: 365,
            event_type: "blood_pressure".into(),
            sub_type: "real_data".into(),
            status: status.into(),
            records: 0,
            latest_date: None,
            fields: Vec::new(),
        };

        db.save_capability_probe(&[probe("empty")]).unwrap();
        let overview = db.capability_overview().unwrap();
        let item = overview
            .items
            .iter()
            .find(|item| item.stream == "blood_pressure")
            .unwrap();
        assert_eq!(item.status, "no_records", "an empty answer proves nothing");

        db.save_capability_probe(&[probe("unavailable")]).unwrap();
        let overview = db.capability_overview().unwrap();
        let item = overview
            .items
            .iter()
            .find(|item| item.stream == "blood_pressure")
            .unwrap();
        assert_eq!(item.status, "unsupported", "a rejection is evidence");
    }

    #[test]
    fn retention_rejects_unsafe_ranges() {
        let db = Database::in_memory().unwrap();
        assert!(db.cleanup_old_data(0).is_err());
        assert!(db.cleanup_old_data(366).is_err());
    }

    #[test]
    fn null_device_metric_key_deduplicates() {
        let db = Database::in_memory().unwrap();
        let sample = MetricSample {
            metric: "heart_rate".into(),
            timestamp: ts(),
            value: 70.0,
            unit: "bpm".into(),
            source_scope: SourceScope::Unknown,
            device_id: None,
        };
        db.insert_metric_sample(&sample).unwrap();
        let mut revised = sample.clone();
        revised.value = 71.0;
        db.insert_metric_sample(&revised).unwrap();
        assert_eq!(db.count_metric_samples().unwrap(), 1);
        assert_eq!(db.get_health_overview().unwrap().current_hr, Some(71));
    }

    #[test]
    fn device_lookup_does_not_fall_back_to_first_device() {
        let db = Database::in_memory().unwrap();
        db.upsert_device_identity(&DeviceIdentityHint {
            aliases: vec!["SN-ONE".into(), "MAC-ONE".into()],
            name: Some("Watch One".into()),
            firmware: Some("1.0.0".into()),
            serial: Some("SN-ONE".into()),
            device_id: Some("MAC-ONE".into()),
            timezone: None,
        })
        .unwrap();
        db.upsert_device_identity(&DeviceIdentityHint {
            aliases: vec!["SN-TWO".into(), "MAC-TWO".into()],
            name: Some("Watch Two".into()),
            firmware: Some("2.0.0".into()),
            serial: Some("SN-TWO".into()),
            device_id: Some("MAC-TWO".into()),
            timezone: None,
        })
        .unwrap();
        let one = db.lookup_device_profile("SN-ONE").unwrap().unwrap();
        let two = db.lookup_device_profile("MAC-TWO").unwrap().unwrap();
        assert_eq!(one.name.as_deref(), Some("Watch One"));
        assert_eq!(two.name.as_deref(), Some("Watch Two"));
        assert!(db.lookup_device_profile("UNKNOWN").unwrap().is_none());
    }

    #[test]
    fn device_data_summary_excludes_fused_records_and_keeps_identity_aliases() {
        let db = Database::in_memory().unwrap();
        let timestamp = ts();
        db.insert_metric_sample(&MetricSample {
            metric: "heart_rate".into(),
            timestamp,
            value: 72.0,
            unit: "bpm".into(),
            source_scope: SourceScope::Device,
            device_id: Some("SN-HELIO".into()),
        })
        .unwrap();
        db.insert_metric_sample(&MetricSample {
            metric: "heart_rate".into(),
            timestamp: timestamp + chrono::Duration::minutes(2),
            value: 80.0,
            unit: "bpm".into(),
            source_scope: SourceScope::UserFused,
            device_id: Some("SN-HELIO".into()),
        })
        .unwrap();
        let (has_data, latest) = db.device_data_summary(&["sn-helio".to_string()]).unwrap();
        assert!(has_data);
        assert_eq!(latest.as_deref(), Some("2023-11-14T22:13:20+00:00"));
        let (has_unknown, _) = db
            .device_data_summary(&["missing-device".to_string()])
            .unwrap();
        assert!(!has_unknown);
    }

    #[test]
    fn sleep_stages_round_trip_and_synced_at_is_not_end_time() {
        let db = Database::in_memory().unwrap();
        let start = ts();
        let end = start + chrono::Duration::minutes(400);
        db.insert_sleep_session(&SleepSession {
            sleep_id: "sleep-stages".into(),
            start_time: start,
            end_time: end,
            score: Some(80),
            duration_minutes: 380,
            deep_minutes: 80,
            light_minutes: 240,
            rem_minutes: Some(40),
            awake_minutes: 20,
            source_scope: SourceScope::Device,
            device_id: Some("SN-ONE".into()),
            synced_at: Some(start + chrono::Duration::hours(10)),
            time_in_bed_minutes: None,
            wake_count: None,
            stages: vec![SleepStageSlice {
                stage: "deep".into(),
                start_time: start,
                end_time: start + chrono::Duration::minutes(80),
                raw_mode: None,
            }],
        })
        .unwrap();
        let detail = db.get_sleep_detail("sleep-stages").unwrap().unwrap();
        assert_eq!(detail.stages.len(), 1);
        assert_eq!(detail.stages[0].stage, "deep");
        assert_eq!(detail.time_in_bed_minutes, None);
        assert_eq!(
            detail.synced_at.unwrap(),
            start + chrono::Duration::hours(10)
        );
        assert_ne!(detail.synced_at.unwrap(), detail.end_time);
    }

    #[test]
    fn workout_detail_persists_series_and_does_not_duplicate() {
        let db = Database::in_memory().unwrap();
        db.insert_workout(&Workout {
            workout_id: "1700000000".into(),
            workout_type: "run".into(),
            normalized_type: "run".into(),
            type_source: "numeric_mapped".into(),
            user_override: None,
            effective_type: "run".into(),
            custom_label: None,
            start_time: ts(),
            end_time: ts() + chrono::Duration::minutes(10),
            distance_meters: Some(1000.0),
            calories: Some(80),
            avg_hr: Some(140),
            max_hr: Some(160),
            training_load: None,
            vo2max: None,
            source_scope: SourceScope::Device,
            device_id: None,
            synced_at: None,
            gps_available: false,
            sample_count: 0,
            zepp_source: Some("run.gps".into()),
            zepp_type: Some(1),
            ..Default::default()
        })
        .unwrap();
        let payload = serde_json::json!({
            "trackid": 1_700_000_000i64,
            "source": "run.gps",
            "time": "0;1;",
            "longitude_latitude": "4004663552,11629333504;16403,8392;",
            "heart_rate": "1,80;1,2;"
        });
        assert_eq!(db.pending_running_details().unwrap().len(), 1);
        db.normalize_and_persist_raw(
            1,
            "workout_detail",
            "workout_detail:1700000000:run.gps",
            &payload,
        )
        .unwrap();
        db.normalize_and_persist_raw(
            1,
            "workout_detail",
            "workout_detail:1700000000:run.gps",
            &payload,
        )
        .unwrap();
        let series = db.get_workout_series("1700000000").unwrap();
        assert_eq!(series.route.len(), 2);
        assert!(!series.samples.is_empty());
        let sample_count: i64 = db
            .conn
            .query_row(
                "SELECT COUNT(*) FROM workout_samples WHERE workout_id = '1700000000'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(sample_count, series.samples.len() as i64);
        db.insert_raw_record(&RawRecord {
            stream: "workout_detail".into(),
            source_key: "workout_detail:1700000000:run.gps".into(),
            source_scope: SourceScope::Device,
            device_id: None,
            start_utc: ts(),
            end_utc: None,
            payload,
            capability: CapabilityStatus::Verified,
        })
        .unwrap();
        assert!(db.pending_running_details().unwrap().is_empty());
    }

    fn temp_dir(label: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "zeppbridge-storage-{}-{}-{}",
            label,
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn inflate_page_count(path: &Path, extra_pages: u32) {
        use std::fs::OpenOptions;
        use std::io::{Read, Seek, SeekFrom, Write};
        let mut file = OpenOptions::new()
            .read(true)
            .write(true)
            .open(path)
            .unwrap();
        let mut header = [0u8; 32];
        file.read_exact(&mut header).unwrap();
        let claimed = u32::from_be_bytes(header[28..32].try_into().unwrap());
        file.seek(SeekFrom::Start(28)).unwrap();
        file.write_all(&(claimed + extra_pages).to_be_bytes())
            .unwrap();
    }

    #[test]
    fn salvage_aligns_truncated_sqlite_page_count() {
        let dir = temp_dir("salvage");
        let path = dir.join("zepp.db");
        {
            let db = Database::new(path.clone()).unwrap();
            db.insert_metric_sample(&MetricSample {
                metric: "heart_rate".into(),
                timestamp: ts(),
                value: 70.0,
                unit: "bpm".into(),
                source_scope: SourceScope::Unknown,
                device_id: None,
            })
            .unwrap();
        }
        let _ = std::fs::remove_file(dir.join("zepp.db-wal"));
        let _ = std::fs::remove_file(dir.join("zepp.db-shm"));
        inflate_page_count(&path, 24);
        assert!(Database::new(path.clone()).is_err());
        let (db, warning) = Database::open_resilient(path.clone()).unwrap();
        assert!(warning.unwrap().contains("截断"));
        assert_eq!(db.count_metric_samples().unwrap(), 1);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn corrupt_library_is_quarantined_and_app_still_starts() {
        let dir = temp_dir("quarantine");
        let path = dir.join("zepp.db");
        std::fs::write(&path, b"this is not a sqlite database").unwrap();
        let (db, warning) = Database::open_resilient(path.clone()).unwrap();
        assert!(warning.unwrap().contains("损坏"));
        assert!(path.exists());
        assert_eq!(db.count_metric_samples().unwrap(), 0);
        let quarantined = std::fs::read_dir(dir.join("backups"))
            .unwrap()
            .filter_map(|entry| entry.ok())
            .any(|entry| entry.file_name().to_string_lossy().starts_with("corrupt-"));
        assert!(quarantined);
        let _ = std::fs::remove_dir_all(dir);
    }
}
