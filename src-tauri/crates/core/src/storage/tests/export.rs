use super::*;

#[test]
fn metric_sample_types_export_without_an_unrelated_selection() {
    let db = Database::in_memory().unwrap();
    for (metric, value, unit) in [
        ("hrv_rmssd", 42.0, "ms"),
        ("respiratory_rate", 16.0, "brpm"),
    ] {
        db.insert_metric_sample(&MetricSample {
            metric: metric.into(),
            timestamp: ts(),
            value,
            unit: unit.into(),
            source_scope: SourceScope::Device,
            device_id: None,
        })
        .unwrap();
    }

    for detail in [ExportDetail::Summary, ExportDetail::Full] {
        for (metric, expected) in [("hrv_rmssd", 42.0), ("respiratory_rate", 16.0)] {
            let export = parsed_export(&db, &[metric], detail);
            let samples = export["data"]["metric_samples"].as_array().unwrap();
            assert_eq!(samples.len(), 1, "{metric}, {detail:?}");
            assert_eq!(samples[0]["metric"], metric);
            assert_eq!(samples[0]["value"], expected);
            assert_eq!(export["record_count"], 1);
            assert_eq!(export["capabilities"][metric]["status"], "available");
            assert_eq!(export["capabilities"][metric]["source_records"], 1);
            assert_eq!(export["capabilities"][metric]["rows_in_export"], 1);
        }
    }
}

#[test]
fn daily_metric_types_export_alone_but_stay_outside_workout_scope() {
    let db = Database::in_memory().unwrap();
    let workout = workout_with_type(None, "run", "string_field");
    let date = workout
        .start_time
        .with_timezone(&Local)
        .format("%Y-%m-%d")
        .to_string();
    db.insert_workout(&workout).unwrap();
    let cases = [
        ("respiratory_rate", "respiratory_rate", 16.0, "brpm"),
        ("lactate_threshold", "lactate_threshold_hr", 170.0, "bpm"),
        ("pai", "pai_daily", 20.0, "pai"),
        ("hrv_rmssd", "hrv_rmssd", 42.0, "ms"),
    ];
    for (_, metric, value, unit) in cases {
        db.insert_daily_metric(&DailyMetric {
            date: date.clone(),
            metric: metric.into(),
            value,
            unit: unit.into(),
            source_scope: SourceScope::Device,
            device_id: None,
        })
        .unwrap();
    }

    for detail in [ExportDetail::Summary, ExportDetail::Full] {
        for (selected_type, metric, value, _) in cases {
            let export = parsed_export(&db, &[selected_type], detail);
            let daily = export["data"]["daily_metrics"].as_array().unwrap();
            assert_eq!(daily.len(), 1, "{selected_type}, {detail:?}");
            assert_eq!(daily[0]["metric"], metric);
            assert_eq!(daily[0]["value"], value);
            assert_eq!(export["record_count"], 1);
            let capability = &export["capabilities"][selected_type];
            assert_eq!(capability["status"], "available");
            assert_eq!(capability["source_records"], 1);
            assert_eq!(capability["rows_in_export"], 1);

            let mut selection = export_selection(&[selected_type], detail);
            selection.scope = Some(ExportScope::Workout {
                workout_id: workout.workout_id.clone(),
            });
            let (encoded, records) = db.build_ai_export(&selection).unwrap();
            let scoped: serde_json::Value = serde_json::from_str(&encoded).unwrap();
            assert_eq!(records, 0, "daily {metric} is outside workout scope");
            assert!(scoped["data"]["daily_metrics"]
                .as_array()
                .unwrap()
                .is_empty());
            if matches!(selected_type, "lactate_threshold" | "pai") {
                assert_eq!(
                    scoped["capabilities"][selected_type]["status"],
                    "excluded_by_scope"
                );
            }
        }
    }
}

#[test]
fn workout_export_excludes_weight_samples_that_overlap_the_workout() {
    let db = Database::in_memory().unwrap();
    let workout = workout_with_type(None, "run", "string_field");
    db.insert_workout(&workout).unwrap();
    for (metric, value, unit) in [
        ("weight", 70.0, "kg"),
        ("body_fat_rate", 18.5, "%"),
        ("heart_rate", 120.0, "bpm"),
    ] {
        db.insert_metric_sample(&MetricSample {
            metric: metric.into(),
            timestamp: workout.start_time + chrono::Duration::minutes(5),
            value,
            unit: unit.into(),
            source_scope: SourceScope::Device,
            device_id: None,
        })
        .unwrap();
    }

    for detail in [ExportDetail::Summary, ExportDetail::Full] {
        let date_export = parsed_export(&db, &["weight", "heart_rate"], detail);
        let samples = date_export["data"]["metric_samples"].as_array().unwrap();
        assert_eq!(samples.len(), 3);
        for (metric, value) in [("weight", 70.0), ("body_fat_rate", 18.5)] {
            let sample = samples.iter().find(|row| row["metric"] == metric).unwrap();
            assert_eq!(sample["value"], value);
        }
        assert_eq!(date_export["capabilities"]["weight"]["status"], "available");
        assert_eq!(date_export["capabilities"]["weight"]["source_records"], 2);
        assert_eq!(date_export["capabilities"]["weight"]["rows_in_export"], 2);

        let mut selection = export_selection(&["weight", "heart_rate"], detail);
        selection.scope = Some(ExportScope::Workout {
            workout_id: workout.workout_id.clone(),
        });
        let (encoded, records) = db.build_ai_export(&selection).unwrap();
        let export: serde_json::Value = serde_json::from_str(&encoded).unwrap();
        let samples = export["data"]["metric_samples"].as_array().unwrap();
        assert_eq!(records, 1);
        assert_eq!(samples.len(), 1);
        assert_eq!(samples[0]["metric"], "heart_rate");
        assert_eq!(export["capabilities"]["heart_rate"]["status"], "available");
        assert_eq!(export["capabilities"]["heart_rate"]["source_records"], 1);
        assert_eq!(export["capabilities"]["heart_rate"]["rows_in_export"], 1);
        assert_eq!(
            export["capabilities"]["weight"]["status"],
            "excluded_by_scope"
        );
        assert_eq!(export["capabilities"]["weight"]["rows_in_export"], 0);
    }
}

/// 饮食能导出，而且不会被「日常活动」兜底扫走。
///
/// `food` 一度只登记在能力表里，从来没进过导出的允许类型表：`--types food`
/// 被静默丢掉，摄入数据入了库、画得出图、却一条都导不出来。更糟的是那个
/// `daily_activity` 兜底分支——它会把没被认领的日级指标全收下，包括
/// `intake_*`。摄入的热量和活动消耗的热量是相反的两件事，混进同一个类型
/// 就是把吃进去的算成烧掉的。
#[test]
fn food_is_exportable_and_never_folded_into_daily_activity() {
    let db = Database::in_memory().unwrap();
    for (metric, value, unit) in [
        ("intake_calories", 2100.0, "kcal"),
        ("intake_protein_g", 120.0, "g"),
        ("intake_fat_g", 70.0, "g"),
        ("intake_carbs_g", 210.0, "g"),
    ] {
        db.insert_daily_metric(&DailyMetric {
            date: "2023-11-05".into(),
            metric: metric.into(),
            value,
            unit: unit.into(),
            source_scope: SourceScope::UserFused,
            device_id: None,
        })
        .unwrap();
    }
    // 同一天的活动消耗，用来证明两者没有混在一起。
    db.insert_daily_metric(&DailyMetric {
        date: "2023-11-05".into(),
        metric: "active_calories".into(),
        value: 480.0,
        unit: "千卡".into(),
        source_scope: SourceScope::UserFused,
        device_id: None,
    })
    .unwrap();

    let names = |export: &serde_json::Value| -> Vec<String> {
        export["data"]["daily_metrics"]
            .as_array()
            .map(|rows| {
                rows.iter()
                    .map(|row| row["metric"].as_str().unwrap_or_default().to_string())
                    .collect()
            })
            .unwrap_or_default()
    };

    let food = parsed_export(&db, &["food"], ExportDetail::Summary);
    let exported = names(&food);
    for metric in [
        "intake_calories",
        "intake_protein_g",
        "intake_fat_g",
        "intake_carbs_g",
    ] {
        assert!(
            exported.iter().any(|name| name == metric),
            "--types food 没导出 {metric}；导出的是 {exported:?}"
        );
    }
    assert!(
        !exported.iter().any(|name| name == "active_calories"),
        "选了 food 却把活动消耗也带出来了"
    );
    assert_eq!(
        food["capabilities"]["food"]["status"], "available",
        "有摄入记录时 food 必须是 available"
    );

    let activity = names(&parsed_export(
        &db,
        &["daily_activity"],
        ExportDetail::Summary,
    ));
    assert!(
        activity.iter().any(|name| name == "active_calories"),
        "日常活动本身还得导得出来"
    );
    assert!(
        !activity.iter().any(|name| name.starts_with("intake_")),
        "摄入被兜底扫进了 daily_activity：{activity:?}"
    );
}

#[test]
fn summary_export_aggregates_heart_rate_and_drops_the_per_second_series() {
    let db = Database::in_memory().unwrap();
    for (offset, value) in [(0, 60.0), (60, 70.0), (120, 80.0), (3600, 100.0)] {
        db.insert_metric_sample(&MetricSample {
            metric: "heart_rate".into(),
            timestamp: ts() + chrono::Duration::seconds(offset),
            value,
            unit: "bpm".into(),
            source_scope: SourceScope::Device,
            device_id: Some("SN-ONE".into()),
        })
        .unwrap();
    }
    db.insert_workout(&Workout {
        workout_id: "1700000000".into(),
        workout_type: "run".into(),
        normalized_type: "run".into(),
        type_source: "string_field".into(),
        user_override: None,
        effective_type: "run".into(),
        custom_label: None,
        start_time: ts(),
        end_time: ts() + chrono::Duration::minutes(10),
        distance_meters: Some(1000.0),
        calories: Some(80),
        avg_hr: Some(140),
        max_hr: Some(160),
        training_load: Some(20.0),
        vo2max: None,
        source_scope: SourceScope::Device,
        device_id: Some("SN-ONE".into()),
        synced_at: None,
        gps_available: false,
        sample_count: 0,
        zepp_source: None,
        zepp_type: None,
        ..Default::default()
    })
    .unwrap();

    let summary = parsed_export(&db, &["heart_rate", "workouts"], ExportDetail::Summary);
    let samples = summary["data"]["metric_samples"].as_array().unwrap();
    // Three samples inside one hour collapse to one row; the fourth starts
    // the next hour.
    assert_eq!(samples.len(), 2);
    let first = &samples[0];
    assert_eq!(first["min"], 60.0);
    assert_eq!(first["max"], 80.0);
    assert_eq!(first["avg"], 70.0);
    assert_eq!(first["samples"], 3);
    assert!(
        first.get("timestamp").is_none(),
        "aggregated rows have hours"
    );

    let workout = &summary["data"]["workouts"][0];
    assert!(
        workout.get("samples").is_none(),
        "summary must not carry the per-second series"
    );
    assert!(workout.get("route").is_none());
    assert!(workout.get("sample_count").is_some());

    let full = parsed_export(&db, &["heart_rate", "workouts"], ExportDetail::Full);
    assert_eq!(full["data"]["metric_samples"].as_array().unwrap().len(), 4);
    assert!(full["data"]["workouts"][0].get("samples").is_some());
    assert!(full["data"]["workouts"][0].get("route").is_some());
}

#[test]
fn wake_count_survives_the_round_trip_and_is_not_awake_minutes() {
    // Ten one-minute wakings and one ten-minute waking are the same
    // duration but not the same night, so `wc` is its own field.
    let db = Database::in_memory().unwrap();
    db.insert_sleep_session(&SleepSession {
        sleep_id: "sleep-wc".into(),
        start_time: ts(),
        end_time: ts() + chrono::Duration::minutes(400),
        score: Some(80),
        duration_minutes: 380,
        deep_minutes: Some(80),
        light_minutes: Some(240),
        rem_minutes: Some(40),
        awake_minutes: Some(20),
        source_scope: SourceScope::Device,
        device_id: None,
        synced_at: None,
        time_in_bed_minutes: None,
        stages: Vec::new(),
        wake_count: Some(4),
    })
    .unwrap();
    assert_eq!(
        db.get_sleep_detail("sleep-wc").unwrap().unwrap().wake_count,
        Some(4)
    );
    let export = parsed_export(&db, &["sleep"], ExportDetail::Summary);
    let session = &export["data"]["sleep_sessions"][0];
    assert_eq!(session["wake_count"], 4);
    assert_eq!(session["awake_minutes"], 20);
}

#[test]
fn export_carries_the_sleep_stage_timeline() {
    let db = Database::in_memory().unwrap();
    let start = ts();
    db.insert_sleep_session(&SleepSession {
        sleep_id: "sleep-export".into(),
        start_time: start,
        end_time: start + chrono::Duration::minutes(400),
        score: Some(80),
        duration_minutes: 380,
        deep_minutes: Some(80),
        light_minutes: Some(240),
        rem_minutes: Some(40),
        awake_minutes: Some(20),
        source_scope: SourceScope::Device,
        device_id: Some("SN-ONE".into()),
        synced_at: None,
        time_in_bed_minutes: None,
        wake_count: None,
        stages: vec![
            SleepStageSlice {
                stage: "light".into(),
                start_time: start,
                end_time: start + chrono::Duration::minutes(30),
                raw_mode: None,
            },
            SleepStageSlice {
                stage: "deep".into(),
                start_time: start + chrono::Duration::minutes(30),
                end_time: start + chrono::Duration::minutes(90),
                raw_mode: None,
            },
        ],
    })
    .unwrap();

    for detail in [ExportDetail::Summary, ExportDetail::Full] {
        let export = parsed_export(&db, &["sleep"], detail);
        let stages = export["data"]["sleep_sessions"][0]["stages"]
            .as_array()
            .unwrap();
        assert_eq!(stages.len(), 2, "{detail:?}");
        assert_eq!(stages[0]["stage"], "light");
        assert_eq!(stages[1]["stage"], "deep");
    }
}

#[test]
fn export_says_why_a_selected_type_is_missing() {
    let db = Database::in_memory().unwrap();
    db.insert_metric_sample(&MetricSample {
        metric: "hrv".into(),
        timestamp: ts(),
        value: 45.0,
        unit: "ms".into(),
        source_scope: SourceScope::Device,
        device_id: Some("SN-ONE".into()),
    })
    .unwrap();

    let export = parsed_export(&db, &["hrv", "spo2", "sleep"], ExportDetail::Summary);
    let capabilities = &export["capabilities"];
    assert_eq!(capabilities["hrv"]["status"], "available");
    assert_eq!(capabilities["hrv"]["source_records"], 1);
    assert_eq!(capabilities["hrv"]["rows_in_export"], 1);
    // Nothing fetched and nothing stored: genuinely empty for this window.
    assert_eq!(capabilities["spo2"]["status"], "empty_in_range");
    assert_eq!(capabilities["sleep"]["status"], "empty_in_range");
}

#[test]
fn the_index_window_never_hides_a_day_inside_the_range() {
    // 这层时间戳边界只是为了让索引能定位，不能改变结果。
    // 边界必须比本地日期区间宽出至少一天，否则某些时区下第一天或
    // 最后一天的采样会被悄悄丢掉。
    let (lower, upper) = local_day_range_utc_bounds("2026-08-23", "2026-08-29").unwrap();
    assert!(
        lower.as_str() < "2026-08-23T00:00:00",
        "下界必须早于区间第一天：{lower}"
    );
    assert!(
        upper.as_str() > "2026-08-30T00:00:00",
        "上界必须晚于区间最后一天的末尾：{upper}"
    );
    // 单日区间同样成立。
    let (lower, upper) = local_day_range_utc_bounds("2026-08-28", "2026-08-28").unwrap();
    assert!(lower.as_str() < "2026-08-28T00:00:00");
    assert!(upper.as_str() > "2026-08-29T00:00:00");
    // 日期无效时返回 None，让调用方退回不带边界的查询而不是查空。
    assert!(local_day_range_utc_bounds("not-a-date", "2026-08-29").is_none());
}

#[test]
fn workout_export_keeps_samples_after_local_midnight_within_its_window() {
    let db = Database::in_memory().unwrap();
    let start = NaiveDate::from_ymd_opt(2023, 11, 15)
        .unwrap()
        .and_hms_opt(23, 50, 0)
        .unwrap()
        .and_local_timezone(Local)
        .single()
        .unwrap()
        .with_timezone(&Utc);
    let mut workout = workout_with_type(None, "run", "string_field");
    workout.start_time = start;
    workout.end_time = start + chrono::Duration::minutes(20);
    db.insert_workout(&workout).unwrap();
    for (minutes, value) in [(-5, 60.0), (5, 100.0), (15, 110.0), (25, 70.0)] {
        db.insert_metric_sample(&MetricSample {
            metric: "heart_rate".into(),
            timestamp: start + chrono::Duration::minutes(minutes),
            value,
            unit: "bpm".into(),
            source_scope: SourceScope::Device,
            device_id: None,
        })
        .unwrap();
    }

    for detail in [ExportDetail::Summary, ExportDetail::Full] {
        let mut selection = export_selection(&["heart_rate"], detail);
        selection.scope = Some(ExportScope::Workout {
            workout_id: workout.workout_id.clone(),
        });
        let (encoded, _) = db.build_ai_export(&selection).unwrap();
        let export: serde_json::Value = serde_json::from_str(&encoded).unwrap();
        assert_eq!(export["capabilities"]["heart_rate"]["source_records"], 2);
        let samples = export["data"]["metric_samples"].as_array().unwrap();
        if detail.is_full() {
            assert_eq!(samples.len(), 2);
            assert_eq!(samples[0]["value"], 100.0);
            assert_eq!(samples[1]["value"], 110.0);
        } else {
            assert_eq!(
                samples
                    .iter()
                    .map(|sample| sample["samples"].as_u64().unwrap())
                    .sum::<u64>(),
                2
            );
            for sample in samples {
                assert!(sample["min"].as_f64().unwrap() >= 100.0);
                assert!(sample["max"].as_f64().unwrap() <= 110.0);
            }
        }
    }

    let day = start.with_timezone(&Local).format("%Y-%m-%d").to_string();
    let mut selection = export_selection(&["heart_rate"], ExportDetail::Full);
    selection.scope = Some(ExportScope::date_range(&day, &day));
    let (encoded, _) = db.build_ai_export(&selection).unwrap();
    let export: serde_json::Value = serde_json::from_str(&encoded).unwrap();
    let samples = export["data"]["metric_samples"].as_array().unwrap();
    assert_eq!(samples.len(), 2);
    assert_eq!(samples[0]["value"], 60.0);
    assert_eq!(samples[1]["value"], 100.0);
}

#[test]
fn a_single_workout_export_carries_only_that_workout() {
    // 从运动详情点「交给 AI」时，界面说的是「只导出这一条运动」。
    // 早先的实现把范围解析成「这条运动当天」，于是整天的心率、睡眠和步数
    // 都被一起发了出去——界面说的和发出去的不一样。这条用例把它钉住。
    let db = Database::in_memory().unwrap();
    let start = ts();
    let end = start + chrono::Duration::minutes(30);
    db.insert_workout(&Workout {
        workout_id: "target-workout".into(),
        workout_type: "run".into(),
        normalized_type: "run".into(),
        type_source: "string_field".into(),
        user_override: None,
        effective_type: "run".into(),
        custom_label: None,
        start_time: start,
        end_time: end,
        distance_meters: Some(5000.0),
        calories: Some(300),
        avg_hr: Some(150),
        max_hr: Some(170),
        training_load: Some(40.0),
        vo2max: None,
        source_scope: SourceScope::Device,
        device_id: Some("SN-ONE".into()),
        synced_at: None,
        gps_available: false,
        sample_count: 0,
        zepp_source: None,
        zepp_type: None,
        ..Default::default()
    })
    .unwrap();
    // 同一天的另一条运动：日期范围会带上它，单条运动范围不该带。
    db.insert_workout(&Workout {
        workout_id: "other-workout".into(),
        workout_type: "walk".into(),
        normalized_type: "walk".into(),
        type_source: "string_field".into(),
        user_override: None,
        effective_type: "walk".into(),
        custom_label: None,
        start_time: end + chrono::Duration::hours(2),
        end_time: end + chrono::Duration::hours(3),
        distance_meters: Some(2000.0),
        calories: Some(90),
        avg_hr: Some(100),
        max_hr: Some(110),
        training_load: None,
        vo2max: None,
        source_scope: SourceScope::Device,
        device_id: Some("SN-ONE".into()),
        synced_at: None,
        gps_available: false,
        sample_count: 0,
        zepp_source: None,
        zepp_type: None,
        ..Default::default()
    })
    .unwrap();
    for (moment, value) in [
        (start + chrono::Duration::minutes(5), 152.0),
        (end + chrono::Duration::hours(4), 61.0),
    ] {
        db.insert_metric_sample(&MetricSample {
            metric: "heart_rate".into(),
            timestamp: moment,
            value,
            unit: "bpm".into(),
            source_scope: SourceScope::Device,
            device_id: Some("SN-ONE".into()),
        })
        .unwrap();
    }
    db.insert_daily_metric(&DailyMetric {
        date: start.with_timezone(&Local).format("%Y-%m-%d").to_string(),
        metric: "steps".into(),
        value: 9000.0,
        unit: "steps".into(),
        source_scope: SourceScope::Device,
        device_id: Some("SN-ONE".into()),
    })
    .unwrap();
    db.insert_sleep_session(&SleepSession {
        sleep_id: "sleep-1".into(),
        start_time: start - chrono::Duration::hours(8),
        end_time: start - chrono::Duration::hours(1),
        score: Some(80),
        duration_minutes: 420,
        deep_minutes: Some(90),
        light_minutes: Some(280),
        rem_minutes: Some(50),
        awake_minutes: Some(10),
        source_scope: SourceScope::Device,
        device_id: Some("SN-ONE".into()),
        synced_at: None,
        time_in_bed_minutes: None,
        stages: Vec::new(),
        wake_count: Some(1),
    })
    .unwrap();

    let selection = ExportSelection {
        scope: Some(ExportScope::Workout {
            workout_id: "target-workout".into(),
        }),
        start_date: None,
        end_date: None,
        data_types: ["workouts", "heart_rate", "steps", "sleep"]
            .iter()
            .map(|value| value.to_string())
            .collect(),
        detail: ExportDetail::Summary,
    };
    let (encoded, _) = db.build_ai_export(&selection).unwrap();
    let export: serde_json::Value = serde_json::from_str(&encoded).unwrap();

    // 只有这一条运动。
    let workouts = export["data"]["workouts"].as_array().unwrap();
    assert_eq!(workouts.len(), 1);
    assert_eq!(workouts[0]["workout_id"], "target-workout");

    // 逐点心率只截取运动进行期间的采样，四小时后那条不在里面。
    let samples = export["data"]["metric_samples"].as_array().unwrap();
    assert_eq!(samples.len(), 1, "运动时段之外的心率不该被带上");

    // 日级数据整块排除，并且如实说明是范围之外，而不是「这段时间没有」。
    assert!(export["data"]["daily_metrics"]
        .as_array()
        .unwrap()
        .is_empty());
    assert!(export["data"]["sleep_sessions"]
        .as_array()
        .unwrap()
        .is_empty());
    assert_eq!(
        export["capabilities"]["steps"]["status"],
        "excluded_by_scope"
    );
    assert_eq!(
        export["capabilities"]["sleep"]["status"],
        "excluded_by_scope"
    );

    // 范围本身要能被读到的人核对到具体这一条运动。
    assert_eq!(export["scope"]["kind"], "workout");
    assert_eq!(export["scope"]["workout_id"], "target-workout");
}

#[test]
fn estimate_export_counts_without_materializing_json() {
    let db = Database::in_memory().unwrap();
    db.insert_metric_sample(&MetricSample {
        metric: "hrv_rmssd".into(),
        timestamp: ts(),
        value: 42.0,
        unit: "ms".into(),
        source_scope: SourceScope::Device,
        device_id: None,
    })
    .unwrap();
    let selection = export_selection(&["hrv_rmssd"], ExportDetail::Full);
    let (encoded, count) = db.build_ai_export(&selection).unwrap();
    let estimate = db.estimate_ai_export(&selection).unwrap();
    assert_eq!(estimate.record_count, count);
    assert!(estimate.estimated_bytes > 0);
    assert!(
        estimate.estimated_bytes < encoded.len() as u64 * 8,
        "estimate should stay in the same order of magnitude as the JSON"
    );
    assert!(!encoded.is_empty());
}

/// H1 回归守护：样本查询必须走 uq_metric_sample_key，而不是全表扫。
/// 哪天把 `metric IN` 改丢了，这里立刻红——两种 scope 形态都要查。
#[test]
fn ai_export_samples_where_tail_seeks_the_metric_timestamp_index() {
    let db = Database::in_memory().unwrap();
    for single_workout in [false, true] {
        let tail = ai_export_samples_where_tail(3, single_workout);
        let mut stmt = db
            .conn
            .prepare(&format!(
                "EXPLAIN QUERY PLAN SELECT metric FROM metric_samples WHERE {tail}"
            ))
            .unwrap();
        // EXPLAIN 也要把参数绑齐（workout 形态 3+2 个，日期区间 3+4
        // 个）；值本身不影响计划形状。
        let dummies = vec!["x"; if single_workout { 5 } else { 7 }];
        let plan = stmt
            .query_map(rusqlite::params_from_iter(dummies.iter()), |row| {
                row.get::<_, String>(3)
            })
            .unwrap()
            .collect::<std::result::Result<Vec<_>, _>>()
            .unwrap()
            .join("\n");
        assert!(
            plan.contains("SEARCH metric_samples"),
            "single_workout={single_workout} 必须走索引:\n{plan}"
        );
        assert!(
            plan.contains("uq_metric_sample_key"),
            "single_workout={single_workout} 应当用 uq 前导列:\n{plan}"
        );
        assert!(
            !plan.contains("SCAN metric_samples"),
            "single_workout={single_workout} 不允许全表扫:\n{plan}"
        );
    }
}

/// 选中类型 → 库里的指标名：这正是让 `metric IN` 成立的反向展开。
/// 展开错了，导出要么少给数据、要么把没选中的指标扫进来。
#[test]
fn export_sample_metric_names_maps_selected_types_to_stored_metrics() {
    let db = Database::in_memory().unwrap();
    for metric in [
        "heart_rate",
        "spo2",
        "spo2_apnea_low",
        "weight",
        "bmi",
        "unrelated_reading",
    ] {
        db.insert_metric_sample(&MetricSample {
            metric: metric.into(),
            timestamp: ts(),
            value: 1.0,
            unit: "u".into(),
            source_scope: SourceScope::Device,
            device_id: None,
        })
        .unwrap();
    }
    let selected: BTreeSet<String> = ["spo2", "weight"]
        .iter()
        .map(|value| value.to_string())
        .collect();
    // spo2 家族 + 全部体组成指标；ORDER BY metric 保证顺序稳定。
    let names = db.export_sample_metric_names(&selected, false).unwrap();
    assert_eq!(names, vec!["bmi", "spo2", "spo2_apnea_low", "weight"]);
    // 单条运动范围：weight 是日级类型被排除，spo2 不是。
    let names = db.export_sample_metric_names(&selected, true).unwrap();
    assert_eq!(names, vec!["spo2", "spo2_apnea_low"]);
    // 选中的类型在库里没有任何对应指标 → 空列表 → 主查询整条跳过。
    let selected: BTreeSet<String> = ["stress"].iter().map(|v| v.to_string()).collect();
    assert!(db
        .export_sample_metric_names(&selected, false)
        .unwrap()
        .is_empty());
}

/// 端到端：导出只读到选中类型映得到的指标，没选中的一行不进。
#[test]
fn ai_export_reads_only_the_metrics_the_selection_maps_to() {
    let db = Database::in_memory().unwrap();
    for (metric, value) in [("heart_rate", 60.0), ("spo2", 97.0), ("unrelated", 1.0)] {
        db.insert_metric_sample(&MetricSample {
            metric: metric.into(),
            timestamp: ts(),
            value,
            unit: "u".into(),
            source_scope: SourceScope::Device,
            device_id: None,
        })
        .unwrap();
    }
    let export = parsed_export(&db, &["heart_rate"], ExportDetail::Full);
    let samples = export["data"]["metric_samples"].as_array().unwrap();
    assert_eq!(samples.len(), 1);
    assert_eq!(samples[0]["metric"], "heart_rate");
    assert_eq!(export["record_count"], 1);
}
