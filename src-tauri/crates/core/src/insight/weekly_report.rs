//! 本地周报：按天收集样本并与上周对比（从 insight/mod.rs 拆出，逻辑不变）。

use super::*;

impl Database {
    /// 本地周报：最近 7 天对比此前 28 天的**个人**基线。
    ///
    /// 每条结论都带样本数、来源和置信度；不足就说不足。不和任何人群基准比较，
    /// 也不输出诊断、治疗或风险预测。
    pub fn weekly_report(&self, now: DateTime<Local>) -> Result<WeeklyReport> {
        // `daily_metrics.date` 是本地日，「今天」必须也按本地日算。
        self.weekly_report_for_day(now.date_naive(), now.with_timezone(&Utc))
    }

    /// 同上，但「今天」由调用方给出；测试用它钉住日期，不受机器时区影响。
    pub fn weekly_report_for_day(
        &self,
        today: NaiveDate,
        generated_at: DateTime<Utc>,
    ) -> Result<WeeklyReport> {
        let recent_start = saturating_days_before(today, weekly::RECENT_DAYS - 1);
        let baseline_end = saturating_days_before(recent_start, 1);
        let baseline_start = saturating_days_before(baseline_end, weekly::BASELINE_DAYS - 1);

        let mut facts = Vec::new();
        for (fact_id, metric, unit) in [
            ("weekly.resting_hr", "resting_hr", "bpm"),
            ("weekly.hrv", "hrv", "ms"),
            ("weekly.stress", "stress", "score"),
            ("weekly.sleep_duration", "sleep_duration", "min"),
            (
                "weekly.sleep_start_regularity",
                "sleep_start_regularity",
                "min",
            ),
            ("weekly.workout_count", "workout_count", "次"),
            ("weekly.training_load", "training_load", "load"),
        ] {
            facts.push(self.weekly_fact(
                fact_id,
                metric,
                unit,
                recent_start,
                today,
                baseline_start,
                baseline_end,
            )?);
        }

        Ok(WeeklyReport {
            generated_at: generated_at.to_rfc3339(),
            recent_start: recent_start.to_string(),
            recent_end: today.to_string(),
            baseline_start: baseline_start.to_string(),
            baseline_end: baseline_end.to_string(),
            facts,
        })
    }

    #[allow(clippy::too_many_arguments)]
    pub(super) fn weekly_fact(
        &self,
        fact_id: &str,
        metric: &str,
        unit: &str,
        recent_start: NaiveDate,
        recent_end: NaiveDate,
        baseline_start: NaiveDate,
        baseline_end: NaiveDate,
    ) -> Result<InsightFact> {
        let recent = self.weekly_samples(metric, recent_start, recent_end)?;
        let baseline = self.weekly_samples(metric, baseline_start, baseline_end)?;
        let window = BaselineWindow {
            kind: "previous_days".into(),
            days: weekly::BASELINE_DAYS,
            min_samples: weekly::MIN_BASELINE_DAYS,
            max_samples: weekly::BASELINE_DAYS,
            distance_tolerance_percent: None,
        };

        let value = mean(&recent.values);
        let source = recent
            .source
            .clone()
            .or_else(|| baseline.source.clone())
            .unwrap_or_else(|| "unknown".into());

        let enough_baseline = baseline.day_count as i64 >= weekly::MIN_BASELINE_DAYS;
        let baseline_count = baseline.day_count as i64;
        let (comparison, confidence, reason, reason_code) = match (value, mean(&baseline.values)) {
            (Some(current), Some(previous)) if enough_baseline && previous != 0.0 => {
                let delta = current - previous;
                (
                    Some(Comparison {
                        baseline_value: round1(previous),
                        delta: round1(delta),
                        delta_percent: round1(delta / previous.abs() * 100.0),
                        direction: direction_of(delta, previous),
                    }),
                    Confidence::from_samples(baseline.day_count),
                    None,
                    None,
                )
            }
            // 基线天数够但均值是 0：拿 0 当分母算不出相对变化，这和「样本
            // 不足」是两回事，单独一个码，别混进 thin_baseline 的说辞里。
            (Some(_), Some(previous)) if enough_baseline && previous == 0.0 => (
                None,
                Confidence::Insufficient,
                Some("此前基线均值为 0，无法计算相对变化。".into()),
                Some("weekly_zero_baseline".to_string()),
            ),
            (Some(_), _) => (
                None,
                Confidence::Insufficient,
                Some(format!(
                    "此前 {} 天里只有 {} 天有这项数据，不足 {} 天，所以只报现状不做比较。",
                    weekly::BASELINE_DAYS,
                    baseline.day_count,
                    weekly::MIN_BASELINE_DAYS
                )),
                Some("weekly_thin_baseline".to_string()),
            ),
            (None, _) => (
                None,
                Confidence::Insufficient,
                Some("最近 7 天本机没有这项数据。".into()),
                Some("weekly_no_recent_data".to_string()),
            ),
        };

        Ok(InsightFact {
            fact_id: fact_id.into(),
            metric: metric.into(),
            value: value.map(round1),
            unit: unit.into(),
            comparison,
            baseline_window: Some(window),
            evidence_count: recent.day_count as i64,
            source,
            confidence,
            reason,
            reason_code,
            baseline_count,
            evidence_refs: recent.dates,
        })
    }

    pub(super) fn weekly_samples(
        &self,
        metric: &str,
        start: NaiveDate,
        end: NaiveDate,
    ) -> Result<WeeklySamples> {
        let start_text = start.to_string();
        let end_text = end.to_string();
        match metric {
            "sleep_duration" => self.collect_samples(
                "SELECT date(end_time, 'localtime'), CAST(duration_minutes AS REAL), source_scope
                 FROM sleep_sessions
                 WHERE date(end_time, 'localtime') BETWEEN ?1 AND ?2",
                &start_text,
                &end_text,
            ),
            // 入睡时间的规律性：每晚入睡的分钟数（自当地午夜起算）本身就是
            // 一个可比的日度值，两段窗口各自取标准差来对比。
            "sleep_start_regularity" => {
                let mut raw = self.collect_raw_samples(
                    "SELECT date(start_time, 'localtime'),
                            CAST(strftime('%H', start_time, 'localtime') AS REAL) * 60
                              + CAST(strftime('%M', start_time, 'localtime') AS REAL),
                            source_scope
                     FROM sleep_sessions
                     WHERE date(start_time, 'localtime') BETWEEN ?1 AND ?2",
                    &start_text,
                    &end_text,
                )?;
                // 跨午夜的入睡时间会在 0 和 1440 之间跳，直接算标准差会把
                // 「23:50 和 00:10」看成相差 23 小时。统一折算到以 18:00
                // 为原点的相对分钟数。必须先折再按日平均：同日 23:50 和
                // 00:10 的原始分钟平均是中午，折完才是午夜附近。
                for (_, minutes) in &mut raw.rows {
                    let shifted = *minutes - 18.0 * 60.0;
                    *minutes = if shifted < -12.0 * 60.0 {
                        shifted + 24.0 * 60.0
                    } else {
                        shifted
                    };
                }
                let samples = collapse_per_day(raw);
                let spread = stdev(&samples.values);
                Ok(WeeklySamples {
                    values: spread.map(|value| vec![value]).unwrap_or_default(),
                    day_count: samples.day_count,
                    dates: samples.dates,
                    source: samples.source,
                })
            }
            "workout_count" => {
                let raw = self.collect_raw_samples(
                    "SELECT date(start_time, 'localtime'), 1.0, source_scope
                     FROM workouts
                     WHERE date(start_time, 'localtime') BETWEEN ?1 AND ?2",
                    &start_text,
                    &end_text,
                )?;
                // 「次数」是窗口内的总量，不是每天的平均，也不能在按日折叠
                // 之后数 values（同日两场会被收成 1.0）。先记下总场次，再
                // 折叠只为拿去重天数。
                //
                // 基线窗口（28 天）比当前窗口（7 天）长，两边的总量不能直接
                // 相减/相除——否则同样的训练频率会被读成「下降了」。按窗口
                // 实际天数换算成「每 RECENT_DAYS 天」的等效场次，当前窗口
                // 本身正好是 RECENT_DAYS 天，换算后数值不变。
                let window_days = (end - start).num_days() + 1;
                let total = raw.rows.len() as f64;
                let scaled_total = if window_days > 0 {
                    total * weekly::RECENT_DAYS as f64 / window_days as f64
                } else {
                    total
                };
                let samples = collapse_per_day(raw);
                Ok(WeeklySamples {
                    values: if total > 0.0 {
                        vec![scaled_total]
                    } else {
                        Vec::new()
                    },
                    day_count: samples.day_count,
                    dates: samples.dates,
                    source: samples.source,
                })
            }
            "training_load" => self.collect_samples(
                "SELECT date, value, source_scope FROM daily_metrics
                 WHERE metric = 'training_load' AND date BETWEEN ?1 AND ?2",
                &start_text,
                &end_text,
            ),
            // HRV 落库有两个名字：`hrv` 流写 `hrv`，wellness 的
            // `hrvRmssd` 项写 `hrv_rmssd`——两个都要查，漏一个就等于
            // 说那些天没有 HRV 数据。
            "hrv" => {
                let daily = self.collect_samples(
                    "SELECT date, value, source_scope FROM daily_metrics
                     WHERE metric IN ('hrv', 'hrv_rmssd') AND date BETWEEN ?1 AND ?2",
                    &start_text,
                    &end_text,
                )?;
                if !daily.values.is_empty() {
                    return Ok(daily);
                }
                self.collect_samples(
                    "SELECT date(timestamp, 'localtime'), value, source_scope FROM metric_samples
                     WHERE metric IN ('hrv', 'hrv_rmssd')
                       AND timestamp >= ?3 AND timestamp < ?4
                       AND date(timestamp, 'localtime') BETWEEN ?1 AND ?2",
                    &start_text,
                    &end_text,
                )
            }
            other => {
                // 先看日度表，没有再回落到采样表。
                let daily = self.collect_samples(
                    &format!(
                        "SELECT date, value, source_scope FROM daily_metrics
                         WHERE metric = '{other}' AND date BETWEEN ?1 AND ?2"
                    ),
                    &start_text,
                    &end_text,
                )?;
                if !daily.values.is_empty() {
                    return Ok(daily);
                }
                self.collect_samples(
                    &format!(
                        "SELECT date(timestamp, 'localtime'), value, source_scope FROM metric_samples
                         WHERE metric = '{other}' AND timestamp >= ?3 AND timestamp < ?4
                           AND date(timestamp, 'localtime') BETWEEN ?1 AND ?2"
                    ),
                    &start_text,
                    &end_text,
                )
            }
        }
    }

    pub(super) fn collect_samples(
        &self,
        sql: &str,
        start: &str,
        end: &str,
    ) -> Result<WeeklySamples> {
        Ok(collapse_per_day(self.collect_raw_samples(sql, start, end)?))
    }

    pub(super) fn collect_raw_samples(
        &self,
        sql: &str,
        start: &str,
        end: &str,
    ) -> Result<RawWeeklySamples> {
        let mut stmt = self.conn.prepare(sql)?;
        // 样本表的查询多带一对 UTC 时间界（?3 / ?4）：`date(timestamp, 'localtime')`
        // 套在列上用不上索引，要把这个指标的全部行扫一遍；先按时间界在索引上
        // 圈出范围，再由 date() 精确筛到本地日，结果不变。
        let (lower, upper) = crate::storage::local_day_range_utc_bounds(start, end)
            .unwrap_or_else(|| ("0000".to_string(), "9999".to_string()));
        let mapper = |row: &rusqlite::Row<'_>| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, f64>(1)?,
                row.get::<_, String>(2)?,
            ))
        };
        let rows: Vec<_> = if sql.contains("?3") {
            stmt.query_map(rusqlite::params![start, end, lower, upper], mapper)?
                .collect()
        } else {
            stmt.query_map(rusqlite::params![start, end], mapper)?
                .collect()
        };
        let mut samples = Vec::new();
        let mut scopes = std::collections::BTreeSet::new();
        for row in rows {
            let (date, value, scope) = row?;
            if !value.is_finite() {
                continue;
            }
            samples.push((date, value));
            scopes.insert(scope);
        }
        Ok(RawWeeklySamples {
            rows: samples,
            scopes,
        })
    }
}

pub(super) struct RawWeeklySamples {
    pub(super) rows: Vec<(String, f64)>,
    pub(super) scopes: std::collections::BTreeSet<String>,
}

/// 每个日历日一个有限值。同日多行（双 scope、hrv + hrv_rmssd、一天多次
/// 采样）先取当天平均，再拿这些日值去算窗口均值——否则一天两行会把均值
/// 拉偏，也会把「一天的证据」当成两天。
pub(super) fn collapse_per_day(raw: RawWeeklySamples) -> WeeklySamples {
    let mut by_date: std::collections::BTreeMap<String, Vec<f64>> =
        std::collections::BTreeMap::new();
    for (date, value) in raw.rows {
        by_date.entry(date).or_default().push(value);
    }
    let mut values = Vec::with_capacity(by_date.len());
    let mut dates = Vec::with_capacity(by_date.len());
    for (date, day_values) in by_date {
        values.push(day_values.iter().sum::<f64>() / day_values.len() as f64);
        dates.push(date);
    }
    let day_count = dates.len();
    WeeklySamples {
        values,
        day_count,
        dates,
        // 一个窗口里混了多种来源时不挑一个当代表，如实说 mixed。
        source: match raw.scopes.len() {
            0 => None,
            1 => raw.scopes.into_iter().next(),
            _ => Some("mixed".into()),
        },
    }
}

pub(super) struct WeeklySamples {
    /// 每个有数据的日历日一个值（同日多行已先取平均）。
    /// `sleep_start_regularity` / `workout_count` 会再聚合成单值。
    pub(super) values: Vec<f64>,
    /// 窗口里有数据的去重日期数。天数判据不能数 values。
    pub(super) day_count: usize,
    pub(super) dates: Vec<String>,
    pub(super) source: Option<String>,
}
