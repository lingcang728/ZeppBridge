//! First-run decision gate for importing a GitHub library into the Store edition.

use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Condvar, Mutex};
use std::time::Duration;

#[derive(Clone)]
pub(crate) struct StoreImportGate(Arc<Inner>);

struct Inner {
    data_dir: PathBuf,
    required: bool,
    sources: Vec<PathBuf>,
    decision: Mutex<bool>,
    decided: Condvar,
}

#[derive(Debug, Clone, Serialize)]
pub(crate) struct StoreImportStatus {
    pub required: bool,
    pub sources: Vec<String>,
}

impl StoreImportGate {
    pub(crate) fn new(data_dir: PathBuf) -> Self {
        let required =
            cfg!(feature = "store") && zeppbridge_core::paths::store_import_required(&data_dir);
        let sources = if required {
            zeppbridge_core::paths::store_import_candidates(&data_dir)
        } else {
            Vec::new()
        };
        Self(Arc::new(Inner {
            data_dir,
            required,
            sources,
            decision: Mutex::new(!required),
            decided: Condvar::new(),
        }))
    }

    pub(crate) fn status(&self) -> StoreImportStatus {
        StoreImportStatus {
            required: self.0.required,
            sources: self
                .0
                .sources
                .iter()
                .map(|source| source.to_string_lossy().into_owned())
                .collect(),
        }
    }

    pub(crate) fn decide(&self, source: Option<&str>) -> Result<(), String> {
        let mut decision = self.0.decision.lock().unwrap_or_else(|p| p.into_inner());
        if *decision {
            return Err("the first-run data choice was already completed".into());
        }

        // A previous import attempt may have reached its commit marker before
        // Windows interrupted cleanup. Treat that recovered library as the
        // completed choice, rather than offering a second import over it.
        if !zeppbridge_core::paths::store_import_required(&self.0.data_dir) {
            *decision = true;
            self.0.decided.notify_all();
            return Ok(());
        }

        match source {
            Some(source) => {
                let source = Path::new(source);
                zeppbridge_core::paths::import_store_library(source, &self.0.data_dir)
                    .map_err(|error| error.to_string())?;
            }
            None => {
                zeppbridge_core::paths::mark_store_import_reviewed(&self.0.data_dir)
                    .map_err(|error| error.to_string())?;
            }
        }

        *decision = true;
        self.0.decided.notify_all();
        Ok(())
    }

    pub(crate) fn wait_for_decision(&self, should_cancel: impl Fn() -> bool) {
        if !self.0.required {
            return;
        }
        let mut decision = self.0.decision.lock().unwrap_or_else(|p| p.into_inner());
        while !*decision {
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
