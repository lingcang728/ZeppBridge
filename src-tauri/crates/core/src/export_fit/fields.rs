//! 字段编码与换算：心率区间、暂停、运动类型映射、时间与坐标（从 export_fit.rs 拆出，逻辑不变）。

use super::*;

/// 心率区间的停留时间，换成 FIT 的 `time_in_hr_zone` 数组。
///
/// 库里的 `hr_zones` 是 `{index, upper_bound_bpm, seconds}`，`index` 从 0 起，
/// 第 0 档就是「低于区间 1 下界」——和 FIT 数组的约定正好一致。即便如此也要
/// **按 `index` 落位**而不是按数组顺序平铺：少了任何一档，平铺都会让后面每一
/// 个数字往前串一个区间，而串完之后它们看上去仍然完全合理。
///
/// 字段是 `Vec<u32>`，scale 1000、单位秒，也就是说存进去的是毫秒。
/// 手表没有测到的区间留 0：那是「这次没有在这个区间待过」，不是缺数据。
pub(super) fn hr_zone_field(workout: &Value) -> Option<Vec<u32>> {
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
pub(super) fn pause_intervals(workout: &Value, from: i64, to: i64) -> Vec<(i64, i64)> {
    let mut intervals: Vec<(i64, i64)> = array(workout, "pauses")
        .iter()
        .filter_map(|pause| {
            let start = parse_unix(text(pause.get("start_time")))?;
            let end = parse_unix(text(pause.get("end_time")))?;
            let start = start.max(from);
            let end = end.min(to);
            (end > start).then_some((start, end))
        })
        .collect();
    intervals.sort_unstable();
    let mut merged: Vec<(i64, i64)> = Vec::new();
    for (start, end) in intervals {
        if let Some(last) = merged.last_mut().filter(|last| start <= last.1) {
            last.1 = last.1.max(end);
        } else {
            merged.push((start, end));
        }
    }
    merged
}

pub(super) fn paused_seconds(workout: &Value, start: i64, end: i64) -> f64 {
    pause_intervals(workout, start, end)
        .iter()
        .map(|(from, to)| (to - from) as f64)
        .sum()
}

pub(super) fn timer_seconds(workout: &Value, start: i64, end: i64) -> f64 {
    let elapsed = (end - start).max(0) as f64;
    workout
        .get("moving_seconds")
        .and_then(Value::as_f64)
        .filter(|seconds| seconds.is_finite() && *seconds >= 0.0 && *seconds <= elapsed)
        .unwrap_or_else(|| (elapsed - paused_seconds(workout, start, end)).max(0.0))
}

pub(super) fn timer_event(unix: i64, event_type: typedef::EventType) -> Message {
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
pub(super) fn map_sport(key: &str) -> (typedef::Sport, typedef::SubSport) {
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
pub(super) fn file_name_for(workout: &Value) -> String {
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

pub(super) fn fit_timestamp(unix: i64) -> u32 {
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
pub(super) fn encode_speed(mps: f64) -> Option<u16> {
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
pub(super) fn max_speed_between(points: &[(i64, Point)], start: i64, end: i64) -> Option<f64> {
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
pub(super) fn total_elevation(workout: &Value, summary_key: &str, split_key: &str) -> Option<f64> {
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

pub(super) fn steps_per_minute_to_fit_cadence(value: f64, sport: typedef::Sport) -> Option<u8> {
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
pub(super) fn is_foot_sport(sport: typedef::Sport) -> bool {
    matches!(
        sport.0,
        value if value == typedef::Sport::RUNNING.0
            || value == typedef::Sport::WALKING.0
            || value == typedef::Sport::HIKING.0
    )
}

/// 坐标域：纬 ±90、经 ±180，且两个都得是有限值。
/// 这是导出的最后一道边界，独立于解码侧的截断——从这里进来的数据可能
/// 直接来自构造的导出输入，不经过解码器。
pub(super) fn coordinates_in_domain(latitude: f64, longitude: f64) -> bool {
    latitude.is_finite()
        && longitude.is_finite()
        && latitude.abs() <= 90.0
        && longitude.abs() <= 180.0
}

pub(super) fn semicircles(degrees: f64) -> Option<i32> {
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
/// 入库后的 UTC 时间已丢失原始时区；零偏移和解析失败都返回 `None`。
/// 非零 RFC3339 偏移仍可保留，调用方在未知时省略本地时间戳。
pub(super) fn local_offset_seconds(workout: &Value) -> Option<i32> {
    parse_time(text(workout.get("start_time")))
        .map(|time| time.offset().local_minus_utc())
        .filter(|offset| *offset != 0)
}

pub(super) fn encode_altitude(metres: f64) -> Option<u16> {
    if !metres.is_finite() {
        return None;
    }
    let scaled = ((metres + ALTITUDE_OFFSET_M) * ALTITUDE_SCALE).round();
    if scaled < 0.0 || scaled > f64::from(u16::MAX) {
        return None;
    }
    Some(scaled as u16)
}

pub(super) fn parse_unix(value: &str) -> Option<i64> {
    parse_time(value).map(|time| time.timestamp())
}

pub(super) fn parse_time(value: &str) -> Option<DateTime<FixedOffset>> {
    DateTime::parse_from_rfc3339(value).ok()
}

pub(super) fn array<'a>(parent: &'a Value, key: &str) -> &'a [Value] {
    parent
        .get(key)
        .and_then(Value::as_array)
        .map(Vec::as_slice)
        .unwrap_or(&[])
}

pub(super) fn text(value: Option<&Value>) -> &str {
    value.and_then(Value::as_str).unwrap_or("")
}

pub(super) fn enum_field(num: u8, value: u8) -> Field {
    Field {
        num,
        base_type: typedef::FitBaseType::ENUM,
        value: FitValue::Uint8(value),
        is_expanded: false,
    }
}

pub(super) fn u8_field(num: u8, value: u8) -> Field {
    Field {
        num,
        base_type: typedef::FitBaseType::UINT8,
        value: FitValue::Uint8(value),
        is_expanded: false,
    }
}

pub(super) fn u16_field(num: u8, value: u16) -> Field {
    Field {
        num,
        base_type: typedef::FitBaseType::UINT16,
        value: FitValue::Uint16(value),
        is_expanded: false,
    }
}

pub(super) fn u32_field(num: u8, value: u32) -> Field {
    Field {
        num,
        base_type: typedef::FitBaseType::UINT32,
        value: FitValue::Uint32(value),
        is_expanded: false,
    }
}

pub(super) fn i32_field(num: u8, value: i32) -> Field {
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
pub(super) fn u32_array_field(num: u8, values: Vec<u32>) -> Field {
    Field {
        num,
        base_type: typedef::FitBaseType::UINT32,
        value: FitValue::VecUint32(values),
        is_expanded: false,
    }
}

pub(super) fn string_field(num: u8, value: &str) -> Field {
    Field {
        num,
        base_type: typedef::FitBaseType::STRING,
        value: FitValue::String(value.to_string()),
        is_expanded: false,
    }
}
