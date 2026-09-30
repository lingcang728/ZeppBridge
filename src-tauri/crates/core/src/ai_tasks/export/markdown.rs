//! 交给 AI 的单个 `.md` 文件（批次 ⑦）。
//!
//! 为什么是 Markdown 而不是原来的缩进 JSON：同一条 64 分钟运动，缩进 JSON 约 44 万 token，
//! 表格化以后约 4.5 万，10 秒均值约 0.5 万；而免费版 AI 往往只读得完 3 万 token 左右。
//! 用户还要能「把一个文件拖进对话框」就完事，不再分数据和提示词两个文件。
//!
//! 做法：**从现有的任务文档（`build_task_document` 那份 JSON）逐节渲染**，不另查库——
//! JSON 仍是唯一的数据构造，CLI / MCP 的导出契约一个字不动。表格一律用 CSV 代码块：
//! 列名带单位，单元格空着 = 那天没有数据（绝不写 0），数值按 JSON 的写法原样打印。
//!
//! 预算：超出时依次把运动曲线按 10 → 30 → 60 秒取平均（每段保留最高 / 最低心率，整体统计先用
//! 全量算好写进「曲线统计」），再让最旧的运动只留概要行；仍超就标记 `over_budget`，由界面提示
//! 缩短范围——**不拆文件**。
//!
//! 文字说明（「这份文件怎么读」）由前端按界面语言给；这里的节标题与列名是和 JSON 键同一层次的
//! 机器名，不翻译。

use serde_json::{Map, Value};
use std::collections::{BTreeMap, BTreeSet};
use std::fmt::Write as _;

/// 曲线取平均的档位（秒）。1 秒原始采样不进 `.md`：一条长跑就能吃掉整份预算。
pub const CURVE_AVERAGE_STEPS: [u32; 3] = [10, 30, 60];
/// 没订阅时的默认预算（token）：Gemini 等免费版约读得完 3.2 万。
pub const DEFAULT_TOKEN_BUDGET: usize = 30_000;
/// 「我已订阅」时放宽到的预算。
pub const SUBSCRIBED_TOKEN_BUDGET: usize = 120_000;

#[derive(Debug, Clone, PartialEq)]
pub struct MarkdownRender {
    pub text: String,
    /// 估算的 token 数（见 [`estimate_tokens`]）。
    pub approx_tokens: usize,
    /// 运动曲线按多少秒取了平均；没有曲线时为 `None`。
    pub curve_average_seconds: Option<u32>,
    /// 为了进预算、只留了概要行的运动（最旧的先让）。
    pub summarized_workouts: Vec<String>,
    /// 降到最后一档仍然超预算。
    pub over_budget: bool,
}

/// 粗估 token：ASCII 约 3.1 字符一个 token（实测 140 KB 的 CSV ≈ 4.5 万 token），
/// 其余字符（中文等）按一个一个算。只用来给界面「约 N 万 token」和选降级档位。
pub fn estimate_tokens(text: &str) -> usize {
    let mut ascii = 0usize;
    let mut other = 0usize;
    for char in text.chars() {
        if char.is_ascii() {
            ascii += 1;
        } else {
            other += 1;
        }
    }
    ascii.div_ceil(31) * 10 + other
}

/// 渲染并按预算降级。`header` 是放在最前面的提示词 + 读法说明（前端已本地化）。
pub fn render_task_markdown(document: &Value, header: &str, token_budget: usize) -> MarkdownRender {
    let anchors = anchor_ids_oldest_first(document);
    let has_series = document
        .get("workouts")
        .and_then(Value::as_array)
        .is_some_and(|items| items.iter().any(|item| item.get("series").is_some()));
    let levels: Vec<Option<u32>> = if has_series {
        CURVE_AVERAGE_STEPS.iter().map(|step| Some(*step)).collect()
    } else {
        vec![None]
    };

    let mut last = None;
    for level in &levels {
        let render = render_with(document, header, *level, &BTreeSet::new());
        if render.approx_tokens <= token_budget {
            return render;
        }
        last = Some(render);
    }
    // 曲线降到最粗仍超：从最旧的运动起只留概要行。
    let coarsest = *levels.last().unwrap_or(&None);
    let mut summarized = BTreeSet::new();
    for id in &anchors {
        summarized.insert(id.clone());
        let render = render_with(document, header, coarsest, &summarized);
        if render.approx_tokens <= token_budget {
            return render;
        }
        last = Some(render);
    }
    let mut render = last.unwrap_or_else(|| render_with(document, header, coarsest, &summarized));
    render.over_budget = render.approx_tokens > token_budget;
    render
}

fn anchor_ids_oldest_first(document: &Value) -> Vec<String> {
    let mut items: Vec<(String, String)> = document
        .get("workouts")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter(|item| item.get("series").is_some())
                .filter_map(|item| {
                    Some((
                        item.get("start_time")?.as_str()?.to_string(),
                        item.get("workout_id")?.as_str()?.to_string(),
                    ))
                })
                .collect()
        })
        .unwrap_or_default();
    items.sort();
    items.into_iter().map(|(_, id)| id).collect()
}

fn render_with(
    document: &Value,
    header: &str,
    average: Option<u32>,
    summarized: &BTreeSet<String>,
) -> MarkdownRender {
    let units = document
        .get("units")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
    let mut out = String::new();
    let header = header.trim();
    if !header.is_empty() {
        out.push_str(header);
        out.push_str("\n\n---\n\n");
    }
    out.push_str("# Data\n\n");

    let series_present = document
        .get("workouts")
        .and_then(Value::as_array)
        .is_some_and(|items| items.iter().any(|item| item.get("series").is_some()));
    let curve_average = if series_present { average } else { None };

    summary_section(&mut out, document, curve_average, summarized);
    daily_metrics_section(&mut out, document);
    sleep_section(&mut out, document, &units);
    workouts_section(&mut out, document, &units, curve_average, summarized);
    attachments_section(&mut out, document);

    let approx_tokens = estimate_tokens(&out);
    MarkdownRender {
        text: out,
        approx_tokens,
        curve_average_seconds: curve_average,
        summarized_workouts: summarized.iter().cloned().collect(),
        over_budget: false,
    }
}

// ---------------------------------------------------------------- 各节

fn summary_section(
    out: &mut String,
    document: &Value,
    average: Option<u32>,
    summarized: &BTreeSet<String>,
) {
    out.push_str("## Summary\n\n");
    let task = document.get("task").cloned().unwrap_or(Value::Null);
    let line = |out: &mut String, key: &str, value: Option<&Value>| {
        if let Some(text) = value.map(cell).filter(|text| !text.is_empty()) {
            let _ = writeln!(out, "- {key}: {text}");
        }
    };
    line(out, "schema", document.get("schema"));
    line(out, "schema_version", document.get("schema_version"));
    line(out, "generated_at", document.get("generated_at"));
    line(out, "task", task.get("title"));
    line(out, "detail_level", task.get("detail_level"));
    line(out, "window_anchor", task.get("window_anchor"));
    line(out, "include_precise_gps", task.get("include_precise_gps"));
    line(out, "personal_note", task.get("personal_note"));
    if let Some(seconds) = average {
        let _ = writeln!(out, "- curve_average_seconds: {seconds}");
    }
    if !summarized.is_empty() {
        let _ = writeln!(
            out,
            "- workouts_summary_only: {}",
            summarized.iter().cloned().collect::<Vec<_>>().join(";")
        );
    }
    out.push('\n');

    if let Some(rows) = document.get("coverage").and_then(Value::as_array) {
        if !rows.is_empty() {
            out.push_str("### Coverage\n\n");
            let columns = [
                "category",
                "workout_id",
                "start_date",
                "end_date",
                "days_in_range",
                "days_with_data",
                "sources",
                "missing",
            ];
            let body = rows
                .iter()
                .map(|row| columns.iter().map(|key| cell_opt(row.get(*key))).collect())
                .collect();
            csv_block(out, &columns.map(String::from), body);
        }
    }

    // 曲线降采样了：整体统计先用逐秒全量算好写在这里，AI 不必从均值反推极值。
    if average.is_some() {
        let mut body = Vec::new();
        for workout in document
            .get("workouts")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
        {
            let Some(samples) = workout.pointer("/series/samples").and_then(Value::as_array) else {
                continue;
            };
            let id = cell_opt(workout.get("workout_id"));
            for field in sample_fields(samples) {
                let values: Vec<f64> = samples
                    .iter()
                    .filter_map(|sample| sample.get(&field).and_then(Value::as_f64))
                    .collect();
                if values.is_empty() {
                    continue;
                }
                let min = values.iter().copied().fold(f64::INFINITY, f64::min);
                let max = values.iter().copied().fold(f64::NEG_INFINITY, f64::max);
                let mean = values.iter().sum::<f64>() / values.len() as f64;
                body.push(vec![
                    id.clone(),
                    field.clone(),
                    values.len().to_string(),
                    number(min),
                    number(max),
                    number(round2(mean)),
                ]);
            }
        }
        if !body.is_empty() {
            out.push_str("### Curve statistics (full resolution)\n\n");
            csv_block(
                out,
                &["workout_id", "field", "samples", "min", "max", "mean"].map(String::from),
                body,
            );
        }
    }
}

/// 所有类别的按天指标并成一张宽表：一行一天，一列一个指标（单位进列名）。
fn daily_metrics_section(out: &mut String, document: &Value) {
    let mut columns: Vec<String> = Vec::new();
    let mut seen = BTreeSet::new();
    let mut rows: BTreeMap<String, BTreeMap<String, String>> = BTreeMap::new();
    for day in context_days(document) {
        let Some(date) = day.get("date").and_then(Value::as_str) else {
            continue;
        };
        for metric in day
            .get("metrics")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
        {
            let Some(name) = metric.get("metric").and_then(Value::as_str) else {
                continue;
            };
            let unit = metric.get("unit").and_then(Value::as_str).unwrap_or("");
            for (suffix, key) in [
                ("", "value"),
                ("_min", "min"),
                ("_max", "max"),
                ("_samples", "samples"),
            ] {
                let Some(value) = metric.get(key) else {
                    continue;
                };
                let unit = if key == "samples" { "count" } else { unit };
                let column = with_unit(&format!("{name}{suffix}"), unit);
                if seen.insert(column.clone()) {
                    columns.push(column.clone());
                }
                rows.entry(date.to_string())
                    .or_default()
                    .insert(column, cell(value));
            }
        }
    }
    if rows.is_empty() {
        return;
    }
    out.push_str("## Daily metrics\n\n");
    let mut headers = vec!["date".to_string()];
    headers.extend(columns.iter().cloned());
    let body = rows
        .into_iter()
        .map(|(date, values)| {
            let mut row = vec![date];
            row.extend(
                columns
                    .iter()
                    .map(|column| values.get(column).cloned().unwrap_or_default()),
            );
            row
        })
        .collect();
    csv_block(out, &headers, body);
}

const SLEEP_COLUMNS: [&str; 11] = [
    "sleep_id",
    "start_time",
    "end_time",
    "score",
    "duration_minutes",
    "deep_minutes",
    "light_minutes",
    "rem_minutes",
    "awake_minutes",
    "wake_count",
    "source_scope",
];

fn sleep_section(out: &mut String, document: &Value, units: &Map<String, Value>) {
    let mut sleeps: Vec<(String, &Value)> = Vec::new();
    let mut seen = BTreeSet::new();
    for day in context_days(document) {
        let date = day.get("date").and_then(Value::as_str).unwrap_or_default();
        for sleep in day
            .get("sleeps")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
        {
            let id = cell_opt(sleep.get("sleep_id"));
            if seen.insert(id) {
                sleeps.push((date.to_string(), sleep));
            }
        }
    }
    if sleeps.is_empty() {
        return;
    }
    out.push_str("## Sleep\n\n");
    let mut headers = vec!["date".to_string()];
    headers.extend(SLEEP_COLUMNS.iter().map(|key| column_name(key, units)));
    let body = sleeps
        .iter()
        .map(|(date, sleep)| {
            let mut row = vec![date.clone()];
            row.extend(SLEEP_COLUMNS.iter().map(|key| cell_opt(sleep.get(*key))));
            row
        })
        .collect();
    csv_block(out, &headers, body);
    for (_, sleep) in &sleeps {
        let Some(stages) = sleep.get("stages").and_then(Value::as_array) else {
            continue;
        };
        if stages.is_empty() {
            continue;
        }
        let _ = writeln!(
            out,
            "### Sleep stages {}\n",
            cell_opt(sleep.get("sleep_id"))
        );
        object_table(out, stages, &["stage", "start_time", "end_time"], &[]);
    }
}

const WORKOUT_LEAD: [&str; 4] = ["workout_id", "workout_type", "start_time", "end_time"];
const WORKOUT_NESTED: [&str; 2] = ["series", "hr_zones"];

fn workouts_section(
    out: &mut String,
    document: &Value,
    units: &Map<String, Value>,
    average: Option<u32>,
    summarized: &BTreeSet<String>,
) {
    // 窗口里的其他运动（上下文），每次一行。
    let mut others: Vec<&Value> = Vec::new();
    let mut seen = BTreeSet::new();
    for day in context_days(document) {
        for workout in day
            .get("workouts")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
        {
            if seen.insert(cell_opt(workout.get("workout_id"))) {
                others.push(workout);
            }
        }
    }
    let anchors: Vec<&Value> = document
        .get("workouts")
        .and_then(Value::as_array)
        .map(|items| items.iter().collect())
        .unwrap_or_default();
    if others.is_empty() && anchors.is_empty() {
        return;
    }
    out.push_str("## Workouts\n\n");
    if !anchors.is_empty() {
        out.push_str("### Selected workouts\n\n");
        workout_table(out, &anchors, units);
    }
    if !others.is_empty() {
        out.push_str("### Workouts in range\n\n");
        workout_table(out, &others, units);
    }
    for workout in anchors {
        let id = cell_opt(workout.get("workout_id"));
        let zones = workout.get("hr_zones").and_then(Value::as_array);
        let series = workout.get("series");
        if zones.is_none() && series.is_none() {
            continue;
        }
        let _ = writeln!(out, "### Workout {id}\n");
        if let Some(zones) = zones {
            out.push_str("#### Heart rate zones\n\n");
            object_table(
                out,
                zones,
                &["index", "upper_bound_bpm", "seconds"],
                &[("upper_bound_bpm", "bpm"), ("seconds", "s")],
            );
        }
        let Some(series) = series else {
            continue;
        };
        if summarized.contains(&id) {
            // 预算不够时最旧的运动只留上面那行概要与区间，曲线不写。
            continue;
        }
        let spans: &[&str] = &["index", "start_time", "end_time"];
        for (key, title, lead, units_hint) in [
            (
                "splits",
                "Splits",
                spans,
                &[
                    ("distance_m", "m"),
                    ("duration_seconds", "s"),
                    ("pace_min_per_km", "min/km"),
                ][..],
            ),
            (
                "laps",
                "Laps",
                spans,
                &[("distance_m", "m"), ("duration_seconds", "s")][..],
            ),
            (
                "pauses",
                "Pauses",
                &["start_time", "end_time", "kind"][..],
                &[][..],
            ),
        ] {
            if let Some(rows) = series
                .get(key)
                .and_then(Value::as_array)
                .filter(|rows| !rows.is_empty())
            {
                let _ = writeln!(out, "#### {title}\n");
                object_table(out, rows, lead, units_hint);
            }
        }
        if let Some(summary) = series.get("summary").and_then(Value::as_object) {
            let body: Vec<Vec<String>> = summary
                .iter()
                .filter(|(_, value)| !value.is_null())
                .map(|(key, value)| vec![key.clone(), cell(value)])
                .collect();
            if !body.is_empty() {
                out.push_str("#### Series summary\n\n");
                csv_block(out, &["field".to_string(), "value".to_string()], body);
            }
        }
        let start = workout.get("start_time").and_then(Value::as_str);
        if let Some(samples) = series
            .get("samples")
            .and_then(Value::as_array)
            .filter(|rows| !rows.is_empty())
        {
            let seconds = average.unwrap_or(1);
            let _ = writeln!(
                out,
                "#### Samples (averaged over {seconds} s, offset from start)\n"
            );
            averaged_samples(out, samples, start, seconds);
        }
        if let Some(route) = series
            .get("route")
            .and_then(Value::as_array)
            .filter(|rows| !rows.is_empty())
        {
            let seconds = average.unwrap_or(1);
            let _ = writeln!(out, "#### Route (one point per {seconds} s)\n");
            thinned_route(out, route, start, seconds);
        }
    }
}

fn workout_table(out: &mut String, rows: &[&Value], units: &Map<String, Value>) {
    let mut keys: Vec<String> = WORKOUT_LEAD.iter().map(|key| key.to_string()).collect();
    for row in rows {
        for (key, value) in row.as_object().into_iter().flatten() {
            if WORKOUT_NESTED.contains(&key.as_str()) || value.is_object() || value.is_array() {
                continue;
            }
            if !keys.contains(key) {
                keys.push(key.clone());
            }
        }
    }
    let headers: Vec<String> = keys.iter().map(|key| column_name(key, units)).collect();
    let body = rows
        .iter()
        .map(|row| keys.iter().map(|key| cell_opt(row.get(key))).collect())
        .collect();
    csv_block(out, &headers, body);
}

fn attachments_section(out: &mut String, document: &Value) {
    let Some(rows) = document
        .get("attachments")
        .and_then(Value::as_array)
        .filter(|rows| !rows.is_empty())
    else {
        return;
    };
    out.push_str("## Attachments\n\n");
    object_table(
        out,
        rows,
        &["display_name", "kind", "byte_len"],
        &[("byte_len", "bytes")],
    );
}

// ---------------------------------------------------------------- 曲线

fn sample_fields(samples: &[Value]) -> Vec<String> {
    let mut fields = Vec::new();
    for sample in samples {
        for (key, value) in sample.as_object().into_iter().flatten() {
            if key != "timestamp" && value.is_number() && !fields.contains(key) {
                fields.push(key.clone());
            }
        }
    }
    fields
}

fn offset_seconds(start: Option<&str>, timestamp: Option<&str>) -> Option<i64> {
    let start = chrono::DateTime::parse_from_rfc3339(start?).ok()?;
    let at = chrono::DateTime::parse_from_rfc3339(timestamp?).ok()?;
    Some((at - start).num_seconds())
}

/// 按 `seconds` 秒分段取平均；心率另给每段的最低 / 最高。没有读数的字段那一格留空。
fn averaged_samples(out: &mut String, samples: &[Value], start: Option<&str>, seconds: u32) {
    let fields = sample_fields(samples);
    let step = i64::from(seconds.max(1));
    let mut buckets: BTreeMap<i64, Vec<&Value>> = BTreeMap::new();
    for sample in samples {
        let Some(offset) = offset_seconds(start, sample.get("timestamp").and_then(Value::as_str))
        else {
            continue;
        };
        buckets
            .entry(offset.div_euclid(step) * step)
            .or_default()
            .push(sample);
    }
    let with_extremes = fields.iter().any(|field| field == "heart_rate");
    let mut headers = vec!["offset_s".to_string()];
    for field in &fields {
        headers.push(field.clone());
        if field == "heart_rate" {
            headers.push("heart_rate_min".into());
            headers.push("heart_rate_max".into());
        }
    }
    let body = buckets
        .into_iter()
        .map(|(offset, rows)| {
            let mut line = vec![offset.to_string()];
            for field in &fields {
                let values: Vec<f64> = rows
                    .iter()
                    .filter_map(|row| row.get(field).and_then(Value::as_f64))
                    .collect();
                if values.is_empty() {
                    line.push(String::new());
                    if field == "heart_rate" {
                        line.push(String::new());
                        line.push(String::new());
                    }
                    continue;
                }
                let mean = values.iter().sum::<f64>() / values.len() as f64;
                line.push(if step == 1 {
                    number(values[0])
                } else {
                    number(round2(mean))
                });
                if field == "heart_rate" && with_extremes {
                    line.push(number(values.iter().copied().fold(f64::INFINITY, f64::min)));
                    line.push(number(
                        values.iter().copied().fold(f64::NEG_INFINITY, f64::max),
                    ));
                }
            }
            line
        })
        .collect();
    csv_block(out, &headers, body);
}

/// 轨迹每段取第一个点（位置不取平均：平均出来的点可能落在路外）。
fn thinned_route(out: &mut String, route: &[Value], start: Option<&str>, seconds: u32) {
    let step = i64::from(seconds.max(1));
    let mut seen = BTreeSet::new();
    let body = route
        .iter()
        .filter_map(|point| {
            let offset = offset_seconds(start, point.get("timestamp").and_then(Value::as_str))?;
            seen.insert(offset.div_euclid(step)).then(|| {
                vec![
                    offset.to_string(),
                    cell_opt(point.get("latitude")),
                    cell_opt(point.get("longitude")),
                    cell_opt(point.get("altitude_m")),
                ]
            })
        })
        .collect();
    csv_block(
        out,
        &[
            "offset_s",
            "latitude (deg)",
            "longitude (deg)",
            "altitude_m (m)",
        ]
        .map(String::from),
        body,
    );
}

// ---------------------------------------------------------------- 表格与单元格

fn context_days(document: &Value) -> impl Iterator<Item = &Value> {
    document
        .get("context")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .flat_map(|section| {
            section
                .get("days")
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
        })
}

/// 一组同形对象画成一张表：`lead` 里的列排在前面（第一列当行名），其余键按名字排。
fn object_table(out: &mut String, rows: &[Value], lead: &[&str], units_hint: &[(&str, &str)]) {
    let mut keys: Vec<String> = lead
        .iter()
        .filter(|key| rows.iter().any(|row| row.get(**key).is_some()))
        .map(|key| key.to_string())
        .collect();
    for row in rows {
        for (key, _) in row.as_object().into_iter().flatten() {
            if !keys.contains(key) {
                keys.push(key.clone());
            }
        }
    }
    let headers: Vec<String> = keys
        .iter()
        .map(|key| {
            units_hint
                .iter()
                .find(|(field, _)| field == key)
                .map(|(_, unit)| with_unit(key, unit))
                .unwrap_or_else(|| key.clone())
        })
        .collect();
    let body = rows
        .iter()
        .map(|row| keys.iter().map(|key| cell_opt(row.get(key))).collect())
        .collect();
    csv_block(out, &headers, body);
}

fn column_name(key: &str, units: &Map<String, Value>) -> String {
    match units.get(key).and_then(Value::as_str) {
        Some(unit) => with_unit(key, unit),
        None => key.to_string(),
    }
}

fn with_unit(key: &str, unit: &str) -> String {
    if unit.is_empty() {
        key.to_string()
    } else {
        format!("{key} ({unit})")
    }
}

fn csv_block(out: &mut String, headers: &[String], rows: Vec<Vec<String>>) {
    out.push_str("```csv\n");
    out.push_str(
        &headers
            .iter()
            .map(|header| csv_escape(header))
            .collect::<Vec<_>>()
            .join(","),
    );
    out.push('\n');
    for row in rows {
        out.push_str(
            &row.iter()
                .map(|value| csv_escape(value))
                .collect::<Vec<_>>()
                .join(","),
        );
        out.push('\n');
    }
    out.push_str("```\n\n");
}

fn csv_escape(value: &str) -> String {
    if value.contains([',', '"', '\n', '\r']) || value.contains("```") {
        format!("\"{}\"", value.replace('"', "\"\"").replace("```", "'''"))
    } else {
        value.to_string()
    }
}

fn cell_opt(value: Option<&Value>) -> String {
    value.map(cell).unwrap_or_default()
}

/// 单元格：null = 空（没有数据，不是 0）；数字按 JSON 的写法；数组用 `;` 连起来。
fn cell(value: &Value) -> String {
    match value {
        Value::Null => String::new(),
        Value::String(text) => text.replace(['\n', '\r'], " "),
        Value::Number(number) => number.to_string(),
        Value::Bool(flag) => flag.to_string(),
        Value::Array(items) => items.iter().map(cell).collect::<Vec<_>>().join(";"),
        Value::Object(_) => value.to_string(),
    }
}

/// 算出来的数（均值、极值）：整数不带 `.0`，其余照 Rust 的最短写法。
fn number(value: f64) -> String {
    if !value.is_finite() {
        return String::new();
    }
    if value.fract() == 0.0 && value.abs() < 1e15 {
        format!("{}", value as i64)
    } else {
        format!("{value}")
    }
}

fn round2(value: f64) -> f64 {
    (value * 100.0).round() / 100.0
}

#[cfg(test)]
#[path = "markdown_tests.rs"]
mod tests;
