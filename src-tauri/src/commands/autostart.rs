//! 开机自启（tauri-plugin-autostart）与「开机启动后只留在托盘」。
//!
//! 系统里登记的是**当时那个程序的路径**：Windows 写 HKCU 的 Run 键，macOS 写 LaunchAgent，
//! Linux 写 `~/.config/autostart/*.desktop`（AppImage 登记 `$APPIMAGE`，不是挂载出来的临时路径）。
//! 便携版换了位置、AppImage 挪了目录，登记的路径就失效了——这时开关显示为关，用户再打开一次
//! 就会按新路径重新登记。为了看得出失效，打开时把登记的路径记在数据目录的 `autostart.json` 里，
//! 读状态时和当前路径比一比。
//!
//! 「只留在托盘」只对开机自启生效：系统启动它时带着 [`AUTOSTART_ARG`]，手动双击不带，照常开窗。

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_autostart::ManagerExt;

use crate::ipc_error::AppError;

/// 系统开机启动本程序时带的参数。
pub(crate) const AUTOSTART_ARG: &str = "--autostart";
const PREFS_FILE: &str = "autostart.json";

#[derive(Debug, Default, Clone, Serialize, Deserialize, PartialEq, Eq)]
struct AutostartPrefs {
    /// 打开开机自启时登记的程序路径。
    #[serde(default)]
    registered_path: Option<String>,
    #[serde(default)]
    tray_only: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct AutostartState {
    /// 系统里登记着、且登记的正是现在这个程序。
    pub enabled: bool,
    /// 登记着，但指向别处（程序挪过位置）：界面显示为关。
    pub stale: bool,
    pub tray_only: bool,
}

fn prefs_path(data_dir: &Path) -> PathBuf {
    data_dir.join(PREFS_FILE)
}

fn read_prefs(data_dir: &Path) -> AutostartPrefs {
    std::fs::read(prefs_path(data_dir))
        .ok()
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        .unwrap_or_default()
}

fn write_prefs(data_dir: &Path, prefs: &AutostartPrefs) -> Result<(), AppError> {
    let bytes = serde_json::to_vec_pretty(prefs).map_err(|error| {
        AppError::new(
            "err.autostart.save",
            format!("保存开机自启设置失败：{error}"),
        )
    })?;
    std::fs::write(prefs_path(data_dir), bytes).map_err(|error| {
        AppError::new(
            "err.autostart.save",
            format!("保存开机自启设置失败：{error}"),
        )
    })
}

/// 系统会去启动的那个路径：和插件登记时用的同一个（AppImage 用 `$APPIMAGE`）。
fn launch_target<R: Runtime>(app: &AppHandle<R>) -> Option<String> {
    #[cfg(target_os = "linux")]
    if let Some(appimage) = app.env().appimage {
        return appimage.to_str().map(str::to_string);
    }
    #[cfg(not(target_os = "linux"))]
    let _ = app;
    std::env::current_exe()
        .ok()
        .map(|path| path.display().to_string())
}

fn data_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, AppError> {
    app.try_state::<crate::ExitDataDir>()
        .map(|dir| dir.0.clone())
        .ok_or_else(|| AppError::new("err.autostart.not_ready", "数据目录还没准备好"))
}

fn state_from(registered: bool, prefs: &AutostartPrefs, target: Option<&str>) -> AutostartState {
    let current = registered
        && prefs.registered_path.as_deref().is_some()
        && prefs.registered_path.as_deref() == target;
    AutostartState {
        enabled: current,
        stale: registered && !current,
        tray_only: prefs.tray_only,
    }
}

fn read_state<R: Runtime>(app: &AppHandle<R>) -> Result<AutostartState, AppError> {
    let registered = app.autolaunch().is_enabled().map_err(|error| {
        AppError::new(
            "err.autostart.read",
            format!("读取开机自启状态失败：{error}"),
        )
    })?;
    let prefs = read_prefs(&data_dir(app)?);
    Ok(state_from(
        registered,
        &prefs,
        launch_target(app).as_deref(),
    ))
}

#[tauri::command]
pub async fn autostart_state(app: AppHandle) -> Result<AutostartState, AppError> {
    tauri::async_runtime::spawn_blocking(move || read_state(&app))
        .await
        .map_err(|error| {
            AppError::new(
                "err.autostart.read",
                format!("读取开机自启状态失败：{error}"),
            )
        })?
}

#[tauri::command]
pub async fn set_autostart(
    app: AppHandle,
    enabled: bool,
    tray_only: bool,
) -> Result<AutostartState, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        let dir = data_dir(&app)?;
        let mut prefs = read_prefs(&dir);
        prefs.tray_only = tray_only;
        let launcher = app.autolaunch();
        if enabled {
            // 先撤掉旧登记再登记：路径失效时旧的那条指向别处，覆盖写进去的才是现在这个程序。
            let _ = launcher.disable();
            launcher.enable().map_err(|error| {
                AppError::new("err.autostart.enable", format!("打开开机自启失败：{error}"))
            })?;
            prefs.registered_path = launch_target(&app);
        } else {
            launcher.disable().map_err(|error| {
                AppError::new(
                    "err.autostart.disable",
                    format!("关闭开机自启失败：{error}"),
                )
            })?;
            prefs.registered_path = None;
        }
        write_prefs(&dir, &prefs)?;
        read_state(&app)
    })
    .await
    .map_err(|error| {
        AppError::new(
            "err.autostart.save",
            format!("保存开机自启设置失败：{error}"),
        )
    })?
}

/// 这一次是不是系统开机启动、且用户要它只留在托盘。启动时在托盘建好之后问一次。
pub(crate) fn start_in_tray(data_dir: &Path) -> bool {
    std::env::args().any(|arg| arg == AUTOSTART_ARG) && read_prefs(data_dir).tray_only
}

#[cfg(test)]
mod tests {
    use super::*;

    fn prefs(path: Option<&str>, tray_only: bool) -> AutostartPrefs {
        AutostartPrefs {
            registered_path: path.map(str::to_string),
            tray_only,
        }
    }

    #[test]
    fn a_registration_pointing_at_another_copy_reads_as_off() {
        let moved = state_from(
            true,
            &prefs(Some("D:/old/ZeppBridge.exe"), true),
            Some("E:/new/ZeppBridge.exe"),
        );
        assert_eq!(
            moved,
            AutostartState {
                enabled: false,
                stale: true,
                tray_only: true
            }
        );
        let here = state_from(
            true,
            &prefs(Some("E:/new/ZeppBridge.exe"), false),
            Some("E:/new/ZeppBridge.exe"),
        );
        assert!(here.enabled && !here.stale);
        // 系统里没有登记：不管记过什么路径都是关，也不算失效。
        let none = state_from(
            false,
            &prefs(Some("E:/new/ZeppBridge.exe"), false),
            Some("E:/new/ZeppBridge.exe"),
        );
        assert!(!none.enabled && !none.stale);
        // 登记着但不是本程序登记的（没记下路径）：当作失效，再打开一次就按现在的路径重登。
        let unknown = state_from(true, &prefs(None, false), Some("E:/new/ZeppBridge.exe"));
        assert!(!unknown.enabled && unknown.stale);
    }

    #[test]
    fn prefs_survive_a_round_trip_and_tolerate_a_missing_file() {
        let dir = std::env::temp_dir().join(format!("zb-autostart-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        assert_eq!(read_prefs(&dir), AutostartPrefs::default());
        let saved = prefs(Some("C:/apps/ZeppBridge.exe"), true);
        write_prefs(&dir, &saved).unwrap();
        assert_eq!(read_prefs(&dir), saved);
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
