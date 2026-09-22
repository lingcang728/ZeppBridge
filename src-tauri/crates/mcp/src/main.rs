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
//!
//! **访问范围（`--scope`）。** 进程级授权，只有两种：
//!
//! * `full-readonly`（缺省）：本机全部数据的只读视图，与旧版行为一致——
//!   不带 `--scope` 的老配置拿到的就是它。
//! * `task`：只看得到桌面端标为「开放给 MCP」的任务所授权的运动与日期
//!   窗口内的数据。每次工具调用都重读授权（连接本来就每请求重开），所以
//!   任务页里的开关对下一次请求立即生效。范围外的调用回 `isError` 加稳定
//!   码 `err.mcp.scope_denied` / `err.mcp.scope_no_grants`，拒绝里附带的
//!   `permittedRanges` 是实际授权的窗口。
//!
//! argv 是唯一的授权入口：不认识的参数和值都让进程直接退出——一个拼错的
//! `--scop` 绝不允许静默回退成全库读取。

use std::collections::{BTreeMap, BTreeSet};
use std::io::{self, BufRead, Write};

use chrono::{Duration, Local};
use serde_json::{json, Value};
use zeppbridge_core::access::{self, AccessCategory, AccessScope, DataRequest, Permit};
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

const MAX_REQUEST_BYTES: usize = 1024 * 1024;

enum RequestFrame {
    Message(Vec<u8>),
    TooLarge,
}

// Drain oversized lines without retaining them, then resume at the next message.
fn read_frame(reader: &mut impl BufRead) -> io::Result<Option<RequestFrame>> {
    let mut bytes = Vec::new();
    let mut oversized = false;
    loop {
        let chunk = reader.fill_buf()?;
        if chunk.is_empty() {
            return Ok(if oversized {
                Some(RequestFrame::TooLarge)
            } else if bytes.is_empty() {
                None
            } else {
                Some(RequestFrame::Message(bytes))
            });
        }
        let newline = chunk.iter().position(|byte| *byte == b'\n');
        let count = newline.unwrap_or(chunk.len());
        if !oversized {
            if count > MAX_REQUEST_BYTES - bytes.len() {
                oversized = true;
                bytes.clear();
            } else {
                bytes.extend_from_slice(&chunk[..count]);
            }
        }
        reader.consume(count + usize::from(newline.is_some()));
        if newline.is_some() {
            return Ok(Some(if oversized {
                RequestFrame::TooLarge
            } else {
                RequestFrame::Message(bytes)
            }));
        }
    }
}

fn main() {
    // argv 是这个进程唯一的授权入口。scope 定了，服务才开始读 stdin——
    // 解析失败不进入服务循环。
    let args: Vec<String> = std::env::args().skip(1).collect();
    let scope = match parse_scope_args(&args) {
        Ok(scope) => scope,
        Err(message) => {
            eprintln!("zeppbridge-mcp: {message}");
            std::process::exit(2);
        }
    };
    let stdin = io::stdin();
    let stdout = io::stdout();
    let _ = serve(&mut stdin.lock(), &mut stdout.lock(), &scope);
}

/// `--scope full-readonly|task`。缺省 `full-readonly`——没有 flag 的旧配置
/// 行为不变。任何不认识的参数、值或重复的 `--scope` 都 fail closed。
fn parse_scope_args(args: &[String]) -> Result<AccessScope, String> {
    const USAGE: &str = "用法：zeppbridge-mcp [--scope full-readonly|task]";
    let mut scope = AccessScope::FullReadOnly;
    let mut scope_seen = false;
    let mut index = 0;
    while index < args.len() {
        let value = if args[index] == "--scope" {
            index += 1;
            args.get(index)
                .map(String::as_str)
                .ok_or_else(|| format!("--scope 需要一个值（full-readonly 或 task）。{USAGE}"))?
        } else if let Some(value) = args[index].strip_prefix("--scope=") {
            value
        } else {
            return Err(format!("无法识别的参数 `{}`。{USAGE}", args[index]));
        };
        if scope_seen {
            return Err(format!("--scope 只能给一次。{USAGE}"));
        }
        scope_seen = true;
        scope = AccessScope::parse(value).ok_or_else(|| {
            format!("--scope 的值 `{value}` 无效，只能是 full-readonly 或 task。{USAGE}")
        })?;
        index += 1;
    }
    Ok(scope)
}

fn serve(
    reader: &mut impl BufRead,
    stdout: &mut impl Write,
    scope: &AccessScope,
) -> io::Result<()> {
    while let Some(frame) = read_frame(reader)? {
        let parsed: Result<Value, (i64, &str)> = match frame {
            RequestFrame::Message(bytes) => {
                if bytes.iter().all(u8::is_ascii_whitespace) {
                    continue;
                }
                serde_json::from_slice(&bytes)
                    .map_err(|_| (-32700, "Request is not valid JSON or UTF-8"))
            }
            RequestFrame::TooLarge => Err((-32600, "Request exceeds the 1 MiB limit")),
        };
        let request = match parsed {
            Ok(value) => value,
            Err((code, message)) => {
                writeln!(
                    stdout,
                    "{}",
                    json!({"jsonrpc":"2.0", "id":null, "error":{"code":code,"message":message}})
                )?;
                stdout.flush()?;
                continue;
            }
        };
        // Notifications have no response.
        let Some(id) = request.get("id").cloned() else {
            continue;
        };
        let method = request
            .get("method")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let params = request.get("params").cloned().unwrap_or(json!({}));
        let response = match handle_scoped(method, &params, scope) {
            Ok(result) => json!({ "jsonrpc": "2.0", "id": id, "result": result }),
            Err(error) => json!({ "jsonrpc": "2.0", "id": id, "error": error.to_json() }),
        };
        writeln!(stdout, "{response}")?;
        stdout.flush()?;
    }
    Ok(())
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
/// 时，最容易做的事就是当成 0。访问范围也在这里明说——模型应该知道自己是
/// 在看全库，还是只看得到任务授权的那一小块。
fn instructions(scope: &AccessScope) -> String {
    let scope_note = match scope {
        AccessScope::FullReadOnly => "full-readonly：本机全部健康数据的只读视图。",
        AccessScope::TaskScoped => {
            "task：只看得到桌面端标为「开放给 MCP」的任务所授权的运动与日期窗口内的数据；\
             范围外的调用会以 err.mcp.scope_denied / err.mcp.scope_no_grants 拒绝，\
             拒绝里附带的 permittedRanges 是实际授权的窗口。"
        }
    };
    format!(
        "ZeppBridge 只读健康数据。{}\n时间：{}\n缺失值：{}\n来源：{}\n范围：{scope_note}",
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

/// `handle` 的 full-readonly 快捷入口，给不关心范围的调用方（测试）用。
/// 生产路径只有 `serve` → `handle_scoped` 一条，两条时代线在 `call_tool`
/// 里合流（R9）。
#[cfg(test)]
fn handle(method: &str, params: &Value) -> Result<Value, RpcError> {
    handle_scoped(method, params, &AccessScope::FullReadOnly)
}

fn handle_scoped(method: &str, params: &Value, scope: &AccessScope) -> Result<Value, RpcError> {
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
            "instructions": instructions(scope),
            // 握手阶段不打开数据库，所以这里只报模式不报授权数；
            // 每个 tools/call 结果里的 scope.grants 才是实时值。
            "scope": { "mode": scope.as_str() },
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
            "tools/call" => call_tool(params, scope)
                .map(modern_result)
                .map_err(RpcError::from),
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
                "instructions": instructions(scope),
                // 握手只报模式：授权数按调用时实况在每个 tools/call 里给。
                "scope": { "mode": scope.as_str() },
            }))
        }
        "notifications/initialized" | "ping" => Ok(json!({})),
        "tools/list" => Ok(json!({ "tools": tool_definitions() })),
        "tools/call" => call_tool(params, scope).map_err(RpcError::from),
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
                 `pending_normalization` 只统计当前解析器尚未处理的报文。\
                 `normalization_by_stream` 按流统计 pending、normalized、\
                 processed_without_output（解析完成但无输出，不保证已识别）和 quarantined（解析失败已隔离）；\
                 后两者不应被当作反复重放就能消除的积压。\
                 `normalizer_replay_pending` 为真时，历史记录需要重放\
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

fn call_tool(params: &Value, scope: &AccessScope) -> Result<Value, (i64, String)> {
    call_tool_with_db(params, scope, open_db)
}

fn call_tool_with_db(
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
fn scope_json(scope: &AccessScope, grants: usize) -> Value {
    json!({ "mode": scope.as_str(), "grants": grants })
}

/// 授权窗口序列化成 `{category,start,end}`——拒绝载荷里的 `permittedRanges`
/// 就靠它告诉调用方「实际允许什么」，好据此重试（R3）。
fn windows_json(windows: &[access::GrantWindow]) -> Value {
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
fn tool_error(scope: &AccessScope, grants: usize, message: String) -> Value {
    json!({
        "content": [{"type":"text", "text": message}],
        "isError": true,
        "scope": scope_json(scope, grants),
    })
}

/// 范围拒绝：稳定码 + 实际授权窗口，进 `structuredContent.error` 让客户端
/// 不用解析中文原文就能分支；text 里同时带上码，只读文本的客户端也看得见。
fn scope_denial(
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

/// 工具执行期的失败出口。`denial` 非空表示范围拒绝（稳定码 + 授权窗口）。
struct CallFailure {
    message: String,
    denial: Option<(&'static str, Value)>,
}

impl CallFailure {
    fn plain(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
            denial: None,
        }
    }

    fn denied(message: impl Into<String>, permitted_ranges: Value) -> Self {
        Self {
            message: message.into(),
            denial: Some((access::SCOPE_DENIED, permitted_ranges)),
        }
    }
}

/// 工具调用 → 授权请求。每个注册工具都必须在这里有一行映射；
/// `every_registered_tool_builds_a_data_request` 守住这条不变式（R10）。
fn build_request(name: &str, args: &Value) -> Result<DataRequest, String> {
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
            // 与 storage::metric_series 同一个窗口算法：含今天的本地日范围。
            let days = args
                .get("days")
                .and_then(Value::as_i64)
                .unwrap_or(90)
                .clamp(1, 1825);
            let end = Local::now().date_naive();
            let start = end - Duration::days(days - 1);
            request.date_range = Some((start, end));
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
        other => {
            return Err(format!("没有名为 {other} 的工具。本服务只提供只读查询。"));
        }
    }
    Ok(request)
}

fn metric_args(args: &Value) -> Result<Vec<String>, String> {
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

fn execute_tool_with_db(
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

    // 授权每次调用都重读：连接本来就每请求重开，所以任务页里翻转
    // 「开放给 MCP」对下一次请求立即生效。task 模式下读不出授权等于
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
        Err(failure) => match failure.denial {
            Some((code, ranges)) => {
                return scope_denial(scope, grants.len(), code, failure.message, ranges);
            }
            None => return tool_error(scope, grants.len(), failure.message),
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
    // 让能用结构的客户端不必再解析一遍字符串。
    let text = serde_json::to_string_pretty(&payload).unwrap_or_else(|_| "{}".into());
    json!({
        "content": [{ "type": "text", "text": text }],
        "structuredContent": payload,
        "isError": false,
        "scope": scope_json(scope, grants.len()),
    })
}

fn run_tool(
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
        other => Err(CallFailure::plain(format!(
            "没有名为 {other} 的工具。本服务只提供只读查询。"
        ))),
    }
}

fn run_list_workouts(
    db: &Database,
    args: &Value,
    scope: &AccessScope,
    permit: &Permit,
) -> Result<Value, CallFailure> {
    let limit = args
        .get("limit")
        .and_then(Value::as_u64)
        .unwrap_or(20)
        .clamp(1, 200) as usize;
    let workouts = if scope.is_task_scoped() {
        // 授权按 id，不按「全库最近 N 条」：一条授权运动再老也得能出来（R4）。
        // 授权了但记录已删/未同步的 id 查不到明细，如实跳过。
        let mut granted = Vec::new();
        for workout_id in &permit.workout_ids {
            if let Some(workout) = db
                .get_workout_detail(workout_id)
                .map_err(|error| CallFailure::plain(error.user_message()))?
            {
                granted.push(workout);
            }
        }
        granted.sort_by_key(|workout| std::cmp::Reverse(workout.start_time));
        granted.truncate(limit);
        granted
    } else {
        db.get_recent_workouts(limit)
            .map_err(|error| CallFailure::plain(error.user_message()))?
    };
    Ok(json!({
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
    }))
}

fn run_workout_insight(
    db: &Database,
    args: &Value,
    scope: &AccessScope,
    permit: &Permit,
) -> Result<Value, CallFailure> {
    let workout_id = args
        .get("workoutId")
        .and_then(Value::as_str)
        .ok_or_else(|| CallFailure::plain("缺少 workoutId"))?;
    let mut insight = db
        .workout_insight(workout_id)
        .map_err(|error| CallFailure::plain(error.user_message()))?;
    if scope.is_task_scoped() {
        // R1：原洞察的基线是在全库上算的——included/excluded 会带出未授权
        // 运动的 id、日期、距离，facts 的聚合值也是未授权样本的平均。把
        // 基线里仍属授权集的行取回来，按授权集重算。
        let candidate_ids: BTreeSet<String> = insight
            .baseline_included
            .iter()
            .map(|entry| entry.workout_id.clone())
            .chain(
                insight
                    .baseline_excluded
                    .iter()
                    .map(|entry| entry.workout_id.clone()),
            )
            .filter(|id| permit.workout_ids.contains(id))
            .collect();
        let mut rows = BTreeMap::new();
        for workout_id in candidate_ids {
            if let Some(workout) = db
                .get_workout_detail(&workout_id)
                .map_err(|error| CallFailure::plain(error.user_message()))?
            {
                rows.insert(workout_id, access::GrantedRun::from_workout(&workout));
            }
        }
        access::rescore_insight(&mut insight, &permit.workout_ids, &rows);
    }
    serde_json::to_value(&insight)
        .map_err(|error| CallFailure::plain(format!("序列化失败：{error}")))
}

fn run_metric_series(
    db: &Database,
    args: &Value,
    scope: &AccessScope,
    permit: &Permit,
) -> Result<Value, CallFailure> {
    let metrics = metric_args(args).map_err(CallFailure::plain)?;
    let days = args.get("days").and_then(Value::as_i64).unwrap_or(90);
    let mut series = db
        .metric_series(&metrics, days)
        .map_err(|error| CallFailure::plain(error.user_message()))?;
    if scope.is_task_scoped() {
        // authorize 已保证请求的每个类别都与授权窗有交集；这里把点裁到
        // 授权日内并重算 latest/average/days_with_data/window_days，让序列
        // 自述的就是它实际覆盖的授权范围（R3）。
        series = access::clip_metric_series(series, permit);
    }
    Ok(json!({
        "series": serde_json::to_value(&series)
            .map_err(|error| CallFailure::plain(format!("序列化失败：{error}")))?,
        "requestedMetrics": metrics,
        "missingValues": contract::MISSING_VALUE_CONVENTION,
        "time": contract::TIME_CONVENTION,
    }))
}

fn run_sleep_detail(
    db: &Database,
    args: &Value,
    scope: &AccessScope,
    permit: &Permit,
) -> Result<Value, CallFailure> {
    let session = match args.get("sleepId").and_then(Value::as_str) {
        Some(id) => {
            let detail = db
                .get_sleep_detail(id)
                .map_err(|error| CallFailure::plain(error.user_message()))?;
            match detail {
                // 睡眠按醒来本地日归属（与 sleep 列表/insight 同口径），
                // 落在窗外就拒（R2）。
                Some(session) if scope.is_task_scoped() => {
                    let day = session.end_time.with_timezone(&Local).date_naive();
                    if !permit.day_permitted(AccessCategory::Sleep, day) {
                        return Err(CallFailure::denied(
                            "这晚睡眠不在任何开放任务的授权窗口内。",
                            windows_json(&permit.windows),
                        ));
                    }
                    Some(session)
                }
                other => other,
            }
        }
        None => {
            if scope.is_task_scoped() {
                // 「最近一晚」在任务范围里 = 授权窗内最近一晚，不是全库最新
                // （R2）。窗口外有更新的记录也不该被看见；窗内没有就如实拒绝，
                // 而不是退回全库最新。
                let sleep_id = access::latest_sleep_in_windows(db, permit)
                    .map_err(|error| CallFailure::plain(error.user_message()))?;
                match sleep_id {
                    Some(sleep_id) => db
                        .get_sleep_detail(&sleep_id)
                        .map_err(|error| CallFailure::plain(error.user_message()))?,
                    None => {
                        return Err(CallFailure::denied(
                            "授权窗口内还没有睡眠记录。",
                            windows_json(&permit.windows),
                        ));
                    }
                }
            } else {
                let latest = db
                    .get_recent_sleep_sessions(1)
                    .map_err(|error| CallFailure::plain(error.user_message()))?
                    .into_iter()
                    .next();
                // The list deliberately omits stages; load the same detail
                // as an explicit sleepId instead of returning that summary.
                match latest {
                    Some(session) => db
                        .get_sleep_detail(&session.sleep_id)
                        .map_err(|error| CallFailure::plain(error.user_message()))?,
                    None => None,
                }
            }
        }
    };
    Ok(match session {
        Some(session) => json!({
            "sleep": serde_json::to_value(&session)
                .map_err(|error| CallFailure::plain(format!("序列化失败：{error}")))?,
            "units": { "stageMinutes": "min", "heartRate": "bpm" },
            "missingValues": contract::MISSING_VALUE_CONVENTION,
        }),
        // 「本机没有这一晚」和「这一晚没有数据」是同一句话：
        // 不返回一个各项为 0 的空壳。
        None => json!({ "sleep": Value::Null, "reason": "本机没有匹配的睡眠记录。" }),
    })
}

fn run_data_health(db: &Database, args: &Value, database_bytes: u64) -> Result<Value, CallFailure> {
    let window = args
        .get("windowDays")
        .and_then(Value::as_i64)
        .unwrap_or(30)
        .clamp(1, 365);
    let health = db
        .data_health(window, database_bytes)
        .map_err(|error| CallFailure::plain(error.user_message()))?;
    serde_json::to_value(health).map_err(|error| CallFailure::plain(format!("序列化失败：{error}")))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tool_failures_are_results_but_bad_envelopes_remain_rpc_errors() {
        for code in [ERR_DATABASE, ERR_NOT_CONFIGURED] {
            let result = call_tool_with_db(
                &json!({"name":"list_workouts"}),
                &AccessScope::FullReadOnly,
                || Err((code, "Local data is unavailable".into())),
            )
            .unwrap();
            assert_eq!(result["isError"], true);
            assert_eq!(result["content"][0]["text"], "Local data is unavailable");
            // 连库都打不开时 scope 仍然如实上报（grants 还没读到，记 0）。
            assert_eq!(
                result["scope"],
                json!({"mode": "full-readonly", "grants": 0})
            );
        }
        let library = TestLibrary::empty();
        let invalid = call_tool_with_db(
            &json!({"name":"get_metric_series","arguments":{"metrics":[]}}),
            &AccessScope::FullReadOnly,
            || {
                Ok((
                    Database::open_read_only(library.0.join("zepp.db")).unwrap(),
                    0,
                ))
            },
        )
        .unwrap();
        assert_eq!(invalid["isError"], true);
        for params in [
            json!({}),
            json!({"name":"unknown"}),
            json!({"name":"list_workouts","arguments":[]}),
        ] {
            assert!(call_tool_with_db(&params, &AccessScope::FullReadOnly, || {
                panic!("invalid request must not open the database")
            })
            .is_err());
        }
    }

    #[test]
    fn request_reader_enforces_limit_and_resumes_after_bad_lines() {
        let mut input = vec![b'x'; MAX_REQUEST_BYTES + 10];
        input.extend_from_slice(b"\n\xff\n{\"jsonrpc\":\"2.0\",\"id\":9,\"method\":\"ping\"}\n");
        let mut reader = io::BufReader::with_capacity(13, input.as_slice());
        let mut output = Vec::new();
        serve(&mut reader, &mut output, &AccessScope::FullReadOnly).unwrap();
        let responses: Vec<Value> = output
            .split(|byte| *byte == b'\n')
            .filter(|line| !line.is_empty())
            .map(|line| serde_json::from_slice(line).unwrap())
            .collect();
        assert_eq!(responses.len(), 3);
        assert_eq!(responses[0]["error"]["code"], -32600);
        assert_eq!(responses[1]["error"]["code"], -32700);
        assert_eq!(responses[2]["id"], 9);
        assert_eq!(responses[2]["result"], json!({}));
        let at_limit = vec![b' '; MAX_REQUEST_BYTES];
        let mut reader = io::Cursor::new(at_limit);
        assert!(
            matches!(read_frame(&mut reader).unwrap(), Some(RequestFrame::Message(bytes)) if bytes.len()==MAX_REQUEST_BYTES)
        );
    }
    use chrono::{TimeZone, Utc};
    use std::path::PathBuf;
    use zeppbridge_core::models::{
        DailyMetric, SleepSession, SleepStageSlice, SourceScope, Workout,
    };

    struct TestLibrary(PathBuf);

    impl TestLibrary {
        fn empty() -> Self {
            let nonce = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let dir = std::env::temp_dir().join(format!(
                "zeppbridge-mcp-test-{}-{nonce}",
                std::process::id()
            ));
            std::fs::create_dir_all(&dir).unwrap();
            let library = Self(dir);
            Database::open_migrated(&library.0.join("zepp.db")).unwrap();
            library
        }

        fn new(sessions: &[SleepSession]) -> Self {
            let library = Self::empty();
            let db = Database::open_migrated(&library.0.join("zepp.db")).unwrap();
            for session in sessions {
                db.insert_sleep_session(session).unwrap();
            }
            library
        }

        /// 往库里写一条 `ai_tasks` 行。基线 schema 还没有这张表，这里建的
        /// 是 S1 v32 的最小形态：id + JSON payload + mcp_shared 开关列。
        fn share_task(&self, task_id: &str, payload: &str, shared: bool) {
            let conn = rusqlite::Connection::open(self.0.join("zepp.db")).unwrap();
            conn.execute_batch(
                "CREATE TABLE IF NOT EXISTS ai_tasks (
                    id TEXT PRIMARY KEY,
                    payload TEXT NOT NULL,
                    mcp_shared INTEGER NOT NULL DEFAULT 0
                 )",
            )
            .unwrap();
            conn.execute(
                "INSERT OR REPLACE INTO ai_tasks (id, payload, mcp_shared) VALUES (?1, ?2, ?3)",
                rusqlite::params![task_id, payload, i64::from(shared)],
            )
            .unwrap();
        }

        fn call(&self, scope: &AccessScope, name: &str, arguments: Value) -> Value {
            call_tool_with_db(
                &json!({ "name": name, "arguments": arguments }),
                scope,
                || {
                    let db = Database::open_read_only(self.0.join("zepp.db"))
                        .map_err(|error| (ERR_DATABASE, error.user_message()))?;
                    Ok((db, 0))
                },
            )
            .unwrap()
        }

        fn call_sleep(&self, arguments: Value) -> Value {
            self.call(&AccessScope::FullReadOnly, "get_sleep_detail", arguments)
        }
    }

    impl Drop for TestLibrary {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    /// 一次跑步。`effective_type = run` 让 workout_insight 走跑步分支。
    fn run_workout(id: &str, start: chrono::DateTime<Utc>, avg_hr: i32) -> Workout {
        Workout {
            workout_id: id.into(),
            workout_type: "run".into(),
            normalized_type: "run".into(),
            type_source: "numeric_mapped".into(),
            user_override: None,
            effective_type: "run".into(),
            custom_label: None,
            start_time: start,
            end_time: start + Duration::minutes(50),
            distance_meters: Some(10_000.0),
            calories: Some(500),
            avg_hr: Some(avg_hr),
            max_hr: Some(170),
            training_load: Some(60.0),
            vo2max: None,
            min_hr: None,
            total_steps: None,
            moving_seconds: None,
            elevation_gain_m: None,
            elevation_loss_m: None,
            max_altitude_m: None,
            min_altitude_m: None,
            training_effect: None,
            anaerobic_training_effect: None,
            rpe: None,
            avg_cadence_spm: None,
            max_cadence_spm: None,
            avg_stride_cm: None,
            hr_zones: Vec::new(),
            source_scope: SourceScope::Device,
            device_id: Some("watch-serial-001".into()),
            synced_at: Some(start + Duration::hours(2)),
            gps_available: true,
            sample_count: 0,
            zepp_source: None,
            zepp_type: Some(1),
        }
    }

    /// 一份任务授权载荷（ai_tasks.payload 的最小形态）。
    fn task_payload(task_id: &str, workout_ids: &[&str], categories: &[&str]) -> String {
        json!({
            "id": task_id,
            "workout_ids": workout_ids,
            "categories": categories
                .iter()
                .map(|category| json!({
                    "category": category,
                    "enabled": true,
                    "days_before": 14,
                    "include_workout_day": true,
                }))
                .collect::<Vec<_>>(),
        })
        .to_string()
    }

    /// 递归断言：整份输出里没有任何 `path`/`absolute*`/文件正文字段（R11）。
    fn assert_no_pathish_keys(value: &Value, where_at: &str) {
        match value {
            Value::Object(map) => {
                for (key, child) in map {
                    let lower = key.to_ascii_lowercase();
                    assert!(
                        !(lower.contains("path") || lower.contains("file") || lower == "body"),
                        "{where_at}: 输出里不该出现 `{key}`"
                    );
                    assert_no_pathish_keys(child, where_at);
                }
            }
            Value::Array(items) => {
                for item in items {
                    assert_no_pathish_keys(item, where_at);
                }
            }
            _ => {}
        }
    }

    /// 递归收集输出里出现过的所有运动/睡眠 id 形字符串值，用来断言
    /// 「没有任何未授权 id 出现在响应里」。
    fn collect_ids(value: &Value, out: &mut BTreeSet<String>) {
        match value {
            Value::Object(map) => {
                for (key, child) in map {
                    if matches!(
                        key.as_str(),
                        "workout_id" | "workoutId" | "sleep_id" | "sleepId"
                    ) || key == "evidence_refs"
                    {
                        if let Some(id) = child.as_str() {
                            out.insert(id.to_string());
                        }
                    }
                    collect_ids(child, out);
                }
            }
            Value::Array(items) => {
                for item in items {
                    collect_ids(item, out);
                }
            }
            _ => {}
        }
    }

    fn sleep_session(id: &str, day: u32, stage: Option<&str>) -> SleepSession {
        let start = Utc.with_ymd_and_hms(2026, 1, day, 20, 0, 0).unwrap();
        let end = start + chrono::Duration::minutes(60);
        SleepSession {
            sleep_id: id.into(),
            start_time: start,
            end_time: end,
            score: Some(80),
            duration_minutes: 60,
            deep_minutes: Some(30),
            light_minutes: Some(30),
            rem_minutes: None,
            awake_minutes: Some(0),
            source_scope: SourceScope::Device,
            device_id: None,
            synced_at: Some(end + chrono::Duration::hours(1)),
            time_in_bed_minutes: None,
            stages: stage
                .map(|stage| SleepStageSlice {
                    stage: stage.into(),
                    start_time: start,
                    end_time: start + chrono::Duration::minutes(30),
                    raw_mode: Some(5),
                })
                .into_iter()
                .collect(),
            wake_count: Some(1),
        }
    }

    #[test]
    fn latest_sleep_returns_the_same_full_detail_as_an_explicit_id() {
        let older = sleep_session("older", 1, Some("light"));
        let latest = sleep_session("latest", 2, Some("deep"));
        let library = TestLibrary::new(&[older, latest.clone()]);

        let implicit = library.call_sleep(json!({}));
        let explicit = library.call_sleep(json!({ "sleepId": "latest" }));
        assert_eq!(implicit, explicit);
        assert_eq!(implicit["isError"], json!(false));
        assert_eq!(
            implicit["structuredContent"]["sleep"],
            serde_json::to_value(latest).unwrap()
        );
        let text: Value =
            serde_json::from_str(implicit["content"][0]["text"].as_str().unwrap()).unwrap();
        assert_eq!(text, implicit["structuredContent"]);

        let previous = library.call_sleep(json!({ "sleepId": "older" }));
        assert_eq!(previous["structuredContent"]["sleep"]["sleep_id"], "older");
        assert_eq!(
            previous["structuredContent"]["sleep"]["stages"][0]["stage"],
            "light"
        );
    }

    #[test]
    fn sleep_queries_preserve_missing_sessions_and_missing_stages() {
        let empty = TestLibrary::new(&[]);
        let recent = empty.call_sleep(json!({}));
        assert_eq!(recent["isError"], json!(false));
        assert_eq!(recent["structuredContent"]["sleep"], Value::Null);

        let library = TestLibrary::new(&[sleep_session("no-stages", 1, None)]);
        let recent = library.call_sleep(json!({}));
        assert_eq!(
            recent["structuredContent"]["sleep"]["sleep_id"],
            "no-stages"
        );
        assert_eq!(recent["structuredContent"]["sleep"]["stages"], json!([]));
        let missing = library.call_sleep(json!({ "sleepId": "unknown" }));
        assert_eq!(missing["structuredContent"]["sleep"], Value::Null);
    }

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
        let missing_name =
            call_tool(&json!({ "arguments": {} }), &AccessScope::FullReadOnly).unwrap_err();
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

    /* ---------- 访问范围（--scope） ---------- */

    /// UTC 中午的时间点：本地日在 ±14h 时区内都不会被推偏，fixture 不用
    /// 关心宿主机的时区。
    fn utc_noon(days_ago: i64) -> chrono::DateTime<Utc> {
        let day = Local::now().date_naive() - Duration::days(days_ago);
        Utc.from_utc_datetime(&day.and_hms_opt(12, 0, 0).unwrap())
    }

    fn sleep_session_days_ago(id: &str, end_days_ago: i64) -> SleepSession {
        let end = Utc::now() - Duration::days(end_days_ago);
        let start = end - Duration::hours(8);
        SleepSession {
            sleep_id: id.into(),
            start_time: start,
            end_time: end,
            score: Some(80),
            duration_minutes: 480,
            deep_minutes: Some(100),
            light_minutes: Some(300),
            rem_minutes: Some(80),
            awake_minutes: Some(0),
            source_scope: SourceScope::Device,
            device_id: Some("watch-serial-zzz".into()),
            synced_at: Some(end + Duration::hours(1)),
            time_in_bed_minutes: None,
            stages: vec![SleepStageSlice {
                stage: "deep".into(),
                start_time: start,
                end_time: start + Duration::minutes(30),
                raw_mode: Some(5),
            }],
            wake_count: Some(1),
        }
    }

    #[test]
    fn argv_parsing_is_fail_closed() {
        // 旧配置：零参数 → full-readonly。
        assert_eq!(parse_scope_args(&[]).unwrap(), AccessScope::FullReadOnly);
        for args in [
            vec!["--scope".to_string(), "task".to_string()],
            vec!["--scope=task".to_string()],
        ] {
            assert!(parse_scope_args(&args).unwrap().is_task_scoped());
        }
        assert_eq!(
            parse_scope_args(&["--scope".to_string(), "full-readonly".to_string()]).unwrap(),
            AccessScope::FullReadOnly
        );
        // 坏值、未知参数、缺值、重复给、位置参数——一律拒绝。
        for args in [
            vec!["--scope".to_string(), "bogus".to_string()],
            vec!["--scope=bogus".to_string()],
            vec!["--bogus".to_string()],
            vec!["--scope".to_string()],
            vec![
                "--scope".to_string(),
                "task".to_string(),
                "--scope".to_string(),
                "task".to_string(),
            ],
            vec!["anything".to_string()],
        ] {
            assert!(parse_scope_args(&args).is_err(), "{args:?} 必须被拒绝");
        }
    }

    /// task 范围 + 零授权：每个数据工具都要 `scope_no_grants`，不能崩、
    /// 也不能拿一份空成功结果冒充。
    #[test]
    fn task_scope_with_zero_grants_denies_every_data_call() {
        let library = TestLibrary::empty(); // 基线 schema 没有 ai_tasks → 零授权
        for (name, args) in [
            ("list_workouts", json!({})),
            ("get_workout_insight", json!({"workoutId": "w1"})),
            ("get_metric_series", json!({"metrics": ["spo2_odi"]})),
            ("get_sleep_detail", json!({})),
            ("get_data_health", json!({})),
        ] {
            let result = library.call(&AccessScope::TaskScoped, name, args);
            assert_eq!(result["isError"], true, "{name}");
            assert_eq!(
                result["structuredContent"]["error"]["code"],
                json!(access::SCOPE_NO_GRANTS),
                "{name}"
            );
            assert_eq!(result["scope"], json!({"mode": "task", "grants": 0}));
            assert!(result["content"][0]["text"]
                .as_str()
                .unwrap()
                .contains(access::SCOPE_NO_GRANTS));
        }
        // 进程没崩，协议面照常。
        assert_eq!(handle("ping", &json!({})).unwrap(), json!({}));
    }

    /// full-readonly 忽略授权：数据面与旧行为一致（范围块是新增的自述）。
    #[test]
    fn full_readonly_ignores_grants_and_keeps_the_old_shape() {
        let library = TestLibrary::empty();
        {
            let db = Database::open_migrated(&library.0.join("zepp.db")).unwrap();
            db.insert_workout(&run_workout("granted", utc_noon(3), 140))
                .unwrap();
            db.insert_workout(&run_workout("private", utc_noon(2), 150))
                .unwrap();
        }
        library.share_task("t1", &task_payload("t1", &["granted"], &["sleep"]), true);

        let result = library.call(&AccessScope::FullReadOnly, "list_workouts", json!({}));
        assert_eq!(result["isError"], false);
        let ids: Vec<&str> = result["structuredContent"]["workouts"]
            .as_array()
            .unwrap()
            .iter()
            .filter_map(|workout| workout["workoutId"].as_str())
            .collect();
        // 授权被忽略：未授权记录照常可见，顺序仍是新→旧。
        assert_eq!(ids, ["private", "granted"]);
        assert_eq!(
            result["scope"],
            json!({"mode": "full-readonly", "grants": 1})
        );
    }

    /// R3：请求范围与授权窗相交 → 裁到授权日；不相交 → 整体拒绝并附
    /// permittedRanges，绝不回一份被悄悄截断的半空序列。
    #[test]
    fn metric_series_is_clipped_to_granted_windows_and_denied_outside() {
        let library = TestLibrary::empty();
        let inside_day = (Local::now().date_naive() - Duration::days(12))
            .format("%Y-%m-%d")
            .to_string();
        {
            let db = Database::open_migrated(&library.0.join("zepp.db")).unwrap();
            // 授权锚点：10 天前的一次跑步；sleep 窗口 = [锚点-14d, 锚点]。
            db.insert_workout(&run_workout("anchor", utc_noon(10), 140))
                .unwrap();
            let metric = |days_ago: i64, value: f64| DailyMetric {
                date: (Local::now().date_naive() - Duration::days(days_ago))
                    .format("%Y-%m-%d")
                    .to_string(),
                metric: "spo2_odi".into(),
                value,
                unit: "events/h".into(),
                source_scope: SourceScope::Device,
                device_id: Some("ring-9".into()),
            };
            db.insert_daily_metric(&metric(12, 1.5)).unwrap(); // 窗内
            db.insert_daily_metric(&metric(2, 9.9)).unwrap(); // 窗外
        }
        library.share_task("t1", &task_payload("t1", &["anchor"], &["sleep"]), true);

        // 30 天请求窗与授权窗 [today-24, today-10] 相交 → 放行，但只出窗内的点。
        let result = library.call(
            &AccessScope::TaskScoped,
            "get_metric_series",
            json!({"metrics": ["spo2_odi"], "days": 30}),
        );
        assert_eq!(result["isError"], false, "{}", result["content"][0]["text"]);
        let series = &result["structuredContent"]["series"][0];
        let days: Vec<String> = series["points"]
            .as_array()
            .unwrap()
            .iter()
            .filter_map(|point| point["date"].as_str().map(str::to_string))
            .collect();
        assert_eq!(days, vec![inside_day], "窗外的点绝不能出现在序列里");
        // window_days 自述的是授权窗（15 天），不是请求的 30 天。
        assert_eq!(series["window_days"], 15);
        assert_eq!(result["scope"], json!({"mode": "task", "grants": 1}));
        assert_no_pathish_keys(&result, "metric_series");

        // 3 天请求窗完全在授权窗之外 → 拒绝 + permittedRanges。
        let denied = library.call(
            &AccessScope::TaskScoped,
            "get_metric_series",
            json!({"metrics": ["spo2_odi"], "days": 3}),
        );
        assert_eq!(denied["isError"], true);
        assert_eq!(
            denied["structuredContent"]["error"]["code"],
            json!(access::SCOPE_DENIED)
        );
        let ranges = denied["structuredContent"]["error"]["permittedRanges"]
            .as_array()
            .unwrap();
        assert_eq!(ranges[0]["category"], json!("sleep"));

        // 未授权类别（weight → body）同样整体拒绝，而不是回一条空序列。
        let other = library.call(
            &AccessScope::TaskScoped,
            "get_metric_series",
            json!({"metrics": ["weight"], "days": 30}),
        );
        assert_eq!(
            other["structuredContent"]["error"]["code"],
            json!(access::SCOPE_DENIED)
        );
    }

    /// R1：task 范围的洞察把基线重算到只剩授权集——未授权运动的 id、
    /// 日期、距离和它们贡献的聚合值一个都不许留。
    #[test]
    fn task_insight_rescores_baseline_over_granted_ids_only() {
        let library = TestLibrary::empty();
        {
            let db = Database::open_migrated(&library.0.join("zepp.db")).unwrap();
            db.insert_workout(&run_workout("target", utc_noon(1), 150))
                .unwrap();
            for (index, id) in ["g1", "g2", "g3"].iter().enumerate() {
                db.insert_workout(&run_workout(id, utc_noon(3 + index as i64), 100))
                    .unwrap();
            }
            for (index, id) in ["x1", "x2"].iter().enumerate() {
                db.insert_workout(&run_workout(id, utc_noon(7 + index as i64), 200))
                    .unwrap();
            }
        }
        library.share_task(
            "t1",
            &task_payload("t1", &["target", "g1", "g2", "g3"], &["workout"]),
            true,
        );

        // 指名未授权 id → 拒绝，不确认它存在与否之外的任何事。
        let denied = library.call(
            &AccessScope::TaskScoped,
            "get_workout_insight",
            json!({"workoutId": "x1"}),
        );
        assert_eq!(denied["isError"], true);
        assert_eq!(
            denied["structuredContent"]["error"]["code"],
            json!(access::SCOPE_DENIED)
        );

        let result = library.call(
            &AccessScope::TaskScoped,
            "get_workout_insight",
            json!({"workoutId": "target"}),
        );
        assert_eq!(result["isError"], false, "{}", result["content"][0]["text"]);
        let insight = &result["structuredContent"];
        let mut ids = BTreeSet::new();
        collect_ids(insight, &mut ids);
        assert!(
            !ids.contains("x1") && !ids.contains("x2"),
            "未授权 id 不得出现在响应里：{ids:?}"
        );
        let included: Vec<&str> = insight["baseline_included"]
            .as_array()
            .unwrap()
            .iter()
            .filter_map(|entry| entry["workout_id"].as_str())
            .collect();
        assert_eq!(included, ["g1", "g2", "g3"]);
        // 基线均值只含授权样本（100）；全库平均（140）不能漏出来。
        let avg_hr = insight["facts"]
            .as_array()
            .unwrap()
            .iter()
            .find(|fact| fact["metric"] == json!("avg_hr"))
            .unwrap();
        assert_eq!(avg_hr["comparison"]["baseline_value"], json!(100.0));
        assert_eq!(avg_hr["evidence_count"], json!(3));
        assert_no_pathish_keys(&result, "insight");

        // 对照：full-readonly 的同一洞察包含全部 5 个样本。
        let full = library.call(
            &AccessScope::FullReadOnly,
            "get_workout_insight",
            json!({"workoutId": "target"}),
        );
        let full_hr = full["structuredContent"]["facts"]
            .as_array()
            .unwrap()
            .iter()
            .find(|fact| fact["metric"] == json!("avg_hr"))
            .unwrap();
        assert_eq!(full_hr["comparison"]["baseline_value"], json!(140.0));
    }

    /// R2/R6：显式 id 落在窗外 → 拒绝；省略 id → 授权窗内最近一晚，
    /// 不是全库最新；输出不带 device_id。
    #[test]
    fn task_sleep_detail_stays_inside_granted_windows_and_strips_device_id() {
        let library = TestLibrary::empty();
        {
            let db = Database::open_migrated(&library.0.join("zepp.db")).unwrap();
            // 授权锚点 20 天前 → sleep 窗口 [today-34, today-20]。
            db.insert_workout(&run_workout("anchor", utc_noon(20), 140))
                .unwrap();
            db.insert_sleep_session(&sleep_session_days_ago("in-window", 25))
                .unwrap();
            db.insert_sleep_session(&sleep_session_days_ago("too-new", 1))
                .unwrap();
        }
        library.share_task("t1", &task_payload("t1", &["anchor"], &["sleep"]), true);

        // 显式 id 在窗外 → 拒绝（不是 sleep:null，这条记录存在但不可见）。
        let denied = library.call(
            &AccessScope::TaskScoped,
            "get_sleep_detail",
            json!({"sleepId": "too-new"}),
        );
        assert_eq!(denied["isError"], true);
        assert_eq!(
            denied["structuredContent"]["error"]["code"],
            json!(access::SCOPE_DENIED)
        );

        // 省略 id → 授权窗内最近一晚，而不是全库最新的 too-new。
        let result = library.call(&AccessScope::TaskScoped, "get_sleep_detail", json!({}));
        assert_eq!(result["isError"], false, "{}", result["content"][0]["text"]);
        assert_eq!(
            result["structuredContent"]["sleep"]["sleep_id"],
            json!("in-window")
        );
        // R6：整结构 serde 的出口必须剥掉 device_id（fixture 里有值）。
        let serialized = serde_json::to_string(&result).unwrap();
        assert!(!serialized.contains("device_id"), "{serialized}");
        assert!(!serialized.contains("watch-serial-zzz"));
        assert_no_pathish_keys(&result, "sleep_detail");

        // 授权窗内一条睡眠都没有 → 拒绝，而不是退回全库最新。
        let empty = TestLibrary::empty();
        {
            let db = Database::open_migrated(&empty.0.join("zepp.db")).unwrap();
            db.insert_workout(&run_workout("anchor", utc_noon(20), 140))
                .unwrap();
            db.insert_sleep_session(&sleep_session_days_ago("too-new", 1))
                .unwrap();
        }
        empty.share_task("t1", &task_payload("t1", &["anchor"], &["sleep"]), true);
        let denied = empty.call(&AccessScope::TaskScoped, "get_sleep_detail", json!({}));
        assert_eq!(
            denied["structuredContent"]["error"]["code"],
            json!(access::SCOPE_DENIED)
        );
    }

    /// R4：授权按 id 而不是「全库最近 N 条」——授权运动排在全库 200 名
    /// 之外也必须回得来。
    #[test]
    fn task_list_workouts_returns_granted_ids_not_global_recency() {
        let library = TestLibrary::empty();
        {
            let db = Database::open_migrated(&library.0.join("zepp.db")).unwrap();
            for index in 0..205 {
                db.insert_workout(&run_workout(
                    &format!("recent-{index:03}"),
                    utc_noon(index + 1),
                    140,
                ))
                .unwrap();
            }
            db.insert_workout(&run_workout("granted-old", utc_noon(300), 140))
                .unwrap();
        }
        library.share_task(
            "t1",
            &task_payload("t1", &["granted-old"], &["workout"]),
            true,
        );

        let result = library.call(
            &AccessScope::TaskScoped,
            "list_workouts",
            json!({"limit": 1}),
        );
        assert_eq!(result["isError"], false);
        let ids: Vec<&str> = result["structuredContent"]["workouts"]
            .as_array()
            .unwrap()
            .iter()
            .filter_map(|workout| workout["workoutId"].as_str())
            .collect();
        assert_eq!(ids, ["granted-old"], "授权 id 再老也必须可见");
        assert_no_pathish_keys(&result, "list_workouts");

        // 对照：full-readonly 的 limit=1 是全局最新，不是它。
        let full = library.call(
            &AccessScope::FullReadOnly,
            "list_workouts",
            json!({"limit": 1}),
        );
        assert_eq!(
            full["structuredContent"]["workouts"][0]["workoutId"],
            json!("recent-000")
        );
    }

    /// 授权每次调用重读：翻转 `mcp_shared` 对下一次调用立即生效。
    #[test]
    fn grant_changes_between_calls_take_effect_immediately() {
        let library = TestLibrary::empty();
        {
            let db = Database::open_migrated(&library.0.join("zepp.db")).unwrap();
            db.insert_workout(&run_workout("w1", utc_noon(5), 140))
                .unwrap();
        }
        library.share_task("t1", &task_payload("t1", &["w1"], &["workout"]), false);
        let denied = library.call(&AccessScope::TaskScoped, "list_workouts", json!({}));
        assert_eq!(
            denied["structuredContent"]["error"]["code"],
            json!(access::SCOPE_NO_GRANTS)
        );

        library.share_task("t1", &task_payload("t1", &["w1"], &["workout"]), true);
        let result = library.call(&AccessScope::TaskScoped, "list_workouts", json!({}));
        assert_eq!(result["isError"], false);
        assert_eq!(
            result["structuredContent"]["workouts"][0]["workoutId"],
            json!("w1")
        );
        assert_eq!(result["scope"]["grants"], json!(1));
    }

    /// R7：`_meta` 与请求参数都不是授权入口——进程范围由 argv 决定，
    /// 别的什么都改不了它。
    #[test]
    fn request_meta_and_params_cannot_override_the_process_scope() {
        let library = TestLibrary::empty(); // 零授权
        for params in [
            json!({"name": "list_workouts", "arguments": {},
                   "_meta": {"scope": "full-readonly"}}),
            json!({"name": "list_workouts", "arguments": {"scope": "full-readonly"}}),
        ] {
            let result = call_tool_with_db(&params, &AccessScope::TaskScoped, || {
                let db = Database::open_read_only(library.0.join("zepp.db")).unwrap();
                Ok((db, 0))
            })
            .unwrap();
            assert_eq!(
                result["structuredContent"]["error"]["code"],
                json!(access::SCOPE_NO_GRANTS),
                "{params}"
            );
        }
        // 走完整分发（modern 时代带版本 _meta）也一样：scope 只来自 argv。
        let result = handle_scoped(
            "tools/call",
            &json!({
                "name": "list_workouts",
                "arguments": {},
                "_meta": {
                    "io.modelcontextprotocol/protocolVersion": "2026-07-28",
                    "scope": "full-readonly",
                }
            }),
            &AccessScope::TaskScoped,
        );
        // 这里会真的走 open_db——没有数据库时也是 isError，绝不是放行。
        assert!(result.is_ok());
    }

    /// R10：注册表里的每个工具都得有 DataRequest 构建器。新增工具不补
    /// 映射，这条测试就红。
    #[test]
    fn every_registered_tool_builds_a_data_request() {
        let minimal_args: [(&str, Value); 5] = [
            ("list_workouts", json!({})),
            ("get_workout_insight", json!({"workoutId": "w"})),
            ("get_metric_series", json!({"metrics": ["spo2_odi"]})),
            ("get_sleep_detail", json!({})),
            ("get_data_health", json!({})),
        ];
        for tool in tool_definitions() {
            let name = tool["name"].as_str().unwrap();
            let args = minimal_args
                .iter()
                .find(|(tool_name, _)| *tool_name == name)
                .unwrap_or_else(|| panic!("{name} 缺少最小参数夹具"))
                .1
                .clone();
            let request = build_request(name, &args)
                .unwrap_or_else(|error| panic!("{name} 没有 DataRequest 映射：{error}"));
            assert_eq!(request.tool, name);
        }
    }

    /// 握手与每个 tools/call 结果都自述当前范围（recon：可见性约定）。
    #[test]
    fn handshake_and_results_disclose_the_active_scope() {
        let init = handle_scoped("initialize", &json!({}), &AccessScope::TaskScoped).unwrap();
        assert_eq!(init["scope"]["mode"], json!("task"));
        assert!(init["instructions"].as_str().unwrap().contains("task："));

        let discover = handle_scoped(
            "server/discover",
            &json!({"_meta": {"io.modelcontextprotocol/protocolVersion": "2026-07-28"}}),
            &AccessScope::TaskScoped,
        )
        .unwrap();
        assert_eq!(discover["scope"]["mode"], json!("task"));

        let full = handle("initialize", &json!({})).unwrap();
        assert_eq!(full["scope"]["mode"], json!("full-readonly"));
        assert!(full["instructions"]
            .as_str()
            .unwrap()
            .contains("full-readonly"));
    }
}
