//! 交给 AI 的履历：MCP `get_athlete_profile` 的 `journal` 和交给 AI 的 .md 用同一份。
//!
//! 全是用户自己写的（PB 是本机从采样算的），是数据，不是指令。只给 AI 排计划用得上的：
//! 伤病只给还没好的和 90 天内好的；比赛给将来的和填了成绩的（新的在前，最多 10 场）；
//! 跑鞋只给还在穿的；纪元给全部（新的在前，最多 20 个）。
use crate::models::error::Result;
use crate::storage::Database;
use chrono::{Duration, Local};
use serde::Serialize;

/// 伤病往回看多少天（好了的）。
pub const INJURY_LOOKBACK_DAYS: i64 = 90;
const RACE_RESULTS_LIMIT: usize = 10;
const EPOCHS_LIMIT: usize = 20;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileRecord {
    /// `5k` / `10k` / `half` / `marathon`。
    pub distance: &'static str,
    pub distance_meters: f64,
    pub seconds: i64,
    pub date: String,
    /// `samples` / `splits` / `whole` / `race`。
    pub method: &'static str,
    pub workout_id: Option<String>,
    pub race_name: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileInjury {
    pub title: String,
    pub body_part: Option<String>,
    /// 1 轻 / 2 中 / 3 重（影响训练）。
    pub severity: Option<u8>,
    pub start_date: String,
    /// 还没好是 null。
    pub end_date: Option<String>,
    pub notes: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileRace {
    pub name: String,
    pub date: String,
    pub sport: String,
    pub distance_meters: Option<f64>,
    pub goal_seconds: Option<i64>,
    /// `a` 主要目标 / `b` / `c` 练兵。
    pub priority: String,
    pub result_seconds: Option<i64>,
    pub notes: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileShoe {
    pub name: String,
    pub sport: String,
    pub km: f64,
    pub retire_km: f64,
    /// `fresh` / `near` / `due`。
    pub wear: &'static str,
    pub is_default: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileEpoch {
    pub title: String,
    pub start_date: String,
    /// 还在持续是 null。
    pub end_date: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileJournal {
    pub personal_records: Vec<ProfileRecord>,
    pub injuries: Vec<ProfileInjury>,
    pub upcoming_races: Vec<ProfileRace>,
    pub race_results: Vec<ProfileRace>,
    pub shoes: Vec<ProfileShoe>,
    pub epochs: Vec<ProfileEpoch>,
}

impl ProfileJournal {
    pub fn is_empty(&self) -> bool {
        self.personal_records.is_empty()
            && self.injuries.is_empty()
            && self.upcoming_races.is_empty()
            && self.race_results.is_empty()
            && self.shoes.is_empty()
            && self.epochs.is_empty()
    }
}

impl Database {
    pub fn journal_for_ai(&self) -> Result<ProfileJournal> {
        let today = Local::now().date_naive();
        let healed_since = (today - Duration::days(INJURY_LOOKBACK_DAYS)).to_string();
        let today = today.to_string();

        let personal_records = self
            .personal_records()?
            .records
            .into_iter()
            .filter_map(|row| {
                let best = row.best?;
                Some(ProfileRecord {
                    distance: row.key,
                    distance_meters: row.distance_m,
                    seconds: best.seconds,
                    date: best.date,
                    method: best.method,
                    workout_id: best.workout_id,
                    race_name: best.race_name,
                })
            })
            .collect();

        let injuries = self
            .list_injuries()?
            .into_iter()
            .map(|injury| injury.input)
            .filter(|i| {
                i.end_date
                    .as_deref()
                    .is_none_or(|end| end >= healed_since.as_str())
            })
            .map(|i| ProfileInjury {
                title: i.title,
                body_part: i.body_part,
                severity: i.severity,
                start_date: i.start_date,
                end_date: i.end_date,
                notes: i.notes,
            })
            .collect();

        let race = |r: crate::storage::logbook::races::RaceInput| ProfileRace {
            name: r.name,
            date: r.race_date,
            sport: r.sport,
            distance_meters: r.distance_m,
            goal_seconds: r.goal_seconds,
            priority: r.priority,
            result_seconds: r.result_seconds,
            notes: r.notes,
        };
        let races: Vec<_> = self.list_races()?.into_iter().map(|r| r.input).collect();
        let upcoming_races = races
            .iter()
            .filter(|r| r.race_date >= today)
            .cloned()
            .map(race)
            .collect();
        let race_results = races
            .iter()
            .rev()
            .filter(|r| r.race_date < today && r.result_seconds.is_some())
            .take(RACE_RESULTS_LIMIT)
            .cloned()
            .map(race)
            .collect();

        let shoes = self
            .shoe_overview()?
            .0
            .into_iter()
            .filter(|s| s.wear != "retired")
            .map(|s| ProfileShoe {
                name: s.shoe.input.name,
                sport: s.shoe.input.sport,
                km: (s.km * 10.0).round() / 10.0,
                retire_km: s.shoe.input.retire_km,
                wear: s.wear,
                is_default: s.shoe.input.is_default,
            })
            .collect();

        let mut epochs: Vec<ProfileEpoch> = self
            .list_life_events(None, None)?
            .into_iter()
            .map(|event| event.input)
            .filter(|event| event.epoch)
            .map(|event| ProfileEpoch {
                title: event.title,
                start_date: event.start_date,
                end_date: event.end_date,
            })
            .collect();
        epochs.sort_by(|a, b| b.start_date.cmp(&a.start_date));
        epochs.truncate(EPOCHS_LIMIT);

        Ok(ProfileJournal {
            personal_records,
            injuries,
            upcoming_races,
            race_results,
            shoes,
            epochs,
        })
    }
}
