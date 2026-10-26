//! 「带走我的一切」（批次 7，导出要大方）：用户自己在 ZeppBridge 里写下、判断、整理的东西，
//! 一份 JSON 全部带走——打分、批注、跑鞋、比赛、伤病、纪元、教练档案、AI 任务与提示词历史、
//! 交给 AI 的记录、训练计划草稿与发布账本、信匣里的信、手动指认、导入批次。
//!
//! 健康数据本身不在这里：那些在云端有、在「导出」里另有 JSON / CSV / FIT / GPX。这一份是
//! 「理解」的那一半，用户知道随时能带走，才敢往里存。
//!
//! 逐表原样导出（列名就是键），不做转换，以后表加了列也自动带上。唯一的例外是没到日子的
//! 时间胶囊：原文连自己都还看不到，导出里也只留「哪天开封」。
use chrono::{DateTime, Utc};
use rusqlite::types::ValueRef;
use serde_json::{json, Map, Value};

use super::Database;
use crate::models::error::Result;

/// 导出哪些表。只放用户自己产生的东西；同步来的健康数据、报文和内部账本不在这里。
pub const MY_RECORD_TABLES: [&str; 21] = [
    "workout_feedback",
    "workout_annotations",
    "workout_local_state",
    "workout_code_labels",
    "device_model_overrides",
    "shoes",
    "races",
    "injuries",
    "life_events",
    "coach_notes",
    "ai_tasks",
    "ai_task_templates",
    "ai_prompt_versions",
    "ai_exchanges",
    "training_plan_drafts",
    "training_plan_workouts",
    "training_plan_publishes",
    "data_letters",
    "import_batches",
    "workout_imports",
    "workout_fit_overrides",
];

pub const MY_RECORDS_FORMAT: &str = "zeppbridge-my-records";

impl Database {
    pub fn export_my_records(&self, now: DateTime<Utc>) -> Result<Value> {
        let mut tables = Map::new();
        let mut counts = Map::new();
        for table in MY_RECORD_TABLES {
            let exists: bool = self.conn.query_row(
                "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1)",
                [table],
                |row| row.get(0),
            )?;
            if !exists {
                continue;
            }
            let mut rows = self.table_rows(table)?;
            if table == "data_letters" {
                rows.iter_mut().for_each(seal_unopened_capsule);
            }
            counts.insert(table.to_string(), json!(rows.len()));
            tables.insert(table.to_string(), Value::Array(rows));
        }
        Ok(json!({
            "format": MY_RECORDS_FORMAT,
            "version": 1,
            "exported_at": now.to_rfc3339(),
            "counts": counts,
            "tables": tables,
        }))
    }

    fn table_rows(&self, table: &str) -> Result<Vec<Value>> {
        // 表名只来自上面的常量，不是外部输入。
        let mut stmt = self.conn.prepare(&format!("SELECT * FROM {table}"))?;
        let names: Vec<String> = stmt.column_names().iter().map(|n| n.to_string()).collect();
        let mut rows = stmt.query([])?;
        let mut out = Vec::new();
        while let Some(row) = rows.next()? {
            let mut object = Map::new();
            for (index, name) in names.iter().enumerate() {
                let value = match row.get_ref(index)? {
                    ValueRef::Null => Value::Null,
                    ValueRef::Integer(v) => json!(v),
                    ValueRef::Real(v) => json!(v),
                    ValueRef::Text(bytes) => {
                        Value::String(String::from_utf8_lossy(bytes).into_owned())
                    }
                    ValueRef::Blob(bytes) => Value::String(hex::encode(bytes)),
                };
                object.insert(name.clone(), value);
            }
            out.push(Value::Object(object));
        }
        Ok(out)
    }
}

/// 没开封的时间胶囊：原文和快照都不导出，只留哪天开封。
fn seal_unopened_capsule(row: &mut Value) {
    let Some(object) = row.as_object_mut() else {
        return;
    };
    let capsule = object.get("kind").and_then(Value::as_str) == Some("capsule");
    let opened = object.get("opened_at").is_some_and(|v| !v.is_null());
    if capsule && !opened {
        object.insert("note".into(), Value::Null);
        object.insert("body".into(), Value::Null);
        object.insert("sealed".into(), Value::Bool(true));
    }
}
