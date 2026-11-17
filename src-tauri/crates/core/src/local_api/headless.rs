//! 无头版的常驻只读服务（`zeppbridge-cli serve`）。
//!
//! 和桌面端的 [`LocalApiController`] 共用同一套 HTTP 处理和路由，区别只在三处：
//!
//! - **监听地址**由用户用 [`LISTEN_ENV`] 显式指定，不设就只听 `127.0.0.1`。桌面端
//!   没有这个入口：那边的地址写死在 [`LOCAL_API_ADDRESS`]，任何设置都改不了。
//! - **鉴权用拉取 token**，和桌面端的本机 token 是两把钥匙：拉取 token 只能读
//!   `/v1/*` 和 `/health`，可以单独换掉或吊销。监听非回环地址时必须有它，否则拒绝启动。
//! - **按来源 IP 限流**，防同网段的设备暴力试 token。
//!
//! 传输是明文 HTTP。跨机器访问要放在反向代理（HTTPS）或容器内部网络后面，
//! 启动时会把这句话写进日志。

use super::limit::RateLimiter;
use super::*;
use std::net::SocketAddr;

/// 监听地址的环境变量，例如 `0.0.0.0:43921`。不设 = `127.0.0.1:43921`。
pub const LISTEN_ENV: &str = "ZEPPBRIDGE_LISTEN";

/// 直接给出拉取 token 的环境变量（Docker 里最顺手：和 Sparky 的配置写在同一个 .env）。
pub const PULL_TOKEN_ENV: &str = "ZEPPBRIDGE_PULL_TOKEN";

/// 凭据存储里拉取 token 的账号名。和本机 token（[`LOCAL_API_CREDENTIAL_ACCOUNT`]）分开。
pub const PULL_CREDENTIAL_ACCOUNT: &str = "local-api-pull-token";

/// 自己给的 token 至少这么长：短 token 在局域网里几分钟就能被试出来。
pub const MIN_PULL_TOKEN_CHARS: usize = 32;

/// 无头版每个来源每分钟的请求上限。
pub const HEADLESS_REQUESTS_PER_MINUTE: u32 = 120;

const PULL_TOKEN_PREFIX: &str = "zbp_";

/// 凭据存储里的 token 多久重读一次：吊销后几秒内生效，不用重启服务。
const TOKEN_REFRESH: Duration = Duration::from_secs(5);

/// 拉取 token 从哪来。
#[derive(Clone)]
pub enum PullTokenSource {
    /// 环境变量里的固定值。换掉它要重启服务。
    Env(String),
    /// 凭据存储（`zeppbridge-cli pull-token` 管理）。服务运行中会定期重读。
    Store(Arc<dyn CredentialBackend>),
}

impl std::fmt::Debug for PullTokenSource {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Env(_) => f.write_str("PullTokenSource::Env(<redacted>)"),
            Self::Store(_) => f.write_str("PullTokenSource::Store"),
        }
    }
}

/// 为什么没能启动。`code` 是稳定码，`message` 是给人看的英文。
#[derive(Debug)]
pub enum HeadlessError {
    InvalidListen(String),
    NeedsToken,
    WeakToken,
    Credentials(String),
    Bind(io::Error),
}

impl HeadlessError {
    pub fn code(&self) -> &'static str {
        match self {
            Self::InvalidListen(_) => "invalid_listen_address",
            Self::NeedsToken => "pull_token_required",
            Self::WeakToken => "pull_token_too_short",
            Self::Credentials(_) => "credential_store_unavailable",
            Self::Bind(error) if error.kind() == io::ErrorKind::AddrInUse => "port_in_use",
            Self::Bind(_) => "bind_failed",
        }
    }

    pub fn message(&self) -> String {
        match self {
            Self::InvalidListen(value) => format!(
                "{LISTEN_ENV}={value} is not an address like 127.0.0.1:43921 or 0.0.0.0:43921"
            ),
            Self::NeedsToken => format!(
                "Refusing to listen beyond this machine without a pull token. Set {PULL_TOKEN_ENV} \
                 (at least {MIN_PULL_TOKEN_CHARS} characters) or create one with `zeppbridge-cli pull-token rotate`."
            ),
            Self::WeakToken => format!(
                "{PULL_TOKEN_ENV} is shorter than {MIN_PULL_TOKEN_CHARS} characters; use a long random value"
            ),
            Self::Credentials(reason) => format!("The credential store is unavailable: {reason}"),
            Self::Bind(error) => format!("Could not listen: {error}"),
        }
    }
}

/// 解析 [`LISTEN_ENV`]。`None` 或空白 = 只听本机。
pub fn parse_listen(value: Option<&str>) -> Result<SocketAddr, HeadlessError> {
    let text = value.map(str::trim).filter(|value| !value.is_empty());
    let text = text.unwrap_or(LOCAL_API_ADDRESS);
    text.parse::<SocketAddr>()
        .map_err(|_| HeadlessError::InvalidListen(text.to_string()))
}

/// 拉取 token 只能存在能按名字分条的存储里。环境变量后端不管问什么名字都回答
/// Zepp 的 App Token——把它当拉取 token 等于把账号令牌交给局域网。
fn named_store(credentials: &dyn CredentialBackend) -> Result<(), String> {
    if credentials.supports_named_entries() {
        Ok(())
    } else {
        Err(format!(
            "this credential store cannot hold a separate pull token; set {PULL_TOKEN_ENV} instead"
        ))
    }
}

pub fn read_pull_token(credentials: &dyn CredentialBackend) -> Result<Option<String>, String> {
    named_store(credentials)?;
    Ok(credentials
        .get(PULL_CREDENTIAL_ACCOUNT)?
        .filter(|token| !token.trim().is_empty()))
}

/// 生成新的拉取 token 并存下。旧的立即作废（运行中的服务几秒内跟上）。
pub fn rotate_pull_token(credentials: &dyn CredentialBackend) -> Result<String, String> {
    named_store(credentials)?;
    let mut bytes = [0u8; TOKEN_RANDOM_BYTES];
    getrandom::getrandom(&mut bytes).map_err(|_| "no secure random source".to_string())?;
    let token = format!("{PULL_TOKEN_PREFIX}{}", hex::encode(bytes));
    credentials.set(PULL_CREDENTIAL_ACCOUNT, &token)?;
    Ok(token)
}

/// 吊销：删掉拉取 token。本机 token 不受影响。
pub fn revoke_pull_token(credentials: &dyn CredentialBackend) -> Result<(), String> {
    named_store(credentials)?;
    credentials.delete(PULL_CREDENTIAL_ACCOUNT)
}

/// 运行中的无头服务。
pub struct HeadlessServer {
    pub local_addr: SocketAddr,
    /// 这次启动时自动生成了新的拉取 token（回环监听且之前没有）。
    pub created_token: bool,
    stop: Arc<AtomicBool>,
    handle: Option<std::thread::JoinHandle<()>>,
}

impl HeadlessServer {
    /// 让服务停下来（accept 循环最多再睡一轮就退出）。
    pub fn stop_flag(&self) -> Arc<AtomicBool> {
        self.stop.clone()
    }

    /// accept 循环还活着。
    pub fn is_running(&self) -> bool {
        self.handle
            .as_ref()
            .is_some_and(|handle| !handle.is_finished())
    }

    /// 等服务退出。
    pub fn wait(mut self) {
        if let Some(handle) = self.handle.take() {
            let _ = handle.join();
        }
    }
}

/// 启动无头服务。返回时已经在监听。
pub fn start_headless(
    data_dir: PathBuf,
    listen: SocketAddr,
    source: PullTokenSource,
) -> Result<HeadlessServer, HeadlessError> {
    let remote = !listen.ip().is_loopback();
    let mut created_token = false;
    let token = match &source {
        PullTokenSource::Env(value) => {
            let value = value.trim().to_string();
            if value.chars().count() < MIN_PULL_TOKEN_CHARS {
                return Err(HeadlessError::WeakToken);
            }
            value
        }
        PullTokenSource::Store(credentials) => {
            match read_pull_token(credentials.as_ref()).map_err(HeadlessError::Credentials)? {
                Some(value) => value,
                None if remote => return Err(HeadlessError::NeedsToken),
                None => {
                    // 只听本机时没有 token 就生成一个：仍然不开放未鉴权的访问。
                    created_token = true;
                    rotate_pull_token(credentials.as_ref()).map_err(HeadlessError::Credentials)?
                }
            }
        }
    };

    let listener = TcpListener::bind(listen).map_err(HeadlessError::Bind)?;
    let local_addr = listener.local_addr().map_err(HeadlessError::Bind)?;
    listener
        .set_nonblocking(true)
        .map_err(HeadlessError::Bind)?;

    let stop = Arc::new(AtomicBool::new(false));
    let tokens = Arc::new(RwLock::new(TokenSet {
        local: None,
        pull: Some(token),
    }));
    if let PullTokenSource::Store(credentials) = source {
        spawn_token_refresher(credentials, tokens.clone(), stop.clone());
    }
    let context = Arc::new(ServerContext {
        data_dir,
        tokens,
        allow_remote: true,
        limiter: RateLimiter::new(Some(HEADLESS_REQUESTS_PER_MINUTE)),
        cache: v1::RecordsCache::default(),
        log_requests: true,
    });
    let thread_stop = stop.clone();
    let handle = std::thread::Builder::new()
        .name("zeppbridge-serve".to_string())
        .spawn(move || serve(listener, context, thread_stop))
        .map_err(HeadlessError::Bind)?;
    Ok(HeadlessServer {
        local_addr,
        created_token,
        stop,
        handle: Some(handle),
    })
}

fn spawn_token_refresher(
    credentials: Arc<dyn CredentialBackend>,
    tokens: Arc<RwLock<TokenSet>>,
    stop: Arc<AtomicBool>,
) {
    let _ = std::thread::Builder::new()
        .name("zeppbridge-serve-token".to_string())
        .spawn(move || {
            let mut waited = Duration::ZERO;
            while !stop.load(Ordering::SeqCst) {
                std::thread::sleep(ACCEPT_POLL_INTERVAL);
                waited += ACCEPT_POLL_INTERVAL;
                if waited < TOKEN_REFRESH {
                    continue;
                }
                waited = Duration::ZERO;
                // 读不到（存储暂时不可用）就保持原样；明确读到「没有」才吊销。
                if let Ok(current) = read_pull_token(credentials.as_ref()) {
                    let mut guard = tokens.write().unwrap_or_else(|e| e.into_inner());
                    if guard.pull != current {
                        guard.pull = current;
                        eprintln!("serve: pull token changed in the credential store; applied");
                    }
                }
            }
        });
}

/// 启动时写给运维看的那几句话（不含 token）。
pub fn startup_notes(local_addr: SocketAddr) -> Vec<String> {
    let mut notes = vec![format!(
        "Read-only API listening on http://{local_addr} (routes: /v1/records, /v1, /health)"
    )];
    if !local_addr.ip().is_loopback() {
        notes.push(
            "Plaintext HTTP: keep it on a private container network, and put a reverse proxy \
             with HTTPS in front for access from other machines."
                .to_string(),
        );
    }
    notes
}
