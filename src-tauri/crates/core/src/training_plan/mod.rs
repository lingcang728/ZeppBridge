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
//! **没在手表上核实过的写法不许发。** 2026-10-06 用真账号 + 手表 + 手机 Zepp App
//! 六轮实测（结论见 `docs/capabilities/official-api-matrix.json`）之后，距离、配速、
//! 不设目标、同一天两条都已核实，[`VERIFIED`] 全部打开；以后再加新写法，仍然先在
//! 这里关着、实测后再开。
//!
//! 另外两条实测出来的硬限制：
//!
//! - V2 的 `sport` 只认 4 个大类，其余值（WALKING、HIKING……）会被**单条静默丢弃**，
//!   服务端照样回 success。所以走路、徒步、力量这类活动能解析、能显示，但校验给出
//!   发布阻断的 `sport_not_deliverable`。
//! - 第三方计划在手表上只到大类，手表会让用户再选一次子类型（户外跑 / 跑步机……）。
//!   我们能做的只是把子类型写进描述第一行（见 [`v2`]），界面如实说明。
//!
//! V1（`version=1.0.0`）**不用**：目标显示成乱码，手机 Zepp App 点详情会闪退。

pub mod parse;
pub mod publish;
pub mod standalone;
pub mod v2;
pub mod validate;
pub mod window;

#[cfg(test)]
mod tests;

use chrono::NaiveDate;
use serde::{Deserialize, Serialize};

pub use validate::{check_plan, HeldWorkout, PlanCheck, PlanContext, PlanIssue, Severity};

/// 已经在真实账号 + Zepp App 上核实过的写法。
///
/// 只有这里为 `true` 的写法能发出去。改它之前必须有实测记录（写进
/// `docs/capabilities/official-api-matrix.json`）。
pub struct Verified {
    /// 按距离计的步骤（`"5km"`）。官方文档写「单位：秒」，实测是米。
    pub distance_steps: bool,
    /// 配速目标。官方没写单位，实测是速度（米/秒）。
    pub pace_target: bool,
    /// 不设目标的步骤（`OPEN`，low = high = 0）。
    pub open_target: bool,
    /// 同一天两条训练。
    pub same_day_workouts: bool,
}

/// 实测记录（真账号 + 手表 + 手机 Zepp App，截图留在用户本机、不进仓库）：
///
/// - 2026-09-30：按时间计的步骤 + 心率区间目标正确显示（30 分钟、130–150），同窗重推
///   会替换旧条目、不动其他来源的计划。
/// - 2026-10-06 第 3 轮：`DISTANCE` 1000 显示「1.00 公里」（单位是米）；`OPEN`
///   正常显示为没有目标；同一天两条都显示；`POWER_LAP` 150–180 显示「150-180 瓦特」；
///   重复组 ×3 显示「循环次数 ×3」且总时长正确。
/// - 2026-10-06 第 3、4 轮：`PACE_LAP` 的值是**速度（米/秒）**，支持小数：3.03–3.33
///   显示 5'00"–5'30"/公里；高低值写反会被自动纠正。
pub const VERIFIED: Verified = Verified {
    distance_steps: true,
    pace_target: true,
    open_target: true,
    same_day_workouts: true,
};

/// 训练名字在手表列表里约 14 个汉字后会被截断（2026-10-06 第 3 轮实测）。超过只提醒、不阻断。
pub const WATCH_NAME_CHARS: usize = 14;

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
    pub format: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub summary: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub rest: Vec<PlanRest>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub from: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub to: Option<String>,
    pub workouts: Vec<PlanWorkout>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PlanRest {
    pub date: String,
    pub bedtime: Option<String>,
    pub sleep_target: Option<String>,
    pub note: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RestDay {
    pub date: NaiveDate,
    pub bedtime_minutes: Option<u16>,
    pub sleep_target_seconds: Option<u32>,
    pub note: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PlanWorkout {
    /// `YYYY-MM-DD`，本地日期。
    pub date: String,
    /// `running` / `cycling` / `pool_swim` / `open_water_swim`。走路、徒步、力量等
    /// 也能读，但发不到手表（见 [`Activity`]）。
    pub sport: String,
    /// 子类型：跑步 `outdoor` / `treadmill` / `track`，骑行 `outdoor` / `indoor`。
    /// 手表上只到大类，子类型只写进描述第一行提醒用户。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub variant: Option<String>,
    pub name: String,
    /// 训练目的（短词，例如「强化耐力」）。zeppbridge-plan/3 起必填；旧格式读得进来，
    /// 校验报 `missing_focus`。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub focus: Option<String>,
    /// 训练要点。必填（`missing_description`）。
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

    /// 这个大类允许的子类型。游泳不分。
    pub fn variants(self) -> &'static [Variant] {
        match self {
            Self::Running => &[Variant::Outdoor, Variant::Treadmill, Variant::Track],
            Self::Cycling => &[Variant::Outdoor, Variant::Indoor],
            Self::PoolSwim | Self::OpenWaterSwim => &[],
        }
    }
}

/// 子类型。手表上第三方计划只到大类（R1 实测），所以它只进描述，不进 `sport`。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Variant {
    Outdoor,
    Indoor,
    Treadmill,
    Track,
}

impl Variant {
    pub fn parse(text: &str) -> Option<Self> {
        Some(match text.trim().to_ascii_lowercase().as_str() {
            "outdoor" | "road" | "outside" => Self::Outdoor,
            "indoor" | "trainer" | "turbo" => Self::Indoor,
            "treadmill" => Self::Treadmill,
            "track" => Self::Track,
            _ => return None,
        })
    }
}

/// 能读懂、但手表收不下的活动（R1 实测：V2 对这些 `sport` 单条静默丢弃）。
///
/// 解析时认出来是为了**照原样显示**（步行就是步行，绝不渲染成休息日），校验给出
/// 发布阻断的 `sport_not_deliverable`，让用户删掉或换成能发的大类。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Activity {
    Walking,
    Hiking,
    Strength,
    Yoga,
    Rowing,
    Elliptical,
}

impl Activity {
    pub fn parse(text: &str) -> Option<Self> {
        Some(match text.trim().to_ascii_lowercase().as_str() {
            "walking" | "walk" | "long_walk" | "brisk_walk" => Self::Walking,
            "hiking" | "hike" | "trekking" => Self::Hiking,
            "strength" | "strength_training" | "weights" | "gym" => Self::Strength,
            "yoga" | "pilates" | "mobility" | "stretching" => Self::Yoga,
            "rowing" | "row" => Self::Rowing,
            "elliptical" => Self::Elliptical,
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
///
/// `variant` / `focus` 是 2026-10 加的：账本里更早的训练没有它们，读进来是 `None`。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Workout {
    pub date: NaiveDate,
    pub sport: Sport,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub variant: Option<Variant>,
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub focus: Option<String>,
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
