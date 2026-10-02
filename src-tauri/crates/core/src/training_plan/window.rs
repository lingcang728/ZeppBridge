//! 7 天窗口与「这次推送会改什么」的逐日预览。
//!
//! 官方：`startDate`、`endDate` 都含在内，`endDate` 必须正好是 `startDate + 6`；
//! 窗口不可拆，改一天也要把 7 天整个交上去，交上去的 7 天整体替换 ZeppBridge 名下
//! 原有的这 7 天。

use super::{Workout, WINDOW_DAYS};
use chrono::{Duration, NaiveDate};
use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct Window {
    pub start: NaiveDate,
}

impl Window {
    pub fn starting(start: NaiveDate) -> Self {
        Self { start }
    }

    pub fn end(self) -> NaiveDate {
        self.start + Duration::days(WINDOW_DAYS - 1)
    }

    pub fn contains(self, date: NaiveDate) -> bool {
        date >= self.start && date <= self.end()
    }

    pub fn days(self) -> impl Iterator<Item = NaiveDate> {
        (0..WINDOW_DAYS).map(move |offset| self.start + Duration::days(offset))
    }
}

/// 某一天推送前后的差别。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum DayChange {
    /// 推送前后都没有训练。
    Rest,
    Unchanged,
    Added,
    Replaced,
    Removed,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct DayPreview {
    pub date: NaiveDate,
    pub change: DayChange,
    pub before: Vec<Workout>,
    pub after: Vec<Workout>,
}

/// 逐日比较「手表上现在（按账本）有的」和「这次要推的」。
///
/// `before` 只能来自我们自己的发布账本——官方没有读取接口，用户在别处删掉的我们
/// 不知道。所以界面要说「上次发过去的」，不能说「手表上现在有的」。
pub fn preview(window: Window, before: &[Workout], after: &[Workout]) -> Vec<DayPreview> {
    let on = |list: &[Workout], date: NaiveDate| -> Vec<Workout> {
        list.iter().filter(|w| w.date == date).cloned().collect()
    };
    window
        .days()
        .map(|date| {
            let before = on(before, date);
            let after = on(after, date);
            let change = match (before.is_empty(), after.is_empty()) {
                (true, true) => DayChange::Rest,
                (true, false) => DayChange::Added,
                (false, true) => DayChange::Removed,
                (false, false) if before == after => DayChange::Unchanged,
                (false, false) => DayChange::Replaced,
            };
            DayPreview {
                date,
                change,
                before,
                after,
            }
        })
        .collect()
}
