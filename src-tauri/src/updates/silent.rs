//! 静默更新（v3）：一打开就在后台查，有新版本就下载（updater 插件下载时按内置公钥验签），
//! 下好了只让左上角的标志亮一圈绿环；用户点「更新」才替换。
//!
//! - 状态只有一份，放在这里；界面开着时经 [`EVENT`] 推给前端（标志的进度环、设置页那一行），
//!   刚挂上的页面用 [`update_view`] 补一次。
//! - 替换前先拿同步租约和写锁：同步 / 补拉 / 重放在跑就等它们结束，拿到以后也不会有新的开始，
//!   进程退出时不会有写到一半的库。
//! - 安装版（NSIS / MSI、macOS 的 .app）交给插件安装（Windows 是 passive 模式的安装器）；
//!   便携版原地换文件，见 [`super::portable`]。
//!
//! 失败一律安静：标志保持原样，原因只在设置页那一行里说。

use super::portable;
use crate::app_state::AppState;
use crate::ipc_error::AppError;
use serde::Serialize;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_updater::{Update, UpdaterExt};
use zeppbridge_core::storage::write_lock::{self, WritePurpose};

/// 状态变化推给前端的事件名。
pub(crate) const EVENT: &str = "update://state";
/// `latest.json` 里便携版更新包的平台条目（CI 的 package-portable.ps1 写进去）。
const PORTABLE_TARGET: &str = "windows-x86_64-portable";
/// 只换查询地址、不换公钥：指到哪里，下载下来的包都要过内置公钥的签名核对。
/// 用来在本机对着一份自己起的 latest.json 走一遍整条链路。
const ENDPOINT_ENV: &str = "ZEPPBRIDGE_UPDATE_ENDPOINT";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum Phase {
    /// 这次启动还没查过。
    Idle,
    Checking,
    Downloading,
    /// 下好、验过签，等用户点「更新」。
    Ready,
    /// 用户点了「更新」，正在等同步结束或正在替换。
    Applying,
    UpToDate,
    Failed,
    /// 这个构建不自己更新（Linux 包管理器、x86_64 的 mac）。
    Unsupported,
}

#[derive(Debug, Clone, Serialize)]
pub(crate) struct UpdateView {
    pub phase: Phase,
    pub version: Option<String>,
    /// 更新说明原文（发版时标签的注释）。
    pub notes: Option<String>,
    pub date: Option<String>,
    pub downloaded: u64,
    pub total: Option<u64>,
    /// 点了「更新」以后在等同步 / 补拉结束。
    pub waiting_for_sync: bool,
    pub portable: bool,
    /// 失败的原因码（`err.update.*`），界面按码取文案。
    pub error_code: Option<String>,
}

impl Default for UpdateView {
    fn default() -> Self {
        Self {
            phase: Phase::Idle,
            version: None,
            notes: None,
            date: None,
            downloaded: 0,
            total: None,
            waiting_for_sync: false,
            portable: false,
            error_code: None,
        }
    }
}

#[derive(Default)]
struct Inner {
    view: UpdateView,
    staged: Option<(Update, Vec<u8>)>,
}

/// 这次运行的更新状态（`app.manage`）。
#[derive(Default)]
pub(crate) struct SilentUpdater {
    inner: Mutex<Inner>,
}

impl SilentUpdater {
    fn lock(&self) -> std::sync::MutexGuard<'_, Inner> {
        self.inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    fn view(&self) -> UpdateView {
        self.lock().view.clone()
    }
}

fn publish(app: &AppHandle, change: impl FnOnce(&mut Inner)) -> UpdateView {
    let updater = app.state::<SilentUpdater>();
    let view = {
        let mut inner = updater.lock();
        change(&mut inner);
        inner.view.clone()
    };
    let _ = app.emit(EVENT, &view);
    view
}

fn fail(app: &AppHandle, code: &str, detail: impl std::fmt::Display) {
    crate::diagnostics::log(&format!("静默更新：{code}（{detail}）"));
    publish(app, |inner| {
        inner.staged = None;
        inner.view.phase = Phase::Failed;
        inner.view.waiting_for_sync = false;
        inner.view.error_code = Some(code.to_string());
    });
}

fn is_portable() -> bool {
    super::is_portable_update().unwrap_or(false)
}

#[tauri::command]
pub(crate) fn update_view(updater: tauri::State<'_, SilentUpdater>) -> UpdateView {
    updater.view()
}

/// 开始一次后台检查（打开应用时、设置页手动「检查更新」时）。已经在查 / 在下 / 下好了 /
/// 在装就原样返回当前状态，不重复开。
#[tauri::command]
pub(crate) fn update_start(app: AppHandle) -> UpdateView {
    let supported = super::self_update_supported();
    let mut start = false;
    let view = publish(&app, |inner| {
        if matches!(
            inner.view.phase,
            Phase::Checking | Phase::Downloading | Phase::Ready | Phase::Applying
        ) {
            return;
        }
        inner.view = UpdateView {
            portable: is_portable(),
            ..UpdateView::default()
        };
        if supported {
            inner.view.phase = Phase::Checking;
            start = true;
        } else {
            inner.view.phase = Phase::Unsupported;
        }
    });
    if start {
        tauri::async_runtime::spawn(check_and_download(app));
    }
    view
}

async fn check_and_download(app: AppHandle) {
    let portable = is_portable();
    let mut builder = app.updater_builder().timeout(Duration::from_secs(60));
    if portable {
        builder = builder.target(PORTABLE_TARGET);
    }
    if let Some(endpoint) = std::env::var(ENDPOINT_ENV)
        .ok()
        .filter(|value| !value.trim().is_empty())
    {
        builder = match endpoint.trim().parse() {
            Ok(url) => match builder.endpoints(vec![url]) {
                Ok(builder) => builder,
                Err(error) => return fail(&app, "err.update.check_failed", error),
            },
            Err(error) => return fail(&app, "err.update.check_failed", error),
        };
    }
    let checked = match builder.build() {
        Ok(updater) => updater.check().await,
        Err(error) => return fail(&app, "err.update.check_failed", error),
    };
    let update = match checked {
        Ok(Some(update)) => update,
        Ok(None) => {
            publish(&app, |inner| inner.view.phase = Phase::UpToDate);
            return;
        }
        // 插件先找平台条目再比版本：远端 latest.json 里没有便携版条目时，哪怕它比我们旧
        // 也报这个错。从 3.0 起每次发版都带便携条目，所以没有它的只会是更早的发布——
        // 按「没有新版本」处理，不在设置页挂一句吓人的红字。
        Err(tauri_plugin_updater::Error::TargetNotFound(target)) => {
            crate::diagnostics::log(&format!("静默更新：远端没有 {target} 的包，视为没有新版本"));
            publish(&app, |inner| inner.view.phase = Phase::UpToDate);
            return;
        }
        Err(error) => return fail(&app, "err.update.check_failed", error),
    };

    let size = update
        .raw_json
        .pointer(&format!("/platforms/{}/size", update.target))
        .and_then(serde_json::Value::as_u64);
    publish(&app, |inner| {
        inner.view.phase = Phase::Downloading;
        inner.view.version = Some(update.version.clone());
        inner.view.notes = update.body.clone();
        inner.view.date = update.date.map(|date| date.to_string());
        inner.view.downloaded = 0;
        inner.view.total = size;
    });

    // 进度每多 1% 推一次，别每个网络块都推一遍。
    let mut downloaded = 0u64;
    let mut last_percent = 0u64;
    let progress_app = app.clone();
    let result = update
        .download(
            move |chunk, total| {
                downloaded += chunk as u64;
                let total = total.or(size);
                let percent = total.map_or(0, |total| downloaded * 100 / total.max(1));
                if percent != last_percent {
                    last_percent = percent;
                    publish(&progress_app, |inner| {
                        inner.view.downloaded = downloaded;
                        inner.view.total = total;
                    });
                }
            },
            || {},
        )
        .await;
    match result {
        Ok(bytes) => {
            crate::diagnostics::log(&format!(
                "静默更新：{} 已下载并验过签（{} 字节）",
                update.version,
                bytes.len()
            ));
            publish(&app, |inner| {
                inner.view.phase = Phase::Ready;
                inner.view.downloaded = bytes.len() as u64;
                inner.view.total = Some(bytes.len() as u64);
                inner.staged = Some((update, bytes));
            });
        }
        Err(error) => fail(&app, "err.update.download_failed", error),
    }
}

/// 等同步租约和写锁都空出来（同步、补拉、重放在跑就等），拿到后一直攥着直到进程退出。
async fn hold_the_library(
    app: &AppHandle,
    data_dir: std::path::PathBuf,
) -> Result<
    (
        write_lock::ExclusiveWriteGuard,
        write_lock::ExclusiveWriteGuard,
    ),
    AppError,
> {
    let mut announced = false;
    loop {
        let dir = data_dir.clone();
        let attempt = tokio::task::spawn_blocking(move || {
            let lease = write_lock::acquire_sync_lease(&dir, WritePurpose::Update, Duration::ZERO)?;
            let write = write_lock::try_acquire(&dir, WritePurpose::Update)?;
            Ok::<_, write_lock::WriteLockError>((lease, write))
        })
        .await
        .map_err(|_| AppError::new("err.update.apply_failed", "等同步结束时任务被中断"))?;
        match attempt {
            Ok(guards) => return Ok(guards),
            Err(write_lock::WriteLockError::Busy { .. }) => {
                if !announced {
                    announced = true;
                    publish(app, |inner| inner.view.waiting_for_sync = true);
                }
                tokio::time::sleep(Duration::from_secs(1)).await;
            }
            Err(error) => {
                return Err(AppError::new(
                    "err.update.apply_failed",
                    format!("拿不到数据目录的锁：{error}"),
                ))
            }
        }
    }
}

/// 用户点了「更新」：等同步结束、核对数据位置，再替换。成功时进程会退出（便携版和 Windows
/// 安装版）或重启（macOS），所以这个命令正常情况下不会返回。
#[tauri::command]
pub(crate) async fn update_apply(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<(), AppError> {
    let staged = {
        let updater = app.state::<SilentUpdater>();
        let mut inner = updater.lock();
        if inner.view.phase != Phase::Ready {
            return Err(AppError::new("err.update.not_ready", "新版本还没下载好"));
        }
        inner.view.phase = Phase::Applying;
        inner.staged.take()
    };
    let _ = app.emit(EVENT, app.state::<SilentUpdater>().view());
    let Some((update, bytes)) = staged else {
        fail(&app, "err.update.not_ready", "下载好的包不见了");
        return Err(AppError::new("err.update.not_ready", "新版本还没下载好"));
    };

    let result: Result<(), AppError> = async {
        let _guards = hold_the_library(&app, state.data_dir.clone()).await?;
        super::validate_data_location(&state.data_dir)?;
        crate::diagnostics::log(&format!("静默更新：开始替换为 {}", update.version));
        if is_portable() {
            let exe = std::env::current_exe()?;
            let staged = portable::stage(&exe, &bytes).map_err(|error| {
                AppError::new("err.update.package_invalid", format!("更新包不对：{error}"))
            })?;
            portable::swap(staged).map_err(|error| {
                AppError::new(
                    "err.update.swap_failed",
                    format!("替换程序文件失败，已恢复原样：{error}"),
                )
            })?;
            std::process::Command::new(&exe)
                .arg(portable::AFTER_UPDATE_ARG)
                .spawn()
                .map_err(|error| {
                    AppError::new(
                        "err.update.launch_failed",
                        format!("新版本已就位，但启动失败：{error}"),
                    )
                })?;
            app.exit(0);
            return Ok(());
        }
        update.install(&bytes).map_err(|error| {
            AppError::new("err.update.install_failed", format!("安装失败：{error}"))
        })?;
        // Windows 上 install 自己会退出进程；走到这里的是 macOS，换好了 .app 要重启。
        app.restart();
    }
    .await;
    if let Err(error) = &result {
        // 没换成：包已经用掉了，回到失败，下次打开重新下。
        fail(&app, &error.code, &error.message);
    }
    result
}
