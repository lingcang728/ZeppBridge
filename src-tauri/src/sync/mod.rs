use crate::fetcher::{DataFetcher, FetchWindow, FetchedRecord};
use crate::models::{error::*, *};
use crate::storage::Database;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Instant;
use tokio::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum StreamStatus {
    Success,
    Failed,
    Unavailable,
    Unverified,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamReport {
    pub stream: String,
    pub status: StreamStatus,
    pub records_written: i64,
    pub raw_records: i64,
    pub capability: CapabilityStatus,
    pub needs_reauth: bool,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncReport {
    pub success: bool,
    pub streams: Vec<StreamReport>,
    pub records_written: i64,
    pub message: Option<String>,
}

pub struct SyncManager {
    fetcher: Arc<DataFetcher>,
    db: Arc<Mutex<Database>>,
    run_lock: Arc<Mutex<()>>,
    pub cancel: Arc<AtomicBool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncProgress {
    pub stream: String,
    pub current: u32,
    pub total: u32,
    pub message: String,
}

struct PersistResult {
    report: StreamReport,
}

impl SyncManager {
    /// The `cancel` flag is shared with the underlying connector so an
    /// in-flight HTTP retry loop aborts as soon as cancellation is requested.
    pub fn new(fetcher: DataFetcher, db: Database, cancel: Arc<AtomicBool>) -> Self {
        Self {
            fetcher: Arc::new(fetcher),
            db: Arc::new(Mutex::new(db)),
            run_lock: Arc::new(Mutex::new(())),
            cancel,
        }
    }

    pub fn request_cancel(&self) {
        self.cancel.store(true, Ordering::SeqCst);
    }

    /// Compatibility command surface. A report containing failed core streams
    /// is converted to an error, so callers cannot display false success.
    #[allow(dead_code)]
    pub async fn initial_sync(&self) -> Result<()> {
        let report = self.initial_sync_report().await?;
        if report.success {
            Ok(())
        } else {
            Err(ZeppBridgeError::DataUnavailable(
                report
                    .message
                    .unwrap_or_else(|| "首次同步有核心流失败".into()),
            ))
        }
    }

    pub async fn initial_sync_report(&self) -> Result<SyncReport> {
        self.history_sync_report(UserPrefs::DEFAULT_HISTORY_SYNC_DAYS)
            .await
    }

    pub async fn history_sync_report(&self, days: i64) -> Result<SyncReport> {
        self.sync_report(days, None).await
    }

    pub async fn history_sync_report_with_progress<F>(
        &self,
        days: i64,
        on_progress: F,
    ) -> Result<SyncReport>
    where
        F: Fn(SyncProgress) + Send + Sync,
    {
        self.sync_report(days, Some(&on_progress)).await
    }

    #[allow(dead_code)]
    pub async fn incremental_sync(&self) -> Result<()> {
        let report = self.incremental_sync_report().await?;
        if report.success {
            Ok(())
        } else {
            Err(ZeppBridgeError::DataUnavailable(
                report
                    .message
                    .unwrap_or_else(|| "增量同步有核心流失败".into()),
            ))
        }
    }

    pub async fn incremental_sync_report(&self) -> Result<SyncReport> {
        self.sync_report(7, None).await
    }

    pub async fn incremental_sync_report_with_progress<F>(
        &self,
        on_progress: F,
    ) -> Result<SyncReport>
    where
        F: Fn(SyncProgress) + Send + Sync,
    {
        self.sync_report(7, Some(&on_progress)).await
    }

    async fn sync_report(
        &self,
        days: i64,
        on_progress: Option<&(dyn Fn(SyncProgress) + Send + Sync)>,
    ) -> Result<SyncReport> {
        self.cancel.store(false, Ordering::SeqCst);
        let _run_guard = self.run_lock.lock().await;
        let window = FetchWindow::days(days)?;
        let mut streams = Vec::new();
        let started = Instant::now();
        let deadline = if days <= 7 {
            started + std::time::Duration::from_secs(90)
        } else {
            let budget = 45u64
                .saturating_add((days as u64).saturating_mul(3))
                .min(20 * 60);
            started + std::time::Duration::from_secs(budget)
        };

        let emit = |stream: &str, current: u32, total: u32, message: &str| {
            if let Some(callback) = on_progress {
                callback(SyncProgress {
                    stream: stream.into(),
                    current,
                    total,
                    message: message.into(),
                });
            }
        };

        let check = || -> Result<()> {
            if self.cancel.load(Ordering::SeqCst) {
                return Err(ZeppBridgeError::ConfigError("同步已取消".into()));
            }
            if Instant::now() > deadline {
                return Err(ZeppBridgeError::ConfigError(
                    "同步超时，已停止后续请求".into(),
                ));
            }
            Ok(())
        };

        emit("heart_rate", 1, 6, "正在同步心率");
        check()?;
        match self.fetcher.fetch_heart_rate_records(window).await {
            Ok(records) => streams.push(self.persist_records("heart_rate", records).await?),
            Err(error) if error.is_cancelled() => return Err(error),
            Err(error) => streams.push(self.failure_report("heart_rate", &error).await?),
        }
        emit("daily_summary", 2, 6, "正在同步每日概览");
        check()?;
        match self.fetcher.fetch_daily_statistics_records(window).await {
            Ok(records) => streams.push(self.persist_records("daily_summary", records).await?),
            Err(error) if error.is_cancelled() => return Err(error),
            Err(error) => streams.push(self.failure_report("daily_summary", &error).await?),
        }
        emit("workouts", 3, 6, "正在同步运动");
        check()?;
        match self.fetcher.fetch_workout_records(window).await {
            Ok(records) => streams.push(self.persist_records("workouts", records).await?),
            Err(error) if error.is_cancelled() => return Err(error),
            Err(error) if error.is_unavailable() => {
                streams.push(self.unavailable_report("workouts", &error).await?)
            }
            Err(error) => streams.push(self.failure_report("workouts", &error).await?),
        }
        emit("workout_detail", 4, 6, "正在同步跑步明细");
        check()?;
        match self.fetch_pending_running_details().await {
            Ok(records) if records.is_empty() => {
                streams.push(StreamReport {
                    stream: "workout_detail".into(),
                    status: StreamStatus::Success,
                    records_written: 0,
                    raw_records: 0,
                    capability: CapabilityStatus::Verified,
                    needs_reauth: false,
                    message: Some("没有待拉取的跑步明细".into()),
                });
            }
            Ok(records) => streams.push(self.persist_records("workout_detail", records).await?),
            Err(error) if error.is_cancelled() => return Err(error),
            Err(error) if error.is_unavailable() => {
                streams.push(self.unavailable_report("workout_detail", &error).await?)
            }
            Err(error) => streams.push(self.failure_report("workout_detail", &error).await?),
        }

        // Optional streams are retained and reported, never promoted to a
        // verified empty success.
        emit("sleep", 5, 6, "正在同步睡眠");
        check()?;
        match self.fetcher.fetch_sleep_records(window).await {
            Ok(records) => streams.push(self.persist_records("sleep", records).await?),
            Err(error) if error.is_cancelled() => return Err(error),
            Err(error) if error.is_unavailable() => {
                streams.push(self.unavailable_report("sleep", &error).await?)
            }
            Err(error) => streams.push(self.failure_report("sleep", &error).await?),
        }
        emit("hrv", 6, 6, "正在同步心率变异性");
        check()?;
        match self.fetcher.fetch_hrv_records(window).await {
            Ok(records) => streams.push(self.persist_records("hrv", records).await?),
            Err(error) if error.is_cancelled() => return Err(error),
            Err(error) if error.is_unavailable() => {
                streams.push(self.unavailable_report("hrv", &error).await?)
            }
            Err(error) => streams.push(self.failure_report("hrv", &error).await?),
        }

        let core_failed = streams.iter().any(|report| {
            matches!(
                report.stream.as_str(),
                "heart_rate" | "daily_summary" | "workouts"
            ) && report.status == StreamStatus::Failed
        });
        let success = !core_failed;
        let total_written = streams.iter().map(|report| report.records_written).sum();
        if success {
            let db = self.db.lock().await;
            let retention_days = db.user_prefs()?.retention_days;
            db.cleanup_old_data(retention_days)?;
        }
        Ok(SyncReport {
            success,
            streams,
            records_written: total_written,
            message: if core_failed {
                Some("至少一个核心数据流失败；同步未报告成功".into())
            } else {
                None
            },
        })
    }

    async fn fetch_pending_running_details(&self) -> Result<Vec<FetchedRecord>> {
        let pending = {
            let db = self.db.lock().await;
            db.pending_running_details()?
        };
        let mut records = Vec::new();
        let mut last_error = None;
        for item in pending {
            if self.cancel.load(Ordering::SeqCst) {
                return Err(ZeppBridgeError::Cancelled);
            }
            match self
                .fetcher
                .fetch_sport_detail_record(&item.workout_id, &item.source, Utc::now(), None)
                .await
            {
                Ok(record) => records.push(record),
                Err(error) if error.is_cancelled() => return Err(error),
                Err(error) if error.needs_reauth() => return Err(error),
                Err(error) if error.is_unavailable() => last_error = Some(error),
                Err(error) => last_error = Some(error),
            }
        }
        if records.is_empty() {
            if let Some(error) = last_error {
                return Err(error);
            }
        }
        Ok(records)
    }

    async fn persist_records(
        &self,
        stream: &str,
        records: Vec<FetchedRecord>,
    ) -> Result<StreamReport> {
        let mut aggregate = StreamReport {
            stream: stream.into(),
            status: StreamStatus::Success,
            records_written: 0,
            raw_records: 0,
            capability: CapabilityStatus::Verified,
            needs_reauth: false,
            message: None,
        };
        let mut successes = 0usize;
        let mut notices = 0usize;
        for record in records {
            let one = self.persist_record(record).await?.report;
            aggregate.records_written += one.records_written;
            aggregate.raw_records += one.raw_records;
            aggregate.needs_reauth |= one.needs_reauth;
            if one.status == StreamStatus::Success {
                successes += 1;
            } else {
                notices += 1;
                aggregate.status = one.status;
                aggregate.capability = one.capability;
                aggregate.message = one.message;
            }
        }
        if successes > 0 && aggregate.records_written > 0 {
            aggregate.status = StreamStatus::Success;
            aggregate.capability = CapabilityStatus::Verified;
            aggregate.needs_reauth = false;
            aggregate.message = (notices > 0)
                .then(|| format!("已解析可用数据；{notices} 个可选响应没有可识别记录"));
        }
        let db = self.db.lock().await;
        db.update_sync_state_details(
            stream,
            None,
            status_name(&aggregate.status),
            aggregate.message.as_deref(),
            aggregate.needs_reauth,
            aggregate.records_written,
            aggregate.capability.clone(),
            aggregate.message.clone(),
        )?;
        Ok(aggregate)
    }

    async fn persist_record(&self, record: FetchedRecord) -> Result<PersistResult> {
        let stream = record.raw.stream.clone();
        let capability = record.raw.capability.clone();
        let db = self.db.lock().await;
        let mut report = StreamReport {
            stream: stream.clone(),
            status: StreamStatus::Success,
            records_written: 0,
            raw_records: 1,
            capability: capability.clone(),
            needs_reauth: false,
            message: None,
        };
        match db.persist_fetched_record(&record.raw) {
            Ok((_, value)) => {
                report.records_written = value.primary_records;
            }
            Err(error) if error.is_unavailable() && capability == CapabilityStatus::Unverified => {
                report.status = StreamStatus::Unverified;
                report.capability = CapabilityStatus::Unverified;
                report.message = Some(error.user_message());
            }
            Err(error) if error.is_unavailable() => {
                report.status = StreamStatus::Unavailable;
                report.capability = CapabilityStatus::Unavailable;
                report.message = Some(error.user_message());
            }
            Err(error) => {
                report.status = StreamStatus::Failed;
                report.capability = CapabilityStatus::Unavailable;
                report.needs_reauth = error.needs_reauth();
                report.message = Some(error.user_message());
            }
        }
        db.update_sync_state_details(
            &stream,
            None,
            status_name(&report.status),
            report.message.as_deref(),
            report.needs_reauth,
            report.records_written,
            report.capability.clone(),
            report.message.clone(),
        )?;
        Ok(PersistResult { report })
    }

    async fn failure_report(&self, stream: &str, error: &ZeppBridgeError) -> Result<StreamReport> {
        let previous = self.previous_records_written(stream).await?;
        let report = StreamReport {
            stream: stream.into(),
            status: StreamStatus::Failed,
            records_written: previous,
            raw_records: 0,
            capability: CapabilityStatus::Unavailable,
            needs_reauth: error.needs_reauth(),
            message: Some(error.user_message()),
        };
        let db = self.db.lock().await;
        db.update_sync_state_details(
            stream,
            None,
            "failed",
            report.message.as_deref(),
            report.needs_reauth,
            previous,
            CapabilityStatus::Unavailable,
            report.message.clone(),
        )?;
        Ok(report)
    }

    async fn unavailable_report(
        &self,
        stream: &str,
        error: &ZeppBridgeError,
    ) -> Result<StreamReport> {
        let previous = self.previous_records_written(stream).await?;
        let report = StreamReport {
            stream: stream.into(),
            status: StreamStatus::Unavailable,
            records_written: previous,
            raw_records: 0,
            capability: CapabilityStatus::Unavailable,
            needs_reauth: error.needs_reauth(),
            message: Some(error.user_message()),
        };
        let db = self.db.lock().await;
        db.update_sync_state_details(
            stream,
            None,
            "unavailable",
            report.message.as_deref(),
            report.needs_reauth,
            previous,
            CapabilityStatus::Unavailable,
            report.message.clone(),
        )?;
        Ok(report)
    }

    /// A failed or unavailable stream must not reset its persisted
    /// `records_written` counter; the UI reads that value as "已同步 N 条",
    /// so a transient failure would otherwise make the stored data look wiped.
    async fn previous_records_written(&self, stream: &str) -> Result<i64> {
        let db = self.db.lock().await;
        Ok(db
            .get_sync_state(stream)?
            .map(|state| state.records_written)
            .unwrap_or(0))
    }

    #[allow(dead_code)]
    pub async fn cleanup(&self, days: i64) -> Result<()> {
        let db = self.db.lock().await;
        db.cleanup_old_data(days)
    }
}

fn status_name(status: &StreamStatus) -> &'static str {
    match status {
        StreamStatus::Success => "success",
        StreamStatus::Failed => "failed",
        StreamStatus::Unavailable => "unavailable",
        StreamStatus::Unverified => "unverified",
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::connectors::ZeppConnector;
    use crate::fetcher::DataFetcher;
    use crate::models::{AuthInfo, CapabilityStatus};
    use crate::storage::Database;
    use std::sync::atomic::AtomicBool;

    #[test]
    fn status_names_are_not_success_for_optional_states() {
        assert_eq!(status_name(&StreamStatus::Unavailable), "unavailable");
        assert_eq!(status_name(&StreamStatus::Unverified), "unverified");
    }

    #[tokio::test]
    async fn failure_report_preserves_records_written() {
        let dir = std::env::temp_dir().join(format!(
            "zeppbridge-sync-test-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let db = Database::new(dir.join("test.db")).unwrap();
        db.update_sync_state_details(
            "heart_rate",
            None,
            "success",
            None,
            false,
            500,
            CapabilityStatus::Verified,
            None,
        )
        .unwrap();

        let auth = AuthInfo {
            app_token: "test-token".into(),
            user_id: "user-1".into(),
            region_host: "https://api-mifit.zepp.com".into(),
        };
        let connector = ZeppConnector::new(auth).unwrap();
        let fetcher = DataFetcher::new(connector);
        let manager = SyncManager::new(fetcher, db, Arc::new(AtomicBool::new(false)));

        let error = ZeppBridgeError::HttpStatus {
            status: 500,
            message: "boom".into(),
        };
        let report = manager.failure_report("heart_rate", &error).await.unwrap();
        assert_eq!(report.records_written, 500);
        let unavailable = manager
            .unavailable_report("heart_rate", &error)
            .await
            .unwrap();
        assert_eq!(unavailable.records_written, 500);

        let _ = std::fs::remove_dir_all(dir);
    }
}
