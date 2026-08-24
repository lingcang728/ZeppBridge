use std::io;
use std::path::{Path, PathBuf};

const SQLITE_GROUP: [&str; 3] = ["zepp.db", "zepp.db-wal", "zepp.db-shm"];
const LEGACY_FILES: [&str; 5] = [
    "auth.json",
    "auth.user-id",
    "devices.json",
    "device.json",
    "zeppbridge-ca.cer",
];
const LEGACY_OPTIONAL_FILES: [&str; 1] = ["zeppbridge-ca.pem"];
const LEGACY_DIRS: [&str; 2] = ["exports", "backups"];

/// Install-local data directory: `{exe_dir}/data`.
///
/// Build-cache binaries (`cargo-target`, rustc `target/`) never own user data.
/// Those fall back to the repository `data/` folder so `tauri dev` does not
/// drop a 1GB library into `G:\build_cache`.
///
/// macOS: `.app` bundles live in `/Applications`, which is not writable, so
/// the install-local layout falls back to the user Application Support
/// directory (`~/Library/Application Support/com.zeppbridge.ZeppBridge/data`).
pub fn resolve_data_dir() -> io::Result<PathBuf> {
    let exe = std::env::current_exe()?;
    let exe_dir = exe.parent().ok_or_else(|| {
        io::Error::new(
            io::ErrorKind::NotFound,
            "executable has no parent directory",
        )
    })?;
    let data_dir = if is_build_artifact_dir(exe_dir) {
        repository_data_dir().unwrap_or_else(|| exe_dir.join("data"))
    } else {
        exe_dir.join("data")
    };
    match ensure_writable_dir(&data_dir) {
        Ok(()) => Ok(data_dir),
        #[cfg(target_os = "macos")]
        Err(_) => {
            // /Applications/ZeppBridge.app/Contents/MacOS is read-only; store
            // user data under the user's Application Support instead.
            let base = user_support_data_dir()?;
            ensure_writable_dir(&base)?;
            Ok(base)
        }
        #[cfg(not(target_os = "macos"))]
        Err(error) => Err(error),
    }
}

/// User-writable data directory for macOS: `~/Library/Application Support/
/// com.zeppbridge.ZeppBridge/data` (same `data/` layout as the Windows
/// install-local folder).
#[cfg(target_os = "macos")]
fn user_support_data_dir() -> io::Result<PathBuf> {
    let project = directories::ProjectDirs::from("com", "zeppbridge", "ZeppBridge")
        .ok_or_else(|| io::Error::new(io::ErrorKind::NotFound, "无法确定用户数据目录"))?;
    Ok(project.data_dir().join("data"))
}

pub fn webview_user_data_dir(data_dir: &Path) -> PathBuf {
    data_dir.join("webview")
}

/// Copy-or-move leftover AppData libraries into the install-local folder.
/// Existing destination files are never overwritten.
pub fn relocate_legacy_data(data_dir: &Path) -> Option<String> {
    let mut failed = Vec::new();
    for source in legacy_source_dirs() {
        if source == data_dir {
            continue;
        }
        if let Err(error) = relocate_from(&source, data_dir) {
            failed.push(format!("{}（{error}）", source.display()));
        }
    }
    if failed.is_empty() {
        None
    } else {
        Some(format!(
            "旧版 AppData 数据迁移未完全成功（{}）。应用仍可启动，现有文件未被覆盖。",
            failed.join("、")
        ))
    }
}

pub(crate) fn is_build_artifact_dir(dir: &Path) -> bool {
    let norm = normalize_path(dir);
    norm.contains("\\cargo-target\\")
        || norm.contains("/cargo-target/")
        || norm.contains("\\target\\debug")
        || norm.contains("/target/debug")
        || norm.contains("\\target\\release")
        || norm.contains("/target/release")
        || contains_rustc_target_triple(&norm)
}

fn contains_rustc_target_triple(norm: &str) -> bool {
    const MARKERS: [&str; 4] = [
        "\\target\\x86_64-",
        "/target/x86_64-",
        "\\target\\aarch64-",
        "/target/aarch64-",
    ];
    MARKERS.iter().any(|marker| norm.contains(marker))
}

fn repository_data_dir() -> Option<PathBuf> {
    let manifest = Path::new(env!("CARGO_MANIFEST_DIR"));
    Some(manifest.parent()?.join("data"))
}

fn normalize_path(path: &Path) -> String {
    path.to_string_lossy()
        .replace('/', "\\")
        .to_ascii_lowercase()
}

fn ensure_writable_dir(dir: &Path) -> io::Result<()> {
    std::fs::create_dir_all(dir)?;
    let probe = dir.join(".write-probe");
    std::fs::write(&probe, b"ok")?;
    let _ = std::fs::remove_file(&probe);
    Ok(())
}

fn legacy_source_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    if let Some(project) = directories::ProjectDirs::from("com", "zeppbridge", "ZeppBridge") {
        dirs.push(project.data_dir().to_path_buf());
        dirs.push(project.data_dir().join("data"));
    }
    if let Ok(roaming) = std::env::var("APPDATA") {
        dirs.push(PathBuf::from(&roaming).join("com.zeppbridge.app"));
        dirs.push(
            PathBuf::from(&roaming)
                .join("zeppbridge")
                .join("ZeppBridge"),
        );
        dirs.push(
            PathBuf::from(roaming)
                .join("zeppbridge")
                .join("ZeppBridge")
                .join("data"),
        );
    }
    dirs.sort();
    dirs.dedup();
    dirs
}

fn relocate_from(source_dir: &Path, data_dir: &Path) -> io::Result<()> {
    if !path_exists(source_dir)? {
        return Ok(());
    }

    relocate_sqlite_group(source_dir, data_dir)?;
    let mut names: Vec<&str> = LEGACY_FILES.to_vec();
    names.extend(LEGACY_OPTIONAL_FILES);
    for name in names {
        relocate_entry(&source_dir.join(name), &data_dir.join(name))?;
    }
    for name in LEGACY_DIRS {
        relocate_entry(&source_dir.join(name), &data_dir.join(name))?;
    }

    // Never delete a source that still holds the live SQLite group.
    if !path_exists(&source_dir.join(SQLITE_GROUP[0]))? {
        let _ = remove_empty_dir_chain(source_dir);
    }
    Ok(())
}

/// Move the main library and its WAL/SHM as one unit.
///
/// Attaching a leftover WAL from another directory onto an existing
/// `zepp.db` produces `database disk image is malformed` and a flash-crash
/// on the next launch.
fn relocate_sqlite_group(source_dir: &Path, data_dir: &Path) -> io::Result<()> {
    let dest_db = data_dir.join(SQLITE_GROUP[0]);
    let source_db = source_dir.join(SQLITE_GROUP[0]);
    if path_exists(&dest_db)? {
        return Ok(());
    }
    if !path_exists(&source_db)? {
        return Ok(());
    }
    for name in SQLITE_GROUP {
        relocate_entry(&source_dir.join(name), &data_dir.join(name))?;
    }
    Ok(())
}

/// Move a still-unreadable SQLite group out of the live path so the next open
/// can create a fresh library. Returns the quarantine directory.
pub fn quarantine_sqlite_group(db_path: &Path) -> io::Result<PathBuf> {
    let data_dir = db_path.parent().unwrap_or(db_path);
    let stamp = chrono::Local::now().format("%Y%m%d-%H%M%S");
    let dest = data_dir.join("backups").join(format!("corrupt-{stamp}"));
    std::fs::create_dir_all(&dest)?;
    for name in SQLITE_GROUP {
        let source = data_dir.join(name);
        if path_exists(&source)? {
            relocate_entry(&source, &dest.join(name))?;
        }
    }
    Ok(dest)
}

fn relocate_entry(source: &Path, destination: &Path) -> io::Result<()> {
    if !path_exists(source)? {
        return Ok(());
    }
    if path_exists(destination)? {
        return Ok(());
    }
    if let Some(parent) = destination.parent() {
        std::fs::create_dir_all(parent)?;
    }
    match std::fs::rename(source, destination) {
        Ok(()) => Ok(()),
        Err(_) => {
            copy_recursive(source, destination)?;
            remove_recursive(source)
        }
    }
}

fn copy_recursive(source: &Path, destination: &Path) -> io::Result<()> {
    let meta = std::fs::symlink_metadata(source)?;
    if meta.is_dir() {
        std::fs::create_dir_all(destination)?;
        for entry in std::fs::read_dir(source)? {
            let entry = entry?;
            copy_recursive(&entry.path(), &destination.join(entry.file_name()))?;
        }
        Ok(())
    } else {
        if let Some(parent) = destination.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::copy(source, destination).map(|_| ())
    }
}

fn remove_recursive(path: &Path) -> io::Result<()> {
    let meta = match std::fs::symlink_metadata(path) {
        Ok(meta) => meta,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(error),
    };
    if meta.is_dir() {
        std::fs::remove_dir_all(path)
    } else {
        std::fs::remove_file(path)
    }
}

fn remove_empty_dir_chain(start: &Path) -> io::Result<()> {
    let mut current = start.to_path_buf();
    for _ in 0..4 {
        match std::fs::remove_dir(&current) {
            Ok(()) => {
                if let Some(parent) = current.parent() {
                    current = parent.to_path_buf();
                } else {
                    break;
                }
            }
            Err(_) => break,
        }
    }
    Ok(())
}

fn path_exists(path: &Path) -> io::Result<bool> {
    match std::fs::symlink_metadata(path) {
        Ok(_) => Ok(true),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(error),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn build_cache_dirs_are_detected() {
        assert!(is_build_artifact_dir(Path::new(
            r"G:\build_cache\cargo-target\release"
        )));
        assert!(is_build_artifact_dir(Path::new(
            r"C:\proj\src-tauri\target\debug"
        )));
        assert!(!is_build_artifact_dir(Path::new(
            r"C:\Users\15pro\Desktop\MyProject\ZeppBridge\release"
        )));
        assert!(!is_build_artifact_dir(Path::new(r"D:\ZeppBridge")));
    }

    #[test]
    fn relocates_sqlite_group_without_overwriting() {
        let root = std::env::temp_dir().join(format!(
            "zeppbridge-path-test-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let source = root.join("appdata");
        let dest = root.join("install").join("data");
        fs::create_dir_all(&source).unwrap();
        fs::create_dir_all(&dest).unwrap();
        fs::write(source.join("zepp.db"), b"db").unwrap();
        fs::write(source.join("zepp.db-wal"), b"wal").unwrap();
        fs::write(source.join("auth.json"), b"{}").unwrap();
        fs::create_dir_all(source.join("exports")).unwrap();
        fs::write(source.join("exports").join("a.json"), b"[]").unwrap();

        relocate_from(&source, &dest).unwrap();
        assert_eq!(fs::read(dest.join("zepp.db")).unwrap(), b"db");
        assert_eq!(fs::read(dest.join("auth.json")).unwrap(), b"{}");
        assert_eq!(
            fs::read(dest.join("exports").join("a.json")).unwrap(),
            b"[]"
        );
        assert!(!source.join("zepp.db").exists());

        fs::create_dir_all(&source).unwrap();
        fs::write(source.join("zepp.db"), b"newer").unwrap();
        relocate_from(&source, &dest).unwrap();
        assert_eq!(fs::read(dest.join("zepp.db")).unwrap(), b"db");

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn does_not_attach_foreign_wal_to_existing_destination_db() {
        let root = std::env::temp_dir().join(format!(
            "zeppbridge-path-wal-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let source = root.join("appdata");
        let dest = root.join("install").join("data");
        fs::create_dir_all(&source).unwrap();
        fs::create_dir_all(&dest).unwrap();
        fs::write(dest.join("zepp.db"), b"live").unwrap();
        fs::write(source.join("zepp.db-wal"), b"foreign-wal").unwrap();
        fs::write(source.join("zepp.db-shm"), b"foreign-shm").unwrap();

        relocate_from(&source, &dest).unwrap();
        assert_eq!(fs::read(dest.join("zepp.db")).unwrap(), b"live");
        assert!(!dest.join("zepp.db-wal").exists());
        assert!(!dest.join("zepp.db-shm").exists());

        let _ = fs::remove_dir_all(root);
    }
}
