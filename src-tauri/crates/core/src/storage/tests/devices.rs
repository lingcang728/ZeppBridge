use super::*;

/// 云端的业务错误码要能一路走到诊断报告里。
///
/// 这条链路上每一环以前都在，只差最后一步：`classify_business_code` 能认出
/// 「HTTP 200 但云端说不成功」，provenance 也把它归成了单独一类，但那个
/// code 只进了一句给人看的中文，诊断报告里一个字都没有。
#[test]
fn a_cloud_rejection_code_reaches_the_diagnostic_report() {
    use crate::storage::provenance::{Stage, StageErrorKind, StageOutcome};

    let dir = std::env::temp_dir().join("zeppbridge-cloud-rejection-code");
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    let db = Database::open_migrated(&dir.join("zepp.db")).unwrap();

    assert_eq!(db.diagnostic_cloud_rejection().unwrap(), None);

    // 先来一条不带 code 的普通失败：它不该被当成业务拒绝上报。
    db.record_stream_stage(
        "sleep",
        Stage::Fetch,
        &StageOutcome::Failed {
            kind: StageErrorKind::Network,
            message: Some("连接超时".into()),
        },
    )
    .unwrap();
    assert_eq!(db.diagnostic_cloud_rejection().unwrap(), None);

    db.record_stream_stage(
        "workouts",
        Stage::Fetch,
        &StageOutcome::Failed {
            kind: StageErrorKind::CloudRejected { code: -1 },
            message: Some("Zepp 云端拒绝了这次请求（code -1）".into()),
        },
    )
    .unwrap();

    let rejection = db
        .diagnostic_cloud_rejection()
        .unwrap()
        .expect("业务拒绝应当能被读回来");
    assert_eq!(rejection.stream, "workouts");
    assert_eq!(rejection.code, -1);
    assert!(rejection.at.is_some());

    // 同一条流后来成功了，就不能再拿旧的 code 去烦收报告的人。
    db.record_stream_stage("workouts", Stage::Fetch, &StageOutcome::Ok)
        .unwrap();
    assert_eq!(db.diagnostic_cloud_rejection().unwrap(), None);

    drop(db);
    let _ = std::fs::remove_dir_all(&dir);
}

/// 固件版本号不是设备标识。
///
/// 真实数据的形状对照（取自本地库 `device_identities`）：
///   设备标识 → `D8803CFFFEC19AC6`（十六进制 MAC）、`23229501001311`
///              （纯数字序列号）、`PRUC72 070007001c`（产品码）
///   固件     → `0.116.137.19`、`0.132.139.2`、`V0.54.131.3`
#[test]
fn firmware_versions_are_not_mistaken_for_devices() {
    // 用户报的那三个幽灵「设备」。
    assert!(looks_like_firmware_version("0.91.20.5"));
    assert!(looks_like_firmware_version("0.91.17.5"));
    // 本地库里真实存在的固件字符串。
    assert!(looks_like_firmware_version("0.116.137.19"));
    assert!(looks_like_firmware_version("0.132.139.2"));
    assert!(looks_like_firmware_version("V0.54.131.3"));

    // 真实的设备标识一个都不能被误伤。
    assert!(!looks_like_firmware_version("D8803CFFFEC19AC6"));
    assert!(!looks_like_firmware_version("23229501001311"));
    assert!(!looks_like_firmware_version("PRUC72 070007001c"));
    assert!(!looks_like_firmware_version("2445B138005129"));
    assert!(!looks_like_firmware_version("F75C87FFFE3A9B28"));

    // 两段不算：判据要求至少三段，免得把某些点分的序列号扫进来。
    assert!(!looks_like_firmware_version("1.2"));
    assert!(!looks_like_firmware_version(""));
    assert!(!looks_like_firmware_version("1..2.3"));
    assert!(!looks_like_firmware_version("1.2.3a"));
}

/// 幽灵设备不该被记成一台设备。
#[test]
fn a_firmware_shaped_device_id_produces_no_identity() {
    let payload = serde_json::json!({
        "items": [
            { "deviceId": "0.91.20.5", "displayName": "Bip 6" },
            { "deviceId": "D8803CFFFEC19AC6", "sn": "23229501001311" }
        ]
    });
    let hints = device_identity_hints(&payload);
    let aliases: Vec<String> = hints.iter().flat_map(|h| h.aliases.clone()).collect();

    assert!(
        !aliases.iter().any(|a| a == "0.91.20.5"),
        "固件版本号不能变成设备别名，实际拿到：{aliases:?}"
    );
    assert!(aliases.iter().any(|a| a == "D8803CFFFEC19AC6"));
    assert!(aliases.iter().any(|a| a == "23229501001311"));
}

/// 真设备旁边混进一个固件形状的 `sn` 时，设备本身仍要留下，
/// 但那个假 `serial` 不能被记进去。
#[test]
fn a_firmware_shaped_serial_does_not_poison_a_real_device() {
    let payload = serde_json::json!({
        "items": [{ "deviceId": "D8803CFFFEC19AC6", "sn": "0.91.20.5" }]
    });
    let hints = device_identity_hints(&payload);

    assert_eq!(hints.len(), 1);
    assert_eq!(hints[0].device_id.as_deref(), Some("D8803CFFFEC19AC6"));
    assert_eq!(
        hints[0].serial, None,
        "固件形状的 sn 不能落进 serial —— upsert 会把它也当成别名写进去"
    );
    assert!(!hints[0].aliases.iter().any(|a| a == "0.91.20.5"));
}

#[test]
fn a_stream_the_cloud_has_but_we_never_read_is_not_reported_as_available_data() {
    // 体重和血压只探测、不归一化。探测说「云端有 42 条」，本机一条也没有。
    // 把这两件事混在一起，能力页会让人以为 ZeppBridge 已经存着他的血压。
    let db = Database::in_memory().unwrap();
    db.save_capability_probe(&[CapabilityProbe {
        stream: "blood_pressure".into(),
        surface: "v2_events".into(),
        cadence: "episodic".into(),
        window_days: 365,
        event_type: "blood_pressure".into(),
        sub_type: "real_data".into(),
        status: "available".into(),
        records: 42,
        latest_date: Some("2026-08-01".into()),
        fields: Vec::new(),
    }])
    .unwrap();

    let overview = db.capability_overview(Local::now().date_naive()).unwrap();
    let row = overview
        .items
        .iter()
        .find(|item| item.stream == "blood_pressure")
        .expect("血压应当出现在能力总览里");
    assert_eq!(row.status, "available", "云端确实有，这一点要如实说");
    assert!(!row.ingested, "但本机没有收录，不能混进「已具备」");
    assert!(
        row.note.is_some(),
        "必须说明为什么没有收录，而不是让用户自己去猜"
    );

    // 真正读进库的流仍然算已收录，否则这个标记就没有意义了。
    assert!(overview
        .items
        .iter()
        .filter(|item| item.source == "derived")
        .all(|item| item.ingested));
}

#[test]
fn food_probe_is_cloud_evidence_until_sync_or_replay_imports_it() {
    let db = Database::in_memory().unwrap();
    let today = NaiveDate::from_ymd_opt(2026, 9, 20).unwrap();
    let food = || {
        db.capability_overview(today)
            .unwrap()
            .items
            .into_iter()
            .find(|item| item.stream == "food")
            .unwrap()
    };
    assert_eq!(food().status, "no_records");
    let mut probe = CapabilityProbe {
        stream: "food".into(),
        surface: "v2_events".into(),
        cadence: "episodic".into(),
        window_days: 365,
        event_type: "Food".into(),
        sub_type: String::new(),
        status: "available".into(),
        records: 50,
        latest_date: Some("2026-09-18".into()),
        fields: Vec::new(),
    };
    db.save_capability_probe(&[probe.clone()]).unwrap();
    let row = food();
    assert_eq!(row.status, "available");
    assert_eq!(row.source, "probed");
    assert!(!row.ingested);
    assert_eq!(row.records, 50);
    assert_eq!(row.records_unit_code, "records");

    // Stale, empty, and failed probes must not claim current cloud data.
    probe.latest_date = Some("2024-01-01".into());
    db.save_capability_probe(&[probe.clone()]).unwrap();
    assert_eq!(food().status, "no_records");
    probe.latest_date = Some("2026-09-18".into());
    for status in ["empty", "unknown", "unavailable"] {
        probe.status = status.into();
        db.save_capability_probe(&[probe.clone()]).unwrap();
        assert_eq!(food().status, "no_records");
    }
    probe.status = "available".into();
    db.save_capability_probe(&[probe]).unwrap();
    let raw = RawRecord {
        stream: "wellness".into(),
        source_key: "wellness:food:v2_events:2026-09-14:2026-09-20".into(),
        source_scope: SourceScope::UserFused,
        device_id: None,
        start_utc: today.and_hms_opt(0, 0, 0).unwrap().and_utc() - Duration::days(6),
        end_utc: Some(today.and_hms_opt(0, 0, 0).unwrap().and_utc()),
        payload: serde_json::json!({"data":{"items":[{
            "timestamp": 1789689600000_i64,
            "value": {"timeZone":"UTC","samples":[
                {"mealtime":1789718400000_i64,"energy":500,"protein":20},
                {"mealtime":1789732800000_i64,"energy":300,"fatTotal":10}
            ]}
        }]}}),
        capability: CapabilityStatus::Unverified,
    };
    // A v29 database retained this day-bucket response but could not read
    // value.samples[]. The v30 replay should recover it without a fetch.
    db.insert_raw_record(&raw).unwrap();
    db.set_app_meta(
        "normalizer_revision",
        "zepp-normalizer-2026-09-v29-food-envelopes",
    )
    .unwrap();
    db.set_app_meta(LAST_CLOUD_SYNC_AT_KEY, "2026-09-19T12:00:00Z")
        .unwrap();
    assert!(db.pending_replay_plan().unwrap().is_some());
    db.reprocess_raw_records_if_needed().unwrap().unwrap();
    assert!(db.reprocess_raw_records_if_needed().unwrap().is_none());
    // The live sync/backfill path must also be idempotent after replay.
    db.persist_fetched_record(&raw).unwrap();
    let row = food();
    assert_eq!(row.source, "derived");
    assert_eq!(row.status, "available");
    assert!(row.ingested);
    assert_eq!(row.records, 1);
    assert_eq!(row.records_unit_code, "days");
    assert_eq!(row.latest_date.as_deref(), Some("2026-09-18"));
    let (count, calories): (i64, f64) = db
        .conn
        .query_row(
            "SELECT COUNT(*), SUM(value) FROM daily_metrics WHERE metric = 'intake_calories'",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .unwrap();
    assert_eq!((count, calories), (1, 800.0));
    assert_eq!(db.raw_record_count().unwrap(), 1);
    assert_eq!(
        db.get_app_meta(LAST_CLOUD_SYNC_AT_KEY).unwrap().as_deref(),
        Some("2026-09-19T12:00:00Z")
    );
}

#[test]
fn partial_capability_refresh_keeps_food_evidence_and_failures_do_not_erase_it() {
    let db = Database::in_memory().unwrap();
    let today = NaiveDate::from_ymd_opt(2026, 9, 22).unwrap();
    let food = CapabilityProbe {
        stream: "food".into(),
        surface: "v2_events".into(),
        cadence: "episodic".into(),
        window_days: 365,
        event_type: "Food".into(),
        sub_type: String::new(),
        status: "available".into(),
        records: 12,
        latest_date: Some("2026-09-02".into()),
        fields: vec!["value.foodName".into()],
    };
    db.save_capability_probe(std::slice::from_ref(&food))
        .unwrap();
    let saved: Vec<CapabilityProbe> = serde_json::from_str(
        &db.get_app_meta(CAPABILITY_PROBE_RESULT_KEY)
            .unwrap()
            .unwrap(),
    )
    .unwrap();
    assert!(saved[0].fields.is_empty());
    let mut blood_pressure = food.clone();
    blood_pressure.stream = "blood_pressure".into();
    blood_pressure.event_type = "blood_pressure".into();
    blood_pressure.status = "empty".into();
    blood_pressure.records = 0;
    blood_pressure.latest_date = None;
    db.save_capability_probe(&[blood_pressure]).unwrap();

    let food_row = || {
        db.capability_overview(today)
            .unwrap()
            .items
            .into_iter()
            .find(|item| item.stream == "food")
            .unwrap()
    };
    assert_eq!(food_row().status, "available");
    assert_eq!(food_row().records, 12);
    assert_eq!(food_row().source, "probed");
    assert!(!food_row().ingested);

    let mut failed_food = food;
    failed_food.status = "error".into();
    failed_food.records = 0;
    failed_food.latest_date = None;
    db.save_capability_probe(&[failed_food]).unwrap();
    assert_eq!(food_row().records, 12);
}

#[test]
fn a_fetched_but_unparsed_stream_is_not_reported_as_empty() {
    // "empty_in_range" claims the stream is wired and the account has no
    // data. For a stream whose raw responses are on disk but whose field
    // mapping is not verified yet, that is false in a way that would send
    // a reader looking for a device problem that does not exist.
    let db = Database::in_memory().unwrap();
    db.insert_raw_record(&RawRecord {
        stream: "wellness".into(),
        source_key: "wellness:spo2:user_events:2023-11-01:2023-11-08".into(),
        source_scope: SourceScope::UserFused,
        device_id: None,
        start_utc: ts(),
        end_utc: Some(ts() + chrono::Duration::days(7)),
        payload: serde_json::json!({ "items": [] }),
        capability: CapabilityStatus::Unverified,
    })
    .unwrap();

    let export = parsed_export(&db, &["spo2", "sleep"], ExportDetail::Summary);
    let capabilities = &export["capabilities"];
    assert_eq!(capabilities["spo2"]["status"], "raw_pending");
    assert_eq!(capabilities["spo2"]["raw_records"], 1);
    // A stream with no raw responses at all still reports plain emptiness.
    assert_eq!(capabilities["sleep"]["status"], "empty_in_range");
}

#[test]
fn one_physical_device_gets_one_label() {
    // Zepp stores an identity row per alias. The strap's rows share a
    // serial but differ in device_id, and keying a group on both reported
    // one device as two.
    let db = Database::in_memory().unwrap();
    for (alias, device_id) in [
        ("2445B138005129", "2445B138005129"),
        ("D85403FFFEE4D576", "D85403FFFEE4D576"),
    ] {
        db.conn
            .execute(
                "INSERT INTO device_identities
                        (alias, name, firmware, serial, device_id, timezone, updated_at)
                     VALUES (?1, ?2, NULL, ?3, ?4, NULL, ?5)",
                params![
                    alias,
                    "凌苍的Helio Strap",
                    "2445B138005129",
                    device_id,
                    Utc::now().to_rfc3339()
                ],
            )
            .unwrap();
    }
    db.insert_metric_sample(&MetricSample {
        metric: "hrv".into(),
        timestamp: ts(),
        value: 45.0,
        unit: "ms".into(),
        source_scope: SourceScope::Device,
        device_id: Some("D85403FFFEE4D576".into()),
    })
    .unwrap();

    let export = parsed_export(&db, &["hrv"], ExportDetail::Summary);
    let devices = export["devices"].as_array().unwrap();
    assert_eq!(devices.len(), 1, "one strap must not appear twice");
    assert_eq!(devices[0]["label"], "device_1");
    assert_eq!(devices[0]["model"], "Amazfit Helio Strap");
    assert_eq!(devices[0]["kind"], "strap");
    // Neither the serial nor the user's nickname may leave the machine.
    let encoded = serde_json::to_string(&export).unwrap();
    assert!(!encoded.contains("2445B138005129"));
    assert!(!encoded.contains("凌苍"));
    assert_eq!(
        export["data"]["metric_samples"][0]["device_label"],
        "device_1"
    );
}

#[test]
fn capability_overview_never_calls_missing_data_unsupported() {
    // This API answers "200 with no items" for event names that cannot
    // exist, so an absence never proves a device lacks a sensor. Saying
    // "your watch does not support blood pressure" to someone who simply
    // has not measured would send them shopping for hardware they own.
    let db = Database::in_memory().unwrap();
    let today = Local::now().date_naive();
    let overview = db.capability_overview(today).unwrap();
    let by_stream: std::collections::BTreeMap<_, _> = overview
        .items
        .iter()
        .map(|item| (item.stream.as_str(), item))
        .collect();

    // Nothing synced yet: everything is absent, and nothing is condemned.
    assert!(overview
        .items
        .iter()
        .all(|item| item.status != "unsupported"));
    assert_eq!(by_stream["heart_rate"].status, "no_records");
    // A stream that needs a request and has never been checked says so.
    assert_eq!(by_stream["blood_pressure"].status, "unknown");
    assert_eq!(by_stream["blood_pressure"].source, "probed");

    db.insert_metric_sample(&MetricSample {
        metric: "heart_rate".into(),
        timestamp: Local
            .with_ymd_and_hms(today.year(), today.month(), today.day(), 12, 0, 0)
            .unwrap()
            .with_timezone(&Utc),
        value: 60.0,
        unit: "bpm".into(),
        source_scope: SourceScope::Device,
        device_id: None,
    })
    .unwrap();
    let overview = db.capability_overview(today).unwrap();
    let heart_rate = overview
        .items
        .iter()
        .find(|item| item.stream == "heart_rate")
        .unwrap();
    assert_eq!(heart_rate.status, "available");
    assert_eq!(heart_rate.records, 1);
    // Derived from stored rows, so it cost no request.
    assert_eq!(heart_rate.source, "derived");
}

#[test]
fn capability_window_is_inclusive_local_calendar_days() {
    let db = Database::in_memory().unwrap();
    let today = NaiveDate::from_ymd_opt(2026, 8, 20).unwrap();
    // heart_rate 的窗口是 30 天：today - 29 .. today，两头都算。
    let on_start_boundary = today - Duration::days(29);
    let just_before = today - Duration::days(30);
    for (day, value) in [(on_start_boundary, 60.0), (just_before, 61.0)] {
        db.insert_metric_sample(&MetricSample {
            metric: "heart_rate".into(),
            timestamp: Local
                .with_ymd_and_hms(day.year(), day.month(), day.day(), 12, 0, 0)
                .unwrap()
                .with_timezone(&Utc),
            value,
            unit: "bpm".into(),
            source_scope: SourceScope::Device,
            device_id: None,
        })
        .unwrap();
    }

    let overview = db.capability_overview(today).unwrap();
    let heart_rate = overview
        .items
        .iter()
        .find(|item| item.stream == "heart_rate")
        .unwrap();
    assert_eq!(
        heart_rate.records, 1,
        "窗口边界那一天要算进来，再往前一天不算"
    );
    assert_eq!(heart_rate.latest_date.as_deref(), Some("2026-07-22"));
}

#[test]
fn only_an_outright_rejection_licenses_unsupported() {
    let db = Database::in_memory().unwrap();
    let probe = |status: &str| CapabilityProbe {
        stream: "blood_pressure".into(),
        surface: "v2_events".into(),
        cadence: "episodic".into(),
        window_days: 365,
        event_type: "blood_pressure".into(),
        sub_type: "real_data".into(),
        status: status.into(),
        records: 0,
        latest_date: None,
        fields: Vec::new(),
    };

    db.save_capability_probe(&[probe("empty")]).unwrap();
    let overview = db.capability_overview(Local::now().date_naive()).unwrap();
    let item = overview
        .items
        .iter()
        .find(|item| item.stream == "blood_pressure")
        .unwrap();
    assert_eq!(item.status, "no_records", "an empty answer proves nothing");

    db.save_capability_probe(&[probe("unavailable")]).unwrap();
    let overview = db.capability_overview(Local::now().date_naive()).unwrap();
    let item = overview
        .items
        .iter()
        .find(|item| item.stream == "blood_pressure")
        .unwrap();
    assert_eq!(item.status, "unsupported", "a rejection is evidence");
}

#[test]
fn device_lookup_does_not_fall_back_to_first_device() {
    let db = Database::in_memory().unwrap();
    db.upsert_device_identity(&DeviceIdentityHint {
        aliases: vec!["SN-ONE".into(), "MAC-ONE".into()],
        name: Some("Watch One".into()),
        firmware: Some("1.0.0".into()),
        serial: Some("SN-ONE".into()),
        device_id: Some("MAC-ONE".into()),
        timezone: None,
    })
    .unwrap();
    db.upsert_device_identity(&DeviceIdentityHint {
        aliases: vec!["SN-TWO".into(), "MAC-TWO".into()],
        name: Some("Watch Two".into()),
        firmware: Some("2.0.0".into()),
        serial: Some("SN-TWO".into()),
        device_id: Some("MAC-TWO".into()),
        timezone: None,
    })
    .unwrap();
    let one = db.lookup_device_profile("SN-ONE").unwrap().unwrap();
    let two = db.lookup_device_profile("MAC-TWO").unwrap().unwrap();
    assert_eq!(one.name.as_deref(), Some("Watch One"));
    assert_eq!(two.name.as_deref(), Some("Watch Two"));
    assert!(db.lookup_device_profile("UNKNOWN").unwrap().is_none());
}

#[test]
fn device_data_summary_excludes_fused_records_and_keeps_identity_aliases() {
    let db = Database::in_memory().unwrap();
    let timestamp = ts();
    db.insert_metric_sample(&MetricSample {
        metric: "heart_rate".into(),
        timestamp,
        value: 72.0,
        unit: "bpm".into(),
        source_scope: SourceScope::Device,
        device_id: Some("SN-HELIO".into()),
    })
    .unwrap();
    db.insert_metric_sample(&MetricSample {
        metric: "heart_rate".into(),
        timestamp: timestamp + chrono::Duration::minutes(2),
        value: 80.0,
        unit: "bpm".into(),
        source_scope: SourceScope::UserFused,
        device_id: Some("SN-HELIO".into()),
    })
    .unwrap();
    let (has_data, latest) = db.device_data_summary(&["sn-helio".to_string()]).unwrap();
    assert!(has_data);
    assert_eq!(latest.as_deref(), Some("2023-11-14T22:13:20+00:00"));
    let (has_unknown, _) = db
        .device_data_summary(&["missing-device".to_string()])
        .unwrap();
    assert!(!has_unknown);
}
