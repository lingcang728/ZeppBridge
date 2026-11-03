use std::io::{Cursor, Write};

use super::apple::{apple_sport, parse_apple_archive, parse_apple_xml};
use super::gpx::{parse_gpx, parse_tcx};
use super::strava::{parse_csv, parse_strava_archive};
use super::*;

const GPX: &str = r#"<?xml version="1.0"?>
<gpx xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">
 <trk><name>Morning &amp; Run</name><type>running</type><trkseg>
  <trkpt lat="31.0000" lon="121.0000"><ele>10</ele><time>2024-05-01T00:00:00Z</time>
   <extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>120</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions></trkpt>
  <trkpt lat="31.0050" lon="121.0000"><ele>12.5</ele><time>2024-05-01T00:03:00Z</time>
   <extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>140</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions></trkpt>
  <trkpt lat="31.0100" lon="121.0000"><ele>12.0</ele><time>2024-05-01T00:06:00Z</time></trkpt>
  <trkpt lat="31.0110" lon="121.0000"><time>2024-05-01T00:07:00Z</time></trkpt>
 </trkseg></trk>
</gpx>"#;

#[test]
fn gpx_reads_route_heart_rate_and_distance_without_inventing_speed() {
    let file = parse_gpx(GPX, None);
    assert_eq!(file.unreadable, 0);
    let activity = &file.activities[0];
    assert_eq!(activity.sport, "run");
    assert_eq!(activity.name.as_deref(), Some("Morning & Run"));
    assert_eq!((activity.avg_hr, activity.max_hr), (Some(130), Some(140)));
    // 0.011° 纬度约 1223 米。
    let distance = activity.distance_m.unwrap();
    assert!((1210.0..1235.0).contains(&distance), "{distance}");
    assert_eq!(activity.elevation_gain_m, Some(2.5));
    let decoded = activity.decoded.as_ref().unwrap();
    assert_eq!(decoded.route.len(), 4);
    assert!(decoded.samples.iter().all(|s| s.speed.is_none()));
    // 没有心率的点就是没有，不拿上一个点的值填。
    assert_eq!(decoded.samples[2].heart_rate, None);
    // 一个整公里加一段不足一公里的尾巴。
    assert_eq!(decoded.splits.len(), 2);
}

#[test]
fn gpx_without_timestamps_is_unreadable_not_guessed() {
    let file = parse_gpx(
        r#"<gpx><trk><trkseg><trkpt lat="1" lon="2"/><trkpt lat="1.1" lon="2"/></trkseg></trk></gpx>"#,
        None,
    );
    assert!(file.activities.is_empty());
    assert_eq!(file.unreadable, 1);
}

#[test]
fn tcx_uses_its_own_distance_and_lap_calories() {
    let tcx = r#"<TrainingCenterDatabase><Activities><Activity Sport="Biking">
      <Lap><Calories>210</Calories><Track>
        <Trackpoint><Time>2024-05-02T10:00:00Z</Time><DistanceMeters>0</DistanceMeters>
          <HeartRateBpm><Value>100</Value></HeartRateBpm></Trackpoint>
        <Trackpoint><Time>2024-05-02T10:10:00Z</Time><DistanceMeters>4000</DistanceMeters>
          <HeartRateBpm><Value>150</Value></HeartRateBpm><Cadence>85</Cadence></Trackpoint>
      </Track></Lap>
      <Lap><Calories>90</Calories></Lap>
    </Activity></Activities></TrainingCenterDatabase>"#;
    let file = parse_tcx(tcx, None);
    let activity = &file.activities[0];
    assert_eq!(activity.sport, "ride");
    assert_eq!(activity.distance_m, Some(4000.0));
    assert_eq!(activity.calories, Some(300));
    assert_eq!(activity.max_hr, Some(150));
    // 没有坐标就没有轨迹。
    assert!(activity.decoded.as_ref().unwrap().route.is_empty());
}

#[test]
fn csv_handles_quoted_commas_newlines_and_escaped_quotes() {
    let rows = parse_csv("\u{feff}a,b,c\r\n1,\"x, \"\"y\"\"\nz\",3\n");
    assert_eq!(rows[0], ["a", "b", "c"]);
    assert_eq!(rows[1], ["1", "x, \"y\"\nz", "3"]);
}

const APPLE_XML: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<HealthData locale="en_US">
 <Record type="HKQuantityTypeIdentifierStepCount" value="10"/>
 <Workout workoutActivityType="HKWorkoutActivityTypeRunning" duration="30" durationUnit="min" sourceName="Watch" startDate="2024-05-03 07:00:00 +0800" endDate="2024-05-03 07:32:00 +0800">
  <WorkoutStatistics type="HKQuantityTypeIdentifierDistanceWalkingRunning" startDate="x" endDate="y" sum="5.2" unit="km"/>
  <WorkoutStatistics type="HKQuantityTypeIdentifierActiveEnergyBurned" startDate="x" endDate="y" sum="1255.2" unit="kJ"/>
  <WorkoutStatistics type="HKQuantityTypeIdentifierHeartRate" startDate="x" endDate="y" average="151.4" minimum="90" maximum="172" unit="count/min"/>
  <WorkoutRoute sourceName="Watch"><FileReference path="/workout-routes/route_1.gpx"/></WorkoutRoute>
 </Workout>
 <Workout workoutActivityType="HKWorkoutActivityTypeTraditionalStrengthTraining" duration="45" durationUnit="min" totalEnergyBurned="200" totalEnergyBurnedUnit="Cal" startDate="2024-05-04 18:00:00 +0800" endDate="2024-05-04 18:45:00 +0800"/>
 <Workout workoutActivityType="HKWorkoutActivityTypeYoga" startDate="broken" endDate="2024-05-04 18:45:00 +0800"/>
</HealthData>"#;

#[test]
fn apple_xml_reads_workouts_and_skips_records() {
    let file = parse_apple_xml(APPLE_XML.as_bytes());
    assert_eq!(file.unreadable, 1);
    let run = &file.activities[0];
    assert_eq!(run.sport, "run");
    assert_eq!(run.start_time.to_rfc3339(), "2024-05-02T23:00:00+00:00");
    assert_eq!(run.distance_m, Some(5200.0));
    assert_eq!(run.calories, Some(300));
    assert_eq!((run.avg_hr, run.max_hr), (Some(151), Some(172)));
    assert_eq!(run.moving_seconds, Some(1800));
    assert!(run.decoded.is_none());
    let lift = &file.activities[1];
    assert_eq!(lift.sport, "strength");
    assert_eq!(lift.calories, Some(200));
    assert_eq!(lift.distance_m, None);
    assert_eq!(apple_sport("HKWorkoutActivityTypeCycling"), "ride");
    assert_eq!(apple_sport("HKWorkoutActivityTypeSomethingNew"), "activity");
}

fn zip_of(entries: &[(&str, &[u8])]) -> Vec<u8> {
    let mut out = zip::ZipWriter::new(Cursor::new(Vec::new()));
    let options =
        zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);
    for (name, bytes) in entries {
        out.start_file(*name, options).unwrap();
        out.write_all(bytes).unwrap();
    }
    out.finish().unwrap().into_inner()
}

#[test]
fn apple_archive_attaches_route_from_workout_routes() {
    let bytes = zip_of(&[
        ("apple_health_export/export.xml", APPLE_XML.as_bytes()),
        (
            "apple_health_export/workout-routes/route_1.gpx",
            GPX.as_bytes(),
        ),
    ]);
    let file = parse_apple_archive(Cursor::new(bytes)).unwrap();
    let run = &file.activities[0];
    assert_eq!(run.decoded.as_ref().unwrap().route.len(), 4);
    // 汇总里的距离优先，路线只补轨迹。
    assert_eq!(run.distance_m, Some(5200.0));
    assert_eq!(run.sport, "run");
}

#[test]
fn strava_archive_takes_type_and_name_from_csv_and_counts_manual_entries() {
    let gpx = GPX.replace("<type>running</type>", "");
    let mut gz = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::fast());
    gz.write_all(gpx.as_bytes()).unwrap();
    let gz = gz.finish().unwrap();
    let csv = "Activity ID,Activity Date,Activity Name,Activity Type,Filename\n\
               1,x,\"Hike, with friends\",Hike,activities/1.gpx.gz\n\
               2,x,Manual entry,Run,\n";
    let bytes = zip_of(&[
        ("activities.csv", csv.as_bytes()),
        ("activities/1.gpx.gz", &gz),
    ]);
    let file = parse_strava_archive(Cursor::new(bytes)).unwrap();
    assert_eq!(file.unreadable, 1);
    assert_eq!(file.activities.len(), 1);
    assert_eq!(file.activities[0].sport, "hiking");
    // GPX 自己的名字优先（用户在 Strava 改名后两边一致）。
    assert_eq!(file.activities[0].name.as_deref(), Some("Morning & Run"));
}

#[test]
fn text_sport_maps_common_names_and_falls_back() {
    assert_eq!(text_sport("Run"), "run");
    assert_eq!(text_sport("Virtual Ride"), "indoor_cycling");
    assert_eq!(text_sport("E-Bike Ride"), "e_bike");
    assert_eq!(text_sport("Weight Training"), "strength");
    assert_eq!(text_sport("Surfing"), "activity");
    assert_eq!(fit_sport(1), "run");
    assert_eq!(fit_sport(200), "activity");
}

#[test]
fn read_import_file_rejects_a_file_of_the_wrong_kind() {
    let dir = std::env::temp_dir().join(format!("zb-import-{}", crate::unique_suffix()));
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join("track.gpx");
    std::fs::write(&path, GPX).unwrap();
    assert!(matches!(
        read_import_file(ImportSource::Fit, &path),
        Err(ImportReadError::NotRecognized)
    ));
    assert!(matches!(
        read_import_file(ImportSource::Strava, &path),
        Err(ImportReadError::NotRecognized)
    ));
    assert_eq!(
        read_import_file(ImportSource::Gpx, &path)
            .unwrap()
            .activities
            .len(),
        1
    );
    let _ = std::fs::remove_dir_all(&dir);
}
