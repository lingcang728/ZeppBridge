use std::{path::PathBuf, process::Command, thread, time::Duration};
use tauri::AppHandle;

fn installed_path() -> Result<PathBuf, String> {
    let local = std::env::var_os("LOCALAPPDATA")
        .ok_or_else(|| "Windows LOCALAPPDATA 路径不可用".to_string())?;
    Ok(PathBuf::from(local)
        .join("ZeppBridge")
        .join("ZeppBridge.exe"))
}

#[tauri::command]
pub(crate) fn is_portable_update() -> Result<bool, String> {
    let current = std::env::current_exe().map_err(|error| error.to_string())?;
    let installed = installed_path()?;
    Ok(!current
        .to_string_lossy()
        .eq_ignore_ascii_case(&installed.to_string_lossy()))
}

#[tauri::command]
pub(crate) fn launch_migrated_install(app: AppHandle) -> Result<(), String> {
    let installed = installed_path()?;
    for _ in 0..30 {
        if installed.is_file() {
            Command::new(&installed)
                .spawn()
                .map_err(|error| format!("无法启动更新后的安装版：{error}"))?;
            app.exit(0);
            return Ok(());
        }
        thread::sleep(Duration::from_millis(500));
    }
    Err("安装完成后未找到新的 ZeppBridge 安装版".into())
}
