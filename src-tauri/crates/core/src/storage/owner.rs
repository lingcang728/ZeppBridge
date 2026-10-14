//! 库归属：一个数据目录只装一个 Zepp 账号的数据（代码审查 R06）。
//!
//! 原始记录的自然键不带账号（stream + source_key、官方按日键、sleep ID），
//! 两个账号写进同一个库会互相覆盖、混在同一条时间线上，界面和导出都分不清
//! 哪条是谁的。所以库在第一次被某个账号写入时记下主人（`app_meta`），之后：
//!
//! - 同步前核对：主人不同就拒绝，一行都不写；
//! - 保存新凭据前核对：主人不同就拒绝，让用户先把 `data` 文件夹移走或改名。
//!
//! 旧通道与官方通道的用户编号是同一个编号空间（实测一致），可以直接比较。
//! **任何情况下都不自动清空已有库**——换账号只能由用户显式挪走旧库。

use super::*;

/// 库主人的用户编号。
const LIBRARY_OWNER_KEY: &str = "library_owner_user_id";
/// 主人是怎么认下的：`first_write`（空库第一次写入）/ `upgrade`（升级前就有数据，
/// 由一直在同步它的账号认领——归属是推定的，不是核实的）。
const LIBRARY_OWNER_SOURCE_KEY: &str = "library_owner_source";

impl Database {
    /// 库主人；老库在第一次同步前还没有。
    pub fn library_owner(&self) -> Result<Option<String>> {
        self.get_app_meta(LIBRARY_OWNER_KEY)
    }

    fn has_any_raw_record(&self) -> Result<bool> {
        Ok(self
            .conn
            .query_row("SELECT 1 FROM raw_records LIMIT 1", [], |_| Ok(()))
            .optional()?
            .is_some())
    }

    fn set_library_owner(&self, user_id: &str, source: &str) -> Result<()> {
        self.set_app_meta(LIBRARY_OWNER_KEY, user_id)?;
        self.set_app_meta(LIBRARY_OWNER_SOURCE_KEY, source)
    }

    /// 同步写入前：没有主人就认下这个账号（老库由一直同步它的账号认领），
    /// 主人不同就拒绝。调用方必须持有写锁。
    pub fn claim_library_for_sync(&self, user_id: &str) -> Result<()> {
        let user_id = user_id.trim();
        match self.library_owner()? {
            Some(owner) if owner == user_id => Ok(()),
            Some(_) => Err(ZeppBridgeError::AccountMismatch),
            None => {
                let source = if self.has_any_raw_record()? {
                    "upgrade"
                } else {
                    "first_write"
                };
                self.set_library_owner(user_id, source)
            }
        }
    }

    /// 保存新凭据前：`known_accounts` 是这个数据目录里已经配置过的账号
    /// （旧通道 `auth.json`、官方 `official.json`）。
    ///
    /// - 有主人：必须同一个账号；
    /// - 没主人、库里已有数据：数据多半是已配置那个账号同步来的——新账号和它
    ///   不同就拒绝；没有任何已配置账号可对照时认下新账号（推定）；
    /// - 空库：直接认下。
    ///
    /// 调用方必须持有写锁。
    pub fn claim_library_for_login(&self, user_id: &str, known_accounts: &[String]) -> Result<()> {
        let user_id = user_id.trim();
        match self.library_owner()? {
            Some(owner) if owner == user_id => Ok(()),
            Some(_) => Err(ZeppBridgeError::AccountMismatch),
            None if !self.has_any_raw_record()? => self.set_library_owner(user_id, "first_write"),
            None => {
                let others = known_accounts
                    .iter()
                    .map(|account| account.trim())
                    .any(|account| !account.is_empty() && account != user_id);
                if others {
                    return Err(ZeppBridgeError::AccountMismatch);
                }
                self.set_library_owner(user_id, "upgrade")
            }
        }
    }
}

/// 这个数据目录里已经配置过的账号编号（旧通道与官方各一个，可能相同）。
/// 只读元数据文件，不碰凭据存储。
pub fn configured_accounts(data_dir: &std::path::Path) -> Vec<String> {
    let mut accounts = Vec::new();
    if let Some(user_id) = crate::auth::AuthManager::new(data_dir.to_path_buf()).saved_user_id() {
        accounts.push(user_id);
    }
    if let Ok(Some(meta)) = crate::official::OfficialStore::new(data_dir).meta() {
        accounts.push(meta.user_id);
    }
    accounts
}
