mod app_state;
mod auth;
mod commands;
mod connectors;
mod decoder;
mod device_catalog;
mod export_formats;
mod fetcher;
mod ipc_types;
mod local_api;
mod models;
mod normalizer;
mod paths;
mod storage;
mod sync;
mod updates;

use app_state::AppState;
use commands::{
    cancel_sync, cancel_web_login, cleanup_old_data, clear_auth, get_app_status,
    get_device_profile, get_device_profiles, get_export_json, get_health_overview,
    get_heart_rate_series, get_login_status, get_recent_sleep, get_recent_workouts,
    get_sleep_detail, get_storage_estimate, get_training_load_series, get_workout_detail,
    get_workout_series, import_from_har, manual_auth, open_data_folder, prepare_ai_handoff,
    publish_ai_export, reprocess_local_data, save_auth, save_csv_export, save_gpx_export,
    save_json_export, set_user_prefs, start_history_sync, start_incremental_sync,
    start_initial_sync, start_web_login, verify_auth,
};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter, Manager};

fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        // A second launch is the foreground process on Windows; briefly raise
        // z-order so the existing hidden-to-tray window can steal focus.
        let _ = window.set_always_on_top(true);
        let _ = window.set_focus();
        let _ = window.set_always_on_top(false);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "windows")]
    if let Ok(data_dir) = paths::resolve_data_dir() {
        let webview_dir = paths::webview_user_data_dir(&data_dir);
        let _ = std::fs::create_dir_all(&webview_dir);
        std::env::set_var("WEBVIEW2_USER_DATA_FOLDER", &webview_dir);
    }
    tauri::Builder::default()
        // Single-instance must be registered first so a second launch never
        // reaches tray setup and creates a duplicate icon.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_main_window(app);
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let data_dir = paths::resolve_data_dir()
                .map_err(|error| anyhow::anyhow!("无法创建安装目录旁的数据文件夹: {error}"))?;
            let webview_dir = paths::webview_user_data_dir(&data_dir);
            std::fs::create_dir_all(&webview_dir)
                .map_err(|error| anyhow::anyhow!("无法创建 WebView 数据目录: {error}"))?;
            std::env::set_var("WEBVIEW2_USER_DATA_FOLDER", &webview_dir);
            let state = AppState::new(data_dir.clone())
                .map_err(|error| anyhow::anyhow!("无法初始化应用状态: {error}"))?;
            let local_api_status = local_api::start(data_dir.clone());
            if let Some(error) = &local_api_status.error {
                eprintln!("{error}");
            }
            app.manage(local_api_status);
            app.manage(state);

            // 解析器修订号变化后，后台一次性重放本地原始报文以纠正派生数据
            // （运动类型、睡眠阶段等）。独立连接 + 后台线程，不阻塞窗口创建。
            std::thread::spawn(move || {
                let Ok(db) = storage::Database::open_without_migration(data_dir.join("zepp.db"))
                else {
                    return;
                };
                match db.reprocess_raw_records_if_needed() {
                    Ok(Some(counts)) => {
                        let total: i64 = counts.values().sum();
                        eprintln!("normalizer 升级，已重放本地原始报文（{total} 条派生记录）");
                    }
                    Ok(None) => {}
                    Err(error) => eprintln!("本地报文重放失败: {error}"),
                }
            });

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
                    "show" => show_main_window(app),
                    "sync" => {
                        let _ = app.emit("tray://sync", ());
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let tauri::tray::TrayIconEvent::Click {
                        button: tauri::tray::MouseButton::Left,
                        button_state: tauri::tray::MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_main_window(tray.app_handle());
                    }
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
            get_device_profiles,
            reprocess_local_data,
            get_export_json,
            save_json_export,
            save_csv_export,
            save_gpx_export,
            publish_ai_export,
            prepare_ai_handoff,
            set_user_prefs,
            get_storage_estimate,
            cleanup_old_data,
            open_data_folder,
            updates::is_portable_update,
            updates::launch_migrated_install,
            local_api::get_local_api_status,
        ])
        .run(tauri::generate_context!())
        .unwrap_or_else(|error| eprintln!("Tauri application exited with an error: {error}"));
}
