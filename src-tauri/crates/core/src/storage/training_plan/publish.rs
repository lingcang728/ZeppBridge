//! 发布引擎：按天推算「上次发过去的」，算出这次要推哪几个窗口、怎么推，记结果。
//!
//! 服务端的语义是**逐天替换**：推一个窗口 `[s, s+6]`，ZeppBridge 名下这 7 天整体换成
//! 报文里的训练，别的日子不动。窗口每天都从「今天」重新切，所以账本按天算：某一天
//! 上次发过去的是什么，取覆盖这一天的最近一行（`sent` / `unknown` / `pending`）。
//!
//! 一次推送（一批）的顺序：从最远的窗口往今天推。窗口要变空时：
//!
//! - 当前窗口（从今天起）：发 `[]`（它只清今天起 7 天，正好就是这个窗口）；
//! - 未来窗口：发占位报文（`v2::clear_future_window`），占位落在窗口前一天，所以
//!   **紧接着重推前一个窗口**把占位覆盖掉。前一个窗口如果也是空的，就按同样的规则
//!   继续往前，直到当前窗口。
//!
//! 占位行在账本里也记着「窗口前一天有一条占位」：重推前一个窗口没送达时，那一天
//! 就和生效计划对不上，界面标「不确定」，滚动推送会再推一次把它覆盖掉。

use super::{
    ids_from, ids_json, plan_error, Database, PendingSend, Prepared, PublishRequest, SendOutcome,
    SendRole, UndoTarget, WeekState, WeekStatus,
};
use crate::models::error::Result;
use crate::training_plan::v2::{clear_future_window, window_body, NumberedWorkout, WatchLocale};
use crate::training_plan::window::Window;
use crate::training_plan::{check_plan, Workout, MAX_DAYS_AHEAD, WINDOW_DAYS};
use chrono::{Duration, NaiveDate, Utc};
use rusqlite::{params, OptionalExtension};
use std::collections::BTreeMap;

/// 占位训练的 `workoutId` 从这里起（加上它那一行的账本编号）。真实训练的编号是
/// `training_plan_workouts` 的行号，到不了十亿；仍在 32 位整数以内。
pub const PLACEHOLDER_ID_BASE: i64 = 1_000_000_000;

/// 发到手表的描述里子类型用哪种语言写：发布时界面的语言，滚动推送沿用上一次的。
const WATCH_LOCALE_KEY: &str = "training_plan_watch_locale";

/// 从今天起按 7 天切的全部窗口，覆盖到计划最远能排的那一天。
pub(super) fn horizon(today: NaiveDate) -> Vec<Window> {
    let last = today + Duration::days(MAX_DAYS_AHEAD);
    let mut windows = Vec::new();
    let mut start = today;
    while start <= last {
        windows.push(Window::starting(start));
        start += Duration::days(WINDOW_DAYS);
    }
    windows
}

/// 一个窗口里每一天上次发过去的训练编号（按账本）。
struct SentDays {
    days: BTreeMap<NaiveDate, Vec<i64>>,
    /// 决定这几天的那几行里有结果不确定的。
    uncertain: bool,
}

impl SentDays {
    fn real_count(&self) -> usize {
        self.days
            .values()
            .flatten()
            .filter(|id| **id < PLACEHOLDER_ID_BASE)
            .count()
    }
}

/// 生效计划在一个窗口里每一天的训练编号。
fn target_days(window: Window, active: &[NumberedWorkout]) -> BTreeMap<NaiveDate, Vec<i64>> {
    let mut days: BTreeMap<NaiveDate, Vec<i64>> =
        window.days().map(|day| (day, Vec::new())).collect();
    for item in active {
        if let Some(list) = days.get_mut(&item.workout.date) {
            list.push(item.id);
        }
    }
    for list in days.values_mut() {
        list.sort_unstable();
    }
    days
}

/// 这个窗口这次要不要推，推完会不会是空的，账本上原来有没有真训练。
struct WindowPlan {
    window: Window,
    differs: bool,
    target_empty: bool,
    had_real: bool,
}

impl Database {
    pub(super) fn watch_locale(&self) -> Result<WatchLocale> {
        Ok(self
            .get_app_meta(WATCH_LOCALE_KEY)?
            .map(|tag| WatchLocale::from_tag(&tag))
            .unwrap_or_default())
    }

    /// 记下用户发布时的界面语言，描述第一行的子类型按它写。
    pub fn set_plan_watch_locale(&self, tag: &str) -> Result<()> {
        self.set_app_meta(WATCH_LOCALE_KEY, WatchLocale::from_tag(tag).tag())
    }

    /// 这些行存的训练原文（按编号顺序）。
    fn workout_texts(&self, ids: &[i64]) -> Result<Vec<(i64, String)>> {
        let mut statement = self
            .conn
            .prepare("SELECT workout FROM training_plan_workouts WHERE id = ?1")?;
        let mut out = Vec::with_capacity(ids.len());
        for id in ids {
            if let Some(text) = statement
                .query_row([id], |row| row.get::<_, String>(0))
                .optional()?
            {
                out.push((*id, text));
            }
        }
        Ok(out)
    }

    fn workout_dates(&self, ids: &[i64]) -> Result<Vec<(i64, NaiveDate)>> {
        let mut statement = self
            .conn
            .prepare("SELECT workout_date FROM training_plan_workouts WHERE id = ?1")?;
        let mut out = Vec::with_capacity(ids.len());
        for id in ids {
            let date: Option<String> = statement.query_row([id], |row| row.get(0)).optional()?;
            if let Some(date) = date.and_then(|d| NaiveDate::parse_from_str(&d, "%Y-%m-%d").ok()) {
                out.push((*id, date));
            }
        }
        Ok(out)
    }

    fn sent_days(&self, window: Window) -> Result<SentDays> {
        let earliest = window.start - Duration::days(WINDOW_DAYS - 1);
        // 占位落在窗口前一天，所以从下一个窗口起点开始的占位行也会碰到这个窗口。
        let latest = window.end() + Duration::days(1);
        let mut statement = self.conn.prepare(
            "SELECT id, window_start, window_ids, state, COALESCE(role, 'window')
             FROM training_plan_publishes
             WHERE state IN ('sent', 'unknown', 'pending') AND body != 'null'
               AND window_start >= ?1 AND window_start <= ?2
               AND id > COALESCE((SELECT MAX(id) FROM training_plan_publishes
                                  WHERE kind = 'revoked'), 0)
             ORDER BY id DESC",
        )?;
        let rows = statement
            .query_map(params![earliest.to_string(), latest.to_string()], |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                ))
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        let mut days: BTreeMap<NaiveDate, Vec<i64>> = BTreeMap::new();
        let mut uncertain = false;
        for (id, start, ids, state, role) in rows {
            let Ok(start) = NaiveDate::parse_from_str(&start, "%Y-%m-%d") else {
                continue;
            };
            let covered = Window::starting(start);
            let placeholder_day =
                (role == SendRole::Placeholder.as_str()).then(|| start - Duration::days(1));
            let open: Vec<NaiveDate> = window
                .days()
                .filter(|day| {
                    !days.contains_key(day)
                        && (covered.contains(*day) || Some(*day) == placeholder_day)
                })
                .collect();
            if open.is_empty() {
                continue;
            }
            if state != "sent" {
                uncertain = true;
            }
            let dated = self.workout_dates(&ids_from(&ids))?;
            for day in open {
                let mut list: Vec<i64> = dated
                    .iter()
                    .filter(|(_, date)| *date == day && covered.contains(day))
                    .map(|(id, _)| *id)
                    .collect();
                if Some(day) == placeholder_day {
                    // 占位还在那一天上：后面没有别的推送覆盖它。
                    list.push(PLACEHOLDER_ID_BASE + id);
                    uncertain = true;
                }
                list.sort_unstable();
                days.insert(day, list);
            }
        }
        for day in window.days() {
            days.entry(day).or_default();
        }
        Ok(SentDays { days, uncertain })
    }

    /// 某个窗口里，按账本上次发过去的训练，以及决定它的推送里有没有不确定的。
    pub(super) fn sent_for_window(&self, window: Window) -> Result<(Vec<Workout>, bool)> {
        let sent = self.sent_days(window)?;
        let ids: Vec<i64> = sent
            .days
            .values()
            .flatten()
            .copied()
            .filter(|id| *id < PLACEHOLDER_ID_BASE)
            .collect();
        let mut workouts = self.workouts_by_ids(&ids)?;
        workouts.sort_by_key(|w| w.date);
        Ok((workouts, sent.uncertain))
    }

    pub(super) fn week_statuses(
        &self,
        today: NaiveDate,
        active: &[NumberedWorkout],
    ) -> Result<Vec<WeekStatus>> {
        let mut weeks = Vec::new();
        for window in horizon(today) {
            let target = target_days(window, active);
            let sent = self.sent_days(window)?;
            let planned: usize = target.values().map(Vec::len).sum();
            let sent_count = sent.real_count();
            if planned == 0 && sent_count == 0 && !sent.uncertain {
                continue;
            }
            let state = if target != sent.days {
                WeekState::NotSent
            } else if sent.uncertain {
                WeekState::Uncertain
            } else {
                WeekState::InSync
            };
            let error_code = if state == WeekState::InSync {
                None
            } else {
                self.conn
                    .query_row(
                        "SELECT error_code FROM training_plan_publishes
                         WHERE state IN ('rejected', 'unknown') AND error_code IS NOT NULL
                           AND window_start >= ?1 AND window_start <= ?2
                         ORDER BY id DESC LIMIT 1",
                        params![
                            (window.start - Duration::days(WINDOW_DAYS - 1)).to_string(),
                            window.end().to_string()
                        ],
                        |row| row.get(0),
                    )
                    .optional()?
            };
            weeks.push(WeekStatus {
                start: window.start,
                planned,
                sent: sent_count,
                state,
                error_code,
            });
        }
        Ok(weeks)
    }

    /// 只能撤最近的那一批发布 / 清空 / 撤销，而且它之后没有别的；整批都被拒的不算。
    /// 撤权之后没有可撤销的：官方已经删光了。
    pub(super) fn last_undoable_publish(&self) -> Result<Option<UndoTarget>> {
        let row = self
            .conn
            .query_row(
                "SELECT h.id, h.activated, h.deactivated, h.undone, h.kind,
                        EXISTS(SELECT 1 FROM training_plan_publishes b
                               WHERE COALESCE(b.batch_id, b.id) = h.id
                                 AND b.state IN ('sent', 'unknown'))
                 FROM training_plan_publishes h
                 WHERE h.kind IN ('publish', 'clear', 'undo', 'revoked')
                   AND (h.batch_id IS NULL OR h.batch_id = h.id)
                 ORDER BY h.id DESC LIMIT 1",
                [],
                |row| {
                    let undoable = row.get::<_, i64>(3)? == 0
                        && row.get::<_, String>(4)? != "revoked"
                        && row.get::<_, bool>(5)?;
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

    /// 改好生效计划、记下要发的每个窗口。见文件头。
    ///
    /// `confirm_clear`：这次会把发过训练的窗口变空时，用户已经确认过清空。
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
        let current = Window::starting(today);
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
                let replaced = self.active_ids_between(from, to)?;
                // 和原来一模一样的训练（发出后再改、只动了其中几天）沿用原来那一行：编号不变，
                // 账本上这几天就和上次发过去的一致，没动过的那几周不用重推。
                let mut keep: Vec<(i64, String)> = self.workout_texts(&replaced)?;
                let mut kept: Vec<i64> = Vec::new();
                for workout in &check.workouts {
                    let text = serde_json::to_string(workout)?;
                    if let Some(at) = keep.iter().position(|(_, old)| *old == text) {
                        kept.push(keep.remove(at).0);
                        continue;
                    }
                    self.conn.execute(
                        "INSERT INTO training_plan_workouts(draft_id, workout_date, workout, active, created_at)
                         VALUES(?1, ?2, ?3, 1, ?4)",
                        params![id, workout.date.to_string(), text, now],
                    )?;
                    activated.push(self.conn.last_insert_rowid());
                }
                deactivated = replaced
                    .into_iter()
                    .filter(|old| !kept.contains(old))
                    .collect();
                self.set_active(&deactivated, false)?;
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
                deactivated = self.active_ids_between(current.start, current.end())?;
                self.set_active(&deactivated, false)?;
            }
            PublishRequest::Roll => {}
        }

        let active = self.active_plan_workouts(today)?;
        let mut plans = Vec::new();
        for window in horizon(today) {
            let target = target_days(window, &active);
            let sent = self.sent_days(window)?;
            plans.push(WindowPlan {
                window,
                differs: target != sent.days,
                target_empty: target.values().all(Vec::is_empty),
                had_real: sent.real_count() > 0,
            });
        }
        let roll = matches!(request, PublishRequest::Roll);
        let clears_real = plans
            .iter()
            .any(|plan| plan.differs && plan.target_empty && plan.had_real);
        if clears_real && !roll && !confirm_clear {
            return Ok(Prepared::NeedsClearConfirmation);
        }

        // 从最远的窗口往今天排。自动的滚动推送不清空任何窗口。
        let mut must: Vec<bool> = plans
            .iter()
            .map(|plan| plan.differs && !(roll && plan.target_empty))
            .collect();
        if matches!(request, PublishRequest::Clear) {
            // 用户确认过的清空：账本说空的也照发一次，服务端和账本对不上时以它对齐。
            must[0] = true;
        }
        let mut order: Vec<(Window, SendRole)> = Vec::new();
        for k in (0..plans.len()).rev() {
            if !must[k] {
                continue;
            }
            let plan = &plans[k];
            let role = if !plan.target_empty {
                SendRole::Window
            } else if k == 0 {
                SendRole::Clear
            } else {
                // 占位落在前一个窗口里，前一个窗口必须紧接着重推。
                must[k - 1] = true;
                SendRole::Placeholder
            };
            order.push((plan.window, role));
        }
        if order.is_empty() {
            return self.record_not_needed(request, draft_id, current, &activated, &deactivated);
        }

        let locale = self.watch_locale()?;
        let mut sends = Vec::with_capacity(order.len());
        let mut batch_id: Option<i64> = None;
        for (window, role) in order {
            let window_ids: Vec<i64> = match role {
                SendRole::Window => active
                    .iter()
                    .filter(|item| window.contains(item.workout.date))
                    .map(|item| item.id)
                    .collect(),
                SendRole::Clear | SendRole::Placeholder => Vec::new(),
            };
            // 翻了哪些行、来自哪份草稿，只记在这一批的第一行上。
            let head = batch_id.is_none();
            self.conn.execute(
                "INSERT INTO training_plan_publishes
                    (kind, draft_id, window_start, window_ids, body, activated, deactivated,
                     state, created_at, batch_id, role)
                 VALUES(?1, ?2, ?3, ?4, '{}', ?5, ?6, 'pending', ?7, ?8, ?9)",
                params![
                    request.kind(),
                    draft_id,
                    window.start.to_string(),
                    ids_json(&window_ids),
                    ids_json(if head { &activated } else { &[] }),
                    ids_json(if head { &deactivated } else { &[] }),
                    now,
                    batch_id,
                    role.as_str(),
                ],
            )?;
            let publish_id = self.conn.last_insert_rowid();
            let batch = *batch_id.get_or_insert(publish_id);
            let body = match role {
                SendRole::Window => window_body(window, &active, locale),
                SendRole::Clear => window_body(window, &[], locale),
                SendRole::Placeholder => {
                    clear_future_window(window, PLACEHOLDER_ID_BASE + publish_id)
                }
            };
            self.conn.execute(
                "UPDATE training_plan_publishes SET body = ?2, batch_id = ?3 WHERE id = ?1",
                params![publish_id, serde_json::to_string(&body)?, batch],
            )?;
            sends.push(PendingSend {
                publish_id,
                window_start: window.start,
                role,
                body,
            });
        }
        Ok(Prepared::Send {
            batch_id: batch_id.unwrap_or_default(),
            sends,
        })
    }

    /// 生效计划改了、但没有窗口要重发（每个窗口的内容都和上次发过去的一样）。
    /// 发布和撤销仍要记一行（状态直接是 `sent`、报文是 `null`），撤销才找得到它；
    /// 推算「发过去的是什么」时不看这种行。
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
        self.conn.execute(
            "INSERT INTO training_plan_publishes
                (kind, draft_id, window_start, window_ids, body, activated, deactivated, state,
                 created_at, finished_at, role)
             VALUES(?1, ?2, ?3, '[]', 'null', ?4, ?5, 'sent', ?6, ?6, 'window')",
            params![
                request.kind(),
                draft_id,
                window.start.to_string(),
                ids_json(activated),
                ids_json(deactivated),
                now
            ],
        )?;
        self.conn.execute(
            "UPDATE training_plan_publishes SET batch_id = id WHERE id = ?1",
            [self.conn.last_insert_rowid()],
        )?;
        Ok(Prepared::NotNeeded)
    }

    /// 记下一个窗口的发送结果。整批都有了结果、而且一个窗口都没生效（全被拒）时，
    /// 把这一批的改动原样翻回去，草稿回到「未发」。有的窗口送到了就不翻：生效计划
    /// 保持新的，没送到的那几周界面标出来，滚动推送会补。
    pub fn finish_plan_publish(&self, publish_id: i64, outcome: &SendOutcome) -> Result<()> {
        let transaction = self.conn.unchecked_transaction()?;
        let now = Utc::now().to_rfc3339();
        let row: Option<(String, i64)> = self
            .conn
            .query_row(
                "SELECT state, COALESCE(batch_id, id) FROM training_plan_publishes WHERE id = ?1",
                [publish_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()?;
        let Some((state, batch_id)) = row else {
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
                self.conn.execute(
                    "UPDATE training_plan_publishes SET state = 'rejected', http_status = ?2,
                        error_code = ?3, finished_at = ?4 WHERE id = ?1",
                    params![publish_id, http_status, error_code, now],
                )?;
            }
        }
        let (pending, effective): (i64, i64) = self.conn.query_row(
            "SELECT COALESCE(SUM(state = 'pending'), 0), COALESCE(SUM(state IN ('sent', 'unknown')), 0)
             FROM training_plan_publishes WHERE COALESCE(batch_id, id) = ?1",
            [batch_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )?;
        if pending == 0 && effective == 0 {
            self.roll_back_batch(batch_id, &now)?;
        }
        if pending == 0 {
            self.exchange_publish(batch_id)?;
        }
        transaction.commit()?;
        Ok(())
    }

    fn roll_back_batch(&self, batch_id: i64, now: &str) -> Result<()> {
        let (kind, draft_id, activated, deactivated): (String, Option<String>, String, String) =
            self.conn.query_row(
                "SELECT kind, draft_id, activated, deactivated FROM training_plan_publishes
                 WHERE id = ?1",
                [batch_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )?;
        self.set_active(&ids_from(&activated), false)?;
        self.set_active(&ids_from(&deactivated), true)?;
        if kind == "undo" {
            // 撤销被拒：被撤的那一批恢复成「未撤销」。
            self.conn.execute(
                "UPDATE training_plan_publishes SET undone = 0
                 WHERE id = (SELECT MAX(id) FROM training_plan_publishes
                             WHERE id < ?1 AND undone = 1)",
                [batch_id],
            )?;
        }
        if let Some(draft_id) = draft_id {
            self.conn.execute(
                "UPDATE training_plan_drafts SET status = 'open', updated_at = ?2 WHERE id = ?1",
                params![draft_id, now],
            )?;
        }
        Ok(())
    }
}
