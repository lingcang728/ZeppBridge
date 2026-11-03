use super::*;

fn db() -> Database {
    Database::in_memory().unwrap()
}

fn range(category: AiTaskCategory, enabled: bool) -> AiTaskCategoryRange {
    AiTaskCategoryRange {
        category,
        enabled,
        days_before: 14,
        include_workout_day: true,
        excluded_metrics: Vec::new(),
        picked_days: Vec::new(),
    }
}

fn task(prompt: &str) -> AiTask {
    AiTask {
        schema_version: AI_TASK_SCHEMA_VERSION,
        id: String::new(),
        title: "睡眠复盘".into(),
        template_id: Some("sleep_review".into()),
        workout_ids: Vec::new(),
        categories: vec![
            range(AiTaskCategory::Sleep, true),
            range(AiTaskCategory::HeartRate, false),
        ],
        detail_level: AiTaskDetailLevel::Standard,
        prompt: prompt.into(),
        personal_note: "只给自己看的备注".into(),
        attachments: Vec::new(),
        include_precise_gps: true,
        mcp_shared: true,
        created_at: String::new(),
        updated_at: String::new(),
    }
}

#[test]
fn every_replaced_prompt_is_kept_newest_first() {
    let db = db();
    let saved = db.save_ai_task(&task("第一版")).unwrap();
    // 只改标题不算新版本。
    db.save_ai_task(&AiTask {
        title: "改个名".into(),
        ..saved.clone()
    })
    .unwrap();
    assert!(db.ai_prompt_versions(&saved.id).unwrap().is_empty());

    db.save_ai_task(&AiTask {
        prompt: "第二版".into(),
        ..saved.clone()
    })
    .unwrap();
    db.save_ai_task(&AiTask {
        prompt: "第三版".into(),
        ..saved.clone()
    })
    .unwrap();
    let versions: Vec<_> = db
        .ai_prompt_versions(&saved.id)
        .unwrap()
        .into_iter()
        .map(|version| version.prompt)
        .collect();
    assert_eq!(versions, ["第二版", "第一版"]);

    // 删掉再撤销（原样存回），历史还在。
    db.delete_ai_task(&saved.id).unwrap();
    assert_eq!(db.ai_prompt_versions(&saved.id).unwrap().len(), 2);
}

#[test]
fn the_history_keeps_only_the_latest_versions() {
    let db = db();
    let saved = db.save_ai_task(&task("v0")).unwrap();
    for n in 1..=(MAX_VERSIONS_PER_TASK + 5) {
        db.save_ai_task(&AiTask {
            prompt: format!("v{n}"),
            ..saved.clone()
        })
        .unwrap();
    }
    let versions = db.ai_prompt_versions(&saved.id).unwrap();
    assert_eq!(versions.len() as i64, MAX_VERSIONS_PER_TASK);
    assert_eq!(
        versions[0].prompt,
        format!("v{}", MAX_VERSIONS_PER_TASK + 4)
    );
}

#[test]
fn the_task_list_names_only_enabled_categories() {
    let db = db();
    db.save_ai_task(&task("看看睡眠")).unwrap();
    let list = db.list_ai_tasks().unwrap();
    assert_eq!(list[0].categories, ["sleep"]);
}

#[test]
fn a_zbprompt_carries_the_question_but_nothing_personal() {
    let db = db();
    let mut original = task("最近睡得怎么样");
    original.workout_ids = Vec::new();
    original.categories.push(AiTaskCategoryRange {
        picked_days: vec!["2026-10-01".into()],
        ..range(AiTaskCategory::PersonalNote, true)
    });
    original.categories[0].picked_days = vec!["2026-10-02".into()];
    let saved = db.save_ai_task(&original).unwrap();

    let text = db.export_zbprompt(&saved.id).unwrap();
    assert!(!text.contains("只给自己看的备注"));
    assert!(!text.contains("2026-10-0"), "挑出来的日子不跟着走");
    assert!(!text.contains("personal_note"));
    assert!(!text.contains("mcp_shared"));
    assert!(!text.contains("include_precise_gps"));
    let file = parse_zbprompt(&text).unwrap();
    assert_eq!(file.template_id.as_deref(), Some("sleep_review"));

    // 导进另一个库：新任务、没有运动、不开 MCP、不带精确 GPS。
    let other = Database::in_memory().unwrap();
    let imported = other.import_zbprompt(&text).unwrap();
    assert!(!imported.id.is_empty());
    assert_eq!(imported.prompt, "最近睡得怎么样");
    assert!(imported.workout_ids.is_empty());
    assert!(!imported.mcp_shared && !imported.include_precise_gps);
    assert!(imported.personal_note.is_empty());
    assert_eq!(imported.template_id.as_deref(), Some("sleep_review"));
}

#[test]
fn a_bad_file_is_refused_with_its_own_code() {
    for text in [
        "not json",
        r#"{"format":"other","version":1,"title":"x","prompt":"y"}"#,
        r#"{"format":"zbprompt","version":99,"title":"x","prompt":"y"}"#,
        r#"{"format":"zbprompt","version":1,"title":"x","prompt":"  "}"#,
    ] {
        let error = parse_zbprompt(text).unwrap_err();
        assert_eq!(error.code(), "err.ai_task.bad_prompt_file", "{text}");
    }
    // 别人的用户模板在这个库里不存在：不挂上去。
    let db = db();
    let imported = db
        .import_zbprompt(
            r#"{"format":"zbprompt","version":1,"title":"","prompt":"问问","template_id":"tpl-xyz"}"#,
        )
        .unwrap();
    assert_eq!(imported.template_id, None);
    assert_eq!(imported.title, "问问");
}
