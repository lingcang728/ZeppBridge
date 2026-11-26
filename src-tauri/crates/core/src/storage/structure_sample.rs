//! 随信附上的运动结构样本：从库里取出一次运动的原始报文（列表里的那一条摘要 + 明细），
//! 交给 [`crate::letters::structure_sample`] 脱敏。只读。

use super::*;
use crate::letters::structure_sample::{build_structure_sample, SamplePart, StructureSample};
use serde_json::Value;

/// 摘要报文里认这次运动的那几个键（高级通道是 `trackid`，官方通道各接口叫法不一）。
/// `(workout_id, start_time, workout_type, zepp_type, raw_record_id)`。
type SampleWorkoutRow = (String, String, String, Option<i64>, Option<i64>);

const ID_KEYS: &[&str] = &[
    "trackid",
    "id",
    "workout_id",
    "workoutId",
    "summaryId",
    "activityId",
];

impl Database {
    /// 一次运动的结构样本。`workout_id` 为空就取最近一次（隐藏的不算）；库里没有这次运动、
    /// 或者一段原始报文都没存，返回 `None`。
    pub fn workout_structure_sample(
        &self,
        workout_id: Option<&str>,
        app_version: &str,
    ) -> Result<Option<StructureSample>> {
        let row: Option<SampleWorkoutRow> = match workout_id {
            Some(id) => self
                .conn
                .query_row(
                    "SELECT workout_id, start_time, workout_type, zepp_type, raw_record_id
                       FROM workouts WHERE workout_id = ?1",
                    [id],
                    |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?)),
                )
                .optional()?,
            None => self
                .conn
                .query_row(
                    "SELECT workout_id, start_time, workout_type, zepp_type, raw_record_id
                       FROM workouts_visible ORDER BY start_time DESC LIMIT 1",
                    [],
                    |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?)),
                )
                .optional()?,
        };
        let Some((id, start_time, workout_type, zepp_type, raw_record_id)) = row else {
            return Ok(None);
        };
        let start_epoch = parse_datetime(&start_time, "workouts.start_time")?.timestamp();

        let mut parts = Vec::new();
        if let Some(summary) = raw_record_id
            .map(|raw_id| self.sample_payload(raw_id))
            .transpose()?
            .flatten()
            .and_then(|payload| find_workout_item(&payload, &id).cloned())
        {
            let channel = if summary.get("trackid").is_some() {
                "legacy"
            } else {
                "official"
            };
            parts.push(SamplePart {
                part: "summary",
                channel,
                payload: summary,
            });
        }

        let legacy_prefix = format!("workout_detail:{id}:");
        let official_key = format!("{}sport_detail:{id}", crate::official::fetch::SOURCE_PREFIX);
        let details: Vec<(i64, bool)> = {
            let mut statement = self.conn.prepare(
                "SELECT r.id, substr(r.source_key, 1, length(?1)) = ?1 FROM raw_records r
                  WHERE r.stream = 'workout_detail'
                    AND (substr(r.source_key, 1, length(?1)) = ?1 OR r.source_key = ?2)
                    AND NOT EXISTS (SELECT 1 FROM raw_quarantine q WHERE q.raw_record_id = r.id)
                  ORDER BY r.fetched_at DESC, r.id DESC",
            )?;
            let rows = statement.query_map(params![legacy_prefix, official_key], |r| {
                Ok((r.get::<_, i64>(0)?, r.get::<_, bool>(1)?))
            })?;
            rows.collect::<rusqlite::Result<_>>()?
        };
        // 每条通道只取最新的一份明细。
        for legacy in [true, false] {
            if let Some((raw_id, _)) = details.iter().find(|(_, is_legacy)| *is_legacy == legacy) {
                if let Some(payload) = self.sample_payload(*raw_id)? {
                    let channel = if legacy { "legacy" } else { "official" };
                    parts.push(SamplePart {
                        part: "detail",
                        channel,
                        payload,
                    });
                }
            }
        }
        if parts.is_empty() {
            return Ok(None);
        }
        Ok(Some(build_structure_sample(
            &id,
            &start_time,
            start_epoch,
            &workout_type,
            zepp_type,
            app_version,
            &parts,
        )))
    }

    fn sample_payload(&self, raw_id: i64) -> Result<Option<Value>> {
        let Some((stored, zip)) = self.raw_payload(raw_id)? else {
            return Ok(None);
        };
        let text = decode_raw_payload(stored, zip)?;
        Ok(serde_json::from_str(&text).ok())
    }
}

/// 摘要报文常常是一整页列表：找出这次运动的那一条（最里层、自己带着这次运动编号的对象）。
fn find_workout_item<'a>(payload: &'a Value, workout_id: &str) -> Option<&'a Value> {
    let matches = |value: &Value| match value {
        Value::String(text) => text == workout_id,
        Value::Number(number) => number.to_string() == workout_id,
        _ => false,
    };
    match payload {
        Value::Object(map) => {
            for value in map.values() {
                if let Some(found) = find_workout_item(value, workout_id) {
                    return Some(found);
                }
            }
            ID_KEYS
                .iter()
                .any(|key| map.get(*key).is_some_and(matches))
                .then_some(payload)
        }
        Value::Array(items) => items
            .iter()
            .find_map(|item| find_workout_item(item, workout_id)),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::find_workout_item;
    use serde_json::json;

    #[test]
    fn picks_the_one_workout_out_of_a_history_page() {
        let page = json!({ "code": 1, "data": { "summary": [
            { "trackid": "100", "type": 1 },
            { "trackid": "200", "type": 14, "laps": [{ "id": "x" }] },
        ] } });
        assert_eq!(find_workout_item(&page, "200").unwrap()["type"], 14);
        assert!(find_workout_item(&page, "300").is_none());
        let single = json!({ "trackid": 300 });
        assert_eq!(find_workout_item(&single, "300"), Some(&single));
    }

    /// 对着一份库副本生成样本，写到 `ZB_SAMPLE_OUT` 目录里逐字段核对：
    /// `ZB_SAMPLE_DB=<副本> ZB_SAMPLE_OUT=<目录> cargo test -p zeppbridge-core real_library_sample -- --ignored`
    #[test]
    #[ignore = "needs a copy of a real library"]
    fn real_library_sample() {
        let (Ok(db_path), Ok(out)) = (
            std::env::var("ZB_SAMPLE_DB"),
            std::env::var("ZB_SAMPLE_OUT"),
        ) else {
            return;
        };
        let db = crate::storage::Database::open_read_only_any_version(db_path.into()).unwrap();
        let ids: Vec<String> = {
            let mut statement = db
                .conn
                .prepare("SELECT workout_id FROM workouts_visible GROUP BY workout_type ORDER BY MAX(start_time) DESC")
                .unwrap();
            let rows = statement.query_map([], |row| row.get(0)).unwrap();
            rows.collect::<rusqlite::Result<_>>().unwrap()
        };
        for id in ids {
            if let Some(sample) = db.workout_structure_sample(Some(&id), "0.0.0").unwrap() {
                let name = format!(
                    "{}-{}.json",
                    sample.workout_type.replace(':', "_"),
                    sample.bytes
                );
                std::fs::write(std::path::Path::new(&out).join(name), sample.json).unwrap();
            }
        }
    }
}
