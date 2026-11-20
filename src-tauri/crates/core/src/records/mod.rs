//! 读记录的统一入口：`query_records(types, from, to, since)`。
//!
//! CLI 的 `export --format json`、本机 REST 的 `/v1/records`、同步后的推送三处都走这里，
//! 所以「取哪些数、单位、缺失值、来源」只在一处定义，三个出口不会各自漂移。
//!
//! 实现上它**不另写一套 SQL**：记录本身仍由 `Database::build_ai_export_value` 生成
//! （交给 AI 的导出、MCP 也用它），这里只在结果上补三样东西：
//!
//! 1. 顶层 `records_version`，给拉取方判断契约版本；
//! 2. 每条记录的 `source`：`official`（Zepp 官方开放平台）或 `advanced`（账号连接器，
//!    也就是旧通道）。同一天同一指标两边都有读数、被折成一条时是 `mixed`；用户自己写的
//!    日历上下文是 `user`。来源读的是各表的 `provider` 列，不是猜的；
//! 3. 可选的 `since`：只留下源报文在那之后从云端拿到过的记录。
//!
//! 输出是原导出的超集：老字段一个没少、含义不变，CLI 的老调用方（PA 组件）照样能读。
//!
//! GPS：`include_gps = false` 时去掉运动的 `route`。逐点采样里本来就没有坐标。

use crate::models::error::{Result, ZeppBridgeError};
use crate::models::{ExportDetail, ExportScope, ExportSelection};
use crate::storage::{Database, EXPORT_DATA_TYPES};
use chrono::{DateTime, Duration as ChronoDuration, NaiveDate, Utc};
use serde_json::Value;
use std::collections::HashMap;

#[cfg(test)]
mod tests;

/// 记录契约的版本。字段只增不改；改了含义就换一个新版本号。
pub const RECORDS_VERSION: &str = "zeppbridge.records.v2";

/// 拉取方关心的六类数据，以及它们对应的导出类型名。
///
/// REST 的 `types` 参数既认这里的短名，也认导出类型的原名（见 [`expand_types`]）。
pub const RECORD_TYPE_ALIASES: [(&str, &[&str]); 6] = [
    ("sleep", &["sleep"]),
    ("heart_rate", &["heart_rate"]),
    ("hrv", &["hrv", "hrv_rmssd"]),
    ("activity", &["daily_activity", "steps"]),
    ("workouts", &["workouts"]),
    ("weight", &["weight"]),
];

/// `types` 留空时 REST 默认取的类型：就是上面六类。
pub const DEFAULT_RECORD_TYPES: [&str; 6] = [
    "sleep",
    "heart_rate",
    "hrv",
    "activity",
    "workouts",
    "weight",
];

/// 一次读记录的请求。
#[derive(Debug, Clone)]
pub struct RecordQuery {
    /// 导出类型名（已经展开别名）。
    pub types: Vec<String>,
    /// 日期区间（本地日，含两端）或单条运动。
    pub scope: ExportScope,
    /// 只要源报文在这个时刻之后从云端拿到过的记录。`None` = 不过滤。
    pub since: Option<DateTime<Utc>>,
    pub detail: ExportDetail,
    /// 运动是否带 `route`（GPS 轨迹）。
    pub include_gps: bool,
}

impl RecordQuery {
    /// 日期区间的便捷构造：`query_records(types, from, to, since)` 的那四个参数。
    pub fn range(types: &[&str], from: &str, to: &str, since: Option<DateTime<Utc>>) -> Self {
        Self {
            types: types.iter().map(|value| value.to_string()).collect(),
            scope: ExportScope::DateRange {
                start: from.to_string(),
                end: to.to_string(),
            },
            since,
            detail: ExportDetail::Summary,
            include_gps: false,
        }
    }
}

/// 查询结果：完整的 JSON 树，以及其中的记录条数。
#[derive(Debug, Clone)]
pub struct RecordSet {
    pub value: Value,
    pub record_count: usize,
}

/// 把 REST 的类型参数展开成导出类型名。认不出来的原样返回在 `Err` 里。
pub fn expand_types<'a, I>(requested: I) -> std::result::Result<Vec<String>, Vec<String>>
where
    I: IntoIterator<Item = &'a str>,
{
    let mut out: Vec<String> = Vec::new();
    let mut unknown = Vec::new();
    for raw in requested {
        let name = raw.trim().to_ascii_lowercase();
        if name.is_empty() {
            continue;
        }
        let expanded: Vec<&str> = match RECORD_TYPE_ALIASES.iter().find(|(alias, _)| *alias == name)
        {
            Some((_, targets)) => targets.to_vec(),
            None if EXPORT_DATA_TYPES.contains(&name.as_str()) => vec![name.as_str()],
            None => {
                unknown.push(name);
                continue;
            }
        };
        for value in expanded {
            if !out.iter().any(|existing| existing == value) {
                out.push(value.to_string());
            }
        }
    }
    if unknown.is_empty() {
        Ok(out)
    } else {
        Err(unknown)
    }
}

/// 读记录。见模块注释。
pub fn query_records(db: &Database, query: &RecordQuery) -> Result<RecordSet> {
    let selection = ExportSelection {
        scope: Some(query.scope.clone()),
        start_date: None,
        end_date: None,
        data_types: query.types.clone(),
        detail: query.detail,
    };
    // Export rows and their source metadata must see the same version of the library.
    let snapshot = db
        .conn
        .is_autocommit()
        .then(|| db.conn.unchecked_transaction())
        .transpose()?;
    let (mut value, mut record_count) =
        db.build_records_export_value(&selection, query.since.is_some())?;
    let (start, end) = provenance_window(&value)?;
    let index = ProvenanceIndex::load(db, &start, &end, &value["data"], query.since.is_some())?;
    if let Some(snapshot) = snapshot {
        snapshot.commit()?;
    }
    let since = query.since;

    let Some(root) = value.as_object_mut() else {
        return Err(ZeppBridgeError::ParseError("导出结果不是 JSON 对象".into()));
    };
    root.insert(
        "records_version".into(),
        Value::String(RECORDS_VERSION.to_string()),
    );
    root.insert(
        "source_note".into(),
        Value::String(
            "source: official = Zepp Open Platform authorization; advanced = account connector; imported = local file import; mixed = one folded value combines multiple sources; user = calendar context written by the user."
                .into(),
        ),
    );
    if let Some(since) = since {
        root.insert("since".into(), Value::String(since.to_rfc3339()));
    }
    root.insert("gps_included".into(), Value::Bool(query.include_gps));

    let mut kept_total = 0usize;
    let mut kept_by_type = HashMap::new();
    if let Some(data) = root.get_mut("data").and_then(Value::as_object_mut) {
        for (key, list) in data.iter_mut() {
            let Some(items) = list.as_array_mut() else {
                continue;
            };
            let kind = key.as_str();
            items.retain_mut(|item| {
                let found = if kind == "metric_samples" {
                    let changed_at = item
                        .as_object_mut()
                        .and_then(|item| item.remove("_sample_fetched_at"))
                        .and_then(|value| value.as_str().map(str::to_string));
                    let source = match item.get("source").and_then(Value::as_str) {
                        Some("official") => "official",
                        Some("mixed") => "mixed",
                        Some("imported") => "imported",
                        _ => "advanced",
                    };
                    Provenance { source, changed_at }
                } else {
                    index.lookup(kind, item)
                };
                if let Some(object) = item.as_object_mut() {
                    object.insert("source".into(), Value::String(found.source.to_string()));
                    if kind == "workouts" && !query.include_gps {
                        object.remove("route");
                    }
                }
                let keep = match since {
                    // 用户写的日历上下文不来自云端，没有「拿到时刻」可比，一律保留。
                    Some(since) if found.source != "user" => {
                        found.changed_at.as_deref().is_some_and(|changed| {
                            // 认不出的时刻宁可多给，不能让一条记录悄悄消失。
                            DateTime::parse_from_rfc3339(changed)
                                .map_or(true, |changed| changed.with_timezone(&Utc) >= since)
                        })
                    }
                    _ => true,
                };
                if since.is_some() {
                    let category = item
                        .as_object_mut()
                        .and_then(|object| object.remove("_export_type"))
                        .and_then(|value| value.as_str().map(str::to_owned))
                        .or_else(|| match kind {
                            "sleep_sessions" => Some("sleep".into()),
                            "workouts" | "life_events" => Some(kind.into()),
                            _ => None,
                        });
                    if let Some(category) = category.filter(|_| keep) {
                        *kept_by_type.entry(category).or_insert(0usize) += 1;
                    }
                }
                keep
            });
            kept_total += items.len();
        }
    }
    if since.is_some() {
        record_count = kept_total;
        root.insert("record_count".into(), Value::from(record_count));
        if let Some(capabilities) = root.get_mut("capabilities").and_then(Value::as_object_mut) {
            for (category, entry) in capabilities {
                if entry.get("rows_in_export").is_some() {
                    entry["rows_in_export"] =
                        Value::from(kept_by_type.get(category).copied().unwrap_or_default());
                }
            }
        }
    }
    Ok(RecordSet {
        value,
        record_count,
    })
}

/// 摊平后的一条记录：REST 分页用。
#[derive(Debug, Clone)]
pub struct FlatRecord {
    pub record_type: &'static str,
    pub value: Value,
}

/// `data` 下各数组按固定顺序摊平成一列，每条补上 `record_type`。
pub fn flatten(set: &RecordSet) -> Vec<FlatRecord> {
    const ORDER: [(&str, &str); 5] = [
        ("sleep_sessions", "sleep_session"),
        ("workouts", "workout"),
        ("daily_metrics", "daily_metric"),
        ("metric_samples", "metric_sample"),
        ("life_events", "life_event"),
    ];
    let mut out = Vec::new();
    let Some(data) = set.value.get("data").and_then(Value::as_object) else {
        return out;
    };
    for (key, record_type) in ORDER {
        let Some(items) = data.get(key).and_then(Value::as_array) else {
            continue;
        };
        for item in items {
            let mut value = item.clone();
            if let Some(object) = value.as_object_mut() {
                object.insert("record_type".into(), Value::String(record_type.into()));
            }
            out.push(FlatRecord { record_type, value });
        }
    }
    out
}

/// 记录的来源与最近一次从云端拿到它的时刻。
#[derive(Debug, Clone, Default, PartialEq, Eq)]
struct Provenance {
    source: &'static str,
    changed_at: Option<String>,
}

#[derive(Debug, Default)]
pub(crate) struct ProviderFlags {
    official: bool,
    legacy: bool,
    imported: bool,
    changed_at: Option<String>,
}

impl ProviderFlags {
    pub(crate) fn add(&mut self, provider: &str, fetched_at: Option<String>) {
        if provider == crate::official::fetch::PROVIDER {
            self.official = true;
        } else if provider == "imported" {
            self.imported = true;
        } else {
            self.legacy = true;
        }
        if let Some(fetched_at) = fetched_at {
            if self
                .changed_at
                .as_deref()
                .is_none_or(|known| fetched_at.as_str() > known)
            {
                self.changed_at = Some(fetched_at);
            }
        }
    }

    pub(crate) fn annotate_sample(&self, sample: &mut Value) {
        let provenance = self.resolve();
        sample["source"] = Value::from(provenance.source);
        if let Some(fetched_at) = provenance.changed_at {
            sample["_sample_fetched_at"] = Value::from(fetched_at);
        }
    }

    fn resolve(&self) -> Provenance {
        let source = match (self.official, self.legacy, self.imported) {
            (true, false, false) => "official",
            (false, false, true) => "imported",
            (true, _, _) | (_, true, true) => "mixed",
            _ => "advanced",
        };
        Provenance {
            source,
            changed_at: self.changed_at.clone(),
        }
    }
}

/// 一次查询范围内各表的 `provider` 与报文拿到时刻。
///
/// 和导出分开读，是因为导出构建器不输出这两列；这里只读键和来源，不读值。
#[derive(Debug, Default)]
struct ProvenanceIndex {
    sleep: HashMap<String, ProviderFlags>,
    workouts: HashMap<String, ProviderFlags>,
    daily: HashMap<(String, String), ProviderFlags>,
}

impl ProvenanceIndex {
    fn load(db: &Database, start: &str, end: &str, data: &Value, with_times: bool) -> Result<Self> {
        let mut index = Self::default();
        // 边界放宽一天：导出按本地日取，这里按 UTC 字符串比，多读一点只是多几条用不上的键。
        let (lower, upper) = widened_utc_bounds(start, end)?;
        let fetched = if with_times { "r.fetched_at" } else { "NULL" };

        let has = |key: &str| data[key].as_array().is_some_and(|items| !items.is_empty());
        if has("sleep_sessions") {
            let mut stmt = db.conn.prepare(&format!(
                "SELECT s.sleep_id, CASE WHEN s.import_batch_id IS NOT NULL THEN 'imported' ELSE s.provider END, {fetched}
             FROM sleep_sessions s LEFT JOIN raw_records r ON r.id = s.raw_record_id
             WHERE s.start_time >= ?1 AND s.start_time < ?2"
            ))?;
            for row in stmt.query_map([&lower, &upper], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<String>>(2)?,
                ))
            })? {
                let (id, provider, at) = row?;
                index.sleep.entry(id).or_default().add(&provider, at);
            }
        }
        if has("workouts") {
            // 运动的明细（逐秒、轨迹）另有一份报文，晚到的明细也算「这条运动变了」。
            let detail = if with_times {
                "(SELECT MAX(d.fetched_at) FROM raw_records d
               WHERE d.stream = 'workout_detail'
                 AND (d.source_key = 'official:sport_detail:' || w.workout_id
                      OR (d.source_key >= 'workout_detail:' || w.workout_id || ':'
                          AND d.source_key < 'workout_detail:' || w.workout_id || ';')))"
            } else {
                "NULL"
            };
            let mut stmt = db.conn.prepare(&format!(
                "SELECT w.workout_id, CASE WHEN i.workout_id IS NOT NULL THEN 'imported' ELSE w.provider END, {fetched}, {detail}
             FROM workouts w LEFT JOIN raw_records r ON r.id = w.raw_record_id
             LEFT JOIN workout_imports i ON i.workout_id = w.workout_id
             WHERE w.start_time >= ?1 AND w.start_time < ?2"
            ))?;
            for row in stmt.query_map([&lower, &upper], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, Option<String>>(3)?,
                ))
            })? {
                let (id, provider, at, detail_at) = row?;
                let entry = index.workouts.entry(id).or_default();
                entry.add(&provider, at);
                entry.add(&provider, detail_at);
            }
        }
        if has("daily_metrics") {
            let mut stmt = db.conn.prepare(&format!(
                "SELECT d.date, d.metric, CASE WHEN d.import_batch_id IS NOT NULL THEN 'imported' ELSE d.provider END, {fetched}
             FROM daily_metrics d LEFT JOIN raw_records r ON r.id = d.raw_record_id
             WHERE d.date BETWEEN ?1 AND ?2"
            ))?;
            for row in stmt.query_map([start, end], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, Option<String>>(3)?,
                ))
            })? {
                let (date, metric, provider, at) = row?;
                index
                    .daily
                    .entry((date, metric))
                    .or_default()
                    .add(&provider, at);
            }
        }
        Ok(index)
    }

    fn lookup(&self, kind: &str, item: &Value) -> Provenance {
        let text = |key: &str| item.get(key).and_then(Value::as_str).map(str::to_string);
        let found = match kind {
            "sleep_sessions" => text("sleep_id").and_then(|id| self.sleep.get(&id)),
            "workouts" => text("workout_id").and_then(|id| self.workouts.get(&id)),
            "daily_metrics" => match (text("date"), text("metric")) {
                (Some(date), Some(metric)) => self.daily.get(&(date, metric)),
                _ => None,
            },
            "life_events" => {
                return Provenance {
                    source: "user",
                    changed_at: None,
                }
            }
            _ => None,
        };
        found.map(ProviderFlags::resolve).unwrap_or(Provenance {
            source: "advanced",
            changed_at: None,
        })
    }
}

/// 从导出结果里读回实际的日期区间（单条运动时是那条运动所在的日子）。
fn provenance_window(value: &Value) -> Result<(String, String)> {
    let range = value.get("date_range");
    let pick = |key: &str| {
        range
            .and_then(|range| range.get(key))
            .and_then(Value::as_str)
            .map(str::to_string)
    };
    match (pick("start"), pick("end")) {
        (Some(start), Some(end)) => Ok((start, end)),
        _ => Err(ZeppBridgeError::ParseError("导出结果缺少日期区间".into())),
    }
}

fn widened_utc_bounds(start: &str, end: &str) -> Result<(String, String)> {
    let parse = |value: &str| {
        NaiveDate::parse_from_str(value, "%Y-%m-%d")
            .map_err(|_| ZeppBridgeError::ConfigError("日期无效".into()))
    };
    let lower = parse(start)? - ChronoDuration::days(1);
    let upper = parse(end)? + ChronoDuration::days(2);
    Ok((
        format!("{}T00:00:00+00:00", lower.format("%Y-%m-%d")),
        format!("{}T00:00:00+00:00", upper.format("%Y-%m-%d")),
    ))
}
