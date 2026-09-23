//! 数据库快照、校验与恢复。
//!
//! 三条不能省的规则：
//!
//! 1. **快照必须走 SQLite Backup API。** 直接复制正在使用的 `zepp.db` 会漏掉
//!    还在 WAL 里的事务，拷出来的文件可能根本打不开；即使打得开，它也不是任何
//!    一个时间点的一致状态。
//! 2. **声称成功之前必须验证。** 每份快照生成后立刻跑 `integrity_check` 并算
//!    SHA-256 写进 manifest。校验没过的快照不会出现在可恢复列表里 —— 一份
//!    坏掉却显示「备份成功」的快照，比没有备份更危险。
//! 3. **恢复是原子替换，失败必须回到原库。** 恢复在下次启动、任何连接打开
//!    之前执行：先给当前库做回滚快照，再把候选拷到临时文件、校验、原子换名。
//!    任何一步失败都换回原库，不留半个状态。
//!
//! 恢复之所以推迟到启动时，是因为运行中的应用、同步线程和本机 API 都各自持有
//! 连接。与其在一堆打开的句柄之间抢文件，不如在还没有任何连接的时刻做替换。

use super::write_lock::{self, WritePurpose};
use super::{Database, CURRENT_SCHEMA_VERSION, NORMALIZER_REVISION};
use crate::models::{error::Result, ZeppBridgeError};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

pub const BACKUP_DIR: &str = "backups";
const PENDING_RESTORE_FILE: &str = "restore-pending.json";
/// 迁移前备份滚动保留几份。够回到几个版本以前，又不会把磁盘吃光。
pub const MIGRATION_BACKUP_KEEP: usize = 5;
/// manifest 里统计哪几张表。顺序固定，便于 diff。
const COUNTED_TABLES: [&str; 7] = [
    "raw_records",
    "metric_samples",
    "daily_metrics",
    "sleep_sessions",
    "workouts",
    "workout_samples",
    "life_events",
];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BackupKind {
    /// 用户主动生成。
    Manual,
    /// schema 迁移前自动生成。
    PreMigration,
    /// 恢复前给当前库留的回滚快照。
    PreRestore,
}

impl BackupKind {
    fn prefix(self) -> &'static str {
        match self {
            BackupKind::Manual => "manual",
            BackupKind::PreMigration => "pre-migration",
            BackupKind::PreRestore => "pre-restore",
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            BackupKind::Manual => "手动备份",
            BackupKind::PreMigration => "升级前自动备份",
            BackupKind::PreRestore => "恢复前回滚备份",
        }
    }
}

/// 快照覆盖的健康数据范围。用户看「这份备份里有哪段时间的数据」。
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct BackupCoverage {
    pub earliest_sample_at: Option<String>,
    pub latest_sample_at: Option<String>,
    pub last_cloud_sync_at: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct BackupManifest {
    /// 文件名主干，同时是恢复时的标识。
    pub id: String,
    pub created_at: String,
    pub app_version: String,
    pub schema_version: i64,
    pub normalizer_revision: String,
    pub kind: BackupKind,
    pub coverage: BackupCoverage,
    pub table_counts: BTreeMap<String, i64>,
    pub bytes: u64,
    pub sha256: String,
    /// 生成后立刻验证的结果。为 false 的快照不会进入可恢复列表。
    pub integrity_ok: bool,
    /// 用户标记「不要自动清理」。滚动清理永远跳过它。
    #[serde(default)]
    pub pinned: bool,
}

/// 校验一份已有快照的结论。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct BackupVerification {
    pub id: String,
    pub file_present: bool,
    pub bytes_match: bool,
    pub sha256_match: bool,
    pub integrity_ok: bool,
    /// 中文原文。界面优先用 `problem_code`，取不到才显示它。
    pub problem: Option<String>,
    /// 失败原因的稳定码。界面按它取自己语言的说法。
    #[serde(default)]
    pub problem_code: Option<String>,
}

impl BackupVerification {
    pub fn is_usable(&self) -> bool {
        self.file_present && self.bytes_match && self.sha256_match && self.integrity_ok
    }
}

/// 恢复兼容性判断。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RestoreCompatibility {
    /// schema 与当前一致，可直接恢复。
    SameSchema,
    /// 比当前旧，恢复后会正向迁移。
    OlderSchemaWillMigrate,
    /// 比当前新：这份快照来自更新版本的 ZeppBridge。降级打开会静默丢字段，
    /// 所以直接拒绝，并且完全不碰当前库。
    FutureSchemaRefused,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RestorePreview {
    pub manifest: BackupManifest,
    pub verification: BackupVerification,
    pub compatibility: RestoreCompatibility,
    pub current_schema_version: i64,
    /// 当前库各表的记录数，和快照并排给用户看差异。
    pub current_table_counts: BTreeMap<String, i64>,
    /// 可以恢复吗；不行时 `blocker` 说明原因。
    pub can_restore: bool,
    pub blocker: Option<String>,
}

/// 已排队、等下次启动执行的恢复。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PendingRestore {
    pub backup_id: String,
    pub staged_at: String,
    /// 恢复前给当前库留的回滚快照 id。
    pub rollback_backup_id: String,
}

/// 恢复实际执行后的结果，供启动路径显示给用户。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RestoreOutcome {
    pub backup_id: String,
    pub rollback_backup_id: String,
    pub succeeded: bool,
    pub message: String,
    /// `message` 的稳定码。启动路径目前展示原文兜底。
    #[serde(default)]
    pub message_code: Option<String>,
}

pub fn backup_dir(data_dir: &Path) -> PathBuf {
    data_dir.join(BACKUP_DIR)
}

/// 备份 id 的合法形状。
///
/// 生成规则是 `<prefix>-<UTC 时间戳>`（见 `create_backup`），所以真实的 id
/// 只会用到字母、数字、`-` 和 `_`。
///
/// 校验它不是因为现在有人能传坏值——id 目前全部来自我们自己列目录的结果。
/// 是因为它最终会被拼进文件路径（`{id}.db` / `{id}.json`）：哪天渲染进程被
/// 攻破，或者某个新入口把用户输入接到这里，`../../` 就直接落在磁盘上了。
/// 这一层挡的是那一天。
fn validate_backup_id(id: &str) -> Result<()> {
    let ok = !id.is_empty()
        && id.len() <= 128
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_'));
    if ok {
        Ok(())
    } else {
        Err(ZeppBridgeError::ConfigError("备份 ID 无效".into()))
    }
}

fn snapshot_path(data_dir: &Path, id: &str) -> PathBuf {
    backup_dir(data_dir).join(format!("{id}.db"))
}

fn manifest_path(data_dir: &Path, id: &str) -> PathBuf {
    backup_dir(data_dir).join(format!("{id}.json"))
}

fn database_path(data_dir: &Path) -> PathBuf {
    data_dir.join("zepp.db")
}

/// 生成一份一致性快照。
///
/// 用 SQLite Backup API 从源库拷到新文件，然后立刻验证并写 manifest。
/// 校验不过就把半成品删掉并报错，绝不留下一份看起来成功的坏备份。
pub fn create_backup(
    data_dir: &Path,
    kind: BackupKind,
    app_version: &str,
) -> Result<BackupManifest> {
    let source_path = database_path(data_dir);
    if !source_path.exists() {
        return Err(ZeppBridgeError::DataUnavailable(
            "本机还没有数据库，没有可备份的内容".into(),
        ));
    }
    let dir = backup_dir(data_dir);
    std::fs::create_dir_all(&dir)?;

    let created_at = Utc::now();
    let id = format!(
        "{}-{}",
        kind.prefix(),
        created_at.format("%Y%m%dT%H%M%S%3fZ")
    );
    let target = snapshot_path(data_dir, &id);

    let result = (|| -> Result<BackupManifest> {
        let source = rusqlite::Connection::open(&source_path)?;
        {
            let mut destination = rusqlite::Connection::open(&target)?;
            let backup = rusqlite::backup::Backup::new(&source, &mut destination)?;
            // 一次拷完（nPage 给一个大于任何真实库页数的值）。分步拷会在源库
            // 被写入时重启整个拷贝，对一个刚拿到写锁的调用方来说没有意义，
            // 还会让大库的耗时变得不可预测。
            backup.run_to_completion(i32::MAX, std::time::Duration::ZERO, None)?;
        }

        let snapshot = Database::open_read_only_any_version(target.clone())?;
        let first: String = snapshot
            .conn
            .query_row("PRAGMA integrity_check(1)", [], |row| row.get(0))?;
        let integrity_ok = first.eq_ignore_ascii_case("ok");
        if !integrity_ok {
            return Err(ZeppBridgeError::DataUnavailable(format!(
                "生成的备份没有通过完整性检查：{first}"
            )));
        }
        let schema_version: i64 = snapshot
            .conn
            .query_row("PRAGMA user_version", [], |row| row.get(0))?;
        let mut table_counts = BTreeMap::new();
        for table in COUNTED_TABLES {
            let count: i64 = snapshot
                .conn
                .query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |row| {
                    row.get(0)
                })
                .unwrap_or(0);
            table_counts.insert(table.to_string(), count);
        }
        let coverage = BackupCoverage {
            earliest_sample_at: snapshot
                .conn
                .query_row("SELECT MIN(start_utc) FROM raw_records", [], |row| {
                    row.get(0)
                })
                .unwrap_or(None),
            latest_sample_at: snapshot
                .conn
                .query_row("SELECT MAX(start_utc) FROM raw_records", [], |row| {
                    row.get(0)
                })
                .unwrap_or(None),
            last_cloud_sync_at: snapshot
                .cloud_sync_metadata()
                .map(|(at, _)| at)
                .unwrap_or(None),
        };
        let normalizer_revision = snapshot
            .conn
            .query_row(
                "SELECT value FROM app_meta WHERE key = 'normalizer_revision'",
                [],
                |row| row.get::<_, String>(0),
            )
            .unwrap_or_else(|_| NORMALIZER_REVISION.to_string());
        drop(snapshot);

        let bytes = std::fs::metadata(&target)?.len();
        let sha256 = file_sha256(&target)?;
        let manifest = BackupManifest {
            id: id.clone(),
            created_at: created_at.to_rfc3339(),
            app_version: app_version.to_string(),
            schema_version,
            normalizer_revision,
            kind,
            coverage,
            table_counts,
            bytes,
            sha256,
            integrity_ok,
            pinned: false,
        };
        write_manifest(data_dir, &manifest)?;
        Ok(manifest)
    })();

    if result.is_err() {
        // 半成品不能留在备份目录里冒充可用快照。
        let _ = std::fs::remove_file(&target);
        let _ = std::fs::remove_file(manifest_path(data_dir, &id));
    }
    result
}

fn write_manifest(data_dir: &Path, manifest: &BackupManifest) -> Result<()> {
    validate_backup_id(&manifest.id)?;
    let encoded = serde_json::to_vec_pretty(manifest)
        .map_err(|error| ZeppBridgeError::ParseError(format!("无法生成备份清单: {error}")))?;
    std::fs::write(manifest_path(data_dir, &manifest.id), encoded)?;
    Ok(())
}

pub fn file_sha256(path: &Path) -> Result<String> {
    use std::io::Read;
    let mut file = std::fs::File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0u8; 64 * 1024];
    loop {
        let read = file.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(hex::encode(hasher.finalize()))
}

/// 列出所有快照，最新的在前。读不出 manifest 的文件直接跳过。
pub fn list_backups(data_dir: &Path) -> Result<Vec<BackupManifest>> {
    let dir = backup_dir(data_dir);
    if !dir.exists() {
        return Ok(Vec::new());
    }
    let mut out = Vec::new();
    for entry in std::fs::read_dir(&dir)? {
        let entry = entry?;
        let path = entry.path();
        if path.extension().and_then(|value| value.to_str()) != Some("json") {
            continue;
        }
        let Ok(text) = std::fs::read_to_string(&path) else {
            continue;
        };
        let Ok(manifest) = serde_json::from_str::<BackupManifest>(&text) else {
            continue;
        };
        if validate_backup_id(&manifest.id).is_err()
            || path.file_stem().and_then(|value| value.to_str()) != Some(manifest.id.as_str())
        {
            continue;
        }
        out.push(manifest);
    }
    out.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(out)
}

pub fn load_manifest(data_dir: &Path, id: &str) -> Result<BackupManifest> {
    validate_backup_id(id)?;
    let text = std::fs::read_to_string(manifest_path(data_dir, id))?;
    let manifest: BackupManifest = serde_json::from_str(&text)
        .map_err(|error| ZeppBridgeError::ParseError(format!("备份清单无法解析: {error}")))?;
    validate_backup_id(&manifest.id)?;
    if manifest.id != id {
        return Err(ZeppBridgeError::ConfigError("备份 ID 无效".into()));
    }
    Ok(manifest)
}

/// 用户标记 / 取消标记「不要自动清理」。
///
/// 改的是清单文件，必须拿写锁：否则一次清理正在按「未钉住」删快照的同时，
/// 界面把同一份钉住，两边看到的是两份不同的名单。
pub fn set_pinned(data_dir: &Path, id: &str, pinned: bool) -> Result<BackupManifest> {
    let _guard = write_lock::try_acquire(data_dir, WritePurpose::Backup).map_err(map_write_lock)?;
    set_pinned_unlocked(data_dir, id, pinned)
}

/// 调用方已经持有写锁时用（Tauri 命令层）。
pub fn set_pinned_unlocked(data_dir: &Path, id: &str, pinned: bool) -> Result<BackupManifest> {
    validate_backup_id(id)?;
    let mut manifest = load_manifest(data_dir, id)?;
    manifest.pinned = pinned;
    write_manifest(data_dir, &manifest)?;
    Ok(manifest)
}

fn map_write_lock(error: write_lock::WriteLockError) -> ZeppBridgeError {
    match error {
        write_lock::WriteLockError::Busy { .. } => ZeppBridgeError::Busy(error.to_string()),
        other => ZeppBridgeError::ConfigError(other.to_string()),
    }
}

/// 重新校验一份快照：文件在不在、大小对不对、SHA-256 对不对、能不能通过
/// `integrity_check`。
pub fn verify_backup(data_dir: &Path, id: &str) -> Result<BackupVerification> {
    validate_backup_id(id)?;
    let manifest = load_manifest(data_dir, id)?;
    let path = snapshot_path(data_dir, id);
    if !path.exists() {
        return Ok(BackupVerification {
            id: id.to_string(),
            file_present: false,
            bytes_match: false,
            sha256_match: false,
            integrity_ok: false,
            problem: Some("备份文件已不在备份目录中".into()),
            problem_code: Some("ui.backup.file_missing".into()),
        });
    }
    let bytes = std::fs::metadata(&path)?.len();
    let bytes_match = bytes == manifest.bytes;
    let sha256 = file_sha256(&path)?;
    let sha256_match = sha256 == manifest.sha256;
    // 内容对不上时不要再去打开它：SQLite 打开一个被截断的文件可能返回一个
    // 看似正常的空库，那会让「校验失败」变成「校验通过但没有数据」。
    let integrity_ok = if bytes_match && sha256_match {
        match Database::open_read_only_any_version(path.clone()) {
            Ok(db) => db
                .conn
                .query_row("PRAGMA integrity_check(1)", [], |row| {
                    row.get::<_, String>(0)
                })
                .map(|value| value.eq_ignore_ascii_case("ok"))
                .unwrap_or(false),
            Err(_) => false,
        }
    } else {
        false
    };
    let (problem_code, problem): (Option<&str>, Option<String>) = if !bytes_match {
        (
            Some("ui.backup.size_mismatch"),
            Some("备份文件大小和清单不一致，可能已损坏".into()),
        )
    } else if !sha256_match {
        (
            Some("ui.backup.sha256_mismatch"),
            Some("备份文件的 SHA-256 和清单不一致，可能已损坏或被修改".into()),
        )
    } else if !integrity_ok {
        (
            Some("ui.backup.integrity_failed"),
            Some("备份文件没有通过 SQLite 完整性检查".into()),
        )
    } else {
        (None, None)
    };
    Ok(BackupVerification {
        id: id.to_string(),
        file_present: true,
        bytes_match,
        sha256_match,
        integrity_ok,
        problem,
        problem_code: problem_code.map(str::to_string),
    })
}

/// 滚动清理迁移前备份，只保留最近 [`MIGRATION_BACKUP_KEEP`] 份。
///
/// 手动备份和用户标记保留的快照永远不删 —— 自动清理删掉用户自己存的备份，
/// 是这类功能最不可原谅的行为。
pub fn prune_migration_backups(data_dir: &Path) -> Result<Vec<String>> {
    let all = list_backups(data_dir)?;
    let mut candidates: Vec<&BackupManifest> = all
        .iter()
        .filter(|manifest| manifest.kind == BackupKind::PreMigration && !manifest.pinned)
        .collect();
    candidates.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    let mut removed = Vec::new();
    for manifest in candidates.into_iter().skip(MIGRATION_BACKUP_KEEP) {
        let _ = std::fs::remove_file(snapshot_path(data_dir, &manifest.id));
        let _ = std::fs::remove_file(manifest_path(data_dir, &manifest.id));
        removed.push(manifest.id.clone());
    }
    Ok(removed)
}

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

fn current_schema_version(data_dir: &Path) -> i64 {
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

fn apply_pending_restore_locked(data_dir: &Path, pending: &PendingRestore) -> RestoreOutcome {
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

fn restore_fail(pending: &PendingRestore, message: String, code: &str) -> RestoreOutcome {
    RestoreOutcome {
        backup_id: pending.backup_id.clone(),
        rollback_backup_id: pending.rollback_backup_id.clone(),
        succeeded: false,
        message,
        message_code: Some(code.to_string()),
    }
}

fn restore_ok(pending: &PendingRestore, message: String) -> RestoreOutcome {
    RestoreOutcome {
        backup_id: pending.backup_id.clone(),
        rollback_backup_id: pending.rollback_backup_id.clone(),
        succeeded: true,
        message,
        message_code: None,
    }
}

#[cfg(test)]
fn run_restore(data_dir: &Path, pending: &PendingRestore) -> RestoreOutcome {
    match swap_in_restore(data_dir, pending) {
        Err(outcome) => outcome,
        Ok(displaced) => finish_restore(data_dir, pending, displaced),
    }
}

fn swap_in_restore(
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
fn rollback_swapped_library(live: &Path, displaced: &Path) -> bool {
    remove_sqlite_group(live);
    restore_sqlite_group(displaced, live).is_ok()
}

fn finish_restore(data_dir: &Path, pending: &PendingRestore, displaced: PathBuf) -> RestoreOutcome {
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
const SQLITE_SIDECARS: [&str; 2] = ["-wal", "-shm"];

fn sidecar(path: &Path, suffix: &str) -> PathBuf {
    let mut name = path.as_os_str().to_os_string();
    name.push(suffix);
    PathBuf::from(name)
}

fn live_matches_backup_snapshot(data_dir: &Path, pending: &PendingRestore, live: &Path) -> bool {
    let Ok(manifest) = load_manifest(data_dir, &pending.backup_id) else {
        return false;
    };
    file_sha256(live)
        .ok()
        .is_some_and(|hash| hash == manifest.sha256)
}

/// 把占着 `displaced` 名字的上一轮残骸挪到旁边，不删除。
fn park_sqlite_group(from: &Path, stale: &Path) -> std::io::Result<()> {
    if stale.exists() {
        remove_sqlite_group(stale);
    }
    displace_sqlite_group(from, stale)
}

/// 把 `live` 及其 `-wal` / `-shm` 整组挪到 `displaced` 及其同名 sidecar。
///
/// 主库挪失败就直接返回错误，一个 sidecar 都不动；sidecar 挪失败同样返回错误，
/// 由调用方回滚。绝不 `let _ =` 吞掉——吞掉正是旧实现出问题的地方。
fn displace_sqlite_group(live: &Path, displaced: &Path) -> std::io::Result<()> {
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
fn restore_sqlite_group(displaced: &Path, live: &Path) -> std::io::Result<()> {
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
fn remove_sqlite_group(path: &Path) {
    let _ = std::fs::remove_file(path);
    for suffix in SQLITE_SIDECARS {
        let _ = std::fs::remove_file(sidecar(path, suffix));
    }
}

#[cfg(test)]
mod tests {
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
}

#[cfg(test)]
mod backup_id_tests {
    use super::*;

    #[test]
    fn a_traversing_backup_id_is_rejected_before_it_reaches_the_filesystem() {
        for bad in [
            "",
            "../../etc/passwd",
            r"..\..\windows\system32",
            "auto-2026/09/01",
            "auto 2026",
            "auto-2026\0",
        ] {
            assert!(
                validate_backup_id(bad).is_err(),
                "{bad:?} 不该被当成合法备份 ID"
            );
        }
        // 真实生成的形状必须仍然合法，否则这道校验会把备份功能整个关掉。
        assert!(validate_backup_id("auto-20260901T124736123Z").is_ok());
        assert!(validate_backup_id("manual-20260901T124736123Z").is_ok());
    }
}
