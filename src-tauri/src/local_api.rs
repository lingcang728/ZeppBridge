use crate::models::WorkoutSeries;
use crate::storage::Database;
use serde::Serialize;
use serde_json::json;
use std::io::{self, BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::time::Duration;

pub const LOCAL_API_ADDRESS: &str = "127.0.0.1:43921";
pub const LOCAL_API_BASE_URL: &str = "http://127.0.0.1:43921";
const MAX_REQUEST_LINE_BYTES: usize = 8 * 1024;
const MAX_WORKOUT_ID_BYTES: usize = 256;

#[derive(Debug, Clone, Serialize)]
pub struct LocalApiStatus {
    pub running: bool,
    pub base_url: String,
    pub workout_series_path: String,
    pub error: Option<String>,
}

impl LocalApiStatus {
    fn running() -> Self {
        Self {
            running: true,
            base_url: LOCAL_API_BASE_URL.to_string(),
            workout_series_path: "/workouts/{id}/series".to_string(),
            error: None,
        }
    }

    fn failed(error: &io::Error) -> Self {
        let message = if error.kind() == io::ErrorKind::AddrInUse {
            format!("本机端口 43921 已被其他程序占用：{error}")
        } else {
            format!("无法启动本机 API：{error}")
        };
        Self {
            running: false,
            base_url: LOCAL_API_BASE_URL.to_string(),
            workout_series_path: "/workouts/{id}/series".to_string(),
            error: Some(message),
        }
    }
}

#[tauri::command]
pub fn get_local_api_status(state: tauri::State<'_, LocalApiStatus>) -> LocalApiStatus {
    state.inner().clone()
}

pub fn start(data_dir: PathBuf) -> LocalApiStatus {
    let listener = match TcpListener::bind(LOCAL_API_ADDRESS) {
        Ok(listener) => listener,
        Err(error) => return LocalApiStatus::failed(&error),
    };

    let status = LocalApiStatus::running();
    match std::thread::Builder::new()
        .name("zeppbridge-local-api".to_string())
        .spawn(move || serve(listener, data_dir))
    {
        Ok(_) => status,
        Err(error) => LocalApiStatus::failed(&error),
    }
}

fn serve(listener: TcpListener, data_dir: PathBuf) {
    for connection in listener.incoming() {
        match connection {
            Ok(mut stream) => {
                if let Err(error) = handle_connection(&mut stream, &data_dir) {
                    eprintln!("本机 API 请求处理失败: {error}");
                }
            }
            Err(error) => eprintln!("本机 API 连接失败: {error}"),
        }
    }
}

fn handle_connection(stream: &mut TcpStream, data_dir: &Path) -> io::Result<()> {
    stream.set_read_timeout(Some(Duration::from_secs(2)))?;
    stream.set_write_timeout(Some(Duration::from_secs(10)))?;
    let (method, target) = match read_request_line(stream) {
        Ok(request) => request,
        Err(error) => {
            write_response(stream, HttpResponse::bad_request("invalid_request", &error))?;
            return Ok(());
        }
    };

    let response = route_request(&method, &target, |workout_id| {
        load_workout_series(data_dir, workout_id)
    });
    write_response(stream, response)
}

fn read_request_line(stream: &mut TcpStream) -> Result<(String, String), String> {
    let mut reader = BufReader::new(stream).take((MAX_REQUEST_LINE_BYTES + 1) as u64);
    let mut line = String::new();
    let bytes = reader
        .read_line(&mut line)
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
    Ok((method.to_string(), target.to_string()))
}

fn load_workout_series(data_dir: &Path, workout_id: &str) -> Result<Option<WorkoutSeries>, String> {
    let db = Database::open_without_migration(data_dir.join("zepp.db"))
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

fn route_request<F>(method: &str, target: &str, lookup: F) -> HttpResponse
where
    F: FnOnce(&str) -> Result<Option<WorkoutSeries>, String>,
{
    if method != "GET" {
        return HttpResponse::method_not_allowed();
    }
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

struct HttpResponse {
    status: u16,
    reason: &'static str,
    body: Vec<u8>,
    allow_get: bool,
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
        }
    }

    fn bad_request(code: &str, message: &str) -> Self {
        Self::json(
            400,
            "Bad Request",
            json!({ "error": { "code": code, "message": message } }),
        )
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

fn write_response<W: Write>(stream: &mut W, response: HttpResponse) -> io::Result<()> {
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
    write!(stream, "\r\n")?;
    stream.write_all(&response.body)?;
    stream.flush()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::WorkoutSeriesSummary;

    fn empty_series(id: &str) -> WorkoutSeries {
        WorkoutSeries {
            workout_id: id.to_string(),
            samples: vec![],
            route: vec![],
            pauses: vec![],
            summary: WorkoutSeriesSummary::default(),
        }
    }

    #[test]
    fn health_route_describes_running_service_without_cors() {
        let response = route_request("GET", "/health", |_| unreachable!());
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
        let response = route_request("GET", "/workouts/run%2D123/series", |id| {
            assert_eq!(id, "run-123");
            Ok(Some(empty_series(id)))
        });
        assert_eq!(response.status, 200);
        let body: serde_json::Value = serde_json::from_slice(&response.body).unwrap();
        assert_eq!(body["workout_id"], "run-123");
        assert_eq!(body["samples"], json!([]));
        assert_eq!(body["route"], json!([]));
    }

    #[test]
    fn unknown_workout_is_404_and_storage_errors_are_generic() {
        let missing = route_request("GET", "/workouts/404/series", |_| Ok(None));
        assert_eq!(missing.status, 404);
        let failed = route_request("GET", "/workouts/500/series", |_| {
            Err("C:\\private\\zepp.db failed".to_string())
        });
        assert_eq!(failed.status, 500);
        let text = String::from_utf8(failed.body).unwrap();
        assert!(!text.contains("private"));
        assert!(text.contains("local_data_unavailable"));
    }

    #[test]
    fn rejects_other_methods_and_encoded_path_separators() {
        let post = route_request("POST", "/workouts/1/series", |_| unreachable!());
        assert_eq!(post.status, 405);
        assert!(post.allow_get);
        let invalid = route_request("GET", "/workouts/a%2Fb/series", |_| unreachable!());
        assert_eq!(invalid.status, 400);
    }
}
