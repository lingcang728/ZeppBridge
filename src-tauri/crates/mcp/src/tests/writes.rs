use super::*;

fn ok(result: &Value) -> &Value {
    assert_eq!(result["isError"], false, "{result}");
    &result["structuredContent"]
}

#[test]
fn task_scope_refuses_every_write_and_action_and_writes_nothing() {
    let library = TestLibrary::empty();
    library.share_task("t1", &task_payload("t1", &[], &["sleep"]), true);
    for (name, args) in [
        (
            "save_injury",
            json!({ "title": "左膝", "startDate": "2026-10-01" }),
        ),
        (
            "save_life_event",
            json!({ "title": "出差", "category": "travel", "startDate": "2026-10-01" }),
        ),
        (
            "save_race",
            json!({ "name": "城市马拉松", "raceDate": "2026-12-01", "sport": "running" }),
        ),
        (
            "save_shoe",
            json!({ "name": "跑鞋", "sport": "running", "startedOn": "2026-10-01" }),
        ),
        ("annotate_workout", json!({ "workoutId": "w1", "rpe": 5 })),
        (
            "set_workout_type",
            json!({ "workoutId": "w1", "type": "run" }),
        ),
        ("sync_now", json!({})),
        (
            "export_data",
            json!({ "startDate": "2026-10-01", "endDate": "2026-10-02" }),
        ),
    ] {
        let result = library.call(&AccessScope::TaskScoped, name, args);
        assert_eq!(result["isError"], true, "{name} 在 task 范围里应当被拒");
    }
    let db = Database::open_read_only(library.0.join("zepp.db")).unwrap();
    assert!(db.list_injuries().unwrap().is_empty());
    assert!(db.mcp_writes(10).unwrap().is_empty());
    assert!(!library.0.join("exports").exists());
}

#[test]
fn an_edit_only_changes_the_given_fields_and_the_desktop_can_undo_it() {
    let library = TestLibrary::empty();
    let created = library.call(
        &AccessScope::FullReadOnly,
        "save_injury",
        json!({ "title": "左膝疼", "bodyPart": "knee_l", "severity": 2, "startDate": "2026-10-01" }),
    );
    let id = ok(&created)["applied"]["targetId"]
        .as_str()
        .unwrap()
        .parse::<i64>()
        .unwrap();
    let healed = library.call(
        &AccessScope::FullReadOnly,
        "save_injury",
        json!({ "id": id, "endDate": "2026-10-20" }),
    );
    assert_eq!(ok(&healed)["applied"]["action"], "updated");

    let db = Database::open_migrated(&library.0.join("zepp.db")).unwrap();
    let injury = &db.list_injuries().unwrap()[0].input;
    assert_eq!(injury.title, "左膝疼", "没传的字段沿用原值");
    assert_eq!(injury.end_date.as_deref(), Some("2026-10-20"));
    let ledger = db.mcp_writes(10).unwrap();
    assert_eq!(ledger.len(), 2);
    assert_eq!(ledger[0].tool, "save_injury");
    db.undo_mcp_write(ledger[0].id).unwrap();
    assert_eq!(db.list_injuries().unwrap()[0].input.end_date, None);

    // 不认识的 id、校验不过的值：报错，不写账。
    let missing = library.call(
        &AccessScope::FullReadOnly,
        "save_injury",
        json!({ "id": 999, "title": "不存在" }),
    );
    assert_eq!(missing["isError"], true);
    let bad = library.call(
        &AccessScope::FullReadOnly,
        "save_life_event",
        json!({ "title": "x", "category": "party", "startDate": "2026-10-01" }),
    );
    assert_eq!(bad["isError"], true);
    assert_eq!(db.mcp_writes(10).unwrap().len(), 2);
}

#[test]
fn export_writes_a_summary_file_into_the_exports_folder() {
    let library = TestLibrary::empty();
    let result = library.call(
        &AccessScope::FullReadOnly,
        "export_data",
        json!({ "startDate": "2026-10-01", "endDate": "2026-10-07" }),
    );
    let file = ok(&result)["file"].as_str().unwrap();
    assert!(file.starts_with("exports/"), "不返回本机绝对路径：{file}");
    let text = std::fs::read_to_string(library.0.join(file)).unwrap();
    assert!(serde_json::from_str::<Value>(&text).is_ok());
    let bad = library.call(
        &AccessScope::FullReadOnly,
        "export_data",
        json!({ "startDate": "2026-10-01", "endDate": "2026-10-07", "types": ["nope"] }),
    );
    assert_eq!(bad["isError"], true);
}
