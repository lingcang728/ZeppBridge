//! Beta 实验室 ›「云端组件配套」（2026-11-11，默认关）。
//!
//! ZeppBridge Cloud 是用户**自己另外装**的组件（单独的仓库）：它调用安装包里的
//! `zeppbridge-cli` 只读导出，加密后传到用户自己的站点，给读不到本机文件的云端助手用。
//! 上传代码不在主程序里，这条边界不变——这里只做四件事：
//!
//! - 读它的状态目录（`%LOCALAPPDATA%\ZeppBridgeCloud`）：配置、上次运行结果、发过哪些只读密钥；
//! - 改它的 `config.json`（只改认识的字段，别的原样留着；不通过校验就一个字节都不写）；
//! - 启动它自己的脚本（`run.ps1` 上传一次、`setup.ps1` 管只读密钥）；
//! - 打开它的站点、日志和所在文件夹。
//!
//! 密钥一律不经过主程序：只读密钥由组件自己从凭据管理器读出、自己放进剪贴板；
//! 这里拿到的只有名字和创建时间。没打开实验室开关的人，界面上没有任何入口会调到这里。

use crate::ipc_error::AppError;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::ffi::OsString;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};
use zeppbridge_core::paths::write_file_atomically;

const STATE_DIR_NAME: &str = "ZeppBridgeCloud";
/// 组件登记的两个计划任务（见它的 `setup.ps1 task-commands`）。
const TASK_FOLLOW: &str = "ZeppBridge Cloud Follow";
const TASK_UPLOAD: &str = "ZeppBridge Cloud Upload";
/// 组件自己的默认值（`uploader/lib/config.mjs` 的 DEFAULTS）。
const DEFAULT_RETENTION_DAYS: u32 = 90;
const DEFAULT_SUMMARY_DAYS: u32 = 30;
const UPLOAD_TIMEOUT: Duration = Duration::from_secs(20 * 60);
const SETUP_TIMEOUT: Duration = Duration::from_secs(5 * 60);
const QUERY_TIMEOUT: Duration = Duration::from_secs(15);
/// 上次运行那一行日志最多带这么多字符给界面。
const LOG_LINE_MAX: usize = 400;

/// 同一时刻只起一个组件脚本：上传和发密钥都要动同一份状态。
static BUSY: AtomicBool = AtomicBool::new(false);

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct CloudConfig {
    /// 用户填的原样（域名或完整 https 网址）。
    pub site: String,
    pub bin_dir: Option<String>,
    pub data_dir: Option<String>,
    pub sync: bool,
    pub retention_days: u32,
    pub summary_days: u32,
    pub full_resolution_workouts: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct CloudLastRun {
    pub at: String,
    /// `upload`（整理 / 手动）或 `follow`（跟着同步）。
    pub mode: String,
    /// 组件给的稳定结果码：`ok` / `skipped_unchanged` / `skipped_busy` / `skipped_locked` /
    /// `config_error` / `version_mismatch` / `failed`。界面按它说话。
    pub result: String,
    pub exit_code: i64,
    /// 组件写的那一行日志原文（只有条数、体积和原因，没有数据和密钥）。只当诊断原文展示。
    pub log_line: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct CloudReader {
    pub label: String,
    pub created_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Default)]
pub struct CloudCompanionState {
    /// 组件只有 Windows 版（PowerShell + 凭据管理器）。
    pub supported: bool,
    /// 状态目录里有一份读得出来的 `config.json`。
    pub configured: bool,
    /// `config.json` 在、但不是合法的 JSON 对象。
    pub config_unreadable: bool,
    pub state_dir: Option<String>,
    /// 组件的 `uploader` 文件夹（里面有 run.ps1 / setup.ps1 / upload.mjs）；找不到时界面请用户指一下。
    pub uploader_dir: Option<String>,
    pub config: Option<CloudConfig>,
    /// 按组件同一套规则算出的站点地址（`https://health.example.com`）。
    pub site_url: Option<String>,
    pub last_run: Option<CloudLastRun>,
    pub readers: Vec<CloudReader>,
    pub task_follow: bool,
    pub task_upload: bool,
    pub running: bool,
    /// 这份 ZeppBridge 自己的安装目录里有 zeppbridge-cli 时给出，界面拿它当 binDir 的默认值。
    pub default_bin_dir: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CloudConfigInput {
    pub site: String,
    pub bin_dir: Option<String>,
    pub data_dir: Option<String>,
    pub sync: bool,
    pub retention_days: u32,
    pub summary_days: u32,
    pub full_resolution_workouts: bool,
    pub uploader_dir: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct CloudSetupOutcome {
    pub state: CloudCompanionState,
    /// 只有 `task-commands` 有：两条登记计划任务的命令，界面放进剪贴板，由用户自己看过再执行。
    pub output: Option<String>,
}

fn unsupported() -> AppError {
    AppError::new("err.cloud.unsupported", "云端组件配套只在 Windows 上可用")
}

/// `%LOCALAPPDATA%\ZeppBridgeCloud`。别的平台没有这个变量，也没有这个组件。
fn state_dir() -> Option<PathBuf> {
    if !cfg!(windows) {
        return None;
    }
    std::env::var_os("LOCALAPPDATA")
        .filter(|value| !value.is_empty())
        .map(|value| PathBuf::from(value).join(STATE_DIR_NAME))
}

/* ------------------------------ 站点地址 ------------------------------ */

fn looks_like_ip(host: &str) -> bool {
    host.starts_with('[') || host.parse::<std::net::Ipv4Addr>().is_ok()
}

/// 和组件的 `uploader/lib/site.mjs` 同一套规则：只填域名补成 `https://health.<域名>`，
/// 完整的 https 网址照用；不收 http、账号密码、query、fragment 和裸 IP。返回不带尾斜杠的站点地址。
pub(crate) fn normalize_site(input: &str) -> Option<String> {
    let raw = input.trim();
    if raw.is_empty()
        || raw.chars().any(char::is_whitespace)
        || raw.contains('?')
        || raw.contains('#')
    {
        return None;
    }
    let url = if raw.contains("://") {
        tauri::Url::parse(raw).ok()?
    } else {
        if raw.contains(['/', '@', '\\']) {
            return None;
        }
        let mut host = raw.to_ascii_lowercase();
        if host.ends_with('.') {
            host.pop();
        }
        let name = host.split(':').next().unwrap_or_default();
        if looks_like_ip(name) || !name.contains('.') {
            return None;
        }
        if !name.starts_with("health.") {
            host = format!("health.{host}");
        }
        tauri::Url::parse(&format!("https://{host}")).ok()?
    };
    let host = url.host_str()?;
    if url.scheme() != "https"
        || !url.username().is_empty()
        || url.password().is_some()
        || looks_like_ip(host)
        || !host.contains('.')
    {
        return None;
    }
    let authority = match url.port() {
        Some(port) => format!("{host}:{port}"),
        None => host.to_string(),
    };
    let path = url.path().trim_end_matches('/');
    let path = path.strip_suffix("/v1").unwrap_or(path);
    Some(format!("https://{authority}{path}"))
}

/* ------------------------------ 读状态目录 ------------------------------ */

pub(crate) enum ConfigFile {
    Missing,
    Unreadable,
    Found(Map<String, Value>),
}

pub(crate) fn read_config_file(state_dir: &Path) -> ConfigFile {
    let Ok(text) = std::fs::read_to_string(state_dir.join("config.json")) else {
        return ConfigFile::Missing;
    };
    match serde_json::from_str::<Value>(text.trim_start_matches('\u{feff}')) {
        Ok(Value::Object(map)) => ConfigFile::Found(map),
        _ => ConfigFile::Unreadable,
    }
}

fn text_field(map: &Map<String, Value>, name: &str) -> Option<String> {
    map.get(name)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn days_field(map: &Map<String, Value>, name: &str, fallback: u32) -> u32 {
    map.get(name)
        .and_then(Value::as_u64)
        .and_then(|value| u32::try_from(value).ok())
        .filter(|value| (1..=365).contains(value))
        .unwrap_or(fallback)
}

fn config_view(map: &Map<String, Value>) -> CloudConfig {
    let retention_days = days_field(map, "retentionDays", DEFAULT_RETENTION_DAYS);
    CloudConfig {
        // 旧版字段 `endpoint` 组件也认。
        site: text_field(map, "site")
            .or_else(|| text_field(map, "endpoint"))
            .unwrap_or_default(),
        bin_dir: text_field(map, "binDir"),
        data_dir: text_field(map, "dataDir"),
        sync: map.get("sync").and_then(Value::as_bool).unwrap_or(false),
        retention_days,
        summary_days: days_field(map, "summaryDays", DEFAULT_SUMMARY_DAYS).min(retention_days),
        full_resolution_workouts: map
            .get("fullResolutionWorkouts")
            .and_then(Value::as_bool)
            .unwrap_or(false),
    }
}

fn read_last_run(state_dir: &Path) -> Option<CloudLastRun> {
    let text = std::fs::read_to_string(state_dir.join("last-run.json")).ok()?;
    let value: Value = serde_json::from_str(&text).ok()?;
    Some(CloudLastRun {
        at: value.get("at")?.as_str()?.to_string(),
        mode: value
            .get("mode")
            .and_then(Value::as_str)
            .unwrap_or("upload")
            .to_string(),
        result: value.get("result")?.as_str()?.to_string(),
        exit_code: value.get("exit_code").and_then(Value::as_i64).unwrap_or(0),
        log_line: value
            .get("message")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .chars()
            .take(LOG_LINE_MAX)
            .collect(),
    })
}

/// `readers.json` 只记名字、密钥哈希和创建时间；哈希界面用不上，不往外带。
fn read_readers(state_dir: &Path) -> Vec<CloudReader> {
    let Ok(text) = std::fs::read_to_string(state_dir.join("readers.json")) else {
        return Vec::new();
    };
    let Ok(Value::Array(items)) = serde_json::from_str::<Value>(&text) else {
        return Vec::new();
    };
    items
        .iter()
        .filter_map(|item| {
            Some(CloudReader {
                label: item.get("label")?.as_str()?.to_string(),
                created_at: item
                    .get("created_at")
                    .and_then(Value::as_str)
                    .map(str::to_string),
            })
        })
        .collect()
}

/* ------------------------------ 组件在哪 ------------------------------ */

pub(crate) fn is_uploader_dir(dir: &Path) -> bool {
    dir.is_absolute()
        && ["run.ps1", "setup.ps1", "upload.mjs"]
            .iter()
            .all(|name| dir.join(name).is_file())
}

/// 从一段文本里找出引号括着的 `…\<script>` 路径，返回它所在的文件夹。
/// 计划任务的 XML（`-File "…\run.ps1"`，引号可能写成 `&quot;`）和组件生成的
/// `open-dashboard.ps1`（`-File '…\setup.ps1'`）都是这个形状。
pub(crate) fn script_dir_in(text: &str, script: &str) -> Option<PathBuf> {
    let text = text.replace("&quot;", "\"");
    let end = text.find(&format!("\\{script}"))?;
    let start = text[..end].rfind(['"', '\''])? + 1;
    let dir = text[start..end].trim();
    (!dir.is_empty()).then(|| PathBuf::from(dir))
}

fn locate_uploader(
    state_dir: &Path,
    config: Option<&Map<String, Value>>,
    follow_task_xml: Option<&str>,
) -> Option<PathBuf> {
    let from_config = config
        .and_then(|map| text_field(map, "uploaderDir"))
        .map(PathBuf::from);
    let from_task = follow_task_xml.and_then(|xml| script_dir_in(xml, "run.ps1"));
    let from_launcher = std::fs::read_to_string(state_dir.join("open-dashboard.ps1"))
        .ok()
        .and_then(|text| script_dir_in(&text, "setup.ps1"));
    [from_config, from_task, from_launcher]
        .into_iter()
        .flatten()
        .find(|dir| is_uploader_dir(dir))
}

/* ------------------------------ 子进程 ------------------------------ */

struct Finished {
    code: Option<i32>,
    stdout: String,
}

enum RunError {
    Spawn,
    TimedOut,
}

/// 不弹窗地跑一个程序，到点没完就结束它。标准输出很短（计划任务的 XML、两条命令），另起线程收。
fn run_hidden(program: &str, args: &[OsString], timeout: Duration) -> Result<Finished, RunError> {
    let mut command = Command::new(program);
    command
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // CREATE_NO_WINDOW：别在用户眼前闪黑框、抢焦点。
        command.creation_flags(0x0800_0000);
    }
    let mut child = command.spawn().map_err(|_| RunError::Spawn)?;
    let reader = child.stdout.take().map(|mut pipe| {
        std::thread::spawn(move || {
            let mut bytes = Vec::new();
            let _ = pipe.read_to_end(&mut bytes);
            String::from_utf8_lossy(&bytes).into_owned()
        })
    });
    let deadline = Instant::now() + timeout;
    let code = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status.code(),
            Ok(None) if Instant::now() >= deadline => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(RunError::TimedOut);
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(120)),
            Err(_) => return Err(RunError::Spawn),
        }
    };
    let stdout = reader
        .and_then(|handle| handle.join().ok())
        .unwrap_or_default();
    Ok(Finished { code, stdout })
}

/// 用资源管理器打开一个文件夹。组件只有 Windows 版，别的平台走不到这里（`state_dir` 是 None）。
fn open_folder(path: &Path) -> std::io::Result<()> {
    if cfg!(windows) {
        Command::new("explorer").arg(path).spawn().map(|_| ())
    } else {
        Err(std::io::ErrorKind::Unsupported.into())
    }
}

/// 计划任务在不在；在的话带回它的 XML（里面有 run.ps1 的位置）。
fn query_task(name: &str) -> Option<String> {
    let args = ["/Query", "/TN", name, "/XML"].map(OsString::from);
    match run_hidden("schtasks", &args, QUERY_TIMEOUT) {
        Ok(Finished {
            code: Some(0),
            stdout,
        }) => Some(stdout),
        _ => None,
    }
}

fn run_script(script: &Path, args: &[OsString], timeout: Duration) -> Result<Finished, AppError> {
    let mut argv: Vec<OsString> = ["-NoLogo", "-NoProfile", "-NonInteractive", "-File"]
        .map(OsString::from)
        .to_vec();
    argv.push(script.as_os_str().to_os_string());
    argv.extend_from_slice(args);
    run_hidden("pwsh", &argv, timeout).map_err(|error| match error {
        RunError::Spawn => AppError::new(
            "err.cloud.pwsh_missing",
            "没找到 PowerShell 7（pwsh），云端组件需要它",
        ),
        RunError::TimedOut => AppError::new("err.cloud.timeout", "云端组件没有在时限内完成"),
    })
}

/* ------------------------------ 汇总 ------------------------------ */

fn default_bin_dir() -> Option<String> {
    let dir = std::env::current_exe().ok()?.parent()?.to_path_buf();
    dir.join(format!("zeppbridge-cli{}", std::env::consts::EXE_SUFFIX))
        .is_file()
        .then(|| dir.to_string_lossy().into_owned())
}

/// 只读文件、不起进程的那一半（测试直接测它）。`follow_task_xml` 是计划任务查询的结果。
pub(crate) fn state_from_files(
    state_dir: &Path,
    follow_task_xml: Option<&str>,
) -> CloudCompanionState {
    let file = read_config_file(state_dir);
    let map = match &file {
        ConfigFile::Found(map) => Some(map),
        _ => None,
    };
    let config = map.map(config_view);
    CloudCompanionState {
        supported: true,
        configured: map.is_some(),
        config_unreadable: matches!(file, ConfigFile::Unreadable),
        state_dir: Some(state_dir.to_string_lossy().into_owned()),
        uploader_dir: locate_uploader(state_dir, map, follow_task_xml)
            .map(|dir| dir.to_string_lossy().into_owned()),
        site_url: config
            .as_ref()
            .and_then(|config| normalize_site(&config.site)),
        config,
        last_run: read_last_run(state_dir),
        readers: read_readers(state_dir),
        task_follow: follow_task_xml.is_some(),
        ..CloudCompanionState::default()
    }
}

fn collect_state() -> CloudCompanionState {
    let Some(dir) = state_dir() else {
        return CloudCompanionState::default();
    };
    let follow = query_task(TASK_FOLLOW);
    let mut state = state_from_files(&dir, follow.as_deref());
    state.task_upload = query_task(TASK_UPLOAD).is_some();
    state.running = BUSY.load(Ordering::SeqCst);
    state.default_bin_dir = default_bin_dir();
    state
}

async fn blocking<T: Send + 'static>(
    work: impl FnOnce() -> T + Send + 'static,
) -> Result<T, AppError> {
    tokio::task::spawn_blocking(work)
        .await
        .map_err(|_| AppError::new("err.cloud.run_failed", "云端组件运行失败，详情见它的日志"))
}

/// 占住「同一时刻只跑一个」的位置；放下时自动让出。
struct BusyGuard;
impl BusyGuard {
    fn take() -> Result<Self, AppError> {
        BUSY.compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .map(|_| Self)
            .map_err(|_| AppError::new("err.cloud.busy", "上一个云端操作还没结束"))
    }
}
impl Drop for BusyGuard {
    fn drop(&mut self) {
        BUSY.store(false, Ordering::SeqCst);
    }
}

fn require_uploader(state: &CloudCompanionState) -> Result<PathBuf, AppError> {
    state
        .uploader_dir
        .as_deref()
        .map(PathBuf::from)
        .ok_or_else(|| {
            AppError::new(
                "err.cloud.uploader_not_found",
                "没找到云端组件的上传脚本（run.ps1、setup.ps1、upload.mjs）",
            )
        })
}

fn state_dir_arg(state_dir: &Path) -> [OsString; 2] {
    [
        OsString::from("-StateDir"),
        state_dir.as_os_str().to_os_string(),
    ]
}

/* ------------------------------ 改配置 ------------------------------ */

fn clean_path(value: Option<&str>) -> Option<PathBuf> {
    value
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .map(PathBuf::from)
}

fn set_or_remove(map: &mut Map<String, Value>, name: &str, value: Option<&Path>) {
    match value {
        Some(path) => {
            map.insert(
                name.to_string(),
                Value::String(path.to_string_lossy().into_owned()),
            );
        }
        None => {
            map.remove(name);
        }
    }
}

/// 校验并写回 `config.json`。只改认识的字段，别的（组件以后加的、用户手写的）原样留着；
/// 任何一项不通过就整个不写。
pub(crate) fn save_config(state_dir: &Path, input: &CloudConfigInput) -> Result<(), AppError> {
    let mut map = match read_config_file(state_dir) {
        ConfigFile::Found(map) => map,
        ConfigFile::Missing => Map::new(),
        ConfigFile::Unreadable => {
            return Err(AppError::new(
                "err.cloud.config_unreadable",
                "云端组件的 config.json 读不出来，先修好或删掉它",
            ));
        }
    };
    let site = input.site.trim();
    if normalize_site(site).is_none() {
        return Err(AppError::new(
            "err.cloud.site_invalid",
            "站点地址不对：只填域名（如 example.com），或完整的 https:// 网址",
        ));
    }
    if !(1..=365).contains(&input.retention_days) || !(1..=365).contains(&input.summary_days) {
        return Err(AppError::new(
            "err.cloud.days_invalid",
            "保留天数和摘要天数要在 1–365 之间",
        ));
    }
    let bin_dir = clean_path(input.bin_dir.as_deref());
    if let Some(dir) = &bin_dir {
        let cli = dir.join(format!("zeppbridge-cli{}", std::env::consts::EXE_SUFFIX));
        if !dir.is_absolute() || !cli.is_file() {
            return Err(AppError::new(
                "err.cloud.bin_dir_invalid",
                "这个文件夹里没有 zeppbridge-cli",
            ));
        }
    }
    let data_dir = clean_path(input.data_dir.as_deref());
    if data_dir
        .as_ref()
        .is_some_and(|dir| !dir.is_absolute() || !dir.is_dir())
    {
        return Err(AppError::new(
            "err.cloud.data_dir_invalid",
            "数据目录要是一个已存在文件夹的绝对路径",
        ));
    }
    let uploader_dir = clean_path(input.uploader_dir.as_deref());
    if uploader_dir
        .as_ref()
        .is_some_and(|dir| !is_uploader_dir(dir))
    {
        return Err(AppError::new(
            "err.cloud.uploader_not_found",
            "没找到云端组件的上传脚本（run.ps1、setup.ps1、upload.mjs）",
        ));
    }

    map.insert("site".to_string(), Value::String(site.to_string()));
    map.remove("endpoint");
    set_or_remove(&mut map, "binDir", bin_dir.as_deref());
    set_or_remove(&mut map, "dataDir", data_dir.as_deref());
    // 没指过位置就不动原来记的：能自己从计划任务里认出来的安装不必多写一个字段。
    if uploader_dir.is_some() {
        set_or_remove(&mut map, "uploaderDir", uploader_dir.as_deref());
    }
    map.insert("sync".to_string(), Value::Bool(input.sync));
    map.insert(
        "retentionDays".to_string(),
        Value::from(input.retention_days),
    );
    map.insert(
        "summaryDays".to_string(),
        Value::from(input.summary_days.min(input.retention_days)),
    );
    map.insert(
        "fullResolutionWorkouts".to_string(),
        Value::Bool(input.full_resolution_workouts),
    );

    let failed = || AppError::new("err.cloud.config_write_failed", "没能写入云端组件的配置");
    let bytes = serde_json::to_vec_pretty(&Value::Object(map)).map_err(|_| failed())?;
    std::fs::create_dir_all(state_dir).map_err(|_| failed())?;
    write_file_atomically(&state_dir.join("config.json"), &bytes).map_err(|_| failed())
}

/// 只读密钥的名字会进命令行参数和凭据条目名：只收字母、数字、`-`、`_`，字母或数字开头。
pub(crate) fn valid_label(label: &str) -> bool {
    let mut chars = label.chars();
    chars
        .next()
        .is_some_and(|first| first.is_ascii_alphanumeric())
        && label.len() <= 32
        && chars.all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

/* ------------------------------ 命令 ------------------------------ */

#[tauri::command]
pub async fn cloud_companion_state() -> Result<CloudCompanionState, AppError> {
    blocking(collect_state).await
}

#[tauri::command]
pub async fn cloud_companion_save_config(
    input: CloudConfigInput,
) -> Result<CloudCompanionState, AppError> {
    let dir = state_dir().ok_or_else(unsupported)?;
    blocking(move || {
        save_config(&dir, &input)?;
        Ok(collect_state())
    })
    .await?
}

/// 立即上传一次：起组件自己的 `run.ps1 -NoSync`（只上传，不替桌面版从 Zepp 同步），等它跑完。
/// 结果以组件写的 `last-run.json` 为准；它没动过就是脚本在上传之前就失败了。
#[tauri::command]
pub async fn cloud_companion_upload() -> Result<CloudCompanionState, AppError> {
    let dir = state_dir().ok_or_else(unsupported)?;
    blocking(move || {
        let guard = BusyGuard::take()?;
        let before = collect_state();
        if !before.configured {
            return Err(AppError::new(
                "err.cloud.not_configured",
                "还没有云端组件的配置，先填站点并保存",
            ));
        }
        let uploader = require_uploader(&before)?;
        let mut args = vec![OsString::from("-NoSync")];
        args.extend(state_dir_arg(&dir));
        let finished = run_script(&uploader.join("run.ps1"), &args, UPLOAD_TIMEOUT)?;
        drop(guard);
        let after = collect_state();
        let stamp = |state: &CloudCompanionState| state.last_run.as_ref().map(|run| run.at.clone());
        if stamp(&after) == stamp(&before) {
            return Err(
                AppError::new("err.cloud.run_failed", "云端组件运行失败，详情见它的日志")
                    .with_params(serde_json::json!({ "exit_code": finished.code })),
            );
        }
        Ok(after)
    })
    .await?
}

/// 组件 `setup.ps1` 里放给界面的那几条：发 / 复制 / 作废只读密钥、建租户、打印计划任务命令。
/// 密钥由组件自己放进剪贴板，这里不读它的输出（`task-commands` 除外：那是两条不含密钥的命令）。
#[tauri::command]
pub async fn cloud_companion_setup(
    command: String,
    label: Option<String>,
) -> Result<CloudSetupOutcome, AppError> {
    let dir = state_dir().ok_or_else(unsupported)?;
    let needs_label = matches!(
        command.as_str(),
        "copy-reader" | "add-reader" | "revoke-reader"
    );
    if !needs_label && !matches!(command.as_str(), "init" | "task-commands") {
        return Err(AppError::new(
            "err.cloud.run_failed",
            "云端组件运行失败，详情见它的日志",
        ));
    }
    let label = label.unwrap_or_default();
    if needs_label && !valid_label(&label) {
        return Err(AppError::new(
            "err.cloud.label_invalid",
            "名字只能用字母、数字、- 和 _，最多 32 个字符",
        ));
    }
    blocking(move || {
        let guard = BusyGuard::take()?;
        let uploader = require_uploader(&collect_state())?;
        let mut args = vec![OsString::from(&command)];
        if needs_label {
            args.push(OsString::from("-Label"));
            args.push(OsString::from(&label));
        }
        args.extend(state_dir_arg(&dir));
        let finished = run_script(&uploader.join("setup.ps1"), &args, SETUP_TIMEOUT)?;
        drop(guard);
        if finished.code != Some(0) {
            return Err(
                AppError::new("err.cloud.run_failed", "云端组件运行失败，详情见它的日志")
                    .with_params(serde_json::json!({ "exit_code": finished.code })),
            );
        }
        Ok(CloudSetupOutcome {
            state: collect_state(),
            output: (command == "task-commands").then(|| finished.stdout.trim().to_string()),
        })
    })
    .await?
}

/// 打开站点（有 browser 那把只读密钥时由组件带着它自动登录）、日志文件夹或组件所在文件夹。
#[tauri::command]
pub async fn cloud_companion_open(app: tauri::AppHandle, target: String) -> Result<(), AppError> {
    let dir = state_dir().ok_or_else(unsupported)?;
    blocking(move || {
        let state = collect_state();
        let failed = || AppError::new("err.cloud.open_failed", "没能打开");
        match target.as_str() {
            "site" => {
                let has_browser_key = state.readers.iter().any(|reader| reader.label == "browser");
                if let (true, Some(uploader)) = (has_browser_key, state.uploader_dir.as_deref()) {
                    let mut args = vec![OsString::from("open-dashboard")];
                    args.extend(state_dir_arg(&dir));
                    let script = Path::new(uploader).join("setup.ps1");
                    if matches!(
                        run_script(&script, &args, QUERY_TIMEOUT * 2),
                        Ok(Finished { code: Some(0), .. })
                    ) {
                        return Ok(());
                    }
                }
                let url = state.site_url.ok_or_else(failed)?;
                crate::external_open::open_url(&app, &url).map_err(|_| failed())
            }
            "logs" => {
                let logs = dir.join("logs");
                open_folder(if logs.is_dir() { &logs } else { &dir }).map_err(|_| failed())
            }
            "folder" => {
                let uploader = require_uploader(&state)?;
                open_folder(&uploader).map_err(|_| failed())
            }
            _ => Err(failed()),
        }
    })
    .await?
}

#[cfg(test)]
mod tests;
