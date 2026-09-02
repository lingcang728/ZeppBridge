//! 逐流 provenance 与数据健康中心的后端契约。
//!
//! 三条互不冒充的时间线：
//!
//! * **云端同步时间** —— 什么时候从 Zepp 把报文拿回来（`raw_records.fetched_at`）；
//! * **本地重放时间** —— 什么时候用当前 normalizer 重新解释了本地报文；
//! * **数据样本时间** —— 手表上这条记录本身发生在什么时候。
//!
//! 本地重放不会改写云端同步时间，手动重新解析也不会。任何一个都不能拿来
//! 冒充另一个：用户问「我的数据新不新」和「你什么时候连过云」是两个问题。
//!
//! 每个 stream 分别记录 fetch / parse / write 三个阶段最近一次成功和失败，
//! 失败带稳定的机器可读类别，这样界面能说清「是没拉到、没看懂，还是没写进去」，
//! 而不是笼统的一个红点。

use super::{Database, NORMALIZER_REVISION};
use crate::models::error::Result;
use chrono::{Duration, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

pub const LAST_LOCAL_REPLAY_AT_KEY: &str = "last_local_replay_at";
pub const LAST_MANUAL_REPROCESS_AT_KEY: &str = "last_manual_reprocess_at";
pub const LAST_INTEGRITY_CHECK_KEY: &str = "last_integrity_check";

/// 覆盖解释里最多列出多少个缺口日期。缺口很多时列全部只会变成噪音，
/// 页面显示前 N 个加一个总数。
const MAX_REPORTED_GAPS: usize = 12;

/// 数据流的节奏。不同节奏的「空白」含义完全不同：连续流缺一天是缺口，
/// 偶发流缺一天是正常。用统一的完整度百分比去衡量它们必然误导用户。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum StreamCadence {
    /// 一天之内应当有多次采样，例如心率。
    Continuous,
    /// 一天一条，例如步数、静息心率。
    Daily,
    /// 一夜一条，例如睡眠、HRV。
    Nightly,
    /// 只有发生了才有，例如运动记录。
    PerEvent,
    /// 手表偶尔才给一次，例如 VO₂max、乳酸阈值。空白不代表故障。
    Occasional,
}

impl StreamCadence {
    /// 这个节奏是否可以用「缺了哪几天」来解释。偶发和按事件的流不行。
    fn has_expected_days(self) -> bool {
        matches!(
            self,
            StreamCadence::Continuous | StreamCadence::Daily | StreamCadence::Nightly
        )
    }
}

/// 三阶段中某一阶段的状态。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct StageState {
    /// `ok` / `failed` / `never`。`never` 是「从来没走到这一步」，
    /// 不是失败，界面不能画成红色。
    pub state: String,
    /// 最近一次成功（`ok`）或失败（`failed`）的时间。
    pub at: Option<String>,
    /// 最近一次成功的时间，即使当前是失败态也保留，用来说明「上次好是什么时候」。
    pub last_ok_at: Option<String>,
    /// 稳定的失败类别，见 [`StageErrorKind`]。
    pub error_kind: Option<String>,
    pub message: Option<String>,
}

impl StageState {
    fn never() -> Self {
        Self {
            state: "never".into(),
            at: None,
            last_ok_at: None,
            error_kind: None,
            message: None,
        }
    }
}

/// 失败类别。字符串是契约的一部分：CLI、MCP 和界面都按它分支，
/// 不要为了文案好看改这些值。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StageErrorKind {
    /// 网络不通、超时、连接被拒。
    Network,
    /// 需要重新登录 Zepp。
    Auth,
    /// 云端明确表示这个账号/设备没有这条流。
    NotAvailable,
    /// 报文拿回来了，但当前 normalizer 不认识它的结构。
    UnrecognizedPayload,
    /// 本地写库失败。
    Storage,
    /// 另一个进程正在写同一个库，这一轮让开了。可重试，不是坏了。
    Busy,
    /// 用户取消。
    Cancelled,
    Unknown,
}

impl StageErrorKind {
    pub fn as_str(self) -> &'static str {
        match self {
            StageErrorKind::Network => "network",
            StageErrorKind::Auth => "auth",
            StageErrorKind::NotAvailable => "not_available",
            StageErrorKind::UnrecognizedPayload => "unrecognized_payload",
            StageErrorKind::Storage => "storage",
            StageErrorKind::Busy => "busy",
            StageErrorKind::Cancelled => "cancelled",
            StageErrorKind::Unknown => "unknown",
        }
    }
}

impl StageErrorKind {
    /// 把内部错误映射成稳定的阶段失败类别。
    ///
    /// 这里做的是「用户下一步该干什么」的分类，不是错误文本的转写：
    /// `auth` 要去重新连接，`network` 值得重试，`not_available` 是这个账号
    /// 本来就没有这条流，重试多少次都没用。
    pub fn classify(error: &crate::models::ZeppBridgeError) -> Self {
        use crate::models::ZeppBridgeError as E;
        match error {
            E::Cancelled => StageErrorKind::Cancelled,
            E::NeedsReauth(_) | E::AuthError(_) | E::CredentialStore(_) => StageErrorKind::Auth,
            E::Unavailable(_) | E::DataUnavailable(_) => StageErrorKind::NotAvailable,
            E::NetworkError(_) | E::RetryExhausted { .. } | E::HttpStatus { .. } => {
                StageErrorKind::Network
            }
            E::ParseError(_) => StageErrorKind::UnrecognizedPayload,
            E::Busy(_) => StageErrorKind::Busy,
            E::DatabaseError(_) | E::IoError(_) => StageErrorKind::Storage,
            E::InvalidHost(_) | E::ConfigError(_) | E::Unknown(_) => StageErrorKind::Unknown,
        }
    }
}

/// 一次阶段结果。写入 provenance 表的最小单位。
#[derive(Debug, Clone)]
pub enum StageOutcome {
    Ok,
    Failed {
        kind: StageErrorKind,
        message: Option<String>,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Stage {
    Fetch,
    Parse,
    Write,
}

impl Stage {
    fn column_prefix(self) -> &'static str {
        match self {
            Stage::Fetch => "fetch",
            Stage::Parse => "parse",
            Stage::Write => "write",
        }
    }
}

/// 某个数据流按来源拆开的记录数。
///
/// `device` = 单设备上报，`user_fused` = Zepp 在云端融合过，`unknown` = 报文
/// 没说。来源未知时不静默当成设备数据，也不把不同设备的数值相加或平均。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SourceBreakdown {
    pub source: String,
    pub records: i64,
}

/// 覆盖解释。按流的节奏给出不同的表达，绝不用一个统一的完整度百分比。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CoverageExplanation {
    /// `gaps` = 可以说「缺了哪几天」；`observations` = 只能说「哪几天观察到了」。
    pub kind: String,
    pub window_days: i64,
    pub observed_days: i64,
    /// 只有 `kind == "gaps"` 时才有意义。最多列 [`MAX_REPORTED_GAPS`] 个。
    pub gap_dates: Vec<String>,
    pub gap_total: i64,
    pub first_observed_at: Option<String>,
    pub latest_observed_at: Option<String>,
    pub note: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct StreamHealth {
    pub stream: String,
    pub label: String,
    pub cadence: StreamCadence,
    pub fetch: StageState,
    pub parse: StageState,
    pub write: StageState,
    pub raw_records: i64,
    pub canonical_records: i64,
    pub last_written_records: i64,
    pub sources: Vec<SourceBreakdown>,
    pub coverage: CoverageExplanation,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DatabaseHealth {
    pub schema_version: i64,
    /// 这个程序按哪一版规则解析。
    pub normalizer_revision: String,
    /// 库里的派生数据是哪一版规则产出的。`None` = 从没重放过。
    ///
    /// 和上面那个分开，是因为它们可以不相等，而不相等正是要报告的事：
    /// 只报程序自己的修订号，等于对着一个历史还停在旧规则上的库说
    /// 「修订号：当前」。桌面应用启动就重放，所以那边几乎永远相等；
    /// 只有命令行的人没有那次启动，这两个值可以差上好几个版本。
    #[serde(default)]
    pub stored_normalizer_revision: Option<String>,
    /// 库里存着报文，而它们是另一版解析器归一化的——欠一次重放。
    #[serde(default)]
    pub normalizer_replay_pending: bool,
    /// 后台重放正在进行。此时云端同步会以 `deferred` 让路，这不是失败。
    pub replay_in_progress: bool,
    pub database_bytes: u64,
    pub raw_records: i64,
    pub canonical_records: i64,
    /// 已保留但当前 normalizer 还没能产出任何 canonical 行的 raw 报文数。
    pub pending_normalization: i64,
    /// 最近一次 `PRAGMA integrity_check` 的结果，`None` = 从没跑过。
    /// 这是显式动作，不在每次打开页面时自动跑。
    pub last_integrity_check: Option<IntegrityCheckResult>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct IntegrityCheckResult {
    pub checked_at: String,
    pub ok: bool,
    /// 失败时 SQLite 的第一条说明。不包含文件路径。
    pub detail: Option<String>,
}

/// 四个互不冒充的时间。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct HealthTimings {
    pub last_cloud_sync_at: Option<String>,
    pub last_cloud_sync_outcome: Option<String>,
    pub last_local_replay_at: Option<String>,
    pub last_manual_reprocess_at: Option<String>,
    /// 全库最新的一条健康样本时间。和上面三个都不是一回事。
    pub newest_sample_at: Option<String>,
}

/// 页面可以直接执行的修复动作。id 是稳定契约，前端据此映射到已有命令。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct HealthAction {
    pub id: String,
    /// 动作的稳定码，界面按它出文案。
    ///
    /// 和 `id` 分开是因为 `id` 是**执行**用的（两个不同的动作都跑同一条同步
    /// 命令，所以 id 相同），而文案要能分得清「再同步一次」和「做第一次同步」。
    /// `label` / `reason` 保持中文，那是 CLI 的输出，不跟界面语言走。
    #[serde(default)]
    pub code: String,
    pub label: String,
    pub reason: String,
    /// 需要二次确认的动作（清理、恢复等）。
    pub destructive: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DataHealth {
    pub generated_at: String,
    pub database: DatabaseHealth,
    pub timings: HealthTimings,
    pub streams: Vec<StreamHealth>,
    /// 偶发指标单独一组：只显示观察到的日期和最近一次，不参与缺口判定。
    pub occasional_metrics: Vec<StreamHealth>,
    pub actions: Vec<HealthAction>,
}

/// 同步流目录。顺序即界面顺序。
const STREAM_CATALOG: [(&str, &str, StreamCadence); 7] = [
    ("heart_rate", "心率", StreamCadence::Continuous),
    ("daily_summary", "每日概览", StreamCadence::Daily),
    ("sleep", "睡眠", StreamCadence::Nightly),
    ("hrv", "心率变异性", StreamCadence::Nightly),
    ("wellness", "压力 / 血氧等可选指标", StreamCadence::Daily),
    ("workouts", "运动记录", StreamCadence::PerEvent),
    ("workout_detail", "运动明细与轨迹", StreamCadence::PerEvent),
];

/// 已知节奏的指标。没列在这里的指标一律按 `Occasional` 处理 —— 宁可少报
/// 一个缺口，也不要把手表本来就少给的指标画成红色故障。
fn metric_cadence(metric: &str) -> StreamCadence {
    match metric {
        "heart_rate" => StreamCadence::Continuous,
        "steps" | "calories" | "distance" | "active_minutes" | "resting_heart_rate"
        | "training_load" | "stress" | "blood_oxygen" | "all_day_stress" => StreamCadence::Daily,
        "hrv" | "hrv_rmssd" | "sleep_score" | "breathing_rate" | "skin_temperature" => {
            StreamCadence::Nightly
        }
        _ => StreamCadence::Occasional,
    }
}

fn metric_label(metric: &str) -> String {
    match metric {
        "vo2max" => "最大摄氧量（VO₂max）".into(),
        "lactate_threshold_hr" => "乳酸阈值心率".into(),
        "lactate_threshold_pace" => "乳酸阈值配速".into(),
        "resting_heart_rate" => "静息心率".into(),
        "training_load" => "训练负荷".into(),
        "blood_oxygen" => "血氧".into(),
        "breathing_rate" => "呼吸率".into(),
        "skin_temperature" => "皮温".into(),
        other => other.to_string(),
    }
}

impl Database {
    /// 记录某个 stream 某一阶段的结果。
    ///
    /// 每次调用只动一个阶段的列，所以 fetch 成功、parse 失败这种组合能被如实
    /// 保留下来，而不是被最后一次写入抹平成一个状态。
    pub fn record_stream_stage(
        &self,
        stream: &str,
        stage: Stage,
        outcome: &StageOutcome,
    ) -> Result<()> {
        let now = Utc::now().to_rfc3339();
        let prefix = stage.column_prefix();
        self.conn.execute(
            "INSERT OR IGNORE INTO stream_provenance(stream, updated_at) VALUES(?1, ?2)",
            rusqlite::params![stream, now],
        )?;
        match outcome {
            StageOutcome::Ok => {
                let sql = format!(
                    "UPDATE stream_provenance
                     SET last_{prefix}_ok_at = ?2,
                         last_{prefix}_error_at = NULL,
                         last_{prefix}_error_kind = NULL,
                         last_{prefix}_error_message = NULL,
                         updated_at = ?2
                     WHERE stream = ?1"
                );
                self.conn.execute(&sql, rusqlite::params![stream, now])?;
            }
            StageOutcome::Failed { kind, message } => {
                let sql = format!(
                    "UPDATE stream_provenance
                     SET last_{prefix}_error_at = ?2,
                         last_{prefix}_error_kind = ?3,
                         last_{prefix}_error_message = ?4,
                         updated_at = ?2
                     WHERE stream = ?1"
                );
                self.conn.execute(
                    &sql,
                    rusqlite::params![stream, now, kind.as_str(), message.as_deref()],
                )?;
            }
        }
        Ok(())
    }

    /// 记录这一轮写入了多少条 canonical 行。与阶段状态分开，因为「写成功但
    /// 是 0 条」和「写失败」是两件事。
    pub fn record_stream_written(&self, stream: &str, records: i64) -> Result<()> {
        let now = Utc::now().to_rfc3339();
        self.conn.execute(
            "INSERT INTO stream_provenance(stream, last_written_records, updated_at)
             VALUES(?1, ?2, ?3)
             ON CONFLICT(stream) DO UPDATE SET
                 last_written_records = excluded.last_written_records,
                 updated_at = excluded.updated_at",
            rusqlite::params![stream, records, now],
        )?;
        Ok(())
    }

    /// 本地重放完成的时间。**不改写云端同步时间。**
    pub fn record_local_replay(&self, manual: bool) -> Result<()> {
        let now = Utc::now().to_rfc3339();
        self.set_app_meta(LAST_LOCAL_REPLAY_AT_KEY, &now)?;
        if manual {
            self.set_app_meta(LAST_MANUAL_REPROCESS_AT_KEY, &now)?;
        }
        Ok(())
    }

    /// 显式跑一次 `PRAGMA integrity_check` 并记录结果。
    ///
    /// 大库上这是一次全表扫描，所以它是用户主动触发的动作，不在打开页面时
    /// 自动执行；页面平时显示的是上一次的结论和时间。
    pub fn run_integrity_check(&self) -> Result<IntegrityCheckResult> {
        let first: String = self
            .conn
            .query_row("PRAGMA integrity_check(1)", [], |row| row.get(0))?;
        let ok = first.eq_ignore_ascii_case("ok");
        let result = IntegrityCheckResult {
            checked_at: Utc::now().to_rfc3339(),
            ok,
            detail: (!ok).then(|| first.clone()),
        };
        if let Ok(encoded) = serde_json::to_string(&result) {
            self.set_app_meta(LAST_INTEGRITY_CHECK_KEY, &encoded)?;
        }
        Ok(result)
    }

    fn last_integrity_check(&self) -> Result<Option<IntegrityCheckResult>> {
        Ok(self
            .get_app_meta(LAST_INTEGRITY_CHECK_KEY)?
            .and_then(|value| serde_json::from_str(&value).ok()))
    }

    #[allow(clippy::type_complexity)]
    fn stage_states(&self) -> Result<(BTreeMap<String, [StageState; 3]>, BTreeMap<String, i64>)> {
        let mut states = BTreeMap::new();
        let mut stmt = self.conn.prepare(
            "SELECT stream,
                    last_fetch_ok_at, last_fetch_error_at, last_fetch_error_kind, last_fetch_error_message,
                    last_parse_ok_at, last_parse_error_at, last_parse_error_kind, last_parse_error_message,
                    last_write_ok_at, last_write_error_at, last_write_error_kind, last_write_error_message,
                    last_written_records
             FROM stream_provenance",
        )?;
        let rows = stmt.query_map([], |row| {
            let stream: String = row.get(0)?;
            let mut stages = [
                StageState::never(),
                StageState::never(),
                StageState::never(),
            ];
            for (index, base) in [1usize, 5, 9].into_iter().enumerate() {
                let ok_at: Option<String> = row.get(base)?;
                let error_at: Option<String> = row.get(base + 1)?;
                let error_kind: Option<String> = row.get(base + 2)?;
                let error_message: Option<String> = row.get(base + 3)?;
                // 最近一次事件决定当前状态：失败之后又成功一次就该显示成功。
                let failed_is_newer = match (&ok_at, &error_at) {
                    (_, None) => false,
                    (None, Some(_)) => true,
                    (Some(ok), Some(err)) => err.as_str() > ok.as_str(),
                };
                stages[index] = if failed_is_newer {
                    StageState {
                        state: "failed".into(),
                        at: error_at,
                        last_ok_at: ok_at,
                        error_kind,
                        message: error_message,
                    }
                } else if ok_at.is_some() {
                    StageState {
                        state: "ok".into(),
                        at: ok_at.clone(),
                        last_ok_at: ok_at,
                        error_kind: None,
                        message: None,
                    }
                } else {
                    StageState::never()
                };
            }
            let written: i64 = row.get(13)?;
            Ok((stream, stages, written))
        })?;
        let mut written = BTreeMap::new();
        for row in rows {
            let (stream, stages, count) = row?;
            written.insert(stream.clone(), count);
            states.insert(stream, stages);
        }
        Ok((states, written))
    }

    fn scalar_i64(&self, sql: &str) -> Result<i64> {
        Ok(self.conn.query_row(sql, [], |row| row.get(0))?)
    }

    fn source_breakdown(&self, table: &str, filter: &str) -> Result<Vec<SourceBreakdown>> {
        let sql = format!(
            "SELECT COALESCE(NULLIF(TRIM(source_scope), ''), 'unknown') AS scope, COUNT(*)
             FROM {table} {filter}
             GROUP BY scope ORDER BY COUNT(*) DESC"
        );
        let mut stmt = self.conn.prepare(&sql)?;
        let rows = stmt.query_map([], |row| {
            Ok(SourceBreakdown {
                source: normalize_source(&row.get::<_, String>(0)?),
                records: row.get(1)?,
            })
        })?;
        // 归一化之后可能出现重复的 key（例如两种拼写都落到 unknown），
        // 合并计数而不是显示两行。
        let mut merged: BTreeMap<String, i64> = BTreeMap::new();
        for row in rows {
            let row = row?;
            *merged.entry(row.source).or_default() += row.records;
        }
        let mut out: Vec<SourceBreakdown> = merged
            .into_iter()
            .map(|(source, records)| SourceBreakdown { source, records })
            .collect();
        out.sort_by(|a, b| b.records.cmp(&a.records).then(a.source.cmp(&b.source)));
        Ok(out)
    }

    /// 数据健康中心的完整后端契约。
    ///
    /// 这个调用不跑 `integrity_check`，也不触网：打开页面必须是便宜的。
    pub fn data_health(&self, window_days: i64, database_bytes: u64) -> Result<DataHealth> {
        let window_days = window_days.clamp(7, 3650);
        let (stages, written) = self.stage_states()?;
        let freshness = self.stream_freshness()?;

        let mut streams = Vec::new();
        for (stream, label, cadence) in STREAM_CATALOG {
            let raw_records = self.conn.query_row(
                "SELECT COUNT(*) FROM raw_records WHERE stream = ?1",
                [stream],
                |row| row.get::<_, i64>(0),
            )?;
            let (canonical_records, sources, observed) = self.stream_facts(stream, window_days)?;
            let stage = stages.get(stream);
            let mut fetch = stage.map_or_else(StageState::never, |s| s[0].clone());
            let parse = stage.map_or_else(StageState::never, |s| s[1].clone());
            let write = stage.map_or_else(StageState::never, |s| s[2].clone());
            // 旧库升级上来时 provenance 表是空的，但 raw_records 里明摆着有
            // 报文。把「从来没拉过」写成 never 会误导用户，所以用已有的
            // fetched_at 作为最近一次成功 fetch 的下界。
            if fetch.state == "never" {
                if let Some(at) = freshness
                    .get(stream)
                    .and_then(|value| value.last_cloud_sync_at.clone())
                {
                    fetch = StageState {
                        state: "ok".into(),
                        at: Some(at.clone()),
                        last_ok_at: Some(at),
                        error_kind: None,
                        message: None,
                    };
                }
            }
            streams.push(StreamHealth {
                stream: stream.to_string(),
                label: label.to_string(),
                cadence,
                fetch,
                parse,
                write,
                raw_records,
                canonical_records,
                last_written_records: written.get(stream).copied().unwrap_or(0),
                sources,
                coverage: explain_coverage(cadence, window_days, observed),
            });
        }

        let occasional_metrics = self.metric_health(window_days)?;

        let raw_total = self.scalar_i64("SELECT COUNT(*) FROM raw_records")?;
        let canonical_total = self.scalar_i64(
            "SELECT (SELECT COUNT(*) FROM metric_samples)
                  + (SELECT COUNT(*) FROM daily_metrics)
                  + (SELECT COUNT(*) FROM sleep_sessions)
                  + (SELECT COUNT(*) FROM workouts)",
        )?;
        // 「待归一化」= 留着的报文一条标准化记录都没产出。
        //
        // `workout_detail` 的产物落在 `workout_samples` / `route_points` /
        // `workout_pauses`，这三张表按 `workout_id` 关联，**没有 raw_record_id**
        // 这一列——所以只按 raw_record_id 查那四张表，会把每一条解析得好好的
        // 运动详情都算成「没归一化」，数字只增不减，用户重放多少次也降不下来。
        // 这里按 source_key（`workout_detail:{workout_id}:{source}`）把它认回来。
        let pending_normalization = self.scalar_i64(
            "WITH detail AS (
                 SELECT r.id AS raw_id,
                        substr(r.source_key, 16, instr(substr(r.source_key, 16), ':') - 1)
                            AS workout_id
                 FROM raw_records r
                 WHERE r.stream = 'workout_detail'
                   AND instr(substr(r.source_key, 16), ':') > 1
             )
             SELECT COUNT(*) FROM raw_records r
             WHERE NOT EXISTS (SELECT 1 FROM metric_samples WHERE raw_record_id = r.id)
               AND NOT EXISTS (SELECT 1 FROM daily_metrics  WHERE raw_record_id = r.id)
               AND NOT EXISTS (SELECT 1 FROM sleep_sessions WHERE raw_record_id = r.id)
               AND NOT EXISTS (SELECT 1 FROM workouts       WHERE raw_record_id = r.id)
               AND NOT EXISTS (
                     SELECT 1 FROM detail d
                     WHERE d.raw_id = r.id
                       AND (EXISTS (SELECT 1 FROM workout_samples s
                                    WHERE s.workout_id = d.workout_id)
                         OR EXISTS (SELECT 1 FROM route_points p
                                    WHERE p.workout_id = d.workout_id)
                         OR EXISTS (SELECT 1 FROM workout_pauses w
                                    WHERE w.workout_id = d.workout_id)))",
        )?;

        let (last_cloud_sync_at, last_cloud_sync_outcome) = self.cloud_sync_metadata()?;
        let newest_sample_at = freshness
            .values()
            .filter_map(|value| value.newest_sample_at.clone())
            .max();

        // 空库不欠重放：修订号没记过只是因为还没有东西可重放，对它说
        // 「历史停在旧解析器上」是句没有内容的警告。
        let replay_plan = self.pending_replay_plan()?;
        let database = DatabaseHealth {
            schema_version: self.diagnostic_schema_version()?,
            normalizer_revision: NORMALIZER_REVISION.to_string(),
            stored_normalizer_revision: self.stored_normalizer_revision()?,
            normalizer_replay_pending: replay_plan
                .as_ref()
                .map(|plan| plan.raw_records > 0)
                .unwrap_or(false),
            replay_in_progress: super::replay_in_progress(),
            database_bytes,
            raw_records: raw_total,
            canonical_records: canonical_total,
            pending_normalization,
            last_integrity_check: self.last_integrity_check()?,
        };
        let timings = HealthTimings {
            last_cloud_sync_at,
            last_cloud_sync_outcome,
            last_local_replay_at: self.get_app_meta(LAST_LOCAL_REPLAY_AT_KEY)?,
            last_manual_reprocess_at: self.get_app_meta(LAST_MANUAL_REPROCESS_AT_KEY)?,
            newest_sample_at,
        };
        let actions = suggested_actions(&database, &timings, &streams);

        Ok(DataHealth {
            generated_at: Utc::now().to_rfc3339(),
            database,
            timings,
            streams,
            occasional_metrics,
            actions,
        })
    }

    /// canonical 计数、来源拆分和观察到的日期集合。
    fn stream_facts(
        &self,
        stream: &str,
        window_days: i64,
    ) -> Result<(i64, Vec<SourceBreakdown>, Observed)> {
        let cutoff = (Utc::now() - Duration::days(window_days))
            .date_naive()
            .format("%Y-%m-%d")
            .to_string();
        match stream {
            "heart_rate" | "hrv" => {
                let metric = if stream == "heart_rate" {
                    "heart_rate"
                } else {
                    "hrv"
                };
                let count = self.conn.query_row(
                    "SELECT COUNT(*) FROM metric_samples WHERE metric = ?1",
                    [metric],
                    |row| row.get(0),
                )?;
                let sources =
                    self.source_breakdown("metric_samples", &format!("WHERE metric = '{metric}'"))?;
                let observed = self.observed_days_for(
                    &format!(
                        "SELECT DISTINCT substr(timestamp, 1, 10) FROM metric_samples
                         WHERE metric = '{metric}' AND substr(timestamp, 1, 10) >= ?1"
                    ),
                    &cutoff,
                )?;
                Ok((count, sources, observed))
            }
            "daily_summary" | "wellness" => {
                let count = self.scalar_i64("SELECT COUNT(*) FROM daily_metrics")?;
                let sources = self.source_breakdown("daily_metrics", "")?;
                let observed = self.observed_days_for(
                    "SELECT DISTINCT date FROM daily_metrics WHERE date >= ?1",
                    &cutoff,
                )?;
                Ok((count, sources, observed))
            }
            "sleep" => {
                let count = self.scalar_i64("SELECT COUNT(*) FROM sleep_sessions")?;
                let sources = self.source_breakdown("sleep_sessions", "")?;
                let observed = self.observed_days_for(
                    "SELECT DISTINCT substr(end_time, 1, 10) FROM sleep_sessions
                     WHERE substr(end_time, 1, 10) >= ?1",
                    &cutoff,
                )?;
                Ok((count, sources, observed))
            }
            "workouts" | "workout_detail" => {
                let count = self.scalar_i64("SELECT COUNT(*) FROM workouts")?;
                let sources = self.source_breakdown("workouts", "")?;
                let observed = self.observed_days_for(
                    "SELECT DISTINCT substr(start_time, 1, 10) FROM workouts
                     WHERE substr(start_time, 1, 10) >= ?1",
                    &cutoff,
                )?;
                Ok((count, sources, observed))
            }
            _ => Ok((0, Vec::new(), Observed::default())),
        }
    }

    fn observed_days_for(&self, sql: &str, cutoff: &str) -> Result<Observed> {
        let mut stmt = self.conn.prepare(sql)?;
        let rows = stmt.query_map([cutoff], |row| row.get::<_, Option<String>>(0))?;
        let mut days: Vec<String> = rows
            .collect::<std::result::Result<Vec<_>, _>>()?
            .into_iter()
            .flatten()
            .collect();
        days.sort();
        days.dedup();
        Ok(Observed { days })
    }

    /// 每个指标一行。偶发指标（VO₂max、乳酸阈值等）只报告观察到的日期，
    /// 不参与缺口判定。
    fn metric_health(&self, window_days: i64) -> Result<Vec<StreamHealth>> {
        let mut metrics: Vec<String> = Vec::new();
        for sql in [
            "SELECT DISTINCT metric FROM metric_samples",
            "SELECT DISTINCT metric FROM daily_metrics",
        ] {
            let mut stmt = self.conn.prepare(sql)?;
            let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
            for row in rows {
                metrics.push(row?);
            }
        }
        metrics.sort();
        metrics.dedup();

        let cutoff = (Utc::now() - Duration::days(window_days))
            .date_naive()
            .format("%Y-%m-%d")
            .to_string();
        let mut out = Vec::new();
        for metric in metrics {
            let cadence = metric_cadence(&metric);
            if cadence != StreamCadence::Occasional {
                continue;
            }
            let sample_count: i64 = self.conn.query_row(
                "SELECT COUNT(*) FROM metric_samples WHERE metric = ?1",
                [&metric],
                |row| row.get(0),
            )?;
            let daily_count: i64 = self.conn.query_row(
                "SELECT COUNT(*) FROM daily_metrics WHERE metric = ?1",
                [&metric],
                |row| row.get(0),
            )?;
            let mut days: Vec<String> = Vec::new();
            for sql in [
                "SELECT DISTINCT substr(timestamp, 1, 10) FROM metric_samples
                 WHERE metric = ?1 AND substr(timestamp, 1, 10) >= ?2",
                "SELECT DISTINCT date FROM daily_metrics WHERE metric = ?1 AND date >= ?2",
            ] {
                let mut stmt = self.conn.prepare(sql)?;
                let rows =
                    stmt.query_map([&metric, &cutoff], |row| row.get::<_, Option<String>>(0))?;
                for row in rows {
                    if let Some(day) = row? {
                        days.push(day);
                    }
                }
            }
            days.sort();
            days.dedup();
            let sources = if sample_count >= daily_count {
                self.source_breakdown("metric_samples", &format!("WHERE metric = '{metric}'"))?
            } else {
                self.source_breakdown("daily_metrics", &format!("WHERE metric = '{metric}'"))?
            };
            out.push(StreamHealth {
                label: metric_label(&metric),
                stream: metric,
                cadence,
                fetch: StageState::never(),
                parse: StageState::never(),
                write: StageState::never(),
                raw_records: 0,
                canonical_records: sample_count + daily_count,
                last_written_records: 0,
                sources,
                coverage: explain_coverage(cadence, window_days, Observed { days }),
            });
        }
        Ok(out)
    }
}

#[derive(Debug, Default, Clone)]
struct Observed {
    days: Vec<String>,
}

fn normalize_source(raw: &str) -> String {
    match raw.trim().to_ascii_lowercase().as_str() {
        "device" => "device".into(),
        "user_fused" | "user" | "fused" => "user_fused".into(),
        "" => "unknown".into(),
        "unknown" => "unknown".into(),
        // 不认识的 scope 一律标成 unknown，而不是猜成设备数据。
        _ => "unknown".into(),
    }
}

fn explain_coverage(
    cadence: StreamCadence,
    window_days: i64,
    observed: Observed,
) -> CoverageExplanation {
    let observed_days = observed.days.len() as i64;
    let first = observed.days.first().cloned();
    let latest = observed.days.last().cloned();

    if !cadence.has_expected_days() {
        let note = match cadence {
            StreamCadence::PerEvent => {
                "按事件产生：没有记录代表这段时间没有对应活动，不是缺口。".into()
            }
            _ => "手表偶尔才给一次：空白日期是正常的，不代表数据丢失。".into(),
        };
        return CoverageExplanation {
            kind: "observations".into(),
            window_days,
            observed_days,
            gap_dates: Vec::new(),
            gap_total: 0,
            first_observed_at: first,
            latest_observed_at: latest,
            note,
        };
    }

    // 只在「已经观察到数据」的区间里算缺口。第一次有数据之前的空白是
    // 「还没开始同步」，把它算成缺失会让每个新用户一打开就看到一片红。
    let (gap_dates, gap_total) = match (&first, &latest) {
        (Some(first), Some(latest)) => {
            let present: std::collections::HashSet<&str> =
                observed.days.iter().map(String::as_str).collect();
            let mut gaps = Vec::new();
            let mut total = 0i64;
            if let (Some(start), Some(end)) = (parse_day(first), parse_day(latest)) {
                let mut cursor = start;
                while cursor <= end {
                    let key = cursor.format("%Y-%m-%d").to_string();
                    if !present.contains(key.as_str()) {
                        total += 1;
                        if gaps.len() < MAX_REPORTED_GAPS {
                            gaps.push(key);
                        }
                    }
                    cursor += Duration::days(1);
                }
            }
            (gaps, total)
        }
        _ => (Vec::new(), 0),
    };

    let note = if observed_days == 0 {
        "这段时间还没有任何本地数据；先做一次同步再看。".into()
    } else if gap_total == 0 {
        "从第一天有数据起，没有观察到缺口。".into()
    } else {
        format!("从第一天有数据起，有 {gap_total} 天没有观察到数据。手表没戴、没同步或云端未返回都会造成缺口。")
    };

    CoverageExplanation {
        kind: "gaps".into(),
        window_days,
        observed_days,
        gap_dates,
        gap_total,
        first_observed_at: first,
        latest_observed_at: latest,
        note,
    }
}

fn parse_day(value: &str) -> Option<NaiveDate> {
    NaiveDate::parse_from_str(value, "%Y-%m-%d").ok()
}

/// 只在确实有事可做时给动作，不做「永远显示一排按钮」的装饰。
fn suggested_actions(
    database: &DatabaseHealth,
    timings: &HealthTimings,
    streams: &[StreamHealth],
) -> Vec<HealthAction> {
    let mut actions = Vec::new();
    if streams
        .iter()
        .any(|stream| stream.fetch.error_kind.as_deref() == Some("auth"))
    {
        actions.push(HealthAction {
            id: "reauth".into(),
            code: "reauth".into(),
            label: "重新连接 Zepp 账号".into(),
            reason: "有数据流因为认证失效而拉不到数据。".into(),
            destructive: false,
        });
    }
    if database.pending_normalization > 0
        || database.replay_in_progress
        || database.normalizer_replay_pending
    {
        // 两个理由要分开说。「有报文没产出记录」和「记录是旧规则产出的」
        // 对用户是两件不同的事，混成一句话会让第二种情况看起来像数据丢了。
        let reason = if database.normalizer_replay_pending {
            format!(
                "本机派生数据还是 {} 产出的，当前解析器是 {}。重放不触网，也不会改写云端同步时间。",
                database
                    .stored_normalizer_revision
                    .as_deref()
                    .unwrap_or("更早的版本"),
                database.normalizer_revision
            )
        } else {
            format!(
                "有 {} 份已保留的报文还没产出任何标准化记录。重放不触网，也不会改写云端同步时间。",
                database.pending_normalization
            )
        };
        actions.push(HealthAction {
            id: "reprocess".into(),
            code: "reprocess".into(),
            label: "用当前解析器重放本地报文".into(),
            reason,
            destructive: false,
        });
    }
    if streams.iter().any(|stream| {
        stream.fetch.state == "failed" && stream.fetch.error_kind.as_deref() != Some("auth")
    }) {
        actions.push(HealthAction {
            id: "sync".into(),
            code: "sync_retry".into(),
            label: "再同步一次".into(),
            reason: "上一次有数据流没能从云端取回数据。".into(),
            destructive: false,
        });
    }
    if timings.last_cloud_sync_at.is_none() {
        actions.push(HealthAction {
            id: "sync".into(),
            code: "sync_first".into(),
            label: "做第一次同步".into(),
            reason: "本机还没有任何一次成功的云端同步记录。".into(),
            destructive: false,
        });
    }
    actions.push(HealthAction {
        id: "integrity_check".into(),
        code: "integrity_check".into(),
        label: "检查数据库完整性".into(),
        reason: "对整库做一次 SQLite integrity_check，大库上需要一点时间。".into(),
        destructive: false,
    });
    actions.push(HealthAction {
        id: "open_data_folder".into(),
        code: "open_data_folder".into(),
        label: "打开数据文件夹".into(),
        reason: "本机数据库、备份和导出都在这里。".into(),
        destructive: false,
    });
    actions.dedup_by(|a, b| a.id == b.id);
    actions
}

/// 用于测试和 CLI 输出的稳定摘要。
pub fn summarize_stage(stage: &StageState) -> String {
    match stage.state.as_str() {
        "ok" => "正常".into(),
        "failed" => format!(
            "失败（{}）",
            stage.error_kind.as_deref().unwrap_or("unknown")
        ),
        _ => "尚未发生".into(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{CapabilityStatus, MetricSample, RawRecord, SourceScope, Workout};
    use chrono::TimeZone;

    fn db() -> Database {
        Database::in_memory().unwrap()
    }

    fn day(offset: i64) -> chrono::DateTime<Utc> {
        Utc.with_ymd_and_hms(2026, 8, 1, 12, 0, 0).unwrap() + Duration::days(offset)
    }

    fn sample(metric: &str, offset: i64, scope: SourceScope) -> MetricSample {
        MetricSample {
            metric: metric.into(),
            timestamp: day(offset),
            value: 60.0 + offset as f64,
            unit: "bpm".into(),
            source_scope: scope,
            device_id: Some("device-a".into()),
        }
    }

    #[test]
    fn the_three_stages_are_recorded_independently() {
        let db = db();
        // 报文拿回来了、但看不懂：这必须表达成「fetch 正常 / parse 失败」，
        // 而不是被折叠成一个笼统的红点。
        db.record_stream_stage("sleep", Stage::Fetch, &StageOutcome::Ok)
            .unwrap();
        db.record_stream_stage(
            "sleep",
            Stage::Parse,
            &StageOutcome::Failed {
                kind: StageErrorKind::UnrecognizedPayload,
                message: Some("band_data 编码未识别".into()),
            },
        )
        .unwrap();

        let (states, _) = db.stage_states().unwrap();
        let stages = states.get("sleep").unwrap();
        assert_eq!(stages[0].state, "ok");
        assert_eq!(stages[1].state, "failed");
        assert_eq!(
            stages[1].error_kind.as_deref(),
            Some("unrecognized_payload")
        );
        assert_eq!(stages[2].state, "never", "从没写过不是失败");
    }

    #[test]
    fn a_later_success_clears_an_earlier_failure_but_keeps_the_last_good_time() {
        let db = db();
        db.record_stream_stage(
            "hrv",
            Stage::Fetch,
            &StageOutcome::Failed {
                kind: StageErrorKind::Network,
                message: Some("超时".into()),
            },
        )
        .unwrap();
        std::thread::sleep(std::time::Duration::from_millis(2));
        db.record_stream_stage("hrv", Stage::Fetch, &StageOutcome::Ok)
            .unwrap();

        let (states, _) = db.stage_states().unwrap();
        let fetch = &states.get("hrv").unwrap()[0];
        assert_eq!(fetch.state, "ok");
        assert!(fetch.error_kind.is_none());
        assert!(fetch.last_ok_at.is_some());
    }

    #[test]
    fn cloud_sync_local_replay_and_manual_reprocess_are_separate_timelines() {
        let db = db();
        db.record_cloud_sync("2026-08-20T00:00:00+00:00", "updated")
            .unwrap();
        db.record_local_replay(false).unwrap();

        let health = db.data_health(90, 0).unwrap();
        assert_eq!(
            health.timings.last_cloud_sync_at.as_deref(),
            Some("2026-08-20T00:00:00+00:00"),
            "本地重放不得改写云端同步时间"
        );
        assert!(health.timings.last_local_replay_at.is_some());
        assert!(
            health.timings.last_manual_reprocess_at.is_none(),
            "后台自动重放不是手动重新解析"
        );

        db.record_local_replay(true).unwrap();
        let health = db.data_health(90, 0).unwrap();
        assert!(health.timings.last_manual_reprocess_at.is_some());
        assert_eq!(
            health.timings.last_cloud_sync_at.as_deref(),
            Some("2026-08-20T00:00:00+00:00")
        );
    }

    #[test]
    fn coverage_is_explained_by_cadence_not_by_one_completeness_percentage() {
        // 连续流：可以说「缺了哪几天」。
        let daily = explain_coverage(
            StreamCadence::Daily,
            30,
            Observed {
                days: vec!["2026-08-01".into(), "2026-08-04".into()],
            },
        );
        assert_eq!(daily.kind, "gaps");
        assert_eq!(daily.gap_total, 2);
        assert_eq!(daily.gap_dates, vec!["2026-08-02", "2026-08-03"]);

        // 偶发流：只能说「哪几天观察到了」。VO₂max 一年给几次是正常的，
        // 用统一的完整度去衡量必然画成一片红。
        let occasional = explain_coverage(
            StreamCadence::Occasional,
            365,
            Observed {
                days: vec!["2026-03-02".into(), "2026-08-01".into()],
            },
        );
        assert_eq!(occasional.kind, "observations");
        assert_eq!(occasional.gap_total, 0);
        assert!(occasional.gap_dates.is_empty());
        assert_eq!(occasional.latest_observed_at.as_deref(), Some("2026-08-01"));

        // 按事件的流同理：没有运动就是没有运动。
        assert_eq!(
            explain_coverage(StreamCadence::PerEvent, 30, Observed::default()).kind,
            "observations"
        );
    }

    #[test]
    fn gaps_are_only_counted_after_the_first_observed_day() {
        // 一个刚装好的用户只有最近三天数据。把之前的空白算成缺口，会让人
        // 第一次打开就看到一片红。
        let coverage = explain_coverage(
            StreamCadence::Daily,
            365,
            Observed {
                days: vec![
                    "2026-08-01".into(),
                    "2026-08-02".into(),
                    "2026-08-03".into(),
                ],
            },
        );
        assert_eq!(coverage.gap_total, 0);
        assert_eq!(coverage.observed_days, 3);
    }

    #[test]
    fn unknown_source_scopes_are_never_folded_into_device_data() {
        let db = db();
        db.insert_metric_sample(&sample("heart_rate", 0, SourceScope::Device))
            .unwrap();
        db.insert_metric_sample(&sample("heart_rate", 1, SourceScope::UserFused))
            .unwrap();
        db.insert_metric_sample(&sample("heart_rate", 2, SourceScope::Unknown))
            .unwrap();

        let health = db.data_health(90, 0).unwrap();
        let heart_rate = health
            .streams
            .iter()
            .find(|stream| stream.stream == "heart_rate")
            .unwrap();
        let mut sources: Vec<&str> = heart_rate
            .sources
            .iter()
            .map(|entry| entry.source.as_str())
            .collect();
        sources.sort_unstable();
        assert_eq!(sources, vec!["device", "unknown", "user_fused"]);
        assert!(heart_rate.sources.iter().all(|entry| entry.records == 1));
    }

    #[test]
    fn health_falls_back_to_fetched_at_so_an_upgraded_library_is_not_called_never_fetched() {
        let db = db();
        db.insert_raw_record(&crate::models::RawRecord {
            stream: "workouts".into(),
            source_key: "w-1".into(),
            source_scope: SourceScope::Device,
            device_id: Some("device-a".into()),
            start_utc: day(0),
            end_utc: Some(day(0)),
            payload: serde_json::json!({ "items": [] }),
            capability: crate::models::CapabilityStatus::Verified,
        })
        .unwrap();

        let health = db.data_health(90, 0).unwrap();
        let workouts = health
            .streams
            .iter()
            .find(|stream| stream.stream == "workouts")
            .unwrap();
        assert_eq!(
            workouts.fetch.state, "ok",
            "库里明摆着有报文，不能说从来没拉过"
        );
        assert_eq!(workouts.raw_records, 1);
    }

    #[test]
    fn integrity_check_is_explicit_and_its_result_is_remembered() {
        let db = db();
        assert!(
            db.data_health(90, 0)
                .unwrap()
                .database
                .last_integrity_check
                .is_none(),
            "打开页面不该自动跑全库扫描"
        );
        let result = db.run_integrity_check().unwrap();
        assert!(result.ok);
        assert!(result.detail.is_none());
        let remembered = db
            .data_health(90, 0)
            .unwrap()
            .database
            .last_integrity_check
            .unwrap();
        assert_eq!(remembered.checked_at, result.checked_at);
    }

    #[test]
    fn actions_only_appear_when_there_is_something_to_do() {
        let db = db();
        db.record_stream_stage(
            "heart_rate",
            Stage::Fetch,
            &StageOutcome::Failed {
                kind: StageErrorKind::Auth,
                message: Some("需要重新认证".into()),
            },
        )
        .unwrap();
        let health = db.data_health(90, 0).unwrap();
        let ids: Vec<&str> = health
            .actions
            .iter()
            .map(|action| action.id.as_str())
            .collect();
        assert!(ids.contains(&"reauth"));
        assert!(
            !ids.contains(&"reprocess"),
            "没有待归一化的报文就不该建议重放"
        );
    }
    #[test]
    fn a_replayed_workout_detail_is_not_pending_normalization() {
        // 运动详情的产物落在 workout_samples / route_points / workout_pauses，
        // 这三张表按 workout_id 关联，没有 raw_record_id。早先的统计只查那四张
        // 带 raw_record_id 的表，于是每一条解析得好好的详情报文都被永久算成
        // 「待归一化」——用户重放多少次，那个数字都降不下来。
        let db = db();
        db.insert_workout(&Workout {
            workout_id: "1700000000".into(),
            workout_type: "run".into(),
            normalized_type: "run".into(),
            type_source: "numeric_mapped".into(),
            user_override: None,
            effective_type: "run".into(),
            custom_label: None,
            start_time: day(0),
            end_time: day(0) + Duration::minutes(10),
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
        let source_key = "workout_detail:1700000000:run.gps";
        let raw_id = db
            .insert_raw_record(&RawRecord {
                stream: "workout_detail".into(),
                source_key: source_key.into(),
                source_scope: SourceScope::Device,
                device_id: None,
                start_utc: day(0),
                end_utc: None,
                payload: payload.clone(),
                capability: CapabilityStatus::Verified,
            })
            .unwrap();
        db.normalize_and_persist_raw(raw_id, "workout_detail", source_key, &payload)
            .unwrap();

        assert_eq!(
            db.data_health(90, 0)
                .unwrap()
                .database
                .pending_normalization,
            0,
            "详情已经产出逐点样本，就不该还算「待归一化」"
        );

        // 反向钉住：真的什么都没产出的报文仍然要被数出来，
        // 否则这个修法就成了「把问题藏起来」。
        db.insert_raw_record(&RawRecord {
            stream: "workout_detail".into(),
            source_key: "workout_detail:1799999999:run.gps".into(),
            source_scope: SourceScope::Device,
            device_id: None,
            start_utc: day(1),
            end_utc: None,
            payload: serde_json::json!({ "items": [] }),
            capability: CapabilityStatus::Verified,
        })
        .unwrap();
        assert_eq!(
            db.data_health(90, 0)
                .unwrap()
                .database
                .pending_normalization,
            1,
            "没产出任何记录的报文还是要算进来"
        );
    }
}
