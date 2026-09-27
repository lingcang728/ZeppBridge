use super::coverage::{
    category_metric_specs, category_units, category_windows, parse_rfc3339_utc,
    window_coverage_rows, AnchorWorkout,
};

use super::model::*;

use super::store::normalize_task_draft;

use super::AiTaskError;

use crate::models::error::Result;

use crate::models::{SleepStageSlice, Workout};

use crate::paths::write_file_atomically;

use crate::storage::{loaded_stage_minutes, Database, MetricSource};

use chrono::{DateTime, Local, NaiveDate, Utc};

use rusqlite::{params, params_from_iter};

use serde_json::{json, Map, Value};

use std::collections::{BTreeMap, BTreeSet};

use std::path::{Path, PathBuf};

mod bundle;
mod gather;
mod helpers;

pub(crate) use helpers::*;

/// preview 与 prepare 共用的构建结果——两边数字必须出自同一份构造。
pub(crate) struct AiTaskBundle {
    pub document: Value,
    pub briefs: Vec<AiTaskWorkoutBrief>,
    pub coverage: Vec<AiTaskCoverage>,
    pub attachments: Vec<AiTaskAttachmentStatus>,
    pub warnings: Vec<AiTaskIssue>,
}

/// 一个锚点窗口的一遍取数结果：coverage 要的 days/sources 与 document
/// 要的日行出自同一份查询（H4：原来 coverage 与 `gather_category_days`
/// 对同一窗口各查一遍）。
///
/// workout/sleep 类别的 days/sources 直接从行上累计；指标类别的出仓行
/// 不带 `source_scope`（`daily_metric_points`/`sample_metric_points` 不
/// 回传），它的 days/sources 仍走 `category_window_days` 的专用查询——
/// 指标类别因此保持与旧实现相同的查询次数，没有变差。
pub(crate) struct WindowGather {
    /// `None` = 任务没有关联运动，窗口锚在今天。
    pub workout_id: Option<String>,
    pub start: NaiveDate,
    pub end: NaiveDate,
    /// 窗口内「有数据的本地日」集合与命中的 `source_scope` 集合，
    /// 去重粒度即 P4 的 `(category, date)`。
    pub covered_days: BTreeSet<String>,
    pub sources: BTreeSet<String>,
    /// 逐指标（运动/睡眠为逐字段）有数据的本地日，含被排除的指标。
    pub metric_days: BTreeMap<String, BTreeSet<String>>,
    /// document 行：`(本地日, 去重键, 出仓对象)`。去重键是
    /// `w:<workout_id>` / `s:<sleep_id>` / 指标名，跨窗口合并时用。
    pub rows: Vec<(String, String, Value)>,
}

/// 提示词与文件名里由前端按界面语言整理好的几段——后端不产文案，只拼接和清洗。
/// 全部可空：CLI 等旧调用方什么都不传，行为与以前一致。
#[derive(Debug, Default, Clone, Copy)]
pub struct AiTaskPromptParts<'a> {
    /// 「任务说明」段：数据是什么、文件怎么读、没写问题时默认做什么、直接开始分析。放最前。
    pub brief: Option<&'a str>,
    /// 「分析方向」段（模板）。没传时回落到模板自带的 prompt_template。
    pub direction: Option<&'a str>,
    /// 用户在最终提示词里手改过的整段：替换 任务说明 + 方向 + 问题 三段，覆盖说明仍追加在后。
    pub override_text: Option<&'a str>,
    /// 数据文件主名（不含扩展名）；空 = 旧名 `health-context`。
    pub data_stem: Option<&'a str>,
    /// 提示词文件主名（不含扩展名）；空 = 旧名 `prompt`。
    pub prompt_stem: Option<&'a str>,
}

/// `ai_task_prepare_plan` 的产物：读侧全部完成、只差文件落盘。
/// 命令层先拿它在只读连接上跑构建，再把 `finish()` 放到阻塞线程上——
/// 写出的文件不占数据库连接，也不需要跨进程写锁。
pub struct AiTaskPreparePlan {
    task_id: String,
    output_dir: PathBuf,
    /// 数据文件与提示词文件的文件名（已清洗、带扩展名）。
    json_name: String,
    prompt_name: String,
    prompt_text: String,
    attachments: Vec<AiTaskAttachmentStatus>,
    blocked: Vec<AiTaskIssue>,
    /// ready 时必有；blocked 时为空。
    json_text: Option<String>,
    /// 要复制进 `attachments/` 的原件：`(本机源路径, 展示名)`。
    attachment_sources: Vec<(PathBuf, String)>,
}

impl AiTaskPreparePlan {
    /// 写侧：纯文件 IO，不碰数据库。blocked 时什么都不写（连目录都不建）。
    pub fn finish(self) -> Result<AiTaskPrepareResult> {
        let output_dir_text = self.output_dir.to_string_lossy().into_owned();
        if !self.blocked.is_empty() {
            return Ok(AiTaskPrepareResult {
                status: AiTaskPrepareStatus::Blocked,
                task_id: self.task_id,
                output_dir: output_dir_text,
                json_path: None,
                prompt_path: None,
                prompt_text: self.prompt_text,
                byte_len: 0,
                copied_attachments: 0,
                attachments: self.attachments,
                blocked: self.blocked,
            });
        }
        // 不变式：blocked 为空 ⇒ plan 一定带了序列化好的文档。
        let json_text = self
            .json_text
            .ok_or_else(|| AiTaskError::write_failed("缺少交接 JSON 内容"))?;
        let byte_len = json_text.len() as i64;

        std::fs::create_dir_all(&self.output_dir).map_err(|error| {
            AiTaskError::write_failed(format!(
                "创建交接目录 {} 失败: {error}",
                self.output_dir.display()
            ))
        })?;
        let json_path = self.output_dir.join(&self.json_name);
        let prompt_path = self.output_dir.join(&self.prompt_name);
        write_file_atomically(&json_path, json_text.as_bytes())
            .map_err(|error| AiTaskError::write_failed(format!("写入交接 JSON 失败: {error}")))?;
        write_file_atomically(&prompt_path, self.prompt_text.as_bytes())
            .map_err(|error| AiTaskError::write_failed(format!("写入提示词文件失败: {error}")))?;
        let copied_attachments = copy_attachments(&self.output_dir, &self.attachment_sources)?;

        Ok(AiTaskPrepareResult {
            status: AiTaskPrepareStatus::Ready,
            task_id: self.task_id,
            output_dir: output_dir_text,
            json_path: Some(json_path.to_string_lossy().into_owned()),
            prompt_path: Some(prompt_path.to_string_lossy().into_owned()),
            prompt_text: self.prompt_text,
            byte_len,
            copied_attachments,
            attachments: self.attachments,
            blocked: Vec::new(),
        })
    }
}

/// 把附件原件复制进 `<output_dir>/attachments/`，让用户一次拖完。
/// 文件名取展示名（清洗掉 Windows 不允许的字符），重名追加 ` (2)`。
fn copy_attachments(output_dir: &Path, sources: &[(PathBuf, String)]) -> Result<i64> {
    if sources.is_empty() {
        return Ok(0);
    }
    let dir = output_dir.join("attachments");
    std::fs::create_dir_all(&dir)
        .map_err(|error| AiTaskError::write_failed(format!("创建附件目录失败: {error}")))?;
    let mut used = BTreeSet::new();
    for (source, display_name) in sources {
        let name = unique_file_name(&sanitize_file_name(display_name, "attachment"), &mut used);
        std::fs::copy(source, dir.join(&name)).map_err(|error| {
            AiTaskError::write_failed(format!("复制附件 {display_name} 失败: {error}"))
        })?;
    }
    Ok(sources.len() as i64)
}

/// 数据文件与提示词文件的最终文件名：前端给的主名按 Windows 规则清洗；
/// 没给就用旧名；两个主名清洗后撞了，提示词那个加后缀，不会互相覆盖。
fn export_file_names(parts: &AiTaskPromptParts<'_>) -> (String, String) {
    let stem = |value: Option<&str>, fallback: &str| {
        value
            .map(str::trim)
            .filter(|text| !text.is_empty())
            .map(|text| sanitize_file_name(text, fallback))
            .unwrap_or_else(|| fallback.to_string())
    };
    let data = stem(parts.data_stem, "health-context");
    let mut prompt = stem(parts.prompt_stem, "prompt");
    if prompt.to_lowercase() == data.to_lowercase() {
        prompt = format!("{data}_prompt");
    }
    (format!("{data}.json"), format!("{prompt}.txt"))
}

fn unique_file_name(name: &str, used: &mut BTreeSet<String>) -> String {
    let lower = |value: &str| value.to_lowercase();
    if used.insert(lower(name)) {
        return name.to_string();
    }
    let (stem, ext) = match name.rfind('.') {
        Some(index) if index > 0 => (&name[..index], &name[index..]),
        _ => (name, ""),
    };
    (2..)
        .map(|n| format!("{stem} ({n}){ext}"))
        .find(|candidate| used.insert(lower(candidate)))
        .expect("总能找到不重名的文件名")
}

/// 未保存草稿走预览/准备时的展示 id 与目录名。
const DRAFT_TASK_ID: &str = "draft";

impl Database {
    /// P3 `ai_task_preview`：草稿可预览——校验宽松（空标题/id 合法），
    /// 但 `workout_ids` 里不存在的运动仍是硬错误 `err.ai_task.workout_not_found`。
    pub fn ai_task_preview(&self, task: &AiTask) -> Result<AiTaskPreview> {
        let task = normalize_task_draft(task)?;
        let anchors = self.ai_task_anchors(&task.workout_ids)?;
        let attachments = stat_task_attachments(&task.attachments);
        let bundle = self.build_ai_task_bundle(&task, &anchors, attachments)?;
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
    /// `<output_root>/<任务名>_<yyyyMMdd-HHmm>/{health-context.json, prompt.txt, attachments/}`。
    ///
    /// `output_root` 由命令层决定（桌面 `ZeppBridge AI`，取不到时
    /// `data_dir/exports/ai-tasks`）。blocked 时一个文件都不写。
    ///
    /// 拆成 [`Self::ai_task_prepare_plan`]（读侧）+ [`AiTaskPreparePlan::finish`]
    /// （写侧）两步：命令层据此只在读侧占数据库连接，文件落盘不持锁。
    /// 需要一条调用走完的调用方（测试）继续用这个薄封装。
    pub fn ai_task_prepare(
        &self,
        task: &AiTask,
        coverage_note: &str,
        output_root: &Path,
    ) -> Result<AiTaskPrepareResult> {
        self.ai_task_prepare_plan(
            task,
            coverage_note,
            &AiTaskPromptParts::default(),
            output_root,
        )?
        .finish()
    }

    /// `ai_task_prepare` 的读侧：校验、锚点解析、附件核对、提示词拼装、
    /// blocked 判定与 bundle 构建（含 JSON 序列化）全部在这里完成；
    /// 返回的 [`AiTaskPreparePlan`] 只剩纯文件落盘，不再碰库。
    ///
    /// `parts`：前端按界面语言整理好的任务说明 / 方向 / 手改全文与文件名，
    /// 与 `coverage_note` 同一种做法——后端不产文案，只拼接和清洗。
    pub fn ai_task_prepare_plan(
        &self,
        task: &AiTask,
        coverage_note: &str,
        parts: &AiTaskPromptParts<'_>,
        output_root: &Path,
    ) -> Result<AiTaskPreparePlan> {
        let task = normalize_task_draft(task)?;
        let anchors = self.ai_task_anchors(&task.workout_ids)?;
        let attachments = stat_task_attachments(&task.attachments);
        let prompt_text = self.assemble_task_prompt(&task, coverage_note, parts)?;
        let (json_name, prompt_name) = export_file_names(parts);

        // 没有关联运动不再拦：窗口锚在今天，分析的就是「最近 N 天」。
        let mut blocked: Vec<AiTaskIssue> = Vec::new();
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
        if nothing_to_export {
            blocked.push(AiTaskIssue::new(
                "ui.ai_task.blocked.empty",
                "当前选择覆盖不到任何数据，请先调整类别或运动范围",
            ));
        }

        let task_id = effective_task_id(&task);
        let output_dir = output_root.join(export_folder_name(&task, &task_id, Local::now()));

        if !blocked.is_empty() {
            return Ok(AiTaskPreparePlan {
                task_id,
                output_dir,
                json_name,
                prompt_name,
                prompt_text,
                attachments,
                blocked,
                json_text: None,
                attachment_sources: Vec::new(),
            });
        }

        let bundle = self.build_ai_task_bundle(&task, &anchors, attachments)?;
        let json_text = serde_json::to_string_pretty(&bundle.document)
            .map_err(|error| AiTaskError::write_failed(format!("序列化交接数据失败: {error}")))?;
        let attachment_sources = task
            .attachments
            .iter()
            .map(|reference| {
                (
                    PathBuf::from(&reference.path),
                    reference.display_name.clone(),
                )
            })
            .collect();

        Ok(AiTaskPreparePlan {
            task_id,
            output_dir,
            json_name,
            prompt_name,
            prompt_text,
            attachments: bundle.attachments,
            blocked: Vec::new(),
            json_text: Some(json_text),
            attachment_sources,
        })
    }
}

#[cfg(test)]
mod tests;
