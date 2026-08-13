use crate::auth::AuthManager;
use crate::connectors::ZeppConnector;
use crate::fetcher::DataFetcher;
use crate::ipc_types::LoginStatus;
use crate::models::{error::Result, AuthInfo, ZeppBridgeError};
use crate::storage::Database;
use crate::sync::SyncManager;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
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

const LEGACY_SQLITE_FILES: [&str; 3] = ["zepp.db", "zepp.db-wal", "zepp.db-shm"];
const AUTH_FILE: &str = "auth.json";
static MIGRATION_TEMP_COUNTER: AtomicU64 = AtomicU64::new(0);

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
    pub(crate) startup_warning: Arc<RwLock<Option<String>>>,
}

impl AppState {
    /// Initialize local storage and restore the saved authentication state.
    ///
    /// A malformed or stale credential is intentionally recoverable: the
    /// application still starts with an empty sync manager and an actionable
    /// warning for the settings screen to display.
    pub fn new(data_dir: PathBuf) -> Result<Self> {
        std::fs::create_dir_all(&data_dir)?;

        let migration_warning = migrate_legacy_data(&data_dir);
        let db = Database::new(data_dir.join("zepp.db"))?;
        let replay_warning = db
            .reprocess_raw_records_if_needed()
            .err()
            .map(|error| format!("本地原始数据重新解析未完全成功：{error}"));
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
            merge_startup_warnings(migration_warning, replay_warning),
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
        })
    }

    /// Build a synchronizer with its own SQLite connection.
    pub(crate) fn build_sync_manager(auth: AuthInfo, data_dir: &Path) -> Result<Arc<SyncManager>> {
        let connector = ZeppConnector::new(auth)?;
        let fetcher = DataFetcher::new(connector);
        let db = Database::new(data_dir.join("zepp.db"))?;
        Ok(Arc::new(SyncManager::new(fetcher, db)))
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

fn migrate_legacy_data(data_dir: &Path) -> Option<String> {
    let legacy_data_dir = directories::ProjectDirs::from("com", "zeppbridge", "ZeppBridge")
        .map(|directories| directories.data_dir().to_path_buf());
    let legacy_data_dir = legacy_data_dir?;

    if legacy_data_dir == data_dir {
        return None;
    }

    migrate_legacy_data_from(&legacy_data_dir, data_dir)
}

fn migrate_legacy_data_from(legacy_data_dir: &Path, data_dir: &Path) -> Option<String> {
    let mut failed_files = Vec::new();

    if migrate_sqlite_group(legacy_data_dir, data_dir).is_err() {
        failed_files.push("数据库文件组");
    }
    if migrate_auth_file(legacy_data_dir, data_dir).is_err() {
        failed_files.push("认证元数据");
    }

    if failed_files.is_empty() {
        None
    } else {
        Some(format!(
            "旧版本地数据迁移未完全成功（{}）。应用仍可启动，现有文件未被覆盖。",
            failed_files.join("、")
        ))
    }
}

fn migrate_sqlite_group(legacy_data_dir: &Path, data_dir: &Path) -> std::io::Result<()> {
    let database_path = data_dir.join(LEGACY_SQLITE_FILES[0]);
    if path_exists(&database_path)? {
        return Ok(());
    }

    // A SQLite sidecar without its primary database cannot be opened safely.
    // Treat the group as absent until the legacy primary file is available.
    if !path_exists(&legacy_data_dir.join(LEGACY_SQLITE_FILES[0]))? {
        return Ok(());
    }

    let mut copied_files = Vec::new();
    for file_name in LEGACY_SQLITE_FILES {
        let source = legacy_data_dir.join(file_name);
        if !path_exists(&source)? {
            continue;
        }

        let destination = data_dir.join(file_name);
        if !path_is_missing(&destination)? {
            continue;
        }

        if let Err(error) = copy_file_atomically(&source, &destination) {
            cleanup_copied_files(&copied_files);
            return Err(error);
        }
        copied_files.push(destination);
    }

    Ok(())
}

fn migrate_auth_file(legacy_data_dir: &Path, data_dir: &Path) -> std::io::Result<()> {
    let source = legacy_data_dir.join(AUTH_FILE);
    if !path_exists(&source)? {
        return Ok(());
    }

    let destination = data_dir.join(AUTH_FILE);
    if !path_is_missing(&destination)? {
        return Ok(());
    }

    copy_file_atomically(&source, &destination)
}

fn path_exists(path: &Path) -> std::io::Result<bool> {
    match std::fs::symlink_metadata(path) {
        Ok(_) => Ok(true),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(error),
    }
}

fn path_is_missing(path: &Path) -> std::io::Result<bool> {
    path_exists(path).map(|exists| !exists)
}

fn copy_file_atomically(source: &Path, destination: &Path) -> std::io::Result<()> {
    let temporary_path = migration_temp_path(destination);
    let result = (|| {
        std::fs::copy(source, &temporary_path)?;
        if path_exists(destination)? {
            return Err(std::io::Error::new(
                std::io::ErrorKind::AlreadyExists,
                "migration destination already exists",
            ));
        }
        std::fs::rename(&temporary_path, destination)
    })();

    if result.is_err() {
        let _ = std::fs::remove_file(&temporary_path);
    }
    result.map(|_| ())
}

fn migration_temp_path(destination: &Path) -> PathBuf {
    let file_name = destination
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_else(|| "migration-file".to_string());
    let sequence = MIGRATION_TEMP_COUNTER.fetch_add(1, Ordering::Relaxed);
    destination.with_file_name(format!(
        ".{file_name}.migration-{}-{sequence}.tmp",
        std::process::id()
    ))
}

fn cleanup_copied_files(copied_files: &[PathBuf]) {
    for path in copied_files {
        let _ = std::fs::remove_file(path);
    }
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
