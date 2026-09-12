mod app_state;
mod commands;
mod diagnostics;
mod ipc_error;
mod ipc_types;
mod local_api;
mod main_window;
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
    compact_raw_payloads, create_manual_backup, delete_life_event, get_app_status,
    get_capability_overview, get_coverage_ledger, get_daily_heart_rate_extremes, get_data_health,
    get_device_catalog_options, get_device_profile, get_device_profiles, get_diagnostic_report,
    get_export_json, get_health_overview, get_heart_rate_series, get_heart_rate_zones,
    get_login_status, get_metric_series, get_pending_restore, get_recent_sleep,
    get_recent_workouts, get_restore_preview, get_sleep_detail, get_sleep_page,
    get_storage_estimate, get_stress_series, get_training_balance, get_training_load_series,
    get_unknown_workout_codes, get_user_prefs, get_weekly_report, get_workout_detail,
    get_workout_insight, get_workout_page, get_workout_series, get_workout_type_options,
    import_from_har, list_backups, list_life_events, manual_auth, open_data_folder,
    prepare_ai_handoff, probe_data_capabilities, publish_ai_export, reprocess_local_data,
    reset_coverage_ledger, retry_failed_backfill_chunks, run_database_integrity_check, save_auth,
    save_csv_export, save_fit_export, save_gpx_export, save_json_export, save_life_event,
    set_backup_pinned, set_device_model_override, set_heart_rate_zone_preference, set_user_prefs,
    set_workout_code_label, set_workout_type_override, stage_restore, start_history_backfill,
    start_history_sync, start_incremental_sync, start_initial_sync, start_web_login,
    submit_device_model_assignment, submit_diagnostic_report, verify_auth, verify_backup,
};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter, Manager};
use zeppbridge_core::models::RawPayloadCompaction;

/// `tauri.conf.json` 里 `minWidth` / `minHeight` 的那两个数。
///
/// 算出来的初始尺寸不能低于它们：低于了窗口会小到点不着，而 Tauri 只在用户
/// 拖动时才强制最小尺寸，`set_size` 传什么就是什么。
const MIN_WINDOW_WIDTH: f64 = 520.0;
const MIN_WINDOW_HEIGHT: f64 = 560.0;

/// 主窗口的初始尺寸，按显示器工作区算。
///
/// 这段以前是内联在 `setup()` 里的三行算术，**没有任何下限**：
///
/// ```text
/// let work_w = (work.size.width as f64 / scale) - 24.0;
/// let width  = (work_w * 0.88).max(1280.0_f64.min(work_w));
/// ```
///
/// 零工作区会使旧算法算出负数，因此保留输入检查。但用户提供的日志没有
/// 记录到这一分支，不能把它当作该用户打不开窗口的已确认原因。
///
/// 返回 `None` 表示这台显示器的信息不可信，那就一个字都别改，让
/// `tauri.conf.json` 里的 1280x800 原样生效。
fn main_window_size(work_width: u32, work_height: u32, scale: f64) -> Option<(f64, f64)> {
    if work_width == 0 || work_height == 0 || !scale.is_finite() || scale <= 0.0 {
        return None;
    }
    let work_w = (f64::from(work_width) / scale) - 24.0;
    let work_h = (f64::from(work_height) / scale) - 32.0;
    if !work_w.is_finite() || !work_h.is_finite() || work_w <= 0.0 || work_h <= 0.0 {
        return None;
    }
    let width = (work_w * 0.88).max(1280.0_f64.min(work_w));
    let height = (work_h * 0.88).max(800.0_f64.min(work_h));
    Some((width.max(MIN_WINDOW_WIDTH), height.max(MIN_WINDOW_HEIGHT)))
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

/// 按前端的界面语言取托盘文案。西语单独一份，其余非中文一律英文。
fn tray_labels_for(locale: &str) -> TrayLabels {
    let locale = locale.trim().to_ascii_lowercase();
    if locale.starts_with("es") {
        return TrayLabels {
            show: "Abrir ZeppBridge",
            sync: "Sincronizar ahora",
            quit: "Salir",
        };
    }
    tray_labels(locale.starts_with("zh"))
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
        //
        // 这里曾经派生一个 `powershell -NoProfile -Command "(Get-Culture).Name"`
        // 进程。它在启动路径上，而 PowerShell 的冷启动在装了杀软或组策略受限
        // 的机器上要 0.5~2 秒——主界面就干等这么久，且这段等待没有任何界面
        // 反馈。`GetUserDefaultLocaleName` 是同一件事的原生写法，微秒级。
        if let Some(name) = windows_ui_locale() {
            return name.to_ascii_lowercase().starts_with("zh");
        }
    }
    false
}

/// 用户的界面语言，形如 `zh-CN` / `en-US`。取不到就返回 `None`。
#[cfg(windows)]
fn windows_ui_locale() -> Option<String> {
    use windows_sys::Win32::Globalization::GetUserDefaultLocaleName;

    // `LOCALE_NAME_MAX_LENGTH`（winnls.h，85 个 wchar，含结尾 NUL）。
    // windows-sys 没有导出这个常量，所以在这里写明出处而不是随手取个数。
    const LOCALE_NAME_MAX_LENGTH: usize = 85;

    let mut buffer = [0u16; LOCALE_NAME_MAX_LENGTH];
    // 返回值是写进去的字符数，**含**结尾的 NUL；0 表示失败。
    let written = unsafe { GetUserDefaultLocaleName(buffer.as_mut_ptr(), buffer.len() as i32) };
    if written <= 1 {
        return None;
    }
    Some(String::from_utf16_lossy(&buffer[..(written - 1) as usize]))
}

/// 前端确定界面语言后校正托盘文案。
#[tauri::command]
fn set_tray_locale(app: AppHandle, locale: String) -> std::result::Result<(), ipc_error::AppError> {
    let Some(items) = app.try_state::<TrayMenuItems>() else {
        return Ok(());
    };
    let labels = tray_labels_for(&locale);
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

    // 只有 AppImage 还是打不开。
    //
    // 关掉 DMABUF 之后 Flatpak 好了（issue #32，cchalk 2026-09-02 确认），
    // AppImage 没好。同一个 issue 里 TheSaneWriter 给了决定性的一句：**同一份
    // 源码在他自己机器上编出来的 AppImage 能跑**。那就不是代码，是 CI 打包进
    // 去的那批 webkit / GL / Wayland 库和他的宿主机对不上。
    //
    // 合成器那条路是这类不匹配最先崩的地方，所以在 AppImage 里再退一步，连
    // 加速合成一起关掉。这一步的代价是真实的（滚动和动画会变钝），所以用
    // `APPIMAGE` 这个变量当门——它由 AppImage 运行时自己设，只有从 AppImage
    // 启动才有。deb / rpm / Flatpak 三条渠道已经被用户确认能用，不该为一条坏
    // 掉的渠道跟着变慢。
    //
    // 同样留逃生口：用户设过就尊重他的值。
    //
    // 注意这里**没有**动 `GDK_BACKEND`。强制 x11 能绕开一部分 Wayland 问题，
    // 但会打死没装 XWayland 的纯 Wayland 系统——那是把一种打不开换成另一种。
    // 它作为手动逃生口写在 docs/guides/linux.md 里，由人自己决定。
    #[cfg(all(unix, not(target_os = "macos")))]
    if std::env::var_os("APPIMAGE").is_some()
        && std::env::var_os("WEBKIT_DISABLE_COMPOSITING_MODE").is_none()
    {
        std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
    }

    // WebView2 的用户数据目录必须在 `Builder` 之前定下来：环境变量是
    // WebView2 初始化时读的，`setup()` 里再设已经晚了。
    //
    // 只有目录**真的建出来了**才设这个变量。以前这里是
    // `let _ = std::fs::create_dir_all(...)` 之后无条件 `set_var`：受控文件夹
    // 访问、杀软的目录保护、OneDrive 占用都会让创建失败，而变量照设不误，
    // 于是 WebView2 拿到一个用不了的路径、初始化失败——窗口和托盘都在，
    // 里面一片空白。指向坏路径比不指向差：不设的话 WebView2 走系统默认目录，
    // 至少还能开。
    #[cfg(target_os = "windows")]
    {
        let resolved = paths::resolve_data_dir();
        // 日志要先装起来，否则下面这几条 `log` 全部落空——而它们正是
        // 「窗口一片空白」这一类问题唯一能拿到的证据。`init` 是幂等的。
        diagnostics::init(resolved.as_deref().ok());
        match resolved {
            Ok(data_dir) => {
                let webview_dir = paths::webview_user_data_dir(&data_dir);
                match std::fs::create_dir_all(&webview_dir) {
                    Ok(()) => std::env::set_var("WEBVIEW2_USER_DATA_FOLDER", &webview_dir),
                    Err(error) => diagnostics::log(&format!(
                        "WebView2 数据目录 {} 建不出来（{error}），改用系统默认目录",
                        webview_dir.display()
                    )),
                }
            }
            Err(error) => {
                diagnostics::log(&format!("数据目录解析失败（{error}），稍后由启动流程报错"));
            }
        }
    }
    diagnostics::install_panic_hook();
    diagnostics::log("Startup: building Tauri runtime");
    let app = tauri::Builder::default()
        .manage(main_window::MainWindowState::default())
        // Single-instance must be registered first so a second launch never
        // reaches tray setup and creates a duplicate icon.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            main_window::request_show(app, "second-instance");
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
        .on_window_event(main_window::on_window_event)
        .on_page_load(|webview, payload| {
            if webview.label() == "main" {
                // Do not log URLs: the login webview can contain OAuth credentials.
                diagnostics::log(&format!("Main webview page load: {:?}", payload.event()));
            }
        })
        .setup(|app| {
            diagnostics::log("Startup: entered application setup");
            // 这三步以前都是光秃的 `?`。任一步失败，`setup` 返回 Err，
            // 进程就没了——而 Windows 上既没有终端也没有日志，用户只能看到
            // 通知区里一个点不动的死图标。现在每一条都会写日志、弹对话框，
            // 把具体路径和系统错误摆给用户。见 `diagnostics.rs`。
            let data_dir = match paths::resolve_data_dir() {
                Ok(dir) => {
                    diagnostics::init(Some(&dir));
                    dir
                }
                Err(error) => {
                    diagnostics::init(None);
                    return Err(diagnostics::fatal_startup("无法使用数据文件夹", error).into());
                }
            };
            // 本机还有没有第二个库。有的话，用户看到的会是「我的数据不见了」，
            // 而真相是这次解析到了另一个目录（NSIS 装在 %LOCALAPPDATA%、MSI 装在
            // Program Files，两者的落点不同）。只记录，不搬动——见
            // `paths::other_libraries_on_this_machine` 的注释。
            for other in paths::other_libraries_on_this_machine(&data_dir) {
                diagnostics::log(&format!(
                    "注意：{} 里也有一个 zepp.db，本次用的是 {}。要固定用哪一个，请设 {}",
                    other.display(),
                    data_dir.display(),
                    paths::DATA_DIR_ENV
                ));
            }
            let webview_dir = paths::webview_user_data_dir(&data_dir);
            if let Err(error) = std::fs::create_dir_all(&webview_dir) {
                return Err(diagnostics::fatal_startup(
                    &format!("无法创建 WebView 数据目录 {}", webview_dir.display()),
                    error,
                )
                .into());
            }
            std::env::set_var("WEBVIEW2_USER_DATA_FOLDER", &webview_dir);
            // 排队中的恢复要在这里执行：AppState 一旦建立，桌面命令、同步线程
            // 和本机 API 就各自持有连接，那时再去换文件必然打架。
            let restore_notice = zeppbridge_core::storage::backup::apply_pending_restore(&data_dir)
                .map(|outcome| outcome.message);
            let state = match AppState::new(data_dir.clone()) {
                Ok(state) => state,
                Err(error) => {
                    return Err(diagnostics::fatal_startup(
                        &format!("无法打开本机数据库 {}", data_dir.join("zepp.db").display()),
                        error,
                    )
                    .into());
                }
            };
            if let Some(notice) = restore_notice {
                state.push_startup_warning(notice);
            }
            // 本机 API 首次安装默认关闭；`restore` 只恢复用户明确保存过的启用
            // 状态。端口占用只让 API 进入错误态，不阻止桌面应用启动。
            let local_api = std::sync::Arc::new(
                zeppbridge_core::local_api::LocalApiController::new(data_dir.clone()),
            );
            if let Some(error) = local_api.restore().error {
                diagnostics::log(&error);
            }
            app.manage(local_api::LocalApi(local_api.clone()));
            app.manage(state);
            diagnostics::log("Startup: database and application state ready");

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
                // 重放要拿写锁。这条路以前一把锁都没拿：CLI 或 MCP 正在同步
                // 时启动桌面应用，两个进程会同时往同一个库写派生数据，而单
                // 写者保障本来就是为了挡住这件事。拿不到就跳过——重放是幂等的，
                // 下次启动会再来一遍，不该为它把启动卡住或去和别人抢。
                match storage::write_lock::acquire_with_timeout(
                    &compaction_data_dir,
                    storage::write_lock::WritePurpose::Reprocess,
                    std::time::Duration::from_secs(30),
                ) {
                    Ok(_reprocess_guard) => match db.reprocess_raw_records_if_needed() {
                        Ok(Some(counts)) => {
                            let total: i64 = counts.values().sum();
                            diagnostics::log(&format!(
                                "normalizer 升级，已重放本地原始报文（{total} 条派生记录）"
                            ));
                        }
                        Ok(None) => {}
                        Err(error) => diagnostics::log(&format!("本地报文重放失败: {error}")),
                    },
                    Err(error) => {
                        diagnostics::log(&format!("跳过本次报文重放，没能拿到写锁: {error}"));
                    }
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
                        // `let _write_guard = acquire_with_timeout(...)` 是把
                        // 整个 `Result` 绑给了变量：30 秒等不到锁时返回的
                        // `Err` 同样是个值，于是压缩照跑不误，写锁形同虚设。
                        // 必须匹配出 `Ok` 才算真的拿到了。
                        let Ok(_write_guard) = storage::write_lock::acquire_with_timeout(
                            &compaction_data_dir,
                            storage::write_lock::WritePurpose::Compaction,
                            std::time::Duration::from_secs(30),
                        ) else {
                            diagnostics::log("跳过本次报文压缩，没能拿到写锁");
                            let _ = compaction_handle
                                .emit("compaction://finished", RawPayloadCompaction::default());
                            return;
                        };
                        match db.compact_raw_payloads() {
                            Ok(report) => {
                                diagnostics::log(&format!(
                                    "已压缩历史报文 {} 条，{} → {} 字节",
                                    report.compacted, report.bytes_before, report.bytes_after
                                ));
                                let _ = compaction_handle.emit("compaction://finished", report);
                            }
                            Err(error) => {
                                diagnostics::log(&format!("历史报文压缩失败: {error}"));
                                let _ = compaction_handle
                                    .emit("compaction://finished", RawPayloadCompaction::default());
                            }
                        }
                    }
                }
            });

            main_window::initialize(app.handle());

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
                    "show" => main_window::request_show(app, "tray-menu"),
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
                        main_window::request_show(tray.app_handle(), "tray-click");
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
                    app.state::<main_window::MainWindowState>()
                        .set_tray_present();
                    diagnostics::log("Startup: tray ready");
                }
                Ok(Err(error)) => {
                    diagnostics::log(&format!(
                        "托盘图标创建失败，程序继续运行（关闭窗口将直接退出）: {error}"
                    ));
                }
                Err(_) => {
                    diagnostics::log(
                        "托盘图标创建时崩溃，程序继续运行（关闭窗口将直接退出）。
                         Linux 上这通常是缺少 libayatana-appindicator3：
                         Debian/Ubuntu: sudo apt install libayatana-appindicator3-1
                         Fedora: sudo dnf install libayatana-appindicator3
                         openSUSE: sudo zypper install libayatana-appindicator3-1",
                    );
                }
            }
            app.state::<main_window::MainWindowState>().set_ready();
            diagnostics::log("Startup: application setup complete");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_life_events,
            save_life_event,
            delete_life_event,
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
        .build(tauri::generate_context!());
    match app {
        Ok(app) => app.run(|app, event| {
            if let tauri::RunEvent::Ready = event {
                diagnostics::log("Startup: event loop ready");
                main_window::request_show(app, "startup");
            }
        }),
        Err(error) => {
            // Builder/plugin failures otherwise disappear in Windows releases.
            // Configured-window failures inside run() are logged by the panic hook.
            let _ = diagnostics::fatal_startup("Tauri initialization failed", error);
        }
    }
}

#[cfg(all(test, windows))]
mod locale_tests {
    /// 原生取语言这条路必须真的能走通。
    ///
    /// 换掉 `powershell (Get-Culture).Name` 的意义在于不再派生进程，但只要
    /// 缓冲区长度或返回值语义写错，它就会安静地退回 `None`，界面语言判断跟着
    /// 一起错——而这不会让任何构建变红。所以在 CI 的 Windows runner 上跑一次。
    #[test]
    fn the_native_call_returns_a_locale_shaped_name() {
        let name = super::windows_ui_locale().expect("Windows 上必须能取到界面语言");
        assert!(
            name.len() >= 2 && name.chars().all(|c| c.is_ascii_alphanumeric() || c == '-'),
            "取回来的不像一个语言标记：{name:?}"
        );
        assert!(!name.contains('\0'), "结尾的 NUL 没有去掉：{name:?}");
    }
}

#[cfg(test)]
mod window_size_tests {
    use super::{main_window_size, MIN_WINDOW_HEIGHT, MIN_WINDOW_WIDTH};

    /// 一台正常的 1080p 显示器，尺寸落在工作区里面。
    #[test]
    fn a_normal_monitor_gets_a_window_that_fits_inside_it() {
        let (width, height) = main_window_size(1920, 1040, 1.0).expect("正常显示器要给出尺寸");
        assert!(width <= 1920.0 - 24.0, "宽度不能超出工作区：{width}");
        assert!(height <= 1040.0 - 32.0, "高度不能超出工作区：{height}");
        assert!(width >= MIN_WINDOW_WIDTH && height >= MIN_WINDOW_HEIGHT);
    }

    /// 这条是这次修复的全部理由。
    ///
    /// `current_monitor()` 给出 `0x0` 时，旧代码算出的宽度是 -21.1，
    /// `set_size` 收下一个负数——窗口在、托盘在、点开没有任何反应。
    #[test]
    fn a_zero_sized_work_area_falls_back_to_the_configured_size() {
        assert_eq!(main_window_size(0, 0, 1.0), None);
        assert_eq!(main_window_size(1920, 0, 1.0), None);
        assert_eq!(main_window_size(0, 1040, 1.0), None);
    }

    /// 坏掉的缩放系数同样不能变成一个负数或 NaN。
    #[test]
    fn a_broken_scale_factor_falls_back_to_the_configured_size() {
        assert_eq!(main_window_size(1920, 1040, 0.0), None);
        assert_eq!(main_window_size(1920, 1040, -1.0), None);
        assert_eq!(main_window_size(1920, 1040, f64::NAN), None);
    }

    /// 工作区小到比边距还窄时也不许出负数。
    #[test]
    fn a_work_area_smaller_than_the_margins_falls_back() {
        assert_eq!(main_window_size(20, 20, 1.0), None);
    }

    /// 小屏 / 高 DPI：算出来的值再小也不能低于 `tauri.conf.json` 的最小尺寸，
    /// 否则窗口小到点不着，和「打不开」没有区别。
    #[test]
    fn a_tiny_work_area_never_goes_below_the_configured_minimum() {
        let (width, height) = main_window_size(800, 600, 2.0).expect("这仍然是一台可用的显示器");
        assert!(width >= MIN_WINDOW_WIDTH, "宽度低于最小值：{width}");
        assert!(height >= MIN_WINDOW_HEIGHT, "高度低于最小值：{height}");
    }
}
