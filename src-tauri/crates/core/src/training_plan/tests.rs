//! 训练计划的纯函数门禁：书写格式读对、该挡的挡住、报文长成官方要的样子、
//! 发送结局不把「不知道」当成「成功」。

use super::parse::{parse_duration, parse_target};
use super::publish::classify;
use super::v2::{window_body, NumberedWorkout};
use super::window::{preview, DayChange, Window};
use super::*;
use crate::models::ZeppBridgeError;
use crate::storage::training_plan::SendOutcome;
use serde_json::json;

fn day(text: &str) -> NaiveDate {
    NaiveDate::parse_from_str(text, "%Y-%m-%d").unwrap()
}

fn context() -> PlanContext {
    PlanContext {
        today: day("2026-10-02"),
        max_hr: Some(190),
    }
}

fn document(value: serde_json::Value) -> PlanDocument {
    serde_json::from_value(value).unwrap()
}

fn easy_run(date: &str) -> serde_json::Value {
    json!({
        "date": date, "sport": "running", "name": "轻松跑",
        "steps": [
            { "kind": "warmup", "duration": "10min", "target": "hr 110-130" },
            { "repeat": 3, "steps": [
                { "kind": "interval", "duration": "3min", "target": "hr 160-172" },
                { "kind": "recovery", "duration": "90s", "target": "hr 120-140" }
            ]},
            { "kind": "cooldown", "duration": "5min", "target": "hr 100-125" }
        ]
    })
}

#[test]
fn short_units_mean_what_runners_write() {
    // 400m 是 400 米，不是 400 分钟；分钟一律写 min。
    assert_eq!(
        parse_duration("400m"),
        Some(StepLength::Distance { meters: 400 })
    );
    assert_eq!(
        parse_duration("20min"),
        Some(StepLength::Time { seconds: 1200 })
    );
    assert_eq!(
        parse_duration("1.5h"),
        Some(StepLength::Time { seconds: 5400 })
    );
    assert_eq!(
        parse_duration("2.5 km"),
        Some(StepLength::Distance { meters: 2500 })
    );
    assert_eq!(
        parse_duration("90s"),
        Some(StepLength::Time { seconds: 90 })
    );
    for bad in ["20", "min", "-5min", "5 laps", "0s", "nanmin"] {
        assert_eq!(parse_duration(bad), None, "{bad}");
    }
    assert_eq!(
        parse_target(Some("pace 5:50-5:30")),
        Some(Target::Pace {
            fast: 330,
            slow: 350
        })
    );
    assert_eq!(parse_target(Some("pace 5:75-6:00")), None);
    assert_eq!(parse_target(None), Some(Target::Open));
    assert_eq!(parse_target(Some("zone 3")), None);
}

#[test]
fn a_verified_plan_parses_cleanly_and_counts_its_time() {
    let check = check_plan(
        &document(json!({ "workouts": [easy_run("2026-10-03")] })),
        context(),
    );
    assert!(check.issues.is_empty(), "{:?}", check.issues);
    assert!(check.publishable());
    assert_eq!(
        (check.from, check.to),
        (Some(day("2026-10-03")), Some(day("2026-10-03")))
    );
    // 10 + 3×(3+1.5) + 5 分钟
    assert_eq!(check.workouts[0].total_seconds(), Some(1710));
}

#[test]
fn writing_mistakes_block_publishing_and_name_where_they_are() {
    let mut bad = easy_run("2026-10-01");
    bad["steps"][1]["steps"][0]["target"] = json!("hr 160-205");
    bad["steps"][2]["duration"] = json!("5 minutes");
    let check = check_plan(&document(json!({ "workouts": [bad] })), context());
    assert!(!check.publishable());
    assert!(check.workouts.is_empty(), "写错的训练一条都不能进可发列表");
    let codes: Vec<(&str, Option<&str>)> = check
        .issues
        .iter()
        .map(|issue| (issue.message_code, issue.step.as_deref()))
        .collect();
    assert!(codes.contains(&("ui.training_plan.issue.past_date", None)));
    assert!(codes.contains(&("ui.training_plan.issue.hr_out_of_range", Some("2.1"))));
    assert!(codes.contains(&("ui.training_plan.issue.bad_duration", Some("3"))));
}

#[test]
fn unverified_shapes_preview_but_never_publish() {
    let plan = json!({ "workouts": [
        { "date": "2026-10-04", "sport": "running", "name": "节奏跑", "steps": [
            { "kind": "active", "duration": "5km", "target": "pace 5:00-5:10" },
            { "kind": "cooldown", "duration": "10min" }
        ]},
        easy_run("2026-10-04")
    ]});
    let check = check_plan(&document(plan), context());
    assert!(!check.publishable());
    let unverified: Vec<&str> = check
        .issues
        .iter()
        .filter(|issue| issue.severity == Severity::Unverified)
        .map(|issue| issue.message_code)
        .collect();
    for code in [
        "ui.training_plan.issue.distance_unverified",
        "ui.training_plan.issue.pace_unverified",
        "ui.training_plan.issue.open_target_unverified",
    ] {
        assert!(unverified.contains(&code), "{code}: {unverified:?}");
    }
    assert!(check
        .issues
        .iter()
        .all(|i| i.severity == Severity::Unverified));
}

#[test]
fn nested_repeats_and_unknown_fields_are_refused() {
    let nested = json!({ "workouts": [{ "date": "2026-10-03", "sport": "running", "name": "x",
    "steps": [{ "repeat": 2, "steps": [{ "repeat": 2, "steps": [
        { "kind": "interval", "duration": "1min", "target": "hr 150-160" }
    ]}]}]}]});
    let check = check_plan(&document(nested), context());
    assert!(check
        .issues
        .iter()
        .any(|i| i.message_code == "ui.training_plan.issue.nested_repeat"));
    // 认不出的字段不能悄悄丢掉：AI 写了 `distance` 却被忽略，发出去的就不是它想的。
    let typo: Result<PlanDocument, _> = serde_json::from_value(
        json!({ "workouts": [{ "date": "2026-10-03", "sport": "running", "name": "x",
            "steps": [], "distance": "5km" }] }),
    );
    assert!(typo.is_err());
}

#[test]
fn every_issue_carries_a_code_for_its_chinese_fallback() {
    let mut bad = easy_run("2025-01-01");
    bad["sport"] = json!("划船");
    bad["name"] = json!("");
    let check = check_plan(
        &document(json!({ "from": "2026-13-01", "workouts": [bad] })),
        context(),
    );
    let json = serde_json::to_value(&check.issues).unwrap();
    for issue in json.as_array().unwrap() {
        let code = issue["message_code"].as_str().unwrap();
        assert!(code.starts_with("ui.training_plan.issue."), "{code}");
        assert!(issue["message"].as_str().is_some_and(|m| !m.is_empty()));
    }
}

#[test]
fn the_v2_body_is_one_full_window_in_the_documented_shape() {
    let check = check_plan(
        &document(json!({ "workouts": [easy_run("2026-10-03"), easy_run("2026-10-12")] })),
        context(),
    );
    let numbered: Vec<NumberedWorkout> = check
        .workouts
        .into_iter()
        .enumerate()
        .map(|(index, workout)| NumberedWorkout {
            id: 900 + index as i64,
            workout,
        })
        .collect();
    let body = window_body(Window::starting(day("2026-10-02")), &numbered);
    assert_eq!(body["startDate"], "2026-10-02");
    assert_eq!(
        body["endDate"], "2026-10-08",
        "endDate 必须正好是 startDate + 6"
    );
    let workouts = body["workouts"].as_array().unwrap();
    assert_eq!(workouts.len(), 1, "窗口外的训练不能混进来");
    let workout = &workouts[0];
    assert_eq!(workout["workoutId"], 900);
    assert_eq!(workout["workoutDate"], "2026-10-03");
    assert_eq!(workout["sport"], "RUNNING");
    let steps = workout["steps"].as_array().unwrap();
    assert_eq!(
        steps[0],
        json!({ "type": "WorkoutStep", "stepOrder": 1, "intensity": "WARMUP",
                "durationType": "TIME", "durationValue": 600,
                "targetType": "HEART_RATE_LAP", "targetValueLow": 110, "targetValueHigh": 130 })
    );
    assert_eq!(steps[1]["type"], "WorkoutRepeatStep");
    assert_eq!(steps[1]["repeatType"], "REPEAT_UNTIL_STEPS_CMPLT");
    assert_eq!(steps[1]["repeatValue"], 3);
    assert_eq!(steps[1]["steps"][1]["stepOrder"], 2);
    assert_eq!(steps[1]["steps"][1]["durationValue"], 90);
}

#[test]
fn day_preview_names_each_kind_of_change() {
    let workouts = check_plan(
        &document(json!({ "workouts": [easy_run("2026-10-03"), easy_run("2026-10-04")] })),
        context(),
    )
    .workouts;
    let mut renamed = workouts[1].clone();
    renamed.name = "换了".into();
    let days = preview(
        Window::starting(day("2026-10-02")),
        &workouts,
        &[workouts[0].clone(), renamed],
    );
    let changes: Vec<DayChange> = days.iter().map(|d| d.change).collect();
    assert_eq!(changes[0], DayChange::Rest);
    assert_eq!(changes[1], DayChange::Unchanged);
    assert_eq!(changes[2], DayChange::Replaced);
    let removed = preview(Window::starting(day("2026-10-02")), &workouts, &[]);
    assert_eq!(removed[1].change, DayChange::Removed);
}

#[test]
fn success_is_only_delivery_and_doubt_is_never_success() {
    assert_eq!(
        classify(Ok((200, json!({ "code": 1, "message": "success" })))),
        SendOutcome::Delivered
    );
    assert!(matches!(
        classify(Ok((200, json!({ "code": -2002 })))),
        SendOutcome::Rejected { .. }
    ));
    assert!(matches!(
        classify(Ok((400, json!({ "code": -1 })))),
        SendOutcome::Rejected {
            http_status: 400,
            ..
        }
    ));
    assert!(matches!(
        classify(Ok((502, json!(null)))),
        SendOutcome::Unknown { .. }
    ));
    assert!(matches!(
        classify(Err(ZeppBridgeError::TimedOut("超时".into()))),
        SendOutcome::Unknown { .. }
    ));
}
