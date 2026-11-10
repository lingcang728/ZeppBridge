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

mod unstrap {
    use super::super::unstrap::{parse_unstrap_archive, unstrap_sport};
    use super::zip_of;
    use std::io::Cursor;

    // 2024-05-01T00:00:00Z = 1714521600。
    const T0: i64 = 1_714_521_600;

    fn backup() -> Vec<u8> {
        let workout = format!(
            "start,start_epoch,end_epoch,sport_type,exercise_seconds,calories,avg_hr,max_hr,min_hr,aerobic_te,anaerobic_te,training_load,vo2max,steps,subtype\n\
             x,{a},{a_end},52,1500,180,120,150,80,2.5,0.4,40,,,\n\
             x,{b},{b_end},1,1700,300,140,170,90,3.1,,55,48,,\n\
             x,{c},{c_end},6,,,,,,,,,,,\n",
            a = T0,
            a_end = T0 + 1800,
            b = T0 + 86_400 + 30,
            b_end = T0 + 86_400 + 1830,
            c = T0 + 2 * 86_400,
            c_end = T0 + 2 * 86_400 + 900,
        );
        let workout_hr = format!(
            "workout_start_epoch,epoch,bpm\n{a},{a},110\n{a},{a1},130\n{a},{a2},0\n{b},{b},150\n",
            a = T0,
            a1 = T0 + 60,
            a2 = T0 + 120,
            b = T0 + 86_400 + 30,
        );
        // 手机上的跑步和带子记的第二条是同一次（起点差 30 秒）：并成一条，心率从带子补。
        let app_workout = format!(
            "start,start_epoch,end_epoch,sport_type,source,pauses,end_reason,avg_hr,max_hr,distance_m,distance_from_steps,total_kcal\n\
             x,{b},{b_end},1,1,\"{p0}-{p1}\",0,,,5000.0,false,310.4\n\
             x,{d},{d_end},3,0,,0,100,120,1234.0,true,\n",
            b = T0 + 86_400,
            b_end = T0 + 86_400 + 1860,
            p0 = T0 + 86_400 + 600,
            p1 = T0 + 86_400 + 660,
            d = T0 + 3 * 86_400,
            d_end = T0 + 3 * 86_400 + 1200,
        );
        let route = format!(
            "workout_start_epoch,epoch,lat,lon,accuracy_m,speed_ms,bearing_deg,altitude_m\n\
             {b},{b},31.0,121.0,5,,,10\n{b},{b1},31.01,121.0,5,,,12\n",
            b = T0 + 86_400,
            b1 = T0 + 86_400 + 300,
        );
        let deleted = format!(
            "start_epoch,effect_end_epoch,deleted_epoch\n{c},,{c}\n",
            c = T0 + 2 * 86_400
        );
        zip_of(&[
            ("workout.csv", workout.as_bytes()),
            ("workout_hr.csv", workout_hr.as_bytes()),
            ("app_workout.csv", app_workout.as_bytes()),
            ("app_workout_route.csv", route.as_bytes()),
            ("workout_deleted.csv", deleted.as_bytes()),
            ("settings.json", b"{}"),
        ])
    }

    #[test]
    fn reads_strap_and_phone_workouts_merging_the_same_session() {
        let file = parse_unstrap_archive(Cursor::new(backup())).unwrap();
        assert_eq!(file.unreadable, 0);
        // 力量（带子）、跑步（手机 + 带子并成一条）、步行（手机）；删掉的泳池那条不回来。
        let sports: Vec<&str> = file.activities.iter().map(|a| a.sport.as_str()).collect();
        assert_eq!(sports, ["strength", "run", "walking"]);

        let lift = &file.activities[0];
        assert_eq!(lift.moving_seconds, Some(1500));
        assert_eq!(
            (lift.calories, lift.avg_hr, lift.max_hr),
            (Some(180), Some(120), Some(150))
        );
        let samples = &lift.decoded.as_ref().unwrap().samples;
        // 0 bpm 是没测到，不是心率 0。
        assert_eq!(
            samples
                .iter()
                .filter_map(|s| s.heart_rate)
                .collect::<Vec<_>>(),
            [110, 130]
        );
        assert!(lift.decoded.as_ref().unwrap().route.is_empty());
        assert_eq!(lift.distance_m, None);

        let run = &file.activities[1];
        assert_eq!(run.start_time.timestamp(), T0 + 86_400);
        assert_eq!(run.distance_m, Some(5000.0));
        assert_eq!(run.calories, Some(310));
        // 手机没记心率汇总，用带子那条的。
        assert_eq!((run.avg_hr, run.max_hr), (Some(140), Some(170)));
        let decoded = run.decoded.as_ref().unwrap();
        assert_eq!(decoded.route.len(), 2);
        assert_eq!(decoded.pauses.len(), 1);
        assert_eq!(decoded.end_time.timestamp(), T0 + 86_400 + 1860);
        assert!(decoded.samples.iter().any(|s| s.heart_rate == Some(150)));

        // 按步数估的距离不要。
        let walk = &file.activities[2];
        assert_eq!(walk.distance_m, None);
        assert!(walk.decoded.is_none());
        assert_eq!((walk.avg_hr, walk.calories), (Some(100), None));
    }

    #[test]
    fn reads_health_tables_keeping_only_what_maps_cleanly() {
        let heart = format!(
            "epoch,bpm,source
{t},62,0
{t1},180,1
{t2},300,0
",
            t = T0,
            t1 = T0 + 60,
            t2 = T0 + 120
        );
        let spo2 = format!(
            "epoch,percent
{T0},97
"
        );
        let resting = "date,bpm
2024-05-01,51
not-a-day,50
";
        let sessions = format!(
            "start_epoch,end_epoch,nap,score,deep_min,light_min,rem_min,awake_min,wake_count
             {a},{a_end},false,88,60,200,,12,2
             {b},{b_end},true,,,,,,
             {c},{c_end},false,70,,,,,
",
            a = T0,
            a_end = T0 + 8 * 3600,
            b = T0 + 14 * 3600,
            b_end = T0 + 15 * 3600,
            c = T0 + 86_400,
            c_end = T0 + 86_400 + 7 * 3600,
        );
        let stages = format!(
            "session_start_epoch,start,end,stage
             {a},2024-05-01T01:00:00Z,2024-05-01T02:00:00Z,2
             {a},2024-05-01T00:00:00Z,2024-05-01T01:00:00Z,1
",
            a = T0
        );
        // 用户在 unstrap 里删掉了第二晚。
        let edits = format!(
            "strap_start_epoch,deleted,start_epoch,end_epoch
{c},true,,
",
            c = T0 + 86_400
        );
        let bytes = zip_of(&[
            (
                "workout.csv",
                b"start_epoch,end_epoch,sport_type
",
            ),
            ("heart_rate.csv", heart.as_bytes()),
            ("spo2.csv", spo2.as_bytes()),
            ("resting_hr.csv", resting.as_bytes()),
            ("sleep_session.csv", sessions.as_bytes()),
            ("sleep_stage.csv", stages.as_bytes()),
            ("sleep_edit.csv", edits.as_bytes()),
            (
                "hrv.csv",
                b"epoch,ms
1714521600,40
",
            ),
        ]);
        let file = parse_unstrap_archive(Cursor::new(bytes)).unwrap();
        let health = file.health.unwrap();
        // 手机实时收的（source 1）运动已带；300 bpm 超出范围算读不出。
        let points: Vec<(&str, f64)> = health.samples.iter().map(|s| (s.metric, s.value)).collect();
        assert_eq!(points, [("heart_rate", 62.0), ("spo2", 97.0)]);
        assert_eq!(health.daily.len(), 1);
        assert_eq!(health.daily[0].date, "2024-05-01");
        // 小睡和删掉的那晚不要；分数不收；阶段按时间排好。
        assert_eq!(health.sleeps.len(), 1);
        let sleep = &health.sleeps[0];
        assert_eq!(sleep.score, None);
        assert_eq!((sleep.deep_minutes, sleep.rem_minutes), (Some(60), None));
        let order: Vec<&str> = sleep.stages.iter().map(|s| s.stage.as_str()).collect();
        assert_eq!(order, ["light", "deep"]);
        // 300 bpm 一条、坏日期一条。
        assert_eq!(file.unreadable, 2);
    }

    #[test]
    fn other_zips_are_not_unstrap_backups() {
        let other = zip_of(&[("activities.csv", b"Filename\n")]);
        assert!(parse_unstrap_archive(Cursor::new(other)).is_none());
    }

    #[test]
    fn sport_numbers_are_the_strap_protocol_not_cloud_history() {
        // 6 在云端历史里是步行，在 unstrap 里是泳池游泳。
        assert_eq!(unstrap_sport(6), "pool_swimming");
        assert_eq!(unstrap_sport(83), "activity");
        for code in 0..300 {
            let key = unstrap_sport(code);
            assert!(
                key == "activity" || crate::sport_catalog::is_known_key(key),
                "{code} → {key}"
            );
        }
    }
}
