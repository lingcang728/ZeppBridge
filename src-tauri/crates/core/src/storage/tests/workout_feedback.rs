use super::*;
use crate::storage::training_plan::{DraftOrigin, Prepared, PublishRequest, SendOutcome};
use crate::storage::workout_feedback::{next_monday, FeedbackInput};
use crate::training_plan::PlanDocument;

fn day(s: &str) -> NaiveDate {
    NaiveDate::parse_from_str(s, "%Y-%m-%d").unwrap()
}

/// 10-03 一条 30 分钟的跑步计划，按送达记账。
fn delivered_plan(db: &Database) {
    let document: PlanDocument = serde_json::from_value(serde_json::json!({"from":"2026-10-02","to":"2026-10-08","workouts":[{"date":"2026-10-03","sport":"running","name":"Tempo","focus":"Threshold","description":"Steady","steps":[{"kind":"active","duration":"30min","target":"hr 140-155"}]}]})).unwrap();
    let id = db.save_plan_draft(DraftOrigin::User, &document).unwrap();
    let Prepared::Send { sends, .. } = db
        .prepare_plan_publish(&PublishRequest::Draft { id }, day("2026-10-02"), false)
        .unwrap()
    else {
        panic!()
    };
    for send in sends {
        db.finish_plan_publish(send.publish_id, &SendOutcome::Delivered)
            .unwrap();
    }
}

fn run_at(db: &Database, id: &str, kind: &str, hour: u32) -> DateTime<Utc> {
    let mut w = workout_with_type(None, kind, "verified");
    w.workout_id = id.into();
    w.start_time = Local
        .with_ymd_and_hms(2026, 10, 3, hour, 0, 0)
        .unwrap()
        .with_timezone(&Utc);
    w.end_time = w.start_time + Duration::minutes(27);
    w.moving_seconds = Some(1620);
    w.avg_hr = Some(150);
    db.insert_workout(&w).unwrap();
    w.end_time
}

fn rate(id: &str, rating: u8, tags: &[&str]) -> FeedbackInput {
    FeedbackInput {
        workout_id: id.into(),
        rating,
        tags: tags.iter().map(|t| t.to_string()).collect(),
        note: Some("  legs heavy  ".into()),
    }
}

#[test]
fn hiding_a_rated_workout_excludes_its_feedback_until_restored() {
    let db = Database::in_memory().unwrap();
    run_at(&db, "run", "running", 7);
    db.save_workout_feedback(&rate("run", 5, &[])).unwrap();
    let edit = db.edit_workouts(&["run".into()], None, Some(true)).unwrap();
    assert!(db.workout_feedback("run").unwrap().is_none());
    assert!(db.workout_feedback_history(10).unwrap().is_empty());
    db.undo_workout_edit(&edit.id).unwrap();
    assert_eq!(db.workout_feedback_history(10).unwrap().len(), 1);
    assert_eq!(db.workout_feedback("run").unwrap().unwrap().rating, Some(5));
}

#[test]
fn asks_once_for_the_matching_run_within_48_hours_and_keeps_the_answer() {
    let db = Database::in_memory().unwrap();
    delivered_plan(&db);
    // 同一天的骑行对不上跑步计划，不问它。
    run_at(&db, "ride", "cycling", 18);
    let end = run_at(&db, "run", "outdoor_running", 7);
    let prompt = db
        .workout_feedback_prompt(end + Duration::hours(3))
        .unwrap()
        .expect("a delivered run plan and a run that day");
    assert_eq!(prompt.actual.workout_id, "run");
    assert_eq!(prompt.planned.name, "Tempo");
    assert_eq!(prompt.completion_basis, Some("duration"));
    assert!((prompt.completion.unwrap() - 0.9).abs() < 1e-9);
    // 48 小时之后不再问，没打也不追。
    assert!(db
        .workout_feedback_prompt(end + Duration::hours(49))
        .unwrap()
        .is_none());

    assert!(db.save_workout_feedback(&rate("run", 0, &[])).is_err());
    assert!(db
        .save_workout_feedback(&rate("run", 5, &["bored"]))
        .is_err());
    assert!(db.save_workout_feedback(&rate("missing", 5, &[])).is_err());
    db.save_workout_feedback(&rate("run", 5, &["fatigue", "fatigue"]))
        .unwrap();
    assert!(db
        .workout_feedback_prompt(end + Duration::hours(3))
        .unwrap()
        .is_none());
    let saved = db.workout_feedback("run").unwrap().unwrap();
    assert_eq!(saved.rating, Some(5));
    assert_eq!(saved.tags, vec!["fatigue".to_string()]);
    assert_eq!(saved.note.as_deref(), Some("legs heavy"));
    assert_eq!(saved.plan_name.as_deref(), Some("Tempo"));
    assert!(saved.plan_workout_id.is_some());
    db.mark_feedback_adjustment("run", "lighter_10").unwrap();
    // 关掉不会抹掉已经打过的分。
    db.dismiss_workout_feedback("run").unwrap();
    let history = db.workout_feedback_history(10).unwrap();
    assert_eq!(history.len(), 1);
    assert_eq!(history[0].adjustment.as_deref(), Some("lighter_10"));
}

#[test]
fn dismissing_or_snoozing_stops_the_question() {
    let db = Database::in_memory().unwrap();
    delivered_plan(&db);
    let end = run_at(&db, "run", "running", 7);
    let now = end + Duration::hours(1);
    db.dismiss_workout_feedback("run").unwrap();
    assert!(db.workout_feedback_prompt(now).unwrap().is_none());
    assert!(db.workout_feedback_history(10).unwrap().is_empty());

    let end = run_at(&db, "run-2", "running", 18);
    let now = end + Duration::hours(1);
    assert!(db.workout_feedback_prompt(now).unwrap().is_some());
    let today = now.with_timezone(&Local).date_naive();
    let until = db.snooze_workout_feedback(today).unwrap();
    assert_eq!(until, next_monday(today));
    assert_eq!(until.weekday(), chrono::Weekday::Mon);
    assert!(until > today);
    assert!(db.workout_feedback_prompt(now).unwrap().is_none());
}

#[test]
fn toast_link_rates_once_with_its_own_token_and_never_reissues() {
    use crate::storage::feedback_toast::{parse_feedback_link, ToastRating};
    let db = Database::in_memory().unwrap();
    delivered_plan(&db);
    let end = run_at(&db, "run", "running", 7);
    let now = end + Duration::hours(1);
    let due = db.feedback_toast_due(now).unwrap().expect("a matching run");
    assert_eq!(due.prompt.actual.workout_id, "run");
    // 一条运动只发一次通知。
    assert!(db.feedback_toast_due(now).unwrap().is_none());

    let forged = "0".repeat(32);
    assert_eq!(
        db.rate_from_toast(&forged, 4, now).unwrap(),
        ToastRating::Refused
    );
    assert_eq!(
        db.rate_from_toast(&due.token, 4, end + Duration::hours(49))
            .unwrap(),
        ToastRating::Refused
    );
    assert!(db.workout_feedback("run").unwrap().is_none());

    let link = format!("zeppbridge://feedback/?t={}&r=4", due.token);
    let (token, rating) = parse_feedback_link(&link).unwrap();
    assert_eq!(
        db.rate_from_toast(&token, rating, now).unwrap(),
        ToastRating::Saved
    );
    assert_eq!(db.workout_feedback("run").unwrap().unwrap().rating, Some(4));
    // 用过就作废。
    assert_eq!(
        db.rate_from_toast(&token, 1, now).unwrap(),
        ToastRating::Refused
    );
    assert_eq!(db.workout_feedback("run").unwrap().unwrap().rating, Some(4));

    assert!(parse_feedback_link("zeppbridge://feedback?t=abc&r=4").is_none());
    assert!(parse_feedback_link(&format!("zeppbridge://feedback?t={token}&r=9")).is_none());
    assert!(parse_feedback_link("zeppbridge://open").is_none());
}
