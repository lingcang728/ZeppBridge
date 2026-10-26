//! GPX 与 TCX：一份文件可能有好几段轨迹 / 好几个活动，每段读成一次运动。

use super::xml::{attr, child_text, elements, number, parse_time};
use super::{activity_from_track, text_sport, ParsedFile, TrackPoint};

/// 读 GPX。`sport_hint` 是外面已经知道的类型（Strava 的 CSV 里写着），文件里的 `<type>` 让位给它。
pub fn parse_gpx(text: &str, sport_hint: Option<&str>) -> ParsedFile {
    let mut file = ParsedFile::default();
    for track in elements(text, "trk") {
        let sport = sport_hint
            .map(str::to_string)
            .or_else(|| child_text(track, "type").map(|kind| text_sport(&kind).to_string()))
            .unwrap_or_else(|| "activity".into());
        let name = child_text(track, "name");
        let points: Vec<TrackPoint> = elements(track, "trkpt")
            .into_iter()
            .map(gpx_point)
            .collect();
        match activity_from_track(points, sport, name) {
            Some(activity) => file.activities.push(activity),
            None => file.unreadable += 1,
        }
    }
    if file.activities.is_empty() && file.unreadable == 0 {
        file.unreadable = 1;
    }
    file
}

fn gpx_point(element: &str) -> TrackPoint {
    TrackPoint {
        time: child_text(element, "time").and_then(|t| parse_time(&t)),
        latitude: number(attr(element, "lat")),
        longitude: number(attr(element, "lon")),
        altitude_m: number(child_text(element, "ele")),
        // Garmin TrackPointExtension（`gpxtpx:hr`）和别家的 `hr` / `heartrate` 都认。
        heart_rate: number(child_text(element, "hr").or_else(|| child_text(element, "heartrate")))
            .map(|v| v.round() as i32),
        cadence: number(child_text(element, "cad").or_else(|| child_text(element, "cadence"))),
        power_watts: number(child_text(element, "power")),
        distance_m: None,
    }
}

/// 读 TCX（Garmin Training Center，Strava 的整包导出里很多是它）。
pub fn parse_tcx(text: &str, sport_hint: Option<&str>) -> ParsedFile {
    let mut file = ParsedFile::default();
    for activity in elements(text, "Activity") {
        let sport = sport_hint
            .map(str::to_string)
            .or_else(|| attr(activity, "Sport").map(|kind| text_sport(&kind).to_string()))
            .unwrap_or_else(|| "activity".into());
        let points: Vec<TrackPoint> = elements(activity, "Trackpoint")
            .into_iter()
            .map(tcx_point)
            .collect();
        let calories: i32 = elements(activity, "Lap")
            .iter()
            .filter_map(|lap| number(child_text(lap, "Calories")))
            .map(|v| v.round() as i32)
            .sum();
        match activity_from_track(points, sport, None) {
            Some(mut parsed) => {
                parsed.calories = (calories > 0).then_some(calories);
                file.activities.push(parsed);
            }
            None => file.unreadable += 1,
        }
    }
    if file.activities.is_empty() && file.unreadable == 0 {
        file.unreadable = 1;
    }
    file
}

fn tcx_point(element: &str) -> TrackPoint {
    let position = elements(element, "Position").into_iter().next();
    let heart = elements(element, "HeartRateBpm").into_iter().next();
    TrackPoint {
        time: child_text(element, "Time").and_then(|t| parse_time(&t)),
        latitude: position.and_then(|p| number(child_text(p, "LatitudeDegrees"))),
        longitude: position.and_then(|p| number(child_text(p, "LongitudeDegrees"))),
        altitude_m: number(child_text(element, "AltitudeMeters")),
        heart_rate: heart
            .and_then(|h| number(child_text(h, "Value")))
            .map(|v| v.round() as i32),
        cadence: number(
            child_text(element, "Cadence").or_else(|| child_text(element, "RunCadence")),
        ),
        power_watts: number(child_text(element, "Watts")),
        distance_m: number(child_text(element, "DistanceMeters")),
    }
}
