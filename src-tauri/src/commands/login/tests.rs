use super::*;

#[test]
fn extracted_login_debug_never_prints_the_token() {
    for token in ["secret-app-token", "unicode-令牌\nwith-escapes"] {
        let extracted = ExtractedLogin {
            user_id: "user".into(),
            app_token: token.into(),
            region_hint: Some("cn".into()),
        };
        for debug in [format!("{extracted:?}"), format!("{extracted:#?}")] {
            assert!(!debug.contains(token));
            assert!(!debug.contains("unicode-"));
            assert!(debug.contains("<redacted>"));
        }
        assert_eq!(extracted.clone(), extracted);
        assert_eq!(extracted.app_token, token);
    }
    let empty = ExtractedLogin {
        user_id: "user".into(),
        app_token: String::new(),
        region_hint: None,
    };
    assert!(format!("{empty:?}").contains("<empty>"));
}

fn probe_auth(host: &str) -> AuthInfo {
    AuthInfo {
        app_token: "token".to_string(),
        user_id: "user".to_string(),
        region_host: host.to_string(),
    }
}

/// 这是那个 bug 本身：错误区域先答应，正确区域后答应。
///
/// 一个不认识这个用户的区域根本不去查数据，所以它的空响应往往比正确区域
/// 返回真实设备还快。旧代码「谁先答应就用谁」，于是把错的那个存了下来，
/// 之后每次同步都打向那里——界面显示已连接，库里一条记录也没有。
#[test]
fn a_fast_empty_region_does_not_beat_a_slower_one_that_knows_the_account() {
    let mut outcome = RegionBatchOutcome::default();

    assert!(!outcome.record(
        0,
        probe_auth("https://wrong.example"),
        RegionEvidence::Empty
    ));
    assert!(outcome.record(
        5,
        probe_auth("https://right.example"),
        RegionEvidence::Identified
    ));

    let winner = outcome.into_winner(false).expect("a winner");
    assert_eq!(winner.auth.region_host, "https://right.example");
    assert_eq!(winner.confidence, "identified");
}

/// 全都交不出设备时，按偏好顺序挑，而不是按谁先回来。
#[test]
fn only_empty_answers_fall_back_to_the_most_preferred_host() {
    let mut outcome = RegionBatchOutcome::default();

    outcome.record(
        3,
        probe_auth("https://third.example"),
        RegionEvidence::Empty,
    );
    outcome.record(
        1,
        probe_auth("https://first.example"),
        RegionEvidence::Empty,
    );
    outcome.record(
        2,
        probe_auth("https://second.example"),
        RegionEvidence::Empty,
    );

    let winner = outcome.into_winner(false).expect("a winner");
    assert_eq!(winner.auth.region_host, "https://first.example");
    // 猜出来的就得说是猜的：同步之后一条记录都没有时，这是唯一的线索。
    assert_eq!(winner.confidence, "unconfirmed");
}

/// Zepp 自己指名的 host 交不出设备，不等于它错了——这个账号可能一块表都没绑。
/// 它仍然算数，只是标成 `hinted` 而不是 `identified`。
#[test]
fn an_authoritative_host_still_counts_when_the_account_has_no_devices() {
    let mut outcome = RegionBatchOutcome::default();
    outcome.record(
        0,
        probe_auth("https://hinted.example"),
        RegionEvidence::Empty,
    );

    let winner = outcome.into_winner(true).expect("a winner");
    assert_eq!(winner.auth.region_host, "https://hinted.example");
    assert_eq!(winner.confidence, "hinted");
}

/// 一个都没答应就是没有结论，不能随便挑一个凑数。
#[test]
fn no_answer_produces_no_winner() {
    assert!(RegionBatchOutcome::default().into_winner(true).is_none());
    assert!(RegionBatchOutcome::default().into_winner(false).is_none());
}

/// 凭据被明确拒绝，仍然是终局失败——不会被别处的空响应盖过去。
#[test]
fn an_explicit_rejection_stays_fatal() {
    let mut failures = RegionProbeFailures::default();
    failures.record(RegionProbeFailure::Transient);
    failures.record(RegionProbeFailure::Rejected);
    failures.record(RegionProbeFailure::Other);

    let failure = failures.into_login_failure();
    assert!(!failure.retryable);
    assert_eq!(failure.error.code, "err.login.credentials_rejected");
}

/// 停在第三方授权页太久，才提示；其余情况一律不出声。
#[test]
fn the_third_party_hint_fires_only_while_stuck_on_a_third_party_page() {
    let long = THIRD_PARTY_STALL_AFTER;
    let short = Duration::from_secs(5);
    let google = "https://accounts.google.com/o/oauth2/auth";

    assert!(third_party_stall_is_due(google, long, false, false));
    // 还没等够。登录本来就慢，输密码等验证码都要时间。
    assert!(!third_party_stall_is_due(google, short, false, false));
    // 这一页上已经说过一次了。
    assert!(!third_party_stall_is_due(google, long, false, true));
    // 凭据已经读到，卡住的是后面的区域确认，不该建议换登录方式。
    assert!(!third_party_stall_is_due(google, long, true, false));
    // 停在我们自己打开的那一页——那是另一条兜底路径（备用登录页）管的事。
    assert!(!third_party_stall_is_due(
        PRIMARY_LOGIN_URL,
        long,
        false,
        false
    ));
}

/// 放行导航和「是不是第三方授权页」读的是同一份 host 表。
#[test]
fn third_party_hosts_are_shared_with_the_navigation_allowlist() {
    for host in THIRD_PARTY_AUTH_HOSTS {
        let url = format!("https://{host}/oauth");
        assert!(is_allowed_login_url(&url), "{url} should be allowed");
        assert!(
            is_third_party_auth_page(&url),
            "{url} should be third-party"
        );
    }
    assert!(!is_third_party_auth_page("https://watchface.zepp.com/"));
    assert!(!is_third_party_auth_page("not a url"));
}

#[test]
fn a_stale_login_epoch_must_not_close_a_newer_window() {
    assert!(!closer_epoch_owns_the_window(1, 2));
    assert!(closer_epoch_owns_the_window(7, 7));
    assert!(!closer_epoch_owns_the_window(8, 7));
}

/// 旧窗口还占着标签时，绝不能去建新窗口。
///
/// `close()` 之后标签不会当场交还（原因见 `close_login_window_and_wait`），
/// 那么只要它还占着，唯一正确的动作就是继续等。一旦这里放行，用户拿到的
/// 就是「无法打开登录窗口」，而他刚才那个能用的窗口已经被关掉了。
///
/// 「close() 之后标签仍在」这个前提本身没有测试：钉住它要 `tauri` 的
/// mock runtime，而把 `tauri = { features = ["test"] }` 加进 dev-dependencies
/// 会让 `tauri/test` 在整个测试构建里生效，Windows 上产出的测试二进制直接
/// 加载失败（STATUS_ENTRYPOINT_NOT_FOUND，一条用例都跑不到）。为一条关于
/// 第三方库行为的断言换掉整个 Windows 门禁，不划算。
#[test]
fn a_new_login_window_waits_until_the_old_label_is_released() {
    // 标签还占着——不管等了多久，都不是「可以建了」。
    assert_eq!(
        close_wait_step(true, Duration::ZERO),
        CloseWait::KeepWaiting
    );
    assert_eq!(
        close_wait_step(true, LOGIN_WINDOW_CLOSE_TIMEOUT - LOGIN_WINDOW_CLOSE_POLL),
        CloseWait::KeepWaiting
    );

    // 标签空了才放行。第一次登录本来就没有旧窗口，不该被这段等待拖慢。
    assert_eq!(close_wait_step(false, Duration::ZERO), CloseWait::Released);

    // 等待必须有头。主线程真的卡住时，宁可给一句「稍等再试」，也不能让
    // 命令永远不返回。
    assert_eq!(
        close_wait_step(true, LOGIN_WINDOW_CLOSE_TIMEOUT),
        CloseWait::TimedOut
    );
    assert_eq!(
        close_wait_step(true, LOGIN_WINDOW_CLOSE_TIMEOUT + Duration::from_secs(1)),
        CloseWait::TimedOut
    );
    // 超时之后标签才空出来，仍然该放行，而不是报错。
    assert_eq!(
        close_wait_step(false, LOGIN_WINDOW_CLOSE_TIMEOUT + Duration::from_secs(1)),
        CloseWait::Released
    );
}

/// 用户还在主登录页上输密码时，绝不能把页面导走。
///
/// 这一条对应线上反馈：邮箱密码刚输一半，或者去邮箱抄验证码的工夫，
/// 页面就被换成了隐私页（清除数据／注销账号），登录只能从头再来。
#[test]
fn fallback_needs_the_full_wait_and_fires_at_most_once() {
    let long_enough = FALLBACK_AFTER + Duration::from_secs(5);

    assert!(fallback_is_due(long_enough, false));
    assert!(!fallback_is_due(Duration::from_secs(5), false));
    assert!(!fallback_is_due(long_enough, true));
}

/// 用户一旦走进第三方登录流程，就绝不能把页面导走。
///
/// 这一条对应线上反馈：去邮箱抄小米验证码的工夫，页面被换成了隐私页
/// （清除数据／注销账号），登录只能从头再来。地址已经不是我们打开的那
/// 一页，就是「用户正在登录」的确证，轮不到计时器说话。
#[test]
fn only_the_page_we_opened_may_be_navigated_away() {
    assert!(is_primary_login_page("https://watchface.zepp.com"));
    assert!(is_primary_login_page("https://watchface.zepp.com/"));
    assert!(is_primary_login_page(
        "https://watchface.zepp.com/login?from=app"
    ));

    assert!(!is_primary_login_page(
        "https://account.xiaomi.com/oauth2/authorize"
    ));
    assert!(!is_primary_login_page(
        "https://accounts.google.com/o/oauth2/auth"
    ));
    assert!(!is_primary_login_page(
        "https://www.facebook.com/dialog/oauth"
    ));
    assert!(!is_primary_login_page(
        "https://open.weixin.qq.com/connect/qrconnect"
    ));
    assert!(!is_primary_login_page(
        "https://user.huami.com/privacy2/index.html"
    ));
}

/// localStorage 里的凭据要和 cookie 一样能用。
///
/// 表盘站是个前端应用，把登录信息写进 localStorage 完全正常；那样
/// `document.cookie` 和 webview 的 cookie jar 都看不到它，用户就只能自己
/// 开开发者工具抠 App Token——Reddit 上真有人是这么过来的。
#[test]
fn credentials_from_web_storage_parse_like_cookies() {
    let raw = r#"{"token_info":{"user_id":"55","app_token":"from-local-storage"}}"#;
    let entries = vec![("hm-user-login-info".to_string(), raw.to_string())];
    let got = parse_login_cookies(&entries).expect("storage credentials");
    assert_eq!(got.user_id, "55");
    assert_eq!(got.app_token, "from-local-storage");
}

/// 「还没登录」和「登录了但我们没读到凭据」必须能分开。
///
/// 分不开的话，后者只能一路静默等到 15 分钟超时，再给一句「登录超时，
/// 请重试」——而重试多少次都不会好，该做的是改用 HAR 或手动填 Token。
#[test]
fn a_signed_in_page_is_told_apart_from_the_login_page() {
    let none: Vec<(String, String)> = Vec::new();

    // 还停在登录页，cookie 里也没有任何登录后才有的名字。
    assert!(!page_looks_signed_in(
        "https://watchface.zepp.com/login",
        &none
    ));
    assert!(!page_looks_signed_in(
        "https://account.xiaomi.com/oauth2/authorize",
        &none
    ));

    // 已经离开登录页。
    assert!(page_looks_signed_in(
        "https://watchface.zepp.com/dashboard",
        &none
    ));

    // 或者 cookie 里已经出现了登录后才有的名字，哪怕还没解析出凭据。
    assert!(page_looks_signed_in(
        "https://user.huami.com/privacy2/index.html",
        &[("apptoken".to_string(), "whatever".to_string())]
    ));

    // 第三方 OAuth 页上的通用 cookie 名不能当成 Zepp 已登录。
    assert!(!page_looks_signed_in(
        "https://accounts.google.com/o/oauth2/auth",
        &[
            ("session".to_string(), "google-session".to_string()),
            ("token".to_string(), "google-token".to_string()),
            ("SID".to_string(), "x".to_string()),
        ]
    ));
    assert!(!page_looks_signed_in(
        "https://www.facebook.com/dialog/oauth",
        &[
            ("xs".to_string(), "fb".to_string()),
            ("c_user".to_string(), "1".to_string())
        ]
    ));
}

#[test]
fn parses_hm_user_login_info_token_info() {
    let raw = r#"{"token_info":{"user_id":"12345","app_token":"tok_abc"}}"#;
    let cookies = vec![("hm-user-login-info".into(), raw.into())];
    let got = parse_login_cookies(&cookies).expect("login info");
    assert_eq!(got.user_id, "12345");
    assert_eq!(got.app_token, "tok_abc");
}

#[test]
fn parses_url_encoded_login_info() {
    let encoded = "%7B%22token_info%22%3A%7B%22user_id%22%3A%22111%22%2C%22app_token%22%3A%22secret-token%22%7D%7D";
    let cookies = vec![("hm-user-login-info".into(), encoded.into())];
    let got = parse_login_cookies(&cookies).expect("encoded login info");
    assert_eq!(got.user_id, "111");
    assert_eq!(got.app_token, "secret-token");
}

#[test]
fn parses_nested_string_token_info_and_numeric_user() {
    let raw =
        r#"{"token_info":"{\"user_id\":987654,\"app_token\":\"nested-tok\",\"region\":\"us\"}"}"#;
    let cookies = vec![("hm-user-login-info".into(), raw.into())];
    let got = parse_login_cookies(&cookies).expect("nested token_info");
    assert_eq!(got.user_id, "987654");
    assert_eq!(got.app_token, "nested-tok");
    assert_eq!(got.region_hint.as_deref(), Some("us"));
}

#[test]
fn parses_userid_and_apptoken_cookies() {
    let cookies = vec![
        ("foo".into(), "bar".into()),
        ("userid".into(), "user_99".into()),
        ("apptoken".into(), "app-token-value".into()),
    ];
    let got = parse_login_cookies(&cookies).expect("pair cookies");
    assert_eq!(got.user_id, "user_99");
    assert_eq!(got.app_token, "app-token-value");
}

#[test]
fn current_pair_overrides_stale_bundled_login_info() {
    let cookies = vec![
        (
            "hm-user-login-info".into(),
            r#"{"token_info":{"user_id":"old","app_token":"old-token"}}"#.into(),
        ),
        ("userid".into(), "new-user".into()),
        ("apptoken".into(), "new+token".into()),
        (
            "wf_baseUrl".into(),
            "https://api-mifit-sg2.huami.com".into(),
        ),
    ];
    let got = parse_login_cookies(&cookies).expect("current pair");
    assert_eq!(got.user_id, "new-user");
    assert_eq!(got.app_token, "new+token");
    assert_eq!(
        got.region_hint.as_deref(),
        Some("https://api-mifit-sg2.huami.com")
    );
}

#[test]
fn region_host_can_be_read_from_domains_json() {
    let cookies = vec![
        ("userid".into(), "42".into()),
        ("apptoken".into(), "token".into()),
        (
            "domains".into(),
            r#"[{"cnames":["api-mifit-de2.huami.com"]}]"#.into(),
        ),
    ];
    let got = parse_login_cookies(&cookies).expect("domains candidate");
    assert_eq!(
        got.region_hint.as_deref(),
        Some("https://api-mifit-de2.huami.com")
    );
}

#[test]
fn fresher_page_values_are_not_overwritten_by_cookie_store_values() {
    let mut pairs = vec![
        ("userid".into(), "current".into()),
        ("apptoken".into(), "current-token".into()),
    ];
    append_missing_pairs(
        &mut pairs,
        vec![
            ("userid".into(), "stale".into()),
            ("apptoken".into(), "stale-token".into()),
            ("cname".into(), "api-mifit-us2.huami.com".into()),
        ],
    );
    let got = parse_login_cookies(&pairs).expect("page candidate");
    assert_eq!(got.user_id, "current");
    assert_eq!(got.app_token, "current-token");
}

#[test]
fn parses_document_cookie_header() {
    let header = "foo=bar; userid=42; apptoken=tkn";
    let got = parse_login_cookies(&parse_cookie_header(header)).expect("header");
    assert_eq!(got.user_id, "42");
    assert_eq!(got.app_token, "tkn");
}

#[test]
fn rejects_incomplete_or_unsafe_cookies() {
    assert!(parse_login_cookies(&[("userid".into(), "42".into())]).is_none());
    assert!(parse_login_cookies(&[
        ("userid".into(), "bad/id".into()),
        ("apptoken".into(), "tok".into()),
    ])
    .is_none());
    assert!(parse_login_cookies(&[(
        "hm-user-login-info".into(),
        r#"{"token_info":{"login_token":"nope"}}"#.into()
    ),])
    .is_none());
}

#[test]
fn region_hint_stays_on_allow_list() {
    assert_eq!(
        hosts_from_region_hint("https://api-mifit-cn3.zepp.com"),
        vec!["https://api-mifit-cn3.zepp.com".to_string()]
    );
    let us = hosts_from_region_hint("us");
    assert!(us.iter().all(|host| host.contains("-us")));
    assert!(hosts_from_region_hint("https://evil.example").is_empty());
    assert_eq!(
        hosts_from_region_hint("https://api-mifit-eu2.zepp.com"),
        vec!["https://api-mifit-eu2.zepp.com".to_string()]
    );
    assert!(REGION_HOST_ALLOWLIST.contains(&"https://api-mifit-sg2.huami.com"));
    assert!(REGION_HOST_ALLOWLIST.contains(&"https://api-mifit-de2.huami.com"));
}

#[test]
fn native_login_title_follows_the_interface_locale() {
    assert_eq!(login_window_title("en"), "Sign in to Zepp");
    assert_eq!(login_window_title("en-US"), "Sign in to Zepp");
    assert_eq!(login_window_title("zh"), "登录 Zepp");
    assert_eq!(login_window_title("zh-CN"), "登录 Zepp");
    // P7 十语言：地区变体归到基础语言，认不出的回落英文。
    assert_eq!(login_window_title("es"), "Iniciar sesión en Zepp");
    assert_eq!(login_window_title("pt-BR"), "Entrar no Zepp");
    assert_eq!(login_window_title("pt"), "Iniciar sessão no Zepp");
    assert_eq!(login_window_title("de-AT"), "Bei Zepp anmelden");
    assert_eq!(login_window_title("ru"), "Войти в Zepp");
    assert_eq!(login_window_title("hi-IN"), "Zepp में साइन इन करें");
    assert_eq!(login_window_title("fr"), "Se connecter à Zepp");
    assert_eq!(login_window_title("nl"), "Inloggen bij Zepp");
    assert_eq!(login_window_title("ja-JP"), "Sign in to Zepp");
}

#[test]
fn login_status_url_drops_oauth_secrets() {
    let safe = safe_login_page_url(
        "https://account-us.zepp.com/callback?code=secret&state=private#access_token",
    );
    assert_eq!(safe, "https://account-us.zepp.com/callback");
    assert!(!safe.contains("secret"));
    assert!(!safe.contains("private"));
    assert!(!safe.contains("access_token"));
}

#[test]
fn region_probe_error_classification_distinguishes_rejection() {
    assert_eq!(
        classify_region_probe_error(&ZeppBridgeError::NeedsReauth("HTTP 401".into())),
        RegionProbeFailure::Rejected
    );
    assert_eq!(
        classify_region_probe_error(&ZeppBridgeError::Unavailable("HTTP 404".into())),
        RegionProbeFailure::Other
    );
    let rejected = RegionProbeFailures {
        rejected: 1,
        transient: 2,
        other: 3,
    }
    .into_login_failure();
    assert_eq!(rejected.error.code, "err.login.credentials_rejected");
    // 凭据被否掉了，再试一百次也是这个结果——不能留着窗口空转。
    assert!(!rejected.retryable);

    // 只有网络那一类值得原地重试，而且必须保住登录窗口：它是隔离会话，
    // 关掉就意味着验证码、扫码全部重来。
    let unreachable = RegionProbeFailures {
        transient: 2,
        ..Default::default()
    }
    .into_login_failure();
    assert_eq!(unreachable.error.code, "err.login.region_unreachable");
    assert!(unreachable.retryable);

    let other = RegionProbeFailures {
        other: 1,
        ..Default::default()
    }
    .into_login_failure();
    assert_eq!(other.error.code, "err.login.region_probe_failed");
    assert!(!other.retryable);
}

/// 超出系统凭据管理器容量的值不可能是 App Token。
///
/// Windows 凭据管理器只存得下 1280 个 UTF-16 码元；以前这里放行到 16 KB，
/// 于是从页面存储里捞到的一整段 JSON 会被当成令牌采用，一路走到保存那步
/// 才失败，报的还是一句指不到长度的「无法写入 Windows 凭据管理器」。
#[test]
fn an_oversized_candidate_is_not_mistaken_for_an_app_token() {
    let real_token = "a".repeat(96);
    assert_eq!(
        sanitize_app_token(&real_token).as_deref(),
        Some(real_token.as_str())
    );

    let blob = "x".repeat(crate::auth::CREDENTIAL_MAX_UTF16_UNITS + 1);
    assert_eq!(sanitize_app_token(&blob), None);

    // 否掉超长候选之后，打包在 hm-user-login-info 里的真令牌才轮得到。
    let cookies = vec![
        ("apptoken".to_string(), blob),
        (
            "hm-user-login-info".to_string(),
            r#"{"token_info":{"user_id":"77","app_token":"the-real-token"}}"#.to_string(),
        ),
    ];
    let got = parse_login_cookies(&cookies).expect("falls back to the bundled token");
    assert_eq!(got.user_id, "77");
    assert_eq!(got.app_token, "the-real-token");
}

#[test]
fn login_navigation_allow_list() {
    assert!(is_allowed_login_url("https://watchface.zepp.com/"));
    assert!(is_allowed_login_url(
        "https://user.huami.com/privacy2/index.html"
    ));
    assert!(is_allowed_login_url(
        "https://account.xiaomi.com/oauth2/authorize"
    ));
    assert!(is_allowed_login_url(
        "https://open.weixin.qq.com/connect/qrconnect"
    ));
    assert!(is_allowed_login_url(
        "https://accounts.google.com/o/oauth2/auth"
    ));
    assert!(is_allowed_login_url(
        "https://www.facebook.com/dialog/oauth"
    ));
    assert!(is_allowed_login_url(
        "https://account-us.amazfit.com/v1/accounts/connect/facebook/callback"
    ));
    assert!(!is_allowed_login_url("about:blank"));
    assert!(!is_allowed_login_url(
        "data:text/html,<script>alert(1)</script>"
    ));
    assert!(!is_allowed_login_url("https://example.com/"));
    assert!(!is_allowed_login_url("http://watchface.zepp.com/"));
    assert!(!is_allowed_login_url(
        "https://evil.xiaomi.com/oauth2/authorize"
    ));
    assert!(!is_allowed_login_url("https://facebook.com/dialog/oauth"));
}

#[test]
fn blocked_login_log_omits_query_and_fragment() {
    let url = reqwest::Url::parse(
        "https://example.com/oauth/callback?code=secret&state=private#access_token",
    )
    .unwrap();
    let fields = login_url_log_fields(&url);
    assert_eq!(fields, "host=example.com path=/oauth/callback");
    assert!(!fields.contains("secret"));
    assert!(!fields.contains("private"));
    assert!(!fields.contains("access_token"));
}

#[test]
fn login_window_has_no_opener_permission() {
    let main: serde_json::Value =
        serde_json::from_str(include_str!("../../../capabilities/default.json")).unwrap();
    assert_eq!(main["windows"], serde_json::json!(["main"]));

    let login: serde_json::Value =
        serde_json::from_str(include_str!("../../../capabilities/zepp-login.json")).unwrap();
    assert_eq!(login["windows"], serde_json::json!(["zepp-login"]));
    assert_eq!(
        login["permissions"],
        serde_json::json!(["core:window:allow-close", "core:event:allow-listen"])
    );
    assert!(login.get("remote").is_none());
    assert!(login["permissions"]
        .as_array()
        .unwrap()
        .iter()
        .all(|permission| permission.as_str() != Some("core:default")
            && permission.as_str() != Some("opener:default")
            && permission["identifier"] != "opener:allow-open-url"));
}
