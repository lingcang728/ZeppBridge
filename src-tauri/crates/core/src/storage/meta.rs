//! 应用元数据与用户偏好（从 storage/mod.rs 按领域拆出，逻辑不变）。

use super::*;

/// 上一次成功的整窗（≥ `INCREMENTAL_SYNC_DAYS`）同步是什么时候。
const LAST_FULL_WINDOW_SYNC_AT_KEY: &str = "last_full_window_sync_at";

impl Database {
    pub(super) fn ensure_cloud_sync_metadata(&self) -> Result<()> {
        if self.get_app_meta(LAST_CLOUD_SYNC_AT_KEY)?.is_some()
            || self.get_app_meta(LAST_CLOUD_SYNC_OUTCOME_KEY)?.is_some()
        {
            return Ok(());
        }
        let latest_fetch =
            self.conn
                .query_row("SELECT MAX(fetched_at) FROM raw_records", [], |row| {
                    row.get::<_, Option<String>>(0)
                });
        match latest_fetch {
            Ok(Some(timestamp)) => {
                self.set_app_meta(LAST_CLOUD_SYNC_AT_KEY, &timestamp)?;
                self.set_app_meta(LAST_CLOUD_SYNC_OUTCOME_KEY, "updated")?;
            }
            Ok(None) => {}
            Err(error) if is_corrupt_sqlite(&error) => {
                // A truncated library can still boot; the next cloud sync
                // rewrites this metadata.
            }
            Err(error) => return Err(error.into()),
        }
        Ok(())
    }

    pub(crate) fn set_app_meta(&self, key: &str, value: &str) -> Result<()> {
        self.conn.execute(
            "INSERT INTO app_meta(key, value, updated_at)
             VALUES(?1, ?2, ?3)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
            params![key, value, Utc::now().to_rfc3339()],
        )?;
        Ok(())
    }

    pub(crate) fn get_app_meta(&self, key: &str) -> Result<Option<String>> {
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

    pub fn record_cloud_sync(
        &self,
        finished_at: &str,
        outcome: &str,
        records_written: i64,
    ) -> Result<()> {
        // An attempt is not proof that the initial data fetch succeeded.
        // Keep failed/cancelled outcomes visible without consuming first-run sync.
        if matches!(outcome, "updated" | "no_new_data" | "partial")
            && (records_written > 0 || self.get_app_meta(LAST_CLOUD_SYNC_AT_KEY)?.is_some())
        {
            self.set_app_meta(LAST_CLOUD_SYNC_AT_KEY, finished_at)?;
        }
        self.set_app_meta(LAST_CLOUD_SYNC_OUTCOME_KEY, outcome)
    }

    /// 定时同步这一次该不该拉整窗：上一次成功的整窗同步已经超过
    /// [`crate::contract::FULL_WINDOW_REFRESH_HOURS`]，或者从来没有过。
    pub fn full_window_refresh_due(&self, now: DateTime<Utc>) -> Result<bool> {
        let last = self
            .get_app_meta(LAST_FULL_WINDOW_SYNC_AT_KEY)?
            .and_then(|value| DateTime::parse_from_rfc3339(&value).ok());
        Ok(match last {
            Some(at) => {
                now.signed_duration_since(at.with_timezone(&Utc))
                    >= Duration::hours(crate::contract::FULL_WINDOW_REFRESH_HOURS)
            }
            None => true,
        })
    }

    /// 一次覆盖了整窗、且没有任何流失败的同步刚结束。
    pub(crate) fn record_full_window_refresh(&self, at: DateTime<Utc>) -> Result<()> {
        self.set_app_meta(LAST_FULL_WINDOW_SYNC_AT_KEY, &at.to_rfc3339())
    }

    pub fn user_prefs(&self) -> Result<UserPrefs> {
        Ok(UserPrefs {
            retention_days: self
                .read_pref_days(RETENTION_DAYS_KEY, UserPrefs::DEFAULT_RETENTION_DAYS)?,
            history_sync_days: self.read_history_days()?,
            archive_enabled: self.get_app_meta(ARCHIVE_ENABLED_KEY)?.as_deref() == Some("1"),
        })
    }

    pub(super) fn read_history_days(&self) -> Result<i64> {
        match self.get_app_meta(HISTORY_SYNC_DAYS_KEY)? {
            Some(value) => Ok(value
                .parse::<i64>()
                .ok()
                .and_then(|days| UserPrefs::clamp_history_days(days).ok())
                .unwrap_or(UserPrefs::DEFAULT_HISTORY_SYNC_DAYS)),
            None => Ok(UserPrefs::DEFAULT_HISTORY_SYNC_DAYS),
        }
    }

    pub fn set_user_prefs(&self, prefs: &UserPrefs) -> Result<UserPrefs> {
        let retention_days =
            UserPrefs::clamp_days(prefs.retention_days).map_err(ZeppBridgeError::ConfigError)?;
        // 补拉范围和保留期各有各的上限：保留期决定本机留多久，补拉决定往回
        // 取多远。共用一个 365 天上限时，「把三年前的记录拿回来」根本没法表达。
        let history_sync_days = UserPrefs::clamp_history_days(prefs.history_sync_days)
            .map_err(ZeppBridgeError::ConfigError)?;
        self.set_app_meta(RETENTION_DAYS_KEY, &retention_days.to_string())?;
        self.set_app_meta(HISTORY_SYNC_DAYS_KEY, &history_sync_days.to_string())?;
        self.set_app_meta(
            ARCHIVE_ENABLED_KEY,
            if prefs.archive_enabled { "1" } else { "0" },
        )?;
        Ok(UserPrefs {
            retention_days,
            history_sync_days,
            archive_enabled: prefs.archive_enabled,
        })
    }

    pub(super) fn read_pref_days(&self, key: &str, default: i64) -> Result<i64> {
        match self.get_app_meta(key)? {
            Some(value) => Ok(value
                .parse::<i64>()
                .ok()
                .and_then(|days| UserPrefs::clamp_days(days).ok())
                .unwrap_or(default)),
            None => Ok(default),
        }
    }
}
