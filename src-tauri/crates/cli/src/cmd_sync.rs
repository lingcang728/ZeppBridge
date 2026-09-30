//! sync 子命令与报告输出（从 main.rs 拆出，逻辑不变）。

use super::*;

pub(super) fn cmd_sync(args: &[String]) -> u8 {
    let json_mode = scan_json_flag(args);
    let flags = match Flags::parse(args) {
        Ok(flags) => flags,
        Err(message) => return fail(json_mode, EXIT_USAGE, "usage", &message),
    };
    if let Err(message) = flags.reject_unknown(&["json", "mode", "days", "no-reprocess"]) {
        return fail(json_mode, EXIT_USAGE, "usage", &message);
    }
    if let Err(message) = flags.reject_duplicates() {
        return fail(json_mode, EXIT_USAGE, "usage", &message);
    }
    let mode = flags.get("mode").unwrap_or("incremental");
    if !matches!(mode, "incremental" | "initial" | "history") {
        return fail(
            json_mode,
            EXIT_USAGE,
            "usage",
            "--mode must be incremental, initial or history",
        );
    }
    let days = match flags.get("days") {
        Some(raw) => match raw.parse::<i64>() {
            Ok(value) if (1..=3650).contains(&value) => Some(value),
            _ => {
                return fail(
                    json_mode,
                    EXIT_USAGE,
                    "usage",
                    "--days must be between 1 and 3650",
                )
            }
        },
        None => None,
    };
    if mode != "history" && days.is_some() {
        return fail(
            json_mode,
            EXIT_USAGE,
            "usage",
            "--days only means something with --mode history",
        );
    }

    let dir = match data_dir() {
        Ok(dir) => dir,
        Err(message) => return fail(json_mode, EXIT_FAILED, "failed", &message),
    };
    let auth = match AuthManager::new(dir.clone()).load_auth() {
        Ok(Some(auth)) => auth,
        Ok(None) => {
            return fail(
                json_mode,
                EXIT_NOT_CONFIGURED,
                "not_configured",
                &not_connected_message(&dir),
            )
        }
        Err(error) => {
            let (code, kind) = exit_code_for(&error);
            return fail(json_mode, code, kind, &user_text(&error));
        }
    };

    let cancel = Arc::new(AtomicBool::new(false));
    let account = auth.user_id.clone();
    let connector = match ZeppConnector::with_cancel(auth, cancel.clone()) {
        Ok(connector) => connector,
        Err(error) => {
            let (code, kind) = exit_code_for(&error);
            return fail(json_mode, code, kind, &user_text(&error));
        }
    };
    let db = match Database::open_migrated(&dir.join("zepp.db")) {
        Ok(db) => db,
        Err(error) => {
            let (code, kind) = exit_code_for(&error);
            return fail(json_mode, code, kind, &user_text(&error));
        }
    };

    // 解析器升级欠下的重放在这里补。这是无头环境里唯一一条本来就长、本来
    // 就写库、本来就挂在定时器上的命令——把它放在这儿，用户什么都不用做，
    // 而 `status` 那种秒回的命令一秒都不会变慢。
    //
    // 必须在同步之前、并且在同步取写锁之前做完：`sync_report` 自己还要取
    // 同一把跨进程写锁，套在一起就是死锁。
    let replay = if flags.has("no-reprocess") {
        None
    } else {
        match db.pending_replay_plan() {
            Ok(Some(plan)) if plan.raw_records > 0 => {
                announce_replay(&plan);
                match run_replay(&dir, &db, &plan, false) {
                    Ok(Some(outcome)) => {
                        eprintln!("{}", outcome.human());
                        Some(outcome)
                    }
                    Ok(None) => None,
                    // 重放失败不该连累同步：拉新数据仍然是有意义的，历史
                    // 记录晚一轮再对齐也比这次什么都不做强。说出来即可。
                    Err((_, _, message)) => {
                        eprintln!("Local replay failed; syncing anyway: {message}");
                        None
                    }
                }
            }
            Ok(_) => None,
            Err(error) => {
                eprintln!(
                    "Could not read the parser revision; skipping the replay: {}",
                    user_text(&error)
                );
                None
            }
        }
    };

    let manager = SyncManager::new(DataFetcher::new(connector), db, cancel)
        .with_data_dir(dir.clone())
        .with_account(account);

    let runtime = match tokio::runtime::Runtime::new() {
        Ok(runtime) => runtime,
        Err(error) => {
            return fail(
                json_mode,
                EXIT_FAILED,
                "failed",
                &format!("Could not start the async runtime: {error}"),
            )
        }
    };
    let result: Result<SyncReport, ZeppBridgeError> = runtime.block_on(async {
        match mode {
            "initial" => manager.initial_sync_report().await,
            "history" => manager.history_sync_report(days.unwrap_or(180)).await,
            _ => manager.incremental_sync_report().await,
        }
    });

    match result {
        Ok(report) => {
            let (code, payload, human) = sync_report_output(&report, mode, replay.as_ref());
            emit(json_mode, payload, &human);
            code
        }
        Err(error) => {
            // 写锁冲突不是失败：桌面应用正开着同步，调度脚本稍后重试即可。
            // 靠类型判断，不靠匹配错误文案——文案是会改的。
            let (code, kind) = exit_code_for(&error);
            fail(json_mode, code, kind, &user_text(&error))
        }
    }
}

pub(super) fn sync_report_output(
    report: &SyncReport,
    mode: &str,
    replay: Option<&ReplayOutcome>,
) -> (u8, serde_json::Value, String) {
    let payload = serde_json::json!({
        "ok": report.success,
        "mode": mode,
        "success": report.success,
        "recordsWritten": report.records_written,
        "message": report.message,
        // 同步前有没有补过重放。null = 没做（不欠，或者 --no-reprocess）。
        // 调度脚本据此知道这一轮为什么跑了十分钟。
        "replay": replay.map(ReplayOutcome::to_json),
        "streams": report.streams.iter().map(|stream| serde_json::json!({
            "stream": stream.stream,
            "status": stream.status,
            "recordsWritten": stream.records_written,
            "rawRecords": stream.raw_records,
            "message": stream.message,
        })).collect::<Vec<_>>(),
    });
    let human = format!(
        "Sync {}: {} records written. {}",
        if report.success {
            "complete"
        } else {
            "partly failed"
        },
        report.records_written,
        report.message.as_deref().unwrap_or("")
    );
    (
        if report.success {
            EXIT_OK
        } else {
            EXIT_INCOMPLETE_SYNC
        },
        payload,
        human,
    )
}

/* ------------------------------ export ------------------------------ */
