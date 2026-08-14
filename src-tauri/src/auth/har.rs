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
    let user_id_re = Regex::new(r"/users/(\d+)/")
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

        // Only process api-mifit requests
        if !url_str.contains("api-mifit") {
            continue;
        }

        // Extract apptoken from headers
        if let Some(headers) = request.get("headers").and_then(|h| h.as_array()) {
            for header in headers {
                let name = header
                    .get("name")
                    .and_then(|n| n.as_str())
                    .unwrap_or("")
                    .to_lowercase();
                if name == "apptoken" {
                    if let Some(value) = header.get("value").and_then(|v| v.as_str()) {
                        app_token = Some(value.to_string());
                    }
                }
            }
        }

        // Extract user_id from URL path
        if let Some(caps) = user_id_re.captures(url_str) {
            user_id = Some(caps[1].to_string());
        }

        // Extract regional host from URL
        if let Ok(parsed_url) = Url::parse(url_str) {
            if let Some(host) = parsed_url.host_str() {
                if host.contains("api-mifit") {
                    region_host = Some(format!(
                        "https://{}",
                        host.trim_end_matches('/').to_lowercase()
                    ));
                }
            }
        }

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
}
