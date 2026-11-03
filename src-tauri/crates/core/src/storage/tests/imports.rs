use super::*;
use crate::import::{ImportSource, ParsedActivity, ParsedFile};

fn activity(start: DateTime<Utc>) -> ParsedActivity {
    let gpx = format!(
        r#"<gpx><trk><type>run</type><trkseg>
          <trkpt lat="31" lon="121"><time>{}</time></trkpt>
          <trkpt lat="31.01" lon="121"><time>{}</time></trkpt>
        </trkseg></trk></gpx>"#,
        start.to_rfc3339(),
        (start + chrono::Duration::minutes(6)).to_rfc3339()
    );
    crate::import::gpx::parse_gpx(&gpx, None)
        .activities
        .remove(0)
}

fn file(starts: &[DateTime<Utc>]) -> ParsedFile {
    ParsedFile {
        activities: starts.iter().map(|start| activity(*start)).collect(),
        unreadable: 2,
    }
}

#[test]
fn import_skips_workouts_already_here_and_undo_removes_the_whole_batch() {
    let db = Database::in_memory().unwrap();
    let synced = workout_with_type(None, "run", "numeric_mapped");
    db.insert_workout(&synced).unwrap();
    let minute = chrono::Duration::minutes(1);
    let day = chrono::Duration::days(1);
    // 第一条和云端那条差一分钟（同一次运动），第三条和第二条在同一批里重复。
    let report = db
        .import_activities(
            ImportSource::Gpx,
            Some("a.gpx"),
            file(&[ts() + minute, ts() + day, ts() + day + minute]),
            ts(),
        )
        .unwrap();
    assert_eq!(
        (report.added, report.duplicates, report.unreadable),
        (1, 2, 2)
    );
    let batch = report.batch_id.unwrap();
    let id = format!("import-{batch}-1");
    let stored = db.get_workout_detail(&id).unwrap().unwrap();
    assert_eq!(stored.type_source, "imported");
    assert!(stored.gps_available);
    assert_eq!(
        db.workout_import_sources().unwrap(),
        vec![(id.clone(), "gpx".to_string())]
    );

    // 再导一遍同一份：全是重复，不建空批次。
    let again = db
        .import_activities(ImportSource::Gpx, None, file(&[ts() + day]), ts())
        .unwrap();
    assert_eq!(
        (again.batch_id, again.added, again.duplicates),
        (None, 0, 1)
    );

    assert_eq!(db.undo_import_batch(batch, ts()).unwrap(), 1);
    assert!(db.get_workout_detail(&id).unwrap().is_none());
    let route: i64 = db
        .conn
        .query_row(
            "SELECT COUNT(*) FROM route_points WHERE workout_id = ?1",
            [&id],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(route, 0);
    let batches = db.import_batches().unwrap();
    assert_eq!(batches.len(), 1);
    assert!(batches[0].undone_at.is_some());
    // 云端那条不受影响。
    assert!(db.get_workout_detail(&synced.workout_id).unwrap().is_some());
}

#[test]
fn retention_cleanup_keeps_imported_workouts() {
    let db = Database::in_memory().unwrap();
    let old = Utc::now() - chrono::Duration::days(400);
    let report = db
        .import_activities(ImportSource::Fit, None, file(&[old]), Utc::now())
        .unwrap();
    let id = format!("import-{}-1", report.batch_id.unwrap());
    db.cleanup_old_data(30).unwrap();
    // 导入的运动没有云端明细可拉，不算进明细覆盖。
    let coverage = db.workout_detail_coverage().unwrap();
    assert_eq!((coverage.pending, coverage.unavailable), (0, 0));
    assert!(db.get_workout_detail(&id).unwrap().is_some());
    let samples: i64 = db
        .conn
        .query_row(
            "SELECT COUNT(*) FROM workout_samples WHERE workout_id = ?1",
            [&id],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(samples, 2);
}
