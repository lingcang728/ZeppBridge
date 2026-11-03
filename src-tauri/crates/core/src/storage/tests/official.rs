//! 官方报文落库与「同一晚显示官方那份」。夹具是合成数据。

use super::*;
use crate::official::fetch::{split_records, OfficialKind};
use chrono::{TimeZone, Timelike};

const SHANGHAI_MIDNIGHT: i64 = 1_789_920_000;

fn official_night() -> serde_json::Value {
    serde_json::json!({
        "date": "2026-09-22", "deepSleepTime": 90, "shallowSleepTime": 250, "wakeTime": 10, "rem": 100,
        "start": SHANGHAI_MIDNIGHT + 1443 * 60, "stop": SHANGHAI_MIDNIGHT + 1893 * 60, "sleepScore": 84,
        "stage": [{"start": 1443, "stop": 1600, "mode": 4}], "napStage": []
    })
}

fn legacy_night(start: i64, end: i64) -> SleepSession {
    SleepSession {
        sleep_id: format!("band:dev:{start}:{end}"),
        start_time: DateTime::from_timestamp(start, 0).unwrap(),
        end_time: DateTime::from_timestamp(end, 0).unwrap(),
        score: Some(80),
        duration_minutes: 400,
        deep_minutes: Some(80),
        light_minutes: Some(240),
        rem_minutes: Some(80),
        awake_minutes: Some(20),
        source_scope: SourceScope::Device,
        device_id: Some("dev".into()),
        synced_at: None,
        time_in_bed_minutes: None,
        stages: Vec::new(),
        wake_count: None,
    }
}

fn shown_ids(db: &Database) -> Vec<String> {
    let mut stmt = db
        .conn
        .prepare("SELECT sleep_id FROM sleep_sessions_shown ORDER BY start_time")
        .unwrap();
    stmt.query_map([], |row| row.get(0))
        .unwrap()
        .collect::<std::result::Result<Vec<_>, _>>()
        .unwrap()
}

#[test]
fn the_same_night_is_stored_twice_but_shown_once_as_the_official_one() {
    let db = Database::in_memory().unwrap();
    let start = SHANGHAI_MIDNIGHT + 1443 * 60;
    // 旧通道那份：开始早 5 分钟、结束晚 10 分钟——同一晚，边界对不齐。
    db.insert_sleep_session(&legacy_night(start - 300, start + 450 * 60 + 600))
        .unwrap();
    // 另一晚只有旧通道。
    db.insert_sleep_session(&legacy_night(start - 86_400, start - 86_400 + 400 * 60))
        .unwrap();
    for raw in split_records(OfficialKind::Sleep, vec![official_night()], "Asia/Shanghai") {
        db.persist_fetched_record(&raw).unwrap();
    }
    let total: i64 = db
        .conn
        .query_row("SELECT COUNT(*) FROM sleep_sessions", [], |row| row.get(0))
        .unwrap();
    assert_eq!(total, 3);
    let shown = shown_ids(&db);
    assert_eq!(shown.len(), 2);
    assert!(shown[0].starts_with("band:"));
    assert_eq!(shown[1], format!("official:{start}"));
    let (provider, rem, nap): (String, Option<i64>, Option<i64>) = db
        .conn
        .query_row(
            "SELECT provider, rem_seconds, nap_total_seconds FROM sleep_sessions WHERE sleep_id = ?1",
            [format!("official:{start}")],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .unwrap();
    assert_eq!(
        (provider.as_str(), rem, nap),
        ("official", Some(6000), Some(0))
    );
    // 列表查询走视图：同一晚只出现一次。
    assert_eq!(db.get_recent_sleep_sessions(10).unwrap().len(), 2);
    // 官方那份不带设备：详情借同一晚旧通道那份的设备来认，而不是显示「未提供」。
    let detail = db
        .get_sleep_detail(&format!("official:{start}"))
        .unwrap()
        .unwrap();
    assert_eq!(detail.device_id.as_deref(), Some("dev"));
    assert!(!detail.stages.is_empty());
}

#[test]
fn official_payloads_are_marked_and_replay_through_the_same_path() {
    let db = Database::in_memory().unwrap();
    let hourly = serde_json::json!({"date": "2026-09-28", "hour": 11, "steps": 208});
    for raw in split_records(OfficialKind::ActivityHourly, vec![hourly], "Asia/Shanghai") {
        db.persist_fetched_record(&raw).unwrap();
    }
    let (provider, channel): (String, String) = db
        .conn
        .query_row(
            "SELECT provider, channel FROM raw_records WHERE source_key LIKE 'official:%'",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .unwrap();
    assert_eq!(
        (provider.as_str(), channel.as_str()),
        ("official", "official_pull")
    );
    let (metric, value, row_provider): (String, f64, String) = db
        .conn
        .query_row(
            "SELECT metric, value, provider FROM metric_samples",
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .unwrap();
    assert_eq!(
        (metric.as_str(), value, row_provider.as_str()),
        ("steps_hourly", 208.0, "official")
    );
    // 按范围取（日常活动页跟着 7 天 / 1 个月 / 6 个月走）：带上日期，不补 0。
    let rows = db.hourly_steps("2026-09-27", "2026-09-29").unwrap();
    assert_eq!(rows.len(), 1);
    assert_eq!(
        (rows[0].date.as_str(), rows[0].steps),
        ("2026-09-28", 208.0)
    );
    assert!(db.hourly_steps("2026-09-29", "2026-09-27").is_err());
}

/// 旧通道一天的逐分钟明细（每分钟 8 字节，第 3 个字节是步数）。
fn legacy_day(date: &str, steps: &[(usize, u8)]) -> serde_json::Value {
    use base64::{engine::general_purpose::STANDARD, Engine as _};
    let mut bytes = vec![0u8; 1440 * 8];
    for (minute, count) in steps {
        bytes[minute * 8 + 2] = *count;
    }
    serde_json::json!({ "date_time": date, "device_id": "dev", "data": STANDARD.encode(bytes) })
}

fn insert_legacy(db: &Database, key: &str, fetched_at: &str, days: Vec<serde_json::Value>) {
    db.conn
        .execute(
            "INSERT INTO raw_records(stream, source_key, source_scope, start_utc, payload, payload_hash, fetched_at)
             VALUES ('sleep', ?1, 'device', ?2, ?3, ?1, ?2)",
            params![key, fetched_at, serde_json::json!({ "code": 1, "data": days }).to_string()],
        )
        .unwrap();
}

#[test]
fn hourly_steps_prefer_the_legacy_minute_record_and_fall_back_to_official() {
    let db = Database::in_memory().unwrap();
    let official = vec![
        serde_json::json!({"date": "2026-09-28", "hour": 11, "steps": 208}),
        serde_json::json!({"date": "2026-09-27", "hour": 8, "steps": 77}),
    ];
    for raw in split_records(OfficialKind::ActivityHourly, official, "Asia/Shanghai") {
        db.persist_fetched_record(&raw).unwrap();
    }
    // 更旧的一份拉取（数字不同）不能盖过新拉到的那份。
    insert_legacy(
        &db,
        "band_data:detail:2026-09-26:2026-09-28",
        "2026-09-28T01:00:00Z",
        vec![legacy_day("2026-09-28", &[(9 * 60 + 5, 1)])],
    );
    insert_legacy(
        &db,
        "band_data:detail:2026-09-28:2026-09-29",
        "2026-09-29T01:00:00Z",
        vec![legacy_day(
            "2026-09-28",
            &[(9 * 60 + 5, 100), (9 * 60 + 30, 50), (22 * 60, 30)],
        )],
    );

    let rows = db.hourly_steps("2026-09-26", "2026-09-29").unwrap();
    let got: Vec<(String, i64, f64)> = rows
        .iter()
        .map(|row| (row.date.clone(), row.hour, row.steps))
        .collect();
    // 官方的按小时汇总存的是绝对时刻，显示按本机时区——和其他数据同一口径。
    // 期望值也按本机时区算，别把「本机在 UTC+8」写死（CI 机器是 UTC）。
    let official_8am = chrono::FixedOffset::east_opt(8 * 3600)
        .unwrap()
        .with_ymd_and_hms(2026, 9, 27, 8, 0, 0)
        .unwrap()
        .with_timezone(&chrono::Local);
    // 9/28 旧通道有完整的逐分钟记录：用它，官方那个零星的小时不掺进来；9/27 只有官方。
    assert_eq!(
        got,
        vec![
            (
                official_8am.date_naive().to_string(),
                i64::from(official_8am.hour()),
                77.0
            ),
            ("2026-09-28".to_string(), 9, 150.0),
            ("2026-09-28".to_string(), 22, 30.0)
        ]
    );
}

#[test]
fn legacy_hourly_steps_ignore_records_of_an_unverified_length() {
    let item = serde_json::json!({ "date_time": "2026-09-28", "data": "AAAA" });
    assert!(crate::storage::hourly_steps::legacy_hourly_steps(&item).is_none());
}

/// 只连官方授权的账号没有设备列表接口；设备只能从运动列表里的
/// `source` / `deviceName` 认出来。
#[test]
fn official_workouts_yield_one_device_item_per_device_source() {
    let db = Database::in_memory().unwrap();
    let name = r#"{"en-WW":"Amazfit T-Rex 3 Pro (48mm)","zh-CN":"Amazfit T-Rex 3 Pro (48mm)"}"#;
    let payload = serde_json::json!({
        "items": [
            { "type": "OUTDOOR_RUN", "source": "run.10551555.huami.com", "deviceName": name },
            { "type": "WALKING", "source": "run.10551555.huami.com", "deviceName": name },
            // 手机记的运动：中间那段不是数字，不算一台表。
            { "type": "WALKING", "source": "run.mifit.huami.com" },
        ],
        "timeZone": "Asia/Kolkata"
    });
    db.conn
        .execute(
            "INSERT INTO raw_records(stream, source_key, source_scope, start_utc, payload, payload_hash, fetched_at, provider)
             VALUES ('workouts', 'official:sports:1', 'user_fused', '2026-10-01T00:00:00+00:00', ?1, 'h', '2026-10-01T00:00:00+00:00', 'official')",
            params![payload.to_string()],
        )
        .unwrap();

    assert_eq!(
        db.official_workout_device_items().unwrap(),
        vec![serde_json::json!({
            "deviceSource": 10551555,
            "deviceName": "Amazfit T-Rex 3 Pro (48mm)"
        })]
    );
}

#[test]
fn official_device_source_and_name_parsing() {
    assert_eq!(
        official_source_device_code("run.10551555.huami.com"),
        Some(10551555)
    );
    assert_eq!(official_source_device_code("run.mifit.huami.com"), None);
    assert_eq!(official_source_device_code("run..huami.com"), None);
    assert_eq!(official_source_device_code(""), None);

    let localized = serde_json::json!(r#"{"zh-CN":"跃我 T-Rex 3","en-WW":"Amazfit T-Rex 3"}"#);
    assert_eq!(
        official_device_name(&localized).as_deref(),
        Some("Amazfit T-Rex 3")
    );
    assert_eq!(
        official_device_name(&serde_json::json!("Amazfit Balance 2")).as_deref(),
        Some("Amazfit Balance 2")
    );
    assert_eq!(official_device_name(&serde_json::json!("  ")), None);
}

// ── #143：同一次运动两条通道都有明细时，以高级通道为准 ─────────────────────

const TRACK: i64 = 1_700_000_000;

/// 高级通道的运动汇总（2600 m）。
fn insert_workout_summary(db: &Database) {
    db.insert_raw_record(&RawRecord {
        stream: "workouts".into(),
        source_key: "sport_history:run:precedence".into(),
        source_scope: SourceScope::Device,
        device_id: None,
        start_utc: ts(),
        end_utc: None,
        payload: serde_json::json!({ "data": [{ "trackid": TRACK, "end_time": TRACK + 600, "type": 1, "dis": "2600" }] }),
        capability: CapabilityStatus::Verified,
    })
    .unwrap();
}

/// 高级通道明细：心率 150 起，`currentDistance` 累计到 2600 m。
fn insert_legacy_detail(db: &Database) {
    db.insert_raw_record(&RawRecord {
        stream: "workout_detail".into(),
        source_key: format!("workout_detail:{TRACK}:run.huami.com"),
        source_scope: SourceScope::Device,
        device_id: None,
        start_utc: ts(),
        end_utc: None,
        payload: serde_json::json!({ "data": {
            "trackid": TRACK, "time": "0;300;300;",
            "heart_rate": "0,150;300,2;300,-2;",
            "currentDistance": "0,0;300,130000;300,260000;"
        } }),
        capability: CapabilityStatus::Verified,
    })
    .unwrap();
}

/// 官方明细：心率 120 起；`distance` 给了才带 `distanceInCentimeter`。
fn insert_official_detail(db: &Database, distance: Option<&str>) {
    let mut payload = serde_json::json!({
        "trackId": TRACK.to_string(), "source": "run.huami.com", "startTime": TRACK,
        "samplingTime": "0;300;300;", "heartRate": "0,120;300,2;300,-2;", "pause": ""
    });
    if let Some(distance) = distance {
        payload["distanceInCentimeter"] = serde_json::json!(distance);
    }
    db.insert_raw_record(&RawRecord {
        stream: "workout_detail".into(),
        source_key: format!("official:sport_detail:{TRACK}"),
        source_scope: SourceScope::Device,
        device_id: None,
        start_utc: ts(),
        end_utc: None,
        payload,
        capability: CapabilityStatus::Verified,
    })
    .unwrap();
}

fn set_fetched_at(db: &Database, source_key_prefix: &str, at: &str) {
    db.conn
        .execute(
            "UPDATE raw_records SET fetched_at = ?2 WHERE substr(source_key, 1, length(?1)) = ?1",
            params![source_key_prefix, at],
        )
        .unwrap();
}

fn series_shape(db: &Database) -> (Option<i32>, Option<f64>) {
    let series = db.get_workout_series(&TRACK.to_string()).unwrap();
    let first_hr = series.samples.first().and_then(|s| s.heart_rate);
    let last_distance = series
        .samples
        .iter()
        .filter_map(|s| s.distance_m)
        .fold(None, |m: Option<f64>, v| Some(m.map_or(v, |m| m.max(v))));
    (first_hr, last_distance)
}

#[test]
fn the_legacy_detail_wins_over_the_official_one_whichever_was_fetched_last() {
    for official_later in [true, false] {
        let db = Database::in_memory().unwrap();
        insert_workout_summary(&db);
        insert_legacy_detail(&db);
        insert_official_detail(&db, None);
        let (legacy_at, official_at) = if official_later {
            ("2026-10-01T00:00:00+00:00", "2026-10-02T00:00:00+00:00")
        } else {
            ("2026-10-02T00:00:00+00:00", "2026-10-01T00:00:00+00:00")
        };
        // 汇总总是先到（明细要挂在已有的运动上）。
        set_fetched_at(&db, "sport_history:", "2026-09-30T00:00:00+00:00");
        set_fetched_at(&db, "workout_detail:", legacy_at);
        set_fetched_at(&db, "official:", official_at);
        db.reprocess_raw_records().unwrap();
        // 高级版：心率 150 起，逐点距离到 2600 m（官方版是 120、没有距离）。
        assert_eq!(
            series_shape(&db),
            (Some(150), Some(2600.0)),
            "official_later = {official_later}"
        );
    }
}

#[test]
fn an_official_only_detail_keeps_distance_that_matches_the_summary() {
    let db = Database::in_memory().unwrap();
    insert_workout_summary(&db);
    insert_official_detail(&db, Some("0,0;300,130000;300,260000;"));
    db.reprocess_raw_records().unwrap();
    assert_eq!(series_shape(&db), (Some(120), Some(2600.0)));
}

#[test]
fn an_official_only_detail_drops_distance_that_disagrees_with_the_summary() {
    let db = Database::in_memory().unwrap();
    insert_workout_summary(&db);
    // 单位差一百倍（末值 26 m，汇总 2600 m）：对不上就不留，心率照常。
    insert_official_detail(&db, Some("0,0;300,1300;300,2600;"));
    db.reprocess_raw_records().unwrap();
    assert_eq!(series_shape(&db), (Some(120), None));
}
