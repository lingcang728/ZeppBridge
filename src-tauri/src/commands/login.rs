use super::auth::verify_recent_heart_rate;
use crate::app_state::AppState;
use crate::connectors::zepp::validate_region_host;
use crate::ipc_types::LoginStatus;
use crate::models::AuthInfo;
use serde_json::Value;
use std::sync::atomic::Ordering;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

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
    "https://api-mifit-de.zepp.com",
    "https://api-mifit-sg.huami.com",
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
) -> std::result::Result<LoginStatus, String> {
    let epoch = state.login.epoch.fetch_add(1, Ordering::SeqCst) + 1;
    close_login_window(&app);

    let page_url = PRIMARY_LOGIN_URL.to_string();
    let status = LoginStatus::new("waiting", "请在弹出窗口完成 Zepp 登录", page_url.clone());
    publish_status(&app, &state, status.clone()).await;

    let window = build_login_window(&app, &page_url)?;
    spawn_login_poll(app, epoch, window);
    Ok(status)
}

#[tauri::command]
pub async fn cancel_web_login(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
) -> std::result::Result<LoginStatus, String> {
    state.login.epoch.fetch_add(1, Ordering::SeqCst);
    close_login_window(&app);
    let status = LoginStatus::idle();
    publish_status(&app, &state, status.clone()).await;
    Ok(status)
}

#[tauri::command]
pub async fn get_login_status(
    state: tauri::State<'_, AppState>,
) -> std::result::Result<LoginStatus, String> {
    Ok(state.login.status.read().await.clone())
}

fn build_login_window(
    app: &AppHandle,
    page_url: &str,
) -> std::result::Result<WebviewWindow, String> {
    let url = page_url.parse().map_err(|_| "登录地址无效".to_string())?;
    WebviewWindowBuilder::new(app, LOGIN_WINDOW_LABEL, WebviewUrl::External(url))
        .title("登录 Zepp")
        .inner_size(920.0, 760.0)
        .min_inner_size(420.0, 520.0)
        .resizable(true)
        .on_navigation(|url| is_allowed_login_url(url.as_str()))
        .build()
        .map_err(|error| format!("无法打开登录窗口：{error}"))
}

fn spawn_login_poll(app: AppHandle, epoch: u64, window: WebviewWindow) {
    tauri::async_runtime::spawn(async move {
        let started = std::time::Instant::now();
        let mut fallback_used = false;

        loop {
            if !epoch_active(&app, epoch) {
                return;
            }
            if started.elapsed() >= SESSION_TIMEOUT {
                finish_failed(&app, epoch, "登录超时，请重试", current_page_url(&window)).await;
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
                    "正在打开备用登录页",
                    FALLBACK_LOGIN_URL,
                )
                .await;
            }

            let cookies = collect_cookies(&window).await;
            if let Some(extracted) = parse_login_cookies(&cookies) {
                emit_progress(
                    &app,
                    epoch,
                    "extracting",
                    "已读取登录凭据，正在确认区域",
                    &page_url,
                )
                .await;
                emit_progress(&app, epoch, "verifying", "正在验证账号", &page_url).await;

                match persist_extracted_login(&app, epoch, &extracted).await {
                    Ok(()) => {
                        if !epoch_active(&app, epoch) {
                            return;
                        }
                        emit_progress(&app, epoch, "connected", "已连接 Zepp 账号", &page_url)
                            .await;
                        close_login_window(&app);
                        return;
                    }
                    Err(message) => {
                        finish_failed(&app, epoch, &message, page_url).await;
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
) -> std::result::Result<(), String> {
    let Some(state) = app.try_state::<AppState>() else {
        return Err("应用状态不可用".to_string());
    };
    let preferred = preferred_region_hosts(&state, extracted.region_hint.as_deref()).await;
    let Some(auth) = probe_region_hosts(&extracted.user_id, &extracted.app_token, &preferred).await
    else {
        return Err("未能在允许的 Zepp 区域上验证账号，请确认已登录后再试".to_string());
    };
    if !epoch_active(app, epoch) {
        return Err("登录已取消".to_string());
    }

    if let Err(error) = state.auth.save_auth(&auth) {
        return Err(format!("认证信息保存失败：{error}"));
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
            return Err(message);
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

async fn probe_region_hosts(user_id: &str, app_token: &str, hosts: &[String]) -> Option<AuthInfo> {
    let (tx, mut rx) = tokio::sync::mpsc::channel::<AuthInfo>(1);
    let mut handles = Vec::new();
    for host in hosts {
        let auth = AuthInfo {
            app_token: app_token.to_string(),
            user_id: user_id.to_string(),
            region_host: host.clone(),
        };
        let tx = tx.clone();
        handles.push(tokio::spawn(async move {
            if verify_recent_heart_rate(&auth).await.is_ok() {
                let _ = tx.send(auth).await;
            }
        }));
    }
    drop(tx);

    let winner = tokio::time::timeout(Duration::from_secs(45), rx.recv())
        .await
        .ok()
        .flatten();
    for handle in handles {
        handle.abort();
    }
    winner
}

async fn preferred_region_hosts(state: &AppState, hint: Option<&str>) -> Vec<String> {
    let mut hosts = Vec::new();
    if let Ok(Some(saved)) = state.auth.load_auth() {
        push_unique_host(&mut hosts, &saved.region_host);
    }
    if let Some(hint) = hint {
        for host in hosts_from_region_hint(hint) {
            push_unique_host(&mut hosts, &host);
        }
    }
    for host in REGION_HOST_ALLOWLIST {
        push_unique_host(&mut hosts, host);
    }
    hosts
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
                "cn" | "cn2" | "cn3" | "us" | "us2" | "us3" | "de" | "sg" | "in" | "ru"
            )
        })
        .unwrap_or(lowered.as_str());

    REGION_HOST_ALLOWLIST
        .iter()
        .filter(|host| host.contains(&format!("-{token}.")))
        .map(|host| (*host).to_string())
        .collect()
}

async fn collect_cookies(window: &WebviewWindow) -> Vec<(String, String)> {
    let window_for_store = window.clone();
    let mut pairs = tokio::task::spawn_blocking(move || match window_for_store.cookies() {
        Ok(cookies) => cookies
            .into_iter()
            .map(|cookie| (cookie.name().to_string(), cookie.value().to_string()))
            .collect(),
        Err(_) => Vec::new(),
    })
    .await
    .unwrap_or_default();

    if parse_login_cookies(&pairs).is_some() {
        return pairs;
    }

    if let Some(header) = document_cookie(window).await {
        for pair in parse_cookie_header(&header) {
            if !pairs
                .iter()
                .any(|(name, _)| name.eq_ignore_ascii_case(&pair.0))
            {
                pairs.push(pair);
            }
        }
    }
    pairs
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
    if let Some(login_info) = cookie_value(cookies, &["hm-user-login-info", "hm_user_login_info"]) {
        if let Some(extracted) = extract_from_login_info(&login_info) {
            return Some(extracted);
        }
    }

    let user_id = cookie_value(cookies, &["userid", "user_id", "userId"])
        .and_then(|value| sanitize_user_id(&percent_decode(&value)))?;
    let app_token = cookie_value(cookies, &["apptoken", "app_token", "app-token", "appToken"])
        .and_then(|value| sanitize_app_token(&percent_decode(&value)))?;
    Some(ExtractedLogin {
        user_id,
        app_token,
        region_hint: None,
    })
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
    let replaced = value
        .replace("+", " ")
        .replace("%2C", ",")
        .replace("%2c", ",");
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
    // Only HTTPS navigation to the known Zepp/Huami login domains is allowed.
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
    })
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
    message: &str,
    page_url: &str,
) {
    if !epoch_active(app, epoch) {
        return;
    }
    let Some(state) = app.try_state::<AppState>() else {
        return;
    };
    publish_status(app, &state, LoginStatus::new(state_name, message, page_url)).await;
}

async fn finish_failed(app: &AppHandle, epoch: u64, message: &str, page_url: String) {
    emit_progress(app, epoch, "failed", message, &page_url).await;
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
    }

    #[test]
    fn login_navigation_allow_list() {
        assert!(is_allowed_login_url("https://watchface.zepp.com/"));
        assert!(is_allowed_login_url(
            "https://user.huami.com/privacy2/index.html"
        ));
        assert!(!is_allowed_login_url("about:blank"));
        assert!(!is_allowed_login_url(
            "data:text/html,<script>alert(1)</script>"
        ));
        assert!(!is_allowed_login_url("https://example.com/"));
        assert!(!is_allowed_login_url("http://watchface.zepp.com/"));
    }
}
