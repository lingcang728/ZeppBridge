use super::*;
use std::io::Write;

fn temp_dir(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!(
        "zeppbridge-portable-{name}-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

/// 打一个更新包；`deflate` 为真时按 CI 那样压缩（Compress-Archive 出的是 deflate）。
fn payload(entries: &[(&str, &[u8])], deflate: bool) -> Vec<u8> {
    let mut writer = zip::ZipWriter::new(io::Cursor::new(Vec::new()));
    let method = if deflate {
        zip::CompressionMethod::Deflated
    } else {
        zip::CompressionMethod::Stored
    };
    let options = zip::write::SimpleFileOptions::default().compression_method(method);
    for (name, bytes) in entries {
        writer.start_file(*name, options).unwrap();
        writer.write_all(bytes).unwrap();
    }
    writer.finish().unwrap().into_inner()
}

fn read(path: &Path) -> Vec<u8> {
    std::fs::read(path).unwrap()
}

fn names(dir: &Path) -> Vec<String> {
    let mut names: Vec<String> = std::fs::read_dir(dir)
        .unwrap()
        .map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned())
        .collect();
    names.sort();
    names
}

#[test]
fn both_programs_are_replaced_and_the_leftovers_are_swept_next_start() {
    let dir = temp_dir("swap");
    let exe = dir.join("ZeppBridge.exe");
    std::fs::write(&exe, b"old app").unwrap();
    std::fs::write(dir.join(MCP_ENTRY), b"old mcp").unwrap();
    std::fs::create_dir_all(dir.join("data")).unwrap();
    std::fs::write(dir.join("data").join("zepp.db"), b"library").unwrap();

    let bytes = payload(&[(APP_ENTRY, b"new app"), (MCP_ENTRY, b"new mcp")], true);
    swap(stage(&exe, &bytes).unwrap()).unwrap();

    assert_eq!(read(&exe), b"new app");
    assert_eq!(read(&dir.join(MCP_ENTRY)), b"new mcp");
    assert_eq!(read(&dir.join("ZeppBridge.exe.old")), b"old app");
    assert_eq!(read(&dir.join("data").join("zepp.db")), b"library");
    assert!(!dir.join(STAGING_DIR).exists());

    sweep(&exe);
    assert_eq!(names(&dir), ["ZeppBridge.exe", "data", MCP_ENTRY]);
    wait_for_previous(&exe, Duration::from_millis(10));
    let _ = std::fs::remove_dir_all(dir);
}

/// 中途失败（这里让 MCP 那一步找不到暂存文件）：已经换上去的主程序要换回旧的，
/// `.old` 改回原名，文件夹和更新前一模一样。
#[test]
fn a_failure_halfway_puts_every_file_back() {
    let dir = temp_dir("rollback");
    let exe = dir.join("ZeppBridge.exe");
    std::fs::write(&exe, b"old app").unwrap();
    std::fs::write(dir.join(MCP_ENTRY), b"old mcp").unwrap();

    let bytes = payload(&[(APP_ENTRY, b"new app"), (MCP_ENTRY, b"new mcp")], false);
    let staged = stage(&exe, &bytes).unwrap();
    std::fs::remove_file(staged.staging.join(MCP_ENTRY)).unwrap();
    assert!(swap(staged).is_err());

    assert_eq!(read(&exe), b"old app");
    assert_eq!(read(&dir.join(MCP_ENTRY)), b"old mcp");
    assert_eq!(names(&dir), ["ZeppBridge.exe", MCP_ENTRY]);
    let _ = std::fs::remove_dir_all(dir);
}

/// 包里只许有两个程序：别的条目（尤其是带路径的）一律拒绝，而且什么都不写。
#[test]
fn unexpected_entries_and_a_missing_main_program_are_refused_before_writing() {
    let dir = temp_dir("refuse");
    let exe = dir.join("ZeppBridge.exe");
    std::fs::write(&exe, b"old app").unwrap();

    for bytes in [
        payload(&[(APP_ENTRY, b"new"), ("data/zepp.db", b"evil")], false),
        payload(
            &[(APP_ENTRY, b"new"), ("../ZeppBridge.exe", b"evil")],
            false,
        ),
        payload(&[(MCP_ENTRY, b"new mcp")], false),
        payload(&[(APP_ENTRY, b"")], false),
        b"not a zip".to_vec(),
    ] {
        let error = stage(&exe, &bytes).unwrap_err();
        assert_eq!(error.kind(), io::ErrorKind::InvalidData, "{error}");
    }
    assert_eq!(names(&dir), ["ZeppBridge.exe"]);
    assert_eq!(read(&exe), b"old app");
    let _ = std::fs::remove_dir_all(dir);
}

/// 用户把 exe 改过名（例如下载了两次变成「ZeppBridge (1).exe」）：替换的是正在跑的这个文件。
/// 没附带 MCP 的旧便携版，更新后旁边多出 MCP。
#[test]
fn the_running_exe_is_replaced_whatever_it_is_called() {
    let dir = temp_dir("renamed");
    let exe = dir.join("ZeppBridge (1).exe");
    std::fs::write(&exe, b"old app").unwrap();

    let bytes = payload(&[(APP_ENTRY, b"new app"), (MCP_ENTRY, b"new mcp")], true);
    swap(stage(&exe, &bytes).unwrap()).unwrap();
    sweep(&exe);

    assert_eq!(read(&exe), b"new app");
    assert_eq!(read(&dir.join(MCP_ENTRY)), b"new mcp");
    assert_eq!(names(&dir), ["ZeppBridge (1).exe", MCP_ENTRY]);
    let _ = std::fs::remove_dir_all(dir);
}
