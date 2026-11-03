//! 「换个账号从头开始」。
//!
//! 库在第一次写入时认下一个 Zepp 账号（`storage/owner.rs`），之后换账号会被拒绝；
//! 高级数据和官方授权也必须是同一个账号。用户真要换账号时，以前只能自己关掉应用、
//! 去安装目录里把 `data` 文件夹改名——海外用户根本找不到这一步（2026-10 用户反馈：
//! 卸载重装后旧账号还在，换新账号也连不上）。
//!
//! 运行中的进程握着数据库、日志和 WebView 目录，Windows 上整个目录改不了名，
//! 所以分两步：命令删掉令牌、在数据目录里放一个标记，然后重启；新进程在日志和
//! WebView 打开任何文件之前把整个目录改名成 `data-before-<时间>`。**旧数据一字不删**，
//! 想回去把文件夹名改回来即可。

use std::io;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

pub(super) const MARKER: &str = ".fresh-start";
/// 重启时旧进程可能还没把句柄放完。
const RENAME_WAIT: Duration = Duration::from_secs(15);

/// 排队：下次启动时把这个数据目录整个挪到一边。
pub fn request_fresh_start(data_dir: &Path) -> io::Result<()> {
    std::fs::write(data_dir.join(MARKER), b"1")
}

/// 启动最早期调用（日志、WebView、数据库都还没开）。有排队就改名并建一个空目录，
/// 返回旧数据现在的位置。
pub fn apply_pending_fresh_start(data_dir: &Path) -> io::Result<Option<PathBuf>> {
    apply_with_wait(data_dir, RENAME_WAIT)
}

pub(super) fn apply_with_wait(data_dir: &Path, wait: Duration) -> io::Result<Option<PathBuf>> {
    if !data_dir.join(MARKER).is_file() {
        return Ok(None);
    }
    let target = aside_path(
        data_dir,
        &chrono::Local::now().format("%Y%m%d-%H%M%S").to_string(),
    )?;
    let deadline = Instant::now() + wait;
    loop {
        match std::fs::rename(data_dir, &target) {
            Ok(()) => break,
            Err(_) if Instant::now() < deadline => std::thread::sleep(Duration::from_millis(300)),
            Err(error) => return Err(error),
        }
    }
    std::fs::create_dir_all(data_dir)?;
    // 标记跟着旧目录走了；留着它，把文件夹名改回来时会再被挪走一次。
    let _ = std::fs::remove_file(target.join(MARKER));
    Ok(Some(target))
}

pub(super) fn aside_path(data_dir: &Path, stamp: &str) -> io::Result<PathBuf> {
    let parent = data_dir
        .parent()
        .ok_or_else(|| io::Error::other("data folder has no parent"))?;
    let name = data_dir
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_else(|| "data".to_string());
    let mut candidate = parent.join(format!("{name}-before-{stamp}"));
    let mut n = 2;
    while candidate.exists() {
        candidate = parent.join(format!("{name}-before-{stamp}-{n}"));
        n += 1;
    }
    Ok(candidate)
}
