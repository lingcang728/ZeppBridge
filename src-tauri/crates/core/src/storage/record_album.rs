//! 运动 / 睡眠列表的「相册」视图要的聚合：按本地月份汇总（年卡由前端把月份加起来），
//! 以及列表行、方块上画的小图（运动轨迹的轮廓、一晚的分期条）。都是只读查询。

use super::*;

/// 一条轨迹的轮廓最多留这么多点：列表行上的缩略图只有几十像素宽。
const SHAPE_POINTS: usize = 40;
/// 一次 `IN (...)` 最多带这么多个编号（SQLite 的参数上限按最老的 999 算）。
const CHUNK: usize = 400;

/// 和前端「可展示」同一道门：有类型之外至少还有一项真读数（或者一段时长）。
const DISPLAYABLE: &str = "(COALESCE(distance_meters, 0) > 0 OR COALESCE(calories, 0) > 0
    OR COALESCE(avg_hr, 0) > 0 OR COALESCE(max_hr, 0) > 0 OR COALESCE(training_load, 0) > 0
    OR COALESCE(vo2max, 0) > 0 OR julianday(end_time) > julianday(start_time))";

/// 经纬度点 → 长边为 1、北在上的轮廓。点太少或者原地没动（跑步机上误开了 GPS）返回 None。
pub(super) fn route_shape(workout_id: &str, points: &[(f64, f64)]) -> Option<RouteShape> {
    if points.len() < 2 {
        return None;
    }
    let lat0 = points.iter().map(|(lat, _)| lat).sum::<f64>() / points.len() as f64;
    let squeeze = lat0.to_radians().cos().abs().max(0.01);
    let projected: Vec<(f64, f64)> = points
        .iter()
        .map(|(lat, lon)| (lon * squeeze, *lat))
        .collect();
    let (min_x, max_x) = projected
        .iter()
        .fold((f64::MAX, f64::MIN), |(lo, hi), (x, _)| {
            (lo.min(*x), hi.max(*x))
        });
    let (min_y, max_y) = projected
        .iter()
        .fold((f64::MAX, f64::MIN), |(lo, hi), (_, y)| {
            (lo.min(*y), hi.max(*y))
        });
    let span = (max_x - min_x).max(max_y - min_y);
    // 约 10 米以内：算原地没动。
    if span < 0.0001 {
        return None;
    }
    let step = (projected.len() - 1) as f64 / (SHAPE_POINTS.min(projected.len()) - 1) as f64;
    let round = |value: f64| ((value * 1000.0).round() / 1000.0) as f32;
    let mut shape = Vec::with_capacity(SHAPE_POINTS);
    for i in 0..SHAPE_POINTS.min(projected.len()) {
        let (x, y) = projected[((i as f64) * step).round() as usize];
        shape.push([round((x - min_x) / span), round((max_y - y) / span)]);
    }
    Some(RouteShape {
        workout_id: workout_id.to_string(),
        width: round((max_x - min_x) / span),
        height: round((max_y - min_y) / span),
        points: shape,
    })
}

/// 入睡时刻 → 当地中午之后的分钟数（22:30 → 630，次日 01:10 → 790）：前后半夜的平均不会被午夜劈开。
pub(super) fn minutes_after_noon(local_hhmm: &str) -> Option<f64> {
    let (h, m) = local_hhmm.split_once(':')?;
    let minutes = h.parse::<i64>().ok()? * 60 + m.get(..2)?.parse::<i64>().ok()?;
    Some(((minutes - 720).rem_euclid(1440)) as f64)
}

impl Database {
    /// 这些运动的轨迹轮廓（没有轨迹的不在结果里）。
    pub fn workout_route_shapes(&self, workout_ids: &[String]) -> Result<Vec<RouteShape>> {
        let mut shapes = Vec::new();
        for chunk in workout_ids.chunks(CHUNK) {
            let placeholders = vec!["?"; chunk.len()].join(",");
            let mut stmt = self.conn.prepare(&format!(
                "SELECT workout_id, latitude, longitude FROM route_points
                 WHERE workout_id IN ({placeholders})
                 ORDER BY workout_id, timestamp, id"
            ))?;
            let rows = stmt.query_map(rusqlite::params_from_iter(chunk.iter()), |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, f64>(1)?,
                    row.get::<_, f64>(2)?,
                ))
            })?;
            let mut current: Option<String> = None;
            let mut points: Vec<(f64, f64)> = Vec::new();
            for row in rows {
                let (id, lat, lon) = row?;
                if current.as_deref() != Some(id.as_str()) {
                    if let Some(done) = current.take() {
                        shapes.extend(route_shape(&done, &points));
                    }
                    points.clear();
                    current = Some(id);
                }
                if lat.is_finite() && lon.is_finite() && (lat != 0.0 || lon != 0.0) {
                    points.push((lat, lon));
                }
            }
            if let Some(done) = current {
                shapes.extend(route_shape(&done, &points));
            }
        }
        Ok(shapes)
    }

    /// 按本地月份汇总的运动，最新的月份在前。只算列表里看得见、可展示的那些。
    pub fn workout_months(&self) -> Result<Vec<WorkoutMonth>> {
        let mut stmt = self.conn.prepare(&format!(
            "SELECT strftime('%Y-%m', start_time, 'localtime') AS month, COUNT(*),
                    COALESCE(SUM(CASE WHEN distance_meters > 0 THEN distance_meters END), 0),
                    COALESCE(SUM(CASE WHEN julianday(end_time) > julianday(start_time)
                        THEN CAST(ROUND((julianday(end_time) - julianday(start_time)) * 86400) AS INTEGER) END), 0)
             FROM workouts_visible WHERE {DISPLAYABLE}
             GROUP BY month HAVING month IS NOT NULL ORDER BY month DESC"
        ))?;
        let rows = stmt.query_map([], |row| {
            Ok(WorkoutMonth {
                month: row.get(0)?,
                count: row.get(1)?,
                distance_m: row.get(2)?,
                duration_s: row.get(3)?,
                cover: None,
                cover_distance_m: None,
            })
        })?;
        let mut months = rows.collect::<std::result::Result<Vec<_>, _>>()?;

        // 每个月的封面：当月距离最长、带轨迹的那一条。
        let mut covers: HashMap<String, (String, f64)> = HashMap::new();
        {
            let mut stmt = self.conn.prepare(&format!(
                "SELECT strftime('%Y-%m', start_time, 'localtime') AS month, workout_id, distance_meters
                 FROM workouts_visible
                 WHERE {DISPLAYABLE} AND distance_meters > 0
                   AND EXISTS (SELECT 1 FROM route_points r WHERE r.workout_id = workouts_visible.workout_id)
                 ORDER BY distance_meters DESC"
            ))?;
            let rows = stmt.query_map([], |row| {
                Ok((
                    row.get::<_, Option<String>>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, f64>(2)?,
                ))
            })?;
            for row in rows {
                let (month, id, distance) = row?;
                if let Some(month) = month {
                    covers.entry(month).or_insert((id, distance));
                }
            }
        }
        let ids: Vec<String> = covers.values().map(|(id, _)| id.clone()).collect();
        let mut shapes: HashMap<String, RouteShape> = self
            .workout_route_shapes(&ids)?
            .into_iter()
            .map(|shape| (shape.workout_id.clone(), shape))
            .collect();
        for month in &mut months {
            if let Some((id, distance)) = covers.get(&month.month) {
                if let Some(shape) = shapes.remove(id) {
                    month.cover = Some(shape);
                    month.cover_distance_m = Some(*distance);
                }
            }
        }
        Ok(months)
    }

    /// 按本地月份（入睡那天）汇总的睡眠，最新的月份在前。
    pub fn sleep_months(&self) -> Result<Vec<SleepMonth>> {
        let mut stmt = self.conn.prepare(
            "SELECT strftime('%Y-%m', start_time, 'localtime'), strftime('%H:%M', start_time, 'localtime'),
                    duration_minutes,
                    CASE WHEN deep_available THEN deep_minutes END,
                    CASE WHEN light_available THEN light_minutes END,
                    CASE WHEN rem_available THEN rem_minutes END,
                    CASE WHEN awake_available THEN awake_minutes END
             FROM sleep_sessions_shown ORDER BY start_time DESC",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok((
                row.get::<_, Option<String>>(0)?,
                row.get::<_, Option<String>>(1)?,
                row.get::<_, Option<f64>>(2)?,
                row.get::<_, Option<f64>>(3)?,
                row.get::<_, Option<f64>>(4)?,
                row.get::<_, Option<f64>>(5)?,
                row.get::<_, Option<f64>>(6)?,
            ))
        })?;
        struct Acc {
            nights: i64,
            duration: f64,
            durations: i64,
            onset: f64,
            onsets: i64,
            stages: [f64; 4],
        }
        let mut order: Vec<String> = Vec::new();
        let mut by_month: HashMap<String, Acc> = HashMap::new();
        for row in rows {
            let (month, clock, duration, deep, light, rem, awake) = row?;
            let Some(month) = month else { continue };
            let acc = by_month.entry(month.clone()).or_insert_with(|| {
                order.push(month.clone());
                Acc {
                    nights: 0,
                    duration: 0.0,
                    durations: 0,
                    onset: 0.0,
                    onsets: 0,
                    stages: [0.0; 4],
                }
            });
            acc.nights += 1;
            if let Some(minutes) = duration.filter(|value| *value > 0.0) {
                acc.duration += minutes;
                acc.durations += 1;
            }
            if let Some(onset) = clock.as_deref().and_then(minutes_after_noon) {
                acc.onset += onset;
                acc.onsets += 1;
            }
            for (slot, value) in [deep, light, rem, awake].into_iter().enumerate() {
                acc.stages[slot] += value.unwrap_or_default().max(0.0);
            }
        }
        Ok(order
            .into_iter()
            .filter_map(|month| {
                let acc = by_month.remove(&month)?;
                Some(SleepMonth {
                    month,
                    nights: acc.nights,
                    avg_duration_min: if acc.durations > 0 {
                        acc.duration / acc.durations as f64
                    } else {
                        0.0
                    },
                    avg_onset_min: if acc.onsets > 0 {
                        acc.onset / acc.onsets as f64
                    } else {
                        0.0
                    },
                    deep_min: acc.stages[0],
                    light_min: acc.stages[1],
                    rem_min: acc.stages[2],
                    awake_min: acc.stages[3],
                })
            })
            .collect())
    }

    /// 这些晚上的分期条（分钟，从这一晚开始算）。没有分期记录的晚上给一条空的。
    pub fn sleep_stage_strips(&self, sleep_ids: &[String]) -> Result<Vec<SleepStrip>> {
        let mut strips: Vec<SleepStrip> = Vec::new();
        for chunk in sleep_ids.chunks(CHUNK) {
            let placeholders = vec!["?"; chunk.len()].join(",");
            let mut stmt = self.conn.prepare(&format!(
                "SELECT s.sleep_id, st.stage,
                        (julianday(st.start_time) - julianday(s.start_time)) * 1440,
                        (julianday(st.end_time) - julianday(s.start_time)) * 1440
                 FROM sleep_sessions s JOIN sleep_stages st ON st.sleep_id = s.sleep_id
                 WHERE s.sleep_id IN ({placeholders})
                 ORDER BY s.sleep_id, st.start_time, st.id"
            ))?;
            let rows = stmt.query_map(rusqlite::params_from_iter(chunk.iter()), |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<f64>>(2)?,
                    row.get::<_, Option<f64>>(3)?,
                ))
            })?;
            let mut spans: HashMap<String, Vec<StageSpan>> = HashMap::new();
            for row in rows {
                let (id, stage, from, to) = row?;
                let (Some(from), Some(to)) = (from, to) else {
                    continue;
                };
                if to > from {
                    spans.entry(id).or_default().push(StageSpan {
                        stage,
                        from_min: ((from * 10.0).round() / 10.0) as f32,
                        to_min: ((to * 10.0).round() / 10.0) as f32,
                    });
                }
            }
            for id in chunk {
                strips.push(SleepStrip {
                    sleep_id: id.clone(),
                    spans: spans.remove(id).unwrap_or_default(),
                });
            }
        }
        Ok(strips)
    }
}
