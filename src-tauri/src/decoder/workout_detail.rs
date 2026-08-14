//! Decode Zepp `/v1/sport/run/detail.json` delta strings.
//!
//! Algorithm follows H3llK33p3r/zepp-fit-extractor (`SportContainer` in
//! `io/IO.kt`, Apache-2.0). Field meanings come from that project's
//! `SportDetail` comments. We do not copy their real-GPS fixtures.

use crate::models::error::*;
use chrono::{DateTime, TimeZone, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;

const COORD_FACTOR: f64 = 100_000_000.0;
const INVALID_ALTITUDE_CM: i64 = -2_000_000;
const MAX_ACTIVITY_SECONDS: i64 = 12 * 60 * 60;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct RoutePoint {
    pub timestamp: DateTime<Utc>,
    pub latitude: f64,
    pub longitude: f64,
    pub altitude_m: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct WorkoutSample {
    pub timestamp: DateTime<Utc>,
    pub heart_rate: Option<i32>,
    pub speed: Option<f64>,
    pub pace: Option<f64>,
    pub cadence: Option<f64>,
    pub stride_cm: Option<f64>,
    pub altitude_m: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PauseInterval {
    pub start_time: DateTime<Utc>,
    pub end_time: DateTime<Utc>,
    pub kind: String,
}

#[derive(Debug, Clone, Default, PartialEq)]
pub struct DecodedWorkout {
    pub track_id: i64,
    pub source: Option<String>,
    pub start_time: DateTime<Utc>,
    pub end_time: DateTime<Utc>,
    pub route: Vec<RoutePoint>,
    pub samples: Vec<WorkoutSample>,
    pub pauses: Vec<PauseInterval>,
}

pub fn decode_workout_detail(
    raw: &Value,
    summary_end: Option<DateTime<Utc>>,
) -> Result<DecodedWorkout> {
    let data = detail_object(raw)
        .ok_or_else(|| ZeppBridgeError::ParseError("workout detail 缺少 data 对象".into()))?;

    let track_id = parse_i64(data.get("trackid"))
        .ok_or_else(|| ZeppBridgeError::ParseError("workout detail 缺少 trackid".into()))?;
    if track_id <= 0 {
        return Err(ZeppBridgeError::ParseError(
            "workout detail trackid 无效".into(),
        ));
    }

    let start_time = Utc
        .timestamp_opt(track_id, 0)
        .single()
        .ok_or_else(|| ZeppBridgeError::ParseError("workout detail trackid 不是合法时间".into()))?;

    let source = data
        .get("source")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned);

    let time_deltas = parse_int_list(data.get("time"));
    let time_sum: i64 = time_deltas
        .iter()
        .map(|value| i64::from(*value.max(&0)))
        .sum();
    let time_end = start_time + chrono::Duration::seconds(time_sum);
    let end_time = match summary_end {
        Some(summary) if summary > time_end => summary,
        _ => time_end.max(start_time + chrono::Duration::seconds(1)),
    };

    let duration_secs = (end_time - start_time)
        .num_seconds()
        .clamp(1, MAX_ACTIVITY_SECONDS);
    let from = track_id;
    let to = track_id + duration_secs;

    let (latitudes, longitudes) = parse_coordinate_deltas(data.get("longitude_latitude"));
    let altitudes_cm = parse_altitude_cm(data.get("altitude"));
    let hr_pairs = parse_delta_pairs(data.get("heart_rate"), true);
    let speed_pairs = parse_float_pairs(data.get("speed"));
    let gait = parse_gait(data.get("gait"));
    let pauses = parse_pauses(data.get("pause"));

    let heart_rates = if hr_pairs.is_empty() {
        None
    } else {
        Some(timed_cumulative_i32(from, to, &hr_pairs))
    };
    let speeds = if speed_pairs.is_empty() {
        None
    } else {
        Some(timed_fixed_f64(from, to, &speed_pairs))
    };
    let (steps, strides, cadences) = if gait.is_empty() {
        (None, None, None)
    } else {
        let step_pairs: Vec<(i64, i32)> = gait.iter().map(|row| (row.0, row.1)).collect();
        let stride_pairs: Vec<(i64, f64)> =
            gait.iter().map(|row| (row.0, f64::from(row.2))).collect();
        let cadence_pairs: Vec<(i64, f64)> =
            gait.iter().map(|row| (row.0, f64::from(row.3))).collect();
        (
            Some(timed_cumulative_i32(from, to, &step_pairs)),
            Some(timed_fixed_f64(from, to, &stride_pairs)),
            Some(timed_fixed_f64(from, to, &cadence_pairs)),
        )
    };
    let _ = steps;

    let mut route = Vec::new();
    let mut altitude_by_second: std::collections::BTreeMap<i64, f64> =
        std::collections::BTreeMap::new();
    if !time_deltas.is_empty() && !latitudes.is_empty() && !longitudes.is_empty() {
        let mut unix_ts = from;
        let mut latitude = 0i64;
        let mut longitude = 0i64;
        let count = time_deltas.len().min(latitudes.len()).min(longitudes.len());
        for index in 0..count {
            unix_ts += i64::from(time_deltas[index].max(0));
            if let (Some(lat_delta), Some(lon_delta)) = (latitudes[index], longitudes[index]) {
                latitude += lat_delta;
                longitude += lon_delta;
                let altitude_m = altitudes_cm.get(index).copied().and_then(cm_to_meters);
                if let Some(meters) = altitude_m {
                    altitude_by_second.insert(unix_ts, meters);
                }
                if let Some(timestamp) = Utc.timestamp_opt(unix_ts, 0).single() {
                    route.push(RoutePoint {
                        timestamp,
                        latitude: latitude as f64 / COORD_FACTOR,
                        longitude: longitude as f64 / COORD_FACTOR,
                        altitude_m,
                    });
                }
            }
        }
    }

    let mut samples = Vec::with_capacity(duration_secs as usize);
    let mut last_altitude = None;
    for offset in 0..=duration_secs {
        let unix_ts = from + offset;
        let Some(timestamp) = Utc.timestamp_opt(unix_ts, 0).single() else {
            continue;
        };
        if let Some(altitude) = altitude_by_second.get(&unix_ts).copied() {
            last_altitude = Some(altitude);
        }
        let speed = speeds.as_ref().and_then(|map| map.get(&unix_ts).copied());
        let pace = speed.filter(|value| *value > 0.0).map(|value| 1.0 / value);
        samples.push(WorkoutSample {
            timestamp,
            heart_rate: heart_rates
                .as_ref()
                .and_then(|map| map.get(&unix_ts).copied())
                .filter(|value| *value > 0),
            speed,
            pace,
            cadence: cadences.as_ref().and_then(|map| map.get(&unix_ts).copied()),
            stride_cm: strides.as_ref().and_then(|map| map.get(&unix_ts).copied()),
            altitude_m: last_altitude,
        });
    }

    Ok(DecodedWorkout {
        track_id,
        source,
        start_time,
        end_time,
        route,
        samples,
        pauses,
    })
}

fn detail_object(raw: &Value) -> Option<&serde_json::Map<String, Value>> {
    if let Some(data) = raw.get("data").and_then(Value::as_object) {
        if data.contains_key("trackid") || data.contains_key("longitude_latitude") {
            return Some(data);
        }
    }
    raw.as_object()
}

fn parse_i64(value: Option<&Value>) -> Option<i64> {
    match value? {
        Value::Number(number) => number.as_i64(),
        Value::String(text) => text.trim().parse().ok(),
        _ => None,
    }
}

fn parse_int_list(value: Option<&Value>) -> Vec<i32> {
    let Some(text) = value.and_then(Value::as_str) else {
        return Vec::new();
    };
    text.split(';')
        .filter(|part| !part.is_empty())
        .filter_map(|part| part.parse().ok())
        .collect()
}

fn parse_coordinate_deltas(value: Option<&Value>) -> (Vec<Option<i64>>, Vec<Option<i64>>) {
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

fn parse_altitude_cm(value: Option<&Value>) -> Vec<i64> {
    let mut values = parse_int_list(value)
        .into_iter()
        .map(i64::from)
        .collect::<Vec<_>>();
    if let Some(first_valid) = values
        .iter()
        .position(|value| *value != INVALID_ALTITUDE_CM)
    {
        let fill = values[first_valid];
        for item in values.iter_mut().take(first_valid) {
            *item = fill;
        }
    }
    values
}

fn cm_to_meters(cm: i64) -> Option<f64> {
    if cm == INVALID_ALTITUDE_CM {
        None
    } else {
        Some(cm as f64 / 100.0)
    }
}

fn parse_delta_pairs(value: Option<&Value>, empty_delta_is_one: bool) -> Vec<(i64, i32)> {
    let Some(text) = value.and_then(Value::as_str) else {
        return Vec::new();
    };
    let mut pairs = Vec::new();
    for part in text.split(';').filter(|part| !part.is_empty()) {
        let mut bits = part.splitn(2, ',');
        let raw_delta = bits.next().unwrap_or("");
        let raw_value = bits.next().unwrap_or("");
        let delta = if raw_delta.is_empty() && empty_delta_is_one {
            1
        } else {
            raw_delta.parse().unwrap_or(0)
        };
        let Some(sample) = raw_value.parse::<i32>().ok() else {
            continue;
        };
        pairs.push((delta, sample));
    }
    pairs
}

fn parse_float_pairs(value: Option<&Value>) -> Vec<(i64, f64)> {
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

fn parse_gait(value: Option<&Value>) -> Vec<(i64, i32, i32, i32)> {
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

fn parse_pauses(value: Option<&Value>) -> Vec<PauseInterval> {
    let Some(text) = value.and_then(Value::as_str) else {
        return Vec::new();
    };
    let mut pauses = Vec::new();
    for part in text.split(';').filter(|part| !part.is_empty()) {
        let bits: Vec<&str> = part.split(',').collect();
        if bits.len() < 5 {
            continue;
        }
        let Some(start) = bits[0].parse::<i64>().ok() else {
            continue;
        };
        let Some(end_delta) = bits[1].parse::<i64>().ok() else {
            continue;
        };
        let kind = match bits[4].parse::<i32>().unwrap_or(0) {
            2 => "manual",
            3 => "auto",
            other => {
                if other == 0 {
                    "unknown"
                } else {
                    continue;
                }
            }
        };
        let Some(start_time) = Utc.timestamp_opt(start, 0).single() else {
            continue;
        };
        let Some(end_time) = Utc.timestamp_opt(start + end_delta.max(0), 0).single() else {
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
    pauses
}

fn timed_cumulative_i32(
    from: i64,
    to: i64,
    elements: &[(i64, i32)],
) -> std::collections::HashMap<i64, i32> {
    timed_fill(from, to, elements, 0, |current, delta| {
        current.saturating_add(*delta)
    })
}

fn timed_fixed_f64(
    from: i64,
    to: i64,
    elements: &[(i64, f64)],
) -> std::collections::HashMap<i64, f64> {
    timed_fill(from, to, elements, 0.0, |_, value| *value)
}

fn timed_fill<T: Copy>(
    from: i64,
    to: i64,
    elements: &[(i64, T)],
    init: T,
    update: impl Fn(T, &T) -> T,
) -> std::collections::HashMap<i64, T> {
    let mut result = std::collections::HashMap::new();
    let mut working = from;
    let mut value = init;
    for (index, (delta, sample)) in elements.iter().enumerate() {
        value = update(value, sample);
        let start = if index == 0 { 0 } else { 1 };
        if *delta >= start {
            for _ in start..=*delta {
                result.insert(working, value);
                working += 1;
                if working > to + 1 {
                    break;
                }
            }
        }
    }
    while working <= to {
        result.insert(working, value);
        working += 1;
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn decodes_documented_gps_deltas() {
        let raw = json!({
            "trackid": 1_700_000_000i64,
            "source": "run.gps",
            "time": "0;2;2;",
            "longitude_latitude": "4004663552,11629333504;16403,8392;;;;14877,8392;",
            "altitude": "-2000000;7800;7772;",
            "heart_rate": "11,80;0,10;7,-6;",
            "speed": "2,1.20;4,2.45;",
            "gait": "2,0,71,160;2,2,74,164;",
            "pause": "1700000060,10,1,2,2;"
        });
        let decoded = decode_workout_detail(
            &raw,
            Some(Utc.timestamp_opt(1_700_000_030, 0).single().unwrap()),
        )
        .unwrap();
        assert_eq!(decoded.track_id, 1_700_000_000);
        assert_eq!(decoded.route.len(), 3);
        assert!((decoded.route[0].latitude - 40.04663552).abs() < 1e-8);
        assert!((decoded.route[0].longitude - 116.29333504).abs() < 1e-8);
        let second = &decoded.route[1];
        assert!((second.latitude - (40.04663552 + 16403.0 / COORD_FACTOR)).abs() < 1e-8);
        assert_eq!(decoded.route[0].altitude_m, Some(78.0));
        assert!(decoded
            .samples
            .iter()
            .any(|sample| sample.heart_rate == Some(80)));
        assert!(decoded
            .samples
            .iter()
            .any(|sample| sample.heart_rate == Some(84)));
        assert_eq!(decoded.pauses.len(), 1);
        assert_eq!(decoded.pauses[0].kind, "manual");
        assert!(decoded
            .samples
            .iter()
            .any(|sample| sample.stride_cm == Some(71.0)));
    }

    #[test]
    fn indoor_without_gps_has_no_route() {
        let raw = json!({
            "trackid": 1_700_000_100i64,
            "time": "1;1;1;",
            "heart_rate": "1,120;1,2;1,-1;"
        });
        let decoded = decode_workout_detail(&raw, None).unwrap();
        assert!(decoded.route.is_empty());
        assert!(!decoded.samples.is_empty());
        assert!(decoded
            .samples
            .iter()
            .any(|sample| sample.heart_rate == Some(121)));
    }

    #[test]
    fn missing_trackid_is_an_error() {
        let raw = json!({ "time": "1;1;" });
        assert!(decode_workout_detail(&raw, None).is_err());
    }

    #[test]
    fn empty_heart_rate_does_not_invent_zeros() {
        let raw = json!({
            "data": {
                "trackid": 1_700_000_200i64,
                "time": "1;1;",
                "longitude_latitude": "1,1;2,2;"
            }
        });
        let decoded = decode_workout_detail(&raw, None).unwrap();
        assert!(decoded
            .samples
            .iter()
            .all(|sample| sample.heart_rate.is_none()));
        assert_eq!(decoded.route.len(), 2);
    }
}
