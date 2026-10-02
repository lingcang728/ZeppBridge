//! 训练计划账本：先记账再发、被拒就翻回、空窗口要确认、撤销能还原、撤权后清零。

use super::*;
use crate::storage::training_plan::{DraftOrigin, Prepared, PublishRequest, SendOutcome};
use crate::training_plan::PlanDocument;
use serde_json::json;

fn day(text: &str) -> NaiveDate {
    NaiveDate::parse_from_str(text, "%Y-%m-%d").unwrap()
}

const TODAY: &str = "2026-10-02";

fn run(date: &str, name: &str) -> serde_json::Value {
    json!({ "date": date, "sport": "running", "name": name, "steps": [
        { "kind": "active", "duration": "30min", "target": "hr 130-150" }
    ]})
}

fn draft(db: &Database, plan: serde_json::Value) -> String {
    let document: PlanDocument = serde_json::from_value(plan).unwrap();
    db.save_plan_draft(DraftOrigin::User, &document).unwrap()
}

fn publish(db: &Database, request: PublishRequest, confirm: bool) -> Prepared {
    db.prepare_plan_publish(&request, day(TODAY), confirm)
        .unwrap()
}

fn sent_names(db: &Database) -> Vec<String> {
    db.plan_overview(day(TODAY))
        .unwrap()
        .sent
        .into_iter()
        .map(|w| w.name)
        .collect()
}

fn deliver(db: &Database, prepared: Prepared) -> serde_json::Value {
    let Prepared::Send { publish_id, body } = prepared else {
        panic!("应该要发：{prepared:?}");
    };
    db.finish_plan_publish(publish_id, &SendOutcome::Delivered)
        .unwrap();
    body
}

#[test]
fn the_ledger_is_written_before_sending_and_doubt_stays_visible() {
    let db = Database::in_memory().unwrap();
    let id = draft(&db, json!({ "workouts": [run("2026-10-03", "A")] }));
    let Prepared::Send { publish_id, body } =
        publish(&db, PublishRequest::Draft { id: id.clone() }, false)
    else {
        panic!("应该要发");
    };
    // 还没发，账本里已经有这一行；进程这时被杀，它按「不确定」算，不按成功算。
    let overview = db.plan_overview(day(TODAY)).unwrap();
    assert_eq!(overview.last_publish.as_ref().unwrap().state, "pending");
    assert!(overview.uncertain);
    assert_eq!(body["workouts"].as_array().unwrap().len(), 1);

    db.finish_plan_publish(
        publish_id,
        &SendOutcome::Unknown {
            error_code: "err.core.network".into(),
        },
    )
    .unwrap();
    let overview = db.plan_overview(day(TODAY)).unwrap();
    assert!(overview.uncertain);
    assert_eq!(overview.planned.len(), 1);
}

#[test]
fn a_rejected_publish_is_rolled_back_and_the_draft_reopens() {
    let db = Database::in_memory().unwrap();
    deliver(
        &db,
        publish(
            &db,
            PublishRequest::Draft {
                id: draft(&db, json!({ "workouts": [run("2026-10-03", "旧")] })),
            },
            false,
        ),
    );
    let id = draft(&db, json!({ "workouts": [run("2026-10-03", "新")] }));
    let Prepared::Send { publish_id, .. } =
        publish(&db, PublishRequest::Draft { id: id.clone() }, false)
    else {
        panic!("应该要发");
    };
    db.finish_plan_publish(
        publish_id,
        &SendOutcome::Rejected {
            http_status: 400,
            error_code: "err.training_plan.rejected".into(),
        },
    )
    .unwrap();
    let overview = db.plan_overview(day(TODAY)).unwrap();
    assert_eq!(sent_names(&db), ["旧"]);
    assert_eq!(
        overview.planned[0].name, "旧",
        "被拒的计划不能留在生效计划里"
    );
    assert_eq!(db.plan_draft(&id).unwrap().unwrap().status, "open");
}

#[test]
fn emptying_a_window_that_had_workouts_needs_confirmation_and_changes_nothing() {
    let db = Database::in_memory().unwrap();
    deliver(
        &db,
        publish(
            &db,
            PublishRequest::Draft {
                id: draft(&db, json!({ "workouts": [run("2026-10-03", "A")] })),
            },
            false,
        ),
    );
    // 一份把 10-03 设成休息日的计划：发出去就是空数组。
    let rest = draft(
        &db,
        json!({ "from": "2026-10-03", "to": "2026-10-03", "workouts": [] }),
    );
    assert_eq!(
        publish(&db, PublishRequest::Draft { id: rest.clone() }, false),
        Prepared::NeedsClearConfirmation
    );
    assert_eq!(db.plan_overview(day(TODAY)).unwrap().planned.len(), 1);
    assert_eq!(db.plan_draft(&rest).unwrap().unwrap().status, "open");
    assert_eq!(
        publish(&db, PublishRequest::Clear, false),
        Prepared::NeedsClearConfirmation
    );

    let body = deliver(&db, publish(&db, PublishRequest::Draft { id: rest }, true));
    assert_eq!(body["workouts"], json!([]));
    assert!(sent_names(&db).is_empty());
}

#[test]
fn rolling_never_sends_an_empty_window_or_an_unchanged_one() {
    let db = Database::in_memory().unwrap();
    assert_eq!(
        publish(&db, PublishRequest::Roll, false),
        Prepared::NotNeeded
    );
    deliver(
        &db,
        publish(
            &db,
            PublishRequest::Draft {
                id: draft(&db, json!({ "workouts": [run("2026-10-03", "A")] })),
            },
            false,
        ),
    );
    assert_eq!(
        publish(&db, PublishRequest::Roll, false),
        Prepared::NotNeeded
    );

    // 第二天：窗口往前挪了，10-03 还在里面 → 要发一次新窗口。
    let next = db
        .prepare_plan_publish(&PublishRequest::Roll, day("2026-10-03"), false)
        .unwrap();
    assert!(matches!(next, Prepared::Send { .. }));
    // 再过一天：训练日已过、窗口里什么都没有 → 不发空数组。
    assert_eq!(
        db.prepare_plan_publish(&PublishRequest::Roll, day("2026-10-04"), false)
            .unwrap(),
        Prepared::NotNeeded
    );
}

#[test]
fn days_beyond_the_window_wait_for_the_rolling_push() {
    let db = Database::in_memory().unwrap();
    let far = draft(&db, json!({ "workouts": [run("2026-10-20", "远")] }));
    assert_eq!(
        publish(&db, PublishRequest::Draft { id: far.clone() }, false),
        Prepared::NotNeeded
    );
    let overview = db.plan_overview(day(TODAY)).unwrap();
    assert_eq!(overview.planned[0].name, "远");
    assert!(overview.sent.is_empty());
    assert!(overview.can_undo, "排在以后的计划也要能撤销");
    let arrived = db
        .prepare_plan_publish(&PublishRequest::Roll, day("2026-10-15"), false)
        .unwrap();
    let Prepared::Send { body, .. } = arrived else {
        panic!("进窗口那天要发");
    };
    assert_eq!(body["workouts"][0]["workoutDate"], "2026-10-20");
}

#[test]
fn undo_restores_the_previous_plan_and_can_itself_be_undone() {
    let db = Database::in_memory().unwrap();
    deliver(
        &db,
        publish(
            &db,
            PublishRequest::Draft {
                id: draft(&db, json!({ "workouts": [run("2026-10-03", "旧")] })),
            },
            false,
        ),
    );
    deliver(
        &db,
        publish(
            &db,
            PublishRequest::Draft {
                id: draft(&db, json!({ "workouts": [run("2026-10-03", "新")] })),
            },
            false,
        ),
    );
    assert_eq!(sent_names(&db), ["新"]);
    deliver(&db, publish(&db, PublishRequest::UndoLast, false));
    assert_eq!(sent_names(&db), ["旧"]);
    deliver(&db, publish(&db, PublishRequest::UndoLast, false));
    assert_eq!(sent_names(&db), ["新"]);
}

#[test]
fn after_revoking_nothing_is_on_the_watch_and_nothing_to_undo() {
    let db = Database::in_memory().unwrap();
    deliver(
        &db,
        publish(
            &db,
            PublishRequest::Draft {
                id: draft(&db, json!({ "workouts": [run("2026-10-03", "A")] })),
            },
            false,
        ),
    );
    db.forget_plans_after_revoke(day(TODAY)).unwrap();
    let overview = db.plan_overview(day(TODAY)).unwrap();
    assert!(overview.sent.is_empty() && overview.planned.is_empty());
    assert!(!overview.can_undo);
    assert_eq!(
        publish(&db, PublishRequest::UndoLast, false),
        Prepared::NothingToUndo
    );
    // 撤权之后再滚动也不会去发空数组（官方已经删光了）。
    assert_eq!(
        publish(&db, PublishRequest::Roll, false),
        Prepared::NotNeeded
    );
}

#[test]
fn an_invalid_draft_changes_nothing() {
    let db = Database::in_memory().unwrap();
    let id = draft(&db, json!({ "workouts": [run("2026-09-01", "过去")] }));
    assert!(matches!(
        publish(&db, PublishRequest::Draft { id: id.clone() }, false),
        Prepared::Invalid { .. }
    ));
    assert!(db.plan_publishes(10).unwrap().is_empty());
    assert_eq!(db.open_plan_drafts().unwrap().len(), 1);
    let preview = db.preview_plan_draft(&id, day(TODAY)).unwrap();
    assert!(!preview.check.issues.is_empty());
    assert_eq!(preview.days.len(), 7);
}
