//! `summary.json`：给个人助手读的近 N 天每日摘要。移植自
//! `ZeppBridge-Cloud/uploader/lib/summary.mjs`，字段和规则一一对应：
//!
//! - 日期是本机本地日（导出的 `date_range.timezone = system_local`）；
//! - 每个指标带单位（顶层 `units`），缺失一律 null，不补零、不插值；
//! - 同一天同一指标有多条时，优先 user_fused，其次 device，再其次 unknown；
//! - 睡眠按醒来那天归日，运动按开始时间的本地日归日；
//! - 不含逐秒序列和任何坐标。

use chrono::{DateTime, Local};
use serde_json::{json, Map, Value};
use std::collections::{BTreeMap, BTreeSet};

/// 每天固定出现的核心指标（没有就是 null）；其他导出里出现的日指标也照收。
pub const CORE_METRICS: [&str; 17] = [
    "resting_hr",
    "sleep_rhr",
    "sleep_hrv",
    "hrv_baseline",
    "readiness",
    "steps",
    "distance",
    "calories",
    "active_calories",
    "active_minutes",
    "stress",
    "pai_daily",
    "pai_total",
    "training_load",
    "vo2max",
    "respiratory_rate",
    "spo2_night_score",
];

const WORKOUT_FIELDS: [&str; 12] = [
    "workout_id",
    "workout_type",
    "start_time",
    "end_time",
    "moving_seconds",
    "distance_meters",
    "calories",
    "avg_hr",
    "max_hr",
    "training_load",
    "training_effect",
    "anaerobic_training_effect",
];

const SLEEP_FIELDS: [&str; 9] = [
    "start_time",
    "end_time",
    "duration_minutes",
    "score",
    "deep_minutes",
    "light_minutes",
    "rem_minutes",
    "awake_minutes",
    "wake_count",
];

fn rank(scope: Option<&str>) -> u8 {
    match scope {
        Some("user_fused") => 0,
        Some("device") => 1,
        Some("unknown") => 2,
        _ => 3,
    }
}

fn local_day(iso: Option<&str>) -> Option<String> {
    let moment = DateTime::parse_from_rfc3339(iso?).ok()?;
    Some(moment.with_timezone(&Local).format("%Y-%m-%d").to_string())
}

fn pick(source: &Value, fields: &[&str]) -> Map<String, Value> {
    fields
        .iter()
        .map(|field| {
            (
                field.to_string(),
                source.get(*field).cloned().unwrap_or(Value::Null),
            )
        })
        .collect()
}

#[derive(Default)]
struct Day {
    metrics: BTreeMap<String, Value>,
    sleep: Option<Value>,
    workouts: Vec<Map<String, Value>>,
}

/// `envelope` 是 `--detail summary` 的完整导出；`days` 是要出现的本地日（升序，没数据
/// 的日子也会出现）。
pub fn build_summary(envelope: &Value, days: &[String], time_zone: &str, generated_at: &str) -> Value {
    let empty = Vec::new();
    let list = |key: &str| {
        envelope
            .get("data")
            .and_then(|data| data.get(key))
            .and_then(Value::as_array)
            .unwrap_or(&empty)
    };
    let mut by_day: BTreeMap<String, Day> =
        days.iter().map(|day| (day.clone(), Day::default())).collect();
    let mut units: BTreeMap<String, Value> = BTreeMap::new();

    for row in list("daily_metrics") {
        let (Some(date), Some(metric)) = (
            row.get("date").and_then(Value::as_str),
            row.get("metric").and_then(Value::as_str),
        ) else {
            continue;
        };
        let Some(day) = by_day.get_mut(date) else {
            continue;
        };
        if !row.get("value").and_then(Value::as_f64).is_some_and(f64::is_finite) {
            continue;
        }
        if let Some(unit) = row.get("unit").filter(|unit| unit.as_str().is_some_and(|u| !u.is_empty())) {
            units.entry(metric.to_string()).or_insert_with(|| unit.clone());
        }
        let better = day.metrics.get(metric).is_none_or(|previous| {
            rank(row.get("source_scope").and_then(Value::as_str))
                < rank(previous.get("source_scope").and_then(Value::as_str))
        });
        if better {
            day.metrics.insert(metric.to_string(), row.clone());
        }
    }

    for session in list("sleep_sessions") {
        let Some(day) = local_day(session.get("end_time").and_then(Value::as_str))
            .and_then(|date| by_day.get_mut(&date))
        else {
            continue;
        };
        // 一天两段睡眠（午睡）时留时长最长的那段当主睡眠。
        let minutes = |value: &Value| value.get("duration_minutes").and_then(Value::as_f64).unwrap_or(0.0);
        if day.sleep.as_ref().is_none_or(|known| minutes(session) > minutes(known)) {
            day.sleep = Some(session.clone());
        }
    }

    for workout in list("workouts") {
        let Some(day) = local_day(workout.get("start_time").and_then(Value::as_str))
            .and_then(|date| by_day.get_mut(&date))
        else {
            continue;
        };
        let mut item = pick(workout, &WORKOUT_FIELDS);
        let id = match workout.get("workout_id") {
            Some(Value::String(text)) => Value::String(text.clone()),
            Some(Value::Null) | None => Value::Null,
            Some(other) => Value::String(other.to_string()),
        };
        item.insert("workout_id".into(), id);
        let kind = workout
            .get("effective_type")
            .filter(|value| !value.is_null())
            .or_else(|| workout.get("workout_type"))
            .cloned()
            .unwrap_or(Value::Null);
        item.insert("workout_type".into(), kind);
        day.workouts.push(item);
    }

    let extra: BTreeSet<String> = by_day
        .values()
        .flat_map(|day| day.metrics.keys())
        .filter(|name| !CORE_METRICS.contains(&name.as_str()))
        .cloned()
        .collect();
    let metric_names: Vec<String> = CORE_METRICS
        .iter()
        .map(|name| name.to_string())
        .chain(extra)
        .collect();

    let mut unit_map = Map::new();
    for name in &metric_names {
        unit_map.insert(name.clone(), units.get(name).cloned().unwrap_or(Value::Null));
    }
    for (key, value) in [
        ("sleep.*_minutes", "min"),
        ("sleep.duration_minutes", "min"),
        ("sleep.score", "score (1-100)"),
        ("workouts.distance_meters", "m"),
        ("workouts.moving_seconds", "s"),
        ("workouts.calories", "kcal"),
        ("workouts.avg_hr", "bpm"),
        ("workouts.max_hr", "bpm"),
    ] {
        unit_map.insert(key.into(), Value::String(value.into()));
    }

    let day_values: Vec<Value> = days
        .iter()
        .map(|date| {
            let day = by_day.remove(date).unwrap_or_default();
            let metrics: Map<String, Value> = metric_names
                .iter()
                .map(|name| {
                    (
                        name.clone(),
                        day.metrics
                            .get(name)
                            .and_then(|row| row.get("value").cloned())
                            .unwrap_or(Value::Null),
                    )
                })
                .collect();
            let mut workouts = day.workouts;
            workouts.sort_by(|a, b| {
                let key = |item: &Map<String, Value>| match item.get("start_time") {
                    Some(Value::String(text)) => text.clone(),
                    Some(other) => other.to_string(),
                    None => String::new(),
                };
                key(a).cmp(&key(b))
            });
            json!({
                "date": date,
                "metrics": metrics,
                "sleep": day.sleep.as_ref().map(|sleep| Value::Object(pick(sleep, &SLEEP_FIELDS))),
                "workouts": workouts,
            })
        })
        .collect();

    json!({
        "schema": "zeppbridge-cloud.summary/1",
        "generated_at": generated_at,
        "time_zone": time_zone,
        "from": days.first(),
        "to": days.last(),
        "day_count": days.len(),
        "units": unit_map,
        "notes": [
            "date is the owner's local calendar day (time_zone); timestamps are ISO 8601 with offset.",
            "null means no data for that day; values are never filled in, averaged across days or interpolated.",
            "Where several sources report one metric, the app's fused value (user_fused) wins over a single device.",
            "Sleep belongs to the day you woke up; workouts to the local day they started.",
            "Per-day detail: /v1/days/<date>. Per-workout detail: /v1/workouts/<id>. Units and definitions: /v1/contract."
        ],
        "days": day_values,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mirrors_the_js_summary_rules() {
        let envelope = json!({ "data": {
            "daily_metrics": [
                { "date": "2024-03-10", "metric": "steps", "value": 9000, "unit": "count", "source_scope": "device" },
                { "date": "2024-03-10", "metric": "steps", "value": 9500, "unit": "count", "source_scope": "user_fused" },
                { "date": "2024-03-10", "metric": "steps", "value": 1, "unit": "count", "source_scope": "unknown" },
                { "date": "2024-03-10", "metric": "custom_metric", "value": 3, "unit": "x" },
                { "date": "2024-03-10", "metric": "resting_hr", "value": null },
                { "date": "2099-01-01", "metric": "steps", "value": 5 }
            ],
            "sleep_sessions": [],
            "workouts": []
        }});
        let days = vec!["2024-03-09".to_string(), "2024-03-10".to_string()];
        let summary = build_summary(&envelope, &days, "Asia/Shanghai", "2024-03-11T00:00:00Z");
        assert_eq!(summary["day_count"], 2);
        assert_eq!(summary["days"][0]["metrics"]["steps"], Value::Null);
        assert_eq!(summary["days"][0]["sleep"], Value::Null);
        assert_eq!(summary["days"][1]["metrics"]["steps"], 9500);
        assert_eq!(summary["days"][1]["metrics"]["resting_hr"], Value::Null);
        assert_eq!(summary["days"][1]["metrics"]["custom_metric"], 3);
        assert_eq!(summary["units"]["steps"], "count");
        assert_eq!(summary["units"]["resting_hr"], Value::Null);
        assert_eq!(summary["from"], "2024-03-09");
        assert_eq!(summary["to"], "2024-03-10");
        let names: Vec<&str> = summary["days"][1]["metrics"]
            .as_object()
            .unwrap()
            .keys()
            .map(String::as_str)
            .collect();
        assert!(names.contains(&"custom_metric") && names.contains(&"spo2_night_score"));
    }
}
