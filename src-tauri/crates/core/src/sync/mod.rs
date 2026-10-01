use crate::fetcher::{DataFetcher, FetchWindow, FetchedRecord};

use crate::models::{error::*, *};

use crate::storage::coverage::{self, ChunkStatus, CoverageChunk, CoverageLedger};

use crate::storage::provenance::{Stage, StageErrorKind, StageOutcome};

use crate::storage::write_lock::{self, ExclusiveWriteGuard, WritePurpose};

use crate::storage::Database;

use chrono::{DateTime, Duration, NaiveDate, Utc};

use serde::{Deserialize, Serialize};

use std::sync::atomic::{AtomicBool, Ordering};

use std::sync::Arc;

use std::time::Instant;

/// 等另一个写者最多这么久。超过就告诉用户「另一个操作正在进行」，
/// 而不是让界面一直转圈。
const WRITE_LOCK_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(20);

/// 等锁时隔多久再试一次。
const LOCK_POLL: std::time::Duration = std::time::Duration::from_millis(120);

use tokio::sync::Mutex;

mod backfill;
mod chunked;
mod official;
mod persist;
mod report;

use chunked::OnChunkError;
pub use official::{OfficialMode, OfficialSync};
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
    /// 同步后的旧数据清理没成功（磁盘满、锁被占）。数据已经同步了，所以不改结论；
    /// 但不告诉用户的话，库会一直涨而界面一直是绿的。
    #[serde(default)]
    pub cleanup_failed: bool,
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
    /// 当前这一轮是同步还是补拉。写库时拿写锁要报这个用途：它会原样显示给
    /// 等锁的另一个写者，所以得说实际在做的事。
    run_purpose: std::sync::Mutex<WritePurpose>,
    pub cancel: Arc<AtomicBool>,
    /// 这个同步器替哪个账号写库。设了就在每轮开始时核对库主人（R06）。
    account: Option<String>,
}

/// 写库的一小段：先拿跨进程写锁，再拿这条连接；离开作用域两样一起放。
///
/// 同步全程只拿同步租约（见 `write_lock::acquire_sync_lease`），写锁只在这种
/// 一小段里拿——联网那几十秒、几分钟里，别的写者（改设置、记生活事件、备份）
/// 照样能写。
pub(super) struct WriteSession<'a> {
    db: tokio::sync::MutexGuard<'a, Database>,
    _lock: Option<ExclusiveWriteGuard>,
}

impl std::ops::Deref for WriteSession<'_> {
    type Target = Database;

    fn deref(&self) -> &Database {
        &self.db
    }
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
            run_purpose: std::sync::Mutex::new(WritePurpose::Sync),
            cancel,
            account: None,
        }
    }

    /// 声明这个同步器写的是哪个账号的数据：每轮开始前核对库主人，不是同一个
    /// 账号就一行都不写（代码审查 R06）。
    pub fn with_account(mut self, user_id: impl Into<String>) -> Self {
        self.account = Some(user_id.into());
        self
    }

    /// 指定数据目录后，同步会额外获取跨进程写锁。
    pub fn with_data_dir(mut self, data_dir: std::path::PathBuf) -> Self {
        self.data_dir = Some(data_dir);
        self
    }

    /// 等一把跨进程锁，超时后把「谁在占着」告诉调用方而不是假死。
    ///
    /// 在异步里轮询而不是调阻塞的 `acquire_with_timeout`：等锁的那几秒不该占住
    /// 运行时的工作线程；等的过程中用户按了取消，也要立刻停。
    async fn acquire_lock(
        &self,
        acquire: fn(
            &std::path::Path,
            WritePurpose,
            std::time::Duration,
        )
            -> std::result::Result<ExclusiveWriteGuard, write_lock::WriteLockError>,
        purpose: WritePurpose,
    ) -> Result<Option<ExclusiveWriteGuard>> {
        let Some(data_dir) = self.data_dir.as_ref() else {
            return Ok(None);
        };
        let deadline = Instant::now() + WRITE_LOCK_TIMEOUT;
        loop {
            match acquire(data_dir, purpose, std::time::Duration::ZERO) {
                Ok(guard) => return Ok(Some(guard)),
                Err(write_lock::WriteLockError::Busy { .. }) if Instant::now() < deadline => {
                    self.abort_if_cancelled()?;
                    tokio::time::sleep(LOCK_POLL).await;
                }
                // 「有人在写」和「锁建不起来」要分开：前者可重试，后者要人介入。
                Err(error @ write_lock::WriteLockError::Busy { .. }) => {
                    return Err(ZeppBridgeError::Busy(error.to_string()))
                }
                Err(error) => return Err(ZeppBridgeError::ConfigError(error.to_string())),
            }
        }
    }

    /// 开始一轮同步或补拉：拿同步租约，记下这一轮的用途。
    pub(super) async fn begin_run(
        &self,
        purpose: WritePurpose,
    ) -> Result<Option<ExclusiveWriteGuard>> {
        let lease = self
            .acquire_lock(write_lock::acquire_sync_lease, purpose)
            .await?;
        *self
            .run_purpose
            .lock()
            .unwrap_or_else(|error| error.into_inner()) = purpose;
        if let Some(account) = self.account.as_deref() {
            self.write_db_for(purpose)
                .await?
                .claim_library_for_sync(account)?;
        }
        Ok(lease)
    }

    /// 写库的一小段，用途是当前这一轮的用途。
    pub(super) async fn write_db(&self) -> Result<WriteSession<'_>> {
        let purpose = *self
            .run_purpose
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        self.write_db_for(purpose).await
    }

    pub(super) async fn write_db_for(&self, purpose: WritePurpose) -> Result<WriteSession<'_>> {
        let lock = self
            .acquire_lock(write_lock::acquire_with_timeout, purpose)
            .await?;
        Ok(WriteSession {
            db: self.db.lock().await,
            _lock: lock,
        })
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
        // 和同步一样：拿到 run_lock 再清取消旗。以前探测不清它——取消过一次同步之后，
        // 旗一直立着，连接器每个请求都直接回 Cancelled，探测静默地返回空、什么都不报。
        // 同步正在跑就不排队等它（可能好几分钟），直接说忙；那一轮自己会顺带刷新能力。
        let Ok(_run_guard) = self.run_lock.try_lock() else {
            return Err(ZeppBridgeError::Busy("同步进行中，稍后再探测".into()));
        };
        self.cancel.store(false, Ordering::SeqCst);
        let day = (Utc::now() - Duration::days(1)).date_naive();
        // The dateString surface wants an IANA zone name; the devices already
        // told us theirs, so ask them rather than assuming UTC.
        let time_zone = {
            let database = self.db.lock().await;
            database.device_time_zone().unwrap_or(None)
        }
        .unwrap_or_else(crate::official::fetch::system_time_zone);
        let probes = self
            .fetcher
            .probe_event_streams(day, &time_zone, None)
            .await;
        if !probes.is_empty() {
            let database = self.write_db_for(WritePurpose::Metadata).await?;
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
        .unwrap_or_else(crate::official::fetch::system_time_zone);
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
        let database = self.write_db().await?;
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

    /// 静默的定时同步：只重拉最近 [`crate::contract::QUICK_SYNC_DAYS`] 天；
    /// 距上一次成功的整窗同步超过一天时照旧拉整窗，晚到的数据不会漏。
    pub async fn quick_sync_report_with_progress<F>(&self, on_progress: F) -> Result<SyncReport>
    where
        F: Fn(SyncProgress) + Send + Sync,
    {
        let refresh_due = {
            let db = self.db.lock().await;
            db.full_window_refresh_due(Utc::now())?
        };
        self.sync_report(quick_window_days(refresh_due), Some(&on_progress))
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

/// 定时同步的窗口：整窗刷新到期就拉整窗，否则只拉最近几天。
pub fn quick_window_days(full_refresh_due: bool) -> i64 {
    if full_refresh_due {
        crate::contract::INCREMENTAL_SYNC_DAYS
    } else {
        crate::contract::QUICK_SYNC_DAYS
    }
}

#[cfg(test)]
mod tests;
