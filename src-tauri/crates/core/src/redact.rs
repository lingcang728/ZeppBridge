//! 数据离开本机之前的脱敏：交给 AI 的导出去掉认证、身份字段与精确轨迹，
//! 自由文本里的本机路径换成占位符。
//!
//! 以前两份实现分别住在 Tauri 命令层（`commands/data`）和 `ai_tasks`：前者
//! 拿导出的**字符串**再解析一遍才能改，大导出的内存峰值因此翻倍；后者是前者
//! 的手抄副本。现在两边都调这里，直接改 JSON 树。

use serde_json::{Map, Value};
use std::collections::BTreeSet;

/// 自由文本（提示词、备注、导出里的字符串）里的本机路径换成占位符：Windows
/// 盘符路径、UNC 路径与 Unix 绝对路径。只在词边界起步认路径，所以
/// `https://…` 这类 URL 不会被误伤。
pub fn sanitize_local_paths(text: &str) -> String {
    let mut output = String::with_capacity(text.len());
    let mut chars = text.chars().peekable();
    // 上一个写进 output 的字符。以前每一步都 `output.chars().last()`——从头
    // 扫一遍已输出的串，长文本是平方复杂度。
    let mut previous: Option<char> = None;
    while let Some(character) = chars.next() {
        let at_boundary = previous.is_none_or(|value| {
            value.is_whitespace() || matches!(value, '"' | '\'' | '(' | '[' | '{' | '=')
        });
        let is_windows_drive = at_boundary
            && character.is_ascii_alphabetic()
            && chars.peek() == Some(&':')
            && chars
                .clone()
                .nth(1)
                .is_some_and(|next| next == '\\' || next == '/');
        let is_unc = at_boundary && character == '\\' && chars.peek() == Some(&'\\');
        let is_unix =
            at_boundary && character == '/' && chars.peek().is_some_and(|next| *next != ' ');
        if is_windows_drive || is_unc || is_unix {
            output.push_str("[本地路径已移除]");
            previous = Some(']');
            if is_windows_drive {
                let _ = chars.next();
            }
            while let Some(next) = chars.peek() {
                if next.is_whitespace() || *next == '"' || *next == '\'' || *next == ')' {
                    break;
                }
                let _ = chars.next();
            }
        } else {
            output.push(character);
            previous = Some(character);
        }
    }
    output
}

/// 就地脱敏一份交给 AI 的导出，返回做过的脱敏类别（策略名，不含任何用户值，
/// 可以原样交给界面和写进元数据）。精确轨迹默认去掉，`include_precise_route`
/// 为真才保留。
pub fn redact_ai_export(value: &mut Value, include_precise_route: bool) -> Vec<String> {
    let mut redactions = BTreeSet::from(["authentication_fields", "identity_fields"]);
    if !include_precise_route {
        redactions.insert("precise_route");
    }
    redact_value(value, include_precise_route, &mut redactions);
    let redactions: Vec<String> = redactions.into_iter().map(str::to_owned).collect();

    if let Some(root) = value.as_object_mut() {
        root.insert(
            "redactions".to_string(),
            Value::Array(redactions.iter().cloned().map(Value::String).collect()),
        );
        root.insert(
            "metadata".to_string(),
            serde_json::json!({
                "ai_handoff": true,
                "precise_route_included": include_precise_route,
                "authentication_fields_removed": true,
                "identity_fields_removed": true,
            }),
        );
    }
    redactions
}

fn redact_value(
    value: &mut Value,
    include_precise_route: bool,
    redactions: &mut BTreeSet<&'static str>,
) {
    match value {
        Value::Object(object) => redact_object(object, include_precise_route, redactions),
        Value::Array(items) => {
            for item in items {
                redact_value(item, include_precise_route, redactions);
            }
        }
        Value::String(text) => {
            let sanitized = sanitize_local_paths(text);
            if sanitized != *text {
                *text = sanitized;
                redactions.insert("local_paths");
            }
        }
        _ => {}
    }
}

fn redact_object(
    object: &mut Map<String, Value>,
    include_precise_route: bool,
    redactions: &mut BTreeSet<&'static str>,
) {
    object.retain(|key, _| match removal_reason(key, include_precise_route) {
        Some(reason) => {
            redactions.insert(reason);
            false
        }
        None => true,
    });
    for child in object.values_mut() {
        redact_value(child, include_precise_route, redactions);
    }
}

/// 这个键要不要整条去掉；要的话归到哪一类。认证优先于身份，身份优先于轨迹。
fn removal_reason(key: &str, include_precise_route: bool) -> Option<&'static str> {
    let normalized = normalize_json_key(key);
    if is_authentication_key(&normalized) {
        Some("authentication_fields")
    } else if is_identity_key(&normalized) {
        Some("identity_fields")
    } else if !include_precise_route && is_precise_route_key(&normalized) {
        Some("precise_route")
    } else if is_local_path_key(&normalized) {
        Some("local_paths")
    } else {
        None
    }
}

fn normalize_json_key(key: &str) -> String {
    key.chars()
        .filter(|character| character.is_ascii_alphanumeric())
        .flat_map(|character| character.to_lowercase())
        .collect()
}

fn is_authentication_key(key: &str) -> bool {
    key.contains("token")
        || key.contains("auth")
        || key.contains("credential")
        || key.contains("secret")
        || key.contains("password")
        || key == "cookie"
        || key == "cookies"
        || key == "apikey"
        || key == "authorization"
}

fn is_identity_key(key: &str) -> bool {
    matches!(
        key,
        "user"
            | "username"
            | "userid"
            | "useraccount"
            | "account"
            | "accountid"
            | "accountname"
            | "serial"
            | "serialnumber"
            | "device"
            | "deviceid"
            | "record"
            | "workoutid"
            | "workout"
            | "sleepid"
            | "sleep"
            | "sessionid"
            | "recordid"
            | "sampleid"
            | "metricid"
            | "dailyid"
            | "sourceid"
            | "rawid"
            | "id"
            | "useridentifier"
            | "accountidentifier"
            | "deviceidentifier"
            | "serialidentifier"
            | "recordidentifier"
            | "workoutidentifier"
            | "sleepidentifier"
            | "sessionidentifier"
            | "useremail"
            | "accountemail"
            | "userphone"
            | "accountphone"
            | "email"
            | "phone"
            | "phonenumber"
            | "uuid"
            | "guid"
            | "identifier"
    ) || (key.ends_with("id")
        && [
            "user", "account", "device", "record", "workout", "sleep", "session", "sample",
            "metric", "daily", "source", "raw",
        ]
        .iter()
        .any(|prefix| key.starts_with(prefix)))
        || ([
            "user", "account", "device", "record", "workout", "sleep", "session", "serial",
        ]
        .iter()
        .any(|prefix| key.starts_with(prefix))
            && ["identifier", "uuid", "guid", "key", "number"]
                .iter()
                .any(|suffix| key.ends_with(suffix)))
        || key.contains("serial")
}

fn is_precise_route_key(key: &str) -> bool {
    let coordinate_digits = |prefix: &str| {
        key.starts_with(prefix)
            && key
                .chars()
                .skip(prefix.len())
                .all(|character| character.is_ascii_digit() || character == 'e')
    };
    matches!(
        key,
        "route"
            | "routepoints"
            | "routepoint"
            | "gps"
            | "location"
            | "locations"
            | "geolocation"
            | "geo"
            | "track"
            | "trackpoints"
            | "latitude"
            | "longitude"
            | "lat"
            | "lng"
            | "lon"
            | "coordinates"
            | "polyline"
    ) || key.contains("latitude")
        || key.contains("longitude")
        || key.contains("coordinate")
        || coordinate_digits("lat")
        || coordinate_digits("lng")
        || coordinate_digits("lon")
        || key.contains("routepoint")
        || key.contains("trackpoint")
        || key == "latlng"
        || (key.starts_with("gps")
            && (key.contains("route")
                || key.contains("point")
                || key.contains("coord")
                || key.contains("track")))
}

fn is_local_path_key(key: &str) -> bool {
    matches!(
        key,
        "path"
            | "filepath"
            | "filename"
            | "file"
            | "sourcepath"
            | "databasepath"
            | "localpath"
            | "exportpath"
            | "directory"
            | "dirname"
    ) || key.ends_with("filepath")
        || key.ends_with("pathname")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn local_paths_are_removed_without_touching_urls() {
        let text = r#"see C:\Users\me\zepp.db and "\\nas\share\x" or /home/me/a.json, keep https://example.com/a/b"#;
        let cleaned = sanitize_local_paths(text);
        assert!(!cleaned.contains("Users"));
        assert!(!cleaned.contains("nas"));
        assert!(!cleaned.contains("/home"));
        assert!(cleaned.contains("https://example.com/a/b"));
        assert_eq!(cleaned.matches("[本地路径已移除]").count(), 3);
    }

    #[test]
    fn a_long_note_is_cleaned_in_linear_time() {
        // 以前是平方复杂度：一 MB 的文本要跑几十秒。
        let text = "word ".repeat(200_000);
        let started = std::time::Instant::now();
        assert_eq!(sanitize_local_paths(&text), text);
        assert!(started.elapsed() < std::time::Duration::from_secs(2));
    }
}
