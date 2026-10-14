//! 设备档案与身份提示（从 models/types.rs 按领域拆出，形状不变）。

use super::*;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum DeviceMatchStatus {
    Exact,
    Alias,
    /// The user told us which model this is, because the account's device
    /// response carried no product name for ZeppBridge to match on. It is a
    /// correction, not a recognition, and the UI must say so.
    UserAssigned,
    #[default]
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq, Eq)]
pub struct DeviceProfile {
    /// Existing display name is retained for backwards compatibility. It may
    /// be a user nickname; `canonical_name` is the official catalog value.
    pub name: Option<String>,
    #[serde(default)]
    pub canonical_name: Option<String>,
    #[serde(default)]
    pub display_name: Option<String>,
    #[serde(default)]
    pub catalog_id: Option<String>,
    #[serde(default)]
    pub kind: Option<String>,
    #[serde(default)]
    pub image_key: Option<String>,
    #[serde(default)]
    pub match_status: DeviceMatchStatus,
    #[serde(default)]
    pub has_local_data: bool,
    #[serde(default)]
    pub last_data_at: Option<String>,
    pub firmware: Option<String>,
    pub serial: Option<String>,
    pub device_id: Option<String>,
    pub timezone: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DeviceCacheMetadata {
    pub status: String,
    #[serde(default)]
    pub cached_at: Option<DateTime<Utc>>,
    #[serde(default)]
    pub age_seconds: Option<i64>,
    #[serde(default)]
    pub refreshed: bool,
    #[serde(default)]
    pub refresh_error: Option<String>,
    /// `refresh_error` 那句话的稳定码。界面按它取自己语言的说法。
    #[serde(default)]
    pub refresh_error_code: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DeviceProfilesResult {
    pub profiles: Vec<DeviceProfile>,
    pub cache: DeviceCacheMetadata,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct DeviceIdentityHint {
    pub aliases: Vec<String>,
    pub name: Option<String>,
    pub firmware: Option<String>,
    pub serial: Option<String>,
    pub device_id: Option<String>,
    pub timezone: Option<String>,
}
