//! 历史覆盖账本。
//!
//! 「请求过」和「拿到了」是两件事，「拿到了」和「写进去了」又是两件事。
//! 只记一个「已同步到 X 年 X 月」会让三种完全不同的状态长得一模一样：
//! 我们请求过但云端没返回、云端返回了但解析失败、以及确实写进了本机库。
//!
//! 账本按 (stream, 月份) 记录每一块的状态，于是：
//!
//! * 中断之后能从没做完的那一块继续，而不是从头再来；
//! * 重复执行不会重复写（块已经 `persisted` 就跳过）；
//! * 界面能分开显示「已请求」「已获取」「已写入」和「云端没有返回」；
//! * 只有账本和库里的事实都成立时，才敢说这段历史是完整的。

use super::Database;
use crate::models::error::Result;
use chrono::{DateTime, Datelike, NaiveDate, TimeZone, Utc};
use serde::{Deserialize, Serialize};

/// 一块的状态。字符串是契约，界面和 CLI 都按它分支。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ChunkStatus {
    /// 已排入计划，还没有请求过。
    Pending,
    /// 请求过、也写进了本机库。
    Persisted,
    /// 请求过，云端明确没有这段时间的数据。**这不是失败**，也不该重试。
    EmptyFromCloud,
    /// 请求或写入失败，可以重试。
    Failed,
}

impl ChunkStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            ChunkStatus::Pending => "pending",
            ChunkStatus::Persisted => "persisted",
            ChunkStatus::EmptyFromCloud => "empty_from_cloud",
            ChunkStatus::Failed => "failed",
        }
    }

    fn parse(value: &str) -> Self {
        match value {
            "persisted" => ChunkStatus::Persisted,
            "empty_from_cloud" => ChunkStatus::EmptyFromCloud,
            "failed" => ChunkStatus::Failed,
            _ => ChunkStatus::Pending,
        }
    }

    /// 还需要做吗。已写入和云端确认为空的块都不再重复请求。
    pub fn needs_work(self) -> bool {
        matches!(self, ChunkStatus::Pending | ChunkStatus::Failed)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CoverageChunk {
    pub stream: String,
    /// 这一块覆盖的月份，`YYYY-MM-01`。
    pub chunk_start: String,
    /// 不含。下一块的起点。
    pub chunk_end: String,
    pub status: String,
    pub requested_at: Option<String>,
    pub fetched_at: Option<String>,
    pub persisted_at: Option<String>,
    pub records: i64,
    pub error: Option<String>,
}

/// 一条流的覆盖汇总，给界面直接用。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct StreamCoverage {
    pub stream: String,
    pub requested_chunks: i64,
    pub persisted_chunks: i64,
    pub empty_chunks: i64,
    pub failed_chunks: i64,
    pub pending_chunks: i64,
    /// 实际写进本机库的最早 / 最晚月份。
    pub persisted_from: Option<String>,
    pub persisted_to: Option<String>,
    /// 请求过但云端没返回的月份，最多列 12 个。
    pub empty_months: Vec<String>,
    pub records: i64,
}

/// 整次补拉的账本视图。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CoverageLedger {
    /// 用户请求覆盖的范围。
    pub requested_from: Option<String>,
    pub requested_to: Option<String>,
    pub streams: Vec<StreamCoverage>,
    pub total_chunks: i64,
    pub completed_chunks: i64,
    /// 账本证明全部块都有结论（写入或云端确认为空）时才为真。
    /// README 里那句「完整副本」只有在这里为真时才允许出现。
    pub complete: bool,
}

/// 历史补拉覆盖哪些流。逐条明细（`workout_detail`）跟着运动摘要走，
/// 不单独排块。
pub const BACKFILL_STREAMS: [&str; 6] = [
    "heart_rate",
    "daily_summary",
    "workouts",
    "sleep",
    "hrv",
    "wellness",
];

/// 按自然月切块。
///
/// 选月份而不是固定天数，是因为 Zepp 的日度接口本来就以自然月对齐，
/// 而且「2026-03 这一块没拿到」比「第 47 块没拿到」更容易向用户解释。
pub fn month_chunks(from: NaiveDate, to: NaiveDate) -> Vec<(NaiveDate, NaiveDate)> {
    let mut chunks = Vec::new();
    if to < from {
        return chunks;
    }
    let mut cursor = NaiveDate::from_ymd_opt(from.year(), from.month(), 1).unwrap_or(from);
    let limit = next_month(NaiveDate::from_ymd_opt(to.year(), to.month(), 1).unwrap_or(to));
    while cursor < limit {
        let next = next_month(cursor);
        chunks.push((cursor, next));
        cursor = next;
    }
    chunks
}

fn next_month(date: NaiveDate) -> NaiveDate {
    if date.month() == 12 {
        NaiveDate::from_ymd_opt(date.year() + 1, 1, 1).unwrap_or(date)
    } else {
        NaiveDate::from_ymd_opt(date.year(), date.month() + 1, 1).unwrap_or(date)
    }
}

pub fn to_utc(date: NaiveDate) -> DateTime<Utc> {
    Utc.from_utc_datetime(&date.and_hms_opt(0, 0, 0).unwrap_or_default())
}

impl Database {
    /// 排入一次补拉计划。
    ///
    /// 已经有结论的块（已写入 / 云端确认为空）原样保留，所以重复请求同一段
    /// 历史不会把它们打回待办再拉一遍。
    pub fn plan_backfill(&self, from: NaiveDate, to: NaiveDate) -> Result<i64> {
        let now = Utc::now().to_rfc3339();
        let mut planned = 0i64;
        for stream in BACKFILL_STREAMS {
            for (start, end) in month_chunks(from, to) {
                let changed = self.conn.execute(
                    "INSERT INTO coverage_ledger
                        (stream, chunk_start, chunk_end, status, requested_at, records, updated_at)
                     VALUES(?1, ?2, ?3, 'pending', ?4, 0, ?4)
                     ON CONFLICT(stream, chunk_start) DO NOTHING",
                    rusqlite::params![stream, start.to_string(), end.to_string(), now],
                )?;
                planned += changed as i64;
            }
        }
        Ok(planned)
    }

    /// 还需要处理的块，按时间从新到旧。
    ///
    /// 从最近的月份开始做：补拉随时可能被取消，先拿回来的应该是用户最可能
    /// 立刻要看的那几个月。
    pub fn pending_backfill_chunks(&self, limit: usize) -> Result<Vec<CoverageChunk>> {
        let mut stmt = self.conn.prepare(
            "SELECT stream, chunk_start, chunk_end, status, requested_at, fetched_at,
                    persisted_at, records, error
             FROM coverage_ledger
             WHERE status IN ('pending', 'failed')
             ORDER BY chunk_start DESC, stream ASC
             LIMIT ?1",
        )?;
        let rows = stmt.query_map([limit as i64], map_chunk)?;
        rows.collect::<std::result::Result<Vec<_>, _>>()
            .map_err(Into::into)
    }

    /// 记录一块的结果。
    pub fn record_backfill_chunk(
        &self,
        stream: &str,
        chunk_start: &str,
        status: ChunkStatus,
        records: i64,
        error: Option<&str>,
    ) -> Result<()> {
        let now = Utc::now().to_rfc3339();
        let fetched_at = matches!(status, ChunkStatus::Persisted | ChunkStatus::EmptyFromCloud)
            .then(|| now.clone());
        let persisted_at = (status == ChunkStatus::Persisted).then(|| now.clone());
        self.conn.execute(
            "UPDATE coverage_ledger
                SET status = ?3,
                    records = ?4,
                    error = ?5,
                    fetched_at = COALESCE(?6, fetched_at),
                    persisted_at = COALESCE(?7, persisted_at),
                    updated_at = ?8
              WHERE stream = ?1 AND chunk_start = ?2",
            rusqlite::params![
                stream,
                chunk_start,
                status.as_str(),
                records,
                error,
                fetched_at,
                persisted_at,
                now
            ],
        )?;
        Ok(())
    }

    /// 账本汇总。
    pub fn coverage_ledger(&self) -> Result<CoverageLedger> {
        let mut stmt = self.conn.prepare(
            "SELECT stream, chunk_start, chunk_end, status, requested_at, fetched_at,
                    persisted_at, records, error
             FROM coverage_ledger
             ORDER BY stream ASC, chunk_start ASC",
        )?;
        let rows = stmt.query_map([], map_chunk)?;
        let mut by_stream: std::collections::BTreeMap<String, Vec<CoverageChunk>> =
            std::collections::BTreeMap::new();
        for row in rows {
            let chunk = row?;
            by_stream
                .entry(chunk.stream.clone())
                .or_default()
                .push(chunk);
        }

        let mut streams = Vec::new();
        let mut total = 0i64;
        let mut completed = 0i64;
        let mut requested_from: Option<String> = None;
        let mut requested_to: Option<String> = None;

        for (stream, chunks) in by_stream {
            let mut coverage = StreamCoverage {
                stream,
                requested_chunks: chunks.len() as i64,
                persisted_chunks: 0,
                empty_chunks: 0,
                failed_chunks: 0,
                pending_chunks: 0,
                persisted_from: None,
                persisted_to: None,
                empty_months: Vec::new(),
                records: 0,
            };
            for chunk in &chunks {
                total += 1;
                requested_from = min_option(requested_from.take(), Some(chunk.chunk_start.clone()));
                requested_to = max_option(requested_to.take(), Some(chunk.chunk_end.clone()));
                match ChunkStatus::parse(&chunk.status) {
                    ChunkStatus::Persisted => {
                        completed += 1;
                        coverage.persisted_chunks += 1;
                        coverage.records += chunk.records;
                        coverage.persisted_from = min_option(
                            coverage.persisted_from.take(),
                            Some(chunk.chunk_start.clone()),
                        );
                        coverage.persisted_to = max_option(
                            coverage.persisted_to.take(),
                            Some(chunk.chunk_start.clone()),
                        );
                    }
                    ChunkStatus::EmptyFromCloud => {
                        completed += 1;
                        coverage.empty_chunks += 1;
                        if coverage.empty_months.len() < 12 {
                            coverage.empty_months.push(chunk.chunk_start.clone());
                        }
                    }
                    ChunkStatus::Failed => coverage.failed_chunks += 1,
                    ChunkStatus::Pending => coverage.pending_chunks += 1,
                }
            }
            streams.push(coverage);
        }

        Ok(CoverageLedger {
            requested_from,
            requested_to,
            streams,
            total_chunks: total,
            completed_chunks: completed,
            // 只有每一块都有结论时才算完整。一块都没排过也不算完整 ——
            // 「什么都没做」不是「已经做完」。
            complete: total > 0 && completed == total,
        })
    }

    /// 清掉整个账本。用户改主意重新规划一次完整补拉时用。
    pub fn reset_coverage_ledger(&self) -> Result<()> {
        self.conn.execute("DELETE FROM coverage_ledger", [])?;
        Ok(())
    }
}

fn map_chunk(row: &rusqlite::Row<'_>) -> rusqlite::Result<CoverageChunk> {
    Ok(CoverageChunk {
        stream: row.get(0)?,
        chunk_start: row.get(1)?,
        chunk_end: row.get(2)?,
        status: row.get(3)?,
        requested_at: row.get(4)?,
        fetched_at: row.get(5)?,
        persisted_at: row.get(6)?,
        records: row.get(7)?,
        error: row.get(8)?,
    })
}

fn min_option(current: Option<String>, candidate: Option<String>) -> Option<String> {
    match (current, candidate) {
        (Some(a), Some(b)) => Some(if a <= b { a } else { b }),
        (Some(a), None) => Some(a),
        (None, b) => b,
    }
}

fn max_option(current: Option<String>, candidate: Option<String>) -> Option<String> {
    match (current, candidate) {
        (Some(a), Some(b)) => Some(if a >= b { a } else { b }),
        (Some(a), None) => Some(a),
        (None, b) => b,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn db() -> Database {
        Database::in_memory().unwrap()
    }

    fn date(text: &str) -> NaiveDate {
        NaiveDate::parse_from_str(text, "%Y-%m-%d").unwrap()
    }

    #[test]
    fn chunks_align_to_calendar_months_and_cover_both_ends() {
        let chunks = month_chunks(date("2026-01-15"), date("2026-03-02"));
        assert_eq!(chunks.len(), 3, "1 月、2 月、3 月各一块");
        assert_eq!(chunks[0].0, date("2026-01-01"));
        assert_eq!(chunks[2].1, date("2026-04-01"));

        // 跨年不能算错。
        let across = month_chunks(date("2025-12-20"), date("2026-01-05"));
        assert_eq!(across.len(), 2);
        assert_eq!(across[1].0, date("2026-01-01"));

        // 反向区间不产生任何块，而不是产生一个空块。
        assert!(month_chunks(date("2026-03-01"), date("2026-01-01")).is_empty());
    }

    #[test]
    fn planning_the_same_range_twice_does_not_reopen_finished_chunks() {
        let db = db();
        let planned = db
            .plan_backfill(date("2026-01-01"), date("2026-02-28"))
            .unwrap();
        assert_eq!(planned, (BACKFILL_STREAMS.len() * 2) as i64);

        db.record_backfill_chunk("sleep", "2026-01-01", ChunkStatus::Persisted, 31, None)
            .unwrap();

        // 再排一次同样的范围：已完成的块不该被打回待办。
        let replanned = db
            .plan_backfill(date("2026-01-01"), date("2026-02-28"))
            .unwrap();
        assert_eq!(replanned, 0, "重复排计划不该新增任何块");

        let ledger = db.coverage_ledger().unwrap();
        let sleep = ledger
            .streams
            .iter()
            .find(|stream| stream.stream == "sleep")
            .unwrap();
        assert_eq!(sleep.persisted_chunks, 1);
        assert_eq!(sleep.records, 31);
    }

    #[test]
    fn a_month_the_cloud_had_nothing_for_is_not_a_failure_and_is_not_retried() {
        let db = db();
        db.plan_backfill(date("2026-01-01"), date("2026-01-31"))
            .unwrap();
        db.record_backfill_chunk("hrv", "2026-01-01", ChunkStatus::EmptyFromCloud, 0, None)
            .unwrap();

        let pending = db.pending_backfill_chunks(100).unwrap();
        assert!(
            !pending
                .iter()
                .any(|chunk| chunk.stream == "hrv" && chunk.chunk_start == "2026-01-01"),
            "云端确认为空的块不该被反复重试"
        );

        let ledger = db.coverage_ledger().unwrap();
        let hrv = ledger
            .streams
            .iter()
            .find(|stream| stream.stream == "hrv")
            .unwrap();
        assert_eq!(hrv.empty_chunks, 1);
        assert_eq!(hrv.failed_chunks, 0, "没有数据不是失败");
        assert_eq!(hrv.empty_months, vec!["2026-01-01"]);
    }

    #[test]
    fn a_failed_chunk_stays_retryable_and_keeps_its_reason() {
        let db = db();
        db.plan_backfill(date("2026-01-01"), date("2026-01-31"))
            .unwrap();
        db.record_backfill_chunk(
            "workouts",
            "2026-01-01",
            ChunkStatus::Failed,
            0,
            Some("网络超时"),
        )
        .unwrap();

        let pending = db.pending_backfill_chunks(100).unwrap();
        let failed = pending
            .iter()
            .find(|chunk| chunk.stream == "workouts")
            .expect("失败的块应当还在待办里");
        assert_eq!(failed.error.as_deref(), Some("网络超时"));

        // 重试成功之后错误要被清掉，不能一直挂着。
        db.record_backfill_chunk("workouts", "2026-01-01", ChunkStatus::Persisted, 5, None)
            .unwrap();
        let ledger = db.coverage_ledger().unwrap();
        let workouts = ledger
            .streams
            .iter()
            .find(|stream| stream.stream == "workouts")
            .unwrap();
        assert_eq!(workouts.failed_chunks, 0);
        assert_eq!(workouts.persisted_chunks, 1);
    }

    #[test]
    fn the_ledger_only_calls_itself_complete_when_every_chunk_has_an_answer() {
        let db = db();
        assert!(
            !db.coverage_ledger().unwrap().complete,
            "什么都没做不等于做完了"
        );

        db.plan_backfill(date("2026-01-01"), date("2026-01-31"))
            .unwrap();
        assert!(!db.coverage_ledger().unwrap().complete);

        for stream in BACKFILL_STREAMS {
            db.record_backfill_chunk(stream, "2026-01-01", ChunkStatus::Persisted, 1, None)
                .unwrap();
        }
        let ledger = db.coverage_ledger().unwrap();
        assert!(ledger.complete);
        assert_eq!(ledger.completed_chunks, ledger.total_chunks);
        assert_eq!(ledger.requested_from.as_deref(), Some("2026-01-01"));
    }

    #[test]
    fn pending_chunks_come_back_newest_first() {
        let db = db();
        db.plan_backfill(date("2026-01-01"), date("2026-03-31"))
            .unwrap();
        let pending = db.pending_backfill_chunks(3).unwrap();
        assert_eq!(pending.len(), 3);
        assert!(
            pending
                .iter()
                .all(|chunk| chunk.chunk_start == "2026-03-01"),
            "补拉随时可能被取消，最近的月份要先拿回来"
        );
    }
}
