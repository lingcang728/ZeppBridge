use super::client::TokenBody;
use super::*;
use crate::auth::CredentialBackend;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

#[derive(Default)]
struct MemoryBackend {
    entries: Mutex<HashMap<String, String>>,
    named: bool,
}

impl MemoryBackend {
    fn named() -> Arc<Self> {
        Arc::new(Self {
            named: true,
            ..Self::default()
        })
    }
}

impl CredentialBackend for MemoryBackend {
    fn set(&self, user_id: &str, token: &str) -> std::result::Result<(), String> {
        self.entries
            .lock()
            .unwrap()
            .insert(user_id.into(), token.into());
        Ok(())
    }
    fn get(&self, user_id: &str) -> std::result::Result<Option<String>, String> {
        Ok(self.entries.lock().unwrap().get(user_id).cloned())
    }
    fn delete(&self, user_id: &str) -> std::result::Result<(), String> {
        self.entries.lock().unwrap().remove(user_id);
        Ok(())
    }
    fn supports_named_entries(&self) -> bool {
        self.named
    }
}

fn temp_dir() -> std::path::PathBuf {
    let dir = std::env::temp_dir().join(format!(
        "zeppbridge-official-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

fn tokens() -> OfficialTokens {
    OfficialTokens {
        access_token: "access-fixture".into(),
        refresh_token: Some("refresh-fixture".into()),
        expires_at: Some(10_000),
        user_id: "3000000002".into(),
    }
}

/// 地址栏里只能出现 state 和 claim_secret 的哈希，claim_secret 本身不行——
/// 否则看得到浏览器历史的人就能替用户把令牌领走。
#[test]
fn the_start_url_carries_the_claim_hash_never_the_claim_secret() {
    let request = AuthorizationRequest::new().unwrap();
    assert_eq!(request.state.len(), 43);
    assert_eq!(request.claim_secret().len(), 43);
    assert_ne!(request.state, request.claim_secret());
    let url = request.start_url();
    assert!(url.starts_with("https://zeppbridge.pages.dev/api/zepp/oauth/start?state="));
    assert!(!url.contains(request.claim_secret()));
    let hash = hex::encode(Sha256::digest(request.claim_secret().as_bytes()));
    assert!(url.ends_with(&format!("&claim={hash}")));
}

#[test]
fn tokens_refresh_ahead_of_expiry_and_never_show_up_in_debug_output() {
    let tokens = tokens();
    assert!(!tokens.needs_refresh(10_000 - REFRESH_MARGIN_SECONDS - 1));
    assert!(tokens.needs_refresh(10_000 - REFRESH_MARGIN_SECONDS));
    let without_expiry = OfficialTokens {
        expires_at: None,
        ..tokens.clone()
    };
    assert!(!without_expiry.needs_refresh(i64::MAX));
    let debug = format!("{tokens:?}");
    assert!(!debug.contains("access-fixture"));
    assert!(!debug.contains("refresh-fixture"));
}

#[test]
fn a_token_body_without_an_access_token_is_not_a_connection() {
    let body: TokenBody = serde_json::from_value(serde_json::json!({
        "status": "ready", "access_token": "", "user_id": "1"
    }))
    .unwrap();
    assert!(body.into_tokens(0, None).is_none());

    // 刷新响应可以不带 user_id，沿用原来的。
    let body: TokenBody = serde_json::from_value(serde_json::json!({
        "status": "ready", "access_token": "a", "expires_in": 3600
    }))
    .unwrap();
    let fresh = body.into_tokens(100, Some("3000000002")).unwrap();
    assert_eq!(fresh.user_id, "3000000002");
    assert_eq!(fresh.expires_at, Some(3700));
}

#[test]
fn the_store_keeps_secrets_out_of_the_data_directory() {
    let dir = temp_dir();
    let backend = MemoryBackend::named();
    let store = OfficialStore::with_backend(&dir, backend.clone());
    assert!(store.load().unwrap().is_none());

    store.save(&tokens(), 42).unwrap();
    assert_eq!(store.load().unwrap(), Some(tokens()));
    let meta_text = std::fs::read_to_string(dir.join("official.json")).unwrap();
    assert!(!meta_text.contains("access-fixture"));
    assert!(!meta_text.contains("refresh-fixture"));
    assert_eq!(store.meta().unwrap().unwrap().connected_at, 42);

    // 刷新后再存一次，最初的连接时间不变。
    store.save(&tokens(), 99).unwrap();
    assert_eq!(store.meta().unwrap().unwrap().connected_at, 42);

    store.mark_needs_reauth().unwrap();
    assert!(store.load().unwrap().is_none());
    assert!(store.meta().unwrap().unwrap().needs_reauth);
    assert!(backend.entries.lock().unwrap().is_empty());

    store.save(&tokens(), 100).unwrap();
    store.clear().unwrap();
    assert!(store.meta().unwrap().is_none());
    assert!(backend.entries.lock().unwrap().is_empty());
    let _ = std::fs::remove_dir_all(dir);
}

/// 环境变量后端对任何名字都返回旧通道令牌：官方令牌存进去就会被读成旧令牌。
#[test]
fn a_store_that_cannot_keep_named_entries_refuses_official_tokens() {
    let dir = temp_dir();
    let store = OfficialStore::with_backend(&dir, Arc::new(MemoryBackend::default()));
    assert!(store.save(&tokens(), 1).is_err());
    assert!(store.meta().unwrap().is_none());
    let _ = std::fs::remove_dir_all(dir);
}
