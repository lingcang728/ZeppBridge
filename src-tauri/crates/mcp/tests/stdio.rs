use serde_json::{json, Value};
use std::io::Write;
use std::process::{Command, Stdio};
use zeppbridge_core::models::{DailyMetric, SourceScope};
use zeppbridge_core::storage::Database;

#[test]
fn stdio_recovers_from_bad_input_and_returns_tool_errors_in_result() {
    let missing_dir = std::env::temp_dir().join(format!(
        "zeppbridge-mcp-stdio-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    let mut child = Command::new(env!("CARGO_BIN_EXE_zeppbridge-mcp"))
        .env("ZEPPBRIDGE_DATA_DIR", &missing_dir)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    let mut stdin = child.stdin.take().unwrap();
    stdin.write_all(b"\xff\n").unwrap();
    writeln!(
        stdin,
        "{}",
        json!({"jsonrpc":"2.0","id":1,"method":"ping","padding":"x".repeat(1024*1024)})
    )
    .unwrap();
    for request in [
        json!({"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"list_workouts"}}),
        json!({"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"list_workouts","_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28"}}}),
        json!({"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"unknown"}}),
        json!({"jsonrpc":"2.0","id":5,"method":"ping"}),
    ] {
        writeln!(stdin, "{request}").unwrap();
    }
    drop(stdin);
    let output = child.wait_with_output().unwrap();
    assert!(output.status.success());
    assert!(output.stderr.is_empty());
    let responses: Vec<Value> = String::from_utf8(output.stdout)
        .unwrap()
        .lines()
        .map(|line| serde_json::from_str(line).unwrap())
        .collect();
    assert_eq!(responses.len(), 6);
    assert_eq!(responses[0]["error"]["code"], -32700);
    assert_eq!(responses[1]["error"]["code"], -32600);
    for response in &responses[2..4] {
        assert!(response.get("error").is_none());
        assert_eq!(response["result"]["isError"], true);
        assert!(!response["result"]["content"][0]["text"]
            .as_str()
            .unwrap()
            .is_empty());
    }
    assert_eq!(responses[3]["result"]["resultType"], "complete");
    assert_eq!(responses[4]["error"]["code"], -32601);
    assert_eq!(responses[5]["id"], 5);
    assert_eq!(responses[5]["result"], json!({}));
}

#[test]
fn stdio_returns_synced_food_totals_and_metric_inventory() {
    let data_dir = std::env::temp_dir().join(format!(
        "zeppbridge-mcp-food-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    std::fs::create_dir_all(&data_dir).unwrap();
    let db = Database::open_migrated(&data_dir.join("zepp.db")).unwrap();
    db.insert_daily_metric_with_raw(
        &DailyMetric {
            date: chrono::Local::now().date_naive().to_string(),
            metric: "intake_calories".into(),
            value: 640.0,
            unit: "kcal".into(),
            source_scope: SourceScope::UserFused,
            device_id: None,
        },
        None,
    )
    .unwrap();
    drop(db);

    let mut child = Command::new(env!("CARGO_BIN_EXE_zeppbridge-mcp"))
        .env("ZEPPBRIDGE_DATA_DIR", &data_dir)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    let mut stdin = child.stdin.take().unwrap();
    for (id, name) in [(1, "get_food_data"), (2, "list_available_metrics")] {
        writeln!(
            stdin,
            "{}",
            json!({
                "jsonrpc":"2.0","id":id,"method":"tools/call",
                "params":{"name":name,"arguments":{}}
            })
        )
        .unwrap();
    }
    drop(stdin);
    let output = child.wait_with_output().unwrap();
    assert!(output.status.success());
    assert!(output.stderr.is_empty());
    let responses: Vec<Value> = String::from_utf8(output.stdout)
        .unwrap()
        .lines()
        .map(|line| serde_json::from_str(line).unwrap())
        .collect();
    assert_eq!(responses.len(), 2);
    assert_eq!(
        responses[0]["result"]["structuredContent"]["series"][0]["points"][0]["value"],
        640.0
    );
    assert_eq!(
        responses[1]["result"]["structuredContent"]["metrics"][0]["metric"],
        "intake_calories"
    );
    std::fs::remove_dir_all(data_dir).unwrap();
}
