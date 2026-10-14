//! 发之前的全部校验。官方接口对任何 body 都回 success，所以这里是唯一的关口。
//!
//! 问题分三级：`error` 是写错了（日期不对、心率超过上限、缺目的或描述、发不到手表
//! 的运动），`unverified` 是写法没错、但我们还没在手表上核实过它会被正确显示（见
//! [`super::VERIFIED`]），`warning` 只是提醒（名字太长、手表列表里会被截断）。前两种
//! 挡发布，`warning` 不挡；预览照常给，界面按码说明是哪一种。
//!
//! 后端不出界面文案：每条问题带 `message_code`（`ui.training_plan.issue.*`）和
//! 填空用的 `params`，`message` 只是 CLI / MCP / 日志用的中文兜底。

use super::parse::{parse_duration, parse_target};
use super::{
    Activity, Intensity, PlanDocument, PlanStep, PlanWorkout, Sport, Step, StepLength, StepNode,
    Target, Variant, Workout, MAX_DAYS_AHEAD, VERIFIED, WATCH_NAME_CHARS,
};
use chrono::{Duration, NaiveDate};
use serde::Serialize;
use serde_json::{json, Value};

/// 校验要用到的外部事实。
#[derive(Debug, Clone, Copy)]
pub struct PlanContext {
    /// 用户本地的今天。早于今天的日期不让写（能不能写过去的日期没核实过，写了也没用）。
    pub today: NaiveDate,
    /// 用户的最大心率。没有就按 220 兜底——只拦明显写错的数字，不替用户定上限。
    pub max_hr: Option<u16>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Severity {
    Error,
    Unverified,
    /// 不挡发布的提醒。
    Warning,
}

impl Severity {
    pub fn blocks(self) -> bool {
        !matches!(self, Self::Warning)
    }
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct PlanIssue {
    pub severity: Severity,
    /// 第几条训练（从 0 起）；整份计划的问题为空。
    #[serde(skip_serializing_if = "Option::is_none")]
    pub workout: Option<usize>,
    /// 第几步，`"2"` 或重复组里的 `"2.1"`（从 1 起，和界面上数的一样）。
    #[serde(skip_serializing_if = "Option::is_none")]
    pub step: Option<String>,
    pub message: String,
    pub message_code: &'static str,
    pub params: Value,
}

/// 校验结果。`workouts` 只含整条都读懂了的训练；有任何阻断级的问题就不能发。
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct PlanCheck {
    pub summary: Option<String>,
    pub rest: Vec<super::RestDay>,
    pub from: Option<NaiveDate>,
    pub to: Option<NaiveDate>,
    pub workouts: Vec<Workout>,
    /// 日期读得懂、但没通过校验的训练：走路这类手表收不下的（`activity` 有值，带着
    /// `sport_not_deliverable`），以及缺目的、缺描述、步骤写错的。界面照原样显示（绝不画成
    /// 休息日、也不让它从周视图里消失），在单天页里就地补齐或改掉。
    pub held: Vec<HeldWorkout>,
    pub issues: Vec<PlanIssue>,
}

/// 一条还发不出去的训练，原样留着给界面显示和就地修改。
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct HeldWorkout {
    /// 草稿原文里第几条（从 0 起），界面据此就地删掉、改类型、补目的。
    pub index: usize,
    pub date: NaiveDate,
    /// 原文写的运动。
    pub sport: String,
    /// 写的是走路这类读得懂、但手表收不下的活动；能发的大类（只是缺东西）为空。
    #[serde(skip_serializing_if = "Option::is_none")]
    pub activity: Option<Activity>,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub focus: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// 步骤读得懂就带上（画时长用）；读不懂为空，不编。
    pub steps: Vec<StepNode>,
}

/// 没通过校验、但日期读得懂的训练，把它原样留下来（步骤只取读得懂的结构，不编）。
fn held_workout(index: usize, workout: &PlanWorkout, context: PlanContext) -> Option<HeldWorkout> {
    let activity = match Sport::parse(&workout.sport) {
        Some(_) => None,
        None => Activity::parse(&workout.sport),
    };
    let date = NaiveDate::parse_from_str(workout.date.trim(), "%Y-%m-%d").ok()?;
    // 步骤的问题已经在正式校验里报过了，这里只取读得懂的结构。
    let mut scratch = Issues { list: Vec::new() };
    let steps = check_steps(index, &workout.steps, context, &mut scratch).unwrap_or_default();
    let text = |value: &Option<String>| {
        value
            .as_deref()
            .map(str::trim)
            .filter(|text| !text.is_empty())
            .map(str::to_string)
    };
    Some(HeldWorkout {
        index,
        date,
        sport: workout.sport.trim().to_string(),
        activity,
        name: workout.name.trim().to_string(),
        focus: text(&workout.focus),
        description: text(&workout.description),
        steps,
    })
}

impl PlanCheck {
    pub fn publishable(&self) -> bool {
        !self.issues.iter().any(|issue| issue.severity.blocks())
            && self.from.is_some()
            && self.to.is_some()
    }
}

const MAX_NAME_CHARS: usize = 60;
/// 目的是个短词（「强化耐力」），写进描述第一行。
const MAX_FOCUS_CHARS: usize = 20;
const MAX_DESCRIPTION_CHARS: usize = 1000;
const MAX_LEAF_STEPS: usize = 40;
const MAX_REPEAT: u32 = 50;
const MIN_STEP_SECONDS: u32 = 10;
const MAX_STEP_SECONDS: u32 = 6 * 3600;
const MIN_STEP_METERS: u32 = 50;
const MAX_STEP_METERS: u32 = 100_000;
const MAX_WORKOUT_SECONDS: u64 = 8 * 3600;
const MIN_HR: u16 = 30;
const FALLBACK_MAX_HR: u16 = 220;
/// 配速每公里 2:00 到 20:00。
const PACE_RANGE: (u16, u16) = (120, 1200);
const MAX_POWER: u16 = 2000;

struct Issues {
    list: Vec<PlanIssue>,
}

impl Issues {
    /// 从第 `since` 条起有没有阻断级的问题。
    fn blocked_since(&self, since: usize) -> bool {
        self.list[since..]
            .iter()
            .any(|issue| issue.severity.blocks())
    }

    fn push(
        &mut self,
        severity: Severity,
        workout: Option<usize>,
        step: Option<String>,
        code: &'static str,
        message: impl Into<String>,
        params: Value,
    ) {
        self.list.push(PlanIssue {
            severity,
            workout,
            step,
            message: message.into(),
            message_code: code,
            params,
        });
    }
}

pub fn check_plan(document: &PlanDocument, context: PlanContext) -> PlanCheck {
    let mut issues = Issues { list: Vec::new() };
    let last_day = context.today + Duration::days(MAX_DAYS_AHEAD);

    let bound = |text: &Option<String>, issues: &mut Issues, which: &str| {
        let text = text.as_deref()?;
        match NaiveDate::parse_from_str(text.trim(), "%Y-%m-%d") {
            Ok(date) => Some(date),
            Err(_) => {
                issues.push(
                    Severity::Error,
                    None,
                    None,
                    "ui.training_plan.issue.bad_date",
                    format!("计划的{which}日期不是 YYYY-MM-DD：{text}"),
                    json!({ "value": text }),
                );
                None
            }
        }
    };
    let from = bound(&document.from, &mut issues, "开始");
    let to = bound(&document.to, &mut issues, "结束");
    if let (Some(from), Some(to)) = (from, to) {
        if from > to {
            issues.push(
                Severity::Error,
                None,
                None,
                "ui.training_plan.issue.range_reversed",
                "计划的开始日期晚于结束日期",
                json!({ "from": from.to_string(), "to": to.to_string() }),
            );
        }
    }
    for date in [from, to].into_iter().flatten() {
        check_day(date, context.today, last_day, None, &mut issues);
    }
    if document.workouts.is_empty() && (from.is_none() || to.is_none()) {
        issues.push(
            Severity::Error,
            None,
            None,
            "ui.training_plan.issue.empty",
            "计划里没有训练；要清空某几天请写明 from 和 to",
            json!({}),
        );
    }

    let mut workouts: Vec<(usize, Workout)> = Vec::new();
    for (index, workout) in document.workouts.iter().enumerate() {
        if let Some(parsed) = check_workout(index, workout, context, &mut issues) {
            if from.is_some_and(|from| parsed.date < from) || to.is_some_and(|to| parsed.date > to)
            {
                issues.push(
                    Severity::Error,
                    Some(index),
                    None,
                    "ui.training_plan.issue.outside_range",
                    "这条训练的日期不在计划的 from 到 to 之间",
                    json!({ "date": parsed.date.to_string() }),
                );
                continue;
            }
            workouts.push((index, parsed));
        }
    }

    if !VERIFIED.same_day_workouts {
        let mut seen = std::collections::BTreeSet::new();
        for (index, workout) in &workouts {
            if !seen.insert(workout.date) {
                issues.push(
                    Severity::Unverified,
                    Some(*index),
                    None,
                    "ui.training_plan.issue.same_day_unverified",
                    "同一天两条训练在手表上怎么显示还没核实过",
                    json!({ "date": workout.date.to_string() }),
                );
            }
        }
    }

    // 没写 from / to 就取训练日期的两端；一条可用的训练都没有就没有范围。
    let valid: std::collections::BTreeSet<usize> =
        workouts.iter().map(|(index, _)| *index).collect();
    let workouts: Vec<Workout> = workouts.into_iter().map(|(_, workout)| workout).collect();
    let from = from.or_else(|| workouts.iter().map(|w| w.date).min());
    let to = to.or_else(|| workouts.iter().map(|w| w.date).max());
    let mut rest = Vec::new();
    let mut seen_rest = std::collections::BTreeSet::new();
    for item in &document.rest {
        let date = NaiveDate::parse_from_str(&item.date, "%Y-%m-%d").ok();
        let bedtime = item.bedtime.as_deref().map(super::parse::parse_bedtime);
        let sleep = item
            .sleep_target
            .as_deref()
            .map(super::parse::parse_sleep_target);
        if date.is_none()
            || bedtime == Some(None)
            || sleep == Some(None)
            || !seen_rest.insert(item.date.clone())
        {
            issues.push(
                Severity::Error,
                None,
                None,
                "err.training_plan.rest_unparsable",
                "休息日的日期、就寝时间或睡眠目标无法解析",
                json!({ "date": item.date }),
            );
            continue;
        }
        let date = date.unwrap();
        if from.is_none_or(|from| date < from) || to.is_none_or(|to| date > to) {
            issues.push(
                Severity::Error,
                None,
                None,
                "err.training_plan.rest_outside_range",
                "休息日不在计划范围内",
                json!({ "date": item.date }),
            );
            continue;
        }
        check_day(date, context.today, last_day, None, &mut issues);
        rest.push(super::RestDay {
            date,
            bedtime_minutes: bedtime.flatten(),
            sleep_target_seconds: sleep.flatten(),
            note: item.note.clone(),
        });
    }
    let held = document
        .workouts
        .iter()
        .enumerate()
        .filter(|(index, _)| !valid.contains(index))
        .filter_map(|(index, workout)| held_workout(index, workout, context))
        .collect();
    PlanCheck {
        summary: document.summary.clone(),
        rest,
        from,
        to,
        workouts,
        held,
        issues: issues.list,
    }
}

fn check_day(
    date: NaiveDate,
    today: NaiveDate,
    last_day: NaiveDate,
    workout: Option<usize>,
    issues: &mut Issues,
) {
    if date < today {
        issues.push(
            Severity::Error,
            workout,
            None,
            "ui.training_plan.issue.past_date",
            "不能给已经过去的日子排训练",
            json!({ "date": date.to_string() }),
        );
    } else if date > last_day {
        issues.push(
            Severity::Error,
            workout,
            None,
            "ui.training_plan.issue.too_far",
            format!("计划最远排到 {MAX_DAYS_AHEAD} 天后"),
            json!({ "date": date.to_string(), "days": MAX_DAYS_AHEAD }),
        );
    }
}

fn check_workout(
    index: usize,
    workout: &PlanWorkout,
    context: PlanContext,
    issues: &mut Issues,
) -> Option<Workout> {
    let at = Some(index);
    let before = issues.list.len();
    let date = match NaiveDate::parse_from_str(workout.date.trim(), "%Y-%m-%d") {
        Ok(date) => {
            check_day(
                date,
                context.today,
                context.today + Duration::days(MAX_DAYS_AHEAD),
                at,
                issues,
            );
            Some(date)
        }
        Err(_) => {
            issues.push(
                Severity::Error,
                at,
                None,
                "ui.training_plan.issue.bad_date",
                format!("训练日期不是 YYYY-MM-DD：{}", workout.date),
                json!({ "value": workout.date }),
            );
            None
        }
    };
    let sport = Sport::parse(&workout.sport);
    if sport.is_none() {
        match Activity::parse(&workout.sport) {
            // R1 实测：V2 只认 4 个大类，别的值单条静默丢弃。读得懂，但发不出去。
            Some(activity) => issues.push(
                Severity::Error,
                at,
                None,
                "ui.training_plan.issue.sport_not_deliverable",
                format!(
                    "手表只收跑步、骑行、泳池游泳、开放水域游泳；这条是 {}",
                    workout.sport
                ),
                json!({ "value": workout.sport, "activity": activity }),
            ),
            None => issues.push(
                Severity::Error,
                at,
                None,
                "ui.training_plan.issue.unknown_sport",
                format!("不认识的运动类型：{}", workout.sport),
                json!({ "value": workout.sport }),
            ),
        }
    }
    let variant = match (workout.variant.as_deref().map(str::trim), sport) {
        (None | Some(""), _) => None,
        (Some(text), sport) => {
            let parsed = Variant::parse(text);
            let fits = match (parsed, sport) {
                (Some(variant), Some(sport)) => sport.variants().contains(&variant),
                // 运动本身就不对时，问题已经报过了，子类型不再追究。
                (Some(_), None) => true,
                (None, _) => false,
            };
            if !fits {
                issues.push(
                    Severity::Error,
                    at,
                    None,
                    "ui.training_plan.issue.bad_variant",
                    format!("这个运动没有「{text}」这种子类型"),
                    json!({ "value": text, "sport": workout.sport }),
                );
            }
            parsed
        }
    };
    let name = workout.name.trim();
    if name.is_empty() || name.chars().count() > MAX_NAME_CHARS {
        issues.push(
            Severity::Error,
            at,
            None,
            "ui.training_plan.issue.bad_name",
            format!("训练名称要写，且不超过 {MAX_NAME_CHARS} 个字"),
            json!({ "max": MAX_NAME_CHARS }),
        );
    }
    let focus = workout
        .focus
        .as_deref()
        .map(str::trim)
        .filter(|text| !text.is_empty());
    match focus {
        None => issues.push(
            Severity::Error,
            at,
            None,
            "ui.training_plan.issue.missing_focus",
            "每条训练都要写训练目的（例如「强化耐力」）",
            json!({}),
        ),
        Some(text) if text.chars().count() > MAX_FOCUS_CHARS || text.contains('\n') => issues.push(
            Severity::Error,
            at,
            None,
            "ui.training_plan.issue.focus_too_long",
            format!("训练目的是一个短词，不超过 {MAX_FOCUS_CHARS} 个字、不换行"),
            json!({ "max": MAX_FOCUS_CHARS }),
        ),
        Some(_) => {}
    }
    let description = workout
        .description
        .as_deref()
        .map(str::trim)
        .filter(|text| !text.is_empty());
    if description.is_none() {
        issues.push(
            Severity::Error,
            at,
            None,
            "ui.training_plan.issue.missing_description",
            "每条训练都要写要点描述",
            json!({}),
        );
    }
    if description.is_some_and(|text| text.chars().count() > MAX_DESCRIPTION_CHARS) {
        issues.push(
            Severity::Error,
            at,
            None,
            "ui.training_plan.issue.description_too_long",
            format!("训练说明不超过 {MAX_DESCRIPTION_CHARS} 个字"),
            json!({ "max": MAX_DESCRIPTION_CHARS }),
        );
    }

    let steps = check_steps(index, &workout.steps, context, issues);
    if let Some(steps) = steps.as_ref() {
        let leaves: usize = steps
            .iter()
            .map(|node| match node {
                StepNode::Step(_) => 1,
                StepNode::Repeat { steps, .. } => steps.len(),
            })
            .sum();
        if leaves > MAX_LEAF_STEPS {
            issues.push(
                Severity::Error,
                at,
                None,
                "ui.training_plan.issue.too_many_steps",
                format!("一条训练最多 {MAX_LEAF_STEPS} 步"),
                json!({ "max": MAX_LEAF_STEPS }),
            );
        }
        let total: Option<u64> = steps.iter().map(StepNode::seconds).sum();
        if total.is_some_and(|total| total > MAX_WORKOUT_SECONDS) {
            issues.push(
                Severity::Error,
                at,
                None,
                "ui.training_plan.issue.workout_too_long",
                "一条训练最长 8 小时",
                json!({ "hours": MAX_WORKOUT_SECONDS / 3600 }),
            );
        }
    }

    if issues.blocked_since(before) {
        return None;
    }
    // 只提醒：手表列表里约 14 个汉字后截断，详情页仍显示全名（R3 实测）。
    if name.chars().count() > WATCH_NAME_CHARS {
        issues.push(
            Severity::Warning,
            at,
            None,
            "ui.training_plan.issue.name_truncated",
            format!("名字超过 {WATCH_NAME_CHARS} 个字，手表列表里会被截断"),
            json!({ "max": WATCH_NAME_CHARS }),
        );
    }
    Some(Workout {
        date: date?,
        sport: sport?,
        variant,
        name: name.to_string(),
        focus: focus.map(str::to_string),
        description: description.map(str::to_string),
        steps: steps?,
    })
}

fn check_steps(
    workout: usize,
    steps: &[PlanStep],
    context: PlanContext,
    issues: &mut Issues,
) -> Option<Vec<StepNode>> {
    if steps.is_empty() {
        issues.push(
            Severity::Error,
            Some(workout),
            None,
            "ui.training_plan.issue.no_steps",
            "训练里至少要有一步",
            json!({}),
        );
        return None;
    }
    let mut nodes = Vec::with_capacity(steps.len());
    let mut ok = true;
    for (position, step) in steps.iter().enumerate() {
        let path = (position + 1).to_string();
        match step {
            PlanStep::Single { .. } => match check_single(workout, &path, step, context, issues) {
                Some(step) => nodes.push(StepNode::Step(step)),
                None => ok = false,
            },
            PlanStep::Repeat { repeat, steps } => {
                if *repeat == 0 || *repeat > MAX_REPEAT {
                    ok = false;
                    issues.push(
                        Severity::Error,
                        Some(workout),
                        Some(path.clone()),
                        "ui.training_plan.issue.bad_repeat",
                        format!("重复次数要在 1 到 {MAX_REPEAT} 之间"),
                        json!({ "max": MAX_REPEAT }),
                    );
                }
                if steps.is_empty() {
                    ok = false;
                    issues.push(
                        Severity::Error,
                        Some(workout),
                        Some(path.clone()),
                        "ui.training_plan.issue.no_steps",
                        "重复组里至少要有一步",
                        json!({}),
                    );
                }
                let mut inner = Vec::with_capacity(steps.len());
                for (sub, step) in steps.iter().enumerate() {
                    let sub_path = format!("{path}.{}", sub + 1);
                    if matches!(step, PlanStep::Repeat { .. }) {
                        ok = false;
                        issues.push(
                            Severity::Error,
                            Some(workout),
                            Some(sub_path),
                            "ui.training_plan.issue.nested_repeat",
                            "重复组里不能再套重复组",
                            json!({}),
                        );
                        continue;
                    }
                    match check_single(workout, &sub_path, step, context, issues) {
                        Some(step) => inner.push(step),
                        None => ok = false,
                    }
                }
                nodes.push(StepNode::Repeat {
                    times: *repeat,
                    steps: inner,
                });
            }
        }
    }
    ok.then_some(nodes)
}

fn check_single(
    workout: usize,
    path: &str,
    step: &PlanStep,
    context: PlanContext,
    issues: &mut Issues,
) -> Option<Step> {
    let PlanStep::Single {
        kind,
        duration,
        target,
        note,
    } = step
    else {
        return None;
    };
    let before = issues.list.len();
    let mut push = |severity, code, message: String, params| {
        issues.push(
            severity,
            Some(workout),
            Some(path.to_string()),
            code,
            message,
            params,
        );
    };

    let intensity = Intensity::parse(kind);
    if intensity.is_none() {
        push(
            Severity::Error,
            "ui.training_plan.issue.unknown_kind",
            format!("不认识的步骤类型：{kind}"),
            json!({ "value": kind }),
        );
    }

    let length = parse_duration(duration);
    match length {
        None => push(
            Severity::Error,
            "ui.training_plan.issue.bad_duration",
            format!("看不懂这个时长：{duration}（写成 20min、90s、1h、400m、5km）"),
            json!({ "value": duration }),
        ),
        Some(StepLength::Time { seconds })
            if !(MIN_STEP_SECONDS..=MAX_STEP_SECONDS).contains(&seconds) =>
        {
            push(
                Severity::Error,
                "ui.training_plan.issue.duration_out_of_range",
                "每一步在 10 秒到 6 小时之间".into(),
                json!({ "value": duration }),
            )
        }
        Some(StepLength::Distance { meters })
            if !(MIN_STEP_METERS..=MAX_STEP_METERS).contains(&meters) =>
        {
            push(
                Severity::Error,
                "ui.training_plan.issue.distance_out_of_range",
                "每一步在 50 米到 100 公里之间".into(),
                json!({ "value": duration }),
            )
        }
        Some(StepLength::Distance { .. }) if !VERIFIED.distance_steps => push(
            Severity::Unverified,
            "ui.training_plan.issue.distance_unverified",
            "按距离计的步骤还没在手表上核实过，先按时间写".into(),
            json!({ "value": duration }),
        ),
        Some(_) => {}
    }

    let max_hr = context.max_hr.unwrap_or(FALLBACK_MAX_HR);
    let parsed_target = parse_target(target.as_deref());
    match parsed_target {
        None => push(
            Severity::Error,
            "ui.training_plan.issue.bad_target",
            format!(
                "看不懂这个目标：{}（写成 hr 135-150、pace 5:30-5:50 或 power 200-220）",
                target.as_deref().unwrap_or_default()
            ),
            json!({ "value": target }),
        ),
        Some(Target::Open) if !VERIFIED.open_target => push(
            Severity::Unverified,
            "ui.training_plan.issue.open_target_unverified",
            "不设目标的步骤还没在手表上核实过，先给一个心率区间".into(),
            json!({}),
        ),
        Some(Target::HeartRate { low, high }) if low < MIN_HR || high > max_hr || low == high => {
            push(
                Severity::Error,
                "ui.training_plan.issue.hr_out_of_range",
                format!("心率区间要在 {MIN_HR} 到 {max_hr} 之间，且两端不相等"),
                json!({ "low": low, "high": high, "max": max_hr }),
            )
        }
        Some(Target::Pace { fast, slow })
            if fast < PACE_RANGE.0 || slow > PACE_RANGE.1 || fast == slow =>
        {
            push(
                Severity::Error,
                "ui.training_plan.issue.pace_out_of_range",
                "配速要在每公里 2:00 到 20:00 之间，且两端不相等".into(),
                json!({ "value": target }),
            )
        }
        Some(Target::Pace { .. }) if !VERIFIED.pace_target => push(
            Severity::Unverified,
            "ui.training_plan.issue.pace_unverified",
            "配速目标的单位还没在手表上核实过，先给一个心率区间".into(),
            json!({}),
        ),
        Some(Target::Power { low, high }) if low == 0 || high > MAX_POWER || low == high => push(
            Severity::Error,
            "ui.training_plan.issue.power_out_of_range",
            format!("功率要在 1 到 {MAX_POWER} 瓦之间，且两端不相等"),
            json!({ "low": low, "high": high }),
        ),
        Some(_) => {}
    }

    let note = note
        .as_deref()
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .map(str::to_string);
    if note
        .as_deref()
        .is_some_and(|text| text.chars().count() > MAX_NAME_CHARS * 2)
    {
        push(
            Severity::Error,
            "ui.training_plan.issue.note_too_long",
            format!("步骤备注不超过 {} 个字", MAX_NAME_CHARS * 2),
            json!({ "max": MAX_NAME_CHARS * 2 }),
        );
    }

    if issues.list.len() != before {
        return None;
    }
    Some(Step {
        intensity: intensity?,
        length: length?,
        target: parsed_target?,
        note,
    })
}
