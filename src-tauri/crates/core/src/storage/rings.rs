//! 年轮年度回顾（批次 7）：一年一圈年轮、一次运动一颗星，全在本机算，图也在本机画。
//!
//! 只用真实数据，缺了就留白：
//!
//! - 从有数据的第一年到今年，每年一圈；中间整年没数据的也给一圈，但 `data_days = 0`，界面画成空白；
//! - 每周一个刻度（一年 53 格，最后一格只有一两天），值是那周运动的分钟数；那一周**一天数据都没有**
//!   （没有每日指标、没有睡眠、没有运动）就是 `None`，界面在那里断开，不画成 0；
//! - 步数、睡眠没有就是 `None`，不拿 0 充数；
//! - 时长取开始到结束（暂停算在里面），超过 48 小时的当作坏记录，不计时长。
//!
//! 日期一律按本机时区的本地日（和 PB 墙、跑鞋一致）。
use crate::models::error::Result;
use crate::storage::logbook::RUN_TYPES;
use crate::storage::Database;
use chrono::{Datelike, Local, NaiveDate};
use serde::Serialize;
use std::collections::{BTreeMap, HashMap, HashSet};

/// 一年的周刻度数（第 53 格只装 12 月 30 / 31 日）。
pub const WEEKS: usize = 53;
/// 超过这么长的一次运动当作坏记录，不计时长。
const MAX_WORKOUT_SECONDS: i64 = 48 * 3600;

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct RingStar {
    pub workout_id: String,
    /// 本地日期。
    pub date: String,
    /// 有效运动类型（用户改过的优先）。
    pub kind: String,
    pub is_run: bool,
    pub distance_m: Option<f64>,
    pub duration_s: Option<i64>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct RingHighlight {
    pub workout_id: String,
    pub date: String,
    pub kind: String,
    pub distance_m: Option<f64>,
    pub duration_s: Option<i64>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct RingRace {
    pub name: String,
    pub date: String,
    pub result_seconds: i64,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct RingYear {
    pub year: i32,
    /// 今年还没过完。
    pub in_progress: bool,
    /// 有任何数据的天数（每日指标、睡眠、运动）。
    pub data_days: u32,
    pub workouts: u32,
    /// 有运动的天数。
    pub active_days: u32,
    pub duration_s: i64,
    pub distance_m: f64,
    pub runs: u32,
    pub run_distance_m: f64,
    /// 每周运动分钟数；那周一天数据都没有是 `None`。
    pub weeks: Vec<Option<f64>>,
    /// 1–12，运动次数最多的月（并列取早的）。没有运动是 `None`。
    pub busiest_month: Option<u32>,
    pub busiest_month_workouts: u32,
    pub longest_run: Option<RingHighlight>,
    pub longest_workout: Option<RingHighlight>,
    /// 有步数的天的步数合计；一天都没有是 `None`。
    pub steps_total: Option<i64>,
    pub steps_days: u32,
    /// 每晚主睡眠（按醒来那天取最长一段）的平均分钟数。
    pub sleep_avg_minutes: Option<f64>,
    pub sleep_nights: u32,
    /// 这一年创下、至今还保持着的 PB（`5k` / `10k` / `half` / `marathon`）。
    pub personal_records: Vec<&'static str>,
    /// 这一年跑完、填了成绩的比赛，按日期。
    pub races: Vec<RingRace>,
    pub stars: Vec<RingStar>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct AnnualRings {
    /// 旧的在前（年轮从里往外长）。
    pub years: Vec<RingYear>,
    pub today: String,
}

/// 纯函数的输入：一次运动。
#[derive(Debug, Clone)]
pub struct RingWorkout {
    pub workout_id: String,
    pub date: NaiveDate,
    pub kind: String,
    pub distance_m: Option<f64>,
    pub seconds: Option<i64>,
}

/// 纯函数的输入：除运动以外的东西。
#[derive(Debug, Clone, Default)]
pub struct RingExtras {
    /// 有任何数据的日子（不含运动，运动的日子会自动算进去）。
    pub data_days: HashSet<NaiveDate>,
    pub steps: HashMap<NaiveDate, i64>,
    /// 醒来那天 → 最长一段睡眠的分钟数。
    pub sleep: HashMap<NaiveDate, i64>,
    /// (PB 键, 创下的日期)。
    pub records: Vec<(&'static str, NaiveDate)>,
    pub races: Vec<(String, NaiveDate, i64)>,
}

/// 一年里的第几周格（0 起）。
pub fn week_slot(date: NaiveDate) -> usize {
    (date.ordinal0() as usize / 7).min(WEEKS - 1)
}

fn highlight(w: &RingWorkout) -> RingHighlight {
    RingHighlight {
        workout_id: w.workout_id.clone(),
        date: w.date.to_string(),
        kind: w.kind.clone(),
        distance_m: w.distance_m,
        duration_s: w.seconds,
    }
}

/// 把一年的东西排成一圈。`workouts` 只含这一年的。
fn ring_year(
    year: i32,
    today: NaiveDate,
    workouts: &[&RingWorkout],
    extras: &RingExtras,
) -> RingYear {
    let in_year = |d: &NaiveDate| d.year() == year;
    let mut covered: HashSet<NaiveDate> =
        extras.data_days.iter().copied().filter(in_year).collect();
    covered.extend(workouts.iter().map(|w| w.date));

    let mut weeks: Vec<Option<f64>> = vec![None; WEEKS];
    for day in &covered {
        weeks[week_slot(*day)].get_or_insert(0.0);
    }
    let mut months = [0u32; 12];
    let mut active: HashSet<NaiveDate> = HashSet::new();
    let (mut duration_s, mut distance_m, mut runs, mut run_distance_m) = (0i64, 0.0, 0u32, 0.0);
    let mut longest_run: Option<&RingWorkout> = None;
    let mut longest_workout: Option<&RingWorkout> = None;
    let mut stars = Vec::with_capacity(workouts.len());
    for w in workouts {
        active.insert(w.date);
        months[w.date.month0() as usize] += 1;
        let is_run = RUN_TYPES.contains(&w.kind.as_str());
        if let Some(seconds) = w.seconds {
            duration_s += seconds;
            *weeks[week_slot(w.date)].get_or_insert(0.0) += seconds as f64 / 60.0;
            if longest_workout.is_none_or(|l| l.seconds.is_none_or(|s| seconds > s)) {
                longest_workout = Some(w);
            }
        }
        if let Some(meters) = w.distance_m {
            distance_m += meters;
            if is_run {
                run_distance_m += meters;
                if longest_run.is_none_or(|l| l.distance_m.is_none_or(|m| meters > m)) {
                    longest_run = Some(w);
                }
            }
        }
        if is_run {
            runs += 1;
        }
        stars.push(RingStar {
            workout_id: w.workout_id.clone(),
            date: w.date.to_string(),
            kind: w.kind.clone(),
            is_run,
            distance_m: w.distance_m,
            duration_s: w.seconds,
        });
    }
    let busiest = months
        .iter()
        .enumerate()
        .filter(|(_, n)| **n > 0)
        .max_by(|a, b| a.1.cmp(b.1).then(b.0.cmp(&a.0)));

    let steps: Vec<i64> = extras
        .steps
        .iter()
        .filter(|(d, _)| in_year(d))
        .map(|(_, v)| *v)
        .collect();
    let sleep: Vec<i64> = extras
        .sleep
        .iter()
        .filter(|(d, _)| in_year(d))
        .map(|(_, v)| *v)
        .collect();
    let mut races: Vec<RingRace> = extras
        .races
        .iter()
        .filter(|(_, d, _)| in_year(d))
        .map(|(name, date, seconds)| RingRace {
            name: name.clone(),
            date: date.to_string(),
            result_seconds: *seconds,
        })
        .collect();
    races.sort_by(|a, b| a.date.cmp(&b.date));

    RingYear {
        year,
        in_progress: year >= today.year(),
        data_days: covered.len() as u32,
        workouts: workouts.len() as u32,
        active_days: active.len() as u32,
        duration_s,
        distance_m,
        runs,
        run_distance_m,
        weeks,
        busiest_month: busiest.map(|(i, _)| i as u32 + 1),
        busiest_month_workouts: busiest.map_or(0, |(_, n)| *n),
        longest_run: longest_run.map(highlight),
        longest_workout: longest_workout.map(highlight),
        steps_total: (!steps.is_empty()).then(|| steps.iter().sum()),
        steps_days: steps.len() as u32,
        sleep_avg_minutes: (!sleep.is_empty())
            .then(|| sleep.iter().sum::<i64>() as f64 / sleep.len() as f64),
        sleep_nights: sleep.len() as u32,
        personal_records: extras
            .records
            .iter()
            .filter(|(_, d)| in_year(d))
            .map(|(key, _)| *key)
            .collect(),
        races,
        stars,
    }
}

/// 纯函数：从有数据的第一年到今年，每年一圈。什么数据都没有就是空的。
pub fn build_rings(workouts: &[RingWorkout], extras: &RingExtras, today: NaiveDate) -> AnnualRings {
    let first = workouts
        .iter()
        .map(|w| w.date)
        .chain(extras.data_days.iter().copied())
        .filter(|d| *d <= today)
        .min();
    let mut by_year: BTreeMap<i32, Vec<&RingWorkout>> = BTreeMap::new();
    for w in workouts.iter().filter(|w| w.date <= today) {
        by_year.entry(w.date.year()).or_default().push(w);
    }
    let years = first
        .map(|first| {
            (first.year()..=today.year())
                .map(|year| {
                    let list = by_year.get(&year).map(Vec::as_slice).unwrap_or_default();
                    ring_year(year, today, list, extras)
                })
                .collect()
        })
        .unwrap_or_default();
    AnnualRings {
        years,
        today: today.to_string(),
    }
}

fn day(value: &str) -> Option<NaiveDate> {
    NaiveDate::parse_from_str(value, "%Y-%m-%d").ok()
}

impl Database {
    pub fn annual_rings(&self) -> Result<AnnualRings> {
        let mut statement = self.conn.prepare(
            "SELECT workout_id, date(start_time, 'localtime'),
                    COALESCE(workout_type_override, workout_type), distance_meters,
                    CAST(ROUND((julianday(end_time) - julianday(start_time)) * 86400) AS INTEGER)
               FROM workouts ORDER BY start_time",
        )?;
        let workouts = statement
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, Option<String>>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, Option<f64>>(3)?,
                    row.get::<_, Option<i64>>(4)?,
                ))
            })?
            .filter_map(|row| row.ok())
            .filter_map(|(workout_id, date, kind, distance_m, seconds)| {
                Some(RingWorkout {
                    workout_id,
                    date: day(date.as_deref()?)?,
                    kind,
                    distance_m: distance_m.filter(|m| m.is_finite() && *m > 0.0),
                    seconds: seconds.filter(|s| *s > 0 && *s <= MAX_WORKOUT_SECONDS),
                })
            })
            .collect::<Vec<_>>();

        let mut extras = RingExtras::default();
        let mut statement = self.conn.prepare(
            "SELECT DISTINCT date FROM daily_metrics
             UNION SELECT DISTINCT date(end_time, 'localtime') FROM sleep_sessions",
        )?;
        extras.data_days = statement
            .query_map([], |row| row.get::<_, Option<String>>(0))?
            .filter_map(|row| row.ok().flatten())
            .filter_map(|d| day(&d))
            .collect();
        let mut statement = self.conn.prepare(
            "SELECT date, CAST(MAX(value) AS INTEGER) FROM daily_metrics
              WHERE metric = 'steps' AND value > 0 GROUP BY date",
        )?;
        extras.steps = statement
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
            })?
            .filter_map(|row| row.ok())
            .filter_map(|(d, v)| Some((day(&d)?, v)))
            .collect();
        let mut statement = self.conn.prepare(
            "SELECT date(end_time, 'localtime'), MAX(duration_minutes) FROM sleep_sessions
              WHERE duration_minutes > 0 GROUP BY date(end_time, 'localtime')",
        )?;
        extras.sleep = statement
            .query_map([], |row| {
                Ok((row.get::<_, Option<String>>(0)?, row.get::<_, i64>(1)?))
            })?
            .filter_map(|row| row.ok())
            .filter_map(|(d, v)| Some((day(d.as_deref()?)?, v)))
            .collect();
        extras.records = self
            .personal_records()?
            .records
            .into_iter()
            .filter_map(|row| Some((row.key, day(&row.best?.date)?)))
            .collect();
        extras.races = self
            .list_races()?
            .into_iter()
            .filter_map(|race| {
                let input = race.input;
                Some((input.name, day(&input.race_date)?, input.result_seconds?))
            })
            .collect();

        Ok(build_rings(&workouts, &extras, Local::now().date_naive()))
    }
}

#[cfg(test)]
mod tests;
