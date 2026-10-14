//! 导出命令：运动详情的 FIT 写盘、交给 AI 的打包、导出目录校验。
//!
//! JSON / CSV / GPX 的写盘命令只有旧 Explore 页在用，随它一起删了；CLI 的
//! `export` 直接调 core，不经过这里。

use super::*;

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

    // 逐秒序列是 FIT 这种归档格式的全部意义，所以不管界面上勾的是什么，
    // 这里都读完整载荷。
    selection.detail = ExportDetail::Full;
    // 只读：走独立只读连接，不排在命令侧写连接的锁后面。
    let (export, record_count) = spawn_independent_read(state.data_dir.clone(), move |db| {
        db.build_ai_export_value(&selection)
    })
    .await?;
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

/// Prepare a privacy-preserving payload for an external AI provider.
///
/// This deliberately calls the same database export builder as the FIT export
/// and the CLI, then applies a second, recursive redaction pass.
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

    let (export, record_count) = spawn_independent_read(state.data_dir.clone(), move |db| {
        db.build_ai_export_value(&selection)
    })
    .await?;
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

/// FIT 导出的目标目录。
///
/// 只做「说得清」的检查：非空、绝对路径、不是文件。刻意
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
