//! storage 的测试，按领域分文件。共享的小工具放在这里。

use super::workout_series::workout_series_summary;
use super::*;

use chrono::{Datelike, TimeZone};

fn ts() -> DateTime<Utc> {
    DateTime::from_timestamp(1_700_000_000, 0).unwrap()
}

fn export_selection(types: &[&str], detail: ExportDetail) -> ExportSelection {
    ExportSelection {
        scope: Some(ExportScope::date_range("2023-11-01", "2023-11-30")),
        start_date: None,
        end_date: None,
        data_types: types.iter().map(|value| value.to_string()).collect(),
        detail,
    }
}

fn workout_with_type(code: Option<i32>, normalized: &str, source: &str) -> Workout {
    Workout {
        workout_id: "same-workout".into(),
        workout_type: normalized.into(),
        normalized_type: normalized.into(),
        type_source: source.into(),
        user_override: None,
        effective_type: normalized.into(),
        custom_label: None,
        start_time: ts(),
        end_time: ts() + chrono::Duration::minutes(30),
        distance_meters: None,
        calories: Some(100),
        avg_hr: None,
        max_hr: None,
        training_load: None,
        vo2max: None,
        source_scope: SourceScope::Device,
        device_id: None,
        synced_at: Some(ts() + chrono::Duration::hours(1)),
        gps_available: false,
        sample_count: 0,
        zepp_source: None,
        zepp_type: code,
        ..Default::default()
    }
}

fn parsed_export(db: &Database, types: &[&str], detail: ExportDetail) -> serde_json::Value {
    let (encoded, _) = db
        .build_ai_export(&export_selection(types, detail))
        .unwrap();
    serde_json::from_str(&encoded).unwrap()
}

fn sleep_stage_flags(db: &Database, sleep_id: &str) -> (i64, i64, i64, i64) {
    db.conn
        .query_row(
            "SELECT deep_available, light_available, rem_available, awake_available
                 FROM sleep_sessions WHERE sleep_id = ?1",
            [sleep_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .unwrap()
}

mod devices;
mod event_windows;
mod export;
mod metrics;
mod official;
mod queries;
mod replay;
mod schema;
mod training_plan;

mod open;
mod owner;
