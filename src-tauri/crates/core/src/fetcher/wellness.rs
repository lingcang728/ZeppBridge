//! 健康事件与体重的分块抓取（从 fetcher/mod.rs 拆出，逻辑不变）。

use super::*;

/// The optional wellness streams, as `(label, surface, eventType, subType)`.
///
/// Every entry here answered a live capability probe on a real account, so
/// these are fetched rather than guessed at. They are deliberately kept in one
/// raw stream: their payload shapes are not yet verified field by field, and
/// the architecture's rule is to retain the raw response and normalize only
/// what is recognised rather than invent a mapping.
/// Days per request for a stream that would otherwise be truncated.
///
/// The server caps a response at [`WELLNESS_PAGE_LIMIT`] items and does not
/// page. Blood oxygen samples every five minutes, so a month asked for in one
/// go returns barely three days and says nothing at all about the rest.
pub(super) const WELLNESS_CHUNK_DAYS: i64 = 7;

/// Blood oxygen at a 5-minute cadence is 288 samples/day. Seven days is 2016
/// items, over the 1000-item cap, so a week asked for in one request would
/// look complete while dropping more than half the window. Three days stay
/// under the cap; a page that still fills it is marked `incomplete`.
pub(super) const SPO2_CHUNK_DAYS: i64 = 3;

/// `/events` and `/fileInfo/events` truncate at this many items.
pub(super) const WELLNESS_PAGE_LIMIT: i64 = 1000;

/// The dateString surface uses 999, matching the live client.
pub(super) const WELLNESS_DAY_PAGE_LIMIT: i64 = 999;

/// One optional stream: its label, which surface serves it, the event type and
/// sub type that name it, and how many days may be asked for at once.
pub(super) type WellnessStream = (
    &'static str,
    ProbeSurface,
    &'static str,
    Option<&'static str>,
    Option<i64>,
);

pub(super) const WELLNESS_STREAMS: [WellnessStream; 10] = [
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
        Some(SPO2_CHUNK_DAYS),
    ),
    ("pai", ProbeSurface::UserEvents, "PaiHealthInfo", None, None),
    (
        "spo2_odi",
        ProbeSurface::UserEventsDay,
        "blood_oxygen",
        Some("odi"),
        Some(WELLNESS_CHUNK_DAYS),
    ),
    // 饮食记录。大陆以外的 Zepp 应用里是官方功能，按餐拍照、存成宏量营养素。
    //
    // `subType` 必须是 `None`：这条流只用 `eventType` 寻址，编一个 subType 出来
    // 会拿回一个空页，而空页读起来和「这个人没记过饮食」一模一样——这正是
    // 2026-08-31 那次踩过的坑（见 connectors/zepp.rs 里 `fetch_events` 的注释）。
    //
    // 抓取窗口和别的可选流一样按周切：手动记录的量很小，但一次要一年会让
    // 一个从没记过饭的账号也付一次大请求的代价。
    (
        "food",
        ProbeSurface::V2Events,
        "Food",
        None,
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
                Ok(payload) => records.push(FetchedRecord::from_raw(RawRecord {
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
                })),
                Err(error) if is_abort_error(&error) => return Err(error),
                Err(error) => last_error = Some(error),
            }
        }
        conclude_slices(records, last_error, "体重记录接口没有返回任何内容")
    }

    pub async fn fetch_wellness_records(
        &self,
        window: FetchWindow,
        time_zone: &str,
    ) -> Result<Vec<FetchedRecord>> {
        let mut records = Vec::new();
        let mut last_error = None;
        let mut failures = Vec::new();

        for (label, surface, event_type, sub_type, chunk_days) in WELLNESS_STREAMS {
            let slices = match chunk_days {
                Some(days) => window.chunks(days),
                None => vec![window],
            };
            for slice in slices {
                let from = slice.start_utc.timestamp_millis();
                let to = slice.end_utc.timestamp_millis();
                let limit = wellness_request_limit(surface);
                let outcome = match surface {
                    ProbeSurface::V2Events => {
                        self.connector
                            .fetch_events(event_type, sub_type, from, to, limit, true)
                            .await
                    }
                    ProbeSurface::UserEvents => {
                        self.connector
                            .fetch_user_events(event_type, sub_type, from, to, limit, true)
                            .await
                    }
                    ProbeSurface::UserEventsDay => match slice.local_days(time_zone) {
                        Ok((start_date, end_date)) => {
                            self.connector
                                .fetch_user_events_date_string(
                                    event_type,
                                    sub_type.unwrap_or("odi"),
                                    start_date,
                                    end_date,
                                    time_zone,
                                    limit,
                                )
                                .await
                        }
                        Err(error) => Err(error),
                    },
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
                                limit,
                            )
                            .await
                    }
                };
                match outcome {
                    Ok(payload) => records.push(fetched_wellness_record(
                        label, surface, &slice, payload, limit,
                    )),
                    Err(error) if is_abort_error(&error) => return Err(error),
                    Err(error) => {
                        failures.push(format!(
                            "{label} ({}..{}): {error}",
                            slice.start_day(),
                            slice.end_day()
                        ));
                        // A stream this account simply doesn't have (404 /
                        // Unavailable) is an expected fact about the account,
                        // not evidence that the *other*, unrelated streams in
                        // this window are incomplete. Only a genuine request
                        // failure should hold the whole window back from
                        // being marked persisted — otherwise an account
                        // missing just one optional stream (e.g. no
                        // lactate-threshold readings) never finishes
                        // backfilling any wellness stream.
                        if !error.is_unavailable() {
                            last_error = Some(error);
                        }
                    }
                }
            }
        }

        // Keep cap diagnostics as well as request errors when both occur.
        failures.extend(
            records
                .iter()
                .filter_map(|record| record.incomplete_reason.clone()),
        );
        let mut records = conclude_slices(records, last_error, "没有可用的可选健康数据流")?;
        if !failures.is_empty() {
            let reason = failures.join("; ");
            for record in &mut records {
                record.incomplete_reason = Some(reason.clone());
            }
        }
        Ok(records)
    }
}

pub(super) fn wellness_request_limit(surface: ProbeSurface) -> i64 {
    match surface {
        ProbeSurface::UserEventsDay => WELLNESS_DAY_PAGE_LIMIT,
        _ => WELLNESS_PAGE_LIMIT,
    }
}

/// Keep the items that arrived, but do not treat a truncated page as the
/// whole window. The server stops at `limit` instead of paging.
pub(super) fn fetched_wellness_record(
    label: &str,
    surface: ProbeSurface,
    slice: &FetchWindow,
    payload: Value,
    limit: i64,
) -> FetchedRecord {
    let truncated = wellness_page_hits_cap(&payload, limit);
    let mut record = FetchedRecord::from_raw(RawRecord {
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
    });
    record.incomplete = truncated;
    if truncated {
        record.incomplete_reason =
            Some(format!("{label}: response reached the {limit}-item limit"));
    }
    record
}

pub(super) fn wellness_page_hits_cap(payload: &Value, limit: i64) -> bool {
    let limit = usize::try_from(limit).unwrap_or(usize::MAX);
    limit > 0 && payload_items(payload).len() >= limit
}

pub(super) fn payload_items(payload: &Value) -> Vec<Value> {
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
