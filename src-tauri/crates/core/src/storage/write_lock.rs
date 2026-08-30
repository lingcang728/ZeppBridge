//! 跨进程单写者锁。
//!
//! 桌面应用、CLI、以后的定时任务都可能同时想写同一个 `zepp.db`。进程内的
//! `Mutex` 拦不住第二个进程，而两个同步同时跑最轻的后果是重复请求和重复清理，
//! 最重的后果是迁移或恢复写到一半被另一个写者打断。
//!
//! 所有会写库的动作都要先拿到这把锁：同步、历史补拉、schema 迁移、恢复、
//! 重新解析、清理。只读查询不拿写锁 —— 只读连接本来就写不了东西，让它们排队
//! 只会让 MCP 查询在一次长同步期间全部卡住。
//!
//! 实现刻意选了「由操作系统持有」的锁而不是自己写一个锁文件加时间戳：
//!
//! * Windows 用独占共享模式打开文件，句柄一关（正常退出、崩溃、任务管理器
//!   结束进程）锁立刻消失；
//! * 类 Unix 用 `flock`，进程退出时内核同样自动释放。
//!
//! 于是不存在「上一个进程崩了，锁文件还在，下次启动打不开库」这种需要人工
//! 删文件的故障模式。

use std::fs::{File, OpenOptions};
use std::io;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

const LOCK_FILE: &str = "zepp.db.write-lock";
/// 记录当前持有者的用途和 pid，只用于把「谁在写」告诉用户。
const HOLDER_FILE: &str = "zepp.db.write-lock.holder";
const POLL_INTERVAL: Duration = Duration::from_millis(120);

/// 一次写入动作的用途。等待超时时会把它显示给用户，所以措辞是面向用户的。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WritePurpose {
    Sync,
    HistoryBackfill,
    Migration,
    Restore,
    Backup,
    Reprocess,
    Cleanup,
}

impl WritePurpose {
    pub fn as_str(self) -> &'static str {
        match self {
            WritePurpose::Sync => "sync",
            WritePurpose::HistoryBackfill => "history_backfill",
            WritePurpose::Migration => "migration",
            WritePurpose::Restore => "restore",
            WritePurpose::Backup => "backup",
            WritePurpose::Reprocess => "reprocess",
            WritePurpose::Cleanup => "cleanup",
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            WritePurpose::Sync => "云端同步",
            WritePurpose::HistoryBackfill => "历史补拉",
            WritePurpose::Migration => "数据库升级",
            WritePurpose::Restore => "从备份恢复",
            WritePurpose::Backup => "生成备份",
            WritePurpose::Reprocess => "重新解析本地报文",
            WritePurpose::Cleanup => "清理旧数据",
        }
    }
}

#[derive(Debug)]
pub enum WriteLockError {
    /// 另一个写者正在进行中。`holder` 是它自报的用途，可能读不到。
    Busy { holder: Option<String> },
    /// 锁文件本身打不开（目录不可写等）。
    Unavailable(io::Error),
}

impl std::fmt::Display for WriteLockError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            WriteLockError::Busy { holder: Some(who) } => {
                write!(f, "另一个 ZeppBridge 写入操作正在进行（{who}），请等它结束")
            }
            WriteLockError::Busy { holder: None } => {
                write!(f, "另一个 ZeppBridge 写入操作正在进行，请等它结束")
            }
            WriteLockError::Unavailable(error) => {
                write!(f, "无法建立写入锁：{error}")
            }
        }
    }
}

impl std::error::Error for WriteLockError {}

/// 持有期间，本机上任何进程都无法再取得同一个数据目录的写锁。
///
/// `Drop` 时释放：正常返回、`?` 提前返回和 panic 都会走到，所以不存在
/// 「忘了解锁」的路径。
#[derive(Debug)]
pub struct ExclusiveWriteGuard {
    file: Option<File>,
    holder_path: PathBuf,
}

impl Drop for ExclusiveWriteGuard {
    fn drop(&mut self) {
        // 先清掉自报信息，再释放句柄，免得下一个持有者读到上一个的用途。
        let _ = std::fs::remove_file(&self.holder_path);
        if let Some(file) = self.file.take() {
            #[cfg(unix)]
            unlock_unix(&file);
            drop(file);
        }
    }
}

/// 立刻尝试取锁；拿不到就返回 `Busy`，不等待。
pub fn try_acquire(
    data_dir: &Path,
    purpose: WritePurpose,
) -> Result<ExclusiveWriteGuard, WriteLockError> {
    acquire_with_timeout(data_dir, purpose, Duration::ZERO)
}

/// 在超时时间内反复尝试取锁。
///
/// 轮询而不是阻塞在内核调用上，是为了让调用方能设一个上限：GUI 里一次同步
/// 卡在锁上超过几秒，应该显示「另一个操作正在进行」而不是假死。
pub fn acquire_with_timeout(
    data_dir: &Path,
    purpose: WritePurpose,
    timeout: Duration,
) -> Result<ExclusiveWriteGuard, WriteLockError> {
    std::fs::create_dir_all(data_dir).map_err(WriteLockError::Unavailable)?;
    let lock_path = data_dir.join(LOCK_FILE);
    let holder_path = data_dir.join(HOLDER_FILE);
    let deadline = Instant::now() + timeout;

    loop {
        match open_exclusive(&lock_path) {
            Ok(file) => {
                // 自报用途，供另一个进程在等锁时显示。写失败不影响加锁本身。
                let _ = std::fs::write(
                    &holder_path,
                    format!("{}|{}", purpose.label(), std::process::id()),
                );
                return Ok(ExclusiveWriteGuard {
                    file: Some(file),
                    holder_path,
                });
            }
            Err(error) if is_contention(&error) => {
                if Instant::now() >= deadline {
                    let holder = std::fs::read_to_string(&holder_path)
                        .ok()
                        .and_then(|text| text.split('|').next().map(str::to_string))
                        .filter(|value| !value.trim().is_empty());
                    return Err(WriteLockError::Busy { holder });
                }
                std::thread::sleep(POLL_INTERVAL);
            }
            Err(error) => return Err(WriteLockError::Unavailable(error)),
        }
    }
}

#[cfg(windows)]
fn open_exclusive(path: &Path) -> io::Result<File> {
    use std::os::windows::fs::OpenOptionsExt;
    // share_mode(0)：不允许任何其他句柄同时打开这个文件。第二个进程（以及
    // 同一进程里的第二个线程）都会拿到共享冲突，这正是我们想要的语义。
    OpenOptions::new()
        .create(true)
        .truncate(false)
        .write(true)
        .share_mode(0)
        .open(path)
}

#[cfg(windows)]
fn is_contention(error: &io::Error) -> bool {
    // ERROR_SHARING_VIOLATION (32) / ERROR_LOCK_VIOLATION (33)
    matches!(error.raw_os_error(), Some(32) | Some(33))
}

#[cfg(unix)]
fn open_exclusive(path: &Path) -> io::Result<File> {
    use std::os::unix::io::AsRawFd;
    let file = OpenOptions::new()
        .create(true)
        .truncate(false)
        .write(true)
        .open(path)?;
    // LOCK_NB：拿不到立刻返回，由上面的循环决定要不要继续等。
    let result = unsafe { libc::flock(file.as_raw_fd(), libc::LOCK_EX | libc::LOCK_NB) };
    if result != 0 {
        return Err(io::Error::last_os_error());
    }
    Ok(file)
}

#[cfg(unix)]
fn is_contention(error: &io::Error) -> bool {
    // 比较值，不用 match 分支。
    //
    // 在 macOS 上 `EWOULDBLOCK` 和 `EAGAIN` 是同一个数，写成两个模式分支时
    // 第二个永远到不了，clippy 的 `unreachable_patterns` 会把它判成错误
    // （CI 上 `-D warnings`）；而在 Linux 上它们是两个不同的值，两个都得认。
    // 用 `||` 比较就没有这个平台差异——同一个值比两次只是多做一次比较，
    // 不同的值则各自命中。
    let Some(code) = error.raw_os_error() else {
        return false;
    };
    code == libc::EWOULDBLOCK || code == libc::EAGAIN || code == libc::EACCES
}

#[cfg(unix)]
fn unlock_unix(file: &File) {
    use std::os::unix::io::AsRawFd;
    unsafe {
        libc::flock(file.as_raw_fd(), libc::LOCK_UN);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("zeppbridge-write-lock-{name}"));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn a_second_writer_is_refused_while_the_first_still_holds_the_lock() {
        let dir = temp_dir("contended");
        let first = try_acquire(&dir, WritePurpose::Sync).unwrap();

        let second = try_acquire(&dir, WritePurpose::HistoryBackfill);
        match second {
            Err(WriteLockError::Busy { holder }) => {
                assert_eq!(holder.as_deref(), Some("云端同步"), "应当说清是谁在写");
            }
            other => panic!("第二个写者不该拿到锁: {other:?}"),
        }

        drop(first);
        // 释放之后立刻可以重新获得，不需要人工删锁文件。
        assert!(try_acquire(&dir, WritePurpose::HistoryBackfill).is_ok());
    }

    #[test]
    fn waiting_reports_who_holds_the_lock_instead_of_hanging() {
        let dir = temp_dir("timeout");
        let _held = try_acquire(&dir, WritePurpose::Restore).unwrap();
        let started = Instant::now();
        let error = acquire_with_timeout(&dir, WritePurpose::Sync, Duration::from_millis(300))
            .expect_err("超时时间内拿不到锁");
        assert!(
            started.elapsed() >= Duration::from_millis(250),
            "应当真的等过"
        );
        assert!(started.elapsed() < Duration::from_secs(5), "不该无限等下去");
        let message = error.to_string();
        assert!(message.contains("从备份恢复"), "{message}");
    }

    #[test]
    fn a_dropped_guard_leaves_nothing_a_human_has_to_clean_up() {
        let dir = temp_dir("no-stale");
        {
            let _guard = try_acquire(&dir, WritePurpose::Migration).unwrap();
            assert!(dir.join(HOLDER_FILE).exists());
        }
        assert!(
            !dir.join(HOLDER_FILE).exists(),
            "持有者信息应当随锁一起消失"
        );
        // 锁文件本身可以留着（下次复用），但绝不能因此挡住下一个写者。
        assert!(try_acquire(&dir, WritePurpose::Sync).is_ok());
    }

    #[test]
    fn different_data_directories_do_not_block_each_other() {
        let one = temp_dir("dir-one");
        let two = temp_dir("dir-two");
        let _first = try_acquire(&one, WritePurpose::Sync).unwrap();
        assert!(
            try_acquire(&two, WritePurpose::Sync).is_ok(),
            "锁的粒度是数据目录，不是整台机器"
        );
    }
}
