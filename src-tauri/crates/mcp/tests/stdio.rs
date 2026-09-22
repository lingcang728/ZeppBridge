use serde_json::{json, Value};
use std::io::Write;
use std::process::{Command, Stdio};

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
