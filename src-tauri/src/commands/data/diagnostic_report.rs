//! 诊断报告：组装、备注脱敏、提交到反馈端点（从 commands/data.rs 拆出，逻辑不变）。

use super::*;

/// 组装诊断报告。
///
/// `include_assignments` 为真时附上「用户指认的型号 ↔ 这台设备的型号类编号」。
/// 这一对是内置目录唯一可能的成长来源，但它仍然是用户主动交出来的东西：
/// 只有在选择器里勾选了「帮忙补充目录」的那一次提交才会带上。
pub(super) async fn build_diagnostic_report(
    state: &AppState,
    include_assignments: bool,
    user_note: Option<&str>,
) -> std::result::Result<DiagnosticReport, AppError> {
    let device_payload = match state.auth.load_auth() {
        Ok(Some(auth)) => match ZeppConnector::new(auth) {
            Ok(connector) => match connector.fetch_devices().await {
                Ok(payload) => Ok(payload),
                Err(_) => Err("request_failed"),
            },
            Err(_) => Err("connection_unavailable"),
        },
        Ok(None) => Err("not_configured"),
        Err(_) => Err("authentication_unavailable"),
    };
    let device_evidence = match &device_payload {
        Ok(payload) => build_device_diagnostic(payload),
        Err(status) => empty_device_diagnostic(status),
    };
    let db = state.db.lock().await;
    let user_assigned_models = match (&device_payload, include_assignments) {
        (Ok(payload), true) => collect_assigned_models(&db, payload),
        _ => Vec::new(),
    };
    Ok(DiagnosticReport {
        format: "zeppbridge.feedback.v1".into(),
        app_version: env!("CARGO_PKG_VERSION").into(),
        schema_version: db.diagnostic_schema_version()?,
        normalizer_revision: NORMALIZER_REVISION.into(),
        operating_system: std::env::consts::OS.into(),
        device_evidence,
        user_assigned_models,
        unknown_workout_codes: db.diagnostic_unknown_workout_codes()?,
        workout_type_corrections: db.diagnostic_workout_type_corrections()?,
        workout_type_conflicts: db.diagnostic_workout_type_conflicts()?,
        // 类型由调用方按需要填；这个构造函数只负责本机能自动查到的事实。
        category: None,
        user_note: user_note.and_then(sanitize_diagnostic_note),
        last_cloud_rejection: db.diagnostic_cloud_rejection()?,
    })
}

/// 把用户写的自由文本收拾成可以发出去的样子。
///
/// 报告的其它部分都是固定白名单字段，唯独这一段是用户自己敲的，所以这里替他
/// 兜住三件事：去掉本机路径（沿用剪贴板那套判断）、抹掉看起来像凭据或长串标识
/// 的东西、截到长度上限。空白内容返回 None，让整个字段不出现在 JSON 里，而不是
/// 发一个空字符串出去。
pub(super) fn sanitize_diagnostic_note(note: &str) -> Option<String> {
    let without_paths = sanitize_clipboard_text(note.trim());
    let mut cleaned = String::with_capacity(without_paths.len());
    for (index, token) in without_paths
        .split_inclusive(char::is_whitespace)
        .enumerate()
    {
        let _ = index;
        let trimmed = token.trim_end();
        if looks_like_secret(trimmed) {
            cleaned.push_str("[已移除]");
            if token.len() > trimmed.len() {
                cleaned.push_str(&token[trimmed.len()..]);
            }
        } else {
            cleaned.push_str(token);
        }
    }
    let mut collapsed = cleaned.split_whitespace().collect::<Vec<_>>().join(" ");
    if collapsed.chars().count() > DIAGNOSTIC_NOTE_MAX_CHARS {
        collapsed = collapsed
            .chars()
            .take(DIAGNOSTIC_NOTE_MAX_CHARS)
            .collect::<String>();
    }
    (!collapsed.is_empty()).then_some(collapsed)
}

/// 一个词看起来像不像凭据、序列号或设备 ID。
///
/// 判断只看形状，不看它自称是什么：长串的十六进制、长串数字、带 @ 的地址、
/// MAC 形状，都直接换掉。宁可多抹一个型号编号，也不要漏出一个 token。
pub(super) fn looks_like_secret(token: &str) -> bool {
    let value = token.trim_matches(|character: char| {
        !character.is_alphanumeric() && character != '@' && character != ':' && character != '-'
    });
    if value.chars().count() < 8 {
        return false;
    }
    if value.contains('@') && value.contains('.') {
        return true;
    }
    // aa:bb:cc:dd:ee:ff 形状的 MAC 地址
    let colon_groups: Vec<&str> = value.split(':').collect();
    if colon_groups.len() >= 6
        && colon_groups
            .iter()
            .all(|group| group.len() == 2 && group.chars().all(|c| c.is_ascii_hexdigit()))
    {
        return true;
    }
    let alnum = value.chars().filter(|c| c.is_ascii_alphanumeric()).count();
    let digits = value.chars().filter(|c| c.is_ascii_digit()).count();
    if alnum >= 16
        && value
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return true;
    }
    digits >= 10
}

/// 逐台设备把「用户指认的型号」和「这台设备的型号类编号」配成对。
///
/// 一份响应里可能有好几台设备，所以配对必须在设备粒度上做，不能把一堆编号和
/// 一堆型号平铺在一起让服务端去猜。没有编号可交的设备直接跳过：只有型号没有
/// 编号，对补目录没有任何用处。
pub(super) fn collect_assigned_models(
    db: &zeppbridge_core::storage::Database,
    payload: &Value,
) -> Vec<DiagnosticAssignedModel> {
    let mut out = Vec::new();
    for item in device_items(payload) {
        let mut hints = BTreeSet::new();
        collect_model_identifier_hints(&item, &mut hints);
        if hints.is_empty() {
            continue;
        }
        let extra = flattened_device_metadata(&item);
        let device_id = first_string(&item, &["deviceId", "device_id", "macAddress"])
            .or_else(|| first_string(&extra, &["deviceId", "device_id"]));
        let serial = first_string(&extra, &["sn", "serial", "serialNumber"])
            .or_else(|| first_string(&item, &["sn", "serial", "serialNumber"]));
        let keys = [device_id.as_deref(), serial.as_deref()]
            .into_iter()
            .flatten()
            .collect::<Vec<_>>();
        if keys.is_empty() {
            continue;
        }
        let Ok(Some(assigned)) = db.device_model_override(&keys) else {
            continue;
        };
        out.push(DiagnosticAssignedModel {
            catalog_id: assigned.catalog_id,
            model_identifier_hints: hints.into_iter().take(8).collect(),
        });
    }
    out.sort_by(|a, b| a.catalog_id.cmp(&b.catalog_id));
    out.dedup();
    out
}

pub(super) const FEEDBACK_ENDPOINT: &str = "https://zeppbridge.pages.dev/api/feedback";

#[tauri::command]
pub async fn submit_diagnostic_report(
    state: tauri::State<'_, AppState>,
    note: Option<String>,
    category: Option<String>,
) -> std::result::Result<FeedbackSubmissionResult, AppError> {
    let mut report = build_diagnostic_report(&state, false, note.as_deref()).await?;
    report.category = normalize_report_category(category.as_deref());
    post_diagnostic_report(report).await
}

/// 用户选的问题类型。只认固定几个取值——这是个分类，不是又一个自由文本框。
pub(super) fn normalize_report_category(value: Option<&str>) -> Option<String> {
    const ALLOWED: [&str; 4] = ["device", "workout", "data", "other"];
    let value = value?.trim();
    ALLOWED
        .iter()
        .find(|allowed| **allowed == value)
        .map(|allowed| (*allowed).to_string())
}

/// 把「用户指认的型号 ↔ 这台设备的型号类编号」交回来，让下一版目录能自动
/// 识别同款设备。
///
/// 单独一个命令而不是在指认时自动发送：用户在选择器里勾选了才会走到这里，
/// 设置页那句「应用不会自动上报任何使用行为」才不会变成空话。
#[tauri::command]
pub async fn submit_device_model_assignment(
    state: tauri::State<'_, AppState>,
    note: Option<String>,
) -> std::result::Result<FeedbackSubmissionResult, AppError> {
    let report = build_diagnostic_report(&state, true, note.as_deref()).await?;
    if report.user_assigned_models.is_empty() {
        return Err(AppError::new(
            "err.diagnostic.nothing_to_submit",
            "这台设备没有可用于补充目录的型号编号，暂时不需要提交",
        ));
    }
    post_diagnostic_report(report).await
}

pub(super) async fn post_diagnostic_report(
    report: DiagnosticReport,
) -> std::result::Result<FeedbackSubmissionResult, AppError> {
    // 自动检测到问题，或者用户自己说了「我要报什么」，两条路都算数。
    //
    // 以前只认前者：本机没检测到异常时，用户哪怕手打了一整段说明也会被
    // 「无需提交报告」顶回去，而界面上又没有任何地方让他说明报的是什么。
    // 用户比检测器更清楚自己遇到了什么。
    let has_reportable_issue = report.device_evidence.unknown_device_count > 0
        || !report.user_assigned_models.is_empty()
        || !report.unknown_workout_codes.is_empty()
        // 一次运动类型纠正本身就是一条可处理的线索：它说的是「这个编号你们
        // 认错了」。以前这种情况本机检测不到——编号我们认识，只是认错了——
        // 于是报告会被判成「没有可处理的内容」顶回去。
        || !report.workout_type_corrections.is_empty()
        || report.workout_type_conflicts > 0
        || report.category.is_some();
    if !has_reportable_issue {
        return Err(AppError::new(
            "err.diagnostic.empty_report",
            "请先选择要反馈的问题类型，或写一句说明——否则这份报告里没有任何可处理的内容",
        ));
    }

    // This client is intentionally separate from the Zepp connector: it has
    // no cookie jar and receives no account token or cloud headers.
    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(5))
        .timeout(Duration::from_secs(12))
        .user_agent(format!("ZeppBridge/{} feedback", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|_| {
            AppError::new(
                "err.diagnostic.client_init_failed",
                "无法初始化错误报告连接",
            )
        })?;
    let response = client
        .post(FEEDBACK_ENDPOINT)
        .json(&report)
        .send()
        .await
        .map_err(|_| {
            AppError::new(
                "err.diagnostic.send_failed",
                "错误报告发送失败，请检查网络后重试",
            )
        })?;
    // 状态码要带出来。只说「服务暂时不可用」的话，字段被拒（4xx）和服务端
    // 真的挂了（5xx）长得一模一样，谁也查不下去。响应体不带——那是别人的
    // 服务器写的内容，不该原样显示给用户。
    let status = response.status();
    if !status.is_success() {
        // 限流要有自己的码：它和「字段对不上」都是 4xx，但用户要做的事完全
        // 不同——一个是等一会儿再来，一个是升级客户端。共用一个码时，界面
        // 只能显示同一句「服务返回了错误」，等于什么都没说。
        if status.as_u16() == 429 {
            return Err(AppError::new(
                "err.diagnostic.rate_limited",
                "短时间内提交了太多份报告，请过一会儿再试",
            ));
        }
        let hint = if status.is_client_error() {
            "这个版本发出的报告字段和服务端对不上（可能服务端还没更新）"
        } else {
            "错误报告服务暂时不可用，请稍后重试"
        };
        return Err(AppError::new(
            "err.diagnostic.http_error",
            format!("{hint}（HTTP {}）", status.as_u16()),
        )
        .with_params(serde_json::json!({ "status": status.as_u16() })));
    }
    response
        .json::<FeedbackSubmissionResult>()
        .await
        .map_err(|_| {
            AppError::new(
                "err.diagnostic.bad_response",
                "错误报告服务返回了无法识别的结果",
            )
        })
}
