use super::*;
use std::io::Read;

/// 每个用例一个空目录；不为这三个用例引入 tempfile。
struct Scratch(PathBuf);
impl Scratch {
    fn new(name: &str) -> Self {
        let dir = std::env::temp_dir().join(format!("zb-ai-clients-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        Self(dir)
    }
    fn path(&self) -> &Path {
        &self.0
    }
}
impl Drop for Scratch {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

/// 没附带 sidecar 时不给路径——界面据此显示「这一版没附带」，而不是拼一条
/// 指向不存在文件的命令让用户去撞。
#[test]
fn missing_sidecar_gives_no_path() {
    let dir = Scratch::new("missing");
    let found = locate_sidecar(dir.path(), &dir.path().join("data"));
    assert!(found.path.is_none());
    assert!(found.data_dir_env.is_none());
}

/// sidecar 旁边就是应用的库时不带环境变量；库在别处（开发构建、回退目录）
/// 时必须带上，否则 AI 读到的是一个空库却以为「没有数据」。
#[test]
fn data_dir_env_only_when_the_library_is_elsewhere() {
    let dir = Scratch::new("env");
    let exe = dir
        .path()
        .join(format!("zeppbridge-mcp{}", std::env::consts::EXE_SUFFIX));
    std::fs::write(&exe, b"stub").unwrap();

    let beside = locate_sidecar(dir.path(), &dir.path().join("data"));
    assert_eq!(beside.path.as_deref(), Some(exe.to_string_lossy().as_ref()));
    assert!(beside.data_dir_env.is_none());

    let elsewhere = dir.path().join("elsewhere");
    let moved = locate_sidecar(dir.path(), &elsewhere);
    assert_eq!(
        moved.data_dir_env.as_deref(),
        Some(elsewhere.to_string_lossy().as_ref())
    );
}

/// 包里真有 manifest 和 entry_point 指向的文件，启动命令指向安装目录那一份。
#[test]
fn bundle_carries_manifest_and_entry_point() {
    let dir = Scratch::new("bundle");
    let exe = dir.path().join("zeppbridge-mcp.exe");
    std::fs::write(&exe, b"binary").unwrap();
    let bytes = build_bundle(&exe, Some("D:\\data")).unwrap();

    let mut archive = zip::ZipArchive::new(std::io::Cursor::new(bytes)).unwrap();
    let mut manifest = String::new();
    archive
        .by_name("manifest.json")
        .unwrap()
        .read_to_string(&mut manifest)
        .unwrap();
    let manifest: serde_json::Value = serde_json::from_str(&manifest).unwrap();
    let entry = manifest["server"]["entry_point"]
        .as_str()
        .unwrap()
        .to_string();
    let mut binary = Vec::new();
    archive
        .by_name(&entry)
        .unwrap()
        .read_to_end(&mut binary)
        .unwrap();
    assert_eq!(binary, b"binary");
    let config = &manifest["server"]["mcp_config"];
    assert_eq!(config["command"], exe.to_string_lossy().as_ref());
    assert_eq!(config["args"], serde_json::json!(["--scope", "task"]));
    assert_eq!(config["env"]["ZEPPBRIDGE_DATA_DIR"], "D:\\data");
}

/// 2.x 升上来的用户在 AI 客户端里登记的是旧工具包里的 zeppbridge-mcp：三家各认一种写法，
/// 指向当前 sidecar 的不算（大小写、斜杠方向不同也不算），没提到 zeppbridge-mcp 的项目路径不算。
#[test]
fn stale_clients_are_the_ones_pointing_at_another_mcp_program() {
    use super::stale::{stale_clients, ClientConfigRoots};
    let dir = Scratch::new("stale");
    let home = dir.path().join("home");
    let appdata = dir.path().join("appdata");
    let sidecar = dir.path().join("app").join("zeppbridge-mcp.exe");
    let roots = ClientConfigRoots {
        home: Some(home.clone()),
        appdata: Some(appdata.clone()),
    };
    assert!(stale_clients(&roots, &sidecar).is_empty(), "什么都没装");

    // Claude Code：项目级登记的旧路径；用户级指向当前 sidecar（换了大小写和斜杠）。
    std::fs::create_dir_all(&home).unwrap();
    let current = sidecar.to_string_lossy().to_uppercase().replace('\\', "/");
    let claude_json = serde_json::json!({
        "mcpServers": { "zeppbridge": { "command": current, "args": ["--scope", "task"] } },
        "projects": { "C:/work/zeppbridge": { "mcpServers": {
            "zb": { "command": "cmd", "args": ["/c", "D:\\tools\\ZeppBridge-2.4\\zeppbridge-mcp.exe"] }
        } } }
    });
    std::fs::write(home.join(".claude.json"), claude_json.to_string()).unwrap();
    // Codex：只有项目信任表提到 zeppbridge，不算。
    std::fs::create_dir_all(home.join(".codex")).unwrap();
    std::fs::write(
        home.join(".codex").join("config.toml"),
        "[projects.'c:\\users\\me\\zeppbridge']\ntrust_level = \"trusted\"\n",
    )
    .unwrap();
    assert_eq!(stale_clients(&roots, &sidecar), ["claude_code"]);

    // Codex 登记了旧路径（TOML 双引号带转义）；Claude Desktop 装过指向旧路径的扩展。
    std::fs::write(
        home.join(".codex").join("config.toml"),
        "[mcp_servers.zeppbridge]\ncommand = \"D:\\\\old\\\\zeppbridge-mcp.exe\"\nargs = [\"--scope\", \"task\"]\n",
    )
    .unwrap();
    let extension = appdata
        .join("Claude")
        .join("Claude Extensions")
        .join("local.mcpb.zeppbridge");
    std::fs::create_dir_all(&extension).unwrap();
    std::fs::write(
        extension.join("manifest.json"),
        serde_json::json!({ "server": { "mcp_config": { "command": "D:/old/zeppbridge-mcp.exe" } } })
            .to_string(),
    )
    .unwrap();
    assert_eq!(
        stale_clients(&roots, &sidecar),
        ["claude_desktop", "claude_code", "codex"]
    );

    // 都换成当前这份以后，一个都不报。
    let toml_path = sidecar.to_string_lossy().replace('\\', "\\\\");
    std::fs::write(
        home.join(".codex").join("config.toml"),
        format!("[mcp_servers.zeppbridge]\ncommand = \"{toml_path}\"\n"),
    )
    .unwrap();
    std::fs::remove_dir_all(appdata.join("Claude")).unwrap();
    std::fs::write(home.join(".claude.json"), "{\"mcpServers\":{}}").unwrap();
    assert!(stale_clients(&roots, &sidecar).is_empty());
}
