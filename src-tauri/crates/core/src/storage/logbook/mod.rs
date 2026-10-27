//! 主观层（批次 7「让数据留在 ZeppBridge」）：跑鞋、每次运动的感受、伤病、比赛、PB。
//!
//! 身体数据来自云端，留不住；这里存的是**用户自己产生的判断**——穿哪双鞋、这次多累、哪儿酸、
//! 哪天比赛、跑出了什么成绩。全是用户写的（PB 是从本地采样算出来的），和打分、教练档案一样：
//!
//! - 不挂外键到 `workouts`：重放会删了再插运动行，用户写的东西不能跟着没；
//! - 保留期清理、重放都不碰这些表；
//! - 写入由调用方拿跨进程写锁（命令侧 `with_write`，MCP 不写这里）；
//! - 校验不过一律报错，不替用户「修正」成别的值。
//!
//! 每个领域一个文件：[`shoes`] 跑鞋与里程、[`annotations`] 一次运动的 RPE / 酸痛 / 鞋、
//! [`injuries`] 伤病日志、[`races`] 比赛日历与奖牌墙、[`records`] PB 墙；[`profile`] 把这些整理成交给 AI 的一份。

pub mod annotations;
pub mod injuries;
pub mod profile;
pub mod races;
pub mod records;
pub mod shoes;

use crate::models::{error::Result, ZeppBridgeError};
use chrono::NaiveDate;

/// 校验不过：调用方（命令层）按自己的码报给界面，这里的中文只给日志和 CLI。
pub(crate) fn invalid(message: &str) -> ZeppBridgeError {
    ZeppBridgeError::ConfigError(message.into())
}

/// `YYYY-MM-DD`，而且是真实存在的日子。
pub(crate) fn valid_date(value: &str) -> bool {
    NaiveDate::parse_from_str(value, "%Y-%m-%d")
        .is_ok_and(|date| date.format("%Y-%m-%d").to_string() == value)
}

/// 去首尾空白，空的或超过 `max` 字的不收。
pub(crate) fn clean_text(value: &str, max: usize, what: &str) -> Result<String> {
    let value = value.trim();
    if value.is_empty() || value.chars().count() > max {
        return Err(invalid(what));
    }
    Ok(value.to_string())
}

/// 跑步类：PB 只认这几种。
pub const RUN_TYPES: [&str; 3] = ["run", "trail_running", "treadmill"];

/// 一种运动该穿哪类鞋。不穿鞋的运动（骑行、游泳……）返回 `None`，界面上就不问鞋。
pub fn footwear_family(effective_type: &str) -> Option<&'static str> {
    match effective_type {
        "run" | "treadmill" => Some("running"),
        "trail_running" => Some("trail"),
        "walking" => Some("walking"),
        "hiking" => Some("hiking"),
        _ => None,
    }
}

/// 身体部位（人形图上能点的区域）。左右分开，伤病和酸痛共用这一份。
pub const BODY_PARTS: [&str; 40] = [
    "neck",
    "shoulder_l",
    "shoulder_r",
    "upper_back",
    "lower_back",
    "chest",
    "abdomen",
    "hip_l",
    "hip_r",
    "glute_l",
    "glute_r",
    "quad_l",
    "quad_r",
    "hamstring_l",
    "hamstring_r",
    "knee_l",
    "knee_r",
    "shin_l",
    "shin_r",
    "calf_l",
    "calf_r",
    "achilles_l",
    "achilles_r",
    "ankle_l",
    "ankle_r",
    "foot_l",
    "foot_r",
    "it_band_l",
    "it_band_r",
    "head",
    "upper_arm_l",
    "upper_arm_r",
    "elbow_l",
    "elbow_r",
    "forearm_l",
    "forearm_r",
    "wrist_l",
    "wrist_r",
    "hand_l",
    "hand_r",
];

pub(crate) fn valid_body_part(part: &str) -> bool {
    BODY_PARTS.contains(&part)
}
