use crate::decoder::{decode_workout_detail, DecodedWorkout};
use crate::models::{error::*, *};
use crate::normalizer::Normalizer;
use chrono::{DateTime, Local, NaiveDate, Utc};
use rusqlite::{params, Connection, OptionalExtension};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};
use std::path::PathBuf;

const NORMALIZER_REVISION: &str = "zepp-normalizer-2026-08-v8";
const LAST_CLOUD_SYNC_AT_KEY: &str = "last_cloud_sync_at";
const LAST_CLOUD_SYNC_OUTCOME_KEY: &str = "last_cloud_sync_outcome";
const LAST_LOCAL_REPROCESS_AT_KEY: &str = "last_local_reprocess_at";
const RETENTION_DAYS_KEY: &str = "retention_days";
const HISTORY_SYNC_DAYS_KEY: &str = "history_sync_days";
const BYTES_PER_HISTORY_DAY: u64 = 800_000;

pub struct Database {
    conn: Connection,
}

#[derive(Debug, Clone, Default)]
pub struct NormalizationCounts {
    pub primary_records: i64,
    pub band_heart_rate_records: i64,
    pub supplemental_daily_records: i64,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct StreamFreshness {
    pub last_cloud_sync_at: Option<String>,
    pub newest_sample_at: Option<String>,
}

impl Database {
    pub fn new(db_path: PathBuf) -> Result<Self> {
        let conn = Connection::open(db_path)?;
        Self::from_connection(conn)
    }

    /// Open a connection that assumes the schema was already migrated by the
    /// primary connection (`AppState::new`).  Sync workers use this so a
    /// long-running background sync never competes with command paths over
    /// DDL locks (SQLITE_BUSY on ALTER/CREATE INDEX while writing).
    pub fn open_without_migration(db_path: PathBuf) -> Result<Self> {
        let conn = Connection::open(db_path)?;
        conn.execute_batch(
            "PRAGMA foreign_keys = ON;
             PRAGMA busy_timeout = 5000;
             PRAGMA journal_mode = WAL;",
        )?;
        Ok(Self { conn })
    }

    #[cfg(test)]
    pub fn in_memory() -> Result<Self> {
        Self::from_connection(Connection::open_in_memory()?)
    }

    fn from_connection(conn: Connection) -> Result<Self> {
        // These pragmas are set for every connection, including test databases.
        conn.execute_batch(
            "PRAGMA foreign_keys = ON;
             PRAGMA busy_timeout = 5000;
             PRAGMA journal_mode = WAL;",
        )?;
        let db = Self { conn };
        db.migrate()?;
        Ok(db)
    }

    fn migrate(&self) -> Result<()> {
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
        self.conn.execute_batch(
            "CREATE UNIQUE INDEX IF NOT EXISTS uq_metric_sample_key
                 ON metric_samples(metric, timestamp, unit, source_scope, COALESCE(device_id, ''));
              -- Daily metrics are account-level facts: the same (date, metric,
              -- unit, scope) written by two endpoints with different device ids
              -- must collapse to one row.  Drop legacy duplicates first, then
              -- rebuild the canonical key without the device-id dimension.
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
        self.conn.execute(
            "UPDATE sleep_sessions
             SET synced_at = (
                 SELECT fetched_at FROM raw_records
                 WHERE raw_records.id = sleep_sessions.raw_record_id
             )
             WHERE synced_at IS NULL",
            [],
        )?;
        self.conn.execute(
            "UPDATE workouts
             SET synced_at = (
                 SELECT fetched_at FROM raw_records
                 WHERE raw_records.id = workouts.raw_record_id
             )
             WHERE synced_at IS NULL",
            [],
        )?;
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
        self.ensure_cloud_sync_metadata()?;
        Ok(())
    }

    fn ensure_cloud_sync_metadata(&self) -> Result<()> {
        if self.get_app_meta(LAST_CLOUD_SYNC_AT_KEY)?.is_some() {
            return Ok(());
        }
        let latest_fetch =
            self.conn
                .query_row("SELECT MAX(fetched_at) FROM raw_records", [], |row| {
                    row.get::<_, Option<String>>(0)
                })?;
        if let Some(timestamp) = latest_fetch {
            self.set_app_meta(LAST_CLOUD_SYNC_AT_KEY, &timestamp)?;
            self.set_app_meta(LAST_CLOUD_SYNC_OUTCOME_KEY, "updated")?;
        }
        Ok(())
    }

    fn set_app_meta(&self, key: &str, value: &str) -> Result<()> {
        self.conn.execute(
            "INSERT INTO app_meta(key, value, updated_at)
             VALUES(?1, ?2, ?3)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
            params![key, value, Utc::now().to_rfc3339()],
        )?;
        Ok(())
    }

    fn get_app_meta(&self, key: &str) -> Result<Option<String>> {
        self.conn
            .query_row("SELECT value FROM app_meta WHERE key = ?1", [key], |row| {
                row.get(0)
            })
            .optional()
            .map_err(Into::into)
    }

    pub fn cloud_sync_metadata(&self) -> Result<(Option<String>, Option<String>)> {
        Ok((
            self.get_app_meta(LAST_CLOUD_SYNC_AT_KEY)?,
            self.get_app_meta(LAST_CLOUD_SYNC_OUTCOME_KEY)?,
        ))
    }

    pub fn record_cloud_sync(&self, finished_at: &str, outcome: &str) -> Result<()> {
        self.set_app_meta(LAST_CLOUD_SYNC_AT_KEY, finished_at)?;
        self.set_app_meta(LAST_CLOUD_SYNC_OUTCOME_KEY, outcome)
    }

    pub fn user_prefs(&self) -> Result<UserPrefs> {
        Ok(UserPrefs {
            retention_days: self
                .read_pref_days(RETENTION_DAYS_KEY, UserPrefs::DEFAULT_RETENTION_DAYS)?,
            history_sync_days: self
                .read_pref_days(HISTORY_SYNC_DAYS_KEY, UserPrefs::DEFAULT_HISTORY_SYNC_DAYS)?,
        })
    }

    pub fn set_user_prefs(&self, prefs: &UserPrefs) -> Result<UserPrefs> {
        let retention_days =
            UserPrefs::clamp_days(prefs.retention_days).map_err(ZeppBridgeError::ConfigError)?;
        let history_sync_days =
            UserPrefs::clamp_days(prefs.history_sync_days).map_err(ZeppBridgeError::ConfigError)?;
        self.set_app_meta(RETENTION_DAYS_KEY, &retention_days.to_string())?;
        self.set_app_meta(HISTORY_SYNC_DAYS_KEY, &history_sync_days.to_string())?;
        Ok(UserPrefs {
            retention_days,
            history_sync_days,
        })
    }

    fn read_pref_days(&self, key: &str, default: i64) -> Result<i64> {
        match self.get_app_meta(key)? {
            Some(value) => Ok(value
                .parse::<i64>()
                .ok()
                .and_then(|days| UserPrefs::clamp_days(days).ok())
                .unwrap_or(default)),
            None => Ok(default),
        }
    }

    pub fn storage_estimate(
        &self,
        days: i64,
        data_dir: &std::path::Path,
    ) -> Result<StorageEstimate> {
        let days = UserPrefs::clamp_days(days).map_err(ZeppBridgeError::ConfigError)?;
        let database_bytes = std::fs::metadata(data_dir.join("zepp.db"))
            .map(|meta| meta.len())
            .unwrap_or(0);
        let estimated_add_bytes = (days as u64).saturating_mul(BYTES_PER_HISTORY_DAY);
        let free_bytes = disk_free_bytes(data_dir).unwrap_or(0);
        let warn_tight_space =
            free_bytes < 1_073_741_824 || (free_bytes > 0 && estimated_add_bytes > free_bytes / 5);
        let allow_long_history = !(free_bytes > 0 && free_bytes < 300 * 1024 * 1024 && days >= 90);
        let message = if free_bytes == 0 {
            "未能读取磁盘剩余空间，补拉前请确认本机还有足够空间。".into()
        } else if !allow_long_history {
            "磁盘剩余不足 300 MB，不能补拉 90 天以上的历史。".into()
        } else if warn_tight_space {
            "磁盘空间较紧，建议先只补拉 30 天。".into()
        } else {
            format!(
                "本盘大约剩余 {}，这次补拉大约占用 {}。",
                format_bytes(free_bytes),
                format_bytes(estimated_add_bytes)
            )
        };
        Ok(StorageEstimate {
            free_bytes,
            estimated_add_bytes,
            database_bytes,
            allow_long_history,
            warn_tight_space,
            message,
        })
    }

    pub fn heart_rate_series(&self, hours: i64) -> Result<Vec<HeartRatePoint>> {
        let hours = hours.clamp(1, 24 * 14);
        let cutoff = (Utc::now() - chrono::Duration::hours(hours)).to_rfc3339();
        // Two sources (band_data device rows, heartRate API user_fused
        // rows) can hold the same minute; collapse to one row per timestamp
        // preferring user_fused so charts never draw duplicate points.
        let mut stmt = self.conn.prepare(
            "SELECT m.timestamp, m.value
             FROM metric_samples m
             WHERE m.metric = 'heart_rate' AND m.timestamp >= ?1
               AND m.id = (
                   SELECT id FROM metric_samples
                   WHERE metric = 'heart_rate' AND timestamp = m.timestamp
                   ORDER BY CASE source_scope
                       WHEN 'user_fused' THEN 0
                       WHEN 'device' THEN 1
                       ELSE 2 END, id
                   LIMIT 1)
             ORDER BY m.timestamp ASC",
        )?;
        let rows = stmt.query_map([cutoff], |row| {
            Ok(HeartRatePoint {
                timestamp: row.get(0)?,
                value: row.get(1)?,
            })
        })?;
        rows.collect::<std::result::Result<Vec<_>, _>>()
            .map_err(Into::into)
    }

    pub fn training_load_series(&self, days: i64) -> Result<Vec<DailyPoint>> {
        let days = days.clamp(1, 365);
        let cutoff = (Utc::now() - chrono::Duration::days(days))
            .date_naive()
            .format("%Y-%m-%d")
            .to_string();
        let mut stmt = self.conn.prepare(
            "SELECT date, value FROM daily_metrics
             WHERE metric = 'training_load' AND date >= ?1
             ORDER BY date ASC",
        )?;
        let rows = stmt.query_map([cutoff], |row| {
            Ok(DailyPoint {
                date: row.get(0)?,
                value: row.get(1)?,
            })
        })?;
        rows.collect::<std::result::Result<Vec<_>, _>>()
            .map_err(Into::into)
    }

    pub fn stream_freshness(&self) -> Result<BTreeMap<String, StreamFreshness>> {
        let mut freshness = BTreeMap::<String, StreamFreshness>::new();
        let mut stmt = self.conn.prepare(
            "SELECT stream, MAX(fetched_at) FROM raw_records GROUP BY stream ORDER BY stream",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?))
        })?;
        for row in rows {
            let (stream, timestamp) = row?;
            freshness.entry(stream).or_default().last_cloud_sync_at = timestamp;
        }

        // Heart-rate can legitimately fall back to minute samples decoded from
        // band_data, so the sleep fetch is also a heart-rate cloud source.
        let sleep_fetch = freshness
            .get("sleep")
            .and_then(|value| value.last_cloud_sync_at.clone());
        if let Some(sleep_fetch) = sleep_fetch {
            let heart_rate = freshness.entry("heart_rate".into()).or_default();
            if heart_rate.last_cloud_sync_at.as_deref() < Some(sleep_fetch.as_str()) {
                heart_rate.last_cloud_sync_at = Some(sleep_fetch);
            }
        }

        for (stream, query) in [
            (
                "heart_rate",
                "SELECT MAX(timestamp) FROM metric_samples WHERE metric = 'heart_rate'",
            ),
            (
                "hrv",
                "SELECT MAX(timestamp) FROM metric_samples WHERE metric = 'hrv'",
            ),
            ("daily_summary", "SELECT MAX(date) FROM daily_metrics"),
            ("sleep", "SELECT MAX(end_time) FROM sleep_sessions"),
            ("workouts", "SELECT MAX(end_time) FROM workouts"),
        ] {
            let timestamp = self
                .conn
                .query_row(query, [], |row| row.get::<_, Option<String>>(0))?;
            freshness.entry(stream.into()).or_default().newest_sample_at = timestamp;
        }
        Ok(freshness)
    }

    pub fn newest_samples(&self) -> Result<BTreeMap<String, Option<String>>> {
        Ok(self
            .stream_freshness()?
            .into_iter()
            .map(|(stream, value)| (stream, value.newest_sample_at))
            .collect())
    }

    fn ensure_table_columns(&self, table: &str, columns: &[(&str, &str)]) -> Result<()> {
        let mut stmt = self.conn.prepare(&format!("PRAGMA table_info({table})"))?;
        let existing = stmt
            .query_map([], |row| row.get::<_, String>(1))?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        for (name, definition) in columns {
            if !existing.iter().any(|value| value == name) {
                self.conn.execute(
                    &format!("ALTER TABLE {table} ADD COLUMN {name} {definition}"),
                    [],
                )?;
            }
        }
        Ok(())
    }

    pub fn insert_raw_record(&self, record: &RawRecord) -> Result<i64> {
        let payload = serde_json::to_string(&record.payload)
            .map_err(|error| ZeppBridgeError::ParseError(error.to_string()))?;
        let mut hasher = Sha256::new();
        hasher.update(payload.as_bytes());
        let payload_hash = hex::encode(hasher.finalize());
        let fetched_at = Utc::now().to_rfc3339();
        self.conn.execute(
            "INSERT INTO raw_records
                (stream, source_key, source_scope, device_id, start_utc, end_utc,
                 payload, payload_hash, fetched_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
             ON CONFLICT(stream, source_key) DO UPDATE SET
                source_scope = excluded.source_scope,
                device_id = excluded.device_id,
                start_utc = excluded.start_utc,
                end_utc = excluded.end_utc,
                payload = excluded.payload,
                payload_hash = excluded.payload_hash,
                fetched_at = excluded.fetched_at",
            params![
                record.stream,
                record.source_key,
                record.source_scope.as_str(),
                record.device_id,
                record.start_utc.to_rfc3339(),
                record.end_utc.map(|value| value.to_rfc3339()),
                payload,
                payload_hash,
                fetched_at,
            ],
        )?;
        self.conn
            .query_row(
                "SELECT id FROM raw_records WHERE stream = ?1 AND source_key = ?2",
                params![record.stream, record.source_key],
                |row| row.get(0),
            )
            .map_err(Into::into)
    }

    pub fn normalize_and_persist_raw(
        &self,
        raw_record_id: i64,
        stream: &str,
        source_key: &str,
        payload: &serde_json::Value,
    ) -> Result<NormalizationCounts> {
        let mut counts = NormalizationCounts::default();
        match stream {
            "heart_rate" => {
                let rows = Normalizer::normalize_heart_rate(payload)?;
                counts.primary_records = rows.len() as i64;
                self.clear_normalized_for_raw(raw_record_id, stream)?;
                for row in rows {
                    self.insert_metric_sample_with_raw(&row, Some(raw_record_id))?;
                }
            }
            "hrv" => {
                let rows = Normalizer::normalize_hrv(payload)?;
                counts.primary_records = rows.len() as i64;
                self.clear_normalized_for_raw(raw_record_id, stream)?;
                for row in rows {
                    self.insert_metric_sample_with_raw(&row, Some(raw_record_id))?;
                }
            }
            "daily_summary" => {
                let rows = Normalizer::normalize_daily_summary(payload)?;
                counts.primary_records = rows.len() as i64;
                self.clear_normalized_for_raw(raw_record_id, stream)?;
                for row in rows {
                    self.insert_daily_metric_with_raw(&row, Some(raw_record_id))?;
                }
            }
            "sleep" => {
                let band = Normalizer::normalize_band_data(payload)?;
                if band.sleep_sessions.is_empty()
                    && band.heart_rate_samples.is_empty()
                    && band.daily_metrics.is_empty()
                {
                    let detail = if band.diagnostics.is_empty() {
                        "band_data 没有可识别记录".to_string()
                    } else {
                        band.diagnostics.join("; ")
                    };
                    return Err(ZeppBridgeError::DataUnavailable(detail));
                }
                counts.primary_records = band.sleep_sessions.len() as i64;
                counts.band_heart_rate_records = band.heart_rate_samples.len() as i64;
                counts.supplemental_daily_records = band.daily_metrics.len() as i64;
                self.clear_normalized_for_raw(raw_record_id, stream)?;
                for row in band.sleep_sessions {
                    self.insert_sleep_session_with_raw(&row, Some(raw_record_id))?;
                }
                for row in band.heart_rate_samples {
                    self.insert_metric_sample_with_raw(&row, Some(raw_record_id))?;
                }
                for row in band.daily_metrics {
                    self.insert_daily_metric_with_raw(&row, Some(raw_record_id))?;
                }
                self.harvest_device_identities(payload)?;
            }
            "workouts" => {
                let sport = source_key
                    .strip_prefix("sport_history:")
                    .and_then(|value| value.split(':').next());
                let rows = Normalizer::normalize_workouts_with_sport(payload, sport)?;
                counts.primary_records = rows.len() as i64;
                self.clear_normalized_for_raw(raw_record_id, stream)?;
                for row in rows {
                    self.insert_workout_with_raw(&row, Some(raw_record_id))?;
                }
                self.harvest_device_identities(payload)?;
            }
            "workout_detail" => {
                let workout_id = workout_id_from_detail_key(source_key).ok_or_else(|| {
                    ZeppBridgeError::ConfigError("workout_detail source_key 无效".into())
                })?;
                if !self.workout_exists(&workout_id)? {
                    return Err(ZeppBridgeError::DataUnavailable(
                        "detail 对应的训练摘要还不存在".into(),
                    ));
                }
                let summary_end = self.workout_end_time(&workout_id)?;
                let decoded = decode_workout_detail(payload, summary_end)?;
                self.replace_workout_series(&workout_id, &decoded)?;
                counts.primary_records =
                    (decoded.samples.len() + decoded.route.len() + decoded.pauses.len()) as i64;
            }
            other => return Err(ZeppBridgeError::ConfigError(format!("未知同步流: {other}"))),
        }
        Ok(counts)
    }

    fn clear_normalized_for_raw(&self, raw_record_id: i64, stream: &str) -> Result<()> {
        match stream {
            "heart_rate" | "hrv" => {
                self.conn.execute(
                    "DELETE FROM metric_samples WHERE raw_record_id = ?1",
                    [raw_record_id],
                )?;
            }
            "daily_summary" => {
                self.conn.execute(
                    "DELETE FROM daily_metrics WHERE raw_record_id = ?1",
                    [raw_record_id],
                )?;
            }
            "sleep" => {
                self.conn.execute(
                    "DELETE FROM metric_samples WHERE raw_record_id = ?1",
                    [raw_record_id],
                )?;
                self.conn.execute(
                    "DELETE FROM daily_metrics WHERE raw_record_id = ?1",
                    [raw_record_id],
                )?;
                self.conn.execute(
                    "DELETE FROM sleep_sessions WHERE raw_record_id = ?1",
                    [raw_record_id],
                )?;
            }
            "workouts" => {
                self.conn.execute(
                    "DELETE FROM workouts WHERE raw_record_id = ?1",
                    [raw_record_id],
                )?;
            }
            "workout_detail" => {}
            _ => {}
        }
        Ok(())
    }

    pub fn reprocess_raw_records_if_needed(&self) -> Result<Option<BTreeMap<String, i64>>> {
        let current = self
            .conn
            .query_row(
                "SELECT value FROM app_meta WHERE key = 'normalizer_revision'",
                [],
                |row| row.get::<_, String>(0),
            )
            .optional()?;
        if current.as_deref() == Some(NORMALIZER_REVISION) {
            return Ok(None);
        }
        self.reprocess_raw_records().map(Some)
    }

    pub fn reprocess_raw_records(&self) -> Result<BTreeMap<String, i64>> {
        let raw_records = {
            let mut stmt = self
                .conn
                .prepare("SELECT id, stream, source_key, payload FROM raw_records ORDER BY id")?;
            let rows = stmt.query_map([], |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                ))
            })?;
            rows.collect::<std::result::Result<Vec<_>, _>>()?
        };

        let mut counts = BTreeMap::<String, i64>::new();
        let mut band_heart_rate = 0i64;
        for (id, stream, source_key, encoded_payload) in raw_records {
            let payload: serde_json::Value = serde_json::from_str(&encoded_payload)
                .map_err(|error| ZeppBridgeError::ParseError(error.to_string()))?;
            if let Ok(result) = self.normalize_and_persist_raw(id, &stream, &source_key, &payload) {
                *counts.entry(stream.clone()).or_default() += result.primary_records;
                band_heart_rate += result.band_heart_rate_records;
            }
        }
        if band_heart_rate > 0 {
            counts.insert("heart_rate".to_string(), band_heart_rate);
        }

        for stream in counts.keys().cloned().collect::<Vec<_>>() {
            counts.insert(stream.clone(), self.normalized_stream_count(&stream)?);
        }

        self.conn.execute(
            "INSERT INTO app_meta(key, value, updated_at)
             VALUES('normalizer_revision', ?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
            params![NORMALIZER_REVISION, Utc::now().to_rfc3339()],
        )?;
        self.set_app_meta(LAST_LOCAL_REPROCESS_AT_KEY, &Utc::now().to_rfc3339())?;
        Ok(counts)
    }

    fn normalized_stream_count(&self, stream: &str) -> Result<i64> {
        let (query, parameter): (&str, Option<&str>) = match stream {
            "heart_rate" => (
                "SELECT COUNT(*) FROM metric_samples WHERE metric = ?1",
                Some("heart_rate"),
            ),
            "hrv" => (
                "SELECT COUNT(*) FROM metric_samples WHERE metric = ?1",
                Some("hrv"),
            ),
            "daily_summary" => ("SELECT COUNT(*) FROM daily_metrics", None),
            "sleep" => ("SELECT COUNT(*) FROM sleep_sessions", None),
            "workouts" => ("SELECT COUNT(*) FROM workouts", None),
            "workout_detail" => ("SELECT COUNT(*) FROM workout_samples", None),
            _ => return Ok(0),
        };
        if let Some(parameter) = parameter {
            self.conn
                .query_row(query, [parameter], |row| row.get(0))
                .map_err(Into::into)
        } else {
            self.conn
                .query_row(query, [], |row| row.get(0))
                .map_err(Into::into)
        }
    }

    #[cfg(test)]
    pub fn insert_metric_sample(&self, sample: &MetricSample) -> Result<()> {
        self.insert_metric_sample_with_raw(sample, None)
    }

    pub fn insert_metric_sample_with_raw(
        &self,
        sample: &MetricSample,
        raw_record_id: Option<i64>,
    ) -> Result<()> {
        self.conn.execute(
            "INSERT INTO metric_samples
                (metric, timestamp, value, unit, source_scope, device_id, raw_record_id)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
             ON CONFLICT DO UPDATE SET
                value = excluded.value,
                source_scope = excluded.source_scope,
                raw_record_id = COALESCE(excluded.raw_record_id, metric_samples.raw_record_id)",
            params![
                sample.metric,
                sample.timestamp.to_rfc3339(),
                sample.value,
                sample.unit,
                sample.source_scope.as_str(),
                sample.device_id,
                raw_record_id,
            ],
        )?;
        Ok(())
    }

    #[allow(dead_code)]
    #[allow(dead_code)]
    pub fn insert_daily_metric(&self, metric: &DailyMetric) -> Result<()> {
        self.insert_daily_metric_with_raw(metric, None)
    }

    pub fn insert_daily_metric_with_raw(
        &self,
        metric: &DailyMetric,
        raw_record_id: Option<i64>,
    ) -> Result<()> {
        self.conn.execute(
            "INSERT INTO daily_metrics
                (date, metric, value, unit, source_scope, device_id, raw_record_id)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
             ON CONFLICT DO UPDATE SET
                value = excluded.value,
                source_scope = excluded.source_scope,
                raw_record_id = COALESCE(excluded.raw_record_id, daily_metrics.raw_record_id)",
            params![
                metric.date,
                metric.metric,
                metric.value,
                metric.unit,
                metric.source_scope.as_str(),
                metric.device_id,
                raw_record_id,
            ],
        )?;
        Ok(())
    }

    #[allow(dead_code)]
    pub fn insert_sleep_session(&self, sleep: &SleepSession) -> Result<()> {
        self.insert_sleep_session_with_raw(sleep, None)
    }

    pub fn insert_sleep_session_with_raw(
        &self,
        sleep: &SleepSession,
        raw_record_id: Option<i64>,
    ) -> Result<()> {
        let synced_at = sleep
            .synced_at
            .or_else(|| self.fetched_at_for_raw(raw_record_id))
            .unwrap_or_else(Utc::now);
        self.conn.execute(
            "INSERT INTO sleep_sessions
                (sleep_id, start_time, end_time, score, duration_minutes,
                 deep_minutes, light_minutes, rem_minutes, rem_available, awake_minutes,
                 source_scope, device_id, raw_record_id, synced_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
             ON CONFLICT(sleep_id) DO UPDATE SET
                start_time = excluded.start_time,
                end_time = excluded.end_time,
                score = excluded.score,
                duration_minutes = excluded.duration_minutes,
                deep_minutes = excluded.deep_minutes,
                light_minutes = excluded.light_minutes,
                rem_minutes = excluded.rem_minutes,
                rem_available = excluded.rem_available,
                awake_minutes = excluded.awake_minutes,
                source_scope = excluded.source_scope,
                device_id = excluded.device_id,
                raw_record_id = COALESCE(excluded.raw_record_id, sleep_sessions.raw_record_id),
                synced_at = COALESCE(sleep_sessions.synced_at, excluded.synced_at)",
            params![
                sleep.sleep_id,
                sleep.start_time.to_rfc3339(),
                sleep.end_time.to_rfc3339(),
                sleep.score,
                sleep.duration_minutes,
                sleep.deep_minutes,
                sleep.light_minutes,
                sleep.rem_minutes.unwrap_or(0),
                i64::from(sleep.rem_minutes.is_some()),
                sleep.awake_minutes,
                sleep.source_scope.as_str(),
                sleep.device_id,
                raw_record_id,
                synced_at.to_rfc3339(),
            ],
        )?;
        self.replace_sleep_stages(&sleep.sleep_id, &sleep.stages)?;
        Ok(())
    }

    #[allow(dead_code)]
    pub fn insert_workout(&self, workout: &Workout) -> Result<()> {
        self.insert_workout_with_raw(workout, None)
    }

    pub fn insert_workout_with_raw(
        &self,
        workout: &Workout,
        raw_record_id: Option<i64>,
    ) -> Result<()> {
        let synced_at = workout
            .synced_at
            .or_else(|| self.fetched_at_for_raw(raw_record_id))
            .unwrap_or_else(Utc::now);
        self.conn.execute(
            "INSERT INTO workouts
                (workout_id, workout_type, start_time, end_time, distance_meters,
                 calories, avg_hr, max_hr, training_load, vo2max,
                 source_scope, device_id, raw_record_id, synced_at,
                 gps_available, sample_count, zepp_source, zepp_type)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18)
             ON CONFLICT(workout_id) DO UPDATE SET
                workout_type = excluded.workout_type,
                start_time = excluded.start_time,
                end_time = excluded.end_time,
                distance_meters = excluded.distance_meters,
                calories = excluded.calories,
                avg_hr = excluded.avg_hr,
                max_hr = excluded.max_hr,
                training_load = excluded.training_load,
                vo2max = excluded.vo2max,
                source_scope = excluded.source_scope,
                device_id = excluded.device_id,
                raw_record_id = COALESCE(excluded.raw_record_id, workouts.raw_record_id),
                synced_at = COALESCE(workouts.synced_at, excluded.synced_at),
                gps_available = CASE
                    WHEN excluded.gps_available > workouts.gps_available THEN excluded.gps_available
                    ELSE workouts.gps_available
                END,
                sample_count = CASE
                    WHEN excluded.sample_count > workouts.sample_count THEN excluded.sample_count
                    ELSE workouts.sample_count
                END,
                zepp_source = COALESCE(excluded.zepp_source, workouts.zepp_source),
                zepp_type = COALESCE(excluded.zepp_type, workouts.zepp_type)",
            params![
                workout.workout_id,
                workout.workout_type,
                workout.start_time.to_rfc3339(),
                workout.end_time.to_rfc3339(),
                workout.distance_meters,
                workout.calories,
                workout.avg_hr,
                workout.max_hr,
                workout.training_load,
                workout.vo2max,
                workout.source_scope.as_str(),
                workout.device_id,
                raw_record_id,
                synced_at.to_rfc3339(),
                i64::from(workout.gps_available),
                workout.sample_count,
                workout.zepp_source,
                workout.zepp_type,
            ],
        )?;
        Ok(())
    }

    fn workout_exists(&self, workout_id: &str) -> Result<bool> {
        let count: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM workouts WHERE workout_id = ?1",
            [workout_id],
            |row| row.get(0),
        )?;
        Ok(count > 0)
    }

    fn workout_end_time(&self, workout_id: &str) -> Result<Option<DateTime<Utc>>> {
        let value: Option<String> = self
            .conn
            .query_row(
                "SELECT end_time FROM workouts WHERE workout_id = ?1",
                [workout_id],
                |row| row.get(0),
            )
            .optional()?;
        value
            .map(|text| parse_datetime(&text, "workouts.end_time"))
            .transpose()
    }

    pub fn pending_running_details(&self) -> Result<Vec<PendingWorkoutDetail>> {
        let mut stmt = self.conn.prepare(
            "SELECT workout_id, zepp_source FROM workouts
             WHERE zepp_source IS NOT NULL
               AND TRIM(zepp_source) != ''
               AND NOT EXISTS (
                   SELECT 1 FROM raw_records
                   WHERE stream = 'workout_detail'
                     AND source_key = 'workout_detail:' || workouts.workout_id || ':' || workouts.zepp_source
               )
             ORDER BY start_time DESC",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(PendingWorkoutDetail {
                workout_id: row.get(0)?,
                source: row.get(1)?,
            })
        })?;
        rows.collect::<std::result::Result<Vec<_>, _>>()
            .map_err(Into::into)
    }

    pub fn replace_workout_series(&self, workout_id: &str, decoded: &DecodedWorkout) -> Result<()> {
        self.conn.execute(
            "DELETE FROM workout_samples WHERE workout_id = ?1",
            [workout_id],
        )?;
        self.conn.execute(
            "DELETE FROM route_points WHERE workout_id = ?1",
            [workout_id],
        )?;
        self.conn.execute(
            "DELETE FROM workout_pauses WHERE workout_id = ?1",
            [workout_id],
        )?;

        {
            let mut insert = self.conn.prepare(
                "INSERT INTO workout_samples
                    (workout_id, timestamp, heart_rate, pace, speed, cadence, altitude, stride)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            )?;
            for sample in &decoded.samples {
                insert.execute(params![
                    workout_id,
                    sample.timestamp.to_rfc3339(),
                    sample.heart_rate,
                    sample.pace,
                    sample.speed,
                    sample.cadence,
                    sample.altitude_m,
                    sample.stride_cm,
                ])?;
            }
        }
        {
            let mut insert = self.conn.prepare(
                "INSERT INTO route_points
                    (workout_id, timestamp, latitude, longitude, altitude)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
            )?;
            for point in &decoded.route {
                insert.execute(params![
                    workout_id,
                    point.timestamp.to_rfc3339(),
                    point.latitude,
                    point.longitude,
                    point.altitude_m,
                ])?;
            }
        }
        {
            let mut insert = self.conn.prepare(
                "INSERT INTO workout_pauses
                    (workout_id, start_time, end_time, kind)
                 VALUES (?1, ?2, ?3, ?4)",
            )?;
            for pause in &decoded.pauses {
                insert.execute(params![
                    workout_id,
                    pause.start_time.to_rfc3339(),
                    pause.end_time.to_rfc3339(),
                    pause.kind,
                ])?;
            }
        }

        self.conn.execute(
            "UPDATE workouts
             SET gps_available = CASE WHEN ?2 > 0 THEN 1 ELSE gps_available END,
                 sample_count = ?3
             WHERE workout_id = ?1",
            params![
                workout_id,
                decoded.route.len() as i64,
                decoded.samples.len() as i64,
            ],
        )?;
        Ok(())
    }

    pub fn get_workout_series(&self, workout_id: &str) -> Result<WorkoutSeries> {
        let samples = {
            let mut stmt = self.conn.prepare(
                "SELECT timestamp, heart_rate, pace, speed, cadence, altitude, stride
                 FROM workout_samples WHERE workout_id = ?1 ORDER BY timestamp",
            )?;
            let rows = stmt.query_map([workout_id], |row| {
                Ok(WorkoutSeriesSample {
                    timestamp: row.get(0)?,
                    heart_rate: row.get(1)?,
                    pace: row.get(2)?,
                    speed: row.get(3)?,
                    cadence: row.get(4)?,
                    altitude_m: row.get(5)?,
                    stride_cm: row.get(6)?,
                })
            })?;
            rows.collect::<std::result::Result<Vec<_>, _>>()?
        };

        let route = {
            let mut stmt = self.conn.prepare(
                "SELECT timestamp, latitude, longitude, altitude
                 FROM route_points WHERE workout_id = ?1 ORDER BY timestamp",
            )?;
            let rows = stmt.query_map([workout_id], |row| {
                Ok(WorkoutRoutePoint {
                    timestamp: row.get(0)?,
                    latitude: row.get(1)?,
                    longitude: row.get(2)?,
                    altitude_m: row.get(3)?,
                })
            })?;
            rows.collect::<std::result::Result<Vec<_>, _>>()?
        };

        let pauses = {
            let mut stmt = self.conn.prepare(
                "SELECT start_time, end_time, kind
                 FROM workout_pauses WHERE workout_id = ?1 ORDER BY start_time",
            )?;
            let rows = stmt.query_map([workout_id], |row| {
                Ok(WorkoutPause {
                    start_time: row.get(0)?,
                    end_time: row.get(1)?,
                    kind: row.get(2)?,
                })
            })?;
            rows.collect::<std::result::Result<Vec<_>, _>>()?
        };

        Ok(WorkoutSeries {
            workout_id: workout_id.to_owned(),
            samples,
            route,
            pauses,
        })
    }

    fn fetched_at_for_raw(&self, raw_record_id: Option<i64>) -> Option<DateTime<Utc>> {
        let raw_record_id = raw_record_id?;
        let timestamp: Option<String> = self
            .conn
            .query_row(
                "SELECT fetched_at FROM raw_records WHERE id = ?1",
                [raw_record_id],
                |row| row.get(0),
            )
            .optional()
            .ok()
            .flatten();
        timestamp.and_then(|value| parse_datetime(&value, "raw_records.fetched_at").ok())
    }

    fn replace_sleep_stages(&self, sleep_id: &str, stages: &[SleepStageSlice]) -> Result<()> {
        self.conn
            .execute("DELETE FROM sleep_stages WHERE sleep_id = ?1", [sleep_id])?;
        for stage in stages {
            self.conn.execute(
                "INSERT INTO sleep_stages (sleep_id, stage, start_time, end_time)
                 VALUES (?1, ?2, ?3, ?4)",
                params![
                    sleep_id,
                    stage.stage,
                    stage.start_time.to_rfc3339(),
                    stage.end_time.to_rfc3339(),
                ],
            )?;
        }
        Ok(())
    }

    fn load_sleep_stages(&self, sleep_id: &str) -> Result<Vec<SleepStageSlice>> {
        let mut stmt = self.conn.prepare(
            "SELECT stage, start_time, end_time FROM sleep_stages
             WHERE sleep_id = ?1 ORDER BY start_time, id",
        )?;
        let rows = stmt.query_map([sleep_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        })?;
        let mut stages = Vec::new();
        for row in rows {
            let (stage, start, end) = row?;
            stages.push(SleepStageSlice {
                stage,
                start_time: parse_datetime(&start, "sleep_stages.start_time")?,
                end_time: parse_datetime(&end, "sleep_stages.end_time")?,
            });
        }
        Ok(stages)
    }

    pub fn upsert_device_identity(&self, hint: &DeviceIdentityHint) -> Result<()> {
        let updated_at = Utc::now().to_rfc3339();
        let mut aliases = hint.aliases.clone();
        if let Some(device_id) = hint.device_id.as_ref() {
            aliases.push(device_id.clone());
        }
        if let Some(serial) = hint.serial.as_ref() {
            aliases.push(serial.clone());
        }
        aliases.retain(|value| !value.trim().is_empty());
        aliases.sort();
        aliases.dedup();
        for alias in aliases {
            self.conn.execute(
                "INSERT INTO device_identities
                    (alias, name, firmware, serial, device_id, timezone, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
                 ON CONFLICT(alias) DO UPDATE SET
                    name = COALESCE(excluded.name, device_identities.name),
                    firmware = COALESCE(excluded.firmware, device_identities.firmware),
                    serial = COALESCE(excluded.serial, device_identities.serial),
                    device_id = COALESCE(excluded.device_id, device_identities.device_id),
                    timezone = COALESCE(excluded.timezone, device_identities.timezone),
                    updated_at = excluded.updated_at",
                params![
                    alias,
                    hint.name,
                    hint.firmware,
                    hint.serial,
                    hint.device_id,
                    hint.timezone,
                    updated_at,
                ],
            )?;
        }
        Ok(())
    }

    pub fn lookup_device_profile(&self, device_id: &str) -> Result<Option<DeviceProfile>> {
        let trimmed = device_id.trim();
        if trimmed.is_empty() {
            return Ok(None);
        }
        self.conn
            .query_row(
                "SELECT name, firmware, serial, device_id, timezone
                 FROM device_identities WHERE lower(alias) = lower(?1) LIMIT 1",
                [trimmed],
                |row| {
                    Ok(DeviceProfile {
                        name: row.get(0)?,
                        firmware: row.get(1)?,
                        serial: row.get(2)?,
                        device_id: row.get(3)?,
                        timezone: row.get(4)?,
                        ..DeviceProfile::default()
                    })
                },
            )
            .optional()
            .map_err(Into::into)
    }

    /// Derive local-data presence from normalized records without introducing
    /// a product-specific table. User-level fused records are deliberately
    /// excluded: they cannot be attributed to one physical device.
    pub fn device_data_summary(&self, aliases: &[String]) -> Result<(bool, Option<String>)> {
        let mut normalized_aliases = Vec::new();
        for alias in aliases {
            let trimmed = alias.trim();
            if trimmed.is_empty()
                || normalized_aliases
                    .iter()
                    .any(|existing: &String| existing.eq_ignore_ascii_case(trimmed))
            {
                continue;
            }
            normalized_aliases.push(trimmed.to_string());
        }
        if normalized_aliases.is_empty() {
            return Ok((false, None));
        }

        let mut latest: Option<String> = None;
        for alias in &normalized_aliases {
            for (table, column) in [
                ("metric_samples", "timestamp"),
                ("daily_metrics", "date"),
                ("sleep_sessions", "start_time"),
                ("workouts", "start_time"),
            ] {
                let sql = format!(
                    "SELECT MAX({column}) FROM {table}
                     WHERE lower(device_id) = lower(?1)
                       AND lower(source_scope) = 'device'"
                );
                let value: Option<String> = self.conn.query_row(&sql, [alias], |row| row.get(0))?;
                if let Some(value) = value {
                    if latest
                        .as_ref()
                        .map(|current| value.as_str() > current.as_str())
                        .unwrap_or(true)
                    {
                        latest = Some(value);
                    }
                }
            }
        }
        Ok((latest.is_some(), latest))
    }

    fn harvest_device_identities(&self, payload: &serde_json::Value) -> Result<()> {
        for hint in device_identity_hints(payload) {
            self.upsert_device_identity(&hint)?;
        }
        Ok(())
    }

    fn get_latest_heart_rate_sample(&self) -> Result<Option<(i32, String)>> {
        let value: Option<(f64, String)> = self
            .conn
            .query_row(
                "SELECT value, timestamp FROM metric_samples
                 WHERE metric = 'heart_rate'
                 ORDER BY timestamp DESC,
                    CASE source_scope WHEN 'user_fused' THEN 0 WHEN 'device' THEN 1 ELSE 2 END,
                    id DESC LIMIT 1",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()?;
        Ok(value.map(|(value, timestamp)| (value.round() as i32, timestamp)))
    }

    pub fn get_recent_sleep_sessions(&self, limit: usize) -> Result<Vec<SleepSession>> {
        let limit = i64::try_from(limit).unwrap_or(i64::MAX).max(0);
        let mut stmt = self.conn.prepare(
            "SELECT sleep_id, start_time, end_time, score, duration_minutes,
                    deep_minutes, light_minutes, rem_minutes, rem_available, awake_minutes,
                    source_scope, device_id, synced_at
             FROM sleep_sessions ORDER BY start_time DESC LIMIT ?1",
        )?;
        let rows = stmt.query_map([limit], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, Option<i32>>(3)?,
                row.get::<_, i32>(4)?,
                row.get::<_, i32>(5)?,
                row.get::<_, i32>(6)?,
                row.get::<_, i32>(7)?,
                row.get::<_, i64>(8)?,
                row.get::<_, i32>(9)?,
                row.get::<_, String>(10)?,
                row.get::<_, Option<String>>(11)?,
                row.get::<_, Option<String>>(12)?,
            ))
        })?;
        let mut sessions = Vec::new();
        for row in rows {
            let (
                sleep_id,
                start,
                end,
                score,
                duration_minutes,
                deep_minutes,
                light_minutes,
                rem_minutes,
                rem_available,
                awake_minutes,
                scope,
                device_id,
                synced_at,
            ) = row?;
            sessions.push(SleepSession {
                sleep_id,
                start_time: parse_datetime(&start, "sleep.start_time")?,
                end_time: parse_datetime(&end, "sleep.end_time")?,
                score,
                duration_minutes,
                deep_minutes,
                light_minutes,
                rem_minutes: (rem_available != 0).then_some(rem_minutes),
                awake_minutes,
                source_scope: parse_scope(&scope)?,
                device_id,
                synced_at: synced_at
                    .as_deref()
                    .map(|value| parse_datetime(value, "sleep.synced_at"))
                    .transpose()?,
                time_in_bed_minutes: None,
                stages: Vec::new(),
            });
        }
        Ok(sessions)
    }

    pub fn get_sleep_detail(&self, sleep_id: &str) -> Result<Option<SleepSession>> {
        let row = self
            .conn
            .query_row(
                "SELECT sleep_id, start_time, end_time, score, duration_minutes,
                        deep_minutes, light_minutes, rem_minutes, rem_available, awake_minutes,
                        source_scope, device_id, synced_at
                 FROM sleep_sessions WHERE sleep_id = ?1 LIMIT 1",
                [sleep_id],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, Option<i32>>(3)?,
                        row.get::<_, i32>(4)?,
                        row.get::<_, i32>(5)?,
                        row.get::<_, i32>(6)?,
                        row.get::<_, i32>(7)?,
                        row.get::<_, i64>(8)?,
                        row.get::<_, i32>(9)?,
                        row.get::<_, String>(10)?,
                        row.get::<_, Option<String>>(11)?,
                        row.get::<_, Option<String>>(12)?,
                    ))
                },
            )
            .optional()?;
        let Some((
            sleep_id,
            start,
            end,
            score,
            duration_minutes,
            deep_minutes,
            light_minutes,
            rem_minutes,
            rem_available,
            awake_minutes,
            scope,
            device_id,
            synced_at,
        )) = row
        else {
            return Ok(None);
        };
        let stages = self.load_sleep_stages(&sleep_id)?;
        Ok(Some(SleepSession {
            sleep_id,
            start_time: parse_datetime(&start, "sleep.start_time")?,
            end_time: parse_datetime(&end, "sleep.end_time")?,
            score,
            duration_minutes,
            deep_minutes,
            light_minutes,
            rem_minutes: (rem_available != 0).then_some(rem_minutes),
            awake_minutes,
            source_scope: parse_scope(&scope)?,
            device_id,
            synced_at: synced_at
                .as_deref()
                .map(|value| parse_datetime(value, "sleep.synced_at"))
                .transpose()?,
            time_in_bed_minutes: None,
            stages,
        }))
    }

    pub fn get_recent_workouts(&self, limit: usize) -> Result<Vec<Workout>> {
        let limit = i64::try_from(limit).unwrap_or(i64::MAX).max(0);
        let mut stmt = self.conn.prepare(
            "SELECT workout_id, workout_type, start_time, end_time,
                    distance_meters, calories, avg_hr, max_hr,
                    training_load, vo2max, source_scope, device_id,
                    synced_at, gps_available, sample_count
             FROM workouts ORDER BY start_time DESC LIMIT ?1",
        )?;
        let rows = stmt.query_map([limit], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, Option<f64>>(4)?,
                row.get::<_, Option<i32>>(5)?,
                row.get::<_, Option<i32>>(6)?,
                row.get::<_, Option<i32>>(7)?,
                row.get::<_, Option<f64>>(8)?,
                row.get::<_, Option<f64>>(9)?,
                row.get::<_, String>(10)?,
                row.get::<_, Option<String>>(11)?,
                row.get::<_, Option<String>>(12)?,
                row.get::<_, i64>(13)?,
                row.get::<_, i64>(14)?,
            ))
        })?;
        let mut workouts = Vec::new();
        for row in rows {
            let (
                workout_id,
                workout_type,
                start,
                end,
                distance_meters,
                calories,
                avg_hr,
                max_hr,
                training_load,
                vo2max,
                scope,
                device_id,
                synced_at,
                gps_available,
                sample_count,
            ) = row?;
            workouts.push(Workout {
                workout_id,
                workout_type,
                start_time: parse_datetime(&start, "workout.start_time")?,
                end_time: parse_datetime(&end, "workout.end_time")?,
                distance_meters,
                calories,
                avg_hr,
                max_hr,
                training_load,
                vo2max,
                source_scope: parse_scope(&scope)?,
                device_id,
                synced_at: synced_at
                    .as_deref()
                    .map(|value| parse_datetime(value, "workout.synced_at"))
                    .transpose()?,
                gps_available: gps_available != 0,
                sample_count,
                zepp_source: None,
                zepp_type: None,
            });
        }
        Ok(workouts)
    }

    pub fn get_workout_detail(&self, workout_id: &str) -> Result<Option<Workout>> {
        let row = self
            .conn
            .query_row(
                "SELECT workout_id, workout_type, start_time, end_time,
                        distance_meters, calories, avg_hr, max_hr,
                        training_load, vo2max, source_scope, device_id,
                        synced_at, gps_available, sample_count
                 FROM workouts WHERE workout_id = ?1 LIMIT 1",
                [workout_id],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, String>(3)?,
                        row.get::<_, Option<f64>>(4)?,
                        row.get::<_, Option<i32>>(5)?,
                        row.get::<_, Option<i32>>(6)?,
                        row.get::<_, Option<i32>>(7)?,
                        row.get::<_, Option<f64>>(8)?,
                        row.get::<_, Option<f64>>(9)?,
                        row.get::<_, String>(10)?,
                        row.get::<_, Option<String>>(11)?,
                        row.get::<_, Option<String>>(12)?,
                        row.get::<_, i64>(13)?,
                        row.get::<_, i64>(14)?,
                    ))
                },
            )
            .optional()?;
        let Some((
            workout_id,
            workout_type,
            start,
            end,
            distance_meters,
            calories,
            avg_hr,
            max_hr,
            training_load,
            vo2max,
            scope,
            device_id,
            synced_at,
            gps_available,
            sample_count,
        )) = row
        else {
            return Ok(None);
        };
        let route_points: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM route_points WHERE workout_id = ?1",
            [&workout_id],
            |row| row.get(0),
        )?;
        let stored_samples: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM workout_samples WHERE workout_id = ?1",
            [&workout_id],
            |row| row.get(0),
        )?;
        Ok(Some(Workout {
            workout_id,
            workout_type,
            start_time: parse_datetime(&start, "workout.start_time")?,
            end_time: parse_datetime(&end, "workout.end_time")?,
            distance_meters,
            calories,
            avg_hr,
            max_hr,
            training_load,
            vo2max,
            source_scope: parse_scope(&scope)?,
            device_id,
            synced_at: synced_at
                .as_deref()
                .map(|value| parse_datetime(value, "workout.synced_at"))
                .transpose()?,
            gps_available: gps_available != 0 || route_points > 0,
            sample_count: sample_count.max(stored_samples),
            zepp_source: None,
            zepp_type: None,
        }))
    }

    pub fn get_health_overview(&self) -> Result<HealthOverview> {
        let latest_heart_rate = self.get_latest_heart_rate_sample()?;
        let current_hr = latest_heart_rate.as_ref().map(|(value, _)| *value);
        let latest_heart_rate_at = latest_heart_rate.map(|(_, timestamp)| timestamp);
        let resting_hr = self.latest_daily_i32("resting_hr")?;
        let hrv = self.latest_metric_f64("hrv")?;
        let (last_updated, coverage, source_scope) = self.overview_metadata()?;
        let last_sleep_score = self
            .get_recent_sleep_sessions(1)?
            .into_iter()
            .next()
            .and_then(|sleep| sleep.score);
        Ok(HealthOverview {
            current_hr,
            resting_hr,
            hrv,
            last_sleep_score,
            readiness: self.latest_daily_f64("readiness")?,
            bio_charge: self.latest_daily_f64("bio_charge")?,
            hybrid_charge: self.latest_daily_f64("hybrid_charge")?,
            training_load: self.latest_daily_f64("training_load")?,
            vo2max: self.latest_daily_f64("vo2max")?,
            steps_today: self.latest_daily_i32_for_date("steps", Local::now().date_naive())?,
            active_calories_today: self
                .latest_daily_i32_for_date("active_calories", Local::now().date_naive())?
                .or(self.latest_daily_i32_for_date("calories", Local::now().date_naive())?),
            latest_heart_rate_at,
            last_updated,
            coverage,
            source_scope,
        })
    }

    fn overview_metadata(&self) -> Result<(Option<String>, Option<Coverage>, Option<String>)> {
        let last_updated = self.get_app_meta(LAST_CLOUD_SYNC_AT_KEY)?;
        let (start, end, stream_count, scope_count, only_scope) = self.conn.query_row(
            "SELECT MIN(day), MAX(day), COUNT(DISTINCT stream),
                    COUNT(DISTINCT source_scope), MIN(source_scope)
             FROM (
                 SELECT date(timestamp, 'localtime') AS day, metric AS stream, source_scope
                 FROM metric_samples
                 UNION ALL
                 SELECT date AS day, 'daily_summary' AS stream, source_scope FROM daily_metrics
                 UNION ALL
                 SELECT date(start_time, 'localtime') AS day, 'sleep' AS stream, source_scope
                 FROM sleep_sessions
                 UNION ALL
                 SELECT date(start_time, 'localtime') AS day, 'workouts' AS stream, source_scope
                 FROM workouts
             ) WHERE day IS NOT NULL",
            [],
            |row| {
                Ok((
                    row.get::<_, Option<String>>(0)?,
                    row.get::<_, Option<String>>(1)?,
                    row.get::<_, i64>(2)?,
                    row.get::<_, i64>(3)?,
                    row.get::<_, Option<String>>(4)?,
                ))
            },
        )?;
        let coverage = match (start, end) {
            (Some(start), Some(end)) => {
                let start_date = NaiveDate::parse_from_str(&start, "%Y-%m-%d")
                    .map_err(|error| ZeppBridgeError::ParseError(error.to_string()))?;
                let end_date = NaiveDate::parse_from_str(&end, "%Y-%m-%d")
                    .map_err(|error| ZeppBridgeError::ParseError(error.to_string()))?;
                Some(Coverage {
                    start,
                    end,
                    days: (end_date - start_date).num_days() + 1,
                    streams: stream_count,
                })
            }
            _ => None,
        };
        let source_scope = match scope_count {
            0 => None,
            1 => only_scope,
            _ => Some("mixed".to_string()),
        };
        Ok((last_updated, coverage, source_scope))
    }

    pub fn build_ai_export(&self, selection: &ExportSelection) -> Result<(String, usize)> {
        let start = NaiveDate::parse_from_str(&selection.start_date, "%Y-%m-%d")
            .map_err(|_| ZeppBridgeError::ConfigError("导出开始日期无效".into()))?;
        let end = NaiveDate::parse_from_str(&selection.end_date, "%Y-%m-%d")
            .map_err(|_| ZeppBridgeError::ConfigError("导出结束日期无效".into()))?;
        if end < start {
            return Err(ZeppBridgeError::ConfigError(
                "导出结束日期不能早于开始日期".into(),
            ));
        }
        if (end - start).num_days() > 365 {
            return Err(ZeppBridgeError::ConfigError(
                "单次导出范围不能超过 366 天".into(),
            ));
        }
        let allowed: BTreeSet<&str> = [
            "heart_rate",
            "hrv",
            "daily_activity",
            "sleep",
            "workouts",
            "recovery",
            "steps",
            "spo2",
            "stress",
            "training_load",
            "vo2max",
        ]
        .into_iter()
        .collect();
        let selected: BTreeSet<String> = selection
            .data_types
            .iter()
            .map(|value| value.trim().to_ascii_lowercase())
            .filter(|value| allowed.contains(value.as_str()))
            .collect();
        if selected.is_empty() {
            return Err(ZeppBridgeError::ConfigError(
                "请至少选择一种导出数据".into(),
            ));
        }
        let start_text = start.format("%Y-%m-%d").to_string();
        let end_text = end.format("%Y-%m-%d").to_string();

        let mut metric_samples = Vec::new();
        if selected.contains("heart_rate")
            || selected.contains("hrv")
            || selected.contains("spo2")
            || selected.contains("stress")
        {
            let mut stmt = self.conn.prepare(
                "SELECT metric, timestamp, value, unit, source_scope, device_id
                 FROM metric_samples
                 WHERE date(timestamp, 'localtime') BETWEEN ?1 AND ?2
                 ORDER BY timestamp",
            )?;
            let rows = stmt.query_map(params![start_text, end_text], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, f64>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, Option<String>>(5)?,
                ))
            })?;
            for row in rows {
                let (metric, timestamp, value, unit, source_scope, device_id) = row?;
                if selected.contains(&metric)
                    || (metric.contains("spo2") && selected.contains("spo2"))
                    || (metric.contains("stress") && selected.contains("stress"))
                {
                    metric_samples.push(serde_json::json!({
                        "metric": metric,
                        "timestamp": timestamp,
                        "value": value,
                        "unit": unit,
                        "source_scope": source_scope,
                        "device_id": device_id,
                    }));
                }
            }
        }

        let recovery_metrics: BTreeSet<&str> = [
            "resting_hr",
            "readiness",
            "bio_charge",
            "hybrid_charge",
            "physical_charge",
            "mental_charge",
            "physical_readiness",
            "mental_readiness",
            "hrv_readiness",
            "rhr_readiness",
            "skin_temp_readiness",
            "afib_readiness",
            "ahi_readiness",
            "training_load",
            "vo2max",
        ]
        .into_iter()
        .collect();
        let mut daily_metrics = Vec::new();
        if selected.contains("daily_activity")
            || selected.contains("recovery")
            || selected.contains("steps")
            || selected.contains("spo2")
            || selected.contains("stress")
            || selected.contains("training_load")
            || selected.contains("vo2max")
        {
            let mut stmt = self.conn.prepare(
                "SELECT date, metric, value, unit, source_scope, device_id
                 FROM daily_metrics WHERE date BETWEEN ?1 AND ?2
                 ORDER BY date, metric",
            )?;
            let rows = stmt.query_map(params![start_text, end_text], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, f64>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, Option<String>>(5)?,
                ))
            })?;
            for row in rows {
                let (date, metric, value, unit, source_scope, device_id) = row?;
                let is_recovery = recovery_metrics.contains(metric.as_str());
                let want = (is_recovery && selected.contains("recovery"))
                    || (!is_recovery && selected.contains("daily_activity"))
                    || (metric == "steps" && selected.contains("steps"))
                    || ((metric.contains("spo2") || metric == "blood_oxygen")
                        && selected.contains("spo2"))
                    || (metric.contains("stress") && selected.contains("stress"))
                    || (metric == "training_load" && selected.contains("training_load"))
                    || (metric == "vo2max" && selected.contains("vo2max"));
                if want {
                    daily_metrics.push(serde_json::json!({
                        "date": date,
                        "metric": metric,
                        "value": value,
                        "unit": unit,
                        "source_scope": source_scope,
                        "device_id": device_id,
                    }));
                }
            }
        }

        let mut sleep_sessions = Vec::new();
        if selected.contains("sleep") {
            let mut stmt = self.conn.prepare(
                "SELECT sleep_id, start_time, end_time, score, duration_minutes,
                        deep_minutes, light_minutes, rem_minutes, rem_available, awake_minutes,
                        source_scope, device_id
                 FROM sleep_sessions
                 WHERE date(start_time, 'localtime') BETWEEN ?1 AND ?2
                 ORDER BY start_time",
            )?;
            let rows = stmt.query_map(params![start_text, end_text], |row| {
                let rem_minutes = row.get::<_, i32>(7)?;
                let rem_available = row.get::<_, i64>(8)?;
                Ok(serde_json::json!({
                    "sleep_id": row.get::<_, String>(0)?,
                    "start_time": row.get::<_, String>(1)?,
                    "end_time": row.get::<_, String>(2)?,
                    "score": row.get::<_, Option<i32>>(3)?,
                    "duration_minutes": row.get::<_, i32>(4)?,
                    "deep_minutes": row.get::<_, i32>(5)?,
                    "light_minutes": row.get::<_, i32>(6)?,
                    "rem_minutes": (rem_available != 0).then_some(rem_minutes),
                    "awake_minutes": row.get::<_, i32>(9)?,
                    "source_scope": row.get::<_, String>(10)?,
                    "device_id": row.get::<_, Option<String>>(11)?,
                }))
            })?;
            sleep_sessions = rows.collect::<std::result::Result<Vec<_>, _>>()?;
        }

        let mut workouts = Vec::new();
        if selected.contains("workouts") {
            let mut stmt = self.conn.prepare(
                "SELECT workout_id, workout_type, start_time, end_time,
                        distance_meters, calories, avg_hr, max_hr,
                        training_load, vo2max, source_scope, device_id
                 FROM workouts
                 WHERE date(start_time, 'localtime') BETWEEN ?1 AND ?2
                 ORDER BY start_time",
            )?;
            let rows = stmt.query_map(params![start_text, end_text], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, Option<f64>>(4)?,
                    row.get::<_, Option<i32>>(5)?,
                    row.get::<_, Option<i32>>(6)?,
                    row.get::<_, Option<i32>>(7)?,
                    row.get::<_, Option<f64>>(8)?,
                    row.get::<_, Option<f64>>(9)?,
                    row.get::<_, String>(10)?,
                    row.get::<_, Option<String>>(11)?,
                ))
            })?;
            for row in rows {
                let (
                    workout_id,
                    workout_type,
                    start_time,
                    end_time,
                    distance_meters,
                    calories,
                    avg_hr,
                    max_hr,
                    training_load,
                    vo2max,
                    source_scope,
                    device_id,
                ) = row?;
                let series = self.get_workout_series(&workout_id)?;
                workouts.push(serde_json::json!({
                    "workout_id": workout_id,
                    "workout_type": workout_type,
                    "start_time": start_time,
                    "end_time": end_time,
                    "distance_meters": distance_meters,
                    "calories": calories,
                    "avg_hr": avg_hr,
                    "max_hr": max_hr,
                    "training_load": training_load,
                    "vo2max": vo2max,
                    "source_scope": source_scope,
                    "device_id": device_id,
                    "samples": series.samples,
                    "route": series.route,
                    "pauses": series.pauses,
                }));
            }
        }

        let record_count =
            metric_samples.len() + daily_metrics.len() + sleep_sessions.len() + workouts.len();
        let export = serde_json::json!({
            "schema_version": "zeppbridge.ai.v1",
            "generated_at": Utc::now().to_rfc3339(),
            "date_range": { "start": start_text, "end": end_text, "timezone": "system_local" },
            "selected_types": selected,
            "record_count": record_count,
            "provenance": {
                "source": "ZeppBridge local SQLite",
                "normalized": true,
                "raw_payloads_included": false,
                "note": "Missing fields are omitted or null; values are never fabricated. source_scope preserves user_fused, device, or unknown provenance."
            },
            "data": {
                "metric_samples": metric_samples,
                "daily_metrics": daily_metrics,
                "sleep_sessions": sleep_sessions,
                "workouts": workouts,
            }
        });
        let encoded = serde_json::to_string_pretty(&export)
            .map_err(|error| ZeppBridgeError::ParseError(error.to_string()))?;
        Ok((encoded, record_count))
    }

    fn latest_metric_f64(&self, metric: &str) -> Result<Option<f64>> {
        self.conn
            .query_row(
                "SELECT value FROM metric_samples WHERE metric = ?1
                 ORDER BY timestamp DESC,
                    CASE source_scope WHEN 'user_fused' THEN 0 WHEN 'device' THEN 1 ELSE 2 END,
                    id DESC LIMIT 1",
                [metric],
                |row| row.get(0),
            )
            .optional()
            .map_err(Into::into)
    }

    fn latest_daily_f64(&self, metric: &str) -> Result<Option<f64>> {
        self.conn
            .query_row(
                "SELECT value FROM daily_metrics WHERE metric = ?1
                 ORDER BY date DESC,
                    CASE source_scope WHEN 'user_fused' THEN 0 WHEN 'device' THEN 1 ELSE 2 END,
                    id DESC LIMIT 1",
                [metric],
                |row| row.get(0),
            )
            .optional()
            .map_err(Into::into)
    }

    fn latest_daily_i32(&self, metric: &str) -> Result<Option<i32>> {
        Ok(self
            .latest_daily_f64(metric)?
            .map(|value| value.round() as i32))
    }

    fn latest_daily_i32_for_date(&self, metric: &str, date: NaiveDate) -> Result<Option<i32>> {
        self.conn
            .query_row(
                "SELECT value FROM daily_metrics WHERE metric = ?1 AND date = ?2
                 ORDER BY CASE source_scope WHEN 'user_fused' THEN 0 WHEN 'device' THEN 1 ELSE 2 END,
                          id DESC LIMIT 1",
                params![metric, date.format("%Y-%m-%d").to_string()],
                |row| row.get::<_, f64>(0),
            )
            .optional()
            .map(|value| value.map(|value| value.round() as i32))
            .map_err(Into::into)
    }

    pub fn list_data_status(&self) -> Result<Vec<DataStatus>> {
        let mut stmt = self.conn.prepare(
            "SELECT stream, status, last_sync, records_written, capability,
                    needs_reauth, message FROM sync_state ORDER BY stream",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Option<String>>(2)?,
                row.get::<_, i64>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, i64>(5)?,
                row.get::<_, Option<String>>(6)?,
            ))
        })?;
        let mut statuses = Vec::new();
        for row in rows {
            let (stream, status, last_sync, records_written, capability, needs_reauth, message) =
                row?;
            statuses.push(DataStatus {
                stream,
                status,
                last_sync: last_sync
                    .as_deref()
                    .map(|value| parse_datetime(value, "sync_state.last_sync"))
                    .transpose()?,
                records_written,
                capability,
                needs_reauth: needs_reauth != 0,
                message,
            });
        }
        Ok(statuses)
    }

    #[cfg(test)]
    #[allow(dead_code)]
    pub fn get_recent_data(&self, limit: usize) -> Result<RecentData> {
        Ok(RecentData {
            metric_samples: self.get_recent_metric_samples(limit)?,
            sleep_sessions: self.get_recent_sleep_sessions(limit)?,
            workouts: self.get_recent_workouts(limit)?,
        })
    }

    #[cfg(test)]
    #[allow(dead_code)]
    fn get_recent_metric_samples(&self, limit: usize) -> Result<Vec<MetricSample>> {
        let limit = i64::try_from(limit).unwrap_or(i64::MAX).max(0);
        let mut stmt = self.conn.prepare(
            "SELECT metric, timestamp, value, unit, source_scope, device_id
             FROM metric_samples ORDER BY timestamp DESC LIMIT ?1",
        )?;
        let rows = stmt.query_map([limit], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, f64>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, Option<String>>(5)?,
            ))
        })?;
        let mut samples = Vec::new();
        for row in rows {
            let (metric, timestamp, value, unit, scope, device_id) = row?;
            samples.push(MetricSample {
                metric,
                timestamp: parse_datetime(&timestamp, "metric_samples.timestamp")?,
                value,
                unit,
                source_scope: parse_scope(&scope)?,
                device_id,
            });
        }
        Ok(samples)
    }

    /// Backwards-compatible status update. New sync code should use the richer
    /// method below so cursor/capability information is not discarded.
    #[allow(dead_code)]
    pub fn update_sync_state(&self, stream: &str, status: &str, error: Option<&str>) -> Result<()> {
        self.update_sync_state_details(
            stream,
            None,
            status,
            error,
            error.is_some(),
            0,
            if error.is_some() {
                CapabilityStatus::Unavailable
            } else {
                CapabilityStatus::Verified
            },
            error.map(str::to_owned),
        )
    }

    #[allow(clippy::too_many_arguments)]
    pub fn update_sync_state_details(
        &self,
        stream: &str,
        cursor: Option<&str>,
        status: &str,
        error: Option<&str>,
        needs_reauth: bool,
        records_written: i64,
        capability: CapabilityStatus,
        message: Option<String>,
    ) -> Result<()> {
        let now = Utc::now().to_rfc3339();
        self.conn.execute(
            "INSERT INTO sync_state
                (stream, last_sync, cursor, status, error, needs_reauth,
                 records_written, capability, message, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?2)
             ON CONFLICT(stream) DO UPDATE SET
                last_sync = excluded.last_sync,
                cursor = excluded.cursor,
                status = excluded.status,
                error = excluded.error,
                needs_reauth = excluded.needs_reauth,
                records_written = excluded.records_written,
                capability = excluded.capability,
                message = excluded.message,
                updated_at = excluded.updated_at",
            params![
                stream,
                now,
                cursor,
                status,
                error,
                if needs_reauth { 1 } else { 0 },
                records_written,
                capability.as_str(),
                message,
            ],
        )?;
        Ok(())
    }

    #[allow(dead_code)]
    pub fn get_sync_state(&self, stream: &str) -> Result<Option<SyncStateInfo>> {
        let row = self
            .conn
            .query_row(
                "SELECT stream, last_sync, cursor, status, error, needs_reauth,
                        records_written, capability, message, updated_at
                 FROM sync_state WHERE stream = ?1",
                [stream],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, Option<String>>(1)?,
                        row.get::<_, Option<String>>(2)?,
                        row.get::<_, String>(3)?,
                        row.get::<_, Option<String>>(4)?,
                        row.get::<_, i64>(5)?,
                        row.get::<_, i64>(6)?,
                        row.get::<_, String>(7)?,
                        row.get::<_, Option<String>>(8)?,
                        row.get::<_, String>(9)?,
                    ))
                },
            )
            .optional()?;
        row.map(
            |(
                stream,
                last_sync,
                cursor,
                status,
                error,
                needs_reauth,
                records_written,
                capability,
                message,
                updated_at,
            )| {
                Ok(SyncStateInfo {
                    stream,
                    last_sync: last_sync
                        .as_deref()
                        .map(|value| parse_datetime(value, "sync_state.last_sync"))
                        .transpose()?,
                    cursor,
                    status,
                    error,
                    needs_reauth: needs_reauth != 0,
                    records_written,
                    capability,
                    message,
                    updated_at: parse_datetime(&updated_at, "sync_state.updated_at")?,
                })
            },
        )
        .transpose()
    }

    pub fn cleanup_old_data(&self, days: i64) -> Result<()> {
        if !(1..=365).contains(&days) {
            return Err(ZeppBridgeError::ConfigError(
                "retention 天数必须在 1..=365".into(),
            ));
        }
        let cutoff = Utc::now() - chrono::Duration::days(days);
        let cutoff_timestamp = cutoff.to_rfc3339();
        let cutoff_date = cutoff.date_naive().format("%Y-%m-%d").to_string();
        self.conn.execute(
            "DELETE FROM metric_samples WHERE timestamp < ?1",
            [&cutoff_timestamp],
        )?;
        self.conn
            .execute("DELETE FROM daily_metrics WHERE date < ?1", [&cutoff_date])?;
        self.conn.execute(
            "DELETE FROM sleep_sessions WHERE start_time < ?1",
            [&cutoff_timestamp],
        )?;
        self.conn.execute(
            "DELETE FROM workouts WHERE start_time < ?1",
            [&cutoff_timestamp],
        )?;
        self.conn.execute(
            "DELETE FROM workout_samples WHERE timestamp < ?1",
            [&cutoff_timestamp],
        )?;
        self.conn.execute(
            "DELETE FROM route_points WHERE timestamp < ?1",
            [&cutoff_timestamp],
        )?;
        self.conn.execute(
            "DELETE FROM workout_pauses WHERE start_time < ?1",
            [&cutoff_timestamp],
        )?;
        // Raw responses are retained from their fetch time, not their query
        // window start. A 30-day request naturally starts near the retention
        // cutoff and must not be deleted seconds after it is fetched.
        self.conn.execute(
            "DELETE FROM raw_records
             WHERE fetched_at < ?1
               AND NOT EXISTS (SELECT 1 FROM metric_samples m WHERE m.raw_record_id = raw_records.id)
               AND NOT EXISTS (SELECT 1 FROM daily_metrics d WHERE d.raw_record_id = raw_records.id)
               AND NOT EXISTS (SELECT 1 FROM sleep_sessions s WHERE s.raw_record_id = raw_records.id)
               AND NOT EXISTS (SELECT 1 FROM workouts w WHERE w.raw_record_id = raw_records.id)",
            [&cutoff_timestamp],
        )?;
        self.conn
            .execute_batch("PRAGMA wal_checkpoint(TRUNCATE); PRAGMA incremental_vacuum;")?;
        Ok(())
    }

    pub fn persist_fetched_record(&self, record: &RawRecord) -> Result<(i64, NormalizationCounts)> {
        self.conn.execute("BEGIN IMMEDIATE", [])?;
        let outcome = (|| {
            let raw_id = self.insert_raw_record(record)?;
            let counts = self.normalize_and_persist_raw(
                raw_id,
                &record.stream,
                &record.source_key,
                &record.payload,
            )?;
            Ok((raw_id, counts))
        })();
        match outcome {
            Ok(value) => {
                self.conn.execute("COMMIT", [])?;
                Ok(value)
            }
            Err(error) => {
                let _ = self.conn.execute("ROLLBACK", []);
                Err(error)
            }
        }
    }

    #[cfg(test)]
    pub fn count_metric_samples(&self) -> Result<i64> {
        self.conn
            .query_row("SELECT COUNT(*) FROM metric_samples", [], |row| row.get(0))
            .map_err(Into::into)
    }

    #[cfg(test)]
    #[allow(dead_code)]
    pub fn count_raw_records(&self) -> Result<i64> {
        self.conn
            .query_row("SELECT COUNT(*) FROM raw_records", [], |row| row.get(0))
            .map_err(Into::into)
    }
}

fn push_alias(aliases: &mut Vec<String>, value: Option<String>) {
    if let Some(value) = value {
        let trimmed = value.trim();
        if !trimmed.is_empty() && !aliases.iter().any(|existing| existing == trimmed) {
            aliases.push(trimmed.to_string());
        }
    }
}

fn string_field(value: &serde_json::Value, keys: &[&str]) -> Option<String> {
    let object = value.as_object()?;
    for key in keys {
        match object.get(*key) {
            Some(serde_json::Value::String(text)) if !text.trim().is_empty() => {
                return Some(text.trim().to_string());
            }
            Some(serde_json::Value::Number(number)) => return Some(number.to_string()),
            _ => {}
        }
    }
    None
}

fn firmware_from_bind_device(raw: &str) -> Option<String> {
    raw.split(':')
        .next_back()
        .map(str::trim)
        .filter(|value| value.chars().any(|ch| ch.is_ascii_digit()) && value.contains('.'))
        .map(str::to_string)
}

fn collect_objects<'a>(value: &'a serde_json::Value, out: &mut Vec<&'a serde_json::Value>) {
    match value {
        serde_json::Value::Array(items) => {
            for item in items {
                collect_objects(item, out);
            }
        }
        serde_json::Value::Object(object) => {
            out.push(value);
            for key in ["data", "items", "records", "results", "list", "summary"] {
                if let Some(child) = object.get(key) {
                    collect_objects(child, out);
                }
            }
        }
        _ => {}
    }
}

fn device_identity_hints(payload: &serde_json::Value) -> Vec<DeviceIdentityHint> {
    let mut objects = Vec::new();
    collect_objects(payload, &mut objects);
    let mut hints = Vec::new();
    for object in objects {
        let mut aliases = Vec::new();
        push_alias(
            &mut aliases,
            string_field(object, &["device_id", "deviceId", "deviceid"]),
        );
        push_alias(
            &mut aliases,
            string_field(object, &["sn", "serial", "serialNumber"]),
        );
        if aliases.is_empty() {
            continue;
        }
        let bind = string_field(object, &["bind_device", "bindDevice"]);
        hints.push(DeviceIdentityHint {
            device_id: string_field(object, &["device_id", "deviceId", "deviceid"]),
            serial: string_field(object, &["sn", "serial", "serialNumber"]),
            firmware: bind.as_deref().and_then(firmware_from_bind_device),
            timezone: string_field(object, &["syncedTimezone", "timezone", "tz"]).filter(|value| {
                value.contains('/') || value.chars().any(|ch| ch.is_ascii_alphabetic())
            }),
            name: string_field(object, &["displayName", "deviceName", "productName"]),
            aliases,
        });
    }
    hints
}

fn parse_datetime(value: &str, field: &str) -> Result<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(value)
        .map(|dt| dt.with_timezone(&Utc))
        .map_err(|error| ZeppBridgeError::ParseError(format!("{field} 无效: {error}")))
}

fn parse_scope(value: &str) -> Result<SourceScope> {
    match value.trim_matches('"') {
        "user_fused" | "UserFused" => Ok(SourceScope::UserFused),
        "device" | "Device" => Ok(SourceScope::Device),
        "unknown" | "Unknown" => Ok(SourceScope::Unknown),
        other => serde_json::from_str::<SourceScope>(value)
            .map_err(|_| ZeppBridgeError::ParseError(format!("source_scope 无效: {other}"))),
    }
}

fn format_bytes(bytes: u64) -> String {
    if bytes >= 1_073_741_824 {
        format!("{:.1} GB", bytes as f64 / 1_073_741_824.0)
    } else if bytes >= 1_048_576 {
        format!("{:.0} MB", bytes as f64 / 1_048_576.0)
    } else {
        format!("{bytes} B")
    }
}

fn disk_free_bytes(path: &std::path::Path) -> Option<u64> {
    #[cfg(windows)]
    {
        use std::os::windows::ffi::OsStrExt;
        #[link(name = "kernel32")]
        extern "system" {
            fn GetDiskFreeSpaceExW(
                directory: *const u16,
                free_bytes_available: *mut u64,
                total_bytes: *mut u64,
                total_free_bytes: *mut u64,
            ) -> i32;
        }
        let mut wide: Vec<u16> = path.as_os_str().encode_wide().collect();
        wide.push(0);
        let mut free = 0u64;
        let ok = unsafe {
            GetDiskFreeSpaceExW(
                wide.as_ptr(),
                &mut free,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
            )
        };
        (ok != 0).then_some(free)
    }
    #[cfg(not(windows))]
    {
        let _ = path;
        None
    }
}

fn workout_id_from_detail_key(source_key: &str) -> Option<String> {
    let rest = source_key.strip_prefix("workout_detail:")?;
    let (workout_id, _) = rest.split_once(':')?;
    if workout_id.is_empty() {
        None
    } else {
        Some(workout_id.to_owned())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ts() -> DateTime<Utc> {
        DateTime::from_timestamp(1_700_000_000, 0).unwrap()
    }

    #[test]
    fn prefs_default_to_365_and_180_without_writing_old_30_day_retention() {
        let db = Database::in_memory().unwrap();
        let prefs = db.user_prefs().unwrap();
        assert_eq!(prefs.retention_days, 365);
        assert_eq!(prefs.history_sync_days, 180);
        assert!(db.get_app_meta("retention_days").unwrap().is_none());
    }

    #[test]
    fn missing_rem_is_stored_as_unavailable() {
        let db = Database::in_memory().unwrap();
        db.insert_sleep_session(&SleepSession {
            sleep_id: "sleep-no-rem".into(),
            start_time: ts(),
            end_time: ts() + chrono::Duration::minutes(400),
            score: Some(70),
            duration_minutes: 400,
            deep_minutes: 80,
            light_minutes: 200,
            rem_minutes: None,
            awake_minutes: 20,
            source_scope: SourceScope::Device,
            device_id: None,
            synced_at: None,
            time_in_bed_minutes: None,
            stages: Vec::new(),
        })
        .unwrap();
        assert_eq!(
            db.get_sleep_detail("sleep-no-rem")
                .unwrap()
                .unwrap()
                .rem_minutes,
            None
        );
    }

    #[test]
    fn retention_rejects_unsafe_ranges() {
        let db = Database::in_memory().unwrap();
        assert!(db.cleanup_old_data(0).is_err());
        assert!(db.cleanup_old_data(366).is_err());
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

    #[test]
    fn device_lookup_does_not_fall_back_to_first_device() {
        let db = Database::in_memory().unwrap();
        db.upsert_device_identity(&DeviceIdentityHint {
            aliases: vec!["SN-ONE".into(), "MAC-ONE".into()],
            name: Some("Watch One".into()),
            firmware: Some("1.0.0".into()),
            serial: Some("SN-ONE".into()),
            device_id: Some("MAC-ONE".into()),
            timezone: None,
        })
        .unwrap();
        db.upsert_device_identity(&DeviceIdentityHint {
            aliases: vec!["SN-TWO".into(), "MAC-TWO".into()],
            name: Some("Watch Two".into()),
            firmware: Some("2.0.0".into()),
            serial: Some("SN-TWO".into()),
            device_id: Some("MAC-TWO".into()),
            timezone: None,
        })
        .unwrap();
        let one = db.lookup_device_profile("SN-ONE").unwrap().unwrap();
        let two = db.lookup_device_profile("MAC-TWO").unwrap().unwrap();
        assert_eq!(one.name.as_deref(), Some("Watch One"));
        assert_eq!(two.name.as_deref(), Some("Watch Two"));
        assert!(db.lookup_device_profile("UNKNOWN").unwrap().is_none());
    }

    #[test]
    fn device_data_summary_excludes_fused_records_and_keeps_identity_aliases() {
        let db = Database::in_memory().unwrap();
        let timestamp = ts();
        db.insert_metric_sample(&MetricSample {
            metric: "heart_rate".into(),
            timestamp,
            value: 72.0,
            unit: "bpm".into(),
            source_scope: SourceScope::Device,
            device_id: Some("SN-HELIO".into()),
        })
        .unwrap();
        db.insert_metric_sample(&MetricSample {
            metric: "heart_rate".into(),
            timestamp: timestamp + chrono::Duration::minutes(2),
            value: 80.0,
            unit: "bpm".into(),
            source_scope: SourceScope::UserFused,
            device_id: Some("SN-HELIO".into()),
        })
        .unwrap();
        let (has_data, latest) = db.device_data_summary(&["sn-helio".to_string()]).unwrap();
        assert!(has_data);
        assert_eq!(latest.as_deref(), Some("2023-11-14T22:13:20+00:00"));
        let (has_unknown, _) = db
            .device_data_summary(&["missing-device".to_string()])
            .unwrap();
        assert!(!has_unknown);
    }

    #[test]
    fn sleep_stages_round_trip_and_synced_at_is_not_end_time() {
        let db = Database::in_memory().unwrap();
        let start = ts();
        let end = start + chrono::Duration::minutes(400);
        db.insert_sleep_session(&SleepSession {
            sleep_id: "sleep-stages".into(),
            start_time: start,
            end_time: end,
            score: Some(80),
            duration_minutes: 380,
            deep_minutes: 80,
            light_minutes: 240,
            rem_minutes: Some(40),
            awake_minutes: 20,
            source_scope: SourceScope::Device,
            device_id: Some("SN-ONE".into()),
            synced_at: Some(start + chrono::Duration::hours(10)),
            time_in_bed_minutes: None,
            stages: vec![SleepStageSlice {
                stage: "deep".into(),
                start_time: start,
                end_time: start + chrono::Duration::minutes(80),
            }],
        })
        .unwrap();
        let detail = db.get_sleep_detail("sleep-stages").unwrap().unwrap();
        assert_eq!(detail.stages.len(), 1);
        assert_eq!(detail.stages[0].stage, "deep");
        assert_eq!(detail.time_in_bed_minutes, None);
        assert_eq!(
            detail.synced_at.unwrap(),
            start + chrono::Duration::hours(10)
        );
        assert_ne!(detail.synced_at.unwrap(), detail.end_time);
    }

    #[test]
    fn workout_detail_persists_series_and_does_not_duplicate() {
        let db = Database::in_memory().unwrap();
        db.insert_workout(&Workout {
            workout_id: "1700000000".into(),
            workout_type: "run".into(),
            start_time: ts(),
            end_time: ts() + chrono::Duration::minutes(10),
            distance_meters: Some(1000.0),
            calories: Some(80),
            avg_hr: Some(140),
            max_hr: Some(160),
            training_load: None,
            vo2max: None,
            source_scope: SourceScope::Device,
            device_id: None,
            synced_at: None,
            gps_available: false,
            sample_count: 0,
            zepp_source: Some("run.gps".into()),
            zepp_type: Some(1),
        })
        .unwrap();
        let payload = serde_json::json!({
            "trackid": 1_700_000_000i64,
            "source": "run.gps",
            "time": "0;1;",
            "longitude_latitude": "4004663552,11629333504;16403,8392;",
            "heart_rate": "1,80;1,2;"
        });
        assert_eq!(db.pending_running_details().unwrap().len(), 1);
        db.normalize_and_persist_raw(
            1,
            "workout_detail",
            "workout_detail:1700000000:run.gps",
            &payload,
        )
        .unwrap();
        db.normalize_and_persist_raw(
            1,
            "workout_detail",
            "workout_detail:1700000000:run.gps",
            &payload,
        )
        .unwrap();
        let series = db.get_workout_series("1700000000").unwrap();
        assert_eq!(series.route.len(), 2);
        assert!(!series.samples.is_empty());
        let sample_count: i64 = db
            .conn
            .query_row(
                "SELECT COUNT(*) FROM workout_samples WHERE workout_id = '1700000000'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(sample_count, series.samples.len() as i64);
        db.insert_raw_record(&RawRecord {
            stream: "workout_detail".into(),
            source_key: "workout_detail:1700000000:run.gps".into(),
            source_scope: SourceScope::Device,
            device_id: None,
            start_utc: ts(),
            end_utc: None,
            payload,
            capability: CapabilityStatus::Verified,
        })
        .unwrap();
        assert!(db.pending_running_details().unwrap().is_empty());
    }
}
