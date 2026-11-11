//! 本机 AI 客户端里登记的 zeppbridge-mcp 是不是**这一份**、读取范围对不对。
//!
//! 从 2.x 升上来的用户多半在 Claude Desktop / Claude Code / Codex 里登记过旧工具包里的
//! `zeppbridge-mcp`；旧程序读不了升级后的库，AI 那边只会报「打不开数据库」。3.1.2 起默认读整个库，
//! 以前按 `--scope task` 登记的、或者用户打开「只给共享任务」后还没重连的，也要提醒重新复制一次。
//!
//! 这里只在本机读这几个客户端的配置文件，**只回客户端名**，不回路径、不碰别的配置项。
//! 读不到、解析不了就当没登记。

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

/// 一条登记：启动命令和参数（都按字符串收）。
#[derive(Debug, Default)]
struct Server {
    command: Option<String>,
    args: Vec<String>,
}

impl Server {
    fn strings(&self) -> impl Iterator<Item = &String> {
        self.command.iter().chain(self.args.iter())
    }

    /// 参数里带 `--scope task` / `--scope=task`。
    fn task_scoped(&self) -> bool {
        self.args
            .windows(2)
            .any(|pair| pair[0] == "--scope" && pair[1] == "task")
            || self.args.iter().any(|arg| arg == "--scope=task")
    }
}

/// 各客户端登记的服务，按 `claude_desktop` / `claude_code` / `codex` / `opencode` / `grok` / `factory` 的顺序。
fn registered(roots: &ClientConfigRoots) -> Vec<(&'static str, Vec<Server>)> {
    let mut out = Vec::new();
    let mut claude_desktop_dirs = Vec::new();
    if let Some(appdata) = &roots.appdata {
        claude_desktop_dirs.push(appdata.join("Claude"));
    }
    if let Some(home) = &roots.home {
        claude_desktop_dirs.push(
            home.join("Library")
                .join("Application Support")
                .join("Claude"),
        );
    }
    if !claude_desktop_dirs.is_empty() {
        let mut servers = Vec::new();
        for claude in claude_desktop_dirs {
            servers.extend(json_servers(
                &claude.join("claude_desktop_config.json"),
                &[],
            ));
            servers.extend(extension_servers(&claude.join("Claude Extensions")));
        }
        out.push(("claude_desktop", servers));
    }
    if let Some(home) = &roots.home {
        out.push((
            "claude_code",
            json_servers(&home.join(".claude.json"), &["projects"]),
        ));
        out.push((
            "codex",
            toml_servers(&home.join(".codex").join("config.toml")),
        ));
        out.push((
            "opencode",
            opencode_servers(&home.join(".config").join("opencode").join("opencode.json")),
        ));
        out.push((
            "grok",
            toml_servers(&home.join(".grok").join("config.toml")),
        ));
        out.push((
            "factory",
            json_servers(&home.join(".factory").join("mcp.json"), &[]),
        ));
    }
    out
}

/// 登记了别的 zeppbridge-mcp 的客户端。
pub(crate) fn stale_clients(roots: &ClientConfigRoots, sidecar: &Path) -> Vec<&'static str> {
    let current = normalize(&sidecar.to_string_lossy());
    registered(roots)
        .into_iter()
        .filter(|(_, servers)| {
            servers
                .iter()
                .flat_map(Server::strings)
                .filter(|text| mentions_program(text))
                .any(|text| normalize(text) != current)
        })
        .map(|(client, _)| client)
        .collect()
}

/// 登记的是这一份，但读取范围和现在的设置对不上（`task_only` 开着却没带 `--scope task`，或反过来）。
pub(crate) fn scope_stale_clients(
    roots: &ClientConfigRoots,
    sidecar: &Path,
    task_only: bool,
) -> Vec<&'static str> {
    let current = normalize(&sidecar.to_string_lossy());
    registered(roots)
        .into_iter()
        .filter(|(_, servers)| {
            servers.iter().any(|server| {
                server.strings().any(|text| normalize(text) == current)
                    && server.task_scoped() != task_only
            })
        })
        .map(|(client, _)| client)
        .collect()
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

fn read_json(file: &Path) -> Option<Value> {
    std::fs::read_to_string(file)
        .ok()
        .and_then(|text| serde_json::from_str::<Value>(&text).ok())
}

fn string_list(value: Option<&Value>) -> Vec<String> {
    value
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .map(str::to_string)
        .collect()
}

/// 一个 `mcpServers` 对象里的每一条（`command` 字符串 + `args` 数组）。
fn servers_in(servers: Option<&Value>, out: &mut Vec<Server>) {
    for server in servers
        .and_then(Value::as_object)
        .into_iter()
        .flat_map(|map| map.values())
    {
        out.push(Server {
            command: server
                .get("command")
                .and_then(Value::as_str)
                .map(str::to_string),
            args: string_list(server.get("args")),
        });
    }
}

/// JSON 配置：顶层 `mcpServers`，以及 `nested` 里每个对象下的 `mcpServers`
/// （Claude Code 的 `.claude.json` 按项目再登记一层）。
fn json_servers(file: &Path, nested: &[&str]) -> Vec<Server> {
    let Some(root) = read_json(file) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    servers_in(root.get("mcpServers"), &mut out);
    for key in nested {
        for scope in root
            .get(*key)
            .and_then(Value::as_object)
            .into_iter()
            .flat_map(|map| map.values())
        {
            servers_in(scope.get("mcpServers"), &mut out);
        }
    }
    out
}

/// OpenCode：`mcp.<名字>`（旧版）或 `mcp.servers.<名字>`（v2），`command` 是「程序 + 参数」一个数组。
fn opencode_servers(file: &Path) -> Vec<Server> {
    let Some(root) = read_json(file) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    let mut push = |entry: &Value| {
        let mut command = string_list(entry.get("command")).into_iter();
        if let Some(program) = command.next() {
            out.push(Server {
                command: Some(program),
                args: command.collect(),
            });
        }
    };
    for (name, entry) in root
        .get("mcp")
        .and_then(Value::as_object)
        .into_iter()
        .flatten()
    {
        if name == "servers" && entry.get("command").is_none() {
            for server in entry.as_object().into_iter().flat_map(|map| map.values()) {
                push(server);
            }
        } else {
            push(entry);
        }
    }
    out
}

/// Claude Desktop 装过的扩展（`.mcpb`）：每个扩展一个目录，`manifest.json` 里
/// `server.mcp_config` 就是启动命令。
fn extension_servers(dir: &Path) -> Vec<Server> {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for entry in entries.flatten() {
        let Some(manifest) = read_json(&entry.path().join("manifest.json")) else {
            continue;
        };
        if let Some(config) = manifest.pointer("/server/mcp_config") {
            let mut servers = serde_json::Map::new();
            servers.insert(String::new(), config.clone());
            servers_in(Some(&Value::Object(servers)), &mut out);
        }
    }
    out
}

/// Codex / Grok 的 `config.toml`：只看 `[mcp_servers.*]` 表里的 `command` / `args` 两行。
/// 不引 TOML 解析库——只认这两种写法：`"…"`（反斜杠转义）和 `'…'`（原样）。
fn toml_servers(file: &Path) -> Vec<Server> {
    let Ok(text) = std::fs::read_to_string(file) else {
        return Vec::new();
    };
    let mut out: Vec<Server> = Vec::new();
    let mut in_server = false;
    for line in text.lines() {
        let line = line.trim();
        if line.starts_with('[') {
            in_server = line.trim_start_matches('[').starts_with("mcp_servers.");
            if in_server {
                out.push(Server::default());
            }
            continue;
        }
        let Some((key, value)) = line.split_once('=') else {
            continue;
        };
        let Some(server) = out.last_mut().filter(|_| in_server) else {
            continue;
        };
        match key.trim() {
            "command" => server.command = toml_strings(value).into_iter().next(),
            "args" => server.args = toml_strings(value),
            _ => {}
        }
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
