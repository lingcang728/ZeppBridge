//! `ai_tasks` / `ai_task_templates` 的读写与校验。
//!
//! 表是「JSON 载荷 + 索引列」：列表、授权筛选走列；完整对象走 `payload`。
//! 写库只发生在命令层拿到 `WritePurpose::Metadata` 写锁之后——这里假设
//! 调用方已经持有写锁（与 `life_events` 的约定一致）。

use super::model::*;
use super::AiTaskError;
use crate::models::error::{Result, ZeppBridgeError};
use crate::storage::Database;
use chrono::Utc;
use rusqlite::{params, OptionalExtension};
use std::collections::BTreeSet;
use std::path::Path;

// 输入上限。这些数不是产品约束，是「一条坏输入别把库撑爆/把界面卡死」的底线：
// 64 个运动 × 365 天的窗口已经覆盖任何真实任务。
const MAX_TITLE_CHARS: usize = 200;
const MAX_NAME_CHARS: usize = 200;
const MAX_PROMPT_CHARS: usize = 16_000;
const MAX_NOTE_CHARS: usize = 4_000;
const MAX_WORKOUT_IDS: usize = 64;
const MAX_ID_CHARS: usize = 200;
const MAX_ATTACHMENTS: usize = 16;
const MAX_PATH_CHARS: usize = 1_024;
const MAX_CATEGORIES: usize = 16;
const MAX_DAYS_BEFORE: i64 = 365;
const MAX_EXCLUDED_METRICS: usize = 64;

fn random_hex(bytes: usize) -> String {
    let mut buffer = vec![0u8; bytes];
    if getrandom::getrandom(&mut buffer).is_err() {
        // 熵源失败时退到时间戳，前缀随机性本来就是防碰撞不是防猜。
        return format!("{:x}", Utc::now().timestamp_nanos_opt().unwrap_or_default());
    }
    hex::encode(buffer)
}

/// 任务保存前的校验与归一化。不合法 → `err.ai_task.invalid`。
///
/// 归一化做的三件事：schema_version 钉回 1、workout_ids/categories 去重
/// （保持首个出现的顺序）、`template_id` 空串归一为 `None`。
/// `id`/`created_at`/`updated_at` 不在这里动——那是 `save_ai_task` 的事。
pub(crate) fn normalize_task(task: &AiTask) -> Result<AiTask> {
    normalize_task_impl(task, true)
}

/// 预览/准备用的草稿校验：同一份规则，但允许空标题与空 id——
/// 未保存的草稿也应该能预览。
pub(crate) fn normalize_task_draft(task: &AiTask) -> Result<AiTask> {
    normalize_task_impl(task, false)
}

fn normalize_task_impl(task: &AiTask, require_title: bool) -> Result<AiTask> {
    let invalid = |message: &str| AiTaskError::invalid_task(message);
    let mut task = task.clone();

    if require_title && task.title.trim().is_empty() {
        return Err(invalid("任务标题不能为空"));
    }
    if task.id.chars().count() > MAX_ID_CHARS {
        return Err(invalid("任务 id 过长"));
    }
    if task.title.chars().count() > MAX_TITLE_CHARS {
        return Err(invalid("任务标题过长"));
    }
    if task.prompt.chars().count() > MAX_PROMPT_CHARS {
        return Err(invalid("提示词过长"));
    }
    if task.personal_note.chars().count() > MAX_NOTE_CHARS {
        return Err(invalid("个人备注过长"));
    }
    if task.workout_ids.len() > MAX_WORKOUT_IDS {
        return Err(invalid("一次任务最多关联 64 条运动"));
    }
    let mut seen_ids = BTreeSet::new();
    task.workout_ids.retain(|id| {
        let id = id.trim();
        !id.is_empty() && id.chars().count() <= MAX_ID_CHARS && seen_ids.insert(id.to_string())
    });
    // retain 里拿到的是原字符串的借用，去重判定用的是 trim 后的副本；
    // 这里再把每个 id 本身也规整成 trim 后的样子。
    for id in &mut task.workout_ids {
        *id = id.trim().to_string();
    }

    normalize_categories(&mut task.categories).map_err(|m| invalid(&m))?;

    if task.attachments.len() > MAX_ATTACHMENTS {
        return Err(invalid("附件最多 16 个"));
    }
    for attachment in &task.attachments {
        if attachment.id.trim().is_empty()
            || attachment.path.trim().is_empty()
            || attachment.display_name.trim().is_empty()
        {
            return Err(invalid("附件缺少 id、路径或文件名"));
        }
        if attachment.path.chars().count() > MAX_PATH_CHARS
            || attachment.display_name.chars().count() > MAX_NAME_CHARS
            || attachment.id.chars().count() > MAX_ID_CHARS
        {
            return Err(invalid("附件字段过长"));
        }
        if attachment.byte_len.is_some_and(|len| len < 0) {
            return Err(invalid("附件大小不能为负"));
        }
    }

    task.template_id = task
        .template_id
        .take()
        .and_then(|id| (!id.trim().is_empty()).then_some(id));
    task.schema_version = AI_TASK_SCHEMA_VERSION;
    Ok(task)
}

/// 模板保存前的校验与归一化。不合法 → `err.ai_template.invalid`。
pub(crate) fn normalize_template(template: &AiTaskTemplate) -> Result<AiTaskTemplate> {
    let invalid = |message: &str| AiTaskError::invalid_template(message);
    let mut template = template.clone();

    if template.name.trim().is_empty() {
        return Err(invalid("模板名称不能为空"));
    }
    if template.name.chars().count() > MAX_NAME_CHARS {
        return Err(invalid("模板名称过长"));
    }
    if template.prompt_template.chars().count() > MAX_PROMPT_CHARS {
        return Err(invalid("模板提示词过长"));
    }
    normalize_categories(&mut template.categories).map_err(|m| invalid(&m))?;

    template.schema_version = AI_TASK_SCHEMA_VERSION;
    Ok(template)
}

/// categories 的公共校验：去重（同类别只留第一个）、days_before 限界。
fn normalize_categories(
    categories: &mut Vec<AiTaskCategoryRange>,
) -> std::result::Result<(), String> {
    if categories.len() > MAX_CATEGORIES {
        return Err("类别设置过多".to_string());
    }
    let mut seen = BTreeSet::new();
    let mut deduped = Vec::with_capacity(categories.len());
    for mut range in categories.drain(..) {
        if range.excluded_metrics.len() > MAX_EXCLUDED_METRICS {
            return Err("排除的指标过多".to_string());
        }
        let mut seen_metrics = BTreeSet::new();
        range.excluded_metrics = range
            .excluded_metrics
            .iter()
            .map(|metric| metric.trim().to_string())
            .filter(|metric| {
                !metric.is_empty()
                    && metric.chars().count() <= MAX_ID_CHARS
                    && seen_metrics.insert(metric.clone())
            })
            .collect();
        if !(0..=MAX_DAYS_BEFORE).contains(&range.days_before) {
            return Err(format!(
                "回溯天数必须在 0–{MAX_DAYS_BEFORE} 之间（{:?} = {}）",
                range.category, range.days_before
            ));
        }
        if seen.insert(range.category) {
            deduped.push(range);
        }
    }
    *categories = deduped;
    Ok(())
}

impl Database {
    /// P3 `ai_task_list`：只走索引列，不解析 payload。
    pub fn list_ai_tasks(&self) -> Result<Vec<AiTaskSummary>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, title, template_id, workout_count, mcp_shared, updated_at
             FROM ai_tasks ORDER BY updated_at DESC, id",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(AiTaskSummary {
                id: row.get(0)?,
                title: row.get(1)?,
                template_id: row.get(2)?,
                workout_count: row.get(3)?,
                mcp_shared: row.get::<_, i64>(4)? != 0,
                updated_at: row.get(5)?,
            })
        })?;
        Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
    }

    /// `ai_task_get` 命令语义的完整版：不存在 → `err.ai_task.not_found`。
    /// 放在 core 是因为 `AiTaskError::task_not_found` 是 `pub(crate)`，
    /// 命令层拿不到——码和 params 的唯一定义点留在这边。
    pub fn require_ai_task(&self, id: &str) -> Result<AiTask> {
        self.get_ai_task(id)?
            .ok_or_else(|| AiTaskError::task_not_found(id))
    }

    pub fn get_ai_task(&self, id: &str) -> Result<Option<AiTask>> {
        let payload: Option<String> = self
            .conn
            .query_row("SELECT payload FROM ai_tasks WHERE id = ?1", [id], |row| {
                row.get(0)
            })
            .optional()?;
        payload
            .map(|payload| {
                serde_json::from_str::<AiTask>(&payload).map_err(|error| {
                    ZeppBridgeError::ParseError(format!("ai_tasks[{id}] 的 payload 损坏: {error}"))
                })
            })
            .transpose()
    }

    /// P3 `ai_task_save`：upsert。后端填 id 与时间戳；`mcp_shared` 开关
    /// 也在这一条命令里（P3 定稿没有单独的 set_mcp_shared）。
    pub fn save_ai_task(&self, task: &AiTask) -> Result<AiTask> {
        let mut task = normalize_task(task)?;
        let now = Utc::now().to_rfc3339();
        if task.id.is_empty() {
            task.id = self.new_ai_task_id()?;
            task.created_at = now.clone();
        } else {
            task.created_at = self
                .get_ai_task(&task.id)?
                .map(|existing| existing.created_at)
                .filter(|created| !created.is_empty())
                .unwrap_or_else(|| now.clone());
        }
        task.updated_at = now;

        let payload = serde_json::to_string(&task)
            .map_err(|error| ZeppBridgeError::ParseError(format!("ai_task 序列化失败: {error}")))?;
        self.conn.execute(
            "INSERT INTO ai_tasks
                (id, title, template_id, payload, workout_count, mcp_shared, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
             ON CONFLICT(id) DO UPDATE SET
                title = excluded.title,
                template_id = excluded.template_id,
                payload = excluded.payload,
                workout_count = excluded.workout_count,
                mcp_shared = excluded.mcp_shared,
                updated_at = excluded.updated_at",
            params![
                task.id,
                task.title,
                task.template_id,
                payload,
                task.workout_ids.len() as i64,
                task.mcp_shared as i64,
                task.created_at,
                task.updated_at,
            ],
        )?;
        Ok(task)
    }

    /// P3 `ai_task_delete`：只删任务行，附件原件不动。
    pub fn delete_ai_task(&self, id: &str) -> Result<()> {
        let removed = self
            .conn
            .execute("DELETE FROM ai_tasks WHERE id = ?1", [id])?;
        if removed == 0 {
            return Err(AiTaskError::task_not_found(id));
        }
        Ok(())
    }

    /// P3 `ai_template_list`：内置模板在前。
    pub fn list_ai_task_templates(&self) -> Result<Vec<AiTaskTemplate>> {
        let mut stmt = self.conn.prepare(
            "SELECT payload FROM ai_task_templates
             ORDER BY builtin DESC, updated_at DESC, id",
        )?;
        let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
        let mut templates = Vec::new();
        for row in rows {
            let payload = row?;
            let template = serde_json::from_str::<AiTaskTemplate>(&payload).map_err(|error| {
                ZeppBridgeError::ParseError(format!("ai_task_templates 的 payload 损坏: {error}"))
            })?;
            templates.push(template);
        }
        Ok(templates)
    }

    pub fn get_ai_task_template(&self, id: &str) -> Result<Option<AiTaskTemplate>> {
        let payload: Option<String> = self
            .conn
            .query_row(
                "SELECT payload FROM ai_task_templates WHERE id = ?1",
                [id],
                |row| row.get(0),
            )
            .optional()?;
        payload
            .map(|payload| {
                serde_json::from_str::<AiTaskTemplate>(&payload).map_err(|error| {
                    ZeppBridgeError::ParseError(format!(
                        "ai_task_templates[{id}] 的 payload 损坏: {error}"
                    ))
                })
            })
            .transpose()
    }

    /// P3 `ai_template_save`：内置模板只读；`builtin=true` 的新 id 一律拒绝——
    /// 内置标志只允许来自迁移种子，用户侧只能「另存为」出 builtin=false 的副本。
    pub fn save_ai_task_template(&self, template: &AiTaskTemplate) -> Result<AiTaskTemplate> {
        if let Some(existing) = self.get_ai_task_template(&template.id)? {
            if existing.builtin {
                return Err(AiTaskError::builtin_readonly());
            }
        }
        let mut template = normalize_template(template)?;
        if template.builtin {
            return Err(AiTaskError::invalid_template(
                "builtin 标志只属于内置模板；请把模板另存为普通用户模板",
            ));
        }
        // name_code / prompt_code 是内置种子的本地化句柄，用户模板没有对应词条，
        // 存进来只会指到不存在的码——剥掉，让界面按原文渲染。
        template.name_code = None;
        template.prompt_code = None;

        let now = Utc::now().to_rfc3339();
        if template.id.is_empty() {
            template.id = self.new_ai_template_id()?;
            template.created_at = now.clone();
        } else {
            template.created_at = self
                .get_ai_task_template(&template.id)?
                .map(|existing| existing.created_at)
                .filter(|created| !created.is_empty())
                .unwrap_or_else(|| now.clone());
        }
        template.updated_at = now;

        let payload = serde_json::to_string(&template).map_err(|error| {
            ZeppBridgeError::ParseError(format!("ai_task_template 序列化失败: {error}"))
        })?;
        self.conn.execute(
            "INSERT INTO ai_task_templates (id, builtin, name, payload, created_at, updated_at)
             VALUES (?1, 0, ?2, ?3, ?4, ?5)
             ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                payload = excluded.payload,
                updated_at = excluded.updated_at",
            params![
                template.id,
                template.name,
                payload,
                template.created_at,
                template.updated_at,
            ],
        )?;
        Ok(template)
    }

    /// P3 `ai_template_delete`：内置模板 → `err.ai_template.builtin_readonly`；
    /// 不存在 → `err.ai_template.not_found`。
    pub fn delete_ai_task_template(&self, id: &str) -> Result<()> {
        match self.get_ai_task_template(id)? {
            Some(template) if template.builtin => {
                return Err(AiTaskError::builtin_readonly());
            }
            Some(_) => {}
            None => return Err(AiTaskError::template_not_found(id)),
        }
        self.conn
            .execute("DELETE FROM ai_task_templates WHERE id = ?1", [id])?;
        Ok(())
    }

    /// `mcp_shared=1` 的任务全量载荷。目前由 `access::shared_task_grants`
    /// 直接按表读（防御性解析，缺表/坏行按零授权处理）；本函数保留给
    /// 需要整模型而非授权最小子集的调用方。
    #[allow(dead_code)]
    pub(crate) fn mcp_shared_ai_tasks(&self) -> Result<Vec<AiTask>> {
        let mut stmt = self
            .conn
            .prepare("SELECT payload FROM ai_tasks WHERE mcp_shared = 1")?;
        let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
        let mut tasks = Vec::new();
        for row in rows {
            let payload = row?;
            let task = serde_json::from_str::<AiTask>(&payload).map_err(|error| {
                ZeppBridgeError::ParseError(format!("ai_tasks 中共享任务的 payload 损坏: {error}"))
            })?;
            tasks.push(task);
        }
        Ok(tasks)
    }

    /// 分配一个不撞库的 `task-*` id。
    fn new_ai_task_id(&self) -> Result<String> {
        for _ in 0..8 {
            let id = format!("task-{}", random_hex(8));
            if self.get_ai_task(&id)?.is_none() {
                return Ok(id);
            }
        }
        Err(ZeppBridgeError::Busy("无法分配唯一的任务 id".into()))
    }

    fn new_ai_template_id(&self) -> Result<String> {
        for _ in 0..8 {
            let id = format!("tmpl-{}", random_hex(8));
            if self.get_ai_task_template(&id)?.is_none() {
                return Ok(id);
            }
        }
        Err(ZeppBridgeError::Busy("无法分配唯一的模板 id".into()))
    }
}

/// P3 `ai_task_attachment_stat`：只看文件元数据，不读内容。
///
/// 这是**本机**检查——返回里带 `path` 是合法的（UI 要核对用户给的文件）。
/// 它跟出仓的 `AiTaskAttachmentPublicRef` 不是一回事。
pub fn stat_attachment_paths(paths: &[String]) -> Vec<AiTaskAttachmentStat> {
    paths
        .iter()
        .map(|path| match std::fs::metadata(Path::new(path)) {
            Ok(meta) => AiTaskAttachmentStat {
                path: path.clone(),
                exists: true,
                byte_len: Some(meta.len() as i64),
                mtime: meta
                    .modified()
                    .ok()
                    .map(|time| chrono::DateTime::<Utc>::from(time).to_rfc3339()),
            },
            Err(_) => AiTaskAttachmentStat {
                path: path.clone(),
                exists: false,
                byte_len: None,
                mtime: None,
            },
        })
        .collect()
}
