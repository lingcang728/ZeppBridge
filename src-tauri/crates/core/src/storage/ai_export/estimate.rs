//! 交给 AI 的导出：只数条数、不生成 JSON 的估算（从 storage/mod.rs 按领域拆出，逻辑不变）。

use super::*;

impl Database {
    /// COUNT/SUM the export without building JSON.
    pub fn estimate_ai_export(&self, selection: &ExportSelection) -> Result<ExportEstimate> {
        const ENVELOPE_BYTES: u64 = 2_048;
        let scope = selection
            .resolve_scope()
            .map_err(ZeppBridgeError::ConfigError)?;
        let (start_text, end_text, workout_filter, workout_window, scope_kind) = match &scope {
            ExportScope::DateRange { start, end } => {
                let start_date = NaiveDate::parse_from_str(start, "%Y-%m-%d")
                    .map_err(|_| ZeppBridgeError::ConfigError("导出开始日期无效".into()))?;
                let end_date = NaiveDate::parse_from_str(end, "%Y-%m-%d")
                    .map_err(|_| ZeppBridgeError::ConfigError("导出结束日期无效".into()))?;
                let _ = (start_date, end_date);
                (
                    start.clone(),
                    end.clone(),
                    None,
                    None,
                    "date_range".to_string(),
                )
            }
            ExportScope::Workout { workout_id } => {
                let (day, started_at, ended_at): (String, String, String) = self
                    .conn
                    .query_row(
                        "SELECT date(start_time, 'localtime'), start_time, end_time
                         FROM workouts WHERE workout_id = ?1",
                        params![workout_id],
                        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
                    )
                    .optional()?
                    .ok_or_else(|| {
                        ZeppBridgeError::DataUnavailable("本地库里没有这条运动记录".into())
                    })?;
                (
                    day.clone(),
                    day,
                    Some(workout_id.clone()),
                    Some((started_at, ended_at)),
                    "workout".to_string(),
                )
            }
        };
        let single_workout = workout_filter.is_some();
        let allowed: BTreeSet<&str> = EXPORT_DATA_TYPES.into_iter().collect();
        let selected: BTreeSet<String> = selection
            .data_types
            .iter()
            .map(|value| value.trim().to_ascii_lowercase())
            .filter(|value| allowed.contains(value.as_str()))
            .collect();
        if selected.is_empty() {
            return Err(ZeppBridgeError::ConfigError(
                "请至少选择一种导出数据".into(),
            ));
        }
        let full = selection.detail.is_full();
        let mut record_count: usize = 0;
        let mut estimated_bytes: u64 = ENVELOPE_BYTES;

        let need_samples = selected.contains("heart_rate")
            || selected.contains("hrv")
            || selected.contains("hrv_rmssd")
            || selected.contains("respiratory_rate")
            || selected.contains("spo2")
            || selected.contains("stress")
            || selected.contains("weight");
        // 与 build_ai_export 同一条链路：选中类型先映回库里的指标名，
        // `metric IN (...)` + 时间界让 uq_metric_sample_key 切成索引区间。
        let sample_metric_names = if need_samples {
            self.export_sample_metric_names(&selected, single_workout)?
        } else {
            Vec::new()
        };
        if !sample_metric_names.is_empty() {
            let where_tail =
                ai_export_samples_where_tail(sample_metric_names.len(), single_workout);
            let mut stmt = self.conn.prepare(&format!(
                "SELECT metric,
                        COUNT(*),
                        COUNT(DISTINCT strftime('%Y-%m-%dT%H', timestamp)),
                        COALESCE(SUM(LENGTH(metric) + LENGTH(timestamp) + LENGTH(unit)
                                     + LENGTH(source_scope) + 48), 0)
                 FROM metric_samples
                 WHERE {where_tail}
                 GROUP BY metric"
            ))?;
            let (utc_lower, utc_upper) = utc_bounds_or_unbounded(&start_text, &end_text);
            let mut bindings: Vec<&dyn rusqlite::ToSql> =
                Vec::with_capacity(sample_metric_names.len() + 4);
            for name in &sample_metric_names {
                bindings.push(name);
            }
            match &workout_window {
                Some((started_at, ended_at)) => {
                    bindings.push(started_at);
                    bindings.push(ended_at);
                }
                None => {
                    bindings.push(&utc_lower);
                    bindings.push(&utc_upper);
                    bindings.push(&start_text);
                    bindings.push(&end_text);
                }
            }
            let rows = stmt.query_map(bindings.as_slice(), |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, i64>(1)?,
                    row.get::<_, i64>(2)?,
                    row.get::<_, i64>(3)?,
                ))
            })?;
            for row in rows {
                let (metric, count, hours, bytes) = row?;
                // 行级归型与 IN 列表的展开是同一个映射，能查到这里的行
                // 一定属于某个选中类型（日级类型也没进 IN 列表），无需再判。
                if !full && HOURLY_AGGREGATED_METRICS.contains(&metric.as_str()) {
                    record_count += hours.max(0) as usize;
                    estimated_bytes += (hours.max(0) as u64).saturating_mul(120);
                } else {
                    record_count += count.max(0) as usize;
                    estimated_bytes += bytes.max(0) as u64;
                }
            }
        }

        if !single_workout
            && (selected.contains("daily_activity")
                || selected.contains("recovery")
                || selected.contains("respiratory_rate")
                || selected.contains("lactate_threshold")
                || selected.contains("pai")
                || selected.contains("hrv_rmssd")
                || selected.contains("steps")
                || selected.contains("spo2")
                || selected.contains("stress")
                || selected.contains("training_load")
                || selected.contains("vo2max")
                || selected.contains("food"))
        {
            let mut stmt = self.conn.prepare(
                "SELECT metric, COUNT(*),
                        COALESCE(SUM(LENGTH(metric) + LENGTH(date) + LENGTH(unit) + 80), 0)
                 FROM daily_metrics WHERE date BETWEEN ?1 AND ?2
                 GROUP BY metric",
            )?;
            let rows = stmt.query_map(params![start_text, end_text], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, i64>(1)?,
                    row.get::<_, i64>(2)?,
                ))
            })?;
            for row in rows {
                let (metric, count, bytes) = row?;
                if daily_metric_selected_for_export(&metric, &selected) {
                    record_count += count.max(0) as usize;
                    estimated_bytes += bytes.max(0) as u64;
                }
            }
        }

        if selected.contains("sleep") && !single_workout {
            let count: i64 = self.conn.query_row(
                "SELECT COUNT(*) FROM sleep_sessions
                 WHERE date(start_time, 'localtime') BETWEEN ?1 AND ?2",
                params![start_text, end_text],
                |row| row.get(0),
            )?;
            record_count += count.max(0) as usize;
            estimated_bytes += (count.max(0) as u64).saturating_mul(280);
        }

        if selected.contains("workouts") {
            // start_time 的 UTC 宽限界走 v33 的 idx_workouts_start；date()
            // 仍是本地日的精修谓词。
            let (utc_lower, utc_upper) = utc_bounds_or_unbounded(&start_text, &end_text);
            let count: i64 = self.conn.query_row(
                "SELECT COUNT(*) FROM workouts
                 WHERE start_time >= ?4 AND start_time < ?5
                   AND date(start_time, 'localtime') BETWEEN ?1 AND ?2
                   AND (?3 IS NULL OR workout_id = ?3)",
                params![start_text, end_text, workout_filter, utc_lower, utc_upper],
                |row| row.get(0),
            )?;
            record_count += count.max(0) as usize;
            estimated_bytes += (count.max(0) as u64).saturating_mul(600);
            if full {
                let samples: i64 = self.conn.query_row(
                    "SELECT COUNT(*) FROM workout_samples
                     WHERE workout_id IN (
                         SELECT workout_id FROM workouts
                         WHERE start_time >= ?4 AND start_time < ?5
                           AND date(start_time, 'localtime') BETWEEN ?1 AND ?2
                           AND (?3 IS NULL OR workout_id = ?3)
                     )",
                    params![start_text, end_text, workout_filter, utc_lower, utc_upper],
                    |row| row.get(0),
                )?;
                let route: i64 = self.conn.query_row(
                    "SELECT COUNT(*) FROM route_points
                     WHERE workout_id IN (
                         SELECT workout_id FROM workouts
                         WHERE start_time >= ?4 AND start_time < ?5
                           AND date(start_time, 'localtime') BETWEEN ?1 AND ?2
                           AND (?3 IS NULL OR workout_id = ?3)
                     )",
                    params![start_text, end_text, workout_filter, utc_lower, utc_upper],
                    |row| row.get(0),
                )?;
                estimated_bytes += (samples.max(0) as u64).saturating_mul(90);
                estimated_bytes += (route.max(0) as u64).saturating_mul(70);
            }
        }

        if selected.contains("life_events") {
            let context_end = workout_window
                .as_ref()
                .and_then(|(_, end)| {
                    DateTime::parse_from_rfc3339(end)
                        .ok()
                        .map(|d| d.with_timezone(&Local).format("%Y-%m-%d").to_string())
                })
                .unwrap_or_else(|| end_text.clone());
            let count: i64 = self.conn.query_row(
                "SELECT COUNT(*) FROM life_events
                 WHERE (?1 IS NULL OR end_date IS NULL OR end_date >= ?1)
                   AND (?2 IS NULL OR start_date <= ?2)",
                params![start_text, context_end],
                |row| row.get(0),
            )?;
            record_count += count.max(0) as usize;
            estimated_bytes += (count.max(0) as u64).saturating_mul(200);
        }

        let (start_time, end_time) = match &workout_window {
            Some((started_at, ended_at)) => (Some(started_at.clone()), Some(ended_at.clone())),
            None => (None, None),
        };
        Ok(ExportEstimate {
            record_count,
            estimated_bytes,
            scope_kind,
            start_time,
            end_time,
        })
    }
}
