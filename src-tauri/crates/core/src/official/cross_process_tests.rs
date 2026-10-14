//! 跨进程的取消 / 断开 / 刷新（桌面与 CLI / MCP 同时动同一份官方令牌）。
//!
//! 「另一个进程」是真的另一个进程：测试把自己这个测试程序再起一次，只跑
//! [`child_process_entry`]，由环境变量决定它扮演哪个角色。两边共用的凭据存储
//! 是数据目录里的一个假存储（每个条目一个文件），进程内的 `Mutex` 看不见对方，
//! 只有数据目录里的文件锁能让两边排队。
//!
//! 父进程在写回的半中间停住（凭据存储的 `set` 卡住），再让子进程去断开 /
//! 标「要重新授权」：子进程必须等父进程写完才动手，结果只能是「整个在前」或
//! 「整个在后」，不会出现「元数据说已连接、令牌却没了」的半截状态。

use super::*;
use crate::auth::CredentialBackend;
use std::path::{Path, PathBuf};
use std::process::{Child, Command};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::time::Duration;

const ROLE_ENV: &str = "ZEPPBRIDGE_OFFICIAL_CHILD_ROLE";
const DIR_ENV: &str = "ZEPPBRIDGE_OFFICIAL_CHILD_DIR";
const RELAY_ENV: &str = "ZEPPBRIDGE_OFFICIAL_CHILD_RELAY";
const CHILD_TEST: &str = "official::cross_process_tests::child_process_entry";

/// 假凭据存储：每个条目是 `secrets/` 下的一个文件，另一个进程也读得到。
struct DiskBackend {
    dir: PathBuf,
}

impl DiskBackend {
    fn new(data_dir: &Path) -> Self {
        let dir = data_dir.join("secrets");
        std::fs::create_dir_all(&dir).unwrap();
        Self { dir }
    }

    fn path(&self, key: &str) -> PathBuf {
        self.dir.join(key.replace(':', "_"))
    }

    fn count(&self) -> usize {
        std::fs::read_dir(&self.dir).map_or(0, |entries| entries.count())
    }
}

impl CredentialBackend for DiskBackend {
    fn set(&self, key: &str, token: &str) -> std::result::Result<(), String> {
        std::fs::write(self.path(key), token).map_err(|error| error.to_string())
    }
    fn get(&self, key: &str) -> std::result::Result<Option<String>, String> {
        match std::fs::read_to_string(self.path(key)) {
            Ok(token) => Ok(Some(token)),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(error) => Err(error.to_string()),
        }
    }
    fn delete(&self, key: &str) -> std::result::Result<(), String> {
        match std::fs::remove_file(self.path(key)) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(error.to_string()),
        }
    }
    fn supports_named_entries(&self) -> bool {
        true
    }
}

/// 在写某个条目之前停住：先报「到了」，等放行再写。
struct PausingBackend {
    inner: DiskBackend,
    key: String,
    gate: Mutex<Option<(mpsc::Sender<()>, mpsc::Receiver<()>)>>,
}

impl CredentialBackend for PausingBackend {
    fn set(&self, key: &str, token: &str) -> std::result::Result<(), String> {
        if key == self.key {
            if let Some((reached, release)) = self.gate.lock().unwrap().take() {
                reached.send(()).unwrap();
                release.recv().unwrap();
            }
        }
        self.inner.set(key, token)
    }
    fn get(&self, key: &str) -> std::result::Result<Option<String>, String> {
        self.inner.get(key)
    }
    fn delete(&self, key: &str) -> std::result::Result<(), String> {
        self.inner.delete(key)
    }
    fn supports_named_entries(&self) -> bool {
        true
    }
}

fn temp_dir() -> PathBuf {
    let dir = std::env::temp_dir().join(format!(
        "zeppbridge-official-xproc-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

fn used() -> OfficialTokens {
    OfficialTokens {
        access_token: "access-used".into(),
        refresh_token: Some("refresh-used".into()),
        expires_at: Some(10_000),
        user_id: "3000000002".into(),
    }
}

fn fresh() -> OfficialTokens {
    OfficialTokens {
        access_token: "access-fresh".into(),
        refresh_token: Some("refresh-fresh".into()),
        expires_at: Some(20_000),
        ..used()
    }
}

fn spawn_child(role: &str, dir: &Path, relay: Option<&str>) -> Child {
    let mut command = Command::new(std::env::current_exe().unwrap());
    command
        .args([CHILD_TEST, "--exact", "--test-threads", "1", "--nocapture"])
        .env(ROLE_ENV, role)
        .env(DIR_ENV, dir);
    if let Some(relay) = relay {
        command.env(RELAY_ENV, relay);
    }
    command.spawn().unwrap()
}

fn wait_success(mut child: Child) {
    let deadline = std::time::Instant::now() + Duration::from_secs(60);
    loop {
        if let Some(status) = child.try_wait().unwrap() {
            assert!(status.success(), "子进程失败：{status}");
            return;
        }
        assert!(std::time::Instant::now() < deadline, "子进程一直没结束");
        std::thread::sleep(Duration::from_millis(50));
    }
}

/// 子进程的入口。平常跑测试时没有角色变量，直接通过。
#[test]
fn child_process_entry() {
    let Ok(role) = std::env::var(ROLE_ENV) else {
        return;
    };
    let dir = PathBuf::from(std::env::var(DIR_ENV).unwrap());
    let store = OfficialStore::with_backend(&dir, Arc::new(DiskBackend::new(&dir)));
    match role.as_str() {
        "disconnect" => store.disconnect().unwrap(),
        "revoke" => {
            store.mark_needs_reauth_if_current(&used()).unwrap();
        }
        "refresh" => {
            let relay = std::env::var(RELAY_ENV).unwrap();
            let client = OfficialClient::with_bases(&relay, &relay).unwrap();
            let runtime = tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
                .unwrap();
            let tokens = runtime
                .block_on(fresh_tokens(&store, &client, 10_000))
                .unwrap()
                .unwrap();
            assert_eq!(tokens.refresh_token.as_deref(), Some("refresh-1"));
        }
        other => panic!("未知角色 {other}"),
    }
}

/// 父进程开始刷新写回、停在写刷新令牌之前，这期间起扮演 `role` 的子进程。
/// 返回写回的结果。子进程在父进程放行前必须一直等着（排在锁后面）。
fn race_refresh_write_back(dir: &Path, role: &str) -> bool {
    OfficialStore::with_backend(dir, Arc::new(DiskBackend::new(dir)))
        .save(&used(), 1)
        .unwrap();
    let (reached_tx, reached_rx) = mpsc::channel();
    let (release_tx, release_rx) = mpsc::channel();
    let backend = Arc::new(PausingBackend {
        inner: DiskBackend::new(dir),
        key: "official:3000000002:refresh".into(),
        gate: Mutex::new(Some((reached_tx, release_rx))),
    });
    let store = OfficialStore::with_backend(dir, backend);
    let writer = std::thread::spawn(move || store.replace_if_current(&used(), &fresh(), 5));
    reached_rx.recv_timeout(Duration::from_secs(10)).unwrap();

    let mut child = spawn_child(role, dir, None);
    // 给子进程足够的时间启动并撞上锁；它这时候要是已经结束了，说明它没排队。
    std::thread::sleep(Duration::from_millis(1500));
    assert!(
        child.try_wait().unwrap().is_none(),
        "另一个进程没有等这边写完就动手了"
    );
    release_tx.send(()).unwrap();
    let written = writer.join().unwrap().unwrap();
    wait_success(child);
    written
}

/// 桌面断开时 CLI 正在刷新：断开排在写回之后，最后是干干净净的「未连接」——
/// 不会留下「元数据说已连接、令牌却没了」，更不会把令牌写回已断开的账号。
#[test]
fn a_disconnect_in_another_process_never_lands_inside_a_refresh_write_back() {
    let dir = temp_dir();
    assert!(race_refresh_write_back(&dir, "disconnect"));
    let store = OfficialStore::with_backend(&dir, Arc::new(DiskBackend::new(&dir)));
    assert!(store.meta().unwrap().is_none());
    assert!(store.load().unwrap().is_none());
    assert_eq!(DiskBackend::new(&dir).count(), 0);
    let _ = std::fs::remove_dir_all(dir);
}

/// 另一个进程拿旧刷新令牌被拒（要重新授权），而这边刚刷新成功：拒绝排在写回
/// 之后，核对时库里已经是新令牌，于是什么也不做——新令牌不会被抹掉。
#[test]
fn a_revocation_in_another_process_cannot_wipe_a_refresh_written_here() {
    let dir = temp_dir();
    assert!(race_refresh_write_back(&dir, "revoke"));
    let store = OfficialStore::with_backend(&dir, Arc::new(DiskBackend::new(&dir)));
    assert_eq!(store.load().unwrap(), Some(fresh()));
    assert!(!store.meta().unwrap().unwrap().needs_reauth);
    let _ = std::fs::remove_dir_all(dir);
}

/// 假中转站：第一个刷新请求要等第二个请求到了（或等满 3 秒）才回。没有跨进程
/// 单飞时，子进程的第二次刷新会在这 3 秒里到达。
async fn waiting_relay() -> (String, Arc<AtomicUsize>) {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    let hits = Arc::new(AtomicUsize::new(0));
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
                let n = counter.fetch_add(1, Ordering::SeqCst) + 1;
                for _ in 0..60 {
                    if counter.load(Ordering::SeqCst) > 1 {
                        break;
                    }
                    tokio::time::sleep(Duration::from_millis(50)).await;
                }
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

/// 桌面和 CLI 同时发现令牌到期：同一把刷新令牌只拿去换一次，后到的进程等前
/// 一个换完、直接用库里的新令牌。
#[tokio::test]
async fn two_processes_spend_a_refresh_token_only_once() {
    let dir = temp_dir();
    let store = OfficialStore::with_backend(&dir, Arc::new(DiskBackend::new(&dir)));
    store.save(&used(), 1).unwrap();
    let (base, hits) = waiting_relay().await;
    let client = OfficialClient::with_bases(&base, &base).unwrap();

    let child = spawn_child("refresh", &dir, Some(&base));
    let tokens = fresh_tokens(&store, &client, 10_000)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(tokens.refresh_token.as_deref(), Some("refresh-1"));
    tokio::task::spawn_blocking(move || wait_success(child))
        .await
        .unwrap();
    assert_eq!(hits.load(Ordering::SeqCst), 1);
    let _ = std::fs::remove_dir_all(dir);
}
