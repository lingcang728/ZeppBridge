//! 运动 / 睡眠列表的相册视图：按月汇总、列表行上的小图。都只读。

use super::spawn_independent_read;
use crate::app_state::AppState;
use crate::ipc_error::AppError;
use zeppbridge_core::models::{RouteShape, SleepMonth, SleepStrip, WorkoutMonth};

/// 一次最多问这么多条：列表一页的大小。
const MAX_IDS: usize = 500;

/// 按本地月份汇总的运动（年卡由前端把月份加起来），最新的月份在前。
#[tauri::command]
pub async fn get_workout_months(
    state: tauri::State<'_, AppState>,
) -> std::result::Result<Vec<WorkoutMonth>, AppError> {
    spawn_independent_read(state.data_dir.clone(), move |db| db.workout_months()).await
}

/// 按本地月份汇总的睡眠，最新的月份在前。
#[tauri::command]
pub async fn get_sleep_months(
    state: tauri::State<'_, AppState>,
) -> std::result::Result<Vec<SleepMonth>, AppError> {
    spawn_independent_read(state.data_dir.clone(), move |db| db.sleep_months()).await
}

/// 这些运动的轨迹轮廓（只有形状，不带坐标）；没有轨迹的不在结果里。
#[tauri::command]
pub async fn get_workout_route_shapes(
    state: tauri::State<'_, AppState>,
    workout_ids: Vec<String>,
) -> std::result::Result<Vec<RouteShape>, AppError> {
    let ids: Vec<String> = workout_ids.into_iter().take(MAX_IDS).collect();
    spawn_independent_read(state.data_dir.clone(), move |db| {
        db.workout_route_shapes(&ids)
    })
    .await
}

/// 这些晚上的分期条（分钟，从这一晚开始算）。
#[tauri::command]
pub async fn get_sleep_stage_strips(
    state: tauri::State<'_, AppState>,
    sleep_ids: Vec<String>,
) -> std::result::Result<Vec<SleepStrip>, AppError> {
    let ids: Vec<String> = sleep_ids.into_iter().take(MAX_IDS).collect();
    spawn_independent_read(state.data_dir.clone(), move |db| {
        db.sleep_stage_strips(&ids)
    })
    .await
}
