//! Experimental numeric blood-pressure shapes seen in public clients, not a
//! captured response from issue #115. Never derive a pair or time from a chart.
use super::*;

pub(super) fn blood_pressure_samples(items: &[Value], out: &mut WellnessNormalizedData) {
    for item in items {
        let Some(object) = item.as_object() else {
            continue;
        };
        let values = object
            .get("value")
            .or_else(|| object.get("summary"))
            .and_then(Value::as_object)
            .unwrap_or(object);
        let timestamp = first_value_from(
            object,
            Some(values),
            &["timestamp", "time", "startTime", "generatedTime"],
        )
        .and_then(|value| {
            value
                .as_str()
                .and_then(|text| DateTime::parse_from_rfc3339(text).ok())
                .map(|at| at.with_timezone(&Utc))
                .or_else(|| {
                    parse_number(value)
                        .filter(|number| *number >= 946_684_800.0)
                        .and_then(|_| parse_timestamp(value))
                })
        })
        .filter(|at| at.year() >= 2000 && timestamp_not_unreasonably_future(*at));
        let systolic = first_number(values, &["systolic", "highPressure", "sys"]);
        let diastolic = first_number(values, &["diastolic", "lowPressure", "dia"]);
        let (Some(timestamp), Some(systolic), Some(diastolic)) = (timestamp, systolic, diastolic)
        else {
            out.diagnostics
                .push("blood_pressure: 缺少明确时间戳或成对读数，仅保留原始报文".into());
            continue;
        };
        let unit = first_string(values, &["unit"]).or_else(|| first_string(object, &["unit"]));
        if !systolic.is_finite()
            || !diastolic.is_finite()
            || !(1.0..=400.0).contains(&systolic)
            || !(1.0..=300.0).contains(&diastolic)
            || systolic <= diastolic
            || unit
                .as_deref()
                .is_some_and(|unit| !unit.eq_ignore_ascii_case("mmHg"))
        {
            out.diagnostics
                .push("blood_pressure: 读数或单位无法识别，仅保留原始报文".into());
            continue;
        }
        for (metric, value) in [
            ("blood_pressure_systolic", systolic),
            ("blood_pressure_diastolic", diastolic),
        ] {
            out.metric_samples.push(MetricSample {
                metric: metric.into(),
                timestamp,
                value,
                unit: "mmHg".into(),
                source_scope: SourceScope::UserFused,
                device_id: None,
            });
        }
        if let Some(pulse) = first_number(values, &["pulse", "heartRate", "heart_rate"])
            .filter(|value| value.is_finite() && (1.0..=300.0).contains(value))
        {
            out.metric_samples.push(MetricSample {
                metric: "blood_pressure_pulse".into(),
                timestamp,
                value: pulse,
                unit: "bpm".into(),
                source_scope: SourceScope::UserFused,
                device_id: None,
            });
        }
    }
    if !items.is_empty() {
        out.diagnostics.push(
            "blood_pressure: 候选字段映射，尚待实际测量账号核对；测量方式和校准信息仅保留在原文"
                .into(),
        );
    }
}
