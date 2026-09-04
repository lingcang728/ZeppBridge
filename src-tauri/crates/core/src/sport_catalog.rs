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
        assert_eq!(resolve(225), Some("rucking"));
        assert_eq!(resolve(105), None);
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

    /// 越野跑能被选，但不会被自动派上。
    ///
    /// 有用户报告越野跑被显示成公开水域游泳，并且在纠正列表里找不到越野跑
    /// （反馈 af3fba3c）。后半句是确定的缺口，补上；前半句不是——那条报告里
    /// 没有编号信息（未知编号为空、冲突数为 0），而 Gadgetbridge 的 Zepp OS
    /// 表里 7 确实是公开水域游泳。云端编号是不是另一套，手上没有第二个来源
    /// 能证实，所以 code 7 的映射一个字都没改。
    #[test]
    fn trail_running_is_selectable_but_never_auto_assigned() {
        assert!(is_known_key("trail_running"));
        assert!(
            !entries().values().any(|key| key == "trail_running"),
            "没有编号该派给越野跑——凭空编一个会把一批历史记录改错"
        );
        // 反过来也要成立：code 7 仍然是公开水域游泳，没有被顺手改掉。
        assert_eq!(resolve(7), Some("open_water_swimming"));
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
