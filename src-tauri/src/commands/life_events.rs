use crate::{app_state::AppState, ipc_error::AppError};
use zeppbridge_core::storage::life_events::{LifeEvent, LifeEventInput};

#[tauri::command]
pub async fn list_life_events(
    state: tauri::State<'_, AppState>,
    start: Option<String>,
    end: Option<String>,
) -> Result<Vec<LifeEvent>, AppError> {
    let db = state.db.lock().await;
    Ok(db.list_life_events(start.as_deref(), end.as_deref())?)
}

#[tauri::command]
pub async fn save_life_event(
    state: tauri::State<'_, AppState>,
    input: LifeEventInput,
) -> Result<i64, AppError> {
    let db = state.db.lock().await;
    Ok(db.save_life_event(&input)?)
}

#[tauri::command]
pub async fn delete_life_event(state: tauri::State<'_, AppState>, id: i64) -> Result<(), AppError> {
    let db = state.db.lock().await;
    Ok(db.delete_life_event(id)?)
}
