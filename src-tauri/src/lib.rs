mod app_state;
mod auth;
mod commands;
mod connectors;
mod decoder;
mod fetcher;
mod ipc_types;
mod models;
mod normalizer;
mod storage;
mod sync;

use app_state::AppState;
use commands::{
    cancel_sync, cancel_web_login, cleanup_old_data, clear_auth, get_app_status,
    get_device_profile, get_export_json, get_health_overview, get_heart_rate_series,
    get_login_status, get_recent_sleep, get_recent_workouts, get_sleep_detail,
    get_storage_estimate, get_training_load_series, get_workout_detail, get_workout_series,
    import_from_har, manual_auth, open_data_folder, publish_ai_export, reprocess_local_data,
    save_auth, save_json_export, set_user_prefs, start_history_sync, start_incremental_sync,
    start_initial_sync, start_web_login, verify_auth,
};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{Emitter, Manager};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let data_dir = app
                .path()
                .app_data_dir()
                .map_err(|error| anyhow::anyhow!("无法获取应用数据目录: {error}"))?;
            let state = AppState::new(data_dir)
                .map_err(|error| anyhow::anyhow!("无法初始化应用状态: {error}"))?;
            app.manage(state);

            if let Some(window) = app.get_webview_window("main") {
                if let Ok(Some(monitor)) = window.current_monitor() {
                    let work = monitor.work_area();
                    let scale = monitor.scale_factor();
                    let work_w = (work.size.width as f64 / scale) - 24.0;
                    let work_h = (work.size.height as f64 / scale) - 32.0;
                    let width = (work_w * 0.88).max(1280.0_f64.min(work_w));
                    let height = (work_h * 0.88).max(800.0_f64.min(work_h));
                    let _ = window.set_size(tauri::LogicalSize::new(width, height));
                }
                let hidden = window.clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = hidden.hide();
                        let _ = hidden.app_handle().emit("app://hidden-to-tray", ());
                    }
                });
            }

            let show = MenuItem::with_id(app, "show", "打开窗口", true, None::<&str>)?;
            let sync = MenuItem::with_id(app, "sync", "立即同步", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &sync, &quit])?;
            let mut tray = TrayIconBuilder::new()
                .menu(&menu)
                .tooltip("ZeppBridge")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "sync" => {
                        let _ = app.emit("tray://sync", ());
                    }
                    "quit" => app.exit(0),
                    _ => {}
                });
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray.build(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            save_auth,
            verify_auth,
            clear_auth,
            import_from_har,
            manual_auth,
            start_web_login,
            cancel_web_login,
            get_login_status,
            start_initial_sync,
            start_history_sync,
            start_incremental_sync,
            cancel_sync,
            get_app_status,
            get_health_overview,
            get_heart_rate_series,
            get_training_load_series,
            get_recent_sleep,
            get_recent_workouts,
            get_sleep_detail,
            get_workout_detail,
            get_workout_series,
            get_device_profile,
            reprocess_local_data,
            get_export_json,
            save_json_export,
            publish_ai_export,
            set_user_prefs,
            get_storage_estimate,
            cleanup_old_data,
            open_data_folder,
        ])
        .run(tauri::generate_context!())
        .unwrap_or_else(|error| eprintln!("Tauri application exited with an error: {error}"));
}
