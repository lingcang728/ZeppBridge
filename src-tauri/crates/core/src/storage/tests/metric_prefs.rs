//! 用户排除的指标：只是不参与分析，数据一行不删；交出去的 JSON 里同名字段全部去掉。

use super::*;
use crate::storage::metric_prefs::strip_excluded_metrics;
use serde_json::json;

#[test]
fn excluding_a_metric_is_a_remembered_choice_that_can_be_undone() {
    let db = Database::in_memory().unwrap();
    assert!(db.excluded_metrics().unwrap().is_empty());
    assert_eq!(
        db.set_metric_excluded("vo2max", true).unwrap(),
        vec!["vo2max"]
    );
    assert_eq!(
        db.set_metric_excluded("stress", true).unwrap(),
        vec!["stress", "vo2max"]
    );
    assert_eq!(
        db.set_metric_excluded("vo2max", true).unwrap().len(),
        2,
        "no duplicates"
    );
    assert_eq!(
        db.set_metric_excluded("vo2max", false).unwrap(),
        vec!["stress"]
    );
    assert!(db.set_metric_excluded("Robert'); DROP", true).is_err());
}

#[test]
fn every_spelling_of_an_excluded_metric_leaves_the_payload() {
    let mut payload = json!({
        "athlete": { "vo2max": { "value": 69 }, "lactateThresholdHr": { "value": 170 }, "restingHr": 48 },
        "workouts": [{ "id": "w1", "vo2Max": 60, "distance": 10000 }],
        "series": [{ "metric": "vo2max", "points": [] }, { "metric": "steps", "points": [] }],
    });
    let excluded = vec!["vo2max".to_string(), "lactate_threshold".to_string()];
    assert!(strip_excluded_metrics(&mut payload, &excluded));
    assert_eq!(
        payload,
        json!({
            "athlete": { "restingHr": 48 },
            "workouts": [{ "id": "w1", "distance": 10000 }],
            "series": [{ "metric": "steps", "points": [] }],
        })
    );
    assert!(
        !strip_excluded_metrics(&mut payload, &[]),
        "nothing excluded, nothing touched"
    );
}
