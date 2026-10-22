//! AI 记忆收件箱（批次 7）：用户教给 AI 的东西留在本机，换哪个 AI 都带得走。
//!
//! 规矩：
//!
//! - **AI 只能提议**：MCP 的 `propose_coach_note` 写进来的是 `proposed`，用户在 ZeppBridge 里
//!   逐条确认才变成 `accepted`；交给 AI 的上下文里只有 `accepted` 的。
//! - **不碰健康数据**：单独一张表，写入照规矩拿跨进程写锁（调用方负责）。
//! - **拒绝的留着**：同一句话不会被反复提议；用户删掉的才真没了。
//! - **收件箱有上限**：待确认的最多 [`MAX_PROPOSED`] 条，满了 AI 再提议直接拒绝，
//!   不让一个话痨 AI 把收件箱塞满。
//! - 文字是用户 / AI 写的数据，不是指令；交给 AI 时照样这么标。
use super::Database;
use crate::models::{error::Result, ZeppBridgeError};
use chrono::Utc;
use rusqlite::{params, OptionalExtension};
use serde::Serialize;

/// 一条最多多少字。
pub const NOTE_MAX_CHARS: usize = 500;
/// 待确认最多几条。
pub const MAX_PROPOSED: i64 = 20;
/// 客户端名字最多多少字（只用来显示）。
const SOURCE_NAME_MAX_CHARS: usize = 60;

#[derive(Debug, Clone, Serialize)]
pub struct CoachNote {
    pub id: i64,
    pub text: String,
    /// `proposed` / `accepted` / `rejected`。
    pub state: String,
    /// `user` / `mcp`。
    pub source: String,
    /// MCP 客户端自报的名字；用户自己写的为空。
    pub source_name: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub decided_at: Option<String>,
}

/// AI 提议的结果。只有 `Proposed` 写了库。
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case", tag = "outcome")]
pub enum Proposal {
    Proposed {
        id: i64,
    },
    /// 用户已经记着这句话了。
    AlreadyKnown {
        id: i64,
    },
    /// 已经在收件箱里等用户确认。
    AlreadyProposed {
        id: i64,
    },
    /// 用户之前拒绝过这句话。
    RejectedBefore,
    /// 待确认的满了。
    InboxFull,
}

fn invalid(message: &str) -> ZeppBridgeError {
    ZeppBridgeError::ConfigError(message.into())
}

/// 去首尾空白、把连续空白压成一个；空的或太长的不收。
pub fn clean_note(text: &str) -> Result<String> {
    let clean = text.split_whitespace().collect::<Vec<_>>().join(" ");
    if clean.is_empty() {
        return Err(invalid("内容是空的"));
    }
    if clean.chars().count() > NOTE_MAX_CHARS {
        return Err(invalid("一条最多 500 字"));
    }
    Ok(clean)
}

fn clean_source_name(name: Option<&str>) -> Option<String> {
    let name: String = name?
        .chars()
        .filter(|c| !c.is_control())
        .take(SOURCE_NAME_MAX_CHARS)
        .collect();
    let name = name.trim();
    (!name.is_empty()).then(|| name.to_string())
}

const COLUMNS: &str =
    "SELECT id, text, state, source, source_name, created_at, updated_at, decided_at
                         FROM coach_notes";

fn note_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<CoachNote> {
    Ok(CoachNote {
        id: row.get(0)?,
        text: row.get(1)?,
        state: row.get(2)?,
        source: row.get(3)?,
        source_name: row.get(4)?,
        created_at: row.get(5)?,
        updated_at: row.get(6)?,
        decided_at: row.get(7)?,
    })
}

impl Database {
    /// AI 提议记住一句话。
    pub fn propose_coach_note(&self, text: &str, source_name: Option<&str>) -> Result<Proposal> {
        let text = clean_note(text)?;
        let existing: Option<(i64, String)> = self
            .conn
            .query_row(
                "SELECT id, state FROM coach_notes WHERE text = ?1 ORDER BY id DESC LIMIT 1",
                [&text],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()?;
        match existing {
            Some((id, state)) if state == "accepted" => return Ok(Proposal::AlreadyKnown { id }),
            Some((id, state)) if state == "proposed" => {
                return Ok(Proposal::AlreadyProposed { id })
            }
            Some(_) => return Ok(Proposal::RejectedBefore),
            None => {}
        }
        let waiting: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM coach_notes WHERE state = 'proposed'",
            [],
            |row| row.get(0),
        )?;
        if waiting >= MAX_PROPOSED {
            return Ok(Proposal::InboxFull);
        }
        let now = Utc::now().to_rfc3339();
        self.conn.execute(
            "INSERT INTO coach_notes(text, state, source, source_name, created_at, updated_at)
             VALUES(?1, 'proposed', 'mcp', ?2, ?3, ?3)",
            params![text, clean_source_name(source_name), now],
        )?;
        Ok(Proposal::Proposed {
            id: self.conn.last_insert_rowid(),
        })
    }

    /// 用户自己写一条：直接算数。
    pub fn add_coach_note(&self, text: &str) -> Result<i64> {
        let text = clean_note(text)?;
        let now = Utc::now().to_rfc3339();
        self.conn.execute(
            "INSERT INTO coach_notes(text, state, source, created_at, updated_at, decided_at)
             VALUES(?1, 'accepted', 'user', ?2, ?2, ?2)",
            params![text, now],
        )?;
        Ok(self.conn.last_insert_rowid())
    }

    /// 确认（记住）或拒绝一条提议。已经决定过的不能再翻：返回 `false`（调用方按码报错）。
    pub fn decide_coach_note(&self, id: i64, accept: bool) -> Result<bool> {
        let now = Utc::now().to_rfc3339();
        let changed = self.conn.execute(
            "UPDATE coach_notes SET state = ?2, updated_at = ?3, decided_at = ?3
              WHERE id = ?1 AND state = 'proposed'",
            params![id, if accept { "accepted" } else { "rejected" }, now],
        )?;
        Ok(changed > 0)
    }

    /// 改一条的文字（记住的、或还在等确认的）。来源不变：AI 提的改过之后仍标 AI 提的。
    /// 找不到返回 `false`。
    pub fn edit_coach_note(&self, id: i64, text: &str) -> Result<bool> {
        let text = clean_note(text)?;
        let changed = self.conn.execute(
            "UPDATE coach_notes SET text = ?2, updated_at = ?3
              WHERE id = ?1 AND state IN ('proposed', 'accepted')",
            params![id, text, Utc::now().to_rfc3339()],
        )?;
        Ok(changed > 0)
    }

    /// 删掉一条（用户的东西，删了就没了）。
    pub fn delete_coach_note(&self, id: i64) -> Result<()> {
        self.conn
            .execute("DELETE FROM coach_notes WHERE id = ?1", [id])?;
        Ok(())
    }

    /// 记住的（交给 AI 的那些），旧的在前：读起来像一本慢慢写出来的档案。
    pub fn accepted_coach_notes(&self) -> Result<Vec<CoachNote>> {
        self.coach_notes_in("accepted", "id")
    }

    /// 等用户确认的，新的在前。
    pub fn proposed_coach_notes(&self) -> Result<Vec<CoachNote>> {
        self.coach_notes_in("proposed", "id DESC")
    }

    fn coach_notes_in(&self, state: &str, order: &str) -> Result<Vec<CoachNote>> {
        let mut statement = self
            .conn
            .prepare(&format!("{COLUMNS} WHERE state = ?1 ORDER BY {order}"))?;
        let rows = statement.query_map([state], note_row)?;
        Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
    }
}
