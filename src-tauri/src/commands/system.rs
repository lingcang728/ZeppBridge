//! 操作系统的区域格式（日期顺序、12/24 小时制跟它走），给界面「跟随系统地区」用。
//!
//! 和界面语言不是一回事：英文界面的葡萄牙用户，区域格式是 `pt-PT`（日/月/年、24 小时）。
//! 以前「跟随系统地区」跟的是界面语言，于是这类用户只看到 MM/DD（2026-10 反馈）。
//! 取不到就是 `None`，界面退回按界面语言排，和以前一样。

/// 区域格式的语言标签，形如 `pt-PT` / `en_GB.UTF-8`；规范化交给前端。
#[tauri::command]
pub async fn system_region_locale() -> Option<String> {
    tauri::async_runtime::spawn_blocking(detect)
        .await
        .ok()
        .flatten()
}

fn detect() -> Option<String> {
    #[cfg(windows)]
    {
        // `GetUserDefaultLocaleName` 就是「设置 → 时间和语言 → 区域 → 区域格式」那一项。
        crate::windows_ui_locale()
    }
    #[cfg(target_os = "macos")]
    {
        // 从 Finder 启动的应用没有 LANG；「语言与地区」里的地区在 AppleLocale（如 en_PT）。
        std::process::Command::new("/usr/bin/defaults")
            .args(["read", "-g", "AppleLocale"])
            .output()
            .ok()
            .filter(|output| output.status.success())
            .and_then(|output| first_nonempty(&String::from_utf8_lossy(&output.stdout)))
            .or_else(from_env)
    }
    #[cfg(all(not(windows), not(target_os = "macos")))]
    {
        from_env()
    }
}

/// POSIX 的优先级：`LC_ALL` 压过 `LC_TIME`，再退到 `LANG`。`C` / `POSIX` 不是区域。
#[cfg_attr(windows, allow(dead_code))]
fn from_env() -> Option<String> {
    ["LC_ALL", "LC_TIME", "LANG"].into_iter().find_map(|key| {
        let value = std::env::var(key).ok()?;
        first_nonempty(&value).filter(|value| value != "C" && value != "POSIX")
    })
}

#[cfg_attr(windows, allow(dead_code))]
fn first_nonempty(value: &str) -> Option<String> {
    let trimmed = value.trim();
    (!trimmed.is_empty()).then(|| trimmed.to_string())
}
