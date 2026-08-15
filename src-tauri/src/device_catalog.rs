use serde::Deserialize;
use std::sync::OnceLock;

const CATALOG_JSON: &str = include_str!("../../src/assets/devices/catalog.json");

#[allow(dead_code)]
#[derive(Debug, Clone, Deserialize)]
pub struct CatalogDocument {
    pub version: u32,
    pub checked_at: String,
    pub sources: Vec<String>,
    pub devices: Vec<CatalogEntry>,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Deserialize)]
pub struct CatalogEntry {
    pub catalog_id: String,
    pub canonical_name: String,
    pub display_name: String,
    #[serde(default)]
    pub name_zh: Option<String>,
    pub kind: String,
    #[serde(default)]
    pub model_codes: Vec<String>,
    pub aliases: Vec<String>,
    pub region: Vec<String>,
    pub status: String,
    pub supported: bool,
    #[serde(default)]
    pub canonical_device_key: Option<String>,
    #[serde(default)]
    pub official_page: Option<String>,
    pub official_url: String,
    #[serde(default)]
    pub image_source_url: Option<String>,
    #[serde(default)]
    pub asset_source: Option<String>,
    #[serde(default)]
    pub image_key: Option<String>,
    #[serde(default)]
    pub asset_hash: Option<String>,
    pub checked_at: String,
    pub provenance: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CatalogMatchStatus {
    Exact,
    Alias,
}

#[derive(Debug, Clone)]
pub struct CatalogMatch<'a> {
    pub entry: &'a CatalogEntry,
    pub status: CatalogMatchStatus,
}

#[derive(Debug, Default)]
pub struct CatalogMatchInput<'a> {
    pub model_codes: Vec<&'a str>,
    pub product_names: Vec<&'a str>,
    pub device_names: Vec<&'a str>,
    pub display_name: Option<&'a str>,
}

fn document() -> &'static CatalogDocument {
    static DOCUMENT: OnceLock<CatalogDocument> = OnceLock::new();
    DOCUMENT.get_or_init(|| {
        serde_json::from_str(CATALOG_JSON).expect("bundled device catalog must be valid JSON")
    })
}

pub fn catalog_entries() -> &'static [CatalogEntry] {
    &document().devices
}

pub fn normalize_model(value: &str) -> String {
    value
        .chars()
        .flat_map(char::to_lowercase)
        .filter(|character| character.is_alphanumeric())
        .collect()
}

fn words(value: &str) -> Vec<String> {
    value
        .split(|character: char| !character.is_alphanumeric())
        .filter(|word| !word.is_empty())
        .map(|word| word.to_lowercase())
        .collect()
}

fn contains_complete_alias(display_name: &str, alias: &str) -> bool {
    let alias_words = words(alias);
    // A single generic word (for example, "Balance") cannot identify one
    // product from a nickname. Numbered or multi-word aliases are stable.
    if alias_words.len() < 2
        && !alias_words
            .iter()
            .any(|word| word.chars().any(|c| c.is_ascii_digit()))
    {
        return false;
    }
    // Product aliases can be embedded in a user nickname written in CJK
    // characters (for example, "凌苍的T-Rex 3").  The old word-window
    // matcher merged the CJK prefix and the first Latin token, so it never
    // saw the complete alias.  Match the punctuation-free alias while still
    // requiring ASCII boundaries, which rejects near misses such as
    // "T-Rex 30" without inventing a product for arbitrary text.
    let display = normalize_model(display_name);
    let needle = normalize_model(alias);
    if needle.is_empty() {
        return false;
    }
    let mut offset = 0;
    while let Some(found) = display[offset..].find(&needle) {
        let start = offset + found;
        let end = start + needle.len();
        let before = display[..start].chars().next_back();
        let after = display[end..].chars().next();
        let ascii_boundary = |character: Option<char>| {
            character
                .map(|value| !value.is_ascii_alphanumeric())
                .unwrap_or(true)
        };
        if ascii_boundary(before) && ascii_boundary(after) {
            return true;
        }
        offset = start + needle.len();
        if offset >= display.len() {
            break;
        }
    }
    false
}

pub fn match_catalog(input: &CatalogMatchInput<'_>) -> Option<CatalogMatch<'static>> {
    for candidate in &input.model_codes {
        let normalized = normalize_model(candidate);
        if normalized.is_empty() {
            continue;
        }
        if let Some(entry) = catalog_entries().iter().find(|entry| {
            entry.supported
                && entry.status == "active"
                && entry
                    .model_codes
                    .iter()
                    .any(|code| normalize_model(code) == normalized)
        }) {
            return Some(CatalogMatch {
                entry,
                status: CatalogMatchStatus::Exact,
            });
        }
    }

    for candidate in input.product_names.iter().chain(input.device_names.iter()) {
        let normalized = normalize_model(candidate);
        if normalized.is_empty() {
            continue;
        }
        if let Some(entry) = catalog_entries().iter().find(|entry| {
            entry.supported
                && entry.status == "active"
                && std::iter::once(&entry.display_name)
                    .chain(entry.aliases.iter())
                    .chain(entry.name_zh.iter())
                    .any(|alias| normalize_model(alias) == normalized)
        }) {
            return Some(CatalogMatch {
                entry,
                status: CatalogMatchStatus::Alias,
            });
        }
    }

    let display_name = input.display_name?;
    catalog_entries()
        .iter()
        .filter(|entry| entry.supported && entry.status == "active")
        .flat_map(|entry| {
            std::iter::once(&entry.display_name)
                .chain(entry.aliases.iter())
                .chain(entry.name_zh.iter())
                .filter_map(move |alias| {
                    contains_complete_alias(display_name, alias)
                        .then_some((alias.split_whitespace().count(), entry))
                })
        })
        .max_by_key(|(length, _)| *length)
        .map(|(_, entry)| CatalogMatch {
            entry,
            status: CatalogMatchStatus::Alias,
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn catalog_contains_real_devices_and_version() {
        assert!(document().version >= 1);
        assert!(document().checked_at.starts_with("2026-"));
        assert!(catalog_entries()
            .iter()
            .any(|entry| entry.catalog_id == "amazfit-t-rex-3"));
        assert!(catalog_entries()
            .iter()
            .any(|entry| entry.catalog_id == "amazfit-helio-strap"));
        assert!(catalog_entries()
            .iter()
            .any(|entry| entry.catalog_id == "amazfit-helio-ring"));
    }

    #[test]
    fn matching_uses_code_then_exact_names_then_complete_display_alias() {
        let exact = match_catalog(&CatalogMatchInput {
            model_codes: vec!["A2323"],
            ..CatalogMatchInput::default()
        })
        .unwrap();
        assert_eq!(exact.status, CatalogMatchStatus::Exact);
        assert_eq!(exact.entry.catalog_id, "amazfit-t-rex-3");

        let alias = match_catalog(&CatalogMatchInput {
            product_names: vec!["Helio Strap"],
            ..CatalogMatchInput::default()
        })
        .unwrap();
        assert_eq!(alias.status, CatalogMatchStatus::Alias);
        assert_eq!(alias.entry.catalog_id, "amazfit-helio-strap");

        let display = match_catalog(&CatalogMatchInput {
            display_name: Some("我的 T-Rex 3"),
            ..CatalogMatchInput::default()
        })
        .unwrap();
        assert_eq!(display.entry.catalog_id, "amazfit-t-rex-3");

        let cjk_t_rex = match_catalog(&CatalogMatchInput {
            display_name: Some("凌苍的T-Rex 3"),
            ..CatalogMatchInput::default()
        })
        .unwrap();
        assert_eq!(cjk_t_rex.entry.catalog_id, "amazfit-t-rex-3");

        let cjk_helio = match_catalog(&CatalogMatchInput {
            display_name: Some("凌苍的Helio Strap"),
            ..CatalogMatchInput::default()
        })
        .unwrap();
        assert_eq!(cjk_helio.entry.catalog_id, "amazfit-helio-strap");

        let pro = match_catalog(&CatalogMatchInput {
            product_names: vec!["T-Rex 3 Pro 48mm"],
            ..CatalogMatchInput::default()
        })
        .unwrap();
        assert_eq!(pro.entry.catalog_id, "amazfit-t-rex-3-pro-48-44mm");

        let ultra = match_catalog(&CatalogMatchInput {
            display_name: Some("我的 Amazfit T-Rex Ultra"),
            ..CatalogMatchInput::default()
        })
        .unwrap();
        assert_eq!(ultra.entry.catalog_id, "amazfit-t-rex-ultra-47mm");

        let square = match_catalog(&CatalogMatchInput {
            product_names: vec!["Active 2 Square"],
            ..CatalogMatchInput::default()
        })
        .unwrap();
        assert_eq!(square.entry.catalog_id, "amazfit-active-2-square");

        let bip_pro = match_catalog(&CatalogMatchInput {
            product_names: vec!["Bip 3 Pro"],
            ..CatalogMatchInput::default()
        })
        .unwrap();
        assert_eq!(bip_pro.entry.catalog_id, "amazfit-bip-3-pro");

        let bip_five = match_catalog(&CatalogMatchInput {
            display_name: Some("我的 Amazfit Bip 5"),
            ..CatalogMatchInput::default()
        })
        .unwrap();
        assert_eq!(bip_five.entry.catalog_id, "amazfit-bip-5-46mm");

        let bip_six = match_catalog(&CatalogMatchInput {
            display_name: Some("我的 Bip 6"),
            ..CatalogMatchInput::default()
        })
        .unwrap();
        assert_eq!(bip_six.entry.catalog_id, "amazfit-bip-6");

        let black = match_catalog(&CatalogMatchInput {
            product_names: vec!["GTR 4 46mm Black"],
            ..CatalogMatchInput::default()
        })
        .unwrap();
        assert_eq!(black.entry.catalog_id, "amazfit-gtr-4-46mm-black");

        assert!(match_catalog(&CatalogMatchInput {
            display_name: Some("未知手环"),
            ..CatalogMatchInput::default()
        })
        .is_none());

        assert!(match_catalog(&CatalogMatchInput {
            product_names: vec!["Helio Armband"],
            ..CatalogMatchInput::default()
        })
        .is_none());
    }
}
