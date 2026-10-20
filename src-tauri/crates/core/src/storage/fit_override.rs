//! 用户拿修正过的 `.fit` 顶替一条运动（#140）。
//!
//! 和 `corrections.rs` 一样是**第 3 层：用户的本地纠正**。云端原始报文不动，
//! 不回传云端（Zepp 开放接口没有导入运动的端点），重放也不动它：
//!
//! * 序列：每次云端明细入库（同步、重放）都会经过 [`Database::apply_cloud_series`]，
//!   有修正就写修正文件读出来的序列，云端那份只留在 `raw_records` 里；
//! * 汇总：每次云端摘要写进 `workouts` 后都会调 [`Database::reapply_fit_override_summary`]，
//!   先把刚写进来的云端值记进 `original_*`，再把修正值盖上去。撤销时原样放回。
//!
//! 所以界面、CLI、MCP、导出读到的都是修正版，不需要每个出口各认一遍。

use chrono::{DateTime, Utc};
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use super::payload::decode_raw_payload;
use super::util::{parse_datetime, workout_id_from_detail_key};
use super::Database;
use crate::decoder::{decode_workout_detail, DecodedWorkout};
use crate::export_fit::{decode_fit_file, ImportedFit};
use crate::models::error::Result;
use crate::normalizer::Normalizer;

/// 修正文件和原记录的起点最多能差多少秒。用户说修正时保留原来的起点；
/// 留 5 分钟余量给不同工具对「开始」的不同取法，再多就不是同一次运动了。
pub const FIT_START_TOLERANCE_SECONDS: i64 = 5 * 60;

/// 界面和 MCP 看到的修正信息。不含文件本身。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkoutFitOverride {
    pub workout_id: String,
    pub file_name: Option<String>,
    pub sha256: String,
    pub byte_len: i64,
    pub imported_at: String,
    pub distance_m: Option<f64>,
    pub moving_seconds: Option<i64>,
    /// 云端给的距离，撤销后回到这个值。
    pub original_distance_m: Option<f64>,
    pub original_moving_seconds: Option<i64>,
}

/// 导入的结果。拒绝的情况由调用方翻成 `err.workout_fit.*` 码。
#[derive(Debug, Clone, PartialEq)]
pub enum FitOverrideOutcome {
    Applied(WorkoutFitOverride),
    WorkoutMissing,
    StartMismatch {
        workout_start: DateTime<Utc>,
        fit_start: DateTime<Utc>,
    },
}

impl Database {
    /// 用一份已经读懂的修正文件顶替 `workout_id`。调用方负责拿写锁。
    pub fn import_workout_fit(
        &self,
        workout_id: &str,
        file_name: Option<&str>,
        bytes: &[u8],
        imported: &ImportedFit,
    ) -> Result<FitOverrideOutcome> {
        let workout_start: Option<String> = self
            .conn
            .query_row(
                "SELECT start_time FROM workouts WHERE workout_id = ?1",
                [workout_id],
                |row| row.get(0),
            )
            .optional()?;
        let Some(workout_start) = workout_start else {
            return Ok(FitOverrideOutcome::WorkoutMissing);
        };
        let workout_start = parse_datetime(&workout_start, "workouts.start_time")?;
        let fit_start = imported.decoded.start_time;
        if (fit_start - workout_start).num_seconds().abs() > FIT_START_TOLERANCE_SECONDS {
            return Ok(FitOverrideOutcome::StartMismatch {
                workout_start,
                fit_start,
            });
        }
        let summary = &imported.summary;
        let fit_end = summary.end_time.unwrap_or(imported.decoded.end_time);
        let tx = self.conn.unchecked_transaction()?;
        // 第一次导入时记下云端原值；再导一次（换了一份修正）不覆盖原值。
        tx.execute(
            "INSERT INTO workout_fit_overrides
                (workout_id, file_name, sha256, byte_len, fit, imported_at,
                 fit_start_time, fit_end_time, fit_distance_m, fit_moving_seconds,
                 fit_avg_hr, fit_max_hr,
                 original_end_time, original_distance_m, original_moving_seconds,
                 original_avg_hr, original_max_hr)
             SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12,
                    end_time, distance_meters, moving_seconds, avg_hr, max_hr
               FROM workouts WHERE workout_id = ?1
             ON CONFLICT(workout_id) DO UPDATE SET
                file_name = excluded.file_name,
                sha256 = excluded.sha256,
                byte_len = excluded.byte_len,
                fit = excluded.fit,
                imported_at = excluded.imported_at,
                fit_start_time = excluded.fit_start_time,
                fit_end_time = excluded.fit_end_time,
                fit_distance_m = excluded.fit_distance_m,
                fit_moving_seconds = excluded.fit_moving_seconds,
                fit_avg_hr = excluded.fit_avg_hr,
                fit_max_hr = excluded.fit_max_hr",
            params![
                workout_id,
                file_name.map(|name| name.chars().take(200).collect::<String>()),
                hex::encode(Sha256::digest(bytes)),
                bytes.len() as i64,
                bytes,
                Utc::now().to_rfc3339(),
                fit_start.to_rfc3339(),
                fit_end.to_rfc3339(),
                summary.distance_m,
                summary.moving_seconds,
                summary.avg_hr,
                summary.max_hr,
            ],
        )?;
        tx.commit()?;
        self.overlay_fit_summary(workout_id)?;
        self.replace_workout_series(workout_id, &imported.decoded)?;
        Ok(match self.workout_fit_override(workout_id)? {
            Some(info) => FitOverrideOutcome::Applied(info),
            None => FitOverrideOutcome::WorkoutMissing,
        })
    }

    /// 撤销修正：汇总放回云端原值，序列从本机最新的云端明细重新解出来。
    /// 返回 `false` 表示本来就没有修正。
    pub fn remove_workout_fit(&self, workout_id: &str) -> Result<bool> {
        let restored = self.conn.execute(
            "UPDATE workouts SET
                end_time = COALESCE(o.original_end_time, workouts.end_time),
                distance_meters = o.original_distance_m,
                moving_seconds = o.original_moving_seconds,
                avg_hr = o.original_avg_hr,
                max_hr = o.original_max_hr
             FROM workout_fit_overrides o
             WHERE o.workout_id = workouts.workout_id AND workouts.workout_id = ?1",
            [workout_id],
        )?;
        let removed = self.conn.execute(
            "DELETE FROM workout_fit_overrides WHERE workout_id = ?1",
            [workout_id],
        )?;
        if removed == 0 {
            return Ok(false);
        }
        let _ = restored;
        match self.decode_cloud_detail(workout_id)? {
            Some(decoded) => self.replace_workout_series(workout_id, &decoded)?,
            // 本机没有云端明细（只有摘要）：修正之前本来就没有序列。
            None => self.replace_workout_series(workout_id, &DecodedWorkout::default())?,
        }
        Ok(true)
    }

    pub fn workout_fit_override(&self, workout_id: &str) -> Result<Option<WorkoutFitOverride>> {
        self.conn
            .query_row(
                &format!("{OVERRIDE_SELECT} WHERE workout_id = ?1"),
                [workout_id],
                override_from_row,
            )
            .optional()
            .map_err(Into::into)
    }

    /// 本机所有修正，按导入时间排。CLI 的 `fit-override --list` 用它（#143：
    /// 修正只在本机，用户要在几台电脑上各做一遍，先得知道这台做过哪些）。
    pub fn list_workout_fit_overrides(&self) -> Result<Vec<WorkoutFitOverride>> {
        let mut stmt = self
            .conn
            .prepare(&format!("{OVERRIDE_SELECT} ORDER BY imported_at"))?;
        let rows = stmt.query_map([], override_from_row)?;
        Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
    }

    /// 云端明细入库的唯一入口：有修正就写修正文件的序列。
    pub(super) fn apply_cloud_series(
        &self,
        workout_id: &str,
        cloud: &DecodedWorkout,
    ) -> Result<()> {
        match self.fit_override_series(workout_id)? {
            Some(corrected) => self.replace_workout_series(workout_id, &corrected),
            None => self.replace_workout_series(workout_id, cloud),
        }
    }

    /// 云端摘要刚写进 `workouts` 之后调：有修正就把刚写的云端值记成原值，
    /// 再把修正值盖回去。没有修正时什么也不做。
    pub(super) fn reapply_fit_override_summary(&self, workout_id: &str) -> Result<()> {
        let updated = self.conn.execute(
            "UPDATE workout_fit_overrides SET
                original_end_time = w.end_time,
                original_distance_m = w.distance_meters,
                original_moving_seconds = w.moving_seconds,
                original_avg_hr = w.avg_hr,
                original_max_hr = w.max_hr
             FROM workouts w
             WHERE w.workout_id = workout_fit_overrides.workout_id
               AND workout_fit_overrides.workout_id = ?1",
            [workout_id],
        )?;
        if updated > 0 {
            self.overlay_fit_summary(workout_id)?;
        }
        Ok(())
    }

    /// 把修正值写进 `workouts`。修正文件没给的项保留云端值。
    fn overlay_fit_summary(&self, workout_id: &str) -> Result<()> {
        self.conn.execute(
            "UPDATE workouts SET
                end_time = o.fit_end_time,
                distance_meters = COALESCE(o.fit_distance_m, workouts.distance_meters),
                moving_seconds = COALESCE(o.fit_moving_seconds, workouts.moving_seconds),
                avg_hr = COALESCE(o.fit_avg_hr, workouts.avg_hr),
                max_hr = COALESCE(o.fit_max_hr, workouts.max_hr)
             FROM workout_fit_overrides o
             WHERE o.workout_id = workouts.workout_id AND workouts.workout_id = ?1",
            [workout_id],
        )?;
        Ok(())
    }

    fn fit_override_series(&self, workout_id: &str) -> Result<Option<DecodedWorkout>> {
        let bytes: Option<Vec<u8>> = self
            .conn
            .query_row(
                "SELECT fit FROM workout_fit_overrides WHERE workout_id = ?1",
                [workout_id],
                |row| row.get(0),
            )
            .optional()?;
        // 存进来时读得懂，再读一次也读得懂；真读不懂（库被外部改坏）就退回
        // 云端序列，不让一份坏文件把整次同步卡住。
        Ok(bytes
            .and_then(|bytes| decode_fit_file(&bytes).ok())
            .map(|imported| imported.decoded))
    }

    /// 本机最新的一份云端明细，按入库时的同一套参数解码。
    fn decode_cloud_detail(&self, workout_id: &str) -> Result<Option<DecodedWorkout>> {
        let legacy_prefix = format!("workout_detail:{workout_id}:");
        let official_key = format!(
            "{}sport_detail:{workout_id}",
            crate::official::fetch::SOURCE_PREFIX
        );
        let row: Option<(i64, String)> = self
            .conn
            .query_row(
                "SELECT id, source_key FROM raw_records
                  WHERE stream = 'workout_detail'
                    AND (substr(source_key, 1, length(?1)) = ?1 OR source_key = ?2)
                  ORDER BY fetched_at DESC, id DESC LIMIT 1",
                params![legacy_prefix, official_key],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()?;
        let Some((raw_id, source_key)) = row else {
            return Ok(None);
        };
        let Some((stored, zip)) = self.raw_payload(raw_id)? else {
            return Ok(None);
        };
        let payload: serde_json::Value = serde_json::from_str(&decode_raw_payload(stored, zip)?)?;
        let payload = if workout_id_from_detail_key(&source_key).is_some() {
            payload
        } else {
            Normalizer::official_detail_as_legacy(&payload)
        };
        let summary_end = self.workout_end_time(workout_id)?;
        let summary_distance = self.workout_distance_meters(workout_id)?;
        Ok(decode_workout_detail(&payload, summary_end, summary_distance).ok())
    }
}

const OVERRIDE_SELECT: &str = "SELECT workout_id, file_name, sha256, byte_len, imported_at,
        fit_distance_m, fit_moving_seconds,
        original_distance_m, original_moving_seconds
 FROM workout_fit_overrides";

fn override_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<WorkoutFitOverride> {
    Ok(WorkoutFitOverride {
        workout_id: row.get(0)?,
        file_name: row.get(1)?,
        sha256: row.get(2)?,
        byte_len: row.get(3)?,
        imported_at: row.get(4)?,
        distance_m: row.get(5)?,
        moving_seconds: row.get(6)?,
        original_distance_m: row.get(7)?,
        original_moving_seconds: row.get(8)?,
    })
}
