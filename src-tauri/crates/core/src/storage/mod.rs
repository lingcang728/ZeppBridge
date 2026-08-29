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
pub const CURRENT_SCHEMA_VERSION: i64 = 13;
pub const NORMALIZER_REVISION: &str = "zepp-normalizer-2026-08-v16-workout-catalog";
const PREVIOUS_RELEASE_NORMALIZER_REVISION: &str = "zepp-normalizer-2026-08-v14";
const LAST_CLOUD_SYNC_AT_KEY: &str = "last_cloud_sync_at";
const LAST_CLOUD_SYNC_OUTCOME_KEY: &str = "last_cloud_sync_outcome";
const LAST_LOCAL_REPROCESS_AT_KEY: &str = "last_local_reprocess_at";
const RETENTION_DAYS_KEY: &str = "retention_days";
const HISTORY_SYNC_DAYS_KEY: &str = "history_sync_days";
const HEART_RATE_ZONE_PREF_KEY: &str = "heart_rate_zone_preference";
const BYTES_PER_HISTORY_DAY: u64 = 800_000;

pub mod corrections;
pub mod provenance;

pub struct Database {
    conn: Connection,
}

/// True while the startup replay is rewriting derived rows from stored raw
/// payloads.
///
/// The replay writes in bulk on its own connection; an automatic sync landing
/// in the middle of it used to lose the race for the write lock and surface as
/// a red "本地数据库暂时不可用". A sync that knows the replay is running can
/// stand aside and come back instead, which is the honest answer: nothing
/// failed, the library is busy healing itself.
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
const SERIES_METRICS: [(&str, MetricSource, &str); 22] = [
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
const CAPABILITY_ROWS: [(&str, CapabilityEvidence, i64); 15] = [
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
];

/// Streams with no local trace at all. Only these cost a request.
pub const PROBE_ONLY_CAPABILITIES: [&str; 3] = ["blood_pressure", "weight", "emotion"];

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
                    (row.0, row.1, "天")
                }
                CapabilityEvidence::Samples(metric) => {
                    let row = self.conn.query_row(
                        "SELECT COUNT(*), MAX(date(timestamp)) FROM metric_samples
                         WHERE metric = ?1 AND timestamp >= datetime('now', ?2)",
                        params![metric, format!("-{window_days} day")],
                        |row| Ok((row.get::<_, i64>(0)?, row.get::<_, Option<String>>(1)?)),
                    )?;
                    (row.0, row.1, "条")
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
                    (row.0, row.1, "条")
                }
            };
            items.push(CapabilityItem {
                stream: stream.to_string(),
                status: if records > 0 {
                    "available"
                } else {
                    "no_records"
                }
                .to_string(),
                records,
                records_unit: unit.to_string(),
                latest_date: latest,
                note: (records == 0).then(|| format!("最近 {window_days} 天没有记录")),
                source: "derived".to_string(),
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
                    latest_date: probe.latest_date.clone(),
                    note: None,
                    source: "probed".to_string(),
                },
                // Only an outright rejection licenses "your device does not
                // provide this"; an empty answer does not, because this API
                // answers that way for names that cannot exist.
                Some(probe) if probe.status == "unavailable" => CapabilityItem {
                    stream: stream.to_string(),
                    status: "unsupported".to_string(),
                    records: 0,
                    records_unit: "条".to_string(),
                    latest_date: None,
                    note: Some("你的账号或设备不提供这项数据".to_string()),
                    source: "probed".to_string(),
                },
                Some(_) => CapabilityItem {
                    stream: stream.to_string(),
                    status: "no_records".to_string(),
                    records: 0,
                    records_unit: "条".to_string(),
                    latest_date: None,
                    note: Some("过去一年没有测量记录".to_string()),
                    source: "probed".to_string(),
                },
                None => CapabilityItem {
                    stream: stream.to_string(),
                    status: "unknown".to_string(),
                    records: 0,
                    records_unit: "条".to_string(),
                    latest_date: None,
                    note: Some("尚未检测".to_string()),
                    source: "probed".to_string(),
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

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct StreamFreshness {
    pub last_cloud_sync_at: Option<String>,
    pub newest_sample_at: Option<String>,
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

    fn open_migrated(db_path: &std::path::Path) -> Result<Self> {
        let conn = Connection::open(db_path)?;
        Self::from_connection(conn)
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
    pub fn open_read_only(db_path: PathBuf) -> Result<Self> {
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

    fn migrate(&self) -> Result<()> {
        self.conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS schema_migrations (
                version INTEGER PRIMARY KEY,
                applied_at TEXT NOT NULL
            );",
        )?;
        let version: i64 = self
            .conn
            .query_row("PRAGMA user_version", [], |row| row.get(0))?;

        if version < 1 {
            self.conn.execute_batch(
                "CREATE TABLE IF NOT EXISTS source_accounts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    source_type TEXT NOT NULL,
                    region_host TEXT NOT NULL,
                    external_user_hash TEXT NOT NULL,
                    auth_state TEXT NOT NULL,
                    capabilities TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS raw_records (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    stream TEXT NOT NULL,
                    source_key TEXT NOT NULL,
                    source_scope TEXT NOT NULL,
                    device_id TEXT,
                    start_utc TEXT NOT NULL,
                    end_utc TEXT,
                    payload TEXT NOT NULL,
                    payload_hash TEXT NOT NULL,
                    fetched_at TEXT NOT NULL,
                    UNIQUE(stream, source_key)
                );
                CREATE TABLE IF NOT EXISTS metric_samples (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    metric TEXT NOT NULL,
                    timestamp TEXT NOT NULL,
                    value REAL NOT NULL,
                    unit TEXT NOT NULL,
                    source_scope TEXT NOT NULL,
                    device_id TEXT,
                    raw_record_id INTEGER,
                    FOREIGN KEY(raw_record_id) REFERENCES raw_records(id)
                );
                CREATE TABLE IF NOT EXISTS daily_metrics (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    date TEXT NOT NULL,
                    metric TEXT NOT NULL,
                    value REAL NOT NULL,
                    unit TEXT NOT NULL,
                    source_scope TEXT NOT NULL,
                    device_id TEXT,
                    raw_record_id INTEGER,
                    FOREIGN KEY(raw_record_id) REFERENCES raw_records(id)
                );
                CREATE TABLE IF NOT EXISTS sleep_sessions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    sleep_id TEXT NOT NULL UNIQUE,
                    start_time TEXT NOT NULL,
                    end_time TEXT NOT NULL,
                    score INTEGER,
                    duration_minutes INTEGER NOT NULL,
                    deep_minutes INTEGER NOT NULL,
                    light_minutes INTEGER NOT NULL,
                    rem_minutes INTEGER NOT NULL,
                    awake_minutes INTEGER NOT NULL,
                    source_scope TEXT NOT NULL,
                    device_id TEXT,
                    raw_record_id INTEGER,
                    FOREIGN KEY(raw_record_id) REFERENCES raw_records(id)
                );
                CREATE TABLE IF NOT EXISTS workouts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    workout_id TEXT NOT NULL UNIQUE,
                    workout_type TEXT NOT NULL,
                    start_time TEXT NOT NULL,
                    end_time TEXT NOT NULL,
                    distance_meters REAL,
                    calories INTEGER,
                    avg_hr INTEGER,
                    max_hr INTEGER,
                    training_load REAL,
                    vo2max REAL,
                    source_scope TEXT NOT NULL,
                    device_id TEXT,
                    raw_record_id INTEGER,
                    FOREIGN KEY(raw_record_id) REFERENCES raw_records(id)
                );
                CREATE TABLE IF NOT EXISTS sleep_stages (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    sleep_id TEXT NOT NULL,
                    stage TEXT NOT NULL,
                    start_time TEXT NOT NULL,
                    end_time TEXT NOT NULL,
                    FOREIGN KEY(sleep_id) REFERENCES sleep_sessions(sleep_id) ON DELETE CASCADE
                );
                CREATE TABLE IF NOT EXISTS workout_samples (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    workout_id TEXT NOT NULL,
                    timestamp TEXT NOT NULL,
                    heart_rate INTEGER,
                    pace REAL,
                    speed REAL,
                    cadence REAL,
                    altitude REAL,
                    FOREIGN KEY(workout_id) REFERENCES workouts(workout_id) ON DELETE CASCADE
                );
                CREATE TABLE IF NOT EXISTS route_points (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    workout_id TEXT NOT NULL,
                    timestamp TEXT NOT NULL,
                    latitude REAL NOT NULL,
                    longitude REAL NOT NULL,
                    altitude REAL,
                    FOREIGN KEY(workout_id) REFERENCES workouts(workout_id) ON DELETE CASCADE
                );
                CREATE TABLE IF NOT EXISTS sync_state (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    stream TEXT NOT NULL UNIQUE,
                    last_sync TEXT,
                    cursor TEXT,
                    status TEXT NOT NULL,
                    error TEXT,
                    needs_reauth INTEGER NOT NULL DEFAULT 0,
                    records_written INTEGER NOT NULL DEFAULT 0,
                    capability TEXT NOT NULL DEFAULT 'verified',
                    message TEXT,
                    updated_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_metric_samples_metric_timestamp
                    ON metric_samples(metric, timestamp);
                CREATE INDEX IF NOT EXISTS idx_daily_metrics_date_metric
                    ON daily_metrics(date, metric);
                CREATE INDEX IF NOT EXISTS idx_raw_records_fetched_at
                    ON raw_records(fetched_at);
                PRAGMA user_version = 1;",
            )?;
            self.conn.execute(
                "INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES(1, ?1)",
                [Utc::now().to_rfc3339()],
            )?;
        } else {
            // Databases created by the initial MVP may have the core tables but
            // lack the richer sync columns.  Add only missing columns so the
            // migration remains idempotent.
            self.ensure_table_columns(
                "sync_state",
                &[
                    ("cursor", "TEXT"),
                    ("needs_reauth", "INTEGER NOT NULL DEFAULT 0"),
                    ("records_written", "INTEGER NOT NULL DEFAULT 0"),
                    ("capability", "TEXT NOT NULL DEFAULT 'verified'"),
                    ("message", "TEXT"),
                ],
            )?;
            self.ensure_table_columns("raw_records", &[("payload_hash", "TEXT")])?;
        }

        // Expression indexes are needed because SQLite treats NULLs as distinct
        // in ordinary UNIQUE constraints.  COALESCE makes a missing device id a
        // deterministic part of the canonical key.
        //
        // The daily_metrics unique-key rebuild is destructive (DELETE + DROP +
        // CREATE INDEX). Running it on every launch of a 1GB library is how
        // a force-killed startup left a truncated file and flash-crashed the
        // next double-click. Only do that work when upgrading older schemas.
        if version < 4 {
            self.conn.execute_batch(
                "CREATE UNIQUE INDEX IF NOT EXISTS uq_metric_sample_key
                     ON metric_samples(metric, timestamp, unit, source_scope, COALESCE(device_id, ''));
                  DELETE FROM daily_metrics WHERE id NOT IN (
                      SELECT MIN(id) FROM daily_metrics
                      GROUP BY date, metric, unit, source_scope);
                  DROP INDEX IF EXISTS uq_daily_metric_key;
                  CREATE UNIQUE INDEX uq_daily_metric_key
                     ON daily_metrics(date, metric, unit, source_scope);
                 CREATE TABLE IF NOT EXISTS app_meta (
                     key TEXT PRIMARY KEY,
                     value TEXT NOT NULL,
                     updated_at TEXT NOT NULL
                 );
                 PRAGMA user_version = 4;",
            )?;
        } else {
            self.conn.execute_batch(
                "CREATE UNIQUE INDEX IF NOT EXISTS uq_metric_sample_key
                     ON metric_samples(metric, timestamp, unit, source_scope, COALESCE(device_id, ''));
                 CREATE UNIQUE INDEX IF NOT EXISTS uq_daily_metric_key
                     ON daily_metrics(date, metric, unit, source_scope);
                 CREATE TABLE IF NOT EXISTS app_meta (
                     key TEXT PRIMARY KEY,
                     value TEXT NOT NULL,
                     updated_at TEXT NOT NULL
                 );",
            )?;
        }
        self.conn.execute(
            "INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES(2, ?1)",
            [Utc::now().to_rfc3339()],
        )?;
        self.conn.execute(
            "INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES(3, ?1)",
            [Utc::now().to_rfc3339()],
        )?;
        self.ensure_table_columns(
            "sleep_sessions",
            &[("rem_available", "INTEGER NOT NULL DEFAULT 1")],
        )?;
        self.conn.execute(
            "INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES(4, ?1)",
            [Utc::now().to_rfc3339()],
        )?;
        self.ensure_table_columns("sleep_sessions", &[("synced_at", "TEXT")])?;
        self.ensure_table_columns(
            "workouts",
            &[
                ("synced_at", "TEXT"),
                ("gps_available", "INTEGER NOT NULL DEFAULT 0"),
                ("sample_count", "INTEGER NOT NULL DEFAULT 0"),
            ],
        )?;
        self.conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS device_identities (
                alias TEXT PRIMARY KEY,
                name TEXT,
                firmware TEXT,
                serial TEXT,
                device_id TEXT,
                timezone TEXT,
                updated_at TEXT NOT NULL
            );",
        )?;
        if let Err(error) = self.conn.execute(
            "UPDATE sleep_sessions
             SET synced_at = (
                 SELECT fetched_at FROM raw_records
                 WHERE raw_records.id = sleep_sessions.raw_record_id
             )
             WHERE synced_at IS NULL",
            [],
        ) {
            if !is_corrupt_sqlite(&error) {
                return Err(error.into());
            }
        }
        if let Err(error) = self.conn.execute(
            "UPDATE workouts
             SET synced_at = (
                 SELECT fetched_at FROM raw_records
                 WHERE raw_records.id = workouts.raw_record_id
             )
             WHERE synced_at IS NULL",
            [],
        ) {
            if !is_corrupt_sqlite(&error) {
                return Err(error.into());
            }
        }
        self.conn.execute(
            "INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES(5, ?1)",
            [Utc::now().to_rfc3339()],
        )?;
        self.conn.execute_batch("PRAGMA user_version = 5;")?;
        self.ensure_table_columns(
            "workouts",
            &[("zepp_source", "TEXT"), ("zepp_type", "INTEGER")],
        )?;
        self.ensure_table_columns("workout_samples", &[("stride", "REAL")])?;
        self.conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS workout_pauses (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                workout_id TEXT NOT NULL,
                start_time TEXT NOT NULL,
                end_time TEXT NOT NULL,
                kind TEXT NOT NULL,
                FOREIGN KEY(workout_id) REFERENCES workouts(workout_id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_workout_samples_workout
                ON workout_samples(workout_id, timestamp);
            CREATE INDEX IF NOT EXISTS idx_route_points_workout
                ON route_points(workout_id, timestamp);
            PRAGMA user_version = 6;",
        )?;
        self.conn.execute(
            "INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES(6, ?1)",
            [Utc::now().to_rfc3339()],
        )?;
        // daily_metrics' canonical key predates device attribution, so two
        // devices reporting the same metric on the same day collide and one
        // silently overwrites the other. metric_samples already keys on
        // COALESCE(device_id, '') (version 4); bring daily_metrics in line.
        // Widening a unique key can never surface a duplicate, so unlike the
        // version-4 rebuild this needs no DELETE. Gate it on the version so a
        // large library does not rebuild the index on every launch.
        if version < 7 {
            self.conn.execute_batch(
                "DROP INDEX IF EXISTS uq_daily_metric_key;
                 CREATE UNIQUE INDEX uq_daily_metric_key
                     ON daily_metrics(date, metric, unit, source_scope, COALESCE(device_id, ''));
                 PRAGMA user_version = 7;",
            )?;
        }
        self.conn.execute(
            "INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES(7, ?1)",
            [Utc::now().to_rfc3339()],
        )?;
        // Per-kilometre splits are derived from the raw detail payload, so the
        // table starts empty and fills in on the next normalizer replay.
        self.conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS workout_splits (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                workout_id TEXT NOT NULL,
                split_index INTEGER NOT NULL,
                start_time TEXT NOT NULL,
                end_time TEXT NOT NULL,
                distance_m REAL NOT NULL,
                duration_seconds INTEGER NOT NULL,
                pace_min_per_km REAL,
                avg_hr INTEGER,
                max_hr INTEGER,
                elevation_gain_m REAL,
                elevation_loss_m REAL,
                partial INTEGER NOT NULL,
                FOREIGN KEY(workout_id) REFERENCES workouts(workout_id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_workout_splits_workout
                ON workout_splits(workout_id, split_index);
            PRAGMA user_version = 8;",
        )?;
        self.conn.execute(
            "INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES(8, ?1)",
            [Utc::now().to_rfc3339()],
        )?;
        // `wc` has been in every band payload all along; nights already stored
        // backfill on the next normalizer replay.
        self.ensure_table_columns("sleep_sessions", &[("wake_count", "INTEGER")])?;
        self.conn.execute_batch("PRAGMA user_version = 9;")?;
        self.conn.execute(
            "INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES(9, ?1)",
            [Utc::now().to_rfc3339()],
        )?;
        // Running power and form come from the same detail payload the samples
        // already carry, so the columns start empty and fill in on the replay
        // that the revision bump triggers.
        self.ensure_table_columns(
            "workout_samples",
            &[
                ("power_watts", "REAL"),
                ("ground_contact_ms", "REAL"),
                ("vertical_oscillation_mm", "REAL"),
                ("vertical_ratio_pct", "REAL"),
                ("equivalent_pace_s", "REAL"),
            ],
        )?;
        self.conn.execute_batch("PRAGMA user_version = 10;")?;
        self.conn.execute(
            "INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES(10, ?1)",
            [Utc::now().to_rfc3339()],
        )?;
        // Keep Zepp's raw numeric fact, our interpretation, and a user's local
        // correction as separate layers. Existing rows are classified from the
        // evidence already stored; the revision bump then replays retained raw
        // records using the current normalizer without changing cloud sync time.
        self.ensure_table_columns(
            "workouts",
            &[
                ("workout_type_source", "TEXT NOT NULL DEFAULT 'missing'"),
                ("workout_type_override", "TEXT"),
                ("workout_type_conflict", "TEXT"),
            ],
        )?;
        if version < 11 {
            self.conn.execute_batch(
                "UPDATE workouts
                    SET workout_type_source = CASE
                        WHEN zepp_type IS NOT NULL AND workout_type LIKE 'unknown:%' THEN 'unknown_code'
                        WHEN zepp_type IS NOT NULL THEN 'numeric_mapped'
                        WHEN workout_type <> 'unknown' THEN 'string_field'
                        ELSE 'missing'
                    END;",
            )?;
        }
        self.conn.execute_batch("PRAGMA user_version = 11;")?;
        self.conn.execute(
            "INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES(11, ?1)",
            [Utc::now().to_rfc3339()],
        )?;
        // Per-stream provenance: fetch / parse / write are three different
        // things that can fail independently, and collapsing them into one
        // status is how "the data is stale" becomes unanswerable. The table
        // starts empty; `data_health` falls back to raw_records.fetched_at so
        // an upgraded library does not claim it has never fetched anything.
        //
        // The raw_record_id indexes make the "retained but never normalized"
        // count a lookup instead of four full scans of the canonical tables.
        self.conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS stream_provenance (
                stream TEXT PRIMARY KEY,
                last_fetch_ok_at TEXT,
                last_fetch_error_at TEXT,
                last_fetch_error_kind TEXT,
                last_fetch_error_message TEXT,
                last_parse_ok_at TEXT,
                last_parse_error_at TEXT,
                last_parse_error_kind TEXT,
                last_parse_error_message TEXT,
                last_write_ok_at TEXT,
                last_write_error_at TEXT,
                last_write_error_kind TEXT,
                last_write_error_message TEXT,
                last_written_records INTEGER NOT NULL DEFAULT 0,
                updated_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_metric_samples_raw
                ON metric_samples(raw_record_id);
            CREATE INDEX IF NOT EXISTS idx_daily_metrics_raw
                ON daily_metrics(raw_record_id);
            CREATE INDEX IF NOT EXISTS idx_sleep_sessions_raw
                ON sleep_sessions(raw_record_id);
            CREATE INDEX IF NOT EXISTS idx_workouts_raw
                ON workouts(raw_record_id);
            CREATE INDEX IF NOT EXISTS idx_raw_records_stream
                ON raw_records(stream);
            PRAGMA user_version = 12;",
        )?;
        self.conn.execute(
            "INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES(12, ?1)",
            [Utc::now().to_rfc3339()],
        )?;
        // The user-correction layer. Kept in its own tables so a normalizer
        // replay can rewrite ZeppBridge's interpretation without touching what
        // the user told us, and so a correction is always displayable as
        // "you filled this in" rather than as a recognition result.
        //
        // Both tables answer real reports: a custom Zepp training template
        // arrives as a numeric code the bundled catalog does not know, and some
        // accounts' device responses carry no product-name field at all, so no
        // amount of matching can name the watch.
        self.conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS workout_code_labels (
                zepp_type INTEGER PRIMARY KEY,
                label TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS device_model_overrides (
                device_key TEXT PRIMARY KEY,
                catalog_id TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            PRAGMA user_version = 13;",
        )?;
        self.conn.execute(
            "INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES(13, ?1)",
            [Utc::now().to_rfc3339()],
        )?;
        // Earlier migrations are intentionally idempotent and still stamp
        // their historical versions on every launch, so the current schema
        // marker is restored only after all of them have run.
        self.ensure_cloud_sync_metadata()?;
        Ok(())
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
            history_sync_days: self
                .read_pref_days(HISTORY_SYNC_DAYS_KEY, UserPrefs::DEFAULT_HISTORY_SYNC_DAYS)?,
        })
    }

    pub fn set_user_prefs(&self, prefs: &UserPrefs) -> Result<UserPrefs> {
        let retention_days =
            UserPrefs::clamp_days(prefs.retention_days).map_err(ZeppBridgeError::ConfigError)?;
        let history_sync_days =
            UserPrefs::clamp_days(prefs.history_sync_days).map_err(ZeppBridgeError::ConfigError)?;
        self.set_app_meta(RETENTION_DAYS_KEY, &retention_days.to_string())?;
        self.set_app_meta(HISTORY_SYNC_DAYS_KEY, &history_sync_days.to_string())?;
        Ok(UserPrefs {
            retention_days,
            history_sync_days,
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

    pub fn storage_estimate(
        &self,
        days: i64,
        data_dir: &std::path::Path,
    ) -> Result<StorageEstimate> {
        let days = UserPrefs::clamp_days(days).map_err(ZeppBridgeError::ConfigError)?;
        let database_bytes = std::fs::metadata(data_dir.join("zepp.db"))
            .map(|meta| meta.len())
            .unwrap_or(0);
        let estimated_add_bytes = (days as u64).saturating_mul(BYTES_PER_HISTORY_DAY);
        let free_bytes = disk_free_bytes(data_dir).unwrap_or(0);
        let warn_tight_space =
            free_bytes < 1_073_741_824 || (free_bytes > 0 && estimated_add_bytes > free_bytes / 5);
        let allow_long_history = !(free_bytes > 0 && free_bytes < 300 * 1024 * 1024 && days >= 90);
        let message = if free_bytes == 0 {
            "未能读取磁盘剩余空间，补拉前请确认本机还有足够空间。".into()
        } else if !allow_long_history {
            "磁盘剩余不足 300 MB，不能补拉 90 天以上的历史。".into()
        } else if warn_tight_space {
            "磁盘空间较紧，建议先只补拉 30 天。".into()
        } else {
            format!(
                "本盘大约剩余 {}，这次补拉大约占用 {}。",
                format_bytes(free_bytes),
                format_bytes(estimated_add_bytes)
            )
        };
        Ok(StorageEstimate {
            free_bytes,
            estimated_add_bytes,
            database_bytes,
            allow_long_history,
            warn_tight_space,
            message,
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
        let payload_hash = hex::encode(hasher.finalize());
        let fetched_at = Utc::now().to_rfc3339();
        self.conn.execute(
            "INSERT INTO raw_records
                (stream, source_key, source_scope, device_id, start_utc, end_utc,
                 payload, payload_hash, fetched_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
             ON CONFLICT(stream, source_key) DO UPDATE SET
                source_scope = excluded.source_scope,
                device_id = excluded.device_id,
                start_utc = excluded.start_utc,
                end_utc = excluded.end_utc,
                payload = excluded.payload,
                payload_hash = excluded.payload_hash,
                fetched_at = excluded.fetched_at",
            params![
                record.stream,
                record.source_key,
                record.source_scope.as_str(),
                record.device_id,
                record.start_utc.to_rfc3339(),
                record.end_utc.map(|value| value.to_rfc3339()),
                payload,
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
                self.clear_normalized_for_raw(raw_record_id, stream)?;
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
                let decoded = decode_workout_detail(payload, summary_end)?;
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
            "heart_rate" | "hrv" => {
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
            "workouts" => {
                self.conn.execute(
                    "DELETE FROM workouts WHERE raw_record_id = ?1",
                    [raw_record_id],
                )?;
            }
            "workout_detail" => {}
            _ => {}
        }
        Ok(())
    }

    pub fn reprocess_raw_records_if_needed(&self) -> Result<Option<BTreeMap<String, i64>>> {
        let current = self
            .conn
            .query_row(
                "SELECT value FROM app_meta WHERE key = 'normalizer_revision'",
                [],
                |row| row.get::<_, String>(0),
            )
            .optional()?;
        if current.as_deref() == Some(NORMALIZER_REVISION) {
            return Ok(None);
        }
        // v0.10.0 already contains every non-workout normalization change that
        // precedes this revision. Replaying only workout summaries avoids
        // decoding very large, unrelated daily-summary payloads during the
        // v0.11.0 upgrade while still applying the new sport catalog.
        if current.as_deref() == Some(PREVIOUS_RELEASE_NORMALIZER_REVISION) {
            return self
                .reprocess_raw_records_for_stream(Some("workouts"))
                .map(Some);
        }
        self.reprocess_raw_records().map(Some)
    }

    pub fn reprocess_raw_records(&self) -> Result<BTreeMap<String, i64>> {
        self.reprocess_raw_records_for_stream(None)
    }

    fn reprocess_raw_records_for_stream(
        &self,
        stream_filter: Option<&str>,
    ) -> Result<BTreeMap<String, i64>> {
        let _replay_guard = ReplayGuard::enter();
        let raw_records = if let Some(stream) = stream_filter {
            let mut stmt = self.conn.prepare(
                "SELECT id, stream, source_key, payload
                 FROM raw_records WHERE stream = ?1 ORDER BY id",
            )?;
            let rows = stmt.query_map([stream], |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                ))
            })?;
            rows.collect::<std::result::Result<Vec<_>, _>>()?
        } else {
            let mut stmt = self
                .conn
                .prepare("SELECT id, stream, source_key, payload FROM raw_records ORDER BY id")?;
            let rows = stmt.query_map([], |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                ))
            })?;
            rows.collect::<std::result::Result<Vec<_>, _>>()?
        };

        let mut counts = BTreeMap::<String, i64>::new();
        let mut band_heart_rate = 0i64;
        for (id, stream, source_key, encoded_payload) in raw_records {
            let payload: serde_json::Value = serde_json::from_str(&encoded_payload)
                .map_err(|error| ZeppBridgeError::ParseError(error.to_string()))?;
            if let Ok(result) = self.normalize_and_persist_raw(id, &stream, &source_key, &payload) {
                *counts.entry(stream.clone()).or_default() += result.primary_records;
                band_heart_rate += result.band_heart_rate_records;
            }
        }
        if band_heart_rate > 0 {
            counts.insert("heart_rate".to_string(), band_heart_rate);
        }

        for stream in counts.keys().cloned().collect::<Vec<_>>() {
            counts.insert(stream.clone(), self.normalized_stream_count(&stream)?);
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

    fn normalized_stream_count(&self, stream: &str) -> Result<i64> {
        let (query, parameter): (&str, Option<&str>) = match stream {
            "heart_rate" => (
                "SELECT COUNT(*) FROM metric_samples WHERE metric = ?1",
                Some("heart_rate"),
            ),
            "hrv" => (
                "SELECT COUNT(*) FROM metric_samples WHERE metric = ?1",
                Some("hrv"),
            ),
            "daily_summary" => ("SELECT COUNT(*) FROM daily_metrics", None),
            "sleep" => ("SELECT COUNT(*) FROM sleep_sessions", None),
            "workouts" => ("SELECT COUNT(*) FROM workouts", None),
            "workout_detail" => ("SELECT COUNT(*) FROM workout_samples", None),
            _ => return Ok(0),
        };
        if let Some(parameter) = parameter {
            self.conn
                .query_row(query, [parameter], |row| row.get(0))
                .map_err(Into::into)
        } else {
            self.conn
                .query_row(query, [], |row| row.get(0))
                .map_err(Into::into)
        }
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
                 workout_type_source, workout_type_override, workout_type_conflict)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21)
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
                workout_type_conflict = excluded.workout_type_conflict",
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
            ],
        )?;
        Ok(())
    }

    pub fn diagnostic_schema_version(&self) -> Result<i64> {
        self.conn
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .map_err(Into::into)
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
                "INSERT INTO sleep_stages (sleep_id, stage, start_time, end_time)
                 VALUES (?1, ?2, ?3, ?4)",
                params![
                    sleep_id,
                    stage.stage,
                    stage.start_time.to_rfc3339(),
                    stage.end_time.to_rfc3339(),
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
            "SELECT stage, start_time, end_time FROM sleep_stages
             WHERE sleep_id = ?1 ORDER BY start_time, id",
        )?;
        let rows = stmt.query_map([sleep_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        })?;
        let mut stages = Vec::new();
        for row in rows {
            let (stage, start, end) = row?;
            stages.push(SleepStageSlice {
                stage,
                start_time: parse_datetime(&start, "sleep_stages.start_time")?,
                end_time: parse_datetime(&end, "sleep_stages.end_time")?,
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

    pub fn get_recent_sleep_sessions(&self, limit: usize) -> Result<Vec<SleepSession>> {
        let limit = i64::try_from(limit).unwrap_or(i64::MAX).max(0);
        let mut stmt = self.conn.prepare(
            "SELECT sleep_id, start_time, end_time, score, duration_minutes,
                    deep_minutes, light_minutes, rem_minutes, rem_available, awake_minutes,
                    source_scope, device_id, synced_at, wake_count
             FROM sleep_sessions ORDER BY start_time DESC LIMIT ?1",
        )?;
        let rows = stmt.query_map([limit], |row| {
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

    pub fn get_recent_workouts(&self, limit: usize) -> Result<Vec<Workout>> {
        let limit = i64::try_from(limit).unwrap_or(i64::MAX).max(0);
        let mut stmt = self.conn.prepare(
            "SELECT workout_id, workout_type, start_time, end_time,
                    distance_meters, calories, avg_hr, max_hr,
                    training_load, vo2max, source_scope, device_id,
                    synced_at, gps_available, sample_count, zepp_type,
                    workout_type_source, workout_type_override
             FROM workouts ORDER BY start_time DESC LIMIT ?1",
        )?;
        let rows = stmt.query_map([limit], |row| {
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
                        workout_type_source, workout_type_override
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
        )) = row
        else {
            return Ok(None);
        };
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
    ) -> Result<serde_json::Map<String, serde_json::Value>> {
        let mut analysis = serde_json::Map::new();

        if selected.contains("workouts") {
            if let Some(zones) = self.heart_rate_zone_variants(start_text, end_text)? {
                analysis.insert("heart_rate_zones".into(), zones);
            }
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
        let mut stmt = self.conn.prepare(
            "SELECT date(timestamp, 'localtime') AS day,
                    AVG(value), MIN(value), MAX(value), COUNT(*)
             FROM metric_samples
             WHERE metric = ?1 AND date(timestamp, 'localtime') BETWEEN ?2 AND ?3
             GROUP BY day ORDER BY day",
        )?;
        let rows = stmt.query_map(params![metric, start, end], |row| {
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
    ) -> Result<Option<serde_json::Value>> {
        let bases = self.heart_rate_bases()?;
        if bases.is_empty() {
            return Ok(None);
        }
        let preference = self.heart_rate_zone_preference()?;
        let histogram = self.workout_heart_rate_histogram(start_text, end_text)?;
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
    fn workout_heart_rate_histogram(&self, start: &str, end: &str) -> Result<BTreeMap<i32, i64>> {
        let mut stmt = self.conn.prepare(
            "SELECT workout_samples.heart_rate, COUNT(*)
             FROM workout_samples
             JOIN workouts ON workouts.workout_id = workout_samples.workout_id
             WHERE workout_samples.heart_rate IS NOT NULL
               AND workout_samples.heart_rate > 0
               AND date(workouts.start_time, 'localtime') BETWEEN ?1 AND ?2
             GROUP BY workout_samples.heart_rate",
        )?;
        let rows = stmt.query_map(params![start, end], |row| {
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
        let start = NaiveDate::parse_from_str(&selection.start_date, "%Y-%m-%d")
            .map_err(|_| ZeppBridgeError::ConfigError("导出开始日期无效".into()))?;
        let end = NaiveDate::parse_from_str(&selection.end_date, "%Y-%m-%d")
            .map_err(|_| ZeppBridgeError::ConfigError("导出结束日期无效".into()))?;
        if end < start {
            return Err(ZeppBridgeError::ConfigError(
                "导出结束日期不能早于开始日期".into(),
            ));
        }
        if (end - start).num_days() > 365 {
            return Err(ZeppBridgeError::ConfigError(
                "单次导出范围不能超过 366 天".into(),
            ));
        }
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
        {
            let mut stmt = self.conn.prepare(
                "SELECT metric, timestamp, value, unit, source_scope, device_id
                 FROM metric_samples
                 WHERE date(timestamp, 'localtime') BETWEEN ?1 AND ?2
                 ORDER BY timestamp",
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
        if selected.contains("daily_activity")
            || selected.contains("recovery")
            || selected.contains("steps")
            || selected.contains("spo2")
            || selected.contains("stress")
            || selected.contains("training_load")
            || selected.contains("vo2max")
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
        if selected.contains("sleep") {
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
                        zepp_type, workout_type_source, workout_type_override
                 FROM workouts
                 WHERE date(start_time, 'localtime') BETWEEN ?1 AND ?2
                 ORDER BY start_time",
            )?;
            let rows = stmt.query_map(params![start_text, end_text], |row| {
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
                ) = row?;
                let series = self.get_workout_series(&workout_id)?;
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
                        "note": "该数据流已接入，但这段时间没有记录",
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

        let analysis = self.export_analysis(&start_text, &end_text, &selected)?;

        let record_count =
            metric_samples.len() + daily_metrics.len() + sleep_sessions.len() + workouts.len();
        let detail_note = if full {
            "detail=full：逐秒运动序列与逐条心率原样导出。"
        } else {
            "detail=summary：心率按小时聚合为 min/avg/max，逐秒运动序列省略（sample_count 说明有多少条）；结构化指标全部完整。需要原始序列请用 detail=full 重新导出。"
        };
        let export = serde_json::json!({
            "schema_version": "zeppbridge.ai.v2",
            "generated_at": Utc::now().to_rfc3339(),
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
        if !trimmed.is_empty() && !aliases.iter().any(|existing| existing == trimmed) {
            aliases.push(trimmed.to_string());
        }
    }
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
        hints.push(DeviceIdentityHint {
            device_id: string_field(object, &["device_id", "deviceId", "deviceid"]),
            serial: string_field(object, &["sn", "serial", "serialNumber"]),
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
    #[cfg(not(windows))]
    {
        let _ = path;
        None
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

#[cfg(test)]
mod tests {
    use super::*;

    fn ts() -> DateTime<Utc> {
        DateTime::from_timestamp(1_700_000_000, 0).unwrap()
    }

    fn export_selection(types: &[&str], detail: ExportDetail) -> ExportSelection {
        ExportSelection {
            start_date: "2023-11-01".into(),
            end_date: "2023-11-30".into(),
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
        }
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
    fn v14_upgrade_replays_workouts_without_touching_unrelated_large_streams() {
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
                    "type": 52
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

        assert_eq!(counts.get("workouts"), Some(&1));
        assert_eq!(db.normalized_stream_count("daily_summary").unwrap(), 0);
        assert_eq!(db.normalized_stream_count("workouts").unwrap(), 1);
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
                },
                SleepStageSlice {
                    stage: "deep".into(),
                    start_time: start + chrono::Duration::minutes(30),
                    end_time: start + chrono::Duration::minutes(90),
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
