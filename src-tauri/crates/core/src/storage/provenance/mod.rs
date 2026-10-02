use super::{Database, NORMALIZER_REVISION};

use crate::models::error::Result;

use chrono::{Duration, NaiveDate, Utc};

use serde::{Deserialize, Serialize};

use std::collections::BTreeMap;

mod health;

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
    /// HTTP 200，但报文自己写着「不成功」。见 `ZeppBridgeError::CloudRejected`。
    ///
    /// 带着 code：它是整个系统里唯一能告诉我们「凭据失效到底长什么样」
    /// 的数字，而这一点目前只能从用户那里拿（本地那 1075 条留存报文
    /// 全是 `code = 1`）。放在类型里而不是只埋在人读的消息字符串里，
    /// 是为了诊断报告能只上报这一个整数，不把云端的原话一并发出去。
    CloudRejected {
        code: i64,
    },
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
            StageErrorKind::CloudRejected { .. } => "cloud_rejected",
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
        use crate::models::error::HeadlessProblem;
        use crate::models::ZeppBridgeError as E;
        match error {
            E::Cancelled => StageErrorKind::Cancelled,
            E::NeedsReauth(_) | E::AuthError(_) | E::CredentialStore(_) => StageErrorKind::Auth,
            // 库属于另一个账号：和认证同一类——用户要去改账号设置，重试没用。
            E::AccountMismatch => StageErrorKind::Auth,
            // 无头环境的三种：两种是「令牌拿不到」，一种是「库要先升级」。
            // 前两种按 auth 分类（用户要去把凭据给进来），第三种是本机存储
            // 的事——重试解决不了，得先跑一次 reprocess。
            E::Headless(HeadlessProblem::SchemaUpgradeRequired { .. }) => StageErrorKind::Storage,
            E::Headless(_) => StageErrorKind::Auth,
            E::Unavailable(_) | E::DataUnavailable(_) => StageErrorKind::NotAvailable,
            // 超时多半是网络慢：和网络同一类，重试就好。
            E::NetworkError(_)
            | E::RetryExhausted { .. }
            | E::HttpStatus { .. }
            | E::TimedOut(_) => StageErrorKind::Network,
            E::ParseError(_) => StageErrorKind::UnrecognizedPayload,
            // 传输层成功、业务层拒绝。单独一类而不是并进 `unknown`：诊断报告
            // 里这一格就是我们唯一能看到「云端到底给了哪个 code」的地方。
            E::CloudRejected { code, .. } => StageErrorKind::CloudRejected { code: *code },
            E::Busy(_) => StageErrorKind::Busy,
            E::DatabaseError(_) | E::IoError(_) => StageErrorKind::Storage,
            // ai_task / 训练计划的错误不会出现在同步流水线上；真出现算「不知道是什么」。
            E::InvalidHost(_)
            | E::ConfigError(_)
            | E::AiTask(_)
            | E::TrainingPlan { .. }
            | E::Unknown(_) => StageErrorKind::Unknown,
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
    /// 库里有旧版或尚未处理的报文，需要本地重放。
    #[serde(default)]
    pub normalizer_replay_pending: bool,
    /// 后台重放正在进行。此时云端同步会以 `deferred` 让路，这不是失败。
    pub replay_in_progress: bool,
    pub database_bytes: u64,
    pub raw_records: i64,
    pub canonical_records: i64,
    /// Raw records without a successful attempt or quarantine at the current revision.
    pub pending_normalization: i64,
    /// Per-stream processing outcomes. `processed_without_output` means the
    /// parser returned no rows; it does not claim the payload is understood.
    #[serde(default)]
    pub normalization_by_stream: Vec<NormalizationHealth>,
    /// 最近一次 `PRAGMA integrity_check` 的结果，`None` = 从没跑过。
    /// 这是显式动作，不在每次打开页面时自动跑。
    pub last_integrity_check: Option<IntegrityCheckResult>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct NormalizationHealth {
    pub stream: String,
    pub state: String,
    pub records: i64,
}

impl Database {
    fn normalization_health(&self) -> Result<Vec<NormalizationHealth>> {
        let mut stmt = self.conn.prepare(
            "SELECT r.stream,
                CASE WHEN q.revision = ?1 THEN 'quarantined'
                     WHEN n.revision = ?1 AND n.records_written > 0 THEN 'normalized'
                     WHEN n.revision = ?1 THEN 'processed_without_output'
                     ELSE 'pending' END AS state,
                COUNT(*)
             FROM raw_records r
             LEFT JOIN raw_normalization n ON n.raw_record_id = r.id
             LEFT JOIN raw_quarantine q ON q.raw_record_id = r.id
             GROUP BY r.stream, state ORDER BY r.stream, state",
        )?;
        let rows = stmt.query_map([NORMALIZER_REVISION], |row| {
            Ok(NormalizationHealth {
                stream: row.get(0)?,
                state: row.get(1)?,
                records: row.get(2)?,
            })
        })?;
        Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
    }
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
const STREAM_CATALOG: [(&str, &str, StreamCadence); 8] = [
    ("heart_rate", "心率", StreamCadence::Continuous),
    ("daily_summary", "每日概览", StreamCadence::Daily),
    ("sleep", "睡眠", StreamCadence::Nightly),
    ("hrv", "心率变异性", StreamCadence::Nightly),
    ("wellness", "压力 / 血氧等可选指标", StreamCadence::Daily),
    ("workouts", "运动记录", StreamCadence::PerEvent),
    ("workout_detail", "运动明细与轨迹", StreamCadence::PerEvent),
    // 称重是「称了才有」，不是每天都该有的东西——一周没上秤不是故障，所以
    // 是 Occasional 而不是 Daily，那样这一行才不会常年画成红色缺口。
    ("weight", "体重与体成分", StreamCadence::Occasional),
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

#[cfg(test)]
mod tests;
