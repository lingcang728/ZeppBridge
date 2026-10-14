//! 登录窗口：创建、活动探测、按 epoch 关闭（从 commands/login.rs 拆出，逻辑不变）。

use super::*;

pub(super) fn build_login_window(
    app: &AppHandle,
    page_url: &str,
    locale: &str,
) -> std::result::Result<WebviewWindow, AppError> {
    let url = page_url
        .parse()
        .map_err(|_| AppError::new("err.login.bad_url", "登录地址无效"))?;
    let app_for_new_window = app.clone();
    // The zepp-login capability is only window-close + event-listen, and it
    // has no `remote` URLs. A page loaded from watchface.zepp.com therefore
    // cannot invoke app commands: Tauri 2 requires an explicit remote
    // capability for that, and we do not add one. Do not "fix" this isolation
    // by granting remote IPC.
    WebviewWindowBuilder::new(app, LOGIN_WINDOW_LABEL, WebviewUrl::External(url))
        .title(login_window_title(locale))
        // A login attempt must not inherit a previous account's cookies or
        // localStorage. OAuth popups still stay in this one WebView session,
        // but closing it discards the session instead of silently reusing it
        // for the next account.
        .incognito(true)
        // 登录表单可能在子框架里，两边都要挂上活动标记。
        .initialization_script_for_all_frames(LOGIN_ACTIVITY_SCRIPT)
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

/// 这一页有没有人在用：`Some(true)` 空闲，`Some(false)` 有人，`None` 问不出来。
///
/// 三态是有意的。答不上来的时候既不能当成有人用——那样「主登录页压根没渲染
/// 出来」的人永远等不到备用页；也不能当成空闲——那样一次超时就足以把正在等
/// 验证码的人导走。所以问不出来就什么都不做，下一轮再问。
pub(super) async fn login_page_activity(window: &WebviewWindow) -> Option<bool> {
    const SCRIPT: &str = r#"(function(){
  try {
    var typed = false;
    var fields = document.querySelectorAll('input, textarea');
    for (var i = 0; i < fields.length; i++) {
      var field = fields[i];
      if (field.type === 'hidden') { continue; }
      if (field.value && String(field.value).length > 0) { typed = true; break; }
    }
    return JSON.stringify({ idle: !window.__zeppbridgeInteracted && !typed });
  } catch (e) { return JSON.stringify({ idle: false }); }
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
    serde_json::from_str::<Value>(&raw)
        .ok()?
        .get("idle")
        .and_then(Value::as_bool)
}

pub(super) fn current_page_url(window: &WebviewWindow) -> String {
    window
        .url()
        .map(|url| url.to_string())
        .unwrap_or_else(|_| PRIMARY_LOGIN_URL.to_string())
}

pub(super) fn close_login_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(LOGIN_WINDOW_LABEL) {
        let _ = window.close();
    }
}

pub(super) fn closer_epoch_owns_the_window(closer: u64, active: u64) -> bool {
    closer == active
}

pub(super) fn close_login_window_for_epoch(app: &AppHandle, epoch: u64) {
    let Some(state) = app.try_state::<AppState>() else {
        return;
    };
    if closer_epoch_owns_the_window(epoch, state.login.epoch.load(Ordering::SeqCst)) {
        close_login_window(app);
    }
}

/// 等这一轮该做什么：标签空出来了、还得再等、还是等不到了。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum CloseWait {
    /// `zepp-login` 这个标签已经没人占，可以建新窗口。
    Released,
    /// 还占着，但没等够，下一轮再看。
    KeepWaiting,
    /// 等到超时都没让出来。
    TimedOut,
}

pub(super) fn close_wait_step(window_still_registered: bool, elapsed: Duration) -> CloseWait {
    if !window_still_registered {
        return CloseWait::Released;
    }
    if elapsed >= LOGIN_WINDOW_CLOSE_TIMEOUT {
        return CloseWait::TimedOut;
    }
    CloseWait::KeepWaiting
}

/// 关掉上一个登录窗口，并等到它的标签真的被交还。
///
/// `WebviewWindow::close()` 只是往主线程的事件循环里投一条关闭消息就返回了；
/// 窗口和它的 webview 要等主线程处理完、发出 `Destroyed`，才会从 manager 的
/// 表里摘掉。而登录窗口用的是固定标签 `zepp-login`，所以紧接着拿同一个标签去
/// build，撞上的是「a webview with label `zepp-login` already exists」。
///
/// 这正是「登录窗口已经开着时再点一次重新认证」的下场：旧窗口被关掉了，新窗口
/// 没建起来，界面只说一句「无法打开登录窗口」——用户手上什么都不剩。
///
/// 另一条路是复用旧窗口、直接把它导航到登录页，那样就不用等。但登录窗口是
/// `.incognito(true)` 的隔离会话，复用等于把上一个账号的会话留着——这恰恰是
/// f8f6150 要根除的东西。所以这里选择关掉再等。
pub(super) async fn close_login_window_and_wait(app: &AppHandle) -> bool {
    close_login_window(app);
    let started = std::time::Instant::now();
    loop {
        match close_wait_step(
            app.get_webview_window(LOGIN_WINDOW_LABEL).is_some(),
            started.elapsed(),
        ) {
            CloseWait::Released => return true,
            CloseWait::TimedOut => return false,
            CloseWait::KeepWaiting => tokio::time::sleep(LOGIN_WINDOW_CLOSE_POLL).await,
        }
    }
}

/// 登录弹窗标题按界面语言走（BETA1 P7：locale 从 `'zh'|'en'` 放宽到十语言）。
///
/// 归一规则和 `tray_i18n::tray_labels` 一致：小写、`_`→`-`、去 `.` 后缀，
/// 先精确匹配再逐段砍地区子标签，认不出一律英文。这里单列一张表是因为
/// 文案本身不同（「登录 Zepp」），不复用托盘三条。
///
/// de/ru/hi 为直译初稿，W4 母语审校时可整体替换——见 W2-S6 报告 §5 的交接。
pub(super) fn login_window_title(locale: &str) -> &'static str {
    let mut tag = locale.trim().to_ascii_lowercase().replace('_', "-");
    if let Some(dot) = tag.find('.') {
        tag.truncate(dot);
    }
    while !tag.is_empty() {
        match tag.as_str() {
            "zh" => return "登录 Zepp",
            "es" => return "Iniciar sesión en Zepp",
            "nl" => return "Inloggen bij Zepp",
            "pt-br" => return "Entrar no Zepp",
            // 裸 pt 与未列出的葡语地区一律欧洲葡语，同 tray_i18n 的裁决。
            "pt" | "pt-pt" => return "Iniciar sessão no Zepp",
            "de" => return "Bei Zepp anmelden",
            "ru" => return "Войти в Zepp",
            "hi" | "hi-in" => return "Zepp में साइन इन करें",
            "fr" => return "Se connecter à Zepp",
            "en" => return "Sign in to Zepp",
            _ => {}
        }
        match tag.rfind('-') {
            Some(cut) => tag.truncate(cut),
            None => break,
        }
    }
    "Sign in to Zepp"
}
