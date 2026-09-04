use crate::models::{error::*, *};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use chrono::{DateTime, Duration, NaiveDate, Utc};
use serde_json::{Map, Value};
use std::collections::BTreeMap;

/// Normalization output with diagnostics and an explicit capability state.
/// The compatibility helpers below return only `records`, but never turn an
/// empty or unrecognised response into a successful empty result.
#[derive(Debug, Clone)]
pub struct NormalizedBatch<T> {
    pub records: Vec<T>,
    pub diagnostics: Vec<String>,
    pub capability: CapabilityStatus,
}

#[derive(Debug, Clone)]
pub struct BandNormalizedData {
    pub sleep_sessions: Vec<SleepSession>,
    pub heart_rate_samples: Vec<MetricSample>,
    pub daily_metrics: Vec<DailyMetric>,
    pub diagnostics: Vec<String>,
    pub capability: CapabilityStatus,
}

impl<T> NormalizedBatch<T> {
    fn into_result(self, stream: &str) -> Result<Vec<T>> {
        let NormalizedBatch {
            records,
            diagnostics,
            capability,
        } = self;
        let _capability = capability;
        if records.is_empty() {
            let detail = if diagnostics.is_empty() {
                "响应没有可识别记录".to_owned()
            } else {
                diagnostics.join("; ")
            };
            return Err(ZeppBridgeError::DataUnavailable(format!(
                "{stream}: {detail}"
            )));
        }
        Ok(records)
    }
}

pub struct Normalizer;

impl Normalizer {
    pub fn normalize_heart_rate(raw: &Value) -> Result<Vec<MetricSample>> {
        Self::normalize_heart_rate_with_diagnostics(raw)?.into_result("heart_rate")
    }

    pub fn normalize_heart_rate_with_diagnostics(
        raw: &Value,
    ) -> Result<NormalizedBatch<MetricSample>> {
        let items = extract_items(raw)?;
        let mut records = Vec::new();
        let mut diagnostics = Vec::new();
        for (index, item) in items.iter().enumerate() {
            let object = item_object(item);
            let timestamp = object
                .and_then(|o| first_value(o, &["timestamp", "time", "timeStamp", "startTime"]))
                .and_then(parse_timestamp);
            let value = object
                .and_then(|o| first_value(o, &["value", "heartRate", "heart_rate", "hr"]))
                .and_then(parse_number);
            let (Some(timestamp), Some(value)) = (timestamp, value) else {
                diagnostics.push(format!("item {index}: 缺少 timestamp/value"));
                continue;
            };
            if !value.is_finite() || !(0.0..=300.0).contains(&value) {
                diagnostics.push(format!("item {index}: heart rate 数值无效"));
                continue;
            }
            let device_id = object.and_then(device_id);
            records.push(MetricSample {
                metric: "heart_rate".into(),
                timestamp,
                value,
                unit: "bpm".into(),
                source_scope: source_scope(object, device_id.as_deref()),
                device_id,
            });
        }
        Ok(NormalizedBatch {
            records,
            diagnostics,
            capability: CapabilityStatus::Verified,
        })
    }

    #[allow(dead_code)]
    pub fn normalize_sleep(raw: &Value) -> Result<Vec<SleepSession>> {
        Self::normalize_sleep_with_diagnostics(raw)?.into_result("sleep")
    }

    #[allow(dead_code)]
    pub fn normalize_sleep_with_diagnostics(raw: &Value) -> Result<NormalizedBatch<SleepSession>> {
        let band = Self::normalize_band_data(raw)?;
        Ok(NormalizedBatch {
            records: band.sleep_sessions,
            diagnostics: band.diagnostics,
            capability: band.capability,
        })
    }

    pub fn normalize_band_data(raw: &Value) -> Result<BandNormalizedData> {
        let items = extract_items(raw)?;
        let mut sleep_sessions = Vec::new();
        let mut heart_rate_samples = Vec::new();
        let mut daily_metrics = Vec::new();
        let mut diagnostics = Vec::new();

        for (index, item) in items.iter().enumerate() {
            let Some(object) = item.as_object() else {
                diagnostics.push(format!("item {index}: 不是对象"));
                continue;
            };
            let source_device = device_id(object);
            let source_scope = if source_device.is_some() {
                SourceScope::Device
            } else {
                SourceScope::Unknown
            };

            let decoded_summary =
                object
                    .get("summary")
                    .and_then(Value::as_str)
                    .and_then(|encoded| match decode_base64_json(encoded) {
                        Ok(value) => Some(value),
                        Err(error) => {
                            diagnostics.push(format!("item {index}: summary 解码失败: {error}"));
                            None
                        }
                    });

            if let Some(summary) = decoded_summary.as_ref().and_then(Value::as_object) {
                if let Some(sleep) = summary.get("slp").and_then(Value::as_object) {
                    match sleep_from_band_item(object, summary, sleep, source_scope.clone()) {
                        Ok(session) => sleep_sessions.push(session),
                        Err(message) => diagnostics.push(format!("item {index}: {message}")),
                    }
                }
                daily_metrics.extend(daily_metrics_from_band_summary(
                    object,
                    summary,
                    source_scope.clone(),
                ));
            } else if let Some(session) = sleep_from_flat_object(object) {
                sleep_sessions.push(session);
            }

            match heart_rate_from_band_item(object, decoded_summary.as_ref()) {
                Ok(samples) => heart_rate_samples.extend(samples),
                Err(message) => diagnostics.push(format!("item {index}: {message}")),
            }
        }

        let capability = if sleep_sessions.is_empty()
            && heart_rate_samples.is_empty()
            && daily_metrics.is_empty()
        {
            CapabilityStatus::Unverified
        } else {
            CapabilityStatus::Verified
        };

        Ok(BandNormalizedData {
            sleep_sessions,
            heart_rate_samples,
            daily_metrics,
            diagnostics,
            capability,
        })
    }

    #[allow(dead_code)]
    pub fn normalize_workouts(raw: &Value) -> Result<Vec<Workout>> {
        Self::normalize_workouts_with_sport(raw, None)
    }

    pub fn normalize_workouts_with_sport(raw: &Value, sport: Option<&str>) -> Result<Vec<Workout>> {
        Self::normalize_workouts_with_diagnostics_and_sport(raw, sport)?.into_result("workouts")
    }

    #[allow(dead_code)]
    pub fn normalize_workouts_with_diagnostics(raw: &Value) -> Result<NormalizedBatch<Workout>> {
        Self::normalize_workouts_with_diagnostics_and_sport(raw, None)
    }

    fn normalize_workouts_with_diagnostics_and_sport(
        raw: &Value,
        _sport: Option<&str>,
    ) -> Result<NormalizedBatch<Workout>> {
        let items = extract_items(raw)?;
        let mut records = Vec::new();
        let mut diagnostics = Vec::new();
        for (index, item) in items.iter().enumerate() {
            let Some(object) = item_object(item) else {
                diagnostics.push(format!("item {index}: 不是对象"));
                continue;
            };
            let start = first_value(object, &["start_time", "startTime", "beginTime", "trackid"])
                .and_then(parse_timestamp);
            let end = first_value(object, &["end_time", "endTime", "finishTime"])
                .and_then(parse_timestamp);
            let (Some(start_time), Some(end_time)) = (start, end) else {
                diagnostics.push(format!("item {index}: 缺少 workout start/end"));
                continue;
            };
            if end_time <= start_time {
                diagnostics.push(format!("item {index}: workout end 不晚于 start"));
                continue;
            }
            // The endpoint path is fetch provenance, not type evidence.
            // `/v1/sport/run/history.json` can return every activity, so using
            // `sport == run` here silently relabels unknown strength/custom
            // codes as outdoor runs. Keep unknown numeric facts explicit.
            let zepp_type =
                first_number(object, &["type", "sport_mode"]).map(|value| value.round() as i32);
            let explicit_type = first_string(
                object,
                &[
                    "workout_type",
                    "sportType",
                    "sport_title",
                    "sportTitle",
                    "sport_name",
                    "sportName",
                ],
            );
            let (workout_type, type_source) = if let Some(code) = zepp_type {
                match zepp_sport_type_name(i64::from(code)) {
                    Some(mapped) => (mapped.to_owned(), "numeric_mapped".to_owned()),
                    None => match explicit_type {
                        Some(value) => (normalize_type_text(&value), "string_field".to_owned()),
                        None => (format!("unknown:{code}"), "unknown_code".to_owned()),
                    },
                }
            } else if let Some(value) = explicit_type {
                (normalize_type_text(&value), "string_field".to_owned())
            } else {
                ("unknown".to_owned(), "missing".to_owned())
            };
            let workout_id = first_string(
                object,
                &["workout_id", "workoutId", "trackId", "trackid", "id"],
            )
            .unwrap_or_else(|| {
                // Stable fallback for responses that omit an official id.
                format!(
                    "{workout_type}:{}:{}",
                    start_time.timestamp(),
                    end_time.timestamp()
                )
            });
            let source_device = device_id(object);
            records.push(Workout {
                workout_id,
                workout_type: workout_type.clone(),
                normalized_type: workout_type.clone(),
                type_source,
                user_override: None,
                effective_type: workout_type,
                custom_label: None,
                start_time,
                end_time,
                distance_meters: first_number(
                    object,
                    &["distance_meters", "distanceMeters", "distance", "dis"],
                ),
                calories: first_number(object, &["calories", "calorie"]).map(|v| v as i32),
                avg_hr: first_number(
                    object,
                    &["avg_hr", "avgHr", "averageHeartRate", "avg_heart_rate"],
                )
                .map(|v| v as i32),
                max_hr: first_number(
                    object,
                    &["max_hr", "maxHr", "maximumHeartRate", "max_heart_rate"],
                )
                .map(|v| v as i32),
                // Zepp reports "not measured" as a negative sentinel, and only
                // running-type activities produce VO2 max at all: `-1` covers
                // 103 of 172 local workouts. Keeping it would hand downstream
                // readers a fabricated number, so it becomes null; the raw
                // payload still holds the original value.
                training_load: first_number(
                    object,
                    &[
                        "training_load",
                        "trainingLoad",
                        "trainLoad",
                        "exercise_load",
                    ],
                )
                .filter(|value| *value >= 0.0),
                vo2max: first_number(object, &["vo2max", "vo2Max", "VO2_MAX", "VO2_max"])
                    .filter(|value| *value > 0.0),
                // 下面这些字段云端一直在给，只是以前一个都没取。每一个的
                // 「没测到」哨兵不一样，所以逐个写清楚，不共用一条规则。
                min_hr: first_number(object, &["min_heart_rate", "minHeartRate", "min_hr"])
                    .filter(|value| *value > 0.0)
                    .map(|value| value as i32),
                // 0 步对骑行来说是事实，对健走来说是「没测到」。分不开，所以
                // 一律只收正数——真的 0 步的运动也没有什么可展示的。
                total_steps: first_number(object, &["total_step", "totalStep", "steps"])
                    .filter(|value| *value > 0.0)
                    .map(|value| value as i32),
                moving_seconds: first_number(object, &["run_time", "runTime", "sportTime"])
                    .filter(|value| *value > 0.0)
                    .map(|value| value as i64),
                // 云端给两套：`elevationGain` 是厘米，`altitude_ascend` 是取整
                // 的米。优先厘米那份，它没被提前四舍五入。
                elevation_gain_m: first_number(object, &["elevationGain", "elevation_gain"])
                    .filter(|value| *value >= 0.0)
                    .map(|value| value / 100.0)
                    .or_else(|| {
                        first_number(object, &["altitude_ascend", "altitudeAscend"])
                            .filter(|value| *value >= 0.0)
                    }),
                elevation_loss_m: first_number(object, &["elevationLoss", "elevation_loss"])
                    .filter(|value| *value >= 0.0)
                    .map(|value| value / 100.0)
                    .or_else(|| {
                        first_number(object, &["altitude_descend", "altitudeDescend"])
                            .filter(|value| *value >= 0.0)
                    }),
                // 海拔同样是厘米。实测对得上解析出来的逐秒序列：一次健走
                // `highestAltitude` 9178 cm，序列最大值 91.78 m。
                max_altitude_m: first_number(object, &["highestAltitude", "max_altitude"])
                    .filter(|value| value.is_finite())
                    .map(|value| value / 100.0),
                min_altitude_m: first_number(object, &["lowestAltitude", "min_altitude"])
                    .filter(|value| value.is_finite())
                    .map(|value| value / 100.0),
                // 训练效果存的是十倍整数：22 表示 2.2。
                training_effect: first_number(object, &["te", "trainingEffect"])
                    .filter(|value| *value > 0.0)
                    .map(|value| value / 10.0),
                anaerobic_training_effect: first_number(
                    object,
                    &["anaerobic_te", "anaerobicTrainingEffect"],
                )
                .filter(|value| *value > 0.0)
                .map(|value| value / 10.0),
                rpe: first_number(object, &["rpe"])
                    .filter(|value| *value > 0.0)
                    .map(|value| value as i32),
                // 步频单位是步/分，和云端的 `max_frequency` / `avg_stride_length`
                // 对过账，见 export_fit 里那张表。
                avg_cadence_spm: first_number(object, &["avg_frequency", "avgFrequency"])
                    .filter(|value| *value > 0.0),
                max_cadence_spm: first_number(object, &["max_frequency", "maxFrequency"])
                    .filter(|value| *value > 0.0),
                avg_stride_cm: first_number(object, &["avg_stride_length", "avgStrideLength"])
                    .filter(|value| *value > 0.0),
                hr_zones: parse_heart_range(first_string(object, &["heart_range"]).as_deref()),
                source_scope: source_scope(Some(object), source_device.as_deref()),
                device_id: source_device,
                synced_at: None,
                // geohash `location` 不是轨迹。history 摘要没有 lat/lon 点。
                gps_available: workout_has_track_geometry(object),
                sample_count: workout_sample_count(object),
                zepp_source: first_string(object, &["source"]),
                zepp_type,
            });
        }
        Ok(NormalizedBatch {
            records,
            diagnostics,
            capability: CapabilityStatus::Verified,
        })
    }

    pub fn normalize_hrv(raw: &Value) -> Result<Vec<MetricSample>> {
        Self::normalize_hrv_with_diagnostics(raw)?.into_result("hrv")
    }

    pub fn normalize_hrv_with_diagnostics(raw: &Value) -> Result<NormalizedBatch<MetricSample>> {
        let items = extract_items(raw)?;
        let mut records = Vec::new();
        let mut diagnostics = Vec::new();
        for (index, item) in items.iter().enumerate() {
            let Some(object) = item_object(item) else {
                diagnostics.push(format!("item {index}: 不是对象"));
                continue;
            };
            if let Some(event_value) = object.get("value").and_then(Value::as_object) {
                if let Some(samples) = event_value.get("samples").and_then(Value::as_array) {
                    let base = first_value(event_value, &["startTime", "start_time"])
                        .and_then(parse_timestamp);
                    let source_device = device_id(event_value).or_else(|| device_id(object));
                    for (sample_index, sample) in samples.iter().enumerate() {
                        let Some(sample) = sample.as_object() else {
                            diagnostics
                                .push(format!("item {index} sample {sample_index}: 不是对象"));
                            continue;
                        };
                        let timestamp = first_value(sample, &["timestamp", "time"])
                            .and_then(parse_timestamp)
                            .or_else(|| {
                                let offset_ms = first_number(sample, &["s", "offset"])? as i64;
                                base.map(|value| value + Duration::milliseconds(offset_ms))
                            });
                        let hrv = first_value(sample, &["sdnn", "rmssd", "hrv", "value"])
                            .and_then(parse_number);
                        let (Some(timestamp), Some(sample_value)) = (timestamp, hrv) else {
                            diagnostics.push(format!(
                                "item {index} sample {sample_index}: 缺少 HRV timestamp/value"
                            ));
                            continue;
                        };
                        if sample_value.is_finite() && sample_value >= 0.0 {
                            records.push(MetricSample {
                                metric: "hrv".into(),
                                timestamp,
                                value: sample_value,
                                unit: "ms".into(),
                                source_scope: source_scope(
                                    Some(event_value),
                                    source_device.as_deref(),
                                ),
                                device_id: source_device.clone(),
                            });
                        }
                    }
                    continue;
                }
            }
            let timestamp = first_value(object, &["timestamp", "time", "date", "dayId"])
                .and_then(parse_timestamp_or_date);
            let value =
                first_value(object, &["value", "hrv", "sdnn", "rmssd"]).and_then(parse_number);
            let (Some(timestamp), Some(value)) = (timestamp, value) else {
                diagnostics.push(format!("item {index}: 缺少 HRV timestamp/value"));
                continue;
            };
            if !value.is_finite() || value < 0.0 {
                diagnostics.push(format!("item {index}: HRV 数值无效"));
                continue;
            }
            let source_device = device_id(object);
            records.push(MetricSample {
                metric: "hrv".into(),
                timestamp,
                value,
                unit: "ms".into(),
                source_scope: source_scope(Some(object), source_device.as_deref()),
                device_id: source_device,
            });
        }
        Ok(NormalizedBatch {
            records,
            diagnostics,
            capability: CapabilityStatus::Verified,
        })
    }

    pub fn normalize_daily_summary(raw: &Value) -> Result<Vec<DailyMetric>> {
        Self::normalize_daily_summary_with_diagnostics(raw)?.into_result("daily_summary")
    }

    pub fn normalize_daily_summary_with_diagnostics(
        raw: &Value,
    ) -> Result<NormalizedBatch<DailyMetric>> {
        let items = extract_items(raw)?;
        let mut indexed_items = items.iter().enumerate().collect::<Vec<_>>();
        indexed_items.sort_by_key(|(_, item)| {
            item.as_object()
                .and_then(|object| first_number(object, &["timestamp", "time", "startTime"]))
                .map(|value| value.round() as i64)
                .unwrap_or(0)
        });
        let mut records = Vec::new();
        let mut diagnostics = Vec::new();
        for (index, item) in indexed_items {
            let Some(object) = item.as_object() else {
                diagnostics.push(format!("item {index}: 不是对象"));
                continue;
            };
            let event_value = object.get("value").and_then(Value::as_object);
            let mut item_count = 0usize;
            let event_type = first_string(object, &["eventType"]);
            if event_type.as_deref() == Some("Charge") {
                if let Some(value) = event_value {
                    item_count += collect_charge_metrics(object, value, &mut records);
                }
            } else if let Some(samples) = event_value
                .and_then(|value| value.get("samples"))
                .and_then(Value::as_array)
            {
                let parent_device = event_value
                    .and_then(device_id)
                    .or_else(|| device_id(object));
                for sample in samples {
                    let Some(sample) = sample.as_object() else {
                        continue;
                    };
                    item_count += collect_daily_metrics(
                        sample,
                        Some(object),
                        parent_device.clone(),
                        &mut records,
                    );
                }
            } else {
                item_count += collect_daily_metrics(
                    object,
                    event_value,
                    event_value
                        .and_then(device_id)
                        .or_else(|| device_id(object)),
                    &mut records,
                );
            }
            if item_count == 0 {
                diagnostics.push(format!("item {index}: 没有已知 daily metric 字段"));
            }
        }
        let mut canonical = BTreeMap::new();
        for record in records {
            let key = (
                record.date.clone(),
                record.metric.clone(),
                record.source_scope.as_str().to_string(),
                record.device_id.clone().unwrap_or_default(),
            );
            canonical.insert(key, record);
        }
        Ok(NormalizedBatch {
            records: canonical.into_values().collect(),
            diagnostics,
            capability: CapabilityStatus::Verified,
        })
    }

    pub fn band_capability(raw: &Value) -> CapabilityStatus {
        Self::normalize_band_data(raw)
            .map(|result| result.capability)
            .unwrap_or(CapabilityStatus::Unverified)
    }
}

/// Zepp 运动摘要的数字 `type` → 规范运动名。
/// 1/6/9/223 已与 Zepp APP 真实记录逐一核对（跑步/健走/骑行/AI 活动）；
/// 8/10/14/23/92 来自社区参考实现；13/22/192 按本地记录动态特征
/// （步频/步幅/配速/心率）推断，新设备编码出现时可再校正。
fn zepp_sport_type_name(type_id: i64) -> Option<&'static str> {
    crate::sport_catalog::resolve(type_id)
}

fn normalize_type_text(value: &str) -> String {
    let normalized = value.trim().to_lowercase().replace([' ', '-'], "_");
    if normalized.is_empty() {
        "unknown".to_owned()
    } else {
        normalized
    }
}

fn sleep_from_band_item(
    item: &Map<String, Value>,
    summary: &Map<String, Value>,
    sleep: &Map<String, Value>,
    scope: SourceScope,
) -> std::result::Result<SleepSession, String> {
    let start_time = first_value(sleep, &["st", "startTime", "start_time"])
        .and_then(parse_timestamp)
        .ok_or_else(|| "睡眠 summary 缺少开始时间".to_string())?;
    let end_time = first_value(sleep, &["ed", "endTime", "end_time"])
        .and_then(parse_timestamp)
        .ok_or_else(|| "睡眠 summary 缺少结束时间".to_string())?;
    if end_time <= start_time {
        return Err("睡眠结束时间不晚于开始时间".to_string());
    }

    let deep_minutes = first_number(sleep, &["dp", "deepMinutes"])
        .map(|value| value.round() as i32)
        .unwrap_or_else(|| band_stage_minutes(sleep, 5));
    let light_minutes = first_number(sleep, &["lt", "lightMinutes"])
        .map(|value| value.round() as i32)
        .unwrap_or_else(|| band_stage_minutes(sleep, 4));
    let awake_minutes = first_number(sleep, &["wk", "awakeMinutes"])
        .map(|value| value.round() as i32)
        .unwrap_or_else(|| band_stage_minutes(sleep, 7));
    let rem_from_field = first_number(sleep, &["rm", "remMinutes", "rem"])
        .map(|value| value.round() as i32)
        .filter(|value| *value >= 0);
    let rem_from_stages = band_stage_minutes(sleep, 8) + band_stage_minutes(sleep, 11);
    let span_minutes = (end_time - start_time).num_minutes().max(0) as i32;
    let rem_minutes = rem_from_field.or_else(|| (rem_from_stages > 0).then_some(rem_from_stages));
    let duration_minutes = (span_minutes - awake_minutes).max(0);
    let source_device = device_id(item)
        .or_else(|| first_string(summary, &["sn"]))
        .filter(|value| !value.is_empty());
    let sleep_id = first_string(item, &["sleep_id", "sleepId", "id"]).unwrap_or_else(|| {
        format!(
            "band:{}:{}:{}",
            source_device.as_deref().unwrap_or("unknown"),
            start_time.timestamp(),
            end_time.timestamp()
        )
    });
    let stages = sleep_stages_from_band(item, summary, sleep);

    Ok(SleepSession {
        sleep_id,
        start_time,
        end_time,
        score: first_number(sleep, &["ss", "score", "sleepScore"])
            .map(|value| value.round() as i32)
            .filter(|value| (0..=100).contains(value)),
        duration_minutes,
        deep_minutes,
        light_minutes,
        rem_minutes,
        awake_minutes,
        source_scope: scope,
        device_id: source_device,
        synced_at: None,
        time_in_bed_minutes: None,
        stages,
        wake_count: first_number(sleep, &["wc", "wakeCount"])
            .map(|value| value.round() as i32)
            .filter(|value| (0..=200).contains(value)),
    })
}

fn sleep_from_flat_object(object: &Map<String, Value>) -> Option<SleepSession> {
    let sleep_id = first_string(object, &["sleep_id", "sleepId", "id", "sessionId"])?;
    let start_time =
        first_value(object, &["start_time", "startTime", "beginTime"]).and_then(parse_timestamp)?;
    let end_time =
        first_value(object, &["end_time", "endTime", "finishTime"]).and_then(parse_timestamp)?;
    if end_time <= start_time {
        return None;
    }
    let awake_minutes = first_number(object, &["awake_minutes", "awakeMinutes", "awake"])
        .map(duration_to_minutes)
        .unwrap_or(0);
    let source_device = device_id(object);
    Some(SleepSession {
        sleep_id,
        start_time,
        end_time,
        score: first_number(object, &["score", "sleepScore"]).map(|value| value as i32),
        duration_minutes: first_number(
            object,
            &["duration_minutes", "durationMinutes", "duration"],
        )
        .map(duration_to_minutes)
        .unwrap_or_else(|| ((end_time - start_time).num_minutes() as i32 - awake_minutes).max(0)),
        deep_minutes: first_number(object, &["deep_minutes", "deepMinutes", "deep"])
            .map(duration_to_minutes)
            .unwrap_or(0),
        light_minutes: first_number(object, &["light_minutes", "lightMinutes", "light"])
            .map(duration_to_minutes)
            .unwrap_or(0),
        rem_minutes: first_number(object, &["rem_minutes", "remMinutes", "rem"])
            .map(duration_to_minutes),
        awake_minutes,
        source_scope: source_scope(Some(object), source_device.as_deref()),
        device_id: source_device,
        synced_at: None,
        time_in_bed_minutes: None,
        stages: Vec::new(),
        wake_count: None,
    })
}

/// 云端 stage mode -> 阶段名。
///
/// 认不出来的返回 `unknown`，**不再返回 `awake`**。原来的写法（`_ =>
/// Some("awake")`，理由是「避免阶段条出现空洞」）意味着：Zepp 以后新增一个
/// mode，或者某款新表产生一个我们还不认识的 mode，ZeppBridge 会明确告诉用户
/// 「你那段时间醒着」。那是替用户编了一个事实，和这个项目「缺失就是缺失，
/// 不生成假零值」的原则直接冲突。
fn sleep_stage_name(mode: i64) -> &'static str {
    match mode {
        5 => "deep",
        4 => "light",
        // 新固件 REM 也会编码为 11
        8 | 11 => "rem",
        7 => "awake",
        _ => "unknown",
    }
}

fn sleep_stages_from_band(
    item: &Map<String, Value>,
    summary: &Map<String, Value>,
    sleep: &Map<String, Value>,
) -> Vec<SleepStageSlice> {
    let Some(date) = first_string(item, &["date_time", "date", "dayId"])
        .and_then(|value| NaiveDate::parse_from_str(&value, "%Y-%m-%d").ok())
    else {
        return Vec::new();
    };
    let timezone_offset = first_number(summary, &["tz"])
        .map(|value| value.round() as i64)
        .unwrap_or(0)
        .clamp(-18 * 3600, 18 * 3600);
    let Some(local_midnight) = date.and_hms_opt(0, 0, 0) else {
        return Vec::new();
    };
    let utc_midnight = DateTime::<Utc>::from_naive_utc_and_offset(
        local_midnight - Duration::seconds(timezone_offset),
        Utc,
    );
    let Some(stages) = sleep.get("stage").and_then(Value::as_array) else {
        return Vec::new();
    };

    let build = |anchor: DateTime<Utc>| -> Vec<SleepStageSlice> {
        stages
            .iter()
            .filter_map(Value::as_object)
            .filter_map(|stage| {
                let mode = first_number(stage, &["mode"])?.round() as i64;
                let name = sleep_stage_name(mode);
                let start = first_number(stage, &["start"])? as i64;
                let stop = first_number(stage, &["stop"])? as i64;
                if stop < start {
                    return None;
                }
                let start_time = anchor + Duration::minutes(start);
                let end_time = anchor + Duration::minutes(stop + 1);
                if end_time <= start_time {
                    return None;
                }
                Some(SleepStageSlice {
                    stage: name.to_string(),
                    start_time,
                    end_time,
                    // 只有认不出来的才留原始码。认识的那四种留着没有信息量。
                    raw_mode: (name == "unknown").then_some(mode),
                })
            })
            .collect()
    };

    // stage.start/stop 是「入睡当夜」本地零点起的分钟数，跨午夜会 >= 1440；
    // 而 date_time 是醒来日。夜间睡眠必须锚到 date_time 前一日的零点，
    // 否则所有阶段整体 +24h（实测数据如此：stage 1460 分 = 醒来日 00:20）。
    // 午睡等按当日零点编码的片段，用与 [st, ed] 的重叠量自动选出当日锚点。
    let session_start =
        first_value(sleep, &["st", "startTime", "start_time"]).and_then(parse_timestamp);
    let session_end = first_value(sleep, &["ed", "endTime", "end_time"]).and_then(parse_timestamp);
    let prev_day = build(utc_midnight - Duration::days(1));
    match (session_start, session_end) {
        (Some(start), Some(end)) => {
            let same_day = build(utc_midnight);
            let overlap = |slices: &[SleepStageSlice]| -> i64 {
                slices
                    .iter()
                    .map(|slice| {
                        let from = slice.start_time.max(start);
                        let to = slice.end_time.min(end);
                        (to - from).num_seconds().max(0)
                    })
                    .sum()
            };
            if overlap(&same_day) > overlap(&prev_day) {
                same_day
            } else {
                prev_day
            }
        }
        _ => prev_day,
    }
}

fn workout_has_track_geometry(object: &Map<String, Value>) -> bool {
    for key in [
        "latitude",
        "longitude",
        "lat",
        "lon",
        "lng",
        "track_points",
        "trackPoints",
        "gps_points",
        "gpsPoints",
        "route",
        "polyline",
    ] {
        match object.get(key) {
            Some(Value::Array(items)) if !items.is_empty() => return true,
            Some(Value::Number(number)) if number.as_f64().is_some_and(|value| value != 0.0) => {
                return true;
            }
            Some(Value::String(text))
                if !text.trim().is_empty() && key != "location" && !text.starts_with("ws") =>
            {
                return true;
            }
            _ => {}
        }
    }
    false
}

fn workout_sample_count(object: &Map<String, Value>) -> i64 {
    for key in [
        "sample_count",
        "sampleCount",
        "hr_samples",
        "heartRateSamples",
        "samples",
    ] {
        match object.get(key) {
            Some(Value::Array(items)) => return items.len() as i64,
            Some(Value::Number(number)) => {
                if let Some(value) = number.as_i64().filter(|value| *value > 0) {
                    return value;
                }
            }
            _ => {}
        }
    }
    0
}

fn band_stage_minutes(sleep: &Map<String, Value>, expected_mode: i64) -> i32 {
    sleep
        .get("stage")
        .and_then(Value::as_array)
        .map(|stages| {
            stages
                .iter()
                .filter_map(Value::as_object)
                .filter(|stage| {
                    first_number(stage, &["mode"])
                        .map(|value| value.round() as i64 == expected_mode)
                        .unwrap_or(false)
                })
                .filter_map(|stage| {
                    let start = first_number(stage, &["start"])? as i64;
                    let stop = first_number(stage, &["stop"])? as i64;
                    (stop >= start).then_some((stop - start + 1) as i32)
                })
                .sum()
        })
        .unwrap_or(0)
}

fn heart_rate_from_band_item(
    item: &Map<String, Value>,
    decoded_summary: Option<&Value>,
) -> std::result::Result<Vec<MetricSample>, String> {
    let Some(encoded) = item.get("data_hr").and_then(Value::as_str) else {
        return Ok(Vec::new());
    };
    let day = first_string(item, &["date_time", "date", "dayId"])
        .and_then(|value| NaiveDate::parse_from_str(&value, "%Y-%m-%d").ok())
        .ok_or_else(|| "data_hr 缺少有效日期".to_string())?;
    let bytes = STANDARD
        .decode(encoded.trim())
        .map_err(|error| format!("data_hr Base64 无效: {error}"))?;
    let timezone_offset = decoded_summary
        .and_then(Value::as_object)
        .and_then(|summary| first_number(summary, &["tz"]))
        .map(|value| value.round() as i64)
        .unwrap_or(0)
        .clamp(-18 * 3600, 18 * 3600);
    let local_midnight = day
        .and_hms_opt(0, 0, 0)
        .ok_or_else(|| "data_hr 日期无法构造".to_string())?;
    let utc_midnight = DateTime::<Utc>::from_naive_utc_and_offset(
        local_midnight - Duration::seconds(timezone_offset),
        Utc,
    );
    let source_device = device_id(item);
    Ok(bytes
        .into_iter()
        .take(1440)
        .enumerate()
        .filter(|(_, value)| (20..=240).contains(value))
        .map(|(minute, value)| MetricSample {
            metric: "heart_rate".into(),
            timestamp: utc_midnight + Duration::minutes(minute as i64),
            value: f64::from(value),
            unit: "bpm".into(),
            source_scope: SourceScope::Device,
            device_id: source_device.clone(),
        })
        .collect())
}

fn daily_metrics_from_band_summary(
    item: &Map<String, Value>,
    summary: &Map<String, Value>,
    scope: SourceScope,
) -> Vec<DailyMetric> {
    let Some(date) = first_string(item, &["date_time", "date", "dayId"])
        .and_then(|value| NaiveDate::parse_from_str(&value, "%Y-%m-%d").ok())
        .map(|value| value.format("%Y-%m-%d").to_string())
    else {
        return Vec::new();
    };
    let source_device = device_id(item);
    let mut metrics = Vec::new();
    if let Some(sleep) = summary.get("slp").and_then(Value::as_object) {
        if let Some(value) =
            first_number(sleep, &["rhr"]).filter(|value| (20.0..=250.0).contains(value))
        {
            metrics.push(DailyMetric {
                date: date.clone(),
                metric: "resting_hr".into(),
                value,
                unit: "bpm".into(),
                source_scope: scope.clone(),
                device_id: source_device.clone(),
            });
        }
    }
    if let Some(activity) = summary.get("stp").and_then(Value::as_object) {
        for (metric, names, unit) in [
            ("steps", &["ttl"][..], "steps"),
            ("active_calories", &["cal"][..], "kcal"),
            ("distance", &["dis"][..], "m"),
        ] {
            if let Some(value) = first_number(activity, names).filter(|value| *value >= 0.0) {
                metrics.push(DailyMetric {
                    date: date.clone(),
                    metric: metric.into(),
                    value,
                    unit: unit.into(),
                    source_scope: scope.clone(),
                    device_id: source_device.clone(),
                });
            }
        }
    }
    metrics
}

fn collect_charge_metrics(
    event: &Map<String, Value>,
    value: &Map<String, Value>,
    records: &mut Vec<DailyMetric>,
) -> usize {
    let Some(date) = summary_date(event, Some(value)) else {
        return 0;
    };
    let Some(samples) = value.get("samples").and_then(Value::as_array) else {
        return 0;
    };
    let latest = samples
        .iter()
        .filter_map(Value::as_object)
        .filter(|sample| {
            first_number(sample, &["total"])
                .map(|score| (0.0..=100.0).contains(&score))
                .unwrap_or(false)
        })
        .max_by_key(|sample| {
            first_number(sample, &["s", "offset"])
                .map(|offset| offset.round() as i64)
                .unwrap_or(0)
        });
    let Some(sample) = latest else {
        return 0;
    };
    let source_device = device_id(value).or_else(|| device_id(event));
    // The event object carries `eventType`; the inner value object does not,
    // and Charge is an account-level aggregate.
    let scope = source_scope(Some(event), source_device.as_deref());
    let mut count = 0;
    for (metric, field) in [
        ("hybrid_charge", "total"),
        ("physical_charge", "physical"),
        ("mental_charge", "mental"),
    ] {
        if let Some(score) = first_number(sample, &[field])
            .filter(|score| score.is_finite() && (0.0..=100.0).contains(score))
        {
            records.push(DailyMetric {
                date: date.clone(),
                metric: metric.into(),
                value: score,
                unit: "score".into(),
                source_scope: scope.clone(),
                device_id: source_device.clone(),
            });
            count += 1;
        }
    }
    count
}

/// `(指标名, 报文里的候选键, 单位, 可信区间)`。
///
/// 单独起个名字是因为 clippy 的 `type_complexity` 不收四元组套二元组，
/// 而这四样缺一不可 —— 尤其是区间：它就是那条「这个字段的哨兵值长什么样」
/// 的规则，每个字段都不一样，共用一条就等于把哨兵当读数写进库。
type SentinelMetricSpec = (
    &'static str,
    &'static [&'static str],
    &'static str,
    (f64, f64),
);

fn collect_daily_metrics(
    object: &Map<String, Value>,
    parent: Option<&Map<String, Value>>,
    source_device: Option<String>,
    records: &mut Vec<DailyMetric>,
) -> usize {
    let Some(date) = summary_date(object, parent) else {
        return 0;
    };
    let scope_source = parent.unwrap_or(object);
    let scope = source_scope(Some(scope_source), source_device.as_deref());
    let metric_fields: [(&str, &[&str], &str); 21] = [
        (
            "steps",
            &["steps", "step", "stepCount", "totalSteps"],
            "steps",
        ),
        (
            "calories",
            &["calories", "calorie", "totalCalories"],
            "kcal",
        ),
        (
            "active_minutes",
            &["activeMinutes", "totalBurningDuration"],
            "min",
        ),
        ("distance", &["distance", "totalDistance"], "m"),
        (
            "resting_hr",
            &["resting_hr", "restingHr", "restingHeartRate", "rhr"],
            "bpm",
        ),
        (
            "readiness",
            &["readiness", "readinessScore", "watchScore", "rdnsScore"],
            "score",
        ),
        ("physical_readiness", &["phyScore"], "score"),
        ("mental_readiness", &["mentScore"], "score"),
        ("hrv_readiness", &["hrvScore"], "score"),
        ("rhr_readiness", &["rhrScore"], "score"),
        ("skin_temp_readiness", &["skinTempScore"], "score"),
        ("afib_readiness", &["afibScore"], "score"),
        ("ahi_readiness", &["ahiScore"], "score"),
        (
            "bio_charge",
            &["bio_charge", "bioCharge", "bodyBattery", "chargeScore"],
            "score",
        ),
        (
            "hybrid_charge",
            &["hybrid_charge", "hybridCharge", "hybridChargeScore"],
            "score",
        ),
        (
            "training_load",
            &[
                "training_load",
                "trainingLoad",
                "wtlSum",
                "currnetDayTrainLoad",
            ],
            "load",
        ),
        (
            "vo2max",
            &[
                "vo2max",
                "vo2Max",
                "VO2_MAX",
                "VO2_max",
                "vo2_max_run",
                "vo2_max_walking",
            ],
            "ml/kg/min",
        ),
        ("stress", &["stress", "stressScore"], "score"),
        ("spo2", &["spo2", "bloodOxygen", "blood_oxygen"], "%"),
        ("running_distance", &["totalRunningDistance"], "m"),
        ("cycling_distance", &["totalCyclingDistance"], "m"),
    ];
    let mut count = 0;
    for (metric, names, unit) in metric_fields {
        if let Some(value) =
            first_number_from(object, parent, names).filter(|value| value.is_finite())
        {
            records.push(DailyMetric {
                date: date.clone(),
                metric: metric.into(),
                value,
                unit: unit.into(),
                source_scope: scope.clone(),
                device_id: source_device.clone(),
            });
            count += 1;
        }
    }

    // 云端汇总里一直有、以前没取出来的那批。
    //
    // 这些不能和上面那张表共用一条 `is_finite()`：这条流用**哨兵值**表示
    // 「没测到」，而每个字段的哨兵不一样。全部是对着本机 25 348 条 readiness
    // 记录数出来的：
    //
    // * `sleepHRV` 实测 44–133，`sleepRHR` 43–75，两个都没出现过哨兵；
    // * `hrvBaseline` / `rhrBaseline` 各有 7 条是 255 —— 这条流里 255 就是
    //   「没测到」（`afibScore` 整整 25 348 条全是 255）；
    // * `ahiBaseline` 有 7 条是 -1，其余落在 0–0.49 之间；
    // * 三个目标值是用户自己设的，0 表示没设，不是「目标是 0 步」。
    //
    // **没收 `phyBaseline` / `mentBaseLine`**：实测它们和 `phyScore` /
    // `mentScore` 在 25 348 条记录里**逐条完全相等**，不是基线，是同一个分数
    // 换了个名字。收进来只会在库里多两列一模一样的数。
    let sentinel_fields: [SentinelMetricSpec; 8] = [
        ("sleep_hrv", &["sleepHRV"], "ms", (1.0, 254.0)),
        ("sleep_rhr", &["sleepRHR"], "bpm", (25.0, 120.0)),
        ("hrv_baseline", &["hrvBaseline"], "ms", (1.0, 254.0)),
        ("rhr_baseline", &["rhrBaseline"], "bpm", (25.0, 120.0)),
        ("ahi_baseline", &["ahiBaseline"], "events/h", (0.0, 100.0)),
        ("step_goal", &["stepGoal"], "steps", (1.0, 100_000.0)),
        ("calorie_goal", &["calorieGoal"], "kcal", (1.0, 10_000.0)),
        (
            "active_minutes_goal",
            &["burningDurationGoal"],
            "min",
            (1.0, 1440.0),
        ),
    ];
    for (metric, names, unit, range) in sentinel_fields {
        if let Some(value) = first_number_from(object, parent, names)
            .filter(|value| value.is_finite() && (range.0..=range.1).contains(value))
        {
            records.push(DailyMetric {
                date: date.clone(),
                metric: metric.into(),
                value,
                unit: unit.into(),
                source_scope: scope.clone(),
                device_id: source_device.clone(),
            });
            count += 1;
        }
    }

    let event_type = parent
        .and_then(|value| first_string(value, &["eventType"]))
        .or_else(|| first_string(object, &["eventType"]));
    if count == 0 {
        let mapped_metric = match event_type.as_deref() {
            Some("Charge") => Some(("bio_charge", "score")),
            Some("readiness") => Some(("readiness", "score")),
            _ => None,
        };
        if let Some((metric, unit)) = mapped_metric {
            if let Some(value) = first_value(object, &["value", "score", "charge"])
                .and_then(parse_number)
                .filter(|value| value.is_finite())
            {
                records.push(DailyMetric {
                    date,
                    metric: metric.into(),
                    value,
                    unit: unit.into(),
                    source_scope: scope,
                    device_id: source_device,
                });
                count += 1;
            }
        }
    }
    count
}

fn decode_base64_json(encoded: &str) -> Result<Value> {
    let bytes = STANDARD
        .decode(encoded.trim())
        .map_err(|error| ZeppBridgeError::ParseError(format!("Base64 无效: {error}")))?;
    serde_json::from_slice(&bytes)
        .map_err(|error| ZeppBridgeError::ParseError(format!("Base64 内容不是 JSON: {error}")))
}

fn extract_items(raw: &Value) -> Result<Vec<&Value>> {
    if let Some(items) = raw.as_array() {
        if items.is_empty() {
            return Err(ZeppBridgeError::DataUnavailable("响应 items 为空".into()));
        }
        return Ok(items.iter().collect());
    }
    let Some(object) = raw.as_object() else {
        return Err(ZeppBridgeError::ParseError(
            "响应必须是 object 或 array".into(),
        ));
    };
    for key in ["items", "records", "results", "list"] {
        if let Some(array) = object.get(key).and_then(Value::as_array) {
            if array.is_empty() {
                return Err(ZeppBridgeError::DataUnavailable(format!("响应 {key} 为空")));
            }
            return Ok(array.iter().collect());
        }
    }
    if let Some(data) = object.get("data") {
        if let Some(array) = data.as_array() {
            if array.is_empty() {
                return Err(ZeppBridgeError::DataUnavailable("响应 data 为空".into()));
            }
            return Ok(array.iter().collect());
        }
        if let Some(data_object) = data.as_object() {
            for key in ["items", "records", "results", "list", "summary"] {
                if let Some(array) = data_object.get(key).and_then(Value::as_array) {
                    if array.is_empty() {
                        return Err(ZeppBridgeError::DataUnavailable(format!(
                            "响应 data.{key} 为空"
                        )));
                    }
                    return Ok(array.iter().collect());
                }
            }
        }
        if data.is_string() {
            return Err(ZeppBridgeError::DataUnavailable(
                "响应 data 是编码字符串，无法安全完整解码".into(),
            ));
        }
    }
    Err(ZeppBridgeError::ParseError(format!(
        "响应缺少 items/data 数组，可用字段: {}",
        object.keys().cloned().collect::<Vec<_>>().join(", ")
    )))
}

fn item_object(value: &Value) -> Option<&Map<String, Value>> {
    let object = value.as_object()?;
    object
        .get("value")
        .and_then(Value::as_object)
        .filter(|nested| {
            nested.keys().any(|key| {
                matches!(
                    key.as_str(),
                    "timestamp" | "time" | "value" | "heartRate" | "steps" | "date"
                )
            })
        })
        .unwrap_or(object)
        .into()
}

fn first_value<'a>(object: &'a Map<String, Value>, names: &[&str]) -> Option<&'a Value> {
    names.iter().find_map(|name| object.get(*name))
}

fn first_value_from<'a>(
    object: &'a Map<String, Value>,
    nested: Option<&'a Map<String, Value>>,
    names: &[&str],
) -> Option<&'a Value> {
    first_value(object, names).or_else(|| nested.and_then(|value| first_value(value, names)))
}

fn first_string(object: &Map<String, Value>, names: &[&str]) -> Option<String> {
    first_value(object, names).and_then(|value| match value {
        Value::String(value) if !value.trim().is_empty() => Some(value.clone()),
        Value::Number(value) => Some(value.to_string()),
        _ => None,
    })
}

/// 解析云端的 `heart_range`：心率区间分布。
///
/// 格式是分号分隔的 `秒数,区间上限`，例如
/// `1882,113;3486,141;10,154;0,162;0,173;0,190`——在 113 以下待了 1882 秒，
/// 113 到 141 之间 3486 秒，依此类推。区间边界来自用户在表上的设定，我们没有
/// 那份设定，所以这个分布只能取云端的，自己切会切出另一套数字。
///
/// 各段秒数之和实测能对上 `run_time`（一次健走 5378 vs 5403）。
///
/// 全零的分布（每一段都是 0 秒）返回空：那是「这次运动没有心率数据」，不是
/// 「每个区间都待了 0 秒」。
fn parse_heart_range(raw: Option<&str>) -> Vec<HeartRateZoneBucket> {
    let Some(text) = raw else {
        return Vec::new();
    };
    let mut buckets = Vec::new();
    for (index, part) in text.split(';').filter(|part| !part.is_empty()).enumerate() {
        let mut bits = part.split(',');
        let (Some(seconds), Some(upper)) = (bits.next(), bits.next()) else {
            continue;
        };
        let (Ok(seconds), Ok(upper)) = (seconds.trim().parse::<i64>(), upper.trim().parse::<i32>())
        else {
            continue;
        };
        if seconds < 0 || upper <= 0 {
            continue;
        }
        buckets.push(HeartRateZoneBucket {
            index: index as i32,
            upper_bound_bpm: upper,
            seconds,
        });
    }
    if buckets.iter().all(|bucket| bucket.seconds == 0) {
        return Vec::new();
    }
    buckets
}

fn first_number(object: &Map<String, Value>, names: &[&str]) -> Option<f64> {
    first_value(object, names).and_then(parse_number)
}

fn first_number_from(
    object: &Map<String, Value>,
    nested: Option<&Map<String, Value>>,
    names: &[&str],
) -> Option<f64> {
    first_value_from(object, nested, names).and_then(parse_number)
}

fn parse_number(value: &Value) -> Option<f64> {
    match value {
        Value::Number(number) => number.as_f64(),
        Value::String(text) => text.trim().parse::<f64>().ok(),
        _ => None,
    }
}

fn parse_timestamp(value: &Value) -> Option<DateTime<Utc>> {
    let number = parse_number(value)?;
    if !number.is_finite() {
        return None;
    }
    // Zepp event payloads sometimes carry the calendar day as a compact
    // integer (`dayId: 20260812`).  Guard against interpreting such values
    // as epoch seconds, which would silently produce dates in 1970.
    let compact = number as i64;
    if (19000101..=21001231).contains(&compact) {
        return NaiveDate::parse_from_str(&format!("{compact}"), "%Y%m%d")
            .ok()
            .and_then(|date| date.and_hms_opt(0, 0, 0))
            .map(|naive| DateTime::<Utc>::from_naive_utc_and_offset(naive, Utc));
    }
    if number.abs() >= 10_000_000_000.0 {
        DateTime::from_timestamp_millis(number as i64)
    } else {
        DateTime::from_timestamp(number as i64, 0)
    }
}

fn parse_timestamp_or_date(value: &Value) -> Option<DateTime<Utc>> {
    parse_timestamp(value).or_else(|| {
        let date = value.as_str()?;
        let date = NaiveDate::parse_from_str(date, "%Y-%m-%d").ok()?;
        Some(DateTime::<Utc>::from_naive_utc_and_offset(
            date.and_hms_opt(0, 0, 0)?,
            Utc,
        ))
    })
}

fn parse_date(value: &Value) -> Option<String> {
    if let Some(text) = value.as_str() {
        if NaiveDate::parse_from_str(text, "%Y-%m-%d").is_ok() {
            return Some(text.to_owned());
        }
        return DateTime::parse_from_rfc3339(text)
            .ok()
            .map(|dt| dt.with_timezone(&Utc).format("%Y-%m-%d").to_string());
    }
    parse_timestamp(value).map(|dt| dt.format("%Y-%m-%d").to_string())
}

fn summary_date(
    object: &Map<String, Value>,
    nested: Option<&Map<String, Value>>,
) -> Option<String> {
    first_value_from(
        object,
        nested,
        &[
            "date",
            "day",
            "dayId",
            "dateString",
            "localDate",
            "timestamp",
            "time",
            "startTime",
        ],
    )
    .and_then(parse_date)
}

/// What one wellness raw response yields once parsed.
///
/// Unrecognised streams return empty vectors and a diagnostic rather than an
/// error: the raw response has to survive so its shape can be verified later.
#[derive(Debug, Clone, Default)]
pub struct WellnessNormalizedData {
    pub daily_metrics: Vec<DailyMetric>,
    pub metric_samples: Vec<MetricSample>,
    pub diagnostics: Vec<String>,
}

impl Normalizer {
    /// Parse one optional wellness stream.
    ///
    /// The stream is identified by its source key (`wellness:{label}:…`) rather
    /// than sniffed from the payload, because several of these share an
    /// envelope shape while meaning entirely different things.
    ///
    /// Only shapes verified against a real response are parsed here. Stress
    /// (`Charge/stress_data`) is deliberately absent: its payload is a
    /// protobuf whose float fields do not match the ranges the Zepp app shows,
    /// so mapping it would be a guess. The raw response is retained, and
    /// everything the app actually needs — the daily roll-up *and* the whole
    /// 24-hour curve — comes out of `all_day_stress` instead.
    pub fn normalize_wellness(source_key: &str, raw: &Value) -> WellnessNormalizedData {
        let label = source_key.split(':').nth(1).unwrap_or_default();
        let mut out = WellnessNormalizedData::default();
        let Some(items) = raw.get("items").and_then(Value::as_array) else {
            out.diagnostics
                .push(format!("{label}: 报文没有 items 数组"));
            return out;
        };
        match label {
            "lactate_threshold" => lactate_threshold_metrics(items, &mut out),
            "respiratory_rate" => respiratory_rate_metrics(items, &mut out),
            "hrv_rmssd" => hrv_rmssd_samples(items, &mut out),
            "spo2" | "spo2_auto" => spo2_samples(items, &mut out),
            "pai" => pai_metrics(items, &mut out),
            "all_day_stress" => all_day_stress_metrics(items, &mut out),
            other => out
                .diagnostics
                .push(format!("{other}: 结构尚未验证，仅保留原始报文")),
        }
        out
    }
}

/// One body-composition metric: what to call it, which server field names have
/// been seen to carry it, its unit, and the range a real human reading falls in.
///
/// The range is not decoration. Only `weight`, `bmi` and `height` were read off
/// a live account — that account has no scale, so the fat / muscle / water
/// fields a scale adds were not there to look at, and their names come from the
/// wider Zepp ecosystem rather than from a response anyone here has seen.
/// Publishing a health reading under a guessed name is worse than publishing
/// nothing, so every unconfirmed field has to land inside a range only that
/// metric can occupy. A `fatRate` that comes back as 31.4 is a body-fat
/// percentage; one that comes back as 1980 is something else wearing the same
/// name, and it gets dropped and reported rather than charted.
struct BodyMetric {
    metric: &'static str,
    aliases: &'static [&'static str],
    unit: &'static str,
    range: (f64, f64),
}

/// Everything one weigh-in can carry.
///
/// The first three are confirmed against a live account (2026-09-04); the rest
/// are accepted on sight but gated by `range`. Adding a name here is cheap and
/// safe — the payload is retained either way, so a scale owner's records can be
/// replayed once their real field names are known.
const BODY_METRICS: [BodyMetric; 11] = [
    // Confirmed: `summary.weight`, kilograms, a plain float.
    BodyMetric { metric: "weight", aliases: &["weight"], unit: "kg", range: (2.0, 400.0) },
    // Confirmed: `summary.bmi`.
    BodyMetric { metric: "bmi", aliases: &["bmi"], unit: "kg/m2", range: (5.0, 100.0) },
    // Confirmed: `summary.height`, centimetres. Not a measurement of the day —
    // it is profile data echoed back — but it is what makes a weight readable,
    // and this is the only place an export can get it from.
    BodyMetric { metric: "height", aliases: &["height"], unit: "cm", range: (50.0, 260.0) },
    BodyMetric {
        metric: "body_fat_rate",
        aliases: &["fatRate", "bodyFatRate", "fat_rate", "bodyFat"],
        unit: "%",
        range: (2.0, 75.0),
    },
    BodyMetric {
        metric: "body_water_rate",
        aliases: &["bodyWaterRate", "waterRate", "moisture"],
        unit: "%",
        range: (20.0, 80.0),
    },
    BodyMetric {
        metric: "muscle_mass",
        aliases: &["muscleMass", "muscle"],
        unit: "kg",
        range: (5.0, 120.0),
    },
    BodyMetric {
        metric: "bone_mass",
        aliases: &["boneMass", "bone"],
        unit: "kg",
        range: (0.3, 12.0),
    },
    BodyMetric {
        metric: "protein_rate",
        aliases: &["proteinRate", "protein"],
        unit: "%",
        range: (5.0, 40.0),
    },
    // A grade, not a percentage: the Zepp app shows 1..30.
    BodyMetric {
        metric: "visceral_fat",
        aliases: &["visceralFat", "visceralFatGrade", "viscera"],
        unit: "grade",
        range: (1.0, 60.0),
    },
    BodyMetric {
        metric: "bmr",
        aliases: &["bmr", "basalMetabolism", "metabolism"],
        unit: "kcal/day",
        range: (500.0, 5000.0),
    },
    // Confirmed present on one record: `summary.bodyBalanceScore`, 0..100.
    BodyMetric {
        metric: "body_balance_score",
        aliases: &["bodyBalanceScore"],
        unit: "score",
        range: (0.0, 100.0),
    },
];

/// Fields in `summary` that are context rather than readings.
///
/// They are excluded from the "not parsed yet" diagnostic below — otherwise the
/// one line that exists to surface a scale's real field names gets buried under
/// the names we already understand.
const WEIGHT_FIELDS_NOT_METRICS: [&str; 12] = [
    "age",
    "bodyStyle",
    "dataSourceType",
    "deviceSn",
    "deviceType",
    // The scale's raw input, encrypted. See the note on `normalize_weight`.
    "encryptImpedance",
    "oneFootMeasureTime",
    "source",
    "syncHealth",
    "syncHealthConnect",
    "thirdPackage",
    "timeZone",
];

impl Normalizer {
    /// Weight and body composition from `/users/{id}/members/-1/weightRecords`.
    ///
    /// Written to `metric_samples`, not `daily_metrics`: a weigh-in has a real
    /// timestamp and people weigh themselves more than once a day. Rolling them
    /// into one number per date would throw away the morning/evening spread that
    /// is most of what a weight chart is for, and the storage layer already
    /// aggregates samples per local day when a chart asks it to.
    ///
    /// Shape, verified on a live account 2026-09-04:
    ///
    /// ```json
    /// { "items": [ { "generatedTime": 1764743530, "createTime": 1764743529,
    ///                "weightType": 1, "memberId": "-1", "deviceSource": -1,
    ///                "summary": { "weight": 68.2, "bmi": 22.1, "height": 175.0,
    ///                             "timeZone": "Asia/Shanghai", "age": 19 } } ] }
    /// ```
    ///
    /// `summary` is not a fixed shape. Across four records on one account it
    /// varied between ten and eleven keys, with `bodyStyle`, `bodyBalanceScore`,
    /// `oneFootMeasureTime`, `encryptImpedance`, `age`, `deviceSn` and
    /// `thirdPackage` each present on some and absent on others — and `timeZone`
    /// appearing as `"Asia/Shanghai"`, `"GMT+08:00"` and `"28800000"` on three
    /// different records of the same account. So every field is read as
    /// optional, and the timestamp is taken from `generatedTime` rather than
    /// reconstructed out of that zone soup.
    ///
    /// `encryptImpedance` is deliberately ignored. Body composition is derived
    /// from impedance by the vendor's own model; deriving our own numbers from
    /// it would be inventing health readings, not reading them.
    pub fn normalize_weight(raw: &Value) -> WellnessNormalizedData {
        let mut out = WellnessNormalizedData::default();
        let Some(items) = raw.get("items").and_then(Value::as_array) else {
            out.diagnostics.push("weight: 报文没有 items 数组".into());
            return out;
        };
        let mut unknown: BTreeMap<String, usize> = BTreeMap::new();
        for item in items {
            let Some(object) = item.as_object() else {
                continue;
            };
            // Unix **seconds**, not milliseconds. This endpoint differs from
            // every event surface, and the shared `parse_timestamp` would read a
            // millisecond value as a date fifty thousand years from now.
            let Some(timestamp) = first_number(object, &["generatedTime", "createTime", "time"])
                .filter(|value| value.is_finite() && *value > 0.0)
                .and_then(|seconds| DateTime::from_timestamp(seconds as i64, 0))
            else {
                out.diagnostics.push("weight: 一条记录没有可用的时间戳".into());
                continue;
            };
            let Some(summary) = object.get("summary").and_then(Value::as_object) else {
                out.diagnostics.push("weight: 一条记录没有 summary".into());
                continue;
            };
            let mut matched: Vec<&str> = Vec::new();
            for spec in &BODY_METRICS {
                for alias in spec.aliases {
                    if summary.contains_key(*alias) {
                        matched.push(alias);
                    }
                }
                let Some(value) = first_number(summary, spec.aliases) else {
                    continue;
                };
                if !value.is_finite() || value < spec.range.0 || value > spec.range.1 {
                    // The name matched but the number cannot mean what the name
                    // says. Report it so the real meaning can be found later;
                    // do not chart it.
                    out.diagnostics.push(format!(
                        "weight: {} 的读数 {value} 不在 {:?} 内，已忽略",
                        spec.metric, spec.range
                    ));
                    continue;
                }
                out.metric_samples.push(MetricSample {
                    metric: spec.metric.to_string(),
                    timestamp,
                    value,
                    unit: spec.unit.to_string(),
                    source_scope: SourceScope::UserFused,
                    device_id: None,
                });
            }
            // Names we do not read yet, counted rather than listed per record so
            // a five-year backfill cannot turn this into thousands of lines.
            // This is how a scale owner's real field names reach us without
            // asking them to run anything.
            for key in summary.keys() {
                if matched.contains(&key.as_str())
                    || WEIGHT_FIELDS_NOT_METRICS.contains(&key.as_str())
                {
                    continue;
                }
                *unknown.entry(key.clone()).or_default() += 1;
            }
        }
        if !unknown.is_empty() {
            let listed = unknown
                .iter()
                .map(|(name, count)| format!("{name}x{count}"))
                .collect::<Vec<_>>()
                .join(", ");
            out.diagnostics
                .push(format!("weight: summary 里尚未解析的字段：{listed}"));
        }
        out
    }
}

/// `value.samples[]` carries `dateString`, `lactateThresholdHr` (bpm) and
/// `lactateThresholdPace` (seconds per kilometre). Verified against the Zepp
/// app: 2026-08-11 reads 175 bpm and 309 s/km, which the app shows as
/// "175 次/分" and "05'09"/公里".
fn lactate_threshold_metrics(items: &[Value], out: &mut WellnessNormalizedData) {
    for item in items {
        let Some(samples) = item
            .pointer("/value/samples")
            .and_then(Value::as_array)
            .filter(|list| !list.is_empty())
        else {
            continue;
        };
        for sample in samples {
            let Some(object) = sample.as_object() else {
                continue;
            };
            let Some(date) = first_string(object, &["dateString", "date"])
                .filter(|value| NaiveDate::parse_from_str(value, "%Y-%m-%d").is_ok())
            else {
                continue;
            };
            for (metric, keys, unit, range) in [
                (
                    "lactate_threshold_hr",
                    &["lactateThresholdHr"][..],
                    "bpm",
                    (60.0, 230.0),
                ),
                (
                    "lactate_threshold_pace",
                    &["lactateThresholdPace"][..],
                    "s/km",
                    (100.0, 1800.0),
                ),
            ] {
                if let Some(value) =
                    first_number(object, keys).filter(|value| (range.0..=range.1).contains(value))
                {
                    out.daily_metrics.push(DailyMetric {
                        date: date.clone(),
                        metric: metric.into(),
                        value,
                        unit: unit.into(),
                        source_scope: SourceScope::UserFused,
                        device_id: None,
                    });
                }
            }
        }
    }
}

/// `value.measurements` is base64 of 1440 bytes — one breaths-per-minute
/// reading per minute of the local day, with 0 meaning "not measured".
/// Verified physiologically: the non-zero values land between 11 and 18.
fn respiratory_rate_metrics(items: &[Value], out: &mut WellnessNormalizedData) {
    for item in items {
        let Some(object) = item.as_object() else {
            continue;
        };
        let Some(encoded) = item
            .pointer("/value/measurements")
            .and_then(Value::as_str)
            .filter(|text| !text.is_empty())
        else {
            continue;
        };
        let Ok(bytes) = STANDARD.decode(encoded) else {
            out.diagnostics
                .push("respiratory_rate: measurements 不是合法 base64".into());
            continue;
        };
        // Physiologically impossible readings are sensor noise, not data.
        let readings: Vec<f64> = bytes
            .iter()
            .map(|value| f64::from(*value))
            .filter(|value| (4.0..=60.0).contains(value))
            .collect();
        if readings.is_empty() {
            continue;
        }
        let Some(date) = summary_date(object, None) else {
            continue;
        };
        let count = readings.len() as f64;
        let average = readings.iter().sum::<f64>() / count;
        let minimum = readings.iter().cloned().fold(f64::INFINITY, f64::min);
        let maximum = readings.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
        for (metric, value) in [
            ("respiratory_rate", (average * 10.0).round() / 10.0),
            ("respiratory_rate_min", minimum),
            ("respiratory_rate_max", maximum),
        ] {
            out.daily_metrics.push(DailyMetric {
                date: date.clone(),
                metric: metric.into(),
                value,
                unit: "brpm".into(),
                source_scope: SourceScope::Device,
                device_id: None,
            });
        }
    }
}

/// `value.samples[]` carries `{hrv, s}` where `s` is a millisecond offset from
/// `value.startTime` — the offsets step in whole minutes (0, 60000, 120000 …).
fn hrv_rmssd_samples(items: &[Value], out: &mut WellnessNormalizedData) {
    for item in items {
        let Some(start) = item
            .pointer("/value/startTime")
            .and_then(Value::as_i64)
            .and_then(DateTime::from_timestamp_millis)
        else {
            continue;
        };
        let device = item
            .pointer("/value")
            .and_then(Value::as_object)
            .and_then(device_id);
        let Some(samples) = item.pointer("/value/samples").and_then(Value::as_array) else {
            continue;
        };
        for sample in samples {
            let Some(object) = sample.as_object() else {
                continue;
            };
            // RMSSD outside this band is a failed read, not a heart.
            let Some(value) = first_number(object, &["hrv", "rmssd"])
                .filter(|value| (1.0..=400.0).contains(value))
            else {
                continue;
            };
            let offset_ms = first_number(object, &["s", "offset"])
                .map(|value| value.round() as i64)
                .unwrap_or(0);
            let Some(timestamp) = start.checked_add_signed(Duration::milliseconds(offset_ms))
            else {
                continue;
            };
            out.metric_samples.push(MetricSample {
                metric: "hrv_rmssd".into(),
                timestamp,
                value,
                unit: "ms".into(),
                source_scope: SourceScope::Device,
                device_id: device.clone(),
            });
        }
    }
}

/// `blood_oxygen` is three different records under one event type, told apart
/// by `subType`:
///
/// - `click` — one spot reading, in an `extra` JSON string.
/// - `odi` — a night's oxygen-desaturation summary, flat on the item.
/// - `osa_event` — one apnea event, with the saturation it dipped to.
///
/// Asking for `click` alone was what made blood oxygen look like it stopped on
/// 2026-08-16: spot readings did stop, while the nightly summaries continued.
fn spo2_samples(items: &[Value], out: &mut WellnessNormalizedData) {
    for item in items {
        let Some(object) = item.as_object() else {
            continue;
        };
        match first_string(object, &["subType"]).as_deref() {
            Some("odi") => {
                spo2_odi_metrics(object, out);
                continue;
            }
            Some("osa_event") => {
                spo2_apnea_sample(object, out);
                continue;
            }
            _ => {}
        }
        let Some(extra) = object
            .get("extra")
            .and_then(Value::as_str)
            .and_then(|text| serde_json::from_str::<Value>(text).ok())
        else {
            continue;
        };
        let Some(extra) = extra.as_object() else {
            continue;
        };
        // A saturation outside this band is a failed read.
        let Some(value) =
            first_number(extra, &["spo2", "value"]).filter(|value| (50.0..=100.0).contains(value))
        else {
            continue;
        };
        let Some(timestamp) = first_number(extra, &["timestamp"])
            .or_else(|| first_number(object, &["timestamp"]))
            .and_then(|millis| DateTime::from_timestamp_millis(millis.round() as i64))
        else {
            continue;
        };
        out.metric_samples.push(MetricSample {
            metric: "spo2".into(),
            timestamp,
            value,
            unit: "%".into(),
            source_scope: SourceScope::Device,
            device_id: device_id(extra),
        });
    }
}

/// A night's oxygen-desaturation summary. `odi` is events per hour, `odiNum`
/// the count, `score` the night's rating and `cost` how long the measurement
/// ran. `valid` is -1 on every record ever seen, so it is a constant rather
/// than a validity flag and is not used to gate anything.
fn spo2_odi_metrics(object: &Map<String, Value>, out: &mut WellnessNormalizedData) {
    let Some(date) = summary_date(object, None) else {
        return;
    };
    for (metric, keys, unit, range) in [
        ("spo2_odi", &["odi"][..], "events/h", (0.0, 100.0)),
        ("spo2_odi_events", &["odiNum"][..], "count", (0.0, 1000.0)),
        ("spo2_night_score", &["score"][..], "score", (0.0, 100.0)),
    ] {
        if let Some(value) =
            first_number(object, keys).filter(|value| (range.0..=range.1).contains(value))
        {
            out.daily_metrics.push(DailyMetric {
                date: date.clone(),
                metric: metric.into(),
                value,
                unit: unit.into(),
                source_scope: SourceScope::Device,
                device_id: device_id(object),
            });
        }
    }
    // `cost` is the measured span in seconds; minutes are the unit every other
    // sleep figure in this database already uses.
    if let Some(seconds) =
        first_number(object, &["cost"]).filter(|value| (60.0..=86_400.0).contains(value))
    {
        out.daily_metrics.push(DailyMetric {
            date,
            metric: "spo2_measured_minutes".into(),
            value: (seconds / 60.0).round(),
            unit: "min".into(),
            source_scope: SourceScope::Device,
            device_id: device_id(object),
        });
    }
}

/// One apnea event's saturation low point.
///
/// Kept as its own metric rather than folded into `spo2`: these are by
/// definition the dips, and averaging them together with ordinary readings
/// would report a saturation the sleeper never sustained.
fn spo2_apnea_sample(object: &Map<String, Value>, out: &mut WellnessNormalizedData) {
    let Some(extra) = object
        .get("extra")
        .and_then(Value::as_str)
        .and_then(|text| serde_json::from_str::<Value>(text).ok())
    else {
        return;
    };
    let Some(extra) = extra.as_object() else {
        return;
    };
    let Some(value) = first_number(extra, &["spo2_decrease", "spo2Decrease"])
        .filter(|value| (50.0..=100.0).contains(value))
    else {
        return;
    };
    let Some(timestamp) = first_number(extra, &["timestamp"])
        .or_else(|| first_number(object, &["timestamp"]))
        .and_then(|millis| DateTime::from_timestamp_millis(millis.round() as i64))
    else {
        return;
    };
    out.metric_samples.push(MetricSample {
        metric: "spo2_apnea_low".into(),
        timestamp,
        value,
        unit: "%".into(),
        source_scope: SourceScope::Device,
        device_id: device_id(extra),
    });
}

/// PAI items are flat — no `value` envelope. Alongside the score they carry the
/// watch's own `maxHr` and `restHr`, which are the only device-sourced heart
/// rate bounds available anywhere in this API.
fn pai_metrics(items: &[Value], out: &mut WellnessNormalizedData) {
    for item in items {
        let Some(object) = item.as_object() else {
            continue;
        };
        let Some(date) = summary_date(object, None) else {
            continue;
        };
        for (metric, keys, unit, range) in [
            ("pai_daily", &["dailyPai"][..], "pai", (0.0, 500.0)),
            ("pai_low_zone", &["lowZonePai"][..], "pai", (0.0, 500.0)),
            (
                "pai_medium_zone",
                &["mediumZonePai"][..],
                "pai",
                (0.0, 500.0),
            ),
            ("pai_high_zone", &["highZonePai"][..], "pai", (0.0, 500.0)),
            ("device_max_hr", &["maxHr"][..], "bpm", (100.0, 240.0)),
            ("device_resting_hr", &["restHr"][..], "bpm", (25.0, 120.0)),
            // 七天滚动的 PAI 总分 —— Zepp 界面上那个大数字就是它，以前一直
            // 没取。本机 1 363 条 PaiHealthInfo 里实测 0–270.8。
            ("pai_total", &["totalPai"][..], "pai", (0.0, 1000.0)),
            // 三档区间各自待了多久。0 分钟是真的「这档一分钟都没进」，不是
            // 缺失，所以下界留在 0。实测 0–414 / 0–215 / 0–126。
            (
                "pai_low_zone_minutes",
                &["lowZoneMinutes"][..],
                "min",
                (0.0, 1440.0),
            ),
            (
                "pai_medium_zone_minutes",
                &["mediumZoneMinutes"][..],
                "min",
                (0.0, 1440.0),
            ),
            (
                "pai_high_zone_minutes",
                &["highZoneMinutes"][..],
                "min",
                (0.0, 1440.0),
            ),
            // 三档的心率下限。这是手表按用户的最大/静息心率算出来的，不是
            // 我们切的 —— 和运动详情页那份 `heart_range` 同理。实测低档
            // 90–105、中档恒 119、高档 158–159。
            (
                "pai_low_zone_lower_hr",
                &["lowZoneLowerLimit"][..],
                "bpm",
                (40.0, 240.0),
            ),
            (
                "pai_medium_zone_lower_hr",
                &["mediumZoneLowerLimit"][..],
                "bpm",
                (40.0, 240.0),
            ),
            (
                "pai_high_zone_lower_hr",
                &["highZoneLowerLimit"][..],
                "bpm",
                (40.0, 240.0),
            ),
        ] {
            if let Some(value) =
                first_number(object, keys).filter(|value| (range.0..=range.1).contains(value))
            {
                out.daily_metrics.push(DailyMetric {
                    date: date.clone(),
                    metric: metric.into(),
                    value,
                    unit: unit.into(),
                    source_scope: SourceScope::Device,
                    device_id: device_id(object),
                });
            }
        }
    }
}

/// The all-day stress roll-up. One item is one day, and it carries two
/// different things:
///
/// * the named daily fields — the day's average, its minimum and maximum, and
///   the share of the day spent in each of four bands;
/// * `data`, a JSON **string** holding that same day's whole curve as
///   `[{"time": <epoch ms>, "value": <1..100>}, ...]`, one reading roughly
///   every five minutes.
///
/// `data` is the 24/7 curve the watch itself draws, and it used to be dropped
/// on the floor — only the daily average reached the database, so nothing
/// downstream could ever show more than one point per day. A user reported the
/// stress display "isn't 24/7"; it was the reading that was missing, not the
/// measurement.
///
/// Checked against every one of this library's 1104 real items before wiring
/// it up: `minStress` and `maxStress` equal the series' own minimum and
/// maximum in 946 of the 946 items that carry them, and `avgStress` lands
/// within 3.9 of the series mean. The roll-up is computed from this curve, so
/// the two are one measurement rather than two streams that happen to agree.
///
/// The per-minute `Charge/stress_data` stream is a different payload and stays
/// unparsed: its protobuf floats still match no range the app displays.
fn all_day_stress_metrics(items: &[Value], out: &mut WellnessNormalizedData) {
    for item in items {
        let Some(object) = item.as_object() else {
            continue;
        };
        let value = item.pointer("/value").and_then(Value::as_object);
        let Some(date) = summary_date(object, value) else {
            continue;
        };
        let device = value.and_then(device_id).or_else(|| device_id(object));
        for (metric, keys, unit, range) in [
            (
                "stress",
                &["avgStress", "averageStress", "stress"][..],
                "score",
                (0.0, 100.0),
            ),
            ("stress_min", &["minStress"][..], "score", (0.0, 100.0)),
            ("stress_max", &["maxStress"][..], "score", (0.0, 100.0)),
            // The four band shares. `relaxProportion` is the name the payload
            // actually uses; `relaxPct` was transcribed from another client and
            // has never matched a field in any of the 1104 items here, so on
            // its own it silently produced no rows at all. Verified name first,
            // the older guess kept behind it.
            (
                "stress_relaxed_pct",
                &["relaxProportion", "relaxPct"][..],
                "%",
                (0.0, 100.0),
            ),
            (
                "stress_normal_pct",
                &["normalProportion", "normalPct"][..],
                "%",
                (0.0, 100.0),
            ),
            (
                "stress_medium_pct",
                &["mediumProportion", "mediumPct"][..],
                "%",
                (0.0, 100.0),
            ),
            (
                "stress_high_pct",
                &["highProportion", "highPct"][..],
                "%",
                (0.0, 100.0),
            ),
        ] {
            if let Some(reading) = first_number_from(object, value, keys)
                .filter(|reading| (range.0..=range.1).contains(reading))
            {
                out.daily_metrics.push(DailyMetric {
                    date: date.clone(),
                    metric: metric.into(),
                    value: reading,
                    unit: unit.into(),
                    source_scope: SourceScope::Device,
                    device_id: device.clone(),
                });
            }
        }
        all_day_stress_curve(object, value, device.as_deref(), out);
    }
}

/// One day's stress curve, parsed out of the `data` string.
///
/// The band shares above put the boundaries at 1-39 / 40-59 / 60-79 / 80-100:
/// recomputing the four proportions from this series with that split
/// reproduces the reported figures to within 0.4 percentage points on average
/// across those 946 items, and they sum to exactly 100 in every one of them.
///
/// Zepp's scale starts at 1. A 0 never appears in any of the 62 626 distinct
/// readings this library holds (522 days of them), while
/// 0 is what these payloads use elsewhere to mean "nothing measured", so a
/// reading below 1 is dropped rather than drawn as an impossibly calm minute.
fn all_day_stress_curve(
    object: &Map<String, Value>,
    nested: Option<&Map<String, Value>>,
    device: Option<&str>,
    out: &mut WellnessNormalizedData,
) {
    let Some(points) = first_value_from(object, nested, &["data"])
        .and_then(Value::as_str)
        .and_then(|text| serde_json::from_str::<Value>(text).ok())
    else {
        return;
    };
    let Some(points) = points.as_array() else {
        return;
    };
    for point in points {
        let Some(point) = point.as_object() else {
            continue;
        };
        let Some(reading) =
            first_number(point, &["value"]).filter(|reading| (1.0..=100.0).contains(reading))
        else {
            continue;
        };
        let Some(timestamp) = first_value(point, &["time", "timestamp"]).and_then(parse_timestamp)
        else {
            continue;
        };
        out.metric_samples.push(MetricSample {
            metric: "stress".into(),
            timestamp,
            value: reading,
            unit: "score".into(),
            source_scope: SourceScope::Device,
            device_id: device.map(str::to_string),
        });
    }
}

fn device_id(object: &Map<String, Value>) -> Option<String> {
    first_string(
        object,
        &["device_id", "deviceId", "deviceid", "sourceDeviceId"],
    )
    .and_then(|value| sanitize_device_id(&value))
}

/// The shortest observed real identifier is a 14-character serial; anything
/// shorter is bookkeeping, not a device.
const MIN_DEVICE_ID_LEN: usize = 8;

/// A device id has to look like one. Zepp reuses these field names for
/// comma-joined bookkeeping — "1,", "1,-1", "1440,app", "3,D85403FFFEE4D576" —
/// and storing those verbatim mislabels which watch produced a metric (and
/// splits one device across several bogus ids). Take the longest
/// comma-separated segment and keep it only if it has serial shape; that also
/// recovers the real id out of "3,D85403FFFEE4D576". Unrecognisable values
/// become `None`, which is honest: the payload did not name a device.
fn sanitize_device_id(value: &str) -> Option<String> {
    value
        .split(',')
        .map(str::trim)
        .filter(|segment| {
            segment.len() >= MIN_DEVICE_ID_LEN
                && segment.chars().all(|item| item.is_ascii_alphanumeric())
        })
        .max_by_key(|segment| segment.len())
        .map(str::to_owned)
}

/// Event types whose payload is an account-level aggregate rather than one
/// device's reading. They carry a bookkeeping `deviceId` that `device_id`
/// now rejects, so their provenance has to come from the event type instead
/// of from the presence of an id — otherwise they fall through to `Unknown`.
const USER_FUSED_EVENT_TYPES: [&str; 2] = ["DailyHealth", "Charge"];

fn source_scope(object: Option<&Map<String, Value>>, device_id: Option<&str>) -> SourceScope {
    if let Some(object) = object {
        if first_value(object, &["is_fused", "isFused"])
            .and_then(Value::as_bool)
            .unwrap_or(false)
            || first_string(object, &["source_scope", "sourceScope"])
                .map(|scope| scope.eq_ignore_ascii_case("user_fused"))
                .unwrap_or(false)
        {
            return SourceScope::UserFused;
        }
        if first_string(object, &["eventType"])
            .map(|event| {
                USER_FUSED_EVENT_TYPES
                    .iter()
                    .any(|known| known.eq_ignore_ascii_case(&event))
            })
            .unwrap_or(false)
        {
            return SourceScope::UserFused;
        }
    }
    if device_id.is_some() {
        SourceScope::Device
    } else {
        SourceScope::Unknown
    }
}

fn duration_to_minutes(value: f64) -> i32 {
    // Zepp variants use either minutes or seconds for stage durations. Values
    // above one day in minutes are unambiguously seconds.
    if value > 24.0 * 60.0 {
        (value / 60.0).round() as i32
    } else {
        value.round() as i32
    }
}

#[cfg(test)]
mod tests {

    /// 云端一直在给、以前一个都没取的那批运动汇总字段。
    ///
    /// 取值全部来自真实报文（trackid 1787901817，一次 6.37 km 健走）。
    #[test]
    fn workout_summary_fields_are_read_from_the_cloud_payload() {
        let raw = serde_json::json!({
            "data": [{
                "trackid": "1787901817",
                "type": 6,
                "start_time": 1787901817_i64,
                "end_time": 1787907220_i64,
                "dis": 6377.0,
                "calorie": 562,
                "avg_heart_rate": 115,
                "max_heart_rate": 143,
                "min_heart_rate": 83,
                "total_step": 8998,
                "run_time": "5403",
                "elevationGain": 5935,
                "elevationLoss": 5936,
                "highestAltitude": 9178,
                "lowestAltitude": 7867,
                "te": 22,
                "anaerobic_te": 1,
                "rpe": 3,
                "avg_frequency": "99.0",
                "max_frequency": 141,
                "avg_stride_length": 70,
                "heart_range": "1882,113;3486,141;10,154;0,162;0,173;0,190"
            }]
        });

        let records = Normalizer::normalize_workouts(&raw).expect("应当能解析");
        let workout = records.first().expect("应当有一条运动");

        assert_eq!(workout.min_hr, Some(83));
        assert_eq!(workout.total_steps, Some(8998));
        assert_eq!(workout.moving_seconds, Some(5403));
        // 厘米换算成米
        assert_eq!(workout.elevation_gain_m, Some(59.35));
        assert_eq!(workout.elevation_loss_m, Some(59.36));
        assert_eq!(workout.max_altitude_m, Some(91.78));
        assert_eq!(workout.min_altitude_m, Some(78.67));
        // 训练效果是十倍整数
        assert_eq!(workout.training_effect, Some(2.2));
        assert_eq!(workout.anaerobic_training_effect, Some(0.1));
        assert_eq!(workout.rpe, Some(3));
        assert_eq!(workout.avg_cadence_spm, Some(99.0));
        assert_eq!(workout.max_cadence_spm, Some(141.0));
        assert_eq!(workout.avg_stride_cm, Some(70.0));

        // 心率区间分布
        assert_eq!(workout.hr_zones.len(), 6);
        assert_eq!(workout.hr_zones[0].upper_bound_bpm, 113);
        assert_eq!(workout.hr_zones[0].seconds, 1882);
        assert_eq!(workout.hr_zones[1].upper_bound_bpm, 141);
        assert_eq!(workout.hr_zones[1].seconds, 3486);
        assert_eq!(workout.hr_zones[5].seconds, 0);
        // 各段之和应当接近 run_time（实测 5378 vs 5403）
        let total: i64 = workout.hr_zones.iter().map(|z| z.seconds).sum();
        assert!(
            (total - 5403).abs() < 60,
            "区间秒数之和 {total} 应当接近 run_time 5403"
        );
    }

    /// 「没测到」的哨兵不能变成 0。
    ///
    /// 云端用 -1 表示没有这一项（`avg_cadence`、`average_power`），骑行的
    /// `total_step` 是 0、`avg_frequency` 是 "0.0"。这些都不该落成数值。
    #[test]
    fn sentinels_do_not_become_zeroes() {
        let raw = serde_json::json!({
            "data": [{
                "trackid": "1787186615",
                "type": 9,
                "start_time": 1787186615_i64,
                "end_time": 1787187642_i64,
                "dis": 1803.0,
                "min_heart_rate": 94,
                "total_step": 0,
                "avg_frequency": "0.0",
                "max_frequency": 0,
                "avg_stride_length": 0,
                "average_power": -1.0,
                "avg_cadence": -1,
                "rpe": 2,
                "heart_range": "115,113;462,141;323,154;102,162;0,173;0,190"
            }]
        });

        let records = Normalizer::normalize_workouts(&raw).expect("应当能解析");
        let workout = records.first().expect("应当有一条运动");

        assert_eq!(workout.min_hr, Some(94));
        assert_eq!(
            workout.total_steps, None,
            "骑行的 0 步是「没有步数」，不能记成走了 0 步"
        );
        assert_eq!(workout.avg_cadence_spm, None);
        assert_eq!(workout.max_cadence_spm, None);
        assert_eq!(workout.avg_stride_cm, None);
        assert_eq!(workout.training_effect, None, "没给 te 就不该有值");
        assert_eq!(workout.rpe, Some(2));
        // 骑行确实有心率区间
        assert_eq!(workout.hr_zones.len(), 6);
        assert_eq!(workout.hr_zones[3].seconds, 102);
    }

    /// 全零的心率区间是「这次没有心率」，不是「每个区间待了 0 秒」。
    #[test]
    fn an_all_zero_heart_range_is_treated_as_absent() {
        assert!(parse_heart_range(Some("0,113;0,141;0,154")).is_empty());
        assert!(parse_heart_range(None).is_empty());
        assert!(parse_heart_range(Some("")).is_empty());
        // 上限为 0 的段直接丢掉，不占位
        let zones = parse_heart_range(Some("10,0;20,141"));
        assert_eq!(zones.len(), 1);
        assert_eq!(zones[0].upper_bound_bpm, 141);
    }

    /// 云端没给爬升时才回退到取整的米值。
    #[test]
    fn elevation_falls_back_to_the_metre_field_when_centimetres_are_absent() {
        let raw = serde_json::json!({
            "data": [{
                "trackid": "x", "type": 6,
                "start_time": 1787901817_i64, "end_time": 1787907220_i64,
                "altitude_ascend": 59, "altitude_descend": 59
            }]
        });
        let records = Normalizer::normalize_workouts(&raw).unwrap();
        let workout = records.first().unwrap();
        assert_eq!(workout.elevation_gain_m, Some(59.0));
        assert_eq!(workout.elevation_loss_m, Some(59.0));
    }

    /// 空报文报的是 `DataUnavailable`，不是解析失败。
    ///
    /// 有的账号心率接口对整段历史都返回 `{"items": []}`——那是在明确回答
    /// 「这段时间没有心率」。补拉靠 `is_unavailable()` 把这一块记成
    /// 「云端没有」而不是失败；这条断言就是那个判断的前提，别改成别的错误类型。
    #[test]
    fn an_empty_items_payload_reports_unavailable_not_a_parse_failure() {
        let payload = serde_json::json!({ "items": [] });
        let error = Normalizer::normalize_heart_rate(&payload)
            .expect_err("空 items 目前按 DataUnavailable 上报");
        assert!(
            error.is_unavailable(),
            "补拉据此区分「云端没有」和「我们没看懂」，改了这里要同步改 backfill_one_chunk"
        );
    }

    use super::*;
    use base64::engine::general_purpose::STANDARD;
    use serde_json::json;

    #[test]
    fn empty_or_wrong_shape_is_not_success() {
        assert!(Normalizer::normalize_heart_rate(&json!({"items": []})).is_err());
        assert!(Normalizer::normalize_sleep(&json!({"data": "H4sI..."})).is_err());
    }

    #[test]
    fn bookkeeping_device_ids_are_not_devices() {
        // These are the placeholder shapes Zepp actually sends. Trimming
        // punctuation off "1," used to yield a device id of "1", which then
        // labelled account-level aggregates as if a watch had reported them.
        for placeholder in ["1,", "1", "1,-1", "1440,app", ""] {
            let payload = json!({ "deviceId": placeholder });
            assert_eq!(
                device_id(payload.as_object().unwrap()),
                None,
                "{placeholder} should not pass as a device id"
            );
        }
        let real = json!({"sourceDeviceId": "23229501001311"});
        assert_eq!(
            device_id(real.as_object().unwrap()).as_deref(),
            Some("23229501001311")
        );
        // A real id joined onto an index is recovered, not discarded.
        let joined = json!({"deviceId": "3,D85403FFFEE4D576"});
        assert_eq!(
            device_id(joined.as_object().unwrap()).as_deref(),
            Some("D85403FFFEE4D576")
        );
    }

    #[test]
    fn account_level_events_are_user_fused_not_device() {
        // DailyHealth/Charge carry a bookkeeping deviceId that `device_id`
        // rejects; without the event-type rule they would fall to `Unknown`
        // and the export would lose the fact that these are fused totals.
        for event_type in ["DailyHealth", "Charge"] {
            let event = json!({ "eventType": event_type, "deviceId": "1," });
            assert_eq!(
                source_scope(event.as_object(), None),
                SourceScope::UserFused,
                "{event_type}"
            );
        }
        let device_event = json!({ "eventType": "readiness" });
        assert_eq!(
            source_scope(device_event.as_object(), Some("D8803CFFFEC19AC6")),
            SourceScope::Device
        );
    }

    #[test]
    fn parse_timestamp_handles_compact_calendar_days() {
        // yyyyMMdd integers are calendar days, never epoch seconds.
        let date = parse_timestamp(&json!(20260812)).unwrap();
        assert_eq!(date.format("%Y-%m-%d").to_string(), "2026-08-12");
        // Epoch seconds keep working (2024-01-01T00:00:00Z).
        let epoch = parse_timestamp(&json!(1704067200)).unwrap();
        assert_eq!(epoch.format("%Y-%m-%d").to_string(), "2024-01-01");
        // Epoch milliseconds keep working.
        let millis = parse_timestamp(&json!(1704067200000i64)).unwrap();
        assert_eq!(millis.format("%Y-%m-%d").to_string(), "2024-01-01");
    }

    #[test]
    fn missing_rem_is_not_invented_from_in_bed_subtraction() {
        let summary = json!({
            "slp": {
                "st": 1_700_000_000i64,
                "ed": 1_700_021_600i64,
                "ss": 70,
                "stage": [
                    {"mode": 5, "start": 0, "stop": 60},
                    {"mode": 4, "start": 61, "stop": 200}
                ]
            }
        });
        let result = Normalizer::normalize_band_data(&json!({
            "data": [{
                "uuid": "sleep-no-rem",
                "date_time": "2026-08-12",
                "summary": STANDARD.encode(serde_json::to_vec(&summary).unwrap())
            }]
        }))
        .unwrap();
        assert_eq!(result.sleep_sessions[0].rem_minutes, None);
        assert_eq!(result.sleep_sessions[0].time_in_bed_minutes, None);
        assert_eq!(result.sleep_sessions[0].stages.len(), 2);
        assert_eq!(result.sleep_sessions[0].stages[0].stage, "deep");
        assert_eq!(result.sleep_sessions[0].stages[1].stage, "light");
    }

    #[test]
    fn ebt_obt_are_not_treated_as_time_in_bed() {
        let summary = json!({
            "tz": 28800,
            "slp": {
                "st": 1_700_000_000i64,
                "ed": 1_700_021_600i64,
                "ss": 70,
                "ebt": 452,
                "obt": -31,
                "wk": 10,
                "dp": 80,
                "lt": 200
            }
        });
        let result = Normalizer::normalize_band_data(&json!({
            "data": [{
                "uuid": "sleep-ebt",
                "date_time": "2026-08-12",
                "device_id": "SN123",
                "summary": STANDARD.encode(serde_json::to_vec(&summary).unwrap())
            }]
        }))
        .unwrap();
        assert_eq!(result.sleep_sessions[0].time_in_bed_minutes, None);
        assert!(result.sleep_sessions[0].stages.is_empty());
    }

    #[test]
    fn workout_numeric_type_wins_over_endpoint_sport_name() {
        // /v1/sport/run/history.json 不带过滤会返回全部运动类型；
        // 记录自带的数字 type 必须优先于接口路径名，否则骑行/健走/AI 活动
        // 全部被错标成户外跑步。
        let result = Normalizer::normalize_workouts_with_sport(
            &json!({
                "data": {
                    "summary": [
                        {"trackid": 1_700_000_000i64, "end_time": 1_700_003_600i64, "type": 9, "dis": "50010.0"},
                        {"trackid": 1_700_100_000i64, "end_time": 1_700_103_600i64, "type": 223, "calorie": "40.0"},
                        {"trackid": 1_700_200_000i64, "end_time": 1_700_203_600i64, "type": 1, "dis": "15210.0"}
                    ]
                }
            }),
            Some("run"),
        )
        .unwrap();
        assert_eq!(result[0].workout_type, "ride");
        assert_eq!(result[0].zepp_type, Some(9));
        assert_eq!(result[1].workout_type, "activity");
        assert_eq!(result[2].workout_type, "run");
    }

    #[test]
    fn unknown_numeric_workout_never_inherits_endpoint_sport_name() {
        let result = Normalizer::normalize_workouts_with_sport(
            &json!({
                "data": { "summary": [{
                    "trackid": 1_700_300_000i64,
                    "end_time": 1_700_303_600i64,
                    "type": 105,
                    "calorie": 120
                }] }
            }),
            Some("run"),
        )
        .unwrap();
        assert_eq!(result[0].zepp_type, Some(105));
        assert_eq!(result[0].normalized_type, "unknown:105");
        assert_eq!(result[0].type_source, "unknown_code");
        assert_eq!(result[0].effective_type, "unknown:105");
        assert_ne!(result[0].workout_type, "run");
    }

    #[test]
    fn unknown_numeric_workout_uses_explicit_server_title_when_available() {
        let result = Normalizer::normalize_workouts_with_sport(
            &json!({
                "data": { "summary": [{
                    "trackid": 1_700_350_000i64,
                    "end_time": 1_700_353_600i64,
                    "type": 240,
                    "sport_title": "HYROX Training"
                }] }
            }),
            Some("run"),
        )
        .unwrap();
        assert_eq!(result[0].zepp_type, Some(240));
        assert_eq!(result[0].normalized_type, "hyrox_training");
        assert_eq!(result[0].type_source, "string_field");
        assert_ne!(result[0].workout_type, "run");
    }

    #[test]
    fn extended_cloud_codes_cover_strength_and_cross_training() {
        let result = Normalizer::normalize_workouts(&json!({
            "data": { "summary": [
                {"trackid": 1_700_600_000i64, "end_time": 1_700_603_600i64, "type": 52},
                {"trackid": 1_700_700_000i64, "end_time": 1_700_703_600i64, "type": 130}
            ] }
        }))
        .unwrap();
        assert_eq!(result[0].workout_type, "strength");
        assert_eq!(result[1].workout_type, "cross_training");
    }

    #[test]
    fn record_string_type_is_used_only_when_numeric_type_is_absent() {
        let result = Normalizer::normalize_workouts_with_sport(
            &json!({
                "data": { "summary": [
                    {"trackid": 1_700_400_000i64, "end_time": 1_700_403_600i64, "sportType": "Custom Training"},
                    {"trackid": 1_700_500_000i64, "end_time": 1_700_503_600i64}
                ] }
            }),
            Some("run"),
        )
        .unwrap();
        assert_eq!(result[0].normalized_type, "custom_training");
        assert_eq!(result[0].type_source, "string_field");
        assert_eq!(result[1].normalized_type, "unknown");
        assert_eq!(result[1].type_source, "missing");
    }

    #[test]
    fn night_sleep_stages_anchor_to_previous_day_midnight() {
        // 真实报文形态：date_time 是醒来日，stage 分钟数从入睡前夜本地零点
        // 起算（跨午夜 >= 1440）。锚错到当晚会整段 +24h，阶段条渲染为空。
        let summary = json!({
            "tz": 28800,
            "slp": {
                "st": 1_786_897_200i64,   // 2026-08-17 00:20 +08
                "ed": 1_786_930_620i64,   // 2026-08-17 09:37 +08
                "ss": 80,
                "stage": [
                    {"mode": 4, "start": 1460, "stop": 1471},
                    {"mode": 5, "start": 1472, "stop": 1484},
                    {"mode": 11, "start": 1485, "stop": 1492}
                ]
            }
        });
        let result = Normalizer::normalize_band_data(&json!({
            "data": [{
                "uuid": "sleep-night",
                "date_time": "2026-08-17",
                "summary": STANDARD.encode(serde_json::to_vec(&summary).unwrap())
            }]
        }))
        .unwrap();
        let session = &result.sleep_sessions[0];
        assert_eq!(session.stages.len(), 3);
        assert_eq!(session.stages[0].start_time, session.start_time);
        // 新固件 REM 编码 mode=11 也要识别
        assert_eq!(session.stages[2].stage, "rem");
        assert_eq!(session.rem_minutes, Some(8));
    }

    #[test]
    fn workout_geohash_location_is_not_gps_track() {
        let result = Normalizer::normalize_workouts(&json!({
            "data": {
                "summary": [{
                    "trackid": 1_700_000_000i64,
                    "end_time": 1_700_003_600i64,
                    "sport": "run",
                    "dis": 5000,
                    "location": "ws0fsyhekz4d",
                    "deviceid": "AABBCCDDEEFF",
                    "sn": "23229501001311"
                }]
            }
        }))
        .unwrap();
        assert!(!result[0].gps_available);
        assert_eq!(result[0].sample_count, 0);
        assert_eq!(result[0].device_id.as_deref(), Some("AABBCCDDEEFF"));
    }

    /// `all_day_stress` 每天带一条五分钟一个点的全天曲线，以前整条被丢掉。
    ///
    /// 取值是真实报文里 2026-09-02 那一天（当时只同步到 01:00，所以刚好
    /// 13 个点，适合整条写进测试）。只删掉了 `userId`。
    /// 一条真实的 `watch_score` 报文，逐字段照抄本机库里 2026-08-12 那条。
    fn readiness_item() -> Value {
        json!({
            "eventType": "readiness",
            "subType": "watch_score",
            "timestamp": 1786493641000i64,
            "value": {
                "afibBaseLine": 0, "afibInsight": 18, "afibScore": 255,
                "ahiBaseline": 0.3827273, "ahiInsight": 100, "ahiScore": 100,
                "algSubVer": 4, "algVer": 4,
                "deviceId": "app", "deviceSource": 2,
                "hrvBaseline": 101, "hrvInsight": 0, "hrvScore": 71,
                "insightId": 9,
                "mentBaseLine": 96, "mentInsight": 0, "mentScore": 96,
                "phyBaseline": 64, "phyInsight": 64, "phyScore": 64,
                "rdnsInsight": 5, "rdnsScore": 80,
                "rhrBaseline": 49, "rhrInsight": 240, "rhrScore": 74,
                "skinTempBaseLine": -7, "skinTempCalibrated": 11,
                "skinTempInsight": 5, "skinTempScore": 97,
                "sleepHRV": 88, "sleepRHR": 53,
                "status": 200,
                "timestamp": 1786464000000i64,
                "timestampUpdate": 1786493641000i64,
                "timezoneId": "Asia/Shanghai"
            }
        })
    }

    /// 睡眠期 HRV / 静息心率、两个基线、AHI 基线：报文里一直有，v20 之前
    /// 一条都没进过库。
    #[test]
    fn readiness_carries_sleep_hrv_and_the_personal_baselines() {
        let rows =
            Normalizer::normalize_daily_summary(&json!({ "items": [readiness_item()] })).unwrap();
        let daily = |metric: &str| {
            rows.iter()
                .find(|row| row.metric == metric)
                .map(|row| (row.value, row.unit.as_str()))
        };

        assert_eq!(daily("sleep_hrv"), Some((88.0, "ms")));
        assert_eq!(daily("sleep_rhr"), Some((53.0, "bpm")));
        assert_eq!(daily("hrv_baseline"), Some((101.0, "ms")));
        assert_eq!(daily("rhr_baseline"), Some((49.0, "bpm")));
        assert_eq!(daily("ahi_baseline"), Some((0.3827273, "events/h")));

        // 已经在库里的那几项不能因为这次改动跟着变。
        assert_eq!(daily("hrv_readiness"), Some((71.0, "score")));
        assert_eq!(daily("rhr_readiness"), Some((74.0, "score")));
    }

    /// `phyBaseline` / `mentBaseLine` 不收。
    ///
    /// 实测本机 25 348 条 readiness 记录里，它们和 `phyScore` / `mentScore`
    /// **逐条完全相等**——不是基线，是同一个分数换了个名字。这条 fixture 里
    /// 也是 64==64、96==96。收进来只会在库里多两列一模一样的数。
    #[test]
    fn the_physical_and_mental_baselines_are_not_stored_because_they_echo_the_score() {
        let rows =
            Normalizer::normalize_daily_summary(&json!({ "items": [readiness_item()] })).unwrap();
        assert!(!rows.iter().any(|row| row.metric == "physical_baseline"));
        assert!(!rows.iter().any(|row| row.metric == "mental_baseline"));
        assert_eq!(
            rows.iter()
                .find(|row| row.metric == "physical_readiness")
                .map(|row| row.value),
            Some(64.0)
        );
    }

    /// 255 是这条流的「没测到」。`afibScore` 在本机 25 348 条里条条都是 255，
    /// 而 `hrvBaseline` / `rhrBaseline` 各有 7 条是 255。
    #[test]
    fn a_baseline_of_255_is_dropped_rather_than_stored_as_a_reading() {
        let mut item = readiness_item();
        item["value"]["hrvBaseline"] = json!(255);
        item["value"]["rhrBaseline"] = json!(255);
        // AHI 基线的哨兵是 -1，不是 255。
        item["value"]["ahiBaseline"] = json!(-1.0);

        let rows = Normalizer::normalize_daily_summary(&json!({ "items": [item] })).unwrap();
        assert!(!rows.iter().any(|row| row.metric == "hrv_baseline"));
        assert!(!rows.iter().any(|row| row.metric == "rhr_baseline"));
        assert!(!rows.iter().any(|row| row.metric == "ahi_baseline"));
        // 同一条记录里没被哨兵盖掉的仍然要写进去。
        assert!(rows.iter().any(|row| row.metric == "sleep_hrv"));
    }

    /// 三个目标值来自 `DailyHealth` 的 samples，报文照抄 2026-08-12 那条。
    #[test]
    fn the_daily_goals_are_read_from_the_summary_samples() {
        let raw = json!({ "items": [{
            "eventType": "DailyHealth",
            "subType": "summary",
            "timestamp": 1786492800000i64,
            "value": {
                "deviceId": "1,", "deviceSN": "1,",
                "deviceSource": "1,-1", "deviceType": "1,-1",
                "samples": [{
                    "burningDurationGoal": 30, "calorieGoal": 300,
                    "dateString": "2026-08-12", "s": 0, "stepGoal": 8000,
                    "totalBurningDuration": 0, "totalCalories": 12,
                    "totalSteps": 189, "u": 50755973
                }],
                "startTime": 1786492800000i64,
                "timeZone": "1,Asia/Shanghai"
            }
        }] });
        let rows = Normalizer::normalize_daily_summary(&raw).unwrap();
        let daily = |metric: &str| {
            rows.iter()
                .find(|row| row.metric == metric)
                .map(|row| (row.value, row.unit.as_str()))
        };

        assert_eq!(daily("step_goal"), Some((8000.0, "steps")));
        assert_eq!(daily("calorie_goal"), Some((300.0, "kcal")));
        assert_eq!(daily("active_minutes_goal"), Some((30.0, "min")));
        // 当天的实际值仍然照旧。
        assert_eq!(daily("steps"), Some((189.0, "steps")));
    }

    /// 没设目标时报文写 0。0 不是「目标是 0 步」，不写进去。
    #[test]
    fn a_goal_of_zero_means_no_goal_was_set_and_is_not_stored() {
        let raw = json!({ "items": [{
            "eventType": "DailyHealth", "subType": "summary",
            "timestamp": 1786492800000i64,
            "value": { "samples": [{
                "dateString": "2026-08-12", "stepGoal": 0, "calorieGoal": 0,
                "burningDurationGoal": 0, "totalSteps": 189
            }] }
        }] });
        let rows = Normalizer::normalize_daily_summary(&raw).unwrap();
        assert!(!rows.iter().any(|row| row.metric == "step_goal"));
        assert!(!rows.iter().any(|row| row.metric == "calorie_goal"));
        assert!(!rows.iter().any(|row| row.metric == "active_minutes_goal"));
        assert!(rows.iter().any(|row| row.metric == "steps"));
    }

    /// 一条真实的 PAI 报文，照抄本机库里 2026-05-18 那条（去掉两个数组字段）。
    fn pai_item() -> Value {
        json!({
            "age": "20", "dailyPai": "11.707199",
            "deviceId": "D8803CFFFEC19AC6", "deviceSource": "8716544",
            "eventType": "PaiHealthInfo", "gender": "0",
            "highZoneLowerLimit": "158", "highZoneMinutes": "1",
            "highZonePai": "0.88804626", "index": "4",
            "lowZoneLowerLimit": "105", "lowZoneMinutes": "119",
            "lowZonePai": "2.0", "maxHr": "198",
            "mediumZoneLowerLimit": "119", "mediumZoneMinutes": "66",
            "mediumZonePai": "9.277756", "restHr": "65",
            "sn": "23229501001311", "subType": "PaiHealthInfo",
            "time": "1787155200000", "timeZone": "32",
            "timestamp": 1787155200000i64, "totalPai": "50.944435",
            "uploadTimestamp": "1787300767871", "userId": "1181735661",
            "version": "5"
        })
    }

    /// 七天 PAI 总分、三档的分钟数和心率下限。
    ///
    /// `totalPai` 正是 Zepp 界面上那个大数字，以前一直没取；三档的心率下限
    /// 是手表按用户的最大/静息心率算出来的，不是我们切的。
    #[test]
    fn pai_carries_the_total_and_the_three_zones() {
        let batch = Normalizer::normalize_wellness(
            "wellness:pai:user_events:2026-05-18:2026-05-19",
            &json!({ "items": [pai_item()] }),
        );
        let daily = |metric: &str| {
            batch
                .daily_metrics
                .iter()
                .find(|row| row.metric == metric)
                .map(|row| (row.value, row.unit.as_str()))
        };

        assert_eq!(daily("pai_total"), Some((50.944435, "pai")));
        assert_eq!(daily("pai_low_zone_minutes"), Some((119.0, "min")));
        assert_eq!(daily("pai_medium_zone_minutes"), Some((66.0, "min")));
        assert_eq!(daily("pai_high_zone_minutes"), Some((1.0, "min")));
        assert_eq!(daily("pai_low_zone_lower_hr"), Some((105.0, "bpm")));
        assert_eq!(daily("pai_medium_zone_lower_hr"), Some((119.0, "bpm")));
        assert_eq!(daily("pai_high_zone_lower_hr"), Some((158.0, "bpm")));

        // 原来就在的那几项不能跟着变。
        assert_eq!(daily("pai_daily"), Some((11.707199, "pai")));
        assert_eq!(daily("device_max_hr"), Some((198.0, "bpm")));
    }

    /// 某一档一分钟都没进的时候，报文写 0 —— 那是真的 0 分钟，要写进去。
    ///
    /// 和目标值的 0 不是一回事：目标的 0 表示「没设目标」。
    #[test]
    fn zero_minutes_in_a_pai_zone_is_a_real_reading() {
        let mut item = pai_item();
        item["highZoneMinutes"] = json!("0");
        let batch = Normalizer::normalize_wellness(
            "wellness:pai:user_events:2026-05-18:2026-05-19",
            &json!({ "items": [item] }),
        );
        assert_eq!(
            batch
                .daily_metrics
                .iter()
                .find(|row| row.metric == "pai_high_zone_minutes")
                .map(|row| row.value),
            Some(0.0)
        );
    }

    fn all_day_stress_item() -> Value {
        json!({
            "avgStress": "22",
            "data": "[{\"time\":1788307200000,\"value\":32},{\"time\":1788307500000,\"value\":25},{\"time\":1788307800000,\"value\":32},{\"time\":1788308100000,\"value\":48},{\"time\":1788308400000,\"value\":20},{\"time\":1788308700000,\"value\":32},{\"time\":1788309000000,\"value\":33},{\"time\":1788309300000,\"value\":10},{\"time\":1788309600000,\"value\":28},{\"time\":1788309900000,\"value\":6},{\"time\":1788310200000,\"value\":4},{\"time\":1788310500000,\"value\":7},{\"time\":1788310800000,\"value\":11}]",
            "deviceId": "D85403FFFEE4D576",
            "deviceMac": "",
            "deviceSn": "2445B138005129",
            "deviceSource": "10289410",
            "deviceType": "0",
            "eventType": "all_day_stress",
            "highProportion": "0",
            "maxStress": "48",
            "mediumProportion": "0",
            "minStress": "4",
            "normalProportion": "8",
            "relaxProportion": "92",
            "subType": "all_day_stress",
            "timestamp": 1788307200000i64
        })
    }

    #[test]
    fn all_day_stress_yields_the_whole_days_curve() {
        let batch = Normalizer::normalize_wellness(
            "wellness:all_day_stress:user_events:2026-09-02:2026-09-03",
            &json!({ "items": [all_day_stress_item()] }),
        );

        // 13 个点，一个不少——这正是「压力不是 24/7」少掉的东西。
        assert_eq!(batch.metric_samples.len(), 13);
        assert!(batch
            .metric_samples
            .iter()
            .all(|sample| sample.metric == "stress" && sample.unit == "score"));
        assert!(batch
            .metric_samples
            .iter()
            .all(|sample| sample.device_id.as_deref() == Some("D85403FFFEE4D576")));

        let first = &batch.metric_samples[0];
        assert_eq!(first.value, 32.0);
        assert_eq!(first.timestamp.to_rfc3339(), "2026-09-02T00:00:00+00:00");
        let last = batch.metric_samples.last().unwrap();
        assert_eq!(last.value, 11.0);
        assert_eq!(last.timestamp.to_rfc3339(), "2026-09-02T01:00:00+00:00");

        // 服务器给的当日极值就是这条曲线自己的极值：两者是同一次测量，
        // 不是两条碰巧对得上的流。
        let values: Vec<f64> = batch.metric_samples.iter().map(|s| s.value).collect();
        assert_eq!(values.iter().copied().reduce(f64::min), Some(4.0));
        assert_eq!(values.iter().copied().reduce(f64::max), Some(48.0));
    }

    #[test]
    fn all_day_stress_band_proportions_are_read() {
        let batch = Normalizer::normalize_wellness(
            "wellness:all_day_stress:user_events:2026-09-02:2026-09-03",
            &json!({ "items": [all_day_stress_item()] }),
        );

        let daily = |metric: &str| {
            batch
                .daily_metrics
                .iter()
                .find(|row| row.metric == metric)
                .map(|row| row.value)
        };

        assert_eq!(daily("stress"), Some(22.0));
        assert_eq!(daily("stress_min"), Some(4.0));
        assert_eq!(daily("stress_max"), Some(48.0));
        // 报文里的名字是 `relaxProportion`。以前只认 `relaxPct`，那个名字在
        // 1104 条真实记录里一次都没出现过，于是这四项从来没写进过库。
        assert_eq!(daily("stress_relaxed_pct"), Some(92.0));
        assert_eq!(daily("stress_normal_pct"), Some(8.0));
        assert_eq!(daily("stress_medium_pct"), Some(0.0));
        assert_eq!(daily("stress_high_pct"), Some(0.0));
    }

    #[test]
    fn all_day_stress_drops_zero_readings() {
        // Zepp 的压力量程从 1 起。0 在库里 62 626 条真实读数里一次都没有出现，
        // 而这些报文里的 0 一贯表示「没测到」——画成 0 会看起来像那一刻
        // 特别放松。
        let batch = Normalizer::normalize_wellness(
            "wellness:all_day_stress:user_events:2026-09-02:2026-09-03",
            &json!({ "items": [{
                "eventType": "all_day_stress",
                "timestamp": 1788307200000i64,
                "data": "[{\"time\":1788307200000,\"value\":0},{\"time\":1788307500000,\"value\":25}]"
            }] }),
        );

        assert_eq!(batch.metric_samples.len(), 1);
        assert_eq!(batch.metric_samples[0].value, 25.0);
    }
    /// 一条真实响应的形状（2026-09-04 从线上账号取回后脱敏，读数换成了别的数）。
    ///
    /// 三条记录刻意各不相同：`summary` 的键集合在真实账号上就是变的，而
    /// `timeZone` 在同一个账号的三条记录上分别是 IANA 名、`GMT+08:00` 和一串
    /// 毫秒偏移。解析要靠 `generatedTime`，不能去碰这锅时区汤。
    fn weight_payload() -> Value {
        serde_json::json!({
            "items": [
                {
                    "generatedTime": 1764743530_i64,
                    "createTime": 1764743529_i64,
                    "weightType": 1,
                    "memberId": "-1",
                    "deviceSource": -1,
                    "appName": "com.xiaomi.hm.health",
                    "userId": "1",
                    "summary": {
                        "weight": 68.2, "bmi": 22.1, "height": 175.0,
                        "age": 30, "bodyStyle": 0, "dataSourceType": 1,
                        "deviceSn": "", "deviceType": 1, "source": 1,
                        "syncHealthConnect": false, "timeZone": "Asia/Shanghai"
                    }
                },
                {
                    "generatedTime": 1738465258_i64,
                    "createTime": 1738465258_i64,
                    "weightType": 1,
                    "memberId": "-1",
                    "summary": {
                        "weight": 69.0, "bmi": 22.5, "height": 175.0,
                        "bodyBalanceScore": 55, "oneFootMeasureTime": 55.0,
                        "encryptImpedance": "x", "deviceType": 1, "source": 1,
                        "syncHealth": 1, "syncHealthConnect": false
                    }
                },
                {
                    "generatedTime": 1722772344_i64,
                    "createTime": 1722772344_i64,
                    "weightType": 0,
                    "memberId": "-1",
                    "summary": {
                        "weight": 70.4, "bmi": 23.0, "height": 175.0,
                        "timeZone": "28800000", "source": -1, "deviceType": 1
                    }
                }
            ]
        })
    }

    fn samples_named<'a>(
        batch: &'a WellnessNormalizedData,
        metric: &str,
    ) -> Vec<&'a MetricSample> {
        batch
            .metric_samples
            .iter()
            .filter(|sample| sample.metric == metric)
            .collect()
    }

    /// 这一条是整个功能的理由：以前它一条记录都取不到，因为问的是另一个面。
    #[test]
    fn a_weigh_in_becomes_timestamped_samples_not_daily_rows() {
        let batch = Normalizer::normalize_weight(&weight_payload());

        let weights = samples_named(&batch, "weight");
        assert_eq!(weights.len(), 3, "三条记录就该出三条体重样本");
        // 一天可能称好几次，所以是 metric_samples 而不是 daily_metrics。
        assert!(
            batch.daily_metrics.is_empty(),
            "体重不该被压成一天一个数字"
        );
        assert_eq!(weights[0].unit, "kg");

        // generatedTime 是 Unix 秒。当成毫秒读会落在五万年后，而那种错法在图上
        // 只表现为「一条数据都没有」——正是这次要修的症状的另一种形态。
        assert_eq!(
            weights[0].timestamp.format("%Y-%m-%d").to_string(),
            "2025-12-03",
            "时间戳按秒解读"
        );
        assert!(
            weights.iter().all(|sample| {
                let year: i32 = sample.timestamp.format("%Y").to_string().parse().unwrap();
                (2024..=2026).contains(&year)
            }),
            "没有一条落在离谱的年份上"
        );
    }

    /// `summary` 的键集合逐条不同，缺字段是常态，不是错误。
    #[test]
    fn a_summary_missing_fields_yields_fewer_samples_not_an_error() {
        let batch = Normalizer::normalize_weight(&weight_payload());
        assert_eq!(samples_named(&batch, "bmi").len(), 3);
        assert_eq!(samples_named(&batch, "height").len(), 3);
        // 只有第二条带 bodyBalanceScore。
        assert_eq!(samples_named(&batch, "body_balance_score").len(), 1);
        // 这个账号没有秤，所以体成分字段一个都不该被凭空造出来。
        for metric in ["body_fat_rate", "muscle_mass", "bone_mass", "bmr"] {
            assert!(
                samples_named(&batch, metric).is_empty(),
                "{metric} 在没有这个字段时不该出现"
            );
        }
    }

    /// 名字对上了，数字对不上，就不能当成那个指标。
    ///
    /// 体成分那几个字段名来自生态而不是我们见过的响应。名字撞上、含义不同的
    /// 那一刻，把它画进体脂率曲线比什么都不显示更糟——用户会当真。
    #[test]
    fn a_reading_outside_the_plausible_range_is_dropped_and_reported() {
        let payload = serde_json::json!({
            "items": [{
                "generatedTime": 1764743530_i64,
                "summary": { "weight": 68.2, "fatRate": 1980.0 }
            }]
        });
        let batch = Normalizer::normalize_weight(&payload);
        assert_eq!(samples_named(&batch, "weight").len(), 1, "体重照常收下");
        assert!(
            samples_named(&batch, "body_fat_rate").is_empty(),
            "1980 不可能是体脂率"
        );
        assert!(
            batch
                .diagnostics
                .iter()
                .any(|line| line.contains("body_fat_rate")),
            "丢掉了就要说出来，否则没人知道这个名字其实是别的意思：{:?}",
            batch.diagnostics
        );
    }

    /// 有秤的用户一旦同步，他们的真实字段名就会出现在诊断里。
    ///
    /// 这是我们在没有秤的情况下唯一诚实的补全路径：不猜名字，让数据自己报上来。
    #[test]
    fn unrecognised_summary_fields_are_reported_so_they_can_be_named_later() {
        let payload = serde_json::json!({
            "items": [{
                "generatedTime": 1764743530_i64,
                "summary": { "weight": 68.2, "someUnknownScaleField": 12.5 }
            }]
        });
        let batch = Normalizer::normalize_weight(&payload);
        let joined = batch.diagnostics.join(" ");
        assert!(
            joined.contains("someUnknownScaleField"),
            "没见过的字段要报出来：{joined}"
        );
        // 已经认识的上下文字段不该混进这条诊断里，否则真正的新名字会被淹没。
        assert!(!joined.contains("timeZone"));
    }

    /// 空响应是事实，不是故障：没有秤、也没手填过体重的账号就是这样。
    #[test]
    fn an_empty_page_is_not_an_error() {
        let batch = Normalizer::normalize_weight(&serde_json::json!({ "items": [] }));
        assert!(batch.metric_samples.is_empty());
        assert!(batch.diagnostics.is_empty(), "空不是需要解释的事");
    }

    /// 导出按类型选，库里按指标名存，两边的名单必须对得上。
    #[test]
    fn every_body_metric_is_exportable() {
        for spec in &BODY_METRICS {
            assert!(
                crate::storage::BODY_COMPOSITION_METRICS.contains(&spec.metric),
                "{} 写得进库却导不出去",
                spec.metric
            );
        }
        assert_eq!(
            BODY_METRICS.len(),
            crate::storage::BODY_COMPOSITION_METRICS.len()
        );
    }
}
