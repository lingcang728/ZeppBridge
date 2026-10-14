use crate::models::error::*;

use chrono::{DateTime, TimeZone, Utc};

use serde::{Deserialize, Serialize};

use serde_json::Value;

mod parse;
mod splits;

use parse::*;
use splits::*;

const COORD_FACTOR: f64 = 100_000_000.0;

/// Zepp marks "no altitude fix" with a large negative sentinel, but real
/// payloads do not use one constant: observed leading values include
/// -2000000, -2002110 and -2003943. An equality test against -2000000 lets the
/// variants through and they land as ~-20000 m samples, so the guard is a
/// plausibility window instead. Bounds are deliberately generous (-1000 m ..
/// 10000 m) so genuine terrain is never discarded.
const MIN_PLAUSIBLE_ALTITUDE_CM: i64 = -100_000;

const MAX_PLAUSIBLE_ALTITUDE_CM: i64 = 1_000_000;

/// 单条运动解码时接受的最长时长。
///
/// 这是一道防御性上限，挡的是报文里坏掉的时间戳把 `from..to` 撑成一个荒谬的
/// 区间；它不该同时把真实的长距离运动砍掉。原来的 12 小时正好卡在真人会做的
/// 事情中间：百公里越野、大铁、24 小时耐力赛、长途骑行普遍是 12~36 小时，
/// 超过 12 小时的那一段轨迹点和逐秒采样会被整段丢掉——而导出看起来是成功的。
///
/// 48 小时仍然远小于任何一种坏时间戳会产生的量级（毫秒当秒读会得到几万年），
/// 所以放宽之后这道防线照样有效。
const MAX_ACTIVITY_SECONDS: i64 = 48 * 60 * 60;

fn add_seconds(base: DateTime<Utc>, seconds: i64) -> Option<DateTime<Utc>> {
    chrono::Duration::try_seconds(seconds).and_then(|delta| base.checked_add_signed(delta))
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct RoutePoint {
    pub timestamp: DateTime<Utc>,
    pub latitude: f64,
    pub longitude: f64,
    pub altitude_m: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct WorkoutSample {
    pub timestamp: DateTime<Utc>,
    pub heart_rate: Option<i32>,
    pub speed: Option<f64>,
    pub pace: Option<f64>,
    pub cadence: Option<f64>,
    pub stride_cm: Option<f64>,
    pub altitude_m: Option<f64>,
    /// Running power in watts, from `power_meter`.
    ///
    /// Verified against the workout summary rather than assumed: the mean of
    /// this series is 249.3 W where the summary reports `average_power` 249.0,
    /// and its maximum is 326 W against `max_power` 326.0 (second workout:
    /// 231.5 / 231.0 and 303 / 303).
    pub power_watts: Option<f64>,
    /// Ground contact time in milliseconds, `runPosture` field 1.
    ///
    /// Its mean is 263.5 ms against the summary's `averageGct` 263, and its
    /// minimum 232 ms against `minGct` 232. 65535 is the "not measured"
    /// sentinel and never reaches storage.
    pub ground_contact_ms: Option<f64>,
    /// Vertical oscillation in millimetres, `runPosture` field 2.
    ///
    /// Mean 88.3 against the summary's `averageVo` 88 and maximum 95 against
    /// `maxVo` 95. Millimetres rather than centimetres because field 3 equals
    /// this divided by the stride length in the same units (88 / 1010 = 8.7%).
    pub vertical_oscillation_mm: Option<f64>,
    /// Vertical stride ratio in percent, `runPosture` field 3.
    ///
    /// Stored as a percentage: the raw integers are tenths of a percent and
    /// their mean, 87.1, matches the summary's `avgVertStrideRatio` 87.
    /// The 255 sentinel never reaches storage.
    pub vertical_ratio_pct: Option<f64>,
    /// Grade-adjusted equivalent pace in seconds per kilometre, `equivPace`.
    ///
    /// Not the reciprocal of `speed` — comparing the two disagrees on a third
    /// of the samples. What does line up is the summary: the series minimum,
    /// 264 s/km, is `bestEquivPace` 264, and the distance-weighted mean
    /// (5428.6 s over `equivDistance` 15257 m = 355.8) is `avgEquivPace` 355.
    pub equivalent_pace_s_per_km: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PauseInterval {
    pub start_time: DateTime<Utc>,
    pub end_time: DateTime<Utc>,
    pub kind: String,
}

/// One kilometre of a workout, measured rather than estimated.
///
/// Splits come from the server's own cumulative distance series. Integrating
/// the per-second speed instead lands within 0.15% on a run but 12.6% out on a
/// ride, so the speed series is not a substitute.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct WorkoutSplit {
    /// 1-based kilometre number.
    pub index: i32,
    pub start_time: DateTime<Utc>,
    pub end_time: DateTime<Utc>,
    pub distance_m: f64,
    pub duration_seconds: i64,
    /// Minutes per kilometre; `None` when the split covered no distance.
    pub pace_min_per_km: Option<f64>,
    pub avg_hr: Option<i32>,
    pub max_hr: Option<i32>,
    pub elevation_gain_m: Option<f64>,
    pub elevation_loss_m: Option<f64>,
    /// True for a trailing partial kilometre, so an 800 m remainder is never
    /// read as a slow full kilometre.
    pub partial: bool,
}

/// One lap the watch itself recorded.
///
/// Not a [`WorkoutSplit`]. A split is our own cut at every kilometre; a lap is
/// what the watch marked at the time — the lap button, an auto-lap by distance,
/// or the intervals of a structured session. A 5820 m run can carry five
/// kilometre splits *and* fourteen 415 m laps, and they mean different things.
///
/// Read from the `lap` field of the workout detail, which is populated on 32 of
/// the 336 stored details in a real library. A .fit comparison on GitHub asked
/// for exactly this: "I use the lap button often, if you could add lap data to
/// your .fit file that would be my first choice."
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct WorkoutLap {
    /// 1-based lap number.
    pub index: i32,
    pub start_time: DateTime<Utc>,
    pub end_time: DateTime<Utc>,
    pub distance_m: f64,
    pub duration_seconds: i64,
    pub avg_hr: Option<i32>,
    pub max_hr: Option<i32>,
}

/// Altitude has to move by at least this much before it counts as climbing.
/// Barometric drift of a few centimetres per second would otherwise accumulate
/// into hundreds of metres of imaginary ascent over an hour.
const ELEVATION_NOISE_FLOOR_M: f64 = 1.0;

#[derive(Debug, Clone, Default, PartialEq)]
pub struct DecodedWorkout {
    pub track_id: i64,
    pub source: Option<String>,
    pub start_time: DateTime<Utc>,
    pub end_time: DateTime<Utc>,
    pub route: Vec<RoutePoint>,
    /// 轨迹在差分链上断掉时被丢掉的后续点数，0 表示完整。
    ///
    /// 坐标是累积差分：某一段增量读不懂、累加溢出、或结果跑出地球表面之后，
    /// 后面所有点的位置都不可知。继续往下走只会得到一条形状正常但整体平移
    /// 的假轨迹，所以从那里截断，把没能输出的点数记在这里。
    pub route_dropped_points: usize,
    pub samples: Vec<WorkoutSample>,
    pub pauses: Vec<PauseInterval>,
    pub splits: Vec<WorkoutSplit>,
    /// 手表自己记的圈。和 `splits` 并存，不互相替代——见 [`WorkoutLap`]。
    pub laps: Vec<WorkoutLap>,
}

/// 解码一条运动明细。
///
/// `summary_end` 是汇总里的结束时刻，`summary_distance_m` 是汇总里的总距离。
/// 后者只在走 `kilo_pace` 兜底那条路时用得上：那份数据只给整公里，最后那截
/// 零头的长度只能从汇总来，缺了它一次 4975 m 的跑步会只报出 4 公里，另外
/// 975 m 无声消失。两个都是 `Option`，因为室内运动可能两样都没有。
pub fn decode_workout_detail(
    raw: &Value,
    summary_end: Option<DateTime<Utc>>,
    summary_distance_m: Option<f64>,
) -> Result<DecodedWorkout> {
    let data = detail_object(raw)
        .ok_or_else(|| ZeppBridgeError::ParseError("workout detail 缺少 data 对象".into()))?;

    let track_id = parse_i64(data.get("trackid"))
        .ok_or_else(|| ZeppBridgeError::ParseError("workout detail 缺少 trackid".into()))?;
    if track_id <= 0 {
        return Err(ZeppBridgeError::ParseError(
            "workout detail trackid 无效".into(),
        ));
    }

    let start_time = Utc
        .timestamp_opt(track_id, 0)
        .single()
        .ok_or_else(|| ZeppBridgeError::ParseError("workout detail trackid 不是合法时间".into()))?;

    let source = data
        .get("source")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned);

    let time_deltas = parse_int_list(data.get("time"));
    // 只累加到第一个读不懂的 delta 之前：那之后的时间戳全都不可知，
    // 把它们的秒数加进总时长一样是编数据。
    let time_sum = time_deltas
        .iter()
        .take_while(|value| value.is_some())
        .map(|value| i64::from(value.unwrap_or_default().max(0)))
        .fold(0i64, |acc, value| acc.saturating_add(value))
        .clamp(0, MAX_ACTIVITY_SECONDS);
    let time_end = add_seconds(start_time, time_sum)
        .ok_or_else(|| ZeppBridgeError::ParseError("workout detail 时长溢出".into()))?;
    let min_end = add_seconds(start_time, 1)
        .ok_or_else(|| ZeppBridgeError::ParseError("workout detail 时长溢出".into()))?;
    let uncapped_end = match summary_end {
        Some(summary) if summary > time_end => summary,
        _ => time_end.max(min_end),
    };
    // 汇总结束时刻可能远在 start 之后；后面还有 DateTime 相减，必须先夹到 48h。
    let end_time = match add_seconds(start_time, MAX_ACTIVITY_SECONDS) {
        Some(cap) => uncapped_end.min(cap).max(min_end),
        None => time_end.max(min_end),
    };

    let duration_secs = end_time
        .timestamp()
        .saturating_sub(start_time.timestamp())
        .clamp(1, MAX_ACTIVITY_SECONDS);
    let from = track_id;
    let to = track_id
        .checked_add(duration_secs)
        .ok_or_else(|| ZeppBridgeError::ParseError("workout detail 结束时刻溢出".into()))?;

    let (latitudes, longitudes) = parse_coordinate_deltas(data.get("longitude_latitude"));
    let altitudes_cm = parse_altitude_cm(data.get("altitude"));
    // `time_delta_altitude` carries its own `(dt, altitude_cm)` cursor, so it
    // is not tied to GPS fixes and, unlike `altitude`, carries no leading
    // sentinel. Prefer it and keep the index-aligned list as the fallback.
    let altitude_pairs = parse_delta_pairs(data.get("time_delta_altitude"), true);
    // `currentDistance` is `(dt, cumulative centimetres)`. Verified against a
    // 15 km run: its final value, 1521722 cm, matches the summary's 15217 m.
    let distance_pairs = parse_delta_pairs(data.get("currentDistance"), true);
    let hr_pairs = parse_delta_pairs(data.get("heart_rate"), true);
    let speed_pairs = parse_float_pairs(data.get("speed"));
    let gait = parse_gait(data.get("gait"));
    // Running power and equivalent pace carry the same `(dt, value)` shape as
    // speed, but a leading empty delta appears in real payloads, so they use
    // the lenient reader rather than dropping the sample.
    let power_pairs = parse_valued_pairs(data.get("power_meter"));
    let equiv_pace_pairs = parse_valued_pairs(data.get("equivPace"));
    let posture = parse_run_posture(data.get("runPosture"));
    let pauses = parse_pauses(data.get("pause"));

    let heart_rates = if hr_pairs.is_empty() {
        None
    } else {
        Some(timed_cumulative_i32(from, to, &hr_pairs))
    };
    let speeds = if speed_pairs.is_empty() {
        None
    } else {
        Some(timed_fixed_f64(from, to, &speed_pairs))
    };
    let (steps, strides, cadences) = if gait.is_empty() {
        (None, None, None)
    } else {
        let step_pairs: Vec<(i64, i32)> = gait.iter().map(|row| (row.0, row.1)).collect();
        let stride_pairs: Vec<(i64, f64)> =
            gait.iter().map(|row| (row.0, f64::from(row.2))).collect();
        let cadence_pairs: Vec<(i64, f64)> =
            gait.iter().map(|row| (row.0, f64::from(row.3))).collect();
        (
            Some(timed_cumulative_i32(from, to, &step_pairs)),
            Some(timed_fixed_f64(from, to, &stride_pairs)),
            Some(timed_fixed_f64(from, to, &cadence_pairs)),
        )
    };
    let _ = steps;

    let powers = (!power_pairs.is_empty()).then(|| timed_fixed_f64(from, to, &power_pairs));
    let equiv_paces =
        (!equiv_pace_pairs.is_empty()).then(|| timed_fixed_f64(from, to, &equiv_pace_pairs));
    let (ground_contacts, oscillations, vertical_ratios) = if posture.is_empty() {
        (None, None, None)
    } else {
        // Sentinels are carried through the fill as NaN so a "not measured"
        // second never inherits the previous second's reading.
        let column = |pick: fn(&PostureRow) -> (i64, f64)| -> Vec<(i64, f64)> {
            posture.iter().map(pick).collect()
        };
        (
            Some(timed_fixed_f64(
                from,
                to,
                &column(|row| (row.0, sentinel_free(row.1, 65535))),
            )),
            Some(timed_fixed_f64(
                from,
                to,
                &column(|row| (row.0, sentinel_free(row.2, 65535))),
            )),
            Some(timed_fixed_f64(
                from,
                to,
                // Raw units are tenths of a percent.
                &column(|row| (row.0, sentinel_free(row.3, 255) / 10.0)),
            )),
        )
    };

    let mut route = Vec::new();
    let mut altitude_by_second: std::collections::BTreeMap<i64, f64> =
        std::collections::BTreeMap::new();
    let has_pair_altitude = !altitude_pairs.is_empty();
    if has_pair_altitude {
        let mut cursor = from;
        for (delta, centimetres) in &altitude_pairs {
            cursor = cursor.saturating_add((*delta).max(0));
            if let Some(meters) = cm_to_meters(i64::from(*centimetres)) {
                altitude_by_second.insert(cursor, meters);
            }
        }
    }
    let mut route_dropped_points = 0usize;
    if !time_deltas.is_empty() && !latitudes.is_empty() && !longitudes.is_empty() {
        let mut unix_ts = from;
        let mut latitude = 0i64;
        let mut longitude = 0i64;
        let count = time_deltas.len().min(latitudes.len()).min(longitudes.len());
        for index in 0..count {
            // 差分链上任何一环读不懂，「从这一点起位置不可知」——截断，
            // 而不是跳过去让后面所有点带着平移继续画。
            let Some(delta_seconds) = time_deltas[index] else {
                break;
            };
            unix_ts = unix_ts.saturating_add(i64::from(delta_seconds.max(0)));
            let (Some(lat_delta), Some(lon_delta)) = (latitudes[index], longitudes[index]) else {
                break;
            };
            let (Some(next_latitude), Some(next_longitude)) = (
                latitude.checked_add(lat_delta),
                longitude.checked_add(lon_delta),
            ) else {
                break;
            };
            let latitude_deg = next_latitude as f64 / COORD_FACTOR;
            let longitude_deg = next_longitude as f64 / COORD_FACTOR;
            if latitude_deg.abs() > 90.0 || longitude_deg.abs() > 180.0 {
                break;
            }
            let Some(timestamp) = Utc.timestamp_opt(unix_ts, 0).single() else {
                break;
            };
            latitude = next_latitude;
            longitude = next_longitude;
            let altitude_m = if has_pair_altitude {
                altitude_by_second.get(&unix_ts).copied()
            } else {
                let meters = altitudes_cm
                    .get(index)
                    .copied()
                    .flatten()
                    .and_then(cm_to_meters);
                if let Some(meters) = meters {
                    altitude_by_second.insert(unix_ts, meters);
                }
                meters
            };
            route.push(RoutePoint {
                timestamp,
                latitude: latitude_deg,
                longitude: longitude_deg,
                altitude_m,
            });
        }
        route_dropped_points = count - route.len();
    }

    let mut samples = Vec::with_capacity(duration_secs as usize);
    let mut last_altitude = None;
    for offset in 0..=duration_secs {
        let unix_ts = from.saturating_add(offset);
        let Some(timestamp) = Utc.timestamp_opt(unix_ts, 0).single() else {
            continue;
        };
        if let Some(altitude) = altitude_by_second.get(&unix_ts).copied() {
            last_altitude = Some(altitude);
        }
        let speed = speeds.as_ref().and_then(|map| map.get(&unix_ts).copied());
        let pace = speed.filter(|value| *value > 0.0).map(|value| 1.0 / value);
        samples.push(WorkoutSample {
            timestamp,
            heart_rate: heart_rates
                .as_ref()
                .and_then(|map| map.get(&unix_ts).copied())
                // 和 lap 的 0..=250 同一道界：跳变到 300+ 的读数是传感器坏点，
                // 不是任何人的心率。
                .filter(|value| (1..=250).contains(value)),
            speed,
            pace,
            cadence: cadences.as_ref().and_then(|map| map.get(&unix_ts).copied()),
            stride_cm: strides.as_ref().and_then(|map| map.get(&unix_ts).copied()),
            altitude_m: last_altitude,
            power_watts: finite_at(powers.as_ref(), unix_ts),
            ground_contact_ms: finite_at(ground_contacts.as_ref(), unix_ts),
            vertical_oscillation_mm: finite_at(oscillations.as_ref(), unix_ts),
            equivalent_pace_s_per_km: finite_at(equiv_paces.as_ref(), unix_ts)
                .filter(|value| *value > 0.0),
            vertical_ratio_pct: finite_at(vertical_ratios.as_ref(), unix_ts),
        });
    }

    let mut distance_by_second: std::collections::BTreeMap<i64, f64> =
        std::collections::BTreeMap::new();
    {
        let mut cursor = from;
        // 上一个被留下的读数（秒, 米）。`currentDistance` 是累计值，必须单调
        // 不减：回退是坏点；相对上一个有效读数每秒超过 200 m 的跳变同样是
        // 坏点——真实遇到过一次跳变在同一秒里切出两万个 0 时长分段。
        //
        // 起点按「运动开始时距离为 0」处理，而不是留空：否则第一条读数完全
        // 绕过这个检查，一个坏掉的首个读数就能让 splits 直接爆炸。
        let mut previous: Option<(i64, f64)> = Some((from, 0.0));
        for (delta, centimetres) in &distance_pairs {
            cursor = cursor.saturating_add((*delta).max(0));
            let meters = f64::from(*centimetres) / 100.0;
            if let Some((previous_ts, previous_m)) = previous {
                let step = meters - previous_m;
                let elapsed = (cursor - previous_ts).max(1) as f64;
                if step < 0.0 || step > 200.0 * elapsed {
                    continue;
                }
            }
            distance_by_second.insert(cursor, meters);
            previous = Some((cursor, meters));
        }
    }
    let mut splits = compute_splits(&samples, &distance_by_second);
    // 对账：分段数超过「汇总距离能容纳的整公里数 +2」，或任何一段时长为 0，
    // 都说明 `currentDistance` 里的坏点还是混进来了——整份分段当坏数据
    // 丢掉，走下面的 kilo_pace 兜底。
    let splits_are_plausible = splits.iter().all(|split| split.duration_seconds > 0)
        && summary_distance_m
            .filter(|value| value.is_finite() && *value > 0.0)
            .is_none_or(|total| (splits.len() as f64) <= total / 1000.0 + 2.0);
    if !splits_are_plausible {
        splits = Vec::new();
    }
    // `currentDistance` 是空的时候（这份库里 336 条明细有 130 条如此），
    // 上面这一步返回空，整条运动就只剩一圈。云端自己的 `kilo_pace` 在这些
    // 记录上恰恰是有的。
    if splits.is_empty() {
        if let Some(seconds) = kilometre_seconds(data.get("kilo_pace")) {
            // kilo_pace 一行就是一公里，行数必须和汇总距离对得上（±1 容一截
            // 零头的舍入）。对不上说明列读错了，拒用——和 laps 的对账同一态度。
            let count_agrees = summary_distance_m
                .filter(|value| value.is_finite() && *value > 0.0)
                .is_none_or(|total| {
                    let expected = (total / 1000.0).floor() as i64;
                    (seconds.len() as i64 - expected).abs() <= 1
                });
            if count_agrees {
                let total = summary_distance_m.or_else(|| {
                    // 汇总没给距离时，按整公里数兜底：kilo_pace 每一行就是一公里。
                    (!seconds.is_empty()).then_some(seconds.len() as f64 * 1000.0)
                });
                splits =
                    splits_from_kilometre_seconds(&samples, &seconds, start_time, end_time, total);
            }
        }
    }

    // 手表自己记的圈。解出来之后还要和汇总对一遍账：距离加起来对不上、
    // 或者最后一圈不在运动结束的时刻，就说明列读错了，整份丢掉。
    let laps = {
        let candidate = parse_laps(data.get("lap"), start_time);
        if laps_agree_with_summary(&candidate, summary_distance_m, duration_secs) {
            candidate
        } else {
            Vec::new()
        }
    };

    Ok(DecodedWorkout {
        track_id,
        source,
        start_time,
        end_time,
        route,
        route_dropped_points,
        samples,
        pauses,
        splits,
        laps,
    })
}

#[cfg(test)]
mod tests;
