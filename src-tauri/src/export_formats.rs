//! CSV / GPX 转换。
//!
//! 输入固定是 `Database::build_ai_export` 产出的标准化 JSON，两个转换器都
//! 只做重排，不回查数据库，也不引入任何派生值。
//!
//! 两条硬规则：
//! 1. 只输出本地库里真实存在的值。缺失字段直接不出行、不出标签，绝不补零。
//! 2. 没有可输出内容时返回错误，不落一个「只有表头」或「空 gpx」的文件，
//!    避免用户以为导出成功。

use chrono::{DateTime, FixedOffset};
use serde_json::Value;

/// CSV 用长表（tidy）而不是宽表：四类记录字段集合完全不同，宽表会逼出大量
/// 空列，长表则天然表达「这条记录没有这个指标」。
const CSV_HEADER: &str =
    "record_type,record_id,start_time,end_time,metric,value,unit,source_scope,device_id";

/// Excel 在简体中文 Windows 上默认按本地代码页读 CSV，没有 BOM 时中文会乱码。
const UTF8_BOM: &str = "\u{feff}";

/// 睡眠里可以展开成 metric 行的标量字段及其单位。
const SLEEP_METRICS: [(&str, &str); 6] = [
    ("duration_minutes", "minutes"),
    ("score", "score"),
    ("deep_minutes", "minutes"),
    ("light_minutes", "minutes"),
    ("rem_minutes", "minutes"),
    ("awake_minutes", "minutes"),
];

/// 运动里可以展开成 metric 行的标量字段及其单位。
const WORKOUT_METRICS: [(&str, &str); 6] = [
    ("distance_meters", "meters"),
    ("calories", "kcal"),
    ("avg_hr", "bpm"),
    ("max_hr", "bpm"),
    ("training_load", ""),
    ("vo2max", "ml/kg/min"),
];

/// 把标准化导出 JSON 转成长表 CSV，返回 `(文本, 数据行数)`。
///
/// 逐点采样与 GPS 轨迹**不进 CSV**：它们是每秒一条的序列，混进汇总表会让
/// 行数暴涨且语义混乱。需要序列请用 GPX 或 JSON。
pub(crate) fn to_csv(export: &Value) -> Result<(String, usize), String> {
    let data = export
        .get("data")
        .ok_or_else(|| "导出数据结构异常：缺少 data 段".to_string())?;

    let mut rows = String::new();
    let mut count = 0usize;

    for sample in array(data, "metric_samples") {
        let Some(value) = number_text(sample.get("value")) else {
            continue;
        };
        push_row(
            &mut rows,
            &[
                "metric_sample",
                "",
                text(sample.get("timestamp")),
                "",
                text(sample.get("metric")),
                &value,
                text(sample.get("unit")),
                text(sample.get("source_scope")),
                text(sample.get("device_id")),
            ],
        );
        count += 1;
    }

    for daily in array(data, "daily_metrics") {
        let Some(value) = number_text(daily.get("value")) else {
            continue;
        };
        push_row(
            &mut rows,
            &[
                "daily_metric",
                "",
                text(daily.get("date")),
                "",
                text(daily.get("metric")),
                &value,
                text(daily.get("unit")),
                text(daily.get("source_scope")),
                text(daily.get("device_id")),
            ],
        );
        count += 1;
    }

    for session in array(data, "sleep_sessions") {
        for (metric, unit) in SLEEP_METRICS {
            let Some(value) = number_text(session.get(metric)) else {
                continue;
            };
            push_row(
                &mut rows,
                &[
                    "sleep_session",
                    text(session.get("sleep_id")),
                    text(session.get("start_time")),
                    text(session.get("end_time")),
                    metric,
                    &value,
                    unit,
                    text(session.get("source_scope")),
                    text(session.get("device_id")),
                ],
            );
            count += 1;
        }
    }

    for workout in array(data, "workouts") {
        let workout_id = text(workout.get("workout_id"));
        let start = text(workout.get("start_time"));
        let end = text(workout.get("end_time"));
        let scope = text(workout.get("source_scope"));
        let device = text(workout.get("device_id"));

        // 运动类型是字符串而不是数值，但丢掉它会让 CSV 无法区分跑步和骑行，
        // 因此单独占一行放进 value 列。
        let workout_type = text(
            workout
                .get("effective_type")
                .or_else(|| workout.get("workout_type")),
        );
        if !workout_type.is_empty() {
            push_row(
                &mut rows,
                &[
                    "workout",
                    workout_id,
                    start,
                    end,
                    "workout_type",
                    workout_type,
                    "",
                    scope,
                    device,
                ],
            );
            count += 1;
        }

        for (metric, unit) in WORKOUT_METRICS {
            let Some(value) = number_text(workout.get(metric)) else {
                continue;
            };
            push_row(
                &mut rows,
                &[
                    "workout", workout_id, start, end, metric, &value, unit, scope, device,
                ],
            );
            count += 1;
        }
    }

    if count == 0 {
        return Err("这段时间没有可写入 CSV 的记录".to_string());
    }

    Ok((format!("{UTF8_BOM}{CSV_HEADER}\n{rows}"), count))
}

/// 把标准化导出 JSON 转成 GPX 1.1，返回 `(XML, 轨迹点数)`。
///
/// 只有真的解码出 GPS 点的运动才会生成 `<trk>`；一个点都没有时直接报错，
/// 而不是产出一个空轨迹文件。心率只在时间戳与逐点采样**完全一致**时写入
/// Garmin `TrackPointExtension`，不做就近匹配或插值。
pub(crate) fn to_gpx(export: &Value) -> Result<(String, usize), String> {
    let data = export
        .get("data")
        .ok_or_else(|| "导出数据结构异常：缺少 data 段".to_string())?;

    let mut tracks = String::new();
    let mut points = 0usize;

    for workout in array(data, "workouts") {
        let route = array(workout, "route");
        if route.is_empty() {
            continue;
        }

        let heart_rates = heart_rate_index(workout);
        let resumes = pause_resume_times(workout);

        let workout_type = text(
            workout
                .get("effective_type")
                .or_else(|| workout.get("workout_type")),
        );
        let start = text(workout.get("start_time"));
        let name = if start.is_empty() {
            workout_type.to_string()
        } else {
            format!("{workout_type} {start}").trim().to_string()
        };

        tracks.push_str("  <trk>\n");
        tracks.push_str(&format!("    <name>{}</name>\n", escape_xml(&name)));
        if !workout_type.is_empty() {
            tracks.push_str(&format!("    <type>{}</type>\n", escape_xml(workout_type)));
        }
        tracks.push_str(&format!(
            "    <desc>workout_id: {}</desc>\n",
            escape_xml(text(workout.get("workout_id")))
        ));
        tracks.push_str("    <trkseg>\n");

        let mut previous: Option<DateTime<FixedOffset>> = None;
        for point in route {
            let (Some(lat), Some(lon)) = (
                point.get("latitude").and_then(Value::as_f64),
                point.get("longitude").and_then(Value::as_f64),
            ) else {
                continue;
            };
            let timestamp = text(point.get("timestamp"));
            let parsed = parse_time(timestamp);

            // 暂停后重新开始记录的点属于新的 trkseg，否则轨迹会跨过休息时间
            // 直接连成一条假直线。
            if let (Some(previous), Some(current)) = (previous, parsed) {
                if resumes
                    .iter()
                    .any(|resume| *resume > previous && *resume <= current)
                {
                    tracks.push_str("    </trkseg>\n    <trkseg>\n");
                }
            }
            if parsed.is_some() {
                previous = parsed;
            }

            tracks.push_str(&format!(
                "      <trkpt lat=\"{lat:.6}\" lon=\"{lon:.6}\">\n"
            ));
            if let Some(altitude) = point.get("altitude_m").and_then(Value::as_f64) {
                tracks.push_str(&format!("        <ele>{altitude:.1}</ele>\n"));
            }
            if !timestamp.is_empty() {
                tracks.push_str(&format!("        <time>{}</time>\n", escape_xml(timestamp)));
            }
            if let Some(hr) = heart_rates
                .iter()
                .find(|(sample_time, _)| *sample_time == timestamp)
                .map(|(_, hr)| *hr)
            {
                tracks.push_str("        <extensions>\n          <gpxtpx:TrackPointExtension>\n");
                tracks.push_str(&format!("            <gpxtpx:hr>{hr}</gpxtpx:hr>\n"));
                tracks.push_str("          </gpxtpx:TrackPointExtension>\n        </extensions>\n");
            }
            tracks.push_str("      </trkpt>\n");
            points += 1;
        }

        tracks.push_str("    </trkseg>\n  </trk>\n");
    }

    if points == 0 {
        return Err("这段时间没有可导出的 GPS 轨迹（只有含轨迹点的运动才能生成 GPX）".to_string());
    }

    let generated_at = text(export.get("generated_at"));
    let mut gpx = String::from("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
    gpx.push_str(
        "<gpx version=\"1.1\" creator=\"ZeppBridge\" \
xmlns=\"http://www.topografix.com/GPX/1/1\" \
xmlns:gpxtpx=\"http://www.garmin.com/xmlschemas/TrackPointExtension/v1\">\n",
    );
    if !generated_at.is_empty() {
        gpx.push_str(&format!(
            "  <metadata>\n    <time>{}</time>\n  </metadata>\n",
            escape_xml(generated_at)
        ));
    }
    gpx.push_str(&tracks);
    gpx.push_str("</gpx>\n");

    Ok((gpx, points))
}

fn array<'a>(parent: &'a Value, key: &str) -> &'a [Value] {
    parent
        .get(key)
        .and_then(Value::as_array)
        .map(Vec::as_slice)
        .unwrap_or(&[])
}

/// 字符串字段：`null` 与非字符串一律当空，交给调用方决定是否跳过。
fn text(value: Option<&Value>) -> &str {
    value.and_then(Value::as_str).unwrap_or("")
}

/// 数值字段：`null` / 缺失 / 非数值返回 `None`，让调用方整行跳过而不是写 0。
fn number_text(value: Option<&Value>) -> Option<String> {
    let number = value?.as_f64()?;
    if !number.is_finite() {
        return None;
    }
    if number.fract() == 0.0 && number.abs() < 1e15 {
        Some(format!("{}", number as i64))
    } else {
        Some(format!("{number}"))
    }
}

fn heart_rate_index(workout: &Value) -> Vec<(&str, i64)> {
    array(workout, "samples")
        .iter()
        .filter_map(|sample| {
            let timestamp = sample.get("timestamp")?.as_str()?;
            let heart_rate = sample.get("heart_rate")?.as_i64()?;
            Some((timestamp, heart_rate))
        })
        .collect()
}

fn pause_resume_times(workout: &Value) -> Vec<DateTime<FixedOffset>> {
    array(workout, "pauses")
        .iter()
        .filter_map(|pause| parse_time(text(pause.get("end_time"))))
        .collect()
}

fn parse_time(value: &str) -> Option<DateTime<FixedOffset>> {
    DateTime::parse_from_rfc3339(value).ok()
}

fn push_row(out: &mut String, fields: &[&str; 9]) {
    for (index, field) in fields.iter().enumerate() {
        if index > 0 {
            out.push(',');
        }
        out.push_str(&escape_csv(field));
    }
    out.push('\n');
}

fn escape_csv(value: &str) -> String {
    if value.contains([',', '"', '\n', '\r']) {
        format!("\"{}\"", value.replace('"', "\"\""))
    } else {
        value.to_string()
    }
}

fn escape_xml(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn export_with(data: Value) -> Value {
        json!({ "generated_at": "2026-08-24T10:00:00+08:00", "data": data })
    }

    #[test]
    fn csv_skips_missing_values_instead_of_writing_zero() {
        let export = export_with(json!({
            "metric_samples": [
                { "metric": "heart_rate", "timestamp": "2026-08-24T09:00:00+08:00",
                  "value": 72, "unit": "bpm", "source_scope": "device", "device_id": null },
                { "metric": "heart_rate", "timestamp": "2026-08-24T09:01:00+08:00",
                  "value": null, "unit": "bpm", "source_scope": "device", "device_id": null }
            ],
            "sleep_sessions": [
                { "sleep_id": "s1", "start_time": "2026-08-23T23:00:00+08:00",
                  "end_time": "2026-08-24T07:00:00+08:00", "score": null,
                  "duration_minutes": 480, "rem_minutes": null, "source_scope": "device" }
            ]
        }));

        let (csv, rows) = to_csv(&export).unwrap();

        assert_eq!(rows, 2, "空值必须整行跳过，不能补零");
        assert!(
            csv.starts_with(UTF8_BOM),
            "缺 BOM 时 Excel 会把中文读成乱码"
        );
        assert!(csv.contains("metric_sample,,2026-08-24T09:00:00+08:00,,heart_rate,72,bpm,device,"));
        assert!(csv.contains("sleep_session,s1,"));
        assert!(!csv.contains(",score,"), "缺失的评分不应出现");
        assert!(!csv.contains(",rem_minutes,"), "未提供的 REM 不应出现");
    }

    #[test]
    fn csv_quotes_fields_containing_separators() {
        let export = export_with(json!({
            "workouts": [
                { "workout_id": "w,1", "workout_type": "户外跑步 \"晨跑\"",
                  "start_time": "2026-08-24T06:00:00+08:00", "end_time": "2026-08-24T07:00:00+08:00",
                  "distance_meters": 5012.5, "calories": null, "source_scope": "device" }
            ]
        }));

        let (csv, rows) = to_csv(&export).unwrap();

        assert_eq!(rows, 2, "类型行 + 距离行；缺失的热量不出行");
        assert!(csv.contains("\"w,1\""), "含逗号的 ID 必须加引号");
        assert!(
            csv.contains("\"户外跑步 \"\"晨跑\"\"\""),
            "引号必须成对转义"
        );
        assert!(csv.contains(",distance_meters,5012.5,meters,"));
    }

    #[test]
    fn csv_refuses_to_write_a_header_only_file() {
        let export = export_with(json!({ "metric_samples": [], "workouts": [] }));
        let error = to_csv(&export).unwrap_err();
        assert!(error.contains("没有可写入 CSV 的记录"), "实际错误：{error}");
    }

    #[test]
    fn gpx_emits_points_and_only_matches_heart_rate_on_exact_timestamps() {
        let export = export_with(json!({
            "workouts": [
                {
                    "workout_id": "w1", "workout_type": "outdoor_running",
                    "start_time": "2026-08-24T06:00:00+08:00",
                    "route": [
                        { "timestamp": "2026-08-24T06:00:00+08:00", "latitude": 31.2304,
                          "longitude": 121.4737, "altitude_m": 12.4 },
                        { "timestamp": "2026-08-24T06:00:01+08:00", "latitude": 31.2305,
                          "longitude": 121.4738, "altitude_m": null }
                    ],
                    "samples": [
                        { "timestamp": "2026-08-24T06:00:00+08:00", "heart_rate": 132 },
                        { "timestamp": "2026-08-24T06:00:09+08:00", "heart_rate": 150 }
                    ],
                    "pauses": []
                }
            ]
        }));

        let (gpx, points) = to_gpx(&export).unwrap();

        assert_eq!(points, 2);
        assert!(gpx.contains("<trkpt lat=\"31.230400\" lon=\"121.473700\">"));
        assert!(gpx.contains("<ele>12.4</ele>"));
        assert_eq!(
            gpx.matches("<gpxtpx:hr>").count(),
            1,
            "只有时间戳精确命中的点带心率"
        );
        assert!(gpx.contains("<gpxtpx:hr>132</gpxtpx:hr>"));
        assert!(!gpx.contains("150"), "不得把邻近采样的心率安到别的点上");
    }

    #[test]
    fn gpx_splits_segments_after_a_pause() {
        let export = export_with(json!({
            "workouts": [
                {
                    "workout_id": "w1", "workout_type": "outdoor_running",
                    "route": [
                        { "timestamp": "2026-08-24T06:00:00+08:00", "latitude": 31.0, "longitude": 121.0 },
                        { "timestamp": "2026-08-24T06:10:00+08:00", "latitude": 31.1, "longitude": 121.1 }
                    ],
                    "samples": [],
                    "pauses": [
                        { "start_time": "2026-08-24T06:02:00+08:00",
                          "end_time": "2026-08-24T06:05:00+08:00", "kind": "manual" }
                    ]
                }
            ]
        }));

        let (gpx, points) = to_gpx(&export).unwrap();

        assert_eq!(points, 2);
        assert_eq!(
            gpx.matches("<trkseg>").count(),
            2,
            "暂停两侧不能连成一条假直线"
        );
    }

    #[test]
    fn gpx_refuses_to_write_an_empty_track_and_escapes_xml() {
        let without_route = export_with(json!({
            "workouts": [
                { "workout_id": "w1", "workout_type": "indoor_cycling", "route": [], "samples": [] }
            ]
        }));
        let error = to_gpx(&without_route).unwrap_err();
        assert!(error.contains("没有可导出的 GPS 轨迹"), "实际错误：{error}");

        let with_markup = export_with(json!({
            "workouts": [
                {
                    "workout_id": "a<b&c", "workout_type": "run & walk",
                    "start_time": "2026-08-24T06:00:00+08:00",
                    "route": [{ "timestamp": "2026-08-24T06:00:00+08:00",
                                "latitude": 31.0, "longitude": 121.0 }],
                    "samples": []
                }
            ]
        }));
        let (gpx, _) = to_gpx(&with_markup).unwrap();
        assert!(gpx.contains("run &amp; walk"));
        assert!(gpx.contains("a&lt;b&amp;c"));
        assert!(!gpx.contains("a<b&c"), "未转义的 XML 会让轨迹文件打不开");
    }
}
