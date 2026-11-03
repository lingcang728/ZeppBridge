pub mod workout_detail;

pub use workout_detail::{
    decode_workout_detail, splits_from_cumulative_distance, DecodedWorkout, PauseInterval,
    RoutePoint, WorkoutLap, WorkoutSample,
};
