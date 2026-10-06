//! 训练计划账本：先记账再发、被拒就翻回、空窗口要确认、撤销能还原、撤权后清零，
//! 以及多窗口：每一周都推、哪一周没送达如实标出、未来窗口用占位清空。

use super::*;
use crate::storage::training_plan::{
    DraftOrigin, PendingSend, Prepared, PublishRequest, SendOutcome, SendRole, WeekState,
    PLACEHOLDER_ID_BASE,
};
use crate::training_plan::PlanDocument;
use serde_json::json;

fn day(text: &str) -> NaiveDate {
    NaiveDate::parse_from_str(text, "%Y-%m-%d").unwrap()
}

const TODAY: &str = "2026-10-02";

fn run(date: &str, name: &str) -> serde_json::Value {
    json!({ "date": date, "sport": "running", "name": name,
        "focus": "有氧", "description": "轻松", "steps": [
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

fn sends(prepared: Prepared) -> Vec<PendingSend> {
    let Prepared::Send { sends, .. } = prepared else {
        panic!("应该要发：{prepared:?}");
    };
    sends
}

/// 整批都送达，返回按发送顺序的报文。
fn deliver(db: &Database, prepared: Prepared) -> Vec<serde_json::Value> {
    sends(prepared)
        .into_iter()
        .map(|send| {
            db.finish_plan_publish(send.publish_id, &SendOutcome::Delivered)
                .unwrap();
            send.body
        })
        .collect()
}

fn rejected() -> SendOutcome {
    SendOutcome::Rejected {
        http_status: 400,
        error_code: "err.training_plan.rejected".into(),
    }
}

fn dates(body: &serde_json::Value) -> Vec<String> {
    body["workouts"]
        .as_array()
        .unwrap()
        .iter()
        .map(|w| w["workoutDate"].as_str().unwrap().to_string())
        .collect()
}

#[test]
fn the_ledger_is_written_before_sending_and_doubt_stays_visible() {
    let db = Database::in_memory().unwrap();
    let id = draft(&db, json!({ "workouts": [run("2026-10-03", "A")] }));
    let batch = sends(publish(
        &db,
        PublishRequest::Draft { id: id.clone() },
        false,
    ));
    assert_eq!(batch.len(), 1);
    // 还没发，账本里已经有这一行；进程这时被杀，它按「不确定」算，不按成功算。
    let overview = db.plan_overview(day(TODAY)).unwrap();
    assert_eq!(overview.last_publish.as_ref().unwrap().state, "pending");
    assert!(overview.uncertain);
    assert_eq!(batch[0].body["workouts"].as_array().unwrap().len(), 1);

    db.finish_plan_publish(
        batch[0].publish_id,
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
    let batch = sends(publish(
        &db,
        PublishRequest::Draft { id: id.clone() },
        false,
    ));
    db.finish_plan_publish(batch[0].publish_id, &rejected())
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

    let bodies = deliver(&db, publish(&db, PublishRequest::Draft { id: rest }, true));
    assert_eq!(bodies.len(), 1);
    assert_eq!(bodies[0]["startDate"], TODAY);
    assert_eq!(bodies[0]["workouts"], json!([]));
    assert!(sent_names(&db).is_empty());
}

#[test]
fn every_week_the_plan_covers_is_pushed_farthest_first() {
    // 2-2 的根因：10-11 落在第二周，以前只推第一周，它从来没发出去。
    let db = Database::in_memory().unwrap();
    let id = draft(
        &db,
        json!({ "workouts": [run("2026-10-06", "A"), run("2026-10-11", "B")] }),
    );
    let batch = sends(publish(&db, PublishRequest::Draft { id }, false));
    let starts: Vec<String> = batch.iter().map(|s| s.window_start.to_string()).collect();
    assert_eq!(starts, ["2026-10-09", "2026-10-02"], "远的窗口先推");
    assert!(batch.iter().all(|s| s.role == SendRole::Window));
    assert_eq!(dates(&batch[0].body), ["2026-10-11"]);
    assert_eq!(batch[0].body["endDate"], "2026-10-15");
    assert_eq!(dates(&batch[1].body), ["2026-10-06"]);
    for send in &batch {
        db.finish_plan_publish(send.publish_id, &SendOutcome::Delivered)
            .unwrap();
    }
    let overview = db.plan_overview(day(TODAY)).unwrap();
    assert_eq!(overview.weeks.len(), 2);
    assert!(overview
        .weeks
        .iter()
        .all(|week| week.state == WeekState::InSync && week.planned == 1));
    assert_eq!(overview.last_publish.unwrap().state, "sent");
    // 什么都没变就不再发。
    assert_eq!(
        publish(&db, PublishRequest::Roll, false),
        Prepared::NotNeeded
    );
}

#[test]
fn a_week_that_did_not_arrive_is_named_and_the_rolling_push_retries_it() {
    let db = Database::in_memory().unwrap();
    let id = draft(
        &db,
        json!({ "workouts": [run("2026-10-06", "A"), run("2026-10-11", "B")] }),
    );
    let batch = sends(publish(
        &db,
        PublishRequest::Draft { id: id.clone() },
        false,
    ));
    // 第二周被拒，第一周送到：生效计划保持新的，不整体翻回去。
    db.finish_plan_publish(batch[0].publish_id, &rejected())
        .unwrap();
    db.finish_plan_publish(batch[1].publish_id, &SendOutcome::Delivered)
        .unwrap();
    let overview = db.plan_overview(day(TODAY)).unwrap();
    assert_eq!(overview.planned.len(), 2);
    assert_eq!(overview.last_publish.as_ref().unwrap().state, "partial");
    assert_eq!(db.plan_draft(&id).unwrap().unwrap().status, "published");
    let second = overview
        .weeks
        .iter()
        .find(|w| w.start == day("2026-10-09"))
        .unwrap();
    assert_eq!(second.state, WeekState::NotSent);
    assert_eq!(
        second.error_code.as_deref(),
        Some("err.training_plan.rejected")
    );
    // 第二天窗口往前挪了一天：没送达的那条训练所在的窗口一定会被推。
    let retry = sends(
        db.prepare_plan_publish(&PublishRequest::Roll, day("2026-10-03"), false)
            .unwrap(),
    );
    assert!(retry
        .iter()
        .any(|send| dates(&send.body).contains(&"2026-10-11".to_string())));
    assert!(retry.iter().all(|send| send.role == SendRole::Window));
}

#[test]
fn rolling_never_empties_a_window_and_never_resends_what_is_already_there() {
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
    // 第二天：窗口往前挪了，10-03 那天上次已经发过同样的训练，不用重发。
    assert_eq!(
        db.prepare_plan_publish(&PublishRequest::Roll, day("2026-10-03"), false)
            .unwrap(),
        Prepared::NotNeeded
    );
    // 再过一天：训练日已过、窗口里什么都没有 → 不发空数组。
    assert_eq!(
        db.prepare_plan_publish(&PublishRequest::Roll, day("2026-10-04"), false)
            .unwrap(),
        Prepared::NotNeeded
    );
}

#[test]
fn a_far_away_workout_is_pushed_right_away_in_its_own_week() {
    let db = Database::in_memory().unwrap();
    let far = draft(&db, json!({ "workouts": [run("2026-10-20", "远")] }));
    let bodies = deliver(&db, publish(&db, PublishRequest::Draft { id: far }, false));
    assert_eq!(bodies.len(), 1);
    assert_eq!(bodies[0]["startDate"], "2026-10-16");
    assert_eq!(dates(&bodies[0]), ["2026-10-20"]);
    let overview = db.plan_overview(day(TODAY)).unwrap();
    assert!(overview.sent.is_empty(), "本周没有训练");
    assert!(overview.can_undo);
}

#[test]
fn clearing_a_future_week_uses_a_placeholder_then_repushes_the_week_before() {
    let db = Database::in_memory().unwrap();
    deliver(
        &db,
        publish(
            &db,
            PublishRequest::Draft {
                id: draft(
                    &db,
                    json!({ "workouts": [run("2026-10-03", "A"), run("2026-10-11", "B")] }),
                ),
            },
            false,
        ),
    );
    let clear = draft(
        &db,
        json!({ "from": "2026-10-09", "to": "2026-10-15", "workouts": [] }),
    );
    assert_eq!(
        publish(&db, PublishRequest::Draft { id: clear.clone() }, false),
        Prepared::NeedsClearConfirmation
    );
    let batch = sends(publish(&db, PublishRequest::Draft { id: clear }, true));
    assert_eq!(batch.len(), 2);
    // 先清后面的窗口：占位落在窗口前一天（10-08，属于本周），绝不发空数组。
    assert_eq!(batch[0].role, SendRole::Placeholder);
    assert_eq!(batch[0].window_start, day("2026-10-09"));
    assert_eq!(dates(&batch[0].body), ["2026-10-08"]);
    assert!(batch[0].body["workouts"][0]["workoutId"].as_i64().unwrap() >= PLACEHOLDER_ID_BASE);
    // 紧接着重推前一个窗口，把占位覆盖掉。
    assert_eq!(batch[1].role, SendRole::Window);
    assert_eq!(batch[1].window_start, day(TODAY));
    assert_eq!(dates(&batch[1].body), ["2026-10-03"]);

    // 重推没送达：占位可能留在 10-08，界面要说不确定，滚动推送要再推本周。
    db.finish_plan_publish(batch[0].publish_id, &SendOutcome::Delivered)
        .unwrap();
    db.finish_plan_publish(batch[1].publish_id, &rejected())
        .unwrap();
    assert!(db.plan_overview(day(TODAY)).unwrap().uncertain);
    let retry = sends(publish(&db, PublishRequest::Roll, false));
    assert_eq!(retry.len(), 1);
    assert_eq!(retry[0].window_start, day(TODAY));
    assert_eq!(dates(&retry[0].body), ["2026-10-03"]);
    db.finish_plan_publish(retry[0].publish_id, &SendOutcome::Delivered)
        .unwrap();
    let overview = db.plan_overview(day(TODAY)).unwrap();
    assert!(!overview.uncertain);
    assert_eq!(sent_names(&db), ["A"]);
    assert!(overview.weeks.iter().all(|w| w.start == day(TODAY)));
}

#[test]
fn clearing_a_future_week_with_an_empty_week_before_ends_in_an_empty_array_today() {
    let db = Database::in_memory().unwrap();
    deliver(
        &db,
        publish(
            &db,
            PublishRequest::Draft {
                id: draft(&db, json!({ "workouts": [run("2026-10-11", "B")] })),
            },
            false,
        ),
    );
    let clear = draft(
        &db,
        json!({ "from": "2026-10-11", "to": "2026-10-11", "workouts": [] }),
    );
    let batch = sends(publish(&db, PublishRequest::Draft { id: clear }, true));
    let roles: Vec<SendRole> = batch.iter().map(|s| s.role).collect();
    assert_eq!(roles, [SendRole::Placeholder, SendRole::Clear]);
    assert_eq!(batch[1].window_start, day(TODAY));
    assert_eq!(batch[1].body["workouts"], json!([]));
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
    assert!(overview.weeks.is_empty());
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
