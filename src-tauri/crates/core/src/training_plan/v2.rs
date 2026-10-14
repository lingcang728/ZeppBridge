//! 校验过的训练 → 官方 Workout V2 报文。
//!
//! 字段名、枚举值照 `devopen.zepp.com/docs/data-apis/workout-v2-schema` 逐字抄；
//! 单位按 2026-10-06 实测（见 [`super::VERIFIED`]）：距离是米，配速是速度（米/秒）。
//!
//! 描述（`description`）第一行是「目的 · 子类型」，第二行起是要点，用换行符
//! 分开（R1 实测手机和手表都正确换行）。手表上第三方计划只到大类、会让用户再选
//! 一次子类型，这一行就是提醒用户选哪个。这是发给手表的**内容**，不是界面文案，所以按
//! 用户发布时的界面语言写（[`WatchLocale`]），没有码。

use super::window::Window;
use super::{Intensity, Sport, Step, StepLength, StepNode, Target, Variant, Workout};
use serde_json::{json, Value};

/// 描述第一行里子类型的写法用哪种语言。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum WatchLocale {
    #[default]
    Zh,
    En,
    Es,
}

impl WatchLocale {
    /// 界面语言码（`zh-CN`、`en`、`es-ES`……）→ 这三种之一；别的语言用英文。
    pub fn from_tag(tag: &str) -> Self {
        let tag = tag.trim().to_ascii_lowercase();
        if tag.starts_with("zh") {
            Self::Zh
        } else if tag.starts_with("es") {
            Self::Es
        } else {
            Self::En
        }
    }

    pub fn tag(self) -> &'static str {
        match self {
            Self::Zh => "zh",
            Self::En => "en",
            Self::Es => "es",
        }
    }
}

/// 子类型在手表描述里的叫法，尽量和手表上让用户选的那一项同名。
pub fn variant_label(sport: Sport, variant: Variant, locale: WatchLocale) -> Option<&'static str> {
    use WatchLocale::{En, Es, Zh};
    Some(match (sport, variant, locale) {
        (Sport::Running, Variant::Outdoor, Zh) => "户外跑",
        (Sport::Running, Variant::Outdoor, En) => "Outdoor run",
        (Sport::Running, Variant::Outdoor, Es) => "Carrera al aire libre",
        (Sport::Running, Variant::Treadmill, Zh) => "跑步机",
        (Sport::Running, Variant::Treadmill, En) => "Treadmill",
        (Sport::Running, Variant::Treadmill, Es) => "Cinta de correr",
        (Sport::Running, Variant::Track, Zh) => "操场跑步",
        (Sport::Running, Variant::Track, En) => "Track run",
        (Sport::Running, Variant::Track, Es) => "Pista",
        (Sport::Cycling, Variant::Outdoor, Zh) => "户外骑行",
        (Sport::Cycling, Variant::Outdoor, En) => "Outdoor cycling",
        (Sport::Cycling, Variant::Outdoor, Es) => "Ciclismo al aire libre",
        (Sport::Cycling, Variant::Indoor, Zh) => "室内骑行",
        (Sport::Cycling, Variant::Indoor, En) => "Indoor cycling",
        (Sport::Cycling, Variant::Indoor, Es) => "Ciclismo en interior",
        _ => return None,
    })
}

/// 手表上的描述：第一行「目的 · 子类型」（缺哪个就省哪个），第二行起是要点。
/// 账本里 2026-10 之前的训练没有目的和子类型，就只有要点。
pub fn watch_description(workout: &Workout, locale: WatchLocale) -> Option<String> {
    let variant = workout
        .variant
        .and_then(|variant| variant_label(workout.sport, variant, locale));
    let head = match (workout.focus.as_deref(), variant) {
        (Some(focus), Some(variant)) => Some(format!("{focus} · {variant}")),
        (Some(focus), None) => Some(focus.to_string()),
        (None, Some(variant)) => Some(variant.to_string()),
        (None, None) => None,
    };
    match (head, workout.description.as_deref()) {
        (Some(head), Some(body)) => Some(format!("{head}\n{body}")),
        (Some(head), None) => Some(head),
        (None, Some(body)) => Some(body.to_string()),
        (None, None) => None,
    }
}

/// 配速（每公里秒数）→ 速度（米/秒），保留两位小数。R3、R4 实测：`PACE_LAP` 的值是
/// 速度，3.03–3.33 显示 5'00"–5'30"/公里。
pub fn pace_to_speed(seconds_per_km: u16) -> f64 {
    (1000.0 / f64::from(seconds_per_km.max(1)) * 100.0).round() / 100.0
}

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
pub fn window_body(window: Window, workouts: &[NumberedWorkout], locale: WatchLocale) -> Value {
    let mut inside: Vec<&NumberedWorkout> = workouts
        .iter()
        .filter(|item| window.contains(item.workout.date))
        .collect();
    inside.sort_by_key(|item| (item.workout.date, item.id));
    json!({
        "startDate": window.start.to_string(),
        "endDate": window.end().to_string(),
        "workouts": inside
            .into_iter()
            .map(|item| workout_json(item, locale))
            .collect::<Vec<_>>(),
    })
}

/// 清空一个**未来**窗口用的报文：窗口照常写，`workouts` 里只放一条日期在窗口前一天的
/// 占位训练。
///
/// ⚠️ 这依赖服务端的**未定义行为**：官方文档把训练日期落在 `startDate`–`endDate`
/// 之外列为非法请求，只是服务端目前不校验、照样按窗口整体替换（2026-10-06 R5 实测：
/// 窗内训练被清空，随后重推前一个窗口把占位覆盖掉，最终没有残留）。不能对未来窗口
/// 直接发 `[]`——空数组永远只清「今天起 7 天」。官方给出正规做法后只改这一处；问题
/// 已记在桌面《Zepp训练计划接口问题反馈.md》第 7 条。
///
/// 发完它**必须立刻重推前一个窗口**（占位落在那里），由 `storage::training_plan`
/// 保证顺序。`placeholder_id` 不能和真实训练撞号。
pub fn clear_future_window(window: Window, placeholder_id: i64) -> Value {
    let date = window.start - chrono::Duration::days(1);
    json!({
        "startDate": window.start.to_string(),
        "endDate": window.end().to_string(),
        "workouts": [{
            "workoutId": placeholder_id,
            "workoutDate": date.to_string(),
            "sport": "RUNNING",
            "workoutName": "ZeppBridge",
            "steps": [{
                "type": "WorkoutStep",
                "stepOrder": 1,
                "intensity": "ACTIVE",
                "durationType": "TIME",
                "durationValue": 600,
                "targetType": "OPEN",
                "targetValueLow": 0,
                "targetValueHigh": 0,
            }],
        }],
    })
}

fn workout_json(item: &NumberedWorkout, locale: WatchLocale) -> Value {
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
    if let Some(description) = watch_description(workout, locale) {
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
        // 文档写「秒」，R3 实测是米：1000 显示「1.00 公里」。
        StepLength::Distance { meters } => ("DISTANCE", meters),
    };
    let (target_type, low, high) = match step.target {
        // R3 实测：low = high = 0 显示为没有目标。
        Target::Open => ("OPEN", json!(0), json!(0)),
        Target::HeartRate { low, high } => ("HEART_RATE_LAP", json!(low), json!(high)),
        Target::Power { low, high } => ("POWER_LAP", json!(low), json!(high)),
        // 速度（米/秒）：慢配速是低速，按正序发（服务端写反也会纠正，但不依赖它）。
        Target::Pace { fast, slow } => (
            "PACE_LAP",
            json!(pace_to_speed(slow)),
            json!(pace_to_speed(fast)),
        ),
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
