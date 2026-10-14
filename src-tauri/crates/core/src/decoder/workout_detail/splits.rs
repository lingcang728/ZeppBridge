//! 分公里与分圈：从逐点序列累积、按手表给的每公里用时切分、与摘要核对（从 decoder/workout_detail.rs 拆出，逻辑不变）。

use super::*;

/// Accumulator for the split currently being filled.
#[derive(Debug)]
pub(super) struct SplitBuilder {
    pub(super) index: i32,
    pub(super) start_time: DateTime<Utc>,
    pub(super) start_distance_m: f64,
    pub(super) hr_sum: i64,
    pub(super) hr_count: i64,
    pub(super) max_hr: Option<i32>,
    pub(super) committed_altitude: Option<f64>,
    pub(super) gain: f64,
    pub(super) loss: f64,
    pub(super) saw_altitude: bool,
}

impl SplitBuilder {
    pub(super) fn new(index: i32, start_time: DateTime<Utc>, start_distance_m: f64) -> Self {
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

    pub(super) fn observe(&mut self, sample: &WorkoutSample) {
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

    pub(super) fn finish(
        self,
        end_time: DateTime<Utc>,
        end_distance_m: f64,
        partial: bool,
    ) -> WorkoutSplit {
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
pub(super) fn parse_laps(value: Option<&Value>, start: DateTime<Utc>) -> Vec<WorkoutLap> {
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
pub(super) fn laps_agree_with_summary(
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
pub(super) const LAP_SUMMARY_TOLERANCE: f64 = 0.05;

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
pub(super) fn kilometre_seconds(value: Option<&Value>) -> Option<Vec<i64>> {
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
        elapsed = elapsed.checked_add(duration)?;
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
pub(super) fn splits_from_kilometre_seconds(
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
        let Some(end) = add_seconds(cursor, *duration) else {
            break;
        };
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
pub(super) fn compute_splits(
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
        let lower = previous_ts.map_or(unix_ts, |previous| previous.saturating_add(1));
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
