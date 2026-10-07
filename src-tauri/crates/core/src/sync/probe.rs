//! 同步前先探云端新不新（第四轮 1E，用户 10-07）。
//!
//! 链路是 手表 → 手机 Zepp（蓝牙）→ 云端 → ZeppBridge，电脑叫不动手表也叫不动手机。用户在电脑上点
//! 「同步」时，手机多半还没把手表的新数据传上去：以前照样跑完整套七八条流（十几到几十秒），结论是
//! 「没有新数据」，看不出该去手机上下拉一下。
//!
//! 现在正式同步前先发一个最轻的请求：**本地最新那条心率之后，云端还有没有心率**。心率是逐分钟的
//! 连续流，手机每同步一次它一定往前走；没往前走，别的流也不会新（同一次手机同步一起上传）。
//!
//! - 旧通道：`/users/{id}/heartRate?startTime=<本地最新+1 秒>&limit=1`，有一条就是新的。这个接口按时间
//!   升序翻页（见 `fetcher/pages.rs` 的游标），所以「从本地最新之后取一条」恰好回答这个问题。
//! - 只连官方：官方心率只能按天取，取今天（本地时区）一天，看最大的时间戳。
//!
//! 探不出结论（超时、网络错、令牌问题、认不出的报文）一律当「不知道」，照常同步——探针只能省事，不能挡事。
//! 下面三种情况根本不探，直接同步：
//! - 本地还没有心率（第一次同步）；
//! - 本地最新心率已经是两天前：心率监测可能关了，这时「心率没往前走」不代表别的流也没新；
//! - 整窗刷新到期（一天一次）：晚到的数据靠它补，不能被探针挡掉。

use super::*;
use crate::official::fetch::OfficialFetcher;
use crate::official::fresh_tokens;

/// 探针的总时限：超过就当不知道，照常同步。
pub const PROBE_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(3);

/// 本地最新心率比这更旧，就不信「心率没往前走」这件事，直接同步。
pub fn probe_trust_window() -> Duration {
    Duration::days(2)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CloudProbe {
    /// 云端有比本地新的数据：照常同步。
    Newer,
    /// 云端最新的就是本地已经有的那一刻：不跑整套同步。
    Stale { cloud_latest_at: DateTime<Utc> },
    /// 没探出来：照常同步。
    Unknown,
}

/// 要不要探、从哪一刻往后探。返回 `None` 就直接同步。
pub fn probe_since(
    local_newest_heart_rate: Option<&str>,
    now: DateTime<Utc>,
    full_refresh_due: bool,
) -> Option<DateTime<Utc>> {
    if full_refresh_due {
        return None;
    }
    let newest = DateTime::parse_from_rfc3339(local_newest_heart_rate?)
        .ok()?
        .with_timezone(&Utc);
    // 本地时间戳在未来（时钟错乱、时区写错的报文）：不靠它判断。
    if newest > now || now - newest > probe_trust_window() {
        return None;
    }
    Some(newest)
}

/// 云端最新的那一刻和本地比。云端没给出时刻（空页）就是「不新」。
pub fn conclude(since: DateTime<Utc>, cloud_newest: Option<DateTime<Utc>>) -> CloudProbe {
    match cloud_newest {
        Some(at) if at > since => CloudProbe::Newer,
        _ => CloudProbe::Stale {
            cloud_latest_at: since,
        },
    }
}

/// 把一次探测（可能失败、可能超时）归成三种结论之一。
async fn bounded<F>(since: DateTime<Utc>, probe: F) -> CloudProbe
where
    F: std::future::Future<Output = Result<Option<DateTime<Utc>>>>,
{
    bounded_within(PROBE_TIMEOUT, since, probe).await
}

async fn bounded_within<F>(limit: std::time::Duration, since: DateTime<Utc>, probe: F) -> CloudProbe
where
    F: std::future::Future<Output = Result<Option<DateTime<Utc>>>>,
{
    match tokio::time::timeout(limit, probe).await {
        Ok(Ok(newest)) => conclude(since, newest),
        Ok(Err(error)) => {
            tracing::info!("同步前探云端没有结论，照常同步: {error}");
            CloudProbe::Unknown
        }
        Err(_) => {
            tracing::info!("同步前探云端超过 {limit:?}，照常同步");
            CloudProbe::Unknown
        }
    }
}

impl SyncManager {
    /// 旧通道：本地最新心率之后云端还有没有心率。不拿写锁、不写库。
    pub async fn probe_cloud(&self, since: DateTime<Utc>) -> CloudProbe {
        bounded(since, self.fetcher.heart_rate_after(since)).await
    }
}

impl OfficialSync {
    /// 只连官方：今天（本地时区）的心率里最新的那一刻。不拿写锁、不写库；令牌需要刷新时照常刷新。
    pub async fn probe_cloud(&self, since: DateTime<Utc>) -> CloudProbe {
        bounded(since, async {
            let Some(tokens) =
                fresh_tokens(&self.store, &self.client, Utc::now().timestamp()).await?
            else {
                return Err(ZeppBridgeError::NeedsReauth(
                    "还没有连接 Zepp 官方授权".into(),
                ));
            };
            let fetcher = OfficialFetcher {
                client: &self.client,
                access_token: &tokens.access_token,
                time_zone: self.time_zone.clone(),
            };
            let today = crate::official::fetch::local_today(&self.time_zone);
            fetcher.newest_heart_rate(today).await
        })
        .await
    }
}

#[cfg(test)]
#[path = "probe_tests.rs"]
mod tests;
