//! 归一化结果的写入（样本、日指标、睡眠、运动）（从 storage/mod.rs 按领域拆出，逻辑不变）。

use super::*;

#[derive(Debug, Clone)]
pub(super) struct StoredWorkoutType {
    pub(super) normalized_type: String,
    pub(super) type_source: String,
    pub(super) user_override: Option<String>,
    pub(super) zepp_type: Option<i32>,
    pub(super) conflict: Option<String>,
}

pub(super) fn type_evidence_rank(source: &str) -> u8 {
    match source {
        "numeric_mapped" | "unknown_code" => 3,
        "string_field" => 2,
        _ => 1,
    }
}

pub(super) fn merge_workout_type(
    existing: Option<StoredWorkoutType>,
    incoming: &Workout,
) -> StoredWorkoutType {
    let Some(existing) = existing else {
        return StoredWorkoutType {
            normalized_type: incoming.normalized_type.clone(),
            type_source: incoming.type_source.clone(),
            user_override: incoming.user_override.clone(),
            zepp_type: incoming.zepp_type,
            conflict: None,
        };
    };

    let old_rank = type_evidence_rank(&existing.type_source);
    let new_rank = type_evidence_rank(&incoming.type_source);
    let mut merged = if new_rank > old_rank {
        StoredWorkoutType {
            normalized_type: incoming.normalized_type.clone(),
            type_source: incoming.type_source.clone(),
            user_override: existing.user_override.clone(),
            zepp_type: incoming.zepp_type,
            conflict: existing.conflict.clone(),
        }
    } else if new_rank < old_rank {
        existing.clone()
    } else if new_rank == 3 && incoming.zepp_type == existing.zepp_type {
        // Same raw code, newer normalizer interpretation. This is what makes a
        // revision replay able to correct old rows without losing overrides.
        StoredWorkoutType {
            normalized_type: incoming.normalized_type.clone(),
            type_source: incoming.type_source.clone(),
            user_override: existing.user_override.clone(),
            zepp_type: incoming.zepp_type,
            conflict: existing.conflict.clone(),
        }
    } else if new_rank == 3 {
        // Two different numeric facts for one workout are a server conflict.
        // Pick the smaller code deterministically so request order cannot
        // change the result, and retain every observed code for diagnostics.
        let old_code = existing.zepp_type.unwrap_or(i32::MAX);
        let new_code = incoming.zepp_type.unwrap_or(i32::MAX);
        if new_code < old_code {
            StoredWorkoutType {
                normalized_type: incoming.normalized_type.clone(),
                type_source: incoming.type_source.clone(),
                user_override: existing.user_override.clone(),
                zepp_type: incoming.zepp_type,
                conflict: existing.conflict.clone(),
            }
        } else {
            existing.clone()
        }
    } else if incoming.normalized_type < existing.normalized_type {
        StoredWorkoutType {
            normalized_type: incoming.normalized_type.clone(),
            type_source: incoming.type_source.clone(),
            user_override: existing.user_override.clone(),
            zepp_type: incoming.zepp_type,
            conflict: existing.conflict.clone(),
        }
    } else {
        existing.clone()
    };

    if new_rank == 3 && old_rank == 3 && incoming.zepp_type != existing.zepp_type {
        let mut codes = BTreeSet::new();
        if let Some(raw) = existing.conflict.as_deref() {
            codes.extend(raw.split(',').filter_map(|value| value.parse::<i32>().ok()));
        }
        if let Some(code) = existing.zepp_type {
            codes.insert(code);
        }
        if let Some(code) = incoming.zepp_type {
            codes.insert(code);
        }
        merged.conflict = Some(
            codes
                .into_iter()
                .map(|code| code.to_string())
                .collect::<Vec<_>>()
                .join(","),
        );
    }
    merged.user_override = existing
        .user_override
        .or_else(|| incoming.user_override.clone());
    merged
}

impl Database {
    #[cfg(test)]
    pub fn insert_metric_sample(&self, sample: &MetricSample) -> Result<()> {
        self.insert_metric_sample_with_raw(sample, None)
    }

    /// 逐行写，一次归一化动辄几千行，所以语句走连接的缓存：同一句 SQL 只解析一次。
    pub fn insert_metric_sample_with_raw(
        &self,
        sample: &MetricSample,
        raw_record_id: Option<i64>,
    ) -> Result<()> {
        self.conn
            .prepare_cached(
                "INSERT INTO metric_samples
                (metric, timestamp, value, unit, source_scope, device_id, raw_record_id)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
             ON CONFLICT DO UPDATE SET
                value = excluded.value,
                source_scope = excluded.source_scope,
                raw_record_id = COALESCE(excluded.raw_record_id, metric_samples.raw_record_id)",
            )?
            .execute(params![
                sample.metric,
                sample.timestamp.to_rfc3339(),
                sample.value,
                sample.unit,
                sample.source_scope.as_str(),
                sample.device_id,
                raw_record_id,
            ])?;
        Ok(())
    }

    #[allow(dead_code)]
    pub fn insert_daily_metric(&self, metric: &DailyMetric) -> Result<()> {
        self.insert_daily_metric_with_raw(metric, None)
    }

    pub fn insert_daily_metric_with_raw(
        &self,
        metric: &DailyMetric,
        raw_record_id: Option<i64>,
    ) -> Result<()> {
        self.conn
            .prepare_cached(
                "INSERT INTO daily_metrics
                (date, metric, value, unit, source_scope, device_id, raw_record_id)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
             ON CONFLICT DO UPDATE SET
                value = excluded.value,
                source_scope = excluded.source_scope,
                raw_record_id = COALESCE(excluded.raw_record_id, daily_metrics.raw_record_id)",
            )?
            .execute(params![
                metric.date,
                metric.metric,
                metric.value,
                metric.unit,
                metric.source_scope.as_str(),
                metric.device_id,
                raw_record_id,
            ])?;
        Ok(())
    }

    #[allow(dead_code)]
    pub fn insert_sleep_session(&self, sleep: &SleepSession) -> Result<()> {
        self.insert_sleep_session_with_raw(sleep, None)
    }

    pub fn insert_sleep_session_with_raw(
        &self,
        sleep: &SleepSession,
        raw_record_id: Option<i64>,
    ) -> Result<()> {
        let synced_at = sleep
            .synced_at
            .or_else(|| self.fetched_at_for_raw(raw_record_id))
            .unwrap_or_else(Utc::now);
        let (deep_minutes, deep_available) = stored_stage_minutes(sleep.deep_minutes);
        let (light_minutes, light_available) = stored_stage_minutes(sleep.light_minutes);
        let (rem_minutes, rem_available) = stored_stage_minutes(sleep.rem_minutes);
        let (awake_minutes, awake_available) = stored_stage_minutes(sleep.awake_minutes);
        self.conn.execute(
            "INSERT INTO sleep_sessions
                (sleep_id, start_time, end_time, score, duration_minutes,
                 deep_minutes, deep_available, light_minutes, light_available,
                 rem_minutes, rem_available, awake_minutes, awake_available,
                 source_scope, device_id, raw_record_id, synced_at, wake_count)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18)
             ON CONFLICT(sleep_id) DO UPDATE SET
                start_time = excluded.start_time,
                end_time = excluded.end_time,
                score = excluded.score,
                duration_minutes = excluded.duration_minutes,
                deep_minutes = excluded.deep_minutes,
                deep_available = excluded.deep_available,
                light_minutes = excluded.light_minutes,
                light_available = excluded.light_available,
                rem_minutes = excluded.rem_minutes,
                rem_available = excluded.rem_available,
                awake_minutes = excluded.awake_minutes,
                awake_available = excluded.awake_available,
                wake_count = excluded.wake_count,
                source_scope = excluded.source_scope,
                device_id = excluded.device_id,
                raw_record_id = COALESCE(excluded.raw_record_id, sleep_sessions.raw_record_id),
                synced_at = COALESCE(sleep_sessions.synced_at, excluded.synced_at)",
            params![
                sleep.sleep_id,
                sleep.start_time.to_rfc3339(),
                sleep.end_time.to_rfc3339(),
                sleep.score,
                sleep.duration_minutes,
                deep_minutes,
                deep_available,
                light_minutes,
                light_available,
                rem_minutes,
                rem_available,
                awake_minutes,
                awake_available,
                sleep.source_scope.as_str(),
                sleep.device_id,
                raw_record_id,
                synced_at.to_rfc3339(),
                sleep.wake_count,
            ],
        )?;
        self.replace_sleep_stages(&sleep.sleep_id, &sleep.stages)?;
        Ok(())
    }

    #[allow(dead_code)]
    pub fn insert_workout(&self, workout: &Workout) -> Result<()> {
        self.insert_workout_with_raw(workout, None)
    }

    pub fn insert_workout_with_raw(
        &self,
        workout: &Workout,
        raw_record_id: Option<i64>,
    ) -> Result<()> {
        let synced_at = workout
            .synced_at
            .or_else(|| self.fetched_at_for_raw(raw_record_id))
            .unwrap_or_else(Utc::now);
        let existing = self
            .conn
            .query_row(
                "SELECT workout_type, workout_type_source, workout_type_override,
                        zepp_type, workout_type_conflict
                 FROM workouts WHERE workout_id = ?1",
                [&workout.workout_id],
                |row| {
                    Ok(StoredWorkoutType {
                        normalized_type: row.get(0)?,
                        type_source: row.get(1)?,
                        user_override: row.get(2)?,
                        zepp_type: row.get(3)?,
                        conflict: row.get(4)?,
                    })
                },
            )
            .optional()?;
        let merged_type = merge_workout_type(existing, workout);
        self.conn.execute(
            "INSERT INTO workouts
                (workout_id, workout_type, start_time, end_time, distance_meters,
                 calories, avg_hr, max_hr, training_load, vo2max,
                 source_scope, device_id, raw_record_id, synced_at,
                 gps_available, sample_count, zepp_source, zepp_type,
                 workout_type_source, workout_type_override, workout_type_conflict,
                 min_hr, total_steps, moving_seconds, elevation_gain_m, elevation_loss_m,
                 max_altitude_m, min_altitude_m, training_effect, anaerobic_training_effect,
                 rpe, avg_cadence_spm, max_cadence_spm, avg_stride_cm)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21,
                     ?22, ?23, ?24, ?25, ?26, ?27, ?28, ?29, ?30, ?31, ?32, ?33, ?34)
             ON CONFLICT(workout_id) DO UPDATE SET
                workout_type = excluded.workout_type,
                start_time = excluded.start_time,
                end_time = excluded.end_time,
                distance_meters = COALESCE(excluded.distance_meters, workouts.distance_meters),
                calories = COALESCE(excluded.calories, workouts.calories),
                avg_hr = COALESCE(excluded.avg_hr, workouts.avg_hr),
                max_hr = COALESCE(excluded.max_hr, workouts.max_hr),
                training_load = COALESCE(excluded.training_load, workouts.training_load),
                vo2max = COALESCE(excluded.vo2max, workouts.vo2max),
                source_scope = excluded.source_scope,
                device_id = excluded.device_id,
                raw_record_id = COALESCE(excluded.raw_record_id, workouts.raw_record_id),
                synced_at = COALESCE(workouts.synced_at, excluded.synced_at),
                gps_available = CASE
                    WHEN excluded.gps_available > workouts.gps_available THEN excluded.gps_available
                    ELSE workouts.gps_available
                END,
                sample_count = CASE
                    WHEN excluded.sample_count > workouts.sample_count THEN excluded.sample_count
                    ELSE workouts.sample_count
                END,
                zepp_source = COALESCE(excluded.zepp_source, workouts.zepp_source),
                zepp_type = excluded.zepp_type,
                workout_type_source = excluded.workout_type_source,
                workout_type_override = COALESCE(workouts.workout_type_override, excluded.workout_type_override),
                workout_type_conflict = excluded.workout_type_conflict,
                -- 一律 COALESCE：补拉回来的摘要可能缺字段，缺的那次不该把上一次
                -- 已经拿到的值抹成 NULL。
                min_hr = COALESCE(excluded.min_hr, workouts.min_hr),
                total_steps = COALESCE(excluded.total_steps, workouts.total_steps),
                moving_seconds = COALESCE(excluded.moving_seconds, workouts.moving_seconds),
                elevation_gain_m = COALESCE(excluded.elevation_gain_m, workouts.elevation_gain_m),
                elevation_loss_m = COALESCE(excluded.elevation_loss_m, workouts.elevation_loss_m),
                max_altitude_m = COALESCE(excluded.max_altitude_m, workouts.max_altitude_m),
                min_altitude_m = COALESCE(excluded.min_altitude_m, workouts.min_altitude_m),
                training_effect = COALESCE(excluded.training_effect, workouts.training_effect),
                anaerobic_training_effect = COALESCE(
                    excluded.anaerobic_training_effect, workouts.anaerobic_training_effect),
                rpe = COALESCE(excluded.rpe, workouts.rpe),
                avg_cadence_spm = COALESCE(excluded.avg_cadence_spm, workouts.avg_cadence_spm),
                max_cadence_spm = COALESCE(excluded.max_cadence_spm, workouts.max_cadence_spm),
                avg_stride_cm = COALESCE(excluded.avg_stride_cm, workouts.avg_stride_cm)",
            params![
                workout.workout_id,
                merged_type.normalized_type,
                workout.start_time.to_rfc3339(),
                workout.end_time.to_rfc3339(),
                workout.distance_meters,
                workout.calories,
                workout.avg_hr,
                workout.max_hr,
                workout.training_load,
                workout.vo2max,
                workout.source_scope.as_str(),
                workout.device_id,
                raw_record_id,
                synced_at.to_rfc3339(),
                i64::from(workout.gps_available),
                workout.sample_count,
                workout.zepp_source,
                merged_type.zepp_type,
                merged_type.type_source,
                merged_type.user_override,
                merged_type.conflict,
                workout.min_hr,
                workout.total_steps,
                workout.moving_seconds,
                workout.elevation_gain_m,
                workout.elevation_loss_m,
                workout.max_altitude_m,
                workout.min_altitude_m,
                workout.training_effect,
                workout.anaerobic_training_effect,
                workout.rpe,
                workout.avg_cadence_spm,
                workout.max_cadence_spm,
                workout.avg_stride_cm,
            ],
        )?;
        // 心率区间分布。整条替换而不是逐段 upsert：区间边界会随用户在表上的
        // 设定变化，段数也可能不同，留着上一次的段会拼出一个从未存在过的分布。
        // 空的 `hr_zones` 表示这次同步没带这项，不动已经存下来的。
        if !workout.hr_zones.is_empty() {
            self.conn.execute(
                "DELETE FROM workout_hr_zones WHERE workout_id = ?1",
                [&workout.workout_id],
            )?;
            let mut insert = self.conn.prepare_cached(
                "INSERT INTO workout_hr_zones
                    (workout_id, zone_index, upper_bound_bpm, seconds)
                 VALUES (?1, ?2, ?3, ?4)",
            )?;
            for zone in &workout.hr_zones {
                insert.execute(params![
                    workout.workout_id,
                    zone.index,
                    zone.upper_bound_bpm,
                    zone.seconds
                ])?;
            }
        }
        Ok(())
    }
}
