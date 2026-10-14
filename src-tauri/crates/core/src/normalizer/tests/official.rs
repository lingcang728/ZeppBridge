//! 官方开放平台报文。夹具是按 2026-09-29 实测结构手写的合成数据，不含任何人的真实记录。

use super::*;

/// 2026-09-22 00:00 +08:00。
const SHANGHAI_MIDNIGHT: i64 = 1_789_920_000;

fn night(start_minute: i64, stop_minute: i64) -> Value {
    json!({
        "date": "2026-09-22",
        "deepSleepTime": 90, "shallowSleepTime": 250, "wakeTime": 10, "rem": 100,
        "start": SHANGHAI_MIDNIGHT + start_minute * 60,
        "stop": SHANGHAI_MIDNIGHT + stop_minute * 60,
        "sleepScore": 84, "rhr": 58, "sleepHrv": 70,
        "stage": [
            {"start": start_minute, "stop": start_minute + 59, "mode": 4},
            {"start": start_minute + 60, "stop": start_minute + 119, "mode": 5},
            {"start": start_minute + 120, "stop": start_minute + 180, "mode": 13}
        ],
        "napStage": [{"start": 800, "stop": 819, "mode": 4}]
    })
}

#[test]
fn official_sleep_anchors_stages_to_the_local_midnight_behind_the_session() {
    let raw = json!({ "items": [night(1443, 1893)], "timeZone": "Asia/Shanghai" });
    let nights = Normalizer::normalize_official_sleep(&raw);
    assert_eq!(nights.len(), 1);
    let session = &nights[0].session;
    assert_eq!(
        session.sleep_id,
        format!("official:{}", SHANGHAI_MIDNIGHT + 1443 * 60)
    );
    assert_eq!(session.stages[0].start_time, session.start_time);
    // 认不出的 mode 是 unknown，留下原始码；不是 awake。
    assert_eq!(session.stages[2].stage, "unknown");
    assert_eq!(session.stages[2].raw_mode, Some(13));
    assert_eq!(session.duration_minutes, 450 - 10);
    assert_eq!(session.rem_minutes, Some(100));
    assert_eq!(nights[0].rem_seconds, Some(6000));
    assert_eq!(nights[0].nap_total_seconds, Some(20 * 60));
}

#[test]
fn official_sleep_skips_days_without_a_session_and_never_invents_naps_or_scores() {
    let mut empty_nap = night(1443, 1893);
    empty_nap["napStage"] = json!([]);
    empty_nap["sleepScore"] = json!(0);
    let mut no_nap_field = night(1443, 1893);
    no_nap_field.as_object_mut().unwrap().remove("napStage");
    let raw = json!({ "items": [
        {"date": "2026-09-23", "start": 0, "stop": 0, "stage": []},
        empty_nap,
    ]});
    let nights = Normalizer::normalize_official_sleep(&raw);
    assert_eq!(nights.len(), 1);
    assert_eq!(nights[0].nap_total_seconds, Some(0));
    assert_eq!(nights[0].session.score, None);
    let other = Normalizer::normalize_official_sleep(&json!({ "items": [no_nap_field] }));
    assert_eq!(other[0].nap_total_seconds, None);
}

#[test]
fn a_stage_anchor_that_does_not_line_up_with_any_time_zone_is_refused() {
    assert_eq!(
        official_stage_anchor(SHANGHAI_MIDNIGHT + 1443 * 60, 1443),
        Some(SHANGHAI_MIDNIGHT)
    );
    // 最早一段比会话开始晚一小时以上：对不上，不画阶段条。
    assert_eq!(
        official_stage_anchor(SHANGHAI_MIDNIGHT + 1443 * 60, 1443 - 60 * 12 - 40),
        None
    );
}

#[test]
fn unworn_minutes_are_not_heart_rate_readings() {
    let raw = json!({ "items": [
        {"date": "2026-09-28", "minute": 0, "heartRateData": 0, "timestamp": 1_790_524_800, "measureType": "AUTO"},
        {"date": "2026-09-28", "minute": 1, "heartRateData": 63, "timestamp": 1_790_524_860, "measureType": "AUTO"}
    ]});
    let samples = Normalizer::normalize_official_heart_rate(&raw);
    assert_eq!(samples.len(), 1);
    assert_eq!(samples[0].value, 63.0);
    assert_eq!(samples[0].unit, "bpm");
}

#[test]
fn hourly_steps_need_the_request_time_zone_and_are_not_zero_filled() {
    let items = json!([{"date": "2026-09-28", "hour": 11, "steps": 208}]);
    assert!(Normalizer::normalize_official_activity_hourly(&json!({ "items": items })).is_empty());
    let samples = Normalizer::normalize_official_activity_hourly(
        &json!({ "items": items, "timeZone": "Asia/Shanghai" }),
    );
    assert_eq!(samples.len(), 1);
    assert_eq!(samples[0].metric, "steps_hourly");
    // 上海 11 点 = 03:00Z。
    assert_eq!(
        samples[0].timestamp.to_rfc3339(),
        "2026-09-28T03:00:00+00:00"
    );
}

#[test]
fn daily_activity_uses_the_legacy_metric_names() {
    let raw = json!({ "items": [{"date": "2026-09-22", "steps": 4318, "distance": 3104, "calories": 378, "walkTime": 44}] });
    let names: Vec<_> = Normalizer::normalize_official_activity_daily(&raw)
        .into_iter()
        .map(|row| (row.metric, row.unit))
        .collect();
    assert_eq!(
        names,
        vec![
            ("steps".to_string(), "steps".to_string()),
            ("distance".to_string(), "m".to_string()),
            ("active_calories".to_string(), "kcal".to_string()),
        ]
    );
}

#[test]
fn official_workouts_map_their_type_names_and_keep_the_track_id() {
    let raw = json!({ "items": [{
        "trackId": "1789908976", "source": "run.8716544.huami.com",
        "startTime": 1_789_908_976, "endTime": 1_789_910_708, "sportTime": 1732,
        "distance": 4585, "calories": 350, "averageHeartRate": 164,
        "averageStepFrequency": 152, "averageStrideLength": 104, "totalStep": 4402,
        "altitudeAscend": -1, "type": "OUTDOOR_RUN"
    }]});
    let rows = Normalizer::normalize_workouts_with_sport(
        &Normalizer::official_sports_as_legacy(&raw),
        None,
    )
    .unwrap();
    assert_eq!(rows[0].workout_id, "1789908976");
    assert_eq!(rows[0].workout_type, "run");
    assert_eq!(rows[0].avg_cadence_spm, Some(152.0));
    assert_eq!(rows[0].elevation_gain_m, None);
    assert_eq!(official_workout_type("CIRCUIT_MODE"), "circuit_mode");
}

#[test]
fn official_detail_decodes_with_the_legacy_decoder() {
    let raw = json!({
        "trackId": "1700000000", "source": "run.1.huami.com", "startTime": 1_700_000_000,
        "samplingTime": "0;1;1;", "latitudeLongitude": "3023329900,12003916366;433,-4500;466,-4800;",
        "altitude": "-2000277;1025;1015;", "heartRate": "0,110;1,2;1,3;", "distance": "",
        "pause": "", "provider": "gps", "distanceInCentimeter": "0,0;1,399;1,835;"
    });
    let legacy = Normalizer::official_detail_as_legacy(&raw);
    assert!(legacy["data"].get("distance").is_none());
    assert!(legacy["data"].get("currentDistance").is_none());
    let decoded = crate::decoder::decode_workout_detail(&legacy, None, None).unwrap();
    assert_eq!(decoded.route.len(), 3);
    assert!(!decoded.samples.is_empty());
}

#[test]
fn official_body_becomes_weight_samples() {
    let raw = json!({ "items": [{"weight": 58, "height": 173, "bmi": 19.38, "weightType": 7, "timestamp": 1_779_718_842}] });
    let batch = Normalizer::normalize_weight(&Normalizer::official_body_as_legacy(&raw));
    let names: Vec<_> = batch
        .metric_samples
        .iter()
        .map(|row| row.metric.as_str())
        .collect();
    assert_eq!(names, vec!["weight", "bmi", "height"]);
}

/// 代码审查 R10：非空但认不出的小睡数组不是「没睡午觉」；部分认不出也不凑
/// 一个偏小的总数。缺清醒时长时不拿在床时长冒充睡着时长。
#[test]
fn unreadable_naps_are_unknown_and_missing_wake_time_is_not_zero() {
    let mut broken = night(1443, 1893);
    broken["napStage"] = json!([{"start": 30}]);
    let mut partial = night(1443, 1893);
    partial["napStage"] = json!([{"start": 800, "stop": 819, "mode": 4}, {"start": 900}]);
    let nights = Normalizer::normalize_official_sleep(&json!({ "items": [broken, partial] }));
    assert_eq!(nights.len(), 2);
    assert_eq!(nights[0].nap_total_seconds, None, "全坏的数组不是 0");
    assert_eq!(nights[1].nap_total_seconds, None, "部分坏也是不知道");

    let mut no_wake = night(1443, 1893);
    no_wake.as_object_mut().unwrap().remove("wakeTime");
    let nights = Normalizer::normalize_official_sleep(&json!({ "items": [no_wake] }));
    let session = &nights[0].session;
    assert_eq!(session.awake_minutes, None);
    assert_eq!(
        session.duration_minutes,
        90 + 250 + 100,
        "用实测分期，不是 450 分钟在床时长"
    );
    assert_eq!(session.time_in_bed_minutes, Some(450));
}
