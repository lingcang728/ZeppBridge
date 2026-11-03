//! 交给系统打开的链接和文件夹（系统浏览器、文件管理器）。
//!
//! 只为 AppImage 多绕一步。AppImage 的运行时启动我们之前会把 `LD_LIBRARY_PATH`、
//! `GIO_MODULE_DIR`、`GDK_PIXBUF_MODULE_FILE`、`GTK_PATH` 这一类变量指进挂载目录，
//! 并把挂载目录插到 `PATH` / `XDG_DATA_DIRS` 前面。`xdg-open` 拉起来的浏览器原样继承它们，
//! 去加载我们打包的那批旧 GTK / GIO 模块，于是一声不吭地退出——`xdg-open` 自己却返回成功，
//! 应用以为浏览器开了，界面一直停在「等待浏览器授权」。（3.0 的 Linux 反馈：AppImage 点登录不弹浏览器。）
//!
//! 所以在 AppImage 里由我们自己调 `xdg-open`，先把这些变量恢复成宿主机的样子；
//! deb / rpm / Flatpak 和其他平台照旧走 opener 插件。

use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;

/// AppImage 运行时或它打包的 GTK / GStreamer / Python 钩子设的变量：整条删掉。
const APPIMAGE_ONLY_VARS: &[&str] = &[
    "LD_LIBRARY_PATH",
    "LD_PRELOAD",
    "GIO_MODULE_DIR",
    "GIO_EXTRA_MODULES",
    "GDK_PIXBUF_MODULE_FILE",
    "GDK_PIXBUF_MODULEDIR",
    "GTK_PATH",
    "GTK_DATA_PREFIX",
    "GTK_EXE_PREFIX",
    "GTK_IM_MODULE_FILE",
    "GTK_THEME",
    "GSETTINGS_SCHEMA_DIR",
    "GST_PLUGIN_PATH",
    "GST_PLUGIN_PATH_1_0",
    "GST_PLUGIN_SYSTEM_PATH",
    "GST_PLUGIN_SYSTEM_PATH_1_0",
    "GST_PLUGIN_SCANNER",
    "GST_PLUGIN_SCANNER_1_0",
    "PYTHONHOME",
    "PYTHONPATH",
    "PERLLIB",
    "QT_PLUGIN_PATH",
    "APPDIR",
    "APPIMAGE",
    "ARGV0",
    "OWD",
];

/// 冒号分隔、被 AppImage 往前插了挂载目录的变量：只去掉挂载目录那几段。
const PATH_LIKE_VARS: &[&str] = &["PATH", "XDG_DATA_DIRS", "XDG_CONFIG_DIRS"];

/// 给子进程的环境改动：`None` = 删掉这个变量，`Some(值)` = 改成这个值。
///
/// 纯函数，方便在任何平台上测；`appdir` 是 AppImage 的挂载目录（`APPDIR`）。
pub(crate) fn appimage_env_fixes(
    vars: impl IntoIterator<Item = (String, String)>,
    appdir: &str,
) -> Vec<(String, Option<String>)> {
    let appdir = appdir.trim_end_matches('/');
    let mut fixes = Vec::new();
    for (name, value) in vars {
        if APPIMAGE_ONLY_VARS.contains(&name.as_str()) {
            fixes.push((name, None));
        } else if PATH_LIKE_VARS.contains(&name.as_str()) && !appdir.is_empty() {
            let kept: Vec<&str> = value
                .split(':')
                .filter(|part| {
                    !part.is_empty() && *part != appdir && !part.starts_with(&format!("{appdir}/"))
                })
                .collect();
            let joined = kept.join(":");
            if joined != value {
                fixes.push((name, (!joined.is_empty()).then_some(joined)));
            }
        }
    }
    fixes
}

/// 在 AppImage 里吗？是的话返回挂载目录。
fn appimage_dir() -> Option<String> {
    if !cfg!(target_os = "linux") {
        return None;
    }
    std::env::var_os("APPIMAGE")?;
    Some(
        std::env::var("APPDIR")
            .ok()
            .filter(|dir| !dir.is_empty())
            .unwrap_or_default(),
    )
}

/// 用宿主机的环境跑一次 `xdg-open <target>`。
fn host_xdg_open(target: &std::ffi::OsStr, appdir: &str) -> std::io::Result<()> {
    let mut command = std::process::Command::new("xdg-open");
    command.arg(target);
    for (name, value) in appimage_env_fixes(std::env::vars(), appdir) {
        match value {
            Some(value) => command.env(name, value),
            None => command.env_remove(name),
        };
    }
    command.spawn().map(|_| ())
}

/// 用系统浏览器打开一个链接。
pub(crate) fn open_url(app: &AppHandle, url: &str) -> Result<(), String> {
    if let Some(appdir) = appimage_dir() {
        return host_xdg_open(url.as_ref(), &appdir).map_err(|error| error.to_string());
    }
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|error| error.to_string())
}

/// 用文件管理器打开一个文件夹（Linux 走 `xdg-open`）。
#[cfg(target_os = "linux")]
pub(crate) fn open_folder(path: &std::path::Path) -> std::io::Result<()> {
    match appimage_dir() {
        Some(appdir) => host_xdg_open(path.as_os_str(), &appdir),
        None => std::process::Command::new("xdg-open")
            .arg(path)
            .spawn()
            .map(|_| ()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixes(vars: &[(&str, &str)]) -> Vec<(String, Option<String>)> {
        appimage_env_fixes(
            vars.iter()
                .map(|(name, value)| (name.to_string(), value.to_string())),
            "/tmp/.mount_ZeppBrAbc",
        )
    }

    #[test]
    fn the_browser_gets_the_host_environment_back() {
        let out = fixes(&[
            ("LD_LIBRARY_PATH", "/tmp/.mount_ZeppBrAbc/usr/lib"),
            (
                "GIO_MODULE_DIR",
                "/tmp/.mount_ZeppBrAbc/usr/lib/gio/modules",
            ),
            (
                "PATH",
                "/tmp/.mount_ZeppBrAbc/usr/bin:/usr/local/bin:/usr/bin",
            ),
            (
                "XDG_DATA_DIRS",
                "/tmp/.mount_ZeppBrAbc/usr/share:/usr/share",
            ),
            ("XDG_CONFIG_DIRS", "/tmp/.mount_ZeppBrAbc/etc/xdg"),
            ("HOME", "/home/me"),
            ("DISPLAY", ":0"),
        ]);
        assert_eq!(
            out,
            [
                ("LD_LIBRARY_PATH".to_string(), None),
                ("GIO_MODULE_DIR".to_string(), None),
                (
                    "PATH".to_string(),
                    Some("/usr/local/bin:/usr/bin".to_string())
                ),
                ("XDG_DATA_DIRS".to_string(), Some("/usr/share".to_string())),
                ("XDG_CONFIG_DIRS".to_string(), None),
            ]
        );
    }

    #[test]
    fn a_path_without_the_mount_is_left_alone() {
        assert!(fixes(&[("PATH", "/usr/bin:/bin"), ("LANG", "de_DE.UTF-8")]).is_empty());
        // 前缀相同但不是挂载目录本身的路径不算。
        assert!(fixes(&[("PATH", "/tmp/.mount_ZeppBrAbcdef/bin:/usr/bin")]).is_empty());
    }
}
