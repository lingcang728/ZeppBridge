use super::*;
use crate::models::WorkoutSeriesSummary;
use std::collections::HashMap;
use std::io::Cursor;
use std::net::TcpStream as ClientStream;

const TOKEN: &str = "zbk_0123456789abcdef";

/// 生命周期用例绑定的是临时端口而不是 43921：开发机上常常正好有一份
/// ZeppBridge 在跑，用真实端口测出来的失败是环境冲突，不是产品行为。
fn ephemeral_address() -> String {
    let probe = TcpListener::bind("127.0.0.1:0").unwrap();
    let port = probe.local_addr().unwrap().port();
    drop(probe);
    format!("127.0.0.1:{port}")
}

#[derive(Default)]
struct MemoryCredentials {
    entries: Mutex<HashMap<String, String>>,
}

impl CredentialBackend for MemoryCredentials {
    fn set(&self, account: &str, token: &str) -> Result<(), String> {
        self.entries
            .lock()
            .unwrap()
            .insert(account.to_string(), token.to_string());
        Ok(())
    }

    fn get(&self, account: &str) -> Result<Option<String>, String> {
        Ok(self.entries.lock().unwrap().get(account).cloned())
    }

    fn delete(&self, account: &str) -> Result<(), String> {
        self.entries.lock().unwrap().remove(account);
        Ok(())
    }
}

fn request(method: &str, target: &str, authorization: Option<&str>) -> ParsedRequest {
    ParsedRequest {
        method: method.to_string(),
        target: target.to_string(),
        authorization: authorization.map(str::to_string),
    }
}

fn empty_series(id: &str) -> WorkoutSeries {
    WorkoutSeries {
        workout_id: id.to_string(),
        samples: vec![],
        route: vec![],
        pauses: vec![],
        splits: vec![],
        laps: vec![],
        summary: WorkoutSeriesSummary::default(),
    }
}

fn controller(dir: &Path) -> LocalApiController {
    controller_at(dir, ephemeral_address())
}

fn controller_at(dir: &Path, address: String) -> LocalApiController {
    LocalApiController::with_bind_address(
        dir.to_path_buf(),
        address,
        Arc::new(MemoryCredentials::default()),
    )
}

fn temp_dir(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("zeppbridge-local-api-{name}"));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

#[test]
fn health_route_describes_running_service_without_cors() {
    let response = route_request(
        &request("GET", "/health", Some(&format!("Bearer {TOKEN}"))),
        TOKEN,
        |_| unreachable!(),
    );
    assert_eq!(response.status, 200);
    let body: serde_json::Value = serde_json::from_slice(&response.body).unwrap();
    assert_eq!(body["status"], "ok");

    let mut output = Vec::new();
    write_response(&mut output, response).unwrap();
    let text = String::from_utf8(output).unwrap();
    assert!(!text
        .to_ascii_lowercase()
        .contains("access-control-allow-origin"));
    assert!(text.contains("Cache-Control: no-store"));
}

#[test]
fn workout_route_decodes_id_and_returns_clean_series_json() {
    let response = route_request(
        &request(
            "GET",
            "/workouts/run%2D123/series",
            Some(&format!("Bearer {TOKEN}")),
        ),
        TOKEN,
        |id| {
            assert_eq!(id, "run-123");
            Ok(Some(empty_series(id)))
        },
    );
    assert_eq!(response.status, 200);
    let body: serde_json::Value = serde_json::from_slice(&response.body).unwrap();
    assert_eq!(body["workout_id"], "run-123");
    assert_eq!(body["samples"], json!([]));
    assert_eq!(body["route"], json!([]));
}

#[test]
fn unknown_workout_is_404_and_storage_errors_are_generic() {
    let auth = format!("Bearer {TOKEN}");
    let missing = route_request(
        &request("GET", "/workouts/404/series", Some(&auth)),
        TOKEN,
        |_| Ok(None),
    );
    assert_eq!(missing.status, 404);
    let failed = route_request(
        &request("GET", "/workouts/500/series", Some(&auth)),
        TOKEN,
        |_| Err("C:\\private\\zepp.db failed".to_string()),
    );
    assert_eq!(failed.status, 500);
    let text = String::from_utf8(failed.body).unwrap();
    assert!(!text.contains("private"));
    assert!(text.contains("local_data_unavailable"));
}

#[test]
fn rejects_other_methods_and_encoded_path_separators() {
    let auth = format!("Bearer {TOKEN}");
    let post = route_request(
        &request("POST", "/workouts/1/series", Some(&auth)),
        TOKEN,
        |_| unreachable!(),
    );
    assert_eq!(post.status, 405);
    assert!(post.allow_get);
    let invalid = route_request(
        &request("GET", "/workouts/a%2Fb/series", Some(&auth)),
        TOKEN,
        |_| unreachable!(),
    );
    assert_eq!(invalid.status, 400);
}

#[test]
fn every_route_requires_a_bearer_token_and_never_echoes_the_expected_value() {
    for target in ["/", "/health", "/workouts/1/series"] {
        for authorization in [
            None,
            Some("Bearer zbk_wrong"),
            Some("Basic zbk_0123456789abcdef"),
            Some("Bearer "),
            Some("zbk_0123456789abcdef"),
        ] {
            let response = route_request(&request("GET", target, authorization), TOKEN, |_| {
                unreachable!("未授权的请求不应该读取本地数据库")
            });
            assert_eq!(response.status, 401, "{target} / {authorization:?}");
            let text = String::from_utf8(response.body).unwrap();
            assert!(!text.contains(TOKEN), "401 响应泄露了期望的 token");
        }
    }
}

#[test]
fn unauthorized_response_carries_a_bearer_challenge() {
    let response = route_request(&request("GET", "/health", None), TOKEN, |_| unreachable!());
    let mut output = Vec::new();
    write_response(&mut output, response).unwrap();
    let text = String::from_utf8(output).unwrap();
    assert!(text.contains("WWW-Authenticate: Bearer"));
}

#[test]
fn header_parsing_is_bounded_and_rejects_conflicting_authorization() {
    let ok = parse_request(&mut Cursor::new(
        "GET /health HTTP/1.1\r\nHost: 127.0.0.1\r\nAuthorization: Bearer abc\r\n\r\n".as_bytes(),
    ))
    .unwrap();
    assert_eq!(ok.authorization.as_deref(), Some("Bearer abc"));

    let duplicate_same = parse_request(&mut Cursor::new(
        "GET /health HTTP/1.1\r\nAuthorization: Bearer abc\r\nAuthorization: Bearer abc\r\n\r\n"
            .as_bytes(),
    ));
    assert!(duplicate_same.is_ok());

    let conflicting = parse_request(&mut Cursor::new(
        "GET /health HTTP/1.1\r\nAuthorization: Bearer abc\r\nAuthorization: Bearer xyz\r\n\r\n"
            .as_bytes(),
    ));
    assert!(conflicting.is_err());

    let long_line = format!(
        "GET /health HTTP/1.1\r\nX-Long: {}\r\n\r\n",
        "a".repeat(MAX_HEADER_LINE_BYTES + 10)
    );
    assert!(parse_request(&mut Cursor::new(long_line.as_bytes())).is_err());

    let mut many = String::from("GET /health HTTP/1.1\r\n");
    for index in 0..(MAX_HEADER_LINES + 5) {
        many.push_str(&format!("X-{index}: v\r\n"));
    }
    many.push_str("\r\n");
    assert!(parse_request(&mut Cursor::new(many.as_bytes())).is_err());

    let long_target = format!(
        "GET /{} HTTP/1.1\r\n\r\n",
        "a".repeat(MAX_REQUEST_LINE_BYTES)
    );
    assert!(parse_request(&mut Cursor::new(long_target.as_bytes())).is_err());

    assert!(parse_request(&mut Cursor::new(
        "GET /health HTTP/1.1\r\nnot-a-header\r\n\r\n".as_bytes()
    ))
    .is_err());

    // 请求头没有以空行结束时不能当成合法请求继续路由。
    assert!(parse_request(&mut Cursor::new(
        "GET /health HTTP/1.1\r\nHost: x\r\n".as_bytes()
    ))
    .is_err());
}

#[test]
fn first_install_does_not_listen_until_the_user_enables_it() {
    let dir = temp_dir("first-install");
    // 占住这个端口再让 controller 恢复。如果它偷偷尝试绑定，就会拿到
    // 「端口被占用」的错误；`error` 为 None 才能证明它压根没试过。
    // 这比「连一下看看通不通」可靠：临时端口随时可能被别的测试抢走。
    let squatter = TcpListener::bind("127.0.0.1:0").unwrap();
    let address = squatter.local_addr().unwrap().to_string();
    let controller = controller_at(&dir, address);
    let status = controller.restore();
    assert!(!status.enabled);
    assert!(!status.running);
    assert!(
        status.error.is_none(),
        "没有状态文件时连绑定都不该尝试: {status:?}"
    );
    drop(squatter);
}

#[test]
fn enable_disable_cycle_binds_and_releases_the_port_without_restart() {
    let dir = temp_dir("lifecycle");
    let address = ephemeral_address();
    let controller = controller_at(&dir, address.clone());
    assert!(!controller.restore().running);

    let enabled = controller.set_enabled(true);
    assert!(enabled.enabled && enabled.running, "{enabled:?}");
    assert!(enabled.token_present);
    assert!(ClientStream::connect(address.as_str()).is_ok());

    // 保存的启用状态可以跨进程恢复。
    assert!(read_enabled_flag(&dir));

    let disabled = controller.set_enabled(false);
    assert!(!disabled.enabled && !disabled.running);
    assert!(!read_enabled_flag(&dir));
    assert!(
        ClientStream::connect(address.as_str()).is_err(),
        "关闭后端口必须释放"
    );

    // 关闭之后可以立即再次启用，端口没有被自己的旧 listener 占住。
    assert!(controller.set_enabled(true).running);
    controller.shutdown();
    assert!(ClientStream::connect(address.as_str()).is_err());
}

/// 一个慢客户端不该把另一个正常客户端堵住。
///
/// 这就是那个「单线程串行」的真实后果：读超时是 2 秒，所以以前一个连上
/// 来但一个字节都不发的本地进程，能让下一个正常请求整整等 2 秒；连着
/// 来几个就是十几秒。用一个明显小于读超时的预算来断言，才能真的把回归
/// 钉住——池子塌回串行时这条测试必然红。
#[test]
fn a_silent_client_does_not_block_the_next_request() {
    let dir = temp_dir("slowloris");
    let address = ephemeral_address();
    let controller = controller_at(&dir, address.clone());
    controller.set_enabled(true);
    let token = controller.reveal_token().unwrap();

    // 连上就不说话，占住一个 worker 直到它自己的读超时。
    let _silent = ClientStream::connect(address.as_str()).unwrap();

    let started = std::time::Instant::now();
    let mut client = ClientStream::connect(address.as_str()).unwrap();
    client
        .set_read_timeout(Some(Duration::from_secs(5)))
        .unwrap();
    client
        .write_all(
            format!(
                "GET /health HTTP/1.1\r\nHost: localhost\r\nAuthorization: Bearer {token}\r\n\r\n"
            )
            .as_bytes(),
        )
        .unwrap();
    // 一次 read 不保证把整行状态行都带回来，循环到够判断为止。
    let mut status_line = Vec::new();
    while status_line.len() < 12 {
        let mut chunk = [0u8; 64];
        let read = client.read(&mut chunk).unwrap();
        if read == 0 {
            break;
        }
        status_line.extend_from_slice(&chunk[..read]);
    }
    let elapsed = started.elapsed();

    assert!(
        String::from_utf8_lossy(&status_line).starts_with("HTTP/1.1 200"),
        "实际响应：{}",
        String::from_utf8_lossy(&status_line)
    );
    assert!(
        elapsed < Duration::from_millis(1_500),
        "被沉默的客户端堵了 {elapsed:?}——工作池没有生效"
    );
    controller.shutdown();
}

#[test]
fn disabling_does_not_wait_for_a_silent_client() {
    let dir = temp_dir("disable-fast");
    let address = ephemeral_address();
    let controller = controller_at(&dir, address.clone());
    controller.set_enabled(true);
    let _silent = ClientStream::connect(address.as_str()).unwrap();
    let started = std::time::Instant::now();
    let disabled = controller.set_enabled(false);
    let elapsed = started.elapsed();
    assert!(!disabled.running);
    assert!(
        elapsed < Duration::from_millis(800),
        "关闭本机 API 等了 {elapsed:?}——shutdown 仍在 UI 线程 join worker"
    );
    assert!(ClientStream::connect(address.as_str()).is_err());
}

#[test]
#[should_panic(expected = "本机 API 只允许绑定 127.0.0.1")]
fn refuses_a_non_loopback_bind_address() {
    let dir = temp_dir("not-loopback");
    let _ = LocalApiController::with_bind_address(
        dir,
        "0.0.0.0:43921".to_string(),
        Arc::new(MemoryCredentials::default()),
    );
}

#[test]
fn rotating_the_token_invalidates_the_previous_one_immediately() {
    let dir = temp_dir("rotate");
    let controller = controller(&dir);
    let first = controller.reveal_token().unwrap();
    assert!(first.starts_with(TOKEN_PREFIX));
    assert_eq!(controller.reveal_token().unwrap(), first);

    controller.set_enabled(true);
    let second = controller.rotate_token().unwrap();
    assert_ne!(first, second);
    assert_eq!(controller.reveal_token().unwrap(), second);
    assert!(!tokens_match(&second, &first));
    controller.shutdown();
}

#[test]
fn port_conflict_surfaces_as_an_api_error_without_pretending_to_run() {
    let dir = temp_dir("port-conflict");
    let squatter = TcpListener::bind("127.0.0.1:0").unwrap();
    let address = squatter.local_addr().unwrap().to_string();
    let port = squatter.local_addr().unwrap().port().to_string();
    let controller = controller_at(&dir, address);
    let status = controller.set_enabled(true);
    assert!(status.enabled, "用户的启用意图应当被保存");
    assert!(!status.running, "端口占用时不得谎报正在运行");
    let message = status.error.expect("端口占用必须有可解释的错误");
    assert!(message.contains(&port), "{message}");
    assert_eq!(
        status.error_code.as_deref(),
        Some("err.local_api.port_in_use")
    );
    drop(squatter);
}
