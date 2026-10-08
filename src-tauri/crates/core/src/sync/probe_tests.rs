//! 同步前探云端的门：探针只能省事、不能挡事——该同步的时候绝不能被它拦下。

use super::*;

fn at(text: &str) -> DateTime<Utc> {
    DateTime::parse_from_rfc3339(text)
        .unwrap()
        .with_timezone(&Utc)
}

#[test]
fn probes_only_when_the_local_heart_rate_is_recent_and_no_full_refresh_is_due() {
    let now = at("2026-10-07T12:00:00Z");
    assert_eq!(
        probe_since(Some("2026-10-07T08:12:00Z"), now, false),
        Some(at("2026-10-07T08:12:00Z"))
    );
    // 第一次同步：没有本地心率，直接同步。
    assert_eq!(probe_since(None, now, false), None);
    // 整窗刷新到期（一天一次）：晚到的数据靠它补，不能被探针挡掉。
    assert_eq!(probe_since(Some("2026-10-07T08:12:00Z"), now, true), None);
    // 本地心率两天多以前：心率监测可能关了，「心率没往前走」说明不了别的流。
    assert_eq!(probe_since(Some("2026-10-05T08:00:00Z"), now, false), None);
    // 本地时间戳在未来、或者认不出：不靠它判断。
    assert_eq!(probe_since(Some("2026-10-08T08:00:00Z"), now, false), None);
    assert_eq!(probe_since(Some("not a time"), now, false), None);
}

#[test]
fn only_a_strictly_newer_cloud_sample_counts_as_new() {
    let since = at("2026-10-07T08:12:00Z");
    assert_eq!(
        conclude(since, Some(at("2026-10-07T08:13:00Z"))),
        CloudProbe::Newer
    );
    for cloud in [since, at("2026-10-07T07:00:00Z")] {
        assert_eq!(
            conclude(since, Some(cloud)),
            CloudProbe::Stale {
                cloud_latest_at: cloud
            }
        );
    }
}

/// 10-08 用户实测：`/heartRate` 在他的账号上永远是空页，空页被当成「不新」，手机同步过也一直被挡。
/// 云端一条心率都没给，只能说明这个来源答不了，不能挡住同步。
#[test]
fn an_empty_cloud_answer_never_blocks_the_sync() {
    let since = at("2026-10-07T08:41:00Z");
    assert_eq!(conclude(since, None), CloudProbe::Unknown);
}

#[tokio::test]
async fn a_failed_probe_falls_back_to_a_full_sync() {
    let since = at("2026-10-07T08:12:00Z");
    let failed = bounded(since, async {
        Err::<Option<DateTime<Utc>>, _>(ZeppBridgeError::Unavailable("502".into()))
    })
    .await;
    assert_eq!(failed, CloudProbe::Unknown);
    let reauth = bounded(since, async {
        Err::<Option<DateTime<Utc>>, _>(ZeppBridgeError::NeedsReauth("expired".into()))
    })
    .await;
    assert_eq!(reauth, CloudProbe::Unknown);
}

#[tokio::test]
async fn a_slow_probe_gives_up_after_the_time_limit() {
    let since = at("2026-10-07T08:12:00Z");
    let limit = std::time::Duration::from_millis(50);
    let slow = bounded_within(limit, since, async {
        tokio::time::sleep(limit * 20).await;
        Ok(Some(at("2026-10-07T09:00:00Z")))
    })
    .await;
    assert_eq!(slow, CloudProbe::Unknown);
}

#[test]
fn official_heart_rate_ignores_minutes_without_a_reading() {
    let items: Vec<serde_json::Value> = serde_json::from_str(
        r#"[
            {"timestamp": 1791360000, "heartRateData": 62},
            {"timestamp": 1791360060, "heartRateData": 64.0},
            {"timestamp": 1791360120, "heartRateData": 0},
            {"timestamp": "1791360180", "heartRateData": 0}
        ]"#,
    )
    .unwrap();
    assert_eq!(
        crate::official::fetch::newest_heart_rate_at(&items),
        DateTime::from_timestamp(1791360060, 0)
    );
    assert_eq!(crate::official::fetch::newest_heart_rate_at(&[]), None);
}
