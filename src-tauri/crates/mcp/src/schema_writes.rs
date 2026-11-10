//! 3.1.2 加的写工具和两个动作的声明。和 `docs/reference/cli-and-mcp*.md` 的工具表、
//! `guide.md` 一一对应（测试守着）。

use super::*;

const UNDO: &str = "每次写入都记进改动账本，用户在 ZeppBridge「设置 → 本地 AI → AI 最近的改动」里能逐条撤销。没有删除。";

fn writer() -> Value {
    json!({ "readOnlyHint": false, "destructiveHint": false, "idempotentHint": false, "openWorldHint": false })
}

fn id_field(what: &str) -> Value {
    json!({ "type": "integer", "minimum": 1, "description": format!("要修改的那条{what}的 id（get_athlete_profile 里有）。新建时不传。修改时只传要改的字段，其余沿用现在的值。") })
}

fn date(description: &str) -> Value {
    json!({ "type": ["string", "null"], "format": "date", "description": description })
}

pub(super) fn write_tool_definitions() -> Vec<Value> {
    let mut tools = vec![
        json!({
            "name": "save_injury",
            "description": format!(
                "新增或修改一条伤病（履历）。好了就把 endDate 填成好的那天，不要删。部位用身体部位代码\
                 （knee_l、knee_r、calf_l、lower_back……左右分开），severity 1 轻 / 2 中 / 3 重（影响训练）。\
                 用户亲口说的伤病才记，不要从数据里推断。{UNDO}"
            ),
            "inputSchema": {
                "type": "object",
                "properties": {
                    "id": id_field("伤病"),
                    "title": { "type": "string", "maxLength": 120 },
                    "bodyPart": { "type": ["string", "null"] },
                    "severity": { "type": ["integer", "null"], "minimum": 1, "maximum": 3 },
                    "startDate": date("开始的本地日 YYYY-MM-DD。"),
                    "endDate": date("好了的本地日；还没好为 null。"),
                    "notes": { "type": "string", "maxLength": 2000 }
                },
                "additionalProperties": false
            },
            "annotations": writer()
        }),
        json!({
            "name": "save_life_event",
            "description": format!(
                "新增或修改一条生活事件（出差、生病、搬家、备赛期……），图表和交给 AI 的上下文里会标出来。\
                 category 只能是 health / travel / routine / training / other；epoch=true 表示这是一段起了名的日子（纪元）。\
                 endDate 为 null 表示还在持续，单日事件 endDate 与 startDate 相同。{UNDO}"
            ),
            "inputSchema": {
                "type": "object",
                "properties": {
                    "id": id_field("生活事件"),
                    "title": { "type": "string", "maxLength": 120 },
                    "category": { "type": "string", "enum": ["health", "travel", "routine", "training", "other"] },
                    "startDate": date("开始的本地日 YYYY-MM-DD。"),
                    "endDate": date("结束的本地日；还在持续为 null。"),
                    "notes": { "type": "string", "maxLength": 4000 },
                    "epoch": { "type": "boolean" }
                },
                "additionalProperties": false
            },
            "annotations": writer()
        }),
        json!({
            "name": "save_race",
            "description": format!(
                "新增或修改一场比赛：报了名的（日期、距离、目标）或跑完的（填 resultSeconds 进奖牌墙）。\
                 sport 是 running / trail / cycling / swimming / triathlon / other；priority 是 a（主要目标）/ b / c（练兵）。\
                 距离用米，时间用秒。成绩以官方成绩为准，不要从运动记录里猜。{UNDO}"
            ),
            "inputSchema": {
                "type": "object",
                "properties": {
                    "id": id_field("比赛"),
                    "name": { "type": "string" },
                    "raceDate": date("比赛的本地日 YYYY-MM-DD。"),
                    "sport": { "type": "string", "enum": ["running", "trail", "cycling", "swimming", "triathlon", "other"] },
                    "distanceM": { "type": ["number", "null"], "description": "米。" },
                    "goalSeconds": { "type": ["integer", "null"], "description": "目标用时，秒。" },
                    "priority": { "type": "string", "enum": ["a", "b", "c"] },
                    "resultSeconds": { "type": ["integer", "null"], "description": "官方成绩，秒。" },
                    "workoutId": { "type": ["string", "null"], "description": "认作这场比赛的那次运动。" },
                    "notes": { "type": "string" }
                },
                "additionalProperties": false
            },
            "annotations": writer()
        }),
        json!({
            "name": "save_shoe",
            "description": format!(
                "新增或修改一双鞋。sport 是 running / trail / walking / hiking；retireKm 是退役提醒里程（默认 700 km），\
                 startKm 是记账前已经穿了多少公里。退役就把 retiredOn 填成那天，不要删。{UNDO}"
            ),
            "inputSchema": {
                "type": "object",
                "properties": {
                    "id": id_field("鞋"),
                    "name": { "type": "string" },
                    "sport": { "type": "string", "enum": ["running", "trail", "walking", "hiking"] },
                    "isDefault": { "type": "boolean", "description": "设为这类运动的默认鞋。" },
                    "startKm": { "type": "number", "minimum": 0, "description": "公里。" },
                    "retireKm": { "type": "number", "description": "公里。" },
                    "startedOn": date("开始穿的本地日 YYYY-MM-DD。"),
                    "retiredOn": date("退役的本地日；还在穿为 null。"),
                    "notes": { "type": "string" }
                },
                "additionalProperties": false
            },
            "annotations": writer()
        }),
        json!({
            "name": "annotate_workout",
            "description": format!(
                "给一次运动记用户自己的感受：主观疲劳 rpe（1–10）和酸痛部位 soreness（身体部位代码数组）。\
                 会整体替换这两项（传 null / [] 就是清掉）；手表记的 RPE 不受影响，鞋的选择也不动。\
                 只记用户告诉你的感受。{UNDO}"
            ),
            "inputSchema": {
                "type": "object",
                "properties": {
                    "workoutId": { "type": "string" },
                    "rpe": { "type": ["integer", "null"], "minimum": 1, "maximum": 10 },
                    "soreness": { "type": ["array", "null"], "items": { "type": "string" }, "maxItems": 20 }
                },
                "required": ["workoutId"],
                "additionalProperties": false
            },
            "annotations": writer()
        }),
        json!({
            "name": "set_workout_type",
            "description": format!(
                "纠正一次运动的类型（例如手表记成跑步、其实是越野跑），和桌面端「改类型」同一条路径，\
                 云端原始记录不变。type 写运动类型代码（run、trail_running、treadmill、walking、hiking……），\
                 null 撤掉纠正、回到手表记的类型。{UNDO}"
            ),
            "inputSchema": {
                "type": "object",
                "properties": {
                    "workoutId": { "type": "string" },
                    "type": { "type": ["string", "null"] }
                },
                "required": ["workoutId", "type"],
                "additionalProperties": false
            },
            "annotations": writer()
        }),
        json!({
            "name": "sync_now",
            "description": "让 ZeppBridge 从 Zepp 云端拉一次新数据（和计划任务里的 zeppbridge-cli sync 同一条路径）。\
                 state：done / running（还在后台跑，稍后用 get_data_health 看）/ deferred（本机在整理数据，不是失败）/\
                 busy（桌面端正在同步）/ not_configured / cloud_error / incomplete / failed。\
                 云端没有新东西是正常的——手表要先把数据传到 Zepp App。别反复触发。不改用户写的记录，不进改动账本。",
            "inputSchema": { "type": "object", "properties": {}, "additionalProperties": false },
            "annotations": { "readOnlyHint": false, "destructiveHint": false, "idempotentHint": true, "openWorldHint": true }
        }),
        json!({
            "name": "export_data",
            "description": format!(
                "把一段日子（最多 366 天）导出成 JSON 文件，写进用户本机 ZeppBridge 数据目录的 exports 文件夹，\
                 返回文件名（相对数据目录）和条数。摘要口径，不含运动轨迹。types 默认 workouts、daily_activity、sleep，\
                 可选 {}。只在用户要一份文件时用；要看数据请直接用读工具。不进改动账本。",
                zeppbridge_core::storage::EXPORT_DATA_TYPES.join("、")
            ),
            "inputSchema": {
                "type": "object",
                "properties": {
                    "startDate": { "type": "string", "format": "date" },
                    "endDate": { "type": "string", "format": "date" },
                    "types": { "type": "array", "items": { "type": "string" } }
                },
                "required": ["startDate", "endDate"],
                "additionalProperties": false
            },
            "annotations": { "readOnlyHint": false, "destructiveHint": false, "idempotentHint": false, "openWorldHint": false }
        }),
    ];
    // 读回来的记录里同样有缺失值：和读工具一样说清楚。
    for tool in &mut tools {
        let text = format!(
            "{} {}",
            tool["description"].as_str().unwrap_or_default(),
            contract::MISSING_VALUE_CONVENTION
        );
        tool["description"] = json!(text);
    }
    tools
}
