//! 导出命令：JSON / CSV / GPX / FIT 写盘、交给 AI 的打包、导出路径校验（从 commands/data.rs 拆出）。

use super::*;

#[tauri::command]
pub async fn get_export_json(
    state: tauri::State<'_, AppState>,
    selection: ExportSelection,
) -> std::result::Result<String, AppError> {
    spawn_independent_read(state.data_dir.clone(), move |db| {
        db.build_ai_export(&selection).map(|(encoded, _)| encoded)
    })
    .await
}

#[tauri::command]
pub async fn estimate_export(
    state: tauri::State<'_, AppState>,
    selection: ExportSelection,
) -> std::result::Result<ExportEstimate, AppError> {
    spawn_independent_read(state.data_dir.clone(), move |db| {
        db.estimate_ai_export(&selection)
    })
    .await
}

#[tauri::command]
pub async fn save_json_export(
    state: tauri::State<'_, AppState>,
    selection: ExportSelection,
    path: String,
) -> std::result::Result<ExportResult, AppError> {
    let path = validate_json_export_path(&path)?;
    write_export(&state, selection, Some(path), false).await
}

#[tauri::command]
pub async fn publish_ai_export(
    state: tauri::State<'_, AppState>,
    selection: ExportSelection,
) -> std::result::Result<ExportResult, AppError> {
    write_export(&state, selection, None, true).await
}

/// Save the selection as a tidy CSV table.
///
/// `record_count` is the number of data rows, not the number of source
/// records: one sleep session or workout expands into one row per metric it
/// actually has.
#[tauri::command]
pub async fn save_csv_export(
    state: tauri::State<'_, AppState>,
    selection: ExportSelection,
    path: String,
) -> std::result::Result<ExportResult, AppError> {
    let path = validate_export_path(&path, "csv")?;
    write_converted_export(&state, selection, path, export_formats::to_csv, "CSV").await
}

/// Save the GPS tracks of the selection as GPX 1.1.
///
/// `record_count` is the number of track points. Workouts without decoded
/// route points contribute nothing, and a selection with no points at all is
/// an error rather than an empty file.
#[tauri::command]
pub async fn save_gpx_export(
    state: tauri::State<'_, AppState>,
    selection: ExportSelection,
    path: String,
) -> std::result::Result<ExportResult, AppError> {
    let path = validate_export_path(&path, "gpx")?;
    write_converted_export(&state, selection, path, export_formats::to_gpx, "GPX").await
}

/// 把选中的运动写成 FIT，一次运动一个文件，全部落在 `directory` 下。
///
/// 为什么是目录而不是单个文件：FIT 的 activity 文件按约定装一次活动，而
/// Garmin Connect 和 Strava 对把多次活动串成一个 chained FIT 的接受度并不
/// 一致。issue #28 要的本来也是「一次把过去所有训练拿下来」，一个目录正好
/// 就是那个东西。
///
/// `record_count` 是所有文件里逐秒采样点的总数；没有明细序列的运动不产出
/// 文件，一条都产不出时是错误，而不是一个空目录。
#[tauri::command]
pub async fn save_fit_export(
    state: tauri::State<'_, AppState>,
    selection: ExportSelection,
    directory: String,
) -> std::result::Result<ExportResult, AppError> {
    let directory = validate_export_directory(&directory)?;
    // `mut` 不能出现在 `#[tauri::command]` 的参数模式上：宏会因此推不出参数
    // 类型，编译期报成 never-type fallback。在函数体里重新绑定。
    let mut selection = selection;

    // 和 CSV / GPX 一样：逐秒序列是这些归档格式的全部意义，所以不管界面上
    // 勾的是什么，这里都读完整载荷。
    selection.detail = ExportDetail::Full;
    let (export, record_count) = {
        let db = state.db.lock().await;
        db.build_ai_export_value(&selection)?
    };
    if record_count == 0 {
        return Err(AppError::new(
            "err.export.empty_range",
            "这段时间没有可导出的记录",
        ));
    }

    let (files, point_count) = export_fit::to_fit(&export).map_err(|message| {
        AppError::new("err.export.convert_failed", message)
            .with_params(serde_json::json!({ "format": "FIT" }))
    })?;

    std::fs::create_dir_all(&directory).map_err(|error| {
        AppError::new(
            "err.export.write_failed",
            format!("创建 FIT 导出目录失败: {error}"),
        )
        .with_params(serde_json::json!({ "format": "FIT" }))
    })?;

    let mut bytes = 0usize;
    for (name, content) in &files {
        let target = directory.join(name);
        write_file_atomically(&target, content).map_err(|error| {
            AppError::new(
                "err.export.write_failed",
                format!("写入 FIT 导出失败: {error}"),
            )
            .with_params(serde_json::json!({ "format": "FIT" }))
        })?;
        bytes += content.len();
    }

    Ok(ExportResult {
        path: directory.to_string_lossy().into_owned(),
        record_count: point_count,
        bytes,
        generated_at: Utc::now().to_rfc3339(),
        file_count: Some(files.len()),
    })
}

/// Shared body for the non-JSON exports: build the same canonical payload the
/// JSON export uses, convert it, then write atomically. Conversion failures
/// (including "nothing to write") happen before any file is touched.
pub(super) async fn write_converted_export(
    state: &AppState,
    mut selection: ExportSelection,
    path: PathBuf,
    convert: fn(&Value) -> std::result::Result<(String, usize), String>,
    label: &str,
) -> std::result::Result<ExportResult, AppError> {
    // CSV rows and GPX track points come from the per-second series, which the
    // summary export omits by design. These formats are archival, so they
    // always read the full payload regardless of what the UI has selected.
    selection.detail = ExportDetail::Full;
    let (export, record_count) = {
        let db = state.db.lock().await;
        db.build_ai_export_value(&selection)?
    };
    if record_count == 0 {
        return Err(AppError::new(
            "err.export.empty_range",
            "这段时间没有可导出的记录",
        ));
    }
    let (converted, converted_count) = convert(&export).map_err(|message| {
        AppError::new("err.export.convert_failed", message)
            .with_params(serde_json::json!({ "format": label }))
    })?;

    let generated_at = Utc::now();
    write_file_atomically(&path, converted.as_bytes()).map_err(|error| {
        AppError::new(
            "err.export.write_failed",
            format!("写入 {label} 导出失败: {error}"),
        )
        .with_params(serde_json::json!({ "format": label }))
    })?;
    Ok(ExportResult {
        path: path.to_string_lossy().into_owned(),
        record_count: converted_count,
        bytes: converted.len(),
        generated_at: generated_at.to_rfc3339(),
        file_count: None,
    })
}

/// Prepare a privacy-preserving payload for an external AI provider.
///
/// This deliberately calls the same database export builder as the normal
/// local export paths, then applies a second, recursive redaction pass. The
/// existing `get_export_json`, `save_json_export`, and `publish_ai_export`
/// commands remain unchanged so local exports retain their current semantics.
#[tauri::command]
pub async fn prepare_ai_handoff(
    state: tauri::State<'_, AppState>,
    selection: ExportSelection,
    prompt: String,
    include_precise_route: Option<bool>,
) -> std::result::Result<AiHandoffResult, AppError> {
    let prompt = sanitize_clipboard_text(prompt.trim());
    if prompt.is_empty() {
        return Err(AppError::new(
            "err.handoff.prompt_required",
            "请先填写提示词",
        ));
    }

    let (export, record_count) = {
        let db = state.db.lock().await;
        db.build_ai_export_value(&selection)?
    };
    if record_count == 0 {
        return Err(AppError::new(
            "err.handoff.empty_range",
            "这段时间没有可交接的记录",
        ));
    }

    let include_precise_route = include_precise_route.unwrap_or(false);
    let (redacted, redactions) = redact_ai_export(export, include_precise_route)?;
    let bytes = redacted.len();
    let mode = ai_handoff_mode_for_bytes(bytes);
    let (clipboard_text, file_path) = if mode == "inline" {
        (
            format!("{prompt}\n\n以下是已脱敏的健康数据（JSON）：\n{redacted}"),
            None,
        )
    } else {
        let target_dir = directories::UserDirs::new()
            .and_then(|u| u.desktop_dir().map(|p| p.to_path_buf()))
            .unwrap_or_else(|| state.data_dir.join("exports"));
        std::fs::create_dir_all(&target_dir).map_err(|error| {
            AppError::new(
                "err.handoff.mkdir_failed",
                format!("创建数据包导出目录失败: {error}"),
            )
        })?;
        let path = target_dir.join("zeppbridge-ai-handoff.json");
        write_file_atomically(&path, redacted.as_bytes()).map_err(|error| {
            AppError::new(
                "err.handoff.write_failed",
                format!("写入脱敏 AI 数据到桌面失败: {error}"),
            )
        })?;
        (
            format!("{prompt}\n\n数据包已导出到桌面（zeppbridge-ai-handoff.json），拖入 AI 对话框即可。"),
            Some(path.to_string_lossy().into_owned()),
        )
    };

    Ok(AiHandoffResult {
        mode: mode.to_string(),
        clipboard_text,
        file_path,
        bytes,
        records: record_count,
        redactions,
        metadata: AiHandoffMetadata {
            precise_route_included: include_precise_route,
            authentication_fields_removed: true,
            identity_fields_removed: true,
        },
    })
}

pub(crate) fn ai_handoff_mode_for_bytes(bytes: usize) -> &'static str {
    if bytes <= AI_HANDOFF_INLINE_LIMIT_BYTES {
        "inline"
    } else {
        "attachment"
    }
}

pub(super) fn write_file_atomically(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    crate::paths::write_file_atomically(path, bytes)
}

pub(super) async fn write_export(
    state: &AppState,
    selection: ExportSelection,
    selected_path: Option<PathBuf>,
    stable_ai_feed: bool,
) -> std::result::Result<ExportResult, AppError> {
    let (encoded, record_count) = {
        let db = state.db.lock().await;
        db.build_ai_export(&selection)?
    };
    // A zero-record export must not leave a misleading empty file on disk:
    // report an error before anything is written.
    if record_count == 0 {
        return Err(AppError::new(
            "err.export.empty_range",
            "这段时间没有可导出的记录",
        ));
    }
    let generated_at = Utc::now();
    let path = if let Some(path) = selected_path {
        path
    } else {
        let export_dir = state.data_dir.join("exports");
        std::fs::create_dir_all(&export_dir).map_err(|error| {
            AppError::new(
                "err.export.mkdir_failed",
                format!("创建导出目录失败: {error}"),
            )
        })?;
        let file_name = if stable_ai_feed {
            "zeppbridge-ai-feed.json".to_string()
        } else {
            // 文件名跟着范围走，所以单次运动导出不会和当天的整段导出撞名。
            let label = match selection.resolve_scope() {
                Ok(ExportScope::DateRange { start, end }) => format!("{start}-{end}"),
                Ok(ExportScope::Workout { workout_id }) => {
                    // workout_id comes straight from the IPC-supplied ExportSelection, so
                    // it must never reach a file path unsanitized (same rule as
                    // export_fit.rs's file_name_for): anything but ASCII alnum becomes
                    // `-`, which also rules out `/`, `\` and `..`.
                    let safe: String = workout_id
                        .chars()
                        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
                        .collect();
                    format!("workout-{safe}")
                }
                Err(_) => "export".to_string(),
            };
            format!(
                "zeppbridge-{label}-{}.json",
                generated_at.format("%Y%m%d-%H%M%S")
            )
        };
        export_dir.join(file_name)
    };
    write_file_atomically(&path, encoded.as_bytes()).map_err(|error| {
        AppError::new(
            "err.export.write_json_failed",
            format!("写入 JSON 导出失败: {error}"),
        )
    })?;
    Ok(ExportResult {
        path: path.to_string_lossy().into_owned(),
        record_count,
        bytes: encoded.len(),
        generated_at: generated_at.to_rfc3339(),
        file_count: None,
    })
}

pub(super) fn validate_json_export_path(value: &str) -> std::result::Result<PathBuf, AppError> {
    validate_export_path(value, "json")
}

/// Validate a user-picked export destination for one concrete format.
///
/// The extension check is not cosmetic: it keeps a mistyped destination from
/// silently producing a file whose contents do not match its name.
/// FIT 导出的目标目录。
///
/// 和 `validate_export_path` 一样只做「说得清」的检查：非空、绝对路径。刻意
/// 不要求目录已经存在——保存对话框里新建一个文件夹是很正常的用法，目录由写入
/// 时创建。
pub(super) fn validate_export_directory(value: &str) -> std::result::Result<PathBuf, AppError> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(
            AppError::new("err.export.path_required", "请选择 FIT 文件的保存目录")
                .with_params(serde_json::json!({ "format": "FIT" })),
        );
    }
    let path = PathBuf::from(trimmed);
    if !path.is_absolute() {
        return Err(AppError::new(
            "err.export.path_not_absolute",
            "保存位置必须是绝对路径",
        ));
    }
    if path.is_file() {
        return Err(AppError::new(
            "err.export.not_a_directory",
            "FIT 导出需要一个目录，这里选中的是一个文件",
        ));
    }
    Ok(path)
}

pub(super) fn validate_export_path(
    value: &str,
    extension: &str,
) -> std::result::Result<PathBuf, AppError> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(AppError::new(
            "err.export.path_required",
            format!("请选择 {} 文件的保存位置", extension.to_ascii_uppercase()),
        )
        .with_params(serde_json::json!({ "format": extension.to_ascii_uppercase() })));
    }
    let path = PathBuf::from(trimmed);
    if !path.is_absolute() {
        return Err(AppError::new(
            "err.export.path_not_absolute",
            "保存位置必须是绝对路径",
        ));
    }
    let matches_extension = path
        .extension()
        .and_then(|value| value.to_str())
        .is_some_and(|value| value.eq_ignore_ascii_case(extension));
    if !matches_extension {
        return Err(AppError::new(
            "err.export.bad_extension",
            format!("导出文件必须使用 .{extension} 扩展名"),
        )
        .with_params(serde_json::json!({ "extension": extension })));
    }
    let Some(parent) = path
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
    else {
        return Err(AppError::new(
            "err.export.path_no_parent",
            "保存位置缺少有效的文件夹",
        ));
    };
    if !parent.is_dir() {
        return Err(AppError::new(
            "err.export.parent_missing",
            "所选保存文件夹不存在",
        ));
    }
    Ok(path)
}
