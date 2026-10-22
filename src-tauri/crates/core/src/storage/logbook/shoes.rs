//! 跑鞋：登记、按用途设默认鞋、累计里程、到里程提醒退役。
//!
//! 一次运动算在哪双鞋上，按这个顺序认（[`Database::shoe_assignments`]）：
//!
//! 1. 用户在这次运动上指定了（`workout_annotations.shoe_mode = chosen`），或明说没穿登记过的鞋（`none`）；
//! 2. Zepp 摘要里的 `gearId` 认到了某双鞋（用户在手表 / App 里选过鞋，云端只给编号）；
//! 3. 这类运动的默认鞋，而且那天在这双鞋的服役期里（`started_on` ≤ 那天 ≤ `retired_on`）。
//!    越野跑没有越野鞋默认时用跑鞋的默认。
//!
//! 里程 = 登记前已跑的 `start_km` + 认到这双鞋的每次运动的距离。没有距离的运动不算里程（不编）。
use super::{clean_text, footwear_family, invalid, valid_date};
use crate::models::error::Result;
use crate::storage::Database;
use chrono::Utc;
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

pub const SHOE_SPORTS: [&str; 4] = ["running", "trail", "walking", "hiking"];
/// 一个 Zepp 鞋编号只能认到一双鞋；命令层按这句原文换成自己的错误码。
pub const GEAR_TAKEN: &str = "这个 Zepp 鞋编号已经认到别的鞋上了";
/// 退役提醒里程的默认值（常见建议 600–800 km）。
pub const DEFAULT_RETIRE_KM: f64 = 700.0;
/// 到退役里程的九成就开始提醒「快到了」。
pub const NEAR_RETIRE_SHARE: f64 = 0.9;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ShoeInput {
    pub id: Option<i64>,
    pub name: String,
    pub sport: String,
    #[serde(default)]
    pub is_default: bool,
    #[serde(default)]
    pub zepp_gear_id: Option<String>,
    #[serde(default)]
    pub start_km: f64,
    pub retire_km: f64,
    pub started_on: String,
    #[serde(default)]
    pub retired_on: Option<String>,
    #[serde(default)]
    pub notes: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct Shoe {
    #[serde(flatten)]
    pub input: ShoeInput,
    pub created_at: String,
    pub updated_at: String,
}

/// 列表里的一双鞋：带上累计里程和退役提醒。
#[derive(Debug, Clone, Serialize)]
pub struct ShoeSummary {
    #[serde(flatten)]
    pub shoe: Shoe,
    /// 总里程（含 `start_km`），km。
    pub km: f64,
    /// 认到这双鞋的运动次数。
    pub workouts: i64,
    pub last_used: Option<String>,
    /// `fresh` / `near`（到九成）/ `due`（到了）/ `retired`（已经退役）。
    pub wear: &'static str,
}

/// Zepp 里记过、还没认到任何一双登记鞋的鞋编号。界面上给它起个名字就登记成一双鞋。
#[derive(Debug, Clone, Serialize)]
pub struct UnknownGear {
    pub zepp_gear_id: String,
    pub workouts: i64,
    pub km: f64,
    pub first_used: String,
    pub last_used: String,
    /// 主要用在哪类运动上（跑步 / 越野 / 走路 / 徒步），登记时当默认用途。
    pub sport: Option<&'static str>,
}

/// 一次运动算在哪双鞋上、为什么。
#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
pub struct ShoeAssignment {
    pub shoe_id: Option<i64>,
    /// `chosen` 用户指定 / `none` 用户说没穿登记的鞋 / `zepp` 按 Zepp 的鞋编号 / `default` 默认鞋 / `unknown` 认不出。
    pub how: &'static str,
}

/// 认鞋要用到的一次运动。
pub(crate) struct FootwearWorkout {
    pub family: &'static str,
    pub date: String,
    pub distance_m: Option<f64>,
    pub gear_id: Option<String>,
    pub mode: Option<String>,
    pub shoe_id: Option<i64>,
}

const SHOE_COLUMNS: &str = "id, name, sport, is_default, zepp_gear_id, start_km, retire_km,
                            started_on, retired_on, notes, created_at, updated_at";

fn shoe_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Shoe> {
    Ok(Shoe {
        input: ShoeInput {
            id: Some(row.get(0)?),
            name: row.get(1)?,
            sport: row.get(2)?,
            is_default: row.get::<_, i64>(3)? != 0,
            zepp_gear_id: row.get(4)?,
            start_km: row.get(5)?,
            retire_km: row.get(6)?,
            started_on: row.get(7)?,
            retired_on: row.get(8)?,
            notes: row.get(9)?,
        },
        created_at: row.get(10)?,
        updated_at: row.get(11)?,
    })
}

fn in_service(shoe: &ShoeInput, date: &str) -> bool {
    shoe.started_on.as_str() <= date && shoe.retired_on.as_deref().is_none_or(|end| date <= end)
}

/// 纯函数：按上面的顺序认鞋。`shoes` 是全部登记的鞋。
pub(crate) fn assign(workout: &FootwearWorkout, shoes: &[Shoe]) -> ShoeAssignment {
    match workout.mode.as_deref() {
        Some("none") => {
            return ShoeAssignment {
                shoe_id: None,
                how: "none",
            }
        }
        Some("chosen")
            if workout
                .shoe_id
                .is_some_and(|id| shoes.iter().any(|s| s.input.id == Some(id))) =>
        {
            return ShoeAssignment {
                shoe_id: workout.shoe_id,
                how: "chosen",
            };
        }
        _ => {}
    }
    if let Some(gear) = workout.gear_id.as_deref() {
        if let Some(shoe) = shoes
            .iter()
            .find(|s| s.input.zepp_gear_id.as_deref() == Some(gear))
        {
            return ShoeAssignment {
                shoe_id: shoe.input.id,
                how: "zepp",
            };
        }
    }
    let default_for = |sport: &str| {
        shoes.iter().find(|s| {
            s.input.is_default && s.input.sport == sport && in_service(&s.input, &workout.date)
        })
    };
    let fallback = default_for(workout.family).or_else(|| {
        (workout.family == "trail")
            .then(|| default_for("running"))
            .flatten()
    });
    match fallback {
        Some(shoe) => ShoeAssignment {
            shoe_id: shoe.input.id,
            how: "default",
        },
        None => ShoeAssignment {
            shoe_id: None,
            how: "unknown",
        },
    }
}

/// 没登记的鞋编号的累计：次数、公里、首次日期、末次日期、各运动族次数。
type GearTally = (i64, f64, String, String, HashMap<&'static str, i64>);

impl Database {
    pub fn list_shoe_rows(&self) -> Result<Vec<Shoe>> {
        let mut statement = self.conn.prepare(&format!(
            "SELECT {SHOE_COLUMNS} FROM shoes ORDER BY retired_on IS NOT NULL, started_on DESC, id DESC"
        ))?;
        let rows = statement.query_map([], shoe_row)?;
        Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
    }

    /// 所有穿鞋的运动（跑、越野、跑步机、走路、徒步），带上用户的指认。
    pub(crate) fn footwear_workouts(&self, only: Option<&str>) -> Result<Vec<FootwearWorkout>> {
        let mut statement = self.conn.prepare(
            "SELECT w.workout_id, COALESCE(w.workout_type_override, w.workout_type),
                    date(w.start_time, 'localtime'), w.distance_meters, w.gear_id,
                    a.shoe_mode, a.shoe_id
               FROM workouts w LEFT JOIN workout_annotations a ON a.workout_id = w.workout_id
              WHERE (?1 IS NULL OR w.workout_id = ?1)
              ORDER BY w.start_time",
        )?;
        let rows = statement.query_map([only], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, Option<f64>>(3)?,
                row.get::<_, Option<String>>(4)?,
                row.get::<_, Option<String>>(5)?,
                row.get::<_, Option<i64>>(6)?,
            ))
        })?;
        let mut out = Vec::new();
        for row in rows {
            let (_, kind, date, distance_m, gear_id, mode, shoe_id) = row?;
            if let Some(family) = footwear_family(&kind) {
                out.push(FootwearWorkout {
                    family,
                    date,
                    distance_m,
                    gear_id,
                    mode,
                    shoe_id,
                });
            }
        }
        Ok(out)
    }

    /// 每双鞋的里程和退役提醒，外加 Zepp 里记过却还没登记的鞋编号。
    pub fn shoe_overview(&self) -> Result<(Vec<ShoeSummary>, Vec<UnknownGear>)> {
        let shoes = self.list_shoe_rows()?;
        let workouts = self.footwear_workouts(None)?;
        let mut totals: HashMap<i64, (f64, i64, Option<String>)> = HashMap::new();
        let mut unknown: HashMap<String, GearTally> = HashMap::new();
        for workout in &workouts {
            let assignment = assign(workout, &shoes);
            let meters = workout
                .distance_m
                .filter(|m| m.is_finite() && *m > 0.0)
                .unwrap_or(0.0);
            if let Some(id) = assignment.shoe_id {
                let entry = totals.entry(id).or_insert((0.0, 0, None));
                entry.0 += meters / 1000.0;
                entry.1 += 1;
                entry.2 = Some(workout.date.clone());
            } else if let (Some(gear), "unknown") = (workout.gear_id.as_ref(), assignment.how) {
                let entry = unknown.entry(gear.clone()).or_insert((
                    0,
                    0.0,
                    workout.date.clone(),
                    workout.date.clone(),
                    HashMap::new(),
                ));
                entry.0 += 1;
                entry.1 += meters / 1000.0;
                entry.3 = workout.date.clone();
                *entry.4.entry(workout.family).or_default() += 1;
            }
        }
        let summaries = shoes
            .into_iter()
            .map(|shoe| {
                let id = shoe.input.id.unwrap_or_default();
                let (km, count, last) = totals.remove(&id).unwrap_or((0.0, 0, None));
                let km = ((shoe.input.start_km + km) * 10.0).round() / 10.0;
                let wear = if shoe.input.retired_on.is_some() {
                    "retired"
                } else if km >= shoe.input.retire_km {
                    "due"
                } else if km >= shoe.input.retire_km * NEAR_RETIRE_SHARE {
                    "near"
                } else {
                    "fresh"
                };
                ShoeSummary {
                    shoe,
                    km,
                    workouts: count,
                    last_used: last,
                    wear,
                }
            })
            .collect();
        let mut gear: Vec<UnknownGear> = unknown
            .into_iter()
            .map(
                |(zepp_gear_id, (workouts, km, first_used, last_used, families))| UnknownGear {
                    zepp_gear_id,
                    workouts,
                    km: (km * 10.0).round() / 10.0,
                    first_used,
                    last_used,
                    sport: families
                        .into_iter()
                        .max_by_key(|(_, count)| *count)
                        .map(|(family, _)| family),
                },
            )
            .collect();
        gear.sort_by(|a, b| b.last_used.cmp(&a.last_used));
        Ok((summaries, gear))
    }

    /// 登记或改一双鞋；设成默认时，同一用途的其它鞋自动不再是默认。
    pub fn save_shoe(&self, input: &ShoeInput) -> Result<i64> {
        let name = clean_text(&input.name, 80, "鞋名为空或太长")?;
        let notes = input.notes.trim();
        let zepp = input
            .zepp_gear_id
            .as_deref()
            .map(str::trim)
            .filter(|g| !g.is_empty());
        if !SHOE_SPORTS.contains(&input.sport.as_str())
            || !(0.0..=10_000.0).contains(&input.start_km)
            || !(100.0..=5_000.0).contains(&input.retire_km)
            || !valid_date(&input.started_on)
            || input
                .retired_on
                .as_deref()
                .is_some_and(|end| !valid_date(end) || end < input.started_on.as_str())
            || notes.chars().count() > 1000
            || zepp.is_some_and(|g| g.chars().count() > 80)
            || input.id.is_some_and(|id| id <= 0)
        {
            return Err(invalid("跑鞋信息不对"));
        }
        if let Some(gear) = zepp {
            let taken: Option<i64> = self
                .conn
                .query_row(
                    "SELECT id FROM shoes WHERE zepp_gear_id = ?1 AND id IS NOT ?2",
                    params![gear, input.id],
                    |row| row.get(0),
                )
                .optional()?;
            if taken.is_some() {
                return Err(invalid(GEAR_TAKEN));
            }
        }
        let now = Utc::now().to_rfc3339();
        let is_default = input.is_default && input.retired_on.is_none();
        let id = match input.id {
            Some(id) => {
                let changed = self.conn.execute(
                    "UPDATE shoes SET name=?1, sport=?2, is_default=?3, zepp_gear_id=?4, start_km=?5,
                         retire_km=?6, started_on=?7, retired_on=?8, notes=?9, updated_at=?10 WHERE id=?11",
                    params![name, input.sport, is_default, zepp, input.start_km, input.retire_km,
                        input.started_on, input.retired_on, notes, now, id],
                )?;
                if changed == 0 {
                    return Err(invalid("找不到这双鞋"));
                }
                id
            }
            None => {
                self.conn.execute(
                    "INSERT INTO shoes(name, sport, is_default, zepp_gear_id, start_km, retire_km,
                         started_on, retired_on, notes, created_at, updated_at)
                     VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10)",
                    params![
                        name,
                        input.sport,
                        is_default,
                        zepp,
                        input.start_km,
                        input.retire_km,
                        input.started_on,
                        input.retired_on,
                        notes,
                        now
                    ],
                )?;
                self.conn.last_insert_rowid()
            }
        };
        if is_default {
            self.conn.execute(
                "UPDATE shoes SET is_default = 0 WHERE sport = ?1 AND id != ?2",
                params![input.sport, id],
            )?;
        }
        Ok(id)
    }

    /// 删掉一双鞋。指定穿它的运动回到「自动认」，不留指向不存在的鞋的指认。
    pub fn delete_shoe(&self, id: i64) -> Result<()> {
        self.conn.execute(
            "UPDATE workout_annotations SET shoe_mode = 'auto', shoe_id = NULL WHERE shoe_id = ?1",
            [id],
        )?;
        self.conn.execute("DELETE FROM shoes WHERE id = ?1", [id])?;
        Ok(())
    }
}
