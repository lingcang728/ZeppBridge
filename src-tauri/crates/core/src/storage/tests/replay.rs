use super::*;

/// 一条运动加上它的明细报文，明细里带手表记的圈。
///
/// 这个夹具模拟明细规则尚未落库的旧库：明细里的 `lap` 已经被清掉，后面的
/// 重放测试要把它补回来。
fn insert_workout_with_lap_detail(db: &Database) {
    db.insert_raw_record(&RawRecord {
        stream: "workouts".into(),
        source_key: "sport_history:run:lap-fixture".into(),
        source_scope: SourceScope::Device,
        device_id: None,
        start_utc: ts(),
        end_utc: None,
        payload: serde_json::json!({
            "data": [{
                "trackid": 1_700_000_000i64,
                "end_time": 1_700_000_600i64,
                "type": 1,
                "dis": "1000"
            }]
        }),
        capability: CapabilityStatus::Verified,
    })
    .unwrap();
    db.insert_raw_record(&RawRecord {
            stream: "workout_detail".into(),
            source_key: "workout_detail:1700000000:run.huami.com".into(),
            source_scope: SourceScope::Device,
            device_id: None,
            start_utc: ts(),
            end_utc: None,
            payload: serde_json::json!({
                "data": {
                    "trackid": 1_700_000_000i64,
                    "time": "0;300;300;",
                    "heart_rate": "0,150;300,2;300,-2;",
                    // 两圈各 500 m / 300 s，累计 300 与 600 —— 正好对上汇总的
                    // 1000 m 和 600 s，两条对账都过得去。
                    "lap": "0,300,500,s00000000000,150,300,-20000;1,300,500,s00000000000,152,600,-20000;"
                }
            }),
            capability: CapabilityStatus::Verified,
        })
        .unwrap();
    // `insert_raw_record` 只存报文，派生行是重放时才建的。先整体归一化
    // 一遍，把运动汇总和逐秒采样做出来——真实的旧库正是这个样子。
    db.reprocess_raw_records().unwrap();
    // 然后把圈清掉，模拟历史库还没有明细派生行的状态。
    db.conn.execute("DELETE FROM workout_laps", []).unwrap();
}

/// 重放两次，派生行不能变成两份。
///
/// `replace_workout_series` 清空四张表再重新插入，唯独漏了新加的
/// `workout_laps`。这几张表都没有唯一索引——不出问题靠的就是那几条
/// DELETE，所以漏一张就是纯追加。本机实测一次全库重放把 341 圈变成了
/// 682，341 组 `(workout_id, lap_index)` 一个不落全是两份。
///
/// 骗过所有人的地方在于**第一次重放是对的**：旧版本升上来的人拿到的圈
/// 是准的，要等下一次推修订号才翻倍。所以这里数的是「重放第二次之后」，
/// 而不是「重放之后」。四张表一起数，下次再加派生表时这个用例会一起把
/// 它盖住。
#[test]
fn replaying_twice_does_not_duplicate_derived_rows() {
    let db = Database::in_memory().unwrap();
    insert_workout_with_lap_detail(&db);
    let counts = || -> Vec<(String, i64)> {
        [
            "workout_laps",
            "workout_splits",
            "workout_samples",
            "workout_pauses",
        ]
        .into_iter()
        .map(|table| {
            let n = db
                .conn
                .query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |row| {
                    row.get::<_, i64>(0)
                })
                .unwrap();
            (table.to_string(), n)
        })
        .collect()
    };

    db.reprocess_raw_records().unwrap();
    let after_first = counts();
    assert!(
        after_first
            .iter()
            .any(|(table, n)| table == "workout_laps" && *n == 2),
        "夹具本身要能解出两圈，否则这个用例什么都没验：{after_first:?}"
    );

    db.reprocess_raw_records().unwrap();
    assert_eq!(
        counts(),
        after_first,
        "重放第二次之后派生行变多了——某张表漏了 replace 前的 DELETE"
    );
}

#[test]
fn previous_release_upgrade_replays_laps_and_rucking_and_preserves_facts() {
    let db = Database::in_memory().unwrap();
    db.insert_raw_record(&RawRecord {
        stream: "workouts".into(),
        source_key: "workouts-225".into(),
        source_scope: SourceScope::Device,
        device_id: None,
        start_utc: ts(),
        end_utc: None,
        payload: serde_json::json!({
            "data": [{
                "workout_id": "same-workout",
                "start_time": 1_700_000_000i64,
                "end_time": 1_700_000_600i64,
                "type": 225,
                "calorie": 120
            }]
        }),
        capability: CapabilityStatus::Verified,
    })
    .unwrap();
    db.insert_raw_record(&RawRecord {
        stream: "workout_detail".into(),
        source_key: "workout_detail:same-workout:run.gps".into(),
        source_scope: SourceScope::Device,
        device_id: None,
        start_utc: ts(),
        end_utc: None,
        payload: serde_json::json!({
            "trackid": 1_700_000_000i64,
            "time": "0;1;",
            "longitude_latitude": "4004663552,11629333504;16403,8392;",
            "heart_rate": "1,80;1,2;",
            "lap": "0,300,500,s00000000000,150,300,-20000;1,300,500,s00000000000,152,600,-20000;"
        }),
        capability: CapabilityStatus::Verified,
    })
    .unwrap();
    db.insert_raw_record(&RawRecord {
        stream: "daily_summary".into(),
        source_key: "daily-summary-unrelated".into(),
        source_scope: SourceScope::UserFused,
        device_id: None,
        start_utc: ts(),
        end_utc: None,
        payload: serde_json::json!({
            "data": [{ "date": "2023-11-14", "steps": 1234 }]
        }),
        capability: CapabilityStatus::Verified,
    })
    .unwrap();
    db.insert_workout(&workout_with_type(Some(225), "unknown:225", "unknown_code"))
        .unwrap();
    db.set_workout_type_override("same-workout", Some("strength"))
        .unwrap();
    let raw_before: (
        String,
        Option<Vec<u8>>,
        String,
        String,
        String,
        Option<String>,
    ) = db
        .conn
        .query_row(
            "SELECT payload, payload_zip, source_key, source_scope, start_utc, device_id
                 FROM raw_records WHERE source_key = 'workouts-225'",
            [],
            |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                    row.get(5)?,
                ))
            },
        )
        .unwrap();
    let precondition = db.get_workout_detail("same-workout").unwrap().unwrap();
    assert_eq!(precondition.normalized_type, "unknown:225");
    assert_eq!(precondition.type_source, "unknown_code");
    assert_eq!(precondition.user_override.as_deref(), Some("strength"));
    assert_eq!(precondition.effective_type, "strength");
    db.conn
        .execute(
            "INSERT INTO app_meta(key, value, updated_at)
                 VALUES('normalizer_revision', ?1, ?2)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![PREVIOUS_RELEASE_NORMALIZER_REVISION, ts().to_rfc3339()],
        )
        .unwrap();

    let plan = db.pending_replay_plan().unwrap().unwrap();
    assert!(plan.streams.is_empty());
    assert_eq!(plan.raw_records, 3, "all streams need attempt provenance");

    let counts = db.reprocess_raw_records_if_needed().unwrap().unwrap();

    assert!(counts.contains_key("workouts"), "counts = {counts:?}");
    assert!(counts.contains_key("workout_detail"), "counts = {counts:?}");
    assert!(counts.contains_key("daily_summary"), "{counts:?}");
    assert_eq!(
        db.conn
            .query_row("SELECT COUNT(*) FROM workout_laps", [], |row| row
                .get::<_, i64>(0),)
            .unwrap(),
        2,
        "v21 到 v23 升级必须恢复 workout_detail 的圈"
    );
    let stored = db.get_workout_detail("same-workout").unwrap().unwrap();
    assert_eq!(stored.normalized_type, "rucking");
    assert_eq!(stored.type_source, "numeric_mapped");
    assert_eq!(stored.user_override.as_deref(), Some("strength"));
    assert_eq!(stored.effective_type, "strength");
    let raw_after: (
        String,
        Option<Vec<u8>>,
        String,
        String,
        String,
        Option<String>,
    ) = db
        .conn
        .query_row(
            "SELECT payload, payload_zip, source_key, source_scope, start_utc, device_id
                 FROM raw_records WHERE source_key = 'workouts-225'",
            [],
            |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                    row.get(5)?,
                ))
            },
        )
        .unwrap();
    assert_eq!(raw_after, raw_before, "原始报文和来源事实不能被重放改写");
    assert_eq!(
        db.stored_normalizer_revision().unwrap().as_deref(),
        Some(NORMALIZER_REVISION)
    );
    assert!(db.reprocess_raw_records_if_needed().unwrap().is_none());
}

#[test]
fn an_unshipped_v22_revision_still_replays_all_streams() {
    let db = Database::in_memory().unwrap();
    insert_workout_with_lap_detail(&db);
    db.conn
        .execute(
            "INSERT INTO app_meta(key, value, updated_at)
                 VALUES('normalizer_revision', ?1, ?2)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params!["zepp-normalizer-2026-09-v22-watch-laps", ts().to_rfc3339()],
        )
        .unwrap();

    let plan = db.pending_replay_plan().unwrap().unwrap();
    assert!(plan.streams.is_empty(), "未发布的 v22 必须走整库重放");
    assert_eq!(plan.raw_records, 2);

    let counts = db.reprocess_raw_records_if_needed().unwrap().unwrap();
    assert!(counts.contains_key("workouts"), "counts = {counts:?}");
    assert!(counts.contains_key("workout_detail"), "counts = {counts:?}");
    assert_eq!(
        db.conn
            .query_row("SELECT COUNT(*) FROM workout_laps", [], |row| row
                .get::<_, i64>(0),)
            .unwrap(),
        2,
        "未发布的 v22 仍要走全量重放并补回明细里的圈"
    );
}

/// 无头用户的库靠什么知道自己欠一次重放。
///
/// 桌面应用启动时会自动重放，命令行没有那次启动。所以「欠不欠」必须能
/// 在**只读**的前提下问出来：`status` 要能说，MCP 要能报，而它们一个
/// 字节都不该写库。
#[test]
fn a_stale_library_can_be_recognized_without_writing_to_it() {
    let db = Database::in_memory().unwrap();
    // 这份夹具必须落在**这一版要重放的流**上，否则 raw_records 会是 0，
    // 而 0 条报文的库本来就不欠重放——那样这个测试就在验一件不相干的事。
    // 改归一化规则、换了重放的流时，这里要跟着换。
    insert_workout_with_lap_detail(&db);
    db.conn
        .execute(
            "INSERT INTO app_meta(key, value, updated_at)
                 VALUES('normalizer_revision', ?1, ?2)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![PREVIOUS_RELEASE_NORMALIZER_REVISION, ts().to_rfc3339()],
        )
        .unwrap();

    let plan = db.pending_replay_plan().unwrap().unwrap();
    assert_eq!(
        plan.stored_revision.as_deref(),
        Some(PREVIOUS_RELEASE_NORMALIZER_REVISION)
    );
    assert_eq!(plan.target_revision, NORMALIZER_REVISION);
    assert!(plan.streams.is_empty());
    // 全库重放计划必须包含夹具里的两条原始报文。
    assert_eq!(plan.raw_records, 2);

    db.reprocess_raw_records_if_needed().unwrap().unwrap();
    assert!(
        db.pending_replay_plan().unwrap().is_none(),
        "重放做完之后就不该再说自己欠着"
    );
}

/// 空库不欠重放。
///
/// 全新安装的库没记过修订号，那不是「历史停在旧解析器上」，只是还没有
/// 历史。对它喊「你的数据需要重放」是一句没有内容的警告，而 `status`
/// 每一分钟都可能被调度脚本调一次。
#[test]
fn a_brand_new_library_is_not_told_it_owes_a_replay() {
    let db = Database::in_memory().unwrap();
    let plan = db.pending_replay_plan().unwrap().unwrap();
    assert_eq!(plan.raw_records, 0);
    assert!(
        !db.data_health(30, 0)
            .unwrap()
            .database
            .normalizer_replay_pending
    );

    // 但它仍然要被盖上当前修订号，否则第一次同步之后会平白重放一次。
    db.reprocess_raw_records_if_needed().unwrap().unwrap();
    assert_eq!(
        db.stored_normalizer_revision().unwrap().as_deref(),
        Some(NORMALIZER_REVISION)
    );
}

/// 健康报告要说库的修订号，不是程序自己的常量。
#[test]
fn health_reports_the_revision_the_library_actually_has() {
    let db = Database::in_memory().unwrap();
    // 同上：要落在这一版会重放的那条流上，不然「欠不欠重放」根本不成立。
    insert_workout_with_lap_detail(&db);
    db.conn
        .execute(
            "INSERT INTO app_meta(key, value, updated_at)
                 VALUES('normalizer_revision', ?1, ?2)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![PREVIOUS_RELEASE_NORMALIZER_REVISION, ts().to_rfc3339()],
        )
        .unwrap();

    let health = db.data_health(30, 0).unwrap();
    assert_eq!(health.database.normalizer_revision, NORMALIZER_REVISION);
    assert_eq!(
        health.database.stored_normalizer_revision.as_deref(),
        Some(PREVIOUS_RELEASE_NORMALIZER_REVISION)
    );
    assert!(health.database.normalizer_replay_pending);
    assert!(
        health.actions.iter().any(|action| action.id == "reprocess"),
        "库停在旧解析器上时，健康报告必须给得出那个动作"
    );
}

/// 分批提交不能把跨批的记录漏掉。
///
/// 重放现在一批 64 条报文包一个事务。批的边界是新加的东西，而边界正是
/// 这类改动最容易出错的地方：少提交一次、或者最后不满一批的那几条没被
/// 处理，用户看到的是「重放跑完了，可还是有一部分记录没变」。
#[test]
fn batched_replay_covers_every_record_across_batch_boundaries() {
    let db = Database::in_memory().unwrap();
    let total = REPLAY_BATCH_RECORDS * 2 + 5;
    for index in 0..total {
        let track = 1_700_000_000i64 + index as i64 * 7200;
        db.insert_raw_record(&RawRecord {
            stream: "workouts".into(),
            source_key: format!("sport_history:0:{index}"),
            source_scope: SourceScope::Device,
            device_id: None,
            start_utc: ts(),
            end_utc: None,
            payload: serde_json::json!({
                "data": [{ "trackid": track, "end_time": track + 3600, "type": 211 }]
            }),
            capability: CapabilityStatus::Verified,
        })
        .unwrap();
    }
    db.conn
        .execute(
            "INSERT INTO app_meta(key, value, updated_at)
                 VALUES('normalizer_revision', ?1, ?2)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params!["zepp-normalizer-before-selective-replay", ts().to_rfc3339()],
        )
        .unwrap();

    db.reprocess_raw_records_if_needed().unwrap().unwrap();

    assert_eq!(
        db.normalized_stream_count("workouts").unwrap(),
        Some(total as i64)
    );
    let workouts = db.get_recent_workouts(total + 10).unwrap();
    assert_eq!(workouts.len(), total);
    assert!(
        workouts
            .iter()
            .all(|workout| workout.workout_type == "road_cycling"),
        "最后不满一批的那几条也必须走过新规则"
    );
}

/// 只重放 workouts 的那条升级路径，不能顺手把运动明细删掉。
///
/// `workout_samples`、`route_points`、`workout_pauses`、`workout_splits`
/// 四张表都以 `ON DELETE CASCADE` 挂在 `workouts` 上。重放 workouts 时若
/// 先按 raw_record_id 删掉汇总行，级联会把这条运动的逐秒序列、GPS 轨迹和
/// 分段一起带走——而这条升级路径并不重放 workout_detail，于是它们再也回
/// 不来。用户看到的是「升级完，我以前那些运动的轨迹全没了」，而升级本身
/// 报告成功。
#[test]
fn replaying_workout_summaries_does_not_erase_the_detail_series() {
    let db = Database::in_memory().unwrap();
    db.persist_fetched_record(&RawRecord {
        stream: "workouts".into(),
        source_key: "sport_history:0:1".into(),
        source_scope: SourceScope::Device,
        device_id: None,
        start_utc: ts(),
        end_utc: None,
        payload: serde_json::json!({
            "data": [{ "trackid": 1_700_000_000i64, "end_time": 1_700_003_600i64, "type": 211 }]
        }),
        capability: CapabilityStatus::Verified,
    })
    .unwrap();
    db.persist_fetched_record(&RawRecord {
        stream: "workout_detail".into(),
        source_key: "workout_detail:1700000000:run.gps".into(),
        source_scope: SourceScope::Device,
        device_id: None,
        start_utc: ts(),
        end_utc: None,
        payload: serde_json::json!({
            "trackid": 1_700_000_000i64,
            "source": "run.gps",
            "time": "0;1;",
            "longitude_latitude": "4004663552,11629333504;16403,8392;",
            "heart_rate": "1,80;1,2;"
        }),
        capability: CapabilityStatus::Verified,
    })
    .unwrap();
    let samples_before = db.normalized_stream_count("workout_detail").unwrap();
    let route_before: i64 = db
        .conn
        .query_row("SELECT COUNT(*) FROM route_points", [], |row| row.get(0))
        .unwrap();
    assert!(samples_before.unwrap_or(0) > 0 && route_before > 0);

    db.reprocess_raw_records_for_stream(Some(&["workouts"]))
        .unwrap();

    assert_eq!(
        db.normalized_stream_count("workout_detail").unwrap(),
        samples_before,
        "重放运动汇总不该带走逐秒序列"
    );
    let route_after: i64 = db
        .conn
        .query_row("SELECT COUNT(*) FROM route_points", [], |row| row.get(0))
        .unwrap();
    assert_eq!(route_after, route_before, "重放运动汇总不该带走 GPS 轨迹");
    // 汇总本身仍然要按新规则重算过。
    assert_eq!(
        db.get_recent_workouts(10).unwrap()[0].workout_type,
        "road_cycling"
    );
}

/// 坏 raw 不能吞掉、也不能把整轮重放打成 Err，更不能因此盖章。
#[test]
fn replay_quarantines_bad_raw_without_stamping_or_aborting() {
    let db = Database::in_memory().unwrap();
    db.insert_raw_record(&RawRecord {
        stream: "workouts".into(),
        source_key: "sport_history:0:good".into(),
        source_scope: SourceScope::Device,
        device_id: None,
        start_utc: ts(),
        end_utc: None,
        payload: serde_json::json!({
            "data": [{ "trackid": 1_700_000_000i64, "end_time": 1_700_003_600i64, "type": 211 }]
        }),
        capability: CapabilityStatus::Verified,
    })
    .unwrap();
    let empty_id = db
        .insert_raw_record(&RawRecord {
            stream: "workouts".into(),
            source_key: "sport_history:0:empty".into(),
            source_scope: SourceScope::Device,
            device_id: None,
            start_utc: ts(),
            end_utc: None,
            payload: serde_json::json!({}),
            capability: CapabilityStatus::Verified,
        })
        .unwrap();
    db.conn
            .execute(
                "INSERT INTO raw_records
                    (stream, source_key, source_scope, device_id, start_utc, end_utc,
                     payload, payload_hash, fetched_at)
                 VALUES ('workouts', 'sport_history:0:not-json', 'device', NULL, ?1, NULL, '{', 'hash', ?1)",
                params![ts().to_rfc3339()],
            )
            .unwrap();
    let not_json_id = db.conn.last_insert_rowid();
    db.conn
        .execute(
            "INSERT INTO app_meta(key, value, updated_at)
                 VALUES('normalizer_revision', ?1, ?2)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params!["zepp-normalizer-ancient", ts().to_rfc3339()],
        )
        .unwrap();

    let counts = db
        .reprocess_raw_records_if_needed()
        .expect("坏报文不能让整轮重放返回 Err")
        .expect("旧修订号应当触发重放");
    assert!(
        counts.get("workouts").copied().unwrap_or(0) >= 1,
        "好报文必须产出派生行: {counts:?}"
    );
    let workouts = db.get_recent_workouts(10).unwrap();
    assert_eq!(workouts.len(), 1);
    assert_eq!(workouts[0].workout_type, "road_cycling");

    let quarantined: i64 = db
        .conn
        .query_row(
            "SELECT COUNT(*) FROM raw_quarantine
                 WHERE raw_record_id IN (?1, ?2) AND revision = ?3",
            params![empty_id, not_json_id, NORMALIZER_REVISION],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(quarantined, 2);
    let failures: i64 = db
        .conn
        .query_row(
            "SELECT value FROM app_meta WHERE key = 'replay_last_failures'",
            [],
            |row| row.get::<_, String>(0),
        )
        .unwrap()
        .parse()
        .unwrap();
    assert!(failures >= 1, "failures = {failures}");
    assert_ne!(
        db.stored_normalizer_revision().unwrap().as_deref(),
        Some(NORMALIZER_REVISION),
        "有新失败就不能推进修订号"
    );
    let raw_kept: i64 = db
        .conn
        .query_row(
            "SELECT COUNT(*) FROM raw_records WHERE id IN (?1, ?2)",
            params![empty_id, not_json_id],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(raw_kept, 2);
}

/// 归一化失败必须把错误交回去，但不能把已经拿到的 raw 回滚掉。
#[test]
fn persist_keeps_raw_when_normalization_fails() {
    let db = Database::in_memory().unwrap();
    let error = db
        .persist_fetched_record(&RawRecord {
            stream: "workouts".into(),
            source_key: "sport_history:0:unparseable".into(),
            source_scope: SourceScope::Device,
            device_id: None,
            start_utc: ts(),
            end_utc: None,
            payload: serde_json::json!({}),
            capability: CapabilityStatus::Verified,
        })
        .unwrap_err();
    assert!(
        matches!(
            error,
            ZeppBridgeError::ParseError(_) | ZeppBridgeError::DataUnavailable(_)
        ),
        "{error}"
    );
    let kept: i64 = db
        .conn
        .query_row(
            "SELECT COUNT(*) FROM raw_records WHERE source_key = 'sport_history:0:unparseable'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(kept, 1);
    let quarantined: i64 = db
        .conn
        .query_row(
            "SELECT COUNT(*) FROM raw_quarantine WHERE source_key = 'sport_history:0:unparseable'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(quarantined, 1);
}

/// 升级之后，旧的 `unknown:211` 会被重新认成公路骑行。
///
/// 报这个问题的人是为历史记录来的：199 条记录已经存成 `unknown:211` 了。
/// 只把编号加进目录，新记录会对，旧记录一条都不会变——所以这条用例钉的
/// 不是目录，而是「目录改了会自动重放」这件事。
///
/// 库里存的是一个更早的修订号，走的是全量重放那条路。**不能用上一版的
/// 修订号**：那条路只重放当版真正改过的流，而那是随版本变的，钉在这里
/// 会让这条用例每次换版都假失败一次。
#[test]
fn upgrading_replays_history_so_unknown_211_becomes_road_cycling() {
    let db = Database::in_memory().unwrap();
    db.insert_raw_record(&RawRecord {
        stream: "workouts".into(),
        source_key: "workouts-211".into(),
        source_scope: SourceScope::Device,
        device_id: None,
        start_utc: ts(),
        end_utc: None,
        payload: serde_json::json!({
            "data": [{
                "trackid": 1_700_000_000i64,
                "end_time": 1_700_003_600i64,
                "type": 211
            }]
        }),
        capability: CapabilityStatus::Verified,
    })
    .unwrap();
    db.conn
        .execute(
            "INSERT INTO app_meta(key, value, updated_at)
                 VALUES('normalizer_revision', ?1, ?2)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params!["zepp-normalizer-ancient", ts().to_rfc3339()],
        )
        .unwrap();

    db.reprocess_raw_records_if_needed().unwrap().unwrap();

    let workouts = db.get_recent_workouts(10).unwrap();
    assert_eq!(workouts.len(), 1);
    assert_eq!(workouts[0].workout_type, "road_cycling");
}

#[test]
fn workout_type_merge_is_order_independent_and_numeric_evidence_wins() {
    let numeric = workout_with_type(Some(105), "unknown:105", "unknown_code");
    let string = workout_with_type(None, "strength", "string_field");
    let first = Database::in_memory().unwrap();
    first.insert_workout(&string).unwrap();
    first.insert_workout(&numeric).unwrap();
    let second = Database::in_memory().unwrap();
    second.insert_workout(&numeric).unwrap();
    second.insert_workout(&string).unwrap();
    let a = first.get_workout_detail("same-workout").unwrap().unwrap();
    let b = second.get_workout_detail("same-workout").unwrap().unwrap();
    assert_eq!(a.normalized_type, "unknown:105");
    assert_eq!(a.normalized_type, b.normalized_type);
    assert_eq!(a.type_source, b.type_source);
    assert_eq!(a.zepp_type, b.zepp_type);
}

#[test]
fn workout_override_survives_replay_and_does_not_replace_raw_facts() {
    let db = Database::in_memory().unwrap();
    let workout = workout_with_type(Some(105), "unknown:105", "unknown_code");
    db.insert_workout(&workout).unwrap();
    db.set_workout_type_override("same-workout", Some("strength"))
        .unwrap();
    let mut replay = workout.clone();
    replay.synced_at = Some(ts() + chrono::Duration::days(1));
    db.insert_workout(&replay).unwrap();
    let stored = db.get_workout_detail("same-workout").unwrap().unwrap();
    assert_eq!(stored.zepp_type, Some(105));
    assert_eq!(stored.normalized_type, "unknown:105");
    assert_eq!(stored.user_override.as_deref(), Some("strength"));
    assert_eq!(stored.effective_type, "strength");
    assert_eq!(stored.synced_at, workout.synced_at);
    let export = parsed_export(&db, &["workouts"], ExportDetail::Summary);
    let exported = &export["data"]["workouts"][0];
    assert_eq!(exported["zepp_type"], 105);
    assert_eq!(exported["normalized_type"], "unknown:105");
    assert_eq!(exported["type_source"], "unknown_code");
    assert_eq!(exported["user_override"], "strength");
    assert_eq!(exported["effective_type"], "strength");
    assert_eq!(exported["workout_type"], "strength");
    db.set_workout_type_override("same-workout", None).unwrap();
    assert_eq!(
        db.get_workout_detail("same-workout")
            .unwrap()
            .unwrap()
            .effective_type,
        "unknown:105"
    );
}

#[test]
fn compressed_raw_payloads_survive_a_round_trip_and_still_replay() {
    // 原始报文是重放的唯一依据。压缩只能改变它占多少字节，不能改变它是什么——
    // 少一个字节，这条记录就永久毁了。
    let db = Database::in_memory().unwrap();
    let payload = serde_json::json!({
        "items": (0..200).map(|index| serde_json::json!({
            "time": format!("2026-08-{:02}T00:00:00Z", (index % 28) + 1),
            "bpm": 60 + (index % 40),
        })).collect::<Vec<_>>()
    });
    db.insert_raw_record(&RawRecord {
        stream: "wellness".into(),
        source_key: "wellness:spo2:user_events:2026-08-01:2026-08-08".into(),
        source_scope: SourceScope::UserFused,
        device_id: None,
        start_utc: ts(),
        end_utc: Some(ts() + chrono::Duration::days(7)),
        payload: payload.clone(),
        capability: CapabilityStatus::Unverified,
    })
    .unwrap();

    // 存的是压缩形态，而且明显更小。
    let (stored_text, zipped): (String, Option<Vec<u8>>) = db
        .conn
        .query_row(
            "SELECT payload, payload_zip FROM raw_records ORDER BY id DESC LIMIT 1",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .unwrap();
    assert_eq!(stored_text, "", "压缩之后不该再留一份明文");
    let zipped = zipped.expect("新写入的报文应当是压缩的");
    let expected = serde_json::to_string(&payload).unwrap();
    assert!(
        zipped.len() < expected.len(),
        "压完反而更大就没有意义：{} vs {}",
        zipped.len(),
        expected.len()
    );

    // 还原必须一字不差。
    assert_eq!(
        decode_raw_payload(String::new(), Some(zipped)).unwrap(),
        expected
    );

    // 老库里的明文行仍然照常读。
    assert_eq!(
        decode_raw_payload("{\"legacy\":true}".into(), None).unwrap(),
        "{\"legacy\":true}"
    );
    assert_eq!(
        decode_raw_payload("{\"legacy\":true}".into(), Some(Vec::new())).unwrap(),
        "{\"legacy\":true}"
    );
}

#[test]
fn decompress_payload_rejects_output_over_32_mib() {
    let oversized = "a".repeat(MAX_DECOMPRESSED_PAYLOAD_BYTES as usize + 1);
    let zipped = compress_payload(&oversized).unwrap();
    drop(oversized);
    let error = decompress_payload(&zipped).expect_err("超过上限必须是 Err");
    assert!(matches!(error, ZeppBridgeError::ParseError(_)), "{error}");
}

#[test]
fn decompress_payload_rejects_corrupt_bytes_without_panic() {
    let error = decompress_payload(&[0xff, 0x00, 0x01, 0x02]).expect_err("损坏字节必须是 Err");
    assert!(matches!(error, ZeppBridgeError::ParseError(_)), "{error}");
}

#[test]
fn compacting_history_leaves_the_payload_readable() {
    // 存量报文是这一版之前攒下来的明文。压缩它们不能改变任何一条的内容。
    let db = Database::in_memory().unwrap();
    let text = serde_json::to_string(&serde_json::json!({
        "summary": "x".repeat(4000),
    }))
    .unwrap();
    db.conn
        .execute(
            "INSERT INTO raw_records
                    (stream, source_key, source_scope, device_id, start_utc, end_utc,
                     payload, payload_hash, fetched_at)
                 VALUES ('wellness', 'legacy:1', 'device', NULL, ?1, NULL, ?2, 'hash', ?1)",
            params![ts().to_rfc3339(), text],
        )
        .unwrap();

    let report = db.compact_raw_payloads().unwrap();
    assert_eq!(report.compacted, 1);
    assert_eq!(report.skipped, 0);
    assert!(report.bytes_after < report.bytes_before);

    let (stored, zipped): (String, Option<Vec<u8>>) = db
        .conn
        .query_row(
            "SELECT payload, payload_zip FROM raw_records WHERE source_key = 'legacy:1'",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .unwrap();
    assert_eq!(decode_raw_payload(stored, zipped).unwrap(), text);

    // 再压一次没有可压的了，也不该把已压的行算进去。
    let again = db.compact_raw_payloads().unwrap();
    assert_eq!(again.compacted, 0);
    // 压完之后就不该再被算成「待压」，否则每次启动都会白弹一次进度提示。
    assert_eq!(db.pending_raw_payload_count().unwrap(), 0);
}

#[test]
fn tiny_payloads_are_never_counted_as_pending() {
    // 空响应 `{"items":[]}` 只有 12 字节，压完比原文还大，压缩函数会跳过它。
    // 如果计数函数还把它算成「待压」，就会变成：每次启动都判定有活要干、
    // 弹出「正在压缩」、然后立刻 0 条结束。实测在真实库上就是这样。
    let db = Database::in_memory().unwrap();
    for index in 0..3 {
        db.conn
                .execute(
                    "INSERT INTO raw_records
                        (stream, source_key, source_scope, device_id, start_utc, end_utc,
                         payload, payload_hash, fetched_at)
                     VALUES ('wellness', ?2, 'device', NULL, ?1, NULL, '{\"items\":[]}', 'hash', ?1)",
                    params![ts().to_rfc3339(), format!("empty:{index}")],
                )
                .unwrap();
    }
    assert_eq!(db.pending_raw_payload_count().unwrap(), 0);
    let report = db.compact_raw_payloads().unwrap();
    assert_eq!(report.compacted, 0);
    assert_eq!(report.skipped, 0, "小到不值得压的报文根本不该被取出来");
}

#[test]
fn nested_replay_guards_keep_the_flag_until_the_outer_drops() {
    // 别的测试也可能在并行重放，所以不能断言进/出时全局计数恰好是 0。
    // 这条只钉：内层 Drop 不许把外层还举着的旗清掉。
    let outer = ReplayGuard::enter();
    assert!(replay_in_progress());
    {
        let inner = ReplayGuard::enter();
        assert!(replay_in_progress());
        drop(inner);
        assert!(
            replay_in_progress(),
            "inner drop must not hide the outer wait-for-lock"
        );
    }
    drop(outer);
}
