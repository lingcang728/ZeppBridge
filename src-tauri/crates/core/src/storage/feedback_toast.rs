//! 跑后打分的系统通知（批次 7）：Windows 通知上直接带五档按钮，不开应用也能打分。
//!
//! 按钮是一条本机链接 `zeppbridge://feedback?t=<令牌>&r=<1–5>`，系统点了就用它启动本程序，
//! 程序写下打分就退出（`src-tauri/src/feedback_toast.rs`）。这个链接网页也能调起，所以带一次性
//! 令牌：发通知时随机生成、只记最近的一条，对上了才写、写完就作废，运动结束 48 小时后也作废。
//! 一条运动只发一次通知。
use super::workout_feedback::{FeedbackInput, FeedbackPrompt};
use super::Database;
use crate::models::error::Result;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

const PENDING_KEY: &str = "feedback_toast_pending";
const SHOWN_KEY: &str = "feedback_toast_last_workout";

#[derive(Debug, Clone, Serialize)]
pub struct FeedbackToastDue {
    pub token: String,
    pub prompt: FeedbackPrompt,
}

#[derive(Debug, Serialize, Deserialize)]
struct Pending {
    token: String,
    workout_id: String,
    expires_at: String,
}

/// 用链接打分的结果。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ToastRating {
    Saved,
    /// 令牌对不上、用过了或者过期了：什么也不写。
    Refused,
}

fn random_token() -> Option<String> {
    let mut bytes = [0u8; 16];
    // 熵源坏了就不发带按钮的通知，不退到可猜的令牌。
    getrandom::getrandom(&mut bytes).ok()?;
    Some(hex::encode(bytes))
}

impl Database {
    /// 有一条该问、还没发过通知的运动：生成令牌、记下「发过了」，返回给界面去组通知文案。
    pub fn feedback_toast_due(&self, now: DateTime<Utc>) -> Result<Option<FeedbackToastDue>> {
        let Some(prompt) = self.workout_feedback_prompt(now)? else {
            return Ok(None);
        };
        if self.get_app_meta(SHOWN_KEY)?.as_deref() == Some(prompt.actual.workout_id.as_str()) {
            return Ok(None);
        }
        let Some(token) = random_token() else {
            return Ok(None);
        };
        let pending = Pending {
            token: token.clone(),
            workout_id: prompt.actual.workout_id.clone(),
            expires_at: prompt.expires_at.clone(),
        };
        self.set_app_meta(PENDING_KEY, &serde_json::to_string(&pending)?)?;
        self.set_app_meta(SHOWN_KEY, &prompt.actual.workout_id)?;
        Ok(Some(FeedbackToastDue { token, prompt }))
    }

    /// 通知按钮点下去：令牌对得上就把打分写进去（和概览卡上打分同一条路），然后作废令牌。
    pub fn rate_from_toast(
        &self,
        token: &str,
        rating: u8,
        now: DateTime<Utc>,
    ) -> Result<ToastRating> {
        let Some(pending) = self
            .get_app_meta(PENDING_KEY)?
            .and_then(|text| serde_json::from_str::<Pending>(&text).ok())
        else {
            return Ok(ToastRating::Refused);
        };
        let expired = DateTime::parse_from_rfc3339(&pending.expires_at)
            .map_or(true, |at| now >= at.with_timezone(&Utc));
        if pending.token.is_empty()
            || pending.token != token
            || expired
            || !(1..=5).contains(&rating)
        {
            return Ok(ToastRating::Refused);
        }
        self.save_workout_feedback(&FeedbackInput {
            workout_id: pending.workout_id,
            rating,
            tags: Vec::new(),
            note: None,
        })?;
        self.conn
            .execute("DELETE FROM app_meta WHERE key = ?1", [PENDING_KEY])?;
        Ok(ToastRating::Saved)
    }
}

/// 解析通知按钮的链接：`zeppbridge://feedback?t=<令牌>&r=<1–5>`。别的链接是 `None`。
pub fn parse_feedback_link(link: &str) -> Option<(String, u8)> {
    let query = link
        .strip_prefix("zeppbridge://feedback")?
        .trim_start_matches('/')
        .strip_prefix('?')?;
    let mut token = None;
    let mut rating = None;
    for pair in query.split('&') {
        match pair.split_once('=') {
            Some(("t", value))
                if value.len() == 32 && value.bytes().all(|b| b.is_ascii_hexdigit()) =>
            {
                token = Some(value.to_string())
            }
            Some(("r", value)) => rating = value.parse::<u8>().ok().filter(|r| (1..=5).contains(r)),
            _ => {}
        }
    }
    Some((token?, rating?))
}
