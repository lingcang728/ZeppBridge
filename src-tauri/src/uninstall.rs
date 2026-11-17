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
use zeppbridge_core::auth::{default_credential_backend_in, AuthManager, CredentialBackend};
use zeppbridge_core::local_api::{LOCAL_API_CREDENTIAL_ACCOUNT, PULL_CREDENTIAL_ACCOUNT};
use zeppbridge_core::official::OfficialStore;
use zeppbridge_core::push;

pub const PURGE_CREDENTIALS_ARG: &str = "--purge-credentials";

/// 凭据存储里不属于任何 Zepp 账号、账号名固定的条目：本机 API 令牌和
/// 无头 `serve` 的拉取令牌。
///
/// 它们不在 `auth.json` / `official.json` 里登记，上面两步清不到——以前
/// 勾了「删除应用数据」卸载后本机 API 令牌仍留在凭据管理器里。
const FIXED_CREDENTIAL_ACCOUNTS: &[&str] = &[LOCAL_API_CREDENTIAL_ACCOUNT, PULL_CREDENTIAL_ACCOUNT];

/// 删掉这个数据目录里登记的两条通道的令牌，以及本机 API 令牌。只动凭据
/// 存储和两份元数据，数据库由卸载程序删目录时一并处理。尽力而为：卸载不能
/// 因为这一步卡住。
pub fn purge_credentials_for_uninstall() {
    let Ok(data_dir) = paths::resolve_data_dir() else {
        return;
    };
    let _ = AuthManager::new(data_dir.clone()).clear_auth();
    let _ = OfficialStore::new(&data_dir).disconnect();
    // 推送目标的密钥按目标编号起名（`push:<id>`），名单在 data\push\targets.json 里，
    // 所以要在卸载程序删 data\ 之前读。
    let push_targets: Vec<String> = push::load_targets(&data_dir)
        .map(|targets| targets.into_iter().map(|target| target.id).collect())
        .unwrap_or_default();
    purge_unlisted_accounts(
        default_credential_backend_in(&data_dir).as_ref(),
        &push_targets,
    );
}

/// 逐条删，一条失败不影响下一条。
fn purge_unlisted_accounts(backend: &dyn CredentialBackend, push_targets: &[String]) {
    let push_accounts = push_targets.iter().map(|id| push::secret_account(id));
    for account in FIXED_CREDENTIAL_ACCOUNTS
        .iter()
        .map(|account| account.to_string())
        .chain(push_accounts)
    {
        let _ = backend.delete(&account);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;
    use std::sync::Mutex;

    #[derive(Default)]
    struct Memory {
        entries: Mutex<HashMap<String, String>>,
    }

    impl CredentialBackend for Memory {
        fn set(&self, user_id: &str, token: &str) -> Result<(), String> {
            self.entries
                .lock()
                .unwrap()
                .insert(user_id.into(), token.into());
            Ok(())
        }
        fn get(&self, user_id: &str) -> Result<Option<String>, String> {
            Ok(self.entries.lock().unwrap().get(user_id).cloned())
        }
        fn delete(&self, user_id: &str) -> Result<(), String> {
            self.entries.lock().unwrap().remove(user_id);
            Ok(())
        }
    }

    #[test]
    fn uninstall_removes_api_tokens_and_push_secrets() {
        let backend = Memory::default();
        backend
            .set(LOCAL_API_CREDENTIAL_ACCOUNT, "zbk_fixture")
            .unwrap();
        backend.set(PULL_CREDENTIAL_ACCOUNT, "zbp_fixture").unwrap();
        backend.set("push:home-nas", "{}").unwrap();
        backend.set("zepp-user-1", "kept-by-this-step").unwrap();
        purge_unlisted_accounts(&backend, &["home-nas".to_string()]);
        assert_eq!(backend.get(LOCAL_API_CREDENTIAL_ACCOUNT).unwrap(), None);
        assert_eq!(backend.get(PULL_CREDENTIAL_ACCOUNT).unwrap(), None);
        assert_eq!(backend.get("push:home-nas").unwrap(), None);
        // 账号令牌归 AuthManager / OfficialStore 清，这一步不碰别人的条目。
        assert!(backend.get("zepp-user-1").unwrap().is_some());
    }
}
