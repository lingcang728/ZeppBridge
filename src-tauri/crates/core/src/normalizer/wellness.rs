//! 健康事件（wellness）与体重的归一化（从 normalizer/mod.rs 拆出）。

use super::*;

/// What one wellness raw response yields once parsed.
///
/// Unrecognised streams return empty vectors and a diagnostic rather than an
/// error: the raw response has to survive so its shape can be verified later.
#[derive(Debug, Clone, Default)]
pub struct WellnessNormalizedData {
    pub food_entries: Vec<FoodEntry>,
    pub daily_metrics: Vec<DailyMetric>,
    pub metric_samples: Vec<MetricSample>,
    pub diagnostics: Vec<String>,
}

impl Normalizer {
    /// Parse one optional wellness stream.
    ///
    /// The stream is identified by its source key (`wellness:{label}:…`) rather
    /// than sniffed from the payload, because several of these share an
    /// envelope shape while meaning entirely different things.
    ///
    /// Established shapes are parsed here; blood pressure additionally accepts
    /// explicit numeric aliases from public clients, marked experimental.
    /// Stress
    /// (`Charge/stress_data`) is deliberately absent: its payload is a
    /// protobuf whose float fields do not match the ranges the Zepp app shows,
    /// so mapping it would be a guess. The raw response is retained, and
    /// everything the app actually needs — the daily roll-up *and* the whole
    /// 24-hour curve — comes out of `all_day_stress` instead.
    pub fn normalize_wellness(source_key: &str, raw: &Value) -> WellnessNormalizedData {
        let label = source_key.split(':').nth(1).unwrap_or_default();
        let mut out = WellnessNormalizedData::default();
        // Match the envelopes counted by endpoint diagnostics. The connector
        // preserves the response, so `data.items` is not unwrapped upstream.
        let Some(items) = raw.as_array().or_else(|| {
            raw.get("items")
                .and_then(Value::as_array)
                .or_else(|| raw.get("data").and_then(Value::as_array))
                .or_else(|| raw.get("data")?.get("items")?.as_array())
        }) else {
            out.diagnostics
                .push(format!("{label}: 报文没有 items 数组"));
            return out;
        };
        match label {
            "blood_pressure" => blood_pressure_samples(items, &mut out),
            "lactate_threshold" => lactate_threshold_metrics(items, &mut out),
            "respiratory_rate" => respiratory_rate_metrics(items, &mut out),
            "hrv_rmssd" => hrv_rmssd_samples(items, &mut out),
            "spo2" | "spo2_auto" => spo2_samples(items, &mut out),
            "pai" => pai_metrics(items, &mut out),
            "all_day_stress" => all_day_stress_metrics(items, &mut out),
            "food" => food_metrics(items, &mut out),
            other => out
                .diagnostics
                .push(format!("{other}: 结构尚未验证，仅保留原始报文")),
        }
        out
    }
}

/// Everything one weigh-in can carry.
///
/// The first three are confirmed against a live account (2026-09-04); the rest
/// are accepted on sight but gated by `range`. Adding a name here is cheap and
/// safe — the payload is retained either way, so a scale owner's records can be
/// replayed once their real field names are known.
pub(super) const BODY_METRICS: [BodyMetric; 11] = [
    // Confirmed: `summary.weight`, kilograms, a plain float.
    BodyMetric {
        metric: "weight",
        aliases: &["weight"],
        unit: "kg",
        range: (2.0, 400.0),
    },
    // Confirmed: `summary.bmi`.
    BodyMetric {
        metric: "bmi",
        aliases: &["bmi"],
        unit: "kg/m2",
        range: (5.0, 100.0),
    },
    // Confirmed: `summary.height`, centimetres. Not a measurement of the day —
    // it is profile data echoed back — but it is what makes a weight readable,
    // and this is the only place an export can get it from.
    BodyMetric {
        metric: "height",
        aliases: &["height"],
        unit: "cm",
        range: (50.0, 260.0),
    },
    BodyMetric {
        metric: "body_fat_rate",
        aliases: &["fatRate", "bodyFatRate", "fat_rate", "bodyFat"],
        unit: "%",
        range: (2.0, 75.0),
    },
    BodyMetric {
        metric: "body_water_rate",
        aliases: &["bodyWaterRate", "waterRate", "moisture"],
        unit: "%",
        range: (20.0, 80.0),
    },
    BodyMetric {
        metric: "muscle_mass",
        aliases: &["muscleMass", "muscle"],
        unit: "kg",
        range: (5.0, 120.0),
    },
    BodyMetric {
        metric: "bone_mass",
        aliases: &["boneMass", "bone"],
        unit: "kg",
        range: (0.3, 12.0),
    },
    BodyMetric {
        metric: "protein_rate",
        aliases: &["proteinRate", "protein"],
        unit: "%",
        range: (5.0, 40.0),
    },
    // A grade, not a percentage: the Zepp app shows 1..30.
    BodyMetric {
        metric: "visceral_fat",
        aliases: &["visceralFat", "visceralFatGrade", "viscera"],
        unit: "grade",
        range: (1.0, 60.0),
    },
    BodyMetric {
        metric: "bmr",
        aliases: &["bmr", "basalMetabolism", "metabolism"],
        unit: "kcal/day",
        range: (500.0, 5000.0),
    },
    // Confirmed present on one record: `summary.bodyBalanceScore`, 0..100.
    BodyMetric {
        metric: "body_balance_score",
        aliases: &["bodyBalanceScore"],
        unit: "score",
        range: (0.0, 100.0),
    },
];

/// Fields in `summary` that are context rather than readings.
///
/// They are excluded from the "not parsed yet" diagnostic below — otherwise the
/// one line that exists to surface a scale's real field names gets buried under
/// the names we already understand.
pub(super) const WEIGHT_FIELDS_NOT_METRICS: [&str; 12] = [
    "age",
    "bodyStyle",
    "dataSourceType",
    "deviceSn",
    "deviceType",
    // The scale's raw input, encrypted. See the note on `normalize_weight`.
    "encryptImpedance",
    "oneFootMeasureTime",
    "source",
    "syncHealth",
    "syncHealthConnect",
    "thirdPackage",
    "timeZone",
];

impl Normalizer {
    /// Weight and body composition from `/users/{id}/members/-1/weightRecords`.
    ///
    /// Written to `metric_samples`, not `daily_metrics`: a weigh-in has a real
    /// timestamp and people weigh themselves more than once a day. Rolling them
    /// into one number per date would throw away the morning/evening spread that
    /// is most of what a weight chart is for, and the storage layer already
    /// aggregates samples per local day when a chart asks it to.
    ///
    /// Shape, verified on a live account 2026-09-04:
    ///
    /// ```json
    /// { "items": [ { "generatedTime": 1764743530, "createTime": 1764743529,
    ///                "weightType": 1, "memberId": "-1", "deviceSource": -1,
    ///                "summary": { "weight": 68.2, "bmi": 22.1, "height": 175.0,
    ///                             "timeZone": "Asia/Shanghai", "age": 19 } } ] }
    /// ```
    ///
    /// `summary` is not a fixed shape. Across four records on one account it
    /// varied between ten and eleven keys, with `bodyStyle`, `bodyBalanceScore`,
    /// `oneFootMeasureTime`, `encryptImpedance`, `age`, `deviceSn` and
    /// `thirdPackage` each present on some and absent on others — and `timeZone`
    /// appearing as `"Asia/Shanghai"`, `"GMT+08:00"` and `"28800000"` on three
    /// different records of the same account. So every field is read as
    /// optional, and the timestamp is taken from `generatedTime` rather than
    /// reconstructed out of that zone soup.
    ///
    /// `encryptImpedance` is deliberately ignored. Body composition is derived
    /// from impedance by the vendor's own model; deriving our own numbers from
    /// it would be inventing health readings, not reading them.
    pub fn normalize_weight(raw: &Value) -> WellnessNormalizedData {
        let mut out = WellnessNormalizedData::default();
        let Some(items) = raw.get("items").and_then(Value::as_array) else {
            out.diagnostics.push("weight: 报文没有 items 数组".into());
            return out;
        };
        let mut unknown: BTreeMap<String, usize> = BTreeMap::new();
        let mut family_members_skipped = 0usize;
        for item in items {
            let Some(object) = item.as_object() else {
                continue;
            };
            // 家庭秤上每个成员一条时间线。本人是 `memberId: "-1"`，家人是各自的
            // 正数 id。2026-11 一位用户给自己和儿子各建了档案，导入后同一条体重
            // 线上一天 75 kg、第二天 23 kg——请求路径里的 `-1` 并不保证只回本人。
            // 带着别人的 id 的记录一定不是本人，跳过；没有这个字段的（官方通道
            // 按用户授权，本来就只有本人）照常读。
            if !is_account_holder(object.get("memberId")) {
                family_members_skipped += 1;
                continue;
            }
            // Unix **seconds**, not milliseconds. This endpoint differs from
            // every event surface, and the shared `parse_timestamp` would read a
            // millisecond value as a date fifty thousand years from now.
            //
            // `timeZone` 在同一账号上是 IANA / GMT+08:00 / 毫秒偏移的杂烩，
            // 不能拿它改写这个绝对时刻。日历日只在切日时用可解析的偏移。
            let Some(timestamp) = first_number(object, &["generatedTime", "createTime", "time"])
                .filter(|value| value.is_finite() && *value > 0.0)
                .and_then(|seconds| DateTime::from_timestamp(seconds as i64, 0))
            else {
                out.diagnostics
                    .push("weight: 一条记录没有可用的时间戳".into());
                continue;
            };
            if !timestamp_not_unreasonably_future(timestamp) {
                out.diagnostics
                    .push("weight: 一条记录的时间戳超出合理范围，已忽略".into());
                continue;
            };
            let Some(summary) = object.get("summary").and_then(Value::as_object) else {
                out.diagnostics.push("weight: 一条记录没有 summary".into());
                continue;
            };
            let mut matched: Vec<&str> = Vec::new();
            for spec in &BODY_METRICS {
                for alias in spec.aliases {
                    if summary.contains_key(*alias) {
                        matched.push(alias);
                    }
                }
                let Some(value) = first_number(summary, spec.aliases) else {
                    continue;
                };
                if !value.is_finite() || value < spec.range.0 || value > spec.range.1 {
                    // The name matched but the number cannot mean what the name
                    // says. Report it so the real meaning can be found later;
                    // do not chart it.
                    out.diagnostics.push(format!(
                        "weight: {} 的读数 {value} 不在 {:?} 内，已忽略",
                        spec.metric, spec.range
                    ));
                    continue;
                }
                out.metric_samples.push(MetricSample {
                    metric: spec.metric.to_string(),
                    timestamp,
                    value,
                    unit: spec.unit.to_string(),
                    source_scope: SourceScope::UserFused,
                    device_id: None,
                });
            }
            // Names we do not read yet, counted rather than listed per record so
            // a five-year backfill cannot turn this into thousands of lines.
            // This is how a scale owner's real field names reach us without
            // asking them to run anything.
            for key in summary.keys() {
                if matched.contains(&key.as_str())
                    || WEIGHT_FIELDS_NOT_METRICS.contains(&key.as_str())
                {
                    continue;
                }
                *unknown.entry(key.clone()).or_default() += 1;
            }
        }
        if family_members_skipped > 0 {
            out.diagnostics.push(format!(
                "weight: 跳过 {family_members_skipped} 条家庭成员的记录（只读本人）"
            ));
        }
        if !unknown.is_empty() {
            let listed = unknown
                .iter()
                .map(|(name, count)| format!("{name}x{count}"))
                .collect::<Vec<_>>()
                .join(", ");
            out.diagnostics
                .push(format!("weight: summary 里尚未解析的字段：{listed}"));
        }
        out
    }
}

/// 家庭秤记录是不是账号本人的。本人是 `"-1"`（也接受数字 -1）；没有这个字段
/// 的报文（官方通道、旧样本）只可能是本人。其余任何值都是家人。
fn is_account_holder(member_id: Option<&Value>) -> bool {
    match member_id {
        None | Some(Value::Null) => true,
        Some(Value::String(id)) => id.trim() == "-1" || id.trim().is_empty(),
        Some(Value::Number(id)) => id.as_i64() == Some(-1),
        Some(_) => false,
    }
}
