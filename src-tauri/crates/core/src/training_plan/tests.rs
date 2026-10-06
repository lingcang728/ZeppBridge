//! 训练计划的纯函数门禁：书写格式读对、该挡的挡住、报文长成官方要的样子、
//! 发送结局不把「不知道」当成「成功」。

use super::parse::{parse_duration, parse_target};
use super::publish::classify;
use super::v2::{clear_future_window, window_body, NumberedWorkout, WatchLocale};
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
        "focus": "强化耐力", "description": "全程放松",
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
fn plan_two_keeps_local_rest_advice_out_of_the_watch_body() {
    let old = document(
        json!({"from":"2026-10-02","to":"2026-10-08","workouts":[easy_run("2026-10-03")]}),
    );
    let mut next = serde_json::to_value(&old).unwrap();
    next["format"] = json!("zeppbridge.plan/2");
    next["summary"] = json!("Recover first");
    next["rest"] =
        json!([{"date":"2026-10-03","bedtime":"22:30","sleepTarget":"8h30m","note":"Early night"}]);
    let check = check_plan(&document(next), context());
    assert!(check.publishable());
    assert_eq!(check.rest[0].bedtime_minutes, Some(1350));
    assert_eq!(check.rest[0].sleep_target_seconds, Some(30600));
    assert_eq!(check.workouts, check_plan(&old, context()).workouts);
    let numbered = |workouts: Vec<Workout>| {
        workouts
            .into_iter()
            .enumerate()
            .map(|(i, workout)| NumberedWorkout {
                id: i as i64 + 1,
                workout,
            })
            .collect::<Vec<_>>()
    };
    let window = Window::starting(context().today);
    assert_eq!(
        window_body(window, &numbered(check.workouts), WatchLocale::Zh),
        window_body(
            window,
            &numbered(check_plan(&old, context()).workouts),
            WatchLocale::Zh
        )
    );
}

#[test]
fn malformed_or_out_of_range_rest_advice_blocks_the_whole_plan() {
    for rest in [
        json!({"date":"2026-10-03","bedtime":"24:00"}),
        json!({"date":"2026-10-03","sleepTarget":"8h90m"}),
        json!({"date":"2026-10-03","sleepTarget":"400m"}),
        json!({"date":"2026-10-09","bedtime":"22:30"}),
    ] {
        let check = check_plan(
            &document(json!({"from":"2026-10-02","to":"2026-10-08","workouts":[],"rest":[rest]})),
            context(),
        );
        assert!(!check.publishable());
        assert!(check
            .issues
            .iter()
            .any(|i| i.message_code.contains("rest_")));
    }
}

#[test]
fn rest_only_plans_require_a_declared_window_and_old_plans_default_to_no_rest() {
    let local = document(
        json!({"from":"2026-10-02","to":"2026-10-08","workouts":[],"rest":[{"date":"2026-10-04","sleepTarget":"8h"}]}),
    );
    assert!(check_plan(&local, context()).publishable());
    let old = document(json!({"workouts":[easy_run("2026-10-03")]}));
    assert!(check_plan(&old, context()).rest.is_empty());
    let missing = document(json!({"workouts":[],"rest":[{"date":"2026-10-04"}]}));
    assert!(!check_plan(&missing, context()).publishable());
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
fn shapes_verified_on_the_watch_publish_and_speak_the_watch_units() {
    // 2026-10-06 R3、R4 实测：距离是米，配速是速度（米/秒），不设目标、同一天两条都能显示。
    let plan = json!({ "workouts": [
        { "date": "2026-10-04", "sport": "running", "variant": "outdoor", "name": "节奏跑",
          "focus": "提升乳酸阈", "description": "后半程保持节奏", "steps": [
            { "kind": "active", "duration": "5km", "target": "pace 5:00-5:30" },
            { "kind": "cooldown", "duration": "10min" }
        ]},
        easy_run("2026-10-04")
    ]});
    let check = check_plan(&document(plan), context());
    assert!(check.publishable(), "{:?}", check.issues);
    assert!(check.issues.is_empty(), "{:?}", check.issues);
    let numbered: Vec<NumberedWorkout> = check
        .workouts
        .into_iter()
        .enumerate()
        .map(|(index, workout)| NumberedWorkout {
            id: index as i64 + 1,
            workout,
        })
        .collect();
    let body = window_body(
        Window::starting(day("2026-10-02")),
        &numbered,
        WatchLocale::Zh,
    );
    assert_eq!(body["workouts"].as_array().unwrap().len(), 2);
    let steps = &body["workouts"][0]["steps"];
    assert_eq!(steps[0]["durationType"], "DISTANCE");
    assert_eq!(steps[0]["durationValue"], 5000, "距离单位是米");
    assert_eq!(steps[0]["targetType"], "PACE_LAP");
    // 5:30/公里 = 3.03 米/秒（慢、低端），5:00/公里 = 3.33 米/秒（快、高端）。
    // 填成每公里秒数（300–330）手表上会显示成 0'03"。
    assert_eq!(steps[0]["targetValueLow"], json!(3.03));
    assert_eq!(steps[0]["targetValueHigh"], json!(3.33));
    assert_eq!(steps[1]["targetType"], "OPEN");
    assert_eq!(
        (&steps[1]["targetValueLow"], &steps[1]["targetValueHigh"]),
        (&json!(0), &json!(0))
    );
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
    let body = window_body(
        Window::starting(day("2026-10-02")),
        &numbered,
        WatchLocale::Zh,
    );
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

#[test]
fn a_long_walk_reads_as_walking_but_never_reaches_the_watch() {
    // R1 实测：V2 收到 WALKING 会单条静默丢弃、照回 success。读得懂，但必须挡住。
    let mut walk = easy_run("2026-10-04");
    walk["sport"] = json!("walking");
    let mut wrong_variant = easy_run("2026-10-05");
    wrong_variant["variant"] = json!("indoor");
    let check = check_plan(
        &document(json!({ "workouts": [walk, wrong_variant] })),
        context(),
    );
    assert!(!check.publishable());
    assert!(check.workouts.is_empty(), "发不出去的训练不能进可发列表");
    let walking = check
        .issues
        .iter()
        .find(|i| i.message_code == "ui.training_plan.issue.sport_not_deliverable")
        .expect("走路要给出发布阻断的问题码");
    assert_eq!(walking.severity, Severity::Error);
    assert_eq!(walking.params["activity"], "walking");
    // 界面要能照原样画出这次长走：日期、类型、时长都在，不变成休息日。子类型写错的那条也留着。
    assert_eq!(check.held.len(), 2);
    assert_eq!(check.held[1].activity, None);
    assert_eq!(check.held[0].index, 0);
    assert_eq!(check.held[0].activity, Some(Activity::Walking));
    assert_eq!(check.held[0].date, day("2026-10-04"));
    assert!(!check.held[0].steps.is_empty());
    assert!(check
        .issues
        .iter()
        .any(|i| i.message_code == "ui.training_plan.issue.bad_variant"));
}

#[test]
fn focus_and_description_are_required_and_a_long_name_only_warns() {
    let mut bare = easy_run("2026-10-04");
    bare.as_object_mut().unwrap().remove("focus");
    bare.as_object_mut().unwrap().remove("description");
    // 旧格式（zeppbridge-plan/2）读得进来，校验挡住。
    let check = check_plan(
        &document(json!({ "format": "zeppbridge-plan/2", "workouts": [bare] })),
        context(),
    );
    assert!(!check.publishable());
    let codes: Vec<&str> = check.issues.iter().map(|i| i.message_code).collect();
    // 缺目的的训练不能从界面上消失：它留在 held 里，单天页就地补。
    assert_eq!(check.held.len(), 1);
    assert_eq!(check.held[0].activity, None);
    assert_eq!(check.held[0].sport, "running");
    assert!(!check.held[0].steps.is_empty());
    assert!(codes.contains(&"ui.training_plan.issue.missing_focus"));
    assert!(codes.contains(&"ui.training_plan.issue.missing_description"));

    let mut long = easy_run("2026-10-04");
    long["name"] = json!("周末长距离有氧耐力跑加最后两公里提速");
    let check = check_plan(&document(json!({ "workouts": [long] })), context());
    assert!(check.publishable(), "名字太长只提醒，不阻断");
    assert_eq!(check.workouts.len(), 1);
    assert_eq!(check.issues.len(), 1);
    assert_eq!(check.issues[0].severity, Severity::Warning);
    assert_eq!(
        check.issues[0].message_code,
        "ui.training_plan.issue.name_truncated"
    );
}

#[test]
fn the_watch_description_leads_with_purpose_and_the_sub_type_to_pick() {
    let mut ride = easy_run("2026-10-04");
    ride["sport"] = json!("cycling");
    ride["variant"] = json!("outdoor");
    ride["description"] = json!("踏频 85–95\n别冲坡");
    let check = check_plan(&document(json!({ "workouts": [ride] })), context());
    assert!(check.publishable(), "{:?}", check.issues);
    let numbered = vec![NumberedWorkout {
        id: 7,
        workout: check.workouts[0].clone(),
    }];
    let window = Window::starting(day("2026-10-02"));
    let body = window_body(window, &numbered, WatchLocale::Zh);
    assert_eq!(body["workouts"][0]["sport"], "CYCLING");
    assert_eq!(
        body["workouts"][0]["description"],
        "强化耐力 · 户外骑行\n踏频 85–95\n别冲坡"
    );
    let english = window_body(window, &numbered, WatchLocale::En);
    assert_eq!(
        english["workouts"][0]["description"],
        "强化耐力 · Outdoor cycling\n踏频 85–95\n别冲坡"
    );
    // 账本里更早的训练没有目的和子类型：只发要点，不编一行出来。
    let mut legacy = check.workouts[0].clone();
    legacy.focus = None;
    legacy.variant = None;
    let body = window_body(
        window,
        &[NumberedWorkout {
            id: 7,
            workout: legacy,
        }],
        WatchLocale::Zh,
    );
    assert_eq!(body["workouts"][0]["description"], "踏频 85–95\n别冲坡");
}

#[test]
fn clearing_a_future_window_parks_one_placeholder_the_day_before() {
    let window = Window::starting(day("2026-10-09"));
    let body = clear_future_window(window, 1_000_000_042);
    assert_eq!(body["startDate"], "2026-10-09");
    assert_eq!(body["endDate"], "2026-10-15");
    let workouts = body["workouts"].as_array().unwrap();
    assert_eq!(workouts.len(), 1, "绝不能对未来窗口发空数组：那清的是本周");
    assert_eq!(workouts[0]["workoutDate"], "2026-10-08");
    assert_eq!(workouts[0]["workoutId"], 1_000_000_042);
}
