//! 请求策略：区域主机与路径校验、重试与退避、状态码与业务码的分类、响应体上限（从 connectors/zepp.rs 拆出，逻辑不变）。

use super::*;

/// Validate and canonicalize a Zepp regional host.
///
/// The connector only ever talks to the HTTPS origin.  A bare hostname is
/// accepted as a convenience and canonicalized to HTTPS; an explicit scheme
/// must be HTTPS.  Credentials, ports, paths, queries, fragments, subdomains
/// and look-alike domains are rejected before a token can be attached.
pub fn validate_region_host(input: &str) -> Result<String> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Err(ZeppBridgeError::InvalidHost("主机为空".into()));
    }

    let candidate = if trimmed.contains("://") {
        trimmed.to_owned()
    } else {
        format!("https://{trimmed}")
    };

    // `Url::port()` intentionally normalizes an explicit default port away
    // (`:443` becomes `None`), but an explicit port is still outside this
    // connector's allow-list. Inspect the authority before parsing so the
    // rejected form cannot be mistaken for the origin-only form.
    if let Some((_, authority_and_rest)) = candidate.split_once("://") {
        let authority = authority_and_rest
            .split(['/', '?', '#'])
            .next()
            .unwrap_or_default();
        let host_part = match authority.rsplit_once('@') {
            Some((_, host)) => host,
            None => authority,
        };
        if host_part
            .rsplit_once(':')
            .and_then(|(_, port)| port.parse::<u16>().ok())
            .is_some()
        {
            return Err(ZeppBridgeError::InvalidHost("不允许端口".into()));
        }
    }

    let url = Url::parse(&candidate)
        .map_err(|_| ZeppBridgeError::InvalidHost("主机 URL 无法解析".into()))?;
    if url.scheme() != "https" {
        return Err(ZeppBridgeError::InvalidHost("只允许 HTTPS".into()));
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err(ZeppBridgeError::InvalidHost("不允许凭据".into()));
    }
    if url.port().is_some() {
        return Err(ZeppBridgeError::InvalidHost("不允许端口".into()));
    }
    if url.path() != "/" && !url.path().is_empty() {
        return Err(ZeppBridgeError::InvalidHost("不允许路径".into()));
    }
    if url.query().is_some() || url.fragment().is_some() {
        return Err(ZeppBridgeError::InvalidHost(
            "不允许 query 或 fragment".into(),
        ));
    }

    let host = url
        .host_str()
        .ok_or_else(|| ZeppBridgeError::InvalidHost("缺少主机名".into()))?
        .to_ascii_lowercase();
    let valid_zepp = host.starts_with("api-mifit") && host.ends_with(".zepp.com");
    let valid_huami = host.starts_with("api-mifit") && host.ends_with(".huami.com");
    if !(valid_zepp || valid_huami) {
        return Err(ZeppBridgeError::InvalidHost(
            "仅允许 api-mifit*.zepp.com 或 api-mifit*.huami.com".into(),
        ));
    }

    Ok(format!("https://{host}"))
}

/// 服务器给的 `Retry-After`，换算成毫秒。
///
/// 两种合法写法都认：秒数（`Retry-After: 30`）和 HTTP 日期
/// （`Retry-After: Wed, 21 Oct 2026 07:28:00 GMT`）。夹在 `MAX_BACKOFF_MS`
/// 以内——一个写着一小时的响应不该让同步挂在那里，用户早就去关窗口了。
///
/// 抽成纯函数是为了能直接测：造一个 header map 比造一次 429 响应容易得多。
pub(super) fn retry_after_ms(headers: &header::HeaderMap) -> Option<u64> {
    let raw = headers.get(header::RETRY_AFTER)?.to_str().ok()?.trim();
    if raw.is_empty() {
        return None;
    }
    // 先按秒数解。这是实际最常见的一种。
    if let Ok(seconds) = raw.parse::<u64>() {
        return Some(seconds.saturating_mul(1_000).min(MAX_BACKOFF_MS));
    }
    // 再按 HTTP 日期解。过去的时间点意味着「现在就可以重试」，等 0 毫秒。
    let target = chrono::DateTime::parse_from_rfc2822(raw).ok()?;
    let delta = target.with_timezone(&chrono::Utc) - chrono::Utc::now();
    let millis = delta.num_milliseconds().max(0) as u64;
    Some(millis.min(MAX_BACKOFF_MS))
}

/// 指数退避 + 抖动。
///
/// 服务器没给 `Retry-After` 时用它。抖动是为了不让同一时刻发起的几条流
/// 在同一毫秒一起回来再撞一次——同步是并发跑多条流的，同步退避等于把
/// 一次限流变成三次。
pub(super) fn exponential_backoff_ms(attempt: usize, base_ms: u64) -> u64 {
    // 基数为 0（重试表用完之后）时给一个下限，否则「退避」实际是不等。
    let base = base_ms.max(200);
    let scaled = base.saturating_mul(1u64 << attempt.min(5));
    let capped = scaled.min(MAX_BACKOFF_MS);
    // 抖动取 [75%, 100%]。用 getrandom，因为这个 crate 里本来就有它，
    // 不值得为一个退避再引一个 rand。取不到随机数时退回不抖动——退避本身
    // 才是重点，抖动只是锦上添花。
    let mut byte = [0u8; 1];
    if getrandom::getrandom(&mut byte).is_err() {
        return capped;
    }
    let jitter = 75 + (u64::from(byte[0]) % 26); // 75..=100
    capped * jitter / 100
}

/// Classification is kept pure so callers/tests can verify the security
/// boundary without constructing a live HTTP response.
pub fn classify_status(status: u16) -> Option<ZeppBridgeError> {
    match status {
        401 | 403 => Some(ZeppBridgeError::NeedsReauth(format!("HTTP {status}"))),
        404 => Some(ZeppBridgeError::Unavailable(format!("HTTP {status}"))),
        429 | 500..=599 => Some(ZeppBridgeError::RetryExhausted {
            status,
            message: "服务暂时不可用".into(),
        }),
        200..=299 => None,
        _ => Some(ZeppBridgeError::HttpStatus {
            status,
            message: "服务返回非成功状态".into(),
        }),
    }
}

/// 这三条流的报文外面裹着一层 `{ code, message, data }`，`code = 1` 是成功。
///
/// # 依据
///
/// 不是从文档抄的，是数出来的：一份真实的本地库里 3466 条留存报文，其中
/// **1075 条带这层包裹**——`workouts` 484 条、`workout_detail` 334 条、
/// `sleep` 257 条——**每一条的 `code` 都是 1，`message` 都是 `"success"`**。
/// 另外四条流（`daily_summary` / `wellness` / `hrv` / `heart_rate`）顶层直接
/// 就是数据，没有这层包裹，所以对它们这个函数什么都不做。
///
/// # 为什么必须拦
///
/// 在这之前，全部代码里检查这个 `code` 的地方是**零处**：只有 HTTP 401/403
/// 会被认成需要重新登录（见 `classify_status`）。于是一个业务层已经失效的
/// 凭据换来的是 HTTP 200 + 一个没有 `data` 的报文，归一化器找不到东西，抛出
/// 「数据无法解析」——用户既不会被提示重新登录，也永远拉不到数据。
///
/// # 为什么不直接判成「需要重新认证」
///
/// 因为**没有观测到任何一个失败码**：1075 条全是成功。凭一个没见过的数字就
/// 把用户踢去重新扫码登录，是拿一个确定的坏体验去换一个猜测。这里只做一件
/// 事——把它变成一条带着 code 和云端原话的错误，让它在界面和诊断报告里现形。
/// 下一份带着具体 code 的报告就能把它精确地映射成 `NeedsReauth`。
pub(super) const CLOUD_SUCCESS_CODE: i64 = 1;

pub(super) fn classify_business_code(payload: &Value) -> Option<ZeppBridgeError> {
    let code = payload.as_object()?.get("code")?.as_i64()?;
    if code == CLOUD_SUCCESS_CODE {
        return None;
    }
    let message = payload
        .get("message")
        .and_then(Value::as_str)
        .unwrap_or("(云端没有给出说明)")
        .to_string();
    Some(ZeppBridgeError::CloudRejected { code, message })
}

/// 一次 JSON 响应最多读这么大。没有上限时，一个异常大的报文会在
/// `.json()` 里把内存顶满；有 `Content-Length` 时先拒，没有时按块累加。
pub(super) const MAX_RESPONSE_BODY_BYTES: usize = 32 * 1024 * 1024;

pub(super) fn validate_api_path(path: &str) -> Result<()> {
    // `Url::join` treats a path that starts with `//` as a scheme-relative
    // URL and replaces the host. Reject that, and any query/fragment, before
    // joining; the origin check after join is the second fence.
    if !path.starts_with('/')
        || path.starts_with("//")
        || path.contains('?')
        || path.contains('#')
        || path.contains('\\')
        || path.contains('\0')
    {
        return Err(ZeppBridgeError::ConfigError("非法 API 路径".into()));
    }
    Ok(())
}

pub(super) fn same_region_origin(next: &Url, base: &Url) -> bool {
    next.scheme() == "https"
        && base.scheme() == "https"
        && next.host_str().is_some()
        && next.host_str() == base.host_str()
        && next.port_or_known_default() == base.port_or_known_default()
}

pub(super) fn validate_member_id(input: &str) -> Result<&str> {
    let trimmed = input.trim();
    if trimmed == "-1" {
        return Ok(trimmed);
    }
    if trimmed.is_empty() || trimmed.len() > 32 || !trimmed.chars().all(|c| c.is_ascii_digit()) {
        return Err(ZeppBridgeError::ConfigError("member_id 无效".into()));
    }
    Ok(trimmed)
}

pub(super) async fn read_json_body(response: reqwest::Response) -> Result<Value> {
    crate::connectors::read_json_limited(response, MAX_RESPONSE_BODY_BYTES).await
}

pub fn validate_track_id(input: &str) -> Result<String> {
    let trimmed = input.trim();
    if trimmed.is_empty() || trimmed.len() > 32 || !trimmed.chars().all(|c| c.is_ascii_digit()) {
        return Err(ZeppBridgeError::ConfigError("trackid 无效".into()));
    }
    Ok(trimmed.to_owned())
}

pub fn validate_detail_source(input: &str) -> Result<String> {
    let trimmed = input.trim();
    if trimmed.is_empty()
        || trimmed.len() > 64
        || !trimmed
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'))
    {
        return Err(ZeppBridgeError::ConfigError("source 无效".into()));
    }
    Ok(trimmed.to_owned())
}
