//! `/v1/records`、两把 token 的权限边界、无头服务的启动护栏。

use super::*;
use std::collections::HashMap;

const LOCAL: &str = "zbk_local_token_for_tests_000000000000";
const PULL: &str = "zbp_pull_token_for_tests_0000000000000";

fn tokens() -> TokenSet {
    TokenSet {
        local: Some(LOCAL.to_string()),
        pull: Some(PULL.to_string()),
    }
}

fn get(target: &str, token: Option<&str>) -> ParsedRequest {
    ParsedRequest {
        method: "GET".into(),
        target: target.into(),
        authorization: token.map(|value| format!("Bearer {value}")),
    }
}

fn five_records(_: &RecordsRequest) -> Result<Computed, String> {
    Ok(Computed {
        records: (0..5)
            .map(|index| serde_json::json!({ "record_type": "daily_metric", "n": index }))
            .collect(),
        devices: serde_json::json!([]),
        capabilities: serde_json::json!({}),
    })
}

fn body(outcome: &Outcome) -> serde_json::Value {
    serde_json::from_slice(&outcome.response.body).unwrap()
}

fn run(target: &str, token: Option<&str>, cache: &RecordsCache) -> Outcome {
    dispatch(&get(target, token), &tokens(), cache, five_records, |_| {
        Ok(None)
    })
}

const RANGE: &str = "/v1/records?from=2024-03-01&to=2024-03-07";

#[test]
fn pull_token_reads_only_v1_and_health() {
    let cache = RecordsCache::default();
    assert_eq!(run(RANGE, Some(PULL), &cache).response.status, 200);
    assert_eq!(run("/v1", Some(PULL), &cache).response.status, 200);
    assert_eq!(run("/health", Some(PULL), &cache).response.status, 200);
    for target in ["/", "/workouts/abc/series"] {
        let outcome = run(target, Some(PULL), &cache);
        assert_eq!(outcome.response.status, 403, "{target}");
        assert_eq!(body(&outcome)["error"]["code"], "token_scope");
    }
    // 本机 token 照旧能读全部路由，也能读 /v1/records。
    assert_eq!(run(RANGE, Some(LOCAL), &cache).response.status, 200);
    assert_eq!(run("/", Some(LOCAL), &cache).response.status, 200);
}

#[test]
fn missing_or_wrong_tokens_are_counted_as_failures() {
    let cache = RecordsCache::default();
    for token in [None, Some("zbp_wrong"), Some("")] {
        let outcome = run(RANGE, token, &cache);
        assert_eq!(outcome.response.status, 401);
        assert!(outcome.auth_failed);
        let text = String::from_utf8(outcome.response.body.clone()).unwrap();
        assert!(!text.contains(PULL) && !text.contains(LOCAL));
    }
    // 没有拉取 token 的服务（桌面端）不会把拉取 token 当回事。
    let desktop = TokenSet {
        local: Some(LOCAL.into()),
        pull: None,
    };
    assert_eq!(desktop.authorize(PULL), None);
    assert_eq!(desktop.authorize(LOCAL), Some(TokenScope::Local));
}

#[test]
fn records_are_paged_with_a_cursor_bound_to_the_query() {
    let cache = RecordsCache::default();
    let first = run(&format!("{RANGE}&limit=2"), Some(PULL), &cache);
    let first = body(&first);
    assert_eq!(first["count"], 2);
    assert_eq!(first["total"], 5);
    assert_eq!(first["records_version"], crate::records::RECORDS_VERSION);
    assert_eq!(first["query"]["include_gps"], false);
    let cursor = first["next_cursor"].as_str().unwrap().to_string();

    let second = body(&run(
        &format!("{RANGE}&limit=2&cursor={cursor}"),
        Some(PULL),
        &cache,
    ));
    assert_eq!(second["records"][0]["n"], 2);
    let cursor = second["next_cursor"].as_str().unwrap().to_string();
    let last = body(&run(
        &format!("{RANGE}&limit=2&cursor={cursor}"),
        Some(PULL),
        &cache,
    ));
    assert_eq!(last["count"], 1);
    assert!(last["next_cursor"].is_null());

    // 换了查询条件，旧游标不能拿来用。
    let other = run(
        &format!("/v1/records?from=2024-03-01&to=2024-03-08&limit=2&cursor={cursor}"),
        Some(PULL),
        &cache,
    );
    assert_eq!(other.response.status, 400);
    assert_eq!(body(&other)["error"]["code"], "invalid_cursor");
}

#[test]
fn query_validation_reports_stable_codes() {
    let code = |query: &str| parse_records_query(query).unwrap_err().code;
    assert_eq!(code(""), "invalid_range");
    assert_eq!(code("from=2024-03-01"), "invalid_range");
    assert_eq!(code("from=2024-03-09&to=2024-03-01"), "invalid_range");
    assert_eq!(code("from=2024-01-01&to=2024-12-31"), "range_too_long");
    assert_eq!(
        code("from=2024-03-01&to=2024-03-02&types=gps"),
        "invalid_types"
    );
    assert_eq!(
        code("from=2024-03-01&to=2024-03-02&limit=0"),
        "invalid_limit"
    );
    assert_eq!(
        code("from=2024-03-01&to=2024-03-02&limit=5000"),
        "invalid_limit"
    );
    assert_eq!(
        code("from=2024-03-01&to=2024-03-02&since=yesterday"),
        "invalid_since"
    );
    assert_eq!(
        code("from=2024-03-01&to=2024-03-02&detail=raw"),
        "invalid_detail"
    );
    assert_eq!(
        code("from=2024-03-01&to=2024-03-02&from=2024-03-01"),
        "invalid_query"
    );
    assert_eq!(
        code("from=2024-03-01&to=2024-03-02&token=x"),
        "invalid_query"
    );
}

#[test]
fn defaults_are_the_six_types_summary_without_gps() {
    let parsed = parse_records_query("from=2024-03-01&to=2024-03-02").unwrap();
    assert_eq!(
        parsed.types,
        crate::records::expand_types(crate::records::DEFAULT_RECORD_TYPES).unwrap()
    );
    assert!(!parsed.include_gps);
    assert!(!parsed.detail.is_full());
    assert_eq!(parsed.limit, DEFAULT_PAGE_SIZE);

    let since = parse_records_query(
        "from=2024-03-01&to=2024-03-02&since=2024-03-01T08%3A00%3A00%2B08%3A00&include_gps=true&detail=full&types=workouts",
    )
    .unwrap();
    assert_eq!(
        since.since.unwrap().to_rfc3339(),
        "2024-03-01T00:00:00+00:00"
    );
    assert!(since.include_gps && since.detail.is_full());
    assert_eq!(since.types, vec!["workouts"]);
}

#[derive(Default)]
struct Store {
    entries: Mutex<HashMap<String, String>>,
    named: bool,
}

impl CredentialBackend for Store {
    fn set(&self, account: &str, token: &str) -> Result<(), String> {
        self.entries
            .lock()
            .unwrap()
            .insert(account.into(), token.into());
        Ok(())
    }
    fn get(&self, account: &str) -> Result<Option<String>, String> {
        Ok(self.entries.lock().unwrap().get(account).cloned())
    }
    fn delete(&self, account: &str) -> Result<(), String> {
        self.entries.lock().unwrap().remove(account);
        Ok(())
    }
    fn supports_named_entries(&self) -> bool {
        self.named
    }
}

fn named_store() -> Arc<Store> {
    Arc::new(Store {
        named: true,
        ..Default::default()
    })
}

fn temp_dir(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!(
        "zeppbridge-serve-{name}-{}-{}",
        std::process::id(),
        crate::unique_suffix()
    ));
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

#[test]
fn listen_defaults_to_loopback_and_rejects_garbage() {
    assert_eq!(parse_listen(None).unwrap().to_string(), LOCAL_API_ADDRESS);
    assert_eq!(
        parse_listen(Some("  ")).unwrap().to_string(),
        LOCAL_API_ADDRESS
    );
    assert!(parse_listen(Some("0.0.0.0:43921")).is_ok());
    assert_eq!(
        parse_listen(Some("localhost")).unwrap_err().code(),
        "invalid_listen_address"
    );
}

#[test]
fn non_loopback_without_a_token_refuses_to_start() {
    let store = named_store();
    let error = start_headless(
        temp_dir("no-token"),
        "0.0.0.0:0".parse().unwrap(),
        PullTokenSource::Store(store.clone()),
    )
    .err()
    .unwrap();
    assert_eq!(error.code(), "pull_token_required");
    // 拒绝启动时也不偷偷生成 token。
    assert!(store.entries.lock().unwrap().is_empty());

    let weak = start_headless(
        temp_dir("weak"),
        "0.0.0.0:0".parse().unwrap(),
        PullTokenSource::Env("short".into()),
    )
    .err()
    .unwrap();
    assert_eq!(weak.code(), "pull_token_too_short");
}

#[test]
fn env_credential_store_cannot_hold_a_pull_token() {
    // 环境变量后端对任何名字都返回 Zepp 的 App Token：绝不能把它当拉取 token。
    let env_like = Arc::new(Store::default());
    env_like
        .entries
        .lock()
        .unwrap()
        .insert(PULL_CREDENTIAL_ACCOUNT.into(), "zepp-app-token".into());
    assert!(read_pull_token(env_like.as_ref()).is_err());
    assert!(rotate_pull_token(env_like.as_ref()).is_err());
    assert!(revoke_pull_token(env_like.as_ref()).is_err());
}

#[test]
fn rotate_and_revoke_only_touch_the_pull_token() {
    let store = named_store();
    store
        .entries
        .lock()
        .unwrap()
        .insert(LOCAL_API_CREDENTIAL_ACCOUNT.into(), LOCAL.into());
    let first = rotate_pull_token(store.as_ref()).unwrap();
    assert!(first.starts_with("zbp_") && first.len() >= MIN_PULL_TOKEN_CHARS);
    let second = rotate_pull_token(store.as_ref()).unwrap();
    assert_ne!(first, second);
    assert_eq!(read_pull_token(store.as_ref()).unwrap(), Some(second));
    revoke_pull_token(store.as_ref()).unwrap();
    assert_eq!(read_pull_token(store.as_ref()).unwrap(), None);
    assert_eq!(
        store
            .entries
            .lock()
            .unwrap()
            .get(LOCAL_API_CREDENTIAL_ACCOUNT)
            .map(String::as_str),
        Some(LOCAL)
    );
}

fn http_get(address: std::net::SocketAddr, target: &str, token: &str) -> (u16, String) {
    let mut stream = std::net::TcpStream::connect(address).unwrap();
    write!(
        stream,
        "GET {target} HTTP/1.1\r\nHost: test\r\nAuthorization: Bearer {token}\r\n\r\n"
    )
    .unwrap();
    let mut text = String::new();
    stream.read_to_string(&mut text).unwrap();
    let status = text[9..12].parse().unwrap();
    let body = text.split_once("\r\n\r\n").unwrap().1.to_string();
    (status, body)
}

#[test]
fn loopback_serve_creates_a_token_and_answers_records() {
    let store = named_store();
    let server = start_headless(
        temp_dir("loopback"),
        "127.0.0.1:0".parse().unwrap(),
        PullTokenSource::Store(store.clone()),
    )
    .unwrap();
    assert!(server.created_token);
    let token = read_pull_token(store.as_ref()).unwrap().unwrap();
    let address = server.local_addr;

    let (status, body) = http_get(address, RANGE, &token);
    assert_eq!(status, 200, "{body}");
    let parsed: serde_json::Value = serde_json::from_str(&body).unwrap();
    assert_eq!(parsed["total"], 0);
    assert_eq!(http_get(address, RANGE, "zbp_nope").0, 401);
    assert_eq!(http_get(address, "/workouts/x/series", &token).0, 403);

    server.stop_flag().store(true, Ordering::SeqCst);
    server.wait();
}

#[test]
fn startup_notes_warn_about_plaintext_only_beyond_loopback() {
    let local = startup_notes("127.0.0.1:43921".parse().unwrap());
    assert_eq!(local.len(), 1);
    let remote = startup_notes("0.0.0.0:43921".parse().unwrap()).join("\n");
    assert!(remote.contains("Plaintext HTTP"));
    assert!(remote.contains("reverse proxy"));
}

#[test]
fn interleaved_queries_keep_their_snapshot_or_return_expired() {
    let cache = RecordsCache::default();
    let first = body(&run(&format!("{RANGE}&limit=2"), Some(PULL), &cache));
    let cursor = first["next_cursor"].as_str().unwrap();
    let next = format!("{RANGE}&limit=2&cursor={cursor}");
    assert_eq!(
        run(&format!("{RANGE}&types=sleep"), Some(PULL), &cache)
            .response
            .status,
        200
    );
    assert_eq!(body(&run(&next, Some(PULL), &cache))["records"][0]["n"], 2);

    for kinds in ["steps", "hrv", "weight", "workouts"] {
        assert_eq!(
            run(&format!("{RANGE}&types={kinds}"), Some(PULL), &cache)
                .response
                .status,
            200
        );
    }
    let expired = run(&next, Some(PULL), &cache);
    assert_eq!(expired.response.status, 409);
    assert_eq!(body(&expired)["error"]["code"], "cursor_expired");
    assert_eq!(body(&run(RANGE, Some(PULL), &cache))["records"][0]["n"], 0);
    assert_eq!(run(&next, Some(PULL), &cache).response.status, 409);
}
