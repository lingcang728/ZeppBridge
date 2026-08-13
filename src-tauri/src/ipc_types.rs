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
    pub storage: Option<crate::models::StorageEstimate>,
}

/// Web-login progress exposed to the frontend and the `login://status` event.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct LoginStatus {
    pub state: String,
    pub message: String,
    pub page_url: String,
}

impl LoginStatus {
    pub fn idle() -> Self {
        Self {
            state: "idle".to_string(),
            message: String::new(),
            page_url: String::new(),
        }
    }

    pub fn new(state: &str, message: impl Into<String>, page_url: impl Into<String>) -> Self {
        Self {
            state: state.to_string(),
            message: message.into(),
            page_url: page_url.into(),
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

    UiSyncReport {
        success: report.success,
        outcome,
        started_at,
        last_cloud_sync_at: finished_at.clone(),
        finished_at,
        total_records,
        streams,
        message: report.message,
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
        let (available, reason) = match status {
            Some(status) => {
                let capability_state = status.capability.trim().to_ascii_lowercase();
                let stream_state = status.status.trim().to_ascii_lowercase();
                let available = capability_state == "verified"
                    && !status.needs_reauth
                    && !matches!(
                        stream_state.as_str(),
                        "failed" | "error" | "unavailable" | "unverified"
                    );
                let reason = if available {
                    status.message.clone()
                } else {
                    Some(capability_reason(status, &capability_state))
                };
                (available, reason)
            }
            None => (false, Some("尚未同步".to_string())),
        };

        CapabilityStatusView {
            capability: capability.to_string(),
            available,
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

fn capability_reason(status: &models::DataStatus, capability_state: &str) -> String {
    if status.needs_reauth {
        return status
            .message
            .clone()
            .unwrap_or_else(|| "需要重新认证".to_string());
    }
    if let Some(message) = status.message.clone() {
        return message;
    }
    match capability_state {
        "unverified" => "能力尚未验证".to_string(),
        "unavailable" => "能力不可用".to_string(),
        "" => "能力状态未知".to_string(),
        other => format!("能力状态: {other}"),
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
            "请在弹出窗口完成登录",
            "https://watchface.zepp.com/",
        );
        let value = serde_json::to_value(&status).unwrap();
        assert_eq!(value["state"], "waiting");
        assert_eq!(value["message"], "请在弹出窗口完成登录");
        assert_eq!(value["page_url"], "https://watchface.zepp.com/");
    }
}
