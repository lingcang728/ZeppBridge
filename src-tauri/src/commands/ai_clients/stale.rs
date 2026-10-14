//! 本机 AI 客户端里登记的 zeppbridge-mcp 是不是**这一份**。
//!
//! 从 2.x 升上来的用户多半在 Claude Desktop / Claude Code / Codex 里登记过旧工具包里的
//! `zeppbridge-mcp`；旧程序读不了升级后的库，AI 那边只会报「打不开数据库」。这里只在本机
//! 读这几个客户端的配置文件，找出命令或参数里出现 `zeppbridge-mcp`、但路径不是当前 sidecar
//! 的那几家，**只回客户端名**，不回路径、不碰别的配置项。读不到、解析不了就当没登记。

use serde_json::Value;
use std::path::{Path, PathBuf};

const MCP_PROGRAM: &str = "zeppbridge-mcp";

/// 去哪找这几个客户端的配置。`appdata` 只在 Windows 上有（Claude Desktop 的配置在那里）。
pub(crate) struct ClientConfigRoots {
    pub home: Option<PathBuf>,
    pub appdata: Option<PathBuf>,
}

impl ClientConfigRoots {
    pub fn from_env() -> Self {
        let var = |name: &str| std::env::var_os(name).map(PathBuf::from);
        Self {
            home: var("USERPROFILE").or_else(|| var("HOME")),
            appdata: var("APPDATA"),
        }
    }
}

/// 登记了别的 zeppbridge-mcp 的客户端：`claude_desktop` / `claude_code` / `codex`，按这个顺序。
pub(crate) fn stale_clients(roots: &ClientConfigRoots, sidecar: &Path) -> Vec<&'static str> {
    let current = normalize(&sidecar.to_string_lossy());
    let stale = |paths: Vec<String>| paths.iter().any(|path| normalize(path) != current);
    let mut out = Vec::new();
    if let Some(appdata) = &roots.appdata {
        let claude = appdata.join("Claude");
        let mut paths = json_server_paths(&claude.join("claude_desktop_config.json"), &[]);
        paths.extend(extension_paths(&claude.join("Claude Extensions")));
        if stale(paths) {
            out.push("claude_desktop");
        }
    }
    if let Some(home) = &roots.home {
        if stale(json_server_paths(&home.join(".claude.json"), &["projects"])) {
            out.push("claude_code");
        }
        if stale(toml_server_paths(&home.join(".codex").join("config.toml"))) {
            out.push("codex");
        }
    }
    out
}

/// 比较用：大小写、斜杠方向、两端引号都不算区别。
fn normalize(path: &str) -> String {
    path.trim()
        .trim_matches(|c| c == '"' || c == '\'')
        .replace('/', "\\")
        .to_lowercase()
}

fn mentions_program(text: &str) -> bool {
    text.to_lowercase().contains(MCP_PROGRAM)
}

/// 一个 `mcpServers` 对象里所有提到 zeppbridge-mcp 的 `command` / `args` 字符串。
fn server_strings(servers: Option<&Value>, out: &mut Vec<String>) {
    let Some(servers) = servers.and_then(Value::as_object) else {
        return;
    };
    for server in servers.values() {
        let command = server.get("command").and_then(Value::as_str);
        let args = server
            .get("args")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(Value::as_str);
        out.extend(
            command
                .into_iter()
                .chain(args)
                .filter(|text| mentions_program(text))
                .map(str::to_string),
        );
    }
}

/// JSON 配置：顶层 `mcpServers`，以及 `nested` 里每个对象下的 `mcpServers`
/// （Claude Code 的 `.claude.json` 按项目再登记一层）。
fn json_server_paths(file: &Path, nested: &[&str]) -> Vec<String> {
    let Some(root) = std::fs::read_to_string(file)
        .ok()
        .and_then(|text| serde_json::from_str::<Value>(&text).ok())
    else {
        return Vec::new();
    };
    let mut out = Vec::new();
    server_strings(root.get("mcpServers"), &mut out);
    for key in nested {
        for (_, scope) in root
            .get(*key)
            .and_then(Value::as_object)
            .into_iter()
            .flatten()
        {
            server_strings(scope.get("mcpServers"), &mut out);
        }
    }
    out
}

/// Claude Desktop 装过的扩展（`.mcpb`）：每个扩展一个目录，`manifest.json` 里
/// `server.mcp_config` 就是启动命令。
fn extension_paths(dir: &Path) -> Vec<String> {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for entry in entries.flatten() {
        let Some(manifest) = std::fs::read_to_string(entry.path().join("manifest.json"))
            .ok()
            .and_then(|text| serde_json::from_str::<Value>(&text).ok())
        else {
            continue;
        };
        let config = manifest.pointer("/server/mcp_config");
        let mut servers = serde_json::Map::new();
        if let Some(config) = config {
            servers.insert(String::new(), config.clone());
        }
        server_strings(Some(&Value::Object(servers)), &mut out);
    }
    out
}

/// Codex 的 `config.toml`：只看 `[mcp_servers.*]` 表里的 `command` / `args` 两行。
/// 不引 TOML 解析库——只认这两种写法：`"…"`（反斜杠转义）和 `'…'`（原样）。
fn toml_server_paths(file: &Path) -> Vec<String> {
    let Ok(text) = std::fs::read_to_string(file) else {
        return Vec::new();
    };
    let mut in_server = false;
    let mut out = Vec::new();
    for line in text.lines() {
        let line = line.trim();
        if line.starts_with('[') {
            in_server = line.trim_start_matches('[').starts_with("mcp_servers.");
            continue;
        }
        let Some((key, value)) = line.split_once('=') else {
            continue;
        };
        if !in_server || !matches!(key.trim(), "command" | "args") {
            continue;
        }
        out.extend(
            toml_strings(value)
                .into_iter()
                .filter(|text| mentions_program(text)),
        );
    }
    out
}

fn toml_strings(value: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut chars = value.chars();
    while let Some(c) = chars.next() {
        match c {
            '"' => {
                let mut text = String::new();
                while let Some(c) = chars.next() {
                    match c {
                        '\\' => text.extend(chars.next()),
                        '"' => break,
                        other => text.push(other),
                    }
                }
                out.push(text);
            }
            '\'' => out.push(chars.by_ref().take_while(|&c| c != '\'').collect()),
            _ => {}
        }
    }
    out
}
