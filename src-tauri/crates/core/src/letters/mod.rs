//! 作者来信的回信与回执在本机的那一半（批次 6「信匣」）。
//!
//! 这里不碰健康数据库：回信是用户写给作者的话，不是健康数据，所以单独一个小文件
//! `data/letters/state.json`，不走 SQLite、不拿跨进程写锁。写盘一律「临时文件 + 改名」，
//! 写到一半断电也不会留下半截 JSON。
//!
//! - `install_id`：第一次寄信时生成的随机 UUID v4，**不绑账号**；回执靠它认出「我的回信」。
//! - `outbox`：没寄出去的（离线、服务端忙、限流），下次联网时补寄。
//! - `sent`：寄出去的，连原文一起留在本机，信匣里能重读自己写过什么。
//! - `receipts`：上一次从云端取回的回执（已读 / 归类 / 哪版修），离线时照样显示。

use crate::redact::{looks_like_secret, sanitize_local_paths};
use crate::unique_suffix;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[cfg(test)]
mod tests;

/// 回信上限。和 functions/api/letters/[action].js 的 `REPLY_MAX_CHARS` 一致。
pub const LETTER_REPLY_MAX_CHARS: usize = 1000;
/// 「我也遇到」一次最多带几条。和服务端 `MAX_ALSO_HIT` 一致。
pub const LETTER_ALSO_HIT_MAX: usize = 20;
/// 待寄出最多攒多少封。再多说明一直寄不出去，老的先丢（界面会说）。
pub const LETTER_OUTBOX_MAX: usize = 20;
/// 本机保留的已寄出回信条数。
pub const LETTER_SENT_MAX: usize = 200;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PendingReply {
    pub local_id: String,
    pub letter_version: String,
    pub app_version: String,
    pub locale: String,
    pub text: String,
    pub allow_quote: bool,
    pub also_hit: Vec<String>,
    pub queued_at: String,
    #[serde(default)]
    pub attempts: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SentReply {
    pub reply_id: String,
    pub local_id: String,
    pub letter_version: String,
    pub text: String,
    pub also_hit: Vec<String>,
    pub sent_at: String,
}

/// 云端回执，字段和服务端一一对应。`category` 是上期回音里的 `#id`，界面按它查标题。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LetterReceipt {
    pub reply_id: String,
    pub letter_version: String,
    pub received_at: String,
    pub read_at: Option<String>,
    pub category: Option<String>,
    pub status: Option<String>,
    pub fixed_in: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct LetterBoxState {
    #[serde(default)]
    pub install_id: Option<String>,
    #[serde(default)]
    pub outbox: Vec<PendingReply>,
    #[serde(default)]
    pub sent: Vec<SentReply>,
    #[serde(default)]
    pub receipts: Vec<LetterReceipt>,
    #[serde(default)]
    pub receipts_checked_at: Option<String>,
}

pub fn state_path(data_dir: &Path) -> PathBuf {
    data_dir.join("letters").join("state.json")
}

impl LetterBoxState {
    /// 读不到（第一次用）或读坏了都从空的开始：信匣是锦上添花，不能因为它挡住启动。
    /// 坏文件改名留着（`state.json.damaged-*`），不覆盖掉用户的草稿原文。
    pub fn load(data_dir: &Path) -> Self {
        let path = state_path(data_dir);
        let Ok(text) = std::fs::read_to_string(&path) else {
            return Self::default();
        };
        match serde_json::from_str(&text) {
            Ok(state) => state,
            Err(_) => {
                let _ = std::fs::rename(
                    &path,
                    path.with_extension(format!("json.damaged-{}", unique_suffix())),
                );
                Self::default()
            }
        }
    }

    pub fn save(&self, data_dir: &Path) -> std::io::Result<()> {
        let path = state_path(data_dir);
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let temp = path.with_extension(format!(
            "json.{}-{}.tmp",
            std::process::id(),
            unique_suffix()
        ));
        let encoded = serde_json::to_vec_pretty(self).map_err(std::io::Error::other)?;
        std::fs::write(&temp, encoded)?;
        std::fs::rename(&temp, &path).inspect_err(|_| {
            let _ = std::fs::remove_file(&temp);
        })
    }

    /// 没有就生成一个。`random` 是 16 个随机字节（调用方从系统随机源取，测试里传固定值）。
    pub fn ensure_install_id(&mut self, random: [u8; 16]) -> String {
        if let Some(id) = self.install_id.as_ref().filter(|id| is_install_id(id)) {
            return id.clone();
        }
        let id = uuid_v4(random);
        self.install_id = Some(id.clone());
        id
    }

    pub fn queue(&mut self, reply: PendingReply) {
        self.outbox
            .retain(|pending| pending.local_id != reply.local_id);
        self.outbox.push(reply);
        if self.outbox.len() > LETTER_OUTBOX_MAX {
            let excess = self.outbox.len() - LETTER_OUTBOX_MAX;
            self.outbox.drain(..excess);
        }
    }

    pub fn mark_sent(&mut self, pending: &PendingReply, reply_id: String, sent_at: String) {
        self.outbox
            .retain(|queued| queued.local_id != pending.local_id);
        if !self.sent.iter().any(|sent| sent.reply_id == reply_id) {
            self.sent.insert(
                0,
                SentReply {
                    reply_id,
                    local_id: pending.local_id.clone(),
                    letter_version: pending.letter_version.clone(),
                    text: pending.text.clone(),
                    also_hit: pending.also_hit.clone(),
                    sent_at,
                },
            );
            self.sent.truncate(LETTER_SENT_MAX);
        }
    }
}

/// 服务端认的 install id 形状：小写 UUID v4。
pub fn is_install_id(value: &str) -> bool {
    value.len() == 36
        && value.char_indices().all(|(index, ch)| match index {
            8 | 13 | 18 | 23 => ch == '-',
            14 => ch == '4',
            19 => matches!(ch, '8' | '9' | 'a' | 'b'),
            _ => ch.is_ascii_digit() || matches!(ch, 'a'..='f'),
        })
}

/// 生成 install id 用的 16 个随机字节。系统随机源取不到时退回时间 + 进程号：
/// install id 只是「认出我的回信」，不是安全凭据。
pub fn random_install_bytes() -> [u8; 16] {
    let mut bytes = [0u8; 16];
    if getrandom::getrandom(&mut bytes).is_err() {
        let seed = format!("{}-{}", std::process::id(), unique_suffix());
        for (index, byte) in seed.bytes().enumerate() {
            bytes[index % 16] ^= byte;
        }
    }
    bytes
}
pub fn uuid_v4(mut bytes: [u8; 16]) -> String {
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    let hex: String = bytes.iter().map(|byte| format!("{byte:02x}")).collect();
    format!(
        "{}-{}-{}-{}-{}",
        &hex[0..8],
        &hex[8..12],
        &hex[12..16],
        &hex[16..20],
        &hex[20..32]
    )
}

/// 回信寄出前的脱敏：去掉本机路径、抹掉看起来像凭据 / 序列号 / 邮箱的词，保留分段，
/// 截到上限。和诊断备注同一套判断（`redact::looks_like_secret`），只是回信要留住换行。
pub fn sanitize_reply(text: &str) -> String {
    let without_paths = sanitize_local_paths(text.replace("\r\n", "\n").trim());
    let mut lines = Vec::new();
    let mut blank = 0;
    for line in without_paths.split('\n') {
        let cleaned = line
            .split_whitespace()
            .map(|word| {
                if looks_like_secret(word) {
                    "[已移除]"
                } else {
                    word
                }
            })
            .collect::<Vec<_>>()
            .join(" ");
        if cleaned.is_empty() {
            blank += 1;
            if blank > 1 {
                continue;
            }
        } else {
            blank = 0;
        }
        lines.push(cleaned);
    }
    let joined = lines.join("\n");
    joined
        .trim()
        .chars()
        .take(LETTER_REPLY_MAX_CHARS)
        .collect::<String>()
        .trim_end()
        .to_string()
}

/// 「我也遇到」的 id：和回音文件里的 `#id` 同一个形状，去重、限量。
pub fn normalize_also_hit(ids: &[String]) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for id in ids {
        let valid = (1..=48).contains(&id.len())
            && id
                .chars()
                .next()
                .is_some_and(|ch| ch.is_ascii_lowercase() || ch.is_ascii_digit())
            && id
                .chars()
                .all(|ch| ch.is_ascii_lowercase() || ch.is_ascii_digit() || ch == '-');
        if valid && !out.contains(id) {
            out.push(id.clone());
        }
        if out.len() == LETTER_ALSO_HIT_MAX {
            break;
        }
    }
    out
}

/// 回信的界面语言码，只认 12 种。
pub fn normalize_locale(value: &str) -> Option<&'static str> {
    const LOCALES: [&str; 12] = [
        "zh", "en", "es", "nl", "pt-BR", "pt-PT", "de", "ru", "hi-IN", "fr", "it", "pl",
    ];
    LOCALES.iter().copied().find(|locale| *locale == value)
}

pub fn is_letter_version(value: &str) -> bool {
    let parts: Vec<&str> = value.split('.').collect();
    parts.len() == 3
        && parts
            .iter()
            .all(|part| (1..=3).contains(&part.len()) && part.chars().all(|ch| ch.is_ascii_digit()))
}
