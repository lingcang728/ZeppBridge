use serde::Deserialize;
use std::collections::{HashMap, HashSet};
use std::sync::OnceLock;

const CATALOG_JSON: &str = include_str!("../../../../src/assets/workouts/catalog.json");

#[derive(Debug, Deserialize)]
struct CatalogDocument {
    sports: Vec<SportEntry>,
}

#[derive(Debug, Deserialize)]
struct SportEntry {
    code: i64,
    key: String,
    label_zh: String,
}

/// 目录里的一个运动，供界面做纠正下拉框。
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SportOption {
    pub key: String,
    pub label: String,
}

fn entries() -> &'static HashMap<i64, String> {
    static ENTRIES: OnceLock<HashMap<i64, String>> = OnceLock::new();
    ENTRIES.get_or_init(|| {
        let document: CatalogDocument =
            serde_json::from_str(CATALOG_JSON).expect("bundled workout catalog must be valid JSON");
        document
            .sports
            .into_iter()
            .map(|entry| (entry.code, entry.key))
            .collect()
    })
}

pub fn resolve(type_id: i64) -> Option<&'static str> {
    entries().get(&type_id).map(String::as_str)
}

fn known_keys() -> &'static HashSet<String> {
    static KEYS: OnceLock<HashSet<String>> = OnceLock::new();
    KEYS.get_or_init(|| options().iter().map(|entry| entry.key.clone()).collect())
}

/// 用户纠正运动类型时的允许值。
///
/// 以随包目录为准，而不是一份写死的短名单：目录里有一百多个运动，把允许值
/// 固定成十几个，用户连「壁球」都改不成，只能眼睁睁看着一条记录挂着错类型。
pub fn is_known_key(key: &str) -> bool {
    known_keys().contains(key)
}

/// 去重后的运动选项，按中文名排序，供界面直接渲染。
pub fn options() -> &'static [SportOption] {
    static OPTIONS: OnceLock<Vec<SportOption>> = OnceLock::new();
    OPTIONS.get_or_init(|| {
        let document: CatalogDocument =
            serde_json::from_str(CATALOG_JSON).expect("bundled workout catalog must be valid JSON");
        let mut seen = HashSet::new();
        let mut options: Vec<SportOption> = document
            .sports
            .into_iter()
            .filter(|entry| seen.insert(entry.key.clone()))
            .map(|entry| SportOption {
                key: entry.key,
                label: entry.label_zh,
            })
            .collect();
        options.sort_by(|a, b| a.label.cmp(&b.label).then(a.key.cmp(&b.key)));
        options
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn catalog_keeps_cloud_overrides_and_covers_extended_types() {
        assert_eq!(resolve(6), Some("walking"));
        assert_eq!(resolve(9), Some("ride"));
        assert_eq!(resolve(52), Some("strength"));
        assert_eq!(resolve(92), Some("badminton"));
        assert_eq!(resolve(130), Some("cross_training"));
        assert_eq!(resolve(105), None);
    }

    #[test]
    fn override_allowlist_is_the_whole_catalog() {
        assert!(is_known_key("strength"));
        assert!(is_known_key("badminton"));
        assert!(!is_known_key("not-a-sport"));
        let options = options();
        assert!(
            options.len() > 100,
            "目录里应当有上百个运动: {}",
            options.len()
        );
        assert!(options.iter().all(|entry| !entry.label.trim().is_empty()));
        let mut keys: Vec<&str> = options.iter().map(|entry| entry.key.as_str()).collect();
        keys.sort_unstable();
        let before = keys.len();
        keys.dedup();
        assert_eq!(before, keys.len(), "选项里不能有重复 key");
    }
}
