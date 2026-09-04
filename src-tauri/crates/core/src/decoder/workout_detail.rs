//! Decode Zepp `/v1/sport/run/detail.json` delta strings.
//!
//! Algorithm follows H3llK33p3r/zepp-fit-extractor (`SportContainer` in
//! `io/IO.kt`, Apache-2.0). Field meanings come from that project's
//! `SportDetail` comments. We do not copy their real-GPS fixtures.

use crate::models::error::*;
use chrono::{DateTime, TimeZone, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;

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

/// Accumulator for the split currently being filled.
#[derive(Debug)]
struct SplitBuilder {
    index: i32,
    start_time: DateTime<Utc>,
    start_distance_m: f64,
    hr_sum: i64,
    hr_count: i64,
    max_hr: Option<i32>,
    committed_altitude: Option<f64>,
    gain: f64,
    loss: f64,
    saw_altitude: bool,
}

impl SplitBuilder {
    fn new(index: i32, start_time: DateTime<Utc>, start_distance_m: f64) -> Self {
        Self {
            index,
            start_time,
            start_distance_m,
            hr_sum: 0,
            hr_count: 0,
            max_hr: None,
            committed_altitude: None,
            gain: 0.0,
            loss: 0.0,
            saw_altitude: false,
        }
    }

    fn observe(&mut self, sample: &WorkoutSample) {
        if let Some(heart_rate) = sample.heart_rate {
            self.hr_sum += i64::from(heart_rate);
            self.hr_count += 1;
            self.max_hr = Some(self.max_hr.map_or(heart_rate, |best| best.max(heart_rate)));
        }
        if let Some(altitude) = sample.altitude_m {
            self.saw_altitude = true;
            match self.committed_altitude {
                None => self.committed_altitude = Some(altitude),
                Some(previous) => {
                    let change = altitude - previous;
                    if change >= ELEVATION_NOISE_FLOOR_M {
                        self.gain += change;
                        self.committed_altitude = Some(altitude);
                    } else if change <= -ELEVATION_NOISE_FLOOR_M {
                        self.loss += -change;
                        self.committed_altitude = Some(altitude);
                    }
                }
            }
        }
    }

    fn finish(self, end_time: DateTime<Utc>, end_distance_m: f64, partial: bool) -> WorkoutSplit {
        let distance_m = (end_distance_m - self.start_distance_m).max(0.0);
        let duration_seconds = (end_time - self.start_time).num_seconds().max(0);
        let pace_min_per_km = (distance_m > 0.0 && duration_seconds > 0)
            .then(|| (duration_seconds as f64 / 60.0) / (distance_m / 1000.0));
        WorkoutSplit {
            index: self.index,
            start_time: self.start_time,
            end_time,
            distance_m,
            duration_seconds,
            pace_min_per_km,
            avg_hr: (self.hr_count > 0).then(|| (self.hr_sum / self.hr_count) as i32),
            max_hr: self.max_hr,
            // A workout with no altitude readings reports nothing rather than a
            // confident zero.
            elevation_gain_m: self.saw_altitude.then_some(self.gain),
            elevation_loss_m: self.saw_altitude.then_some(self.loss),
            partial,
        }
    }
}

/// Laps from the `lap` field of the workout detail.
///
/// Row layout, confirmed against **all 32** workouts in a real library that
/// carry this field — rows come 60, 62 or 66 columns wide and the first six are
/// the same in every one:
///
/// ```text
/// 0,300,570,s00000000000,135,301,...
/// │ │   │   │             │   └ elapsed seconds at the end of this lap
/// │ │   │   │             └ average heart rate
/// │ │   │   └ geohash placeholder, always zeroed in these payloads
/// │ │   └ distance in metres
/// │ └ duration in seconds
/// └ 0-based lap number
/// ```
///
/// The check is not the column widths — those vary, and on `kilo_pace` the same
/// width was seen with the columns in different orders. It is that the numbers
/// have to agree with the workout: sequential indices, a non-decreasing elapsed
/// column, and heart rates in a range a heart can occupy. The caller adds the
/// two strongest checks, which need the summary: the lap distances must sum to
/// the workout distance and the last elapsed value must match its duration.
/// On the 32 real workouts all five hold every time.
///
/// Column `[1]` is **moving** time and can be shorter than the gap between two
/// elapsed values when the watch was paused, so lap boundaries are placed from
/// the elapsed column and `[1]` is not used for timing.
fn parse_laps(value: Option<&Value>, start: DateTime<Utc>) -> Vec<WorkoutLap> {
    let Some(text) = value.and_then(Value::as_str).map(str::trim) else {
        return Vec::new();
    };
    if text.is_empty() {
        return Vec::new();
    }
    let mut laps = Vec::new();
    let mut previous_elapsed = 0i64;
    for (position, row) in text.split(';').filter(|row| !row.is_empty()).enumerate() {
        let columns: Vec<&str> = row.split(',').collect();
        if columns.len() < 6 {
            return Vec::new();
        }
        let (Ok(index), Ok(distance_m), Ok(heart_rate), Ok(elapsed)) = (
            columns[0].trim().parse::<i64>(),
            columns[2].trim().parse::<f64>(),
            columns[4].trim().parse::<i64>(),
            columns[5].trim().parse::<i64>(),
        ) else {
            return Vec::new();
        };
        if index != position as i64
            || !distance_m.is_finite()
            || distance_m < 0.0
            || elapsed < previous_elapsed
            || elapsed > MAX_ACTIVITY_SECONDS
            || !(0..=250).contains(&heart_rate)
        {
            return Vec::new();
        }
        let (Some(lap_start), Some(lap_end)) = (
            start.checked_add_signed(chrono::Duration::seconds(previous_elapsed)),
            start.checked_add_signed(chrono::Duration::seconds(elapsed)),
        ) else {
            return Vec::new();
        };
        laps.push(WorkoutLap {
            index: position as i32 + 1,
            start_time: lap_start,
            end_time: lap_end,
            distance_m,
            duration_seconds: elapsed - previous_elapsed,
            // 0 从手表来的时候是「这一圈没测到心率」，不是「心率为 0」。
            avg_hr: (heart_rate > 0).then_some(heart_rate as i32),
            max_hr: None,
        });
        previous_elapsed = elapsed;
    }
    laps
}

/// Do the laps agree with the workout they belong to?
///
/// The two checks that need the summary, and the two that carry the most weight:
/// lap distances have to add up to the workout distance, and the last lap has to
/// end when the workout ended. A column read as the wrong field passes neither.
/// Either summary value being absent skips its own check rather than failing —
/// an indoor workout has no distance, and that is not evidence against the laps.
fn laps_agree_with_summary(
    laps: &[WorkoutLap],
    summary_distance_m: Option<f64>,
    duration_seconds: i64,
) -> bool {
    if laps.is_empty() {
        return false;
    }
    if let Some(distance) = summary_distance_m.filter(|value| value.is_finite() && *value > 0.0) {
        let total: f64 = laps.iter().map(|lap| lap.distance_m).sum();
        if (total - distance).abs() / distance > LAP_SUMMARY_TOLERANCE {
            return false;
        }
    }
    if duration_seconds > 0 {
        let last = laps
            .last()
            .map(|lap| (lap.end_time - laps[0].start_time).num_seconds())
            .unwrap_or_default();
        let drift = (last - duration_seconds).abs() as f64 / duration_seconds as f64;
        if drift > LAP_SUMMARY_TOLERANCE {
            return false;
        }
    }
    true
}

/// 圈的总距离 / 总时长和汇总之间允许差多少。
///
/// 5% 不是随手取的：真实的 32 条里最大的一条差 2%（手表在停表和记圈之间
/// 有几秒的差），而一次「把列读错了」的偏差是成倍的，不是几个百分点。
const LAP_SUMMARY_TOLERANCE: f64 = 0.05;

/// Kilometre boundaries from the server's own `kilo_pace` series.
///
/// Splits normally come from `currentDistance`, but on this library **130 of
/// 336 stored workout details have an empty `currentDistance` and a populated
/// `kilo_pace`** — those workouts get no splits at all today, which is what a
/// .fit comparison on GitHub surfaced as "run.fit: 1 lap, Zepp: 8 laps".
///
/// The row layout is **not stable**. Rows come 6, 14 or 15 fields wide, and at
/// the same width the columns still move: on one workout field 4 is the average
/// heart rate and field 13 is something else, on another it is the reverse. So
/// only three columns are read here, and the decode has to prove itself before
/// it is used:
///
/// * `[0]` the 0-based kilometre number, which must equal its position;
/// * `[1]` that kilometre's duration in seconds, which must be plausible;
/// * `[5]` the elapsed total, which must equal the running sum of `[1]`.
///
/// If any row fails, the whole series is refused and the workout keeps the
/// single whole-activity lap it has today. On 266 real workouts this accepts
/// 263 and rejects 3 — and the three it rejects are ones whose columns really
/// do not line up.
///
/// Heart rate and elevation are **not** read out of `kilo_pace`. They are
/// accumulated from our own per-second samples over each kilometre's time
/// window, exactly as the `currentDistance` path does, because that needs no
/// guess about which column means what.
fn kilometre_seconds(value: Option<&Value>) -> Option<Vec<i64>> {
    let text = value.and_then(Value::as_str)?.trim();
    if text.is_empty() {
        return None;
    }
    let mut seconds = Vec::new();
    let mut elapsed = 0i64;
    for (position, row) in text.split(';').filter(|row| !row.is_empty()).enumerate() {
        let columns: Vec<&str> = row.split(',').collect();
        if columns.len() < 6 {
            return None;
        }
        let index: i64 = columns[0].trim().parse().ok()?;
        let duration: i64 = columns[1].trim().parse().ok()?;
        let cumulative: i64 = columns[5].trim().parse().ok()?;
        if index != position as i64 {
            return None;
        }
        // 一公里跑上一小时以上，那不是配速，是列读错了。
        if !(1..=3600).contains(&duration) {
            return None;
        }
        elapsed += duration;
        // 允许 1 秒的取整误差：这一列在部分记录里是从毫秒四舍五入来的。
        if (cumulative - elapsed).abs() > 2 {
            return None;
        }
        seconds.push(duration);
    }
    (!seconds.is_empty()).then_some(seconds)
}

/// Build kilometre splits from `kilo_pace` durations plus our own samples.
///
/// `kilo_pace` carries exactly `floor(distance / 1000)` rows — the trailing
/// partial kilometre is not one of them — so the remainder is added here from
/// the summary distance, keeping the same `partial` flag the other path sets.
/// Without it a 4975 m run would report 4 km and quietly lose 975 m.
fn splits_from_kilometre_seconds(
    samples: &[WorkoutSample],
    kilometre_seconds: &[i64],
    start: DateTime<Utc>,
    end: DateTime<Utc>,
    total_distance_m: Option<f64>,
) -> Vec<WorkoutSplit> {
    let sample_by_second: std::collections::BTreeMap<i64, &WorkoutSample> = samples
        .iter()
        .map(|sample| (sample.timestamp.timestamp(), sample))
        .collect();

    let mut splits = Vec::new();
    let mut cursor = start;
    let mut travelled = 0.0f64;
    for (position, duration) in kilometre_seconds.iter().enumerate() {
        let end = cursor + chrono::Duration::seconds(*duration);
        let mut builder = SplitBuilder::new(position as i32 + 1, cursor, travelled);
        for sample in sample_by_second
            .range(cursor.timestamp()..=end.timestamp())
            .map(|(_, item)| *item)
        {
            builder.observe(sample);
        }
        travelled += 1000.0;
        splits.push(builder.finish(end, travelled, false));
        cursor = end;
    }

    // 最后那截零头。`kilo_pace` 只给整公里，所以它的时长只能由运动的结束时刻
    // 界定——不能用「最后一条采样」，那在采样比计时先停的记录上会把零头整段
    // 丢掉，而丢掉的恰恰是一次 4975 m 跑步里的那 975 m。
    if let Some(total) = total_distance_m.filter(|value| value.is_finite()) {
        if total - travelled > 1.0 && end > cursor {
            let index = splits.len() as i32 + 1;
            let mut builder = SplitBuilder::new(index, cursor, travelled);
            for sample in sample_by_second
                .range(cursor.timestamp()..=end.timestamp())
                .map(|(_, item)| *item)
            {
                builder.observe(sample);
            }
            splits.push(builder.finish(end, total, true));
        }
    }
    splits
}

/// Cut a workout into kilometres along the server's cumulative distance.
///
/// The distance series drives the walk, not the sample series: a workout's
/// distance readings can run past its last per-second sample, and driving from
/// the samples silently dropped that tail — a 578 m walk came out 1.75% short.
/// Samples are folded in for heart rate and altitude wherever they line up.
fn compute_splits(
    samples: &[WorkoutSample],
    distance_by_second: &std::collections::BTreeMap<i64, f64>,
) -> Vec<WorkoutSplit> {
    let Some((&first_ts, _)) = distance_by_second.iter().next() else {
        return Vec::new();
    };
    let Some(first_time) = Utc.timestamp_opt(first_ts, 0).single() else {
        return Vec::new();
    };
    let sample_by_second: std::collections::BTreeMap<i64, &WorkoutSample> = samples
        .iter()
        .map(|sample| (sample.timestamp.timestamp(), sample))
        .collect();

    let mut splits = Vec::new();
    let mut boundary = 1000.0f64;
    let mut builder = SplitBuilder::new(1, first_time, 0.0);
    let mut previous_ts: Option<i64> = None;
    let mut travelled = 0.0f64;
    let mut last_time = first_time;

    for (&unix_ts, distance) in distance_by_second {
        let Some(moment) = Utc.timestamp_opt(unix_ts, 0).single() else {
            continue;
        };
        // Every sample since the previous distance reading belongs to this
        // split, so a distance series coarser than one second still averages
        // heart rate over the whole kilometre.
        let lower = previous_ts.map_or(unix_ts, |previous| previous + 1);
        for sample in sample_by_second
            .range(lower..=unix_ts)
            .map(|(_, item)| *item)
        {
            builder.observe(sample);
        }
        previous_ts = Some(unix_ts);
        travelled = *distance;
        last_time = moment;

        // A single reading can only span more than one boundary in corrupt
        // data; looping keeps the indices contiguous if it ever happens.
        while travelled >= boundary {
            let index = builder.index;
            splits.push(builder.finish(moment, boundary, false));
            builder = SplitBuilder::new(index + 1, moment, boundary);
            boundary += 1000.0;
        }
    }

    if travelled > builder.start_distance_m {
        splits.push(builder.finish(last_time, travelled, true));
    }
    splits
}

#[derive(Debug, Clone, Default, PartialEq)]
pub struct DecodedWorkout {
    pub track_id: i64,
    pub source: Option<String>,
    pub start_time: DateTime<Utc>,
    pub end_time: DateTime<Utc>,
    pub route: Vec<RoutePoint>,
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
    let time_sum: i64 = time_deltas
        .iter()
        .map(|value| i64::from(*value.max(&0)))
        .sum();
    let time_end = start_time + chrono::Duration::seconds(time_sum);
    let end_time = match summary_end {
        Some(summary) if summary > time_end => summary,
        _ => time_end.max(start_time + chrono::Duration::seconds(1)),
    };

    let duration_secs = (end_time - start_time)
        .num_seconds()
        .clamp(1, MAX_ACTIVITY_SECONDS);
    let from = track_id;
    let to = track_id + duration_secs;

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
            cursor += (*delta).max(0);
            if let Some(meters) = cm_to_meters(i64::from(*centimetres)) {
                altitude_by_second.insert(cursor, meters);
            }
        }
    }
    if !time_deltas.is_empty() && !latitudes.is_empty() && !longitudes.is_empty() {
        let mut unix_ts = from;
        let mut latitude = 0i64;
        let mut longitude = 0i64;
        let count = time_deltas.len().min(latitudes.len()).min(longitudes.len());
        for index in 0..count {
            unix_ts += i64::from(time_deltas[index].max(0));
            if let (Some(lat_delta), Some(lon_delta)) = (latitudes[index], longitudes[index]) {
                latitude += lat_delta;
                longitude += lon_delta;
                let altitude_m = if has_pair_altitude {
                    altitude_by_second.get(&unix_ts).copied()
                } else {
                    let meters = altitudes_cm.get(index).copied().and_then(cm_to_meters);
                    if let Some(meters) = meters {
                        altitude_by_second.insert(unix_ts, meters);
                    }
                    meters
                };
                if let Some(timestamp) = Utc.timestamp_opt(unix_ts, 0).single() {
                    route.push(RoutePoint {
                        timestamp,
                        latitude: latitude as f64 / COORD_FACTOR,
                        longitude: longitude as f64 / COORD_FACTOR,
                        altitude_m,
                    });
                }
            }
        }
    }

    let mut samples = Vec::with_capacity(duration_secs as usize);
    let mut last_altitude = None;
    for offset in 0..=duration_secs {
        let unix_ts = from + offset;
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
                .filter(|value| *value > 0),
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
        for (delta, centimetres) in &distance_pairs {
            cursor += (*delta).max(0);
            distance_by_second.insert(cursor, f64::from(*centimetres) / 100.0);
        }
    }
    let mut splits = compute_splits(&samples, &distance_by_second);
    // `currentDistance` 是空的时候（这份库里 336 条明细有 130 条如此），
    // 上面这一步返回空，整条运动就只剩一圈。云端自己的 `kilo_pace` 在这些
    // 记录上恰恰是有的。
    if splits.is_empty() {
        if let Some(seconds) = kilometre_seconds(data.get("kilo_pace")) {
            let total = summary_distance_m.or_else(|| {
                // 汇总没给距离时，按整公里数兜底：kilo_pace 每一行就是一公里。
                (!seconds.is_empty()).then_some(seconds.len() as f64 * 1000.0)
            });
            splits = splits_from_kilometre_seconds(&samples, &seconds, start_time, end_time, total);
        }
    }

    // 手表自己记的圈。解出来之后还要和汇总对一遍账：距离加起来对不上、
    // 或者最后一圈不在运动结束的时刻，就说明列读错了，整份丢掉。
    let laps = {
        let candidate = parse_laps(data.get("lap"), start_time);
        if laps_agree_with_summary(
            &candidate,
            summary_distance_m,
            (end_time - start_time).num_seconds(),
        ) {
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
        samples,
        pauses,
        splits,
        laps,
    })
}

fn detail_object(raw: &Value) -> Option<&serde_json::Map<String, Value>> {
    if let Some(data) = raw.get("data").and_then(Value::as_object) {
        if data.contains_key("trackid") || data.contains_key("longitude_latitude") {
            return Some(data);
        }
    }
    raw.as_object()
}

fn parse_i64(value: Option<&Value>) -> Option<i64> {
    match value? {
        Value::Number(number) => number.as_i64(),
        Value::String(text) => text.trim().parse().ok(),
        _ => None,
    }
}

fn parse_int_list(value: Option<&Value>) -> Vec<i32> {
    let Some(text) = value.and_then(Value::as_str) else {
        return Vec::new();
    };
    text.split(';')
        .filter(|part| !part.is_empty())
        .filter_map(|part| part.parse().ok())
        .collect()
}

fn parse_coordinate_deltas(value: Option<&Value>) -> (Vec<Option<i64>>, Vec<Option<i64>>) {
    let Some(text) = value.and_then(Value::as_str) else {
        return (Vec::new(), Vec::new());
    };
    let mut latitudes = Vec::new();
    let mut longitudes = Vec::new();
    for part in text.split(';').filter(|part| !part.is_empty()) {
        let mut bits = part.split(',');
        let lat = bits.next().and_then(|item| item.parse().ok());
        let lon = bits.next().and_then(|item| item.parse().ok());
        latitudes.push(lat);
        longitudes.push(lon);
    }
    (latitudes, longitudes)
}

fn parse_altitude_cm(value: Option<&Value>) -> Vec<i64> {
    let mut values = parse_int_list(value)
        .into_iter()
        .map(i64::from)
        .collect::<Vec<_>>();
    if let Some(first_valid) = values
        .iter()
        .position(|value| is_plausible_altitude_cm(*value))
    {
        let fill = values[first_valid];
        for item in values.iter_mut().take(first_valid) {
            *item = fill;
        }
    }
    values
}

fn is_plausible_altitude_cm(cm: i64) -> bool {
    (MIN_PLAUSIBLE_ALTITUDE_CM..=MAX_PLAUSIBLE_ALTITUDE_CM).contains(&cm)
}

fn cm_to_meters(cm: i64) -> Option<f64> {
    is_plausible_altitude_cm(cm).then(|| cm as f64 / 100.0)
}

/// 解析一段 `dt,value;dt,value;...`。
///
/// **乱码的 delta 会让整行被丢掉，而不是当成 0。** 以前这里是
/// `raw_delta.parse().unwrap_or(0)`：一个非空但解析不出来的 delta 会让这个
/// 样本和上一个落到同一个时间戳上。轻则重复采样，重则污染配速、功率、
/// 跑姿和分段——而这一切在界面上看起来完全正常，因为样本数是对的。
///
/// 空 delta 是另一回事：协议里它确实表示「下一秒」，由 `empty_delta_is_one`
/// 明确开启，不是猜的。
fn parse_delta_pairs(value: Option<&Value>, empty_delta_is_one: bool) -> Vec<(i64, i32)> {
    let Some(text) = value.and_then(Value::as_str) else {
        return Vec::new();
    };
    let mut pairs = Vec::new();
    for part in text.split(';').filter(|part| !part.is_empty()) {
        let mut bits = part.splitn(2, ',');
        let raw_delta = bits.next().unwrap_or("").trim();
        let raw_value = bits.next().unwrap_or("");
        let delta = if raw_delta.is_empty() {
            if empty_delta_is_one {
                1
            } else {
                // 这一路的协议没有「空 = 1 秒」这条约定，空 delta 就是读不
                // 懂的东西。跳过，别替它编一个。
                continue;
            }
        } else {
            match raw_delta.parse::<i64>() {
                Ok(parsed) => parsed,
                Err(_) => continue,
            }
        };
        let Some(sample) = raw_value.parse::<i32>().ok() else {
            continue;
        };
        pairs.push((delta, sample));
    }
    pairs
}

fn parse_float_pairs(value: Option<&Value>) -> Vec<(i64, f64)> {
    let Some(text) = value.and_then(Value::as_str) else {
        return Vec::new();
    };
    let mut pairs = Vec::new();
    for part in text.split(';').filter(|part| !part.is_empty()) {
        let mut bits = part.splitn(2, ',');
        let Some(delta) = bits.next().and_then(|item| item.parse().ok()) else {
            continue;
        };
        let Some(sample) = bits.next().and_then(|item| item.parse().ok()) else {
            continue;
        };
        pairs.push((delta, sample));
    }
    pairs
}

/// `(dt, value)` pairs where the value is a plain reading rather than a delta.
///
/// Unlike `parse_float_pairs` an empty leading delta means "one second later",
/// the same convention `parse_delta_pairs` uses, because real `power_meter`
/// and `equivPace` strings contain them.
fn parse_valued_pairs(value: Option<&Value>) -> Vec<(i64, f64)> {
    let Some(text) = value.and_then(Value::as_str) else {
        return Vec::new();
    };
    let mut pairs = Vec::new();
    for part in text.split(';').filter(|part| !part.is_empty()) {
        let mut bits = part.splitn(2, ',');
        let raw_delta = bits.next().unwrap_or("").trim();
        // 同 `parse_delta_pairs`：空 delta 是协议里的「下一秒」，乱码 delta
        // 不是 0，是读不懂。读不懂就跳过这一行。
        let delta = if raw_delta.is_empty() {
            1
        } else {
            match raw_delta.parse::<i64>() {
                Ok(parsed) => parsed,
                Err(_) => continue,
            }
        };
        let Some(sample) = bits.next().and_then(|item| item.trim().parse::<f64>().ok()) else {
            continue;
        };
        pairs.push((delta, sample));
    }
    pairs
}

/// `(dt, ground contact, vertical oscillation, vertical stride ratio)`.
type PostureRow = (i64, i32, i32, i32);

fn parse_run_posture(value: Option<&Value>) -> Vec<PostureRow> {
    let Some(text) = value.and_then(Value::as_str) else {
        return Vec::new();
    };
    let mut rows = Vec::new();
    for part in text.split(';').filter(|part| !part.is_empty()) {
        let bits: Vec<&str> = part.split(',').collect();
        if bits.len() < 4 {
            continue;
        }
        let raw_delta = bits[0].trim();
        let delta = if raw_delta.is_empty() {
            1
        } else {
            match raw_delta.parse::<i64>() {
                Ok(value) => value,
                Err(_) => continue,
            }
        };
        let (Ok(contact), Ok(oscillation), Ok(ratio)) = (
            bits[1].trim().parse::<i32>(),
            bits[2].trim().parse::<i32>(),
            bits[3].trim().parse::<i32>(),
        ) else {
            continue;
        };
        rows.push((delta, contact, oscillation, ratio));
    }
    rows
}

/// Map a device sentinel to NaN so the fill never carries it forward as a
/// real reading; `finite_at` then drops it.
fn sentinel_free(value: i32, sentinel: i32) -> f64 {
    if value == sentinel || value < 0 {
        f64::NAN
    } else {
        f64::from(value)
    }
}

fn finite_at(map: Option<&std::collections::HashMap<i64, f64>>, unix_ts: i64) -> Option<f64> {
    map.and_then(|map| map.get(&unix_ts).copied())
        .filter(|value| value.is_finite())
}

fn parse_gait(value: Option<&Value>) -> Vec<(i64, i32, i32, i32)> {
    let Some(text) = value.and_then(Value::as_str) else {
        return Vec::new();
    };
    let mut rows = Vec::new();
    for part in text.split(';').filter(|part| !part.is_empty()) {
        let bits: Vec<&str> = part.split(',').collect();
        if bits.len() < 4 {
            continue;
        }
        let (Ok(delta), Ok(steps), Ok(stride), Ok(cadence)) = (
            bits[0].parse::<i64>(),
            bits[1].parse::<i32>(),
            bits[2].parse::<i32>(),
            bits[3].parse::<i32>(),
        ) else {
            continue;
        };
        rows.push((delta, steps, stride, cadence));
    }
    rows
}

fn parse_pauses(value: Option<&Value>) -> Vec<PauseInterval> {
    let Some(text) = value.and_then(Value::as_str) else {
        return Vec::new();
    };
    let mut pauses = Vec::new();
    for part in text.split(';').filter(|part| !part.is_empty()) {
        let bits: Vec<&str> = part.split(',').collect();
        if bits.len() < 5 {
            continue;
        }
        let Some(start) = bits[0].parse::<i64>().ok() else {
            continue;
        };
        let Some(end_delta) = bits[1].parse::<i64>().ok() else {
            continue;
        };
        let kind = match bits[4].parse::<i32>().unwrap_or(0) {
            2 => "manual",
            3 => "auto",
            other => {
                if other == 0 {
                    "unknown"
                } else {
                    continue;
                }
            }
        };
        let Some(start_time) = Utc.timestamp_opt(start, 0).single() else {
            continue;
        };
        let Some(end_time) = Utc.timestamp_opt(start + end_delta.max(0), 0).single() else {
            continue;
        };
        if end_time <= start_time {
            continue;
        }
        pauses.push(PauseInterval {
            start_time,
            end_time,
            kind: kind.into(),
        });
    }
    pauses
}

fn timed_cumulative_i32(
    from: i64,
    to: i64,
    elements: &[(i64, i32)],
) -> std::collections::HashMap<i64, i32> {
    timed_fill(from, to, elements, 0, |current, delta| {
        current.saturating_add(*delta)
    })
}

fn timed_fixed_f64(
    from: i64,
    to: i64,
    elements: &[(i64, f64)],
) -> std::collections::HashMap<i64, f64> {
    timed_fill(from, to, elements, 0.0, |_, value| *value)
}

fn timed_fill<T: Copy>(
    from: i64,
    to: i64,
    elements: &[(i64, T)],
    init: T,
    update: impl Fn(T, &T) -> T,
) -> std::collections::HashMap<i64, T> {
    let mut result = std::collections::HashMap::new();
    let mut working = from;
    let mut value = init;
    for (index, (delta, sample)) in elements.iter().enumerate() {
        value = update(value, sample);
        let start = if index == 0 { 0 } else { 1 };
        if *delta >= start {
            for _ in start..=*delta {
                result.insert(working, value);
                working += 1;
                if working > to + 1 {
                    break;
                }
            }
        }
    }
    while working <= to {
        result.insert(working, value);
        working += 1;
    }
    result
}

#[cfg(test)]
mod tests {
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
        let altitudes: Vec<Option<f64>> =
            decoded.route.iter().map(|point| point.altitude_m).collect();
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
        let raw = json!({
            "trackid": 1_700_000_000i64,
            "time": "0;1;1;1;1;",
            "currentDistance": "0,0;1,40000;1,100000;1,160000;1,240000;",
            "heart_rate": "0,150;1,10;1,0;1,-10;1,0;",
            "time_delta_altitude": "1,1000;1,1200;1,1100;1,1300;",
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
        let raw = json!({
            "trackid": 1_700_000_000i64,
            "time": "0;1;1;1;1;",
            "currentDistance": "0,0;1,40000;1,100000;1,160000;1,240000;",
            // 故意给一份和上面对不上的 kilo_pace：它不该被用到。
            "kilo_pace": "0,999,geo,1,-1,999,999000,69,0,109,0,4,0,164;",
            "heart_rate": "0,150;1,10;1,0;1,-10;1,0;",
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
}
