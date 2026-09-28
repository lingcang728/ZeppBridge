//! 一轮同步：按流抓取、落库、汇总成报告（从 sync/mod.rs 拆出，逻辑不变）。

use super::*;

impl SyncManager {
    pub(super) async fn sync_report(
        &self,
        days: i64,
        on_progress: Option<&(dyn Fn(SyncProgress) + Send + Sync)>,
    ) -> Result<SyncReport> {
        // 拿到 `run_lock` 之后再清 cancel 旗标：`cancel_and_wait()` 是先举旗
        // 再等这把锁，旗标在拿锁之前被清掉的话，一次和它撞上的并发调用会把
        // 刚举起的取消请求原地抹掉，而调用方还以为取消成功了。
        let _run_guard = self.run_lock.lock().await;
        self.cancel.store(false, Ordering::SeqCst);
        // 重放/压缩在拿写锁之前就会举旗。这里先看旗，而不是先干等 20 秒再
        // 报 Busy：调用方才能立刻把这次同步标成 deferred 并自动重试。
        self.stand_aside_if_local_maintenance()?;
        // 进程内的 run_lock 拦不住第二个进程。CLI 的 `sync` 和桌面应用同时跑
        // 起来时，重复请求和重复清理是最轻的后果——所以全程拿同步租约。写锁
        // 只在真正写库的那几段拿（`write_db`），联网的时候别的写者照样能写。
        let _lease = self.begin_run(WritePurpose::Sync).await?;
        self.abort_if_cancelled()?;
        let window = FetchWindow::days(days)?;
        let mut streams = Vec::new();
        let started = Instant::now();
        // 两段公式在 days=7/8 的边界上曾经不连续：8~14 天的预算（45+3*days）
        // 比 7 天以内的固定 90 秒还短，天数变多反而给的时间更少。改成一条
        // 单调的公式，用 `.clamp(90, ..)` 保证任何天数都至少有 90 秒。
        let budget = 45u64
            .saturating_add((days.max(0) as u64).saturating_mul(3))
            .clamp(90, 20 * 60);
        let deadline = started + std::time::Duration::from_secs(budget);

        let emit = |stream: &str, current: u32, total: u32, message: &str| {
            if let Some(callback) = on_progress {
                callback(SyncProgress {
                    completed: false,
                    stream: stream.into(),
                    current,
                    total,
                    message: message.into(),
                    code: "syncing".into(),
                    detail: None,
                });
            }
        };

        let completed = |stream: &str, current: u32| {
            if let Some(callback) = on_progress {
                callback(SyncProgress {
                    completed: true,
                    stream: stream.into(),
                    current,
                    total: 8,
                    message: String::new(),
                    code: "stream_completed".into(),
                    detail: None,
                });
            }
        };

        let check = || -> Result<()> {
            self.abort_if_cancelled()?;
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
            Err(error) => streams.push(self.heart_rate_fetch_error(&error).await?),
        }
        completed("heart_rate", 1);
        emit("daily_summary", 2, 8, "正在同步每日概览");
        check()?;
        match self.fetcher.fetch_daily_statistics_records(window).await {
            Ok(records) => streams.push(self.persist_records("daily_summary", records).await?),
            Err(error) if error.is_cancelled() => return Err(error),
            Err(error) => streams.push(self.failure_report("daily_summary", &error).await?),
        }
        completed("daily_summary", 2);
        // Optional streams are retained and reported, never promoted to a
        // verified empty success.
        emit("sleep", 3, 8, "正在同步睡眠");
        check()?;
        match self.fetcher.fetch_sleep_records(window).await {
            Ok(records) => streams.push(self.persist_records("sleep", records).await?),
            Err(error) if error.is_cancelled() => return Err(error),
            Err(error) if error.is_unavailable() => {
                streams.push(self.unavailable_report("sleep", &error).await?)
            }
            Err(error) => streams.push(self.failure_report("sleep", &error).await?),
        }
        completed("sleep", 3);
        emit("workouts", 4, 8, "正在同步运动");
        check()?;
        match self.fetcher.fetch_workout_records(window).await {
            Ok(records) => streams.push(self.persist_records("workouts", records).await?),
            Err(error) if error.is_cancelled() => return Err(error),
            Err(error) if error.is_unavailable() => {
                streams.push(self.unavailable_report("workouts", &error).await?)
            }
            Err(error) => streams.push(self.failure_report("workouts", &error).await?),
        }
        completed("workouts", 4);
        emit("workout_detail", 5, 8, "正在同步跑步明细");
        check()?;
        match self.sync_pending_running_details(deadline).await {
            Ok(reports) if reports.is_empty() => {
                streams.push(self.persist_empty_pending_details().await?);
            }
            Ok(reports) => {
                let db = self.write_db().await?;
                streams.push(Self::finish_stream(&db, "workout_detail", &reports, None)?);
            }
            Err(error) if error.is_cancelled() => return Err(error),
            Err(error) if error.is_unavailable() => {
                streams.push(self.unavailable_report("workout_detail", &error).await?)
            }
            Err(error) => streams.push(self.failure_report("workout_detail", &error).await?),
        }

        completed("workout_detail", 5);
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
        completed("hrv", 6);
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
        completed("wellness", 7);
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

        completed("weight", 8);

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
        // retention 只在没有任何 Failed 流时跑：支流 Failed 时仍删旧数据，
        // 会把刚失败、还没补上的那几天一并清掉。Unavailable / Unverified
        // 不是 Failed，仍允许清理。
        //
        // cleanup 失败不得用 `?` 顶掉已经成功的同步报告——数据已经写入了。
        let mut cleanup_warning = None;
        if success {
            let prefs = self.db.lock().await.user_prefs()?;
            // 开了长期归档就不再自动清理。刚补拉回来的历史在下一次成功同步后
            // 被删掉，是这类功能最让人失去信任的行为。
            if !prefs.archive_enabled {
                let cleaned = match self.write_db().await {
                    Ok(db) => db.cleanup_old_data(prefs.retention_days),
                    Err(error) => Err(error),
                };
                if let Err(error) = cleaned {
                    tracing::warn!("同步后清理旧数据失败: {error}");
                    cleanup_warning = Some(format!(
                        "数据已同步；清理旧数据失败：{}",
                        error.user_message()
                    ));
                }
            }
        }
        // 整窗、且没有任何流失败：记下来，接下来一天里的定时同步只需拉最近几天。
        // 有流失败就不记——下一次定时同步还得整窗，把缺的那几天补回来。
        if success && days >= crate::contract::INCREMENTAL_SYNC_DAYS {
            if let Ok(db) = self.write_db().await {
                let _ = db.record_full_window_refresh(Utc::now());
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
                cleanup_warning
            },
        })
    }
}

pub(super) fn status_name(status: &StreamStatus) -> &'static str {
    match status {
        StreamStatus::Success => "success",
        StreamStatus::Failed => "failed",
        StreamStatus::Unavailable => "unavailable",
        StreamStatus::Unverified => "unverified",
    }
}

pub(super) fn chunk_month_label(chunk_start: &str) -> &str {
    chunk_start.get(..7).unwrap_or(chunk_start)
}

/// 待拉取明细的最终判定：试过但一条都没拿到，就是失败；
/// 从来没有待拉取（`last_error` 为 None）才是空成功。
pub(super) fn pending_details_outcome<T>(
    records: Vec<T>,
    last_error: Option<ZeppBridgeError>,
) -> Result<Vec<T>> {
    if records.is_empty() {
        if let Some(error) = last_error {
            return Err(error);
        }
    }
    Ok(records)
}

/// 把同一条流上多条报文的报告合成一条。
///
/// 分级：只要有一条 `Failed`，聚合就是 `Failed`，不能因为同时还写出过
/// 可用记录就升回 `Success`。没有任何 Failed 时，才允许用「有成功写入」
/// 把 Unverified / Unavailable 收成 Success。
pub(super) fn aggregate_stream_reports(stream: &str, reports: &[StreamReport]) -> StreamReport {
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
    let mut last_failed: Option<&StreamReport> = None;
    let mut last_notice: Option<&StreamReport> = None;

    for one in reports {
        aggregate.records_written += one.records_written;
        aggregate.raw_records += one.raw_records;
        aggregate.needs_reauth |= one.needs_reauth;
        match one.status {
            StreamStatus::Success => successes += 1,
            StreamStatus::Failed => {
                notices += 1;
                last_failed = Some(one);
            }
            StreamStatus::Unavailable | StreamStatus::Unverified => {
                notices += 1;
                last_notice = Some(one);
            }
        }
    }

    if let Some(failed_one) = last_failed {
        aggregate.status = StreamStatus::Failed;
        aggregate.capability = failed_one.capability.clone();
        aggregate.message = if successes > 0 && aggregate.records_written > 0 {
            Some(format!(
                "已解析可用数据；{notices} 个可选响应没有可识别记录"
            ))
        } else {
            failed_one.message.clone()
        };
        return aggregate;
    }

    if successes > 0 && aggregate.records_written > 0 {
        aggregate.status = StreamStatus::Success;
        aggregate.capability = CapabilityStatus::Verified;
        aggregate.needs_reauth = false;
        aggregate.message =
            (notices > 0).then(|| format!("已解析可用数据；{notices} 个可选响应没有可识别记录"));
        return aggregate;
    }

    if let Some(notice) = last_notice {
        aggregate.status = notice.status;
        aggregate.capability = notice.capability.clone();
        aggregate.message = notice.message.clone();
    }
    aggregate
}

pub(super) fn partial_window_reason() -> (&'static str, String) {
    (
        "err.backfill.partial_window",
        "这一块只写入了部分数据，还需要重试".to_string(),
    )
}

pub(super) fn no_canonical_reason() -> (&'static str, String) {
    (
        "err.backfill.no_canonical_records",
        "云端返回了报文，但没有解析出可用记录".to_string(),
    )
}

/// 一块补拉写完之后的账本结论。
///
/// 已经进库的行要留着；子切片 404、解析失败或聚合 Failed 都不能把这个月
/// 画成完整副本。`Unverified` 也不是「云端没有」。
pub(super) fn classify_backfill_report(
    report: &StreamReport,
    incomplete: bool,
) -> (ChunkStatus, i64, Option<(&'static str, String)>) {
    let written = report.records_written;
    if incomplete {
        let reason = (
            partial_window_reason().0,
            report
                .message
                .clone()
                .unwrap_or_else(|| partial_window_reason().1),
        );
        let status = if written > 0 {
            ChunkStatus::Partial
        } else {
            ChunkStatus::Failed
        };
        return (status, written, Some(reason));
    }
    match report.status {
        StreamStatus::Success if written > 0 => (ChunkStatus::Persisted, written, None),
        StreamStatus::Success | StreamStatus::Unavailable => (ChunkStatus::EmptyFromCloud, 0, None),
        StreamStatus::Unverified if written > 0 => {
            (ChunkStatus::Partial, written, Some(partial_window_reason()))
        }
        StreamStatus::Unverified => (ChunkStatus::Failed, 0, Some(no_canonical_reason())),
        StreamStatus::Failed if written > 0 => {
            (ChunkStatus::Partial, written, Some(partial_window_reason()))
        }
        StreamStatus::Failed => (ChunkStatus::Failed, 0, Some(no_canonical_reason())),
    }
}
