//! 圈、整段活动圈与 session 消息（从 export_fit.rs 拆出，逻辑不变）。

use super::*;

/// 这组 `lap` 从导出 JSON 的哪个数组来，以及该报成什么触发方式。
#[derive(Debug, Clone, Copy)]
pub(super) struct LapSource {
    pub(super) field: &'static str,
    pub(super) trigger: typedef::LapTrigger,
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
pub(super) fn push_laps(
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
        let moving_seconds = (duration - paused_seconds(workout, start, end)).max(0.0);

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
                (moving_seconds * 1000.0) as u32,
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
            moving_seconds > 0.0,
        ) {
            if let Some(speed) = encode_speed(distance / moving_seconds) {
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
pub(super) fn push_whole_activity_lap(
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
    let moving_seconds = timer_seconds(workout, start_unix, end_unix);
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
        u32_field(
            mesgdef::Lap::TOTAL_TIMER_TIME,
            (moving_seconds * 1000.0) as u32,
        ),
    ];

    // 起点坐标同 session：取第一个真有定位的点，室内运动本来就没有。
    if let Some((latitude, longitude)) = points.iter().find_map(|(_, point)| {
        let latitude = point.latitude?;
        let longitude = point.longitude?;
        coordinates_in_domain(latitude, longitude).then_some((latitude, longitude))
    }) {
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
        if moving_seconds > 0.0 {
            if let Some(speed) = encode_speed(distance / moving_seconds) {
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
pub(super) fn push_session(
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
    let moving_seconds = timer_seconds(workout, start_unix, end_unix);
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
            (moving_seconds * 1000.0) as u32,
        ),
        u16_field(mesgdef::Session::FIRST_LAP_INDEX, 0),
        u16_field(mesgdef::Session::NUM_LAPS, lap_count),
    ];

    // 起点坐标取第一个真有定位的点，而不是第一条 record——室内运动的第一条
    // record 根本没有坐标。
    if let Some((latitude, longitude)) = points.iter().find_map(|(_, point)| {
        let latitude = point.latitude?;
        let longitude = point.longitude?;
        coordinates_in_domain(latitude, longitude).then_some((latitude, longitude))
    }) {
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
            if moving_seconds > 0.0 {
                if let Some(speed) = encode_speed(distance / moving_seconds) {
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
