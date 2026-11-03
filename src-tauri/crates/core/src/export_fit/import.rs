//! 读用户自己修正过的 `.fit`（#140）。
//!
//! 被 GPS 干扰的城市里，一位用户每周都要把一两次户外训练的轨迹在本地重建成
//! 正确的 `.fit`（起点时间和原记录相同）。这里把它读成和云端明细同一个形状的
//! [`DecodedWorkout`]，再由存储层把它当作「用户的本地纠正」顶替原来的序列和
//! 汇总——云端那份原样留着，撤销修正时放回。
//!
//! 读法和写出时（`records.rs`）是一一对应的：`record` 是逐点序列，`event`
//! 的 timer stop → start 是暂停，`lap` 是圈，`session` 是汇总。**没写的量就是
//! 没有**：文件里没有心率，就不出心率；没有距离，就不切公里分段。

use std::collections::BTreeMap;

use chrono::{DateTime, TimeZone, Utc};
use embedded_io_adapters::std::FromStd;
use rustyfit::{
    profile::{mesgdef, typedef},
    proto::{Message, Value as FitValue},
    Decoder,
};

use super::FIT_EPOCH_OFFSET;
use crate::decoder::{
    splits_from_cumulative_distance, DecodedWorkout, PauseInterval, RoutePoint, WorkoutLap,
    WorkoutSample,
};

/// 修正文件的大小上限。一次 24 小时、逐秒记录的活动也只有几 MB。
pub const MAX_FIT_IMPORT_BYTES: usize = 32 * 1024 * 1024;

/// 一份读懂了的修正文件。
#[derive(Debug, Clone)]
pub struct ImportedFit {
    pub decoded: DecodedWorkout,
    pub summary: ImportedFitSummary,
    /// FIT `sport` 枚举的原值；文件没写就是 `None`。导入运动（`crate::import`）按它认运动类型。
    pub sport: Option<u8>,
}

/// 修正文件自己的汇总。缺哪项就是 `None`，存储层不会拿它覆盖云端的值。
#[derive(Debug, Clone, Default, PartialEq)]
pub struct ImportedFitSummary {
    pub start_time: Option<DateTime<Utc>>,
    pub end_time: Option<DateTime<Utc>>,
    pub distance_m: Option<f64>,
    pub moving_seconds: Option<i64>,
    pub avg_hr: Option<i32>,
    pub max_hr: Option<i32>,
}

/// 为什么读不了。存储层把它翻成 `err.workout_fit.*` 码。
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FitImportError {
    TooLarge,
    NotFit,
    NoActivity,
}

pub fn decode_fit_file(bytes: &[u8]) -> Result<ImportedFit, FitImportError> {
    if bytes.len() > MAX_FIT_IMPORT_BYTES {
        return Err(FitImportError::TooLarge);
    }
    let mut cursor = std::io::Cursor::new(bytes);
    let mut decoder = Decoder::new();
    let fit = decoder
        .decode(&mut FromStd::new(&mut cursor))
        .map_err(|_| FitImportError::NotFit)?
        .ok_or(FitImportError::NotFit)?;

    let mut sport = typedef::Sport(u8::MAX);
    let mut summary = ImportedFitSummary::default();
    let mut records: BTreeMap<i64, Reading> = BTreeMap::new();
    let mut timer_events: Vec<(i64, bool)> = Vec::new();
    let mut laps = Vec::new();

    for message in &fit.messages {
        match message.num {
            typedef::MesgNum::SPORT => {
                if let Some(value) = number(message, mesgdef::Sport::SPORT) {
                    sport = typedef::Sport(value as u8);
                }
            }
            typedef::MesgNum::SESSION => read_session(message, &mut summary, &mut sport),
            typedef::MesgNum::RECORD => {
                if let Some(unix) = timestamp(message, mesgdef::Record::TIMESTAMP) {
                    records.entry(unix).or_default().merge(read_record(message));
                }
            }
            typedef::MesgNum::EVENT => {
                let is_timer = number(message, mesgdef::Event::EVENT)
                    .is_some_and(|value| value as u8 == typedef::Event::TIMER.0);
                let (Some(unix), Some(kind), true) = (
                    timestamp(message, mesgdef::Event::TIMESTAMP),
                    number(message, mesgdef::Event::EVENT_TYPE),
                    is_timer,
                ) else {
                    continue;
                };
                let kind = typedef::EventType(kind as u8);
                if kind == typedef::EventType::START {
                    timer_events.push((unix, true));
                } else if kind == typedef::EventType::STOP
                    || kind == typedef::EventType::STOP_ALL
                    || kind == typedef::EventType::STOP_DISABLE
                    || kind == typedef::EventType::STOP_DISABLE_ALL
                {
                    timer_events.push((unix, false));
                }
            }
            typedef::MesgNum::LAP => {
                if let Some(lap) = read_lap(message, laps.len() as i32 + 1) {
                    laps.push(lap);
                }
            }
            _ => {}
        }
    }

    let first_record = records.keys().next().copied();
    let last_record = records.keys().next_back().copied();
    let start_unix = summary
        .start_time
        .map(|time| time.timestamp())
        .or(first_record)
        .ok_or(FitImportError::NoActivity)?;
    let end_unix = summary
        .end_time
        .map(|time| time.timestamp())
        .or(last_record)
        .filter(|end| *end > start_unix)
        .unwrap_or(start_unix + 1);
    let (Some(start_time), Some(end_time)) = (unix_time(start_unix), unix_time(end_unix)) else {
        return Err(FitImportError::NoActivity);
    };
    if records.is_empty() && laps.is_empty() {
        return Err(FitImportError::NoActivity);
    }
    summary.start_time = Some(start_time);
    summary.end_time = Some(end_time);

    let foot = super::is_foot_sport(sport);
    let mut samples = Vec::with_capacity(records.len());
    let mut route = Vec::new();
    let mut distances: BTreeMap<i64, f64> = BTreeMap::new();
    for (&unix, reading) in &records {
        let Some(moment) = unix_time(unix) else {
            continue;
        };
        if let (Some(latitude), Some(longitude)) = (reading.latitude, reading.longitude) {
            route.push(RoutePoint {
                timestamp: moment,
                latitude,
                longitude,
                altitude_m: reading.altitude_m,
            });
        }
        if let Some(distance) = reading.distance_m {
            distances.insert(unix, distance);
        }
        samples.push(WorkoutSample {
            timestamp: moment,
            heart_rate: reading.heart_rate,
            speed: reading.speed_mps,
            pace: reading
                .speed_mps
                .filter(|speed| *speed > 0.0)
                .map(|speed| 1.0 / speed),
            // FIT 的跑步步频是「每分钟周期数」，一个周期两步；写出时除了 2，
            // 读回来乘回去，和云端明细的「步/分钟」同单位。
            cadence: reading
                .cadence
                .map(|cycles| if foot { cycles * 2.0 } else { cycles }),
            stride_cm: None,
            altitude_m: reading.altitude_m,
            power_watts: reading.power_watts,
            ground_contact_ms: None,
            vertical_oscillation_mm: None,
            vertical_ratio_pct: None,
            equivalent_pace_s_per_km: None,
            distance_m: reading.distance_m,
        });
    }

    if summary.distance_m.is_none() {
        summary.distance_m = distances.values().next_back().copied();
    }
    let pauses = pauses_from_timer_events(&mut timer_events, end_unix);
    let splits = splits_from_cumulative_distance(&samples, &distances);

    Ok(ImportedFit {
        decoded: DecodedWorkout {
            track_id: start_unix,
            source: Some("user_fit".into()),
            start_time,
            end_time,
            route,
            route_dropped_points: 0,
            samples,
            pauses,
            splits,
            laps,
        },
        summary,
        sport: (sport.0 != u8::MAX).then_some(sport.0),
    })
}

#[derive(Debug, Default, Clone, Copy)]
struct Reading {
    latitude: Option<f64>,
    longitude: Option<f64>,
    altitude_m: Option<f64>,
    heart_rate: Option<i32>,
    speed_mps: Option<f64>,
    cadence: Option<f64>,
    power_watts: Option<f64>,
    distance_m: Option<f64>,
}

impl Reading {
    fn merge(&mut self, other: Reading) {
        self.latitude = other.latitude.or(self.latitude);
        self.longitude = other.longitude.or(self.longitude);
        self.altitude_m = other.altitude_m.or(self.altitude_m);
        self.heart_rate = other.heart_rate.or(self.heart_rate);
        self.speed_mps = other.speed_mps.or(self.speed_mps);
        self.cadence = other.cadence.or(self.cadence);
        self.power_watts = other.power_watts.or(self.power_watts);
        self.distance_m = other.distance_m.or(self.distance_m);
    }
}

fn read_record(message: &Message) -> Reading {
    let degrees = |num| {
        signed(message, num)
            .map(|semicircles| semicircles as f64 * 180.0 / 2_147_483_648.0)
            .filter(|value| value.is_finite() && value.abs() <= 180.0)
    };
    let (latitude, longitude) = match (
        degrees(mesgdef::Record::POSITION_LAT),
        degrees(mesgdef::Record::POSITION_LONG),
    ) {
        (Some(latitude), Some(longitude)) if latitude.abs() <= 90.0 => {
            (Some(latitude), Some(longitude))
        }
        _ => (None, None),
    };
    let altitude = number(message, mesgdef::Record::ENHANCED_ALTITUDE)
        .or_else(|| number(message, mesgdef::Record::ALTITUDE))
        .map(|raw| raw / 5.0 - 500.0);
    let speed = number(message, mesgdef::Record::ENHANCED_SPEED)
        .or_else(|| number(message, mesgdef::Record::SPEED))
        .map(|raw| raw / 1000.0);
    let cadence = number(message, mesgdef::Record::CADENCE).map(|whole| {
        whole + number(message, mesgdef::Record::FRACTIONAL_CADENCE).unwrap_or(0.0) / 128.0
    });
    Reading {
        latitude,
        longitude,
        altitude_m: altitude,
        heart_rate: number(message, mesgdef::Record::HEART_RATE)
            .map(|value| value as i32)
            .filter(|value| (1..=250).contains(value)),
        speed_mps: speed,
        cadence: cadence.filter(|value| *value > 0.0),
        power_watts: number(message, mesgdef::Record::POWER),
        distance_m: number(message, mesgdef::Record::DISTANCE).map(|cm| cm / 100.0),
    }
}

fn read_session(message: &Message, summary: &mut ImportedFitSummary, sport: &mut typedef::Sport) {
    if let Some(value) = number(message, mesgdef::Session::SPORT) {
        *sport = typedef::Sport(value as u8);
    }
    let start = timestamp(message, mesgdef::Session::START_TIME);
    if let Some(start) = start.and_then(unix_time) {
        summary.start_time = Some(start);
    }
    let elapsed = number(message, mesgdef::Session::TOTAL_ELAPSED_TIME).map(|ms| ms / 1000.0);
    if let (Some(start), Some(elapsed)) = (start, elapsed) {
        summary.end_time = unix_time(start + elapsed.round() as i64);
    } else if let Some(end) = timestamp(message, mesgdef::Session::TIMESTAMP).and_then(unix_time) {
        summary.end_time = Some(end);
    }
    summary.moving_seconds =
        number(message, mesgdef::Session::TOTAL_TIMER_TIME).map(|ms| (ms / 1000.0).round() as i64);
    summary.distance_m = number(message, mesgdef::Session::TOTAL_DISTANCE).map(|cm| cm / 100.0);
    summary.avg_hr = number(message, mesgdef::Session::AVG_HEART_RATE).map(|value| value as i32);
    summary.max_hr = number(message, mesgdef::Session::MAX_HEART_RATE).map(|value| value as i32);
}

fn read_lap(message: &Message, index: i32) -> Option<WorkoutLap> {
    let start = timestamp(message, mesgdef::Lap::START_TIME)?;
    let elapsed = number(message, mesgdef::Lap::TOTAL_ELAPSED_TIME)
        .map(|ms| (ms / 1000.0).round() as i64)
        .or_else(|| timestamp(message, mesgdef::Lap::TIMESTAMP).map(|end| end - start))?;
    Some(WorkoutLap {
        index,
        start_time: unix_time(start)?,
        end_time: unix_time(start + elapsed.max(0))?,
        distance_m: number(message, mesgdef::Lap::TOTAL_DISTANCE).map_or(0.0, |cm| cm / 100.0),
        duration_seconds: elapsed.max(0),
        avg_hr: number(message, mesgdef::Lap::AVG_HEART_RATE).map(|value| value as i32),
        max_hr: number(message, mesgdef::Lap::MAX_HEART_RATE).map(|value| value as i32),
    })
}

/// timer stop → 下一个 start 之间就是一段暂停；最后那个 stop 是结束，不是暂停。
fn pauses_from_timer_events(events: &mut [(i64, bool)], end_unix: i64) -> Vec<PauseInterval> {
    events.sort_by_key(|(at, is_start)| (*at, *is_start));
    let mut pauses = Vec::new();
    let mut stopped_at: Option<i64> = None;
    for &(at, is_start) in events.iter() {
        match (is_start, stopped_at) {
            (false, None) => stopped_at = Some(at),
            (true, Some(stop)) => {
                if at > stop && at <= end_unix {
                    if let (Some(start_time), Some(end_time)) = (unix_time(stop), unix_time(at)) {
                        pauses.push(PauseInterval {
                            start_time,
                            end_time,
                            kind: "manual".into(),
                        });
                    }
                }
                stopped_at = None;
            }
            _ => {}
        }
    }
    pauses
}

fn field(message: &Message, num: u8) -> Option<&FitValue> {
    message
        .fields
        .iter()
        .find(|field| field.num == num)
        .map(|field| &field.value)
}

/// 无符号数值字段，基础类型的无效哨兵当作没有。
fn number(message: &Message, num: u8) -> Option<f64> {
    match field(message, num)? {
        FitValue::Uint8(value) if *value != u8::MAX => Some(f64::from(*value)),
        FitValue::Uint16(value) if *value != u16::MAX => Some(f64::from(*value)),
        FitValue::Uint32(value) if *value != u32::MAX => Some(f64::from(*value)),
        FitValue::Int8(value) if *value != i8::MAX => Some(f64::from(*value)),
        FitValue::Int16(value) if *value != i16::MAX => Some(f64::from(*value)),
        FitValue::Int32(value) if *value != i32::MAX => Some(f64::from(*value)),
        FitValue::Float32(value) if value.is_finite() => Some(f64::from(*value)),
        FitValue::Float64(value) if value.is_finite() => Some(*value),
        _ => None,
    }
}

fn signed(message: &Message, num: u8) -> Option<i64> {
    match field(message, num)? {
        FitValue::Int32(value) if *value != i32::MAX => Some(i64::from(*value)),
        FitValue::Uint32(value) if *value != u32::MAX => Some(i64::from(*value as i32)),
        _ => None,
    }
}

fn timestamp(message: &Message, num: u8) -> Option<i64> {
    match field(message, num)? {
        FitValue::Uint32(value) if *value != u32::MAX => Some(i64::from(*value) + FIT_EPOCH_OFFSET),
        _ => None,
    }
}

fn unix_time(unix: i64) -> Option<DateTime<Utc>> {
    Utc.timestamp_opt(unix, 0).single()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    /// 用我们自己的 FIT 写出端造一份文件，再读回来：暂停、距离、心率都得原样回来。
    #[test]
    fn a_file_we_wrote_reads_back_with_pauses_and_distance() {
        let export = json!({ "data": { "workouts": [{
            "workout_id": "1700000000",
            "workout_type": "running",
            "effective_type": "running",
            "start_time": "2023-11-14T22:13:20+00:00",
            "end_time": "2023-11-14T22:15:00+00:00",
            "distance_meters": 300.0,
            "samples": [
                { "timestamp": "2023-11-14T22:13:20+00:00", "heart_rate": 120, "speed": 3.0, "distance_m": 0.0 },
                { "timestamp": "2023-11-14T22:13:50+00:00", "heart_rate": 130, "speed": 3.0, "distance_m": 90.0 },
                { "timestamp": "2023-11-14T22:14:40+00:00", "heart_rate": 140, "speed": 3.0, "distance_m": 240.0 },
                { "timestamp": "2023-11-14T22:15:00+00:00", "heart_rate": 150, "speed": 3.0, "distance_m": 300.0 }
            ],
            "pauses": [{
                "start_time": "2023-11-14T22:14:00+00:00",
                "end_time": "2023-11-14T22:14:20+00:00",
                "kind": "manual"
            }]
        }]}});
        let (files, _) = super::super::to_fit(&export).unwrap();
        let imported = decode_fit_file(&files[0].1).unwrap();
        let decoded = &imported.decoded;
        assert_eq!(decoded.start_time.timestamp(), 1_700_000_000);
        assert_eq!(decoded.pauses.len(), 1);
        assert_eq!(
            (decoded.pauses[0].end_time - decoded.pauses[0].start_time).num_seconds(),
            20
        );
        let distances: Vec<f64> = decoded
            .samples
            .iter()
            .filter_map(|s| s.distance_m)
            .collect();
        assert_eq!(distances, vec![0.0, 90.0, 240.0, 300.0]);
        assert_eq!(imported.summary.distance_m, Some(300.0));
        assert!(decoded.samples.iter().any(|s| s.heart_rate == Some(150)));
    }

    #[test]
    fn something_that_is_not_fit_is_refused() {
        assert_eq!(
            decode_fit_file(b"<gpx></gpx>").unwrap_err(),
            FitImportError::NotFit
        );
    }
}
