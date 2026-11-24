//! 首页建议卡与「按问题发牌」：只读。
//!
//! 规则和事实都在 core（`insight::suggest`）：后端只给触发码 + 事实参数，句子、发牌规则在界面。

use super::spawn_independent_read;
use crate::app_state::AppState;
use crate::ipc_error::AppError;
use zeppbridge_core::insight::suggest::facts::{HandFacts, HandLines};
use zeppbridge_core::insight::suggest::Suggestion;

/// 「今天」按这台电脑的日历：和首页、计划页说的「今天」「明天」是同一天。
fn today() -> chrono::NaiveDate {
    chrono::Local::now().date_naive()
}

/// 今天该出哪几张建议卡（触发码 + 事实）。关没关过、今天出没出过由界面记。
#[tauri::command]
pub async fn suggestion_cards(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<Suggestion>, AppError> {
    spawn_independent_read(state.data_dir.clone(), move |db| db.suggestions(today())).await
}

/// 发牌用的事实：最近 `days` 天的每次运动和每一晚。
#[tauri::command]
pub async fn card_hand_facts(
    state: tauri::State<'_, AppState>,
    days: u32,
) -> Result<HandFacts, AppError> {
    spawn_independent_read(state.data_dir.clone(), move |db| {
        db.hand_facts(today(), i64::from(days))
    })
    .await
}

/// 几次运动的小图（轨迹缩略、心率小线），给牌面用。
#[tauri::command]
pub async fn card_hand_lines(
    state: tauri::State<'_, AppState>,
    workout_ids: Vec<String>,
) -> Result<Vec<HandLines>, AppError> {
    spawn_independent_read(state.data_dir.clone(), move |db| db.hand_lines(&workout_ids)).await
}
