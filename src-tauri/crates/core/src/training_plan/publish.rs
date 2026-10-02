//! 把账本里准备好的整窗报文发出去，并把结果翻译成账本能记的三种结局。
//!
//! 调用顺序（命令层负责拿写锁）：
//!
//! 1. 写锁内 `Database::prepare_plan_publish` → `Prepared::Send { publish_id, body }`；
//! 2. **放开写锁**，[`send_window`] 联网；
//! 3. 写锁内 `Database::finish_plan_publish(publish_id, &outcome)`。
//!
//! 联网时不拿写锁，和同步的规矩一样。

use crate::models::{error::Result, ZeppBridgeError};
use crate::official::{fresh_tokens, refresh_tokens, OfficialClient, OfficialStore};
use crate::storage::training_plan::SendOutcome;
use chrono::Utc;
use serde_json::Value;

pub const WORKOUTS_PATH: &str = "/users/-/workouts";
pub const WORKOUTS_VERSION: &str = "2.0.0";

/// 发之前先确认有一把能用的官方令牌。没有就别去改账本——那会留下一行注定发不出去
/// 的 `pending`。
pub async fn ensure_connected(store: &OfficialStore, client: &OfficialClient) -> Result<()> {
    match fresh_tokens(store, client, Utc::now().timestamp()).await? {
        Some(_) => Ok(()),
        None => Err(ZeppBridgeError::NeedsReauth(
            "还没有连接 Zepp 官方授权".into(),
        )),
    }
}

/// 发一次。令牌被拒就刷新后重发一次；刷新也被拒算「明确没生效」。
///
/// 这里不返回错误：任何结局都要进账本。
pub async fn send_window(
    store: &OfficialStore,
    client: &OfficialClient,
    body: &Value,
) -> SendOutcome {
    let now = Utc::now().timestamp();
    let tokens = match fresh_tokens(store, client, now).await {
        Ok(Some(tokens)) => tokens,
        Ok(None) => return not_authorized(),
        Err(error) if error.needs_reauth() => return not_authorized(),
        Err(error) => {
            // 刷新失败、也没有可用的旧令牌：请求根本没发出去。
            return SendOutcome::Rejected {
                http_status: 0,
                error_code: error.code().to_string(),
            };
        }
    };
    let query = [("version", WORKOUTS_VERSION.to_string())];
    let mut attempt = client
        .post_json(&tokens.access_token, WORKOUTS_PATH, &query, body)
        .await;
    if matches!(attempt, Ok((401 | 403, _))) {
        match refresh_tokens(store, client, &tokens, Utc::now().timestamp()).await {
            Ok(fresh) => {
                attempt = client
                    .post_json(&fresh.access_token, WORKOUTS_PATH, &query, body)
                    .await;
            }
            Err(_) => return not_authorized(),
        }
    }
    classify(attempt)
}

fn not_authorized() -> SendOutcome {
    SendOutcome::Rejected {
        http_status: 401,
        error_code: "err.core.needs_reauth".into(),
    }
}

/// 状态码 → 结局。
///
/// - 2xx 且报文没写负的 `code`：送到了（官方对任何报文都回 success，这只说明送到）；
/// - 2xx 但 `code < 0`、或 4xx：明确被拒，账本翻回去；
/// - 5xx、网络错误：不确定有没有生效。
pub fn classify(attempt: Result<(u16, Value)>) -> SendOutcome {
    match attempt {
        Ok((status, body)) => {
            let code = body.get("code").and_then(Value::as_i64);
            match status {
                200..=299 if code.is_none_or(|code| code >= 0) => SendOutcome::Delivered,
                200..=299 | 400..=499 => SendOutcome::Rejected {
                    http_status: status,
                    error_code: if matches!(status, 401 | 403) {
                        "err.core.needs_reauth".into()
                    } else {
                        "err.training_plan.rejected".into()
                    },
                },
                _ => SendOutcome::Unknown {
                    error_code: "err.core.http_status".into(),
                },
            }
        }
        Err(error) => SendOutcome::Unknown {
            error_code: error.code().to_string(),
        },
    }
}
