//! 锚点运动的两块追加字段（10-28）：和最近同类跑步的对比 + 前后半程（`comparison`，运动页洞察卡那一份），
//! 爬升 / 下降段（`climbs`，爬升卡那一份）。以前导出里只有一行汇总，AI 说不出「比平时快还是慢」、
//! 「哪一段在爬坡」。都是追加字段，已有字段一个不改；standard 起才带。

use super::*;
use crate::insight::WorkoutInsight;
use crate::workout_climbs::WorkoutClimbs;

/// 洞察里给 AI 的那部分：每项读数和基线比的结果、基线用了几次、前后半程。不支持这类运动（目前只做跑步）时没有。
pub(super) fn comparison_json(insight: &WorkoutInsight) -> Result<Option<Value>> {
    if !insight.supported {
        return Ok(None);
    }
    let mut facts = Vec::with_capacity(insight.facts.len());
    for fact in &insight.facts {
        let mut row = Map::new();
        row.insert("fact_id".into(), json!(fact.fact_id));
        row.insert("metric".into(), json!(fact.metric));
        row.insert("value".into(), json!(fact.value));
        row.insert("unit".into(), json!(fact.unit));
        if let Some(comparison) = &fact.comparison {
            row.insert("baseline_value".into(), json!(comparison.baseline_value));
            row.insert("delta".into(), json!(comparison.delta));
            row.insert("delta_percent".into(), json!(comparison.delta_percent));
            row.insert("direction".into(), json!(comparison.direction));
        }
        row.insert("evidence_count".into(), json!(fact.evidence_count));
        row.insert("confidence".into(), serde_json::to_value(fact.confidence)?);
        facts.push(Value::Object(row));
    }
    let mut object = Map::new();
    object.insert(
        "baseline_runs".into(),
        json!(insight.baseline_included.len()),
    );
    if let Some(window) = insight
        .facts
        .iter()
        .find_map(|fact| fact.baseline_window.as_ref())
    {
        object.insert("baseline_window".into(), serde_json::to_value(window)?);
    }
    object.insert("facts".into(), Value::Array(facts));
    if let Some(drift) = &insight.heart_rate_drift {
        object.insert("heart_rate_drift".into(), serde_json::to_value(drift)?);
    } else if let Some(code) = &insight.heart_rate_drift_unavailable {
        object.insert("heart_rate_drift_unavailable".into(), json!(code));
    }
    Ok(Some(Value::Object(object)))
}

/// 爬升段和判定门槛。`segments` 为空 = 有海拔，但没有一段够格。
pub(super) fn climbs_json(climbs: &WorkoutClimbs) -> Result<Value> {
    Ok(serde_json::to_value(climbs)?)
}

/// 排除心率时：对比里的心率项、前后半程（每拍跑出的米数能算回心率）、每段的平均心率一起去掉。
pub(super) fn strip_heart_rate(object: &mut Map<String, Value>) {
    let is_heart = |metric: &str| {
        metric.ends_with("_hr") || metric.starts_with("hr_") || metric.contains("heart")
    };
    if let Some(comparison) = object.get_mut("comparison").and_then(Value::as_object_mut) {
        comparison.remove("heart_rate_drift");
        comparison.remove("heart_rate_drift_unavailable");
        if let Some(facts) = comparison.get_mut("facts").and_then(Value::as_array_mut) {
            facts.retain(
                |fact| !matches!(fact.get("metric").and_then(Value::as_str), Some(metric) if is_heart(metric)),
            );
        }
    }
    if let Some(segments) = object
        .get_mut("climbs")
        .and_then(|climbs| climbs.get_mut("segments"))
        .and_then(Value::as_array_mut)
    {
        for segment in segments {
            if let Some(segment) = segment.as_object_mut() {
                segment.remove("average_hr");
            }
        }
    }
}
