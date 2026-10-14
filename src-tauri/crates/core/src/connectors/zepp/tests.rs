use super::*;

/// `code = 1` 是成功，照旧放行。
///
/// 三条流（workouts / workout_detail / sleep）的报文外面裹着
/// `{ code, message, data }`。一份真实库里 1075 条带包裹的报文，code 全是
/// 1、message 全是 "success"——所以这里必须一条都不误伤。
#[test]
fn a_successful_envelope_passes_through_untouched() {
    let payload = serde_json::json!({
        "code": 1,
        "message": "success",
        "data": { "next": -1, "summary": [] }
    });
    assert!(classify_business_code(&payload).is_none());
}

/// 另外四条流顶层没有 `code`，这个函数对它们必须完全无感。
#[test]
fn payloads_without_the_envelope_are_never_touched() {
    assert!(classify_business_code(&serde_json::json!({ "items": [1, 2, 3] })).is_none());
    assert!(classify_business_code(&serde_json::json!([1, 2, 3])).is_none());
    // `code` 是字符串（不是这层包裹）时同样不该被当成业务码。
    assert!(classify_business_code(&serde_json::json!({ "code": "ABC" })).is_none());
}

/// HTTP 200 + 非成功码，必须变成一条自己的错误，而不是「数据无法解析」。
///
/// 这正是「登进去是个空账号、一条数据都没有」那类反馈的形状：传输层成功，
/// 业务层拒绝，`data` 缺席，归一化器抛一句看不懂的解析失败。
#[test]
fn a_rejected_envelope_becomes_its_own_error_with_the_code_visible() {
    let payload = serde_json::json!({ "code": -1, "message": "token invalid" });
    let error = classify_business_code(&payload).expect("非成功码必须被拦下");
    assert!(matches!(
        error,
        ZeppBridgeError::CloudRejected { code: -1, .. }
    ));
    assert_eq!(error.code(), "err.core.cloud_rejected");
    // 云端原话要出现在给用户看的文案里：这是下一份反馈报告认出具体
    // 失败码的唯一途径。
    let message = error.user_message();
    assert!(message.contains("-1"), "{message}");
    assert!(message.contains("token invalid"), "{message}");
    // 但它不该被硬判成「需要重新认证」——一个失败码都没观测到，凭猜测把
    // 用户踢去重新扫码，比现在这个 bug 更糟。
    assert!(!error.needs_reauth());
}

/// 云端没给 message 时也不能崩，给一句说明就行。
#[test]
fn a_rejected_envelope_without_a_message_still_reports_the_code() {
    let error =
        classify_business_code(&serde_json::json!({ "code": 401 })).expect("非成功码必须被拦下");
    assert!(error.user_message().contains("401"));
}

#[test]
fn host_validation_accepts_known_regional_variants() {
    assert_eq!(
        validate_region_host("https://api-mifit-us3.zepp.com").unwrap(),
        "https://api-mifit-us3.zepp.com"
    );
    assert_eq!(
        validate_region_host("api-mifit.huami.com").unwrap(),
        "https://api-mifit.huami.com"
    );
}

#[test]
fn host_validation_rejects_unsafe_forms() {
    for host in [
        "http://api-mifit.huami.com",
        "https://user:pass@api-mifit.huami.com",
        "https://api-mifit.huami.com:443",
        "https://api-mifit.huami.com/path",
        "https://api-mifit.huami.com?q=1",
        "https://api-mifit.huami.com#fragment",
        "https://api-mifit.evil.example",
    ] {
        assert!(validate_region_host(host).is_err(), "accepted {host}");
    }
}

#[test]
fn status_classification_is_explicit() {
    assert!(matches!(
        classify_status(401),
        Some(ZeppBridgeError::NeedsReauth(_))
    ));
    assert!(matches!(
        classify_status(404),
        Some(ZeppBridgeError::Unavailable(_))
    ));
    assert!(matches!(
        classify_status(503),
        Some(ZeppBridgeError::RetryExhausted { .. })
    ));
    assert!(classify_status(204).is_none());
}

#[test]
fn detail_params_reject_injection() {
    assert!(validate_track_id("1700000000").is_ok());
    assert!(validate_track_id("../x").is_err());
    assert!(validate_detail_source("run.gps").is_ok());
    assert!(validate_detail_source("a/b").is_err());
}

#[test]
fn api_paths_reject_scheme_relative_and_query() {
    assert!(validate_api_path("/users/1/devices").is_ok());
    assert!(validate_api_path("//evil.example/users/1").is_err());
    assert!(validate_api_path("/users/1?x=1").is_err());
    assert!(validate_api_path("/users/1#frag").is_err());
    assert!(validate_api_path("users/1").is_err());
    assert!(validate_api_path("/users\\1").is_err());
}

#[test]
fn redirect_origin_compares_scheme_host_and_port() {
    let base = Url::parse("https://api-mifit.huami.com/").unwrap();
    assert!(same_region_origin(
        &Url::parse("https://api-mifit.huami.com/v1/next").unwrap(),
        &base
    ));
    assert!(!same_region_origin(
        &Url::parse("https://api-mifit.huami.com:8443/v1/next").unwrap(),
        &base
    ));
    assert!(!same_region_origin(
        &Url::parse("http://api-mifit.huami.com/v1/next").unwrap(),
        &base
    ));
    assert!(!same_region_origin(
        &Url::parse("https://evil.example/v1/next").unwrap(),
        &base
    ));
}

#[test]
fn member_id_is_the_account_holder_or_digits() {
    assert_eq!(validate_member_id("-1").unwrap(), "-1");
    assert_eq!(validate_member_id("42").unwrap(), "42");
    assert!(validate_member_id("../x").is_err());
    assert!(validate_member_id("").is_err());
    assert!(validate_member_id("1/2").is_err());
    assert!(validate_member_id("abc").is_err());
}
