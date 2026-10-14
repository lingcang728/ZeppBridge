//! 工具调用：打开只读库、按授权范围构造数据请求、拒绝与失败的回包（从 main.rs 拆出，逻辑不变）。

use super::*;

pub(super) fn open_db() -> Result<(Database, u64), (i64, String)> {
    let dir = paths::resolve_data_dir()
        .map_err(|error| (ERR_DATABASE, format!("无法确定数据目录：{error}")))?;
    let db_path = dir.join("zepp.db");
    if !db_path.exists() {
        return Err((
            ERR_NOT_CONFIGURED,
            "本机还没有 ZeppBridge 数据库。请先在桌面应用里连接账号并同步一次。".into(),
        ));
    }
    let bytes = std::fs::metadata(&db_path)
        .map(|meta| meta.len())
        .unwrap_or(0);
    // query_only 连接：写操作在 SQLite 层就被拒绝，只读不是靠这里的分支保证的。
    let db =
        Database::open_read_only(db_path).map_err(|error| (ERR_DATABASE, error.user_message()))?;
    Ok((db, bytes))
}

pub(super) fn call_tool(params: &Value, scope: &AccessScope) -> Result<Value, (i64, String)> {
    call_tool_with_db(params, scope, open_db)
}

pub(super) fn call_tool_with_db(
    params: &Value,
    scope: &AccessScope,
    open: impl FnOnce() -> Result<(Database, u64), (i64, String)>,
) -> Result<Value, (i64, String)> {
    let name = params
        .get("name")
        .and_then(Value::as_str)
        .ok_or((ERR_INVALID_PARAMS, "缺少工具名".to_string()))?;
    if !tool_definitions()
        .iter()
        .any(|tool| tool["name"].as_str() == Some(name))
    {
        return Err((ERR_METHOD_NOT_FOUND, format!("Unknown tool: {name}")));
    }
    if params
        .get("arguments")
        .is_some_and(|args| !args.is_object())
    {
        return Err((ERR_INVALID_PARAMS, "arguments must be an object".into()));
    }
    Ok(execute_tool_with_db(name, params, scope, open))
}

/// 工具结果里的范围自述。`grants` 是这次调用实际看到的开放任务数；
/// 范围拒绝里同样带它，让客户端能分清「没授权」和「没开 task 模式」。
pub(super) fn scope_json(scope: &AccessScope, grants: usize) -> Value {
    json!({ "mode": scope.as_str(), "grants": grants })
}

/// 授权窗口序列化成 `{category,start,end}`——拒绝载荷里的 `permittedRanges`
/// 就靠它告诉调用方「实际允许什么」，好据此重试（R3）。
pub(super) fn windows_json(windows: &[access::GrantWindow]) -> Value {
    Value::Array(
        windows
            .iter()
            .map(|window| {
                json!({
                    "category": window.category.as_str(),
                    "start": window.start_date.format("%Y-%m-%d").to_string(),
                    "end": window.end_date.format("%Y-%m-%d").to_string(),
                })
            })
            .collect(),
    )
}

/// 普通工具失败：一句话给模型（沿用旧形状），范围块照常附上。
pub(super) fn tool_error(scope: &AccessScope, grants: usize, message: String) -> Value {
    json!({
        "content": [{"type":"text", "text": message}],
        "isError": true,
        "scope": scope_json(scope, grants),
    })
}

/// 范围拒绝：稳定码 + 实际授权窗口，进 `structuredContent.error` 让客户端
/// 不用解析中文原文就能分支；text 里同时带上码，只读文本的客户端也看得见。
pub(super) fn scope_denial(
    scope: &AccessScope,
    grants: usize,
    code: &'static str,
    reason: String,
    permitted_ranges: Value,
) -> Value {
    json!({
        "content": [{"type":"text", "text": format!("{code}：{reason}")}],
        "isError": true,
        "scope": scope_json(scope, grants),
        "structuredContent": {
            "error": {
                "code": code,
                "reason": reason,
                "permittedRanges": permitted_ranges,
            },
            "scope": scope_json(scope, grants),
        },
    })
}

/// 工具执行期的失败出口。`denial` 非空表示范围拒绝（稳定码 + 授权窗口）；
/// `code` 非空表示别的有稳定码的失败（训练计划工具），码进 `structuredContent.error`。
pub(super) struct CallFailure {
    pub(super) message: String,
    pub(super) denial: Option<(&'static str, Value)>,
    pub(super) code: Option<&'static str>,
}

impl CallFailure {
    pub(super) fn plain(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
            denial: None,
            code: None,
        }
    }

    pub(super) fn denied(message: impl Into<String>, permitted_ranges: Value) -> Self {
        Self {
            message: message.into(),
            denial: Some((access::SCOPE_DENIED, permitted_ranges)),
            code: None,
        }
    }

    pub(super) fn coded(code: &'static str, message: String) -> Self {
        Self {
            message,
            denial: None,
            code: Some(code),
        }
    }
}

/// 有稳定码的普通失败：码和原文都进 `structuredContent.error`，text 里也带码。
pub(super) fn coded_error(
    scope: &AccessScope,
    grants: usize,
    code: &'static str,
    reason: String,
) -> Value {
    json!({
        "content": [{"type":"text", "text": format!("{code}：{reason}")}],
        "isError": true,
        "scope": scope_json(scope, grants),
        "structuredContent": {
            "error": { "code": code, "reason": reason },
            "scope": scope_json(scope, grants),
        },
    })
}

/// 工具调用 → 授权请求。每个注册工具都必须在这里有一行映射；
/// `every_registered_tool_builds_a_data_request` 守住这条不变式（R10）。
pub(super) fn build_request(name: &str, args: &Value) -> Result<DataRequest, String> {
    let mut request = DataRequest::default();
    match name {
        "list_workouts" => {
            request.tool = "list_workouts";
            request.categories = vec![AccessCategory::Workout];
        }
        "get_workout_insight" => {
            request.tool = "get_workout_insight";
            request.categories = vec![AccessCategory::Workout];
            let workout_id = args
                .get("workoutId")
                .and_then(Value::as_str)
                .ok_or_else(|| "缺少 workoutId".to_string())?;
            request.workout_ids = vec![workout_id.to_string()];
        }
        "get_metric_series" => {
            request.tool = "get_metric_series";
            let metrics = metric_args(args)?;
            let mut categories = Vec::new();
            for metric in &metrics {
                // 契约外的指标本来就不产数据；能映射的指标才换得到窗口——
                // 映射表查不到的东西在 task 范围里天然拿不到任何数据点。
                if let Some(category) = access::metric_category(metric) {
                    if !categories.contains(&category) {
                        categories.push(category);
                    }
                }
            }
            request.categories = categories;
            request.metrics = metrics;
            request.date_range = Some(days_back(args));
        }
        "get_sleep_detail" => {
            request.tool = "get_sleep_detail";
            request.categories = vec![AccessCategory::Sleep];
            request.latest_sleep = args.get("sleepId").and_then(Value::as_str).is_none();
        }
        "get_data_health" => {
            request.tool = "get_data_health";
            // 覆盖缺口、最近同步时刻、newest_sample_at 都是全库口径，裁不出
            // 诚实子集——task 模式对它整体拒绝（R5）。
            request.whole_library = true;
        }
        // 整库清单 / 任务模型里没有的类别（逐条饮食、生活事件）：task 模式整体拒绝，
        // 不给一份看起来完整、实则被裁过的东西（代码审查 R13）。
        "list_available_metrics" => {
            request.tool = "list_available_metrics";
            request.whole_library = true;
        }
        "list_life_events" => {
            request.tool = "list_life_events";
            date_args(args)?;
            request.whole_library = true;
        }
        "get_food_data" => {
            // 按天的摄入合计归在 body（access::metric_category）；逐条记录在 task 模式里不出去。
            request.tool = "get_food_data";
            request.categories = vec![AccessCategory::Body];
            request.metrics = FOOD_METRICS.map(str::to_string).to_vec();
            request.date_range = Some(days_back(args));
        }
        "get_metric_records" => {
            request.tool = "get_metric_records";
            let (metric, source) = metric_record_args(args)?;
            // 类别查不到的指标：categories 留空，执行侧在 task 模式里拒绝（fail closed）。
            if let Some(category) = record_category(metric, source) {
                request.categories = vec![category];
                request.metrics = vec![metric.to_string()];
            }
            let (start, end) = date_args(args)?;
            if let (Some(start), Some(end)) = (start, end) {
                request.date_range = Some((start, end));
            }
        }
        "list_sleep_sessions" => {
            request.tool = "list_sleep_sessions";
            request.categories = vec![AccessCategory::Sleep];
        }
        "get_workout_detail" | "get_workout_series" => {
            request.tool = if name == "get_workout_detail" {
                "get_workout_detail"
            } else {
                "get_workout_series"
            };
            request.categories = vec![AccessCategory::Workout];
            let workout_id = args
                .get("workoutId")
                .and_then(Value::as_str)
                .ok_or_else(|| "缺少 workoutId".to_string())?;
            request.workout_ids = vec![workout_id.to_string()];
        }
        // 教练工具：跨类别、跨日期（或者是训练计划账本），task 范围裁不出诚实子集，整体拒绝。
        "get_training_context"
        | "get_athlete_profile"
        | "get_training_plan"
        | "draft_training_plan"
        | "publish_training_plan" => {
            request.tool = COACH_TOOLS
                .iter()
                .find(|tool| **tool == name)
                .copied()
                .unwrap_or_default();
            request.whole_library = true;
        }
        other => {
            return Err(format!("没有名为 {other} 的工具。"));
        }
    }
    Ok(request)
}

/// 3B 的五个教练工具。
pub(super) const COACH_TOOLS: [&str; 5] = [
    "get_training_context",
    "get_athlete_profile",
    "get_training_plan",
    "draft_training_plan",
    "publish_training_plan",
];

/// `get_food_data` 按天合计的四个摄入指标。
pub(super) const FOOD_METRICS: [&str; 4] = [
    "intake_calories",
    "intake_protein_g",
    "intake_fat_g",
    "intake_carbs_g",
];

/// `days`（含今天）换成本地日范围，与 `storage::metric_series` 同一个窗口算法。
pub(super) fn days_back(args: &Value) -> (NaiveDate, NaiveDate) {
    let days = args
        .get("days")
        .and_then(Value::as_i64)
        .unwrap_or(90)
        .clamp(1, 1825);
    let end = Local::now().date_naive();
    (end - Duration::days(days - 1), end)
}

/// `startDate` / `endDate`：给了就必须是 YYYY-MM-DD，写错了明说，不悄悄当成没给。
pub(super) fn date_args(args: &Value) -> Result<(Option<NaiveDate>, Option<NaiveDate>), String> {
    let read = |field: &str| -> Result<Option<NaiveDate>, String> {
        match args.get(field) {
            None | Some(Value::Null) => Ok(None),
            Some(Value::String(text)) => NaiveDate::parse_from_str(text, "%Y-%m-%d")
                .map(Some)
                .map_err(|_| format!("{field} 要写成 YYYY-MM-DD")),
            Some(_) => Err(format!("{field} 要写成 YYYY-MM-DD")),
        }
    };
    Ok((read("startDate")?, read("endDate")?))
}

pub(super) fn metric_record_args(args: &Value) -> Result<(&str, &str), String> {
    let metric = args
        .get("metric")
        .and_then(Value::as_str)
        .ok_or_else(|| "缺少 metric".to_string())?;
    let source = args
        .get("source")
        .and_then(Value::as_str)
        .ok_or_else(|| "缺少 source".to_string())?;
    if !["daily_metrics", "metric_samples", "sleep_sessions"].contains(&source) {
        return Err(format!(
            "未知的 source：{source}。可选 daily_metrics、metric_samples、sleep_sessions。"
        ));
    }
    Ok((metric, source))
}

/// 逐条读数归哪个授权类别：睡眠表里的评分归睡眠，其余按指标名映射。
pub(super) fn record_category(metric: &str, source: &str) -> Option<AccessCategory> {
    if source == "sleep_sessions" {
        Some(AccessCategory::Sleep)
    } else {
        access::metric_category(metric)
    }
}

/// 分页参数：`limit` 按工具各自的上限夹住，`offset` 最多一百万。
pub(super) fn page_args(args: &Value, default: u64, max: u64) -> (usize, usize) {
    let limit = args
        .get("limit")
        .and_then(Value::as_u64)
        .unwrap_or(default)
        .clamp(1, max) as usize;
    let offset = args
        .get("offset")
        .and_then(Value::as_u64)
        .unwrap_or(0)
        .min(1_000_000) as usize;
    (limit, offset)
}

pub(super) fn metric_args(args: &Value) -> Result<Vec<String>, String> {
    let metrics: Vec<String> = args
        .get("metrics")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default();
    if metrics.is_empty() {
        return Err("metrics 不能为空".into());
    }
    Ok(metrics)
}

pub(super) fn execute_tool_with_db(
    name: &str,
    params: &Value,
    scope: &AccessScope,
    open: impl FnOnce() -> Result<(Database, u64), (i64, String)>,
) -> Value {
    let args = params.get("arguments").cloned().unwrap_or(json!({}));
    let (db, database_bytes) = match open() {
        Ok(pair) => pair,
        Err((_code, message)) => return tool_error(scope, 0, message),
    };

    // 授权每次调用都重读：连接本来就每请求重开（每次 `tools/call` 都在
    // `open_db` 新建只读连接），新连接拿到的是新的 WAL 读快照，任务页里
    // 翻转「开放给 MCP」对下一次请求立即生效。task 模式下读不出授权等于
    // 无法证明有授权——fail closed，不假装它存在。
    let grants = match access::shared_task_grants(&db) {
        Ok(grants) => grants,
        Err(error) => {
            if scope.is_task_scoped() {
                return scope_denial(
                    scope,
                    0,
                    access::SCOPE_DENIED,
                    format!("读取任务授权失败，按未授权处理：{}", error.user_message()),
                    json!([]),
                );
            }
            Vec::new()
        }
    };

    let request = match build_request(name, &args) {
        Ok(request) => request,
        Err(message) => return tool_error(scope, grants.len(), message),
    };
    let permit = match access::authorize(scope, &grants, &request) {
        Ok(permit) => permit,
        Err(denied) => {
            let ranges = windows_json(&access::granted_windows(&grants, &request.categories, None));
            return scope_denial(scope, grants.len(), denied.code, denied.reason, ranges);
        }
    };

    let mut payload = match run_tool(name, &args, &db, database_bytes, scope, &permit) {
        Ok(payload) => payload,
        Err(failure) => match (failure.denial, failure.code) {
            (Some((code, ranges)), _) => {
                return scope_denial(scope, grants.len(), code, failure.message, ranges);
            }
            (None, Some(code)) => return coded_error(scope, grants.len(), code, failure.message),
            (None, None) => return tool_error(scope, grants.len(), failure.message),
        },
    };

    // task 范围的第二道保险（R6）：白名单挑字段的出口本来就没有 device_id，
    // 整结构 serde 的出口（sleep detail）靠这道递归剥离兜底。
    if scope.is_task_scoped() {
        access::strip_identity_fields(&mut payload);
    }
    if let Some(object) = payload.as_object_mut() {
        object.insert("scope".to_string(), scope_json(scope, grants.len()));
    }

    // MCP 的 content 是给模型读的文本；结构化数据同时放进 structuredContent，
    // 让能用结构的客户端不必再解析一遍字符串。文本用紧凑序列化——同一份
    // JSON，客户端 parse 后等价，省去 pretty 的空白开销。
    let text = payload.to_string();
    json!({
        "content": [{ "type": "text", "text": text }],
        "structuredContent": payload,
        "isError": false,
        "scope": scope_json(scope, grants.len()),
    })
}

pub(super) fn run_tool(
    name: &str,
    args: &Value,
    db: &Database,
    database_bytes: u64,
    scope: &AccessScope,
    permit: &Permit,
) -> Result<Value, CallFailure> {
    match name {
        "list_workouts" => run_list_workouts(db, args, scope, permit),
        "get_workout_insight" => run_workout_insight(db, args, scope, permit),
        "get_metric_series" => run_metric_series(db, args, scope, permit),
        "get_sleep_detail" => run_sleep_detail(db, args, scope, permit),
        "get_data_health" => run_data_health(db, args, database_bytes),
        "get_food_data" => run_food_data(db, args, scope, permit),
        "list_available_metrics" => run_available_metrics(db),
        "get_metric_records" => run_metric_records(db, args, scope, permit),
        "list_sleep_sessions" => run_sleep_sessions(db, args, scope, permit),
        "get_workout_detail" => run_workout_detail(db, args, scope, permit),
        "get_workout_series" => run_workout_series(db, args, scope, permit),
        "list_life_events" => run_life_events(db, args),
        "get_training_context" => run_training_context(db, args),
        "get_athlete_profile" => run_athlete_profile(db),
        "get_training_plan" => run_training_plan(db),
        "draft_training_plan" => run_draft_plan(db, args),
        "publish_training_plan" => run_publish_plan(db, args),
        other => Err(CallFailure::plain(format!("没有名为 {other} 的工具。"))),
    }
}
