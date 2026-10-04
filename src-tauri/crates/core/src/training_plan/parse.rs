//! 书写格式里的两种短文本：时长（`"20min"`）和目标（`"hr 135-150"`）。
//!
//! 只认写法明确的形式。`"5m"` 是 5 米不是 5 分钟——跑步计划里 400m、800m 是
//! 最常见的写法，分钟一律写 `min`。认不出来就报错，不猜。

use super::{StepLength, Target};

pub fn parse_bedtime(text: &str) -> Option<u16> {
    if text.len() != 5
        || text.as_bytes()[2] != b':'
        || !text
            .as_bytes()
            .iter()
            .enumerate()
            .all(|(i, b)| i == 2 || b.is_ascii_digit())
    {
        return None;
    }
    let (h, m) = text.split_once(':')?;
    let h: u16 = h.parse().ok()?;
    let m: u16 = m.parse().ok()?;
    (h < 24 && m < 60).then_some(h * 60 + m)
}

pub fn parse_sleep_target(text: &str) -> Option<u32> {
    let text = text.trim();
    let seconds =
        if let Some((hours, minutes)) = text.split_once('h').filter(|(_, m)| !m.is_empty()) {
            let h: u32 = hours.parse().ok()?;
            let m: u32 = minutes.strip_suffix('m')?.parse().ok()?;
            if m >= 60 {
                return None;
            }
            h.checked_mul(3600)?.checked_add(m.checked_mul(60)?)?
        } else {
            match parse_duration(text)? {
                StepLength::Time { seconds } => seconds,
                _ => return None,
            }
        };
    (seconds > 0 && seconds <= 24 * 3600).then_some(seconds)
}

/// 时长：`<数字><单位>`，中间可以有空格。
///
/// 时间单位 `s` / `sec` / `秒`、`min` / `分钟`、`h` / `小时`；距离单位 `m` / `米`、
/// `km` / `公里`。数字可以带小数（`"1.5h"`、`"2.5km"`），换算后四舍五入到整秒 / 整米。
pub fn parse_duration(text: &str) -> Option<StepLength> {
    let text = text.trim().to_ascii_lowercase();
    let split = text
        .find(|c: char| !(c.is_ascii_digit() || c == '.'))
        .unwrap_or(text.len());
    let (number, unit) = text.split_at(split);
    let value: f64 = number.parse().ok().filter(|v: &f64| v.is_finite())?;
    if value <= 0.0 {
        return None;
    }
    let rounded = |scale: f64| {
        let scaled = (value * scale).round();
        (scaled >= 1.0 && scaled <= f64::from(u32::MAX)).then_some(scaled as u32)
    };
    Some(match unit.trim() {
        "s" | "sec" | "秒" => StepLength::Time {
            seconds: rounded(1.0)?,
        },
        "min" | "分钟" | "分" => StepLength::Time {
            seconds: rounded(60.0)?,
        },
        "h" | "hr" | "小时" => StepLength::Time {
            seconds: rounded(3600.0)?,
        },
        "m" | "米" => StepLength::Distance {
            meters: rounded(1.0)?,
        },
        "km" | "公里" => StepLength::Distance {
            meters: rounded(1000.0)?,
        },
        _ => return None,
    })
}

/// 目标：`hr 135-150`、`pace 5:30-5:50`（每公里）、`power 200-220`。
/// 空串或 `open` 是不设目标。区间两端可以写反，这里会摆正。
pub fn parse_target(text: Option<&str>) -> Option<Target> {
    let Some(text) = text.map(str::trim).filter(|t| !t.is_empty()) else {
        return Some(Target::Open);
    };
    let text = text.to_ascii_lowercase();
    if text == "open" {
        return Some(Target::Open);
    }
    let (kind, range) = text.split_once(char::is_whitespace)?;
    let (low, high) = range.trim().split_once('-')?;
    match kind {
        "hr" | "heart_rate" => {
            let (low, high) = ordered(low.trim().parse().ok()?, high.trim().parse().ok()?);
            Some(Target::HeartRate { low, high })
        }
        "power" => {
            let (low, high) = ordered(low.trim().parse().ok()?, high.trim().parse().ok()?);
            Some(Target::Power { low, high })
        }
        "pace" => {
            let (fast, slow) = ordered(pace_seconds(low)?, pace_seconds(high)?);
            Some(Target::Pace { fast, slow })
        }
        _ => None,
    }
}

/// `"5:30"` → 330 秒。秒数必须是两位以内且小于 60。
fn pace_seconds(text: &str) -> Option<u16> {
    let (minutes, seconds) = text.trim().split_once(':')?;
    let minutes: u16 = minutes.parse().ok()?;
    let seconds: u16 = seconds.parse().ok().filter(|s| *s < 60)?;
    minutes.checked_mul(60)?.checked_add(seconds)
}

fn ordered(a: u16, b: u16) -> (u16, u16) {
    if a <= b {
        (a, b)
    } else {
        (b, a)
    }
}
