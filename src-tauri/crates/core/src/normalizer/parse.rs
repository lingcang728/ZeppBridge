//! 取值与解析的小工具：字段别名、数字、时间戳、日期与时区（从 normalizer/mod.rs 拆出）。

use super::*;

pub(super) fn decode_base64_json(encoded: &str) -> Result<Value> {
    let bytes = STANDARD
        .decode(encoded.trim())
        .map_err(|error| ZeppBridgeError::ParseError(format!("Base64 无效: {error}")))?;
    serde_json::from_slice(&bytes)
        .map_err(|error| ZeppBridgeError::ParseError(format!("Base64 内容不是 JSON: {error}")))
}

pub(super) fn extract_items(raw: &Value) -> Result<Vec<&Value>> {
    if let Some(items) = raw.as_array() {
        if items.is_empty() {
            return Err(ZeppBridgeError::DataUnavailable("响应 items 为空".into()));
        }
        return Ok(items.iter().collect());
    }
    let Some(object) = raw.as_object() else {
        return Err(ZeppBridgeError::ParseError(
            "响应必须是 object 或 array".into(),
        ));
    };
    for key in ["items", "records", "results", "list"] {
        if let Some(array) = object.get(key).and_then(Value::as_array) {
            if array.is_empty() {
                return Err(ZeppBridgeError::DataUnavailable(format!("响应 {key} 为空")));
            }
            return Ok(array.iter().collect());
        }
    }
    if let Some(data) = object.get("data") {
        if let Some(array) = data.as_array() {
            if array.is_empty() {
                return Err(ZeppBridgeError::DataUnavailable("响应 data 为空".into()));
            }
            return Ok(array.iter().collect());
        }
        if let Some(data_object) = data.as_object() {
            for key in ["items", "records", "results", "list", "summary"] {
                if let Some(array) = data_object.get(key).and_then(Value::as_array) {
                    if array.is_empty() {
                        return Err(ZeppBridgeError::DataUnavailable(format!(
                            "响应 data.{key} 为空"
                        )));
                    }
                    return Ok(array.iter().collect());
                }
            }
        }
        if data.is_string() {
            return Err(ZeppBridgeError::DataUnavailable(
                "响应 data 是编码字符串，无法安全完整解码".into(),
            ));
        }
    }
    Err(ZeppBridgeError::ParseError(format!(
        "响应缺少 items/data 数组，可用字段: {}",
        object.keys().cloned().collect::<Vec<_>>().join(", ")
    )))
}

pub(super) fn item_object(value: &Value) -> Option<&Map<String, Value>> {
    let object = value.as_object()?;
    object
        .get("value")
        .and_then(Value::as_object)
        .filter(|nested| {
            nested.keys().any(|key| {
                matches!(
                    key.as_str(),
                    "timestamp" | "time" | "value" | "heartRate" | "steps" | "date"
                )
            })
        })
        .unwrap_or(object)
        .into()
}

pub(super) fn first_value<'a>(object: &'a Map<String, Value>, names: &[&str]) -> Option<&'a Value> {
    names
        .iter()
        .filter_map(|name| object.get(*name))
        .find(|value| {
            !value.is_null() && !value.as_str().is_some_and(|text| text.trim().is_empty())
        })
}

pub(super) fn first_value_from<'a>(
    object: &'a Map<String, Value>,
    nested: Option<&'a Map<String, Value>>,
    names: &[&str],
) -> Option<&'a Value> {
    first_value(object, names).or_else(|| nested.and_then(|value| first_value(value, names)))
}

pub(super) fn first_string(object: &Map<String, Value>, names: &[&str]) -> Option<String> {
    names
        .iter()
        .filter_map(|name| object.get(*name))
        .find_map(|value| match value {
            Value::String(value) if !value.trim().is_empty() => Some(value.clone()),
            Value::Number(value) => Some(value.to_string()),
            _ => None,
        })
}

/// 解析云端的 `heart_range`：心率区间分布。
///
/// 格式是分号分隔的 `秒数,区间上限`，例如
/// `1882,113;3486,141;10,154;0,162;0,173;0,190`——在 113 以下待了 1882 秒，
/// 113 到 141 之间 3486 秒，依此类推。区间边界来自用户在表上的设定，我们没有
/// 那份设定，所以这个分布只能取云端的，自己切会切出另一套数字。
///
/// 各段秒数之和实测能对上 `run_time`（一次健走 5378 vs 5403）。
///
/// 全零的分布（每一段都是 0 秒）返回空：那是「这次运动没有心率数据」，不是
/// 「每个区间都待了 0 秒」。
pub(super) fn parse_heart_range(raw: Option<&str>) -> Vec<HeartRateZoneBucket> {
    let Some(text) = raw else {
        return Vec::new();
    };
    let mut buckets = Vec::new();
    for (index, part) in text.split(';').enumerate() {
        let mut bits = part.split(',');
        let (Some(seconds), Some(upper)) = (bits.next(), bits.next()) else {
            continue;
        };
        let (Ok(seconds), Ok(upper)) = (seconds.trim().parse::<i64>(), upper.trim().parse::<i32>())
        else {
            continue;
        };
        if seconds < 0 || upper <= 0 {
            continue;
        }
        buckets.push(HeartRateZoneBucket {
            index: index as i32,
            upper_bound_bpm: upper,
            seconds,
        });
    }
    if buckets.iter().all(|bucket| bucket.seconds == 0) {
        return Vec::new();
    }
    buckets
}

pub(super) fn add_milliseconds(base: DateTime<Utc>, offset_ms: i64) -> Option<DateTime<Utc>> {
    Duration::try_milliseconds(offset_ms).and_then(|delta| base.checked_add_signed(delta))
}

pub(super) fn add_minutes(base: DateTime<Utc>, minutes: i64) -> Option<DateTime<Utc>> {
    Duration::try_minutes(minutes).and_then(|delta| base.checked_add_signed(delta))
}

pub(super) fn first_number(object: &Map<String, Value>, names: &[&str]) -> Option<f64> {
    names
        .iter()
        .filter_map(|name| object.get(*name))
        .find_map(parse_number)
}

pub(super) fn first_number_from(
    object: &Map<String, Value>,
    nested: Option<&Map<String, Value>>,
    names: &[&str],
) -> Option<f64> {
    first_number(object, names).or_else(|| nested.and_then(|value| first_number(value, names)))
}

pub(super) fn parse_number(value: &Value) -> Option<f64> {
    let number = match value {
        Value::Number(number) => number.as_f64()?,
        Value::String(text) => text.trim().parse::<f64>().ok()?,
        _ => return None,
    };
    number.is_finite().then_some(number)
}

pub(super) fn parse_timestamp(value: &Value) -> Option<DateTime<Utc>> {
    let number = parse_number(value)?;
    if !number.is_finite() {
        return None;
    }
    // Zepp event payloads sometimes carry the calendar day as a compact
    // integer (`dayId: 20260812`).  Guard against interpreting such values
    // as epoch seconds, which would silently produce dates in 1970.
    // 数字本身就是本地日历日；缺时区时保持 UTC 零点，不编一个偏移。
    // 有 `timeZone` 的切日走 `summary_date` / `parse_date_with_zone`。
    let compact = number as i64;
    if (19000101..=21001231).contains(&compact) {
        return NaiveDate::parse_from_str(&format!("{compact}"), "%Y%m%d")
            .ok()
            .and_then(|date| date.and_hms_opt(0, 0, 0))
            .map(|naive| DateTime::<Utc>::from_naive_utc_and_offset(naive, Utc));
    }
    if number.abs() >= 10_000_000_000.0 {
        DateTime::from_timestamp_millis(number as i64)
    } else {
        DateTime::from_timestamp(number as i64, 0)
    }
}

pub(super) fn parse_timestamp_or_date(value: &Value) -> Option<DateTime<Utc>> {
    parse_timestamp(value).or_else(|| {
        let date = value.as_str()?;
        let date = NaiveDate::parse_from_str(date, "%Y-%m-%d").ok()?;
        Some(DateTime::<Utc>::from_naive_utc_and_offset(
            date.and_hms_opt(0, 0, 0)?,
            Utc,
        ))
    })
}

pub(super) fn parse_date(value: &Value) -> Option<String> {
    if let Some(text) = value.as_str() {
        if NaiveDate::parse_from_str(text, "%Y-%m-%d").is_ok() {
            return Some(text.to_owned());
        }
        if let Ok(dt) = DateTime::parse_from_rfc3339(text) {
            return Some(dt.date_naive().format("%Y-%m-%d").to_string());
        }
    }
    if let Some(number) = parse_number(value) {
        let compact = number as i64;
        if (19000101..=21001231).contains(&compact) {
            return NaiveDate::parse_from_str(&format!("{compact}"), "%Y%m%d")
                .ok()
                .map(|date| date.format("%Y-%m-%d").to_string());
        }
    }
    parse_timestamp(value).map(|dt| dt.format("%Y-%m-%d").to_string())
}

pub(super) fn parse_date_with_zone(value: &Value, offset_secs: Option<i64>) -> Option<String> {
    // Numeric strings are epochs too; retain the event's timezone when
    // assigning meals (and other daily metrics) to a calendar day.
    if value.as_str().is_some() && parse_number(value).is_none() {
        return parse_date(value);
    }
    if let Some(number) = parse_number(value) {
        let compact = number as i64;
        if (19000101..=21001231).contains(&compact) {
            return parse_date(value);
        }
        let utc = parse_timestamp(value)?;
        let local = match offset_secs {
            Some(secs) => utc.checked_add_signed(Duration::seconds(secs))?,
            None => utc,
        };
        return Some(local.format("%Y-%m-%d").to_string());
    }
    parse_date(value)
}

pub(super) fn summary_date(
    object: &Map<String, Value>,
    nested: Option<&Map<String, Value>>,
) -> Option<String> {
    if let Some(value) = first_value_from(
        object,
        nested,
        &["date", "day", "dayId", "dateString", "localDate"],
    ) {
        return parse_date(value);
    }
    let value = first_value_from(object, nested, &["timestamp", "time", "startTime"])?;
    let zone = first_value_from(object, nested, &["timeZone", "time_zone", "tz"]);
    // 时区是带夏令时的 IANA 名（Europe/Berlin、America/New_York……）时，固定偏移表里
    // 没有它：以前就退回 UTC，欧美用户的 Charge / 准备度 / 每日概览整体落到前一天。
    // 按事件那一刻的规则算本地日期（和 food.rs 的餐次切日同一个做法）。
    if let Some(zone) = zone.filter(|zone| timezone_offset_seconds(zone).is_none()) {
        if is_epoch_value(value) {
            if let Some(date) = parse_timestamp(value).and_then(|at| iana_local_date(zone, at)) {
                return Some(date);
            }
        }
    }
    parse_date_with_zone(value, zone.and_then(timezone_offset_seconds))
}

/// Canonical 按插入覆盖：有明确日历日的条目必须排在 epoch 回退之后，
/// 否则 date-only 永远被 UTC 切日的 timestamp 盖掉。
pub(super) fn daily_summary_sort_key(item: &Value) -> (u8, i64) {
    let Some(object) = item.as_object() else {
        return (0, 0);
    };
    let nested = object.get("value").and_then(Value::as_object);
    let calendar = ["date", "day", "dayId", "dateString", "localDate"];
    let explicit = first_value_from(object, nested, &calendar).is_some()
        || nested
            .and_then(|value| value.get("samples"))
            .and_then(Value::as_array)
            .is_some_and(|samples| {
                samples.iter().any(|sample| {
                    sample
                        .as_object()
                        .is_some_and(|object| first_value(object, &calendar).is_some())
                })
            });
    let timestamp = first_number_from(object, nested, &["timestamp", "time", "startTime"])
        .map(|value| value.round() as i64)
        .unwrap_or(0);
    (u8::from(explicit), timestamp)
}

/// 是不是一个时间戳（而不是日期字符串、也不是 20260930 这种紧凑日期）。
fn is_epoch_value(value: &Value) -> bool {
    match parse_number(value) {
        Some(number) => !(19000101..=21001231).contains(&(number as i64)),
        None => false,
    }
}

/// 时区字段里的 IANA 名（可能写成 `"1,Europe/Berlin"`）在 `instant` 那一刻的本地日期。
pub(super) fn iana_local_date(zone: &Value, instant: DateTime<Utc>) -> Option<String> {
    let name = zone.as_str()?.rsplit(',').next()?.trim();
    if name.is_empty() {
        return None;
    }
    let zone = jiff::tz::TimeZone::get(name).ok()?;
    let timestamp = jiff::Timestamp::from_second(instant.timestamp()).ok()?;
    Some(timestamp.to_zoned(zone).date().to_string())
}

pub(super) fn timezone_offset_seconds(value: &Value) -> Option<i64> {
    match value {
        Value::Number(_) => parse_number(value).and_then(offset_from_number),
        Value::String(text) => parse_timezone_text(text),
        _ => None,
    }
}

pub(super) fn offset_from_number(value: f64) -> Option<i64> {
    if !value.is_finite() {
        return None;
    }
    let raw = value.round() as i64;
    let seconds = if raw.abs() > 18 * 3600 {
        if raw % 1000 != 0 {
            return None;
        }
        raw / 1000
    } else {
        raw
    };
    // 真实时区偏移是 15 分钟的倍数。"32" 这种设备时区序号不能当成 32 秒。
    if seconds % 900 != 0 {
        return None;
    }
    (-18 * 3600..=18 * 3600)
        .contains(&seconds)
        .then_some(seconds)
}

pub(super) fn parse_timezone_text(text: &str) -> Option<i64> {
    let text = text.trim();
    if text.is_empty() {
        return None;
    }
    if let Some((left, right)) = text.split_once(',') {
        return parse_timezone_text(left).or_else(|| parse_timezone_text(right));
    }
    if let Ok(number) = text.parse::<f64>() {
        return offset_from_number(number);
    }
    let clock = text
        .strip_prefix("GMT")
        .or_else(|| text.strip_prefix("Utc"))
        .or_else(|| text.strip_prefix("UTC"))
        .or_else(|| text.strip_prefix("gmt"))
        .unwrap_or(text);
    parse_offset_clock(clock).or_else(|| iana_fixed_offset(text))
}

pub(super) fn parse_offset_clock(text: &str) -> Option<i64> {
    let text = text.trim();
    let (sign, rest) = if let Some(rest) = text.strip_prefix('+') {
        (1_i64, rest)
    } else {
        let rest = text.strip_prefix('-')?;
        (-1, rest)
    };
    let (hours, minutes) = if let Some((hours, minutes)) = rest.split_once(':') {
        (hours.parse::<i64>().ok()?, minutes.parse::<i64>().ok()?)
    } else if rest.len() == 4 && rest.chars().all(|ch| ch.is_ascii_digit()) {
        (
            rest[..2].parse::<i64>().ok()?,
            rest[2..].parse::<i64>().ok()?,
        )
    } else {
        (rest.parse::<i64>().ok()?, 0)
    };
    if !(0..=18).contains(&hours) || !(0..60).contains(&minutes) {
        return None;
    }
    let seconds = sign * (hours * 3600 + minutes * 60);
    (seconds % 900 == 0).then_some(seconds)
}

pub(super) fn iana_fixed_offset(name: &str) -> Option<i64> {
    // 只收录没有夏令时、偏移全年固定的区。有 DST 的名字宁可不套，也不编一个偏移。
    match name {
        "Asia/Shanghai" | "Asia/Hong_Kong" | "Asia/Taipei" | "Asia/Chongqing" | "Asia/Harbin"
        | "PRC" | "Hongkong" => Some(8 * 3600),
        "Asia/Tokyo" | "Asia/Seoul" | "Japan" => Some(9 * 3600),
        "UTC" | "Etc/UTC" | "Etc/GMT" | "GMT" | "Zulu" => Some(0),
        _ => None,
    }
}

pub(super) fn timestamp_not_unreasonably_future(timestamp: DateTime<Utc>) -> bool {
    if timestamp.year() > 2100 {
        return false;
    }
    match Utc::now().checked_add_signed(Duration::days(1)) {
        Some(limit) => timestamp <= limit,
        None => true,
    }
}
