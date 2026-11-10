//! 导入的健康样本落库与撤销（计划 C2 二期，读备份在 `crate::import::unstrap_health`）。
//!
//! **只补空档，Zepp 为准**：同一分钟本机已经有这个指标的样本（不管哪台设备）、同一天已经有
//! 这个日指标、时间上和本机已有的睡眠重叠，都不收。所以导入不会改掉任何一条同步来的数据，
//! 同一份备份导第二次也不会多出东西。每行记着 `import_batch_id`：整批撤销按它删，保留期清理
//! 和「最新数据」都跳过它（迁移 v51）。口径见 `docs/development/unstrap-mapping.md`。

use std::collections::HashSet;

use chrono::{DateTime, Duration, Utc};
use rusqlite::params;

use super::Database;
use crate::import::unstrap_health::{HealthSample, ParsedHealth, UNSTRAP_DEVICE};
use crate::models::error::Result;

/// 一批健康数据补进来多少、因为本机已有跳过多少。
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub struct HealthAdded {
    pub samples: usize,
    pub daily: usize,
    pub sleeps: usize,
    pub skipped: usize,
}

impl HealthAdded {
    pub fn total(&self) -> usize {
        self.samples + self.daily + self.sleeps
    }
}

fn minute(at: DateTime<Utc>) -> i64 {
    at.timestamp().div_euclid(60)
}

fn parse_time(text: &str) -> Option<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(text)
        .ok()
        .map(|t| t.with_timezone(&Utc))
}

impl Database {
    /// 在调用方开好的事务里写一批健康数据。
    pub(super) fn insert_imported_health(
        &self,
        batch_id: i64,
        health: &ParsedHealth,
        now: DateTime<Utc>,
    ) -> Result<HealthAdded> {
        let mut added = HealthAdded::default();

        let mut metrics: Vec<&'static str> = health.samples.iter().map(|s| s.metric).collect();
        metrics.sort_unstable();
        metrics.dedup();
        for metric in metrics {
            let mut of: Vec<&HealthSample> = health
                .samples
                .iter()
                .filter(|s| s.metric == metric)
                .collect();
            of.sort_by_key(|s| s.timestamp);
            let (Some(first), Some(last)) = (of.first(), of.last()) else {
                continue;
            };
            let mut taken = self.sample_minutes(metric, first.timestamp, last.timestamp)?;
            let mut insert = self.conn.prepare_cached(
                "INSERT OR IGNORE INTO metric_samples
                    (metric, timestamp, value, unit, source_scope, device_id, raw_record_id, import_batch_id)
                 VALUES (?1, ?2, ?3, ?4, 'device', ?5, NULL, ?6)",
            )?;
            for sample in of {
                if !taken.insert(minute(sample.timestamp)) {
                    added.skipped += 1;
                    continue;
                }
                let changed = insert.execute(params![
                    sample.metric,
                    sample.timestamp.to_rfc3339(),
                    sample.value,
                    sample.unit,
                    UNSTRAP_DEVICE,
                    batch_id,
                ])?;
                if changed == 0 {
                    added.skipped += 1;
                } else {
                    added.samples += 1;
                }
            }
        }

        for daily in &health.daily {
            let exists: bool = self.conn.query_row(
                "SELECT EXISTS(SELECT 1 FROM daily_metrics WHERE metric = ?1 AND date = ?2)",
                params![daily.metric, daily.date],
                |row| row.get(0),
            )?;
            if exists {
                added.skipped += 1;
                continue;
            }
            self.conn.execute(
                "INSERT INTO daily_metrics
                    (date, metric, value, unit, source_scope, device_id, raw_record_id, import_batch_id)
                 VALUES (?1, ?2, ?3, ?4, 'device', ?5, NULL, ?6)",
                params![
                    daily.date,
                    daily.metric,
                    daily.value,
                    daily.unit,
                    UNSTRAP_DEVICE,
                    batch_id
                ],
            )?;
            added.daily += 1;
        }

        if let (Some(first), Some(last)) = (
            health.sleeps.iter().map(|s| s.start_time).min(),
            health.sleeps.iter().map(|s| s.end_time).max(),
        ) {
            let mut nights = self.sleep_spans(first, last)?;
            for sleep in &health.sleeps {
                let overlaps = nights
                    .iter()
                    .any(|(start, end)| sleep.start_time < *end && sleep.end_time > *start);
                if overlaps {
                    added.skipped += 1;
                    continue;
                }
                let mut sleep = sleep.clone();
                // 导入的时间，不是云端拉取时间：这一晚从来没经过云端。
                sleep.synced_at = Some(now);
                self.insert_sleep_session_with_raw(&sleep, None)?;
                self.conn.execute(
                    "UPDATE sleep_sessions SET import_batch_id = ?2 WHERE sleep_id = ?1",
                    params![sleep.sleep_id, batch_id],
                )?;
                nights.push((sleep.start_time, sleep.end_time));
                added.sleeps += 1;
            }
        }
        Ok(added)
    }

    /// 本机某个指标在这段时间里已经有样本的分钟。时间按字符串范围先粗筛（多放一天），再逐条解析。
    fn sample_minutes(
        &self,
        metric: &str,
        from: DateTime<Utc>,
        to: DateTime<Utc>,
    ) -> Result<HashSet<i64>> {
        let mut stmt = self.conn.prepare(
            "SELECT timestamp FROM metric_samples
             WHERE metric = ?1 AND timestamp >= ?2 AND timestamp <= ?3",
        )?;
        let rows = stmt.query_map(
            params![
                metric,
                (from - Duration::days(1)).to_rfc3339(),
                (to + Duration::days(1)).to_rfc3339()
            ],
            |row| row.get::<_, String>(0),
        )?;
        let mut minutes = HashSet::new();
        for text in rows {
            if let Some(at) = parse_time(&text?) {
                minutes.insert(minute(at));
            }
        }
        Ok(minutes)
    }

    /// 本机这段时间附近已有的睡眠起止。
    fn sleep_spans(
        &self,
        from: DateTime<Utc>,
        to: DateTime<Utc>,
    ) -> Result<Vec<(DateTime<Utc>, DateTime<Utc>)>> {
        let mut stmt = self.conn.prepare(
            "SELECT start_time, end_time FROM sleep_sessions
             WHERE end_time >= ?1 AND start_time <= ?2",
        )?;
        let rows = stmt.query_map(
            params![
                (from - Duration::days(2)).to_rfc3339(),
                (to + Duration::days(2)).to_rfc3339()
            ],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        )?;
        let mut spans = Vec::new();
        for row in rows {
            let (start, end) = row?;
            if let (Some(start), Some(end)) = (parse_time(&start), parse_time(&end)) {
                spans.push((start, end));
            }
        }
        Ok(spans)
    }

    /// 撤销一批时删掉它的健康数据，在调用方的事务里。返回删了几行（睡眠按晚算）。
    pub(super) fn delete_imported_health(&self, batch_id: i64) -> Result<usize> {
        for table in ["sleep_stages", "sleep_nap_stages"] {
            self.conn.execute(
                &format!(
                    "DELETE FROM {table} WHERE sleep_id IN
                        (SELECT sleep_id FROM sleep_sessions WHERE import_batch_id = ?1)"
                ),
                [batch_id],
            )?;
        }
        let mut removed = 0;
        for table in ["sleep_sessions", "metric_samples", "daily_metrics"] {
            removed += self.conn.execute(
                &format!("DELETE FROM {table} WHERE import_batch_id = ?1"),
                [batch_id],
            )?;
        }
        Ok(removed)
    }
}
