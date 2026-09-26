//! 乳酸阈、呼吸率、HRV、血氧、PAI、全天压力（从 normalizer/mod.rs 拆出）。

use super::*;

/// `value.samples[]` carries `dateString`, `lactateThresholdHr` (bpm) and
/// `lactateThresholdPace` (seconds per kilometre). Verified against the Zepp
/// app: 2026-08-11 reads 175 bpm and 309 s/km, which the app shows as
/// "175 次/分" and "05'09"/公里".
pub(super) fn lactate_threshold_metrics(items: &[Value], out: &mut WellnessNormalizedData) {
    for item in items {
        let Some(samples) = item
            .pointer("/value/samples")
            .and_then(Value::as_array)
            .filter(|list| !list.is_empty())
        else {
            continue;
        };
        for sample in samples {
            let Some(object) = sample.as_object() else {
                continue;
            };
            let Some(date) = first_string(object, &["dateString", "date"])
                .filter(|value| NaiveDate::parse_from_str(value, "%Y-%m-%d").is_ok())
            else {
                continue;
            };
            for (metric, keys, unit, range) in [
                (
                    "lactate_threshold_hr",
                    &["lactateThresholdHr"][..],
                    "bpm",
                    (60.0, 230.0),
                ),
                (
                    "lactate_threshold_pace",
                    &["lactateThresholdPace"][..],
                    "s/km",
                    (100.0, 1800.0),
                ),
            ] {
                if let Some(value) =
                    first_number(object, keys).filter(|value| (range.0..=range.1).contains(value))
                {
                    out.daily_metrics.push(DailyMetric {
                        date: date.clone(),
                        metric: metric.into(),
                        value,
                        unit: unit.into(),
                        source_scope: SourceScope::UserFused,
                        device_id: None,
                    });
                }
            }
        }
    }
}

/// `value.measurements` is base64 of 1440 bytes — one breaths-per-minute
/// reading per minute of the local day, with 0 meaning "not measured".
/// Verified physiologically: the non-zero values land between 11 and 18.
pub(super) fn respiratory_rate_metrics(items: &[Value], out: &mut WellnessNormalizedData) {
    for item in items {
        let Some(object) = item.as_object() else {
            continue;
        };
        let Some(encoded) = item
            .pointer("/value/measurements")
            .and_then(Value::as_str)
            .filter(|text| !text.is_empty())
        else {
            continue;
        };
        let Ok(bytes) = STANDARD.decode(encoded) else {
            out.diagnostics
                .push("respiratory_rate: measurements 不是合法 base64".into());
            continue;
        };
        // Physiologically impossible readings are sensor noise, not data.
        let readings: Vec<f64> = bytes
            .iter()
            .map(|value| f64::from(*value))
            .filter(|value| (4.0..=60.0).contains(value))
            .collect();
        if readings.is_empty() {
            continue;
        }
        let Some(date) = summary_date(object, None) else {
            continue;
        };
        let count = readings.len() as f64;
        let average = readings.iter().sum::<f64>() / count;
        let minimum = readings.iter().cloned().fold(f64::INFINITY, f64::min);
        let maximum = readings.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
        for (metric, value) in [
            ("respiratory_rate", (average * 10.0).round() / 10.0),
            ("respiratory_rate_min", minimum),
            ("respiratory_rate_max", maximum),
        ] {
            out.daily_metrics.push(DailyMetric {
                date: date.clone(),
                metric: metric.into(),
                value,
                unit: "brpm".into(),
                source_scope: SourceScope::Device,
                device_id: None,
            });
        }
    }
}

/// `value.samples[]` carries `{hrv, s}` where `s` is a millisecond offset from
/// `value.startTime` — the offsets step in whole minutes (0, 60000, 120000 …).
pub(super) fn hrv_rmssd_samples(items: &[Value], out: &mut WellnessNormalizedData) {
    for item in items {
        let Some(start) = item
            .pointer("/value/startTime")
            .and_then(Value::as_i64)
            .and_then(DateTime::from_timestamp_millis)
        else {
            continue;
        };
        let device = item
            .pointer("/value")
            .and_then(Value::as_object)
            .and_then(device_id);
        let Some(samples) = item.pointer("/value/samples").and_then(Value::as_array) else {
            continue;
        };
        for sample in samples {
            let Some(object) = sample.as_object() else {
                continue;
            };
            // RMSSD outside this band is a failed read, not a heart.
            let Some(value) = first_number(object, &["hrv", "rmssd"])
                .filter(|value| (1.0..=400.0).contains(value))
            else {
                continue;
            };
            let offset_ms = first_number(object, &["s", "offset"])
                .map(|value| value.round() as i64)
                .unwrap_or(0);
            let Some(timestamp) = add_milliseconds(start, offset_ms) else {
                continue;
            };
            out.metric_samples.push(MetricSample {
                metric: "hrv_rmssd".into(),
                timestamp,
                value,
                unit: "ms".into(),
                source_scope: SourceScope::Device,
                device_id: device.clone(),
            });
        }
    }
}

/// `blood_oxygen` is three different records under one event type, told apart
/// by `subType`:
///
/// - `click` — one spot reading, in an `extra` JSON string.
/// - `odi` — a night's oxygen-desaturation summary, flat on the item.
/// - `osa_event` — one apnea event, with the saturation it dipped to.
///
/// Asking for `click` alone was what made blood oxygen look like it stopped on
/// 2026-08-16: spot readings did stop, while the nightly summaries continued.
pub(super) fn spo2_samples(items: &[Value], out: &mut WellnessNormalizedData) {
    for item in items {
        let Some(object) = item.as_object() else {
            continue;
        };
        match first_string(object, &["subType"]).as_deref() {
            Some("odi") => {
                spo2_odi_metrics(object, out);
                continue;
            }
            Some("osa_event") => {
                spo2_apnea_sample(object, out);
                continue;
            }
            _ => {}
        }
        let Some(extra) = object
            .get("extra")
            .and_then(Value::as_str)
            .and_then(|text| serde_json::from_str::<Value>(text).ok())
        else {
            continue;
        };
        let Some(extra) = extra.as_object() else {
            continue;
        };
        // A saturation outside this band is a failed read.
        let Some(value) =
            first_number(extra, &["spo2", "value"]).filter(|value| (50.0..=100.0).contains(value))
        else {
            continue;
        };
        let Some(timestamp) = first_number(extra, &["timestamp"])
            .or_else(|| first_number(object, &["timestamp"]))
            .and_then(|millis| DateTime::from_timestamp_millis(millis.round() as i64))
        else {
            continue;
        };
        out.metric_samples.push(MetricSample {
            metric: "spo2".into(),
            timestamp,
            value,
            unit: "%".into(),
            source_scope: SourceScope::Device,
            device_id: device_id(extra),
        });
    }
}

/// A night's oxygen-desaturation summary. `odi` is events per hour, `odiNum`
/// the count, `score` the night's rating and `cost` how long the measurement
/// ran. `valid` is -1 on every record ever seen, so it is a constant rather
/// than a validity flag and is not used to gate anything.
pub(super) fn spo2_odi_metrics(object: &Map<String, Value>, out: &mut WellnessNormalizedData) {
    let Some(date) = summary_date(object, None) else {
        return;
    };
    for (metric, keys, unit, range) in [
        ("spo2_odi", &["odi"][..], "events/h", (0.0, 100.0)),
        ("spo2_odi_events", &["odiNum"][..], "count", (0.0, 1000.0)),
        ("spo2_night_score", &["score"][..], "score", (0.0, 100.0)),
    ] {
        if let Some(value) =
            first_number(object, keys).filter(|value| (range.0..=range.1).contains(value))
        {
            out.daily_metrics.push(DailyMetric {
                date: date.clone(),
                metric: metric.into(),
                value,
                unit: unit.into(),
                source_scope: SourceScope::Device,
                device_id: device_id(object),
            });
        }
    }
    // `cost` is the measured span in seconds; minutes are the unit every other
    // sleep figure in this database already uses.
    if let Some(seconds) =
        first_number(object, &["cost"]).filter(|value| (60.0..=86_400.0).contains(value))
    {
        out.daily_metrics.push(DailyMetric {
            date,
            metric: "spo2_measured_minutes".into(),
            value: (seconds / 60.0).round(),
            unit: "min".into(),
            source_scope: SourceScope::Device,
            device_id: device_id(object),
        });
    }
}

/// One apnea event's saturation low point.
///
/// Kept as its own metric rather than folded into `spo2`: these are by
/// definition the dips, and averaging them together with ordinary readings
/// would report a saturation the sleeper never sustained.
pub(super) fn spo2_apnea_sample(object: &Map<String, Value>, out: &mut WellnessNormalizedData) {
    let Some(extra) = object
        .get("extra")
        .and_then(Value::as_str)
        .and_then(|text| serde_json::from_str::<Value>(text).ok())
    else {
        return;
    };
    let Some(extra) = extra.as_object() else {
        return;
    };
    let Some(value) = first_number(extra, &["spo2_decrease", "spo2Decrease"])
        .filter(|value| (50.0..=100.0).contains(value))
    else {
        return;
    };
    let Some(timestamp) = first_number(extra, &["timestamp"])
        .or_else(|| first_number(object, &["timestamp"]))
        .and_then(|millis| DateTime::from_timestamp_millis(millis.round() as i64))
    else {
        return;
    };
    out.metric_samples.push(MetricSample {
        metric: "spo2_apnea_low".into(),
        timestamp,
        value,
        unit: "%".into(),
        source_scope: SourceScope::Device,
        device_id: device_id(extra),
    });
}

/// PAI items are flat — no `value` envelope. Alongside the score they carry the
/// watch's own `maxHr` and `restHr`, which are the only device-sourced heart
/// rate bounds available anywhere in this API.
pub(super) fn pai_metrics(items: &[Value], out: &mut WellnessNormalizedData) {
    for item in items {
        let Some(object) = item.as_object() else {
            continue;
        };
        let Some(date) = summary_date(object, None) else {
            continue;
        };
        for (metric, keys, unit, range) in [
            ("pai_daily", &["dailyPai"][..], "pai", (0.0, 500.0)),
            ("pai_low_zone", &["lowZonePai"][..], "pai", (0.0, 500.0)),
            (
                "pai_medium_zone",
                &["mediumZonePai"][..],
                "pai",
                (0.0, 500.0),
            ),
            ("pai_high_zone", &["highZonePai"][..], "pai", (0.0, 500.0)),
            ("device_max_hr", &["maxHr"][..], "bpm", (100.0, 240.0)),
            ("device_resting_hr", &["restHr"][..], "bpm", (25.0, 120.0)),
            // 七天滚动的 PAI 总分 —— Zepp 界面上那个大数字就是它，以前一直
            // 没取。本机 1 363 条 PaiHealthInfo 里实测 0–270.8。
            ("pai_total", &["totalPai"][..], "pai", (0.0, 1000.0)),
            // 三档区间各自待了多久。0 分钟是真的「这档一分钟都没进」，不是
            // 缺失，所以下界留在 0。实测 0–414 / 0–215 / 0–126。
            (
                "pai_low_zone_minutes",
                &["lowZoneMinutes"][..],
                "min",
                (0.0, 1440.0),
            ),
            (
                "pai_medium_zone_minutes",
                &["mediumZoneMinutes"][..],
                "min",
                (0.0, 1440.0),
            ),
            (
                "pai_high_zone_minutes",
                &["highZoneMinutes"][..],
                "min",
                (0.0, 1440.0),
            ),
            // 三档的心率下限。这是手表按用户的最大/静息心率算出来的，不是
            // 我们切的 —— 和运动详情页那份 `heart_range` 同理。实测低档
            // 90–105、中档恒 119、高档 158–159。
            (
                "pai_low_zone_lower_hr",
                &["lowZoneLowerLimit"][..],
                "bpm",
                (40.0, 240.0),
            ),
            (
                "pai_medium_zone_lower_hr",
                &["mediumZoneLowerLimit"][..],
                "bpm",
                (40.0, 240.0),
            ),
            (
                "pai_high_zone_lower_hr",
                &["highZoneLowerLimit"][..],
                "bpm",
                (40.0, 240.0),
            ),
        ] {
            if let Some(value) =
                first_number(object, keys).filter(|value| (range.0..=range.1).contains(value))
            {
                out.daily_metrics.push(DailyMetric {
                    date: date.clone(),
                    metric: metric.into(),
                    value,
                    unit: unit.into(),
                    source_scope: SourceScope::Device,
                    device_id: device_id(object),
                });
            }
        }
    }
}

/// The all-day stress roll-up. One item is one day, and it carries two
/// different things:
///
/// * the named daily fields — the day's average, its minimum and maximum, and
///   the share of the day spent in each of four bands;
/// * `data`, a JSON **string** holding that same day's whole curve as
///   `[{"time": <epoch ms>, "value": <1..100>}, ...]`, one reading roughly
///   every five minutes.
///
/// `data` is the 24/7 curve the watch itself draws, and it used to be dropped
/// on the floor — only the daily average reached the database, so nothing
/// downstream could ever show more than one point per day. A user reported the
/// stress display "isn't 24/7"; it was the reading that was missing, not the
/// measurement.
///
/// Checked against every one of this library's 1104 real items before wiring
/// it up: `minStress` and `maxStress` equal the series' own minimum and
/// maximum in 946 of the 946 items that carry them, and `avgStress` lands
/// within 3.9 of the series mean. The roll-up is computed from this curve, so
/// the two are one measurement rather than two streams that happen to agree.
///
/// The per-minute `Charge/stress_data` stream is a different payload and stays
/// unparsed: its protobuf floats still match no range the app displays.
pub(super) fn all_day_stress_metrics(items: &[Value], out: &mut WellnessNormalizedData) {
    for item in items {
        let Some(object) = item.as_object() else {
            continue;
        };
        let value = item.pointer("/value").and_then(Value::as_object);
        let Some(date) = summary_date(object, value) else {
            continue;
        };
        let device = value.and_then(device_id).or_else(|| device_id(object));
        for (metric, keys, unit, range) in [
            (
                "stress",
                &["avgStress", "averageStress", "stress"][..],
                "score",
                (0.0, 100.0),
            ),
            ("stress_min", &["minStress"][..], "score", (0.0, 100.0)),
            ("stress_max", &["maxStress"][..], "score", (0.0, 100.0)),
            // The four band shares. `relaxProportion` is the name the payload
            // actually uses; `relaxPct` was transcribed from another client and
            // has never matched a field in any of the 1104 items here, so on
            // its own it silently produced no rows at all. Verified name first,
            // the older guess kept behind it.
            (
                "stress_relaxed_pct",
                &["relaxProportion", "relaxPct"][..],
                "%",
                (0.0, 100.0),
            ),
            (
                "stress_normal_pct",
                &["normalProportion", "normalPct"][..],
                "%",
                (0.0, 100.0),
            ),
            (
                "stress_medium_pct",
                &["mediumProportion", "mediumPct"][..],
                "%",
                (0.0, 100.0),
            ),
            (
                "stress_high_pct",
                &["highProportion", "highPct"][..],
                "%",
                (0.0, 100.0),
            ),
        ] {
            if let Some(reading) = first_number_from(object, value, keys)
                .filter(|reading| (range.0..=range.1).contains(reading))
            {
                out.daily_metrics.push(DailyMetric {
                    date: date.clone(),
                    metric: metric.into(),
                    value: reading,
                    unit: unit.into(),
                    source_scope: SourceScope::Device,
                    device_id: device.clone(),
                });
            }
        }
        all_day_stress_curve(object, value, device.as_deref(), out);
    }
}

/// One day's stress curve, parsed out of the `data` string.
///
/// The band shares above put the boundaries at 1-39 / 40-59 / 60-79 / 80-100:
/// recomputing the four proportions from this series with that split
/// reproduces the reported figures to within 0.4 percentage points on average
/// across those 946 items, and they sum to exactly 100 in every one of them.
///
/// Zepp's scale starts at 1. A 0 never appears in any of the 62 626 distinct
/// readings this library holds (522 days of them), while
/// 0 is what these payloads use elsewhere to mean "nothing measured", so a
/// reading below 1 is dropped rather than drawn as an impossibly calm minute.
pub(super) fn all_day_stress_curve(
    object: &Map<String, Value>,
    nested: Option<&Map<String, Value>>,
    device: Option<&str>,
    out: &mut WellnessNormalizedData,
) {
    let Some(points) = first_value_from(object, nested, &["data"])
        .and_then(Value::as_str)
        .and_then(|text| serde_json::from_str::<Value>(text).ok())
    else {
        return;
    };
    let Some(points) = points.as_array() else {
        return;
    };
    for point in points {
        let Some(point) = point.as_object() else {
            continue;
        };
        let Some(reading) =
            first_number(point, &["value"]).filter(|reading| (1.0..=100.0).contains(reading))
        else {
            continue;
        };
        let Some(timestamp) = first_value(point, &["time", "timestamp"]).and_then(parse_timestamp)
        else {
            continue;
        };
        out.metric_samples.push(MetricSample {
            metric: "stress".into(),
            timestamp,
            value: reading,
            unit: "score".into(),
            source_scope: SourceScope::Device,
            device_id: device.map(str::to_string),
        });
    }
}
