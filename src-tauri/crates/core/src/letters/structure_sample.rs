//! 随信附上的「运动结构样本」：一次运动在库里存的原始报文（摘要、明细、逐趟），
//! 留下字段名、嵌套和类型，以及解码要用的非个人数值，其余一律换掉或删掉。
//!
//! 用途是认没见过的运动报文（比如泳池游泳的逐趟泳姿、池边休息、划水次数）：我们手上没有
//! 真实原始数据时只能猜字段，用户从信纸寄一份样本，就能照着结构写解码。
//!
//! 规则白名单优先，按字段名（小写、去掉 `_` / `-`）判断：
//! - **删除**：坐标、轨迹、地点、天气，账号、设备序列号、MAC、令牌这类标识。整个字段去掉。
//! - **平移**：开始 / 结束 / 创建时间这类绝对时刻，整体平移到 2000-01-01，相对间隔不变。
//! - **保留**：泳姿编码、池长、趟数、划水次数、距离、时长、各类枚举和版本号。
//!   `lap` 逐行保留各列，只把已知的心率列（第 5 列）换成 0。
//! - **其余全部替换**：数值换成同类型的 0；字符串里装着 JSON 的照同样规则递归；
//!   数字串（`差值,读数;…`）保留每行第一列的时间差、读数换成 0；认不出的字符串换成 `<text>`。
//!
//! 生成的样本先给用户看，再随信上传（`functions/api/letters` 的附件接口，存作者的私有 R2）。

use serde::Serialize;
use serde_json::{Map, Number, Value};
use std::collections::BTreeSet;

/// 样本 JSON 的格式标记。服务端只认这一种 JSON 附件。
pub const STRUCTURE_SAMPLE_FORMAT: &str = "zeppbridge.workout-structure-sample.v1";
/// 一份样本的上限（UTF-8 字节）。和服务端 `SAMPLE_MAX_BYTES` 一致。
pub const STRUCTURE_SAMPLE_MAX_BYTES: usize = 1024 * 1024;
/// 平移后的开始时刻：2000-01-01T00:00:00Z。
pub const STRUCTURE_SAMPLE_EPOCH: i64 = 946_684_800;
/// 记下删了哪些字段，最多列这么多条。
const DROPPED_LIST_MAX: usize = 200;
/// 递归上限：报文里嵌套再深也不会无限下去。
const MAX_DEPTH: usize = 32;
/// 认不出的字符串一律换成这个。
pub const REDACTED_TEXT: &str = "<text>";

/// 一份样本里的一段原始报文。
#[derive(Debug, Clone, PartialEq)]
pub struct SamplePart {
    /// `summary`（运动列表里的那一条）或 `detail`（明细、分段、逐趟）。
    pub part: &'static str,
    /// `legacy`（高级数据通道）或 `official`（官方开放平台）。
    pub channel: &'static str,
    pub payload: Value,
}

/// 生成好的样本：`json` 就是随信上传的那份，其余字段给界面预览用。
#[derive(Debug, Clone, Serialize)]
pub struct StructureSample {
    pub workout_id: String,
    /// 真实开始时间：只给界面标出是哪一次，不进样本。
    pub start_time: String,
    pub workout_type: String,
    pub json: String,
    pub bytes: usize,
    pub parts: Vec<String>,
    pub dropped_fields: Vec<String>,
    pub masked_values: usize,
    pub shifted_times: usize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Rule {
    Drop,
    Time,
    Keep,
    Lap,
    Mask,
}

/// 字段名归一：小写、去掉 `_` 和 `-`。`swim_pool_length` 和 `swimPoolLength` 是同一个。
fn normalize_key(key: &str) -> String {
    key.chars()
        .filter(|ch| *ch != '_' && *ch != '-')
        .flat_map(char::to_lowercase)
        .collect()
}

/// 名字里带这些片段的字段整个删掉：坐标、轨迹、地点、天气。
const DROP_FRAGMENTS: &[&str] = &[
    "longitude",
    "latitude",
    "latlng",
    "lnglat",
    "geohash",
    "gps",
    "location",
    "coordinate",
    "address",
    "country",
    "province",
    "district",
    "weather",
    "token",
    "secret",
    "password",
    "cookie",
    "serial",
    "imei",
    "email",
    "phone",
];

/// 名字正好是这些的字段整个删掉：设备、账号和第三方标识，时区（能推出大概在哪）。
const DROP_EXACT: &[&str] = &[
    "sn",
    "city",
    "mac",
    "macaddress",
    "deviceid",
    "binddevice",
    "userid",
    "uid",
    "huamiid",
    "accountid",
    "appname",
    "gearid",
    "thirdpartyworkoutid",
    "thirdpartydatasource",
    "syncedtimezone",
    "timezone",
    "tz",
    "bearing",
    "course",
    "accuracy",
    "nickname",
    "username",
];

/// 绝对时刻：平移到 2000-01-01。
const TIME_EXACT: &[&str] = &[
    "trackid",
    "parenttrackid",
    "starttime",
    "endtime",
    "begintime",
    "createtime",
    "updatetime",
    "timestamp",
    "starttimestamp",
    "endtimestamp",
];

/// 解码要用的非个人数值：运动与泳姿编码、池长、趟数、划水、距离、时长、各类枚举。
const KEEP_EXACT: &[&str] = &[
    "code",
    "message",
    "version",
    "provider",
    "type",
    "sporttype",
    "sportmode",
    "subtype",
    "swimstyle",
    "swimpoollength",
    "poollength",
    "totaltrips",
    "trips",
    "totalstrokes",
    "strokes",
    "swolf",
    "avgdistanceperstroke",
    "avgstrokespeed",
    "maxstrokespeed",
    "strokespeed",
    "poolstrokespeed",
    "poolswimpace",
    "freestylelength",
    "breaststrokelength",
    "backstrokelength",
    "butterflylength",
    "medleylength",
    "otherstrokelength",
    "kicklength",
    "lapdistance",
    "numberofbreak",
    "dis",
    "distance",
    "highprecisiondistance",
    "runtime",
    "totaltimewithmillis",
    "exercisetimewithmillis",
    "pausetimewithmillis",
    "pausetime",
    "pause",
    "resttime",
    "resttimebetweengroupswithmillis",
    "time",
    "unit",
    "massunittype",
    "displaytype",
    "targettype",
    "heartratesettingtype",
    "runningtype",
    "autorecognition",
    "needfusion",
    "fusionsuccess",
    "totalgroup",
    "feature",
    "trackpointtype",
    "childlist",
    "strengthsets",
    "strengthtraininggroup",
    "strengthassess",
    "memo",
    "groupmemos",
    "actionid",
    "actioncode",
    "reps",
    "sets",
    "avgpace",
    "maxpace",
    "minpace",
];

fn rule_for(key: &str) -> Rule {
    let key = normalize_key(key);
    if DROP_EXACT.contains(&key.as_str())
        || DROP_FRAGMENTS.iter().any(|fragment| key.contains(fragment))
    {
        return Rule::Drop;
    }
    if TIME_EXACT.contains(&key.as_str()) {
        return Rule::Time;
    }
    if key == "lap" {
        return Rule::Lap;
    }
    if KEEP_EXACT.contains(&key.as_str()) {
        return Rule::Keep;
    }
    Rule::Mask
}

/// 一次运动的样本生成器：记着时间平移量和删改计数。
struct Sanitizer {
    /// 真实开始时刻 − 2000-01-01（秒）。
    shift_seconds: i64,
    dropped: BTreeSet<String>,
    masked: usize,
    shifted: usize,
}

impl Sanitizer {
    fn new(start_epoch: i64) -> Self {
        Self {
            shift_seconds: start_epoch - STRUCTURE_SAMPLE_EPOCH,
            dropped: BTreeSet::new(),
            masked: 0,
            shifted: 0,
        }
    }

    /// 像绝对时刻的数（秒：2001–5138 年；毫秒同理）就平移，返回 `None` 表示不像。
    fn shift_epoch(&mut self, value: i64) -> Option<i64> {
        let shifted = if (1_000_000_000..100_000_000_000).contains(&value) {
            value - self.shift_seconds
        } else if (1_000_000_000_000..100_000_000_000_000).contains(&value) {
            value - self.shift_seconds * 1000
        } else {
            return None;
        };
        self.shifted += 1;
        Some(shifted)
    }

    fn shift_rfc3339(&mut self, text: &str) -> Option<String> {
        let parsed = chrono::DateTime::parse_from_rfc3339(text).ok()?;
        self.shifted += 1;
        let moved = parsed - chrono::Duration::seconds(self.shift_seconds);
        Some(moved.to_rfc3339())
    }

    fn object(&mut self, map: &Map<String, Value>, path: &str, depth: usize) -> Map<String, Value> {
        let mut out = Map::new();
        for (key, value) in map {
            let here = if path.is_empty() {
                key.clone()
            } else {
                format!("{path}.{key}")
            };
            match rule_for(key) {
                Rule::Drop => {
                    if self.dropped.len() < DROPPED_LIST_MAX {
                        self.dropped.insert(strip_indices(&here));
                    }
                }
                Rule::Time => {
                    out.insert(key.clone(), self.time_value(value));
                }
                Rule::Lap => {
                    out.insert(key.clone(), self.lap_value(value, &here, depth));
                }
                Rule::Keep => {
                    out.insert(key.clone(), self.keep_value(value, &here, depth));
                }
                Rule::Mask => {
                    out.insert(key.clone(), self.mask_value(value, &here, depth));
                }
            }
        }
        out
    }

    fn time_value(&mut self, value: &Value) -> Value {
        match value {
            Value::Number(number) => match number.as_i64().and_then(|n| self.shift_epoch(n)) {
                Some(moved) => Value::Number(moved.into()),
                None => value.clone(),
            },
            Value::String(text) => {
                let trimmed = text.trim();
                if let Some(moved) = trimmed
                    .parse::<i64>()
                    .ok()
                    .and_then(|n| self.shift_epoch(n))
                {
                    return Value::String(moved.to_string());
                }
                if let Some(moved) = self.shift_rfc3339(trimmed) {
                    return Value::String(moved);
                }
                if trimmed.is_empty() || trimmed == "0" {
                    return value.clone();
                }
                self.masked += 1;
                Value::String(REDACTED_TEXT.into())
            }
            _ => value.clone(),
        }
    }

    /// 白名单字段：数值原样（像时刻的照样平移），字符串里的 JSON 递归、数字串原样，短的代码串原样。
    fn keep_value(&mut self, value: &Value, path: &str, depth: usize) -> Value {
        match value {
            Value::Number(number) => match number.as_i64().and_then(|n| self.shift_epoch(n)) {
                Some(moved) => Value::Number(moved.into()),
                None => value.clone(),
            },
            Value::String(text) => {
                if let Some(nested) = self.embedded_json(text, path, depth) {
                    return nested;
                }
                if is_numeric_list(text) {
                    return Value::String(self.shift_list_tokens(text));
                }
                if is_code_token(text) {
                    return value.clone();
                }
                self.masked += 1;
                Value::String(REDACTED_TEXT.into())
            }
            Value::Array(items) => Value::Array(
                items
                    .iter()
                    .map(|item| self.keep_value(item, path, depth + 1))
                    .collect(),
            ),
            Value::Object(map) => self.nested(map, path, depth),
            _ => value.clone(),
        }
    }

    /// 逐趟 / 分圈：`序号,累计秒,距离,…,心率,…;` 一行一趟。各列原样，第 5 列（平均心率）换成 0。
    fn lap_value(&mut self, value: &Value, path: &str, depth: usize) -> Value {
        let Value::String(text) = value else {
            return self.keep_value(value, path, depth);
        };
        if let Some(nested) = self.embedded_json(text, path, depth) {
            return nested;
        }
        let rows: Vec<String> = text
            .split(';')
            .map(|row| {
                row.split(',')
                    .enumerate()
                    .map(|(column, cell)| {
                        if column == 4 && cell.trim().parse::<f64>().is_ok() {
                            self.masked += 1;
                            "0".to_string()
                        } else {
                            self.shift_cell(cell)
                        }
                    })
                    .collect::<Vec<_>>()
                    .join(",")
            })
            .collect();
        Value::String(rows.join(";"))
    }

    /// 其余字段：同类型的占位值。
    fn mask_value(&mut self, value: &Value, path: &str, depth: usize) -> Value {
        match value {
            Value::Number(number) => {
                self.masked += 1;
                if number.is_f64() {
                    Value::Number(Number::from_f64(0.0).unwrap_or_else(|| 0.into()))
                } else {
                    Value::Number(0.into())
                }
            }
            Value::String(text) => {
                if text.is_empty() {
                    return value.clone();
                }
                if let Some(nested) = self.embedded_json(text, path, depth) {
                    return nested;
                }
                if let Some(moved) = self.shift_rfc3339(text.trim()) {
                    return Value::String(moved);
                }
                self.masked += 1;
                if is_numeric_list(text) {
                    return Value::String(mask_numeric_list(text));
                }
                Value::String(REDACTED_TEXT.into())
            }
            Value::Array(items) => Value::Array(
                items
                    .iter()
                    .map(|item| self.mask_value(item, path, depth + 1))
                    .collect(),
            ),
            Value::Object(map) => self.nested(map, path, depth),
            // 布尔和空值只是开关，不是读数。
            _ => value.clone(),
        }
    }

    fn nested(&mut self, map: &Map<String, Value>, path: &str, depth: usize) -> Value {
        if depth >= MAX_DEPTH {
            self.masked += 1;
            return Value::Object(Map::new());
        }
        Value::Object(self.object(map, path, depth + 1))
    }

    /// 字符串里装着 JSON（`"strengthSets": "[{…}]"`）：按同样的规则处理里面，再写回字符串，
    /// 「字符串里装 JSON」这层类型也留着。
    fn embedded_json(&mut self, text: &str, path: &str, depth: usize) -> Option<Value> {
        let trimmed = text.trim();
        if !(trimmed.starts_with('{') || trimmed.starts_with('[')) || depth >= MAX_DEPTH {
            return None;
        }
        let parsed: Value = serde_json::from_str(trimmed).ok()?;
        let cleaned = match &parsed {
            Value::Object(map) => Value::Object(self.object(map, path, depth + 1)),
            Value::Array(items) => Value::Array(
                items
                    .iter()
                    .map(|item| match item {
                        Value::Object(map) => Value::Object(self.object(map, path, depth + 1)),
                        other => self.mask_value(other, path, depth + 1),
                    })
                    .collect(),
            ),
            _ => return None,
        };
        Some(Value::String(cleaned.to_string()))
    }

    fn shift_cell(&mut self, cell: &str) -> String {
        match cell
            .trim()
            .parse::<i64>()
            .ok()
            .and_then(|n| self.shift_epoch(n))
        {
            Some(moved) => moved.to_string(),
            None => cell.to_string(),
        }
    }

    fn shift_list_tokens(&mut self, text: &str) -> String {
        let mut out = String::with_capacity(text.len());
        let mut token = String::new();
        for ch in text.chars() {
            if ch.is_ascii_digit() || ch == '-' || ch == '.' {
                token.push(ch);
            } else {
                out.push_str(&self.shift_cell(&token));
                token.clear();
                out.push(ch);
            }
        }
        out.push_str(&self.shift_cell(&token));
        out
    }
}

/// 路径里的数组下标不记（`laps.3.hr` 和 `laps.4.hr` 是同一个字段）。
fn strip_indices(path: &str) -> String {
    path.split('.')
        .filter(|part| !part.chars().all(|ch| ch.is_ascii_digit()))
        .collect::<Vec<_>>()
        .join(".")
}

/// 只由数字和分隔符组成：差分串、逐点序列、区间边界。
fn is_numeric_list(text: &str) -> bool {
    !text.is_empty()
        && text.chars().any(|ch| ch.is_ascii_digit())
        && text.chars().all(|ch| {
            ch.is_ascii_digit()
                || matches!(
                    ch,
                    '-' | '.' | ',' | ';' | ':' | '|' | ' ' | 'e' | 'E' | '+'
                )
        })
}

/// 短的代码串（`success`、`zpp`、`s00000000000`）：只有字母、数字和少数符号，不像人写的字。
fn is_code_token(text: &str) -> bool {
    text.len() <= 24
        && text
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '_' | '.' | '-' | ':'))
        // 长串纯数字可能是编号，不当代码留着。
        && !(text.len() > 6 && text.chars().all(|ch| ch.is_ascii_digit()))
}

/// 数字串里的读数换成 0：`;` 分行的逐点序列，每行第一列是时间差，留着；没有 `;` 的（区间边界、
/// 单个读数）全部换成 0。
fn mask_numeric_list(text: &str) -> String {
    if text.contains(';') {
        text.split(';')
            .map(|row| {
                let cells: Vec<&str> = row.split(',').collect();
                if cells.len() < 2 {
                    return zero_tokens(row);
                }
                let mut out = vec![cells[0].to_string()];
                out.extend(cells[1..].iter().map(|cell| zero_tokens(cell)));
                out.join(",")
            })
            .collect::<Vec<_>>()
            .join(";")
    } else {
        zero_tokens(text)
    }
}

fn zero_tokens(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut in_number = false;
    for ch in text.chars() {
        if ch.is_ascii_digit() || ch == '.' {
            if !in_number {
                out.push('0');
                in_number = true;
            }
        } else {
            in_number = false;
            out.push(ch);
        }
    }
    out
}

/// 把一次运动的几段原始报文做成样本。`start_epoch` 是这次运动的真实开始时刻（秒）。
pub fn build_structure_sample(
    workout_id: &str,
    start_time: &str,
    start_epoch: i64,
    workout_type: &str,
    zepp_type: Option<i64>,
    app_version: &str,
    parts: &[SamplePart],
) -> StructureSample {
    let mut sanitizer = Sanitizer::new(start_epoch);
    let cleaned: Vec<Value> = parts
        .iter()
        .map(|part| {
            let payload = match &part.payload {
                Value::Object(map) => Value::Object(sanitizer.object(map, part.part, 0)),
                other => sanitizer.mask_value(other, part.part, 0),
            };
            serde_json::json!({ "part": part.part, "channel": part.channel, "payload": payload })
        })
        .collect();
    let dropped: Vec<String> = sanitizer.dropped.iter().cloned().collect();
    let document = serde_json::json!({
        "format": STRUCTURE_SAMPLE_FORMAT,
        "appVersion": app_version,
        "workout": { "workoutType": workout_type, "zeppType": zepp_type },
        "timeBase": "2000-01-01T00:00:00Z",
        "rules": "Field names, nesting and types are kept. Coordinates, places, weather and device or account identifiers are removed. Absolute times are shifted so the workout starts at timeBase. Sport and stroke codes, pool length, lap rows (except the heart-rate column), distances and durations are kept; every other value is replaced with a placeholder of the same type.",
        "redactions": {
            "droppedFields": dropped,
            "maskedValues": sanitizer.masked,
            "shiftedTimes": sanitizer.shifted,
        },
        "parts": cleaned,
    });
    let json = serde_json::to_string_pretty(&document).unwrap_or_else(|_| "{}".into());
    StructureSample {
        workout_id: workout_id.to_string(),
        start_time: start_time.to_string(),
        workout_type: workout_type.to_string(),
        bytes: json.len(),
        json,
        parts: parts.iter().map(|part| part.part.to_string()).collect(),
        dropped_fields: dropped,
        masked_values: sanitizer.masked,
        shifted_times: sanitizer.shifted,
    }
}

/// 上传前再看一眼：是不是我们自己生成的那种样本、有没有超过上限。
pub fn is_structure_sample(bytes: &[u8]) -> bool {
    bytes.len() <= STRUCTURE_SAMPLE_MAX_BYTES
        && serde_json::from_slice::<Value>(bytes)
            .ok()
            .and_then(|value| {
                value
                    .get("format")
                    .and_then(Value::as_str)
                    .map(str::to_owned)
            })
            .is_some_and(|format| format == STRUCTURE_SAMPLE_FORMAT)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    const START: i64 = 1_790_000_000;

    fn sample(parts: Vec<SamplePart>) -> (StructureSample, Value) {
        let sample = build_structure_sample(
            "w-1",
            "2026-09-21T10:00:00+00:00",
            START,
            "swim",
            Some(14),
            "9.9.9",
            &parts,
        );
        let value: Value = serde_json::from_str(&sample.json).unwrap();
        (sample, value)
    }

    fn fake_swim_summary() -> Value {
        json!({
            "trackid": START.to_string(),
            "end_time": (START + 2400).to_string(),
            "createTime": START * 1000 + 5,
            "type": 14,
            "swim_style": 1,
            "swim_pool_length": 25,
            "total_trips": 40,
            "total_strokes": 812,
            "dis": "1000",
            "run_time": "2400",
            "avg_heart_rate": "131.5",
            "max_heart_rate": 158,
            "calorie": "320",
            "weight": 61.5,
            "location": "39.900000,116.400000",
            "city": "Somewhere",
            "deviceid": "ABCDEF0123456789",
            "sn": "SN0123456789",
            "bind_device": "11:22:33:44:55:66",
            "syncedTimezone": "Europe/Berlin",
            "sportNotes": "felt tired after work",
            "heart_range": "113,141,154,162,173,190",
            "auto_recognition": true,
        })
    }

    fn fake_swim_detail() -> Value {
        json!({
            "code": 1,
            "message": "success",
            "data": {
                "trackid": START,
                "source": "run.10289410.huami.com",
                "longitude_latitude": "399000000,1164000000;12,-8",
                "heart_rate": "0,98;1,2;1,-1",
                "pool_swim_pace": "0,120;60,118",
                "lap": "0,62,25,s00000000000,141,62,-20000,1;1,124,25,s00000000000,147,124,-20000,2",
                "strengthSets": "[{\"actionId\":3,\"reps\":10,\"note\":\"left knee\"}]",
                "pause": format!("{},{};", START + 300, START + 320),
                "spo2": "",
            }
        })
    }

    #[test]
    fn keeps_decoding_fields_and_removes_personal_ones() {
        let (sample, value) = sample(vec![
            SamplePart {
                part: "summary",
                channel: "legacy",
                payload: fake_swim_summary(),
            },
            SamplePart {
                part: "detail",
                channel: "legacy",
                payload: fake_swim_detail(),
            },
        ]);
        let summary = &value["parts"][0]["payload"];
        assert_eq!(summary["swim_style"], 1);
        assert_eq!(summary["swim_pool_length"], 25);
        assert_eq!(summary["total_trips"], 40);
        assert_eq!(summary["total_strokes"], 812);
        assert_eq!(summary["dis"], "1000");
        assert_eq!(summary["type"], 14);
        assert_eq!(summary["auto_recognition"], true);
        // 健康读数换成同类型的占位值。
        assert_eq!(summary["avg_heart_rate"], "0");
        assert_eq!(summary["max_heart_rate"], 0);
        assert_eq!(summary["calorie"], "0");
        assert_eq!(summary["weight"], 0.0);
        assert_eq!(summary["heart_range"], "0,0,0,0,0,0");
        // 认不出的字符串换掉。
        assert_eq!(summary["sportNotes"], REDACTED_TEXT);
        // 地点、标识整字段删掉。
        for key in [
            "location",
            "city",
            "deviceid",
            "sn",
            "bind_device",
            "syncedTimezone",
        ] {
            assert!(summary.get(key).is_none(), "{key} 应该被删掉");
        }
        // 开始时间平移到 2000-01-01，相对间隔不变。
        assert_eq!(summary["trackid"], STRUCTURE_SAMPLE_EPOCH.to_string());
        assert_eq!(
            summary["end_time"],
            (STRUCTURE_SAMPLE_EPOCH + 2400).to_string()
        );
        assert_eq!(summary["createTime"], STRUCTURE_SAMPLE_EPOCH * 1000 + 5);

        let detail = &value["parts"][1]["payload"]["data"];
        assert!(detail.get("longitude_latitude").is_none());
        assert_eq!(detail["source"], REDACTED_TEXT);
        // 逐点心率：时间差留着，读数换成 0。
        assert_eq!(detail["heart_rate"], "0,0;1,0;1,-0");
        // 泳池配速是白名单，原样。
        assert_eq!(detail["pool_swim_pace"], "0,120;60,118");
        // 逐趟：各列原样，第 5 列心率换成 0。
        assert_eq!(
            detail["lap"],
            "0,62,25,s00000000000,0,62,-20000,1;1,124,25,s00000000000,0,124,-20000,2"
        );
        // 字符串里的 JSON 递归处理，仍是字符串。
        let sets: Value = serde_json::from_str(detail["strengthSets"].as_str().unwrap()).unwrap();
        assert_eq!(sets[0]["actionId"], 3);
        assert_eq!(sets[0]["reps"], 10);
        assert_eq!(sets[0]["note"], REDACTED_TEXT);
        // 暂停区间里的绝对时刻也平移。
        assert_eq!(
            detail["pause"],
            format!(
                "{},{};",
                STRUCTURE_SAMPLE_EPOCH + 300,
                STRUCTURE_SAMPLE_EPOCH + 320
            )
        );

        assert!(sample
            .dropped_fields
            .contains(&"summary.location".to_string()));
        assert!(sample
            .dropped_fields
            .contains(&"detail.data.longitude_latitude".to_string()));
        assert!(sample.masked_values > 5);
        assert!(is_structure_sample(sample.json.as_bytes()));
    }

    #[test]
    fn no_personal_value_survives_anywhere_in_the_text() {
        let (sample, _) = sample(vec![
            SamplePart {
                part: "summary",
                channel: "legacy",
                payload: fake_swim_summary(),
            },
            SamplePart {
                part: "detail",
                channel: "legacy",
                payload: fake_swim_detail(),
            },
        ]);
        for needle in [
            "39.9",
            "116.4",
            "399000000",
            "ABCDEF0123456789",
            "SN0123456789",
            "11:22:33",
            "Europe/Berlin",
            "Somewhere",
            "felt tired",
            "left knee",
            "10289410",
            "131.5",
            "158",
            "61.5",
            "113,141",
            &START.to_string(),
        ] {
            assert!(!sample.json.contains(needle), "样本里不该出现 {needle}");
        }
    }

    #[test]
    fn only_our_own_format_counts_as_a_sample() {
        assert!(!is_structure_sample(br#"{"format":"something-else"}"#));
        assert!(!is_structure_sample(b"not json"));
        let big = format!(
            "{{\"format\":\"{STRUCTURE_SAMPLE_FORMAT}\",\"x\":\"{}\"}}",
            "a".repeat(STRUCTURE_SAMPLE_MAX_BYTES)
        );
        assert!(!is_structure_sample(big.as_bytes()));
    }
}
