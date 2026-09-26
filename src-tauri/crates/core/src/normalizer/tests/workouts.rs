use super::*;

/// 云端一直在给、以前一个都没取的那批运动汇总字段。
///
/// 取值全部来自真实报文（trackid 1787901817，一次 6.37 km 健走）。
#[test]
fn workout_summary_fields_are_read_from_the_cloud_payload() {
    let raw = serde_json::json!({
        "data": [{
            "trackid": "1787901817",
            "type": 6,
            "start_time": 1787901817_i64,
            "end_time": 1787907220_i64,
            "dis": 6377.0,
            "calorie": 562,
            "avg_heart_rate": 115,
            "max_heart_rate": 143,
            "min_heart_rate": 83,
            "total_step": 8998,
            "run_time": "5403",
            "elevationGain": 5935,
            "elevationLoss": 5936,
            "highestAltitude": 9178,
            "lowestAltitude": 7867,
            "te": 22,
            "anaerobic_te": 1,
            "rpe": 3,
            "avg_frequency": "99.0",
            "max_frequency": 141,
            "avg_stride_length": 70,
            "heart_range": "1882,113;3486,141;10,154;0,162;0,173;0,190"
        }]
    });

    let records = Normalizer::normalize_workouts_with_sport(&raw, None).expect("应当能解析");
    let workout = records.first().expect("应当有一条运动");

    assert_eq!(workout.min_hr, Some(83));
    assert_eq!(workout.total_steps, Some(8998));
    assert_eq!(workout.moving_seconds, Some(5403));
    // 厘米换算成米
    assert_eq!(workout.elevation_gain_m, Some(59.35));
    assert_eq!(workout.elevation_loss_m, Some(59.36));
    assert_eq!(workout.max_altitude_m, Some(91.78));
    assert_eq!(workout.min_altitude_m, Some(78.67));
    // 训练效果是十倍整数
    assert_eq!(workout.training_effect, Some(2.2));
    assert_eq!(workout.anaerobic_training_effect, Some(0.1));
    assert_eq!(workout.rpe, Some(3));
    assert_eq!(workout.avg_cadence_spm, Some(99.0));
    assert_eq!(workout.max_cadence_spm, Some(141.0));
    assert_eq!(workout.avg_stride_cm, Some(70.0));

    // 心率区间分布
    assert_eq!(workout.hr_zones.len(), 6);
    assert_eq!(workout.hr_zones[0].upper_bound_bpm, 113);
    assert_eq!(workout.hr_zones[0].seconds, 1882);
    assert_eq!(workout.hr_zones[1].upper_bound_bpm, 141);
    assert_eq!(workout.hr_zones[1].seconds, 3486);
    assert_eq!(workout.hr_zones[5].seconds, 0);
    // 各段之和应当接近 run_time（实测 5378 vs 5403）
    let total: i64 = workout.hr_zones.iter().map(|z| z.seconds).sum();
    assert!(
        (total - 5403).abs() < 60,
        "区间秒数之和 {total} 应当接近 run_time 5403"
    );
}

#[test]
fn regression_markdown_heart_range_preserves_empty_zone_positions() {
    for raw in [
        ";10,141;;20,170;",
        ";10,141;broken;20,170;",
        ";10,141; ;20,170;",
    ] {
        let zones = parse_heart_range(Some(raw));
        assert_eq!(
            zones
                .iter()
                .map(|zone| (zone.index, zone.upper_bound_bpm, zone.seconds))
                .collect::<Vec<_>>(),
            vec![(1, 141, 10), (3, 170, 20)]
        );
    }
}

/// 全零的心率区间是「这次没有心率」，不是「每个区间待了 0 秒」。
#[test]
fn an_all_zero_heart_range_is_treated_as_absent() {
    assert!(parse_heart_range(Some("0,113;0,141;0,154")).is_empty());
    assert!(parse_heart_range(None).is_empty());
    assert!(parse_heart_range(Some("")).is_empty());
    // 上限为 0 的段直接丢掉，不占位
    let zones = parse_heart_range(Some("10,0;20,141"));
    assert_eq!(zones.len(), 1);
    assert_eq!(zones[0].upper_bound_bpm, 141);
}

/// 云端没给爬升时才回退到取整的米值。
#[test]
fn elevation_falls_back_to_the_metre_field_when_centimetres_are_absent() {
    let raw = serde_json::json!({
        "data": [{
            "trackid": "x", "type": 6,
            "start_time": 1787901817_i64, "end_time": 1787907220_i64,
            "altitude_ascend": 59, "altitude_descend": 59
        }]
    });
    let records = Normalizer::normalize_workouts_with_sport(&raw, None).unwrap();
    let workout = records.first().unwrap();
    assert_eq!(workout.elevation_gain_m, Some(59.0));
    assert_eq!(workout.elevation_loss_m, Some(59.0));
}

#[test]
fn workout_numeric_type_wins_over_endpoint_sport_name() {
    // /v1/sport/run/history.json 不带过滤会返回全部运动类型；
    // 记录自带的数字 type 必须优先于接口路径名，否则骑行/健走/AI 活动
    // 全部被错标成户外跑步。
    let result = Normalizer::normalize_workouts_with_sport(
            &json!({
                "data": {
                    "summary": [
                        {"trackid": 1_700_000_000i64, "end_time": 1_700_003_600i64, "type": 9, "dis": "50010.0"},
                        {"trackid": 1_700_100_000i64, "end_time": 1_700_103_600i64, "type": 223, "calorie": "40.0"},
                        {"trackid": 1_700_200_000i64, "end_time": 1_700_203_600i64, "type": 1, "dis": "15210.0"}
                    ]
                }
            }),
            Some("run"),
        )
        .unwrap();
    assert_eq!(result[0].workout_type, "ride");
    assert_eq!(result[0].zepp_type, Some(9));
    assert_eq!(result[1].workout_type, "activity");
    assert_eq!(result[2].workout_type, "run");
}

#[test]
fn issue_24_cloud_code_7_is_trail_running() {
    // Reconstructed cloud-shaped input from the public screenshot and
    // exported summary, not a claim that the full raw response was supplied.
    // The original workout ID, location and health measurements are omitted.
    for field in ["type", "sport_mode"] {
        for code in [json!(7), json!("7")] {
            let mut item = json!({
                "trackid": 1_700_000_000i64,
                "end_time": 1_700_000_600i64
            });
            item[field] = code;
            let workouts = Normalizer::normalize_workouts_with_sport(
                &json!({"data": {"summary": [item]}}),
                Some("run"),
            )
            .unwrap();
            let workout = &workouts[0];
            assert_eq!(workout.zepp_type, Some(7));
            assert_eq!(workout.normalized_type, "trail_running");
            assert_eq!(workout.workout_type, "trail_running");
            assert_eq!(workout.effective_type, "trail_running");
            assert_eq!(workout.type_source, "numeric_mapped");
            assert!(workout.user_override.is_none());
        }
    }
    let swims = Normalizer::normalize_workouts_with_sport(&json!({"data": [
            {"trackid": 1_700_001_000i64, "end_time": 1_700_001_600i64, "type": 14},
            {"trackid": 1_700_002_000i64, "end_time": 1_700_002_600i64, "sport_name": "Open Water Swimming"}
        ]}), None).unwrap();
    assert_eq!(swims[0].normalized_type, "pool_swimming");
    assert_eq!(swims[1].normalized_type, "open_water_swimming");
}

#[test]
fn code_225_is_normalized_as_rucking_with_numeric_evidence() {
    let result = Normalizer::normalize_workouts_with_sport(
        &json!({
            "data": { "summary": [{
                "trackid": 1_700_300_000i64,
                "end_time": 1_700_303_600i64,
                "type": 225,
                "calorie": 120
            }] }
        }),
        None,
    )
    .unwrap();
    assert_eq!(result[0].workout_type, "rucking");
    assert_eq!(result[0].normalized_type, "rucking");
    assert_eq!(result[0].type_source, "numeric_mapped");
    assert_eq!(result[0].effective_type, "rucking");
    assert_eq!(result[0].zepp_type, Some(225));
}

#[test]
fn unknown_numeric_workout_never_inherits_endpoint_sport_name() {
    let result = Normalizer::normalize_workouts_with_sport(
        &json!({
            "data": { "summary": [{
                "trackid": 1_700_300_000i64,
                "end_time": 1_700_303_600i64,
                "type": 105,
                "calorie": 120
            }] }
        }),
        Some("run"),
    )
    .unwrap();
    assert_eq!(result[0].zepp_type, Some(105));
    assert_eq!(result[0].normalized_type, "unknown:105");
    assert_eq!(result[0].type_source, "unknown_code");
    assert_eq!(result[0].effective_type, "unknown:105");
    assert_ne!(result[0].workout_type, "run");
}

#[test]
fn unknown_numeric_workout_uses_explicit_server_title_when_available() {
    let result = Normalizer::normalize_workouts_with_sport(
        &json!({
            "data": { "summary": [{
                "trackid": 1_700_350_000i64,
                "end_time": 1_700_353_600i64,
                "type": 240,
                "sport_title": "HYROX Training"
            }] }
        }),
        Some("run"),
    )
    .unwrap();
    assert_eq!(result[0].zepp_type, Some(240));
    assert_eq!(result[0].normalized_type, "hyrox_training");
    assert_eq!(result[0].type_source, "string_field");
    assert_ne!(result[0].workout_type, "run");
}

#[test]
fn extended_cloud_codes_cover_strength_and_cross_training() {
    let result = Normalizer::normalize_workouts_with_sport(
        &json!({
            "data": { "summary": [
                {"trackid": 1_700_600_000i64, "end_time": 1_700_603_600i64, "type": 52},
                {"trackid": 1_700_700_000i64, "end_time": 1_700_703_600i64, "type": 130}
            ] }
        }),
        None,
    )
    .unwrap();
    assert_eq!(result[0].workout_type, "strength");
    assert_eq!(result[1].workout_type, "cross_training");
}

#[test]
fn record_string_type_is_used_only_when_numeric_type_is_absent() {
    let result = Normalizer::normalize_workouts_with_sport(
            &json!({
                "data": { "summary": [
                    {"trackid": 1_700_400_000i64, "end_time": 1_700_403_600i64, "sportType": "Custom Training"},
                    {"trackid": 1_700_500_000i64, "end_time": 1_700_503_600i64}
                ] }
            }),
            Some("run"),
        )
        .unwrap();
    assert_eq!(result[0].normalized_type, "custom_training");
    assert_eq!(result[0].type_source, "string_field");
    assert_eq!(result[1].normalized_type, "unknown");
    assert_eq!(result[1].type_source, "missing");
}

#[test]
fn workout_geohash_location_is_not_gps_track() {
    let result = Normalizer::normalize_workouts_with_sport(
        &json!({
            "data": {
                "summary": [{
                    "trackid": 1_700_000_000i64,
                    "end_time": 1_700_003_600i64,
                    "sport": "run",
                    "dis": 5000,
                    "location": "ws0fsyhekz4d",
                    "deviceid": "AABBCCDDEEFF",
                    "sn": "23229501001311"
                }]
            }
        }),
        None,
    )
    .unwrap();
    assert!(!result[0].gps_available);
    assert_eq!(result[0].sample_count, 0);
    assert_eq!(result[0].device_id.as_deref(), Some("AABBCCDDEEFF"));
}
