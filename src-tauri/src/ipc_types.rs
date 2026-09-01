use crate::{models, storage::StreamFreshness, sync};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// A stream status shaped for the TypeScript IPC contract.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct StreamStatusView {
    pub stream: String,
    pub status: String,
    pub records: Option<i64>,
    pub last_sync: Option<String>,
    pub last_cloud_sync_at: Option<String>,
    pub newest_sample_at: Option<String>,
    pub message: Option<String>,
    pub needs_reauth: Option<bool>,
}

/// A capability status shaped for the TypeScript IPC contract.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct CapabilityStatusView {
    pub capability: String,
    pub available: bool,
    pub reason: Option<String>,
    /// `reason` 那句话的稳定码。为空表示这条 reason 是后端透传的原始消息，
    /// 界面只能原样显示。
    #[serde(default)]
    pub reason_code: Option<String>,
}

/// Overall application status exposed to the frontend.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AppStatus {
    pub configured: bool,
    pub auth_state: String,
    pub connection_state: String,
    pub masked_user_id: Option<String>,
    pub region_host: Option<String>,
    pub last_sync: Option<String>,
    pub last_cloud_sync_at: Option<String>,
    pub last_cloud_sync_outcome: Option<String>,
    pub streams: Vec<StreamStatusView>,
    pub capabilities: Vec<CapabilityStatusView>,
    pub database_path: Option<String>,
    pub retention_days: i64,
    pub history_sync_days: i64,
    /// 一次增量同步往回拉多少天。
    ///
    /// 界面那句「正在同步最近 N 天」的 N 从这里来，**不许在前端写死**。它从
    /// 7 改成 30 的时候，只有后端跟着改了，界面上整整一个版本都还在说 7。
    pub incremental_sync_days: i64,
    pub storage: Option<crate::models::StorageEstimate>,
    /// 本机实际有数据的那段日子。界面上每一个「最近 N 天」选择器读的都是本机
    /// 库，所以每一个都需要知道这个，才不会把「库里没有」画成「那几个月你没动」。
    pub coverage: crate::storage::LocalCoverage,
    /// 凭什么认定当前 `region_host` 属于这个账号：`identified` / `hinted` /
    /// `unconfirmed` / `unknown`。界面按这个码自己写句子——后端不按 locale 出
    /// 文案，四个出口才会说同一件事。
    ///
    /// `unconfirmed` 是唯一需要提醒用户的一档：区域是从兜底列表里猜的，没有
    /// 任何东西证明它属于这个账号。同步之后一条记录都没有时，这是用户唯一
    /// 能看到的线索。
    pub region_confidence: String,
    /// 后台是否正在压缩历史报文。
    ///
    /// 只发一个 `compaction://started` 事件是不够的：它在 Rust 的 setup() 里
    /// 就发出去了，而前端要等 onMounted 才开始监听——事件发出时没人在听，
    /// 于是界面上只剩一行「同步让路」的提示，却没有任何东西解释为什么。
    /// 状态可以随时被读到，事件不行。
    pub compacting: bool,
}

/// Web-login progress exposed to the frontend and the `login://status` event.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct LoginStatus {
    pub state: String,
    pub message: String,
    pub page_url: String,
    /// `message` 那句话的稳定码。界面按它取自己语言的文案，取不到才回落到
    /// 中文原文。登录是英文用户最容易卡住的一步，这里尤其不能只有中文。
    #[serde(default)]
    pub code: String,
}

impl LoginStatus {
    pub fn idle() -> Self {
        Self {
            state: "idle".to_string(),
            message: String::new(),
            page_url: String::new(),
            code: String::new(),
        }
    }

    pub fn new(
        state: &str,
        code: &str,
        message: impl Into<String>,
        page_url: impl Into<String>,
    ) -> Self {
        Self {
            state: state.to_string(),
            message: message.into(),
            page_url: page_url.into(),
            code: code.to_string(),
        }
    }
}

/// A stream result shaped for the TypeScript sync-report contract.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct UiSyncStreamResult {
    pub stream: String,
    pub status: String,
    pub records_written: i64,
    pub message: Option<String>,
    pub needs_reauth: Option<bool>,
    pub last_cloud_sync_at: Option<String>,
    pub newest_sample_at: Option<String>,
}

/// A sync report shaped for the TypeScript IPC contract.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct UiSyncReport {
    pub success: bool,
    pub outcome: String,
    pub started_at: String,
    pub finished_at: String,
    pub last_cloud_sync_at: String,
    pub total_records: i64,
    pub streams: Vec<UiSyncStreamResult>,
    pub message: Option<String>,
    /// `message` 那句话的稳定码。界面按它取自己语言的文案，取不到才回落到
    /// `message` 的中文原文——后端不按界面语言出文案。
    #[serde(default)]
    pub message_code: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct CleanupResult {
    pub days: i64,
    pub message: Option<String>,
}

/// Convert an internal sync report to the frontend report shape.
pub fn ui_sync_report(
    report: sync::SyncReport,
    started_at: String,
    finished_at: String,
    outcome: String,
    freshness: &BTreeMap<String, StreamFreshness>,
) -> UiSyncReport {
    let streams = report
        .streams
        .into_iter()
        .map(|stream| {
            let stream_freshness = freshness.get(&stream.stream).cloned().unwrap_or_default();
            UiSyncStreamResult {
                stream: stream.stream,
                status: stream_status_name(stream.status).to_string(),
                records_written: stream.records_written,
                message: stream.message,
                needs_reauth: Some(stream.needs_reauth),
                last_cloud_sync_at: stream_freshness.last_cloud_sync_at,
                newest_sample_at: stream_freshness.newest_sample_at,
            }
        })
        .collect::<Vec<_>>();

    let total_records = streams.iter().map(|stream| stream.records_written).sum();

    // The report-level "last cloud sync at" must reflect the newest cloud
    // timestamp the streams actually carried, not the local completion time
    // (which is always >= the cloud data time).  Fall back to the finished
    // time only when no stream carries cloud freshness.
    let last_cloud_sync_at = freshness
        .values()
        .filter_map(|stream| stream.last_cloud_sync_at.clone())
        .max()
        .unwrap_or_else(|| finished_at.clone());

    UiSyncReport {
        success: report.success,
        outcome,
        started_at,
        last_cloud_sync_at,
        finished_at,
        total_records,
        streams,
        message: report.message,
        message_code: None,
    }
}

/// Convert persisted stream state into the frontend stream view.
pub fn stream_views(
    statuses: &[models::DataStatus],
    freshness: &BTreeMap<String, StreamFreshness>,
) -> Vec<StreamStatusView> {
    statuses
        .iter()
        .map(|status| {
            let stream_freshness = freshness.get(&status.stream).cloned().unwrap_or_default();
            StreamStatusView {
                stream: status.stream.clone(),
                status: status.status.clone(),
                records: Some(status.records_written),
                last_sync: status.last_sync.map(|timestamp| timestamp.to_rfc3339()),
                last_cloud_sync_at: stream_freshness.last_cloud_sync_at,
                newest_sample_at: stream_freshness.newest_sample_at,
                message: status.message.clone(),
                needs_reauth: Some(status.needs_reauth),
            }
        })
        .collect()
}

/// Convert persisted stream state into a stable capability list.
///
/// Capability availability is evidence-based: only an explicitly `verified`
/// capability with a non-failing stream status is marked available.  In
/// particular, `unverified` is never promoted to available.  The `sleep`
/// stream is the persisted representation of the band-data endpoint, so it is
/// accepted as an alias for the `band_data` capability.
pub fn capability_views(statuses: &[models::DataStatus]) -> Vec<CapabilityStatusView> {
    [
        "heart_rate",
        "daily_summary",
        "workouts",
        "band_data",
        "watch_statistics",
    ]
    .into_iter()
    .map(|capability| {
        let status = find_capability_status(statuses, capability);
        let (available, reason, reason_code) = match status {
            Some(status) => {
                let capability_state = status.capability.trim().to_ascii_lowercase();
                let stream_state = status.status.trim().to_ascii_lowercase();
                let available = capability_state == "verified"
                    && !status.needs_reauth
                    && !matches!(
                        stream_state.as_str(),
                        "failed" | "error" | "unavailable" | "unverified"
                    );
                let (reason, reason_code) = if available {
                    (status.message.clone(), None)
                } else {
                    let (code, message) = capability_reason(status, &capability_state);
                    (Some(message), code)
                };
                (available, reason, reason_code)
            }
            None => (
                false,
                Some("尚未同步".to_string()),
                Some("err.capability.not_synced".to_string()),
            ),
        };

        CapabilityStatusView {
            capability: capability.to_string(),
            available,
            reason_code,
            reason,
        }
    })
    .collect()
}

fn find_capability_status<'a>(
    statuses: &'a [models::DataStatus],
    capability: &str,
) -> Option<&'a models::DataStatus> {
    // Prefer an exact stream name when both an alias and the canonical name
    // are present in a status snapshot.
    statuses
        .iter()
        .find(|status| status.stream.eq_ignore_ascii_case(capability))
        .or_else(|| {
            if capability == "band_data" {
                statuses
                    .iter()
                    .find(|status| status.stream.eq_ignore_ascii_case("sleep"))
            } else {
                None
            }
        })
}

/// 这条能力为什么不可用。返回 (稳定码, 中文原文)。
///
/// 码为 `None` 的那一支是后端透传的原始消息——它来自云端，翻不了，界面只能
/// 原样显示。其余几支都是我们自己写的话，必须能按界面语言换。
fn capability_reason(
    status: &models::DataStatus,
    capability_state: &str,
) -> (Option<String>, String) {
    if status.needs_reauth {
        return match status.message.clone() {
            Some(message) => (None, message),
            None => (
                Some("err.capability.needs_reauth".to_string()),
                "需要重新认证".to_string(),
            ),
        };
    }
    if let Some(message) = status.message.clone() {
        return (None, message);
    }
    match capability_state {
        "unverified" => (
            Some("err.capability.unverified".to_string()),
            "能力尚未验证".to_string(),
        ),
        "unavailable" => (
            Some("err.capability.unavailable".to_string()),
            "能力不可用".to_string(),
        ),
        "" => (
            Some("err.capability.unknown".to_string()),
            "能力状态未知".to_string(),
        ),
        other => (
            Some("err.capability.other".to_string()),
            format!("能力状态: {other}"),
        ),
    }
}

fn stream_status_name(status: sync::StreamStatus) -> &'static str {
    match status {
        sync::StreamStatus::Success => "success",
        sync::StreamStatus::Failed => "failed",
        sync::StreamStatus::Unavailable => "unavailable",
        sync::StreamStatus::Unverified => "unverified",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn login_status_serializes_required_fields() {
        let status = LoginStatus::new(
            "waiting",
            "err.login.waiting",
            "请在弹出窗口完成登录",
            "https://watchface.zepp.com/",
        );
        let value = serde_json::to_value(&status).unwrap();
        assert_eq!(value["state"], "waiting");
        assert_eq!(value["message"], "请在弹出窗口完成登录");
        assert_eq!(value["code"], "err.login.waiting");
        assert_eq!(value["page_url"], "https://watchface.zepp.com/");
    }
}
