use super::*;
use chrono::{NaiveDate, Utc};
use std::path::Path;
use std::sync::atomic::Ordering;
use zeppbridge_core::models::UserPrefs;
use zeppbridge_core::official::{fetch::system_time_zone, OfficialStore};
use zeppbridge_core::storage::OfficialSyncAttempt;
use zeppbridge_core::sync::{OfficialMode, OfficialSync, StreamStatus};

pub(super) const OFFICIAL_REAUTH: &str =
    "Official authorization is missing or no longer valid. Reauthorize in the desktop app and transfer official.json and the matching credentials.json.";

pub(super) fn official_selection(
    dir: &Path,
    channel: Option<&str>,
) -> Option<Result<(), ZeppBridgeError>> {
    match channel {
        Some("advanced") => None,
        Some("official") => Some(Ok(())),
        _ => {
            let store = OfficialStore::new(dir);
            if !store.supports_named_entries() {
                return None;
            }
            store.meta().map(|meta| meta.map(|_| ())).transpose()
        }
    }
}

fn open_official_sync(
    dir: &Path,
    cancel: Arc<AtomicBool>,
) -> Result<OfficialSync, ZeppBridgeError> {
    let db = Database::open_without_migration(dir.join("zepp.db"))?;
    let zone = db.device_time_zone()?.unwrap_or_else(system_time_zone);
    OfficialSync::new(dir, db, cancel, zone)
}

pub(super) async fn run_official(
    dir: &Path,
    days: i64,
    mode: OfficialMode,
    cancel: Arc<AtomicBool>,
) -> Result<SyncReport, ZeppBridgeError> {
    open_official_sync(dir, cancel)?
        .run(days, mode, &|_| {})
        .await
}

pub(super) fn official_status(dir: &Path, db: &Database) -> serde_json::Value {
    let state = OfficialStore::new(dir).authorization_state(Utc::now().timestamp());
    let attempt = db.headless_official_sync_attempt();
    let fetched_at = db.latest_official_sleep_fetch_at();
    serde_json::json!({
        "state": state.as_ref().copied().unwrap_or("credential_error"),
        "needsReauth": matches!(state, Ok("needs_reauth")),
        "credentialErrorCode": state.as_ref().err().map(|error| error.code()),
        "lastSync": attempt.ok().flatten(),
        "lastSleepFetchAt": fetched_at.ok().flatten(),
    })
}

pub(super) fn official_outcome(report: &SyncReport) -> &'static str {
    if !report.success {
        "failed"
    } else if report
        .streams
        .iter()
        .all(|stream| stream.status == StreamStatus::Unavailable)
    {
        "unavailable"
    } else if report.streams.iter().all(|stream| stream.raw_records == 0) {
        "empty"
    } else {
        "complete"
    }
}

pub(super) fn save_sync_attempt(
    dir: &Path,
    advanced: Option<&Result<SyncReport, ZeppBridgeError>>,
    official: Option<&Result<SyncReport, ZeppBridgeError>>,
    content_changed: bool,
) {
    let results = [advanced, official];
    if results.into_iter().flatten().all(|result| {
        matches!(result, Err(error) if error.is_busy() || matches!(error, ZeppBridgeError::AccountMismatch))
    }) {
        return;
    }
    let finished_at = Utc::now();
    let result = (|| -> Result<(), ZeppBridgeError> {
        let _lock =
            write_lock::acquire_with_timeout(dir, WritePurpose::Metadata, Duration::from_secs(5))
                .map_err(|error| ZeppBridgeError::Busy(error.to_string()))?;
        let db = Database::open_without_migration(dir.join("zepp.db"))?;
        if let Some(official) = official {
            let (outcome, error_code) = match official {
                Ok(report) => (official_outcome(report), None),
                Err(error) if error.needs_reauth() => ("needs_reauth", Some(error.code())),
                Err(error) if error.is_cancelled() => ("cancelled", Some(error.code())),
                Err(error) if error.is_busy() => ("busy", Some(error.code())),
                Err(error) => ("failed", Some(error.code())),
            };
            db.record_headless_official_sync(&OfficialSyncAttempt {
                finished_at,
                outcome: outcome.into(),
                error_code: error_code.map(str::to_string),
            })?;
        }
        let successful = || {
            results
                .into_iter()
                .flatten()
                .filter_map(|result| result.as_ref().ok())
                .flat_map(|report| &report.streams)
                .filter(|stream| stream.status == StreamStatus::Success)
        };
        let records = successful().map(|stream| stream.records_written).sum();
        let complete = results
            .into_iter()
            .flatten()
            .all(|result| matches!(result, Ok(report) if report.success));
        let had_success = successful().next().is_some();
        let outcome = match (complete, had_success) {
            (true, _) if records > 0 && content_changed => "updated",
            (true, _) => "no_new_data",
            (false, true) => "partial",
            (false, false) => "failed",
        };
        db.record_cloud_sync(&finished_at.to_rfc3339(), outcome, records)
    })();
    if let Err(error) = result {
        eprintln!("Could not record the sync result: {}", user_text(&error));
    }
}

pub(super) fn cmd_sleep_history(args: &[String]) -> u8 {
    let json = scan_json_flag(args);
    let (start, end) = match sleep_range(args) {
        Ok(range) => range,
        Err(message) => return fail(json, EXIT_USAGE, "usage", &message),
    };
    let dir = match data_dir() {
        Ok(dir) => dir,
        Err(message) => return fail(json, EXIT_FAILED, "failed", &message),
    };
    let cancel = Arc::new(AtomicBool::new(false));
    let runtime = match tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
    {
        Ok(runtime) => runtime,
        Err(error) => return fail(json, EXIT_FAILED, "failed", &error.to_string()),
    };
    let result = runtime.block_on(async {
        drop(Database::open_migrated(&dir.join("zepp.db"))?);
        let sync = open_official_sync(&dir, cancel.clone())?;
        let work = sync.sleep_history(start, end);
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
    match result {
        Ok(report) => {
            let ok = report.status == StreamStatus::Success;
            let payload = serde_json::json!({
                "ok": ok, "channel": "official", "from": start, "to": end,
                "status": report.status, "recordsWritten": report.records_written,
                "rawRecords": report.raw_records, "message": report.message,
            });
            let human = format!(
                "Official sleep {start} through {end}: {} records. {}",
                report.records_written,
                report
                    .message
                    .as_deref()
                    .unwrap_or(if report.raw_records == 0 {
                        "Zepp returned no sleep records for this range."
                    } else {
                        ""
                    }),
            );
            emit(json, payload, &human);
            if ok {
                EXIT_OK
            } else {
                EXIT_INCOMPLETE_SYNC
            }
        }
        Err(error) => {
            let (code, kind) = exit_code_for(&error);
            let message = if error.needs_reauth() {
                OFFICIAL_REAUTH.into()
            } else {
                user_text(&error)
            };
            fail(json, code, kind, &message)
        }
    }
}

fn sleep_range(args: &[String]) -> Result<(NaiveDate, NaiveDate), String> {
    let flags = Flags::parse(args)?;
    flags.reject_unknown(&["from", "to", "json"])?;
    flags.reject_duplicates()?;
    let date = |key| {
        flags
            .get(key)
            .and_then(|value| {
                let day = NaiveDate::parse_from_str(value, "%Y-%m-%d").ok()?;
                (day.format("%Y-%m-%d").to_string() == value && value.len() == 10).then_some(day)
            })
            .ok_or_else(|| format!("--{key} requires a date in YYYY-MM-DD format"))
    };
    let (start, end) = (date("from")?, date("to")?);
    if end < start || (end - start).num_days() >= UserPrefs::MAX_HISTORY_SYNC_DAYS {
        return Err(format!(
            "Choose an ordered range of at most {} days.",
            UserPrefs::MAX_HISTORY_SYNC_DAYS
        ));
    }
    Ok((start, end))
}
