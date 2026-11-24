use serde::{Deserialize, Serialize};

/// A workout's route reduced to its outline: at most a few dozen points in a
/// box whose longer side is 1, north up. No coordinates leave the library —
/// the list and the month cards only need the shape.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct RouteShape {
    pub workout_id: String,
    /// Width and height of the box (the longer one is 1).
    pub width: f32,
    pub height: f32,
    /// `[x, y]` in that box, in route order.
    pub points: Vec<[f32; 2]>,
}

/// One local calendar month of visible workouts.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct WorkoutMonth {
    /// `YYYY-MM`, the local month the workouts started in.
    pub month: String,
    pub count: i64,
    /// Sum of the distances that were recorded (workouts without one add nothing).
    pub distance_m: f64,
    /// Sum of start-to-end durations.
    pub duration_s: i64,
    /// The month's longest workout that has a route, drawn on the card.
    pub cover: Option<RouteShape>,
    pub cover_distance_m: Option<f64>,
}

/// One local calendar month of shown sleep sessions.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SleepMonth {
    pub month: String,
    pub nights: i64,
    pub avg_duration_min: f64,
    /// Average falling-asleep time as minutes after local noon (so a night
    /// that starts before and one that starts after midnight average sanely).
    pub avg_onset_min: f64,
    /// Stage minutes summed over the nights that report each stage.
    pub deep_min: f64,
    pub light_min: f64,
    pub rem_min: f64,
    pub awake_min: f64,
}

/// One stage slice of a night, in minutes from the session's start.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct StageSpan {
    pub stage: String,
    pub from_min: f32,
    pub to_min: f32,
}

/// The stage strip drawn on a sleep list row. Empty when the night has no
/// recorded stages: the row then draws the bare start-to-end span.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SleepStrip {
    pub sleep_id: String,
    pub spans: Vec<StageSpan>,
}
