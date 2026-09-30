use super::*;

use chrono::{TimeZone, Utc};

use std::path::PathBuf;

use zeppbridge_core::models::{DailyMetric, SleepSession, SleepStageSlice, SourceScope, Workout};

struct TestLibrary(PathBuf);

impl TestLibrary {
    fn empty() -> Self {
        let nonce = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!(
            "zeppbridge-mcp-test-{}-{nonce}",
            std::process::id()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let library = Self(dir);
        Database::open_migrated(&library.0.join("zepp.db")).unwrap();
        library
    }

    fn new(sessions: &[SleepSession]) -> Self {
        let library = Self::empty();
        let db = Database::open_migrated(&library.0.join("zepp.db")).unwrap();
        for session in sessions {
            db.insert_sleep_session(session).unwrap();
        }
        library
    }

    /// 往库里写一条 `ai_tasks` 行。v32 起表由迁移建好（S1），这里只插
    /// 授权判定关心的列：id + JSON payload + mcp_shared 开关列。
    fn share_task(&self, task_id: &str, payload: &str, shared: bool) {
        let conn = rusqlite::Connection::open(self.0.join("zepp.db")).unwrap();
        conn.execute(
            "INSERT OR REPLACE INTO ai_tasks
                    (id, payload, mcp_shared, created_at, updated_at)
                 VALUES (?1, ?2, ?3, '', '')",
            rusqlite::params![task_id, payload, i64::from(shared)],
        )
        .unwrap();
    }

    fn call(&self, scope: &AccessScope, name: &str, arguments: Value) -> Value {
        call_tool_with_db(
            &json!({ "name": name, "arguments": arguments }),
            scope,
            || {
                let db = Database::open_read_only(self.0.join("zepp.db"))
                    .map_err(|error| (ERR_DATABASE, error.user_message()))?;
                Ok((db, 0))
            },
        )
        .unwrap()
    }

    fn call_sleep(&self, arguments: Value) -> Value {
        self.call(&AccessScope::FullReadOnly, "get_sleep_detail", arguments)
    }
}

impl Drop for TestLibrary {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

/// 一次跑步。`effective_type = run` 让 workout_insight 走跑步分支。
fn run_workout(id: &str, start: chrono::DateTime<Utc>, avg_hr: i32) -> Workout {
    Workout {
        workout_id: id.into(),
        workout_type: "run".into(),
        normalized_type: "run".into(),
        type_source: "numeric_mapped".into(),
        user_override: None,
        effective_type: "run".into(),
        custom_label: None,
        start_time: start,
        end_time: start + Duration::minutes(50),
        distance_meters: Some(10_000.0),
        calories: Some(500),
        avg_hr: Some(avg_hr),
        max_hr: Some(170),
        training_load: Some(60.0),
        vo2max: None,
        min_hr: None,
        total_steps: None,
        moving_seconds: None,
        elevation_gain_m: None,
        elevation_loss_m: None,
        max_altitude_m: None,
        min_altitude_m: None,
        training_effect: None,
        anaerobic_training_effect: None,
        rpe: None,
        avg_cadence_spm: None,
        max_cadence_spm: None,
        avg_stride_cm: None,
        hr_zones: Vec::new(),
        source_scope: SourceScope::Device,
        device_id: Some("watch-serial-001".into()),
        synced_at: Some(start + Duration::hours(2)),
        gps_available: true,
        sample_count: 0,
        zepp_source: None,
        zepp_type: Some(1),
    }
}

/// 一份任务授权载荷（ai_tasks.payload 的最小形态）。
fn task_payload(task_id: &str, workout_ids: &[&str], categories: &[&str]) -> String {
    json!({
        "id": task_id,
        "workout_ids": workout_ids,
        "categories": categories
            .iter()
            .map(|category| json!({
                "category": category,
                "enabled": true,
                "days_before": 14,
                "include_workout_day": true,
            }))
            .collect::<Vec<_>>(),
    })
    .to_string()
}

/// 递归断言：整份输出里没有任何 `path`/`absolute*`/文件正文字段（R11）。
fn assert_no_pathish_keys(value: &Value, where_at: &str) {
    match value {
        Value::Object(map) => {
            for (key, child) in map {
                let lower = key.to_ascii_lowercase();
                assert!(
                    !(lower.contains("path") || lower.contains("file") || lower == "body"),
                    "{where_at}: 输出里不该出现 `{key}`"
                );
                assert_no_pathish_keys(child, where_at);
            }
        }
        Value::Array(items) => {
            for item in items {
                assert_no_pathish_keys(item, where_at);
            }
        }
        _ => {}
    }
}

/// 递归收集输出里出现过的所有运动/睡眠 id 形字符串值，用来断言
/// 「没有任何未授权 id 出现在响应里」。
fn collect_ids(value: &Value, out: &mut BTreeSet<String>) {
    match value {
        Value::Object(map) => {
            for (key, child) in map {
                if matches!(
                    key.as_str(),
                    "workout_id" | "workoutId" | "sleep_id" | "sleepId"
                ) || key == "evidence_refs"
                {
                    if let Some(id) = child.as_str() {
                        out.insert(id.to_string());
                    }
                }
                collect_ids(child, out);
            }
        }
        Value::Array(items) => {
            for item in items {
                collect_ids(item, out);
            }
        }
        _ => {}
    }
}

fn sleep_session(id: &str, day: u32, stage: Option<&str>) -> SleepSession {
    let start = Utc.with_ymd_and_hms(2026, 1, day, 20, 0, 0).unwrap();
    let end = start + chrono::Duration::minutes(60);
    SleepSession {
        sleep_id: id.into(),
        start_time: start,
        end_time: end,
        score: Some(80),
        duration_minutes: 60,
        deep_minutes: Some(30),
        light_minutes: Some(30),
        rem_minutes: None,
        awake_minutes: Some(0),
        source_scope: SourceScope::Device,
        device_id: None,
        synced_at: Some(end + chrono::Duration::hours(1)),
        time_in_bed_minutes: None,
        stages: stage
            .map(|stage| SleepStageSlice {
                stage: stage.into(),
                start_time: start,
                end_time: start + chrono::Duration::minutes(30),
                raw_mode: Some(5),
            })
            .into_iter()
            .collect(),
        wake_count: Some(1),
    }
}

/// UTC 中午的时间点：本地日在 ±14h 时区内都不会被推偏，fixture 不用
/// 关心宿主机的时区。
fn utc_noon(days_ago: i64) -> chrono::DateTime<Utc> {
    let day = Local::now().date_naive() - Duration::days(days_ago);
    Utc.from_utc_datetime(&day.and_hms_opt(12, 0, 0).unwrap())
}

fn sleep_session_days_ago(id: &str, end_days_ago: i64) -> SleepSession {
    let end = Utc::now() - Duration::days(end_days_ago);
    let start = end - Duration::hours(8);
    SleepSession {
        sleep_id: id.into(),
        start_time: start,
        end_time: end,
        score: Some(80),
        duration_minutes: 480,
        deep_minutes: Some(100),
        light_minutes: Some(300),
        rem_minutes: Some(80),
        awake_minutes: Some(0),
        source_scope: SourceScope::Device,
        device_id: Some("watch-serial-zzz".into()),
        synced_at: Some(end + Duration::hours(1)),
        time_in_bed_minutes: None,
        stages: vec![SleepStageSlice {
            stage: "deep".into(),
            start_time: start,
            end_time: start + Duration::minutes(30),
            raw_mode: Some(5),
        }],
        wake_count: Some(1),
    }
}

mod browse;
mod protocol;
mod scope;
