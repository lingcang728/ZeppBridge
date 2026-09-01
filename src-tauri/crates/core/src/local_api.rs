//! 本机只读 REST API。
//!
//! 产品边界（不允许在适配层放宽）：
//!
//! * 只绑定 `127.0.0.1`，永远不监听局域网地址；
//! * 只读，只有 `GET`，没有任何写入或认证转发路由；
//! * 没有 CORS 头，响应一律 `Cache-Control: no-store`；
//! * 首次安装默认关闭，必须由用户在设置页显式启用；
//! * 所有路由都要求 `Authorization: Bearer <token>`，token 存平台凭据存储；
//! * 错误响应不包含数据库路径、文件系统路径或期望的 token。

use crate::auth::{default_credential_backend_in, CredentialBackend};
use crate::models::WorkoutSeries;
use crate::storage::Database;
use serde::Serialize;
use serde_json::json;
use std::io::{self, BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, RwLock};
use std::time::Duration;

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
}

impl LocalApiStatus {
    fn new(enabled: bool, running: bool, token_present: bool, error: Option<String>) -> Self {
        Self {
            enabled,
            running,
            base_url: LOCAL_API_BASE_URL.to_string(),
            address: LOCAL_API_ADDRESS.to_string(),
            workout_series_path: "/workouts/{id}/series".to_string(),
            token_present,
            error,
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
    /// 停止接受连接、回收后台线程，并保证返回时 43921 已经释放。
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
        debug_assert!(
            bind_address.starts_with("127.0.0.1:"),
            "本机 API 只允许绑定 loopback"
        );
        Self {
            data_dir,
            bind_address,
            credentials,
            inner: Mutex::new(ControllerInner {
                enabled: false,
                server: None,
                error: None,
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
        if enabled {
            self.spawn_locked(&mut inner);
        }
        self.status_locked(&inner)
    }

    pub fn status(&self) -> LocalApiStatus {
        let inner = self.inner.lock().unwrap_or_else(|e| e.into_inner());
        self.status_locked(&inner)
    }

    /// 立即生效：启用后不需要重启应用即可访问，关闭后端口立刻释放。
    pub fn set_enabled(&self, enabled: bool) -> LocalApiStatus {
        let mut inner = self.inner.lock().unwrap_or_else(|e| e.into_inner());
        inner.enabled = enabled;
        inner.error = None;
        if enabled {
            if inner.server.is_none() {
                self.spawn_locked(&mut inner);
            }
        } else if let Some(server) = inner.server.take() {
            server.shutdown();
        }
        write_enabled_flag(&self.data_dir, enabled);
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
            inner.server.is_some(),
            token_present,
            inner.error.clone(),
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
                inner.error = Some(error);
                return;
            }
        };
        let listener = match TcpListener::bind(self.bind_address.as_str()) {
            Ok(listener) => listener,
            Err(error) => {
                inner.error = Some(bind_error_message(&self.bind_address, &error));
                return;
            }
        };
        let local_addr = match listener.local_addr() {
            Ok(address) => address,
            Err(error) => {
                inner.error = Some(bind_error_message(&self.bind_address, &error));
                return;
            }
        };
        if let Err(error) = listener.set_nonblocking(true) {
            inner.error = Some(bind_error_message(&self.bind_address, &error));
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
                inner.error = None;
                inner.server = Some(RunningServer {
                    stop,
                    token,
                    local_addr,
                    handle: Some(handle),
                });
            }
            Err(error) => {
                inner.error = Some(format!("无法启动本机 API 线程：{error}"));
            }
        }
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

fn write_enabled_flag(data_dir: &Path, enabled: bool) {
    let body = json!({ "enabled": enabled }).to_string();
    let _ = std::fs::write(state_file(data_dir), body);
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

fn serve(
    listener: TcpListener,
    data_dir: PathBuf,
    stop: Arc<AtomicBool>,
    token: Arc<RwLock<String>>,
) {
    while !stop.load(Ordering::SeqCst) {
        match listener.accept() {
            Ok((mut stream, _)) => {
                if stream.set_nonblocking(false).is_err() {
                    continue;
                }
                let expected = token
                    .read()
                    .map(|value| value.clone())
                    .unwrap_or_else(|e| e.into_inner().clone());
                if let Err(error) = handle_connection(&mut stream, &data_dir, &expected) {
                    eprintln!("本机 API 请求处理失败: {error}");
                }
            }
            Err(error) if error.kind() == io::ErrorKind::WouldBlock => {
                std::thread::sleep(ACCEPT_POLL_INTERVAL);
            }
            Err(error) => {
                eprintln!("本机 API 连接失败: {error}");
                break;
            }
        }
    }
    // listener 在这里 drop，端口随之释放。
}

fn handle_connection(stream: &mut TcpStream, data_dir: &Path, token: &str) -> io::Result<()> {
    stream.set_read_timeout(Some(Duration::from_secs(2)))?;
    stream.set_write_timeout(Some(Duration::from_secs(10)))?;
    let request = match read_request(stream) {
        Ok(request) => request,
        Err(error) => {
            write_response(stream, HttpResponse::bad_request("invalid_request", &error))?;
            return Ok(());
        }
    };

    let response = route_request(&request, token, |workout_id| {
        load_workout_series(data_dir, workout_id)
    });
    write_response(stream, response)
}

/// 解析后的请求。只保留路由和鉴权需要的字段，其他 header 读完即弃。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParsedRequest {
    pub method: String,
    pub target: String,
    /// `None` = 没有 Authorization header。
    pub authorization: Option<String>,
}

fn read_request(stream: &mut TcpStream) -> Result<ParsedRequest, String> {
    let capped = (MAX_REQUEST_LINE_BYTES + MAX_HEADER_TOTAL_BYTES + 2) as u64;
    let mut reader = BufReader::new(stream).take(capped);
    parse_request(&mut reader)
}

/// 有上限的请求行 + header 解析。
///
/// 拒绝：超长请求行、超长单条 header、超过条数上限、header 总字节超限，以及
/// 重复且取值冲突的 `Authorization`（避免用两条 header 制造解析歧义）。
pub fn parse_request<R: BufRead>(reader: &mut R) -> Result<ParsedRequest, String> {
    let mut line = String::new();
    let bytes = read_capped_line(reader, &mut line, MAX_REQUEST_LINE_BYTES)
        .map_err(|_| "无法读取 HTTP 请求".to_string())?;
    if bytes == 0 || bytes > MAX_REQUEST_LINE_BYTES {
        return Err("HTTP 请求行为空或过长".to_string());
    }
    let mut parts = line.split_whitespace();
    let method = parts.next().ok_or_else(|| "缺少 HTTP 方法".to_string())?;
    let target = parts.next().ok_or_else(|| "缺少请求路径".to_string())?;
    let version = parts.next().ok_or_else(|| "缺少 HTTP 版本".to_string())?;
    if parts.next().is_some() || (version != "HTTP/1.1" && version != "HTTP/1.0") {
        return Err("HTTP 请求行格式无效".to_string());
    }
    let method = method.to_string();
    let target = target.to_string();

    let mut authorization: Option<String> = None;
    let mut header_lines = 0usize;
    let mut header_bytes = 0usize;
    loop {
        let mut header = String::new();
        let read = read_capped_line(reader, &mut header, MAX_HEADER_LINE_BYTES)
            .map_err(|_| "无法读取 HTTP 请求头".to_string())?;
        if read == 0 {
            return Err("HTTP 请求头没有正常结束".to_string());
        }
        if read > MAX_HEADER_LINE_BYTES {
            return Err("HTTP 请求头单行过长".to_string());
        }
        let trimmed = header.trim_end_matches(['\r', '\n']);
        if trimmed.is_empty() {
            break;
        }
        header_lines += 1;
        header_bytes += read;
        if header_lines > MAX_HEADER_LINES {
            return Err("HTTP 请求头条数过多".to_string());
        }
        if header_bytes > MAX_HEADER_TOTAL_BYTES {
            return Err("HTTP 请求头总长度过大".to_string());
        }
        let Some((name, value)) = trimmed.split_once(':') else {
            return Err("HTTP 请求头格式无效".to_string());
        };
        if name.eq_ignore_ascii_case("authorization") {
            let value = value.trim().to_string();
            match &authorization {
                Some(existing) if existing != &value => {
                    return Err("重复且取值冲突的 Authorization 请求头".to_string());
                }
                _ => authorization = Some(value),
            }
        }
    }

    Ok(ParsedRequest {
        method,
        target,
        authorization,
    })
}

/// 读一行，最多 `limit` 字节。超限时返回 `limit + 1` 让调用方判定为过长，
/// 不会把剩余字节继续读进内存。
fn read_capped_line<R: BufRead>(
    reader: &mut R,
    out: &mut String,
    limit: usize,
) -> io::Result<usize> {
    let mut total = 0usize;
    let mut byte = [0u8; 1];
    loop {
        let read = reader.read(&mut byte)?;
        if read == 0 {
            break;
        }
        total += 1;
        if total > limit {
            return Ok(limit + 1);
        }
        out.push(byte[0] as char);
        if byte[0] == b'\n' {
            break;
        }
    }
    Ok(total)
}

fn load_workout_series(data_dir: &Path, workout_id: &str) -> Result<Option<WorkoutSeries>, String> {
    let db_path = data_dir.join("zepp.db");
    if !db_path.exists() {
        // 还没有同步过任何数据。这是「没有这条记录」，不是服务故障。
        return Ok(None);
    }
    let db = Database::open_read_only(db_path)
        .map_err(|error| format!("打开本地数据库失败: {error}"))?;
    if db
        .get_workout_detail(workout_id)
        .map_err(|error| format!("查询运动记录失败: {error}"))?
        .is_none()
    {
        return Ok(None);
    }
    db.get_workout_series(workout_id)
        .map(Some)
        .map_err(|error| format!("读取运动序列失败: {error}"))
}

pub fn route_request<F>(request: &ParsedRequest, token: &str, lookup: F) -> HttpResponse
where
    F: FnOnce(&str) -> Result<Option<WorkoutSeries>, String>,
{
    // 鉴权先于方法与路由判断：未授权的请求不应该能通过 405/404 的差异
    // 探测本机 API 支持哪些路由。
    let Some(provided) = request.authorization.as_deref().and_then(bearer_value) else {
        return HttpResponse::unauthorized();
    };
    if !tokens_match(token, provided) {
        return HttpResponse::unauthorized();
    }

    if request.method != "GET" {
        return HttpResponse::method_not_allowed();
    }
    let target = request.target.as_str();
    let path = target.split_once('?').map_or(target, |(path, _)| path);
    if path == "/" {
        return HttpResponse::json(
            200,
            "OK",
            json!({
                "service": "ZeppBridge local API",
                "version": env!("CARGO_PKG_VERSION"),
                "status": "ok",
                "base_url": LOCAL_API_BASE_URL,
                "authentication": "Authorization: Bearer <token>",
                "endpoints": {
                    "health": "/health",
                    "workout_series": "/workouts/{id}/series"
                }
            }),
        );
    }
    if path == "/health" {
        return HttpResponse::json(
            200,
            "OK",
            json!({
                "status": "ok",
                "service": "ZeppBridge local API",
                "version": env!("CARGO_PKG_VERSION")
            }),
        );
    }

    let parts = path.split('/').collect::<Vec<_>>();
    if parts.len() != 4 || !parts[0].is_empty() || parts[1] != "workouts" || parts[3] != "series" {
        return HttpResponse::not_found("route_not_found", "未找到这个本机 API 路由");
    }
    let workout_id = match decode_workout_id(parts[2]) {
        Ok(value) => value,
        Err(message) => return HttpResponse::bad_request("invalid_workout_id", message),
    };

    match lookup(&workout_id) {
        Ok(Some(series)) => HttpResponse::json(200, "OK", series),
        Ok(None) => HttpResponse::not_found("workout_not_found", "本地数据库中没有这个 workout id"),
        Err(error) => {
            eprintln!("本机 API 读取运动序列失败: {error}");
            HttpResponse::json(
                500,
                "Internal Server Error",
                json!({
                    "error": {
                        "code": "local_data_unavailable",
                        "message": "暂时无法读取本地运动数据"
                    }
                }),
            )
        }
    }
}

fn bearer_value(header: &str) -> Option<&str> {
    let (scheme, value) = header.split_once(' ')?;
    if !scheme.eq_ignore_ascii_case("bearer") {
        return None;
    }
    let value = value.trim();
    if value.is_empty() {
        None
    } else {
        Some(value)
    }
}

fn decode_workout_id(raw: &str) -> Result<String, &'static str> {
    if raw.is_empty() || raw.len() > MAX_WORKOUT_ID_BYTES * 3 {
        return Err("workout id 不能为空或超过 256 字节");
    }
    let bytes = raw.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' {
            if index + 2 >= bytes.len() {
                return Err("workout id 含有无效的百分号编码");
            }
            let high = hex_value(bytes[index + 1]).ok_or("workout id 含有无效的百分号编码")?;
            let low = hex_value(bytes[index + 2]).ok_or("workout id 含有无效的百分号编码")?;
            decoded.push((high << 4) | low);
            index += 3;
        } else {
            decoded.push(bytes[index]);
            index += 1;
        }
    }
    if decoded.is_empty() || decoded.len() > MAX_WORKOUT_ID_BYTES {
        return Err("workout id 不能为空或超过 256 字节");
    }
    if decoded.iter().any(|byte| *byte == 0 || *byte == b'/') {
        return Err("workout id 不能包含路径分隔符或空字节");
    }
    String::from_utf8(decoded).map_err(|_| "workout id 不是有效的 UTF-8")
}

fn hex_value(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        b'A'..=b'F' => Some(byte - b'A' + 10),
        _ => None,
    }
}

pub struct HttpResponse {
    pub status: u16,
    reason: &'static str,
    pub body: Vec<u8>,
    allow_get: bool,
    challenge: bool,
}

impl HttpResponse {
    fn json<T: Serialize>(status: u16, reason: &'static str, value: T) -> Self {
        let body = serde_json::to_vec(&value).unwrap_or_else(|_| {
            r#"{"error":{"code":"serialization_failed","message":"无法生成 JSON 响应"}}"#
                .as_bytes()
                .to_vec()
        });
        Self {
            status,
            reason,
            body,
            allow_get: false,
            challenge: false,
        }
    }

    fn bad_request(code: &str, message: &str) -> Self {
        Self::json(
            400,
            "Bad Request",
            json!({ "error": { "code": code, "message": message } }),
        )
    }

    /// 无 token、错 token、旧 token 走同一条路径，响应里不透露期望值，
    /// 也不区分「没带」和「带错了」。
    fn unauthorized() -> Self {
        let mut response = Self::json(
            401,
            "Unauthorized",
            json!({
                "error": {
                    "code": "unauthorized",
                    "message": "本机 API 需要 Authorization: Bearer <token>；token 在 ZeppBridge 设置页生成"
                }
            }),
        );
        response.challenge = true;
        response
    }

    fn not_found(code: &str, message: &str) -> Self {
        Self::json(
            404,
            "Not Found",
            json!({ "error": { "code": code, "message": message } }),
        )
    }

    fn method_not_allowed() -> Self {
        let mut response = Self::json(
            405,
            "Method Not Allowed",
            json!({
                "error": {
                    "code": "method_not_allowed",
                    "message": "本机 API 仅支持 GET"
                }
            }),
        );
        response.allow_get = true;
        response
    }
}

pub fn write_response<W: Write>(stream: &mut W, response: HttpResponse) -> io::Result<()> {
    write!(
        stream,
        "HTTP/1.1 {} {}\r\nContent-Type: application/json; charset=utf-8\r\nContent-Length: {}\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nConnection: close\r\n",
        response.status,
        response.reason,
        response.body.len()
    )?;
    if response.allow_get {
        write!(stream, "Allow: GET\r\n")?;
    }
    if response.challenge {
        write!(stream, "WWW-Authenticate: Bearer\r\n")?;
    }
    write!(stream, "\r\n")?;
    stream.write_all(&response.body)?;
    stream.flush()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::WorkoutSeriesSummary;
    use std::collections::HashMap;
    use std::io::Cursor;
    use std::net::TcpStream as ClientStream;

    const TOKEN: &str = "zbk_0123456789abcdef";

    /// 生命周期用例绑定的是临时端口而不是 43921：开发机上常常正好有一份
    /// ZeppBridge 在跑，用真实端口测出来的失败是环境冲突，不是产品行为。
    fn ephemeral_address() -> String {
        let probe = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = probe.local_addr().unwrap().port();
        drop(probe);
        format!("127.0.0.1:{port}")
    }

    #[derive(Default)]
    struct MemoryCredentials {
        entries: Mutex<HashMap<String, String>>,
    }

    impl CredentialBackend for MemoryCredentials {
        fn set(&self, account: &str, token: &str) -> Result<(), String> {
            self.entries
                .lock()
                .unwrap()
                .insert(account.to_string(), token.to_string());
            Ok(())
        }

        fn get(&self, account: &str) -> Result<Option<String>, String> {
            Ok(self.entries.lock().unwrap().get(account).cloned())
        }

        fn delete(&self, account: &str) -> Result<(), String> {
            self.entries.lock().unwrap().remove(account);
            Ok(())
        }
    }

    fn request(method: &str, target: &str, authorization: Option<&str>) -> ParsedRequest {
        ParsedRequest {
            method: method.to_string(),
            target: target.to_string(),
            authorization: authorization.map(str::to_string),
        }
    }

    fn empty_series(id: &str) -> WorkoutSeries {
        WorkoutSeries {
            workout_id: id.to_string(),
            samples: vec![],
            route: vec![],
            pauses: vec![],
            splits: vec![],
            summary: WorkoutSeriesSummary::default(),
        }
    }

    fn controller(dir: &Path) -> LocalApiController {
        controller_at(dir, ephemeral_address())
    }

    fn controller_at(dir: &Path, address: String) -> LocalApiController {
        LocalApiController::with_bind_address(
            dir.to_path_buf(),
            address,
            Arc::new(MemoryCredentials::default()),
        )
    }

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("zeppbridge-local-api-{name}"));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn health_route_describes_running_service_without_cors() {
        let response = route_request(
            &request("GET", "/health", Some(&format!("Bearer {TOKEN}"))),
            TOKEN,
            |_| unreachable!(),
        );
        assert_eq!(response.status, 200);
        let body: serde_json::Value = serde_json::from_slice(&response.body).unwrap();
        assert_eq!(body["status"], "ok");

        let mut output = Vec::new();
        write_response(&mut output, response).unwrap();
        let text = String::from_utf8(output).unwrap();
        assert!(!text
            .to_ascii_lowercase()
            .contains("access-control-allow-origin"));
        assert!(text.contains("Cache-Control: no-store"));
    }

    #[test]
    fn workout_route_decodes_id_and_returns_clean_series_json() {
        let response = route_request(
            &request(
                "GET",
                "/workouts/run%2D123/series",
                Some(&format!("Bearer {TOKEN}")),
            ),
            TOKEN,
            |id| {
                assert_eq!(id, "run-123");
                Ok(Some(empty_series(id)))
            },
        );
        assert_eq!(response.status, 200);
        let body: serde_json::Value = serde_json::from_slice(&response.body).unwrap();
        assert_eq!(body["workout_id"], "run-123");
        assert_eq!(body["samples"], json!([]));
        assert_eq!(body["route"], json!([]));
    }

    #[test]
    fn unknown_workout_is_404_and_storage_errors_are_generic() {
        let auth = format!("Bearer {TOKEN}");
        let missing = route_request(
            &request("GET", "/workouts/404/series", Some(&auth)),
            TOKEN,
            |_| Ok(None),
        );
        assert_eq!(missing.status, 404);
        let failed = route_request(
            &request("GET", "/workouts/500/series", Some(&auth)),
            TOKEN,
            |_| Err("C:\\private\\zepp.db failed".to_string()),
        );
        assert_eq!(failed.status, 500);
        let text = String::from_utf8(failed.body).unwrap();
        assert!(!text.contains("private"));
        assert!(text.contains("local_data_unavailable"));
    }

    #[test]
    fn rejects_other_methods_and_encoded_path_separators() {
        let auth = format!("Bearer {TOKEN}");
        let post = route_request(
            &request("POST", "/workouts/1/series", Some(&auth)),
            TOKEN,
            |_| unreachable!(),
        );
        assert_eq!(post.status, 405);
        assert!(post.allow_get);
        let invalid = route_request(
            &request("GET", "/workouts/a%2Fb/series", Some(&auth)),
            TOKEN,
            |_| unreachable!(),
        );
        assert_eq!(invalid.status, 400);
    }

    #[test]
    fn every_route_requires_a_bearer_token_and_never_echoes_the_expected_value() {
        for target in ["/", "/health", "/workouts/1/series"] {
            for authorization in [
                None,
                Some("Bearer zbk_wrong"),
                Some("Basic zbk_0123456789abcdef"),
                Some("Bearer "),
                Some("zbk_0123456789abcdef"),
            ] {
                let response = route_request(&request("GET", target, authorization), TOKEN, |_| {
                    unreachable!("未授权的请求不应该读取本地数据库")
                });
                assert_eq!(response.status, 401, "{target} / {authorization:?}");
                let text = String::from_utf8(response.body).unwrap();
                assert!(!text.contains(TOKEN), "401 响应泄露了期望的 token");
            }
        }
    }

    #[test]
    fn unauthorized_response_carries_a_bearer_challenge() {
        let response = route_request(&request("GET", "/health", None), TOKEN, |_| unreachable!());
        let mut output = Vec::new();
        write_response(&mut output, response).unwrap();
        let text = String::from_utf8(output).unwrap();
        assert!(text.contains("WWW-Authenticate: Bearer"));
    }

    #[test]
    fn header_parsing_is_bounded_and_rejects_conflicting_authorization() {
        let ok = parse_request(&mut Cursor::new(
            "GET /health HTTP/1.1\r\nHost: 127.0.0.1\r\nAuthorization: Bearer abc\r\n\r\n"
                .as_bytes(),
        ))
        .unwrap();
        assert_eq!(ok.authorization.as_deref(), Some("Bearer abc"));

        let duplicate_same = parse_request(&mut Cursor::new(
            "GET /health HTTP/1.1\r\nAuthorization: Bearer abc\r\nAuthorization: Bearer abc\r\n\r\n"
                .as_bytes(),
        ));
        assert!(duplicate_same.is_ok());

        let conflicting = parse_request(&mut Cursor::new(
            "GET /health HTTP/1.1\r\nAuthorization: Bearer abc\r\nAuthorization: Bearer xyz\r\n\r\n"
                .as_bytes(),
        ));
        assert!(conflicting.is_err());

        let long_line = format!(
            "GET /health HTTP/1.1\r\nX-Long: {}\r\n\r\n",
            "a".repeat(MAX_HEADER_LINE_BYTES + 10)
        );
        assert!(parse_request(&mut Cursor::new(long_line.as_bytes())).is_err());

        let mut many = String::from("GET /health HTTP/1.1\r\n");
        for index in 0..(MAX_HEADER_LINES + 5) {
            many.push_str(&format!("X-{index}: v\r\n"));
        }
        many.push_str("\r\n");
        assert!(parse_request(&mut Cursor::new(many.as_bytes())).is_err());

        let long_target = format!(
            "GET /{} HTTP/1.1\r\n\r\n",
            "a".repeat(MAX_REQUEST_LINE_BYTES)
        );
        assert!(parse_request(&mut Cursor::new(long_target.as_bytes())).is_err());

        assert!(parse_request(&mut Cursor::new(
            "GET /health HTTP/1.1\r\nnot-a-header\r\n\r\n".as_bytes()
        ))
        .is_err());

        // 请求头没有以空行结束时不能当成合法请求继续路由。
        assert!(parse_request(&mut Cursor::new(
            "GET /health HTTP/1.1\r\nHost: x\r\n".as_bytes()
        ))
        .is_err());
    }

    #[test]
    fn first_install_does_not_listen_until_the_user_enables_it() {
        let dir = temp_dir("first-install");
        // 占住这个端口再让 controller 恢复。如果它偷偷尝试绑定，就会拿到
        // 「端口被占用」的错误；`error` 为 None 才能证明它压根没试过。
        // 这比「连一下看看通不通」可靠：临时端口随时可能被别的测试抢走。
        let squatter = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = squatter.local_addr().unwrap().to_string();
        let controller = controller_at(&dir, address);
        let status = controller.restore();
        assert!(!status.enabled);
        assert!(!status.running);
        assert!(
            status.error.is_none(),
            "没有状态文件时连绑定都不该尝试: {status:?}"
        );
        drop(squatter);
    }

    #[test]
    fn enable_disable_cycle_binds_and_releases_the_port_without_restart() {
        let dir = temp_dir("lifecycle");
        let address = ephemeral_address();
        let controller = controller_at(&dir, address.clone());
        assert!(!controller.restore().running);

        let enabled = controller.set_enabled(true);
        assert!(enabled.enabled && enabled.running, "{enabled:?}");
        assert!(enabled.token_present);
        assert!(ClientStream::connect(address.as_str()).is_ok());

        // 保存的启用状态可以跨进程恢复。
        assert!(read_enabled_flag(&dir));

        let disabled = controller.set_enabled(false);
        assert!(!disabled.enabled && !disabled.running);
        assert!(!read_enabled_flag(&dir));
        assert!(
            ClientStream::connect(address.as_str()).is_err(),
            "关闭后端口必须释放"
        );

        // 关闭之后可以立即再次启用，端口没有被自己的旧 listener 占住。
        assert!(controller.set_enabled(true).running);
        controller.shutdown();
        assert!(ClientStream::connect(address.as_str()).is_err());
    }

    #[test]
    fn rotating_the_token_invalidates_the_previous_one_immediately() {
        let dir = temp_dir("rotate");
        let controller = controller(&dir);
        let first = controller.reveal_token().unwrap();
        assert!(first.starts_with(TOKEN_PREFIX));
        assert_eq!(controller.reveal_token().unwrap(), first);

        controller.set_enabled(true);
        let second = controller.rotate_token().unwrap();
        assert_ne!(first, second);
        assert_eq!(controller.reveal_token().unwrap(), second);
        assert!(!tokens_match(&second, &first));
        controller.shutdown();
    }

    #[test]
    fn port_conflict_surfaces_as_an_api_error_without_pretending_to_run() {
        let dir = temp_dir("port-conflict");
        let squatter = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = squatter.local_addr().unwrap().to_string();
        let port = squatter.local_addr().unwrap().port().to_string();
        let controller = controller_at(&dir, address);
        let status = controller.set_enabled(true);
        assert!(status.enabled, "用户的启用意图应当被保存");
        assert!(!status.running, "端口占用时不得谎报正在运行");
        let message = status.error.expect("端口占用必须有可解释的错误");
        assert!(message.contains(&port), "{message}");
        drop(squatter);
    }
}
