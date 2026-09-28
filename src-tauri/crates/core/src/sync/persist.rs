//! 运动详情队列与抓到的记录落库、失败与不可用的报告（从 sync/mod.rs 拆出，逻辑不变）。

use super::*;

impl SyncManager {
    pub(super) async fn fetch_pending_running_details(
        &self,
        deadline: Instant,
    ) -> Result<Vec<FetchedRecord>> {
        let pending = {
            let db = self.db.lock().await;
            db.pending_running_details()?
        };
        let queue_len = pending.len();
        let mut records = Vec::new();
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
                    {
                        let db = self.write_db().await?;
                        db.record_workout_detail_fetch_result(
                            &item.workout_id,
                            &item.source,
                            true,
                        )?;
                    }
                    records.push(record);
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
        let error = if records.is_empty() && attempted >= queue_len {
            last_error
        } else {
            None
        };
        pending_details_outcome(records, error)
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
        let mut reports = Vec::with_capacity(records.len());
        for record in records {
            reports.push(Self::persist_record(&db, record)?.report);
        }
        let mut aggregate = aggregate_stream_reports(stream, &reports);
        if incomplete && aggregate.status != StreamStatus::Failed {
            aggregate.status = StreamStatus::Failed;
            aggregate.message = Some(incomplete_message.clone());
        }
        if incomplete {
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
