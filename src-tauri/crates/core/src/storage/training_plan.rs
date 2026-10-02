//! 训练计划的草稿与发布账本。
//!
//! 官方没有读取接口，所以这里是「手表上现在有什么」的唯一来源，规矩是：
//!
//! - **先记账再发请求**：[`Database::prepare_plan_publish`] 在一个事务里改好生效
//!   计划、写下要发的整窗报文（状态 `pending`），然后调用方才去发；发完由
//!   [`Database::finish_plan_publish`] 补上结果。进程在中间被杀，留下的 `pending`
//!   按「不确定有没有到」对待，不当成功。
//! - **训练行只增不改**：换计划只翻 `active`，每次推送记下自己翻了哪些行，撤销就是
//!   原样翻回去再推一次。
//! - **空窗口只在用户确认后发**：空数组在官方那边是「清掉服务端从现在起 7 天」。
//!   自动的滚动推送永远不发空窗口。

use super::Database;
use crate::models::{error::Result, ZeppBridgeError};
use crate::training_plan::v2::{window_body, NumberedWorkout};
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
    /// 把一份草稿变成生效计划并推送当前窗口。
    Draft { id: String },
    /// 每天的滚动推送：生效计划不变，只把窗口往前挪一天。内容没变或窗口为空就不发。
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

/// 准备的结果。只有 `Send` 会在账本里留下一行 `pending`。
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "snake_case", tag = "outcome")]
pub enum Prepared {
    /// 去发吧：`body` 就是要 POST 的报文，发完拿 `publish_id` 回来记结果。
    Send { publish_id: i64, body: Value },
    /// 不用发：窗口内容和上次发过去的一样，或者这次改的日子都还没进窗口
    /// （生效计划已经改好，以后滚动推送时再发）。
    NotNeeded,
    /// 这次会把窗口变空，而上次发过去的窗口里有训练：要发空数组，必须用户确认。
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
    /// 官方明确拒绝（4xx）：这次推送没有生效，账本里的改动要翻回去。
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
    pub kind: String,
    pub window_start: String,
    pub workout_count: usize,
    /// `pending` / `sent` / `rejected` / `unknown`。
    pub state: String,
    pub http_status: Option<u16>,
    pub error_code: Option<String>,
    pub undone: bool,
    pub created_at: String,
    pub finished_at: Option<String>,
}

/// 按账本推算的「上次发到手表的」与生效计划。
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct PlanOverview {
    pub window: Window,
    /// 当前窗口里，按账本上次发过去的训练。
    pub sent: Vec<Workout>,
    /// 生效计划里今天及以后的全部训练（含还没进窗口、以后滚动推送的）。
    pub planned: Vec<Workout>,
    /// 最近一次推送结果不确定（断网、超时、进程中断），`sent` 可能和手表上不一致。
    pub uncertain: bool,
    pub last_publish: Option<PublishRecord>,
    pub can_undo: bool,
}

/// 草稿的预览：校验结果 + 逐日的「发之前 / 发之后」。
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct DraftPreview {
    pub check: PlanCheck,
    pub window: Window,
    /// 从今天到 `max(窗口末日, 草稿末日)` 的逐日对比；窗口外的日子以后滚动推送。
    pub days: Vec<DayPreview>,
}

/// 可以撤销的那次推送，以及它翻过的行。
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
        self.conn.execute(
            "INSERT INTO training_plan_drafts(id, origin, document, status, created_at, updated_at)
             VALUES(?1, ?2, ?3, 'open', ?4, ?4)",
            params![id, origin.as_str(), serde_json::to_string(document)?, now],
        )?;
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

    /// 某一天上次发过去的是什么：取窗口覆盖这一天的、最近一次已送达或不确定的推送。
    /// 撤权之后的推送才算（撤权会让官方删掉全部已同步的计划）。
    fn sent_for_window(&self, window: Window) -> Result<(Vec<Workout>, bool)> {
        let earliest = window.start - chrono::Duration::days(crate::training_plan::WINDOW_DAYS - 1);
        let mut statement = self.conn.prepare(
            "SELECT window_start, window_ids, state FROM training_plan_publishes
             WHERE state IN ('sent', 'unknown', 'pending')
               AND window_start >= ?1 AND window_start <= ?2
               AND id > COALESCE((SELECT MAX(id) FROM training_plan_publishes
                                  WHERE kind = 'revoked'), 0)
             ORDER BY id DESC",
        )?;
        let rows = statement.query_map(
            params![earliest.to_string(), window.end().to_string()],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                ))
            },
        )?;
        let mut sent = Vec::new();
        let mut uncertain = false;
        let mut decided = std::collections::BTreeSet::new();
        for row in rows {
            let (start, ids, state) = row?;
            let Ok(start) = NaiveDate::parse_from_str(&start, "%Y-%m-%d") else {
                continue;
            };
            let covered = Window::starting(start);
            let open_days: Vec<NaiveDate> = window
                .days()
                .filter(|day| covered.contains(*day) && !decided.contains(day))
                .collect();
            if open_days.is_empty() {
                continue;
            }
            if state != "sent" {
                uncertain = true;
            }
            for workout in self.workouts_by_ids(&ids_from(&ids))? {
                if open_days.contains(&workout.date) {
                    sent.push(workout);
                }
            }
            decided.extend(open_days);
        }
        sent.sort_by_key(|w| w.date);
        Ok((sent, uncertain))
    }

    fn last_undoable_publish(&self) -> Result<Option<UndoTarget>> {
        // 只能撤最近的那一次发布 / 清空 / 撤销，而且它之后没有别的。撤权之后没有
        // 可撤销的：官方已经删光了。
        let row = self
            .conn
            .query_row(
                "SELECT id, activated, deactivated, undone, state, kind
                 FROM training_plan_publishes
                 WHERE kind IN ('publish', 'clear', 'undo', 'revoked')
                 ORDER BY id DESC LIMIT 1",
                [],
                |row| {
                    let undoable = row.get::<_, i64>(3)? == 0
                        && row.get::<_, String>(5)? != "revoked"
                        && matches!(row.get::<_, String>(4)?.as_str(), "sent" | "unknown");
                    Ok(undoable.then(|| -> rusqlite::Result<UndoTarget> {
                        Ok(UndoTarget {
                            id: row.get(0)?,
                            activated: ids_from(&row.get::<_, String>(1)?),
                            deactivated: ids_from(&row.get::<_, String>(2)?),
                        })
                    }))
                },
            )
            .optional()?;
        Ok(row.flatten().transpose()?)
    }

    fn last_publish_record(&self) -> Result<Option<PublishRecord>> {
        self.conn
            .query_row(
                &format!("{PUBLISH_COLUMNS} WHERE kind != 'revoked' ORDER BY id DESC LIMIT 1"),
                [],
                publish_row,
            )
            .optional()
            .map_err(Into::into)
    }

    pub fn plan_publishes(&self, limit: usize) -> Result<Vec<PublishRecord>> {
        let mut statement = self
            .conn
            .prepare(&format!("{PUBLISH_COLUMNS} ORDER BY id DESC LIMIT ?1"))?;
        let rows = statement.query_map([limit.clamp(1, 200) as i64], publish_row)?;
        rows.map(|row| row.map_err(Into::into)).collect()
    }

    pub fn plan_overview(&self, today: NaiveDate) -> Result<PlanOverview> {
        let window = Window::starting(today);
        let (sent, uncertain) = self.sent_for_window(window)?;
        let planned = self
            .active_plan_workouts(today)?
            .into_iter()
            .map(|item| item.workout)
            .collect();
        Ok(PlanOverview {
            window,
            sent,
            planned,
            uncertain,
            last_publish: self.last_publish_record()?,
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
        let (sent, _) = self.sent_for_window(window)?;
        let active: Vec<Workout> = self
            .active_plan_workouts(today)?
            .into_iter()
            .map(|item| item.workout)
            .collect();
        // 窗口里的「之前」以账本上发过去的为准；窗口外的是排着、还没发的生效计划。
        let before: Vec<Workout> = sent
            .into_iter()
            .chain(active.iter().filter(|w| !window.contains(w.date)).cloned())
            .collect();
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
        Ok(DraftPreview {
            check,
            window,
            days,
        })
    }

    /// 改好生效计划、记下要发的报文。见文件头。
    ///
    /// `confirm_clear`：这次会发空窗口时，用户已经确认过清空。
    pub fn prepare_plan_publish(
        &self,
        request: &PublishRequest,
        today: NaiveDate,
        confirm_clear: bool,
    ) -> Result<Prepared> {
        let transaction = self.conn.unchecked_transaction()?;
        let prepared = self.prepare_in_transaction(request, today, confirm_clear)?;
        if matches!(prepared, Prepared::Send { .. } | Prepared::NotNeeded) {
            transaction.commit()?;
        }
        // 其余结果什么都不留：transaction 在这里 drop，回滚。
        Ok(prepared)
    }

    fn prepare_in_transaction(
        &self,
        request: &PublishRequest,
        today: NaiveDate,
        confirm_clear: bool,
    ) -> Result<Prepared> {
        let now = Utc::now().to_rfc3339();
        let window = Window::starting(today);
        let mut activated: Vec<i64> = Vec::new();
        let mut deactivated: Vec<i64> = Vec::new();
        let mut draft_id: Option<String> = None;

        match request {
            PublishRequest::Draft { id } => {
                let draft = self.plan_draft(id)?.ok_or_else(|| {
                    plan_error("err.training_plan.draft_not_found", "找不到这份计划草稿")
                })?;
                if draft.status != "open" {
                    return Err(plan_error(
                        "err.training_plan.draft_closed",
                        "这份计划草稿已经发过或丢掉了",
                    ));
                }
                let check = check_plan(&draft.document, self.plan_context(today)?);
                let (Some(from), Some(to)) = (check.from, check.to) else {
                    return Ok(Prepared::Invalid { check });
                };
                if !check.publishable() {
                    return Ok(Prepared::Invalid { check });
                }
                deactivated = self.active_ids_between(from, to)?;
                self.set_active(&deactivated, false)?;
                for workout in &check.workouts {
                    self.conn.execute(
                        "INSERT INTO training_plan_workouts(draft_id, workout_date, workout, active, created_at)
                         VALUES(?1, ?2, ?3, 1, ?4)",
                        params![id, workout.date.to_string(), serde_json::to_string(workout)?, now],
                    )?;
                    activated.push(self.conn.last_insert_rowid());
                }
                self.conn.execute(
                    "UPDATE training_plan_drafts SET status = 'published', updated_at = ?2 WHERE id = ?1",
                    params![id, now],
                )?;
                draft_id = Some(id.clone());
            }
            PublishRequest::UndoLast => {
                let Some(UndoTarget {
                    id: publish_id,
                    activated: was_activated,
                    deactivated: was_deactivated,
                }) = self.last_undoable_publish()?
                else {
                    return Ok(Prepared::NothingToUndo);
                };
                self.set_active(&was_activated, false)?;
                self.set_active(&was_deactivated, true)?;
                self.conn.execute(
                    "UPDATE training_plan_publishes SET undone = 1 WHERE id = ?1",
                    [publish_id],
                )?;
                // 这次撤销本身也能再撤销：记下反方向的翻转。
                activated = was_deactivated;
                deactivated = was_activated;
            }
            PublishRequest::Clear => {
                if !confirm_clear {
                    return Ok(Prepared::NeedsClearConfirmation);
                }
                deactivated = self.active_ids_between(window.start, window.end())?;
                self.set_active(&deactivated, false)?;
            }
            PublishRequest::Roll => {}
        }

        let active = self.active_plan_workouts(today)?;
        let body = window_body(window, &active);
        let window_ids: Vec<i64> = active
            .iter()
            .filter(|item| window.contains(item.workout.date))
            .map(|item| item.id)
            .collect();
        let (sent, _) = self.sent_for_window(window)?;
        let last_same = self.last_sent_ids(window)?;

        if window_ids.is_empty() {
            let clearing = matches!(request, PublishRequest::Clear);
            if sent.is_empty() && !clearing {
                return self.record_not_needed(request, draft_id, window, &activated, &deactivated);
            }
            if matches!(request, PublishRequest::Roll) {
                // 自动推送永远不发空窗口。
                return Ok(Prepared::NotNeeded);
            }
            if !confirm_clear {
                return Ok(Prepared::NeedsClearConfirmation);
            }
        } else if last_same.as_deref() == Some(window_ids.as_slice()) {
            return self.record_not_needed(request, draft_id, window, &activated, &deactivated);
        }

        self.conn.execute(
            "INSERT INTO training_plan_publishes
                (kind, draft_id, window_start, window_ids, body, activated, deactivated, state, created_at)
             VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, 'pending', ?8)",
            params![
                request.kind(),
                draft_id,
                window.start.to_string(),
                ids_json(&window_ids),
                serde_json::to_string(&body)?,
                ids_json(&activated),
                ids_json(&deactivated),
                now
            ],
        )?;
        Ok(Prepared::Send {
            publish_id: self.conn.last_insert_rowid(),
            body,
        })
    }

    /// 生效计划改了、但窗口不用重发（改的日子还没进窗口，或窗口内容没变）。
    /// 发布和撤销仍要记一行（状态直接是 `sent`、窗口编号照旧），撤销才找得到它。
    fn record_not_needed(
        &self,
        request: &PublishRequest,
        draft_id: Option<String>,
        window: Window,
        activated: &[i64],
        deactivated: &[i64],
    ) -> Result<Prepared> {
        if activated.is_empty() && deactivated.is_empty() {
            return Ok(Prepared::NotNeeded);
        }
        let now = Utc::now().to_rfc3339();
        let window_ids = self.last_sent_ids(window)?.unwrap_or_default();
        self.conn.execute(
            "INSERT INTO training_plan_publishes
                (kind, draft_id, window_start, window_ids, body, activated, deactivated, state,
                 created_at, finished_at)
             VALUES(?1, ?2, ?3, ?4, 'null', ?5, ?6, 'sent', ?7, ?7)",
            params![
                request.kind(),
                draft_id,
                window.start.to_string(),
                ids_json(&window_ids),
                ids_json(activated),
                ids_json(deactivated),
                now
            ],
        )?;
        Ok(Prepared::NotNeeded)
    }

    /// 同一个窗口起点上次发出去的编号（只看送达的）。
    fn last_sent_ids(&self, window: Window) -> Result<Option<Vec<i64>>> {
        Ok(self
            .conn
            .query_row(
                "SELECT window_ids FROM training_plan_publishes
                 WHERE state = 'sent' AND window_start = ?1
                   AND id > COALESCE((SELECT MAX(id) FROM training_plan_publishes
                                      WHERE kind = 'revoked'), 0)
                 ORDER BY id DESC LIMIT 1",
                [window.start.to_string()],
                |row| row.get::<_, String>(0),
            )
            .optional()?
            .map(|text| ids_from(&text)))
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

    /// 记下发送结果。被官方明确拒绝时把这次的改动原样翻回去，草稿回到「未发」。
    pub fn finish_plan_publish(&self, publish_id: i64, outcome: &SendOutcome) -> Result<()> {
        let transaction = self.conn.unchecked_transaction()?;
        let now = Utc::now().to_rfc3339();
        let row: Option<(String, Option<String>, String, String)> = self
            .conn
            .query_row(
                "SELECT state, draft_id, activated, deactivated FROM training_plan_publishes
                 WHERE id = ?1",
                [publish_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )
            .optional()?;
        let Some((state, draft_id, activated, deactivated)) = row else {
            return Err(plan_error(
                "err.training_plan.publish_not_found",
                "找不到这次推送的记录",
            ));
        };
        if state != "pending" {
            return Ok(());
        }
        match outcome {
            SendOutcome::Delivered => {
                self.conn.execute(
                    "UPDATE training_plan_publishes SET state = 'sent', finished_at = ?2 WHERE id = ?1",
                    params![publish_id, now],
                )?;
            }
            SendOutcome::Unknown { error_code } => {
                self.conn.execute(
                    "UPDATE training_plan_publishes SET state = 'unknown', error_code = ?2,
                        finished_at = ?3 WHERE id = ?1",
                    params![publish_id, error_code, now],
                )?;
            }
            SendOutcome::Rejected {
                http_status,
                error_code,
            } => {
                self.set_active(&ids_from(&activated), false)?;
                self.set_active(&ids_from(&deactivated), true)?;
                // 撤销被拒：被撤的那次推送恢复成「未撤销」。
                self.conn.execute(
                    "UPDATE training_plan_publishes SET undone = 0
                     WHERE id = (SELECT MAX(id) FROM training_plan_publishes
                                 WHERE id < ?1 AND undone = 1)
                       AND (SELECT kind FROM training_plan_publishes WHERE id = ?1) = 'undo'",
                    [publish_id],
                )?;
                if let Some(draft_id) = draft_id {
                    self.conn.execute(
                        "UPDATE training_plan_drafts SET status = 'open', updated_at = ?2 WHERE id = ?1",
                        params![draft_id, now],
                    )?;
                }
                self.conn.execute(
                    "UPDATE training_plan_publishes SET state = 'rejected', http_status = ?2,
                        error_code = ?3, finished_at = ?4 WHERE id = ?1",
                    params![publish_id, http_status, error_code, now],
                )?;
            }
        }
        transaction.commit()?;
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
        error_code, undone, created_at, finished_at FROM training_plan_publishes";

fn publish_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<PublishRecord> {
    Ok(PublishRecord {
        id: row.get(0)?,
        kind: row.get(1)?,
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
