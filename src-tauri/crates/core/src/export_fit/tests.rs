use super::*;
use rustyfit::Decoder;
use serde_json::json;

fn export_with(data: serde_json::Value) -> Value {
    json!({ "generated_at": "2026-09-02T10:00:00+08:00", "data": data })
}

fn decode(bytes: &[u8]) -> FIT {
    let mut cursor = std::io::Cursor::new(bytes);
    let mut decoder = Decoder::new();
    decoder
        .decode(&mut FromStd::new(&mut cursor))
        .expect("FIT 应当能被解回来")
        .expect("FIT 不应为空")
}

fn raw(mesg: &Message, num: u8) -> Option<&FitValue> {
    mesg.fields
        .iter()
        .find(|field| field.num == num)
        .map(|field| &field.value)
}

/// `rustyfit::proto::Value` 没有实现 `PartialEq`，所以断言一律先把整数取
/// 出来再比。取不出来时返回 `None`，让「字段缺失」和「值不对」在失败信息
/// 里长得不一样。
fn int_of(mesg: &Message, num: u8) -> Option<i64> {
    match raw(mesg, num)? {
        FitValue::Uint8(value) => Some(i64::from(*value)),
        FitValue::Uint16(value) => Some(i64::from(*value)),
        FitValue::Uint32(value) => Some(i64::from(*value)),
        FitValue::Int8(value) => Some(i64::from(*value)),
        FitValue::Int16(value) => Some(i64::from(*value)),
        FitValue::Int32(value) => Some(i64::from(*value)),
        _ => None,
    }
}

fn messages_of(fit: &FIT, num: typedef::MesgNum) -> Vec<&Message> {
    fit.messages.iter().filter(|m| m.num == num).collect()
}

fn running_export() -> Value {
    export_with(json!({
        "workouts": [
            {
                "workout_id": "w1",
                "effective_type": "run",
                "start_time": "2026-08-24T06:00:00+08:00",
                "end_time": "2026-08-24T06:00:02+08:00",
                "distance_meters": 15217.0,
                "calories": 900.0,
                "avg_hr": 141,
                "max_hr": 173,
                "total_steps": 8998,
                "device_label": "Amazfit Balance",
                "route": [
                    { "timestamp": "2026-08-24T06:00:00+08:00", "latitude": 31.2304,
                      "longitude": 121.4737, "altitude_m": 12.4 },
                    { "timestamp": "2026-08-24T06:00:01+08:00", "latitude": 31.2305,
                      "longitude": 121.4738, "altitude_m": 12.6 }
                ],
                "samples": [
                    { "timestamp": "2026-08-24T06:00:00+08:00", "heart_rate": 132,
                      "speed": 3.5, "power_watts": 249.0, "ground_contact_ms": 263.0,
                      "vertical_oscillation_mm": 88.0, "cadence": 170.0 },
                    { "timestamp": "2026-08-24T06:00:01+08:00", "heart_rate": 134,
                      "speed": 3.6 }
                ],
                "splits": [
                    { "index": 1, "start_time": "2026-08-24T06:00:00+08:00",
                      "end_time": "2026-08-24T06:00:02+08:00", "distance_m": 1000.0,
                      "duration_seconds": 2, "avg_hr": 133, "max_hr": 134,
                      "elevation_gain_m": 3.0, "elevation_loss_m": 1.0, "partial": false }
                ],
                "pauses": []
            }
        ]
    }))
}

#[test]
fn issue_24_cloud_trail_run_exports_as_trail_in_json_gpx_and_fit() {
    let workouts = crate::normalizer::Normalizer::normalize_workouts_with_sport(
        &json!({"data": [{
            "trackid": 1_700_000_000i64, "end_time": 1_700_000_600i64, "type": 7
        }]}),
        None,
    )
    .unwrap();
    let mut workout = serde_json::to_value(&workouts[0]).unwrap();
    assert_eq!(workout["workout_type"], "trail_running");
    workout["route"] = json!([{
        "timestamp": "2023-11-14T22:13:20Z", "latitude": 0.0, "longitude": 0.0
    }]);
    let export = export_with(json!({"workouts": [workout]}));
    let (gpx, points) = crate::export_formats::to_gpx(&export).unwrap();
    assert_eq!(points, 1);
    assert!(gpx.contains("<type>trail_running</type>"));
    assert!(!gpx.contains("swimming"));
    let (files, _) = to_fit(&export).unwrap();
    assert!(files[0].0.ends_with("-trail-running.fit"));
    let fit = decode(&files[0].1);
    let session = messages_of(&fit, typedef::MesgNum::SESSION);
    assert_eq!(
        int_of(session[0], mesgdef::Session::SPORT),
        Some(i64::from(typedef::Sport::RUNNING.0))
    );
    assert_eq!(
        int_of(session[0], mesgdef::Session::SUB_SPORT),
        Some(i64::from(typedef::SubSport::TRAIL.0))
    );
}

#[test]
fn writes_one_file_per_workout_and_decodes_back() {
    let (files, records) = to_fit(&running_export()).unwrap();

    assert_eq!(files.len(), 1);
    assert_eq!(records, 2, "两个时间点各写一条 record");
    assert_eq!(files[0].0, "20260824-060000-run.fit");

    let fit = decode(&files[0].1);

    // file_id 必须是第一条，且厂商是 Zepp——数据确实来自 Zepp 云端。
    let first = &fit.messages[0];
    assert_eq!(first.num, typedef::MesgNum::FILE_ID);
    assert_eq!(
        int_of(first, mesgdef::FileId::MANUFACTURER),
        Some(i64::from(typedef::Manufacturer::ZEPP.0))
    );

    let records = messages_of(&fit, typedef::MesgNum::RECORD);
    assert_eq!(records.len(), 2);

    // 坐标按 semicircles 往返，允许 1 个最低位的舍入。
    let lat = int_of(records[0], mesgdef::Record::POSITION_LAT).expect("纬度应当写出来");
    let expected = (31.2304 * SEMICIRCLES_PER_DEGREE).round() as i64;
    assert!((lat - expected).abs() <= 1, "lat={lat} expected={expected}");

    assert_eq!(int_of(records[0], mesgdef::Record::HEART_RATE), Some(132));
    // 速度 scale 1000：3.5 m/s -> 3500
    assert_eq!(int_of(records[0], mesgdef::Record::SPEED), Some(3500));
    assert_eq!(int_of(records[0], mesgdef::Record::POWER), Some(249));
    // 触地时间 scale 10：263 ms -> 2630
    assert_eq!(int_of(records[0], mesgdef::Record::STANCE_TIME), Some(2630));
    // 垂直振幅 scale 10：88 mm -> 880
    assert_eq!(
        int_of(records[0], mesgdef::Record::VERTICAL_OSCILLATION),
        Some(880)
    );
    // 高度 (12.4 + 500) * 5 = 2562
    assert_eq!(int_of(records[0], mesgdef::Record::ALTITUDE), Some(2562));

    let session = messages_of(&fit, typedef::MesgNum::SESSION);
    assert_eq!(session.len(), 1);
    assert_eq!(
        int_of(session[0], mesgdef::Session::SPORT),
        Some(i64::from(typedef::Sport::RUNNING.0))
    );
    assert_eq!(
        int_of(session[0], mesgdef::Session::SUB_SPORT),
        Some(i64::from(typedef::SubSport::STREET.0))
    );
    // 距离 scale 100：15217 m -> 1521700
    assert_eq!(
        int_of(session[0], mesgdef::Session::TOTAL_DISTANCE),
        Some(1_521_700)
    );

    assert_eq!(messages_of(&fit, typedef::MesgNum::LAP).len(), 1);
    assert_eq!(messages_of(&fit, typedef::MesgNum::ACTIVITY).len(), 1);
}

#[test]
fn raw_power_survives_storage_and_single_workout_fit_export() {
    use crate::models::types::{ExportDetail, ExportScope, ExportSelection, Workout};
    use crate::storage::Database;
    let db = Database::in_memory().unwrap();
    let start = DateTime::from_timestamp(1_700_000_000, 0).unwrap();
    let id = "1700000000";
    db.insert_workout(&Workout {
        workout_id: id.into(),
        workout_type: "run".into(),
        normalized_type: "run".into(),
        effective_type: "run".into(),
        start_time: start,
        end_time: start + chrono::Duration::seconds(3),
        ..Default::default()
    })
    .unwrap();
    let payload = json!({
        "trackid": 1_700_000_000i64,
        "time": "0;1;1;1;",
        "heart_rate": "0,120;1,1;1,1;1,1;",
        "power_meter": "0,200;,250;,0;,300;"
    });
    db.persist_fetched_record(&crate::models::RawRecord {
        stream: "workout_detail".into(),
        source_key: "workout_detail:1700000000:run.gps".into(),
        source_scope: crate::models::SourceScope::Device,
        device_id: None,
        start_utc: start,
        end_utc: None,
        payload,
        capability: crate::models::CapabilityStatus::Verified,
    })
    .unwrap();
    let selection = ExportSelection {
        scope: Some(ExportScope::Workout {
            workout_id: id.into(),
        }),
        start_date: None,
        end_date: None,
        data_types: vec!["workouts".into()],
        detail: ExportDetail::Full,
    };
    let (encoded, _) = db.build_ai_export(&selection).unwrap();
    let (files, _) = to_fit(&serde_json::from_str(&encoded).unwrap()).unwrap();
    assert_eq!(files.len(), 1);
    let fit = decode(&files[0].1);
    let powers: Vec<_> = messages_of(&fit, typedef::MesgNum::RECORD)
        .iter()
        .map(|record| int_of(record, mesgdef::Record::POWER))
        .collect();
    assert_eq!(powers, vec![Some(200), Some(250), Some(0), Some(300)]);
}

/// 没有 splits 的运动也必须有 lap，且 `num_laps >= 1`。
///
/// 室内运动（跑步机、划船机、瑜伽、自由训练）和距离不足 1 km 的户外运动，
/// 服务端不给 `splits`。FIT 规范要求每个 session 至少挂一条 lap，缺了
/// Garmin Connect 和 Strava 会在校验消息层级时直接拒收整份文件。
#[test]
fn workout_without_splits_still_gets_one_lap() {
    let treadmill = export_with(json!({
        "workouts": [{
            "workout_id": "w1", "effective_type": "treadmill",
            "start_time": "2026-08-24T06:00:00+08:00",
            "distance_meters": 830.0, "calories": 62.0,
            "avg_hr": 128, "max_hr": 141,
            "route": [], "splits": [], "pauses": [],
            "samples": [
                { "timestamp": "2026-08-24T06:00:00+08:00", "heart_rate": 120, "speed": 2.5 },
                { "timestamp": "2026-08-24T06:05:00+08:00", "heart_rate": 141, "speed": 2.8 }
            ]
        }]
    }));
    let (files, _) = to_fit(&treadmill).unwrap();
    let fit = decode(&files[0].1);

    let laps = messages_of(&fit, typedef::MesgNum::LAP);
    assert_eq!(laps.len(), 1, "没有 splits 也必须写出一条覆盖全程的 lap");
    assert_eq!(
        int_of(laps[0], mesgdef::Lap::LAP_TRIGGER),
        Some(i64::from(typedef::LapTrigger::SESSION_END.0)),
        "整段活动那一圈的 trigger 是 session_end，不是 distance"
    );
    // 300 秒 -> 300000 ms
    assert_eq!(
        int_of(laps[0], mesgdef::Lap::TOTAL_ELAPSED_TIME),
        Some(300_000)
    );
    // 距离 scale 100：830 m -> 83000
    assert_eq!(int_of(laps[0], mesgdef::Lap::TOTAL_DISTANCE), Some(83_000));
    assert_eq!(int_of(laps[0], mesgdef::Lap::MAX_HEART_RATE), Some(141));

    let session = messages_of(&fit, typedef::MesgNum::SESSION);
    assert_eq!(
        int_of(session[0], mesgdef::Session::NUM_LAPS),
        Some(1),
        "num_laps = 0 会被 Garmin / Strava 直接拒收"
    );
}

/// `activity.local_timestamp` 要带上手表当时所在时区的偏移。
///
/// 缺了它，Garmin Connect 只能退回账号默认时区，北京时间早上六点的跑步
/// 会被标成前一天晚上。偏移量取自 `start_time` 的 RFC3339 后缀，不是猜的。
#[test]
fn activity_carries_local_timestamp_from_the_recorded_offset() {
    let (files, _) = to_fit(&running_export()).unwrap();
    let fit = decode(&files[0].1);
    let activity = messages_of(&fit, typedef::MesgNum::ACTIVITY);
    assert_eq!(activity.len(), 1);

    let utc = int_of(activity[0], mesgdef::Activity::TIMESTAMP).expect("UTC 时间戳应当写出来");
    let local =
        int_of(activity[0], mesgdef::Activity::LOCAL_TIMESTAMP).expect("本地时间戳应当写出来");
    // fixture 是 +08:00
    assert_eq!(local - utc, 8 * 3600);
}

#[test]
fn utc_normalized_workouts_do_not_claim_a_local_timezone() {
    for start in ["2026-08-23T22:00:00Z", "2026-08-23T22:00:00+00:00"] {
        let mut export = running_export();
        export["data"]["workouts"][0]["start_time"] = json!(start);
        let (files, _) = to_fit(&export).unwrap();
        let fit = decode(&files[0].1);
        let activity = messages_of(&fit, typedef::MesgNum::ACTIVITY);
        assert_eq!(activity.len(), 1);
        assert!(int_of(activity[0], mesgdef::Activity::TIMESTAMP).is_some());
        assert!(raw(activity[0], mesgdef::Activity::LOCAL_TIMESTAMP).is_none());
    }
}

/// 经度正好 180.0° 的点不该丢掉坐标。
#[test]
fn antimeridian_longitude_is_clamped_not_dropped() {
    assert_eq!(semicircles(180.0), Some(i32::MAX));
    assert_eq!(semicircles(-180.0), Some(i32::MIN));
    assert_eq!(semicircles(180.5), None, "超出量程仍然拒收");
    assert_eq!(semicircles(f64::NAN), None);
}

/// 步频：源数据是步/分，FIT 的 `cadence` 是 rpm，跑步/步行要除以二。
///
/// 单位不是猜的，是和这条运动自己的云端汇总对上的账 —— 见
/// `steps_per_minute_to_fit_cadence` 上面那张表。
#[test]
fn cadence_is_halved_for_foot_sports_and_left_alone_for_cycling() {
    // fixture 里那条跑步的第一个采样是 170 步/分 -> 85 rpm
    let (files, _) = to_fit(&running_export()).unwrap();
    let fit = decode(&files[0].1);
    let records = messages_of(&fit, typedef::MesgNum::RECORD);
    assert_eq!(
        int_of(records[0], mesgdef::Record::CADENCE),
        Some(85),
        "跑步：170 步/分应写成 85 rpm，读取方乘二显示回 170"
    );

    let session = messages_of(&fit, typedef::MesgNum::SESSION);
    assert_eq!(int_of(session[0], mesgdef::Session::AVG_CADENCE), Some(85));
    assert_eq!(int_of(session[0], mesgdef::Session::MAX_CADENCE), Some(85));

    // 骑行的一个周期就是曲柄转一圈，本身已经是 rpm，不能再除。
    let ride = export_with(json!({
        "workouts": [{
            "workout_id": "w1", "effective_type": "road_cycling",
            "start_time": "2026-08-24T06:00:00+08:00",
            "route": [], "splits": [], "pauses": [],
            "samples": [
                { "timestamp": "2026-08-24T06:00:00+08:00", "cadence": 90.0 },
                { "timestamp": "2026-08-24T06:00:01+08:00", "cadence": 90.0 }
            ]
        }]
    }));
    let (files, _) = to_fit(&ride).unwrap();
    let fit = decode(&files[0].1);
    let records = messages_of(&fit, typedef::MesgNum::RECORD);
    assert_eq!(
        int_of(records[0], mesgdef::Record::CADENCE),
        Some(90),
        "骑行：90 rpm 原样写入"
    );
}

/// 步数写成 session 的 `TOTAL_CYCLES`，走路类运动要除以二。
///
/// 不写这个字段的时候，导入方只能拿距离去估：OPPO 健康从 0.83 km 估出
/// 1274 步。云端汇总里本来就有真实步数，PR #34 之后也已经进库了。
#[test]
fn total_steps_become_session_cycles() {
    // fixture 的 total_steps 是 8998 -> 4499 个整步
    let (files, _) = to_fit(&running_export()).unwrap();
    let fit = decode(&files[0].1);
    let session = messages_of(&fit, typedef::MesgNum::SESSION);
    assert_eq!(
        int_of(session[0], mesgdef::Session::TOTAL_CYCLES),
        Some(4499),
        "跑步：8998 步应写成 4499 个 cycle，读取方乘二显示回 8998"
    );

    // 骑行的 cycle 是曲柄转一圈，跟步数无关，一个字都不该写。
    let ride = export_with(json!({
        "workouts": [{
            "workout_id": "w1", "effective_type": "road_cycling",
            "start_time": "2026-08-24T06:00:00+08:00",
            "total_steps": 8998,
            "route": [], "splits": [], "pauses": [],
            "samples": [
                { "timestamp": "2026-08-24T06:00:00+08:00", "heart_rate": 120 },
                { "timestamp": "2026-08-24T06:00:01+08:00", "heart_rate": 121 }
            ]
        }]
    }));
    let (files, _) = to_fit(&ride).unwrap();
    let fit = decode(&files[0].1);
    let session = messages_of(&fit, typedef::MesgNum::SESSION);
    assert_eq!(
        int_of(session[0], mesgdef::Session::TOTAL_CYCLES),
        None,
        "骑行：步数不是踏频总数，不写 TOTAL_CYCLES"
    );

    // 没有步数的记录仍然不补零。
    let bare = export_with(json!({
        "workouts": [{
            "workout_id": "w1", "effective_type": "run",
            "start_time": "2026-08-24T06:00:00+08:00",
            "route": [], "splits": [], "pauses": [],
            "samples": [
                { "timestamp": "2026-08-24T06:00:00+08:00", "heart_rate": 120 },
                { "timestamp": "2026-08-24T06:00:01+08:00", "heart_rate": 121 }
            ]
        }]
    }));
    let (files, _) = to_fit(&bare).unwrap();
    let fit = decode(&files[0].1);
    let session = messages_of(&fit, typedef::MesgNum::SESSION);
    assert_eq!(
        int_of(session[0], mesgdef::Session::TOTAL_CYCLES),
        None,
        "没有步数就不写这个字段，不补零"
    );
}

/// 平均/最高速度和累计爬升必须写在 session 上。
///
/// 导入方（实测 OPPO 健康）读的是 session 字段，不会自己从 record 里算：
/// 少了它们，总览里的「平均速度」「最快速度」「累计爬升」全是 0，哪怕
/// 分段和逐秒序列里明明有数。
#[test]
fn the_session_carries_average_speed_max_speed_and_elevation() {
    // running_export() 那条 fixture 只有 2 秒却带 15217 m，算出来的平均
    // 速度会溢出 u16 —— 那是 fixture 的人为设定，不是真实情况。这里另起
    // 一条时长合理的记录来验。
    let export = export_with(json!({
        "workouts": [{
            "workout_id": "w1", "effective_type": "run",
            "start_time": "2026-08-24T06:00:00+08:00",
            "distance_meters": 1000.0,
            "route": [], "pauses": [],
            "samples": [
                { "timestamp": "2026-08-24T06:00:00+08:00", "speed": 3.0 },
                { "timestamp": "2026-08-24T06:08:20+08:00", "speed": 5.0 }
            ],
            "splits": [{
                "index": 1,
                "start_time": "2026-08-24T06:00:00+08:00",
                "end_time": "2026-08-24T06:08:20+08:00",
                "distance_m": 1000.0, "duration_seconds": 500,
                "elevation_gain_m": 9.35, "elevation_loss_m": 1.16,
                "partial": false
            }]
        }]
    }));
    let (files, _) = to_fit(&export).unwrap();
    let fit = decode(&files[0].1);
    let session = messages_of(&fit, typedef::MesgNum::SESSION);

    // 1000 m / 500 s = 2 m/s -> scale 1000 -> 2000
    assert_eq!(int_of(session[0], mesgdef::Session::AVG_SPEED), Some(2000));
    // 序列里的最大值 5 m/s -> 5000
    assert_eq!(int_of(session[0], mesgdef::Session::MAX_SPEED), Some(5000));
    // 9.35 m 四舍五入成 9
    assert_eq!(int_of(session[0], mesgdef::Session::TOTAL_ASCENT), Some(9));
    assert_eq!(int_of(session[0], mesgdef::Session::TOTAL_DESCENT), Some(1));

    let lap = messages_of(&fit, typedef::MesgNum::LAP);
    assert_eq!(int_of(lap[0], mesgdef::Lap::AVG_SPEED), Some(2000));
    assert_eq!(int_of(lap[0], mesgdef::Lap::MAX_SPEED), Some(5000));
}

#[test]
fn an_indoor_workout_without_gps_still_produces_a_file() {
    // FIT 不要求 GPS。只有心率的跑步机记录是完全合法的 FIT，
    // 判空条件必须是「既没有 route 也没有 samples」。
    let export = export_with(json!({
        "workouts": [
            {
                "workout_id": "w1", "effective_type": "treadmill",
                "start_time": "2026-08-24T06:00:00+08:00",
                "route": [],
                "samples": [
                    { "timestamp": "2026-08-24T06:00:00+08:00", "heart_rate": 120 },
                    { "timestamp": "2026-08-24T06:00:01+08:00", "heart_rate": 122 }
                ],
                "splits": [], "pauses": []
            }
        ]
    }));

    let (files, records) = to_fit(&export).unwrap();
    assert_eq!(files.len(), 1);
    assert_eq!(records, 2);

    let fit = decode(&files[0].1);
    let session = messages_of(&fit, typedef::MesgNum::SESSION);
    assert_eq!(
        int_of(session[0], mesgdef::Session::SUB_SPORT),
        Some(i64::from(typedef::SubSport::TREADMILL.0))
    );
    for record in messages_of(&fit, typedef::MesgNum::RECORD) {
        assert!(raw(record, mesgdef::Record::POSITION_LAT).is_none());
    }
}

#[test]
fn a_pause_becomes_timer_stop_and_start() {
    let export = export_with(json!({
        "workouts": [
            {
                "workout_id": "w1", "effective_type": "run",
                "start_time": "2026-08-24T06:00:00+08:00",
                "route": [
                    { "timestamp": "2026-08-24T06:00:00+08:00", "latitude": 31.0, "longitude": 121.0 },
                    { "timestamp": "2026-08-24T06:10:00+08:00", "latitude": 31.1, "longitude": 121.1 }
                ],
                "samples": [], "splits": [],
                "pauses": [
                    { "start_time": "2026-08-24T06:02:00+08:00",
                      "end_time": "2026-08-24T06:05:00+08:00", "kind": "manual" }
                ]
            }
        ]
    }));

    let (files, _) = to_fit(&export).unwrap();
    let fit = decode(&files[0].1);
    let events = messages_of(&fit, typedef::MesgNum::EVENT);

    // 开始 + 暂停 stop + 恢复 start + 结束 stop
    assert_eq!(events.len(), 4, "暂停两侧要落下 timer stop / start");
    let types: Vec<Option<i64>> = events
        .iter()
        .map(|event| int_of(event, mesgdef::Event::EVENT_TYPE))
        .collect();
    let start = Some(i64::from(typedef::EventType::START.0));
    let stop = Some(i64::from(typedef::EventType::STOP.0));
    assert_eq!(types, vec![start, stop, start, stop]);
    let session = messages_of(&fit, typedef::MesgNum::SESSION)[0];
    assert_eq!(
        int_of(session, mesgdef::Session::TOTAL_ELAPSED_TIME),
        Some(600_000)
    );
    assert_eq!(
        int_of(session, mesgdef::Session::TOTAL_TIMER_TIME),
        Some(420_000)
    );
    let lap = messages_of(&fit, typedef::MesgNum::LAP)[0];
    assert_eq!(int_of(lap, mesgdef::Lap::TOTAL_TIMER_TIME), Some(420_000));
    let activity = messages_of(&fit, typedef::MesgNum::ACTIVITY)[0];
    assert_eq!(
        int_of(activity, mesgdef::Activity::TOTAL_TIMER_TIME),
        Some(420_000)
    );
}

#[test]
fn overlapping_and_out_of_bounds_pauses_are_counted_once() {
    let workout = json!({"pauses": [
        {"start_time": "2026-09-11T00:01:00Z", "end_time": "2026-09-11T00:04:00Z"},
        {"start_time": "2026-09-11T00:02:00Z", "end_time": "2026-09-11T00:05:00Z"},
        {"start_time": "2026-09-10T23:59:00Z", "end_time": "2026-09-11T00:00:30Z"},
        {"start_time": "2026-09-11T00:09:30Z", "end_time": "2026-09-11T00:12:00Z"},
        {"start_time": "2026-09-11T00:08:00Z", "end_time": "2026-09-11T00:07:00Z"}
    ]});
    let start = parse_unix("2026-09-11T00:00:00Z").unwrap();
    assert_eq!(timer_seconds(&workout, start, start + 600), 300.0);
}

#[test]
fn cloud_moving_time_and_full_activity_bounds_survive_sparse_samples() {
    let export = export_with(json!({"workouts": [{
        "workout_id": "moving-time", "effective_type": "run",
        "start_time": "2026-09-11T00:00:00Z", "end_time": "2026-09-11T00:10:00Z",
        "moving_seconds": 420, "distance_meters": 1400,
        "samples": [
            {"timestamp": "2026-09-11T00:00:10Z", "heart_rate": 100},
            {"timestamp": "2026-09-11T00:08:00Z", "heart_rate": 110}
        ],
        "route": [], "pauses": [], "splits": []
    }]}));
    let (files, _) = to_fit(&export).unwrap();
    let fit = decode(&files[0].1);
    let session = messages_of(&fit, typedef::MesgNum::SESSION)[0];
    assert_eq!(
        int_of(session, mesgdef::Session::TOTAL_ELAPSED_TIME),
        Some(600_000)
    );
    assert_eq!(
        int_of(session, mesgdef::Session::TOTAL_TIMER_TIME),
        Some(420_000)
    );
    assert_eq!(int_of(session, mesgdef::Session::AVG_SPEED), Some(3333));
    let lap = messages_of(&fit, typedef::MesgNum::LAP)[0];
    assert_eq!(int_of(lap, mesgdef::Lap::TOTAL_TIMER_TIME), Some(420_000));
}

/// 云端给了爬升就用云端的，别再拿分段之和覆盖它。
///
/// 实测差得不小：一次 6.37 km 健走，云端 59 m，分段之和 37 m。用户在
/// Zepp App 里看到的是 59。
#[test]
fn cloud_elevation_wins_over_the_sum_of_splits() {
    let export = export_with(json!({
        "workouts": [{
            "workout_id": "w1", "effective_type": "walking",
            "start_time": "2026-08-28T15:23:37+08:00",
            "distance_meters": 6377.0,
            "elevation_gain_m": 59.35,
            "elevation_loss_m": 59.36,
            "route": [], "pauses": [],
            "samples": [
                { "timestamp": "2026-08-28T15:23:37+08:00", "heart_rate": 105 },
                { "timestamp": "2026-08-28T16:53:40+08:00", "heart_rate": 121 }
            ],
            // 分段之和只有 16，和云端的 59 明显不同
            "splits": [
                { "index": 1, "start_time": "2026-08-28T15:23:37+08:00",
                  "end_time": "2026-08-28T15:39:33+08:00", "distance_m": 1000.0,
                  "duration_seconds": 956, "elevation_gain_m": 9.7,
                  "elevation_loss_m": 12.01, "partial": false },
                { "index": 2, "start_time": "2026-08-28T15:39:33+08:00",
                  "end_time": "2026-08-28T15:53:51+08:00", "distance_m": 1000.0,
                  "duration_seconds": 858, "elevation_gain_m": 7.19,
                  "elevation_loss_m": 3.03, "partial": false }
            ]
        }]
    }));

    let (files, _) = to_fit(&export).unwrap();
    let fit = decode(&files[0].1);
    let session = messages_of(&fit, typedef::MesgNum::SESSION);
    assert_eq!(
        int_of(session[0], mesgdef::Session::TOTAL_ASCENT),
        Some(59),
        "云端给了 59.35 就该写 59，而不是分段之和的 17"
    );
    assert_eq!(
        int_of(session[0], mesgdef::Session::TOTAL_DESCENT),
        Some(59)
    );
}

#[test]
fn refuses_to_write_an_empty_file() {
    let export = export_with(json!({
        "workouts": [
            { "workout_id": "w1", "effective_type": "yoga",
              "route": [], "samples": [], "splits": [], "pauses": [] }
        ]
    }));
    let error = to_fit(&export).unwrap_err();
    assert!(error.contains("没有可导出的运动明细"), "实际错误：{error}");
}

#[test]
fn an_unmapped_sport_falls_back_to_generic_rather_than_a_near_miss() {
    assert_eq!(map_sport("tug_of_war").0 .0, typedef::Sport::GENERIC.0);
    assert_eq!(map_sport("").0 .0, typedef::Sport::GENERIC.0);
    // trail running 有真正的对应项，不该落到 GENERIC —— 这正是 issue #24
    // 里被错认成公开水域游泳的那一个。
    assert_eq!(map_sport("trail_running").1 .0, typedef::SubSport::TRAIL.0);
}

#[test]
fn two_workouts_starting_in_the_same_second_do_not_overwrite_each_other() {
    let one = json!({
        "workout_id": "w1", "effective_type": "run",
        "start_time": "2026-08-24T06:00:00+08:00",
        "route": [], "splits": [], "pauses": [],
        "samples": [{ "timestamp": "2026-08-24T06:00:00+08:00", "heart_rate": 120 }]
    });
    let export = export_with(json!({ "workouts": [one.clone(), one] }));

    let (files, _) = to_fit(&export).unwrap();
    assert_eq!(files.len(), 2);
    assert_ne!(files[0].0, files[1].0, "撞名的文件不能互相覆盖");
}

#[test]
fn an_out_of_range_altitude_is_dropped_instead_of_clamped() {
    assert_eq!(encode_altitude(12.4), Some(2562));
    assert_eq!(encode_altitude(-20000.0), None, "海拔哨兵值不能写成假高度");
    assert_eq!(encode_altitude(f64::NAN), None);
}
/// 对拍报告里「Zepp 那份带的东西更多」的那一串，逐条钉住。
///
/// 这些字段的数据一直在库里，只是没写进文件。每一个的 scale / offset 都不一样，
/// 写错了不会报错，只会让读文件的人看到一个量级不对却仍然像样的数字——所以这里
/// 不是断言「有值」，而是断言「解回来等于当初放进去的那个真实读数」。
#[test]
fn the_session_carries_stride_power_altitude_effect_and_hr_zones() {
    let export = export_with(json!({
        "workouts": [{
            "workout_id": "1",
            "effective_type": "run",
            "start_time": "2026-08-26T01:57:30+00:00",
            "end_time": "2026-08-26T02:00:30+00:00",
            "distance_meters": 900.0,
            "avg_stride_cm": 106.0,
            "max_altitude_m": 58.2,
            "min_altitude_m": 28.4,
            "training_effect": 5.0,
            "anaerobic_training_effect": 2.5,
            "hr_zones": [
                { "index": 0, "upper_bound_bpm": 113, "seconds": 0 },
                { "index": 1, "upper_bound_bpm": 141, "seconds": 31 },
                { "index": 2, "upper_bound_bpm": 154, "seconds": 346 },
                { "index": 3, "upper_bound_bpm": 162, "seconds": 4734 }
            ],
            "samples": [
                { "timestamp": "2026-08-26T01:57:30+00:00", "heart_rate": 150,
                  "power_watts": 200.0, "stride_cm": 100.0, "altitude_m": 30.0 },
                { "timestamp": "2026-08-26T01:57:31+00:00", "heart_rate": 152,
                  "power_watts": 300.0, "stride_cm": 110.0, "altitude_m": 50.0 }
            ],
            "route": []
        }]
    }));
    let (files, _) = to_fit(&export).expect("导出应当成功");
    let fit = decode(&files[0].1);
    let session = messages_of(&fit, typedef::MesgNum::SESSION);
    assert_eq!(session.len(), 1);

    // avg_step_length: u16, scale 10, 单位 mm -> 106 cm = 1060 mm -> 10600
    assert_eq!(
        int_of(session[0], mesgdef::Session::AVG_STEP_LENGTH),
        Some(10600),
        "步幅存的是「毫米的十倍」"
    );
    // 功率就是瓦，没有 scale。
    assert_eq!(int_of(session[0], mesgdef::Session::AVG_POWER), Some(250));
    assert_eq!(int_of(session[0], mesgdef::Session::MAX_POWER), Some(300));
    // 海拔: (米 + 500) x 5
    assert_eq!(
        int_of(session[0], mesgdef::Session::MAX_ALTITUDE),
        Some(((58.2_f64 + 500.0) * 5.0).round() as i64)
    );
    assert_eq!(
        int_of(session[0], mesgdef::Session::MIN_ALTITUDE),
        Some(((28.4_f64 + 500.0) * 5.0).round() as i64)
    );
    // 采样平均高度 (30 + 50) / 2 = 40
    assert_eq!(
        int_of(session[0], mesgdef::Session::AVG_ALTITUDE),
        Some(((40.0_f64 + 500.0) * 5.0).round() as i64)
    );
    // 训练效果: u8, scale 10
    assert_eq!(
        int_of(session[0], mesgdef::Session::TOTAL_TRAINING_EFFECT),
        Some(50)
    );
    assert_eq!(
        int_of(
            session[0],
            mesgdef::Session::TOTAL_ANAEROBIC_TRAINING_EFFECT
        ),
        Some(25)
    );
}

/// 心率区间必须按 `index` 落位。
///
/// 中间缺一档时按顺序平铺，后面每一档都会往前串一个区间——而串完之后的数字
/// 依旧完全合理，没有任何东西会报错。所以这一条单独钉。
#[test]
fn hr_zone_buckets_land_on_their_own_index_even_with_a_gap() {
    let export = export_with(json!({
        "workouts": [{
            "workout_id": "1",
            "effective_type": "run",
            "start_time": "2026-08-26T01:57:30+00:00",
            "end_time": "2026-08-26T01:58:30+00:00",
            "hr_zones": [
                { "index": 0, "upper_bound_bpm": 113, "seconds": 10 },
                { "index": 3, "upper_bound_bpm": 162, "seconds": 40 }
            ],
            "samples": [
                { "timestamp": "2026-08-26T01:57:30+00:00", "heart_rate": 150 },
                { "timestamp": "2026-08-26T01:57:31+00:00", "heart_rate": 152 }
            ],
            "route": []
        }]
    }));
    let (files, _) = to_fit(&export).expect("导出应当成功");
    let fit = decode(&files[0].1);
    let session = messages_of(&fit, typedef::MesgNum::SESSION);
    let zones = session[0]
        .fields
        .iter()
        .find(|field| field.num == mesgdef::Session::TIME_IN_HR_ZONE)
        .expect("心率区间应当写进去了");
    // 单位是毫秒（scale 1000）。第 1、2 档没有读数，是 0 而不是被 40 顶上来。
    match &zones.value {
        FitValue::VecUint32(values) => {
            assert_eq!(values.as_slice(), &[10_000, 0, 0, 40_000]);
        }
        other => panic!("心率区间应当是一个 u32 数组，拿到 {other:?}"),
    }
}

/// 逐条 record 的步幅。库里每一秒都有，FIT 里以前一直是空的。
#[test]
fn each_record_carries_its_own_step_length() {
    let export = export_with(json!({
        "workouts": [{
            "workout_id": "1",
            "effective_type": "run",
            "start_time": "2026-08-26T01:57:30+00:00",
            "end_time": "2026-08-26T01:58:30+00:00",
            "samples": [
                { "timestamp": "2026-08-26T01:57:30+00:00", "heart_rate": 150, "stride_cm": 98.5 }
            ],
            "route": []
        }]
    }));
    let (files, _) = to_fit(&export).expect("导出应当成功");
    let fit = decode(&files[0].1);
    let records = messages_of(&fit, typedef::MesgNum::RECORD);
    assert_eq!(records.len(), 1);
    // step_length: u16, scale 10, 单位 mm -> 98.5 cm = 985 mm -> 9850
    assert_eq!(int_of(records[0], mesgdef::Record::STEP_LENGTH), Some(9850));
}

/// 没有心率区间的运动不写这个字段，而不是写一个空数组。
#[test]
fn a_workout_without_hr_zones_writes_no_zone_field() {
    let export = export_with(json!({
        "workouts": [{
            "workout_id": "1",
            "effective_type": "run",
            "start_time": "2026-08-26T01:57:30+00:00",
            "end_time": "2026-08-26T01:58:30+00:00",
            "samples": [
                { "timestamp": "2026-08-26T01:57:30+00:00", "heart_rate": 150 }
            ],
            "route": []
        }]
    }));
    let (files, _) = to_fit(&export).expect("导出应当成功");
    let fit = decode(&files[0].1);
    let session = messages_of(&fit, typedef::MesgNum::SESSION);
    assert!(session[0]
        .fields
        .iter()
        .all(|field| field.num != mesgdef::Session::TIME_IN_HR_ZONE));
}

/// lat=999 不是地球上的点：record 上没有坐标字段（心率照写），
/// session/lap 的起点坐标也只能取到合法的那个点。
#[test]
fn out_of_domain_coordinates_are_dropped_before_semicircle_conversion() {
    let export = export_with(json!({
        "workouts": [{
            "workout_id": "w1",
            "effective_type": "run",
            "start_time": "2026-08-24T06:00:00+08:00",
            "end_time": "2026-08-24T06:00:02+08:00",
            "route": [
                { "timestamp": "2026-08-24T06:00:00+08:00", "latitude": 999.0,
                  "longitude": 121.0 },
                { "timestamp": "2026-08-24T06:00:01+08:00", "latitude": 31.0,
                  "longitude": 121.0 }
            ],
            "samples": [
                { "timestamp": "2026-08-24T06:00:00+08:00", "heart_rate": 132 },
                { "timestamp": "2026-08-24T06:00:01+08:00", "heart_rate": 134 }
            ],
            "splits": [],
            "pauses": []
        }]
    }));
    let (files, _) = to_fit(&export).expect("导出应当成功");
    let fit = decode(&files[0].1);
    let records = messages_of(&fit, typedef::MesgNum::RECORD);
    assert_eq!(records.len(), 2, "两条采样仍然各写一条 record");
    assert_eq!(
        int_of(records[0], mesgdef::Record::POSITION_LAT),
        None,
        "lat=999 不许进 record"
    );
    assert_eq!(int_of(records[0], mesgdef::Record::POSITION_LONG), None);
    assert_eq!(
        int_of(records[0], mesgdef::Record::HEART_RATE),
        Some(132),
        "坐标坏了不等于整条采样没了"
    );
    let expected = (31.0 * SEMICIRCLES_PER_DEGREE).round() as i64;
    assert!(
        (int_of(records[1], mesgdef::Record::POSITION_LAT).unwrap() - expected).abs() <= 1,
        "合法点的坐标照常写"
    );
    let session = messages_of(&fit, typedef::MesgNum::SESSION);
    assert_eq!(
        int_of(session[0], mesgdef::Session::START_POSITION_LAT),
        Some(expected),
        "起点坐标只能取到合法点，不能是那个 lat=999"
    );
    let lap = messages_of(&fit, typedef::MesgNum::LAP);
    assert_eq!(
        int_of(lap[0], mesgdef::Lap::START_POSITION_LAT),
        Some(expected)
    );
}
