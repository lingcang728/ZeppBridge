//! 从别处导入运动（批次 7）：GPX / FIT / Strava 整包 / Apple 健康。读文件和落库都在本机，不联网。

use std::collections::HashMap;
use std::path::PathBuf;

use crate::app_state::AppState;
use crate::commands::{join_blocking, spawn_independent_read, spawn_independent_write};
use crate::ipc_error::AppError;
use chrono::Utc;
use zeppbridge_core::import::{read_import_file, ImportReadError, ImportSource, ParsedFile};
use zeppbridge_core::storage::imports::{ImportBatch, ImportReport};
use zeppbridge_core::storage::write_lock::WritePurpose;

/// 导入一种来源的一个或多个文件，合成一批（撤销时一起撤）。
#[tauri::command]
pub async fn import_workouts(
    state: tauri::State<'_, AppState>,
    source: String,
    paths: Vec<String>,
) -> std::result::Result<ImportReport, AppError> {
    let source = ImportSource::parse(&source)
        .ok_or_else(|| AppError::new("err.import.source", "不认识的导入来源"))?;
    if paths.is_empty() {
        return Err(AppError::new("err.import.not_recognized", "没有选文件"));
    }
    let file_name = match paths.as_slice() {
        [one] => PathBuf::from(one)
            .file_name()
            .map(|name| name.to_string_lossy().into_owned()),
        many => Some(format!("{} files", many.len())),
    };
    let parsed = join_blocking(
        tokio::task::spawn_blocking(move || {
            let mut merged = ParsedFile::default();
            for path in &paths {
                let one =
                    read_import_file(source, &PathBuf::from(path)).map_err(
                        |error| match error {
                            ImportReadError::TooLarge => {
                                AppError::new("err.import.too_large", "文件太大，超过 64 MB")
                            }
                            ImportReadError::NotRecognized => AppError::new(
                                "err.import.not_recognized",
                                "这份文件不是所选来源的导出",
                            ),
                            ImportReadError::Io(_) => {
                                AppError::new("err.import.read", "读不了这份文件")
                            }
                        },
                    )?;
                merged.unreadable += one.unreadable;
                merged.activities.extend(one.activities);
            }
            Ok::<_, AppError>(merged)
        })
        .await,
    )??;
    spawn_independent_write(state.data_dir.clone(), WritePurpose::Metadata, move |db| {
        db.import_activities(source, file_name.as_deref(), parsed, Utc::now())
    })
    .await
}

/// 全部导入批次，新的在前。
#[tauri::command]
pub async fn import_batches(
    state: tauri::State<'_, AppState>,
) -> std::result::Result<Vec<ImportBatch>, AppError> {
    spawn_independent_read(state.data_dir.clone(), |db| db.import_batches()).await
}

/// 整批撤销，返回删掉的运动条数。
#[tauri::command]
pub async fn undo_import_batch(
    state: tauri::State<'_, AppState>,
    batch_id: i64,
) -> std::result::Result<usize, AppError> {
    spawn_independent_write(state.data_dir.clone(), WritePurpose::Metadata, move |db| {
        db.undo_import_batch(batch_id, Utc::now())
    })
    .await
}

/// 导入的运动各自的来源，运动列表标来源用。
#[tauri::command]
pub async fn workout_import_sources(
    state: tauri::State<'_, AppState>,
) -> std::result::Result<HashMap<String, String>, AppError> {
    spawn_independent_read(state.data_dir.clone(), |db| {
        Ok(db.workout_import_sources()?.into_iter().collect())
    })
    .await
}
