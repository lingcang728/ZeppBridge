//! 窗口不可见时的自动同步兜底（10-28 macOS 反馈，3.1.1）。
//!
//! 自动同步本来只有前端那只每分钟一跳的定时器（`useSyncController.ts`）。窗口关到
//! 托盘、锁屏、息屏之后，WebView 的定时器会被系统节流甚至停掉，于是一整夜都不同步。
//! 这里在后端放一只闹钟：每 60 秒看一次，**只在窗口不可见时**接手——开着、已连接、
//! 没在同步、到点了，就走和「同步」按钮同一条路（`commands::sync::background_quick_sync`，
//! 同样的进度事件和 run lock）。窗口可见时仍由前端管，两边共用 run lock 兜底。
//!
//! 开关和间隔存在前端的 localStorage 里，前端启动和改设置时用 `set_auto_sync_prefs`
//! 抄一份过来；没抄过来之前闹钟不动（不替用户猜他开没开自动同步）。

use std::sync::Mutex;
use std::time::{Duration, Instant};

use chrono::{DateTime, Utc};
use tauri::{AppHandle, Emitter, Manager};

use crate::app_state::AppState;

const TICK: Duration = Duration::from_secs(60);

#[derive(Default)]
struct Inner {
    /// 前端抄过来的设置；`None` 表示还没抄过来。
    prefs: Option<(bool, u32)>,
    /// 闹钟自己上一次发起同步的时刻和连续失败次数（只算闹钟发起的）。
    last_attempt: Option<Instant>,
    failures: u32,
}

#[derive(Default)]
pub(crate) struct AutoSyncAlarm(Mutex<Inner>);

/// 失败后多久再试：1 / 2 / 4 / 8 分钟，封顶到间隔；没失败就是整个间隔。
/// 和前端 `src/lib/autoSync.ts` 的 `autoSyncRetryMinutes` 同一条规则。
pub(crate) fn retry_minutes(failures: u32, interval_minutes: u32) -> u32 {
    if failures == 0 {
        return interval_minutes;
    }
    (1u32 << (failures - 1).min(3)).min(interval_minutes)
}

/// 到没到点：上次成功同步离现在满一个间隔，且离闹钟上次尝试满退避时长。
pub(crate) fn due(
    last_cloud_sync_at: Option<&str>,
    since_last_attempt: Option<Duration>,
    failures: u32,
    interval_minutes: u32,
    now: DateTime<Utc>,
) -> bool {
    let interval = i64::from(interval_minutes) * 60;
    let synced_long_ago =
        match last_cloud_sync_at.and_then(|v| DateTime::parse_from_rfc3339(v).ok()) {
            // 时间戳坏了、或者时钟回跳：宁可多跑一趟（和前端 launchSyncIsDue 一样）。
            Some(at) => {
                let elapsed = (now - at.with_timezone(&Utc)).num_seconds();
                elapsed < 0 || elapsed >= interval
            }
            None => true,
        };
    let backed_off = since_last_attempt.is_none_or(|elapsed| {
        elapsed >= Duration::from_secs(u64::from(retry_minutes(failures, interval_minutes)) * 60)
    });
    synced_long_ago && backed_off
}

/// 前端把自动同步的开关和间隔抄给后端。间隔只收设置页给得出的值，别的按 15 分钟。
#[tauri::command]
pub(crate) fn set_auto_sync_prefs(
    alarm: tauri::State<'_, AutoSyncAlarm>,
    enabled: bool,
    interval_minutes: u32,
) {
    let interval = if [15, 30, 60].contains(&interval_minutes) {
        interval_minutes
    } else {
        15
    };
    if let Ok(mut inner) = alarm.0.lock() {
        inner.prefs = Some((enabled, interval));
    }
}

fn window_visible(app: &AppHandle) -> bool {
    app.get_webview_window("main").is_some_and(|window| {
        window.is_visible().unwrap_or(true) && !window.is_minimized().unwrap_or(false)
    })
}

pub(crate) fn spawn(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(TICK).await;
            if crate::EXIT_GATE.is_exiting() {
                break;
            }
            tick(&app).await;
        }
    });
}

async fn tick(app: &AppHandle) {
    let Some(alarm) = app.try_state::<AutoSyncAlarm>() else {
        return;
    };
    let (interval, since_last_attempt, failures) = {
        let Ok(inner) = alarm.0.lock() else {
            return;
        };
        match inner.prefs {
            Some((true, interval)) => (
                interval,
                inner.last_attempt.map(|at| at.elapsed()),
                inner.failures,
            ),
            _ => return,
        }
    };
    if window_visible(app) {
        return;
    }
    // AppState 在初始化线程里才挂上；还没就绪就下一跳再看。
    let Some(state) = app.try_state::<AppState>() else {
        return;
    };
    // 正在同步（前端发起的、补拉）就不排队：排上了等于紧接着再同步一遍。
    if state.sync_command_lock.try_lock().is_err() {
        return;
    }
    let last = {
        let data_dir = state.data_dir.clone();
        crate::commands::spawn_independent_read(data_dir, |db| db.cloud_sync_metadata())
            .await
            .ok()
            .and_then(|(at, _)| at)
    };
    if !due(
        last.as_deref(),
        since_last_attempt,
        failures,
        interval,
        Utc::now(),
    ) {
        return;
    }
    if let Ok(mut inner) = alarm.0.lock() {
        inner.last_attempt = Some(Instant::now());
    }
    crate::diagnostics::log("Auto sync: window hidden, the backend alarm starts a quick sync");
    let result = crate::commands::background_quick_sync(app, &state).await;
    let failed = match &result {
        Ok(report) => report.outcome == "failed",
        // 没连上 / 没验证不算失败：那是没得同步，不该把退避拉长。
        Err(error) => !matches!(
            error.code.as_str(),
            "err.sync.not_connected"
                | "err.sync.not_verified"
                | "err.sync.not_verified_probe"
                | "err.sync.not_verified_backfill"
        ),
    };
    if let Ok(mut inner) = alarm.0.lock() {
        inner.failures = if failed {
            inner.failures.saturating_add(1)
        } else {
            0
        };
    }
    // 窗口回来时前端据此重读状态、刷新各页（它没发起这一趟，不会自己去读）。
    if let Ok(report) = result {
        let _ = app.emit("sync://background-finished", report);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn failures_back_off_one_two_four_eight_minutes_capped_at_the_interval() {
        assert_eq!(retry_minutes(0, 15), 15);
        assert_eq!(
            (1..=6).map(|n| retry_minutes(n, 15)).collect::<Vec<_>>(),
            [1, 2, 4, 8, 8, 8]
        );
        // 间隔比退避短时封顶到间隔（设置页最短 15 分钟，这里只防万一）。
        assert_eq!(retry_minutes(4, 5), 5);
    }

    #[test]
    fn the_alarm_waits_for_the_interval_and_for_the_backoff() {
        let now = DateTime::parse_from_rfc3339("2026-11-03T08:00:00Z")
            .unwrap()
            .with_timezone(&Utc);
        // 从没同步过：到点。
        assert!(due(None, None, 0, 15, now));
        // 十分钟前刚同步过：没到点。
        assert!(!due(Some("2026-11-03T07:50:00Z"), None, 0, 15, now));
        // 一小时前同步过、闹钟两分钟前试过一次失败了：第二次失败后要等 2 分钟，到点。
        let hour_ago = Some("2026-11-03T07:00:00Z");
        assert!(due(hour_ago, Some(Duration::from_secs(120)), 2, 15, now));
        // 第三次失败后要等 4 分钟，两分钟还不够。
        assert!(!due(hour_ago, Some(Duration::from_secs(120)), 3, 15, now));
        // 上次是成功的（失败数清零）但 cloud_stale 没记时间：等满整个间隔再试。
        assert!(!due(hour_ago, Some(Duration::from_secs(600)), 0, 15, now));
        assert!(due(hour_ago, Some(Duration::from_secs(900)), 0, 15, now));
        // 时间戳坏了：宁可多跑一趟。
        assert!(due(Some("garbage"), None, 0, 15, now));
    }
}
