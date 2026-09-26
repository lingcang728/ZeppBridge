use super::*;

/// `all_day_stress` 每天带一条五分钟一个点的全天曲线，以前整条被丢掉。
///
/// 取值是真实报文里 2026-09-02 那一天（当时只同步到 01:00，所以刚好
/// 13 个点，适合整条写进测试）。只删掉了 `userId`。
/// 一条真实的 `watch_score` 报文，逐字段照抄本机库里 2026-08-12 那条。
fn readiness_item() -> Value {
    json!({
        "eventType": "readiness",
        "subType": "watch_score",
        "timestamp": 1786493641000i64,
        "value": {
            "afibBaseLine": 0, "afibInsight": 18, "afibScore": 255,
            "ahiBaseline": 0.3827273, "ahiInsight": 100, "ahiScore": 100,
            "algSubVer": 4, "algVer": 4,
            "deviceId": "app", "deviceSource": 2,
            "hrvBaseline": 101, "hrvInsight": 0, "hrvScore": 71,
            "insightId": 9,
            "mentBaseLine": 96, "mentInsight": 0, "mentScore": 96,
            "phyBaseline": 64, "phyInsight": 64, "phyScore": 64,
            "rdnsInsight": 5, "rdnsScore": 80,
            "rhrBaseline": 49, "rhrInsight": 240, "rhrScore": 74,
            "skinTempBaseLine": -7, "skinTempCalibrated": 11,
            "skinTempInsight": 5, "skinTempScore": 97,
            "sleepHRV": 88, "sleepRHR": 53,
            "status": 200,
            "timestamp": 1786464000000i64,
            "timestampUpdate": 1786493641000i64,
            "timezoneId": "Asia/Shanghai"
        }
    })
}

/// 睡眠期 HRV / 静息心率、两个基线、AHI 基线：报文里一直有，v20 之前
/// 一条都没进过库。
#[test]
fn readiness_carries_sleep_hrv_and_the_personal_baselines() {
    let rows =
        Normalizer::normalize_daily_summary(&json!({ "items": [readiness_item()] })).unwrap();
    let daily = |metric: &str| {
        rows.iter()
            .find(|row| row.metric == metric)
            .map(|row| (row.value, row.unit.as_str()))
    };

    assert_eq!(daily("sleep_hrv"), Some((88.0, "ms")));
    assert_eq!(daily("sleep_rhr"), Some((53.0, "bpm")));
    assert_eq!(daily("hrv_baseline"), Some((101.0, "ms")));
    assert_eq!(daily("rhr_baseline"), Some((49.0, "bpm")));
    assert_eq!(daily("ahi_baseline"), Some((0.3827273, "events/h")));

    // 已经在库里的那几项不能因为这次改动跟着变。
    assert_eq!(daily("hrv_readiness"), Some((71.0, "score")));
    assert_eq!(daily("rhr_readiness"), Some((74.0, "score")));
}

/// `phyBaseline` / `mentBaseLine` 不收。
///
/// 实测本机 25 348 条 readiness 记录里，它们和 `phyScore` / `mentScore`
/// **逐条完全相等**——不是基线，是同一个分数换了个名字。这条 fixture 里
/// 也是 64==64、96==96。收进来只会在库里多两列一模一样的数。
#[test]
fn the_physical_and_mental_baselines_are_not_stored_because_they_echo_the_score() {
    let rows =
        Normalizer::normalize_daily_summary(&json!({ "items": [readiness_item()] })).unwrap();
    assert!(!rows.iter().any(|row| row.metric == "physical_baseline"));
    assert!(!rows.iter().any(|row| row.metric == "mental_baseline"));
    assert_eq!(
        rows.iter()
            .find(|row| row.metric == "physical_readiness")
            .map(|row| row.value),
        Some(64.0)
    );
}

/// 255 是这条流的「没测到」。`afibScore` 在本机 25 348 条里条条都是 255，
/// 而 `hrvBaseline` / `rhrBaseline` 各有 7 条是 255。
#[test]
fn readiness_sentinels_are_absent_but_valid_boundaries_and_charge_survive() {
    for value in [0, 100, 255] {
        let mut item = readiness_item();
        for field in [
            "rdnsScore",
            "phyScore",
            "mentScore",
            "hrvScore",
            "rhrScore",
            "skinTempScore",
            "afibScore",
            "ahiScore",
        ] {
            item["value"][field] = json!(value);
        }
        item["value"]["hybridCharge"] = json!(78);
        let rows = Normalizer::normalize_daily_summary(&json!({"items": [item]})).unwrap();
        let scores: Vec<_> = rows
            .iter()
            .filter(|row| row.metric == "readiness" || row.metric.ends_with("_readiness"))
            .collect();
        assert_eq!(scores.len(), if value == 255 { 0 } else { 8 });
        assert!(scores.iter().all(|row| row.value == value as f64));
        assert!(rows
            .iter()
            .any(|row| row.metric == "hybrid_charge" && row.value == 78.0));
    }
}

#[test]
fn a_baseline_of_255_is_dropped_rather_than_stored_as_a_reading() {
    let mut item = readiness_item();
    item["value"]["hrvBaseline"] = json!(255);
    item["value"]["rhrBaseline"] = json!(255);
    // AHI 基线的哨兵是 -1，不是 255。
    item["value"]["ahiBaseline"] = json!(-1.0);

    let rows = Normalizer::normalize_daily_summary(&json!({ "items": [item] })).unwrap();
    assert!(!rows.iter().any(|row| row.metric == "hrv_baseline"));
    assert!(!rows.iter().any(|row| row.metric == "rhr_baseline"));
    assert!(!rows.iter().any(|row| row.metric == "ahi_baseline"));
    // 同一条记录里没被哨兵盖掉的仍然要写进去。
    assert!(rows.iter().any(|row| row.metric == "sleep_hrv"));
}

/// 三个目标值来自 `DailyHealth` 的 samples，报文照抄 2026-08-12 那条。
#[test]
fn the_daily_goals_are_read_from_the_summary_samples() {
    let raw = json!({ "items": [{
            "eventType": "DailyHealth",
            "subType": "summary",
            "timestamp": 1786492800000i64,
            "value": {
                "deviceId": "1,", "deviceSN": "1,",
                "deviceSource": "1,-1", "deviceType": "1,-1",
                "samples": [{
                    "burningDurationGoal": 30, "calorieGoal": 300,
                    "dateString": "2026-08-12", "s": 0, "stepGoal": 8000,
                    "totalBurningDuration": 0, "totalCalories": 12,
                    "totalSteps": 189, "u": 50755973
                }],
                "startTime": 1786492800000i64,
                "timeZone": "1,Asia/Shanghai"
            }
        }] });
    let rows = Normalizer::normalize_daily_summary(&raw).unwrap();
    let daily = |metric: &str| {
        rows.iter()
            .find(|row| row.metric == metric)
            .map(|row| (row.value, row.unit.as_str()))
    };

    assert_eq!(daily("step_goal"), Some((8000.0, "steps")));
    assert_eq!(daily("calorie_goal"), Some((300.0, "kcal")));
    assert_eq!(daily("active_minutes_goal"), Some((30.0, "min")));
    // 当天的实际值仍然照旧。
    assert_eq!(daily("steps"), Some((189.0, "steps")));
}

/// 没设目标时报文写 0。0 不是「目标是 0 步」，不写进去。
#[test]
fn a_goal_of_zero_means_no_goal_was_set_and_is_not_stored() {
    let raw = json!({ "items": [{
            "eventType": "DailyHealth", "subType": "summary",
            "timestamp": 1786492800000i64,
            "value": { "samples": [{
                "dateString": "2026-08-12", "stepGoal": 0, "calorieGoal": 0,
                "burningDurationGoal": 0, "totalSteps": 189
            }] }
        }] });
    let rows = Normalizer::normalize_daily_summary(&raw).unwrap();
    assert!(!rows.iter().any(|row| row.metric == "step_goal"));
    assert!(!rows.iter().any(|row| row.metric == "calorie_goal"));
    assert!(!rows.iter().any(|row| row.metric == "active_minutes_goal"));
    assert!(rows.iter().any(|row| row.metric == "steps"));
}

/// 一条真实的 PAI 报文，照抄本机库里 2026-05-18 那条（去掉两个数组字段）。
fn pai_item() -> Value {
    json!({
        "age": "20", "dailyPai": "11.707199",
        "deviceId": "D8803CFFFEC19AC6", "deviceSource": "8716544",
        "eventType": "PaiHealthInfo", "gender": "0",
        "highZoneLowerLimit": "158", "highZoneMinutes": "1",
        "highZonePai": "0.88804626", "index": "4",
        "lowZoneLowerLimit": "105", "lowZoneMinutes": "119",
        "lowZonePai": "2.0", "maxHr": "198",
        "mediumZoneLowerLimit": "119", "mediumZoneMinutes": "66",
        "mediumZonePai": "9.277756", "restHr": "65",
        "sn": "23229501001311", "subType": "PaiHealthInfo",
        "time": "1787155200000", "timeZone": "32",
        "timestamp": 1787155200000i64, "totalPai": "50.944435",
        "uploadTimestamp": "1787300767871", "userId": "1181735661",
        "version": "5"
    })
}

/// 七天 PAI 总分、三档的分钟数和心率下限。
///
/// `totalPai` 正是 Zepp 界面上那个大数字，以前一直没取；三档的心率下限
/// 是手表按用户的最大/静息心率算出来的，不是我们切的。
#[test]
fn pai_carries_the_total_and_the_three_zones() {
    let batch = Normalizer::normalize_wellness(
        "wellness:pai:user_events:2026-05-18:2026-05-19",
        &json!({ "items": [pai_item()] }),
    );
    let daily = |metric: &str| {
        batch
            .daily_metrics
            .iter()
            .find(|row| row.metric == metric)
            .map(|row| (row.value, row.unit.as_str()))
    };

    assert_eq!(daily("pai_total"), Some((50.944435, "pai")));
    assert_eq!(daily("pai_low_zone_minutes"), Some((119.0, "min")));
    assert_eq!(daily("pai_medium_zone_minutes"), Some((66.0, "min")));
    assert_eq!(daily("pai_high_zone_minutes"), Some((1.0, "min")));
    assert_eq!(daily("pai_low_zone_lower_hr"), Some((105.0, "bpm")));
    assert_eq!(daily("pai_medium_zone_lower_hr"), Some((119.0, "bpm")));
    assert_eq!(daily("pai_high_zone_lower_hr"), Some((158.0, "bpm")));

    // 原来就在的那几项不能跟着变。
    assert_eq!(daily("pai_daily"), Some((11.707199, "pai")));
    assert_eq!(daily("device_max_hr"), Some((198.0, "bpm")));
}

/// 某一档一分钟都没进的时候，报文写 0 —— 那是真的 0 分钟，要写进去。
///
/// 和目标值的 0 不是一回事：目标的 0 表示「没设目标」。
#[test]
fn zero_minutes_in_a_pai_zone_is_a_real_reading() {
    let mut item = pai_item();
    item["highZoneMinutes"] = json!("0");
    let batch = Normalizer::normalize_wellness(
        "wellness:pai:user_events:2026-05-18:2026-05-19",
        &json!({ "items": [item] }),
    );
    assert_eq!(
        batch
            .daily_metrics
            .iter()
            .find(|row| row.metric == "pai_high_zone_minutes")
            .map(|row| row.value),
        Some(0.0)
    );
}

fn all_day_stress_item() -> Value {
    json!({
        "avgStress": "22",
        "data": "[{\"time\":1788307200000,\"value\":32},{\"time\":1788307500000,\"value\":25},{\"time\":1788307800000,\"value\":32},{\"time\":1788308100000,\"value\":48},{\"time\":1788308400000,\"value\":20},{\"time\":1788308700000,\"value\":32},{\"time\":1788309000000,\"value\":33},{\"time\":1788309300000,\"value\":10},{\"time\":1788309600000,\"value\":28},{\"time\":1788309900000,\"value\":6},{\"time\":1788310200000,\"value\":4},{\"time\":1788310500000,\"value\":7},{\"time\":1788310800000,\"value\":11}]",
        "deviceId": "D85403FFFEE4D576",
        "deviceMac": "",
        "deviceSn": "2445B138005129",
        "deviceSource": "10289410",
        "deviceType": "0",
        "eventType": "all_day_stress",
        "highProportion": "0",
        "maxStress": "48",
        "mediumProportion": "0",
        "minStress": "4",
        "normalProportion": "8",
        "relaxProportion": "92",
        "subType": "all_day_stress",
        "timestamp": 1788307200000i64
    })
}

#[test]
fn all_day_stress_yields_the_whole_days_curve() {
    let batch = Normalizer::normalize_wellness(
        "wellness:all_day_stress:user_events:2026-09-02:2026-09-03",
        &json!({ "items": [all_day_stress_item()] }),
    );

    // 13 个点，一个不少——这正是「压力不是 24/7」少掉的东西。
    assert_eq!(batch.metric_samples.len(), 13);
    assert!(batch
        .metric_samples
        .iter()
        .all(|sample| sample.metric == "stress" && sample.unit == "score"));
    assert!(batch
        .metric_samples
        .iter()
        .all(|sample| sample.device_id.as_deref() == Some("D85403FFFEE4D576")));

    let first = &batch.metric_samples[0];
    assert_eq!(first.value, 32.0);
    assert_eq!(first.timestamp.to_rfc3339(), "2026-09-02T00:00:00+00:00");
    let last = batch.metric_samples.last().unwrap();
    assert_eq!(last.value, 11.0);
    assert_eq!(last.timestamp.to_rfc3339(), "2026-09-02T01:00:00+00:00");

    // 服务器给的当日极值就是这条曲线自己的极值：两者是同一次测量，
    // 不是两条碰巧对得上的流。
    let values: Vec<f64> = batch.metric_samples.iter().map(|s| s.value).collect();
    assert_eq!(values.iter().copied().reduce(f64::min), Some(4.0));
    assert_eq!(values.iter().copied().reduce(f64::max), Some(48.0));
}

#[test]
fn all_day_stress_band_proportions_are_read() {
    let batch = Normalizer::normalize_wellness(
        "wellness:all_day_stress:user_events:2026-09-02:2026-09-03",
        &json!({ "items": [all_day_stress_item()] }),
    );

    let daily = |metric: &str| {
        batch
            .daily_metrics
            .iter()
            .find(|row| row.metric == metric)
            .map(|row| row.value)
    };

    assert_eq!(daily("stress"), Some(22.0));
    assert_eq!(daily("stress_min"), Some(4.0));
    assert_eq!(daily("stress_max"), Some(48.0));
    // 报文里的名字是 `relaxProportion`。以前只认 `relaxPct`，那个名字在
    // 1104 条真实记录里一次都没出现过，于是这四项从来没写进过库。
    assert_eq!(daily("stress_relaxed_pct"), Some(92.0));
    assert_eq!(daily("stress_normal_pct"), Some(8.0));
    assert_eq!(daily("stress_medium_pct"), Some(0.0));
    assert_eq!(daily("stress_high_pct"), Some(0.0));
}

#[test]
fn all_day_stress_drops_zero_readings() {
    // Zepp 的压力量程从 1 起。0 在库里 62 626 条真实读数里一次都没有出现，
    // 而这些报文里的 0 一贯表示「没测到」——画成 0 会看起来像那一刻
    // 特别放松。
    let batch = Normalizer::normalize_wellness(
        "wellness:all_day_stress:user_events:2026-09-02:2026-09-03",
        &json!({ "items": [{
                "eventType": "all_day_stress",
                "timestamp": 1788307200000i64,
                "data": "[{\"time\":1788307200000,\"value\":0},{\"time\":1788307500000,\"value\":25}]"
            }] }),
    );

    assert_eq!(batch.metric_samples.len(), 1);
    assert_eq!(batch.metric_samples[0].value, 25.0);
}

#[test]
fn parse_number_rejects_nan_and_infinity() {
    for raw in ["NaN", "nan", "Infinity", "-Infinity", "inf", "+inf"] {
        assert_eq!(parse_number(&json!(raw)), None, "{raw}");
    }
    assert_eq!(parse_number(&json!(72)), Some(72.0));
    assert_eq!(parse_number(&json!("72.5")), Some(72.5));
    let batch = Normalizer::normalize_heart_rate_with_diagnostics(&json!({
        "items": [
            {"timestamp": 1_800_000_000i64, "value": "NaN"},
            {"timestamp": 1_800_000_060i64, "heartRate": "Infinity"},
            {"timestamp": 1_800_000_120i64, "value": 68}
        ]
    }))
    .unwrap();
    assert_eq!(batch.records.len(), 1);
    assert_eq!(batch.records[0].value, 68.0);
    assert!(
        batch.records.iter().all(|sample| sample.value.is_finite()),
        "NaN/Infinity 不能进心率记录"
    );
}
