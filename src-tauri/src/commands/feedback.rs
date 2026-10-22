//! 跑后打分（批次 7）：概览上的轻卡读「现在该问哪一条」，打分 / 关掉 / 这周别问都是短写入。

use super::{spawn_independent_read, with_write};
use crate::app_state::AppState;
use crate::ipc_error::AppError;
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
