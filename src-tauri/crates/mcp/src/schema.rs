//! 五个只读工具的声明（名称、说明、参数结构）（从 main.rs 拆出，逻辑不变）。

use super::*;

pub(super) fn tool_definitions() -> Vec<Value> {
    let missing = contract::MISSING_VALUE_CONVENTION;
    let time = contract::TIME_CONVENTION;
    vec![
        json!({
            "name": "list_workouts",
            "description": format!(
                "列出本机已保存的运动记录，最新在前。距离单位米，时长由起止时间给出，心率单位 bpm。{missing}"
            ),
            "inputSchema": {
                "type": "object",
                "properties": {
                    "limit": {
                        "type": "integer",
                        "minimum": 1,
                        "maximum": 200,
                        "default": 20,
                        "description": "返回多少条，最多 200。"
                    }
                },
                "additionalProperties": false
            }
        }),
        json!({
            "name": "get_workout_insight",
            "description": format!(
                "对一次运动给出确定性事实：与个人基线的比较、基线窗口、样本数和置信度。\
                 只返回事实与证据，不生成任何自然语言结论。基线样本不足时返回 facts 为空并说明原因，\
                 不会为了凑一句话而降低门槛。{missing}"
            ),
            "inputSchema": {
                "type": "object",
                "properties": {
                    "workoutId": { "type": "string", "description": "list_workouts 返回的 workoutId。" }
                },
                "required": ["workoutId"],
                "additionalProperties": false
            }
        }),
        json!({
            "name": "get_metric_series",
            "description": format!(
                "按天取一条或多条指标序列。单位见每个 series 的 unit 字段。{missing} {time}"
            ),
            "inputSchema": {
                "type": "object",
                "properties": {
                    "metrics": {
                        "type": "array",
                        "items": { "type": "string", "enum": contract::metric_names() },
                        "minItems": 1,
                        "description": "指标名。未知指标会被忽略而不是报错。"
                    },
                    "days": {
                        "type": "integer",
                        "minimum": 1,
                        "maximum": 1825,
                        "default": 90,
                        "description": "往回多少天，含今天。"
                    }
                },
                "required": ["metrics"],
                "additionalProperties": false
            }
        }),
        json!({
            "name": "get_sleep_detail",
            "description": format!(
                "取一晚睡眠的明细。分期时长单位分钟；设备没有上报的分期不会出现，也不会补 0。{missing}"
            ),
            "inputSchema": {
                "type": "object",
                "properties": {
                    "sleepId": { "type": "string", "description": "睡眠记录 id。省略则返回最近一晚。" }
                },
                "additionalProperties": false
            }
        }),
        json!({
            "name": "get_data_health",
            "description": format!(
                "本机数据的健康状况：每条流的抓取/解析/写入三个阶段各自的状态、\
                 覆盖情况和最近一次成功时间。用它判断一个问题「查不到」是因为没同步，\
                 还是因为那段时间本来就没数据。\
                 `pending_normalization` 只统计当前解析器尚未处理的报文。\
                 `normalization_by_stream` 按流统计 pending、normalized、\
                 processed_without_output（解析完成但无输出，不保证已识别）和 quarantined（解析失败已隔离）；\
                 后两者不应被当作反复重放就能消除的积压。\
                 `normalizer_replay_pending` 为真时，历史记录需要重放\
                 （`stored_normalizer_revision` 是哪一版，`normalizer_revision` 是当前版）——\
                 此时运动类型、睡眠阶段这类派生字段可能过时，回答里应当说明这一点。\
                 修正的办法是在那台机器上跑一次 `zeppbridge-cli reprocess`，\
                 或者启动一次桌面应用；这个服务只读，做不了。{time} {missing}"
            ),
            "inputSchema": {
                "type": "object",
                "properties": {
                    "windowDays": {
                        "type": "integer",
                        "minimum": 1,
                        "maximum": 365,
                        "default": 30,
                        "description": "用多长的窗口判断覆盖。"
                    }
                },
                "additionalProperties": false
            }
        }),
    ]
}

/* ------------------------------ 工具调用 ------------------------------ */
