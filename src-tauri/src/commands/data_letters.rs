//! 信匣里的数据来信（批次 7）：每周数据来信、时间胶囊、那年今天。全在本机，不联网。

use crate::app_state::AppState;
use crate::commands::{spawn_independent_read, with_write};
use crate::ipc_error::AppError;
use chrono::{Local, NaiveDate, Utc};
use serde::Serialize;
use zeppbridge_core::insight::letters::{DataLetter, OnThisDayYear};
use zeppbridge_core::storage::write_lock::WritePurpose;

#[derive(Debug, Clone, Serialize)]
pub struct DataLettersView {
    pub letters: Vec<DataLetter>,
    pub on_this_day: Vec<OnThisDayYear>,
}

/// 打开信匣：上一周的来信还没寄就先寄（短写入；写锁被同步占着时这次就不寄，下次再说），
/// 再读出全部来信和那年今天。
#[tauri::command]
pub async fn data_letters_state(
    state: tauri::State<'_, AppState>,
) -> std::result::Result<DataLettersView, AppError> {
    let today = Local::now().date_naive();
    let _ = with_write(
        &state.data_dir,
        &state.db,
        WritePurpose::Metadata,
        move |db| db.ensure_weekly_letter(today, Utc::now()),
    )
    .await;
    spawn_independent_read(state.data_dir.clone(), move |db| {
        Ok(DataLettersView {
            letters: db.data_letters()?,
            on_this_day: db.on_this_day(today)?,
        })
    })
    .await
}

/// 封一个时间胶囊，`open_on` 是本地日（YYYY-MM-DD）。
#[tauri::command]
pub async fn data_letters_seal_capsule(
    state: tauri::State<'_, AppState>,
    note: String,
    open_on: String,
) -> std::result::Result<i64, AppError> {
    let open_on = NaiveDate::parse_from_str(&open_on, "%Y-%m-%d")
        .map_err(|_| AppError::new("err.letters.capsule_date", "开封日期格式不对"))?;
    let today = Local::now().date_naive();
    with_write(
        &state.data_dir,
        &state.db,
        WritePurpose::Metadata,
        move |db| db.seal_capsule(&note, open_on, today, Utc::now()),
    )
    .await
}

/// 开封一个到期的胶囊。
#[tauri::command]
pub async fn data_letters_open_capsule(
    state: tauri::State<'_, AppState>,
    id: i64,
) -> std::result::Result<DataLetter, AppError> {
    let today = Local::now().date_naive();
    with_write(
        &state.data_dir,
        &state.db,
        WritePurpose::Metadata,
        move |db| db.open_capsule(id, today, Utc::now()),
    )
    .await
}
