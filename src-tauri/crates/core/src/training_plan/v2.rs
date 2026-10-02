//! 校验过的训练 → 官方 Workout V2 报文。
//!
//! 字段名、枚举值照 `devopen.zepp.com/docs/data-apis/workout-v2-schema` 逐字抄。
//! 按距离计的步骤和配速目标这里也会转，但单位是推测（米、每公里秒数），所以校验
//! 会挡住它们，见 [`super::VERIFIED`]。

use super::window::Window;
use super::{Intensity, Sport, Step, StepLength, StepNode, Target, Workout};
use serde_json::{json, Value};

/// 一条已经在账本里有编号的训练。`id` 就是 V2 的 `workoutId`（要求在第三方平台内唯一）。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NumberedWorkout {
    pub id: i64,
    pub workout: Workout,
}

/// 一整个窗口的请求体。只放落在窗口里的训练，按日期、编号排好。
///
/// `workouts` 为空时**不要**发它：空数组在官方那边是「清掉服务端从现在起 7 天」，
/// 只有用户确认过的清空才能这么发（见 `publish`）。
pub fn window_body(window: Window, workouts: &[NumberedWorkout]) -> Value {
    let mut inside: Vec<&NumberedWorkout> = workouts
        .iter()
        .filter(|item| window.contains(item.workout.date))
        .collect();
    inside.sort_by_key(|item| (item.workout.date, item.id));
    json!({
        "startDate": window.start.to_string(),
        "endDate": window.end().to_string(),
        "workouts": inside.into_iter().map(workout_json).collect::<Vec<_>>(),
    })
}

fn workout_json(item: &NumberedWorkout) -> Value {
    let workout = &item.workout;
    let mut body = json!({
        "workoutId": item.id,
        "workoutDate": workout.date.to_string(),
        "sport": sport(workout.sport),
        "workoutName": workout.name,
        "steps": workout
            .steps
            .iter()
            .enumerate()
            .map(|(index, node)| node_json(index + 1, node))
            .collect::<Vec<_>>(),
    });
    if let Some(description) = workout.description.as_deref() {
        body["description"] = json!(description);
    }
    body
}

fn node_json(order: usize, node: &StepNode) -> Value {
    match node {
        StepNode::Step(step) => step_json(order, step),
        StepNode::Repeat { times, steps } => json!({
            "type": "WorkoutRepeatStep",
            "stepOrder": order,
            "repeatType": "REPEAT_UNTIL_STEPS_CMPLT",
            "repeatValue": times,
            "steps": steps
                .iter()
                .enumerate()
                .map(|(index, step)| step_json(index + 1, step))
                .collect::<Vec<_>>(),
        }),
    }
}

fn step_json(order: usize, step: &Step) -> Value {
    let (duration_type, duration_value) = match step.length {
        StepLength::Time { seconds } => ("TIME", seconds),
        // 未核实：文档写「秒」，按常理应是米。
        StepLength::Distance { meters } => ("DISTANCE", meters),
    };
    let (target_type, low, high) = match step.target {
        // 未核实：V2 的 targetType 必填，「不设目标」的写法文档没给。
        Target::Open => ("OPEN", 0, 0),
        Target::HeartRate { low, high } => ("HEART_RATE_LAP", low, high),
        Target::Power { low, high } => ("POWER_LAP", low, high),
        // 未核实：配速单位文档没写，这里按每公里秒数。
        Target::Pace { fast, slow } => ("PACE_LAP", fast, slow),
    };
    let mut body = json!({
        "type": "WorkoutStep",
        "stepOrder": order,
        "intensity": intensity(step.intensity),
        "durationType": duration_type,
        "durationValue": duration_value,
        "targetType": target_type,
        "targetValueLow": low,
        "targetValueHigh": high,
    });
    if let Some(note) = step.note.as_deref() {
        body["description"] = json!(note);
    }
    body
}

fn sport(sport: Sport) -> &'static str {
    match sport {
        Sport::Running => "RUNNING",
        Sport::Cycling => "CYCLING",
        Sport::PoolSwim => "LAP_SWIMMING",
        Sport::OpenWaterSwim => "OPEN_WATER_SWIMMING",
    }
}

fn intensity(intensity: Intensity) -> &'static str {
    match intensity {
        Intensity::Warmup => "WARMUP",
        Intensity::Active => "ACTIVE",
        Intensity::Interval => "INTERVAL",
        Intensity::Recovery => "RECOVERY",
        Intensity::Rest => "REST",
        Intensity::Cooldown => "COOLDOWN",
    }
}
