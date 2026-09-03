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

/// 显式指定数据目录的环境变量。
///
/// 容器里没有「安装目录旁边」这个概念：镜像是只读的（或者应当被当作只读），
/// 而用户挂进来的卷可以在任何路径上。同样的问题也出现在 systemd 单元和
/// NAS 的任务计划里——那里没人会去关心可执行文件躺在哪。给出这一个变量，
/// 是为了让「数据在哪」变成部署时的一句声明，而不是一条要去反推的规则。
pub const DATA_DIR_ENV: &str = "ZEPPBRIDGE_DATA_DIR";

/// Install-local data directory: `{exe_dir}/data`.
///
/// `ZEPPBRIDGE_DATA_DIR` overrides everything below when it is set to an
/// absolute path.
///
/// Build-cache binaries (`cargo-target`, rustc `target/`) never own user data.
/// Those fall back to the repository `data/` folder so `tauri dev` does not
/// drop a 1GB library into `G:\build_cache`.
///
/// macOS: `.app` bundles live in `/Applications`, which is not writable, so
/// the install-local layout falls back to the user Application Support
/// directory (`~/Library/Application Support/com.zeppbridge.ZeppBridge/data`).
///
/// Linux: a packaged build is installed into a shared, root-owned prefix
/// (`/usr/bin` for deb/rpm, `/app/bin` inside a Flatpak sandbox). There is no
/// "next to the executable" there, so those go straight to the XDG data
/// directory (`~/.local/share/zeppbridge/data`, which a Flatpak redirects into
/// `~/.var/app/com.zeppbridge.app/`). An AppImage or an unpacked tarball keeps
/// the install-local layout, because for those the folder really is the
/// user's.
pub fn resolve_data_dir() -> io::Result<PathBuf> {
    if let Some(dir) = data_dir_from_env()? {
        ensure_writable_dir(&dir)?;
        return Ok(dir);
    }

    let exe = std::env::current_exe()?;
    let exe_dir = exe.parent().ok_or_else(|| {
        io::Error::new(
            io::ErrorKind::NotFound,
            "executable has no parent directory",
        )
    })?;

    // 刻意在写之前就分流，而不是「先试着写 /usr/bin/data，失败了再退」：
    // 容器里 CLI 常常是 root 跑的，那一步会**成功**，于是数据被写进镜像层，
    // 容器一删就没了，而挂在旁边的卷是空的。以 root 运行不该改变数据落点。
    #[cfg(all(unix, not(target_os = "macos")))]
    if !is_build_artifact_dir(exe_dir) && is_shared_prefix_dir(exe_dir) {
        let base = user_data_dir()?;
        ensure_writable_dir(&base)?;
        return Ok(base);
    }

    let data_dir = if is_build_artifact_dir(exe_dir) {
        repository_data_dir().unwrap_or_else(|| exe_dir.join("data"))
    } else {
        exe_dir.join("data")
    };
    match ensure_writable_dir(&data_dir) {
        Ok(()) => Ok(data_dir),
        Err(error) => fall_back_to_user_data_dir(&data_dir, error),
    }
}

/// 安装目录旁边写不进去时的退路。
///
/// 以前这条退路只有 unix 有（`/Applications/...` 和只读前缀），Windows 那一支
/// 是 `Err(error) => Err(error)`——一个字的退路都没有。可 Windows 上这件事**更
/// 常见**：`.msi` 装的是 `C:\Program Files\ZeppBridge`，普通用户对它没有写权限；
/// 受控文件夹访问、组策略、杀软的目录保护也都会命中。而调用方
/// （`lib.rs` 的 `setup()`）对这个 `Err` 用的是 `?`，于是应用**静默退出**：
/// 窗口没出来，通知区里留一个已经画好的死图标，日志一个字都没有。
/// 见 2026-09-03 的那封 Reddit 私信。
///
/// 但退也不能闷头退：如果那个不可写的目录里**已经躺着用户的库**，换一个空目录
/// 等于让用户看到「我的数据全没了」。那种情况如实报错，让启动对话框把两个路径
/// 都摆出来。
fn fall_back_to_user_data_dir(blocked: &Path, error: io::Error) -> io::Result<PathBuf> {
    if blocked.join(SQLITE_GROUP[0]).exists() {
        return Err(io::Error::new(
            error.kind(),
            format!(
                concat!(
                    "数据目录 {} 里已经有一个库，但现在写不进去（{}）。",
                    "换一个目录会让这份数据看起来消失，所以这里不自作主张。",
                    "请给该目录写权限，或者用 {} 指定一个可写的目录。"
                ),
                blocked.display(),
                error,
                DATA_DIR_ENV
            ),
        ));
    }
    let base = user_data_dir()?;
    ensure_writable_dir(&base)?;
    Ok(base)
}

/// `ZEPPBRIDGE_DATA_DIR`，校验过的。
///
/// 相对路径被当成配置错误而不是悄悄按当前工作目录展开：cron 和容器
/// entrypoint 的工作目录都不是写单元文件的人能看见的东西，按它展开等于
/// 把数据放到一个随调用方式漂移的位置上。
fn data_dir_from_env() -> io::Result<Option<PathBuf>> {
    data_dir_from_env_value(std::env::var_os(DATA_DIR_ENV))
}

/// 和 `data_dir_from_env` 分开，只为了能在测试里传值。
///
/// 直接在测试里 `set_var` 是不行的：cargo 把同一个 crate 的测试跑在一个进程的
/// 多个线程里，环境变量是进程级的，谁先跑就影响谁——这类测试会随机失败，
/// 而失败看起来像是被测代码的问题。
fn data_dir_from_env_value(raw: Option<std::ffi::OsString>) -> io::Result<Option<PathBuf>> {
    let Some(raw) = raw else {
        return Ok(None);
    };
    let raw = PathBuf::from(raw);
    if raw.as_os_str().is_empty() {
        return Ok(None);
    }
    if !raw.is_absolute() {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            format!("{DATA_DIR_ENV} 必须是绝对路径，收到：{}", raw.display()),
        ));
    }
    Ok(Some(raw))
}

/// User-writable data directory: `~/Library/Application Support/
/// com.zeppbridge.ZeppBridge/data` on macOS, `~/.local/share/zeppbridge/data`
/// on Linux, `%APPDATA%\zeppbridge\ZeppBridge\data` on Windows. All three keep
/// the same `data/` layout as the install-local folder, so the CLI and MCP
/// tools resolve the same place the app does.
///
/// Windows 上这个路径同时也在 `legacy_source_dirs()` 里，所以回退到它之后
/// `relocate_legacy_data()` 不会把它自己搬给自己（那里有 `source == data_dir`
/// 的短路）。
fn user_data_dir() -> io::Result<PathBuf> {
    let project = directories::ProjectDirs::from("com", "zeppbridge", "ZeppBridge")
        .ok_or_else(|| io::Error::new(io::ErrorKind::NotFound, "无法确定用户数据目录"))?;
    Ok(project.data_dir().join("data"))
}

/// 这个目录是不是「操作系统或包管理器拥有的共享前缀」。
///
/// 判断的是所有权而不是可写性。AppImage 挂载点和解包出来的 tarball 不在
/// 这份名单里，那两种情况下目录确实属于用户，安装目录旁边就是对的位置。
#[cfg(all(unix, not(target_os = "macos")))]
fn is_shared_prefix_dir(dir: &Path) -> bool {
    // `/app` 是 Flatpak 沙箱里的安装前缀；`/nix/store` 与 `/snap` 是只读的
    // 内容寻址存储，路径里还带哈希，往旁边写数据在下一次更新后就找不到了。
    const PREFIXES: [&str; 8] = [
        "/usr/",
        "/bin/",
        "/sbin/",
        "/opt/",
        "/app/",
        "/snap/",
        "/nix/store/",
        "/var/lib/flatpak/",
    ];
    let path = dir.to_string_lossy();
    // 结尾补一个分隔符，`/usr` 本身也能被 `/usr/` 命中。
    let path = format!("{path}/");
    PREFIXES.iter().any(|prefix| path.starts_with(prefix))
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

pub fn is_build_artifact_dir(dir: &Path) -> bool {
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

/// 从 cargo 产物目录跑起来时，数据目录回退到仓库根的 `data/`。
///
/// 刻意向上找仓库根的标志文件，而不是写死「manifest 的上一级」：core 被拆成
/// workspace 成员之后，`CARGO_MANIFEST_DIR` 从 `src-tauri` 变成了
/// `src-tauri/crates/core`，写死一层就会指到 `src-tauri/crates/data`，
/// 开发时会安静地建一个空库，而用户那份 200 MB 的数据看起来像是不见了。
fn repository_data_dir() -> Option<PathBuf> {
    let mut dir = Path::new(env!("CARGO_MANIFEST_DIR"));
    loop {
        // 仓库根同时有这两样；单看其中一个都可能撞上别的目录。
        if dir.join("package.json").is_file() && dir.join("src-tauri").is_dir() {
            return Some(dir.join("data"));
        }
        dir = dir.parent()?;
    }
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
    #[test]
    fn the_repository_fallback_lands_on_the_repository_root_not_a_crate_folder() {
        // core 被拆成 workspace 成员后，manifest 目录深了两级。这个回退
        // 必须继续指向仓库根的 data/，否则开发时会安静地换一个空库。
        let dir = repository_data_dir().expect("仓库里应当能找到根目录");
        assert!(dir.ends_with("data"), "{}", dir.display());
        let root = dir.parent().unwrap();
        assert!(root.join("package.json").is_file(), "{}", root.display());
        assert!(root.join("src-tauri").is_dir(), "{}", root.display());
        assert!(
            !root.ends_with("crates"),
            "回退不能停在 crates 目录：{}",
            root.display()
        );
    }

    use super::*;
    use std::fs;

    #[test]
    fn a_blocked_empty_data_dir_falls_back_instead_of_failing() {
        // 安装目录旁边写不进去、而那里又没有库（.msi 装进 Program Files
        // 的新装机器就是这个样子）——必须退到用户目录，而不是把错误
        // 往上抛给 `setup()` 的 `?` 变成一次静默退出。
        let blocked = std::env::temp_dir().join("zeppbridge-blocked-empty");
        let _ = fs::remove_dir_all(&blocked);
        let resolved = fall_back_to_user_data_dir(
            &blocked,
            io::Error::new(io::ErrorKind::PermissionDenied, "access is denied"),
        )
        .expect("空目录写不进去时应当回退到用户目录");
        assert_eq!(resolved, user_data_dir().unwrap());
        assert_ne!(resolved, blocked);
    }

    #[test]
    fn a_blocked_data_dir_that_already_holds_a_library_reports_instead_of_moving() {
        // 反过来：里面已经有库了。静静换一个空目录，用户看到的是
        // 「我的数据全没了」——那比报错更坏。错误文本里必须有路径和
        // 环境变量名，启动对话框靠它告诉用户下一步做什么。
        let blocked = std::env::temp_dir().join("zeppbridge-blocked-with-db");
        fs::create_dir_all(&blocked).unwrap();
        fs::write(blocked.join(SQLITE_GROUP[0]), b"not really sqlite").unwrap();
        let error = fall_back_to_user_data_dir(
            &blocked,
            io::Error::new(io::ErrorKind::PermissionDenied, "access is denied"),
        )
        .expect_err("里面有库时不应该悠悠换目录");
        let text = error.to_string();
        assert!(text.contains(&blocked.display().to_string()), "{text}");
        assert!(text.contains(DATA_DIR_ENV), "{text}");
        let _ = fs::remove_dir_all(&blocked);
    }

    #[test]
    fn an_explicit_data_dir_must_be_absolute() {
        // 相对路径按当前工作目录展开，就会让「数据在哪」取决于是谁、从哪
        // 启动了进程。cron 和容器 entrypoint 的工作目录都不在部署者的视野里。
        let error = super::data_dir_from_env_value(Some(std::ffi::OsString::from("data")))
            .expect_err("相对路径应当被拒绝");
        assert_eq!(error.kind(), io::ErrorKind::InvalidInput);
        assert!(error.to_string().contains(DATA_DIR_ENV), "{error}");
    }

    #[test]
    fn an_unset_or_empty_data_dir_falls_through() {
        assert!(super::data_dir_from_env_value(None).unwrap().is_none());
        // 空值当作没设。docker-compose 里 `ZEPPBRIDGE_DATA_DIR=` 是一句
        // 「用默认」，不是一句「用根目录」。
        assert!(
            super::data_dir_from_env_value(Some(std::ffi::OsString::new()))
                .unwrap()
                .is_none()
        );
    }

    #[test]
    fn an_absolute_data_dir_is_taken_as_given() {
        let raw = if cfg!(windows) { r"C:\zepp" } else { "/data" };
        let dir = super::data_dir_from_env_value(Some(std::ffi::OsString::from(raw)))
            .unwrap()
            .expect("绝对路径应当被接受");
        assert_eq!(dir, PathBuf::from(raw));
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    #[test]
    fn packaged_linux_prefixes_do_not_own_user_data() {
        // deb/rpm 装到 /usr/bin，Flatpak 沙箱里是 /app/bin。这两处都不该
        // 被当成「安装目录旁边可以放数据」——即便进程是 root，写得进去。
        assert!(is_shared_prefix_dir(Path::new("/usr/bin")));
        assert!(is_shared_prefix_dir(Path::new("/usr")));
        assert!(is_shared_prefix_dir(Path::new("/app/bin")));
        assert!(is_shared_prefix_dir(Path::new("/opt/zeppbridge")));
        assert!(is_shared_prefix_dir(Path::new(
            "/snap/zeppbridge/current/bin"
        )));

        // AppImage 的挂载点和解包出来的 tarball 属于用户，保持安装目录布局。
        assert!(!is_shared_prefix_dir(Path::new("/tmp/.mount_ZeppBrXXXXXX")));
        assert!(!is_shared_prefix_dir(Path::new("/home/alice/zeppbridge")));
        assert!(!is_shared_prefix_dir(Path::new("/data")));
        // 前缀匹配是按整段目录名比的，`/usrlocal` 不是 `/usr` 下面的东西。
        assert!(!is_shared_prefix_dir(Path::new("/usrlocal/bin")));
    }

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
