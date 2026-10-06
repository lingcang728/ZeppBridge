//! 训练计划的草稿与发布账本。
//!
//! 官方没有读取接口，所以这里是「手表上现在有什么」的唯一来源，规矩是：
//!
//! - **先记账再发请求**：[`Database::prepare_plan_publish`] 在一个事务里改好生效
//!   计划、写下要发的每个整窗报文（状态 `pending`），然后调用方才去发；每发完一个由
//!   [`Database::finish_plan_publish`] 补上结果。进程在中间被杀，留下的 `pending`
//!   按「不确定有没有到」对待，不当成功。
//! - **训练行只增不改**：换计划只翻 `active`，每次推送记下自己翻了哪些行，撤销就是
//!   原样翻回去再推一次。
//! - **计划覆盖到的每个 7 天窗口都推**（窗口从今天起按 7 天切，2026-10-06 R4 实测：
//!   未来窗口能推、不影响本周）。一次推送是一「批」，每个窗口一行、逐行记结果；
//!   某一周没送达就如实标出那一周，滚动推送下次会补。见 [`publish`]。
//! - **空数组只在用户确认后发**，而且它永远只清「今天起 7 天」（R5 实测，与
//!   `startDate` 无关）。未来窗口要变空，走「占位 + 重推前一个窗口」。自动的滚动
//!   推送永远不清空任何窗口。

mod publish;

pub use publish::PLACEHOLDER_ID_BASE;

use super::Database;
use crate::models::{error::Result, ZeppBridgeError};
use crate::training_plan::v2::NumberedWorkout;
use crate::training_plan::window::{preview, DayPreview, Window};
use crate::training_plan::{check_plan, PlanCheck, PlanContext, PlanDocument, Workout};
use chrono::{NaiveDate, Utc};
use rusqlite::{params, OptionalExtension};
use serde::Serialize;
use serde_json::Value;

/// 「允许 AI 直接发布」开关，默认关：AI 只能起草，用户在 ZeppBridge 里确认后才发。
const AI_PUBLISH_KEY: &str = "training_plan_ai_publish";

/// 草稿从哪来。界面据此说「AI 起草的」还是「你写的」。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum DraftOrigin {
    User,
    AiPaste,
    Mcp,
}

impl DraftOrigin {
    fn as_str(self) -> &'static str {
        match self {
            Self::User => "user",
            Self::AiPaste => "ai_paste",
            Self::Mcp => "mcp",
        }
    }

    fn parse(text: &str) -> Self {
        match text {
            "ai_paste" => Self::AiPaste,
            "mcp" => Self::Mcp,
            _ => Self::User,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct PlanDraft {
    pub id: String,
    pub origin: DraftOrigin,
    pub status: String,
    pub document: PlanDocument,
    pub created_at: String,
    pub updated_at: String,
}

/// 发什么。
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PublishRequest {
    /// 把一份草稿变成生效计划，并推送所有内容变了的窗口。
    Draft { id: String },
    /// 每天的滚动推送：生效计划不变，只把账本和生效计划不一致的窗口补发（窗口每天往前
    /// 挪一天，之前没送达的那一周也在这里补）。永远不清空窗口。
    Roll,
    /// 撤销最近一次发布：原样翻回它改过的行，再推一次。
    UndoLast,
    /// 清空当前窗口（空数组）。只能由用户确认后发起。
    Clear,
}

impl PublishRequest {
    fn kind(&self) -> &'static str {
        match self {
            Self::Draft { .. } => "publish",
            Self::Roll => "roll",
            Self::UndoLast => "undo",
            Self::Clear => "clear",
        }
    }
}

/// 一个窗口这次怎么发。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SendRole {
    /// 正常整窗：窗口里的训练。
    Window,
    /// 当前窗口（从今天起）要变空：发 `[]`。
    Clear,
    /// 未来窗口要变空：占位清空（见 `training_plan::v2::clear_future_window`），
    /// 同一批里紧接着重推前一个窗口把占位覆盖掉。
    Placeholder,
}

impl SendRole {
    fn as_str(self) -> &'static str {
        match self {
            Self::Window => "window",
            Self::Clear => "clear",
            Self::Placeholder => "placeholder",
        }
    }
}

/// 一批里的一个窗口：发 `body`，发完拿 `publish_id` 回来记结果。**按顺序发**：
/// 后面的窗口先、占位之后紧跟它前一个窗口。
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct PendingSend {
    pub publish_id: i64,
    pub window_start: NaiveDate,
    pub role: SendRole,
    pub body: Value,
}

/// 准备的结果。只有 `Send` 会在账本里留下 `pending` 行。
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "snake_case", tag = "outcome")]
pub enum Prepared {
    /// 去发吧：按顺序发 `sends`，每发完一个记一次结果。
    Send {
        batch_id: i64,
        sends: Vec<PendingSend>,
    },
    /// 不用发：每个窗口的内容都和上次发过去的一样（生效计划可能已经改好）。
    NotNeeded,
    /// 这次会把某个窗口变空，而上次发过去的那个窗口里有训练：要清空，必须用户确认。
    /// 什么都没改。
    NeedsClearConfirmation,
    /// 草稿没通过校验。什么都没改。
    Invalid { check: PlanCheck },
    /// 没有可以撤销的发布。
    NothingToUndo,
}

/// 一次推送发出去之后的结果。
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SendOutcome {
    /// 官方回了 2xx。（它对任何报文都回 success，所以这只说明「送到了」。）
    Delivered,
    /// 官方明确拒绝（4xx）：这个窗口没有生效。整批都被拒时，账本里的改动要翻回去。
    Rejected {
        http_status: u16,
        error_code: String,
    },
    /// 不知道到没到：断网、超时、5xx。账本保持「已改」，界面提示可以重发。
    Unknown { error_code: String },
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct PublishRecord {
    pub id: i64,
    /// 同一批推送共用一个编号（批里第一行的 `id`）。
    pub batch_id: i64,
    pub kind: String,
    /// `window` / `clear` / `placeholder`。
    pub role: String,
    pub window_start: String,
    pub workout_count: usize,
    /// `pending` / `sent` / `rejected` / `unknown`；整批汇总时还有 `partial`
    /// （有的窗口送到了、有的被拒）。
    pub state: String,
    pub http_status: Option<u16>,
    pub error_code: Option<String>,
    pub undone: bool,
    pub created_at: String,
    pub finished_at: Option<String>,
}

/// 某个 7 天窗口按账本的样子。
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct WeekStatus {
    pub start: NaiveDate,
    /// 生效计划在这 7 天里有几条训练。
    pub planned: usize,
    /// 按账本发过去的有几条。
    pub sent: usize,
    pub state: WeekState,
    /// 最近一次推这几天没成功时的错误码（`err.*`）。
    pub error_code: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum WeekState {
    /// 账本上发过去的和生效计划一致。
    InSync,
    /// 一致，但最近一次结果不确定（断网、超时、进程中断，或占位可能残留）。
    Uncertain,
    /// 不一致：被拒、没发出去，或还在发。滚动推送会补发有训练的那几周。
    NotSent,
}

/// 按账本推算的「上次发到手表的」与生效计划。
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct PlanOverview {
    pub window: Window,
    /// 当前窗口里，按账本上次发过去的训练。
    pub sent: Vec<Workout>,
    /// 生效计划里今天及以后的全部训练。
    pub planned: Vec<Workout>,
    /// 最近一次推送结果不确定（断网、超时、进程中断），`sent` 可能和手表上不一致。
    pub uncertain: bool,
    /// 最近一批推送的汇总（状态取整批里最差的）。
    pub last_publish: Option<PublishRecord>,
    /// 最近一批推送的逐窗口结果，界面据此说「哪一周没送达」。
    pub last_batch: Vec<PublishRecord>,
    /// 有训练或发过训练的每个 7 天窗口（从今天起）。
    pub weeks: Vec<WeekStatus>,
    pub can_undo: bool,
}

/// 草稿的预览：校验结果 + 逐日的「发之前 / 发之后」。
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct DraftPreview {
    pub check: PlanCheck,
    pub window: Window,
    /// 从今天到 `max(窗口末日, 草稿末日)` 的逐日对比。「之前」是账本上发过去的。
    pub days: Vec<DayPreview>,
}

/// 可以撤销的那批推送，以及它翻过的行。
struct UndoTarget {
    id: i64,
    activated: Vec<i64>,
    deactivated: Vec<i64>,
}

fn plan_error(code: &'static str, message: &str) -> ZeppBridgeError {
    ZeppBridgeError::TrainingPlan {
        code,
        message: message.into(),
    }
}

fn random_hex(bytes: usize) -> String {
    let mut buffer = vec![0u8; bytes];
    if getrandom::getrandom(&mut buffer).is_err() {
        return format!("{:x}", Utc::now().timestamp_nanos_opt().unwrap_or_default());
    }
    hex::encode(buffer)
}

fn ids_json(ids: &[i64]) -> String {
    serde_json::to_string(ids).unwrap_or_else(|_| "[]".into())
}

fn ids_from(text: &str) -> Vec<i64> {
    serde_json::from_str(text).unwrap_or_default()
}

impl Database {
    /// 校验心率上限用：本地实测最高心率与手表自报最大心率取大的。都没有就是 `None`
    /// （校验按 220 兜底，只拦明显写错的数字）。
    pub fn training_plan_max_hr(&self) -> Result<Option<u16>> {
        let value: Option<f64> = self.conn.query_row(
            "SELECT MAX(v) FROM (
                SELECT MAX(max_hr) AS v FROM workouts WHERE max_hr > 0
                UNION ALL
                SELECT MAX(value) FROM daily_metrics
                 WHERE metric = 'device_max_hr' AND value > 0)",
            [],
            |row| row.get(0),
        )?;
        Ok(value
            .filter(|v| v.is_finite() && *v > 0.0)
            .map(|v| v.round().min(f64::from(u16::MAX)) as u16))
    }

    pub fn ai_may_publish_plans(&self) -> Result<bool> {
        Ok(self.get_app_meta(AI_PUBLISH_KEY)?.as_deref() == Some("1"))
    }

    pub fn set_ai_may_publish_plans(&self, allowed: bool) -> Result<()> {
        self.set_app_meta(AI_PUBLISH_KEY, if allowed { "1" } else { "0" })
    }

    pub fn save_plan_draft(&self, origin: DraftOrigin, document: &PlanDocument) -> Result<String> {
        let id = format!("plan-{}", random_hex(8));
        let now = Utc::now().to_rfc3339();
        let transaction = self.conn.unchecked_transaction()?;
        transaction.execute(
            "INSERT INTO training_plan_drafts(id, origin, document, status, created_at, updated_at)
             VALUES(?1, ?2, ?3, 'open', ?4, ?4)",
            params![id, origin.as_str(), serde_json::to_string(document)?, now],
        )?;
        if origin == DraftOrigin::AiPaste {
            self.link_ai_exchange(&id)?;
        }
        if origin == DraftOrigin::Mcp {
            self.record_mcp_exchange(&id, document)?;
        }
        transaction.commit()?;
        Ok(id)
    }

    pub fn plan_draft(&self, id: &str) -> Result<Option<PlanDraft>> {
        self.conn
            .query_row(
                "SELECT id, origin, status, document, created_at, updated_at
                 FROM training_plan_drafts WHERE id = ?1",
                [id],
                draft_row,
            )
            .optional()?
            .transpose()
    }

    /// 还没发也没丢掉的草稿，新的在前。
    pub fn open_plan_drafts(&self) -> Result<Vec<PlanDraft>> {
        let mut statement = self.conn.prepare(
            "SELECT id, origin, status, document, created_at, updated_at
             FROM training_plan_drafts WHERE status = 'open'
             ORDER BY created_at DESC, id DESC LIMIT 20",
        )?;
        let rows = statement.query_map([], draft_row)?;
        rows.map(|row| row?).collect()
    }

    pub fn discard_plan_draft(&self, id: &str) -> Result<bool> {
        let changed = self.conn.execute(
            "UPDATE training_plan_drafts SET status = 'discarded', updated_at = ?2
             WHERE id = ?1 AND status = 'open'",
            params![id, Utc::now().to_rfc3339()],
        )?;
        Ok(changed > 0)
    }

    fn plan_context(&self, today: NaiveDate) -> Result<PlanContext> {
        Ok(PlanContext {
            today,
            max_hr: self.training_plan_max_hr()?,
        })
    }

    /// 生效计划里日期 ≥ `from` 的训练，带编号。
    fn active_plan_workouts(&self, from: NaiveDate) -> Result<Vec<NumberedWorkout>> {
        let mut statement = self.conn.prepare(
            "SELECT id, workout FROM training_plan_workouts
             WHERE active = 1 AND workout_date >= ?1
             ORDER BY workout_date, id",
        )?;
        let rows = statement.query_map([from.to_string()], |row| {
            Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
        })?;
        rows.map(|row| {
            let (id, text) = row?;
            Ok(NumberedWorkout {
                id,
                workout: serde_json::from_str(&text)?,
            })
        })
        .collect()
    }

    fn workouts_by_ids(&self, ids: &[i64]) -> Result<Vec<Workout>> {
        let mut statement = self
            .conn
            .prepare("SELECT workout FROM training_plan_workouts WHERE id = ?1")?;
        let mut workouts = Vec::with_capacity(ids.len());
        for id in ids {
            if let Some(text) = statement
                .query_row([id], |row| row.get::<_, String>(0))
                .optional()?
            {
                workouts.push(serde_json::from_str(&text)?);
            }
        }
        Ok(workouts)
    }

    pub fn plan_publishes(&self, limit: usize) -> Result<Vec<PublishRecord>> {
        let mut statement = self
            .conn
            .prepare(&format!("{PUBLISH_COLUMNS} ORDER BY id DESC LIMIT ?1"))?;
        let rows = statement.query_map([limit.clamp(1, 200) as i64], publish_row)?;
        rows.map(|row| row.map_err(Into::into)).collect()
    }

    /// 一批推送的逐窗口记录，按发送顺序。
    pub fn plan_batch(&self, batch_id: i64) -> Result<Vec<PublishRecord>> {
        let mut statement = self.conn.prepare(&format!(
            "{PUBLISH_COLUMNS} WHERE COALESCE(batch_id, id) = ?1 ORDER BY id"
        ))?;
        let rows = statement.query_map([batch_id], publish_row)?;
        rows.map(|row| row.map_err(Into::into)).collect()
    }

    /// 一批的汇总：状态取最差的，条数相加。
    pub fn plan_batch_summary(&self, batch_id: i64) -> Result<Option<PublishRecord>> {
        Ok(summarize(self.plan_batch(batch_id)?))
    }

    fn last_batch_id(&self) -> Result<Option<i64>> {
        self.conn
            .query_row(
                "SELECT id FROM training_plan_publishes
                 WHERE kind != 'revoked' AND (batch_id IS NULL OR batch_id = id)
                 ORDER BY id DESC LIMIT 1",
                [],
                |row| row.get(0),
            )
            .optional()
            .map_err(Into::into)
    }

    pub fn plan_overview(&self, today: NaiveDate) -> Result<PlanOverview> {
        let window = Window::starting(today);
        let (sent, mut uncertain) = self.sent_for_window(window)?;
        let active = self.active_plan_workouts(today)?;
        let weeks = self.week_statuses(today, &active)?;
        uncertain |= weeks.iter().any(|week| week.state == WeekState::Uncertain);
        let last_batch = match self.last_batch_id()? {
            Some(id) => self.plan_batch(id)?,
            None => Vec::new(),
        };
        Ok(PlanOverview {
            window,
            sent,
            planned: active.into_iter().map(|item| item.workout).collect(),
            uncertain,
            last_publish: summarize(last_batch.clone()),
            last_batch,
            weeks,
            can_undo: self.last_undoable_publish()?.is_some(),
        })
    }

    /// 草稿发出去会变成什么样。不写库。
    pub fn preview_plan_draft(&self, id: &str, today: NaiveDate) -> Result<DraftPreview> {
        let draft = self
            .plan_draft(id)?
            .ok_or_else(|| plan_error("err.training_plan.draft_not_found", "找不到这份计划草稿"))?;
        let check = check_plan(&draft.document, self.plan_context(today)?);
        let window = Window::starting(today);
        let active: Vec<Workout> = self
            .active_plan_workouts(today)?
            .into_iter()
            .map(|item| item.workout)
            .collect();
        // 「之前」以账本上发过去的为准（每个窗口都推，所以每个窗口都查账本）。
        let mut before: Vec<Workout> = Vec::new();
        for chunk in publish::horizon(today) {
            before.extend(self.sent_for_window(chunk)?.0);
        }
        let after: Vec<Workout> = match (check.from, check.to) {
            (Some(from), Some(to)) if check.publishable() => active
                .iter()
                .filter(|w| w.date < from || w.date > to)
                .cloned()
                .chain(check.workouts.iter().cloned())
                .collect(),
            _ => active.clone(),
        };
        let last = check.to.map_or(window.end(), |to| to.max(window.end()));
        let mut days = Vec::new();
        let mut start = today;
        while start <= last {
            let chunk = Window::starting(start);
            days.extend(
                preview(chunk, &before, &after)
                    .into_iter()
                    .filter(|d| d.date <= last),
            );
            start = chunk.end() + chrono::Duration::days(1);
        }
        for day in &mut days {
            day.rest = check.rest.iter().find(|r| r.date == day.date).cloned();
        }
        Ok(DraftPreview {
            check,
            window,
            days,
        })
    }

    fn active_ids_between(&self, from: NaiveDate, to: NaiveDate) -> Result<Vec<i64>> {
        let mut statement = self.conn.prepare(
            "SELECT id FROM training_plan_workouts
             WHERE active = 1 AND workout_date >= ?1 AND workout_date <= ?2 ORDER BY id",
        )?;
        let rows = statement.query_map([from.to_string(), to.to_string()], |row| row.get(0))?;
        rows.map(|row| row.map_err(Into::into)).collect()
    }

    fn set_active(&self, ids: &[i64], active: bool) -> Result<()> {
        let mut statement = self
            .conn
            .prepare("UPDATE training_plan_workouts SET active = ?2 WHERE id = ?1")?;
        for id in ids {
            statement.execute(params![id, i64::from(active)])?;
        }
        Ok(())
    }

    /// 用户断开了官方授权：官方会删掉全部已同步的计划（不能再发空数组）。
    /// 本地停用全部生效计划，并记一行 `revoked`，之前的推送不再算「在手表上」。
    pub fn forget_plans_after_revoke(&self, today: NaiveDate) -> Result<()> {
        let transaction = self.conn.unchecked_transaction()?;
        let now = Utc::now().to_rfc3339();
        let active: Vec<i64> = {
            let mut statement = self
                .conn
                .prepare("SELECT id FROM training_plan_workouts WHERE active = 1")?;
            let rows = statement.query_map([], |row| row.get(0))?;
            rows.collect::<std::result::Result<_, _>>()?
        };
        self.set_active(&active, false)?;
        self.conn.execute(
            "INSERT INTO training_plan_publishes
                (kind, window_start, body, deactivated, state, created_at, finished_at)
             VALUES('revoked', ?1, 'null', ?2, 'sent', ?3, ?3)",
            params![today.to_string(), ids_json(&active), now],
        )?;
        transaction.commit()?;
        Ok(())
    }
}

const PUBLISH_COLUMNS: &str = "SELECT id, kind, window_start, window_ids, state, http_status,
        error_code, undone, created_at, finished_at, COALESCE(batch_id, id),
        COALESCE(role, 'window') FROM training_plan_publishes";

fn publish_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<PublishRecord> {
    Ok(PublishRecord {
        id: row.get(0)?,
        batch_id: row.get(10)?,
        kind: row.get(1)?,
        role: row.get(11)?,
        window_start: row.get(2)?,
        workout_count: ids_from(&row.get::<_, String>(3)?).len(),
        state: row.get(4)?,
        http_status: row
            .get::<_, Option<i64>>(5)?
            .and_then(|v| u16::try_from(v).ok()),
        error_code: row.get(6)?,
        undone: row.get::<_, i64>(7)? != 0,
        created_at: row.get(8)?,
        finished_at: row.get(9)?,
    })
}

/// 一批的汇总行：编号、类型、撤销标记取批里第一行，状态取最差的，条数相加。
fn summarize(rows: Vec<PublishRecord>) -> Option<PublishRecord> {
    let mut head = rows.first()?.clone();
    let has = |state: &str| rows.iter().any(|row| row.state == state);
    head.state = if has("pending") {
        "pending"
    } else if has("unknown") {
        "unknown"
    } else if rows.iter().all(|row| row.state == "rejected") {
        "rejected"
    } else if has("rejected") {
        "partial"
    } else {
        "sent"
    }
    .into();
    head.workout_count = rows.iter().map(|row| row.workout_count).sum();
    head.window_start = rows
        .iter()
        .map(|row| row.window_start.clone())
        .min()
        .unwrap_or_default();
    let failed = rows
        .iter()
        .find(|row| matches!(row.state.as_str(), "rejected" | "unknown"));
    head.error_code = failed.and_then(|row| row.error_code.clone());
    head.http_status = failed.and_then(|row| row.http_status);
    head.finished_at = if has("pending") {
        None
    } else {
        rows.iter().filter_map(|row| row.finished_at.clone()).max()
    };
    Some(head)
}

fn draft_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Result<PlanDraft>> {
    let document: String = row.get(3)?;
    Ok((|| {
        Ok(PlanDraft {
            id: row.get(0)?,
            origin: DraftOrigin::parse(&row.get::<_, String>(1)?),
            status: row.get(2)?,
            document: serde_json::from_str(&document)?,
            created_at: row.get(4)?,
            updated_at: row.get(5)?,
        })
    })())
}
