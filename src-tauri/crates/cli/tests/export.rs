use std::process::Command;

#[test]
fn invalid_export_arguments_return_json_usage_errors_before_opening_a_database() {
    let missing_data_dir = std::env::temp_dir().join(format!(
        "zeppbridge-export-usage-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    assert!(!missing_data_dir.exists());

    let cases: &[&[&str]] = &[
        &["--json", "--form", "csv"],
        &["--form", "csv", "--json"],
        &["unexpected", "--json"],
        &["--json", "unexpected", "--workout", "run-1"],
        &["--json=false", "--workout", "run-1"],
        &["--workout", "run-1", "--format", "--json"],
        &["--workout", "run-1", "--types", "--json"],
        &["--workout", "run-1", "--detail", "--json"],
        &["--workout", "run-1", "--out", "--json"],
        &["--workout", "run-1", "--from", "--json"],
        &["--workout", "run-1", "--to", "--json"],
        &[
            "--from",
            "2026-01-01",
            "--to",
            "2026-01-31",
            "--workout",
            "--json",
        ],
        &["--workout", "run-1", "--types=", "--json"],
        &["--workout", "run-1", "--types", ", ,", "--json"],
        &["--workout", "run-1", "--types", "workouts,typo", "--json"],
        &[
            "--workout",
            "run-1",
            "--format",
            "json",
            "--format",
            "bogus",
            "--json",
        ],
        &[
            "--workout",
            "run-1",
            "--out",
            "first.json",
            "--out",
            "second.json",
            "--json",
        ],
        &["--workout", "run-1", "--json", "--json"],
        &["--workout", "run-1", "--format", "fit", "--json"],
        &["--from", "invalid", "--to", "2026-01-31", "--json"],
    ];

    for args in cases {
        let output = Command::new(env!("CARGO_BIN_EXE_zeppbridge-cli"))
            .arg("export")
            .args(*args)
            .env("ZEPPBRIDGE_DATA_DIR", &missing_data_dir)
            .output()
            .unwrap();
        assert_eq!(output.status.code(), Some(2), "{args:?}: {output:?}");
        let payload: serde_json::Value = serde_json::from_slice(&output.stdout)
            .unwrap_or_else(|error| panic!("{args:?}: {error}; {output:?}"));
        assert_eq!(payload["ok"], false, "{args:?}");
        assert_eq!(payload["errorKind"], "usage", "{args:?}");
        assert!(!payload["message"].as_str().unwrap().is_empty());
        assert!(output.stderr.is_empty(), "{args:?}: {output:?}");
        assert!(
            !missing_data_dir.exists(),
            "{args:?}: invalid arguments reached data directory initialization"
        );
    }
}
