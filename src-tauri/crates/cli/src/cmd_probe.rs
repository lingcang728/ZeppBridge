//! Read-only cloud diagnostics. No database opened and no measured values printed.
use super::*;
use zeppbridge_core::fetcher::{FetchWindow, FetchedRecord};
use zeppbridge_core::normalizer::{payload_is_explicitly_empty, Normalizer};

pub(super) fn cmd_probe(args: &[String]) -> u8 {
    let json_mode = scan_json_flag(args);
    let flags = match Flags::parse(args) {
        Ok(flags) => flags,
        Err(message) => return fail(json_mode, EXIT_USAGE, "usage", &message),
    };
    if let Err(message) = flags
        .reject_unknown(&["json", "streams", "days"])
        .and_then(|_| flags.reject_duplicates())
    {
        return fail(json_mode, EXIT_USAGE, "usage", &message);
    }
    if ["streams", "days"]
        .iter()
        .any(|key| flags.has(key) && flags.get(key).is_none())
    {
        return fail(
            json_mode,
            EXIT_USAGE,
            "usage",
            "--streams and --days require values",
        );
    }
    let streams: Vec<&str> = flags
        .get("streams")
        .unwrap_or("blood_pressure")
        .split(',')
        .map(str::trim)
        .collect();
    if streams
        .iter()
        .any(|stream| !["blood_pressure", "heart_rate", "daily_summary"].contains(stream))
    {
        return fail(
            json_mode,
            EXIT_USAGE,
            "usage",
            "Allowed streams: blood_pressure,heart_rate,daily_summary",
        );
    }
    let days = match flags.get("days").unwrap_or("7").parse::<i64>() {
        Ok(days) if (1..=365).contains(&days) => days,
        _ => {
            return fail(
                json_mode,
                EXIT_USAGE,
                "usage",
                "--days must be between 1 and 365",
            )
        }
    };
    let dir = match data_dir() {
        Ok(dir) => dir,
        Err(message) => return fail(json_mode, EXIT_FAILED, "failed", &message),
    };
    let auth = match AuthManager::new(dir).load_auth() {
        Ok(Some(auth)) => auth,
        Ok(None) => {
            return fail(
                json_mode,
                EXIT_NOT_CONFIGURED,
                "not_configured",
                "No Zepp account connected",
            )
        }
        Err(error) => {
            let (code, kind) = exit_code_for(&error);
            return fail(json_mode, code, kind, &user_text(&error));
        }
    };
    let connector = match ZeppConnector::new(auth) {
        Ok(connector) => connector,
        Err(error) => {
            let (code, kind) = exit_code_for(&error);
            return fail(json_mode, code, kind, &user_text(&error));
        }
    };
    let runtime = match tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
    {
        Ok(runtime) => runtime,
        Err(error) => return fail(json_mode, EXIT_FAILED, "failed", &error.to_string()),
    };
    let value = runtime.block_on(async {
        let fetcher = DataFetcher::new(connector);
        let mut results = Vec::new();
        if streams.contains(&"blood_pressure") {
            results.push(serde_json::json!({"stream":"blood_pressure", "candidates":
                fetcher.probe_event_streams(Local::now().date_naive(), "UTC", Some(&["blood_pressure"])).await}));
        }
        let window = FetchWindow::days(days).expect("validated days");
        for stream in ["heart_rate", "daily_summary"] {
            if !streams.contains(&stream) { continue; }
            let outcome = if stream == "heart_rate" {
                fetcher.fetch_heart_rate_records(window).await
            } else {
                fetcher.fetch_daily_statistics_records(window).await
            };
            let stop = outcome.as_ref().is_err_and(|error| error.needs_reauth() || error.is_cancelled());
            let heart_rate = stream == "heart_rate";
            let (mut summary, mut errors, fallback) = match outcome {
                Ok(records) => summarize_responses(stream, days, &records),
                Err(error) => (
                    serde_json::json!({"stream":stream, "windowDays":days,
                        "directStatus": if error.is_unavailable() { "unavailable" } else { "fetch_failed" },
                        "errorCode":error.code(), "message":user_text(&error)}),
                    BTreeSet::new(),
                    heart_rate && error.is_unavailable(),
                ),
            };
            if fallback {
                let band_days = days.min(7);
                summary["bandWindowDays"] = band_days.into();
                let band = fetcher.fetch_sleep_record(FetchWindow::days(band_days).expect("validated days")).await;
                let (state, count) = match band {
                    Ok(record) if payload_is_explicitly_empty(&record.raw.payload) => ("empty", Some(0)),
                    Ok(record) => match Normalizer::normalize_band_data(&record.raw.payload) {
                        Ok(band) if !band.heart_rate_samples.is_empty() => ("parsed", Some(band.heart_rate_samples.len())),
                        Ok(_) => ("no_heart_rate_samples", Some(0)),
                        Err(error) => {
                            errors.insert(format!("band_data: {}", error.code()));
                            ("parse_failed", None)
                        }
                    },
                    Err(error) => {
                        errors.insert(format!("band_data: {}", error.code()));
                        ("fetch_failed", None)
                    }
                };
                summary["bandStatus"] = state.into();
                summary["bandHeartRateSamples"] = serde_json::json!(count);
            }
            summary["errors"] = serde_json::json!(errors);
            results.push(summary);
            if stop { break; }
        }
        serde_json::json!({"imported":false, "results":results})
    });
    emit(
        json_mode,
        value.clone(),
        &serde_json::to_string_pretty(&value).unwrap_or_default(),
    );
    EXIT_OK
}

fn summarize_responses(
    stream: &str,
    days: i64,
    records: &[FetchedRecord],
) -> (serde_json::Value, BTreeSet<String>, bool) {
    let heart_rate = stream == "heart_rate";
    let mut parsed = 0;
    let mut empty = 0;
    let mut without_usable_metrics = 0;
    let mut daily_dates = BTreeSet::new();
    let mut daily_metrics = BTreeSet::new();
    let mut errors = BTreeSet::new();
    for record in records {
        if let Some(reason) = &record.incomplete_reason {
            errors.insert(reason.clone());
        }
        let payload = &record.raw.payload;
        if payload_is_explicitly_empty(payload) {
            empty += 1;
            continue;
        }
        let count = if heart_rate {
            Normalizer::normalize_heart_rate(payload).map(|samples| samples.len())
        } else {
            Normalizer::normalize_daily_summary(payload).map(|rows| {
                daily_dates.extend(rows.iter().map(|row| row.date.clone()));
                daily_metrics.extend(rows.iter().map(|row| row.metric.clone()));
                rows.len()
            })
        };
        match count {
            Ok(count) => parsed += count,
            Err(error) => {
                without_usable_metrics += 1;
                errors.insert(format!("{stream}: {}", error.code()));
            }
        }
    }
    let incomplete = records.iter().any(|record| record.incomplete);
    let status = match (incomplete, without_usable_metrics, parsed) {
        (true, _, _) => "incomplete",
        (false, 0, 0) if empty == records.len() => "empty",
        (false, 0, 0) => "no_samples",
        (false, 0, _) => "parsed",
        (false, _, 0) => "parse_failed",
        (false, _, _) => "partly_parsed",
    };
    (
        serde_json::json!({
            "stream": stream, "windowDays": days, "rawResponses": records.len(),
            "incomplete": incomplete, "directStatus": status, "emptyResponses": empty,
            "parsedHeartRateSamples": heart_rate.then_some(parsed),
            "bandHeartRateSamples": null, "bandWindowDays": null, "bandStatus": null,
            "parsedDailyMetricRows": (!heart_rate).then_some(parsed),
            "dailyMetricDays": (!heart_rate).then_some(daily_dates.len()),
            "dailyMetricNames": daily_metrics,
            "responsesWithoutUsableMetrics": without_usable_metrics,
        }),
        errors,
        heart_rate && parsed == 0,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use zeppbridge_core::models::{CapabilityStatus, RawRecord, SourceScope};

    #[test]
    fn direct_heart_rate_distinguishes_empty_responses_from_unreadable_records() {
        let response = |payload| FetchedRecord {
            incomplete: false,
            incomplete_reason: None,
            raw: RawRecord {
                stream: "heart_rate".into(),
                source_key: "probe-fixture".into(),
                source_scope: SourceScope::UserFused,
                device_id: None,
                start_utc: chrono::Utc::now(),
                end_utc: None,
                payload,
                capability: CapabilityStatus::Verified,
            },
        };
        let empty = response(serde_json::json!({"items": []}));
        let (summary, errors, fallback) =
            summarize_responses("heart_rate", 7, std::slice::from_ref(&empty));
        assert_eq!(summary["directStatus"], "empty");
        assert_eq!(summary["responsesWithoutUsableMetrics"], 0);
        assert!(errors.is_empty());
        assert!(fallback);

        let unreadable = response(serde_json::json!({"items": [{"unexpected": true}]}));
        let (summary, errors, fallback) =
            summarize_responses("heart_rate", 7, &[empty, unreadable]);
        assert_eq!(summary["directStatus"], "parse_failed");
        assert_eq!(summary["emptyResponses"], 1);
        assert_eq!(summary["responsesWithoutUsableMetrics"], 1);
        assert_eq!(errors.len(), 1);
        assert!(fallback);
    }
}
