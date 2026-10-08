use chrono::{Duration, TimeZone, Utc};

use super::*;

/// 每秒一个点、匀速 `speed`，海拔由 `altitude(秒)` 给出。
fn track(
    seconds: i64,
    speed: Option<f64>,
    altitude: impl Fn(i64) -> Option<f64>,
) -> Vec<WorkoutSeriesSample> {
    let start = Utc.with_ymd_and_hms(2026, 9, 13, 7, 0, 0).unwrap();
    (0..seconds)
        .map(|second| WorkoutSeriesSample {
            timestamp: (start + Duration::seconds(second)).to_rfc3339(),
            heart_rate: Some(140),
            speed,
            altitude_m: altitude(second),
            ..WorkoutSeriesSample::default()
        })
        .collect()
}

/// 抖动 ±2 m 的确定性噪声：平路上它不能被认成爬升。
fn jitter(second: i64) -> f64 {
    ((second * 7919) % 9) as f64 / 2.0 - 2.0
}

#[test]
fn no_altitude_means_no_card() {
    assert_eq!(detect_climbs(&track(600, Some(3.0), |_| None), None), None);
}

#[test]
fn missing_speed_does_not_fake_distance() {
    let samples = track(1200, None, |s| Some(100.0 + s as f64 * 0.1));
    assert_eq!(detect_climbs(&samples, Some(3600.0)), None);
}

#[test]
fn flat_road_with_sensor_noise_has_no_segments() {
    let climbs = detect_climbs(&track(1800, Some(3.0), |s| Some(50.0 + jitter(s))), None).unwrap();
    assert!(climbs.segments.is_empty(), "{:?}", climbs.segments);
}

#[test]
fn one_hill_gives_one_climb_and_one_descent() {
    // 2 m/s：前 1000 秒爬 100 m（2 km，5%），后 1000 秒下来。
    let hill = |s: i64| {
        let up = if s <= 1000 { s } else { 2000 - s };
        Some(200.0 + up as f64 * 0.1 + jitter(s))
    };
    let climbs = detect_climbs(&track(2001, Some(2.0), hill), None).unwrap();
    assert_eq!(climbs.segments.len(), 2, "{:?}", climbs.segments);

    let up = &climbs.segments[0];
    assert_eq!(up.kind, ClimbKind::Climb);
    assert!((up.elevation_change_m - 100.0).abs() < 6.0, "{up:?}");
    assert!((up.average_grade_pct - 5.0).abs() < 0.5, "{up:?}");
    assert!(
        (up.vertical_speed_m_per_h.unwrap() - 360.0).abs() < 25.0,
        "{up:?}"
    );
    assert_eq!(up.average_hr, Some(140.0));
    assert!(
        (up.average_pace_min_per_km.unwrap() - 8.33).abs() < 0.1,
        "{up:?}"
    );

    let down = &climbs.segments[1];
    assert_eq!(down.kind, ClimbKind::Descent);
    assert!(down.elevation_change_m < -90.0, "{down:?}");
    assert!(down.start_distance_m >= up.end_distance_m);
}

#[test]
fn a_single_sensor_jump_is_not_a_climb() {
    // 跑到一半海拔读数断层 +80 m 后一直保持：真实落差是 0。
    let jump = |s: i64| Some(if s < 600 { 30.0 } else { 110.0 } + jitter(s));
    let climbs = detect_climbs(&track(1200, Some(3.0), jump), None).unwrap();
    assert!(climbs.segments.is_empty(), "{:?}", climbs.segments);
}

#[test]
fn recorded_distance_calibrates_the_integrated_one() {
    // 逐点速度偏低：积分只有 2 km，记录的是 2.5 km——坡度按记录距离算，不被高估。
    let ramp = |s: i64| Some(10.0 + s.min(1000) as f64 * 0.1);
    let samples = track(1001, Some(2.0), ramp);
    let climb = &detect_climbs(&samples, Some(2500.0)).unwrap().segments[0];
    assert!((climb.end_distance_m - 2500.0).abs() < 30.0, "{climb:?}");
    assert!((climb.average_grade_pct - 4.0).abs() < 0.4, "{climb:?}");
    // 差得离谱的记录距离不用来校准。
    let wild = &detect_climbs(&samples, Some(50_000.0)).unwrap().segments[0];
    assert!((wild.end_distance_m - 2000.0).abs() < 30.0, "{wild:?}");
}
