//! 从已共享的任务里展开授权窗口（从 access.rs 拆出，逻辑不变）。

use super::*;

/// 从本机库读出所有 `mcp_shared = 1` 的任务，展开成授权。
///
/// 不再先探 `sqlite_master` / `table_info`：直接 SELECT，表不在、列不齐
/// 或任何查询错误都回零授权——fail-closed 语义与旧探测版一致，只是少两次
/// 往返。每次工具调用都重新走一遍这里，所以任务页里的授权开关对下一次
/// MCP 请求立即生效，不需要重启服务。
pub fn shared_task_grants(db: &Database) -> Result<Vec<TaskGrant>> {
    let payloads: Vec<String> = (|| -> std::result::Result<Vec<String>, rusqlite::Error> {
        let mut stmt = db
            .conn
            .prepare("SELECT payload FROM ai_tasks WHERE mcp_shared = 1")?;
        let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
        rows.collect()
    })()
    .unwrap_or_default();

    let mut tasks = Vec::with_capacity(payloads.len());
    for payload in payloads {
        match serde_json::from_str::<SharedTaskPayload>(&payload) {
            Ok(task) => tasks.push(task),
            Err(error) => {
                eprintln!("zeppbridge-mcp: 跳过一条解析失败的授权任务：{error}");
            }
        }
    }

    // 所有任务的 workout_ids 一遍 IN 取出本地开始日——逐 id 主键查询在
    // 多任务 × 多运动时是 N+1。查不到开始日的 id 在展开时照旧跳过。
    let workout_ids: Vec<String> = tasks
        .iter()
        .flat_map(|task| task.workout_ids.iter().cloned())
        .collect();
    let local_days = workout_local_days(db, &workout_ids)?;

    let mut grants = Vec::with_capacity(tasks.len());
    for task in tasks {
        grants.push(expand_task(task, &local_days));
    }
    Ok(grants)
}

/// `ai_tasks.payload` 里授权判定用到的最小子集。其余字段（标题、提示词、
/// 附件等）与访问判定无关，不读也不依赖。
#[derive(Debug, Deserialize)]
pub(super) struct SharedTaskPayload {
    #[serde(default)]
    pub(super) id: String,
    #[serde(default)]
    pub(super) workout_ids: Vec<String>,
    #[serde(default)]
    pub(super) categories: Vec<SharedCategoryRange>,
}

#[derive(Debug, Deserialize)]
pub(super) struct SharedCategoryRange {
    /// `AiTaskCategory` 字符串；认不出来的类别不授权，但不会毁掉整个任务。
    pub(super) category: String,
    /// 缺省按未启用处理：授权方向必须 fail-closed。
    #[serde(default)]
    pub(super) enabled: bool,
    /// 与任务模型默认值一致：每天窗口 = 运动开始日往前 14 天。
    #[serde(default = "default_days_before")]
    pub(super) days_before: i64,
    #[serde(default = "default_true")]
    pub(super) include_workout_day: bool,
}

pub(super) fn default_days_before() -> i64 {
    14
}

pub(super) fn default_true() -> bool {
    true
}

/// 把一个任务的「workout_ids × 启用类别」展开成绝对日期窗口。
///
/// 每条运动独立开窗：`[开始日 − days_before, 开始日]`（`include_workout_day`
/// 为假时右端前移一天）。`local_days` 是 `workout_local_days` 批量查好的
/// 开始日表；id 不在表里（记录已删/未同步）就跳过它，类别为假、窗口为空
/// 同理——这些都不值得让整个授权失败。
pub(super) fn expand_task(
    task: SharedTaskPayload,
    local_days: &BTreeMap<String, NaiveDate>,
) -> TaskGrant {
    let mut windows = Vec::new();
    for workout_id in &task.workout_ids {
        let Some(day) = local_days.get(workout_id).copied() else {
            continue;
        };
        for range in &task.categories {
            if !range.enabled {
                continue;
            }
            let Some(category) = AccessCategory::parse(&range.category) else {
                continue;
            };
            if !category.is_windowed() {
                continue;
            }
            let end = if range.include_workout_day {
                day
            } else {
                day - Duration::days(1)
            };
            let start = day - Duration::days(range.days_before.max(0));
            if let Some(window) = GrantWindow::new(category, start, end) {
                windows.push(window);
            }
        }
    }
    TaskGrant {
        task_id: task.id,
        workout_ids: task.workout_ids,
        windows,
    }
}

/// `workout_local_day` 的批量版：所有开放任务的运动 id 一遍
/// `IN` 取回本地开始日（P4：`date(start_time,'localtime')`），在内存里
/// 按 id 归位。表里没有的 id 不进 map——展开侧按「查不到就跳过」处理，
/// 与单条版 `.optional()` 回 `None` 同语义。
pub(super) fn workout_local_days(
    db: &Database,
    workout_ids: &[String],
) -> Result<BTreeMap<String, NaiveDate>> {
    let mut days = BTreeMap::new();
    if workout_ids.is_empty() {
        return Ok(days);
    }
    let placeholders = workout_ids
        .iter()
        .map(|_| "?")
        .collect::<Vec<_>>()
        .join(",");
    let mut stmt = db.conn.prepare(&format!(
        "SELECT workout_id, date(start_time, 'localtime') FROM workouts
         WHERE workout_id IN ({placeholders})"
    ))?;
    let rows = stmt.query_map(params_from_iter(workout_ids.iter()), |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })?;
    for row in rows {
        let (workout_id, value) = row?;
        let day = NaiveDate::parse_from_str(&value, "%Y-%m-%d")
            .map_err(|error| ZeppBridgeError::ParseError(format!("运动开始日无效: {error}")))?;
        days.insert(workout_id, day);
    }
    Ok(days)
}

/// 授权窗口内最新一晚睡眠的 id（按醒来本地日归属，与睡眠列表同口径）。
///
/// `get_sleep_detail` 不带 id 在任务范围内不是「全库最新一晚」，而是
/// 「授权窗内最新一晚」——窗口外有更新的记录也不该被看见。
pub fn latest_sleep_in_windows(db: &Database, permit: &Permit) -> Result<Option<String>> {
    let mut stmt = db.conn.prepare(
        "SELECT sleep_id, date(end_time, 'localtime') FROM sleep_sessions
         ORDER BY end_time DESC",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })?;
    for row in rows {
        let (sleep_id, day) = row?;
        let Ok(day) = NaiveDate::parse_from_str(&day, "%Y-%m-%d") else {
            continue;
        };
        if permit.day_permitted(AccessCategory::Sleep, day) {
            return Ok(Some(sleep_id));
        }
    }
    Ok(None)
}

/* ------------------------------ 测试 ------------------------------ */
