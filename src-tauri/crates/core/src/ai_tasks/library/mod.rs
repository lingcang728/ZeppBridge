//! Prompt 库（批次 7）：任务提示词的版本历史、按类别筛、`.zbprompt` 导出 / 导入。
//!
//! - 版本：每次保存时提示词变了，就把**旧的那一句**记进 `ai_prompt_versions`（v45）。
//!   删任务不删它的历史：撤销删除是把任务原样存回，历史得还在。每个任务只留最近
//!   [`MAX_VERSIONS_PER_TASK`] 条。
//! - `.zbprompt`：一份能分享的问法——标题、提示词、类别和各自的回溯天数、详细程度。
//!   **不带**任何属于这台电脑或这个人的东西：关联的运动、挑出来的具体日子、附件、
//!   个人备注、精确 GPS 开关、MCP 授权。导入的进「已保存的任务」，运动由用户自己再选。

use super::model::*;
use super::AiTaskError;
use crate::models::error::{Result, ZeppBridgeError};
use crate::storage::Database;
use chrono::Utc;
use rusqlite::params;
use serde::{Deserialize, Serialize};

#[cfg(test)]
mod tests;

pub const MAX_VERSIONS_PER_TASK: i64 = 30;
pub const ZBPROMPT_FORMAT: &str = "zbprompt";
pub const ZBPROMPT_VERSION: i64 = 1;
/// 一份 `.zbprompt` 最大多少字节：提示词上限 16 000 字，留足余量。
pub const ZBPROMPT_MAX_BYTES: u64 = 256 * 1024;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AiPromptVersion {
    pub id: i64,
    pub prompt: String,
    /// 这一句被换掉的时间——也就是它最后一次在用的时候。
    pub replaced_at: String,
}

/// `.zbprompt` 文件的形状。字段名就是对外契约，改名要升 `version`。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ZbPrompt {
    pub format: String,
    pub version: i64,
    pub title: String,
    pub prompt: String,
    /// 只有内置模板的 id 才带出去（别人的库里没有你的用户模板）。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub template_id: Option<String>,
    #[serde(default)]
    pub detail_level: AiTaskDetailLevel,
    #[serde(default)]
    pub categories: Vec<AiTaskCategoryRange>,
}

fn bad_file(message: &str) -> ZeppBridgeError {
    ZeppBridgeError::AiTask(AiTaskError::Invalid {
        code: "err.ai_task.bad_prompt_file",
        message: message.into(),
    })
}

/// 这份任务能分享出去的部分。
pub fn to_zbprompt(task: &AiTask, builtin_template: bool) -> ZbPrompt {
    ZbPrompt {
        format: ZBPROMPT_FORMAT.into(),
        version: ZBPROMPT_VERSION,
        title: task.title.clone(),
        prompt: task.prompt.clone(),
        template_id: task.template_id.clone().filter(|_| builtin_template),
        detail_level: task.detail_level,
        categories: portable_categories(task.categories.clone()),
    }
}

/// 个人备注和附件两类本来就是这个人的东西，挑出来的具体日子也是——都不跟着走。
fn portable_categories(categories: Vec<AiTaskCategoryRange>) -> Vec<AiTaskCategoryRange> {
    categories
        .into_iter()
        .filter(|range| {
            !matches!(
                range.category,
                AiTaskCategory::PersonalNote | AiTaskCategory::Attachment
            )
        })
        .map(|range| AiTaskCategoryRange {
            picked_days: Vec::new(),
            ..range
        })
        .collect()
}

/// 读一份 `.zbprompt`：格式对、版本认识、提示词非空，否则拒收。
pub fn parse_zbprompt(text: &str) -> Result<ZbPrompt> {
    let prompt: ZbPrompt = serde_json::from_str(text.trim_start_matches('\u{feff}'))
        .map_err(|_| bad_file("不是 .zbprompt 文件"))?;
    if prompt.format != ZBPROMPT_FORMAT {
        return Err(bad_file("不是 .zbprompt 文件"));
    }
    if prompt.version > ZBPROMPT_VERSION {
        return Err(bad_file("这份 .zbprompt 来自更新的版本"));
    }
    if prompt.prompt.trim().is_empty() {
        return Err(bad_file("这份 .zbprompt 没有提示词"));
    }
    Ok(prompt)
}

impl Database {
    /// 任务保存前调用：提示词变了就把旧的记一笔，并只留最近几条。
    pub(crate) fn remember_prompt_version(
        &self,
        task_id: &str,
        before: &str,
        after: &str,
    ) -> Result<()> {
        if before.trim().is_empty() || before.trim() == after.trim() {
            return Ok(());
        }
        self.conn.execute(
            "INSERT INTO ai_prompt_versions(task_id, prompt, replaced_at) VALUES(?1, ?2, ?3)",
            params![task_id, before, Utc::now().to_rfc3339()],
        )?;
        self.conn.execute(
            "DELETE FROM ai_prompt_versions WHERE task_id = ?1 AND id NOT IN (
                SELECT id FROM ai_prompt_versions WHERE task_id = ?1 ORDER BY id DESC LIMIT ?2)",
            params![task_id, MAX_VERSIONS_PER_TASK],
        )?;
        Ok(())
    }

    /// 一个任务以前用过的提示词，新的在前。
    pub fn ai_prompt_versions(&self, task_id: &str) -> Result<Vec<AiPromptVersion>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, prompt, replaced_at FROM ai_prompt_versions
             WHERE task_id = ?1 ORDER BY id DESC",
        )?;
        let rows = stmt.query_map([task_id], |row| {
            Ok(AiPromptVersion {
                id: row.get(0)?,
                prompt: row.get(1)?,
                replaced_at: row.get(2)?,
            })
        })?;
        Ok(rows.collect::<std::result::Result<_, _>>()?)
    }

    /// 导出一个任务成 `.zbprompt` 的 JSON 文本。
    pub fn export_zbprompt(&self, task_id: &str) -> Result<String> {
        let task = self.require_ai_task(task_id)?;
        let builtin = match task.template_id.as_deref() {
            Some(id) => self
                .get_ai_task_template(id)?
                .is_some_and(|template| template.builtin),
            None => false,
        };
        Ok(serde_json::to_string_pretty(&to_zbprompt(&task, builtin))?)
    }

    /// 导入一份 `.zbprompt`：存成一个没有关联运动的新任务（同样的问法已存在就更新那一条）。
    pub fn import_zbprompt(&self, text: &str) -> Result<AiTask> {
        let prompt = parse_zbprompt(text)?;
        let template_id = match prompt.template_id {
            Some(id) => self
                .get_ai_task_template(&id)?
                .filter(|template| template.builtin)
                .map(|template| template.id),
            None => None,
        };
        let title = match prompt.title.trim() {
            "" => prompt.prompt.trim().chars().take(40).collect(),
            title => title.to_string(),
        };
        self.save_ai_task(&AiTask {
            schema_version: AI_TASK_SCHEMA_VERSION,
            id: String::new(),
            title,
            template_id,
            workout_ids: Vec::new(),
            categories: portable_categories(prompt.categories),
            detail_level: prompt.detail_level,
            prompt: prompt.prompt,
            personal_note: String::new(),
            attachments: Vec::new(),
            include_precise_gps: false,
            mcp_shared: false,
            created_at: String::new(),
            updated_at: String::new(),
        })
    }
}
