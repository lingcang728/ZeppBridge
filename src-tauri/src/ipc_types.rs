use crate::{models, proxy, storage::StreamFreshness, sync};
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

/// Details needed by a phone to connect to the local capture proxy.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct CaptureSession {
    pub state: String,
    pub lan_ip: String,
    pub lan_ips: Vec<String>,
    pub port: u16,
    pub certificate_path: String,
    pub certificate_url: String,
    pub started_at: Option<String>,
    pub message: Option<String>,
}

/// Public capture status.  `CapturedSummary` deliberately contains no token.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct CaptureStatus {
    pub state: String,
    pub session: Option<CaptureSession>,
    pub captured: Option<CapturedSummary>,
    pub diagnostics: CaptureDiagnostics,
    pub message: Option<String>,
    pub error: Option<String>,
}

/// Safe, redacted progress information for the local capture proxy.
///
/// This deliberately contains only aggregate counters, booleans, and a
/// hostname/timestamp.  It never contains a token, user identifier, client
/// address, request path/query, headers, or body data.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct CaptureDiagnostics {
    pub phone_connect_count: u64,
    pub zepp_connect_count: u64,
    pub zepp_tls_hello_count: u64,
    pub zepp_http_request_count: u64,
    pub token_seen: bool,
    pub user_id_seen: bool,
    pub last_zepp_host: Option<String>,
    pub last_activity_at: Option<String>,
    pub stage: String,
    pub guidance: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct CapturedSummary {
    pub user_id: String,
    pub region_host: String,
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

/// Convert a proxy status into the values required to configure a phone.
///
/// A session is only returned when all required connection details are
/// present.  `certificate_path` is the public `.cer` export; the private key
/// and PEM path are intentionally not exposed through this view.
pub fn capture_session_from(status: &proxy::ProxyStatus) -> Option<CaptureSession> {
    Some(CaptureSession {
        state: proxy_lifecycle_name(status.lifecycle).to_string(),
        lan_ip: status.local_ipv4.first()?.clone(),
        lan_ips: status.local_ipv4.clone(),
        port: status.port?,
        certificate_path: status.certificate_path.clone()?,
        certificate_url: status.certificate_url.clone()?,
        started_at: non_empty(status.updated_at.clone()),
        message: status.error.clone(),
    })
}

/// Convert internal proxy counters into safe, user-facing capture guidance.
///
/// The order is intentional: a complete capture wins first, followed by the
/// earliest missing transport stage.  This keeps contradictory or stale
/// token/user flags from exposing a later stage before its prerequisite
/// connection evidence exists.
pub fn capture_diagnostics_from(status: &proxy::ProxyStatus) -> CaptureDiagnostics {
    let (stage, guidance) = if status.captured {
        ("complete", "已捕获")
    } else if status.phone_connect_count == 0 {
        ("waiting_for_phone", "尚未收到手机代理连接")
    } else if status.zepp_connect_count == 0 {
        (
            "waiting_for_zepp_api",
            "手机已连接代理，但尚未出现 api-mifit 健康 API，请彻底关闭重开 Zepp 并打开首页/睡眠/运动刷新",
        )
    } else if status.zepp_tls_hello_count == 0 {
        (
            "tls_not_started",
            "已看到 Zepp 目标域名，但 TLS 未进入握手，可能连接被提前关闭",
        )
    } else if status.zepp_http_request_count == 0 {
        (
            "tls_not_trusted",
            "已看到 Zepp TLS 握手但无可解密请求，最常见是 Android 用户 CA 不被应用信任、iOS 未开启完全信任或证书固定",
        )
    } else if !status.token_seen {
        (
            "waiting_for_token",
            "已解密 Zepp 请求但未见 apptoken，请切换健康页面刷新",
        )
    } else if !status.user_id_seen {
        (
            "waiting_for_user_id",
            "已发现 token 但未识别用户 ID。只需在本页补填 Zepp 用户 ID（个人资料顶部，或 个人资料 → 反馈 / User Feedback），不要切到手动方式重填 token",
        )
    } else {
        ("collecting", "正在收集 Zepp 数据")
    };

    CaptureDiagnostics {
        phone_connect_count: status.phone_connect_count,
        zepp_connect_count: status.zepp_connect_count,
        zepp_tls_hello_count: status.zepp_tls_hello_count,
        zepp_http_request_count: status.zepp_http_request_count,
        token_seen: status.token_seen,
        user_id_seen: status.user_id_seen,
        last_zepp_host: status.last_zepp_host.clone(),
        last_activity_at: status.last_activity_at.clone(),
        stage: stage.to_string(),
        guidance: guidance.to_string(),
    }
}

/// Return a stable diagnostic payload for a completed stop operation.
pub fn stopped_capture_diagnostics_from(status: &proxy::ProxyStatus) -> CaptureDiagnostics {
    let mut diagnostics = capture_diagnostics_from(status);
    diagnostics.stage = "stopped".to_string();
    diagnostics.guidance = "捕获已停止".to_string();
    diagnostics
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

fn proxy_lifecycle_name(lifecycle: proxy::ProxyLifecycle) -> &'static str {
    match lifecycle {
        proxy::ProxyLifecycle::Stopped => "stopped",
        proxy::ProxyLifecycle::Starting => "starting",
        proxy::ProxyLifecycle::Running => "running",
        proxy::ProxyLifecycle::Stopping => "stopping",
        proxy::ProxyLifecycle::Error => "error",
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

fn non_empty(value: String) -> Option<String> {
    (!value.is_empty()).then_some(value)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn waiting_for_user_id_guidance_stays_on_this_page() {
        let diagnostics = capture_diagnostics_from(&crate::proxy::ProxyStatus {
            lifecycle: crate::proxy::ProxyLifecycle::Running,
            running: true,
            listen_address: None,
            port: Some(8888),
            local_ipv4: vec!["192.168.1.10".into()],
            certificate_path: None,
            certificate_pem_path: None,
            certificate_url: None,
            captured: false,
            phone_connect_count: 1,
            zepp_connect_count: 1,
            zepp_tls_hello_count: 1,
            zepp_http_request_count: 1,
            token_seen: true,
            user_id_seen: false,
            last_zepp_host: None,
            last_activity_at: None,
            error: None,
            firewall_warning: None,
            certificate_trust_warning: None,
            updated_at: String::new(),
        });
        assert_eq!(diagnostics.stage, "waiting_for_user_id");
        assert!(diagnostics.guidance.contains("不要切到手动"));
    }
}
