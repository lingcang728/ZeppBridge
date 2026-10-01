//! 官方开放平台的同步编排（第九轮批次 ③）。
//!
//! 原则由用户定：**哪边数据更丰富、更准确就用哪边**。2026-09-29 拿真实库副本和官方实测
//! 样本逐日对账的结论：
//!
//! | 数据 | 用哪边 |
//! |---|---|
//! | 睡眠 | 官方为准（多了小睡、REM 真值）；同一晚两边都有时显示官方的 |
//! | 每小时步数 | 只有官方有 |
//! | 心率、每日步数、运动、PAI、体重 | 旧通道更全；只连官方时用官方 |
//!
//! 所以分两种模式：只连官方（[`OfficialMode::Only`]）时上表全部走官方；两边都连
//! （[`OfficialMode::Supplement`]）时旧通道照旧，这里只补官方睡眠和每小时步数。
//!
//! 每一块（≤90 天，心率 7 天）拉到就落库、就通知界面，和旧通道的 `chunked.rs` 一样。

use super::*;
use crate::official::fetch::{
    date_chunks_newest_first, ChunkOutcome, OfficialFetcher, OfficialKind,
};
use crate::official::{
    fresh_tokens, refresh_tokens, OfficialClient, OfficialStore, OfficialTokens,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OfficialMode {
    /// 没有旧通道：官方是唯一来源。
    Only,
    /// 旧通道也连着：只补官方独有、或者官方更好的那几样。
    Supplement,
}

impl OfficialMode {
    pub fn kinds(self) -> &'static [OfficialKind] {
        match self {
            Self::Only => &[
                OfficialKind::HeartRate,
                OfficialKind::ActivityDaily,
                OfficialKind::ActivityHourly,
                OfficialKind::Sleep,
                OfficialKind::Sports,
                OfficialKind::Pai,
                OfficialKind::Body,
            ],
            Self::Supplement => &[OfficialKind::Sleep, OfficialKind::ActivityHourly],
        }
    }
}

/// 一次同步最多补这么多条运动明细，剩下的下次继续（和旧通道的明细队列一样有上限）。
const DETAIL_BATCH: usize = 20;

pub struct OfficialSync {
    db: Mutex<Database>,
    data_dir: Option<std::path::PathBuf>,
    cancel: Arc<AtomicBool>,
    client: OfficialClient,
    store: OfficialStore,
    time_zone: String,
}

impl OfficialSync {
    pub fn new(
        data_dir: &std::path::Path,
        db: Database,
        cancel: Arc<AtomicBool>,
        time_zone: String,
    ) -> Result<Self> {
        Ok(Self::with_parts(
            Some(data_dir.to_path_buf()),
            db,
            cancel,
            OfficialClient::new()?,
            OfficialStore::new(data_dir),
            time_zone,
        ))
    }

    /// 测试用：本地假服务、内存库、假凭据存储。
    pub fn with_parts(
        data_dir: Option<std::path::PathBuf>,
        db: Database,
        cancel: Arc<AtomicBool>,
        client: OfficialClient,
        store: OfficialStore,
        time_zone: String,
    ) -> Self {
        Self {
            db: Mutex::new(db),
            data_dir,
            cancel,
            client,
            store,
            time_zone,
        }
    }

    fn abort_if_cancelled(&self) -> Result<()> {
        if self.cancel.load(Ordering::SeqCst) {
            return Err(ZeppBridgeError::Cancelled);
        }
        Ok(())
    }

    async fn lock(&self, sync_lease: bool) -> Result<Option<ExclusiveWriteGuard>> {
        let Some(dir) = self.data_dir.as_ref() else {
            return Ok(None);
        };
        let acquire = if sync_lease {
            write_lock::acquire_sync_lease
        } else {
            write_lock::acquire_with_timeout
        };
        let deadline = Instant::now() + WRITE_LOCK_TIMEOUT;
        loop {
            match acquire(dir, WritePurpose::Sync, std::time::Duration::ZERO) {
                Ok(guard) => return Ok(Some(guard)),
                Err(write_lock::WriteLockError::Busy { .. }) if Instant::now() < deadline => {
                    self.abort_if_cancelled()?;
                    tokio::time::sleep(LOCK_POLL).await;
                }
                Err(error @ write_lock::WriteLockError::Busy { .. }) => {
                    return Err(ZeppBridgeError::Busy(error.to_string()))
                }
                Err(error) => return Err(ZeppBridgeError::ConfigError(error.to_string())),
            }
        }
    }

    async fn write_db(&self) -> Result<WriteSession<'_>> {
        let lock = self.lock(false).await?;
        Ok(WriteSession {
            db: self.db.lock().await,
            _lock: lock,
        })
    }

    /// 令牌被数据接口拒了：强制刷新一次。刷新也被拒才算真的要重新授权。
    /// 与状态读取共用单飞刷新和比较后写回（R05）。
    async fn recover(&self, tokens: &OfficialTokens) -> Result<OfficialTokens> {
        refresh_tokens(&self.store, &self.client, tokens, Utc::now().timestamp()).await
    }

    /// 同步最近 `days` 天。`mode` 决定拉哪几样（见文件头）。
    ///
    /// 两边都连时这里只是补充：它的失败不改旧通道那几条流的同步状态，只写日志——
    /// 旧通道的睡眠照常显示，官方那份下次再补。
    pub async fn run(
        &self,
        days: i64,
        mode: OfficialMode,
        on_progress: &(dyn Fn(SyncProgress) + Send + Sync),
    ) -> Result<SyncReport> {
        self.cancel.store(false, Ordering::SeqCst);
        // 补充模式也拿同步租约：以前不拿，它可能和 CLI 的同步、或者刚被排上的补拉
        // 同时写同一批流。旧通道那一轮在这之前已经放开了租约。
        let _lease = self.lock(true).await?;
        // 补充同步只补数据：「数据健康」页的逐流状态归旧通道那一轮写（见
        // `Database::quiet_sync_state`）。这条连接是这次补充专用的。
        if mode == OfficialMode::Supplement {
            self.db.lock().await.keep_sync_state_quiet();
        }
        let Some(mut tokens) =
            fresh_tokens(&self.store, &self.client, Utc::now().timestamp()).await?
        else {
            return Err(ZeppBridgeError::NeedsReauth(
                "还没有连接 Zepp 官方授权".into(),
            ));
        };
        // 库主人不是这个官方账号就一行都不写（R06）。补充模式下调用方只记日志，
        // 旧通道那一轮照常。
        self.write_db()
            .await?
            .claim_library_for_sync(&tokens.user_id)?;
        let today = crate::official::fetch::local_today(&self.time_zone);
        let start = today - Duration::days(days.clamp(1, UserPrefs::MAX_HISTORY_SYNC_DAYS) - 1);
        let kinds = mode.kinds();
        let total = kinds.len() as u32 + u32::from(mode == OfficialMode::Only);
        let mut streams: Vec<StreamReport> = Vec::new();
        for (index, kind) in kinds.iter().copied().enumerate() {
            self.abort_if_cancelled()?;
            let current = index as u32 + 1;
            let stream = kind.stream();
            on_progress(progress(stream, current, total, "syncing", false));
            let outcome = self
                .sync_kind(
                    &mut tokens,
                    kind,
                    start,
                    today,
                    stream,
                    current,
                    total,
                    on_progress,
                )
                .await;
            match outcome {
                Ok(report) => {
                    if mode == OfficialMode::Only {
                        streams.push(report);
                    }
                }
                Err(error) if error.is_cancelled() || error.needs_reauth() => return Err(error),
                Err(error) if mode == OfficialMode::Supplement => {
                    tracing::warn!("官方 {} 补充同步失败: {error}", kind.label());
                }
                Err(error) => {
                    let unavailable = error.is_unavailable();
                    let report = StreamReport {
                        stream: stream.into(),
                        status: if unavailable {
                            StreamStatus::Unavailable
                        } else {
                            StreamStatus::Failed
                        },
                        records_written: 0,
                        raw_records: 0,
                        capability: if unavailable {
                            CapabilityStatus::Unavailable
                        } else {
                            CapabilityStatus::Unverified
                        },
                        needs_reauth: false,
                        message: Some(error.user_message()),
                    };
                    let db = self.write_db().await?;
                    streams.push(SyncManager::finish_stream(&db, stream, &[report], None)?);
                }
            }
            on_progress(progress(stream, current, total, "stream_completed", true));
        }
        if mode == OfficialMode::Only {
            self.abort_if_cancelled()?;
            on_progress(progress("workout_detail", total, total, "syncing", false));
            match self.sync_details(&mut tokens).await {
                Ok(Some(report)) => streams.push(report),
                Ok(None) => {}
                Err(error) if error.is_cancelled() || error.needs_reauth() => return Err(error),
                Err(error) => {
                    // 整段明细同步出错（读待补列表、写库失败）：也要进结果，不能只写日志。
                    tracing::warn!("官方运动明细同步失败: {error}");
                    let report = StreamReport {
                        stream: "workout_detail".into(),
                        status: StreamStatus::Failed,
                        records_written: 0,
                        raw_records: 0,
                        capability: CapabilityStatus::Unverified,
                        needs_reauth: false,
                        message: Some(error.user_message()),
                    };
                    let db = self.write_db().await?;
                    streams.push(SyncManager::finish_stream(
                        &db,
                        "workout_detail",
                        &[report],
                        None,
                    )?);
                }
            }
            on_progress(progress(
                "workout_detail",
                total,
                total,
                "stream_completed",
                true,
            ));
        }
        let failed: Vec<String> = streams
            .iter()
            .filter(|report| report.status == StreamStatus::Failed)
            .map(|report| report.stream.clone())
            .collect();
        let core_ok = !failed.iter().any(|stream| is_core_stream(stream));
        // 只连官方时这就是整轮同步：整窗且没有失败，接下来一天的定时同步只拉最近几天（同旧通道）。
        if mode == OfficialMode::Only
            && failed.is_empty()
            && days >= crate::contract::INCREMENTAL_SYNC_DAYS
        {
            if let Ok(db) = self.write_db().await {
                let _ = db.record_full_window_refresh(Utc::now());
            }
        }
        Ok(SyncReport {
            cleanup_failed: false,
            success: failed.is_empty(),
            core_ok,
            records_written: streams.iter().map(|report| report.records_written).sum(),
            message: (!failed.is_empty()).then(|| format!("以下数据流失败：{}", failed.join("、"))),
            streams,
        })
    }

    /// 一样数据：按块从新到旧拉，每块落库后通知界面。
    #[allow(clippy::too_many_arguments)]
    async fn sync_kind(
        &self,
        tokens: &mut OfficialTokens,
        kind: OfficialKind,
        start: NaiveDate,
        end: NaiveDate,
        stream: &str,
        current: u32,
        total: u32,
        on_progress: &(dyn Fn(SyncProgress) + Send + Sync),
    ) -> Result<StreamReport> {
        let mut reports = Vec::new();
        let mut gaps: Vec<String> = Vec::new();
        for (chunk_start, chunk_end) in date_chunks_newest_first(start, end, kind.chunk_days()) {
            self.abort_if_cancelled()?;
            let outcome = match self.fetch(tokens, kind, chunk_start, chunk_end).await {
                Err(error) if error.needs_reauth() => {
                    *tokens = self.recover(tokens).await?;
                    self.fetch(tokens, kind, chunk_start, chunk_end).await?
                }
                other => other?,
            };
            // 没拉全的块：拿到的照常入库，缺口记下来，整条流标失败可重试（R08）。
            if let Some(gap) = outcome.gap {
                tracing::warn!("{gap}");
                gaps.push(gap);
            }
            let db = self.write_db().await?;
            for raw in outcome.records {
                let record = FetchedRecord {
                    raw,
                    incomplete: false,
                    incomplete_reason: None,
                };
                reports.push(SyncManager::persist_record(&db, record)?.report);
            }
            drop(db);
            on_progress(progress(
                stream,
                current,
                total,
                "stream_chunk_committed",
                true,
            ));
        }
        let db = self.write_db().await?;
        let incomplete = (!gaps.is_empty()).then(|| gaps.join("；"));
        if reports.is_empty() {
            // 整段都回空（合法的 `items: []`）：这段时间官方确实没有这一样，不是失败。
            // 有缺口时由 finish_stream 改成失败。
            let empty = StreamReport {
                stream: stream.into(),
                status: StreamStatus::Success,
                records_written: 0,
                raw_records: 0,
                capability: CapabilityStatus::Verified,
                needs_reauth: false,
                message: None,
            };
            return SyncManager::finish_stream(&db, stream, &[empty], incomplete);
        }
        SyncManager::finish_stream(&db, stream, &reports, incomplete)
    }

    async fn fetch(
        &self,
        tokens: &OfficialTokens,
        kind: OfficialKind,
        start: NaiveDate,
        end: NaiveDate,
    ) -> Result<ChunkOutcome> {
        let fetcher = OfficialFetcher {
            client: &self.client,
            access_token: &tokens.access_token,
            time_zone: self.time_zone.clone(),
        };
        fetcher.fetch_chunk(kind, start, end).await
    }

    /// 官方运动里还没有逐秒序列的，补拉明细。没有待补的返回 `None`。
    async fn sync_details(&self, tokens: &mut OfficialTokens) -> Result<Option<StreamReport>> {
        let pending = {
            let db = self.db.lock().await;
            db.official_workouts_missing_detail(DETAIL_BATCH)?
        };
        if pending.is_empty() {
            return Ok(None);
        }
        let mut reports = Vec::new();
        let mut failed = 0usize;
        let mut set_aside = 0usize;
        for (workout_id, start_time) in pending {
            self.abort_if_cancelled()?;
            let day = DateTime::parse_from_rfc3339(&start_time)
                .map(|time| time.with_timezone(&Utc).date_naive())
                .unwrap_or_else(|_| Utc::now().date_naive());
            let fetcher = OfficialFetcher {
                client: &self.client,
                access_token: &tokens.access_token,
                time_zone: self.time_zone.clone(),
            };
            let mut attempt = fetcher.fetch_sport_detail(&workout_id, day).await;
            if matches!(&attempt, Err(error) if error.needs_reauth()) {
                // 令牌被拒：续上以后这一条再要一次，不跳过它。
                *tokens = self.recover(tokens).await?;
                let fetcher = OfficialFetcher {
                    client: &self.client,
                    access_token: &tokens.access_token,
                    time_zone: self.time_zone.clone(),
                };
                attempt = fetcher.fetch_sport_detail(&workout_id, day).await;
            }
            let raw = match attempt {
                Ok(raw) => raw,
                Err(error) if error.is_cancelled() || error.needs_reauth() => return Err(error),
                Err(error) => {
                    tracing::warn!("官方运动明细 {workout_id} 拉取失败: {error}");
                    // 连续失败到上限、或官方明确说没有：先放下，7 天后再试，
                    // 不让同一条永久拿不到的明细每次都把同步标成失败。
                    let gone = error.is_unavailable();
                    let db = self.write_db().await?;
                    if db.record_official_detail_result(&workout_id, false, gone)? {
                        set_aside += 1;
                    } else {
                        failed += 1;
                    }
                    continue;
                }
            };
            let db = self.write_db().await?;
            db.record_official_detail_result(&workout_id, true, false)?;
            let record = FetchedRecord {
                raw,
                incomplete: false,
                incomplete_reason: None,
            };
            reports.push(SyncManager::persist_record(&db, record)?.report);
        }
        // 明细没拉到的不能被报成「完成」（代码审查 R14）：汇总照常保留，
        // 这条流标失败、说清几条没拉到，下次同步会再补（它们仍在待补列表里）。
        let incomplete =
            (failed > 0).then(|| format!("{failed} 条官方运动明细没拉到，下次同步再补"));
        if set_aside > 0 {
            // 中性说明，不算失败：这些暂时拿不到，7 天后自动再试。
            reports.push(StreamReport {
                stream: "workout_detail".into(),
                status: StreamStatus::Unavailable,
                records_written: 0,
                raw_records: 0,
                capability: CapabilityStatus::Unavailable,
                needs_reauth: false,
                message: Some(format!(
                    "{set_aside} 条官方运动明细暂时拿不到，7 天后自动再试"
                )),
            });
        }
        if reports.is_empty() && incomplete.is_none() {
            return Ok(None);
        }
        let db = self.write_db().await?;
        if reports.is_empty() {
            let empty = StreamReport {
                stream: "workout_detail".into(),
                status: StreamStatus::Success,
                records_written: 0,
                raw_records: 0,
                capability: CapabilityStatus::Verified,
                needs_reauth: false,
                message: None,
            };
            return SyncManager::finish_stream(&db, "workout_detail", &[empty], incomplete)
                .map(Some);
        }
        SyncManager::finish_stream(&db, "workout_detail", &reports, incomplete).map(Some)
    }
}

fn progress(stream: &str, current: u32, total: u32, code: &str, completed: bool) -> SyncProgress {
    SyncProgress {
        completed,
        stream: stream.into(),
        current,
        total,
        message: if completed {
            String::new()
        } else {
            format!("正在从 Zepp 官方同步 {stream}")
        },
        code: code.into(),
        detail: None,
    }
}

#[cfg(test)]
#[path = "official_tests.rs"]
mod tests;
