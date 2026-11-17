//! 推送的 HTTP 发送与地址校验。
//!
//! 硬规则：只发往用户自己填的地址；重定向不跟随；日志和错误里不带地址里的凭据和密钥。

use std::net::IpAddr;
use std::time::Duration;

/// 网络错误和 5xx 重试几次（直连偶尔在 TLS 握手时被重置）；4xx 是真错，不重试。
const MAX_ATTEMPTS: u32 = 5;

const REQUEST_TIMEOUT: Duration = Duration::from_secs(120);

/// 推送目标地址校验的结论。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SiteUrl {
    /// 站点根，不带尾斜杠，例如 `https://health.example.com`。
    pub base: String,
    /// `base + "/v1"`。
    pub api: String,
    pub host: String,
}

/// 通用规则：https 不限主机；http 只允许回环、私网（10/8、172.16/12、192.168/16）和 `.local`。
pub fn http_allowed(host: &str) -> bool {
    let bare = host.trim_start_matches('[').trim_end_matches(']');
    if let Ok(ip) = bare.parse::<IpAddr>() {
        return match ip {
            IpAddr::V4(v4) => v4.is_loopback() || v4.is_private(),
            IpAddr::V6(v6) => v6.is_loopback(),
        };
    }
    let lower = bare.to_ascii_lowercase();
    lower == "localhost" || lower.ends_with(".local")
}

/// PA 站点地址：照搬 `ZeppBridge-Cloud/uploader/lib/site.mjs::normalizeSite`。
///
/// - `example.com` → `https://health.example.com`；已带 `health.` 不再加；
/// - 完整网址照用，去掉尾斜杠和旧版带的 `/v1`；
/// - 只允许 https；拒绝账号密码、query、fragment、裸 IP；
/// - `dev_loopback` 时放行 `http://127.0.0.1:<端口>`（只给测试和本地自测）。
pub fn normalize_pa_site(input: &str, dev_loopback: bool) -> Result<SiteUrl, &'static str> {
    let raw = input.trim();
    if raw.is_empty() {
        return Err("site_empty");
    }
    if raw.chars().any(char::is_whitespace) || raw.contains('?') || raw.contains('#') {
        return Err("site_invalid");
    }
    let (scheme, rest) = match raw.split_once("://") {
        Some((scheme, rest)) => (scheme.to_ascii_lowercase(), rest.to_string()),
        None => {
            if raw.contains(['/', '@', '\\']) {
                return Err("site_invalid");
            }
            let mut host = raw.to_ascii_lowercase();
            if host.ends_with('.') {
                host.pop();
            }
            let hostname = host.split(':').next().unwrap_or_default().to_string();
            if is_ip_host(&hostname) || !hostname.contains('.') {
                return Err("site_invalid");
            }
            if !hostname.starts_with("health.") {
                host = format!("health.{host}");
            }
            ("https".to_string(), host)
        }
    };
    let (authority, path) = match rest.find('/') {
        Some(index) => (rest[..index].to_string(), rest[index..].to_string()),
        None => (rest, String::new()),
    };
    if authority.contains('@') || authority.is_empty() {
        return Err("site_invalid");
    }
    let authority = authority.to_ascii_lowercase();
    let hostname = authority
        .rsplit_once(':')
        .filter(|(_, port)| port.chars().all(|c| c.is_ascii_digit()) && !port.is_empty())
        .map_or(authority.as_str(), |(host, _)| host)
        .to_string();
    let loopback = scheme == "http" && hostname == "127.0.0.1";
    if loopback {
        if !dev_loopback {
            return Err("site_http_not_allowed");
        }
    } else {
        if scheme != "https" {
            return Err("site_http_not_allowed");
        }
        if is_ip_host(&hostname) || !hostname.contains('.') {
            return Err("site_invalid");
        }
    }
    let mut path = path.trim_end_matches('/').to_string();
    if let Some(stripped) = path.strip_suffix("/v1") {
        path = stripped.to_string();
    }
    let base = format!("{scheme}://{authority}{path}");
    Ok(SiteUrl {
        api: format!("{base}/v1"),
        base,
        host: authority,
    })
}

fn is_ip_host(hostname: &str) -> bool {
    hostname.starts_with('[') || hostname.parse::<std::net::Ipv4Addr>().is_ok()
}

/// 把错误信息里形如 `zbr_…` / `zbw_…` 的密钥换掉（照 upload.mjs 的写法）。
pub fn redact(message: &str) -> String {
    let mut out = String::with_capacity(message.len());
    let mut rest = message;
    while let Some(index) = rest.find("zb") {
        let (head, tail) = rest.split_at(index);
        out.push_str(head);
        let bytes = tail.as_bytes();
        if bytes.len() > 3 && (bytes[2] == b'r' || bytes[2] == b'w') && bytes[3] == b'_' {
            let end = tail[4..]
                .find(|c: char| !(c.is_ascii_alphanumeric() || c == '_' || c == '-'))
                .map_or(tail.len(), |offset| offset + 4);
            out.push_str("zb*_<redacted>");
            rest = &tail[end..];
        } else {
            out.push_str("zb");
            rest = &tail[2..];
        }
    }
    out.push_str(rest);
    out
}

/// 不跟随重定向、不走系统代理的客户端。
pub fn build_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .no_proxy()
        .timeout(REQUEST_TIMEOUT)
        .build()
        .map_err(|error| format!("http client: {error}"))
}

/// 发一个请求，网络错误和 5xx 退避重试。`label` 只含方法和相对路径，不含主机和密钥。
pub async fn send(
    client: &reqwest::Client,
    method: reqwest::Method,
    url: &str,
    bearer: &str,
    content_type: &str,
    body: Option<Vec<u8>>,
    label: &str,
) -> Result<(), String> {
    for attempt in 1..=MAX_ATTEMPTS {
        let mut request = client
            .request(method.clone(), url)
            .header("authorization", format!("Bearer {bearer}"))
            .header("content-type", content_type);
        if let Some(body) = body.as_ref() {
            request = request.body(body.clone());
        }
        match request.send().await {
            Ok(response) if response.status().is_success() => return Ok(()),
            Ok(response) => {
                let status = response.status().as_u16();
                // 3xx 也是失败：重定向不跟随，密钥不能被带到别处。
                if status < 500 || attempt >= MAX_ATTEMPTS {
                    return Err(format!("{label} -> HTTP {status}"));
                }
            }
            Err(error) => {
                if attempt >= MAX_ATTEMPTS {
                    let kind = if error.is_timeout() {
                        "timeout"
                    } else if error.is_connect() {
                        "connect"
                    } else {
                        "network"
                    };
                    return Err(format!("{label} -> network error ({kind})"));
                }
            }
        }
        tokio::time::sleep(Duration::from_millis(2000 * u64::from(attempt))).await;
    }
    Err(format!("{label} -> gave up"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn site_normalization_matches_site_mjs() {
        let ok = |input: &str| normalize_pa_site(input, false).unwrap().base;
        assert_eq!(ok("example.com"), "https://health.example.com");
        assert_eq!(ok("Health.Example.com."), "https://health.example.com");
        assert_eq!(ok("https://data.example.com/"), "https://data.example.com");
        assert_eq!(ok("https://health.x.com/v1"), "https://health.x.com");
        assert_eq!(
            normalize_pa_site("example.com", false).unwrap().api,
            "https://health.example.com/v1"
        );
        for bad in [
            "",
            "example",
            "1.2.3.4",
            "http://health.example.com",
            "https://user:pw@health.example.com",
            "https://health.example.com/?a=1",
            "example.com/path",
            "https://10.0.0.1",
            "http://127.0.0.1:8787",
        ] {
            assert!(normalize_pa_site(bad, false).is_err(), "{bad}");
        }
        assert_eq!(
            normalize_pa_site("http://127.0.0.1:8787", true)
                .unwrap()
                .api,
            "http://127.0.0.1:8787/v1"
        );
    }

    #[test]
    fn plain_http_only_reaches_private_hosts() {
        for host in [
            "127.0.0.1",
            "10.1.2.3",
            "172.16.0.9",
            "192.168.1.2",
            "nas.local",
            "[::1]",
            "localhost",
        ] {
            assert!(http_allowed(host), "{host}");
        }
        for host in ["8.8.8.8", "172.32.0.1", "example.com", "health.example.com"] {
            assert!(!http_allowed(host), "{host}");
        }
    }

    #[test]
    fn keys_are_redacted_from_messages() {
        let key = format!("zbw_abcdefghij_{}", "A".repeat(43));
        assert_eq!(
            redact(&format!("PUT x failed with {key}.")),
            "PUT x failed with zb*_<redacted>."
        );
        assert_eq!(redact("zbx_ and zb"), "zbx_ and zb");
    }
}
