//! 能力探测：逐个事件面试一页，只记字段名与最新日期（从 fetcher/mod.rs 拆出，逻辑不变）。

use super::*;

#[allow(dead_code)]
/// Which of the three Zepp event surfaces a candidate lives on.
///
/// They are not variants of one endpoint: the same `blood_oxygen` name returns
/// nothing on `/v2/users/me/events` and real readings on `/users/{id}/events`.
/// A probe that only knew the v2 path concluded this account had no blood
/// oxygen at all, which the Zepp app disproved.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum ProbeSurface {
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
    pub(super) fn as_str(self) -> &'static str {
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
pub(super) enum ProbeCadence {
    /// Sampled all day, every day: a week is plenty and keeps the probe cheap.
    Continuous,
    /// Measured occasionally. Look back a year and report the latest reading's
    /// date rather than declaring the stream unknown.
    Episodic,
}

impl ProbeCadence {
    pub(super) fn days(self) -> i64 {
        match self {
            ProbeCadence::Continuous => 7,
            ProbeCadence::Episodic => 365,
        }
    }

    pub(super) fn as_str(self) -> &'static str {
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
pub(super) const WEIGHT_RECORD_LIMIT: i64 = 300;

pub(super) const CAPABILITY_PROBES: [(&str, ProbeSurface, &str, Option<&str>, ProbeCadence); 20] = [
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
pub(super) const CONTROL_POSITIVE: &str = "control_positive";

/// A name the server cannot know. If this comes back "empty" rather than
/// unavailable, then "empty" carries no information for any candidate.
pub(super) const CONTROL_NEGATIVE: &str = "control_negative";

/// Field names seen at the top of a probed payload, capped so a surprising
/// response cannot turn into an unbounded list.
pub(super) const MAX_PROBE_FIELDS: usize = 24;

/// Collect the field *names* a payload uses. Names are schema, not readings —
/// no measured value is ever read out of the payload here. Field names are
/// returned to diagnostics but not saved with the capability summary.
pub(super) fn probe_field_names(items: &[Value]) -> Vec<String> {
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
pub(super) fn probe_latest_date(items: &[Value]) -> Option<String> {
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
pub(super) fn probe_moment(value: &Value) -> Option<DateTime<Utc>> {
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
                            start.date(),
                            end.date(),
                            time_zone,
                            50,
                        )
                        .await
                }
                // Seconds, not milliseconds. See `fetch_weight_records`.
                ProbeSurface::WeightRecords => {
                    self.connector
                        .fetch_weight_records(SCALE_ACCOUNT_MEMBER, from / 1000, to / 1000, 50)
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
                Err(error) if is_abort_error(&error) => {
                    // 取消 / 需要重新登录不是这条流的能力事实。半截 7 天
                    // 窗口不能当成一次完整探测写进库。
                    return Vec::new();
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
