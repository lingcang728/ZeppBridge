//! 差分串与数值串的解析小工具、暂停区间、按时间填充（从 decoder/workout_detail.rs 拆出，逻辑不变）。

use super::*;

pub(super) fn detail_object(raw: &Value) -> Option<&serde_json::Map<String, Value>> {
    if let Some(data) = raw.get("data").and_then(Value::as_object) {
        if data.contains_key("trackid") || data.contains_key("longitude_latitude") {
            return Some(data);
        }
    }
    raw.as_object()
}

pub(super) fn parse_i64(value: Option<&Value>) -> Option<i64> {
    match value? {
        Value::Number(number) => number.as_i64(),
        Value::String(text) => text.trim().parse().ok(),
        _ => None,
    }
}

/// 分号段解析失败时保留 `None` 占位，不丢索引——「第几段」在差分格式里是
/// 位置信息，静默压缩会让后面的增量全部错位。
pub(super) fn parse_int_list(value: Option<&Value>) -> Vec<Option<i32>> {
    let Some(text) = value.and_then(Value::as_str) else {
        return Vec::new();
    };
    text.split(';')
        .filter(|part| !part.is_empty())
        .map(|part| part.trim().parse().ok())
        .collect()
}

pub(super) fn parse_coordinate_deltas(
    value: Option<&Value>,
) -> (Vec<Option<i64>>, Vec<Option<i64>>) {
    let Some(text) = value.and_then(Value::as_str) else {
        return (Vec::new(), Vec::new());
    };
    let mut latitudes = Vec::new();
    let mut longitudes = Vec::new();
    for part in text.split(';').filter(|part| !part.is_empty()) {
        let mut bits = part.split(',');
        let lat = bits.next().and_then(|item| item.parse().ok());
        let lon = bits.next().and_then(|item| item.parse().ok());
        latitudes.push(lat);
        longitudes.push(lon);
    }
    (latitudes, longitudes)
}

pub(super) fn parse_altitude_cm(value: Option<&Value>) -> Vec<Option<i64>> {
    let mut values = parse_int_list(value)
        .into_iter()
        .map(|item| item.map(i64::from))
        .collect::<Vec<_>>();
    if let Some(first_valid) = values
        .iter()
        .position(|value| value.is_some_and(is_plausible_altitude_cm))
    {
        let fill = values[first_valid];
        for item in values.iter_mut().take(first_valid) {
            *item = fill;
        }
    }
    values
}

pub(super) fn is_plausible_altitude_cm(cm: i64) -> bool {
    (MIN_PLAUSIBLE_ALTITUDE_CM..=MAX_PLAUSIBLE_ALTITUDE_CM).contains(&cm)
}

pub(super) fn cm_to_meters(cm: i64) -> Option<f64> {
    is_plausible_altitude_cm(cm).then(|| cm as f64 / 100.0)
}

/// 解析一段 `dt,value;dt,value;...`。
///
/// **乱码的 delta 会让整行被丢掉，而不是当成 0。** 以前这里是
/// `raw_delta.parse().unwrap_or(0)`：一个非空但解析不出来的 delta 会让这个
/// 样本和上一个落到同一个时间戳上。轻则重复采样，重则污染配速、功率、
/// 跑姿和分段——而这一切在界面上看起来完全正常，因为样本数是对的。
///
/// 空 delta 是另一回事：协议里它确实表示「下一秒」，由 `empty_delta_is_one`
/// 明确开启，不是猜的。
pub(super) fn parse_delta_pairs(
    value: Option<&Value>,
    empty_delta_is_one: bool,
) -> Vec<(i64, i32)> {
    let Some(text) = value.and_then(Value::as_str) else {
        return Vec::new();
    };
    let mut pairs = Vec::new();
    for part in text.split(';').filter(|part| !part.is_empty()) {
        let mut bits = part.splitn(2, ',');
        let raw_delta = bits.next().unwrap_or("").trim();
        let raw_value = bits.next().unwrap_or("");
        let delta = if raw_delta.is_empty() {
            if empty_delta_is_one {
                1
            } else {
                // 这一路的协议没有「空 = 1 秒」这条约定，空 delta 就是读不
                // 懂的东西。跳过，别替它编一个。
                continue;
            }
        } else {
            match raw_delta.parse::<i64>() {
                Ok(parsed) => parsed,
                Err(_) => continue,
            }
        };
        let Some(sample) = raw_value.parse::<i32>().ok() else {
            continue;
        };
        pairs.push((delta, sample));
    }
    pairs
}

pub(super) fn parse_float_pairs(value: Option<&Value>) -> Vec<(i64, f64)> {
    let Some(text) = value.and_then(Value::as_str) else {
        return Vec::new();
    };
    let mut pairs = Vec::new();
    for part in text.split(';').filter(|part| !part.is_empty()) {
        let mut bits = part.splitn(2, ',');
        let Some(delta) = bits.next().and_then(|item| item.parse().ok()) else {
            continue;
        };
        let Some(sample) = bits.next().and_then(|item| item.parse().ok()) else {
            continue;
        };
        pairs.push((delta, sample));
    }
    pairs
}

/// `(dt, value)` pairs where the value is a plain reading rather than a delta.
///
/// Unlike `parse_float_pairs` an empty leading delta means "one second later",
/// the same convention `parse_delta_pairs` uses, because real `power_meter`
/// and `equivPace` strings contain them.
pub(super) fn parse_valued_pairs(value: Option<&Value>) -> Vec<(i64, f64)> {
    let Some(text) = value.and_then(Value::as_str) else {
        return Vec::new();
    };
    let mut pairs = Vec::new();
    for part in text.split(';').filter(|part| !part.is_empty()) {
        let mut bits = part.splitn(2, ',');
        let raw_delta = bits.next().unwrap_or("").trim();
        // 同 `parse_delta_pairs`：空 delta 是协议里的「下一秒」，乱码 delta
        // 不是 0，是读不懂。读不懂就跳过这一行。
        let delta = if raw_delta.is_empty() {
            1
        } else {
            match raw_delta.parse::<i64>() {
                Ok(parsed) => parsed,
                Err(_) => continue,
            }
        };
        let Some(sample) = bits.next().and_then(|item| item.trim().parse::<f64>().ok()) else {
            continue;
        };
        pairs.push((delta, sample));
    }
    pairs
}

/// `(dt, ground contact, vertical oscillation, vertical stride ratio)`.
pub(super) type PostureRow = (i64, i32, i32, i32);

pub(super) fn parse_run_posture(value: Option<&Value>) -> Vec<PostureRow> {
    let Some(text) = value.and_then(Value::as_str) else {
        return Vec::new();
    };
    let mut rows = Vec::new();
    for part in text.split(';').filter(|part| !part.is_empty()) {
        let bits: Vec<&str> = part.split(',').collect();
        if bits.len() < 4 {
            continue;
        }
        let raw_delta = bits[0].trim();
        let delta = if raw_delta.is_empty() {
            1
        } else {
            match raw_delta.parse::<i64>() {
                Ok(value) => value,
                Err(_) => continue,
            }
        };
        let (Ok(contact), Ok(oscillation), Ok(ratio)) = (
            bits[1].trim().parse::<i32>(),
            bits[2].trim().parse::<i32>(),
            bits[3].trim().parse::<i32>(),
        ) else {
            continue;
        };
        rows.push((delta, contact, oscillation, ratio));
    }
    rows
}

/// Map a device sentinel to NaN so the fill never carries it forward as a
/// real reading; `finite_at` then drops it.
pub(super) fn sentinel_free(value: i32, sentinel: i32) -> f64 {
    if value == sentinel || value < 0 {
        f64::NAN
    } else {
        f64::from(value)
    }
}

pub(super) fn finite_at(
    map: Option<&std::collections::HashMap<i64, f64>>,
    unix_ts: i64,
) -> Option<f64> {
    map.and_then(|map| map.get(&unix_ts).copied())
        .filter(|value| value.is_finite())
}

pub(super) fn parse_gait(value: Option<&Value>) -> Vec<(i64, i32, i32, i32)> {
    let Some(text) = value.and_then(Value::as_str) else {
        return Vec::new();
    };
    let mut rows = Vec::new();
    for part in text.split(';').filter(|part| !part.is_empty()) {
        let bits: Vec<&str> = part.split(',').collect();
        if bits.len() < 4 {
            continue;
        }
        let (Ok(delta), Ok(steps), Ok(stride), Ok(cadence)) = (
            bits[0].parse::<i64>(),
            bits[1].parse::<i32>(),
            bits[2].parse::<i32>(),
            bits[3].parse::<i32>(),
        ) else {
            continue;
        };
        rows.push((delta, steps, stride, cadence));
    }
    rows
}

/// 暂停区间，`start,时长,-1,-1,种类;…`。
///
/// **种类不再用来筛行**（#139）。旧写法只收 2 / 3 / 0，其余种类整行丢掉——
/// 一位 Balance 2 用户 127 条带 `pause` 的明细一条暂停都没入库，FIT 里也就
/// 没有停表事件，Strava 把 89 分钟全当成在动。种类只是标签：2 记 manual、
/// 3 记 auto、0 记 unknown，别的数记 other，区间照收。
///
/// 起点也不只认一种写法：秒级 Unix 时间（本库 423 条全是这种）、毫秒级
/// Unix 时间、或者相对运动开始的秒数；第二列既可能是时长，也可能是绝对的
/// 结束时刻。读出来的区间必须落在运动开始后的 48 小时里，落不进去说明列
/// 读错了，丢掉这一行而不是硬塞。
pub(super) fn parse_pauses(value: Option<&Value>, from: i64) -> Vec<PauseInterval> {
    let Some(text) = value.and_then(Value::as_str) else {
        return Vec::new();
    };
    let mut pauses = Vec::new();
    for part in text.split(';').filter(|part| !part.trim().is_empty()) {
        let bits: Vec<&str> = part.split(',').map(str::trim).collect();
        if bits.len() < 2 {
            continue;
        }
        let (Ok(raw_start), Ok(raw_second)) = (bits[0].parse::<i64>(), bits[1].parse::<i64>())
        else {
            continue;
        };
        let kind = match bits.get(4).and_then(|kind| kind.parse::<i32>().ok()) {
            Some(2) => "manual",
            Some(3) => "auto",
            Some(0) | None => "unknown",
            Some(_) => "other",
        };
        let Some((start, end)) = pause_bounds(raw_start, raw_second, from) else {
            continue;
        };
        // 只用 48 小时上限框住，不拿 `to` 裁：室内运动可能既没有汇总结束时刻
        // 也没有时间差分，`to` 只是起点 +1 秒，拿它裁会把暂停全裁没。导出 FIT
        // 时会再按运动起止夹一次。
        let limit = from.saturating_add(MAX_ACTIVITY_SECONDS);
        if start < from || start >= limit || end <= start || end > limit {
            continue;
        }
        let (Some(start_time), Some(end_time)) = (
            Utc.timestamp_opt(start, 0).single(),
            Utc.timestamp_opt(end, 0).single(),
        ) else {
            continue;
        };
        if end_time <= start_time {
            continue;
        }
        pauses.push(PauseInterval {
            start_time,
            end_time,
            kind: kind.into(),
        });
    }
    pauses.sort_by_key(|pause| pause.start_time);
    pauses
}

/// 一行暂停的 `(起点, 终点)`，Unix 秒。
///
/// * 起点 ≥ 10^11：毫秒级时间戳，第二列同样按毫秒读；
/// * 起点 < 10^9：相对运动开始（`from`）的秒数；
/// * 第二列大于起点且本身像个时间戳：绝对的结束时刻；否则是时长。
fn pause_bounds(raw_start: i64, raw_second: i64, from: i64) -> Option<(i64, i64)> {
    const MILLIS_THRESHOLD: i64 = 100_000_000_000;
    const UNIX_THRESHOLD: i64 = 1_000_000_000;
    if raw_second < 0 {
        return None;
    }
    let (start, second) = if raw_start >= MILLIS_THRESHOLD {
        // 毫秒的绝对结束时刻和毫秒的时长除以 1000 都落回秒，下面再分辨是哪种。
        (raw_start / 1000, raw_second / 1000)
    } else if raw_start < UNIX_THRESHOLD {
        (from.checked_add(raw_start)?, raw_second)
    } else {
        (raw_start, raw_second)
    };
    let end = if second >= UNIX_THRESHOLD && second > start {
        second
    } else {
        start.checked_add(second)?
    };
    Some((start, end))
}

pub(super) fn timed_cumulative_i32(
    from: i64,
    to: i64,
    elements: &[(i64, i32)],
) -> std::collections::HashMap<i64, i32> {
    timed_fill(from, to, elements, 0, |current, delta| {
        current.saturating_add(*delta)
    })
}

pub(super) fn timed_fixed_f64(
    from: i64,
    to: i64,
    elements: &[(i64, f64)],
) -> std::collections::HashMap<i64, f64> {
    timed_fill(from, to, elements, 0.0, |_, value| *value)
}

pub(super) fn timed_fill<T: Copy>(
    from: i64,
    to: i64,
    elements: &[(i64, T)],
    init: T,
    update: impl Fn(T, &T) -> T,
) -> std::collections::HashMap<i64, T> {
    let mut result = std::collections::HashMap::new();
    let mut working = from;
    let mut value = init;
    let limit = to.saturating_add(1);
    for (index, (delta, sample)) in elements.iter().enumerate() {
        if *delta < 0 {
            // 打头那一项的负跨度是「轨迹开始前一刻」的基准读数：真实报文的
            // 心率串以 `-1,105;` 开头，后面每一项都是相对它的差分。它的值
            // 必须并进累计——以前连它一起跳过，整条曲线少了一个基数，一次
            // 「AI 识别活动」的心率被画成 1–43 次/分，而摘要里最高是 148
            // （= 105 + 43）。它不占时间，下一项照常从 `from` 铺起。
            //
            // 其余位置的负跨度不可能合法——不管累计值是不是走 `update`，都
            // 不能让它悄悄并进去，否则后面所有点的基数都会被这一条坏点带偏，
            // 而且毫无痕迹。`delta == 0`（同一秒的补充读数）是正常情况，
            // 仍然照常并入。
            if index == 0 {
                value = update(value, sample);
            }
            continue;
        }
        value = update(value, sample);
        let start = if index == 0 { 0 } else { 1 };
        if *delta >= start {
            for _ in start..=*delta {
                result.insert(working, value);
                match working.checked_add(1) {
                    Some(next) => {
                        working = next;
                        if working > limit {
                            break;
                        }
                    }
                    None => break,
                }
            }
        }
    }
    while working <= to {
        result.insert(working, value);
        match working.checked_add(1) {
            Some(next) => working = next,
            None => break,
        }
    }
    result
}
