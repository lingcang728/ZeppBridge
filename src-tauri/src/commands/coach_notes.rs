//! 教练档案（批次 7，AI 记忆收件箱）：AI 经 MCP 提议的、用户自己写的，都在这一张表里；
//! 界面逐条确认 / 拒绝 / 改 / 删，还能导出成一份 Markdown。

use super::{spawn_independent_read, with_write};
use crate::app_state::AppState;
use crate::ipc_error::AppError;
use serde::Serialize;
use zeppbridge_core::storage::coach_notes::{CoachNote, NOTE_MAX_CHARS};
use zeppbridge_core::storage::write_lock::WritePurpose;

#[derive(Debug, Serialize)]
pub struct CoachNotes {
    /// 记住的，旧的在前。
    pub accepted: Vec<CoachNote>,
    /// 等用户确认的，新的在前。
    pub proposed: Vec<CoachNote>,
}

/// 文字的毛病在这里按码报，别让 core 的中文原文直接到界面上。
fn checked(text: &str) -> Result<(), AppError> {
    let clean = text.split_whitespace().collect::<Vec<_>>().join(" ");
    if clean.is_empty() {
        return Err(AppError::new("err.coach_notes.empty", "内容是空的"));
    }
    if clean.chars().count() > NOTE_MAX_CHARS {
        return Err(AppError::new("err.coach_notes.too_long", "一条最多 500 字"));
    }
    Ok(())
}

fn stale() -> AppError {
    AppError::new("err.coach_notes.stale", "这一条已经处理过或删掉了")
}

#[tauri::command]
pub async fn coach_notes_list(state: tauri::State<'_, AppState>) -> Result<CoachNotes, AppError> {
    spawn_independent_read(state.data_dir.clone(), |db| {
        Ok(CoachNotes {
            accepted: db.accepted_coach_notes()?,
            proposed: db.proposed_coach_notes()?,
        })
    })
    .await
}

#[tauri::command]
pub async fn coach_note_add(
    state: tauri::State<'_, AppState>,
    text: String,
) -> Result<i64, AppError> {
    checked(&text)?;
    with_write(&state.data_dir, &state.db, WritePurpose::Metadata, |db| {
        db.add_coach_note(&text)
    })
    .await
}

#[tauri::command]
pub async fn coach_note_decide(
    state: tauri::State<'_, AppState>,
    id: i64,
    accept: bool,
) -> Result<(), AppError> {
    let changed = with_write(&state.data_dir, &state.db, WritePurpose::Metadata, |db| {
        db.decide_coach_note(id, accept)
    })
    .await?;
    changed.then_some(()).ok_or_else(stale)
}

#[tauri::command]
pub async fn coach_note_edit(
    state: tauri::State<'_, AppState>,
    id: i64,
    text: String,
) -> Result<(), AppError> {
    checked(&text)?;
    let changed = with_write(&state.data_dir, &state.db, WritePurpose::Metadata, |db| {
        db.edit_coach_note(id, &text)
    })
    .await?;
    changed.then_some(()).ok_or_else(stale)
}

#[tauri::command]
pub async fn coach_note_delete(state: tauri::State<'_, AppState>, id: i64) -> Result<(), AppError> {
    with_write(&state.data_dir, &state.db, WritePurpose::Metadata, |db| {
        db.delete_coach_note(id)
    })
    .await
}

/// 导出「我的教练档案」：界面按自己的语言排好 Markdown，这里只落盘到桌面的 `ZeppBridge AI` 文件夹
/// （和交给 AI 的文件放一起），返回路径给界面在资源管理器里选中。文件名只取界面给的名字里安全的字符。
#[tauri::command]
pub async fn coach_notes_export(
    state: tauri::State<'_, AppState>,
    file_stem: String,
    markdown: String,
) -> Result<String, AppError> {
    let failed = || AppError::new("err.coach_notes.export", "导出教练档案失败");
    if markdown.len() > 4 * 1024 * 1024 {
        return Err(failed());
    }
    let stem: String = file_stem
        .chars()
        .filter(|c| !c.is_control() && !r#"\/:*?"<>|"#.contains(*c))
        .take(60)
        .collect();
    let stem = stem.trim().trim_matches('.');
    let stem = if stem.is_empty() { "coach-notes" } else { stem };
    let root = directories::UserDirs::new()
        .and_then(|dirs| dirs.desktop_dir().map(|path| path.join("ZeppBridge AI")))
        .unwrap_or_else(|| state.data_dir.join("exports").join("ai-tasks"));
    let path = root.join(format!("{stem}.md"));
    std::fs::create_dir_all(&root).map_err(|_| failed())?;
    std::fs::write(&path, markdown).map_err(|_| failed())?;
    Ok(path.to_string_lossy().into_owned())
}
