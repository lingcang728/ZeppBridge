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
    /// 窗口里有一部分写入了，但整块还不完整（子切片 404、解析失败等）。
    ///
    /// 已经进库的数据留着；`needs_work()` 为真，不能算「完整本地副本」。
    Partial,
    /// 请求或写入失败，可以重试。
    Failed,
}

impl ChunkStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            ChunkStatus::Pending => "pending",
            ChunkStatus::Persisted => "persisted",
            ChunkStatus::EmptyFromCloud => "empty_from_cloud",
            ChunkStatus::Partial => "partial",
            ChunkStatus::Failed => "failed",
        }
    }

    fn parse(value: &str) -> Self {
        match value {
            "persisted" => ChunkStatus::Persisted,
            "empty_from_cloud" => ChunkStatus::EmptyFromCloud,
            "partial" => ChunkStatus::Partial,
            "failed" => ChunkStatus::Failed,
            _ => ChunkStatus::Pending,
        }
    }

    /// 还需要做吗。已写入和云端确认为空的块都不再重复请求。
    /// 部分写入不是完整结论，必须再拉。
    pub fn needs_work(self) -> bool {
        matches!(
            self,
            ChunkStatus::Pending | ChunkStatus::Failed | ChunkStatus::Partial
        )
    }
}

/// 一块自动重试多少次之后就停下来等用户。
///
/// 瞬时故障（网络抖动、限流）通常一两次就过去了；到第三次还不行的，多半是
/// 这一块本身有问题，继续自动重试只会空转并挡住后面的块。
pub const MAX_AUTO_ATTEMPTS: i64 = 3;

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
    /// 已经尝试过多少次。只有失败会累加。
    pub attempts: i64,
}

/// 一个失败块的对外明细。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FailedChunk {
    pub stream: String,
    /// `YYYY-MM-01`。界面只显示到月。
    pub chunk_start: String,
    /// 已脱敏的失败原因（中文原文）。界面优先用 `error_code`，取不到才显示它。
    pub error: Option<String>,
    /// 失败原因的稳定码。旧库里的行没有，为空。
    pub error_code: Option<String>,
    pub attempts: i64,
    /// 自动重试次数已用尽，要用户显式重试才会再动。
    pub exhausted: bool,
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
    /// 每一个失败块的月份和原因。界面靠它显示「哪个月、为什么」，
    /// 而不是只说一句「失败 N 块」。
    pub failed_chunks_detail: Vec<FailedChunk>,
    /// 还有失败块的自动重试次数已用尽，需要用户显式重试。
    pub needs_manual_retry: bool,
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
    ///
    /// 已经自动重试到 [`MAX_AUTO_ATTEMPTS`] 次的失败块**不再返回**。否则一个
    /// 永远修不好的块（比如报文拿得到但一条 canonical 都解析不出来）会一直
    /// 排在队首，把后面所有块挡住。它们仍留在账本里、仍算未完成，只是要等
    /// 用户按「重试失败项」显式放行。
    pub fn pending_backfill_chunks(&self, limit: usize) -> Result<Vec<CoverageChunk>> {
        let mut stmt = self.conn.prepare(
            "SELECT stream, chunk_start, chunk_end, status, requested_at, fetched_at,
                    persisted_at, records, error, attempts
             FROM coverage_ledger
             WHERE status = 'pending'
                OR (status IN ('failed', 'partial') AND attempts < ?2)
             ORDER BY chunk_start DESC, stream ASC
             LIMIT ?1",
        )?;
        let rows = stmt.query_map(
            rusqlite::params![limit as i64, MAX_AUTO_ATTEMPTS],
            map_chunk,
        )?;
        rows.collect::<std::result::Result<Vec<_>, _>>()
            .map_err(Into::into)
    }

    /// 失败块的明细，给界面直接显示「哪个月、为什么」。
    ///
    /// 错误原文早就存在库里了，只是从来没往上带，于是界面只能显示「失败 N 块」
    /// ——用户既不知道是哪个月，也不知道该不该重试。
    pub fn failed_backfill_chunks(&self) -> Result<Vec<FailedChunk>> {
        let mut stmt = self.conn.prepare(
            "SELECT stream, chunk_start, error, attempts, error_code
             FROM coverage_ledger
             WHERE status IN ('failed', 'partial')
             ORDER BY chunk_start DESC, stream ASC",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(FailedChunk {
                stream: row.get(0)?,
                chunk_start: row.get(1)?,
                error: row.get::<_, Option<String>>(2)?,
                error_code: row.get::<_, Option<String>>(4)?,
                attempts: row.get(3)?,
                exhausted: row.get::<_, i64>(3)? >= MAX_AUTO_ATTEMPTS,
            })
        })?;
        rows.collect::<std::result::Result<Vec<_>, _>>()
            .map_err(Into::into)
    }

    /// 把失败块的尝试次数清零，让它们重新进入自动补拉队列。
    ///
    /// 只碰 `failed` / `partial`：已写入和云端确认为空的块不该被这个动作
    /// 打回重来，否则「重试失败项」就变成了偷偷的「重拉一切」。
    pub fn reset_failed_backfill_chunks(&self) -> Result<usize> {
        let changed = self.conn.execute(
            "UPDATE coverage_ledger
                SET attempts = 0, updated_at = ?1
              WHERE status IN ('failed', 'partial')",
            [Utc::now().to_rfc3339()],
        )?;
        Ok(changed)
    }

    /// 记录一块的结果。
    ///
    /// 失败会累加 `attempts`，成功（写入或云端确认为空）把它清零——一块曾经
    /// 因为网络抖动失败过，不该在它后来成功之后还留着历史包袱。
    pub fn record_backfill_chunk(
        &self,
        stream: &str,
        chunk_start: &str,
        status: ChunkStatus,
        records: i64,
        error: Option<&str>,
        error_code: Option<&str>,
    ) -> Result<()> {
        let now = Utc::now().to_rfc3339();
        let fetched_at = matches!(
            status,
            ChunkStatus::Persisted | ChunkStatus::EmptyFromCloud | ChunkStatus::Partial
        )
        .then(|| now.clone());
        let is_persisted = status == ChunkStatus::Persisted;
        let retryable = matches!(status, ChunkStatus::Failed | ChunkStatus::Partial);
        self.conn.execute(
            // records 只能往上走：一个块可能先 Partial(12) 再重试整段失败
            // (0)，重试没写进任何新数据不代表那 12 条凭空消失了——它们仍在
            // 通过自然键 upsert 落库的表里，账本不该把它们的计数抹掉。
            "UPDATE coverage_ledger
                SET status = ?3,
                    records = MAX(records, ?4),
                    error = ?5,
                    fetched_at = COALESCE(?6, fetched_at),
                    persisted_at = CASE
                        WHEN ?8 THEN ?7
                        WHEN ?9 THEN NULL
                        ELSE persisted_at
                    END,
                    error_code = ?10,
                    attempts = CASE WHEN ?9 THEN attempts + 1 ELSE 0 END,
                    last_attempt_at = ?7,
                    updated_at = ?7
              WHERE stream = ?1 AND chunk_start = ?2",
            rusqlite::params![
                stream,
                chunk_start,
                status.as_str(),
                records,
                error,
                fetched_at,
                now,
                is_persisted,
                retryable,
                error_code
            ],
        )?;
        Ok(())
    }

    /// 账本汇总。
    pub fn coverage_ledger(&self) -> Result<CoverageLedger> {
        let mut stmt = self.conn.prepare(
            "SELECT stream, chunk_start, chunk_end, status, requested_at, fetched_at,
                    persisted_at, records, error, attempts
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
                    ChunkStatus::Failed | ChunkStatus::Partial => {
                        coverage.failed_chunks += 1;
                        coverage.records += chunk.records;
                    }
                    ChunkStatus::Pending => coverage.pending_chunks += 1,
                }
            }
            streams.push(coverage);
        }

        let failed_chunks_detail = self.failed_backfill_chunks()?;
        let needs_manual_retry = failed_chunks_detail.iter().any(|chunk| chunk.exhausted);

        Ok(CoverageLedger {
            requested_from,
            requested_to,
            streams,
            total_chunks: total,
            completed_chunks: completed,
            // 只有每一块都有结论时才算完整。一块都没排过也不算完整 ——
            // 「什么都没做」不是「已经做完」。
            complete: total > 0 && completed == total,
            failed_chunks_detail,
            needs_manual_retry,
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
        attempts: row.get(9)?,
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
mod tests;
