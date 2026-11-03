//! 用户选择「不参与分析」的指标。
//!
//! 用户反馈（2026-10）：VO₂max 这类 Zepp 算法估算值有人觉得离谱，想一键把它排除。
//! 「准不准」我们不替用户下判断——界面只说清每项是怎么来的（传感器 / 固定算式 /
//! 算法估算），排不排除由用户自己决定。排除**不删任何数据**，卡片照常显示，只是：
//! 不参与常态比较、不进交给 AI 的导出、MCP 的返回里也去掉，并明说是用户排除的，
//! 免得 AI 当成缺数据去追问或推断。
//!
//! 名单存在 `app_meta`：MCP 是另一个进程，每次请求重开只读连接，下一次调用就生效。

use super::*;

const EXCLUDED_METRICS_KEY: &str = "excluded_metrics";

/// 同一项指标在载荷里还会以这些键出现（训练上下文、运动摘要按字段拆开给）。
const ALIASES: [(&str, &[&str]); 2] = [
    (
        "lactate_threshold",
        &["lactate_threshold_hr", "lactate_threshold_pace"],
    ),
    ("training_load", &["daily_load"]),
];

impl Database {
    /// 用户排除的指标，按名字排序。
    pub fn excluded_metrics(&self) -> Result<Vec<String>> {
        Ok(self
            .get_app_meta(EXCLUDED_METRICS_KEY)?
            .and_then(|raw| serde_json::from_str::<Vec<String>>(&raw).ok())
            .unwrap_or_default())
    }

    /// 排除 / 恢复一项指标，返回新的名单。只认小写字母、数字、下划线的指标名。
    pub fn set_metric_excluded(&self, metric: &str, excluded: bool) -> Result<Vec<String>> {
        let metric = metric.trim();
        if metric.is_empty()
            || metric.len() > 64
            || !metric
                .chars()
                .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_')
        {
            return Err(ZeppBridgeError::ConfigError(format!(
                "不认识的指标名：{metric}"
            )));
        }
        let mut list = self.excluded_metrics()?;
        list.retain(|item| item != metric);
        if excluded {
            list.push(metric.to_string());
        }
        list.sort();
        self.set_app_meta(EXCLUDED_METRICS_KEY, &serde_json::to_string(&list)?)?;
        Ok(list)
    }
}

/// 键名归一：小写、去掉下划线，`vo2max` / `vo2Max` / `VO2_MAX` 是同一个。
fn normalized(key: &str) -> String {
    key.chars()
        .filter(|c| *c != '_')
        .flat_map(char::to_lowercase)
        .collect()
}

fn excluded_keys(excluded: &[String]) -> Vec<String> {
    let mut keys: Vec<String> = excluded.iter().map(|metric| normalized(metric)).collect();
    for (metric, aliases) in ALIASES {
        if excluded.iter().any(|item| item == metric) {
            keys.extend(aliases.iter().map(|alias| normalized(alias)));
        }
    }
    keys
}

/// 从一份要交出去的 JSON 里去掉被排除的指标：同名（不分大小写和下划线）的字段，
/// 以及 `metric` 字段是它的数组元素。返回是否去掉了东西。
pub fn strip_excluded_metrics(value: &mut serde_json::Value, excluded: &[String]) -> bool {
    if excluded.is_empty() {
        return false;
    }
    strip(value, &excluded_keys(excluded))
}

fn strip(value: &mut serde_json::Value, keys: &[String]) -> bool {
    use serde_json::Value;
    let mut removed = false;
    match value {
        Value::Object(map) => {
            let before = map.len();
            map.retain(|key, _| !keys.contains(&normalized(key)));
            removed |= map.len() != before;
            for child in map.values_mut() {
                removed |= strip(child, keys);
            }
        }
        Value::Array(items) => {
            let before = items.len();
            items.retain(|item| {
                !item
                    .get("metric")
                    .and_then(Value::as_str)
                    .is_some_and(|metric| keys.contains(&normalized(metric)))
            });
            removed |= items.len() != before;
            for child in items.iter_mut() {
                removed |= strip(child, keys);
            }
        }
        _ => {}
    }
    removed
}

/// 交给 AI 的话：排除是用户的选择，不是缺数据。
pub const EXCLUSION_NOTE: &str = "用户在 ZeppBridge 里选择让这些指标不参与分析（比如觉得手表估算值不可信）。相关字段已从这份数据里去掉：这不是缺数据，不要据此推断，也不要追问用户补这些数据。";

/// 去掉被排除的指标；去掉了东西就在顶层写明 `excludedByUser`。
pub fn apply_exclusions(value: &mut serde_json::Value, excluded: &[String]) {
    if strip_excluded_metrics(value, excluded) {
        if let Some(object) = value.as_object_mut() {
            object.insert(
                "excludedByUser".to_string(),
                serde_json::json!({ "metrics": excluded, "note": EXCLUSION_NOTE }),
            );
        }
    }
}
