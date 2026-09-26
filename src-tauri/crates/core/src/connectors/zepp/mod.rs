use crate::models::{error::*, AuthInfo};

use reqwest::{header, Client, Url};

use serde_json::Value;

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};

use std::sync::Arc;

use std::time::Duration;

mod policy;

pub use policy::*;

const MAX_ATTEMPTS: usize = 3;

const RETRY_BACKOFF_MS: [u64; 2] = [50, 150];

/// 一次请求最多跟几跳同域重定向。
///
/// 以前重定向和重试共用一个预算：一次合法的 3xx 走 `continue`，顺手吃掉一次
/// 网络重试额度。某个区域哪天多两跳跳转，真正的请求就一次都重试不了了。两
/// 件事的失败模式完全不同——重定向循环要立刻停，网络抖动要退避后再来——
/// 所以各记各的。
const MAX_REDIRECTS: usize = 5;

/// 跳转预算必须比重试预算宽。
///
/// 夹得比它窄的话，两者等于又共用了一个额度——那正是这次要修掉的东西。
/// 编译期断言而不是测试：这是两个常量之间的关系，不该等到跑测试才发现。
const _: () = assert!(MAX_REDIRECTS > MAX_ATTEMPTS);

/// 429 / 503 退避的上限。
///
/// 服务器给的 `Retry-After` 也要被它夹住：一个写着 `Retry-After: 3600` 的
/// 响应不该让同步挂在那里一小时，那时候用户会去关窗口。
const MAX_BACKOFF_MS: u64 = 8_000;

static REQUEST_COUNTER: AtomicU64 = AtomicU64::new(1);

/// Zepp Cloud API connector.  The type is cloneable so network requests can
/// happen without holding a database mutex in the synchronizer.
#[derive(Clone)]
pub struct ZeppConnector {
    client: Client,
    auth: AuthInfo,
    base_url: Url,
    cancel: Arc<AtomicBool>,
}

impl ZeppConnector {
    pub fn new(auth: AuthInfo) -> Result<Self> {
        Self::with_cancel(auth, Arc::new(AtomicBool::new(false)))
    }

    /// Construct a connector whose requests abort early when `cancel` is set.
    pub fn with_cancel(auth: AuthInfo, cancel: Arc<AtomicBool>) -> Result<Self> {
        let base = validate_region_host(&auth.region_host)?;
        if auth.user_id.trim().is_empty()
            || !auth
                .user_id
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_'))
        {
            return Err(ZeppBridgeError::ConfigError("user_id 无效".into()));
        }

        let mut defaults = header::HeaderMap::new();
        // 版本号从 crate 元数据来，不再手写。手写的那个停在 `0.2.1` 上，
        // 而应用早已经到 1.x——服务端日志、抓包和限流诊断里看到的会一直是
        // 一个不存在的版本，出问题时对不上任何一次发布。
        defaults.insert(
            header::USER_AGENT,
            header::HeaderValue::from_str(concat!("ZeppBridge/", env!("CARGO_PKG_VERSION")))
                .map_err(|_| ZeppBridgeError::ConfigError("User-Agent 无法构造".into()))?,
        );
        // Redirects are disabled so a 3xx can never forward the custom
        // `apptoken` header to a host outside the validated region. Manual,
        // same-origin redirect handling lives in `get_json`.
        //
        // Env/system proxies are disabled on purpose. This product talks to
        // Zepp directly; silently honouring HTTP_PROXY would let a local MITM
        // see `apptoken`. Embedders that need a proxy must not reuse this
        // constructor — there is no `with_client` bypass.
        let client = Client::builder()
            .default_headers(defaults)
            .timeout(Duration::from_secs(30))
            .connect_timeout(Duration::from_secs(10))
            .no_proxy()
            .cookie_store(true)
            .redirect(reqwest::redirect::Policy::none())
            .build()?;
        let base_url = Url::parse(&base)
            .map_err(|_| ZeppBridgeError::InvalidHost("主机 URL 无法解析".into()))?;
        let connector = Self {
            client,
            auth,
            base_url,
            cancel,
        };
        // Validate the token as a header value during construction, rather than
        // panicking later when the first request is made.
        connector.build_headers()?;
        Ok(connector)
    }

    pub fn build_headers(&self) -> Result<header::HeaderMap> {
        let mut headers = header::HeaderMap::new();
        let token = header::HeaderValue::from_str(&self.auth.app_token)
            .map_err(|_| ZeppBridgeError::ConfigError("app_token 含有非法 header 字符".into()))?;
        headers.insert("apptoken", token);
        headers.insert(
            "appname",
            header::HeaderValue::from_static("com.huami.midong"),
        );
        headers.insert("appplatform", header::HeaderValue::from_static("ios_phone"));
        headers.insert("accept", header::HeaderValue::from_static("*/*"));
        headers.insert("v", header::HeaderValue::from_static("2.0"));
        headers.insert("vn", header::HeaderValue::from_static("10.2.5"));
        headers.insert("cv", header::HeaderValue::from_static("1722_10.2.5"));
        headers.insert("vb", header::HeaderValue::from_static("202604132257"));
        headers.insert("lang", header::HeaderValue::from_static("en"));
        headers.insert("country", header::HeaderValue::from_static(""));
        headers.insert("timezone", header::HeaderValue::from_static("UTC"));
        Ok(headers)
    }

    fn path_url(&self, path: &str) -> Result<Url> {
        validate_api_path(path)?;
        let url = self
            .base_url
            .join(path)
            .map_err(|_| ZeppBridgeError::ConfigError("API 路径无法构造".into()))?;
        if !same_region_origin(&url, &self.base_url) {
            return Err(ZeppBridgeError::ConfigError("非法 API 路径".into()));
        }
        Ok(url)
    }

    /// 退避等待，等的过程中也响应取消。
    ///
    /// 直接 `sleep` 的话，用户在退避窗口里按取消要等这一觉睡完才生效。
    async fn backoff(&self, millis: u64) -> Result<()> {
        if millis == 0 {
            return Ok(());
        }
        // 切成小段轮询取消标志。这里不引入 cancellation token，是因为这个
        // 连接器的取消本来就是一个跨线程共享的 `AtomicBool`。
        const TICK_MS: u64 = 50;
        let mut left = millis;
        while left > 0 {
            if self.cancel.load(Ordering::SeqCst) {
                return Err(ZeppBridgeError::Cancelled);
            }
            let step = left.min(TICK_MS);
            tokio::time::sleep(Duration::from_millis(step)).await;
            left -= step;
        }
        if self.cancel.load(Ordering::SeqCst) {
            return Err(ZeppBridgeError::Cancelled);
        }
        Ok(())
    }

    /// 一个只有在取消被请求时才 ready 的 future。
    ///
    /// 用来和网络请求一起放进 `tokio::select!`。取消标志是一个跨线程共享的
    /// `AtomicBool`，本身不是 future，所以这里用小步长轮询把它变成一个。
    async fn cancelled(&self) {
        loop {
            if self.cancel.load(Ordering::SeqCst) {
                return;
            }
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
    }

    fn request_id() -> String {
        let n = REQUEST_COUNTER.fetch_add(1, Ordering::Relaxed);
        format!("ZEPBRIDGE-{n:016X}")
    }

    /// 发一次 GET 并解析 JSON。
    ///
    /// 两个预算分开记：`attempt` 是网络重试，`redirects` 是同域跳转。合在一起
    /// 记的时候，跳转会悄悄吃掉重试次数——那正是「有时候同步失败，再点一次
    /// 又好了」这类报告的来源之一。
    async fn get_json(&self, path: &str, params: Vec<(&str, String)>) -> Result<Value> {
        let mut url = self.path_url(path)?;
        let headers = self.build_headers()?;
        let mut last_retry_status = None;
        let mut attempt = 0usize;
        let mut redirects = 0usize;

        while attempt < MAX_ATTEMPTS {
            // 这一轮失败时要等多久。429/503 会用服务器给的 `Retry-After`
            // 覆盖掉它。
            let backoff_ms = RETRY_BACKOFF_MS.get(attempt).copied().unwrap_or(0);
            if self.cancel.load(Ordering::SeqCst) {
                return Err(ZeppBridgeError::Cancelled);
            }
            let mut query = params.clone();
            query.push(("r", Self::request_id()));
            // 取消和请求一起 select。以前取消只在两条流之间被检查，一个已经
            // 发出去的请求要等满自己的 35 秒超时——网络差的时候，用户按了
            // 取消还要看着应用转几十秒。`select!` 落到取消那一支时，请求
            // future 被 drop，连接随之关闭。
            let send = tokio::time::timeout(
                Duration::from_secs(35),
                self.client
                    .get(url.clone())
                    .headers(headers.clone())
                    .query(&query)
                    .send(),
            );
            let outcome = tokio::select! {
                // 先看取消：两边同时就绪时优先走取消，别再把一个用户已经
                // 放弃的响应解出来。
                biased;
                _ = self.cancelled() => return Err(ZeppBridgeError::Cancelled),
                outcome = send => outcome,
            };
            let response = match outcome {
                Ok(Ok(response)) => response,
                Ok(Err(error)) => {
                    attempt += 1;
                    if attempt < MAX_ATTEMPTS {
                        self.backoff(backoff_ms).await?;
                        continue;
                    }
                    return Err(ZeppBridgeError::NetworkError(error));
                }
                Err(_elapsed) => {
                    attempt += 1;
                    if attempt < MAX_ATTEMPTS {
                        self.backoff(backoff_ms).await?;
                        continue;
                    }
                    return Err(ZeppBridgeError::RetryExhausted {
                        status: 504,
                        message: "请求超时".into(),
                    });
                }
            };

            let status = response.status().as_u16();
            // Redirects are disabled at the client level so the custom
            // `apptoken` header is never forwarded cross-origin by reqwest.
            // Follow a 3xx manually only when the target stays on the same
            // HTTPS host as the validated regional base URL.
            if (300..=399).contains(&status) {
                // 跳转记在自己的预算上，**不动 `attempt`**。
                redirects += 1;
                if redirects > MAX_REDIRECTS {
                    return Err(ZeppBridgeError::HttpStatus {
                        status,
                        message: "重定向次数过多".into(),
                    });
                }
                let location = response
                    .headers()
                    .get(reqwest::header::LOCATION)
                    .and_then(|value| value.to_str().ok());
                match location {
                    Some(location) => match url.join(location) {
                        Ok(next) if same_region_origin(&next, &self.base_url) => {
                            url = next;
                            continue;
                        }
                        _ => {
                            return Err(ZeppBridgeError::HttpStatus {
                                status,
                                message: "重定向目标不在允许的区域内".into(),
                            })
                        }
                    },
                    None => {
                        return Err(ZeppBridgeError::HttpStatus {
                            status,
                            message: "重定向缺少目标地址".into(),
                        })
                    }
                }
            }
            match classify_status(status) {
                None => {
                    let body = read_json_body(response).await?;
                    if let Some(error) = classify_business_code(&body) {
                        return Err(error);
                    }
                    return Ok(body);
                }
                Some(ZeppBridgeError::NeedsReauth(message)) => {
                    return Err(ZeppBridgeError::NeedsReauth(message));
                }
                Some(ZeppBridgeError::Unavailable(message)) => {
                    return Err(ZeppBridgeError::Unavailable(message));
                }
                Some(ZeppBridgeError::RetryExhausted { .. }) => {
                    last_retry_status = Some(status);
                    // 服务器说了要等多久就等多久（夹在上限内）；没说才用我们
                    // 自己的指数退避。以前 429 和 503 都只等 50/150 毫秒，
                    // 等于没退避——对着一个正在限流的服务重试三次，只是把
                    // 限流窗口烧得更久。
                    let wait = retry_after_ms(response.headers())
                        .unwrap_or_else(|| exponential_backoff_ms(attempt, backoff_ms));
                    attempt += 1;
                    if attempt < MAX_ATTEMPTS {
                        self.backoff(wait).await?;
                        continue;
                    }
                    return Err(ZeppBridgeError::RetryExhausted {
                        status,
                        message: "服务暂时不可用，已达到有限重试次数".into(),
                    });
                }
                Some(error) => return Err(error),
            }
        }

        Err(ZeppBridgeError::RetryExhausted {
            status: last_retry_status.unwrap_or(503),
            message: "服务暂时不可用".into(),
        })
    }

    pub async fn fetch_devices(&self) -> Result<Value> {
        let path = format!("/users/{}/devices", self.auth.user_id);
        self.get_json(
            &path,
            vec![
                ("enableMultiDevice", "true".into()),
                ("device_type", "android_phone".into()),
            ],
        )
        .await
    }

    /// Real Zepp endpoint: `/users/{id}/heartRate`.
    pub async fn fetch_heart_rate(
        &self,
        start_timestamp: i64,
        end_timestamp: i64,
    ) -> Result<Value> {
        self.fetch_heart_rate_with_options(start_timestamp, end_timestamp, 1000, 2)
            .await
    }

    pub async fn fetch_heart_rate_with_options(
        &self,
        start_timestamp: i64,
        end_timestamp: i64,
        limit: i64,
        hr_type: i64,
    ) -> Result<Value> {
        let path = format!("/users/{}/heartRate", self.auth.user_id);
        self.get_json(
            &path,
            vec![
                ("startTime", start_timestamp.to_string()),
                ("endTime", end_timestamp.to_string()),
                ("limit", limit.max(1).to_string()),
                ("type", hr_type.to_string()),
            ],
        )
        .await
    }

    /// Weight and body composition: `/users/{id}/members/{member}/weightRecords`.
    ///
    /// **A different surface, not another event type.** ZeppBridge probed
    /// `/v2/users/me/events?eventType=weight&subType=summary` for a year and got
    /// an empty page every time, which the UI reported — correctly, for what it
    /// was asked — as "No measurement in the last 365 days", to four people who
    /// owned a scale and had years of readings sitting in the Zepp app. Verified
    /// on a live account 2026-09-04: the v2 page returns `items: []` while this
    /// one returns the records.
    ///
    /// **The window is in Unix *seconds*.** Every event surface above takes
    /// milliseconds; this one does not, and passing milliseconds asks for a
    /// window fifty thousand years wide — which the server answers with nothing.
    /// That is the easiest way to reintroduce the exact bug this method exists
    /// to fix, so the seconds are in the parameter names.
    ///
    /// `member_id` is `-1` for the account holder. A scale can be shared and
    /// `/users/{id}/members` lists the rest; only the account holder is read,
    /// because the others are other people.
    pub async fn fetch_weight_records(
        &self,
        member_id: &str,
        from_seconds: i64,
        to_seconds: i64,
        limit: i64,
    ) -> Result<Value> {
        let member_id = validate_member_id(member_id)?;
        let path = format!(
            "/users/{}/members/{member_id}/weightRecords",
            self.auth.user_id
        );
        self.get_json(
            &path,
            vec![
                ("fromTime", from_seconds.to_string()),
                ("toTime", to_seconds.to_string()),
                ("limit", limit.max(1).to_string()),
                // 0 = newest first. A truncated page then still holds the
                // readings most likely to be new to us.
                ("isForward", "0".to_owned()),
            ],
        )
        .await
    }

    /// Real raw band synchronization endpoint.  Its payload may be compressed;
    /// callers must not infer sleep from it unless normalization verifies it.
    pub async fn fetch_band_data(
        &self,
        from_date: &str,
        to_date: &str,
        query_type: &str,
        byte_length: i64,
        device_type: i64,
    ) -> Result<Value> {
        let path = "/v1/data/band_data.json";
        self.get_json(
            path,
            vec![
                ("userid", self.auth.user_id.clone()),
                ("from_date", from_date.to_owned()),
                ("to_date", to_date.to_owned()),
                ("query_type", query_type.to_owned()),
                ("byteLength", byte_length.max(0).to_string()),
                ("device_type", device_type.to_string()),
            ],
        )
        .await
    }

    /// Real workout summary endpoint. `sport` is the URL segment (run,
    /// walking, ride, swimming, …); track ids are the API's actual cursor
    /// parameters and are intentionally not called timestamps here.
    pub async fn fetch_sport_history(
        &self,
        sport: &str,
        start_track_id: i64,
        stop_track_id: i64,
        need_sub_data: i64,
    ) -> Result<Value> {
        if sport.is_empty()
            || !sport
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_'))
        {
            return Err(ZeppBridgeError::ConfigError("sport 类型无效".into()));
        }
        let path = format!("/v1/sport/{sport}/history.json");
        self.get_json(
            &path,
            vec![
                ("userid", self.auth.user_id.clone()),
                ("startTrackId", start_track_id.to_string()),
                ("stopTrackId", stop_track_id.to_string()),
                ("need_sub_data", need_sub_data.to_string()),
                ("type", String::new()),
            ],
        )
        .await
    }

    /// Single-workout delta payload. Path is always `/run/detail.json`
    /// regardless of sport; `trackid` + `source` come from history.
    pub async fn fetch_sport_detail(&self, track_id: &str, source: &str) -> Result<Value> {
        let track_id = validate_track_id(track_id)?;
        let source = validate_detail_source(source)?;
        self.get_json(
            "/v1/sport/run/detail.json",
            vec![("trackid", track_id), ("source", source)],
        )
        .await
    }

    pub async fn fetch_watch_statistics(
        &self,
        statistic: &str,
        start_day: &str,
        end_day: &str,
        limit: i64,
        reverse: bool,
    ) -> Result<Value> {
        let statistic = match statistic {
            "SPORT_LOAD" | "VO2_MAX" => statistic,
            _ => {
                return Err(ZeppBridgeError::ConfigError(
                    "WatchSportStatistics 类型无效".into(),
                ))
            }
        };
        let path = format!(
            "/v2/watch/users/{}/WatchSportStatistics/{statistic}",
            self.auth.user_id
        );
        self.get_json(
            &path,
            vec![
                ("startDay", start_day.to_owned()),
                ("endDay", end_day.to_owned()),
                ("limit", limit.max(1).to_string()),
                (
                    "isReverse",
                    if reverse { "true" } else { "false" }.to_owned(),
                ),
            ],
        )
        .await
    }

    /// `sub_type` is optional here, exactly as it is on `fetch_user_events`.
    ///
    /// Most v2 streams do name one, but not all of them: the `Food` stream is
    /// addressed by `eventType` alone. Sending a made-up `subType=real_data`
    /// to those returns an empty page, which reads as "this account has no
    /// food log" — a false negative that looks exactly like a true one.
    pub async fn fetch_events(
        &self,
        event_type: &str,
        sub_type: Option<&str>,
        from_ms: i64,
        to_ms: i64,
        limit: i64,
        reverse: bool,
    ) -> Result<Value> {
        let mut params = vec![("eventType", event_type.to_owned())];
        if let Some(sub_type) = sub_type {
            params.push(("subType", sub_type.to_owned()));
        }
        params.push(("from", from_ms.to_string()));
        params.push(("to", to_ms.to_string()));
        params.push(("limit", limit.max(1).to_string()));
        params.push(("reverse", if reverse { "1" } else { "0" }.to_owned()));
        self.get_json("/v2/users/me/events", params).await
    }

    /// The user-scoped event timeline: `/users/{id}/events`.
    ///
    /// This is a different surface from `/v2/users/me/events`, not a variant of
    /// it — blood oxygen, all-day stress and PAI live here and are invisible to
    /// the v2 path. Endpoint shape confirmed against two independent
    /// reverse-engineering projects (see `docs/reference/architecture.md`).
    /// `sub_type` is genuinely optional here: `all_day_stress` takes none.
    pub async fn fetch_user_events(
        &self,
        event_type: &str,
        sub_type: Option<&str>,
        from_ms: i64,
        to_ms: i64,
        limit: i64,
        reverse: bool,
    ) -> Result<Value> {
        let path = format!("/users/{}/events", self.auth.user_id);
        let mut params = vec![
            ("eventType", event_type.to_owned()),
            ("from", from_ms.to_string()),
            ("to", to_ms.to_string()),
            ("limit", limit.max(1).to_string()),
            ("reverse", if reverse { "1" } else { "0" }.to_owned()),
            ("userId", self.auth.user_id.clone()),
        ];
        if let Some(sub_type) = sub_type {
            params.push(("subType", sub_type.to_owned()));
        }
        self.get_json(&path, params).await
    }

    /// `/users/{id}/events/dateString` — the same timeline addressed by a
    /// calendar-date window plus an IANA timezone instead of epoch milliseconds.
    /// Timestamp strings can be rejected or silently return an empty page.
    /// The nightly SpO2 desaturation (`odi`) and apnea (`osa_event`) windows
    /// are only served here.
    pub async fn fetch_user_events_date_string(
        &self,
        event_type: &str,
        sub_type: &str,
        from_date: chrono::NaiveDate,
        to_date: chrono::NaiveDate,
        time_zone: &str,
        limit: i64,
    ) -> Result<Value> {
        let path = format!("/users/{}/events/dateString", self.auth.user_id);
        self.get_json(
            &path,
            vec![
                ("eventType", event_type.to_owned()),
                ("subType", sub_type.to_owned()),
                ("from", from_date.to_string()),
                ("to", to_date.to_string()),
                ("timeZone", time_zone.to_owned()),
                ("limit", limit.max(1).to_string()),
                ("reverse", "0".to_owned()),
                ("userId", self.auth.user_id.clone()),
            ],
        )
        .await
    }

    /// `/users/me/fileInfo/events` — an index of stored measurement files
    /// rather than the measurements themselves.
    ///
    /// Dense series (per-second heart rate, and possibly the continuous blood
    /// oxygen the app charts) are not served inline anywhere; this endpoint
    /// lists the files that hold them. Probing it answers whether a stream
    /// exists at all before any file is downloaded.
    pub async fn fetch_file_info_events(
        &self,
        event_type: &str,
        sub_type: &str,
        from_ms: i64,
        to_ms: i64,
        limit: i64,
    ) -> Result<Value> {
        self.get_json(
            "/users/me/fileInfo/events",
            vec![
                ("eventType", event_type.to_owned()),
                ("subType", sub_type.to_owned()),
                ("from", from_ms.to_string()),
                ("to", to_ms.to_string()),
                ("limit", limit.max(1).to_string()),
            ],
        )
        .await
    }

    pub async fn fetch_hrv(&self, start_date: &str, end_date: &str) -> Result<Value> {
        let start = chrono::NaiveDate::parse_from_str(start_date, "%Y-%m-%d")
            .map_err(|_| ZeppBridgeError::ConfigError("start_date 无效".into()))?
            .and_hms_opt(0, 0, 0)
            .ok_or_else(|| ZeppBridgeError::ConfigError("start_date 无效".into()))?
            .and_utc()
            .timestamp_millis();
        let end = chrono::NaiveDate::parse_from_str(end_date, "%Y-%m-%d")
            .map_err(|_| ZeppBridgeError::ConfigError("end_date 无效".into()))?
            .and_hms_opt(23, 59, 59)
            .ok_or_else(|| ZeppBridgeError::ConfigError("end_date 无效".into()))?
            .and_utc()
            .timestamp_millis();
        self.fetch_events("hrv_sdnn", Some("real_data"), start, end, 2000, true)
            .await
    }
}

#[cfg(test)]
mod tests;

#[cfg(test)]
mod retry_policy_tests {
    use super::*;

    #[test]
    fn retry_after_seconds_are_honoured_and_capped() {
        let mut headers = header::HeaderMap::new();
        headers.insert(header::RETRY_AFTER, header::HeaderValue::from_static("2"));
        assert_eq!(retry_after_ms(&headers), Some(2_000));

        // 服务器说等一小时也不能真等一小时。
        headers.insert(
            header::RETRY_AFTER,
            header::HeaderValue::from_static("3600"),
        );
        assert_eq!(retry_after_ms(&headers), Some(MAX_BACKOFF_MS));
    }

    #[test]
    fn a_past_http_date_means_retry_now_and_garbage_means_no_opinion() {
        let mut headers = header::HeaderMap::new();
        headers.insert(
            header::RETRY_AFTER,
            header::HeaderValue::from_static("Wed, 21 Oct 2020 07:28:00 GMT"),
        );
        assert_eq!(retry_after_ms(&headers), Some(0));

        headers.insert(
            header::RETRY_AFTER,
            header::HeaderValue::from_static("soon-ish"),
        );
        assert_eq!(
            retry_after_ms(&headers),
            None,
            "读不懂的 Retry-After 应当交回给我们自己的退避，而不是当成 0"
        );

        assert_eq!(retry_after_ms(&header::HeaderMap::new()), None);
    }

    /// 退避必须真的随尝试次数变长，而且始终落在上限之内。
    #[test]
    fn exponential_backoff_grows_and_stays_bounded() {
        // 抖动是随机的，所以按区间断言而不是按具体值。
        for attempt in 0..6 {
            let value = exponential_backoff_ms(attempt, 200);
            assert!(
                value <= MAX_BACKOFF_MS,
                "第 {attempt} 次退避 {value} 超过上限"
            );
        }
        let early: u64 = (0..12).map(|_| exponential_backoff_ms(0, 200)).sum();
        let later: u64 = (0..12).map(|_| exponential_backoff_ms(3, 200)).sum();
        assert!(later > early, "退避没有随尝试次数变长：{early} -> {later}");

        // 基数为 0（重试表用完）时也必须真的等一会儿，否则「退避」是假的。
        assert!(exponential_backoff_ms(0, 0) > 0);
    }
}
