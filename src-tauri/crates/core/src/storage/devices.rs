//! 设备身份的收集、档案与数据摘要（从 storage/mod.rs 按领域拆出，逻辑不变）。

use super::*;

pub(super) fn push_alias(aliases: &mut Vec<String>, value: Option<String>) {
    if let Some(value) = value {
        let trimmed = value.trim();
        if trimmed.is_empty() || looks_like_firmware_version(trimmed) {
            return;
        }
        if !aliases.iter().any(|existing| existing == trimmed) {
            aliases.push(trimmed.to_string());
        }
    }
}

/// 这个值看起来是不是一个固件版本号，而不是设备标识。
///
/// 起因：有用户报告侧边栏里冒出三个点不动也删不掉的「未识别数据源」，标签是
/// `0.91.20.5`、`0.91.17.5`。那不是设备，那是固件版本——Zepp 某些报文里
/// `deviceId` / `sn` 位置上放的就是这种字符串，而 `device_identity_hints` 只
/// 认字段名不看值，于是每一个版本号都变成了一台「设备」，固件一升级就再多一
/// 台。
///
/// 判据取自真实数据的形状差异，不是猜的：本地库里真实的设备标识是十六进制
/// MAC（`D8803CFFFEC19AC6`）、纯数字序列号（`23229501001311`）或产品码
/// （`PRUC72 070007001c`）——没有一个带点；而同一张表里的 `firmware` 列长
/// 成 `0.116.137.19`、`0.132.139.2`、`V0.54.131.3`。所以「可选的 V/v 前缀 +
/// 至少三段纯数字」这个形状只会命中版本号。
///
/// 刻意收得很紧：宁可漏掉一个没见过的假设备，也不能把某个厂商真的用点分十进
/// 制当序列号的设备判成幽灵后再也进不来。
pub fn looks_like_firmware_version(value: &str) -> bool {
    let body = value.strip_prefix(['V', 'v']).unwrap_or(value);
    let mut segments = 0usize;
    for segment in body.split('.') {
        if segment.is_empty() || !segment.bytes().all(|byte| byte.is_ascii_digit()) {
            return false;
        }
        segments += 1;
    }
    segments >= 3
}

pub(super) fn string_field(value: &serde_json::Value, keys: &[&str]) -> Option<String> {
    let object = value.as_object()?;
    for key in keys {
        match object.get(*key) {
            Some(serde_json::Value::String(text)) if !text.trim().is_empty() => {
                return Some(text.trim().to_string());
            }
            Some(serde_json::Value::Number(number)) => return Some(number.to_string()),
            _ => {}
        }
    }
    None
}

pub(super) fn firmware_from_bind_device(raw: &str) -> Option<String> {
    raw.split(':')
        .next_back()
        .map(str::trim)
        .filter(|value| value.chars().any(|ch| ch.is_ascii_digit()) && value.contains('.'))
        .map(str::to_string)
}

pub(super) fn collect_objects<'a>(
    value: &'a serde_json::Value,
    out: &mut Vec<&'a serde_json::Value>,
) {
    match value {
        serde_json::Value::Array(items) => {
            for item in items {
                collect_objects(item, out);
            }
        }
        serde_json::Value::Object(object) => {
            out.push(value);
            for key in ["data", "items", "records", "results", "list", "summary"] {
                if let Some(child) = object.get(key) {
                    collect_objects(child, out);
                }
            }
        }
        _ => {}
    }
}

pub(super) fn device_identity_hints(payload: &serde_json::Value) -> Vec<DeviceIdentityHint> {
    let mut objects = Vec::new();
    collect_objects(payload, &mut objects);
    let mut hints = Vec::new();
    for object in objects {
        let mut aliases = Vec::new();
        push_alias(
            &mut aliases,
            string_field(object, &["device_id", "deviceId", "deviceid"]),
        );
        push_alias(
            &mut aliases,
            string_field(object, &["sn", "serial", "serialNumber"]),
        );
        if aliases.is_empty() {
            continue;
        }
        let bind = string_field(object, &["bind_device", "bindDevice"]);
        // `device_id` 和 `serial` 也要过同一道闸：`upsert_device_identity` 会把
        // 这两个值本身也当成别名写进去，只拦 `aliases` 拦不住它们。
        hints.push(DeviceIdentityHint {
            device_id: string_field(object, &["device_id", "deviceId", "deviceid"])
                .filter(|value| !looks_like_firmware_version(value)),
            serial: string_field(object, &["sn", "serial", "serialNumber"])
                .filter(|value| !looks_like_firmware_version(value)),
            firmware: bind.as_deref().and_then(firmware_from_bind_device),
            timezone: string_field(object, &["syncedTimezone", "timezone", "tz"]).filter(|value| {
                value.contains('/') || value.chars().any(|ch| ch.is_ascii_alphabetic())
            }),
            name: string_field(object, &["displayName", "deviceName", "productName"]),
            aliases,
        });
    }
    hints
}

impl Database {
    /// The IANA timezone the devices report, for endpoints that ask for a zone
    /// name rather than an offset.
    pub fn device_time_zone(&self) -> Result<Option<String>> {
        Ok(self
            .conn
            .query_row(
                "SELECT timezone FROM device_identities
                 WHERE timezone IS NOT NULL AND timezone <> ''
                 ORDER BY updated_at DESC LIMIT 1",
                [],
                |row| row.get::<_, String>(0),
            )
            .optional()?)
    }

    /// How many retained `wellness` raw responses carry one of these labels.
    pub(super) fn count_wellness_raw(&self, labels: &[&str]) -> Result<i64> {
        let mut total = 0i64;
        for label in labels {
            let pattern = format!("wellness:{label}:%");
            total += self.conn.query_row(
                "SELECT COUNT(*) FROM raw_records WHERE stream = 'wellness' AND source_key LIKE ?1",
                [&pattern],
                |row| row.get::<_, i64>(0),
            )?;
        }
        Ok(total)
    }

    pub fn upsert_device_identity(&self, hint: &DeviceIdentityHint) -> Result<()> {
        let updated_at = Utc::now().to_rfc3339();
        let mut aliases = hint.aliases.clone();
        if let Some(device_id) = hint.device_id.as_ref() {
            aliases.push(device_id.clone());
        }
        if let Some(serial) = hint.serial.as_ref() {
            aliases.push(serial.clone());
        }
        aliases.retain(|value| !value.trim().is_empty());
        aliases.sort();
        aliases.dedup();
        for alias in aliases {
            self.conn.execute(
                "INSERT INTO device_identities
                    (alias, name, firmware, serial, device_id, timezone, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
                 ON CONFLICT(alias) DO UPDATE SET
                    name = COALESCE(excluded.name, device_identities.name),
                    firmware = COALESCE(excluded.firmware, device_identities.firmware),
                    serial = COALESCE(excluded.serial, device_identities.serial),
                    device_id = COALESCE(excluded.device_id, device_identities.device_id),
                    timezone = COALESCE(excluded.timezone, device_identities.timezone),
                    updated_at = excluded.updated_at",
                params![
                    alias,
                    hint.name,
                    hint.firmware,
                    hint.serial,
                    hint.device_id,
                    hint.timezone,
                    updated_at,
                ],
            )?;
        }
        Ok(())
    }

    pub fn lookup_device_profile(&self, device_id: &str) -> Result<Option<DeviceProfile>> {
        let trimmed = device_id.trim();
        if trimmed.is_empty() {
            return Ok(None);
        }
        self.conn
            .query_row(
                "SELECT name, firmware, serial, device_id, timezone
                 FROM device_identities WHERE lower(alias) = lower(?1) LIMIT 1",
                [trimmed],
                |row| {
                    Ok(DeviceProfile {
                        name: row.get(0)?,
                        firmware: row.get(1)?,
                        serial: row.get(2)?,
                        device_id: row.get(3)?,
                        timezone: row.get(4)?,
                        ..DeviceProfile::default()
                    })
                },
            )
            .optional()
            .map_err(Into::into)
    }

    /// Derive local-data presence from normalized records without introducing
    /// a product-specific table. User-level fused records are deliberately
    /// excluded: they cannot be attributed to one physical device.
    pub fn device_data_summary(&self, aliases: &[String]) -> Result<(bool, Option<String>)> {
        let mut normalized_aliases = Vec::new();
        for alias in aliases {
            let trimmed = alias.trim();
            if trimmed.is_empty()
                || normalized_aliases
                    .iter()
                    .any(|existing: &String| existing.eq_ignore_ascii_case(trimmed))
            {
                continue;
            }
            normalized_aliases.push(trimmed.to_string());
        }
        if normalized_aliases.is_empty() {
            return Ok((false, None));
        }

        let mut latest: Option<String> = None;
        for alias in &normalized_aliases {
            for (table, column) in [
                ("metric_samples", "timestamp"),
                ("daily_metrics", "date"),
                ("sleep_sessions", "start_time"),
                ("workouts", "start_time"),
            ] {
                let sql = format!(
                    "SELECT MAX({column}) FROM {table}
                     WHERE lower(device_id) = lower(?1)
                       AND lower(source_scope) = 'device'"
                );
                let value: Option<String> = self.conn.query_row(&sql, [alias], |row| row.get(0))?;
                if let Some(value) = value {
                    if latest
                        .as_ref()
                        .map(|current| value.as_str() > current.as_str())
                        .unwrap_or(true)
                    {
                        latest = Some(value);
                    }
                }
            }
        }
        Ok((latest.is_some(), latest))
    }

    pub(super) fn harvest_device_identities(&self, payload: &serde_json::Value) -> Result<()> {
        for hint in device_identity_hints(payload) {
            self.upsert_device_identity(&hint)?;
        }
        Ok(())
    }

    pub(super) fn get_latest_heart_rate_sample(&self) -> Result<Option<(i32, String)>> {
        let value: Option<(f64, String)> = self
            .conn
            .query_row(
                "SELECT value, timestamp FROM metric_samples
                 WHERE metric = 'heart_rate'
                 ORDER BY timestamp DESC,
                    CASE source_scope WHEN 'user_fused' THEN 0 WHEN 'device' THEN 1 ELSE 2 END,
                    id DESC LIMIT 1",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()?;
        Ok(value.map(|(value, timestamp)| (value.round() as i32, timestamp)))
    }
}
