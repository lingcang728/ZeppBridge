//! `fit-override`：用修正过的 `.fit` 顶替一条运动、撤销、列出（#143）。
//!
//! 和桌面端「顶替运动」是同一个 core 入口（`Database::import_workout_fit`），只在本机生效：
//! Zepp 没有导入运动的端点。几台电脑各有一份库的人（#143 SmagArt：两台 Windows 一台 Mac）
//! 要在每台上各做一遍——运动编号来自 Zepp，几台上是同一个，所以写成脚本就行。

use super::*;
use zeppbridge_core::export_fit::{decode_fit_file, FitImportError, MAX_FIT_IMPORT_BYTES};
use zeppbridge_core::storage::{
    FitOverrideOutcome, WorkoutFitOverride, FIT_START_TOLERANCE_SECONDS,
};

pub(super) fn cmd_fit_override(args: &[String]) -> u8 {
    let json_mode = scan_json_flag(args);
    let flags = match Flags::parse(args) {
        Ok(flags) => flags,
        Err(message) => return fail(json_mode, EXIT_USAGE, "usage", &message),
    };
    if let Err(message) = flags.reject_unknown(&["json", "workout", "fit", "remove", "list"]) {
        return fail(json_mode, EXIT_USAGE, "usage", &message);
    }
    if let Err(message) = flags.reject_duplicates() {
        return fail(json_mode, EXIT_USAGE, "usage", &message);
    }
    let action = match (
        flags.has("list"),
        flags.get("workout"),
        flags.get("fit"),
        flags.has("remove"),
    ) {
        (true, None, None, false) => Action::List,
        (false, Some(workout), Some(fit), false) => Action::Apply { workout, fit },
        (false, Some(workout), None, true) => Action::Remove { workout },
        _ => {
            return fail(
                json_mode,
                EXIT_USAGE,
                "usage",
                "Use exactly one of: --list | --workout <id> --fit <file.fit> | --workout <id> --remove",
            )
        }
    };

    if let Action::List = action {
        let db = match open_read_only() {
            Ok(db) => db,
            Err((code, message)) => return fail(json_mode, code, error_kind_for(code), &message),
        };
        return match db.list_workout_fit_overrides() {
            Ok(list) => {
                let human = if list.is_empty() {
                    "No workouts are replaced on this machine".to_string()
                } else {
                    list.iter().map(describe).collect::<Vec<_>>().join("\n")
                };
                emit(
                    json_mode,
                    serde_json::json!({ "ok": true, "overrides": list }),
                    &human,
                );
                EXIT_OK
            }
            Err(error) => {
                let (code, kind) = exit_code_for(&error);
                fail(json_mode, code, kind, &user_text(&error))
            }
        };
    }

    // 文件先读、先认：读不懂的文件不值得去等写锁。
    let loaded = match &action {
        Action::Apply { fit, .. } => match load_fit(Path::new(fit)) {
            Ok(loaded) => Some(loaded),
            Err((kind, message)) => return fail(json_mode, EXIT_FAILED, kind, &message),
        },
        _ => None,
    };

    let (dir, db) = match open_writable() {
        Ok(value) => value,
        Err((code, message)) => return fail(json_mode, code, error_kind_for(code), &message),
    };
    let _guard = match write_lock::acquire_with_timeout(
        &dir,
        WritePurpose::Metadata,
        Duration::from_secs(20),
    ) {
        Ok(guard) => guard,
        Err(error) => {
            let code = write_lock_exit(&error);
            return fail(json_mode, code, error_kind_for(code), &error.to_string());
        }
    };

    match (action, loaded) {
        (Action::Apply { workout, .. }, Some((file_name, bytes, imported))) => {
            match db.import_workout_fit(workout, file_name.as_deref(), &bytes, &imported) {
                Ok(FitOverrideOutcome::Applied(info)) => {
                    emit(
                        json_mode,
                        serde_json::json!({ "ok": true, "applied": true, "override": info }),
                        &format!("Replaced on this machine: {}", describe(&info)),
                    );
                    EXIT_OK
                }
                Ok(FitOverrideOutcome::WorkoutMissing) => fail(
                    json_mode,
                    EXIT_FAILED,
                    "workout_not_found",
                    &format!("No workout {workout} in this library. Sync first, or check the ID (`workout_id` in a JSON export)."),
                ),
                Ok(FitOverrideOutcome::StartMismatch {
                    workout_start,
                    fit_start,
                }) => fail(
                    json_mode,
                    EXIT_FAILED,
                    "fit_start_mismatch",
                    &format!(
                        "This .fit starts at {} but workout {workout} starts at {}; more than {} minutes apart, so it is not the same workout.",
                        fit_start.to_rfc3339(),
                        workout_start.to_rfc3339(),
                        FIT_START_TOLERANCE_SECONDS / 60
                    ),
                ),
                Err(error) => {
                    let (code, kind) = exit_code_for(&error);
                    fail(json_mode, code, kind, &user_text(&error))
                }
            }
        }
        (Action::Remove { workout }, _) => match db.remove_workout_fit(workout) {
            Ok(removed) => {
                emit(
                    json_mode,
                    serde_json::json!({ "ok": true, "removed": removed, "workoutId": workout }),
                    &if removed {
                        format!("Undid the replacement of {workout}; Zepp's values are back")
                    } else {
                        format!("{workout} was not replaced on this machine; nothing to undo")
                    },
                );
                EXIT_OK
            }
            Err(error) => {
                let (code, kind) = exit_code_for(&error);
                fail(json_mode, code, kind, &user_text(&error))
            }
        },
        _ => unreachable!("--list returned above; --fit was loaded above"),
    }
}

enum Action<'a> {
    List,
    Apply { workout: &'a str, fit: &'a str },
    Remove { workout: &'a str },
}

type LoadedFit = (
    Option<String>,
    Vec<u8>,
    zeppbridge_core::export_fit::ImportedFit,
);

/// 和桌面端同样的三道检查：扩展名、大小、内容里有没有运动。
fn load_fit(path: &Path) -> Result<LoadedFit, (&'static str, String)> {
    let is_fit = path
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("fit"));
    if !is_fit {
        return Err(("not_fit", "The file must be a .fit file".into()));
    }
    let too_large = || {
        (
            "fit_too_large",
            format!(
                "The file is larger than {} MB; that is not a single workout",
                MAX_FIT_IMPORT_BYTES / 1024 / 1024
            ),
        )
    };
    let size = std::fs::metadata(path)
        .map_err(|_| ("fit_read_failed", "Could not read the file".to_string()))?
        .len();
    if size > MAX_FIT_IMPORT_BYTES as u64 {
        return Err(too_large());
    }
    let bytes = std::fs::read(path)
        .map_err(|_| ("fit_read_failed", "Could not read the file".to_string()))?;
    let imported = decode_fit_file(&bytes).map_err(|error| match error {
        FitImportError::TooLarge => too_large(),
        FitImportError::NotFit => (
            "not_fit",
            "This is not a .fit file ZeppBridge can read".into(),
        ),
        FitImportError::NoActivity => (
            "fit_no_activity",
            "This .fit has no activity in it (no records and no laps)".into(),
        ),
    })?;
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .map(str::to_owned);
    Ok((file_name, bytes, imported))
}

fn describe(info: &WorkoutFitOverride) -> String {
    let distance = |value: Option<f64>| {
        value.map_or_else(
            || "—".to_string(),
            |metres| format!("{:.2} km", metres / 1000.0),
        )
    };
    format!(
        "{}  {} (was {})  {}  imported {}",
        info.workout_id,
        distance(info.distance_m),
        distance(info.original_distance_m),
        info.file_name.as_deref().unwrap_or("(no file name)"),
        info.imported_at
    )
}
