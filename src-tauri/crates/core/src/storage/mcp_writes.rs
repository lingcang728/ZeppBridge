//! 本地 AI 的改动账本（v49，3.1.2）。
//!
//! MCP 的写工具（伤病、生活事件、比赛、跑鞋、运动感受、改类型、教练档案）每写一次记一行：
//! 改之前和改之后的快照。桌面端「本地 AI」卡里逐条撤销：
//!
//! - 新增的撤销 = 删掉（教练档案改成「拒绝」，免得 AI 把同一句话再写回来）；
//! - 修改的撤销 = 按改之前的快照走原来的 save 函数写回；
//! - 改类型的撤销走 `undo_workout_edit`（它自己有一本账）；
//! - 现在的值和账上「改之后」对不上（用户或别的 AI 又动过），或者同一条有更新的、还没撤销的改动，
//!   一律不撤，回 [`UndoOutcome::Stale`]。
//!
//! 没有删除工具：AI 只能新增和修改，「结束 / 退役」用字段表达（伤病 `end_date`、跑鞋 `retired_on`）。
//! 同步和导出不进这张表——它们是动作，不改记录。写入照规矩由调用方拿跨进程写锁。

use super::coach_notes::Remembered;
use super::life_events::LifeEventInput;
use super::logbook::annotations::AnnotationInput;
use super::logbook::injuries::InjuryInput;
use super::logbook::races::RaceInput;
use super::logbook::shoes::ShoeInput;
use super::Database;
use crate::models::{error::Result, ZeppBridgeError};
use chrono::Utc;
use rusqlite::{params, OptionalExtension};
use serde::Serialize;
use serde_json::{json, Value};

/// 一次写入要改什么。
#[derive(Debug, Clone)]
pub enum McpChange {
    Injury(InjuryInput),
    LifeEvent(LifeEventInput),
    Race(RaceInput),
    Shoe(ShoeInput),
    /// RPE 和酸痛部位；鞋的选择沿用现有的，不由 AI 改。
    WorkoutFeel {
        workout_id: String,
        rpe: Option<u8>,
        soreness: Vec<String>,
    },
    /// `None` 是撤掉纠正、回到手表记的类型。
    WorkoutType {
        workout_id: String,
        workout_type: Option<String>,
    },
    CoachNote(String),
}

/// 写入的结果。`write_id` 为空表示什么都没写（教练档案已经记着 / 被拒绝过）。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpApplied {
    pub write_id: Option<i64>,
    pub kind: &'static str,
    pub target_id: String,
    /// `created` / `updated` / `unchanged`。
    pub action: &'static str,
    /// 教练档案的结局（其余为空）。
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note: Option<Remembered>,
}

/// 桌面端看到的一行。
#[derive(Debug, Clone, Serialize)]
pub struct McpWrite {
    pub id: i64,
    pub tool: String,
    pub kind: String,
    pub target_id: String,
    pub label: String,
    /// `created` / `updated`。
    pub action: &'static str,
    pub source_name: Option<String>,
    pub created_at: String,
    pub undone_at: Option<String>,
}

/// 撤销的结局。命令层按它换稳定码。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum UndoOutcome {
    Undone,
    /// 之后又被改过，不能照账本撤。
    Stale,
    /// 账上没有这一条，或已经撤过。
    Missing,
}

fn encode<T: Serialize>(value: &T) -> Result<Value> {
    serde_json::to_value(value).map_err(|error| ZeppBridgeError::ParseError(error.to_string()))
}

fn decode<T: serde::de::DeserializeOwned>(value: Value) -> Result<T> {
    serde_json::from_value(value).map_err(|error| ZeppBridgeError::ParseError(error.to_string()))
}

fn clip(text: &str) -> String {
    let mut out: String = text.chars().take(80).collect();
    if text.chars().count() > 80 {
        out.push('…');
    }
    out
}

impl Database {
    /// 一条记录现在的样子（账本比对和写回用的那份）。没有为 `None`。
    fn mcp_snapshot(&self, kind: &str, target: &str) -> Result<Option<Value>> {
        let id = || target.parse::<i64>().unwrap_or(-1);
        Ok(match kind {
            "injury" => self
                .list_injuries()?
                .into_iter()
                .find(|row| row.input.id == Some(id()))
                .map(|row| encode(&row.input))
                .transpose()?,
            "life_event" => self
                .list_life_events(None, None)?
                .into_iter()
                .find(|row| row.input.id == Some(id()))
                .map(|row| encode(&row.input))
                .transpose()?,
            "race" => self
                .list_races()?
                .into_iter()
                .find(|row| row.input.id == Some(id()))
                .map(|row| encode(&row.input))
                .transpose()?,
            "shoe" => self
                .list_shoe_rows()?
                .into_iter()
                .find(|row| row.input.id == Some(id()))
                .map(|row| encode(&row.input))
                .transpose()?,
            "workout_feel" => self
                .conn
                .query_row(
                    "SELECT rpe, soreness, shoe_mode, shoe_id FROM workout_annotations WHERE workout_id = ?1",
                    [target],
                    |row| {
                        Ok(AnnotationInput {
                            workout_id: target.to_string(),
                            rpe: row.get(0)?,
                            soreness: serde_json::from_str(&row.get::<_, String>(1)?)
                                .unwrap_or_default(),
                            shoe_mode: row.get(2)?,
                            shoe_id: row.get(3)?,
                        })
                    },
                )
                .optional()?
                .map(|input| encode(&input))
                .transpose()?,
            "coach_note" => self
                .coach_note_state(id())?
                .map(|(state, text)| json!({ "state": state, "text": text })),
            _ => None,
        })
    }

    /// 按快照写回；`None` 是删掉（撤销新增）。
    fn mcp_restore(&self, kind: &str, target: &str, before: Option<Value>) -> Result<()> {
        let id = target.parse::<i64>().unwrap_or(-1);
        match (kind, before) {
            ("injury", Some(value)) => self.save_injury(&decode(value)?).map(drop),
            ("injury", None) => self.delete_injury(id),
            ("life_event", Some(value)) => self.save_life_event(&decode(value)?).map(drop),
            ("life_event", None) => self.delete_life_event(id),
            ("race", Some(value)) => self.save_race(&decode(value)?).map(drop),
            ("race", None) => self.delete_race(id),
            ("shoe", Some(value)) => self.save_shoe(&decode(value)?).map(drop),
            ("shoe", None) => self.delete_shoe(id),
            ("workout_feel", before) => {
                let input = match before {
                    Some(value) => decode(value)?,
                    // 原来没有这一行：存一份全空的，save_workout_feel 会把行删掉。
                    None => AnnotationInput {
                        workout_id: target.to_string(),
                        rpe: None,
                        soreness: Vec::new(),
                        shoe_mode: "auto".into(),
                        shoe_id: None,
                    },
                };
                self.save_workout_feel(&input)
            }
            ("coach_note", Some(value)) => self.set_coach_note_state(
                id,
                value
                    .get("state")
                    .and_then(Value::as_str)
                    .unwrap_or("proposed"),
            ),
            ("coach_note", None) => self.set_coach_note_state(id, "rejected"),
            _ => Err(ZeppBridgeError::ConfigError("未知的改动类型".into())),
        }
    }

    #[allow(clippy::too_many_arguments)] // 一行账本的七列，拆结构体只是换个地方写同样七个字段
    fn record_mcp_write(
        &self,
        tool: &str,
        kind: &str,
        target: &str,
        label: &str,
        before: Option<&Value>,
        after: &Value,
        source_name: Option<&str>,
    ) -> Result<i64> {
        let source: Option<String> = source_name
            .map(|name| name.chars().filter(|c| !c.is_control()).take(60).collect())
            .filter(|name: &String| !name.trim().is_empty());
        self.conn.execute(
            "INSERT INTO mcp_writes(tool, kind, target_id, label, before_json, after_json, source_name, created_at)
             VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                tool,
                kind,
                target,
                clip(label),
                before.map(Value::to_string),
                after.to_string(),
                source,
                Utc::now().to_rfc3339()
            ],
        )?;
        Ok(self.conn.last_insert_rowid())
    }

    /// 本地 AI 写一次，并记进账本。校验全靠原来的 save 函数，这里不另写一套。
    pub fn apply_mcp_change(
        &self,
        tool: &str,
        change: McpChange,
        source_name: Option<&str>,
    ) -> Result<McpApplied> {
        let (kind, target, label, before) = match &change {
            McpChange::Injury(input) => ("injury", input.id, input.title.clone(), None),
            McpChange::LifeEvent(input) => ("life_event", input.id, input.title.clone(), None),
            McpChange::Race(input) => ("race", input.id, input.name.clone(), None),
            McpChange::Shoe(input) => ("shoe", input.id, input.name.clone(), None),
            McpChange::WorkoutFeel { workout_id, .. } => (
                "workout_feel",
                None,
                workout_id.clone(),
                Some(workout_id.clone()),
            ),
            McpChange::WorkoutType { workout_id, .. } => {
                return self.apply_mcp_type(tool, workout_id, &change, source_name);
            }
            McpChange::CoachNote(text) => {
                return self.apply_mcp_note(tool, text, source_name);
            }
        };
        // 修改已有的：先确认它在，拿到改之前的样子。
        let target_before = match (target, &before) {
            (Some(id), _) => Some(id.to_string()),
            (None, Some(workout)) => Some(workout.clone()),
            (None, None) => None,
        };
        let before_value = match &target_before {
            Some(target) => self.mcp_snapshot(kind, target)?,
            None => None,
        };
        if target.is_some() && before_value.is_none() {
            return Err(ZeppBridgeError::DataUnavailable(
                "找不到要改的这条记录".into(),
            ));
        }
        let target_id = match change {
            McpChange::Injury(input) => self.save_injury(&input)?.to_string(),
            McpChange::LifeEvent(input) => self.save_life_event(&input)?.to_string(),
            McpChange::Race(input) => self.save_race(&input)?.to_string(),
            McpChange::Shoe(input) => self.save_shoe(&input)?.to_string(),
            McpChange::WorkoutFeel {
                workout_id,
                rpe,
                soreness,
            } => {
                // 鞋沿用现在的选择：AI 只改 RPE 和酸痛。
                let current: Option<AnnotationInput> =
                    before_value.clone().map(decode).transpose()?;
                let (shoe_mode, shoe_id) = current
                    .map(|feel| (feel.shoe_mode, feel.shoe_id))
                    .unwrap_or_else(|| ("auto".into(), None));
                self.save_workout_feel(&AnnotationInput {
                    workout_id: workout_id.clone(),
                    rpe,
                    soreness,
                    shoe_mode,
                    shoe_id,
                })?;
                workout_id
            }
            McpChange::WorkoutType { .. } | McpChange::CoachNote(_) => unreachable!(),
        };
        let after = self.mcp_snapshot(kind, &target_id)?.unwrap_or(Value::Null);
        let action = if before_value.is_none() {
            "created"
        } else {
            "updated"
        };
        if before_value.as_ref() == Some(&after) {
            return Ok(McpApplied {
                write_id: None,
                kind,
                target_id,
                action: "unchanged",
                note: None,
            });
        }
        let write_id = self.record_mcp_write(
            tool,
            kind,
            &target_id,
            &label,
            before_value.as_ref(),
            &after,
            source_name,
        )?;
        Ok(McpApplied {
            write_id: Some(write_id),
            kind,
            target_id,
            action,
            note: None,
        })
    }

    fn apply_mcp_type(
        &self,
        tool: &str,
        workout_id: &str,
        change: &McpChange,
        source_name: Option<&str>,
    ) -> Result<McpApplied> {
        let McpChange::WorkoutType { workout_type, .. } = change else {
            unreachable!()
        };
        let edit = self.edit_workouts(
            &[workout_id.to_string()],
            Some(workout_type.as_deref()),
            None,
        )?;
        let after = json!({ "editId": edit.id, "type": workout_type });
        let write_id = self.record_mcp_write(
            tool,
            "workout_type",
            workout_id,
            workout_id,
            None,
            &after,
            source_name,
        )?;
        Ok(McpApplied {
            write_id: Some(write_id),
            kind: "workout_type",
            target_id: workout_id.to_string(),
            action: "updated",
            note: None,
        })
    }

    fn apply_mcp_note(
        &self,
        tool: &str,
        text: &str,
        source_name: Option<&str>,
    ) -> Result<McpApplied> {
        let outcome = self.remember_coach_note(text, source_name)?;
        let (write_id, target_id, action) = match &outcome {
            Remembered::Remembered { id, was_proposed } => {
                let target = id.to_string();
                let before =
                    was_proposed.then(|| json!({ "state": "proposed", "text": text.trim() }));
                let after = self
                    .mcp_snapshot("coach_note", &target)?
                    .unwrap_or(Value::Null);
                let label = after
                    .get("text")
                    .and_then(Value::as_str)
                    .unwrap_or(text)
                    .to_string();
                let write = self.record_mcp_write(
                    tool,
                    "coach_note",
                    &target,
                    &label,
                    before.as_ref(),
                    &after,
                    source_name,
                )?;
                (
                    Some(write),
                    target,
                    if *was_proposed { "updated" } else { "created" },
                )
            }
            Remembered::AlreadyKnown { id } => (None, id.to_string(), "unchanged"),
            Remembered::RejectedBefore => (None, String::new(), "unchanged"),
        };
        Ok(McpApplied {
            write_id,
            kind: "coach_note",
            target_id,
            action,
            note: Some(outcome),
        })
    }

    /// 最近的改动，新的在前（含已撤销的，界面灰掉）。
    pub fn mcp_writes(&self, limit: usize) -> Result<Vec<McpWrite>> {
        let mut statement = self.conn.prepare(
            "SELECT id, tool, kind, target_id, label, before_json IS NULL, source_name, created_at, undone_at
               FROM mcp_writes ORDER BY id DESC LIMIT ?1",
        )?;
        let rows = statement.query_map([limit.clamp(1, 500) as i64], |row| {
            let kind: String = row.get(2)?;
            let created: bool = row.get(5)?;
            Ok(McpWrite {
                id: row.get(0)?,
                tool: row.get(1)?,
                action: if created && kind != "workout_type" {
                    "created"
                } else {
                    "updated"
                },
                kind,
                target_id: row.get(3)?,
                label: row.get(4)?,
                source_name: row.get(6)?,
                created_at: row.get(7)?,
                undone_at: row.get(8)?,
            })
        })?;
        Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
    }

    /// 撤销一条。见模块说明。
    pub fn undo_mcp_write(&self, id: i64) -> Result<UndoOutcome> {
        let row: Option<(String, String, Option<String>, String)> = self
            .conn
            .query_row(
                "SELECT kind, target_id, before_json, after_json FROM mcp_writes
                  WHERE id = ?1 AND undone_at IS NULL",
                [id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )
            .optional()?;
        let Some((kind, target, before, after)) = row else {
            return Ok(UndoOutcome::Missing);
        };
        let newer: bool = self
            .conn
            .query_row(
                "SELECT 1 FROM mcp_writes WHERE kind = ?1 AND target_id = ?2 AND id > ?3
                    AND undone_at IS NULL LIMIT 1",
                params![kind, target, id],
                |_| Ok(true),
            )
            .optional()?
            .is_some();
        if newer {
            return Ok(UndoOutcome::Stale);
        }
        let parse = |text: &str| {
            serde_json::from_str::<Value>(text)
                .map_err(|error| ZeppBridgeError::ParseError(error.to_string()))
        };
        let after = parse(&after)?;
        if kind == "workout_type" {
            let edit_id = after
                .get("editId")
                .and_then(Value::as_str)
                .unwrap_or_default();
            match self.undo_workout_edit(edit_id) {
                Ok(_) => {}
                Err(ZeppBridgeError::ConfigError(_) | ZeppBridgeError::DataUnavailable(_)) => {
                    return Ok(UndoOutcome::Stale)
                }
                Err(error) => return Err(error),
            }
        } else {
            if self.mcp_snapshot(&kind, &target)?.as_ref() != Some(&after) {
                return Ok(UndoOutcome::Stale);
            }
            let before = before.as_deref().map(parse).transpose()?;
            self.mcp_restore(&kind, &target, before)?;
        }
        self.conn.execute(
            "UPDATE mcp_writes SET undone_at = ?2 WHERE id = ?1",
            params![id, Utc::now().to_rfc3339()],
        )?;
        Ok(UndoOutcome::Undone)
    }
}

/// 「只给共享任务」开关（设置 › 本地 AI）。开着时生成的配置带 `--scope task`。
const TASK_SCOPE_ONLY_KEY: &str = "mcp_task_scope_only";

impl Database {
    pub fn mcp_task_scope_only(&self) -> Result<bool> {
        Ok(self.get_app_meta(TASK_SCOPE_ONLY_KEY)?.as_deref() == Some("1"))
    }

    pub fn set_mcp_task_scope_only(&self, on: bool) -> Result<()> {
        self.set_app_meta(TASK_SCOPE_ONLY_KEY, if on { "1" } else { "0" })
    }
}
