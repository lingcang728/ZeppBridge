//! JSON-RPC 协议层：错误、握手、协议版本协商、方法分发（从 main.rs 拆出，逻辑不变）。

use super::*;

/// 一个 JSON-RPC 错误。
///
/// 不再用裸 `(i64, String)`：`UnsupportedProtocolVersionError` 规定要带
/// `data.supported` 和 `data.requested`，客户端靠这两项挑一个双方都支持的
/// 版本重试。没有 `data` 的话它只能放弃。
#[derive(Debug)]
pub(super) struct RpcError {
    pub(super) code: i64,
    pub(super) message: String,
    pub(super) data: Option<Value>,
}

impl RpcError {
    pub(super) fn new(code: i64, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
            data: None,
        }
    }

    pub(super) fn to_json(&self) -> Value {
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
pub(super) fn server_info() -> Value {
    json!({ "name": "zeppbridge", "version": VERSION })
}

/// 第一次握手（或第一次调用）就该看到的边界和缺失值规则。
///
/// 写在这里而不是等调用方拿到一条空序列自己猜：一个模型看到「今天没有心率」
/// 时，最容易做的事就是当成 0。访问范围也在这里明说——模型应该知道自己是
/// 在看全库，还是只看得到任务授权的那一小块。
pub(super) fn instructions(scope: &AccessScope) -> String {
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
pub(super) fn requested_protocol_version(params: &Value) -> Option<&str> {
    params
        .get("_meta")
        .and_then(|meta| meta.get(META_PROTOCOL_VERSION))
        .and_then(Value::as_str)
}

/// 这一版我们认不认。
pub(super) fn version_supported(version: &str) -> bool {
    SUPPORTED_PROTOCOL_VERSIONS.contains(&version)
}

pub(super) fn unsupported_version_error(requested: &str) -> RpcError {
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
pub(super) fn modern_result(mut result: Value) -> Value {
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
pub(super) fn handle(method: &str, params: &Value) -> Result<Value, RpcError> {
    handle_scoped(method, params, &AccessScope::FullReadOnly)
}

pub(super) fn handle_scoped(
    method: &str,
    params: &Value,
    scope: &AccessScope,
) -> Result<Value, RpcError> {
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
