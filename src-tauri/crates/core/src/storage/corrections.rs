//! 用户本地纠正层。
//!
//! 三层严格分离，谁也不覆盖谁：
//!
//! 1. **Zepp 的原始事实** —— `raw_records` 里的报文，永远不改；
//! 2. **ZeppBridge 的解释** —— normalizer 从原始事实推出的 `workout_type`；
//! 3. **用户的本地纠正** —— 这一层。
//!
//! 纠正只保存在本机，不回传云端，也不参与 normalizer 重放：重放会重算第 2 层，
//! 但第 3 层原样保留。界面必须把纠正标成「你自己填的」，不能伪装成识别结果。
//!
//! 这里有两类纠正，都来自真实用户反馈（issue #3 / #4）：
//!
//! * **运动编号别名**：Zepp 的自定义训练模板会给出目录里没有的编号（例如 226）。
//!   我们没有证据说 226 是什么运动，所以不猜；由用户给这个编号起一次名字，
//!   之后所有同编号的记录都用它。
//! * **设备型号指认**：某些账号的设备响应里根本没有任何产品名字段，只有
//!   `deviceSource` / `deviceType` / `productId` 这类数字，本机无从推断型号。
//!   与其显示「未识别设备」，不如让用户从随包目录里指认一次。

use super::Database;
use crate::models::{error::Result, ZeppBridgeError};
use chrono::Utc;
use rusqlite::{params, OptionalExtension};
use std::collections::HashMap;

/// 用户给某个 Zepp 运动编号起的名字。
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkoutCodeLabel {
    pub zepp_type: i32,
    pub label: String,
    /// 本机有多少条记录用着这个编号。用户改一次就知道影响面有多大。
    pub records: i64,
    pub updated_at: String,
}

/// 用户对某台设备的型号指认。
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceModelOverride {
    /// 用户指认的那台设备的 key：device_id 或序列号。
    pub device_key: String,
    /// 随包设备目录里的 `catalog_id`。
    pub catalog_id: String,
    pub updated_at: String,
}

/// 自定义名字的长度上限。够写「壁球」「我的核心训练」，又不至于把界面撑爆
/// 或者被当成一个存放任意文本的地方。
pub const MAX_CODE_LABEL_CHARS: usize = 24;

impl Database {
    /// 用户对单条运动记录的类型纠正。
    ///
    /// 允许值是**随包运动目录里的全部 key**，不是一份写死的短名单：目录里有
    /// 131 个运动，只放行 15 个的话，用户想把一条记录改成「壁球」都做不到。
    pub fn set_workout_type_override(
        &self,
        workout_id: &str,
        user_override: Option<&str>,
    ) -> Result<()> {
        let normalized = user_override
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_lowercase);
        if let Some(value) = normalized.as_deref() {
            if !crate::sport_catalog::is_known_key(value) {
                return Err(ZeppBridgeError::ConfigError("不支持的运动类型纠正".into()));
            }
        }
        let changed = self.conn.execute(
            "UPDATE workouts SET workout_type_override = ?2 WHERE workout_id = ?1",
            params![workout_id, normalized],
        )?;
        if changed == 0 {
            return Err(ZeppBridgeError::DataUnavailable("运动记录不存在".into()));
        }
        Ok(())
    }

    /// 给一个未识别的 Zepp 运动编号起名字，传 `None` 撤销。
    ///
    /// 只接受**目录里没有的编号**。目录已经认识的编号说明我们有证据，用户想
    /// 改单条记录应该走 `set_workout_type_override`；允许在这里覆盖会让一个
    /// 拼错的名字悄悄取代已验证的映射。
    pub fn set_workout_code_label(&self, zepp_type: i32, label: Option<&str>) -> Result<()> {
        if crate::sport_catalog::resolve(zepp_type as i64).is_some() {
            return Err(ZeppBridgeError::ConfigError(
                "这个编号已经能被识别，请改用单条记录的类型纠正".into(),
            ));
        }
        let Some(label) = label.map(str::trim).filter(|value| !value.is_empty()) else {
            self.conn.execute(
                "DELETE FROM workout_code_labels WHERE zepp_type = ?1",
                params![zepp_type],
            )?;
            return Ok(());
        };
        if label.chars().count() > MAX_CODE_LABEL_CHARS {
            return Err(ZeppBridgeError::ConfigError(format!(
                "自定义运动名称最多 {MAX_CODE_LABEL_CHARS} 个字"
            )));
        }
        if label.chars().any(|c| c.is_control()) {
            return Err(ZeppBridgeError::ConfigError(
                "自定义运动名称不能包含控制字符".into(),
            ));
        }
        self.conn.execute(
            "INSERT INTO workout_code_labels(zepp_type, label, updated_at)
             VALUES(?1, ?2, ?3)
             ON CONFLICT(zepp_type) DO UPDATE SET
                 label = excluded.label,
                 updated_at = excluded.updated_at",
            params![zepp_type, label, Utc::now().to_rfc3339()],
        )?;
        Ok(())
    }

    /// 编号 → 用户名字。查询路径每次只读一次，然后在内存里套到记录上。
    pub fn workout_code_label_map(&self) -> Result<HashMap<i32, String>> {
        let mut stmt = self
            .conn
            .prepare("SELECT zepp_type, label FROM workout_code_labels")?;
        let rows = stmt.query_map([], |row| {
            Ok((row.get::<_, i32>(0)?, row.get::<_, String>(1)?))
        })?;
        let mut map = HashMap::new();
        for row in rows {
            let (code, label) = row?;
            map.insert(code, label);
        }
        Ok(map)
    }

    /// 本机所有未识别编号，带用户已经起的名字和影响到的记录数。
    ///
    /// 界面用它来做「这些编号还没有名字」的列表，用户一次改完，不用一条条点。
    pub fn unknown_workout_code_labels(&self) -> Result<Vec<WorkoutCodeLabel>> {
        let labels = self.workout_code_label_map()?;
        let mut stmt = self.conn.prepare(
            "SELECT zepp_type, COUNT(*) FROM workouts
             WHERE zepp_type IS NOT NULL AND workout_type LIKE 'unknown:%'
             GROUP BY zepp_type ORDER BY COUNT(*) DESC, zepp_type ASC",
        )?;
        let rows = stmt.query_map([], |row| Ok((row.get::<_, i32>(0)?, row.get::<_, i64>(1)?)))?;
        let mut out = Vec::new();
        for row in rows {
            let (code, records) = row?;
            let updated_at = self
                .conn
                .query_row(
                    "SELECT updated_at FROM workout_code_labels WHERE zepp_type = ?1",
                    params![code],
                    |row| row.get::<_, String>(0),
                )
                .optional()?
                .unwrap_or_default();
            out.push(WorkoutCodeLabel {
                zepp_type: code,
                label: labels.get(&code).cloned().unwrap_or_default(),
                records,
                updated_at,
            });
        }
        Ok(out)
    }

    /// 用户指认某台设备的型号，传 `None` 撤销。
    ///
    /// `catalog_id` 必须存在于随包目录里，否则等于让界面显示一个不存在的产品。
    pub fn set_device_model_override(
        &self,
        device_key: &str,
        catalog_id: Option<&str>,
    ) -> Result<()> {
        let device_key = device_key.trim();
        if device_key.is_empty() {
            return Err(ZeppBridgeError::ConfigError("设备标识不能为空".into()));
        }
        let Some(catalog_id) = catalog_id.map(str::trim).filter(|value| !value.is_empty()) else {
            self.conn.execute(
                "DELETE FROM device_model_overrides WHERE device_key = ?1",
                params![device_key],
            )?;
            return Ok(());
        };
        if !crate::device_catalog::catalog_entries()
            .iter()
            .any(|entry| entry.catalog_id == catalog_id)
        {
            return Err(ZeppBridgeError::ConfigError(
                "随包设备目录里没有这个型号".into(),
            ));
        }
        self.conn.execute(
            "INSERT INTO device_model_overrides(device_key, catalog_id, updated_at)
             VALUES(?1, ?2, ?3)
             ON CONFLICT(device_key) DO UPDATE SET
                 catalog_id = excluded.catalog_id,
                 updated_at = excluded.updated_at",
            params![device_key, catalog_id, Utc::now().to_rfc3339()],
        )?;
        Ok(())
    }

    /// 查这台设备有没有被用户指认过。按用户可能用到的每个 key 依次查。
    pub fn device_model_override(&self, keys: &[&str]) -> Result<Option<DeviceModelOverride>> {
        for key in keys {
            let key = key.trim();
            if key.is_empty() {
                continue;
            }
            let found = self
                .conn
                .query_row(
                    "SELECT device_key, catalog_id, updated_at FROM device_model_overrides
                     WHERE lower(device_key) = lower(?1)",
                    params![key],
                    |row| {
                        Ok(DeviceModelOverride {
                            device_key: row.get(0)?,
                            catalog_id: row.get(1)?,
                            updated_at: row.get(2)?,
                        })
                    },
                )
                .optional()?;
            if found.is_some() {
                return Ok(found);
            }
        }
        Ok(None)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn db() -> Database {
        Database::in_memory().unwrap()
    }

    #[test]
    fn code_labels_only_apply_to_codes_the_catalog_cannot_resolve() {
        let db = db();
        // 226 是用户真实报告过的自定义训练模板编号，目录里没有。
        assert!(crate::sport_catalog::resolve(226).is_none());
        db.set_workout_code_label(226, Some("我的自定义训练"))
            .unwrap();
        assert_eq!(
            db.workout_code_label_map()
                .unwrap()
                .get(&226)
                .map(String::as_str),
            Some("我的自定义训练")
        );

        // 已经有证据的编号不允许被一个自定义名字盖掉。
        assert!(crate::sport_catalog::resolve(52).is_some());
        assert!(db.set_workout_code_label(52, Some("力量")).is_err());

        // 撤销。
        db.set_workout_code_label(226, None).unwrap();
        assert!(db.workout_code_label_map().unwrap().is_empty());
    }

    #[test]
    fn code_labels_reject_control_characters_and_overlong_names() {
        let db = db();
        assert!(db.set_workout_code_label(226, Some("a\nb")).is_err());
        let long = "字".repeat(MAX_CODE_LABEL_CHARS + 1);
        assert!(db.set_workout_code_label(226, Some(&long)).is_err());
        let ok = "字".repeat(MAX_CODE_LABEL_CHARS);
        assert!(db.set_workout_code_label(226, Some(&ok)).is_ok());
    }

    #[test]
    fn type_override_accepts_the_whole_bundled_catalog_not_a_short_hardcoded_list() {
        // 「壁球」在目录里；旧实现只放行 15 个 key，用户改不到它。
        assert!(crate::sport_catalog::is_known_key("squash"));
        assert!(crate::sport_catalog::is_known_key("strength"));
        assert!(!crate::sport_catalog::is_known_key(
            "definitely-not-a-sport"
        ));
    }

    #[test]
    fn device_override_must_name_a_model_that_actually_ships_in_the_catalog() {
        let db = db();
        assert!(db
            .set_device_model_override("A1B2C3", Some("not-a-real-catalog-id"))
            .is_err());
        db.set_device_model_override("A1B2C3", Some("amazfit-balance-2"))
            .unwrap();
        let found = db.device_model_override(&["", "a1b2c3"]).unwrap().unwrap();
        assert_eq!(found.catalog_id, "amazfit-balance-2");

        db.set_device_model_override("A1B2C3", None).unwrap();
        assert!(db.device_model_override(&["A1B2C3"]).unwrap().is_none());
    }
}
