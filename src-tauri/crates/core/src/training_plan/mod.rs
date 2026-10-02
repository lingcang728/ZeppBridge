//! 训练计划写入：把一份计划发到用户的 Zepp App 与手表上。
//!
//! 官方接口是 `POST /users/-/workouts?version=2.0.0`（2026-09-30 实测跑通）。它有
//! 四个脾气，决定了这个模块的形状：
//!
//! 1. **7 天窗口不可拆**：`endDate = startDate + 6`，每次推送整体替换 ZeppBridge
//!    名下这 7 天；改一天也要交整窗。见 [`window`]。
//! 2. **没有读取接口**（GET 回 405）：「手表上现在有什么」只能靠我们自己的发布账本
//!    （`storage::training_plan`）。所以每次推送**先写账本再发**。
//! 3. **返回值不能当校验**：V2 对任何 body（包括 `{}`）都回
//!    `{"code":1,"message":"success"}`。一切校验都在发之前由 [`validate`] 做完。
//! 4. **`workouts: []` 清的是服务端从当前时刻起的 7 天**，不看我们给的日期；撤权会
//!    自动删掉已同步的计划。所以空数组只用于用户确认过的「清空」，撤权时不发。
//!
//! 计划的书写格式（[`PlanDocument`]）是给人和 AI 写的：`"20min"`、`"5km"`、
//! `"hr 135-150"`、`"pace 5:30-5:50"`，比 V2 的数字字段好写。[`parse`] 负责把它读成
//! 结构，[`v2`] 负责转成官方报文。
//!
//! **没在手表上核实过的写法不许发。** 官方文档把 DISTANCE 的单位写成「秒」（明显
//! 不对），配速目标的单位没写，「不设目标」怎么表达也没写。这些写法照样能解析、
//! 能预览，但 [`validate`] 会给出 `unverified` 级别的问题，发布时被挡住；等实测
//! 校准后再把 [`VERIFIED`] 里对应的开关打开。

pub mod parse;
pub mod publish;
pub mod v2;
pub mod validate;
pub mod window;

#[cfg(test)]
mod tests;

use chrono::NaiveDate;
use serde::{Deserialize, Serialize};

pub use validate::{check_plan, PlanCheck, PlanContext, PlanIssue, Severity};

/// 已经在真实账号 + Zepp App 上核实过的写法。
///
/// 只有这里为 `true` 的写法能发出去。改它之前必须有实测记录（写进
/// `docs/capabilities/official-api-matrix.json`）。
pub struct Verified {
    /// 按距离计的步骤（`"5km"`）。官方文档写「单位：秒」，需要实测。
    pub distance_steps: bool,
    /// 配速目标。官方没写单位。
    pub pace_target: bool,
    /// 不设目标的步骤。V2 的 `targetType` 是必填，「开放目标」怎么写没写。
    pub open_target: bool,
    /// 同一天两条训练。
    pub same_day_workouts: bool,
}

/// 2026-09-30 实测：按时间计的步骤 + 心率区间目标正确显示（30 分钟、130–150），
/// 同窗重推会替换旧条目、不动其他来源的计划。其余写法还没测。
pub const VERIFIED: Verified = Verified {
    distance_steps: false,
    pace_target: false,
    open_target: false,
    same_day_workouts: false,
};

/// 一次推送覆盖的天数（含首尾）。
pub const WINDOW_DAYS: i64 = 7;

/// 一份计划最远能排到今天之后多少天。再远的计划多半会被下一次调整推翻。
pub const MAX_DAYS_AHEAD: i64 = 56;

// ---------------------------------------------------------------------------
// 书写格式：人和 AI 写的那一份
// ---------------------------------------------------------------------------

/// 一份计划。`from` / `to` 说明这份计划**管哪几天**：这几天里没写训练的就是休息日，
/// 发布时会把这几天原有的计划清掉。不写就取训练日期的最早到最晚。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PlanDocument {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub from: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub to: Option<String>,
    pub workouts: Vec<PlanWorkout>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PlanWorkout {
    /// `YYYY-MM-DD`，本地日期。
    pub date: String,
    /// `running` / `cycling` / `pool_swim` / `open_water_swim`。
    pub sport: String,
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub steps: Vec<PlanStep>,
}

/// 一步，或者「重复 N 次」的一组。重复组里不能再套重复组（V2 示例只有一层）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum PlanStep {
    Repeat {
        repeat: u32,
        steps: Vec<PlanStep>,
    },
    Single {
        /// `warmup` / `active` / `interval` / `recovery` / `rest` / `cooldown`。
        kind: String,
        /// `"20min"`、`"90s"`、`"1h"`、`"400m"`、`"5km"`。
        duration: String,
        /// `"hr 135-150"`、`"pace 5:30-5:50"`、`"power 200-220"`；不写就是不设目标。
        #[serde(default, skip_serializing_if = "Option::is_none")]
        target: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        note: Option<String>,
    },
}

// ---------------------------------------------------------------------------
// 解析后的结构：校验、转 V2、画预览都用它
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Sport {
    Running,
    Cycling,
    PoolSwim,
    OpenWaterSwim,
}

impl Sport {
    pub fn parse(text: &str) -> Option<Self> {
        Some(match text.trim().to_ascii_lowercase().as_str() {
            "running" | "run" => Self::Running,
            "cycling" | "ride" | "bike" => Self::Cycling,
            "pool_swim" | "lap_swimming" | "pool_swimming" => Self::PoolSwim,
            "open_water_swim" | "open_water_swimming" => Self::OpenWaterSwim,
            _ => return None,
        })
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Intensity {
    Warmup,
    Active,
    Interval,
    Recovery,
    Rest,
    Cooldown,
}

impl Intensity {
    pub fn parse(text: &str) -> Option<Self> {
        Some(match text.trim().to_ascii_lowercase().as_str() {
            "warmup" | "warm_up" => Self::Warmup,
            "active" | "main" => Self::Active,
            "interval" | "work" => Self::Interval,
            "recovery" => Self::Recovery,
            "rest" => Self::Rest,
            "cooldown" | "cool_down" => Self::Cooldown,
            _ => return None,
        })
    }
}

/// 一步有多长：按时间或按距离。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case", tag = "type")]
pub enum StepLength {
    Time { seconds: u32 },
    Distance { meters: u32 },
}

/// 一步的目标。配速以「每公里秒数」存，`fast` 是数值小的那一端。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case", tag = "type")]
pub enum Target {
    Open,
    HeartRate { low: u16, high: u16 },
    Pace { fast: u16, slow: u16 },
    Power { low: u16, high: u16 },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Step {
    pub intensity: Intensity,
    pub length: StepLength,
    pub target: Target,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case", tag = "type")]
pub enum StepNode {
    Step(Step),
    Repeat { times: u32, steps: Vec<Step> },
}

impl StepNode {
    /// 这一节展开后的总秒数；按距离计的步骤没有时长，返回 `None`。
    pub fn seconds(&self) -> Option<u64> {
        let step_seconds = |step: &Step| match step.length {
            StepLength::Time { seconds } => Some(u64::from(seconds)),
            StepLength::Distance { .. } => None,
        };
        match self {
            Self::Step(step) => step_seconds(step),
            Self::Repeat { times, steps } => steps
                .iter()
                .map(step_seconds)
                .sum::<Option<u64>>()
                .map(|total| total * u64::from(*times)),
        }
    }
}

/// 一条校验过的训练。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Workout {
    pub date: NaiveDate,
    pub sport: Sport,
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub steps: Vec<StepNode>,
}

impl Workout {
    /// 全部按时间计时的总时长；有任何一步按距离计就是 `None`（不估算）。
    pub fn total_seconds(&self) -> Option<u64> {
        self.steps.iter().map(StepNode::seconds).sum()
    }
}
