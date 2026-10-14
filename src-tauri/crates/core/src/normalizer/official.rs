//! Zepp 官方开放平台报文的归一化。
//!
//! 每份报文是 `official/fetch.rs` 按天（运动按条、体重按次）拆好的 `{ items, timeZone }`。
//! 能复用旧通道解析器的就翻译成旧通道的字段名再交给它（运动汇总、运动明细、PAI、体重）——
//! 两边是同一套后端，数据格式一样，只是字段改了驼峰名。睡眠、逐分钟心率、每日 / 每小时
//! 步数的形状不同，在这里单独解析。
//!
//! 守着三条禁令（`docs/development/v3-plan.md`）：官方的 `sleepHrv` 不写进任何 HRV 列；
//! 缺失的不补 0；认不出的不猜。

use super::band::normalize_type_text;
use super::*;
use serde_json::json;

/// 一晚官方睡眠，以及 `sleep_sessions` 里只有官方才填得上的两列。
#[derive(Debug, Clone)]
pub struct OfficialSleep {
    pub session: SleepSession,
    /// 官方直接给的 REM 真值（秒）。
    pub rem_seconds: Option<i64>,
    /// 当天小睡总时长（秒）。报文里有 `napStage` 数组而数组是空的——那是「这天没睡午觉」，记 0；
    /// 字段压根没有才是未知。
    pub nap_total_seconds: Option<i64>,
}

fn items(raw: &Value) -> &[Value] {
    raw.get("items")
        .and_then(Value::as_array)
        .map(Vec::as_slice)
        .unwrap_or(&[])
}

fn time_zone(raw: &Value) -> Option<&str> {
    raw.get("timeZone")
        .and_then(Value::as_str)
        .filter(|zone| !zone.is_empty())
}

fn int(object: &Map<String, Value>, key: &str) -> Option<i64> {
    first_number(object, &[key])
        .filter(|value| value.is_finite())
        .map(|value| value.round() as i64)
}

/// 一段分钟数（`stop` 含在内，和旧通道一致）。
fn stage_span_minutes(stage: &Map<String, Value>) -> Option<i64> {
    let start = int(stage, "start")?;
    let stop = int(stage, "stop")?;
    (stop >= start).then_some(stop - start + 1)
}

/// 官方睡眠的 `stage.start/stop` 是某个本地零点起的分钟数，报文却不带时区。
///
/// 用会话开始时刻反推那个零点：`start - 最早一段的分钟数 × 60`，再对齐到 15 分钟
/// （所有真实时区偏移都是 15 分钟的整数倍）。对不上说明这天的阶段和会话对不上，
/// 宁可不画阶段条，也不按猜的零点平移一整晚。
pub fn official_stage_anchor(session_start: i64, earliest_stage_minute: i64) -> Option<i64> {
    let raw = session_start.checked_sub(earliest_stage_minute.checked_mul(60)?)?;
    let snapped = (raw as f64 / 900.0).round() as i64 * 900;
    // 实测两者分秒不差；留两分钟余量给会话起点的取整。任何整分钟的零点离 15 分钟格最多 7.5 分钟，
    // 所以余量不能放宽到分钟级以上，否则这道检查形同虚设。
    ((raw - snapped).abs() <= 120).then_some(snapped)
}

fn official_stages(stages: &[Value], anchor: i64) -> Vec<SleepStageSlice> {
    stages
        .iter()
        .filter_map(Value::as_object)
        .filter_map(|stage| {
            let mode = int(stage, "mode")?;
            let start = int(stage, "start")?;
            let stop = int(stage, "stop")?;
            if stop < start || !(0..=4 * 1440).contains(&start) {
                return None;
            }
            let name = sleep_stage_name(mode);
            Some(SleepStageSlice {
                stage: name.to_string(),
                start_time: DateTime::from_timestamp(anchor + start * 60, 0)?,
                end_time: DateTime::from_timestamp(anchor + (stop + 1) * 60, 0)?,
                raw_mode: (name == "unknown").then_some(mode),
            })
        })
        .collect()
}

/// 官方的运动类型名 → 本应用运动目录里的键。认不出的原样小写（`circuit_mode`），不猜。
pub fn official_workout_type(value: &str) -> String {
    let upper = value.trim().to_uppercase();
    let mapped = match upper.as_str() {
        "OUTDOOR_RUN" | "OUTDOOR_RUNNING" | "RUNNING" => "run",
        "TREADMILL" | "INDOOR_RUN" | "INDOOR_RUNNING" => "treadmill",
        "WALKING" | "OUTDOOR_WALKING" => "walking",
        "INDOOR_WALKING" => "indoor_walking",
        "OUTDOOR_CYCLING" | "CYCLING" => "ride",
        "INDOOR_CYCLING" => "indoor_cycling",
        "MOUNTAINEER" | "MOUNTAINEERING" | "HIKING" => "hiking",
        "TRAIL_RUN" | "TRAIL_RUNNING" => "trail_running",
        "POOL_SWIMMING" => "pool_swimming",
        "OPEN_WATER_SWIMMING" => "open_water_swimming",
        "STRENGTH_TRAINING" | "STRENGTH" => "strength",
        "FREE_TRAINING" => "free_training",
        "YOGA" => "yoga",
        "ROCK_CLIMBING" => "rock_climbing",
        "ACTIVITY" => "activity",
        _ => return normalize_type_text(value),
    };
    mapped.to_string()
}

impl Normalizer {
    /// `/users/-/sleep?interval=daily`：一天一条，有会话的那天才算一晚。
    pub fn normalize_official_sleep(raw: &Value) -> Vec<OfficialSleep> {
        let mut out = Vec::new();
        for item in items(raw).iter().filter_map(Value::as_object) {
            let (Some(start), Some(stop)) = (int(item, "start"), int(item, "stop")) else {
                continue;
            };
            // 没睡的那天官方给 0。
            if start <= 0 || stop <= start {
                continue;
            }
            let (Some(start_time), Some(end_time)) = (
                DateTime::from_timestamp(start, 0),
                DateTime::from_timestamp(stop, 0),
            ) else {
                continue;
            };
            let minutes = |key: &str| {
                int(item, key)
                    .filter(|value| (0..=24 * 60).contains(value))
                    .map(|value| value as i32)
            };
            let deep_minutes = minutes("deepSleepTime");
            let light_minutes = minutes("shallowSleepTime");
            let awake_minutes = minutes("wakeTime");
            let rem_minutes = minutes("rem");
            let span = ((stop - start) / 60) as i32;
            let stages = item
                .get("stage")
                .and_then(Value::as_array)
                .and_then(|stages| {
                    let earliest = stages
                        .iter()
                        .filter_map(Value::as_object)
                        .filter_map(|stage| int(stage, "start"))
                        .min()?;
                    let anchor = official_stage_anchor(start, earliest)?;
                    Some(official_stages(stages, anchor))
                })
                .unwrap_or_default();
            // 空数组 = 确实没睡午觉（0）；有条目但任何一条认不出 = 不知道（None），
            // 不拿认得出的那几条凑一个偏小的总数，更不把全坏的数组加成 0（R10）。
            let nap_total_seconds =
                item.get("napStage")
                    .and_then(Value::as_array)
                    .and_then(|naps| {
                        naps.iter()
                            .map(|nap| nap.as_object().and_then(stage_span_minutes))
                            .sum::<Option<i64>>()
                            .map(|minutes| minutes * 60)
                    });
            // 睡着的时长：有清醒时长就用「在床 − 清醒」；没有就用实测的深睡 + 浅睡
            // （+ REM）——不把未知的清醒当成 0，把在床时长冒充睡着时长（R10）。
            // 两样都没有时只剩在床时长可给，同时记进 time_in_bed 让界面知道。
            let (duration_minutes, time_in_bed_minutes) =
                match (awake_minutes, deep_minutes, light_minutes) {
                    (Some(awake), _, _) => ((span - awake).max(0), None),
                    (None, Some(deep), Some(light)) => {
                        (deep + light + rem_minutes.unwrap_or(0), Some(span))
                    }
                    (None, _, _) => (span, Some(span)),
                };
            out.push(OfficialSleep {
                session: SleepSession {
                    sleep_id: format!("official:{start}"),
                    start_time,
                    end_time,
                    score: int(item, "sleepScore")
                        .filter(|score| (1..=100).contains(score))
                        .map(|score| score as i32),
                    duration_minutes,
                    deep_minutes,
                    light_minutes,
                    rem_minutes,
                    awake_minutes,
                    source_scope: SourceScope::UserFused,
                    device_id: None,
                    synced_at: None,
                    time_in_bed_minutes,
                    stages,
                    wake_count: None,
                },
                rem_seconds: rem_minutes.map(|value| i64::from(value) * 60),
                nap_total_seconds,
            });
        }
        out
    }

    /// `/users/-/heartrates?type=ALL`：逐分钟。没戴表的分钟官方给 0，那不是读数，跳过。
    pub fn normalize_official_heart_rate(raw: &Value) -> Vec<MetricSample> {
        items(raw)
            .iter()
            .filter_map(Value::as_object)
            .filter_map(|item| {
                let value = first_number(item, &["heartRateData"])?;
                if !(25.0..=250.0).contains(&value) {
                    return None;
                }
                Some(MetricSample {
                    metric: "heart_rate".into(),
                    timestamp: DateTime::from_timestamp(int(item, "timestamp")?, 0)?,
                    value,
                    unit: "bpm".into(),
                    source_scope: SourceScope::UserFused,
                    device_id: None,
                })
            })
            .collect()
    }

    /// `/users/-/activities?interval=daily`：和旧通道 `stp` 同一份数据，指标名跟旧通道走。
    pub fn normalize_official_activity_daily(raw: &Value) -> Vec<DailyMetric> {
        let mut out = Vec::new();
        for item in items(raw).iter().filter_map(Value::as_object) {
            let Some(date) = first_string(item, &["date"])
                .filter(|date| NaiveDate::parse_from_str(date, "%Y-%m-%d").is_ok())
            else {
                continue;
            };
            for (metric, key, unit) in [
                ("steps", "steps", "steps"),
                ("distance", "distance", "m"),
                ("active_calories", "calories", "kcal"),
            ] {
                if let Some(value) =
                    first_number(item, &[key]).filter(|value| value.is_finite() && *value >= 0.0)
                {
                    out.push(DailyMetric {
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
        out
    }

    /// `/users/-/activities?interval=hourly`：官方只回有步数的小时。没回的小时就是没有，
    /// 不补 0（图上画成空，而不是画一根 0）。
    ///
    /// 「几点」是请求时那个时区的几点，时区记在报文的 `timeZone` 里；没有就不入库。
    pub fn normalize_official_activity_hourly(raw: &Value) -> Vec<MetricSample> {
        let Some(zone) = time_zone(raw) else {
            return Vec::new();
        };
        items(raw)
            .iter()
            .filter_map(Value::as_object)
            .filter_map(|item| {
                let date =
                    NaiveDate::parse_from_str(&first_string(item, &["date"])?, "%Y-%m-%d").ok()?;
                let hour = int(item, "hour").filter(|hour| (0..24).contains(hour))?;
                let steps = first_number(item, &["steps"])
                    .filter(|value| value.is_finite() && *value >= 0.0)?;
                let midnight = crate::official::fetch::local_midnight_utc(date, zone);
                Some(MetricSample {
                    metric: "steps_hourly".into(),
                    timestamp: midnight + Duration::hours(hour),
                    value: steps,
                    unit: "steps".into(),
                    source_scope: SourceScope::UserFused,
                    device_id: None,
                })
            })
            .collect()
    }

    /// 官方运动汇总 → 旧通道运动汇总的字段名，交给 [`Normalizer::normalize_workouts_with_sport`]。
    pub fn official_sports_as_legacy(raw: &Value) -> Value {
        let items: Vec<Value> = items(raw)
            .iter()
            .filter_map(Value::as_object)
            .map(|item| {
                let mut object = item.clone();
                // 官方的 `type` 是字符串（`OUTDOOR_RUN`），旧通道的 `type` 是数字编号。
                if let Some(kind) = object
                    .remove("type")
                    .and_then(|kind| kind.as_str().map(str::to_string))
                {
                    object.insert(
                        "sportType".into(),
                        Value::String(official_workout_type(&kind)),
                    );
                }
                for (from, to) in [
                    ("averageStepFrequency", "avg_frequency"),
                    ("averageStrideLength", "avg_stride_length"),
                ] {
                    if let Some(value) = object.remove(from) {
                        object.insert(to.into(), value);
                    }
                }
                Value::Object(object)
            })
            .collect();
        json!({ "items": items })
    }

    /// 官方运动明细 → 旧通道明细的字段名，交给 `decode_workout_detail`。
    ///
    /// `distanceInCentimeter` 不映射：旧通道对应的串单位没有核实过，对不上就是编数据。
    pub fn official_detail_as_legacy(raw: &Value) -> Value {
        let mut data = Map::new();
        for (from, to) in [
            ("trackId", "trackid"),
            ("source", "source"),
            ("samplingTime", "time"),
            ("latitudeLongitude", "longitude_latitude"),
            ("altitude", "altitude"),
            ("heartRate", "heart_rate"),
            ("speed", "speed"),
            ("gait", "gait"),
            ("pause", "pause"),
            ("kilometerPace", "kilo_pace"),
        ] {
            if let Some(value) = raw
                .get(from)
                .filter(|value| !value.as_str().is_some_and(str::is_empty))
            {
                data.insert(to.into(), value.clone());
            }
        }
        json!({ "data": data })
    }

    /// 官方体重 `{weight, height, bmi, timestamp}` → 旧通道 weightRecords 的形状。
    pub fn official_body_as_legacy(raw: &Value) -> Value {
        let items: Vec<Value> = items(raw)
            .iter()
            .filter_map(Value::as_object)
            .filter_map(|item| {
                let timestamp = item.get("timestamp")?.clone();
                let mut summary = Map::new();
                for key in ["weight", "height", "bmi"] {
                    if let Some(value) = item.get(key) {
                        summary.insert(key.into(), value.clone());
                    }
                }
                Some(json!({ "generatedTime": timestamp, "summary": summary }))
            })
            .collect();
        json!({ "items": items })
    }
}
