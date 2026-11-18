//! First-run decision gate for importing a GitHub library into the Store edition.

use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Condvar, Mutex};
use std::time::Duration;

#[derive(Clone)]
pub(crate) struct StoreImportGate(Arc<Inner>);

struct Inner {
    data_dir: PathBuf,
    sources: Vec<PathBuf>,
    decision: Mutex<Decision>,
    decided: Condvar,
}

enum Decision {
    Awaiting { failed: bool },
    Copying,
    Complete,
}

#[derive(Debug, Clone, Serialize)]
pub(crate) struct StoreImportStatus {
    pub required: bool,
    pub copying: bool,
    pub failed: bool,
    pub sources: Vec<String>,
}

impl StoreImportGate {
    pub(crate) fn new(data_dir: PathBuf) -> Self {
        let required =
            cfg!(feature = "store") && zeppbridge_core::paths::store_import_required(&data_dir);
        Self::with_requirement(data_dir, required)
    }

    fn with_requirement(data_dir: PathBuf, required: bool) -> Self {
        let sources = if required {
            zeppbridge_core::paths::store_import_candidates(&data_dir)
        } else {
            Vec::new()
        };
        Self(Arc::new(Inner {
            data_dir,
            sources,
            decision: Mutex::new(if required {
                Decision::Awaiting { failed: false }
            } else {
                Decision::Complete
            }),
            decided: Condvar::new(),
        }))
    }

    pub(crate) fn status(&self) -> StoreImportStatus {
        let decision = self.0.decision.lock().unwrap_or_else(|p| p.into_inner());
        StoreImportStatus {
            required: !matches!(*decision, Decision::Complete),
            copying: matches!(*decision, Decision::Copying),
            failed: matches!(*decision, Decision::Awaiting { failed: true }),
            sources: self
                .0
                .sources
                .iter()
                .map(|source| source.to_string_lossy().into_owned())
                .collect(),
        }
    }

    pub(crate) fn decide(&self, source: Option<&str>) -> Result<(), String> {
        {
            let mut decision = self.0.decision.lock().unwrap_or_else(|p| p.into_inner());
            match *decision {
                Decision::Complete => return Ok(()),
                Decision::Copying => return Err("a first-run import is already in progress".into()),
                Decision::Awaiting { .. } => *decision = Decision::Copying,
            }
        }

        // A previous import may have committed before Windows interrupted cleanup.
        let result = if !zeppbridge_core::paths::store_import_required(&self.0.data_dir) {
            Ok(())
        } else {
            match source {
                Some(source) => zeppbridge_core::paths::import_store_library(
                    Path::new(source),
                    &self.0.data_dir,
                )
                .map(drop),
                None => zeppbridge_core::paths::mark_store_import_reviewed(&self.0.data_dir),
            }
        }
        .map_err(|error| error.to_string());

        let mut decision = self.0.decision.lock().unwrap_or_else(|p| p.into_inner());
        *decision = match &result {
            Ok(()) => Decision::Complete,
            Err(_) => Decision::Awaiting { failed: true },
        };
        self.0.decided.notify_all();
        result
    }

    pub(crate) fn wait_for_decision(&self, should_cancel: impl Fn() -> bool) {
        let mut decision = self.0.decision.lock().unwrap_or_else(|p| p.into_inner());
        while !matches!(*decision, Decision::Complete) {
            if should_cancel() {
                return;
            }
            decision = match self
                .0
                .decided
                .wait_timeout(decision, Duration::from_millis(100))
            {
                Ok((decision, _)) => decision,
                Err(poisoned) => poisoned.into_inner().0,
            };
        }
    }
}

#[tauri::command]
pub(crate) fn store_import_status(gate: tauri::State<'_, StoreImportGate>) -> StoreImportStatus {
    gate.status()
}

#[tauri::command]
pub(crate) async fn store_import_decide(
    gate: tauri::State<'_, StoreImportGate>,
    source: Option<String>,
) -> Result<(), String> {
    let gate = gate.inner().clone();
    tokio::task::spawn_blocking(move || gate.decide(source.as_deref()))
        .await
        .map_err(|error| error.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use zeppbridge_core::storage::Database;

    #[test]
    fn first_run_status_survives_retry_and_webview_reload() {
        let root = std::env::temp_dir().join(format!(
            "zeppbridge-store-gate-{}",
            zeppbridge_core::unique_suffix()
        ));
        let source = root.join("source");
        std::fs::create_dir_all(&source).unwrap();
        drop(Database::open_migrated(&source.join("zepp.db")).unwrap());

        let destination = root.join("imported");
        let gate = StoreImportGate::with_requirement(destination.clone(), true);
        assert!(gate.status().required);
        assert!(gate
            .decide(Some(root.join("missing").to_str().unwrap()))
            .is_err());
        assert!(gate.status().failed);
        assert!(gate.status().required);
        assert!(!gate.status().copying);
        gate.decide(Some(source.to_str().unwrap())).unwrap();
        assert!(!gate.clone().status().required);
        gate.decide(None).unwrap();
        assert!(destination.join("zepp.db").exists());
        assert!(source.join("zepp.db").exists());

        let empty = root.join("empty");
        std::fs::create_dir(&empty).unwrap();
        let gate = StoreImportGate::with_requirement(empty.clone(), true);
        gate.decide(None).unwrap();
        assert!(!gate.clone().status().required);
        gate.decide(Some(source.to_str().unwrap())).unwrap();
        assert!(!empty.join("zepp.db").exists());
        assert!(!zeppbridge_core::paths::store_import_required(&empty));
        std::fs::remove_dir_all(root).unwrap();
    }
}
