//! 作者来信的回信与回执（批次 6「信匣」）。状态文件和脱敏在 core 的 `letters`，这里只负责联网：
//! 寄回信、补寄待寄出、取回执。连不上一律放进「待寄出」，不算失败——下次打开或联网时补寄。

use super::spawn_independent_read;
use crate::app_state::AppState;
use crate::ipc_error::AppError;
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::time::Duration;
use tokio::sync::Mutex;
use zeppbridge_core::letters::structure_sample::{
    is_structure_sample, StructureSample, STRUCTURE_SAMPLE_MAX_BYTES,
};
use zeppbridge_core::letters::{
    attachment_file_name, attachments_dir, decode_attachment, is_attachment_file_name,
    is_letter_version, is_report_id, normalize_also_hit, normalize_locale, random_install_bytes,
    sample_file_name, sanitize_reply, sniff_image, LetterBoxState, LetterReceipt,
    PendingAttachment, PendingReply, SentReply, LETTER_ATTACHMENTS_MAX,
    LETTER_ATTACHMENT_MAX_ATTEMPTS, LETTER_ATTACHMENT_MAX_BYTES, LETTER_SAMPLES_MAX,
};

const REPLY_ENDPOINT: &str = "https://zeppbridge.com/api/letters/reply";
const RECEIPTS_ENDPOINT: &str = "https://zeppbridge.com/api/letters/receipts";
const ATTACHMENT_ENDPOINT: &str = "https://zeppbridge.com/api/letters/attachment";

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
    client_with_timeout(Duration::from_secs(12))
}

/// 传图慢网络上要久一点：1 MB 在几百 kbps 的上行上要好几十秒。
fn attachment_client() -> Result<reqwest::Client, AppError> {
    client_with_timeout(Duration::from_secs(90))
}

fn client_with_timeout(timeout: Duration) -> Result<reqwest::Client, AppError> {
    // 和诊断报告一样：独立的客户端，没有 cookie，不带任何账号凭据。
    reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(5))
        .timeout(timeout)
        .user_agent(format!("ZeppBridge/{} letters", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|_| AppError::new("err.letters.client_init_failed", "无法初始化寄信连接"))
}

async fn deliver(client: &reqwest::Client, install_id: &str, reply: &PendingReply) -> Delivery {
    let delivery = post_reply(client, install_id, reply, true).await;
    // 附了诊断报告编号、服务端却说字段不对：多半是网站那边还没上新接口。去掉编号再寄一次，信不能丢；
    // 报告本身已经单独交上去了。
    if matches!(delivery, Delivery::Rejected(422)) && reply.report_id.is_some() {
        return post_reply(client, install_id, reply, false).await;
    }
    delivery
}

async fn post_reply(
    client: &reqwest::Client,
    install_id: &str,
    reply: &PendingReply,
    with_report: bool,
) -> Delivery {
    let mut body = serde_json::json!({
        "format": "zeppbridge.letter-reply.v1",
        "installId": install_id,
        "appVersion": reply.app_version,
        "letterVersion": reply.letter_version,
        "locale": reply.locale,
        "text": reply.text,
        "allowQuote": reply.allow_quote,
        "alsoHit": reply.also_hit,
    });
    if let (true, Some(report_id)) = (with_report, reply.report_id.as_ref()) {
        body["reportId"] = serde_json::Value::String(report_id.clone());
    }
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
    state.save(data_dir).map_err(|_| save_error())
}

/// 把一张附图传给已经寄到的回信。
async fn upload_attachment(
    client: &reqwest::Client,
    install_id: &str,
    data_dir: &Path,
    item: &PendingAttachment,
) -> Delivery {
    if !is_attachment_file_name(&item.file) || !is_report_id(&item.reply_id) {
        return Delivery::Rejected(0);
    }
    let Ok(bytes) = std::fs::read(attachments_dir(data_dir).join(&item.file)) else {
        return Delivery::Rejected(0);
    };
    // 结构样本是 JSON（我们自己生成的那种格式），其余是压好的 JPEG / PNG。
    let content_type = if item.file.ends_with(".json") {
        is_structure_sample(&bytes).then_some("application/json")
    } else {
        sniff_image(&bytes).filter(|_| bytes.len() <= LETTER_ATTACHMENT_MAX_BYTES)
    };
    let Some(content_type) = content_type else {
        return Delivery::Rejected(0);
    };
    let Ok(response) = client
        .post(format!("{ATTACHMENT_ENDPOINT}?reply={}", item.reply_id))
        .header("content-type", content_type)
        .header("x-zeppbridge-install-id", install_id)
        .body(bytes)
        .send()
        .await
    else {
        return Delivery::Retry;
    };
    let status = response.status();
    if status.is_success() {
        return Delivery::Sent(item.file.clone());
    }
    if status.as_u16() == 429 || status.is_server_error() {
        return Delivery::Retry;
    }
    // 服务端还没有附图接口（应用先于站点更新，旧版回 404 not_found / 405）：图留在本机，下次再传，
    // 不当成「不收」删掉。真正的「这封回信不是你的 / 不存在」是 404 unknown_reply，照旧删。
    // 站点还没上收结构样本的接口时会回 415：样本留在本机，等站点更新后再传（最多试 20 次）。
    if status.as_u16() == 415 && content_type == "application/json" {
        return Delivery::Retry;
    }
    if matches!(status.as_u16(), 404 | 405) {
        let body = response.text().await.unwrap_or_default();
        if !body.contains("unknown_reply") {
            return Delivery::Retry;
        }
    }
    Delivery::Rejected(status.as_u16())
}

fn remove_attachment_file(data_dir: &Path, file: &str) {
    if is_attachment_file_name(file) {
        let _ = std::fs::remove_file(attachments_dir(data_dir).join(file));
    }
}

/// 传附图。传到了、或服务端明确不收（回信太旧、图不对）都删掉本机这份；连不上就停下，下次再传。
async fn flush_attachments(state: &mut LetterBoxState, data_dir: &Path) {
    let Some(install_id) = state.install_id.clone() else {
        return;
    };
    if state.attachment_outbox.is_empty() {
        return;
    }
    let Ok(client) = attachment_client() else {
        return;
    };
    for item in state.attachment_outbox.clone() {
        let delivery = upload_attachment(&client, &install_id, data_dir, &item).await;
        let retry = matches!(delivery, Delivery::Retry);
        if !retry || item.attempts + 1 >= LETTER_ATTACHMENT_MAX_ATTEMPTS {
            state
                .attachment_outbox
                .retain(|queued| queued.file != item.file);
            remove_attachment_file(data_dir, &item.file);
        } else if let Some(queued) = state
            .attachment_outbox
            .iter_mut()
            .find(|queued| queued.file == item.file)
        {
            queued.attempts += 1;
        }
        if retry {
            break;
        }
    }
}

/// 界面压好的图（base64）存进本机，返回文件名。不是 JPEG / PNG、太大、太多都不收。
fn store_attachments(
    data_dir: &Path,
    local_id: &str,
    encoded: &[String],
) -> Result<Vec<String>, AppError> {
    let invalid = || {
        AppError::new(
            "err.letters.attachment_invalid",
            "附图打不开或太大，没有寄出",
        )
    };
    if encoded.len() > LETTER_ATTACHMENTS_MAX {
        return Err(invalid());
    }
    let mut decoded = Vec::with_capacity(encoded.len());
    for item in encoded {
        decoded.push(decode_attachment(item).ok_or_else(invalid)?);
    }
    let dir = attachments_dir(data_dir);
    if !decoded.is_empty() {
        std::fs::create_dir_all(&dir).map_err(|_| save_error())?;
    }
    let mut files = Vec::with_capacity(decoded.len());
    for (index, (bytes, content_type)) in decoded.into_iter().enumerate() {
        let file = attachment_file_name(local_id, index, content_type);
        std::fs::write(dir.join(&file), bytes).map_err(|_| save_error())?;
        files.push(file);
    }
    Ok(files)
}

/// 随信附上的运动结构样本存进本机附件目录，和附图一起排队上传。
fn store_sample(
    data_dir: &Path,
    local_id: &str,
    index: usize,
    sample: &StructureSample,
) -> Result<String, AppError> {
    if sample.bytes > STRUCTURE_SAMPLE_MAX_BYTES {
        return Err(AppError::new(
            "err.letters.sample_too_large",
            "这次运动的结构样本太大，没有寄出；换一次运动试试",
        ));
    }
    let dir = attachments_dir(data_dir);
    std::fs::create_dir_all(&dir).map_err(|_| save_error())?;
    let file = sample_file_name(local_id, index);
    std::fs::write(dir.join(&file), sample.json.as_bytes()).map_err(|_| save_error())?;
    Ok(file)
}

/// 一次运动的结构样本（`workout_id` 为空取最近一次），给信纸预览；寄信时按同样的规则再生成一次。
#[tauri::command]
pub async fn workout_structure_sample(
    state: tauri::State<'_, AppState>,
    workout_id: Option<String>,
) -> std::result::Result<Option<StructureSample>, AppError> {
    spawn_independent_read(state.data_dir.clone(), move |db| {
        db.workout_structure_sample(workout_id.as_deref(), env!("CARGO_PKG_VERSION"))
    })
    .await
}

fn save_error() -> AppError {
    AppError::new(
        "err.letters.save_failed",
        "回信没能存到本机，请检查磁盘空间后重试",
    )
}

/// 寄待寄出的回信，再传已寄到的回信的附图。
async fn flush(
    state: &mut LetterBoxState,
    client: &reqwest::Client,
    data_dir: &Path,
) -> Option<u16> {
    let rejected = flush_replies(state, client, data_dir).await;
    flush_attachments(state, data_dir).await;
    rejected
}

/// 把待寄出的一封封寄出去。寄不出就停下（多半是没网），剩下的下次再说。
async fn flush_replies(
    state: &mut LetterBoxState,
    client: &reqwest::Client,
    data_dir: &Path,
) -> Option<u16> {
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
                for file in &pending.attachments {
                    remove_attachment_file(data_dir, file);
                }
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
#[allow(clippy::too_many_arguments)] // Tauri 命令的参数就是前端传来的字段
pub async fn letters_send_reply(
    state: tauri::State<'_, AppState>,
    local_id: String,
    letter_version: String,
    locale: String,
    text: String,
    allow_quote: bool,
    also_hit: Vec<String>,
    report_id: Option<String>,
    attachments: Option<Vec<String>>,
    sample_workout_ids: Option<Vec<String>>,
) -> std::result::Result<LetterSendResult, AppError> {
    // 只收 /api/feedback 发的那种编号（小写 UUID），别的一律不带，免得把奇怪的东西寄出去。
    let report_id = report_id.filter(|id| is_report_id(id));
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
    // 样本在后端按运动编号现做，不收界面交来的内容：寄出去的只能是脱敏规则产出的那几份。
    // 同一次运动只做一份，最多 LETTER_SAMPLES_MAX 份（界面也只让勾这么多）。
    let mut ids: Vec<String> = Vec::new();
    for id in sample_workout_ids.unwrap_or_default() {
        if ids.len() < LETTER_SAMPLES_MAX && !ids.contains(&id) {
            ids.push(id);
        }
    }
    let samples = if ids.is_empty() {
        Vec::new()
    } else {
        spawn_independent_read(state.data_dir.clone(), move |db| {
            ids.iter()
                .map(|id| db.workout_structure_sample(Some(id), env!("CARGO_PKG_VERSION")))
                .collect::<Result<Vec<_>, _>>()
        })
        .await?
        .into_iter()
        .map(|sample| {
            sample.ok_or_else(|| {
                AppError::new(
                    "err.letters.sample_missing",
                    "这次运动没有存原始报文，附不了结构样本",
                )
            })
        })
        .collect::<Result<Vec<_>, _>>()?
    };
    let _guard = LETTERS_LOCK.lock().await;
    let mut attachments =
        store_attachments(&state.data_dir, &local_id, &attachments.unwrap_or_default())?;
    for (index, sample) in samples.iter().enumerate() {
        attachments.push(store_sample(&state.data_dir, &local_id, index, sample)?);
    }
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
        report_id,
        queued_at: chrono::Utc::now().to_rfc3339(),
        attempts: 0,
        attachments,
    });
    // 先落盘再联网：寄信途中退出应用，这封信也还在待寄出里。
    save(&letters, &state.data_dir)?;
    let rejected = flush(&mut letters, &client()?, &state.data_dir).await;
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
    if !letters.outbox.is_empty() || !letters.attachment_outbox.is_empty() {
        let _ = flush(&mut letters, &client, &state.data_dir).await;
    }
    if !letters.sent.is_empty() {
        let request = serde_json::json!({ "format": "zeppbridge.letter-receipts.v1", "installId": install_id });
        if let Ok(response) = client.post(RECEIPTS_ENDPOINT).json(&request).send().await {
            if response.status().is_success() {
                if let Ok(body) = response.json::<ReceiptsResponse>().await {
                    letters.apply_receipts(body.receipts, chrono::Utc::now().to_rfc3339());
                }
            }
        }
    }
    save(&letters, &state.data_dir)?;
    Ok(LetterBoxView::from(&letters))
}
