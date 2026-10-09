//! 交给 AI 的导出：共享类型、设备标签与辅助查询（从 storage/mod.rs 按领域拆出，逻辑不变）。

mod build;

use super::*;

/// Metrics dense enough that a month of them dwarfs everything else in an
/// export. In `Summary` detail these collapse to one row per hour; sparse
/// streams such as HRV keep their exact sample times, which is the whole point
/// of measuring them.
pub(in crate::storage) const HOURLY_AGGREGATED_METRICS: [&str; 3] =
    ["heart_rate", "spo2", "stress"];

/// 日级导出类型：一条运动没有「昨晚睡了多久」「当天走了几步」这种字段，
/// 单条运动范围下这些类型不该出现。`build_ai_export` / `estimate_ai_export`
/// 与样本指标名展开共用同一张表——曾在函数里各写一份的版本会长歪。
pub(in crate::storage) const EXPORT_DAY_LEVEL_TYPES: [&str; 10] = [
    "sleep",
    "steps",
    "daily_activity",
    "recovery",
    "training_load",
    "vo2max",
    "lactate_threshold",
    "pai",
    "weight",
    "food",
];

/// Export types whose raw payloads are fetched but whose field-by-field
/// normalization has not been verified against a real response yet.
///
/// These need their own status. Reporting `empty_in_range` would say "the
/// stream is wired, you simply have no data", and for these that is false —
/// the data is on disk as a retained raw response, only the parse is pending.
/// Each entry maps an export type to the `wellness` source-key labels that
/// carry its raw payloads.
pub(in crate::storage) const RAW_PENDING_STREAMS: [(&str, &[&str]); 6] = [
    ("spo2", &["spo2", "spo2_auto", "spo2_odi"]),
    ("stress", &["stress"]),
    ("respiratory_rate", &["respiratory_rate"]),
    ("hrv_rmssd", &["hrv_rmssd"]),
    ("pai", &["pai"]),
    ("lactate_threshold", &["lactate_threshold"]),
];

#[derive(Debug, Clone, Default)]
pub(in crate::storage) struct ExportDeviceProfile {
    pub(in crate::storage) model: Option<String>,
    pub(in crate::storage) kind: Option<String>,
}

/// Per-export device aliasing. Labels are positional (`device_1`, `device_2`)
/// and carry no identifying information, so they survive the AI-handoff
/// redaction pass that strips serials and device ids.
#[derive(Debug, Default)]
pub(in crate::storage) struct ExportDevices {
    pub(in crate::storage) label_by_alias: BTreeMap<String, String>,
    pub(in crate::storage) profiles: BTreeMap<String, ExportDeviceProfile>,
}

impl ExportDevices {
    pub(in crate::storage) fn label(&self, device_id: Option<&str>) -> Option<String> {
        device_id.and_then(|alias| self.label_by_alias.get(alias).cloned())
    }
}

/// One hour of a dense metric, reduced to the shape a reader can actually use.
#[derive(Debug)]
pub(in crate::storage) struct HourBucket {
    pub(in crate::storage) selected_type: String,
    pub(in crate::storage) unit: String,
    pub(in crate::storage) source_scope: String,
    pub(in crate::storage) device_label: Option<String>,
    pub(in crate::storage) min: f64,
    pub(in crate::storage) max: f64,
    pub(in crate::storage) sum: f64,
    pub(in crate::storage) count: usize,
}

impl HourBucket {
    pub(in crate::storage) fn new(
        selected_type: String,
        unit: String,
        source_scope: String,
        device_label: Option<String>,
    ) -> Self {
        Self {
            selected_type,
            unit,
            source_scope,
            device_label,
            min: f64::INFINITY,
            max: f64::NEG_INFINITY,
            sum: 0.0,
            count: 0,
        }
    }

    pub(in crate::storage) fn push(&mut self, value: f64) {
        self.min = self.min.min(value);
        self.max = self.max.max(value);
        self.sum += value;
        self.count += 1;
    }

    pub(in crate::storage) fn render(&self, metric: &str, hour: &str) -> serde_json::Value {
        let average = if self.count == 0 {
            None
        } else {
            Some((self.sum / self.count as f64 * 10.0).round() / 10.0)
        };
        serde_json::json!({
            "metric": metric,
            "hour": hour,
            "min": self.count.gt(&0).then_some(self.min),
            "avg": average,
            "max": self.count.gt(&0).then_some(self.max),
            "samples": self.count,
            "unit": self.unit,
            "source_scope": self.source_scope,
            "device_label": self.device_label,
        })
    }
}

/// All readings of one `(date, metric)` pair across sources.
///
/// Since account-level aggregates stopped being mislabelled as device data,
/// the same day's step count can arrive twice: once fused, once from the watch
/// that measured it. Picking one silently would hide a disagreement, so the
/// fused reading leads and anything that differs is kept beside it.
#[derive(Debug)]
pub(in crate::storage) struct DailyMetricGroup {
    pub(in crate::storage) date: String,
    pub(in crate::storage) metric: String,
    pub(in crate::storage) selected_type: String,
    pub(in crate::storage) readings: Vec<(f64, String, String, Option<String>)>,
}

impl DailyMetricGroup {
    pub(in crate::storage) fn new(date: String, metric: String, selected_type: &str) -> Self {
        Self {
            date,
            metric,
            selected_type: selected_type.to_string(),
            readings: Vec::new(),
        }
    }

    pub(in crate::storage) fn push(
        &mut self,
        value: f64,
        unit: String,
        source_scope: String,
        device_label: Option<String>,
    ) {
        self.readings
            .push((value, unit, source_scope, device_label));
    }

    pub(in crate::storage) fn render(&self) -> serde_json::Value {
        // user_fused is the account's own reconciliation of its devices, so it
        // leads when present; otherwise the first reading in query order does.
        let primary_index = self
            .readings
            .iter()
            .position(|(_, _, scope, _)| scope == "user_fused")
            .unwrap_or(0);
        let Some((value, unit, source_scope, device_label)) = self.readings.get(primary_index)
        else {
            return serde_json::Value::Null;
        };
        let alternates = self
            .readings
            .iter()
            .enumerate()
            .filter(|(index, (other, _, _, _))| {
                *index != primary_index && (other - value).abs() > f64::EPSILON
            })
            .map(|(_, (other, _, scope, label))| {
                serde_json::json!({
                    "value": other,
                    "source_scope": scope,
                    "device_label": label,
                })
            })
            .collect::<Vec<_>>();
        let mut record = serde_json::json!({
            "date": self.date,
            "metric": self.metric,
            "value": value,
            "unit": unit,
            "source_scope": source_scope,
            "device_label": device_label,
        });
        if !alternates.is_empty() {
            if let Some(object) = record.as_object_mut() {
                object.insert("alternates".into(), serde_json::Value::Array(alternates));
            }
        }
        record
    }
}

/// 把「本地日期区间」换成一对可以直接比字符串的 UTC 时间戳边界。
///
/// `metric_samples.timestamp` 存的是 RFC3339 UTC（统一以 `+00:00` 结尾），所以
/// 字典序就是时间序。问题出在过滤条件上：`date(timestamp,'localtime')` 是个函数
/// 调用，SQLite 没法拿它去索引里做区间定位，只能把这个 metric 的**全部**采样扫
/// 一遍——一年的心率就是二十多万行，只为了挑出七天。
///
/// 加一层宽松的时间戳边界，索引就能先把范围缩到几天（实测心率 7 天 92ms → 5ms）。
/// 边界各放宽一天，覆盖任何时区偏移（-12..+14 小时），所以它只负责「少扫一点」，
/// 不改变结果：真正决定哪一天算哪一天的，仍然是后面那个 `date(...,'localtime')`。
///
/// `pub(crate)`：ai_tasks 的逐日窗口查询同样要这个宽限边界来走时间索引。
pub(crate) fn local_day_range_utc_bounds(start: &str, end: &str) -> Option<(String, String)> {
    let start = NaiveDate::parse_from_str(start, "%Y-%m-%d").ok()?;
    let end = NaiveDate::parse_from_str(end, "%Y-%m-%d").ok()?;
    // 用检查溢出的加减：日期贴着 NaiveDate::MIN / MAX 时直接算不出界，交给调用方兜底，
    // 而不是在这里 panic。
    let lower = start
        .checked_sub_signed(Duration::days(1))?
        .format("%Y-%m-%dT00:00:00")
        .to_string();
    let upper = end
        .checked_add_signed(Duration::days(2))?
        .format("%Y-%m-%dT00:00:00")
        .to_string();
    Some((lower, upper))
}

/// `local_day_range_utc_bounds` 的调用方兜底：这些地方的日期早已按
/// NaiveDate 验证过，界算不出来只可能是程序内部错误——但即便如此也不能
/// 让查询缩成空集。退回一个什么都挡不住的界，精修谓词继续兜底，
/// 代价只是退回全表扫而不是悄悄少给数据。
pub(in crate::storage) fn utc_bounds_or_unbounded(start: &str, end: &str) -> (String, String) {
    local_day_range_utc_bounds(start, end)
        .unwrap_or_else(|| ("0000-01-01".to_string(), "9999-12-31".to_string()))
}

/// 存储时间戳 → 本机日历日，与 SQLite `date(x, 'localtime')` 同一条规则。
/// 解析不出的行返回 None——以前这类行会被 date() 折成 NULL 而不参与
/// MIN/MAX，这里是同一语义。
pub(in crate::storage) fn local_day_of_stored(value: &str) -> Option<String> {
    DateTime::parse_from_rfc3339(value)
        .ok()
        .map(|dt| dt.with_timezone(&Local).format("%Y-%m-%d").to_string())
}

/// 勾选的导出类型 → 这条 `metric_samples` 记到哪个类型下。
///
/// 类型是用户的词（"spo2"），库里的指标名是手表的词（"spo2_apnea_low"）。
/// 这张映射服务两个方向：导出时给每条样本归型，以及反向把选中类型展开
/// 成 `metric IN (...)`，让样本查询走 (metric, timestamp) 索引。
pub(in crate::storage) fn export_sample_matched_type(
    metric: &str,
    selected: &BTreeSet<String>,
) -> Option<String> {
    if selected.contains(metric) {
        Some(metric.to_string())
    } else if metric.contains("spo2") && selected.contains("spo2") {
        Some("spo2".to_string())
    } else if metric.contains("stress") && selected.contains("stress") {
        Some("stress".to_string())
    } else if metric.starts_with("respiratory") && selected.contains("respiratory_rate") {
        Some("respiratory_rate".to_string())
    } else if metric == "hrv_rmssd" && selected.contains("hrv_rmssd") {
        Some("hrv_rmssd".to_string())
    } else if metric == "steps_hourly" && selected.contains("steps") {
        Some("steps".to_string())
    } else if selected.contains("weight") && BODY_COMPOSITION_METRICS.contains(&metric) {
        Some("weight".to_string())
    } else {
        None
    }
}

/// `build_ai_export` / `estimate_ai_export` 共用的 WHERE 尾巴。
///
/// `metric IN` 是让 uq_metric_sample_key（前导列 metric）生效的关键：
/// 之前 WHERE 只带时间界，metric 谓词缺位，每次导出都是全表扫。参数排在
/// IN 列表之后：单条运动取它的真实起止（运动可以跨过本地零点，右端
/// 用 `<=`），日期区间用 UTC 宽限界收敛、再以本地日谓词精修。
pub(in crate::storage) fn ai_export_samples_where_tail(
    metric_count: usize,
    single_workout: bool,
) -> String {
    debug_assert!(metric_count > 0);
    let in_list = (1..=metric_count)
        .map(|index| format!("?{index}"))
        .collect::<Vec<_>>()
        .join(", ");
    let lower = metric_count + 1;
    let upper = metric_count + 2;
    if single_workout {
        format!("metric IN ({in_list}) AND timestamp >= ?{lower} AND timestamp <= ?{upper}")
    } else {
        let day_start = metric_count + 3;
        let day_end = metric_count + 4;
        format!(
            "metric IN ({in_list})
               AND timestamp >= ?{lower} AND timestamp < ?{upper}
               AND date(timestamp, 'localtime') BETWEEN ?{day_start} AND ?{day_end}"
        )
    }
}

impl Database {
    /// Non-identifying device labels for one export.
    ///
    /// Zepp addresses one physical device by several aliases — the Helio Strap
    /// is `2445B138005129` in band summaries and `D85403FFFEE4D576` in
    /// readiness events — so aliases are folded onto a single label via
    /// `device_identities`. Only the catalog's canonical model name and kind
    /// leave the machine; the serial and the user's nickname for the device
    /// never do.
    pub(in crate::storage) fn export_devices(&self) -> Result<ExportDevices> {
        let mut stmt = self
            .conn
            .prepare("SELECT alias, name, serial, device_id FROM device_identities")?;
        let rows = stmt.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, Option<String>>(1)?,
                row.get::<_, Option<String>>(2)?,
                row.get::<_, Option<String>>(3)?,
            ))
        })?;
        let mut groups: BTreeMap<String, (BTreeSet<String>, Option<String>)> = BTreeMap::new();
        for row in rows {
            let (alias, name, serial, device_id) = row?;
            // The serial is the stable identity of a physical device: the
            // strap's rows share `2445B138005129` but differ in device_id
            // (`2445B138005129` vs `D85403FFFEE4D576`), so keying on both
            // would report one device twice.
            let key = serial
                .clone()
                .or_else(|| device_id.clone())
                .unwrap_or_else(|| alias.clone());
            let entry = groups.entry(key).or_default();
            entry.0.insert(alias);
            if let Some(serial) = serial {
                entry.0.insert(serial);
            }
            if let Some(device_id) = device_id {
                entry.0.insert(device_id);
            }
            if entry.1.is_none() {
                entry.1 = name;
            }
        }

        let mut devices = ExportDevices::default();
        for (index, (_, (aliases, name))) in groups.into_iter().enumerate() {
            let label = format!("device_{}", index + 1);
            // The stored name is the user's nickname, so it is only ever used
            // to look the product up in the bundled catalog.
            let matched = name.as_deref().and_then(|name| {
                crate::device_catalog::match_catalog(&crate::device_catalog::CatalogMatchInput {
                    device_names: vec![name],
                    display_name: Some(name),
                    ..Default::default()
                })
            });
            devices.profiles.insert(
                label.clone(),
                ExportDeviceProfile {
                    model: matched
                        .as_ref()
                        .map(|found| found.entry.canonical_name.clone()),
                    kind: matched.as_ref().map(|found| found.entry.kind.clone()),
                },
            );
            for alias in aliases {
                devices.label_by_alias.insert(alias, label.clone());
            }
        }
        Ok(devices)
    }

    /// Locally derived analysis that needs no extra network call.
    ///
    /// Everything here is computed from data already on disk and states its own
    /// basis, so a reader can tell a measurement from a derivation.
    pub(in crate::storage) fn export_analysis(
        &self,
        start_text: &str,
        end_text: &str,
        selected: &BTreeSet<String>,
        workout_id: Option<&str>,
    ) -> Result<serde_json::Map<String, serde_json::Value>> {
        let mut analysis = serde_json::Map::new();

        if selected.contains("workouts") {
            if let Some(zones) = self.heart_rate_zone_variants(start_text, end_text, workout_id)? {
                analysis.insert("heart_rate_zones".into(), zones);
            }
        }

        // 训练负荷平衡是一条 28 天的窗口统计。单条运动的导出说的是「这一条」，
        // 把四周的日负荷塞进去就又变成了用户没要的范围，所以这里直接不算。
        if workout_id.is_some() {
            return Ok(analysis);
        }

        if selected.contains("training_load") || selected.contains("recovery") {
            // Acute:chronic workload ratio. The chronic window reaches 27 days
            // before the export range, so the first day in range is already
            // backed by a full window instead of ramping up from zero.
            let Some(range_start) = NaiveDate::parse_from_str(start_text, "%Y-%m-%d").ok() else {
                return Ok(analysis);
            };
            let end_date = NaiveDate::parse_from_str(end_text, "%Y-%m-%d")
                .map_err(|_| ZeppBridgeError::ConfigError("导出结束日期无效".into()))?;
            // Same computation the training screen shows, so a chart and an
            // exported file can never quote different ratios for one day.
            let balance = self.training_load_balance(range_start, end_date)?;

            if !balance.is_empty() {
                analysis.insert(
                    "training_load_balance".into(),
                    serde_json::json!({
                        "source": "workouts.training_load",
                        "note": "按运动开始时间的本地日期汇总单次负荷；acute = 最近 7 天负荷之和；chronic = 最近 28 天之和；ratio = acute ÷ (chronic ÷ 4)。仅运动列表完整同步且每次负荷有效的完整本地日计入覆盖；确认无运动才为 0。7 天或 28 天窗口不完整时对应负荷为 null；仅两个窗口完整且慢性负荷大于 0 时给出 ratio。",
                        "days": balance,
                    }),
                );
            }
        }

        Ok(analysis)
    }

    /// 把勾选的导出类型展开成 `metric_samples` 里真实存在的指标名。
    ///
    /// `SELECT DISTINCT metric` 只走 uq_metric_sample_key 的前导列（覆盖
    /// 索引，行数等于指标名个数），换来主查询的 `metric IN (...)` ——这是
    /// 让导出不再全表扫 metric_samples 的那一步。归型判定与行循环共用
    /// `export_sample_matched_type`；`single_workout` 在这里就把日级类型的
    /// 指标名排除掉，行循环里无需再判一次。
    pub(in crate::storage) fn export_sample_metric_names(
        &self,
        selected: &BTreeSet<String>,
        single_workout: bool,
    ) -> Result<Vec<String>> {
        let mut stmt = self
            .conn
            .prepare("SELECT DISTINCT metric FROM metric_samples ORDER BY metric")?;
        let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
        let mut names = Vec::new();
        for row in rows {
            let metric = row?;
            let Some(matched) = export_sample_matched_type(&metric, selected) else {
                continue;
            };
            if single_workout && EXPORT_DAY_LEVEL_TYPES.contains(&matched.as_str()) {
                continue;
            }
            names.push(metric);
        }
        Ok(names)
    }
}
