pub mod zepp;

pub use zepp::ZeppConnector;

use crate::models::{error::Result, ZeppBridgeError};

/// 读一个 JSON 响应，最多 `max_bytes` 字节（代码审查 R15）。
///
/// 有 `Content-Length` 时先拒；没有（chunked）时按块累加，超了立刻停——
/// 不先把整个异常大的报文读进内存再解析失败。旧通道与官方通道共用。
pub(crate) async fn read_json_limited(
    mut response: reqwest::Response,
    max_bytes: usize,
) -> Result<serde_json::Value> {
    let too_large = || {
        ZeppBridgeError::ParseError(format!(
            "响应超过 {} MB，没有读完；缩小同步区间后重试",
            max_bytes / (1024 * 1024)
        ))
    };
    if let Some(len) = response.content_length() {
        if len > max_bytes as u64 {
            return Err(too_large());
        }
    }
    let mut buf = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|error| ZeppBridgeError::ParseError(format!("JSON 响应无效: {error}")))?
    {
        if buf.len().saturating_add(chunk.len()) > max_bytes {
            return Err(too_large());
        }
        buf.extend_from_slice(&chunk);
    }
    serde_json::from_slice(&buf)
        .map_err(|error| ZeppBridgeError::ParseError(format!("JSON 响应无效: {error}")))
}
