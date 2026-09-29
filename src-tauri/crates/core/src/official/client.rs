//! 和中转站、官方接口说话的 HTTP 客户端。只连两个固定主机，不跟随跳转。

use super::{OfficialTokens, API_BASE, RELAY_BASE};
use crate::models::{error::Result, ZeppBridgeError};
use serde::Deserialize;
use serde_json::json;
use std::time::Duration;

/// 领令牌的结果。
#[derive(Debug)]
pub enum ClaimOutcome {
    /// 用户还没在浏览器里点完。
    Pending,
    Ready(OfficialTokens),
    /// 用户没同意。
    Denied,
    /// Zepp 没接受这次授权（换令牌失败）。
    Failed,
    /// 过期、用过，或者这次授权中转站根本不认识。
    Expired,
}

#[derive(Debug)]
pub enum RefreshOutcome {
    Ready(OfficialTokens),
    /// 令牌确定失效：只能让用户重新授权。
    Revoked,
}

#[derive(Deserialize)]
pub(super) struct TokenBody {
    status: Option<String>,
    access_token: Option<String>,
    refresh_token: Option<String>,
    expires_in: Option<i64>,
    user_id: Option<String>,
}

impl TokenBody {
    /// 中转站给的令牌集 → 本地保存的形状。`user_id` 缺失时沿用 `fallback_user`
    /// （刷新响应不一定再带一次）。
    pub(super) fn into_tokens(
        self,
        now: i64,
        fallback_user: Option<&str>,
    ) -> Option<OfficialTokens> {
        let access_token = self.access_token.filter(|value| !value.is_empty())?;
        let user_id = self
            .user_id
            .filter(|value| !value.is_empty())
            .or_else(|| fallback_user.map(str::to_string))?;
        Some(OfficialTokens {
            access_token,
            refresh_token: self.refresh_token.filter(|value| !value.is_empty()),
            expires_at: self.expires_in.map(|seconds| now + seconds.max(0)),
            user_id,
        })
    }
}

pub struct OfficialClient {
    http: reqwest::Client,
    relay_base: String,
    api_base: String,
}

impl OfficialClient {
    pub fn new() -> Result<Self> {
        Self::with_bases(RELAY_BASE, API_BASE)
    }

    /// 测试用：指到本地假服务。正式代码只走 [`Self::new`] 的两个固定主机。
    pub fn with_bases(relay_base: &str, api_base: &str) -> Result<Self> {
        let http = reqwest::Client::builder()
            .timeout(Duration::from_secs(20))
            .redirect(reqwest::redirect::Policy::none())
            .user_agent(concat!("ZeppBridge/", env!("CARGO_PKG_VERSION")))
            .build()?;
        Ok(Self {
            http,
            relay_base: relay_base.trim_end_matches('/').to_string(),
            api_base: api_base.trim_end_matches('/').to_string(),
        })
    }

    pub async fn claim(&self, state: &str, claim_secret: &str, now: i64) -> Result<ClaimOutcome> {
        let response = self
            .http
            .post(format!("{}/api/zepp/oauth/claim", self.relay_base))
            .json(&json!({ "state": state, "claim_secret": claim_secret }))
            .send()
            .await?;
        let status = response.status().as_u16();
        if status == 404 {
            return Ok(ClaimOutcome::Expired);
        }
        if status == 202 {
            return Ok(ClaimOutcome::Pending);
        }
        if status == 503 {
            return Err(ZeppBridgeError::Unavailable("官方授权服务尚未启用".into()));
        }
        if !(200..300).contains(&status) {
            return Err(ZeppBridgeError::HttpStatus {
                status,
                message: "授权中转站没有接受这次领取".into(),
            });
        }
        let body: TokenBody = response.json().await?;
        Ok(match body.status.as_deref() {
            Some("ready") => match body.into_tokens(now, None) {
                Some(tokens) => ClaimOutcome::Ready(tokens),
                None => ClaimOutcome::Failed,
            },
            Some("denied") => ClaimOutcome::Denied,
            Some("pending") => ClaimOutcome::Pending,
            _ => ClaimOutcome::Failed,
        })
    }

    pub async fn refresh(&self, tokens: &OfficialTokens, now: i64) -> Result<RefreshOutcome> {
        let Some(refresh_token) = tokens.refresh_token.as_deref() else {
            return Ok(RefreshOutcome::Revoked);
        };
        let response = self
            .http
            .post(format!("{}/api/zepp/oauth/refresh", self.relay_base))
            .json(&json!({ "access_token": tokens.access_token, "refresh_token": refresh_token }))
            .send()
            .await?;
        let status = response.status().as_u16();
        if status == 401 {
            return Ok(RefreshOutcome::Revoked);
        }
        if !(200..300).contains(&status) {
            return Err(ZeppBridgeError::HttpStatus {
                status,
                message: "刷新官方令牌暂时失败".into(),
            });
        }
        let body: TokenBody = response.json().await?;
        match body.into_tokens(now, Some(&tokens.user_id)) {
            Some(mut fresh) => {
                // 刷新响应没带新的 refresh_token 时，旧的继续可用。
                if fresh.refresh_token.is_none() {
                    fresh.refresh_token = tokens.refresh_token.clone();
                }
                Ok(RefreshOutcome::Ready(fresh))
            }
            None => Err(ZeppBridgeError::ParseError("刷新响应里没有访问令牌".into())),
        }
    }

    /// `GET /users/-/profile`：核对这把令牌确实能用、属于哪个用户。
    pub async fn profile_user_id(&self, access_token: &str) -> Result<String> {
        let response = self
            .http
            .get(format!("{}/users/-/profile", self.api_base))
            .bearer_auth(access_token)
            .send()
            .await?;
        let status = response.status().as_u16();
        if status == 401 || status == 403 {
            return Err(ZeppBridgeError::NeedsReauth("官方令牌被拒绝".into()));
        }
        if !(200..300).contains(&status) {
            return Err(ZeppBridgeError::HttpStatus {
                status,
                message: "官方资料接口没有响应".into(),
            });
        }
        let body: serde_json::Value = response.json().await?;
        match body.get("userId") {
            Some(serde_json::Value::String(id)) if !id.is_empty() => Ok(id.clone()),
            Some(serde_json::Value::Number(id)) => Ok(id.to_string()),
            _ => Err(ZeppBridgeError::ParseError("官方资料里没有用户编号".into())),
        }
    }

    /// 在 Zepp 那边撤销授权。断开连接时调用；失败不影响本机清掉令牌。
    pub async fn revoke(&self, access_token: &str) -> Result<()> {
        let response = self
            .http
            .post(format!("{}/users/-/thirdparty/unauthorize", self.api_base))
            .bearer_auth(access_token)
            .json(&json!({}))
            .send()
            .await?;
        let status = response.status().as_u16();
        // 令牌已经失效也算撤销完了。
        if (200..300).contains(&status) || status == 401 || status == 403 {
            Ok(())
        } else {
            Err(ZeppBridgeError::HttpStatus {
                status,
                message: "Zepp 没有确认撤销授权".into(),
            })
        }
    }
}
