//! 睡眠、运动、概览的列表与详情查询（从 storage/mod.rs 按领域拆出，逻辑不变）。

use super::*;

pub(super) fn stored_stage_minutes(minutes: Option<i32>) -> (i32, i64) {
    (minutes.unwrap_or(0), i64::from(minutes.is_some()))
}

/// `pub(crate)`：ai_tasks 导出睡眠窗口数据要按同一规则把「没测到」还原成 None。
pub(crate) fn loaded_stage_minutes(minutes: i32, available: i64) -> Option<i32> {
    (available != 0).then_some(minutes)
}

impl Database {
    /// `pub(crate)`：ai_tasks 的 detailed 导出要附真实阶段片，同一份查询。
    pub(crate) fn load_sleep_stages(&self, sleep_id: &str) -> Result<Vec<SleepStageSlice>> {
        let mut stmt = self.conn.prepare(
            "SELECT stage, start_time, end_time, raw_mode FROM sleep_stages
             WHERE sleep_id = ?1 ORDER BY start_time, id",
        )?;
        let rows = stmt.query_map([sleep_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, Option<i64>>(3)?,
            ))
        })?;
        let mut stages = Vec::new();
        for row in rows {
            let (stage, start, end, raw_mode) = row?;
            stages.push(SleepStageSlice {
                stage,
                start_time: parse_datetime(&start, "sleep_stages.start_time")?,
                end_time: parse_datetime(&end, "sleep_stages.end_time")?,
                raw_mode,
            });
        }
        Ok(stages)
    }

    /// 本机一共有多少条睡眠记录。
    ///
    /// 分页要它：没有总数，界面只能说「显示了 500 条」，说不出「共 2317 条」，
    /// 而用户问的恰恰是「剩下的呢」。
    pub fn count_sleep_sessions(&self) -> Result<i64> {
        self.conn
            .query_row("SELECT COUNT(*) FROM sleep_sessions", [], |row| row.get(0))
            .map_err(Into::into)
    }

    pub fn get_recent_sleep_sessions(&self, limit: usize) -> Result<Vec<SleepSession>> {
        self.sleep_sessions_page(limit, 0)
    }

    /// 一页睡眠记录，最新在前。
    ///
    /// `offset` 是这里的新东西。以前 SQL 只有 `LIMIT` 没有 `OFFSET`，所以
    /// 界面上那个 500 是硬上限而不是页大小：一个下载了全部历史的人，第 501
    /// 条之后的记录在应用里根本没有入口（Reddit p6zxyo7）。
    pub fn sleep_sessions_page(&self, limit: usize, offset: usize) -> Result<Vec<SleepSession>> {
        let limit = i64::try_from(limit).unwrap_or(i64::MAX).max(0);
        let offset = i64::try_from(offset).unwrap_or(i64::MAX).max(0);
        let mut stmt = self.conn.prepare(
            "SELECT sleep_id, start_time, end_time, score, duration_minutes,
                    deep_minutes, deep_available, light_minutes, light_available,
                    rem_minutes, rem_available, awake_minutes, awake_available,
                    source_scope, device_id, synced_at, wake_count
             FROM sleep_sessions ORDER BY start_time DESC LIMIT ?1 OFFSET ?2",
        )?;
        let rows = stmt.query_map([limit, offset], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, Option<i32>>(3)?,
                row.get::<_, i32>(4)?,
                row.get::<_, i32>(5)?,
                row.get::<_, i64>(6)?,
                row.get::<_, i32>(7)?,
                row.get::<_, i64>(8)?,
                row.get::<_, i32>(9)?,
                row.get::<_, i64>(10)?,
                row.get::<_, i32>(11)?,
                row.get::<_, i64>(12)?,
                row.get::<_, String>(13)?,
                row.get::<_, Option<String>>(14)?,
                row.get::<_, Option<String>>(15)?,
                row.get::<_, Option<i32>>(16)?,
            ))
        })?;
        let mut sessions = Vec::new();
        for row in rows {
            let (
                sleep_id,
                start,
                end,
                score,
                duration_minutes,
                deep_minutes,
                deep_available,
                light_minutes,
                light_available,
                rem_minutes,
                rem_available,
                awake_minutes,
                awake_available,
                scope,
                device_id,
                synced_at,
                wake_count,
            ) = row?;
            sessions.push(SleepSession {
                sleep_id,
                start_time: parse_datetime(&start, "sleep.start_time")?,
                end_time: parse_datetime(&end, "sleep.end_time")?,
                score,
                duration_minutes,
                deep_minutes: loaded_stage_minutes(deep_minutes, deep_available),
                light_minutes: loaded_stage_minutes(light_minutes, light_available),
                rem_minutes: loaded_stage_minutes(rem_minutes, rem_available),
                awake_minutes: loaded_stage_minutes(awake_minutes, awake_available),
                source_scope: parse_scope(&scope)?,
                device_id,
                synced_at: synced_at
                    .as_deref()
                    .map(|value| parse_datetime(value, "sleep.synced_at"))
                    .transpose()?,
                time_in_bed_minutes: None,
                stages: Vec::new(),
                wake_count,
            });
        }
        Ok(sessions)
    }

    pub fn get_sleep_detail(&self, sleep_id: &str) -> Result<Option<SleepSession>> {
        let row = self
            .conn
            .query_row(
                "SELECT sleep_id, start_time, end_time, score, duration_minutes,
                        deep_minutes, deep_available, light_minutes, light_available,
                        rem_minutes, rem_available, awake_minutes, awake_available,
                        source_scope, device_id, synced_at, wake_count
                 FROM sleep_sessions WHERE sleep_id = ?1 LIMIT 1",
                [sleep_id],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, Option<i32>>(3)?,
                        row.get::<_, i32>(4)?,
                        row.get::<_, i32>(5)?,
                        row.get::<_, i64>(6)?,
                        row.get::<_, i32>(7)?,
                        row.get::<_, i64>(8)?,
                        row.get::<_, i32>(9)?,
                        row.get::<_, i64>(10)?,
                        row.get::<_, i32>(11)?,
                        row.get::<_, i64>(12)?,
                        row.get::<_, String>(13)?,
                        row.get::<_, Option<String>>(14)?,
                        row.get::<_, Option<String>>(15)?,
                        row.get::<_, Option<i32>>(16)?,
                    ))
                },
            )
            .optional()?;
        let Some((
            sleep_id,
            start,
            end,
            score,
            duration_minutes,
            deep_minutes,
            deep_available,
            light_minutes,
            light_available,
            rem_minutes,
            rem_available,
            awake_minutes,
            awake_available,
            scope,
            device_id,
            synced_at,
            wake_count,
        )) = row
        else {
            return Ok(None);
        };
        let stages = self.load_sleep_stages(&sleep_id)?;
        Ok(Some(SleepSession {
            sleep_id,
            start_time: parse_datetime(&start, "sleep.start_time")?,
            end_time: parse_datetime(&end, "sleep.end_time")?,
            score,
            duration_minutes,
            deep_minutes: loaded_stage_minutes(deep_minutes, deep_available),
            light_minutes: loaded_stage_minutes(light_minutes, light_available),
            rem_minutes: loaded_stage_minutes(rem_minutes, rem_available),
            awake_minutes: loaded_stage_minutes(awake_minutes, awake_available),
            source_scope: parse_scope(&scope)?,
            device_id,
            synced_at: synced_at
                .as_deref()
                .map(|value| parse_datetime(value, "sleep.synced_at"))
                .transpose()?,
            time_in_bed_minutes: None,
            stages,
            wake_count,
        }))
    }

    /// 本机一共有多少条运动记录。见 `count_sleep_sessions` 的理由。
    pub fn count_workouts(&self) -> Result<i64> {
        self.conn
            .query_row("SELECT COUNT(*) FROM workouts", [], |row| row.get(0))
            .map_err(Into::into)
    }

    pub fn get_recent_workouts(&self, limit: usize) -> Result<Vec<Workout>> {
        self.workouts_page(limit, 0)
    }

    /// 一页运动记录，最新在前。见 `sleep_sessions_page`。
    pub fn workouts_page(&self, limit: usize, offset: usize) -> Result<Vec<Workout>> {
        let limit = i64::try_from(limit).unwrap_or(i64::MAX).max(0);
        let offset = i64::try_from(offset).unwrap_or(i64::MAX).max(0);
        let mut stmt = self.conn.prepare(
            "SELECT workout_id, workout_type, start_time, end_time,
                    distance_meters, calories, avg_hr, max_hr,
                    training_load, vo2max, source_scope, device_id,
                    synced_at, gps_available, sample_count, zepp_type,
                    workout_type_source, workout_type_override
             FROM workouts ORDER BY start_time DESC LIMIT ?1 OFFSET ?2",
        )?;
        let rows = stmt.query_map([limit, offset], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, Option<f64>>(4)?,
                row.get::<_, Option<i32>>(5)?,
                row.get::<_, Option<i32>>(6)?,
                row.get::<_, Option<i32>>(7)?,
                row.get::<_, Option<f64>>(8)?,
                row.get::<_, Option<f64>>(9)?,
                row.get::<_, String>(10)?,
                row.get::<_, Option<String>>(11)?,
                row.get::<_, Option<String>>(12)?,
                row.get::<_, i64>(13)?,
                row.get::<_, i64>(14)?,
                row.get::<_, Option<i32>>(15)?,
                row.get::<_, String>(16)?,
                row.get::<_, Option<String>>(17)?,
            ))
        })?;
        // 一次读完编号别名，再在内存里套到每条记录上：表很小，比给两个大
        // SELECT 各加一个 JOIN 更不容易改错。
        let code_labels = self.workout_code_label_map()?;
        let mut workouts = Vec::new();
        for row in rows {
            let (
                workout_id,
                workout_type,
                start,
                end,
                distance_meters,
                calories,
                avg_hr,
                max_hr,
                training_load,
                vo2max,
                scope,
                device_id,
                synced_at,
                gps_available,
                sample_count,
                zepp_type,
                type_source,
                user_override,
            ) = row?;
            let effective_type = user_override
                .clone()
                .unwrap_or_else(|| workout_type.clone());
            let custom_label = zepp_type.and_then(|code| code_labels.get(&code).cloned());
            workouts.push(Workout {
                workout_id,
                workout_type: workout_type.clone(),
                normalized_type: workout_type,
                type_source,
                user_override,
                effective_type,
                custom_label,
                start_time: parse_datetime(&start, "workout.start_time")?,
                end_time: parse_datetime(&end, "workout.end_time")?,
                distance_meters,
                calories,
                avg_hr,
                max_hr,
                training_load,
                vo2max,
                // 列表视图不读这些：屏幕上只有类型、距离、时长和心率，
                // 为此把 SELECT 加宽十三列再加一个 join，代价落在每一次列表
                // 渲染上。要这些字段请走单条运动的详情查询。
                min_hr: None,
                total_steps: None,
                moving_seconds: None,
                elevation_gain_m: None,
                elevation_loss_m: None,
                max_altitude_m: None,
                min_altitude_m: None,
                training_effect: None,
                anaerobic_training_effect: None,
                rpe: None,
                avg_cadence_spm: None,
                max_cadence_spm: None,
                avg_stride_cm: None,
                hr_zones: Vec::new(),
                source_scope: parse_scope(&scope)?,
                device_id,
                synced_at: synced_at
                    .as_deref()
                    .map(|value| parse_datetime(value, "workout.synced_at"))
                    .transpose()?,
                gps_available: gps_available != 0,
                sample_count,
                zepp_source: None,
                zepp_type,
            });
        }
        Ok(workouts)
    }

    pub fn get_workout_detail(&self, workout_id: &str) -> Result<Option<Workout>> {
        let row = self
            .conn
            .query_row(
                "SELECT workout_id, workout_type, start_time, end_time,
                        distance_meters, calories, avg_hr, max_hr,
                        training_load, vo2max, source_scope, device_id,
                        synced_at, gps_available, sample_count, zepp_type,
                        workout_type_source, workout_type_override,
                        min_hr, total_steps, moving_seconds,
                        elevation_gain_m, elevation_loss_m,
                        max_altitude_m, min_altitude_m,
                        training_effect, anaerobic_training_effect, rpe,
                        avg_cadence_spm, max_cadence_spm, avg_stride_cm
                 FROM workouts WHERE workout_id = ?1 LIMIT 1",
                [workout_id],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, String>(3)?,
                        row.get::<_, Option<f64>>(4)?,
                        row.get::<_, Option<i32>>(5)?,
                        row.get::<_, Option<i32>>(6)?,
                        row.get::<_, Option<i32>>(7)?,
                        row.get::<_, Option<f64>>(8)?,
                        row.get::<_, Option<f64>>(9)?,
                        row.get::<_, String>(10)?,
                        row.get::<_, Option<String>>(11)?,
                        row.get::<_, Option<String>>(12)?,
                        row.get::<_, i64>(13)?,
                        row.get::<_, i64>(14)?,
                        row.get::<_, Option<i32>>(15)?,
                        row.get::<_, String>(16)?,
                        row.get::<_, Option<String>>(17)?,
                        (
                            row.get::<_, Option<i32>>(18)?,
                            row.get::<_, Option<i32>>(19)?,
                            row.get::<_, Option<i64>>(20)?,
                            row.get::<_, Option<f64>>(21)?,
                            row.get::<_, Option<f64>>(22)?,
                            row.get::<_, Option<f64>>(23)?,
                            row.get::<_, Option<f64>>(24)?,
                            row.get::<_, Option<f64>>(25)?,
                            row.get::<_, Option<f64>>(26)?,
                            row.get::<_, Option<i32>>(27)?,
                            row.get::<_, Option<f64>>(28)?,
                            row.get::<_, Option<f64>>(29)?,
                            row.get::<_, Option<f64>>(30)?,
                        ),
                    ))
                },
            )
            .optional()?;
        let Some((
            workout_id,
            workout_type,
            start,
            end,
            distance_meters,
            calories,
            avg_hr,
            max_hr,
            training_load,
            vo2max,
            scope,
            device_id,
            synced_at,
            gps_available,
            sample_count,
            zepp_type,
            type_source,
            user_override,
            (
                min_hr,
                total_steps,
                moving_seconds,
                elevation_gain_m,
                elevation_loss_m,
                max_altitude_m,
                min_altitude_m,
                training_effect,
                anaerobic_training_effect,
                rpe,
                avg_cadence_spm,
                max_cadence_spm,
                avg_stride_cm,
            ),
        )) = row
        else {
            return Ok(None);
        };
        let hr_zones = self.workout_hr_zones(&workout_id)?;
        let route_points: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM route_points WHERE workout_id = ?1",
            [&workout_id],
            |row| row.get(0),
        )?;
        let stored_samples: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM workout_samples WHERE workout_id = ?1",
            [&workout_id],
            |row| row.get(0),
        )?;
        let effective_type = user_override
            .clone()
            .unwrap_or_else(|| workout_type.clone());
        let custom_label = match zepp_type {
            Some(code) => self.workout_code_label_map()?.get(&code).cloned(),
            None => None,
        };
        Ok(Some(Workout {
            min_hr,
            total_steps,
            moving_seconds,
            elevation_gain_m,
            elevation_loss_m,
            max_altitude_m,
            min_altitude_m,
            training_effect,
            anaerobic_training_effect,
            rpe,
            avg_cadence_spm,
            max_cadence_spm,
            avg_stride_cm,
            hr_zones,
            workout_id,
            workout_type: workout_type.clone(),
            normalized_type: workout_type,
            type_source,
            user_override,
            effective_type,
            custom_label,
            start_time: parse_datetime(&start, "workout.start_time")?,
            end_time: parse_datetime(&end, "workout.end_time")?,
            distance_meters,
            calories,
            avg_hr,
            max_hr,
            training_load,
            vo2max,
            source_scope: parse_scope(&scope)?,
            device_id,
            synced_at: synced_at
                .as_deref()
                .map(|value| parse_datetime(value, "workout.synced_at"))
                .transpose()?,
            gps_available: gps_available != 0 || route_points > 0,
            sample_count: sample_count.max(stored_samples),
            zepp_source: None,
            zepp_type,
        }))
    }

    pub fn get_health_overview(&self) -> Result<HealthOverview> {
        let latest_heart_rate = self.get_latest_heart_rate_sample()?;
        let current_hr = latest_heart_rate.as_ref().map(|(value, _)| *value);
        let latest_heart_rate_at = latest_heart_rate.map(|(_, timestamp)| timestamp);
        let resting_hr = self.latest_daily_i32("resting_hr")?;
        let hrv = self.latest_metric_f64("hrv")?;
        let (last_updated, coverage, source_scope) = self.overview_metadata()?;
        let last_sleep_score = self
            .get_recent_sleep_sessions(1)?
            .into_iter()
            .next()
            .and_then(|sleep| sleep.score);
        Ok(HealthOverview {
            current_hr,
            resting_hr,
            hrv,
            last_sleep_score,
            readiness: self.latest_daily_f64("readiness")?,
            bio_charge: self.latest_daily_f64("bio_charge")?,
            hybrid_charge: self.latest_daily_f64("hybrid_charge")?,
            training_load: self.latest_daily_f64("training_load")?,
            vo2max: self.latest_daily_f64("vo2max")?,
            steps_today: self.latest_daily_i32_for_date("steps", Local::now().date_naive())?,
            active_calories_today: self
                .latest_daily_i32_for_date("active_calories", Local::now().date_naive())?
                .or(self.latest_daily_i32_for_date("calories", Local::now().date_naive())?),
            latest_heart_rate_at,
            last_updated,
            coverage,
            source_scope,
        })
    }

    pub(super) fn overview_metadata(
        &self,
    ) -> Result<(Option<String>, Option<Coverage>, Option<String>)> {
        let last_updated = self.get_app_meta(LAST_CLOUD_SYNC_AT_KEY)?;
        // 覆盖的最早/最晚日本地与 local_coverage 同一条链路：对原始列取
        // MIN/MAX 再换算，能走索引；旧写法是对四张表逐行调 date() 再聚合。
        let (start, end) = self.coverage_day_bounds()?;
        // stream / source_scope 的 DISTINCT 计数躲不开扫行，但不再为每一行
        // 调 date()——那是旧 UNION 里最贵的部分。
        let (stream_count, scope_count, only_scope) = self.conn.query_row(
            "SELECT COUNT(DISTINCT stream),
                    COUNT(DISTINCT source_scope), MIN(source_scope)
             FROM (
                 SELECT metric AS stream, source_scope
                 FROM metric_samples
                 UNION ALL
                 SELECT 'daily_summary' AS stream, source_scope FROM daily_metrics
                 UNION ALL
                 SELECT 'sleep' AS stream, source_scope FROM sleep_sessions
                 UNION ALL
                 SELECT 'workouts' AS stream, source_scope FROM workouts
             )",
            [],
            |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, i64>(1)?,
                    row.get::<_, Option<String>>(2)?,
                ))
            },
        )?;
        let coverage = match (start, end) {
            (Some(start), Some(end)) => {
                let start_date = NaiveDate::parse_from_str(&start, "%Y-%m-%d")
                    .map_err(|error| ZeppBridgeError::ParseError(error.to_string()))?;
                let end_date = NaiveDate::parse_from_str(&end, "%Y-%m-%d")
                    .map_err(|error| ZeppBridgeError::ParseError(error.to_string()))?;
                Some(Coverage {
                    start,
                    end,
                    days: (end_date - start_date).num_days() + 1,
                    streams: stream_count,
                })
            }
            _ => None,
        };
        let source_scope = match scope_count {
            0 => None,
            1 => only_scope,
            _ => Some("mixed".to_string()),
        };
        Ok((last_updated, coverage, source_scope))
    }
}
