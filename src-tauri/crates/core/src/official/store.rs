//! 官方令牌放系统凭据存储；数据目录里的 `official.json` 只放不敏感的元数据。
//!
//! 与旧通道共用同一个凭据后端，但条目名带 `official:` 前缀——旧通道的条目名
//! 是纯数字用户编号，两边不会撞上。访问令牌和刷新令牌各存一条：Windows 凭据
//! 管理器单条有 2560 字节上限，官方令牌的长度文档没写。

use super::OfficialTokens;
use crate::auth::{default_credential_backend_in, CredentialBackend};
use crate::models::{error::Result, ZeppBridgeError};
use crate::storage::write_lock::{
    acquire_official, ExclusiveWriteGuard, OfficialLock, WriteLockError,
};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::Duration;

const META_FILE: &str = "official.json";

/*
 * 官方账号状态的提交协调（代码审查 R05）。
 *
 * 登录、取消、断开、刷新都会在网络等待之后写凭据。没有协调时，旧操作的
 * 回执能把令牌写回已断开的账号、覆盖新登录，或者把刚续上的状态改成
 * 「要重新授权」。所以：
 * - 所有写凭据 / 元数据的动作都在同一把提交锁里做。它是两层：进程内的
 *   `Mutex`，加数据目录里由操作系统持有的文件锁——桌面断开时 CLI / MCP
 *   可能正在另一个进程里刷新，只有进程内的锁时，那边的「核对 → 写回」会
 *   夹在这边的断开中间，把令牌写回已断开的账号；
 * - `GENERATION` 是账号状态的代次：开始登录、取消、断开都加一。登录拿着
 *   开始时的代次，写之前核对——代次变了说明用户已经取消或换了主意。登录和
 *   取消只发生在桌面进程里，所以代次留在进程内就够；
 * - 刷新写回之前核对库里的刷新令牌还是拿去刷新的那一把（比较后交换）。
 */
static COMMIT: Mutex<()> = Mutex::new(());
static GENERATION: AtomicU64 = AtomicU64::new(0);

/// 等另一个进程放开提交锁的上限。锁里只有几次凭据读写，正常是毫秒级。
const COMMIT_WAIT: Duration = Duration::from_secs(10);
/// 等另一个进程刷新完的上限：比一次刷新请求的超时（20 秒）多留一点。
const REFRESH_WAIT: Duration = Duration::from_secs(25);

fn in_process() -> MutexGuard<'static, ()> {
    COMMIT
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

/// 持有期间，本机任何 ZeppBridge 进程都不能改这个数据目录的官方授权状态。
struct CommitGuard {
    // 先放文件锁再放进程内锁（字段按声明顺序 drop）。
    _file: ExclusiveWriteGuard,
    _local: MutexGuard<'static, ()>,
}

/// 作废所有在途的登录（开始新登录、取消、断开时调用），返回新的代次。
pub fn invalidate_pending_logins() -> u64 {
    let _commit = in_process();
    GENERATION.fetch_add(1, Ordering::SeqCst) + 1
}

/// 当前代次。登录开始时记下它，写凭据时交给 [`OfficialStore::save_login`] 核对。
pub fn current_generation() -> u64 {
    GENERATION.load(Ordering::SeqCst)
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct OfficialMeta {
    pub user_id: String,
    /// 完成授权的 Unix 秒。
    pub connected_at: i64,
    pub expires_at: Option<i64>,
    /// 刷新被 Zepp 明确拒绝：令牌已清掉，等用户重新授权。
    #[serde(default)]
    pub needs_reauth: bool,
    /// 官方资料里的昵称：设置页用它说清「连的是哪个账号」。只存本机。
    #[serde(default)]
    pub nickname: Option<String>,
}

pub struct OfficialStore {
    dir: PathBuf,
    backend: Arc<dyn CredentialBackend>,
}

fn access_key(user_id: &str) -> String {
    format!("official:{user_id}:access")
}

fn refresh_key(user_id: &str) -> String {
    format!("official:{user_id}:refresh")
}

impl OfficialStore {
    pub fn new(data_dir: &Path) -> Self {
        Self::with_backend(data_dir, default_credential_backend_in(data_dir))
    }

    pub fn with_backend(data_dir: &Path, backend: Arc<dyn CredentialBackend>) -> Self {
        Self {
            dir: data_dir.to_path_buf(),
            backend,
        }
    }

    /// 进程内锁在前、文件锁在后：同一进程的两个线程不去抢文件锁空转。
    fn commit(&self) -> Result<CommitGuard> {
        let local = in_process();
        let file =
            acquire_official(&self.dir, OfficialLock::Commit, COMMIT_WAIT).map_err(|error| {
                ZeppBridgeError::CredentialStore(format!(
                    "官方授权正被另一个 ZeppBridge 进程更新：{error}"
                ))
            })?;
        Ok(CommitGuard {
            _file: file,
            _local: local,
        })
    }

    /// 跨进程的刷新单飞（进程内那层在 `refresh_tokens` 里）。拿不到就隔一会儿
    /// 再试，最多等一次刷新往返的上限；等不到也照常往下走——写回本来就按比较后
    /// 交换，最坏只是多刷一次。
    pub(crate) async fn refresh_flight(&self) -> Option<ExclusiveWriteGuard> {
        let deadline = tokio::time::Instant::now() + REFRESH_WAIT;
        loop {
            match acquire_official(&self.dir, OfficialLock::Refresh, Duration::ZERO) {
                Ok(guard) => return Some(guard),
                Err(WriteLockError::Busy { .. }) if tokio::time::Instant::now() < deadline => {
                    tokio::time::sleep(Duration::from_millis(120)).await;
                }
                Err(error) => {
                    tracing::warn!("没拿到官方令牌的跨进程刷新锁，照常刷新: {error}");
                    return None;
                }
            }
        }
    }

    fn meta_path(&self) -> PathBuf {
        self.dir.join(META_FILE)
    }

    pub fn meta(&self) -> Result<Option<OfficialMeta>> {
        let path = self.meta_path();
        if !path.exists() {
            return Ok(None);
        }
        let text = std::fs::read_to_string(&path)?;
        serde_json::from_str(&text).map(Some).map_err(|error| {
            ZeppBridgeError::ParseError(format!("official.json 无法解析: {error}"))
        })
    }

    fn write_meta(&self, meta: &OfficialMeta) -> Result<()> {
        std::fs::create_dir_all(&self.dir)?;
        let text = serde_json::to_string_pretty(meta)
            .map_err(|error| ZeppBridgeError::ParseError(error.to_string()))?;
        // 临时文件名每次不同：两个写者共用一个固定名字会互相覆盖半截内容。
        let nonce = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|elapsed| elapsed.as_nanos())
            .unwrap_or_default();
        let temp = self
            .dir
            .join(format!("{META_FILE}.{}.{nonce}.tmp", std::process::id()));
        std::fs::write(&temp, text)?;
        std::fs::rename(temp, self.meta_path())?;
        Ok(())
    }

    /// 登录领到令牌后保存。`generation` 是登录开始时的代次：这期间用户取消、
    /// 断开或重新开始过（代次变了）就什么也不写，返回 `false`。
    pub fn save_login(
        &self,
        tokens: &OfficialTokens,
        nickname: Option<&str>,
        connected_at: i64,
        generation: u64,
    ) -> Result<bool> {
        let _commit = self.commit()?;
        if GENERATION.load(Ordering::SeqCst) != generation {
            return Ok(false);
        }
        self.save(tokens, connected_at)?;
        // 昵称只是显示用：记不下来不影响授权本身。
        let _ = self.set_nickname(nickname);
        Ok(true)
    }

    /// 刷新成功后写回：只有库里仍是拿去刷新的那把令牌（同一账号、同一刷新
    /// 令牌）才写。期间被断开、换了账号或别人已经刷新过，返回 `false`。
    pub fn replace_if_current(
        &self,
        used: &OfficialTokens,
        fresh: &OfficialTokens,
        now: i64,
    ) -> Result<bool> {
        let _commit = self.commit()?;
        if !self.holds(used)? {
            return Ok(false);
        }
        self.save(fresh, now)?;
        Ok(true)
    }

    /// 刷新被 Zepp 明确拒绝：只有库里仍是那把令牌才标「要重新授权」——
    /// 并发的另一次刷新可能已经换上了新令牌，不能被这次的拒绝抹掉。
    pub fn mark_needs_reauth_if_current(&self, used: &OfficialTokens) -> Result<bool> {
        let _commit = self.commit()?;
        if !self.holds(used)? {
            return Ok(false);
        }
        self.mark_needs_reauth()?;
        Ok(true)
    }

    /// 断开：作废在途登录，再删令牌和元数据。**不碰任何健康数据。**
    pub fn disconnect(&self) -> Result<()> {
        let _commit = self.commit()?;
        GENERATION.fetch_add(1, Ordering::SeqCst);
        self.clear()
    }

    fn holds(&self, used: &OfficialTokens) -> Result<bool> {
        Ok(self.load()?.is_some_and(|current| {
            current.user_id == used.user_id && current.refresh_token == used.refresh_token
        }))
    }

    /// 先写凭据、再写元数据：元数据说「已连接」时，令牌一定已经在了。
    /// 换了账号时，上一个账号的凭据条目一并删掉，不留没人引用的令牌。
    ///
    /// 不拿提交锁：生产路径走上面几个带核对的入口。
    pub(crate) fn save(&self, tokens: &OfficialTokens, connected_at: i64) -> Result<()> {
        if !self.backend.supports_named_entries() {
            return Err(ZeppBridgeError::CredentialStore(
                "当前凭据存储只能放一个旧通道令牌，存不下官方授权".into(),
            ));
        }
        self.backend
            .set(&access_key(&tokens.user_id), &tokens.access_token)
            .map_err(ZeppBridgeError::CredentialStore)?;
        match tokens.refresh_token.as_deref() {
            Some(refresh) => self.backend.set(&refresh_key(&tokens.user_id), refresh),
            None => self.backend.delete(&refresh_key(&tokens.user_id)),
        }
        .map_err(ZeppBridgeError::CredentialStore)?;
        let before = self.meta()?;
        let replaced_user = before
            .as_ref()
            .filter(|meta| meta.user_id != tokens.user_id)
            .map(|meta| meta.user_id.clone());
        let previous = before.filter(|meta| meta.user_id == tokens.user_id);
        self.write_meta(&OfficialMeta {
            user_id: tokens.user_id.clone(),
            connected_at: previous
                .as_ref()
                .map_or(connected_at, |meta| meta.connected_at),
            expires_at: tokens.expires_at,
            needs_reauth: false,
            nickname: previous.and_then(|meta| meta.nickname),
        })?;
        if let Some(old_user) = replaced_user {
            self.delete_secrets(&old_user)?;
        }
        Ok(())
    }

    /// 记下官方资料里的昵称（授权成功后调用）。空白昵称不记。
    pub(crate) fn set_nickname(&self, nickname: Option<&str>) -> Result<()> {
        let Some(mut meta) = self.meta()? else {
            return Ok(());
        };
        meta.nickname = nickname
            .map(str::trim)
            .filter(|name| !name.is_empty())
            .map(str::to_string);
        self.write_meta(&meta)
    }

    /// 读出完整令牌集。没连接过、或者令牌已被清掉时返回 `None`。
    pub fn load(&self) -> Result<Option<OfficialTokens>> {
        let Some(meta) = self.meta()? else {
            return Ok(None);
        };
        if meta.needs_reauth || !self.backend.supports_named_entries() {
            return Ok(None);
        }
        let Some(access_token) = self
            .backend
            .get(&access_key(&meta.user_id))
            .map_err(ZeppBridgeError::CredentialStore)?
        else {
            return Ok(None);
        };
        let refresh_token = self
            .backend
            .get(&refresh_key(&meta.user_id))
            .map_err(ZeppBridgeError::CredentialStore)?;
        Ok(Some(OfficialTokens {
            access_token,
            refresh_token,
            expires_at: meta.expires_at,
            user_id: meta.user_id,
        }))
    }

    /// 刷新被拒：令牌清掉，元数据留着并标上「要重新授权」，界面才说得清发生了什么。
    pub(crate) fn mark_needs_reauth(&self) -> Result<()> {
        let Some(mut meta) = self.meta()? else {
            return Ok(());
        };
        self.delete_secrets(&meta.user_id)?;
        meta.needs_reauth = true;
        self.write_meta(&meta)
    }

    /// 令牌和元数据都删掉。**不碰任何健康数据。**生产路径走 [`Self::disconnect`]。
    pub(crate) fn clear(&self) -> Result<()> {
        if let Some(meta) = self.meta()? {
            self.delete_secrets(&meta.user_id)?;
        }
        match std::fs::remove_file(self.meta_path()) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(error.into()),
        }
    }

    fn delete_secrets(&self, user_id: &str) -> Result<()> {
        if !self.backend.supports_named_entries() {
            return Ok(());
        }
        self.backend
            .delete(&access_key(user_id))
            .map_err(ZeppBridgeError::CredentialStore)?;
        self.backend
            .delete(&refresh_key(user_id))
            .map_err(ZeppBridgeError::CredentialStore)
    }
}
