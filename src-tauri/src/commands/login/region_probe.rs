//! 登录后的区域探测：按提示与白名单逐批试主机（从 commands/login.rs 拆出）。

use super::*;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum RegionProbeFailure {
    Rejected,
    Transient,
    Other,
}

#[derive(Debug, Default)]
pub(super) struct RegionProbeFailures {
    pub(super) rejected: usize,
    pub(super) transient: usize,
    pub(super) other: usize,
}

impl RegionProbeFailures {
    pub(super) fn record(&mut self, failure: RegionProbeFailure) {
        match failure {
            RegionProbeFailure::Rejected => self.rejected += 1,
            RegionProbeFailure::Transient => self.transient += 1,
            RegionProbeFailure::Other => self.other += 1,
        }
    }

    pub(super) fn into_login_failure(self) -> LoginFailure {
        // An explicit 401/403 is stronger evidence than failures from the
        // fallback hosts. Do not hide it behind unrelated 404s or timeouts.
        if self.rejected > 0 {
            return LoginFailure::fatal(AppError::new(
                "err.login.credentials_rejected",
                "Zepp 拒绝了这次登录凭据，请退出登录窗口后重新登录",
            ));
        }
        // 唯一值得原地重试的一类：凭据没被否掉，只是这会儿够不着区域服务。
        if self.transient > 0 {
            return LoginFailure::retryable(AppError::new(
                "err.login.region_unreachable",
                "暂时无法连接 Zepp 区域服务，请检查网络后重试",
            ));
        }
        LoginFailure::fatal(AppError::new(
            "err.login.region_probe_failed",
            "读到了凭据，但无法确认账号区域。请重新登录，或改用 HAR 导入。",
        ))
    }
}

pub(super) fn classify_region_probe_error(error: &ZeppBridgeError) -> RegionProbeFailure {
    match error {
        ZeppBridgeError::NeedsReauth(_) => RegionProbeFailure::Rejected,
        ZeppBridgeError::NetworkError(_) | ZeppBridgeError::RetryExhausted { .. } => {
            RegionProbeFailure::Transient
        }
        _ => RegionProbeFailure::Other,
    }
}

/// 最终选中的区域 host，以及选中它的理由有多硬。
///
/// `confidence` 是给界面的稳定码，不是文案：
/// * `identified` —— 这个 host 按 `user_id` 交出了该账号绑定的设备；
/// * `hinted` —— Zepp 在这次登录响应里就指名了这个 host，请求也通了，只是这个
///   账号没有设备可拿；
/// * `unconfirmed` —— 从兜底列表里猜出来的，没有任何东西证明它属于这个账号。
pub(super) struct RegionWinner {
    pub(super) auth: AuthInfo,
    pub(super) confidence: &'static str,
}

/// 一批 host 探完之后剩下什么。
#[derive(Default)]
pub(super) struct RegionBatchOutcome {
    /// 认领了这个账号的 host。有它就不必再看别的。
    pub(super) identified: Option<AuthInfo>,
    /// 请求通了但拿不出设备的 host 里，偏好顺序最靠前的那个。
    pub(super) fallback: Option<(usize, AuthInfo)>,
}

impl RegionBatchOutcome {
    /// 收下一个探测结果。返回 `true` 表示已经拿到最硬的证据，不必再等别人。
    ///
    /// 结果按完成先后到达，而选谁要按偏好顺序，所以弱证据之间比的是 `rank`
    /// 而不是先来后到。这正是原来那个 bug 的所在：谁先答应就用谁，而一个不
    /// 认识这个用户的区域根本不去查数据，往往答得最快。
    pub(super) fn record(&mut self, rank: usize, auth: AuthInfo, evidence: RegionEvidence) -> bool {
        match evidence {
            RegionEvidence::Identified => {
                self.identified = Some(auth);
                true
            }
            RegionEvidence::Empty => {
                let better = match self.fallback.as_ref() {
                    Some((current, _)) => rank < *current,
                    None => true,
                };
                if better {
                    self.fallback = Some((rank, auth));
                }
                false
            }
        }
    }

    /// 折算成最终结论。
    ///
    /// `authoritative` 指这批 host 是不是 Zepp 在这次登录响应里自己指出来的。
    /// 是的话，即便它交不出设备（这个账号可能一块表都没绑），也仍然有 Zepp 的
    /// 背书；不是的话，就只是从兜底列表里猜中的一个，必须标出来。
    pub(super) fn into_winner(self, authoritative: bool) -> Option<RegionWinner> {
        if let Some(auth) = self.identified {
            return Some(RegionWinner {
                auth,
                confidence: "identified",
            });
        }
        let (_, auth) = self.fallback?;
        Some(RegionWinner {
            auth,
            confidence: if authoritative {
                "hinted"
            } else {
                "unconfirmed"
            },
        })
    }
}

pub(super) async fn probe_region_hosts(
    user_id: &str,
    app_token: &str,
    hosts: &[String],
    authoritative_count: usize,
) -> std::result::Result<RegionWinner, LoginFailure> {
    let deadline = tokio::time::Instant::now() + Duration::from_secs(45);
    let mut failures = RegionProbeFailures::default();
    let authoritative_count = authoritative_count.min(hosts.len());

    // A cname/domains/wf_baseUrl hint came from this login response (or from
    // the same already-saved user), so verify it before sending the token to
    // any fallback region. A short stage timeout leaves enough of the global
    // budget for recovery when Zepp returned a stale host.
    //
    // 这一阶段的 host 是 Zepp 自己在这次登录响应里指出来的，它本身就是身份
    // 证据。所以请求一通就采用，哪怕这个账号一块表都没绑——再去盲扫兜底列表
    // 只会让最常见的那条路白等几十秒。
    if authoritative_count > 0 {
        let stage_deadline = std::cmp::min(
            deadline,
            tokio::time::Instant::now() + Duration::from_secs(15),
        );
        let outcome = probe_region_batch(
            user_id,
            app_token,
            &hosts[..authoritative_count],
            0,
            stage_deadline,
            &mut failures,
        )
        .await;
        if let Some(winner) = outcome.into_winner(true) {
            return Ok(winner);
        }
    }

    // 兜底阶段是在**猜**：这些 host 没有任何证据说它属于这个账号。所以这里不能
    // 「谁先答应就用谁」——一个不认识这个用户的区域根本不会去查数据，它返回的
    // 结构化空响应往往比正确区域返回真实数据还快。只有交出了设备的那个才算数；
    // 全都交不出时才退而用偏好顺序最靠前的一个，并把这件事标成 unconfirmed。
    let outcome = probe_region_batch(
        user_id,
        app_token,
        &hosts[authoritative_count..],
        authoritative_count,
        deadline,
        &mut failures,
    )
    .await;
    if let Some(winner) = outcome.into_winner(false) {
        return Ok(winner);
    }
    Err(failures.into_login_failure())
}

/// 并发探测一批 host。
///
/// `rank_offset` 是这批 host 在整个偏好列表里的起始位置：结果按完成先后到达，
/// 而选谁要按偏好顺序，所以每个结果都得带着自己的名次回来。
pub(super) async fn probe_region_batch(
    user_id: &str,
    app_token: &str,
    hosts: &[String],
    rank_offset: usize,
    deadline: tokio::time::Instant,
    failures: &mut RegionProbeFailures,
) -> RegionBatchOutcome {
    let mut outcome = RegionBatchOutcome::default();
    if hosts.is_empty() {
        return outcome;
    }
    type ProbeResult = std::result::Result<(usize, AuthInfo, RegionEvidence), RegionProbeFailure>;
    let (tx, mut rx) = tokio::sync::mpsc::channel::<ProbeResult>(hosts.len().max(1));
    let mut handles = Vec::new();
    for (index, host) in hosts.iter().enumerate() {
        let auth = AuthInfo {
            app_token: app_token.to_string(),
            user_id: user_id.to_string(),
            region_host: host.clone(),
        };
        let rank = rank_offset + index;
        let tx = tx.clone();
        handles.push(tokio::spawn(async move {
            let result = probe_region_evidence(&auth)
                .await
                .map(|evidence| (rank, auth, evidence))
                .map_err(|error| classify_region_probe_error(&error));
            let _ = tx.send(result).await;
        }));
    }
    drop(tx);

    for _ in 0..hosts.len() {
        let Some(remaining) = deadline.checked_duration_since(tokio::time::Instant::now()) else {
            failures.transient += 1;
            break;
        };
        match tokio::time::timeout(remaining, rx.recv()).await {
            Ok(Some(Ok((rank, auth, evidence)))) => {
                if outcome.record(rank, auth, evidence) {
                    break;
                }
            }
            Ok(Some(Err(failure))) => failures.record(failure),
            Ok(None) => break,
            Err(_) => {
                failures.transient += 1;
                break;
            }
        }
    }
    for handle in handles {
        handle.abort();
    }
    outcome
}

pub(super) async fn preferred_region_hosts(
    state: &AppState,
    user_id: &str,
    hint: Option<&str>,
) -> (Vec<String>, usize) {
    let mut hosts = Vec::new();
    // The current login response is authoritative. A saved host belongs to
    // the previous account and is only useful when that account id matches.
    if let Some(hint) = hint {
        for host in hosts_from_region_hint(hint) {
            push_unique_host(&mut hosts, &host);
        }
    }
    if let Ok(Some(saved)) = state.auth.load_auth() {
        if saved.user_id == user_id {
            push_unique_host(&mut hosts, &saved.region_host);
        }
    }
    let authoritative_count = hosts.len();
    for host in REGION_HOST_ALLOWLIST {
        push_unique_host(&mut hosts, host);
    }
    (hosts, authoritative_count)
}

pub(super) fn push_unique_host(hosts: &mut Vec<String>, raw: &str) {
    if let Ok(host) = validate_region_host(raw) {
        if !hosts.iter().any(|existing| existing == &host) {
            hosts.push(host);
        }
    }
}

/// Map a cookie hint onto the allow-listed regional API origins.
pub(crate) fn hosts_from_region_hint(hint: &str) -> Vec<String> {
    let trimmed = hint.trim();
    if trimmed.is_empty() {
        return Vec::new();
    }
    if let Ok(host) = validate_region_host(trimmed) {
        return vec![host];
    }

    let lowered = trimmed.to_ascii_lowercase();
    let token = lowered
        .rsplit(['/', '.', '-', '_'])
        .find(|part| {
            matches!(
                *part,
                "cn" | "cn2"
                    | "cn3"
                    | "us"
                    | "us2"
                    | "us3"
                    | "de"
                    | "de2"
                    | "sg"
                    | "sg2"
                    | "eu"
                    | "eu2"
                    | "in"
                    | "ru"
            )
        })
        .unwrap_or(lowered.as_str());

    REGION_HOST_ALLOWLIST
        .iter()
        .filter(|host| host.contains(&format!("-{token}.")))
        .map(|host| (*host).to_string())
        .collect()
}
