use super::*;
use crate::storage::my_records::{MY_RECORDS_FORMAT, MY_RECORD_TABLES};
use chrono::NaiveDate;

#[test]
fn takes_every_user_table_and_keeps_unopened_capsules_sealed() {
    let db = Database::in_memory().unwrap();
    let today = NaiveDate::from_ymd_opt(2026, 1, 1).unwrap();
    let sealed = db
        .seal_capsule(
            "still secret",
            today + chrono::Duration::days(200),
            today,
            ts(),
        )
        .unwrap();
    let opened = db
        .seal_capsule("open me", today + chrono::Duration::days(1), today, ts())
        .unwrap();
    db.open_capsule(opened, today + chrono::Duration::days(2), ts())
        .unwrap();

    let export = db.export_my_records(ts()).unwrap();
    assert_eq!(export["format"], MY_RECORDS_FORMAT);
    // 每一张表都在（新库里也都建了），一张都不能悄悄漏掉。
    for table in MY_RECORD_TABLES {
        assert!(export["tables"][table].is_array(), "{table}");
    }
    let letters = export["tables"]["data_letters"].as_array().unwrap();
    let find = |id: i64| letters.iter().find(|l| l["id"] == id).unwrap();
    assert_eq!(find(sealed)["note"], serde_json::Value::Null);
    assert_eq!(find(sealed)["sealed"], true);
    assert_eq!(find(opened)["note"], "open me");
    assert!(!export.to_string().contains("still secret"));
}
