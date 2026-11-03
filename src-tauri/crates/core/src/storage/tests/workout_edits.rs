use super::*;

fn seed(db: &Database, id: &str) -> Workout {
    let mut workout = workout_with_type(Some(1), "running", "numeric_mapped");
    workout.workout_id = id.into();
    workout.distance_meters = Some(1000.0);
    db.insert_workout(&workout).unwrap();
    workout
}

fn ids(values: &[&str]) -> Vec<String> {
    values.iter().map(|value| (*value).into()).collect()
}

fn history_count(db: &Database) -> i64 {
    db.conn
        .query_row("SELECT COUNT(*) FROM workout_edit_history", [], |r| {
            r.get(0)
        })
        .unwrap()
}

#[test]
fn batch_edits_roll_back_invalid_ids_and_mid_batch_sql_failures() {
    let db = Database::in_memory().unwrap();
    seed(&db, "a");
    seed(&db, "b");
    assert!(db
        .edit_workouts(&ids(&["a", "missing"]), Some(Some("hiking")), Some(true))
        .is_err());
    assert_eq!(db.count_workouts().unwrap(), 2);
    assert_eq!(history_count(&db), 0);
    assert!(db
        .get_workout_detail("a")
        .unwrap()
        .unwrap()
        .user_override
        .is_none());
    db.conn
        .execute_batch(
            "CREATE TEMP TRIGGER fail_second_edit BEFORE INSERT ON workout_local_state
         WHEN NEW.workout_id = 'b' BEGIN SELECT RAISE(ABORT, 'injected write failure'); END;",
        )
        .unwrap();
    assert!(db
        .edit_workouts(&ids(&["a", "b"]), Some(Some("hiking")), Some(true))
        .is_err());
    assert_eq!(db.count_hidden_workouts().unwrap(), 0);
    assert_eq!(history_count(&db), 0);
    assert!(db
        .get_workout_detail("a")
        .unwrap()
        .unwrap()
        .user_override
        .is_none());
    assert!(db.conn.is_autocommit());
}

#[test]
fn batch_undo_is_atomic_and_can_retry_after_a_write_failure() {
    let db = Database::in_memory().unwrap();
    seed(&db, "a");
    seed(&db, "b");
    let edit = db
        .edit_workouts(&ids(&["a", "b", "a"]), Some(Some(" HIKING ")), Some(true))
        .unwrap();
    assert_eq!(edit.changed, 2);
    db.conn
        .execute_batch(
            "CREATE TEMP TRIGGER fail_second_undo BEFORE UPDATE ON workout_local_state
         WHEN NEW.workout_id = 'b' BEGIN SELECT RAISE(ABORT, 'injected undo failure'); END;",
        )
        .unwrap();
    assert!(db.undo_workout_edit(&edit.id).is_err());
    assert_eq!(db.count_hidden_workouts().unwrap(), 2);
    assert_eq!(
        db.hidden_workouts_page(10, 0).unwrap()[0]
            .user_override
            .as_deref(),
        Some("hiking")
    );
    db.conn
        .execute_batch("DROP TRIGGER fail_second_undo")
        .unwrap();
    assert_eq!(db.undo_workout_edit(&edit.id).unwrap(), 2);
    assert_eq!(db.count_workouts().unwrap(), 2);
    assert!(db.undo_workout_edit(&edit.id).is_err());
}

#[test]
fn undo_rejects_newer_overlapping_edits_even_when_values_return_to_the_same_state() {
    let db = Database::in_memory().unwrap();
    seed(&db, "a");
    seed(&db, "b");
    let first = db
        .edit_workouts(&ids(&["a"]), Some(Some("hiking")), None)
        .unwrap();
    let second = db
        .edit_workouts(&ids(&["a"]), Some(Some("road_cycling")), None)
        .unwrap();
    let third = db
        .edit_workouts(&ids(&["a"]), Some(Some("hiking")), None)
        .unwrap();
    let unrelated = db.edit_workouts(&ids(&["b"]), None, Some(true)).unwrap();
    assert!(db.undo_workout_edit(&first.id).is_err());
    db.undo_workout_edit(&third.id).unwrap();
    db.undo_workout_edit(&second.id).unwrap();
    db.undo_workout_edit(&first.id).unwrap();
    assert!(db
        .get_workout_detail("a")
        .unwrap()
        .unwrap()
        .user_override
        .is_none());
    assert_eq!(db.count_hidden_workouts().unwrap(), 1);
    db.undo_workout_edit(&unrelated.id).unwrap();
}

#[test]
fn hidden_workouts_block_public_series_and_exports_but_keep_internal_detail_writes() {
    let db = Database::in_memory().unwrap();
    let workout = seed(&db, "a");
    db.conn.execute("INSERT INTO workout_hr_zones(workout_id, zone_index, upper_bound_bpm, seconds) VALUES('a', 1, 140, 60)", []).unwrap();
    let edit = db.edit_workouts(&ids(&["a"]), None, Some(true)).unwrap();
    assert!(db.get_workout_detail("a").unwrap().is_none());
    assert!(db.get_recent_workouts(10).unwrap().is_empty());
    assert!(db.get_health_overview().unwrap().coverage.is_none());
    // Storage/backup coverage still knows the original row exists.
    assert!(db
        .local_coverage(ts().date_naive())
        .unwrap()
        .earliest_day
        .is_some());
    assert!(db.workout_hr_zones("a").unwrap().is_empty());
    assert!(db.get_workout_series("a").is_err());
    assert!(
        parsed_export(&db, &["workouts"], ExportDetail::Full)["data"]["workouts"]
            .as_array()
            .unwrap()
            .is_empty()
    );
    let selection = ExportSelection {
        scope: Some(ExportScope::Workout {
            workout_id: "a".into(),
        }),
        start_date: None,
        end_date: None,
        data_types: vec!["workouts".into()],
        detail: ExportDetail::Full,
    };
    assert!(db.build_ai_export(&selection).is_err());
    assert!(db.workout_exists("a").unwrap());
    assert_eq!(db.workout_distance_meters("a").unwrap(), Some(1000.0));
    assert_eq!(db.workout_end_time("a").unwrap(), Some(workout.end_time));
    db.replace_workout_series("a", &crate::decoder::DecodedWorkout::default())
        .unwrap();
    db.conn
        .execute(
            "INSERT INTO workout_samples(workout_id, timestamp, heart_rate) VALUES('a', ?1, 140)",
            [ts().to_rfc3339()],
        )
        .unwrap();
    db.undo_workout_edit(&edit.id).unwrap();
    assert_eq!(db.get_workout_series("a").unwrap().samples.len(), 1);
    assert_eq!(db.workout_hr_zones("a").unwrap().len(), 1);
}

#[test]
fn local_hidden_state_and_cleared_type_survive_upserts_and_retention_reinsertion() {
    let db = Database::in_memory().unwrap();
    let mut workout = seed(&db, "a");
    db.edit_workouts(&ids(&["a"]), Some(Some("hiking")), Some(true))
        .unwrap();
    db.insert_workout(&workout).unwrap();
    assert_eq!(
        db.hidden_workouts_page(10, 0).unwrap()[0]
            .user_override
            .as_deref(),
        Some("hiking")
    );
    db.edit_workouts(&ids(&["a"]), Some(None), None).unwrap();
    workout.user_override = Some("hiking".into());
    db.insert_workout(&workout).unwrap();
    assert!(db.hidden_workouts_page(10, 0).unwrap()[0]
        .user_override
        .is_none());
    db.cleanup_old_data(30).unwrap();
    assert!(!db.workout_exists("a").unwrap());
    db.insert_workout(&workout).unwrap();
    assert_eq!(db.count_workouts().unwrap(), 0);
    assert!(db.hidden_workouts_page(10, 0).unwrap()[0]
        .user_override
        .is_none());
    db.edit_workouts(&ids(&["a"]), None, Some(false)).unwrap();
    assert_eq!(db.count_workouts().unwrap(), 1);
}

#[test]
fn cloud_replay_preserves_hidden_state_and_the_local_override() {
    let db = Database::in_memory().unwrap();
    db.insert_raw_record(&RawRecord {
        stream: "workouts".into(), source_key: "sport_history:run:local-edit".into(),
        source_scope: SourceScope::Device, device_id: None, start_utc: ts(), end_utc: None,
        payload: serde_json::json!({"data": [{"trackid": 1700000000i64, "end_time": 1700000600i64, "type": 1, "dis": "2600"}]}),
        capability: CapabilityStatus::Verified,
    }).unwrap();
    db.reprocess_raw_records().unwrap();
    let edit = db
        .edit_workouts(&ids(&["1700000000"]), Some(Some("hiking")), Some(true))
        .unwrap();
    db.reprocess_raw_records().unwrap();
    let hidden = db.hidden_workouts_page(10, 0).unwrap();
    assert_eq!(hidden.len(), 1);
    assert_eq!(hidden[0].user_override.as_deref(), Some("hiking"));
    assert_eq!(db.count_workouts().unwrap(), 0);
    db.undo_workout_edit(&edit.id).unwrap();
    assert_eq!(db.count_workouts().unwrap(), 1);
}
