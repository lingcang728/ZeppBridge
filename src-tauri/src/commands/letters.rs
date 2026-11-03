//! 作者来信的回信与回执（批次 6「信匣」）。状态文件和脱敏在 core 的 `letters`，这里只负责联网：
//! 寄回信、补寄待寄出、取回执。连不上一律放进「待寄出」，不算失败——下次打开或联网时补寄。

use crate::app_state::AppState;
use crate::ipc_error::AppError;
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::time::Duration;
use tokio::sync::Mutex;
use zeppbridge_core::letters::{
    is_letter_version, normalize_also_hit, normalize_locale, random_install_bytes, sanitize_reply,
    LetterBoxState, LetterReceipt, PendingReply, SentReply,
};

const REPLY_ENDPOINT: &str = "https://zeppbridge.com/api/letters/reply";
const RECEIPTS_ENDPOINT: &str = "https://zeppbridge.com/api/letters/receipts";

/// 状态文件一次只让一个命令读改写（寄信、补寄、取回执可能前后脚到）。
static LETTERS_LOCK: Mutex<()> = Mutex::const_new(());

/// 界面看到的信匣：不含 install id（它只在本机和服务端之间用）。
#[derive(Debug, Clone, Serialize)]
pub struct LetterBoxView {
    pub outbox: Vec<PendingReply>,
    pub sent: Vec<SentReply>,
    pub receipts: Vec<LetterReceipt>,
    pub receipts_checked_at: Option<String>,
}

impl From<&LetterBoxState> for LetterBoxView {
    fn from(state: &LetterBoxState) -> Self {
        Self {
            outbox: state.outbox.clone(),
            sent: state.sent.clone(),
            receipts: state.receipts.clone(),
            receipts_checked_at: state.receipts_checked_at.clone(),
        }
    }
}

/// `sent`：寄到了；`queued`：没连上，放进待寄出。
#[derive(Debug, Clone, Serialize)]
pub struct LetterSendResult {
    pub status: &'static str,
    pub reply_id: Option<String>,
    pub view: LetterBoxView,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReplyAccepted {
    reply_id: String,
}

#[derive(Debug, Deserialize)]
struct ReceiptsResponse {
    receipts: Vec<LetterReceipt>,
}

enum Delivery {
    Sent(String),
    /// 连不上、服务端忙、被限流：留着下次再寄。
    Retry,
    /// 服务端明确不收（字段对不上）。重寄也没用，丢掉并告诉用户。
    Rejected(u16),
}

fn client() -> Result<reqwest::Client, AppError> {
    // 和诊断报告一样：独立的客户端，没有 cookie，不带任何账号凭据。
    reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(5))
        .timeout(Duration::from_secs(12))
        .user_agent(format!("ZeppBridge/{} letters", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|_| AppError::new("err.letters.client_init_failed", "无法初始化寄信连接"))
}

async fn deliver(client: &reqwest::Client, install_id: &str, reply: &PendingReply) -> Delivery {
    let body = serde_json::json!({
        "format": "zeppbridge.letter-reply.v1",
        "installId": install_id,
        "appVersion": reply.app_version,
        "letterVersion": reply.letter_version,
        "locale": reply.locale,
        "text": reply.text,
        "allowQuote": reply.allow_quote,
        "alsoHit": reply.also_hit,
    });
    let Ok(response) = client.post(REPLY_ENDPOINT).json(&body).send().await else {
        return Delivery::Retry;
    };
    let status = response.status();
    if status.is_success() {
        return match response.json::<ReplyAccepted>().await {
            Ok(accepted) => Delivery::Sent(accepted.reply_id),
            Err(_) => Delivery::Retry,
        };
    }
    if status.as_u16() == 429 || status.is_server_error() {
        Delivery::Retry
    } else {
        Delivery::Rejected(status.as_u16())
    }
}

fn save(state: &LetterBoxState, data_dir: &Path) -> Result<(), AppError> {
    state.save(data_dir).map_err(|_| {
        AppError::new(
            "err.letters.save_failed",
            "回信没能存到本机，请检查磁盘空间后重试",
        )
    })
}

/// 把待寄出的一封封寄出去。寄不出就停下（多半是没网），剩下的下次再说。
async fn flush(state: &mut LetterBoxState, client: &reqwest::Client) -> Option<u16> {
    let install_id = state.install_id.clone()?;
    let mut rejected = None;
    for pending in state.outbox.clone() {
        match deliver(client, &install_id, &pending).await {
            Delivery::Sent(reply_id) => {
                state.mark_sent(&pending, reply_id, chrono::Utc::now().to_rfc3339())
            }
            Delivery::Retry => {
                if let Some(queued) = state
                    .outbox
                    .iter_mut()
                    .find(|queued| queued.local_id == pending.local_id)
                {
                    queued.attempts += 1;
                }
                break;
            }
            Delivery::Rejected(status) => {
                state
                    .outbox
                    .retain(|queued| queued.local_id != pending.local_id);
                rejected = Some(status);
            }
        }
    }
    rejected
}

#[tauri::command]
pub async fn letters_state(
    state: tauri::State<'_, AppState>,
) -> std::result::Result<LetterBoxView, AppError> {
    let _guard = LETTERS_LOCK.lock().await;
    Ok(LetterBoxView::from(&LetterBoxState::load(&state.data_dir)))
}

#[tauri::command]
pub async fn letters_send_reply(
    state: tauri::State<'_, AppState>,
    local_id: String,
    letter_version: String,
    locale: String,
    text: String,
    allow_quote: bool,
    also_hit: Vec<String>,
) -> std::result::Result<LetterSendResult, AppError> {
    let text = sanitize_reply(&text);
    let also_hit = normalize_also_hit(&also_hit);
    let locale = normalize_locale(&locale).unwrap_or("en");
    let local_id: String = local_id
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric() || *ch == '-')
        .take(64)
        .collect();
    if !is_letter_version(&letter_version) || local_id.is_empty() {
        return Err(AppError::new(
            "err.letters.invalid",
            "这封回信对应的版本不对，没有寄出",
        ));
    }
    if text.is_empty() && also_hit.is_empty() {
        return Err(AppError::new("err.letters.empty", "回信是空的，写几句再寄"));
    }
    let _guard = LETTERS_LOCK.lock().await;
    let mut letters = LetterBoxState::load(&state.data_dir);
    letters.ensure_install_id(random_install_bytes());
    letters.queue(PendingReply {
        local_id: local_id.clone(),
        letter_version,
        app_version: env!("CARGO_PKG_VERSION").into(),
        locale: locale.into(),
        text,
        allow_quote,
        also_hit,
        queued_at: chrono::Utc::now().to_rfc3339(),
        attempts: 0,
    });
    // 先落盘再联网：寄信途中退出应用，这封信也还在待寄出里。
    save(&letters, &state.data_dir)?;
    let rejected = flush(&mut letters, &client()?).await;
    save(&letters, &state.data_dir)?;
    if let Some(status) = rejected {
        return Err(AppError::new(
            "err.letters.rejected",
            format!("服务端没有收下这封回信（HTTP {status}），可能需要升级应用"),
        )
        .with_params(serde_json::json!({ "status": status })));
    }
    let sent = letters.sent.iter().find(|sent| sent.local_id == local_id);
    Ok(LetterSendResult {
        status: if sent.is_some() { "sent" } else { "queued" },
        reply_id: sent.map(|sent| sent.reply_id.clone()),
        view: LetterBoxView::from(&letters),
    })
}

/// 打开信匣、启动后联网时调用：补寄待寄出，再取一次回执。都是尽力而为，连不上就原样返回本机的。
#[tauri::command]
pub async fn letters_sync(
    state: tauri::State<'_, AppState>,
) -> std::result::Result<LetterBoxView, AppError> {
    let _guard = LETTERS_LOCK.lock().await;
    let mut letters = LetterBoxState::load(&state.data_dir);
    let Some(install_id) = letters.install_id.clone() else {
        return Ok(LetterBoxView::from(&letters));
    };
    let client = client()?;
    if !letters.outbox.is_empty() {
        let _ = flush(&mut letters, &client).await;
    }
    if !letters.sent.is_empty() {
        let request = serde_json::json!({ "format": "zeppbridge.letter-receipts.v1", "installId": install_id });
        if let Ok(response) = client.post(RECEIPTS_ENDPOINT).json(&request).send().await {
            if response.status().is_success() {
                if let Ok(body) = response.json::<ReceiptsResponse>().await {
                    letters.receipts = body.receipts;
                    letters.receipts_checked_at = Some(chrono::Utc::now().to_rfc3339());
                }
            }
        }
    }
    save(&letters, &state.data_dir)?;
    Ok(LetterBoxView::from(&letters))
}
