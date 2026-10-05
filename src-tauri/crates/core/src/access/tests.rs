use super::*;
use crate::contract;
use crate::insight::InsightFact;
use crate::models::{SleepSession, SourceScope};
use chrono::TimeZone;
use std::path::PathBuf;

fn day(month: u32, day: u32) -> NaiveDate {
    NaiveDate::from_ymd_opt(2026, month, day).unwrap()
}

/// 临时数据目录。和其它 core 测试一样手动建/删，不引 tempfile。
struct TestDir(PathBuf);

impl TestDir {
    fn new(tag: &str) -> Self {
        let nonce = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        Self::with_nonce(tag, nonce)
    }

    fn with_nonce(tag: &str, nonce: u128) -> Self {
        // macOS 的时钟精度不足以区分并行测试；序号保证同一时间戳下也不共用目录。
        static COUNTER: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
        let serial = COUNTER.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let dir = std::env::temp_dir().join(format!(
            "zeppbridge-access-{tag}-{}-{nonce}-{serial}",
            std::process::id()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        Self(dir)
    }
}

impl Drop for TestDir {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

#[test]
fn parallel_test_directories_with_the_same_timestamp_are_independent() {
    let mut dirs: Vec<TestDir> = std::thread::scope(|scope| {
        let threads: Vec<_> = (0..32)
            .map(|_| scope.spawn(|| TestDir::with_nonce("same-clock", 0)))
            .collect();
        threads
            .into_iter()
            .map(|thread| thread.join().unwrap())
            .collect()
    });
    let paths: BTreeSet<_> = dirs.iter().map(|dir| dir.0.clone()).collect();
    assert_eq!(paths.len(), dirs.len());
    dirs.truncate(16);
    for dir in &dirs {
        assert!(dir.0.is_dir(), "另一个测试结束不能删除仍在使用的目录");
        Database::open_migrated(&dir.0.join("zepp.db")).unwrap();
    }
    drop(dirs);
    assert!(paths.iter().all(|path| !path.exists()));
}

fn window(category: AccessCategory, start: NaiveDate, end: NaiveDate) -> GrantWindow {
    GrantWindow::new(category, start, end).unwrap()
}

fn grant(task_id: &str, workout_ids: &[&str], windows: Vec<GrantWindow>) -> TaskGrant {
    TaskGrant {
        task_id: task_id.into(),
        workout_ids: workout_ids.iter().map(|id| id.to_string()).collect(),
        windows,
        ..TaskGrant::default()
    }
}

fn excluding(window: GrantWindow, names: &[&str]) -> GrantWindow {
    window.with_excluded(names.iter().map(|name| name.to_string()))
}

fn request(tool: &'static str) -> DataRequest {
    DataRequest {
        tool,
        ..DataRequest::default()
    }
}

/* ---------- AccessScope ---------- */

#[test]
fn scope_parses_only_the_two_known_values() {
    assert_eq!(
        AccessScope::parse("full-readonly"),
        Some(AccessScope::FullReadOnly)
    );
    assert_eq!(AccessScope::parse("task"), Some(AccessScope::TaskScoped));
    for bad in ["", "full", "task-scoped", "TASK", " task", "full_readonly"] {
        assert_eq!(AccessScope::parse(bad), None, "{bad:?} 必须 fail-closed");
    }
    assert_eq!(AccessScope::FullReadOnly.as_str(), "full-readonly");
    assert_eq!(AccessScope::TaskScoped.as_str(), "task");
}

/* ---------- authorize：通用规则 ---------- */

#[test]
fn task_scope_with_zero_grants_denies_with_no_grants() {
    let grants = vec![];
    for tool in [
        "list_workouts",
        "get_workout_insight",
        "get_metric_series",
        "get_sleep_detail",
        "get_data_health",
    ] {
        let mut req = request(tool);
        req.categories = vec![AccessCategory::Workout];
        let error = authorize(&AccessScope::TaskScoped, &grants, &req).unwrap_err();
        assert_eq!(error.code, SCOPE_NO_GRANTS, "{tool} 零授权必须是 no_grants");
    }
}

#[test]
fn full_readonly_ignores_grants_entirely() {
    // 授权集故意为空也放行：full 模式根本不读授权。
    let mut req = request("get_data_health");
    req.whole_library = true;
    assert!(
        authorize(&AccessScope::FullReadOnly, &[], &req).is_ok(),
        "full-readonly 不该被任何授权状态拦住"
    );
}

#[test]
fn whole_library_requests_are_denied_under_task_scope() {
    let grants = vec![grant(
        "t1",
        &["w1"],
        vec![window(AccessCategory::Sleep, day(1, 1), day(1, 31))],
    )];
    let mut req = request("get_data_health");
    req.whole_library = true;
    let error = authorize(&AccessScope::TaskScoped, &grants, &req).unwrap_err();
    assert_eq!(error.code, SCOPE_DENIED);
}

#[test]
fn unlisted_workout_id_is_denied() {
    let grants = vec![grant("t1", &["w1", "w2"], vec![])];
    let mut req = request("get_workout_insight");
    req.categories = vec![AccessCategory::Workout];
    req.workout_ids = vec!["w9".into()];
    assert_eq!(
        authorize(&AccessScope::TaskScoped, &grants, &req)
            .unwrap_err()
            .code,
        SCOPE_DENIED
    );
    req.workout_ids = vec!["w2".into()];
    assert!(authorize(&AccessScope::TaskScoped, &grants, &req).is_ok());
}

#[test]
fn windowed_category_without_overlap_is_denied_not_truncated() {
    // 授权窗 1/1..1/15，请求 2/1..2/10：不相交必须拒绝，不能悄悄截成空。
    let grants = vec![grant(
        "t1",
        &["w1"],
        vec![window(AccessCategory::Recovery, day(1, 1), day(1, 15))],
    )];
    let mut req = request("get_metric_series");
    req.categories = vec![AccessCategory::Recovery];
    req.date_range = Some((day(2, 1), day(2, 10)));
    assert_eq!(
        authorize(&AccessScope::TaskScoped, &grants, &req)
            .unwrap_err()
            .code,
        SCOPE_DENIED
    );
    // 有交集就放行，且窗口被裁到交集。
    req.date_range = Some((day(1, 10), day(2, 10)));
    let permit = authorize(&AccessScope::TaskScoped, &grants, &req).unwrap();
    assert_eq!(permit.windows.len(), 1);
    assert_eq!(permit.windows[0].start_date, day(1, 10));
    assert_eq!(permit.windows[0].end_date, day(1, 15));
}

#[test]
fn a_category_with_no_overlap_denies_the_whole_call() {
    // 请求 sleep+recovery，只有 recovery 有窗：整体拒绝，不悄悄丢掉 sleep。
    // 否则模型会把「没授权」读成「没数据」——这是两种不同的真话。
    let grants = vec![grant(
        "t1",
        &["w1"],
        vec![window(AccessCategory::Recovery, day(1, 1), day(1, 15))],
    )];
    let mut req = request("get_metric_series");
    req.categories = vec![AccessCategory::Sleep, AccessCategory::Recovery];
    let denied = authorize(&AccessScope::TaskScoped, &grants, &req).unwrap_err();
    assert_eq!(denied.code, SCOPE_DENIED);
    assert!(denied.reason.contains("sleep"));
}

#[test]
fn sleep_requests_need_a_sleep_window() {
    let grants = vec![grant(
        "t1",
        &["w1"],
        vec![window(AccessCategory::Recovery, day(1, 1), day(1, 15))],
    )];
    let mut req = request("get_sleep_detail");
    req.categories = vec![AccessCategory::Sleep];
    req.latest_sleep = true;
    assert_eq!(
        authorize(&AccessScope::TaskScoped, &grants, &req)
            .unwrap_err()
            .code,
        SCOPE_DENIED
    );
}

#[test]
fn list_workouts_with_no_granted_ids_permits_an_empty_list() {
    let grants = vec![grant(
        "t1",
        &[],
        vec![window(AccessCategory::Sleep, day(1, 1), day(1, 15))],
    )];
    let mut req = request("list_workouts");
    req.categories = vec![AccessCategory::Workout];
    let permit = authorize(&AccessScope::TaskScoped, &grants, &req).unwrap();
    assert!(permit.workout_ids.is_empty());
    assert_eq!(permit.grants, 1);
}

#[test]
fn grants_from_multiple_tasks_union_together() {
    let grants = vec![
        grant(
            "t1",
            &["w1"],
            vec![window(AccessCategory::Sleep, day(1, 1), day(1, 7))],
        ),
        grant(
            "t2",
            &["w2"],
            vec![window(AccessCategory::Sleep, day(2, 1), day(2, 7))],
        ),
    ];
    let mut req = request("list_workouts");
    req.categories = vec![AccessCategory::Workout];
    let permit = authorize(&AccessScope::TaskScoped, &grants, &req).unwrap();
    assert_eq!(permit.workout_ids.len(), 2);
    assert_eq!(permit.grants, 2);
    let mut sleep_req = request("get_sleep_detail");
    sleep_req.categories = vec![AccessCategory::Sleep];
    let permit = authorize(&AccessScope::TaskScoped, &grants, &sleep_req).unwrap();
    assert_eq!(permit.permitted_day_count(AccessCategory::Sleep), 14);
}

#[test]
fn overlapping_windows_merge_for_display() {
    let grants = vec![grant(
        "t1",
        &["w1"],
        vec![
            window(AccessCategory::Sleep, day(1, 1), day(1, 10)),
            window(AccessCategory::Sleep, day(1, 5), day(1, 20)),
            window(AccessCategory::Sleep, day(1, 21), day(1, 25)),
        ],
    )];
    let merged = granted_windows(&grants, &[AccessCategory::Sleep], None);
    assert_eq!(merged.len(), 1);
    assert_eq!(merged[0].start_date, day(1, 1));
    assert_eq!(merged[0].end_date, day(1, 25));
}

/* ---------- metric_category ---------- */

#[test]
fn every_contract_metric_has_a_category() {
    for metric in contract::metric_names() {
        assert!(
            metric_category(metric).is_some(),
            "契约指标 {metric} 必须有类别映射，否则任务范围永远拒绝它"
        );
    }
}

#[test]
fn metric_category_is_fail_closed_for_unknown_names() {
    assert_eq!(metric_category("heart_rate"), None);
    assert_eq!(metric_category("made_up_metric"), None);
    assert_eq!(metric_category(""), None);
}

/* ---------- clip_metric_series ---------- */

fn series(metric: &str, dates: &[&str]) -> MetricSeries {
    MetricSeries {
        metric: metric.into(),
        unit: "u".into(),
        source: "daily_metrics".into(),
        points: dates
            .iter()
            .map(|date| crate::models::MetricSeriesPoint {
                date: date.to_string(),
                value: 1.0,
                min: None,
                max: None,
                samples: None,
            })
            .collect(),
        latest: None,
        average: None,
        minimum: None,
        maximum: None,
        days_with_data: 0,
        window_days: 0,
    }
}

#[test]
fn clip_metric_series_drops_days_outside_the_window() {
    let mut permit = Permit::unrestricted();
    permit.windows = vec![window(AccessCategory::Training, day(1, 5), day(1, 10))];
    let input = vec![
        series(
            "steps",
            &["2026-01-04", "2026-01-05", "2026-01-10", "2026-01-11"],
        ),
        series("spo2", &["2026-01-06"]), // 类别无窗 → 整条丢
    ];
    let clipped = clip_metric_series(input, &permit);
    assert_eq!(clipped.len(), 1);
    let dates: Vec<&str> = clipped[0]
        .points
        .iter()
        .map(|point| point.date.as_str())
        .collect();
    assert_eq!(dates, ["2026-01-05", "2026-01-10"]);
    assert_eq!(clipped[0].days_with_data, 2);
    assert_eq!(clipped[0].window_days, 6);
    assert_eq!(clipped[0].latest.as_ref().unwrap().date, "2026-01-10");
}

/* ---------- strip_identity_fields ---------- */

#[test]
fn identity_fields_are_stripped_recursively() {
    let mut value = serde_json::json!({
        "sleep": {"sleep_id": "s1", "device_id": "dev-serial-1"},
        "stages": [{"stage": "deep", "device_id": "x"}],
        "ok": 1
    });
    strip_identity_fields(&mut value);
    let text = value.to_string();
    assert!(!text.contains("device_id"));
    assert!(!text.contains("dev-serial-1"));
    assert_eq!(value["ok"], serde_json::json!(1));
}

/* ---------- rescore_insight ---------- */

fn run(id: &str, day: u32, distance: Option<f64>, avg_hr: Option<i32>) -> GrantedRun {
    let start = Utc.with_ymd_and_hms(2026, 1, day, 8, 0, 0).unwrap();
    GrantedRun {
        workout_id: id.into(),
        start_time: start,
        end_time: start + Duration::minutes(50),
        distance_meters: distance,
        avg_hr,
        training_load: Some(60.0),
    }
}

fn fact(metric: &str, value: Option<f64>) -> InsightFact {
    InsightFact {
        fact_id: format!("run.{metric}"),
        metric: metric.into(),
        value,
        unit: "u".into(),
        comparison: None,
        baseline_window: None,
        evidence_count: 0,
        source: "device".into(),
        confidence: Confidence::High,
        reason: None,
        reason_code: None,
        baseline_count: 0,
        evidence_refs: Vec::new(),
    }
}

#[test]
fn rescore_recomputes_baseline_over_granted_runs_only() {
    // 库里可比历史：g1..g4 已授权，x1..x5 未授权。原洞察基线混入 x*。
    let granted: BTreeSet<String> = ["g1", "g2", "g3", "g4", "target"]
        .iter()
        .map(|id| id.to_string())
        .collect();
    let rows: BTreeMap<String, GrantedRun> = ["g1", "g2", "g3", "g4", "x1", "x2"]
        .iter()
        .enumerate()
        .map(|(i, id)| {
            (
                id.to_string(),
                run(id, (i + 1) as u32, Some(10_000.0), Some(150)),
            )
        })
        .collect();
    let mut insight = WorkoutInsight {
        workout_id: "target".into(),
        workout_type: "run".into(),
        supported: true,
        unsupported_reason: None,
        unsupported_code: None,
        facts: vec![fact("avg_hr", Some(160.0))],
        baseline_included: ["x1", "x2", "g1", "g2", "g3"]
            .iter()
            .map(|id| BaselineEntry {
                workout_id: id.to_string(),
                start_time: Utc
                    .with_ymd_and_hms(2026, 1, 20, 8, 0, 0)
                    .unwrap()
                    .to_rfc3339(),
                distance_meters: 10_000.0,
            })
            .collect(),
        baseline_excluded: vec![BaselineExclusion {
            workout_id: "x9".into(),
            reason: "distance_out_of_tolerance".into(),
        }],
        heart_rate_drift: None,
        heart_rate_drift_unavailable: Some("not_enough_samples".into()),
    };
    // 原始均值里混着未授权样本——重算前先把比较值塞成一个明显错的标记。
    insight.facts[0].comparison = Some(Comparison {
        baseline_value: 999.0,
        delta: 0.0,
        delta_percent: 0.0,
        direction: "same".into(),
    });
    insight.facts[0].evidence_refs = vec!["x1".into(), "x2".into(), "g1".into()];

    rescore_insight(&mut insight, &granted, &rows);

    let ids: Vec<&str> = insight
        .baseline_included
        .iter()
        .map(|entry| entry.workout_id.as_str())
        .collect();
    assert_eq!(ids, ["g1", "g2", "g3"], "未授权运动不得留在基线");
    assert!(insight
        .baseline_excluded
        .iter()
        .all(|entry| entry.workout_id != "x9"));
    let fact = &insight.facts[0];
    let comparison = fact.comparison.as_ref().unwrap();
    assert_eq!(comparison.baseline_value, 150.0, "基线均值必须只含授权样本");
    assert_eq!(fact.evidence_count, 3);
    assert_eq!(fact.evidence_refs, ["g1", "g2", "g3"]);
    assert_eq!(fact.confidence, Confidence::Low);
}

#[test]
fn rescore_promotes_beyond_max_samples_rows_into_freed_slots() {
    // 原基线满员 10 条，授权后只剩 2 条 included + 2 条可补位的授权排除行。
    let granted: BTreeSet<String> = ["g1", "g2", "p1", "p2", "target"]
        .iter()
        .map(|id| id.to_string())
        .collect();
    let mut rows = BTreeMap::new();
    for (i, id) in ["g1", "g2", "p1", "p2"].iter().enumerate() {
        rows.insert(
            id.to_string(),
            run(id, (i + 1) as u32, Some(10_000.0), Some(140)),
        );
    }
    let mut insight = WorkoutInsight {
        workout_id: "target".into(),
        workout_type: "run".into(),
        supported: true,
        unsupported_reason: None,
        unsupported_code: None,
        facts: vec![fact("distance", Some(10_000.0))],
        baseline_included: ["g1", "g2"]
            .iter()
            .enumerate()
            .map(|(i, id)| BaselineEntry {
                workout_id: id.to_string(),
                start_time: Utc
                    .with_ymd_and_hms(2026, 1, 25 - i as u32, 8, 0, 0)
                    .unwrap()
                    .to_rfc3339(),
                distance_meters: 10_000.0,
            })
            .collect(),
        baseline_excluded: vec![
            BaselineExclusion {
                workout_id: "p1".into(),
                reason: "beyond_max_samples".into(),
            },
            BaselineExclusion {
                workout_id: "x-out".into(), // 未授权，连排除表都不该出现
                reason: "beyond_max_samples".into(),
            },
            BaselineExclusion {
                workout_id: "p2".into(),
                reason: "beyond_max_samples".into(),
            },
        ],
        heart_rate_drift: None,
        heart_rate_drift_unavailable: None,
    };
    rescore_insight(&mut insight, &granted, &rows);
    let ids: Vec<&str> = insight
        .baseline_included
        .iter()
        .map(|entry| entry.workout_id.as_str())
        .collect();
    assert_eq!(ids.len(), 4);
    assert!(ids.contains(&"p1") && ids.contains(&"p2"));
    // 日期重新按新→旧排序：g1(1/25) > p1/p2/g2。
    assert_eq!(ids[0], "g1");
    assert!(insight.baseline_excluded.is_empty());
    assert_eq!(insight.facts[0].evidence_count, 4);
}

#[test]
fn rescore_thins_out_when_few_granted_samples_remain() {
    let granted: BTreeSet<String> = ["g1", "target"].iter().map(|id| id.to_string()).collect();
    let rows: BTreeMap<String, GrantedRun> =
        [("g1".to_string(), run("g1", 1, Some(10_000.0), Some(150)))]
            .into_iter()
            .collect();
    let mut insight = WorkoutInsight {
        workout_id: "target".into(),
        workout_type: "run".into(),
        supported: true,
        unsupported_reason: None,
        unsupported_code: None,
        facts: vec![fact("avg_hr", Some(160.0))],
        baseline_included: vec![BaselineEntry {
            workout_id: "g1".into(),
            start_time: Utc
                .with_ymd_and_hms(2026, 1, 1, 8, 0, 0)
                .unwrap()
                .to_rfc3339(),
            distance_meters: 10_000.0,
        }],
        baseline_excluded: Vec::new(),
        heart_rate_drift: None,
        heart_rate_drift_unavailable: None,
    };
    rescore_insight(&mut insight, &granted, &rows);
    let fact = &insight.facts[0];
    assert!(fact.comparison.is_none());
    assert_eq!(fact.reason_code.as_deref(), Some("workout_thin_baseline"));
    assert_eq!(fact.confidence, Confidence::Insufficient);
}

#[test]
fn rescore_leaves_unsupported_insights_alone() {
    let granted: BTreeSet<String> = ["target"].iter().map(|id| id.to_string()).collect();
    let mut insight = WorkoutInsight {
        workout_id: "target".into(),
        workout_type: "walk".into(),
        supported: false,
        unsupported_reason: Some("暂不支持".into()),
        unsupported_code: Some("unsupported_workout_type".into()),
        facts: Vec::new(),
        baseline_included: Vec::new(),
        baseline_excluded: Vec::new(),
        heart_rate_drift: None,
        heart_rate_drift_unavailable: None,
    };
    let snapshot = insight.clone();
    rescore_insight(&mut insight, &granted, &BTreeMap::new());
    assert_eq!(insight, snapshot);
}

/* ---------- shared_task_grants / 窗口展开 ---------- */

/// 造一个带 ai_tasks 行的库。表本身由 v32 迁移建好（S1）；
/// `payload` JSON 文本 + `mcp_shared` 索引列的约定若变，
/// 这里和装载逻辑要一起改。
fn library_with_tasks(payloads: &[(bool, &str)]) -> (Database, TestDir) {
    let dir = TestDir::new("tasks");
    let db = Database::open_migrated(&dir.0.join("zepp.db")).unwrap();
    for (index, (shared, payload)) in payloads.iter().enumerate() {
        db.conn
            .execute(
                "INSERT INTO ai_tasks(id, payload, mcp_shared, created_at, updated_at)
                     VALUES(?1, ?2, ?3, '', '')",
                rusqlite::params![format!("task-{index}"), payload, *shared as i64],
            )
            .unwrap();
    }
    (db, dir)
}

fn insert_run(db: &Database, workout_id: &str, month: u32, day: u32) {
    let start = Utc.with_ymd_and_hms(2026, month, day, 8, 0, 0).unwrap();
    let workout = Workout {
        workout_id: workout_id.into(),
        workout_type: "run".into(),
        normalized_type: "run".into(),
        type_source: "numeric_mapped".into(),
        user_override: None,
        effective_type: "run".into(),
        custom_label: None,
        start_time: start,
        end_time: start + Duration::minutes(50),
        distance_meters: Some(10_000.0),
        calories: Some(600),
        avg_hr: Some(150),
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
        device_id: Some("device-1".into()),
        synced_at: None,
        gps_available: false,
        sample_count: 0,
        zepp_source: None,
        zepp_type: Some(1),
    };
    db.insert_workout(&workout).unwrap();
}

#[test]
fn missing_ai_tasks_table_means_zero_grants() {
    let dir = TestDir::new("no-tasks");
    let db = Database::open_migrated(&dir.0.join("zepp.db")).unwrap();
    // v32 起迁移已建表；删掉它来模拟「还没跑到 v32 的旧库」。
    db.conn.execute_batch("DROP TABLE ai_tasks;").unwrap();
    assert_eq!(shared_task_grants(&db).unwrap(), Vec::new());
}

#[test]
fn shared_task_grants_expands_windows_per_workout() {
    let (db, _dir) = library_with_tasks(&[(
        true,
        r#"{"id":"t1","workout_ids":["w1","w2"],
                "categories":[
                    {"category":"sleep","enabled":true,"days_before":7,"include_workout_day":true},
                    {"category":"recovery","enabled":true,"days_before":3,"include_workout_day":false},
                    {"category":"body","enabled":false,"days_before":5,"include_workout_day":true},
                    {"category":"personal_note","enabled":true,"days_before":9,"include_workout_day":true}
                ]}"#,
    )]);
    insert_run(&db, "w1", 1, 10);
    insert_run(&db, "w2", 1, 20);
    let grants = shared_task_grants(&db).unwrap();
    assert_eq!(grants.len(), 1);
    assert_eq!(grants[0].task_id, "t1");
    // workout 类别没开：两条运动只是锚点，不是可读实体（R01）。
    assert_eq!(grants[0].anchor_workout_ids, ["w1", "w2"]);
    assert!(grants[0].workout_ids.is_empty());
    // sleep: 每条运动一个窗，1/3..1/10 与 1/13..1/20
    let sleep: Vec<&GrantWindow> = grants[0]
        .windows
        .iter()
        .filter(|w| w.category == AccessCategory::Sleep)
        .collect();
    assert_eq!(sleep.len(), 2);
    assert_eq!(
        (sleep[0].start_date, sleep[0].end_date),
        (day(1, 3), day(1, 10))
    );
    assert_eq!(
        (sleep[1].start_date, sleep[1].end_date),
        (day(1, 13), day(1, 20))
    );
    // recovery: include_workout_day=false → 右端是开始日前一天
    let recovery: Vec<&GrantWindow> = grants[0]
        .windows
        .iter()
        .filter(|w| w.category == AccessCategory::Recovery)
        .collect();
    assert_eq!(
        (recovery[0].start_date, recovery[0].end_date),
        (day(1, 7), day(1, 9))
    );
    // body 未启用、personal_note 非窗口类别 → 都不该有窗
    assert!(!grants[0].windows.iter().any(|w| matches!(
        w.category,
        AccessCategory::Body | AccessCategory::PersonalNote
    )));
}

#[test]
fn unshared_tasks_and_broken_payloads_grant_nothing() {
    let (db, _dir) = library_with_tasks(&[
        (
            false,
            r#"{"id":"off","workout_ids":["w1"],"categories":[]}"#,
        ),
        (true, "not json"),
        (true, r#"{"id":"on","workout_ids":[],"categories":[]}"#),
    ]);
    let grants = shared_task_grants(&db).unwrap();
    assert_eq!(grants.len(), 1, "只有 mcp_shared=1 且可解析的行才算数");
    assert_eq!(grants[0].task_id, "on");
    assert!(grants[0].windows.is_empty());
}

#[test]
fn grant_changes_take_effect_on_the_next_reload() {
    // 「两次调用之间翻转 mcp_shared」的库层等价物：每次调用都重读，
    // 所以第二次看到的就是新的授权状态。
    let (db, _dir) =
        library_with_tasks(&[(true, r#"{"id":"t1","workout_ids":[],"categories":[]}"#)]);
    assert_eq!(shared_task_grants(&db).unwrap().len(), 1);
    db.conn
        .execute("UPDATE ai_tasks SET mcp_shared = 0 WHERE id = 'task-0'", [])
        .unwrap();
    assert_eq!(shared_task_grants(&db).unwrap().len(), 0);
}

#[test]
fn latest_sleep_in_windows_picks_the_newest_in_window_only() {
    let dir = TestDir::new("sleep-windows");
    let db = Database::open_migrated(&dir.0.join("zepp.db")).unwrap();
    let session = |id: &str, month: u32, day: u32| {
        // end_time（醒来时刻）落在给定日，归属日按它算。
        let end = Utc.with_ymd_and_hms(2026, month, day, 6, 0, 0).unwrap();
        SleepSession {
            sleep_id: id.into(),
            start_time: end - Duration::hours(8),
            end_time: end,
            score: Some(80),
            duration_minutes: 480,
            deep_minutes: None,
            light_minutes: None,
            rem_minutes: None,
            awake_minutes: None,
            source_scope: SourceScope::Device,
            device_id: None,
            synced_at: None,
            time_in_bed_minutes: None,
            stages: Vec::new(),
            wake_count: None,
        }
    };
    db.insert_sleep_session(&session("in-old", 1, 5)).unwrap();
    db.insert_sleep_session(&session("in-new", 1, 12)).unwrap();
    db.insert_sleep_session(&session("outside", 1, 20)).unwrap();

    let mut permit = Permit::unrestricted();
    permit.windows = vec![window(AccessCategory::Sleep, day(1, 1), day(1, 15))];
    // 全库最新是 outside(1/20)，但授权窗只到 1/15 → 只能拿到 in-new。
    assert_eq!(
        latest_sleep_in_windows(&db, &permit).unwrap().as_deref(),
        Some("in-new")
    );
    permit.windows = vec![window(AccessCategory::Sleep, day(1, 1), day(1, 6))];
    assert_eq!(
        latest_sleep_in_windows(&db, &permit).unwrap().as_deref(),
        Some("in-old")
    );
    permit.windows = vec![window(AccessCategory::Sleep, day(2, 1), day(2, 6))];
    assert_eq!(latest_sleep_in_windows(&db, &permit).unwrap(), None);
}

/* ---------- 代码审查 R01：字段排除与类别开关 ---------- */

#[test]
fn excluded_metric_is_denied_even_though_its_category_has_a_window() {
    let grants = [grant(
        "t",
        &[],
        vec![excluding(
            window(AccessCategory::Recovery, day(1, 1), day(1, 20)),
            &["hrv"],
        )],
    )];
    let mut hrv = request("get_metric_series");
    hrv.categories = vec![AccessCategory::Recovery];
    hrv.metrics = vec!["hrv".into()];
    hrv.date_range = Some((day(1, 1), day(1, 20)));
    let denied = authorize(&AccessScope::TaskScoped, &grants, &hrv).unwrap_err();
    assert_eq!(denied.code, SCOPE_DENIED);

    // 同类别没被排除的指标照常放行，序列裁剪也只留它。
    let mut stress = hrv.clone();
    stress.metrics = vec!["stress".into()];
    let permit = authorize(&AccessScope::TaskScoped, &grants, &stress).unwrap();
    let clipped = clip_metric_series(
        vec![
            series("hrv", &["2026-01-05"]),
            series("stress", &["2026-01-05"]),
        ],
        &permit,
    );
    let names: Vec<&str> = clipped.iter().map(|s| s.metric.as_str()).collect();
    assert_eq!(names, ["stress"]);
}

#[test]
fn another_task_that_keeps_the_metric_opens_only_its_own_days() {
    // t1 排除 hrv（1/1–1/20），t2 不排除（1/15–1/25）：并集授权下 hrv 只在
    // t2 的日子里出得去；两个窗口排除集不同，不能被合并成一段。
    let grants = [
        grant(
            "t1",
            &[],
            vec![excluding(
                window(AccessCategory::Recovery, day(1, 1), day(1, 20)),
                &["hrv"],
            )],
        ),
        grant(
            "t2",
            &[],
            vec![window(AccessCategory::Recovery, day(1, 15), day(1, 25))],
        ),
    ];
    let mut req = request("get_metric_series");
    req.categories = vec![AccessCategory::Recovery];
    req.metrics = vec!["hrv".into()];
    req.date_range = Some((day(1, 1), day(1, 31)));
    let permit = authorize(&AccessScope::TaskScoped, &grants, &req).unwrap();
    assert!(!permit.metric_permitted(AccessCategory::Recovery, "hrv", day(1, 5)));
    assert!(permit.metric_permitted(AccessCategory::Recovery, "hrv", day(1, 18)));
    assert!(permit.metric_permitted(AccessCategory::Recovery, "stress", day(1, 5)));
    let clipped = clip_metric_series(vec![series("hrv", &["2026-01-05", "2026-01-18"])], &permit);
    assert_eq!(clipped[0].points.len(), 1);
    assert_eq!(clipped[0].points[0].date, "2026-01-18");
    assert_eq!(clipped[0].window_days, 11);
}

#[test]
fn workout_fields_stay_hidden_unless_some_task_shows_them() {
    let mut t1 = grant("t1", &["w1"], Vec::new());
    t1.workout_excluded = ["avg_hr".to_string(), "calories".to_string()].into();
    let mut t2 = grant("t2", &["w1"], Vec::new());
    t2.workout_excluded = ["avg_hr".to_string()].into();
    let mut req = request("list_workouts");
    req.categories = vec![AccessCategory::Workout];
    let permit = authorize(&AccessScope::TaskScoped, &[t1, t2], &req).unwrap();
    let excluded = permit.workout_excluded_fields("w1");
    assert_eq!(excluded, ["avg_hr".to_string()].into());

    let mut entry = serde_json::json!({"workoutId": "w1", "avgHr": 150, "calories": 500});
    project_workout_list_entry(&mut entry, &excluded);
    assert!(entry.get("avgHr").is_none());
    assert_eq!(entry["calories"], 500);
}

#[test]
fn excluded_sleep_stage_minutes_take_the_stage_timeline_with_them() {
    let grants = [grant(
        "t",
        &[],
        vec![excluding(
            window(AccessCategory::Sleep, day(1, 1), day(1, 20)),
            &["deep_minutes"],
        )],
    )];
    let mut req = request("get_sleep_detail");
    req.categories = vec![AccessCategory::Sleep];
    let permit = authorize(&AccessScope::TaskScoped, &grants, &req).unwrap();
    let excluded = permit.sleep_excluded_fields(day(1, 10));
    let mut sleep = serde_json::json!({
        "sleep_id": "s", "deep_minutes": 80, "light_minutes": 200, "stages": [{"stage": "deep"}]
    });
    project_sleep_fields(&mut sleep, &excluded);
    assert!(sleep.get("deep_minutes").is_none());
    assert!(sleep.get("stages").is_none(), "阶段片能算回深睡分钟数");
    assert_eq!(sleep["light_minutes"], 200);
}

#[test]
fn a_disabled_workout_category_keeps_the_anchor_but_not_the_entity() {
    let (db, _dir) = library_with_tasks(&[(
        true,
        r#"{"id":"t","workout_ids":["w1"],"categories":[
            {"category":"workout","enabled":false},
            {"category":"recovery","enabled":true,"days_before":3,"excluded_metrics":["hrv"]}
        ]}"#,
    )]);
    insert_run(&db, "w1", 1, 10);
    let grants = shared_task_grants(&db).unwrap();
    assert!(grants[0].workout_ids.is_empty());
    assert_eq!(grants[0].windows.len(), 1, "锚点照样定出 recovery 窗口");
    assert!(grants[0].windows[0].excluded.contains("hrv"));

    let mut insight = request("get_workout_insight");
    insight.categories = vec![AccessCategory::Workout];
    insight.workout_ids = vec!["w1".into()];
    assert!(authorize(&AccessScope::TaskScoped, &grants, &insight).is_err());
}

/// R12：不选运动的任务，导出和 MCP 的日期窗必须是同一段（以前导出 15 天、MCP 一天都没有）。
/// 两边都走 `ai_tasks::coverage::task_window`；这里把 MCP 的授权窗和导出的窗逐一对照。
#[test]
fn a_task_without_workouts_gets_the_same_window_in_export_and_mcp() {
    use crate::ai_tasks::coverage::category_windows;
    use crate::ai_tasks::model::AiTaskCategoryRange;
    for (days_before, include_day) in [(14, true), (0, true), (7, false)] {
        let range_json = format!(
            r#"{{"category":"sleep","enabled":true,"days_before":{days_before},"include_workout_day":{include_day}}}"#
        );
        let (db, _dir) = library_with_tasks(&[(
            true,
            &format!(r#"{{"id":"t","workout_ids":[],"categories":[{range_json}]}}"#),
        )]);
        let grants = shared_task_grants(&db).unwrap();
        let mcp: Vec<(NaiveDate, NaiveDate)> = grants[0]
            .windows
            .iter()
            .map(|window| (window.start_date, window.end_date))
            .collect();
        let range: AiTaskCategoryRange = serde_json::from_str(&range_json).unwrap();
        let export: Vec<(NaiveDate, NaiveDate)> =
            category_windows(&range, &[], Local::now().date_naive())
                .into_iter()
                .map(|(_, start, end)| (start, end))
                .collect();
        assert_eq!(
            mcp, export,
            "days_before={days_before} include_day={include_day}"
        );
        assert_eq!(mcp.len(), 1, "没关联运动也要有一段「最近 N 天」的窗");
    }
}

/// 关联了运动、但一条都查不到：不退回「今天」——导出会直接报错，MCP 就什么都不授权。
#[test]
fn a_task_whose_workouts_are_all_missing_grants_nothing() {
    let (db, _dir) = library_with_tasks(&[(
        true,
        r#"{"id":"t","workout_ids":["ghost"],"categories":[
            {"category":"sleep","enabled":true,"days_before":14}
        ]}"#,
    )]);
    let grants = shared_task_grants(&db).unwrap();
    assert!(grants[0].windows.is_empty());
}
