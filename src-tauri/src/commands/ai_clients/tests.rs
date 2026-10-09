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
