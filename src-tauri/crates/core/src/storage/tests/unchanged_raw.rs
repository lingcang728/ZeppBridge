//! 同一份报文原样又拉了一遍：不重写、不重新派生（3.1.1 反馈「每次同步都重写约 2.7 万条」）。

use super::*;
use base64::Engine;

fn band_record(day: &str) -> RawRecord {
    let encode = |bytes: &[u8]| base64::engine::general_purpose::STANDARD.encode(bytes);
    let summary = serde_json::json!({
        "tz": 28800,
        "slp": {
            "st": 1_700_000_000i64,
            "ed": 1_700_021_600i64,
            "ss": 70,
            "stage": [
                {"mode": 5, "start": 0, "stop": 60},
                {"mode": 4, "start": 61, "stop": 200}
            ]
        }
    });
    let mut heart = vec![0_u8; 1440];
    for (index, value) in heart.iter_mut().enumerate().take(600) {
        *value = 50 + (index % 40) as u8;
    }
    RawRecord {
        stream: "sleep".into(),
        source_key: format!("band_data:detail:{day}:20"),
        source_scope: SourceScope::Device,
        device_id: None,
        start_utc: ts(),
        end_utc: None,
        payload: serde_json::json!({
            "data": [{
                "uuid": format!("band-{day}"),
                "date_time": day,
                "device_id": "SN-BAND",
                "data_hr": encode(&heart),
                "summary": encode(&serde_json::to_vec(&summary).unwrap())
            }]
        }),
        capability: CapabilityStatus::Verified,
    }
}

fn max_rowid(db: &Database, table: &str) -> i64 {
    db.conn
        .query_row(
            &format!("SELECT COALESCE(MAX(rowid), 0) FROM {table}"),
            [],
            |row| row.get(0),
        )
        .unwrap()
}

#[test]
fn an_unchanged_sleep_payload_is_not_deleted_and_reinserted() {
    let db = Database::in_memory().unwrap();
    let record = band_record("2026-08-12");
    let (first_id, first) = db.persist_fetched_record(&record).unwrap();
    assert_eq!(first.primary_records, 1);
    let samples = max_rowid(&db, "metric_samples");
    let sessions = max_rowid(&db, "sleep_sessions");
    assert!(samples >= 600, "手环心率应当落库");

    let (second_id, second) = db.persist_fetched_record(&record).unwrap();
    assert_eq!(second_id, first_id);
    // 报告里的主计数照旧是睡眠段数，不因为跳过掉成 0。
    assert_eq!(second.primary_records, 1);
    assert_eq!(
        max_rowid(&db, "metric_samples"),
        samples,
        "手环心率不该删了重插"
    );
    assert_eq!(max_rowid(&db, "sleep_sessions"), sessions);

    // 内容变了才重新派生。
    let mut changed = record.clone();
    changed.payload["data"][0]["uuid"] = serde_json::json!("band-changed");
    db.persist_fetched_record(&changed).unwrap();
    assert!(max_rowid(&db, "metric_samples") > samples);
}

#[test]
fn an_unchanged_empty_payload_keeps_its_verdict_without_being_rewritten() {
    let db = Database::in_memory().unwrap();
    let record = RawRecord {
        stream: "heart_rate".into(),
        source_key: "heart_rate:2026-08-12".into(),
        source_scope: SourceScope::Device,
        device_id: None,
        start_utc: ts(),
        end_utc: None,
        payload: serde_json::json!({ "items": [] }),
        capability: CapabilityStatus::Verified,
    };
    let first = db.persist_fetched_record(&record).unwrap_err();
    assert!(first.is_unavailable());
    let quarantined_at: String = db
        .conn
        .query_row("SELECT quarantined_at FROM raw_quarantine", [], |row| {
            row.get(0)
        })
        .unwrap();
    let raw_rowid = max_rowid(&db, "raw_records");

    let second = db.persist_fetched_record(&record).unwrap_err();
    assert!(second.is_unavailable());
    assert_eq!(second.to_string(), first.to_string());
    let again: String = db
        .conn
        .query_row("SELECT quarantined_at FROM raw_quarantine", [], |row| {
            row.get(0)
        })
        .unwrap();
    assert_eq!(again, quarantined_at, "空报文不该被重新隔离一遍");
    assert_eq!(max_rowid(&db, "raw_records"), raw_rowid);
}

#[test]
fn an_identical_upsert_keeps_the_normalization_record() {
    // `invalidate_raw_normalization` 是 UPDATE OF payload_hash 触发器：值没变、
    // 只要出现在 SET 里也会把归一化记录删掉。同 hash 的写入不能再碰它。
    let db = Database::in_memory().unwrap();
    let record = band_record("2026-08-13");
    let (id, _) = db.persist_fetched_record(&record).unwrap();
    db.insert_raw_record(&record).unwrap();
    let kept: i64 = db
        .conn
        .query_row(
            "SELECT COUNT(*) FROM raw_normalization WHERE raw_record_id = ?1",
            [id],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(kept, 1);
}
