use crate::fetcher::{DataFetcher, FetchWindow, FetchedRecord};

use crate::models::{error::*, *};

use crate::storage::coverage::{self, ChunkStatus, CoverageChunk, CoverageLedger};

use crate::storage::provenance::{Stage, StageErrorKind, StageOutcome};

use crate::storage::write_lock::{self, ExclusiveWriteGuard, WritePurpose};

use crate::storage::Database;

use chrono::{Duration, Utc};

use serde::{Deserialize, Serialize};

use std::sync::atomic::{AtomicBool, Ordering};

use std::sync::Arc;

use std::time::Instant;

/// 等另一个写者最多这么久。超过就告诉用户「另一个操作正在进行」，
/// 而不是让界面一直转圈。
const WRITE_LOCK_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(20);

use tokio::sync::Mutex;

mod backfill;
mod persist;
mod report;

use report::*;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
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
    /// 这一次同步有没有整体成功。
    ///
    /// **任何一个数据流真的 `Failed` 都会让它变成 false**，不只是那三个核心
    /// 流。以前它只看 `heart_rate` / `daily_summary` / `workouts`，于是 sleep
    /// 或 hrv 真的取失败时，界面照样显示「已更新」或者「没有新数据」——程序
    /// 表面告诉用户一切正常，底层事实已经缺了一整条流。
    ///
    /// `Unavailable` / `Unverified` **不算失败**：用户的表本来就可能不提供
    /// HRV，那是能力边界，不是错误。
    pub success: bool,
    /// 三个核心流（`heart_rate` / `daily_summary` / `workouts`）有没有全都没
    /// 失败。用来决定「凭据是否算验证通过」——主干数据通没通。retention
    /// 清理另看 `success`：任何一条流 `Failed` 都不删旧数据。
    pub core_ok: bool,
    pub streams: Vec<StreamReport>,
    pub records_written: i64,
    pub message: Option<String>,
}

/// 这三条是核心流。缺了它们这个应用没有存在意义；其余的是支流。
///
/// 注意它只用来判断 `core_ok`。**判断 `success` 时不分主次**——支流失败
/// 一样是失败，只是不至于让整次同步降级成 `failed`。
const CORE_STREAMS: [&str; 3] = ["heart_rate", "daily_summary", "workouts"];

/// 某个流名是不是核心流。
pub fn is_core_stream(stream: &str) -> bool {
    CORE_STREAMS.contains(&stream)
}

pub struct SyncManager {
    fetcher: Arc<DataFetcher>,
    db: Arc<Mutex<Database>>,
    run_lock: Arc<Mutex<()>>,
    /// 跨进程写锁的作用范围。`None` 时只有进程内互斥（测试用的内存库）。
    data_dir: Option<std::path::PathBuf>,
    pub cancel: Arc<AtomicBool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncProgress {
    /// True only after this stream has finished persisting and released its DB lock.
    #[serde(default)]
    pub completed: bool,
    pub stream: String,
    pub current: u32,
    pub total: u32,
    /// 中文原文。CLI 和日志用它，不跟界面语言走。
    pub message: String,
    /// 这一步在做什么的稳定码（`syncing` / `backfilling`）。界面按它加上
    /// `stream` 自己写句子——后端不按 locale 出文案，四个出口才会说同一件事。
    #[serde(default)]
    pub code: String,
    /// 补拉时这一块是哪个月（`YYYY-MM`）。同步时为空。
    #[serde(default)]
    pub detail: Option<String>,
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
            data_dir: None,
            cancel,
        }
    }

    /// 指定数据目录后，同步会额外获取跨进程写锁。
    pub fn with_data_dir(mut self, data_dir: std::path::PathBuf) -> Self {
        self.data_dir = Some(data_dir);
        self
    }

    /// 等待写锁，超时后把「谁在写」告诉调用方而不是假死。
    pub(super) fn acquire_write_lock(
        &self,
        purpose: WritePurpose,
    ) -> Result<Option<ExclusiveWriteGuard>> {
        let Some(data_dir) = self.data_dir.as_ref() else {
            return Ok(None);
        };
        match write_lock::acquire_with_timeout(data_dir, purpose, WRITE_LOCK_TIMEOUT) {
            Ok(guard) => Ok(Some(guard)),
            // 「有人在写」和「锁建不起来」要分开：前者可重试，后者要人介入。
            Err(error @ write_lock::WriteLockError::Busy { .. }) => {
                Err(ZeppBridgeError::Busy(error.to_string()))
            }
            Err(error) => Err(ZeppBridgeError::ConfigError(error.to_string())),
        }
    }

    pub fn request_cancel(&self) {
        self.cancel.store(true, Ordering::SeqCst);
    }

    /// 本地维护（重放 / 压缩）正在写库时，不要去抢那把 20 秒超时的写锁。
    pub(super) fn stand_aside_if_local_maintenance(&self) -> Result<()> {
        if crate::storage::compaction_in_progress() || crate::storage::replay_in_progress() {
            let message = if crate::storage::compaction_in_progress() {
                "正在压缩历史报文以节省磁盘空间"
            } else {
                "正在用本地原始报文重建派生数据"
            };
            return Err(ZeppBridgeError::Busy(message.into()));
        }
        Ok(())
    }

    pub(super) fn abort_if_cancelled(&self) -> Result<()> {
        if self.cancel.load(Ordering::SeqCst) {
            return Err(ZeppBridgeError::Cancelled);
        }
        Ok(())
    }

    /// Signal cancellation and wait until any in-flight run has released
    /// `run_lock`. Returns immediately when nothing is running.
    pub async fn cancel_and_wait(&self) {
        self.request_cancel();
        let _guard = self.run_lock.lock().await;
    }

    /// Ask the server which optional event streams this account and these
    /// devices actually expose.
    ///
    /// Only probe metadata is saved for the capability board; no health
    /// readings or raw responses are imported by this action. The day probed
    /// is yesterday, which is the most recent day a watch has certainly
    /// finished syncing.
    pub async fn probe_capabilities(&self) -> Result<Vec<CapabilityProbe>> {
        let day = (Utc::now() - Duration::days(1)).date_naive();
        // The dateString surface wants an IANA zone name; the devices already
        // told us theirs, so ask them rather than assuming UTC.
        let time_zone = {
            let database = self.db.lock().await;
            database.device_time_zone().unwrap_or(None)
        }
        .unwrap_or_else(|| "UTC".to_string());
        let probes = self
            .fetcher
            .probe_event_streams(day, &time_zone, None)
            .await;
        if !probes.is_empty() {
            let database = self.db.lock().await;
            database.save_capability_probe(&probes)?;
        }
        Ok(probes)
    }

    /// Check only the streams that leave no local trace, and remember the answer.
    ///
    /// Capability is not something a person should have to ask for by pressing a
    /// button: it is a fact about their account, learned the same way heart rate
    /// is. Most of it comes free from stored data; this covers the remainder, at
    /// three requests, and only once the last answer has gone stale.
    pub async fn refresh_capabilities_if_stale(&self, max_age_days: i64) -> Result<bool> {
        let stale = {
            let database = self.db.lock().await;
            database.capability_probe_is_stale(max_age_days)?
        };
        if !stale {
            return Ok(false);
        }
        let day = (Utc::now() - Duration::days(1)).date_naive();
        let time_zone = {
            let database = self.db.lock().await;
            database.device_time_zone().unwrap_or(None)
        }
        .unwrap_or_else(|| "UTC".to_string());
        let probes = self
            .fetcher
            .probe_event_streams(
                day,
                &time_zone,
                Some(&crate::storage::PROBE_ONLY_CAPABILITIES),
            )
            .await;
        self.abort_if_cancelled()?;
        if probes.is_empty() {
            return Ok(false);
        }
        let database = self.db.lock().await;
        database.save_capability_probe(&probes)?;
        Ok(true)
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

    pub async fn incremental_sync_report(&self) -> Result<SyncReport> {
        self.sync_report(crate::contract::INCREMENTAL_SYNC_DAYS, None)
            .await
    }

    pub async fn incremental_sync_report_with_progress<F>(
        &self,
        on_progress: F,
    ) -> Result<SyncReport>
    where
        F: Fn(SyncProgress) + Send + Sync,
    {
        self.sync_report(crate::contract::INCREMENTAL_SYNC_DAYS, Some(&on_progress))
            .await
    }
}

#[cfg(test)]
mod tests;
