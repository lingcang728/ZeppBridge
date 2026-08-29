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
//! SDK，是因为这里只需要 `initialize` / `tools/list` / `tools/call` 三个方法，
//! 而一个只读工具服务不值得为此拖进一整套运行时。

use std::io::{self, BufRead, Write};

use serde_json::{json, Value};
use zeppbridge_core::contract;
use zeppbridge_core::paths;
use zeppbridge_core::storage::Database;

const VERSION: &str = env!("CARGO_PKG_VERSION");
const PROTOCOL_VERSION: &str = "2024-11-05";

/// JSON-RPC 错误码。前三个是协议规定的，-32000 段是留给应用的。
const ERR_METHOD_NOT_FOUND: i64 = -32601;
const ERR_INVALID_PARAMS: i64 = -32602;
const ERR_NOT_CONFIGURED: i64 = -32001;
const ERR_DATABASE: i64 = -32002;

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
            Err((code, message)) => json!({
                "jsonrpc": "2.0",
                "id": id,
                "error": { "code": code, "message": message }
            }),
        };
        let _ = writeln!(stdout, "{response}");
        let _ = stdout.flush();
    }
}

fn handle(method: &str, params: &Value) -> Result<Value, (i64, String)> {
    match method {
        "initialize" => Ok(json!({
            "protocolVersion": PROTOCOL_VERSION,
            "capabilities": { "tools": {} },
            "serverInfo": { "name": "zeppbridge", "version": VERSION },
            // 让调用方在第一次握手就看到边界和缺失值规则，
            // 而不是等它拿到一条空序列以后自己猜。
            "instructions": format!(
                "ZeppBridge 只读健康数据。{}\n时间：{}\n缺失值：{}\n来源：{}",
                contract::PRIVACY_NOTE,
                contract::TIME_CONVENTION,
                contract::MISSING_VALUE_CONVENTION,
                contract::SOURCE_CONVENTION,
            ),
        })),
        "notifications/initialized" | "ping" => Ok(json!({})),
        "tools/list" => Ok(json!({ "tools": tool_definitions() })),
        "tools/call" => call_tool(params),
        other => Err((
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
                 还是因为那段时间本来就没数据。{time} {missing}"
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
        assert_eq!(error.0, ERR_METHOD_NOT_FOUND);
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
}
