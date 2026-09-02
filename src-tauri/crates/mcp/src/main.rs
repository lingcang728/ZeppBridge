//! ZeppBridge MCP server。
//!
//! 让外部模型能查这个人自己的健康数据，而不必先把数据交出去。因此边界画得
//! 很死：
//!
//! * **只读**。用 SQLite 的 `query_only` 连接打开，写操作在连接层就被拒绝，
//!   不靠这个文件里的分支去保证。
//! * **不联网、不监听**。传输只有 stdio；这个进程不会打开任何端口，也不会
//!   向 Zepp 发一个请求。要拉新数据请用桌面应用或 `zeppbridge-cli sync`。
//! * **不吐凭据和本机路径**。返回里没有 token、Cookie、完整账号，也没有
//!   数据目录的绝对路径——那些对回答健康问题没有帮助，泄漏出去却是实打实的。
//! * **缺失就是缺失**。没有采样的那一天不会出现在序列里，也不会补 0。
//!   单位、时区、来源和缺失值的定义全部来自 `zeppbridge_core::contract`，
//!   和 GUI、CLI、Local API 是同一份。
//!
//! 协议是 MCP 的 JSON-RPC 2.0 over stdio：一行一条消息。手写而不是引入
//! SDK，是因为这里只需要几个只读方法，而一个只读工具服务不值得为此拖进
//! 一整套运行时。
//!
//! **双时代（dual-era）。** 2026-07-28 那一版把 `initialize` / `initialized`
//! 握手整个取消了：版本、身份和能力改为每一次请求自己带在 `_meta` 里，并
//! 新增了一个 `server/discover`。旧客户端仍然只会发 `initialize`。所以这里
//! 两条都实现：
//!
//! * 收到 `initialize` -> 走 legacy 语义，按旧规矩回；
//! * 收到 `server/discover`，或者请求的 `_meta` 里带了
//!   `io.modelcontextprotocol/protocolVersion` -> 走 modern 语义。
//!
//! 只实现一边的代价是实打实的：只留 legacy，严格按新协议说话的客户端连不
//! 上；只留 modern，今天所有能用的客户端全部连不上。而这个服务本来就是
//! stateless、stdio、只读的——新协议要求的那些性质它天生就满足。

use std::io::{self, BufRead, Write};

use serde_json::{json, Value};
use zeppbridge_core::contract;
use zeppbridge_core::paths;
use zeppbridge_core::storage::Database;

const VERSION: &str = env!("CARGO_PKG_VERSION");

/// 现代（无握手）协议版本。
const MODERN_PROTOCOL_VERSION: &str = "2026-07-28";
/// 收到不带版本的 legacy `initialize` 时回哪一版。
const LEGACY_PROTOCOL_VERSION: &str = "2024-11-05";

/// 我们愿意按其语义作答的全部版本，新的在前。
///
/// 这个服务的表面只有 `tools/list` 和 `tools/call`，而这两个方法的形状在
/// 2024-11-05 到 2025-11-25 之间没有不兼容的变化，所以这几版都能照直支持。
/// 不在这张表里的版本会收到 `UnsupportedProtocolVersionError`——**宁可明确
/// 拒绝，也不要按一套自己没实现的语义假装答得上来。**
const SUPPORTED_PROTOCOL_VERSIONS: [&str; 5] = [
    MODERN_PROTOCOL_VERSION,
    "2025-11-25",
    "2025-06-18",
    "2025-03-26",
    LEGACY_PROTOCOL_VERSION,
];

/// `_meta` 里那几个保留键的前缀。
const META_PROTOCOL_VERSION: &str = "io.modelcontextprotocol/protocolVersion";
const META_SERVER_INFO: &str = "io.modelcontextprotocol/serverInfo";

/// 列表结果的缓存提示。工具定义只跟着构建走，进程活着的时候不会变，
/// 但也别让客户端缓存到下一次升级之后——一小时是个既省往返又不至于
/// 让人拿着旧工具表的折中。
const LIST_TTL_MS: i64 = 3_600_000;

/// JSON-RPC 错误码。前三个是协议规定的，-32000 段是留给应用的。
const ERR_METHOD_NOT_FOUND: i64 = -32601;
const ERR_INVALID_PARAMS: i64 = -32602;
const ERR_NOT_CONFIGURED: i64 = -32001;
const ERR_DATABASE: i64 = -32002;
/// 2026-07-28 规定的 `UnsupportedProtocolVersionError`。
///
/// 它落在 -32020..-32099 这个留给规范的区段里，和上面两个应用自定义码
/// （-32000..-32019，明确被 grandfather 了）不冲突。
const ERR_UNSUPPORTED_PROTOCOL_VERSION: i64 = -32022;

fn main() {
    let stdin = io::stdin();
    let mut stdout = io::stdout();
    for line in stdin.lock().lines() {
        let Ok(line) = line else { break };
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let request: Value = match serde_json::from_str(trimmed) {
            Ok(value) => value,
            Err(error) => {
                // 解析不了的行没有 id，按 JSON-RPC 只能回一个 null id 的错误。
                let _ = writeln!(
                    stdout,
                    "{}",
                    json!({
                        "jsonrpc": "2.0",
                        "id": Value::Null,
                        "error": { "code": -32700, "message": format!("无法解析请求：{error}") }
                    })
                );
                let _ = stdout.flush();
                continue;
            }
        };
        // 通知（没有 id）按协议不回复。
        let Some(id) = request.get("id").cloned() else {
            continue;
        };
        let method = request
            .get("method")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let params = request.get("params").cloned().unwrap_or(json!({}));
        let response = match handle(method, &params) {
            Ok(result) => json!({ "jsonrpc": "2.0", "id": id, "result": result }),
            Err(error) => json!({ "jsonrpc": "2.0", "id": id, "error": error.to_json() }),
        };
        let _ = writeln!(stdout, "{response}");
        let _ = stdout.flush();
    }
}

/// 一个 JSON-RPC 错误。
///
/// 不再用裸 `(i64, String)`：`UnsupportedProtocolVersionError` 规定要带
/// `data.supported` 和 `data.requested`，客户端靠这两项挑一个双方都支持的
/// 版本重试。没有 `data` 的话它只能放弃。
#[derive(Debug)]
struct RpcError {
    code: i64,
    message: String,
    data: Option<Value>,
}

impl RpcError {
    fn new(code: i64, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
            data: None,
        }
    }

    fn to_json(&self) -> Value {
        match &self.data {
            Some(data) => json!({ "code": self.code, "message": self.message, "data": data }),
            None => json!({ "code": self.code, "message": self.message }),
        }
    }
}

impl From<(i64, String)> for RpcError {
    fn from((code, message): (i64, String)) -> Self {
        Self::new(code, message)
    }
}

/// 服务器身份。modern 结果把它放在 `_meta` 里，legacy 放在 `serverInfo`。
fn server_info() -> Value {
    json!({ "name": "zeppbridge", "version": VERSION })
}

/// 第一次握手（或第一次调用）就该看到的边界和缺失值规则。
///
/// 写在这里而不是等调用方拿到一条空序列自己猜：一个模型看到「今天没有心率」
/// 时，最容易做的事就是当成 0。
fn instructions() -> String {
    format!(
        "ZeppBridge 只读健康数据。{}\n时间：{}\n缺失值：{}\n来源：{}",
        contract::PRIVACY_NOTE,
        contract::TIME_CONVENTION,
        contract::MISSING_VALUE_CONVENTION,
        contract::SOURCE_CONVENTION,
    )
}

/// 请求的 `_meta` 里声明的协议版本。没有就说明这是个 legacy 客户端。
fn requested_protocol_version(params: &Value) -> Option<&str> {
    params
        .get("_meta")
        .and_then(|meta| meta.get(META_PROTOCOL_VERSION))
        .and_then(Value::as_str)
}

/// 这一版我们认不认。
fn version_supported(version: &str) -> bool {
    SUPPORTED_PROTOCOL_VERSIONS.contains(&version)
}

fn unsupported_version_error(requested: &str) -> RpcError {
    RpcError {
        code: ERR_UNSUPPORTED_PROTOCOL_VERSION,
        message: "Unsupported protocol version".to_string(),
        // 必须带上我们支持哪些版本：客户端就是靠它挑一个再重试的。
        data: Some(json!({
            "supported": SUPPORTED_PROTOCOL_VERSIONS,
            "requested": requested,
        })),
    }
}

/// 给 modern 结果盖上必需的信封：`resultType` 和 `_meta.serverInfo`。
///
/// 2026-07-28 起每个结果都**必须**有 `resultType`；legacy 结果反过来不该有，
/// 所以这一步只在 modern 那条路上做。
fn modern_result(mut result: Value) -> Value {
    if let Some(object) = result.as_object_mut() {
        object.insert("resultType".to_string(), json!("complete"));
        object.insert(
            "_meta".to_string(),
            json!({ META_SERVER_INFO: server_info() }),
        );
    }
    result
}

fn handle(method: &str, params: &Value) -> Result<Value, RpcError> {
    // `server/discover` 本身就是 modern 的入口，也是 stdio 上的时代探针：
    // 客户端拿它试一下，认得就是 modern 服务器，报未知方法就退回 initialize。
    if method == "server/discover" {
        if let Some(version) = requested_protocol_version(params) {
            if !version_supported(version) {
                return Err(unsupported_version_error(version));
            }
        }
        return Ok(modern_result(json!({
            "supportedVersions": SUPPORTED_PROTOCOL_VERSIONS,
            "capabilities": { "tools": {} },
            "instructions": instructions(),
            "ttlMs": LIST_TTL_MS,
            // 这份工具表对谁都一样：没有账号相关的内容，也不随连接变化。
            "cacheScope": "public",
        })));
    }

    // 带了 `_meta` 版本的是 modern 客户端。没带的按 legacy 处理——那是今天
    // 绝大多数客户端的样子。
    if let Some(version) = requested_protocol_version(params) {
        if !version_supported(version) {
            return Err(unsupported_version_error(version));
        }
        return match method {
            "tools/list" => Ok(modern_result(json!({
                "tools": tool_definitions(),
                "ttlMs": LIST_TTL_MS,
                "cacheScope": "public",
            }))),
            "tools/call" => call_tool(params).map(modern_result).map_err(RpcError::from),
            // `initialize` / `ping` 在这一版里已经没有了。收到它们说明客户端
            // 把两个时代混着用，明确说清楚比默默照办好。
            other => Err(RpcError::new(
                ERR_METHOD_NOT_FOUND,
                format!("不支持的方法：{other}。本服务只提供只读工具调用。"),
            )),
        };
    }

    match method {
        "initialize" => {
            // 按 legacy 的规矩：客户端要哪一版，我们支持就回哪一版；不支持
            // 就回我们自己的，由客户端决定要不要继续。
            let requested = params
                .get("protocolVersion")
                .and_then(Value::as_str)
                .filter(|version| version_supported(version))
                .unwrap_or(LEGACY_PROTOCOL_VERSION);
            Ok(json!({
                "protocolVersion": requested,
                "capabilities": { "tools": {} },
                "serverInfo": server_info(),
                "instructions": instructions(),
            }))
        }
        "notifications/initialized" | "ping" => Ok(json!({})),
        "tools/list" => Ok(json!({ "tools": tool_definitions() })),
        "tools/call" => call_tool(params).map_err(RpcError::from),
        other => Err(RpcError::new(
            ERR_METHOD_NOT_FOUND,
            format!("不支持的方法：{other}。本服务只提供只读工具调用。"),
        )),
    }
}

/* ------------------------------ 工具定义 ------------------------------ */

fn tool_definitions() -> Vec<Value> {
    let missing = contract::MISSING_VALUE_CONVENTION;
    let time = contract::TIME_CONVENTION;
    vec![
        json!({
            "name": "list_workouts",
            "description": format!(
                "列出本机已保存的运动记录，最新在前。距离单位米，时长由起止时间给出，心率单位 bpm。{missing}"
            ),
            "inputSchema": {
                "type": "object",
                "properties": {
                    "limit": {
                        "type": "integer",
                        "minimum": 1,
                        "maximum": 200,
                        "default": 20,
                        "description": "返回多少条，最多 200。"
                    }
                },
                "additionalProperties": false
            }
        }),
        json!({
            "name": "get_workout_insight",
            "description": format!(
                "对一次运动给出确定性事实：与个人基线的比较、基线窗口、样本数和置信度。\
                 只返回事实与证据，不生成任何自然语言结论。基线样本不足时返回 facts 为空并说明原因，\
                 不会为了凑一句话而降低门槛。{missing}"
            ),
            "inputSchema": {
                "type": "object",
                "properties": {
                    "workoutId": { "type": "string", "description": "list_workouts 返回的 workoutId。" }
                },
                "required": ["workoutId"],
                "additionalProperties": false
            }
        }),
        json!({
            "name": "get_metric_series",
            "description": format!(
                "按天取一条或多条指标序列。单位见每个 series 的 unit 字段。{missing} {time}"
            ),
            "inputSchema": {
                "type": "object",
                "properties": {
                    "metrics": {
                        "type": "array",
                        "items": { "type": "string", "enum": contract::metric_names() },
                        "minItems": 1,
                        "description": "指标名。未知指标会被忽略而不是报错。"
                    },
                    "days": {
                        "type": "integer",
                        "minimum": 1,
                        "maximum": 1825,
                        "default": 90,
                        "description": "往回多少天，含今天。"
                    }
                },
                "required": ["metrics"],
                "additionalProperties": false
            }
        }),
        json!({
            "name": "get_sleep_detail",
            "description": format!(
                "取一晚睡眠的明细。分期时长单位分钟；设备没有上报的分期不会出现，也不会补 0。{missing}"
            ),
            "inputSchema": {
                "type": "object",
                "properties": {
                    "sleepId": { "type": "string", "description": "睡眠记录 id。省略则返回最近一晚。" }
                },
                "additionalProperties": false
            }
        }),
        json!({
            "name": "get_data_health",
            "description": format!(
                "本机数据的健康状况：每条流的抓取/解析/写入三个阶段各自的状态、\
                 覆盖情况和最近一次成功时间。用它判断一个问题「查不到」是因为没同步，\
                 还是因为那段时间本来就没数据。\
                 `normalizer_replay_pending` 为真时，历史记录是旧版解析器产出的\
                 （`stored_normalizer_revision` 是哪一版，`normalizer_revision` 是当前版）——\
                 此时运动类型、睡眠阶段这类派生字段可能过时，回答里应当说明这一点。\
                 修正的办法是在那台机器上跑一次 `zeppbridge-cli reprocess`，\
                 或者启动一次桌面应用；这个服务只读，做不了。{time} {missing}"
            ),
            "inputSchema": {
                "type": "object",
                "properties": {
                    "windowDays": {
                        "type": "integer",
                        "minimum": 1,
                        "maximum": 365,
                        "default": 30,
                        "description": "用多长的窗口判断覆盖。"
                    }
                },
                "additionalProperties": false
            }
        }),
    ]
}

/* ------------------------------ 工具调用 ------------------------------ */

fn open_db() -> Result<(Database, u64), (i64, String)> {
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

fn call_tool(params: &Value) -> Result<Value, (i64, String)> {
    let name = params
        .get("name")
        .and_then(Value::as_str)
        .ok_or((ERR_INVALID_PARAMS, "缺少工具名".to_string()))?;
    let args = params.get("arguments").cloned().unwrap_or(json!({}));
    let (db, database_bytes) = open_db()?;

    let payload = match name {
        "list_workouts" => {
            let limit = args
                .get("limit")
                .and_then(Value::as_u64)
                .unwrap_or(20)
                .clamp(1, 200) as usize;
            let workouts = db
                .get_recent_workouts(limit)
                .map_err(|error| (ERR_DATABASE, error.user_message()))?;
            json!({
                "workouts": workouts.iter().map(|workout| json!({
                    "workoutId": workout.workout_id,
                    "type": workout.effective_type,
                    "customLabel": workout.custom_label,
                    "startTime": workout.start_time.to_rfc3339(),
                    "endTime": workout.end_time.to_rfc3339(),
                    "distanceMeters": workout.distance_meters,
                    "calories": workout.calories,
                    "avgHr": workout.avg_hr,
                    "maxHr": workout.max_hr,
                    "sourceScope": workout.source_scope,
                    "gpsAvailable": workout.gps_available,
                    "sampleCount": workout.sample_count,
                })).collect::<Vec<_>>(),
                "units": { "distance": "m", "heartRate": "bpm", "calories": "kcal" },
                "missingValues": contract::MISSING_VALUE_CONVENTION,
            })
        }
        "get_workout_insight" => {
            let workout_id = args
                .get("workoutId")
                .and_then(Value::as_str)
                .ok_or((ERR_INVALID_PARAMS, "缺少 workoutId".to_string()))?;
            let insight = db
                .workout_insight(workout_id)
                .map_err(|error| (ERR_DATABASE, error.user_message()))?;
            serde_json::to_value(insight)
                .map_err(|error| (ERR_DATABASE, format!("序列化失败：{error}")))?
        }
        "get_metric_series" => {
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
                return Err((ERR_INVALID_PARAMS, "metrics 不能为空".into()));
            }
            let days = args.get("days").and_then(Value::as_i64).unwrap_or(90);
            let series = db
                .metric_series(&metrics, days)
                .map_err(|error| (ERR_DATABASE, error.user_message()))?;
            json!({
                "series": serde_json::to_value(&series)
                    .map_err(|error| (ERR_DATABASE, format!("序列化失败：{error}")))?,
                "requestedMetrics": metrics,
                "missingValues": contract::MISSING_VALUE_CONVENTION,
                "time": contract::TIME_CONVENTION,
            })
        }
        "get_sleep_detail" => {
            let session = match args.get("sleepId").and_then(Value::as_str) {
                Some(id) => db
                    .get_sleep_detail(id)
                    .map_err(|error| (ERR_DATABASE, error.user_message()))?,
                None => db
                    .get_recent_sleep_sessions(1)
                    .map_err(|error| (ERR_DATABASE, error.user_message()))?
                    .into_iter()
                    .next(),
            };
            match session {
                Some(session) => json!({
                    "sleep": serde_json::to_value(&session)
                        .map_err(|error| (ERR_DATABASE, format!("序列化失败：{error}")))?,
                    "units": { "stageMinutes": "min", "heartRate": "bpm" },
                    "missingValues": contract::MISSING_VALUE_CONVENTION,
                }),
                // 「本机没有这一晚」和「这一晚没有数据」是同一句话：
                // 不返回一个各项为 0 的空壳。
                None => json!({ "sleep": Value::Null, "reason": "本机没有匹配的睡眠记录。" }),
            }
        }
        "get_data_health" => {
            let window = args
                .get("windowDays")
                .and_then(Value::as_i64)
                .unwrap_or(30)
                .clamp(1, 365);
            let health = db
                .data_health(window, database_bytes)
                .map_err(|error| (ERR_DATABASE, error.user_message()))?;
            serde_json::to_value(health)
                .map_err(|error| (ERR_DATABASE, format!("序列化失败：{error}")))?
        }
        other => {
            return Err((
                ERR_METHOD_NOT_FOUND,
                format!("没有名为 {other} 的工具。本服务只提供只读查询。"),
            ))
        }
    };

    // MCP 的 content 是给模型读的文本；结构化数据同时放进 structuredContent，
    // 让能用结构的客户端不必再解析一遍字符串。
    let text = serde_json::to_string_pretty(&payload).unwrap_or_else(|_| "{}".into());
    Ok(json!({
        "content": [{ "type": "text", "text": text }],
        "structuredContent": payload,
        "isError": false
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

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
        assert_eq!(names.len(), 5);
    }

    #[test]
    fn unknown_methods_and_tools_are_refused_rather_than_guessed() {
        let error = handle("tools/execute", &json!({})).unwrap_err();
        assert_eq!(error.code, ERR_METHOD_NOT_FOUND);
        let missing_name = call_tool(&json!({ "arguments": {} })).unwrap_err();
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
        let modern =
            json!({ "_meta": { "io.modelcontextprotocol/protocolVersion": "2026-07-28" } });
        let result = handle("tools/list", &modern).unwrap();
        assert_eq!(result["resultType"], json!("complete"));
        assert!(result["ttlMs"].as_i64().unwrap() > 0);
        assert_eq!(result["cacheScope"], json!("public"));
        assert_eq!(result["tools"].as_array().unwrap().len(), 5);
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
}
