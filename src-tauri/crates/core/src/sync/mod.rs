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
    /// 失败。用来决定「凭据是否算验证通过」和「要不要跑 retention 清理」这
    /// 两件事——它们关心的是主干数据通没通，不是每一条支流。
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
    fn acquire_write_lock(&self, purpose: WritePurpose) -> Result<Option<ExclusiveWriteGuard>> {
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

    /// Ask the server which optional event streams this account and these
    /// devices actually expose.
    ///
    /// Read-only by construction: results are returned to the caller and never
    /// persisted, so a probe cannot pollute the library with guesses. The day
    /// probed is yesterday, which is the most recent day a watch has certainly
    /// finished syncing.
    pub async fn probe_capabilities(&self) -> Vec<CapabilityProbe> {
        let day = (Utc::now() - Duration::days(1)).date_naive();
        // The dateString surface wants an IANA zone name; the devices already
        // told us theirs, so ask them rather than assuming UTC.
        let time_zone = {
            let database = self.db.lock().await;
            database.device_time_zone().unwrap_or(None)
        }
        .unwrap_or_else(|| "UTC".to_string());
        self.fetcher
            .probe_event_streams(day, &time_zone, None)
            .await
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
        if probes.is_empty() {
            return Ok(false);
        }
        let database = self.db.lock().await;
        database.save_capability_probe(&probes)?;
        Ok(true)
    }

    /// Compatibility command surface. A report containing failed core streams
    /// is converted to an error, so callers cannot display false success.
    ///
    /// 这里看的是 `core_ok` 而不是 `success`：这个入口只有「Ok 或者 Err」两
    /// 种表达，把一条支流失败升级成硬错误会让调用方以为什么都没拿到。要看
    /// 完整结果的用 `initial_sync_report`。
    #[allow(dead_code)]
    pub async fn initial_sync(&self) -> Result<()> {
        let report = self.initial_sync_report().await?;
        if report.core_ok {
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

    /// 同 `initial_sync`：这个入口只表达核心流通没通。
    #[allow(dead_code)]
    pub async fn incremental_sync(&self) -> Result<()> {
        let report = self.incremental_sync_report().await?;
        if report.core_ok {
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

    async fn sync_report(
        &self,
        days: i64,
        on_progress: Option<&(dyn Fn(SyncProgress) + Send + Sync)>,
    ) -> Result<SyncReport> {
        self.cancel.store(false, Ordering::SeqCst);
        let _run_guard = self.run_lock.lock().await;
        // 进程内的 run_lock 拦不住第二个进程。CLI 的 `sync` 和桌面应用同时跑
        // 起来时，重复请求和重复清理是最轻的后果。
        let _write_guard = self.acquire_write_lock(WritePurpose::Sync)?;
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
                    code: "syncing".into(),
                    detail: None,
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

        emit("heart_rate", 1, 8, "正在同步心率");
        check()?;
        match self.fetcher.fetch_heart_rate_records(window).await {
            Ok(records) => streams.push(self.persist_records("heart_rate", records).await?),
            Err(error) if error.is_cancelled() => return Err(error),
            Err(error) => streams.push(self.failure_report("heart_rate", &error).await?),
        }
        emit("daily_summary", 2, 8, "正在同步每日概览");
        check()?;
        match self.fetcher.fetch_daily_statistics_records(window).await {
            Ok(records) => streams.push(self.persist_records("daily_summary", records).await?),
            Err(error) if error.is_cancelled() => return Err(error),
            Err(error) => streams.push(self.failure_report("daily_summary", &error).await?),
        }
        emit("workouts", 3, 8, "正在同步运动");
        check()?;
        match self.fetcher.fetch_workout_records(window).await {
            Ok(records) => streams.push(self.persist_records("workouts", records).await?),
            Err(error) if error.is_cancelled() => return Err(error),
            Err(error) if error.is_unavailable() => {
                streams.push(self.unavailable_report("workouts", &error).await?)
            }
            Err(error) => streams.push(self.failure_report("workouts", &error).await?),
        }
        emit("workout_detail", 4, 8, "正在同步跑步明细");
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
        emit("sleep", 5, 8, "正在同步睡眠");
        check()?;
        match self.fetcher.fetch_sleep_records(window).await {
            Ok(records) => streams.push(self.persist_records("sleep", records).await?),
            Err(error) if error.is_cancelled() => return Err(error),
            Err(error) if error.is_unavailable() => {
                streams.push(self.unavailable_report("sleep", &error).await?)
            }
            Err(error) => streams.push(self.failure_report("sleep", &error).await?),
        }
        emit("hrv", 6, 8, "正在同步心率变异性");
        check()?;
        match self.fetcher.fetch_hrv_records(window).await {
            Ok(records) => streams.push(self.persist_records("hrv", records).await?),
            Err(error) if error.is_cancelled() => return Err(error),
            Err(error) if error.is_unavailable() => {
                streams.push(self.unavailable_report("hrv", &error).await?)
            }
            Err(error) => streams.push(self.failure_report("hrv", &error).await?),
        }
        emit("wellness", 7, 8, "正在同步压力、血氧等可选指标");
        check()?;
        // The dateString surface needs an IANA zone name, and the devices
        // already told us theirs.
        let wellness_time_zone = {
            let database = self.db.lock().await;
            database.device_time_zone().unwrap_or(None)
        }
        .unwrap_or_else(|| "UTC".to_string());
        match self
            .fetcher
            .fetch_wellness_records(window, &wellness_time_zone)
            .await
        {
            Ok(records) => streams.push(self.persist_records("wellness", records).await?),
            Err(error) if error.is_cancelled() => return Err(error),
            Err(error) if error.is_unavailable() => {
                streams.push(self.unavailable_report("wellness", &error).await?)
            }
            Err(error) => streams.push(self.failure_report("wellness", &error).await?),
        }

        // 体重 / 体成分。四个人问过它，而以前它一条都没取过：能力探针打的是
        // `/v2/users/me/events?eventType=weight`，那一页对任何账号都是空的。
        // 真正的数据在 `/users/{id}/members/-1/weightRecords`。
        //
        // 没有秤的账号在这里同样会有记录（Zepp App 里手填的体重也走这条），
        // 所以它不是「有秤才有用」的一条流。
        emit("weight", 8, 8, "正在同步体重与体成分");
        check()?;
        match self.fetcher.fetch_weight_records(window).await {
            Ok(records) => streams.push(self.persist_records("weight", records).await?),
            Err(error) if error.is_cancelled() => return Err(error),
            Err(error) if error.is_unavailable() => {
                streams.push(self.unavailable_report("weight", &error).await?)
            }
            Err(error) => streams.push(self.failure_report("weight", &error).await?),
        }

        // Learned quietly, alongside everything else the sync brings back. A
        // failure here must not colour the sync outcome: it is a convenience,
        // not one of the data streams.
        if let Err(error) = self.refresh_capabilities_if_stale(7).await {
            if error.is_cancelled() {
                return Err(error);
            }
        }

        // 真正失败的流。`Unavailable` / `Unverified` 不在其中：那是「这块表
        // 没有这个能力」，不是「取失败了」。
        let failed: Vec<String> = streams
            .iter()
            .filter(|report| report.status == StreamStatus::Failed)
            .map(|report| report.stream.clone())
            .collect();
        let core_failed = failed.iter().any(|stream| is_core_stream(stream));
        let core_ok = !core_failed;
        // 一条支流失败也是失败。以前这里只看核心流，sleep 取挂了界面照样
        // 报「已更新」。
        let success = failed.is_empty();
        let total_written = streams.iter().map(|report| report.records_written).sum();
        if core_ok {
            let db = self.db.lock().await;
            let prefs = db.user_prefs()?;
            // 开了长期归档就不再自动清理。刚补拉回来的历史在下一次成功同步后
            // 被删掉，是这类功能最让人失去信任的行为。
            if !prefs.archive_enabled {
                db.cleanup_old_data(prefs.retention_days)?;
            }
        }
        Ok(SyncReport {
            success,
            core_ok,
            streams,
            records_written: total_written,
            message: if core_failed {
                Some("至少一个核心数据流失败；同步未报告成功".into())
            } else if !failed.is_empty() {
                // 说清是哪几条。「部分失败」不告诉用户少了什么，等于没说。
                Some(format!("以下数据流失败：{}", failed.join("、")))
            } else {
                None
            },
        })
    }

    /// 完整历史补拉。
    ///
    /// 按自然月分块、逐块记账，所以：中断之后从没做完的那块继续；重复执行
    /// 不会重复写；「云端没有返回」和「我们没请求过」在账本里是两种状态。
    ///
    /// 补拉**不做清理**。刚拿回来的历史在同一轮里又被 retention 删掉，是最
    /// 让人失去信任的行为；调用方在开始之前就应该被 `backfill_would_be_cleaned_up`
    /// 拦住。
    pub async fn history_backfill<F>(
        &self,
        from: chrono::NaiveDate,
        to: chrono::NaiveDate,
        max_chunks: usize,
        on_progress: F,
    ) -> Result<CoverageLedger>
    where
        F: Fn(SyncProgress) + Send + Sync,
    {
        self.cancel.store(false, Ordering::SeqCst);
        let _run_guard = self.run_lock.lock().await;
        let _write_guard = self.acquire_write_lock(WritePurpose::HistoryBackfill)?;

        {
            let db = self.db.lock().await;
            let prefs = db.user_prefs()?;
            let requested_days = (Utc::now().date_naive() - from).num_days().max(0);
            if prefs.backfill_would_be_cleaned_up(requested_days) {
                return Err(ZeppBridgeError::ConfigError(format!(
                    "这次补拉要取回 {requested_days} 天的历史，但本机只保留最近 {} 天，下一次成功同步就会把刚拿回来的数据删掉。请先打开「长期归档」，或者把保留期调长。",
                    prefs.retention_days
                )));
            }
            db.plan_backfill(from, to)?;
        }

        let time_zone = {
            let db = self.db.lock().await;
            db.device_time_zone().unwrap_or(None)
        }
        .unwrap_or_else(|| "UTC".to_string());

        // 这一轮要做的块**一次取齐**，而不是每轮回数据库拿「当前第一块」。
        //
        // 旧写法每次取 `pending_backfill_chunks(1)`：一块失败后被写回
        // `failed`，而 `failed` 仍然满足待办条件、排序键也没变，于是下一轮
        // 必然再选中同一块，把 max_chunks 的额度全耗在它身上——同月其余的流
        // 和所有更早的月份一块都轮不上。这正是 issue #10「一个心率块失败之后
        // 整个补拉就不动了」的成因。
        //
        // 一次取齐之后，每个 (stream, 月份) 在一轮里最多被尝试一次；失败的块
        // 留给下一轮（或用户显式重试），不会挡住任何人。
        let queue = {
            let db = self.db.lock().await;
            db.pending_backfill_chunks(max_chunks)?
        };
        let total = {
            let db = self.db.lock().await;
            db.coverage_ledger()?.total_chunks.max(1) as u32
        };

        let mut processed = 0usize;
        for chunk in queue {
            if self.cancel.load(Ordering::SeqCst) {
                break;
            }
            processed += 1;

            on_progress(SyncProgress {
                stream: chunk.stream.clone(),
                current: processed as u32,
                total,
                message: format!("正在补拉 {} · {}", chunk.stream, &chunk.chunk_start[..7]),
                code: "backfilling".into(),
                detail: Some(chunk.chunk_start[..7].to_string()),
            });

            let outcome = self.backfill_one_chunk(&chunk, &time_zone).await;
            let db = self.db.lock().await;
            match outcome {
                Ok((status, records, reason)) => db.record_backfill_chunk(
                    &chunk.stream,
                    &chunk.chunk_start,
                    status,
                    records,
                    reason.as_ref().map(|(_, text)| text.as_str()),
                    reason.as_ref().map(|(code, _)| *code),
                )?,
                Err(error) if error.is_cancelled() => break,
                Err(error) => db.record_backfill_chunk(
                    &chunk.stream,
                    &chunk.chunk_start,
                    ChunkStatus::Failed,
                    0,
                    Some(&error.user_message()),
                    Some(error.code()),
                )?,
            }
        }

        let db = self.db.lock().await;
        db.coverage_ledger()
    }

    /// 拉取并写入一块。返回这块的结论、写入条数，以及失败时的原因。
    ///
    /// 原因要一路带到账本里：界面只显示「失败 N 块」而不说为什么，用户既
    /// 判断不了该不该重试，也没法把有用的信息报回来。
    async fn backfill_one_chunk(
        &self,
        chunk: &CoverageChunk,
        time_zone: &str,
    ) -> Result<(ChunkStatus, i64, Option<(&'static str, String)>)> {
        let start = chrono::NaiveDate::parse_from_str(&chunk.chunk_start, "%Y-%m-%d")
            .map_err(|_| ZeppBridgeError::ParseError("覆盖账本里的日期无效".into()))?;
        let end = chrono::NaiveDate::parse_from_str(&chunk.chunk_end, "%Y-%m-%d")
            .map_err(|_| ZeppBridgeError::ParseError("覆盖账本里的日期无效".into()))?;
        let window = FetchWindow::between(coverage::to_utc(start), coverage::to_utc(end))?;

        let records = match chunk.stream.as_str() {
            "heart_rate" => self.fetcher.fetch_heart_rate_records(window).await,
            "daily_summary" => self.fetcher.fetch_daily_statistics_records(window).await,
            "workouts" => self.fetcher.fetch_workout_records(window).await,
            "sleep" => self.fetcher.fetch_sleep_records(window).await,
            "hrv" => self.fetcher.fetch_hrv_records(window).await,
            "wellness" => self.fetcher.fetch_wellness_records(window, time_zone).await,
            "weight" => self.fetcher.fetch_weight_records(window).await,
            other => {
                return Err(ZeppBridgeError::ConfigError(format!(
                    "未知的补拉数据流: {other}"
                )))
            }
        };

        match records {
            Ok(records) if records.is_empty() => {
                // 请求过了，云端明确没有这段时间的数据。这不是失败，也不该重试。
                Ok((ChunkStatus::EmptyFromCloud, 0, None))
            }
            Ok(records) => {
                let report = self.persist_records(&chunk.stream, records).await?;
                if report.records_written > 0 {
                    Ok((ChunkStatus::Persisted, report.records_written, None))
                } else if matches!(
                    report.status,
                    StreamStatus::Unavailable | StreamStatus::Unverified | StreamStatus::Success
                ) {
                    // 云端返回的报文里没有可识别记录——比如心率接口对这段时间
                    // 返回 `{"items": []}`，它是在明确回答「这段时间没有」。
                    //
                    // 上面那条 `Err(error) if error.is_unavailable()` 早就把同一件
                    // 事记成 `EmptyFromCloud` 了；差别只在于报文是在取的时候失败，
                    // 还是取回来之后才发现是空的。对用户来说这没有区别，账本不该
                    // 因此给出两种结论。
                    //
                    // 记成失败会连锁出两个问题：界面把一段本来就没有数据的历史排成
                    // 一长串红色「失败」，用户以为自己丢了几个月数据；而这些块又会
                    // 一直排在待办队首，把后面的块全挡住——issue #10 的现场正是如此。
                    //
                    // `StreamStatus::Failed` 不在这里：那是真的写不进去或认证挂了。
                    Ok((ChunkStatus::EmptyFromCloud, 0, None))
                } else {
                    // 报文回来了但一条 canonical 都没产出：这不是「云端没有」，
                    // 记成失败以便重试和排查。
                    //
                    // 这一类多半是**确定性**失败——同样的报文再拉一次还是解析
                    // 不出来。账本里的 attempts 会让它自动重试几次后停下来，
                    // 不再挡住后面的块。
                    Ok((
                        ChunkStatus::Failed,
                        0,
                        Some((
                            "err.backfill.no_canonical_records",
                            "云端返回了报文，但没有解析出可用记录".to_string(),
                        )),
                    ))
                }
            }
            Err(error) if error.is_unavailable() => Ok((ChunkStatus::EmptyFromCloud, 0, None)),
            Err(error) => Err(error),
        }
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
                Err(error) => {
                    tracing::warn!("拉取运动明细 {} 失败: {}", item.workout_id, error);
                    last_error = Some(error);
                }
            }
        }
        if records.is_empty() {
            if let Some(error) = last_error {
                if error.is_unavailable() {
                    return Err(error);
                }
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
        db.record_stream_written(stream, aggregate.records_written)?;
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
        // 报文已经拿回来了，所以无论后面解析和写入成败，fetch 阶段都是成功的。
        // 把三个阶段分开记录，界面才能说清是「没拉到」「没看懂」还是「没写进去」。
        db.record_stream_stage(&stream, Stage::Fetch, &StageOutcome::Ok)?;
        match db.persist_fetched_record(&record.raw) {
            Ok((_, value)) => {
                report.records_written = value.primary_records;
                db.record_stream_stage(&stream, Stage::Parse, &StageOutcome::Ok)?;
                db.record_stream_stage(&stream, Stage::Write, &StageOutcome::Ok)?;
            }
            Err(error) if error.is_unavailable() && capability == CapabilityStatus::Unverified => {
                report.status = StreamStatus::Unverified;
                report.capability = CapabilityStatus::Unverified;
                report.message = Some(error.user_message());
                // 拿到了报文但当前 normalizer 不认识它的结构。raw 已保留，
                // 这是解析阶段的失败，不是网络失败。
                db.record_stream_stage(
                    &stream,
                    Stage::Parse,
                    &StageOutcome::Failed {
                        kind: StageErrorKind::UnrecognizedPayload,
                        message: report.message.clone(),
                    },
                )?;
            }
            Err(error) if error.is_unavailable() => {
                report.status = StreamStatus::Unavailable;
                report.capability = CapabilityStatus::Unavailable;
                report.message = Some(error.user_message());
                db.record_stream_stage(
                    &stream,
                    Stage::Parse,
                    &StageOutcome::Failed {
                        kind: StageErrorKind::NotAvailable,
                        message: report.message.clone(),
                    },
                )?;
            }
            Err(error) => {
                report.status = StreamStatus::Failed;
                report.capability = CapabilityStatus::Unavailable;
                report.needs_reauth = error.needs_reauth();
                report.message = Some(error.user_message());
                let kind = StageErrorKind::classify(&error);
                let stage = if kind == StageErrorKind::Storage {
                    Stage::Write
                } else {
                    Stage::Parse
                };
                db.record_stream_stage(
                    &stream,
                    stage,
                    &StageOutcome::Failed {
                        kind,
                        message: report.message.clone(),
                    },
                )?;
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
        db.record_stream_stage(
            stream,
            Stage::Fetch,
            &StageOutcome::Failed {
                kind: StageErrorKind::classify(error),
                message: report.message.clone(),
            },
        )?;
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
