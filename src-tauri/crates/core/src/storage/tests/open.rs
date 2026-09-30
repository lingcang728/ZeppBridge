//! 打开、只读连接、升级真实旧库、损坏库的抢救与隔离。

use super::*;

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

/* ---------- 代码审查 R07：恢复链先留原件、整组处理、失败就不动 ---------- */

fn corrupt_dirs(dir: &std::path::Path) -> Vec<std::path::PathBuf> {
    let mut dirs: Vec<_> = std::fs::read_dir(dir.join("backups"))
        .map(|entries| {
            entries
                .filter_map(|entry| entry.ok())
                .map(|entry| entry.path())
                .filter(|path| {
                    path.file_name()
                        .is_some_and(|name| name.to_string_lossy().starts_with("corrupt-"))
                })
                .collect()
        })
        .unwrap_or_default();
    dirs.sort();
    dirs
}

#[test]
fn salvage_keeps_the_untouched_original_before_patching_the_header() {
    let dir = temp_dir("salvage-original");
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
    let before = std::fs::read(&path).unwrap();

    let (db, warning) = Database::open_resilient(path.clone()).unwrap();
    assert!(warning.unwrap().contains("原件"));
    assert_eq!(db.count_metric_samples().unwrap(), 1);
    let kept = corrupt_dirs(&dir);
    assert_eq!(kept.len(), 1);
    assert_eq!(std::fs::read(kept[0].join("zepp.db")).unwrap(), before);
    drop(db);
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn two_recoveries_in_the_same_second_never_share_a_quarantine_directory() {
    let dir = temp_dir("same-second");
    let path = dir.join("zepp.db");
    std::fs::write(&path, b"first broken file").unwrap();
    let first = crate::paths::preserve_sqlite_group(&path).unwrap();
    std::fs::write(&path, b"second broken file").unwrap();
    let second = crate::paths::preserve_sqlite_group(&path).unwrap();
    assert_ne!(first, second);
    assert_eq!(
        std::fs::read(first.join("zepp.db")).unwrap(),
        b"first broken file"
    );
    assert_eq!(
        std::fs::read(second.join("zepp.db")).unwrap(),
        b"second broken file"
    );
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn a_corrupt_library_that_cannot_be_preserved_is_left_exactly_as_it_was() {
    let dir = temp_dir("cannot-preserve");
    let path = dir.join("zepp.db");
    std::fs::write(&path, b"this is not a sqlite database").unwrap();
    // backups 是个文件：隔离目录建不起来 = 原件保不住。
    std::fs::write(dir.join("backups"), b"").unwrap();
    let (db, warning) = Database::open_resilient(path.clone()).unwrap();
    assert!(warning.unwrap().contains("没有动它"));
    assert_eq!(db.count_metric_samples().unwrap(), 0, "临时空库照常能用");
    assert_eq!(
        std::fs::read(&path).unwrap(),
        b"this is not a sqlite database"
    );
    let _ = std::fs::remove_dir_all(dir);
}
