//! 饮食记录：按餐的样本与按天的三大营养素（从 normalizer/mod.rs 拆出）。

use super::*;

/// 饮食记录：`/v2/users/me/events?eventType=Food`，没有 subType。
///
/// The day-bucket `value.samples[]` shape and its nutrient fields are documented
/// from a captured Zepp response at
/// https://github.com/lcanis/zepp-food-extractor/blob/main/docs/api-notes.md.
/// We still have no raw
/// response from the #103 reporter, so other regional or Health Connect shapes
/// remain unverified. Unknown fields are diagnosed and raw responses retained.
///
/// 写 `daily_metrics` 而不是 `metric_samples`：一天吃几餐，但有意义的是「今天
/// 摄入了多少」。逐餐的热量单独看不构成一条能和活动量对照的曲线，而
/// u/Vast_Snow_5216 要的正是「营养、恢复和活动量之间的相关性」。
/// 一个宏量营养素：指标名、可能的字段名、单位，以及一个真实读数只可能落在的
/// 区间。
///
/// 和体重那边一样，名字来自生态而不是我们见过的报文，所以每一项都要落在区间
/// 里才会被采用。一天摄入 40000 kcal 不是热量，是某个撞了名字的别的东西。
pub(super) struct Macro {
    pub(super) metric: &'static str,
    pub(super) names: &'static [&'static str],
    pub(super) unit: &'static str,
    pub(super) range: (f64, f64),
}

/// One body-composition metric: what to call it, which server field names have
/// been seen to carry it, its unit, and the range a real human reading falls in.
///
/// The range is not decoration. Only `weight`, `bmi` and `height` were read off
/// a live account — that account has no scale, so the fat / muscle / water
/// fields a scale adds were not there to look at, and their names come from the
/// wider Zepp ecosystem rather than from a response anyone here has seen.
/// Publishing a health reading under a guessed name is worse than publishing
/// nothing, so every unconfirmed field has to land inside a range only that
/// metric can occupy. A `fatRate` that comes back as 31.4 is a body-fat
/// percentage; one that comes back as 1980 is something else wearing the same
/// name, and it gets dropped and reported rather than charted.
pub(super) struct BodyMetric {
    pub(super) metric: &'static str,
    pub(super) aliases: &'static [&'static str],
    pub(super) unit: &'static str,
    pub(super) range: (f64, f64),
}

pub(super) fn food_metrics(items: &[Value], out: &mut WellnessNormalizedData) {
    const MACROS: [Macro; 4] = [
        Macro {
            metric: "intake_calories",
            names: &["calories", "calorie", "kcal", "energy"],
            unit: "kcal",
            range: (1.0, 20000.0),
        },
        Macro {
            metric: "intake_protein_g",
            names: &["protein", "proteins"],
            unit: "g",
            range: (0.0, 1000.0),
        },
        Macro {
            metric: "intake_fat_g",
            names: &["fatTotal", "fat", "fats"],
            unit: "g",
            range: (0.0, 1000.0),
        },
        Macro {
            metric: "intake_carbs_g",
            names: &["carbohydrate", "carbohydrates", "carbs"],
            unit: "g",
            range: (0.0, 2000.0),
        },
    ];

    // 按天累加：一天可能有好几条记录（早中晚各一条，或者一餐一条）。
    let mut per_day: BTreeMap<(String, &'static str), (f64, &'static str)> = BTreeMap::new();
    let mut unknown: BTreeMap<String, usize> = BTreeMap::new();

    for item in items {
        let Some(object) = item.as_object() else {
            continue;
        };
        let nested = object.get("value").and_then(Value::as_object);
        // Captured Food responses put meals under value.samples[]. Treat each
        // sample as a meal; the enclosing item is only a day bucket. Reading
        // both would double-count if the bucket later gains aggregate fields.
        let mut entries = Vec::new();
        if let Some((value, samples)) = nested.and_then(|value| {
            value
                .get("samples")
                .and_then(Value::as_array)
                .filter(|samples| !samples.is_empty())
                .map(|samples| (value, samples))
        }) {
            for sample in samples {
                let Some(meal) = sample.as_object() else {
                    continue;
                };
                if let Some(date) = food_sample_date(meal, object, value) {
                    entries.push((meal, None, date, true));
                } else {
                    out.diagnostics.push("food: 一餐记录没有可用的日期".into());
                }
            }
        } else if let Some(date) = summary_date(object, nested) {
            // Keep the earlier direct-item and value-level formats.
            entries.push((object, nested, date, false));
        } else {
            out.diagnostics.push("food: 一条记录没有可用的日期".into());
        }

        for (meal, value_object, date, is_sample) in entries {
            let text = |key: &str| {
                first_value_from(meal, value_object, &[key]).and_then(|value| match value {
                    Value::String(text) if !text.trim().is_empty() => Some(text.clone()),
                    Value::Number(number) => Some(number.to_string()),
                    _ => None,
                })
            };
            let mut detail = FoodEntry {
                date: date.clone(),
                food_log_id: text("foodLogId"),
                food_name: text("foodName"),
                food_text: text("foodText"),
                meal_type: text("mealType"),
                mealtime: first_value_from(meal, value_object, &["mealtime", "timestamp", "time"])
                    .and_then(parse_timestamp)
                    .map(|time| time.to_rfc3339()),
                measure_weight: first_number_from(meal, value_object, &["measureWeight"])
                    .filter(|weight| weight.is_finite() && *weight >= 0.0),
                nutrients: BTreeMap::new(),
            };
            let mut matched: Vec<&str> = Vec::new();
            for Macro {
                metric,
                names,
                unit,
                range,
            } in MACROS
            {
                for name in names {
                    if meal.contains_key(*name)
                        || value_object
                            .is_some_and(|inner: &Map<String, Value>| inner.contains_key(*name))
                    {
                        matched.push(name);
                    }
                }
                let Some(value) = first_number_from(meal, value_object, names) else {
                    continue;
                };
                if !value.is_finite() || value < range.0 || value > range.1 {
                    out.diagnostics.push(format!(
                        "food: {metric} 的读数 {value} 不在 {range:?} 内，已忽略"
                    ));
                    continue;
                }
                detail.nutrients.insert(metric.to_string(), value);
                let entry = per_day.entry((date.clone(), metric)).or_insert((0.0, unit));
                entry.0 += value;
            }
            if let Some(fiber) = first_number_from(meal, value_object, &["fiber"])
                .filter(|fiber| fiber.is_finite() && (0.0..=1000.0).contains(fiber))
            {
                detail.nutrients.insert("fiber_g".into(), fiber);
            }
            // A day aggregate alone must not be presented as an individual meal.
            if is_sample
                || detail.food_name.is_some()
                || detail.food_text.is_some()
                || detail.food_log_id.is_some()
            {
                out.food_entries.push(detail);
            }
            let ignored = if is_sample {
                &FOOD_SAMPLE_FIELDS_NOT_MACROS[..]
            } else {
                &FOOD_FIELDS_NOT_MACROS[..]
            };
            for key in meal.keys() {
                if matched.contains(&key.as_str()) || ignored.contains(&key.as_str()) {
                    continue;
                }
                *unknown.entry(key.clone()).or_default() += 1;
            }
        }
    }

    for ((date, metric), (value, unit)) in per_day {
        out.daily_metrics.push(DailyMetric {
            date,
            metric: metric.to_string(),
            value,
            unit: unit.to_string(),
            source_scope: SourceScope::UserFused,
            device_id: None,
        });
    }
    if !unknown.is_empty() {
        let listed = unknown
            .iter()
            .map(|(name, count)| format!("{name}x{count}"))
            .collect::<Vec<_>>()
            .join(", ");
        out.diagnostics
            .push(format!("food: 尚未解析的字段：{listed}"));
    }
}

pub(super) fn food_sample_date(
    sample: &Map<String, Value>,
    bucket: &Map<String, Value>,
    value: &Map<String, Value>,
) -> Option<String> {
    let date_keys = ["date", "day", "dayId", "dateString", "localDate"];
    if let Some(date) = first_value(sample, &date_keys).and_then(parse_date) {
        return Some(date);
    }
    if let Some(mealtime) = sample.get("mealtime").and_then(parse_timestamp) {
        let zone_keys = ["timeZone", "time_zone", "tz"];
        let zone = first_value_from(sample, Some(value), &zone_keys)
            .or_else(|| first_value(bucket, &zone_keys));
        if let Some(zone) = zone {
            if let Some(name) = zone
                .as_str()
                .map(|text| text.rsplit(',').next().unwrap_or(text).trim())
            {
                if let (Ok(zone), Ok(timestamp)) = (
                    jiff::tz::TimeZone::get(name),
                    jiff::Timestamp::from_second(mealtime.timestamp()),
                ) {
                    return Some(timestamp.to_zoned(zone).date().to_string());
                }
            }
            if let Some(offset) = timezone_offset_seconds(zone) {
                if let Some(local) = mealtime.checked_add_signed(Duration::seconds(offset)) {
                    return Some(local.format("%Y-%m-%d").to_string());
                }
            }
        }
    }
    summary_date(bucket, Some(value))
}

/// 饮食记录里属于「记录本身」而不是营养读数的字段。
///
/// 排除它们，是为了让上面那条「尚未解析的字段」诊断里剩下的都是真正的新东西
/// ——第一个有饮食记录的用户同步之后，那一行就是我们唯一的线索。
pub(super) const FOOD_FIELDS_NOT_MACROS: [&str; 10] = [
    "date",
    "dateString",
    "day",
    "eventType",
    "subType",
    "time",
    "timestamp",
    "timeZone",
    "userId",
    "value",
];

pub(super) const FOOD_SAMPLE_FIELDS_NOT_MACROS: [&str; 13] = [
    "foodLogId",
    "foodName",
    "fiber",
    "measureWeight",
    "mealType",
    "mealtime",
    "emoji",
    "labels",
    "foodText",
    "timeZone",
    "date",
    "dateString",
    "timestamp",
];
