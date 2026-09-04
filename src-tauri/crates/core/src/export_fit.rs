//! FIT 导出。
//!
//! 输入和 CSV / GPX 一样，固定是 `Database::build_ai_export` 产出的标准化
//! JSON；这里只做重排和单位换算，不回查数据库，也不引入任何派生值。
//!
//! # 为什么这个文件存在
//!
//! 2.0.0 的更新日志里写过一句「Zepp 云端返回的字段不足以诚实地还原一份
//! FIT」。那句话是错的：`decoder/workout_detail.rs` 早就在解
//! `/v1/sport/run/detail.json` 的逐点 GPS、逐秒心率、速度、功率和跑姿，
//! 这些值也早就进了导出 JSON 的 `route` 与 `samples`——GPX 导出器读的就是
//! 它们。缺的从来不是数据，只是一个写 FIT 的编码器。见 issue #28。
//!
//! # 两条硬规则（与 `export_formats.rs` 一致）
//!
//! 1. 只输出本地库里真实存在的值。缺字段就不写这个 field，绝不补零，也绝不
//!    为了让文件「看起来完整」而猜一个单位。
//! 2. 没有可输出内容时返回错误，不落一个空文件。
//!
//! # 一次运动一个文件
//!
//! FIT 的 activity 文件按约定装一次活动。导出一个日期范围时这里返回多份
//! `(文件名, 字节)`，由调用方逐个落盘，而不是把它们串成一个 chained FIT
//! ——Garmin Connect 和 Strava 对串接文件的接受度并不一致。

use chrono::{DateTime, FixedOffset};
use embedded_io_adapters::std::FromStd;
use rustyfit::{
    profile::{mesgdef, typedef},
    proto::{Field, Message, Value as FitValue, FIT},
    Encoder,
};
use serde_json::Value;
use std::collections::BTreeMap;

/// FIT 纪元是 1989-12-31T00:00:00Z，比 Unix 纪元晚这么多秒。
const FIT_EPOCH_OFFSET: i64 = 631_065_600;

/// 经纬度用 semicircles：`度 × 2^31 / 180`。
const SEMICIRCLES_PER_DEGREE: f64 = 2_147_483_648.0 / 180.0;

/// FIT 的 `altitude` 是 `(米 + 500) × 5` 存进 u16，于是可表示范围就是
/// -500 m 到 about 8192 m。超出这个范围的读数不写，而不是截断成一个假高度。
const ALTITUDE_OFFSET_M: f64 = 500.0;
const ALTITUDE_SCALE: f64 = 5.0;

/// 一次导出产出的所有文件：`(文件名, FIT 字节)`，外加所有文件里 `record`
/// 消息的总数。
pub type FitFiles = (Vec<(String, Vec<u8>)>, usize);

/// 把一份标准化导出转成若干 `(文件名, FIT 字节)`，每条运动一份。
///
/// 返回的第二个值是所有文件里 `record` 消息的总数，和 `to_gpx` 返回轨迹点数
/// 是同一个意思：让调用方能如实报告「写出去了多少个采样点」。
pub fn to_fit(export: &Value) -> Result<FitFiles, String> {
    let data = export
        .get("data")
        .ok_or_else(|| "导出数据结构异常：缺少 data 段".to_string())?;

    let mut files = Vec::new();
    let mut total_records = 0usize;
    let mut used_names: BTreeMap<String, usize> = BTreeMap::new();

    for workout in array(data, "workouts") {
        let Some((bytes, records)) = encode_workout(workout)? else {
            continue;
        };
        let mut name = file_name_for(workout);
        // 同一秒开始的两条运动会撞名字。加序号，而不是让后一个覆盖前一个。
        let seen = used_names.entry(name.clone()).or_insert(0);
        *seen += 1;
        if *seen > 1 {
            name = format!("{}-{}", name.trim_end_matches(".fit"), seen);
            name.push_str(".fit");
        }
        files.push((name, bytes));
        total_records += records;
    }

    if files.is_empty() {
        return Err(
            "这段时间没有可导出的运动明细（只有带逐秒采样或 GPS 轨迹的运动才能生成 FIT）"
                .to_string(),
        );
    }

    Ok((files, total_records))
}

/// 编码单条运动。没有任何可写的采样时返回 `Ok(None)`，让调用方跳过它。
///
/// 判空看的是「既没有 route 也没有 samples」而不是「没有 route」：室内运动
/// 本来就没有 GPS，而 FIT 从不要求 GPS。一条只有心率的跑步机记录是完全合法
/// 的 FIT 文件。
fn encode_workout(workout: &Value) -> Result<Option<(Vec<u8>, usize)>, String> {
    let points = merge_series(workout);
    if points.is_empty() {
        return Ok(None);
    }

    let (sport, sub_sport) = map_sport(text(
        workout
            .get("effective_type")
            .or_else(|| workout.get("workout_type")),
    ));

    let start_unix = points
        .first()
        .map(|(timestamp, _)| *timestamp)
        .expect("points 非空");
    let end_unix = points
        .last()
        .map(|(timestamp, _)| *timestamp)
        .expect("points 非空");

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
    let pauses = pause_intervals(workout);

    let mut record_count = 0usize;
    let mut pause_cursor = 0usize;
    for (unix, point) in &points {
        while pause_cursor < pauses.len() && pauses[pause_cursor].0 <= *unix {
            let (stop_at, resume_at) = pauses[pause_cursor];
            messages.push(timer_event(stop_at, typedef::EventType::STOP));
            messages.push(timer_event(resume_at, typedef::EventType::START));
            pause_cursor += 1;
        }
        messages.push(record_message(*unix, point, sport));
        record_count += 1;
    }

    messages.push(timer_event(end_unix, typedef::EventType::STOP));

    let elapsed_seconds = (end_unix - start_unix).max(0) as f64;
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
            (elapsed_seconds * 1000.0) as u32,
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
    // 偏移量不用猜：导出 JSON 的 `start_time` 是带偏移的 RFC3339，手表当时在
    // 哪个时区就写着哪个。读不出来就不写这个字段，而不是假设 UTC。
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
struct Point {
    latitude: Option<f64>,
    longitude: Option<f64>,
    altitude_m: Option<f64>,
    heart_rate: Option<i64>,
    speed_mps: Option<f64>,
    /// 步频，单位是**步/分钟**（见 `steps_per_minute_to_fit_cadence`）。
    cadence_spm: Option<f64>,
    power_watts: Option<f64>,
    ground_contact_ms: Option<f64>,
    vertical_oscillation_mm: Option<f64>,
    /// 步幅，单位厘米。`workout_samples.stride` 逐秒都有，而 FIT 文件里这
    /// 一列一直是空的——对拍报告里「步幅只在 Zepp 那份里有」说的就是它。
    stride_cm: Option<f64>,
}

/// 把 `route` 和 `samples` 两条序列按时间戳合并成一条。
///
/// 两者本来就是同一次运动上的同一条时间轴——GPS 每秒一个点，传感器采样也
/// 每秒一条——但它们各自可能缺行，所以这里按秒对齐而不是按下标配对。按下标
/// 配对会在任何一条缺一行之后把后面全部错位。
fn merge_series(workout: &Value) -> Vec<(i64, Point)> {
    let mut merged: BTreeMap<i64, Point> = BTreeMap::new();

    for entry in array(workout, "route") {
        let Some(unix) = parse_unix(text(entry.get("timestamp"))) else {
            continue;
        };
        let point = merged.entry(unix).or_default();
        point.latitude = entry.get("latitude").and_then(Value::as_f64);
        point.longitude = entry.get("longitude").and_then(Value::as_f64);
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
fn record_message(unix: i64, point: &Point, sport: typedef::Sport) -> Message {
    let mut fields = vec![u32_field(mesgdef::Record::TIMESTAMP, fit_timestamp(unix))];

    if let (Some(latitude), Some(longitude)) = (point.latitude, point.longitude) {
        if let (Some(lat), Some(lon)) = (semicircles(latitude), semicircles(longitude)) {
            fields.push(i32_field(mesgdef::Record::POSITION_LAT, lat));
            fields.push(i32_field(mesgdef::Record::POSITION_LONG, lon));
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
fn watch_lap_trigger(workout: &Value) -> typedef::LapTrigger {
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

/// 这组 `lap` 从导出 JSON 的哪个数组来，以及该报成什么触发方式。
#[derive(Debug, Clone, Copy)]
struct LapSource {
    field: &'static str,
    trigger: typedef::LapTrigger,
}

/// 一组 `lap`，来自导出 JSON 的 `laps.field` 数组。
///
/// `source` 有两个取值，含义不同：
///
/// * `laps` —— **手表自己记的圈**。按圈键、按距离自动分段、或者间歇课的每
///   一段。这是运动当时真实发生的事，所以优先用它。
/// * `splits` —— 我们按每公里切的分段，取自服务端的累积距离（不是拿速度
///   积分估的）。手表没记圈时用这个。
///
/// 两者都没有时返回 0，由调用方补一条覆盖全程的 lap
/// （`push_whole_activity_lap`）——文件里绝不能一条 lap 都没有。
fn push_laps(
    messages: &mut Vec<Message>,
    workout: &Value,
    laps: LapSource,
    sport: typedef::Sport,
    sub_sport: typedef::SubSport,
    fallback_start: i64,
    points: &[(i64, Point)],
) -> u16 {
    let mut count = 0u16;
    for split in array(workout, laps.field) {
        let start = parse_unix(text(split.get("start_time"))).unwrap_or(fallback_start);
        let end = parse_unix(text(split.get("end_time"))).unwrap_or(start);
        let duration = split
            .get("duration_seconds")
            .and_then(Value::as_f64)
            .unwrap_or((end - start).max(0) as f64);

        let mut fields = vec![
            u16_field(mesgdef::Lap::MESSAGE_INDEX, count),
            u32_field(mesgdef::Lap::TIMESTAMP, fit_timestamp(end)),
            u32_field(mesgdef::Lap::START_TIME, fit_timestamp(start)),
            enum_field(mesgdef::Lap::EVENT, typedef::Event::LAP.0),
            enum_field(mesgdef::Lap::EVENT_TYPE, typedef::EventType::STOP.0),
            enum_field(mesgdef::Lap::SPORT, sport.0),
            enum_field(mesgdef::Lap::SUB_SPORT, sub_sport.0),
            enum_field(mesgdef::Lap::INTENSITY, typedef::Intensity::ACTIVE.0),
            enum_field(mesgdef::Lap::LAP_TRIGGER, laps.trigger.0),
            u32_field(
                mesgdef::Lap::TOTAL_ELAPSED_TIME,
                (duration * 1000.0).max(0.0) as u32,
            ),
            u32_field(
                mesgdef::Lap::TOTAL_TIMER_TIME,
                (duration * 1000.0).max(0.0) as u32,
            ),
        ];

        if let Some(distance) = split.get("distance_m").and_then(Value::as_f64) {
            fields.push(u32_field(
                mesgdef::Lap::TOTAL_DISTANCE,
                (distance * 100.0).max(0.0) as u32,
            ));
        }
        // 平均速度是「这一段的距离 ÷ 这一段的时间」，两个数都是上面刚写进
        // 文件的实测值，不是估的。不写它的代价是实实在在的：导入方普遍直接读
        // 这个字段而不是自己从 record 里算，于是分段表整列显示 0。
        if let (Some(distance), true) = (
            split.get("distance_m").and_then(Value::as_f64),
            duration > 0.0,
        ) {
            if let Some(speed) = encode_speed(distance / duration) {
                fields.push(u16_field(mesgdef::Lap::AVG_SPEED, speed));
            }
        }
        if let Some(speed) = max_speed_between(points, start, end).and_then(encode_speed) {
            fields.push(u16_field(mesgdef::Lap::MAX_SPEED, speed));
        }
        if let Some(avg_hr) = split
            .get("avg_hr")
            .and_then(Value::as_i64)
            .filter(|value| (1..=255).contains(value))
        {
            fields.push(u8_field(mesgdef::Lap::AVG_HEART_RATE, avg_hr as u8));
        }
        if let Some(max_hr) = split
            .get("max_hr")
            .and_then(Value::as_i64)
            .filter(|value| (1..=255).contains(value))
        {
            fields.push(u8_field(mesgdef::Lap::MAX_HEART_RATE, max_hr as u8));
        }
        if let Some(gain) = split.get("elevation_gain_m").and_then(Value::as_f64) {
            if gain.is_finite() && gain >= 0.0 && gain <= f64::from(u16::MAX) {
                fields.push(u16_field(mesgdef::Lap::TOTAL_ASCENT, gain as u16));
            }
        }
        if let Some(loss) = split.get("elevation_loss_m").and_then(Value::as_f64) {
            if loss.is_finite() && loss >= 0.0 && loss <= f64::from(u16::MAX) {
                fields.push(u16_field(mesgdef::Lap::TOTAL_DESCENT, loss as u16));
            }
        }

        messages.push(Message {
            num: typedef::MesgNum::LAP,
            fields,
            ..Default::default()
        });
        count += 1;
    }
    count
}

/// 没有 `splits` 时补上的那一条 lap，覆盖整段活动。
///
/// FIT 规范要求每个 session 至少挂一条 lap，且 `session.num_laps >= 1`。而
/// `splits` 是服务端按整公里切出来的：室内运动（跑步机、划船机、瑜伽、自由
/// 训练、跳绳）和距离不足 1 km 的户外运动根本不会有。这些运动之前导出的文件
/// 里一条 lap 都没有、`num_laps` 写着 0，Garmin Connect 和 Strava 在校验消息
/// 层级时直接拒收整份文件——issue #28 要的 FIT 导出，对这一整类运动等于没做
/// 出来，而本地看文件是「成功导出」的。
///
/// 补上去的值全部取自这个文件别处已经写过的实测值，不新引入任何估算：缺哪个
/// 就不写哪个字段，一如整个导出的规矩。
#[allow(clippy::too_many_arguments)]
fn push_whole_activity_lap(
    messages: &mut Vec<Message>,
    workout: &Value,
    sport: typedef::Sport,
    sub_sport: typedef::SubSport,
    start_unix: i64,
    end_unix: i64,
    elapsed_seconds: f64,
    points: &[(i64, Point)],
) {
    let duration_ms = (elapsed_seconds * 1000.0).max(0.0) as u32;
    let mut fields = vec![
        u16_field(mesgdef::Lap::MESSAGE_INDEX, 0),
        u32_field(mesgdef::Lap::TIMESTAMP, fit_timestamp(end_unix)),
        u32_field(mesgdef::Lap::START_TIME, fit_timestamp(start_unix)),
        enum_field(mesgdef::Lap::EVENT, typedef::Event::LAP.0),
        enum_field(mesgdef::Lap::EVENT_TYPE, typedef::EventType::STOP.0),
        enum_field(mesgdef::Lap::SPORT, sport.0),
        enum_field(mesgdef::Lap::SUB_SPORT, sub_sport.0),
        enum_field(mesgdef::Lap::INTENSITY, typedef::Intensity::ACTIVE.0),
        // 这一圈是「整段活动」，不是按距离切出来的，所以 trigger 写
        // session_end 而不是 distance——写 distance 会让导入方以为这里真的
        // 存在过一个整公里分段点。
        enum_field(
            mesgdef::Lap::LAP_TRIGGER,
            typedef::LapTrigger::SESSION_END.0,
        ),
        u32_field(mesgdef::Lap::TOTAL_ELAPSED_TIME, duration_ms),
        u32_field(mesgdef::Lap::TOTAL_TIMER_TIME, duration_ms),
    ];

    // 起点坐标同 session：取第一个真有定位的点，室内运动本来就没有。
    if let Some((latitude, longitude)) = points
        .iter()
        .find_map(|(_, point)| Some((point.latitude?, point.longitude?)))
    {
        if let (Some(lat), Some(lon)) = (semicircles(latitude), semicircles(longitude)) {
            fields.push(i32_field(mesgdef::Lap::START_POSITION_LAT, lat));
            fields.push(i32_field(mesgdef::Lap::START_POSITION_LONG, lon));
        }
    }

    if let Some(distance) = workout
        .get("distance_meters")
        .and_then(Value::as_f64)
        .filter(|value| value.is_finite() && *value >= 0.0)
    {
        fields.push(u32_field(
            mesgdef::Lap::TOTAL_DISTANCE,
            (distance * 100.0) as u32,
        ));
        if elapsed_seconds > 0.0 {
            if let Some(speed) = encode_speed(distance / elapsed_seconds) {
                fields.push(u16_field(mesgdef::Lap::AVG_SPEED, speed));
            }
        }
    }
    if let Some(speed) = max_speed_between(points, start_unix, end_unix).and_then(encode_speed) {
        fields.push(u16_field(mesgdef::Lap::MAX_SPEED, speed));
    }
    if let Some(calories) = workout
        .get("calories")
        .and_then(Value::as_f64)
        .filter(|value| value.is_finite() && *value >= 0.0 && *value <= f64::from(u16::MAX))
    {
        fields.push(u16_field(mesgdef::Lap::TOTAL_CALORIES, calories as u16));
    }
    if let Some(avg_hr) = workout
        .get("avg_hr")
        .and_then(Value::as_i64)
        .filter(|value| (1..=255).contains(value))
    {
        fields.push(u8_field(mesgdef::Lap::AVG_HEART_RATE, avg_hr as u8));
    }
    if let Some(max_hr) = workout
        .get("max_hr")
        .and_then(Value::as_i64)
        .filter(|value| (1..=255).contains(value))
    {
        fields.push(u8_field(mesgdef::Lap::MAX_HEART_RATE, max_hr as u8));
    }
    if let Some(gain) = total_elevation(workout, "elevation_gain_m", "elevation_gain_m") {
        if gain <= f64::from(u16::MAX) {
            fields.push(u16_field(mesgdef::Lap::TOTAL_ASCENT, gain.round() as u16));
        }
    }
    if let Some(loss) = total_elevation(workout, "elevation_loss_m", "elevation_loss_m") {
        if loss <= f64::from(u16::MAX) {
            fields.push(u16_field(mesgdef::Lap::TOTAL_DESCENT, loss.round() as u16));
        }
    }

    messages.push(Message {
        num: typedef::MesgNum::LAP,
        fields,
        ..Default::default()
    });
}

#[allow(clippy::too_many_arguments)]
fn push_session(
    messages: &mut Vec<Message>,
    workout: &Value,
    sport: typedef::Sport,
    sub_sport: typedef::SubSport,
    start_unix: i64,
    end_unix: i64,
    elapsed_seconds: f64,
    lap_count: u16,
    points: &[(i64, Point)],
) {
    let mut fields = vec![
        u16_field(mesgdef::Session::MESSAGE_INDEX, 0),
        u32_field(mesgdef::Session::TIMESTAMP, fit_timestamp(end_unix)),
        u32_field(mesgdef::Session::START_TIME, fit_timestamp(start_unix)),
        enum_field(mesgdef::Session::EVENT, typedef::Event::SESSION.0),
        enum_field(mesgdef::Session::EVENT_TYPE, typedef::EventType::STOP.0),
        enum_field(mesgdef::Session::SPORT, sport.0),
        enum_field(mesgdef::Session::SUB_SPORT, sub_sport.0),
        u32_field(
            mesgdef::Session::TOTAL_ELAPSED_TIME,
            (elapsed_seconds * 1000.0) as u32,
        ),
        u32_field(
            mesgdef::Session::TOTAL_TIMER_TIME,
            (elapsed_seconds * 1000.0) as u32,
        ),
        u16_field(mesgdef::Session::FIRST_LAP_INDEX, 0),
        u16_field(mesgdef::Session::NUM_LAPS, lap_count),
    ];

    // 起点坐标取第一个真有定位的点，而不是第一条 record——室内运动的第一条
    // record 根本没有坐标。
    if let Some((latitude, longitude)) = points
        .iter()
        .find_map(|(_, point)| Some((point.latitude?, point.longitude?)))
    {
        if let (Some(lat), Some(lon)) = (semicircles(latitude), semicircles(longitude)) {
            fields.push(i32_field(mesgdef::Session::START_POSITION_LAT, lat));
            fields.push(i32_field(mesgdef::Session::START_POSITION_LONG, lon));
        }
    }

    if let Some(distance) = workout.get("distance_meters").and_then(Value::as_f64) {
        if distance.is_finite() && distance >= 0.0 {
            fields.push(u32_field(
                mesgdef::Session::TOTAL_DISTANCE,
                (distance * 100.0) as u32,
            ));
            // 同 lap：距离 ÷ 时间，两个操作数都是刚写进这个文件的实测值。
            // 少了这一条，导入方的「平均速度 / 平均配速」整个是空的。
            if elapsed_seconds > 0.0 {
                if let Some(speed) = encode_speed(distance / elapsed_seconds) {
                    fields.push(u16_field(mesgdef::Session::AVG_SPEED, speed));
                }
            }
        }
    }
    if let Some(speed) = points
        .iter()
        .filter_map(|(_, point)| point.speed_mps)
        .filter(|value| value.is_finite() && *value >= 0.0)
        .fold(None, |best: Option<f64>, value| {
            Some(best.map_or(value, |best| best.max(value)))
        })
        .and_then(encode_speed)
    {
        fields.push(u16_field(mesgdef::Session::MAX_SPEED, speed));
    }
    // 累计爬升/下降：逐段实测值之和。之前只写在 lap 上，而导入方的总览读的是
    // session，于是「累计爬升」永远显示 0，哪怕分段里明明有 9.35 m。
    if let Some(gain) = total_elevation(workout, "elevation_gain_m", "elevation_gain_m") {
        if gain <= f64::from(u16::MAX) {
            fields.push(u16_field(
                mesgdef::Session::TOTAL_ASCENT,
                gain.round() as u16,
            ));
        }
    }
    if let Some(loss) = total_elevation(workout, "elevation_loss_m", "elevation_loss_m") {
        if loss <= f64::from(u16::MAX) {
            fields.push(u16_field(
                mesgdef::Session::TOTAL_DESCENT,
                loss.round() as u16,
            ));
        }
    }
    // 平均/最高步频，单位换算同 record。
    {
        let cadences: Vec<f64> = points
            .iter()
            .filter_map(|(_, point)| point.cadence_spm)
            .filter(|value| value.is_finite() && *value > 0.0)
            .collect();
        if !cadences.is_empty() {
            let mean = cadences.iter().sum::<f64>() / cadences.len() as f64;
            if let Some(value) = steps_per_minute_to_fit_cadence(mean, sport) {
                fields.push(u8_field(mesgdef::Session::AVG_CADENCE, value));
            }
            let peak = cadences.iter().cloned().fold(f64::MIN, f64::max);
            if let Some(value) = steps_per_minute_to_fit_cadence(peak, sport) {
                fields.push(u8_field(mesgdef::Session::MAX_CADENCE, value));
            }
        }
    }
    // 步数 -> TOTAL_CYCLES。
    //
    // 以前不写这个字段，导入方只能自己估：OPPO 健康拿 0.83 km 估出 1274 步，
    // 而云端汇总里明明写着真实步数。
    //
    // 除以二和 `steps_per_minute_to_fit_cadence` 同源：跑步/健走的一个 cycle
    // 是一整步（两次落脚）。这个方向被实测钉死过 —— OPPO 显示「最快步频 142
    // 步/分钟」，而文件里写的是 71 rpm。
    //
    // 只在走路类运动上写。骑行的一个 cycle 是曲柄转一圈，跟步数不是一回事，
    // 把步数塞进去只会得到一个假的踏频总数。
    if is_foot_sport(sport) {
        if let Some(cycles) = workout
            .get("total_steps")
            .and_then(Value::as_i64)
            .filter(|value| *value > 0)
            .map(|value| value / 2)
            .filter(|value| *value > 0 && *value <= i64::from(u32::MAX))
        {
            fields.push(u32_field(mesgdef::Session::TOTAL_CYCLES, cycles as u32));
        }
    }
    if let Some(calories) = workout
        .get("calories")
        .and_then(Value::as_f64)
        .filter(|value| value.is_finite() && *value >= 0.0 && *value <= f64::from(u16::MAX))
    {
        fields.push(u16_field(mesgdef::Session::TOTAL_CALORIES, calories as u16));
    }
    if let Some(avg_hr) = workout
        .get("avg_hr")
        .and_then(Value::as_i64)
        .filter(|value| (1..=255).contains(value))
    {
        fields.push(u8_field(mesgdef::Session::AVG_HEART_RATE, avg_hr as u8));
    }
    if let Some(max_hr) = workout
        .get("max_hr")
        .and_then(Value::as_i64)
        .filter(|value| (1..=255).contains(value))
    {
        fields.push(u8_field(mesgdef::Session::MAX_HEART_RATE, max_hr as u8));
    }

    // 下面这几样的数据一直躺在 `workouts` 和 `workout_hr_zones` 里，只是
    // 从来没被写进 FIT 文件。有人把我们导出的 .fit 和 Zepp 自己导出的逐
    // 字段对拍过（GitHub，2026-09-04）：数值上我们更准（Zepp 的 avg_speed
    // 和 total_strides 自相矛盾，我们的对得上），但「Zepp 那份带的东西更
    // 多：海拔、功率、跑步功率、步幅、心率区间时间分布、训练效果」。
    //
    // 每个字段的 scale / offset 都照 FIT profile 来，写在各自的注释里。
    // 这类编码错了不会报错，只会让读文件的人看到一个量级不对但仍然像样
    // 的数字。

    // 步幅。库里是厘米；FIT 的 `avg_step_length` 是 u16、单位毫米、scale 10,
    // 也就是说存进去的是「毫米的十倍」。109 cm -> 1090 mm -> 10900。
    if let Some(stride_cm) = workout
        .get("avg_stride_cm")
        .and_then(Value::as_f64)
        .filter(|value| value.is_finite() && *value > 0.0)
    {
        let encoded = stride_cm * 100.0;
        if encoded.is_finite() && encoded <= f64::from(u16::MAX) {
            fields.push(u16_field(
                mesgdef::Session::AVG_STEP_LENGTH,
                encoded.round() as u16,
            ));
        }
    }

    // 功率。逐条 record 一直在写 `power`，session 上却没有汇总，于是按会话
    // 读功率的平台会认为这次运动根本没有功率数据。单位就是瓦，没有 scale。
    let powers: Vec<f64> = points
        .iter()
        .filter_map(|(_, point)| point.power_watts)
        .filter(|value| value.is_finite() && *value >= 0.0)
        .collect();
    if !powers.is_empty() {
        let average = powers.iter().sum::<f64>() / powers.len() as f64;
        let peak = powers.iter().copied().fold(f64::MIN, f64::max);
        if average.is_finite() && average <= f64::from(u16::MAX) {
            fields.push(u16_field(
                mesgdef::Session::AVG_POWER,
                average.round() as u16,
            ));
        }
        if peak.is_finite() && peak <= f64::from(u16::MAX) {
            fields.push(u16_field(mesgdef::Session::MAX_POWER, peak.round() as u16));
        }
    }

    // 海拔。总爬升/总下降早就在写了，绝对高度没有——而「跑在多高的地方」
    // 和「爬了多少」不是同一个问题。编码沿用逐条 record 用的那个
    // `encode_altitude`（(米 + 500) x 5），不在这里另写一份：两份迟早会分叉，
    // 而分叉之后 session 和 record 的高度对不上，看文件的人只会以为数据坏了。
    // 最高/最低取云端汇总：它覆盖整段运动，包括没有逐秒采样的那部分。
    // 平均值汇总里没有，只能从采样算——不给的字段不去凭空补一个。
    for (key, field) in [
        ("max_altitude_m", mesgdef::Session::MAX_ALTITUDE),
        ("min_altitude_m", mesgdef::Session::MIN_ALTITUDE),
    ] {
        if let Some(encoded) = workout
            .get(key)
            .and_then(Value::as_f64)
            .filter(|value| value.is_finite())
            .and_then(encode_altitude)
        {
            fields.push(u16_field(field, encoded));
        }
    }
    let altitudes: Vec<f64> = points
        .iter()
        .filter_map(|(_, point)| point.altitude_m)
        .filter(|value| value.is_finite())
        .collect();
    if !altitudes.is_empty() {
        let average = altitudes.iter().sum::<f64>() / altitudes.len() as f64;
        if let Some(encoded) = encode_altitude(average) {
            fields.push(u16_field(mesgdef::Session::AVG_ALTITUDE, encoded));
        }
    }

    // 训练效果。u8，scale 10：3.4 存成 34。手表给的范围是 0.0-5.0。
    for (key, field) in [
        ("training_effect", mesgdef::Session::TOTAL_TRAINING_EFFECT),
        (
            "anaerobic_training_effect",
            mesgdef::Session::TOTAL_ANAEROBIC_TRAINING_EFFECT,
        ),
    ] {
        if let Some(effect) = workout
            .get(key)
            .and_then(Value::as_f64)
            .filter(|value| value.is_finite() && *value >= 0.0 && *value <= 5.0)
        {
            fields.push(u8_field(field, (effect * 10.0).round() as u8));
        }
    }

    if let Some(zones) = hr_zone_field(workout) {
        fields.push(u32_array_field(mesgdef::Session::TIME_IN_HR_ZONE, zones));
    }

    messages.push(Message {
        num: typedef::MesgNum::SESSION,
        fields,
        ..Default::default()
    });
}

/// 心率区间的停留时间，换成 FIT 的 `time_in_hr_zone` 数组。
///
/// 库里的 `hr_zones` 是 `{index, upper_bound_bpm, seconds}`，`index` 从 0 起，
/// 第 0 档就是「低于区间 1 下界」——和 FIT 数组的约定正好一致。即便如此也要
/// **按 `index` 落位**而不是按数组顺序平铺：少了任何一档，平铺都会让后面每一
/// 个数字往前串一个区间，而串完之后它们看上去仍然完全合理。
///
/// 字段是 `Vec<u32>`，scale 1000、单位秒，也就是说存进去的是毫秒。
/// 手表没有测到的区间留 0：那是「这次没有在这个区间待过」，不是缺数据。
fn hr_zone_field(workout: &Value) -> Option<Vec<u32>> {
    let zones = workout.get("hr_zones").and_then(Value::as_array)?;
    let mut buckets: Vec<u32> = Vec::new();
    let mut wrote_any = false;
    for zone in zones {
        let Some(index) = zone.get("index").and_then(Value::as_i64) else {
            continue;
        };
        let Some(seconds) = zone.get("seconds").and_then(Value::as_f64) else {
            continue;
        };
        // 上限 8 是给区间编号留的余量（手表用 1-5）。越界的索引宁可丢掉，
        // 也不要让一个坏编号把数组撑成几万个元素。
        if !(0..=8).contains(&index) || !seconds.is_finite() || seconds < 0.0 {
            continue;
        }
        let slot = index as usize;
        if buckets.len() <= slot {
            buckets.resize(slot + 1, 0);
        }
        let milliseconds = (seconds * 1000.0).round();
        if !milliseconds.is_finite() || milliseconds > f64::from(u32::MAX) {
            continue;
        }
        buckets[slot] = milliseconds as u32;
        wrote_any = true;
    }
    wrote_any.then_some(buckets)
}

/// `(暂停开始, 恢复)` 的秒级时间戳对，按开始时间排序。
fn pause_intervals(workout: &Value) -> Vec<(i64, i64)> {
    let mut intervals: Vec<(i64, i64)> = array(workout, "pauses")
        .iter()
        .filter_map(|pause| {
            let start = parse_unix(text(pause.get("start_time")))?;
            let end = parse_unix(text(pause.get("end_time")))?;
            Some((start, end))
        })
        .collect();
    intervals.sort_unstable();
    intervals
}

fn timer_event(unix: i64, event_type: typedef::EventType) -> Message {
    Message {
        num: typedef::MesgNum::EVENT,
        fields: vec![
            u32_field(mesgdef::Event::TIMESTAMP, fit_timestamp(unix)),
            enum_field(mesgdef::Event::EVENT, typedef::Event::TIMER.0),
            enum_field(mesgdef::Event::EVENT_TYPE, event_type.0),
        ],
        ..Default::default()
    }
}

/// 运动类型 → FIT 的 `sport` / `sub_sport`。
///
/// 只映射 FIT 里确实有对应项的那些。认不出来的一律落到 `GENERIC`，而不是
/// 硬塞一个近似的运动——一次太极被记成「跑步」，比记成「通用运动」更糟。
fn map_sport(key: &str) -> (typedef::Sport, typedef::SubSport) {
    use typedef::{Sport, SubSport};
    match key {
        "run" => (Sport::RUNNING, SubSport::STREET),
        "trail_running" => (Sport::RUNNING, SubSport::TRAIL),
        "treadmill" => (Sport::RUNNING, SubSport::TREADMILL),
        "race_walking" => (Sport::WALKING, SubSport::SPEED_WALKING),
        "walking" => (Sport::WALKING, SubSport::GENERIC),
        "indoor_walking" => (Sport::WALKING, SubSport::INDOOR_WALKING),
        "hiking" => (Sport::HIKING, SubSport::GENERIC),
        "ride" => (Sport::CYCLING, SubSport::GENERIC),
        "road_cycling" => (Sport::CYCLING, SubSport::ROAD),
        "indoor_cycling" => (Sport::CYCLING, SubSport::INDOOR_CYCLING),
        "spinning" => (Sport::CYCLING, SubSport::SPIN),
        "bmx" => (Sport::CYCLING, SubSport::BMX),
        "e_bike" => (Sport::E_BIKING, SubSport::GENERIC),
        "pool_swimming" => (Sport::SWIMMING, SubSport::LAP_SWIMMING),
        "open_water_swimming" => (Sport::SWIMMING, SubSport::OPEN_WATER),
        "finswimming" | "artistic_swimming" => (Sport::SWIMMING, SubSport::GENERIC),
        "snorkeling" => (Sport::SNORKELING, SubSport::GENERIC),
        "rowing" | "water_rowing" => (Sport::ROWING, SubSport::GENERIC),
        "kayaking" => (Sport::KAYAKING, SubSport::GENERIC),
        "sailing" => (Sport::SAILING, SubSport::GENERIC),
        "strength" => (Sport::TRAINING, SubSport::STRENGTH_TRAINING),
        "core_training" | "cross_training" | "free_training" | "indoor_fitness" => {
            (Sport::TRAINING, SubSport::CARDIO_TRAINING)
        }
        "flexibility" | "stretching" => (Sport::TRAINING, SubSport::FLEXIBILITY_TRAINING),
        "yoga" => (Sport::TRAINING, SubSport::YOGA),
        "pilates" => (Sport::TRAINING, SubSport::PILATES),
        "hiit" => (Sport::HIIT, SubSport::GENERIC),
        "jump_rope" => (Sport::JUMP_ROPE, SubSport::GENERIC),
        "stair_climber" => (Sport::FITNESS_EQUIPMENT, SubSport::STAIR_CLIMBING),
        "stepper" | "air_walker" => (Sport::FITNESS_EQUIPMENT, SubSport::ELLIPTICAL),
        "rock_climbing" | "bouldering" => (Sport::ROCK_CLIMBING, SubSport::GENERIC),
        "boxing" => (Sport::BOXING, SubSport::GENERIC),
        "kickboxing" | "muay_thai" | "martial_arts" | "judo" | "jujitsu" | "karate"
        | "taekwondo" | "kendo" | "wrestling" => (Sport::MIXED_MARTIAL_ARTS, SubSport::GENERIC),
        "tennis" => (Sport::TENNIS, SubSport::GENERIC),
        "badminton" | "squash" | "table_tennis" | "racket" => (Sport::RACKET, SubSport::GENERIC),
        "basketball" => (Sport::BASKETBALL, SubSport::GENERIC),
        "soccer" | "futsal" => (Sport::SOCCER, SubSport::GENERIC),
        "american_football" => (Sport::AMERICAN_FOOTBALL, SubSport::GENERIC),
        "volleyball" | "beach_volleyball" => (Sport::VOLLEYBALL, SubSport::GENERIC),
        "baseball" | "softball" => (Sport::BASEBALL, SubSport::GENERIC),
        "cricket" => (Sport::CRICKET, SubSport::GENERIC),
        "ice_hockey" | "floorball" => (Sport::HOCKEY, SubSport::GENERIC),
        "handball" => (Sport::TEAM_SPORT, SubSport::GENERIC),
        "golf" => (Sport::GOLF, SubSport::GENERIC),
        "archery" => (Sport::ARCHERY, SubSport::GENERIC),
        "horse_riding" => (Sport::HORSEBACK_RIDING, SubSport::GENERIC),
        "ice_skating" | "indoor_ice_skating" => (Sport::ICE_SKATING, SubSport::GENERIC),
        "roller_skating" => (Sport::INLINE_SKATING, SubSport::GENERIC),
        "skateboarding" => (Sport::WINTER_SPORT, SubSport::GENERIC),
        "dance" | "ballet" | "ballroom_dance" | "belly_dance" | "breaking" | "folk_dance"
        | "hip_hop" | "jazz_dance" | "latin_dance" | "modern_dance" | "pole_dance"
        | "square_dance" | "street_dance" | "zumba" => (Sport::DANCE, SubSport::GENERIC),
        "esports" | "somatosensory_game" => (Sport::VIDEO_GAMING, SubSport::GENERIC),
        "fishing" => (Sport::FISHING, SubSport::GENERIC),
        "driving" => (Sport::DRIVING, SubSport::GENERIC),
        "tai_chi" => (Sport::MEDITATION, SubSport::GENERIC),
        _ => (Sport::GENERIC, SubSport::GENERIC),
    }
}

/// 文件名带上运动类型和开始时间，好让一次批量导出出来就是排好序的。
fn file_name_for(workout: &Value) -> String {
    let workout_type = text(
        workout
            .get("effective_type")
            .or_else(|| workout.get("workout_type")),
    );
    let kind = if workout_type.is_empty() {
        "workout"
    } else {
        workout_type
    };
    let stamp = parse_time(text(workout.get("start_time")))
        .map(|time| time.format("%Y%m%d-%H%M%S").to_string())
        .unwrap_or_else(|| "unknown-time".to_string());
    let safe: String = kind
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect();
    format!("{stamp}-{safe}.fit")
}

fn fit_timestamp(unix: i64) -> u32 {
    (unix - FIT_EPOCH_OFFSET).clamp(0, i64::from(u32::MAX)) as u32
}

/// 把「步/分钟」换成 FIT 的 `cadence`。
///
/// # 单位是查出来的，不是猜的
///
/// `samples[].cadence` 来自 Zepp `gait` 的第四个分量。它到底是步/分还是
/// 每分钟转数，可以直接和这条运动自己的云端汇总对账——那些字段在原始报文里，
/// 只是解析器没有把它们取出来，所以之前误以为「无从对账」：
///
/// | 汇总字段（walk trackid 1787901817） | 我们的序列 |
/// |---|---|
/// | `max_frequency` = 141 | 序列最大值 141.0 |
/// | `avg_frequency` = 99.0 | 序列均值 100.6 |
/// | `avg_stride_length` = 70 cm | 按步/分推出的步幅 0.70 m |
/// | `total_step` = 8998 | 按步/分推出的步数 ≈ 9060 |
///
/// 按「每分钟转数」解释则步幅 0.35 m、步数 18121，整整差两倍。所以这个序列
/// 的单位是**步/分钟**。同一条骑行的 `avg_frequency` 是 0.0，和我们那条全零
/// 的序列也对得上。
///
/// # 写进 FIT 时要不要除以二
///
/// FIT 的 `cadence` 单位是 rpm，也就是「每分钟多少个完整周期」。对跑步和
/// 步行来说一个周期是一整步（two footfalls），所以规范里的值是
/// 步/分 ÷ 2，读取方再乘回二显示——Garmin 的跑步手表写出来的 FIT 就是
/// 80-95 这个量级，而不是 160-190。骑行的一个周期是曲柄转一圈，本身就是
/// rpm，不能除。
///
/// 除错了会稳定差两倍且看不出来，所以按运动类型分开处理，而不是一律照搬。
/// 米/秒 → FIT 的速度编码（scale 1000，u16）。超出量程就不写，不截断。
fn encode_speed(mps: f64) -> Option<u16> {
    if !mps.is_finite() || mps < 0.0 {
        return None;
    }
    let scaled = (mps * 1000.0).round();
    if scaled > f64::from(u16::MAX) {
        return None;
    }
    Some(scaled as u16)
}

/// `[start, end]` 这段时间里实测到的最大速度。没有采样就返回 `None`。
fn max_speed_between(points: &[(i64, Point)], start: i64, end: i64) -> Option<f64> {
    points
        .iter()
        .filter(|(unix, _)| *unix >= start && *unix <= end)
        .filter_map(|(_, point)| point.speed_mps)
        .filter(|value| value.is_finite() && *value >= 0.0)
        .fold(None, |best: Option<f64>, value| {
            Some(best.map_or(value, |best| best.max(value)))
        })
}

/// 累计爬升 / 下降。
///
/// 优先用云端自己的 `elevation_gain_m` / `elevation_loss_m`：那是用户在
/// Zepp App 里看到的数字，导出跟它一致才不会被当成 bug 报上来。云端没给时才
/// 回退到把 `splits` 里逐段的爬升加起来——那是解析器从海拔序列按 1 米噪声底
/// 切出来的实测值（见 `decoder/workout_detail.rs` 的 `ELEVATION_NOISE_FLOOR_M`）。
///
/// 两者会有出入：实测一次 6.37 km 健走，云端 59 m，分段之和 37 m。都不算错，
/// 但只能有一个出现在导出里。
///
/// 云端汇总里那个 `distance_ascend` 是「爬升过程中走过的水平距离」，不是爬升
/// 高度，不能拿来充数。
fn total_elevation(workout: &Value, summary_key: &str, split_key: &str) -> Option<f64> {
    if let Some(value) = workout
        .get(summary_key)
        .and_then(Value::as_f64)
        .filter(|value| value.is_finite() && *value >= 0.0)
    {
        return Some(value);
    }
    let mut total = 0.0;
    let mut seen = false;
    for split in array(workout, "splits") {
        if let Some(value) = split.get(split_key).and_then(Value::as_f64) {
            if value.is_finite() && value >= 0.0 {
                total += value;
                seen = true;
            }
        }
    }
    seen.then_some(total)
}

fn steps_per_minute_to_fit_cadence(value: f64, sport: typedef::Sport) -> Option<u8> {
    if !value.is_finite() || value <= 0.0 {
        return None;
    }
    let cycles_per_minute = if is_foot_sport(sport) {
        value / 2.0
    } else {
        value
    };
    let rounded = cycles_per_minute.round();
    if rounded < 1.0 || rounded > f64::from(u8::MAX) {
        return None;
    }
    Some(rounded as u8)
}

/// 一个周期等于一整步的运动。见 `steps_per_minute_to_fit_cadence`。
fn is_foot_sport(sport: typedef::Sport) -> bool {
    matches!(
        sport.0,
        value if value == typedef::Sport::RUNNING.0
            || value == typedef::Sport::WALKING.0
            || value == typedef::Sport::HIKING.0
    )
}

fn semicircles(degrees: f64) -> Option<i32> {
    if !degrees.is_finite() || degrees.abs() > 180.0 {
        return None;
    }
    // 经度正好 180.0°（换日线）时 `180 × 2^31/180` 恰好是 2^31，比 i32::MAX
    // 大 1。之前这里返回 None，于是那个点的经纬度字段被整个跳过——一个真实
    // 存在的坐标因为差一个最低位就消失了。饱和截断的误差是 2^-31 个半圆，
    // 约 8×10^-8 度，比 GPS 本身的精度小三个数量级。
    let scaled = (degrees * SEMICIRCLES_PER_DEGREE).round();
    Some(scaled.clamp(f64::from(i32::MIN), f64::from(i32::MAX)) as i32)
}

/// 这条运动所在时区相对 UTC 的偏移秒数。
///
/// 导出 JSON 的 `start_time` 是带偏移量的 RFC3339，手表当时在哪个时区就写着
/// 哪个，所以不用猜。解析不出来就返回 `None`——调用方据此不写本地时间戳，而
/// 不是假设 UTC。
fn local_offset_seconds(workout: &Value) -> Option<i32> {
    parse_time(text(workout.get("start_time"))).map(|time| time.offset().local_minus_utc())
}

fn encode_altitude(metres: f64) -> Option<u16> {
    if !metres.is_finite() {
        return None;
    }
    let scaled = ((metres + ALTITUDE_OFFSET_M) * ALTITUDE_SCALE).round();
    if scaled < 0.0 || scaled > f64::from(u16::MAX) {
        return None;
    }
    Some(scaled as u16)
}

fn parse_unix(value: &str) -> Option<i64> {
    parse_time(value).map(|time| time.timestamp())
}

fn parse_time(value: &str) -> Option<DateTime<FixedOffset>> {
    DateTime::parse_from_rfc3339(value).ok()
}

fn array<'a>(parent: &'a Value, key: &str) -> &'a [Value] {
    parent
        .get(key)
        .and_then(Value::as_array)
        .map(Vec::as_slice)
        .unwrap_or(&[])
}

fn text(value: Option<&Value>) -> &str {
    value.and_then(Value::as_str).unwrap_or("")
}

fn enum_field(num: u8, value: u8) -> Field {
    Field {
        num,
        base_type: typedef::FitBaseType::ENUM,
        value: FitValue::Uint8(value),
        is_expanded: false,
    }
}

fn u8_field(num: u8, value: u8) -> Field {
    Field {
        num,
        base_type: typedef::FitBaseType::UINT8,
        value: FitValue::Uint8(value),
        is_expanded: false,
    }
}

fn u16_field(num: u8, value: u16) -> Field {
    Field {
        num,
        base_type: typedef::FitBaseType::UINT16,
        value: FitValue::Uint16(value),
        is_expanded: false,
    }
}

fn u32_field(num: u8, value: u32) -> Field {
    Field {
        num,
        base_type: typedef::FitBaseType::UINT32,
        value: FitValue::Uint32(value),
        is_expanded: false,
    }
}

fn i32_field(num: u8, value: i32) -> Field {
    Field {
        num,
        base_type: typedef::FitBaseType::SINT32,
        value: FitValue::Int32(value),
        is_expanded: false,
    }
}

/// 一个 `u32` 数组字段。
///
/// `time_in_hr_zone` 是这份导出里唯一的数组字段：每个心率区间一个元素。
/// 别的字段都是标量，所以这个构造器只有它一个用户——但少了它，区间时间
/// 分布就只能拆成几个自造的字段名，那样没有任何平台读得出来。
fn u32_array_field(num: u8, values: Vec<u32>) -> Field {
    Field {
        num,
        base_type: typedef::FitBaseType::UINT32,
        value: FitValue::VecUint32(values),
        is_expanded: false,
    }
}

fn string_field(num: u8, value: &str) -> Field {
    Field {
        num,
        base_type: typedef::FitBaseType::STRING,
        value: FitValue::String(value.to_string()),
        is_expanded: false,
    }
}

#[cfg(test)]
mod tests {
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
}
