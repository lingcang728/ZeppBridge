//! Normalizer 的主入口：心率、手环数据、运动、HRV、日摘要（从 normalizer/mod.rs 拆出，逻辑不变）。

use super::*;

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
            let value =
                object.and_then(|o| first_number(o, &["value", "heartRate", "heart_rate", "hr"]));
            let (Some(timestamp), Some(value)) = (timestamp, value) else {
                diagnostics.push(format!("item {index}: 缺少 timestamp/value"));
                continue;
            };
            // 0 bpm 是哨兵「没测到」，不是一次真实心跳。分数类指标的 0 不能走这条规则。
            if !value.is_finite() || !(1.0..=300.0).contains(&value) {
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
                        Ok(session) => {
                            if session.stages.is_empty()
                                && sleep
                                    .get("stage")
                                    .and_then(Value::as_array)
                                    .is_some_and(|stages| !stages.is_empty())
                                && first_value(summary, &["tz"]).is_none()
                            {
                                diagnostics.push(format!(
                                    "item {index}: 睡眠阶段缺少 tz，未按 UTC 臆造时刻"
                                ));
                            }
                            sleep_sessions.push(session);
                        }
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

    pub fn normalize_workouts_with_sport(raw: &Value, sport: Option<&str>) -> Result<Vec<Workout>> {
        Self::normalize_workouts_with_diagnostics_and_sport(raw, sport)?.into_result("workouts")
    }

    pub(super) fn normalize_workouts_with_diagnostics_and_sport(
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
                // 和下面 min_hr/total_steps 等字段同一条规则：负数是「没测到」
                // 的哨兵，不是真实读数，滤掉而不是原样存进去。
                calories: first_number(object, &["calories", "calorie"])
                    .filter(|value| *value >= 0.0)
                    .map(|v| v as i32),
                avg_hr: first_number(
                    object,
                    &["avg_hr", "avgHr", "averageHeartRate", "avg_heart_rate"],
                )
                .filter(|value| *value > 0.0)
                .map(|v| v as i32),
                max_hr: first_number(
                    object,
                    &["max_hr", "maxHr", "maximumHeartRate", "max_heart_rate"],
                )
                .filter(|value| *value > 0.0)
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
                                base.and_then(|value| add_milliseconds(value, offset_ms))
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
        let batch = Self::normalize_daily_summary_with_diagnostics(raw)?;
        // 全是「那天没有 Charge 分数」的条目：认得出，只是没有值。按日入库以后这
        // 很常见（一个月里总有一两天），不能当成解析失败。
        if batch.records.is_empty()
            && extract_items(raw)?
                .iter()
                .all(|item| item.as_object().is_some_and(is_scoreless_charge_day))
        {
            return Ok(Vec::new());
        }
        batch.into_result("daily_summary")
    }

    pub fn normalize_daily_summary_with_diagnostics(
        raw: &Value,
    ) -> Result<NormalizedBatch<DailyMetric>> {
        let items = extract_items(raw)?;
        let mut indexed_items = items.iter().enumerate().collect::<Vec<_>>();
        // 有明确日历日的条目排在后面：canonical 按插入覆盖，date-only 不能输给
        // 仅有 epoch、按 UTC 切日的回退值。
        indexed_items.sort_by_key(|(_, item)| daily_summary_sort_key(item));
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
pub(super) fn zepp_sport_type_name(type_id: i64) -> Option<&'static str> {
    crate::sport_catalog::resolve(type_id)
}

pub(super) fn normalize_type_text(value: &str) -> String {
    let normalized = value.trim().to_lowercase().replace([' ', '-'], "_");
    if normalized.is_empty() {
        "unknown".to_owned()
    } else {
        normalized
    }
}
