//! `fit-override`（#143）：同一条命令能在每台电脑上脚本化地顶替、列出、撤销。
//! 修正文件就用 `export --format fit` 导出来的那份，不另造二进制夹具。

use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Output};

use chrono::{Duration, TimeZone, Utc};
use serde_json::{json, Value};
use zeppbridge_core::decoder::workout_detail::WorkoutSample;
use zeppbridge_core::decoder::DecodedWorkout;
use zeppbridge_core::models::Workout;
use zeppbridge_core::storage::Database;

struct Fixture(PathBuf);

impl Fixture {
    fn new() -> Self {
        let dir = std::env::temp_dir().join(format!(
            "zeppbridge-fit-override-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir(&dir).unwrap();
        let db = Database::open_migrated(&dir.join("zepp.db")).unwrap();
        let start = Utc.with_ymd_and_hms(2026, 10, 1, 6, 0, 0).unwrap();
        // 第二条比第一条晚一小时：拿第一条的 .fit 去顶它，起点对不上。
        for (id, offset) in [("run-a", 0), ("run-b", 60)] {
            let start = start + Duration::minutes(offset);
            let end = start + Duration::minutes(30);
            let workout: Workout = serde_json::from_value(json!({
                "workout_id": id,
                "workout_type": "outdoor_running",
                "normalized_type": "outdoor_running",
                "type_source": "string_field",
                "effective_type": "outdoor_running",
                "start_time": start,
                "end_time": end,
                "distance_meters": 5000.0,
                "source_scope": "device",
            }))
            .unwrap();
            db.insert_workout(&workout).unwrap();
            let mut decoded = DecodedWorkout {
                start_time: start,
                end_time: end,
                ..Default::default()
            };
            for second in [0, 60, 120] {
                decoded.samples.push(
                    serde_json::from_value::<WorkoutSample>(json!({
                        "timestamp": start + Duration::seconds(second),
                        "heart_rate": 140
                    }))
                    .unwrap(),
                );
            }
            db.replace_workout_series(id, &decoded).unwrap();
        }
        Self(dir)
    }

    fn run(&self, args: &[&str]) -> Output {
        Command::new(env!("CARGO_BIN_EXE_zeppbridge-cli"))
            .args(args)
            .env("ZEPPBRIDGE_DATA_DIR", &self.0)
            .output()
            .unwrap()
    }

    fn json(&self, args: &[&str]) -> (Output, Value) {
        let output = self.run(args);
        let value = serde_json::from_slice(&output.stdout).unwrap_or(Value::Null);
        (output, value)
    }

    /// 用 CLI 自己导出 run-a 的 .fit，当作「修正过的文件」。
    fn exported_fit(&self) -> PathBuf {
        let out = self.0.join("fit-out");
        fs::create_dir_all(&out).unwrap();
        let output = self.run(&[
            "export",
            "--format",
            "fit",
            "--workout",
            "run-a",
            "--out",
            out.to_str().unwrap(),
        ]);
        assert!(output.status.success(), "{output:?}");
        first_fit(&out)
    }
}

fn first_fit(dir: &Path) -> PathBuf {
    fs::read_dir(dir)
        .unwrap()
        .map(|entry| entry.unwrap().path())
        .find(|path| path.extension().is_some_and(|ext| ext == "fit"))
        .expect("export --format fit 应当写出一个 .fit")
}

impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

#[test]
fn replace_list_and_undo_round_trip() {
    let fixture = Fixture::new();
    let fit = fixture.exported_fit();
    let fit = fit.to_str().unwrap();

    let (output, value) =
        fixture.json(&["fit-override", "--workout", "run-a", "--fit", fit, "--json"]);
    assert!(output.status.success(), "{output:?}");
    assert_eq!(value["applied"], true);
    assert_eq!(value["override"]["workoutId"], "run-a");

    let (output, value) = fixture.json(&["fit-override", "--list", "--json"]);
    assert!(output.status.success(), "{output:?}");
    let list = value["overrides"].as_array().unwrap();
    assert_eq!(list.len(), 1);
    assert_eq!(list[0]["workoutId"], "run-a");

    let (output, value) =
        fixture.json(&["fit-override", "--workout", "run-a", "--remove", "--json"]);
    assert!(output.status.success(), "{output:?}");
    assert_eq!(value["removed"], true);
    // 再撤一次：没有可撤的，照样成功，脚本重跑不该报错。
    let (output, value) =
        fixture.json(&["fit-override", "--workout", "run-a", "--remove", "--json"]);
    assert!(output.status.success(), "{output:?}");
    assert_eq!(value["removed"], false);
    let (_, value) = fixture.json(&["fit-override", "--list", "--json"]);
    assert_eq!(value["overrides"].as_array().unwrap().len(), 0);
}

#[test]
fn refuses_a_fit_that_is_not_the_same_workout_and_bad_usage() {
    let fixture = Fixture::new();
    let fit = fixture.exported_fit();
    let fit = fit.to_str().unwrap();

    let (output, value) =
        fixture.json(&["fit-override", "--workout", "run-b", "--fit", fit, "--json"]);
    assert_eq!(output.status.code(), Some(1), "{output:?}");
    assert_eq!(value["errorKind"], "fit_start_mismatch");

    let (output, value) = fixture.json(&[
        "fit-override",
        "--workout",
        "missing",
        "--fit",
        fit,
        "--json",
    ]);
    assert_eq!(output.status.code(), Some(1), "{output:?}");
    assert_eq!(value["errorKind"], "workout_not_found");

    // 两种形式混用、或者什么都不给，都是用法错误（2），不是「失败」。
    for args in [
        &["fit-override", "--list", "--remove", "--json"][..],
        &["fit-override", "--workout", "run-a", "--json"][..],
    ] {
        let (output, value) = fixture.json(args);
        assert_eq!(output.status.code(), Some(2), "{args:?}: {output:?}");
        assert_eq!(value["errorKind"], "usage");
    }
    // 失败的那几次一条也没写进去。
    let (_, value) = fixture.json(&["fit-override", "--list", "--json"]);
    assert_eq!(value["overrides"].as_array().unwrap().len(), 0);
}
