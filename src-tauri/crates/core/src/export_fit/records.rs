//! 单次运动编码成 FIT：合并逐点序列、记录消息、分圈触发方式（从 export_fit.rs 拆出，逻辑不变）。

use super::*;

/// 编码单条运动。没有任何可写的采样时返回 `Ok(None)`，让调用方跳过它。
///
/// 判空看的是「既没有 route 也没有 samples」而不是「没有 route」：室内运动
/// 本来就没有 GPS，而 FIT 从不要求 GPS。一条只有心率的跑步机记录是完全合法
/// 的 FIT 文件。
pub(super) fn encode_workout(workout: &Value) -> Result<Option<(Vec<u8>, usize)>, String> {
    let points = merge_series(workout);
    if points.is_empty() {
        return Ok(None);
    }

    let (sport, sub_sport) = map_sport(text(
        workout
            .get("effective_type")
            .or_else(|| workout.get("workout_type")),
    ));

    let sample_start = points
        .first()
        .map(|(timestamp, _)| *timestamp)
        .expect("points 非空");
    let sample_end = points
        .last()
        .map(|(timestamp, _)| *timestamp)
        .expect("points 非空");

    // Retain the full recorded activity span even if the first/last sample is
    // missing. Cloud moving_seconds describes this span, not just sample coverage.
    let (start_unix, end_unix) = match (
        parse_unix(text(workout.get("start_time"))),
        parse_unix(text(workout.get("end_time"))),
    ) {
        (Some(start), Some(end)) if start <= sample_start && end >= sample_end && end > start => {
            (start, end)
        }
        _ => (sample_start, sample_end),
    };

    let mut messages = Vec::new();

    // file_id 必须是第一条消息，否则文件不被认作 activity。
    messages.push(Message {
        num: typedef::MesgNum::FILE_ID,
        fields: vec![
            enum_field(mesgdef::FileId::TYPE, typedef::File::ACTIVITY.0),
            u16_field(mesgdef::FileId::MANUFACTURER, typedef::Manufacturer::ZEPP.0),
            u32_field(mesgdef::FileId::TIME_CREATED, fit_timestamp(start_unix)),
        ],
        ..Default::default()
    });

    // 设备名只在本地库确实记了的时候写。这里写的是 Zepp 报的那块表，不是
    // ZeppBridge 自己。
    let device_label = text(workout.get("device_label"));
    if !device_label.is_empty() {
        messages.push(Message {
            num: typedef::MesgNum::DEVICE_INFO,
            fields: vec![
                u32_field(mesgdef::DeviceInfo::TIMESTAMP, fit_timestamp(start_unix)),
                u16_field(
                    mesgdef::DeviceInfo::MANUFACTURER,
                    typedef::Manufacturer::ZEPP.0,
                ),
                string_field(mesgdef::DeviceInfo::PRODUCT_NAME, device_label),
            ],
            ..Default::default()
        });
    }

    messages.push(timer_event(start_unix, typedef::EventType::START));

    // 暂停区间：进入暂停写 timer stop，恢复写 timer start。这和 GPX 导出在
    // 暂停两侧切 trkseg 是同一份依据，只是换成 FIT 的说法。
    let pauses = pause_intervals(workout, start_unix, end_unix);
    let pause_events: Vec<_> = pauses
        .iter()
        .flat_map(|&(start, end)| {
            [
                (start, typedef::EventType::STOP),
                (end, typedef::EventType::START),
            ]
        })
        .collect();

    let mut record_count = 0usize;
    let mut pause_cursor = 0usize;
    for (unix, point) in &points {
        while pause_cursor < pause_events.len() && pause_events[pause_cursor].0 <= *unix {
            let (at, event_type) = pause_events[pause_cursor];
            messages.push(timer_event(at, event_type));
            pause_cursor += 1;
        }
        messages.push(record_message(*unix, point, sport));
        record_count += 1;
    }

    for &(at, event_type) in &pause_events[pause_cursor..] {
        messages.push(timer_event(at, event_type));
    }

    messages.push(timer_event(end_unix, typedef::EventType::STOP));

    let elapsed_seconds = (end_unix - start_unix).max(0) as f64;
    let moving_seconds = timer_seconds(workout, start_unix, end_unix);
    // 手表自己记的圈优先于我们按公里切的分段。
    //
    // 「我经常按圈键，如果你的 .fit 里能带上圈数据，那会是我的首选」——
    // GitHub 上那份逐字段对拍报告里的原话。手表记了圈，那就是这次运动真实
    // 发生的分段；每公里是我们事后切的，两者都在库里，写进文件的只能有一组。
    let lap_source = if array(workout, "laps").is_empty() {
        LapSource {
            field: "splits",
            trigger: typedef::LapTrigger::DISTANCE,
        }
    } else {
        LapSource {
            field: "laps",
            trigger: watch_lap_trigger(workout),
        }
    };
    let mut lap_count = push_laps(
        &mut messages,
        workout,
        lap_source,
        sport,
        sub_sport,
        start_unix,
        &points,
    );
    // 一条 lap 都没写出来的时候必须补一条，理由见 `push_whole_activity_lap`。
    if lap_count == 0 {
        push_whole_activity_lap(
            &mut messages,
            workout,
            sport,
            sub_sport,
            start_unix,
            end_unix,
            elapsed_seconds,
            &points,
        );
        lap_count = 1;
    }
    push_session(
        &mut messages,
        workout,
        sport,
        sub_sport,
        start_unix,
        end_unix,
        elapsed_seconds,
        lap_count,
        &points,
    );

    let mut activity_fields = vec![
        u32_field(mesgdef::Activity::TIMESTAMP, fit_timestamp(end_unix)),
        u32_field(
            mesgdef::Activity::TOTAL_TIMER_TIME,
            (moving_seconds * 1000.0) as u32,
        ),
        u16_field(mesgdef::Activity::NUM_SESSIONS, 1),
        enum_field(mesgdef::Activity::TYPE, typedef::Activity::MANUAL.0),
        enum_field(mesgdef::Activity::EVENT, typedef::Event::ACTIVITY.0),
        enum_field(mesgdef::Activity::EVENT_TYPE, typedef::EventType::STOP.0),
    ];
    // 本地时间戳。
    //
    // `activity.local_timestamp` 是「同一个时刻，用本地时区表示」；导入方拿
    // 它减掉 UTC 的 `timestamp` 就知道这次活动发生在哪个时区。只写 UTC 的话，
    // Garmin Connect 只能退回账号的默认时区——于是北京时间早上六点的跑步会
    // 显示成前一天晚上十点。
    //
    // 入库后的 start_time 已转为 UTC，零偏移不能证明手表所在时区。
    // 只保留仍明确携带非零偏移的输入；无法确认时省略该字段。
    if let Some(offset) = local_offset_seconds(workout) {
        activity_fields.push(u32_field(
            mesgdef::Activity::LOCAL_TIMESTAMP,
            fit_timestamp(end_unix + i64::from(offset)),
        ));
    }
    messages.push(Message {
        num: typedef::MesgNum::ACTIVITY,
        fields: activity_fields,
        ..Default::default()
    });

    let mut fit = FIT {
        messages,
        ..Default::default()
    };

    let mut buffer = std::io::Cursor::new(Vec::new());
    Encoder::new()
        .encode(FromStd::new(&mut buffer), &mut fit)
        .map_err(|error| format!("FIT 编码失败: {error:?}"))?;

    Ok(Some((buffer.into_inner(), record_count)))
}

/// 一个时间点上所有可写的量。字段全是 `Option`：没测到就是没测到。
#[derive(Default, Clone)]
pub(super) struct Point {
    pub(super) latitude: Option<f64>,
    pub(super) longitude: Option<f64>,
    pub(super) altitude_m: Option<f64>,
    pub(super) heart_rate: Option<i64>,
    pub(super) speed_mps: Option<f64>,
    /// 步频，单位是**步/分钟**（见 `steps_per_minute_to_fit_cadence`）。
    pub(super) cadence_spm: Option<f64>,
    pub(super) power_watts: Option<f64>,
    pub(super) ground_contact_ms: Option<f64>,
    pub(super) vertical_oscillation_mm: Option<f64>,
    /// 步幅，单位厘米。`workout_samples.stride` 逐秒都有，而 FIT 文件里这
    /// 一列一直是空的——对拍报告里「步幅只在 Zepp 那份里有」说的就是它。
    pub(super) stride_cm: Option<f64>,
}

/// 把 `route` 和 `samples` 两条序列按时间戳合并成一条。
///
/// 两者本来就是同一次运动上的同一条时间轴——GPS 每秒一个点，传感器采样也
/// 每秒一条——但它们各自可能缺行，所以这里按秒对齐而不是按下标配对。按下标
/// 配对会在任何一条缺一行之后把后面全部错位。
pub(super) fn merge_series(workout: &Value) -> Vec<(i64, Point)> {
    let mut merged: BTreeMap<i64, Point> = BTreeMap::new();

    for entry in array(workout, "route") {
        let Some(unix) = parse_unix(text(entry.get("timestamp"))) else {
            continue;
        };
        let point = merged.entry(unix).or_default();
        // 坐标必须成对且落在地球表面上；出域的坐标等于没有坐标，
        // 这条 record 上别的量（心率、功率）不受影响。
        if let (Some(latitude), Some(longitude)) = (
            entry.get("latitude").and_then(Value::as_f64),
            entry.get("longitude").and_then(Value::as_f64),
        ) {
            if coordinates_in_domain(latitude, longitude) {
                point.latitude = Some(latitude);
                point.longitude = Some(longitude);
            }
        }
        if let Some(altitude) = entry.get("altitude_m").and_then(Value::as_f64) {
            point.altitude_m = Some(altitude);
        }
    }

    for entry in array(workout, "samples") {
        let Some(unix) = parse_unix(text(entry.get("timestamp"))) else {
            continue;
        };
        let point = merged.entry(unix).or_default();
        point.heart_rate = entry.get("heart_rate").and_then(Value::as_i64);
        point.speed_mps = entry.get("speed").and_then(Value::as_f64);
        point.cadence_spm = entry.get("cadence").and_then(Value::as_f64);
        point.power_watts = entry.get("power_watts").and_then(Value::as_f64);
        point.ground_contact_ms = entry.get("ground_contact_ms").and_then(Value::as_f64);
        point.stride_cm = entry.get("stride_cm").and_then(Value::as_f64);
        point.vertical_oscillation_mm =
            entry.get("vertical_oscillation_mm").and_then(Value::as_f64);
        // route 已经给过高度时不覆盖：两者同源，但 route 那份和坐标是配套的。
        if point.altitude_m.is_none() {
            point.altitude_m = entry.get("altitude_m").and_then(Value::as_f64);
        }
    }

    // 一个什么都没测到的时间点不值得写一条 record。
    merged.retain(|_, point| {
        point.latitude.is_some()
            || point.heart_rate.is_some()
            || point.speed_mps.is_some()
            || point.power_watts.is_some()
            || point.altitude_m.is_some()
            || point.cadence_spm.is_some()
    });

    merged.into_iter().collect()
}

/// 一个时间点写成一条 `record`。
pub(super) fn record_message(unix: i64, point: &Point, sport: typedef::Sport) -> Message {
    let mut fields = vec![u32_field(mesgdef::Record::TIMESTAMP, fit_timestamp(unix))];

    if let (Some(latitude), Some(longitude)) = (point.latitude, point.longitude) {
        if coordinates_in_domain(latitude, longitude) {
            if let (Some(lat), Some(lon)) = (semicircles(latitude), semicircles(longitude)) {
                fields.push(i32_field(mesgdef::Record::POSITION_LAT, lat));
                fields.push(i32_field(mesgdef::Record::POSITION_LONG, lon));
            }
        }
    }
    if let Some(altitude) = point.altitude_m.and_then(encode_altitude) {
        fields.push(u16_field(mesgdef::Record::ALTITUDE, altitude));
    }
    if let Some(heart_rate) = point.heart_rate.filter(|value| (1..=255).contains(value)) {
        fields.push(u8_field(mesgdef::Record::HEART_RATE, heart_rate as u8));
    }
    if let Some(speed) = point
        .speed_mps
        .filter(|value| value.is_finite() && *value >= 0.0)
    {
        let scaled = (speed * 1000.0).round();
        if scaled <= f64::from(u16::MAX) {
            fields.push(u16_field(mesgdef::Record::SPEED, scaled as u16));
        }
    }
    if let Some(cadence) = point
        .cadence_spm
        .and_then(|value| steps_per_minute_to_fit_cadence(value, sport))
    {
        fields.push(u8_field(mesgdef::Record::CADENCE, cadence));
    }
    if let Some(power) = point
        .power_watts
        .filter(|value| value.is_finite() && *value >= 0.0)
    {
        let watts = power.round();
        if watts <= f64::from(u16::MAX) {
            fields.push(u16_field(mesgdef::Record::POWER, watts as u16));
        }
    }
    if let Some(contact) = point
        .ground_contact_ms
        .filter(|value| value.is_finite() && *value > 0.0)
    {
        let scaled = (contact * 10.0).round();
        if scaled <= f64::from(u16::MAX) {
            fields.push(u16_field(mesgdef::Record::STANCE_TIME, scaled as u16));
        }
    }
    // 步幅。库里是厘米；FIT 的 `step_length` 是 u16、单位毫米、scale 10，
    // 也就是存「毫米的十倍」。1.09 m -> 1090 mm -> 10900。
    if let Some(stride) = point
        .stride_cm
        .filter(|value| value.is_finite() && *value > 0.0)
    {
        let encoded = (stride * 100.0).round();
        if encoded <= f64::from(u16::MAX) {
            fields.push(u16_field(mesgdef::Record::STEP_LENGTH, encoded as u16));
        }
    }
    if let Some(oscillation) = point
        .vertical_oscillation_mm
        .filter(|value| value.is_finite() && *value > 0.0)
    {
        let scaled = (oscillation * 10.0).round();
        if scaled <= f64::from(u16::MAX) {
            fields.push(u16_field(
                mesgdef::Record::VERTICAL_OSCILLATION,
                scaled as u16,
            ));
        }
    }

    Message {
        num: typedef::MesgNum::RECORD,
        fields,
        ..Default::default()
    }
}

/// 手表那组圈是按距离自动分的，还是人按出来的？
///
/// 手表不告诉我们，但圈的长度会：自动分段每一圈一样长（真实数据里见过一次
/// 5820 m 的跑步被切成 14 个 415 m 的圈），人按出来的长短不一（同一份数据里
/// 另一次是 570 / 2310 / 320 / 150 / 530 m 的间歇）。
///
/// 分不出来的时候宁可报 `MANUAL`：它的意思是「这一圈是有人划出来的」，而这
/// 组圈确实来自手表的圈列表，不是我们切的。反过来把人按的圈标成 `DISTANCE`，
/// 是在替手表宣称一件它没说过的事。
pub(super) fn watch_lap_trigger(workout: &Value) -> typedef::LapTrigger {
    let distances: Vec<f64> = array(workout, "laps")
        .iter()
        .filter_map(|lap| lap.get("distance_m").and_then(Value::as_f64))
        .filter(|value| value.is_finite() && *value > 0.0)
        .collect();
    // 最后一圈是零头，长度天然不同，不参与判断。
    let considered = distances.len().saturating_sub(1);
    if considered < 2 {
        return typedef::LapTrigger::MANUAL;
    }
    let first = distances[0];
    let uniform = distances[..considered]
        .iter()
        .all(|value| (value - first).abs() / first < 0.01);
    if uniform {
        typedef::LapTrigger::DISTANCE
    } else {
        typedef::LapTrigger::MANUAL
    }
}
