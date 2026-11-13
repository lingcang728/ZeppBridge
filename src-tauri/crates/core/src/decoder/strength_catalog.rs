//! Zepp 力量训练动作目录（`GET /sport/config/muscle`）：解析、肌群归类与本机文件缓存。
//!
//! `strength.rs` 里的静态表只覆盖 0..=130 的 125 个老动作；新固件的动作编号从 1001
//! 一直排到 10067（约一千个，GitHub #163 felipepmdias 实测），而且 Zepp 还在加。
//! 这些动作的名字和肌群只能问 Zepp 要：
//!
//! - 语言由请求头 `lang`（如 `en_US`、`pt_BR`）决定，不是查询参数；
//! - **必须带 `cv`（App 构建版本，如 `151871_10.4.0`）**，不带只回老的 125 个左右；
//! - 每个动作给 `mainPositions` / `subPositions`（主 / 辅肌肉位置号），位置号与语言无关。
//!
//! 位置号到九大肌群的归类见 [`muscle_group_for_position`]；认不出的位置号不归类，
//! 不猜。名字原样保存 Zepp 给的（按语言各存一份），后端不翻译、不改写。

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::{Path, PathBuf};

/// 拉目录时冒充的 App 构建版本。Zepp 按它决定回老的子集还是完整目录；
/// 这是 felipepmdias 抓到的手机 App 自己发的值。
pub const STRENGTH_CATALOG_CV: &str = "151871_10.4.0";
/// 与 [`STRENGTH_CATALOG_CV`] 配套的版本号头 `vn`。
pub const STRENGTH_CATALOG_VN: &str = "10.4.0";
/// 缓存多久算旧（秒）。Zepp 加动作不频繁，一个月问一次足够。
pub const STRENGTH_CATALOG_MAX_AGE_SECONDS: i64 = 30 * 24 * 60 * 60;
/// 只拿到老子集时多久后重试（秒）。
pub const STRENGTH_CATALOG_SUBSET_RETRY_SECONDS: i64 = 24 * 60 * 60;
/// 完整目录至少该有这么多条；少于它说明服务端又回了老子集（比如 `cv` 不再被认），
/// 这时不覆盖已有的完整缓存。
pub const STRENGTH_CATALOG_FULL_MIN: usize = 200;
/// 导出 / MCP 用的动作名语言。
pub const STRENGTH_CATALOG_EXPORT_LANG: &str = "en_US";

/// 目录里的一个动作。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct StrengthCatalogAction {
    /// `actionType`，和逐组 `lap` 第 28 列同一个编号。
    pub action_code: i32,
    /// Zepp 按请求语言给的动作名，原样保存。
    pub name: String,
    /// 主练肌群（九大肌群键，去重，按位置号出现顺序）。
    #[serde(default)]
    pub primary_groups: Vec<String>,
    /// 辅助肌群（已去掉与主练重复的）。
    #[serde(default)]
    pub secondary_groups: Vec<String>,
    /// 原始主 / 辅位置号，留作审计（左右侧、细分肌肉以后可能用得上）。
    #[serde(default)]
    pub main_positions: Vec<i32>,
    #[serde(default)]
    pub sub_positions: Vec<i32>,
    /// `selfWeightType`：1 = 自重动作，0 = 负重。
    #[serde(default)]
    pub self_weight: Option<bool>,
}

/// 一种语言的目录缓存（`<数据目录>/strength-catalog-<lang>.json`）。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct StrengthCatalogCache {
    pub version: u32,
    /// Zepp 语言码，如 `en_US`。
    pub lang: String,
    /// RFC 3339，拉取时刻。
    pub fetched_at: String,
    pub actions: Vec<StrengthCatalogAction>,
}

/// Zepp 肌肉位置号 → 九大肌群键（与 `STRENGTH_MUSCLE_GROUPS` 同一套）。
///
/// 依据：felipepmdias 的对照表（#163），并用完整目录里按动作名反查核过——
/// 三头 22/23、二头 10/11、胸 5/6、三角肌 3/4/38/39、背阔 19/20、斜方 34/35、
/// 竖脊 36/37、腹直 1/2、腹斜 7/8、股四 14/15、腘绳 28/29、臀 26/27、
/// 小腿 16/17 与 30/31、前臂 12/13 与 24/25、颈 40/41。
/// 他没列的：32/33、46/47 只出现在高抬腿、跪姿髂腰肌拉伸这类动作上（髋屈肌），
/// 42/43 是大腿内侧（内收肌），44/45 是髂胫束 / 阔筋膜张肌——都归腿部。
/// 48/49 同时出现在骨盆后倾、侧腰拉伸和高抬腿上，说不清是哪块，不归类。
pub fn muscle_group_for_position(position: i32) -> Option<&'static str> {
    Some(match position {
        1 | 2 | 7 | 8 => "core",
        3 | 4 | 38 | 39 => "shoulders",
        // 颈部并进肩部，与静态表里 `neck_muscles` 的归类一致。
        40 | 41 => "shoulders",
        5 | 6 => "chest",
        10 | 11 => "biceps",
        22 | 23 => "triceps",
        12 | 13 | 24 | 25 => "forearms",
        19 | 20 | 34 | 35 | 36 | 37 => "back",
        26 | 27 => "glutes",
        14 | 15 | 16 | 17 | 28 | 29 | 30 | 31 | 32 | 33 | 42 | 43 | 44 | 45 | 46 | 47 => "legs",
        _ => return None,
    })
}

fn groups_for_positions(positions: &[i32], exclude: &[String]) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for group in positions
        .iter()
        .filter_map(|position| muscle_group_for_position(*position))
    {
        if !out.iter().any(|g| g == group) && !exclude.iter().any(|g| g == group) {
            out.push(group.to_string());
        }
    }
    out
}

fn int_list(value: Option<&Value>) -> Vec<i32> {
    match value {
        Some(Value::Array(items)) => items
            .iter()
            .filter_map(|item| {
                item.as_i64()
                    .or_else(|| item.as_str().and_then(|s| s.trim().parse().ok()))
            })
            .filter_map(|v| i32::try_from(v).ok())
            .collect(),
        // 偶尔有接口把数组写成 "3,4,38" 这样的字符串。
        Some(Value::String(text)) => text
            .split(',')
            .filter_map(|part| part.trim().parse::<i32>().ok())
            .collect(),
        _ => Vec::new(),
    }
}

/// 解析 `/sport/config/muscle` 的响应。接受裸数组，也接受 `{data: [...]}`、
/// `{data: {list: [...]}}` 这类外壳。认不出的条目跳过，不报错。
pub fn parse_strength_catalog(payload: &Value) -> Vec<StrengthCatalogAction> {
    let items = match payload {
        Value::Array(items) => items.as_slice(),
        Value::Object(map) => match map.get("data") {
            Some(Value::Array(items)) => items.as_slice(),
            Some(Value::Object(inner)) => match inner.get("list").or_else(|| inner.get("items")) {
                Some(Value::Array(items)) => items.as_slice(),
                _ => &[],
            },
            _ => &[],
        },
        _ => &[],
    };
    let mut out: Vec<StrengthCatalogAction> = Vec::new();
    for item in items {
        let Some(obj) = item.as_object() else {
            continue;
        };
        let Some(action_code) = obj
            .get("actionType")
            .and_then(|v| {
                v.as_i64()
                    .or_else(|| v.as_str().and_then(|s| s.trim().parse().ok()))
            })
            .and_then(|v| i32::try_from(v).ok())
            .filter(|code| (0..=100_000).contains(code))
        else {
            continue;
        };
        let name = obj
            .get("actionName")
            .and_then(Value::as_str)
            .map(str::trim)
            .unwrap_or_default();
        if name.is_empty() || name.chars().count() > 200 {
            continue;
        }
        if out
            .iter()
            .any(|existing| existing.action_code == action_code)
        {
            continue;
        }
        let main_positions = int_list(obj.get("mainPositions"));
        let sub_positions = int_list(obj.get("subPositions"));
        let primary_groups = groups_for_positions(&main_positions, &[]);
        let secondary_groups = groups_for_positions(&sub_positions, &primary_groups);
        let self_weight = obj
            .get("selfWeightType")
            .and_then(Value::as_i64)
            .map(|v| v == 1);
        out.push(StrengthCatalogAction {
            action_code,
            name: name.to_string(),
            primary_groups,
            secondary_groups,
            main_positions,
            sub_positions,
            self_weight,
        });
    }
    out.sort_by_key(|action| action.action_code);
    out
}

/// 界面语言（`zh`、`pt-BR`…）→ Zepp 的 `lang` 头。Zepp 不认的语言会回英文，
/// 所以这里只管写对格式。
pub fn zepp_lang_for_locale(locale: &str) -> &'static str {
    let lower = locale.trim().to_ascii_lowercase().replace('_', "-");
    match lower.as_str() {
        "zh-tw" | "zh-hk" | "zh-mo" | "zh-hant" => "zh_TW",
        l if l.starts_with("zh-hant") => "zh_TW",
        l if l.starts_with("zh") => "zh_CN",
        "pt-pt" => "pt_PT",
        l if l.starts_with("pt") => "pt_BR",
        l if l.starts_with("es") => "es_ES",
        l if l.starts_with("de") => "de_DE",
        l if l.starts_with("fr") => "fr_FR",
        l if l.starts_with("it") => "it_IT",
        l if l.starts_with("nl") => "nl_NL",
        l if l.starts_with("pl") => "pl_PL",
        l if l.starts_with("ru") => "ru_RU",
        l if l.starts_with("hi") => "hi_IN",
        l if l.starts_with("ja") => "ja_JP",
        l if l.starts_with("ko") => "ko_KR",
        _ => "en_US",
    }
}

/// 只放行 `xx` / `xx_YY` 形状，免得把任意字符串塞进请求头和文件名。
pub fn is_valid_zepp_lang(lang: &str) -> bool {
    let bytes = lang.as_bytes();
    match bytes.len() {
        2 => bytes.iter().all(u8::is_ascii_lowercase),
        5 => {
            bytes[..2].iter().all(u8::is_ascii_lowercase)
                && bytes[2] == b'_'
                && bytes[3..].iter().all(u8::is_ascii_uppercase)
        }
        _ => false,
    }
}

pub fn catalog_cache_path(data_dir: &Path, lang: &str) -> Option<PathBuf> {
    is_valid_zepp_lang(lang).then(|| data_dir.join(format!("strength-catalog-{lang}.json")))
}

pub fn read_catalog_cache(data_dir: &Path, lang: &str) -> Option<StrengthCatalogCache> {
    let path = catalog_cache_path(data_dir, lang)?;
    let raw = std::fs::read_to_string(path).ok()?;
    let cache = serde_json::from_str::<StrengthCatalogCache>(&raw).ok()?;
    (cache.lang == lang && !cache.actions.is_empty()).then_some(cache)
}

pub fn write_catalog_cache(data_dir: &Path, cache: &StrengthCatalogCache) -> std::io::Result<()> {
    let Some(path) = catalog_cache_path(data_dir, &cache.lang) else {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "invalid catalog language",
        ));
    };
    let encoded = serde_json::to_vec(cache).map_err(std::io::Error::other)?;
    crate::paths::write_file_atomically(&path, &encoded)
}

/// 缓存是否需要重拉：没有、读不出时间、超过一个月；只是老的子集时超过一天。
pub fn catalog_cache_is_stale(
    cache: Option<&StrengthCatalogCache>,
    now: chrono::DateTime<chrono::Utc>,
) -> bool {
    let Some(cache) = cache else {
        return true;
    };
    // 只拿到老子集（服务端没认 `cv`）时一天后再试，别每打开一次就问一遍。
    let max_age = if cache.actions.len() < STRENGTH_CATALOG_FULL_MIN {
        STRENGTH_CATALOG_SUBSET_RETRY_SECONDS
    } else {
        STRENGTH_CATALOG_MAX_AGE_SECONDS
    };
    match chrono::DateTime::parse_from_rfc3339(&cache.fetched_at) {
        Ok(at) => (now - at.with_timezone(&chrono::Utc)).num_seconds() > max_age,
        Err(_) => true,
    }
}

/// 任意一份已缓存的目录（肌群与语言无关，哪份都行）；优先导出语言那份。
pub fn read_any_catalog_cache(data_dir: &Path) -> Option<StrengthCatalogCache> {
    if let Some(cache) = read_catalog_cache(data_dir, STRENGTH_CATALOG_EXPORT_LANG) {
        return Some(cache);
    }
    let entries = std::fs::read_dir(data_dir).ok()?;
    let mut best: Option<StrengthCatalogCache> = None;
    for entry in entries.flatten() {
        let name = entry.file_name();
        let Some(lang) = name
            .to_str()
            .and_then(|n| n.strip_prefix("strength-catalog-"))
            .and_then(|n| n.strip_suffix(".json"))
        else {
            continue;
        };
        if let Some(cache) = read_catalog_cache(data_dir, lang) {
            if best
                .as_ref()
                .is_none_or(|b| cache.actions.len() > b.actions.len())
            {
                best = Some(cache);
            }
        }
    }
    best
}

fn find_action(cache: &StrengthCatalogCache, code: i32) -> Option<&StrengthCatalogAction> {
    cache
        .actions
        .binary_search_by_key(&code, |action| action.action_code)
        .ok()
        .map(|idx| &cache.actions[idx])
}

fn secondary_without(action: &StrengthCatalogAction, primary: Option<&str>) -> Vec<String> {
    action
        .secondary_groups
        .iter()
        .filter(|group| Some(group.as_str()) != primary)
        .cloned()
        .collect()
}

/// 用目录补全一场力量训练：
///
/// - 静态表认不出的编号（1001 起的新动作），主肌群取目录 `mainPositions` 的第一个归类；
/// - 每组 / 每个动作都带上辅助肌群；
/// - 目录是英文那份时带上 Zepp 的英文动作名（导出、MCP 用；界面按自己的语言另取）。
///
/// 静态表已有的主肌群不改（那是逐条核过的），目录里没有的编号原样留空。
pub fn enrich_strength_detail(
    detail: &mut crate::models::StrengthWorkoutDetail,
    cache: Option<&StrengthCatalogCache>,
) {
    let Some(cache) = cache else {
        return;
    };
    let with_names = cache.lang == STRENGTH_CATALOG_EXPORT_LANG;
    for set in &mut detail.sets {
        let Some(action) = find_action(cache, set.action_code) else {
            continue;
        };
        if set.muscle_group.is_none() {
            set.muscle_group = action.primary_groups.first().cloned();
        }
        set.secondary_muscle_groups = secondary_without(action, set.muscle_group.as_deref());
        if with_names {
            set.exercise_name = Some(action.name.clone());
        }
    }
    for group in &mut detail.exercise_groups {
        let Some(action) = find_action(cache, group.action_code) else {
            continue;
        };
        if group.muscle_group.is_none() {
            group.muscle_group = action.primary_groups.first().cloned();
        }
        group.secondary_muscle_groups = secondary_without(action, group.muscle_group.as_deref());
        if with_names {
            group.exercise_name = Some(action.name.clone());
        }
    }
}

#[cfg(test)]
#[path = "strength_catalog_tests.rs"]
mod tests;
