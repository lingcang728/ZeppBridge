//! 准备任务包：附件、排除项、导出内容与脱敏。

use super::*;

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
fn no_workouts_means_recent_days_ending_today() {
    let db = Database::in_memory().unwrap();
    let today = Local::now().date_naive();
    insert_daily(&db, "resting_hr", today - Duration::days(1), 52.0);
    insert_daily(&db, "resting_hr", today - Duration::days(30), 60.0);
    let dir = temp_dir("noworkout");

    let mut t = task();
    t.categories = vec![range(AiTaskCategory::Recovery, 6, false)];
    let preview = db.ai_task_preview(&t).unwrap();
    assert!(preview
        .warnings
        .iter()
        .all(|w| w.code != "ui.ai_task.blocked.no_workouts"));
    assert_eq!(preview.coverage.len(), 1);
    let row = &preview.coverage[0];
    assert_eq!(row.workout_id, None);
    // 没有运动时 include_workout_day 不起作用：今天总在窗口里。
    assert_eq!(row.end_date, today.to_string());
    assert_eq!(row.start_date, (today - Duration::days(6)).to_string());
    assert_eq!(row.days_in_range, 7);
    assert_eq!(row.days_with_data, 1, "30 天前那条不在最近 7 天里");

    let result = db.ai_task_prepare(&t, "", &dir).unwrap();
    assert_eq!(result.status, AiTaskPrepareStatus::Ready);
    let doc: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(result.json_path.unwrap()).unwrap()).unwrap();
    assert_eq!(doc["task"]["window_anchor"], "today");
    assert!(doc["workouts"].as_array().unwrap().is_empty());
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn excluded_metrics_are_counted_but_not_exported() {
    let db = Database::in_memory().unwrap();
    let start = utc(2026, 9, 10, 10);
    insert_workout(&db, "w1", start);
    let anchor_day = local_day(start);
    insert_daily(&db, "resting_hr", anchor_day, 51.0);
    insert_daily(&db, "stress", anchor_day - Duration::days(1), 30.0);
    insert_sleep(&db, "s1", utc(2026, 9, 10, 6));
    let dir = temp_dir("exclude");

    let mut recovery = range(AiTaskCategory::Recovery, 3, true);
    recovery.excluded_metrics = vec!["stress".into(), " stress ".into()];
    let mut sleep = range(AiTaskCategory::Sleep, 3, true);
    sleep.excluded_metrics = vec!["rem_minutes".into()];
    let mut t = task();
    t.workout_ids = vec!["w1".into()];
    t.categories = vec![recovery, sleep];

    // 归一化：去空白、去重。
    let normalized = normalize_task(&t).unwrap();
    assert_eq!(
        normalized.categories[0].excluded_metrics,
        vec!["stress".to_string()]
    );

    let preview = db.ai_task_preview(&t).unwrap();
    let rec = preview
        .coverage
        .iter()
        .find(|r| r.category == AiTaskCategory::Recovery)
        .unwrap();
    // 被排除的指标仍给出天数（界面要显示「拖回来有几天」），但不算覆盖。
    assert_eq!(rec.metric_days.get("stress"), Some(&1));
    assert_eq!(rec.metric_days.get("resting_hr"), Some(&1));
    assert_eq!(rec.days_with_data, 1);
    let sl = preview
        .coverage
        .iter()
        .find(|r| r.category == AiTaskCategory::Sleep)
        .unwrap();
    assert!(sl.metric_days.get("rem_minutes").copied().unwrap_or(0) >= 1);

    let result = db.ai_task_prepare(&t, "", &dir).unwrap();
    let json_text = std::fs::read_to_string(result.json_path.unwrap()).unwrap();
    let doc: serde_json::Value = serde_json::from_str(&json_text).unwrap();
    let context = doc["context"].as_array().unwrap();
    let metrics: Vec<String> = context
        .iter()
        .find(|c| c["category"] == "recovery")
        .unwrap()["days"]
        .as_array()
        .unwrap()
        .iter()
        .flat_map(|d| d["metrics"].as_array().cloned().unwrap_or_default())
        .map(|m| m["metric"].as_str().unwrap().to_string())
        .collect();
    assert!(metrics.iter().any(|m| m == "resting_hr"));
    assert!(!metrics.iter().any(|m| m == "stress"));
    let sleep_days = context.iter().find(|c| c["category"] == "sleep").unwrap()["days"]
        .as_array()
        .unwrap();
    for day in sleep_days {
        for session in day["sleeps"].as_array().unwrap() {
            assert!(session.get("rem_minutes").is_none(), "排除的字段不出仓");
            assert!(session.get("deep_minutes").is_some(), "其他字段照常");
        }
    }
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn template_direction_and_question_are_combined() {
    let db = Database::in_memory().unwrap();
    insert_workout(&db, "w1", utc(2026, 9, 10, 10));
    let dir = temp_dir("direction");
    let mut t = task();
    t.workout_ids = vec!["w1".into()];
    t.categories = vec![range(AiTaskCategory::Sleep, 3, true)];
    t.template_id = Some("recovery_run".into());
    t.prompt = "重点看周三那次".into();

    // 前端给了本地化方向段：它和问题都在，顺序是 方向 → 问题 → 覆盖说明。
    let result = db
        .ai_task_prepare_plan(
            &t,
            "覆盖段",
            &crate::ai_tasks::export::AiTaskPromptParts {
                direction: Some("Direction: recovery"),
                ..Default::default()
            },
            &dir,
        )
        .unwrap()
        .finish()
        .unwrap();
    let text = &result.prompt_text;
    let (d, q, c) = (
        text.find("Direction: recovery").unwrap(),
        text.find("重点看周三那次").unwrap(),
        text.find("覆盖段").unwrap(),
    );
    assert!(d < q && q < c, "{text}");

    // 没传方向段（CLI）时回落到模板自带的中文，问题照样保留。
    let result = db.ai_task_prepare(&t, "", &dir).unwrap();
    assert!(result.prompt_text.contains("恢复跑"));
    assert!(result.prompt_text.contains("重点看周三那次"));
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn brief_leads_the_prompt_and_files_take_the_given_names() {
    use crate::ai_tasks::export::AiTaskPromptParts;
    let db = Database::in_memory().unwrap();
    insert_workout(&db, "w1", utc(2026, 9, 10, 10));
    let dir = temp_dir("brief");
    let mut t = task();
    t.categories = vec![range(AiTaskCategory::Sleep, 3, true)];

    // 没写问题、没选模板：任务说明必须在最前，覆盖说明在最后——交出去的提示词
    // 自己就说清楚要 AI 做什么。文件名按前端给的主名走，非法字符被清洗。
    let parts = AiTaskPromptParts {
        brief: Some("任务说明：直接开始分析"),
        data_stem: Some("ZeppBridge_0914-0927_睡眠:心率"),
        prompt_stem: Some("ZeppBridge_0914-0927_睡眠:心率_提示词"),
        ..Default::default()
    };
    let result = db
        .ai_task_prepare_plan(&t, "覆盖段", &parts, &dir)
        .unwrap()
        .finish()
        .unwrap();
    let text = &result.prompt_text;
    assert!(
        text.find("任务说明").unwrap() < text.find("覆盖段").unwrap(),
        "{text}"
    );
    let json = result.json_path.unwrap();
    let prompt = result.prompt_path.unwrap();
    assert!(
        json.ends_with("ZeppBridge_0914-0927_睡眠_心率.json"),
        "{json}"
    );
    assert!(
        prompt.ends_with("ZeppBridge_0914-0927_睡眠_心率_提示词.txt"),
        "{prompt}"
    );
    assert_eq!(std::fs::read_to_string(&prompt).unwrap(), *text);

    // 手改过的最终提示词替换 说明 + 方向 + 问题，覆盖说明仍附在后面。
    t.prompt = "原来的问题".into();
    let edited = AiTaskPromptParts {
        brief: Some("任务说明"),
        override_text: Some("我自己改过的整段"),
        ..Default::default()
    };
    let result = db
        .ai_task_prepare_plan(&t, "覆盖段", &edited, &dir)
        .unwrap()
        .finish()
        .unwrap();
    assert_eq!(
        result.prompt_text,
        "我自己改过的整段

覆盖段"
    );
    assert!(result.json_path.unwrap().ends_with("health-context.json"));
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn prepare_writes_a_named_folder_and_copies_attachments() {
    let db = Database::in_memory().unwrap();
    insert_workout(&db, "w1", utc(2026, 9, 10, 10));
    let dir = temp_dir("folder");
    let source_dir = temp_dir("folder-src");
    let pdf = source_dir.join("a.pdf");
    let png = source_dir.join("b.png");
    std::fs::write(&pdf, b"pdf-bytes").unwrap();
    std::fs::write(&png, b"png").unwrap();
    let attachment = |id: &str, path: &std::path::Path, name: &str, len: i64| AiTaskAttachmentRef {
        id: id.into(),
        path: path.to_string_lossy().into_owned(),
        display_name: name.into(),
        kind: AiTaskAttachmentKind::Pdf,
        byte_len: Some(len),
        added_at: "2026-09-01T00:00:00Z".into(),
    };

    let mut t = task();
    t.title = "恢复跑: 9/24?".into();
    t.workout_ids = vec!["w1".into()];
    t.categories = vec![range(AiTaskCategory::Recovery, 3, true)];
    t.attachments = vec![
        attachment("a1", &pdf, "体检报告.pdf", 9),
        attachment("a2", &png, "体检报告.pdf", 3),
    ];
    let result = db.ai_task_prepare(&t, "", &dir).unwrap();
    assert_eq!(result.status, AiTaskPrepareStatus::Ready);
    let folder = std::path::Path::new(&result.output_dir);
    let name = folder.file_name().unwrap().to_string_lossy().into_owned();
    assert!(
        name.starts_with("恢复跑_ 9_24_"),
        "中文保留、非法字符折成 _：{name}"
    );
    assert_eq!(folder.parent().unwrap(), dir.as_path());
    assert_eq!(result.copied_attachments, 2);
    let copied = folder.join("attachments");
    assert_eq!(
        std::fs::read(copied.join("体检报告.pdf")).unwrap(),
        b"pdf-bytes"
    );
    assert_eq!(
        std::fs::read(copied.join("体检报告 (2).pdf")).unwrap(),
        b"png"
    );
    let _ = std::fs::remove_dir_all(&dir);
    let _ = std::fs::remove_dir_all(&source_dir);
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

/// 批次 ⑦：给了 markdown 参数就只交出一个 `.md`——提示词在最前、读法说明随后、数据在下；
/// 不再写 JSON + txt。预览按同一预算估出的体量与实写一致。
#[test]
fn markdown_handoff_writes_one_file_with_prompt_guide_and_data() {
    use crate::ai_tasks::export::{AiTaskMarkdownParts, AiTaskPromptParts};
    let db = Database::in_memory().unwrap();
    insert_workout(&db, "w1", utc(2026, 9, 10, 10));
    let dir = temp_dir("markdown");
    let mut t = task();
    t.workout_ids = vec!["w1".into()];
    t.categories = vec![range(AiTaskCategory::Sleep, 3, true)];
    let parts = AiTaskPromptParts {
        brief: Some("BRIEF"),
        data_stem: Some("handoff"),
        markdown: Some(AiTaskMarkdownParts {
            guide: Some("GUIDE"),
            token_budget: 30_000,
        }),
        ..Default::default()
    };
    let result = db
        .ai_task_prepare_plan(&t, "COVERAGE", &parts, &dir)
        .unwrap()
        .finish()
        .unwrap();
    assert_eq!(result.status, AiTaskPrepareStatus::Ready);
    assert!(result.json_path.is_none() && result.prompt_path.is_none());
    let md_path = result.md_path.clone().unwrap();
    assert!(md_path.ends_with("handoff.md"), "{md_path}");
    let text = std::fs::read_to_string(&md_path).unwrap();
    let brief = text.find("BRIEF").unwrap();
    let guide = text.find("GUIDE").unwrap();
    let data = text.find("# Data").unwrap();
    assert!(brief < guide && guide < data, "{text}");
    assert!(text.contains("### Selected workouts"));
    let estimate = result.markdown.unwrap();
    assert_eq!(estimate.byte_len, text.len() as i64);
    assert!(!estimate.over_budget);
    // 目录里只有这一个文件。
    let files: Vec<_> = std::fs::read_dir(std::path::Path::new(&md_path).parent().unwrap())
        .unwrap()
        .collect();
    assert_eq!(files.len(), 1);

    let preview = db.ai_task_preview_with_budget(&t, Some(30_000)).unwrap();
    let preview_md = preview.markdown.unwrap();
    assert!(preview_md.approx_tokens <= estimate.approx_tokens);
    assert!(db.ai_task_preview(&t).unwrap().markdown.is_none());
    let _ = std::fs::remove_dir_all(&dir);
}

/// 代码审查 R01：分期分钟被排除时，detailed 的阶段时间轴也不出仓——
/// 从阶段片能直接算回被排除的分钟数。MCP 走同一张表。
#[test]
fn excluded_stage_minutes_drop_the_stage_timeline_too() {
    let db = Database::in_memory().unwrap();
    let start = utc(2026, 9, 10, 10);
    insert_workout(&db, "w1", start);
    let end = utc(2026, 9, 10, 6);
    db.insert_sleep_session(&SleepSession {
        sleep_id: "s1".into(),
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
        stages: vec![crate::models::SleepStageSlice {
            stage: "deep".into(),
            start_time: end - Duration::hours(6),
            end_time: end - Duration::hours(5),
            raw_mode: None,
        }],
        wake_count: Some(2),
    })
    .unwrap();

    let sessions = |excluded: Vec<String>| {
        let mut sleep = range(AiTaskCategory::Sleep, 3, true);
        sleep.excluded_metrics = excluded;
        let mut t = task();
        t.workout_ids = vec!["w1".into()];
        t.detail_level = AiTaskDetailLevel::Detailed;
        t.categories = vec![sleep];
        let dir = temp_dir("stages");
        let result = db.ai_task_prepare(&t, "", &dir).unwrap();
        let text = std::fs::read_to_string(result.json_path.unwrap()).unwrap();
        let _ = std::fs::remove_dir_all(&dir);
        let doc: serde_json::Value = serde_json::from_str(&text).unwrap();
        doc["context"]
            .as_array()
            .unwrap()
            .iter()
            .find(|c| c["category"] == "sleep")
            .unwrap()["days"]
            .as_array()
            .unwrap()
            .iter()
            .flat_map(|d| d["sleeps"].as_array().cloned().unwrap_or_default())
            .collect::<Vec<_>>()
    };

    let kept = sessions(Vec::new());
    assert!(
        kept.iter().any(|s| s.get("stages").is_some()),
        "对照：不排除时有阶段"
    );
    let dropped = sessions(vec!["deep_minutes".into()]);
    assert!(!dropped.is_empty());
    for session in dropped {
        assert!(session.get("deep_minutes").is_none());
        assert!(session.get("stages").is_none(), "{session}");
        assert!(session.get("light_minutes").is_some());
    }
}

/// 用户 2026-09-30 定：没开「运动」类别时，锚点运动只写日期和类型——
/// AI 要知道日期窗从哪天往前数，但运动数字不出去。开着时照旧，只是任务里
/// 拖出去的字段不带；心率被排除时心率区间和逐点心率一起去掉。
#[test]
fn anchor_workouts_follow_the_workout_category_switch_and_its_exclusions() {
    let db = Database::in_memory().unwrap();
    let start = utc(2026, 9, 10, 10);
    insert_workout(&db, "w1", start);
    let export = |t: &AiTask| {
        let dir = temp_dir("anchor");
        let result = db.ai_task_prepare(t, "", &dir).unwrap();
        let text = std::fs::read_to_string(result.json_path.unwrap()).unwrap();
        let _ = std::fs::remove_dir_all(&dir);
        let doc: serde_json::Value = serde_json::from_str(&text).unwrap();
        doc["workouts"][0].as_object().unwrap().clone()
    };

    let mut off = task();
    off.workout_ids = vec!["w1".into()];
    off.detail_level = AiTaskDetailLevel::Detailed;
    off.categories = vec![range(AiTaskCategory::Recovery, 3, true)];
    let anchor = export(&off);
    let mut keys: Vec<&str> = anchor.keys().map(String::as_str).collect();
    keys.sort_unstable();
    assert_eq!(keys, ["start_date", "workout_id", "workout_type"]);
    assert_eq!(anchor["start_date"], local_day(start).to_string());

    let mut on = off.clone();
    let mut workout = range(AiTaskCategory::Workout, 0, true);
    workout.excluded_metrics = vec!["avg_hr".into()];
    on.categories.push(workout);
    let anchor = export(&on);
    assert!(anchor.get("avg_hr").is_none());
    assert!(anchor.get("hr_zones").is_none());
    assert!(anchor.get("max_hr").is_some(), "只去掉被排除的字段");
    for sample in anchor["series"]["samples"].as_array().into_iter().flatten() {
        assert!(sample.get("heart_rate").is_none());
    }
}
