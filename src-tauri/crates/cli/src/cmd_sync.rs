//! sync 子命令与报告输出（从 main.rs 拆出，逻辑不变）。

use super::*;
use crate::headless_official::{
    official_outcome, official_selection, run_official, save_sync_attempt, OFFICIAL_REAUTH,
};
use std::sync::atomic::Ordering;
use zeppbridge_core::models::{AuthInfo, UserPrefs};
use zeppbridge_core::sync::OfficialMode;

pub(super) fn cmd_sync(args: &[String]) -> u8 {
    let json_mode = scan_json_flag(args);
    let flags = match Flags::parse(args) {
        Ok(flags) => flags,
        Err(message) => return fail(json_mode, EXIT_USAGE, "usage", &message),
    };
    if let Err(message) = flags.reject_unknown(&[
        "json",
        "channel",
        "mode",
        "days",
        "no-reprocess",
        "max-chunks",
        "retry-failed",
    ]) {
        return fail(json_mode, EXIT_USAGE, "usage", &message);
    }
    if let Err(message) = flags.reject_duplicates() {
        return fail(json_mode, EXIT_USAGE, "usage", &message);
    }
    let (mode, days, max_chunks) = match sync_options(&flags) {
        Ok(options) => options,
        Err(message) => return fail(json_mode, EXIT_USAGE, "usage", &message),
    };
    let channel = flags.get("channel");

    let dir = match data_dir() {
        Ok(dir) => dir,
        Err(message) => return fail(json_mode, EXIT_FAILED, "failed", &message),
    };
    let advanced = if channel == Some("official") {
        None
    } else {
        AuthManager::new(dir.clone()).load_auth().transpose()
    };
    let official = official_selection(&dir, channel);
    if advanced.is_none() && official.is_none() {
        return fail(
            json_mode,
            EXIT_NOT_CONFIGURED,
            "not_configured",
            &not_connected_message(&dir),
        );
    }
    if let (Some(Err(error)), None) = (&advanced, &official) {
        let (code, kind) = exit_code_for(error);
        return fail(json_mode, code, kind, &user_text(error));
    }
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

    let monthly = advanced.is_some() && uses_monthly_backfill(mode, days);
    if mode == "history" && (monthly || official.is_some()) {
        match db.user_prefs() {
            Ok(prefs) if prefs.backfill_would_be_cleaned_up(days.unwrap_or(180)) => {
                return fail(json_mode, EXIT_USAGE, "usage", "Enable long-term archive in Settings before syncing history beyond the local retention period.");
            }
            Ok(_) => {}
            Err(error) => {
                let (code, kind) = exit_code_for(&error);
                return fail(json_mode, code, kind, &user_text(&error));
            }
        }
    }
    if !monthly && (flags.has("max-chunks") || flags.has("retry-failed")) {
        return fail(
            json_mode,
            EXIT_USAGE,
            "usage",
            "Monthly chunk options require the Advanced channel.",
        );
    }
    if flags.has("retry-failed") {
        let _lock = match write_lock::acquire_with_timeout(
            &dir,
            WritePurpose::Metadata,
            Duration::from_secs(20),
        ) {
            Ok(lock) => lock,
            Err(error) => return fail(json_mode, EXIT_BUSY, "busy", &error.to_string()),
        };
        if let Err(error) = db.reset_failed_backfill_chunks() {
            let (code, kind) = exit_code_for(&error);
            return fail(json_mode, code, kind, &user_text(&error));
        }
    }
    let cancel = Arc::new(AtomicBool::new(false));
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
    if monthly {
        let manager = match advanced
            .expect("monthly backfill requires Advanced")
            .and_then(|auth| advanced_manager(&dir, db, auth, cancel.clone()))
        {
            Ok(manager) => manager,
            Err(error) => {
                let (code, kind) = exit_code_for(&error);
                return fail(json_mode, code, kind, &user_text(&error));
            }
        };
        let today = chrono::Utc::now().date_naive();
        let from = today - chrono::Duration::days(days.unwrap_or(180));
        let result = runtime.block_on(async {
            let work = manager.history_backfill(from, today, max_chunks, |_| {});
            tokio::pin!(work);
            tokio::select! {
                result = &mut work => result,
                _ = tokio::signal::ctrl_c() => {
                    cancel.store(true, std::sync::atomic::Ordering::SeqCst);
                    work.await
                }
            }
        });
        return match result {
            Ok(ledger) => {
                let (code, payload, human) = history_backfill_output(
                    &ledger,
                    cancel.load(std::sync::atomic::Ordering::SeqCst),
                    replay.as_ref(),
                );
                emit(json_mode, payload, &human);
                code
            }
            Err(error) => {
                let (code, kind) = exit_code_for(&error);
                fail(json_mode, code, kind, &user_text(&error))
            }
        };
    }
    let days = match mode {
        "initial" => UserPrefs::DEFAULT_HISTORY_SYNC_DAYS,
        "history" => days.unwrap_or(UserPrefs::DEFAULT_HISTORY_SYNC_DAYS),
        _ => contract::INCREMENTAL_SYNC_DAYS,
    };
    let official_mode = if matches!(advanced, Some(Ok(_))) {
        OfficialMode::Supplement
    } else {
        OfficialMode::Only
    };
    let before = zeppbridge_core::storage::content_epoch();
    let (advanced, official) = runtime.block_on(async {
        let work = async {
            let advanced = match advanced {
                Some(auth) => Some(
                    match auth.and_then(|auth| advanced_manager(&dir, db, auth, cancel.clone())) {
                        Ok(manager) => manager.history_sync_report(days).await,
                        Err(error) => Err(error),
                    },
                ),
                None => None,
            };
            let official = match official {
                Some(Ok(())) if !cancel.load(Ordering::SeqCst) => {
                    Some(run_official(&dir, days, official_mode, cancel.clone()).await)
                }
                Some(Ok(())) => Some(Err(ZeppBridgeError::Cancelled)),
                Some(Err(error)) => Some(Err(error)),
                None => None,
            };
            (advanced, official)
        };
        tokio::pin!(work);
        tokio::select! {
            biased;
            result = &mut work => result,
            _ = tokio::signal::ctrl_c() => {
                cancel.store(true, Ordering::SeqCst);
                work.await
            }
        }
    });
    save_sync_attempt(
        &dir,
        advanced.as_ref(),
        official.as_ref(),
        before != zeppbridge_core::storage::content_epoch(),
    );
    let (code, payload, human) =
        combined_sync_output(advanced.as_ref(), official.as_ref(), mode, replay.as_ref());
    emit(json_mode, payload, &human);
    if [advanced.as_ref(), official.as_ref()]
        .into_iter()
        .flatten()
        .any(Result::is_ok)
    {
        // Push after the local reports have been written, without changing the sync result.
        let credentials = zeppbridge_core::auth::default_credential_backend_in(&dir);
        runtime.block_on(zeppbridge_core::push::run(&dir, credentials));
    }
    code
}

fn advanced_manager(
    dir: &std::path::Path,
    db: Database,
    auth: AuthInfo,
    cancel: Arc<AtomicBool>,
) -> Result<SyncManager, ZeppBridgeError> {
    let account = auth.user_id.clone();
    let connector = ZeppConnector::with_cancel(auth, cancel.clone())?;
    Ok(SyncManager::new(DataFetcher::new(connector), db, cancel)
        .with_data_dir(dir.to_path_buf())
        .with_account(account))
}

fn combined_sync_output(
    advanced: Option<&Result<SyncReport, ZeppBridgeError>>,
    official: Option<&Result<SyncReport, ZeppBridgeError>>,
    mode: &str,
    replay: Option<&ReplayOutcome>,
) -> (u8, serde_json::Value, String) {
    let mut channels = serde_json::Map::new();
    let mut primary = None;
    let mut human = Vec::new();
    let mut code = EXIT_OK;
    let mut records_written = 0;
    let mut needs_reauth = false;
    for (name, result) in [("advanced", advanced), ("official", official)] {
        let Some(result) = result else { continue };
        let (channel_code, mut payload, mut message) = match result {
            Ok(report) => sync_report_output(report, mode, replay),
            Err(error) => {
                let (code, kind) = exit_code_for(error);
                let message = if name == "official" && error.needs_reauth() {
                    OFFICIAL_REAUTH.to_string()
                } else {
                    user_text(error)
                };
                (
                    code,
                    serde_json::json!({
                        "ok": false, "errorKind": kind, "errorCode": error.code(),
                        "message": message, "needsReauth": error.needs_reauth(),
                    }),
                    message,
                )
            }
        };
        if let ("official", Ok(report)) = (name, result) {
            let outcome = official_outcome(report);
            payload["outcome"] = outcome.into();
            message = match outcome {
                "empty" => "Zepp returned no records for the requested window.".into(),
                "unavailable" => "The requested official data is unavailable.".into(),
                _ => message,
            };
        }
        if channel_code != EXIT_OK && (code == EXIT_OK || payload["needsReauth"] == true) {
            code = channel_code;
        }
        records_written += payload["recordsWritten"].as_i64().unwrap_or(0);
        needs_reauth |= payload["needsReauth"] == true;
        // Keep the existing top-level streams for the primary channel.
        if primary.is_none()
            || (primary
                .as_ref()
                .is_some_and(|value: &serde_json::Value| value["streams"].is_null())
                && result.is_ok())
        {
            primary = Some(payload.clone());
        }
        human.push(format!("{name}: {message}"));
        channels.insert(name.to_string(), payload);
    }
    let mut payload = primary.expect("at least one sync channel");
    payload["ok"] = (code == EXIT_OK).into();
    payload["success"] = (code == EXIT_OK).into();
    payload["mode"] = mode.into();
    payload["recordsWritten"] = records_written.into();
    payload["needsReauth"] = needs_reauth.into();
    payload["channels"] = channels.into();
    (code, payload, human.join("\n"))
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
        "needsReauth": report.streams.iter().any(|stream| stream.needs_reauth),
        // 同步前有没有补过重放。null = 没做（不欠，或者 --no-reprocess）。
        // 调度脚本据此知道这一轮为什么跑了十分钟。
        "replay": replay.map(ReplayOutcome::to_json),
        "streams": report.streams.iter().map(|stream| serde_json::json!({
            "stream": stream.stream,
            "status": stream.status,
            "recordsWritten": stream.records_written,
            "rawRecords": stream.raw_records,
            "message": stream.message,
            "needsReauth": stream.needs_reauth,
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

fn sync_options(flags: &Flags) -> Result<(&str, Option<i64>, usize), String> {
    flags.validate_values(&["mode", "days", "max-chunks", "channel"])?;
    if flags
        .get("channel")
        .is_some_and(|channel| !matches!(channel, "advanced" | "official"))
    {
        return Err("--channel must be advanced or official".into());
    }
    let mode = flags.get("mode").unwrap_or("incremental");
    if !matches!(mode, "incremental" | "initial" | "history") {
        return Err("--mode must be incremental, initial or history".into());
    }
    let days = flags
        .get("days")
        .map(|raw| {
            raw.parse::<i64>()
                .ok()
                .filter(|value| (1..=3650).contains(value))
                .ok_or_else(|| "--days must be between 1 and 3650".to_string())
        })
        .transpose()?;
    if mode != "history" && days.is_some() {
        return Err("--days only means something with --mode history".into());
    }
    let max_chunks = flags
        .get("max-chunks")
        .unwrap_or("24")
        .parse::<usize>()
        .ok()
        .filter(|value| (1..=720).contains(value))
        .ok_or_else(|| "--max-chunks must be between 1 and 720".to_string())?;
    if (flags.has("max-chunks") || flags.has("retry-failed"))
        && (!uses_monthly_backfill(mode, days) || flags.get("channel") == Some("official"))
    {
        return Err(
            "--max-chunks and --retry-failed require --mode history --days greater than 365".into(),
        );
    }
    Ok((mode, days, max_chunks))
}

fn uses_monthly_backfill(mode: &str, days: Option<i64>) -> bool {
    mode == "history" && days.unwrap_or(180) > 365
}

fn history_backfill_output(
    ledger: &zeppbridge_core::storage::coverage::CoverageLedger,
    cancelled: bool,
    replay: Option<&ReplayOutcome>,
) -> (u8, serde_json::Value, String) {
    let complete = ledger.complete && !cancelled;
    let human = format!("History backfill{}: {}/{} chunks complete. Rerun the same command to resume; use --retry-failed to retry exhausted failures. Archive mode or a sufficient retention period is required.", if cancelled { " paused" } else { "" }, ledger.completed_chunks, ledger.total_chunks);
    (
        if complete {
            EXIT_OK
        } else {
            EXIT_INCOMPLETE_SYNC
        },
        serde_json::json!({"ok":complete,"mode":"history","cancelled":cancelled,"backfill":ledger,"replay":replay.map(ReplayOutcome::to_json)}),
        human,
    )
}

#[cfg(test)]
mod history_tests {
    use super::*;

    #[test]
    fn official_reauthorization_does_not_hide_saved_advanced_rows() {
        let advanced = Ok(SyncReport {
            success: true,
            core_ok: true,
            streams: vec![],
            records_written: 11,
            message: None,
            cleanup_failed: false,
        });
        let official = Err(ZeppBridgeError::NeedsReauth("test".into()));
        let (code, report, human) =
            combined_sync_output(Some(&advanced), Some(&official), "incremental", None);
        assert_eq!(code, EXIT_NOT_CONFIGURED);
        assert_eq!(report["ok"], false);
        assert_eq!(report["needsReauth"], true);
        assert_eq!(report["channels"]["advanced"]["recordsWritten"], 11);
        assert_eq!(report["channels"]["official"]["errorKind"], "auth");
        assert!(human.contains("official.json"));
    }
    #[test]
    fn history_day_boundaries_select_supported_execution_path() {
        for (days, monthly) in [(365, false), (366, true), (730, true), (3650, true)] {
            let flags = Flags::parse(&[
                "--mode".into(),
                "history".into(),
                "--days".into(),
                days.to_string(),
            ])
            .unwrap();
            let (mode, parsed, max) = sync_options(&flags).unwrap();
            assert_eq!(parsed, Some(days));
            assert_eq!(max, 24);
            assert_eq!(uses_monthly_backfill(mode, parsed), monthly);
        }
    }
    #[test]
    fn malformed_history_options_fail_before_loading_credentials() {
        for values in [
            vec!["--days"],
            vec!["--mode"],
            vec!["--json=false"],
            vec!["--mode", "history", "--days", "3651"],
            vec!["--mode", "history", "--days", "365", "--retry-failed"],
            vec!["--mode", "history", "--days", "730", "--max-chunks", "0"],
        ] {
            let flags =
                Flags::parse(&values.iter().map(|v| v.to_string()).collect::<Vec<_>>()).unwrap();
            assert!(sync_options(&flags).is_err(), "{values:?}");
        }
    }
    #[test]
    fn paused_history_json_keeps_ledger_for_resume_and_returns_incomplete() {
        let ledger = zeppbridge_core::storage::coverage::CoverageLedger {
            requested_from: Some("2020-01-01".into()),
            requested_to: Some("2026-01-01".into()),
            streams: vec![],
            total_chunks: 72,
            completed_chunks: 24,
            complete: false,
            failed_chunks_detail: vec![],
            needs_manual_retry: false,
            months: vec![],
        };
        let (code, payload, human) = history_backfill_output(&ledger, true, None);
        assert_eq!(code, EXIT_INCOMPLETE_SYNC);
        assert_eq!(payload["cancelled"], true);
        assert_eq!(payload["ok"], false);
        assert_eq!(payload["backfill"], serde_json::to_value(&ledger).unwrap());
        assert!(human.contains("resume"));
    }
    #[test]
    fn archive_policy_covers_long_history_boundaries() {
        let mut prefs = zeppbridge_core::models::UserPrefs {
            demo_mode: false,
            ai_profile_note: String::new(),
            retention_days: 365,
            history_sync_days: 180,
            archive_enabled: false,
        };
        assert!(!prefs.backfill_would_be_cleaned_up(365));
        for days in [366, 730, 3650] {
            assert!(prefs.backfill_would_be_cleaned_up(days));
        }
        prefs.archive_enabled = true;
        for days in [365, 366, 730, 3650] {
            assert!(!prefs.backfill_would_be_cleaned_up(days));
        }
    }

    #[test]
    fn monthly_history_resume_survives_restart_and_skips_completed_chunks() {
        use zeppbridge_core::storage::coverage::ChunkStatus;
        let dir = std::env::temp_dir().join(format!(
            "zeppbridge-cli-history-{}-{}",
            std::process::id(),
            zeppbridge_core::unique_suffix()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("zepp.db");
        let today = chrono::NaiveDate::from_ymd_opt(2026, 10, 24).unwrap();
        for days in [366, 730, 3650] {
            let db = Database::open_migrated(&path).unwrap();
            db.reset_coverage_ledger().unwrap();
            let from = today - chrono::Duration::days(days);
            db.plan_backfill(from, today).unwrap();
            let batch = db.pending_backfill_chunks(2).unwrap();
            assert_eq!(batch.len(), 2);
            for chunk in &batch {
                db.record_backfill_chunk(
                    &chunk.stream,
                    &chunk.chunk_start,
                    ChunkStatus::EmptyFromCloud,
                    0,
                    None,
                    None,
                )
                .unwrap();
            }
            drop(db);
            let db = Database::open_migrated(&path).unwrap();
            db.plan_backfill(from, today).unwrap();
            let remaining = db.pending_backfill_chunks(720).unwrap();
            assert!(remaining.iter().all(|item| !batch
                .iter()
                .any(|done| item.stream == done.stream && item.chunk_start == done.chunk_start)));
            let ledger = db.coverage_ledger().unwrap();
            assert_eq!(ledger.completed_chunks, 2);
            let (code, payload, _) = history_backfill_output(&ledger, false, None);
            assert_eq!(code, EXIT_INCOMPLETE_SYNC);
            assert_eq!(payload["backfill"]["completed_chunks"], 2);
        }
        std::fs::remove_dir_all(dir).unwrap();
    }
}
