//! export 子命令：参数解析、写盘、FIT 多文件（从 main.rs 拆出，逻辑不变）。

use super::*;

#[derive(Debug)]
pub(super) struct ExportOptions {
    pub(super) format: String,
    pub(super) out: Option<String>,
    pub(super) selection: ExportSelection,
}

/// 参数必须先通过校验，才能打开数据库或生成输出。
pub(super) fn parse_export_args(args: &[String]) -> Result<ExportOptions, String> {
    let flags = Flags::parse(args)?;
    flags.reject_unknown(&[
        "json", "format", "from", "to", "workout", "types", "detail", "out",
    ])?;
    let mut seen = BTreeSet::new();
    for (name, value) in &flags.values {
        if !seen.insert(name.as_str()) {
            return Err(format!("--{name} must not be repeated"));
        }
        if name == "json" {
            if value.is_some() {
                return Err("--json does not take a value".into());
            }
        } else if value.as_deref().is_none_or(|value| value.trim().is_empty()) {
            return Err(format!("--{name} needs a non-empty value"));
        }
    }

    let format = flags.get("format").unwrap_or("json");
    if !matches!(format, "json" | "csv" | "gpx" | "fit") {
        return Err("--format must be json, csv, gpx or fit".into());
    }
    if format == "fit" && !flags.has("out") {
        return Err(
            "--format fit needs --out to point at a directory: FIT is binary and one file per workout, so it cannot go to stdout"
                .into(),
        );
    }

    // 范围互斥：同时给日期和单条运动是矛盾请求，不定优先级，直接报错。
    let scope = match (flags.get("from"), flags.get("to"), flags.get("workout")) {
        (Some(_), _, Some(_)) | (_, Some(_), Some(_)) => {
            return Err(
                "--from/--to and --workout are mutually exclusive ranges; give only one".into(),
            )
        }
        (Some(from), Some(to), None) => ExportScope::date_range(from, to),
        (Some(_), None, None) | (None, Some(_), None) => {
            return Err("--from and --to must be given together".into())
        }
        (None, None, Some(workout)) => ExportScope::Workout {
            workout_id: workout.to_string(),
        },
        (None, None, None) => {
            return Err("An export range is required: --from/--to or --workout".into())
        }
    }
    .validated()
    .map_err(translate_export_scope_error)?;

    let types: Vec<String> = flags
        .get("types")
        .unwrap_or("workouts,daily_activity,sleep")
        .split(',')
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_ascii_lowercase)
        .collect();
    if types.is_empty() {
        return Err("--types must select at least one data type".into());
    }
    let unknown: Vec<&str> = types
        .iter()
        .map(String::as_str)
        .filter(|value| !EXPORT_DATA_TYPES.contains(value))
        .collect();
    if !unknown.is_empty() {
        return Err(format!(
            "--types does not accept {}; valid types are {}",
            unknown.join(", "),
            EXPORT_DATA_TYPES.join(", ")
        ));
    }
    let detail = match flags.get("detail").unwrap_or("summary") {
        "summary" => ExportDetail::Summary,
        "full" => ExportDetail::Full,
        _ => return Err("--detail must be summary or full".into()),
    };
    // Summary 会聚合逐点指标，并省略运动轨迹；文件导出需要原始明细。
    let detail = if matches!(format, "csv" | "gpx" | "fit") {
        ExportDetail::Full
    } else {
        detail
    };

    Ok(ExportOptions {
        format: format.to_string(),
        out: flags.get("out").map(str::to_string),
        selection: ExportSelection {
            scope: Some(scope),
            start_date: None,
            end_date: None,
            data_types: types,
            detail,
        },
    })
}

pub(super) fn cmd_export(args: &[String]) -> u8 {
    // 解析也可能失败，所以不能等 Flags 构造成功才决定错误的输出格式。
    let json_mode = scan_json_flag(args);
    let options = match parse_export_args(args) {
        Ok(options) => options,
        Err(message) => return fail(json_mode, EXIT_USAGE, "usage", &message),
    };
    let format = options.format.as_str();

    let db = match open_read_only() {
        Ok(db) => db,
        Err((code, message)) => return fail(json_mode, code, error_kind_for(code), &message),
    };
    // 导出的是派生数据。它们要是旧解析器产出的，用户有权在文件生成之前知道
    // 这件事——提示走 stderr，`export > a.csv` 拿到的文件仍然是干净的。
    if let Some(notice) = db
        .pending_replay_plan()
        .ok()
        .flatten()
        .as_ref()
        .and_then(|plan| pending_replay_notice(Some(plan)))
    {
        eprintln!("Note: {notice}");
    }
    // 和 GUI 走同一个 builder：导出语义只在 core 里实现一次。
    let (json_text, records) = match db.build_ai_export(&options.selection) {
        Ok(value) => value,
        Err(error) => {
            let (code, kind) = exit_code_for(&error);
            return fail(json_mode, code, kind, &user_text(&error));
        }
    };

    if format == "fit" {
        return export_fit_files(json_mode, &json_text, options.out.as_deref());
    }

    let (body, count) = match format {
        "json" => (json_text, records),
        other => {
            let parsed: serde_json::Value = match serde_json::from_str(&json_text) {
                Ok(value) => value,
                Err(error) => {
                    return fail(
                        json_mode,
                        EXIT_FAILED,
                        "failed",
                        &format!("The export result could not be parsed: {error}"),
                    )
                }
            };
            let converted = if other == "csv" {
                export_formats::to_csv(&parsed)
            } else {
                export_formats::to_gpx(&parsed)
            };
            match converted {
                Ok(value) => value,
                Err(message) => return fail(json_mode, EXIT_FAILED, "failed", &message),
            }
        }
    };

    match options.out.as_deref() {
        Some(path) => {
            if let Err(error) = paths::write_file_atomically(Path::new(path), body.as_bytes()) {
                return fail(
                    json_mode,
                    EXIT_FAILED,
                    "failed",
                    &format!("Could not write the file: {error}"),
                );
            }
            // 只回显用户自己给的路径，不去解析成绝对路径打印出来。
            emit(
                json_mode,
                serde_json::json!({ "ok": true, "format": format, "records": count, "out": path }),
                &format!("Exported {count} records to {path}"),
            );
        }
        None => {
            // 没有 --out 时正文独占 stdout，条数提示走 stderr，
            // 这样 `zeppbridge-cli export > a.csv` 得到的是干净的文件。
            print!("{body}");
            eprintln!("Exported {count} records ({format})");
        }
    }
    EXIT_OK
}

/// 让 `WriteLockError` 也能落到 busy 码上。
pub(super) fn write_lock_exit(error: &WriteLockError) -> u8 {
    match error {
        WriteLockError::Busy { .. } => EXIT_BUSY,
        WriteLockError::Unavailable(_) => EXIT_FAILED,
    }
}

/// FIT 导出：一次运动一个文件，全部写进 `out` 指向的目录。
///
/// 为什么不支持 stdout：FIT 是二进制，而且一次导出通常是多份文件——把它们拼
/// 进一条流没有任何一端能再拆开。所以这里要求 `--out`，而不是默默写出一个没
/// 人能用的东西。
pub(super) fn export_fit_files(json_mode: bool, json_text: &str, out: Option<&str>) -> u8 {
    let Some(directory) = out else {
        return fail(
            json_mode,
            EXIT_USAGE,
            "usage",
            "--format fit needs --out to point at a directory: FIT is binary and one file per workout, so it cannot go to stdout",
        );
    };

    let parsed: serde_json::Value = match serde_json::from_str(json_text) {
        Ok(value) => value,
        Err(error) => {
            return fail(
                json_mode,
                EXIT_FAILED,
                "failed",
                &format!("The export result could not be parsed: {error}"),
            )
        }
    };

    let (files, points) = match export_fit::to_fit(&parsed) {
        Ok(value) => value,
        Err(message) => return fail(json_mode, EXIT_FAILED, "failed", &message),
    };

    if let Err(error) = std::fs::create_dir_all(directory) {
        return fail(
            json_mode,
            EXIT_FAILED,
            "failed",
            &format!("Could not create the directory: {error}"),
        );
    }
    for (name, bytes) in &files {
        let target = std::path::Path::new(directory).join(name);
        if let Err(error) = paths::write_file_atomically(&target, bytes) {
            return fail(
                json_mode,
                EXIT_FAILED,
                "failed",
                &format!("Could not write the file: {error}"),
            );
        }
    }

    emit(
        json_mode,
        serde_json::json!({
            "ok": true,
            "format": "fit",
            "files": files.len(),
            "records": points,
            "out": directory
        }),
        &format!(
            "Exported {} FIT files ({points} sample points in total) to {directory}",
            files.len()
        ),
    );
    EXIT_OK
}
