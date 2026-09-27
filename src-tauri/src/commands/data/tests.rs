use super::*;

use crate::models::{DeviceMatchStatus, DeviceProfile};
use serde_json::json;
use std::fs;
use std::time::{SystemTime, UNIX_EPOCH};

#[test]
fn nested_identity_and_helio_name_survive_empty_outer_metadata() {
    let profiles = parse_device_profiles(&json!({"devices": [{
        "deviceSource": 62, "deviceType": 0,
        "deviceId": null, "productName": "  ",
        "additionalInfo": {"deviceId": "REAL-CORE-ID", "productName": "Helio Core"}
    }]}));
    assert_eq!(profiles.len(), 1);
    assert_eq!(profiles[0].device_id.as_deref(), Some("REAL-CORE-ID"));
    assert_eq!(
        profiles[0].catalog_id.as_deref(),
        Some("amazfit-helio-core")
    );
}

#[test]
fn source_number_does_not_hide_nested_identity_or_merge_two_devices() {
    let profiles = parse_device_profiles(&json!({"devices": [
        {"deviceSource": 10289411, "additionalInfo": {"deviceId": "STRAP-ONE"}},
        {"deviceSource": 10289411, "additionalInfo": {"deviceId": "STRAP-TWO"}}
    ]}));
    assert_eq!(profiles.len(), 2);
    assert_eq!(profiles[0].device_id.as_deref(), Some("STRAP-ONE"));
    assert_eq!(profiles[1].device_id.as_deref(), Some("STRAP-TWO"));
}

#[test]
fn parse_device_profile_reads_additional_info() {
    let value = json!({
        "items": [{
            "deviceId": "A194",
            "displayName": "Amazfit GTR 4",
            "additionalInfo": {
                "productVersion": "3.9.1.2",
                "sn": "2143123A1B23456"
            }
        }]
    });
    let profile = parse_device_profile(&value);
    assert_eq!(profile.name.as_deref(), Some("Amazfit GTR 4"));
    assert_eq!(profile.firmware.as_deref(), Some("3.9.1.2"));
    assert_eq!(profile.serial.as_deref(), Some("2143123A1B23456"));
    assert_eq!(profile.device_id.as_deref(), Some("A194"));
}

#[test]
fn diagnostic_device_report_contains_shapes_but_never_payload_values() {
    let token = "SECRET-APP-TOKEN-DO-NOT-LEAK";
    let serial = "SERIAL-PRIVATE-998877";
    let account = "ACCOUNT-PRIVATE-112233";
    let payload = json!({
        "accountId": account,
        "appToken": token,
        "items": [{
            "deviceId": "MAC-PRIVATE-AA-BB-CC",
            "displayName": "My private nickname",
            "additionalInfo": serde_json::to_string(&json!({
                "productName": "Amazfit Balance 2",
                "productVersion": "6.2.208.7",
                "sn": serial,
                "gps": { "latitude": 31.2345, "longitude": 121.4567 },
                "heartRate": 188,
                "futureSecret": "UNKNOWN-FIELD-VALUE"
            })).unwrap()
        }]
    });
    let report = build_device_diagnostic(&payload);
    let encoded = serde_json::to_string(&report).unwrap();
    for secret in [
        token,
        serial,
        account,
        "MAC-PRIVATE-AA-BB-CC",
        "My private nickname",
        "31.2345",
        "121.4567",
        "188",
        "UNKNOWN-FIELD-VALUE",
    ] {
        assert!(!encoded.contains(secret), "diagnostic leaked {secret}");
    }
    assert!(encoded.contains("additionalInfo"));
    assert!(encoded.contains("productName"));
    assert!(encoded.contains("Amazfit Balance 2"));
    assert!(encoded.contains("6.2.208.7"));
    assert_eq!(report.id_alias_objects, 1);
    assert_eq!(report.serial_alias_objects, 1);
}

/// 真实反馈（issue #4）里的设备响应形状：整个对象没有任何产品名字段，
/// 只有 `deviceSource` / `deviceType` / `productId` 这类数字。
///
/// 这个用例钉住两件事：目录里没有对应编号时必须诚实地判为未识别（不能
/// 靠猜一个型号来「修好」），以及诊断报告必须带上型号类数字，否则内置
/// 目录永远补不全，这台表对每个用户都会一直是未识别。
///
/// `10813699` 是 2026-09-13 仍因真实分歧没收进目录的编号；`7930112`
/// 已经裁决为 GTR 4，不能再当「未知编号」用。
#[test]
fn a_device_response_with_no_product_name_stays_unknown_and_reports_model_numbers() {
    let payload = json!({
        "items": [{
            "deviceId": "0123456789abcdef",
            "deviceSource": 10813699,
            "deviceType": 5,
            "macAddress": "AA:BB:CC:DD:EE:FF",
            "sn": "SERIAL-PRIVATE-998877",
            "firmwareVersion": "6.2.208.7",
            "additionalInfo": serde_json::to_string(&json!({
                "productId": "10813699",
                "productVersion": "6.2.208.7",
                "hardwareVersion": "1.0",
                "btmac": "AA:BB:CC:DD:EE:FF",
                "sn": "SERIAL-PRIVATE-998877"
            })).unwrap()
        }]
    });

    let profile = parse_device_profile(&payload);
    assert_eq!(
        profile.match_status,
        DeviceMatchStatus::Unknown,
        "目录里没有这些编号时不许猜一个型号出来"
    );
    assert!(profile.canonical_name.is_none());
    assert_eq!(profile.firmware.as_deref(), Some("6.2.208.7"));

    let report = build_device_diagnostic(&payload);
    assert_eq!(report.name_field_objects, 0, "这份响应里确实没有名字字段");
    assert_eq!(report.unknown_device_count, 1);
    assert!(
        report
            .model_identifier_hints
            .contains(&"deviceSource:10813699".to_string()),
        "缺了型号编号，内置目录就永远补不上: {:?}",
        report.model_identifier_hints
    );
    assert!(report
        .model_identifier_hints
        .contains(&"deviceType:5".to_string()));

    // 型号线索只能是「哪一款」，不能夹带「哪一台」。
    let encoded = serde_json::to_string(&report.model_identifier_hints).unwrap();
    for private in [
        "SERIAL-PRIVATE-998877",
        "AA:BB:CC:DD:EE:FF",
        "0123456789abcdef",
    ] {
        assert!(!encoded.contains(private), "型号线索泄露了 {private}");
    }
}

/// 反馈汇总出来的 deviceSource 一旦进了目录，同款设备就自动认得出来。
///
/// 这是上面那条用例的另一半：未进目录的编号保持未识别；`8716547` 有七份
/// 用户指认，所以现在直接就是 T-Rex 3——用户不必再手动指认一次。整条回路
/// （用户指认 → 反馈库 → 目录 → 自动识别）就是靠这个闭上的。
#[test]
fn a_contributed_device_source_number_is_recognised_without_any_product_name() {
    let payload = json!({
        "items": [{
            "deviceId": "0123456789abcdef",
            "deviceSource": 8716547,
            "deviceType": 0,
            "macAddress": "AA:BB:CC:DD:EE:FF",
            "sn": "SERIAL-PRIVATE-998877",
            "firmwareVersion": "6.2.208.7"
        }]
    });

    let profile = parse_device_profile(&payload);
    assert_eq!(profile.catalog_id.as_deref(), Some("amazfit-t-rex-3"));
    assert_eq!(profile.match_status, DeviceMatchStatus::Exact);
}

/// `deviceType` 绝不能用来查目录。
///
/// 反馈库里 `deviceType:0` 一个值横跨二十款表。它和 `deviceSource` 长得像，
/// 就挨着放在同一个 JSON 对象里，很容易被顺手一起喂进匹配器——那样每一台
/// 设备都会被认成同一款。
#[test]
fn device_type_is_never_used_to_look_up_the_catalog() {
    let extra = json!({});
    let item = json!({ "deviceType": 8716547, "deviceSource": 0 });
    assert!(
        device_source_numbers(&item, &extra).is_empty(),
        "deviceType 的值不该被当成 deviceSource"
    );

    let item = json!({ "deviceSource": 8716547, "deviceType": 0 });
    assert_eq!(device_source_numbers(&item, &extra), vec![8716547]);
}

/// `productId` / `hardwareVersion` 有时就是内部代号，归一化之后和目录别名
/// 完全相同。把它们喂进匹配器不是在猜，而是让本来就存在的等价关系生效。
#[test]
fn internal_codename_fields_can_still_match_a_catalog_alias() {
    let value = json!({
        "items": [{
            "deviceId": "0123456789abcdef",
            "additionalInfo": {
                "productId": "amazfit_t-rex_3",
                "productVersion": "1.2.3.4"
            }
        }]
    });
    let profile = parse_device_profile(&value);
    assert_eq!(
        profile.canonical_name.as_deref(),
        Some("Amazfit T-Rex 3 48mm")
    );
    assert_eq!(profile.match_status, DeviceMatchStatus::Alias);
}

#[test]
fn parse_device_profiles_reads_model_names_from_additional_info() {
    let value = json!({
        "items": [{
            "deviceId": "device-pro",
            "displayName": "我的 Pro 表",
            "additionalInfo": {
                "productName": "Amazfit T-Rex 3 Pro",
                "deviceName": "T-Rex 3 Pro 48mm",
                "model": "T-Rex 3 Pro"
            }
        }]
    });
    let profile = parse_device_profile(&value);
    assert_eq!(profile.name.as_deref(), Some("我的 Pro 表"));
    assert_eq!(
        profile.canonical_name.as_deref(),
        Some("Amazfit T-Rex 3 Pro 48mm/44mm")
    );
    assert_eq!(profile.match_status, DeviceMatchStatus::Alias);
}

#[test]
fn parse_device_profiles_reads_double_nested_bind_metadata() {
    let nested = serde_json::to_string(&json!({
        "bindDevice": serde_json::to_string(&json!({
            "productName": "Amazfit Balance 2",
            "productVersion": "6.2.208.7"
        })).unwrap()
    }))
    .unwrap();
    let value = json!({
        "items": [{
            "deviceId": "private-device-id",
            "displayName": "我的手表",
            "additionalInfo": nested
        }]
    });
    let profile = parse_device_profile(&value);
    assert_eq!(profile.catalog_id.as_deref(), Some("amazfit-balance-2"));
    assert_eq!(profile.canonical_name.as_deref(), Some("Amazfit Balance 2"));
    assert_eq!(profile.firmware.as_deref(), Some("6.2.208.7"));
}

/// 固件号不能当设备名。
///
/// 字段结构抄自反馈库报告 `404560ac`（Bip 6，v1.1.3）：它的
/// `nameFieldObjects` 是 **0**——那份设备列表里根本没有
/// `displayName` / `deviceName` / `nickname` / `name`，能当名字用的只剩
/// `additionalInfo.hardwareVersion`。这一幕的后果是两份独立报告：
/// 那位 Bip 6 用户的「Says 0.135.23.0」，和 Reddit u/Andrew-Scoggins
/// 侧栏里那三个叫 `0.91.20.5` / `0.91.17.5` 的幽灵数据来源。
#[test]
fn a_firmware_version_never_becomes_the_device_name() {
    let value = json!({
        "items": [{
            "deviceId": "private-device-id",
            "deviceSource": 10158337,
            "deviceType": 0,
            "firmwareVersion": "0.135.23.0",
            "additionalInfo": {
                "sn": "SN-BIP6",
                "hardwareVersion": "0.135.23.0",
                "productId": "0.135.23.0",
                "productVersion": "0.135.23.0"
            }
        }]
    });
    let profiles = parse_device_profiles(&value);
    assert_eq!(profiles.len(), 1);
    let profile = &profiles[0];
    // 这一台的 deviceSource 在目录里，所以名字是真型号。
    // 重点是：无论如何都不会是那串版本号。
    assert_eq!(profile.catalog_id.as_deref(), Some("amazfit-bip-6"));
    assert_eq!(profile.canonical_name.as_deref(), Some("Amazfit Bip 6"));
    // 报文里没有名字字段，`name` 就空着；显示名由目录补上。
    // 旧行为里这两个字段拿到的都是 `"0.135.23.0"`。
    assert_eq!(profile.name, None);
    assert_eq!(profile.display_name.as_deref(), Some("Amazfit Bip 6"));
    // 固件号本身仍然要当固件号显示，目录匹配也仍然拿得到
    // deviceSource——拦的只是「拿它当名字」这一件事。
    assert_eq!(profile.firmware.as_deref(), Some("0.135.23.0"));
}

/// 目录认不出来的那一半：名字宁可空着，也不拿版本号凑数。
///
/// 前端（`useDevices.ts`）对 `name == None` 会如实显示「未识别设备」
/// 并给出手动指认入口；显示成「0.91.20.5」则既不是型号、也没有出口。
#[test]
fn an_unmatched_device_shows_no_name_rather_than_a_firmware_string() {
    let value = json!({
        "items": [{
            "deviceId": "MAC-UNKNOWN",
            "deviceSource": 999_999_999_i64,
            "additionalInfo": { "sn": "SN-UNKNOWN", "hardwareVersion": "0.91.20.5" }
        }]
    });
    let profiles = parse_device_profiles(&value);
    assert_eq!(profiles.len(), 1);
    assert_eq!(profiles[0].name, None);
    assert_eq!(profiles[0].display_name, None);
    assert_eq!(profiles[0].firmware.as_deref(), Some("0.91.20.5"));
}

/// 同一台表的多次绑定合成一行，两台真的不同的表不能合。
#[test]
fn repeated_bindings_of_one_watch_collapse_but_distinct_watches_do_not() {
    let value = json!({
        "items": [
            { "deviceId": "MAC-ONE", "additionalInfo": { "sn": "SN-ONE", "hardwareVersion": "0.91.20.5" } },
            { "deviceId": "MAC-ONE", "additionalInfo": { "sn": "SN-ONE", "hardwareVersion": "0.91.20.5" } },
            { "deviceId": "MAC-TWO", "additionalInfo": { "sn": "SN-TWO", "hardwareVersion": "0.91.20.5" } }
        ]
    });
    let profiles = parse_device_profiles(&value);
    assert_eq!(profiles.len(), 2);
    assert_eq!(profiles[0].device_id.as_deref(), Some("MAC-ONE"));
    assert_eq!(profiles[1].device_id.as_deref(), Some("MAC-TWO"));
    assert!(profiles.iter().all(|profile| profile.name.is_none()));
}

#[test]
fn parse_device_profiles_keeps_every_device() {
    let value = json!({
        "items": [
            {
                "deviceId": "MAC-ONE",
                "displayName": "Watch One",
                "additionalInfo": { "sn": "SN-ONE", "productVersion": "1.0.0" }
            },
            {
                "deviceId": "MAC-TWO",
                "displayName": "Watch Two",
                "additionalInfo": { "sn": "SN-TWO", "productVersion": "2.0.0" }
            }
        ]
    });
    let profiles = parse_device_profiles(&value);
    assert_eq!(profiles.len(), 2);
    assert_eq!(profiles[0].serial.as_deref(), Some("SN-ONE"));
    assert_eq!(profiles[1].device_id.as_deref(), Some("MAC-TWO"));
    assert_ne!(profiles[0].device_id, profiles[1].device_id);
}

#[test]
fn catalog_matching_preserves_nickname_and_covers_real_devices() {
    let value = json!({
        "items": [
            {
                "deviceId": "A2323",
                "displayName": "我的户外表",
                "productName": "Amazfit T-Rex 3"
            },
            {
                "deviceId": "strap-1",
                "displayName": "训练带",
                "productName": "Helio Strap"
            },
            {
                "deviceId": "A2321",
                "displayName": "夜间戒指",
                "productName": "Amazfit Helio Ring"
            },
            {
                "deviceId": "unknown-1",
                "displayName": "未知设备"
            }
        ]
    });
    let profiles = parse_device_profiles(&value);
    assert_eq!(profiles.len(), 4);
    assert_eq!(profiles[0].name.as_deref(), Some("我的户外表"));
    assert_eq!(
        profiles[0].canonical_name.as_deref(),
        Some("Amazfit T-Rex 3 48mm")
    );
    assert_eq!(profiles[0].catalog_id.as_deref(), Some("amazfit-t-rex-3"));
    assert_eq!(profiles[0].match_status, DeviceMatchStatus::Exact);
    assert_eq!(
        profiles[1].catalog_id.as_deref(),
        Some("amazfit-helio-strap")
    );
    assert_eq!(profiles[1].match_status, DeviceMatchStatus::Alias);
    assert_eq!(
        profiles[2].catalog_id.as_deref(),
        Some("amazfit-helio-ring")
    );
    assert_eq!(profiles[2].match_status, DeviceMatchStatus::Exact);
    assert_eq!(profiles[3].match_status, DeviceMatchStatus::Unknown);
    assert!(profiles[3].catalog_id.is_none());
}

#[test]
fn indexed_identity_keeps_nickname_and_recovers_cached_catalog_fields() {
    let indexed = super::DeviceProfile {
        name: Some("我的户外表".into()),
        device_id: Some("A2323".into()),
        match_status: DeviceMatchStatus::Unknown,
        ..Default::default()
    };
    let cached = super::DeviceProfile {
        name: Some("我的户外表".into()),
        display_name: Some("我的户外表".into()),
        canonical_name: Some("Amazfit T-Rex 3 48mm".into()),
        catalog_id: Some("amazfit-t-rex-3".into()),
        kind: Some("watch".into()),
        image_key: Some("amazfit-t-rex-3".into()),
        match_status: DeviceMatchStatus::Exact,
        device_id: Some("A2323".into()),
        ..Default::default()
    };
    let merged = merge_cached_device_profile(indexed, cached);
    assert_eq!(merged.name.as_deref(), Some("我的户外表"));
    assert_eq!(
        merged.canonical_name.as_deref(),
        Some("Amazfit T-Rex 3 48mm")
    );
    assert_eq!(merged.catalog_id.as_deref(), Some("amazfit-t-rex-3"));
    assert_eq!(merged.match_status, DeviceMatchStatus::Exact);
}

#[test]
fn legacy_devices_json_is_read_with_new_defaults() {
    let suffix = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let dir = std::env::temp_dir().join(format!("zeppbridge-device-cache-{suffix}"));
    fs::create_dir_all(&dir).unwrap();
    fs::write(
        dir.join("devices.json"),
        r#"[{"name":"Legacy T-Rex","device_id":"SN-LEGACY"}]"#,
    )
    .unwrap();
    let cache = read_device_profile_cache(&dir);
    assert_eq!(cache.profiles.len(), 1);
    assert_eq!(cache.profiles[0].name.as_deref(), Some("Legacy T-Rex"));
    assert_eq!(cache.profiles[0].match_status, DeviceMatchStatus::Unknown);
    assert!(cache.cached_at.is_some());
    let _ = fs::remove_dir_all(dir);
}

#[test]
fn fused_and_unknown_profiles_never_claim_a_catalog_device() {
    let fused = super::DeviceProfile {
        name: Some("融合来源".to_string()),
        match_status: DeviceMatchStatus::Unknown,
        ..Default::default()
    };
    assert!(fused.catalog_id.is_none());
    let unknown = unknown_device_profile("mystery");
    assert_eq!(unknown.match_status, DeviceMatchStatus::Unknown);
    assert!(unknown.catalog_id.is_none());
}

#[test]
fn ai_handoff_redacts_nested_identifiers_and_precise_route_by_default() {
    let source = json!({
        "user": { "id": "user-secret", "name": "private" },
        "token": "token-secret",
        "user_identifier": "user-identifier-secret",
        "device_uuid": "device-uuid-secret",
        "email": "private@example.com",
        "uuid": "generic-uuid-secret",
        "lat_e7": 312000000,
        "lng_e7": 1215000000,
        "file_path": "C:\\Users\\private\\secret.json",
        "nested": [{
            "device_id": "device-secret",
            "serial_number": "serial-secret",
            "record_id": "record-secret",
            "workout_id": "workout-secret",
            "sleep_id": "sleep-secret",
            "gps_route": [{ "lat_e7": 312000000, "lng_e7": 1215000000 }],
            "route": [{ "latitude": 31.2, "longitude": 121.5 }],
            "value": 42
        }]
    });
    let (redacted, redactions) = redact_ai_export(source.clone(), false).unwrap();
    let value: serde_json::Value = serde_json::from_str(&redacted).unwrap();
    assert!(value.get("user").is_none());
    assert!(value.get("token").is_none());
    assert!(value.get("user_identifier").is_none());
    assert!(value.get("device_uuid").is_none());
    assert!(value.get("email").is_none());
    assert!(value.get("uuid").is_none());
    assert!(value.get("lat_e7").is_none());
    assert!(value.get("lng_e7").is_none());
    assert!(value.get("file_path").is_none());
    assert!(value["nested"][0].get("device_id").is_none());
    assert!(value["nested"][0].get("serial_number").is_none());
    assert!(value["nested"][0].get("record_id").is_none());
    assert!(value["nested"][0].get("workout_id").is_none());
    assert!(value["nested"][0].get("sleep_id").is_none());
    assert!(value["nested"][0].get("gps_route").is_none());
    assert!(value["nested"][0].get("route").is_none());
    assert!(!value.to_string().contains("secret"));
    assert!(redactions
        .iter()
        .any(|item| item == "authentication_fields"));
    assert!(redactions.iter().any(|item| item == "identity_fields"));
    assert!(redactions.iter().any(|item| item == "precise_route"));
    assert!(redactions.iter().any(|item| item == "local_paths"));
    assert!(!redacted.contains("C:\\Users\\private"));
}

#[test]
fn ai_handoff_precise_route_requires_explicit_opt_in_but_keeps_identifiers_removed() {
    let source = json!({
        "device_id": "device-secret",
        "route": [{ "latitude": 31.2, "longitude": 121.5 }],
        "coordinates": { "lat": 31.2, "lon": 121.5 }
    });
    let (redacted, redactions) = redact_ai_export(source.clone(), true).unwrap();
    let value: serde_json::Value = serde_json::from_str(&redacted).unwrap();
    assert!(value.get("device_id").is_none());
    assert!(value.get("route").is_some());
    assert!(value.get("coordinates").is_some());
    assert!(!redactions.iter().any(|item| item == "precise_route"));
    assert!(value.to_string().contains("31.2"));
}

#[test]
fn ai_handoff_clipboard_sanitizes_local_paths_without_touching_urls() {
    let source = json!({
        "note": "C:\\Users\\private\\data.json /tmp/private/data.json https://example.com/path"
    });
    let (redacted, redactions) = redact_ai_export(source.clone(), false).unwrap();
    assert!(!redacted.contains("C:\\Users\\private"));
    assert!(!redacted.contains("/tmp/private"));
    assert!(redacted.contains("https://example.com/path"));
    assert!(redactions.iter().any(|item| item == "local_paths"));
}

#[test]
fn ai_handoff_inline_limit_includes_exact_two_mib_boundary() {
    assert_eq!(
        ai_handoff_mode_for_bytes(AI_HANDOFF_INLINE_LIMIT_BYTES),
        "inline"
    );
    assert_eq!(
        ai_handoff_mode_for_bytes(AI_HANDOFF_INLINE_LIMIT_BYTES + 1),
        "attachment"
    );
}

#[test]
fn ai_provider_opener_allowlist_has_exactly_seven_https_destinations() {
    let capability: serde_json::Value =
        serde_json::from_str(include_str!("../../../capabilities/default.json")).unwrap();
    let permissions = capability["permissions"].as_array().unwrap();
    let opener = permissions
        .iter()
        .find(|permission| permission["identifier"] == "opener:allow-open-url")
        .expect("opener allowlist");
    let urls = opener["allow"]
        .as_array()
        .unwrap()
        .iter()
        .map(|entry| entry["url"].as_str().unwrap())
        .collect::<Vec<_>>();
    assert_eq!(
        urls,
        vec![
            "https://chatgpt.com/",
            "https://claude.ai/",
            "https://gemini.google.com/app",
            "https://www.kimi.com/",
            "https://www.doubao.com/chat/",
            "https://chat.deepseek.com/",
            "https://grok.com/",
        ]
    );
    assert!(urls.iter().all(|url| url.starts_with("https://")));
}

#[test]
fn a_user_assignment_overrides_even_a_confident_auto_match() {
    // 这条用例来自一个真实的坏法：指认逻辑被包在
    // `if match_status == Unknown` 里，于是一台已经被目录别名匹配上的表，
    // 用户点了「不对，我来指认」之后型号根本不变——指认存进了库，界面上
    // 却永远是那个错的。自动识别会错，用户的话必须能盖过它。
    let target = crate::device_catalog::catalog_entries()
        .iter()
        .find(|entry| entry.image_key.is_some())
        .expect("随包目录里至少要有一款带图的设备");
    let target_id = target.catalog_id.clone();
    let target_name = target.canonical_name.clone();

    let mut profile = DeviceProfile {
        canonical_name: Some("被自动认错的型号".into()),
        match_status: DeviceMatchStatus::Alias,
        ..Default::default()
    };
    assert!(apply_user_assignment(&mut profile, &target_id));
    assert_eq!(
        profile.canonical_name.as_deref(),
        Some(target_name.as_str())
    );
    // 来源要如实标成「用户指认」，不能伪装成识别结果。
    assert_eq!(profile.match_status, DeviceMatchStatus::UserAssigned);

    // 目录里没有的 id 什么都不改，而不是把设备清空成未知。
    let mut untouched = DeviceProfile {
        canonical_name: Some("原样保留".into()),
        match_status: DeviceMatchStatus::Exact,
        ..Default::default()
    };
    assert!(!apply_user_assignment(&mut untouched, "no-such-catalog-id"));
    assert_eq!(untouched.canonical_name.as_deref(), Some("原样保留"));
    assert_eq!(untouched.match_status, DeviceMatchStatus::Exact);
}

#[test]
fn a_report_note_keeps_the_useful_sentence() {
    // 用户写这句话的目的就是让收报告的人知道这是哪一款表，
    // 脱敏不能把这句话本身也吃掉。
    let note = sanitize_diagnostic_note("我的表是 Balance 2，固件 3.5.1，但显示未识别").unwrap();
    assert!(note.contains("Balance 2"));
    assert!(note.contains("未识别"));
}

#[test]
fn a_report_note_drops_pasted_credentials_and_paths() {
    let note = sanitize_diagnostic_note(
            r"设备没识别 token=a1b2c3d4e5f6a7b8c9d0e1f2 邮箱 someone@example.com 日志在 C:\Users\me\zepp.db",
        )
        .unwrap();
    assert!(note.contains("设备没识别"));
    assert!(
        !note.contains("a1b2c3d4e5f6a7b8c9d0e1f2"),
        "长串标识必须被抹掉：{note}"
    );
    assert!(
        !note.contains("someone@example.com"),
        "邮箱必须被抹掉：{note}"
    );
    assert!(!note.contains("Users"), "本机路径必须被抹掉：{note}");
}

#[test]
fn a_report_note_is_capped_and_can_be_absent() {
    let long = "设".repeat(DIAGNOSTIC_NOTE_MAX_CHARS + 200);
    let note = sanitize_diagnostic_note(&long).unwrap();
    assert_eq!(note.chars().count(), DIAGNOSTIC_NOTE_MAX_CHARS);
    // 空白备注不该变成一个空字符串发出去。
    assert!(sanitize_diagnostic_note(
        "   
  "
    )
    .is_none());
}
