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
fn app_bundle_takes_priority_even_under_a_build_cache() {
    let path = Path::new("/tmp/target/release/bundle/ZeppBridge.app/Contents/MacOS");
    assert!(is_build_artifact_dir(path));
    assert!(is_inside_app_bundle(path));
    assert!(is_inside_app_bundle(Path::new(
        "/Applications/ZeppBridge.APP/Contents/MacOS"
    )));
    assert!(!is_inside_app_bundle(Path::new(
        "/Applications/Contents/MacOS"
    )));
}

#[test]
fn replacing_the_bundle_preserves_migrated_account_devices_and_library() {
    let root = std::env::temp_dir().join(format!(
        "bundle-update-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    let bundle = root.join("ZeppBridge.app");
    let source = bundle.join("Contents/MacOS/data");
    let executable = bundle.join("Contents/MacOS/zeppbridge");
    let destination = root.join("Application Support/data");
    fs::create_dir_all(&source).unwrap();
    fs::write(&executable, b"old executable").unwrap();
    let db = rusqlite::Connection::open(source.join("zepp.db")).unwrap();
    db.execute_batch("CREATE TABLE sample(value); INSERT INTO sample VALUES (42);")
        .unwrap();
    drop(db);
    fs::write(source.join("auth.json"), b"account metadata").unwrap();
    fs::write(source.join("auth.user-id"), b"test-account").unwrap();
    fs::write(source.join("devices.json"), b"paired devices").unwrap();
    assert!(validate_update_data_location(&source, &executable).is_err());
    migrate_bundle_data(&source, &destination).unwrap();
    validate_update_data_location(&destination, &executable).unwrap();
    fs::remove_dir_all(&bundle).unwrap();
    fs::create_dir_all(executable.parent().unwrap()).unwrap();
    fs::write(&executable, b"new executable").unwrap();
    migrate_bundle_data(&source, &destination).unwrap();
    validate_update_data_location(&destination, &executable).unwrap();
    for (name, expected) in [
        ("auth.json", "account metadata"),
        ("auth.user-id", "test-account"),
        ("devices.json", "paired devices"),
    ] {
        assert_eq!(
            fs::read_to_string(destination.join(name)).unwrap(),
            expected
        );
    }
    let db = rusqlite::Connection::open(destination.join("zepp.db")).unwrap();
    assert_eq!(
        db.query_row("SELECT value FROM sample", [], |row| row.get::<_, i64>(0))
            .unwrap(),
        42
    );
    drop(db);
    fs::remove_dir_all(root).unwrap();
}

#[cfg(unix)]
#[test]
fn updater_rejects_a_data_symlink_into_the_bundle() {
    let root = std::env::temp_dir().join(format!("bundle-update-symlink-{}", std::process::id()));
    let executable = root.join("ZeppBridge.app/Contents/MacOS/zeppbridge");
    let data = executable.parent().unwrap().join("data");
    fs::create_dir_all(&data).unwrap();
    fs::write(&executable, b"exe").unwrap();
    let alias = root.join("external-data");
    std::os::unix::fs::symlink(&data, &alias).unwrap();
    assert!(validate_update_data_location(&alias, &executable).is_err());
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn bundle_migration_copies_live_wal_and_preserves_existing_library() {
    let root = std::env::temp_dir().join(format!(
        "bundle-copy-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    let source = root.join("ZeppBridge.app/Contents/MacOS/data");
    let destination = root.join("support/data");
    fs::create_dir_all(&source).unwrap();
    let db = rusqlite::Connection::open(source.join("zepp.db")).unwrap();
    db.execute_batch(
        "PRAGMA journal_mode=WAL; CREATE TABLE sample(value); INSERT INTO sample VALUES (42);",
    )
    .unwrap();
    fs::write(source.join("auth.json"), b"test-account").unwrap();
    fs::create_dir(source.join("backups")).unwrap();
    fs::write(source.join("backups/saved"), b"backup").unwrap();
    migrate_bundle_data(&source, &destination).unwrap();
    let copied = rusqlite::Connection::open(destination.join("zepp.db")).unwrap();
    assert_eq!(
        copied
            .query_row("SELECT value FROM sample", [], |row| row.get::<_, i64>(0))
            .unwrap(),
        42
    );
    assert!(source.join("zepp.db").exists());
    assert_eq!(
        fs::read(destination.join("backups/saved")).unwrap(),
        b"backup"
    );
    fs::write(source.join("auth.json"), b"different-account").unwrap();
    migrate_bundle_data(&source, &destination).unwrap();
    assert_eq!(
        fs::read(destination.join("auth.json")).unwrap(),
        b"test-account"
    );
    drop(copied);
    drop(db);
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn bundle_migration_refuses_to_mix_partial_destination() {
    let root = std::env::temp_dir().join(format!("bundle-conflict-{}", std::process::id()));
    let source = root.join("source");
    let destination = root.join("destination");
    fs::create_dir_all(&source).unwrap();
    fs::create_dir_all(&destination).unwrap();
    fs::write(destination.join("auth.json"), b"existing-account").unwrap();
    assert!(migrate_bundle_data(&source, &destination).is_err());
    assert_eq!(
        fs::read(destination.join("auth.json")).unwrap(),
        b"existing-account"
    );
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn bundle_migration_tolerates_finder_junk_and_leftover_logs() {
    // `.DS_Store` / `logs/` / `webview/` / 半拉子 staging 都不是用户数据。
    // 它们不该把迁移卡死——macOS 那次启动失败连对话框都没有。
    let root = std::env::temp_dir().join(format!(
        "bundle-junk-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    let source = root.join("source");
    let destination = root.join("destination");
    fs::create_dir_all(&source).unwrap();
    fs::write(source.join("auth.json"), b"account").unwrap();
    fs::create_dir_all(&destination).unwrap();
    fs::write(destination.join(".DS_Store"), b"junk").unwrap();
    fs::create_dir_all(destination.join("logs")).unwrap();
    fs::write(destination.join("logs/zeppbridge.log"), b"last crash log").unwrap();
    fs::create_dir_all(destination.join("webview")).unwrap();
    fs::create_dir_all(root.join(".bundle-migration-999-0")).unwrap();
    migrate_bundle_data(&source, &destination).unwrap();
    assert_eq!(fs::read(destination.join("auth.json")).unwrap(), b"account");
    // 旧目录没删，被挪到了旁边——logs 里的崩溃记录还找得回来。
    let aside: Vec<_> = fs::read_dir(&root)
        .unwrap()
        .filter_map(|entry| entry.ok())
        .filter(|entry| {
            entry
                .file_name()
                .to_string_lossy()
                .starts_with(".pre-migration-")
        })
        .collect();
    assert_eq!(aside.len(), 1, "旧目标应当整体挪到旁边而不是被删");
    assert_eq!(
        fs::read(aside[0].path().join("logs/zeppbridge.log")).unwrap(),
        b"last crash log"
    );
    assert!(
        !root.join(".bundle-migration-999-0").exists(),
        "上次崩掉的半成品应当被清走"
    );
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn bundle_migration_falls_back_to_file_copy_when_the_source_db_wont_open() {
    // 源库损坏不该让整个迁移失败：文件级拷贝把库原样带过去，
    // open_resilient 的隔离流程照常接手。
    let root = std::env::temp_dir().join(format!(
        "bundle-corrupt-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    let source = root.join("source");
    let destination = root.join("destination");
    fs::create_dir_all(&source).unwrap();
    fs::write(source.join("zepp.db"), b"this is not sqlite").unwrap();
    fs::write(source.join("auth.json"), b"account").unwrap();
    migrate_bundle_data(&source, &destination).unwrap();
    assert_eq!(
        fs::read(destination.join("zepp.db")).unwrap(),
        b"this is not sqlite"
    );
    assert_eq!(fs::read(destination.join("auth.json")).unwrap(), b"account");
    fs::remove_dir_all(root).unwrap();
}

#[cfg(unix)]
#[test]
fn bundle_migration_recreates_symlinks_instead_of_failing() {
    // 老版本允许 `data/backups -> /外置盘/backups` 这种链接，遇到它不能
    // 整个启动失败；迁过去的是链接本身，目标里的东西原地不动。
    let root = std::env::temp_dir().join(format!(
        "bundle-link-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    let source = root.join("source");
    let destination = root.join("destination");
    let external = root.join("external-backups");
    fs::create_dir_all(&source).unwrap();
    fs::create_dir_all(&external).unwrap();
    fs::write(external.join("saved"), b"backup").unwrap();
    std::os::unix::fs::symlink(&external, source.join("backups")).unwrap();
    fs::write(source.join("auth.json"), b"account").unwrap();
    migrate_bundle_data(&source, &destination).unwrap();
    let link = destination.join("backups");
    assert!(
        fs::symlink_metadata(&link)
            .unwrap()
            .file_type()
            .is_symlink(),
        "迁过去的应当是链接而不是复制出来的目录"
    );
    assert_eq!(fs::read_link(&link).unwrap(), external);
    assert_eq!(fs::read(link.join("saved")).unwrap(), b"backup");
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn an_app_suffixed_directory_without_contents_is_not_a_bundle() {
    // Windows 上 `D:\tools.app\release\` 这种路径会撞见一个名字以 .app
    // 结尾的祖先目录——它不是 macOS bundle，不该触发「数据在包里」拒装。
    let root = std::env::temp_dir().join(format!(
        "fake-bundle-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    let exe_dir = root.join("tools.app").join("release");
    let data = exe_dir.join("data");
    fs::create_dir_all(&data).unwrap();
    let executable = exe_dir.join("zeppbridge.exe");
    fs::write(&executable, b"exe").unwrap();
    fs::write(data.join("zepp.db"), b"db").unwrap();
    validate_update_data_location(&data, &executable)
        .expect("没有 Contents/ 的 .app 目录不是 bundle，不该拒装");
    fs::remove_dir_all(root).unwrap();
}

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
        r"G:\build_cache\cargo-target-v3\debug"
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
    fs::write(source.join("restore-pending.json"), b"{\"id\":1}").unwrap();
    fs::write(source.join("local-api.json"), b"{\"enabled\":true}").unwrap();
    fs::write(source.join("credentials.json"), b"{}").unwrap();
    fs::create_dir_all(source.join("exports")).unwrap();
    fs::write(source.join("exports").join("a.json"), b"[]").unwrap();

    relocate_from(&source, &dest).unwrap();
    assert_eq!(fs::read(dest.join("zepp.db")).unwrap(), b"db");
    assert_eq!(fs::read(dest.join("auth.json")).unwrap(), b"{}");
    assert_eq!(
        fs::read(dest.join("restore-pending.json")).unwrap(),
        b"{\"id\":1}"
    );
    assert_eq!(
        fs::read(dest.join("local-api.json")).unwrap(),
        b"{\"enabled\":true}"
    );
    assert_eq!(fs::read(dest.join("credentials.json")).unwrap(), b"{}");
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

#[test]
fn atomic_write_replaces_an_existing_file() {
    let dir = std::env::temp_dir().join(format!(
        "zeppbridge-atomic-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    fs::create_dir_all(&dir).unwrap();
    let path = dir.join("out.json");
    fs::write(&path, b"old").unwrap();
    write_file_atomically(&path, b"new-content").unwrap();
    assert_eq!(fs::read(&path).unwrap(), b"new-content");
    let leftovers: Vec<_> = fs::read_dir(&dir)
        .unwrap()
        .filter_map(|entry| entry.ok())
        .filter(|entry| {
            entry
                .file_name()
                .to_string_lossy()
                .starts_with(".out.json.tmp-")
        })
        .collect();
    assert!(leftovers.is_empty(), "temp file was left behind");
    let _ = fs::remove_dir_all(dir);
}
