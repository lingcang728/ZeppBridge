//! Time-bridge facts. Missing readings stay absent; category presence uses the
//! same registry and local-day rules as the exported AI package.
use super::{Database, MetricSource};
use crate::ai_tasks::{coverage::category_metric_specs, AiTaskCategory};
use crate::models::error::Result;
use chrono::{Duration, NaiveDate};
use rusqlite::params;
use serde::Serialize;
use std::collections::BTreeMap;

#[derive(Debug, Clone, Serialize)]
pub struct DayStripCell {
    pub date: String,
    pub has: bool,
    pub value: Option<f64>,
    pub unit: Option<String>,
    pub workout_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct DayStripRow {
    pub category: AiTaskCategory,
    pub metric: Option<String>,
    pub cells: Vec<DayStripCell>,
}

impl Database {
    pub fn ai_task_day_strip(&self, days_before: i64, end: NaiveDate) -> Result<Vec<DayStripRow>> {
        // 时间桥只要 90 天；牌桌的「6 个月」要从五个月前的 1 号起，最多 184 天。
        let count = days_before.clamp(1, 186);
        let start = end - Duration::days(count - 1);
        let first = start.to_string();
        let last = end.to_string();
        let mut result = Vec::new();
        for (category, representative) in [
            (AiTaskCategory::Sleep, "duration_minutes"),
            (AiTaskCategory::Recovery, "readiness"),
            (AiTaskCategory::HeartRate, "resting_hr"),
            (AiTaskCategory::Workout, "moving_seconds"),
            (AiTaskCategory::Training, "training_load"),
            (AiTaskCategory::Body, "weight"),
        ] {
            let (have, _) = self.category_window_days(category, &first, &last, &[])?;
            let mut values = BTreeMap::<String, (f64, String)>::new();
            let mut ids = BTreeMap::<String, Vec<String>>::new();
            match category {
                AiTaskCategory::Sleep => {
                    let mut stmt = self.conn.prepare("SELECT date(end_time,'localtime'), SUM(duration_minutes) FROM sleep_sessions_shown WHERE date(end_time,'localtime') BETWEEN ?1 AND ?2 GROUP BY date(end_time,'localtime')")?;
                    for row in stmt.query_map(params![first, last], |r| {
                        Ok((r.get::<_, String>(0)?, r.get::<_, f64>(1)?))
                    })? {
                        let (date, value) = row?;
                        values.insert(date, (value, "min".into()));
                    }
                }
                AiTaskCategory::Workout => {
                    let mut stmt = self.conn.prepare("SELECT date(start_time,'localtime'), workout_id, moving_seconds FROM workouts WHERE date(start_time,'localtime') BETWEEN ?1 AND ?2 ORDER BY start_time")?;
                    let mut complete = BTreeMap::<String, bool>::new();
                    for row in stmt.query_map(params![first, last], |r| {
                        Ok((
                            r.get::<_, String>(0)?,
                            r.get::<_, String>(1)?,
                            r.get::<_, Option<f64>>(2)?,
                        ))
                    })? {
                        let (date, id, seconds) = row?;
                        ids.entry(date.clone()).or_default().push(id);
                        let known = complete.entry(date.clone()).or_insert(true);
                        if let Some(seconds) = seconds.filter(|v| v.is_finite() && *v >= 0.0) {
                            values.entry(date).or_insert((0.0, "min".into())).0 += seconds / 60.0;
                        } else {
                            *known = false;
                        }
                    }
                    values.retain(|date, _| complete.get(date) == Some(&true));
                }
                _ => {
                    if let Some(spec) = category_metric_specs(category)
                        .into_iter()
                        .find(|s| s.metric == representative)
                    {
                        let points = match spec.source {
                            MetricSource::Daily(spread) => {
                                self.daily_metric_points(spec.metric, spread, &first, &last)?
                            }
                            MetricSource::Samples => {
                                self.sample_metric_points(spec.metric, &first, &last)?
                            }
                            MetricSource::SleepScores => self.sleep_score_points(&first, &last)?,
                        };
                        for point in points {
                            if point.value.is_finite() {
                                values.insert(point.date, (point.value, spec.unit.into()));
                            }
                        }
                    }
                }
            }
            let metric = (!values.is_empty()).then(|| representative.to_string());
            let cells = (0..count)
                .map(|offset| {
                    let date = (start + Duration::days(offset)).to_string();
                    let reading = values.get(&date);
                    DayStripCell {
                        has: have.contains(&date),
                        value: reading.map(|v| v.0),
                        unit: reading.map(|v| v.1.clone()),
                        workout_ids: ids.remove(&date).unwrap_or_default(),
                        date,
                    }
                })
                .collect();
            result.push(DayStripRow {
                category,
                metric,
                cells,
            });
        }
        Ok(result)
    }
}
