//! GPX / TCX / Apple 健康导出用到的那一点 XML：找元素、取属性、取子元素文本。
//!
//! 不引一个完整的 XML 解析库：这几种文件的结构是平的、固定的，要的只是几个元素和属性；
//! 命名空间前缀（`gpxtpx:hr`、`ns3:TPX`）各家写法不一，这里按本地名匹配，前缀一律忽略。

use chrono::{DateTime, NaiveDateTime, Utc};

/// 第一个本地名为 `name` 的开始标签的位置：`<name`、`<prefix:name`，后面紧跟空白、`>` 或 `/`。
fn find_open(text: &str, name: &str, from: usize) -> Option<(usize, usize)> {
    let bytes = text.as_bytes();
    let mut at = from;
    while let Some(offset) = text[at..].find('<') {
        let start = at + offset;
        let mut cursor = start + 1;
        if bytes
            .get(cursor)
            .is_some_and(|b| matches!(b, b'/' | b'?' | b'!'))
        {
            at = cursor;
            continue;
        }
        // 跳过命名空间前缀。
        let tag_end = text[cursor..]
            .find(|c: char| c.is_whitespace() || c == '>' || c == '/')
            .map_or(text.len(), |n| cursor + n);
        if let Some(colon) = text[cursor..tag_end].rfind(':') {
            cursor += colon + 1;
        }
        if &text[cursor..tag_end] == name {
            return Some((start, tag_end));
        }
        at = start + 1;
    }
    None
}

/// 本地名为 `name` 的每一个元素（含开始和结束标签）。同名元素不嵌套（这几种文件里确实不嵌套）。
pub(crate) fn elements<'a>(text: &'a str, name: &'a str) -> Vec<&'a str> {
    let mut out = Vec::new();
    let mut at = 0;
    while let Some((start, after_name)) = find_open(text, name, at) {
        let Some(gt) = text[after_name..].find('>').map(|n| after_name + n) else {
            break;
        };
        if text.as_bytes()[gt - 1] == b'/' {
            out.push(&text[start..=gt]);
            at = gt + 1;
            continue;
        }
        let end = close_of(text, name, gt + 1).unwrap_or(text.len());
        out.push(&text[start..end]);
        at = end;
    }
    out
}

/// 从 `from` 起第一个本地名为 `name` 的结束标签之后的位置。
fn close_of(text: &str, name: &str, from: usize) -> Option<usize> {
    let mut at = from;
    while let Some(offset) = text[at..].find("</") {
        let start = at + offset + 2;
        let end = text[start..].find('>').map(|n| start + n)?;
        let tag = &text[start..end];
        let local = tag.rsplit(':').next().unwrap_or(tag).trim();
        if local == name {
            return Some(end + 1);
        }
        at = end + 1;
    }
    None
}

/// 元素开始标签里的属性值。
pub(crate) fn attr(element: &str, name: &str) -> Option<String> {
    let head = &element[..element.find('>').unwrap_or(element.len())];
    let mut at = 0;
    while let Some(offset) = head[at..].find(name) {
        let start = at + offset;
        let before_ok = start > 0 && head.as_bytes()[start - 1].is_ascii_whitespace();
        let rest = head[start + name.len()..].trim_start();
        if before_ok && rest.starts_with('=') {
            let rest = rest[1..].trim_start();
            let quote = rest.chars().next()?;
            if quote == '"' || quote == '\'' {
                let value = &rest[1..];
                return value.find(quote).map(|end| unescape(&value[..end]));
            }
        }
        at = start + name.len();
    }
    None
}

/// 第一个本地名为 `name` 的子元素的文本（去掉首尾空白）。
pub(crate) fn child_text(element: &str, name: &str) -> Option<String> {
    let (_, after_name) = find_open(element, name, 1)?;
    let gt = element[after_name..].find('>').map(|n| after_name + n)?;
    if element.as_bytes()[gt - 1] == b'/' {
        return None;
    }
    let close = element[gt + 1..].find("</").map(|n| gt + 1 + n)?;
    let text = element[gt + 1..close].trim();
    let text = text
        .strip_prefix("<![CDATA[")
        .and_then(|t| t.strip_suffix("]]>"))
        .unwrap_or(text);
    (!text.is_empty()).then(|| unescape(text))
}

pub(crate) fn number(text: Option<String>) -> Option<f64> {
    text?.trim().parse::<f64>().ok().filter(|v| v.is_finite())
}

pub(crate) fn unescape(text: &str) -> String {
    if !text.contains('&') {
        return text.to_string();
    }
    text.replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&apos;", "'")
        .replace("&#39;", "'")
        .replace("&amp;", "&")
}

/// GPX / TCX 的时间（RFC 3339），以及 Apple 健康的 `2023-01-01 07:00:00 +0800`。
pub(crate) fn parse_time(text: &str) -> Option<DateTime<Utc>> {
    let text = text.trim();
    if let Ok(time) = DateTime::parse_from_rfc3339(text) {
        return Some(time.with_timezone(&Utc));
    }
    if let Ok(time) = DateTime::parse_from_str(text, "%Y-%m-%d %H:%M:%S %z") {
        return Some(time.with_timezone(&Utc));
    }
    // 不带时区的一律当 UTC（GPX 规范要求 UTC）。
    NaiveDateTime::parse_from_str(text, "%Y-%m-%dT%H:%M:%S%.f")
        .ok()
        .map(|time| time.and_utc())
}
