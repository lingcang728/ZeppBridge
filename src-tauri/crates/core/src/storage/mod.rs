use crate::decoder::{decode_workout_detail, DecodedWorkout};

use crate::models::{error::*, *};

use crate::normalizer::Normalizer;

use chrono::{DateTime, Duration, Local, NaiveDate, Utc};

use rusqlite::{params, Connection, OptionalExtension};

use serde::{Deserialize, Serialize};

use sha2::{Digest, Sha256};

use std::collections::{BTreeMap, BTreeSet, HashMap};

use std::path::{Path, PathBuf};

/// 当前 SQLite schema 版本（`PRAGMA user_version`）。加新版本只能追加迁移
/// 步骤，不要改已有 DDL。
pub const CURRENT_SCHEMA_VERSION: i64 = 34;

/// 写进备份 manifest 的应用版本。Core 是独立 crate，用它自己的包版本。
const APP_VERSION: &str = env!("CARGO_PKG_VERSION");

/// Accepted `ExportSelection::data_types`, shared with callers that validate input.
pub const EXPORT_DATA_TYPES: [&str; 18] = [
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
    // 饮食一度只登记在能力表（`CapabilityEvidence::DailyPrefix("intake_")`）
    // 里，却从来没进过这张允许表：`--types food` 被静默丢掉，摄入数据
    // 入了库、能画图、却导不出来。
    "food",
    "life_events",
];

/// 解析器修订号。**改了运动目录或任何归一化规则，就必须往前走一格。**
///
/// 启动时发现库里存的修订号和这个不一样，就把
/// `raw_records` 重新跑一遍。不动它，新加的编号只对以后同步来的记录生效，
/// 已经存成 `unknown:211` 的那 199 条记录会永远挂着——而报这个问题的人恰恰
/// 是因为历史记录才来报的。
pub const NORMALIZER_REVISION: &str = "zepp-normalizer-2026-09-v30-food-samples";

/// A metric actually present in the local library. This inventory deliberately
/// includes names outside the chart contract so new normalized data is findable.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredMetric {
    pub metric: String,
    pub source: String,
    pub unit: String,
    pub records: i64,
    pub first_date: String,
    pub last_date: String,
}

/// One stored reading, without device identifiers or raw cloud payloads.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredMetricRecord {
    pub date: String,
    pub timestamp: Option<String>,
    pub value: f64,
    pub unit: String,
    pub source_scope: String,
}

/// 较早公开版本的修订号，用于验证跨版本升级。
///
/// v21 还没有 v22 的圈解析和 v23 的 Rucking 映射；跳版本升级时要一并补齐。
#[cfg(test)]
const PREVIOUS_RELEASE_NORMALIZER_REVISION: &str = "zepp-normalizer-2026-09-v21-elliptical";

const LAST_CLOUD_SYNC_AT_KEY: &str = "last_cloud_sync_at";

const LAST_CLOUD_SYNC_OUTCOME_KEY: &str = "last_cloud_sync_outcome";

const LAST_LOCAL_REPROCESS_AT_KEY: &str = "last_local_reprocess_at";

const REPLAY_LAST_FAILURES_KEY: &str = "replay_last_failures";

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

/// 一次压缩读入内存的明文报文条数。整表装进一个 Vec 会在老库上顶满 RAM。
const COMPACTION_BATCH_RECORDS: usize = 32;

const RAW_PAYLOAD_STATS_KEY: &str = "raw_payload_stats_v1";

const RAW_PAYLOAD_STATS_GEN_KEY: &str = "raw_payload_stats_gen";

/// 少于这么多天的本机样本，不足以外推占用速率。
const MIN_OBSERVED_DAYS: i64 = 7;

/// 估算之外再留 200 MB。刚好填满磁盘和放不下一样糟糕。
const SPACE_SAFETY_MARGIN_BYTES: u64 = 200 * 1024 * 1024;

pub mod backup;

pub mod corrections;

pub mod coverage;

pub mod life_events;

mod migrations;

pub mod provenance;

pub mod write_lock;

mod ai_export;
mod capability;
mod devices;
mod diagnostics;
mod estimate;
mod event_windows;
mod freshness;
mod guards;
mod hr_zones;
mod ingest;
mod maintenance;
mod meta;
mod metric_spec;
mod metrics;
mod official;
mod open;
mod payload;
mod queries;
mod replay;
mod util;
mod workout_series;
mod writes;

pub(crate) use ai_export::*;
pub use capability::*;
pub use devices::*;
pub use freshness::*;
pub use guards::*;
use ingest::SerializedPayload;
pub(crate) use metric_spec::*;
pub use open::*;
use payload::*;
pub(crate) use queries::*;
pub use replay::*;
use util::*;

pub struct Database {
    /// crate 内可见：洞察、备份等同属 Core 的模块直接复用这条连接，
    /// 而不是各自再开一条去争锁。crate 之外仍然只能走公开方法。
    pub(crate) conn: Connection,
}

#[cfg(test)]
mod tests;
