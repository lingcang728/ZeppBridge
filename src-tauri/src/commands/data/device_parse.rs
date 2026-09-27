//! 设备档案的 JSON 解析与诊断用的结构摘要（只记形状、不记值）（从 commands/data.rs 拆出）。

use super::*;

pub(super) fn empty_device_diagnostic(status: &str) -> DiagnosticDeviceEvidence {
    DiagnosticDeviceEvidence {
        status: status.into(),
        object_count: 0,
        unknown_device_count: 0,
        id_alias_objects: 0,
        serial_alias_objects: 0,
        name_field_objects: 0,
        firmware_field_objects: 0,
        candidates: Vec::new(),
        unmatched_product_hints: Vec::new(),
        model_identifier_hints: Vec::new(),
        shapes: Vec::new(),
    }
}

pub(super) fn safe_product_hint(value: &str) -> Option<String> {
    let value = value.trim();
    if !(2..=64).contains(&value.chars().count())
        || value.contains(['@', '\\', ':'])
        || !value.chars().all(|ch| {
            ch.is_alphanumeric()
                || ch.is_whitespace()
                || matches!(ch, '-' | '_' | '/' | '(' | ')' | '.')
        })
    {
        return None;
    }
    let compact = value
        .chars()
        .filter(|ch| ch.is_alphanumeric())
        .collect::<String>();
    let looks_like_long_identifier =
        compact.len() >= 12 && compact.chars().all(|ch| ch.is_ascii_hexdigit());
    (!looks_like_long_identifier).then(|| value.to_owned())
}

pub(super) fn collect_unmatched_product_hints(
    value: &Value,
    hints: &mut BTreeSet<String>,
    depth: usize,
) {
    if depth > 6 || hints.len() >= 12 {
        return;
    }
    match value {
        Value::Array(items) => {
            for item in items.iter().take(8) {
                collect_unmatched_product_hints(item, hints, depth + 1);
            }
        }
        Value::Object(object) => {
            for (key, child) in object {
                let is_product_hint = matches!(
                    key.as_str(),
                    "productName"
                        | "product_name"
                        | "modelName"
                        | "model"
                        | "modelCode"
                        | "model_code"
                        | "modelNumber"
                        | "hardwareModel"
                        | "productCode"
                        | "deviceType"
                );
                if is_product_hint {
                    if let Some(hint) = child.as_str().and_then(safe_product_hint) {
                        hints.insert(hint);
                    }
                }
                collect_unmatched_product_hints(child, hints, depth + 1);
                if key == "additionalInfo" || key == "bind_device" || key == "bindDevice" {
                    if let Some(raw) = child.as_str() {
                        if let Ok(decoded) = serde_json::from_str::<Value>(raw) {
                            collect_unmatched_product_hints(&decoded, hints, depth + 1);
                        }
                    }
                }
            }
        }
        _ => {}
    }
}

pub(super) fn diagnostic_json_type(value: &Value) -> &'static str {
    match value {
        Value::Null => "null",
        Value::Bool(_) => "boolean",
        Value::Number(_) => "number",
        Value::String(_) => "string",
        Value::Array(_) => "array",
        Value::Object(_) => "object",
    }
}

pub(super) fn diagnostic_field_name(key: &str) -> String {
    let safe = key.len() <= 64
        && key
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '_' | '-'))
        && key.chars().filter(|ch| ch.is_ascii_digit()).count() <= 12;
    if safe {
        key.to_owned()
    } else {
        "<dynamic_key>".into()
    }
}

pub(super) fn collect_device_shapes(
    value: &Value,
    path: &str,
    evidence: &mut DiagnosticDeviceEvidence,
    shapes: &mut BTreeSet<DiagnosticObjectShape>,
    depth: usize,
) {
    if depth > 8 || shapes.len() >= 40 {
        return;
    }
    match value {
        Value::Array(items) => {
            for item in items.iter().take(8) {
                collect_device_shapes(item, &format!("{path}[]"), evidence, shapes, depth + 1);
            }
        }
        Value::Object(object) => {
            evidence.object_count += 1;
            let has_any = |names: &[&str]| names.iter().any(|name| object.contains_key(*name));
            evidence.id_alias_objects += usize::from(has_any(&[
                "device_id",
                "deviceId",
                "deviceid",
                "deviceSource",
                "macAddress",
            ]));
            evidence.serial_alias_objects +=
                usize::from(has_any(&["sn", "serial", "serialNumber"]));
            evidence.name_field_objects += usize::from(has_any(&[
                "displayName",
                "deviceName",
                "productName",
                "product_name",
                "modelName",
                "model",
                "nickname",
                "name",
            ]));
            evidence.firmware_field_objects += usize::from(has_any(&[
                "productVersion",
                "firmwareVersion",
                "hardwareVersion",
                "fwVersion",
                "bind_device",
                "bindDevice",
            ]));
            let mut fields = object
                .iter()
                .map(|(name, value)| DiagnosticField {
                    name: diagnostic_field_name(name),
                    json_type: diagnostic_json_type(value).into(),
                })
                .collect::<Vec<_>>();
            fields.sort();
            fields.dedup();
            shapes.insert(DiagnosticObjectShape {
                path: path.into(),
                fields,
            });
            for (key, child) in object {
                let child_path = format!("{path}.{}", diagnostic_field_name(key));
                collect_device_shapes(child, &child_path, evidence, shapes, depth + 1);
                if key == "additionalInfo" {
                    if let Some(raw) = child.as_str() {
                        if let Ok(decoded) = serde_json::from_str::<Value>(raw) {
                            collect_device_shapes(
                                &decoded,
                                &format!("{child_path}<json>"),
                                evidence,
                                shapes,
                                depth + 1,
                            );
                        }
                    }
                }
            }
        }
        _ => {}
    }
}

pub(super) fn build_device_diagnostic(value: &Value) -> DiagnosticDeviceEvidence {
    let mut evidence = empty_device_diagnostic("available");
    let mut shapes = BTreeSet::new();
    collect_device_shapes(value, "$", &mut evidence, &mut shapes, 0);
    evidence.shapes = shapes.into_iter().collect();
    let mut seen = BTreeSet::new();
    let mut unmatched_product_hints = BTreeSet::new();
    let mut model_identifier_hints = BTreeSet::new();
    for item in device_items(value) {
        collect_model_identifier_hints(&item, &mut model_identifier_hints);
        let Some(profile) = parse_device_profiles(&item).into_iter().next() else {
            continue;
        };
        if profile.match_status == DeviceMatchStatus::Unknown {
            evidence.unknown_device_count += 1;
            collect_unmatched_product_hints(&item, &mut unmatched_product_hints, 0);
        }
        let (Some(catalog_id), Some(canonical_name)) = (profile.catalog_id, profile.canonical_name)
        else {
            continue;
        };
        if seen.insert(catalog_id.clone()) {
            evidence.candidates.push(DiagnosticDeviceCandidate {
                catalog_id,
                canonical_name,
                firmware: profile.firmware,
                match_status: profile.match_status,
            });
        }
    }
    evidence
        .candidates
        .sort_by(|a, b| a.catalog_id.cmp(&b.catalog_id));
    evidence.unmatched_product_hints = unmatched_product_hints.into_iter().collect();
    evidence.model_identifier_hints = model_identifier_hints.into_iter().take(8).collect();
    evidence
}

/// 收集型号类的数字标识。
///
/// 这些是「哪一款表」而不是「哪一台表」：只取整数，`deviceSource` 和
/// `deviceType` 在 Zepp 的接口里都是型号维度的取值。序列号、MAC、绑定时间和
/// 任何字符串一律不收 —— 没有它们这份报告也够补目录，收了就越界了。
/// 设备条目里的 `deviceSource` 数字。
///
/// **只取 `deviceSource`**。`deviceType` 长得像同一类东西，却是族码：反馈库里
/// `deviceType:0` 一个值就横跨二十款表，拿它去查目录只会张冠李戴。
pub(super) fn device_source_numbers(item: &Value, extra: &Value) -> Vec<i64> {
    let mut out = Vec::new();
    for source in [item, extra] {
        let Some(object) = source.as_object() else {
            continue;
        };
        for key in ["deviceSource", "device_source"] {
            let Some(Value::Number(number)) = object.get(key) else {
                continue;
            };
            if let Some(value) = number.as_i64() {
                if value > 0 && !out.contains(&value) {
                    out.push(value);
                }
            }
        }
    }
    out
}

pub(super) fn collect_model_identifier_hints(item: &Value, out: &mut BTreeSet<String>) {
    let extra = flattened_device_metadata(item);
    for (source, keys) in [
        (
            item,
            ["deviceSource", "device_source", "deviceType", "device_type"],
        ),
        (
            &extra,
            ["deviceSource", "device_source", "deviceType", "device_type"],
        ),
    ] {
        let Some(object) = source.as_object() else {
            continue;
        };
        for key in keys {
            let Some(Value::Number(number)) = object.get(key) else {
                continue;
            };
            let Some(value) = number.as_i64() else {
                continue;
            };
            if !(0..=99_999_999).contains(&value) {
                continue;
            }
            let canonical = if key.starts_with("deviceS") || key.starts_with("device_s") {
                "deviceSource"
            } else {
                "deviceType"
            };
            out.insert(format!("{canonical}:{value}"));
        }
    }
}

pub(crate) fn parse_device_profiles(value: &serde_json::Value) -> Vec<DeviceProfile> {
    let items = device_items(value);
    items
        .into_iter()
        .map(|item| {
            let extra = flattened_device_metadata(&item);
            let display_name =
                first_string(&item, &["displayName", "deviceName", "nickname", "name"]).or_else(
                    || first_string(&extra, &["displayName", "deviceName", "nickname", "name"]),
                );
            let mut product_names = merged_string_values(
                &item,
                &extra,
                &["productName", "product_name", "modelName", "model"],
            );
            // `productId` / `hardwareVersion` are sometimes the internal
            // codename ("amazfit_balance2"), which normalizes to exactly the
            // same string as the catalog alias "Amazfit Balance 2". Alias
            // matching is equality on the normalized form, so a value that is
            // not a product name simply matches nothing.
            product_names.extend(merged_string_values(
                &item,
                &extra,
                &["productId", "product_id", "hardwareVersion"],
            ));
            product_names.sort();
            product_names.dedup();
            let mut model_codes = string_values(
                &item,
                &[
                    "modelCode",
                    "model_code",
                    "modelNumber",
                    "hardwareModel",
                    "productCode",
                ],
            );
            model_codes.extend(string_values(
                &extra,
                &[
                    "modelCode",
                    "model_code",
                    "modelNumber",
                    "hardwareModel",
                    "productCode",
                ],
            ));
            // Some accounts' device list carries no product-name field at all
            // (issue #4: nameFieldObjects = 0). The only model-class facts in
            // that payload are these numeric/short identifiers, so they have to
            // reach the matcher — otherwise the watch is unidentifiable by
            // construction no matter how complete the catalog gets.
            //
            // Feeding them in does not invent a mapping: the bundled catalog
            // still has to carry the value before anything matches.
            model_codes.extend(merged_string_values(
                &item,
                &extra,
                &[
                    "deviceSource",
                    "device_source",
                    "deviceType",
                    "device_type",
                    "productId",
                    "product_id",
                    "hardwareVersion",
                ],
            ));
            model_codes.sort();
            model_codes.dedup();
            // deviceSource 另走一条路，不跟上面那些字符串混在一起。
            //
            // 上面那一坨里 `deviceType` 也在，而它是族码——光 deviceType:0 一个
            // 值在反馈库里就横跨二十款表。两者一旦并成一列，目录里就没办法只
            // 收 deviceSource 而不误收 deviceType。
            let device_source_codes = device_source_numbers(&item, &extra);
            let device_names = merged_string_values(&item, &extra, &["deviceName", "deviceType"]);
            let device_id = first_string(&item, &["deviceId", "device_id", "macAddress"])
                .or_else(|| first_string(&extra, &["deviceId", "device_id", "macAddress"]))
                // Keep the legacy source-only key, but never let a model code
                // hide an actual device identity in nested metadata.
                .or_else(|| first_string(&item, &["deviceSource"]));
            if let Some(device_id) = device_id.as_deref() {
                if device_id.starts_with('A')
                    && device_id.chars().skip(1).all(|c| c.is_ascii_digit())
                {
                    model_codes.push(device_id.to_string());
                }
            }
            let names = product_names.iter().map(String::as_str).collect::<Vec<_>>();
            let device_name_refs = device_names.iter().map(String::as_str).collect::<Vec<_>>();
            let model_code_refs = model_codes.iter().map(String::as_str).collect::<Vec<_>>();
            let matched = match_catalog(&CatalogMatchInput {
                device_source_codes,
                model_codes: model_code_refs,
                product_names: names,
                device_names: device_name_refs,
                display_name: display_name.as_deref(),
            });
            // 名字里不能出现固件号。
            //
            // 一些账号的设备列表**一个名字字段都没有**（反馈库里报告
            // `404560ac` 就是这样，它的 `nameFieldObjects` 是 0），而
            // `product_names` 里掘了 `hardwareVersion`——那是个形如 `0.135.23.0`
            // 的东西。于是侧栏里就出现了名为「0.91.20.5」的数据来源，
            // 点进去没有任何东西（Reddit u/Andrew-Scoggins 2026-09-02，
            // 反馈库那位 Bip 6 用户的原话是「Says 0.135.23.0」）。
            //
            // 判据用的是 `looks_like_firmware_version`——写入侧的 `device_identities`
            // 早就拿它拦过一道（`storage/mod.rs`），这条从云端报文直接到
            // 界面的路径是漏掉的那一条。只拦「拿它当名字」：它继续留在
            // `product_names` / `model_codes` 里参与目录匹配，那里匹不上就是
            // 匹不上，不会造出一个假型号。
            //
            // 拦下之后名字是 `None`，前端（`useDevices.ts`）会如实显示
            // 「未识别设备 / Unidentified device」并给出手动指认入口。
            let named = |value: &String| !looks_like_firmware_version(value);
            let display_name = display_name.filter(|value| named(value));
            let mut profile = DeviceProfile {
                name: display_name
                    .clone()
                    .or_else(|| product_names.iter().find(|v| named(v)).cloned()),
                display_name,
                canonical_name: None,
                catalog_id: None,
                kind: None,
                image_key: None,
                match_status: DeviceMatchStatus::Unknown,
                has_local_data: false,
                last_data_at: None,
                firmware: first_string(
                    &extra,
                    &[
                        "productVersion",
                        "firmwareVersion",
                        "hardwareVersion",
                        "fwVersion",
                    ],
                ),
                serial: first_string(&extra, &["sn", "serial", "serialNumber"]),
                device_id,
                timezone: first_string(&extra, &["bind_timezone", "timezone", "tz"]).filter(
                    |value| value.contains('/') || value.chars().any(|ch| ch.is_ascii_alphabetic()),
                ),
            };
            if let Some(matched) = matched {
                apply_catalog_match(&mut profile, matched.entry, matched.status);
            }
            profile
        })
        .filter(|profile| {
            profile.device_id.is_some() || profile.serial.is_some() || profile.name.is_some()
        })
        .fold(Vec::new(), |mut kept: Vec<DeviceProfile>, profile| {
            // 同一台表不该在侧栏里出现两遍。
            //
            // 云端的列表会把同一台设备的多次绑定各给一行（换手机、解绑重绑）。
            // 以前名字各不相同时还看不出来，现在认不出来的都叫「未识别设备」，
            // 重复就很刺眼。只合并**标识完全相同**的：两台真的不同的表哪怕同名
            // 也不能并成一行，那会让用户少一台设备。
            let duplicate = kept.iter().any(|existing| {
                existing.device_id == profile.device_id
                    && existing.serial == profile.serial
                    && (existing.device_id.is_some() || existing.serial.is_some())
            });
            if !duplicate {
                kept.push(profile);
            }
            kept
        })
}

pub(super) fn merge_device_metadata(target: &mut Map<String, Value>, value: &Value, depth: usize) {
    if depth > 6 {
        return;
    }
    let decoded;
    let value = if let Some(raw) = value.as_str() {
        decoded = serde_json::from_str::<Value>(raw).ok();
        decoded.as_ref().unwrap_or(value)
    } else {
        value
    };
    let Some(object) = value.as_object() else {
        return;
    };
    for (key, child) in object {
        let entry = target.entry(key.clone()).or_insert(Value::Null);
        if entry.is_null() || entry.as_str().is_some_and(|text| text.trim().is_empty()) {
            *entry = child.clone();
        }
        if matches!(
            key.as_str(),
            "additionalInfo" | "bind_device" | "bindDevice" | "deviceInfo" | "device_info"
        ) {
            merge_device_metadata(target, child, depth + 1);
        }
    }
}

pub(super) fn flattened_device_metadata(item: &Value) -> Value {
    let mut merged = Map::new();
    merge_device_metadata(&mut merged, item, 0);
    Value::Object(merged)
}

pub(super) fn device_items(value: &serde_json::Value) -> Vec<serde_json::Value> {
    if let Some(array) = value.as_array() {
        return array.clone();
    }
    if let Some(object) = value.as_object() {
        for key in ["items", "devices", "list", "results", "data"] {
            if let Some(child) = object.get(key) {
                let items = device_items(child);
                if !items.is_empty() {
                    return items;
                }
            }
        }
    }
    vec![value.clone()]
}

pub(super) fn string_values(value: &serde_json::Value, keys: &[&str]) -> Vec<String> {
    let Some(object) = value.as_object() else {
        return Vec::new();
    };
    let mut values = Vec::new();
    for key in keys {
        match object.get(*key) {
            Some(serde_json::Value::String(text)) if !text.trim().is_empty() => {
                values.push(text.trim().to_string());
            }
            Some(serde_json::Value::Number(number)) => values.push(number.to_string()),
            Some(serde_json::Value::Array(items)) => {
                values.extend(items.iter().filter_map(|item| match item {
                    serde_json::Value::String(text) if !text.trim().is_empty() => {
                        Some(text.trim().to_string())
                    }
                    serde_json::Value::Number(number) => Some(number.to_string()),
                    _ => None,
                }));
            }
            _ => {}
        }
    }
    values.sort();
    values.dedup();
    values
}

pub(super) fn merged_string_values(
    primary: &serde_json::Value,
    secondary: &serde_json::Value,
    keys: &[&str],
) -> Vec<String> {
    let mut values = string_values(primary, keys);
    values.extend(string_values(secondary, keys));
    values.sort();
    values.dedup();
    values
}

pub(super) fn first_string(value: &serde_json::Value, keys: &[&str]) -> Option<String> {
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
