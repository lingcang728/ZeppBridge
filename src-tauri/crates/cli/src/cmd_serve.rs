//! `serve`：常驻的只读 REST（给 SparkyFitness 一类自托管服务来拉）。
//! `pull-token`：管理拉取用的 token（和桌面端的本机 token 分开）。
//!
//! 监听地址只认环境变量 `ZEPPBRIDGE_LISTEN`，不设就只听 127.0.0.1。监听非本机地址时
//! 必须有拉取 token，否则拒绝启动。桌面端没有这条路：它的地址写死在 core 里。

use super::*;
use zeppbridge_core::auth::default_credential_backend_in;
use zeppbridge_core::local_api::{self, HeadlessError, PullTokenSource};

pub(super) fn cmd_serve(args: &[String]) -> u8 {
    let flags = match Flags::parse(args) {
        Ok(flags) => flags,
        Err(message) => return fail(false, EXIT_USAGE, "usage", &message),
    };
    if let Err(message) = flags.reject_unknown(&[]) {
        return fail(false, EXIT_USAGE, "usage", &message);
    }
    let data_dir = match data_dir() {
        Ok(dir) => dir,
        Err(message) => return fail(false, EXIT_FAILED, "failed", &message),
    };
    let listen = match local_api::parse_listen(std::env::var(local_api::LISTEN_ENV).ok().as_deref())
    {
        Ok(address) => address,
        Err(error) => return headless_fail(&error),
    };
    let source = match std::env::var(local_api::PULL_TOKEN_ENV) {
        Ok(value) if !value.trim().is_empty() => PullTokenSource::Env(value),
        _ => PullTokenSource::Store(default_credential_backend_in(&data_dir)),
    };
    let server = match local_api::start_headless(data_dir, listen, source) {
        Ok(server) => server,
        Err(error) => return headless_fail(&error),
    };
    for note in local_api::startup_notes(server.local_addr) {
        eprintln!("serve: {note}");
    }
    if server.created_token {
        eprintln!(
            "serve: created a pull token in the credential store; print it with `zeppbridge-cli pull-token show`"
        );
    }

    let runtime = match tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
    {
        Ok(runtime) => runtime,
        Err(error) => {
            server
                .stop_flag()
                .store(true, std::sync::atomic::Ordering::SeqCst);
            return fail(
                false,
                EXIT_FAILED,
                "failed",
                &format!("Could not start the async runtime: {error}"),
            );
        }
    };
    let stop = server.stop_flag();
    let died = runtime.block_on(async {
        loop {
            tokio::select! {
                _ = shutdown_signal() => return false,
                _ = tokio::time::sleep(Duration::from_millis(500)) => {
                    if !server.is_running() {
                        return true;
                    }
                }
            }
        }
    });
    stop.store(true, std::sync::atomic::Ordering::SeqCst);
    server.wait();
    if died {
        eprintln!("serve: the listener stopped unexpectedly");
        EXIT_FAILED
    } else {
        eprintln!("serve: stopped");
        EXIT_OK
    }
}

/// Ctrl+C，以及容器里 `docker stop` 发的 SIGTERM（PID 1 不处理它就会被硬杀）。
async fn shutdown_signal() {
    #[cfg(unix)]
    {
        use tokio::signal::unix::{signal, SignalKind};
        match signal(SignalKind::terminate()) {
            Ok(mut term) => {
                tokio::select! {
                    _ = tokio::signal::ctrl_c() => {}
                    _ = term.recv() => {}
                }
            }
            Err(_) => {
                let _ = tokio::signal::ctrl_c().await;
            }
        }
    }
    #[cfg(not(unix))]
    {
        let _ = tokio::signal::ctrl_c().await;
    }
}

fn headless_fail(error: &HeadlessError) -> u8 {
    let code = match error {
        HeadlessError::InvalidListen(_) | HeadlessError::NeedsToken | HeadlessError::WeakToken => {
            EXIT_USAGE
        }
        HeadlessError::Credentials(_) | HeadlessError::Bind(_) => EXIT_FAILED,
    };
    eprintln!("serve: {} ({})", error.message(), error.code());
    code
}

pub(super) fn cmd_pull_token(args: &[String]) -> u8 {
    let json_mode = scan_json_flag(args);
    let Some(action) = args.first().map(String::as_str) else {
        return fail(
            json_mode,
            EXIT_USAGE,
            "usage",
            "pull-token needs an action: status, show, rotate or revoke",
        );
    };
    let flags = match Flags::parse(&args[1..]) {
        Ok(flags) => flags,
        Err(message) => return fail(json_mode, EXIT_USAGE, "usage", &message),
    };
    if let Err(message) = flags
        .reject_unknown(&["json"])
        .and_then(|_| flags.validate_values(&[]))
    {
        return fail(json_mode, EXIT_USAGE, "usage", &message);
    }
    if !matches!(action, "status" | "show" | "rotate" | "revoke") {
        return fail(
            json_mode,
            EXIT_USAGE,
            "usage",
            &format!("Unknown pull-token action: {action} (use status, show, rotate or revoke)"),
        );
    }
    let data_dir = match data_dir() {
        Ok(dir) => dir,
        Err(message) => return fail(json_mode, EXIT_FAILED, "failed", &message),
    };
    let credentials = default_credential_backend_in(&data_dir);
    let env_override = std::env::var(local_api::PULL_TOKEN_ENV)
        .ok()
        .is_some_and(|value| !value.trim().is_empty());
    let store_failed = |message: String| {
        fail(
            json_mode,
            EXIT_FAILED,
            "credentials",
            &format!("The credential store could not be used: {message}"),
        )
    };
    match action {
        "status" => {
            let stored = match local_api::read_pull_token(credentials.as_ref()) {
                Ok(value) => value.is_some(),
                Err(_) if env_override => false,
                Err(message) => return store_failed(message),
            };
            emit(
                json_mode,
                serde_json::json!({
                    "ok": true,
                    "stored": stored,
                    "envOverride": env_override,
                }),
                &match (env_override, stored) {
                    (true, _) => format!(
                        "{} is set; `serve` uses it and ignores the stored token",
                        local_api::PULL_TOKEN_ENV
                    ),
                    (false, true) => "A pull token is stored".to_string(),
                    (false, false) => {
                        "No pull token yet; create one with `zeppbridge-cli pull-token rotate`"
                            .to_string()
                    }
                },
            );
            EXIT_OK
        }
        "show" => match local_api::read_pull_token(credentials.as_ref()) {
            Ok(Some(token)) => {
                emit(
                    json_mode,
                    serde_json::json!({ "ok": true, "token": token }),
                    &token,
                );
                EXIT_OK
            }
            Ok(None) => fail(
                json_mode,
                EXIT_FAILED,
                "not_found",
                "No pull token yet; create one with `zeppbridge-cli pull-token rotate`",
            ),
            Err(message) => store_failed(message),
        },
        "rotate" => match local_api::rotate_pull_token(credentials.as_ref()) {
            Ok(token) => {
                if !json_mode {
                    eprintln!(
                        "New pull token below. The previous one stops working within a few seconds, even for a running `serve`."
                    );
                }
                emit(
                    json_mode,
                    serde_json::json!({ "ok": true, "token": token }),
                    &token,
                );
                EXIT_OK
            }
            Err(message) => store_failed(message),
        },
        _ => match local_api::revoke_pull_token(credentials.as_ref()) {
            Ok(()) => {
                emit(
                    json_mode,
                    serde_json::json!({ "ok": true, "revoked": true }),
                    "Pull token revoked; a running `serve` rejects it within a few seconds",
                );
                EXIT_OK
            }
            Err(message) => store_failed(message),
        },
    }
}
