use super::*;

// The numbers mirror the kinds of readings in the screenshot. The JSON
// envelope is a mock of public-client aliases, not the reporter's payload.
#[test]
fn paired_readings_preserve_time_and_keep_pulse_separate() {
    let raw = json!({"items":[
        {"timestamp":1788767100000i64,"value":{"systolic":115,"diastolic":77,"pulse":53,"method":"Auto"}},
        {"generatedTime":1788766500,"summary":{"highPressure":"114","lowPressure":"76"}}
    ]});
    let parsed = Normalizer::normalize_wellness("wellness:blood_pressure:v2_events:mock", &raw);
    assert_eq!(parsed.metric_samples.len(), 5);
    assert_eq!(parsed.metric_samples[0].value, 115.0);
    assert_eq!(parsed.metric_samples[1].value, 77.0);
    assert_eq!(parsed.metric_samples[2].metric, "blood_pressure_pulse");
    assert_eq!(
        parsed.metric_samples[0].timestamp.timestamp_millis(),
        1788767100000
    );
    assert!(parsed
        .metric_samples
        .iter()
        .all(|s| s.metric != "heart_rate"));
    assert!(
        !parsed.diagnostics.is_empty(),
        "experimental mapping must remain explicit"
    );
}

#[test]
fn missing_or_ambiguous_bp_values_never_produce_a_reading() {
    for item in [
        json!({"timestamp":1788767100000i64,"systolic":115}),
        json!({"timestamp":1788767100000i64,"systolic":0,"diastolic":0}),
        json!({"timestamp":1788767100000i64,"systolic":77,"diastolic":115}),
        json!({"timestamp":1788767100000i64,"systolic":15,"diastolic":10,"unit":"kPa"}),
        json!({"date":"2026-09-07","systolic":115,"diastolic":77}),
        json!({"timestamp":20260907,"systolic":115,"diastolic":77}),
    ] {
        let parsed = Normalizer::normalize_wellness(
            "wellness:blood_pressure:mock",
            &json!({"items":[item]}),
        );
        assert!(parsed.metric_samples.is_empty());
        assert!(!parsed.diagnostics.is_empty());
    }
}

#[test]
fn empty_bp_response_is_distinct_from_unknown_payload() {
    let empty =
        Normalizer::normalize_wellness("wellness:blood_pressure:mock", &json!({"items":[]}));
    assert!(empty.diagnostics.is_empty());
    let unknown = Normalizer::normalize_wellness(
        "wellness:blood_pressure:mock",
        &json!({"encoded":"opaque"}),
    );
    assert!(!unknown.diagnostics.is_empty());
}
