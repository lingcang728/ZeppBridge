//! 每日事件报文按日入库、重复拉取不重写、旧整窗报文的整理。

use super::*;
use serde_json::{json, Value};

fn day_ms(day: &str) -> i64 {
    NaiveDate::parse_from_str(day, "%Y-%m-%d")
        .unwrap()
        .and_hms_opt(0, 0, 0)
        .unwrap()
        .and_utc()
        .timestamp_millis()
}

/// 一天的 Charge 条目。`total` = 255 是手表那天没算出分数时的哨兵。
fn charge(day: &str, total: i64) -> Value {
    json!({
        "eventType": "Charge", "subType": "real_data", "timestamp": day_ms(day), "userId": "1",
        "value": {"deviceId": "1440,app", "samples": [
            {"jsonExtra": "{}", "mental": 70.0, "physical": 40.0, "s": 0, "status": 0, "total": total}
        ]}
    })
}

fn raw(source_key: &str, payload: Value) -> RawRecord {
    RawRecord {
        stream: "daily_summary".into(),
        source_key: source_key.into(),
        source_scope: SourceScope::UserFused,
        device_id: None,
        start_utc: ts(),
        end_utc: Some(ts()),
        payload,
        capability: CapabilityStatus::Verified,
    }
}

fn charge_rows(db: &Database) -> Vec<(String, String, f64)> {
    let mut stmt = db
        .conn
        .prepare(
            "SELECT date, metric, value FROM daily_metrics
             WHERE metric LIKE '%charge' ORDER BY date, metric",
        )
        .unwrap();
    stmt.query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))
        .unwrap()
        .collect::<std::result::Result<_, _>>()
        .unwrap()
}

fn keys_and_fetch_times(db: &Database) -> Vec<(String, String)> {
    let mut stmt = db
        .conn
        .prepare("SELECT source_key, fetched_at FROM raw_records ORDER BY source_key")
        .unwrap();
    stmt.query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
        .unwrap()
        .collect::<std::result::Result<_, _>>()
        .unwrap()
}

fn set_fetched_at(db: &Database, source_key: &str, at: &str) {
    db.conn
        .execute(
            "UPDATE raw_records SET fetched_at = ?2 WHERE source_key = ?1",
            params![source_key, at],
        )
        .unwrap();
}

/// 自动同步每 15 分钟重拉同一天。内容没变时不能把「写入 N 条」报成 0，也不能让
/// 「最近一次从云端拿到」停在第一次；内容变了必须真的改掉派生行。
#[test]
fn refetching_a_day_replaces_it_in_place_and_an_identical_refetch_keeps_counts_and_freshness() {
    let db = Database::in_memory().unwrap();
    let key = "events:Charge:real_data:day:2026-09-26";
    let first = raw(key, json!({"items": [charge("2026-09-26", 60)]}));
    let (id, counts) = db.persist_fetched_record(&first).unwrap();
    assert_eq!(counts.primary_records, 3, "hybrid / physical / mental");
    set_fetched_at(&db, key, "2026-09-26T08:00:00+00:00");

    let (again_id, again) = db.persist_fetched_record(&first).unwrap();
    assert_eq!(again_id, id);
    assert_eq!(
        again.primary_records, 3,
        "跳过重写也要报出这条报文产出的行数"
    );
    let fetched_at: String = db
        .conn
        .query_row(
            "SELECT fetched_at FROM raw_records WHERE id = ?1",
            [id],
            |row| row.get(0),
        )
        .unwrap();
    assert!(
        fetched_at.as_str() > "2026-09-26T08:00:00+00:00",
        "云端拉取时间要刷新"
    );

    let changed = raw(key, json!({"items": [charge("2026-09-26", 72)]}));
    let (changed_id, _) = db.persist_fetched_record(&changed).unwrap();
    assert_eq!(changed_id, id, "同一天覆盖，不是新增");
    assert_eq!(db.count_raw_records().unwrap(), 1);
    assert!(charge_rows(&db).contains(&("2026-09-26".into(), "hybrid_charge".into(), 72.0)));
}

/// 那天手表没算出分数：认得出、只是没有值。按日入库后它自成一条，不能被当成
/// 解析失败关进隔离表。
#[test]
fn a_scoreless_charge_day_is_kept_as_an_empty_day_not_a_parse_failure() {
    let db = Database::in_memory().unwrap();
    let key = "events:Charge:real_data:day:2026-09-25";
    let (id, counts) = db
        .persist_fetched_record(&raw(key, json!({"items": [charge("2026-09-25", 255)]})))
        .unwrap();
    assert_eq!(counts.primary_records, 0);
    let quarantined: i64 = db
        .conn
        .query_row(
            "SELECT COUNT(*) FROM raw_quarantine WHERE raw_record_id = ?1",
            [id],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(quarantined, 0);
    // 真认不出的报文仍然要报出来。
    assert!(db
        .persist_fetched_record(&raw(
            "events:Charge:real_data:day:2026-09-24",
            json!({"items": [{"eventType": "Charge", "timestamp": day_ms("2026-09-24")}]}),
        ))
        .is_err());
}

/// 3.0 之前的库：每次同步一条整窗报文。整理之后每天只剩一条按日报文、带着
/// 最后一次拿到那天的云端时间；派生行一行不差，重放之后也一样。
#[test]
fn old_window_payloads_consolidate_into_one_record_per_day_without_changing_derived_rows() {
    let db = Database::in_memory().unwrap();
    let windows = [
        (
            "events:Charge:real_data:1000:2000",
            json!({"items": [charge("2026-09-01", 50), charge("2026-09-02", 255), charge("2026-09-03", 60)]}),
            "2026-09-03T10:00:00+00:00",
        ),
        (
            "events:Charge:real_data:1500:2500",
            json!({"items": []}),
            "2026-09-03T10:15:00+00:00",
        ),
        (
            "events:Charge:real_data:2000:3000",
            json!({"items": [charge("2026-09-02", 255), charge("2026-09-03", 61), charge("2026-09-04", 70)]}),
            "2026-09-04T10:00:00+00:00",
        ),
    ];
    for (key, payload, fetched_at) in &windows {
        // 空窗口归一化是失败的（报文照样留下）——老代码就是这么存下来的。
        let _ = db.persist_fetched_record(&raw(key, payload.clone()));
        set_fetched_at(&db, key, fetched_at);
    }
    // 新的按日报文已经有了更新版本的那一天，不能被旧窗口盖回去。
    let fresh = "events:Charge:real_data:day:2026-09-04";
    db.persist_fetched_record(&raw(fresh, json!({"items": [charge("2026-09-04", 71)]})))
        .unwrap();
    set_fetched_at(&db, fresh, "2026-09-05T09:00:00+00:00");
    let before = charge_rows(&db);
    assert!(db.pending_raw_payload_count().unwrap() > 0);

    let report = db.compact_raw_payloads().unwrap();

    assert_eq!(
        report.compacted, 3,
        "两个有内容的窗口 + 一个已有更新拉取的空窗口"
    );
    assert_eq!(charge_rows(&db), before);
    assert_eq!(
        keys_and_fetch_times(&db),
        vec![
            (
                "events:Charge:real_data:day:2026-09-01".to_string(),
                "2026-09-03T10:00:00+00:00".to_string()
            ),
            (
                "events:Charge:real_data:day:2026-09-02".into(),
                "2026-09-04T10:00:00+00:00".into()
            ),
            (
                "events:Charge:real_data:day:2026-09-03".into(),
                "2026-09-04T10:00:00+00:00".into()
            ),
            (fresh.into(), "2026-09-05T09:00:00+00:00".into()),
        ]
    );
    assert_eq!(
        db.pending_raw_payload_count().unwrap(),
        0,
        "否则每次启动都会再闪一次「正在压缩」"
    );
    assert_eq!(db.compact_raw_payloads().unwrap().compacted, 0);

    db.reprocess_raw_records().unwrap();
    assert_eq!(
        charge_rows(&db),
        before,
        "整理后的报文重放出来的也是同一批派生行"
    );
}

/// 还有派生行指向的窗口报文（那一天只有它产出过某个指标）不能删。
#[test]
fn a_window_still_owning_a_derived_row_is_kept() {
    let db = Database::in_memory().unwrap();
    let old_key = "events:Charge:real_data:1000:2000";
    db.persist_fetched_record(&raw(old_key, json!({"items": [charge("2026-09-01", 50)]})))
        .unwrap();
    set_fetched_at(&db, old_key, "2026-09-01T10:00:00+00:00");
    // 后来那一天变成了哨兵：新版本不产出 hybrid_charge，旧行仍然挂在旧窗口上。
    let new_key = "events:Charge:real_data:3000:4000";
    db.persist_fetched_record(&raw(new_key, json!({"items": [charge("2026-09-01", 255)]})))
        .unwrap();
    set_fetched_at(&db, new_key, "2026-09-02T10:00:00+00:00");
    let before = charge_rows(&db);

    db.compact_raw_payloads().unwrap();

    assert_eq!(charge_rows(&db), before);
    let keys: Vec<String> = keys_and_fetch_times(&db)
        .into_iter()
        .map(|(key, _)| key)
        .collect();
    assert!(keys.contains(&old_key.to_string()), "{keys:?}");
    assert!(!keys.contains(&new_key.to_string()), "{keys:?}");
}

/// 头一回整理之前先留一份可校验的备份：整理会删掉上千条报文，删了就回不来。
/// 之后没有新东西要整理时，不再每次启动都备份一遍。
#[test]
fn the_first_consolidation_leaves_a_verified_backup_behind() {
    let dir = std::env::temp_dir().join(format!(
        "zeppbridge-consolidate-backup-{}",
        std::process::id()
    ));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    let db = Database::new(dir.join("zepp.db")).unwrap();
    db.persist_fetched_record(&raw(
        "events:Charge:real_data:1000:2000",
        json!({"items": [charge("2026-09-01", 50)]}),
    ))
    .unwrap();
    assert!(backup::list_backups(&dir).unwrap().is_empty());

    // 整理前留快照；整理全部做完、库完好后快照被静默删掉（用户 2026-09-30 定）。
    db.compact_raw_payloads().unwrap();
    assert!(backup::list_backups(&dir).unwrap().is_empty());

    db.compact_raw_payloads().unwrap();
    assert!(backup::list_backups(&dir).unwrap().is_empty());
    drop(db);
    let _ = std::fs::remove_dir_all(&dir);
}
