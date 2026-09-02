mod app_state;
mod commands;
mod ipc_error;
mod ipc_types;
mod local_api;
mod updates;

// The desktop shell is an adapter over the shared core: models, storage,
// migrations, normalization, queries, export and write coordination all live in
// `zeppbridge-core` so the CLI, MCP server and local REST API answer from the
// same semantics instead of re-implementing them.
pub use zeppbridge_core::{
    auth, connectors, decoder, device_catalog, export_fit, export_formats, fetcher, insight,
    models, normalizer, paths, sport_catalog, storage, sync,
};

use app_state::AppState;
use commands::{
    cancel_pending_restore, cancel_sync, cancel_web_login, cleanup_old_data, clear_auth,
    compact_raw_payloads, create_manual_backup, get_app_status, get_capability_overview,
    get_coverage_ledger, get_daily_heart_rate_extremes, get_data_health,
    get_device_catalog_options, get_device_profile, get_device_profiles, get_diagnostic_report,
    get_export_json, get_health_overview, get_heart_rate_series, get_heart_rate_zones,
    get_login_status, get_metric_series, get_pending_restore, get_recent_sleep,
    get_recent_workouts, get_restore_preview, get_sleep_detail, get_sleep_page,
    get_storage_estimate, get_stress_series, get_training_balance, get_training_load_series,
    get_unknown_workout_codes, get_user_prefs, get_weekly_report, get_workout_detail,
    get_workout_insight, get_workout_page, get_workout_series, get_workout_type_options,
    import_from_har, list_backups, manual_auth, open_data_folder, prepare_ai_handoff,
    probe_data_capabilities, publish_ai_export, reprocess_local_data, reset_coverage_ledger,
    retry_failed_backfill_chunks, run_database_integrity_check, save_auth, save_csv_export,
    save_fit_export, save_gpx_export, save_json_export, set_backup_pinned,
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

/// 托盘菜单的三条文案。原生菜单没法走前端的 i18n，只能在这里备一份。
struct TrayLabels {
    show: &'static str,
    sync: &'static str,
    quit: &'static str,
}

fn tray_labels(chinese: bool) -> TrayLabels {
    if chinese {
        TrayLabels {
            show: "打开窗口",
            sync: "立即同步",
            quit: "退出",
        }
    } else {
        TrayLabels {
            show: "Open ZeppBridge",
            sync: "Sync now",
            quit: "Quit",
        }
    }
}

/// 托盘建好之后还要能改文案：用户在设置里换语言，托盘不该还留在旧语言上。
struct TrayMenuItems {
    show: MenuItem<tauri::Wry>,
    sync: MenuItem<tauri::Wry>,
    quit: MenuItem<tauri::Wry>,
}

/// 系统语言是不是中文。
///
/// 只在前端还没告诉我们语言之前用一次。判断标准和前端 `detectLocale` 一致：
/// 明确以 `zh` 开头才算中文，其余一律英文。
fn system_prefers_chinese() -> bool {
    for key in ["LC_ALL", "LC_MESSAGES", "LANG", "LANGUAGE"] {
        if let Some(value) = std::env::var_os(key) {
            let value = value.to_string_lossy().to_ascii_lowercase();
            if !value.is_empty() {
                return value.starts_with("zh");
            }
        }
    }
    #[cfg(windows)]
    {
        // Windows 不设这些环境变量，问系统要用户的界面语言。
        let output = std::process::Command::new("powershell")
            .args(["-NoProfile", "-Command", "(Get-Culture).Name"])
            .output();
        if let Ok(output) = output {
            let name = String::from_utf8_lossy(&output.stdout).to_ascii_lowercase();
            return name.trim().starts_with("zh");
        }
    }
    false
}

/// 前端确定界面语言后校正托盘文案。
#[tauri::command]
fn set_tray_locale(app: AppHandle, locale: String) -> std::result::Result<(), ipc_error::AppError> {
    let Some(items) = app.try_state::<TrayMenuItems>() else {
        return Ok(());
    };
    let labels = tray_labels(locale.trim().to_ascii_lowercase().starts_with("zh"));
    let _ = items.show.set_text(labels.show);
    let _ = items.sync.set_text(labels.sync);
    let _ = items.quit.set_text(labels.quit);
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Linux 上的白屏。
    //
    // WebKitGTK 2.42 起默认走 DMABUF 渲染器，而它在相当一批驱动与合成器的
    // 组合上会直接失败——窗口出来了，是白的，终端一个字都不打印。issue #32
    // 报的就是这个（openSUSE，AppImage 和 Flatpak 都白）：没有报错不是因为
    // 没出错，是因为这条失败路径本身就是静默的。
    //
    // 关掉它会退回较慢的渲染路径，代价是真实存在的；但「慢一点」和「整个应用
    // 是一块白板」不是一个量级的问题。留了逃生口：用户自己设过这个变量就尊重
    // 他的值，想开回去就 `WEBKIT_DISABLE_DMABUF_RENDERER=0`。
    #[cfg(all(unix, not(target_os = "macos")))]
    if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }

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
        // Main-window AI handoff links call the opener API explicitly.  Do
        // not inject its `_blank` click interceptor into the Zepp login
        // webview: OAuth must stay inside the cookie-polling login session.
        .plugin(
            tauri_plugin_opener::Builder::new()
                .open_js_links_on_click(false)
                .build(),
        )
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
                            storage::write_lock::WritePurpose::Compaction,
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

            // 托盘到底建起来没有。窗口的关闭行为要看它，所以先声明后赋值。
            let tray_present = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));

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
                let tray_alive = tray_present.clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        // 没有托盘就不能藏到托盘里：那样窗口关掉之后再也没有
                        // 入口把它叫回来，进程还活着，看起来就是「点了关闭，
                        // 应用没了但也没退出」。托盘建不起来时按正常关闭走。
                        if !tray_alive.load(std::sync::atomic::Ordering::Relaxed) {
                            return;
                        }
                        api.prevent_close();
                        let _ = hidden.hide();
                        let _ = hidden.app_handle().emit("app://hidden-to-tray", ());
                    }
                });
            }

            // 托盘菜单是原生的，界面那套 i18n 到不了这里，而它又是英文用户
            // 一定会右键点开的东西。托盘在前端加载之前就要建起来，所以先按
            // 系统语言给一份，前端确定语言后再用 `set_tray_locale` 校正。
            let labels = tray_labels(system_prefers_chinese());
            let show = MenuItem::with_id(app, "show", labels.show, true, None::<&str>)?;
            let sync = MenuItem::with_id(app, "sync", labels.sync, true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", labels.quit, true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &sync, &quit])?;
            app.manage(TrayMenuItems {
                show: show.clone(),
                sync: sync.clone(),
                quit: quit.clone(),
            });
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

            // 托盘建不起来不该让整个应用起不来。
            //
            // Linux 上的托盘图标由桌面环境提供：Tauri 走 libayatana-appindicator3，
            // 而 GNOME 的 Flatpak runtime 里没有这个库，一些发行版的桌面上也没装。
            // 那个 C 库找不到 .so 时是直接 `panic!` 的（见 issue #11 里那份
            // `Failed to load ayatana-appindicator3 or appindicator3 dynamic library`
            // 回溯），所以这里不只要接住 `Err`，还要接住 unwind——否则用户看到的
            // 是「装好了，一启动就崩」，而真正缺的只是一个装饰性的图标。
            let built = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| tray.build(app)));
            match built {
                Ok(Ok(_)) => {
                    tray_present.store(true, std::sync::atomic::Ordering::Relaxed);
                }
                Ok(Err(error)) => {
                    eprintln!("托盘图标创建失败，程序继续运行（关闭窗口将直接退出）: {error}");
                }
                Err(_) => {
                    eprintln!(
                        "托盘图标创建时崩溃，程序继续运行（关闭窗口将直接退出）。
                         Linux 上这通常是缺少 libayatana-appindicator3：
                         Debian/Ubuntu: sudo apt install libayatana-appindicator3-1
                         Fedora: sudo dnf install libayatana-appindicator3
                         openSUSE: sudo zypper install libayatana-appindicator3-1"
                    );
                }
            }
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
            get_stress_series,
            get_training_load_series,
            get_metric_series,
            get_training_balance,
            get_heart_rate_zones,
            set_heart_rate_zone_preference,
            get_recent_sleep,
            get_recent_workouts,
            get_sleep_page,
            get_workout_page,
            get_daily_heart_rate_extremes,
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
            save_fit_export,
            save_gpx_export,
            publish_ai_export,
            prepare_ai_handoff,
            set_user_prefs,
            get_user_prefs,
            get_storage_estimate,
            cleanup_old_data,
            compact_raw_payloads,
            open_data_folder,
            updates::self_update_supported,
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
            retry_failed_backfill_chunks,
            set_tray_locale,
            local_api::get_local_api_status,
            local_api::set_local_api_enabled,
            local_api::reveal_local_api_token,
            local_api::rotate_local_api_token,
        ])
        .run(tauri::generate_context!())
        .unwrap_or_else(|error| eprintln!("Tauri application exited with an error: {error}"));
}
