use super::*;
use crate::ai_tasks::{AiTask, AiTaskCategory, AiTaskCategoryRange, AiTaskDetailLevel};
use crate::storage::training_plan::{DraftOrigin, Prepared, PublishRequest, SendOutcome};
use crate::training_plan::{PlanDocument, Sport};

fn day(s: &str) -> NaiveDate {
    NaiveDate::parse_from_str(s, "%Y-%m-%d").unwrap()
}
fn document() -> PlanDocument {
    serde_json::from_value(serde_json::json!({"from":"2026-10-02","to":"2026-10-08","workouts":[{"date":"2026-10-03","sport":"running","name":"Run","focus":"Base","description":"Easy","steps":[{"kind":"active","duration":"30min","target":"hr 120-140"}]}]})).unwrap()
}
fn sent(db: &Database) -> i64 {
    let id = db.save_plan_draft(DraftOrigin::User, &document()).unwrap();
    let Prepared::Send { batch_id, sends } = db
        .prepare_plan_publish(&PublishRequest::Draft { id }, day("2026-10-02"), false)
        .unwrap()
    else {
        panic!()
    };
    for send in sends {
        db.finish_plan_publish(send.publish_id, &SendOutcome::Delivered)
            .unwrap();
    }
    batch_id
}
#[test]
fn strips_distinguish_record_presence_missing_value_and_incomplete_daily_duration() {
    let db = Database::in_memory().unwrap();
    db.insert_daily_metric(&DailyMetric {
        date: "2026-10-02".into(),
        metric: "physical_readiness".into(),
        value: 80.0,
        unit: "score".into(),
        source_scope: SourceScope::Device,
        device_id: None,
    })
    .unwrap();
    let mut w = workout_with_type(None, "running", "verified");
    w.start_time = Local
        .with_ymd_and_hms(2026, 10, 3, 7, 0, 0)
        .unwrap()
        .with_timezone(&Utc);
    w.end_time = w.start_time + Duration::minutes(30);
    w.moving_seconds = Some(1800);
    db.insert_workout(&w).unwrap();
    w.workout_id = "second".into();
    w.moving_seconds = None;
    db.insert_workout(&w).unwrap();
    let rows = db.ai_task_day_strip(3, day("2026-10-03")).unwrap();
    let recovery = rows
        .iter()
        .find(|r| r.category == AiTaskCategory::Recovery)
        .unwrap();
    assert!(!recovery.cells[0].has);
    assert_eq!(recovery.cells[0].value, None);
    assert!(recovery.cells[1].has);
    assert_eq!(recovery.cells[1].value, None);
    let workouts = rows
        .iter()
        .find(|r| r.category == AiTaskCategory::Workout)
        .unwrap();
    assert!(workouts.cells[2].has);
    assert_eq!(workouts.cells[2].value, None);
    assert_eq!(workouts.cells[2].workout_ids.len(), 2);
}
#[test]
fn adherence_uses_only_delivered_non_undone_day_and_sport_snapshots() {
    let db = Database::in_memory().unwrap();
    let id = sent(&db);
    let mut w = workout_with_type(None, "cycling", "verified");
    w.workout_id = "ride".into();
    w.start_time = Local
        .with_ymd_and_hms(2026, 10, 3, 7, 0, 0)
        .unwrap()
        .with_timezone(&Utc);
    w.end_time = w.start_time + Duration::minutes(30);
    db.insert_workout(&w).unwrap();
    let comparison = db
        .plan_adherence(day("2026-10-03"), day("2026-10-03"))
        .unwrap();
    assert_eq!(comparison[0].verdict, "missed");
    assert!(!comparison[0].actual[0].compatible);
    w.workout_id = "run".into();
    w.workout_type = "outdoor_running".into();
    w.normalized_type = w.workout_type.clone();
    db.insert_workout(&w).unwrap();
    assert_eq!(
        db.plan_adherence(day("2026-10-03"), day("2026-10-03"))
            .unwrap()[0]
            .verdict,
        "done"
    );
    db.conn
        .execute(
            "UPDATE training_plan_publishes SET state='unknown' WHERE id=?1",
            [id],
        )
        .unwrap();
    assert!(db
        .plan_adherence(day("2026-10-03"), day("2026-10-03"))
        .unwrap()[0]
        .planned
        .is_none());
    db.conn
        .execute(
            "UPDATE training_plan_publishes SET state='sent',undone=1 WHERE id=?1",
            [id],
        )
        .unwrap();
    assert!(db
        .plan_adherence(day("2026-10-03"), day("2026-10-03"))
        .unwrap()[0]
        .planned
        .is_none());
    assert!(crate::storage::plan_adherence::compatible_sport(
        Sport::Running,
        "trail_running"
    ));
    assert!(!crate::storage::plan_adherence::compatible_sport(
        Sport::PoolSwim,
        "open_water_swim"
    ));
}
#[test]
fn exchanges_link_the_pasted_draft_and_persist_profile_independently() {
    let db = Database::in_memory().unwrap();
    db.set_ai_profile_note("Local context").unwrap();
    let task = AiTask {
        schema_version: 1,
        id: "task".into(),
        title: "Title".into(),
        template_id: None,
        workout_ids: vec![],
        categories: vec![AiTaskCategoryRange {
            category: AiTaskCategory::Sleep,
            enabled: true,
            days_before: 13,
            include_workout_day: true,
            excluded_metrics: vec![],
        }],
        detail_level: AiTaskDetailLevel::Standard,
        prompt: "Question".into(),
        personal_note: "Local context".into(),
        attachments: vec![],
        include_precise_gps: false,
        mcp_shared: false,
        created_at: "".into(),
        updated_at: "".into(),
    };
    db.record_ai_exchange(&task, "chatgpt", "demo.md").unwrap();
    let id = db
        .save_plan_draft(DraftOrigin::AiPaste, &document())
        .unwrap();
    let exchanges = db.ai_exchange_list(10).unwrap();
    assert_eq!(exchanges[0].plan_draft_id.as_deref(), Some(id.as_str()));
    assert_eq!(exchanges[0].days_before, 13);
    assert_eq!(exchanges[0].document.as_ref(), Some(&document()));
    assert!(db.update_plan_draft(&id, &document()).unwrap());
    db.discard_plan_draft(&id).unwrap();
    assert!(!db.update_plan_draft(&id, &document()).unwrap());
    assert_eq!(db.user_prefs().unwrap().ai_profile_note, "Local context");
}

#[test]
fn mcp_incoming_draft_has_a_local_history_entry_without_invented_export_scope() {
    let db = Database::in_memory().unwrap();
    db.save_plan_draft(DraftOrigin::AiPaste, &document())
        .unwrap();
    assert!(db.ai_exchange_list(10).unwrap().is_empty());
    let id = db.save_plan_draft(DraftOrigin::Mcp, &document()).unwrap();
    let rows = db.ai_exchange_list(10).unwrap();
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].provider, "mcp");
    assert_eq!(rows[0].plan_draft_id.as_deref(), Some(id.as_str()));
    assert_eq!(rows[0].categories, serde_json::json!([]));
    assert!(rows[0].md_path.is_empty());
}
