//! 睡前日志与睡醒心情：首页打卡、睡眠列表上改一晚、睡眠页的睡前因素。
//!
//! 保存先落本机（标记待写回），再试着马上写回 Zepp；写不回去的等下次同步再写。
//! 只连了官方授权的账号没有 apptoken，记录只留在本机。

use super::{spawn_independent_read, with_write};
use crate::app_state::AppState;
use crate::ipc_error::AppError;
use serde::Serialize;
use zeppbridge_core::connectors::zepp::ZeppConnector;
use zeppbridge_core::storage::sleep_journal::{
    SleepFactors, SleepJournalEntry, SleepJournalInput, SleepJournalPrompt,
};
use zeppbridge_core::storage::write_lock::WritePurpose;

#[derive(Debug, Serialize)]
pub struct SleepJournalSaved {
    pub entry: SleepJournalEntry,
    /// `written`：已写回 Zepp；`pending`：这次没写回去，下次同步再写；`local_only`：没有 Zepp 登录，只存本机。
    pub zepp: &'static str,
}

#[tauri::command]
pub async fn sleep_journal_prompt(
    state: tauri::State<'_, AppState>,
) -> Result<Option<SleepJournalPrompt>, AppError> {
    spawn_independent_read(state.data_dir.clone(), |db| {
        db.sleep_journal_prompt(chrono::Utc::now())
    })
    .await
}

/// 一段日期里记过的晚上（醒来那天，含两端）。
#[tauri::command]
pub async fn sleep_journal_list(
    state: tauri::State<'_, AppState>,
    from: String,
    to: String,
) -> Result<Vec<SleepJournalEntry>, AppError> {
    spawn_independent_read(state.data_dir.clone(), move |db| {
        db.sleep_journal_range(&from, &to)
    })
    .await
}

#[tauri::command]
pub async fn sleep_journal_save(
    state: tauri::State<'_, AppState>,
    input: SleepJournalInput,
) -> Result<SleepJournalSaved, AppError> {
    let entry = with_write(&state.data_dir, &state.db, WritePurpose::Metadata, |db| {
        db.save_sleep_journal(&input)
    })
    .await?;
    let Some(auth) = state.auth.load_auth().map_err(AppError::from)? else {
        return Ok(SleepJournalSaved {
            entry,
            zepp: "local_only",
        });
    };
    let uploaded = match ZeppConnector::new(auth) {
        Ok(connector) => connector
            .upload_manual_sleep_data(&entry.date, &entry.zepp_summary())
            .await
            .is_ok(),
        Err(_) => false,
    };
    if !uploaded {
        return Ok(SleepJournalSaved {
            entry,
            zepp: "pending",
        });
    }
    let marked = entry.clone();
    with_write(
        &state.data_dir,
        &state.db,
        WritePurpose::Metadata,
        move |db| db.mark_sleep_journal_uploaded(&marked),
    )
    .await?;
    let entry = SleepJournalEntry {
        pending_upload: false,
        ..entry
    };
    Ok(SleepJournalSaved {
        entry,
        zepp: "written",
    })
}

#[tauri::command]
pub async fn sleep_journal_dismiss(state: tauri::State<'_, AppState>) -> Result<(), AppError> {
    with_write(&state.data_dir, &state.db, WritePurpose::Metadata, |db| {
        db.dismiss_sleep_journal_prompt(chrono::Local::now().date_naive())
    })
    .await
}

/// 「这周别问」：返回到哪天为止（下周一，本地日历）。
#[tauri::command]
pub async fn sleep_journal_snooze(state: tauri::State<'_, AppState>) -> Result<String, AppError> {
    with_write(&state.data_dir, &state.db, WritePurpose::Metadata, |db| {
        db.snooze_sleep_journal_prompt(chrono::Local::now().date_naive())
            .map(|until| until.to_string())
    })
    .await
}

/// 睡前因素：往回一年里记过的晚上，按标签比评分、深睡、夜醒。
#[tauri::command]
pub async fn sleep_journal_factors(
    state: tauri::State<'_, AppState>,
) -> Result<SleepFactors, AppError> {
    spawn_independent_read(state.data_dir.clone(), |db| {
        db.sleep_journal_factors(chrono::Local::now().date_naive())
    })
    .await
}
