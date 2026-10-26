//! 卸载时勾了「删除应用数据」。
//!
//! Tauri 的 NSIS 模板只删 `%APPDATA%` / `%LOCALAPPDATA%` 下以包名命名的目录，
//! 而 ZeppBridge 的库在安装目录旁的 `data\`，令牌在系统凭据管理器里——勾了也
//! 什么都没删，重装后旧账号、旧设备原样回来（2026-10 用户反馈）。
//!
//! 卸载程序在删 exe 之前用 [`PURGE_CREDENTIALS_ARG`] 调一次本程序删令牌
//! （条目名按账号编号起，只有本程序知道这个数据目录里登记过哪些账号），
//! 随后自己删掉 `data\`（`src-tauri/windows/hooks.nsh`）。

use crate::paths;
use zeppbridge_core::auth::AuthManager;
use zeppbridge_core::official::OfficialStore;

pub const PURGE_CREDENTIALS_ARG: &str = "--purge-credentials";

/// 删掉这个数据目录里登记的两条通道的令牌。只动凭据存储和两份元数据，
/// 数据库由卸载程序删目录时一并处理。尽力而为：卸载不能因为这一步卡住。
pub fn purge_credentials_for_uninstall() {
    let Ok(data_dir) = paths::resolve_data_dir() else {
        return;
    };
    let _ = AuthManager::new(data_dir.clone()).clear_auth();
    let _ = OfficialStore::new(&data_dir).disconnect();
}
