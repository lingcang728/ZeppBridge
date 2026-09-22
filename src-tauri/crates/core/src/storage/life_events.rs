//! User-authored calendar context, independent of cloud facts and retention.
use super::Database;
use crate::models::{error::Result, ZeppBridgeError};
use chrono::{NaiveDate, Utc};
use rusqlite::params;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LifeEventInput {
    pub id: Option<i64>,
    pub title: String,
    pub category: String,
    pub start_date: String,
    /// None means still ongoing; a single day has end_date == start_date.
    pub end_date: Option<String>,
    pub notes: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LifeEvent {
    #[serde(flatten)]
    pub input: LifeEventInput,
    pub created_at: String,
    pub updated_at: String,
}

fn invalid() -> ZeppBridgeError {
    ZeppBridgeError::ConfigError("Invalid life event".into())
}

fn valid_date(value: &str) -> bool {
    NaiveDate::parse_from_str(value, "%Y-%m-%d")
        .is_ok_and(|date| date.format("%Y-%m-%d").to_string() == value)
}

impl Database {
    pub fn list_life_events(
        &self,
        start: Option<&str>,
        end: Option<&str>,
    ) -> Result<Vec<LifeEvent>> {
        if start.is_some_and(|s| !valid_date(s))
            || end.is_some_and(|s| !valid_date(s))
            || matches!((start, end), (Some(s), Some(e)) if s > e)
        {
            return Err(invalid());
        }
        let mut stmt = self.conn.prepare(
            "SELECT id, title, category, start_date, end_date, notes, created_at, updated_at
             FROM life_events WHERE (?1 IS NULL OR end_date IS NULL OR end_date >= ?1)
             AND (?2 IS NULL OR start_date <= ?2) ORDER BY start_date DESC, id DESC",
        )?;
        let rows = stmt.query_map(params![start, end], |row| {
            Ok(LifeEvent {
                input: LifeEventInput {
                    id: Some(row.get(0)?),
                    title: row.get(1)?,
                    category: row.get(2)?,
                    start_date: row.get(3)?,
                    end_date: row.get(4)?,
                    notes: row.get(5)?,
                },
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
            })
        })?;
        Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
    }

    pub fn save_life_event(&self, input: &LifeEventInput) -> Result<i64> {
        let title = input.title.trim();
        if title.is_empty()
            || title.chars().count() > 120
            || input.notes.chars().count() > 4000
            || !["health", "travel", "routine", "training", "other"]
                .contains(&input.category.as_str())
            || !valid_date(&input.start_date)
            || input
                .end_date
                .as_ref()
                .is_some_and(|e| !valid_date(e) || e < &input.start_date)
            || input.id.is_some_and(|id| id <= 0)
        {
            return Err(invalid());
        }
        let now = Utc::now().to_rfc3339();
        if let Some(id) = input.id {
            let changed = self.conn.execute(
                "UPDATE life_events SET title=?1, category=?2, start_date=?3, end_date=?4,
                 notes=?5, updated_at=?6 WHERE id=?7",
                params![
                    title,
                    input.category,
                    input.start_date,
                    input.end_date,
                    input.notes,
                    now,
                    id
                ],
            )?;
            if changed == 0 {
                return Err(invalid());
            }
            Ok(id)
        } else {
            self.conn.execute(
                "INSERT INTO life_events(title, category, start_date, end_date, notes, created_at, updated_at)
                 VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?6)",
                params![title, input.category, input.start_date, input.end_date, input.notes, now])?;
            Ok(self.conn.last_insert_rowid())
        }
    }

    pub fn delete_life_event(&self, id: i64) -> Result<()> {
        self.conn
            .execute("DELETE FROM life_events WHERE id=?1", [id])?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{ExportDetail, ExportScope, ExportSelection};
    fn event() -> LifeEventInput {
        LifeEventInput {
            id: None,
            title: "感冒 / Resfriado".into(),
            category: "health".into(),
            start_date: "2026-09-01".into(),
            end_date: Some("2026-09-05".into()),
            notes: "User context".into(),
        }
    }
    #[test]
    fn life_events_crud_overlap_and_validation() {
        let db = Database::in_memory().unwrap();
        let mut e = event();
        e.id = Some(db.save_life_event(&e).unwrap());
        assert_eq!(
            db.list_life_events(Some("2026-09-05"), Some("2026-09-10"))
                .unwrap()
                .len(),
            1
        );
        assert!(db
            .list_life_events(Some("2026-09-06"), None)
            .unwrap()
            .is_empty());
        e.end_date = None;
        db.save_life_event(&e).unwrap();
        assert_eq!(
            db.list_life_events(Some("2027-01-01"), None).unwrap().len(),
            1
        );
        for bad in ["2026-02-30", "2026-9-01", "2026-09-01T00:00:00Z"] {
            let mut invalid = e.clone();
            invalid.start_date = bad.into();
            assert!(db.save_life_event(&invalid).is_err());
        }
        let mut invalid = e.clone();
        invalid.end_date = Some("2026-08-31".into());
        assert!(db.save_life_event(&invalid).is_err());
        db.delete_life_event(e.id.unwrap()).unwrap();
        assert!(db.list_life_events(None, None).unwrap().is_empty());
        assert!(db.save_life_event(&e).is_err());
    }
    #[test]
    fn life_events_export_is_opt_in_and_preserves_original_range() {
        let db = Database::in_memory().unwrap();
        db.save_life_event(&event()).unwrap();
        let mut selection = ExportSelection {
            scope: Some(ExportScope::date_range("2026-09-03", "2026-09-10")),
            start_date: None,
            end_date: None,
            data_types: vec!["life_events".into()],
            detail: ExportDetail::Summary,
        };
        let (text, count) = db.build_ai_export(&selection).unwrap();
        let json: serde_json::Value = serde_json::from_str(&text).unwrap();
        assert_eq!(count, 1);
        assert_eq!(json["data"]["life_events"][0]["startDate"], "2026-09-01");
        assert_eq!(
            json["data"]["life_events"][0]["source_scope"],
            "user_authored"
        );
        selection.data_types = vec!["heart_rate".into()];
        let (text, count) = db.build_ai_export(&selection).unwrap();
        assert_eq!(count, 0);
        assert!(!text.contains("Resfriado"));
    }
    #[test]
    fn life_events_workout_context_covers_both_sides_of_midnight() {
        use chrono::{Local, TimeZone};
        let db = Database::in_memory().unwrap();
        let start = Local
            .with_ymd_and_hms(2026, 9, 1, 23, 50, 0)
            .unwrap()
            .to_rfc3339();
        let end = Local
            .with_ymd_and_hms(2026, 9, 2, 0, 20, 0)
            .unwrap()
            .to_rfc3339();
        db.conn
            .execute(
                "INSERT INTO workouts(workout_id, workout_type, start_time, end_time, source_scope)
            VALUES('night-run', 'running', ?1, ?2, 'device')",
                params![start, end],
            )
            .unwrap();
        for day in ["2026-08-31", "2026-09-01", "2026-09-02", "2026-09-03"] {
            let mut e = event();
            e.start_date = day.into();
            e.end_date = Some(day.into());
            db.save_life_event(&e).unwrap();
        }
        let selection = ExportSelection {
            scope: Some(ExportScope::Workout {
                workout_id: "night-run".into(),
            }),
            start_date: None,
            end_date: None,
            data_types: vec!["life_events".into()],
            detail: ExportDetail::Summary,
        };
        let (text, count) = db.build_ai_export(&selection).unwrap();
        let json: serde_json::Value = serde_json::from_str(&text).unwrap();
        assert_eq!(count, 2);
        assert_eq!(json["data"]["life_events"][0]["startDate"], "2026-09-02");
        assert_eq!(json["data"]["life_events"][1]["startDate"], "2026-09-01");
    }
    #[test]
    fn life_events_survive_replay_retention_migration_and_backup_restore() {
        use crate::storage::backup::{
            apply_pending_restore, create_backup, stage_restore, BackupKind,
        };
        let dir = std::env::temp_dir().join(format!("zepp-life-events-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("zepp.db");
        let db = Database::new(path.clone()).unwrap();
        let id = db.save_life_event(&event()).unwrap();
        db.cleanup_old_data(1).unwrap();
        db.reprocess_raw_records().unwrap();
        // A subsequent migration run must not erase user-authored records.
        db.conn.execute_batch("PRAGMA user_version = 22;").unwrap();
        drop(db);
        let db = Database::open_migrated(&path).unwrap();
        assert_eq!(db.list_life_events(None, None).unwrap().len(), 1);
        let backup = create_backup(&dir, BackupKind::Manual, "2.2.4").unwrap();
        assert_eq!(backup.table_counts.get("life_events"), Some(&1));
        db.delete_life_event(id).unwrap();
        drop(db);
        stage_restore(&dir, &backup.id, "2.2.4").unwrap();
        assert!(apply_pending_restore(&dir).unwrap().succeeded);
        let db = Database::open_migrated(&path).unwrap();
        assert_eq!(
            db.list_life_events(None, None).unwrap()[0].input.title,
            event().title
        );
        drop(db);
        std::fs::remove_dir_all(dir).unwrap();
    }
}
