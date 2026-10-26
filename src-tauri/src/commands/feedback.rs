//! 跑后打分（批次 7）：概览上的轻卡读「现在该问哪一条」，打分 / 关掉 / 这周别问都是短写入。

use super::{join_blocking, spawn_independent_read, with_write};
use crate::app_state::AppState;
use crate::feedback_toast::FeedbackToastText;
use crate::ipc_error::AppError;
use zeppbridge_core::storage::feedback_toast::FeedbackToastDue;
use zeppbridge_core::storage::workout_feedback::{FeedbackInput, FeedbackPrompt, WorkoutFeedback};
use zeppbridge_core::storage::write_lock::WritePurpose;

#[tauri::command]
pub async fn workout_feedback_prompt(
    state: tauri::State<'_, AppState>,
) -> Result<Option<FeedbackPrompt>, AppError> {
    spawn_independent_read(state.data_dir.clone(), |db| {
        db.workout_feedback_prompt(chrono::Utc::now())
    })
    .await
}

#[tauri::command]
pub async fn workout_feedback_get(
    state: tauri::State<'_, AppState>,
    workout_id: String,
) -> Result<Option<WorkoutFeedback>, AppError> {
    spawn_independent_read(state.data_dir.clone(), move |db| {
        db.workout_feedback(&workout_id)
    })
    .await
}

#[tauri::command]
pub async fn workout_feedback_save(
    state: tauri::State<'_, AppState>,
    input: FeedbackInput,
) -> Result<(), AppError> {
    with_write(&state.data_dir, &state.db, WritePurpose::Metadata, |db| {
        db.save_workout_feedback(&input)
    })
    .await
}

#[tauri::command]
pub async fn workout_feedback_dismiss(
    state: tauri::State<'_, AppState>,
    workout_id: String,
) -> Result<(), AppError> {
    with_write(&state.data_dir, &state.db, WritePurpose::Metadata, |db| {
        db.dismiss_workout_feedback(&workout_id)
    })
    .await
}

/// 「这周别问」：返回到哪天为止（下周一，本地日历）。
#[tauri::command]
pub async fn workout_feedback_snooze(
    state: tauri::State<'_, AppState>,
) -> Result<String, AppError> {
    with_write(&state.data_dir, &state.db, WritePurpose::Metadata, |db| {
        db.snooze_workout_feedback(chrono::Local::now().date_naive())
            .map(|until| until.to_string())
    })
    .await
}

#[tauri::command]
pub async fn workout_feedback_adjusted(
    state: tauri::State<'_, AppState>,
    workout_id: String,
    adjustment: String,
) -> Result<(), AppError> {
    with_write(&state.data_dir, &state.db, WritePurpose::Metadata, |db| {
        db.mark_feedback_adjustment(&workout_id, &adjustment)
    })
    .await
}

/// 有没有一条该发系统通知的打分（每条运动只发一次）。有的话返回令牌和卡片内容，界面组好文案再发。
#[tauri::command]
pub async fn workout_feedback_toast_due(
    state: tauri::State<'_, AppState>,
) -> Result<Option<FeedbackToastDue>, AppError> {
    with_write(&state.data_dir, &state.db, WritePurpose::Metadata, |db| {
        db.feedback_toast_due(chrono::Utc::now())
    })
    .await
}

/// 发系统通知。Windows 带五档按钮，其他平台是普通通知。
#[tauri::command]
pub async fn workout_feedback_toast_show(text: FeedbackToastText) -> Result<(), AppError> {
    join_blocking(tokio::task::spawn_blocking(move || crate::feedback_toast::show(&text)).await)?
        .map_err(|_| AppError::new("err.feedback.toast_failed", "系统通知没能发出"))
}
