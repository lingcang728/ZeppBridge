//! 运动逐点序列、圈与分段、详情抓取队列（从 storage/mod.rs 按领域拆出，逻辑不变）。

use super::*;

pub(super) fn workout_series_summary(samples: &[WorkoutSeriesSample]) -> WorkoutSeriesSummary {
    let average_pace = average_finite(
        samples
            .iter()
            .filter_map(|sample| sample.pace)
            .filter(|value| *value > 0.0 && *value < 60.0),
    );
    let cadences: Vec<f64> = samples
        .iter()
        .filter_map(|sample| sample.cadence)
        .filter(|value| value.is_finite() && *value > 0.0 && *value < 300.0)
        .collect();
    let average_cadence = average_finite(cadences.iter().copied());
    let max_cadence = cadences.iter().copied().reduce(f64::max);
    let average_stride_cm = average_finite(
        samples
            .iter()
            .filter_map(|sample| sample.stride_cm)
            .filter(|value| *value > 0.0 && *value < 300.0),
    );

    // Ignore single-sample altitude jumps over 50 m. They are normally GPS or
    // pressure-sensor discontinuities and must not inflate cumulative climb.
    let altitudes: Vec<f64> = samples
        .iter()
        .filter_map(|sample| sample.altitude_m)
        .filter(|value| value.is_finite() && (-500.0..=10_000.0).contains(value))
        .collect();
    let (elevation_gain_m, elevation_loss_m) = if altitudes.len() < 2 {
        (None, None)
    } else {
        let mut gain = 0.0;
        let mut loss = 0.0;
        for pair in altitudes.windows(2) {
            let delta = pair[1] - pair[0];
            if delta.abs() > 50.0 {
                continue;
            }
            if delta > 0.0 {
                gain += delta;
            } else {
                loss += -delta;
            }
        }
        (Some(gain), Some(loss))
    };

    let powers: Vec<f64> = samples
        .iter()
        .filter_map(|sample| sample.power_watts)
        .filter(|value| value.is_finite() && *value >= 0.0 && *value < 2_000.0)
        .collect();

    WorkoutSeriesSummary {
        average_pace,
        average_cadence,
        max_cadence,
        average_stride_cm,
        elevation_gain_m,
        elevation_loss_m,
        average_power_watts: average_finite(powers.iter().copied()),
        max_power_watts: powers.iter().copied().reduce(f64::max),
        average_ground_contact_ms: average_finite(
            samples
                .iter()
                .filter_map(|sample| sample.ground_contact_ms)
                .filter(|value| *value > 0.0 && *value < 2_000.0),
        ),
        average_vertical_oscillation_mm: average_finite(
            samples
                .iter()
                .filter_map(|sample| sample.vertical_oscillation_mm)
                .filter(|value| *value > 0.0 && *value < 1_000.0),
        ),
        average_vertical_ratio_pct: average_finite(
            samples
                .iter()
                .filter_map(|sample| sample.vertical_ratio_pct)
                .filter(|value| *value > 0.0 && *value < 100.0),
        ),
        // The best equivalent pace is the smallest number of seconds, so this
        // is a minimum even though it reads as "best".
        best_equivalent_pace_s_per_km: samples
            .iter()
            .filter_map(|sample| plausible_equivalent_pace(sample.equivalent_pace_s_per_km))
            .reduce(f64::min),
    }
}

impl Database {
    /// 一次运动的心率区间分布，按区间顺序。
    pub fn workout_hr_zones(&self, workout_id: &str) -> Result<Vec<HeartRateZoneBucket>> {
        let mut stmt = self.conn.prepare(
            "SELECT zone_index, upper_bound_bpm, seconds FROM workout_hr_zones
              WHERE workout_id = ?1 ORDER BY zone_index",
        )?;
        let rows = stmt.query_map([workout_id], |row| {
            Ok(HeartRateZoneBucket {
                index: row.get(0)?,
                upper_bound_bpm: row.get(1)?,
                seconds: row.get(2)?,
            })
        })?;
        Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
    }

    pub(super) fn workout_exists(&self, workout_id: &str) -> Result<bool> {
        let count: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM workouts WHERE workout_id = ?1",
            [workout_id],
            |row| row.get(0),
        )?;
        Ok(count > 0)
    }

    /// 这条运动的总距离。
    ///
    /// 明细解码走 `kilo_pace` 兜底时要它：那份数据只给整公里，最后那截零头的
    /// 长度只能从汇总来。汇总里没有距离（室内、无 GPS）就返回 None，那时不补
    /// 零头，而不是猜一个。
    pub(super) fn workout_distance_meters(&self, workout_id: &str) -> Result<Option<f64>> {
        Ok(self
            .conn
            .query_row(
                "SELECT distance_meters FROM workouts WHERE workout_id = ?1",
                [workout_id],
                |row| row.get::<_, Option<f64>>(0),
            )
            .optional()?
            .flatten())
    }

    pub(super) fn workout_end_time(&self, workout_id: &str) -> Result<Option<DateTime<Utc>>> {
        let value: Option<String> = self
            .conn
            .query_row(
                "SELECT end_time FROM workouts WHERE workout_id = ?1",
                [workout_id],
                |row| row.get(0),
            )
            .optional()?;
        value
            .map(|text| parse_datetime(&text, "workouts.end_time"))
            .transpose()
    }

    pub fn pending_running_details(&self) -> Result<Vec<PendingWorkoutDetail>> {
        self.pending_running_details_limited(PENDING_WORKOUT_DETAIL_LIMIT)
    }

    pub fn pending_running_details_limited(
        &self,
        limit: usize,
    ) -> Result<Vec<PendingWorkoutDetail>> {
        let decay_before = (Utc::now() - WORKOUT_DETAIL_ATTEMPT_DECAY).to_rfc3339();
        let mut stmt = self.conn.prepare(
            "SELECT w.workout_id, w.zepp_source
             FROM workouts w
             LEFT JOIN workout_detail_fetch_attempts a
               ON a.workout_id = w.workout_id AND a.source = w.zepp_source
             WHERE w.zepp_source IS NOT NULL
               AND TRIM(w.zepp_source) != ''
               AND NOT EXISTS (
                   -- 报文在、而且解开了才算拿到：被隔离的明细仍是待拉取（按失败次数退避）。
                   SELECT 1 FROM raw_records r
                   WHERE r.stream = 'workout_detail'
                     AND r.source_key = 'workout_detail:' || w.workout_id || ':' || w.zepp_source
                     AND NOT EXISTS (SELECT 1 FROM raw_quarantine q WHERE q.raw_record_id = r.id)
               )
               AND (
                   a.attempts IS NULL
                   OR a.attempts < ?1
                   OR a.updated_at < ?2
               )
             ORDER BY COALESCE(a.attempts, 0) ASC, w.start_time DESC
             LIMIT ?3",
        )?;
        let rows = stmt.query_map(
            rusqlite::params![MAX_WORKOUT_DETAIL_ATTEMPTS, decay_before, limit as i64],
            |row| {
                Ok(PendingWorkoutDetail {
                    workout_id: row.get(0)?,
                    source: row.get(1)?,
                })
            },
        )?;
        rows.collect::<std::result::Result<Vec<_>, _>>()
            .map_err(Into::into)
    }

    /// 记下一次跑步明细拉取的结果。成功就清掉失败计数；失败则累加，过了
    /// [`WORKOUT_DETAIL_ATTEMPT_DECAY`] 的旧计数先衰减再记成第一次。
    pub fn record_workout_detail_fetch_result(
        &self,
        workout_id: &str,
        source: &str,
        ok: bool,
    ) -> Result<()> {
        if ok {
            self.conn.execute(
                "DELETE FROM workout_detail_fetch_attempts
                 WHERE workout_id = ?1 AND source = ?2",
                [workout_id, source],
            )?;
            return Ok(());
        }
        let now = Utc::now().to_rfc3339();
        let decay_before = (Utc::now() - WORKOUT_DETAIL_ATTEMPT_DECAY).to_rfc3339();
        self.conn.execute(
            "INSERT INTO workout_detail_fetch_attempts(workout_id, source, attempts, updated_at)
             VALUES(?1, ?2, 1, ?3)
             ON CONFLICT(workout_id, source) DO UPDATE SET
               attempts = CASE
                 WHEN workout_detail_fetch_attempts.updated_at < ?4 THEN 1
                 ELSE workout_detail_fetch_attempts.attempts + 1
               END,
               updated_at = excluded.updated_at",
            rusqlite::params![workout_id, source, now, decay_before],
        )?;
        Ok(())
    }

    pub fn replace_workout_series(&self, workout_id: &str, decoded: &DecodedWorkout) -> Result<()> {
        // 差分链断掉时解码侧会截断轨迹而不是平移它；这里留一条不含坐标的
        // warn，说明这条轨迹缺了尾巴，方便对照报告排查。
        if decoded.route_dropped_points > 0 {
            tracing::warn!(
                "workout {workout_id} 的轨迹被截断：{} 个后续点位置不可知，未入库",
                decoded.route_dropped_points
            );
        }
        self.conn.execute(
            "DELETE FROM workout_samples WHERE workout_id = ?1",
            [workout_id],
        )?;
        self.conn.execute(
            "DELETE FROM route_points WHERE workout_id = ?1",
            [workout_id],
        )?;
        self.conn.execute(
            "DELETE FROM workout_pauses WHERE workout_id = ?1",
            [workout_id],
        )?;
        self.conn.execute(
            "DELETE FROM workout_splits WHERE workout_id = ?1",
            [workout_id],
        )?;
        // 圈也要先清掉。**这一条一度漏了**，而这个函数叫 `replace_`：
        // `workout_laps` 是和圈一起加进来的新表，它和上面几张一样没有唯一
        // 索引——那几张不出问题，靠的正是这里的 DELETE。漏掉它，每重放一次
        // 圈就翻一倍（本机实测 341 → 682，341 组 (workout_id, lap_index)
        // 一个不落全是两份），`.fit` 里每圈导两遍，界面上每圈列两行。
        // 第一次重放看起来完全正常，所以它只会在下一次推修订号时才爆出来。
        self.conn.execute(
            "DELETE FROM workout_laps WHERE workout_id = ?1",
            [workout_id],
        )?;

        {
            let mut insert = self.conn.prepare(
                "INSERT INTO workout_samples
                    (workout_id, timestamp, heart_rate, pace, speed, cadence, altitude, stride,
                     power_watts, ground_contact_ms, vertical_oscillation_mm, vertical_ratio_pct,
                     equivalent_pace_s)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
            )?;
            for sample in &decoded.samples {
                insert.execute(params![
                    workout_id,
                    sample.timestamp.to_rfc3339(),
                    sample.heart_rate,
                    sample.pace,
                    sample.speed,
                    sample.cadence,
                    sample.altitude_m,
                    sample.stride_cm,
                    sample.power_watts,
                    sample.ground_contact_ms,
                    sample.vertical_oscillation_mm,
                    sample.vertical_ratio_pct,
                    sample.equivalent_pace_s_per_km,
                ])?;
            }
        }
        {
            let mut insert = self.conn.prepare(
                "INSERT INTO route_points
                    (workout_id, timestamp, latitude, longitude, altitude)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
            )?;
            for point in &decoded.route {
                insert.execute(params![
                    workout_id,
                    point.timestamp.to_rfc3339(),
                    point.latitude,
                    point.longitude,
                    point.altitude_m,
                ])?;
            }
        }
        {
            let mut insert = self.conn.prepare(
                "INSERT INTO workout_pauses
                    (workout_id, start_time, end_time, kind)
                 VALUES (?1, ?2, ?3, ?4)",
            )?;
            for pause in &decoded.pauses {
                insert.execute(params![
                    workout_id,
                    pause.start_time.to_rfc3339(),
                    pause.end_time.to_rfc3339(),
                    pause.kind,
                ])?;
            }
        }
        {
            let mut insert = self.conn.prepare(
                "INSERT INTO workout_splits
                    (workout_id, split_index, start_time, end_time, distance_m,
                     duration_seconds, pace_min_per_km, avg_hr, max_hr,
                     elevation_gain_m, elevation_loss_m, partial)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
            )?;
            for split in &decoded.splits {
                insert.execute(params![
                    workout_id,
                    split.index,
                    split.start_time.to_rfc3339(),
                    split.end_time.to_rfc3339(),
                    split.distance_m,
                    split.duration_seconds,
                    split.pace_min_per_km,
                    split.avg_hr,
                    split.max_hr,
                    split.elevation_gain_m,
                    split.elevation_loss_m,
                    i64::from(split.partial),
                ])?;
            }
        }
        {
            let mut insert = self.conn.prepare(
                "INSERT INTO workout_laps
                    (workout_id, lap_index, start_time, end_time, distance_m,
                     duration_seconds, avg_hr, max_hr)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            )?;
            for lap in &decoded.laps {
                insert.execute(params![
                    workout_id,
                    lap.index,
                    lap.start_time.to_rfc3339(),
                    lap.end_time.to_rfc3339(),
                    lap.distance_m,
                    lap.duration_seconds,
                    lap.avg_hr,
                    lap.max_hr,
                ])?;
            }
        }

        self.conn.execute(
            "UPDATE workouts
             SET gps_available = CASE WHEN ?2 > 0 THEN 1 ELSE gps_available END,
                 sample_count = ?3
             WHERE workout_id = ?1",
            params![
                workout_id,
                decoded.route.len() as i64,
                decoded.samples.len() as i64,
            ],
        )?;
        Ok(())
    }

    pub fn get_workout_series(&self, workout_id: &str) -> Result<WorkoutSeries> {
        let mut samples = {
            let mut stmt = self.conn.prepare(
                "SELECT timestamp, heart_rate, pace, speed, cadence, altitude, stride,
                        power_watts, ground_contact_ms, vertical_oscillation_mm,
                        vertical_ratio_pct, equivalent_pace_s
                 FROM workout_samples WHERE workout_id = ?1 ORDER BY timestamp",
            )?;
            let rows = stmt.query_map([workout_id], |row| {
                Ok(WorkoutSeriesSample {
                    timestamp: row.get(0)?,
                    heart_rate: row.get(1)?,
                    pace: row.get(2)?,
                    speed: row.get(3)?,
                    cadence: row.get(4)?,
                    altitude_m: row.get(5)?,
                    stride_cm: row.get(6)?,
                    power_watts: row.get(7)?,
                    ground_contact_ms: row.get(8)?,
                    vertical_oscillation_mm: row.get(9)?,
                    vertical_ratio_pct: row.get(10)?,
                    equivalent_pace_s_per_km: row.get(11)?,
                })
            })?;
            rows.collect::<std::result::Result<Vec<_>, _>>()?
        };
        for sample in &mut samples {
            sample.pace = pace_minutes_per_kilometre(sample.pace, sample.speed);
            sample.equivalent_pace_s_per_km =
                plausible_equivalent_pace(sample.equivalent_pace_s_per_km);
        }

        let route = {
            let mut stmt = self.conn.prepare(
                "SELECT timestamp, latitude, longitude, altitude
                 FROM route_points WHERE workout_id = ?1 ORDER BY timestamp",
            )?;
            let rows = stmt.query_map([workout_id], |row| {
                Ok(WorkoutRoutePoint {
                    timestamp: row.get(0)?,
                    latitude: row.get(1)?,
                    longitude: row.get(2)?,
                    altitude_m: row.get(3)?,
                })
            })?;
            rows.collect::<std::result::Result<Vec<_>, _>>()?
        };

        let pauses = {
            let mut stmt = self.conn.prepare(
                "SELECT start_time, end_time, kind
                 FROM workout_pauses WHERE workout_id = ?1 ORDER BY start_time",
            )?;
            let rows = stmt.query_map([workout_id], |row| {
                Ok(WorkoutPause {
                    start_time: row.get(0)?,
                    end_time: row.get(1)?,
                    kind: row.get(2)?,
                })
            })?;
            rows.collect::<std::result::Result<Vec<_>, _>>()?
        };

        let summary = workout_series_summary(&samples);
        let recorded_distance_m: Option<f64> = self
            .conn
            .query_row(
                "SELECT distance_meters FROM workouts WHERE workout_id = ?1 LIMIT 1",
                [workout_id],
                |row| row.get(0),
            )
            .optional()?
            .flatten();
        let climbs = crate::workout_climbs::detect_climbs(&samples, recorded_distance_m);

        let splits = self.load_workout_splits(workout_id)?;
        let laps = self.load_workout_laps(workout_id)?;

        Ok(WorkoutSeries {
            workout_id: workout_id.to_owned(),
            samples,
            route,
            pauses,
            splits,
            laps,
            summary,
            climbs,
        })
    }

    pub(super) fn fetched_at_for_raw(&self, raw_record_id: Option<i64>) -> Option<DateTime<Utc>> {
        let raw_record_id = raw_record_id?;
        let timestamp: Option<String> = self
            .conn
            .query_row(
                "SELECT fetched_at FROM raw_records WHERE id = ?1",
                [raw_record_id],
                |row| row.get(0),
            )
            .optional()
            .ok()
            .flatten();
        timestamp.and_then(|value| parse_datetime(&value, "raw_records.fetched_at").ok())
    }

    pub(super) fn replace_sleep_stages(
        &self,
        sleep_id: &str,
        stages: &[SleepStageSlice],
    ) -> Result<()> {
        self.conn
            .prepare_cached("DELETE FROM sleep_stages WHERE sleep_id = ?1")?
            .execute([sleep_id])?;
        let mut insert = self.conn.prepare_cached(
            "INSERT INTO sleep_stages (sleep_id, stage, start_time, end_time, raw_mode)
             VALUES (?1, ?2, ?3, ?4, ?5)",
        )?;
        for stage in stages {
            insert.execute(params![
                sleep_id,
                stage.stage,
                stage.start_time.to_rfc3339(),
                stage.end_time.to_rfc3339(),
                stage.raw_mode,
            ])?;
        }
        Ok(())
    }

    pub(super) fn load_workout_laps(&self, workout_id: &str) -> Result<Vec<WorkoutLapRow>> {
        let mut stmt = self.conn.prepare(
            "SELECT lap_index, start_time, end_time, distance_m, duration_seconds,
                    avg_hr, max_hr
             FROM workout_laps WHERE workout_id = ?1 ORDER BY lap_index",
        )?;
        let rows = stmt.query_map([workout_id], |row| {
            Ok(WorkoutLapRow {
                index: row.get(0)?,
                start_time: row.get(1)?,
                end_time: row.get(2)?,
                distance_m: row.get(3)?,
                duration_seconds: row.get(4)?,
                avg_hr: row.get(5)?,
                max_hr: row.get(6)?,
            })
        })?;
        Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
    }

    pub(super) fn load_workout_splits(&self, workout_id: &str) -> Result<Vec<WorkoutSplitRow>> {
        let mut stmt = self.conn.prepare(
            "SELECT split_index, start_time, end_time, distance_m, duration_seconds,
                    pace_min_per_km, avg_hr, max_hr, elevation_gain_m, elevation_loss_m, partial
             FROM workout_splits WHERE workout_id = ?1 ORDER BY split_index",
        )?;
        let rows = stmt.query_map([workout_id], |row| {
            Ok(WorkoutSplitRow {
                index: row.get(0)?,
                start_time: row.get(1)?,
                end_time: row.get(2)?,
                distance_m: row.get(3)?,
                duration_seconds: row.get(4)?,
                pace_min_per_km: row.get(5)?,
                avg_hr: row.get(6)?,
                max_hr: row.get(7)?,
                elevation_gain_m: row.get(8)?,
                elevation_loss_m: row.get(9)?,
                partial: row.get::<_, i64>(10)? != 0,
            })
        })?;
        Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
    }
}
