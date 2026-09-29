//! 按天指标序列、训练负荷与最近读数（从 storage/mod.rs 按领域拆出，逻辑不变）。

use super::*;

impl Database {
    /// Daily series for the body and training screens.
    ///
    /// Only names in `SERIES_METRICS` / `SAMPLE_ONLY_SERIES_METRICS` are
    /// answered; anything else is skipped rather than guessed at, so a typo in
    /// a caller cannot produce a chart with an invented unit.
    /// 按天聚合原始心率样本：这一天的最高、最低、平均，以及有多少个样本。
    ///
    /// 为什么不用 `daily_metrics`：Zepp 的**日**最高心率根本没有被采集进来。
    /// 库里唯一叫 `device_max_hr` 的东西来自 PAI 流的 `maxHr`，那是这块表的
    /// 最大心率**设定值**（用来划分区间的 100–240 那个数），不是当天实测的
    /// 峰值。把它当成日最高心率显示，会是又一个「界面上有个数，但它不是你
    /// 以为的那个意思」。
    ///
    /// 所以这里只做一件事：把本机存着的原始样本按天取 max。用户看到的数字
    /// 和 Zepp App 里的不一样是正常的——Zepp 会过滤，我们不过滤。
    ///
    /// **`samples` 必须一起返回。** 一天只有 12 个样本时，那个「最高值」是
    /// 12 个点里的最高，不是这一天的最高；不把样本数交出去，界面就只能把它
    /// 当成完整最大值来画，而那是在编造事实。
    ///
    /// 日期按本地时区切分：用户问的是「我那天」，不是「那个 UTC 日」。
    pub fn daily_heart_rate_extremes(&self, days: i64) -> Result<Vec<DailyHeartRateExtreme>> {
        let window_days = days.clamp(1, 1825);
        let end = Local::now().date_naive();
        let start = end - Duration::days(window_days - 1);
        // `timestamp` 存的是 RFC 3339（带偏移）。SQLite 的 `localtime` 修饰符
        // 按**本机**时区换算，这正是我们要的分日方式。
        // UTC 宽限界让 uq_metric_sample_key 按 (metric, timestamp) 切出范围；
        // date() 仍是本地日的精修谓词。
        let start_text = start.format("%Y-%m-%d").to_string();
        let end_text = end.format("%Y-%m-%d").to_string();
        let (utc_lower, utc_upper) = utc_bounds_or_unbounded(&start_text, &end_text);
        let mut stmt = self.conn.prepare(
            "SELECT date(timestamp, 'localtime') AS day,
                    MAX(value), MIN(value), AVG(value), COUNT(*)
             FROM metric_samples
             WHERE metric = 'heart_rate'
               AND timestamp >= ?3 AND timestamp < ?4
               AND date(timestamp, 'localtime') BETWEEN ?1 AND ?2
             GROUP BY day
             ORDER BY day",
        )?;
        let rows = stmt.query_map([start_text, end_text, utc_lower, utc_upper], |row| {
            Ok(DailyHeartRateExtreme {
                date: row.get(0)?,
                max: row.get::<_, f64>(1)?.round() as i32,
                min: row.get::<_, f64>(2)?.round() as i32,
                average: row.get::<_, f64>(3)?.round() as i32,
                samples: row.get(4)?,
            })
        })?;
        rows.collect::<std::result::Result<Vec<_>, _>>()
            .map_err(Into::into)
    }

    /// Read meal details from retained food payloads without a migration or replay.
    /// Newest snapshots win when overlapping sync windows contain the same log ID.
    pub fn food_entries(&self, days: i64) -> Result<Vec<FoodEntry>> {
        let end = Local::now().date_naive();
        let start = (end - Duration::days(days.clamp(1, 1825) - 1)).to_string();
        let end = end.to_string();
        let mut stmt = self.conn.prepare(
            "SELECT source_key, payload, payload_zip FROM raw_records
             WHERE stream = 'wellness' AND source_key LIKE 'wellness:food:%'
             ORDER BY fetched_at DESC, id DESC",
        )?;
        let mut rows = stmt.query([])?;
        let mut seen = BTreeSet::new();
        let mut entries = Vec::new();
        while let Some(row) = rows.next()? {
            let key: String = row.get(0)?;
            let payload = decode_raw_payload(row.get(1)?, row.get(2)?)?;
            let payload = serde_json::from_str(&payload)
                .map_err(|error| ZeppBridgeError::ParseError(error.to_string()))?;
            for entry in Normalizer::normalize_wellness(&key, &payload).food_entries {
                let identity = match &entry.food_log_id {
                    Some(id) => format!("id:{id}"),
                    None => serde_json::to_string(&entry)
                        .map_err(|error| ZeppBridgeError::ParseError(error.to_string()))?,
                };
                if seen.insert(identity) && entry.date >= start && entry.date <= end {
                    entries.push(entry);
                }
            }
        }
        entries.sort_by(|a, b| {
            b.date
                .cmp(&a.date)
                .then_with(|| b.mealtime.cmp(&a.mealtime))
        });
        Ok(entries)
    }

    pub fn metric_series(&self, metrics: &[String], days: i64) -> Result<Vec<MetricSeries>> {
        let window_days = days.clamp(1, 1825);
        let end = Local::now().date_naive();
        let start = end - Duration::days(window_days - 1);
        let start_text = start.format("%Y-%m-%d").to_string();
        let end_text = end.format("%Y-%m-%d").to_string();

        let mut result = Vec::new();
        for metric in metrics {
            let daily = SERIES_METRICS
                .iter()
                .find(|(name, _, _)| name == metric)
                .map(|(name, source, unit)| (*name, *source, *unit));
            let sample_only = SAMPLE_ONLY_SERIES_METRICS
                .iter()
                .find(|(name, _)| name == metric)
                .map(|(name, unit)| (*name, MetricSource::Samples, *unit));
            let Some((name, source, unit)) = daily.or(sample_only) else {
                continue;
            };

            let points = match source {
                MetricSource::Daily(spread) => {
                    self.daily_metric_points(name, spread, &start_text, &end_text)?
                }
                MetricSource::Samples => self.sample_metric_points(name, &start_text, &end_text)?,
                MetricSource::SleepScores => self.sleep_score_points(&start_text, &end_text)?,
            };

            let values: Vec<f64> = points.iter().map(|point| point.value).collect();
            result.push(MetricSeries {
                metric: name.to_string(),
                unit: unit.to_string(),
                source: match source {
                    MetricSource::Daily(_) => "daily_metrics".to_string(),
                    MetricSource::Samples => "metric_samples".to_string(),
                    MetricSource::SleepScores => "sleep_sessions".to_string(),
                },
                latest: points.last().cloned(),
                average: average_finite(values.iter().copied()).map(round1),
                minimum: values.iter().copied().reduce(f64::min),
                maximum: values.iter().copied().reduce(f64::max),
                days_with_data: points.len() as i64,
                window_days,
                points,
            });
        }
        Ok(result)
    }

    /// A night's score belongs to its local wake date. If more than one
    /// session ends on a date, prefer the fused session then the latest end.
    pub(crate) fn sleep_score_points(
        &self,
        start: &str,
        end: &str,
    ) -> Result<Vec<MetricSeriesPoint>> {
        let mut stmt = self.conn.prepare(
            "SELECT date(s.end_time, 'localtime'), s.score
             FROM sleep_sessions_shown s
             WHERE s.score IS NOT NULL
               AND date(s.end_time, 'localtime') BETWEEN ?1 AND ?2
               AND s.id = (
                   SELECT s2.id FROM sleep_sessions_shown s2
                   WHERE s2.score IS NOT NULL
                     AND date(s2.end_time, 'localtime') = date(s.end_time, 'localtime')
                   ORDER BY CASE s2.source_scope
                       WHEN 'user_fused' THEN 0 WHEN 'device' THEN 1 ELSE 2 END,
                       s2.end_time DESC, s2.id DESC LIMIT 1)
             ORDER BY date(s.end_time, 'localtime')",
        )?;
        let rows = stmt.query_map(params![start, end], |row| {
            Ok(MetricSeriesPoint {
                date: row.get(0)?,
                value: row.get::<_, i32>(1)? as f64,
                min: None,
                max: None,
                samples: None,
            })
        })?;
        rows.collect::<std::result::Result<Vec<_>, _>>()
            .map_err(Into::into)
    }

    /// Inventory normalized metrics, including sleep scores stored with sessions
    /// and names not exposed by the chart contract. Never inspect raw payloads.
    pub fn stored_metrics(&self) -> Result<Vec<StoredMetric>> {
        let mut stmt = self.conn.prepare(
            "SELECT metric, 'daily_metrics', unit, COUNT(*), MIN(date), MAX(date)
             FROM daily_metrics GROUP BY metric, unit
             UNION ALL
             SELECT metric, 'metric_samples', unit, COUNT(*),
                    MIN(date(timestamp, 'localtime')),
                    MAX(date(timestamp, 'localtime'))
             FROM metric_samples GROUP BY metric, unit
             UNION ALL
             SELECT 'sleep_score', 'sleep_sessions', 'score', COUNT(*),
                    MIN(date(end_time, 'localtime')),
                    MAX(date(end_time, 'localtime'))
             FROM sleep_sessions_shown WHERE score IS NOT NULL HAVING COUNT(*) > 0
             ORDER BY metric, 2, unit",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(StoredMetric {
                metric: row.get(0)?,
                source: row.get(1)?,
                unit: row.get(2)?,
                records: row.get(3)?,
                first_date: row.get(4)?,
                last_date: row.get(5)?,
            })
        })?;
        rows.collect::<std::result::Result<Vec<_>, _>>()
            .map_err(Into::into)
    }

    /// Page exact stored values for any discovered metric. The source is
    /// explicit because some names occur in multiple tables with different meaning.
    pub fn stored_metric_records(
        &self,
        metric: &str,
        source: &str,
        start: Option<&str>,
        end: Option<&str>,
        limit: usize,
        offset: usize,
    ) -> Result<Vec<StoredMetricRecord>> {
        let valid_date = |value: &str| {
            NaiveDate::parse_from_str(value, "%Y-%m-%d")
                .is_ok_and(|date| date.format("%Y-%m-%d").to_string() == value)
        };
        if metric.is_empty()
            || start.is_some_and(|value| !valid_date(value))
            || end.is_some_and(|value| !valid_date(value))
            || matches!((start, end), (Some(a), Some(b)) if a > b)
            || !["daily_metrics", "metric_samples", "sleep_sessions"].contains(&source)
            || (source == "sleep_sessions" && metric != "sleep_score")
        {
            return Err(ZeppBridgeError::ConfigError("Invalid metric query".into()));
        }
        let limit = limit.clamp(1, 201) as i64;
        let offset = offset.min(1_000_000) as i64;
        let query = if source == "daily_metrics" {
            "SELECT date, NULL, value, unit, source_scope FROM daily_metrics
             WHERE metric = ?1 AND (?2 IS NULL OR date >= ?2)
               AND (?3 IS NULL OR date <= ?3)
             ORDER BY date DESC, id DESC LIMIT ?4 OFFSET ?5"
        } else if source == "metric_samples" {
            "SELECT date(timestamp, 'localtime'), timestamp, value, unit, source_scope
             FROM metric_samples WHERE metric = ?1
               AND (?2 IS NULL OR date(timestamp, 'localtime') >= ?2)
               AND (?3 IS NULL OR date(timestamp, 'localtime') <= ?3)
             ORDER BY timestamp DESC, id DESC LIMIT ?4 OFFSET ?5"
        } else {
            "SELECT date(end_time, 'localtime'), end_time, CAST(score AS REAL),
                    'score', source_scope FROM sleep_sessions_shown
             WHERE ?1 = 'sleep_score' AND score IS NOT NULL
               AND (?2 IS NULL OR date(end_time, 'localtime') >= ?2)
               AND (?3 IS NULL OR date(end_time, 'localtime') <= ?3)
             ORDER BY end_time DESC, id DESC LIMIT ?4 OFFSET ?5"
        };
        let mut stmt = self.conn.prepare(query)?;
        let rows = stmt.query_map(params![metric, start, end, limit, offset], |row| {
            Ok(StoredMetricRecord {
                date: row.get(0)?,
                timestamp: row.get(1)?,
                value: row.get(2)?,
                unit: row.get(3)?,
                source_scope: row.get(4)?,
            })
        })?;
        rows.collect::<std::result::Result<Vec<_>, _>>()
            .map_err(Into::into)
    }

    /// One point per calendar day from `daily_metrics`.
    ///
    /// Where the same day is reported twice — once by the account's own fused
    /// roll-up, once by the watch — the fused reading wins, the same
    /// precedence the export uses, so a chart and an export never disagree.
    ///
    /// `pub(crate)`：ai_tasks 的逐日导出复用它按 P4 窗口取数，不另写一份
    /// 折日规则。
    pub(crate) fn daily_metric_points(
        &self,
        metric: &str,
        spread: Option<(&str, &str)>,
        start: &str,
        end: &str,
    ) -> Result<Vec<MetricSeriesPoint>> {
        let pick = |metric: &str| -> Result<BTreeMap<String, f64>> {
            let mut stmt = self.conn.prepare(
                "SELECT date,
                        COALESCE(
                            MAX(CASE WHEN source_scope = 'user_fused' THEN value END),
                            MAX(value)
                        )
                 FROM daily_metrics
                 WHERE metric = ?1 AND date BETWEEN ?2 AND ?3
                 GROUP BY date ORDER BY date",
            )?;
            let rows = stmt.query_map(params![metric, start, end], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, f64>(1)?))
            })?;
            let mut map = BTreeMap::new();
            for row in rows {
                let (date, value) = row?;
                map.insert(date, value);
            }
            Ok(map)
        };

        let values = pick(metric)?;
        let (minima, maxima) = match spread {
            Some((low, high)) => (pick(low)?, pick(high)?),
            None => (BTreeMap::new(), BTreeMap::new()),
        };

        Ok(values
            .into_iter()
            .map(|(date, value)| MetricSeriesPoint {
                min: minima.get(&date).copied().map(round1),
                max: maxima.get(&date).copied().map(round1),
                samples: None,
                value: round1(value),
                date,
            })
            .collect())
    }

    /// One point per local day from `metric_samples`.
    ///
    /// The day's value is the mean of its readings and the spread is the
    /// readings' own minimum and maximum — measured, not modelled. A day with
    /// one reading reports no spread rather than a zero-width one.
    ///
    /// `pub(crate)`：同 `daily_metric_points`，ai_tasks 按窗口取数复用。
    pub(crate) fn sample_metric_points(
        &self,
        metric: &str,
        start: &str,
        end: &str,
    ) -> Result<Vec<MetricSeriesPoint>> {
        let bounds = local_day_range_utc_bounds(start, end);
        let (lower, upper) = match &bounds {
            Some((lower, upper)) => (Some(lower.as_str()), Some(upper.as_str())),
            None => (None, None),
        };
        let mut stmt = self.conn.prepare(
            "SELECT date(timestamp, 'localtime') AS day,
                    AVG(value), MIN(value), MAX(value), COUNT(*)
             FROM metric_samples
             WHERE metric = ?1
               AND (?4 IS NULL OR timestamp >= ?4)
               AND (?5 IS NULL OR timestamp < ?5)
               AND date(timestamp, 'localtime') BETWEEN ?2 AND ?3
             GROUP BY day ORDER BY day",
        )?;
        let rows = stmt.query_map(params![metric, start, end, lower, upper], |row| {
            Ok(MetricSeriesPoint {
                date: row.get(0)?,
                value: round1(row.get::<_, f64>(1)?),
                min: Some(round1(row.get::<_, f64>(2)?)),
                max: Some(round1(row.get::<_, f64>(3)?)),
                samples: Some(row.get::<_, i64>(4)?),
            })
        })?;
        Ok(rows
            .collect::<std::result::Result<Vec<_>, _>>()?
            .into_iter()
            .map(|mut point| {
                if point.samples == Some(1) {
                    point.min = None;
                    point.max = None;
                }
                point
            })
            .collect())
    }

    /// Acute (7 day) against chronic (28 day) training load.
    ///
    /// The chronic window reaches 27 days before the range so the first day
    /// asked for is already backed by a full window instead of ramping up from
    /// zero. Shared with the export so the screen and the file agree.
    pub fn training_load_balance(
        &self,
        start: NaiveDate,
        end: NaiveDate,
    ) -> Result<Vec<TrainingBalancePoint>> {
        let history_start = (start - Duration::days(27)).format("%Y-%m-%d").to_string();
        let end_text = end.format("%Y-%m-%d").to_string();
        let mut stmt = self.conn.prepare(
            "SELECT date, MAX(value) FROM daily_metrics
             WHERE metric = 'training_load' AND date BETWEEN ?1 AND ?2
             GROUP BY date ORDER BY date",
        )?;
        let rows = stmt.query_map(params![history_start, end_text], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, f64>(1)?))
        })?;
        let mut by_date: BTreeMap<String, f64> = BTreeMap::new();
        for row in rows {
            let (date, value) = row?;
            by_date.insert(date, value);
        }

        let mut balance = Vec::new();
        let mut day = start;
        while day <= end {
            let window_sum = |days: i64| -> (f64, i64) {
                let mut total = 0.0;
                let mut present = 0i64;
                for back in 0..days {
                    let key = (day - Duration::days(back)).format("%Y-%m-%d").to_string();
                    if let Some(value) = by_date.get(&key) {
                        total += *value;
                        present += 1;
                    }
                }
                (total, present)
            };
            let (acute, acute_days) = window_sum(7);
            let (chronic, chronic_days) = window_sum(28);
            let chronic_weekly = chronic / 4.0;
            let ratio = (chronic_days >= 21 && chronic_weekly > 0.0)
                .then(|| (acute / chronic_weekly * 100.0).round() / 100.0);
            balance.push(TrainingBalancePoint {
                date: day.format("%Y-%m-%d").to_string(),
                acute_7d: round1(acute),
                acute_days_with_data: acute_days,
                chronic_28d: round1(chronic),
                chronic_days_with_data: chronic_days,
                acute_chronic_ratio: ratio,
            });
            day += Duration::days(1);
        }
        Ok(balance)
    }

    pub(super) fn latest_metric_f64(&self, metric: &str) -> Result<Option<f64>> {
        self.conn
            .query_row(
                "SELECT value FROM metric_samples WHERE metric = ?1
                 ORDER BY timestamp DESC,
                    CASE source_scope WHEN 'user_fused' THEN 0 WHEN 'device' THEN 1 ELSE 2 END,
                    id DESC LIMIT 1",
                [metric],
                |row| row.get(0),
            )
            .optional()
            .map_err(Into::into)
    }

    pub(super) fn latest_daily_f64(&self, metric: &str) -> Result<Option<f64>> {
        self.conn
            .query_row(
                "SELECT value FROM daily_metrics WHERE metric = ?1
                 ORDER BY date DESC,
                    CASE source_scope WHEN 'user_fused' THEN 0 WHEN 'device' THEN 1 ELSE 2 END,
                    id DESC LIMIT 1",
                [metric],
                |row| row.get(0),
            )
            .optional()
            .map_err(Into::into)
    }

    pub(super) fn latest_daily_i32(&self, metric: &str) -> Result<Option<i32>> {
        Ok(self
            .latest_daily_f64(metric)?
            .map(|value| value.round() as i32))
    }

    pub(super) fn latest_daily_i32_for_date(
        &self,
        metric: &str,
        date: NaiveDate,
    ) -> Result<Option<i32>> {
        self.conn
            .query_row(
                "SELECT value FROM daily_metrics WHERE metric = ?1 AND date = ?2
                 ORDER BY CASE source_scope WHEN 'user_fused' THEN 0 WHEN 'device' THEN 1 ELSE 2 END,
                          id DESC LIMIT 1",
                params![metric, date.format("%Y-%m-%d").to_string()],
                |row| row.get::<_, f64>(0),
            )
            .optional()
            .map(|value| value.map(|value| value.round() as i32))
            .map_err(Into::into)
    }
}
