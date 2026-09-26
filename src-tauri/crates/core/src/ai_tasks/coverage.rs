//! P4 窗口覆盖：每个锚点运动按自己的本地开始日独立开窗，重叠窗口的
//! `(category, date)` 由导出层去重、这里只在合并行里给总数。
//!
//! 时间语义（beta1.md P4，与 contract.rs 一致）：
//! - 运动锚点日 = `date(start_time,'localtime')`，Rust 侧等价物是
//!   `start_time.with_timezone(&Local).date_naive()`。
//! - 睡眠归属日 = 醒来那天，即 `date(end_time,'localtime')`。
//! - 窗口 = `[锚点日 - days_before, 锚点日]`；`include_workout_day=false`
//!   时右端为锚点日前一天。`days_before=0` 且不含当天 → 空窗，不产出。

use super::export::WindowGather;
use super::model::{AiTaskCategory, AiTaskCategoryRange, AiTaskCoverage};
use super::AiTaskError;
use crate::models::error::{Result, ZeppBridgeError};
use crate::models::{HeartRateZoneBucket, SourceScope, Workout};
use crate::storage::{local_day_range_utc_bounds, series_metric_spec, Database, MetricSource};
use chrono::{DateTime, Duration, Local, NaiveDate, Utc};
use rusqlite::{params, params_from_iter};
use std::collections::{BTreeMap, BTreeSet};

/// 任务的锚点运动：`workout_ids` 解析后的样子。
///
/// `local_start_day` 是这条运动的窗口锚点——P4 要求每条运动独立开窗，
/// 所以不能先汇总成「任务级时间范围」再切。
pub(crate) struct AnchorWorkout {
    pub workout: Workout,
    pub local_start_day: NaiveDate,
}

/// `date(start_time,'localtime')` 之外的第二个 storage 私有解析——
/// `storage::parse_datetime` 是模块私有的，这里按同一实现复刻一份
/// （RFC3339 → UTC），错误形状保持一致。
pub(crate) fn parse_rfc3339_utc(value: &str, field: &str) -> Result<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(value)
        .map(|dt| dt.with_timezone(&Utc))
        .map_err(|error| ZeppBridgeError::ParseError(format!("{field} 无效: {error}")))
}

/// `storage::parse_scope` 的复刻（同为模块私有）：先认三种已知形态，
/// 认不出再走 serde 的反序列化兜底。
fn parse_source_scope(value: &str) -> Result<SourceScope> {
    match value.trim_matches('"') {
        "user_fused" | "UserFused" => Ok(SourceScope::UserFused),
        "device" | "Device" => Ok(SourceScope::Device),
        "unknown" | "Unknown" => Ok(SourceScope::Unknown),
        other => serde_json::from_str::<SourceScope>(value)
            .map_err(|_| ZeppBridgeError::ParseError(format!("source_scope 无效: {other}"))),
    }
}

impl Database {
    /// `workout_ids` → 锚点（严格）。任一 id 在本机查不到 →
    /// `err.ai_task.workout_not_found`，params 带完整缺失列表。
    pub(crate) fn ai_task_anchors(&self, workout_ids: &[String]) -> Result<Vec<AnchorWorkout>> {
        let (anchors, missing) = self.resolve_ai_task_anchors(workout_ids)?;
        if !missing.is_empty() {
            return Err(AiTaskError::workouts_not_found(missing));
        }
        Ok(anchors)
    }

    fn resolve_ai_task_anchors(
        &self,
        workout_ids: &[String],
    ) -> Result<(Vec<AnchorWorkout>, Vec<String>)> {
        let found = self.workout_details_batch(workout_ids)?;
        let mut anchors = Vec::with_capacity(workout_ids.len());
        let mut missing = Vec::new();
        // 锚点顺序按入参——预览/出仓的 workouts 顺序即用户的选择顺序。
        // get + clone 而不是 remove：同一个 id 重复出现时与旧的逐条查询
        // 一致（每次都拿到 Some），而不是第二次落进 missing。
        for id in workout_ids {
            match found.get(id) {
                Some(workout) => {
                    // `date(start_time,'localtime')` 的 Rust 等价物（P4）。
                    let local_start_day = workout.start_time.with_timezone(&Local).date_naive();
                    anchors.push(AnchorWorkout {
                        workout: workout.clone(),
                        local_start_day,
                    });
                }
                None => missing.push(id.clone()),
            }
        }
        Ok((anchors, missing))
    }

    /// `get_workout_detail` 的批量版：逐 id 调用是每条约 5 条查询的 N+1
    /// （主行、心率区间、轨迹点数、样本计数、编号名字表），这里各发一遍
    /// `IN` 再按 id 归位。行组装规则与 `get_workout_detail` 逐字段一致——
    /// 这是两份代码必须同步演进的地方，改动一边时另一边也要跟着改。
    fn workout_details_batch(&self, workout_ids: &[String]) -> Result<BTreeMap<String, Workout>> {
        let mut details = BTreeMap::new();
        if workout_ids.is_empty() {
            return Ok(details);
        }
        let placeholders = workout_ids
            .iter()
            .map(|_| "?")
            .collect::<Vec<_>>()
            .join(",");
        let mut stmt = self.conn.prepare(&format!(
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
             FROM workouts WHERE workout_id IN ({placeholders})"
        ))?;
        let rows = stmt.query_map(params_from_iter(workout_ids.iter()), |row| {
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
            ))
        })?;
        let mut flat_rows = Vec::new();
        for row in rows {
            flat_rows.push(row?);
        }

        // 心率区间：一遍 IN 取回，按 workout_id 分桶并保持 zone_index 顺序。
        let mut zones: BTreeMap<String, Vec<HeartRateZoneBucket>> = BTreeMap::new();
        {
            let mut stmt = self.conn.prepare(&format!(
                "SELECT workout_id, zone_index, upper_bound_bpm, seconds
                 FROM workout_hr_zones WHERE workout_id IN ({placeholders})
                 ORDER BY workout_id, zone_index"
            ))?;
            let zone_rows = stmt.query_map(params_from_iter(workout_ids.iter()), |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    HeartRateZoneBucket {
                        index: row.get(1)?,
                        upper_bound_bpm: row.get(2)?,
                        seconds: row.get(3)?,
                    },
                ))
            })?;
            for row in zone_rows {
                let (workout_id, bucket) = row?;
                zones.entry(workout_id).or_default().push(bucket);
            }
        }
        let route_counts = self.count_by_workout(
            &format!(
                "SELECT workout_id, COUNT(*) FROM route_points
                 WHERE workout_id IN ({placeholders}) GROUP BY workout_id"
            ),
            workout_ids,
        )?;
        let sample_counts = self.count_by_workout(
            &format!(
                "SELECT workout_id, COUNT(*) FROM workout_samples
                 WHERE workout_id IN ({placeholders}) GROUP BY workout_id"
            ),
            workout_ids,
        )?;
        let code_labels = self.workout_code_label_map()?;

        for (
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
        ) in flat_rows
        {
            let hr_zones = zones.remove(&workout_id).unwrap_or_default();
            let route_points = route_counts.get(&workout_id).copied().unwrap_or(0);
            let stored_samples = sample_counts.get(&workout_id).copied().unwrap_or(0);
            let effective_type = user_override
                .clone()
                .unwrap_or_else(|| workout_type.clone());
            let custom_label = match zepp_type {
                Some(code) => code_labels.get(&code).cloned(),
                None => None,
            };
            details.insert(
                workout_id.clone(),
                Workout {
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
                    start_time: parse_rfc3339_utc(&start, "workout.start_time")?,
                    end_time: parse_rfc3339_utc(&end, "workout.end_time")?,
                    distance_meters,
                    calories,
                    avg_hr,
                    max_hr,
                    training_load,
                    vo2max,
                    source_scope: parse_source_scope(&scope)?,
                    device_id,
                    synced_at: synced_at
                        .as_deref()
                        .map(|value| parse_rfc3339_utc(value, "workout.synced_at"))
                        .transpose()?,
                    gps_available: gps_available != 0 || route_points > 0,
                    sample_count: sample_count.max(stored_samples),
                    zepp_source: None,
                    zepp_type,
                },
            );
        }
        Ok(details)
    }

    /// `SELECT workout_id, COUNT(*) ... GROUP BY workout_id` 的计数小助手。
    fn count_by_workout(&self, sql: &str, workout_ids: &[String]) -> Result<BTreeMap<String, i64>> {
        let mut stmt = self.conn.prepare(sql)?;
        let rows = stmt.query_map(params_from_iter(workout_ids.iter()), |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
        })?;
        let mut counts = BTreeMap::new();
        for row in rows {
            let (workout_id, count) = row?;
            counts.insert(workout_id, count);
        }
        Ok(counts)
    }
}

/// 一个 enabled 窗口类别在各锚点上的窗口集合：
/// `(workout_id, start, end)`，本地日、两端含。空窗不产出。
///
/// 任务没有关联运动时只有一个窗口：`[today - days_before, today]`，
/// `workout_id` 为 `None`——「最近 N 天」本身就是分析对象，
/// `include_workout_day` 在这里没有意义，今天总是算进去。
pub(crate) fn category_windows(
    range: &AiTaskCategoryRange,
    anchors: &[AnchorWorkout],
    today: NaiveDate,
) -> Vec<(Option<String>, NaiveDate, NaiveDate)> {
    if anchors.is_empty() {
        return vec![(None, today - Duration::days(range.days_before), today)];
    }
    anchors
        .iter()
        .filter_map(|anchor| {
            let end = if range.include_workout_day {
                anchor.local_start_day
            } else {
                anchor.local_start_day - Duration::days(1)
            };
            let start = anchor.local_start_day - Duration::days(range.days_before);
            (start <= end).then(|| (Some(anchor.workout.workout_id.clone()), start, end))
        })
        .collect()
}

/// 一个「指标型」类别要查的指标清单。
///
/// 单位/来源表以 `series_metric_spec`（`SERIES_METRICS` 的唯一注册处）为准；
/// `heart_rate` 不在那张表里（它走 `heart_rate_series` 的专用语义），
/// 这里给它显式登记 `metric_samples`/`bpm`。
pub(crate) struct CategoryMetricSpec {
    pub metric: &'static str,
    pub source: MetricSource,
    pub unit: &'static str,
}

pub(crate) fn category_metric_specs(category: AiTaskCategory) -> Vec<CategoryMetricSpec> {
    const HEART_RATE_SPEC: CategoryMetricSpec = CategoryMetricSpec {
        metric: "heart_rate",
        source: MetricSource::Samples,
        unit: "bpm",
    };
    let names: &[&str] = match category {
        AiTaskCategory::Recovery => &[
            "resting_hr",
            "readiness",
            "physical_readiness",
            "mental_readiness",
            "hybrid_charge",
            "physical_charge",
            "mental_charge",
            "stress",
            "respiratory_rate",
            "sleep_hrv",
            "sleep_rhr",
            "hrv_baseline",
            "rhr_baseline",
            "ahi_baseline",
            "spo2_odi",
            "spo2_night_score",
            "spo2_measured_minutes",
            "hrv",
            "hrv_rmssd",
            "spo2",
        ],
        AiTaskCategory::HeartRate => &["heart_rate", "resting_hr"],
        AiTaskCategory::Training => &[
            "training_load",
            "vo2max",
            "lactate_threshold_hr",
            "lactate_threshold_pace",
            "pai_daily",
            "pai_total",
            "steps",
            "active_calories",
            "active_minutes",
        ],
        AiTaskCategory::Body => &[
            "weight",
            "bmi",
            "height",
            "body_fat_rate",
            "body_water_rate",
            "muscle_mass",
            "bone_mass",
            "protein_rate",
            "visceral_fat",
            "bmr",
            "body_balance_score",
        ],
        _ => return Vec::new(),
    };
    names
        .iter()
        .filter_map(|name| {
            if *name == "heart_rate" {
                return Some(HEART_RATE_SPEC);
            }
            series_metric_spec(name).map(|(source, unit)| CategoryMetricSpec {
                metric: name,
                source,
                unit,
            })
        })
        .collect()
}

/// `AiTaskCoverage.units` 的固定列单位（workout / sleep 不查指标表，
/// 它们出的字段是固定的）。
fn fixed_category_units(category: AiTaskCategory) -> BTreeMap<String, String> {
    let entries: &[(&str, &str)] = match category {
        AiTaskCategory::Workout => &[
            ("distance_meters", "m"),
            ("moving_seconds", "s"),
            ("calories", "kcal"),
            ("avg_hr", "bpm"),
            ("max_hr", "bpm"),
            ("min_hr", "bpm"),
            ("training_load", "load"),
            ("vo2max", "ml/kg/min"),
            ("total_steps", "步"),
            ("elevation_gain_m", "m"),
            ("elevation_loss_m", "m"),
        ],
        AiTaskCategory::Sleep => &[
            ("duration_minutes", "min"),
            ("score", "score"),
            ("deep_minutes", "min"),
            ("light_minutes", "min"),
            ("rem_minutes", "min"),
            ("awake_minutes", "min"),
            ("wake_count", "count"),
        ],
        _ => &[],
    };
    entries
        .iter()
        .map(|(name, unit)| (name.to_string(), unit.to_string()))
        .collect()
}

/// 类别会查的指标→单位映射；workout/sleep 用固定列单位。
pub(crate) fn category_units(category: AiTaskCategory) -> BTreeMap<String, String> {
    let specs = category_metric_specs(category);
    if specs.is_empty() {
        return fixed_category_units(category);
    }
    specs
        .iter()
        .map(|spec| (spec.metric.to_string(), spec.unit.to_string()))
        .collect()
}

impl Database {
    /// 一个窗口内「有数据的本地日」集合 + 命中的 `source_scope` 集合。
    ///
    /// 去重粒度就是 P4 的 `(category, date)`：这一天有任何一条该类别数据
    /// （任一**未被排除的**指标、任一来源）就算 covered。
    pub(crate) fn category_window_days(
        &self,
        category: AiTaskCategory,
        start: &str,
        end: &str,
        excluded: &[String],
    ) -> Result<(BTreeSet<String>, BTreeSet<String>)> {
        let mut days = BTreeSet::new();
        let mut sources = BTreeSet::new();
        match category {
            AiTaskCategory::Workout => {
                let mut stmt = self.conn.prepare(
                    "SELECT date(start_time,'localtime'), source_scope FROM workouts
                     WHERE date(start_time,'localtime') BETWEEN ?1 AND ?2",
                )?;
                let rows = stmt.query_map(params![start, end], |row| {
                    Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
                })?;
                for row in rows {
                    let (day, source) = row?;
                    days.insert(day);
                    sources.insert(source);
                }
            }
            AiTaskCategory::Sleep => {
                // 睡眠按醒来那天归属（与 insight 的合同一致）。
                let mut stmt = self.conn.prepare(
                    "SELECT date(end_time,'localtime'), source_scope FROM sleep_sessions
                     WHERE date(end_time,'localtime') BETWEEN ?1 AND ?2",
                )?;
                let rows = stmt.query_map(params![start, end], |row| {
                    Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
                })?;
                for row in rows {
                    let (day, source) = row?;
                    days.insert(day);
                    sources.insert(source);
                }
            }
            _ => {
                for spec in category_metric_specs(category) {
                    if excluded.iter().any(|metric| metric == spec.metric) {
                        continue;
                    }
                    match spec.source {
                        MetricSource::Daily(_) => {
                            let mut stmt = self.conn.prepare(
                                "SELECT date, source_scope FROM daily_metrics
                                 WHERE metric = ?1 AND date BETWEEN ?2 AND ?3",
                            )?;
                            let rows = stmt.query_map(params![spec.metric, start, end], |row| {
                                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
                            })?;
                            for row in rows {
                                let (day, source) = row?;
                                days.insert(day);
                                sources.insert(source);
                            }
                        }
                        MetricSource::Samples => {
                            // 先用宽限 UTC 边界走 `metric_samples(metric, timestamp)`
                            // 索引，再用 localtime 折日——与 sample_metric_points 同式。
                            let bounds = local_day_range_utc_bounds(start, end);
                            let (lower, upper) = match &bounds {
                                Some((lower, upper)) => {
                                    (Some(lower.as_str()), Some(upper.as_str()))
                                }
                                None => (None, None),
                            };
                            let mut stmt = self.conn.prepare(
                                "SELECT date(timestamp,'localtime'), source_scope
                                 FROM metric_samples
                                 WHERE metric = ?1
                                   AND (?4 IS NULL OR timestamp >= ?4)
                                   AND (?5 IS NULL OR timestamp < ?5)
                                   AND date(timestamp,'localtime') BETWEEN ?2 AND ?3",
                            )?;
                            let rows = stmt.query_map(
                                params![spec.metric, start, end, lower, upper],
                                |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
                            )?;
                            for row in rows {
                                let (day, source) = row?;
                                days.insert(day);
                                sources.insert(source);
                            }
                        }
                        MetricSource::SleepScores => {
                            let mut stmt = self.conn.prepare(
                                "SELECT date(end_time,'localtime'), source_scope FROM sleep_sessions
                                 WHERE score IS NOT NULL AND date(end_time,'localtime') BETWEEN ?1 AND ?2",
                            )?;
                            let rows = stmt.query_map(params![start, end], |row| {
                                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
                            })?;
                            for row in rows {
                                let (day, source) = row?;
                                days.insert(day);
                                sources.insert(source);
                            }
                        }
                    }
                }
            }
        }
        Ok((days, sources))
    }
}

/// P2 覆盖事实：逐窗口一行 + 多窗时追加一行 `workout_id=null` 的合并视图
/// （窗口并集天数 + 日期去重后的有数据天数）。
///
/// 不再自己发查询：`gathers` 是出仓构建同一遍取数的结果，coverage 与
/// document 的 days/sources 因此天然出自同一份数据（H4 合并）。
/// `gathers` 为空时回空——对应旧实现里「全空窗类别不产行」。
pub(crate) fn window_coverage_rows(
    category: AiTaskCategory,
    gathers: &[WindowGather],
) -> Vec<AiTaskCoverage> {
    let units = category_units(category);
    let mut rows = Vec::new();
    let mut union_days = BTreeSet::new();
    let mut union_covered = BTreeSet::new();
    let mut union_sources = BTreeSet::new();
    let mut union_metric_days: BTreeMap<String, BTreeSet<String>> = BTreeMap::new();
    let mut merged_start: Option<NaiveDate> = None;
    let mut merged_end: Option<NaiveDate> = None;
    let day_counts = |days: &BTreeMap<String, BTreeSet<String>>| -> BTreeMap<String, i64> {
        days.iter()
            .map(|(metric, set)| (metric.clone(), set.len() as i64))
            .collect()
    };

    for gather in gathers {
        union_days.extend(day_set(gather.start, gather.end));
        union_covered.extend(gather.covered_days.iter().cloned());
        union_sources.extend(gather.sources.iter().cloned());
        for (metric, days) in &gather.metric_days {
            union_metric_days
                .entry(metric.clone())
                .or_default()
                .extend(days.iter().cloned());
        }
        merged_start = Some(merged_start.map_or(gather.start, |d: NaiveDate| d.min(gather.start)));
        merged_end = Some(merged_end.map_or(gather.end, |d: NaiveDate| d.max(gather.end)));
        rows.push(AiTaskCoverage {
            category,
            workout_id: gather.workout_id.clone(),
            start_date: gather.start.to_string(),
            end_date: gather.end.to_string(),
            days_in_range: (gather.end - gather.start).num_days() + 1,
            days_with_data: gather.covered_days.len() as i64,
            sources: gather.sources.iter().cloned().collect(),
            units: units.clone(),
            metric_days: day_counts(&gather.metric_days),
            missing: gather.covered_days.is_empty(),
        });
    }

    if gathers.len() > 1 {
        if let (Some(start), Some(end)) = (merged_start, merged_end) {
            rows.push(AiTaskCoverage {
                category,
                workout_id: None,
                start_date: start.to_string(),
                end_date: end.to_string(),
                // 并集覆盖天数——窗口可以不相连，所以不能拿跨度当天数。
                days_in_range: union_days.len() as i64,
                days_with_data: union_covered.len() as i64,
                sources: union_sources.into_iter().collect(),
                units,
                metric_days: day_counts(&union_metric_days),
                missing: union_covered.is_empty(),
            });
        }
    }
    rows
}

/// `[start, end]` 闭区间里每一天的 `YYYY-MM-DD`。
fn day_set(start: NaiveDate, end: NaiveDate) -> BTreeSet<String> {
    let mut days = BTreeSet::new();
    let mut day = start;
    while day <= end {
        days.insert(day.to_string());
        day += Duration::days(1);
    }
    days
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    fn at(y: i32, m: u32, d: u32, h: u32) -> DateTime<Utc> {
        Utc.with_ymd_and_hms(y, m, d, h, 0, 0).unwrap()
    }

    /// 批量锚点路径的三条不变式：锚点顺序按入参、缺失 id 进 missing、
    /// 每个 Workout 与 `get_workout_detail` 全字段一致（含 hr_zones /
    /// route·sample 计数折算出的 gps_available 与 sample_count）。
    #[test]
    fn anchors_batch_matches_get_workout_detail_and_keeps_input_order() {
        let db = Database::in_memory().unwrap();
        let start_a = at(2026, 9, 10, 10);
        let start_b = at(2026, 9, 12, 6);
        db.insert_workout(&Workout {
            workout_id: "w-a".into(),
            workout_type: "running".into(),
            normalized_type: "running".into(),
            type_source: "string_field".into(),
            effective_type: "running".into(),
            start_time: start_a,
            end_time: start_a + Duration::hours(1),
            distance_meters: Some(10_000.0),
            calories: Some(600),
            avg_hr: Some(140),
            max_hr: Some(170),
            hr_zones: vec![
                HeartRateZoneBucket {
                    index: 0,
                    upper_bound_bpm: 120,
                    seconds: 300,
                },
                HeartRateZoneBucket {
                    index: 1,
                    upper_bound_bpm: 150,
                    seconds: 600,
                },
            ],
            source_scope: SourceScope::UserFused,
            ..Default::default()
        })
        .unwrap();
        db.insert_workout(&Workout {
            workout_id: "w-b".into(),
            workout_type: "walking".into(),
            normalized_type: "walking".into(),
            type_source: "string_field".into(),
            effective_type: "walking".into(),
            start_time: start_b,
            end_time: start_b + Duration::minutes(40),
            source_scope: SourceScope::Device,
            ..Default::default()
        })
        .unwrap();
        // 直接写底层行，让批量分支的 COUNT(route_points)/COUNT(workout_samples)
        // 真正算到东西——它们折算进 gps_available 与 sample_count。
        db.conn
            .execute(
                "INSERT INTO route_points (workout_id, timestamp, latitude, longitude, altitude)
                 VALUES ('w-b', '2026-09-12T06:01:00+00:00', 31.0, 121.0, NULL)",
                [],
            )
            .unwrap();
        db.conn
            .execute(
                "INSERT INTO workout_samples (workout_id, timestamp) VALUES ('w-b', '2026-09-12T06:01:00+00:00')",
                [],
            )
            .unwrap();

        // 顺序故意与入库相反，并混入一个不存在的 id。
        let (anchors, missing) = db
            .resolve_ai_task_anchors(&["w-b".to_string(), "w-a".to_string(), "ghost".to_string()])
            .unwrap();
        assert_eq!(missing, vec!["ghost".to_string()]);
        let ids: Vec<&str> = anchors
            .iter()
            .map(|anchor| anchor.workout.workout_id.as_str())
            .collect();
        assert_eq!(ids, ["w-b", "w-a"], "锚点顺序必须跟入参走");

        for anchor in &anchors {
            let detail = db
                .get_workout_detail(&anchor.workout.workout_id)
                .unwrap()
                .unwrap();
            assert_eq!(
                serde_json::to_value(&anchor.workout).unwrap(),
                serde_json::to_value(&detail).unwrap(),
                "{}：批量行必须与 get_workout_detail 全字段一致",
                anchor.workout.workout_id
            );
            assert_eq!(
                anchor.local_start_day,
                anchor.workout.start_time.with_timezone(&Local).date_naive()
            );
        }
        // 防止「两边一起错」的假绿：计数子查询确实进了字段。
        assert!(anchors[0].workout.gps_available);
        assert!(anchors[0].workout.sample_count >= 1);
        assert_eq!(anchors[1].workout.hr_zones.len(), 2);
    }
}
