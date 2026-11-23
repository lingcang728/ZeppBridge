use super::*;
use serde_json::json;
use std::collections::HashSet;

#[allow(clippy::too_many_arguments)]
fn synthetic_62_col_row(
    idx: usize,
    sec: i64,
    hr: i64,
    kcal: f64,
    weight: f64,
    reps: i32,
    unit: i32,
    action: i32,
    duration_ms: i64,
) -> String {
    let mut cols = vec!["-1".to_string(); 62];
    cols[0] = idx.to_string();
    cols[1] = sec.to_string();
    cols[2] = "0".to_string();
    cols[3] = "s00000000000".to_string();
    cols[4] = hr.to_string();
    cols[5] = "0".to_string();
    cols[6] = "-20000".to_string();
    cols[9] = "0.0".to_string();
    cols[10] = "0.0".to_string();
    cols[12] = "0.0".to_string();
    cols[13] = "0".to_string();
    cols[14] = "0".to_string();
    cols[15] = kcal.to_string();
    cols[16] = "0".to_string();
    cols[18] = "0".to_string();
    cols[19] = "0".to_string();
    cols[20] = "0".to_string();
    cols[21] = format!("{weight:.1}");
    cols[22] = reps.to_string();
    cols[23] = unit.to_string();
    cols[24] = "0".to_string();
    cols[25] = "0.0".to_string();
    cols[26] = "0".to_string();
    cols[28] = action.to_string();
    cols[43] = duration_ms.to_string();
    cols.join(",")
}

#[test]
fn strength_catalog_has_125_sorted_unique_entries_and_honest_unknowns() {
    assert_eq!(STRENGTH_ACTION_CATALOG.len(), 125);
    let allowed: HashSet<&str> = STRENGTH_MUSCLE_GROUPS.into_iter().collect();
    let mut keys = HashSet::new();
    let mut prev = -1;
    for &(code, key, muscle) in &STRENGTH_ACTION_CATALOG {
        assert!(code > prev, "catalog must stay strictly sorted at {code}");
        prev = code;
        assert!(!key.is_empty());
        assert!(keys.insert(key), "duplicate exercise_key: {key}");
        if let Some(group) = muscle {
            assert!(allowed.contains(group), "unexpected muscle_group: {group}");
        }
        assert_eq!(resolve_strength_action(code), (Some(key), muscle));
    }
    for unknown in [-1, 27, 28, 29, 31, 36, 59, 131, 1030, 1451] {
        assert_eq!(resolve_strength_action(unknown), (None, None));
    }
}

#[test]
fn parses_mixed_kg_and_lb_sets_and_preserves_unknown_action_codes() {
    let lap = format!(
        "{};{};{};",
        synthetic_62_col_row(0, 22, 92, 4.0, 20.0, 10, 0, 65, 22_450),
        synthetic_62_col_row(1, 24, 96, 5.0, 20.0, 10, 1, 14, 24_120),
        synthetic_62_col_row(2, 30, 0, -1.0, 0.0, 15, 0, 1030, -1),
    );
    let data = json!({
        "lap": lap,
        "strengthSets": "[]",
    });
    let sets = parse_strength_sets(data.as_object().unwrap());
    assert_eq!(sets.len(), 3);

    assert_eq!(sets[0].set_index, 1);
    assert_eq!(sets[0].action_code, 65);
    assert_eq!(sets[0].exercise_key.as_deref(), Some("biceps_curl"));
    assert_eq!(sets[0].muscle_group.as_deref(), Some("biceps"));
    assert_eq!(sets[0].weight_value, Some(20.0));
    assert_eq!(sets[0].weight_unit, "kg");
    assert_eq!(sets[0].weight_kg, Some(20.0));
    assert_eq!(sets[0].duration_ms, Some(22_450));
    assert_eq!(sets[0].avg_hr, Some(92));
    assert_eq!(sets[0].calories_kcal, Some(4.0));

    assert_eq!(sets[1].set_index, 2);
    assert_eq!(sets[1].action_code, 14);
    assert_eq!(sets[1].exercise_key.as_deref(), Some("lateral_raises"));
    assert_eq!(sets[1].muscle_group.as_deref(), Some("shoulders"));
    assert_eq!(sets[1].weight_value, Some(20.0));
    assert_eq!(sets[1].weight_unit, "lb");
    assert_eq!(sets[1].weight_kg, Some(9.072));

    // 表外编号 1030 绝不猜名字；0 心率与负千卡哨兵转为 None；毫秒缺失回退到整秒 * 1000。
    assert_eq!(sets[2].action_code, 1030);
    assert_eq!(sets[2].exercise_key, None);
    assert_eq!(sets[2].muscle_group, None);
    assert_eq!(sets[2].weight_value, None);
    assert_eq!(sets[2].weight_kg, None);
    assert_eq!(sets[2].duration_ms, Some(30_000));
    assert_eq!(sets[2].avg_hr, None);
    assert_eq!(sets[2].calories_kcal, None);

    let detail =
        build_strength_workout_detail(sets, true, Some(3), Some(35), Some(45), None).unwrap();
    assert_eq!(detail.total_sets, 3);
    assert_eq!(detail.total_reps, 35);
    // 10 * 20.0 + 10 * 9.072 = 290.72 kg
    assert_eq!(detail.total_volume_kg, Some(290.72));
    assert_eq!(detail.rest_seconds, Some(45));
    assert_eq!(detail.exercise_groups.len(), 3);
}

#[test]
fn running_laps_never_look_like_strength_sets() {
    let data = json!({
        "lap": "0,300,1000,s00000000000,148,300,-20000;1,295,1000,s00000000000,154,595,-20000;",
    });
    assert!(parse_strength_sets(data.as_object().unwrap()).is_empty());
}

/// 自重动作（重量、单位写 -1）、计时动作（次数写 -1）、组间休息行（动作、次数、重量都是 -1）
/// 夹在负重组中间时，负重组照样带出重量，整场不再因为一行被清空（#170）。
#[test]
fn bodyweight_timed_and_rest_rows_do_not_wipe_the_weighted_sets() {
    let lap = [
        synthetic_62_col_row(0, 40, 101, 6.0, 60.0, 8, 0, 65, 40_200),
        synthetic_62_col_row(1, 90, 88, 1.0, -1.0, -1, -1, -1, 90_000),
        synthetic_62_col_row(2, 35, 104, 5.0, -1.0, 12, -1, 14, 35_000),
        synthetic_62_col_row(3, 45, 110, 4.0, 0.0, -1, 0, 65, 45_000),
        synthetic_62_col_row(4, 38, 106, 6.0, 62.5, 6, 0, 65, 38_400),
    ]
    .join(";");
    let data = json!({ "lap": lap });
    let sets = parse_strength_sets(data.as_object().unwrap());
    assert_eq!(sets.len(), 4, "休息行不算一组");
    assert_eq!(
        sets.iter().map(|s| s.set_index).collect::<Vec<_>>(),
        vec![1, 2, 3, 4]
    );
    assert_eq!(sets[0].weight_kg, Some(60.0));
    // 自重：有次数、没有重量。
    assert_eq!((sets[1].reps, sets[1].weight_kg), (12, None));
    assert_eq!(sets[1].weight_unit, "kg");
    // 计时：次数 -1 记成 0，时长照样留着。
    assert_eq!((sets[2].reps, sets[2].duration_ms), (0, Some(45_000)));
    assert_eq!(sets[3].weight_kg, Some(62.5));

    let detail = build_strength_workout_detail(sets, true, None, None, None, None).unwrap();
    // 8 * 60 + 6 * 62.5 = 855 kg；自重和计时组不计负荷。
    assert_eq!(detail.total_volume_kg, Some(855.0));
}

/// 单位格写 -1 但重量格有数时，重量按 kg 留下，不再整场每组都没有重量；自重行照旧为空。
#[test]
fn weight_survives_when_the_unit_cell_is_not_kg_or_lb() {
    let lap = [
        synthetic_62_col_row(0, 40, 101, 6.0, 40.0, 10, -1, 65, 40_200),
        synthetic_62_col_row(1, 35, 104, 5.0, -1.0, 12, -1, 14, 35_000),
        synthetic_62_col_row(2, 38, 106, 6.0, 42.5, 8, 7, 65, 38_400),
    ]
    .join(";");
    let data = json!({ "lap": lap, "strengthSets": "[{}]" });
    let sets = parse_strength_sets(data.as_object().unwrap());
    assert_eq!(sets.len(), 3);
    assert_eq!(
        (
            sets[0].weight_value,
            sets[0].weight_kg,
            sets[0].weight_unit.as_str()
        ),
        (Some(40.0), Some(40.0), "kg")
    );
    assert_eq!(sets[1].weight_kg, None);
    assert_eq!(sets[2].weight_kg, Some(42.5));

    let detail = build_strength_workout_detail(sets, true, None, None, None, None).unwrap();
    // 10 * 40 + 8 * 42.5 = 740 kg
    assert_eq!(detail.total_volume_kg, Some(740.0));
}

/// 报文带力量训练标记时，距离 / 累计秒那两列不是 0 也照样解析；不带标记时仍按跑步分圈拒掉。
#[test]
fn strength_envelope_relaxes_the_running_lap_guard_only_when_present() {
    let row = |idx: usize| {
        let mut cols: Vec<String> =
            synthetic_62_col_row(idx, 30, 100, 3.0, 20.0, 10, 0, 65, 30_000)
                .split(',')
                .map(str::to_string)
                .collect();
        cols[5] = (30 * (idx + 1)).to_string();
        cols.join(",")
    };
    let lap = format!("{};{}", row(0), row(1));
    let bare = json!({ "lap": lap });
    assert!(parse_strength_sets(bare.as_object().unwrap()).is_empty());

    let marked = json!({ "lap": lap, "strengthAssess": "[{\"eq\":[]}]" });
    let sets = parse_strength_sets(marked.as_object().unwrap());
    assert_eq!(sets.len(), 2);
    assert_eq!(sets[1].weight_kg, Some(20.0));
}

/// 带距离、列数又够多的跑步分圈，仍然不会被当成力量组。
#[test]
fn long_running_lap_rows_with_distance_are_still_rejected() {
    let row = |idx: usize| {
        let mut cols: Vec<String> =
            synthetic_62_col_row(idx, 300, 150, 60.0, 0.0, 0, 0, 0, 300_000)
                .split(',')
                .map(str::to_string)
                .collect();
        cols[2] = "1000".into();
        cols[5] = (300 * (idx + 1)).to_string();
        cols[28] = "-1".into();
        cols.join(",")
    };
    let data = json!({ "lap": format!("{};{}", row(0), row(1)) });
    assert!(parse_strength_sets(data.as_object().unwrap()).is_empty());
}

fn history(entries: &[(i32, i32)]) -> String {
    serde_json::to_string(
        &entries
            .iter()
            .map(|&(action_code, reps)| StoredStrengthGroupEntry { action_code, reps })
            .collect::<Vec<_>>(),
    )
    .unwrap()
}

/// 有的表款把组间休息记成动作 0、次数 0 的一行（时长就是休息计时）：不算一组（#170）。
#[test]
fn action_zero_rest_rows_are_not_counted_as_sets() {
    let lap = [
        synthetic_62_col_row(0, 24, 112, 3.0, 20.0, 8, -1, 1201, 24_110),
        synthetic_62_col_row(1, 120, 107, 15.0, -1.0, 0, -1, 0, 120_000),
        synthetic_62_col_row(2, 23, 100, 2.0, 20.0, 7, -1, 1201, 23_600),
    ]
    .join(";");
    let data = json!({ "lap": lap, "type": 52 });
    let sets = parse_strength_sets(data.as_object().unwrap());
    assert_eq!(
        sets.iter().map(|s| s.action_code).collect::<Vec<_>>(),
        vec![1201, 1201]
    );
}

/// 在 Zepp App 里改过次数、删过组之后，汇总的逐组列表是改后的版本，`lap` 还是手表原始的：
/// 组数、动作、次数跟汇总走，重量、时长、心率沿用 `lap` 里对上的那一组（#170）。
#[test]
fn edits_from_the_summary_win_and_keep_the_lap_weights() {
    let sets = [
        // 引体向上手表没数出次数，App 里补成 8 和 7。
        synthetic_62_col_row(0, 24, 112, 3.0, 10.0, 0, 0, 1201, 24_110),
        synthetic_62_col_row(1, 23, 100, 2.0, 10.0, 0, 0, 1201, 23_600),
        synthetic_62_col_row(2, 30, 120, 4.0, 15.0, 9, 0, 1983, 30_000),
        // 这一组在 App 里删掉了。
        synthetic_62_col_row(3, 40, 117, 6.0, 15.0, 11, 0, 1983, 39_570),
        synthetic_62_col_row(4, 40, 135, 7.0, 50.0, 10, 0, 1908, 40_190),
    ]
    .join(";");
    let data = json!({ "lap": sets, "type": 52 });
    let sets = parse_strength_sets(data.as_object().unwrap());
    assert_eq!(sets.len(), 5);

    let groups = history(&[(1201, 8), (1201, 7), (1983, 11), (1908, 12), (102, 10)]);
    let detail =
        build_strength_workout_detail(sets, true, Some(6), Some(30), Some(90), Some(&groups))
            .unwrap();
    assert_eq!(detail.total_sets, 5);
    assert_eq!(detail.zepp_total_sets, Some(6));
    assert_eq!(
        detail
            .sets
            .iter()
            .map(|s| (s.set_index, s.action_code, s.reps, s.weight_kg))
            .collect::<Vec<_>>(),
        vec![
            (1, 1201, 8, Some(10.0)),
            (2, 1201, 7, Some(10.0)),
            // 次数改成 11，重量和时长沿用 lap 里同动作的第一组。
            (3, 1983, 11, Some(15.0)),
            (4, 1908, 12, Some(50.0)),
            // App 里补的一组：没有手表记录，重量和时长不猜。
            (5, 102, 10, None),
        ]
    );
    assert_eq!(detail.sets[2].duration_ms, Some(30_000));
    assert_eq!(detail.sets[4].duration_ms, None);
    assert_eq!(
        detail.sets[4].exercise_key.as_deref(),
        Some("dumbbell_shrug")
    );
    assert_eq!(detail.total_reps, 48);
    // 8*10 + 7*10 + 11*15 + 12*50 = 915
    assert_eq!(detail.total_volume_kg, Some(915.0));
    assert_eq!(detail.exercise_groups.len(), 4);
}

/// FIT 的 set 不带动作（编号 0）：条数和汇总一样时按位置对齐，动作和名字来自汇总，
/// 时长和重量来自 FIT，两条路得到同样的结构（#170）。
#[test]
fn fit_sets_without_actions_line_up_with_the_summary_by_position() {
    let fit_set = |index: i32, reps: i32, weight: Option<f64>, ms: i64| StrengthSetRow {
        set_index: index,
        action_code: 0,
        exercise_key: None,
        muscle_group: None,
        reps,
        weight_value: weight,
        weight_unit: "kg".into(),
        weight_kg: weight,
        duration_ms: Some(ms),
        avg_hr: None,
        calories_kcal: None,
        exercise_name: None,
        secondary_muscle_groups: Vec::new(),
    };
    let sets = vec![
        fit_set(1, 10, Some(90.0), 40_000),
        fit_set(2, 10, Some(90.0), 41_000),
        fit_set(3, 12, None, 35_000),
    ];
    let groups = history(&[(1310, 10), (1310, 10), (1, 12)]);
    let detail =
        build_strength_workout_detail(sets, true, Some(3), Some(32), None, Some(&groups)).unwrap();
    assert_eq!(
        detail
            .sets
            .iter()
            .map(|s| (s.action_code, s.reps, s.weight_kg, s.duration_ms))
            .collect::<Vec<_>>(),
        vec![
            (1310, 10, Some(90.0), Some(40_000)),
            (1310, 10, Some(90.0), Some(41_000)),
            (1, 12, None, Some(35_000)),
        ]
    );
    assert_eq!(
        detail.sets[2].exercise_key.as_deref(),
        Some("bodyweight_squats")
    );
}

/// 还没有逐组明细时，总组数按汇总列表的条数算：云端 `total_group` 写 25、列表只有 21 组时
/// 显示 21，和动作分组对得上（#170）。
#[test]
fn summary_only_total_sets_follow_the_listed_sets() {
    let entries: Vec<(i32, i32)> = (0..21).map(|i| (1310 + (i / 3), 10)).collect();
    let groups = history(&entries);
    let detail = build_strength_workout_detail(
        Vec::new(),
        true,
        Some(25),
        Some(210),
        Some(700),
        Some(&groups),
    )
    .unwrap();
    assert_eq!(detail.total_sets, 21);
    // Zepp 自己的汇总数原样留着，导出和 MCP 里能对照。
    assert_eq!(detail.zepp_total_sets, Some(25));
    assert_eq!(detail.total_reps, 210);
    assert_eq!(
        detail.exercise_groups.iter().map(|g| g.sets).sum::<i32>(),
        21
    );
}
