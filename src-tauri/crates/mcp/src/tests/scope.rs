use super::*;

#[test]
fn latest_sleep_returns_the_same_full_detail_as_an_explicit_id() {
    let older = sleep_session("older", 1, Some("light"));
    let latest = sleep_session("latest", 2, Some("deep"));
    let library = TestLibrary::new(&[older, latest.clone()]);

    let implicit = library.call_sleep(json!({}));
    let explicit = library.call_sleep(json!({ "sleepId": "latest" }));
    assert_eq!(implicit, explicit);
    assert_eq!(implicit["isError"], json!(false));
    assert_eq!(
        implicit["structuredContent"]["sleep"],
        serde_json::to_value(latest).unwrap()
    );
    let text: Value =
        serde_json::from_str(implicit["content"][0]["text"].as_str().unwrap()).unwrap();
    assert_eq!(text, implicit["structuredContent"]);

    let previous = library.call_sleep(json!({ "sleepId": "older" }));
    assert_eq!(previous["structuredContent"]["sleep"]["sleep_id"], "older");
    assert_eq!(
        previous["structuredContent"]["sleep"]["stages"][0]["stage"],
        "light"
    );
}

#[test]
fn sleep_queries_preserve_missing_sessions_and_missing_stages() {
    let empty = TestLibrary::new(&[]);
    let recent = empty.call_sleep(json!({}));
    assert_eq!(recent["isError"], json!(false));
    assert_eq!(recent["structuredContent"]["sleep"], Value::Null);

    let library = TestLibrary::new(&[sleep_session("no-stages", 1, None)]);
    let recent = library.call_sleep(json!({}));
    assert_eq!(
        recent["structuredContent"]["sleep"]["sleep_id"],
        "no-stages"
    );
    assert_eq!(recent["structuredContent"]["sleep"]["stages"], json!([]));
    let missing = library.call_sleep(json!({ "sleepId": "unknown" }));
    assert_eq!(missing["structuredContent"]["sleep"], Value::Null);
}

/// task 范围 + 零授权：每个数据工具都要 `scope_no_grants`，不能崩、
/// 也不能拿一份空成功结果冒充。
#[test]
fn task_scope_with_zero_grants_denies_every_data_call() {
    let library = TestLibrary::empty(); // 基线 schema 没有 ai_tasks → 零授权
    for (name, args) in [
        ("list_workouts", json!({})),
        ("get_workout_insight", json!({"workoutId": "w1"})),
        ("get_metric_series", json!({"metrics": ["spo2_odi"]})),
        ("get_sleep_detail", json!({})),
        ("get_data_health", json!({})),
    ] {
        let result = library.call(&AccessScope::TaskScoped, name, args);
        assert_eq!(result["isError"], true, "{name}");
        assert_eq!(
            result["structuredContent"]["error"]["code"],
            json!(access::SCOPE_NO_GRANTS),
            "{name}"
        );
        assert_eq!(result["scope"], json!({"mode": "task", "grants": 0}));
        assert!(result["content"][0]["text"]
            .as_str()
            .unwrap()
            .contains(access::SCOPE_NO_GRANTS));
    }
    // 进程没崩，协议面照常。
    assert_eq!(handle("ping", &json!({})).unwrap(), json!({}));
}

/// full-readonly 忽略授权：数据面与旧行为一致（范围块是新增的自述）。
#[test]
fn full_readonly_ignores_grants_and_keeps_the_old_shape() {
    let library = TestLibrary::empty();
    {
        let db = Database::open_migrated(&library.0.join("zepp.db")).unwrap();
        db.insert_workout(&run_workout("granted", utc_noon(3), 140))
            .unwrap();
        db.insert_workout(&run_workout("private", utc_noon(2), 150))
            .unwrap();
    }
    library.share_task("t1", &task_payload("t1", &["granted"], &["sleep"]), true);

    let result = library.call(&AccessScope::FullReadOnly, "list_workouts", json!({}));
    assert_eq!(result["isError"], false);
    let ids: Vec<&str> = result["structuredContent"]["workouts"]
        .as_array()
        .unwrap()
        .iter()
        .filter_map(|workout| workout["workoutId"].as_str())
        .collect();
    // 授权被忽略：未授权记录照常可见，顺序仍是新→旧。
    assert_eq!(ids, ["private", "granted"]);
    assert_eq!(
        result["scope"],
        json!({"mode": "full-readonly", "grants": 1})
    );
}

/// R3：请求范围与授权窗相交 → 裁到授权日；不相交 → 整体拒绝并附
/// permittedRanges，绝不回一份被悄悄截断的半空序列。
#[test]
fn metric_series_is_clipped_to_granted_windows_and_denied_outside() {
    let library = TestLibrary::empty();
    let inside_day = (Local::now().date_naive() - Duration::days(12))
        .format("%Y-%m-%d")
        .to_string();
    {
        let db = Database::open_migrated(&library.0.join("zepp.db")).unwrap();
        // 授权锚点：10 天前的一次跑步；sleep 窗口 = [锚点-14d, 锚点]。
        db.insert_workout(&run_workout("anchor", utc_noon(10), 140))
            .unwrap();
        let metric = |days_ago: i64, value: f64| DailyMetric {
            date: (Local::now().date_naive() - Duration::days(days_ago))
                .format("%Y-%m-%d")
                .to_string(),
            metric: "spo2_odi".into(),
            value,
            unit: "events/h".into(),
            source_scope: SourceScope::Device,
            device_id: Some("ring-9".into()),
        };
        db.insert_daily_metric(&metric(12, 1.5)).unwrap(); // 窗内
        db.insert_daily_metric(&metric(2, 9.9)).unwrap(); // 窗外
    }
    library.share_task("t1", &task_payload("t1", &["anchor"], &["sleep"]), true);

    // 30 天请求窗与授权窗 [today-24, today-10] 相交 → 放行，但只出窗内的点。
    let result = library.call(
        &AccessScope::TaskScoped,
        "get_metric_series",
        json!({"metrics": ["spo2_odi"], "days": 30}),
    );
    assert_eq!(result["isError"], false, "{}", result["content"][0]["text"]);
    let series = &result["structuredContent"]["series"][0];
    let days: Vec<String> = series["points"]
        .as_array()
        .unwrap()
        .iter()
        .filter_map(|point| point["date"].as_str().map(str::to_string))
        .collect();
    assert_eq!(days, vec![inside_day], "窗外的点绝不能出现在序列里");
    // window_days 自述的是授权窗（15 天），不是请求的 30 天。
    assert_eq!(series["window_days"], 15);
    assert_eq!(result["scope"], json!({"mode": "task", "grants": 1}));
    assert_no_pathish_keys(&result, "metric_series");

    // 3 天请求窗完全在授权窗之外 → 拒绝 + permittedRanges。
    let denied = library.call(
        &AccessScope::TaskScoped,
        "get_metric_series",
        json!({"metrics": ["spo2_odi"], "days": 3}),
    );
    assert_eq!(denied["isError"], true);
    assert_eq!(
        denied["structuredContent"]["error"]["code"],
        json!(access::SCOPE_DENIED)
    );
    let ranges = denied["structuredContent"]["error"]["permittedRanges"]
        .as_array()
        .unwrap();
    assert_eq!(ranges[0]["category"], json!("sleep"));

    // 未授权类别（weight → body）同样整体拒绝，而不是回一条空序列。
    let other = library.call(
        &AccessScope::TaskScoped,
        "get_metric_series",
        json!({"metrics": ["weight"], "days": 30}),
    );
    assert_eq!(
        other["structuredContent"]["error"]["code"],
        json!(access::SCOPE_DENIED)
    );
}

/// R1：task 范围的洞察把基线重算到只剩授权集——未授权运动的 id、
/// 日期、距离和它们贡献的聚合值一个都不许留。
#[test]
fn task_insight_rescores_baseline_over_granted_ids_only() {
    let library = TestLibrary::empty();
    {
        let db = Database::open_migrated(&library.0.join("zepp.db")).unwrap();
        db.insert_workout(&run_workout("target", utc_noon(1), 150))
            .unwrap();
        for (index, id) in ["g1", "g2", "g3"].iter().enumerate() {
            db.insert_workout(&run_workout(id, utc_noon(3 + index as i64), 100))
                .unwrap();
        }
        for (index, id) in ["x1", "x2"].iter().enumerate() {
            db.insert_workout(&run_workout(id, utc_noon(7 + index as i64), 200))
                .unwrap();
        }
    }
    library.share_task(
        "t1",
        &task_payload("t1", &["target", "g1", "g2", "g3"], &["workout"]),
        true,
    );

    // 指名未授权 id → 拒绝，不确认它存在与否之外的任何事。
    let denied = library.call(
        &AccessScope::TaskScoped,
        "get_workout_insight",
        json!({"workoutId": "x1"}),
    );
    assert_eq!(denied["isError"], true);
    assert_eq!(
        denied["structuredContent"]["error"]["code"],
        json!(access::SCOPE_DENIED)
    );

    let result = library.call(
        &AccessScope::TaskScoped,
        "get_workout_insight",
        json!({"workoutId": "target"}),
    );
    assert_eq!(result["isError"], false, "{}", result["content"][0]["text"]);
    let insight = &result["structuredContent"];
    let mut ids = BTreeSet::new();
    collect_ids(insight, &mut ids);
    assert!(
        !ids.contains("x1") && !ids.contains("x2"),
        "未授权 id 不得出现在响应里：{ids:?}"
    );
    let included: Vec<&str> = insight["baseline_included"]
        .as_array()
        .unwrap()
        .iter()
        .filter_map(|entry| entry["workout_id"].as_str())
        .collect();
    assert_eq!(included, ["g1", "g2", "g3"]);
    // 基线均值只含授权样本（100）；全库平均（140）不能漏出来。
    let avg_hr = insight["facts"]
        .as_array()
        .unwrap()
        .iter()
        .find(|fact| fact["metric"] == json!("avg_hr"))
        .unwrap();
    assert_eq!(avg_hr["comparison"]["baseline_value"], json!(100.0));
    assert_eq!(avg_hr["evidence_count"], json!(3));
    assert_no_pathish_keys(&result, "insight");

    // 对照：full-readonly 的同一洞察包含全部 5 个样本。
    let full = library.call(
        &AccessScope::FullReadOnly,
        "get_workout_insight",
        json!({"workoutId": "target"}),
    );
    let full_hr = full["structuredContent"]["facts"]
        .as_array()
        .unwrap()
        .iter()
        .find(|fact| fact["metric"] == json!("avg_hr"))
        .unwrap();
    assert_eq!(full_hr["comparison"]["baseline_value"], json!(140.0));
}

/// R2/R6：显式 id 落在窗外 → 拒绝；省略 id → 授权窗内最近一晚，
/// 不是全库最新；输出不带 device_id。
#[test]
fn task_sleep_detail_stays_inside_granted_windows_and_strips_device_id() {
    let library = TestLibrary::empty();
    {
        let db = Database::open_migrated(&library.0.join("zepp.db")).unwrap();
        // 授权锚点 20 天前 → sleep 窗口 [today-34, today-20]。
        db.insert_workout(&run_workout("anchor", utc_noon(20), 140))
            .unwrap();
        db.insert_sleep_session(&sleep_session_days_ago("in-window", 25))
            .unwrap();
        db.insert_sleep_session(&sleep_session_days_ago("too-new", 1))
            .unwrap();
    }
    library.share_task("t1", &task_payload("t1", &["anchor"], &["sleep"]), true);

    // 显式 id 在窗外 → 拒绝（不是 sleep:null，这条记录存在但不可见）。
    let denied = library.call(
        &AccessScope::TaskScoped,
        "get_sleep_detail",
        json!({"sleepId": "too-new"}),
    );
    assert_eq!(denied["isError"], true);
    assert_eq!(
        denied["structuredContent"]["error"]["code"],
        json!(access::SCOPE_DENIED)
    );

    // 省略 id → 授权窗内最近一晚，而不是全库最新的 too-new。
    let result = library.call(&AccessScope::TaskScoped, "get_sleep_detail", json!({}));
    assert_eq!(result["isError"], false, "{}", result["content"][0]["text"]);
    assert_eq!(
        result["structuredContent"]["sleep"]["sleep_id"],
        json!("in-window")
    );
    // R6：整结构 serde 的出口必须剥掉 device_id（fixture 里有值）。
    let serialized = serde_json::to_string(&result).unwrap();
    assert!(!serialized.contains("device_id"), "{serialized}");
    assert!(!serialized.contains("watch-serial-zzz"));
    assert_no_pathish_keys(&result, "sleep_detail");

    // 授权窗内一条睡眠都没有 → 拒绝，而不是退回全库最新。
    let empty = TestLibrary::empty();
    {
        let db = Database::open_migrated(&empty.0.join("zepp.db")).unwrap();
        db.insert_workout(&run_workout("anchor", utc_noon(20), 140))
            .unwrap();
        db.insert_sleep_session(&sleep_session_days_ago("too-new", 1))
            .unwrap();
    }
    empty.share_task("t1", &task_payload("t1", &["anchor"], &["sleep"]), true);
    let denied = empty.call(&AccessScope::TaskScoped, "get_sleep_detail", json!({}));
    assert_eq!(
        denied["structuredContent"]["error"]["code"],
        json!(access::SCOPE_DENIED)
    );
}

/// R4：授权按 id 而不是「全库最近 N 条」——授权运动排在全库 200 名
/// 之外也必须回得来。
#[test]
fn task_list_workouts_returns_granted_ids_not_global_recency() {
    let library = TestLibrary::empty();
    {
        let db = Database::open_migrated(&library.0.join("zepp.db")).unwrap();
        for index in 0..205 {
            db.insert_workout(&run_workout(
                &format!("recent-{index:03}"),
                utc_noon(index + 1),
                140,
            ))
            .unwrap();
        }
        db.insert_workout(&run_workout("granted-old", utc_noon(300), 140))
            .unwrap();
    }
    library.share_task(
        "t1",
        &task_payload("t1", &["granted-old"], &["workout"]),
        true,
    );

    let result = library.call(
        &AccessScope::TaskScoped,
        "list_workouts",
        json!({"limit": 1}),
    );
    assert_eq!(result["isError"], false);
    let ids: Vec<&str> = result["structuredContent"]["workouts"]
        .as_array()
        .unwrap()
        .iter()
        .filter_map(|workout| workout["workoutId"].as_str())
        .collect();
    assert_eq!(ids, ["granted-old"], "授权 id 再老也必须可见");
    assert_no_pathish_keys(&result, "list_workouts");

    // 对照：full-readonly 的 limit=1 是全局最新，不是它。
    let full = library.call(
        &AccessScope::FullReadOnly,
        "list_workouts",
        json!({"limit": 1}),
    );
    assert_eq!(
        full["structuredContent"]["workouts"][0]["workoutId"],
        json!("recent-000")
    );
}

/// 授权每次调用重读：翻转 `mcp_shared` 对下一次调用立即生效。
#[test]
fn grant_changes_between_calls_take_effect_immediately() {
    let library = TestLibrary::empty();
    {
        let db = Database::open_migrated(&library.0.join("zepp.db")).unwrap();
        db.insert_workout(&run_workout("w1", utc_noon(5), 140))
            .unwrap();
    }
    library.share_task("t1", &task_payload("t1", &["w1"], &["workout"]), false);
    let denied = library.call(&AccessScope::TaskScoped, "list_workouts", json!({}));
    assert_eq!(
        denied["structuredContent"]["error"]["code"],
        json!(access::SCOPE_NO_GRANTS)
    );

    library.share_task("t1", &task_payload("t1", &["w1"], &["workout"]), true);
    let result = library.call(&AccessScope::TaskScoped, "list_workouts", json!({}));
    assert_eq!(result["isError"], false);
    assert_eq!(
        result["structuredContent"]["workouts"][0]["workoutId"],
        json!("w1")
    );
    assert_eq!(result["scope"]["grants"], json!(1));
}

/// R7：`_meta` 与请求参数都不是授权入口——进程范围由 argv 决定，
/// 别的什么都改不了它。
#[test]
fn request_meta_and_params_cannot_override_the_process_scope() {
    let library = TestLibrary::empty(); // 零授权
    for params in [
        json!({"name": "list_workouts", "arguments": {},
                   "_meta": {"scope": "full-readonly"}}),
        json!({"name": "list_workouts", "arguments": {"scope": "full-readonly"}}),
    ] {
        let result = call_tool_with_db(&params, &AccessScope::TaskScoped, || {
            let db = Database::open_read_only(library.0.join("zepp.db")).unwrap();
            Ok((db, 0))
        })
        .unwrap();
        assert_eq!(
            result["structuredContent"]["error"]["code"],
            json!(access::SCOPE_NO_GRANTS),
            "{params}"
        );
    }
    // 走完整分发（modern 时代带版本 _meta）也一样：scope 只来自 argv。
    let result = handle_scoped(
        "tools/call",
        &json!({
            "name": "list_workouts",
            "arguments": {},
            "_meta": {
                "io.modelcontextprotocol/protocolVersion": "2026-07-28",
                "scope": "full-readonly",
            }
        }),
        &AccessScope::TaskScoped,
    );
    // 这里会真的走 open_db——没有数据库时也是 isError，绝不是放行。
    assert!(result.is_ok());
}
