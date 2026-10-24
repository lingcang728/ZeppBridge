//! Local, reversible workout edits. Raw cloud records are never changed.
use super::*;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct WorkoutLocalState {
    pub workout_id: String,
    pub type_override: Option<String>,
    pub hidden: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkoutEdit {
    pub id: String,
    pub changed: usize,
}

impl Database {
    fn workout_local_state(&self, id: &str) -> Result<WorkoutLocalState> {
        // Check the base table: a hidden workout must remain editable/restorable.
        let type_override = self
            .conn
            .query_row(
                "SELECT workout_type_override FROM workouts WHERE workout_id = ?1",
                [id],
                |row| row.get::<_, Option<String>>(0),
            )
            .optional()?
            .ok_or_else(|| ZeppBridgeError::DataUnavailable("运动记录不存在".into()))?;
        let hidden = self
            .conn
            .query_row(
                "SELECT hidden FROM workout_local_state WHERE workout_id = ?1",
                [id],
                |row| row.get::<_, bool>(0),
            )
            .optional()?
            .unwrap_or(false);
        Ok(WorkoutLocalState {
            workout_id: id.into(),
            type_override,
            hidden,
        })
    }

    fn write_workout_local_state(&self, state: &WorkoutLocalState) -> Result<()> {
        self.conn.execute(
            "INSERT INTO workout_local_state(workout_id, type_override, hidden) VALUES(?1, ?2, ?3)
             ON CONFLICT(workout_id) DO UPDATE SET type_override = excluded.type_override, hidden = excluded.hidden",
            params![state.workout_id, state.type_override, state.hidden],
        )?;
        self.conn.execute(
            "UPDATE workouts SET workout_type_override = ?2 WHERE workout_id = ?1",
            params![state.workout_id, state.type_override],
        )?;
        Ok(())
    }

    pub fn edit_workouts(
        &self,
        ids: &[String],
        workout_type: Option<Option<&str>>,
        hidden: Option<bool>,
    ) -> Result<WorkoutEdit> {
        let ids: BTreeSet<&str> = ids.iter().map(String::as_str).collect();
        if ids.is_empty() || ids.len() > 1000 || ids.iter().any(|id| id.trim().is_empty()) {
            return Err(ZeppBridgeError::ConfigError("请选择1至1000条运动".into()));
        }
        let normalized = workout_type
            .flatten()
            .map(str::trim)
            .filter(|v| !v.is_empty())
            .map(str::to_lowercase);
        if normalized
            .as_deref()
            .is_some_and(|v| !crate::sport_catalog::is_known_key(v))
        {
            return Err(ZeppBridgeError::ConfigError("不支持的运动类型纠正".into()));
        }
        let tx = self.conn.unchecked_transaction()?;
        let before: Vec<_> = ids
            .iter()
            .map(|id| self.workout_local_state(id))
            .collect::<Result<_>>()?;
        let mut after = before.clone();
        for state in &mut after {
            if workout_type.is_some() {
                state.type_override = normalized.clone();
            }
            if let Some(hidden) = hidden {
                state.hidden = hidden;
            }
            self.write_workout_local_state(state)?;
        }
        let id = format!("edit-{}-{}", std::process::id(), crate::unique_suffix());
        let encode = |states: &[WorkoutLocalState]| {
            serde_json::to_string(states).map_err(|e| ZeppBridgeError::ParseError(e.to_string()))
        };
        self.conn.execute("INSERT INTO workout_edit_history(id, before_json, after_json, created_at) VALUES(?1, ?2, ?3, ?4)", params![id, encode(&before)?, encode(&after)?, Utc::now().to_rfc3339()])?;
        tx.commit()?;
        if before != after {
            note_content_change();
        }
        Ok(WorkoutEdit {
            id,
            changed: after.len(),
        })
    }

    pub fn undo_workout_edit(&self, id: &str) -> Result<usize> {
        let tx = self.conn.unchecked_transaction()?;
        let (revision, before, after): (i64, String, String) = self.conn.query_row(
            "SELECT rowid, before_json, after_json FROM workout_edit_history WHERE id = ?1 AND undone = 0", [id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        ).optional()?.ok_or_else(|| ZeppBridgeError::DataUnavailable("没有可撤销的修改".into()))?;
        let decode = |s: &str| {
            serde_json::from_str::<Vec<WorkoutLocalState>>(s)
                .map_err(|e| ZeppBridgeError::ParseError(e.to_string()))
        };
        let before = decode(&before)?;
        // Equality alone misses A -> B -> A: the newest state can equal this
        // batch's result while a newer, still active edit owns that state.
        let affected: BTreeSet<_> = before.iter().map(|s| s.workout_id.as_str()).collect();
        let mut newer = self.conn.prepare(
            "SELECT after_json FROM workout_edit_history WHERE rowid > ?1 AND undone = 0",
        )?;
        let newer = newer.query_map([revision], |row| row.get::<_, String>(0))?;
        for states in newer {
            if decode(&states?)?
                .iter()
                .any(|s| affected.contains(s.workout_id.as_str()))
            {
                return Err(ZeppBridgeError::ConfigError(
                    "记录已再次修改，请先撤销较新的修改".into(),
                ));
            }
        }
        for expected in decode(&after)? {
            if self.workout_local_state(&expected.workout_id)? != expected {
                return Err(ZeppBridgeError::ConfigError(
                    "记录已再次修改，请先撤销较新的修改".into(),
                ));
            }
        }
        for state in &before {
            self.write_workout_local_state(state)?;
        }
        self.conn.execute(
            "UPDATE workout_edit_history SET undone = 1 WHERE id = ?1",
            [id],
        )?;
        tx.commit()?;
        note_content_change();
        Ok(before.len())
    }

    pub fn hidden_workouts_page(&self, limit: usize, offset: usize) -> Result<Vec<Workout>> {
        self.workouts_page_in(limit, offset, true)
    }

    pub fn count_hidden_workouts(&self) -> Result<i64> {
        self.conn
            .query_row("SELECT COUNT(*) FROM workouts_hidden", [], |row| row.get(0))
            .map_err(Into::into)
    }
}
