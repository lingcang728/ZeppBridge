//! `ZeppBridge-Cloud/shared/crypto.mjs` 里电脑端用到的那一半，用 Rust 重写。
//!
//! **和 Worker 字节兼容是硬门禁**：对象密文的布局、AAD、密钥格式一个字节都不能差，
//! 否则站点上的读者解不开。双向验证在两边各有一条：
//! - 这里的 `tests` 解开 node（crypto.mjs）生成的密文；
//! - ZeppBridge-Cloud 的 `tests/rust-compat.test.mjs` 用 crypto.mjs 解开这里生成的密文。
//!
//! 布局（`FORMAT_VERSION = 1`）：`[1] | nonce(12) | AES-256-GCM 密文 + tag(16)`，
//! AAD = `object:<R2 完整路径>`，路径 = `t/<租户>/<相对路径>.gz.enc`。
//!
//! 云端定时拉取用的 live 密钥对（ECDH P-256）：电脑只负责生成，把公钥原样（65 字节
//! 未压缩点）和用 DK 封好的 PKCS#8 私钥交给站点；之后电脑不再碰它。

use base64::Engine as _;
use ring::aead::{Aad, LessSafeKey, Nonce, UnboundKey, AES_256_GCM, NONCE_LEN};
use ring::rand::{SecureRandom, SystemRandom};
use ring::signature::{EcdsaKeyPair, KeyPair, ECDSA_P256_SHA256_FIXED_SIGNING};

pub const FORMAT_VERSION: u8 = 1;

const TAG_LEN: usize = 16;

/// R2 里的完整路径；它同时是对象加密的 AAD，两边必须一字不差。
pub fn object_key(tenant: &str, rel: &str) -> String {
    format!("t/{tenant}/{rel}.gz.enc")
}

pub fn b64url(bytes: &[u8]) -> String {
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes)
}

/// crypto.mjs 的 `fromB64url` 对有没有 `=` 补齐都宽容，这里也一样。
pub fn from_b64url(text: &str) -> Option<Vec<u8>> {
    base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(text.trim().trim_end_matches('='))
        .ok()
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum KeyKind {
    Read,
    Write,
}

/// `zbr_<租户>_<随机>` / `zbw_…` → (种类, 租户)。格式不对返回 `None`。
pub fn parse_key(key: &str) -> Option<(KeyKind, String)> {
    let (prefix, rest) = key.split_once('_')?;
    let kind = match prefix {
        "zbr" => KeyKind::Read,
        "zbw" => KeyKind::Write,
        _ => return None,
    };
    let (tenant, random) = rest.split_at_checked(10)?;
    let random = random.strip_prefix('_')?;
    let tenant_ok = tenant
        .bytes()
        .all(|byte| byte.is_ascii_lowercase() || (b'2'..=b'7').contains(&byte));
    let random_ok = random.len() == 43
        && random
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-');
    (tenant_ok && random_ok).then(|| (kind, tenant.to_string()))
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CryptoError {
    BadKey,
    BadCiphertext,
    Random,
}

fn aes_key(raw: &[u8]) -> Result<LessSafeKey, CryptoError> {
    if raw.len() != 32 {
        return Err(CryptoError::BadKey);
    }
    UnboundKey::new(&AES_256_GCM, raw)
        .map(LessSafeKey::new)
        .map_err(|_| CryptoError::BadKey)
}

fn seal_with_nonce(
    key: &[u8],
    nonce: [u8; NONCE_LEN],
    plain: &[u8],
    aad: &str,
) -> Result<Vec<u8>, CryptoError> {
    let key = aes_key(key)?;
    let mut body = plain.to_vec();
    key.seal_in_place_append_tag(
        Nonce::assume_unique_for_key(nonce),
        Aad::from(aad.as_bytes()),
        &mut body,
    )
    .map_err(|_| CryptoError::BadKey)?;
    let mut out = Vec::with_capacity(1 + NONCE_LEN + body.len());
    out.push(FORMAT_VERSION);
    out.extend_from_slice(&nonce);
    out.extend_from_slice(&body);
    Ok(out)
}

fn seal(key: &[u8], plain: &[u8], aad: &str) -> Result<Vec<u8>, CryptoError> {
    let mut nonce = [0u8; NONCE_LEN];
    SystemRandom::new()
        .fill(&mut nonce)
        .map_err(|_| CryptoError::Random)?;
    seal_with_nonce(key, nonce, plain, aad)
}

fn open(key: &[u8], sealed: &[u8], aad: &str) -> Result<Vec<u8>, CryptoError> {
    if sealed.first() != Some(&FORMAT_VERSION) || sealed.len() < 1 + NONCE_LEN + TAG_LEN {
        return Err(CryptoError::BadCiphertext);
    }
    let key = aes_key(key)?;
    let mut nonce = [0u8; NONCE_LEN];
    nonce.copy_from_slice(&sealed[1..1 + NONCE_LEN]);
    let mut body = sealed[1 + NONCE_LEN..].to_vec();
    let plain = key
        .open_in_place(
            Nonce::assume_unique_for_key(nonce),
            Aad::from(aad.as_bytes()),
            &mut body,
        )
        .map_err(|_| CryptoError::BadCiphertext)?;
    Ok(plain.to_vec())
}

/// 对象加密：AAD = `object:<R2 完整路径>`，防止把一个文件的密文换到另一个路径下。
pub fn encrypt_object(dk: &[u8], path: &str, gz: &[u8]) -> Result<Vec<u8>, CryptoError> {
    seal(dk, gz, &format!("object:{path}"))
}

/// 读者那一侧的解密。电脑端上传用不到，留给测试和本机核对。
pub fn decrypt_object(dk: &[u8], path: &str, sealed: &[u8]) -> Result<Vec<u8>, CryptoError> {
    open(dk, sealed, &format!("object:{path}"))
}

/// 云端定时拉取用的密钥对：公钥（65 字节未压缩点）和 PKCS#8 私钥。
///
/// 用 ring 的 ECDSA P-256 生成器：P-256 私钥的 PKCS#8 结构和用途无关
/// （算法标识都是 id-ecPublicKey + prime256v1），WebCrypto 能直接按 ECDH 导入——
/// Cloud 那边的兼容测试实际导入并用它解开过 `sealForLive` 的密文。
pub struct LiveKeyPair {
    pub public_raw: Vec<u8>,
    pub private_pkcs8: Vec<u8>,
}

pub fn new_live_key_pair() -> Result<LiveKeyPair, CryptoError> {
    let rng = SystemRandom::new();
    let pkcs8 = EcdsaKeyPair::generate_pkcs8(&ECDSA_P256_SHA256_FIXED_SIGNING, &rng)
        .map_err(|_| CryptoError::Random)?;
    let pair = EcdsaKeyPair::from_pkcs8(&ECDSA_P256_SHA256_FIXED_SIGNING, pkcs8.as_ref(), &rng)
        .map_err(|_| CryptoError::BadKey)?;
    Ok(LiveKeyPair {
        public_raw: pair.public_key().as_ref().to_vec(),
        private_pkcs8: pkcs8.as_ref().to_vec(),
    })
}

/// sha256 的十六进制小写（crypto.mjs 的 `sha256Hex`）。
pub fn sha256_hex(text: &str) -> String {
    use sha2::{Digest, Sha256};
    hex::encode(Sha256::digest(text.as_bytes()))
}

/// 上传前的硬检查：任何坐标字段出现就整次中止（crypto.mjs 的 `findCoordinateField`）。
///
/// 和 JS 正则 `/"(latitude|longitude|lat|lng|lon)"\s*:/` 同义：字段名两边带引号、
/// 后面（可隔空白）跟冒号。
pub fn find_coordinate_field(json_text: &str) -> Option<&'static str> {
    const NAMES: [&str; 5] = ["latitude", "longitude", "lat", "lng", "lon"];
    let bytes = json_text.as_bytes();
    let mut first: Option<(usize, &'static str)> = None;
    for name in NAMES {
        let needle = format!("\"{name}\"");
        let mut from = 0;
        while let Some(found) = json_text[from..].find(&needle) {
            let at = from + found;
            let mut index = at + needle.len();
            while index < bytes.len() && bytes[index].is_ascii_whitespace() {
                index += 1;
            }
            if bytes.get(index) == Some(&b':') {
                if first.is_none_or(|(known, _)| at < known) {
                    first = Some((at, name));
                }
                break;
            }
            from = at + 1;
        }
    }
    first.map(|(_, name)| name)
}

#[cfg(test)]
pub(crate) fn seal_for_test(
    key: &[u8],
    nonce: [u8; NONCE_LEN],
    plain: &[u8],
    path: &str,
) -> Vec<u8> {
    seal_with_nonce(key, nonce, plain, &format!("object:{path}")).unwrap()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 由 ZeppBridge-Cloud 的 crypto.mjs 生成（`tests/rust-compat.test.mjs` 里的
    /// `NODE_VECTOR` 同一份）：DK 全是 0x07，租户 `abcdefghij`，相对路径 `days/2024-03-10.json`，
    /// 明文 `{"hello":"zeppbridge"}`（没压缩：这里只验加密层）。
    const NODE_DK_BYTE: u8 = 7;
    const NODE_TENANT: &str = "abcdefghij";
    const NODE_REL: &str = "days/2024-03-10.json";
    const NODE_PLAIN: &str = "{\"hello\":\"zeppbridge\"}";
    const NODE_SEALED: &str = include_str!("node_vector.txt");

    #[test]
    fn opens_what_crypto_mjs_sealed() {
        let dk = [NODE_DK_BYTE; 32];
        let sealed = from_b64url(NODE_SEALED).expect("向量不是 base64url");
        let plain =
            decrypt_object(&dk, &object_key(NODE_TENANT, NODE_REL), &sealed).expect("解不开");
        assert_eq!(String::from_utf8(plain).unwrap(), NODE_PLAIN);
        // 换个路径（AAD）就解不开：密文不能挪到别的对象下。
        assert_eq!(
            decrypt_object(&dk, &object_key(NODE_TENANT, "days/other.json"), &sealed),
            Err(CryptoError::BadCiphertext)
        );
    }

    #[test]
    fn layout_matches_format_version_one() {
        let dk = [1u8; 32];
        let sealed = encrypt_object(&dk, "t/x/y.gz.enc", b"abc").unwrap();
        assert_eq!(sealed[0], FORMAT_VERSION);
        assert_eq!(sealed.len(), 1 + 12 + 3 + 16);
        assert_eq!(
            decrypt_object(&dk, "t/x/y.gz.enc", &sealed).unwrap(),
            b"abc".to_vec()
        );
        // 每次的 nonce 都是新的。
        assert_ne!(sealed, encrypt_object(&dk, "t/x/y.gz.enc", b"abc").unwrap());
        assert_eq!(
            encrypt_object(&[0u8; 16], "p", b"x"),
            Err(CryptoError::BadKey)
        );
    }

    #[test]
    fn keys_parse_like_the_worker() {
        let random = "A".repeat(43);
        assert_eq!(
            parse_key(&format!("zbw_abcdefghij_{random}")),
            Some((KeyKind::Write, "abcdefghij".into()))
        );
        assert_eq!(
            parse_key(&format!("zbr_abcdefgh23_{random}")),
            Some((KeyKind::Read, "abcdefgh23".into()))
        );
        for bad in [
            format!("zbx_abcdefghij_{random}"),
            format!("zbw_ABCDEFGHIJ_{random}"),
            format!("zbw_abcdefghi1_{random}"),
            format!("zbw_abcdefghij_{}", "A".repeat(42)),
            format!("zbw_abcdefghij_{}!", "A".repeat(42)),
            String::new(),
        ] {
            assert_eq!(parse_key(&bad), None, "{bad}");
        }
    }

    #[test]
    fn live_key_pair_has_the_shapes_the_site_expects() {
        let pair = new_live_key_pair().unwrap();
        assert_eq!(pair.public_raw.len(), 65);
        assert_eq!(pair.public_raw[0], 0x04);
        assert!(pair.private_pkcs8.len() > 100);
    }

    #[test]
    fn coordinate_check_matches_the_js_regex() {
        assert_eq!(find_coordinate_field("{\"lat\": 1}"), Some("lat"));
        assert_eq!(
            find_coordinate_field("{\"a\":1,\"longitude\"\n:2,\"lat\":3}"),
            Some("longitude")
        );
        assert_eq!(find_coordinate_field("{\"latitude_note\":1}"), None);
        assert_eq!(find_coordinate_field("{\"x\":\"lat\"}"), None);
        assert_eq!(find_coordinate_field("{\"route_point_count\":3}"), None);
    }

    #[test]
    fn b64url_round_trips_and_tolerates_padding() {
        let bytes = [0xfbu8, 0xff, 0x00, 0x10];
        let text = b64url(&bytes);
        assert!(!text.contains('=') && !text.contains('+') && !text.contains('/'));
        assert_eq!(from_b64url(&text).unwrap(), bytes);
        assert_eq!(from_b64url(&format!("{text}==")).unwrap(), bytes);
    }
}
