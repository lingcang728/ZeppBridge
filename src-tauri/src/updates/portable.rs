//! 便携版的原地替换（静默更新）。
//!
//! 便携版就是一个文件夹：`ZeppBridge.exe`、`zeppbridge-mcp.exe`，旁边是 `data\`。它的更新包是
//! 一份签过名的 zip，只装这两个程序（CI 的 `scripts/release/package-portable.ps1` 打出来，
//! `latest.json` 里的 `windows-x86_64-portable` 条目）。签名由 updater 插件在下载时按内置公钥核对，
//! 到这里的字节已经验过。
//!
//! Windows 不让覆盖正在运行的 exe，但允许给它改名，所以不用另起一个助手进程等主进程退出：
//!
//! 1. 把包解到 exe 旁边的暂存目录（同一个卷，后面的改名不会跨盘变成复制）；
//! 2. 逐个把现有文件改名成 `*.old`，再把新文件改名到原位；任何一步失败，按相反顺序全部改回去，
//!    文件夹回到更新前的样子；
//! 3. 调用方拉起新 exe（带 [`AFTER_UPDATE_ARG`]）后退出。新进程在初始化单实例之前先等
//!    `ZeppBridge.exe.old` 删得掉——删得掉就说明旧进程已经退了（[`wait_for_previous`]）。
//!
//! `zeppbridge-mcp.exe.old` 可能还被某个 AI 客户端开着，删不掉就留着，下次启动再删（[`sweep`]）。

use std::io::{self, Read};
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

/// 包里主程序的名字。替换的是**当前正在跑的这个 exe**，不管它被用户改成了什么名字。
const APP_ENTRY: &str = "ZeppBridge.exe";
/// 包里 MCP 的名字（和 tauri.sidecar.conf.json 的 externalBin 打出来的一致）。
const MCP_ENTRY: &str = "zeppbridge-mcp.exe";
const STAGING_DIR: &str = ".update-staging";
const OLD_SUFFIX: &str = "old";
/// 单个文件的上限：真实的 exe 几十 MB，超过这个数的条目不是我们打的包。
const MAX_ENTRY_BYTES: u64 = 512 * 1024 * 1024;

/// 新进程的启动参数：先等旧进程退出再初始化。
pub(crate) const AFTER_UPDATE_ARG: &str = "--after-update";

/// 解好、等着换上去的文件：（暂存路径，目标路径）。
#[derive(Debug)]
pub(crate) struct Staged {
    staging: PathBuf,
    files: Vec<(PathBuf, PathBuf)>,
}

fn invalid(message: impl Into<String>) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, message.into())
}

fn exe_dir(exe: &Path) -> io::Result<&Path> {
    exe.parent().ok_or_else(|| invalid("程序路径没有上级目录"))
}

/// 把更新包解到暂存目录。包里只许有 `ZeppBridge.exe`（必须有）和 `zeppbridge-mcp.exe`，
/// 平铺、不带目录——别的条目一律拒绝，不往用户文件夹里写任何意料之外的东西。
pub(crate) fn stage(exe: &Path, payload: &[u8]) -> io::Result<Staged> {
    let dir = exe_dir(exe)?;
    let mut archive = zip::ZipArchive::new(io::Cursor::new(payload))
        .map_err(|error| invalid(format!("更新包不是有效的 zip：{error}")))?;
    let mut plan = Vec::new();
    for index in 0..archive.len() {
        let entry = archive
            .by_index(index)
            .map_err(|error| invalid(format!("读不出更新包第 {index} 项：{error}")))?;
        let name = entry.name().to_string();
        let dest = if name.eq_ignore_ascii_case(APP_ENTRY) {
            exe.to_path_buf()
        } else if name.eq_ignore_ascii_case(MCP_ENTRY) {
            dir.join(MCP_ENTRY)
        } else {
            return Err(invalid(format!("更新包里有意料之外的条目：{name}")));
        };
        if entry.size() == 0 || entry.size() > MAX_ENTRY_BYTES {
            return Err(invalid(format!("更新包里的 {name} 大小不对")));
        }
        if plan
            .iter()
            .any(|(_, existing): &(usize, PathBuf)| existing == &dest)
        {
            return Err(invalid(format!("更新包里 {name} 出现了两次")));
        }
        plan.push((index, dest));
    }
    if !plan.iter().any(|(_, dest)| dest == exe) {
        return Err(invalid("更新包里没有主程序"));
    }

    let staging = dir.join(STAGING_DIR);
    remove_dir_if_present(&staging)?;
    std::fs::create_dir_all(&staging)?;
    let mut files = Vec::new();
    for (index, dest) in plan {
        let mut entry = archive
            .by_index(index)
            .map_err(|error| invalid(format!("读不出更新包第 {index} 项：{error}")))?;
        let mut bytes = Vec::with_capacity(entry.size() as usize);
        entry
            .by_ref()
            .take(MAX_ENTRY_BYTES)
            .read_to_end(&mut bytes)?;
        let name = dest.file_name().ok_or_else(|| invalid("目标没有文件名"))?;
        let staged = staging.join(name);
        std::fs::write(&staged, bytes)?;
        files.push((staged, dest));
    }
    Ok(Staged { staging, files })
}

/// 第一个空着的 `*.old` 名字。上一次更新留下的 `.old` 可能还被占着（MCP 还在跑），
/// 删不掉就往后编号，不因为它挡住这次更新。
fn free_old_name(dest: &Path) -> io::Result<PathBuf> {
    for attempt in 0..16 {
        let suffix = if attempt == 0 {
            OLD_SUFFIX.to_string()
        } else {
            format!("{OLD_SUFFIX}{attempt}")
        };
        let mut name = dest.as_os_str().to_owned();
        name.push(format!(".{suffix}"));
        let candidate = PathBuf::from(name);
        match std::fs::remove_file(&candidate) {
            Ok(()) => return Ok(candidate),
            Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(candidate),
            Err(_) => continue,
        }
    }
    Err(io::Error::other(format!(
        "{} 旁边的旧版本文件都删不掉",
        dest.display()
    )))
}

enum Done {
    /// 原文件改名成了 `.old`。
    Retired { dest: PathBuf, old: PathBuf },
    /// 新文件放到了原位。
    Placed { staged: PathBuf, dest: PathBuf },
}

fn undo(done: Vec<Done>) {
    for step in done.into_iter().rev() {
        let _ = match step {
            Done::Placed { staged, dest } => std::fs::rename(dest, staged),
            Done::Retired { dest, old } => std::fs::rename(old, dest),
        };
    }
}

/// 换上新文件。失败时文件夹回到更新前的样子，返回错误。
pub(crate) fn swap(staged: Staged) -> io::Result<()> {
    let mut done = Vec::new();
    for (new, dest) in &staged.files {
        let step = (|| -> io::Result<()> {
            if dest.exists() {
                let old = free_old_name(dest)?;
                std::fs::rename(dest, &old)?;
                done.push(Done::Retired {
                    dest: dest.clone(),
                    old,
                });
            }
            std::fs::rename(new, dest)?;
            done.push(Done::Placed {
                staged: new.clone(),
                dest: dest.clone(),
            });
            Ok(())
        })();
        if let Err(error) = step {
            undo(done);
            let _ = remove_dir_if_present(&staged.staging);
            return Err(error);
        }
    }
    let _ = remove_dir_if_present(&staged.staging);
    Ok(())
}

fn remove_dir_if_present(dir: &Path) -> io::Result<()> {
    match std::fs::remove_dir_all(dir) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error),
    }
}

/// 启动时清掉上一次更新的残留（暂存目录、`*.old*`）。删不掉的（还被占着）留到下次。
pub(crate) fn sweep(exe: &Path) {
    let Ok(dir) = exe_dir(exe) else {
        return;
    };
    let _ = remove_dir_if_present(&dir.join(STAGING_DIR));
    let ours = [
        exe.file_name()
            .map(|name| name.to_string_lossy().into_owned()),
        Some(MCP_ENTRY.to_string()),
    ];
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        let leftover = ours.iter().flatten().any(|base| {
            name.len() > base.len() + 1
                && name[..base.len()].eq_ignore_ascii_case(base)
                && name[base.len()..].starts_with(&format!(".{OLD_SUFFIX}"))
        });
        if leftover {
            let _ = std::fs::remove_file(entry.path());
        }
    }
}

/// 新进程刚起来时：等旧进程退出（它的 exe 改名成了 `.old`，进程还在时删不掉）。
/// 等满 `timeout` 也照常往下走——最坏是单实例把这次启动并进还没退干净的旧进程。
pub(crate) fn wait_for_previous(exe: &Path, timeout: Duration) {
    let mut old = exe.as_os_str().to_owned();
    old.push(format!(".{OLD_SUFFIX}"));
    let old = PathBuf::from(old);
    let deadline = Instant::now() + timeout;
    loop {
        match std::fs::remove_file(&old) {
            Ok(()) => return,
            Err(error) if error.kind() == io::ErrorKind::NotFound => return,
            Err(_) if Instant::now() < deadline => std::thread::sleep(Duration::from_millis(150)),
            Err(_) => return,
        }
    }
}

#[cfg(test)]
#[path = "portable_tests.rs"]
mod tests;
