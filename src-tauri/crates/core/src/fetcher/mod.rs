use crate::connectors::ZeppConnector;
use crate::models::{error::*, *};
use chrono::{DateTime, Duration, NaiveDate, Utc};
use serde_json::{json, Value};
use std::collections::BTreeSet;

#[derive(Debug, Clone, Copy)]
pub struct FetchWindow {
    pub start_utc: DateTime<Utc>,
    pub end_utc: DateTime<Utc>,
}

impl FetchWindow {
    /// 常规同步窗口。上限仍是 365 天：一次请求覆盖太长会让服务端超时。
    /// 想要更早的历史请走历史补拉，它按月分块并且可以断点续传。
    pub fn days(days: i64) -> Result<Self> {
        if !(1..=365).contains(&days) {
            return Err(ZeppBridgeError::ConfigError(
                "同步窗口天数必须在 1..=365".into(),
            ));
        }
        let end_utc = Utc::now();
        Ok(Self {
            start_utc: end_utc - Duration::days(days),
            end_utc,
        })
    }

    /// 任意区间。历史补拉自己按月切块，所以不受 365 天限制；这里只保证
    /// 区间方向正确。
    pub fn between(start_utc: DateTime<Utc>, end_utc: DateTime<Utc>) -> Result<Self> {
        if end_utc <= start_utc {
            return Err(ZeppBridgeError::ConfigError(
                "抓取窗口的结束时间必须晚于开始时间".into(),
            ));
        }
        Ok(Self { start_utc, end_utc })
    }

    pub fn start_day(&self) -> String {
        self.start_utc.format("%Y-%m-%d").to_string()
    }

    pub fn end_day(&self) -> String {
        self.end_utc.format("%Y-%m-%d").to_string()
    }

    pub fn chunks(self, chunk_days: i64) -> Vec<Self> {
        let chunk_days = chunk_days.max(1);
        let mut chunks = Vec::new();
        let mut cursor = self.start_utc;
        while cursor < self.end_utc {
            let next = (cursor + Duration::days(chunk_days)).min(self.end_utc);
            if next > cursor {
                chunks.push(Self {
                    start_utc: cursor,
                    end_utc: next,
                });
            }
            cursor = next;
        }
        if chunks.is_empty() {
            chunks.push(self);
        }
        chunks
    }
}

/// A fetch result keeps endpoint/source identity beside its raw payload. This
/// is what allows sync to retain provenance before normalization.
#[derive(Debug, Clone)]
pub struct FetchedRecord {
    pub raw: RawRecord,
}

/// The heartRate endpoint's per-request sample cap.
const HEART_RATE_PAGE_LIMIT: i64 = 1000;

/// Collect the sample items out of a heartRate payload, mirroring the
/// normalizer's accepted shapes. Pure so pagination logic is unit-testable.
fn heart_rate_items(payload: &Value) -> Vec<Value> {
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
fn heart_rate_cursor(items: &[Value]) -> Option<i64> {
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

pub struct DataFetcher {
    connector: ZeppConnector,
}

impl DataFetcher {
    pub fn new(connector: ZeppConnector) -> Self {
        Self { connector }
    }

    #[allow(dead_code)]
    pub fn connector(&self) -> &ZeppConnector {
        &self.connector
    }

    #[allow(dead_code)]
    pub async fn fetch_heart_rate(
        &self,
        start_timestamp: i64,
        end_timestamp: i64,
    ) -> Result<Value> {
        self.connector
            .fetch_heart_rate(start_timestamp, end_timestamp)
            .await
    }

    pub async fn fetch_heart_rate_records(
        &self,
        window: FetchWindow,
    ) -> Result<Vec<FetchedRecord>> {
        let mut records = Vec::new();
        let mut last_error = None;
        for chunk in window.chunks(7) {
            match self.fetch_heart_rate_record(chunk).await {
                Ok(record) => records.push(record),
                Err(error) if error.is_unavailable() => last_error = Some(error),
                Err(error) => return Err(error),
            }
        }
        if records.is_empty() {
            return Err(last_error
                .unwrap_or_else(|| ZeppBridgeError::Unavailable("心率窗口没有可识别记录".into())));
        }
        Ok(records)
    }

    /// Defensive pagination for the heartRate endpoint.
    ///
    /// Real captures show the endpoint can return more than one page worth of
    /// samples for a 7-day window, so a page that comes back full is followed
    /// up with a cursor request instead of silently truncating the window.
    pub async fn fetch_heart_rate_record(&self, window: FetchWindow) -> Result<FetchedRecord> {
        let end = window.end_utc.timestamp();
        let mut cursor = window.start_utc.timestamp();
        let mut merged: Vec<Value> = Vec::new();
        loop {
            let payload = self
                .connector
                .fetch_heart_rate_with_options(cursor, end, HEART_RATE_PAGE_LIMIT, 2)
                .await?;
            let items = heart_rate_items(&payload);
            let page_len = items.len();
            merged.extend(items);
            if page_len < HEART_RATE_PAGE_LIMIT as usize {
                break;
            }
            match heart_rate_cursor(&merged) {
                Some(next) if next > cursor => cursor = next,
                _ => break, // no progress: avoid an infinite loop
            }
        }
        let payload = if merged.is_empty() {
            // Keep the original payload so downstream normalization can
            // surface the endpoint's own "no records" shape.
            self.connector
                .fetch_heart_rate(window.start_utc.timestamp(), window.end_utc.timestamp())
                .await?
        } else {
            json!({ "items": merged })
        };
        Ok(FetchedRecord {
            raw: RawRecord {
                stream: "heart_rate".into(),
                source_key: format!(
                    "heart_rate:{}:{}",
                    window.start_utc.timestamp(),
                    window.end_utc.timestamp()
                ),
                source_scope: SourceScope::UserFused,
                device_id: None,
                start_utc: window.start_utc,
                end_utc: Some(window.end_utc),
                payload,
                capability: CapabilityStatus::Verified,
            },
        })
    }

    #[allow(dead_code)]
    pub async fn fetch_band_data(
        &self,
        from_date: &str,
        to_date: &str,
        query_type: &str,
        byte_length: i64,
        device_type: i64,
    ) -> Result<Value> {
        self.connector
            .fetch_band_data(from_date, to_date, query_type, byte_length, device_type)
            .await
    }

    #[allow(dead_code)]
    pub async fn fetch_sport_history(
        &self,
        sport: &str,
        start_track_id: i64,
        stop_track_id: i64,
        need_sub_data: i64,
    ) -> Result<Value> {
        self.connector
            .fetch_sport_history(sport, start_track_id, stop_track_id, need_sub_data)
            .await
    }

    pub async fn fetch_sport_detail_record(
        &self,
        workout_id: &str,
        source: &str,
        start_utc: DateTime<Utc>,
        end_utc: Option<DateTime<Utc>>,
    ) -> Result<FetchedRecord> {
        let payload = self
            .connector
            .fetch_sport_detail(workout_id, source)
            .await?;
        Ok(FetchedRecord {
            raw: RawRecord {
                stream: "workout_detail".into(),
                source_key: format!("workout_detail:{workout_id}:{source}"),
                source_scope: SourceScope::Device,
                device_id: None,
                start_utc,
                end_utc,
                payload,
                capability: CapabilityStatus::Verified,
            },
        })
    }

    #[allow(dead_code)]
    pub async fn fetch_watch_statistics(
        &self,
        statistic: &str,
        start_day: &str,
        end_day: &str,
    ) -> Result<Value> {
        self.connector
            .fetch_watch_statistics(statistic, start_day, end_day, 900, true)
            .await
    }

    #[allow(dead_code)]
    pub async fn fetch_events(
        &self,
        event_type: &str,
        sub_type: Option<&str>,
        from_ms: i64,
        to_ms: i64,
        limit: i64,
        reverse: bool,
    ) -> Result<Value> {
        self.connector
            .fetch_events(event_type, sub_type, from_ms, to_ms, limit, reverse)
            .await
    }

    /// Fetch the supported core streams for a shared time window. Optional
    /// capabilities are represented as unavailable errors by their endpoint;
    /// callers can retain the successful records and report the missing stream.
    #[allow(dead_code)]
    pub async fn fetch_core_window(&self, window: FetchWindow) -> Result<Vec<FetchedRecord>> {
        let heart_rate = self.fetch_heart_rate_record(window).await?;
        Ok(vec![heart_rate])
    }

    /// Compatibility helper used by the original Tauri command.
    #[allow(dead_code)]
    pub async fn fetch_heart_rate_range(&self, days: i64) -> Result<Value> {
        let window = FetchWindow::days(days)?;
        self.fetch_heart_rate(window.start_utc.timestamp(), window.end_utc.timestamp())
            .await
    }

    #[allow(dead_code)]
    pub async fn fetch_sleep_range(&self, days: i64) -> Result<Value> {
        let window = FetchWindow::days(days)?;
        self.connector
            .fetch_sleep(&window.start_day(), &window.end_day())
            .await
    }

    pub async fn fetch_sleep_records(&self, window: FetchWindow) -> Result<Vec<FetchedRecord>> {
        let mut records = Vec::new();
        let mut last_error = None;
        for chunk in window.chunks(7) {
            match self.fetch_sleep_record(chunk).await {
                Ok(record) => records.push(record),
                Err(error) if error.is_unavailable() => last_error = Some(error),
                Err(error) => return Err(error),
            }
        }
        if records.is_empty() {
            return Err(last_error
                .unwrap_or_else(|| ZeppBridgeError::Unavailable("睡眠窗口没有可识别记录".into())));
        }
        Ok(records)
    }

    pub async fn fetch_sleep_record(&self, window: FetchWindow) -> Result<FetchedRecord> {
        let payload = self
            .connector
            .fetch_band_data(&window.start_day(), &window.end_day(), "detail", 8, 0)
            .await?;
        let capability = crate::normalizer::Normalizer::band_capability(&payload);
        Ok(FetchedRecord {
            raw: RawRecord {
                stream: "sleep".into(),
                source_key: format!(
                    "band_data:detail:{}:{}",
                    window.start_day(),
                    window.end_day()
                ),
                source_scope: SourceScope::Device,
                device_id: None,
                start_utc: window.start_utc,
                end_utc: Some(window.end_utc),
                payload,
                capability,
            },
        })
    }

    /// Sport history uses track IDs, not timestamps. The range helper uses the
    /// UTC epoch as a conservative cursor window because no local track index is
    /// known yet; a server response with no structured records is reported as
    /// unavailable rather than as a successful empty workout stream.
    pub async fn fetch_workout_records(&self, window: FetchWindow) -> Result<Vec<FetchedRecord>> {
        let start = window.start_utc.timestamp();
        let end = window.end_utc.timestamp();
        let mut records = Vec::new();
        // Despite its path, Zepp's run history endpoint is the account-wide
        // workout feed. The activity kind lives in each record's numeric
        // `type`; sibling paths such as `/strength/history.json` normally 404
        // and must not be treated as separate feeds.
        let sports = ["run"];
        let mut last_optional_error = None;
        for sport in sports {
            // Zepp 单页记录数有上限；响应 data.next 是下一页的 stopTrackId
            // 游标（-1/0/缺失 = 没有更多）。不翻页会丢掉窗口内较早的记录。
            let mut stop_track_id = end;
            loop {
                match self
                    .connector
                    .fetch_sport_history(sport, start, stop_track_id, 1)
                    .await
                {
                    Ok(payload) => {
                        let next = payload
                            .pointer("/data/next")
                            .and_then(Value::as_i64)
                            .unwrap_or(-1);
                        records.push(FetchedRecord {
                            raw: RawRecord {
                                stream: "workouts".into(),
                                source_key: format!(
                                    "sport_history:{sport}:{start}:{stop_track_id}"
                                ),
                                source_scope: SourceScope::Device,
                                device_id: None,
                                start_utc: window.start_utc,
                                end_utc: Some(window.end_utc),
                                payload,
                                capability: CapabilityStatus::Verified,
                            },
                        });
                        // 游标不再向窗口起点推进时停止，防止服务端异常造成死循环
                        if next <= 0 || next >= stop_track_id || next <= start {
                            break;
                        }
                        stop_track_id = next;
                    }
                    Err(error) if error.is_unavailable() => {
                        last_optional_error = Some(error);
                        break;
                    }
                    Err(error) => return Err(error),
                }
            }
        }
        if records.is_empty() {
            return Err(last_optional_error.unwrap_or_else(|| {
                ZeppBridgeError::Unavailable("sport history 没有可用种类".into())
            }));
        }
        Ok(records)
    }

    #[allow(dead_code)]
    pub async fn fetch_workouts_range(&self, days: i64) -> Result<Value> {
        let window = FetchWindow::days(days)?;
        let records = self.fetch_workout_records(window).await?;
        let mut items = Vec::new();
        for record in records {
            items.extend(payload_items(&record.raw.payload));
        }
        if items.is_empty() {
            return Err(ZeppBridgeError::Unavailable(
                "sport history payload 未提供结构化 workout items".into(),
            ));
        }
        Ok(json!({"items": items}))
    }

    pub async fn fetch_hrv_records(&self, window: FetchWindow) -> Result<Vec<FetchedRecord>> {
        let mut records = Vec::new();
        let mut last_error = None;
        for chunk in window.chunks(7) {
            match self
                .connector
                .fetch_hrv(&chunk.start_day(), &chunk.end_day())
                .await
            {
                Ok(payload) => records.push(FetchedRecord {
                    raw: RawRecord {
                        stream: "hrv".into(),
                        source_key: format!(
                            "events:hrv_sdnn:{}:{}",
                            chunk.start_day(),
                            chunk.end_day()
                        ),
                        source_scope: SourceScope::UserFused,
                        device_id: None,
                        start_utc: chunk.start_utc,
                        end_utc: Some(chunk.end_utc),
                        payload,
                        capability: CapabilityStatus::Verified,
                    },
                }),
                Err(error) if error.is_unavailable() => last_error = Some(error),
                Err(error) => return Err(error),
            }
        }
        if records.is_empty() {
            return Err(last_error
                .unwrap_or_else(|| ZeppBridgeError::Unavailable("HRV 窗口没有可识别记录".into())));
        }
        Ok(records)
    }

    #[allow(dead_code)]
    pub async fn fetch_daily_summary_range(&self, days: i64) -> Result<Value> {
        let window = FetchWindow::days(days)?;
        self.connector
            .fetch_daily_summary(&window.start_day(), &window.end_day())
            .await
    }

    pub async fn fetch_daily_statistics_records(
        &self,
        window: FetchWindow,
    ) -> Result<Vec<FetchedRecord>> {
        let mut records = Vec::new();
        let from = window.start_utc.timestamp_millis();
        let to = window.end_utc.timestamp_millis();
        let event = self
            .connector
            .fetch_events("DailyHealth", Some("summary"), from, to, 2000, true)
            .await?;
        records.push(FetchedRecord {
            raw: RawRecord {
                stream: "daily_summary".into(),
                source_key: format!("events:DailyHealth:summary:{from}:{to}"),
                source_scope: SourceScope::UserFused,
                device_id: None,
                start_utc: window.start_utc,
                end_utc: Some(window.end_utc),
                payload: event,
                capability: CapabilityStatus::Verified,
            },
        });
        for (event_type, sub_type) in [("Charge", "real_data"), ("readiness", "watch_score")] {
            match self
                .connector
                .fetch_events(event_type, Some(sub_type), from, to, 2000, true)
                .await
            {
                Ok(payload) => records.push(FetchedRecord {
                    raw: RawRecord {
                        stream: "daily_summary".into(),
                        source_key: format!("events:{event_type}:{sub_type}:{from}:{to}"),
                        source_scope: SourceScope::UserFused,
                        device_id: None,
                        start_utc: window.start_utc,
                        end_utc: Some(window.end_utc),
                        payload,
                        capability: CapabilityStatus::Verified,
                    },
                }),
                Err(error) if error.is_unavailable() => {}
                Err(error) => return Err(error),
            }
        }
        for statistic in ["SPORT_LOAD", "VO2_MAX"] {
            match self
                .connector
                .fetch_watch_statistics(
                    statistic,
                    &window.start_day(),
                    &window.end_day(),
                    900,
                    true,
                )
                .await
            {
                Ok(payload) => records.push(FetchedRecord {
                    raw: RawRecord {
                        stream: "daily_summary".into(),
                        source_key: format!(
                            "WatchSportStatistics:{statistic}:{}:{}",
                            window.start_day(),
                            window.end_day()
                        ),
                        source_scope: SourceScope::UserFused,
                        device_id: None,
                        start_utc: window.start_utc,
                        end_utc: Some(window.end_utc),
                        payload,
                        capability: CapabilityStatus::Verified,
                    },
                }),
                Err(error) if error.is_unavailable() => {}
                Err(error) => return Err(error),
            }
        }
        Ok(records)
    }
}

#[allow(dead_code)]
/// Which of the three Zepp event surfaces a candidate lives on.
///
/// They are not variants of one endpoint: the same `blood_oxygen` name returns
/// nothing on `/v2/users/me/events` and real readings on `/users/{id}/events`.
/// A probe that only knew the v2 path concluded this account had no blood
/// oxygen at all, which the Zepp app disproved.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ProbeSurface {
    /// `/v2/users/me/events`, epoch milliseconds.
    V2Events,
    /// `/users/{id}/events`, epoch milliseconds.
    UserEvents,
    /// `/users/{id}/events/dateString`, ISO-8601 window plus IANA timezone.
    UserEventsDay,
    /// `/users/{id}/members/{member}/weightRecords`, epoch **seconds**.
    ///
    /// The odd one out: it is not an event surface at all, and its window is
    /// in seconds rather than milliseconds. Weight lives here and nowhere
    /// else — see `ZeppConnector::fetch_weight_records`.
    WeightRecords,
    /// `/users/me/fileInfo/events` — an index of stored measurement files.
    FileInfoEvents,
}

impl ProbeSurface {
    fn as_str(self) -> &'static str {
        match self {
            ProbeSurface::V2Events => "v2_events",
            ProbeSurface::UserEvents => "user_events",
            ProbeSurface::UserEventsDay => "user_events_day",
            ProbeSurface::WeightRecords => "weight_records",
            ProbeSurface::FileInfoEvents => "file_info_events",
        }
    }
}

/// How far back a candidate is asked about.
///
/// Not every stream is sampled the same way, and using one window for all of
/// them misreports the sparse ones. Blood pressure and lactate threshold are
/// measured occasionally — a week of silence means "you have not measured
/// lately", which is a different statement from "this stream may not exist".
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ProbeCadence {
    /// Sampled all day, every day: a week is plenty and keeps the probe cheap.
    Continuous,
    /// Measured occasionally. Look back a year and report the latest reading's
    /// date rather than declaring the stream unknown.
    Episodic,
}

impl ProbeCadence {
    fn days(self) -> i64 {
        match self {
            ProbeCadence::Continuous => 7,
            ProbeCadence::Episodic => 365,
        }
    }

    fn as_str(self) -> &'static str {
        match self {
            ProbeCadence::Continuous => "continuous",
            ProbeCadence::Episodic => "episodic",
        }
    }
}

/// Candidate streams, as `(stream, surface, eventType, subType, cadence)`.
///
/// These names are not guesses. The first version invented plausible-looking
/// ones (`stress/real_data`, `skin_temp/real_data`, `bloodpressure/real_data`)
/// and every single one missed; the real names are `Charge/stress_data`,
/// `skinTemp/real_data` and `blood_pressure/real_data`. This table is
/// transcribed from two independent open-source clients that talk to the same
/// API — m4ary/zepp-health-cli and Thejuampi/icu — which agree on every entry.
/// The account holder on the scale. Family members have their own positive ids
/// (see `/users/{id}/members`); reading theirs would be reading other people.
pub const SCALE_ACCOUNT_MEMBER: &str = "-1";

/// How many weight readings to ask for per window.
///
/// The endpoint truncates rather than paging, so the window is sliced by year
/// (see `DataFetcher::fetch_weight_records`) and this only has to cover one
/// year of one person weighing themselves. 300 covers weighing in twice a day.
const WEIGHT_RECORD_LIMIT: i64 = 300;

const CAPABILITY_PROBES: [(&str, ProbeSurface, &str, Option<&str>, ProbeCadence); 20] = [
    // Controls. The positive one proves the probe itself works; the negative
    // one tells us whether an empty answer carries any information at all.
    (
        CONTROL_POSITIVE,
        ProbeSurface::V2Events,
        "hrv_sdnn",
        Some("real_data"),
        ProbeCadence::Continuous,
    ),
    (
        CONTROL_NEGATIVE,
        ProbeSurface::V2Events,
        "zzz_stream_that_does_not_exist",
        Some("real_data"),
        ProbeCadence::Continuous,
    ),
    // Stress hides under `Charge`, the same event type as body battery.
    (
        "stress",
        ProbeSurface::V2Events,
        "Charge",
        Some("stress_data"),
        ProbeCadence::Continuous,
    ),
    (
        "stress",
        ProbeSurface::UserEvents,
        "all_day_stress",
        None,
        ProbeCadence::Continuous,
    ),
    // Blood oxygen is only on the user-scoped surfaces.
    (
        "spo2",
        ProbeSurface::UserEvents,
        "blood_oxygen",
        None,
        ProbeCadence::Continuous,
    ),
    // Where the per-reading series might live now that spot readings have
    // gone quiet: this endpoint indexes stored measurement files rather than
    // serving samples inline.
    (
        "spo2_files",
        ProbeSurface::FileInfoEvents,
        "blood_oxygen",
        Some("real_data"),
        ProbeCadence::Continuous,
    ),
    (
        "spo2_files",
        ProbeSurface::FileInfoEvents,
        "spo2",
        Some("real_data"),
        ProbeCadence::Continuous,
    ),
    (
        "second_heart_rate",
        ProbeSurface::FileInfoEvents,
        "second_heart_rate",
        Some("real_data"),
        ProbeCadence::Continuous,
    ),
    (
        "spo2",
        ProbeSurface::UserEventsDay,
        "blood_oxygen",
        Some("odi"),
        ProbeCadence::Continuous,
    ),
    (
        "spo2",
        ProbeSurface::UserEventsDay,
        "blood_oxygen",
        Some("osa_event"),
        ProbeCadence::Continuous,
    ),
    (
        "respiratory_rate",
        ProbeSurface::V2Events,
        "RespiratoryRate",
        Some("real_data"),
        ProbeCadence::Continuous,
    ),
    (
        "hrv_rmssd",
        ProbeSurface::V2Events,
        "HRVRMSSD",
        Some("real_data"),
        ProbeCadence::Continuous,
    ),
    (
        "hybrid_charge",
        ProbeSurface::V2Events,
        "Charge",
        Some("insight_data"),
        ProbeCadence::Continuous,
    ),
    (
        "pai",
        ProbeSurface::UserEvents,
        "PaiHealthInfo",
        None,
        ProbeCadence::Continuous,
    ),
    (
        "second_heart_rate",
        ProbeSurface::V2Events,
        "second_heart_rate",
        Some("real_data"),
        ProbeCadence::Continuous,
    ),
    // Episodic: a week of silence says nothing about these.
    (
        "blood_pressure",
        ProbeSurface::V2Events,
        "blood_pressure",
        Some("real_data"),
        ProbeCadence::Episodic,
    ),
    (
        "lactate_threshold",
        ProbeSurface::V2Events,
        "LactateThreshold",
        Some("summary"),
        ProbeCadence::Episodic,
    ),
    (
        "emotion",
        ProbeSurface::V2Events,
        "Emotion",
        Some("real_data"),
        ProbeCadence::Episodic,
    ),
    // Weight was probed on `/v2/users/me/events` for a year and answered "no
    // records" every single time — to four different people who owned a scale
    // and had years of readings in the Zepp app. The page was not lying; it was
    // the wrong page. Weight lives on `/users/{id}/members/{member}/weightRecords`
    // and nowhere else. Verified on a live account 2026-09-04: the v2 page
    // returns `items: []` in the same second that this one returns records.
    //
    // `event_type` is carried for the report only; this surface takes no such
    // parameter.
    (
        "weight",
        ProbeSurface::WeightRecords,
        "weight",
        None,
        ProbeCadence::Episodic,
    ),
    // The Food Log: an official Zepp app feature outside mainland China, where
    // meals are logged by photo and stored as macros. Addressed by `eventType`
    // alone — there is no subType, hence `None`, and hence the connector had to
    // stop inventing one.
    //
    // Episodic on purpose. Food is hand-logged, so a quiet week means "this
    // person did not log", not "this account cannot". Asking a year back and
    // reporting the latest entry's date is the only reading that separates the
    // two, and the difference matters: it decides whether this is worth
    // building a stream for.
    (
        "food",
        ProbeSurface::V2Events,
        "Food",
        None,
        ProbeCadence::Episodic,
    ),
];

/// A stream ZeppBridge already reads successfully. If this comes back empty the
/// probe itself is broken (auth, window, transport) and no other row means
/// anything.
const CONTROL_POSITIVE: &str = "control_positive";

/// A name the server cannot know. If this comes back "empty" rather than
/// unavailable, then "empty" carries no information for any candidate.
const CONTROL_NEGATIVE: &str = "control_negative";

/// Field names seen at the top of a probed payload, capped so a surprising
/// response cannot turn into an unbounded list.
const MAX_PROBE_FIELDS: usize = 24;

/// Collect the field *names* a payload uses. Names are schema, not readings —
/// no measured value is ever read out of the payload here, and nothing the
/// probe returns is written to the database or to a log.
fn probe_field_names(items: &[Value]) -> Vec<String> {
    let mut names = BTreeSet::new();
    for item in items.iter().take(4) {
        let Some(object) = item.as_object() else {
            continue;
        };
        for (key, value) in object {
            names.insert(key.clone());
            // Event payloads nest the interesting schema one or two levels
            // down, under `value` and then `samples[]`.
            if key == "value" {
                if let Some(nested) = value.as_object() {
                    for (nested_key, nested_value) in nested {
                        names.insert(format!("value.{nested_key}"));
                        if nested_key == "samples" {
                            if let Some(sample) =
                                nested_value.as_array().and_then(|list| list.first())
                            {
                                if let Some(sample) = sample.as_object() {
                                    for sample_key in sample.keys() {
                                        names.insert(format!("value.samples[].{sample_key}"));
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    names.into_iter().take(MAX_PROBE_FIELDS).collect()
}

/// The calendar date of the newest item in a probed payload.
///
/// This is metadata, not a reading: for an episodic stream "last measured on
/// 2026-06-14" is the whole answer the user needs, and reporting it is the
/// difference between "no idea whether you have blood pressure data" and "you
/// do, you just have not measured since June".
fn probe_latest_date(items: &[Value]) -> Option<String> {
    let mut newest: Option<DateTime<Utc>> = None;
    for item in items {
        let Some(object) = item.as_object() else {
            continue;
        };
        let moment = ["timestamp", "time", "startTime", "date", "dateString"]
            .iter()
            .find_map(|key| object.get(*key).and_then(probe_moment));
        if let Some(moment) = moment {
            newest = Some(newest.map_or(moment, |best: DateTime<Utc>| best.max(moment)));
        }
    }
    newest.map(|moment| moment.format("%Y-%m-%d").to_string())
}

/// Read one timestamp-ish value: epoch seconds, epoch millis, or a date string.
fn probe_moment(value: &Value) -> Option<DateTime<Utc>> {
    match value {
        Value::Number(number) => {
            let raw = number.as_i64()?;
            let seconds = if raw >= 10_000_000_000 {
                raw / 1000
            } else {
                raw
            };
            DateTime::from_timestamp(seconds, 0)
        }
        Value::String(text) => {
            let text = text.trim();
            if let Ok(parsed) = DateTime::parse_from_rfc3339(text) {
                return Some(parsed.with_timezone(&Utc));
            }
            if let Ok(day) = NaiveDate::parse_from_str(text, "%Y-%m-%d") {
                return day.and_hms_opt(0, 0, 0).map(|naive| naive.and_utc());
            }
            text.parse::<i64>().ok().and_then(|raw| {
                let seconds = if raw >= 10_000_000_000 {
                    raw / 1000
                } else {
                    raw
                };
                DateTime::from_timestamp(seconds, 0)
            })
        }
        _ => None,
    }
}

impl DataFetcher {
    /// Ask the server, per candidate, whether a stream exists for this account.
    ///
    /// A probe never persists anything: the point is to replace guesswork
    /// ("another client can read HRV, so you should be able to") with a fact
    /// about *this* account and *these* devices. A stream that answers with no
    /// items is a different fact from one that 404s, and both are different
    /// from a stream ZeppBridge has not implemented.
    /// `only` narrows the run to named streams. The silent check that runs
    /// during a sync uses it: nine of the twelve capabilities are already
    /// answered by stored data, so asking the server about them would spend
    /// requests to learn something the database already knows.
    pub async fn probe_event_streams(
        &self,
        day: NaiveDate,
        time_zone: &str,
        only: Option<&[&str]>,
    ) -> Vec<CapabilityProbe> {
        let mut results = Vec::new();
        for (stream, surface, event_type, sub_type, cadence) in CAPABILITY_PROBES {
            if let Some(only) = only {
                if !only.contains(&stream) {
                    continue;
                }
            }
            let Some(start) = (day - Duration::days(cadence.days() - 1)).and_hms_opt(0, 0, 0)
            else {
                continue;
            };
            let Some(end) = day.and_hms_opt(23, 59, 59) else {
                continue;
            };
            let from = start.and_utc().timestamp_millis();
            let to = end.and_utc().timestamp_millis();

            let outcome = match surface {
                ProbeSurface::V2Events => {
                    self.connector
                        .fetch_events(event_type, sub_type, from, to, 50, true)
                        .await
                }
                ProbeSurface::UserEvents => {
                    self.connector
                        .fetch_user_events(event_type, sub_type, from, to, 50, true)
                        .await
                }
                ProbeSurface::UserEventsDay => {
                    self.connector
                        .fetch_user_events_date_string(
                            event_type,
                            sub_type.unwrap_or("odi"),
                            &start.and_utc().to_rfc3339(),
                            &end.and_utc().to_rfc3339(),
                            time_zone,
                            50,
                        )
                        .await
                }
                // Seconds, not milliseconds. See `fetch_weight_records`.
                ProbeSurface::WeightRecords => {
                    self.connector
                        .fetch_weight_records(
                            SCALE_ACCOUNT_MEMBER,
                            from / 1000,
                            to / 1000,
                            50,
                        )
                        .await
                }
                ProbeSurface::FileInfoEvents => {
                    self.connector
                        .fetch_file_info_events(
                            event_type,
                            sub_type.unwrap_or("real_data"),
                            from,
                            to,
                            50,
                        )
                        .await
                }
            };

            let mut probe = CapabilityProbe {
                stream: stream.to_string(),
                surface: surface.as_str().to_string(),
                cadence: cadence.as_str().to_string(),
                window_days: cadence.days(),
                event_type: event_type.to_string(),
                sub_type: sub_type.unwrap_or_default().to_string(),
                status: "error".to_string(),
                records: 0,
                latest_date: None,
                fields: Vec::new(),
            };
            match outcome {
                Ok(payload) => {
                    let items = payload_items(&payload);
                    probe.status = if items.is_empty() {
                        "empty".to_string()
                    } else {
                        "available".to_string()
                    };
                    probe.records = items.len();
                    probe.latest_date = probe_latest_date(&items);
                    probe.fields = probe_field_names(&items);
                }
                Err(error) if error.is_unavailable() => probe.status = "unavailable".to_string(),
                // The server's error body can echo request context, so only the
                // fact of the failure is kept.
                Err(_) => {}
            }
            results.push(probe);
        }
        results
    }
}

/// The optional wellness streams, as `(label, surface, eventType, subType)`.
///
/// Every entry here answered a live capability probe on a real account, so
/// these are fetched rather than guessed at. They are deliberately kept in one
/// raw stream: their payload shapes are not yet verified field by field, and
/// the architecture's rule is to retain the raw response and normalize only
/// what is recognised rather than invent a mapping.
/// Days per request for a stream that would otherwise be truncated.
///
/// The server caps a response at 1000 items. Blood oxygen samples every five
/// minutes, so a month asked for in one go returns barely three days and says
/// nothing at all about the rest.
const WELLNESS_CHUNK_DAYS: i64 = 7;

/// One optional stream: its label, which surface serves it, the event type and
/// sub type that name it, and how many days may be asked for at once.
type WellnessStream = (
    &'static str,
    ProbeSurface,
    &'static str,
    Option<&'static str>,
    Option<i64>,
);

const WELLNESS_STREAMS: [WellnessStream; 9] = [
    // The per-minute `Charge/stress_data` payload is a protobuf whose float
    // fields match none of the ranges the app displays, so the daily roll-up is
    // read from `all_day_stress` instead. Both are fetched: retaining the raw
    // per-minute response is what would let its shape be verified later.
    (
        "all_day_stress",
        ProbeSurface::UserEvents,
        "all_day_stress",
        None,
        None,
    ),
    (
        "stress",
        ProbeSurface::V2Events,
        "Charge",
        Some("stress_data"),
        None,
    ),
    (
        "respiratory_rate",
        ProbeSurface::V2Events,
        "RespiratoryRate",
        Some("real_data"),
        None,
    ),
    (
        "hrv_rmssd",
        ProbeSurface::V2Events,
        "HRVRMSSD",
        Some("real_data"),
        None,
    ),
    (
        "charge_insight",
        ProbeSurface::V2Events,
        "Charge",
        Some("insight_data"),
        None,
    ),
    (
        "lactate_threshold",
        ProbeSurface::V2Events,
        "LactateThreshold",
        Some("summary"),
        None,
    ),
    // No subType: `click` is one subset of this stream and it stops on
    // 2026-08-16, while the unfiltered stream runs to the present. Asking for
    // the subset and reading its exhaustion as the device going quiet is the
    // kind of silent gap this project exists to avoid.
    (
        "spo2",
        ProbeSurface::UserEvents,
        "blood_oxygen",
        None,
        Some(WELLNESS_CHUNK_DAYS),
    ),
    ("pai", ProbeSurface::UserEvents, "PaiHealthInfo", None, None),
    (
        "spo2_odi",
        ProbeSurface::UserEventsDay,
        "blood_oxygen",
        Some("odi"),
        Some(WELLNESS_CHUNK_DAYS),
    ),
];

impl DataFetcher {
    /// Fetch the optional wellness streams for a window.
    ///
    /// Each stream is independent: one that is unavailable for this account
    /// must not take the others down with it, so failures are collected rather
    /// than propagated. An empty result set is reported as unavailable so the
    /// sync surfaces "nothing came back" instead of a silent success.
    /// Weight and body composition.
    ///
    /// Its own fetcher rather than a row in `WELLNESS_STREAMS`, because it is
    /// its own surface: a different path, a different member dimension, and a
    /// window in **seconds** instead of milliseconds.
    ///
    /// Sliced by year. The endpoint truncates at `limit` instead of paging, so
    /// asking for five years in one request and taking what comes back would
    /// silently drop the oldest readings — which is what someone backfilling
    /// "at least 5 years of weigh-ins" is asking for in the first place.
    ///
    /// An empty result is **not** an error here. Weight is episodic and
    /// hand-logged as often as it is weighed; "no readings this year" is a fact
    /// about the year, not a failed request, and turning it into an error would
    /// mark the stream failed for every user who does not own a scale.
    pub async fn fetch_weight_records(&self, window: FetchWindow) -> Result<Vec<FetchedRecord>> {
        let mut records = Vec::new();
        let mut last_error = None;
        for slice in window.chunks(365) {
            match self
                .connector
                .fetch_weight_records(
                    SCALE_ACCOUNT_MEMBER,
                    slice.start_utc.timestamp(),
                    slice.end_utc.timestamp(),
                    WEIGHT_RECORD_LIMIT,
                )
                .await
            {
                Ok(payload) => records.push(FetchedRecord {
                    raw: RawRecord {
                        stream: "weight".into(),
                        source_key: format!(
                            "weight:{SCALE_ACCOUNT_MEMBER}:{}:{}",
                            slice.start_day(),
                            slice.end_day()
                        ),
                        source_scope: SourceScope::UserFused,
                        device_id: None,
                        start_utc: slice.start_utc,
                        end_utc: Some(slice.end_utc),
                        payload,
                        // The reading itself is verified — weight and BMI were
                        // read off a live account. The body-composition fields a
                        // scale adds on top are not, so the payload is retained
                        // and a replay can pick them up without another sync.
                        capability: CapabilityStatus::Unverified,
                    },
                }),
                Err(error) => last_error = Some(error),
            }
        }
        if records.is_empty() {
            return Err(last_error.unwrap_or_else(|| {
                ZeppBridgeError::Unavailable("体重记录接口没有返回任何内容".into())
            }));
        }
        Ok(records)
    }

    pub async fn fetch_wellness_records(
        &self,
        window: FetchWindow,
        time_zone: &str,
    ) -> Result<Vec<FetchedRecord>> {
        let mut records = Vec::new();
        let mut last_error = None;

        for (label, surface, event_type, sub_type, chunk_days) in WELLNESS_STREAMS {
            let slices = match chunk_days {
                Some(days) => window.chunks(days),
                None => vec![window],
            };
            for slice in slices {
                let from = slice.start_utc.timestamp_millis();
                let to = slice.end_utc.timestamp_millis();
                let outcome = match surface {
                    ProbeSurface::V2Events => {
                        self.connector
                            .fetch_events(event_type, sub_type, from, to, 1000, true)
                            .await
                    }
                    ProbeSurface::UserEvents => {
                        self.connector
                            .fetch_user_events(event_type, sub_type, from, to, 1000, true)
                            .await
                    }
                    ProbeSurface::UserEventsDay => {
                        self.connector
                            .fetch_user_events_date_string(
                                event_type,
                                sub_type.unwrap_or("odi"),
                                &slice.start_utc.to_rfc3339(),
                                &slice.end_utc.to_rfc3339(),
                                time_zone,
                                999,
                            )
                            .await
                    }
                    // Not reachable: `WELLNESS_STREAMS` has no weight row, because
                    // weight is not an event stream. It has its own fetcher.
                    ProbeSurface::WeightRecords => Err(ZeppBridgeError::Unavailable(
                        "体重不是事件流，不能从这里取".into(),
                    )),
                    ProbeSurface::FileInfoEvents => {
                        self.connector
                            .fetch_file_info_events(
                                event_type,
                                sub_type.unwrap_or("real_data"),
                                from,
                                to,
                                1000,
                            )
                            .await
                    }
                };
                match outcome {
                    Ok(payload) => records.push(FetchedRecord {
                        raw: RawRecord {
                            stream: "wellness".into(),
                            source_key: format!(
                                "wellness:{label}:{}:{}:{}",
                                surface.as_str(),
                                slice.start_day(),
                                slice.end_day()
                            ),
                            source_scope: SourceScope::UserFused,
                            device_id: None,
                            start_utc: slice.start_utc,
                            end_utc: Some(slice.end_utc),
                            payload,
                            // Shapes verified against a real response are parsed
                            // by the normalizer; the rest are retained raw so
                            // they can be verified without another round trip.
                            capability: CapabilityStatus::Unverified,
                        },
                    }),
                    Err(error) if error.is_unavailable() => last_error = Some(error),
                    Err(error) => last_error = Some(error),
                }
            }
        }

        if records.is_empty() {
            return Err(last_error.unwrap_or_else(|| {
                ZeppBridgeError::Unavailable("没有可用的可选健康数据流".into())
            }));
        }
        Ok(records)
    }
}

fn payload_items(payload: &Value) -> Vec<Value> {
    if let Some(items) = payload.get("items").and_then(Value::as_array) {
        return items.clone();
    }
    if let Some(items) = payload.get("data").and_then(Value::as_array) {
        return items.clone();
    }
    if let Some(items) = payload
        .get("data")
        .and_then(Value::as_object)
        .and_then(|object| object.get("items"))
        .and_then(Value::as_array)
    {
        return items.clone();
    }
    Vec::new()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn window_bounds_are_limited() {
        assert!(FetchWindow::days(0).is_err());
        assert!(FetchWindow::days(366).is_err());
        let window = FetchWindow::days(1).unwrap();
        assert!(window.end_utc > window.start_utc);
        assert_eq!(FetchWindow::days(30).unwrap().chunks(7).len(), 5);
    }

    #[test]
    fn heart_rate_items_accepts_known_payload_shapes() {
        let direct = json!({ "items": [{"timestamp": 1}, {"timestamp": 2}] });
        assert_eq!(heart_rate_items(&direct).len(), 2);
        let nested = json!({ "data": { "items": [{"timestamp": 3}] } });
        assert_eq!(heart_rate_items(&nested).len(), 1);
        let array = json!([{"timestamp": 4}]);
        assert_eq!(heart_rate_items(&array).len(), 1);
        assert!(heart_rate_items(&json!({ "other": true })).is_empty());
    }

    #[test]
    fn heart_rate_cursor_advances_past_max_timestamp() {
        let items = vec![
            json!({ "timestamp": 1_700_000_000i64, "value": 72 }),
            json!({ "time": "1700003600", "value": 80 }),
            json!({ "timeStamp": 1700007200000i64, "value": 88 }),
            json!({ "value": 99 }), // malformed: skipped
            json!("not an object"), // malformed: skipped
        ];
        // 最大值是 1700007200000（毫秒），游标必须换算成秒再进一格。
        assert_eq!(heart_rate_cursor(&items), Some(1_700_007_201i64));
        assert_eq!(heart_rate_cursor(&[]), None);
    }

    /// 游标和 `end` 必须是同一个单位。
    ///
    /// 这是上一版真正出问题的地方：旧实现对毫秒时间戳返回毫秒，而调用点拿它
    /// 去和秒级的 `end` 比较、再原样发进请求。断言游标值本身是不够的——要断言
    /// 它落在窗口里。
    #[test]
    fn heart_rate_cursor_stays_in_the_same_unit_as_the_window_end() {
        let window_start = 1_700_000_000i64;
        let window_end = 1_700_604_800i64;
        // 服务端回的是毫秒时间戳，落在窗口正中间。
        let items = vec![json!({ "timestamp": 1_700_300_000_000i64, "value": 70 })];
        let cursor = heart_rate_cursor(&items).expect("有可用时间戳时必须给出游标");
        assert!(
            cursor > window_start && cursor < window_end,
            "游标 {cursor} 落到了窗口 [{window_start}, {window_end}] 外面，下一页会返回空"
        );
    }

    #[test]
    fn payload_items_only_accept_structured_wrappers() {
        assert_eq!(payload_items(&json!({"items": [1, 2]})).len(), 2);
        assert_eq!(payload_items(&json!({"data": "encoded"})).len(), 0);
    }
}
