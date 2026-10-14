//! 手写的 HTTP 处理：接收连接、读请求行与头、路由、写响应（从 local_api.rs 拆出，逻辑不变）。

use super::*;

pub(super) fn serve(
    listener: TcpListener,
    data_dir: PathBuf,
    stop: Arc<AtomicBool>,
    token: Arc<RwLock<String>>,
) {
    // 接进来的连接交给一个固定大小的工作池。accept 这条线程只负责接，
    // 接完立刻回到 accept——一个慢客户端最多占住一个 worker，堵不住其他人。
    let (sender, receiver) = mpsc::sync_channel::<TcpStream>(ACCEPT_QUEUE);
    // `Receiver` 不是 `Sync`，所以几个 worker 共享一把锁轮流取。锁只在
    // `recv` 期间持有，真正的请求处理在锁外面。
    let receiver = Arc::new(Mutex::new(receiver));
    let mut workers = Vec::with_capacity(WORKER_THREADS);
    for _ in 0..WORKER_THREADS {
        let receiver = Arc::clone(&receiver);
        let data_dir = data_dir.clone();
        let token = Arc::clone(&token);
        workers.push(std::thread::spawn(move || loop {
            let next = {
                let guard = receiver.lock().unwrap_or_else(|e| e.into_inner());
                guard.recv()
            };
            // sender 被 drop（accept 循环结束）时 recv 报错，worker 退出。
            let Ok(mut stream) = next else { break };
            let expected = token
                .read()
                .map(|value| value.clone())
                .unwrap_or_else(|e| e.into_inner().clone());
            if let Err(error) = handle_connection(&mut stream, &data_dir, &expected) {
                eprintln!("本机 API 请求处理失败: {error}");
            }
        }));
    }

    while !stop.load(Ordering::SeqCst) {
        match listener.accept() {
            Ok((stream, peer)) => {
                if !peer.ip().is_loopback() {
                    continue;
                }
                if stream.set_nonblocking(false).is_err() {
                    continue;
                }
                match sender.try_send(stream) {
                    Ok(()) => {}
                    Err(mpsc::TrySendError::Full(_)) => {
                        // 队列已满：丢掉这条连接，保持 accept 循环能响应 stop。
                    }
                    Err(mpsc::TrySendError::Disconnected(_)) => break,
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

    // 先放下 listener，端口立刻释放。worker 处理完手上的连接后自行退出，
    // 不在这里 join——`set_enabled(false)` 拿着 controller 锁，join 读超时
    // 会把设置页冻住。
    drop(listener);
    drop(sender);
    drop(workers);
}

pub(super) fn handle_connection(
    stream: &mut TcpStream,
    data_dir: &Path,
    token: &str,
) -> io::Result<()> {
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

pub(super) fn read_request(stream: &mut TcpStream) -> Result<ParsedRequest, String> {
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
pub(super) fn read_capped_line<R: BufRead>(
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

pub(super) fn load_workout_series(
    data_dir: &Path,
    workout_id: &str,
) -> Result<Option<WorkoutSeries>, String> {
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

pub(super) fn bearer_value(header: &str) -> Option<&str> {
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

pub(super) fn decode_workout_id(raw: &str) -> Result<String, &'static str> {
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

pub(super) fn hex_value(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        b'A'..=b'F' => Some(byte - b'A' + 10),
        _ => None,
    }
}

pub struct HttpResponse {
    pub status: u16,
    pub(super) reason: &'static str,
    pub body: Vec<u8>,
    pub(super) allow_get: bool,
    pub(super) challenge: bool,
}

impl HttpResponse {
    pub(super) fn json<T: Serialize>(status: u16, reason: &'static str, value: T) -> Self {
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

    pub(super) fn bad_request(code: &str, message: &str) -> Self {
        Self::json(
            400,
            "Bad Request",
            json!({ "error": { "code": code, "message": message } }),
        )
    }

    /// 无 token、错 token、旧 token 走同一条路径，响应里不透露期望值，
    /// 也不区分「没带」和「带错了」。
    pub(super) fn unauthorized() -> Self {
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

    pub(super) fn not_found(code: &str, message: &str) -> Self {
        Self::json(
            404,
            "Not Found",
            json!({ "error": { "code": code, "message": message } }),
        )
    }

    pub(super) fn method_not_allowed() -> Self {
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
