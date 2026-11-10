//! 本地 AI 的写工具（3.1.2）：履历（伤病、生活事件、比赛、跑鞋）的新增和修改、运动感受与改类型。
//!
//! 规矩（`guide.md` 里也写给 AI 看）：
//!
//! - 只写本机库，校验全靠桌面端同一套 save 函数，MCP 不另写一套；
//! - 每次写入记进改动账本 `mcp_writes`，用户在 ZeppBridge「设置 → 本地 AI → AI 最近的改动」里逐条撤销；
//! - **没有删除**：「好了」「退役」用字段表达（伤病 `endDate`、跑鞋 `retiredOn`）；
//! - 改已有的一条时只传要改的字段，其余沿用现在的值；
//! - task 范围里整体拒绝（`whole_library`）。

use super::*;
use zeppbridge_core::storage::mcp_writes::McpChange;
use zeppbridge_core::training_plan::standalone;

/// 写工具的名字。`build_request` 把它们都标成 `whole_library`。
pub(super) const WRITE_TOOLS: [&str; 6] = [
    "save_injury",
    "save_life_event",
    "save_race",
    "save_shoe",
    "annotate_workout",
    "set_workout_type",
];

const UNDO_NOTE: &str = "写进了本机库，并记进了改动账本：用户可以在 ZeppBridge「设置 → 本地 AI → AI 最近的改动」里撤销这一次。你这边没有删除工具。";

/// 参数名（camelCase）→ 存储结构里的键。
type FieldMap = &'static [(&'static str, &'static str)];

const INJURY_FIELDS: FieldMap = &[
    ("title", "title"),
    ("bodyPart", "body_part"),
    ("severity", "severity"),
    ("startDate", "start_date"),
    ("endDate", "end_date"),
    ("notes", "notes"),
];
const LIFE_EVENT_FIELDS: FieldMap = &[
    ("title", "title"),
    ("category", "category"),
    ("startDate", "startDate"),
    ("endDate", "endDate"),
    ("notes", "notes"),
    ("epoch", "epoch"),
];
const RACE_FIELDS: FieldMap = &[
    ("name", "name"),
    ("raceDate", "race_date"),
    ("sport", "sport"),
    ("distanceM", "distance_m"),
    ("goalSeconds", "goal_seconds"),
    ("priority", "priority"),
    ("resultSeconds", "result_seconds"),
    ("workoutId", "workout_id"),
    ("notes", "notes"),
];
const SHOE_FIELDS: FieldMap = &[
    ("name", "name"),
    ("sport", "sport"),
    ("isDefault", "is_default"),
    ("startKm", "start_km"),
    ("retireKm", "retire_km"),
    ("startedOn", "started_on"),
    ("retiredOn", "retired_on"),
    ("notes", "notes"),
];

fn invalid(message: impl Into<String>) -> zeppbridge_core::models::ZeppBridgeError {
    zeppbridge_core::models::ZeppBridgeError::ConfigError(message.into())
}

/// 把参数叠到一份底稿上（新建时是默认值，修改时是现在的样子），再交给存储结构反序列化。
fn overlay(mut base: Value, args: &Value, fields: FieldMap) -> Value {
    for (arg, key) in fields {
        if let Some(value) = args.get(*arg) {
            base[*key] = value.clone();
        }
    }
    base
}

fn record_id(args: &Value) -> Result<Option<i64>, CallFailure> {
    match args.get("id") {
        None | Some(Value::Null) => Ok(None),
        Some(value) => value
            .as_i64()
            .filter(|id| *id > 0)
            .map(Some)
            .ok_or_else(|| CallFailure::plain("id 要是正整数（新建时不传）")),
    }
}

/// 这个 crate 不直接依赖 serde，泛型约束里写不出 `Deserialize` / `Serialize`，所以用宏。
macro_rules! parse {
    ($value:expr, $what:expr) => {
        serde_json::from_value($value)
            .map_err(|error| invalid(format!("{}的字段不对：{error}", $what)))
    };
}

macro_rules! to_json {
    ($value:expr) => {
        serde_json::to_value($value).map_err(|error| invalid(error.to_string()))
    };
}

fn dir(db: &Database) -> Result<std::path::PathBuf, CallFailure> {
    db.data_dir()
        .ok_or_else(|| CallFailure::plain("找不到本机数据目录，无法写入。"))
}

fn db_failure(error: zeppbridge_core::models::ZeppBridgeError) -> CallFailure {
    CallFailure::coded(error.code(), error.user_message())
}

/// 履历四本账的公共流程：底稿 → 叠参数 → 存 → 记账。
fn save_book(
    db: &Database,
    tool: &'static str,
    args: &Value,
    fields: FieldMap,
    defaults: Value,
    current: impl Fn(&Database, i64) -> zeppbridge_core::models::error::Result<Option<Value>>,
    build: impl Fn(Value) -> zeppbridge_core::models::error::Result<McpChange>,
) -> Result<Value, CallFailure> {
    let id = record_id(args)?;
    let client = protocol::client_name();
    let applied = standalone::write_once(&dir(db)?, |db| {
        let base = match id {
            Some(id) => {
                let mut base = current(db, id)?
                    .ok_or_else(|| invalid(format!("找不到 id 为 {id} 的这条记录")))?;
                base["id"] = json!(id);
                base
            }
            None => defaults.clone(),
        };
        let change = build(overlay(base, args, fields))?;
        db.apply_mcp_change(tool, change, client.as_deref())
    })
    .map_err(db_failure)?;
    Ok(json!({
        "applied": applied,
        "note": UNDO_NOTE,
        "missingValues": contract::MISSING_VALUE_CONVENTION,
    }))
}

pub(super) fn run_write(db: &Database, name: &str, args: &Value) -> Result<Value, CallFailure> {
    match name {
        "save_injury" => save_book(
            db,
            "save_injury",
            args,
            INJURY_FIELDS,
            json!({ "id": null, "notes": "" }),
            |db, id| {
                db.list_injuries()?
                    .into_iter()
                    .find(|row| row.input.id == Some(id))
                    .map(|row| to_json!(&row.input))
                    .transpose()
            },
            |value| Ok(McpChange::Injury(parse!(value, "伤病")?)),
        ),
        "save_life_event" => save_book(
            db,
            "save_life_event",
            args,
            LIFE_EVENT_FIELDS,
            json!({ "id": null, "notes": "", "endDate": null, "epoch": false }),
            |db, id| {
                db.list_life_events(None, None)?
                    .into_iter()
                    .find(|row| row.input.id == Some(id))
                    .map(|row| to_json!(&row.input))
                    .transpose()
            },
            |value| Ok(McpChange::LifeEvent(parse!(value, "生活事件")?)),
        ),
        "save_race" => save_book(
            db,
            "save_race",
            args,
            RACE_FIELDS,
            json!({ "id": null, "notes": "", "priority": "b" }),
            |db, id| {
                db.list_races()?
                    .into_iter()
                    .find(|row| row.input.id == Some(id))
                    .map(|row| to_json!(&row.input))
                    .transpose()
            },
            |value| Ok(McpChange::Race(parse!(value, "比赛")?)),
        ),
        "save_shoe" => save_book(
            db,
            "save_shoe",
            args,
            SHOE_FIELDS,
            json!({
                "id": null, "notes": "", "is_default": false, "start_km": 0.0,
                "retire_km": zeppbridge_core::storage::logbook::shoes::DEFAULT_RETIRE_KM,
            }),
            |db, id| {
                db.list_shoe_rows()?
                    .into_iter()
                    .find(|row| row.input.id == Some(id))
                    .map(|row| to_json!(&row.input))
                    .transpose()
            },
            |value| Ok(McpChange::Shoe(parse!(value, "跑鞋")?)),
        ),
        "annotate_workout" => {
            let workout_id = workout_arg(args)?;
            let rpe = match args.get("rpe") {
                None | Some(Value::Null) => None,
                Some(value) => Some(
                    value
                        .as_u64()
                        .filter(|rpe| (1..=10).contains(rpe))
                        .ok_or_else(|| CallFailure::plain("rpe 要是 1–10 的整数，或 null 清掉"))?
                        as u8,
                ),
            };
            let soreness: Vec<String> = match args.get("soreness") {
                None | Some(Value::Null) => Vec::new(),
                Some(Value::Array(items)) => items
                    .iter()
                    .map(|item| item.as_str().map(str::to_string))
                    .collect::<Option<_>>()
                    .ok_or_else(|| CallFailure::plain("soreness 是身体部位代码的数组"))?,
                Some(_) => return Err(CallFailure::plain("soreness 是身体部位代码的数组")),
            };
            write_change(
                db,
                "annotate_workout",
                McpChange::WorkoutFeel {
                    workout_id,
                    rpe,
                    soreness,
                },
            )
        }
        "set_workout_type" => {
            let workout_id = workout_arg(args)?;
            let workout_type = match args.get("type") {
                Some(Value::String(kind)) if !kind.trim().is_empty() => Some(kind.clone()),
                Some(Value::Null) => None,
                _ => return Err(CallFailure::plain(
                    "type 要写运动类型代码（例如 run、trail_running、treadmill），或 null 撤掉纠正",
                )),
            };
            write_change(
                db,
                "set_workout_type",
                McpChange::WorkoutType {
                    workout_id,
                    workout_type,
                },
            )
        }
        other => Err(CallFailure::plain(format!("没有名为 {other} 的工具。"))),
    }
}

fn workout_arg(args: &Value) -> Result<String, CallFailure> {
    args.get("workoutId")
        .and_then(Value::as_str)
        .filter(|id| !id.trim().is_empty())
        .map(str::to_string)
        .ok_or_else(|| CallFailure::plain("缺少 workoutId"))
}

fn write_change(db: &Database, tool: &str, change: McpChange) -> Result<Value, CallFailure> {
    let client = protocol::client_name();
    let applied = standalone::write_once(&dir(db)?, |db| {
        db.apply_mcp_change(tool, change, client.as_deref())
    })
    .map_err(db_failure)?;
    Ok(json!({
        "applied": applied,
        "note": UNDO_NOTE,
        "missingValues": contract::MISSING_VALUE_CONVENTION,
    }))
}

/// 教练档案：3.1.2 起直接记住（不再进收件箱），同样记账、可撤销。
pub(super) fn run_remember_note(db: &Database, args: &Value) -> Result<Value, CallFailure> {
    let text = args
        .get("note")
        .and_then(Value::as_str)
        .ok_or_else(|| CallFailure::plain("缺少 note"))?
        .to_string();
    let client = protocol::client_name();
    let applied = standalone::write_once(&dir(db)?, |db| {
        db.apply_mcp_change(
            "propose_coach_note",
            McpChange::CoachNote(text),
            client.as_deref(),
        )
    })
    .map_err(db_failure)?;
    let next = match applied.note {
        Some(zeppbridge_core::storage::coach_notes::Remembered::Remembered { .. }) => {
            "已经记住：get_athlete_profile 的 coachNotes 里马上就有。用户可以在 ZeppBridge 里撤销或改写。"
        }
        Some(zeppbridge_core::storage::coach_notes::Remembered::AlreadyKnown { .. }) => {
            "用户已经记着这句话了，不用再写。"
        }
        _ => "用户之前拒绝或撤销过这句话。不要再写，也不要换个说法再写。",
    };
    Ok(json!({
        "applied": applied,
        "next": next,
        "missingValues": contract::MISSING_VALUE_CONVENTION,
    }))
}
