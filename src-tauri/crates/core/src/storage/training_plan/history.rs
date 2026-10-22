//! 计划留档（批次 7）：每一份推到手表的计划都留着，能从头翻到尾。
//!
//! 账本本来就只增不改，这里只是换一种读法：按「批」列出，每批带上它换上去的训练
//! （`activated`，就是那一份计划本身）、换下来几条、来自哪份草稿（你写的 / 粘贴的 AI 回复 /
//! MCP），以及这些训练练完后打的分。滚动推送（`roll`）只是把同一份计划往前补发，不算一份
//! 新计划，不列。

use super::{ids_from, summarize, Database, DraftOrigin, PublishRecord};
use crate::models::error::Result;
use crate::training_plan::Workout;
use rusqlite::OptionalExtension;
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct HistoryWorkout {
    pub plan_workout_id: i64,
    #[serde(flatten)]
    pub workout: Workout,
    /// 这条训练练完后打的分（1–5），没打为空。
    pub rating: Option<u8>,
}

#[derive(Debug, Clone, Serialize)]
pub struct PlanHistoryEntry {
    /// 整批的汇总（编号、类型、状态、时间）。
    pub record: PublishRecord,
    /// 草稿从哪来；撤销、清空、断开授权没有草稿，为空。
    pub origin: Option<DraftOrigin>,
    /// 草稿里写的一句总述（用户 / AI 写的原文）。
    pub summary: Option<String>,
    /// 这一批换上去的训练，按日期排。
    pub workouts: Vec<HistoryWorkout>,
    /// 这一批换下来几条。
    pub replaced: usize,
}

impl Database {
    /// 推过的每一份计划，新的在前。
    pub fn plan_history(&self, limit: usize) -> Result<Vec<PlanHistoryEntry>> {
        let heads: Vec<(i64, Option<String>, String, String)> = {
            let mut statement = self.conn.prepare(
                "SELECT id, draft_id, activated, deactivated FROM training_plan_publishes
                  WHERE (batch_id IS NULL OR batch_id = id) AND kind != 'roll'
                  ORDER BY id DESC LIMIT ?1",
            )?;
            let rows = statement.query_map([limit.clamp(1, 200) as i64], |row| {
                Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
            })?;
            rows.collect::<std::result::Result<_, _>>()?
        };
        let mut out = Vec::with_capacity(heads.len());
        for (batch_id, draft_id, activated, deactivated) in heads {
            let Some(record) = summarize(self.plan_batch(batch_id)?) else {
                continue;
            };
            let (origin, summary) = match draft_id {
                Some(id) => self
                    .conn
                    .query_row(
                        "SELECT origin, document FROM training_plan_drafts WHERE id = ?1",
                        [id],
                        |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
                    )
                    .optional()?
                    .map(|(origin, document)| {
                        let summary = serde_json::from_str::<serde_json::Value>(&document)
                            .ok()
                            .and_then(|doc| doc.get("summary")?.as_str().map(str::to_owned))
                            .filter(|text| !text.trim().is_empty());
                        (Some(DraftOrigin::parse(&origin)), summary)
                    })
                    .unwrap_or((None, None)),
                None => (None, None),
            };
            let mut workouts = Vec::new();
            for id in ids_from(&activated) {
                let Some(text) = self
                    .conn
                    .query_row(
                        "SELECT workout FROM training_plan_workouts WHERE id = ?1",
                        [id],
                        |row| row.get::<_, String>(0),
                    )
                    .optional()?
                else {
                    continue;
                };
                let rating: Option<i64> = self
                    .conn
                    .query_row(
                        "SELECT MAX(rating) FROM workout_feedback
                          WHERE plan_workout_id = ?1 AND state = 'rated'",
                        [id],
                        |row| row.get(0),
                    )
                    .optional()?
                    .flatten();
                workouts.push(HistoryWorkout {
                    plan_workout_id: id,
                    workout: serde_json::from_str(&text)?,
                    rating: rating.map(|v| v as u8),
                });
            }
            workouts.sort_by(|a, b| {
                (a.workout.date, a.plan_workout_id).cmp(&(b.workout.date, b.plan_workout_id))
            });
            out.push(PlanHistoryEntry {
                record,
                origin,
                summary,
                workouts,
                replaced: ids_from(&deactivated).len(),
            });
        }
        Ok(out)
    }
}
