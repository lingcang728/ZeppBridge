use super::auth::verify_recent_heart_rate;
use crate::app_state::AppState;
use crate::connectors::zepp::validate_region_host;
use crate::ipc_error::AppError;
use crate::ipc_types::LoginStatus;
use crate::models::{AuthInfo, ZeppBridgeError};
use serde_json::Value;
use std::sync::atomic::Ordering;
use std::time::Duration;
use tauri::{
    webview::NewWindowResponse, AppHandle, Emitter, Manager, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder,
};

const LOGIN_WINDOW_LABEL: &str = "zepp-login";
const LOGIN_EVENT: &str = "login://status";
const PRIMARY_LOGIN_URL: &str = "https://watchface.zepp.com/";
const FALLBACK_LOGIN_URL: &str = "https://user.huami.com/privacy2/index.html";
const POLL_INTERVAL: Duration = Duration::from_millis(750);
const FALLBACK_AFTER: Duration = Duration::from_secs(40);
const SESSION_TIMEOUT: Duration = Duration::from_secs(15 * 60);
const COOKIE_EVAL_TIMEOUT: Duration = Duration::from_secs(2);

const REGION_HOST_ALLOWLIST: &[&str] = &[
    "https://api-mifit-cn.huami.com",
    "https://api-mifit-cn2.huami.com",
    "https://api-mifit-cn.zepp.com",
    "https://api-mifit-cn2.zepp.com",
    "https://api-mifit-cn3.zepp.com",
    "https://api-mifit.huami.com",
    "https://api-mifit.zepp.com",
    "https://api-mifit-us.huami.com",
    "https://api-mifit-us2.huami.com",
    "https://api-mifit-us3.zepp.com",
    "https://api-mifit-de.huami.com",
    "https://api-mifit-de2.huami.com",
    "https://api-mifit-de.zepp.com",
    "https://api-mifit-sg.huami.com",
    "https://api-mifit-sg2.huami.com",
    "https://api-mifit-in.huami.com",
    "https://api-mifit-ru.huami.com",
];

/// Credentials parsed from the login webview.  Never logged in full.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ExtractedLogin {
    pub user_id: String,
    pub app_token: String,
    pub region_hint: Option<String>,
}

#[tauri::command]
pub async fn start_web_login(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
    locale: String,
) -> std::result::Result<LoginStatus, AppError> {
    let epoch = state.login.epoch.fetch_add(1, Ordering::SeqCst) + 1;
    close_login_window(&app);

    let page_url = PRIMARY_LOGIN_URL.to_string();
    let status = LoginStatus::new(
        "waiting",
        "err.login.waiting",
        "请在弹出窗口完成 Zepp 登录",
        page_url.clone(),
    );
    publish_status(&app, &state, status.clone()).await;

    let window = build_login_window(&app, &page_url, &locale)?;
    spawn_login_poll(app, epoch, window);
    Ok(status)
}

#[tauri::command]
pub async fn cancel_web_login(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
) -> std::result::Result<LoginStatus, AppError> {
    state.login.epoch.fetch_add(1, Ordering::SeqCst);
    close_login_window(&app);
    let status = LoginStatus::idle();
    publish_status(&app, &state, status.clone()).await;
    Ok(status)
}

#[tauri::command]
pub async fn get_login_status(
    state: tauri::State<'_, AppState>,
) -> std::result::Result<LoginStatus, AppError> {
    Ok(state.login.status.read().await.clone())
}

fn build_login_window(
    app: &AppHandle,
    page_url: &str,
    locale: &str,
) -> std::result::Result<WebviewWindow, AppError> {
    let url = page_url
        .parse()
        .map_err(|_| AppError::new("err.login.bad_url", "登录地址无效"))?;
    let app_for_new_window = app.clone();
    WebviewWindowBuilder::new(app, LOGIN_WINDOW_LABEL, WebviewUrl::External(url))
        .title(login_window_title(locale))
        // A login attempt must not inherit a previous account's cookies or
        // localStorage. OAuth popups still stay in this one WebView session,
        // but closing it discards the session instead of silently reusing it
        // for the next account.
        .incognito(true)
        .inner_size(920.0, 760.0)
        .min_inner_size(420.0, 520.0)
        .resizable(true)
        .on_navigation(|url| {
            let allowed = is_allowed_login_url(url.as_str());
            if !allowed {
                log_blocked_login_url("navigation", url);
            }
            allowed
        })
        // Keep OAuth in this login webview.  A provider that switches to
        // `target=_blank` must not escape to the system browser because the
        // resulting Zepp cookies would live in a different browser profile.
        .on_new_window(move |url, _features| {
            if !is_allowed_login_url(url.as_str()) {
                log_blocked_login_url("new-window", &url);
                return NewWindowResponse::Deny;
            }
            if let Some(window) = app_for_new_window.get_webview_window(LOGIN_WINDOW_LABEL) {
                if let Err(error) = window.navigate(url) {
                    eprintln!("Zepp login OAuth navigation failed: {error}");
                }
            }
            NewWindowResponse::Deny
        })
        .build()
        .map_err(|error| {
            AppError::new(
                "err.login.window_failed",
                format!("无法打开登录窗口：{error}"),
            )
        })
}

fn spawn_login_poll(app: AppHandle, epoch: u64, window: WebviewWindow) {
    tauri::async_runtime::spawn(async move {
        let started = std::time::Instant::now();
        let mut fallback_used = false;
        // 曾经走到过「看起来已经登录」的页面，却始终没读出凭据。这两种超时
        // 对用户完全不是一回事：一种是没登录完，另一种是登录完了但我们没拿到
        // 东西——后者该直接把手动 / HAR 兜底摆到他面前，而不是让他等满 15
        // 分钟再看到一句「登录超时」。
        let mut looked_signed_in = false;

        loop {
            if !epoch_active(&app, epoch) {
                return;
            }
            if started.elapsed() >= SESSION_TIMEOUT {
                let (code, message) = if looked_signed_in {
                    (
                        "err.login.credentials_unreadable",
                        "已经登录，但没能从登录窗口读到凭据。可以改用 HAR 导入或手动填写 App Token。",
                    )
                } else {
                    ("err.login.timeout", "登录超时，请重试")
                };
                finish_failed(&app, epoch, code, message, current_page_url(&window)).await;
                close_login_window(&app);
                return;
            }
            if app.get_webview_window(LOGIN_WINDOW_LABEL).is_none() {
                finish_idle_if_active(&app, epoch).await;
                return;
            }

            let page_url = current_page_url(&window);
            if should_use_fallback(started.elapsed(), fallback_used, &page_url) {
                fallback_used = true;
                let _ = window.navigate(
                    FALLBACK_LOGIN_URL
                        .parse()
                        .expect("fallback login url is static"),
                );
                emit_progress(
                    &app,
                    epoch,
                    "waiting",
                    "err.login.fallback_page",
                    "正在打开备用登录页",
                    FALLBACK_LOGIN_URL,
                )
                .await;
            }

            let cookies = collect_cookies(&window, &page_url).await;
            // 只记 cookie 的名字，绝不记值——名字足以判断「是不是根本没有这个
            // cookie」，而值是凭据本身。
            if !looked_signed_in && page_looks_signed_in(&page_url, &cookies) {
                looked_signed_in = true;
                log_credential_probe(&page_url, &cookies);
            }
            if let Some(extracted) = parse_login_cookies(&cookies) {
                emit_progress(
                    &app,
                    epoch,
                    "extracting",
                    "err.login.extracting",
                    "已读取登录凭据，正在确认区域",
                    &page_url,
                )
                .await;
                emit_progress(
                    &app,
                    epoch,
                    "verifying",
                    "err.login.verifying",
                    "正在验证账号",
                    &page_url,
                )
                .await;

                match persist_extracted_login(&app, epoch, &extracted).await {
                    Ok(()) => {
                        if !epoch_active(&app, epoch) {
                            return;
                        }
                        emit_progress(
                            &app,
                            epoch,
                            "connected",
                            "err.login.connected",
                            "已连接 Zepp 账号",
                            &page_url,
                        )
                        .await;
                        close_login_window(&app);
                        return;
                    }
                    Err(failure) => {
                        finish_failed(&app, epoch, &failure.code, &failure.message, page_url).await;
                        close_login_window(&app);
                        return;
                    }
                }
            }

            tokio::time::sleep(POLL_INTERVAL).await;
        }
    });
}

async fn persist_extracted_login(
    app: &AppHandle,
    epoch: u64,
    extracted: &ExtractedLogin,
) -> std::result::Result<(), AppError> {
    let Some(state) = app.try_state::<AppState>() else {
        return Err(AppError::new(
            "err.login.state_unavailable",
            "应用状态不可用",
        ));
    };
    let (preferred, authoritative_count) =
        preferred_region_hosts(&state, &extracted.user_id, extracted.region_hint.as_deref()).await;
    let auth = probe_region_hosts(
        &extracted.user_id,
        &extracted.app_token,
        &preferred,
        authoritative_count,
    )
    .await?;
    if !epoch_active(app, epoch) {
        return Err(AppError::new("err.login.cancelled", "登录已取消"));
    }

    if let Err(error) = state.auth.save_auth(&auth) {
        return Err(AppError::new(
            "err.login.save_failed",
            format!("认证信息保存失败：{error}"),
        ));
    }

    let manager = match AppState::build_sync_manager(auth, &state.data_dir) {
        Ok(manager) => manager,
        Err(error) => {
            let message = error.to_string();
            let _ = state.auth.clear_auth();
            {
                let mut sync = state.sync.write().await;
                *sync = None;
            }
            {
                let mut auth_state = state.auth_state.write().await;
                *auth_state = "unconfigured".to_string();
            }
            {
                let mut warning = state.auth_warning.write().await;
                *warning = Some(format!("无法初始化同步，请检查认证区域后重试：{message}"));
            }
            return Err(AppError::new("err.login.sync_init_failed", message));
        }
    };

    {
        let mut sync = state.sync.write().await;
        *sync = Some(manager);
    }
    {
        let mut auth_state = state.auth_state.write().await;
        *auth_state = "verified".to_string();
    }
    {
        let mut warning = state.startup_warning.write().await;
        *warning = None;
    }
    {
        let mut warning = state.auth_warning.write().await;
        *warning = None;
    }
    super::data::refresh_device_profile(&state).await;
    Ok(())
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum RegionProbeFailure {
    Rejected,
    Transient,
    Other,
}

#[derive(Debug, Default)]
struct RegionProbeFailures {
    rejected: usize,
    transient: usize,
    other: usize,
}

impl RegionProbeFailures {
    fn record(&mut self, failure: RegionProbeFailure) {
        match failure {
            RegionProbeFailure::Rejected => self.rejected += 1,
            RegionProbeFailure::Transient => self.transient += 1,
            RegionProbeFailure::Other => self.other += 1,
        }
    }

    fn into_app_error(self) -> AppError {
        // An explicit 401/403 is stronger evidence than failures from the
        // fallback hosts. Do not hide it behind unrelated 404s or timeouts.
        if self.rejected > 0 {
            return AppError::new(
                "err.login.credentials_rejected",
                "Zepp 拒绝了这次登录凭据，请退出登录窗口后重新登录",
            );
        }
        if self.transient > 0 {
            return AppError::new(
                "err.login.region_unreachable",
                "暂时无法连接 Zepp 区域服务，请检查网络后重试",
            );
        }
        AppError::new(
            "err.login.region_probe_failed",
            "读到了凭据，但无法确认账号区域。请重新登录，或改用 HAR 导入。",
        )
    }
}

fn classify_region_probe_error(error: &ZeppBridgeError) -> RegionProbeFailure {
    match error {
        ZeppBridgeError::NeedsReauth(_) => RegionProbeFailure::Rejected,
        ZeppBridgeError::NetworkError(_) | ZeppBridgeError::RetryExhausted { .. } => {
            RegionProbeFailure::Transient
        }
        _ => RegionProbeFailure::Other,
    }
}

async fn probe_region_hosts(
    user_id: &str,
    app_token: &str,
    hosts: &[String],
    authoritative_count: usize,
) -> std::result::Result<AuthInfo, AppError> {
    let deadline = tokio::time::Instant::now() + Duration::from_secs(45);
    let mut failures = RegionProbeFailures::default();
    let authoritative_count = authoritative_count.min(hosts.len());

    // A cname/domains/wf_baseUrl hint came from this login response (or from
    // the same already-saved user), so verify it before sending the token to
    // any fallback region. A short stage timeout leaves enough of the global
    // budget for recovery when Zepp returned a stale host.
    if authoritative_count > 0 {
        let stage_deadline = std::cmp::min(
            deadline,
            tokio::time::Instant::now() + Duration::from_secs(15),
        );
        if let Some(auth) = probe_region_batch(
            user_id,
            app_token,
            &hosts[..authoritative_count],
            stage_deadline,
            &mut failures,
        )
        .await
        {
            return Ok(auth);
        }
    }

    if let Some(auth) = probe_region_batch(
        user_id,
        app_token,
        &hosts[authoritative_count..],
        deadline,
        &mut failures,
    )
    .await
    {
        return Ok(auth);
    }
    Err(failures.into_app_error())
}

async fn probe_region_batch(
    user_id: &str,
    app_token: &str,
    hosts: &[String],
    deadline: tokio::time::Instant,
    failures: &mut RegionProbeFailures,
) -> Option<AuthInfo> {
    if hosts.is_empty() {
        return None;
    }
    let (tx, mut rx) = tokio::sync::mpsc::channel::<
        std::result::Result<AuthInfo, RegionProbeFailure>,
    >(hosts.len().max(1));
    let mut handles = Vec::new();
    for host in hosts {
        let auth = AuthInfo {
            app_token: app_token.to_string(),
            user_id: user_id.to_string(),
            region_host: host.clone(),
        };
        let tx = tx.clone();
        handles.push(tokio::spawn(async move {
            let result = verify_recent_heart_rate(&auth)
                .await
                .map(|_| auth)
                .map_err(|error| classify_region_probe_error(&error));
            let _ = tx.send(result).await;
        }));
    }
    drop(tx);

    let mut winner = None;
    for _ in 0..hosts.len() {
        let Some(remaining) = deadline.checked_duration_since(tokio::time::Instant::now()) else {
            failures.transient += 1;
            break;
        };
        match tokio::time::timeout(remaining, rx.recv()).await {
            Ok(Some(Ok(auth))) => {
                winner = Some(auth);
                break;
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
    winner
}

async fn preferred_region_hosts(
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

fn push_unique_host(hosts: &mut Vec<String>, raw: &str) {
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

async fn collect_cookies(window: &WebviewWindow, page_url: &str) -> Vec<(String, String)> {
    // Start with values visible to the current page. They are the freshest
    // representation of the completed login and must win over cookie-store
    // entries with the same name.
    let mut pairs = Vec::new();
    if let Some(header) = document_cookie(window).await {
        append_missing_pairs(&mut pairs, parse_cookie_header(&header));
    }

    // 凭据不一定放在 cookie 里。表盘站是个前端应用，把登录信息写进
    // localStorage / sessionStorage 完全正常，那样 `document.cookie` 和
    // webview 的 cookie jar 都看不到它——用户于是只能自己打开开发者工具
    // 把 App Token 抠出来（Reddit 上就有人这么做）。这里再看一眼存储，
    // 名字对得上就当成凭据来源。
    if let Some(entries) = web_storage_entries(window).await {
        append_missing_pairs(&mut pairs, entries);
    }

    // `cookies()` returns the runtime store for every URL. That allowed a
    // previous Xiaomi/Google/etc. account to supply the first matching
    // userid/apptoken pair. Restrict the fallback to cookies applicable to the
    // page that just completed the Zepp login.
    if let Ok(url) = reqwest::Url::parse(page_url) {
        let window_for_store = window.clone();
        let scoped = tokio::task::spawn_blocking(move || {
            window_for_store
                .cookies_for_url(url)
                .map(|cookies| {
                    cookies
                        .into_iter()
                        .map(|cookie| (cookie.name().to_string(), cookie.value().to_string()))
                        .collect::<Vec<_>>()
                })
                .unwrap_or_default()
        })
        .await
        .unwrap_or_default();
        append_missing_pairs(&mut pairs, scoped);
    }
    pairs
}

fn append_missing_pairs(target: &mut Vec<(String, String)>, incoming: Vec<(String, String)>) {
    for pair in incoming {
        if !target
            .iter()
            .any(|(name, _)| name.eq_ignore_ascii_case(&pair.0))
        {
            target.push(pair);
        }
    }
}

/// 从 localStorage / sessionStorage 里捞可能是凭据的键值。
///
/// 只取名字看起来相关的那几个键，不把整个存储读回来——那里面还有用户的其它
/// 东西，我们没有理由碰。取回来的值一律走和 cookie 相同的
/// `sanitize_user_id` / `sanitize_app_token` 校验，格式不对就当没看见。
async fn web_storage_entries(window: &WebviewWindow) -> Option<Vec<(String, String)>> {
    const SCRIPT: &str = r#"(function(){
  try {
    var wanted = ['hm-user-login-info','hm_user_login_info','userid','user_id','apptoken','app_token','app-token','token_info','loginInfo','domains','cname','region','country_code','wf_baseUrl'];
    var out = {};
    [window.localStorage, window.sessionStorage].forEach(function(store){
      if (!store) return;
      for (var i = 0; i < store.length; i++) {
        var key = store.key(i);
        if (!key) continue;
        var lowered = key.toLowerCase();
        if (wanted.some(function(name){ return lowered.indexOf(name) !== -1; })) {
          if (!(key in out)) out[key] = store.getItem(key) || '';
        }
      }
    });
    return JSON.stringify(out);
  } catch (e) { return '{}'; }
})()"#;

    let (tx, rx) = tokio::sync::oneshot::channel::<String>();
    let sent = std::sync::Mutex::new(Some(tx));
    window
        .eval_with_callback(SCRIPT, move |raw| {
            if let Some(tx) = sent.lock().ok().and_then(|mut guard| guard.take()) {
                let _ = tx.send(decode_eval_string(&raw));
            }
        })
        .ok()?;
    let raw = tokio::time::timeout(COOKIE_EVAL_TIMEOUT, rx)
        .await
        .ok()
        .and_then(Result::ok)?;
    let parsed: serde_json::Map<String, Value> = serde_json::from_str(&raw).ok()?;
    let entries: Vec<(String, String)> = parsed
        .into_iter()
        .map(|(key, value)| match value {
            Value::String(text) => (key, text),
            other => (key, other.to_string()),
        })
        .collect();
    (!entries.is_empty()).then_some(entries)
}

async fn document_cookie(window: &WebviewWindow) -> Option<String> {
    let (tx, rx) = tokio::sync::oneshot::channel::<String>();
    let sent = std::sync::Mutex::new(Some(tx));
    window
        .eval_with_callback(
            "(function(){try{return document.cookie||'';}catch(e){return '';}})()",
            move |raw| {
                if let Some(tx) = sent.lock().ok().and_then(|mut guard| guard.take()) {
                    let _ = tx.send(decode_eval_string(&raw));
                }
            },
        )
        .ok()?;
    tokio::time::timeout(COOKIE_EVAL_TIMEOUT, rx)
        .await
        .ok()
        .and_then(Result::ok)
        .filter(|value| !value.is_empty())
}

fn decode_eval_string(raw: &str) -> String {
    serde_json::from_str::<String>(raw).unwrap_or_else(|_| raw.trim_matches('"').to_string())
}

/// Parse `document.cookie` / Cookie header text into name/value pairs.
pub(crate) fn parse_cookie_header(header: &str) -> Vec<(String, String)> {
    header
        .split(';')
        .filter_map(|part| {
            let (name, value) = part.split_once('=')?;
            let name = name.trim();
            if name.is_empty() {
                return None;
            }
            Some((name.to_string(), value.trim().to_string()))
        })
        .collect()
}

/// Extract a user id and app token from fake or real cookie pairs.
pub(crate) fn parse_login_cookies(cookies: &[(String, String)]) -> Option<ExtractedLogin> {
    // The official Watchface frontend treats the separate userid/apptoken
    // cookies as authoritative over the bundled login-info cookie.
    if let (Some(user_id), Some(app_token)) = (
        cookie_value(cookies, &["userid", "user_id", "userId"])
            .and_then(|value| sanitize_user_id(&percent_decode(&value))),
        cookie_value(cookies, &["apptoken", "app_token", "app-token", "appToken"])
            .and_then(|value| sanitize_app_token(&percent_decode(&value))),
    ) {
        return Some(ExtractedLogin {
            user_id,
            app_token,
            region_hint: region_hint_from_pairs(cookies),
        });
    }

    if let Some(login_info) = cookie_value(cookies, &["hm-user-login-info", "hm_user_login_info"]) {
        if let Some(extracted) = extract_from_login_info(&login_info) {
            return Some(extracted);
        }
    }

    None
}

fn region_hint_from_pairs(pairs: &[(String, String)]) -> Option<String> {
    const HOST_KEYS: &[&str] = &[
        "wf_baseUrl",
        "cname",
        "domains",
        "region_host",
        "api_host",
        "domain",
        "host",
    ];
    for key in HOST_KEYS {
        if let Some(raw) = cookie_value(pairs, &[*key]) {
            let decoded = decode_possibly_encoded(&raw);
            if let Ok(host) = validate_region_host(&decoded) {
                return Some(host);
            }
            if let Ok(value) = serde_json::from_str::<Value>(&decoded) {
                if let Some(host) = extract_host_from_value(&value) {
                    return Some(host);
                }
            }
        }
    }
    cookie_value(pairs, &["region", "country_code", "country"])
        .map(|value| percent_decode(&value))
        .filter(|value| !value.trim().is_empty())
}

fn extract_from_login_info(raw: &str) -> Option<ExtractedLogin> {
    let decoded = decode_possibly_encoded(raw);
    let root: Value = serde_json::from_str(&decoded).ok()?;
    let token_info = match root.get("token_info") {
        Some(Value::String(inner)) => {
            serde_json::from_str::<Value>(&decode_possibly_encoded(inner)).ok()?
        }
        Some(Value::Object(map)) => Value::Object(map.clone()),
        None => root.clone(),
        _ => return None,
    };

    let user_id = json_string(&token_info, &["user_id", "userid", "userId"])
        .and_then(|value| sanitize_user_id(&value))?;
    let app_token = json_string(
        &token_info,
        &["app_token", "apptoken", "appToken", "app-token"],
    )
    .and_then(|value| sanitize_app_token(&value))?;
    let region_hint = json_string(
        &token_info,
        &["region", "region_host", "host", "domain", "api_host"],
    )
    .or_else(|| {
        json_string(
            &root,
            &["region", "region_host", "host", "domain", "api_host"],
        )
    })
    .or_else(|| extract_host_from_value(&root));

    Some(ExtractedLogin {
        user_id,
        app_token,
        region_hint,
    })
}

fn json_string(value: &Value, keys: &[&str]) -> Option<String> {
    let object = value.as_object()?;
    for key in keys {
        match object.get(*key) {
            Some(Value::String(text)) if !text.trim().is_empty() => {
                return Some(text.trim().to_string());
            }
            Some(Value::Number(number)) => return Some(number.to_string()),
            _ => {}
        }
    }
    None
}

fn extract_host_from_value(value: &Value) -> Option<String> {
    match value {
        Value::String(text) => validate_region_host(text).ok(),
        Value::Object(map) => map.values().find_map(extract_host_from_value),
        Value::Array(items) => items.iter().find_map(extract_host_from_value),
        _ => None,
    }
}

fn cookie_value(cookies: &[(String, String)], names: &[&str]) -> Option<String> {
    cookies.iter().find_map(|(name, value)| {
        names
            .iter()
            .any(|candidate| name.eq_ignore_ascii_case(candidate))
            .then(|| value.clone())
    })
}

fn decode_possibly_encoded(raw: &str) -> String {
    let first = percent_decode(raw.trim().trim_matches('"'));
    if first.contains('%') {
        percent_decode(&first)
    } else {
        first
    }
}

fn percent_decode(value: &str) -> String {
    let replaced = value.replace("%2C", ",").replace("%2c", ",");
    let bytes = replaced.as_bytes();
    let mut output = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' && index + 2 < bytes.len() {
            let high = (bytes[index + 1] as char).to_digit(16);
            let low = (bytes[index + 2] as char).to_digit(16);
            if let (Some(high), Some(low)) = (high, low) {
                output.push(((high << 4) | low) as u8);
                index += 3;
                continue;
            }
        }
        output.push(bytes[index]);
        index += 1;
    }
    String::from_utf8_lossy(&output).into_owned()
}

fn sanitize_user_id(value: &str) -> Option<String> {
    let value = value.trim();
    if value.is_empty()
        || value.len() > 256
        || !value
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_'))
    {
        None
    } else {
        Some(value.to_string())
    }
}

fn sanitize_app_token(value: &str) -> Option<String> {
    let value = value.trim();
    if value.is_empty() || value.len() > 16 * 1024 || value.chars().any(char::is_control) {
        None
    } else {
        Some(value.to_string())
    }
}

fn is_allowed_login_url(url: &str) -> bool {
    let Ok(parsed) = reqwest::Url::parse(url) else {
        return false;
    };
    // Only HTTPS navigation to the Zepp/Huami account domains and the exact
    // OAuth hosts used by the official universal-login page is allowed.
    // `data:`, `blob:` and `about:` URLs are deliberately rejected: page
    // scripts must never be able to steer the credential-collecting webview
    // onto attacker-controlled inline content.
    if parsed.scheme() != "https" {
        return false;
    }
    parsed.host_str().is_some_and(|host| {
        let host = host.to_ascii_lowercase();
        host == "zepp.com"
            || host.ends_with(".zepp.com")
            || host == "huami.com"
            || host.ends_with(".huami.com")
            || matches!(
                host.as_str(),
                "account.xiaomi.com"
                    | "open.weixin.qq.com"
                    | "accounts.google.com"
                    | "www.facebook.com"
                    | "account-us.amazfit.com"
            )
    })
}

fn login_url_log_fields(url: &reqwest::Url) -> String {
    let host = url.host_str().unwrap_or("<none>");
    format!("host={host} path={}", url.path())
}

fn log_blocked_login_url(kind: &str, url: &reqwest::Url) {
    // Query and fragment can contain OAuth state/code values.  Never log them.
    eprintln!("blocked Zepp login {kind}: {}", login_url_log_fields(url));
}

/// 这一页看起来已经登录了吗。
///
/// 判断只看两件公开的事：页面是不是已经离开登录页，以及 cookie 里有没有出现
/// 任何一个「登录之后才会有」的名字。看不到凭据本身也没关系——我们要区分的是
/// 「用户还没登录」和「用户登录了但我们没读到」，前者该继续等，后者该停下来
/// 把兜底路径给他。
fn page_looks_signed_in(page_url: &str, cookies: &[(String, String)]) -> bool {
    const SIGNED_IN_HINTS: &[&str] = &[
        "hm-user-login-info",
        "hm_user_login_info",
        "userid",
        "user_id",
        "apptoken",
        "app_token",
        "token",
        "session",
    ];
    if cookies.iter().any(|(name, _)| {
        let lowered = name.to_ascii_lowercase();
        SIGNED_IN_HINTS.iter().any(|hint| lowered.contains(hint))
    }) {
        return true;
    }
    // 表盘站登录成功后会离开 /login 这一层。
    page_url.starts_with("https://watchface.zepp.com/")
        && !page_url.contains("/login")
        && !page_url.contains("account.xiaomi.com")
}

/// 记下这一轮看到了哪些 cookie **名字**。
///
/// 只有名字和 host。值就是凭据本身，任何情况下都不写出去；query 里可能带
/// OAuth 的 state/code，同样不写。这份日志的唯一用途是回答「到底有没有那个
/// cookie」——旧版在这里什么都不说，用户和我们都只能猜。
fn log_credential_probe(page_url: &str, cookies: &[(String, String)]) {
    let host = reqwest::Url::parse(page_url)
        .ok()
        .and_then(|url| url.host_str().map(str::to_string))
        .unwrap_or_else(|| "unknown".to_string());
    let mut names: Vec<&str> = cookies.iter().map(|(name, _)| name.as_str()).collect();
    names.sort_unstable();
    eprintln!(
        "Zepp login: page looks signed in (host={host}); cookie names seen: [{}]",
        names.join(", ")
    );
}

fn should_use_fallback(elapsed: Duration, fallback_used: bool, page_url: &str) -> bool {
    !fallback_used && elapsed >= FALLBACK_AFTER && !page_url.starts_with("https://user.huami.com/")
}

fn current_page_url(window: &WebviewWindow) -> String {
    window
        .url()
        .map(|url| url.to_string())
        .unwrap_or_else(|_| PRIMARY_LOGIN_URL.to_string())
}

fn close_login_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(LOGIN_WINDOW_LABEL) {
        let _ = window.close();
    }
}

fn epoch_active(app: &AppHandle, epoch: u64) -> bool {
    app.try_state::<AppState>()
        .is_some_and(|state| state.login.epoch.load(Ordering::SeqCst) == epoch)
}

async fn publish_status(app: &AppHandle, state: &AppState, status: LoginStatus) {
    {
        let mut current = state.login.status.write().await;
        *current = status.clone();
    }
    let _ = app.emit(LOGIN_EVENT, status);
}

async fn emit_progress(
    app: &AppHandle,
    epoch: u64,
    state_name: &str,
    code: &str,
    message: &str,
    page_url: &str,
) {
    if !epoch_active(app, epoch) {
        return;
    }
    let Some(state) = app.try_state::<AppState>() else {
        return;
    };
    publish_status(
        app,
        &state,
        LoginStatus::new(state_name, code, message, safe_login_page_url(page_url)),
    )
    .await;
}

fn safe_login_page_url(raw: &str) -> String {
    let Ok(mut url) = reqwest::Url::parse(raw) else {
        return String::new();
    };
    let _ = url.set_username("");
    let _ = url.set_password(None);
    url.set_query(None);
    url.set_fragment(None);
    url.to_string()
}

fn login_window_title(locale: &str) -> &'static str {
    if locale.trim().to_ascii_lowercase().starts_with("zh") {
        "登录 Zepp"
    } else {
        "Sign in to Zepp"
    }
}

async fn finish_failed(app: &AppHandle, epoch: u64, code: &str, message: &str, page_url: String) {
    emit_progress(app, epoch, "failed", code, message, &page_url).await;
}

async fn finish_idle_if_active(app: &AppHandle, epoch: u64) {
    if !epoch_active(app, epoch) {
        return;
    }
    let Some(state) = app.try_state::<AppState>() else {
        return;
    };
    publish_status(app, &state, LoginStatus::idle()).await;
}

#[cfg(test)]
mod tests {
    use super::*;

    /// localStorage 里的凭据要和 cookie 一样能用。
    ///
    /// 表盘站是个前端应用，把登录信息写进 localStorage 完全正常；那样
    /// `document.cookie` 和 webview 的 cookie jar 都看不到它，用户就只能自己
    /// 开开发者工具抠 App Token——Reddit 上真有人是这么过来的。
    #[test]
    fn credentials_from_web_storage_parse_like_cookies() {
        let raw = r#"{"token_info":{"user_id":"55","app_token":"from-local-storage"}}"#;
        let entries = vec![("hm-user-login-info".to_string(), raw.to_string())];
        let got = parse_login_cookies(&entries).expect("storage credentials");
        assert_eq!(got.user_id, "55");
        assert_eq!(got.app_token, "from-local-storage");
    }

    /// 「还没登录」和「登录了但我们没读到凭据」必须能分开。
    ///
    /// 分不开的话，后者只能一路静默等到 15 分钟超时，再给一句「登录超时，
    /// 请重试」——而重试多少次都不会好，该做的是改用 HAR 或手动填 Token。
    #[test]
    fn a_signed_in_page_is_told_apart_from_the_login_page() {
        let none: Vec<(String, String)> = Vec::new();

        // 还停在登录页，cookie 里也没有任何登录后才有的名字。
        assert!(!page_looks_signed_in(
            "https://watchface.zepp.com/login",
            &none
        ));
        assert!(!page_looks_signed_in(
            "https://account.xiaomi.com/oauth2/authorize",
            &none
        ));

        // 已经离开登录页。
        assert!(page_looks_signed_in(
            "https://watchface.zepp.com/dashboard",
            &none
        ));

        // 或者 cookie 里已经出现了登录后才有的名字，哪怕还没解析出凭据。
        assert!(page_looks_signed_in(
            "https://user.huami.com/privacy2/index.html",
            &[("apptoken".to_string(), "whatever".to_string())]
        ));
    }

    #[test]
    fn parses_hm_user_login_info_token_info() {
        let raw = r#"{"token_info":{"user_id":"12345","app_token":"tok_abc"}}"#;
        let cookies = vec![("hm-user-login-info".into(), raw.into())];
        let got = parse_login_cookies(&cookies).expect("login info");
        assert_eq!(got.user_id, "12345");
        assert_eq!(got.app_token, "tok_abc");
    }

    #[test]
    fn parses_url_encoded_login_info() {
        let encoded = "%7B%22token_info%22%3A%7B%22user_id%22%3A%22111%22%2C%22app_token%22%3A%22secret-token%22%7D%7D";
        let cookies = vec![("hm-user-login-info".into(), encoded.into())];
        let got = parse_login_cookies(&cookies).expect("encoded login info");
        assert_eq!(got.user_id, "111");
        assert_eq!(got.app_token, "secret-token");
    }

    #[test]
    fn parses_nested_string_token_info_and_numeric_user() {
        let raw = r#"{"token_info":"{\"user_id\":987654,\"app_token\":\"nested-tok\",\"region\":\"us\"}"}"#;
        let cookies = vec![("hm-user-login-info".into(), raw.into())];
        let got = parse_login_cookies(&cookies).expect("nested token_info");
        assert_eq!(got.user_id, "987654");
        assert_eq!(got.app_token, "nested-tok");
        assert_eq!(got.region_hint.as_deref(), Some("us"));
    }

    #[test]
    fn parses_userid_and_apptoken_cookies() {
        let cookies = vec![
            ("foo".into(), "bar".into()),
            ("userid".into(), "user_99".into()),
            ("apptoken".into(), "app-token-value".into()),
        ];
        let got = parse_login_cookies(&cookies).expect("pair cookies");
        assert_eq!(got.user_id, "user_99");
        assert_eq!(got.app_token, "app-token-value");
    }

    #[test]
    fn current_pair_overrides_stale_bundled_login_info() {
        let cookies = vec![
            (
                "hm-user-login-info".into(),
                r#"{"token_info":{"user_id":"old","app_token":"old-token"}}"#.into(),
            ),
            ("userid".into(), "new-user".into()),
            ("apptoken".into(), "new+token".into()),
            (
                "wf_baseUrl".into(),
                "https://api-mifit-sg2.huami.com".into(),
            ),
        ];
        let got = parse_login_cookies(&cookies).expect("current pair");
        assert_eq!(got.user_id, "new-user");
        assert_eq!(got.app_token, "new+token");
        assert_eq!(
            got.region_hint.as_deref(),
            Some("https://api-mifit-sg2.huami.com")
        );
    }

    #[test]
    fn region_host_can_be_read_from_domains_json() {
        let cookies = vec![
            ("userid".into(), "42".into()),
            ("apptoken".into(), "token".into()),
            (
                "domains".into(),
                r#"[{"cnames":["api-mifit-de2.huami.com"]}]"#.into(),
            ),
        ];
        let got = parse_login_cookies(&cookies).expect("domains candidate");
        assert_eq!(
            got.region_hint.as_deref(),
            Some("https://api-mifit-de2.huami.com")
        );
    }

    #[test]
    fn fresher_page_values_are_not_overwritten_by_cookie_store_values() {
        let mut pairs = vec![
            ("userid".into(), "current".into()),
            ("apptoken".into(), "current-token".into()),
        ];
        append_missing_pairs(
            &mut pairs,
            vec![
                ("userid".into(), "stale".into()),
                ("apptoken".into(), "stale-token".into()),
                ("cname".into(), "api-mifit-us2.huami.com".into()),
            ],
        );
        let got = parse_login_cookies(&pairs).expect("page candidate");
        assert_eq!(got.user_id, "current");
        assert_eq!(got.app_token, "current-token");
    }

    #[test]
    fn parses_document_cookie_header() {
        let header = "foo=bar; userid=42; apptoken=tkn";
        let got = parse_login_cookies(&parse_cookie_header(header)).expect("header");
        assert_eq!(got.user_id, "42");
        assert_eq!(got.app_token, "tkn");
    }

    #[test]
    fn rejects_incomplete_or_unsafe_cookies() {
        assert!(parse_login_cookies(&[("userid".into(), "42".into())]).is_none());
        assert!(parse_login_cookies(&[
            ("userid".into(), "bad/id".into()),
            ("apptoken".into(), "tok".into()),
        ])
        .is_none());
        assert!(parse_login_cookies(&[(
            "hm-user-login-info".into(),
            r#"{"token_info":{"login_token":"nope"}}"#.into()
        ),])
        .is_none());
    }

    #[test]
    fn region_hint_stays_on_allow_list() {
        assert_eq!(
            hosts_from_region_hint("https://api-mifit-cn3.zepp.com"),
            vec!["https://api-mifit-cn3.zepp.com".to_string()]
        );
        let us = hosts_from_region_hint("us");
        assert!(us.iter().all(|host| host.contains("-us")));
        assert!(hosts_from_region_hint("https://evil.example").is_empty());
        assert_eq!(
            hosts_from_region_hint("https://api-mifit-eu2.zepp.com"),
            vec!["https://api-mifit-eu2.zepp.com".to_string()]
        );
        assert!(REGION_HOST_ALLOWLIST.contains(&"https://api-mifit-sg2.huami.com"));
        assert!(REGION_HOST_ALLOWLIST.contains(&"https://api-mifit-de2.huami.com"));
    }

    #[test]
    fn native_login_title_follows_the_interface_locale() {
        assert_eq!(login_window_title("en"), "Sign in to Zepp");
        assert_eq!(login_window_title("en-US"), "Sign in to Zepp");
        assert_eq!(login_window_title("zh"), "登录 Zepp");
        assert_eq!(login_window_title("zh-CN"), "登录 Zepp");
    }

    #[test]
    fn login_status_url_drops_oauth_secrets() {
        let safe = safe_login_page_url(
            "https://account-us.zepp.com/callback?code=secret&state=private#access_token",
        );
        assert_eq!(safe, "https://account-us.zepp.com/callback");
        assert!(!safe.contains("secret"));
        assert!(!safe.contains("private"));
        assert!(!safe.contains("access_token"));
    }

    #[test]
    fn region_probe_error_classification_distinguishes_rejection() {
        assert_eq!(
            classify_region_probe_error(&ZeppBridgeError::NeedsReauth("HTTP 401".into())),
            RegionProbeFailure::Rejected
        );
        assert_eq!(
            classify_region_probe_error(&ZeppBridgeError::Unavailable("HTTP 404".into())),
            RegionProbeFailure::Other
        );
        let error = RegionProbeFailures {
            rejected: 1,
            transient: 2,
            other: 3,
        }
        .into_app_error();
        assert_eq!(error.code, "err.login.credentials_rejected");
    }

    #[test]
    fn login_navigation_allow_list() {
        assert!(is_allowed_login_url("https://watchface.zepp.com/"));
        assert!(is_allowed_login_url(
            "https://user.huami.com/privacy2/index.html"
        ));
        assert!(is_allowed_login_url(
            "https://account.xiaomi.com/oauth2/authorize"
        ));
        assert!(is_allowed_login_url(
            "https://open.weixin.qq.com/connect/qrconnect"
        ));
        assert!(is_allowed_login_url(
            "https://accounts.google.com/o/oauth2/auth"
        ));
        assert!(is_allowed_login_url(
            "https://www.facebook.com/dialog/oauth"
        ));
        assert!(is_allowed_login_url(
            "https://account-us.amazfit.com/v1/accounts/connect/facebook/callback"
        ));
        assert!(!is_allowed_login_url("about:blank"));
        assert!(!is_allowed_login_url(
            "data:text/html,<script>alert(1)</script>"
        ));
        assert!(!is_allowed_login_url("https://example.com/"));
        assert!(!is_allowed_login_url("http://watchface.zepp.com/"));
        assert!(!is_allowed_login_url(
            "https://evil.xiaomi.com/oauth2/authorize"
        ));
        assert!(!is_allowed_login_url("https://facebook.com/dialog/oauth"));
    }

    #[test]
    fn blocked_login_log_omits_query_and_fragment() {
        let url = reqwest::Url::parse(
            "https://example.com/oauth/callback?code=secret&state=private#access_token",
        )
        .unwrap();
        let fields = login_url_log_fields(&url);
        assert_eq!(fields, "host=example.com path=/oauth/callback");
        assert!(!fields.contains("secret"));
        assert!(!fields.contains("private"));
        assert!(!fields.contains("access_token"));
    }

    #[test]
    fn login_window_has_no_opener_permission() {
        let main: serde_json::Value =
            serde_json::from_str(include_str!("../../capabilities/default.json")).unwrap();
        assert_eq!(main["windows"], serde_json::json!(["main"]));

        let login: serde_json::Value =
            serde_json::from_str(include_str!("../../capabilities/zepp-login.json")).unwrap();
        assert_eq!(login["windows"], serde_json::json!(["zepp-login"]));
        assert!(login["permissions"]
            .as_array()
            .unwrap()
            .iter()
            .all(|permission| permission.as_str() != Some("opener:default")
                && permission["identifier"] != "opener:allow-open-url"));
    }
}
