//! 各工具的执行：运动列表、单次洞察、指标序列、睡眠详情、数据健康（其余七个在 browse.rs）。

use super::*;

pub(super) fn run_list_workouts(
    db: &Database,
    args: &Value,
    scope: &AccessScope,
    permit: &Permit,
) -> Result<Value, CallFailure> {
    let (limit, offset) = page_args(args, 20, 200);
    let (workouts, has_more) = if scope.is_task_scoped() {
        // 授权按 id，不按「全库最近 N 条」：一条授权运动再老也得能出来（R4）。
        // 授权了但记录已删/未同步的 id 查不到明细，如实跳过。
        let mut granted = Vec::new();
        for workout_id in &permit.workout_ids {
            if let Some(workout) = db
                .get_workout_detail(workout_id)
                .map_err(|error| CallFailure::plain(error.user_message()))?
            {
                granted.push(workout);
            }
        }
        granted.sort_by_key(|workout| std::cmp::Reverse(workout.start_time));
        let has_more = granted.len() > offset.saturating_add(limit);
        (
            granted
                .into_iter()
                .skip(offset)
                .take(limit)
                .collect::<Vec<_>>(),
            has_more,
        )
    } else {
        let mut page = db
            .workouts_page(limit + 1, offset)
            .map_err(|error| CallFailure::plain(error.user_message()))?;
        let has_more = page.len() > limit;
        page.truncate(limit);
        (page, has_more)
    };
    let entries: Vec<Value> = workouts
        .iter()
        .map(|workout| {
            let mut entry = json!({
                "workoutId": workout.workout_id,
                "type": workout.effective_type,
                "customLabel": workout.custom_label,
                "startTime": workout.start_time.to_rfc3339(),
                "endTime": workout.end_time.to_rfc3339(),
                "distanceMeters": workout.distance_meters,
                "calories": workout.calories,
                "avgHr": workout.avg_hr,
                "maxHr": workout.max_hr,
                "sourceScope": workout.source_scope,
                "gpsAvailable": workout.gps_available,
                "sampleCount": workout.sample_count,
            });
            if scope.is_task_scoped() {
                // 任务里拖出去的字段不出去（R01）。
                access::project_workout_list_entry(
                    &mut entry,
                    &permit.workout_excluded_fields(&workout.workout_id),
                );
            }
            entry
        })
        .collect();
    Ok(json!({
        "workouts": entries,
        "units": { "distance": "m", "heartRate": "bpm", "calories": "kcal" },
        "limit": limit,
        "offset": offset,
        "hasMore": has_more,
        "missingValues": contract::MISSING_VALUE_CONVENTION,
    }))
}

pub(super) fn run_workout_insight(
    db: &Database,
    args: &Value,
    scope: &AccessScope,
    permit: &Permit,
) -> Result<Value, CallFailure> {
    let workout_id = args
        .get("workoutId")
        .and_then(Value::as_str)
        .ok_or_else(|| CallFailure::plain("缺少 workoutId"))?;
    let mut insight = db
        .workout_insight(workout_id)
        .map_err(|error| CallFailure::plain(error.user_message()))?;
    if scope.is_task_scoped() {
        // R1：原洞察的基线是在全库上算的——included/excluded 会带出未授权
        // 运动的 id、日期、距离，facts 的聚合值也是未授权样本的平均。把
        // 基线里仍属授权集的行取回来，按授权集重算。
        let candidate_ids: BTreeSet<String> = insight
            .baseline_included
            .iter()
            .map(|entry| entry.workout_id.clone())
            .chain(
                insight
                    .baseline_excluded
                    .iter()
                    .map(|entry| entry.workout_id.clone()),
            )
            .filter(|id| permit.workout_ids.contains(id))
            // 基线按距离挑可比记录：排除了距离的运动不进基线，否则它的
            // 距离会从基线均值里漏出去（R01）。
            .filter(|id| {
                !permit
                    .workout_excluded_fields(id)
                    .contains("distance_meters")
            })
            .collect();
        let mut rows = BTreeMap::new();
        for workout_id in candidate_ids {
            if let Some(workout) = db
                .get_workout_detail(&workout_id)
                .map_err(|error| CallFailure::plain(error.user_message()))?
            {
                rows.insert(workout_id, access::GrantedRun::from_workout(&workout));
            }
        }
        let baseline_ids: BTreeSet<String> = rows.keys().cloned().collect();
        access::rescore_insight(&mut insight, &baseline_ids, &rows);
        access::project_workout_insight(&mut insight, &permit.workout_excluded_fields(workout_id));
    }
    serde_json::to_value(&insight)
        .map_err(|error| CallFailure::plain(format!("序列化失败：{error}")))
}

pub(super) fn run_metric_series(
    db: &Database,
    args: &Value,
    scope: &AccessScope,
    permit: &Permit,
) -> Result<Value, CallFailure> {
    let metrics = metric_args(args).map_err(CallFailure::plain)?;
    let days = args
        .get("days")
        .and_then(Value::as_i64)
        .unwrap_or(90)
        .clamp(1, 1825);
    let mut series = db
        .metric_series(&metrics, days)
        .map_err(|error| CallFailure::plain(error.user_message()))?;
    if scope.is_task_scoped() {
        // authorize 已保证请求的每个类别都与授权窗有交集；这里把点裁到
        // 授权日内并重算 latest/average/days_with_data/window_days，让序列
        // 自述的就是它实际覆盖的授权范围（R3）。
        series = access::clip_metric_series(series, permit);
    }
    Ok(json!({
        "series": serde_json::to_value(&series)
            .map_err(|error| CallFailure::plain(format!("序列化失败：{error}")))?,
        "requestedMetrics": metrics,
        "missingValues": contract::MISSING_VALUE_CONVENTION,
        "time": contract::TIME_CONVENTION,
    }))
}

pub(super) fn run_sleep_detail(
    db: &Database,
    args: &Value,
    scope: &AccessScope,
    permit: &Permit,
) -> Result<Value, CallFailure> {
    let session = match args.get("sleepId").and_then(Value::as_str) {
        Some(id) => {
            let detail = db
                .get_sleep_detail(id)
                .map_err(|error| CallFailure::plain(error.user_message()))?;
            match detail {
                // 睡眠按醒来本地日归属（与 sleep 列表/insight 同口径），
                // 落在窗外就拒（R2）。
                Some(session) if scope.is_task_scoped() => {
                    let day = session.end_time.with_timezone(&Local).date_naive();
                    if !permit.day_permitted(AccessCategory::Sleep, day) {
                        return Err(CallFailure::denied(
                            "这晚睡眠不在任何开放任务的授权窗口内。",
                            windows_json(&permit.windows),
                        ));
                    }
                    Some(session)
                }
                other => other,
            }
        }
        None => {
            if scope.is_task_scoped() {
                // 「最近一晚」在任务范围里 = 授权窗内最近一晚，不是全库最新
                // （R2）。窗口外有更新的记录也不该被看见；窗内没有就如实拒绝，
                // 而不是退回全库最新。
                let sleep_id = access::latest_sleep_in_windows(db, permit)
                    .map_err(|error| CallFailure::plain(error.user_message()))?;
                match sleep_id {
                    Some(sleep_id) => db
                        .get_sleep_detail(&sleep_id)
                        .map_err(|error| CallFailure::plain(error.user_message()))?,
                    None => {
                        return Err(CallFailure::denied(
                            "授权窗口内还没有睡眠记录。",
                            windows_json(&permit.windows),
                        ));
                    }
                }
            } else {
                let latest = db
                    .get_recent_sleep_sessions(1)
                    .map_err(|error| CallFailure::plain(error.user_message()))?
                    .into_iter()
                    .next();
                // The list deliberately omits stages; load the same detail
                // as an explicit sleepId instead of returning that summary.
                match latest {
                    Some(session) => db
                        .get_sleep_detail(&session.sleep_id)
                        .map_err(|error| CallFailure::plain(error.user_message()))?,
                    None => None,
                }
            }
        }
    };
    Ok(match session {
        Some(session) => {
            let mut sleep = serde_json::to_value(&session)
                .map_err(|error| CallFailure::plain(format!("序列化失败：{error}")))?;
            if scope.is_task_scoped() {
                // 任务里拖出去的睡眠字段不出去（R01）。
                let day = session.end_time.with_timezone(&Local).date_naive();
                access::project_sleep_fields(&mut sleep, &permit.sleep_excluded_fields(day));
            }
            json!({
                "sleep": sleep,
                "units": { "stageMinutes": "min", "heartRate": "bpm" },
                "missingValues": contract::MISSING_VALUE_CONVENTION,
            })
        }
        // 「本机没有这一晚」和「这一晚没有数据」是同一句话：
        // 不返回一个各项为 0 的空壳。
        None => json!({ "sleep": Value::Null, "reason": "本机没有匹配的睡眠记录。" }),
    })
}

pub(super) fn run_data_health(
    db: &Database,
    args: &Value,
    database_bytes: u64,
) -> Result<Value, CallFailure> {
    let window = args
        .get("windowDays")
        .and_then(Value::as_i64)
        .unwrap_or(30)
        .clamp(1, 365);
    let health = db
        .data_health(window, database_bytes)
        .map_err(|error| CallFailure::plain(error.user_message()))?;
    serde_json::to_value(health).map_err(|error| CallFailure::plain(format!("序列化失败：{error}")))
}
