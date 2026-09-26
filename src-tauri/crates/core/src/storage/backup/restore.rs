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
    std::fs::write(data_dir.join(PENDING_RESTORE_FILE), encoded)?;
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

/// 调用方已经持有写锁时用。成功恢复清排队文件也走这里（锁已放下）。
pub fn cancel_pending_restore_unlocked(data_dir: &Path) -> Result<()> {
    let path = data_dir.join(PENDING_RESTORE_FILE);
    if path.exists() {
        std::fs::remove_file(path)?;
    }
    Ok(())
}

/// 在任何连接打开之前执行排队的恢复。
///
/// 步骤：拿恢复写锁 → 再校验一次 → 拷到临时文件 → 校验临时文件 → 原子换名
/// → 清掉旧 WAL/SHM。失败**不**删除排队文件，下次启动再试。
pub fn apply_pending_restore(data_dir: &Path) -> Option<RestoreOutcome> {
    let pending = pending_restore(data_dir)?;
    let outcome = apply_pending_restore_locked(data_dir, &pending);
    if outcome.succeeded {
        // 写锁已经在 `apply_pending_restore_locked` 里放下了（`open_resilient`
        // 自己还要拿迁移锁，同一把不可重入）。这里只清排队文件。
        let _ = cancel_pending_restore_unlocked(data_dir);
    }
    Some(outcome)
}

pub(super) fn apply_pending_restore_locked(
    data_dir: &Path,
    pending: &PendingRestore,
) -> RestoreOutcome {
    let guard = match write_lock::try_acquire(data_dir, WritePurpose::Restore) {
        Ok(guard) => guard,
        Err(write_lock::WriteLockError::Busy { holder }) => {
            let who = holder.unwrap_or_else(|| "另一个写入操作".to_string());
            return restore_fail(
                pending,
                format!("恢复还没有执行，当前库没有改动：{who}正在进行。下次启动会再试。"),
                "err.backup.restore_busy",
            );
        }
        Err(write_lock::WriteLockError::Unavailable(error)) => {
            return restore_fail(
                pending,
                format!(
                    "恢复还没有执行，当前库没有改动：无法建立写入锁（{error}）。下次启动会再试。"
                ),
                "err.storage.write_lock_unavailable",
            );
        }
    };
    // 换文件必须在锁内。`open_resilient` 自己还要拿迁移锁，同一把文件锁
    // 不可重入，所以打开/迁移确认放在释放之后。
    let swapped = swap_in_restore(data_dir, pending);
    drop(guard);
    match swapped {
        Err(outcome) => outcome,
        Ok(displaced) => finish_restore(data_dir, pending, displaced),
    }
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

#[cfg(test)]
pub(super) fn run_restore(data_dir: &Path, pending: &PendingRestore) -> RestoreOutcome {
    match swap_in_restore(data_dir, pending) {
        Err(outcome) => outcome,
        Ok(displaced) => finish_restore(data_dir, pending, displaced),
    }
}

pub(super) fn swap_in_restore(
    data_dir: &Path,
    pending: &PendingRestore,
) -> std::result::Result<PathBuf, RestoreOutcome> {
    let fail = |message: String, code: &str| Err(restore_fail(pending, message, code));

    match verify_backup(data_dir, &pending.backup_id) {
        Ok(verification) if verification.is_usable() => {}
        Ok(verification) => {
            return fail(
                format!(
                    "恢复未执行，当前库没有改动：{}",
                    verification
                        .problem
                        .unwrap_or_else(|| "备份未通过校验".into())
                ),
                verification
                    .problem_code
                    .as_deref()
                    .unwrap_or("err.backup.restore_failed"),
            );
        }
        Err(error) => {
            return fail(
                format!("恢复未执行，当前库没有改动：{}", error.user_message()),
                error.code(),
            );
        }
    }

    let live = database_path(data_dir);
    let staging = data_dir.join("zepp.db.restore-staging");
    let displaced = data_dir.join("zepp.db.restore-previous");
    let stale = data_dir.join("zepp.db.restore-previous.stale");
    // 临时拷贝可以丢。`displaced` 是上一轮挪开的原库，校验通过之前绝不能删：
    // 中途崩溃后再启动如果先删它，原库就只剩这份半成品了。
    remove_sqlite_group(&staging);

    if displaced.exists() && live.exists() && live_matches_backup_snapshot(data_dir, pending, &live)
    {
        // 上一轮已经换上备份、还没跑完 `open_resilient`。接着完成即可。
        return Ok(displaced);
    }

    if let Err(error) = std::fs::copy(snapshot_path(data_dir, &pending.backup_id), &staging) {
        let _ = std::fs::remove_file(&staging);
        return fail(
            format!("恢复未执行，当前库没有改动：无法准备临时文件（{error}）"),
            "err.backup.restore_failed",
        );
    }
    // 换上去之前先确认这个临时文件真的能打开、真的完整。
    let staged_check = Database::open_read_only_any_version(staging.clone()).and_then(|db| {
        Database::reject_newer_schema(&db.conn)?;
        let integrity: String = db
            .conn
            .query_row("PRAGMA integrity_check(1)", [], |row| row.get(0))?;
        if !integrity.eq_ignore_ascii_case("ok") {
            return Err(ZeppBridgeError::DataUnavailable(
                "临时文件没有通过完整性检查".into(),
            ));
        }
        Ok(())
    });
    if let Err(error) = staged_check {
        let _ = std::fs::remove_file(&staging);
        return fail(
            format!("恢复未执行，当前库没有改动：{}", error.user_message()),
            error.code(),
        );
    }

    // 原子换名。先把现库挪开而不是直接删，这样中途失败还能换回来。
    //
    // `.db` / `.db-wal` / `.db-shm` 必须当**一组**挪走，而且要在新库换上去
    // **之前**。旧的 WAL 属于被替换掉的那个库文件：留在原地的话，新库一被
    // 打开，SQLite 就会把旧库的脏页重放进来，直接损坏 B-Tree。
    //
    // 之前的顺序是「挪走 .db → 换上新库 → 才去删 -wal / -shm」，而且两个删除
    // 都是 `let _ =` 吞掉错误。在 Windows 上句柄没释放导致删除失败，或者在
    // 这两步之间断电，就正好落进上面那个损坏场景。
    //
    // 挪去 `displaced` 旁边而不是直接删，回滚时才能拿回配套的 WAL。
    // 上一轮回滚留下的 `displaced` 占着这个名字时，挪到 `.stale` 而不是删：
    // 删是在校验之前做的，中途失败会把原库弄丢。
    if displaced.exists() && live.exists() {
        if let Err(error) = park_sqlite_group(&displaced, &stale) {
            let _ = std::fs::remove_file(&staging);
            return fail(
                format!("恢复未执行，当前库没有改动：无法移开上次留下的原库（{error}）"),
                "err.backup.restore_failed",
            );
        }
    }
    if live.exists() {
        if let Err(error) = displace_sqlite_group(&live, &displaced) {
            let _ = restore_sqlite_group(&displaced, &live);
            let _ = std::fs::remove_file(&staging);
            return fail(
                format!("恢复未执行，当前库没有改动：无法移开当前库（{error}）"),
                "err.backup.restore_failed",
            );
        }
    }
    if let Err(error) = std::fs::rename(&staging, &live) {
        // 换不上去就把原库连同它的 WAL 一起放回原位。
        let _ = restore_sqlite_group(&displaced, &live);
        let _ = std::fs::remove_file(&staging);
        return fail(
            format!("恢复失败，已换回原来的数据库：{error}"),
            "err.backup.restore_failed",
        );
    }

    Ok(displaced)
}

/// 把 `live` 换回 `displaced` 里的原库。返回换回是否真的成功——调用方必须
/// 用这个结果决定给用户的话，不能假定「删了就等于换回来了」。
#[must_use]
pub(super) fn rollback_swapped_library(live: &Path, displaced: &Path) -> bool {
    remove_sqlite_group(live);
    restore_sqlite_group(displaced, live).is_ok()
}

pub(super) fn finish_restore(
    data_dir: &Path,
    pending: &PendingRestore,
    displaced: PathBuf,
) -> RestoreOutcome {
    let live = database_path(data_dir);
    // 换上来的库可能来自更旧的 schema：正常打开一次让迁移跑完。失败就整体回滚。
    // 警告不能吞：隔离并重建空库会被当成「恢复成功」。
    match Database::open_resilient(live.clone()) {
        Ok((_, None)) => {
            remove_sqlite_group(&displaced);
            remove_sqlite_group(&data_dir.join("zepp.db.restore-previous.stale"));
            restore_ok(
                pending,
                "已从备份恢复。恢复前的数据库已存为回滚备份，可以再换回去。".into(),
            )
        }
        Ok((_, Some(warning))) => {
            let message = if rollback_swapped_library(&live, &displaced) {
                format!("恢复失败，已换回原来的数据库：{warning}")
            } else {
                format!(
                    "恢复失败，且未能自动换回原来的数据库（{warning}）。原数据库文件仍完整保留在 {}，请勿删除，可联系支持或手动换回。",
                    displaced.display()
                )
            };
            restore_fail(pending, message, "err.backup.restore_failed")
        }
        Err(error) => {
            // 换上来的库自己也可能留下 WAL/SHM（`open_resilient` 走到一半就
            // 会），回滚前必须一并清掉，否则原库换回来又要重放别人的日志。
            let message = if rollback_swapped_library(&live, &displaced) {
                format!("恢复失败，已换回原来的数据库：{}", error.user_message())
            } else {
                format!(
                    "恢复失败，且未能自动换回原来的数据库（{}）。原数据库文件仍完整保留在 {}，请勿删除，可联系支持或手动换回。",
                    error.user_message(),
                    displaced.display()
                )
            };
            restore_fail(pending, message, error.code())
        }
    }
}

/// SQLite 一个库在磁盘上的三个文件后缀。WAL 模式下它们必须同进同出。
pub(super) const SQLITE_SIDECARS: [&str; 2] = ["-wal", "-shm"];

pub(super) fn sidecar(path: &Path, suffix: &str) -> PathBuf {
    let mut name = path.as_os_str().to_os_string();
    name.push(suffix);
    PathBuf::from(name)
}

pub(super) fn live_matches_backup_snapshot(
    data_dir: &Path,
    pending: &PendingRestore,
    live: &Path,
) -> bool {
    let Ok(manifest) = load_manifest(data_dir, &pending.backup_id) else {
        return false;
    };
    file_sha256(live)
        .ok()
        .is_some_and(|hash| hash == manifest.sha256)
}

/// 把占着 `displaced` 名字的上一轮残骸挪到旁边，不删除。
pub(super) fn park_sqlite_group(from: &Path, stale: &Path) -> std::io::Result<()> {
    if stale.exists() {
        remove_sqlite_group(stale);
    }
    displace_sqlite_group(from, stale)
}

/// 把 `live` 及其 `-wal` / `-shm` 整组挪到 `displaced` 及其同名 sidecar。
///
/// 主库挪失败就直接返回错误，一个 sidecar 都不动；sidecar 挪失败同样返回错误，
/// 由调用方回滚。绝不 `let _ =` 吞掉——吞掉正是旧实现出问题的地方。
pub(super) fn displace_sqlite_group(live: &Path, displaced: &Path) -> std::io::Result<()> {
    if !live.exists() {
        return Ok(());
    }
    std::fs::rename(live, displaced)?;
    for suffix in SQLITE_SIDECARS {
        let from = sidecar(live, suffix);
        if from.exists() {
            std::fs::rename(&from, sidecar(displaced, suffix))?;
        }
    }
    Ok(())
}

/// `displace_sqlite_group` 的逆操作，用于回滚。
pub(super) fn restore_sqlite_group(displaced: &Path, live: &Path) -> std::io::Result<()> {
    if !displaced.exists() {
        return Ok(());
    }
    std::fs::rename(displaced, live)?;
    for suffix in SQLITE_SIDECARS {
        let from = sidecar(displaced, suffix);
        if from.exists() {
            std::fs::rename(&from, sidecar(live, suffix))?;
        }
    }
    Ok(())
}

/// 删掉一个库连同它的 WAL / SHM。只在这三个文件确定该一起消失时用。
pub(super) fn remove_sqlite_group(path: &Path) {
    let _ = std::fs::remove_file(path);
    for suffix in SQLITE_SIDECARS {
        let _ = std::fs::remove_file(sidecar(path, suffix));
    }
}
