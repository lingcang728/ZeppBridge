use crate::ipc_error::AppError;
use tauri::AppHandle;

#[cfg(windows)]
use std::{path::PathBuf, process::Command, thread, time::Duration};

/// The portable-update migration path is a Windows-only concept: the portable
/// build lives in a user-writable folder next to a future install, while
/// macOS ships a single `.app` bundle with no portable variant.
#[cfg(windows)]
fn installed_path() -> Result<PathBuf, AppError> {
    let local = std::env::var_os("LOCALAPPDATA").ok_or_else(|| {
        AppError::new(
            "err.update.localappdata_missing",
            "Windows LOCALAPPDATA 路径不可用",
        )
    })?;
    Ok(PathBuf::from(local)
        .join("ZeppBridge")
        .join("ZeppBridge.exe"))
}

/// 这个构建能不能自己更新自己。
///
/// Linux 上的每一条分发渠道都由别人管着更新：Flatpak 走 `flatpak update`，
/// deb/rpm 走发行版的包管理器。安装前缀（`/app`、`/usr/bin`）对应用进程是
/// 只读的，能写进去也不该写——那会和包管理器的记账打架。
///
/// 之所以要有这么一个开关，而不是让前端直接调 `check()`：latest.json 里没有
/// linux 的条目，`check()` 会抛「响应的 platforms 里找不到 linux-x86_64」。
/// 那句话会以「更新失败」的样子出现在设置页上，而实际上什么都没坏，用户也
/// 无事可做。一个说不出所以然的红字比不检查更糟。
#[tauri::command]
pub(crate) fn self_update_supported() -> bool {
    cfg!(any(windows, target_os = "macos"))
}

#[tauri::command]
pub(crate) fn is_portable_update() -> Result<bool, AppError> {
    #[cfg(windows)]
    {
        let current = std::env::current_exe()?;
        let installed = installed_path()?;
        Ok(!current
            .to_string_lossy()
            .eq_ignore_ascii_case(&installed.to_string_lossy()))
    }
    // macOS/.app and other platforms are never portable builds.
    #[cfg(not(windows))]
    {
        Ok(false)
    }
}

#[tauri::command]
pub(crate) fn launch_migrated_install(app: AppHandle) -> Result<(), AppError> {
    #[cfg(windows)]
    {
        let installed = installed_path()?;
        for _ in 0..30 {
            if installed.is_file() {
                Command::new(&installed).spawn().map_err(|error| {
                    AppError::new(
                        "err.update.launch_failed",
                        format!("无法启动更新后的安装版：{error}"),
                    )
                })?;
                app.exit(0);
                return Ok(());
            }
            thread::sleep(Duration::from_millis(500));
        }
        Err(AppError::new(
            "err.update.installed_build_missing",
            "安装完成后未找到新的 ZeppBridge 安装版",
        ))
    }
    // Never reached on non-Windows: the frontend only calls this when
    // `is_portable_update()` returned true.
    #[cfg(not(windows))]
    {
        let _ = app;
        Err(AppError::new(
            "err.update.portable_windows_only",
            "便携版安装迁移仅支持 Windows",
        ))
    }
}
