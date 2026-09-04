//! SQLite schema 与迁移。
//!
//! 单独成文件的理由是它的读法和别处不一样：这里的每一段都是**追加**的历史，
//! 已经发布出去的迁移步骤永远不能再改——用户库里已经按当时的 DDL 建好了表，
//! 回头改动只会让老库和新库长得不一样。要改结构就往后加一个版本。
//!
//! 版本号是 `PRAGMA user_version`，当前值见 `super::CURRENT_SCHEMA_VERSION`。
//! 迁移由 `Database::open_migrated` 在拿到跨进程写锁并生成一份升级前备份之后
//! 调用，所以这里可以假定自己是唯一的写者。

use super::*;

impl Database {
    /// 迁移的事务边界。
    ///
    /// 这里面的每一步单独看都是幂等的，但**合起来不是原子的**，而且版本号
    /// 在过程中会先倒退再走回来：`PRAGMA user_version = 5` 那一行不在任何
    /// `if version < N` 守卫里，所以一个 v19 的库每次启动都要从 5 一路重新
    /// 盖到 19。在这中间断电或被强杀，磁盘上留下的就是「schema 已经是新的、
    /// 版本号却写着 8」——只读连接（CLI / MCP）看到版本对不上直接拒绝启动，
    /// 而用户完全不知道发生了什么。
    ///
    /// 包进一个事务之后，这个中间态对别的连接和对下一次启动都不存在：要么
    /// 整套迁移落地，要么一个字节都没写。DDL 在 SQLite 里是事务性的，
    /// `user_version` 存在头页里，同样跟着回滚。
    ///
    /// `journal_mode = WAL` 这类不能在事务里跑的 pragma 由 `from_connection`
    /// 在调用这里**之前**设好，不要往 `migrate_steps` 里加。
    pub(super) fn migrate(&self) -> Result<()> {
        self.conn.execute_batch("BEGIN IMMEDIATE;")?;
        match self.migrate_steps() {
            Ok(()) => {
                if self.conn.is_autocommit() {
                    // SQLite 自己把事务回滚掉了（I/O 错误、磁盘满、损坏都会
                    // 触发）。这时候一个改动都没落地，不能当成升级成功——那会
                    // 让下一步拿着旧 schema 当新的用。
                    return Err(ZeppBridgeError::DataUnavailable(
                        "数据库升级被中断，没有任何改动写入。请确认磁盘空间和文件权限后重试。"
                            .into(),
                    ));
                }
                self.conn.execute_batch("COMMIT;")?;
                Ok(())
            }
            Err(error) => {
                if !self.conn.is_autocommit() {
                    let _ = self.conn.execute_batch("ROLLBACK;");
                }
                Err(error)
            }
        }
    }

    fn migrate_steps(&self) -> Result<()> {
        self.conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS schema_migrations (
                version INTEGER PRIMARY KEY,
                applied_at TEXT NOT NULL
            );",
        )?;
        let version: i64 = self
            .conn
            .query_row("PRAGMA user_version", [], |row| row.get(0))?;

        if version < 1 {
            self.conn.execute_batch(
                "CREATE TABLE IF NOT EXISTS source_accounts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    source_type TEXT NOT NULL,
                    region_host TEXT NOT NULL,
                    external_user_hash TEXT NOT NULL,
                    auth_state TEXT NOT NULL,
                    capabilities TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS raw_records (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    stream TEXT NOT NULL,
                    source_key TEXT NOT NULL,
                    source_scope TEXT NOT NULL,
                    device_id TEXT,
                    start_utc TEXT NOT NULL,
                    end_utc TEXT,
                    payload TEXT NOT NULL,
                    payload_hash TEXT NOT NULL,
                    fetched_at TEXT NOT NULL,
                    UNIQUE(stream, source_key)
                );
                CREATE TABLE IF NOT EXISTS metric_samples (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    metric TEXT NOT NULL,
                    timestamp TEXT NOT NULL,
                    value REAL NOT NULL,
                    unit TEXT NOT NULL,
                    source_scope TEXT NOT NULL,
                    device_id TEXT,
                    raw_record_id INTEGER,
                    FOREIGN KEY(raw_record_id) REFERENCES raw_records(id)
                );
                CREATE TABLE IF NOT EXISTS daily_metrics (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    date TEXT NOT NULL,
                    metric TEXT NOT NULL,
                    value REAL NOT NULL,
                    unit TEXT NOT NULL,
                    source_scope TEXT NOT NULL,
                    device_id TEXT,
                    raw_record_id INTEGER,
                    FOREIGN KEY(raw_record_id) REFERENCES raw_records(id)
                );
                CREATE TABLE IF NOT EXISTS sleep_sessions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    sleep_id TEXT NOT NULL UNIQUE,
                    start_time TEXT NOT NULL,
                    end_time TEXT NOT NULL,
                    score INTEGER,
                    duration_minutes INTEGER NOT NULL,
                    deep_minutes INTEGER NOT NULL,
                    light_minutes INTEGER NOT NULL,
                    rem_minutes INTEGER NOT NULL,
                    awake_minutes INTEGER NOT NULL,
                    source_scope TEXT NOT NULL,
                    device_id TEXT,
                    raw_record_id INTEGER,
                    FOREIGN KEY(raw_record_id) REFERENCES raw_records(id)
                );
                CREATE TABLE IF NOT EXISTS workouts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    workout_id TEXT NOT NULL UNIQUE,
                    workout_type TEXT NOT NULL,
                    start_time TEXT NOT NULL,
                    end_time TEXT NOT NULL,
                    distance_meters REAL,
                    calories INTEGER,
                    avg_hr INTEGER,
                    max_hr INTEGER,
                    training_load REAL,
                    vo2max REAL,
                    source_scope TEXT NOT NULL,
                    device_id TEXT,
                    raw_record_id INTEGER,
                    FOREIGN KEY(raw_record_id) REFERENCES raw_records(id)
                );
                CREATE TABLE IF NOT EXISTS sleep_stages (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    sleep_id TEXT NOT NULL,
                    stage TEXT NOT NULL,
                    start_time TEXT NOT NULL,
                    end_time TEXT NOT NULL,
                    FOREIGN KEY(sleep_id) REFERENCES sleep_sessions(sleep_id) ON DELETE CASCADE
                );
                CREATE TABLE IF NOT EXISTS workout_samples (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    workout_id TEXT NOT NULL,
                    timestamp TEXT NOT NULL,
                    heart_rate INTEGER,
                    pace REAL,
                    speed REAL,
                    cadence REAL,
                    altitude REAL,
                    FOREIGN KEY(workout_id) REFERENCES workouts(workout_id) ON DELETE CASCADE
                );
                CREATE TABLE IF NOT EXISTS route_points (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    workout_id TEXT NOT NULL,
                    timestamp TEXT NOT NULL,
                    latitude REAL NOT NULL,
                    longitude REAL NOT NULL,
                    altitude REAL,
                    FOREIGN KEY(workout_id) REFERENCES workouts(workout_id) ON DELETE CASCADE
                );
                CREATE TABLE IF NOT EXISTS sync_state (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    stream TEXT NOT NULL UNIQUE,
                    last_sync TEXT,
                    cursor TEXT,
                    status TEXT NOT NULL,
                    error TEXT,
                    needs_reauth INTEGER NOT NULL DEFAULT 0,
                    records_written INTEGER NOT NULL DEFAULT 0,
                    capability TEXT NOT NULL DEFAULT 'verified',
                    message TEXT,
                    updated_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_metric_samples_metric_timestamp
                    ON metric_samples(metric, timestamp);
                CREATE INDEX IF NOT EXISTS idx_daily_metrics_date_metric
                    ON daily_metrics(date, metric);
                CREATE INDEX IF NOT EXISTS idx_raw_records_fetched_at
                    ON raw_records(fetched_at);
                PRAGMA user_version = 1;",
            )?;
            self.conn.execute(
                "INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES(1, ?1)",
                [Utc::now().to_rfc3339()],
            )?;
        } else {
            // Databases created by the initial MVP may have the core tables but
            // lack the richer sync columns.  Add only missing columns so the
            // migration remains idempotent.
            self.ensure_table_columns(
                "sync_state",
                &[
                    ("cursor", "TEXT"),
                    ("needs_reauth", "INTEGER NOT NULL DEFAULT 0"),
                    ("records_written", "INTEGER NOT NULL DEFAULT 0"),
                    ("capability", "TEXT NOT NULL DEFAULT 'verified'"),
                    ("message", "TEXT"),
                ],
            )?;
            self.ensure_table_columns("raw_records", &[("payload_hash", "TEXT")])?;
        }

        // Expression indexes are needed because SQLite treats NULLs as distinct
        // in ordinary UNIQUE constraints.  COALESCE makes a missing device id a
        // deterministic part of the canonical key.
        //
        // The daily_metrics unique-key rebuild is destructive (DELETE + DROP +
        // CREATE INDEX). Running it on every launch of a 1GB library is how
        // a force-killed startup left a truncated file and flash-crashed the
        // next double-click. Only do that work when upgrading older schemas.
        if version < 4 {
            self.conn.execute_batch(
                "CREATE UNIQUE INDEX IF NOT EXISTS uq_metric_sample_key
                     ON metric_samples(metric, timestamp, unit, source_scope, COALESCE(device_id, ''));
                  DELETE FROM daily_metrics WHERE id NOT IN (
                      SELECT MIN(id) FROM daily_metrics
                      GROUP BY date, metric, unit, source_scope);
                  DROP INDEX IF EXISTS uq_daily_metric_key;
                  CREATE UNIQUE INDEX uq_daily_metric_key
                     ON daily_metrics(date, metric, unit, source_scope);
                 CREATE TABLE IF NOT EXISTS app_meta (
                     key TEXT PRIMARY KEY,
                     value TEXT NOT NULL,
                     updated_at TEXT NOT NULL
                 );
                 PRAGMA user_version = 4;",
            )?;
        } else {
            self.conn.execute_batch(
                "CREATE UNIQUE INDEX IF NOT EXISTS uq_metric_sample_key
                     ON metric_samples(metric, timestamp, unit, source_scope, COALESCE(device_id, ''));
                 CREATE UNIQUE INDEX IF NOT EXISTS uq_daily_metric_key
                     ON daily_metrics(date, metric, unit, source_scope);
                 CREATE TABLE IF NOT EXISTS app_meta (
                     key TEXT PRIMARY KEY,
                     value TEXT NOT NULL,
                     updated_at TEXT NOT NULL
                 );",
            )?;
        }
        self.conn.execute(
            "INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES(2, ?1)",
            [Utc::now().to_rfc3339()],
        )?;
        self.conn.execute(
            "INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES(3, ?1)",
            [Utc::now().to_rfc3339()],
        )?;
        self.ensure_table_columns(
            "sleep_sessions",
            &[("rem_available", "INTEGER NOT NULL DEFAULT 1")],
        )?;
        self.conn.execute(
            "INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES(4, ?1)",
            [Utc::now().to_rfc3339()],
        )?;
        self.ensure_table_columns("sleep_sessions", &[("synced_at", "TEXT")])?;
        self.ensure_table_columns(
            "workouts",
            &[
                ("synced_at", "TEXT"),
                ("gps_available", "INTEGER NOT NULL DEFAULT 0"),
                ("sample_count", "INTEGER NOT NULL DEFAULT 0"),
            ],
        )?;
        self.conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS device_identities (
                alias TEXT PRIMARY KEY,
                name TEXT,
                firmware TEXT,
                serial TEXT,
                device_id TEXT,
                timezone TEXT,
                updated_at TEXT NOT NULL
            );",
        )?;
        if let Err(error) = self.conn.execute(
            "UPDATE sleep_sessions
             SET synced_at = (
                 SELECT fetched_at FROM raw_records
                 WHERE raw_records.id = sleep_sessions.raw_record_id
             )
             WHERE synced_at IS NULL",
            [],
        ) {
            if !is_corrupt_sqlite(&error) {
                return Err(error.into());
            }
        }
        if let Err(error) = self.conn.execute(
            "UPDATE workouts
             SET synced_at = (
                 SELECT fetched_at FROM raw_records
                 WHERE raw_records.id = workouts.raw_record_id
             )
             WHERE synced_at IS NULL",
            [],
        ) {
            if !is_corrupt_sqlite(&error) {
                return Err(error.into());
            }
        }
        self.conn.execute(
            "INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES(5, ?1)",
            [Utc::now().to_rfc3339()],
        )?;
        self.conn.execute_batch("PRAGMA user_version = 5;")?;
        self.ensure_table_columns(
            "workouts",
            &[("zepp_source", "TEXT"), ("zepp_type", "INTEGER")],
        )?;
        self.ensure_table_columns("workout_samples", &[("stride", "REAL")])?;
        self.conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS workout_pauses (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                workout_id TEXT NOT NULL,
                start_time TEXT NOT NULL,
                end_time TEXT NOT NULL,
                kind TEXT NOT NULL,
                FOREIGN KEY(workout_id) REFERENCES workouts(workout_id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_workout_samples_workout
                ON workout_samples(workout_id, timestamp);
            CREATE INDEX IF NOT EXISTS idx_route_points_workout
                ON route_points(workout_id, timestamp);
            PRAGMA user_version = 6;",
        )?;
        self.conn.execute(
            "INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES(6, ?1)",
            [Utc::now().to_rfc3339()],
        )?;
        // daily_metrics' canonical key predates device attribution, so two
        // devices reporting the same metric on the same day collide and one
        // silently overwrites the other. metric_samples already keys on
        // COALESCE(device_id, '') (version 4); bring daily_metrics in line.
        // Widening a unique key can never surface a duplicate, so unlike the
        // version-4 rebuild this needs no DELETE. Gate it on the version so a
        // large library does not rebuild the index on every launch.
        if version < 7 {
            self.conn.execute_batch(
                "DROP INDEX IF EXISTS uq_daily_metric_key;
                 CREATE UNIQUE INDEX uq_daily_metric_key
                     ON daily_metrics(date, metric, unit, source_scope, COALESCE(device_id, ''));
                 PRAGMA user_version = 7;",
            )?;
        }
        self.conn.execute(
            "INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES(7, ?1)",
            [Utc::now().to_rfc3339()],
        )?;
        // Per-kilometre splits are derived from the raw detail payload, so the
        // table starts empty and fills in on the next normalizer replay.
        self.conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS workout_splits (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                workout_id TEXT NOT NULL,
                split_index INTEGER NOT NULL,
                start_time TEXT NOT NULL,
                end_time TEXT NOT NULL,
                distance_m REAL NOT NULL,
                duration_seconds INTEGER NOT NULL,
                pace_min_per_km REAL,
                avg_hr INTEGER,
                max_hr INTEGER,
                elevation_gain_m REAL,
                elevation_loss_m REAL,
                partial INTEGER NOT NULL,
                FOREIGN KEY(workout_id) REFERENCES workouts(workout_id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_workout_splits_workout
                ON workout_splits(workout_id, split_index);
            PRAGMA user_version = 8;",
        )?;
        self.conn.execute(
            "INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES(8, ?1)",
            [Utc::now().to_rfc3339()],
        )?;
        // `wc` has been in every band payload all along; nights already stored
        // backfill on the next normalizer replay.
        self.ensure_table_columns("sleep_sessions", &[("wake_count", "INTEGER")])?;
        self.conn.execute_batch("PRAGMA user_version = 9;")?;
        self.conn.execute(
            "INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES(9, ?1)",
            [Utc::now().to_rfc3339()],
        )?;
        // Running power and form come from the same detail payload the samples
        // already carry, so the columns start empty and fill in on the replay
        // that the revision bump triggers.
        self.ensure_table_columns(
            "workout_samples",
            &[
                ("power_watts", "REAL"),
                ("ground_contact_ms", "REAL"),
                ("vertical_oscillation_mm", "REAL"),
                ("vertical_ratio_pct", "REAL"),
                ("equivalent_pace_s", "REAL"),
            ],
        )?;
        self.conn.execute_batch("PRAGMA user_version = 10;")?;
        self.conn.execute(
            "INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES(10, ?1)",
            [Utc::now().to_rfc3339()],
        )?;
        // Keep Zepp's raw numeric fact, our interpretation, and a user's local
        // correction as separate layers. Existing rows are classified from the
        // evidence already stored; the revision bump then replays retained raw
        // records using the current normalizer without changing cloud sync time.
        self.ensure_table_columns(
            "workouts",
            &[
                ("workout_type_source", "TEXT NOT NULL DEFAULT 'missing'"),
                ("workout_type_override", "TEXT"),
                ("workout_type_conflict", "TEXT"),
            ],
        )?;
        if version < 11 {
            self.conn.execute_batch(
                "UPDATE workouts
                    SET workout_type_source = CASE
                        WHEN zepp_type IS NOT NULL AND workout_type LIKE 'unknown:%' THEN 'unknown_code'
                        WHEN zepp_type IS NOT NULL THEN 'numeric_mapped'
                        WHEN workout_type <> 'unknown' THEN 'string_field'
                        ELSE 'missing'
                    END;",
            )?;
        }
        self.conn.execute_batch("PRAGMA user_version = 11;")?;
        self.conn.execute(
            "INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES(11, ?1)",
            [Utc::now().to_rfc3339()],
        )?;
        // Per-stream provenance: fetch / parse / write are three different
        // things that can fail independently, and collapsing them into one
        // status is how "the data is stale" becomes unanswerable. The table
        // starts empty; `data_health` falls back to raw_records.fetched_at so
        // an upgraded library does not claim it has never fetched anything.
        //
        // The raw_record_id indexes make the "retained but never normalized"
        // count a lookup instead of four full scans of the canonical tables.
        self.conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS stream_provenance (
                stream TEXT PRIMARY KEY,
                last_fetch_ok_at TEXT,
                last_fetch_error_at TEXT,
                last_fetch_error_kind TEXT,
                last_fetch_error_message TEXT,
                last_parse_ok_at TEXT,
                last_parse_error_at TEXT,
                last_parse_error_kind TEXT,
                last_parse_error_message TEXT,
                last_write_ok_at TEXT,
                last_write_error_at TEXT,
                last_write_error_kind TEXT,
                last_write_error_message TEXT,
                last_written_records INTEGER NOT NULL DEFAULT 0,
                updated_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_metric_samples_raw
                ON metric_samples(raw_record_id);
            CREATE INDEX IF NOT EXISTS idx_daily_metrics_raw
                ON daily_metrics(raw_record_id);
            CREATE INDEX IF NOT EXISTS idx_sleep_sessions_raw
                ON sleep_sessions(raw_record_id);
            CREATE INDEX IF NOT EXISTS idx_workouts_raw
                ON workouts(raw_record_id);
            CREATE INDEX IF NOT EXISTS idx_raw_records_stream
                ON raw_records(stream);
            PRAGMA user_version = 12;",
        )?;
        self.conn.execute(
            "INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES(12, ?1)",
            [Utc::now().to_rfc3339()],
        )?;
        // The user-correction layer. Kept in its own tables so a normalizer
        // replay can rewrite ZeppBridge's interpretation without touching what
        // the user told us, and so a correction is always displayable as
        // "you filled this in" rather than as a recognition result.
        //
        // Both tables answer real reports: a custom Zepp training template
        // arrives as a numeric code the bundled catalog does not know, and some
        // accounts' device responses carry no product-name field at all, so no
        // amount of matching can name the watch.
        self.conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS workout_code_labels (
                zepp_type INTEGER PRIMARY KEY,
                label TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS device_model_overrides (
                device_key TEXT PRIMARY KEY,
                catalog_id TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            PRAGMA user_version = 13;",
        )?;
        self.conn.execute(
            "INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES(13, ?1)",
            [Utc::now().to_rfc3339()],
        )?;
        // 历史覆盖账本。「请求过」「拿到了」「写进去了」和「云端没有返回」是
        // 四种不同的状态；只记一个「已同步到某年某月」会让它们长得一模一样，
        // 于是既没法断点续传，也没法诚实回答「我的历史到底补全了没有」。
        self.conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS coverage_ledger (
                stream TEXT NOT NULL,
                chunk_start TEXT NOT NULL,
                chunk_end TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                requested_at TEXT,
                fetched_at TEXT,
                persisted_at TEXT,
                records INTEGER NOT NULL DEFAULT 0,
                error TEXT,
                updated_at TEXT NOT NULL,
                PRIMARY KEY(stream, chunk_start)
            );
            CREATE INDEX IF NOT EXISTS idx_coverage_ledger_status
                ON coverage_ledger(status, chunk_start DESC);
            PRAGMA user_version = 14;",
        )?;
        self.conn.execute(
            "INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES(14, ?1)",
            [Utc::now().to_rfc3339()],
        )?;
        // 压缩后的原始报文。
        //
        // 原始报文是整个库里最占地方的东西：这台机器上 2000 多条 raw_records
        // 就吃掉了一 GB 出头，而它们是 JSON 文本，deflate 之后只剩 18%。
        //
        // 新增一列而不是改 `payload`：已发布的 DDL 不能改，而且旧行必须原样
        // 可读。读的时候优先用 `payload_zip`，没有就退回 `payload`。
        self.ensure_table_columns("raw_records", &[("payload_zip", "BLOB")])?;
        self.conn.execute_batch("PRAGMA user_version = 15;")?;
        self.conn.execute(
            "INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES(15, ?1)",
            [Utc::now().to_rfc3339()],
        )?;
        // 补拉的尝试次数。
        //
        // 没有这一列时，`failed` 和 `pending` 在待办查询里完全等价：一块失败
        // 之后立刻回到队首，下一轮必然再选中它，后面的块永远轮不上。记下尝试
        // 次数，才能把「这一轮已经试过」和「以后还可以再试」分开，也才能让
        // 确定性失败（比如报文能拿到但一条都解析不出来）在自动重试若干次后
        // 停下来等用户显式重试，而不是无限空转。
        self.ensure_table_columns(
            "coverage_ledger",
            &[
                ("attempts", "INTEGER NOT NULL DEFAULT 0"),
                ("last_attempt_at", "TEXT"),
                // 失败原因的稳定码。没有它，界面就只能显示后端那句中文原文——
                // 英文用户在补拉账本里看到的就是一行中文。
                ("error_code", "TEXT"),
            ],
        )?;
        self.conn.execute_batch("PRAGMA user_version = 16;")?;
        self.conn.execute(
            "INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES(16, ?1)",
            [Utc::now().to_rfc3339()],
        )?;
        // 睡眠阶段的原始 mode 值。
        //
        // 认不出来的 mode 以前被归成 `awake`，现在归成 `unknown`——但只知道
        // 「有一段认不出来」推不动任何事。留下云端给的那个数字，下一次才有
        // 得查。旧行 `NULL`：它们是在这一列存在之前写进去的，谎称一个值和
        // 当初谎称 `awake` 是同一个错误。
        self.ensure_table_columns("sleep_stages", &[("raw_mode", "INTEGER")])?;
        self.conn.execute_batch("PRAGMA user_version = 17;")?;
        self.conn.execute(
            "INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES(17, ?1)",
            [Utc::now().to_rfc3339()],
        )?;
        // 清掉被当成设备记下来的固件版本号。
        //
        // 有用户报告侧边栏里多出三个点不动也删不掉的「未识别数据源」，标签是
        // `0.91.20.5`、`0.91.17.5` 这样的字符串。那不是设备，是固件版本：
        // Zepp 某些报文在 `deviceId` / `sn` 位置上放的就是它，而抽取逻辑只认
        // 字段名不看值。写入侧的闸已经加在 `looks_like_firmware_version`，这里
        // 负责把已经落库的那些行删掉——否则它们会一直挂在界面上，而用户没有
        // 任何入口能删。
        //
        // 判据必须和写入侧是同一个：这里直接调 `looks_like_firmware_version`，
        // 而不是用 SQL 再写一遍。SQLite 没有正则，GLOB 写出来的近似式比那个
        // 函数松（`[0-9]*.[0-9]*.[0-9]*` 里的 `*` 会跨过点，把 `1.a.b.2.3` 也
        // 算进去），两套判据一旦不一致，就会出现「写得进来、却被迁移删掉」的
        // 行。所以先取出来，在 Rust 里筛，再按精确 alias 删。
        //
        // 只删 device_identities 里的行。带这些 alias 的数据行不动：那些采样
        // 是真的，只是被挂到了一个不存在的设备名下，删数据会把真实记录一起
        // 删掉。它们会在下一次同步时重新归到正确的设备上。
        let phantom_aliases: Vec<String> = {
            let mut stmt = self.conn.prepare("SELECT alias FROM device_identities")?;
            let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
            rows.filter_map(std::result::Result::ok)
                .filter(|alias| super::looks_like_firmware_version(alias))
                .collect()
        };
        for alias in &phantom_aliases {
            self.conn
                .execute("DELETE FROM device_identities WHERE alias = ?1", [alias])?;
        }
        self.conn.execute_batch("PRAGMA user_version = 18;")?;
        self.conn.execute(
            "INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES(18, ?1)",
            [Utc::now().to_rfc3339()],
        )?;
        // 云端一直在给、而我们一直没取的运动汇总字段。
        //
        // 审计了一遍原始报文：workouts 流有 198 个字段，我们只读了 26 个；
        // 剔掉恒为 -1/0/"" 的保留槽位之后，仍有 66 个带真实数据的字段被丢掉。
        // 下面这些是其中用户能直接感知的那部分。
        //
        // 爬升为什么要存云端那份：解析器自己从海拔序列按 1 米噪声底也能算一个，
        // 但两者对不上（实测一次健走：云端 59 m，我们 37 m），而用户在 Zepp App
        // 里看到的是云端那个。以云端为准、我们算的做回退。
        self.ensure_table_columns(
            "workouts",
            &[
                ("min_hr", "INTEGER"),
                ("total_steps", "INTEGER"),
                ("moving_seconds", "INTEGER"),
                ("elevation_gain_m", "REAL"),
                ("elevation_loss_m", "REAL"),
                ("max_altitude_m", "REAL"),
                ("min_altitude_m", "REAL"),
                ("training_effect", "REAL"),
                ("anaerobic_training_effect", "REAL"),
                ("rpe", "INTEGER"),
                ("avg_cadence_spm", "REAL"),
                ("max_cadence_spm", "REAL"),
                ("avg_stride_cm", "REAL"),
            ],
        )?;
        // 心率区间分布。
        //
        // 单独一张表而不是往 workouts 里塞一个 JSON 列：这是一组有序的
        // (上限, 秒数)，要按区间聚合和排序。塞进 JSON 就得在 SQL 之外再解一次。
        //
        // 边界值一起存。区间边界来自用户在表上的设定，会随设定变化，所以
        // 「Z2 待了多久」这句话只有连着当时的边界才有意义。
        self.conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS workout_hr_zones (
                workout_id TEXT NOT NULL,
                zone_index INTEGER NOT NULL,
                upper_bound_bpm INTEGER NOT NULL,
                seconds INTEGER NOT NULL,
                PRIMARY KEY (workout_id, zone_index)
            );
            CREATE INDEX IF NOT EXISTS idx_workout_hr_zones_workout
                ON workout_hr_zones(workout_id);",
        )?;
        self.conn.execute_batch("PRAGMA user_version = 19;")?;
        self.conn.execute(
            "INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES(19, ?1)",
            [Utc::now().to_rfc3339()],
        )?;

        // v20：云端业务错误码单存一列。
        //
        // `classify_business_code` 把 HTTP 200 + 非成功 code 变成了
        // `CloudRejected`，但那个 code 只进了一句给人看的中文里。而我们
        // 现在需要的恰恰是那个数字：本机那 1075 条留存报文全是
        // `code = 1`，没有任何一个失败码可供观测，所以不能凭空把某个数字
        // 映成「需要重新登录」。它得从遇到这件事的用户那里回来，
        // 而诊断报告只发白名单字段——所以它必须是一个字段，不能是
        // 一句话里的子串。对应反馈库的 `0007_cloud_rejection.sql`。
        self.ensure_table_columns("stream_provenance", &[("last_error_code", "INTEGER")])?;
        self.conn.execute_batch("PRAGMA user_version = 20;")?;
        self.conn.execute(
            "INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES(20, ?1)",
            [Utc::now().to_rfc3339()],
        )?;
        // v21：手表自己记的圈。
        //
        // 和 `workout_splits` 是**两回事**，所以单独一张表而不是加一个
        // 类型列：splits 是我们本地按每公里切出来的，圈是手表在运动当时
        // 记下来的——按圈键、按距离自动分段，或者按训练课的间歇。
        // 一次 5820 m 的跑步可以同时有 5 段公里分段和 14 个 415 m 的圈；
        // 把它们塞进同一张表，「每公里配速」那张图就会突然变成别的东西。
        //
        // 表从空的开始，下一次归一化重放时填上——原始报文里一直有。
        self.conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS workout_laps (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                workout_id TEXT NOT NULL,
                lap_index INTEGER NOT NULL,
                start_time TEXT NOT NULL,
                end_time TEXT NOT NULL,
                distance_m REAL NOT NULL,
                duration_seconds INTEGER NOT NULL,
                avg_hr INTEGER,
                max_hr INTEGER,
                FOREIGN KEY(workout_id) REFERENCES workouts(workout_id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_workout_laps_workout
                ON workout_laps(workout_id, lap_index);
            PRAGMA user_version = 21;",
        )?;
        self.conn.execute(
            "INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES(21, ?1)",
            [Utc::now().to_rfc3339()],
        )?;
        // Earlier migrations are intentionally idempotent and still stamp
        // their historical versions on every launch, so the current schema
        // marker is restored only after all of them have run.
        self.ensure_cloud_sync_metadata()?;
        Ok(())
    }
}
