//! Evidence for complete workout days, independent of generic daily metrics.
//! Versioned app metadata avoids interpreting older, weaker coverage ledgers.
use super::*;
use crate::fetcher::FetchedRecord;
use chrono::TimeZone;

const PREFIX: &str = "workout_day_complete_v1:";

#[derive(Serialize, Deserialize)]
pub(crate) struct WorkoutDayEvidence {
    day: String,
    start: i64,
    end: i64,
    ids: BTreeSet<String>,
}

/// Reject unknown envelopes, skipped records, missing pages and stalled cursors.
/// This deliberately requires an explicit terminal cursor, not just HTTP success.
pub(crate) fn workout_day_evidence(records: &[FetchedRecord]) -> Vec<WorkoutDayEvidence> {
    let Some(first) = records.first() else {
        return vec![];
    };
    let start = first.raw.start_utc;
    let Some(end) = first.raw.end_utc else {
        return vec![];
    };
    let mut cursor = end.timestamp();
    let mut workouts = Vec::new();
    for (index, record) in records.iter().enumerate() {
        if record.incomplete
            || record.raw.stream != "workouts"
            || record.raw.start_utc != start
            || record.raw.end_utc != Some(end)
            || record.raw.source_key != format!("sport_history:run:{}:{cursor}", start.timestamp())
        {
            return vec![];
        }
        let Some(next) = record
            .raw
            .payload
            .pointer("/data/next")
            .and_then(serde_json::Value::as_i64)
        else {
            return vec![];
        };
        let Some(data) = record.raw.payload.get("data") else {
            return vec![];
        };
        let Some(items) = ["items", "records", "results", "list"]
            .iter()
            .find_map(|key| data.get(key).and_then(serde_json::Value::as_array))
        else {
            return vec![];
        };
        if !items.is_empty() {
            let Ok(parsed) = Normalizer::normalize_workouts_with_sport(&record.raw.payload, None)
            else {
                return vec![];
            };
            if parsed.len() != items.len() {
                return vec![];
            }
            workouts.extend(parsed);
        }
        let terminal = next <= 0 || next <= start.timestamp();
        if terminal != (index + 1 == records.len()) || (!terminal && next >= cursor) {
            return vec![];
        }
        cursor = next;
    }
    let mut result = Vec::new();
    let mut day = start.with_timezone(&Local).date_naive();
    let last = end
        .with_timezone(&Local)
        .date_naive()
        .min(Local::now().date_naive());
    while day < last {
        let next_day = day + Duration::days(1);
        if let (Some(a), Some(b)) = (
            Local
                .from_local_datetime(&day.and_hms_opt(0, 0, 0).unwrap())
                .single(),
            Local
                .from_local_datetime(&next_day.and_hms_opt(0, 0, 0).unwrap())
                .single(),
        ) {
            if a.with_timezone(&Utc) >= start && b.with_timezone(&Utc) <= end {
                result.push(WorkoutDayEvidence {
                    day: day.to_string(),
                    start: a.timestamp(),
                    end: b.timestamp(),
                    ids: workouts
                        .iter()
                        .filter(|w| w.start_time >= a && w.start_time < b)
                        .map(|w| w.workout_id.clone())
                        .collect(),
                });
            }
        }
        day = next_day;
    }
    result
}

impl Database {
    fn workout_ids_on_day(&self, day: &str) -> Result<BTreeSet<String>> {
        let mut stmt = self
            .conn
            .prepare("SELECT workout_id FROM workouts WHERE date(start_time, 'localtime') = ?1")?;
        let rows = stmt.query_map([day], |r| r.get::<_, String>(0))?;
        Ok(rows.collect::<rusqlite::Result<_>>()?)
    }

    pub(crate) fn record_workout_day_evidence(
        &self,
        evidence: &[WorkoutDayEvidence],
    ) -> Result<()> {
        for item in evidence {
            // Also catches failed writes and locally retained workouts omitted by cloud.
            if self.workout_ids_on_day(&item.day)? == item.ids {
                self.set_app_meta(
                    &format!("{PREFIX}{}", item.day),
                    &serde_json::to_string(item)
                        .map_err(|e| ZeppBridgeError::ParseError(e.to_string()))?,
                )?;
            } else {
                self.conn.execute(
                    "DELETE FROM app_meta WHERE key = ?1",
                    [format!("{PREFIX}{}", item.day)],
                )?;
            }
        }
        Ok(())
    }

    pub(super) fn complete_workout_days(&self, start: &str, end: &str) -> Result<BTreeSet<String>> {
        let mut stmt = self
            .conn
            .prepare("SELECT value FROM app_meta WHERE key BETWEEN ?1 AND ?2")?;
        let rows = stmt.query_map(
            params![format!("{PREFIX}{start}"), format!("{PREFIX}{end}")],
            |r| r.get::<_, String>(0),
        )?;
        let mut days = BTreeSet::new();
        for row in rows {
            let Ok(item) = serde_json::from_str::<WorkoutDayEvidence>(&row?) else {
                continue;
            };
            let Ok(day) = NaiveDate::parse_from_str(&item.day, "%Y-%m-%d") else {
                continue;
            };
            let a = Local
                .from_local_datetime(&day.and_hms_opt(0, 0, 0).unwrap())
                .single();
            let b = Local
                .from_local_datetime(&(day + Duration::days(1)).and_hms_opt(0, 0, 0).unwrap())
                .single();
            // Timezone changes or removed/moved workouts invalidate the evidence.
            if a.map(|v| v.timestamp()) == Some(item.start)
                && b.map(|v| v.timestamp()) == Some(item.end)
                && self.workout_ids_on_day(&item.day)? == item.ids
            {
                days.insert(item.day);
            }
        }
        Ok(days)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn page(cursor: i64, next: serde_json::Value, items: serde_json::Value) -> FetchedRecord {
        let start = Utc.with_ymd_and_hms(2023, 11, 1, 12, 0, 0).unwrap();
        let end = start + Duration::days(30);
        FetchedRecord {
            raw: RawRecord {
                stream: "workouts".into(),
                source_key: format!("sport_history:run:{}:{cursor}", start.timestamp()),
                source_scope: SourceScope::Device,
                device_id: None,
                start_utc: start,
                end_utc: Some(end),
                payload: serde_json::json!({"data":{"items":items,"next":next}}),
                capability: CapabilityStatus::Verified,
            },
            incomplete: false,
            incomplete_reason: None,
        }
    }

    #[test]
    fn workout_evidence_requires_terminal_pagination_and_recognized_records() {
        let end = Utc
            .with_ymd_and_hms(2023, 12, 1, 12, 0, 0)
            .unwrap()
            .timestamp();
        let empty = serde_json::json!([]);
        assert!(!workout_day_evidence(&[page(end, (-1).into(), empty.clone())]).is_empty());
        for next in [
            serde_json::Value::Null,
            end.into(),
            (end + 1).into(),
            (end - 100).into(),
        ] {
            assert!(workout_day_evidence(&[page(end, next, empty.clone())]).is_empty());
        }
        assert!(!workout_day_evidence(&[
            page(end, (end - 100).into(), empty.clone()),
            page(end - 100, (-1).into(), empty.clone()),
        ])
        .is_empty());
        assert!(workout_day_evidence(&[page(
            end,
            (-1).into(),
            serde_json::json!([{"invalid":true}])
        )])
        .is_empty());
        let mut incomplete = page(end, (-1).into(), empty.clone());
        incomplete.incomplete = true;
        assert!(workout_day_evidence(&[incomplete]).is_empty());
        let mut unknown = page(end, (-1).into(), empty);
        unknown.raw.payload = serde_json::json!({"data":{"next":-1}});
        assert!(workout_day_evidence(&[unknown]).is_empty());
    }

    #[test]
    fn workout_evidence_only_covers_full_local_days_and_matching_rows() {
        let end = Utc
            .with_ymd_and_hms(2023, 12, 1, 12, 0, 0)
            .unwrap()
            .timestamp();
        let record = page(end, (-1).into(), serde_json::json!([]));
        let start = record.raw.start_utc.timestamp();
        let evidence = workout_day_evidence(&[record]);
        assert!(evidence.iter().all(|d| d.start >= start && d.end <= end));
        assert!(evidence.iter().all(|d| d.end > d.start));
        let db = Database::in_memory().unwrap();
        db.record_workout_day_evidence(&evidence).unwrap();
        assert_eq!(
            db.complete_workout_days("2023-11-01", "2023-12-02")
                .unwrap()
                .len(),
            evidence.len()
        );
        let item = &evidence[0];
        let ts = DateTime::from_timestamp(item.start + 3600, 0)
            .unwrap()
            .to_rfc3339();
        db.conn.execute("INSERT INTO workouts(workout_id, workout_type, start_time, end_time, source_scope) VALUES ('extra','run',?1,?1,'device')", [&ts]).unwrap();
        assert!(!db
            .complete_workout_days("2023-11-01", "2023-12-02")
            .unwrap()
            .contains(&item.day));
        db.record_workout_day_evidence(&evidence).unwrap();
        assert!(db
            .get_app_meta(&format!("{PREFIX}{}", item.day))
            .unwrap()
            .is_none());
    }
}
