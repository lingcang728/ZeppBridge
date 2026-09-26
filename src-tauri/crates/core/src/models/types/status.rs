//! 用户偏好、存储估算、同步状态与能力看板（从 models/types.rs 按领域拆出，形状不变）。

use super::*;

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

/// The storage representation of a sync stream, carrying the cursor/capability
/// bookkeeping needed by the real pipeline.
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
