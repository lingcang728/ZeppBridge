use super::*;

#[test]
fn tool_failures_are_results_but_bad_envelopes_remain_rpc_errors() {
    for code in [ERR_DATABASE, ERR_NOT_CONFIGURED] {
        let result = call_tool_with_db(
            &json!({"name":"list_workouts"}),
            &AccessScope::FullReadOnly,
            || Err((code, "Local data is unavailable".into())),
        )
        .unwrap();
        assert_eq!(result["isError"], true);
        assert_eq!(result["content"][0]["text"], "Local data is unavailable");
        // 连库都打不开时 scope 仍然如实上报（grants 还没读到，记 0）。
        assert_eq!(
            result["scope"],
            json!({"mode": "full-readonly", "grants": 0})
        );
    }
    let library = TestLibrary::empty();
    let invalid = call_tool_with_db(
        &json!({"name":"get_metric_series","arguments":{"metrics":[]}}),
        &AccessScope::FullReadOnly,
        || {
            Ok((
                Database::open_read_only(library.0.join("zepp.db")).unwrap(),
                0,
            ))
        },
    )
    .unwrap();
    assert_eq!(invalid["isError"], true);
    for params in [
        json!({}),
        json!({"name":"unknown"}),
        json!({"name":"list_workouts","arguments":[]}),
    ] {
        assert!(call_tool_with_db(&params, &AccessScope::FullReadOnly, || {
            panic!("invalid request must not open the database")
        })
        .is_err());
    }
}

#[test]
fn request_reader_enforces_limit_and_resumes_after_bad_lines() {
    let mut input = vec![b'x'; MAX_REQUEST_BYTES + 10];
    input.extend_from_slice(b"\n\xff\n{\"jsonrpc\":\"2.0\",\"id\":9,\"method\":\"ping\"}\n");
    let mut reader = io::BufReader::with_capacity(13, input.as_slice());
    let mut output = Vec::new();
    serve(&mut reader, &mut output, &AccessScope::FullReadOnly).unwrap();
    let responses: Vec<Value> = output
        .split(|byte| *byte == b'\n')
        .filter(|line| !line.is_empty())
        .map(|line| serde_json::from_slice(line).unwrap())
        .collect();
    assert_eq!(responses.len(), 3);
    assert_eq!(responses[0]["error"]["code"], -32600);
    assert_eq!(responses[1]["error"]["code"], -32700);
    assert_eq!(responses[2]["id"], 9);
    assert_eq!(responses[2]["result"], json!({}));
    let at_limit = vec![b' '; MAX_REQUEST_BYTES];
    let mut reader = io::Cursor::new(at_limit);
    assert!(
        matches!(read_frame(&mut reader).unwrap(), Some(RequestFrame::Message(bytes)) if bytes.len()==MAX_REQUEST_BYTES)
    );
}

#[test]
fn every_tool_declares_units_and_the_missing_value_rule() {
    // 一个不说单位的健康数据工具，等于把换算责任推给模型去猜。
    for tool in tool_definitions() {
        let description = tool["description"].as_str().unwrap_or_default();
        let name = tool["name"].as_str().unwrap_or_default();
        assert!(
            description.contains("不会用 0") || description.contains("不会补 0"),
            "{name} 的说明没有讲清缺失值规则"
        );
        assert!(
            tool["inputSchema"]["additionalProperties"] == json!(false),
            "{name} 应当拒绝未知参数，避免调用方以为某个开关生效了"
        );
    }
}

#[test]
fn the_tool_surface_is_read_only() {
    // 只读是这个进程存在的前提。新增任何会写库的工具都应当先推翻这条测试。
    let names: Vec<String> = tool_definitions()
        .iter()
        .map(|tool| tool["name"].as_str().unwrap_or_default().to_string())
        .collect();
    for name in &names {
        for verb in [
            "sync", "delete", "write", "set", "update", "import", "restore",
        ] {
            assert!(
                !name.contains(verb),
                "{name} 看起来会改数据，不该出现在这里"
            );
        }
    }
    assert_eq!(names.len(), 12);
}

#[test]
fn unknown_methods_and_tools_are_refused_rather_than_guessed() {
    let error = handle("tools/execute", &json!({})).unwrap_err();
    assert_eq!(error.code, ERR_METHOD_NOT_FOUND);
    let missing_name =
        call_tool(&json!({ "arguments": {} }), &AccessScope::FullReadOnly).unwrap_err();
    assert_eq!(missing_name.0, ERR_INVALID_PARAMS);
}

#[test]
fn initialize_tells_the_caller_the_privacy_boundary_up_front() {
    let result = handle("initialize", &json!({})).unwrap();
    let instructions = result["instructions"].as_str().unwrap();
    assert!(instructions.contains("不监听端口"));
    assert!(instructions.contains("不会用 0"));
    assert_eq!(result["serverInfo"]["version"], json!(VERSION));
}

/// 现代客户端（无握手）必须能只靠 `server/discover` 就把这台服务器认全。
#[test]
fn server_discover_answers_a_modern_client_without_any_handshake() {
    let result = handle(
        "server/discover",
        &json!({
            "_meta": {
                "io.modelcontextprotocol/protocolVersion": "2026-07-28",
                "io.modelcontextprotocol/clientInfo": { "name": "probe", "version": "1.0" },
                "io.modelcontextprotocol/clientCapabilities": {}
            }
        }),
    )
    .unwrap();

    // 2026-07-28 起每个结果都必须带 resultType。
    assert_eq!(result["resultType"], json!("complete"));
    assert_eq!(
        result["supportedVersions"][0],
        json!(MODERN_PROTOCOL_VERSION)
    );
    assert_eq!(result["capabilities"]["tools"], json!({}));
    // 身份挪进了 _meta，不再是顶层的 serverInfo。
    assert_eq!(result["_meta"][META_SERVER_INFO]["version"], json!(VERSION));
    assert!(result["instructions"]
        .as_str()
        .unwrap()
        .contains("不监听端口"));
    assert_eq!(result["cacheScope"], json!("public"));
}

/// 带了版本 `_meta` 的 `tools/list` 要按新规矩答：resultType + 缓存提示。
#[test]
fn a_modern_tools_list_carries_the_required_envelope() {
    let modern = json!({ "_meta": { "io.modelcontextprotocol/protocolVersion": "2026-07-28" } });
    let result = handle("tools/list", &modern).unwrap();
    assert_eq!(result["resultType"], json!("complete"));
    assert!(result["ttlMs"].as_i64().unwrap() > 0);
    assert_eq!(result["cacheScope"], json!("public"));
    assert_eq!(result["tools"].as_array().unwrap().len(), 12);
}

/// 认不出来的版本必须明确拒绝，并**把我们支持的版本列出来**——客户端就
/// 是靠那张表挑一个再重试的。默默按某个版本作答才是最坏的结果。
#[test]
fn an_unknown_protocol_version_is_refused_with_a_list_to_retry_from() {
    let error = handle(
        "tools/list",
        &json!({ "_meta": { "io.modelcontextprotocol/protocolVersion": "1900-01-01" } }),
    )
    .unwrap_err();
    assert_eq!(error.code, ERR_UNSUPPORTED_PROTOCOL_VERSION);
    let data = error.data.unwrap();
    assert_eq!(data["requested"], json!("1900-01-01"));
    assert!(data["supported"]
        .as_array()
        .unwrap()
        .contains(&json!(MODERN_PROTOCOL_VERSION)));
}

/// 旧客户端一个字都不用改。这条测试挡的是「升级新协议顺手把老路拆了」。
#[test]
fn a_legacy_initialize_still_works_and_echoes_a_version_it_asked_for() {
    let result = handle(
        "initialize",
        &json!({ "protocolVersion": "2025-06-18", "capabilities": {} }),
    )
    .unwrap();
    assert_eq!(result["protocolVersion"], json!("2025-06-18"));
    assert_eq!(result["serverInfo"]["version"], json!(VERSION));
    // legacy 结果不该带 modern 的信封。
    assert!(result.get("resultType").is_none());

    // 客户端要一个我们不支持的版本时，回我们自己的，由它决定继不继续。
    let fallback = handle("initialize", &json!({ "protocolVersion": "1900-01-01" })).unwrap();
    assert_eq!(fallback["protocolVersion"], json!(LEGACY_PROTOCOL_VERSION));

    // 不带 _meta 的 tools/list 走 legacy 形状。
    let listed = handle("tools/list", &json!({})).unwrap();
    assert!(listed.get("resultType").is_none());
    assert!(listed.get("ttlMs").is_none());
}

/* ---------- 访问范围（--scope） ---------- */

#[test]
fn argv_parsing_is_fail_closed() {
    // 旧配置：零参数 → full-readonly。
    assert_eq!(parse_scope_args(&[]).unwrap(), AccessScope::FullReadOnly);
    for args in [
        vec!["--scope".to_string(), "task".to_string()],
        vec!["--scope=task".to_string()],
    ] {
        assert!(parse_scope_args(&args).unwrap().is_task_scoped());
    }
    assert_eq!(
        parse_scope_args(&["--scope".to_string(), "full-readonly".to_string()]).unwrap(),
        AccessScope::FullReadOnly
    );
    // 坏值、未知参数、缺值、重复给、位置参数——一律拒绝。
    for args in [
        vec!["--scope".to_string(), "bogus".to_string()],
        vec!["--scope=bogus".to_string()],
        vec!["--bogus".to_string()],
        vec!["--scope".to_string()],
        vec![
            "--scope".to_string(),
            "task".to_string(),
            "--scope".to_string(),
            "task".to_string(),
        ],
        vec!["anything".to_string()],
    ] {
        assert!(parse_scope_args(&args).is_err(), "{args:?} 必须被拒绝");
    }
}

/// R10：注册表里的每个工具都得有 DataRequest 构建器。新增工具不补
/// 映射，这条测试就红。
#[test]
fn every_registered_tool_builds_a_data_request() {
    let minimal_args: [(&str, Value); 12] = [
        ("list_workouts", json!({})),
        ("get_workout_insight", json!({"workoutId": "w"})),
        ("get_metric_series", json!({"metrics": ["spo2_odi"]})),
        ("get_sleep_detail", json!({})),
        ("get_data_health", json!({})),
        ("get_food_data", json!({})),
        ("list_available_metrics", json!({})),
        (
            "get_metric_records",
            json!({"metric": "steps", "source": "daily_metrics"}),
        ),
        ("list_sleep_sessions", json!({})),
        ("get_workout_detail", json!({"workoutId": "w"})),
        ("get_workout_series", json!({"workoutId": "w"})),
        ("list_life_events", json!({})),
    ];
    for tool in tool_definitions() {
        let name = tool["name"].as_str().unwrap();
        let args = minimal_args
            .iter()
            .find(|(tool_name, _)| *tool_name == name)
            .unwrap_or_else(|| panic!("{name} 缺少最小参数夹具"))
            .1
            .clone();
        let request = build_request(name, &args)
            .unwrap_or_else(|error| panic!("{name} 没有 DataRequest 映射：{error}"));
        assert_eq!(request.tool, name);
    }
}

/// 握手与每个 tools/call 结果都自述当前范围（recon：可见性约定）。
#[test]
fn handshake_and_results_disclose_the_active_scope() {
    let init = handle_scoped("initialize", &json!({}), &AccessScope::TaskScoped).unwrap();
    assert_eq!(init["scope"]["mode"], json!("task"));
    assert!(init["instructions"].as_str().unwrap().contains("task："));

    let discover = handle_scoped(
        "server/discover",
        &json!({"_meta": {"io.modelcontextprotocol/protocolVersion": "2026-07-28"}}),
        &AccessScope::TaskScoped,
    )
    .unwrap();
    assert_eq!(discover["scope"]["mode"], json!("task"));

    let full = handle("initialize", &json!({})).unwrap();
    assert_eq!(full["scope"]["mode"], json!("full-readonly"));
    assert!(full["instructions"]
        .as_str()
        .unwrap()
        .contains("full-readonly"));
}
