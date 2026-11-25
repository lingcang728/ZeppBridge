//! 相册视图的聚合：轨迹轮廓、入睡时刻的平均、每周区间时长。

use super::super::hr_zones::zone_weeks;
use super::super::record_album::{minutes_after_noon, route_shape};
use super::*;

/// 轮廓只留形状：长边为 1、北在上，点数有上限，原地没动的不画。
#[test]
fn route_shape_keeps_the_outline_not_the_coordinates() {
    // 往北 0.01 度、再往东 0.01 度（纬度 60 度：东西方向只有一半长）。
    let mut points = Vec::new();
    for i in 0..=100 {
        points.push((60.0 + f64::from(i) * 0.0001, 10.0));
    }
    for i in 1..=100 {
        points.push((60.01, 10.0 + f64::from(i) * 0.0001));
    }
    let shape = route_shape("w1", &points).expect("a real route has a shape");
    assert_eq!(shape.points.len(), 40);
    assert_eq!(shape.height, 1.0);
    assert!(
        (shape.width - 0.5).abs() < 0.01,
        "east-west is squeezed by cos(latitude)"
    );
    // 起点在南（下边），终点在东北角。
    assert_eq!(shape.points[0], [0.0, 1.0]);
    let last = shape.points[39];
    assert!((last[0] - 0.5).abs() < 0.01 && last[1].abs() < 0.001);
    assert!(shape
        .points
        .iter()
        .flatten()
        .all(|v| (0.0..=1.0).contains(v)));

    let still = vec![(30.0, 120.0); 50];
    assert!(
        route_shape("w2", &still).is_none(),
        "no movement, no outline"
    );
    assert!(route_shape("w3", &[(30.0, 120.0)]).is_none());
}

/// 入睡时刻按「中午之后多少分钟」平均：23:30 和 00:30 的平均是午夜，不是中午。
#[test]
fn onset_minutes_do_not_split_at_midnight() {
    assert_eq!(minutes_after_noon("23:30"), Some(690.0));
    assert_eq!(minutes_after_noon("00:30"), Some(750.0));
    assert_eq!(minutes_after_noon("12:00"), Some(0.0));
    assert_eq!(minutes_after_noon("garbage"), None);
}

/// 每周区间：周一起算，按区间的闭区间归档，区间外的不算进任何一段，但那一周仍然在。
#[test]
fn zone_weeks_fold_days_into_monday_weeks() {
    let zone = |zone: i32, min_bpm: i32, max_bpm: i32| HeartRateZoneRow {
        zone,
        label: String::new(),
        min_bpm,
        max_bpm,
        seconds: 0,
    };
    let zones = vec![zone(1, 100, 119), zone(2, 120, 139)];
    let day = |text: &str| NaiveDate::parse_from_str(text, "%Y-%m-%d").unwrap();
    // 2026-11-23 是周一，11-29 是周日，11-30 是下一个周一。
    let weeks = zone_weeks(
        &zones,
        &[
            (day("2026-11-23"), 110, 60),
            (day("2026-11-29"), 120, 30),
            (day("2026-11-29"), 139, 5),
            (day("2026-11-30"), 90, 40),
        ],
    );
    assert_eq!(weeks.len(), 2);
    assert_eq!(weeks[0].week_start, "2026-11-23");
    assert_eq!(weeks[0].seconds, vec![60, 35]);
    assert_eq!(weeks[1].week_start, "2026-11-30");
    assert_eq!(weeks[1].seconds, vec![0, 0], "below zone 1 counts nowhere");
}

/// 列表页一次批量读回心率区间；按月汇总取当月最长、带轨迹的那条做封面；分期条按这一晚的开始算分钟。
#[test]
fn album_queries_read_months_shapes_strips_and_batch_zones() {
    let db = Database::in_memory().unwrap();
    let start = ts();
    let mut short = workout_with_type(Some(1), "running", "numeric_mapped");
    short.workout_id = "short".into();
    short.distance_meters = Some(3000.0);
    let mut long = workout_with_type(Some(1), "running", "numeric_mapped");
    long.workout_id = "long".into();
    long.start_time = start + chrono::Duration::hours(3);
    long.end_time = long.start_time + chrono::Duration::minutes(60);
    long.distance_meters = Some(9000.0);
    long.gps_available = true;
    db.insert_workout(&short).unwrap();
    db.insert_workout(&long).unwrap();
    for i in 0..50 {
        db.conn
            .execute(
                "INSERT INTO route_points(workout_id, timestamp, latitude, longitude)
                     VALUES ('long', ?1, ?2, 10.0)",
                rusqlite::params![
                    (long.start_time + chrono::Duration::seconds(i)).to_rfc3339(),
                    45.0 + f64::from(i as i32) * 0.0002
                ],
            )
            .unwrap();
    }
    for (index, seconds) in [(0, 600), (1, 1200), (2, 0)] {
        db.conn
            .execute(
                "INSERT INTO workout_hr_zones(workout_id, zone_index, upper_bound_bpm, seconds)
                     VALUES ('long', ?1, ?2, ?3)",
                rusqlite::params![index, 120 + index * 20, seconds],
            )
            .unwrap();
    }

    let page = db.workouts_page(50, 0).unwrap();
    let zones = &page
        .iter()
        .find(|w| w.workout_id == "long")
        .unwrap()
        .hr_zones;
    assert_eq!(
        zones.iter().map(|z| z.seconds).collect::<Vec<_>>(),
        vec![600, 1200, 0]
    );
    assert!(page
        .iter()
        .find(|w| w.workout_id == "short")
        .unwrap()
        .hr_zones
        .is_empty());

    let months = db.workout_months().unwrap();
    let total: i64 = months.iter().map(|m| m.count).sum();
    assert_eq!(total, 2);
    let cover_month = months.iter().find(|m| m.cover.is_some()).unwrap();
    assert_eq!(cover_month.cover.as_ref().unwrap().workout_id, "long");
    assert_eq!(cover_month.cover_distance_m, Some(9000.0));

    let shapes = db
        .workout_route_shapes(&["long".into(), "short".into(), "missing".into()])
        .unwrap();
    assert_eq!(shapes.len(), 1, "only workouts with a route get a shape");
    assert!(shapes[0].points.len() <= 40);

    db.insert_sleep_session(&SleepSession {
        sleep_id: "night".into(),
        start_time: start,
        end_time: start + chrono::Duration::minutes(420),
        score: Some(70),
        duration_minutes: 400,
        deep_minutes: Some(60),
        light_minutes: Some(260),
        rem_minutes: Some(60),
        awake_minutes: Some(20),
        source_scope: SourceScope::Device,
        device_id: None,
        synced_at: None,
        time_in_bed_minutes: None,
        wake_count: None,
        stages: Vec::new(),
    })
    .unwrap();
    db.conn
        .execute(
            "INSERT INTO sleep_stages(sleep_id, stage, start_time, end_time) VALUES ('night', 'deep', ?1, ?2)",
            [
                (start + chrono::Duration::minutes(30)).to_rfc3339(),
                (start + chrono::Duration::minutes(90)).to_rfc3339(),
            ],
        )
        .unwrap();
    let strips = db
        .sleep_stage_strips(&["night".into(), "nope".into()])
        .unwrap();
    let night = strips.iter().find(|s| s.sleep_id == "night").unwrap();
    assert_eq!(night.spans.len(), 1);
    assert!((night.spans[0].from_min - 30.0).abs() < 0.1);
    assert!((night.spans[0].to_min - 90.0).abs() < 0.1);
    let sleep_months = db.sleep_months().unwrap();
    assert_eq!(sleep_months.iter().map(|m| m.nights).sum::<i64>(), 1);
    assert_eq!(sleep_months[0].deep_min, 60.0);
    assert_eq!(sleep_months[0].avg_score, Some(70.0));
    assert_eq!(sleep_months[0].score_nights, 1);
    assert_eq!(sleep_months[0].onset_sd_min, Some(0.0));
}
