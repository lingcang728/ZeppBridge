//! 按类别收集时间窗里的数据：运动日行、睡眠日行、分阶段（从 ai_tasks/export.rs 拆出，逻辑不变）。

use super::*;

impl Database {
    /// 一个窗口类别在所有锚点窗口上的一遍取数：每个窗口产出一个
    /// [`WindowGather`]，coverage 的 days/sources 与 document 的日行
    /// 在这里同时累计，不再让两边各查一遍。
    pub(super) fn gather_category_windows(
        &self,
        task: &AiTask,
        range: &AiTaskCategoryRange,
        anchors: &[AnchorWorkout],
    ) -> Result<Vec<WindowGather>> {
        let mut gathers = Vec::new();
        let excluded = &range.excluded_metrics;
        let is_excluded = |name: &str| excluded.iter().any(|metric| metric == name);
        let field_units = category_units(range.category);
        for (workout_id, start, end) in category_windows(range, anchors, Local::now().date_naive())
        {
            let start_text = start.to_string();
            let end_text = end.to_string();
            let mut gather = WindowGather {
                workout_id,
                start,
                end,
                covered_days: BTreeSet::new(),
                sources: BTreeSet::new(),
                metric_days: BTreeMap::new(),
                rows: Vec::new(),
            };
            // 运动/睡眠：一行是一条记录，指标是它的字段。逐字段记天数，
            // 被排除的字段从出仓对象里删掉（记录本身仍在）。
            let push_record = |gather: &mut WindowGather,
                               day: String,
                               key: String,
                               source_scope: String,
                               mut row: Value| {
                if let Value::Object(object) = &mut row {
                    for field in field_units.keys() {
                        if object.contains_key(field) {
                            gather
                                .metric_days
                                .entry(field.clone())
                                .or_default()
                                .insert(day.clone());
                        }
                        if is_excluded(field) {
                            object.remove(field);
                        }
                    }
                }
                gather.covered_days.insert(day.clone());
                gather.sources.insert(source_scope);
                gather.rows.push((day, key, row));
            };
            match range.category {
                AiTaskCategory::Workout => {
                    for (day, row_id, source_scope, row) in
                        self.workout_day_rows(&start_text, &end_text)?
                    {
                        push_record(&mut gather, day, format!("w:{row_id}"), source_scope, row);
                    }
                }
                AiTaskCategory::Sleep => {
                    for (day, row_id, source_scope, row) in self.sleep_day_rows(
                        &start_text,
                        &end_text,
                        task.detail_level == AiTaskDetailLevel::Detailed,
                    )? {
                        push_record(&mut gather, day, format!("s:{row_id}"), source_scope, row);
                    }
                }
                _ => {
                    // 指标类别的出仓行不带 source_scope——coverage 仍走
                    // `category_window_days` 的 days+sources 查询，与旧实现
                    // 同式同结果；document 行仍按 spec 取 points。
                    let (days, sources) = self.category_window_days(
                        range.category,
                        &start_text,
                        &end_text,
                        excluded,
                    )?;
                    gather.covered_days = days;
                    gather.sources = sources;
                    for spec in category_metric_specs(range.category) {
                        let points = match spec.source {
                            MetricSource::Daily(spread) => self.daily_metric_points(
                                spec.metric,
                                spread,
                                &start_text,
                                &end_text,
                            )?,
                            MetricSource::Samples => {
                                self.sample_metric_points(spec.metric, &start_text, &end_text)?
                            }
                            MetricSource::SleepScores => {
                                self.sleep_score_points(&start_text, &end_text)?
                            }
                        };
                        for point in points {
                            gather
                                .metric_days
                                .entry(spec.metric.to_string())
                                .or_default()
                                .insert(point.date.clone());
                            if is_excluded(spec.metric) {
                                continue;
                            }
                            let mut metric = Map::new();
                            metric.insert("metric".into(), json!(spec.metric));
                            metric.insert("unit".into(), json!(spec.unit));
                            metric.insert("value".into(), json!(point.value));
                            if let Some(min) = point.min {
                                metric.insert("min".into(), json!(min));
                            }
                            if let Some(max) = point.max {
                                metric.insert("max".into(), json!(max));
                            }
                            if let Some(samples) = point.samples {
                                metric.insert("samples".into(), json!(samples));
                            }
                            gather.rows.push((
                                point.date,
                                spec.metric.to_string(),
                                Value::Object(metric),
                            ));
                        }
                    }
                }
            }
            gathers.push(gather);
        }
        Ok(gathers)
    }

    /// 窗口内的运动日条目，返回 `(本地日, workout_id, source_scope, 出仓
    /// 对象)`——`workout_id` 单列出来供重叠窗口去重，`source_scope` 同时
    /// 进 coverage 的 sources 与出仓对象本身。`workout_type` 取用户修正
    /// 优先的 effective 值。
    pub(super) fn workout_day_rows(
        &self,
        start: &str,
        end: &str,
    ) -> Result<Vec<(String, String, String, Value)>> {
        let mut stmt = self.conn.prepare(
            "SELECT workout_id, COALESCE(workout_type_override, workout_type),
                    start_time, end_time, distance_meters, moving_seconds,
                    calories, avg_hr, max_hr, min_hr, training_load, vo2max,
                    source_scope, date(start_time,'localtime')
             FROM workouts
             WHERE date(start_time,'localtime') BETWEEN ?1 AND ?2
             ORDER BY start_time",
        )?;
        let rows = stmt.query_map(params![start, end], |row| {
            let workout_id: String = row.get(0)?;
            let source_scope: String = row.get(12)?;
            let mut object = Map::new();
            object.insert("workout_id".into(), json!(workout_id));
            object.insert("workout_type".into(), json!(row.get::<_, String>(1)?));
            object.insert("start_time".into(), json!(row.get::<_, String>(2)?));
            object.insert("end_time".into(), json!(row.get::<_, String>(3)?));
            for (index, key) in [
                (4, "distance_meters"),
                (5, "moving_seconds"),
                (6, "calories"),
                (7, "avg_hr"),
                (8, "max_hr"),
                (9, "min_hr"),
                (10, "training_load"),
                (11, "vo2max"),
            ] {
                if let Some(value) = row.get::<_, Option<f64>>(index)? {
                    object.insert(key.into(), json!(value));
                }
            }
            object.insert("source_scope".into(), json!(source_scope.clone()));
            Ok((
                row.get::<_, String>(13)?,
                workout_id,
                source_scope,
                Value::Object(object),
            ))
        })?;
        Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
    }

    /// 窗口内的睡眠日条目（按醒来日归属），返回 `(归属日, sleep_id,
    /// source_scope, 出仓对象)`。`device_id` 不进文档。
    pub(super) fn sleep_day_rows(
        &self,
        start: &str,
        end: &str,
        include_stages: bool,
    ) -> Result<Vec<(String, String, String, Value)>> {
        let mut stmt = self.conn.prepare(
            "SELECT sleep_id, start_time, end_time, score, duration_minutes,
                    deep_minutes, deep_available, light_minutes, light_available,
                    rem_minutes, rem_available, awake_minutes, awake_available,
                    source_scope, wake_count, date(end_time,'localtime')
             FROM sleep_sessions_shown
             WHERE date(end_time,'localtime') BETWEEN ?1 AND ?2
             ORDER BY end_time",
        )?;
        let mapped = stmt.query_map(params![start, end], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, Option<i32>>(3)?,
                row.get::<_, i32>(4)?,
                row.get::<_, i32>(5)?,
                row.get::<_, i64>(6)?,
                row.get::<_, i32>(7)?,
                row.get::<_, i64>(8)?,
                row.get::<_, i32>(9)?,
                row.get::<_, i64>(10)?,
                row.get::<_, i32>(11)?,
                row.get::<_, i64>(12)?,
                row.get::<_, String>(13)?,
                row.get::<_, Option<i32>>(14)?,
                row.get::<_, String>(15)?,
            ))
        })?;
        let mut raw_rows = Vec::new();
        for row in mapped {
            raw_rows.push(row?);
        }
        // detailed 的阶段片一遍 IN 取回——逐 session `load_sleep_stages`
        // 是典型 N+1（窗口内每晚一条查询）。
        let stage_map = if include_stages {
            self.load_sleep_stages_batch(
                &raw_rows.iter().map(|row| row.0.clone()).collect::<Vec<_>>(),
            )?
        } else {
            BTreeMap::new()
        };

        let mut rows: Vec<(String, String, String, Value)> = Vec::new();
        for (
            sleep_id,
            start_time,
            end_time,
            score,
            duration_minutes,
            deep_minutes,
            deep_available,
            light_minutes,
            light_available,
            rem_minutes,
            rem_available,
            awake_minutes,
            awake_available,
            source_scope,
            wake_count,
            day,
        ) in raw_rows
        {
            let mut object = Map::new();
            object.insert("sleep_id".into(), json!(sleep_id));
            object.insert("start_time".into(), json!(start_time));
            object.insert("end_time".into(), json!(end_time));
            if let Some(value) = score {
                object.insert("score".into(), json!(value));
            }
            object.insert("duration_minutes".into(), json!(duration_minutes));
            for (key, value) in [
                (
                    "deep_minutes",
                    loaded_stage_minutes(deep_minutes, deep_available),
                ),
                (
                    "light_minutes",
                    loaded_stage_minutes(light_minutes, light_available),
                ),
                (
                    "rem_minutes",
                    loaded_stage_minutes(rem_minutes, rem_available),
                ),
                (
                    "awake_minutes",
                    loaded_stage_minutes(awake_minutes, awake_available),
                ),
            ] {
                if let Some(value) = value {
                    object.insert(key.into(), json!(value));
                }
            }
            if let Some(value) = wake_count {
                object.insert("wake_count".into(), json!(value));
            }
            object.insert("source_scope".into(), json!(source_scope));
            if include_stages {
                if let Some(stages) = stage_map.get(&sleep_id) {
                    if !stages.is_empty() {
                        object.insert("stages".into(), serde_json::to_value(stages)?);
                    }
                }
            }
            rows.push((day, sleep_id, source_scope, Value::Object(object)));
        }
        Ok(rows)
    }

    /// `load_sleep_stages` 的批量版：`sleep_id IN (...)` 一遍取回后按
    /// sleep_id 分桶；桶内顺序与单条版一致（`ORDER BY start_time, id`）。
    pub(super) fn load_sleep_stages_batch(
        &self,
        sleep_ids: &[String],
    ) -> Result<BTreeMap<String, Vec<SleepStageSlice>>> {
        let mut map: BTreeMap<String, Vec<SleepStageSlice>> = BTreeMap::new();
        if sleep_ids.is_empty() {
            return Ok(map);
        }
        let placeholders = sleep_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let mut stmt = self.conn.prepare(&format!(
            "SELECT sleep_id, stage, start_time, end_time, raw_mode
             FROM sleep_stages WHERE sleep_id IN ({placeholders})
             ORDER BY sleep_id, start_time, id"
        ))?;
        let rows = stmt.query_map(params_from_iter(sleep_ids.iter()), |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, Option<i64>>(4)?,
            ))
        })?;
        for row in rows {
            let (sleep_id, stage, start, end, raw_mode) = row?;
            map.entry(sleep_id).or_default().push(SleepStageSlice {
                stage,
                start_time: parse_rfc3339_utc(&start, "sleep_stages.start_time")?,
                end_time: parse_rfc3339_utc(&end, "sleep_stages.end_time")?,
                raw_mode,
            });
        }
        Ok(map)
    }
}
