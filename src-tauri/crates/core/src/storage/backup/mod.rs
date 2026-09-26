use super::write_lock::{self, WritePurpose};

use super::{Database, CURRENT_SCHEMA_VERSION, NORMALIZER_REVISION};

use crate::models::{error::Result, ZeppBridgeError};

use chrono::Utc;

use serde::{Deserialize, Serialize};

use sha2::{Digest, Sha256};

use std::collections::BTreeMap;

use std::path::{Path, PathBuf};

mod restore;

pub use restore::*;

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

#[cfg(test)]
mod tests;

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
