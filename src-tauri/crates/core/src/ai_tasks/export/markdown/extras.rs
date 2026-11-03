//! 锚点运动的「和最近同类跑步比」「前后半程」「爬升段」三张小表（10-28，字段见 `export/workout_extras.rs`）。

use super::*;

/// 这次运动有没有这几块（决定要不要为它单开一节）。
pub(super) fn present(workout: &Value) -> bool {
    workout.get("comparison").is_some() || workout.get("climbs").is_some()
}

pub(super) fn render(out: &mut String, workout: &Value) {
    if let Some(comparison) = workout.get("comparison").and_then(Value::as_object) {
        out.push_str("#### Compared with recent similar runs\n\n");
        if let Some(runs) = comparison.get("baseline_runs") {
            let window = comparison
                .get("baseline_window")
                .and_then(|window| window.get("days"))
                .map(|days| format!(" from the previous {} days", cell(days)))
                .unwrap_or_default();
            let _ = writeln!(out, "Baseline: {} comparable runs{window}.\n", cell(runs));
        }
        if let Some(facts) = comparison
            .get("facts")
            .and_then(Value::as_array)
            .filter(|facts| !facts.is_empty())
        {
            object_table(
                out,
                facts,
                &[
                    "fact_id",
                    "metric",
                    "value",
                    "unit",
                    "baseline_value",
                    "delta",
                    "delta_percent",
                    "direction",
                    "evidence_count",
                    "confidence",
                ],
                &[],
            );
        }
        if let Some(drift) = comparison
            .get("heart_rate_drift")
            .and_then(Value::as_object)
        {
            out.push_str("#### First half vs second half\n\n");
            let body = drift
                .iter()
                .map(|(key, value)| vec![key.clone(), cell(value)])
                .collect();
            csv_block(out, &["field".to_string(), "value".to_string()], body);
        } else if let Some(code) = comparison.get("heart_rate_drift_unavailable") {
            let _ = writeln!(
                out,
                "First half vs second half: not computed ({}).\n",
                cell(code)
            );
        }
    }
    if let Some(climbs) = workout.get("climbs") {
        out.push_str("#### Climbs and descents\n\n");
        match climbs
            .get("segments")
            .and_then(Value::as_array)
            .filter(|segments| !segments.is_empty())
        {
            Some(segments) => object_table(
                out,
                segments,
                &[
                    "kind",
                    "start_distance_m",
                    "end_distance_m",
                    "elevation_change_m",
                    "average_grade_pct",
                    "moving_seconds",
                ],
                &[
                    ("start_distance_m", "m"),
                    ("end_distance_m", "m"),
                    ("elevation_change_m", "m"),
                    ("average_grade_pct", "%"),
                    ("moving_seconds", "s"),
                    ("vertical_speed_m_per_h", "m/h"),
                    ("average_hr", "bpm"),
                    ("average_pace_min_per_km", "min/km"),
                ],
            ),
            None => {
                let method = climbs.get("method");
                let field = |key: &str| cell_opt(method.and_then(|method| method.get(key)));
                let _ = writeln!(
                    out,
                    "No climb or descent reached the thresholds (at least {} m of elevation change at {} % average grade); the altitude only rolled gently.\n",
                    field("min_change_m"),
                    field("min_grade_pct"),
                );
            }
        }
    }
}
