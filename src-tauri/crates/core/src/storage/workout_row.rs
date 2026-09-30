//! 运动详情的一行：单条（`get_workout_detail`）与批量（AI 任务的覆盖 / 锚点）共用。
//!
//! 以前两处各自把 31 个字段解成一个大元组，再各写一遍来源、别名、覆盖类型、心率分区的
//! 装配；加一个字段要改两处，漏一处就是「详情页有、交给 AI 的没有」。现在列清单、按列读取、
//! 装配成 `Workout` 各只有一份。加载（单条 `WHERE =` 还是批量 `IN (...)`）仍归调用方。
//! 列表页（`workouts_page`）故意只取约 18 个字段，不走这里。

use super::util::{parse_datetime, parse_scope};
use crate::models::error::Result;
use crate::models::{HeartRateZoneBucket, Workout};

/// `SELECT` 的列清单，顺序和 `WorkoutDetailRow::read` 的下标一一对应。
pub(crate) const WORKOUT_DETAIL_COLUMNS: &str = "workout_id, workout_type, start_time, end_time,
        distance_meters, calories, avg_hr, max_hr,
        training_load, vo2max, source_scope, device_id,
        synced_at, gps_available, sample_count, zepp_type,
        workout_type_source, workout_type_override,
        min_hr, total_steps, moving_seconds,
        elevation_gain_m, elevation_loss_m,
        max_altitude_m, min_altitude_m,
        training_effect, anaerobic_training_effect, rpe,
        avg_cadence_spm, max_cadence_spm, avg_stride_cm";

pub(crate) struct WorkoutDetailRow {
    pub(crate) workout_id: String,
    workout_type: String,
    start: String,
    end: String,
    distance_meters: Option<f64>,
    calories: Option<i32>,
    avg_hr: Option<i32>,
    max_hr: Option<i32>,
    training_load: Option<f64>,
    vo2max: Option<f64>,
    scope: String,
    device_id: Option<String>,
    synced_at: Option<String>,
    gps_available: i64,
    sample_count: i64,
    pub(crate) zepp_type: Option<i32>,
    type_source: String,
    user_override: Option<String>,
    min_hr: Option<i32>,
    total_steps: Option<i32>,
    moving_seconds: Option<i64>,
    elevation_gain_m: Option<f64>,
    elevation_loss_m: Option<f64>,
    max_altitude_m: Option<f64>,
    min_altitude_m: Option<f64>,
    training_effect: Option<f64>,
    anaerobic_training_effect: Option<f64>,
    rpe: Option<i32>,
    avg_cadence_spm: Option<f64>,
    max_cadence_spm: Option<f64>,
    avg_stride_cm: Option<f64>,
}

/// 装配时要从别的表补进来的东西。
pub(crate) struct WorkoutDetailExtras {
    pub(crate) hr_zones: Vec<HeartRateZoneBucket>,
    /// 本机存下的轨迹点数：有点就算有 GPS（即便云端标记说没有）。
    pub(crate) route_points: i64,
    /// 本机存下的逐秒采样数：和云端给的采样数取大的那个。
    pub(crate) stored_samples: i64,
    /// 用户给这个 Zepp 编号起的名字。
    pub(crate) custom_label: Option<String>,
}

impl WorkoutDetailRow {
    pub(crate) fn read(row: &rusqlite::Row<'_>) -> rusqlite::Result<Self> {
        Ok(Self {
            workout_id: row.get(0)?,
            workout_type: row.get(1)?,
            start: row.get(2)?,
            end: row.get(3)?,
            distance_meters: row.get(4)?,
            calories: row.get(5)?,
            avg_hr: row.get(6)?,
            max_hr: row.get(7)?,
            training_load: row.get(8)?,
            vo2max: row.get(9)?,
            scope: row.get(10)?,
            device_id: row.get(11)?,
            synced_at: row.get(12)?,
            gps_available: row.get(13)?,
            sample_count: row.get(14)?,
            zepp_type: row.get(15)?,
            type_source: row.get(16)?,
            user_override: row.get(17)?,
            min_hr: row.get(18)?,
            total_steps: row.get(19)?,
            moving_seconds: row.get(20)?,
            elevation_gain_m: row.get(21)?,
            elevation_loss_m: row.get(22)?,
            max_altitude_m: row.get(23)?,
            min_altitude_m: row.get(24)?,
            training_effect: row.get(25)?,
            anaerobic_training_effect: row.get(26)?,
            rpe: row.get(27)?,
            avg_cadence_spm: row.get(28)?,
            max_cadence_spm: row.get(29)?,
            avg_stride_cm: row.get(30)?,
        })
    }

    /// 装配成 `Workout`。时间坏了报 `err.core.parse`（`ParseError`），不吞掉。
    pub(crate) fn into_workout(self, extras: WorkoutDetailExtras) -> Result<Workout> {
        // 类型覆盖优先级：用户手动纠正 > 规范化后的类型。
        let effective_type = self
            .user_override
            .clone()
            .unwrap_or_else(|| self.workout_type.clone());
        Ok(Workout {
            min_hr: self.min_hr,
            total_steps: self.total_steps,
            moving_seconds: self.moving_seconds,
            elevation_gain_m: self.elevation_gain_m,
            elevation_loss_m: self.elevation_loss_m,
            max_altitude_m: self.max_altitude_m,
            min_altitude_m: self.min_altitude_m,
            training_effect: self.training_effect,
            anaerobic_training_effect: self.anaerobic_training_effect,
            rpe: self.rpe,
            avg_cadence_spm: self.avg_cadence_spm,
            max_cadence_spm: self.max_cadence_spm,
            avg_stride_cm: self.avg_stride_cm,
            hr_zones: extras.hr_zones,
            start_time: parse_datetime(&self.start, "workout.start_time")?,
            end_time: parse_datetime(&self.end, "workout.end_time")?,
            workout_id: self.workout_id,
            normalized_type: self.workout_type.clone(),
            workout_type: self.workout_type,
            type_source: self.type_source,
            user_override: self.user_override,
            effective_type,
            custom_label: extras.custom_label,
            distance_meters: self.distance_meters,
            calories: self.calories,
            avg_hr: self.avg_hr,
            max_hr: self.max_hr,
            training_load: self.training_load,
            vo2max: self.vo2max,
            source_scope: parse_scope(&self.scope)?,
            device_id: self.device_id,
            synced_at: self
                .synced_at
                .as_deref()
                .map(|value| parse_datetime(value, "workout.synced_at"))
                .transpose()?,
            gps_available: self.gps_available != 0 || extras.route_points > 0,
            sample_count: self.sample_count.max(extras.stored_samples),
            zepp_source: None,
            zepp_type: self.zepp_type,
        })
    }
}
