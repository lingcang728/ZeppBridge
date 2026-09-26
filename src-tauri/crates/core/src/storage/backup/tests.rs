use super::*;
use crate::models::{MetricSample, SourceScope};
use crate::storage::write_lock::{self, WritePurpose};
use chrono::TimeZone;

fn temp_dir(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("zeppbridge-backup-{name}"));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

fn seed(data_dir: &Path, samples: i64) -> Database {
    let db = Database::new(database_path(data_dir)).unwrap();
    for index in 0..samples {
        db.insert_metric_sample(&MetricSample {
            metric: "heart_rate".into(),
            timestamp: Utc.with_ymd_and_hms(2026, 8, 1, 0, 0, 0).unwrap()
                + chrono::Duration::minutes(index),
            value: 60.0 + index as f64,
            unit: "bpm".into(),
            source_scope: SourceScope::Device,
            device_id: Some("device-a".into()),
        })
        .unwrap();
    }
    db
}

#[test]
fn regression_markdown_manifest_ids_cannot_redirect_pruning_or_pinning() {
    let dir = temp_dir("manifest-id-boundary");
    drop(seed(&dir, 1));
    let mut manifest = create_backup(&dir, BackupKind::PreMigration, "1.0.0").unwrap();
    let original_id = manifest.id.clone();
    let original_path = manifest_path(&dir, &original_id);
    std::fs::write(dir.join("outside.db"), b"keep database").unwrap();
    std::fs::write(dir.join("outside.json"), b"keep manifest").unwrap();
    for index in 0..MIGRATION_BACKUP_KEEP {
        manifest.id = format!("valid-{index}");
        manifest.created_at = format!("9999-{index}");
        write_manifest(&dir, &manifest).unwrap();
    }
    for invalid in [
        "../outside",
        "..\\outside",
        "/outside",
        "C:\\outside",
        "",
        "valid-0",
    ] {
        manifest.id = invalid.into();
        manifest.created_at = "0000".into();
        std::fs::write(&original_path, serde_json::to_vec(&manifest).unwrap()).unwrap();
        assert_eq!(list_backups(&dir).unwrap().len(), MIGRATION_BACKUP_KEEP);
        assert!(load_manifest(&dir, &original_id).is_err());
        assert!(set_pinned(&dir, &original_id, true).is_err());
        assert!(prune_migration_backups(&dir).unwrap().is_empty());
        assert_eq!(
            std::fs::read(dir.join("outside.db")).unwrap(),
            b"keep database"
        );
        assert_eq!(
            std::fs::read(dir.join("outside.json")).unwrap(),
            b"keep manifest"
        );
        assert!(!load_manifest(&dir, "valid-0").unwrap().pinned);
    }
    manifest.id = original_id;
    write_manifest(&dir, &manifest).unwrap();
    assert_eq!(prune_migration_backups(&dir).unwrap(), vec![manifest.id]);
    std::fs::remove_dir_all(dir).unwrap();
}

#[test]
fn a_snapshot_is_verified_before_it_is_ever_called_a_backup() {
    let dir = temp_dir("verified");
    let db = seed(&dir, 5);
    drop(db);

    let manifest = create_backup(&dir, BackupKind::Manual, "1.0.0").unwrap();
    assert!(manifest.integrity_ok);
    assert_eq!(manifest.sha256.len(), 64);
    assert!(manifest.bytes > 0);
    assert_eq!(manifest.schema_version, CURRENT_SCHEMA_VERSION);
    assert_eq!(manifest.table_counts.get("metric_samples"), Some(&5));

    let verification = verify_backup(&dir, &manifest.id).unwrap();
    assert!(verification.is_usable(), "{verification:?}");
    assert!(verification.problem.is_none());
}

#[test]
fn the_snapshot_captures_writes_that_are_still_only_in_the_wal() {
    // 直接复制 zepp.db 会漏掉这些行；Backup API 不会。
    let dir = temp_dir("wal");
    let db = seed(&dir, 40);
    // 刻意不关闭连接，也不 checkpoint。
    let manifest = create_backup(&dir, BackupKind::Manual, "1.0.0").unwrap();
    assert_eq!(manifest.table_counts.get("metric_samples"), Some(&40));
    drop(db);
}

/// 校验失败的原因也要能翻译。
///
/// `problem` 是中文原文，界面靠 `problem_code` 取自己语言的说法。少了码，
/// 英文用户在「快照」里看到的就是一行中文——和补拉账本当初一模一样的毛病。
#[test]
fn a_failed_verification_carries_a_code_for_the_interface() {
    let dir = temp_dir("problem-code");
    drop(seed(&dir, 3));
    let manifest = create_backup(&dir, BackupKind::Manual, "1.0.0").unwrap();

    // 删掉快照文件：最容易构造、也最常见的一种失败。
    std::fs::remove_file(snapshot_path(&dir, &manifest.id)).unwrap();
    let verification = verify_backup(&dir, &manifest.id).unwrap();

    assert!(!verification.is_usable());
    let problem = verification.problem.as_deref().unwrap_or_default();
    assert!(
        problem
            .chars()
            .any(|c| ('\u{4e00}'..='\u{9fff}').contains(&c)),
        "这一版的原文本来就是中文，前提变了就要改这条断言"
    );
    assert_eq!(
        verification.problem_code.as_deref(),
        Some("ui.backup.file_missing"),
        "有中文原文就必须有码，否则英文界面会原样显示这句中文"
    );
}

#[test]
fn a_corrupted_snapshot_never_looks_restorable() {
    let dir = temp_dir("corrupt");
    drop(seed(&dir, 3));
    let manifest = create_backup(&dir, BackupKind::Manual, "1.0.0").unwrap();

    // 篡改文件内容，长度保持不变，这样只有哈希能发现。
    let path = snapshot_path(&dir, &manifest.id);
    let mut bytes = std::fs::read(&path).unwrap();
    let last = bytes.len() - 1;
    bytes[last] ^= 0xFF;
    std::fs::write(&path, &bytes).unwrap();

    let verification = verify_backup(&dir, &manifest.id).unwrap();
    assert!(!verification.sha256_match);
    assert!(!verification.is_usable());
    let preview = restore_preview(&dir, &manifest.id).unwrap();
    assert!(!preview.can_restore);
    assert!(preview.blocker.unwrap().contains("SHA-256"));
}

#[test]
fn a_backup_from_a_newer_schema_is_refused_without_touching_the_current_library() {
    let dir = temp_dir("future");
    drop(seed(&dir, 2));
    let manifest = create_backup(&dir, BackupKind::Manual, "9.9.9").unwrap();

    // 把 manifest 说成来自更新的 schema，并同步改快照本身。
    let snapshot = rusqlite::Connection::open(snapshot_path(&dir, &manifest.id)).unwrap();
    snapshot
        .execute_batch(&format!(
            "PRAGMA user_version = {};",
            CURRENT_SCHEMA_VERSION + 1
        ))
        .unwrap();
    drop(snapshot);
    let mut updated = manifest.clone();
    updated.schema_version = CURRENT_SCHEMA_VERSION + 1;
    updated.bytes = std::fs::metadata(snapshot_path(&dir, &manifest.id))
        .unwrap()
        .len();
    updated.sha256 = file_sha256(&snapshot_path(&dir, &manifest.id)).unwrap();
    write_manifest(&dir, &updated).unwrap();

    let preview = restore_preview(&dir, &manifest.id).unwrap();
    assert_eq!(
        preview.compatibility,
        RestoreCompatibility::FutureSchemaRefused
    );
    assert!(!preview.can_restore);
    assert!(stage_restore(&dir, &manifest.id, "1.0.0").is_err());
    assert!(pending_restore(&dir).is_none(), "被拒绝的恢复不该留下待办");
}

#[test]
fn restore_rechecks_actual_schema_even_when_manifest_claims_compatibility() {
    let dir = temp_dir("future-pending");
    drop(seed(&dir, 2));
    let mut manifest = create_backup(&dir, BackupKind::Manual, "1.0.0").unwrap();
    let pending = stage_restore(&dir, &manifest.id, "1.0.0").unwrap();
    let snapshot = snapshot_path(&dir, &manifest.id);
    let conn = rusqlite::Connection::open(&snapshot).unwrap();
    conn.execute_batch(&format!(
        "PRAGMA user_version = {};",
        CURRENT_SCHEMA_VERSION + 1
    ))
    .unwrap();
    drop(conn);
    manifest.bytes = std::fs::metadata(&snapshot).unwrap().len();
    manifest.sha256 = file_sha256(&snapshot).unwrap();
    write_manifest(&dir, &manifest).unwrap();
    let before = std::fs::read(database_path(&dir)).unwrap();
    let outcome = run_restore(&dir, &pending);
    assert!(!outcome.succeeded);
    assert!(outcome.message.contains("恢复未执行"));
    assert_eq!(std::fs::read(database_path(&dir)).unwrap(), before);
}

#[test]
fn restore_swaps_the_library_and_keeps_a_rollback_snapshot() {
    let dir = temp_dir("restore");
    drop(seed(&dir, 3));
    let backup = create_backup(&dir, BackupKind::Manual, "1.0.0").unwrap();

    // 之后又写了更多数据。
    {
        let db = Database::new(database_path(&dir)).unwrap();
        for index in 100..110 {
            db.insert_metric_sample(&MetricSample {
                metric: "heart_rate".into(),
                timestamp: Utc.with_ymd_and_hms(2026, 9, 1, 0, 0, 0).unwrap()
                    + chrono::Duration::minutes(index),
                value: 70.0,
                unit: "bpm".into(),
                source_scope: SourceScope::Device,
                device_id: Some("device-a".into()),
            })
            .unwrap();
        }
    }

    stage_restore(&dir, &backup.id, "1.0.0").unwrap();
    assert!(pending_restore(&dir).is_some());

    let outcome = apply_pending_restore(&dir).expect("有排队的恢复");
    assert!(outcome.succeeded, "{outcome:?}");
    assert!(pending_restore(&dir).is_none(), "执行后待办要清掉");

    let db = Database::open_read_only_any_version(database_path(&dir)).unwrap();
    let count: i64 = db
        .conn
        .query_row("SELECT COUNT(*) FROM metric_samples", [], |row| row.get(0))
        .unwrap();
    assert_eq!(count, 3, "库应当回到备份时的状态");

    // 回滚快照存在，而且装的是恢复前那 13 条。
    let rollback = load_manifest(&dir, &outcome.rollback_backup_id).unwrap();
    assert_eq!(rollback.kind, BackupKind::PreRestore);
    assert_eq!(rollback.table_counts.get("metric_samples"), Some(&13));
}

/// 恢复必须把旧库的 `-wal` / `-shm` 一起挪走，而且要在新库换上去之前。
///
/// 留在原地的 WAL 属于**被替换掉的那个库**。新库一被打开，SQLite 就会把
/// 它当成自己的日志重放进来，旧库的脏页直接盖进新库，B-Tree 就此损坏。
/// 旧实现是先换上新库、再 `let _ =` 去删 WAL——删失败（Windows 句柄没释放）
/// 或者在这两步之间断电，就正好落进这个场景。
#[test]
fn restore_moves_the_wal_away_before_the_new_library_takes_its_place() {
    let dir = temp_dir("restore-wal");
    drop(seed(&dir, 3));
    let backup = create_backup(&dir, BackupKind::Manual, "1.0.0").unwrap();

    // 造一份「属于旧库」的 WAL / SHM，内容带上可辨认的标记。真实的 WAL
    // 由 SQLite 生成，这里只需要证明这两个文件不会留在新库旁边。
    let stale = b"stale-wal-belonging-to-the-replaced-database";
    std::fs::write(dir.join("zepp.db-wal"), stale).unwrap();
    std::fs::write(dir.join("zepp.db-shm"), stale).unwrap();

    stage_restore(&dir, &backup.id, "1.0.0").unwrap();
    let outcome = apply_pending_restore(&dir).expect("有排队的恢复");
    assert!(outcome.succeeded, "{outcome:?}");

    for sidecar in ["zepp.db-wal", "zepp.db-shm"] {
        let path = dir.join(sidecar);
        if let Ok(bytes) = std::fs::read(&path) {
            assert_ne!(
                bytes.as_slice(),
                stale,
                "{sidecar} 还是恢复之前那一份，它会被当成新库的日志重放"
            );
        }
    }

    // 恢复出来的库仍然读得动，而且确实是备份时那三条。
    let db = Database::open_read_only_any_version(database_path(&dir)).unwrap();
    let count: i64 = db
        .conn
        .query_row("SELECT COUNT(*) FROM metric_samples", [], |row| row.get(0))
        .unwrap();
    assert_eq!(count, 3);
}

/// 三件套要么整组挪走，要么整组回来。
#[test]
fn the_sqlite_group_moves_and_comes_back_together() {
    let dir = temp_dir("sqlite-group");
    let live = dir.join("zepp.db");
    let displaced = dir.join("zepp.db.restore-previous");
    std::fs::write(&live, b"main").unwrap();
    std::fs::write(dir.join("zepp.db-wal"), b"wal").unwrap();
    std::fs::write(dir.join("zepp.db-shm"), b"shm").unwrap();

    displace_sqlite_group(&live, &displaced).unwrap();
    assert!(!live.exists(), "主库应当已经挪走");
    assert!(!dir.join("zepp.db-wal").exists(), "WAL 必须跟着主库一起走");
    assert!(!dir.join("zepp.db-shm").exists());
    assert_eq!(
        std::fs::read(dir.join("zepp.db.restore-previous-wal")).unwrap(),
        b"wal"
    );

    restore_sqlite_group(&displaced, &live).unwrap();
    assert_eq!(std::fs::read(&live).unwrap(), b"main");
    assert_eq!(std::fs::read(dir.join("zepp.db-wal")).unwrap(), b"wal");
    assert_eq!(std::fs::read(dir.join("zepp.db-shm")).unwrap(), b"shm");

    remove_sqlite_group(&live);
    assert!(!live.exists());
    assert!(!dir.join("zepp.db-wal").exists());
    assert!(!dir.join("zepp.db-shm").exists());
}

#[test]
fn a_busy_write_lock_leaves_pending_restore_in_place() {
    let dir = temp_dir("restore-busy");
    drop(seed(&dir, 3));
    let backup = create_backup(&dir, BackupKind::Manual, "1.0.0").unwrap();
    stage_restore(&dir, &backup.id, "1.0.0").unwrap();
    let _held = write_lock::try_acquire(&dir, WritePurpose::Sync).unwrap();

    let outcome = apply_pending_restore(&dir).expect("有排队的恢复");
    assert!(!outcome.succeeded, "{outcome:?}");
    assert_eq!(
        outcome.message_code.as_deref(),
        Some("err.backup.restore_busy")
    );
    assert!(
        pending_restore(&dir).is_some(),
        "拿不到写锁时排队文件必须留着"
    );
    assert!(outcome.message.contains("下次启动会再试"), "{outcome:?}");
}

#[test]
fn a_missing_snapshot_leaves_the_current_library_untouched() {
    let dir = temp_dir("missing");
    drop(seed(&dir, 6));
    let backup = create_backup(&dir, BackupKind::Manual, "1.0.0").unwrap();
    let pending = stage_restore(&dir, &backup.id, "1.0.0").unwrap();

    // 排队之后、执行之前，快照被删了。
    std::fs::remove_file(snapshot_path(&dir, &pending.backup_id)).unwrap();

    let outcome = apply_pending_restore(&dir).expect("有排队的恢复");
    assert!(!outcome.succeeded);
    assert!(outcome.message.contains("当前库没有改动"), "{outcome:?}");
    assert!(
        pending_restore(&dir).is_some(),
        "失败的恢复必须留下排队文件，下次启动再试"
    );

    let db = Database::open_read_only_any_version(database_path(&dir)).unwrap();
    let count: i64 = db
        .conn
        .query_row("SELECT COUNT(*) FROM metric_samples", [], |row| row.get(0))
        .unwrap();
    assert_eq!(count, 6, "失败的恢复不许动原库");
}

#[test]
fn pinning_is_refused_while_another_writer_holds_the_lock() {
    let dir = temp_dir("pin-busy");
    drop(seed(&dir, 1));
    let backup = create_backup(&dir, BackupKind::Manual, "1.0.0").unwrap();
    let _held = write_lock::try_acquire(&dir, WritePurpose::Sync).unwrap();
    let error = set_pinned(&dir, &backup.id, true).unwrap_err();
    assert!(error.is_busy(), "{error:?}");
    assert!(!load_manifest(&dir, &backup.id).unwrap().pinned);
    drop(_held);
    assert!(set_pinned(&dir, &backup.id, true).unwrap().pinned);
}

#[test]
fn cancelling_a_restore_is_refused_while_another_writer_holds_the_lock() {
    let dir = temp_dir("cancel-busy");
    drop(seed(&dir, 1));
    let backup = create_backup(&dir, BackupKind::Manual, "1.0.0").unwrap();
    stage_restore(&dir, &backup.id, "1.0.0").unwrap();
    let _held = write_lock::try_acquire(&dir, WritePurpose::Sync).unwrap();
    let error = cancel_pending_restore(&dir).unwrap_err();
    assert!(error.is_busy(), "{error:?}");
    assert!(
        pending_restore(&dir).is_some(),
        "拿不到写锁时排队文件必须留着"
    );
    drop(_held);
}

#[test]
fn a_failed_staging_copy_does_not_delete_the_displaced_library() {
    let dir = temp_dir("displaced-kept");
    drop(seed(&dir, 6));
    let backup = create_backup(&dir, BackupKind::Manual, "1.0.0").unwrap();
    {
        let db = Database::new(database_path(&dir)).unwrap();
        db.insert_metric_sample(&MetricSample {
            metric: "heart_rate".into(),
            timestamp: Utc.with_ymd_and_hms(2026, 8, 2, 0, 0, 0).unwrap(),
            value: 70.0,
            unit: "bpm".into(),
            source_scope: SourceScope::Device,
            device_id: Some("device-a".into()),
        })
        .unwrap();
    }
    stage_restore(&dir, &backup.id, "1.0.0").unwrap();

    let displaced = dir.join("zepp.db.restore-previous");
    std::fs::write(&displaced, b"ORIGINAL-LIBRARY-BYTES").unwrap();
    // 让拷到 staging 失败：目标已经是目录。旧实现会在拷贝之前删掉
    // displaced，原库就只剩这个半成品了。
    let staging = dir.join("zepp.db.restore-staging");
    std::fs::create_dir_all(&staging).unwrap();
    std::fs::write(staging.join("blocker"), b"x").unwrap();

    let outcome = apply_pending_restore(&dir).expect("有排队的恢复");
    assert!(!outcome.succeeded, "{outcome:?}");
    assert_eq!(
        std::fs::read(&displaced).unwrap(),
        b"ORIGINAL-LIBRARY-BYTES",
        "校验 / 拷贝失败时不得删掉 displaced 里的原库"
    );
    assert!(pending_restore(&dir).is_some());
    let db = Database::open_read_only_any_version(database_path(&dir)).unwrap();
    let count: i64 = db
        .conn
        .query_row("SELECT COUNT(*) FROM metric_samples", [], |row| row.get(0))
        .unwrap();
    assert_eq!(count, 7, "失败的恢复不许动原库");
    drop(db);
}

#[test]
fn a_completed_swap_is_finished_without_recopying() {
    let dir = temp_dir("already-swapped");
    drop(seed(&dir, 6));
    let backup = create_backup(&dir, BackupKind::Manual, "1.0.0").unwrap();
    {
        let db = Database::new(database_path(&dir)).unwrap();
        db.insert_metric_sample(&MetricSample {
            metric: "heart_rate".into(),
            timestamp: Utc.with_ymd_and_hms(2026, 8, 2, 0, 0, 0).unwrap(),
            value: 70.0,
            unit: "bpm".into(),
            source_scope: SourceScope::Device,
            device_id: Some("device-a".into()),
        })
        .unwrap();
    }
    stage_restore(&dir, &backup.id, "1.0.0").unwrap();

    let live = database_path(&dir);
    let displaced = dir.join("zepp.db.restore-previous");
    std::fs::copy(&live, &displaced).unwrap();
    std::fs::copy(snapshot_path(&dir, &backup.id), &live).unwrap();

    let outcome = apply_pending_restore(&dir).expect("有排队的恢复");
    assert!(outcome.succeeded, "{outcome:?}");
    let db = Database::open_read_only_any_version(database_path(&dir)).unwrap();
    let count: i64 = db
        .conn
        .query_row("SELECT COUNT(*) FROM metric_samples", [], |row| row.get(0))
        .unwrap();
    assert_eq!(count, 6, "应当接着完成已经换上去的备份，而不是再拷一次");
    drop(db);
}

#[test]
fn pruning_keeps_five_migration_backups_and_never_deletes_pinned_or_manual_ones() {
    let dir = temp_dir("prune");
    drop(seed(&dir, 1));
    let manual = create_backup(&dir, BackupKind::Manual, "1.0.0").unwrap();

    let mut migration_ids = Vec::new();
    for _ in 0..(MIGRATION_BACKUP_KEEP + 3) {
        let manifest = create_backup(&dir, BackupKind::PreMigration, "1.0.0").unwrap();
        migration_ids.push(manifest.id);
        // manifest id 精确到毫秒；确保排序稳定。
        std::thread::sleep(std::time::Duration::from_millis(3));
    }
    // 把最老的一份标记为保留。
    set_pinned(&dir, &migration_ids[0], true).unwrap();

    let removed = prune_migration_backups(&dir).unwrap();
    let remaining = list_backups(&dir).unwrap();
    let remaining_ids: Vec<&str> = remaining.iter().map(|m| m.id.as_str()).collect();

    assert!(
        remaining_ids.contains(&manual.id.as_str()),
        "手动备份不许被清理"
    );
    assert!(
        remaining_ids.contains(&migration_ids[0].as_str()),
        "标记保留的备份不许被清理"
    );
    assert!(!removed.is_empty(), "超出上限的应当被清掉");
    let kept_migrations = remaining
        .iter()
        .filter(|m| m.kind == BackupKind::PreMigration && !m.pinned)
        .count();
    assert_eq!(kept_migrations, MIGRATION_BACKUP_KEEP);
}
