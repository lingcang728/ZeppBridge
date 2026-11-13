use super::*;
use crate::models::{StrengthSetRow, StrengthWorkoutDetail};
use serde_json::json;

fn action(code: i32, name: &str, main: &[i32], sub: &[i32]) -> Value {
    json!({
        "id": code + 1,
        "actionType": code,
        "actionName": name,
        "selfWeightType": 0,
        "mainPositions": main,
        "subPositions": sub,
    })
}

#[test]
fn parses_bare_and_wrapped_catalogs_and_groups_positions_honestly() {
    let items = vec![
        action(14, "Lateral Raises", &[3, 4, 38, 39], &[34, 35]),
        // 主练里有认不出的 48，只留能归类的那部分。
        action(1262, "Triceps Dip", &[1, 2, 48], &[22, 23, 1]),
        action(0, "Choose a workout", &[], &[]),
        // 重复编号只收第一条；没名字的跳过。
        action(14, "Duplicate", &[5], &[]),
        json!({"actionType": 99, "actionName": ""}),
    ];
    for payload in [
        Value::Array(items.clone()),
        json!({"code": 1, "data": items.clone()}),
        json!({"data": {"list": items}}),
    ] {
        let parsed = parse_strength_catalog(&payload);
        assert_eq!(
            parsed.iter().map(|a| a.action_code).collect::<Vec<_>>(),
            vec![0, 14, 1262]
        );
        let raise = &parsed[1];
        assert_eq!(raise.name, "Lateral Raises");
        assert_eq!(raise.primary_groups, vec!["shoulders"]);
        assert_eq!(raise.secondary_groups, vec!["back"]);
        let dip = &parsed[2];
        assert_eq!(dip.primary_groups, vec!["core"]);
        // 辅助里与主练重复的 core 去掉。
        assert_eq!(dip.secondary_groups, vec!["triceps"]);
        assert!(parsed[0].primary_groups.is_empty());
    }
}

#[test]
fn locale_maps_to_zepp_lang_and_junk_is_rejected_as_a_filename() {
    assert_eq!(zepp_lang_for_locale("zh"), "zh_CN");
    assert_eq!(zepp_lang_for_locale("zh-TW"), "zh_TW");
    assert_eq!(zepp_lang_for_locale("pt-BR"), "pt_BR");
    assert_eq!(zepp_lang_for_locale("pt-PT"), "pt_PT");
    assert_eq!(zepp_lang_for_locale("hi-IN"), "hi_IN");
    assert_eq!(zepp_lang_for_locale("xx"), "en_US");
    assert!(is_valid_zepp_lang("en_US"));
    for bad in ["../x", "en-US", "EN_us", "en_US.json", ""] {
        assert!(!is_valid_zepp_lang(bad), "{bad}");
        assert!(catalog_cache_path(Path::new("."), bad).is_none());
    }
}

fn cache(lang: &str, count: i32, fetched_at: &str) -> StrengthCatalogCache {
    let items: Vec<Value> = (0..count)
        .map(|i| action(1000 + i, &format!("A{i}"), &[10, 11], &[]))
        .collect();
    StrengthCatalogCache {
        version: 1,
        lang: lang.into(),
        fetched_at: fetched_at.into(),
        actions: parse_strength_catalog(&Value::Array(items)),
    }
}

#[test]
fn old_subset_and_month_old_caches_are_stale() {
    let now = chrono::DateTime::parse_from_rfc3339("2026-11-13T00:00:00Z")
        .unwrap()
        .with_timezone(&chrono::Utc);
    assert!(catalog_cache_is_stale(None, now));
    // 没带 cv 时 Zepp 只回 ~125 条老子集：不算完整，一天后重拉（不是一个月）。
    assert!(!catalog_cache_is_stale(
        Some(&cache("en_US", 125, "2026-11-12T12:00:00Z")),
        now
    ));
    assert!(catalog_cache_is_stale(
        Some(&cache("en_US", 125, "2026-11-11T00:00:00Z")),
        now
    ));
    assert!(!catalog_cache_is_stale(
        Some(&cache("en_US", 1123, "2026-11-12T00:00:00Z")),
        now
    ));
    assert!(catalog_cache_is_stale(
        Some(&cache("en_US", 1123, "2026-10-01T00:00:00Z")),
        now
    ));
}

#[test]
fn cache_round_trips_and_prefers_the_export_language() {
    let dir = std::env::temp_dir().join(format!(
        "zb-strength-catalog-{}-{}",
        std::process::id(),
        crate::unique_suffix()
    ));
    std::fs::create_dir_all(&dir).unwrap();
    let pt = cache("pt_BR", 300, "2026-11-12T00:00:00Z");
    write_catalog_cache(&dir, &pt).unwrap();
    assert_eq!(read_catalog_cache(&dir, "pt_BR"), Some(pt.clone()));
    assert_eq!(
        read_any_catalog_cache(&dir).map(|c| c.lang),
        Some("pt_BR".into())
    );
    let en = cache("en_US", 300, "2026-11-12T00:00:00Z");
    write_catalog_cache(&dir, &en).unwrap();
    assert_eq!(
        read_any_catalog_cache(&dir).map(|c| c.lang),
        Some("en_US".into())
    );
    let _ = std::fs::remove_dir_all(&dir);
}

fn set(code: i32, key: Option<&str>, group: Option<&str>) -> StrengthSetRow {
    StrengthSetRow {
        set_index: 1,
        action_code: code,
        exercise_key: key.map(str::to_string),
        muscle_group: group.map(str::to_string),
        reps: 12,
        weight_value: None,
        weight_unit: "kg".into(),
        weight_kg: None,
        duration_ms: None,
        avg_hr: None,
        calories_kcal: None,
        exercise_name: None,
        secondary_muscle_groups: Vec::new(),
    }
}

#[test]
fn enrichment_fills_new_codes_keeps_reviewed_groups_and_never_invents() {
    let catalog = parse_strength_catalog(&json!([
        action(14, "Lateral Raises", &[3, 4, 38, 39], &[34, 35]),
        action(1107, "Assisted Back Extension", &[34, 35, 36, 37], &[]),
    ]));
    let make = |lang: &str| StrengthCatalogCache {
        version: 1,
        lang: lang.into(),
        fetched_at: "2026-11-12T00:00:00Z".into(),
        actions: catalog.clone(),
    };
    let detail = || StrengthWorkoutDetail {
        total_sets: 3,
        total_reps: 36,
        total_volume_kg: None,
        rest_seconds: None,
        sets: vec![
            set(14, Some("lateral_raises"), Some("shoulders")),
            set(1107, None, None),
            set(4242, None, None),
        ],
        exercise_groups: Vec::new(),
    };

    let mut en = detail();
    enrich_strength_detail(&mut en, Some(&make("en_US")));
    assert_eq!(en.sets[0].muscle_group.as_deref(), Some("shoulders"));
    assert_eq!(en.sets[0].secondary_muscle_groups, vec!["back"]);
    assert_eq!(en.sets[0].exercise_name.as_deref(), Some("Lateral Raises"));
    assert_eq!(en.sets[1].muscle_group.as_deref(), Some("back"));
    assert_eq!(
        en.sets[1].exercise_name.as_deref(),
        Some("Assisted Back Extension")
    );
    // 目录里也没有的编号：什么都不补。
    assert_eq!(en.sets[2].muscle_group, None);
    assert_eq!(en.sets[2].exercise_name, None);

    // 非英文目录只补肌群，不把别的语言的名字塞进导出字段。
    let mut pt = detail();
    enrich_strength_detail(&mut pt, Some(&make("pt_BR")));
    assert_eq!(pt.sets[1].muscle_group.as_deref(), Some("back"));
    assert_eq!(pt.sets[1].exercise_name, None);
}
