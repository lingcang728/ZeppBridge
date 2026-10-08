use super::*;

#[test]
fn every_advertised_metric_has_a_series_reader() {
    for name in crate::contract::metric_names() {
        assert!(
            SERIES_METRICS.iter().any(|(series, _, _)| *series == name)
                || SAMPLE_ONLY_SERIES_METRICS
                    .iter()
                    .any(|(series, _)| *series == name),
            "{name} is advertised to MCP but cannot be read as a series"
        );
    }
}

#[test]
fn daily_metric_sources_fold_with_the_fused_reading_first() {
    let db = Database::in_memory().unwrap();
    db.insert_daily_metric(&DailyMetric {
        date: "2023-11-15".into(),
        metric: "steps".into(),
        value: 67.0,
        unit: "steps".into(),
        source_scope: SourceScope::UserFused,
        device_id: None,
    })
    .unwrap();
    db.insert_daily_metric(&DailyMetric {
        date: "2023-11-15".into(),
        metric: "steps".into(),
        value: 99.0,
        unit: "steps".into(),
        source_scope: SourceScope::Device,
        device_id: Some("SN-ONE".into()),
    })
    .unwrap();

    let export = parsed_export(&db, &["steps"], ExportDetail::Summary);
    let rows = export["data"]["daily_metrics"].as_array().unwrap();
    assert_eq!(rows.len(), 1, "one day and one metric is one row");
    assert_eq!(rows[0]["value"], 67.0);
    assert_eq!(rows[0]["source_scope"], "user_fused");
    // The disagreeing device reading is kept, not silently dropped.
    let alternates = rows[0]["alternates"].as_array().unwrap();
    assert_eq!(alternates.len(), 1);
    assert_eq!(alternates[0]["value"], 99.0);
    assert_eq!(alternates[0]["source_scope"], "device");
}

#[test]
fn heart_rate_zones_offer_every_measured_basis_and_preselect_none() {
    let db = Database::in_memory().unwrap();
    // Nothing measured yet, so there is no defensible basis for any model.
    let empty = parsed_export(&db, &["workouts"], ExportDetail::Summary);
    assert!(
        empty["analysis"].get("heart_rate_zones").is_none(),
        "zones must not appear without a measured basis"
    );

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
        max_hr: Some(200),
        training_load: Some(20.0),
        vo2max: None,
        source_scope: SourceScope::Device,
        device_id: None,
        synced_at: None,
        gps_available: false,
        sample_count: 0,
        zepp_source: None,
        zepp_type: None,
        ..Default::default()
    })
    .unwrap();

    let export = parsed_export(&db, &["workouts"], ExportDetail::Summary);
    let zones = &export["analysis"]["heart_rate_zones"];
    assert!(
        zones["selected_model"].is_null(),
        "the export must not choose a model on the user's behalf"
    );
    let models = zones["models"].as_array().unwrap();
    // Only the observed maximum exists, so only the max-HR model can be
    // computed; the reserve model needs a resting rate and the threshold
    // model a threshold, and neither is measured yet.
    assert_eq!(models.len(), 1);
    assert_eq!(models[0]["model"], "max_hr");
    assert_eq!(models[0]["selected"], false);
    assert_eq!(models[0]["bases"][0]["id"], "observed_max");
    assert_eq!(models[0]["bases"][0]["value"], 200.0);
    // 50-60% of 200 bpm.
    assert_eq!(models[0]["zones"][0]["min_bpm"], 100);
    assert_eq!(models[0]["zones"][0]["max_bpm"], 119);
    assert_eq!(models[0]["zones"].as_array().unwrap().len(), 5);
}

/// The three models are not house style: the watch ships its own
/// boundaries in every workout summary. For a lactate threshold of
/// 175 bpm it sends 113/141/154/162/173/190, and reproducing those exact
/// integers is what proves the percentages and the flooring are right.
#[test]
fn threshold_zone_boundaries_match_the_watch() {
    let db = Database::in_memory().unwrap();
    db.insert_daily_metric(&DailyMetric {
        date: "2026-08-11".into(),
        metric: "lactate_threshold_hr".into(),
        value: 175.0,
        unit: "bpm".into(),
        source_scope: SourceScope::Device,
        device_id: None,
    })
    .unwrap();

    db.set_heart_rate_zone_preference(&HeartRateZonePreference {
        model: Some("lactate_threshold".into()),
        threshold_basis: Some("lactate_threshold".into()),
        ..Default::default()
    })
    .unwrap();
    let options = db.heart_rate_zone_options(30).unwrap();
    let report = options.report.expect("a chosen model produces zones");
    let lower: Vec<i32> = report.zones.iter().map(|zone| zone.min_bpm).collect();
    assert_eq!(lower, vec![113, 141, 154, 162, 173]);
    assert_eq!(
        report.zones[4].max_bpm, 189,
        "the 109% cap is 190 exclusive"
    );
    assert_eq!(report.bases[0].measured_at.as_deref(), Some("2026-08-11"));
}

/// A model can only be chosen once its basis is measured, and clearing the
/// choice has to be a state the picker can return to.
#[test]
fn zone_preference_needs_a_measured_basis_and_can_be_cleared() {
    let db = Database::in_memory().unwrap();
    db.set_heart_rate_zone_preference(&HeartRateZonePreference {
        model: Some("lactate_threshold".into()),
        threshold_basis: Some("lactate_threshold".into()),
        ..Default::default()
    })
    .unwrap();
    let chosen = db.heart_rate_zone_options(30).unwrap();
    assert!(
        chosen.report.is_none(),
        "a preference naming a basis nothing measured yields no zones"
    );
    assert!(chosen.models.iter().all(|model| !model.available));

    db.set_heart_rate_zone_preference(&HeartRateZonePreference::default())
        .unwrap();
    let cleared = db.heart_rate_zone_options(30).unwrap();
    assert_eq!(cleared.preference, HeartRateZonePreference::default());
    assert!(cleared.report.is_none());
}

/// Charts must read the same numbers the export does, and must say how
/// much of the window is actually covered rather than drawing through the
/// gaps.
#[test]
fn metric_series_reports_coverage_and_prefers_the_fused_reading() {
    let db = Database::in_memory().unwrap();
    let today = Local::now().date_naive().format("%Y-%m-%d").to_string();
    for (scope, value) in [(SourceScope::Device, 40.0), (SourceScope::UserFused, 26.0)] {
        db.insert_daily_metric(&DailyMetric {
            date: today.clone(),
            metric: "stress".into(),
            value,
            unit: "score".into(),
            source_scope: scope,
            device_id: None,
        })
        .unwrap();
    }
    db.insert_daily_metric(&DailyMetric {
        date: today.clone(),
        metric: "stress_max".into(),
        value: 55.0,
        unit: "score".into(),
        source_scope: SourceScope::UserFused,
        device_id: None,
    })
    .unwrap();

    let series = db.metric_series(&["stress".to_string()], 7).unwrap();
    assert_eq!(series.len(), 1);
    assert_eq!(series[0].unit, "score");
    assert_eq!(series[0].window_days, 7);
    assert_eq!(
        series[0].days_with_data, 1,
        "six of the seven days are empty"
    );
    assert_eq!(series[0].points[0].value, 26.0);
    assert_eq!(series[0].points[0].max, Some(55.0));
    assert_eq!(series[0].points[0].min, None, "no minimum was measured");

    // An unknown name is skipped rather than charted with a made-up unit.
    assert!(db
        .metric_series(&["not_a_metric".to_string()], 7)
        .unwrap()
        .is_empty());
}

/// A stopped runner still gets `equivPace` readings, and the device sends
/// them unchanged — 51604 s/km appears in this account's own library. They
/// are not paces and must not reach a chart or a summary.
#[test]
fn standing_still_is_not_an_equivalent_pace() {
    assert_eq!(plausible_equivalent_pace(Some(355.0)), Some(355.0));
    assert_eq!(plausible_equivalent_pace(Some(51_604.0)), None);
    assert_eq!(plausible_equivalent_pace(Some(0.0)), None);
    assert_eq!(plausible_equivalent_pace(None), None);

    let samples = vec![
        WorkoutSeriesSample {
            timestamp: "1".into(),
            equivalent_pace_s_per_km: Some(51_604.0),
            ..Default::default()
        },
        WorkoutSeriesSample {
            timestamp: "2".into(),
            equivalent_pace_s_per_km: Some(264.0),
            ..Default::default()
        },
    ];
    let summary = workout_series_summary(&samples);
    assert_eq!(summary.best_equivalent_pace_s_per_km, Some(264.0));
}

#[test]
fn acwr_stays_silent_until_the_chronic_window_is_covered() {
    let db = Database::in_memory().unwrap();
    // Nine days of load: enough for the acute window, nowhere near the
    // chronic one. A ratio here would read as a spike that never happened.
    for day in 1..=9 {
        insert_acwr_workout(&db, &format!("2023-11-{day:02}"), Some(100.0));
        db.insert_daily_metric(&DailyMetric {
            date: format!("2023-11-{day:02}"),
            metric: "training_load".into(),
            value: 100.0,
            unit: "load".into(),
            source_scope: SourceScope::Unknown,
            device_id: None,
        })
        .unwrap();
    }
    confirm_acwr_days(&db, "2023-11-01", "2023-11-10");
    let export = parsed_export(&db, &["training_load"], ExportDetail::Summary);
    assert_eq!(
        export["analysis"]["training_load_balance"]["source"],
        "workouts.training_load"
    );
    let days = export["analysis"]["training_load_balance"]["days"]
        .as_array()
        .unwrap();
    let ninth = days
        .iter()
        .find(|day| day["date"] == "2023-11-09")
        .expect("day in range");
    assert_eq!(ninth["acute_7d"], 700.0);
    assert_eq!(ninth["acute_days_with_data"], 7);
    assert!(
        ninth["acute_chronic_ratio"].is_null(),
        "a ratio against a partly empty chronic window is misleading"
    );
}

/// Records the evidence a fully paged legacy workout fetch over `[start, end)`
/// would leave, listing every workout already stored.
fn confirm_acwr_days(db: &Database, start: &str, end: &str) {
    let parse = |s: &str| {
        Local
            .from_local_datetime(
                &NaiveDate::parse_from_str(s, "%Y-%m-%d")
                    .unwrap()
                    .and_hms_opt(0, 0, 0)
                    .unwrap(),
            )
            .single()
            .unwrap()
            .with_timezone(&Utc)
    };
    let mut stmt = db
        .conn
        .prepare("SELECT workout_id, start_time FROM workouts")
        .unwrap();
    let items: Vec<serde_json::Value> = stmt
        .query_map([], |row| {
            let id: String = row.get(0)?;
            let start: String = row.get(1)?;
            let time = DateTime::parse_from_rfc3339(&start).unwrap();
            Ok(serde_json::json!({"workout_id":id,"start_time":time.timestamp(),"end_time":time.timestamp()+1800,"type":1}))
        })
        .unwrap()
        .collect::<rusqlite::Result<_>>()
        .unwrap();
    let payload = serde_json::json!({"data":{"items":items,"next":-1}});
    let record = crate::fetcher::FetchedRecord {
        raw: RawRecord {
            stream: "workouts".into(),
            source_key: crate::fetcher::sport_history_key("run", &payload),
            source_scope: SourceScope::Device,
            device_id: None,
            start_utc: parse(start),
            end_utc: Some(parse(end)),
            payload,
            capability: CapabilityStatus::Verified,
        },
        incomplete: false,
        incomplete_reason: None,
    };
    let evidence = crate::storage::training_coverage::workout_day_evidence(&[record]);
    assert!(!evidence.is_empty());
    db.record_workout_day_evidence(&evidence).unwrap();
}

fn insert_acwr_workout(db: &Database, day: &str, load: Option<f64>) {
    let local = Local
        .from_local_datetime(
            &NaiveDate::parse_from_str(day, "%Y-%m-%d")
                .unwrap()
                .and_hms_opt(12, 0, 0)
                .unwrap(),
        )
        .single()
        .unwrap();
    db.conn
        .execute(
            "INSERT INTO workouts (workout_id, workout_type, start_time, end_time, training_load, source_scope)
             VALUES (?1, 'run', ?2, ?2, ?3, 'device')",
            params![format!("{day}-{load:?}"), local.with_timezone(&Utc).to_rfc3339(), load],
        )
        .unwrap();
}

#[test]
fn acwr_unknown_loads_and_missing_days_keep_windows_null() {
    let db = Database::in_memory().unwrap();
    let day = NaiveDate::from_ymd_opt(2023, 11, 28).unwrap();
    insert_acwr_workout(&db, "2023-11-28", Some(700.0));
    confirm_acwr_days(&db, "2023-11-02", "2023-11-29");
    let point = db.training_load_balance(day, day).unwrap().remove(0);
    assert_eq!(point.acute_7d, Some(700.0));
    assert_eq!(point.chronic_28d, None);
    assert_eq!(point.chronic_days_with_data, 27);
    assert_eq!(point.acute_chronic_ratio, None);
    confirm_acwr_days(&db, "2023-11-01", "2023-11-29");
    insert_acwr_workout(&db, "2023-11-28", None);
    confirm_acwr_days(&db, "2023-11-01", "2023-11-29");
    let point = db.training_load_balance(day, day).unwrap().remove(0);
    assert_eq!(point.acute_days_with_data, 6);
    assert_eq!(point.acute_7d, None);
    assert_eq!(point.chronic_28d, None);
    assert_eq!(point.acute_chronic_ratio, None);
    db.conn.execute("DELETE FROM workouts", []).unwrap();
    assert_eq!(
        db.training_load_balance(day, day).unwrap()[0].acute_7d,
        None,
        "deleted records invalidate prior coverage"
    );
    confirm_acwr_days(&db, "2023-11-01", "2023-11-29");
    let point = db.training_load_balance(day, day).unwrap().remove(0);
    assert_eq!(point.acute_7d, Some(0.0));
    assert_eq!(point.chronic_28d, Some(0.0));
    assert_eq!(point.acute_chronic_ratio, None);
}

#[test]
fn acwr_counts_a_workout_once_and_keeps_observed_rest_days() {
    let db = Database::in_memory().unwrap();
    let start = NaiveDate::from_ymd_opt(2023, 11, 1).unwrap();
    for offset in 0..35 {
        let day = (start + Duration::days(offset)).to_string();
        db.insert_daily_metric(&DailyMetric {
            date: day.clone(),
            metric: "steps".into(),
            value: 1000.0,
            unit: "steps".into(),
            source_scope: SourceScope::UserFused,
            device_id: None,
        })
        .unwrap();
        // A stale rolling cloud total must never enter either load sum.
        db.insert_daily_metric(&DailyMetric {
            date: day,
            metric: "training_load".into(),
            value: 700.0,
            unit: "load".into(),
            source_scope: SourceScope::Device,
            device_id: Some("watch".into()),
        })
        .unwrap();
    }
    let workout_day = start + Duration::days(27);
    insert_acwr_workout(&db, &workout_day.to_string(), Some(700.0));
    confirm_acwr_days(&db, "2023-11-01", "2023-12-27");
    let points = db
        .training_load_balance(workout_day, workout_day + Duration::days(28))
        .unwrap();
    for point in &points[..7] {
        assert_eq!(point.acute_7d, Some(700.0));
        assert_eq!(point.chronic_28d, Some(700.0));
        assert_eq!(point.acute_days_with_data, 7);
        assert_eq!(point.chronic_days_with_data, 28);
        assert_eq!(point.acute_chronic_ratio, Some(4.0));
    }
    assert_eq!(points[7].acute_7d, Some(0.0));
    assert_eq!(points[7].acute_chronic_ratio, Some(0.0));
    assert_eq!(points[27].chronic_28d, Some(700.0));
    assert_eq!(points[28].chronic_28d, Some(0.0));
    assert_eq!(points[28].acute_chronic_ratio, None);
    let export = parsed_export(&db, &["training_load"], ExportDetail::Summary);
    assert_eq!(
        export["analysis"]["training_load_balance"]["days"][27],
        serde_json::to_value(&points[0]).unwrap()
    );
}

#[test]
fn acwr_groups_workouts_by_local_start_day_and_does_not_invent_coverage() {
    let db = Database::in_memory().unwrap();
    // Pick an explicit offset on the opposite side of midnight from the
    // machine's local day. This exercises localtime on UTC CI as well.
    let instant = Utc.with_ymd_and_hms(2023, 11, 15, 12, 30, 0).unwrap();
    let day = instant.with_timezone(&Local).date_naive();
    let offset = if day == instant.date_naive() {
        14 * 3600
    } else {
        -12 * 3600
    };
    let timestamp = instant
        .with_timezone(&chrono::FixedOffset::east_opt(offset).unwrap())
        .to_rfc3339();
    assert_ne!(&timestamp[..10], day.to_string());
    db.conn
        .execute(
            "INSERT INTO workouts (workout_id, workout_type, start_time, end_time, training_load, source_scope)
             VALUES ('offset', 'run', ?1, ?1, 100, 'device')",
            [&timestamp],
        )
        .unwrap();
    insert_acwr_workout(&db, &day.to_string(), Some(200.0));
    confirm_acwr_days(
        &db,
        &(day - Duration::days(27)).to_string(),
        &(day + Duration::days(1)).to_string(),
    );
    let complete = db.training_load_balance(day, day).unwrap();
    assert_eq!(complete[0].acute_7d, Some(300.0));
    insert_acwr_workout(&db, &day.to_string(), None);
    insert_acwr_workout(&db, &(day - Duration::days(1)).to_string(), None);
    insert_acwr_workout(&db, &(day - Duration::days(2)).to_string(), Some(-1.0));
    let points = db.training_load_balance(day, day).unwrap();
    assert_eq!(points[0].acute_7d, None);
    assert_eq!(points[0].chronic_28d, None);
    assert_eq!(points[0].acute_days_with_data, 4);
    assert_eq!(points[0].chronic_days_with_data, 25);
    assert_eq!(points[0].acute_chronic_ratio, None);
    let empty = Database::in_memory()
        .unwrap()
        .training_load_balance(day, day)
        .unwrap();
    assert_eq!(empty[0].acute_7d, None);
    assert_eq!(empty[0].chronic_days_with_data, 0);
    assert_eq!(empty[0].acute_chronic_ratio, None);
}

#[test]
fn agreeing_daily_sources_do_not_produce_noise() {
    let db = Database::in_memory().unwrap();
    for (scope, device) in [
        (SourceScope::UserFused, None),
        (SourceScope::Device, Some("SN-ONE".to_string())),
    ] {
        db.insert_daily_metric(&DailyMetric {
            date: "2023-11-15".into(),
            metric: "steps".into(),
            value: 67.0,
            unit: "steps".into(),
            source_scope: scope,
            device_id: device,
        })
        .unwrap();
    }
    let export = parsed_export(&db, &["steps"], ExportDetail::Summary);
    let rows = export["data"]["daily_metrics"].as_array().unwrap();
    assert_eq!(rows.len(), 1);
    assert!(
        rows[0].get("alternates").is_none(),
        "sources that agree need no alternates block"
    );
}

#[test]
fn zepp_pace_is_remapped_to_minutes_per_kilometre() {
    let from_speed = pace_minutes_per_kilometre(Some(0.4), Some(2.5)).unwrap();
    let from_reciprocal = pace_minutes_per_kilometre(Some(0.4), None).unwrap();
    assert!((from_speed - 6.666_666_666).abs() < 0.000_001);
    assert!((from_reciprocal - 6.666_666_666).abs() < 0.000_001);
    assert_eq!(pace_minutes_per_kilometre(Some(0.0), Some(0.0)), None);
}

#[test]
fn workout_summary_uses_valid_samples_and_ignores_altitude_jumps() {
    let samples = vec![
        WorkoutSeriesSample {
            timestamp: "1".into(),
            heart_rate: None,
            speed: None,
            pace: Some(6.0),
            cadence: Some(160.0),
            stride_cm: Some(98.0),
            altitude_m: Some(10.0),
            ..Default::default()
        },
        WorkoutSeriesSample {
            timestamp: "2".into(),
            heart_rate: None,
            speed: None,
            pace: Some(7.0),
            cadence: Some(170.0),
            stride_cm: Some(102.0),
            altitude_m: Some(14.0),
            ..Default::default()
        },
        WorkoutSeriesSample {
            timestamp: "3".into(),
            heart_rate: None,
            speed: None,
            pace: Some(0.0),
            cadence: Some(0.0),
            stride_cm: None,
            altitude_m: Some(100.0),
            ..Default::default()
        },
    ];
    let summary = workout_series_summary(&samples);
    assert_eq!(summary.average_pace, Some(6.5));
    assert_eq!(summary.average_cadence, Some(165.0));
    assert_eq!(summary.max_cadence, Some(170.0));
    assert_eq!(summary.average_stride_cm, Some(100.0));
    assert_eq!(summary.elevation_gain_m, Some(4.0));
    assert_eq!(summary.elevation_loss_m, Some(0.0));
}

/// 宽限界是「超集」不是「替代」：UTC 日期与本地日期不同的样本不能被
/// 界误伤，窗口外的样本仍要被 date() 精修挡住。
#[test]
fn daily_heart_rate_extremes_keeps_local_day_semantics_with_utc_bounds() {
    let db = Database::in_memory().unwrap();
    let today = Local::now().date_naive();
    let local_at = |day: NaiveDate, hour: u32, minute: u32| {
        Local
            .from_local_datetime(&day.and_hms_opt(hour, minute, 0).unwrap())
            .single()
            .unwrap()
            .with_timezone(&Utc)
    };
    // 本地 00:30：UTC 日期可能落在前一天，宽限界必须把它留在里面。
    let inside = local_at(today, 0, 30);
    let outside = local_at(today - Duration::days(31), 23, 30);
    for (when, value) in [(inside, 70.0), (outside, 99.0)] {
        db.insert_metric_sample(&MetricSample {
            metric: "heart_rate".into(),
            timestamp: when,
            value,
            unit: "bpm".into(),
            source_scope: SourceScope::Device,
            device_id: None,
        })
        .unwrap();
    }
    let extremes = db.daily_heart_rate_extremes(30).unwrap();
    assert_eq!(extremes.len(), 1, "窗口外的样本不许混进来");
    assert_eq!(extremes[0].date, today.format("%Y-%m-%d").to_string());
    assert_eq!(extremes[0].samples, 1);
    assert_eq!(extremes[0].max, 70);
}

/// 写得进库，就得画得出来。
///
/// `metric_series` 对不认识的指标名是**静默跳过**（那个 `continue`），所以
/// 一个只登记在归一化那边、忘了写进 `SERIES_METRICS` 的指标，会一路正常：
/// 库里有行、导出有值、契约里也有它，唯独界面上是一张永远空着的卡片，而且
/// 没有任何一处报错。体重那一版正是这么漏的。
#[test]
fn every_metric_the_contract_promises_can_be_charted() {
    let chartable: std::collections::BTreeSet<&str> = SERIES_METRICS
        .iter()
        .map(|(name, _, _)| *name)
        .chain(SAMPLE_ONLY_SERIES_METRICS.iter().map(|(name, _)| *name))
        .collect();
    // 体重系和饮食：这两组都是「写进库了但界面读不到」翻过车的地方。
    let must_chart = crate::storage::BODY_COMPOSITION_METRICS
        .iter()
        .copied()
        .chain([
            "intake_calories",
            "intake_protein_g",
            "intake_fat_g",
            "intake_carbs_g",
        ]);
    let missing: Vec<&str> = must_chart
        .filter(|metric| !chartable.contains(metric))
        .collect();
    assert!(
        missing.is_empty(),
        "这些指标写得进库却画不出来，界面上会是空卡片：{missing:?}"
    );
}

/// 登记成 `Samples` 的指标，真的要能从 `metric_samples` 里读出来。
///
/// 光在名单里有一行不够：源写错了（比如把只存在 metric_samples 里的东西
/// 标成 Daily），查的是另一张表，结果同样是空的。
#[test]
fn weight_samples_come_back_as_a_series() {
    let db = Database::in_memory().unwrap();
    let now = Utc::now();
    for (metric, value, unit) in [
        ("weight", 68.2_f64, "kg"),
        ("bmi", 22.1, "kg/m2"),
        ("body_fat_rate", 18.5, "%"),
    ] {
        db.insert_metric_sample(&MetricSample {
            metric: metric.to_string(),
            timestamp: now,
            value,
            unit: unit.to_string(),
            source_scope: SourceScope::UserFused,
            device_id: None,
        })
        .unwrap();
    }

    let series = db
        .metric_series(
            &[
                "weight".to_string(),
                "bmi".to_string(),
                "body_fat_rate".to_string(),
            ],
            30,
        )
        .unwrap();
    assert_eq!(series.len(), 3, "三条都要回来，一条都不能被静默跳过");
    let weight = series.iter().find(|s| s.metric == "weight").unwrap();
    assert_eq!(weight.source, "metric_samples");
    assert_eq!(weight.unit, "kg");
    assert_eq!(weight.latest.as_ref().map(|point| point.value), Some(68.2));
}
