//! 设置「交给 AI 工具」卡的「连到 Claude Code / Codex / Claude Desktop」。
//!
//! 安装包把 `zeppbridge-mcp` 作为 sidecar 放在 `ZeppBridge.exe` 旁边（3B 打包决定），
//! 所以应用知道它的真实路径，按钮可以直接给出能用的命令，不用让用户自己找。
//! 这里只回答两件事：sidecar 在哪、它自己能不能找到这份数据；再加一个把
//! Claude Desktop 的 `.mcpb` 写到用户选的目录。

use crate::app_state::AppState;
use crate::ipc_error::AppError;
use serde::Serialize;
use std::io::Write;
use std::path::{Path, PathBuf};
use zeppbridge_core::paths::write_file_atomically;

/// 安装包里附带的 MCP 程序名（不含扩展名）。和 `tauri.sidecar.conf.json` 的
/// `externalBin` 同名；Tauri 打包时会去掉目标三元组后缀。
const SIDECAR_STEM: &str = "zeppbridge-mcp";
/// 写出的 `.mcpb` 文件名。
const BUNDLE_FILE: &str = "ZeppBridge.mcpb";

#[derive(Debug, Clone, Serialize)]
pub struct McpSidecar {
    /// 附带的 `zeppbridge-mcp` 的绝对路径；开发构建或旧安装包没附带时为空。
    pub path: Option<String>,
    /// MCP 默认读「它自己旁边的 data」。和应用实际用的库不是同一处时
    /// （开发构建、`ZEPPBRIDGE_DATA_DIR`、安装目录不可写的回退），配置里要显式
    /// 带上这个环境变量，否则 AI 看到的是一个空库。
    pub data_dir_env: Option<String>,
}

pub(crate) fn locate_sidecar(exe_dir: &Path, data_dir: &Path) -> McpSidecar {
    let candidate = exe_dir.join(format!("{SIDECAR_STEM}{}", std::env::consts::EXE_SUFFIX));
    if !candidate.is_file() {
        return McpSidecar {
            path: None,
            data_dir_env: None,
        };
    }
    let data_dir_env =
        (exe_dir.join("data") != data_dir).then(|| data_dir.to_string_lossy().into_owned());
    McpSidecar {
        path: Some(candidate.to_string_lossy().into_owned()),
        data_dir_env,
    }
}

fn current_sidecar(data_dir: &Path) -> McpSidecar {
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(Path::to_path_buf));
    match exe_dir {
        Some(dir) => locate_sidecar(&dir, data_dir),
        None => McpSidecar {
            path: None,
            data_dir_env: None,
        },
    }
}

#[tauri::command]
pub async fn get_mcp_sidecar(state: tauri::State<'_, AppState>) -> Result<McpSidecar, AppError> {
    Ok(current_sidecar(&state.data_dir))
}

/// `.mcpb` 的 manifest。
///
/// 包里带一份 sidecar 让 `entry_point` 指得到真文件（规范里 binary 型要求
/// 自带可执行文件），但真正启动的是 `command` 指向的安装目录里那一份：
/// 应用升级后 MCP 跟着升级，不会拿旧程序去读新版本的库。
pub(crate) fn bundle_manifest(sidecar_path: &str, data_dir_env: Option<&str>) -> serde_json::Value {
    let entry_point = format!("server/{SIDECAR_STEM}{}", std::env::consts::EXE_SUFFIX);
    let mut mcp_config = serde_json::json!({
        "command": sidecar_path,
        "args": ["--scope", "task"],
    });
    if let Some(dir) = data_dir_env {
        mcp_config["env"] = serde_json::json!({ "ZEPPBRIDGE_DATA_DIR": dir });
    }
    let platform = match std::env::consts::OS {
        "windows" => "win32",
        "macos" => "darwin",
        other => other,
    };
    serde_json::json!({
        "manifest_version": "0.3",
        "name": "zeppbridge",
        "display_name": "ZeppBridge",
        "version": env!("CARGO_PKG_VERSION"),
        "description": "Zepp health and training data from the ZeppBridge desktop app, read on this computer.",
        "author": { "name": "ZeppBridge" },
        "homepage": "https://github.com/lingcang728/ZeppBridge",
        "server": {
            "type": "binary",
            "entry_point": entry_point,
            "mcp_config": mcp_config,
        },
        "compatibility": { "platforms": [platform] },
    })
}

pub(crate) fn build_bundle(
    sidecar: &Path,
    data_dir_env: Option<&str>,
) -> Result<Vec<u8>, AppError> {
    let failed = |detail: String| {
        AppError::new(
            "err.mcp.bundle_failed",
            format!("生成 Claude Desktop 扩展包失败：{detail}"),
        )
    };
    let manifest = bundle_manifest(&sidecar.to_string_lossy(), data_dir_env);
    let binary = std::fs::read(sidecar).map_err(|error| failed(error.to_string()))?;
    let mut writer = zip::ZipWriter::new(std::io::Cursor::new(Vec::new()));
    let options =
        zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);
    let manifest_bytes =
        serde_json::to_vec_pretty(&manifest).map_err(|error| failed(error.to_string()))?;
    let entry_point = manifest["server"]["entry_point"]
        .as_str()
        .unwrap_or_default();
    for (name, bytes) in [
        ("manifest.json", manifest_bytes.as_slice()),
        (entry_point, binary.as_slice()),
    ] {
        writer
            .start_file(name, options)
            .and_then(|()| writer.write_all(bytes).map_err(Into::into))
            .map_err(|error| failed(error.to_string()))?;
    }
    let cursor = writer.finish().map_err(|error| failed(error.to_string()))?;
    Ok(cursor.into_inner())
}

/// 把 `.mcpb` 写进 `directory`，返回完整路径（界面据此在资源管理器里选中它）。
#[tauri::command]
pub async fn save_mcp_bundle(
    state: tauri::State<'_, AppState>,
    directory: String,
) -> Result<String, AppError> {
    let directory = PathBuf::from(directory.trim());
    if directory.as_os_str().is_empty() || !directory.is_absolute() || !directory.is_dir() {
        return Err(AppError::new(
            "err.export.path_not_absolute",
            "保存位置必须是绝对路径",
        ));
    }
    let sidecar = current_sidecar(&state.data_dir);
    let Some(path) = sidecar.path else {
        return Err(AppError::new(
            "err.mcp.sidecar_missing",
            "这个版本没有附带 zeppbridge-mcp",
        ));
    };
    let bytes = tokio::task::spawn_blocking(move || {
        build_bundle(Path::new(&path), sidecar.data_dir_env.as_deref())
    })
    .await
    .map_err(|_| AppError::new("err.mcp.bundle_failed", "生成 Claude Desktop 扩展包失败"))??;
    let target = directory.join(BUNDLE_FILE);
    write_file_atomically(&target, &bytes).map_err(|error| {
        AppError::new(
            "err.mcp.bundle_failed",
            format!("生成 Claude Desktop 扩展包失败：{error}"),
        )
    })?;
    Ok(target.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests;
