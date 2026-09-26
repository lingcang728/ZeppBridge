//! 设备编号的清洗与来源范围判定（从 normalizer/mod.rs 拆出）。

use super::*;

pub(super) fn device_id(object: &Map<String, Value>) -> Option<String> {
    first_string(
        object,
        &["device_id", "deviceId", "deviceid", "sourceDeviceId"],
    )
    .and_then(|value| sanitize_device_id(&value))
}

/// The shortest observed real identifier is a 14-character serial; anything
/// shorter is bookkeeping, not a device.
pub(super) const MIN_DEVICE_ID_LEN: usize = 8;

/// A device id has to look like one. Zepp reuses these field names for
/// comma-joined bookkeeping — "1,", "1,-1", "1440,app", "3,D85403FFFEE4D576" —
/// and storing those verbatim mislabels which watch produced a metric (and
/// splits one device across several bogus ids). Take the longest
/// comma-separated segment and keep it only if it has serial shape; that also
/// recovers the real id out of "3,D85403FFFEE4D576". Unrecognisable values
/// become `None`, which is honest: the payload did not name a device.
pub(super) fn sanitize_device_id(value: &str) -> Option<String> {
    value
        .split(',')
        .map(str::trim)
        .filter(|segment| {
            segment.len() >= MIN_DEVICE_ID_LEN
                && segment.chars().all(|item| item.is_ascii_alphanumeric())
        })
        .max_by_key(|segment| segment.len())
        .map(str::to_owned)
}

/// Event types whose payload is an account-level aggregate rather than one
/// device's reading. They carry a bookkeeping `deviceId` that `device_id`
/// now rejects, so their provenance has to come from the event type instead
/// of from the presence of an id — otherwise they fall through to `Unknown`.
pub(super) const USER_FUSED_EVENT_TYPES: [&str; 2] = ["DailyHealth", "Charge"];

pub(super) fn source_scope(
    object: Option<&Map<String, Value>>,
    device_id: Option<&str>,
) -> SourceScope {
    if let Some(object) = object {
        if first_value(object, &["is_fused", "isFused"])
            .and_then(Value::as_bool)
            .unwrap_or(false)
            || first_string(object, &["source_scope", "sourceScope"])
                .map(|scope| scope.eq_ignore_ascii_case("user_fused"))
                .unwrap_or(false)
        {
            return SourceScope::UserFused;
        }
        if first_string(object, &["eventType"])
            .map(|event| {
                USER_FUSED_EVENT_TYPES
                    .iter()
                    .any(|known| known.eq_ignore_ascii_case(&event))
            })
            .unwrap_or(false)
        {
            return SourceScope::UserFused;
        }
    }
    if device_id.is_some() {
        SourceScope::Device
    } else {
        SourceScope::Unknown
    }
}

pub(super) fn duration_to_minutes(value: f64) -> i32 {
    // Zepp variants use either minutes or seconds for stage durations. Values
    // above one day in minutes are unambiguously seconds.
    if value > 24.0 * 60.0 {
        (value / 60.0).round() as i32
    } else {
        value.round() as i32
    }
}
