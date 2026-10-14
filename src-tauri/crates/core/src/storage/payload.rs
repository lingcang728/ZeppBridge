//! 原始报文的压缩与解压（从 storage/mod.rs 按领域拆出，逻辑不变）。

use super::*;

/// 原始报文的压缩与还原。
///
/// 原始报文是这个库里最占地方的东西：一个用过一年的账号，两千多条
/// `raw_records` 就能吃掉一 GB 出头。它们是 JSON 文本，deflate 之后大约只剩
/// 五分之一，而且解压的代价只在重放时付一次——重放本来就是分钟级的操作。
///
/// 压的是 `serde_json::to_string` 出来的那串字节，还回来必须一模一样：重放、
/// 校验和、导出都依赖这一点，所以 [`decode_raw_payload`] 之后不做任何「修补」。
/// 小于这个字节数的报文不压。
///
/// zlib 自己就有十几字节的头，几百字节以下压不出什么名堂，甚至会更大
/// （空响应 `{"items":[]}` 只有 12 字节，压完反而变长）。省下的那点空间不值
/// 得为它维护「压过但没变小」这种状态。
pub(super) const MIN_COMPRESSIBLE_PAYLOAD_BYTES: i64 = 512;

/// 解压输出上限。被篡改的压缩行不能展开成任意大小。
pub(super) const MAX_DECOMPRESSED_PAYLOAD_BYTES: u64 = 32 * 1024 * 1024;

pub(super) fn compress_payload(payload: &str) -> Result<Vec<u8>> {
    use flate2::write::ZlibEncoder;
    use flate2::Compression;
    use std::io::Write;

    let mut encoder = ZlibEncoder::new(Vec::new(), Compression::default());
    encoder
        .write_all(payload.as_bytes())
        .map_err(|error| ZeppBridgeError::ParseError(format!("压缩原始报文失败: {error}")))?;
    encoder
        .finish()
        .map_err(|error| ZeppBridgeError::ParseError(format!("压缩原始报文失败: {error}")))
}

pub(super) fn decompress_payload(bytes: &[u8]) -> Result<String> {
    use flate2::read::ZlibDecoder;
    use std::io::Read;

    let mut limited =
        ZlibDecoder::new(bytes).take(MAX_DECOMPRESSED_PAYLOAD_BYTES.saturating_add(1));
    let mut out = Vec::new();
    limited
        .read_to_end(&mut out)
        .map_err(|error| ZeppBridgeError::ParseError(format!("解压原始报文失败: {error}")))?;
    if out.len() as u64 > MAX_DECOMPRESSED_PAYLOAD_BYTES {
        return Err(ZeppBridgeError::ParseError(
            "解压原始报文超过 32 MiB 上限".into(),
        ));
    }
    String::from_utf8(out)
        .map_err(|error| ZeppBridgeError::ParseError(format!("解压原始报文失败: {error}")))
}

/// 取出一条原始报文。
///
/// 压缩是后加的，老库里的行仍然是明文 `payload`，而且**永远**要能读——所以
/// 这里两种形态都认，压缩的优先。
pub(super) fn decode_raw_payload(payload: String, payload_zip: Option<Vec<u8>>) -> Result<String> {
    match payload_zip {
        Some(bytes) if !bytes.is_empty() => decompress_payload(&bytes),
        _ => Ok(payload),
    }
}
