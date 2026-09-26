use super::*;
use serde_json::json;

#[test]
fn decodes_documented_gps_deltas() {
    let raw = json!({
        "trackid": 1_700_000_000i64,
        "source": "run.gps",
        "time": "0;2;2;",
        "longitude_latitude": "4004663552,11629333504;16403,8392;;;;14877,8392;",
        "altitude": "-2000000;7800;7772;",
        "heart_rate": "11,80;0,10;7,-6;",
        "speed": "2,1.20;4,2.45;",
        "gait": "2,0,71,160;2,2,74,164;",
        "pause": "1700000060,10,1,2,2;"
    });
    let decoded = decode_workout_detail(
        &raw,
        Some(Utc.timestamp_opt(1_700_000_030, 0).single().unwrap()),
        None,
    )
    .unwrap();
    assert_eq!(decoded.track_id, 1_700_000_000);
    assert_eq!(decoded.route.len(), 3);
    assert!((decoded.route[0].latitude - 40.04663552).abs() < 1e-8);
    assert!((decoded.route[0].longitude - 116.29333504).abs() < 1e-8);
    let second = &decoded.route[1];
    assert!((second.latitude - (40.04663552 + 16403.0 / COORD_FACTOR)).abs() < 1e-8);
    assert_eq!(decoded.route[0].altitude_m, Some(78.0));
    assert!(decoded
        .samples
        .iter()
        .any(|sample| sample.heart_rate == Some(80)));
    assert!(decoded
        .samples
        .iter()
        .any(|sample| sample.heart_rate == Some(84)));
    assert_eq!(decoded.pauses.len(), 1);
    assert_eq!(decoded.pauses[0].kind, "manual");
    assert!(decoded
        .samples
        .iter()
        .any(|sample| sample.stride_cm == Some(71.0)));
}

#[test]
fn altitude_sentinel_variants_are_never_terrain() {
    // Real payloads lead with -2000000 *plus a tail* (-2002110, -2003943
    // observed). An equality guard let those through as ~-20000 m samples.
    for sentinel in ["-2000000", "-2002110", "-2003943"] {
        let raw = json!({
            "trackid": 1_700_000_000i64,
            "time": "0;1;1;",
            "longitude_latitude": "4004663552,11629333504;1,1;1,1;",
            "altitude": format!("{sentinel};1451;1448;"),
        });
        let decoded = decode_workout_detail(&raw, None, None).unwrap();
        // The leading sentinel is backfilled from the first plausible
        // reading, never divided by 100 into terrain.
        assert_eq!(decoded.route[0].altitude_m, Some(14.51), "{sentinel}");
        assert!(
            decoded
                .samples
                .iter()
                .filter_map(|sample| sample.altitude_m)
                .all(|meters| (-1000.0..=10000.0).contains(&meters)),
            "{sentinel} leaked an implausible altitude"
        );
    }
}

#[test]
fn time_delta_altitude_wins_over_the_index_aligned_list() {
    let raw = json!({
        "trackid": 1_700_000_000i64,
        "time": "0;1;1;",
        "longitude_latitude": "4004663552,11629333504;1,1;1,1;",
        "altitude": "-2002110;9900;9900;",
        "time_delta_altitude": "1,3516;1,3518;1,3521;",
    });
    let decoded = decode_workout_detail(&raw, None, None).unwrap();
    let altitudes: Vec<Option<f64>> = decoded.route.iter().map(|point| point.altitude_m).collect();
    assert!(
        altitudes.contains(&Some(35.16)) || altitudes.contains(&Some(35.18)),
        "expected the pair series to supply altitude, got {altitudes:?}"
    );
    assert!(!altitudes.contains(&Some(99.0)));
}

#[test]
fn splits_come_from_the_servers_cumulative_distance() {
    // Integrating the per-second speed instead is 0.15% out on a run but
    // 12.6% out on a ride, so splits must read `currentDistance`.
    //
    // 步长是 5 秒一个读数：每秒 400 m 的「跳变」在单调性过滤里就是坏点，
    // 那道门必须先过。最后一条原地踏步的读数让零头有真实的结束时刻。
    let raw = json!({
        "trackid": 1_700_000_000i64,
        "time": "0;5;5;5;5;5;",
        "currentDistance": "0,0;5,40000;5,100000;5,160000;5,240000;5,240000;",
        "heart_rate": "0,150;5,10;5,0;5,-10;5,0;",
        "time_delta_altitude": "1,1000;5,1200;5,1100;5,1300;",
    });
    let decoded = decode_workout_detail(&raw, None, None).unwrap();
    let splits = &decoded.splits;
    assert_eq!(splits.len(), 3, "two full kilometres and a remainder");
    assert_eq!(splits[0].index, 1);
    assert_eq!(splits[1].index, 2);
    assert!(!splits[0].partial);
    assert!(!splits[1].partial);
    assert_eq!(splits[0].distance_m, 1000.0);
    assert_eq!(splits[1].distance_m, 1000.0);

    // The trailing 400 m is flagged, so it is never read as a slow
    // kilometre.
    assert!(splits[2].partial);
    assert_eq!(splits[2].distance_m, 400.0);

    // Pace is only defined where distance and time both moved.
    assert!(splits[0].pace_min_per_km.unwrap() > 0.0);
    assert!(splits[0].avg_hr.is_some());
    assert!(splits[0].max_hr.unwrap() >= splits[0].avg_hr.unwrap());
}

#[test]
fn a_workout_without_distance_reports_no_splits() {
    // Silence is the honest answer: an indoor session with no distance
    // series must not get kilometres invented for it.
    let raw = json!({
        "trackid": 1_700_000_100i64,
        "time": "1;1;1;",
        "heart_rate": "1,120;1,2;1,1;"
    });
    let decoded = decode_workout_detail(&raw, None, None).unwrap();
    assert!(decoded.splits.is_empty());
}

#[test]
fn indoor_without_gps_has_no_route() {
    let raw = json!({
        "trackid": 1_700_000_100i64,
        "time": "1;1;1;",
        "heart_rate": "1,120;1,2;1,-1;"
    });
    let decoded = decode_workout_detail(&raw, None, None).unwrap();
    assert!(decoded.route.is_empty());
    assert!(!decoded.samples.is_empty());
    assert!(decoded
        .samples
        .iter()
        .any(|sample| sample.heart_rate == Some(121)));
}

#[test]
fn missing_trackid_is_an_error() {
    let raw = json!({ "time": "1;1;" });
    assert!(decode_workout_detail(&raw, None, None).is_err());
}

#[test]
fn empty_heart_rate_does_not_invent_zeros() {
    let raw = json!({
        "data": {
            "trackid": 1_700_000_200i64,
            "time": "1;1;",
            "longitude_latitude": "1,1;2,2;"
        }
    });
    let decoded = decode_workout_detail(&raw, None, None).unwrap();
    assert!(decoded
        .samples
        .iter()
        .all(|sample| sample.heart_rate.is_none()));
    assert_eq!(decoded.route.len(), 2);
}

/// 乱码的 delta 必须让整行消失，不能变成 0 秒。
///
/// 变成 0 的后果不是「少一个样本」，是**这个样本和上一个落到同一个
/// 时间戳上**——采样数看着是对的，配速和功率却是错的，而界面上没有
/// 任何迹象。
#[test]
fn a_malformed_delta_drops_the_row_instead_of_becoming_zero() {
    // 第二对的 delta 是 `x`：读不懂。
    let pairs = parse_delta_pairs(Some(&json!("5,80;x,90;3,100;")), true);
    assert_eq!(pairs, vec![(5, 80), (3, 100)], "读不懂的行应当被丢掉");

    // 空 delta 仍然是协议约定的「下一秒」，不受影响。
    let with_empty = parse_delta_pairs(Some(&json!("5,80;,90;")), true);
    assert_eq!(with_empty, vec![(5, 80), (1, 90)]);

    // 浮点那一路同理。
    let valued = parse_valued_pairs(Some(&json!("2,180.5;oops,200.0;4,210.25;")));
    assert_eq!(valued, vec![(2, 180.5), (4, 210.25)]);
}
/// `currentDistance` 是空的时候，公里分段从云端自己的 `kilo_pace` 来。
///
/// 这份库里 336 条明细有 130 条正是这样：有 `kilo_pace`、没有 `currentDistance`，
/// 于是一段分段都出不来，导出的 .fit 整段跑步只有一圈。GitHub 上那份对拍报告
/// 里「run.fit: 1 圈，Zepp: 8 圈」说的就是它。
#[test]
fn kilo_pace_fills_in_splits_when_cumulative_distance_is_missing() {
    // 三公里，各 300 / 310 / 290 秒；第 6 列是累计秒数，用来自证列没读错。
    //
    // `time` 必须覆盖 kilo_pace 声称的整段时间：一次只持续 4 秒的运动不
    // 可能有 900 秒的公里数，那样的夹具证明不了任何事。这里 0/300/310/290/100
    // 累加是 1000 秒，比三公里多出 100 秒——那 100 秒就是最后那截零头。
    let raw = json!({
        "trackid": 1_700_000_000i64,
        "time": "0;300;310;290;100;",
        "currentDistance": "",
        "kilo_pace": "0,300,wtmkqm0228e3,1,-1,300,300266,69,0,109,0,4,0,164;\
    1,310,wtmkqnm0p17s,1,-1,610,310237,71,0,107,0,2,0,164;\
    2,290,wtmkqr93gqgr,1,-1,900,290246,69,0,105,0,1,0,160;",
        "heart_rate": "0,150;300,10;310,0;290,-10;100,0;",
    });
    let decoded = decode_workout_detail(&raw, None, Some(3400.0)).unwrap();
    let splits = &decoded.splits;
    assert_eq!(splits.len(), 4, "三个整公里加一截零头");
    assert_eq!(splits[0].duration_seconds, 300);
    assert_eq!(splits[1].duration_seconds, 310);
    assert_eq!(splits[2].duration_seconds, 290);
    for split in splits.iter().take(3) {
        assert_eq!(split.distance_m, 1000.0);
        assert!(!split.partial);
    }
    // 零头的长度来自汇总距离，不是猜的：3400 - 3000 = 400。
    assert!(splits[3].partial, "最后一截要标成不完整");
    assert_eq!(splits[3].distance_m, 400.0);
    assert_eq!(
        splits.iter().map(|split| split.distance_m).sum::<f64>(),
        3400.0,
        "分段距离合计必须等于总距离，不能悄悄少一截"
    );
}

/// 列对不上就整条拒掉，而不是拿一半当真。
///
/// `kilo_pace` 的列在不同记录之间会挪位：同样宽度下，有的记录第 4 列是平均
/// 心率，有的记录第 13 列才是。所以判断依据不是宽度，而是「序号连续、单圈
/// 秒数累加起来等于累计列」这一条自洽性——它对不上，就说明列读错了。
#[test]
fn a_kilo_pace_series_that_does_not_add_up_is_refused() {
    let inconsistent = json!({
        "trackid": 1_700_000_000i64,
        "time": "0;1;1;",
        "currentDistance": "",
        // 累计列写的是 300 / 999：第二行 300 + 310 = 610，对不上 999。
        "kilo_pace": "0,300,geo,1,-1,300,300266,69,0,109,0,4,0,164;\
    1,310,geo,1,-1,999,310237,71,0,107,0,2,0,164;",
        "heart_rate": "0,150;1,10;1,0;",
    });
    let decoded = decode_workout_detail(&inconsistent, None, Some(2000.0)).unwrap();
    assert!(decoded.splits.is_empty(), "对不上就不要，宁可只有整段一圈");

    // 序号跳号同理。
    let out_of_order = json!({
        "trackid": 1_700_000_000i64,
        "time": "0;1;1;",
        "currentDistance": "",
        "kilo_pace": "0,300,geo,1,-1,300,300266,69,0,109,0,4,0,164;\
    5,310,geo,1,-1,610,310237,71,0,107,0,2,0,164;",
        "heart_rate": "0,150;1,10;1,0;",
    });
    assert!(decode_workout_detail(&out_of_order, None, Some(2000.0))
        .unwrap()
        .splits
        .is_empty());
}

/// 有 `currentDistance` 时不动它：那条路测得更细，逐秒切，不该被兜底顶掉。
#[test]
fn cumulative_distance_still_wins_when_it_is_present() {
    // 同上的 5 秒步长夹具：分段必须仍由 `currentDistance` 切出来，
    // kilo_pace 那 999 秒不该出现。
    let raw = json!({
        "trackid": 1_700_000_000i64,
        "time": "0;5;5;5;5;5;",
        "currentDistance": "0,0;5,40000;5,100000;5,160000;5,240000;5,240000;",
        // 故意给一份和上面对不上的 kilo_pace：它不该被用到。
        "kilo_pace": "0,999,geo,1,-1,999,999000,69,0,109,0,4,0,164;",
        "heart_rate": "0,150;5,10;5,0;5,-10;5,0;",
    });
    let decoded = decode_workout_detail(&raw, None, Some(2400.0)).unwrap();
    assert_eq!(decoded.splits.len(), 3);
    assert_ne!(decoded.splits[0].duration_seconds, 999);
}

/// 汇总没给距离（室内、没 GPS）时不补零头，而不是编一个长度出来。
#[test]
fn without_a_summary_distance_the_remainder_is_left_out_rather_than_invented() {
    let raw = json!({
        "trackid": 1_700_000_000i64,
        "time": "0;1;1;",
        "currentDistance": "",
        "kilo_pace": "0,300,geo,1,-1,300,300266,69,0,109,0,4,0,164;",
        "heart_rate": "0,150;1,10;1,0;",
    });
    let decoded = decode_workout_detail(&raw, None, None).unwrap();
    assert_eq!(decoded.splits.len(), 1, "只有那一个整公里");
    assert!(!decoded.splits[0].partial);
    assert_eq!(decoded.splits[0].distance_m, 1000.0);
}
/// 手表自己记的圈，从 `lap` 字段来。
///
/// 这个字段一直在留存的报文里（本机 336 条明细中 32 条带它），从来没被解过。
/// GitHub 上那份 .fit 对拍报告里点名要的就是它：「我经常按圈键，如果你的
/// .fit 里能带上圈数据，那会是我的首选。」
#[test]
fn watch_recorded_laps_are_read_from_the_lap_field() {
    let raw = json!({
        "trackid": 1_700_000_000i64,
        "time": "0;300;300;",
        "heart_rate": "0,150;300,2;300,-2;",
        // 两圈各 500 m / 300 s；第 6 列是累计秒数。
        "lap": "0,300,500,s00000000000,150,300,-20000;\
    1,300,500,s00000000000,152,600,-20000;",
    });
    let decoded = decode_workout_detail(&raw, None, Some(1000.0)).unwrap();
    assert_eq!(decoded.laps.len(), 2);
    assert_eq!(decoded.laps[0].index, 1);
    assert_eq!(decoded.laps[0].distance_m, 500.0);
    assert_eq!(decoded.laps[0].duration_seconds, 300);
    assert_eq!(decoded.laps[0].avg_hr, Some(150));
    // 第二圈从第一圈结束的地方开始，不是从运动开头。
    assert_eq!(decoded.laps[1].start_time, decoded.laps[0].end_time);
    assert_eq!(decoded.laps[1].duration_seconds, 300);
}

/// 圈和每公里分段是两回事，谁也不替代谁。
///
/// 一次 5820 m 的跑步可以同时有 5 段公里分段和 14 个 415 m 的圈。塞进同一张
/// 表、或者让其中一个覆盖另一个，「每公里配速」那张图就会突然变成别的东西。
#[test]
fn laps_and_kilometre_splits_coexist() {
    let raw = json!({
        "trackid": 1_700_000_000i64,
        "time": "0;300;300;",
        "currentDistance": "0,0;300,50000;300,100000;",
        "heart_rate": "0,150;300,2;300,-2;",
        "lap": "0,300,500,s00000000000,150,300,-20000;\
    1,300,500,s00000000000,152,600,-20000;",
    });
    let decoded = decode_workout_detail(&raw, None, Some(1000.0)).unwrap();
    assert_eq!(decoded.laps.len(), 2, "手表的圈");
    assert!(!decoded.splits.is_empty(), "我们自己切的公里分段还在");
}

/// 和汇总对不上就整份丢掉，而不是拿一半当真。
///
/// 这是最强的两条对账：圈距离加起来要等于运动距离，最后一圈要在运动结束的
/// 时刻收尾。列读错了，两条都过不去——真实的 32 条则两条都过得去。
#[test]
fn laps_that_do_not_add_up_to_the_workout_are_refused() {
    // 圈距离合计 1000 m，汇总说这次跑了 5000 m。
    let wrong_distance = json!({
        "trackid": 1_700_000_000i64,
        "time": "0;300;300;",
        "heart_rate": "0,150;300,2;300,-2;",
        "lap": "0,300,500,s00000000000,150,300,-20000;\
    1,300,500,s00000000000,152,600,-20000;",
    });
    assert!(
        decode_workout_detail(&wrong_distance, None, Some(5000.0))
            .unwrap()
            .laps
            .is_empty(),
        "距离对不上就不要"
    );

    // 序号跳号。
    let out_of_order = json!({
        "trackid": 1_700_000_000i64,
        "time": "0;300;300;",
        "heart_rate": "0,150;300,2;300,-2;",
        "lap": "0,300,500,s00000000000,150,300,-20000;\
    7,300,500,s00000000000,152,600,-20000;",
    });
    assert!(decode_workout_detail(&out_of_order, None, Some(1000.0))
        .unwrap()
        .laps
        .is_empty());

    // 累计秒数往回走。
    let backwards = json!({
        "trackid": 1_700_000_000i64,
        "time": "0;300;300;",
        "heart_rate": "0,150;300,2;300,-2;",
        "lap": "0,300,500,s00000000000,150,600,-20000;\
    1,300,500,s00000000000,152,300,-20000;",
    });
    assert!(decode_workout_detail(&backwards, None, Some(1000.0))
        .unwrap()
        .laps
        .is_empty());
}

/// 没有 `lap` 字段是常态，不是错误：336 条明细里只有 32 条带它。
#[test]
fn a_workout_without_laps_is_not_an_error() {
    let raw = json!({
        "trackid": 1_700_000_000i64,
        "time": "0;300;",
        "heart_rate": "0,150;300,2;",
        "lap": "",
    });
    let decoded = decode_workout_detail(&raw, None, Some(1000.0)).unwrap();
    assert!(decoded.laps.is_empty());
}

/// 心率 0 是「这一圈没测到」，不是「心率为 0」。
#[test]
fn a_zero_heart_rate_on_a_lap_is_absent_not_zero() {
    let raw = json!({
        "trackid": 1_700_000_000i64,
        "time": "0;300;",
        "heart_rate": "0,150;300,2;",
        "lap": "0,300,1000,s00000000000,0,300,-20000;",
    });
    let decoded = decode_workout_detail(&raw, None, Some(1000.0)).unwrap();
    assert_eq!(decoded.laps.len(), 1);
    assert_eq!(decoded.laps[0].avg_hr, None);
}

/// 坏报文里的 trackid / 时间增量不能把解码器打崩。
///
/// `Duration::seconds` 和 `DateTime + Duration` 都会在越界时 panic；这里只
/// 允许 ParseError 或把时长夹到 48 小时。
#[test]
fn huge_track_id_or_time_deltas_do_not_panic() {
    let huge_id = json!({
        "trackid": i64::MAX,
        "time": "1;1;",
    });
    let err = decode_workout_detail(&huge_id, None, None).expect_err("i64::MAX 不是合法 unix 时间");
    assert!(
        matches!(err, ZeppBridgeError::ParseError(_)),
        "应当是 ParseError，实际 {err:?}"
    );

    let huge_time = ["2147483647"; 10].join(";");
    let huge_deltas = json!({
        "trackid": 1_700_000_000i64,
        "time": huge_time,
    });
    let decoded =
        decode_workout_detail(&huge_deltas, None, None).expect("时长应被夹到 48h 而不是 panic");
    let span = decoded
        .end_time
        .timestamp()
        .saturating_sub(decoded.start_time.timestamp());
    assert!(span <= MAX_ACTIVITY_SECONDS, "时长 {span} 超过了 48h 上限");

    let near_max = DateTime::<Utc>::MAX_UTC;
    let result = decode_workout_detail(
        &json!({
            "trackid": 1_700_000_000i64,
            "time": "1;",
        }),
        Some(near_max),
        None,
    );
    assert!(
        result.is_ok() || matches!(result, Err(ZeppBridgeError::ParseError(_))),
        "汇总结束时刻极大时不得 panic：{result:?}"
    );
}

/// 差分链上读不懂的一段 = 从那里起位置不可知：截断，不平移。
///
/// 坐标是累积差分，跳过坏段继续累加会得到一条形状正常但整体平移的
/// 假轨迹——地图上看不出任何异常，而每一个点都是错的。
#[test]
fn a_broken_coordinate_delta_truncates_the_route_instead_of_shifting_it() {
    let raw = json!({
        "trackid": 1_700_000_000i64,
        "time": "0;2;2;2;",
        "longitude_latitude": "4004663552,11629333504;16403,8392;abc,8392;14877,8392;",
    });
    let decoded = decode_workout_detail(&raw, None, None).unwrap();
    assert_eq!(decoded.route.len(), 2, "坏段之后的点一个都不许输出");
    assert_eq!(decoded.route_dropped_points, 2);
    // 第 2 点是「原点 + 第一个增量」，没有被坏段平移过。
    let second = &decoded.route[1];
    assert!((second.latitude - (40.04663552 + 16403.0 / COORD_FACTOR)).abs() < 1e-8);
    assert!((second.longitude - (116.29333504 + 8392.0 / COORD_FACTOR)).abs() < 1e-8);
}

/// 累加跑出地球表面同样截断——再往后的坐标都是空中楼阁。
#[test]
fn a_coordinate_that_leaves_the_earth_truncates_the_route() {
    let raw = json!({
        "trackid": 1_700_000_000i64,
        "time": "0;1;1;",
        // 第二个增量把纬度推过 90°。
        "longitude_latitude": "4004663552,11629333504;6000000000,0;1000,1000;",
    });
    let decoded = decode_workout_detail(&raw, None, None).unwrap();
    assert_eq!(decoded.route.len(), 1);
    assert_eq!(decoded.route_dropped_points, 2);
    assert!((decoded.route[0].latitude - 40.04663552).abs() < 1e-8);
}

/// `time` 里读不懂的 delta 同理：那之后连时刻都不可知，时长也不许再涨。
#[test]
fn a_broken_time_delta_truncates_both_route_and_duration() {
    let raw = json!({
        "trackid": 1_700_000_000i64,
        "time": "0;2;oops;2;",
        "longitude_latitude": "4004663552,11629333504;16403,8392;100,100;100,100;",
    });
    let decoded = decode_workout_detail(&raw, None, None).unwrap();
    assert_eq!(decoded.route.len(), 2);
    assert_eq!(decoded.route_dropped_points, 2);
    let span = decoded.end_time.timestamp() - decoded.start_time.timestamp();
    assert_eq!(span, 2, "时长只累加到第一个坏 delta 之前");
}

/// 逐秒心率沿用 lap 的 0..=250：300 是贴合不良或传感器坏点，不是心率。
#[test]
fn a_heart_rate_sample_above_the_plausible_ceiling_is_dropped() {
    let raw = json!({
        "trackid": 1_700_000_000i64,
        "time": "0;1;1;",
        // 累计差分：300 -> 150 -> 151。
        "heart_rate": "0,300;1,-150;1,1;",
    });
    let decoded = decode_workout_detail(&raw, None, None).unwrap();
    assert_eq!(decoded.samples[0].heart_rate, None, "300 必须被丢掉");
    assert_eq!(decoded.samples[1].heart_rate, Some(150));
    assert_eq!(decoded.samples[2].heart_rate, Some(151));
}

/// 累计距离里的回退和巨跳都是坏点：丢掉该点，不许切出上万个 0 时长分段。
#[test]
fn corrupt_cumulative_distance_points_do_not_create_thousands_of_empty_splits() {
    let raw = json!({
        "trackid": 1_700_000_000i64,
        "time": "0;300;300;300;300;300;",
        // 一次回退（1500 -> 800）和一次巨跳（800 -> 21,000,000 m），
        // 两个坏点都该被丢掉，而不是各自切出一段 0 时长的分段。
        "currentDistance": "0,0;300,150000;300,80000;300,2100000000;300,240000;",
        // 两个整公里，各 300 秒；行数对得上汇总的 2400 m。
        "kilo_pace": "0,300,geo,1,-1,300,300266,69,0,109,0,4,0,164;\
    1,300,geo,1,-1,600,300266,69,0,109,0,4,0,164;",
        "heart_rate": "0,150;300,2;300,-2;300,1;300,0;",
    });
    let decoded = decode_workout_detail(&raw, None, Some(2400.0)).unwrap();
    assert!(
        !decoded.splits.is_empty(),
        "currentDistance 被判坏之后应走 kilo_pace 兜底"
    );
    assert!(
        decoded
            .splits
            .iter()
            .all(|split| split.duration_seconds > 0),
        "不允许 0 时长分段：{:?}",
        decoded
            .splits
            .iter()
            .map(|split| split.duration_seconds)
            .collect::<Vec<_>>()
    );
    assert!(
        decoded.splits.len() <= 2400 / 1000 + 2,
        "分段数要和汇总距离同量级：{}",
        decoded.splits.len()
    );
}

/// kilo_pace 行数和汇总距离对不上就整份拒用，和 laps 的对账同一态度。
#[test]
fn a_kilo_pace_row_count_that_disagrees_with_the_summary_is_refused() {
    let raw = json!({
        "trackid": 1_700_000_000i64,
        "time": "0;300;300;",
        "currentDistance": "",
        // 3 整公里，但汇总只有 1500 m——行数对不上距离，一个都别信。
        "kilo_pace": "0,300,geo,1,-1,300,300266,69,0,109,0,4,0,164;\
    1,300,geo,1,-1,600,300266,69,0,109,0,4,0,164;\
    2,300,geo,1,-1,900,300266,69,0,109,0,4,0,164;",
        "heart_rate": "0,150;300,2;300,-2;",
    });
    let decoded = decode_workout_detail(&raw, None, Some(1500.0)).unwrap();
    assert!(
        decoded.splits.is_empty(),
        "行数和汇总距离对不上就不要：{:?}",
        decoded.splits.len()
    );
}

/// 高度和 GPS 共用下标：中间一段读不懂必须留空，不能把后面的高度前移。
#[test]
fn an_unparseable_altitude_keeps_index_alignment() {
    let raw = json!({
        "trackid": 1_700_000_000i64,
        "time": "0;1;1;",
        "longitude_latitude": "4004663552,11629333504;16403,8392;14877,8392;",
        "altitude": "7800;oops;7700;",
    });
    let decoded = decode_workout_detail(&raw, None, None).unwrap();
    assert_eq!(decoded.route.len(), 3, "高度坏了不等于轨迹点没了");
    assert_eq!(decoded.route[0].altitude_m, Some(78.0));
    assert_eq!(decoded.route[1].altitude_m, None, "读不懂的那一段就是缺测");
    assert_eq!(
        decoded.route[2].altitude_m,
        Some(77.0),
        "后面的高度不许前移到坏段上"
    );
}

/// 坐标累加溢出和跑出地球一样：后面的点位置不可知，截断。
#[test]
fn a_coordinate_cursor_overflow_truncates_the_route() {
    let raw = json!({
        "trackid": 1_700_000_000i64,
        "time": "0;1;1;",
        "longitude_latitude": format!(
            "4004663552,11629333504;{},0;1000,1000;",
            i64::MAX
        ),
    });
    let decoded = decode_workout_detail(&raw, None, None).unwrap();
    assert_eq!(decoded.route.len(), 1);
    assert_eq!(decoded.route_dropped_points, 2);
    assert!((decoded.route[0].latitude - 40.04663552).abs() < 1e-8);
}
