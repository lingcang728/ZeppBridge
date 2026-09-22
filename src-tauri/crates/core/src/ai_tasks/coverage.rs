//! P4 窗口覆盖：每个锚点运动按自己的本地开始日独立开窗，重叠窗口的
//! `(category, date)` 由导出层去重、这里只在合并行里给总数。
//!
//! 时间语义（beta1.md P4，与 contract.rs 一致）：
//! - 运动锚点日 = `date(start_time,'localtime')`，Rust 侧等价物是
//!   `start_time.with_timezone(&Local).date_naive()`。
//! - 睡眠归属日 = 醒来那天，即 `date(end_time,'localtime')`。
//! - 窗口 = `[锚点日 - days_before, 锚点日]`；`include_workout_day=false`
//!   时右端为锚点日前一天。`days_before=0` 且不含当天 → 空窗，不产出。

use super::model::{AiTask, AiTaskCategory, AiTaskCategoryRange, AiTaskCoverage};
use super::AiTaskError;
use crate::models::error::Result;
use crate::models::Workout;
use crate::storage::{local_day_range_utc_bounds, series_metric_spec, Database, MetricSource};
use chrono::{Duration, Local, NaiveDate};
use rusqlite::params;
use std::collections::{BTreeMap, BTreeSet};

/// 任务的锚点运动：`workout_ids` 解析后的样子。
///
/// `local_start_day` 是这条运动的窗口锚点——P4 要求每条运动独立开窗，
/// 所以不能先汇总成「任务级时间范围」再切。
pub(crate) struct AnchorWorkout {
    pub workout: Workout,
    pub local_start_day: NaiveDate,
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
        let mut anchors = Vec::with_capacity(workout_ids.len());
        let mut missing = Vec::new();
        for id in workout_ids {
            match self.get_workout_detail(id)? {
                Some(workout) => {
                    // `date(start_time,'localtime')` 的 Rust 等价物（P4）。
                    let local_start_day = workout.start_time.with_timezone(&Local).date_naive();
                    anchors.push(AnchorWorkout {
                        workout,
                        local_start_day,
                    });
                }
                None => missing.push(id.clone()),
            }
        }
        Ok((anchors, missing))
    }
}

/// 一个 enabled 窗口类别在各锚点上的窗口集合：
/// `(workout_id, start, end)`，本地日、两端含。空窗不产出。
pub(crate) fn category_windows(
    range: &AiTaskCategoryRange,
    anchors: &[AnchorWorkout],
) -> Vec<(String, NaiveDate, NaiveDate)> {
    anchors
        .iter()
        .filter_map(|anchor| {
            let end = if range.include_workout_day {
                anchor.local_start_day
            } else {
                anchor.local_start_day - Duration::days(1)
            };
            let start = anchor.local_start_day - Duration::days(range.days_before);
            (start <= end).then(|| (anchor.workout.workout_id.clone(), start, end))
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
    /// （任一指标、任一来源）就算 covered。
    pub(crate) fn category_window_days(
        &self,
        category: AiTaskCategory,
        start: &str,
        end: &str,
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
                    }
                }
            }
        }
        Ok((days, sources))
    }

    /// P2 覆盖事实：每个 enabled 窗口类别 × 每个锚点运动一行；
    /// 一个类别有多个窗口时追加一行 `workout_id=null` 的合并视图
    /// （窗口并集天数 + 日期去重后的有数据天数）。
    pub(crate) fn ai_task_coverage(
        &self,
        task: &AiTask,
        anchors: &[AnchorWorkout],
    ) -> Result<Vec<AiTaskCoverage>> {
        let mut rows = Vec::new();
        for range in &task.categories {
            if !range.enabled || !range.category.is_windowed() {
                continue;
            }
            let windows = category_windows(range, anchors);
            if windows.is_empty() {
                continue;
            }
            let units = category_units(range.category);
            let mut union_days = BTreeSet::new();
            let mut union_covered = BTreeSet::new();
            let mut union_sources = BTreeSet::new();
            let mut merged_start: Option<NaiveDate> = None;
            let mut merged_end: Option<NaiveDate> = None;

            for (workout_id, start, end) in &windows {
                let (days, sources) = self.category_window_days(
                    range.category,
                    &start.to_string(),
                    &end.to_string(),
                )?;
                union_days.extend(day_set(*start, *end));
                union_covered.extend(days.iter().cloned());
                union_sources.extend(sources.iter().cloned());
                merged_start = Some(merged_start.map_or(*start, |d: NaiveDate| d.min(*start)));
                merged_end = Some(merged_end.map_or(*end, |d: NaiveDate| d.max(*end)));
                rows.push(AiTaskCoverage {
                    category: range.category,
                    workout_id: Some(workout_id.clone()),
                    start_date: start.to_string(),
                    end_date: end.to_string(),
                    days_in_range: (*end - *start).num_days() + 1,
                    days_with_data: days.len() as i64,
                    sources: sources.into_iter().collect(),
                    units: units.clone(),
                    missing: days.is_empty(),
                });
            }

            if windows.len() > 1 {
                let (Some(start), Some(end)) = (merged_start, merged_end) else {
                    continue;
                };
                rows.push(AiTaskCoverage {
                    category: range.category,
                    workout_id: None,
                    start_date: start.to_string(),
                    end_date: end.to_string(),
                    // 并集覆盖天数——窗口可以不相连，所以不能拿跨度当天数。
                    days_in_range: union_days.len() as i64,
                    days_with_data: union_covered.len() as i64,
                    sources: union_sources.into_iter().collect(),
                    units,
                    missing: union_covered.is_empty(),
                });
            }
        }
        Ok(rows)
    }
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
