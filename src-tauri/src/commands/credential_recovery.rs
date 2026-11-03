//! Public options only. Credentials never enter recovery status or IPC replies.

use serde::{Deserialize, Serialize};
use std::time::Duration;
use zeppbridge_core::auth::{APP_TOKEN_ENV, CREDENTIAL_STORE_ENV};

pub(crate) const RETENTION: Duration = Duration::from_secs(10 * 60);

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct RecoveryStatus {
    pub platform: String,
    pub can_save_file: bool,
}

impl RecoveryStatus {
    pub(crate) fn current() -> Self {
        Self {
            platform: std::env::consts::OS.into(),
            can_save_file: can_save_file(),
        }
    }
}

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum StorageChoice {
    System,
    File,
}

pub(crate) fn file_allowed(requested: Option<&str>, has_env_token: bool) -> bool {
    cfg!(unix)
        && match requested.map(str::trim).filter(|value| !value.is_empty()) {
            Some(value) => value.eq_ignore_ascii_case("file"),
            None => !has_env_token,
        }
}

pub(crate) fn can_save_file() -> bool {
    file_allowed(
        std::env::var(CREDENTIAL_STORE_ENV).ok().as_deref(),
        std::env::var(APP_TOKEN_ENV).is_ok_and(|value| !value.trim().is_empty()),
    )
}
