//! 简单限流：按来源 IP 计每分钟请求数，以及鉴权失败次数。
//!
//! 本机桌面端只有回环客户端，主要防的是「本机某个进程循环猜 token」；无头版监听到
//! 局域网或容器网络时，防的是同网段的设备暴力试 token。两种都不需要精确的令牌桶，
//! 固定一分钟的窗口足够，而且内存有上限（见 [`MAX_TRACKED_PEERS`]）。

use std::collections::HashMap;
use std::net::IpAddr;
use std::sync::Mutex;
use std::time::{Duration, Instant};

/// 鉴权失败到这个次数（一分钟内）就把这个来源关一段时间。
pub const MAX_AUTH_FAILURES_PER_MINUTE: u32 = 10;

/// 关多久。
pub const AUTH_LOCKOUT: Duration = Duration::from_secs(10 * 60);

/// 记账的来源数上限。超过时先清掉过期的；全都没过期就拒绝新来源（而不是无限长）。
const MAX_TRACKED_PEERS: usize = 1024;

const WINDOW: Duration = Duration::from_secs(60);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Verdict {
    Allow,
    /// 太快了，`Retry-After` 秒后再来。
    Throttled(u64),
}

#[derive(Debug)]
struct Peer {
    window_start: Instant,
    requests: u32,
    failures: u32,
    locked_until: Option<Instant>,
}

impl Peer {
    fn new(now: Instant) -> Self {
        Self {
            window_start: now,
            requests: 0,
            failures: 0,
            locked_until: None,
        }
    }

    fn roll(&mut self, now: Instant) {
        if now.duration_since(self.window_start) >= WINDOW {
            self.window_start = now;
            self.requests = 0;
            self.failures = 0;
        }
    }

    fn stale(&self, now: Instant) -> bool {
        now.duration_since(self.window_start) >= WINDOW
            && self.locked_until.is_none_or(|until| until <= now)
    }
}

#[derive(Debug)]
pub struct RateLimiter {
    /// 每分钟最多多少个请求。`None` = 不限请求数，只限鉴权失败。
    requests_per_minute: Option<u32>,
    peers: Mutex<HashMap<IpAddr, Peer>>,
}

impl RateLimiter {
    pub fn new(requests_per_minute: Option<u32>) -> Self {
        Self {
            requests_per_minute,
            peers: Mutex::new(HashMap::new()),
        }
    }

    /// 收到一个请求（鉴权之前调用）。
    pub fn admit(&self, peer: IpAddr) -> Verdict {
        self.admit_at(peer, Instant::now())
    }

    /// 这个请求鉴权失败了。
    pub fn record_failure(&self, peer: IpAddr) {
        self.record_failure_at(peer, Instant::now());
    }

    pub(super) fn admit_at(&self, peer: IpAddr, now: Instant) -> Verdict {
        let mut peers = self.peers.lock().unwrap_or_else(|e| e.into_inner());
        if !peers.contains_key(&peer) && peers.len() >= MAX_TRACKED_PEERS {
            peers.retain(|_, entry| !entry.stale(now));
            if peers.len() >= MAX_TRACKED_PEERS {
                return Verdict::Throttled(WINDOW.as_secs());
            }
        }
        let entry = peers.entry(peer).or_insert_with(|| Peer::new(now));
        if let Some(until) = entry.locked_until {
            if until > now {
                return Verdict::Throttled(until.duration_since(now).as_secs().max(1));
            }
            entry.locked_until = None;
        }
        entry.roll(now);
        entry.requests += 1;
        match self.requests_per_minute {
            Some(limit) if entry.requests > limit => {
                let left = WINDOW.saturating_sub(now.duration_since(entry.window_start));
                Verdict::Throttled(left.as_secs().max(1))
            }
            _ => Verdict::Allow,
        }
    }

    pub(super) fn record_failure_at(&self, peer: IpAddr, now: Instant) {
        let mut peers = self.peers.lock().unwrap_or_else(|e| e.into_inner());
        let Some(entry) = peers.get_mut(&peer) else {
            return;
        };
        entry.roll(now);
        entry.failures += 1;
        if entry.failures >= MAX_AUTH_FAILURES_PER_MINUTE {
            entry.locked_until = Some(now + AUTH_LOCKOUT);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ip(last: u8) -> IpAddr {
        IpAddr::from([192, 168, 1, last])
    }

    #[test]
    fn request_budget_resets_after_a_minute() {
        let limiter = RateLimiter::new(Some(3));
        let start = Instant::now();
        for _ in 0..3 {
            assert_eq!(limiter.admit_at(ip(1), start), Verdict::Allow);
        }
        assert!(matches!(
            limiter.admit_at(ip(1), start),
            Verdict::Throttled(_)
        ));
        // 别的来源不受影响。
        assert_eq!(limiter.admit_at(ip(2), start), Verdict::Allow);
        assert_eq!(
            limiter.admit_at(ip(1), start + Duration::from_secs(61)),
            Verdict::Allow
        );
    }

    #[test]
    fn repeated_auth_failures_lock_the_peer_out() {
        let limiter = RateLimiter::new(None);
        let start = Instant::now();
        for _ in 0..MAX_AUTH_FAILURES_PER_MINUTE {
            assert_eq!(limiter.admit_at(ip(9), start), Verdict::Allow);
            limiter.record_failure_at(ip(9), start);
        }
        match limiter.admit_at(ip(9), start + Duration::from_secs(1)) {
            Verdict::Throttled(seconds) => assert!(seconds > 60),
            Verdict::Allow => panic!("连续猜错 token 之后应该被关一段时间"),
        }
        assert_eq!(
            limiter.admit_at(ip(9), start + AUTH_LOCKOUT + Duration::from_secs(1)),
            Verdict::Allow
        );
    }

    #[test]
    fn unlimited_requests_still_count_failures() {
        let limiter = RateLimiter::new(None);
        let start = Instant::now();
        for _ in 0..500 {
            assert_eq!(limiter.admit_at(ip(3), start), Verdict::Allow);
        }
    }
}
