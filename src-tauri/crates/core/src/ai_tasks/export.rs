//! 任务级出仓构造：`health-context.json` 的文档、预览事实、文件落盘。
//!
//! 原则（A7-P2/P4）：
//! - **构造时就是干净的**：这份文档从字段挑选开始，不含 `device_id`、
//!   本机路径或任何身份键——不靠事后 `redact` 兜底。
//! - 窗口按 P4：每个锚点运动以本地开始日独立开窗，重叠窗口的
//!   `(category, date)` 在 day 汇总里去重，`linked_workout_ids` 保留
//!   覆盖该日的所有锚点。
//! - `include_precise_gps=false` 时 route 键根本不出现（不是空数组）。
//! - `detail_level` 的梯度只影响锚点运动对象：summary=核心汇总，
//!   standard=+完整汇总列，detailed=+逐点 samples/pauses/splits/laps。
//!   上下文 day 序列三种级别都给日度粒度。

use super::coverage::{category_metric_specs, category_windows, AnchorWorkout};
use super::model::*;
use super::store::normalize_task_draft;
use super::AiTaskError;
use crate::models::error::Result;
use crate::models::Workout;
use crate::paths::write_file_atomically;
use crate::storage::{loaded_stage_minutes, Database, MetricSource};
use chrono::Utc;
use rusqlite::params;
use serde_json::{json, Map, Value};
use std::collections::{BTreeMap, BTreeSet};
use std::path::Path;

/// preview 与 prepare 共用的构建结果——两边数字必须出自同一份构造。
pub(crate) struct AiTaskBundle {
    pub document: Value,
    pub briefs: Vec<AiTaskWorkoutBrief>,
    pub coverage: Vec<AiTaskCoverage>,
    pub attachments: Vec<AiTaskAttachmentStatus>,
    pub warnings: Vec<AiTaskIssue>,
}

/// 未保存草稿走预览/准备时的展示 id 与目录名。
const DRAFT_TASK_ID: &str = "draft";

impl Database {
    /// P3 `ai_task_preview`：草稿可预览——校验宽松（空标题/id 合法），
    /// 但 `workout_ids` 里不存在的运动仍是硬错误 `err.ai_task.workout_not_found`。
    pub fn ai_task_preview(&self, task: &AiTask) -> Result<AiTaskPreview> {
        let task = normalize_task_draft(task)?;
        let anchors = self.ai_task_anchors(&task.workout_ids)?;
        let bundle = self.build_ai_task_bundle(&task, &anchors)?;
        // 估算必须和 `ai_task_prepare` 实写用同一种序列化（pretty）——
        // 不然界面预览的字节数跟落盘文件对不上。
        let estimated_bytes = serde_json::to_string_pretty(&bundle.document)?.len() as i64;
        Ok(AiTaskPreview {
            task_id: effective_task_id(&task),
            workouts: bundle.briefs,
            coverage: bundle.coverage,
            attachments: bundle.attachments,
            estimated_bytes,
            warnings: bundle.warnings,
        })
    }

    /// P3 `ai_task_prepare`：把交接文件写到
    /// `<output_root>/<task_id>/{health-context.json, prompt.txt}`。
    ///
    /// `output_root` 由命令层传入 `data_dir/exports/ai-tasks`。blocked 时
    /// 一个文件都不写。
    pub fn ai_task_prepare(
        &self,
        task: &AiTask,
        coverage_note: &str,
        output_root: &Path,
    ) -> Result<AiTaskPrepareResult> {
        let task = normalize_task_draft(task)?;
        let anchors = self.ai_task_anchors(&task.workout_ids)?;
        let attachments = stat_task_attachments(&task.attachments);
        let prompt_text = self.assemble_task_prompt(&task, coverage_note)?;

        let mut blocked: Vec<AiTaskIssue> = Vec::new();
        if anchors.is_empty() {
            blocked.push(AiTaskIssue::new(
                "ui.ai_task.blocked.no_workouts",
                "任务还没有关联任何运动",
            ));
        }
        for (attachment, status) in task.attachments.iter().zip(attachments.iter()) {
            if status.status == AiTaskAttachmentState::Missing {
                // P2 定稿点名的码：`missing` 附件在 blocked 里列
                // `err.ai_task.attachment_missing`（其余 blocked 用 ui.*）。
                blocked.push(
                    AiTaskIssue::new(
                        "err.ai_task.attachment_missing",
                        format!("附件文件已不在原位置：{}", attachment.display_name),
                    )
                    .with_params(serde_json::json!({ "display_name": attachment.display_name })),
                );
            }
        }
        // 选不出任何内容（没有窗口类别、没有附件、没有文字）时，交付出来
        // 的只会是个空壳——这种 blocked 不是数据缺失，是没东西可给。
        let nothing_to_export = !task.categories.iter().any(|range| range.enabled)
            && task.attachments.is_empty()
            && task.personal_note.trim().is_empty();
        if nothing_to_export && !anchors.is_empty() {
            blocked.push(AiTaskIssue::new(
                "ui.ai_task.blocked.empty",
                "当前选择覆盖不到任何数据，请先调整类别或运动范围",
            ));
        }

        let task_id = effective_task_id(&task);
        let output_dir = output_root.join(sanitize_dir_component(&task_id));
        let output_dir_text = output_dir.to_string_lossy().into_owned();

        if !blocked.is_empty() {
            return Ok(AiTaskPrepareResult {
                status: AiTaskPrepareStatus::Blocked,
                task_id,
                output_dir: output_dir_text,
                json_path: None,
                prompt_path: None,
                prompt_text,
                byte_len: 0,
                attachments,
                blocked,
            });
        }

        let bundle = self.build_ai_task_bundle(&task, &anchors)?;
        let json_text = serde_json::to_string_pretty(&bundle.document)
            .map_err(|error| AiTaskError::write_failed(format!("序列化交接数据失败: {error}")))?;
        let byte_len = json_text.len() as i64;

        std::fs::create_dir_all(&output_dir).map_err(|error| {
            AiTaskError::write_failed(format!(
                "创建交接目录 {} 失败: {error}",
                output_dir.display()
            ))
        })?;
        let json_path = output_dir.join("health-context.json");
        let prompt_path = output_dir.join("prompt.txt");
        write_file_atomically(&json_path, json_text.as_bytes())
            .map_err(|error| AiTaskError::write_failed(format!("写入交接 JSON 失败: {error}")))?;
        write_file_atomically(&prompt_path, prompt_text.as_bytes())
            .map_err(|error| AiTaskError::write_failed(format!("写入提示词文件失败: {error}")))?;

        Ok(AiTaskPrepareResult {
            status: AiTaskPrepareStatus::Ready,
            task_id,
            output_dir: output_dir_text,
            json_path: Some(json_path.to_string_lossy().into_owned()),
            prompt_path: Some(prompt_path.to_string_lossy().into_owned()),
            prompt_text,
            byte_len,
            attachments: bundle.attachments,
            blocked: Vec::new(),
        })
    }

    /// preview/prepare 共用的构造：覆盖事实、附件状态、警告、出仓文档。
    fn build_ai_task_bundle(
        &self,
        task: &AiTask,
        anchors: &[AnchorWorkout],
    ) -> Result<AiTaskBundle> {
        let coverage = self.ai_task_coverage(task, anchors)?;
        let attachments = stat_task_attachments(&task.attachments);
        let briefs: Vec<AiTaskWorkoutBrief> = anchors
            .iter()
            .map(|anchor| AiTaskWorkoutBrief {
                workout_id: anchor.workout.workout_id.clone(),
                workout_type: anchor.workout.effective_type.clone(),
                start_time: anchor.workout.start_time.to_rfc3339(),
                end_time: anchor.workout.end_time.to_rfc3339(),
                start_date: anchor.local_start_day.to_string(),
                distance_meters: anchor.workout.distance_meters,
                calories: anchor.workout.calories,
                avg_hr: anchor.workout.avg_hr,
                max_hr: anchor.workout.max_hr,
            })
            .collect();
        let warnings = task_warnings(task, &coverage, &attachments);
        let document = self.build_task_document(task, anchors, &coverage, &attachments)?;
        Ok(AiTaskBundle {
            document,
            briefs,
            coverage,
            attachments,
            warnings,
        })
    }

    /// 提示词拼装：用户提示词为空时回落到模板的 `prompt_template`
    /// （`prompt_code` 是界面词条句柄，后端拿不到本地化文本，模板自带的
    /// 中文是这层唯一可用的兜底）；再 verbatim 附加前端本地化好的
    /// `coverage_note` 段。后端不产文案。
    fn assemble_task_prompt(&self, task: &AiTask, coverage_note: &str) -> Result<String> {
        let mut prompt = task.prompt.trim().to_string();
        if prompt.is_empty() {
            if let Some(template_id) = task.template_id.as_deref() {
                if let Some(template) = self.get_ai_task_template(template_id)? {
                    prompt = template.prompt_template.trim().to_string();
                }
            }
        }
        // 用户自写文本（自己的 prompt / 用户模板的 prompt_template）出仓前
        // 先过路径清洗——这份文本会写进交给外部 AI 的 prompt.txt。
        let mut prompt = sanitize_export_text(&prompt);
        let note = coverage_note.trim();
        if !note.is_empty() {
            if !prompt.is_empty() {
                prompt.push_str("\n\n");
            }
            prompt.push_str(note);
        }
        Ok(prompt)
    }

    /// `health-context.json` 的完整文档。构造时就是干净的：字段逐个挑，
    /// `device_id`/路径/身份键从不在文档里出现。
    fn build_task_document(
        &self,
        task: &AiTask,
        anchors: &[AnchorWorkout],
        coverage: &[AiTaskCoverage],
        attachments: &[AiTaskAttachmentStatus],
    ) -> Result<Value> {
        let mut document = Map::new();
        document.insert("schema".into(), json!("zeppbridge.ai_task"));
        document.insert("schema_version".into(), json!(AI_TASK_SCHEMA_VERSION));
        document.insert("generated_at".into(), json!(Utc::now().to_rfc3339()));

        // task 元信息：prompt 不进 JSON——它在 prompt.txt / prompt_text 里。
        let mut task_meta = Map::new();
        task_meta.insert("id".into(), json!(effective_task_id(task)));
        task_meta.insert("title".into(), json!(task.title));
        task_meta.insert(
            "detail_level".into(),
            serde_json::to_value(task.detail_level)?,
        );
        task_meta.insert("template_id".into(), json!(task.template_id));
        task_meta.insert(
            "personal_note".into(),
            json!(sanitize_export_text(&task.personal_note)),
        );
        task_meta.insert(
            "include_precise_gps".into(),
            json!(task.include_precise_gps),
        );
        document.insert("task".into(), Value::Object(task_meta));

        // 锚点运动：按 detail_level 决定深度。
        let mut workouts = Vec::with_capacity(anchors.len());
        for anchor in anchors {
            workouts.push(self.anchor_workout_json(&anchor.workout, task)?);
        }
        document.insert("workouts".into(), Value::Array(workouts));

        // 上下文：每个 enabled 窗口类别一组按日条目，(category,date) 已去重。
        let mut context = Vec::new();
        for range in &task.categories {
            if !range.enabled || !range.category.is_windowed() {
                continue;
            }
            let days = self.gather_category_days(task, range, anchors)?;
            let mut day_entries = Vec::with_capacity(days.len());
            for (date, acc) in days {
                let mut entry = Map::new();
                entry.insert("date".into(), json!(date));
                entry.insert(
                    "linked_workout_ids".into(),
                    json!(acc.linked.into_iter().collect::<Vec<_>>()),
                );
                if !acc.metrics.is_empty() {
                    entry.insert("metrics".into(), Value::Array(acc.metrics));
                }
                if !acc.sleeps.is_empty() {
                    entry.insert("sleeps".into(), Value::Array(acc.sleeps));
                }
                if !acc.workouts.is_empty() {
                    entry.insert("workouts".into(), Value::Array(acc.workouts));
                }
                day_entries.push(Value::Object(entry));
            }
            let mut section = Map::new();
            section.insert("category".into(), serde_json::to_value(range.category)?);
            section.insert("days".into(), Value::Array(day_entries));
            context.push(Value::Object(section));
        }
        document.insert("context".into(), Value::Array(context));

        document.insert("coverage".into(), serde_json::to_value(coverage)?);

        // 附件只列出仓形态（display_name/kind/byte_len）。
        let public_refs: Vec<AiTaskAttachmentPublicRef> = task
            .attachments
            .iter()
            .map(AiTaskAttachmentPublicRef::from)
            .collect();
        let _ = attachments; // 状态已在 preview/prepare 结果里，文档只放 PublicRef。
        document.insert("attachments".into(), serde_json::to_value(public_refs)?);

        // 文档级单位表：锚点运动与睡眠条目的固定字段单位。指标的单位在
        // 每条 metric 条目上内联。
        let mut units = Map::new();
        for (field, unit) in [
            ("distance_meters", "m"),
            ("moving_seconds", "s"),
            ("calories", "kcal"),
            ("avg_hr", "bpm"),
            ("max_hr", "bpm"),
            ("min_hr", "bpm"),
            ("training_load", "load"),
            ("vo2max", "ml/kg/min"),
            ("training_effect", "score"),
            ("anaerobic_training_effect", "score"),
            ("rpe", "score"),
            ("total_steps", "步"),
            ("avg_cadence_spm", "spm"),
            ("max_cadence_spm", "spm"),
            ("avg_stride_cm", "cm"),
            ("elevation_gain_m", "m"),
            ("elevation_loss_m", "m"),
            ("max_altitude_m", "m"),
            ("min_altitude_m", "m"),
            ("duration_minutes", "min"),
            ("deep_minutes", "min"),
            ("light_minutes", "min"),
            ("rem_minutes", "min"),
            ("awake_minutes", "min"),
            ("wake_count", "count"),
            ("pace", "min/km"),
            ("speed", "m/s"),
            ("cadence", "spm"),
            ("power_watts", "W"),
            ("altitude_m", "m"),
            ("latitude", "deg"),
            ("longitude", "deg"),
        ] {
            units.insert(field.to_string(), json!(unit));
        }
        document.insert("units".into(), Value::Object(units));

        Ok(Value::Object(document))
    }

    /// 锚点运动的出仓对象。从 [`Workout`] 逐字段挑——`device_id`、
    /// `synced_at`、`zepp_*` 这类内部列不带出去。
    fn anchor_workout_json(&self, workout: &Workout, task: &AiTask) -> Result<Value> {
        let mut object = Map::new();
        object.insert("workout_id".into(), json!(workout.workout_id));
        object.insert("workout_type".into(), json!(workout.effective_type));
        object.insert("start_time".into(), json!(workout.start_time.to_rfc3339()));
        object.insert("end_time".into(), json!(workout.end_time.to_rfc3339()));
        if let Some(value) = workout.distance_meters {
            object.insert("distance_meters".into(), json!(value));
        }
        if let Some(value) = workout.calories {
            object.insert("calories".into(), json!(value));
        }
        if let Some(value) = workout.avg_hr {
            object.insert("avg_hr".into(), json!(value));
        }
        if let Some(value) = workout.max_hr {
            object.insert("max_hr".into(), json!(value));
        }

        if task.detail_level == AiTaskDetailLevel::Summary {
            return Ok(Value::Object(object));
        }

        // standard 起：完整汇总列。
        for (key, value) in [
            ("min_hr", workout.min_hr.map(|v| json!(v))),
            ("total_steps", workout.total_steps.map(|v| json!(v))),
            ("moving_seconds", workout.moving_seconds.map(|v| json!(v))),
            (
                "elevation_gain_m",
                workout.elevation_gain_m.map(|v| json!(v)),
            ),
            (
                "elevation_loss_m",
                workout.elevation_loss_m.map(|v| json!(v)),
            ),
            ("max_altitude_m", workout.max_altitude_m.map(|v| json!(v))),
            ("min_altitude_m", workout.min_altitude_m.map(|v| json!(v))),
            ("training_load", workout.training_load.map(|v| json!(v))),
            ("vo2max", workout.vo2max.map(|v| json!(v))),
            ("training_effect", workout.training_effect.map(|v| json!(v))),
            (
                "anaerobic_training_effect",
                workout.anaerobic_training_effect.map(|v| json!(v)),
            ),
            ("rpe", workout.rpe.map(|v| json!(v))),
            ("avg_cadence_spm", workout.avg_cadence_spm.map(|v| json!(v))),
            ("max_cadence_spm", workout.max_cadence_spm.map(|v| json!(v))),
            ("avg_stride_cm", workout.avg_stride_cm.map(|v| json!(v))),
        ] {
            if let Some(value) = value {
                object.insert(key.into(), value);
            }
        }
        if !workout.hr_zones.is_empty() {
            object.insert("hr_zones".into(), serde_json::to_value(&workout.hr_zones)?);
        }
        object.insert("sample_count".into(), json!(workout.sample_count));
        object.insert("gps_available".into(), json!(workout.gps_available));
        object.insert("source_scope".into(), json!(workout.source_scope.as_str()));

        if task.detail_level == AiTaskDetailLevel::Detailed {
            let series = self.get_workout_series(&workout.workout_id)?;
            let mut series_json = Map::new();
            series_json.insert("samples".into(), serde_json::to_value(&series.samples)?);
            series_json.insert("pauses".into(), serde_json::to_value(&series.pauses)?);
            series_json.insert("splits".into(), serde_json::to_value(&series.splits)?);
            series_json.insert("laps".into(), serde_json::to_value(&series.laps)?);
            series_json.insert("summary".into(), serde_json::to_value(&series.summary)?);
            if task.include_precise_gps {
                series_json.insert("route".into(), serde_json::to_value(&series.route)?);
            }
            object.insert("series".into(), Value::Object(series_json));
        }
        Ok(Value::Object(object))
    }

    /// 一个窗口类别的逐日数据。同一天可能被多个锚点窗口覆盖——
    /// `(category, date)` 只出现一次，`linked` 记所有覆盖它的锚点；
    /// 同日同条目（同一 metric / 同一 sleep_id / 同一 workout_id）去重。
    fn gather_category_days(
        &self,
        task: &AiTask,
        range: &AiTaskCategoryRange,
        anchors: &[AnchorWorkout],
    ) -> Result<BTreeMap<String, DayAcc>> {
        let mut days: BTreeMap<String, DayAcc> = BTreeMap::new();
        let mut seen: BTreeSet<(String, String)> = BTreeSet::new();
        for (workout_id, start, end) in category_windows(range, anchors) {
            let start_text = start.to_string();
            let end_text = end.to_string();
            match range.category {
                AiTaskCategory::Workout => {
                    for (day, row_id, row) in self.workout_day_rows(&start_text, &end_text)? {
                        let acc = days.entry(day.clone()).or_default();
                        acc.linked.insert(workout_id.clone());
                        if seen.insert((day, format!("w:{row_id}"))) {
                            acc.workouts.push(row);
                        }
                    }
                }
                AiTaskCategory::Sleep => {
                    for (day, row_id, row) in self.sleep_day_rows(
                        &start_text,
                        &end_text,
                        task.detail_level == AiTaskDetailLevel::Detailed,
                    )? {
                        let acc = days.entry(day.clone()).or_default();
                        acc.linked.insert(workout_id.clone());
                        if seen.insert((day, format!("s:{row_id}"))) {
                            acc.sleeps.push(row);
                        }
                    }
                }
                _ => {
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
                        };
                        for point in points {
                            let acc = days.entry(point.date.clone()).or_default();
                            acc.linked.insert(workout_id.clone());
                            if seen.insert((point.date.clone(), spec.metric.to_string())) {
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
                                acc.metrics.push(Value::Object(metric));
                            }
                        }
                    }
                }
            }
        }
        Ok(days)
    }

    /// 窗口内的运动日条目，返回 `(本地日, workout_id, 出仓对象)`——
    /// `workout_id` 单列出来供重叠窗口去重。`workout_type` 取用户修正优先
    /// 的 effective 值。
    fn workout_day_rows(&self, start: &str, end: &str) -> Result<Vec<(String, String, Value)>> {
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
            object.insert("source_scope".into(), json!(row.get::<_, String>(12)?));
            Ok((row.get::<_, String>(13)?, workout_id, Value::Object(object)))
        })?;
        Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
    }

    /// 窗口内的睡眠日条目（按醒来日归属），返回 `(归属日, sleep_id, 出仓
    /// 对象)`。`device_id` 不进文档。
    fn sleep_day_rows(
        &self,
        start: &str,
        end: &str,
        include_stages: bool,
    ) -> Result<Vec<(String, String, Value)>> {
        let mut stmt = self.conn.prepare(
            "SELECT sleep_id, start_time, end_time, score, duration_minutes,
                    deep_minutes, deep_available, light_minutes, light_available,
                    rem_minutes, rem_available, awake_minutes, awake_available,
                    source_scope, wake_count, date(end_time,'localtime')
             FROM sleep_sessions
             WHERE date(end_time,'localtime') BETWEEN ?1 AND ?2
             ORDER BY end_time",
        )?;
        let mut rows: Vec<(String, String, Value)> = Vec::new();
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
        for row in mapped {
            let (
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
            ) = row?;
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
                let stages = self.load_sleep_stages(&sleep_id)?;
                if !stages.is_empty() {
                    object.insert("stages".into(), serde_json::to_value(&stages)?);
                }
            }
            rows.push((day, sleep_id, Value::Object(object)));
        }
        Ok(rows)
    }
}

/// 一天的窗口数据桶。`linked` 记覆盖这一天的所有锚点运动 id。
#[derive(Default)]
pub(crate) struct DayAcc {
    pub linked: BTreeSet<String>,
    pub metrics: Vec<Value>,
    pub sleeps: Vec<Value>,
    pub workouts: Vec<Value>,
}

/// 任务在 IPC/目录里使用的有效 id：草稿（空 id）叫 `draft`。
fn effective_task_id(task: &AiTask) -> String {
    let id = task.id.trim();
    if id.is_empty() {
        DRAFT_TASK_ID.to_string()
    } else {
        id.to_string()
    }
}

/// 出仓用户文本的本地路径清洗：Windows 盘符路径、UNC 路径与 Unix 绝对
/// 路径换成占位符。与命令层 `commands::data::sanitize_clipboard_text`
/// 同一实现的最小移植——core 不能回拉 Tauri 适配层的函数，行为保持同级：
/// 只在词边界起步认路径（`https://` 这类 URL 不会被误伤）。
fn sanitize_export_text(text: &str) -> String {
    let mut output = String::with_capacity(text.len());
    let mut chars = text.chars().peekable();
    while let Some(character) = chars.next() {
        let previous = output.chars().last();
        let at_boundary = previous.is_none()
            || previous.is_some_and(|value| {
                value.is_whitespace() || matches!(value, '"' | '\'' | '(' | '[' | '{' | '=')
            });
        let is_windows_drive = at_boundary
            && character.is_ascii_alphabetic()
            && chars.peek() == Some(&':')
            && chars
                .clone()
                .nth(1)
                .is_some_and(|next| next == '\\' || next == '/');
        let is_unc = at_boundary && character == '\\' && chars.peek() == Some(&'\\');
        let is_unix =
            at_boundary && character == '/' && chars.peek().is_some_and(|next| *next != ' ');
        if is_windows_drive || is_unc || is_unix {
            output.push_str("[本地路径已移除]");
            if is_windows_drive {
                let _ = chars.next();
            }
            while let Some(next) = chars.peek() {
                if next.is_whitespace() || *next == '"' || *next == '\'' || *next == ')' {
                    break;
                }
                let _ = chars.next();
            }
        } else {
            output.push(character);
        }
    }
    output
}

/// 目录名片段：只留 ASCII 字母数字与 `-_.`，其它折成 `_`；
/// 两端去 `.`（`..`/尾随点在 Windows 上有特殊含义），空了回退 `task`。
fn sanitize_dir_component(id: &str) -> String {
    let cleaned: String = id
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.') {
                c
            } else {
                '_'
            }
        })
        .collect();
    let trimmed = cleaned.trim_matches('.');
    if trimmed.is_empty() {
        "task".to_string()
    } else {
        trimmed.to_string()
    }
}

/// preview/prepare 共用的附件核对：`missing`（找不到）、`changed`
/// （实测大小与加入时记的 `byte_len` 基线不同）。
///
/// `byte_len=None` 的基线表示「加入时没记大小」，只能判断在不在，
/// 不能判断变没变——存在即 `ok`。
pub(crate) fn stat_task_attachments(
    attachments: &[AiTaskAttachmentRef],
) -> Vec<AiTaskAttachmentStatus> {
    attachments
        .iter()
        .map(|attachment| {
            let meta = std::fs::metadata(&attachment.path).ok();
            let byte_len = meta.as_ref().map(|m| m.len() as i64);
            let status = match (&meta, attachment.byte_len) {
                (None, _) => AiTaskAttachmentState::Missing,
                (Some(_), Some(baseline)) if baseline != byte_len.unwrap_or_default() => {
                    AiTaskAttachmentState::Changed
                }
                (Some(_), _) => AiTaskAttachmentState::Ok,
            };
            AiTaskAttachmentStatus {
                id: attachment.id.clone(),
                status,
                byte_len,
            }
        })
        .collect()
}

/// preview 的 warnings：状态不是异常，走 `ui.ai_task.*` / 定稿点名的
/// `err.ai_task.attachment_missing` 码——码表以 S4 `copy.ts` 的注册为准，
/// 新码要先在那边落地。
///
/// 覆盖警告按类别折叠：一个类别的所有窗口都没数据 → 一条
/// `warn.category_missing`；有数据但没盖满 → `warn.partial_coverage`。
/// 合并行（`workout_id=None`）优先于逐运动行，避免同一类别刷两次。
fn task_warnings(
    task: &AiTask,
    coverage: &[AiTaskCoverage],
    attachments: &[AiTaskAttachmentStatus],
) -> Vec<AiTaskIssue> {
    let mut warnings = Vec::new();
    if task.workout_ids.is_empty() {
        warnings.push(AiTaskIssue::new(
            "ui.ai_task.blocked.no_workouts",
            "任务还没有关联任何运动",
        ));
    }
    for (attachment, status) in task.attachments.iter().zip(attachments.iter()) {
        let name = attachment.display_name.clone();
        let params = || serde_json::json!({ "display_name": name });
        match status.status {
            AiTaskAttachmentState::Missing => warnings.push(
                AiTaskIssue::new(
                    "err.ai_task.attachment_missing",
                    format!("附件文件已不在原位置：{name}"),
                )
                .with_params(params()),
            ),
            AiTaskAttachmentState::Changed => warnings.push(
                AiTaskIssue::new(
                    "ui.ai_task.warn.attachment_changed",
                    format!("附件内容与添加时不同：{name}"),
                )
                .with_params(params()),
            ),
            AiTaskAttachmentState::Ok => {}
        }
    }
    // 覆盖警告按类别折叠：合并行（workout_id=None）是去重后的真值，
    // 优先用它；只有逐运动行时才聚合（窗口互不重叠时两者等价）。
    let mut by_category: BTreeMap<AiTaskCategory, Vec<&AiTaskCoverage>> = BTreeMap::new();
    for row in coverage {
        by_category.entry(row.category).or_default().push(row);
    }
    for (category, rows) in by_category {
        let (days_with_data, days_in_range, missing) =
            match rows.iter().find(|row| row.workout_id.is_none()) {
                Some(row) => (row.days_with_data, row.days_in_range, row.missing),
                None => (
                    rows.iter().map(|row| row.days_with_data).sum(),
                    rows.iter().map(|row| row.days_in_range).sum(),
                    rows.iter().all(|row| row.missing),
                ),
            };
        if missing {
            warnings.push(
                AiTaskIssue::new(
                    "ui.ai_task.warn.category_missing",
                    "这一类别在所选时间窗内没有数据，导出里会如实标注缺失",
                )
                .with_params(serde_json::json!({ "category": category })),
            );
        } else if days_with_data < days_in_range {
            warnings.push(
                AiTaskIssue::new(
                    "ui.ai_task.warn.partial_coverage",
                    "时间窗内只有部分日期有数据",
                )
                .with_params(serde_json::json!({
                    "category": category,
                    "days_with_data": days_with_data,
                    "days_in_range": days_in_range,
                })),
            );
        }
    }
    warnings
}
