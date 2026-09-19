use crate::ipc_error::AppError;
use tauri::AppHandle;

/// Fail before the updater replaces an app bundle containing a custom library.
#[tauri::command]
pub(crate) fn validate_update_data_location(
    state: tauri::State<'_, crate::app_state::AppState>,
) -> Result<(), AppError> {
    zeppbridge_core::paths::validate_update_data_location(
        &state.data_dir,
        &std::env::current_exe()?,
    )
    .map_err(|error| {
        // 底层那句带路径的英文原因以前被整个吞掉，只留了固定文案——
        // 排查「为什么拒装」时一个字都拿不到。
        crate::diagnostics::log(&format!("更新前数据位置校验未通过: {error}"));
        AppError::new(
            "err.update.unsafe_data_location",
            "无法确认数据目录可安全保留，已停止安装更新",
        )
    })
}

#[cfg(any(windows, test))]
use std::path::{Path, PathBuf};

#[cfg(windows)]
use std::{process::Command, thread, time::Duration};

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
///
/// macOS 同理收窄到 aarch64：CI 只产 `ZeppBridge_*_aarch64.app.tar.gz`
/// （`macos-latest` runner 就是 arm64），x86_64 的 mac 调 `check()` 同样会
/// 撞到「platforms 里找不到 darwin-x86_64」的假失败。
#[tauri::command]
pub(crate) fn self_update_supported() -> bool {
    cfg!(windows) || cfg!(all(target_os = "macos", target_arch = "aarch64"))
}

/// Windows 上这份 exe 算不算便携版。
///
/// MSI 装在 Program Files，NSIS 装在 `%LOCALAPPDATA%\ZeppBridge\`，这两处
/// 都不是便携。其余路径（`release\ZeppBridge.exe` 旁边是 `data\`）才是。
#[cfg(any(windows, test))]
pub(crate) fn looks_like_portable_install(
    current: &Path,
    localappdata: &Path,
    program_files_roots: &[PathBuf],
) -> bool {
    if path_is_under(current, &localappdata.join("ZeppBridge")) {
        return false;
    }
    for root in program_files_roots {
        if path_is_under(current, root) {
            return false;
        }
    }
    true
}

#[cfg(any(windows, test))]
fn path_is_under(path: &Path, root: &Path) -> bool {
    let path = normalize_windows_path(path);
    let mut root = normalize_windows_path(root);
    if root.is_empty() {
        return false;
    }
    if !root.ends_with('\\') {
        root.push('\\');
    }
    path == root.trim_end_matches('\\') || path.starts_with(&root)
}

#[cfg(any(windows, test))]
fn normalize_windows_path(path: &Path) -> String {
    path.to_string_lossy()
        .replace('/', "\\")
        .trim_end_matches(['\\', '/'])
        .to_ascii_lowercase()
}

#[cfg(windows)]
fn program_files_roots() -> Vec<PathBuf> {
    ["ProgramFiles", "ProgramFiles(x86)", "ProgramW6432"]
        .into_iter()
        .filter_map(|key| std::env::var_os(key).map(PathBuf::from))
        .collect()
}

#[tauri::command]
pub(crate) fn is_portable_update() -> Result<bool, AppError> {
    #[cfg(windows)]
    {
        let current = std::env::current_exe()?;
        let local = std::env::var_os("LOCALAPPDATA").ok_or_else(|| {
            AppError::new(
                "err.update.localappdata_missing",
                "Windows LOCALAPPDATA 路径不可用",
            )
        })?;
        Ok(looks_like_portable_install(
            &current,
            Path::new(&local),
            &program_files_roots(),
        ))
    }
    // macOS/.app and other platforms are never portable builds.
    #[cfg(not(windows))]
    {
        Ok(false)
    }
}

#[tauri::command]
pub(crate) async fn launch_migrated_install(app: AppHandle) -> Result<(), AppError> {
    #[cfg(windows)]
    {
        let installed = installed_path()?;
        let found = tokio::task::spawn_blocking(move || {
            for _ in 0..30 {
                if installed.is_file() {
                    return Some(installed);
                }
                thread::sleep(Duration::from_millis(500));
            }
            None
        })
        .await
        .map_err(|_| AppError::new("err.update.launch_failed", "等待安装版就绪时任务被中断"))?;
        let Some(installed) = found else {
            return Err(AppError::new(
                "err.update.installed_build_missing",
                "安装完成后未找到新的 ZeppBridge 安装版",
            ));
        };
        Command::new(&installed).spawn().map_err(|error| {
            AppError::new(
                "err.update.launch_failed",
                format!("无法启动更新后的安装版：{error}"),
            )
        })?;
        app.exit(0);
        Ok(())
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

#[cfg(test)]
mod tests {
    use super::looks_like_portable_install;
    use std::path::{Path, PathBuf};

    fn roots() -> Vec<PathBuf> {
        vec![
            PathBuf::from(r"C:\Program Files"),
            PathBuf::from(r"C:\Program Files (x86)"),
        ]
    }

    #[test]
    fn nsis_localappdata_is_not_portable() {
        assert!(!looks_like_portable_install(
            Path::new(r"C:\Users\me\AppData\Local\ZeppBridge\ZeppBridge.exe"),
            Path::new(r"C:\Users\me\AppData\Local"),
            &roots(),
        ));
    }

    #[test]
    fn msi_program_files_is_not_portable() {
        assert!(!looks_like_portable_install(
            Path::new(r"C:\Program Files\ZeppBridge\ZeppBridge.exe"),
            Path::new(r"C:\Users\me\AppData\Local"),
            &roots(),
        ));
        assert!(!looks_like_portable_install(
            Path::new(r"C:\Program Files (x86)\ZeppBridge\ZeppBridge.exe"),
            Path::new(r"C:\Users\me\AppData\Local"),
            &roots(),
        ));
    }

    #[test]
    fn program_files_x86_does_not_match_program_files_prefix() {
        // 只靠字符串前缀会把 `(x86)` 误判进 `Program Files\`。
        let only_64 = [PathBuf::from(r"C:\Program Files")];
        assert!(looks_like_portable_install(
            Path::new(r"C:\Program Files (x86)\Other\app.exe"),
            Path::new(r"C:\Users\me\AppData\Local"),
            &only_64,
        ));
    }

    #[test]
    fn release_next_to_data_is_portable() {
        assert!(looks_like_portable_install(
            Path::new(r"C:\Users\me\Desktop\MyProject\ZeppBridge\release\ZeppBridge.exe"),
            Path::new(r"C:\Users\me\AppData\Local"),
            &roots(),
        ));
    }
}
