//! 推送引擎的硬规则：闸门、地址、密钥、清单、重试、坐标。

use super::*;
use crate::models::{SourceScope, Workout};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU16, AtomicUsize, Ordering};
use std::sync::Mutex;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

#[derive(Default)]
struct Store {
    entries: Mutex<HashMap<String, String>>,
}

impl CredentialBackend for Store {
    fn set(&self, account: &str, token: &str) -> Result<(), String> {
        self.entries
            .lock()
            .unwrap()
            .insert(account.into(), token.into());
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

/// 假站点记下的一个请求。
type Recorded = (String, String, Vec<u8>, String);

/// 记下每个请求（方法、路径、正文）的假 PA 站点。`status` 可以中途改；`old_template` 打开时
/// 像还不认 `unstrap/` 路径的旧站点模板，那些路径回 404。
struct FakeSite {
    base: String,
    hits: Arc<AtomicUsize>,
    requests: Arc<Mutex<Vec<Recorded>>>,
    status: Arc<AtomicU16>,
    old_template: Arc<AtomicBool>,
}

async fn fake_site() -> FakeSite {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    let hits = Arc::new(AtomicUsize::new(0));
    let requests = Arc::new(Mutex::new(Vec::new()));
    let status = Arc::new(AtomicU16::new(200));
    let old_template = Arc::new(AtomicBool::new(false));
    let (h, r, s, o) = (
        hits.clone(),
        requests.clone(),
        status.clone(),
        old_template.clone(),
    );
    tokio::spawn(async move {
        loop {
            let Ok((mut socket, _)) = listener.accept().await else {
                return;
            };
            let (h, r, s, o) = (h.clone(), r.clone(), s.clone(), o.clone());
            tokio::spawn(async move {
                let mut buffer = Vec::new();
                let mut chunk = [0u8; 8192];
                let header_end = loop {
                    let n = socket.read(&mut chunk).await.unwrap_or(0);
                    if n == 0 {
                        return;
                    }
                    buffer.extend_from_slice(&chunk[..n]);
                    if let Some(at) = buffer.windows(4).position(|w| w == b"\r\n\r\n") {
                        break at + 4;
                    }
                };
                let head = String::from_utf8_lossy(&buffer[..header_end]).to_string();
                let length = head
                    .lines()
                    .find_map(|line| {
                        let (name, value) = line.split_once(':')?;
                        name.eq_ignore_ascii_case("content-length")
                            .then(|| value.trim().parse::<usize>().ok())?
                    })
                    .unwrap_or(0);
                while buffer.len() < header_end + length {
                    let n = socket.read(&mut chunk).await.unwrap_or(0);
                    if n == 0 {
                        break;
                    }
                    buffer.extend_from_slice(&chunk[..n]);
                }
                let mut parts = head.split_whitespace();
                let method = parts.next().unwrap_or_default().to_string();
                let path = parts.next().unwrap_or_default().to_string();
                let auth = head
                    .lines()
                    .find_map(|line| {
                        let (name, value) = line.split_once(':')?;
                        name.eq_ignore_ascii_case("authorization")
                            .then(|| value.trim().to_string())
                    })
                    .unwrap_or_default();
                h.fetch_add(1, Ordering::SeqCst);
                let code = if o.load(Ordering::SeqCst) && path.starts_with("/v1/objects/unstrap/") {
                    404
                } else {
                    s.load(Ordering::SeqCst)
                };
                r.lock()
                    .unwrap()
                    .push((method, path, buffer[header_end..].to_vec(), auth));
                let reply = format!(
                    "HTTP/1.1 {code} X\r\ncontent-length: 2\r\nconnection: close\r\n\r\n{{}}"
                );
                let _ = socket.write_all(reply.as_bytes()).await;
                let _ = socket.shutdown().await;
            });
        }
    });
    FakeSite {
        base,
        hits,
        requests,
        status,
        old_template,
    }
}

fn temp_dir(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!(
        "zeppbridge-push-{name}-{}-{}",
        std::process::id(),
        crate::unique_suffix()
    ));
    std::fs::create_dir_all(dir.join(PUSH_DIR)).unwrap();
    dir
}

const TENANT: &str = "abcdefghij";

fn write_key() -> String {
    format!("zbw_{TENANT}_{}", "B".repeat(43))
}

fn secrets() -> pa::PaSecrets {
    pa::PaSecrets {
        tenant: Some(TENANT.into()),
        dk: pa::crypto::b64url(&[9u8; 32]),
        write_key: write_key(),
    }
}

fn write_targets(dir: &Path, site: &str, enabled: bool) {
    write_targets_for_days(dir, site, enabled, 3);
}

fn write_targets_for_days(dir: &Path, site: &str, enabled: bool, retention_days: u32) {
    let config = serde_json::json!({ "version": 1, "targets": [{
        "id": "pa", "kind": "pa", "enabled": enabled, "site": site,
        "retention_days": retention_days, "summary_days": 2, "dev_loopback": true
    }]});
    std::fs::write(
        push_dir(dir).join(TARGETS_FILE),
        serde_json::to_vec(&config).unwrap(),
    )
    .unwrap();
}

/// 一个真的 SQLite 库（文件），里面有今天的一条运动。
fn seed_library(dir: &Path) {
    let db = Database::open_migrated(&dir.join("zepp.db")).unwrap();
    seed_workout(&db, "w1", Utc::now() - chrono::Duration::hours(1));
}

fn seed_workout(db: &Database, id: &str, start: chrono::DateTime<Utc>) {
    db.insert_workout(&Workout {
        workout_id: id.into(),
        workout_type: "running".into(),
        normalized_type: "running".into(),
        type_source: "zepp_code".into(),
        effective_type: "running".into(),
        start_time: start,
        end_time: start + chrono::Duration::minutes(30),
        calories: Some(200),
        source_scope: SourceScope::Device,
        ..Default::default()
    })
    .unwrap();
}

fn store_with_secrets() -> Arc<Store> {
    let store = Arc::new(Store::default());
    store_pa_secrets(store.as_ref(), "pa", &secrets()).unwrap();
    store
}

#[tokio::test]
async fn no_enabled_target_means_no_request_and_no_library_read() {
    let site = fake_site().await;
    let dir = temp_dir("gate");
    // 库文件故意是坏的：闸门之后才读库，读了就会失败。
    std::fs::write(dir.join("zepp.db"), b"not a database").unwrap();
    let report = run(&dir, store_with_secrets()).await;
    assert!(report.gated && report.targets.is_empty());
    write_targets(&dir, &site.base, false);
    let report = run(&dir, store_with_secrets()).await;
    assert!(report.gated);
    assert_eq!(site.hits.load(Ordering::SeqCst), 0);
    assert!(!push_dir(&dir).join("pa.manifest.json").exists());
}

#[tokio::test]
async fn pushes_encrypted_objects_then_skips_unchanged_content() {
    let site = fake_site().await;
    let dir = temp_dir("push");
    seed_library(&dir);
    write_targets(&dir, &site.base, true);
    let store = store_with_secrets();

    let first = run(&dir, store.clone()).await;
    assert_eq!(first.targets[0].result, "ok", "{:?}", first.targets[0]);
    let requests = site.requests.lock().unwrap().clone();
    assert!(!requests.is_empty());
    // 每个请求都带写入密钥；status 最后一个。
    assert!(requests
        .iter()
        .all(|(_, _, _, auth)| auth == &format!("Bearer {}", write_key())));
    assert_eq!(requests.last().unwrap().1, "/v1/objects/status.json");
    let paths: Vec<&str> = requests
        .iter()
        .map(|(_, path, _, _)| path.as_str())
        .collect();
    assert!(paths.contains(&"/v1/objects/workouts/w1.json"));
    assert!(paths.contains(&"/v1/objects/summary.json"));
    assert!(paths.contains(&"/v1/objects/contract.json"));
    // 能用 DK 和对象路径（AAD）解开，解出来是 gzip 过的 JSON，没有坐标。
    let (_, _, body, _) = requests
        .iter()
        .find(|(_, path, _, _)| path == "/v1/objects/workouts/w1.json")
        .unwrap();
    let gz = pa::crypto::decrypt_object(
        &[9u8; 32],
        &pa::crypto::object_key(TENANT, "workouts/w1.json"),
        body,
    )
    .unwrap();
    let mut text = String::new();
    std::io::Read::read_to_string(&mut flate2::read::GzDecoder::new(&gz[..]), &mut text).unwrap();
    let object: Value = serde_json::from_str(&text).unwrap();
    assert_eq!(object["workout"]["workout_id"], "w1");
    assert_eq!(object["resolution"], "15s");
    assert!(pa::crypto::find_coordinate_field(&text).is_none());

    // 第二轮：库没变 → 一个请求都不发。
    let before = site.hits.load(Ordering::SeqCst);
    let second = run(&dir, store.clone()).await;
    assert_eq!(second.targets[0].result, "unchanged");
    assert_eq!(site.hits.load(Ordering::SeqCst), before);
    let status: Value =
        serde_json::from_slice(&std::fs::read(push_dir(&dir).join("pa.status.json")).unwrap())
            .unwrap();
    assert_eq!(status["result"], "unchanged");
}

#[tokio::test]
async fn an_older_site_skips_the_unstrap_package_and_takes_it_once_updated() {
    let site = fake_site().await;
    let dir = temp_dir("unstrap");
    seed_library(&dir);
    let config = serde_json::json!({ "version": 1, "targets": [{
        "id": "pa", "kind": "pa", "enabled": true, "site": site.base,
        "retention_days": 3, "summary_days": 2, "dev_loopback": true, "unstrap": true
    }]});
    std::fs::write(
        push_dir(&dir).join(TARGETS_FILE),
        serde_json::to_vec(&config).unwrap(),
    )
    .unwrap();
    let store = store_with_secrets();
    let unstrap_path = format!("/v1/objects/{}", pa::UNSTRAP_OBJECT);

    // 旧模板不认这条路径：整轮照样成功，只是这一个对象没进清单。
    site.old_template.store(true, Ordering::SeqCst);
    let first = run(&dir, store.clone()).await;
    assert_eq!(first.targets[0].result, "ok", "{:?}", first.targets[0]);
    let manifest: Value =
        serde_json::from_slice(&std::fs::read(push_dir(&dir).join("pa.manifest.json")).unwrap())
            .unwrap();
    assert!(manifest["objects"].get(pa::UNSTRAP_OBJECT).is_none());

    // 站点更新了：下一轮只补这一个（和最后的 status）。
    site.old_template.store(false, Ordering::SeqCst);
    let before = site.requests.lock().unwrap().len();
    let second = run(&dir, store).await;
    assert_eq!(second.targets[0].result, "ok", "{:?}", second.targets[0]);
    let sent: Vec<String> = site.requests.lock().unwrap()[before..]
        .iter()
        .map(|(_, path, _, _)| path.clone())
        .collect();
    assert_eq!(sent, [unstrap_path, "/v1/objects/status.json".to_string()]);
}

#[tokio::test]
async fn a_failed_round_is_retried_next_time() {
    let site = fake_site().await;
    let dir = temp_dir("retry");
    seed_library(&dir);
    write_targets(&dir, &site.base, true);
    let store = store_with_secrets();
    site.status.store(403, Ordering::SeqCst);
    let failed = run(&dir, store.clone()).await;
    assert_eq!(failed.targets[0].result, "failed");
    assert_eq!(
        failed.targets[0].error_code.as_deref(),
        Some("err.push.upload_failed")
    );
    // 4xx 不重试：只发了一个请求就停。
    assert_eq!(site.hits.load(Ordering::SeqCst), 1);
    // 错误信息里没有密钥。
    let message = failed.targets[0].error.clone().unwrap();
    assert!(!message.contains("zbw_"), "{message}");
    assert!(!push_dir(&dir).join("pa.manifest.json").exists());

    site.status.store(200, Ordering::SeqCst);
    let retried = run(&dir, store).await;
    assert_eq!(retried.targets[0].result, "ok");
}

#[tokio::test]
async fn plain_http_sites_and_missing_secrets_never_send() {
    let site = fake_site().await;
    let dir = temp_dir("http");
    seed_library(&dir);
    // dev_loopback 关掉时，http 站点直接被拒。
    let config = serde_json::json!({ "targets": [{
        "id": "pa", "kind": "pa", "enabled": true, "site": site.base
    }]});
    std::fs::write(
        push_dir(&dir).join(TARGETS_FILE),
        serde_json::to_vec(&config).unwrap(),
    )
    .unwrap();
    let report = run(&dir, store_with_secrets()).await;
    assert_eq!(
        report.targets[0].error_code.as_deref(),
        Some("err.push.site_invalid")
    );
    write_targets(&dir, &site.base, true);
    let report = run(&dir, Arc::new(Store::default())).await;
    assert_eq!(
        report.targets[0].error_code.as_deref(),
        Some("err.push.secrets_missing")
    );
    assert_eq!(site.hits.load(Ordering::SeqCst), 0);
}

#[test]
fn config_with_secret_looking_fields_is_rejected() {
    let dir = temp_dir("secret");
    for config in [
        serde_json::json!({ "targets": [{ "id": "pa", "kind": "pa", "site": "x.com", "writeKey": "x" }] }),
        serde_json::json!({ "targets": [{ "id": "pa", "kind": "pa", "site": format!("zbw_{TENANT}_abc") }] }),
        serde_json::json!({ "dk": "x", "targets": [] }),
    ] {
        std::fs::write(
            push_dir(&dir).join(TARGETS_FILE),
            serde_json::to_vec(&config).unwrap(),
        )
        .unwrap();
        assert_eq!(
            load_targets(&dir).unwrap_err().code,
            "err.push.config_has_secret",
            "{config}"
        );
    }
}

#[test]
fn env_credential_store_cannot_hold_push_secrets() {
    struct EnvLike;
    impl CredentialBackend for EnvLike {
        fn set(&self, _: &str, _: &str) -> Result<(), String> {
            Ok(())
        }
        fn get(&self, _: &str) -> Result<Option<String>, String> {
            Ok(Some("zepp-app-token".into()))
        }
        fn delete(&self, _: &str) -> Result<(), String> {
            Ok(())
        }
        fn supports_named_entries(&self) -> bool {
            false
        }
    }
    assert_eq!(
        store_pa_secrets(&EnvLike, "pa", &secrets())
            .unwrap_err()
            .code,
        "err.push.credential_store_unnamed"
    );
    assert!(read_pa_secrets(&EnvLike, "pa").is_err());
    let mut bad = secrets();
    bad.write_key = format!("zbr_{TENANT}_{}", "B".repeat(43));
    assert_eq!(
        store_pa_secrets(&Store::default(), "pa", &bad)
            .unwrap_err()
            .code,
        "err.push.pa_write_key_malformed"
    );
    assert!(!format!("{:?}", secrets()).contains("zbw_"));
}

#[test]
fn connection_code_is_read_from_a_pasted_answer_and_never_lands_in_the_config() {
    let dir = temp_dir("setup");
    let store = Store::default();
    // AI 回答里整段复制过来：前后有字，多一把只读密钥。
    let pasted = format!(
        "好了，连接码是：\n{{\"tenant\":\"{TENANT}\",\"dk\":\"{}\",\"writeKey\":\"{}\",\"readKey\":\"zbr_{TENANT}_{}\"}}\n收好。",
        pa::crypto::b64url(&[9u8; 32]),
        write_key(),
        "C".repeat(43)
    );
    setup::save_connection_code(&store, setup::PA_TARGET_ID, &pasted).unwrap();
    assert!(setup::has_secrets(&store, setup::PA_TARGET_ID));
    let stored = store
        .get(&secret_account(setup::PA_TARGET_ID))
        .unwrap()
        .unwrap();
    assert!(!stored.contains("zbr_"), "the read key must not be kept");

    setup::upsert_pa_target(&dir, "example.com", true).unwrap();
    let config = std::fs::read_to_string(dir.join(PUSH_DIR).join(TARGETS_FILE)).unwrap();
    assert!(
        !config.contains("zbw_") && !config.contains("\"dk\""),
        "{config}"
    );
    let targets = load_targets(&dir).unwrap();
    assert_eq!(targets.len(), 1);
    assert!(targets[0].enabled);

    setup::set_enabled(&dir, setup::PA_TARGET_ID, false).unwrap();
    assert!(!load_targets(&dir).unwrap()[0].enabled);
    setup::remove_target(&dir, &store, setup::PA_TARGET_ID).unwrap();
    assert!(load_targets(&dir).unwrap().is_empty());
    assert!(!setup::has_secrets(&store, setup::PA_TARGET_ID));
}

#[test]
fn bad_connection_codes_and_sites_are_refused_with_a_code() {
    let dir = temp_dir("setup-bad");
    for text in ["", "hello", "{\"dk\":\"x\"}", "{not json}"] {
        let code = setup::parse_connection_code(text).unwrap_err().code;
        assert!(code.starts_with("err.push."), "{text}: {code}");
    }
    assert_eq!(
        setup::upsert_pa_target(&dir, "http://example.com", true)
            .unwrap_err()
            .code,
        "err.push.site_invalid"
    );
    assert!(load_targets(&dir).unwrap().is_empty());
}

#[tokio::test]
async fn reconciles_older_local_edits_and_rebuilds_for_a_new_site() {
    let first = fake_site().await;
    let second = fake_site().await;
    let dir = temp_dir("historical-destination");
    let db = Database::open_migrated(&dir.join("zepp.db")).unwrap();
    let start = Utc::now() - chrono::Duration::days(10);
    seed_workout(&db, "old", start);
    write_targets_for_days(&dir, &first.base, true, 15);
    let store = store_with_secrets();
    assert_eq!(run(&dir, store.clone()).await.targets[0].result, "ok");
    db.edit_workouts(&["old".into()], None, Some(true)).unwrap();
    seed_workout(&db, "backfill", start + chrono::Duration::hours(1));
    first.requests.lock().unwrap().clear();
    assert_eq!(run(&dir, store.clone()).await.targets[0].result, "ok");
    {
        let requests = first.requests.lock().unwrap();
        assert!(requests
            .iter()
            .any(|(method, path, _, _)| method == "DELETE" && path.ends_with("/old.json")));
        assert!(requests
            .iter()
            .any(|(method, path, _, _)| method == "PUT" && path.ends_with("/backfill.json")));
        assert_eq!(requests.last().unwrap().1, "/v1/objects/status.json");
    }
    write_targets_for_days(&dir, &second.base, true, 15);
    assert_eq!(run(&dir, store).await.targets[0].result, "ok");
    let requests = second.requests.lock().unwrap();
    assert!(requests
        .iter()
        .any(|(method, path, _, _)| method == "PUT" && path.ends_with("/backfill.json")));
    assert!(requests.iter().all(|(method, _, _, _)| method != "DELETE"));
}

#[tokio::test]
async fn an_unwritable_manifest_fails_the_round_and_can_retry() {
    let site = fake_site().await;
    let dir = temp_dir("manifest-write-failure");
    seed_library(&dir);
    write_targets(&dir, &site.base, true);
    let manifest = manifest_path(&push_dir(&dir), "pa");
    std::fs::create_dir(&manifest).unwrap();
    let store = store_with_secrets();

    let first = run(&dir, store.clone()).await;
    assert!(site.hits.load(Ordering::SeqCst) > 0);
    assert_eq!(first.targets[0].result, "failed");
    assert_eq!(
        first.targets[0].error_code.as_deref(),
        Some("err.push.state_unwritable")
    );

    std::fs::remove_dir(&manifest).unwrap();
    let second = run(&dir, store).await;
    assert_eq!(second.targets[0].result, "ok");
    assert!(manifest.is_file());
}
