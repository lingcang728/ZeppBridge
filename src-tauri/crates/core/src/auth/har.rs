//! HAR (HTTP Archive) file parsing for credential extraction.
//!
//! Extracts `app_token`, `user_id`, and `region_host` from mitmproxy/Charles
//! HAR exports. Users capture HTTPS traffic from the official Zepp mobile app,
//! export the session as HAR, and this module extracts the three credentials
//! needed for API access.

use crate::models::{error::*, AuthInfo};
use regex::Regex;
use serde_json::Value;
use std::path::Path;
use url::Url;

/// Extract Zepp credentials from a HAR file.
///
/// Parses standard HAR format (`{"log": {"entries": [...]}}`) and looks for
/// requests to `api-mifit*` hosts. Extracts:
/// - `apptoken` from request headers
/// - `user_id` from URL path (pattern: `/users/{user_id}/...`)
/// - `region_host` from request hostname
///
/// Returns `Err` if the file is malformed or no valid credentials are found.
pub fn extract_from_har(har_path: &Path) -> Result<AuthInfo> {
    let content = std::fs::read_to_string(har_path)
        .map_err(|e| ZeppBridgeError::ConfigError(format!("读取HAR文件失败: {e}")))?;

    let har: Value = serde_json::from_str(&content)
        .map_err(|e| ZeppBridgeError::ConfigError(format!("HAR格式无效: {e}")))?;

    // Support standard HAR format: {"log": {"entries": [...]}}
    let entries = har
        .get("log")
        .and_then(|log| log.get("entries"))
        .and_then(|e| e.as_array())
        .ok_or_else(|| ZeppBridgeError::ConfigError("HAR文件缺少log.entries字段".to_string()))?;

    extract_credentials_from_entries(entries)
}

fn extract_credentials_from_entries(entries: &[Value]) -> Result<AuthInfo> {
    // watchface.zepp.com 发的是 `/users/<id>`，后面没有斜杠，也可能直接接 `?`。
    let user_id_re = Regex::new(r"/users/(\d+)(?:[/?#]|$)")
        .map_err(|e| ZeppBridgeError::ConfigError(format!("正则表达式编译失败: {e}")))?;

    let mut app_token: Option<String> = None;
    let mut user_id: Option<String> = None;
    let mut region_host: Option<String> = None;

    for entry in entries {
        let request = match entry.get("request") {
            Some(r) => r,
            None => continue,
        };

        let url_str = match request.get("url").and_then(|u| u.as_str()) {
            Some(u) => u,
            None => continue,
        };

        let Ok(url) = Url::parse(url_str) else {
            continue;
        };
        let Some(host) = url.host_str() else {
            continue;
        };
        let allowed = host == "api-mifit.huami.com"
            || host == "api-mifit.zepp.com"
            || ((host.ends_with(".huami.com") || host.ends_with(".zepp.com"))
                && host.starts_with("api-mifit-"));
        if url.scheme() != "https" || !allowed {
            continue;
        }
        let token = request
            .get("headers")
            .and_then(Value::as_array)
            .and_then(|headers| {
                headers.iter().find_map(|header| {
                    let name = header.get("name")?.as_str()?;
                    let value = header.get("value")?.as_str()?;
                    (name.eq_ignore_ascii_case("apptoken") && !value.trim().is_empty())
                        .then(|| value.to_owned())
                })
            });
        let Some(token) = token else {
            continue;
        };
        // Only combine identity and token from the same authenticated request.
        // Tokenless health checks and other accounts must not replace the region.
        let id = user_id_re
            .captures(url.path())
            .map(|caps| caps[1].to_string())
            .or_else(|| {
                url.query_pairs().find_map(|(key, value)| {
                    (key.eq_ignore_ascii_case("userid")
                        && !value.is_empty()
                        && value.bytes().all(|ch| ch.is_ascii_digit()))
                    .then(|| value.into_owned())
                })
            });
        app_token = Some(token);
        user_id = id;
        region_host = Some(format!("https://{host}"));

        // Early exit if we have all three
        if app_token.is_some() && user_id.is_some() && region_host.is_some() {
            break;
        }
    }

    // Validate we got all required credentials
    let app_token = app_token
        .ok_or_else(|| ZeppBridgeError::ConfigError("HAR文件中未找到apptoken".to_string()))?;
    let user_id = user_id
        .ok_or_else(|| ZeppBridgeError::ConfigError("HAR文件中未找到user_id".to_string()))?;
    let region_host = region_host
        .ok_or_else(|| ZeppBridgeError::ConfigError("HAR文件中未找到api-mifit域名".to_string()))?;

    Ok(AuthInfo {
        app_token,
        user_id,
        region_host,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn query_user_id_keeps_authenticated_region_and_rejects_lookalike_hosts() {
        let entries = serde_json::json!([
            {"request":{"url":"https://api-mifit-us3.zepp.com.evil.test/users/999","headers":[{"name":"apptoken","value":"wrong"}]}},
            {"request":{"url":"https://api-mifit.huami.com/users/888","headers":[]}},
            {"request":{"url":"https://api-mifit-us3.zepp.com/custom/diy/dial/supports?userid=123","headers":[{"name":"AppToken","value":"correct"}]}}
        ]);
        let auth = extract_credentials_from_entries(entries.as_array().unwrap()).unwrap();
        assert_eq!(auth.user_id, "123");
        assert_eq!(auth.app_token, "correct");
        assert_eq!(auth.region_host, "https://api-mifit-us3.zepp.com");
    }

    #[test]
    fn extracts_credentials_from_standard_har() {
        let har_json = serde_json::json!({
            "log": {
                "entries": [
                    {
                        "request": {
                            "url": "https://api-mifit-us3.zepp.com/users/123456/heartRate?startTime=1000",
                            "headers": [
                                {"name": "apptoken", "value": "AbCdEf1234567890"},
                                {"name": "appname", "value": "com.huami.midong"}
                            ]
                        }
                    }
                ]
            }
        });

        let entries = har_json["log"]["entries"].as_array().unwrap();
        let result = extract_credentials_from_entries(entries).unwrap();

        assert_eq!(result.app_token, "AbCdEf1234567890");
        assert_eq!(result.user_id, "123456");
        assert_eq!(result.region_host, "https://api-mifit-us3.zepp.com");
    }

    #[test]
    fn handles_case_insensitive_header_names() {
        let har_json = serde_json::json!({
            "log": {
                "entries": [
                    {
                        "request": {
                            "url": "https://api-mifit-eu2.zepp.com/users/999999/band",
                            "headers": [
                                {"name": "AppToken", "value": "XyZ789"},
                            ]
                        }
                    }
                ]
            }
        });

        let entries = har_json["log"]["entries"].as_array().unwrap();
        let result = extract_credentials_from_entries(entries).unwrap();

        assert_eq!(result.app_token, "XyZ789");
        assert_eq!(result.user_id, "999999");
    }

    #[test]
    fn skips_non_zepp_requests() {
        let har_json = serde_json::json!({
            "log": {
                "entries": [
                    {
                        "request": {
                            "url": "https://example.com/api",
                            "headers": [{"name": "apptoken", "value": "should-be-ignored"}]
                        }
                    },
                    {
                        "request": {
                            "url": "https://api-mifit-cn.huami.com/users/111/band",
                            "headers": [{"name": "apptoken", "value": "valid-token"}]
                        }
                    }
                ]
            }
        });

        let entries = har_json["log"]["entries"].as_array().unwrap();
        let result = extract_credentials_from_entries(entries).unwrap();

        assert_eq!(result.app_token, "valid-token");
        assert_eq!(result.user_id, "111");
    }

    #[test]
    fn returns_error_when_credentials_incomplete() {
        let har_json = serde_json::json!({
            "log": {
                "entries": [
                    {
                        "request": {
                            "url": "https://api-mifit-us3.zepp.com/some/path",
                            "headers": [{"name": "apptoken", "value": "token"}]
                        }
                    }
                ]
            }
        });

        let entries = har_json["log"]["entries"].as_array().unwrap();
        let result = extract_credentials_from_entries(entries);

        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("未找到user_id"));
    }

    #[test]
    fn extracts_user_id_without_trailing_slash() {
        // watchface.zepp.com 导出的 HAR 就是这个样子。
        let har_json = serde_json::json!({
            "log": {
                "entries": [
                    {
                        "request": {
                            "url": "https://api-mifit-us3.zepp.com/users/7654321",
                            "headers": [{"name": "apptoken", "value": "tok"}]
                        }
                    }
                ]
            }
        });

        let entries = har_json["log"]["entries"].as_array().unwrap();
        let result = extract_credentials_from_entries(entries).unwrap();

        assert_eq!(result.user_id, "7654321");
        assert_eq!(result.region_host, "https://api-mifit-us3.zepp.com");
    }

    #[test]
    fn extracts_user_id_followed_by_query_string() {
        let har_json = serde_json::json!({
            "log": {
                "entries": [
                    {
                        "request": {
                            "url": "https://api-mifit-us3.zepp.com/users/7654321?r=1",
                            "headers": [{"name": "apptoken", "value": "tok"}]
                        }
                    }
                ]
            }
        });

        let entries = har_json["log"]["entries"].as_array().unwrap();
        let result = extract_credentials_from_entries(entries).unwrap();

        assert_eq!(result.user_id, "7654321");
    }
}
