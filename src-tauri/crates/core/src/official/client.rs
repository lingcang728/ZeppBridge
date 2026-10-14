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

/// 官方资料里我们用得到的两样：用户编号（核对身份）和昵称（让用户认出是哪个账号）。
#[derive(Debug, Clone)]
pub struct OfficialProfile {
    pub user_id: String,
    pub nickname: Option<String>,
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

/// 官方接口单个响应的上限，与旧通道一致（代码审查 R15）。7 天逐分钟心率、
/// 长运动的逐秒明细都远小于它。
const MAX_RESPONSE_BODY_BYTES: usize = 32 * 1024 * 1024;

async fn bounded_json(response: reqwest::Response) -> Result<serde_json::Value> {
    crate::connectors::read_json_limited(response, MAX_RESPONSE_BODY_BYTES).await
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
        let body: TokenBody = serde_json::from_value(bounded_json(response).await?)?;
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
        let body: TokenBody = serde_json::from_value(bounded_json(response).await?)?;
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
    pub async fn profile(&self, access_token: &str) -> Result<OfficialProfile> {
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
        let body = bounded_json(response).await?;
        let user_id = match body.get("userId") {
            Some(serde_json::Value::String(id)) if !id.is_empty() => id.clone(),
            Some(serde_json::Value::Number(id)) => id.to_string(),
            _ => return Err(ZeppBridgeError::ParseError("官方资料里没有用户编号".into())),
        };
        let nickname = body
            .get("nickName")
            .and_then(serde_json::Value::as_str)
            .map(str::to_string);
        Ok(OfficialProfile { user_id, nickname })
    }

    /// 官方数据接口的一次 GET。`path` 以 `/` 开头，查询参数原样附上。
    ///
    /// 401 / 403 是令牌不被认：交给调用方去刷新或让用户重新授权。
    /// 400 + `code = -50000` 是这个应用没有开通这项数据（压力、血氧等要找商务
    /// 特殊申请），算「不可用」而不是失败。
    pub async fn get_json(
        &self,
        access_token: &str,
        path: &str,
        query: &[(&str, String)],
    ) -> Result<serde_json::Value> {
        let response = self
            .http
            .get(format!("{}{path}", self.api_base))
            .query(query)
            .bearer_auth(access_token)
            .send()
            .await?;
        let status = response.status().as_u16();
        if status == 401 || status == 403 {
            return Err(ZeppBridgeError::NeedsReauth("官方令牌被拒绝".into()));
        }
        if status == 400 || status == 404 {
            let body = bounded_json(response).await.unwrap_or_default();
            let code = body.get("code").and_then(serde_json::Value::as_i64);
            if status == 404 || code == Some(-50000) {
                return Err(ZeppBridgeError::Unavailable(format!(
                    "官方接口 {path} 没有为这个应用开通"
                )));
            }
            return Err(ZeppBridgeError::HttpStatus {
                status,
                message: format!("官方接口 {path} 拒绝了这次请求"),
            });
        }
        if !(200..300).contains(&status) {
            return Err(ZeppBridgeError::HttpStatus {
                status,
                message: format!("官方接口 {path} 暂时没有响应"),
            });
        }
        bounded_json(response).await
    }

    /// 官方写接口的一次 POST。只把状态码和报文交回去，怎么算成功由调用方定——
    /// 训练计划接口对任何报文都回 success，不能在这里替它下结论。
    ///
    /// 网络层失败（断网、超时）原样作为错误返回：这时请求可能已经到了服务端，
    /// 调用方要按「不确定」处理，不能当成没发。
    pub async fn post_json(
        &self,
        access_token: &str,
        path: &str,
        query: &[(&str, String)],
        body: &serde_json::Value,
    ) -> Result<(u16, serde_json::Value)> {
        let response = self
            .http
            .post(format!("{}{path}", self.api_base))
            .query(query)
            .bearer_auth(access_token)
            .json(body)
            .send()
            .await?;
        let status = response.status().as_u16();
        let body = bounded_json(response).await.unwrap_or_default();
        Ok((status, body))
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
