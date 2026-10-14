//! status 子命令（从 main.rs 拆出，逻辑不变）。

use super::*;

pub(super) fn cmd_status(args: &[String]) -> u8 {
    let json_mode = scan_json_flag(args);
    let flags = match Flags::parse(args) {
        Ok(flags) => flags,
        Err(message) => return fail(json_mode, EXIT_USAGE, "usage", &message),
    };
    if let Err(message) = flags.reject_unknown(&["json"]) {
        return fail(json_mode, EXIT_USAGE, "usage", &message);
    }
    if let Err(message) = flags.reject_duplicates() {
        return fail(json_mode, EXIT_USAGE, "usage", &message);
    }

    let dir = match data_dir() {
        Ok(dir) => dir,
        Err(message) => return fail(json_mode, EXIT_FAILED, "failed", &message),
    };
    let auth_status = AuthManager::new(dir.clone()).status();
    let connected = auth_status
        .as_ref()
        .map(|status| status.configured)
        .unwrap_or(false);

    let db = match open_read_only() {
        Ok(db) => db,
        Err((code, message)) => {
            // 没有库也要能打印出原因，否则调度脚本连状态都查不到。
            return fail(json_mode, code, error_kind_for(code), &message);
        }
    };

    let database_bytes = std::fs::metadata(dir.join("zepp.db"))
        .map(|meta| meta.len())
        .unwrap_or(0);
    let health = match db.data_health(30, database_bytes) {
        Ok(health) => health,
        Err(error) => {
            let (code, kind) = exit_code_for(&error);
            return fail(json_mode, code, kind, &user_text(&error));
        }
    };
    // 只读的一问：这个库欠不欠一次重放。status 说出来，但绝不代跑——
    // 一条调度脚本每分钟都在调的命令，不能因为解析器升级就突然跑四分钟。
    let replay_plan = db.pending_replay_plan().ok().flatten();
    let replay_notice = pending_replay_notice(replay_plan.as_ref());
    let ledger = db.coverage_ledger().ok();
    let workouts = db.get_recent_workouts(1).unwrap_or_default();
    // 「本机有多少历史」是所有出口都要能回答的问题，不只是桌面应用：
    // 一个调度脚本同样需要在导出半年之前知道本机是不是只有 30 天。
    let coverage = db
        .local_coverage(Local::now().date_naive())
        .unwrap_or_default();

    let payload = serde_json::json!({
        "ok": true,
        "version": VERSION,
        "connected": connected,
        "databaseBytes": database_bytes,
        "schemaVersion": health.database.schema_version,
        // 库里实际记着的修订号，不是这个程序自己的常量。两者可以不相等，
        // 而不相等正是这里唯一值得报告的事。
        "normalizerRevision": health.database.stored_normalizer_revision,
        "normalizerRevisionExpected": NORMALIZER_REVISION,
        "normalizerReplayPending": health.database.normalizer_replay_pending,
        "normalizerReplayRawRecords": replay_plan
            .as_ref()
            .map(|plan| plan.raw_records)
            .unwrap_or(0),
        "lastCloudSyncAt": health.timings.last_cloud_sync_at,
        "latestWorkoutAt": workouts.first().map(|workout| workout.start_time.to_rfc3339()),
        "streams": health.streams.iter().map(|stream| serde_json::json!({
            "stream": stream.stream,
            "fetch": stream.fetch.state,
            "parse": stream.parse.state,
            "write": stream.write.state,
            "rawRecords": stream.raw_records,
            "canonicalRecords": stream.canonical_records,
        })).collect::<Vec<_>>(),
        "historyPlanned": ledger.as_ref().map(|value| value.total_chunks > 0),
        "historyComplete": ledger.as_ref().map(|value| value.complete),
        "historyPendingChunks": ledger
            .as_ref()
            .map(|value| value.total_chunks - value.completed_chunks),
        "coverageEarliestDay": coverage.earliest_day,
        "coverageLatestDay": coverage.latest_day,
        "coverageDays": coverage.covered_days,
    });

    let human = format!(
        "ZeppBridge {VERSION}\nAccount: {}\nDatabase: {} bytes, schema v{}\nLocal coverage: {}\nLast cloud sync: {}\nHistory ledger: {}{}",
        if connected { "connected" } else { "not connected" },
        database_bytes,
        health.database.schema_version,
        // JSON 里早就有这三个字段，纯文本却漏了一行——同一个命令的两种
        // 输出对「本机有多少历史」给出不同的答案，是这个项目最不该出现的事。
        match coverage.earliest_day.as_deref() {
            Some(day) => format!("{} days, earliest {}", coverage.covered_days, day),
            None => "nothing stored yet".to_string(),
        },
        health
            .timings
            .last_cloud_sync_at
            .as_deref()
            .unwrap_or("never"),
        // 「一块都没排过」和「排了还没做完」不是一回事。前者不是进度落后，
        // 是根本还没开始规划补拉。
        match ledger.as_ref() {
            Some(value) if value.total_chunks == 0 => "no backfill planned yet".to_string(),
            Some(value) if value.complete => "every month chunk has an outcome".to_string(),
            Some(value) => format!(
                "{} month chunks still without an outcome",
                value.total_chunks - value.completed_chunks
            ),
            None => "ledger unreadable".to_string(),
        },
        match replay_notice.as_deref() {
            Some(notice) => format!("\nParser: {notice}"),
            None => String::new(),
        }
    );
    emit(json_mode, payload, &human);
    EXIT_OK
}

/* ------------------------------ sync ------------------------------ */
