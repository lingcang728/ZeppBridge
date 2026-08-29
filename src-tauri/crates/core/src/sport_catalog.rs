use serde::Deserialize;
use std::collections::HashMap;
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
}
