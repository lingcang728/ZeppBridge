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

/// 可写连接的公共设置。
///
/// - WAL 下 `synchronous = NORMAL` 是 SQLite 官方推荐的组合：只在检查点时 fsync，
///   断电最多丢最后一个事务，库本身不会坏。同步一次写几万行时省下的是每个事务一次 fsync。
/// - `journal_size_limit`：检查点之后把 WAL 截回 32 MB。不设的话 WAL 只增不减，
///   用户库上见过 76 MB 的 `zepp.db-wal`。
const WRITABLE_PRAGMAS: &str = "PRAGMA foreign_keys = ON;
     PRAGMA busy_timeout = 30000;
     PRAGMA journal_mode = WAL;
     PRAGMA synchronous = NORMAL;
     PRAGMA journal_size_limit = 33554432;";

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
            Err(error) if is_corrupt_error(&error) => Self::recover_corrupt(&db_path),
            Err(error) => Err(error),
        }
    }

    /// 损坏库恢复（代码审查 R07）：「保留原件 → 修页头 → 移开坏文件 → 重建」
    /// 全程持同一把跨进程写锁，另一个 CLI / 桌面进程插不进来。
    ///
    /// 原件先整组复制进隔离目录并核对，之后才碰原位置的文件；保不住原件或
    /// 移不开坏文件时，一个字节都不删，这次用临时空库启动（不保存任何东西），
    /// 让用户处理完磁盘空间或占用后重启再试——启动本身绝不失败。
    fn recover_corrupt(db_path: &Path) -> Result<(Self, Option<String>)> {
        let _guard = Self::acquire_migration_lock(db_path)?;
        // 锁内再看一眼：等锁的时候另一个进程可能已经修好或重建了。
        match Self::open_migrated_locked(db_path) {
            Ok(db) => return Ok((db, None)),
            Err(error) if is_corrupt_error(&error) => {}
            Err(error) => return Err(error),
        }
        let preserved = match crate::paths::preserve_sqlite_group(db_path) {
            Ok(dir) => dir,
            Err(_) => {
                return Ok((
                    Self::from_connection(Connection::open_in_memory()?)?,
                    Some(
                        "本地库已损坏，但没能先把原件另存一份（多半是磁盘空间不够），所以没有动它。这次先用临时空库启动，什么都不会保存；腾出空间后重启程序再试。"
                            .into(),
                    ),
                ));
            }
        };
        if salvage_truncated_page_count(db_path).unwrap_or(false) {
            match Self::open_migrated_locked(db_path) {
                Ok(db) => {
                    return Ok((
                        db,
                        Some(format!(
                            "本地库文件被截断，已对齐页头；修之前的原件留在 {}。部分历史数据可能需要重新同步。",
                            preserved.display()
                        )),
                    ));
                }
                Err(error) if is_corrupt_error(&error) => {}
                Err(error) => return Err(error),
            }
        }
        if crate::paths::remove_live_sqlite_group(db_path).is_err() {
            return Ok((
                Self::from_connection(Connection::open_in_memory()?)?,
                Some(format!(
                    "本地库已损坏，原件已另存到 {}，但坏文件没能从原位置移开（可能被别的程序占用）。这次先用临时空库启动，什么都不会保存；关掉占用它的程序后重启再试。",
                    preserved.display()
                )),
            ));
        }
        let db = Self::open_migrated_locked(db_path)?;
        Ok((
            db,
            Some(format!(
                "本地库已损坏，已隔离到 {} 并重建空库。请重新同步。",
                preserved.display()
            )),
        ))
    }

    fn acquire_migration_lock(db_path: &Path) -> Result<Option<write_lock::ExclusiveWriteGuard>> {
        let Some(data_dir) = db_path.parent() else {
            return Ok(None);
        };
        write_lock::acquire_with_timeout(
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
        })
    }

    /// `open_migrated` 去掉拿锁那一步：调用方已经持有迁移写锁。
    ///
    /// 这次真的升级了（留过快照）并且升级后的库通过完整性检查，就把自动快照
    /// 静默删掉；检查没过就留着，给恢复用。
    fn open_migrated_locked(db_path: &Path) -> Result<Self> {
        let snapshot_taken = Self::backup_before_schema_change(db_path)?;
        let conn = Connection::open(db_path)?;
        let db = Self::from_connection(conn)?;
        if snapshot_taken {
            if let Some(data_dir) = db_path.parent() {
                db.discard_snapshots_if_healthy(data_dir);
            }
        }
        Ok(db)
    }

    /// 当前库通过 `PRAGMA quick_check` 才删自动快照。任何一步出错都只是
    /// 不删——快照多留一份不伤数据，删错了才伤。
    pub(super) fn discard_snapshots_if_healthy(&self, data_dir: &Path) {
        let healthy = self
            .conn
            .query_row("PRAGMA quick_check", [], |row| row.get::<_, String>(0))
            .is_ok_and(|result| result == "ok");
        if healthy {
            let _ = backup::discard_automatic_snapshots(data_dir);
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
        let guard = Self::acquire_migration_lock(db_path)?;
        let db = Self::open_migrated_locked(db_path);
        drop(guard);
        db
    }

    /// 在任何 DDL 之前给现有库留一份可校验的快照。
    ///
    /// 迁移只往前走，改坏了没有回头路。备份或校验失败时直接返回可恢复错误，
    /// 让用户看到「升级没有开始」，而不是让一次半成品迁移把库改成谁也认不出的
    /// 状态。全新的空库（`user_version = 0`）没有东西可丢，跳过。
    /// 返回这次是否真的留了快照（需要升级时才留）。
    pub(super) fn backup_before_schema_change(db_path: &std::path::Path) -> Result<bool> {
        let Some(data_dir) = db_path.parent() else {
            return Ok(false);
        };
        if !db_path.exists() {
            return Ok(false);
        }
        let version = {
            let probe = Connection::open(db_path)?;
            probe
                .query_row("PRAGMA user_version", [], |row| row.get::<_, i64>(0))
                .unwrap_or(0)
        };
        if version == 0 || version >= CURRENT_SCHEMA_VERSION {
            return Ok(false);
        }
        match backup::create_backup(data_dir, backup::BackupKind::PreMigration, APP_VERSION) {
            Ok(_) => {
                // 滚动清理只动自动生成的迁移备份，手动备份和标记保留的永远不碰。
                let _ = backup::prune_migration_backups(data_dir);
                Ok(true)
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
        conn.execute_batch(WRITABLE_PRAGMAS)?;
        Ok(Self::from_conn(conn))
    }

    /// 这条连接打开的库文件所在的数据目录；内存库是 `None`。
    ///
    /// 只读进程里偶尔要做一次短写入（MCP 起草训练计划），要靠它找到同一个目录的写锁。
    pub fn data_dir(&self) -> Option<PathBuf> {
        let file = self.conn.path().filter(|path| !path.is_empty())?;
        std::path::Path::new(file)
            .parent()
            .map(std::path::Path::to_path_buf)
    }

    /// 这条连接是不是只读的（`query_only`）。
    pub fn is_query_only(&self) -> bool {
        self.conn
            .query_row("PRAGMA query_only", [], |row| row.get::<_, i64>(0))
            .map(|value| value != 0)
            .unwrap_or(false)
    }

    /// 只读连接换成可写连接。返回换没换。
    ///
    /// 桌面应用启动时如果别的进程（CLI 重解析、恢复）正攥着写锁，命令侧只能先拿一条
    /// 只读连接。以前它就这样只读到底：之后整个会话里改设置、记生活事件都报
    /// 「readonly database」，不重启不恢复。调用方拿到写锁之后调这个——锁在手里，
    /// 就没有别人在写或在迁移；库的版本不对（还没升级）就不换，照旧报错。
    pub fn reopen_writable_if_query_only(&mut self, db_path: PathBuf) -> Result<bool> {
        if !self.is_query_only() {
            return Ok(false);
        }
        let fresh = Self::open_without_migration(db_path)?;
        let version: i64 = fresh
            .conn
            .query_row("PRAGMA user_version", [], |row| row.get(0))?;
        if version != CURRENT_SCHEMA_VERSION {
            return Err(ZeppBridgeError::Busy(format!(
                "本地库版本是 v{version}，这个程序需要 v{CURRENT_SCHEMA_VERSION}；重启应用完成升级后再试"
            )));
        }
        *self = fresh;
        Ok(true)
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
        Ok(Self::from_conn(conn))
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
            std::cmp::Ordering::Equal => Ok(Self::from_conn(conn)),
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
        conn.execute_batch(WRITABLE_PRAGMAS)?;
        let db = Self::from_conn(conn);
        db.migrate()?;
        Ok(db)
    }
}
