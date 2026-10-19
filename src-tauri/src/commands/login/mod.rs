use super::auth::{probe_region_evidence, RegionEvidence};

use crate::app_state::AppState;

use crate::connectors::zepp::validate_region_host;

use crate::ipc_error::AppError;

use crate::ipc_types::LoginStatus;

use crate::models::{AuthInfo, ZeppBridgeError};

use serde_json::Value;

use std::sync::atomic::{AtomicBool, Ordering};

use std::sync::Arc;

use std::time::Duration;

use tauri::{
    webview::NewWindowResponse, AppHandle, Emitter, Manager, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder,
};

mod copy;
mod extract;
mod poll;
mod region_probe;
#[cfg(test)]
mod tests;
mod url_policy;
mod window;

use copy::*;
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

/// 把官方通用登录页上那排第三方登录藏起来（见 `THIRD_PARTY_AUTH_HOSTS`）。
///
/// 选择器是 2026-10-19 对着 user.zepp.com 的通用登录页核对的：`.hm-social-login`
/// 包着整排，每个按钮是 `.social-item`。只改元素自己的 style，不插 `<style>`——
/// 登录页的 CSP 可能不收内联样式表，而 CSSOM 写 style 不受它管。Zepp 改版让
/// 选择器失效时，导航拦截兜底。
const HIDE_THIRD_PARTY_SCRIPT: &str = r#"(function(){
  try {
    if (window.__zeppbridgeThirdPartyHidden) { return; }
    window.__zeppbridgeThirdPartyHidden = true;
    var SELECTOR = '.hm-social-login, .social-item, [class*="social-login"]';
    var hide = function(){
      try {
        var nodes = document.querySelectorAll(SELECTOR);
        for (var i = 0; i < nodes.length; i++) {
          if (nodes[i].style.display !== 'none') {
            nodes[i].style.setProperty('display', 'none', 'important');
          }
        }
      } catch (e) {}
    };
    new MutationObserver(hide).observe(document, { childList: true, subtree: true });
    document.addEventListener('DOMContentLoaded', hide);
  } catch (e) {}
})();"#;

/// 登录窗口顶部的横幅，只挂在顶层页面上。文字由 `login_banner_text` 按界面语言
/// 给出，替换 `__ZEPPBRIDGE_BANNER_TEXT__`（已经是 JSON 字符串字面量）。
/// 用 `textContent` 写字，不拼 HTML。
const LOGIN_BANNER_SCRIPT: &str = r#"(function(){
  try {
    if (window.top !== window) { return; }
    var TEXT = __ZEPPBRIDGE_BANNER_TEXT__;
    var ID = 'zeppbridge-login-banner';
    var place = function(){
      if (!document.body || document.getElementById(ID)) { return; }
      var bar = document.createElement('div');
      bar.id = ID;
      bar.setAttribute('role', 'note');
      bar.textContent = TEXT;
      var css = {
        'box-sizing': 'border-box', 'position': 'relative', 'z-index': '2147483647',
        'margin': '0', 'padding': '10px 18px', 'background': '#fff4d6', 'color': '#3d2c00',
        'border-bottom': '1px solid #e8c766', 'font': '13px/1.55 system-ui, -apple-system, "Segoe UI", sans-serif',
        'text-align': 'center'
      };
      for (var key in css) { bar.style.setProperty(key, css[key], 'important'); }
      document.body.insertBefore(bar, document.body.firstChild);
    };
    new MutationObserver(place).observe(document, { childList: true, subtree: true });
    document.addEventListener('DOMContentLoaded', place);
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

    let third_party_blocked = Arc::new(AtomicBool::new(false));
    let window = match build_login_window(&app, &page_url, &locale, third_party_blocked.clone()) {
        Ok(window) => window,
        // 已经把状态推成「请在弹出窗口完成登录」了，可弹窗并没有开起来。
        // 不改回去的话，界面下次读状态还会拿到这句 waiting，指着一个不存在
        // 的窗口让人去操作。
        Err(error) => {
            publish_failed(&app, &state, &error, &page_url).await;
            return Err(error);
        }
    };
    spawn_login_poll(app, epoch, window, third_party_blocked);
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
