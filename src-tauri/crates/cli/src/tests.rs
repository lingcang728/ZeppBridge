use super::*;

#[test]
fn cli_error_fallback_redacts_request_urls() {
    for url in [
        "https://api-mifit.huami.com/users/private-user?token=private-token",
        "http://localhost/users/private-user?token=private-token",
    ] {
        for error in [
            ZeppBridgeError::ConfigError(format!("request failed ({url})")),
            ZeppBridgeError::AuthError(format!("request failed ({url})")),
            ZeppBridgeError::DataUnavailable(format!("request failed ({url})")),
            ZeppBridgeError::Unknown(format!("request failed ({url})")),
            ZeppBridgeError::HttpStatus {
                status: 503,
                message: url.into(),
            },
        ] {
            let text = user_text(&error);
            assert!(!text.is_empty());
            for secret in [url, "private-user", "private-token"] {
                assert!(!text.contains(secret), "{text}");
            }
        }
    }
}

#[test]
fn sync_report_output_reports_failed_streams_without_discarding_results() {
    use zeppbridge_core::models::CapabilityStatus;
    use zeppbridge_core::sync::{StreamReport, StreamStatus};
    for status in [
        StreamStatus::Failed,
        StreamStatus::Unavailable,
        StreamStatus::Unverified,
        StreamStatus::Success,
    ] {
        let success = status != StreamStatus::Failed;
        let report = SyncReport {
            cleanup_failed: false,
            success,
            core_ok: true,
            records_written: 12,
            message: Some("report detail".into()),
            streams: vec![
                StreamReport {
                    stream: "sleep".into(),
                    status,
                    records_written: 0,
                    raw_records: 1,
                    capability: CapabilityStatus::Verified,
                    needs_reauth: false,
                    message: Some("stream detail".into()),
                },
                StreamReport {
                    stream: "heart_rate".into(),
                    status: StreamStatus::Success,
                    records_written: 12,
                    raw_records: 1,
                    capability: CapabilityStatus::Verified,
                    needs_reauth: false,
                    message: None,
                },
            ],
        };
        let (code, payload, human) = sync_report_output(&report, "incremental", None);
        assert_eq!(code, if success { 0 } else { 8 });
        assert_eq!(payload["ok"], success);
        assert_eq!(payload["success"], success);
        assert_eq!(payload["recordsWritten"], 12);
        assert_eq!(payload["streams"][0]["message"], "stream detail");
        assert_eq!(payload["streams"][1]["recordsWritten"], 12);
        assert_eq!(human.contains("partly failed"), !success);
    }
}

fn args(values: &[&str]) -> Vec<String> {
    values.iter().map(|value| value.to_string()).collect()
}

/// 每一种错误都要能渲染出一句话，并且**渲染这件事本身要结束**。
///
/// 之前 `user_text` 的回落分支写成了 `user_text(other)`——同一个值再传给
/// 自己，无条件自递归。release 把尾调用优化成循环，于是命令行不是崩掉而是
/// 100% CPU 空转、永不返回：`export --types food`、非法日期、不存在的
/// `--workout`，凡是数据库打开之后抛出来的错误，全都卡死在这里，而退出码
/// 是写进文档的契约，调度脚本会永远挂着。
///
/// 只有 `Headless` 那一支会返回，所以 `status` 报「库还是 v20」看起来是好的
/// ——这也是它躲过人工验收的原因。这个用例走的是**非** Headless 的那些支。
#[test]
fn every_error_renders_and_terminates() {
    // 卡死时这个用例会挂住而不是失败，那也是信号：CI 超时即回归。
    let cases = vec![
        ZeppBridgeError::ConfigError("请至少选择一种导出数据".into()),
        ZeppBridgeError::AuthError("令牌读不出来".into()),
        ZeppBridgeError::DataUnavailable("本地库里没有这条运动记录".into()),
        ZeppBridgeError::Cancelled,
        ZeppBridgeError::HttpStatus {
            status: 503,
            message: "维护中".into(),
        },
    ];
    for error in &cases {
        let text = user_text(error);
        assert!(
            !text.trim().is_empty(),
            "{error:?} 渲染成了空字符串——命令行会印出一片空白"
        );
    }
}

#[test]
fn a_misspelled_flag_is_a_usage_error_not_a_silent_default() {
    let flags = Flags::parse(&args(&["--form", "csv"])).unwrap();
    assert!(flags.reject_unknown(&["format"]).is_err());
}

#[test]
fn export_defaults_include_daily_activity_and_keep_json_summary() {
    let options =
        parse_export_args(&args(&["--from", "2026-01-01", "--to", "2026-01-31"])).unwrap();
    assert_eq!(options.format, "json");
    assert_eq!(options.out, None);
    assert_eq!(
        options.selection.data_types,
        ["workouts", "daily_activity", "sleep"]
    );
    assert_eq!(options.selection.detail, ExportDetail::Summary);
    assert_eq!(
        options.selection.scope,
        Some(ExportScope::date_range("2026-01-01", "2026-01-31"))
    );
    for data_type in &options.selection.data_types {
        assert!(EXPORT_DATA_TYPES.contains(&data_type.as_str()));
    }
}

#[test]
fn archival_formats_always_request_full_detail() {
    for format in ["csv", "gpx", "fit"] {
        for detail in [None, Some("summary"), Some("full")] {
            let mut input = args(&[
                "--workout",
                "run-1",
                "--format",
                format,
                "--out",
                "export-output",
            ]);
            if let Some(detail) = detail {
                input.extend(args(&["--detail", detail]));
            }
            let options = parse_export_args(&input).unwrap();
            assert_eq!(options.selection.detail, ExportDetail::Full, "{format}");
            assert_eq!(
                options.selection.scope,
                Some(ExportScope::Workout {
                    workout_id: "run-1".into(),
                })
            );
        }
    }
    let options = parse_export_args(&args(&[
        "--workout",
        "run-1",
        "--format",
        "json",
        "--detail",
        "full",
    ]))
    .unwrap();
    assert_eq!(options.selection.detail, ExportDetail::Full);
}

#[test]
fn export_type_validation_uses_the_core_names_and_normalization() {
    let options = parse_export_args(&args(&[
        "--workout=run-1",
        "--types= WORKOUTS , HeArt_RaTe ",
    ]))
    .unwrap();
    assert_eq!(options.selection.data_types, ["workouts", "heart_rate"]);
    for types in ["workouts,typo", "daily", "", "  ", ", ,"] {
        let input = args(&["--workout", "run-1", "--types", types, "--json"]);
        let message = parse_export_args(&input).unwrap_err();
        assert!(message.contains("--types"), "{message}");
        assert_eq!(cmd_export(&input), EXIT_USAGE);
    }
}

#[test]
fn export_refuses_to_pick_a_winner_between_date_range_and_single_workout() {
    // 两种范围同时给出是矛盾请求。定一个优先级只会让人写出
    // 「我以为传了 --workout 就只导这一条」的脚本。
    let code = cmd_export(&args(&[
        "--from",
        "2026-01-01",
        "--to",
        "2026-01-31",
        "--workout",
        "run-1",
        "--json",
    ]));
    assert_eq!(code, EXIT_USAGE);
}

#[test]
fn sync_days_only_makes_sense_for_history_mode() {
    assert_eq!(
        cmd_sync(&args(&["--mode", "incremental", "--days", "30", "--json"])),
        EXIT_USAGE
    );
    assert_eq!(cmd_sync(&args(&["--mode", "nope", "--json"])), EXIT_USAGE);
    assert_eq!(
        cmd_sync(&args(&["--mode", "history", "--days", "99999", "--json"])),
        EXIT_USAGE
    );
}

#[test]
fn reprocess_rejects_flags_it_does_not_understand() {
    // `--force` 看起来很像 `--all`。默默忽略它，用户会以为自己刚做了
    // 一次整库重放，而实际上什么都没做。
    let flags = Flags::parse(&args(&["--force"])).unwrap();
    assert!(flags.reject_unknown(&["json", "all"]).is_err());
    assert_eq!(cmd_reprocess(&args(&["--force", "--json"])), EXIT_USAGE);
}

#[test]
fn sync_accepts_the_escape_hatch_that_skips_the_replay() {
    // 库大、cron 窗口小的人要有办法把重放挪到别的时间去做。开关拼错了
    // 必须报错，否则「我明明关掉了」和「它又跑了四分钟」会同时成立。
    let flags = Flags::parse(&args(&["--no-reprocess"])).unwrap();
    assert!(flags
        .reject_unknown(&["json", "mode", "days", "no-reprocess"])
        .is_ok());
    assert!(flags.has("no-reprocess"));
    let typo = Flags::parse(&args(&["--no-reprocesss"])).unwrap();
    assert!(typo
        .reject_unknown(&["json", "mode", "days", "no-reprocess"])
        .is_err());
}

#[test]
fn the_help_text_names_every_command_that_can_be_run() {
    // 帮助漏掉一条命令，等于那条命令不存在——无交互的程序没有别的
    // 地方能让人发现它。
    for command in ["status", "sync", "reprocess", "export", "contract"] {
        assert!(HELP.contains(command), "帮助里没有 {command}");
    }
}

#[test]
fn unknown_command_and_empty_invocation_both_report_usage() {
    assert_eq!(run(&args(&["frobnicate"])), EXIT_USAGE);
    assert_eq!(run(&[]), EXIT_USAGE);
    assert_eq!(run(&args(&["version"])), EXIT_OK);
    assert_eq!(run(&args(&["contract"])), EXIT_OK);
}

#[test]
fn every_documented_exit_code_is_distinct() {
    // 退出码是对调度脚本的契约：两个不同含义撞到同一个数字，
    // 重试逻辑就没法写。
    let codes = [
        EXIT_OK,
        EXIT_FAILED,
        EXIT_USAGE,
        EXIT_NOT_CONFIGURED,
        EXIT_BUSY,
        EXIT_CLOUD,
        EXIT_DATABASE,
        EXIT_SCHEMA,
        EXIT_INCOMPLETE_SYNC,
    ];
    let mut unique = codes.to_vec();
    unique.sort_unstable();
    unique.dedup();
    assert_eq!(unique.len(), codes.len(), "退出码不能重复");
}

#[test]
fn help_text_documents_every_exit_code_the_binary_can_return() {
    for code in [
        EXIT_OK,
        EXIT_FAILED,
        EXIT_USAGE,
        EXIT_NOT_CONFIGURED,
        EXIT_BUSY,
        EXIT_CLOUD,
        EXIT_DATABASE,
        EXIT_SCHEMA,
        EXIT_INCOMPLETE_SYNC,
    ] {
        assert!(
            HELP.contains(&code.to_string()),
            "退出码 {code} 没有写进 --help"
        );
    }
    // 隐私边界要出现在 help 里，用户不该为了知道它去读源码。
    assert!(HELP.contains("Listens on no port"));
}
/// issue #40 的整整两个小时，就卡在这一句上。
///
/// 那位用户在 `~/ZeppBridge/src-tauri/target/release/` 下跑 CLI，把 data
/// 文件夹放在了 exe 旁边，而程序去仓库根的 `data/` 找——两边都没说话，他
/// 只看到「没有本地数据库」。这里钉的就是「报错必须说出它去哪儿找了」。
#[test]
fn a_not_found_message_always_names_the_directory_it_looked_in() {
    let dir = std::path::Path::new("/home/x/ZeppBridge/data");
    let text = where_it_looked_from(dir, None);
    assert!(text.contains("/home/x/ZeppBridge/data"), "{text}");
    // 用户唯一能拿来固定落点的东西，也要出现。
    assert!(text.contains("ZEPPBRIDGE_DATA_DIR"), "{text}");
}

/// 从构建目录里跑的时候，还要说明数据为什么不在 exe 旁边。
#[test]
fn running_from_a_build_directory_explains_why_data_is_elsewhere() {
    let dir = std::path::Path::new("/home/x/ZeppBridge/data");
    let exe_dir = std::path::Path::new("/home/x/ZeppBridge/src-tauri/target/release");
    let text = where_it_looked_from(dir, Some(exe_dir));
    assert!(text.contains("build"), "要点明这是构建目录：{text}");
    assert!(text.contains("data/"), "要指向仓库的 data/ 目录：{text}");

    // 装好的版本不该看到这段解释——它只会让人困惑。
    let installed = std::path::Path::new("/usr/bin");
    assert!(!where_it_looked_from(dir, Some(installed)).contains("build directory"));
}

/// 缺 `auth.json` 和缺令牌是两件事，不能给同一句话。
///
/// 以前无论缺哪一样都印「请设 ZEPPBRIDGE_CREDENTIAL_STORE=env 并提供
/// ZEPPBRIDGE_APP_TOKEN」——而 issue #40 那位用户两个都设了，缺的是
/// `auth.json`。程序把他刚做过的事又叫他做一遍，来回四轮。
#[test]
fn a_missing_auth_file_is_reported_as_such_not_as_a_missing_token() {
    let dir = std::env::temp_dir().join("zeppbridge-cli-not-connected-test");
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();

    let missing = not_connected_message(&dir);
    assert!(
        missing.contains("auth.json"),
        "要点名缺的是哪个文件：{missing}"
    );
    assert!(
        missing.contains("does not exist"),
        "要说清它不存在，而不是叫人再设一遍环境变量：{missing}"
    );
    // 令牌那一半仍然要讲：库能跨机器拷，令牌不能——这是最容易踩的坑。
    assert!(missing.contains("ZEPPBRIDGE_APP_TOKEN"), "{missing}");

    // auth.json 在了，缺的就是令牌，这时才印原来那句。
    std::fs::write(dir.join("auth.json"), "{}").unwrap();
    let token_missing = not_connected_message(&dir);
    assert!(
        !token_missing.contains("does not exist"),
        "文件在的时候不该再说它不存在：{token_missing}"
    );
    assert!(
        token_missing.contains("ZEPPBRIDGE_CREDENTIAL_STORE"),
        "{token_missing}"
    );
    // 两句都要带上目录。
    assert!(
        token_missing.contains(&dir.display().to_string()),
        "{token_missing}"
    );

    let _ = std::fs::remove_dir_all(&dir);
}
/// 命令行印给人看的那句话必须是英文。
///
/// issue #40 那位 Linux 用户在一个英文命令行上收到了两句中文：
/// 「无法读取系统密钥环…」和「本机数据库还是 v19…」。2.1.2 把命令行**自己**
/// 的文案换成了英文，但从核心冒上来的 `user_message()` 还是中文。
#[test]
fn headless_failures_are_reported_in_english() {
    use zeppbridge_core::models::error::HeadlessProblem;

    let cases = [
        HeadlessProblem::NoCredentialStore {
            detail: "could not read the keyring".into(),
        },
        HeadlessProblem::SchemaUpgradeRequired {
            found: 19,
            required: 21,
        },
        HeadlessProblem::TokenNotInStore,
    ];
    for problem in cases {
        let error = ZeppBridgeError::Headless(problem);
        let text = user_text(&error);
        assert!(
            !text
                .chars()
                .any(|character| ('\u{4e00}'..='\u{9fff}').contains(&character)),
            "命令行不该出现中文：{text}"
        );
        // 中文原文仍然留着，桌面端的中文界面要用它。
        assert!(error
            .user_message()
            .chars()
            .any(|character| ('\u{4e00}'..='\u{9fff}').contains(&character)));
    }
}

/// 「库要先升级」和「拿不到令牌」给调度脚本的应对完全不同，退出码必须分开。
///
/// 前者重试多少次都没用，得先跑一次 reprocess；后者要人把凭据交进来。
#[test]
fn a_schema_upgrade_and_a_missing_token_do_not_share_an_exit_code() {
    use zeppbridge_core::models::error::HeadlessProblem;

    let (schema, _) = exit_code_for(&ZeppBridgeError::Headless(
        HeadlessProblem::SchemaUpgradeRequired {
            found: 19,
            required: 21,
        },
    ));
    let (token, _) = exit_code_for(&ZeppBridgeError::Headless(HeadlessProblem::TokenNotInStore));
    assert_eq!(schema, EXIT_SCHEMA);
    assert_eq!(token, EXIT_NOT_CONFIGURED);
    assert_ne!(schema, token);

    let (no_store, kind) = exit_code_for(&ZeppBridgeError::Headless(
        HeadlessProblem::NoCredentialStore {
            detail: "no dbus".into(),
        },
    ));
    assert_eq!(no_store, EXIT_NOT_CONFIGURED);
    assert_eq!(kind, "auth");
    assert_ne!(no_store, EXIT_FAILED);
}
