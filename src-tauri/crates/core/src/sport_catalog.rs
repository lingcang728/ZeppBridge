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
    /// Zepp 的数字类型。`null` 表示**没有**已知的编号会产生这个运动。
    ///
    /// 目录同时承担两件事：把 Zepp 的编号翻译成运动，以及给用户一份可以手动
    /// 纠正成什么的清单。这两件事的覆盖面不一样——有些运动我们确知它存在、
    /// 用户也确实需要把记录改成它，却不知道 Zepp 用哪个编号表示它。给这种条目
    /// 编一个号，等于让 normalizer 从此把那个编号的记录全部认成这个运动，
    /// 一个凭空的猜测会变成一批错误的历史。所以宁可留空：它出现在纠正列表里，
    /// 但永远不会被自动派上。
    #[serde(default)]
    code: Option<i64>,
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
            .filter_map(|entry| entry.code.map(|code| (code, entry.key)))
            .collect()
    })
}

pub fn resolve(type_id: i64) -> Option<&'static str> {
    entries().get(&type_id).map(String::as_str)
}

/// Cloud history and Zepp OS protocol numbers are separate namespaces (#155).
/// The conflicting cloud code 15 is only established for Balance 2.
pub fn resolve_cloud(
    type_id: i64,
    device_source: Option<i64>,
    name: Option<&str>,
) -> Option<&'static str> {
    resolve_cloud_with_device(type_id, device_source, name, None)
}

/// `catalog_id` must belong to the physical device identified by this row,
/// never merely the account's current or only watch. Conflicting recognised
/// identities are insufficient evidence for the device-specific code 15.
pub fn resolve_cloud_with_device(
    type_id: i64,
    device_source: Option<i64>,
    name: Option<&str>,
    catalog_id: Option<&str>,
) -> Option<&'static str> {
    if type_id != 15 {
        return resolve(type_id);
    }
    let source = crate::device_catalog::match_catalog(&crate::device_catalog::CatalogMatchInput {
        device_source_codes: device_source.into_iter().collect(),
        ..Default::default()
    });
    let named = crate::device_catalog::match_catalog(&crate::device_catalog::CatalogMatchInput {
        device_names: name.into_iter().collect(),
        ..Default::default()
    });
    let local = catalog_id.and_then(|id| {
        crate::device_catalog::catalog_entries()
            .iter()
            .find(|entry| entry.catalog_id == id)
    });
    let mut identities = source
        .iter()
        .map(|matched| matched.entry)
        .chain(named.iter().map(|matched| matched.entry))
        .chain(local);
    let first = identities.next()?;
    let key = |entry: &crate::device_catalog::CatalogEntry| {
        entry
            .canonical_device_key
            .clone()
            .unwrap_or_else(|| entry.catalog_id.clone())
    };
    let expected = key(first);
    if expected != "amazfit-balance-2" || identities.any(|entry| key(entry) != expected) {
        return None;
    }
    Some("open_water_swimming")
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
    fn code_15_requires_unambiguous_balance_2_cloud_context() {
        assert_eq!(resolve(15), None);
        assert_eq!(resolve_cloud(15, None, None), None);
        assert_eq!(
            resolve_cloud(15, Some(9568512), None),
            Some("open_water_swimming")
        );
        assert_eq!(
            resolve_cloud(15, None, Some("Amazfit Balance 2")),
            Some("open_water_swimming")
        );
        assert_eq!(
            resolve_cloud(15, Some(9568512), Some("Amazfit T-Rex 3")),
            None
        );
        assert_eq!(
            resolve_cloud_with_device(15, Some(9568512), None, Some("amazfit-t-rex-3")),
            None
        );
        assert_eq!(
            resolve_cloud_with_device(15, None, None, Some("amazfit-balance-2")),
            Some("open_water_swimming")
        );
        assert_eq!(
            resolve_cloud_with_device(15, None, None, Some("not-a-device")),
            None
        );
        assert_eq!(resolve_cloud(224, None, None), Some("hiking"));
    }

    #[test]
    fn catalog_keeps_cloud_overrides_and_covers_extended_types() {
        assert_eq!(resolve(6), Some("walking"));
        assert_eq!(resolve(9), Some("ride"));
        assert_eq!(resolve(52), Some("strength"));
        assert_eq!(resolve(92), Some("badminton"));
        assert_eq!(resolve(130), Some("cross_training"));
        assert_eq!(resolve(225), Some("rucking"));
        assert_eq!(resolve(105), None);
    }

    /// 46 / 47 / 141 / 193：越野滑雪、山地骑行、划船、钓鱼。
    ///
    /// 证据是 issue #143（3.0.2，Amazfit Balance 2）逐条对着 Zepp App 核对的原话：
    /// 「46 = cross-country skiing (skate), 47 = mountain bike, 141 = rowing,
    /// 193 = fishing」。47 在反馈库里已经挂了 12 份报告，只是一直没有语义。
    /// 141 / 193 和设备协议那张表里的 66（划船）/ 64（钓鱼）不是同一个编号——
    /// 云端编号优先，见目录 notes。
    #[test]
    fn issue_143_codes() {
        assert_eq!(resolve(46), Some("cross_country_skiing"));
        assert_eq!(resolve(47), Some("mountain_biking"));
        assert_eq!(resolve(141), Some("water_rowing"));
        assert_eq!(resolve(193), Some("fishing"));
        // 遛狗只开放手动纠正：还不知道哪个编号会产生它，不猜。
        assert!(is_known_key("dog_walking"));
    }

    /// 211 是公路骑行。
    ///
    /// 反馈库里 10 份报告、199 条记录都挂着这个编号，跨 1.1.1 到 1.1.5 每个版本，
    /// 其中一份直接写了「road cycling with zepp code 211 was read as unknown
    /// workout」。这是全部 28 个未知编号里唯一有文字证据的一个——其余的只有
    /// 数量，没有语义，所以一个都没动。
    #[test]
    fn code_211_is_road_cycling() {
        assert_eq!(resolve(211), Some("road_cycling"));
        assert!(is_known_key("road_cycling"));
    }

    /// 12 是椭圆机。
    ///
    /// 和 211 一样，靠的是一句用户原话，不是数量：反馈 2db466d6（v2.1.0 /
    /// linux，分类 workout，这个编号下挂着 80 条记录）写着「Zepp workout code
    /// number 12 is an official activity, it's the Elliptical activity.」。
    /// 183 份报告里这个编号出现了 11 次、共 100 条记录，但真正让它进目录的是
    /// 那一句话——别的高频编号（108 是 15 份 320 条）只有数量没有语义，一个
    /// 都没动。
    ///
    /// 椭圆机在此之前整个目录里都不存在，所以这一条同时补上了纠正列表里的
    /// 一个缺口：以前用户连手动改成椭圆机都做不到。
    #[test]
    fn code_12_is_elliptical() {
        assert_eq!(resolve(12), Some("elliptical"));
        assert!(is_known_key("elliptical"));
    }

    /// Issue #24 supplies code 7, matching Zepp/ZeppBridge screenshots and
    /// a Zepp GPX labelled Trail running. Cloud history codes are not the
    /// Zepp OS device-protocol enum. Do not guess a replacement swimming code.
    #[test]
    fn cloud_code_7_is_trail_running_and_swimming_remains_selectable() {
        assert_eq!(resolve(7), Some("trail_running"));
        assert!(is_known_key("trail_running"));
        assert!(is_known_key("open_water_swimming"));
        assert_eq!(resolve(14), Some("pool_swimming"));
    }

    #[test]
    fn numeric_codes_are_unique() {
        let document: CatalogDocument = serde_json::from_str(CATALOG_JSON).unwrap();
        let mut codes = HashSet::new();
        for entry in document.sports {
            if let Some(code) = entry.code {
                assert!(codes.insert(code), "duplicate cloud code {code}");
            }
        }
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
