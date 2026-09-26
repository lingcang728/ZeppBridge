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

mod extract;
mod poll;
mod region_probe;
#[cfg(test)]
mod tests;
mod url_policy;
mod window;

pub(crate) use extract::*;
use poll::*;
pub(crate) use region_probe::*;
use url_policy::*;
use window::*;

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
#[derive(Clone, PartialEq, Eq)]
pub(crate) struct ExtractedLogin {
    pub user_id: String,
    pub app_token: String,
    pub region_hint: Option<String>,
}

impl std::fmt::Debug for ExtractedLogin {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ExtractedLogin")
            .field("user_id", &self.user_id)
            .field(
                "app_token",
                &if self.app_token.is_empty() {
                    "<empty>"
                } else {
                    "<redacted>"
                },
            )
            .field("region_hint", &self.region_hint)
            .finish()
    }
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
        if state.login.epoch.load(Ordering::SeqCst) != epoch {
            return Err(AppError::new("err.login.cancelled", "登录已取消"));
        }
        let error = AppError::new(
            "err.login.window_busy",
            "上一个登录窗口还没有关完，请稍等一下再试",
        );
        publish_failed(&app, &state, &error, &page_url).await;
        return Err(error);
    }
    if state.login.epoch.load(Ordering::SeqCst) != epoch {
        return Err(AppError::new("err.login.cancelled", "登录已取消"));
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
