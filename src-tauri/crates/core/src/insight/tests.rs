use super::*;
use crate::models::{DailyMetric, SleepSession, SourceScope, Workout};
use chrono::{Datelike, TimeZone};

fn base() -> DateTime<Utc> {
    Utc.with_ymd_and_hms(2026, 8, 20, 7, 0, 0).unwrap()
}

fn db() -> Database {
    Database::in_memory().unwrap()
}

/// 造一次可控的跑步：`hr` 是一个「按进度返回心率」的函数，速度固定。
fn drift_workout(db: &Database, workout_id: &str, seconds: i64, speed: f64, hr: fn(f64) -> f64) {
    let start = Utc.with_ymd_and_hms(2026, 8, 24, 6, 0, 0).unwrap();
    db.conn
        .execute(
            "INSERT INTO workouts (workout_id, workout_type, start_time, end_time,
                                       source_scope, synced_at)
                 VALUES (?1, 'run', ?2, ?3, 'device', ?3)",
            rusqlite::params![
                workout_id,
                start.to_rfc3339(),
                (start + Duration::seconds(seconds)).to_rfc3339()
            ],
        )
        .unwrap();
    for second in 0..=seconds {
        let progress = second as f64 / seconds as f64;
        db.conn
            .execute(
                "INSERT INTO workout_samples (workout_id, timestamp, heart_rate, speed)
                     VALUES (?1, ?2, ?3, ?4)",
                rusqlite::params![
                    workout_id,
                    (start + Duration::seconds(second)).to_rfc3339(),
                    hr(progress),
                    speed
                ],
            )
            .unwrap();
    }
}

/// 速度不变而心率一路上抬 —— 这正是心率漂移的定义：同样的速度要花更多心跳。
#[test]
fn a_steady_pace_with_a_rising_heart_rate_reads_as_drift() {
    let db = Database::in_memory().unwrap();
    // 40 分钟，配速恒定 3 m/s，心率从 140 线性升到 160。
    drift_workout(&db, "w1", 2400, 3.0, |p| 140.0 + 20.0 * p);

    let drift = db.heart_rate_drift("w1").unwrap().expect("条件是满足的");

    assert_eq!(drift.first_half_avg_speed_mps, 3.0);
    assert_eq!(drift.second_half_avg_speed_mps, 3.0);
    assert!(
        drift.second_half_avg_hr > drift.first_half_avg_hr,
        "后半程心率应当更高：{} vs {}",
        drift.second_half_avg_hr,
        drift.first_half_avg_hr
    );
    // 心率涨了，速度没变，所以每拍跑出的米数必然下降 —— drift 为负。
    assert!(
        drift.drift_percent < 0.0,
        "同样的速度花了更多心跳，drift 应当为负：{}",
        drift.drift_percent
    );
    // 心率 145 -> 155 附近，效率差约 -6.5%。给一个宽区间，钉的是方向和量级。
    assert!(
        (-9.0..=-4.0).contains(&drift.drift_percent),
        "量级不对：{}",
        drift.drift_percent
    );
    assert!(drift.speed_cv < 1e-9, "速度恒定，变异系数应当是 0");
}

/// 心率和速度都稳，就是没有漂移 —— 那时候必须报接近 0，不是报「没数据」。
#[test]
fn a_steady_effort_reads_as_no_drift() {
    let db = Database::in_memory().unwrap();
    drift_workout(&db, "w1", 2400, 3.0, |_| 150.0);

    let drift = db.heart_rate_drift("w1").unwrap().expect("条件是满足的");
    assert!(
        drift.drift_percent.abs() < 0.001,
        "心率和速度都没变，drift 应当是 0：{}",
        drift.drift_percent
    );
}

/// 太短的不算。前十分钟基本都是心率还在爬，把它和后半程比量到的是热身。
#[test]
fn a_short_workout_says_so_instead_of_reporting_a_number() {
    let db = Database::in_memory().unwrap();
    // 15 分钟，样本够多但时长不够。
    drift_workout(&db, "w1", 900, 3.0, |p| 140.0 + 20.0 * p);

    assert_eq!(db.heart_rate_drift("w1").unwrap().unwrap_err(), "too_short");
}

/// 配速忽快忽慢的不算：红绿灯、间歇、爬坡都长这样，两半程根本不可比。
#[test]
fn a_variable_pace_refuses_to_produce_a_percentage() {
    let db = Database::in_memory().unwrap();
    let start = Utc.with_ymd_and_hms(2026, 8, 24, 6, 0, 0).unwrap();
    db.conn
        .execute(
            "INSERT INTO workouts (workout_id, workout_type, start_time, end_time,
                                       source_scope, synced_at)
                 VALUES ('w1', 'run', ?1, ?2, 'device', ?2)",
            rusqlite::params![
                start.to_rfc3339(),
                (start + Duration::seconds(2400)).to_rfc3339()
            ],
        )
        .unwrap();
    for second in 0..=2400 {
        // 每 30 秒在 1.5 和 4.5 m/s 之间切换：典型的间歇。
        let speed = if (second / 30) % 2 == 0 { 1.5 } else { 4.5 };
        db.conn
            .execute(
                "INSERT INTO workout_samples (workout_id, timestamp, heart_rate, speed)
                     VALUES ('w1', ?1, 150, ?2)",
                rusqlite::params![(start + Duration::seconds(second)).to_rfc3339(), speed],
            )
            .unwrap();
    }

    assert_eq!(
        db.heart_rate_drift("w1").unwrap().unwrap_err(),
        "pace_too_variable"
    );
}

/// 没有逐点采样的运动直接说没有，不去猜。
#[test]
fn a_workout_without_samples_says_there_is_nothing_to_compare() {
    let db = Database::in_memory().unwrap();
    let start = Utc.with_ymd_and_hms(2026, 8, 24, 6, 0, 0).unwrap();
    db.conn
        .execute(
            "INSERT INTO workouts (workout_id, workout_type, start_time, end_time,
                                       source_scope, synced_at)
                 VALUES ('w1', 'run', ?1, ?2, 'device', ?2)",
            rusqlite::params![
                start.to_rfc3339(),
                (start + Duration::seconds(2400)).to_rfc3339()
            ],
        )
        .unwrap();

    assert_eq!(
        db.heart_rate_drift("w1").unwrap().unwrap_err(),
        "not_enough_samples"
    );
}

/// 贴合不良掉到个位数的心率、以及停下来那几秒的 0 速度，都不该参与平均。
#[test]
fn implausible_readings_are_dropped_before_the_halves_are_compared() {
    let db = Database::in_memory().unwrap();
    let start = Utc.with_ymd_and_hms(2026, 8, 24, 6, 0, 0).unwrap();
    db.conn
        .execute(
            "INSERT INTO workouts (workout_id, workout_type, start_time, end_time,
                                       source_scope, synced_at)
                 VALUES ('w1', 'run', ?1, ?2, 'device', ?2)",
            rusqlite::params![
                start.to_rfc3339(),
                (start + Duration::seconds(2400)).to_rfc3339()
            ],
        )
        .unwrap();
    for second in 0..=2400 {
        // 每 100 秒插一个贴合不良的读数：心率 5、速度 0。
        let (hr, speed) = if second % 100 == 0 {
            (5.0, 0.0)
        } else {
            (150.0, 3.0)
        };
        db.conn
            .execute(
                "INSERT INTO workout_samples (workout_id, timestamp, heart_rate, speed)
                     VALUES ('w1', ?1, ?2, ?3)",
                rusqlite::params![(start + Duration::seconds(second)).to_rfc3339(), hr, speed],
            )
            .unwrap();
    }

    let drift = db
        .heart_rate_drift("w1")
        .unwrap()
        .expect("扔掉坏点后条件仍然满足");
    assert_eq!(
        drift.first_half_avg_hr, 150.0,
        "心率 5 的那些点不该被平均进来"
    );
    assert_eq!(drift.first_half_avg_speed_mps, 3.0, "速度 0 的那些点同上");
    assert!(
        drift.speed_cv < 1e-9,
        "坏点被扔掉之后速度是恒定的，变异系数应当是 0：{}",
        drift.speed_cv
    );
}

/// 一次跑步。`minutes` 是时长，`distance` 是米。
fn run(
    id: &str,
    days_ago: i64,
    distance: Option<f64>,
    minutes: i64,
    avg_hr: Option<i32>,
) -> Workout {
    let start = base() - Duration::days(days_ago);
    Workout {
        workout_id: id.into(),
        workout_type: "run".into(),
        normalized_type: "run".into(),
        type_source: "numeric_mapped".into(),
        user_override: None,
        effective_type: "run".into(),
        custom_label: None,
        start_time: start,
        end_time: start + Duration::minutes(minutes),
        distance_meters: distance,
        calories: None,
        avg_hr,
        max_hr: None,
        training_load: Some(50.0),
        vo2max: None,
        source_scope: SourceScope::Device,
        device_id: Some("device-a".into()),
        synced_at: None,
        gps_available: false,
        sample_count: 0,
        zepp_source: None,
        zepp_type: Some(1),
        ..Default::default()
    }
}

fn fact<'a>(insight: &'a WorkoutInsight, id: &str) -> &'a InsightFact {
    insight
        .facts
        .iter()
        .find(|fact| fact.fact_id == id)
        .unwrap_or_else(|| panic!("缺少事实 {id}"))
}

fn weekly_fact<'a>(report: &'a WeeklyReport, id: &str) -> &'a InsightFact {
    report
        .facts
        .iter()
        .find(|fact| fact.fact_id == id)
        .unwrap_or_else(|| panic!("缺少事实 {id}"))
}

#[test]
fn only_verified_running_gets_an_insight_and_the_rest_says_so_plainly() {
    let db = db();
    let mut strength = run("strength-1", 1, Some(0.0), 40, Some(120));
    strength.workout_type = "strength".into();
    strength.normalized_type = "strength".into();
    strength.effective_type = "strength".into();
    strength.zepp_type = Some(52);
    db.insert_workout(&strength).unwrap();

    let insight = db.workout_insight("strength-1").unwrap();
    assert!(!insight.supported);
    assert!(insight.facts.is_empty(), "不支持时不许硬凑事实出来");
    let reason = insight.unsupported_reason.unwrap();
    assert!(reason.contains("跑步"));
}

#[test]
fn a_run_without_enough_comparable_history_reports_the_value_but_no_percentage() {
    let db = db();
    db.insert_workout(&run("target", 0, Some(5000.0), 30, Some(150)))
        .unwrap();
    // 只有两次可比历史，低于 MIN_SAMPLES。
    db.insert_workout(&run("prev-1", 7, Some(5100.0), 31, Some(152)))
        .unwrap();
    db.insert_workout(&run("prev-2", 14, Some(4900.0), 32, Some(151)))
        .unwrap();

    let insight = db.workout_insight("target").unwrap();
    assert!(insight.supported);
    let pace = fact(&insight, "run.pace");
    assert!(pace.value.is_some(), "本次数值仍然要给");
    assert!(pace.comparison.is_none(), "样本不足不许硬算百分比");
    assert_eq!(pace.confidence, Confidence::Insufficient);
    let reason = pace.reason.clone().unwrap();
    assert!(reason.contains("不足"), "{reason}");
    assert_eq!(pace.evidence_count, 2);
}

#[test]
fn the_baseline_only_uses_runs_of_a_similar_distance_and_says_what_it_dropped() {
    let db = db();
    db.insert_workout(&run("target", 0, Some(5000.0), 30, Some(150)))
        .unwrap();
    for (index, distance) in [5100.0, 4900.0, 5000.0].into_iter().enumerate() {
        db.insert_workout(&run(
            &format!("near-{index}"),
            (index as i64 + 1) * 3,
            Some(distance),
            31,
            Some(150),
        ))
        .unwrap();
    }
    // 距离差太远：10 公里不该拿来和 5 公里比。
    db.insert_workout(&run("far", 20, Some(10000.0), 62, Some(150)))
        .unwrap();
    // 窗口之外。
    db.insert_workout(&run(
        "old",
        baseline::WINDOW_DAYS + 5,
        Some(5000.0),
        30,
        Some(150),
    ))
    .unwrap();

    let insight = db.workout_insight("target").unwrap();
    let included: Vec<&str> = insight
        .baseline_included
        .iter()
        .map(|entry| entry.workout_id.as_str())
        .collect();
    assert_eq!(included.len(), 3, "{included:?}");
    assert!(!included.contains(&"far"));
    assert!(!included.contains(&"old"), "窗口之外的记录不该进基线");

    let dropped: Vec<(&str, &str)> = insight
        .baseline_excluded
        .iter()
        .map(|entry| (entry.workout_id.as_str(), entry.reason.as_str()))
        .collect();
    assert!(
        dropped.contains(&("far", "distance_out_of_tolerance")),
        "{dropped:?}"
    );

    let pace = fact(&insight, "run.pace");
    let comparison = pace.comparison.clone().expect("三次可比记录应当足够");
    assert_eq!(pace.evidence_count, 3);
    // 本次 30 分钟跑 5 公里 = 360 s/km；基线三次都是 31 分钟。
    assert!(comparison.delta < 0.0, "这次更快，delta 应当为负");
    assert_eq!(comparison.direction, "lower");
    assert_eq!(pace.evidence_refs.len(), 3);
}

#[test]
fn a_run_with_an_impossible_pace_never_pollutes_the_baseline() {
    let db = db();
    db.insert_workout(&run("target", 0, Some(5000.0), 30, Some(150)))
        .unwrap();
    for index in 0..3 {
        db.insert_workout(&run(
            &format!("ok-{index}"),
            index + 1,
            Some(5000.0),
            30,
            Some(150),
        ))
        .unwrap();
    }
    // 5 公里 1 分钟：数据本身坏了，不是一次很快的跑步。
    db.insert_workout(&run("broken", 5, Some(5000.0), 1, Some(150)))
        .unwrap();

    let insight = db.workout_insight("target").unwrap();
    assert!(insight
        .baseline_included
        .iter()
        .all(|entry| entry.workout_id != "broken"));
    assert!(insight
        .baseline_excluded
        .iter()
        .any(|entry| entry.workout_id == "broken" && entry.reason == "implausible_pace"));
}

#[test]
fn a_missing_metric_is_missing_not_zero() {
    let db = db();
    db.insert_workout(&run("target", 0, Some(5000.0), 30, None))
        .unwrap();
    for index in 0..3 {
        db.insert_workout(&run(
            &format!("ok-{index}"),
            index + 1,
            Some(5000.0),
            30,
            None,
        ))
        .unwrap();
    }
    let insight = db.workout_insight("target").unwrap();
    let hr = fact(&insight, "run.avg_hr");
    assert_eq!(hr.value, None, "没有心率就是没有，不能填 0");
    assert!(hr.comparison.is_none());
    assert_eq!(hr.evidence_count, 0, "基线也不该把缺失当成 0 算进去");
    assert_eq!(hr.confidence, Confidence::Insufficient);
}

#[test]
fn the_baseline_never_grows_past_the_max_sample_count() {
    let db = db();
    db.insert_workout(&run("target", 0, Some(5000.0), 30, Some(150)))
        .unwrap();
    for index in 0..(baseline::MAX_SAMPLES + 4) {
        db.insert_workout(&run(
            &format!("prev-{index}"),
            index as i64 + 1,
            Some(5000.0),
            31,
            Some(150),
        ))
        .unwrap();
    }
    let insight = db.workout_insight("target").unwrap();
    assert_eq!(insight.baseline_included.len(), baseline::MAX_SAMPLES);
    assert!(insight
        .baseline_excluded
        .iter()
        .any(|entry| entry.reason == "beyond_max_samples"));
}

fn sleep(id: &str, days_ago: i64, start_hour: u32, minutes: i64) -> SleepSession {
    let day = (base() - Duration::days(days_ago)).date_naive();
    let start = Local
        .with_ymd_and_hms(day.year(), day.month(), day.day(), start_hour, 0, 0)
        .unwrap()
        .with_timezone(&Utc);
    SleepSession {
        sleep_id: id.into(),
        start_time: start,
        end_time: start + Duration::minutes(minutes),
        score: None,
        duration_minutes: minutes as i32,
        deep_minutes: Some(0),
        light_minutes: Some(minutes as i32),
        rem_minutes: None,
        awake_minutes: Some(0),
        synced_at: None,
        time_in_bed_minutes: None,
        wake_count: None,
        stages: Vec::new(),
        source_scope: SourceScope::Device,
        device_id: Some("device-a".into()),
    }
}

#[test]
fn the_weekly_report_compares_you_with_your_own_previous_four_weeks() {
    let db = db();
    // 最近 7 天：每晚 7 小时。此前 28 天：每晚 6 小时。
    for day in 0..7 {
        db.insert_sleep_session(&sleep(&format!("recent-{day}"), day, 23, 420))
            .unwrap();
    }
    // 一夜按「醒来那天」归属，所以 23:00 入睡的那晚算在第二天。
    // 基线从第 8 天起，正好落在此前 28 天窗口里，不会渗进最近 7 天。
    for day in 8..36 {
        db.insert_sleep_session(&sleep(&format!("base-{day}"), day, 23, 360))
            .unwrap();
    }

    let report = db
        .weekly_report_for_day(base().date_naive(), base())
        .unwrap();
    let duration = weekly_fact(&report, "weekly.sleep_duration");
    assert_eq!(duration.value, Some(420.0));
    let comparison = duration.comparison.clone().expect("基线够 28 天");
    assert_eq!(comparison.baseline_value, 360.0);
    assert_eq!(comparison.direction, "higher");
    assert!(
        (comparison.delta_percent - 16.7).abs() < 0.2,
        "{comparison:?}"
    );
    assert_eq!(duration.confidence, Confidence::High);
}

#[test]
fn a_thin_baseline_reports_the_current_value_without_a_comparison() {
    let db = db();
    for day in 0..7 {
        db.insert_sleep_session(&sleep(&format!("recent-{day}"), day, 23, 420))
            .unwrap();
    }
    // 此前只有两晚有记录，不足 MIN_BASELINE_DAYS。
    for day in 10..12 {
        db.insert_sleep_session(&sleep(&format!("base-{day}"), day, 23, 360))
            .unwrap();
    }
    let report = db
        .weekly_report_for_day(base().date_naive(), base())
        .unwrap();
    let duration = weekly_fact(&report, "weekly.sleep_duration");
    assert_eq!(duration.value, Some(420.0));
    assert!(duration.comparison.is_none());
    assert_eq!(duration.confidence, Confidence::Insufficient);
    assert!(duration.reason.clone().unwrap().contains("不足"));
}

#[test]
fn no_data_at_all_says_no_data_instead_of_zero() {
    let db = db();
    let report = db
        .weekly_report_for_day(base().date_naive(), base())
        .unwrap();
    for fact in &report.facts {
        assert_eq!(
            fact.value, None,
            "{} 不该在没有数据时给出数值",
            fact.fact_id
        );
        assert!(fact.comparison.is_none());
        assert_eq!(fact.confidence, Confidence::Insufficient);
    }
}

#[test]
fn the_report_never_mentions_a_population_baseline() {
    let db = db();
    for day in 0..7 {
        db.insert_sleep_session(&sleep(&format!("recent-{day}"), day, 23, 420))
            .unwrap();
    }
    let report = db
        .weekly_report_for_day(base().date_naive(), base())
        .unwrap();
    let encoded = serde_json::to_string(&report).unwrap();
    for forbidden in [
        "人群",
        "正常人",
        "平均水平",
        "健康人",
        "诊断",
        "疾病",
        "风险",
    ] {
        assert!(
            !encoded.contains(forbidden),
            "周报出现了没有本地依据的措辞：{forbidden}"
        );
    }
    // 基线窗口必须自报是「你自己的前 28 天」。
    let duration = weekly_fact(&report, "weekly.sleep_duration");
    assert_eq!(
        duration.baseline_window.clone().unwrap().kind,
        "previous_days"
    );
}

#[test]
fn sleep_regularity_does_not_read_midnight_as_a_twenty_three_hour_swing() {
    let db = db();
    // 23:50 和 00:10 相差 20 分钟，不是 23 小时 40 分钟。
    db.insert_sleep_session(&sleep("a", 1, 23, 400)).unwrap();
    db.insert_sleep_session(&sleep("b", 2, 0, 400)).unwrap();
    db.insert_sleep_session(&sleep("c", 3, 23, 400)).unwrap();
    let report = db
        .weekly_report_for_day(base().date_naive(), base())
        .unwrap();
    let regularity = weekly_fact(&report, "weekly.sleep_start_regularity");
    let spread = regularity.value.expect("三晚足够算出离散度");
    assert!(
        spread < 120.0,
        "跨午夜被当成了 23 小时的波动：{spread} 分钟"
    );
}

/// start_time 靠近时间轴下限时，基线窗口减法不得 panic。
#[test]
fn a_run_near_datetime_min_does_not_panic_on_baseline_window() {
    let db = db();
    let year_one = Utc.with_ymd_and_hms(1, 1, 1, 12, 0, 0).unwrap();
    let mut workout = run("year-one", 0, Some(5000.0), 30, Some(150));
    workout.start_time = year_one;
    workout.end_time = year_one + Duration::minutes(30);
    db.insert_workout(&workout).unwrap();
    let insight = db.workout_insight("year-one").unwrap();
    assert!(insight.supported);
    assert!(insight.baseline_included.is_empty());

    let target = RunRow {
        workout_id: "min".into(),
        start_time: DateTime::<Utc>::MIN_UTC,
        end_time: DateTime::<Utc>::MIN_UTC
            .checked_add_signed(Duration::try_minutes(30).unwrap())
            .expect("MIN + 30 分钟仍在范围内"),
        distance_meters: Some(5000.0),
        avg_hr: Some(150),
        training_load: Some(50.0),
        source_scope: "device".into(),
    };
    let (included, excluded) = db.comparable_runs(&target).unwrap();
    assert!(included.is_empty());
    assert!(
        excluded.iter().any(|row| row.reason == "outside_window"),
        "下溢应当记 outside_window：{excluded:?}"
    );

    let report = db
        .weekly_report_for_day(
            DateTime::<Utc>::MIN_UTC.date_naive(),
            DateTime::<Utc>::MIN_UTC,
        )
        .unwrap();
    assert_eq!(
        report.recent_end,
        DateTime::<Utc>::MIN_UTC.date_naive().to_string()
    );
}

/// 一条 daily_metrics 行。`source_scope` 可变，用来造「同一天两个来源」。
fn daily(days_ago: i64, metric: &str, value: f64, scope: SourceScope) -> DailyMetric {
    DailyMetric {
        date: (base() - Duration::days(days_ago)).date_naive().to_string(),
        metric: metric.into(),
        value,
        unit: "bpm".into(),
        source_scope: scope,
        device_id: None,
    }
}

/// 同一天两个来源各落一行是同一天的数据，不是两天；均值按日折叠，
/// 不能把多出来的那一行直接丢进窗口平均。
#[test]
fn the_same_day_from_two_scopes_is_one_day_of_evidence() {
    let db = db();
    // 最近 7 天每天都有静息心率，让比较能走到基线判据。
    for day in 0..7 {
        db.insert_daily_metric(&daily(day, "resting_hr", 60.0, SourceScope::Device))
            .unwrap();
    }
    // 基线 10 天：其中一天 device 和 user_fused 各一行，依然只算 1 天。
    // 50 和 100 差得够大，按行平均会得到 54.5，按日折叠才是 52.5。
    for day in 8..18 {
        db.insert_daily_metric(&daily(day, "resting_hr", 50.0, SourceScope::Device))
            .unwrap();
    }
    db.insert_daily_metric(&daily(8, "resting_hr", 100.0, SourceScope::UserFused))
        .unwrap();

    let report = db
        .weekly_report_for_day(base().date_naive(), base())
        .unwrap();
    let resting = weekly_fact(&report, "weekly.resting_hr");
    assert_eq!(resting.baseline_count, 10, "同日双来源只算一天");
    let comparison = resting
        .comparison
        .clone()
        .expect("10 天基线够 7 天门，比较必须发生");
    // 第 8 天 (50+100)/2 = 75，其余 9 天 50 → 日均 52.5。
    assert_eq!(comparison.baseline_value, 52.5);
    assert_eq!(resting.value, Some(60.0));
}

/// 「次数」聚合成单值之后，基线判据数的仍是有数据的天数。
#[test]
fn a_workout_count_baseline_counts_days_with_activity() {
    let db = db();
    // 最近 7 天 4 次落在 3 天（第 0 天两场）；此前 10 天每天 1 次。
    for day in [0, 2, 4] {
        db.insert_workout(&run(
            &format!("recent-{day}"),
            day,
            Some(5000.0),
            30,
            Some(150),
        ))
        .unwrap();
    }
    db.insert_workout(&run("recent-0b", 0, Some(5000.0), 30, Some(150)))
        .unwrap();
    for day in 8..18 {
        db.insert_workout(&run(
            &format!("base-{day}"),
            day,
            Some(5000.0),
            30,
            Some(150),
        ))
        .unwrap();
    }
    let report = db
        .weekly_report_for_day(base().date_naive(), base())
        .unwrap();
    let count = weekly_fact(&report, "weekly.workout_count");
    assert_eq!(count.value, Some(4.0), "value 是总场次，不是去重天数");
    assert_eq!(count.evidence_count, 3, "天数按去重日");
    assert_eq!(count.baseline_count, 10);
    let comparison = count
        .comparison
        .clone()
        .expect("10 天基线够 7 天门，不该再报 thin_baseline");
    // 10 次分布在整个 28 天基线窗口里，换算成「每 7 天」的等效场次是
    // 10 * 7 / 28 = 2.5——不是原始的 10（那是拿 7 天总量硬比 28 天总量，
    // 同样的训练频率会被算成「下降了」）。4 对 2.5 才是「变多了」。
    assert_eq!(comparison.baseline_value, 2.5);
    assert_eq!(comparison.direction, "higher");
}

/// 基线均值是 0 时相对变化算不出来——这是另一条理由，不是「样本不足」。
#[test]
fn a_zero_baseline_reports_no_comparison_instead_of_dividing_by_zero() {
    let db = db();
    for day in 0..7 {
        db.insert_daily_metric(&daily(day, "resting_hr", 60.0, SourceScope::Device))
            .unwrap();
    }
    // 基线 10 天全是 0：这项指标此前一直没测出。
    for day in 8..18 {
        db.insert_daily_metric(&daily(day, "resting_hr", 0.0, SourceScope::Device))
            .unwrap();
    }
    let report = db
        .weekly_report_for_day(base().date_naive(), base())
        .unwrap();
    let resting = weekly_fact(&report, "weekly.resting_hr");
    assert_eq!(resting.value, Some(60.0));
    assert!(resting.comparison.is_none(), "拿 0 当分母没有意义");
    assert_eq!(resting.reason_code.as_deref(), Some("weekly_zero_baseline"));
    assert_eq!(resting.confidence, Confidence::Insufficient);
}

/// 半个显示单位以下是噪声；界面会显示成整数的 1 bpm 差必须有方向。
#[test]
fn a_displayed_bpm_difference_is_not_flat() {
    assert_eq!(direction_of(0.4, 60.0), "same");
    assert_eq!(direction_of(-0.4, 51.0), "same");
    assert_eq!(direction_of(1.0, 60.0), "higher");
    assert_eq!(direction_of(-1.0, 51.0), "lower");
}

/// wellness 的 `hrvRmssd` 项落库叫 `hrv_rmssd`——周报两个名字都要认，
/// 否则有 HRV 的日子会被报成「没数据」。
#[test]
fn hrv_samples_stored_under_the_rmssd_name_feed_the_weekly_report() {
    let db = db();
    for day in 0..7 {
        let date = (base() - Duration::days(day)).date_naive();
        db.conn
            .execute(
                "INSERT INTO metric_samples
                        (metric, timestamp, value, unit, source_scope)
                     VALUES ('hrv_rmssd', ?1, 45.0, 'ms', 'device')",
                rusqlite::params![format!("{date}T08:00:00+00:00")],
            )
            .unwrap();
    }
    let report = db
        .weekly_report_for_day(base().date_naive(), base())
        .unwrap();
    let hrv = weekly_fact(&report, "weekly.hrv");
    assert_eq!(hrv.value, Some(45.0), "hrv_rmssd 落库的样本必须被读到");
    assert_ne!(
        hrv.reason_code.as_deref(),
        Some("weekly_no_recent_data"),
        "有 HRV 数据的日子不该报「没数据」"
    );
}
