//! 重放、压缩与后台写入的进程内标记（从 storage/mod.rs 按领域拆出，逻辑不变）。

use super::*;

/// True while the startup replay is rewriting derived rows from stored raw
/// payloads.
///
/// The replay writes in bulk on its own connection; an automatic sync landing
/// in the middle of it used to lose the race for the write lock and surface as
/// a red "本地数据库暂时不可用". A sync that knows the replay is running can
/// stand aside and come back instead, which is the honest answer: nothing
/// failed, the library is busy healing itself.
/// 是否正在后台压缩历史报文。
///
/// 和重放同样的做法：界面要能说「正在压缩」，同步也要知道此刻有人在写库。
pub(super) static COMPACTION_IN_PROGRESS: std::sync::atomic::AtomicUsize =
    std::sync::atomic::AtomicUsize::new(0);

pub(super) type PayloadStatsMap = HashMap<String, (u64, i64)>;

pub(super) static PAYLOAD_STATS_MEM: std::sync::Mutex<Option<(String, PayloadStatsMap)>> =
    std::sync::Mutex::new(None);

pub fn compaction_in_progress() -> bool {
    COMPACTION_IN_PROGRESS.load(std::sync::atomic::Ordering::SeqCst) > 0
}

/// 用计数而不是布尔：启动线程在拿锁之前就会举起旗，压缩函数内部再进一层，
/// 内层 Drop 不得把外层还在等锁的事实抹掉。
pub struct CompactionGuard {
    pub(super) _private: (),
}

impl CompactionGuard {
    pub fn enter() -> Self {
        COMPACTION_IN_PROGRESS.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        Self { _private: () }
    }
}

impl Drop for CompactionGuard {
    fn drop(&mut self) {
        COMPACTION_IN_PROGRESS.fetch_sub(1, std::sync::atomic::Ordering::SeqCst);
    }
}

pub(super) static REPLAY_IN_PROGRESS: std::sync::atomic::AtomicUsize =
    std::sync::atomic::AtomicUsize::new(0);

/// Whether a raw-payload replay is running right now.
pub fn replay_in_progress() -> bool {
    REPLAY_IN_PROGRESS.load(std::sync::atomic::Ordering::SeqCst) > 0
}

/// 退出请求举起的旗。
///
/// 桌面应用在退出前会等写锁清空，而重放/压缩一跑就是几十秒到几分钟——
/// 没有这面旗，点「退出」的用户要等整个维护窗口跑完。两个循环在每个批
/// 边界上看它一眼：看见了就提交完当前批收手，写锁交还，剩下的报文
/// 下次启动接着放（修订号不推进，已提交的批天然不会重做）。
pub(super) static BACKGROUND_WRITE_ABORT: std::sync::atomic::AtomicBool =
    std::sync::atomic::AtomicBool::new(false);

/// 由退出路径调用。只影响批边界以后的调度，不打断正在提交的事务。
pub fn request_background_write_abort() {
    BACKGROUND_WRITE_ABORT.store(true, std::sync::atomic::Ordering::SeqCst);
}

pub(super) fn background_write_abort_requested() -> bool {
    BACKGROUND_WRITE_ABORT.load(std::sync::atomic::Ordering::SeqCst)
}

/// Clears the replay flag however the replay ends, including on an early
/// return or a panic. Nested enters are counted so an inner Drop cannot hide
/// an outer wait-for-lock.
pub struct ReplayGuard {
    pub(super) _private: (),
}

impl ReplayGuard {
    pub fn enter() -> Self {
        REPLAY_IN_PROGRESS.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        Self { _private: () }
    }
}

impl Drop for ReplayGuard {
    fn drop(&mut self) {
        REPLAY_IN_PROGRESS.fetch_sub(1, std::sync::atomic::Ordering::SeqCst);
    }
}

/// 一次同步最多拉这么多条待拉取的跑步明细。其余留给下一轮，避免把整次同步
/// 的截止时间耗在几百个永久 404 上。
pub const PENDING_WORKOUT_DETAIL_LIMIT: usize = 40;

/// 同一条明细连续失败这么多次之后，暂时移出自动队列。
pub const MAX_WORKOUT_DETAIL_ATTEMPTS: i64 = 3;

/// 失败次数过了这么多天就衰减回 0，给后来的云端修复一次再试的机会。
pub(super) const WORKOUT_DETAIL_ATTEMPT_DECAY: chrono::Duration = chrono::Duration::days(7);

/// 一批重放的事务边界。
///
/// 提交必须显式调用 `commit()`；`?` 提前返回和 panic 都走 `Drop`，回滚。
/// 手写而不是用 `rusqlite::Transaction`，是因为整个 `Database` 只拿得到
/// `&self.conn`，而 `Transaction` 要借走 `&mut Connection`。
pub(super) struct ReplayBatch<'a> {
    pub(super) conn: &'a Connection,
    pub(super) open: bool,
}

impl<'a> ReplayBatch<'a> {
    pub(super) fn begin(conn: &'a Connection) -> Result<Self> {
        conn.execute("BEGIN IMMEDIATE", [])?;
        Ok(Self { conn, open: true })
    }

    pub(super) fn commit(mut self) -> Result<()> {
        self.open = false;
        self.conn.execute("COMMIT", [])?;
        Ok(())
    }
}

impl Drop for ReplayBatch<'_> {
    fn drop(&mut self) {
        if self.open {
            let _ = self.conn.execute("ROLLBACK", []);
        }
    }
}
