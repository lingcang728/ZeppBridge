//! 分页与分片抓取：心率游标翻页、日摘要与睡眠按片、失败归并（从 fetcher/mod.rs 拆出，逻辑不变）。

use super::*;

/// Keep each response intact: pagination metadata and unknown fields belong to raw.
///
/// `window` 是 `day` 那一整个 UTC 日（见 `FetchWindow::utc_days`）；键是
/// `heart_rate:day:<日期>:<页号>`，同一天同一页永远是同一条报文。
pub(super) async fn fetch_heart_rate_pages_with<F, Fut>(
    day: NaiveDate,
    window: FetchWindow,
    mut fetch: F,
) -> Result<Vec<FetchedRecord>>
where
    F: FnMut(i64, i64) -> Fut,
    Fut: std::future::Future<Output = Result<Value>>,
{
    let end = window.end_utc.timestamp();
    let mut cursor = window.start_utc.timestamp();
    let mut records = Vec::new();
    let mut page = 0usize;
    loop {
        let payload = fetch(cursor, end).await?;
        let items = heart_rate_items(&payload);
        let next = if items.len() >= HEART_RATE_PAGE_LIMIT as usize {
            heart_rate_cursor(&items).filter(|next| *next > cursor && *next < end)
        } else {
            None
        };
        records.push(FetchedRecord::from_raw(RawRecord {
            stream: "heart_rate".into(),
            source_key: format!("heart_rate:day:{day}:{page}"),
            source_scope: SourceScope::UserFused,
            device_id: None,
            start_utc: DateTime::from_timestamp(cursor, 0).unwrap_or(window.start_utc),
            end_utc: Some(window.end_utc),
            payload,
            capability: CapabilityStatus::Verified,
        }));
        let Some(next) = next else { break };
        cursor = next;
        page += 1;
    }
    Ok(records)
}

/// 把按切片抓取的结果收成一次窗口结论。
///
/// `Cancelled` / `NeedsReauth` 即使已经有成功切片也必须立刻返回，不能被
/// 「有几条记录」吞掉。子切片 404 时：有数据就标 `incomplete` 留给补拉重试；
/// 一条都没有才把原来的不可用错误往上抛。
pub(super) fn conclude_slices(
    mut records: Vec<FetchedRecord>,
    last_error: Option<ZeppBridgeError>,
    empty_message: &str,
) -> Result<Vec<FetchedRecord>> {
    if let Some(error) = last_error {
        if error.is_cancelled() || error.needs_reauth() {
            return Err(error);
        }
        if records.is_empty() {
            return Err(error);
        }
        for record in &mut records {
            record.incomplete = true;
            record.incomplete_reason = Some(error.to_string());
        }
        return Ok(records);
    }
    if records.is_empty() {
        return Err(ZeppBridgeError::Unavailable(empty_message.into()));
    }
    Ok(records)
}

pub(super) fn is_abort_error(error: &ZeppBridgeError) -> bool {
    error.is_cancelled() || error.needs_reauth()
}

/// A year of daily events can exceed the response limit or contain one bad
/// historical slice. Keep every successful response and leave failed slices
/// marked incomplete so backfill can retry them.
pub(super) async fn fetch_daily_summary_slices_with<F, Fut>(
    window: FetchWindow,
    mut fetch: F,
) -> Result<Vec<FetchedRecord>>
where
    F: FnMut(FetchWindow) -> Fut,
    Fut: std::future::Future<Output = Result<Vec<FetchedRecord>>>,
{
    let mut records = Vec::new();
    let mut last_error = None;
    for chunk in window.chunks(30) {
        match fetch(chunk).await {
            Ok(slice) => records.extend(slice),
            Err(error) if is_abort_error(&error) => return Err(error),
            Err(error) => {
                if !error.is_unavailable() || last_error.is_none() {
                    last_error = Some(error);
                }
            }
        }
    }
    conclude_slices(records, last_error, "每日概览窗口没有可识别记录")
}

/// A failed historical slice must not discard other nights or prevent the
/// latest slice from being requested. The connector already bounds retries.
pub(super) async fn fetch_sleep_slices_with<F, Fut>(
    window: FetchWindow,
    mut fetch: F,
) -> Result<Vec<FetchedRecord>>
where
    F: FnMut(FetchWindow) -> Fut,
    Fut: std::future::Future<Output = Result<FetchedRecord>>,
{
    let mut records = Vec::new();
    let mut last_error = None;
    for chunk in window.chunks(7) {
        match fetch(chunk).await {
            Ok(record) => records.push(record),
            Err(error) if is_abort_error(&error) => return Err(error),
            Err(error) => {
                // Do not downgrade a request failure to unavailable when a
                // later slice happens to return 404.
                if !error.is_unavailable() || last_error.is_none() {
                    last_error = Some(error);
                }
            }
        }
    }
    conclude_slices(records, last_error, "睡眠窗口没有可识别记录")
}

/// The heartRate endpoint's per-request sample cap.
pub(super) const HEART_RATE_PAGE_LIMIT: i64 = 1000;

/// Collect the sample items out of a heartRate payload, mirroring the
/// normalizer's accepted shapes. Pure so pagination logic is unit-testable.
pub(super) fn heart_rate_items(payload: &Value) -> Vec<Value> {
    if let Some(array) = payload.as_array() {
        return array.to_vec();
    }
    let Some(object) = payload.as_object() else {
        return Vec::new();
    };
    for key in ["items", "records", "results", "list"] {
        if let Some(array) = object.get(key).and_then(Value::as_array) {
            return array.to_vec();
        }
    }
    if let Some(data) = object.get("data") {
        if let Some(array) = data.as_array() {
            return array.to_vec();
        }
        if let Some(data_object) = data.as_object() {
            for key in ["items", "records", "results", "list"] {
                if let Some(array) = data_object.get(key).and_then(Value::as_array) {
                    return array.to_vec();
                }
            }
        }
    }
    Vec::new()
}

/// Compute the next pagination cursor from merged heart-rate items: the max
/// sample timestamp plus one second. Timestamps may be epoch seconds or
/// milliseconds; malformed items are skipped.
pub(super) fn heart_rate_cursor(items: &[Value]) -> Option<i64> {
    let mut max_ts: Option<i64> = None;
    for item in items {
        let Some(object) = item.as_object() else {
            continue;
        };
        let mut item_ts: Option<i64> = None;
        for key in ["timestamp", "time", "timeStamp", "startTime"] {
            let Some(value) = object.get(key) else {
                continue;
            };
            let parsed = match value {
                Value::Number(number) => number.as_i64(),
                Value::String(text) => text.trim().parse::<i64>().ok(),
                _ => None,
            };
            if let Some(parsed) = parsed {
                item_ts = Some(parsed);
                break;
            }
        }
        if let Some(ts) = item_ts {
            max_ts = Some(max_ts.map_or(ts, |current: i64| current.max(ts)));
        }
    }
    // 一律换算成**秒**再进一格。
    //
    // 调用方的 `cursor` 和 `end` 都是秒（`window.start_utc.timestamp()`），
    // 而它们原样进了请求的 `startTime` / `endTime`。之前这里对毫秒时间戳返回
    // 的是 `ts + 1000`，也就是一个毫秒数：只要某一页里出现一条毫秒时间戳，
    // 下一次请求的 `startTime` 就变成一个远大于 `endTime` 的数，服务端判定
    // 区间非法返回空页，于是**满 1000 条的大体积心率数据，第 2 页之后整段
    // 丢掉**——而同步是「成功」的。
    max_ts.map(|ts| {
        let seconds = if ts >= 10_000_000_000 { ts / 1000 } else { ts };
        seconds.saturating_add(1)
    })
}
