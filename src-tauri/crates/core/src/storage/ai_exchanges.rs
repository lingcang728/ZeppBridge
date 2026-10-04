//! An exchange records an exported package, not proof that a provider read it.
use super::Database;
use crate::ai_tasks::AiTask;
use crate::models::error::Result;
use crate::training_plan::PlanDocument;
use chrono::Utc;
use rusqlite::{params, OptionalExtension};
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct AiExchange {
    pub id: String,
    pub task_id: String,
    pub provider: String,
    pub question: String,
    pub days_before: i64,
    pub categories: serde_json::Value,
    pub workout_ids: Vec<String>,
    pub personal_note: String,
    pub sent_at: String,
    pub md_path: String,
    pub plan_draft_id: Option<String>,
    pub received_at: Option<String>,
    pub publish_id: Option<i64>,
    pub publish_state: Option<String>,
    pub undone: bool,
    pub document: Option<PlanDocument>,
    pub plan: Option<crate::training_plan::PlanCheck>,
}

impl Database {
    /// Only an explicitly seeded isolated library can enable simulated delivery.
    pub fn is_demo_library(&self) -> Result<bool> {
        Ok(self.get_app_meta("time_bridge_demo")?.as_deref() == Some("1"))
    }
    pub fn record_ai_exchange(&self, task: &AiTask, provider: &str, path: &str) -> Result<()> {
        let now = Utc::now().to_rfc3339();
        let id = format!(
            "exchange-{}",
            Utc::now().timestamp_nanos_opt().unwrap_or_default()
        );
        let days = task
            .categories
            .iter()
            .filter(|c| c.category.is_windowed())
            .map(|c| c.days_before)
            .max()
            .unwrap_or(14);
        self.conn.execute("INSERT INTO ai_exchanges(id,task_id,provider,question,days_before,categories,workout_ids,personal_note,sent_at,md_path) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",
            params![id, task.id, provider, task.prompt, days, serde_json::to_string(&task.categories)?, serde_json::to_string(&task.workout_ids)?, task.personal_note, now, path])?;
        Ok(())
    }

    pub fn link_ai_exchange(&self, draft_id: &str) -> Result<()> {
        self.conn.execute("UPDATE ai_exchanges SET plan_draft_id=?1, received_at=?2 WHERE id=(SELECT id FROM ai_exchanges WHERE plan_draft_id IS NULL ORDER BY sent_at DESC, id DESC LIMIT 1)", params![draft_id,Utc::now().to_rfc3339()])?;
        Ok(())
    }

    /// MCP has no exported-package scope. Keep its source explicit and do not
    /// invent a provider or enabled data categories.
    pub fn record_mcp_exchange(&self, draft_id: &str, document: &PlanDocument) -> Result<()> {
        let now = Utc::now().to_rfc3339();
        self.conn.execute("INSERT INTO ai_exchanges(id,task_id,provider,question,days_before,categories,sent_at,md_path,plan_draft_id,received_at) VALUES(?1,'','mcp',?2,13,'[]',?3,'',?4,?3)", params![format!("mcp-{draft_id}"),document.summary.as_deref().unwrap_or_default(),now,draft_id])?;
        Ok(())
    }

    pub fn ai_exchange_list(&self, limit: usize) -> Result<Vec<AiExchange>> {
        let mut stmt = self.conn.prepare("SELECT e.id,e.task_id,e.provider,e.question,e.days_before,e.categories,e.workout_ids,e.personal_note,e.sent_at,e.md_path,e.plan_draft_id,e.received_at,e.publish_id,p.state,COALESCE(p.undone,0),d.document FROM ai_exchanges e LEFT JOIN training_plan_drafts d ON d.id=e.plan_draft_id LEFT JOIN training_plan_publishes p ON p.id=e.publish_id ORDER BY e.sent_at DESC,e.id DESC LIMIT ?1")?;
        let rows = stmt.query_map([limit.clamp(1, 100) as i64], |r| {
            Ok((
                AiExchange {
                    id: r.get(0)?,
                    task_id: r.get(1)?,
                    provider: r.get(2)?,
                    question: r.get(3)?,
                    days_before: r.get(4)?,
                    categories: serde_json::from_str(&r.get::<_, String>(5)?).unwrap_or_default(),
                    workout_ids: serde_json::from_str(&r.get::<_, String>(6)?).unwrap_or_default(),
                    personal_note: r.get(7)?,
                    sent_at: r.get(8)?,
                    md_path: r.get(9)?,
                    plan_draft_id: r.get(10)?,
                    received_at: r.get(11)?,
                    publish_id: r.get(12)?,
                    publish_state: r.get(13)?,
                    undone: r.get(14)?,
                    document: None,
                    plan: None,
                },
                r.get::<_, Option<String>>(15)?,
            ))
        })?;
        rows.map(|r| {
            let (mut item, text) = r?;
            item.document = text.map(|t| serde_json::from_str(&t)).transpose()?;
            if let Some(document) = &item.document {
                let today = chrono::DateTime::parse_from_rfc3339(&item.sent_at)
                    .map(|date| date.with_timezone(&chrono::Local).date_naive())
                    .unwrap_or_else(|_| chrono::Local::now().date_naive());
                item.plan = Some(crate::training_plan::check_plan(
                    document,
                    crate::training_plan::PlanContext {
                        today,
                        max_hr: None,
                    },
                ));
            }
            Ok(item)
        })
        .collect()
    }

    pub fn update_plan_draft(&self, id: &str, document: &PlanDocument) -> Result<bool> {
        Ok(self.conn.execute("UPDATE training_plan_drafts SET document=?2,updated_at=?3 WHERE id=?1 AND status='open'",params![id,serde_json::to_string(document)?,Utc::now().to_rfc3339()])? > 0)
    }

    pub fn ai_profile_note(&self) -> Result<String> {
        Ok(self.get_app_meta("ai_profile_note")?.unwrap_or_default())
    }

    pub fn set_ai_profile_note(&self, note: &str) -> Result<()> {
        self.set_app_meta("ai_profile_note", note)
    }

    pub fn exchange_publish(&self, publish_id: i64) -> Result<()> {
        let draft: Option<String> = self
            .conn
            .query_row(
                "SELECT draft_id FROM training_plan_publishes WHERE id=?1",
                [publish_id],
                |r| r.get(0),
            )
            .optional()?
            .flatten();
        if let Some(draft) = draft {
            self.conn.execute(
                "UPDATE ai_exchanges SET publish_id=?1 WHERE plan_draft_id=?2",
                params![publish_id, draft],
            )?;
        }
        Ok(())
    }
}
