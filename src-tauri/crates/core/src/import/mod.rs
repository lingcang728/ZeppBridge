//! 从别处导入运动（批次 7）：GPX、FIT、Strava 的整包导出、Apple 健康的导出。
//!
//! 导入的运动混进运动列表，界面标出来源；**不进 Zepp 同步**，也不回传云端。它们是
//! 用户自己带进来的东西，和打分、跑鞋一样：重放不碰（重放只按 `raw_record_id` 删），
//! 保留期清理也不碰。每次导入是一批，可以整批撤销（`storage::imports`）。
//!
//! 不编数据：文件里没有心率就没有心率；GPX 没有速度就不算逐点速度（GPS 差分抖得厉害，
//! 画出来是假的平滑），只给累计距离——公里分段从累计距离切，和 FIT 导入同一套。
//! 读不懂的条目照实数出来（`unreadable`），不猜。

pub mod apple;
pub mod gpx;
pub mod strava;
mod xml;

#[cfg(test)]
mod tests;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

use crate::decoder::{splits_from_cumulative_distance, DecodedWorkout, RoutePoint, WorkoutSample};

/// 一份文件的大小上限。Apple 健康的导出动辄上 GB，那条路是边读边解析，不受这个限制。
pub const MAX_IMPORT_FILE_BYTES: u64 = 64 * 1024 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ImportSource {
    Gpx,
    Fit,
    Strava,
    AppleHealth,
}

impl ImportSource {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Gpx => "gpx",
            Self::Fit => "fit",
            Self::Strava => "strava",
            Self::AppleHealth => "apple_health",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "gpx" => Some(Self::Gpx),
            "fit" => Some(Self::Fit),
            "strava" => Some(Self::Strava),
            "apple_health" => Some(Self::AppleHealth),
            _ => None,
        }
    }
}

/// 读出来的一次运动。缺什么就是 `None`。
#[derive(Debug, Clone)]
pub struct ParsedActivity {
    /// 运动目录里的 key（`run`、`ride`……）；认不出来是 `activity`。
    pub sport: String,
    pub start_time: DateTime<Utc>,
    pub end_time: DateTime<Utc>,
    pub distance_m: Option<f64>,
    pub moving_seconds: Option<i64>,
    pub calories: Option<i32>,
    pub avg_hr: Option<i32>,
    pub max_hr: Option<i32>,
    pub elevation_gain_m: Option<f64>,
    /// 逐点序列和轨迹；只有汇总的（比如 Apple 健康里没有路线的力量训练）是 `None`。
    pub decoded: Option<DecodedWorkout>,
    /// 文件里写的名字（Strava 的活动名、GPX 的 `<name>`），只用来显示。
    pub name: Option<String>,
}

/// 一次读文件的结果。
#[derive(Debug, Clone, Default)]
pub struct ParsedFile {
    pub activities: Vec<ParsedActivity>,
    /// 读不懂、或者格式不支持的条目数。
    pub unreadable: usize,
}

/// 一个轨迹点。GPX 与 TCX 都先读成这个。
#[derive(Debug, Clone, Default)]
pub(crate) struct TrackPoint {
    pub time: Option<DateTime<Utc>>,
    pub latitude: Option<f64>,
    pub longitude: Option<f64>,
    pub altitude_m: Option<f64>,
    pub heart_rate: Option<i32>,
    pub cadence: Option<f64>,
    pub power_watts: Option<f64>,
    /// TCX 自己带的累计距离。GPX 没有，按坐标算。
    pub distance_m: Option<f64>,
}

/// 地球表面两点间距离（米），半正矢公式。
pub(crate) fn haversine_m(a: (f64, f64), b: (f64, f64)) -> f64 {
    const R: f64 = 6_371_000.0;
    let (lat1, lat2) = (a.0.to_radians(), b.0.to_radians());
    let dlat = lat2 - lat1;
    let dlon = (b.1 - a.1).to_radians();
    let h = (dlat / 2.0).sin().powi(2) + lat1.cos() * lat2.cos() * (dlon / 2.0).sin().powi(2);
    2.0 * R * h.sqrt().asin()
}

/// 一串带时间的点 → 一次运动。没有带时间的点就读不出运动（不知道哪天）。
pub(crate) fn activity_from_track(
    points: Vec<TrackPoint>,
    sport: String,
    name: Option<String>,
) -> Option<ParsedActivity> {
    let mut points: Vec<TrackPoint> = points.into_iter().filter(|p| p.time.is_some()).collect();
    points.sort_by_key(|p| p.time);
    let start_time = points.first()?.time?;
    let end_time = points.last()?.time?;
    if end_time <= start_time {
        return None;
    }

    let mut samples = Vec::with_capacity(points.len());
    let mut route = Vec::new();
    let mut distances: BTreeMap<i64, f64> = BTreeMap::new();
    let mut walked = 0.0;
    let mut last_fix: Option<(f64, f64)> = None;
    let has_own_distance = points.iter().any(|p| p.distance_m.is_some());
    let mut gain = 0.0;
    let mut last_altitude: Option<f64> = None;
    for point in &points {
        let time = point.time?;
        let fix = point.latitude.zip(point.longitude).filter(|(lat, lon)| {
            lat.is_finite() && lon.is_finite() && lat.abs() <= 90.0 && lon.abs() <= 180.0
        });
        if let Some((latitude, longitude)) = fix {
            if let Some(previous) = last_fix {
                walked += haversine_m(previous, (latitude, longitude));
            }
            last_fix = Some((latitude, longitude));
            route.push(RoutePoint {
                timestamp: time,
                latitude,
                longitude,
                altitude_m: point.altitude_m,
            });
        }
        let distance = if has_own_distance {
            point.distance_m
        } else {
            last_fix.map(|_| walked)
        };
        if let Some(distance) = distance {
            distances.insert(time.timestamp(), distance);
        }
        // 爬升按 1 米噪声底累计，和解码云端明细同一个口径。
        if let Some(altitude) = point.altitude_m {
            match last_altitude {
                Some(previous) if altitude - previous >= 1.0 => {
                    gain += altitude - previous;
                    last_altitude = Some(altitude);
                }
                Some(previous) if previous - altitude >= 1.0 => last_altitude = Some(altitude),
                None => last_altitude = Some(altitude),
                _ => {}
            }
        }
        samples.push(WorkoutSample {
            timestamp: time,
            heart_rate: point.heart_rate.filter(|hr| (25..=250).contains(hr)),
            speed: None,
            pace: None,
            cadence: point.cadence,
            stride_cm: None,
            altitude_m: point.altitude_m,
            power_watts: point.power_watts,
            ground_contact_ms: None,
            vertical_oscillation_mm: None,
            vertical_ratio_pct: None,
            equivalent_pace_s_per_km: None,
            distance_m: distance,
        });
    }
    let heart: Vec<i32> = samples.iter().filter_map(|s| s.heart_rate).collect();
    let distance_m = distances.values().next_back().copied().filter(|d| *d > 0.0);
    let splits = splits_from_cumulative_distance(&samples, &distances);
    let has_altitude = last_altitude.is_some();
    Some(ParsedActivity {
        sport,
        start_time,
        end_time,
        distance_m,
        moving_seconds: None,
        calories: None,
        avg_hr: (!heart.is_empty())
            .then(|| (heart.iter().map(|hr| *hr as i64).sum::<i64>() / heart.len() as i64) as i32),
        max_hr: heart.iter().copied().max(),
        elevation_gain_m: has_altitude.then_some((gain * 10.0).round() / 10.0),
        decoded: Some(DecodedWorkout {
            track_id: start_time.timestamp(),
            source: Some("import".into()),
            start_time,
            end_time,
            route,
            route_dropped_points: 0,
            samples,
            pauses: Vec::new(),
            splits,
            laps: Vec::new(),
        }),
        name,
    })
}

/// FIT 文件 → 一次运动。
pub fn activity_from_fit(bytes: &[u8]) -> Option<ParsedActivity> {
    let fit = crate::export_fit::decode_fit_file(bytes).ok()?;
    let summary = fit.summary;
    Some(ParsedActivity {
        sport: fit.sport.map_or("activity", fit_sport).to_string(),
        start_time: fit.decoded.start_time,
        end_time: fit.decoded.end_time,
        distance_m: summary.distance_m,
        moving_seconds: summary.moving_seconds,
        calories: None,
        avg_hr: summary.avg_hr,
        max_hr: summary.max_hr,
        elevation_gain_m: None,
        decoded: Some(fit.decoded),
        name: None,
    })
}

/// FIT `sport` 枚举 → 运动目录 key。只认常见的几种，其余是 `activity`，用户可以再改。
pub fn fit_sport(code: u8) -> &'static str {
    match code {
        1 => "run",
        2 => "ride",
        4 => "indoor_fitness",
        5 => "pool_swimming",
        10 => "free_training",
        11 => "walking",
        12 => "cross_country_skiing",
        15 => "rowing",
        17 => "hiking",
        21 => "e_bike",
        _ => "activity",
    }
}

/// 文字的运动类型（GPX `<type>`、Strava 的「活动类型」、TCX 的 `Sport`）→ 运动目录 key。
pub fn text_sport(value: &str) -> &'static str {
    let key: String = value
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .flat_map(|c| c.to_lowercase())
        .collect();
    match key.as_str() {
        "run" | "running" | "9" => "run",
        "trailrun" | "trailrunning" => "trail_running",
        "virtualrun" | "treadmill" => "treadmill",
        "ride" | "biking" | "cycling" | "bike" | "gravelride" | "1" => "ride",
        "virtualride" | "indoorcycling" => "indoor_cycling",
        "mountainbikeride" | "mountainbiking" => "mountain_biking",
        "ebikeride" | "ebike" => "e_bike",
        "walk" | "walking" | "10" => "walking",
        "hike" | "hiking" | "4" => "hiking",
        "swim" | "swimming" => "pool_swimming",
        "weighttraining" | "strengthtraining" | "strength" => "strength",
        "workout" | "other" => "free_training",
        "yoga" => "yoga",
        "pilates" => "pilates",
        "rowing" => "rowing",
        "elliptical" => "elliptical",
        "nordicski" | "crosscountryskiing" => "cross_country_skiing",
        "hiit" | "highintensityintervaltraining" => "hiit",
        "kayaking" => "kayaking",
        "rockclimbing" | "rockclimb" => "rock_climbing",
        "soccer" | "football" => "soccer",
        "tennis" => "tennis",
        "badminton" => "badminton",
        "basketball" => "basketball",
        _ => "activity",
    }
}

#[derive(Debug, thiserror::Error)]
pub enum ImportReadError {
    #[error("文件超过大小上限")]
    TooLarge,
    #[error("不是这种来源的文件")]
    NotRecognized,
    #[error(transparent)]
    Io(#[from] std::io::Error),
}

/// 按来源读一份本机文件。GPX 来源也收 TCX；Apple 健康收 `export.zip` 或解压出来的 `export.xml`。
pub fn read_import_file(
    source: ImportSource,
    path: &std::path::Path,
) -> Result<ParsedFile, ImportReadError> {
    use std::io::{BufReader, Read};
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().to_ascii_lowercase())
        .unwrap_or_default();
    let file = std::fs::File::open(path)?;
    let read_small = |file: std::fs::File| -> Result<Vec<u8>, ImportReadError> {
        if file.metadata()?.len() > MAX_IMPORT_FILE_BYTES {
            return Err(ImportReadError::TooLarge);
        }
        let mut bytes = Vec::new();
        file.take(MAX_IMPORT_FILE_BYTES).read_to_end(&mut bytes)?;
        Ok(bytes)
    };
    let parsed = match source {
        ImportSource::Gpx | ImportSource::Fit => {
            let stem = name.strip_suffix(".gz").unwrap_or(&name);
            let fits = match source {
                ImportSource::Fit => stem.ends_with(".fit"),
                _ => stem.ends_with(".gpx") || stem.ends_with(".tcx"),
            };
            if !fits {
                return Err(ImportReadError::NotRecognized);
            }
            strava::parse_activity_file(&name, &read_small(file)?, None)
        }
        ImportSource::Strava => strava::parse_strava_archive(BufReader::new(file))
            .ok_or(ImportReadError::NotRecognized)?,
        ImportSource::AppleHealth if name.ends_with(".xml") => apple::parse_apple_xml(file),
        ImportSource::AppleHealth => apple::parse_apple_archive(BufReader::new(file))
            .ok_or(ImportReadError::NotRecognized)?,
    };
    Ok(parsed)
}
