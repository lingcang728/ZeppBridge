//! 运动详情队列（拉到一条写一条）、抓到的记录落库与一条流的收尾、失败与不可用的报告。

use super::*;

impl SyncManager {
    /// 拉取待补的跑步明细，**拉到一条写一条**。
    ///
    /// 以前是全部拉完攒成一个 Vec 再一起落库：一轮 40 条明细全压在内存里，而用户
    /// 中途按取消、或者撞上截止时间，已经下载好的那些一条都没留下，下次从头再拉。
    /// 返回每条的报告；这一流的收尾（汇总、同步状态）由调用方做。
    pub(super) async fn sync_pending_running_details(
        &self,
        deadline: Instant,
    ) -> Result<Vec<StreamReport>> {
        let pending = {
            let db = self.db.lock().await;
            db.pending_running_details()?
        };
        let queue_len = pending.len();
        let mut reports = Vec::new();
        let mut last_error = None;
        let mut attempted = 0usize;
        for item in pending {
            if self.cancel.load(Ordering::SeqCst) {
                return Err(ZeppBridgeError::Cancelled);
            }
            if Instant::now() >= deadline {
                break;
            }
            attempted += 1;
            match self
                .fetcher
                .fetch_sport_detail_record(&item.workout_id, &item.source, Utc::now(), None)
                .await
            {
                Ok(record) => {
                    let db = self.write_db().await?;
                    let report = Self::persist_record(&db, record)?.report;
                    // 拿到了但解不开（隔离）不算成功：以前在落库之前就记成功，这条明细
                    // 从此不再算待拉取，下一轮同步把这一流报成绿色「没有待拉取」，这次
                    // 跑步的轨迹和采样永远没有。现在按解析结果记，失败计数照常退避。
                    let parsed = matches!(report.status, StreamStatus::Success);
                    db.record_workout_detail_fetch_result(&item.workout_id, &item.source, parsed)?;
                    reports.push(report);
                }
                Err(error) if error.is_cancelled() => return Err(error),
                Err(error) if error.needs_reauth() => return Err(error),
                Err(error) => {
                    tracing::warn!("拉取运动明细 {} 失败: {}", item.workout_id, error);
                    if let Ok(db) = self.write_db().await {
                        let _ = db.record_workout_detail_fetch_result(
                            &item.workout_id,
                            &item.source,
                            false,
                        );
                    }
                    last_error = Some(error);
                }
            }
        }
        // 截止时间打断这一轮不是整条流失败：剩下的留给下次。只有把这一批
        // 有限队列都试完、一条都没拿到，才把 last_error 抬上去。
        let error = if reports.is_empty() && attempted >= queue_len {
            last_error
        } else {
            None
        };
        pending_details_outcome(reports, error)
    }

    /// 没有待拉取的明细也要写 sync_state：否则上一轮残留的 failed 会一直挂着。
    /// `records_written` 沿用上次的计数，这条路径本身没有新写入。
    pub(super) async fn persist_empty_pending_details(&self) -> Result<StreamReport> {
        let previous = self.previous_records_written("workout_detail").await?;
        let still_pending = {
            let db = self.db.lock().await;
            !db.pending_running_details()?.is_empty()
        };
        let message = if still_pending {
            "待拉取的跑步明细将在下次同步继续"
        } else {
            "没有待拉取的跑步明细"
        };
        let report = StreamReport {
            stream: "workout_detail".into(),
            status: StreamStatus::Success,
            records_written: 0,
            raw_records: 0,
            capability: CapabilityStatus::Verified,
            needs_reauth: false,
            message: Some(message.into()),
        };
        let db = self.write_db().await?;
        db.update_sync_state_details(
            "workout_detail",
            None,
            status_name(&report.status),
            report.message.as_deref(),
            report.needs_reauth,
            previous,
            report.capability.clone(),
            report.message.clone(),
        )?;
        Ok(report)
    }

    pub(super) async fn persist_records(
        &self,
        stream: &str,
        records: Vec<FetchedRecord>,
    ) -> Result<StreamReport> {
        self.persist_records_with(stream, records, false).await
    }

    /// 只落数据、不写用户可见的逐流同步状态（历史补拉用，见 `Database::quiet_sync_state`）。
    pub(super) async fn persist_records_quietly(
        &self,
        stream: &str,
        records: Vec<FetchedRecord>,
    ) -> Result<StreamReport> {
        self.persist_records_with(stream, records, true).await
    }

    async fn persist_records_with(
        &self,
        stream: &str,
        records: Vec<FetchedRecord>,
        quiet: bool,
    ) -> Result<StreamReport> {
        let incomplete = records.iter().any(|record| record.incomplete);
        let reasons: std::collections::BTreeSet<_> = records
            .iter()
            .filter(|record| record.incomplete)
            .filter_map(|record| record.incomplete_reason.as_deref())
            .collect();
        let incomplete_message = if reasons.is_empty() {
            partial_window_reason().1
        } else {
            reasons.into_iter().collect::<Vec<_>>().join("; ")
        };
        // 一条流的全部报文在同一段写锁里落库：已经拿到手的数据，写起来是毫秒到
        // 秒级的事，没有理由让别的写者跟着等整个联网过程。
        let db = self.write_db().await?;
        let _quiet = quiet.then(|| db.quiet_sync_state());
        let mut reports = Vec::with_capacity(records.len());
        for record in records {
            reports.push(Self::persist_record(&db, record)?.report);
        }
        let incomplete = incomplete.then_some(incomplete_message);
        Self::finish_stream(&db, stream, &reports, incomplete)
    }

    /// 一条流的收尾：把逐条报告合成一条、记下阶段与同步状态。
    ///
    /// `incomplete` 带着原因时，整条流按未完成记：已经写进去的留着，但不能报成功。
    pub(super) fn finish_stream(
        db: &Database,
        stream: &str,
        reports: &[StreamReport],
        incomplete: Option<String>,
    ) -> Result<StreamReport> {
        let mut aggregate = aggregate_stream_reports(stream, reports);
        if let Some(incomplete_message) = incomplete {
            if aggregate.status != StreamStatus::Failed {
                aggregate.status = StreamStatus::Failed;
                aggregate.message = Some(incomplete_message.clone());
            }
            db.record_stream_stage(
                stream,
                Stage::Fetch,
                &StageOutcome::Failed {
                    kind: StageErrorKind::Unknown,
                    message: Some(incomplete_message),
                },
            )?;
        }
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

    pub(super) fn persist_record(db: &Database, record: FetchedRecord) -> Result<PersistResult> {
        let stream = record.raw.stream.clone();
        let capability = record.raw.capability.clone();
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
                // 拿到了报文但当前 normalizer 不认识它的结构。raw 已先落库，
                // 归一化失败不会删 raw；这是解析阶段的失败，不是网络失败。
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

    /// 时间预算用完、这一轮没来得及做的流。按失败记（这一流这次确实没更新，而且
    /// 下一次定时同步要因此照旧整窗），但码是 `err.core.timed_out` 而不是配置错误，
    /// 上次写入的条数照旧保留。
    pub(super) async fn timed_out_report(&self, stream: &str) -> Result<StreamReport> {
        self.failure_report(
            stream,
            &ZeppBridgeError::TimedOut("这一轮同步用完了时间，这条流下次接着做".into()),
        )
        .await
    }

    pub(super) async fn failure_report(
        &self,
        stream: &str,
        error: &ZeppBridgeError,
    ) -> Result<StreamReport> {
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
        let db = self.write_db().await?;
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

    pub(super) async fn heart_rate_fetch_error(
        &self,
        error: &ZeppBridgeError,
    ) -> Result<StreamReport> {
        // The independent HR endpoint can be absent while wellness supplies HR.
        // Keep that absence visible, but never turn network/auth failures neutral.
        if error.is_unavailable() {
            self.unavailable_report("heart_rate", error).await
        } else {
            self.failure_report("heart_rate", error).await
        }
    }

    pub(super) async fn unavailable_report(
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
        let db = self.write_db().await?;
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
    pub(super) async fn previous_records_written(&self, stream: &str) -> Result<i64> {
        let db = self.db.lock().await;
        Ok(db
            .get_sync_state(stream)?
            .map(|state| state.records_written)
            .unwrap_or(0))
    }
}
