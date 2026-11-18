use super::*;
use crate::storage::coach_notes::Remembered;
use crate::storage::logbook::injuries::InjuryInput;
use crate::storage::mcp_writes::{McpChange, UndoOutcome};

fn injury(id: Option<i64>, title: &str, end: Option<&str>) -> InjuryInput {
    InjuryInput {
        id,
        title: title.into(),
        body_part: Some("knee_l".into()),
        severity: Some(2),
        start_date: "2026-10-01".into(),
        end_date: end.map(str::to_string),
        notes: String::new(),
    }
}

#[test]
fn an_ai_write_is_ledgered_and_undone_back_to_what_it_was() {
    let db = Database::in_memory().unwrap();
    let created = db
        .apply_mcp_change(
            "save_injury",
            McpChange::Injury(injury(None, "左膝疼", None)),
            Some("OpenCode"),
        )
        .unwrap();
    assert_eq!(created.action, "created");
    let id: i64 = created.target_id.parse().unwrap();
    let healed = db
        .apply_mcp_change(
            "save_injury",
            McpChange::Injury(injury(Some(id), "左膝疼", Some("2026-10-20"))),
            None,
        )
        .unwrap();
    assert_eq!(healed.action, "updated");

    // 先撤旧的不行：同一条有更新的改动还没撤。
    assert_eq!(
        db.undo_mcp_write(created.write_id.unwrap()).unwrap(),
        UndoOutcome::Stale
    );
    assert_eq!(
        db.undo_mcp_write(healed.write_id.unwrap()).unwrap(),
        UndoOutcome::Undone
    );
    assert_eq!(db.list_injuries().unwrap()[0].input.end_date, None);
    assert_eq!(
        db.undo_mcp_write(created.write_id.unwrap()).unwrap(),
        UndoOutcome::Undone
    );
    assert!(db.list_injuries().unwrap().is_empty());
    assert_eq!(
        db.undo_mcp_write(created.write_id.unwrap()).unwrap(),
        UndoOutcome::Missing
    );
    let ledger = db.mcp_writes(10).unwrap();
    assert_eq!(ledger.len(), 2);
    assert!(ledger.iter().all(|row| row.undone_at.is_some()));
    assert_eq!(ledger[1].source_name.as_deref(), Some("OpenCode"));
}

#[test]
fn a_record_the_user_changed_afterwards_is_not_rolled_back() {
    let db = Database::in_memory().unwrap();
    let created = db
        .apply_mcp_change(
            "save_injury",
            McpChange::Injury(injury(None, "小腿紧", None)),
            None,
        )
        .unwrap();
    let id: i64 = created.target_id.parse().unwrap();
    // 用户在桌面端自己又改了一次（不经过账本）。
    db.save_injury(&injury(Some(id), "小腿拉伤", None)).unwrap();
    assert_eq!(
        db.undo_mcp_write(created.write_id.unwrap()).unwrap(),
        UndoOutcome::Stale
    );
    assert_eq!(db.list_injuries().unwrap()[0].input.title, "小腿拉伤");
}

#[test]
fn an_unknown_record_is_refused_and_an_unchanged_write_is_not_ledgered() {
    let db = Database::in_memory().unwrap();
    assert!(db
        .apply_mcp_change(
            "save_injury",
            McpChange::Injury(injury(Some(99), "不存在", None)),
            None
        )
        .is_err());
    let created = db
        .apply_mcp_change(
            "save_injury",
            McpChange::Injury(injury(None, "腰", None)),
            None,
        )
        .unwrap();
    let id = created.target_id.parse().ok();
    let again = db
        .apply_mcp_change(
            "save_injury",
            McpChange::Injury(injury(id, "腰", None)),
            None,
        )
        .unwrap();
    assert_eq!(again.action, "unchanged");
    assert!(again.write_id.is_none());
    assert_eq!(db.mcp_writes(10).unwrap().len(), 1);
}

#[test]
fn a_remembered_note_counts_at_once_and_undo_keeps_the_ai_from_writing_it_back() {
    let db = Database::in_memory().unwrap();
    let applied = db
        .apply_mcp_change(
            "propose_coach_note",
            McpChange::CoachNote("左膝跑 15 km 以上会痛".into()),
            Some("Grok"),
        )
        .unwrap();
    assert!(matches!(
        applied.note,
        Some(Remembered::Remembered {
            was_proposed: false,
            ..
        })
    ));
    assert_eq!(db.athlete_profile().unwrap().coach_notes.len(), 1);
    assert_eq!(
        db.undo_mcp_write(applied.write_id.unwrap()).unwrap(),
        UndoOutcome::Undone
    );
    assert!(db.athlete_profile().unwrap().coach_notes.is_empty());
    let again = db
        .apply_mcp_change(
            "propose_coach_note",
            McpChange::CoachNote("左膝跑 15 km 以上会痛".into()),
            None,
        )
        .unwrap();
    assert_eq!(again.note, Some(Remembered::RejectedBefore));
    assert!(again.write_id.is_none());
}

#[test]
fn a_type_correction_is_undone_through_the_workout_edit_history() {
    let db = Database::in_memory().unwrap();
    let mut workout = workout_with_type(Some(1), "running", "numeric_mapped");
    workout.workout_id = "w1".into();
    db.insert_workout(&workout).unwrap();
    let applied = db
        .apply_mcp_change(
            "set_workout_type",
            McpChange::WorkoutType {
                workout_id: "w1".into(),
                workout_type: Some("trail_running".into()),
            },
            None,
        )
        .unwrap();
    let override_now = |db: &Database| -> Option<String> {
        db.conn
            .query_row(
                "SELECT workout_type_override FROM workouts WHERE workout_id = 'w1'",
                [],
                |row| row.get(0),
            )
            .unwrap()
    };
    assert_eq!(override_now(&db).as_deref(), Some("trail_running"));
    assert_eq!(
        db.undo_mcp_write(applied.write_id.unwrap()).unwrap(),
        UndoOutcome::Undone
    );
    assert_eq!(override_now(&db), None);
}

#[test]
fn ledger_failures_roll_back_writes_and_undos() {
    let db = Database::in_memory().unwrap();
    let add = || {
        db.apply_mcp_change(
            "save_injury",
            McpChange::Injury(injury(None, "Synthetic injury", None)),
            None,
        )
    };
    db.conn.execute_batch("CREATE TRIGGER fail_ledger BEFORE INSERT ON mcp_writes BEGIN SELECT RAISE(ABORT, 'synthetic'); END;").unwrap();
    assert!(add().is_err());
    assert!(db.list_injuries().unwrap().is_empty());
    db.conn.execute_batch("DROP TRIGGER fail_ledger").unwrap();
    let id = add().unwrap().write_id.unwrap();
    db.conn.execute_batch("CREATE TRIGGER fail_undo BEFORE UPDATE ON mcp_writes BEGIN SELECT RAISE(ABORT, 'synthetic'); END;").unwrap();
    assert!(db.undo_mcp_write(id).is_err());
    assert_eq!(db.list_injuries().unwrap().len(), 1);
    assert!(db.mcp_writes(1).unwrap()[0].undone_at.is_none());
    db.conn.execute_batch("DROP TRIGGER fail_undo").unwrap();
    assert_eq!(db.undo_mcp_write(id).unwrap(), UndoOutcome::Undone);
}

#[test]
fn undo_default_shoe_restores_the_previous_default_and_preserves_new_workout_links() {
    use crate::storage::logbook::{annotations::AnnotationInput, shoes::ShoeInput};
    let db = Database::in_memory().unwrap();
    let shoe = |name: &str| ShoeInput {
        id: None,
        name: name.into(),
        sport: "running".into(),
        is_default: true,
        zepp_gear_id: None,
        start_km: 0.0,
        retire_km: 500.0,
        started_on: "2026-11-01".into(),
        retired_on: None,
        notes: String::new(),
    };
    let previous = db.save_shoe(&shoe("A")).unwrap();
    let add = || {
        db.apply_mcp_change("save_shoe", McpChange::Shoe(shoe("B")), None)
            .unwrap()
    };
    let first = add();
    let defaults = || {
        db.list_shoe_rows()
            .unwrap()
            .into_iter()
            .filter(|shoe| shoe.input.is_default)
            .map(|shoe| shoe.input.id.unwrap())
            .collect::<Vec<_>>()
    };
    assert_eq!(defaults(), vec![first.target_id.parse::<i64>().unwrap()]);
    assert_eq!(
        db.undo_mcp_write(first.write_id.unwrap()).unwrap(),
        UndoOutcome::Undone
    );
    assert_eq!(defaults(), vec![previous]);

    let linked = add();
    let mut workout = workout_with_type(Some(1), "running", "numeric_mapped");
    workout.workout_id = "synthetic-linked".into();
    db.insert_workout(&workout).unwrap();
    db.save_workout_feel(&AnnotationInput {
        workout_id: workout.workout_id,
        rpe: None,
        soreness: Vec::new(),
        shoe_mode: "chosen".into(),
        shoe_id: Some(linked.target_id.parse().unwrap()),
    })
    .unwrap();
    assert_eq!(
        db.undo_mcp_write(linked.write_id.unwrap()).unwrap(),
        UndoOutcome::Stale
    );
    assert_eq!(db.list_shoe_rows().unwrap().len(), 2);
}
