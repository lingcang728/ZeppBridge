//! 从手环数据条目里拆出睡眠、分阶段、心率与日指标（从 normalizer/mod.rs 拆出）。

use super::*;

pub(super) fn sleep_from_band_item(
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

    let deep_minutes = optional_band_stage_minutes(sleep, &["dp", "deepMinutes"], &[5]);
    let light_minutes = optional_band_stage_minutes(sleep, &["lt", "lightMinutes"], &[4]);
    let awake_minutes = optional_band_stage_minutes(sleep, &["wk", "awakeMinutes"], &[7]);
    let rem_from_field = first_number(sleep, &["rm", "remMinutes", "rem"])
        .map(|value| value.round() as i32)
        .filter(|value| *value >= 0);
    let rem_from_stages = band_stage_minutes(sleep, 8) + band_stage_minutes(sleep, 11);
    let span_minutes = (end_time - start_time).num_minutes().max(0) as i32;
    let rem_minutes = rem_from_field.or_else(|| (rem_from_stages > 0).then_some(rem_from_stages));
    let duration_minutes = first_number(sleep, &["duration", "durationMinutes"])
        .map(|value| value.round() as i32)
        .unwrap_or_else(|| match awake_minutes {
            Some(awake) => (span_minutes - awake).max(0),
            None => span_minutes,
        });
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

pub(super) fn sleep_from_flat_object(object: &Map<String, Value>) -> Option<SleepSession> {
    let sleep_id = first_string(object, &["sleep_id", "sleepId", "id", "sessionId"])?;
    let start_time =
        first_value(object, &["start_time", "startTime", "beginTime"]).and_then(parse_timestamp)?;
    let end_time =
        first_value(object, &["end_time", "endTime", "finishTime"]).and_then(parse_timestamp)?;
    if end_time <= start_time {
        return None;
    }
    let awake_minutes =
        first_number(object, &["awake_minutes", "awakeMinutes", "awake"]).map(duration_to_minutes);
    let source_device = device_id(object);
    let span_minutes = (end_time - start_time).num_minutes() as i32;
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
        .unwrap_or_else(|| match awake_minutes {
            Some(awake) => (span_minutes - awake).max(0),
            None => span_minutes.max(0),
        }),
        deep_minutes: first_number(object, &["deep_minutes", "deepMinutes", "deep"])
            .map(duration_to_minutes),
        light_minutes: first_number(object, &["light_minutes", "lightMinutes", "light"])
            .map(duration_to_minutes),
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
pub(super) fn sleep_stage_name(mode: i64) -> &'static str {
    match mode {
        5 => "deep",
        4 => "light",
        // 新固件 REM 也会编码为 11
        8 | 11 => "rem",
        7 => "awake",
        _ => "unknown",
    }
}

pub(super) fn sleep_stages_from_band(
    item: &Map<String, Value>,
    summary: &Map<String, Value>,
    sleep: &Map<String, Value>,
) -> Vec<SleepStageSlice> {
    let Some(date) = first_string(item, &["date_time", "date", "dayId"])
        .and_then(|value| NaiveDate::parse_from_str(&value, "%Y-%m-%d").ok())
    else {
        return Vec::new();
    };
    // 缺 tz 不能当成 UTC 0：旧固件经常不带这个字段，静默用 0 会把阶段整体平移几个时区。
    let Some(timezone_offset) = first_value(summary, &["tz"])
        .and_then(timezone_offset_seconds)
        .map(|value| value.clamp(-18 * 3600, 18 * 3600))
    else {
        return Vec::new();
    };
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
                let start_time = add_minutes(anchor, start)?;
                let end_minutes = stop.checked_add(1)?;
                let end_time = add_minutes(anchor, end_minutes)?;
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
    let prev_day = Duration::try_days(1)
        .and_then(|delta| utc_midnight.checked_sub_signed(delta))
        .map(build)
        .unwrap_or_default();
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

pub(super) fn workout_has_track_geometry(object: &Map<String, Value>) -> bool {
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

pub(super) fn workout_sample_count(object: &Map<String, Value>) -> i64 {
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

/// 阶段分钟：有字段用字段；没有字段但有 stage 数组，按 mode 求和（可以是 0）；
/// 字段和 stage 都没有则是「未提供」，不是 0。
pub(super) fn optional_band_stage_minutes(
    sleep: &Map<String, Value>,
    names: &[&str],
    modes: &[i64],
) -> Option<i32> {
    if let Some(value) = first_number(sleep, names) {
        return Some(value.round() as i32);
    }
    sleep.get("stage").and_then(Value::as_array)?;
    Some(
        modes
            .iter()
            .map(|mode| band_stage_minutes(sleep, *mode))
            .sum(),
    )
}

pub(super) fn band_stage_minutes(sleep: &Map<String, Value>, expected_mode: i64) -> i32 {
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

pub(super) fn heart_rate_from_band_item(
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
    // 缺 tz 不能当成 UTC 0：旧固件经常不带这个字段，静默用 0 会把这一天的
    // 心率样本整体平移几个时区（同一坑见 sleep_stages_from_band）。
    let Some(timezone_offset) = decoded_summary
        .and_then(Value::as_object)
        .and_then(|summary| first_value(summary, &["tz"]))
        .and_then(timezone_offset_seconds)
        .map(|value| value.clamp(-18 * 3600, 18 * 3600))
    else {
        return Ok(Vec::new());
    };
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

pub(super) fn daily_metrics_from_band_summary(
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

pub(super) fn collect_charge_metrics(
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

/// 认得出、只是那天没有分数的 Charge 条目：日期取得到，`samples` 在，但每一格的
/// `total` 都是哨兵（手表那天没算出能量值时给 255）。
///
/// 它和「认不出的报文」要分开：按日入库以后，这样的一天单独成一条报文，把它当
/// 解析失败会让每次同步都报「有响应没有可识别记录」、并把好好的报文关进隔离表。
pub(super) fn is_scoreless_charge_day(event: &Map<String, Value>) -> bool {
    if first_string(event, &["eventType"]).as_deref() != Some("Charge") {
        return false;
    }
    let Some(value) = event.get("value").and_then(Value::as_object) else {
        return false;
    };
    let Some(samples) = value.get("samples").and_then(Value::as_array) else {
        return false;
    };
    summary_date(event, Some(value)).is_some()
        && !samples.is_empty()
        && samples.iter().all(|sample| {
            sample.as_object().is_some_and(|sample| {
                !first_number(sample, &["total"])
                    .is_some_and(|score| (0.0..=100.0).contains(&score))
            })
        })
}

/// `(指标名, 报文里的候选键, 单位, 可信区间)`。
///
/// 单独起个名字是因为 clippy 的 `type_complexity` 不收四元组套二元组，
/// 而这四样缺一不可 —— 尤其是区间：它就是那条「这个字段的哨兵值长什么样」
/// 的规则，每个字段都不一样，共用一条就等于把哨兵当读数写进库。
pub(super) type SentinelMetricSpec = (
    &'static str,
    &'static [&'static str],
    &'static str,
    (f64, f64),
);

pub(super) fn collect_daily_metrics(
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
        if let Some(value) = first_number_from(object, parent, names).filter(|value| {
            value.is_finite()
                && !((metric == "readiness" || metric.ends_with("_readiness")) && *value == 255.0)
        }) {
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
                .filter(|value| value.is_finite() && !(metric == "readiness" && *value == 255.0))
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
