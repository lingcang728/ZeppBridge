//! Read-only cloud diagnostics. No database opened and no measured values printed.
use super::*;
use zeppbridge_core::fetcher::FetchWindow;
use zeppbridge_core::normalizer::Normalizer;

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
            match outcome {
                Ok(records) => {
                    let mut parsed = 0;
                    let mut parsed_daily = 0;
                    let mut daily_dates = BTreeSet::new();
                    let mut daily_metrics = BTreeSet::new();
                    let mut without_usable_metrics = 0;
                    let mut errors = BTreeSet::new();
                    for record in &records {
                        if let Some(reason) = &record.incomplete_reason { errors.insert(reason.clone()); }
                        if stream == "heart_rate" {
                            if let Ok(samples) = Normalizer::normalize_heart_rate(&record.raw.payload) { parsed += samples.len(); }
                        } else {
                            match Normalizer::normalize_daily_summary(&record.raw.payload) {
                                Ok(rows) => {
                                    parsed_daily += rows.len();
                                    daily_dates.extend(rows.iter().map(|row| row.date.clone()));
                                    daily_metrics.extend(rows.into_iter().map(|row| row.metric));
                                }
                                Err(_) => without_usable_metrics += 1,
                            }
                        }
                    }
                    let mut band_samples = None;
                    if stream == "heart_rate" && parsed == 0 {
                        // The independent endpoint is empty for many accounts.
                        // Check the actual alternate source rather than inferring
                        // that the watch has no heart-rate data.
                        match fetcher.fetch_sleep_record(FetchWindow::days(days.min(7)).expect("validated days")).await {
                            Ok(record) => match Normalizer::normalize_band_data(&record.raw.payload) {
                                Ok(band) => band_samples = Some(band.heart_rate_samples.len()),
                                Err(error) => { errors.insert(format!("band_data: {}", error.code())); }
                            },
                            Err(error) => { errors.insert(format!("band_data: {}", error.code())); }
                        }
                    }
                    results.push(serde_json::json!({"stream":stream, "windowDays":days,
                        "rawResponses":records.len(), "incomplete":records.iter().any(|r| r.incomplete),
                        "parsedHeartRateSamples": if stream == "heart_rate" { Some(parsed) } else { None },
                        "bandHeartRateSamples":band_samples, "bandWindowDays":if band_samples.is_some() { Some(days.min(7)) } else { None },
                        "parsedDailyMetricRows": if stream == "daily_summary" { Some(parsed_daily) } else { None },
                        "dailyMetricDays":if stream == "daily_summary" { Some(daily_dates.len()) } else { None },
                        "dailyMetricNames":daily_metrics, "responsesWithoutUsableMetrics":without_usable_metrics,
                        "errors":errors}));
                }
                Err(error) => {
                    results.push(serde_json::json!({"stream":stream, "windowDays":days, "errorCode":error.code(), "message":error.user_message()}));
                    if error.needs_reauth() || error.is_cancelled() { break; }
                }
            }
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
