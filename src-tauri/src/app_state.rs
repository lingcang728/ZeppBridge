use crate::auth::AuthManager;
use crate::connectors::ZeppConnector;
use crate::fetcher::DataFetcher;
use crate::ipc_types::LoginStatus;
use crate::models::{error::Result, AuthInfo, ZeppBridgeError};
use crate::paths;
use crate::storage::Database;
use crate::sync::SyncManager;
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicU64;
use std::sync::Arc;
use tokio::sync::{Mutex, RwLock};

/// In-process web-login session.  The epoch is incremented to cancel a
/// running poll without holding a task join handle across commands.
pub(crate) struct LoginSession {
    pub(crate) status: Arc<RwLock<LoginStatus>>,
    pub(crate) epoch: Arc<AtomicU64>,
}

impl LoginSession {
    fn new() -> Self {
        Self {
            status: Arc::new(RwLock::new(LoginStatus::idle())),
            epoch: Arc::new(AtomicU64::new(0)),
        }
    }
}

/// Shared process state for the Tauri commands.
///
/// The primary database connection is kept here for read paths.  A sync
/// manager owns an independent connection to the same SQLite database so a
/// long-running network sync never holds the command-side database lock.
pub struct AppState {
    pub(crate) data_dir: PathBuf,
    pub(crate) db: Arc<Mutex<Database>>,
    pub(crate) auth: Arc<AuthManager>,
    pub(crate) sync: Arc<RwLock<Option<Arc<SyncManager>>>>,
    pub(crate) sync_command_lock: Arc<Mutex<()>>,
    pub(crate) login: LoginSession,
    pub(crate) auth_state: Arc<RwLock<String>>,
    /// One-time warnings produced while restoring state at startup (legacy
    /// migration, raw-record replay, initial auth restore).
    pub(crate) startup_warning: Arc<RwLock<Option<String>>>,
    /// Runtime auth warnings (verify/save failures).  Kept separate from
    /// `startup_warning` so a successful sync can clear the transient auth
    /// warning without erasing one-time startup notices.
    pub(crate) auth_warning: Arc<RwLock<Option<String>>>,
    /// 上一次登录时，凭什么认定当前 `region_host` 属于这个账号。
    ///
    /// `identified` / `hinted` / `unconfirmed`，外加进程重启后无从得知的
    /// `unknown`。留着它是因为「区域猜错了」和「这个账号这段时间确实没数据」
    /// 在界面上长得一模一样——两者都是同步跑通、一条记录没有。见
    /// `commands::login::RegionWinner`。
    pub(crate) region_confidence: Arc<RwLock<String>>,
}

impl AppState {
    /// Initialize local storage and restore the saved authentication state.
    ///
    /// A malformed or stale credential is intentionally recoverable: the
    /// application still starts with an empty sync manager and an actionable
    /// warning for the settings screen to display.
    pub fn new(data_dir: PathBuf) -> Result<Self> {
        std::fs::create_dir_all(&data_dir)?;

        let migration_warning = paths::relocate_legacy_data(&data_dir);
        let (db, db_warning) = Database::open_resilient(data_dir.join("zepp.db"))?;
        // Do not replay every raw payload during startup. A full reprocess of a
        // large local library blocks window creation and looks like a hang.
        // Settings still has an explicit reprocess action; the next cloud sync
        // also refreshes workout source/type fields.
        let auth = Arc::new(AuthManager::new(data_dir.clone()));

        let (sync_manager, auth_state, auth_warning) = match auth.load_auth() {
            Ok(Some(auth_info)) => match Self::build_sync_manager(auth_info, &data_dir) {
                Ok(manager) => (Some(manager), "configured".to_string(), None),
                Err(error) => (
                    None,
                    "needs_reauth".to_string(),
                    Some(startup_warning(error)),
                ),
            },
            Ok(None) => (None, "unconfigured".to_string(), None),
            Err(error) => (
                None,
                "needs_reauth".to_string(),
                Some(startup_warning(error)),
            ),
        };
        let startup_warning = merge_startup_warnings(
            merge_startup_warnings(migration_warning, db_warning),
            auth_warning,
        );

        Ok(Self {
            data_dir,
            db: Arc::new(Mutex::new(db)),
            auth,
            sync: Arc::new(RwLock::new(sync_manager)),
            sync_command_lock: Arc::new(Mutex::new(())),
            login: LoginSession::new(),
            auth_state: Arc::new(RwLock::new(auth_state)),
            startup_warning: Arc::new(RwLock::new(startup_warning)),
            auth_warning: Arc::new(RwLock::new(None)),
            // 保存的凭据不记录当初是怎么认定区域的，重启后只能说不知道。
            region_confidence: Arc::new(RwLock::new("unknown".to_string())),
        })
    }

    /// 把一条启动提示追加到设置页要显示的内容里。
    ///
    /// 恢复在 `AppState` 建立之前执行，但它的结果得让用户看见 —— 成功要说
    /// 「已从备份恢复」，失败要说「当前库没有改动」。
    pub fn push_startup_warning(&self, notice: String) {
        let mut current = self.startup_warning.blocking_write();
        *current = Some(match current.take() {
            Some(existing) => format!(
                "{existing}
{notice}"
            ),
            None => notice,
        });
    }

    /// Build a synchronizer with its own SQLite connection.
    pub(crate) fn build_sync_manager(auth: AuthInfo, data_dir: &Path) -> Result<Arc<SyncManager>> {
        let cancel = Arc::new(std::sync::atomic::AtomicBool::new(false));
        let connector = ZeppConnector::with_cancel(auth, cancel.clone())?;
        let fetcher = DataFetcher::new(connector);
        // The primary connection in `AppState::new` already migrated the
        // schema; re-running DDL here could collide with an active sync.
        let db = Database::open_without_migration(data_dir.join("zepp.db"))?;
        // 带上数据目录，同步就会额外获取跨进程写锁：CLI 与桌面应用不可能
        // 同时写同一个库。
        Ok(Arc::new(
            SyncManager::new(fetcher, db, cancel).with_data_dir(data_dir.to_path_buf()),
        ))
    }
}

/// Mask an account identifier while retaining enough context for the user to
/// recognize which account is configured.
pub(crate) fn mask_user_id(user_id: &str) -> String {
    let chars: Vec<char> = user_id.chars().collect();
    match chars.len() {
        0 => String::new(),
        1 => "•".to_string(),
        2 => format!("{}•", chars[0]),
        _ => {
            let prefix = chars[0];
            let suffix = chars[chars.len() - 1];
            format!("{prefix}•••{suffix}")
        }
    }
}

fn startup_warning(error: ZeppBridgeError) -> String {
    format!(
        "无法恢复 Zepp 认证，请在设置里重新连接后重试：{}",
        error.user_message()
    )
}

fn merge_startup_warnings(
    migration_warning: Option<String>,
    auth_warning: Option<String>,
) -> Option<String> {
    match (migration_warning, auth_warning) {
        (Some(migration), Some(auth)) => Some(format!("{migration}\n{auth}")),
        (Some(warning), None) | (None, Some(warning)) => Some(warning),
        (None, None) => None,
    }
}
