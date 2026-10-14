//! 数值与解析的小工具（从 storage/mod.rs 按领域拆出，逻辑不变）。

use super::*;

/// One decimal place, which is as much precision as any of these sources
/// actually carries.
pub(super) fn round1(value: f64) -> f64 {
    (value * 10.0).round() / 10.0
}

pub(super) fn average_finite(values: impl Iterator<Item = f64>) -> Option<f64> {
    let values: Vec<f64> = values.filter(|value| value.is_finite()).collect();
    if values.is_empty() {
        None
    } else {
        Some(values.iter().sum::<f64>() / values.len() as f64)
    }
}

/// Zepp detail payloads encode speed as metres per second and the companion
/// `pace` field as its reciprocal (seconds per metre).  The frontend contract
/// uses the conventional running unit minutes per kilometre.
pub(super) fn pace_minutes_per_kilometre(pace: Option<f64>, speed: Option<f64>) -> Option<f64> {
    let from_speed = speed
        .filter(|value| value.is_finite() && *value > 0.0)
        .map(|value| 1_000.0 / (value * 60.0));
    let converted = from_speed.or_else(|| {
        pace.filter(|value| value.is_finite() && *value > 0.0)
            .map(|value| value * 1_000.0 / 60.0)
    });
    converted.filter(|value| *value >= 1.0 && *value < 60.0)
}

/// Drop equivalent-pace readings that describe standing still.
///
/// The device keeps emitting `equivPace` while a runner is stopped, which
/// produces values like 51604 s/km — fourteen hours per kilometre. Zepp's own
/// `avgEquivPace` excludes them by being distance-weighted, and the stored
/// column keeps exactly what the device sent; the filter belongs on the read
/// path, the same place `pace` is turned into minutes per kilometre. The
/// window matches that one: 1:00 to 60:00 per kilometre.
pub(super) fn plausible_equivalent_pace(seconds: Option<f64>) -> Option<f64> {
    seconds.filter(|value| value.is_finite() && (60.0..3_600.0).contains(value))
}

pub(super) fn parse_datetime(value: &str, field: &str) -> Result<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(value)
        .map(|dt| dt.with_timezone(&Utc))
        .map_err(|error| ZeppBridgeError::ParseError(format!("{field} 无效: {error}")))
}

pub(super) fn parse_scope(value: &str) -> Result<SourceScope> {
    match value.trim_matches('"') {
        "user_fused" | "UserFused" => Ok(SourceScope::UserFused),
        "device" | "Device" => Ok(SourceScope::Device),
        "unknown" | "Unknown" => Ok(SourceScope::Unknown),
        other => serde_json::from_str::<SourceScope>(value)
            .map_err(|_| ZeppBridgeError::ParseError(format!("source_scope 无效: {other}"))),
    }
}

pub(super) fn workout_id_from_detail_key(source_key: &str) -> Option<String> {
    let rest = source_key.strip_prefix("workout_detail:")?;
    let (workout_id, _) = rest.split_once(':')?;
    if workout_id.is_empty() {
        None
    } else {
        Some(workout_id.to_owned())
    }
}
