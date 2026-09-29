//! Zepp 官方开放平台：授权、令牌、令牌存储。
//!
//! 和 `auth` / `connectors` 那条「旧通道」完全分开：旧通道是用户账号登录后的
//! `api-mifit*` 私有接口，这里是官方 OAuth 拿到的 `api-open.zepp.com` 令牌。
//! 官方令牌进不了旧通道，旧通道的令牌也不能冒充官方令牌，两套各存各的。
//!
//! App ID 与 App Secret 只在中转站（Cloudflare）上。桌面端不带任何一样：
//! 授权地址由中转站拼，换令牌和刷新令牌都经中转站补上 secret。

mod client;
mod store;

pub use client::{ClaimOutcome, OfficialClient, RefreshOutcome};
pub use store::{OfficialMeta, OfficialStore};

use crate::models::{error::Result, ZeppBridgeError};
use base64::Engine;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

/// 中转站。授权回调地址在 Zepp 控制台登记的就是这个域名。
pub const RELAY_BASE: &str = "https://zeppbridge.pages.dev";
/// 官方数据接口。
pub const API_BASE: &str = "https://api-open.zepp.com";

/// 离过期还剩这么多秒就提前刷新，别让一次同步正好撞上令牌失效。
pub const REFRESH_MARGIN_SECONDS: i64 = 5 * 60;

/// 一次授权从打开浏览器到领到令牌，最长等这么久（与中转站的暂存时限一致）。
pub const AUTHORIZATION_WINDOW_SECONDS: u64 = 10 * 60;

#[derive(Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct OfficialTokens {
    pub access_token: String,
    pub refresh_token: Option<String>,
    /// 令牌到期的 Unix 秒。Zepp 没给 `expires_in` 时为空，只能等 401 再说。
    pub expires_at: Option<i64>,
    pub user_id: String,
}

// 令牌绝不进日志：Debug 只说有没有。
impl std::fmt::Debug for OfficialTokens {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("OfficialTokens")
            .field("access_token", &"<redacted>")
            .field(
                "refresh_token",
                &self.refresh_token.as_ref().map(|_| "<redacted>"),
            )
            .field("expires_at", &self.expires_at)
            .field("user_id", &self.user_id)
            .finish()
    }
}

impl OfficialTokens {
    /// 到期前 [`REFRESH_MARGIN_SECONDS`] 秒起就算该刷新了。
    pub fn needs_refresh(&self, now: i64) -> bool {
        self.expires_at
            .is_some_and(|expires_at| now >= expires_at - REFRESH_MARGIN_SECONDS)
    }
}

/// 一次授权的两个随机值。
///
/// `state` 会出现在浏览器地址栏；`claim_secret` 只留在本机，中转站只见过它的
/// SHA-256。所以只看到地址栏的人领不走令牌。
pub struct AuthorizationRequest {
    pub state: String,
    claim_secret: String,
}

impl AuthorizationRequest {
    pub fn new() -> Result<Self> {
        Ok(Self {
            state: random_token()?,
            claim_secret: random_token()?,
        })
    }

    pub fn claim_secret(&self) -> &str {
        &self.claim_secret
    }

    /// 用系统浏览器打开的地址。中转站记下这次授权后把人送去 Zepp 授权页。
    pub fn start_url(&self) -> String {
        let claim_hash = hex::encode(Sha256::digest(self.claim_secret.as_bytes()));
        format!(
            "{RELAY_BASE}/api/zepp/oauth/start?state={}&claim={claim_hash}",
            self.state
        )
    }
}

/// 32 字节随机数，base64url 无填充（43 个字符，与中转站的校验一致）。
fn random_token() -> Result<String> {
    let mut bytes = [0u8; 32];
    getrandom::getrandom(&mut bytes)
        .map_err(|error| ZeppBridgeError::ConfigError(format!("无法生成随机数: {error}")))?;
    Ok(base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes))
}

#[cfg(test)]
mod tests;
