use super::auth::{probe_region_evidence, RegionEvidence};
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
/// 多久没人动这一页，才替用户去开备用页。
///
/// 这个计时器只对付一种情况：主登录页在这台机器上根本没渲染出来，用户对着
/// 一片空白干等。它不是「登录该在多少秒内完成」——输邮箱密码、等邮箱里的
/// 验证码、走第三方授权，本来就会花掉远不止这点时间。所以除了等够时间，
/// 还要确认这一页确实没人碰过，见 `fallback_is_due` 与 `login_page_is_idle`。
const FALLBACK_AFTER: Duration = Duration::from_secs(90);
const SESSION_TIMEOUT: Duration = Duration::from_secs(15 * 60);
/// 停在第三方授权页多久之后，主动说一句「这条路可能走不通」。
///
/// 这不是超时，也不会打断任何东西——登录本来就慢，输密码、等邮箱里的验证码、
/// 扫码都要时间。它针对的是另一件事：Google 的 passkey 在嵌入式 WebView 里
/// 常常停在 "verifying it's you" 不动，而这一点我们改不了。与其让人对着一个
/// 不会有结果的页面等满十五分钟才看到一句「登录超时」，不如现在就告诉他还有
/// 邮箱+密码，以及设置页里手动填 App Token 这两条路。
const THIRD_PARTY_STALL_AFTER: Duration = Duration::from_secs(120);
const COOKIE_EVAL_TIMEOUT: Duration = Duration::from_secs(2);
/// 关掉上一个登录窗口后，最多等多久让它把 `zepp-login` 这个标签交还。
///
/// 正常是几毫秒的事——只要主线程转一圈就够。留到 3 秒是为了主线程正忙的时候
/// 也别误判，同时又不至于让人对着一个没反应的按钮干等。见
/// `close_login_window_and_wait`。
const LOGIN_WINDOW_CLOSE_TIMEOUT: Duration = Duration::from_secs(3);
const LOGIN_WINDOW_CLOSE_POLL: Duration = Duration::from_millis(25);
/// 区域探测因为网络问题失败之后，隔多久再试一次。
const REGION_RETRY_BACKOFF: Duration = Duration::from_secs(5);

/// 在登录窗口里记一个「用户碰过这一页」的标记。
///
/// 只记有没有发生过输入类事件，不看键值、不看内容。登录表单常常在跨源 iframe
/// 里，事件不会冒泡到顶层文档，所以子框架用 postMessage 往上报一个固定字符串。
/// 每次导航都会重新注入，标记因此只代表当前这一页。
const LOGIN_ACTIVITY_SCRIPT: &str = r#"(function(){
  try {
    if (window.__zeppbridgeActivityHooked) { return; }
    window.__zeppbridgeActivityHooked = true;
    window.__zeppbridgeInteracted = false;
    var mark = function(){
      window.__zeppbridgeInteracted = true;
      try {
        if (window.top && window.top !== window) {
          window.top.postMessage('zeppbridge:login-activity', '*');
        }
      } catch (e) {}
    };
    ['keydown','pointerdown','mousedown','touchstart','paste','input','change'].forEach(function(name){
      window.addEventListener(name, mark, true);
    });
    window.addEventListener('message', function(event){
      if (event && event.data === 'zeppbridge:login-activity') {
        window.__zeppbridgeInteracted = true;
      }
    }, true);
  } catch (e) {}
})();"#;

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
    let page_url = PRIMARY_LOGIN_URL.to_string();

    // 必须等上一个窗口真的消失，不能只是发出关闭请求，见
    // `close_login_window_and_wait`。
    if !close_login_window_and_wait(&app).await {
        let error = AppError::new(
            "err.login.window_busy",
            "上一个登录窗口还没有关完，请稍等一下再试",
        );
        publish_failed(&app, &state, &error, &page_url).await;
        return Err(error);
    }

    let status = LoginStatus::new(
        "waiting",
        "err.login.waiting",
        "请在弹出窗口完成 Zepp 登录",
        page_url.clone(),
    );
    publish_status(&app, &state, status.clone()).await;

    let window = match build_login_window(&app, &page_url, &locale) {
        Ok(window) => window,
        // 已经把状态推成「请在弹出窗口完成登录」了，可弹窗并没有开起来。
        // 不改回去的话，界面下次读状态还会拿到这句 waiting，指着一个不存在
        // 的窗口让人去操作。
        Err(error) => {
            publish_failed(&app, &state, &error, &page_url).await;
            return Err(error);
        }
    };
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

fn spawn_login_poll(app: AppHandle, epoch: u64, window: WebviewWindow) {
    tauri::async_runtime::spawn(async move {
        let started = std::time::Instant::now();
        let mut fallback_used = false;
        // 曾经走到过「看起来已经登录」的页面，却始终没读出凭据。这两种超时
        // 对用户完全不是一回事：一种是没登录完，另一种是登录完了但我们没拿到
        // 东西——后者该直接把手动 / HAR 兜底摆到他面前，而不是让他等满 15
        // 分钟再看到一句「登录超时」。
        let mut looked_signed_in = false;
        // 这次会话里，用户碰过登录窗口没有。只认阳性证据：页面明确说有人在
        // 输入，或者地址已经走到第三方登录页。一旦立起来就不再放下——页面
        // 内部的跳转会把注入的活动标记清空，可用户并没有因此变成没在登录。
        let mut user_active = false;
        // 凭据已经读到了，卡住的是后面的区域确认。这和「压根没登录」「登录了
        // 但读不到凭据」都不一样，超时那一刻得说对是哪一种。
        let mut credentials_extracted = false;
        // 当前停在哪一页、从什么时候开始停的。第三方授权页的停滞提示按这个计时，
        // 而不是按整场登录——不然在授权页之间正常来回跳也会被算成卡住。
        let mut current_page = String::new();
        let mut page_since = std::time::Instant::now();
        let mut third_party_hinted = false;

        loop {
            if !epoch_active(&app, epoch) {
                return;
            }
            if started.elapsed() >= SESSION_TIMEOUT {
                let (code, message) = if credentials_extracted {
                    (
                        "err.login.region_unreachable",
                        "读到了凭据，但一直没能连上 Zepp 区域服务确认账号，请检查网络后重试",
                    )
                } else if looked_signed_in {
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
            if page_url != current_page {
                current_page = page_url.clone();
                page_since = std::time::Instant::now();
                third_party_hinted = false;
            }
            if third_party_stall_is_due(
                &page_url,
                page_since.elapsed(),
                credentials_extracted,
                third_party_hinted,
            ) {
                third_party_hinted = true;
                emit_progress(
                    &app,
                    epoch,
                    "waiting",
                    "err.login.third_party_stalled",
                    "第三方登录好像卡住了。可以关掉这个窗口，改用邮箱+密码登录；也可以在设置里手动填写 App Token。",
                    &page_url,
                )
                .await;
            }
            // 只有在还可能跳转时才去问页面；问出「有人在用」就永久作罢。
            let mut page_is_idle = false;
            if !user_active {
                if is_primary_login_page(&page_url) {
                    match login_page_activity(&window).await {
                        Some(true) => page_is_idle = true,
                        Some(false) => user_active = true,
                        // 问不出来就什么都不做：既不当成有人用（那会让「页面
                        // 根本没渲染出来」永远等不到备用页），也不当成空闲。
                        None => {}
                    }
                } else {
                    // 地址已经不是我们打开的那一页——小米验证码页、Google /
                    // Facebook 授权页、微信扫码页。用户正在登录流程里。
                    user_active = true;
                }
            }
            if page_is_idle && fallback_is_due(started.elapsed(), fallback_used) {
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
                credentials_extracted = true;
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
                    // 网络这会儿不通，凭据本身没问题。关掉登录窗口等于把
                    // 隔离会话一起丢掉——用户要连验证码、扫码一起重来一遍。
                    // 所以窗口留着，隔几秒再试，直到网络恢复或整场会话超时。
                    Err(failure) if failure.retryable => {
                        emit_progress(
                            &app,
                            epoch,
                            "waiting",
                            "err.login.region_retrying",
                            "暂时连不上 Zepp 区域服务，正在重试；登录窗口先留着",
                            &page_url,
                        )
                        .await;
                        tokio::time::sleep(REGION_RETRY_BACKOFF).await;
                        continue;
                    }
                    Err(failure) => {
                        finish_failed(
                            &app,
                            epoch,
                            &failure.error.code,
                            &failure.error.message,
                            page_url,
                        )
                        .await;
                        close_login_window(&app);
                        return;
                    }
                }
            }

            tokio::time::sleep(POLL_INTERVAL).await;
        }
    });
}

/// 一次登录失败，值不值得原地再试一次。
///
/// 「网络不通」和「Zepp 拒绝了这个凭据」是两件事：前者过一会儿就好，后者再
/// 等也没用。之前两者都直接关掉登录窗口——而这个窗口是隔离会话，关掉就等于
/// 让用户把验证码、扫码、第三方授权全部重来一遍。
struct LoginFailure {
    error: AppError,
    retryable: bool,
}

impl LoginFailure {
    fn fatal(error: AppError) -> Self {
        Self {
            error,
            retryable: false,
        }
    }

    fn retryable(error: AppError) -> Self {
        Self {
            error,
            retryable: true,
        }
    }
}

async fn persist_extracted_login(
    app: &AppHandle,
    epoch: u64,
    extracted: &ExtractedLogin,
) -> std::result::Result<(), LoginFailure> {
    let Some(state) = app.try_state::<AppState>() else {
        return Err(LoginFailure::fatal(AppError::new(
            "err.login.state_unavailable",
            "应用状态不可用",
        )));
    };
    let (preferred, authoritative_count) =
        preferred_region_hosts(&state, &extracted.user_id, extracted.region_hint.as_deref()).await;
    let winner = probe_region_hosts(
        &extracted.user_id,
        &extracted.app_token,
        &preferred,
        authoritative_count,
    )
    .await?;
    let RegionWinner { auth, confidence } = winner;
    if !epoch_active(app, epoch) {
        return Err(LoginFailure::fatal(AppError::new(
            "err.login.cancelled",
            "登录已取消",
        )));
    }

    if let Err(error) = state.auth.save_auth(&auth) {
        // 保存失败通常是系统凭据管理器的事（被策略禁用、令牌超长），原样带上
        // 底层原因；界面按 code 取本地化文案，这句中文留给 CLI、日志和报告。
        return Err(LoginFailure::fatal(AppError::from(error)));
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
            return Err(LoginFailure::fatal(AppError::new(
                "err.login.sync_init_failed",
                message,
            )));
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
    {
        let mut region = state.region_confidence.write().await;
        *region = confidence.to_string();
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

    fn into_login_failure(self) -> LoginFailure {
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

fn classify_region_probe_error(error: &ZeppBridgeError) -> RegionProbeFailure {
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
struct RegionWinner {
    auth: AuthInfo,
    confidence: &'static str,
}

/// 一批 host 探完之后剩下什么。
#[derive(Default)]
struct RegionBatchOutcome {
    /// 认领了这个账号的 host。有它就不必再看别的。
    identified: Option<AuthInfo>,
    /// 请求通了但拿不出设备的 host 里，偏好顺序最靠前的那个。
    fallback: Option<(usize, AuthInfo)>,
}

impl RegionBatchOutcome {
    /// 收下一个探测结果。返回 `true` 表示已经拿到最硬的证据，不必再等别人。
    ///
    /// 结果按完成先后到达，而选谁要按偏好顺序，所以弱证据之间比的是 `rank`
    /// 而不是先来后到。这正是原来那个 bug 的所在：谁先答应就用谁，而一个不
    /// 认识这个用户的区域根本不去查数据，往往答得最快。
    fn record(&mut self, rank: usize, auth: AuthInfo, evidence: RegionEvidence) -> bool {
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
    fn into_winner(self, authoritative: bool) -> Option<RegionWinner> {
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

async fn probe_region_hosts(
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
async fn probe_region_batch(
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
    if value.is_empty() || value.chars().any(char::is_control) {
        return None;
    }
    // 存不进系统凭据管理器的东西，不可能是 App Token。以前这里放行到 16 KB，
    // 比 Windows 真正存得下的多出六倍：超长的值一路走到保存那一步才炸，而且
    // 报的是「无法写入 Windows 凭据管理器」，完全指不到长度上。
    //
    // 早一步否掉还有第二个好处：候选是按顺序试的，否掉一段从页面存储里捞到的
    // JSON，下一个候选（打包在 hm-user-login-info 里的那个真令牌）才有机会。
    if value.encode_utf16().count() > crate::auth::CREDENTIAL_MAX_UTF16_UNITS {
        return None;
    }
    Some(value.to_string())
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
            || THIRD_PARTY_AUTH_HOSTS.contains(&host.as_str())
    })
}

/// 官方通用登录页会跳过去的第三方账号域名。
///
/// 放行导航和判断「是不是卡在第三方授权页」用的是同一份表：多一处手写的名单，
/// 就多一个哪天加了新登录方式却漏改的地方。
const THIRD_PARTY_AUTH_HOSTS: &[&str] = &[
    "account.xiaomi.com",
    "open.weixin.qq.com",
    "accounts.google.com",
    "www.facebook.com",
    "account-us.amazfit.com",
];

/// 这个地址是不是第三方账号的授权页（而不是我们自己打开的 Zepp 登录页）。
fn is_third_party_auth_page(url: &str) -> bool {
    reqwest::Url::parse(url)
        .ok()
        .and_then(|parsed| parsed.host_str().map(str::to_ascii_lowercase))
        .is_some_and(|host| THIRD_PARTY_AUTH_HOSTS.contains(&host.as_str()))
}

/// 该不该现在就把兜底路径摆出来。
///
/// 四个条件缺一不可：停在第三方授权页、在这一页上已经待够久、还没读到凭据、
/// 这一轮没说过。「在这一页上」是关键——计时要跟着地址走，用户在几个授权页之间
/// 来回跳的时候，每一页都重新计时，不会因为整场登录拖得久就误报。
fn third_party_stall_is_due(
    page_url: &str,
    elapsed_on_page: Duration,
    credentials_extracted: bool,
    already_hinted: bool,
) -> bool {
    !already_hinted
        && !credentials_extracted
        && elapsed_on_page >= THIRD_PARTY_STALL_AFTER
        && is_third_party_auth_page(page_url)
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

/// 备用页的时间前提。
///
/// 「这一页还有没有人在用」由 `login_page_activity` 单独回答，两件事分开判断：
/// 这里只管等够了没有、以及是不是已经跳过一次。
///
/// 之前这里只看时间，于是所有需要输密码或等验证码的登录都会在计时到点时被
/// 打断，页面被换成 `user.huami.com` 的隐私页（那上面只有清除数据、注销账号
/// 这些选项）。
fn fallback_is_due(elapsed: Duration, fallback_used: bool) -> bool {
    !fallback_used && elapsed >= FALLBACK_AFTER
}

/// 窗口是不是还停在我们自己打开的那一页。
///
/// 地址一变，用户就已经在第三方登录流程里了，任何自动跳转都是打断。
fn is_primary_login_page(page_url: &str) -> bool {
    page_url.starts_with("https://watchface.zepp.com")
}

/// 这一页有没有人在用：`Some(true)` 空闲，`Some(false)` 有人，`None` 问不出来。
///
/// 三态是有意的。答不上来的时候既不能当成有人用——那样「主登录页压根没渲染
/// 出来」的人永远等不到备用页；也不能当成空闲——那样一次超时就足以把正在等
/// 验证码的人导走。所以问不出来就什么都不做，下一轮再问。
async fn login_page_activity(window: &WebviewWindow) -> Option<bool> {
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

/// 等这一轮该做什么：标签空出来了、还得再等、还是等不到了。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum CloseWait {
    /// `zepp-login` 这个标签已经没人占，可以建新窗口。
    Released,
    /// 还占着，但没等够，下一轮再看。
    KeepWaiting,
    /// 等到超时都没让出来。
    TimedOut,
}

fn close_wait_step(window_still_registered: bool, elapsed: Duration) -> CloseWait {
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
async fn close_login_window_and_wait(app: &AppHandle) -> bool {
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

async fn publish_failed(app: &AppHandle, state: &AppState, error: &AppError, page_url: &str) {
    publish_status(
        app,
        state,
        LoginStatus::new(
            "failed",
            &error.code,
            error.message.as_str(),
            safe_login_page_url(page_url),
        ),
    )
    .await;
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

    fn probe_auth(host: &str) -> AuthInfo {
        AuthInfo {
            app_token: "token".to_string(),
            user_id: "user".to_string(),
            region_host: host.to_string(),
        }
    }

    /// 这是那个 bug 本身：错误区域先答应，正确区域后答应。
    ///
    /// 一个不认识这个用户的区域根本不去查数据，所以它的空响应往往比正确区域
    /// 返回真实设备还快。旧代码「谁先答应就用谁」，于是把错的那个存了下来，
    /// 之后每次同步都打向那里——界面显示已连接，库里一条记录也没有。
    #[test]
    fn a_fast_empty_region_does_not_beat_a_slower_one_that_knows_the_account() {
        let mut outcome = RegionBatchOutcome::default();

        assert!(!outcome.record(
            0,
            probe_auth("https://wrong.example"),
            RegionEvidence::Empty
        ));
        assert!(outcome.record(
            5,
            probe_auth("https://right.example"),
            RegionEvidence::Identified
        ));

        let winner = outcome.into_winner(false).expect("a winner");
        assert_eq!(winner.auth.region_host, "https://right.example");
        assert_eq!(winner.confidence, "identified");
    }

    /// 全都交不出设备时，按偏好顺序挑，而不是按谁先回来。
    #[test]
    fn only_empty_answers_fall_back_to_the_most_preferred_host() {
        let mut outcome = RegionBatchOutcome::default();

        outcome.record(
            3,
            probe_auth("https://third.example"),
            RegionEvidence::Empty,
        );
        outcome.record(
            1,
            probe_auth("https://first.example"),
            RegionEvidence::Empty,
        );
        outcome.record(
            2,
            probe_auth("https://second.example"),
            RegionEvidence::Empty,
        );

        let winner = outcome.into_winner(false).expect("a winner");
        assert_eq!(winner.auth.region_host, "https://first.example");
        // 猜出来的就得说是猜的：同步之后一条记录都没有时，这是唯一的线索。
        assert_eq!(winner.confidence, "unconfirmed");
    }

    /// Zepp 自己指名的 host 交不出设备，不等于它错了——这个账号可能一块表都没绑。
    /// 它仍然算数，只是标成 `hinted` 而不是 `identified`。
    #[test]
    fn an_authoritative_host_still_counts_when_the_account_has_no_devices() {
        let mut outcome = RegionBatchOutcome::default();
        outcome.record(
            0,
            probe_auth("https://hinted.example"),
            RegionEvidence::Empty,
        );

        let winner = outcome.into_winner(true).expect("a winner");
        assert_eq!(winner.auth.region_host, "https://hinted.example");
        assert_eq!(winner.confidence, "hinted");
    }

    /// 一个都没答应就是没有结论，不能随便挑一个凑数。
    #[test]
    fn no_answer_produces_no_winner() {
        assert!(RegionBatchOutcome::default().into_winner(true).is_none());
        assert!(RegionBatchOutcome::default().into_winner(false).is_none());
    }

    /// 凭据被明确拒绝，仍然是终局失败——不会被别处的空响应盖过去。
    #[test]
    fn an_explicit_rejection_stays_fatal() {
        let mut failures = RegionProbeFailures::default();
        failures.record(RegionProbeFailure::Transient);
        failures.record(RegionProbeFailure::Rejected);
        failures.record(RegionProbeFailure::Other);

        let failure = failures.into_login_failure();
        assert!(!failure.retryable);
        assert_eq!(failure.error.code, "err.login.credentials_rejected");
    }

    /// 停在第三方授权页太久，才提示；其余情况一律不出声。
    #[test]
    fn the_third_party_hint_fires_only_while_stuck_on_a_third_party_page() {
        let long = THIRD_PARTY_STALL_AFTER;
        let short = Duration::from_secs(5);
        let google = "https://accounts.google.com/o/oauth2/auth";

        assert!(third_party_stall_is_due(google, long, false, false));
        // 还没等够。登录本来就慢，输密码等验证码都要时间。
        assert!(!third_party_stall_is_due(google, short, false, false));
        // 这一页上已经说过一次了。
        assert!(!third_party_stall_is_due(google, long, false, true));
        // 凭据已经读到，卡住的是后面的区域确认，不该建议换登录方式。
        assert!(!third_party_stall_is_due(google, long, true, false));
        // 停在我们自己打开的那一页——那是另一条兜底路径（备用登录页）管的事。
        assert!(!third_party_stall_is_due(
            PRIMARY_LOGIN_URL,
            long,
            false,
            false
        ));
    }

    /// 放行导航和「是不是第三方授权页」读的是同一份 host 表。
    #[test]
    fn third_party_hosts_are_shared_with_the_navigation_allowlist() {
        for host in THIRD_PARTY_AUTH_HOSTS {
            let url = format!("https://{host}/oauth");
            assert!(is_allowed_login_url(&url), "{url} should be allowed");
            assert!(
                is_third_party_auth_page(&url),
                "{url} should be third-party"
            );
        }
        assert!(!is_third_party_auth_page("https://watchface.zepp.com/"));
        assert!(!is_third_party_auth_page("not a url"));
    }

    /// 旧窗口还占着标签时，绝不能去建新窗口。
    ///
    /// `close()` 之后标签不会当场交还（原因见 `close_login_window_and_wait`），
    /// 那么只要它还占着，唯一正确的动作就是继续等。一旦这里放行，用户拿到的
    /// 就是「无法打开登录窗口」，而他刚才那个能用的窗口已经被关掉了。
    ///
    /// 「close() 之后标签仍在」这个前提本身没有测试：钉住它要 `tauri` 的
    /// mock runtime，而把 `tauri = { features = ["test"] }` 加进 dev-dependencies
    /// 会让 `tauri/test` 在整个测试构建里生效，Windows 上产出的测试二进制直接
    /// 加载失败（STATUS_ENTRYPOINT_NOT_FOUND，一条用例都跑不到）。为一条关于
    /// 第三方库行为的断言换掉整个 Windows 门禁，不划算。
    #[test]
    fn a_new_login_window_waits_until_the_old_label_is_released() {
        // 标签还占着——不管等了多久，都不是「可以建了」。
        assert_eq!(
            close_wait_step(true, Duration::ZERO),
            CloseWait::KeepWaiting
        );
        assert_eq!(
            close_wait_step(true, LOGIN_WINDOW_CLOSE_TIMEOUT - LOGIN_WINDOW_CLOSE_POLL),
            CloseWait::KeepWaiting
        );

        // 标签空了才放行。第一次登录本来就没有旧窗口，不该被这段等待拖慢。
        assert_eq!(close_wait_step(false, Duration::ZERO), CloseWait::Released);

        // 等待必须有头。主线程真的卡住时，宁可给一句「稍等再试」，也不能让
        // 命令永远不返回。
        assert_eq!(
            close_wait_step(true, LOGIN_WINDOW_CLOSE_TIMEOUT),
            CloseWait::TimedOut
        );
        assert_eq!(
            close_wait_step(true, LOGIN_WINDOW_CLOSE_TIMEOUT + Duration::from_secs(1)),
            CloseWait::TimedOut
        );
        // 超时之后标签才空出来，仍然该放行，而不是报错。
        assert_eq!(
            close_wait_step(false, LOGIN_WINDOW_CLOSE_TIMEOUT + Duration::from_secs(1)),
            CloseWait::Released
        );
    }

    /// 用户还在主登录页上输密码时，绝不能把页面导走。
    ///
    /// 这一条对应线上反馈：邮箱密码刚输一半，或者去邮箱抄验证码的工夫，
    /// 页面就被换成了隐私页（清除数据／注销账号），登录只能从头再来。
    #[test]
    fn fallback_needs_the_full_wait_and_fires_at_most_once() {
        let long_enough = FALLBACK_AFTER + Duration::from_secs(5);

        assert!(fallback_is_due(long_enough, false));
        assert!(!fallback_is_due(Duration::from_secs(5), false));
        assert!(!fallback_is_due(long_enough, true));
    }

    /// 用户一旦走进第三方登录流程，就绝不能把页面导走。
    ///
    /// 这一条对应线上反馈：去邮箱抄小米验证码的工夫，页面被换成了隐私页
    /// （清除数据／注销账号），登录只能从头再来。地址已经不是我们打开的那
    /// 一页，就是「用户正在登录」的确证，轮不到计时器说话。
    #[test]
    fn only_the_page_we_opened_may_be_navigated_away() {
        assert!(is_primary_login_page("https://watchface.zepp.com"));
        assert!(is_primary_login_page("https://watchface.zepp.com/"));
        assert!(is_primary_login_page(
            "https://watchface.zepp.com/login?from=app"
        ));

        assert!(!is_primary_login_page(
            "https://account.xiaomi.com/oauth2/authorize"
        ));
        assert!(!is_primary_login_page(
            "https://accounts.google.com/o/oauth2/auth"
        ));
        assert!(!is_primary_login_page(
            "https://www.facebook.com/dialog/oauth"
        ));
        assert!(!is_primary_login_page(
            "https://open.weixin.qq.com/connect/qrconnect"
        ));
        assert!(!is_primary_login_page(
            "https://user.huami.com/privacy2/index.html"
        ));
    }

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
        let rejected = RegionProbeFailures {
            rejected: 1,
            transient: 2,
            other: 3,
        }
        .into_login_failure();
        assert_eq!(rejected.error.code, "err.login.credentials_rejected");
        // 凭据被否掉了，再试一百次也是这个结果——不能留着窗口空转。
        assert!(!rejected.retryable);

        // 只有网络那一类值得原地重试，而且必须保住登录窗口：它是隔离会话，
        // 关掉就意味着验证码、扫码全部重来。
        let unreachable = RegionProbeFailures {
            transient: 2,
            ..Default::default()
        }
        .into_login_failure();
        assert_eq!(unreachable.error.code, "err.login.region_unreachable");
        assert!(unreachable.retryable);

        let other = RegionProbeFailures {
            other: 1,
            ..Default::default()
        }
        .into_login_failure();
        assert_eq!(other.error.code, "err.login.region_probe_failed");
        assert!(!other.retryable);
    }

    /// 超出系统凭据管理器容量的值不可能是 App Token。
    ///
    /// Windows 凭据管理器只存得下 1280 个 UTF-16 码元；以前这里放行到 16 KB，
    /// 于是从页面存储里捞到的一整段 JSON 会被当成令牌采用，一路走到保存那步
    /// 才失败，报的还是一句指不到长度的「无法写入 Windows 凭据管理器」。
    #[test]
    fn an_oversized_candidate_is_not_mistaken_for_an_app_token() {
        let real_token = "a".repeat(96);
        assert_eq!(
            sanitize_app_token(&real_token).as_deref(),
            Some(real_token.as_str())
        );

        let blob = "x".repeat(crate::auth::CREDENTIAL_MAX_UTF16_UNITS + 1);
        assert_eq!(sanitize_app_token(&blob), None);

        // 否掉超长候选之后，打包在 hm-user-login-info 里的真令牌才轮得到。
        let cookies = vec![
            ("apptoken".to_string(), blob),
            (
                "hm-user-login-info".to_string(),
                r#"{"token_info":{"user_id":"77","app_token":"the-real-token"}}"#.to_string(),
            ),
        ];
        let got = parse_login_cookies(&cookies).expect("falls back to the bundled token");
        assert_eq!(got.user_id, "77");
        assert_eq!(got.app_token, "the-real-token");
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
