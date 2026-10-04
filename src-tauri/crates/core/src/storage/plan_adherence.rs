//! Day + sport comparison only. We do not infer lap/step correspondence.
use super::Database;
use crate::models::error::Result;
use crate::training_plan::{Intensity, Sport, StepLength, StepNode, Target, Workout};
use chrono::{Duration, NaiveDate};
use rusqlite::params;
use serde::Serialize;
use std::collections::BTreeMap;

#[derive(Debug, Clone, Serialize)]
pub struct PlannedDay {
    pub name: String,
    pub sport: Sport,
    pub seconds: Option<u64>,
    pub hr_low: Option<u16>,
    pub hr_high: Option<u16>,
}
#[derive(Debug, Clone, Serialize)]
pub struct ActualDay {
    pub workout_id: String,
    pub seconds: Option<u64>,
    pub avg_hr: Option<u16>,
    pub sport: String,
    pub compatible: bool,
}
#[derive(Debug, Clone, Serialize)]
pub struct AdherenceDay {
    pub date: String,
    pub planned: Option<PlannedDay>,
    pub actual: Vec<ActualDay>,
    pub verdict: &'static str,
}

pub fn compatible_sport(sport: Sport, actual: &str) -> bool {
    match sport {
        Sport::Running => matches!(
            actual,
            "running"
                | "outdoor_running"
                | "indoor_running"
                | "treadmill"
                | "trail_running"
                | "track_running"
        ),
        Sport::Cycling => matches!(
            actual,
            "cycling" | "outdoor_cycling" | "indoor_cycling" | "mountain_biking" | "bmx"
        ),
        Sport::PoolSwim => matches!(actual, "pool_swim" | "pool_swimming" | "lap_swimming"),
        Sport::OpenWaterSwim => matches!(actual, "open_water_swim" | "open_water_swimming"),
    }
}

fn planned(workout: Workout) -> PlannedDay {
    let mut weight = 0u64;
    let mut low = 0u64;
    let mut high = 0u64;
    let mut add = |step: &crate::training_plan::Step, times: u32| {
        if !matches!(step.intensity, Intensity::Active | Intensity::Interval) {
            return;
        }
        if let (StepLength::Time { seconds }, Target::HeartRate { low: l, high: h }) =
            (step.length, step.target)
        {
            let seconds = u64::from(seconds) * u64::from(times);
            weight += seconds;
            low += u64::from(l) * seconds;
            high += u64::from(h) * seconds;
        }
    };
    for node in &workout.steps {
        match node {
            StepNode::Step(step) => add(step, 1),
            StepNode::Repeat { times, steps } => {
                for step in steps {
                    add(step, *times);
                }
            }
        }
    }
    PlannedDay {
        seconds: workout.total_seconds(),
        name: workout.name,
        sport: workout.sport,
        hr_low: (weight > 0).then(|| (low / weight) as u16),
        hr_high: (weight > 0).then(|| (high / weight) as u16),
    }
}

impl Database {
    pub fn plan_adherence(&self, from: NaiveDate, to: NaiveDate) -> Result<Vec<AdherenceDay>> {
        if to < from || (to - from).num_days() > 366 {
            return Ok(Vec::new());
        }
        let mut plans = BTreeMap::<String, Option<PlannedDay>>::new();
        let mut stmt = self.conn.prepare("SELECT window_start,window_ids,kind,undone,body FROM training_plan_publishes WHERE state='sent' AND window_start BETWEEN ?1 AND ?2 AND id > COALESCE((SELECT MAX(id) FROM training_plan_publishes WHERE kind='revoked'),0) ORDER BY id")?;
        for row in stmt.query_map(
            params![(from - Duration::days(6)).to_string(), to.to_string()],
            |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, bool>(3)?,
                    r.get::<_, String>(4)?,
                ))
            },
        )? {
            let (start, ids, kind, undone, body) = row?;
            if body == "null" || undone {
                continue;
            } // no network delivery happened
            let Some(start) = NaiveDate::parse_from_str(&start, "%Y-%m-%d").ok() else {
                continue;
            };
            for offset in 0..7 {
                let day = start + Duration::days(offset);
                if day >= from && day <= to {
                    plans.insert(day.to_string(), None);
                }
            }
            if !matches!(kind.as_str(), "publish" | "roll" | "undo") {
                continue;
            }
            for id in serde_json::from_str::<Vec<i64>>(&ids)? {
                let text: String = self.conn.query_row(
                    "SELECT workout FROM training_plan_workouts WHERE id=?1",
                    [id],
                    |r| r.get(0),
                )?;
                let workout: Workout = serde_json::from_str(&text)?;
                if workout.date >= from
                    && workout.date <= to
                    && workout.date >= start
                    && workout.date <= start + Duration::days(6)
                {
                    plans.insert(workout.date.to_string(), Some(planned(workout)));
                }
            }
        }
        let mut actual = BTreeMap::<String, Vec<ActualDay>>::new();
        let mut stmt = self.conn.prepare("SELECT date(start_time,'localtime'),workout_id,moving_seconds,avg_hr,COALESCE(workout_type_override,workout_type) FROM workouts WHERE date(start_time,'localtime') BETWEEN ?1 AND ?2 ORDER BY start_time")?;
        for row in stmt.query_map(params![from.to_string(), to.to_string()], |r| {
            Ok((
                r.get::<_, String>(0)?,
                ActualDay {
                    workout_id: r.get(1)?,
                    seconds: r.get(2)?,
                    avg_hr: r.get(3)?,
                    sport: r.get(4)?,
                    compatible: false,
                },
            ))
        })? {
            let (date, item) = row?;
            actual.entry(date).or_default().push(item);
        }
        let mut out = Vec::new();
        for offset in 0..=(to - from).num_days() {
            let date = (from + Duration::days(offset)).to_string();
            let planned = plans.remove(&date).flatten();
            let mut actual = actual.remove(&date).unwrap_or_default();
            for item in &mut actual {
                item.compatible = planned
                    .as_ref()
                    .is_some_and(|p| compatible_sport(p.sport, &item.sport));
            }
            let verdict = if planned.is_some() {
                if actual.iter().any(|a| a.compatible) {
                    "done"
                } else {
                    "missed"
                }
            } else if actual.is_empty() {
                "none"
            } else {
                "extra"
            };
            out.push(AdherenceDay {
                date,
                planned,
                actual,
                verdict,
            });
        }
        Ok(out)
    }
}
