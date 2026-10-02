//! Zepp 官方授权：用系统浏览器授权，轮询中转站领令牌，存进系统凭据存储。
//!
//! 和旧通道的网页登录（`login/`）互不相干：那边是嵌入式 WebView 登录账号、读
//! `api-mifit` 令牌；这里走系统浏览器，所以 Google / 小米 / Facebook / Apple
//! 这些在嵌入式窗口里点不动的第三方登录都能用。两边的令牌各存各的。

use crate::app_state::AppState;
use crate::ipc_error::AppError;
use serde::Serialize;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};
use tauri_plugin_opener::OpenerExt;
use zeppbridge_core::models::ZeppBridgeError;
use zeppbridge_core::official::{
    invalidate_pending_logins, AuthorizationRequest, ClaimOutcome, OfficialClient, OfficialStore,
    AUTHORIZATION_WINDOW_SECONDS,
};

pub const OFFICIAL_EVENT: &str = "official://status";

/// 领令牌的间隔。用户在浏览器里点完同意到桌面端发现，最多差这么久。
const CLAIM_INTERVAL: Duration = Duration::from_secs(2);

/// 正在进行的那次授权：取消旗标，和这次授权的起始地址（界面「复制授权链接」用）。
/// 同一时间只有一次。
struct Flow {
    cancel: Arc<AtomicBool>,
    start_url: String,
}

static FLOW: Mutex<Option<Flow>> = Mutex::new(None);

#[derive(Debug, Clone, Serialize)]
pub struct OfficialStatus {
    /// `idle` / `waiting` / `connected` / `needs_reauth` / `failed`
    pub state: String,
    /// `failed` 时的错误码（`err.official.*`），界面按它取文案。
    pub message_code: Option<String>,
    /// 中文原文，界面取不到码时兜底，CLI 与日志用它。
    pub message: Option<String>,
    /// 只露后四位。
    pub user_id_masked: Option<String>,
    /// 官方资料里的昵称，让用户认出连的是哪个账号。
    pub nickname: Option<String>,
    pub connected_at: Option<i64>,
    /// 等待授权时的起始地址。里面只有 state 和领取密钥的哈希，可以放心复制到
    /// 无痕窗口里打开（换账号用）。
    pub authorize_url: Option<String>,
}

impl OfficialStatus {
    fn failed(code: &str, message: &str) -> Self {
        Self {
            state: "failed".into(),
            message_code: Some(code.into()),
            message: Some(message.into()),
            user_id_masked: None,
            nickname: None,
            connected_at: None,
            authorize_url: None,
        }
    }
}

fn mask(user_id: &str) -> String {
    let tail: String = user_id
        .chars()
        .rev()
        .take(4)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect();
    format!("••••{tail}")
}

/// 正在等待的那次授权的起始地址；没有在等时为 `None`。
fn waiting_url() -> Option<String> {
    FLOW.lock()
        .ok()
        .and_then(|flow| flow.as_ref().map(|flow| flow.start_url.clone()))
}

fn stored_status(data_dir: &std::path::Path) -> OfficialStatus {
    let meta = OfficialStore::new(data_dir).meta().ok().flatten();
    if let Some(url) = waiting_url() {
        return OfficialStatus {
            state: "waiting".into(),
            message_code: None,
            message: None,
            user_id_masked: None,
            nickname: None,
            connected_at: None,
            authorize_url: Some(url),
        };
    }
    match meta {
        Some(meta) => OfficialStatus {
            // 过期了还没续上（get_official_status 会先试着续一次）就不能说「已授权」。
            state: if meta.needs_reauth || meta.is_expired(chrono::Utc::now().timestamp()) {
                "needs_reauth"
            } else {
                "connected"
            }
            .into(),
            message_code: None,
            message: None,
            user_id_masked: Some(mask(&meta.user_id)),
            nickname: meta.nickname.clone(),
            connected_at: Some(meta.connected_at),
            authorize_url: None,
        },
        None => OfficialStatus {
            state: "idle".into(),
            message_code: None,
            message: None,
            user_id_masked: None,
            nickname: None,
            connected_at: None,
            authorize_url: None,
        },
    }
}

fn publish(app: &AppHandle, status: &OfficialStatus) {
    let _ = app.emit(OFFICIAL_EVENT, status);
}

#[tauri::command]
pub async fn get_official_status(
    state: tauri::State<'_, AppState>,
) -> Result<OfficialStatus, AppError> {
    renew_if_expired(&state.data_dir).await;
    Ok(stored_status(&state.data_dir))
}

/// 令牌已经过期：经中转站续一次。续上了就还是「已授权」；Zepp 明确拒绝时
/// resh_tokens 会把它标成要重新授权；暂时连不上就保持过期，界面照实说。
async fn renew_if_expired(data_dir: &std::path::Path) {
    let store = OfficialStore::new(data_dir);
    let now = chrono::Utc::now().timestamp();
    let expired = store
        .meta()
        .ok()
        .flatten()
        .is_some_and(|meta| !meta.needs_reauth && meta.is_expired(now));
    if !expired {
        return;
    }
    if let Ok(client) = OfficialClient::new() {
        let _ = zeppbridge_core::official::fresh_tokens(&store, &client, now).await;
    }
}

#[tauri::command]
pub async fn start_official_login(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<OfficialStatus, AppError> {
    let request = AuthorizationRequest::new()
        .map_err(|_| AppError::new("err.official.failed", "无法生成这次授权的随机值"))?;
    let Some((cancel, generation)) = begin_flow(request.start_url())? else {
        return Ok(stored_status(&state.data_dir));
    };
    if app
        .opener()
        .open_url(request.start_url(), None::<&str>)
        .is_err()
    {
        clear_flow();
        return Err(AppError::new(
            "err.official.browser",
            "没能打开系统浏览器，请检查默认浏览器设置后重试",
        ));
    }
    let waiting = stored_status(&state.data_dir);
    publish(&app, &waiting);
    let data_dir = state.data_dir.clone();
    tauri::async_runtime::spawn(async move {
        let outcome = poll_claim(&data_dir, request, &cancel, generation).await;
        clear_flow_if(&cancel);
        if cancel.load(Ordering::SeqCst) {
            // 用户取消了（也许已经重新开始了一次）：这次的结果不再发布。
            return;
        }
        let status = match outcome {
            Some(failure) => failure,
            None => stored_status(&data_dir),
        };
        publish(&app, &status);
    });
    Ok(waiting)
}

/// 已有一次在等就返回 `None`（复用它）；否则登记新的一次，返回它的取消旗标
/// 和代次。
///
/// 锁里只决定「复用还是新建」；状态要等锁放开再算——`stored_status` 会再锁
/// 一次 FLOW，std 的 Mutex 不可重入，在锁里算就是死锁（代码审查 R04）。
fn begin_flow(start_url: String) -> Result<Option<(Arc<AtomicBool>, u64)>, AppError> {
    let mut flow = FLOW
        .lock()
        .map_err(|_| AppError::new("err.official.failed", "官方授权状态异常，请重启应用后再试"))?;
    if flow.is_some() {
        return Ok(None);
    }
    let cancel = Arc::new(AtomicBool::new(false));
    *flow = Some(Flow {
        cancel: cancel.clone(),
        start_url,
    });
    // 新的一次登录作废之前所有在途的回执（R05）。
    Ok(Some((cancel, invalidate_pending_logins())))
}

fn clear_flow() {
    if let Ok(mut flow) = FLOW.lock() {
        *flow = None;
    }
}

/// 只清掉自己那一次：取消后立刻重开的新授权不能被旧的轮询任务抹掉。
fn clear_flow_if(mine: &Arc<AtomicBool>) {
    if let Ok(mut flow) = FLOW.lock() {
        if flow
            .as_ref()
            .is_some_and(|current| Arc::ptr_eq(&current.cancel, mine))
        {
            *flow = None;
        }
    }
}

/// 一直领到有结果、超时或被取消。成功时令牌已存好，返回 `None`；否则返回要
/// 显示的失败状态（取消也算「没有失败」，回到闲置）。
async fn poll_claim(
    data_dir: &std::path::Path,
    request: AuthorizationRequest,
    cancel: &AtomicBool,
    generation: u64,
) -> Option<OfficialStatus> {
    let client = match OfficialClient::new() {
        Ok(client) => client,
        Err(_) => {
            return Some(OfficialStatus::failed(
                "err.official.failed",
                "无法建立网络客户端",
            ))
        }
    };
    let deadline = Instant::now() + Duration::from_secs(AUTHORIZATION_WINDOW_SECONDS);
    loop {
        tokio::time::sleep(CLAIM_INTERVAL).await;
        if cancel.load(Ordering::SeqCst) {
            return None;
        }
        if Instant::now() >= deadline {
            return Some(OfficialStatus::failed(
                "err.official.timeout",
                "授权等待超时，请重新点一次授权",
            ));
        }
        let now = chrono::Utc::now().timestamp();
        match client
            .claim(&request.state, request.claim_secret(), now)
            .await
        {
            Ok(ClaimOutcome::Pending) => continue,
            // 网络抖一下不算失败，下一轮再领。
            Err(ZeppBridgeError::NetworkError(_)) => continue,
            Ok(ClaimOutcome::Ready(tokens)) => {
                return save_verified(data_dir, &client, tokens, generation).await
            }
            Ok(ClaimOutcome::Denied) => {
                return Some(OfficialStatus::failed(
                    "err.official.denied",
                    "你没有同意授权，ZeppBridge 什么也没拿到",
                ))
            }
            Ok(ClaimOutcome::Failed) => {
                return Some(OfficialStatus::failed(
                    "err.official.rejected",
                    "Zepp 没有接受这次授权，请重试",
                ))
            }
            Ok(ClaimOutcome::Expired) => {
                return Some(OfficialStatus::failed(
                    "err.official.expired",
                    "这次授权已过期，请重新点一次授权",
                ))
            }
            Err(ZeppBridgeError::Unavailable(_)) => {
                return Some(OfficialStatus::failed(
                    "err.official.not_enabled",
                    "官方授权服务尚未启用",
                ))
            }
            Err(_) => {
                return Some(OfficialStatus::failed(
                    "err.official.failed",
                    "授权中转站没有正常响应，请稍后重试",
                ))
            }
        }
    }
}

/// 用官方资料接口核对令牌能用，再存。
///
/// 401/403 是 Zepp 明确不认这把令牌：不存。资料接口别的失败（没开通这项、
/// 暂时连不上）不代表令牌坏了——换令牌那一步 Zepp 已经认过它——照存。
///
/// 存之前核对代次（R05）：等 claim / profile 的时候用户取消、断开或重新开始
/// 了，这次的令牌就不写，也不算失败。
async fn save_verified(
    data_dir: &std::path::Path,
    client: &OfficialClient,
    mut tokens: zeppbridge_core::official::OfficialTokens,
    generation: u64,
) -> Option<OfficialStatus> {
    let mut nickname = None;
    match client.profile(&tokens.access_token).await {
        Ok(profile) => {
            tokens.user_id = profile.user_id;
            nickname = profile.nickname;
        }
        Err(ZeppBridgeError::NeedsReauth(_)) => {
            return Some(OfficialStatus::failed(
                "err.official.rejected",
                "Zepp 没有接受这次授权，请重试",
            ))
        }
        Err(_) => {}
    }
    // 已经被取消 / 取代：不认领库，也不写（R05）。
    if zeppbridge_core::official::current_generation() != generation {
        return None;
    }
    // 库属于另一个账号就不存这把令牌（R06）。
    if let Err(error) = crate::commands::claim_library_for_login(data_dir, &tokens.user_id).await {
        return Some(OfficialStatus::failed(&error.code, &error.message));
    }
    let store = OfficialStore::new(data_dir);
    match store.save_login(
        &tokens,
        nickname.as_deref(),
        chrono::Utc::now().timestamp(),
        generation,
    ) {
        // 写了，或者已经被取消 / 取代而没写：都不是失败。
        Ok(_) => None,
        Err(_) => Some(OfficialStatus::failed(
            "err.official.store",
            "官方授权成功了，但令牌没能存进系统凭据存储",
        )),
    }
}

/// 停掉正在等待的授权，并作废它还没写下的回执（R05）。
fn cancel_flow() {
    if let Ok(mut flow) = FLOW.lock() {
        if let Some(current) = flow.take() {
            current.cancel.store(true, Ordering::SeqCst);
        }
    }
    invalidate_pending_logins();
}

#[tauri::command]
pub async fn cancel_official_login(
    state: tauri::State<'_, AppState>,
) -> Result<OfficialStatus, AppError> {
    cancel_flow();
    Ok(stored_status(&state.data_dir))
}

/// 断开官方授权：先请 Zepp 撤销（尽力而为），再删本机令牌。**不删任何健康数据。**
#[tauri::command]
pub async fn disconnect_official(
    state: tauri::State<'_, AppState>,
) -> Result<OfficialStatus, AppError> {
    let data_dir: PathBuf = state.data_dir.clone();
    // 在途的授权一并作废：断开之后它不能再把令牌写回来。
    cancel_flow();
    let store = OfficialStore::new(&data_dir);
    if let Ok(Some(tokens)) = store.load() {
        if let Ok(client) = OfficialClient::new() {
            // 撤销成功时官方会一并删掉已同步的训练计划（不能再发空数组），
            // 本地账本跟着清零；撤销没成功就不动账本——计划可能还在手表上。
            if client.revoke(&tokens.access_token).await.is_ok() {
                super::training_plan::forget_after_revoke(&state).await;
            }
        }
    }
    store
        .disconnect()
        .map_err(|_| AppError::new("err.official.store", "没能从系统凭据存储里删掉官方令牌"))?;
    Ok(stored_status(&data_dir))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// R04：已有一次在等时再点「授权」，要在有限时间内拿到同一个等待状态，
    /// 之后取消和查询照常——以前这条路径在锁里重入同一把锁，永远不返回。
    #[test]
    fn a_second_start_reuses_the_waiting_flow_without_deadlocking() {
        let dir =
            std::env::temp_dir().join(format!("zeppbridge-official-flow-{}", std::process::id()));
        let (done, finished) = std::sync::mpsc::channel();
        let worker_dir = dir.clone();
        std::thread::spawn(move || {
            let first = begin_flow("https://example.invalid/start?state=a".into()).unwrap();
            assert!(first.is_some());
            let second = begin_flow("https://example.invalid/start?state=b".into()).unwrap();
            assert!(second.is_none(), "已有一次在等就复用它");
            let waiting = stored_status(&worker_dir);
            cancel_flow();
            let after = stored_status(&worker_dir);
            let _ = done.send((waiting, after, first.unwrap().0));
        });
        let (waiting, after, cancel) = finished
            .recv_timeout(Duration::from_secs(5))
            .expect("第二次开始授权卡死了");
        assert_eq!(waiting.state, "waiting");
        assert_eq!(
            waiting.authorize_url.as_deref(),
            Some("https://example.invalid/start?state=a")
        );
        assert_eq!(after.state, "idle");
        assert!(cancel.load(Ordering::SeqCst), "取消要通知在途的轮询");
        let _ = std::fs::remove_dir_all(dir);
    }
}
