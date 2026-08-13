use crate::models::error::{Result, ZeppBridgeError};
use chrono::Utc;
use directories::ProjectDirs;
use hudsucker::{
    certificate_authority::RcgenAuthority,
    rcgen::{CertificateParams, DistinguishedName, DnType, IsCa, Issuer, KeyPair},
    rustls::crypto::aws_lc_rs,
    Body, HttpContext, HttpHandler, Proxy, RequestOrResponse,
};
use local_ip_address::list_afinet_netifas;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::HashSet,
    fmt,
    fs::{self, OpenOptions},
    io::{self, Write},
    net::{IpAddr, Ipv4Addr, SocketAddr},
    path::{Path, PathBuf},
    sync::{Arc, Mutex, MutexGuard},
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tokio::{
    net::TcpListener,
    sync::{oneshot, watch},
    task::JoinHandle,
};

pub const DEFAULT_PROXY_PORT: u16 = 8888;
#[allow(dead_code)]
const DEFAULT_CAPTURE_TIMEOUT: Duration = Duration::from_secs(5 * 60);
const CA_CERT_FILENAME: &str = "zeppbridge-ca.cer";
const CA_PEM_FILENAME: &str = "zeppbridge-ca.pem";
/// Legacy releases wrote this file temporarily.  It is read only for a
/// one-time migration into the platform credential store and is never written
/// by the current implementation.
const CA_KEY_FILENAME: &str = "zeppbridge-ca.key";
const CA_DOWNLOAD_PATH: &str = "/zeppbridge-ca.cer";
const CA_KEY_SERVICE: &str = "com.zeppbridge.ca";

/// Captured credentials.  The token is intentionally redacted from `Debug`
/// output so an accidental diagnostic log cannot disclose it.
#[derive(Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct CapturedAuth {
    pub app_token: String,
    pub user_id: String,
    pub region_host: String,
}

impl fmt::Debug for CapturedAuth {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("CapturedAuth")
            .field("app_token", &"<redacted>")
            .field("user_id", &"<redacted>")
            .field("region_host", &self.region_host)
            .finish()
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ProxyLifecycle {
    Stopped,
    Starting,
    Running,
    Stopping,
    Error,
}

/// Status returned to the UI/integration layer.  The private CA key is never
/// represented here; only the installable public certificate paths are.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ProxyStatus {
    pub lifecycle: ProxyLifecycle,
    pub running: bool,
    pub listen_address: Option<String>,
    pub port: Option<u16>,
    pub local_ipv4: Vec<String>,
    pub certificate_path: Option<String>,
    pub certificate_pem_path: Option<String>,
    pub certificate_url: Option<String>,
    pub captured: bool,
    pub error: Option<String>,
    pub firewall_warning: Option<String>,
    pub certificate_trust_warning: Option<String>,
    pub phone_connect_count: u64,
    pub zepp_connect_count: u64,
    pub zepp_tls_hello_count: u64,
    pub zepp_http_request_count: u64,
    pub token_seen: bool,
    pub user_id_seen: bool,
    pub last_zepp_host: Option<String>,
    pub last_activity_at: Option<String>,
    pub updated_at: String,
}

impl Default for ProxyStatus {
    fn default() -> Self {
        Self {
            lifecycle: ProxyLifecycle::Stopped,
            running: false,
            listen_address: None,
            port: None,
            local_ipv4: usable_ipv4_addresses()
                .into_iter()
                .map(|ip| ip.to_string())
                .collect(),
            certificate_path: None,
            certificate_pem_path: None,
            certificate_url: None,
            captured: false,
            error: None,
            firewall_warning: Some(
                "系统防火墙或网络隔离可能阻止手机连接；本应用不会自动创建防火墙规则".to_string(),
            ),
            certificate_trust_warning: Some(
                "HTTPS 捕获需要在手机上安装导出的根证书；证书固定或未信任时请求不会被解密"
                    .to_string(),
            ),
            phone_connect_count: 0,
            zepp_connect_count: 0,
            zepp_tls_hello_count: 0,
            zepp_http_request_count: 0,
            token_seen: false,
            user_id_seen: false,
            last_zepp_host: None,
            last_activity_at: None,
            updated_at: Utc::now().to_rfc3339(),
        }
    }
}

impl ProxyStatus {
    fn reset_diagnostics(&mut self) {
        self.phone_connect_count = 0;
        self.zepp_connect_count = 0;
        self.zepp_tls_hello_count = 0;
        self.zepp_http_request_count = 0;
        self.token_seen = false;
        self.user_id_seen = false;
        self.last_zepp_host = None;
        self.last_activity_at = None;
    }
}

struct RuntimeState {
    status: ProxyStatus,
    stop: Option<oneshot::Sender<()>>,
    task: Option<JoinHandle<std::result::Result<(), String>>>,
}

/// Persistent store for the local CA private key.
///
/// The key is addressed by a deterministic, non-sensitive identity derived
/// from the proxy data directory.  Implementations must keep the key out of
/// ordinary files and must not include secret material in returned errors.
pub trait CaKeyStore: Send + Sync {
    fn load(&self, identity: &str) -> std::result::Result<Option<Vec<u8>>, String>;
    fn store(&self, identity: &str, key: &[u8]) -> std::result::Result<(), String>;
}

#[cfg(windows)]
#[derive(Debug, Default)]
pub struct WindowsCredentialCaKeyStore;

#[cfg(windows)]
impl CaKeyStore for WindowsCredentialCaKeyStore {
    fn load(&self, identity: &str) -> std::result::Result<Option<Vec<u8>>, String> {
        let entry = keyring::Entry::new(CA_KEY_SERVICE, identity)
            .map_err(|_| "无法打开 Windows 凭据管理器中的代理根密钥条目".to_string())?;
        match entry.get_secret() {
            Ok(secret) => Ok(Some(secret)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(_) => Err("无法读取 Windows 凭据管理器中的代理根密钥".to_string()),
        }
    }

    fn store(&self, identity: &str, key: &[u8]) -> std::result::Result<(), String> {
        let entry = keyring::Entry::new(CA_KEY_SERVICE, identity)
            .map_err(|_| "无法打开 Windows 凭据管理器中的代理根密钥条目".to_string())?;
        entry
            .set_secret(key)
            .map_err(|_| "无法写入 Windows 凭据管理器中的代理根密钥".to_string())
    }
}

#[cfg(not(windows))]
#[derive(Debug, Default)]
struct UnavailableCaKeyStore;

#[cfg(not(windows))]
impl CaKeyStore for UnavailableCaKeyStore {
    fn load(&self, _identity: &str) -> std::result::Result<Option<Vec<u8>>, String> {
        Err("代理根密钥需要 Windows 凭据管理器；测试请注入 CaKeyStore".to_string())
    }

    fn store(&self, _identity: &str, _key: &[u8]) -> std::result::Result<(), String> {
        Err("代理根密钥需要 Windows 凭据管理器；测试请注入 CaKeyStore".to_string())
    }
}

fn default_ca_key_store() -> Arc<dyn CaKeyStore> {
    #[cfg(windows)]
    {
        Arc::new(WindowsCredentialCaKeyStore)
    }
    #[cfg(not(windows))]
    {
        Arc::new(UnavailableCaKeyStore)
    }
}

/// A local HTTP/HTTPS MITM proxy.  It only binds after `start` is called and
/// releases the listener after `stop` (or when the object is dropped).
pub struct ProxyServer {
    port: u16,
    data_dir: PathBuf,
    ca_key_store: Arc<dyn CaKeyStore>,
    accumulator: Arc<Mutex<CaptureAccumulator>>,
    runtime: Arc<Mutex<RuntimeState>>,
    captured_tx: watch::Sender<Option<CapturedAuth>>,
    captured_rx: watch::Receiver<Option<CapturedAuth>>,
}

impl fmt::Debug for ProxyServer {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("ProxyServer")
            .field("port", &self.port)
            .field("status", &self.status())
            .finish()
    }
}

impl ProxyServer {
    pub fn new(port: u16) -> Self {
        let data_dir = ProjectDirs::from("com", "zeppbridge", "ZeppBridge")
            .map(|dirs| dirs.data_dir().to_path_buf())
            .unwrap_or_else(|| std::env::temp_dir().join("ZeppBridge"));
        Self::with_data_dir(port, data_dir)
    }

    pub fn with_data_dir(port: u16, data_dir: PathBuf) -> Self {
        Self::with_data_dir_and_ca_key_store(port, data_dir, default_ca_key_store())
    }

    /// Construct a proxy with an injected CA key store.  Production callers
    /// should use [`Self::with_data_dir`], which uses Windows Credential
    /// Manager; tests and embedders can provide a deterministic store here.
    pub fn with_data_dir_and_ca_key_store(
        port: u16,
        data_dir: PathBuf,
        ca_key_store: Arc<dyn CaKeyStore>,
    ) -> Self {
        let (captured_tx, captured_rx) = watch::channel(None);
        let accumulator = Arc::new(Mutex::new(CaptureAccumulator::default()));
        Self {
            port,
            data_dir,
            ca_key_store,
            accumulator,
            runtime: Arc::new(Mutex::new(RuntimeState {
                status: ProxyStatus::default(),
                stop: None,
                task: None,
            })),
            captured_tx,
            captured_rx,
        }
    }

    #[allow(dead_code)]
    pub fn new_with_data_dir(port: u16, data_dir: PathBuf) -> Self {
        Self::with_data_dir(port, data_dir)
    }

    /// Start the MITM proxy.  Calling this while already running is idempotent
    /// and returns the current status; calling it while stopping is rejected.
    pub async fn start(&self) -> Result<ProxyStatus> {
        {
            let mut state = recover_lock(&self.runtime);
            match state.status.lifecycle {
                ProxyLifecycle::Running | ProxyLifecycle::Starting => {
                    return Ok(state.status.clone())
                }
                ProxyLifecycle::Stopping => {
                    return Err(ZeppBridgeError::ConfigError(
                        "代理正在停止，请稍后重试".to_string(),
                    ))
                }
                ProxyLifecycle::Stopped | ProxyLifecycle::Error => {
                    // A fresh start begins a new diagnostic session.  Keep the
                    // prior captured value neither in the candidate set nor in
                    // the capture watch: a new session must not expose stale
                    // credentials to the UI or command layer.
                    state.status.reset_diagnostics();
                    *recover_lock(&self.accumulator) = CaptureAccumulator::default();
                    let _ = self.captured_tx.send(None);
                }
            }
        }

        let ca = match load_or_generate_ca(&self.data_dir, Arc::clone(&self.ca_key_store)) {
            Ok(ca) => ca,
            Err(error) => {
                self.mark_error(error.to_string());
                return Err(error);
            }
        };

        let listener = match TcpListener::bind(SocketAddr::from(([0, 0, 0, 0], self.port))).await {
            Ok(listener) => listener,
            Err(error) => {
                let error = ZeppBridgeError::ConfigError(format!("无法监听代理端口: {error}"));
                self.mark_error(error.to_string());
                return Err(error);
            }
        };
        let listen_address = listener.local_addr().map_err(ZeppBridgeError::IoError)?;
        let certificate_path = self.data_dir.join(CA_CERT_FILENAME);
        let certificate_pem_path = self.data_dir.join(CA_PEM_FILENAME);

        let (stop_tx, stop_rx) = oneshot::channel();
        let handler = CaptureHandler::with_accumulator(
            self.captured_tx.clone(),
            Arc::clone(&ca.certificate_der),
            Arc::clone(&self.runtime),
            Arc::clone(&self.accumulator),
        );
        let proxy = match Proxy::builder()
            .with_listener(listener)
            .with_ca(ca.authority)
            .with_rustls_connector(aws_lc_rs::default_provider())
            .with_http_handler(handler)
            .with_graceful_shutdown(async move {
                let _ = stop_rx.await;
            })
            .build()
        {
            Ok(proxy) => proxy,
            Err(error) => {
                let error = ZeppBridgeError::ConfigError(format!("无法构建 HTTPS 代理: {error}"));
                self.mark_error(error.to_string());
                return Err(error);
            }
        };

        let task_runtime = Arc::clone(&self.runtime);
        let task = tokio::spawn(async move {
            let result = proxy.start().await.map_err(|error| error.to_string());
            if let Err(error) = &result {
                let mut state = recover_lock(&task_runtime);
                state.status.lifecycle = ProxyLifecycle::Error;
                state.status.running = false;
                state.status.error = Some(error.clone());
                state.status.updated_at = Utc::now().to_rfc3339();
            }
            result
        });

        let status = {
            let mut state = recover_lock(&self.runtime);
            state.status.lifecycle = ProxyLifecycle::Running;
            state.status.running = true;
            state.status.listen_address = Some(listen_address.to_string());
            state.status.port = Some(listen_address.port());
            state.status.local_ipv4 = usable_ipv4_addresses()
                .into_iter()
                .map(|ip| ip.to_string())
                .collect();
            state.status.certificate_path = Some(certificate_path.to_string_lossy().into_owned());
            state.status.certificate_pem_path =
                Some(certificate_pem_path.to_string_lossy().into_owned());
            state.status.certificate_url = state
                .status
                .local_ipv4
                .first()
                .zip(state.status.port)
                .map(|(ip, port)| format!("http://{ip}:{port}{CA_DOWNLOAD_PATH}"));
            state.status.error = None;
            state.status.captured = self.captured_rx.borrow().is_some();
            state.status.updated_at = Utc::now().to_rfc3339();
            state.stop = Some(stop_tx);
            state.task = Some(task);
            state.status.clone()
        };

        Ok(status)
    }

    /// Start the proxy and wait for the first complete credential capture.
    #[allow(dead_code)]
    pub async fn start_and_capture(&self) -> Result<CapturedAuth> {
        self.start().await?;
        self.wait_for_capture(DEFAULT_CAPTURE_TIMEOUT).await
    }

    #[allow(dead_code)]
    pub async fn wait_for_capture(&self, timeout: Duration) -> Result<CapturedAuth> {
        let mut receiver = self.captured_rx.clone();
        let wait = async move {
            loop {
                if let Some(captured) = receiver.borrow().clone() {
                    return Ok(captured);
                }
                receiver
                    .changed()
                    .await
                    .map_err(|_| ZeppBridgeError::DataUnavailable("代理已停止".to_string()))?;
            }
        };
        tokio::time::timeout(timeout, wait)
            .await
            .map_err(|_| ZeppBridgeError::DataUnavailable("等待手机捕获认证超时".to_string()))?
    }

    /// Stop the listener and wait for active connections to drain.  A second
    /// stop is harmless and returns the stopped status.
    pub async fn stop(&self) -> Result<ProxyStatus> {
        let (stop, task) = {
            let mut state = recover_lock(&self.runtime);
            if matches!(
                state.status.lifecycle,
                ProxyLifecycle::Stopped | ProxyLifecycle::Error
            ) {
                return Ok(state.status.clone());
            }
            state.status.lifecycle = ProxyLifecycle::Stopping;
            state.status.running = false;
            state.status.updated_at = Utc::now().to_rfc3339();
            (state.stop.take(), state.task.take())
        };

        if let Some(stop) = stop {
            let _ = stop.send(());
        }
        if let Some(task) = task {
            let _ = tokio::time::timeout(Duration::from_secs(10), task).await;
        }

        let mut state = recover_lock(&self.runtime);
        state.status.lifecycle = ProxyLifecycle::Stopped;
        state.status.running = false;
        state.status.listen_address = None;
        state.status.port = None;
        state.status.certificate_url = None;
        state.status.updated_at = Utc::now().to_rfc3339();
        Ok(state.status.clone())
    }

    pub fn status(&self) -> ProxyStatus {
        let mut status = recover_lock(&self.runtime).status.clone();
        status.captured = self.captured_rx.borrow().is_some();
        status
    }

    #[allow(dead_code)]
    pub fn subscribe_captured(&self) -> watch::Receiver<Option<CapturedAuth>> {
        self.captured_tx.subscribe()
    }

    pub fn captured(&self) -> Option<CapturedAuth> {
        self.captured_rx.borrow().clone()
    }

    /// Complete a partial capture with a user-supplied account identifier.
    ///
    /// Only the identifier is accepted from the caller.  The app token and
    /// region origin must already have been observed together by this proxy;
    /// they are never supplied by, logged from, or fused with another host.
    /// The returned value is internal to the command layer and its `Debug`
    /// implementation redacts both credentials.
    pub(crate) fn supply_user_id(&self, user_id: &str) -> Result<CapturedAuth> {
        {
            let state = recover_lock(&self.runtime);
            if !state.status.running || state.status.lifecycle != ProxyLifecycle::Running {
                return Err(ZeppBridgeError::DataUnavailable(
                    "捕获代理未运行，请先启动捕获后再补充用户 ID".to_string(),
                ));
            }
        }

        let user_id = sanitize_user_id(user_id)
            .ok_or_else(|| ZeppBridgeError::ConfigError("用户 ID 为空或格式无效".to_string()))?;

        let (captured, token_seen, user_id_seen) = {
            let mut accumulator = recover_lock(&self.accumulator);
            let Some(candidate_index) = accumulator.latest_token_candidate_index() else {
                return Err(ZeppBridgeError::DataUnavailable(
                    "尚未捕获带令牌的区域请求，请先让 Zepp 通过代理访问健康数据".to_string(),
                ));
            };

            let candidate = accumulator
                .candidates
                .get_mut(candidate_index)
                .expect("candidate index came from latest_token_candidate_index");

            // The accumulator normally enforces this invariant in
            // `CaptureHandler::observe`; retaining the check here prevents a
            // future caller from accidentally combining values from two
            // regional origins.
            if candidate.region_host != format!("https://{}", candidate.host_key) {
                return Err(ZeppBridgeError::ConfigError(
                    "捕获请求的区域主机不一致，请重新开始捕获".to_string(),
                ));
            }

            // Keep the token borrowed only for the completeness check above;
            // `complete_capture` clones it into the internal capture object.
            candidate.user_id = Some(user_id);
            let captured = complete_capture(candidate, &self.captured_tx).ok_or_else(|| {
                ZeppBridgeError::DataUnavailable(
                    "认证信息尚未完整，请重新让 Zepp 通过代理访问健康数据".to_string(),
                )
            })?;
            (captured, accumulator.has_token(), accumulator.has_user_id())
        };

        let mut state = recover_lock(&self.runtime);
        state.status.token_seen = token_seen;
        state.status.user_id_seen = user_id_seen;
        state.status.captured = true;
        state.status.updated_at = Utc::now().to_rfc3339();
        Ok(captured)
    }

    /// Return a phone-friendly proxy URL using the first usable LAN address.
    #[allow(dead_code)]
    pub fn generate_qr_config(&self) -> String {
        let status = self.status();
        let host = status
            .local_ipv4
            .first()
            .cloned()
            .unwrap_or_else(|| "127.0.0.1".to_string());
        let port = status.port.unwrap_or(self.port);
        format!("http://{host}:{port}")
    }

    fn mark_error(&self, message: String) {
        let mut state = recover_lock(&self.runtime);
        state.status.lifecycle = ProxyLifecycle::Error;
        state.status.running = false;
        state.status.error = Some(message);
        state.status.updated_at = Utc::now().to_rfc3339();
    }
}

impl Default for ProxyServer {
    fn default() -> Self {
        Self::new(DEFAULT_PROXY_PORT)
    }
}

impl Drop for ProxyServer {
    fn drop(&mut self) {
        let mut state = recover_lock(&self.runtime);
        if let Some(stop) = state.stop.take() {
            let _ = stop.send(());
        }
    }
}

struct CaMaterial {
    authority: RcgenAuthority,
    certificate_der: Arc<Vec<u8>>,
}

fn load_or_generate_ca(data_dir: &Path, ca_key_store: Arc<dyn CaKeyStore>) -> Result<CaMaterial> {
    fs::create_dir_all(data_dir)?;
    let cert_path = data_dir.join(CA_CERT_FILENAME);
    let pem_path = data_dir.join(CA_PEM_FILENAME);
    let key_path = data_dir.join(CA_KEY_FILENAME);
    let identity = ca_key_identity(data_dir);

    let stored_key = ca_key_store
        .load(&identity)
        .map_err(|_| ca_store_error("读取"))?;
    let (cert_der, cert_pem, key_pem) = match stored_key {
        Some(key_bytes) => {
            let key_pem = key_pem_from_bytes(&key_bytes)?;
            validate_key_pair(&key_pem)?;
            if key_path.exists() {
                // A key already present in the platform store is canonical;
                // remove any stale legacy copy without reading it.
                remove_legacy_key(&key_path)?;
            }
            certificate_material(&cert_path, &key_pem)?
        }
        None if key_path.exists() => {
            // One-time migration from releases that persisted the private key
            // as `zeppbridge-ca.key`.  Do not remove it until the credential
            // store confirms a successful write, so a transient store outage
            // remains recoverable without generating a new CA.
            let key_pem = fs::read_to_string(&key_path).map_err(|_| {
                ZeppBridgeError::ConfigError(
                    "无法读取旧版代理根密钥；请检查文件权限后重试".to_string(),
                )
            })?;
            validate_key_pair(&key_pem)?;
            ca_key_store
                .store(&identity, key_pem.as_bytes())
                .map_err(|_| ca_store_error("保存"))?;
            remove_legacy_key(&key_path)?;
            certificate_material(&cert_path, &key_pem)?
        }
        None => {
            let (cert_der, cert_pem, key_pem) = generate_ca_material()?;
            ca_key_store
                .store(&identity, key_pem.as_bytes())
                .map_err(|_| ca_store_error("保存"))?;
            (cert_der, cert_pem, key_pem)
        }
    };

    // `.cer` is always DER for direct phone installation, while `.pem` is
    // always a PEM export for tools that expect text.  Rewriting both here
    // also migrates the legacy release where `.cer` contained PEM.
    atomic_write(&cert_path, &cert_der)?;
    atomic_write(&pem_path, cert_pem.as_bytes())?;

    let key_pair = validate_key_pair(&key_pem)?;
    let cert_der = hudsucker::rustls::pki_types::CertificateDer::from(cert_der.clone());
    let issuer = Issuer::from_ca_cert_der(&cert_der, key_pair).map_err(|_| {
        ZeppBridgeError::ConfigError(
            "代理根证书与凭据管理器中的密钥不匹配，请删除证书后重新启动捕获".to_string(),
        )
    })?;
    Ok(CaMaterial {
        authority: RcgenAuthority::new(issuer, 1_024, aws_lc_rs::default_provider()),
        certificate_der: Arc::new(cert_der.as_ref().to_vec()),
    })
}

fn generate_ca_material() -> Result<(Vec<u8>, String, String)> {
    let key_pair = KeyPair::generate()
        .map_err(|_| ZeppBridgeError::ConfigError("无法生成代理根密钥，请重试".to_string()))?;
    self_signed_ca_material(&key_pair)
}

fn self_signed_ca_material(key_pair: &KeyPair) -> Result<(Vec<u8>, String, String)> {
    let mut params = CertificateParams::default();
    params.is_ca = IsCa::Ca(hudsucker::rcgen::BasicConstraints::Unconstrained);
    params.key_usages = vec![
        hudsucker::rcgen::KeyUsagePurpose::KeyCertSign,
        hudsucker::rcgen::KeyUsagePurpose::DigitalSignature,
        hudsucker::rcgen::KeyUsagePurpose::CrlSign,
    ];
    let mut distinguished_name = DistinguishedName::new();
    distinguished_name.push(DnType::CommonName, "ZeppBridge Local Capture CA");
    params.distinguished_name = distinguished_name;
    let certificate = params
        .self_signed(&key_pair)
        .map_err(|_| ZeppBridgeError::ConfigError("无法生成代理根证书，请重试".to_string()))?;
    let cert_der = certificate.der().as_ref().to_vec();
    let cert_pem = certificate.pem();
    let key_pem = key_pair.serialize_pem();
    Ok((cert_der, cert_pem, key_pem))
}

fn certificate_material(cert_path: &Path, key_pem: &str) -> Result<(Vec<u8>, String, String)> {
    let key_pair = validate_key_pair(key_pem)?;
    if cert_path.exists() {
        let cert_file = fs::read(cert_path)?;
        let cert_der = certificate_der(&cert_file).map_err(|_| {
            ZeppBridgeError::ConfigError("代理根证书无法读取，请删除证书后重新启动捕获".to_string())
        })?;
        Ok((
            cert_der.clone(),
            pem_encode_certificate(&cert_der),
            key_pem.to_string(),
        ))
    } else {
        let (cert_der, cert_pem, _) = self_signed_ca_material(&key_pair)?;
        Ok((cert_der, cert_pem, key_pem.to_string()))
    }
}

fn key_pem_from_bytes(bytes: &[u8]) -> Result<String> {
    String::from_utf8(bytes.to_vec()).map_err(|_| {
        ZeppBridgeError::ConfigError(
            "凭据管理器中的代理根密钥格式无效，请删除代理证书后重试".to_string(),
        )
    })
}

fn validate_key_pair(key_pem: &str) -> Result<KeyPair> {
    KeyPair::from_pem(key_pem).map_err(|_| {
        ZeppBridgeError::ConfigError("代理根密钥格式无效，请删除代理证书后重新启动捕获".to_string())
    })
}

fn ca_key_identity(data_dir: &Path) -> String {
    let path = fs::canonicalize(data_dir).unwrap_or_else(|_| data_dir.to_path_buf());
    let digest = Sha256::digest(path.to_string_lossy().as_bytes());
    format!("v1-{}", hex::encode(digest))
}

fn ca_store_error(action: &str) -> ZeppBridgeError {
    ZeppBridgeError::ConfigError(format!(
        "无法{action}代理根密钥；请确认 Windows 凭据管理器可用且应用有权限，然后重试"
    ))
}

fn remove_legacy_key(path: &Path) -> Result<()> {
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(_) => Err(ZeppBridgeError::ConfigError(
            "代理根密钥已迁移，但旧版密钥文件删除失败；请检查文件权限后重试".to_string(),
        )),
    }
}

fn certificate_der(bytes: &[u8]) -> std::result::Result<Vec<u8>, String> {
    if bytes.starts_with(b"-----BEGIN") {
        use hudsucker::rustls::pki_types::pem::PemObject;
        let certificate = hudsucker::rustls::pki_types::CertificateDer::from_pem_slice(bytes)
            .map_err(|error| format!("PEM 解析失败: {error}"))?;
        Ok(certificate.as_ref().to_vec())
    } else if bytes.first() == Some(&0x30) {
        Ok(bytes.to_vec())
    } else {
        Err("证书不是有效的 PEM 或 DER".to_string())
    }
}

fn pem_encode_certificate(der: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut encoded = String::with_capacity((der.len() * 4 / 3) + 64);
    for (index, chunk) in der.chunks(3).enumerate() {
        let first = chunk.first().copied().unwrap_or_default();
        let second = chunk.get(1).copied().unwrap_or_default();
        let third = chunk.get(2).copied().unwrap_or_default();
        let triple = ((first as u32) << 16) | ((second as u32) << 8) | third as u32;
        encoded.push(TABLE[((triple >> 18) & 0x3f) as usize] as char);
        encoded.push(TABLE[((triple >> 12) & 0x3f) as usize] as char);
        encoded.push(if chunk.len() > 1 {
            TABLE[((triple >> 6) & 0x3f) as usize] as char
        } else {
            '='
        });
        encoded.push(if chunk.len() > 2 {
            TABLE[(triple & 0x3f) as usize] as char
        } else {
            '='
        });
        if (index + 1) % 16 == 0 {
            encoded.push('\n');
        }
    }
    if !encoded.ends_with('\n') {
        encoded.push('\n');
    }
    format!("-----BEGIN CERTIFICATE-----\n{encoded}-----END CERTIFICATE-----\n")
}

fn recover_lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    match mutex.lock() {
        Ok(guard) => guard,
        Err(poisoned) => poisoned.into_inner(),
    }
}

fn atomic_write(path: &Path, contents: &[u8]) -> io::Result<()> {
    let parent = path
        .parent()
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "invalid CA path"))?;
    fs::create_dir_all(parent)?;
    let suffix = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let temp = parent.join(format!(
        ".{}-{}-{}.tmp",
        path.file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("ca"),
        std::process::id(),
        suffix
    ));
    let result = (|| -> io::Result<()> {
        let mut options = OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = options.open(&temp)?;
        file.write_all(contents)?;
        file.sync_all()?;
        drop(file);
        #[cfg(windows)]
        if path.exists() {
            fs::remove_file(path)?;
        }
        fs::rename(&temp, path)
    })();
    if result.is_err() {
        let _ = fs::remove_file(temp);
    }
    result
}

const MAX_CAPTURE_CANDIDATES: usize = 8;

struct CaptureCandidate {
    /// Canonical host without a port or trailing dot.  All values in this
    /// candidate are observed from this one origin only.
    host_key: String,
    region_host: String,
    app_token: Option<String>,
    user_id: Option<String>,
    update_sequence: u64,
    last_emitted: Option<CapturedAuth>,
}

impl CaptureCandidate {
    fn new(host_key: String, update_sequence: u64) -> Self {
        let region_host = format!("https://{host_key}");
        Self {
            host_key,
            region_host,
            app_token: None,
            user_id: None,
            update_sequence,
            last_emitted: None,
        }
    }

    fn has_token(&self) -> bool {
        self.app_token.is_some()
    }

    fn has_user_id(&self) -> bool {
        self.user_id.is_some()
    }
}

#[derive(Default)]
struct CaptureAccumulator {
    candidates: Vec<CaptureCandidate>,
    next_update_sequence: u64,
}

impl CaptureAccumulator {
    fn next_update_sequence(&mut self) -> u64 {
        self.next_update_sequence = self.next_update_sequence.saturating_add(1);
        self.next_update_sequence
    }

    fn candidate_for_host(
        &mut self,
        host_key: &str,
        update_sequence: u64,
    ) -> &mut CaptureCandidate {
        if let Some(index) = self
            .candidates
            .iter()
            .position(|candidate| candidate.host_key == host_key)
        {
            return self
                .candidates
                .get_mut(index)
                .expect("candidate index came from position");
        }

        if self.candidates.len() >= MAX_CAPTURE_CANDIDATES {
            // The sequence is monotonic for normal operation.  The host key
            // tie-break keeps eviction deterministic even after saturation.
            if let Some(oldest_index) = self
                .candidates
                .iter()
                .enumerate()
                .min_by(|(_, left), (_, right)| {
                    left.update_sequence
                        .cmp(&right.update_sequence)
                        .then_with(|| left.host_key.cmp(&right.host_key))
                })
                .map(|(index, _)| index)
            {
                self.candidates.remove(oldest_index);
            }
        }

        self.candidates
            .push(CaptureCandidate::new(host_key.to_string(), update_sequence));
        self.candidates
            .last_mut()
            .expect("candidate was just pushed")
    }

    fn latest_token_candidate_index(&self) -> Option<usize> {
        self.candidates
            .iter()
            .enumerate()
            .filter(|(_, candidate)| candidate.has_token() && !candidate.region_host.is_empty())
            .max_by(|(_, left), (_, right)| {
                left.update_sequence
                    .cmp(&right.update_sequence)
                    .then_with(|| left.host_key.cmp(&right.host_key))
            })
            .map(|(index, _)| index)
    }

    fn has_token(&self) -> bool {
        self.candidates.iter().any(CaptureCandidate::has_token)
    }

    fn has_user_id(&self) -> bool {
        self.candidates.iter().any(CaptureCandidate::has_user_id)
    }
}

#[derive(Clone)]
struct CaptureHandler {
    accumulator: Arc<Mutex<CaptureAccumulator>>,
    captured_tx: watch::Sender<Option<CapturedAuth>>,
    certificate_der: Arc<Vec<u8>>,
    runtime: Arc<Mutex<RuntimeState>>,
}

impl CaptureHandler {
    #[allow(dead_code)]
    fn new(
        captured_tx: watch::Sender<Option<CapturedAuth>>,
        certificate_der: Arc<Vec<u8>>,
        runtime: Arc<Mutex<RuntimeState>>,
    ) -> Self {
        Self::with_accumulator(
            captured_tx,
            certificate_der,
            runtime,
            Arc::new(Mutex::new(CaptureAccumulator::default())),
        )
    }

    fn with_accumulator(
        captured_tx: watch::Sender<Option<CapturedAuth>>,
        certificate_der: Arc<Vec<u8>>,
        runtime: Arc<Mutex<RuntimeState>>,
        accumulator: Arc<Mutex<CaptureAccumulator>>,
    ) -> Self {
        Self {
            accumulator,
            captured_tx,
            certificate_der,
            runtime,
        }
    }

    fn observe(&self, request: &hudsucker::hyper::Request<Body>) {
        let host = request_host(request);
        let Some(host) = host else { return };
        if !is_capture_host(&host) {
            return;
        }

        let host_key = host_without_port(&host);

        let token = request
            .headers()
            .get("apptoken")
            .and_then(|value| value.to_str().ok())
            .map(str::trim)
            .filter(|value| !value.is_empty() && value.len() <= 16 * 1024)
            .map(ToOwned::to_owned);
        let user_id = extract_user_id(request);

        {
            let mut state = recover_lock(&self.runtime);
            state.status.zepp_http_request_count =
                state.status.zepp_http_request_count.saturating_add(1);
        }

        let (token_seen, user_id_seen) = {
            let mut accumulator = recover_lock(&self.accumulator);
            let update_sequence = accumulator.next_update_sequence();
            let candidate = accumulator.candidate_for_host(&host_key, update_sequence);
            candidate.update_sequence = update_sequence;
            if token.is_some() {
                candidate.app_token = token;
            }
            if user_id.is_some() {
                candidate.user_id = user_id;
            }

            let _ = complete_capture(candidate, &self.captured_tx);
            (accumulator.has_token(), accumulator.has_user_id())
        };

        // Diagnostics are derived from the bounded candidate set rather than
        // sticky historical booleans.  Do this after releasing the candidate
        // lock so the runtime -> accumulator lock order remains consistent
        // with lifecycle resets.
        let mut state = recover_lock(&self.runtime);
        state.status.token_seen = token_seen;
        state.status.user_id_seen = user_id_seen;
    }

    fn observe_connect(&self, host: Option<&str>) -> bool {
        let Some(host) = host else {
            return false;
        };

        let is_zepp = is_capture_host(host);
        let mut state = recover_lock(&self.runtime);
        state.status.phone_connect_count = state.status.phone_connect_count.saturating_add(1);
        if is_zepp {
            state.status.zepp_connect_count = state.status.zepp_connect_count.saturating_add(1);
            record_zepp_activity(&mut state.status, host);
        }
        is_zepp
    }

    fn observe_tls_hello(&self, host: Option<&str>) -> bool {
        let Some(host) = host else {
            return false;
        };

        let is_zepp = is_capture_host(host);
        if is_zepp {
            let mut state = recover_lock(&self.runtime);
            state.status.zepp_tls_hello_count = state.status.zepp_tls_hello_count.saturating_add(1);
            record_zepp_activity(&mut state.status, host);
        }
        is_zepp
    }
}

fn complete_capture(
    candidate: &mut CaptureCandidate,
    captured_tx: &watch::Sender<Option<CapturedAuth>>,
) -> Option<CapturedAuth> {
    let (Some(app_token), Some(user_id), Some(region_host)) = (
        candidate.app_token.clone(),
        candidate.user_id.clone(),
        Some(candidate.region_host.clone()),
    ) else {
        return None;
    };

    let captured = CapturedAuth {
        app_token,
        user_id,
        region_host,
    };
    if candidate.last_emitted.as_ref() != Some(&captured) {
        // A receiver may not be present yet; the watch sender still keeps the
        // latest complete value for a later `wait_for_capture` call.
        let _ = captured_tx.send(Some(captured.clone()));
        candidate.last_emitted = Some(captured.clone());
        tracing::info!("捕获完成");
    }
    Some(captured)
}

impl HttpHandler for CaptureHandler {
    fn handle_request(
        &mut self,
        _ctx: &HttpContext,
        request: hudsucker::hyper::Request<Body>,
    ) -> impl std::future::Future<Output = RequestOrResponse> + Send {
        let certificate_response = if request.uri().path() == CA_DOWNLOAD_PATH {
            Some(certificate_response(
                &request,
                Arc::clone(&self.certificate_der),
            ))
        } else {
            None
        };
        if certificate_response.is_none() {
            self.observe(&request);
        }
        async move {
            match certificate_response {
                Some(response) => RequestOrResponse::Response(response),
                None => RequestOrResponse::Request(request),
            }
        }
    }

    fn should_intercept_connect(
        &mut self,
        _ctx: &HttpContext,
        request: &hudsucker::hyper::Request<Body>,
    ) -> impl std::future::Future<Output = bool> + Send {
        let host = request
            .uri()
            .authority()
            .map(|authority| authority.host().to_owned());
        let should_intercept = self.observe_connect(host.as_deref());
        async move { should_intercept }
    }

    fn should_intercept_tls(
        &mut self,
        _ctx: &HttpContext,
        client_hello: hudsucker::rustls::server::ClientHello<'_>,
    ) -> impl std::future::Future<Output = bool> + Send {
        let host = client_hello.server_name().map(ToOwned::to_owned);
        let should_intercept = self.observe_tls_hello(host.as_deref());
        async move { should_intercept }
    }
}

fn record_zepp_activity(status: &mut ProxyStatus, host: &str) {
    status.last_zepp_host = Some(host_without_port(host));
    status.last_activity_at = Some(Utc::now().to_rfc3339());
}

fn certificate_response(
    request: &hudsucker::hyper::Request<Body>,
    certificate_der: Arc<Vec<u8>>,
) -> hudsucker::hyper::Response<Body> {
    use hudsucker::hyper::{header, Method, Response, StatusCode};

    let status = if request.method() == Method::GET {
        StatusCode::OK
    } else {
        StatusCode::METHOD_NOT_ALLOWED
    };
    let body = if status == StatusCode::OK {
        Body::from(certificate_der.as_ref().clone())
    } else {
        Body::empty()
    };
    let builder = Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, "application/x-x509-ca-cert")
        .header(
            header::CONTENT_DISPOSITION,
            "attachment; filename=zeppbridge-ca.cer",
        )
        .header(header::CACHE_CONTROL, "no-store")
        .header(header::PRAGMA, "no-cache");
    match builder.body(body) {
        Ok(response) => response,
        Err(_) => Response::new(Body::empty()),
    }
}

fn request_host(request: &hudsucker::hyper::Request<Body>) -> Option<String> {
    request
        .uri()
        .authority()
        .map(|authority| authority.host().to_ascii_lowercase())
        .or_else(|| {
            request
                .headers()
                .get(hudsucker::hyper::header::HOST)
                .and_then(|value| value.to_str().ok())
                .map(|value| host_without_port(value).to_ascii_lowercase())
        })
}

fn host_without_port(host: &str) -> String {
    let host = host.trim().trim_end_matches('.');
    if let Some(stripped) = host.strip_prefix('[') {
        stripped
            .split(']')
            .next()
            .unwrap_or(stripped)
            .to_ascii_lowercase()
    } else {
        host.rsplit_once(':')
            .filter(|(candidate, port)| !candidate.contains(':') && port.parse::<u16>().is_ok())
            .map(|(candidate, _)| candidate)
            .unwrap_or(host)
            .to_ascii_lowercase()
    }
}

pub fn is_capture_host(host: &str) -> bool {
    let host = host_without_port(host);
    host.starts_with("api-mifit") && (host.ends_with(".zepp.com") || host.ends_with(".huami.com"))
}

fn extract_user_id(request: &hudsucker::hyper::Request<Body>) -> Option<String> {
    let path = request.uri().path();
    let segments: Vec<_> = path
        .split('/')
        .filter(|segment| !segment.is_empty())
        .collect();
    if let Some(index) = segments
        .iter()
        .position(|segment| segment.eq_ignore_ascii_case("users"))
    {
        if let Some(value) = segments
            .get(index + 1)
            .and_then(|value| sanitize_user_id(value))
        {
            return Some(value);
        }
    }

    if let Some(query) = request.uri().query() {
        for (key, value) in query.split('&').filter_map(|pair| pair.split_once('=')) {
            if key.eq_ignore_ascii_case("userid") || key.eq_ignore_ascii_case("user_id") {
                if let Some(value) = sanitize_user_id(&percent_decode(value)) {
                    return Some(value);
                }
            }
        }
    }

    ["userid", "user_id"].iter().find_map(|name| {
        request
            .headers()
            .get(*name)
            .and_then(|value| value.to_str().ok())
            .and_then(sanitize_user_id)
    })
}

fn sanitize_user_id(value: &str) -> Option<String> {
    let value = percent_decode(value).trim().to_string();
    if value.is_empty()
        || value.len() > 256
        || value.chars().any(char::is_control)
        || value.contains('/')
    {
        None
    } else {
        Some(value)
    }
}

fn percent_decode(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut output = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' && index + 2 < bytes.len() {
            let high = (bytes[index + 1] as char).to_digit(16);
            let low = (bytes[index + 2] as char).to_digit(16);
            if let (Some(high), Some(low)) = (high, low) {
                output.push(((high << 4) | low) as u8);
                index += 3;
                continue;
            }
        }
        output.push(if bytes[index] == b'+' {
            b' '
        } else {
            bytes[index]
        });
        index += 1;
    }
    String::from_utf8_lossy(&output).into_owned()
}

pub fn is_usable_ipv4(ip: Ipv4Addr) -> bool {
    let octets = ip.octets();
    !(ip.is_loopback()
        || ip.is_unspecified()
        || ip.is_broadcast()
        || ip.is_multicast()
        || (octets[0] == 198 && (18..=19).contains(&octets[1]))
        || (octets[0] == 169 && octets[1] == 254)
        || (octets[0] == 100 && (64..=127).contains(&octets[1])))
}

pub fn usable_ipv4_addresses() -> Vec<Ipv4Addr> {
    let mut seen = HashSet::new();
    let mut addresses = list_afinet_netifas()
        .ok()
        .into_iter()
        .flatten()
        .filter_map(|(name, ip)| match ip {
            IpAddr::V4(ip) if is_usable_ipv4(ip) && is_usable_interface(&name) => Some(ip),
            _ => None,
        })
        .filter(|ip| seen.insert(*ip))
        .collect::<Vec<_>>();
    addresses.sort_by_key(|ip| (!ip.is_private(), ip.octets()));
    addresses
}

fn is_usable_interface(name: &str) -> bool {
    let name = name.to_ascii_lowercase();
    [
        "loopback",
        "virtual",
        "vmware",
        "vbox",
        "hyper-v",
        "hyperv",
        "vethernet",
        "tailscale",
        "wireguard",
        "wintun",
        "zerotier",
        "docker",
        "wsl",
        "vpn",
        "tap",
    ]
    .iter()
    .all(|blocked| !name.contains(blocked))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::Ipv4Addr;

    #[test]
    fn usable_ipv4_rejects_loopback_and_cgnat() {
        assert!(is_usable_ipv4(Ipv4Addr::new(192, 168, 1, 5)));
        assert!(!is_usable_ipv4(Ipv4Addr::new(127, 0, 0, 1)));
        assert!(!is_usable_ipv4(Ipv4Addr::new(100, 64, 0, 1)));
    }
}
