//! 最近样本、心率与压力曲线、本机覆盖范围（从 storage/mod.rs 按领域拆出，逻辑不变）。

use super::*;

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct StreamFreshness {
    pub last_cloud_sync_at: Option<String>,
    pub newest_sample_at: Option<String>,
}

/// 本机实际有数据的那段日子。
///
/// 存在的理由：界面上到处都能选「6 个月」，但那些选择器读的都是本机库。
/// 库里只有 30 天时，选 6 个月只会把坐标轴拉长，前面五个月是空的——而在此之前
/// 没有任何一处告诉用户这件事，于是「我选了 6 个月却只看到 30 天」被当成 bug
/// 报了上来。它不是 bug，是我们没说。
#[derive(Debug, Clone, Default, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct LocalCoverage {
    /// 最早一天（`YYYY-MM-DD`）。库是空的时候为 `None`。
    pub earliest_day: Option<String>,
    /// 最晚一天（`YYYY-MM-DD`）。
    pub latest_day: Option<String>,
    /// `earliest_day` 到今天的天数。用来和「你选的范围」直接比较。
    pub covered_days: i64,
}

impl Database {
    pub fn heart_rate_series(&self, hours: i64) -> Result<Vec<HeartRatePoint>> {
        let hours = hours.clamp(1, 24 * 14);
        let cutoff = (Utc::now() - chrono::Duration::hours(hours)).to_rfc3339();
        // Two sources (band_data device rows, heartRate API user_fused
        // rows) can hold the same minute; collapse to one row per timestamp
        // preferring user_fused so charts never draw duplicate points.
        let mut stmt = self.conn.prepare(
            "SELECT m.timestamp, m.value
             FROM metric_samples m
             WHERE m.metric = 'heart_rate' AND m.timestamp >= ?1
               AND m.id = (
                   SELECT id FROM metric_samples
                   WHERE metric = 'heart_rate' AND timestamp = m.timestamp
                   ORDER BY CASE source_scope
                       WHEN 'user_fused' THEN 0
                       WHEN 'device' THEN 1
                       ELSE 2 END, id
                   LIMIT 1)
             ORDER BY m.timestamp ASC",
        )?;
        let rows = stmt.query_map([cutoff], |row| {
            Ok(HeartRatePoint {
                timestamp: row.get(0)?,
                value: row.get(1)?,
            })
        })?;
        rows.collect::<std::result::Result<Vec<_>, _>>()
            .map_err(Into::into)
    }

    /// 全天压力曲线：`metric_samples` 里的逐条读数，按时间排列。
    ///
    /// 和心率那条不同，这里不需要按来源去重——压力只有 `all_day_stress`
    /// 一个来源，同一时刻的重复读数只可能来自两块表，那时两条都该留着，
    /// 唯一索引里本来就带 `device_id`。
    ///
    /// 没有采样的时间段不补点。手表整夜没戴就是没数据，画成一条平的 0
    /// 会让人以为那几个小时特别放松。
    pub fn stress_series(&self, hours: i64) -> Result<Vec<StressPoint>> {
        let hours = hours.clamp(1, 24 * 14);
        let cutoff = (Utc::now() - chrono::Duration::hours(hours)).to_rfc3339();
        let mut stmt = self.conn.prepare(
            "SELECT timestamp, value FROM metric_samples
             WHERE metric = 'stress' AND timestamp >= ?1
             ORDER BY timestamp ASC",
        )?;
        let rows = stmt.query_map([cutoff], |row| {
            Ok(StressPoint {
                timestamp: row.get(0)?,
                value: row.get(1)?,
            })
        })?;
        rows.collect::<std::result::Result<Vec<_>, _>>()
            .map_err(Into::into)
    }

    pub fn stream_freshness(&self) -> Result<BTreeMap<String, StreamFreshness>> {
        let mut freshness = BTreeMap::<String, StreamFreshness>::new();
        let mut stmt = self.conn.prepare(
            "SELECT stream, MAX(fetched_at) FROM raw_records GROUP BY stream ORDER BY stream",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?))
        })?;
        for row in rows {
            let (stream, timestamp) = row?;
            freshness.entry(stream).or_default().last_cloud_sync_at = timestamp;
        }

        // Heart-rate can legitimately fall back to minute samples decoded from
        // band_data, so the sleep fetch is also a heart-rate cloud source.
        let sleep_fetch = freshness
            .get("sleep")
            .and_then(|value| value.last_cloud_sync_at.clone());
        if let Some(sleep_fetch) = sleep_fetch {
            let heart_rate = freshness.entry("heart_rate".into()).or_default();
            if heart_rate.last_cloud_sync_at.as_deref() < Some(sleep_fetch.as_str()) {
                heart_rate.last_cloud_sync_at = Some(sleep_fetch);
            }
        }

        for (stream, query) in [
            (
                "heart_rate",
                "SELECT MAX(timestamp) FROM metric_samples WHERE metric = 'heart_rate'",
            ),
            (
                "hrv",
                "SELECT MAX(timestamp) FROM metric_samples WHERE metric = 'hrv'",
            ),
            ("daily_summary", "SELECT MAX(date) FROM daily_metrics"),
            ("sleep", "SELECT MAX(end_time) FROM sleep_sessions"),
            ("workouts", "SELECT MAX(end_time) FROM workouts"),
        ] {
            let timestamp = self
                .conn
                .query_row(query, [], |row| row.get::<_, Option<String>>(0))?;
            freshness.entry(stream.into()).or_default().newest_sample_at = timestamp;
        }
        Ok(freshness)
    }

    /// 本机实际有数据的那段日子。
    ///
    /// 四张表各问一次最早/最晚，取并集：只看其中一张会在「有运动没有日概览」
    /// 这类账号上少报好几个月。返回的是**天**而不是时间戳，因为它要拿去和界面上
    /// 「最近 7 天 / 30 天 / 6 个月」这些以天为单位的选择直接比较。
    pub fn local_coverage(&self, today: NaiveDate) -> Result<LocalCoverage> {
        let (earliest, latest) = self.coverage_day_bounds()?;

        // 覆盖天数从最早那天数到**今天**，不是数到 `latest_day`：用户问的是
        // 「我能往回看多远」，而表没同步的那两天不该让答案变小。
        let covered_days = earliest
            .as_deref()
            .and_then(|day| NaiveDate::parse_from_str(day, "%Y-%m-%d").ok())
            .map(|day| (today - day).num_days() + 1)
            .unwrap_or(0)
            .max(0);

        Ok(LocalCoverage {
            earliest_day: earliest,
            latest_day: latest,
            covered_days,
        })
    }

    /// 四张表各自的最早/最晚**本地日**，取并集；空库返回 `(None, None)`。
    ///
    /// `date(x, 'localtime')` 对 `x` 单调不减，所以先取原始列的 MIN/MAX 再在
    /// Rust 里换算成日本地，与「逐行换算再取 MIN/MAX」结果一致——而原始列
    /// 才有索引可走：daily_metrics 的唯一键以 date 开头，v33 起 workouts
    /// 也有 idx_workouts_start。metric_samples / sleep_sessions 仍要扫表，
    /// 但省掉了对每一行各调一次 date() 的开销。
    ///
    /// 解析不出的极值行返回 None：以前这类行会被 date() 折成 NULL、自然
    /// 掉出 MIN/MAX；换算失败让这张表不报边界，和「没数据」同等处理，
    /// 而不是把整个查询拖下水。
    pub(super) fn coverage_day_bounds(&self) -> Result<(Option<String>, Option<String>)> {
        let mut earliest: Option<String> = None;
        let mut latest: Option<String> = None;
        for (query, is_timestamp) in [
            ("SELECT MIN(date), MAX(date) FROM daily_metrics", false),
            (
                "SELECT MIN(timestamp), MAX(timestamp) FROM metric_samples",
                true,
            ),
            (
                "SELECT MIN(start_time), MAX(end_time) FROM sleep_sessions",
                true,
            ),
            ("SELECT MIN(start_time), MAX(end_time) FROM workouts", true),
        ] {
            let (low, high) = self.conn.query_row(query, [], |row| {
                Ok((
                    row.get::<_, Option<String>>(0)?,
                    row.get::<_, Option<String>>(1)?,
                ))
            })?;
            let low = low.and_then(|value| {
                if is_timestamp {
                    local_day_of_stored(&value)
                } else {
                    Some(value)
                }
            });
            let high = high.and_then(|value| {
                if is_timestamp {
                    local_day_of_stored(&value)
                } else {
                    Some(value)
                }
            });
            if let Some(low) = low {
                if earliest
                    .as_deref()
                    .is_none_or(|current| low.as_str() < current)
                {
                    earliest = Some(low);
                }
            }
            if let Some(high) = high {
                if latest
                    .as_deref()
                    .is_none_or(|current| high.as_str() > current)
                {
                    latest = Some(high);
                }
            }
        }
        Ok((earliest, latest))
    }

    pub fn newest_samples(&self) -> Result<BTreeMap<String, Option<String>>> {
        Ok(self
            .stream_freshness()?
            .into_iter()
            .map(|(stream, value)| (stream, value.newest_sample_at))
            .collect())
    }
}
