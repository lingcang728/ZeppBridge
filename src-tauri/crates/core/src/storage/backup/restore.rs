//! 恢复：预检、排队、下次启动时换入、失败回滚（从 storage/backup.rs 拆出，逻辑不变）。

use super::*;

/// 恢复前的预览：清单、校验结果、和当前库的差异、能不能恢复。
pub fn restore_preview(data_dir: &Path, id: &str) -> Result<RestorePreview> {
    validate_backup_id(id)?;
    let manifest = load_manifest(data_dir, id)?;
    let verification = verify_backup(data_dir, id)?;
    let current_schema_version = current_schema_version(data_dir);
    let compatibility = if manifest.schema_version > current_schema_version {
        RestoreCompatibility::FutureSchemaRefused
    } else if manifest.schema_version == current_schema_version {
        RestoreCompatibility::SameSchema
    } else {
        RestoreCompatibility::OlderSchemaWillMigrate
    };
    let mut current_table_counts = BTreeMap::new();
    if let Ok(db) = Database::open_read_only_any_version(database_path(data_dir)) {
        for table in COUNTED_TABLES {
            let count: i64 = db
                .conn
                .query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |row| {
                    row.get(0)
                })
                .unwrap_or(0);
            current_table_counts.insert(table.to_string(), count);
        }
    }
    let blocker = if !verification.is_usable() {
        verification
            .problem
            .clone()
            .or_else(|| Some("备份未通过校验".into()))
    } else if compatibility == RestoreCompatibility::FutureSchemaRefused {
        Some(format!(
            "这份备份来自更新版本的 ZeppBridge（schema {}，当前 {}）。降级打开会丢字段，所以不恢复，也不会改动当前库。请先升级 ZeppBridge。",
            manifest.schema_version, current_schema_version
        ))
    } else {
        None
    };
    Ok(RestorePreview {
        manifest,
        verification,
        compatibility,
        current_schema_version,
        current_table_counts,
        can_restore: blocker.is_none(),
        blocker,
    })
}

pub(super) fn current_schema_version(data_dir: &Path) -> i64 {
    Database::open_read_only_any_version(database_path(data_dir))
        .ok()
        .and_then(|db| {
            db.conn
                .query_row("PRAGMA user_version", [], |row| row.get::<_, i64>(0))
                .ok()
        })
        .unwrap_or(CURRENT_SCHEMA_VERSION)
}

/// 排队一次恢复：先做完全部校验和回滚快照，再写下待办。
///
/// 真正的文件替换推迟到下次启动 —— 那时应用、同步线程和本机 API 都还没有
/// 打开任何连接，替换才可能真正原子。
pub fn stage_restore(data_dir: &Path, id: &str, app_version: &str) -> Result<PendingRestore> {
    validate_backup_id(id)?;
    // 同步可能正在落库：等它放下写锁，而不是让用户点了恢复就立刻碰上「忙」。
    let _guard = write_lock::acquire_with_timeout(
        data_dir,
        WritePurpose::Restore,
        std::time::Duration::from_secs(30),
    )
    .map_err(map_write_lock)?;
    if pending_restore(data_dir).is_none() {
        // 没有待办说明上一次恢复已经完成（待办在完成时最先删除），剩下的只是
        // 清理没删掉的旧库副本。留着它会让新的恢复认为换库做到一半，所有写入
        // 和取消都被拦住。
        if database_path(data_dir).try_exists()? {
            remove_sqlite_group(&previous_path(data_dir))?;
        }
        remove_if_present(&publication_path(data_dir))?;
    } else if publication_path(data_dir).exists() || previous_path(data_dir).exists() {
        return Err(ZeppBridgeError::Busy(
            "恢复已开始，请重启以完成恢复。".into(),
        ));
    }
    let preview = restore_preview(data_dir, id)?;
    if !preview.can_restore {
        return Err(ZeppBridgeError::DataUnavailable(
            preview
                .blocker
                .unwrap_or_else(|| "这份备份当前不可恢复".into()),
        ));
    }
    // 回滚快照在排队时就生成：等到启动时再做，万一那时磁盘满了就没有退路了。
    let rollback = create_backup(data_dir, BackupKind::PreRestore, app_version)?;
    let pending = PendingRestore {
        backup_id: id.to_string(),
        staged_at: Utc::now().to_rfc3339(),
        rollback_backup_id: rollback.id,
    };
    let encoded = serde_json::to_vec_pretty(&pending)
        .map_err(|error| ZeppBridgeError::ParseError(format!("无法写入恢复计划: {error}")))?;
    crate::paths::write_file_atomically(&data_dir.join(PENDING_RESTORE_FILE), &encoded)?;
    Ok(pending)
}

pub fn pending_restore(data_dir: &Path) -> Option<PendingRestore> {
    let text = std::fs::read_to_string(data_dir.join(PENDING_RESTORE_FILE)).ok()?;
    serde_json::from_str(&text).ok()
}

pub fn cancel_pending_restore(data_dir: &Path) -> Result<()> {
    let _guard =
        write_lock::try_acquire(data_dir, WritePurpose::Restore).map_err(map_write_lock)?;
    cancel_pending_restore_unlocked(data_dir)
}

/// 调用方持有写锁时使用。
pub fn cancel_pending_restore_unlocked(data_dir: &Path) -> Result<()> {
    if publication_path(data_dir).exists() || previous_path(data_dir).exists() {
        return Err(ZeppBridgeError::Busy(
            "恢复已开始，请重启以完成恢复。".into(),
        ));
    }
    remove_if_present(&data_dir.join(PENDING_RESTORE_FILE))?;
    Ok(())
}

pub fn apply_pending_restore(data_dir: &Path) -> Option<RestoreOutcome> {
    let pending = pending_restore(data_dir)?;
    let _guard = match write_lock::try_acquire(data_dir, WritePurpose::Restore) {
        Ok(guard) => guard,
        Err(error) => {
            let error = map_write_lock(error);
            let code = if error.is_busy() {
                "err.backup.restore_busy"
            } else {
                "err.storage.write_lock_unavailable"
            };
            return Some(restore_fail(
                &pending,
                format!("恢复还没有执行：{}。下次启动会再试。", error.user_message()),
                code,
            ));
        }
    };
    // 取得写锁前，另一个进程可能已经完成或取消了这次恢复。
    pending_restore(data_dir).map(|pending| run_restore(data_dir, &pending))
}

pub(super) fn restore_fail(
    pending: &PendingRestore,
    message: String,
    code: &str,
) -> RestoreOutcome {
    RestoreOutcome {
        backup_id: pending.backup_id.clone(),
        rollback_backup_id: pending.rollback_backup_id.clone(),
        succeeded: false,
        message,
        message_code: Some(code.to_string()),
    }
}

pub(super) fn restore_ok(pending: &PendingRestore, message: String) -> RestoreOutcome {
    RestoreOutcome {
        backup_id: pending.backup_id.clone(),
        rollback_backup_id: pending.rollback_backup_id.clone(),
        succeeded: true,
        message,
        message_code: None,
    }
}

#[derive(Serialize, Deserialize)]
struct RestorePublication {
    pending: PendingRestore,
    sha256: String,
}

fn publication_path(data_dir: &Path) -> PathBuf {
    data_dir.join("restore-publication.json")
}

fn previous_path(data_dir: &Path) -> PathBuf {
    data_dir.join("zepp.db.restore-previous")
}

/// A writer must not create an empty database while a restore owns the original file.
pub(crate) fn check_incomplete_restore(db_path: &Path) -> Result<()> {
    if let Some(data_dir) = db_path.parent() {
        if db_path == database_path(data_dir)
            && previous_path(data_dir).try_exists()?
            && (!db_path.try_exists()? || data_dir.join(PENDING_RESTORE_FILE).try_exists()?)
        {
            return Err(ZeppBridgeError::DataUnavailable(
                "有一项数据库恢复尚未完成。请重启桌面应用继续恢复。".into(),
            ));
        }
    }
    Ok(())
}

fn remove_if_present(path: &Path) -> std::io::Result<()> {
    match std::fs::remove_file(path) {
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        result => result,
    }
}

pub(super) fn run_restore(data_dir: &Path, pending: &PendingRestore) -> RestoreOutcome {
    match publish_restore(data_dir, pending) {
        Ok(()) => restore_ok(
            pending,
            "已从备份恢复。恢复前的数据库已存为回滚备份，可以再换回去。".into(),
        ),
        Err(error) => {
            let live = database_path(data_dir);
            let displaced = previous_path(data_dir);
            let message = if !live.exists() && displaced.exists() {
                match restore_sqlite_group(&displaced, &live) {
                    Ok(()) => format!("恢复未完成，已放回原库：{}", error.user_message()),
                    Err(rollback) => {
                        format!("恢复未完成，自动回滚失败（{rollback}）。请保留恢复文件。")
                    }
                }
            } else if !publication_path(data_dir).exists() {
                format!("恢复未执行，当前库没有改动：{}", error.user_message())
            } else {
                format!("恢复未执行完毕：{}", error.user_message())
            };
            if live.exists()
                && !displaced.exists()
                && data_dir.join("zepp.db.restore-staging").exists()
            {
                let _ = remove_if_present(&publication_path(data_dir));
            }
            let code = if !publication_path(data_dir).exists() && live.exists() {
                "err.backup.restore_failed"
            } else {
                error.code()
            };
            restore_fail(pending, message, code)
        }
    }
}

fn publish_restore(data_dir: &Path, pending: &PendingRestore) -> Result<()> {
    let live = database_path(data_dir);
    let staging = data_dir.join("zepp.db.restore-staging");
    let displaced = previous_path(data_dir);
    let publication = publication_path(data_dir);
    let existing = match std::fs::read(&publication) {
        Ok(bytes) => Some(
            serde_json::from_slice::<RestorePublication>(&bytes)
                .map_err(|error| ZeppBridgeError::ParseError(error.to_string()))?,
        ),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
        Err(error) => return Err(error.into()),
    };

    if let Some(existing) = existing {
        if existing.pending != *pending {
            return Err(ZeppBridgeError::DataUnavailable(
                "恢复状态与排队的备份不一致".into(),
            ));
        }
        if !staging.exists() && live.exists() && file_sha256(&live)? == existing.sha256 {
            if SQLITE_SIDECARS
                .iter()
                .any(|suffix| sidecar(&live, suffix).exists())
            {
                return Err(ZeppBridgeError::DataUnavailable(
                    "恢复目标仍有 SQLite 日志。请保留当前库及恢复副本。".into(),
                ));
            }
            return finish_restore(data_dir, &displaced, &publication);
        }
    }

    let verification = verify_backup(data_dir, &pending.backup_id)?;
    if !verification.is_usable() {
        return Err(ZeppBridgeError::DataUnavailable(
            verification
                .problem
                .unwrap_or_else(|| "备份未通过校验".into()),
        ));
    }
    let manifest = load_manifest(data_dir, &pending.backup_id)?;

    // 旧版本可能已经换入快照，但还没清掉待办。存在旧 WAL 时仍走下面的搬移流程。
    if !publication.exists()
        && displaced.exists()
        && live.exists()
        && SQLITE_SIDECARS
            .iter()
            .all(|suffix| !sidecar(&live, suffix).exists())
        && file_sha256(&live)? == manifest.sha256
        && manifest.schema_version == CURRENT_SCHEMA_VERSION
    {
        return finish_restore(data_dir, &displaced, &publication);
    }

    // 在临时库里完成迁移。迁移失败时，当前数据库和 WAL 都还在原处。
    remove_sqlite_group(&staging)?;
    std::fs::copy(snapshot_path(data_dir, &pending.backup_id), &staging)?;
    if file_sha256(&staging)? != manifest.sha256 {
        return Err(ZeppBridgeError::DataUnavailable(
            "恢复临时文件的校验值不匹配".into(),
        ));
    }
    let db = Database::from_connection(rusqlite::Connection::open(&staging)?)?;
    let integrity: String = db
        .conn
        .query_row("PRAGMA integrity_check(1)", [], |row| row.get(0))?;
    if !integrity.eq_ignore_ascii_case("ok") {
        return Err(ZeppBridgeError::DataUnavailable(
            "恢复临时文件没有通过完整性检查".into(),
        ));
    }
    let journal: String = db
        .conn
        .query_row("PRAGMA journal_mode=DELETE", [], |row| row.get(0))?;
    if !journal.eq_ignore_ascii_case("delete") {
        return Err(ZeppBridgeError::DataUnavailable(
            "无法将恢复临时库合并为单一文件".into(),
        ));
    }
    drop(db);
    std::fs::OpenOptions::new()
        .write(true)
        .open(&staging)?
        .sync_all()?;
    let state = RestorePublication {
        pending: pending.clone(),
        sha256: file_sha256(&staging)?,
    };
    let bytes = serde_json::to_vec(&state)
        .map_err(|error| ZeppBridgeError::ParseError(error.to_string()))?;
    crate::paths::write_file_atomically(&publication, &bytes)?;

    if live.exists() && displaced.exists() {
        return Err(ZeppBridgeError::DataUnavailable(
            "无法确认上一次恢复的状态。请保留当前库及恢复副本。".into(),
        ));
    }
    if let Err(error) =
        displace_sqlite_group(&live, &displaced).and_then(|()| std::fs::rename(&staging, &live))
    {
        if let Err(rollback) = restore_sqlite_group(&displaced, &live) {
            return Err(ZeppBridgeError::DataUnavailable(format!(
                "换入备份失败（{error}），自动回滚也失败（{rollback}）。请保留恢复过程中生成的数据库文件。"
            )));
        }
        return Err(error.into());
    }
    finish_restore(data_dir, &displaced, &publication)
}

fn finish_restore(data_dir: &Path, displaced: &Path, publication: &Path) -> Result<()> {
    // 消费待办后，新库可以继续写；清理失败只会多留一个旧库副本。
    remove_if_present(&data_dir.join(PENDING_RESTORE_FILE))?;
    let _ = remove_sqlite_group(displaced);
    let _ = remove_if_present(publication);
    Ok(())
}

pub(super) const SQLITE_SIDECARS: [&str; 2] = ["-wal", "-shm"];

pub(super) fn sidecar(path: &Path, suffix: &str) -> PathBuf {
    let mut name = path.as_os_str().to_os_string();
    name.push(suffix);
    PathBuf::from(name)
}

fn move_sidecars(from: &Path, to: &Path) -> std::io::Result<()> {
    for suffix in SQLITE_SIDECARS {
        let from = sidecar(from, suffix);
        let to = sidecar(to, suffix);
        if from.try_exists()? {
            if to.try_exists()? {
                return Err(std::io::Error::new(
                    std::io::ErrorKind::AlreadyExists,
                    "SQLite sidecar already exists",
                ));
            }
            std::fs::rename(from, to)?;
        }
    }
    Ok(())
}

pub(super) fn displace_sqlite_group(live: &Path, displaced: &Path) -> std::io::Result<()> {
    if live.try_exists()? {
        std::fs::rename(live, displaced)?;
    }
    // 主库刚改名就中断时，重启从这里搬完原库的日志再换入新库。
    move_sidecars(live, displaced)
}

pub(super) fn restore_sqlite_group(displaced: &Path, live: &Path) -> std::io::Result<()> {
    if displaced.try_exists()? {
        move_sidecars(displaced, live)?;
        std::fs::rename(displaced, live)?;
    }
    Ok(())
}

pub(super) fn remove_sqlite_group(path: &Path) -> std::io::Result<()> {
    remove_if_present(path)?;
    for suffix in SQLITE_SIDECARS {
        remove_if_present(&sidecar(path, suffix))?;
    }
    Ok(())
}
