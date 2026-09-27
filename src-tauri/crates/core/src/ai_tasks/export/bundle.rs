//! 组装任务包：提示词、任务文档、锚点运动（从 ai_tasks/export.rs 拆出，逻辑不变）。

use super::*;

impl Database {
    /// preview/prepare 共用的构造：覆盖事实、附件状态、警告、出仓文档。
    ///
    /// `attachments` 由调用方先 stat 好传进来——prepare 的 blocked 判定
    /// 和 bundle 用的是同一份附件状态，不再各 stat 一遍。
    pub(super) fn build_ai_task_bundle(
        &self,
        task: &AiTask,
        anchors: &[AnchorWorkout],
        attachments: Vec<AiTaskAttachmentStatus>,
    ) -> Result<AiTaskBundle> {
        // 每个 enabled 窗口类别取一遍数：同一份窗口结果先组装 coverage
        // 事实，再进 document 的 context 日行——两遍查询合并成一遍。
        let mut coverage = Vec::new();
        let mut sections: Vec<(AiTaskCategory, Vec<WindowGather>)> = Vec::new();
        for range in &task.categories {
            if !range.enabled || !range.category.is_windowed() {
                continue;
            }
            let windows = self.gather_category_windows(task, range, anchors)?;
            coverage.extend(window_coverage_rows(range.category, &windows));
            sections.push((range.category, windows));
        }
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
        let document =
            self.build_task_document(task, anchors, &coverage, &attachments, sections)?;
        Ok(AiTaskBundle {
            document,
            briefs,
            coverage,
            attachments,
            warnings,
        })
    }

    /// 提示词拼装：任务说明 + 分析方向（模板）+ 用户的问题 + 覆盖说明，各段可空。
    ///
    /// 任务说明放最前：没写问题、没选模板时，交出去的提示词也得自己说清楚
    /// 要 AI 做什么（以前只剩一句「不要推测缺失」，AI 只能反问）。用户在最终
    /// 提示词里手改过（`override_text`）就用手改的全文替换前三段，覆盖说明照旧追加。
    ///
    /// 模板是全局方向、问题是这次的侧重点，两者**并存**，不再二选一。
    /// 方向段优先用前端本地化好的 `parts.direction`；没传（CLI 等旧调用方）
    /// 时回落到模板自带的 `prompt_template` 中文兜底。后端不产文案。
    pub(super) fn assemble_task_prompt(
        &self,
        task: &AiTask,
        coverage_note: &str,
        parts: &AiTaskPromptParts<'_>,
    ) -> Result<String> {
        let join = |sections: &[String]| {
            sections
                .iter()
                .filter(|part| !part.is_empty())
                .cloned()
                .collect::<Vec<_>>()
                .join("\n\n")
        };
        if let Some(text) = parts
            .override_text
            .map(str::trim)
            .filter(|text| !text.is_empty())
        {
            return Ok(join(&[
                sanitize_export_text(text),
                coverage_note.trim().to_string(),
            ]));
        }
        let direction = match parts
            .direction
            .map(str::trim)
            .filter(|text| !text.is_empty())
        {
            Some(text) => text.to_string(),
            None => match task.template_id.as_deref() {
                Some(template_id) => self
                    .get_ai_task_template(template_id)?
                    .map(|template| template.prompt_template.trim().to_string())
                    .unwrap_or_default(),
                None => String::new(),
            },
        };
        // 用户自写文本（自己的 prompt / 用户模板的 prompt_template）出仓前
        // 先过路径清洗——这份文本会写进交给外部 AI 的 prompt.txt。
        let sections = [
            parts.brief.map(str::trim).unwrap_or_default().to_string(),
            sanitize_export_text(&direction),
            sanitize_export_text(task.prompt.trim()),
            coverage_note.trim().to_string(),
        ];
        Ok(join(&sections))
    }

    /// `health-context.json` 的完整文档。构造时就是干净的：字段逐个挑，
    /// `device_id`/路径/身份键从不在文档里出现。
    ///
    /// `sections` 是 build bundle 时已取好的各窗口类别数据——文档与
    /// coverage 共用同一遍查询结果，不再自己重查。
    pub(super) fn build_task_document(
        &self,
        task: &AiTask,
        anchors: &[AnchorWorkout],
        coverage: &[AiTaskCoverage],
        attachments: &[AiTaskAttachmentStatus],
        sections: Vec<(AiTaskCategory, Vec<WindowGather>)>,
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
        // 窗口锚点：`workouts` = 按每次运动开始日回溯；`today` = 没关联运动，
        // 分析的是截至今天的最近 N 天。
        task_meta.insert(
            "window_anchor".into(),
            json!(if anchors.is_empty() {
                "today"
            } else {
                "workouts"
            }),
        );
        document.insert("task".into(), Value::Object(task_meta));

        // 锚点运动：按 detail_level 决定深度。
        let mut workouts = Vec::with_capacity(anchors.len());
        for anchor in anchors {
            workouts.push(self.anchor_workout_json(&anchor.workout, task)?);
        }
        document.insert("workouts".into(), Value::Array(workouts));

        // 上下文：每个 enabled 窗口类别一组按日条目，(category,date) 已去重。
        // 空窗类别（全空窗、无行）也会产出 `days: []` 一节——与旧实现一致。
        let mut context = Vec::new();
        for (category, gathers) in sections {
            let days = merge_window_gathers(category, gathers);
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
            section.insert("category".into(), serde_json::to_value(category)?);
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
    pub(super) fn anchor_workout_json(&self, workout: &Workout, task: &AiTask) -> Result<Value> {
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
}
