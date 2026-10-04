use super::*;
use serde_json::json;

/// 一张解析回来的表：(上面最近的标题, 表头, 行)。
type Table = (String, Vec<String>, Vec<Vec<String>>);

/// 把 `.md` 里的 CSV 表按「上面最近的标题」收起来：标题 → (表头, 行)。
fn tables(text: &str) -> Vec<Table> {
    let mut out = Vec::new();
    let mut heading = String::new();
    let mut lines = text.lines();
    while let Some(line) = lines.next() {
        if line.starts_with('#') {
            heading = line.trim_start_matches('#').trim().to_string();
        } else if line == "```csv" {
            let mut rows = Vec::new();
            for row in lines.by_ref() {
                if row == "```" {
                    break;
                }
                rows.push(parse_csv_line(row));
            }
            let headers = rows.remove(0);
            out.push((heading.clone(), headers, rows));
        }
    }
    out
}

fn parse_csv_line(line: &str) -> Vec<String> {
    let mut cells = Vec::new();
    let mut current = String::new();
    let mut quoted = false;
    let mut chars = line.chars().peekable();
    while let Some(char) = chars.next() {
        match (char, quoted) {
            ('"', true) if chars.peek() == Some(&'"') => {
                current.push('"');
                chars.next();
            }
            ('"', _) => quoted = !quoted,
            (',', false) => cells.push(std::mem::take(&mut current)),
            _ => current.push(char),
        }
    }
    cells.push(current);
    cells
}

fn table<'a>(all: &'a [Table], heading: &str) -> &'a Table {
    all.iter()
        .find(|(title, _, _)| title == heading)
        .unwrap_or_else(|| panic!("缺少表：{heading}"))
}

fn cell_of(table: &Table, row_key: &str, column: &str) -> String {
    let (_, headers, rows) = table;
    let index = headers
        .iter()
        .position(|header| header == column)
        .unwrap_or_else(|| panic!("缺少列 {column}：{headers:?}"));
    rows.iter()
        .find(|row| row[0] == row_key)
        .unwrap_or_else(|| panic!("缺少行 {row_key}"))[index]
        .clone()
}

fn sample_document(seconds: usize) -> Value {
    let start = chrono::DateTime::parse_from_rfc3339("2026-09-20T07:00:00+00:00").unwrap();
    let samples: Vec<Value> = (0..seconds)
        .map(|second| {
            let at = start + chrono::Duration::seconds(second as i64);
            json!({
                "timestamp": at.to_rfc3339(),
                "heart_rate": 120 + (second % 40) as i64,
                "pace": 5.5 + (second % 7) as f64 / 10.0,
                "cadence": null,
            })
        })
        .collect();
    json!({
        "schema": "zeppbridge.ai_task",
        "schema_version": 1,
        "generated_at": "2026-09-30T02:00:00+00:00",
        "task": { "id": "draft", "title": "Long run check", "detail_level": "detailed", "window_anchor": "workouts", "personal_note": "" },
        "workouts": [{
            "workout_id": "w-1", "workout_type": "running",
            "start_time": "2026-09-20T07:00:00+00:00", "end_time": "2026-09-20T08:04:00+00:00",
            "distance_meters": 12000.5, "avg_hr": 150, "max_hr": 181, "calories": 820,
            "hr_zones": [{ "index": 0, "upper_bound_bpm": 120, "seconds": 300 }],
            "sample_count": seconds, "gps_available": false, "source_scope": "device",
            "series": {
                "samples": samples, "pauses": [], "laps": [],
                "splits": [{ "index": 1, "start_time": "2026-09-20T07:00:00+00:00", "end_time": "2026-09-20T07:05:30+00:00",
                    "distance_m": 1000.0, "duration_seconds": 330, "pace_min_per_km": 5.5, "avg_hr": 140, "max_hr": 150,
                    "elevation_gain_m": null, "elevation_loss_m": null, "partial": false }],
                "summary": { "average_pace": 5.6, "average_cadence": null }
            }
        }],
        "context": [
            { "category": "heart", "days": [
                { "date": "2026-09-19", "linked_workout_ids": ["w-1"], "metrics": [
                    { "metric": "resting_hr", "unit": "bpm", "value": 48 },
                    { "metric": "hrv", "unit": "ms", "value": 61.5, "min": 40, "max": 90, "samples": 12 } ] },
                { "date": "2026-09-20", "linked_workout_ids": ["w-1"], "metrics": [
                    { "metric": "hrv", "unit": "ms", "value": 58.25 } ] }
            ]},
            { "category": "sleep", "days": [
                { "date": "2026-09-20", "linked_workout_ids": ["w-1"], "sleeps": [
                    { "sleep_id": "s-1", "start_time": "2026-09-19T15:30:00+00:00", "end_time": "2026-09-19T22:40:00+00:00",
                      "score": 82, "duration_minutes": 430, "deep_minutes": 90, "rem_minutes": 100, "source_scope": "device" } ] }
            ]},
            { "category": "workouts", "days": [
                { "date": "2026-09-18", "linked_workout_ids": [], "workouts": [
                    { "workout_id": "w-0", "workout_type": "walking", "start_time": "2026-09-18T10:00:00+00:00",
                      "end_time": "2026-09-18T10:40:00+00:00", "calories": 150.0, "source_scope": "device" } ] }
            ]}
        ],
        "coverage": [{ "category": "heart", "workout_id": "w-1", "start_date": "2026-09-13", "end_date": "2026-09-20",
            "days_in_range": 8, "days_with_data": 2, "sources": ["device", "user_fused"], "missing": false }],
        "attachments": [{ "display_name": "blood test.pdf", "kind": "pdf", "byte_len": 2048 }],
        "units": { "distance_meters": "m", "avg_hr": "bpm", "max_hr": "bpm", "calories": "kcal",
                   "duration_minutes": "min", "deep_minutes": "min", "rem_minutes": "min", "light_minutes": "min", "awake_minutes": "min" }
    })
}

/// 从 `.md` 解析回表，逐项与原文档一致；空格 = 没数据，绝不补 0。
#[test]
fn markdown_round_trips_every_value_and_leaves_missing_cells_empty() {
    let document = sample_document(120);
    let render = render_task_markdown(&document, "PROMPT", usize::MAX);
    assert!(render.text.starts_with("PROMPT\n\n---\n\n# Data"));
    let all = tables(&render.text);

    let daily = table(&all, "Daily metrics");
    assert_eq!(cell_of(daily, "2026-09-19", "resting_hr (bpm)"), "48");
    assert_eq!(cell_of(daily, "2026-09-19", "hrv (ms)"), "61.5");
    assert_eq!(cell_of(daily, "2026-09-19", "hrv_min (ms)"), "40");
    assert_eq!(cell_of(daily, "2026-09-19", "hrv_samples (count)"), "12");
    assert_eq!(cell_of(daily, "2026-09-20", "hrv (ms)"), "58.25");
    // 9/20 没有静息心率：空着，不是 0。
    assert_eq!(cell_of(daily, "2026-09-20", "resting_hr (bpm)"), "");

    let sleep = table(&all, "Sleep");
    assert_eq!(cell_of(sleep, "2026-09-20", "score"), "82");
    assert_eq!(cell_of(sleep, "2026-09-20", "deep_minutes (min)"), "90");
    assert_eq!(cell_of(sleep, "2026-09-20", "light_minutes (min)"), "");

    let selected = table(&all, "Selected workouts");
    assert_eq!(cell_of(selected, "w-1", "distance_meters (m)"), "12000.5");
    assert_eq!(cell_of(selected, "w-1", "max_hr (bpm)"), "181");
    let others = table(&all, "Workouts in range");
    assert_eq!(cell_of(others, "w-0", "calories (kcal)"), "150.0");

    let coverage = table(&all, "Coverage");
    assert_eq!(cell_of(coverage, "heart", "sources"), "device;user_fused");
    assert_eq!(cell_of(coverage, "heart", "days_with_data"), "2");

    let splits = table(&all, "Splits");
    assert_eq!(cell_of(splits, "1", "pace_min_per_km (min/km)"), "5.5");
    assert_eq!(cell_of(splits, "1", "elevation_gain_m"), "");

    let attachments = table(&all, "Attachments");
    assert_eq!(
        cell_of(attachments, "blood test.pdf", "byte_len (bytes)"),
        "2048"
    );

    // 曲线：10 秒一段，心率带每段最低 / 最高；cadence 整列没有读数就不出现。
    assert_eq!(render.curve_average_seconds, Some(10));
    let (_, headers, rows) = all
        .iter()
        .find(|(title, _, _)| title.starts_with("Samples"))
        .unwrap();
    assert_eq!(
        headers,
        &[
            "offset_s",
            "heart_rate",
            "heart_rate_min",
            "heart_rate_max",
            "pace"
        ]
    );
    assert_eq!(rows.len(), 12);
    assert_eq!(rows[0][0], "0");
    assert_eq!(rows[0][2], "120");
    assert_eq!(rows[0][3], "129");
    // 全量统计写在概要里，不从均值反推。
    let stats = table(&all, "Curve statistics (full resolution)");
    let heart = stats.2.iter().find(|row| row[1] == "heart_rate").unwrap();
    assert_eq!(
        (heart[2].as_str(), heart[3].as_str(), heart[4].as_str()),
        ("120", "120", "159")
    );
}

/// 超预算按 10 → 30 → 60 秒降级，再让最旧的运动只留概要行，最后才标记超预算。
#[test]
fn budget_ladder_coarsens_curves_then_summarizes_then_flags() {
    let document = sample_document(3_600);
    let fine = render_task_markdown(&document, "", usize::MAX);
    assert_eq!(fine.curve_average_seconds, Some(10));

    let at_30 = render_task_markdown(&document, "", fine.approx_tokens - 1);
    assert_eq!(at_30.curve_average_seconds, Some(30));
    assert!(at_30.approx_tokens < fine.approx_tokens);

    let at_60 = render_task_markdown(&document, "", at_30.approx_tokens - 1);
    assert_eq!(at_60.curve_average_seconds, Some(60));
    assert!(at_60.summarized_workouts.is_empty());

    let summarized = render_task_markdown(&document, "", at_60.approx_tokens - 1);
    assert_eq!(summarized.summarized_workouts, vec!["w-1".to_string()]);
    assert!(!summarized.text.contains("#### Samples"));
    // 概要行与区间仍在。
    assert!(summarized.text.contains("### Selected workouts"));
    assert!(!summarized.over_budget);

    let hopeless = render_task_markdown(&document, "", 10);
    assert!(hopeless.over_budget);
}

#[test]
fn documents_without_curves_render_once_without_average() {
    let mut document = sample_document(10);
    document["workouts"][0]
        .as_object_mut()
        .unwrap()
        .remove("series");
    let render = render_task_markdown(&document, "", 5);
    assert_eq!(render.curve_average_seconds, None);
    assert!(render.over_budget);
    assert!(!render.text.contains("curve_average_seconds"));
}

#[test]
fn cells_with_commas_quotes_and_fences_stay_inside_their_cell() {
    let mut document = sample_document(0);
    document["task"]["title"] = json!("a, \"b\"");
    document["attachments"] = json!([{ "display_name": "x,y ```z", "kind": "pdf", "byte_len": 1 }]);
    let render = render_task_markdown(&document, "", usize::MAX);
    let all = tables(&render.text);
    let attachments = table(&all, "Attachments");
    assert_eq!(attachments.2[0][0], "x,y '''z");
}

#[test]
fn token_estimate_counts_ascii_by_three_and_cjk_one_each() {
    assert_eq!(estimate_tokens(""), 0);
    assert_eq!(estimate_tokens(&"a".repeat(31)), 10);
    assert_eq!(estimate_tokens("中文"), 2);
}

#[test]
fn final_format_follows_food_and_comparison_without_filling_unknowns() {
    let mut document = sample_document(0);
    document["food"] = json!([{"date":"2026-10-04","food_name":"Oats","protein":null}]);
    document["plan_adherence"] = json!([
    {"date":"2026-10-04","planned":{"name":"Easy","sport":"running","seconds":2700,"hr_low":130,"hr_high":145},"actual":[{"workout_id":"w-1","seconds":3000,"avg_hr":140,"compatible":true}],"verdict":"done"},
    {"date":"2026-10-05","planned":{"name":"Easy","sport":"running","seconds":2700},"actual":[],"verdict":"missed"}
    ]);
    let render = render_task_markdown(
        &document,
        "Discuss first\n<!-- zeppbridge-final-plan -->\nFinal format",
        usize::MAX,
    );
    assert!(render.text.find("Discuss first").unwrap() < render.text.find("# Data").unwrap());
    assert!(render.text.find("## food").unwrap() < render.text.find("## Plan vs actual").unwrap());
    assert!(
        render.text.find("## Plan vs actual").unwrap() < render.text.find("Final format").unwrap()
    );
    assert!(!render.text.contains("zeppbridge-final-plan"));
    let all = tables(&render.text);
    let comparison = table(&all, "Plan vs actual");
    assert_eq!(comparison.2[0][5], "300");
    assert_eq!(comparison.2[1][5], "");
    assert_eq!(comparison.2[1][6], "");
}
