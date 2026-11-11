//! 锚点运动的「和最近同类跑步比」「前后半程」「爬升段」三张小表（10-28，字段见 `export/workout_extras.rs`）。

use super::*;

/// 这次运动有没有这几块（决定要不要为它单开一节）。
pub(super) fn present(workout: &Value) -> bool {
    workout.get("comparison").is_some()
        || workout.get("climbs").is_some()
        || workout.get("strength").is_some()
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
    if let Some(strength) = workout.get("strength").and_then(Value::as_object) {
        out.push_str("#### Strength training\n\n");
        let mut summary_rows = Vec::new();
        for (key, label) in [
            ("total_sets", "total_sets"),
            ("total_reps", "total_reps"),
            ("total_volume_kg", "total_volume_kg"),
            ("rest_seconds", "rest_seconds"),
        ] {
            if let Some(val) = strength.get(key).filter(|val| !val.is_null()) {
                summary_rows.push(vec![label.to_string(), cell(val)]);
            }
        }
        if !summary_rows.is_empty() {
            csv_block(
                out,
                &["field".to_string(), "value".to_string()],
                summary_rows,
            );
        }
        if let Some(sets) = strength
            .get("sets")
            .and_then(Value::as_array)
            .filter(|sets| !sets.is_empty())
        {
            object_table(
                out,
                sets,
                &[
                    "set_index",
                    "action_code",
                    "exercise_key",
                    "muscle_group",
                    "reps",
                    "weight_value",
                    "weight_unit",
                    "weight_kg",
                    "duration_ms",
                ],
                &[
                    ("weight_kg", "kg"),
                    ("duration_ms", "ms"),
                    ("avg_hr", "bpm"),
                    ("calories_kcal", "kcal"),
                ],
            );
        } else if let Some(groups) = strength
            .get("exercise_groups")
            .and_then(Value::as_array)
            .filter(|groups| !groups.is_empty())
        {
            object_table(
                out,
                groups,
                &[
                    "action_code",
                    "exercise_key",
                    "muscle_group",
                    "sets",
                    "total_reps",
                ],
                &[],
            );
        }
    }
}
