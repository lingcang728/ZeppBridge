//! Persistent detail coverage, independent of summary coverage and sample counts.
use super::*;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DetailQueueItem {
    pub workout_id: String,
    pub source: String,
    pub start_time: String,
    pub status: String,
    pub attempts: i64,
    pub retry_after: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::Workout;

    fn workout(db: &Database, id: &str, official: bool) {
        db.insert_workout(&Workout {
            workout_id: id.into(),
            start_time: Utc::now(),
            end_time: Utc::now(),
            zepp_source: Some("run.huami.com".into()),
            ..Default::default()
        })
        .unwrap();
        if official {
            db.conn
                .execute(
                    "UPDATE workouts SET provider = 'official' WHERE workout_id = ?1",
                    [id],
                )
                .unwrap();
        }
    }

    #[test]
    fn detail_queue_channels_are_disjoint_and_batches_are_bounded() {
        let db = Database::in_memory().unwrap();
        for index in 0..45 {
            workout(&db, &format!("advanced-{index}"), false);
        }
        workout(&db, "official", true);
        assert_eq!(db.pending_history_details(1000, false).unwrap().len(), 40);
        assert_eq!(
            db.workout_detail_coverage_for_channel(Some(false))
                .unwrap()
                .ready,
            45
        );
        let official = db.pending_history_details(20, true).unwrap();
        assert_eq!(official.len(), 1);
        assert_eq!(official[0].workout_id, "official");
        assert_eq!(
            official[0].source, "official",
            "provider wins over a cloud source field"
        );
    }

    #[test]
    fn detail_queue_terminal_outcomes_do_not_require_hr_or_gps_samples() {
        let db = Database::in_memory().unwrap();
        workout(&db, "zero-samples", false);
        workout(&db, "empty", false);
        db.record_detail_request("zero-samples", "persisted", None)
            .unwrap();
        db.record_detail_request("empty", "empty_from_cloud", None)
            .unwrap();
        db.retry_failed_history_details_for_channel(false).unwrap();
        let coverage = db.workout_detail_coverage().unwrap();
        assert_eq!(coverage.persisted, 1);
        assert_eq!(coverage.empty_from_cloud, 1);
        assert_eq!(coverage.ready, 0);
        assert!(db.pending_history_details(40, false).unwrap().is_empty());
    }

    #[test]
    fn detail_queue_failures_back_off_and_retry_is_scoped_to_one_channel() {
        let db = Database::in_memory().unwrap();
        workout(&db, "advanced", false);
        workout(&db, "official", true);
        for _ in 0..MAX_WORKOUT_DETAIL_ATTEMPTS {
            db.record_detail_request("advanced", "parse_failed", Some("parse"))
                .unwrap();
            db.record_detail_request("official", "request_failed", Some("network"))
                .unwrap();
        }
        assert_eq!(db.workout_detail_coverage().unwrap().ready, 0);
        db.retry_failed_history_details_for_channel(false).unwrap();
        assert_eq!(db.pending_history_details(40, false).unwrap().len(), 1);
        assert!(db.pending_history_details(40, true).unwrap().is_empty());
        db.conn.execute("UPDATE workout_detail_requests SET retry_after = '2000-01-01T00:00:00+00:00' WHERE workout_id = 'official'", []).unwrap();
        assert_eq!(db.pending_history_details(40, true).unwrap().len(), 1);
        db.record_detail_request("official", "request_failed", None)
            .unwrap();
        assert_eq!(db.pending_history_details(40, true).unwrap()[0].attempts, 1);
    }

    #[test]
    fn detail_queue_resumes_after_reopening_a_temporary_library() {
        let dir = std::env::temp_dir().join(format!(
            "zeppbridge-detail-queue-{}-{}",
            std::process::id(),
            crate::unique_suffix()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("zepp.db");
        {
            let db = Database::open_migrated(&path).unwrap();
            workout(&db, "complete", false);
            workout(&db, "remaining", false);
            db.record_detail_request("complete", "persisted", None)
                .unwrap();
            db.record_detail_request("remaining", "request_failed", None)
                .unwrap();
        }
        let db = Database::open_migrated(&path).unwrap();
        let queue = db.pending_history_details(40, false).unwrap();
        assert_eq!(queue.len(), 1);
        assert_eq!(queue[0].workout_id, "remaining");
        assert_eq!(queue[0].attempts, 1);
        assert_eq!(db.workout_detail_coverage().unwrap().persisted, 1);
        drop(db);
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn detail_queue_preserves_existing_failure_backoff_on_upgrade() {
        let db = Database::in_memory().unwrap();
        workout(&db, "old-failure", false);
        for _ in 0..MAX_WORKOUT_DETAIL_ATTEMPTS {
            db.record_workout_detail_fetch_result("old-failure", "run.huami.com", false)
                .unwrap();
        }
        let coverage = db.workout_detail_coverage().unwrap();
        assert_eq!(coverage.request_failed, 1);
        assert_eq!(coverage.ready, 0);
        db.retry_failed_history_details_for_channel(false).unwrap();
        assert_eq!(db.pending_history_details(40, false).unwrap().len(), 1);
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct DetailCoverage {
    pub pending: i64,
    pub persisted: i64,
    pub empty_from_cloud: i64,
    pub request_failed: i64,
    pub parse_failed: i64,
    pub unavailable: i64,
    pub ready: i64,
}

impl Database {
    fn detail_queue_rows(&self) -> Result<Vec<DetailQueueItem>> {
        self.detail_queue_rows_for_id(None)
    }

    fn detail_queue_rows_for_id(&self, id: Option<&str>) -> Result<Vec<DetailQueueItem>> {
        let mut statement = self.conn.prepare(
            "SELECT w.workout_id,
                CASE WHEN w.provider = 'official' THEN 'official'
                     WHEN NULLIF(TRIM(w.zepp_source), '') IS NOT NULL THEN w.zepp_source ELSE '' END,
                w.start_time,
                CASE
                  WHEN d.status = 'empty_from_cloud' THEN 'empty_from_cloud'
                  WHEN EXISTS(SELECT 1 FROM raw_records r JOIN raw_normalization n ON n.raw_record_id = r.id
                    WHERE r.stream = 'workout_detail' AND NOT EXISTS(SELECT 1 FROM raw_quarantine q WHERE q.raw_record_id = r.id)
                      AND (r.source_key = 'workout_detail:' || w.workout_id || ':' || w.zepp_source
                           OR r.source_key = 'official:sport_detail:' || w.workout_id)) THEN 'persisted'
                  WHEN EXISTS(SELECT 1 FROM raw_records r JOIN raw_quarantine q ON q.raw_record_id = r.id
                    WHERE r.stream = 'workout_detail' AND (r.source_key = 'workout_detail:' || w.workout_id || ':' || w.zepp_source
                           OR r.source_key = 'official:sport_detail:' || w.workout_id)) THEN 'parse_failed'
                  WHEN d.status IS NOT NULL THEN d.status
                  WHEN COALESCE(a.attempts, 0) > 0 THEN 'request_failed'
                  ELSE 'pending' END,
                COALESCE(d.attempts, a.attempts, 0),
                COALESCE(d.retry_after, CASE WHEN d.status IS NULL THEN strftime('%Y-%m-%dT%H:%M:%f+00:00', a.updated_at, '+7 days') END)
             FROM workouts_visible w LEFT JOIN workout_detail_requests d ON d.workout_id = w.workout_id
             LEFT JOIN workout_detail_fetch_attempts a ON a.workout_id = w.workout_id
                AND a.source = CASE WHEN w.provider = 'official' THEN 'official' ELSE w.zepp_source END
             WHERE (?1 IS NULL OR w.workout_id = ?1)
               -- 导入的运动没有云端明细可拉。
               AND NOT EXISTS(SELECT 1 FROM workout_imports i WHERE i.workout_id = w.workout_id)
             ORDER BY COALESCE(d.attempts, a.attempts, 0), w.start_time DESC",
        )?;
        let rows = statement.query_map([id], |r| {
            Ok(DetailQueueItem {
                workout_id: r.get(0)?,
                source: r.get(1)?,
                start_time: r.get(2)?,
                status: r.get(3)?,
                attempts: r.get(4)?,
                retry_after: r.get(5)?,
            })
        })?;
        Ok(rows.collect::<rusqlite::Result<_>>()?)
    }

    pub fn workout_detail_coverage(&self) -> Result<DetailCoverage> {
        self.workout_detail_coverage_for_channel(None)
    }

    pub fn workout_detail_coverage_for_channel(
        &self,
        official: Option<bool>,
    ) -> Result<DetailCoverage> {
        let now = Utc::now().to_rfc3339();
        let mut result = DetailCoverage::default();
        for item in self.detail_queue_rows()? {
            if official.is_some_and(|channel| (item.source == "official") != channel) {
                continue;
            }
            if item.source.is_empty() {
                result.unavailable += 1;
                continue;
            }
            match item.status.as_str() {
                "persisted" => result.persisted += 1,
                "empty_from_cloud" => result.empty_from_cloud += 1,
                "request_failed" => result.request_failed += 1,
                "parse_failed" => result.parse_failed += 1,
                _ => result.pending += 1,
            }
            if Self::detail_ready(&item, &now) {
                result.ready += 1;
            }
        }
        Ok(result)
    }

    /// Shared with normal sync: explicit terminal outcomes do not depend on samples.
    pub fn workout_detail_request_ready(&self, id: &str) -> Result<bool> {
        let now = Utc::now().to_rfc3339();
        Ok(self
            .detail_queue_rows_for_id(Some(id))?
            .iter()
            .any(|item| Self::detail_ready(item, &now)))
    }

    fn detail_ready(item: &DetailQueueItem, now: &str) -> bool {
        !item.source.is_empty()
            && !matches!(item.status.as_str(), "persisted" | "empty_from_cloud")
            && (item.attempts < MAX_WORKOUT_DETAIL_ATTEMPTS
                || item.retry_after.as_deref().is_some_and(|at| at <= now))
    }

    pub fn pending_history_details(
        &self,
        limit: usize,
        official: bool,
    ) -> Result<Vec<DetailQueueItem>> {
        let now = Utc::now().to_rfc3339();
        Ok(self
            .detail_queue_rows()?
            .into_iter()
            .filter(|item| {
                (item.source == "official") == official && Self::detail_ready(item, &now)
            })
            .take(limit.clamp(1, 40))
            .collect())
    }

    pub fn record_detail_request(&self, id: &str, status: &str, code: Option<&str>) -> Result<()> {
        let failed = matches!(status, "request_failed" | "parse_failed");
        let now = Utc::now();
        self.conn.execute(
            "INSERT INTO workout_detail_requests(workout_id, status, attempts, requested_at, retry_after, error_code)
             VALUES(?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT(workout_id) DO UPDATE SET status = excluded.status,
                attempts = CASE WHEN ?3 = 0 THEN 0 WHEN workout_detail_requests.retry_after <= ?4 THEN 1 ELSE workout_detail_requests.attempts + 1 END,
                requested_at = excluded.requested_at, retry_after = excluded.retry_after, error_code = excluded.error_code",
            params![id, status, i64::from(failed), now.to_rfc3339(), (now + WORKOUT_DETAIL_ATTEMPT_DECAY).to_rfc3339(), code],
        )?;
        Ok(())
    }

    pub fn retry_failed_history_details(&self) -> Result<()> {
        self.conn.execute("UPDATE workout_detail_requests SET attempts = 0, retry_after = NULL WHERE status IN ('request_failed', 'parse_failed')", [])?;
        self.conn
            .execute("DELETE FROM workout_detail_fetch_attempts", [])?;
        Ok(())
    }

    pub fn retry_failed_history_details_for_channel(&self, official: bool) -> Result<()> {
        let ids = self
            .detail_queue_rows()?
            .into_iter()
            .filter(|item| {
                (item.source == "official") == official
                    && matches!(item.status.as_str(), "request_failed" | "parse_failed")
            })
            .map(|item| item.workout_id)
            .collect::<Vec<_>>();
        for id in ids {
            self.conn.execute("UPDATE workout_detail_requests SET attempts = 0, retry_after = NULL WHERE workout_id = ?1", [&id])?;
            self.conn.execute(
                "DELETE FROM workout_detail_fetch_attempts WHERE workout_id = ?1",
                [&id],
            )?;
        }
        Ok(())
    }
}
