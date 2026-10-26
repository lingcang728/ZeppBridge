//! 导入的运动落库、列出、整批撤销（批次 7，读文件在 `crate::import`）。
//!
//! 一次导入是一批（`import_batches`），每条导入的运动在 `workout_imports` 里记着它来自哪一批、
//! 哪种来源。运动行本身写进 `workouts`（`raw_record_id` 为空，重放不碰），序列走和云端明细
//! 同一个 `replace_workout_series`。
//!
//! 去重：本机已经有一条起点相差两分钟以内的运动（云端同步来的，或者上一批导入的），就不再
//! 导入——Apple 健康里多半就有 Zepp 同步过去的那一份。同一批里重复的也只留一条。

use chrono::{DateTime, Utc};
use rusqlite::params;
use serde::Serialize;

use super::Database;
use crate::import::{ImportSource, ParsedActivity, ParsedFile};
use crate::models::error::Result;
use crate::models::{SourceScope, Workout};

/// 起点相差这么多秒以内算同一次运动。
pub const DUPLICATE_WINDOW_SECONDS: i64 = 120;

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct ImportReport {
    /// 一条都没加进来（全是重复或读不懂）时没有批次。
    pub batch_id: Option<i64>,
    pub added: usize,
    pub duplicates: usize,
    pub unreadable: usize,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct ImportBatch {
    pub id: i64,
    pub source: String,
    pub file_name: Option<String>,
    pub imported_at: String,
    pub added: i64,
    pub duplicates: i64,
    pub unreadable: i64,
    /// 撤销过的批次留一行记录（什么时候撤的），运动已经删掉。
    pub undone_at: Option<String>,
    /// 这一批运动的起止日期（还在库里的那些）。
    pub first_start: Option<String>,
    pub last_start: Option<String>,
}

impl Database {
    /// 把读好的一份文件落库成一批。调用方负责拿写锁。
    pub fn import_activities(
        &self,
        source: ImportSource,
        file_name: Option<&str>,
        parsed: ParsedFile,
        now: DateTime<Utc>,
    ) -> Result<ImportReport> {
        let mut activities = parsed.activities;
        activities.sort_by_key(|activity| activity.start_time);
        let mut fresh: Vec<ParsedActivity> = Vec::new();
        let mut duplicates = 0;
        for activity in activities {
            let in_batch = fresh.last().is_some_and(|previous| {
                (activity.start_time - previous.start_time)
                    .num_seconds()
                    .abs()
                    <= DUPLICATE_WINDOW_SECONDS
            });
            if in_batch || self.has_workout_near(activity.start_time)? {
                duplicates += 1;
            } else {
                fresh.push(activity);
            }
        }
        if fresh.is_empty() {
            return Ok(ImportReport {
                batch_id: None,
                added: 0,
                duplicates,
                unreadable: parsed.unreadable,
            });
        }

        self.conn.execute_batch("BEGIN IMMEDIATE;")?;
        let written = (|| -> Result<i64> {
            self.conn.execute(
                "INSERT INTO import_batches(source, file_name, imported_at, added, duplicates, unreadable)
                 VALUES(?1, ?2, ?3, ?4, ?5, ?6)",
                params![
                    source.as_str(),
                    file_name,
                    now.to_rfc3339(),
                    fresh.len() as i64,
                    duplicates as i64,
                    parsed.unreadable as i64
                ],
            )?;
            let batch_id = self.conn.last_insert_rowid();
            for (index, activity) in fresh.iter().enumerate() {
                let workout_id = format!("import-{batch_id}-{}", index + 1);
                self.insert_workout(&imported_workout(&workout_id, activity, now))?;
                if let Some(decoded) = &activity.decoded {
                    self.replace_workout_series(&workout_id, decoded)?;
                }
                self.conn.execute(
                    "INSERT INTO workout_imports(workout_id, batch_id, source, name) VALUES(?1, ?2, ?3, ?4)",
                    params![workout_id, batch_id, source.as_str(), activity.name],
                )?;
            }
            Ok(batch_id)
        })();
        match written {
            Ok(batch_id) => {
                self.conn.execute_batch("COMMIT;")?;
                Ok(ImportReport {
                    batch_id: Some(batch_id),
                    added: fresh.len(),
                    duplicates,
                    unreadable: parsed.unreadable,
                })
            }
            Err(error) => {
                let _ = self.conn.execute_batch("ROLLBACK;");
                Err(error)
            }
        }
    }

    fn has_workout_near(&self, start: DateTime<Utc>) -> Result<bool> {
        // start_time 存的是 RFC 3339；按 julianday 比，时区写法不同也能比。
        Ok(self.conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM workouts
                WHERE ABS(julianday(start_time) - julianday(?1)) * 86400 <= ?2)",
            params![start.to_rfc3339(), DUPLICATE_WINDOW_SECONDS],
            |row| row.get(0),
        )?)
    }

    /// 撤销一批：删掉这一批的运动和它们的序列，批次留一行「什么时候撤的」。返回删了几条。
    pub fn undo_import_batch(&self, batch_id: i64, now: DateTime<Utc>) -> Result<usize> {
        self.conn.execute_batch("BEGIN IMMEDIATE;")?;
        let done = (|| -> Result<usize> {
            let ids: Vec<String> = {
                let mut stmt = self
                    .conn
                    .prepare("SELECT workout_id FROM workout_imports WHERE batch_id = ?1")?;
                let rows = stmt.query_map([batch_id], |row| row.get(0))?;
                rows.collect::<std::result::Result<_, _>>()?
            };
            for id in &ids {
                for table in [
                    "workout_samples",
                    "route_points",
                    "workout_pauses",
                    "workout_splits",
                    "workout_laps",
                    "workout_hr_zones",
                    "workout_local_state",
                    "workout_annotations",
                    "workout_feedback",
                    "workout_fit_overrides",
                    "workout_detail_requests",
                    "workout_detail_fetch_attempts",
                    "workouts",
                ] {
                    self.conn
                        .execute(&format!("DELETE FROM {table} WHERE workout_id = ?1"), [id])?;
                }
            }
            self.conn.execute(
                "DELETE FROM workout_imports WHERE batch_id = ?1",
                [batch_id],
            )?;
            self.conn.execute(
                "UPDATE import_batches SET undone_at = ?2 WHERE id = ?1 AND undone_at IS NULL",
                params![batch_id, now.to_rfc3339()],
            )?;
            Ok(ids.len())
        })();
        match done {
            Ok(count) => {
                self.conn.execute_batch("COMMIT;")?;
                Ok(count)
            }
            Err(error) => {
                let _ = self.conn.execute_batch("ROLLBACK;");
                Err(error)
            }
        }
    }

    /// 全部导入批次，新的在前。
    pub fn import_batches(&self) -> Result<Vec<ImportBatch>> {
        let mut stmt = self.conn.prepare(
            "SELECT b.id, b.source, b.file_name, b.imported_at, b.added, b.duplicates, b.unreadable,
                    b.undone_at, MIN(w.start_time), MAX(w.start_time)
             FROM import_batches b
             LEFT JOIN workout_imports i ON i.batch_id = b.id
             LEFT JOIN workouts w ON w.workout_id = i.workout_id
             GROUP BY b.id ORDER BY b.id DESC",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(ImportBatch {
                id: row.get(0)?,
                source: row.get(1)?,
                file_name: row.get(2)?,
                imported_at: row.get(3)?,
                added: row.get(4)?,
                duplicates: row.get(5)?,
                unreadable: row.get(6)?,
                undone_at: row.get(7)?,
                first_start: row.get(8)?,
                last_start: row.get(9)?,
            })
        })?;
        Ok(rows.collect::<std::result::Result<_, _>>()?)
    }

    /// 导入的运动各自来自哪里（`workout_id` → `gpx` / `fit` / `strava` / `apple_health`），列表上标来源用。
    pub fn workout_import_sources(&self) -> Result<Vec<(String, String)>> {
        let mut stmt = self
            .conn
            .prepare("SELECT workout_id, source FROM workout_imports")?;
        let rows = stmt.query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?;
        Ok(rows.collect::<std::result::Result<_, _>>()?)
    }
}

fn imported_workout(workout_id: &str, activity: &ParsedActivity, now: DateTime<Utc>) -> Workout {
    let route = activity
        .decoded
        .as_ref()
        .map_or(0, |decoded| decoded.route.len());
    let samples = activity
        .decoded
        .as_ref()
        .map_or(0, |decoded| decoded.samples.len());
    Workout {
        workout_id: workout_id.to_string(),
        workout_type: activity.sport.clone(),
        normalized_type: activity.sport.clone(),
        type_source: "imported".to_string(),
        user_override: None,
        effective_type: activity.sport.clone(),
        custom_label: None,
        start_time: activity.start_time,
        end_time: activity.end_time,
        distance_meters: activity.distance_m,
        calories: activity.calories,
        avg_hr: activity.avg_hr,
        max_hr: activity.max_hr,
        training_load: None,
        vo2max: None,
        min_hr: None,
        total_steps: None,
        moving_seconds: activity.moving_seconds,
        elevation_gain_m: activity.elevation_gain_m,
        elevation_loss_m: None,
        max_altitude_m: None,
        min_altitude_m: None,
        training_effect: None,
        anaerobic_training_effect: None,
        rpe: None,
        avg_cadence_spm: None,
        max_cadence_spm: None,
        avg_stride_cm: None,
        gear_id: None,
        hr_zones: Vec::new(),
        source_scope: SourceScope::Device,
        device_id: None,
        // 导入的时间，不是云端拉取时间——导入的运动从来没经过云端。
        synced_at: Some(now),
        gps_available: route > 0,
        sample_count: samples as i64,
        zepp_source: None,
        zepp_type: None,
    }
}
