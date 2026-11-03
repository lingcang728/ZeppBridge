//! 一次运动的感受：自己打的 RPE、哪儿酸、穿哪双鞋。
//!
//! 手表记的 RPE 在 `workouts.rpe`，是云端的事实，不覆盖；用户自己打的另存，界面和交给 AI 时
//! 两个都给、写明谁记的。一项都没填的运动不留行。
use super::shoes::{assign, ShoeAssignment};
use super::{invalid, valid_body_part};
use crate::models::error::Result;
use crate::storage::Database;
use chrono::Utc;
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AnnotationInput {
    pub workout_id: String,
    pub rpe: Option<u8>,
    #[serde(default)]
    pub soreness: Vec<String>,
    /// `auto` / `none` / `chosen`。
    pub shoe_mode: String,
    #[serde(default)]
    pub shoe_id: Option<i64>,
}

/// 能选的一双鞋（同一用途、没退役的在前）。
#[derive(Debug, Clone, Serialize)]
pub struct ShoeChoice {
    pub id: i64,
    pub name: String,
    pub sport: String,
    pub retired: bool,
}

/// 运动详情里「你的感受」那张卡要的全部东西。
#[derive(Debug, Clone, Serialize)]
pub struct WorkoutFeel {
    pub workout_id: String,
    /// 自己打的 RPE。
    pub rpe: Option<u8>,
    /// 手表记的 RPE（云端给的）。
    pub watch_rpe: Option<i32>,
    pub soreness: Vec<String>,
    pub shoe_mode: String,
    pub shoe_id: Option<i64>,
    /// 这次运动该穿哪类鞋；`None` 是不穿鞋的运动，界面不问鞋。
    pub footwear: Option<&'static str>,
    /// 现在实际算在哪双鞋上、为什么。
    pub assigned: Option<ShoeAssignment>,
    pub choices: Vec<ShoeChoice>,
}

fn parse_soreness(raw: &str) -> Vec<String> {
    serde_json::from_str::<Vec<String>>(raw)
        .unwrap_or_default()
        .into_iter()
        .filter(|part| valid_body_part(part))
        .collect()
}

/// 交给 AI 的感受：用户自己打的 RPE 和酸痛部位。
pub type FeelForAi = (Option<u8>, Vec<String>);

impl Database {
    pub fn workout_feel(&self, workout_id: &str) -> Result<Option<WorkoutFeel>> {
        let watch_rpe: Option<Option<i32>> = self
            .conn
            .query_row(
                "SELECT rpe FROM workouts_visible WHERE workout_id = ?1",
                [workout_id],
                |row| row.get(0),
            )
            .optional()?;
        let Some(watch_rpe) = watch_rpe else {
            return Ok(None);
        };
        let stored: Option<(Option<u8>, String, String, Option<i64>)> = self
            .conn
            .query_row(
                "SELECT rpe, soreness, shoe_mode, shoe_id FROM workout_annotations WHERE workout_id = ?1",
                [workout_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )
            .optional()?;
        let (rpe, soreness, shoe_mode, shoe_id) =
            stored.unwrap_or((None, "[]".into(), "auto".into(), None));
        let footwear_workout = self.footwear_workouts(Some(workout_id))?.into_iter().next();
        let shoes = self.list_shoe_rows()?;
        let footwear = footwear_workout.as_ref().map(|w| w.family);
        let assigned = footwear_workout.as_ref().map(|w| assign(w, &shoes));
        let mut choices: Vec<ShoeChoice> = shoes
            .iter()
            .filter(|_| footwear.is_some())
            .map(|shoe| ShoeChoice {
                id: shoe.input.id.unwrap_or_default(),
                name: shoe.input.name.clone(),
                sport: shoe.input.sport.clone(),
                retired: shoe.input.retired_on.is_some(),
            })
            .collect();
        // 同一用途的排前面，退役的排最后；越野跑也把跑鞋排前面。
        let rank = |choice: &ShoeChoice| {
            let fits = footwear
                .is_some_and(|f| choice.sport == f || (f == "trail" && choice.sport == "running"));
            (choice.retired, !fits)
        };
        choices.sort_by_key(rank);
        Ok(Some(WorkoutFeel {
            workout_id: workout_id.to_string(),
            rpe,
            watch_rpe,
            soreness: parse_soreness(&soreness),
            shoe_mode,
            shoe_id,
            footwear,
            assigned,
            choices,
        }))
    }

    /// 存一次运动的感受。全空（没 RPE、不酸、鞋自动认）就删掉那一行。
    pub fn save_workout_feel(&self, input: &AnnotationInput) -> Result<()> {
        let mut soreness: Vec<&str> = input.soreness.iter().map(String::as_str).collect();
        soreness.sort_unstable();
        soreness.dedup();
        let exists: bool = self
            .conn
            .query_row(
                "SELECT 1 FROM workouts_visible WHERE workout_id = ?1",
                [&input.workout_id],
                |_| Ok(true),
            )
            .optional()?
            .is_some();
        let shoe_ok = match input.shoe_mode.as_str() {
            "auto" | "none" => input.shoe_id.is_none(),
            "chosen" => match input.shoe_id {
                Some(id) => self
                    .conn
                    .query_row("SELECT 1 FROM shoes WHERE id = ?1", [id], |_| Ok(true))
                    .optional()?
                    .is_some(),
                None => false,
            },
            _ => false,
        };
        if !exists
            || !shoe_ok
            || input.rpe.is_some_and(|rpe| !(1..=10).contains(&rpe))
            || soreness.len() > 20
            || soreness.iter().any(|part| !valid_body_part(part))
        {
            return Err(invalid("运动感受的内容不对"));
        }
        if input.rpe.is_none() && soreness.is_empty() && input.shoe_mode == "auto" {
            self.conn.execute(
                "DELETE FROM workout_annotations WHERE workout_id = ?1",
                [&input.workout_id],
            )?;
            return Ok(());
        }
        let soreness = serde_json::to_string(&soreness).unwrap_or_else(|_| "[]".into());
        self.conn.execute(
            "INSERT INTO workout_annotations(workout_id, rpe, soreness, shoe_mode, shoe_id, updated_at)
             VALUES(?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT(workout_id) DO UPDATE SET rpe = excluded.rpe, soreness = excluded.soreness,
                 shoe_mode = excluded.shoe_mode, shoe_id = excluded.shoe_id, updated_at = excluded.updated_at",
            params![input.workout_id, input.rpe, soreness, input.shoe_mode, input.shoe_id, Utc::now().to_rfc3339()],
        )?;
        Ok(())
    }

    /// 交给 AI 用：一段时间里用户自己打的 RPE 和酸痛（工作 ID → (RPE, 部位)）。
    pub fn workout_feel_map(&self) -> Result<std::collections::HashMap<String, FeelForAi>> {
        let mut statement = self
            .conn
            .prepare("SELECT workout_id, rpe, soreness FROM workout_annotations")?;
        let rows = statement.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, Option<u8>>(1)?,
                row.get::<_, String>(2)?,
            ))
        })?;
        let mut out = std::collections::HashMap::new();
        for row in rows {
            let (id, rpe, soreness) = row?;
            out.insert(id, (rpe, parse_soreness(&soreness)));
        }
        Ok(out)
    }
}
