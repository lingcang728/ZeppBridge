//! 打开、迁移、只读连接与损坏库的隔离（从 storage/mod.rs 按领域拆出，逻辑不变）。

use super::*;

pub fn is_corrupt_error(error: &ZeppBridgeError) -> bool {
    match error {
        ZeppBridgeError::DatabaseError(inner) => is_corrupt_sqlite(inner),
        other => looks_corrupt(&other.to_string()),
    }
}

pub(super) fn is_corrupt_sqlite(error: &rusqlite::Error) -> bool {
    match error {
        rusqlite::Error::SqliteFailure(code, message) => {
            matches!(
                code.code,
                rusqlite::ErrorCode::DatabaseCorrupt | rusqlite::ErrorCode::NotADatabase
            ) || message.as_deref().is_some_and(looks_corrupt)
        }
        other => looks_corrupt(&other.to_string()),
    }
}

pub(super) fn looks_corrupt(text: &str) -> bool {
    let lower = text.to_ascii_lowercase();
    lower.contains("malformed")
        || lower.contains("not a database")
        || lower.contains("database disk image")
        || lower.contains("file is not a database")
}

/// If the SQLite header claims more pages than the file actually has, rewrite
/// the page count. This is the usual leftover of a force-killed WAL checkpoint
/// or index rebuild.
pub(super) fn salvage_truncated_page_count(path: &Path) -> std::io::Result<bool> {
    use std::fs::OpenOptions;
    use std::io::{Read, Seek, SeekFrom, Write};

    let mut file = OpenOptions::new().read(true).write(true).open(path)?;
    let file_len = file.metadata()?.len();
    let mut header = [0u8; 100];
    if file.read(&mut header)? < 100 {
        return Ok(false);
    }
    if &header[0..16] != b"SQLite format 3\0" {
        return Ok(false);
    }
    let mut page_size = u16::from_be_bytes([header[16], header[17]]) as u64;
    if page_size == 1 {
        page_size = 65_536;
    }
    if page_size == 0 || file_len % page_size != 0 {
        return Ok(false);
    }
    let actual_pages = file_len / page_size;
    let claimed_pages = u32::from_be_bytes([header[28], header[29], header[30], header[31]]) as u64;
    if claimed_pages <= actual_pages || actual_pages == 0 {
        return Ok(false);
    }
    file.seek(SeekFrom::Start(28))?;
    file.write_all(&(u32::try_from(actual_pages).unwrap_or(u32::MAX)).to_be_bytes())?;
    file.flush()?;
    Ok(true)
}

impl Database {
    #[cfg(test)]
    pub fn new(db_path: PathBuf) -> Result<Self> {
        Self::open_migrated(&db_path)
    }

    /// Open the local library, repairing a truncated SQLite header when that is
    /// enough, or quarantining a still-unreadable file and starting empty.
    ///
    /// A malformed database must never fail process startup: Tauri treats a
    /// setup-hook error as a panic, which looks like a flash-crash from the
    /// desktop shortcut.
    pub fn open_resilient(db_path: PathBuf) -> Result<(Self, Option<String>)> {
        match Self::open_migrated(&db_path) {
            Ok(db) => Ok((db, None)),
            Err(error) if is_corrupt_error(&error) => {
                if salvage_truncated_page_count(&db_path).unwrap_or(false) {
                    match Self::open_migrated(&db_path) {
                        Ok(db) => {
                            return Ok((
                                db,
                                Some(
                                    "本地库文件被截断，已对齐页头。部分历史数据可能需要重新同步。"
                                        .into(),
                                ),
                            ));
                        }
                        Err(salvage_error) if is_corrupt_error(&salvage_error) => {}
                        Err(salvage_error) => return Err(salvage_error),
                    }
                }
                let quarantined = crate::paths::quarantine_sqlite_group(&db_path);
                let db = Self::open_migrated(&db_path)?;
                let warning = match quarantined {
                    Ok(dir) => format!(
                        "本地库已损坏，已隔离到 {} 并重建空库。请重新同步。",
                        dir.display()
                    ),
                    Err(_) => "本地库已损坏，已重建空库。请重新同步。".into(),
                };
                Ok((db, Some(warning)))
            }
            Err(error) => Err(error),
        }
    }

    /// 打开并迁移。失败就是失败——不做隔离重建。
    ///
    /// `open_resilient` 会在损坏时隔离旧库并重建一个空库，那是桌面应用
    /// 有界面能解释清楚时才该做的事。CLI 这类无交互进程必须拿到错误
    /// 并退出，而不是安静地把用户的库换成一个空的。
    pub fn open_migrated(db_path: &std::path::Path) -> Result<Self> {
        // 迁移前备份和 DDL 必须在同一把跨进程锁下完成：两个进程同时升级同一个
        // 库，是这套系统里最危险的组合。拿不到锁就等，等不到就报可恢复错误。
        let guard = match db_path.parent() {
            Some(data_dir) => write_lock::acquire_with_timeout(
                data_dir,
                write_lock::WritePurpose::Migration,
                std::time::Duration::from_secs(30),
            )
            .map(Some)
            .map_err(|error| match error {
                error @ write_lock::WriteLockError::Busy { .. } => {
                    ZeppBridgeError::Busy(error.to_string())
                }
                error => ZeppBridgeError::ConfigError(error.to_string()),
            })?,
            None => None,
        };
        Self::backup_before_schema_change(db_path)?;
        let conn = Connection::open(db_path)?;
        let db = Self::from_connection(conn);
        drop(guard);
        db
    }

    /// 在任何 DDL 之前给现有库留一份可校验的快照。
    ///
    /// 迁移只往前走，改坏了没有回头路。备份或校验失败时直接返回可恢复错误，
    /// 让用户看到「升级没有开始」，而不是让一次半成品迁移把库改成谁也认不出的
    /// 状态。全新的空库（`user_version = 0`）没有东西可丢，跳过。
    pub(super) fn backup_before_schema_change(db_path: &std::path::Path) -> Result<()> {
        let Some(data_dir) = db_path.parent() else {
            return Ok(());
        };
        if !db_path.exists() {
            return Ok(());
        }
        let version = {
            let probe = Connection::open(db_path)?;
            probe
                .query_row("PRAGMA user_version", [], |row| row.get::<_, i64>(0))
                .unwrap_or(0)
        };
        if version == 0 || version >= CURRENT_SCHEMA_VERSION {
            return Ok(());
        }
        match backup::create_backup(data_dir, backup::BackupKind::PreMigration, APP_VERSION) {
            Ok(_) => {
                // 滚动清理只动自动生成的迁移备份，手动备份和标记保留的永远不碰。
                let _ = backup::prune_migration_backups(data_dir);
                Ok(())
            }
            Err(error) => Err(ZeppBridgeError::DataUnavailable(format!(
                "数据库需要升级到新版本，但升级前的自动备份没有成功，所以没有开始升级：{}。请确认数据文件夹所在磁盘还有空间后重试。",
                error.user_message()
            ))),
        }
    }

    /// Open a connection that assumes the schema was already migrated by the
    /// primary connection (`AppState::new`).  Sync workers use this so a
    /// long-running background sync never competes with command paths over
    /// DDL locks (SQLITE_BUSY on ALTER/CREATE INDEX while writing).
    pub fn open_without_migration(db_path: PathBuf) -> Result<Self> {
        let conn = Connection::open(db_path)?;
        conn.execute_batch(
            "PRAGMA foreign_keys = ON;
             PRAGMA busy_timeout = 30000;
             PRAGMA journal_mode = WAL;",
        )?;
        Ok(Self { conn })
    }

    /// Open a query-only connection.
    ///
    /// Read paths that must never write — the local REST API, the MCP server,
    /// `zeppbridge status` — use this so a bug in an adapter cannot mutate the
    /// user's library, and so they never contend for the write lock.
    /// `query_only` is belt-and-braces on top of the read-only open flag.
    /// 只读打开任意版本的库。
    ///
    /// 备份与恢复本身就要读别的版本的库——升级前的快照按定义是旧版本的，
    /// 恢复预览要读的也可能是。所以这一层只提供机制，不带版本判断。
    ///
    /// 回答用户查询的调用方请用 `open_read_only`。
    pub fn open_read_only_any_version(db_path: PathBuf) -> Result<Self> {
        let conn = Connection::open_with_flags(
            db_path,
            rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY | rusqlite::OpenFlags::SQLITE_OPEN_URI,
        )?;
        conn.execute_batch(
            "PRAGMA busy_timeout = 30000;
             PRAGMA query_only = ON;",
        )?;
        Ok(Self { conn })
    }

    /// 只读打开，并先确认 schema 版本对得上。
    ///
    /// 只读连接迁移不了，所以版本不匹配必须在这里变成一句能照做的话。
    /// 否则 CLI / MCP 会一路跑到某个查询上撞见「没有这张表」，
    /// 用户看到的是「数据库暂时不可用」——既不知道原因，也不知道该做什么。
    ///
    /// 这条版本判断是**产品策略**，不是打开文件的机制。把它写进机制里，
    /// 会连带挡住升级前的自动备份——那意味着谁也升级不了。
    pub fn open_read_only(db_path: PathBuf) -> Result<Self> {
        let db = Self::open_read_only_any_version(db_path)?;
        let conn = db.conn;
        let version: i64 = conn.query_row("PRAGMA user_version", [], |row| row.get(0))?;
        match version.cmp(&CURRENT_SCHEMA_VERSION) {
            std::cmp::Ordering::Equal => Ok(Self { conn }),
            // 自己的错误码：撞上这一条的人几乎都在无头环境里，而命令行没有
            // i18n 层，只有按码才出得了英文。见 `HeadlessProblem`。
            std::cmp::Ordering::Less => Err(ZeppBridgeError::Headless(
                crate::models::error::HeadlessProblem::SchemaUpgradeRequired {
                    found: version,
                    required: CURRENT_SCHEMA_VERSION,
                },
            )),
            std::cmp::Ordering::Greater => Err(ZeppBridgeError::ConfigError(format!(
                "本机数据库是 v{version}，比这个程序（v{CURRENT_SCHEMA_VERSION}）新。请把命令行 / MCP 升级到与桌面应用相同的版本，不要用旧版去读新库。"
            ))),
        }
    }

    #[cfg(test)]
    pub fn in_memory() -> Result<Self> {
        Self::from_connection(Connection::open_in_memory()?)
    }

    pub(super) fn from_connection(conn: Connection) -> Result<Self> {
        Self::reject_newer_schema(&conn)?;
        // These pragmas are set for every connection, including test databases.
        conn.execute_batch(
            "PRAGMA foreign_keys = ON;
             PRAGMA busy_timeout = 30000;
             PRAGMA journal_mode = WAL;",
        )?;
        let db = Self { conn };
        db.migrate()?;
        Ok(db)
    }
}
