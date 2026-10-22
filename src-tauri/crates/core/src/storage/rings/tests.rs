//! 年轮只画真实数据：没数据的周是空白不是 0，整年没数据也留一圈空白，步数 / 睡眠没有就是没有。
use super::*;

fn d(y: i32, m: u32, day: u32) -> NaiveDate {
    NaiveDate::from_ymd_opt(y, m, day).unwrap()
}

fn w(id: &str, date: NaiveDate, kind: &str, km: Option<f64>, minutes: Option<i64>) -> RingWorkout {
    RingWorkout {
        workout_id: id.into(),
        date,
        kind: kind.into(),
        distance_m: km.map(|k| k * 1000.0),
        seconds: minutes.map(|m| m * 60),
    }
}

#[test]
fn missing_data_stays_blank_instead_of_becoming_zero() {
    let workouts = vec![
        w("a", d(2023, 1, 3), "run", Some(10.0), Some(55)),
        w("b", d(2023, 1, 5), "cycling", Some(30.0), Some(70)),
        w("c", d(2023, 3, 1), "run", Some(21.1), Some(110)),
        // 今天之后的不算。
        w("future", d(2025, 6, 1), "run", Some(5.0), Some(30)),
    ];
    let mut extras = RingExtras::default();
    // 2 月有一周只有每日指标、没有运动：那周是 0 分钟，不是空白。
    extras.data_days.insert(d(2023, 2, 10));
    extras.steps.insert(d(2023, 2, 10), 8000);
    let rings = build_rings(&workouts, &extras, d(2025, 3, 1));

    let years: Vec<i32> = rings.years.iter().map(|y| y.year).collect();
    assert_eq!(years, [2023, 2024, 2025]);
    let y2023 = &rings.years[0];
    assert_eq!(y2023.weeks[week_slot(d(2023, 1, 3))], Some(125.0));
    assert_eq!(y2023.weeks[week_slot(d(2023, 2, 10))], Some(0.0));
    assert_eq!(
        y2023.weeks[week_slot(d(2023, 6, 1))],
        None,
        "没数据的周必须是空白"
    );
    assert_eq!(y2023.data_days, 4);
    assert_eq!((y2023.workouts, y2023.runs), (3, 2));
    assert_eq!(y2023.longest_run.as_ref().unwrap().workout_id, "c");
    assert_eq!(y2023.longest_workout.as_ref().unwrap().workout_id, "c");
    assert_eq!(y2023.busiest_month, Some(1));
    assert_eq!(y2023.steps_total, Some(8000));
    assert_eq!(y2023.sleep_avg_minutes, None, "没有睡眠就不给平均");
    assert!(!y2023.in_progress);

    // 中间整年没数据：一圈空白，不编。
    let y2024 = &rings.years[1];
    assert_eq!(y2024.data_days, 0);
    assert!(y2024.weeks.iter().all(Option::is_none));
    assert_eq!(y2024.steps_total, None);
    assert!(y2024.longest_run.is_none() && y2024.busiest_month.is_none());

    let y2025 = &rings.years[2];
    assert!(y2025.in_progress);
    assert!(y2025.stars.is_empty(), "未来的运动不进年轮");
}

#[test]
fn nothing_recorded_means_no_rings() {
    let rings = build_rings(&[], &RingExtras::default(), d(2025, 3, 1));
    assert!(rings.years.is_empty());
}
