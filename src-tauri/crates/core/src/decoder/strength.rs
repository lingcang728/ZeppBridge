//! 力量训练（Zepp `type = 52`）的 125 项标准动作字典、62 列 `lap` 逐组解码与汇总聚合。
//!
//! 只产出稳定英文码与数值，不拼任何自然语言文案（前端按 `exercise_key` / `muscle_group`
//! 取当前界面语言，表外编号如 `1030` 返回 `(None, None)` 由前端诚实显示 `#1030`）。
//! 单组间休息时长与五维动作质量分因原始报文缺乏逐组休息字段或维度顺序未证实，一律不编造。

use crate::models::{StrengthExerciseGroup, StrengthSetRow, StrengthWorkoutDetail};
use serde::{Deserialize, Serialize};
use serde_json::Value;

/// 国际磅转千克精确系数。
pub const LB_TO_KG: f64 = 0.45359237;

/// 九大肌群稳定键白名单（测试据此守住字典与前端多语言表一一对齐）。
pub const STRENGTH_MUSCLE_GROUPS: [&str; 9] = [
    "chest",
    "back",
    "shoulders",
    "biceps",
    "triceps",
    "forearms",
    "core",
    "glutes",
    "legs",
];

/// Zepp `/sport/config/muscle` 全部 125 项标准动作编号（0..=130，含 6 个空号缺口）
/// 到 `(exercise_key, muscle_group)` 的静态表，按 `action_code` 严格升序排列以便二分查找。
pub const STRENGTH_ACTION_CATALOG: [(i32, &str, Option<&str>); 125] = [
    (0, "free_exercise", None),
    (1, "bodyweight_squats", Some("legs")),
    (2, "straight_arm_front_squats", Some("legs")),
    (3, "barbell_squats", Some("legs")),
    (4, "triceps_pushdowns", Some("triceps")),
    (5, "bent_over_row", Some("back")),
    (6, "bench_press", Some("chest")),
    (7, "sit_up_holds", Some("core")),
    (8, "knee_touch_sit_ups", Some("core")),
    (9, "dumbbell_flys", Some("chest")),
    (10, "burpee_jumps", Some("legs")),
    (11, "burpees", Some("legs")),
    (12, "overhead_tricep_extensions", Some("triceps")),
    (13, "lying_tricep_extensions", Some("triceps")),
    (14, "lateral_raises", Some("shoulders")),
    (15, "jumping_jacks", Some("legs")),
    (16, "incline_dumbbell_row", Some("back")),
    (17, "bent_over_dumbbell_row", Some("back")),
    (18, "bent_over_barbell_row", Some("back")),
    (19, "single_arm_dumbbell_row_left", Some("back")),
    (20, "single_arm_dumbbell_row_right", Some("back")),
    (21, "dumbbell_supine_triceps_extensions", Some("triceps")),
    (22, "supine_triceps_extensions", Some("triceps")),
    (
        23,
        "dumbbell_single_arm_triceps_extensions_left",
        Some("triceps"),
    ),
    (
        24,
        "seated_bent_over_dumbbell_triceps_extensions",
        Some("triceps"),
    ),
    (25, "seated_triceps_press", Some("triceps")),
    (26, "smith_machine_squats", Some("legs")),
    (30, "dumbbell_bench_press", Some("chest")),
    (32, "smith_machine_bench_press", Some("chest")),
    (
        33,
        "dumbbell_single_arm_triceps_extensions_right",
        Some("triceps"),
    ),
    (34, "incline_dumbbell_flys", Some("chest")),
    (35, "decline_dumbbell_flys", Some("chest")),
    (37, "v_bar_tricep_pushdowns", Some("triceps")),
    (38, "rope_triceps_pushdowns", Some("triceps")),
    (39, "elastic_band_lateral_raise", Some("shoulders")),
    (40, "dumbbell_lateral_raise", Some("shoulders")),
    (41, "dumbbell_front_raise", Some("shoulders")),
    (42, "pectoral_muscles", Some("chest")),
    (43, "rectus_abdominis", Some("core")),
    (44, "external_oblique", Some("core")),
    (45, "upper_back_muscles", Some("back")),
    (46, "lower_back_muscles", Some("back")),
    (47, "lateral_back_muscles", Some("back")),
    (48, "shoulder_muscles", Some("shoulders")),
    (49, "neck_muscles", Some("shoulders")),
    (50, "upper_arm_front_muscles", Some("biceps")),
    (51, "upper_arm_back_muscles", Some("triceps")),
    (52, "front_forearm_muscles", Some("forearms")),
    (53, "back_forearm_muscles", Some("forearms")),
    (54, "hip_muscles", Some("glutes")),
    (55, "quadriceps", Some("legs")),
    (56, "hamstrings", Some("legs")),
    (57, "front_calf_muscles", Some("legs")),
    (58, "back_calf_muscles", Some("legs")),
    (60, "lat_pulldowns", Some("back")),
    (61, "deadlift", Some("legs")),
    (62, "push_up", Some("chest")),
    (63, "shoulder_press", Some("shoulders")),
    (64, "pull_up", Some("back")),
    (65, "biceps_curl", Some("biceps")),
    (66, "seated_cable_row", Some("back")),
    (67, "upright_row", Some("shoulders")),
    (68, "straight_arm_pulldown", Some("back")),
    (69, "russian_twist", Some("core")),
    (70, "barbell_deadlift", Some("legs")),
    (71, "assisted_push_up", Some("chest")),
    (72, "dumbbell_push_press", Some("shoulders")),
    (73, "dumbbell_upright_row", Some("shoulders")),
    (74, "neck_pulldown", Some("back")),
    (75, "chin_up", Some("back")),
    (76, "dumbbell_biceps_curl", Some("biceps")),
    (77, "t_bar_row", Some("back")),
    (78, "kettlebell_deadlift", Some("legs")),
    (79, "kneeling_push_up", Some("chest")),
    (80, "rotational_dumbbell_push_press", Some("shoulders")),
    (81, "incline_barbell_upright_row", Some("shoulders")),
    (82, "rope_straight_arm_pulldown", Some("back")),
    (83, "standard_pull_up", Some("back")),
    (84, "hammer_curl_to_press", Some("biceps")),
    (85, "seated_row_machine", Some("back")),
    (86, "chest_flyes", Some("chest")),
    (87, "single_arm_kettlebell_swing_right", Some("back")),
    (88, "barbell_push_press", Some("shoulders")),
    (89, "dumbbell_compound_push_press", Some("shoulders")),
    (90, "barbell_biceps_curl", Some("biceps")),
    (91, "single_arm_kettlebell_swing_left", Some("back")),
    (92, "v_grip_cable_row", Some("back")),
    (93, "dumbbell_front_raise_left", Some("shoulders")),
    (94, "dumbbell_front_raise_right", Some("shoulders")),
    (95, "bent_over_lateral_raise", Some("shoulders")),
    (96, "front_raise", Some("shoulders")),
    (97, "plank", Some("core")),
    (98, "barbell_hip_thrust", Some("glutes")),
    (99, "barbell_snatch", Some("legs")),
    (100, "standing_calf_raise", Some("legs")),
    (101, "barbell_shrug", Some("back")),
    (102, "dumbbell_shrug", Some("back")),
    (103, "farmers_walk_lunge", Some("legs")),
    (104, "v_up", Some("core")),
    (105, "lateral_slide", Some("legs")),
    (106, "battle_rope", Some("shoulders")),
    (107, "kettlebell_swing", Some("glutes")),
    (108, "walking_recovery", None),
    (109, "incline_dumbbell_bench_press", Some("chest")),
    (110, "incline_barbell_bench_press", Some("chest")),
    (111, "decline_dumbbell_bench_press", Some("chest")),
    (112, "decline_barbell_bench_press", Some("chest")),
    (113, "pec_deck_fly", Some("chest")),
    (114, "reverse_pec_deck_fly", Some("shoulders")),
    (115, "trx_triceps_press", Some("triceps")),
    (116, "trx_reverse_flys", Some("shoulders")),
    (117, "three_point_chest_push", Some("chest")),
    (118, "incline_cable_flys", Some("chest")),
    (119, "incline_cable_chest_press", Some("chest")),
    (120, "low_cable_crossover", Some("chest")),
    (121, "cable_crossover", Some("chest")),
    (122, "reverse_grip_triceps_pushdown", Some("triceps")),
    (123, "cable_crunch", Some("core")),
    (124, "smith_machine_incline_bench_press", Some("chest")),
    (125, "smith_machine_decline_bench_press", Some("chest")),
    (126, "chest_press_machine", Some("chest")),
    (127, "leverage_incline_chest_press", Some("chest")),
    (128, "leverage_decline_chest_press", Some("chest")),
    (129, "leverage_chest_press", Some("chest")),
    (130, "machine_shoulder_press", Some("shoulders")),
];

/// 按 `actionType` 查标准动作与主肌群。表外编号（如新固件扩展码 `1030`）返回 `(None, None)`。
pub fn resolve_strength_action(action_code: i32) -> (Option<&'static str>, Option<&'static str>) {
    match STRENGTH_ACTION_CATALOG.binary_search_by_key(&action_code, |&(code, _, _)| code) {
        Ok(idx) => {
            let (_, key, muscle) = STRENGTH_ACTION_CATALOG[idx];
            (Some(key), muscle)
        }
        Err(_) => (None, None),
    }
}

/// 汇总流 `strength_training_group` 里一条记录的落库形态。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct StoredStrengthGroupEntry {
    pub action_code: i32,
    pub reps: i32,
}

/// 从 `workouts`（history）流一条记录里提出来的力量汇总。
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct HistoryStrengthSummary {
    pub total_sets: Option<i32>,
    pub total_reps: Option<i32>,
    pub rest_seconds: Option<i64>,
    pub groups_json: Option<String>,
}

/// 判断 detail 对象里的 `lap` 是否为力量训练逐组结构，并解析成 `StrengthSetRow`。
///
/// 跑步/骑行等计圈在 `col[2]` 填距离、`col[5]` 填递增累计秒数；
/// 力量训练每行 62 列（至少要读到 `col[28]`），`col[2] == 0`、`col[5] == 0`、
/// `col[21]` 重量、`col[22]` 次数、`col[23]` 单位（0 = kg、1 = lb）、`col[28]` 动作编号、
/// `col[43]` 毫秒时长（列含义见 #163）。
///
/// 结构判断（列数、距离与累计秒为 0）是整份的：有一行不像力量训练，就当它是跑步分圈，整份不要。
/// 报文自带力量训练标记（`strengthAssess` / `strengthSets` / `type == 52`）时不再看距离和累计秒。
/// 内容是逐行宽容的：自重动作的重量、单位写 `-1`，计时动作的次数写 `-1`，都只让那一格为空；
/// 动作编号、次数、重量都没有的行（组间休息）跳过，不算一组。
pub fn parse_strength_sets(data: &serde_json::Map<String, Value>) -> Vec<StrengthSetRow> {
    let Some(text) = data.get("lap").and_then(Value::as_str).map(str::trim) else {
        return Vec::new();
    };
    if text.is_empty() {
        return Vec::new();
    }
    let has_strength_envelope = non_empty_strength_marker(data.get("strengthAssess"))
        || non_empty_strength_marker(data.get("strengthSets"))
        || data
            .get("type")
            .and_then(Value::as_i64)
            .is_some_and(|code| code == 52);

    let mut sets = Vec::new();
    let mut saw_positive_signal = has_strength_envelope;
    let mut unit_codes = std::collections::BTreeSet::new();
    let mut weight_out_of_range = 0usize;
    // 带力量训练标记却一组都解析不出来时记一条原因，便于按诊断日志定位新的报文形状。
    // 只记原因、行号和列数，不记重量、次数等数值。
    let reject = |reason: &str, row: usize, columns: usize| -> Vec<StrengthSetRow> {
        if has_strength_envelope {
            tracing::warn!("力量训练逐组数据未解析：{reason}（第 {row} 行，{columns} 列）");
        }
        Vec::new()
    };
    let int = |cols: &[&str], at: usize| cols.get(at).and_then(|v| v.trim().parse::<i64>().ok());
    let float = |cols: &[&str], at: usize| {
        cols.get(at)
            .and_then(|v| v.trim().parse::<f64>().ok())
            .filter(|v| v.is_finite())
    };

    for (position, row) in text
        .split(';')
        .filter(|row| !row.trim().is_empty())
        .enumerate()
    {
        let cols: Vec<&str> = row.split(',').collect();
        if cols.len() < 29 {
            return reject("列数不足", position, cols.len());
        }
        if int(&cols, 0).is_none() {
            return reject("行号不是数字", position, cols.len());
        }
        if !has_strength_envelope {
            let distance_m = float(&cols, 2);
            let elapsed = int(&cols, 5);
            if distance_m.is_none_or(|d| d.abs() > 1e-6) || elapsed != Some(0) {
                return reject("距离或累计时间非零", position, cols.len());
            }
        }

        let action_code = int(&cols, 28)
            .filter(|code| (0..=100_000).contains(code))
            .map(|code| code as i32);
        let reps = int(&cols, 22)
            .filter(|reps| (0..=10_000).contains(reps))
            .map(|reps| reps as i32);
        let raw_unit = int(&cols, 23);
        let unit_code = raw_unit.filter(|unit| matches!(unit, 0 | 1));
        // 重量只看 col[21] 本身：自重动作写 -1 自然为空。单位格不是 0 / 1 时
        // （有的表款写 -1）按 kg 记，不再连重量一起丢掉——以前这样整场每组都没有重量。
        let weight_cell = float(&cols, 21);
        let weight_raw = weight_cell.filter(|w| *w > 0.0 && *w <= 2_000.0);
        if weight_cell.is_some_and(|w| w > 2_000.0) {
            weight_out_of_range += 1;
        }
        if let Some(unit) = raw_unit {
            unit_codes.insert(unit);
        }
        let ms_raw = int(&cols, 43).unwrap_or(-1);
        let sec_int = int(&cols, 1).unwrap_or(-1);

        // 组间休息：没有动作、没有次数、没有重量。不算一组。
        if action_code.is_none() && reps.unwrap_or(0) == 0 && weight_raw.is_none() {
            continue;
        }
        let action_code = action_code.unwrap_or(-1);
        let reps = reps.unwrap_or(0);
        if action_code > 0 || reps > 0 || weight_raw.is_some() || unit_code == Some(1) || ms_raw > 0
        {
            saw_positive_signal = true;
        }

        let weight_unit = if unit_code == Some(1) { "lb" } else { "kg" }.to_string();
        let (weight_value, weight_kg) = match weight_raw {
            Some(raw) => {
                let kg = if unit_code == Some(1) {
                    round3(raw * LB_TO_KG)
                } else {
                    round3(raw)
                };
                (Some(round2(raw)), Some(kg))
            }
            None => (None, None),
        };

        let duration_ms = if ms_raw > 0 && ms_raw <= 3_600_000 {
            Some(ms_raw)
        } else if sec_int > 0 && sec_int <= 3_600 {
            Some(sec_int * 1000)
        } else {
            None
        };

        let avg_hr = int(&cols, 4)
            .filter(|hr| (1..=250).contains(hr))
            .map(|hr| hr as i32);
        let calories_kcal = float(&cols, 15)
            .filter(|val| *val >= 0.0 && *val <= 5_000.0)
            .map(round2);

        let (exercise_key, muscle_group) = resolve_strength_action(action_code);
        sets.push(StrengthSetRow {
            set_index: sets.len() as i32 + 1,
            action_code,
            exercise_key: exercise_key.map(str::to_string),
            muscle_group: muscle_group.map(str::to_string),
            reps,
            weight_value,
            weight_unit,
            weight_kg,
            duration_ms,
            avg_hr,
            calories_kcal,
            exercise_name: None,
            secondary_muscle_groups: Vec::new(),
        });
    }

    if sets.is_empty() && has_strength_envelope {
        tracing::warn!("力量训练逐组数据未解析：每一行都是空的组间休息");
    }
    // 有组却没有一组带重量：只记单位码和超范围的行数，不记重量本身，便于按日志认出新的报文形状。
    // 纯自重训练单位码全是 -1，不记。
    if sets.iter().any(|set| set.reps > 0)
        && sets.iter().all(|set| set.weight_kg.is_none())
        && (weight_out_of_range > 0 || unit_codes.iter().any(|unit| *unit != -1))
    {
        tracing::info!(
            "力量训练整场没有重量：单位码 {unit_codes:?}，重量列超范围 {weight_out_of_range} 行"
        );
    }
    if saw_positive_signal {
        sets
    } else {
        Vec::new()
    }
}

fn non_empty_strength_marker(value: Option<&Value>) -> bool {
    match value {
        Some(Value::Array(items)) => !items.is_empty(),
        Some(Value::String(text)) => {
            let trimmed = text.trim();
            !trimmed.is_empty() && trimmed != "[]" && trimmed != "null"
        }
        _ => false,
    }
}

/// 解析 history 里的 `strength_training_group`（既支持 JSON 字符串也支持 JSON 数组）。
pub fn parse_history_strength_groups(value: Option<&Value>) -> Vec<StoredStrengthGroupEntry> {
    let parsed_array: Option<Vec<Value>> = match value {
        Some(Value::Array(items)) => Some(items.clone()),
        Some(Value::String(text)) => {
            let trimmed = text.trim();
            if trimmed.is_empty() {
                None
            } else {
                serde_json::from_str::<Vec<Value>>(trimmed).ok()
            }
        }
        _ => None,
    };
    let Some(items) = parsed_array else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for item in items {
        let Some(obj) = item.as_object() else {
            continue;
        };
        let Some(action_code) = obj
            .get("actionType")
            .or_else(|| obj.get("action_type"))
            .and_then(as_i32)
            .filter(|code| (0..=100_000).contains(code))
        else {
            continue;
        };
        let reps = obj
            .get("count")
            .or_else(|| obj.get("reps"))
            .and_then(as_i32)
            .unwrap_or(0)
            .max(0);
        out.push(StoredStrengthGroupEntry { action_code, reps });
    }
    out
}

fn as_i32(value: &Value) -> Option<i32> {
    value
        .as_i64()
        .and_then(|v| i32::try_from(v).ok())
        .or_else(|| {
            value
                .as_f64()
                .filter(|v| v.is_finite())
                .map(|v| v.round() as i32)
        })
        .or_else(|| value.as_str().and_then(|s| s.trim().parse::<i32>().ok()))
}

/// 组装对外返回的 `StrengthWorkoutDetail`。
///
/// 有逐组明细 `sets` 时以明细为权威来源计算总组数、总次数、总容量与按动作聚合；
/// 尚未拉取到 `detail` 时退化使用 `workouts` 表里的汇总流字段，不编造重量或单组时长。
pub fn build_strength_workout_detail(
    sets: Vec<StrengthSetRow>,
    is_strength_workout: bool,
    history_total_sets: Option<i32>,
    history_total_reps: Option<i32>,
    rest_seconds: Option<i64>,
    history_groups_json: Option<&str>,
) -> Option<StrengthWorkoutDetail> {
    if !sets.is_empty() {
        let total_sets = sets.len() as i32;
        let total_reps: i32 = sets.iter().map(|s| s.reps.max(0)).sum();
        let mut volume_sum = 0.0f64;
        let mut has_weighted = false;
        for set in &sets {
            if set.reps > 0 {
                if let Some(kg) = set.weight_kg.filter(|kg| *kg > 0.0) {
                    volume_sum += (set.reps as f64) * kg;
                    has_weighted = true;
                }
            }
        }
        let exercise_groups = aggregate_groups(sets.iter().map(|s| (s.action_code, s.reps)));
        return Some(StrengthWorkoutDetail {
            total_sets,
            total_reps,
            total_volume_kg: has_weighted.then(|| round2(volume_sum)),
            rest_seconds: rest_seconds.filter(|s| *s >= 0),
            sets,
            exercise_groups,
        });
    }

    if !is_strength_workout {
        return None;
    }

    let stored_groups: Vec<StoredStrengthGroupEntry> = history_groups_json
        .and_then(|raw| serde_json::from_str(raw).ok())
        .unwrap_or_default();
    let exercise_groups = aggregate_groups(stored_groups.iter().map(|g| (g.action_code, g.reps)));
    let derived_sets = (!stored_groups.is_empty()).then_some(stored_groups.len() as i32);
    let derived_reps =
        (!stored_groups.is_empty()).then(|| stored_groups.iter().map(|g| g.reps.max(0)).sum());

    let total_sets = history_total_sets
        .filter(|n| *n > 0)
        .or(derived_sets)
        .unwrap_or(0);
    let total_reps = history_total_reps
        .filter(|n| *n >= 0)
        .or(derived_reps)
        .unwrap_or(0);
    let rest_seconds = rest_seconds.filter(|s| *s >= 0);

    if total_sets == 0 && exercise_groups.is_empty() && rest_seconds.is_none() {
        return None;
    }

    Some(StrengthWorkoutDetail {
        total_sets,
        total_reps,
        total_volume_kg: None,
        rest_seconds,
        sets: Vec::new(),
        exercise_groups,
    })
}

fn aggregate_groups(items: impl IntoIterator<Item = (i32, i32)>) -> Vec<StrengthExerciseGroup> {
    let mut out: Vec<StrengthExerciseGroup> = Vec::new();
    for (action_code, reps) in items {
        if let Some(existing) = out.iter_mut().find(|g| g.action_code == action_code) {
            existing.sets += 1;
            existing.total_reps += reps.max(0);
        } else {
            let (exercise_key, muscle_group) = resolve_strength_action(action_code);
            out.push(StrengthExerciseGroup {
                action_code,
                exercise_key: exercise_key.map(str::to_string),
                muscle_group: muscle_group.map(str::to_string),
                sets: 1,
                total_reps: reps.max(0),
                exercise_name: None,
                secondary_muscle_groups: Vec::new(),
            });
        }
    }
    out
}

fn round2(value: f64) -> f64 {
    (value * 100.0).round() / 100.0
}

fn round3(value: f64) -> f64 {
    (value * 1000.0).round() / 1000.0
}

#[cfg(test)]
#[path = "strength_tests.rs"]
mod tests;
