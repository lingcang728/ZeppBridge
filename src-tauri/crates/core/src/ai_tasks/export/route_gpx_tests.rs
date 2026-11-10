use super::*;
use serde_json::json;

fn document(route: Value) -> Value {
    json!({
        "generated_at": "2026-11-10T08:00:00Z",
        "workouts": [{
            "workout_id": "w1",
            "effective_type": "running",
            "start_time": "2026-11-09T07:00:00Z",
            "series": {
                "samples": [{ "timestamp": "2026-11-09T07:00:01Z", "heart_rate": 120 }],
                "pauses": [],
                "route": route,
            },
        }],
    })
}

#[test]
fn every_decoded_point_goes_into_the_attached_route_not_a_thinned_sample() {
    let points: Vec<Value> = (0..250)
        .map(|i| {
            json!({
                "timestamp": format!("2026-11-09T07:{:02}:{:02}Z", i / 60, i % 60),
                "latitude": 30.25 + f64::from(i) * 1e-5,
                "longitude": 120.15,
                "altitude_m": 12.0,
            })
        })
        .collect();
    let (gpx, count) = route_gpx(&document(Value::Array(points))).unwrap();
    assert_eq!(count, 250);
    assert_eq!(gpx.matches("<trkpt").count(), 250);
    assert!(route_note("handoff-route.gpx", count).contains("All 250 GPS points"));
    assert_eq!(route_file_name("handoff.md"), "handoff-route.gpx");
}

#[test]
fn no_route_means_no_file_rather_than_an_empty_track() {
    assert!(route_gpx(&document(json!([]))).is_none());
    assert!(route_gpx(&json!({ "workouts": [{ "workout_id": "w1" }] })).is_none());
}
