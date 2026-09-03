//! 起不来的时候要说话。
//!
//! 在这个文件出现之前，ZeppBridge 在 Windows 上失败是**完全无声**的：
//! `main.rs` 有 `windows_subsystem = "windows"`，所有 `eprintln!` 没有终端可写；
//! 全项目一个日志文件都没有；而 `lib.rs` 的 `setup()` 对数据目录解析和
//! `AppState::new()` 用的是 `?`——任何一步失败，进程直接退出。用户看到的是：
//! 一个黑窗口闪一下（那是别的东西），通知区里剩一个已经画好的死图标，
//! 点「Open ZeppBridge」没有任何反应，重装也没用。他手上没有任何可以发过来的
//! 东西，我们也没有任何可以看的东西。见 2026-09-03 那封 Reddit 私信。
//!
//! 这里提供两件事：
//!
//! * [`init`] / [`log`]：一份带轮转的日志文件，落在数据目录旁边，用户能直接
//!   把它发过来。
//! * [`fatal_startup`]：启动致命错误的出口——写一份 `startup-error.log`，
//!   并在 Windows 上弹一个原生对话框，把**具体路径和系统错误**摆给用户看，
//!   然后才让进程退出。

use std::fmt::Display;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

/// 单个日志文件的上限。够装几十次启动的记录，又不至于让用户在发文件时犯难。
const MAX_LOG_BYTES: u64 = 2 * 1024 * 1024;
/// 轮转保留几份历史（`zeppbridge.log.1` … `.3`）。
const KEPT_LOGS: usize = 3;

static LOG_FILE: OnceLock<Option<PathBuf>> = OnceLock::new();
/// 写日志是跨线程的（启动线程、后台重放线程、命令线程都会写），而轮转要在
/// 「判断大小」和「改名」之间保持原子。一把进程内的锁就够——跨进程的那把在
/// `storage::write_lock`，日志不需要那么强。
static WRITE_LOCK: Mutex<()> = Mutex::new(());

/// 日志目录：数据目录旁边的 `logs/`。
pub fn log_dir(data_dir: &Path) -> PathBuf {
    data_dir.join("logs")
}

/// 连数据目录都没解析出来时的退路。
///
/// 这正是最需要日志的那一刻，所以它不能依赖前一步成功。
fn fallback_log_dir() -> Option<PathBuf> {
    #[cfg(windows)]
    {
        std::env::var_os("LOCALAPPDATA")
            .map(|base| PathBuf::from(base).join("ZeppBridge").join("logs"))
    }
    #[cfg(not(windows))]
    {
        Some(std::env::temp_dir().join("zeppbridge-logs"))
    }
}

/// 装好日志文件。`data_dir` 为 `None` 表示数据目录这一步就已经失败了。
///
/// 多次调用只有第一次生效（`OnceLock`）：启动早期先用退路装一次，数据目录
/// 定下来之后再调一次是无害的，但那时**不会**换目录——换目录会让同一次启动的
/// 记录裂成两个文件，而排查时最想看的恰恰是连续的那一段。
pub fn init(data_dir: Option<&Path>) {
    let _ = LOG_FILE.get_or_init(|| {
        let dir = data_dir.map(log_dir).or_else(fallback_log_dir)?;
        fs::create_dir_all(&dir).ok()?;
        let path = dir.join("zeppbridge.log");
        rotate_if_needed(&path);
        Some(path)
    });
    log(&format!(
        "启动 ZeppBridge {} / {} / exe={} / data_dir={}",
        env!("CARGO_PKG_VERSION"),
        std::env::consts::OS,
        std::env::current_exe()
            .map(|p| p.display().to_string())
            .unwrap_or_else(|_| "(未知)".into()),
        data_dir
            .map(|p| p.display().to_string())
            .unwrap_or_else(|| "(未解析)".into()),
    ));
}

/// 追加一行。永远不会 panic，也永远不会因为写不进去而影响调用方。
pub fn log(message: &str) {
    // 开发构建有终端，保留 stderr 那一份，省得改开发习惯。
    #[cfg(debug_assertions)]
    eprintln!("{message}");

    let Some(Some(path)) = LOG_FILE.get() else {
        return;
    };
    let stamp = chrono::Local::now().format("%Y-%m-%d %H:%M:%S%.3f");
    let Ok(_guard) = WRITE_LOCK.lock() else {
        return;
    };
    rotate_if_needed(path);
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
        let _ = writeln!(file, "[{stamp}] {message}");
    }
}

/// 超过上限就把 `.log` 挪成 `.log.1`，历史依次后移，最老的一份丢掉。
fn rotate_if_needed(path: &Path) {
    let Ok(meta) = fs::metadata(path) else {
        return;
    };
    if meta.len() < MAX_LOG_BYTES {
        return;
    }
    let _ = fs::remove_file(path.with_extension(format!("log.{KEPT_LOGS}")));
    for index in (1..KEPT_LOGS).rev() {
        let from = path.with_extension(format!("log.{index}"));
        let to = path.with_extension(format!("log.{}", index + 1));
        let _ = fs::rename(from, to);
    }
    let _ = fs::rename(path, path.with_extension("log.1"));
}

/// 启动阶段的致命错误：写文件 + 弹窗，然后由调用方决定退出。
///
/// 返回的是给 `setup()` 往上抛的那个错误，所以调用点读起来仍然是一行。
pub fn fatal_startup(context: &str, error: impl Display) -> anyhow::Error {
    let detail = format!("{context}：{error}");
    log(&format!("启动失败——{detail}"));

    let target = LOG_FILE
        .get()
        .and_then(|slot| slot.clone())
        .and_then(|path| path.parent().map(Path::to_path_buf))
        .or_else(fallback_log_dir);
    let mut where_to_look = String::new();
    if let Some(dir) = target {
        let _ = fs::create_dir_all(&dir);
        let file = dir.join("startup-error.log");
        let stamp = chrono::Local::now().format("%Y-%m-%d %H:%M:%S");
        let body = format!(
            "[{stamp}] ZeppBridge {} 启动失败\r\n{detail}\r\n",
            env!("CARGO_PKG_VERSION")
        );
        if fs::write(&file, body).is_ok() {
            where_to_look = format!("\r\n\r\n详细信息已写入：\r\n{}", file.display());
        }
    }

    show_native_error(&format!(
        "ZeppBridge 无法启动 / ZeppBridge failed to start\r\n\r\n{detail}{where_to_look}"
    ));
    anyhow::anyhow!(detail)
}

/// 测试里不弹窗。
///
/// 不是为了好看：`MessageBoxW` 会抢前台焦点并阻塞到有人点确定，
/// 而单元测试和 CI 都没有那个人。
#[cfg(test)]
fn show_native_error(_text: &str) {}

#[cfg(all(windows, not(test)))]
fn show_native_error(text: &str) {
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        MessageBoxW, MB_ICONERROR, MB_OK, MB_SETFOREGROUND, MB_TOPMOST,
    };

    let wide = |value: &str| {
        value
            .encode_utf16()
            .chain(std::iter::once(0))
            .collect::<Vec<u16>>()
    };
    let body = wide(text);
    let caption = wide("ZeppBridge");
    // 这一刻还没有任何窗口，所以 owner 传 null。TOPMOST | SETFOREGROUND 是为了
    // 不让它出现在别的窗口后面——用户此时看到的只有一个「什么都没发生」。
    unsafe {
        MessageBoxW(
            std::ptr::null_mut(),
            body.as_ptr(),
            caption.as_ptr(),
            MB_OK | MB_ICONERROR | MB_TOPMOST | MB_SETFOREGROUND,
        );
    }
}

#[cfg(all(not(windows), not(test)))]
fn show_native_error(text: &str) {
    // macOS 的 .app 和 Linux 的桌面项同样没有终端，但这里不去派生 osascript /
    // zenity：启动已经失败了，再拉一个外部进程只会多一种失败方式。日志文件是
    // 这两个平台上的可靠出口，路径已经写在上面那条日志里。
    eprintln!("{text}");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rotation_keeps_the_newest_and_drops_the_oldest() {
        let dir = std::env::temp_dir().join("zeppbridge-log-rotation-test");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("zeppbridge.log");
        fs::write(&path, vec![b'x'; MAX_LOG_BYTES as usize + 1]).unwrap();
        rotate_if_needed(&path);
        assert!(!path.exists(), "超限的那份应当被挪走");
        assert!(path.with_extension("log.1").exists());
        let _ = fs::remove_dir_all(&dir);
    }

    /// 启动致命错误必须落成一份用户能直接发过来的文件。
    ///
    /// 弹框那一半在测试里是空实现（它会抢焦点），这里盯的是文件：
    /// 以前这一完全不存在，用户手里一个字都没有。
    #[test]
    fn a_fatal_startup_error_lands_in_a_file_the_user_can_send() {
        let dir = std::env::temp_dir().join("zeppbridge-fatal-startup-test");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        // 直接指定日志位置：`init` 是 `OnceLock`，测试之间不能互相依赖顺序。
        let _ = LOG_FILE.set(Some(dir.join("zeppbridge.log")));

        let error = fatal_startup(
            r"无法使用数据文件夹 C:\Program Files\ZeppBridge\data",
            std::io::Error::new(std::io::ErrorKind::PermissionDenied, "access is denied"),
        );
        // 抛回去的那句话要带着路径和系统错误，不能只是「启动失败」。
        let text = error.to_string();
        assert!(text.contains(r"ZeppBridge\data"), "{text}");
        assert!(text.contains("access is denied"), "{text}");

        let written = fs::read_to_string(dir.join("startup-error.log")).expect("应当写出来了");
        assert!(written.contains("access is denied"), "{written}");
        assert!(written.contains(env!("CARGO_PKG_VERSION")), "{written}");
        // 同一件事也要进常规日志，否则时间线就断在这里。
        let log = fs::read_to_string(dir.join("zeppbridge.log")).expect("常规日志也要有一行");
        assert!(log.contains("启动失败"), "{log}");

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn rotation_leaves_a_small_file_alone() {
        let dir = std::env::temp_dir().join("zeppbridge-log-small-test");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("zeppbridge.log");
        fs::write(&path, b"one line").unwrap();
        rotate_if_needed(&path);
        assert!(path.exists());
        assert!(!path.with_extension("log.1").exists());
        let _ = fs::remove_dir_all(&dir);
    }
}
