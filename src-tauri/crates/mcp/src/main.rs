use std::collections::{BTreeMap, BTreeSet};

use std::io::{self, BufRead, Write};

use chrono::{Duration, Local, NaiveDate};

use serde_json::{json, Value};

use zeppbridge_core::access::{self, AccessCategory, AccessScope, DataRequest, Permit};

use zeppbridge_core::contract;

use zeppbridge_core::paths;

use zeppbridge_core::storage::Database;

mod browse;
mod coach;
mod protocol;
mod runners;
mod schema;
#[cfg(test)]
mod tests;
mod tools;

use browse::*;
use coach::*;
use protocol::*;
use runners::*;
use schema::*;
use tools::*;

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
