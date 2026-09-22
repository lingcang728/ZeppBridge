//! A7 协议行为的收口测试：迁移、CRUD、内置模板只读、P4 窗口、去重、
//! 附件隐私、prepare 落盘与 blocked、MCP 授权窗口。

use super::export::stat_task_attachments;
use super::model::*;
use super::store::normalize_task;
use crate::access::{granted_windows, shared_task_grants, AccessCategory};
use crate::models::error::ZeppBridgeError;
use crate::models::{DailyMetric, MetricSample, SleepSession, SourceScope, Workout};
use crate::storage::{Database, CURRENT_SCHEMA_VERSION};
use chrono::{DateTime, Duration, Local, NaiveDate, TimeZone, Utc};

// ---------- 小工具 ----------

fn err_code(error: &ZeppBridgeError) -> &str {
    error.code()
}

fn utc(y: i32, m: u32, d: u32, h: u32) -> DateTime<Utc> {
    Utc.with_ymd_and_hms(y, m, d, h, 0, 0).unwrap()
}

/// 运动的本地开始日——P4 的锚点日。测试与实现走同一条 localtime 换算，
/// 什么时区跑都成立。
fn local_day(t: DateTime<Utc>) -> NaiveDate {
    t.with_timezone(&Local).date_naive()
}

fn insert_workout(db: &Database, id: &str, start: DateTime<Utc>) {
    db.insert_workout(&Workout {
        workout_id: id.to_string(),
        workout_type: "running".into(),
        normalized_type: "running".into(),
        type_source: "string_field".into(),
        effective_type: "running".into(),
        start_time: start,
        end_time: start + Duration::hours(1),
        distance_meters: Some(10_000.0),
        calories: Some(600),
        avg_hr: Some(140),
        max_hr: Some(170),
        source_scope: SourceScope::UserFused,
        ..Default::default()
    })
    .unwrap();
}

fn insert_sleep(db: &Database, id: &str, end: DateTime<Utc>) {
    db.insert_sleep_session(&SleepSession {
        sleep_id: id.to_string(),
        start_time: end - Duration::hours(7),
        end_time: end,
        score: Some(82),
        duration_minutes: 400,
        deep_minutes: Some(90),
        light_minutes: Some(220),
        rem_minutes: Some(70),
        awake_minutes: Some(20),
        source_scope: SourceScope::Device,
        device_id: None,
        synced_at: None,
        time_in_bed_minutes: None,
        stages: Vec::new(),
        wake_count: Some(2),
    })
    .unwrap();
}

fn insert_daily(db: &Database, metric: &str, date: NaiveDate, value: f64) {
    db.insert_daily_metric(&DailyMetric {
        date: date.to_string(),
        metric: metric.to_string(),
        value,
        unit: "x".into(),
        source_scope: SourceScope::UserFused,
        device_id: None,
    })
    .unwrap();
}

fn insert_sample(db: &Database, metric: &str, ts: DateTime<Utc>, value: f64) {
    db.insert_metric_sample(&MetricSample {
        metric: metric.to_string(),
        timestamp: ts,
        value,
        unit: "x".into(),
        source_scope: SourceScope::Device,
        device_id: None,
    })
    .unwrap();
}

fn range(category: AiTaskCategory, days_before: i64, include_day: bool) -> AiTaskCategoryRange {
    AiTaskCategoryRange {
        category,
        enabled: true,
        days_before,
        include_workout_day: include_day,
    }
}

fn task() -> AiTask {
    AiTask {
        schema_version: AI_TASK_SCHEMA_VERSION,
        id: String::new(),
        title: "测试任务".into(),
        template_id: None,
        workout_ids: Vec::new(),
        categories: Vec::new(),
        detail_level: AiTaskDetailLevel::Standard,
        prompt: "看看最近状态".into(),
        personal_note: String::new(),
        attachments: Vec::new(),
        include_precise_gps: false,
        mcp_shared: false,
        created_at: String::new(),
        updated_at: String::new(),
    }
}

fn template(id: &str, builtin: bool) -> AiTaskTemplate {
    AiTaskTemplate {
        schema_version: AI_TASK_SCHEMA_VERSION,
        id: id.to_string(),
        builtin,
        name: "模板".into(),
        name_code: None,
        categories: Vec::new(),
        detail_level: AiTaskDetailLevel::Standard,
        prompt_template: String::new(),
        prompt_code: None,
        default_summaries: Vec::new(),
        required_series: Vec::new(),
        created_at: String::new(),
        updated_at: String::new(),
    }
}

fn temp_dir(tag: &str) -> std::path::PathBuf {
    let dir = std::env::temp_dir().join(format!("zb-ai-task-test-{tag}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

// ---------- v32 迁移 ----------

#[test]
fn v32_migration_creates_tables_and_seeds_three_builtins() {
    let db = Database::in_memory().unwrap();
    let version: i64 = db
        .conn
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .unwrap();
    assert_eq!(version, CURRENT_SCHEMA_VERSION);
    db.conn
        .query_row("SELECT COUNT(*) FROM ai_tasks", [], |row| {
            row.get::<_, i64>(0)
        })
        .unwrap();

    let templates = db.list_ai_task_templates().unwrap();
    assert_eq!(templates.len(), 3);
    let ids: Vec<&str> = templates.iter().map(|t| t.id.as_str()).collect();
    assert!(ids.contains(&"recovery_run"));
    assert!(ids.contains(&"long_run_compare"));
    assert!(ids.contains(&"hr_drift"));
    for template in &templates {
        assert!(template.builtin);
        assert_eq!(template.schema_version, 1);
        assert_eq!(
            template.name_code.as_deref(),
            Some(format!("ui.ai_template.{}.name", template.id).as_str())
        );
        assert_eq!(
            template.prompt_code.as_deref(),
            Some(format!("ui.ai_template.{}.prompt", template.id).as_str())
        );
        // 内置 payload 的类别列表总是完整八项。
        assert_eq!(template.categories.len(), 8);
    }
}

#[test]
fn v32_upgrade_from_v31_seeds_builtins_and_stays_idempotent() {
    // 先建一个全量 v32 库，再倒回 v31 并拆掉新表——这才是「真 v31 老库」
    // 的形状：全部旧表都在，只差 ai_tasks / ai_task_templates。
    let dir = temp_dir("v31");
    let path = dir.join("zepp.db");
    drop(Database::open_migrated(&path).unwrap());
    {
        let conn = rusqlite::Connection::open(&path).unwrap();
        conn.execute_batch(
            "DROP TABLE ai_tasks;
             DROP TABLE ai_task_templates;
             PRAGMA user_version = 31;",
        )
        .unwrap();
    }
    let db = Database::open_migrated(&path).unwrap();
    let version: i64 = db
        .conn
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .unwrap();
    assert_eq!(version, CURRENT_SCHEMA_VERSION);
    assert_eq!(db.list_ai_task_templates().unwrap().len(), 3);
    drop(db);

    // 只读连接接受当前 schema 版本。
    let ro = Database::open_read_only(path.clone()).unwrap();
    assert_eq!(ro.list_ai_task_templates().unwrap().len(), 3);
    drop(ro);

    // 删掉一条内置行再迁移一次——INSERT OR IGNORE 自愈回来。
    {
        let conn = rusqlite::Connection::open(&path).unwrap();
        conn.execute(
            "DELETE FROM ai_task_templates WHERE id = 'recovery_run'",
            [],
        )
        .unwrap();
    }
    let db = Database::open_migrated(&path).unwrap();
    assert_eq!(db.list_ai_task_templates().unwrap().len(), 3);
    let _ = std::fs::remove_dir_all(&dir);
}

// ---------- CRUD ----------

#[test]
fn task_crud_roundtrip() {
    let db = Database::in_memory().unwrap();
    let mut t = task();
    t.schema_version = 99; // 前端乱报也要钉回 1
    t.workout_ids = vec!["w1".into(), "w1".into(), " w2 ".into(), "w1".into()];
    t.template_id = Some("  ".into());

    let saved = db.save_ai_task(&t).unwrap();
    assert!(saved.id.starts_with("task-"));
    assert_eq!(saved.schema_version, 1);
    assert!(!saved.created_at.is_empty() && !saved.updated_at.is_empty());
    assert_eq!(saved.workout_ids, vec!["w1".to_string(), "w2".to_string()]);
    assert_eq!(saved.template_id, None);

    let fetched = db.require_ai_task(&saved.id).unwrap();
    assert_eq!(fetched.title, "测试任务");

    let list = db.list_ai_tasks().unwrap();
    assert_eq!(list.len(), 1);
    assert_eq!(list[0].workout_count, 2);
    assert!(!list[0].mcp_shared);

    // 更新：created_at 保留，mcp_shared 翻转走同一条 save。
    let mut again = fetched.clone();
    again.mcp_shared = true;
    again.title = "改名".into();
    let saved2 = db.save_ai_task(&again).unwrap();
    assert_eq!(saved2.created_at, fetched.created_at);
    assert!(db.list_ai_tasks().unwrap()[0].mcp_shared);

    db.delete_ai_task(&saved.id).unwrap();
    let error = db.delete_ai_task(&saved.id).unwrap_err();
    assert_eq!(err_code(&error), "err.ai_task.not_found");
    let error = db.require_ai_task(&saved.id).unwrap_err();
    assert_eq!(err_code(&error), "err.ai_task.not_found");
}

#[test]
fn task_validation_rejects_bad_input() {
    let db = Database::in_memory().unwrap();

    let mut t = task();
    t.title = " ".into();
    assert_eq!(
        err_code(&db.save_ai_task(&t).unwrap_err()),
        "err.ai_task.invalid"
    );

    let mut t = task();
    t.categories = vec![range(AiTaskCategory::Sleep, 400, true)];
    assert_eq!(
        err_code(&db.save_ai_task(&t).unwrap_err()),
        "err.ai_task.invalid"
    );

    // 同类别重复出现只留第一个。
    let mut t = task();
    t.categories = vec![
        range(AiTaskCategory::Sleep, 7, true),
        range(AiTaskCategory::Sleep, 99, false),
        range(AiTaskCategory::Workout, 3, true),
    ];
    let normalized = normalize_task(&t).unwrap();
    assert_eq!(normalized.categories.len(), 2);
    assert_eq!(normalized.categories[0].days_before, 7);
    assert!(normalized.categories[0].enabled);

    // 附件缺字段不行。
    let mut t = task();
    t.attachments = vec![AiTaskAttachmentRef {
        id: "a1".into(),
        path: " ".into(),
        display_name: "体检报告".into(),
        kind: AiTaskAttachmentKind::Pdf,
        byte_len: None,
        added_at: "2026-09-01T00:00:00Z".into(),
    }];
    assert_eq!(
        err_code(&db.save_ai_task(&t).unwrap_err()),
        "err.ai_task.invalid"
    );
}

#[test]
fn builtin_templates_are_readonly() {
    let db = Database::in_memory().unwrap();

    // 改内置 → builtin_readonly
    let mut copy = db.get_ai_task_template("recovery_run").unwrap().unwrap();
    copy.name = "改名".into();
    assert_eq!(
        err_code(&db.save_ai_task_template(&copy).unwrap_err()),
        "err.ai_template.builtin_readonly"
    );
    assert_eq!(
        err_code(&db.delete_ai_task_template("recovery_run").unwrap_err()),
        "err.ai_template.builtin_readonly"
    );
    // 新 id 也塞不进 builtin=true
    assert_eq!(
        err_code(
            &db.save_ai_task_template(&template("tmpl-x", true))
                .unwrap_err()
        ),
        "err.ai_template.invalid"
    );

    // 「另存为用户模板」是唯一合法路径。
    let mut mine = template("", false);
    mine.name_code = Some("ui.ai_template.recovery_run.name".into());
    let saved = db.save_ai_task_template(&mine).unwrap();
    assert!(saved.id.starts_with("tmpl-"));
    assert!(!saved.builtin);
    assert_eq!(saved.name_code, None, "用户模板不许带内置词条句柄");

    // 用户模板可改可删；删不存在的 → not_found。
    let mut rename = db.get_ai_task_template(&saved.id).unwrap().unwrap();
    rename.name = "我的模板".into();
    db.save_ai_task_template(&rename).unwrap();
    db.delete_ai_task_template(&saved.id).unwrap();
    assert_eq!(
        err_code(&db.delete_ai_task_template(&saved.id).unwrap_err()),
        "err.ai_template.not_found"
    );
}

// ---------- P4 覆盖 ----------

#[test]
fn coverage_windows_follow_p4_edges() {
    let db = Database::in_memory().unwrap();
    let start = utc(2026, 9, 10, 10);
    insert_workout(&db, "w1", start);
    let anchor_day = local_day(start);
    insert_daily(&db, "resting_hr", anchor_day - Duration::days(1), 52.0);
    insert_daily(&db, "resting_hr", anchor_day, 51.0);

    let mut t = task();
    t.workout_ids = vec!["w1".into()];
    t.categories = vec![range(AiTaskCategory::Recovery, 3, true)];
    let preview = db.ai_task_preview(&t).unwrap();
    let row = preview
        .coverage
        .iter()
        .find(|r| r.category == AiTaskCategory::Recovery)
        .unwrap();
    assert_eq!(row.start_date, (anchor_day - Duration::days(3)).to_string());
    assert_eq!(row.end_date, anchor_day.to_string());
    assert_eq!(row.days_in_range, 4);
    assert_eq!(row.days_with_data, 2);
    assert!(!row.missing);
    assert!(row.sources.contains(&"user_fused".to_string()));
    assert!(row.units.contains_key("resting_hr"));

    // include_workout_day=false → 右端是前一天。
    let mut t = task();
    t.workout_ids = vec!["w1".into()];
    t.categories = vec![range(AiTaskCategory::Recovery, 3, false)];
    let preview = db.ai_task_preview(&t).unwrap();
    let row = &preview.coverage[0];
    assert_eq!(row.end_date, (anchor_day - Duration::days(1)).to_string());
    assert_eq!(row.days_in_range, 3);
    assert_eq!(row.days_with_data, 1);

    // days_before=0 且不含当天 → 空窗，不产行。
    let mut t = task();
    t.workout_ids = vec!["w1".into()];
    t.categories = vec![range(AiTaskCategory::Recovery, 0, false)];
    let preview = db.ai_task_preview(&t).unwrap();
    assert!(preview.coverage.is_empty());
}

#[test]
fn coverage_dedups_overlapping_windows_and_links_anchors() {
    let db = Database::in_memory().unwrap();
    let s1 = utc(2026, 9, 10, 10);
    let s2 = utc(2026, 9, 12, 10);
    insert_workout(&db, "w1", s1);
    insert_workout(&db, "w2", s2);
    let d1 = local_day(s1);
    let d2 = local_day(s2);
    // 重叠日（在两条窗口里都在）上的数据。
    let overlap_day = d1.max(d2 - Duration::days(3));
    insert_daily(&db, "resting_hr", overlap_day, 55.0);

    let mut t = task();
    t.workout_ids = vec!["w1".into(), "w2".into()];
    t.categories = vec![range(AiTaskCategory::Recovery, 3, true)];

    let preview = db.ai_task_preview(&t).unwrap();
    let rows: Vec<_> = preview
        .coverage
        .iter()
        .filter(|r| r.category == AiTaskCategory::Recovery)
        .collect();
    // 每锚点一行 + 一行合并视图。
    assert_eq!(rows.len(), 3);
    let merged = rows.iter().find(|r| r.workout_id.is_none()).unwrap();
    assert_eq!(merged.start_date, (d1 - Duration::days(3)).to_string());
    assert_eq!(merged.end_date, d2.to_string());
    assert!(merged.days_in_range >= 4);
    assert!(merged.days_with_data >= 1);

    // 出仓文档里重叠日的 (category,date) 只出现一次，linked 两个锚点。
    let dir = temp_dir("dedup");
    let prepared = db.ai_task_prepare(&t, "", &dir).unwrap();
    assert_eq!(prepared.status, AiTaskPrepareStatus::Ready);
    let json_text = std::fs::read_to_string(prepared.json_path.unwrap()).unwrap();
    let doc: serde_json::Value = serde_json::from_str(&json_text).unwrap();
    let context = doc["context"].as_array().unwrap();
    let recovery = context
        .iter()
        .find(|c| c["category"] == "recovery")
        .unwrap();
    let days = recovery["days"].as_array().unwrap();
    let overlap_entries: Vec<_> = days
        .iter()
        .filter(|d| d["date"] == overlap_day.to_string())
        .collect();
    assert_eq!(overlap_entries.len(), 1, "(category,date) 必须去重");
    let linked: Vec<&str> = overlap_entries[0]["linked_workout_ids"]
        .as_array()
        .unwrap()
        .iter()
        .map(|v| v.as_str().unwrap())
        .collect();
    assert!(linked.contains(&"w1") && linked.contains(&"w2"));
    // 同一天的同一指标只写一次。
    let resting: Vec<_> = overlap_entries[0]["metrics"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|m| m["metric"] == "resting_hr")
        .collect();
    assert_eq!(resting.len(), 1);
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn sleep_coverage_attributes_by_wake_day() {
    let db = Database::in_memory().unwrap();
    let start = utc(2026, 9, 10, 10);
    insert_workout(&db, "w1", start);
    let anchor_day = local_day(start);
    // 睡眠按 end_time（醒来日）归属——这个语义不许变。
    let sleep_end = utc(2026, 9, 10, 22);
    insert_sleep(&db, "s1", sleep_end);
    let expected_day = local_day(sleep_end);

    let mut t = task();
    t.workout_ids = vec!["w1".into()];
    t.categories = vec![range(AiTaskCategory::Sleep, 7, true)];
    let preview = db.ai_task_preview(&t).unwrap();
    let row = preview
        .coverage
        .iter()
        .find(|r| r.category == AiTaskCategory::Sleep)
        .unwrap();
    let window_start = anchor_day - Duration::days(7);
    let in_window = expected_day >= window_start && expected_day <= anchor_day;
    assert_eq!(row.days_with_data, i64::from(in_window));
    assert_eq!(row.missing, !in_window);
}

#[test]
fn missing_workout_is_a_coded_error() {
    let db = Database::in_memory().unwrap();
    let mut t = task();
    t.workout_ids = vec!["ghost-1".into(), "ghost-2".into()];
    let error = db.ai_task_preview(&t).unwrap_err();
    assert_eq!(err_code(&error), "err.ai_task.workout_not_found");
    if let ZeppBridgeError::AiTask(inner) = &error {
        let params = inner.params().unwrap();
        assert_eq!(params["workout_ids"].as_array().unwrap().len(), 2);
    } else {
        panic!("应当返回 AiTask 错误");
    }
}

// ---------- 附件 / prepare ----------

#[test]
fn attachments_report_ok_changed_missing() {
    let dir = temp_dir("att");
    let file = dir.join("report.pdf");
    std::fs::write(&file, b"12345").unwrap();
    let file_text = file.to_string_lossy().into_owned();

    let refs = vec![
        AiTaskAttachmentRef {
            id: "ok".into(),
            path: file_text.clone(),
            display_name: "报告.pdf".into(),
            kind: AiTaskAttachmentKind::Pdf,
            byte_len: Some(5),
            added_at: "2026-09-01T00:00:00Z".into(),
        },
        AiTaskAttachmentRef {
            id: "changed".into(),
            path: file_text.clone(),
            display_name: "报告.pdf".into(),
            kind: AiTaskAttachmentKind::Pdf,
            byte_len: Some(999),
            added_at: "2026-09-01T00:00:00Z".into(),
        },
        AiTaskAttachmentRef {
            id: "gone".into(),
            path: dir.join("missing.pdf").to_string_lossy().into_owned(),
            display_name: "没了.pdf".into(),
            kind: AiTaskAttachmentKind::Pdf,
            byte_len: Some(5),
            added_at: "2026-09-01T00:00:00Z".into(),
        },
        AiTaskAttachmentRef {
            id: "no-baseline".into(),
            path: file_text.clone(),
            display_name: "报告.pdf".into(),
            kind: AiTaskAttachmentKind::Pdf,
            byte_len: None,
            added_at: "2026-09-01T00:00:00Z".into(),
        },
    ];
    let statuses = stat_task_attachments(&refs);
    assert_eq!(statuses[0].status, AiTaskAttachmentState::Ok);
    assert_eq!(statuses[0].byte_len, Some(5));
    assert_eq!(statuses[1].status, AiTaskAttachmentState::Changed);
    assert_eq!(statuses[2].status, AiTaskAttachmentState::Missing);
    assert_eq!(statuses[2].byte_len, None);
    // byte_len=None 的基线无法判断变化——存在即 ok。
    assert_eq!(statuses[3].status, AiTaskAttachmentState::Ok);
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn prepare_blocks_on_missing_attachment_and_writes_nothing() {
    let db = Database::in_memory().unwrap();
    insert_workout(&db, "w1", utc(2026, 9, 10, 10));
    let dir = temp_dir("blocked");

    let mut t = task();
    t.workout_ids = vec!["w1".into()];
    t.categories = vec![range(AiTaskCategory::Recovery, 3, true)];
    t.attachments = vec![AiTaskAttachmentRef {
        id: "a1".into(),
        path: dir.join("ghost.pdf").to_string_lossy().into_owned(),
        display_name: "体检报告.pdf".into(),
        kind: AiTaskAttachmentKind::Pdf,
        byte_len: Some(10),
        added_at: "2026-09-01T00:00:00Z".into(),
    }];
    let result = db.ai_task_prepare(&t, "范围说明", &dir).unwrap();
    assert_eq!(result.status, AiTaskPrepareStatus::Blocked);
    assert!(result.json_path.is_none() && result.prompt_path.is_none());
    assert_eq!(
        result.blocked[0].code, "err.ai_task.attachment_missing",
        "P2 定稿：missing 附件在 blocked 里列这个码"
    );
    // blocked 时一个文件都不能写——目录都不该被建出来。
    assert!(!std::path::Path::new(&result.output_dir).exists());
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn prepare_blocks_when_no_workouts() {
    let db = Database::in_memory().unwrap();
    let dir = temp_dir("noworkout");
    let mut t = task();
    t.categories = vec![range(AiTaskCategory::Sleep, 3, true)];
    let result = db.ai_task_prepare(&t, "", &dir).unwrap();
    assert_eq!(result.status, AiTaskPrepareStatus::Blocked);
    assert_eq!(result.blocked[0].code, "ui.ai_task.blocked.no_workouts");
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn public_export_never_contains_attachment_paths_or_device_ids() {
    let db = Database::in_memory().unwrap();
    insert_workout(&db, "w1", utc(2026, 9, 10, 10));
    let anchor_day = local_day(utc(2026, 9, 10, 10));
    insert_daily(&db, "resting_hr", anchor_day, 50.0);
    insert_sleep(&db, "s1", utc(2026, 9, 10, 22));
    insert_sample(&db, "heart_rate", utc(2026, 9, 10, 12), 62.0);

    let dir = temp_dir("privacy");
    let secret_path = dir.join("绝密体检报告.pdf");
    std::fs::write(&secret_path, b"abc").unwrap();

    let mut t = task();
    t.workout_ids = vec!["w1".into()];
    t.categories = vec![
        range(AiTaskCategory::Sleep, 3, true),
        range(AiTaskCategory::HeartRate, 3, true),
        range(AiTaskCategory::Attachment, 0, true),
    ];
    t.attachments = vec![AiTaskAttachmentRef {
        id: "a1".into(),
        path: secret_path.to_string_lossy().into_owned(),
        display_name: "体检报告.pdf".into(),
        kind: AiTaskAttachmentKind::Pdf,
        byte_len: Some(3),
        added_at: "2026-09-01T00:00:00Z".into(),
    }];

    let result = db.ai_task_prepare(&t, "覆盖说明", &dir).unwrap();
    assert_eq!(result.status, AiTaskPrepareStatus::Ready);
    let json_text = std::fs::read_to_string(result.json_path.unwrap()).unwrap();

    // 本机路径绝不出现在出仓 JSON 里——连值都搜不到。
    assert!(!json_text.contains("绝密体检报告"));
    let doc: serde_json::Value = serde_json::from_str(&json_text).unwrap();
    let attachment = &doc["attachments"][0];
    assert_eq!(attachment["display_name"], "体检报告.pdf");
    assert!(attachment.get("path").is_none());
    assert!(attachment.get("id").is_none());

    // device_id 这种身份键从构造起就不在字段名单里。
    assert!(!json_text.contains("device_id"));

    // prompt.txt 也落了。
    let prompt = std::fs::read_to_string(result.prompt_path.unwrap()).unwrap();
    assert!(prompt.contains("看看最近状态"));
    assert!(prompt.contains("覆盖说明"));
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn prepare_strips_local_paths_from_user_note_and_prompt() {
    let db = Database::in_memory().unwrap();
    insert_workout(&db, "w1", utc(2026, 9, 10, 10));
    let dir = temp_dir("sanitize-user-text");

    let mut t = task();
    t.workout_ids = vec!["w1".into()];
    t.categories = vec![range(AiTaskCategory::Recovery, 3, true)];
    t.personal_note = "原始报告在 C:\\Users\\me\\secret-note.pdf 里".into();
    t.prompt = "帮我分析，参考 D:\\private-dir\\old.json".into();

    let result = db.ai_task_prepare(&t, "", &dir).unwrap();
    assert_eq!(result.status, AiTaskPrepareStatus::Ready);

    // 出仓 JSON 与返回的 prompt_text 都不许再带本机路径。
    let json_text = std::fs::read_to_string(result.json_path.unwrap()).unwrap();
    assert!(
        !json_text.contains("secret-note"),
        "note 里的文件名不该出仓"
    );
    let doc: serde_json::Value = serde_json::from_str(&json_text).unwrap();
    let note = doc["task"]["personal_note"].as_str().unwrap();
    assert!(!note.contains("C:\\"));
    assert!(note.contains("[本地路径已移除]"));

    assert!(!result.prompt_text.contains("private-dir"));
    assert!(result.prompt_text.contains("[本地路径已移除]"));
    // URL 不是本地路径——清洗不该误伤。
    let mut t = task();
    t.workout_ids = vec!["w1".into()];
    t.categories = vec![range(AiTaskCategory::Recovery, 3, true)];
    t.prompt = "参考 https://example.com/report 的方法".into();
    let result = db.ai_task_prepare(&t, "", &dir).unwrap();
    assert!(result.prompt_text.contains("https://example.com/report"));
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn preview_estimated_bytes_matches_pretty_written_file() {
    let db = Database::in_memory().unwrap();
    insert_workout(&db, "w1", utc(2026, 9, 10, 10));
    let dir = temp_dir("estimate");

    let mut t = task();
    t.workout_ids = vec!["w1".into()];
    t.categories = vec![range(AiTaskCategory::Recovery, 3, true)];

    let preview = db.ai_task_preview(&t).unwrap();
    let prepared = db.ai_task_prepare(&t, "", &dir).unwrap();
    assert_eq!(prepared.status, AiTaskPrepareStatus::Ready);
    // 估算与实写必须同量级一致——文档里的 generated_at 时间戳在两次构造间
    // 可能差几位小数（AutoSi 3/6/9 位），容差留给它，格式差异可不止这几位。
    let drift = (preview.estimated_bytes - prepared.byte_len).abs();
    assert!(
        drift <= 16,
        "估算与实写只允许时间戳位数漂移（drift={drift}）"
    );
    let on_disk = std::fs::metadata(prepared.json_path.unwrap())
        .unwrap()
        .len() as i64;
    assert_eq!(
        prepared.byte_len, on_disk,
        "byte_len 必须等于落盘文件实际大小"
    );
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn prepare_uses_template_prompt_when_user_prompt_empty() {
    let db = Database::in_memory().unwrap();
    insert_workout(&db, "w1", utc(2026, 9, 10, 10));
    let dir = temp_dir("prompt");
    let mut t = task();
    t.workout_ids = vec!["w1".into()];
    t.categories = vec![range(AiTaskCategory::Sleep, 3, true)];
    t.prompt = String::new();
    t.template_id = Some("recovery_run".into());
    let result = db.ai_task_prepare(&t, "备注段", &dir).unwrap();
    assert!(result.prompt_text.contains("恢复跑"));
    assert!(result.prompt_text.contains("备注段"));
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn precise_gps_opt_in_gates_route_key() {
    let db = Database::in_memory().unwrap();
    insert_workout(&db, "w1", utc(2026, 9, 10, 10));
    let dir = temp_dir("gps");

    let mut t = task();
    t.workout_ids = vec!["w1".into()];
    t.categories = vec![range(AiTaskCategory::Workout, 0, true)];
    t.detail_level = AiTaskDetailLevel::Detailed;

    // 默认关：route 键根本不出现。
    let result = db.ai_task_prepare(&t, "", &dir).unwrap();
    let json_text = std::fs::read_to_string(result.json_path.unwrap()).unwrap();
    assert!(!json_text.contains("\"route\""));

    // 显式打开才带。
    t.include_precise_gps = true;
    let result = db.ai_task_prepare(&t, "", &dir).unwrap();
    let json_text = std::fs::read_to_string(result.json_path.unwrap()).unwrap();
    let doc: serde_json::Value = serde_json::from_str(&json_text).unwrap();
    assert!(doc["workouts"][0]["series"].get("route").is_some());
    let _ = std::fs::remove_dir_all(&dir);
}

// ---------- MCP 授权窗口 ----------

#[test]
fn shared_grants_expand_only_shared_tasks() {
    let db = Database::in_memory().unwrap();
    insert_workout(&db, "w1", utc(2026, 9, 10, 10));

    let mut t = task();
    t.workout_ids = vec!["w1".into()];
    t.categories = vec![
        range(AiTaskCategory::Recovery, 3, true),
        range(AiTaskCategory::PersonalNote, 0, true),
    ];
    t.mcp_shared = true;
    let shared = db.save_ai_task(&t).unwrap();

    // 未共享的任务不进授权面。
    let mut t2 = task();
    t2.title = "不共享".into();
    t2.workout_ids = vec!["w1".into()];
    db.save_ai_task(&t2).unwrap();

    let grants = shared_task_grants(&db).unwrap();
    assert_eq!(grants.len(), 1);
    let grant = &grants[0];
    assert_eq!(grant.task_id, shared.id);
    assert_eq!(grant.workout_ids, vec!["w1".to_string()]);
    let anchor_day = local_day(utc(2026, 9, 10, 10));
    // Recovery 开窗；PersonalNote 是任务内容不是时间序列，不产生授权窗。
    assert_eq!(grant.windows.len(), 1);
    assert_eq!(grant.windows[0].category, AccessCategory::Recovery);
    assert_eq!(grant.windows[0].start_date, anchor_day - Duration::days(3));
    assert_eq!(grant.windows[0].end_date, anchor_day);

    // 共享关掉后下一次读取就没有授权——不重读不是选项。
    let mut off = shared.clone();
    off.mcp_shared = false;
    db.save_ai_task(&off).unwrap();
    assert!(shared_task_grants(&db).unwrap().is_empty());
}

#[test]
fn shared_grants_merge_adjacent_windows_across_anchors() {
    let db = Database::in_memory().unwrap();
    // 两个锚点相隔 2 天，days_before=3 → 窗口相接，应并成一条。
    let s1 = utc(2026, 9, 10, 10);
    let s2 = utc(2026, 9, 12, 10);
    insert_workout(&db, "w1", s1);
    insert_workout(&db, "w2", s2);

    let mut t = task();
    t.workout_ids = vec!["w1".into(), "w2".into()];
    t.categories = vec![range(AiTaskCategory::Sleep, 3, true)];
    t.mcp_shared = true;
    db.save_ai_task(&t).unwrap();

    let grants = shared_task_grants(&db).unwrap();
    assert_eq!(grants.len(), 1);
    assert_eq!(grants[0].windows.len(), 2, "装载期按锚点逐条开窗，不预合并");
    // 合并发生在判定侧 granted_windows：两个相接的 Sleep 窗并成一条。
    let merged = granted_windows(&grants, &[AccessCategory::Sleep], None);
    assert_eq!(merged.len(), 1, "相接的授权日窗应合并成一条");
    assert_eq!(merged[0].start_date, local_day(s1) - Duration::days(3));
    assert_eq!(merged[0].end_date, local_day(s2));

    // 引用了已删除的运动：宽授权不能因此整个挂掉——幽灵 id 留在
    // workout_ids 原样清单里，只是不为它开窗（w1 的窗照常展开）。
    let mut t = task();
    t.workout_ids = vec!["w1".into(), "ghost".into()];
    t.categories = vec![range(AiTaskCategory::Sleep, 1, true)];
    t.mcp_shared = true;
    db.save_ai_task(&t).unwrap();
    let grants = shared_task_grants(&db).unwrap();
    let grant = grants
        .iter()
        .find(|g| g.workout_ids.iter().any(|id| id == "ghost"))
        .unwrap();
    assert!(
        !grant.windows.is_empty(),
        "查不到的运动只跳过，不拖垮整个授权"
    );
}
