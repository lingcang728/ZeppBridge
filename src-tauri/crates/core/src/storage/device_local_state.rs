//! 设备的本机状态：现在只有「隐藏」一项（3.1.1）。
//!
//! 和手动指认（`corrections.rs`）一样只存本机、不回传云端、不参与重放。隐藏**只藏列表**：
//! 设置页、概览、设备详情的设备清单不再列它，但它记下的样本、图表和导出照旧——
//! 按 device_id 把全库样本都滤一遍，代价远大于收益，用户要的也只是「列表里别再挂着这台」。
//!
//! key 和手动指认同一套：device_id，没有就用序列号（界面 `useDevices.ts` 的 `deviceKey`），按小写比。

use std::collections::HashSet;

use chrono::Utc;
use rusqlite::params;

use super::Database;
use crate::models::{error::Result, ZeppBridgeError};

impl Database {
    /// 隐藏或恢复一台设备。恢复时直接删掉那一行，表里只留藏着的。
    pub fn set_device_hidden(&self, device_key: &str, hidden: bool) -> Result<()> {
        let device_key = device_key.trim();
        if device_key.is_empty() {
            return Err(ZeppBridgeError::ConfigError("设备标识不能为空".into()));
        }
        let tx = self.conn.unchecked_transaction()?;
        // 大小写不同的同一个 key 只留一行，和手动指认一样。
        self.conn.execute(
            "DELETE FROM device_local_state WHERE lower(device_key) = lower(?1)",
            [device_key],
        )?;
        if hidden {
            self.conn.execute(
                "INSERT INTO device_local_state(device_key, hidden, updated_at) VALUES(?1, 1, ?2)",
                params![device_key, Utc::now().to_rfc3339()],
            )?;
        }
        tx.commit()?;
        Ok(())
    }

    /// 藏起来的设备 key，全部小写。
    pub fn hidden_device_keys(&self) -> Result<HashSet<String>> {
        let mut stmt = self
            .conn
            .prepare("SELECT lower(device_key) FROM device_local_state WHERE hidden = 1")?;
        let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
        let mut keys = HashSet::new();
        for row in rows {
            keys.insert(row?);
        }
        Ok(keys)
    }
}

/// 这台设备的任一标识（device_id、序列号）在不在隐藏集合里。
///
/// 两个都查：Helio 这类一台设备两个 device_id 的，用户藏的是列表里那一行的 key，
/// 另一路拼出来的档案可能只带序列号。
pub fn is_hidden_device(
    hidden: &HashSet<String>,
    device_id: Option<&str>,
    serial: Option<&str>,
) -> bool {
    if hidden.is_empty() {
        return false;
    }
    [device_id, serial]
        .into_iter()
        .flatten()
        .map(|value| value.trim().to_lowercase())
        .any(|value| !value.is_empty() && hidden.contains(&value))
}
