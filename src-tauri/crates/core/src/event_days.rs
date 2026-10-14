//! 每日事件报文按 UTC 日入库。
//!
//! `/v2/users/me/events` 上的 Charge、readiness、DailyHealth 每天一条（readiness
//! 一天可能两条），而同步每 15 分钟就拉一次最近 30 天。以前整个窗口存成**一条**
//! 原始报文、键里带着毫秒级的窗口起止——每次同步的键都不一样，于是每次都新增
//! 一条：Charge 一条就是 4.7 MB 的 JSON（压缩后 ~860 KB），开一整天库涨 80 MB，
//! 一个用了两个月的真实库里它占了 525 MB，而其中 96% 已经没有任何派生行指向。
//!
//! 现在按条目的 UTC 日拆开，每天一条、键是稳定的：`events:<type>:<sub>:day:<日期>`。
//! 重拉同一天是覆盖，不是新增。
//!
//! **为什么拆开不改变结果**：归一化是逐条目的，最后按 `(日期, 指标, 来源, 设备)`
//! 「后写的赢」去重；按日拆开后依次写入，还是同一天里时间最晚的那条赢。对真实库
//! 里全部 2161 条历史窗口报文逐条比对过：整窗归一化与按日拆开后依次写入，得到的
//! 日指标**完全一致**。
//!
//! **为什么请求窗口要对齐到整日**：同一天的两条报文，新的必须是旧的超集，覆盖才
//! 不丢东西。窗口起点每 15 分钟往后挪一次，若不对齐，最早那天的前 15 分钟会在新
//! 报文里消失，覆盖时连带把那天的派生行删掉。对齐到 UTC 零点以后，每一天要么被
//! 整天覆盖，要么（今天）从零点取到此刻——后一次永远包含前一次。

use chrono::{DateTime, Duration, NaiveDate, Utc};
use serde_json::{Map, Value};

const DAY_MS: i64 = 86_400_000;

/// 把一个半开区间 `[start, end)` 扩成整 UTC 日：`from` 是起点那天的零点，`to` 是
/// 终点所在那天的最后一毫秒，但不越过 `now`。
///
/// `to` 用「最后一毫秒」而不是下一天零点：零点整的条目属于下一天，把它捎进来会
/// 平白多出一个只有一条的「下一天」。
pub fn utc_day_aligned_millis(
    start: DateTime<Utc>,
    end: DateTime<Utc>,
    now: DateTime<Utc>,
) -> (i64, i64) {
    let from = start.timestamp_millis().div_euclid(DAY_MS) * DAY_MS;
    let end_ms = end.timestamp_millis();
    let next_midnight = (end_ms + DAY_MS - 1).div_euclid(DAY_MS) * DAY_MS;
    let to = (next_midnight - 1).min(now.timestamp_millis()).max(from);
    (from, to)
}

/// `millis` 所在那个 UTC 日的最后一毫秒。整窗形态的键用它当终点：请求本身取到
/// 此刻，但键在同一天里不变，重拉是覆盖而不是新增。
pub fn end_of_utc_day_millis(millis: i64) -> i64 {
    (millis.div_euclid(DAY_MS) + 1) * DAY_MS - 1
}

/// 一天的稳定键。日期是 UTC 日，和拆分依据一致。
pub fn day_source_key(event_type: &str, sub_type: &str, day: NaiveDate) -> String {
    format!(
        "events:{event_type}:{sub_type}:day:{}",
        day.format("%Y-%m-%d")
    )
}

/// 窗口形态的旧键 `events:<type>:<sub>:<from_ms>:<to_ms>` → `events:<type>:<sub>`。
/// 不是这个形态（包括新的按日键）返回 `None`。
pub fn window_key_family(source_key: &str) -> Option<&str> {
    let mut parts = source_key.rsplitn(3, ':');
    let to = parts.next()?;
    let from = parts.next()?;
    let family = parts.next()?;
    let numeric = |value: &str| !value.is_empty() && value.bytes().all(|b| b.is_ascii_digit());
    if !numeric(from) || !numeric(to) {
        return None;
    }
    let mut segments = family.split(':');
    let valid = segments.next() == Some("events")
        && segments.next().is_some_and(|value| !value.is_empty())
        && segments.next().is_some_and(|value| !value.is_empty())
        && segments.next().is_none();
    valid.then_some(family)
}

/// 按日拆开的结果。
#[derive(Debug, Clone, PartialEq)]
pub struct EventDays {
    /// 每个 UTC 日一份报文，按日期升序；每份的形状和原响应一样（`items` 之外的
    /// 顶层字段原样带上），只是 `items` 里只有这一天的条目，且保持原来的顺序。
    pub days: Vec<(NaiveDate, Value)>,
    /// 取不出时间戳的条目。它们没法归到哪一天，只能照旧整窗存。
    pub residual: Option<Value>,
}

/// 按条目的 `timestamp`（毫秒，数字或数字字符串）拆成每个 UTC 日一份。
///
/// 响应不是 `{ "items": [...] }` 或者 `items` 为空时返回 `None`——调用方照旧把
/// 整个响应存成一条，「这个窗口是空的」本身也是要留下的事实。
pub fn split_by_utc_day(payload: &Value) -> Option<EventDays> {
    let object = payload.as_object()?;
    let items = object.get("items")?.as_array()?;
    if items.is_empty() {
        return None;
    }
    let mut days: std::collections::BTreeMap<NaiveDate, Vec<Value>> = Default::default();
    let mut residual = Vec::new();
    for item in items {
        match item_day(item) {
            Some(day) => days.entry(day).or_default().push(item.clone()),
            None => residual.push(item.clone()),
        }
    }
    let wrap = |items: Vec<Value>| {
        let mut out = Map::with_capacity(object.len());
        for (key, value) in object {
            if key != "items" {
                out.insert(key.clone(), value.clone());
            }
        }
        out.insert("items".into(), Value::Array(items));
        Value::Object(out)
    };
    Some(EventDays {
        days: days
            .into_iter()
            .map(|(day, items)| (day, wrap(items)))
            .collect(),
        residual: (!residual.is_empty()).then(|| wrap(residual)),
    })
}

/// 一天的 `[零点, 下一天零点)`。
pub fn day_bounds(day: NaiveDate) -> (DateTime<Utc>, DateTime<Utc>) {
    let start = day.and_hms_opt(0, 0, 0).unwrap_or_default().and_utc();
    (start, start + Duration::days(1))
}

fn item_day(item: &Value) -> Option<NaiveDate> {
    let raw = item.get("timestamp")?;
    let millis = raw
        .as_i64()
        .or_else(|| raw.as_f64().filter(|v| v.is_finite()).map(|v| v as i64))
        .or_else(|| {
            raw.as_str()
                .and_then(|text| text.trim().parse::<i64>().ok())
        })?;
    DateTime::<Utc>::from_timestamp_millis(millis).map(|at| at.date_naive())
}

#[cfg(test)]
mod tests;
