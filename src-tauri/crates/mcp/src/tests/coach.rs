//! 3B 教练工具：上下文不编数据、起草不存坏计划、发布受开关管、task 范围整体拒绝。

use super::*;
use zeppbridge_core::models::DailyMetric;

fn daily(days_ago: i64, metric: &str, value: f64) -> DailyMetric {
    DailyMetric {
        date: (Local::now().date_naive() - Duration::days(days_ago))
            .format("%Y-%m-%d")
            .to_string(),
        metric: metric.into(),
        value,
        unit: "u".into(),
        source_scope: SourceScope::Device,
        device_id: Some("ring-9".into()),
    }
}

fn ok(result: &Value) -> &Value {
    assert_eq!(result["isError"], false, "{}", result["content"][0]["text"]);
    &result["structuredContent"]
}

fn day(days_ahead: i64) -> String {
    (Local::now().date_naive() + Duration::days(days_ahead))
        .format("%Y-%m-%d")
        .to_string()
}

fn easy_run_plan() -> Value {
    json!({
        "format": "zeppbridge-plan/3",
        "summary": "一次轻松跑",
        "from": day(1),
        "to": day(3),
        "workouts": [{
            "date": day(2), "sport": "running", "variant": "outdoor",
            "name": "轻松跑", "focus": "有氧", "description": "放松跑",
            "steps": [{ "kind": "active", "duration": "40min", "target": "hr 130-145" }]
        }]
    })
}

fn open_drafts(library: &TestLibrary) -> usize {
    Database::open_read_only(library.0.join("zepp.db"))
        .unwrap()
        .open_plan_drafts()
        .unwrap()
        .len()
}

#[test]
fn training_context_leaves_empty_days_null_instead_of_zero() {
    let library = TestLibrary::empty();
    {
        let db = Database::open_migrated(&library.0.join("zepp.db")).unwrap();
        db.insert_daily_metric(&daily(2, "sleep_hrv", 88.0))
            .unwrap();
        db.insert_daily_metric(&daily(2, "resting_hr", 51.0))
            .unwrap();
        let mut run = run_workout("r1", utc_noon(2), 150);
        run.moving_seconds = Some(3000);
        db.insert_workout(&run).unwrap();
    }
    let result = library.call(
        &AccessScope::FullReadOnly,
        "get_training_context",
        json!({"days": 7}),
    );
    let context = ok(&result);
    let days = context["days"].as_array().unwrap();
    assert_eq!(days.len(), 7, "一天一行，空的日子也要在");
    let with_data = &days[4];
    assert_eq!(with_data["sleepHrv"], 88.0);
    assert_eq!(with_data["restingHr"], 51.0);
    assert_eq!(with_data["workouts"], 1);
    // 没有采样的那天：字段是 null，不是 0。
    let empty = &days[5];
    assert!(empty["sleepHrv"].is_null() && empty["restingHr"].is_null());
    assert!(empty["sleepMinutes"].is_null() && empty["steps"].is_null());
    // 10 km / 3000 s 的移动时间 = 300 s/km。
    assert_eq!(context["workouts"][0]["avgPaceSecPerKm"], 300.0);
    assert_eq!(context["daysSinceLastWorkout"], 2);
}

#[test]
fn a_plan_that_fails_validation_is_not_saved() {
    let library = TestLibrary::empty();
    let walk = json!({
        "workouts": [{ "date": day(2), "sport": "walking", "name": "走走",
                       "steps": [{ "kind": "active", "duration": "30min" }] }]
    });
    let result = library.call(
        &AccessScope::FullReadOnly,
        "draft_training_plan",
        json!({ "plan": walk }),
    );
    let draft = ok(&result);
    assert!(draft["draftId"].is_null());
    assert_eq!(draft["publishable"], false);
    let codes: Vec<&str> = draft["check"]["issues"]
        .as_array()
        .unwrap()
        .iter()
        .filter_map(|issue| issue["message_code"].as_str())
        .collect();
    assert!(codes.contains(&"ui.training_plan.issue.sport_not_deliverable"));
    assert_eq!(open_drafts(&library), 0, "没通过校验就不该留下草稿");

    let saved = library.call(
        &AccessScope::FullReadOnly,
        "draft_training_plan",
        json!({ "plan": easy_run_plan() }),
    );
    let saved = ok(&saved);
    assert!(saved["draftId"].as_str().unwrap().starts_with("plan-"));
    assert_eq!(saved["aiMayPublish"], false);
    assert_eq!(open_drafts(&library), 1);
}

#[test]
fn publishing_is_refused_until_the_user_allows_it() {
    let library = TestLibrary::empty();
    let saved = library.call(
        &AccessScope::FullReadOnly,
        "draft_training_plan",
        json!({ "plan": easy_run_plan() }),
    );
    let draft_id = ok(&saved)["draftId"].as_str().unwrap().to_string();

    let refused = library.call(
        &AccessScope::FullReadOnly,
        "publish_training_plan",
        json!({ "draftId": draft_id }),
    );
    assert_eq!(refused["isError"], true);
    assert_eq!(
        refused["structuredContent"]["error"]["code"],
        "err.training_plan.ai_publish_disabled"
    );
    // 账本一行都没动：草稿还开着，没有任何推送记录。
    let db = Database::open_read_only(library.0.join("zepp.db")).unwrap();
    assert_eq!(db.open_plan_drafts().unwrap().len(), 1);
    assert!(db.plan_publishes(10).unwrap().is_empty());
}

#[test]
fn task_scope_refuses_every_coach_tool() {
    let library = TestLibrary::empty();
    library.share_task("t1", &task_payload("t1", &[], &["sleep"]), true);
    for (name, args) in [
        ("get_training_context", json!({})),
        ("get_athlete_profile", json!({})),
        ("get_training_plan", json!({})),
        ("draft_training_plan", json!({ "plan": easy_run_plan() })),
        ("publish_training_plan", json!({ "draftId": "plan-x" })),
    ] {
        let result = library.call(&AccessScope::TaskScoped, name, args);
        assert_eq!(result["isError"], true, "{name} 在 task 范围里应当被拒");
    }
    assert_eq!(open_drafts(&library), 0, "task 范围里的起草不能写库");
}
