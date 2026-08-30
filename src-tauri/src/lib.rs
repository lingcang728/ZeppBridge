mod app_state;
mod commands;
mod ipc_types;
mod local_api;
mod updates;

// The desktop shell is an adapter over the shared core: models, storage,
// migrations, normalization, queries, export and write coordination all live in
// `zeppbridge-core` so the CLI, MCP server and local REST API answer from the
// same semantics instead of re-implementing them.
pub use zeppbridge_core::{
    auth, connectors, decoder, device_catalog, export_formats, fetcher, insight, models,
    normalizer, paths, sport_catalog, storage, sync,
};

use app_state::AppState;
use commands::{
    cancel_pending_restore, cancel_sync, cancel_web_login, cleanup_old_data, clear_auth,
    compact_raw_payloads, create_manual_backup, get_app_status, get_capability_overview,
    get_coverage_ledger, get_data_health, get_device_catalog_options, get_device_profile,
    get_device_profiles, get_diagnostic_report, get_export_json, get_health_overview,
    get_heart_rate_series, get_heart_rate_zones, get_login_status, get_metric_series,
    get_pending_restore, get_recent_sleep, get_recent_workouts, get_restore_preview,
    get_sleep_detail, get_storage_estimate, get_training_balance, get_training_load_series,
    get_unknown_workout_codes, get_user_prefs, get_weekly_report, get_workout_detail,
    get_workout_insight, get_workout_series, get_workout_type_options, import_from_har,
    list_backups, manual_auth, open_data_folder, prepare_ai_handoff, probe_data_capabilities,
    publish_ai_export, reprocess_local_data, reset_coverage_ledger, run_database_integrity_check,
    save_auth, save_csv_export, save_gpx_export, save_json_export, set_backup_pinned,
    set_device_model_override, set_heart_rate_zone_preference, set_user_prefs,
    set_workout_code_label, set_workout_type_override, stage_restore, start_history_backfill,
    start_history_sync, start_incremental_sync, start_initial_sync, start_web_login,
    submit_device_model_assignment, submit_diagnostic_report, verify_auth, verify_backup,
};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter, Manager};
use zeppbridge_core::models::RawPayloadCompaction;

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
            // 排队中的恢复要在这里执行：AppState 一旦建立，桌面命令、同步线程
            // 和本机 API 就各自持有连接，那时再去换文件必然打架。
            let restore_notice = zeppbridge_core::storage::backup::apply_pending_restore(&data_dir)
                .map(|outcome| outcome.message);
            let state = AppState::new(data_dir.clone())
                .map_err(|error| anyhow::anyhow!("无法初始化应用状态: {error}"))?;
            if let Some(notice) = restore_notice {
                state.push_startup_warning(notice);
            }
            // 本机 API 首次安装默认关闭；`restore` 只恢复用户明确保存过的启用
            // 状态。端口占用只让 API 进入错误态，不阻止桌面应用启动。
            let local_api = std::sync::Arc::new(
                zeppbridge_core::local_api::LocalApiController::new(data_dir.clone()),
            );
            if let Some(error) = local_api.restore().error {
                eprintln!("{error}");
            }
            app.manage(local_api::LocalApi(local_api.clone()));
            app.manage(state);

            // 解析器修订号变化后，后台一次性重放本地原始报文以纠正派生数据
            // （运动类型、睡眠阶段等）。独立连接 + 后台线程，不阻塞窗口创建。
            //
            // 重放之后顺带把存量原始报文压掉。这两件事都要拿写锁，串在同一个
            // 线程里，省得互相抢；也都不能挡住窗口创建。
            let compaction_handle = app.handle().clone();
            let compaction_data_dir = data_dir.clone();
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

                // 存量报文压缩：默认开着，装完新版本第一次启动时自己做完。
                // 原始报文是库里最占地方的东西（JSON 文本，压完只剩五分之一），
                // 让每个人手动去高级设置里点一下，等于绝大多数人永远不会压。
                //
                // 界面通过 `compaction_in_progress()` 显示「正在压缩」，压完
                // 自己消失；这期间同步会像遇到重放一样让路并自动重试。
                match db.pending_raw_payload_count() {
                    Ok(0) | Err(_) => {}
                    Ok(pending) => {
                        let _ = compaction_handle.emit("compaction://started", pending);
                        let _write_guard = storage::write_lock::acquire_with_timeout(
                            &compaction_data_dir,
                            storage::write_lock::WritePurpose::Cleanup,
                            std::time::Duration::from_secs(30),
                        );
                        match db.compact_raw_payloads() {
                            Ok(report) => {
                                eprintln!(
                                    "已压缩历史报文 {} 条，{} → {} 字节",
                                    report.compacted, report.bytes_before, report.bytes_after
                                );
                                let _ = compaction_handle.emit("compaction://finished", report);
                            }
                            Err(error) => {
                                eprintln!("历史报文压缩失败: {error}");
                                let _ = compaction_handle
                                    .emit("compaction://finished", RawPayloadCompaction::default());
                            }
                        }
                    }
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
            probe_data_capabilities,
            get_app_status,
            get_capability_overview,
            get_health_overview,
            get_heart_rate_series,
            get_training_load_series,
            get_metric_series,
            get_training_balance,
            get_heart_rate_zones,
            set_heart_rate_zone_preference,
            get_recent_sleep,
            get_recent_workouts,
            get_sleep_detail,
            get_workout_detail,
            get_workout_series,
            get_device_profile,
            get_device_profiles,
            get_diagnostic_report,
            submit_diagnostic_report,
            set_workout_type_override,
            get_workout_type_options,
            get_unknown_workout_codes,
            set_workout_code_label,
            get_device_catalog_options,
            set_device_model_override,
            submit_device_model_assignment,
            get_data_health,
            run_database_integrity_check,
            get_workout_insight,
            get_weekly_report,
            reprocess_local_data,
            get_export_json,
            save_json_export,
            save_csv_export,
            save_gpx_export,
            publish_ai_export,
            prepare_ai_handoff,
            set_user_prefs,
            get_user_prefs,
            get_storage_estimate,
            cleanup_old_data,
            compact_raw_payloads,
            open_data_folder,
            updates::is_portable_update,
            updates::launch_migrated_install,
            list_backups,
            create_manual_backup,
            verify_backup,
            set_backup_pinned,
            get_restore_preview,
            stage_restore,
            get_pending_restore,
            cancel_pending_restore,
            start_history_backfill,
            get_coverage_ledger,
            reset_coverage_ledger,
            local_api::get_local_api_status,
            local_api::set_local_api_enabled,
            local_api::reveal_local_api_token,
            local_api::rotate_local_api_token,
        ])
        .run(tauri::generate_context!())
        .unwrap_or_else(|error| eprintln!("Tauri application exited with an error: {error}"));
}
