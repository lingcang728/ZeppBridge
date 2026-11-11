use super::*;

/// 每个用例一个空目录（同 ai_clients 的测试，不为这几条引入 tempfile）。
struct Scratch(PathBuf);
impl Scratch {
    fn new(name: &str) -> Self {
        let dir = std::env::temp_dir().join(format!("zb-cloud-{name}-{}", std::process::id()));
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

fn input(site: &str) -> CloudConfigInput {
    CloudConfigInput {
        site: site.to_string(),
        bin_dir: None,
        data_dir: None,
        sync: false,
        retention_days: 90,
        summary_days: 30,
        full_resolution_workouts: false,
        uploader_dir: None,
    }
}

/// 站点规则要和组件自己的一致：界面显示的地址、「打开站点」开的地址都从这里来，
/// 算岔了就是把人带到一个不是他站点的地方。
#[test]
fn site_rules_match_the_uploader() {
    for (given, expected) in [
        ("example.com", Some("https://health.example.com")),
        ("health.example.com", Some("https://health.example.com")),
        ("Example.COM.", Some("https://health.example.com")),
        (
            "https://data.example.com/",
            Some("https://data.example.com"),
        ),
        ("https://health.x.com/v1", Some("https://health.x.com")),
        (
            "https://health.x.com:8443/api/",
            Some("https://health.x.com:8443/api"),
        ),
        ("http://example.com", None),
        ("https://user:pw@example.com", None),
        ("https://example.com/?a=1", None),
        ("example.com/path", None),
        ("192.168.1.2", None),
        ("https://192.168.1.2", None),
        ("localhost", None),
        ("", None),
    ] {
        assert_eq!(normalize_site(given).as_deref(), expected, "site {given:?}");
    }
}

/// 组件以后加的字段、用户手写的字段不能被「保存」冲掉；校验不过时原文件一个字节都不动。
#[test]
fn saving_keeps_unknown_fields_and_refuses_bad_input_without_writing() {
    let dir = Scratch::new("save");
    let path = dir.path().join("config.json");
    let original =
        r#"{"endpoint":"https://health.old.example/v1","snapshotBin":"C:\\snap.exe","sync":true}"#;
    std::fs::write(&path, original).unwrap();

    for bad in [
        input("http://example.com"),
        CloudConfigInput {
            retention_days: 0,
            ..input("example.com")
        },
    ] {
        assert!(save_config(dir.path(), &bad).is_err());
        assert_eq!(std::fs::read_to_string(&path).unwrap(), original);
    }
    let missing_cli = CloudConfigInput {
        bin_dir: Some(dir.path().to_string_lossy().into_owned()),
        ..input("example.com")
    };
    assert_eq!(
        save_config(dir.path(), &missing_cli).unwrap_err().code,
        "err.cloud.bin_dir_invalid"
    );
    assert_eq!(std::fs::read_to_string(&path).unwrap(), original);

    let good = CloudConfigInput {
        summary_days: 120,
        ..input("example.com")
    };
    save_config(dir.path(), &good).unwrap();
    let ConfigFile::Found(saved) = read_config_file(dir.path()) else {
        panic!("config should be readable after saving");
    };
    assert_eq!(saved["snapshotBin"], "C:\\snap.exe");
    assert_eq!(saved["site"], "example.com");
    assert!(!saved.contains_key("endpoint"), "旧字段让位给 site");
    assert_eq!(saved["sync"], false);
    // 摘要天数不能比保留天数长（组件自己也这么收）。
    assert_eq!(saved["summaryDays"], 90);
}

/// 坏掉的 config.json 不许被当成「没配置过」盖掉。
#[test]
fn an_unreadable_config_is_reported_and_never_overwritten() {
    let dir = Scratch::new("broken");
    let path = dir.path().join("config.json");
    std::fs::write(&path, "{ not json").unwrap();
    let state = state_from_files(dir.path(), None);
    assert!(state.config_unreadable);
    assert!(!state.configured);
    assert_eq!(
        save_config(dir.path(), &input("example.com"))
            .unwrap_err()
            .code,
        "err.cloud.config_unreadable"
    );
    assert_eq!(std::fs::read_to_string(&path).unwrap(), "{ not json");
}

/// 状态只带名字和时间：密钥哈希不出主程序；没装过的人是「没配置」，不是报错。
#[test]
fn state_reads_the_component_files_without_leaking_reader_hashes() {
    let empty = Scratch::new("empty");
    let none = state_from_files(empty.path(), None);
    assert!(!none.configured && !none.config_unreadable && none.last_run.is_none());

    let dir = Scratch::new("state");
    std::fs::write(
        dir.path().join("config.json"),
        "\u{feff}{\"site\":\"example.com\",\"retentionDays\":30}",
    )
    .unwrap();
    std::fs::write(
        dir.path().join("last-run.json"),
        r#"{"at":"2026-11-10T23:41:46.312Z","mode":"follow","result":"skipped_busy","exit_code":0,"message":"yield"}"#,
    )
    .unwrap();
    std::fs::write(
        dir.path().join("readers.json"),
        r#"[{"label":"hark","hash":"deadbeefcafe","created_at":"2026-11-04T03:37:00Z"}]"#,
    )
    .unwrap();
    let state = state_from_files(dir.path(), None);
    assert!(state.configured);
    assert_eq!(
        state.site_url.as_deref(),
        Some("https://health.example.com")
    );
    let config = state.config.clone().unwrap();
    assert_eq!((config.retention_days, config.summary_days), (30, 30));
    assert_eq!(state.last_run.as_ref().unwrap().result, "skipped_busy");
    assert_eq!(state.readers[0].label, "hark");
    assert!(!serde_json::to_string(&state).unwrap().contains("deadbeef"));
}

/// 组件在哪：从计划任务的 XML 里认出来，但只认真有那三个脚本的文件夹。
#[test]
fn the_uploader_is_found_from_the_scheduled_task_only_when_it_exists() {
    let dir = Scratch::new("locate");
    let uploader = dir.path().join("uploader");
    std::fs::create_dir_all(&uploader).unwrap();
    let xml = |folder: &Path| {
        format!(
            "<Arguments>--headless &quot;C:\\Program Files\\PowerShell\\7\\pwsh.exe&quot; -NoProfile -File &quot;{}\\run.ps1&quot; -Follow</Arguments>",
            folder.display()
        )
    };
    assert_eq!(
        script_dir_in(&xml(&uploader), "run.ps1").as_deref(),
        Some(uploader.as_path())
    );
    // 任务还指着一个已经搬走的文件夹：不认。
    assert!(state_from_files(dir.path(), Some(&xml(&uploader)))
        .uploader_dir
        .is_none());
    for name in ["run.ps1", "setup.ps1", "upload.mjs"] {
        std::fs::write(uploader.join(name), "").unwrap();
    }
    let state = state_from_files(dir.path(), Some(&xml(&uploader)));
    assert_eq!(
        state.uploader_dir.as_deref(),
        Some(uploader.to_string_lossy().as_ref())
    );
    assert!(state.task_follow);
}

/// 名字会进命令行和凭据条目名：带空格、分号、以 `-` 开头的都不收。
#[test]
fn reader_labels_cannot_smuggle_arguments() {
    for ok in ["hark", "muse-2", "Phone_1"] {
        assert!(valid_label(ok), "{ok}");
    }
    for bad in [
        "",
        "-StateDir",
        "a b",
        "a;b",
        "名字",
        "x\"y",
        &"a".repeat(33),
    ] {
        assert!(!valid_label(bad), "{bad}");
    }
}
