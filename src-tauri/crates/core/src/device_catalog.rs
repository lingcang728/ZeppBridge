use serde::Deserialize;
use std::sync::OnceLock;

const CATALOG_JSON: &str = include_str!("../../../../src/assets/devices/catalog.json");

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
    /// 产品料号（`A2322` 这一类）。**不是** `deviceSource`。
    #[serde(default)]
    pub model_codes: Vec<String>,
    /// Zepp 设备列表里的 `deviceSource` 数字。
    ///
    /// 有些账号的设备响应里连一个产品名字段都没有，只剩这些数字（issue #4）。
    /// 华米没有公开对照表，所以这一列全部来自用户在应用里主动指认的型号，
    /// 由反馈库汇总而来。收录规则写在 `docs/` 的设备目录说明里，要点是：
    ///
    /// * 只收 `deviceSource`，**绝不收 `deviceType`** —— 后者是族码，光是 0
    ///   一个值就横跨二十款表，写成一对一必然误判；
    /// * 只收高位段（≥ 1_000_000）。低位段（15/101/102/104 这些）在反馈里就是
    ///   自相矛盾的，同一个数字被指认成四款不同的表；
    /// * 每个数字至少要有两份互相独立的报告。
    ///
    /// 同一款表有多个相邻数字是正常的：低位是配色/尺寸变体。
    #[serde(default)]
    pub device_source_codes: Vec<i64>,
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
    /// 设备响应里的 `deviceSource` 数字。只放 `deviceSource`，不要放
    /// `deviceType` —— 见 `CatalogEntry::device_source_codes`。
    pub device_source_codes: Vec<i64>,
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
    // deviceSource 排在最前：它是这些响应里唯一确切指向某一款表的东西，而
    // 名字类字段在同一批账号上压根不存在。
    for candidate in &input.device_source_codes {
        if let Some(entry) = catalog_entries().iter().find(|entry| {
            entry.supported
                && entry.status == "active"
                && entry.device_source_codes.contains(candidate)
        }) {
            return Some(CatalogMatch {
                entry,
                status: CatalogMatchStatus::Exact,
            });
        }
    }

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

    /// 用户指认汇总出来的 deviceSource 数字能认出表来。
    ///
    /// 这是 issue #4 那类账号唯一的出路：它们的设备响应里一个产品名字段都没有，
    /// 只剩这些数字，名字类匹配在那里永远是空转。
    #[test]
    fn a_device_source_number_identifies_the_model() {
        for (code, catalog_id) in [
            (8716547_i64, "amazfit-t-rex-3"),
            (9568515, "amazfit-balance-2"),
            (10289410, "amazfit-helio-strap"),
            (10158337, "amazfit-bip-6"),
            (11141379, "amazfit-balance-3"),
            // 2026-09-02 那批反馈里凑够第二份独立报告的三个。
            (10813697, "amazfit-active-max"),
            (11206915, "amazfit-bip-max"),
            (10944771, "amazfit-active-3-premium"),
        ] {
            let matched = match_catalog(&CatalogMatchInput {
                device_source_codes: vec![code],
                ..CatalogMatchInput::default()
            })
            .unwrap_or_else(|| panic!("deviceSource {code} 应当匹配到型号"));
            assert_eq!(matched.entry.catalog_id, catalog_id, "deviceSource {code}");
            assert_eq!(matched.status, CatalogMatchStatus::Exact);
        }
    }

    /// 同一款表的相邻编号都指向它——低位是配色/尺寸变体。
    #[test]
    fn neighbouring_device_source_numbers_stay_on_the_same_product() {
        for code in [8716544_i64, 8716545, 8716547] {
            let matched = match_catalog(&CatalogMatchInput {
                device_source_codes: vec![code],
                ..CatalogMatchInput::default()
            })
            .unwrap();
            assert_eq!(matched.entry.catalog_id, "amazfit-t-rex-3");
        }
    }

    /// 目录里绝不能出现族码。
    ///
    /// `deviceType` 的取值（0、1、7）和低位段的 `deviceSource`（15、101、102、
    /// 104）在反馈库里都是自相矛盾的：同一个数字被不同用户指认成好几款表。
    /// 一旦有人图省事把它们写进目录，所有装着这类表的账号都会被认成同一款。
    #[test]
    fn the_catalog_never_carries_a_family_code() {
        for entry in catalog_entries() {
            for code in &entry.device_source_codes {
                assert!(
                    *code >= 1_000_000,
                    "{} 收了低位编号 {code}——那一段在反馈里就是自相矛盾的",
                    entry.catalog_id
                );
            }
        }
        for code in [0_i64, 1, 7, 15, 101, 102, 104] {
            assert!(
                match_catalog(&CatalogMatchInput {
                    device_source_codes: vec![code],
                    ..CatalogMatchInput::default()
                })
                .is_none(),
                "{code} 不该匹配到任何型号"
            );
        }
    }

    /// 2026-09-02 那批新收的编号，按既有规则（两份互相独立、无异议的报告）
    /// 裁决通过：10551555 -> T-Rex 3 Pro，8651008 -> Helio Ring（Helio Ring
    /// 的第一个编号）。
    ///
    /// 同一批里刻意没收的三个，理由记在
    /// `scripts/assets/build-device-catalog.py` 的注释里：10813699 是 3:3 平票，
    /// 8913155 和 7930112 各有一份来自单设备报告的真实异议——那种异议用不上
    /// 「一个账号两块表、在选择器里挑错了」这条既有裁决理由。
    #[test]
    fn the_codes_adjudicated_on_2026_09_02_resolve_to_their_products() {
        for (code, catalog_id) in [
            (10_551_555_i64, "amazfit-t-rex-3-pro-48-44mm"),
            (8_651_008, "amazfit-helio-ring"),
        ] {
            let found = match_catalog(&CatalogMatchInput {
                device_source_codes: vec![code],
                ..CatalogMatchInput::default()
            })
            .unwrap_or_else(|| panic!("{code} 应当能匹配到 {catalog_id}"));
            assert_eq!(found.entry.catalog_id, catalog_id);
        }

        // 没裁决通过的那三个不能悄悄溜进去。
        for code in [10_813_699_i64, 8_913_155, 7_930_112] {
            assert!(
                match_catalog(&CatalogMatchInput {
                    device_source_codes: vec![code],
                    ..CatalogMatchInput::default()
                })
                .is_none(),
                "{code} 还没有裁决通过，不该匹配到任何型号"
            );
        }
    }

    /// 2026-09-03 这一批（反馈库 183 行）唯一裁决通过的：10682625 -> T-Rex 3
    /// Pro。2 份互相独立的报告（v1.1.1 / v1.1.5），零异议，高位段，且和已经
    /// 收了的 10551552 / 10551555 同族。
    ///
    /// 同一批里两个有争议的编号又各多了一份，但仍然不收：10813699 从 3:3
    /// 变成 Active 2 44mm 4 份 vs Active MAX 3 份，8913155 从 2:1 变成 3:1。
    /// 平票被打破不等于分歧消失——多数票在这张表上从来不算数，因为收错一个
    /// 编号会让所有同款用户的设备名静默地错掉。
    #[test]
    fn the_code_adjudicated_on_2026_09_03_resolves_to_its_product() {
        let found = match_catalog(&CatalogMatchInput {
            device_source_codes: vec![10_682_625],
            ..CatalogMatchInput::default()
        })
        .expect("10682625 应当能匹配到 T-Rex 3 Pro");
        assert_eq!(found.entry.catalog_id, "amazfit-t-rex-3-pro-48-44mm");

        // 相邻的 10682624 仍然只有一份报告，不能跟着邻接性溜进去。
        assert!(
            match_catalog(&CatalogMatchInput {
                device_source_codes: vec![10_682_624],
                ..CatalogMatchInput::default()
            })
            .is_none(),
            "10682624 还只有一份报告，不该匹配到任何型号"
        );
    }

    /// Balance 2 XT 能被搜到、能被手动指认，哪怕它还没有产品图。
    ///
    /// issue #42：它在型号列表里根本不存在，于是那位用户连手动指认都做不了。
    /// 它是目录里第一个 `image_key` 为空的条目——界面退到内联 SVG 占位图。
    /// 拿 Balance 2 的图顶上去是给用户看一张错的表，比没有图更糟。
    #[test]
    fn balance_2_xt_is_selectable_without_product_art() {
        let entry = catalog_entries()
            .iter()
            .find(|entry| entry.catalog_id == "amazfit-balance-2-xt")
            .expect("Balance 2 XT 应当在目录里");
        assert!(entry.supported && entry.status == "active");
        assert!(entry.image_key.is_none(), "它还没有产品图");
        assert!(entry.asset_hash.is_none());
        // 它是 Balance 2 的零售变体，不是一款新的规范型号。
        assert_eq!(
            entry.canonical_device_key.as_deref(),
            Some("amazfit-balance-2")
        );
        // 还没有人从这款表上提交过报告，所以一个编号都不该挂在它名下。
        assert!(entry.device_source_codes.is_empty());

        let matched = match_catalog(&CatalogMatchInput {
            device_names: vec!["Amazfit Balance 2 XT"],
            ..CatalogMatchInput::default()
        })
        .expect("按名字应当能匹配到 Balance 2 XT");
        assert_eq!(matched.entry.catalog_id, "amazfit-balance-2-xt");
    }

    /// 一个编号只能属于一款表。
    #[test]
    fn every_device_source_number_belongs_to_exactly_one_product() {
        let mut seen: Vec<(i64, &str)> = Vec::new();
        for entry in catalog_entries() {
            for code in &entry.device_source_codes {
                if let Some((_, other)) = seen.iter().find(|(value, _)| value == code) {
                    panic!(
                        "deviceSource {code} 同时挂在 {other} 和 {}",
                        entry.catalog_id
                    );
                }
                seen.push((*code, entry.catalog_id.as_str()));
            }
        }
        assert!(seen.len() >= 20, "写进去的编号太少了: {}", seen.len());
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
