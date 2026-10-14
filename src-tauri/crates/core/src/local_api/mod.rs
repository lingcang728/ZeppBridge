use crate::auth::{default_credential_backend_in, CredentialBackend};

use crate::models::WorkoutSeries;

use crate::storage::Database;

use serde::Serialize;

use serde_json::json;

use std::io::{self, BufRead, BufReader, Read, Write};

use std::net::{TcpListener, TcpStream};

use std::path::{Path, PathBuf};

use std::sync::atomic::{AtomicBool, Ordering};

use std::sync::{mpsc, Arc, Mutex, RwLock};

use std::time::Duration;

mod http;

pub use http::*;

pub const LOCAL_API_ADDRESS: &str = "127.0.0.1:43921";

pub const LOCAL_API_BASE_URL: &str = "http://127.0.0.1:43921";

/// 凭据存储里保存本机 API token 的账号名。与 Zepp 账号 token 共用 service，
/// 但账号名固定，所以切换 Zepp 账号不会波及本机 API 凭据。
pub const LOCAL_API_CREDENTIAL_ACCOUNT: &str = "local-api-token";

const ENABLED_STATE_FILE: &str = "local-api.json";

// 极简 HTTP server 的解析上限。没有这些上限，一个本机进程可以用一条永不结束的
// header 行把接收线程钉死，或者用几万条 header 撑爆内存。
const MAX_REQUEST_LINE_BYTES: usize = 8 * 1024;

const MAX_HEADER_LINE_BYTES: usize = 8 * 1024;

const MAX_HEADER_LINES: usize = 64;

const MAX_HEADER_TOTAL_BYTES: usize = 32 * 1024;

const MAX_WORKOUT_ID_BYTES: usize = 256;

const ACCEPT_POLL_INTERVAL: Duration = Duration::from_millis(50);

/// 同时处理连接的工作线程数。
///
/// 以前是「接一个、同步处理到写完响应、再接下一个」：读超时 2 秒、写超时
/// 10 秒，所以一个慢慢发 header 的本地客户端就能把另一个正常的 AI 客户端
/// 堵住十几秒。不需要为此换成 Tokio——这个服务只有三个只读端点，一个有上限
/// 的小线程池就够了。
///
/// 有上限是关键：thread-per-connection 没有上限时，本机上任何一个进程都能
/// 靠不断建连接把线程数顶爆。
const WORKER_THREADS: usize = 4;

/// accept 队列上限。无界 channel 时本机任意进程都能靠不断建连接把内存顶满。
const ACCEPT_QUEUE: usize = WORKER_THREADS * 2;

const TOKEN_PREFIX: &str = "zbk_";

const TOKEN_RANDOM_BYTES: usize = 32;

/// 设置页看到的实时状态。`running` 来自 controller 当前持有的 listener，
/// 不是启动时的快照。
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct LocalApiStatus {
    /// 用户保存的启用意图。
    pub enabled: bool,
    /// 端口此刻是否真的在监听。
    pub running: bool,
    pub base_url: String,
    pub address: String,
    pub workout_series_path: String,
    /// 是否已经生成过 token。关闭状态下也可能为真（token 会保留）。
    pub token_present: bool,
    /// 只影响 API 本身的可解释错误（端口占用、凭据存储不可用等）。
    pub error: Option<String>,
    /// `error` 那句话的稳定码。界面按它取自己语言的说法。
    #[serde(default)]
    pub error_code: Option<String>,
}

impl LocalApiStatus {
    fn new(
        enabled: bool,
        running: bool,
        token_present: bool,
        error: Option<String>,
        error_code: Option<String>,
    ) -> Self {
        Self {
            enabled,
            running,
            base_url: LOCAL_API_BASE_URL.to_string(),
            address: LOCAL_API_ADDRESS.to_string(),
            workout_series_path: "/workouts/{id}/series".to_string(),
            token_present,
            error,
            error_code,
        }
    }
}

/// 正在运行的 server。`token` 用 `RwLock` 而不是拷贝，所以重新生成 token 之后
/// 旧 token 立刻失效，不需要重启监听。
struct RunningServer {
    stop: Arc<AtomicBool>,
    token: Arc<RwLock<String>>,
    /// 实际绑定到的地址。生产环境永远等于 `LOCAL_API_ADDRESS`；测试用
    /// `127.0.0.1:0` 拿一个空闲端口，这样生命周期用例不依赖 43921 是否空闲。
    local_addr: std::net::SocketAddr,
    handle: Option<std::thread::JoinHandle<()>>,
}

impl RunningServer {
    fn is_alive(&self) -> bool {
        self.handle
            .as_ref()
            .is_some_and(|handle| !handle.is_finished())
    }

    /// 停止接受连接。accept 循环最多再睡一轮 poll 间隔就会放下 listener，
    /// 所以这里 join 它不会把 UI 线程卡住去等慢客户端的读超时。
    fn shutdown(mut self) {
        self.stop.store(true, Ordering::SeqCst);
        if let Some(handle) = self.handle.take() {
            let _ = handle.join();
        }
    }
}

struct ControllerInner {
    enabled: bool,
    server: Option<RunningServer>,
    error: Option<String>,
    error_code: Option<String>,
}

impl ControllerInner {
    fn set_fault(&mut self, code: &'static str, message: String) {
        self.error_code = Some(code.to_string());
        self.error = Some(message);
    }

    fn clear_fault(&mut self) {
        self.error = None;
        self.error_code = None;
    }
}

/// 本机 API 的唯一生命周期管理者。
///
/// listener、启用状态、停止信号、token、线程句柄和错误都在这里，设置页读到的
/// 永远是当前状态而不是启动快照。
pub struct LocalApiController {
    data_dir: PathBuf,
    /// 要绑定的地址。始终是 loopback：这个字段只为测试留出一个空闲端口，
    /// 不是给用户暴露到局域网的开关，也没有任何命令可以改写它。
    bind_address: String,
    credentials: Arc<dyn CredentialBackend>,
    inner: Mutex<ControllerInner>,
}

impl std::fmt::Debug for LocalApiController {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("LocalApiController")
            .field("address", &LOCAL_API_ADDRESS)
            .finish_non_exhaustive()
    }
}

impl LocalApiController {
    pub fn new(data_dir: PathBuf) -> Self {
        let credentials = default_credential_backend_in(&data_dir);
        Self::with_credential_backend(data_dir, credentials)
    }

    pub fn with_credential_backend(
        data_dir: PathBuf,
        credentials: Arc<dyn CredentialBackend>,
    ) -> Self {
        Self::with_bind_address(data_dir, LOCAL_API_ADDRESS.to_string(), credentials)
    }

    fn with_bind_address(
        data_dir: PathBuf,
        bind_address: String,
        credentials: Arc<dyn CredentialBackend>,
    ) -> Self {
        assert!(
            is_loopback_bind_address(&bind_address),
            "本机 API 只允许绑定 127.0.0.1，收到：{bind_address}"
        );
        Self {
            data_dir,
            bind_address,
            credentials,
            inner: Mutex::new(ControllerInner {
                enabled: false,
                server: None,
                error: None,
                error_code: None,
            }),
        }
    }

    /// 启动时恢复用户明确保存过的启用状态。没有状态文件就是「从没开过」，
    /// 于是保持关闭 —— 首次安装绝不监听端口。
    ///
    /// 端口占用或凭据存储不可用只让 API 进入可解释错误态，调用方不应据此
    /// 阻止桌面应用启动。
    pub fn restore(&self) -> LocalApiStatus {
        let enabled = read_enabled_flag(&self.data_dir);
        let mut inner = self.inner.lock().unwrap_or_else(|e| e.into_inner());
        inner.enabled = enabled;
        self.reap_dead_server(&mut inner);
        if enabled {
            self.spawn_locked(&mut inner);
        }
        self.status_locked(&inner)
    }

    pub fn status(&self) -> LocalApiStatus {
        let mut inner = self.inner.lock().unwrap_or_else(|e| e.into_inner());
        self.reap_dead_server(&mut inner);
        self.status_locked(&inner)
    }

    /// 立即生效：启用后不需要重启应用即可访问，关闭后端口立刻释放。
    pub fn set_enabled(&self, enabled: bool) -> LocalApiStatus {
        let mut inner = self.inner.lock().unwrap_or_else(|e| e.into_inner());
        inner.enabled = enabled;
        inner.clear_fault();
        self.reap_dead_server(&mut inner);
        if enabled {
            if inner.server.is_none() {
                self.spawn_locked(&mut inner);
            }
        } else if let Some(server) = inner.server.take() {
            server.shutdown();
        }
        // 存不下就说出来。这个开关的意义是「下次启动还开着」，存不下时它
        // 只是这一次进程里有效，而用户有权知道这件事。
        //
        // 但如果 `spawn_locked` 已经报过一个更具体的故障（比如端口被占），
        // 这里不能顺手把它覆盖掉：两个都失败时，用户需要看到的是「端口被
        // 占用」这个真正原因，而不是碰巧后发生的磁盘写入失败。
        if let Err(error) = write_enabled_flag(&self.data_dir, enabled) {
            if inner.error_code.is_none() {
                inner.set_fault("err.local_api.state_write_failed", error);
            }
        }
        self.status_locked(&inner)
    }

    /// 读取当前 token 供界面显式展示 / 复制。界面默认遮罩，只在用户点击后调用。
    pub fn reveal_token(&self) -> Result<String, String> {
        self.ensure_token()
    }

    /// 重新生成 token。旧 token 立即失效：正在运行的 server 共享同一把
    /// `RwLock`，写入后下一个请求就用新值比较。
    pub fn rotate_token(&self) -> Result<String, String> {
        let token = generate_token()?;
        self.credentials
            .set(LOCAL_API_CREDENTIAL_ACCOUNT, &token)
            .map_err(|error| format!("无法写入本机 API 凭据：{error}"))?;
        let inner = self.inner.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(server) = inner.server.as_ref() {
            let mut current = server.token.write().unwrap_or_else(|e| e.into_inner());
            *current = token.clone();
        }
        Ok(token)
    }

    /// 应用退出时释放端口。
    pub fn shutdown(&self) {
        let mut inner = self.inner.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(server) = inner.server.take() {
            server.shutdown();
        }
    }

    fn status_locked(&self, inner: &ControllerInner) -> LocalApiStatus {
        let token_present = matches!(
            self.credentials.get(LOCAL_API_CREDENTIAL_ACCOUNT),
            Ok(Some(_))
        );
        let mut status = LocalApiStatus::new(
            inner.enabled,
            inner.server.as_ref().is_some_and(RunningServer::is_alive),
            token_present,
            inner.error.clone(),
            inner.error_code.clone(),
        );
        if let Some(server) = inner.server.as_ref() {
            status.address = server.local_addr.to_string();
            status.base_url = format!("http://{}", server.local_addr);
        } else if self.bind_address != LOCAL_API_ADDRESS {
            status.address = self.bind_address.clone();
        }
        status
    }

    fn ensure_token(&self) -> Result<String, String> {
        match self.credentials.get(LOCAL_API_CREDENTIAL_ACCOUNT) {
            Ok(Some(token)) if !token.trim().is_empty() => Ok(token),
            Ok(_) => {
                let token = generate_token()?;
                self.credentials
                    .set(LOCAL_API_CREDENTIAL_ACCOUNT, &token)
                    .map_err(|error| format!("无法写入本机 API 凭据：{error}"))?;
                Ok(token)
            }
            Err(error) => Err(format!("无法读取本机 API 凭据：{error}")),
        }
    }

    fn spawn_locked(&self, inner: &mut ControllerInner) {
        let token = match self.ensure_token() {
            Ok(token) => token,
            Err(error) => {
                inner.set_fault("err.local_api.token_unavailable", error);
                return;
            }
        };
        let listener = match TcpListener::bind(self.bind_address.as_str()) {
            Ok(listener) => listener,
            Err(error) => {
                inner.set_fault(
                    bind_error_code(&error),
                    bind_error_message(&self.bind_address, &error),
                );
                return;
            }
        };
        let local_addr = match listener.local_addr() {
            Ok(address) => address,
            Err(error) => {
                inner.set_fault(
                    bind_error_code(&error),
                    bind_error_message(&self.bind_address, &error),
                );
                return;
            }
        };
        if !local_addr.ip().is_loopback() {
            inner.set_fault(
                "err.local_api.bind_failed",
                "本机 API 只允许绑定 loopback".to_string(),
            );
            return;
        }
        if let Err(error) = listener.set_nonblocking(true) {
            inner.set_fault(
                bind_error_code(&error),
                bind_error_message(&self.bind_address, &error),
            );
            return;
        }

        let stop = Arc::new(AtomicBool::new(false));
        let token = Arc::new(RwLock::new(token));
        let data_dir = self.data_dir.clone();
        let thread_stop = stop.clone();
        let thread_token = token.clone();
        match std::thread::Builder::new()
            .name("zeppbridge-local-api".to_string())
            .spawn(move || serve(listener, data_dir, thread_stop, thread_token))
        {
            Ok(handle) => {
                inner.clear_fault();
                inner.server = Some(RunningServer {
                    stop,
                    token,
                    local_addr,
                    handle: Some(handle),
                });
            }
            Err(error) => {
                inner.set_fault(
                    "err.local_api.thread_failed",
                    format!("无法启动本机 API 线程：{error}"),
                );
            }
        }
    }

    fn reap_dead_server(&self, inner: &mut ControllerInner) {
        if inner.server.as_ref().is_some_and(RunningServer::is_alive) {
            return;
        }
        if let Some(mut server) = inner.server.take() {
            if let Some(handle) = server.handle.take() {
                let _ = handle.join();
            }
            if inner.enabled && inner.error.is_none() {
                inner.set_fault(
                    "err.local_api.thread_failed",
                    "本机 API 监听线程已退出".to_string(),
                );
            }
        }
    }
}

fn is_loopback_bind_address(address: &str) -> bool {
    address.starts_with("127.0.0.1:")
}

fn bind_error_code(error: &io::Error) -> &'static str {
    if error.kind() == io::ErrorKind::AddrInUse {
        "err.local_api.port_in_use"
    } else {
        "err.local_api.bind_failed"
    }
}

fn bind_error_message(address: &str, error: &io::Error) -> String {
    let port = address.rsplit_once(':').map_or(address, |(_, port)| port);
    if error.kind() == io::ErrorKind::AddrInUse {
        format!("本机端口 {port} 已被其他程序占用：{error}")
    } else {
        format!("无法启动本机 API：{error}")
    }
}

fn state_file(data_dir: &Path) -> PathBuf {
    data_dir.join(ENABLED_STATE_FILE)
}

fn read_enabled_flag(data_dir: &Path) -> bool {
    let Ok(text) = std::fs::read_to_string(state_file(data_dir)) else {
        return false;
    };
    serde_json::from_str::<serde_json::Value>(&text)
        .ok()
        .and_then(|value| value.get("enabled").and_then(serde_json::Value::as_bool))
        .unwrap_or(false)
}

/// 原子地写下「本机 API 开没开」这个标志。
///
/// 以前是 `let _ = std::fs::write(...)`：磁盘只读或者写满时错误被整个吞掉，
/// 界面显示已开启，重启之后设置却没了，而中间没有任何一处告诉过用户。
///
/// 先写临时文件再 rename：直接写目标文件的话，进程在写到一半时被杀会留下
/// 一个半截的 JSON，下次 `read_enabled_flag` 解析失败、静默地当成「关」。
fn write_enabled_flag(data_dir: &Path, enabled: bool) -> Result<(), String> {
    let target = state_file(data_dir);
    let temporary = target.with_extension("json.tmp");
    let body = json!({ "enabled": enabled }).to_string();
    let describe = |error: std::io::Error| format!("无法保存本机 API 开关状态：{error}");
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent).map_err(describe)?;
    }
    std::fs::write(&temporary, body).map_err(describe)?;
    // Windows 上 rename 覆盖已存在的文件是允许的（std 用的是
    // MoveFileEx + REPLACE_EXISTING）。
    std::fs::rename(&temporary, &target).map_err(|error| {
        // 收拾掉临时文件，否则数据目录里会慢慢堆出一串 .tmp。
        let _ = std::fs::remove_file(&temporary);
        describe(error)
    })
}

fn generate_token() -> Result<String, String> {
    let mut bytes = [0u8; TOKEN_RANDOM_BYTES];
    getrandom::getrandom(&mut bytes)
        .map_err(|_| "无法从系统安全随机源生成本机 API token".to_string())?;
    Ok(format!("{TOKEN_PREFIX}{}", hex::encode(bytes)))
}

/// 常量时间比较，避免用响应时间反推 token 前缀。
fn tokens_match(expected: &str, provided: &str) -> bool {
    let expected = expected.as_bytes();
    let provided = provided.as_bytes();
    if expected.len() != provided.len() {
        return false;
    }
    let mut diff = 0u8;
    for (a, b) in expected.iter().zip(provided.iter()) {
        diff |= a ^ b;
    }
    diff == 0
}

#[cfg(test)]
mod tests;
