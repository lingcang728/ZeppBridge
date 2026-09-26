use super::*;

#[test]
fn migration_repairs_missing_and_narrow_daily_keys_without_merging_devices() {
    for narrow in [false, true] {
        let db = Database::in_memory().unwrap();
        db.conn
            .execute_batch("DROP INDEX uq_daily_metric_key; PRAGMA user_version = 25;")
            .unwrap();
        if narrow {
            db.conn.execute_batch("CREATE UNIQUE INDEX uq_daily_metric_key ON daily_metrics(date, metric, unit, source_scope);").unwrap();
        }
        let insert = |device: Option<&str>, value: i64| {
            db.conn.execute(
                "INSERT INTO daily_metrics(date,metric,unit,source_scope,device_id,value) VALUES('2026-09-13','steps','count','device',?1,?2)",
                params![device, value],
            )
        };
        insert(Some("device-a"), 10).unwrap();
        if !narrow {
            insert(Some("device-b"), 20).unwrap();
        }
        db.migrate().unwrap();
        if narrow {
            insert(Some("device-b"), 20).unwrap();
        }
        insert(None, 30).unwrap();
        assert!(insert(Some(""), 99).is_err());
        assert!(insert(Some("device-a"), 99).is_err());
        db.migrate().unwrap();
        assert_eq!(
            db.conn
                .query_row("SELECT COUNT(*) FROM daily_metrics", [], |row| row
                    .get::<_, i64>(0))
                .unwrap(),
            3
        );
        assert_eq!(
            db.conn
                .query_row("SELECT SUM(value) FROM daily_metrics", [], |row| row
                    .get::<_, f64>(0))
                .unwrap(),
            60.0
        );
    }
}

#[test]
fn v26_removes_redundant_indexes_and_indexes_metric_date_queries() {
    let db = Database::in_memory().unwrap();
    db.conn
        .execute_batch(
            "PRAGMA user_version = 25;
            CREATE INDEX idx_metric_samples_metric_timestamp ON metric_samples(metric,timestamp);
            CREATE INDEX idx_daily_metrics_date_metric ON daily_metrics(date,metric);
            CREATE INDEX idx_workout_hr_zones_workout ON workout_hr_zones(workout_id);
            DROP INDEX idx_daily_metrics_metric_date;",
        )
        .unwrap();
    for pass in 0..2 {
        let before: i64 = db
            .conn
            .query_row("PRAGMA schema_version", [], |row| row.get(0))
            .unwrap();
        db.migrate().unwrap();
        if pass == 1 {
            let after: i64 = db
                .conn
                .query_row("PRAGMA schema_version", [], |row| row.get(0))
                .unwrap();
            assert_eq!(
                before, after,
                "startup must not rebuild and drop obsolete indexes"
            );
        }
        let redundant: i64 = db.conn.query_row("SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name IN ('idx_metric_samples_metric_timestamp','idx_daily_metrics_date_metric','idx_workout_hr_zones_workout')", [], |row| row.get(0)).unwrap();
        assert_eq!(redundant, 0);
        for (sql, index) in [
                ("SELECT * FROM daily_metrics WHERE metric='steps' AND date BETWEEN '2026-01-01' AND '2026-09-13' ORDER BY date", "idx_daily_metrics_metric_date"),
                ("SELECT * FROM daily_metrics WHERE date='2026-09-13'", "uq_daily_metric_key"),
                ("SELECT * FROM metric_samples WHERE metric='heart_rate' AND timestamp BETWEEN '2026-01-01' AND '2026-09-13' ORDER BY timestamp", "uq_metric_sample_key"),
                ("SELECT * FROM workout_hr_zones WHERE workout_id='workout' ORDER BY zone_index", "sqlite_autoindex_workout_hr_zones_1"),
            ] {
                let mut stmt = db.conn.prepare(&format!("EXPLAIN QUERY PLAN {sql}")).unwrap();
                let plan = stmt.query_map([], |row| row.get::<_, String>(3)).unwrap().collect::<std::result::Result<Vec<_>,_>>().unwrap().join("\n");
                assert!(plan.contains(index), "{sql}: {plan}");
                assert!(!plan.contains("SCAN") && !plan.contains("TEMP B-TREE"), "{plan}");
            }
    }
}

#[test]
fn regression_markdown_v25_indexes_detail_reads_and_deletes() {
    let db = Database::in_memory().unwrap();
    db.conn.execute_batch("DROP INDEX idx_sleep_stages_sleep; DROP INDEX idx_workout_pauses_workout; DELETE FROM schema_migrations WHERE version = 25; PRAGMA user_version = 24;").unwrap();
    for _ in 0..2 {
        db.migrate().unwrap();
        assert_eq!(
            db.conn
                .query_row("PRAGMA user_version", [], |row| row.get::<_, i64>(0))
                .unwrap(),
            CURRENT_SCHEMA_VERSION
        );
        for (table, key, index) in [
            ("sleep_stages", "sleep_id", "idx_sleep_stages_sleep"),
            ("workout_pauses", "workout_id", "idx_workout_pauses_workout"),
        ] {
            for sql in [
                format!("SELECT * FROM {table} WHERE {key} = 'test' ORDER BY start_time, id"),
                format!("DELETE FROM {table} WHERE {key} = 'test'"),
            ] {
                let mut stmt = db
                    .conn
                    .prepare(&format!("EXPLAIN QUERY PLAN {sql}"))
                    .unwrap();
                let plan = stmt
                    .query_map([], |row| row.get::<_, String>(3))
                    .unwrap()
                    .collect::<std::result::Result<Vec<_>, _>>()
                    .unwrap()
                    .join("\n");
                assert!(plan.contains(index), "{plan}");
                assert!(
                    !plan.contains("SCAN") && !plan.contains("TEMP B-TREE"),
                    "{plan}"
                );
            }
        }
    }
}

#[test]
fn unsuccessful_first_sync_remains_retryable_after_startup_migration() {
    for outcome in ["failed", "cancelled", "no_new_data", "partial"] {
        let db = Database::in_memory().unwrap();
        db.conn.execute_batch("INSERT INTO raw_records(stream, source_key, source_scope, start_utc, payload, payload_hash, fetched_at) VALUES('workouts', 'first', 'unknown', '2026-09-12T00:00:00Z', '{}', 'test', '2026-09-12T00:00:00Z');").unwrap();
        db.record_cloud_sync("2026-09-12T00:00:00Z", outcome, 0)
            .unwrap();
        db.migrate().unwrap();
        assert_eq!(
            db.cloud_sync_metadata().unwrap(),
            (None, Some(outcome.into()))
        );
        db.record_cloud_sync("2026-09-12T01:00:00Z", "updated", 1)
            .unwrap();
        db.record_cloud_sync("2026-09-12T02:00:00Z", "cancelled", 0)
            .unwrap();
        assert_eq!(
            db.cloud_sync_metadata().unwrap().0.as_deref(),
            Some("2026-09-12T01:00:00Z")
        );
        db.record_cloud_sync("2026-09-12T03:00:00Z", "no_new_data", 0)
            .unwrap();
        assert_eq!(
            db.cloud_sync_metadata().unwrap().0.as_deref(),
            Some("2026-09-12T03:00:00Z")
        );
    }
}

#[test]
fn future_schema_is_refused_without_changing_the_database() {
    let dir = std::env::temp_dir().join(format!(
        "zeppbridge-future-schema-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join("zepp.db");
    let conn = Connection::open(&path).unwrap();
    conn.execute_batch(&format!("CREATE TABLE future_data(value TEXT); INSERT INTO future_data VALUES('keep'); PRAGMA user_version = {};", CURRENT_SCHEMA_VERSION + 1)).unwrap();
    drop(conn);
    let before = std::fs::read(&path).unwrap();
    assert!(Database::open_migrated(&path).is_err());
    assert!(Database::open_resilient(path.clone()).is_err());
    assert_eq!(std::fs::read(&path).unwrap(), before);
    // Also protect direct migration callers inside the transaction.
    let db = Database {
        conn: Connection::open(&path).unwrap(),
    };
    assert!(db.migrate().is_err());
    assert!(db.conn.is_autocommit());
    drop(db);
    assert_eq!(std::fs::read(&path).unwrap(), before);
    std::fs::remove_dir_all(dir).unwrap();
}

/// 跑完迁移，版本号必须停在 `CURRENT_SCHEMA_VERSION`。
///
/// `migrate_steps` 是一条平铺的历史，中间会把 `user_version` 先写成 5（第
/// 319 行那句不在任何守卫里）再一路盖回 19。只要整个 `migrate()` 还包在
/// 一个事务里，这个中间态就对外不存在。这个测试看着的就是那个事务：
/// 哪天有人把 `BEGIN IMMEDIATE` 拆了、或者往后面加了一步却忘了推版本号，
/// 这里会红——而不是等用户的 CLI 报「本机数据库还是 v5」。
#[test]
fn migrating_twice_leaves_the_version_at_the_current_schema() {
    let dir = std::env::temp_dir().join("zeppbridge-migration-version-invariant");
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join("zepp.db");

    let read_version = |db: &Database| -> i64 {
        db.conn
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .unwrap()
    };

    {
        let db = Database::open_migrated(&path).expect("新库应当能建起来");
        assert_eq!(read_version(&db), CURRENT_SCHEMA_VERSION);
    }
    // 再跑一遍。旧路径下这一遍会把 v19 的库从 5 重新盖到 19；
    // 落定的结果不允许因此变。
    {
        let db = Database::open_migrated(&path).expect("重复升级应当无害");
        assert_eq!(read_version(&db), CURRENT_SCHEMA_VERSION);
    }
    let _ = std::fs::remove_dir_all(&dir);
}

/// 已经落库的幽灵设备要被迁移删掉，真设备一行不能少。
///
/// 光在写入侧加闸不够：报告者库里那三行已经存在了，而界面上没有任何入口
/// 能删它们（点击无反应）。不清库的话，装了新版依然天天看见。
#[test]
fn migration_removes_firmware_shaped_devices_and_keeps_real_ones() {
    let dir = std::env::temp_dir().join("zeppbridge-phantom-device-cleanup");
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join("zepp.db");

    // 先建一个已升级的库，再往里塞进旧版本会写出来的那些行。
    {
        let db = Database::open_migrated(&path).unwrap();
        for (alias, name) in [
            ("0.91.20.5", None),
            ("0.91.17.5", None),
            ("V0.54.131.3", None),
            ("D8803CFFFEC19AC6", Some("T-Rex 3")),
            ("23229501001311", Some("T-Rex 3")),
            ("PRUC72 070007001c", None),
        ] {
            db.conn
                .execute(
                    "INSERT OR REPLACE INTO device_identities
                            (alias, name, updated_at) VALUES (?1, ?2, ?3)",
                    rusqlite::params![alias, name, "2026-09-02T00:00:00Z"],
                )
                .unwrap();
        }
        // 把版本退回去，让下一次打开重新跑一遍清理那一步。
        db.conn.execute_batch("PRAGMA user_version = 17;").unwrap();
    }

    let db = Database::open_migrated(&path).expect("升级应当成功");
    let mut stmt = db
        .conn
        .prepare("SELECT alias FROM device_identities ORDER BY alias")
        .unwrap();
    let aliases: Vec<String> = stmt
        .query_map([], |row| row.get::<_, String>(0))
        .unwrap()
        .filter_map(std::result::Result::ok)
        .collect();

    assert_eq!(
        aliases,
        vec![
            "23229501001311".to_string(),
            "D8803CFFFEC19AC6".to_string(),
            "PRUC72 070007001c".to_string(),
        ],
        "固件版本号那三行要没了，真设备一行不能少"
    );
}

/// 真实旧库的升级演练。默认跳过——它需要一个真实的旧数据库。
///
/// 合成的小库证明不了升级安全：真正会出问题的是几百 MB、跨过好几个
/// schema 版本、里面有各种历史遗留行的库。把这个演练留在仓库里，是为了
/// 每次加迁移步骤时都能对着真库跑一遍，而不是只在发版当天临时想办法。
///
/// ```powershell
/// $env:ZEPPBRIDGE_UPGRADE_FIXTURE = "D:/somewhere/a-copy-of/zepp.db"
/// cargo test --manifest-path src-tauri/Cargo.toml -p zeppbridge-core --jobs 1 `
///   -- --ignored upgrade_a_real_old_database
/// ```
///
/// **传一份副本。** 这个测试会真的迁移你指给它的文件。
#[test]
#[ignore = "需要真实旧库，用 ZEPPBRIDGE_UPGRADE_FIXTURE 指定一份副本"]
fn upgrade_a_real_old_database_without_losing_rows() {
    let Ok(source) = std::env::var("ZEPPBRIDGE_UPGRADE_FIXTURE") else {
        panic!("没有设置 ZEPPBRIDGE_UPGRADE_FIXTURE");
    };
    let source = PathBuf::from(source);
    let dir = std::env::temp_dir().join("zeppbridge-upgrade-drill");
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join("zepp.db");
    std::fs::copy(&source, &path).expect("复制旧库");

    // 升级前先记下几张关键表的行数。升级只应当增加结构，不应当减少事实。
    // daily_metrics 是例外：v4 规范键去重、v30 清 readiness 哨兵行，都是
    // 有意删除，所以对它比对「不同事实键」而不是裸行数。
    let before = {
        let conn = Connection::open(&path).unwrap();
        let version: i64 = conn
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .unwrap();
        let counts: Vec<(String, i64)> = ["raw_records", "workouts", "metric_samples"]
            .iter()
            .filter_map(|table| {
                conn.query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |row| {
                    row.get::<_, i64>(0)
                })
                .ok()
                .map(|count| ((*table).to_string(), count))
            })
            .collect();
        let daily_keys: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM (
                        SELECT DISTINCT date, metric, unit, source_scope,
                            COALESCE(device_id, '')
                        FROM daily_metrics
                        WHERE NOT (value = 255 AND metric IN (
                            'readiness', 'physical_readiness', 'mental_readiness',
                            'hrv_readiness', 'rhr_readiness', 'skin_temp_readiness',
                            'afib_readiness', 'ahi_readiness'))
                    )",
                [],
                |row| row.get(0),
            )
            .unwrap_or(0);
        (version, counts, daily_keys)
    };
    assert!(
        before.0 < CURRENT_SCHEMA_VERSION,
        "这份 fixture 已经是 v{}，演练不了升级",
        before.0
    );

    let db = Database::open_migrated(&path).expect("升级应当成功");
    assert_eq!(
        db.diagnostic_schema_version().unwrap(),
        CURRENT_SCHEMA_VERSION
    );

    for (table, count) in &before.1 {
        let after: i64 = db
            .conn
            .query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |row| {
                row.get(0)
            })
            .unwrap();
        assert!(
            after >= *count,
            "{table} 从 {count} 掉到了 {after}——升级不该让事实变少"
        );
    }
    let daily_keys_after: i64 = db
        .conn
        .query_row(
            "SELECT COUNT(*) FROM (
                    SELECT DISTINCT date, metric, unit, source_scope,
                        COALESCE(device_id, '')
                    FROM daily_metrics
                    WHERE NOT (value = 255 AND metric IN (
                        'readiness', 'physical_readiness', 'mental_readiness',
                        'hrv_readiness', 'rhr_readiness', 'skin_temp_readiness',
                        'afib_readiness', 'ahi_readiness'))
                )",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);
    assert!(
        daily_keys_after >= before.2,
        "daily_metrics 的不同事实键从 {} 掉到了 {}——升级不该丢事实",
        before.2,
        daily_keys_after
    );

    // 升级前必须留下一份可用的备份，否则「升级失败可以退回去」是空话。
    let backups = backup::list_backups(&dir).expect("读备份清单");
    let pre = backups
        .iter()
        .find(|item| item.kind == backup::BackupKind::PreMigration)
        .expect("升级前应当自动生成一份备份");
    assert!(pre.integrity_ok, "自动备份必须通过完整性检查");
    assert_eq!(
        pre.schema_version, before.0,
        "自动备份应当是升级之前那个版本的样子"
    );

    let verified = backup::verify_backup(&dir, &pre.id).unwrap();
    assert!(verified.problem.is_none(), "{:?}", verified.problem);
}

#[test]
fn a_read_only_connection_refuses_writes_and_ignores_the_write_lock() {
    // MCP 和 CLI 的查询路径靠这两条性质成立：写不进去是连接层保证的，
    // 不是靠调用方自觉；而且一次长同步持有写锁时，只读查询不该被挡住。
    let dir = std::env::temp_dir().join("zeppbridge-readonly-contract");
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join("zepp.db");
    drop(Database::open_migrated(&path).unwrap());

    let _writer =
        write_lock::try_acquire(&dir, write_lock::WritePurpose::Sync).expect("先让一个写者占住锁");

    let reader = Database::open_read_only(path).expect("只读连接不该被写锁挡住");
    assert!(reader.get_recent_workouts(1).is_ok(), "同步进行中也要能查");
    let write_attempt = reader
        .conn
        .execute("DELETE FROM raw_records", [])
        .map_err(|error| error.to_string());
    assert!(write_attempt.is_err(), "只读连接必须在 SQLite 层就拒绝写入");
}

#[test]
fn the_pre_migration_backup_can_still_read_a_database_that_is_out_of_date() {
    // 「只读连接必须版本一致」是给用户查询用的策略，不是打开文件的机制。
    // 把它写进机制里，升级前的自动备份就打不开旧库，于是备份失败，
    // 于是迁移拒绝开始——所有老用户都升不了级。
    let dir = std::env::temp_dir().join("zeppbridge-premigration-open");
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join("zepp.db");
    drop(Database::open_migrated(&path).unwrap());

    let conn = Connection::open(&path).unwrap();
    conn.execute_batch(&format!(
        "PRAGMA user_version = {};",
        CURRENT_SCHEMA_VERSION - 1
    ))
    .unwrap();
    drop(conn);

    assert!(
        Database::open_read_only(path.clone()).is_err(),
        "面向用户查询的入口仍然要拦住版本不一致的库"
    );
    assert!(
        Database::open_read_only_any_version(path.clone()).is_ok(),
        "备份与恢复必须能读旧版本的库，那正是它们存在的理由"
    );
    // 迁移这条路要能一路走通，包括中间那次自动备份。
    drop(Database::open_migrated(&path).expect("旧库应当能被升级"));
    let backups = backup::list_backups(&dir).unwrap();
    assert!(
        backups
            .iter()
            .any(|item| item.kind == backup::BackupKind::PreMigration),
        "升级前应当留下一份备份"
    );
}

#[test]
fn a_read_only_open_says_which_side_is_out_of_date_instead_of_failing_later() {
    // 旧库 + 新程序会一路撞到「没有这张表」，用户看到的是一句
    // 「数据库暂时不可用」——不知道原因，也不知道该做什么。
    let dir = std::env::temp_dir().join("zeppbridge-readonly-schema");
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join("zepp.db");
    drop(Database::open_migrated(&path).unwrap());

    // 库比程序旧时给的两条路都要在场。只说「启动一次桌面应用」，
    // 对一个跑在容器里的库等于没说——那里根本没有桌面应用。
    for (version, expected) in [
        (
            CURRENT_SCHEMA_VERSION - 1,
            vec!["zeppbridge-cli reprocess", "桌面应用"],
        ),
        (CURRENT_SCHEMA_VERSION + 1, vec!["请把命令行"]),
    ] {
        let conn = Connection::open(&path).unwrap();
        conn.execute_batch(&format!("PRAGMA user_version = {version};"))
            .unwrap();
        drop(conn);
        let message = match Database::open_read_only(path.clone()) {
            Ok(_) => panic!("版本对不上必须在打开时就报出来"),
            Err(error) => error.user_message(),
        };
        for needle in expected {
            assert!(message.contains(needle), "{message}");
        }
    }
}

#[test]
fn current_schema_marker_survives_repeated_idempotent_migrations() {
    let db = Database::in_memory().unwrap();
    assert_eq!(
        db.diagnostic_schema_version().unwrap(),
        CURRENT_SCHEMA_VERSION
    );
    db.migrate().unwrap();
    assert_eq!(
        db.diagnostic_schema_version().unwrap(),
        CURRENT_SCHEMA_VERSION
    );
}

#[test]
fn issue_24_migration_repairs_history_without_raw_and_preserves_overrides() {
    let db = Database::in_memory().unwrap();
    for (id, code, kind, source) in [
        ("trail", Some(7), "open_water_swimming", "numeric_mapped"),
        ("override", Some(7), "open_water_swimming", "numeric_mapped"),
        (
            "explicit-swim",
            Some(7),
            "open_water_swimming",
            "string_field",
        ),
        ("pool", Some(14), "pool_swimming", "numeric_mapped"),
        ("no-code", None, "open_water_swimming", "string_field"),
    ] {
        let mut workout = workout_with_type(code, kind, source);
        workout.workout_id = id.into();
        db.insert_workout(&workout).unwrap();
    }
    db.set_workout_type_override("override", Some("open_water_swimming"))
        .unwrap();
    assert_eq!(db.raw_record_count().unwrap(), 0);
    db.conn
        .execute_batch(
            "PRAGMA user_version = 21; DELETE FROM schema_migrations WHERE version = 22;",
        )
        .unwrap();
    db.migrate().unwrap();
    let trail = db.get_workout_detail("trail").unwrap().unwrap();
    assert_eq!(trail.normalized_type, "trail_running");
    assert_eq!(trail.effective_type, "trail_running");
    assert_eq!(trail.zepp_type, Some(7));
    assert_eq!(trail.calories, Some(100));
    assert_eq!(trail.start_time, ts());
    assert_eq!(trail.synced_at, Some(ts() + chrono::Duration::hours(1)));
    let corrected = db.get_workout_detail("override").unwrap().unwrap();
    assert_eq!(corrected.normalized_type, "trail_running");
    assert_eq!(corrected.effective_type, "open_water_swimming");
    for id in ["explicit-swim", "no-code"] {
        assert_eq!(
            db.get_workout_detail(id).unwrap().unwrap().normalized_type,
            "open_water_swimming"
        );
    }
    assert_eq!(
        db.get_workout_detail("pool")
            .unwrap()
            .unwrap()
            .normalized_type,
        "pool_swimming"
    );
    let before = parsed_export(&db, &["workouts"], ExportDetail::Full)["data"]["workouts"].clone();
    db.migrate().unwrap();
    assert_eq!(
        parsed_export(&db, &["workouts"], ExportDetail::Full)["data"]["workouts"],
        before
    );
    let exported = before
        .as_array()
        .unwrap()
        .iter()
        .find(|w| w["workout_id"] == "trail")
        .unwrap();
    assert_eq!(exported["workout_type"], "trail_running");
    assert_eq!(exported["normalized_type"], "trail_running");
    assert_eq!(exported["effective_type"], "trail_running");
}

#[test]
fn issue_24_upgrade_from_v23_repairs_code_7_without_losing_corrections() {
    let db = Database::in_memory().unwrap();
    db.insert_workout(&workout_with_type(
        Some(7),
        "open_water_swimming",
        "numeric_mapped",
    ))
    .unwrap();
    db.set_workout_type_override("same-workout", Some("hiking"))
        .unwrap();
    let payload = serde_json::json!({"data": [{
        "workout_id": "same-workout", "start_time": 1_700_000_000i64,
        "end_time": 1_700_000_600i64, "type": 7
    }]});
    db.insert_raw_record(&RawRecord {
        stream: "workouts".into(),
        source_key: "issue-24".into(),
        source_scope: SourceScope::Device,
        device_id: None,
        start_utc: ts(),
        end_utc: None,
        payload,
        capability: CapabilityStatus::Verified,
    })
    .unwrap();
    db.conn
        .execute(
            "INSERT INTO app_meta(key, value, updated_at) VALUES('normalizer_revision', ?1, ?2)",
            params!["zepp-normalizer-2026-09-v23-rucking", ts().to_rfc3339()],
        )
        .unwrap();
    assert!(db
        .pending_replay_plan()
        .unwrap()
        .unwrap()
        .streams
        .is_empty());
    db.reprocess_raw_records_if_needed().unwrap().unwrap();
    let stored = db.get_workout_detail("same-workout").unwrap().unwrap();
    assert_eq!(stored.normalized_type, "trail_running");
    assert_eq!(stored.zepp_type, Some(7));
    assert_eq!(stored.user_override.as_deref(), Some("hiking"));
    assert_eq!(stored.effective_type, "hiking");
    db.set_workout_type_override("same-workout", None).unwrap();
    assert_eq!(
        db.get_workout_detail("same-workout")
            .unwrap()
            .unwrap()
            .effective_type,
        "trail_running"
    );
    assert!(db.reprocess_raw_records_if_needed().unwrap().is_none());
}

#[test]
fn schema_v10_workout_rows_migrate_without_losing_type_facts() {
    let db = Database::in_memory().unwrap();
    db.conn
        .execute_batch(
            "ALTER TABLE workouts DROP COLUMN workout_type_conflict;
                 ALTER TABLE workouts DROP COLUMN workout_type_override;
                 ALTER TABLE workouts DROP COLUMN workout_type_source;
                 DELETE FROM schema_migrations WHERE version = 11;
                 PRAGMA user_version = 10;",
        )
        .unwrap();
    db.conn
        .execute(
            "INSERT INTO workouts
                    (workout_id, workout_type, start_time, end_time, source_scope,
                     synced_at, gps_available, sample_count, zepp_type)
                 VALUES ('legacy', 'run', ?1, ?2, 'device', ?3, 0, 0, 105)",
            params![
                ts().to_rfc3339(),
                (ts() + chrono::Duration::minutes(30)).to_rfc3339(),
                (ts() + chrono::Duration::hours(1)).to_rfc3339(),
            ],
        )
        .unwrap();
    db.migrate().unwrap();
    assert_eq!(
        db.diagnostic_schema_version().unwrap(),
        CURRENT_SCHEMA_VERSION
    );
    let source: String = db
        .conn
        .query_row(
            "SELECT workout_type_source FROM workouts WHERE workout_id = 'legacy'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(source, "numeric_mapped");
    assert_eq!(
        db.get_workout_detail("legacy").unwrap().unwrap().zepp_type,
        Some(105)
    );
}

#[test]
fn readiness_migration_removes_sentinels_without_raw_and_replay_keeps_them_absent() {
    let db = Database::in_memory().unwrap();
    let raw = RawRecord {
        stream: "daily_summary".into(),
        source_key: "readiness".into(),
        source_scope: SourceScope::Unknown,
        device_id: None,
        start_utc: ts(),
        end_utc: None,
        payload: serde_json::json!({"data": [{"date": "2026-09-14",
                "phyScore": 255, "mentScore": 255, "afibScore": 255, "rdnsScore": 80}]}),
        capability: CapabilityStatus::Verified,
    };
    db.insert_raw_record(&raw).unwrap();
    for (metric, value) in [
        ("physical_readiness", 255.0),
        ("mental_readiness", 255.0),
        ("afib_readiness", 255.0),
        ("readiness", 80.0),
        ("steps", 255.0),
    ] {
        db.insert_daily_metric(&DailyMetric {
            date: "2026-09-14".into(),
            metric: metric.into(),
            value,
            unit: "score".into(),
            source_scope: SourceScope::Unknown,
            device_id: None,
        })
        .unwrap();
    }
    db.conn.execute_batch("PRAGMA user_version = 29").unwrap();
    db.migrate().unwrap();
    let count = |sql: &str| {
        db.conn
            .query_row(sql, [], |row| row.get::<_, i64>(0))
            .unwrap()
    };
    assert_eq!(
        count("SELECT COUNT(*) FROM daily_metrics WHERE value = 255"),
        1
    );
    db.set_app_meta(
        "normalizer_revision",
        "zepp-normalizer-2026-09-v27-sleep-available",
    )
    .unwrap();
    db.reprocess_raw_records_if_needed().unwrap().unwrap();
    assert_eq!(
        count("SELECT COUNT(*) FROM daily_metrics WHERE metric LIKE '%readiness' AND value = 255"),
        0
    );
    assert_eq!(
        count("SELECT COUNT(*) FROM daily_metrics WHERE metric = 'readiness' AND value = 80"),
        1
    );
}

#[test]
fn v26_library_gains_stage_available_columns_at_v27() {
    let dir = std::env::temp_dir().join(format!(
        "zeppbridge-v26-sleep-available-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join("zepp.db");

    {
        let db = Database::open_migrated(&path).unwrap();
        db.conn
            .execute_batch(
                "INSERT INTO sleep_sessions (
                        sleep_id, start_time, end_time, duration_minutes,
                        deep_minutes, light_minutes, rem_minutes, rem_available, awake_minutes,
                        source_scope
                     ) VALUES (
                        'legacy', '2026-01-01T00:00:00+00:00', '2026-01-01T08:00:00+00:00', 480,
                        0, 0, 0, 1, 0, 'device'
                     );
                     ALTER TABLE sleep_sessions DROP COLUMN deep_available;
                     ALTER TABLE sleep_sessions DROP COLUMN light_available;
                     ALTER TABLE sleep_sessions DROP COLUMN awake_available;
                     PRAGMA user_version = 26;",
            )
            .unwrap();
    }

    let db = Database::open_migrated(&path).expect("v26 should migrate to current schema");
    let version: i64 = db
        .conn
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .unwrap();
    assert_eq!(version, CURRENT_SCHEMA_VERSION);
    assert_eq!(sleep_stage_flags(&db, "legacy"), (1, 1, 1, 1));

    let detail = db.get_sleep_detail("legacy").unwrap().unwrap();
    assert_eq!(detail.deep_minutes, Some(0));
    assert_eq!(detail.light_minutes, Some(0));
    assert_eq!(detail.awake_minutes, Some(0));
    assert_eq!(detail.rem_minutes, Some(0));

    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn v28_dedupes_metric_samples_before_the_unique_index() {
    let db = Database::in_memory().unwrap();
    db.conn
        .execute_batch("DROP INDEX uq_metric_sample_key; PRAGMA user_version = 27;")
        .unwrap();
    for value in [70.0_f64, 71.0] {
        db.conn
                .execute(
                    "INSERT INTO metric_samples(metric, timestamp, value, unit, source_scope, device_id)
                     VALUES ('heart_rate', '2026-01-01T00:00:00Z', ?1, 'bpm', 'device', '')",
                    [value],
                )
                .unwrap();
    }
    db.migrate().unwrap();
    let count: i64 = db
        .conn
        .query_row("SELECT COUNT(*) FROM metric_samples", [], |row| row.get(0))
        .unwrap();
    assert_eq!(count, 1);
    let version: i64 = db
        .conn
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .unwrap();
    assert_eq!(version, CURRENT_SCHEMA_VERSION);
    let duplicate = db.conn.execute(
        "INSERT INTO metric_samples(metric, timestamp, value, unit, source_scope, device_id)
             VALUES ('heart_rate', '2026-01-01T00:00:00Z', 72, 'bpm', 'device', '')",
        [],
    );
    assert!(duplicate.is_err());
}

#[test]
fn v28_deletes_workout_hr_zones_with_the_parent_workout() {
    let db = Database::in_memory().unwrap();
    db.conn
        .execute(
            "INSERT INTO workouts(workout_id, workout_type, start_time, end_time, source_scope)
                 VALUES ('w', 'run', '2026-01-01T00:00:00Z', '2026-01-01T01:00:00Z', 'device')",
            [],
        )
        .unwrap();
    db.conn
        .execute(
            "INSERT INTO workout_hr_zones(workout_id, zone_index, upper_bound_bpm, seconds)
                 VALUES ('w', 1, 140, 60)",
            [],
        )
        .unwrap();
    db.conn
        .execute("DELETE FROM workouts WHERE workout_id = 'w'", [])
        .unwrap();
    let leftover: i64 = db
        .conn
        .query_row("SELECT COUNT(*) FROM workout_hr_zones", [], |row| {
            row.get(0)
        })
        .unwrap();
    assert_eq!(leftover, 0);
}

/// v33：两个新索引落库、workouts 本地日范围能走 idx_workouts_start，
/// 迁移再跑一遍幂等。
#[test]
fn v33_adds_start_and_mcp_indexes_idempotently() {
    let db = Database::in_memory().unwrap();
    let found: i64 = db
        .conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master
                 WHERE type = 'index'
                   AND name IN ('idx_workouts_start', 'idx_ai_tasks_mcp')",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(found, 2);
    let mut stmt = db
        .conn
        .prepare(
            "EXPLAIN QUERY PLAN
                 SELECT workout_id FROM workouts
                 WHERE start_time >= '2026-01-01' AND start_time < '2026-02-01'
                   AND date(start_time, 'localtime') BETWEEN '2026-01-02' AND '2026-01-30'",
        )
        .unwrap();
    let plan = stmt
        .query_map([], |row| row.get::<_, String>(3))
        .unwrap()
        .collect::<std::result::Result<Vec<_>, _>>()
        .unwrap()
        .join("\n");
    assert!(
        plan.contains("SEARCH workouts"),
        "本地日范围必须走索引:\n{plan}"
    );
    assert!(plan.contains("idx_workouts_start"), "{plan}");
    db.migrate().unwrap();
    let version: i64 = db
        .conn
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .unwrap();
    assert_eq!(version, CURRENT_SCHEMA_VERSION);
}

#[test]
fn null_device_metric_key_deduplicates() {
    let db = Database::in_memory().unwrap();
    let sample = MetricSample {
        metric: "heart_rate".into(),
        timestamp: ts(),
        value: 70.0,
        unit: "bpm".into(),
        source_scope: SourceScope::Unknown,
        device_id: None,
    };
    db.insert_metric_sample(&sample).unwrap();
    let mut revised = sample.clone();
    revised.value = 71.0;
    db.insert_metric_sample(&revised).unwrap();
    assert_eq!(db.count_metric_samples().unwrap(), 1);
    assert_eq!(db.get_health_overview().unwrap().current_hr, Some(71));
}

fn temp_dir(label: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!(
        "zeppbridge-storage-{}-{}-{}",
        label,
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

fn inflate_page_count(path: &Path, extra_pages: u32) {
    use std::fs::OpenOptions;
    use std::io::{Read, Seek, SeekFrom, Write};
    let mut file = OpenOptions::new()
        .read(true)
        .write(true)
        .open(path)
        .unwrap();
    let mut header = [0u8; 32];
    file.read_exact(&mut header).unwrap();
    let claimed = u32::from_be_bytes(header[28..32].try_into().unwrap());
    file.seek(SeekFrom::Start(28)).unwrap();
    file.write_all(&(claimed + extra_pages).to_be_bytes())
        .unwrap();
}

#[test]
fn salvage_aligns_truncated_sqlite_page_count() {
    let dir = temp_dir("salvage");
    let path = dir.join("zepp.db");
    {
        let db = Database::new(path.clone()).unwrap();
        db.insert_metric_sample(&MetricSample {
            metric: "heart_rate".into(),
            timestamp: ts(),
            value: 70.0,
            unit: "bpm".into(),
            source_scope: SourceScope::Unknown,
            device_id: None,
        })
        .unwrap();
    }
    let _ = std::fs::remove_file(dir.join("zepp.db-wal"));
    let _ = std::fs::remove_file(dir.join("zepp.db-shm"));
    inflate_page_count(&path, 24);
    assert!(Database::new(path.clone()).is_err());
    let (db, warning) = Database::open_resilient(path.clone()).unwrap();
    assert!(warning.unwrap().contains("截断"));
    assert_eq!(db.count_metric_samples().unwrap(), 1);
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn corrupt_library_is_quarantined_and_app_still_starts() {
    let dir = temp_dir("quarantine");
    let path = dir.join("zepp.db");
    std::fs::write(&path, b"this is not a sqlite database").unwrap();
    let (db, warning) = Database::open_resilient(path.clone()).unwrap();
    assert!(warning.unwrap().contains("损坏"));
    assert!(path.exists());
    assert_eq!(db.count_metric_samples().unwrap(), 0);
    let quarantined = std::fs::read_dir(dir.join("backups"))
        .unwrap()
        .filter_map(|entry| entry.ok())
        .any(|entry| entry.file_name().to_string_lossy().starts_with("corrupt-"));
    assert!(quarantined);
    let _ = std::fs::remove_dir_all(dir);
}
