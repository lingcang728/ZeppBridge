//! 用修正过的 `.fit` 顶替一条运动（#140）。只在本机生效：Zepp 开放接口没有
//! 导入运动的端点，云端那份不动，撤销后原样回来。

use super::{spawn_independent_read, with_write};
use crate::app_state::AppState;
use crate::export_fit::{decode_fit_file, FitImportError, MAX_FIT_IMPORT_BYTES};
use crate::ipc_error::AppError;
use crate::storage::{FitOverrideOutcome, WorkoutFitOverride, FIT_START_TOLERANCE_SECONDS};
use std::path::Path;
use zeppbridge_core::storage::write_lock::WritePurpose;

#[tauri::command]
pub async fn get_workout_fit_override(
    state: tauri::State<'_, AppState>,
    workout_id: String,
) -> std::result::Result<Option<WorkoutFitOverride>, AppError> {
    spawn_independent_read(state.data_dir.clone(), move |db| {
        db.workout_fit_override(&workout_id)
    })
    .await
}

#[tauri::command]
pub async fn import_workout_fit(
    state: tauri::State<'_, AppState>,
    workout_id: String,
    path: String,
) -> std::result::Result<WorkoutFitOverride, AppError> {
    let file = Path::new(&path);
    let is_fit = file
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("fit"));
    if !is_fit {
        return Err(not_fit());
    }
    let size = std::fs::metadata(file)
        .map_err(|_| AppError::new("err.workout_fit.read_failed", "读不了这个文件"))?
        .len();
    if size > MAX_FIT_IMPORT_BYTES as u64 {
        return Err(too_large());
    }
    let bytes = std::fs::read(file)
        .map_err(|_| AppError::new("err.workout_fit.read_failed", "读不了这个文件"))?;
    let imported = decode_fit_file(&bytes).map_err(|error| match error {
        FitImportError::TooLarge => too_large(),
        FitImportError::NotFit => not_fit(),
        FitImportError::NoActivity => AppError::new(
            "err.workout_fit.no_activity",
            "这个 .fit 里没有运动记录（没有逐点数据，也没有圈）",
        ),
    })?;
    let file_name = file
        .file_name()
        .and_then(|name| name.to_str())
        .map(str::to_owned);
    let outcome = with_write(&state.data_dir, &state.db, WritePurpose::Metadata, |db| {
        db.import_workout_fit(&workout_id, file_name.as_deref(), &bytes, &imported)
    })
    .await?;
    match outcome {
        FitOverrideOutcome::Applied(info) => Ok(info),
        FitOverrideOutcome::WorkoutMissing => {
            Err(AppError::new("err.workout.not_found", "运动记录不存在"))
        }
        FitOverrideOutcome::StartMismatch {
            workout_start,
            fit_start,
        } => Err(AppError::new(
            "err.workout_fit.start_mismatch",
            "这个 .fit 的开始时间和这条运动对不上，不像是同一次运动",
        )
        .with_params(serde_json::json!({
            "workoutStart": workout_start.to_rfc3339(),
            "fitStart": fit_start.to_rfc3339(),
            "toleranceMinutes": FIT_START_TOLERANCE_SECONDS / 60,
        }))),
    }
}

#[tauri::command]
pub async fn remove_workout_fit(
    state: tauri::State<'_, AppState>,
    workout_id: String,
) -> std::result::Result<bool, AppError> {
    with_write(&state.data_dir, &state.db, WritePurpose::Metadata, |db| {
        db.remove_workout_fit(&workout_id)
    })
    .await
}

fn not_fit() -> AppError {
    AppError::new("err.workout_fit.not_fit", "这不是一个能读懂的 .fit 文件")
}

fn too_large() -> AppError {
    AppError::new(
        "err.workout_fit.too_large",
        "文件太大，不像是一次运动的 .fit",
    )
    .with_params(serde_json::json!({ "maxMb": MAX_FIT_IMPORT_BYTES / 1024 / 1024 }))
}
