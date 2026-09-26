//! 合并时间窗、文本与文件名清洗、附件统计、任务警告（从 ai_tasks/export.rs 拆出，逻辑不变）。

use super::*;

/// 把一个类别的各锚点窗口行合并成按日桶。同一天可能被多个锚点窗口
/// 覆盖——`(category, date)` 只出现一次，`linked` 记所有覆盖它的锚点；
/// 同日同条目（同一 metric / 同一 sleep_id / 同一 workout_id）去重。
pub(super) fn merge_window_gathers(
    category: AiTaskCategory,
    gathers: Vec<WindowGather>,
) -> BTreeMap<String, DayAcc> {
    let mut days: BTreeMap<String, DayAcc> = BTreeMap::new();
    let mut seen: BTreeSet<(String, String)> = BTreeSet::new();
    for gather in gathers {
        for (day, key, row) in gather.rows {
            let acc = days.entry(day.clone()).or_default();
            if let Some(workout_id) = &gather.workout_id {
                acc.linked.insert(workout_id.clone());
            }
            if !seen.insert((day, key)) {
                continue;
            }
            match category {
                AiTaskCategory::Workout => acc.workouts.push(row),
                AiTaskCategory::Sleep => acc.sleeps.push(row),
                _ => acc.metrics.push(row),
            }
        }
    }
    days
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
pub(super) fn effective_task_id(task: &AiTask) -> String {
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
pub(super) fn sanitize_export_text(text: &str) -> String {
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

/// 文件/目录名片段：保留中文等可读字符，只把 Windows 不允许的
/// `<>:"/\|?*` 与控制字符折成 `_`；两端去空格和 `.`（尾随点在 Windows
/// 上会被吞掉），保留设备名（CON、COM1…）前加 `_`，截到 60 个字符，
/// 空了回退 `fallback`。
pub(super) fn sanitize_file_name(name: &str, fallback: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| {
            if c.is_control() || matches!(c, '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*') {
                '_'
            } else {
                c
            }
        })
        .collect();
    let trimmed: String = cleaned
        .trim_matches(|c: char| c == '.' || c.is_whitespace())
        .chars()
        .take(60)
        .collect();
    let trimmed = trimmed.trim_end_matches(|c: char| c == '.' || c.is_whitespace());
    if trimmed.is_empty() {
        return fallback.to_string();
    }
    let stem = trimmed
        .split('.')
        .next()
        .unwrap_or_default()
        .to_ascii_uppercase();
    let reserved = matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || ((stem.starts_with("COM") || stem.starts_with("LPT"))
            && stem.len() == 4
            && stem.as_bytes()[3].is_ascii_digit());
    if reserved {
        format!("_{trimmed}")
    } else {
        trimmed.to_string()
    }
}

/// 导出文件夹名：`<任务名>_<yyyyMMdd-HHmm>`。每次导出一个新文件夹，
/// 不覆盖上一次交给 AI 的那份；标题为空时用任务 id（草稿是 `draft`）。
pub(super) fn export_folder_name(task: &AiTask, task_id: &str, now: DateTime<Local>) -> String {
    let base = if task.title.trim().is_empty() {
        task_id
    } else {
        task.title.trim()
    };
    format!(
        "{}_{}",
        sanitize_file_name(base, "task"),
        now.format("%Y%m%d-%H%M")
    )
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
pub(super) fn task_warnings(
    task: &AiTask,
    coverage: &[AiTaskCoverage],
    attachments: &[AiTaskAttachmentStatus],
) -> Vec<AiTaskIssue> {
    let mut warnings = Vec::new();
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
