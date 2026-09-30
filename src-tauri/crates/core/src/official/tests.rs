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

/* ---------- 代码审查 R05：提交代次与比较后写回 ---------- */

/// 等 claim / profile 期间用户取消、断开或重新开始：旧回执不许写凭据。
/// 断开之后同一把旧回执也写不回来。本测试是唯一会推代次的用例，别拆开。
#[test]
fn a_superseded_login_never_writes_and_disconnect_voids_it_too() {
    let dir = temp_dir();
    let backend = MemoryBackend::named();
    let store = OfficialStore::with_backend(&dir, backend.clone());

    let stale = invalidate_pending_logins();
    invalidate_pending_logins(); // 用户取消后又开了一次
    assert!(!store.save_login(&tokens(), Some("旧"), 1, stale).unwrap());
    assert!(store.meta().unwrap().is_none());
    assert!(backend.entries.lock().unwrap().is_empty());

    let live = current_generation();
    assert!(store.save_login(&tokens(), Some("跑者"), 1, live).unwrap());
    assert_eq!(
        store.meta().unwrap().unwrap().nickname.as_deref(),
        Some("跑者")
    );

    store.disconnect().unwrap();
    assert!(!store.save_login(&tokens(), None, 2, live).unwrap());
    assert!(store.meta().unwrap().is_none());
    assert!(backend.entries.lock().unwrap().is_empty());
    let _ = std::fs::remove_dir_all(dir);
}

/// 刷新写回按「库里还是那把刷新令牌」比较后交换：并发的另一次刷新已经
/// 换上新令牌时，这次的结果和这次的拒绝都不能覆盖它。
#[test]
fn refresh_results_only_land_on_the_token_they_came_from() {
    let dir = temp_dir();
    let store = OfficialStore::with_backend(&dir, MemoryBackend::named());
    let used = tokens();
    store.save(&used, 1).unwrap();

    let newer = OfficialTokens {
        access_token: "access-newer".into(),
        refresh_token: Some("refresh-newer".into()),
        ..used.clone()
    };
    assert!(store.replace_if_current(&used, &newer, 2).unwrap());

    // 旧的那次刷新晚到：不覆盖、也不能把账号标成要重新授权。
    let late = OfficialTokens {
        access_token: "access-late".into(),
        refresh_token: Some("refresh-late".into()),
        ..used.clone()
    };
    assert!(!store.replace_if_current(&used, &late, 3).unwrap());
    assert!(!store.mark_needs_reauth_if_current(&used).unwrap());
    assert_eq!(store.load().unwrap(), Some(newer.clone()));

    // 断开以后刷新结果也写不回来。
    store.clear().unwrap();
    assert!(!store.replace_if_current(&newer, &late, 4).unwrap());
    assert!(store.meta().unwrap().is_none());
    let _ = std::fs::remove_dir_all(dir);
}

/// 换了账号：上一个账号的凭据条目一并删掉，不留没人引用的令牌。
#[test]
fn switching_accounts_removes_the_previous_accounts_secrets() {
    let dir = temp_dir();
    let backend = MemoryBackend::named();
    let store = OfficialStore::with_backend(&dir, backend.clone());
    store.save(&tokens(), 1).unwrap();
    let other = OfficialTokens {
        user_id: "3000000009".into(),
        ..tokens()
    };
    store.save(&other, 2).unwrap();
    let keys: Vec<String> = backend.entries.lock().unwrap().keys().cloned().collect();
    assert!(
        keys.iter().all(|key| key.contains("3000000009")),
        "{keys:?}"
    );
    assert_eq!(keys.len(), 2);
    let _ = std::fs::remove_dir_all(dir);
}

/// 本地假中转站：每次刷新请求计数、故意慢 300ms 回一把新令牌。
async fn slow_refresh_relay() -> (String, Arc<std::sync::atomic::AtomicUsize>) {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    let hits = Arc::new(std::sync::atomic::AtomicUsize::new(0));
    let counter = hits.clone();
    tokio::spawn(async move {
        loop {
            let Ok((mut socket, _)) = listener.accept().await else {
                return;
            };
            let counter = counter.clone();
            tokio::spawn(async move {
                let mut buffer = vec![0u8; 8192];
                let _ = socket.read(&mut buffer).await;
                let n = counter.fetch_add(1, std::sync::atomic::Ordering::SeqCst) + 1;
                tokio::time::sleep(std::time::Duration::from_millis(300)).await;
                let body = format!(
                    r#"{{"status":"ready","access_token":"access-{n}","refresh_token":"refresh-{n}","expires_in":3600}}"#
                );
                let response = format!(
                    "HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{body}",
                    body.len()
                );
                let _ = socket.write_all(response.as_bytes()).await;
            });
        }
    });
    (base, hits)
}

/// 状态读取和同步同时发现令牌快过期：只发一次刷新，两边拿到同一把新令牌。
#[tokio::test]
async fn concurrent_refreshes_are_single_flight() {
    let dir = temp_dir();
    let store = OfficialStore::with_backend(&dir, MemoryBackend::named());
    store.save(&tokens(), 1).unwrap();
    let (base, hits) = slow_refresh_relay().await;
    let client = OfficialClient::with_bases(&base, &base).unwrap();
    let now = 10_000; // 已到期，必须刷新

    let (a, b) = tokio::join!(
        fresh_tokens(&store, &client, now),
        fresh_tokens(&store, &client, now)
    );
    let (a, b) = (a.unwrap().unwrap(), b.unwrap().unwrap());
    assert_eq!(hits.load(std::sync::atomic::Ordering::SeqCst), 1);
    assert_eq!(a, b);
    assert_eq!(a.refresh_token.as_deref(), Some("refresh-1"));
    assert_eq!(store.load().unwrap(), Some(a));
    let _ = std::fs::remove_dir_all(dir);
}
