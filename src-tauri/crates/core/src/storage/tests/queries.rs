use super::*;

#[test]
fn storage_estimate_only_extrapolates_streams_that_have_enough_local_history() {
    let db = Database::in_memory().unwrap();
    // daily_summary：一年的历史，但只在 12 次抓取里拿回来——真实数据就是
    // 这样，一条报文覆盖一个月。分母必须是覆盖的天数，不是抓取的次数。
    for month in 0..12 {
        db.insert_raw_record(&RawRecord {
            stream: "daily_summary".into(),
            source_key: format!("daily-{month}"),
            source_scope: SourceScope::UserFused,
            device_id: None,
            start_utc: ts() + chrono::Duration::days(month * 30),
            end_utc: None,
            payload: serde_json::json!({ "data": [{ "date": "2023-11-14" }] }),
            capability: CapabilityStatus::Verified,
        })
        .unwrap();
    }
    // sleep：只有一天，不够外推。
    db.insert_raw_record(&RawRecord {
        stream: "sleep".into(),
        source_key: "sleep-only-one-day".into(),
        source_scope: SourceScope::Device,
        device_id: None,
        start_utc: ts(),
        end_utc: None,
        payload: serde_json::json!({ "data": [] }),
        capability: CapabilityStatus::Verified,
    })
    .unwrap();

    let estimate = db
        .storage_estimate(365, &std::env::temp_dir())
        .expect("估算不该失败");

    let daily = estimate
        .streams
        .iter()
        .find(|stream| stream.stream == "daily_summary")
        .unwrap();
    assert!(daily.measured, "跨越一年的样本足以外推");
    assert!(
            daily.observed_days > 300,
            "分母应当是覆盖的天数（约 331），拿到的是 {}——如果这里是 12，             说明又在用抓取次数当分母，一年的估算会被放大三十倍",
            daily.observed_days
        );
    assert_eq!(daily.estimated_add_bytes, daily.bytes_per_day * 365);

    let sleep = estimate
        .streams
        .iter()
        .find(|stream| stream.stream == "sleep")
        .unwrap();
    assert!(!sleep.measured, "一天样本不足以外推");
    assert_eq!(
        sleep.estimated_add_bytes, 0,
        "样本不足时应当说不知道，而不是编一个速率乘一年"
    );

    assert!(!estimate.measured, "还有流没有样本，总数不能声称是实测的");
    assert!(
        estimate.message.contains("未计入"),
        "总数只覆盖部分流这件事必须说出来: {}",
        estimate.message
    );
}

#[test]
fn storage_estimate_covers_multi_year_backfill_not_just_the_retention_window() {
    let db = Database::in_memory().unwrap();
    // 保留期上限是 365 天，但补拉可以跨多年；估算必须能回答后者。
    let estimate = db
        .storage_estimate(1095, &std::env::temp_dir())
        .expect("三年的估算不该被保留期的上限挡住");
    assert_eq!(estimate.requested_days, 1095);
    assert!(db.storage_estimate(4000, &std::env::temp_dir()).is_err());
}

#[test]
fn prefs_default_to_365_and_180_without_writing_old_30_day_retention() {
    let db = Database::in_memory().unwrap();
    let prefs = db.user_prefs().unwrap();
    assert_eq!(prefs.retention_days, 365);
    assert_eq!(prefs.history_sync_days, 180);
    assert!(db.get_app_meta("retention_days").unwrap().is_none());
}

/// 新建的库默认长期归档（不自动清理）；已经存在、从没写过这个键的库保持原来的
/// 「只留最近 N 天」——升级不能替用户改设置。
#[test]
fn fresh_library_defaults_to_long_term_archive_but_existing_ones_keep_theirs() {
    let db = Database::in_memory().unwrap();
    assert!(
        db.user_prefs().unwrap().archive_enabled,
        "新库应默认长期归档"
    );

    let dir = std::env::temp_dir().join(format!("zb-archive-default-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join("zepp.db");
    let db = Database::open_migrated(&path).unwrap();
    assert!(db.user_prefs().unwrap().archive_enabled);
    // 模拟一个老库：从没写过 archive_enabled。
    db.conn
        .execute("DELETE FROM app_meta WHERE key = 'archive_enabled'", [])
        .unwrap();
    drop(db);
    let db = Database::open_migrated(&path).unwrap();
    assert!(
        !db.user_prefs().unwrap().archive_enabled,
        "老库重新打开不能被改成长期归档"
    );
    drop(db);
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn local_coverage_is_empty_on_a_fresh_library() {
    let db = Database::in_memory().unwrap();
    let coverage = db.local_coverage(Local::now().date_naive()).unwrap();
    assert_eq!(coverage.earliest_day, None);
    assert_eq!(coverage.latest_day, None);
    // 0 而不是「今天到今天 = 1 天」：库里一条都没有，覆盖就是零。
    assert_eq!(coverage.covered_days, 0);
}

#[test]
fn local_coverage_takes_the_union_across_tables() {
    let db = Database::in_memory().unwrap();
    // 只有运动、没有日概览的账号是真实存在的。只查 daily_metrics 会把这类
    // 账号的覆盖范围少报好几个月——正是这里要防的。
    db.conn
            .execute(
                "INSERT INTO daily_metrics (date, metric, value, unit, source_scope)                  VALUES ('2026-06-10', 'steps', 1000.0, 'count', 'user_fused')",
                [],
            )
            .unwrap();
    db.conn
            .execute(
                "INSERT INTO workouts (workout_id, workout_type, start_time, end_time,                  source_scope) VALUES ('w1', 'run', ?1,                  ?2, 'device')",
                rusqlite::params![
                    Local
                        .with_ymd_and_hms(2026, 3, 2, 7, 0, 0)
                        .unwrap()
                        .with_timezone(&Utc)
                        .to_rfc3339(),
                    (Local.with_ymd_and_hms(2026, 3, 2, 7, 0, 0).unwrap() + Duration::hours(1))
                        .with_timezone(&Utc)
                        .to_rfc3339(),
                ],
            )
            .unwrap();

    let coverage = db
        .local_coverage(NaiveDate::from_ymd_opt(2026, 6, 15).unwrap())
        .unwrap();
    assert_eq!(coverage.earliest_day.as_deref(), Some("2026-03-02"));
    assert_eq!(coverage.latest_day.as_deref(), Some("2026-06-10"));
    assert!(coverage.covered_days > 0);
}

#[test]
fn missing_rem_is_stored_as_unavailable() {
    let db = Database::in_memory().unwrap();
    db.insert_sleep_session(&SleepSession {
        sleep_id: "sleep-no-rem".into(),
        start_time: ts(),
        end_time: ts() + chrono::Duration::minutes(400),
        score: Some(70),
        duration_minutes: 400,
        deep_minutes: Some(80),
        light_minutes: Some(200),
        rem_minutes: None,
        awake_minutes: Some(20),
        source_scope: SourceScope::Device,
        device_id: None,
        synced_at: None,
        time_in_bed_minutes: None,
        wake_count: None,
        stages: Vec::new(),
    })
    .unwrap();
    assert_eq!(
        db.get_sleep_detail("sleep-no-rem")
            .unwrap()
            .unwrap()
            .rem_minutes,
        None
    );
}

#[test]
fn missing_sleep_stages_are_stored_as_unavailable_and_query_returns_none() {
    let db = Database::in_memory().unwrap();
    let version: i64 = db
        .conn
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .unwrap();
    assert_eq!(version, CURRENT_SCHEMA_VERSION);
    assert_eq!(CURRENT_SCHEMA_VERSION, 34);

    let start = ts();
    db.insert_sleep_session(&SleepSession {
        sleep_id: "sleep-no-stages".into(),
        start_time: start,
        end_time: start + chrono::Duration::minutes(400),
        score: Some(70),
        duration_minutes: 400,
        deep_minutes: None,
        light_minutes: None,
        rem_minutes: None,
        awake_minutes: None,
        source_scope: SourceScope::Device,
        device_id: None,
        synced_at: None,
        time_in_bed_minutes: None,
        wake_count: None,
        stages: Vec::new(),
    })
    .unwrap();

    assert_eq!(sleep_stage_flags(&db, "sleep-no-stages"), (0, 0, 0, 0));
    let stored: (i32, i32, i32, i32) = db
        .conn
        .query_row(
            "SELECT deep_minutes, light_minutes, rem_minutes, awake_minutes
                 FROM sleep_sessions WHERE sleep_id = 'sleep-no-stages'",
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .unwrap();
    assert_eq!(stored, (0, 0, 0, 0));

    let detail = db.get_sleep_detail("sleep-no-stages").unwrap().unwrap();
    assert_eq!(detail.deep_minutes, None);
    assert_eq!(detail.light_minutes, None);
    assert_eq!(detail.rem_minutes, None);
    assert_eq!(detail.awake_minutes, None);
    assert_eq!(detail.duration_minutes, 400);

    let listed = db.get_recent_sleep_sessions(1).unwrap();
    assert_eq!(listed[0].deep_minutes, None);
    assert_eq!(listed[0].awake_minutes, None);

    let export = parsed_export(&db, &["sleep"], ExportDetail::Summary);
    let session = &export["data"]["sleep_sessions"][0];
    assert!(session["deep_minutes"].is_null());
    assert!(session["light_minutes"].is_null());
    assert!(session["rem_minutes"].is_null());
    assert!(session["awake_minutes"].is_null());
    assert_eq!(session["duration_minutes"], 400);
}

#[test]
fn present_sleep_stages_round_trip_with_available_flags() {
    let db = Database::in_memory().unwrap();
    db.insert_sleep_session(&SleepSession {
        sleep_id: "sleep-stages-present".into(),
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
        wake_count: None,
        stages: Vec::new(),
    })
    .unwrap();

    assert_eq!(sleep_stage_flags(&db, "sleep-stages-present"), (1, 1, 1, 1));
    let detail = db
        .get_sleep_detail("sleep-stages-present")
        .unwrap()
        .unwrap();
    assert_eq!(detail.deep_minutes, Some(80));
    assert_eq!(detail.light_minutes, Some(240));
    assert_eq!(detail.rem_minutes, Some(40));
    assert_eq!(detail.awake_minutes, Some(20));

    let export = parsed_export(&db, &["sleep"], ExportDetail::Summary);
    let session = &export["data"]["sleep_sessions"][0];
    assert_eq!(session["deep_minutes"], 80);
    assert_eq!(session["light_minutes"], 240);
    assert_eq!(session["rem_minutes"], 40);
    assert_eq!(session["awake_minutes"], 20);
}

#[test]
fn retention_rejects_unsafe_ranges() {
    let db = Database::in_memory().unwrap();
    assert!(db.cleanup_old_data(0).is_err());
    assert!(db.cleanup_old_data(366).is_err());
}

#[test]
fn cleanup_uses_local_day_cutoff_and_drops_workout_hr_zones() {
    let db = Database::in_memory().unwrap();
    let local_today = Local::now().date_naive();
    let old_date = (local_today - Duration::days(40))
        .format("%Y-%m-%d")
        .to_string();
    let kept_date = (local_today - Duration::days(10))
        .format("%Y-%m-%d")
        .to_string();
    db.conn
        .execute(
            "INSERT INTO daily_metrics(date, metric, value, unit, source_scope)
                 VALUES (?1, 'steps', 1, 'count', 'device')",
            [&old_date],
        )
        .unwrap();
    db.conn
        .execute(
            "INSERT INTO daily_metrics(date, metric, value, unit, source_scope)
                 VALUES (?1, 'steps', 2, 'count', 'device')",
            [&kept_date],
        )
        .unwrap();
    let old_start = (Utc::now() - Duration::days(40)).to_rfc3339();
    let old_end = (Utc::now() - Duration::days(40) + Duration::hours(1)).to_rfc3339();
    db.conn
        .execute(
            "INSERT INTO workouts(workout_id, workout_type, start_time, end_time, source_scope)
                 VALUES ('old', 'run', ?1, ?2, 'device')",
            [&old_start, &old_end],
        )
        .unwrap();
    db.conn
        .execute(
            "INSERT INTO workout_hr_zones(workout_id, zone_index, upper_bound_bpm, seconds)
                 VALUES ('old', 1, 140, 60)",
            [],
        )
        .unwrap();
    let new_start = Utc::now().to_rfc3339();
    let new_end = (Utc::now() + Duration::hours(1)).to_rfc3339();
    db.conn
        .execute(
            "INSERT INTO workouts(workout_id, workout_type, start_time, end_time, source_scope)
                 VALUES ('kept', 'run', ?1, ?2, 'device')",
            [&new_start, &new_end],
        )
        .unwrap();
    db.conn
        .execute(
            "INSERT INTO workout_hr_zones(workout_id, zone_index, upper_bound_bpm, seconds)
                 VALUES ('kept', 1, 150, 30)",
            [],
        )
        .unwrap();

    db.cleanup_old_data(30).unwrap();

    let daily: i64 = db
        .conn
        .query_row("SELECT COUNT(*) FROM daily_metrics", [], |row| row.get(0))
        .unwrap();
    assert_eq!(daily, 1);
    let old_zones: i64 = db
        .conn
        .query_row(
            "SELECT COUNT(*) FROM workout_hr_zones WHERE workout_id = 'old'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(old_zones, 0);
    let kept_zones: i64 = db
        .conn
        .query_row(
            "SELECT COUNT(*) FROM workout_hr_zones WHERE workout_id = 'kept'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(kept_zones, 1);
}

/// 覆盖边界报的是**本地日**：原始列的 MIN/MAX 换算和逐行 date() 必须
/// 是同一天，否则时区不为零的机器会把边界报错一天。
#[test]
fn local_coverage_reports_the_local_day_of_raw_bounds() {
    let db = Database::in_memory().unwrap();
    // 本地 2026-03-02 00:30 —— 在非零时区机器上 UTC 日期是 03-01。
    let when = Local
        .from_local_datetime(
            &NaiveDate::from_ymd_opt(2026, 3, 2)
                .unwrap()
                .and_hms_opt(0, 30, 0)
                .unwrap(),
        )
        .single()
        .unwrap()
        .with_timezone(&Utc);
    db.insert_metric_sample(&MetricSample {
        metric: "heart_rate".into(),
        timestamp: when,
        value: 60.0,
        unit: "bpm".into(),
        source_scope: SourceScope::Device,
        device_id: None,
    })
    .unwrap();
    let coverage = db
        .local_coverage(NaiveDate::from_ymd_opt(2026, 6, 15).unwrap())
        .unwrap();
    assert_eq!(coverage.earliest_day.as_deref(), Some("2026-03-02"));
    assert_eq!(coverage.latest_day.as_deref(), Some("2026-03-02"));
}

/// overview_metadata 的覆盖与流计数拆开后语义不变：本地日边界取并集，
/// stream / source_scope 的 DISTINCT 照旧。
#[test]
fn health_overview_coverage_uses_local_days_and_table_union() {
    let db = Database::in_memory().unwrap();
    db.conn
        .execute(
            "INSERT INTO daily_metrics (date, metric, value, unit, source_scope)
                 VALUES ('2026-06-10', 'steps', 1000.0, 'count', 'user_fused')",
            [],
        )
        .unwrap();
    let local_at = |hour: u32| {
        Local
            .from_local_datetime(
                &NaiveDate::from_ymd_opt(2026, 3, 2)
                    .unwrap()
                    .and_hms_opt(hour, 0, 0)
                    .unwrap(),
            )
            .single()
            .unwrap()
            .with_timezone(&Utc)
    };
    db.insert_workout(&Workout {
        workout_id: "w-coverage".into(),
        start_time: local_at(7),
        end_time: local_at(8),
        ..workout_with_type(None, "run", "string_field")
    })
    .unwrap();
    let overview = db.get_health_overview().unwrap();
    let coverage = overview.coverage.expect("有数据就要报覆盖");
    assert_eq!(coverage.start, "2026-03-02");
    assert_eq!(coverage.end, "2026-06-10");
    assert_eq!(coverage.days, 101);
    // metric_samples 空 + daily_summary + workouts：两条流。
    assert_eq!(coverage.streams, 2);
}

#[test]
fn sleep_stages_round_trip_and_synced_at_is_not_end_time() {
    let db = Database::in_memory().unwrap();
    let start = ts();
    let end = start + chrono::Duration::minutes(400);
    db.insert_sleep_session(&SleepSession {
        sleep_id: "sleep-stages".into(),
        start_time: start,
        end_time: end,
        score: Some(80),
        duration_minutes: 380,
        deep_minutes: Some(80),
        light_minutes: Some(240),
        rem_minutes: Some(40),
        awake_minutes: Some(20),
        source_scope: SourceScope::Device,
        device_id: Some("SN-ONE".into()),
        synced_at: Some(start + chrono::Duration::hours(10)),
        time_in_bed_minutes: None,
        wake_count: None,
        stages: vec![SleepStageSlice {
            stage: "deep".into(),
            start_time: start,
            end_time: start + chrono::Duration::minutes(80),
            raw_mode: None,
        }],
    })
    .unwrap();
    let detail = db.get_sleep_detail("sleep-stages").unwrap().unwrap();
    assert_eq!(detail.stages.len(), 1);
    assert_eq!(detail.stages[0].stage, "deep");
    assert_eq!(detail.time_in_bed_minutes, None);
    assert_eq!(
        detail.synced_at.unwrap(),
        start + chrono::Duration::hours(10)
    );
    assert_ne!(detail.synced_at.unwrap(), detail.end_time);
}

#[test]
fn workout_detail_persists_series_and_does_not_duplicate() {
    let db = Database::in_memory().unwrap();
    db.insert_workout(&Workout {
        workout_id: "1700000000".into(),
        workout_type: "run".into(),
        normalized_type: "run".into(),
        type_source: "numeric_mapped".into(),
        user_override: None,
        effective_type: "run".into(),
        custom_label: None,
        start_time: ts(),
        end_time: ts() + chrono::Duration::minutes(10),
        distance_meters: Some(1000.0),
        calories: Some(80),
        avg_hr: Some(140),
        max_hr: Some(160),
        training_load: None,
        vo2max: None,
        source_scope: SourceScope::Device,
        device_id: None,
        synced_at: None,
        gps_available: false,
        sample_count: 0,
        zepp_source: Some("run.gps".into()),
        zepp_type: Some(1),
        ..Default::default()
    })
    .unwrap();
    let payload = serde_json::json!({
        "trackid": 1_700_000_000i64,
        "source": "run.gps",
        "time": "0;1;",
        "longitude_latitude": "4004663552,11629333504;16403,8392;",
        "heart_rate": "1,80;1,2;"
    });
    assert_eq!(db.pending_running_details().unwrap().len(), 1);
    let raw_id = db
        .insert_raw_record(&RawRecord {
            stream: "workout_detail".into(),
            source_key: "workout_detail:1700000000:run.gps".into(),
            source_scope: SourceScope::Device,
            device_id: None,
            start_utc: ts(),
            end_utc: None,
            payload: payload.clone(),
            capability: CapabilityStatus::Verified,
        })
        .unwrap();
    db.normalize_and_persist_raw(
        raw_id,
        "workout_detail",
        "workout_detail:1700000000:run.gps",
        &payload,
    )
    .unwrap();
    db.normalize_and_persist_raw(
        raw_id,
        "workout_detail",
        "workout_detail:1700000000:run.gps",
        &payload,
    )
    .unwrap();
    let series = db.get_workout_series("1700000000").unwrap();
    assert_eq!(series.route.len(), 2);
    assert!(!series.samples.is_empty());
    let sample_count: i64 = db
        .conn
        .query_row(
            "SELECT COUNT(*) FROM workout_samples WHERE workout_id = '1700000000'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(sample_count, series.samples.len() as i64);
    db.insert_raw_record(&RawRecord {
        stream: "workout_detail".into(),
        source_key: "workout_detail:1700000000:run.gps".into(),
        source_scope: SourceScope::Device,
        device_id: None,
        start_utc: ts(),
        end_utc: None,
        payload,
        capability: CapabilityStatus::Verified,
    })
    .unwrap();
    assert!(db.pending_running_details().unwrap().is_empty());
}

fn insert_pending_run(db: &Database, workout_id: &str, start: DateTime<Utc>) {
    db.insert_workout(&Workout {
        workout_id: workout_id.into(),
        workout_type: "run".into(),
        normalized_type: "run".into(),
        type_source: "numeric_mapped".into(),
        user_override: None,
        effective_type: "run".into(),
        custom_label: None,
        start_time: start,
        end_time: start + chrono::Duration::minutes(10),
        distance_meters: Some(1000.0),
        calories: Some(80),
        avg_hr: Some(140),
        max_hr: Some(160),
        training_load: None,
        vo2max: None,
        source_scope: SourceScope::Device,
        device_id: None,
        synced_at: None,
        gps_available: false,
        sample_count: 0,
        zepp_source: Some("run.gps".into()),
        zepp_type: Some(1),
        ..Default::default()
    })
    .unwrap();
}

#[test]
fn pending_running_details_are_capped_so_one_sync_cannot_fetch_the_whole_backlog() {
    let db = Database::in_memory().unwrap();
    for index in 0..(PENDING_WORKOUT_DETAIL_LIMIT + 7) {
        insert_pending_run(
            &db,
            &format!("w{index}"),
            ts() + chrono::Duration::seconds(index as i64),
        );
    }
    let pending = db.pending_running_details().unwrap();
    assert_eq!(pending.len(), PENDING_WORKOUT_DETAIL_LIMIT);
    let uncapped = db
        .pending_running_details_limited(PENDING_WORKOUT_DETAIL_LIMIT + 20)
        .unwrap();
    assert_eq!(uncapped.len(), PENDING_WORKOUT_DETAIL_LIMIT + 7);
}

#[test]
fn failed_workout_detail_attempts_drop_out_then_decay_back_in() {
    let db = Database::in_memory().unwrap();
    insert_pending_run(&db, "stuck", ts());
    for _ in 0..MAX_WORKOUT_DETAIL_ATTEMPTS {
        db.record_workout_detail_fetch_result("stuck", "run.gps", false)
            .unwrap();
    }
    assert!(
        db.pending_running_details().unwrap().is_empty(),
        "permanent failures must not stay at the front of every sync"
    );
    db.conn
        .execute(
            "UPDATE workout_detail_fetch_attempts
                 SET updated_at = ?1
                 WHERE workout_id = 'stuck'",
            [(Utc::now() - chrono::Duration::days(8)).to_rfc3339()],
        )
        .unwrap();
    let pending = db.pending_running_details().unwrap();
    assert_eq!(pending.len(), 1);
    assert_eq!(pending[0].workout_id, "stuck");
}

/// 列表和详情共用一份行解码（R01）以后，坏时间仍要报 `err.core.parse`：
/// 解析错误要是被包进 rusqlite 的错误，界面会走「数据库出错」那条文案。
#[test]
fn bad_sleep_time_is_a_parse_error_in_list_and_detail() {
    let db = Database::in_memory().unwrap();
    db.insert_sleep_session(&SleepSession {
        sleep_id: "sleep-bad-time".into(),
        start_time: ts(),
        end_time: ts() + chrono::Duration::minutes(400),
        score: None,
        duration_minutes: 380,
        deep_minutes: None,
        light_minutes: None,
        rem_minutes: None,
        awake_minutes: None,
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
            "UPDATE sleep_sessions SET start_time = 'not-a-time' WHERE sleep_id = 'sleep-bad-time'",
            [],
        )
        .unwrap();

    let list = db.sleep_sessions_page(10, 0).unwrap_err();
    assert_eq!(list.code(), "err.core.parse", "{list}");
    let detail = db.get_sleep_detail("sleep-bad-time").unwrap_err();
    assert_eq!(detail.code(), "err.core.parse", "{detail}");
}
