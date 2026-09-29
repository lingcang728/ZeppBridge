//! 官方令牌放系统凭据存储；数据目录里的 `official.json` 只放不敏感的元数据。
//!
//! 与旧通道共用同一个凭据后端，但条目名带 `official:` 前缀——旧通道的条目名
//! 是纯数字用户编号，两边不会撞上。访问令牌和刷新令牌各存一条：Windows 凭据
//! 管理器单条有 2560 字节上限，官方令牌的长度文档没写。

use super::OfficialTokens;
use crate::auth::{default_credential_backend_in, CredentialBackend};
use crate::models::{error::Result, ZeppBridgeError};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::Arc;

const META_FILE: &str = "official.json";

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
        let temp = self.dir.join(format!("{META_FILE}.tmp"));
        std::fs::write(&temp, text)?;
        std::fs::rename(temp, self.meta_path())?;
        Ok(())
    }

    /// 先写凭据、再写元数据：元数据说「已连接」时，令牌一定已经在了。
    pub fn save(&self, tokens: &OfficialTokens, connected_at: i64) -> Result<()> {
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
        let previous = self.meta()?.filter(|meta| meta.user_id == tokens.user_id);
        self.write_meta(&OfficialMeta {
            user_id: tokens.user_id.clone(),
            connected_at: previous
                .as_ref()
                .map_or(connected_at, |meta| meta.connected_at),
            expires_at: tokens.expires_at,
            needs_reauth: false,
            nickname: previous.and_then(|meta| meta.nickname),
        })
    }

    /// 记下官方资料里的昵称（授权成功后调用）。空白昵称不记。
    pub fn set_nickname(&self, nickname: Option<&str>) -> Result<()> {
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
    pub fn mark_needs_reauth(&self) -> Result<()> {
        let Some(mut meta) = self.meta()? else {
            return Ok(());
        };
        self.delete_secrets(&meta.user_id)?;
        meta.needs_reauth = true;
        self.write_meta(&meta)
    }

    /// 断开：令牌和元数据都删掉。**不碰任何健康数据。**
    pub fn clear(&self) -> Result<()> {
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
