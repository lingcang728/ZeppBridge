//! 登录轮询：等凭据出现、落库、发布状态（从 commands/login.rs 拆出）。

use super::*;

pub(super) fn spawn_login_poll(app: AppHandle, epoch: u64, window: WebviewWindow) {
    tauri::async_runtime::spawn(async move {
        let started = std::time::Instant::now();
        let mut fallback_used = false;
        // 曾经走到过「看起来已经登录」的页面，却始终没读出凭据。这两种超时
        // 对用户完全不是一回事：一种是没登录完，另一种是登录完了但我们没拿到
        // 东西——后者该直接把手动填 Token 的兜底摆到他面前，而不是让他等满 15
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
                        "已经登录，但没能从登录窗口读到凭据。可以改用手动填写 App Token。",
                    )
                } else {
                    ("err.login.timeout", "登录超时，请重试")
                };
                finish_failed(&app, epoch, code, message, current_page_url(&window)).await;
                close_login_window_for_epoch(&app, epoch);
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
                        close_login_window_for_epoch(&app, epoch);
                        // 设备列表在「已连接」之后再拉：区域确认已经够慢，
                        // 不要让用户盯着 verifying 再等一轮设备请求。
                        if let Some(state) = app.try_state::<AppState>() {
                            super::super::data::refresh_device_profile(&state).await;
                        }
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
                        close_login_window_for_epoch(&app, epoch);
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
pub(super) struct LoginFailure {
    pub(super) error: AppError,
    pub(super) retryable: bool,
}

impl LoginFailure {
    pub(super) fn fatal(error: AppError) -> Self {
        Self {
            error,
            retryable: false,
        }
    }

    pub(super) fn retryable(error: AppError) -> Self {
        Self {
            error,
            retryable: true,
        }
    }

    pub(super) fn cancelled() -> Self {
        Self::fatal(AppError::new("err.login.cancelled", "登录已取消"))
    }
}

pub(super) async fn persist_extracted_login(
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
        return Err(LoginFailure::cancelled());
    }

    let _command_guard = state.lock_sync_commands().await;
    if !epoch_active(app, epoch) {
        return Err(LoginFailure::cancelled());
    }

    if let Err(error) = state.auth.save_auth(&auth) {
        // 保存失败通常是系统凭据管理器的事（被策略禁用、令牌超长），原样带上
        // 底层原因；界面按 code 取本地化文案，这句中文留给 CLI、日志和报告。
        return Err(LoginFailure::fatal(AppError::from(error)));
    }

    // Disk is the source of truth from here. If the epoch dies after save,
    // still install the in-memory manager so it matches, then return cancelled
    // so the poller does not emit `connected`.
    apply_persisted_login(&state, auth, confidence).await?;
    if !epoch_active(app, epoch) {
        return Err(LoginFailure::cancelled());
    }
    Ok(())
}

pub(super) async fn apply_persisted_login(
    state: &AppState,
    auth: AuthInfo,
    confidence: &'static str,
) -> std::result::Result<(), LoginFailure> {
    let manager = match AppState::build_sync_manager(auth, &state.data_dir) {
        Ok(manager) => manager,
        Err(error) => {
            let message = error.user_message();
            let _ = state.auth.clear_auth();
            state.replace_sync_manager(None).await;
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

    state.replace_sync_manager(Some(manager)).await;
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
    Ok(())
}

pub(super) async fn publish_failed(
    app: &AppHandle,
    state: &AppState,
    error: &AppError,
    page_url: &str,
) {
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

pub(super) fn epoch_active(app: &AppHandle, epoch: u64) -> bool {
    app.try_state::<AppState>()
        .is_some_and(|state| state.login.epoch.load(Ordering::SeqCst) == epoch)
}

pub(super) async fn publish_status(app: &AppHandle, state: &AppState, status: LoginStatus) {
    {
        let mut current = state.login.status.write().await;
        *current = status.clone();
    }
    let _ = app.emit(LOGIN_EVENT, status);
}

pub(super) async fn emit_progress(
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

pub(super) fn safe_login_page_url(raw: &str) -> String {
    let Ok(mut url) = reqwest::Url::parse(raw) else {
        return String::new();
    };
    let _ = url.set_username("");
    let _ = url.set_password(None);
    url.set_query(None);
    url.set_fragment(None);
    url.to_string()
}

pub(super) async fn finish_failed(
    app: &AppHandle,
    epoch: u64,
    code: &str,
    message: &str,
    page_url: String,
) {
    emit_progress(app, epoch, "failed", code, message, &page_url).await;
}

pub(super) async fn finish_idle_if_active(app: &AppHandle, epoch: u64) {
    if !epoch_active(app, epoch) {
        return;
    }
    let Some(state) = app.try_state::<AppState>() else {
        return;
    };
    publish_status(app, &state, LoginStatus::idle()).await;
}
