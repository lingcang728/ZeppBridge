use super::health::*;
use super::*;
use crate::models::{CapabilityStatus, MetricSample, RawRecord, SourceScope, Workout};
use chrono::TimeZone;

fn db() -> Database {
    Database::in_memory().unwrap()
}

fn day(offset: i64) -> chrono::DateTime<Utc> {
    Utc.with_ymd_and_hms(2026, 8, 1, 12, 0, 0).unwrap() + Duration::days(offset)
}

fn sample(metric: &str, offset: i64, scope: SourceScope) -> MetricSample {
    MetricSample {
        metric: metric.into(),
        timestamp: day(offset),
        value: 60.0 + offset as f64,
        unit: "bpm".into(),
        source_scope: scope,
        device_id: Some("device-a".into()),
    }
}

#[test]
fn the_three_stages_are_recorded_independently() {
    let db = db();
    // 报文拿回来了、但看不懂：这必须表达成「fetch 正常 / parse 失败」，
    // 而不是被折叠成一个笼统的红点。
    db.record_stream_stage("sleep", Stage::Fetch, &StageOutcome::Ok)
        .unwrap();
    db.record_stream_stage(
        "sleep",
        Stage::Parse,
        &StageOutcome::Failed {
            kind: StageErrorKind::UnrecognizedPayload,
            message: Some("band_data 编码未识别".into()),
        },
    )
    .unwrap();

    let (states, _) = db.stage_states().unwrap();
    let stages = states.get("sleep").unwrap();
    assert_eq!(stages[0].state, "ok");
    assert_eq!(stages[1].state, "failed");
    assert_eq!(
        stages[1].error_kind.as_deref(),
        Some("unrecognized_payload")
    );
    assert_eq!(stages[2].state, "never", "从没写过不是失败");
}

#[test]
fn a_later_success_clears_an_earlier_failure_but_keeps_the_last_good_time() {
    let db = db();
    db.record_stream_stage(
        "hrv",
        Stage::Fetch,
        &StageOutcome::Failed {
            kind: StageErrorKind::Network,
            message: Some("超时".into()),
        },
    )
    .unwrap();
    std::thread::sleep(std::time::Duration::from_millis(2));
    db.record_stream_stage("hrv", Stage::Fetch, &StageOutcome::Ok)
        .unwrap();

    let (states, _) = db.stage_states().unwrap();
    let fetch = &states.get("hrv").unwrap()[0];
    assert_eq!(fetch.state, "ok");
    assert!(fetch.error_kind.is_none());
    assert!(fetch.last_ok_at.is_some());
}

#[test]
fn cloud_sync_local_replay_and_manual_reprocess_are_separate_timelines() {
    let db = db();
    db.record_cloud_sync("2026-08-20T00:00:00+00:00", "updated", 1)
        .unwrap();
    db.record_local_replay(false).unwrap();

    let health = db.data_health(90, 0).unwrap();
    assert_eq!(
        health.timings.last_cloud_sync_at.as_deref(),
        Some("2026-08-20T00:00:00+00:00"),
        "本地重放不得改写云端同步时间"
    );
    assert!(health.timings.last_local_replay_at.is_some());
    assert!(
        health.timings.last_manual_reprocess_at.is_none(),
        "后台自动重放不是手动重新解析"
    );

    db.record_local_replay(true).unwrap();
    let health = db.data_health(90, 0).unwrap();
    assert!(health.timings.last_manual_reprocess_at.is_some());
    assert_eq!(
        health.timings.last_cloud_sync_at.as_deref(),
        Some("2026-08-20T00:00:00+00:00")
    );
}

#[test]
fn coverage_is_explained_by_cadence_not_by_one_completeness_percentage() {
    // 连续流：可以说「缺了哪几天」。
    let daily = explain_coverage(
        StreamCadence::Daily,
        30,
        Observed {
            days: vec!["2026-08-01".into(), "2026-08-04".into()],
        },
    );
    assert_eq!(daily.kind, "gaps");
    assert_eq!(daily.gap_total, 2);
    assert_eq!(daily.gap_dates, vec!["2026-08-02", "2026-08-03"]);

    // 偶发流：只能说「哪几天观察到了」。VO₂max 一年给几次是正常的，
    // 用统一的完整度去衡量必然画成一片红。
    let occasional = explain_coverage(
        StreamCadence::Occasional,
        365,
        Observed {
            days: vec!["2026-03-02".into(), "2026-08-01".into()],
        },
    );
    assert_eq!(occasional.kind, "observations");
    assert_eq!(occasional.gap_total, 0);
    assert!(occasional.gap_dates.is_empty());
    assert_eq!(occasional.latest_observed_at.as_deref(), Some("2026-08-01"));

    // 按事件的流同理：没有运动就是没有运动。
    assert_eq!(
        explain_coverage(StreamCadence::PerEvent, 30, Observed::default()).kind,
        "observations"
    );
}

#[test]
fn gaps_are_only_counted_after_the_first_observed_day() {
    // 一个刚装好的用户只有最近三天数据。把之前的空白算成缺口，会让人
    // 第一次打开就看到一片红。
    let coverage = explain_coverage(
        StreamCadence::Daily,
        365,
        Observed {
            days: vec![
                "2026-08-01".into(),
                "2026-08-02".into(),
                "2026-08-03".into(),
            ],
        },
    );
    assert_eq!(coverage.gap_total, 0);
    assert_eq!(coverage.observed_days, 3);
}

#[test]
fn unknown_source_scopes_are_never_folded_into_device_data() {
    let db = db();
    db.insert_metric_sample(&sample("heart_rate", 0, SourceScope::Device))
        .unwrap();
    db.insert_metric_sample(&sample("heart_rate", 1, SourceScope::UserFused))
        .unwrap();
    db.insert_metric_sample(&sample("heart_rate", 2, SourceScope::Unknown))
        .unwrap();

    let health = db.data_health(90, 0).unwrap();
    let heart_rate = health
        .streams
        .iter()
        .find(|stream| stream.stream == "heart_rate")
        .unwrap();
    let mut sources: Vec<&str> = heart_rate
        .sources
        .iter()
        .map(|entry| entry.source.as_str())
        .collect();
    sources.sort_unstable();
    assert_eq!(sources, vec!["device", "unknown", "user_fused"]);
    assert!(heart_rate.sources.iter().all(|entry| entry.records == 1));
}

#[test]
fn health_falls_back_to_fetched_at_so_an_upgraded_library_is_not_called_never_fetched() {
    let db = db();
    db.insert_raw_record(&crate::models::RawRecord {
        stream: "workouts".into(),
        source_key: "w-1".into(),
        source_scope: SourceScope::Device,
        device_id: Some("device-a".into()),
        start_utc: day(0),
        end_utc: Some(day(0)),
        payload: serde_json::json!({ "items": [] }),
        capability: crate::models::CapabilityStatus::Verified,
    })
    .unwrap();

    let health = db.data_health(90, 0).unwrap();
    let workouts = health
        .streams
        .iter()
        .find(|stream| stream.stream == "workouts")
        .unwrap();
    assert_eq!(
        workouts.fetch.state, "ok",
        "库里明摆着有报文，不能说从来没拉过"
    );
    assert_eq!(workouts.raw_records, 1);
}

#[test]
fn integrity_check_is_explicit_and_its_result_is_remembered() {
    let db = db();
    assert!(
        db.data_health(90, 0)
            .unwrap()
            .database
            .last_integrity_check
            .is_none(),
        "打开页面不该自动跑全库扫描"
    );
    let result = db.run_integrity_check().unwrap();
    assert!(result.ok);
    assert!(result.detail.is_none());
    let remembered = db
        .data_health(90, 0)
        .unwrap()
        .database
        .last_integrity_check
        .unwrap();
    assert_eq!(remembered.checked_at, result.checked_at);
}

#[test]
fn actions_only_appear_when_there_is_something_to_do() {
    let db = db();
    db.record_stream_stage(
        "heart_rate",
        Stage::Fetch,
        &StageOutcome::Failed {
            kind: StageErrorKind::Auth,
            message: Some("需要重新认证".into()),
        },
    )
    .unwrap();
    let health = db.data_health(90, 0).unwrap();
    // REPLAY_IN_PROGRESS describes the whole process, not this in-memory
    // database. Another parallel test can legitimately hold the replay
    // guard while this assertion runs, so pin that independent input to
    // the idle state this unit test is meant to exercise.
    let mut database = health.database.clone();
    database.replay_in_progress = false;
    let actions = suggested_actions(&database, &health.timings, &health.streams);
    let ids: Vec<&str> = actions.iter().map(|action| action.id.as_str()).collect();
    assert!(ids.contains(&"reauth"));
    assert!(
        !ids.contains(&"reprocess"),
        "没有待归一化的报文就不该建议重放"
    );
}
#[test]
fn normalization_health_tracks_attempts_not_canonical_ownership() {
    let db = db();
    let mut raw = RawRecord {
        stream: "daily_summary".into(),
        source_key: "first-page".into(),
        source_scope: SourceScope::UserFused,
        device_id: None,
        start_utc: day(0),
        end_utc: None,
        payload: serde_json::json!({"data": [{"date": "2026-09-14", "steps": 1234}]}),
        capability: CapabilityStatus::Verified,
    };
    db.persist_fetched_record(&raw).unwrap();
    raw.source_key = "overlapping-page".into();
    db.persist_fetched_record(&raw).unwrap();
    let health = db.data_health(14, 0).unwrap();
    assert_eq!(health.database.canonical_records, 1);
    assert_eq!(health.database.pending_normalization, 0);
    assert_eq!(health.database.normalization_by_stream[0].records, 2);

    raw.stream = "wellness".into();
    raw.source_key = "unsupported-wellness".into();
    raw.payload = serde_json::json!({"items": []});
    db.persist_fetched_record(&raw).unwrap();
    raw.stream = "heart_rate".into();
    raw.source_key = "empty-heart-rate".into();
    assert!(db.persist_fetched_record(&raw).is_err());
    let health = db.data_health(14, 0).unwrap();
    assert_eq!(health.database.pending_normalization, 0);
    assert!(health
        .database
        .normalization_by_stream
        .iter()
        .any(|r| r.stream == "wellness"
            && r.state == "processed_without_output"
            && r.records == 1));
    assert!(health
        .database
        .normalization_by_stream
        .iter()
        .any(|r| r.stream == "heart_rate" && r.state == "quarantined" && r.records == 1));

    // An interrupted sync leaves raw pending even at the current revision.
    db.set_app_meta("normalizer_revision", NORMALIZER_REVISION)
        .unwrap();
    raw.stream = "daily_summary".into();
    raw.source_key = "first-page".into();
    raw.payload = serde_json::json!({"data": [{"date": "2026-09-14", "steps": 5678}]});
    db.insert_raw_record(&raw).unwrap();
    assert_eq!(
        db.data_health(14, 0)
            .unwrap()
            .database
            .pending_normalization,
        1
    );
    assert!(db.pending_replay_plan().unwrap().is_some());
    db.reprocess_raw_records_if_needed().unwrap().unwrap();
    assert_eq!(
        db.data_health(14, 0)
            .unwrap()
            .database
            .pending_normalization,
        0
    );
    assert!(db.pending_replay_plan().unwrap().is_none());
}

#[test]
fn a_replayed_workout_detail_is_not_pending_normalization() {
    // 运动详情的产物落在 workout_samples / route_points / workout_pauses，
    // 这三张表按 workout_id 关联，没有 raw_record_id。早先的统计只查那四张
    // 带 raw_record_id 的表，于是每一条解析得好好的详情报文都被永久算成
    // 「待归一化」——用户重放多少次，那个数字都降不下来。
    let db = db();
    db.insert_workout(&Workout {
        workout_id: "1700000000".into(),
        workout_type: "run".into(),
        normalized_type: "run".into(),
        type_source: "numeric_mapped".into(),
        user_override: None,
        effective_type: "run".into(),
        custom_label: None,
        start_time: day(0),
        end_time: day(0) + Duration::minutes(10),
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
    let source_key = "workout_detail:1700000000:run.gps";
    let raw_id = db
        .insert_raw_record(&RawRecord {
            stream: "workout_detail".into(),
            source_key: source_key.into(),
            source_scope: SourceScope::Device,
            device_id: None,
            start_utc: day(0),
            end_utc: None,
            payload: payload.clone(),
            capability: CapabilityStatus::Verified,
        })
        .unwrap();
    db.normalize_and_persist_raw(raw_id, "workout_detail", source_key, &payload)
        .unwrap();

    assert_eq!(
        db.data_health(90, 0)
            .unwrap()
            .database
            .pending_normalization,
        0,
        "详情已经产出逐点样本，就不该还算「待归一化」"
    );

    // 反向钉住：真的什么都没产出的报文仍然要被数出来，
    // 否则这个修法就成了「把问题藏起来」。
    db.insert_raw_record(&RawRecord {
        stream: "workout_detail".into(),
        source_key: "workout_detail:1799999999:run.gps".into(),
        source_scope: SourceScope::Device,
        device_id: None,
        start_utc: day(1),
        end_utc: None,
        payload: serde_json::json!({ "items": [] }),
        capability: CapabilityStatus::Verified,
    })
    .unwrap();
    assert_eq!(
        db.data_health(90, 0)
            .unwrap()
            .database
            .pending_normalization,
        1,
        "没产出任何记录的报文还是要算进来"
    );
}
/// 同步会跑的每一条流，数据健康页都得认识。
///
/// `STREAM_CATALOG` 是那一页的全部内容：不在这张表里的流，页面上根本没有
/// 它的行——没有「上次取到什么时候」，没有缺口判断，它开始失败了也不会有
/// 任何一处变红。而同步那边加一条流是不需要动这张表就能跑通的，所以两份
/// 名单会无声地分叉。体重那一版就是这么漏的：抓取、入库、导出、契约全对，
/// 唯独这一页当它不存在。
///
/// 这里不去 grep 源码，而是把同步真正会 emit 的那几个名字写死一份对照：
/// 加流的人必须同时改两处，改漏了这条会红。
#[test]
fn every_synced_stream_appears_on_the_health_page() {
    // 和 `SyncManager::run` 里那串 `emit(...)` 的第一个参数一一对应。
    const SYNCED_STREAMS: [&str; 8] = [
        "heart_rate",
        "daily_summary",
        "workouts",
        "workout_detail",
        "sleep",
        "hrv",
        "wellness",
        "weight",
    ];
    let known: std::collections::BTreeSet<&str> = STREAM_CATALOG
        .iter()
        .map(|(stream, _, _)| *stream)
        .collect();
    let missing: Vec<&str> = SYNCED_STREAMS
        .iter()
        .copied()
        .filter(|stream| !known.contains(stream))
        .collect();
    assert!(
        missing.is_empty(),
        "这些流会同步，数据健康页却不认识它们：{missing:?}"
    );
}
