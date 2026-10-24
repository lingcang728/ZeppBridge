use super::*;
use crate::storage::detail_queue::DetailCoverage;

pub(super) fn detail_failure_status(error: &ZeppBridgeError) -> &'static str {
    if error.is_unavailable() {
        "empty_from_cloud"
    } else if matches!(error, ZeppBridgeError::ParseError(_)) {
        "parse_failed"
    } else {
        "request_failed"
    }
}

impl SyncManager {
    /// Explicit bounded task. Normal sync is not expanded into an unbounded backfill.
    pub async fn history_detail_backfill<F>(
        &self,
        limit: usize,
        retry_failed: bool,
        on_progress: F,
    ) -> Result<DetailCoverage>
    where
        F: Fn(SyncProgress) + Send + Sync,
    {
        let _run = self
            .run_lock
            .try_lock()
            .map_err(|_| ZeppBridgeError::Busy("另一个同步任务正在进行".into()))?;
        self.cancel.store(false, Ordering::SeqCst);
        self.stand_aside_if_local_maintenance()?;
        let _lease = self.begin_run(WritePurpose::HistoryBackfill).await?;
        if retry_failed {
            self.write_db()
                .await?
                .retry_failed_history_details_for_channel(false)?;
        }
        let queue = self.db.lock().await.pending_history_details(limit, false)?;
        let total = queue.len() as u32;
        for (index, item) in queue.into_iter().enumerate() {
            if self.cancel.load(Ordering::SeqCst) {
                break;
            }
            // Recheck visibility/success between requests; another writer may have changed it.
            if !self
                .db
                .lock()
                .await
                .workout_detail_request_ready(&item.workout_id)?
            {
                continue;
            }
            on_progress(SyncProgress {
                completed: false,
                stream: "workout_detail".into(),
                current: index as u32,
                total,
                message: String::new(),
                code: "backfilling".into(),
                detail: None,
            });
            let response = self
                .fetcher
                .fetch_sport_detail_record(&item.workout_id, &item.source, Utc::now(), None)
                .await;
            let db = self.write_db().await?;
            match response {
                Ok(record) => {
                    let empty = crate::normalizer::payload_is_explicitly_empty(&record.raw.payload);
                    let report = Self::persist_record(&db, record)?.report;
                    let status = if empty {
                        "empty_from_cloud"
                    } else if report.status == StreamStatus::Success {
                        "persisted"
                    } else {
                        "parse_failed"
                    };
                    db.record_detail_request(&item.workout_id, status, None)?;
                    db.record_workout_detail_fetch_result(
                        &item.workout_id,
                        &item.source,
                        status == "persisted",
                    )?;
                }
                Err(error) if error.is_cancelled() => break,
                Err(error) => {
                    db.record_detail_request(
                        &item.workout_id,
                        detail_failure_status(&error),
                        Some(error.code()),
                    )?;
                    if error.needs_reauth() {
                        return Err(error);
                    }
                }
            }
            drop(db);
            on_progress(SyncProgress {
                completed: true,
                stream: "workout_detail".into(),
                current: index as u32 + 1,
                total,
                message: String::new(),
                code: "stream_completed".into(),
                detail: None,
            });
        }
        self.db
            .lock()
            .await
            .workout_detail_coverage_for_channel(Some(false))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn detail_backfill_rejects_an_active_run_without_resetting_its_cancel_flag() {
        let connector = crate::connectors::ZeppConnector::new(AuthInfo {
            app_token: "test-token".into(),
            user_id: "user-1".into(),
            region_host: "https://api-mifit.zepp.com".into(),
        })
        .unwrap();
        let manager = SyncManager::new(
            DataFetcher::new(connector),
            Database::in_memory().unwrap(),
            Arc::new(AtomicBool::new(true)),
        );
        let _active = manager.run_lock.lock().await;
        assert!(manager
            .history_detail_backfill(20, false, |_| {})
            .await
            .unwrap_err()
            .is_busy());
        assert!(manager.cancel.load(Ordering::SeqCst));
    }

    #[test]
    fn detail_response_parse_errors_are_distinct_from_request_errors() {
        assert_eq!(
            detail_failure_status(&ZeppBridgeError::ParseError("invalid json".into())),
            "parse_failed"
        );
        assert_eq!(
            detail_failure_status(&ZeppBridgeError::Unavailable("no details".into())),
            "empty_from_cloud"
        );
        assert_eq!(
            detail_failure_status(&ZeppBridgeError::HttpStatus {
                status: 500,
                message: "retry".into()
            }),
            "request_failed"
        );
    }
}
