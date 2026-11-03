//! Explicit, bounded detail retrieval independent of summary sync.
use super::*;
use zeppbridge_core::storage::detail_queue::DetailCoverage;

fn options(flags: &Flags) -> Result<(Option<bool>, usize), String> {
    flags.reject_unknown(&["status", "channel", "max-items", "retry-failed", "json"])?;
    flags.reject_duplicates()?;
    flags.validate_values(&["channel", "max-items"])?;
    let channel = match flags.get("channel") {
        Some("advanced") => Some(false),
        Some("official") => Some(true),
        None if flags.has("status") => None,
        _ => return Err("Fetching requires --channel advanced or --channel official".into()),
    };
    if flags.has("status") && (flags.has("max-items") || flags.has("retry-failed")) {
        return Err("--status cannot be combined with --max-items or --retry-failed".into());
    }
    let limit = flags
        .get("max-items")
        .unwrap_or("20")
        .parse::<usize>()
        .ok()
        .filter(|n| (1..=40).contains(n))
        .ok_or_else(|| "--max-items must be between 1 and 40".to_string())?;
    Ok((channel, limit))
}

pub(super) fn cmd_details(args: &[String]) -> u8 {
    let json = scan_json_flag(args);
    let flags = match Flags::parse(args) {
        Ok(flags) => flags,
        Err(message) => return fail(json, EXIT_USAGE, "usage", &message),
    };
    let (channel, limit) = match options(&flags) {
        Ok(options) => options,
        Err(message) => return fail(json, EXIT_USAGE, "usage", &message),
    };
    if flags.has("status") {
        let db = match open_read_only() {
            Ok(db) => db,
            Err((code, message)) => return fail(json, code, error_kind_for(code), &message),
        };
        return match db.workout_detail_coverage_for_channel(channel) {
            Ok(coverage) => {
                emit_coverage(json, channel, &coverage, false, true);
                EXIT_OK
            }
            Err(error) => {
                let (code, kind) = exit_code_for(&error);
                fail(json, code, kind, &user_text(&error))
            }
        };
    }
    let (dir, db) = match open_writable() {
        Ok(value) => value,
        Err((code, message)) => return fail(json, code, error_kind_for(code), &message),
    };
    let cancel = Arc::new(AtomicBool::new(false));
    let runtime = match tokio::runtime::Runtime::new() {
        Ok(runtime) => runtime,
        Err(error) => {
            return fail(
                json,
                EXIT_FAILED,
                "failed",
                &format!("Could not start the async runtime: {error}"),
            )
        }
    };
    let retry = flags.has("retry-failed");
    let result = if channel == Some(true) {
        zeppbridge_core::sync::OfficialSync::new(
            &dir,
            db,
            cancel.clone(),
            zeppbridge_core::official::fetch::system_time_zone(),
        )
        .and_then(|manager| {
            runtime.block_on(async {
                let work = manager.history_detail_backfill(limit, retry);
                tokio::pin!(work);
                tokio::select! {
                    result = &mut work => result,
                    _ = tokio::signal::ctrl_c() => {
                        cancel.store(true, std::sync::atomic::Ordering::SeqCst);
                        work.await
                    }
                }
            })
        })
    } else {
        let auth = match AuthManager::new(dir.clone()).load_auth() {
            Ok(Some(auth)) => auth,
            Ok(None) => {
                return fail(
                    json,
                    EXIT_NOT_CONFIGURED,
                    "not_configured",
                    &not_connected_message(&dir),
                )
            }
            Err(error) => {
                let (code, kind) = exit_code_for(&error);
                return fail(json, code, kind, &user_text(&error));
            }
        };
        let account = auth.user_id.clone();
        ZeppConnector::with_cancel(auth, cancel.clone()).and_then(|connector| {
            let manager = SyncManager::new(DataFetcher::new(connector), db, cancel.clone())
                .with_data_dir(dir)
                .with_account(account);
            runtime.block_on(async {
                let work = manager.history_detail_backfill(limit, retry, |_| {});
                tokio::pin!(work);
                tokio::select! {
                    result = &mut work => result,
                    _ = tokio::signal::ctrl_c() => {
                        cancel.store(true, std::sync::atomic::Ordering::SeqCst);
                        work.await
                    }
                }
            })
        })
    };
    match result {
        Ok(coverage) => emit_coverage(
            json,
            channel,
            &coverage,
            cancel.load(std::sync::atomic::Ordering::SeqCst),
            false,
        ),
        Err(error) => {
            let (code, kind) = exit_code_for(&error);
            fail(json, code, kind, &user_text(&error))
        }
    }
}

fn emit_coverage(
    json: bool,
    channel: Option<bool>,
    coverage: &DetailCoverage,
    cancelled: bool,
    status_only: bool,
) -> u8 {
    let complete =
        coverage.pending == 0 && coverage.request_failed == 0 && coverage.parse_failed == 0;
    let ok = status_only || (complete && !cancelled);
    emit(json, serde_json::json!({"ok":ok,"channel":channel.map(|official| if official {"official"} else {"advanced"}),"complete":complete,"cancelled":cancelled,"coverage":coverage}),
        &format!("Workout details{}: {} persisted, {} cloud-empty, {} pending, {} request failures, {} parse failures, {} ready. Rerun the same command to resume.", if cancelled { " paused" } else { "" },coverage.persisted,coverage.empty_from_cloud,coverage.pending,coverage.request_failed,coverage.parse_failed,coverage.ready));
    if ok {
        EXIT_OK
    } else {
        EXIT_INCOMPLETE_SYNC
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn explicit_channel_and_bounded_batches_are_required() {
        for values in [
            vec![],
            vec!["--channel"],
            vec!["--channel", "both"],
            vec!["--channel", "advanced", "--max-items", "41"],
            vec!["--status", "--retry-failed"],
            vec!["--channel", "official", "--json=false"],
        ] {
            let flags =
                Flags::parse(&values.iter().map(|v| v.to_string()).collect::<Vec<_>>()).unwrap();
            assert!(options(&flags).is_err(), "{values:?}");
        }
        for (values, expected) in [
            (vec!["--status"], None),
            (vec!["--channel", "advanced"], Some(false)),
            (vec!["--channel", "official"], Some(true)),
        ] {
            let flags =
                Flags::parse(&values.iter().map(|v| v.to_string()).collect::<Vec<_>>()).unwrap();
            assert_eq!(options(&flags).unwrap(), (expected, 20));
        }
    }
}
