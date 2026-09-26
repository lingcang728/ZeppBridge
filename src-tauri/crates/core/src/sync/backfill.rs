//! 按月补拉历史，并把结果记进覆盖账本（从 sync/mod.rs 拆出，逻辑不变）。

use super::*;

impl SyncManager {
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
        // 见 `sync_report` 里的同一处注释：先拿 `run_lock` 再清 cancel 旗标，
        // 否则会和 `cancel_and_wait()` 的「先举旗再等锁」顺序反过来竞态。
        let _run_guard = self.run_lock.lock().await;
        self.cancel.store(false, Ordering::SeqCst);
        self.stand_aside_if_local_maintenance()?;
        let _write_guard = self.acquire_write_lock(WritePurpose::HistoryBackfill)?;
        self.abort_if_cancelled()?;

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
                completed: false,
                stream: chunk.stream.clone(),
                current: processed as u32,
                total,
                message: format!(
                    "正在补拉 {} · {}",
                    chunk.stream,
                    chunk_month_label(&chunk.chunk_start)
                ),
                code: "backfilling".into(),
                detail: Some(chunk_month_label(&chunk.chunk_start).to_string()),
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
                // 过期的会话让队列里剩下的每一块都注定失败：继续跑只会把整批
                // 额度耗在必然失败的请求上，还漏掉了让用户重新登录的信号——
                // 不像 `sync_report`，这里原来完全没把 needs_reauth 往上抛。
                Err(error) if error.needs_reauth() => return Err(error),
                Err(error) => db.record_backfill_chunk(
                    &chunk.stream,
                    &chunk.chunk_start,
                    ChunkStatus::Failed,
                    0,
                    Some(&error.user_message()),
                    Some(error.code()),
                )?,
            }
            drop(db);
            on_progress(SyncProgress {
                completed: true,
                stream: chunk.stream.clone(),
                current: processed as u32,
                total,
                message: String::new(),
                code: "stream_completed".into(),
                detail: Some(chunk_month_label(&chunk.chunk_start).to_string()),
            });
        }

        let db = self.db.lock().await;
        db.coverage_ledger()
    }

    /// 拉取并写入一块。返回这块的结论、写入条数，以及失败时的原因。
    ///
    /// 原因要一路带到账本里：界面只显示「失败 N 块」而不说为什么，用户既
    /// 判断不了该不该重试，也没法把有用的信息报回来。
    pub(super) async fn backfill_one_chunk(
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
                let incomplete = records.iter().any(|record| record.incomplete);
                let report = self.persist_records(&chunk.stream, records).await?;
                Ok(classify_backfill_report(&report, incomplete))
            }
            Err(error) if error.is_cancelled() || error.needs_reauth() => Err(error),
            Err(error) if error.is_unavailable() => Ok((ChunkStatus::EmptyFromCloud, 0, None)),
            Err(error) => Err(error),
        }
    }
}
