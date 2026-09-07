//! Main-window restoration must not build a WebView inside a native event callback.
//! Tauri documents a Windows deadlock for that path. Keep callbacks short and
//! serialize recovery on a worker, including requests from a second process.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, Monitor, WebviewWindow, Window, WindowEvent};

use crate::{diagnostics, main_window_size};

#[path = "window_geometry.rs"]
mod geometry;
use geometry::Rect;

#[derive(Default)]
pub(crate) struct MainWindowState {
    ready: AtomicBool,
    tray_present: AtomicBool,
    opening: Arc<AtomicBool>,
}

impl MainWindowState {
    pub(crate) fn set_ready(&self) {
        self.ready.store(true, Ordering::Release);
    }

    pub(crate) fn set_tray_present(&self) {
        self.tray_present.store(true, Ordering::Release);
    }
}

struct OpenGuard(Arc<AtomicBool>);

impl OpenGuard {
    fn acquire(opening: &Arc<AtomicBool>) -> Option<Self> {
        opening
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .ok()
            .map(|_| Self(opening.clone()))
    }
}

impl Drop for OpenGuard {
    fn drop(&mut self) {
        self.0.store(false, Ordering::Release);
    }
}

fn checked<T>(operation: &str, result: tauri::Result<T>) -> Option<T> {
    match result {
        Ok(value) => Some(value),
        Err(error) => {
            diagnostics::log(&format!("Main window {operation} failed: {error}"));
            None
        }
    }
}

pub(crate) fn request_show(app: &AppHandle, source: &'static str) {
    diagnostics::log(&format!("Main window open requested: {source}"));
    let state = app.state::<MainWindowState>();
    // A second launch can arrive while the configured window is still being
    // constructed. Ready will show it; do not create another window meanwhile.
    if !state.ready.load(Ordering::Acquire) {
        diagnostics::log("Main window open deferred until startup is ready");
        return;
    }
    let Some(guard) = OpenGuard::acquire(&state.opening) else {
        diagnostics::log("Main window open already in progress");
        return;
    };
    let app = app.clone();
    // Do not use run_on_main_thread here: rebuilding there reintroduces the
    // WebView2 deadlock. Dropping the closure on spawn failure releases the gate.
    if let Err(error) = std::thread::Builder::new()
        .name("main-window-recovery".into())
        .spawn(move || {
            let _guard = guard;
            show(&app);
        })
    {
        diagnostics::log(&format!("Main window recovery worker failed: {error}"));
    }
}

pub(crate) fn initialize(app: &AppHandle) {
    diagnostics::log("Startup: looking up main window");
    match app.get_webview_window("main") {
        Some(window) => {
            diagnostics::log("Startup: main window found; querying monitor");
            if let Some(monitor) = preferred_monitor(&window) {
                fit_to_monitor(&window, &monitor);
            }
        }
        None => diagnostics::log("Startup: main window missing; recovery will run when ready"),
    }
}

fn usable_monitor(monitor: &Monitor) -> bool {
    let work = monitor.work_area();
    main_window_size(work.size.width, work.size.height, monitor.scale_factor()).is_some()
}

fn preferred_monitor(window: &WebviewWindow) -> Option<Monitor> {
    if let Some(Some(monitor)) = checked("current_monitor", window.current_monitor()) {
        if usable_monitor(&monitor) {
            return Some(monitor);
        }
    }
    diagnostics::log(
        "Main window current monitor unavailable; checking primary/available monitors",
    );
    if let Some(Some(monitor)) = checked("primary_monitor", window.primary_monitor()) {
        if usable_monitor(&monitor) {
            return Some(monitor);
        }
    }
    if let Some(monitors) = checked("available_monitors", window.available_monitors()) {
        if let Some(monitor) = monitors.into_iter().find(usable_monitor) {
            return Some(monitor);
        }
    }
    diagnostics::log("Main window has no usable monitor; retaining configured geometry");
    None
}

fn fit_to_monitor(window: &WebviewWindow, monitor: &Monitor) {
    let work = monitor.work_area();
    let scale = monitor.scale_factor();
    let Some((width, height)) = main_window_size(work.size.width, work.size.height, scale) else {
        return;
    };
    diagnostics::log(&format!(
        "Main window fitting: work={}x{} at {},{} scale={scale}; logical={width:.0}x{height:.0}",
        work.size.width, work.size.height, work.position.x, work.position.y
    ));
    if checked(
        "set_size",
        window.set_size(tauri::LogicalSize::new(width, height)),
    )
    .is_none()
    {
        return;
    }
    if let Some(size) = checked("outer_size", window.outer_size()) {
        // Use the selected monitor's physical work area, including negative
        // multi-monitor origins. center() can select the unavailable monitor.
        let (x, y) = Rect::new(
            work.position.x,
            work.position.y,
            work.size.width,
            work.size.height,
        )
        .centered_origin(size.width, size.height);
        let _ = checked(
            "set_position",
            window.set_position(tauri::PhysicalPosition::new(x, y)),
        );
    }
}

fn recover_geometry(window: &WebviewWindow) {
    let Some(monitors) = checked("available_monitors", window.available_monitors()) else {
        return;
    };
    let monitors: Vec<_> = monitors.into_iter().filter(usable_monitor).collect();
    if monitors.is_empty() {
        diagnostics::log("Main window geometry recovery skipped: no usable monitors");
        return;
    }
    let position = checked("outer_position", window.outer_position());
    let size = checked("outer_size", window.outer_size());
    if let (Some(position), Some(size)) = (position, size) {
        let window_rect = Rect::new(position.x, position.y, size.width, size.height);
        if monitors.iter().any(|monitor| {
            let work = monitor.work_area();
            window_rect.has_reachable_titlebar(Rect::new(
                work.position.x,
                work.position.y,
                work.size.width,
                work.size.height,
            ))
        }) {
            return;
        }
    }
    diagnostics::log("Main window geometry is unreachable; restoring onto a usable monitor");
    // Unmaximize only for recovery; retain maximized/normal geometry otherwise.
    let _ = checked("unmaximize", window.unmaximize());
    if let Some(monitor) = preferred_monitor(window) {
        fit_to_monitor(window, &monitor);
    }
}

fn show(app: &AppHandle) {
    let window = match app.get_webview_window("main") {
        Some(window) => window,
        None => {
            diagnostics::log("Main window missing; rebuilding on recovery worker");
            let Some(config) = app
                .config()
                .app
                .windows
                .iter()
                .find(|config| config.label == "main")
            else {
                diagnostics::log("Main window rebuild failed: configuration for main is missing");
                return;
            };
            let result = tauri::WebviewWindowBuilder::from_config(app, config)
                .and_then(|builder| builder.build());
            let Some(window) = checked("rebuild", result) else {
                return;
            };
            diagnostics::log("Main window rebuilt");
            window
        }
    };
    let _ = checked("unminimize", window.unminimize());
    recover_geometry(&window);
    let _ = checked("show", window.show());
    // Preserve an existing always-on-top preference when temporarily raising it.
    let was_on_top = checked("is_always_on_top", window.is_always_on_top());
    if was_on_top == Some(false) {
        let _ = checked("raise", window.set_always_on_top(true));
    }
    let _ = checked("set_focus", window.set_focus());
    if was_on_top == Some(false) {
        let _ = checked("restore z-order", window.set_always_on_top(false));
    }
    diagnostics::log(&format!(
        "Main window open completed: visible={:?}, minimized={:?}, position={:?}, size={:?}",
        window.is_visible(),
        window.is_minimized(),
        window.outer_position(),
        window.outer_size()
    ));
}

// A global handler also applies to reconstructed windows. A per-window handler
// installed only in setup leaves reconstructed windows without close-to-tray.
pub(crate) fn on_window_event(window: &Window, event: &WindowEvent) {
    if window.label() != "main" {
        return;
    }
    match event {
        WindowEvent::CloseRequested { api, .. } => {
            if window
                .app_handle()
                .state::<MainWindowState>()
                .tray_present
                .load(Ordering::Acquire)
            {
                api.prevent_close();
                if checked("hide", window.hide()).is_some() {
                    diagnostics::log("Main window hidden to tray");
                    let _ = window.emit("app://hidden-to-tray", ());
                }
            }
        }
        WindowEvent::Destroyed => diagnostics::log("Main window destroyed"),
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn concurrent_open_requests_are_coalesced_and_retries_are_allowed() {
        let opening = Arc::new(AtomicBool::new(false));
        let first = OpenGuard::acquire(&opening).unwrap();
        let another_thread = opening.clone();
        assert!(
            std::thread::spawn(move || OpenGuard::acquire(&another_thread).is_none())
                .join()
                .unwrap()
        );
        drop(first);
        assert!(OpenGuard::acquire(&opening).is_some());
    }

    #[test]
    fn failed_recovery_releases_the_gate() {
        let opening = Arc::new(AtomicBool::new(false));
        let shared = opening.clone();
        let result = std::panic::catch_unwind(move || {
            let _guard = OpenGuard::acquire(&shared).unwrap();
            panic!("simulated recovery failure");
        });
        assert!(result.is_err());
        assert!(OpenGuard::acquire(&opening).is_some());
    }
}
