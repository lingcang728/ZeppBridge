use crate::connectors::ZeppConnector;

use crate::models::{error::*, *};

use chrono::{DateTime, Duration, NaiveDate, Utc};

use serde_json::Value;

use std::collections::BTreeSet;

mod pages;
mod probe;
mod wellness;

use pages::*;
pub use probe::*;
use wellness::*;

#[derive(Debug, Clone, Copy)]
pub struct FetchWindow {
    pub start_utc: DateTime<Utc>,
    pub end_utc: DateTime<Utc>,
}

impl FetchWindow {
    /// 常规同步窗口。上限仍是 365 天：一次请求覆盖太长会让服务端超时。
    /// 想要更早的历史请走历史补拉，它按月分块并且可以断点续传。
    pub fn days(days: i64) -> Result<Self> {
        if !(1..=365).contains(&days) {
            return Err(ZeppBridgeError::ConfigError(
                "同步窗口天数必须在 1..=365".into(),
            ));
        }
        let end_utc = Utc::now();
        Ok(Self {
            start_utc: end_utc - Duration::days(days),
            end_utc,
        })
    }

    /// 任意区间。历史补拉自己按月切块，所以不受 365 天限制；这里只保证
    /// 区间方向正确。
    pub fn between(start_utc: DateTime<Utc>, end_utc: DateTime<Utc>) -> Result<Self> {
        if end_utc <= start_utc {
            return Err(ZeppBridgeError::ConfigError(
                "抓取窗口的结束时间必须晚于开始时间".into(),
            ));
        }
        Ok(Self { start_utc, end_utc })
    }

    pub fn start_day(&self) -> String {
        self.start_utc.format("%Y-%m-%d").to_string()
    }

    pub fn end_day(&self) -> String {
        // Timestamp windows are half-open; day endpoints include both dates.
        self.end_utc
            .checked_sub_signed(Duration::nanoseconds(1))
            .unwrap_or(self.end_utc)
            .format("%Y-%m-%d")
            .to_string()
    }

    /// 按「设备本地日」归档的接口要的终点日：UTC 终点日再往后一天。
    ///
    /// 睡眠（band_data detail）和 WatchSportStatistics 按设备本地的日期归档——睡眠记在
    /// **醒来那天**。东八区早上 7 点醒，本地是 10 月 1 日，UTC 还是 9 月 30 日：按 UTC
    /// 日期请求就拿不到昨晚的睡眠，要等到 8 点以后（同步报告还写着成功）。任何时区的
    /// 本地日期最多比 UTC 早一天，所以终点多要一天就够；西半球多出来的那天是空的。
    pub fn end_day_local_padded(&self) -> String {
        let end = (self.end_utc - Duration::nanoseconds(1)).date_naive();
        end.succ_opt().unwrap_or(end).format("%Y-%m-%d").to_string()
    }

    /// Convert the half-open timestamp window to inclusive device-local dates.
    /// Use the zone's rules at each endpoint, including historical DST changes.
    fn local_days(&self, time_zone: &str) -> Result<(NaiveDate, NaiveDate)> {
        let zone = jiff::tz::TimeZone::get(time_zone)
            .map_err(|error| ZeppBridgeError::ConfigError(error.to_string()))?;
        let date = |instant: DateTime<Utc>| -> Result<NaiveDate> {
            let timestamp = jiff::Timestamp::from_second(instant.timestamp())
                .map_err(|error| ZeppBridgeError::ConfigError(error.to_string()))?;
            NaiveDate::parse_from_str(
                &timestamp.to_zoned(zone.clone()).date().to_string(),
                "%Y-%m-%d",
            )
            .map_err(|error| ZeppBridgeError::ConfigError(error.to_string()))
        };
        Ok((
            date(self.start_utc)?,
            date(self.end_utc - Duration::nanoseconds(1))?,
        ))
    }

    pub fn chunks(self, chunk_days: i64) -> Vec<Self> {
        let chunk_days = chunk_days.max(1);
        let mut chunks = Vec::new();
        let mut cursor = self.start_utc;
        while cursor < self.end_utc {
            let next = (cursor + Duration::days(chunk_days)).min(self.end_utc);
            if next > cursor {
                chunks.push(Self {
                    start_utc: cursor,
                    end_utc: next,
                });
            }
            cursor = next;
        }
        if chunks.is_empty() {
            chunks.push(self);
        }
        chunks
    }

    /// 按 UTC 日切开，每一天都是**整天**：从当天零点到次日零点，今天到 `now`。
    ///
    /// 心率报文按这个切、按日起键（`heart_rate:day:<日期>:<页>`）。以前键里带着窗口
    /// 两端的秒数，而窗口跟着「现在」走：每 15 分钟一次同步就多出几条新报文，一天几百
    /// 条、永不清理，整库重放也跟着越来越慢。按整天取，过去的日子每次请求都一模一样，
    /// 「内容不变就跳过」才对它生效；今天那一条随着时间变长，原地覆盖。
    ///
    /// 第一天也从零点取，不从窗口起点：同一天的键必须永远对应同一段时间，半天的报文
    /// 不能盖掉整天的。
    pub fn utc_days(self, now: DateTime<Utc>) -> Vec<(NaiveDate, Self)> {
        let first = self.start_utc.date_naive();
        let last = (self.end_utc - Duration::nanoseconds(1)).date_naive();
        let mut out = Vec::new();
        let mut day = first;
        while day <= last {
            let (start_utc, next) = crate::event_days::day_bounds(day);
            let end_utc = next.min(now.max(start_utc + Duration::seconds(1)));
            out.push((day, Self { start_utc, end_utc }));
            let Some(following) = day.succ_opt() else {
                break;
            };
            day = following;
        }
        out
    }

    /// 与 [`Self::chunks`] 同一组切片，但从最新一块排起。
    ///
    /// 切片边界不变（报文的 source_key 跟着边界走），只是先拉离现在最近的那块：
    /// 首页要的是「最新心率 / 今天步数 / 昨晚睡眠」，不该等整段历史拉完。
    pub fn chunks_newest_first(self, chunk_days: i64) -> Vec<Self> {
        let mut chunks = self.chunks(chunk_days);
        chunks.reverse();
        chunks
    }
}

/// A fetch result keeps endpoint/source identity beside its raw payload. This
/// is what allows sync to retain provenance before normalization.
#[derive(Debug, Clone)]
pub struct FetchedRecord {
    pub raw: RawRecord,
    /// 请求窗口里有子切片失败（404 / 不可用），但别的切片已经拿到了报文。
    ///
    /// 调用方必须把整段窗口当成未完成：已经拿到的数据可以写库，但不能把
    /// 这个月记成 persisted / empty_from_cloud。
    pub incomplete: bool,
    /// Diagnostic context for partial fetches; never replaces successfully fetched data.
    pub incomplete_reason: Option<String>,
}

impl FetchedRecord {
    fn from_raw(raw: RawRecord) -> Self {
        Self {
            raw,
            incomplete: false,
            incomplete_reason: None,
        }
    }
}

pub struct DataFetcher {
    connector: ZeppConnector,
}

impl DataFetcher {
    pub fn new(connector: ZeppConnector) -> Self {
        Self { connector }
    }

    pub async fn fetch_heart_rate_records(
        &self,
        window: FetchWindow,
    ) -> Result<Vec<FetchedRecord>> {
        let mut records = Vec::new();
        let mut last_error = None;
        for (day, chunk) in window.utc_days(Utc::now()) {
            match fetch_heart_rate_pages_with(day, chunk, |cursor, end| {
                self.connector
                    .fetch_heart_rate_with_options(cursor, end, HEART_RATE_PAGE_LIMIT, 2)
            })
            .await
            {
                Ok(pages) => records.extend(pages),
                Err(error) if is_abort_error(&error) => return Err(error),
                Err(error) if error.is_unavailable() => last_error = Some(error),
                Err(error) => return Err(error),
            }
        }
        conclude_slices(records, last_error, "心率窗口没有可识别记录")
    }

    /// 同步前探云端（`sync/probe.rs`）：`since` 之后云端最早的那一条心率是什么时刻；一条都没有是 `None`。
    ///
    /// 只要一条（`limit=1`）：接口按时间升序翻页，有没有比本地新的，一条就够回答。不落库、不留报文。
    pub async fn heart_rate_after(&self, since: DateTime<Utc>) -> Result<Option<DateTime<Utc>>> {
        let start = since.timestamp() + 1;
        let end = Utc::now().timestamp();
        if end <= start {
            return Ok(None);
        }
        let payload = self
            .connector
            .fetch_heart_rate_with_options(start, end, 1, 2)
            .await?;
        let items = heart_rate_items(&payload);
        Ok(heart_rate_cursor(&items).and_then(|next| DateTime::from_timestamp(next - 1, 0)))
    }

    pub async fn fetch_sport_detail_record(
        &self,
        workout_id: &str,
        source: &str,
        start_utc: DateTime<Utc>,
        end_utc: Option<DateTime<Utc>>,
    ) -> Result<FetchedRecord> {
        let payload = self
            .connector
            .fetch_sport_detail(workout_id, source)
            .await?;
        Ok(FetchedRecord::from_raw(RawRecord {
            stream: "workout_detail".into(),
            source_key: format!("workout_detail:{workout_id}:{source}"),
            source_scope: SourceScope::Device,
            device_id: None,
            start_utc,
            end_utc,
            payload,
            capability: CapabilityStatus::Verified,
        }))
    }

    pub async fn fetch_sleep_records(&self, window: FetchWindow) -> Result<Vec<FetchedRecord>> {
        fetch_sleep_slices_with(window, |chunk| self.fetch_sleep_record(chunk)).await
    }

    pub async fn fetch_sleep_record(&self, window: FetchWindow) -> Result<FetchedRecord> {
        let payload = self
            .connector
            .fetch_band_data(
                &window.start_day(),
                &window.end_day_local_padded(),
                "detail",
                8,
                0,
            )
            .await?;
        let capability = crate::normalizer::Normalizer::band_capability(&payload);
        Ok(FetchedRecord::from_raw(RawRecord {
            stream: "sleep".into(),
            source_key: format!(
                "band_data:detail:{}:{}",
                window.start_day(),
                window.end_day()
            ),
            source_scope: SourceScope::Device,
            device_id: None,
            start_utc: window.start_utc,
            end_utc: Some(window.end_utc),
            payload,
            capability,
        }))
    }

    /// Sport history uses track IDs, not timestamps. The range helper uses the
    /// UTC epoch as a conservative cursor window because no local track index is
    /// known yet; a server response with no structured records is reported as
    /// unavailable rather than as a successful empty workout stream.
    pub async fn fetch_workout_records(&self, window: FetchWindow) -> Result<Vec<FetchedRecord>> {
        let start = window.start_utc.timestamp();
        let end = window.end_utc.timestamp();
        let mut records = Vec::new();
        // Despite its path, Zepp's run history endpoint is the account-wide
        // workout feed. The activity kind lives in each record's numeric
        // `type`; sibling paths such as `/strength/history.json` normally 404
        // and must not be treated as separate feeds.
        let sports = ["run"];
        let mut last_optional_error = None;
        for sport in sports {
            // Zepp 单页记录数有上限；响应 data.next 是下一页的 stopTrackId
            // 游标（-1/0/缺失 = 没有更多）。不翻页会丢掉窗口内较早的记录。
            let mut stop_track_id = end;
            loop {
                match self
                    .connector
                    .fetch_sport_history(sport, start, stop_track_id, 1)
                    .await
                {
                    Ok(payload) => {
                        let next = payload
                            .pointer("/data/next")
                            .and_then(Value::as_i64)
                            .unwrap_or(-1);
                        records.push(FetchedRecord::from_raw(RawRecord {
                            stream: "workouts".into(),
                            source_key: sport_history_key(sport, &payload),
                            source_scope: SourceScope::Device,
                            device_id: None,
                            start_utc: window.start_utc,
                            end_utc: Some(window.end_utc),
                            payload,
                            capability: CapabilityStatus::Verified,
                        }));
                        // 游标不再向窗口起点推进时停止，防止服务端异常造成死循环
                        if next <= 0 || next >= stop_track_id || next <= start {
                            break;
                        }
                        stop_track_id = next;
                    }
                    Err(error) if is_abort_error(&error) => return Err(error),
                    Err(error) if error.is_unavailable() => {
                        last_optional_error = Some(error);
                        break;
                    }
                    Err(error) => return Err(error),
                }
            }
        }
        if records.is_empty() {
            return Err(last_optional_error.unwrap_or_else(|| {
                ZeppBridgeError::Unavailable("sport history 没有可用种类".into())
            }));
        }
        Ok(records)
    }

    pub async fn fetch_hrv_records(&self, window: FetchWindow) -> Result<Vec<FetchedRecord>> {
        let mut records = Vec::new();
        let mut last_error = None;
        for chunk in window.chunks(7) {
            match self
                .connector
                .fetch_hrv(&chunk.start_day(), &chunk.end_day())
                .await
            {
                Ok(payload) => records.push(FetchedRecord::from_raw(RawRecord {
                    stream: "hrv".into(),
                    source_key: format!(
                        "events:hrv_sdnn:{}:{}",
                        chunk.start_day(),
                        chunk.end_day()
                    ),
                    source_scope: SourceScope::UserFused,
                    device_id: None,
                    start_utc: chunk.start_utc,
                    end_utc: Some(chunk.end_utc),
                    payload,
                    capability: CapabilityStatus::Verified,
                })),
                Err(error) if is_abort_error(&error) => return Err(error),
                Err(error) if error.is_unavailable() => last_error = Some(error),
                Err(error) => return Err(error),
            }
        }
        conclude_slices(records, last_error, "HRV 窗口没有可识别记录")
    }

    pub async fn fetch_daily_statistics_records(
        &self,
        window: FetchWindow,
    ) -> Result<Vec<FetchedRecord>> {
        fetch_daily_summary_slices_with(window, |slice| self.fetch_daily_statistics_slice(slice))
            .await
    }

    async fn fetch_daily_statistics_slice(
        &self,
        window: FetchWindow,
    ) -> Result<Vec<FetchedRecord>> {
        let mut records = Vec::new();
        let mut last_error = None;
        // 整 UTC 日取、按日存：见 `event_days` 顶部的说明。
        let (from, to) =
            crate::event_days::utc_day_aligned_millis(window.start_utc, window.end_utc, Utc::now());
        let event = self
            .connector
            .fetch_events("DailyHealth", Some("summary"), from, to, 2000, true)
            .await?;
        records.extend(event_day_records("DailyHealth", "summary", from, to, event));
        for (event_type, sub_type) in [("Charge", "real_data"), ("readiness", "watch_score")] {
            match self
                .connector
                .fetch_events(event_type, Some(sub_type), from, to, 2000, true)
                .await
            {
                Ok(payload) => {
                    records.extend(event_day_records(event_type, sub_type, from, to, payload))
                }
                Err(error) if is_abort_error(&error) => return Err(error),
                Err(error) if error.is_unavailable() => {}
                Err(error) => last_error = Some(error),
            }
        }
        for statistic in ["SPORT_LOAD", "VO2_MAX"] {
            match self
                .connector
                .fetch_watch_statistics(
                    statistic,
                    &window.start_day(),
                    &window.end_day_local_padded(),
                    900,
                    true,
                )
                .await
            {
                Ok(payload) => records.push(FetchedRecord::from_raw(RawRecord {
                    stream: "daily_summary".into(),
                    source_key: format!(
                        "WatchSportStatistics:{statistic}:{}:{}",
                        window.start_day(),
                        window.end_day()
                    ),
                    source_scope: SourceScope::UserFused,
                    device_id: None,
                    start_utc: window.start_utc,
                    end_utc: Some(window.end_utc),
                    payload,
                    capability: CapabilityStatus::Verified,
                })),
                Err(error) if is_abort_error(&error) => return Err(error),
                Err(error) if error.is_unavailable() => {}
                Err(error) => last_error = Some(error),
            }
        }
        conclude_slices(records, last_error, "每日概览窗口没有可识别记录")
    }
}

/// 运动历史一页报文的键：按**内容**起，不按请求窗口。
///
/// 这个接口按 track ID 游标翻页，请求的起点跟着「现在」走。以前键里带着起点秒数，
/// 每次同步都是一条新报文（开发库里 69 条里 67 条已经没有任何运动指向）。按内容起键：
/// 云端回的一样，就是同一条、跳过归一化；有了新运动就是新的一条，旧那条里的运动被
/// 新报文接管，没人指向了，由 `prune_superseded_page_raws` 清掉。流名前缀不变——
/// 归一化从键里取种类（`sport_history:<种类>:`）。
pub(crate) fn sport_history_key(sport: &str, payload: &Value) -> String {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(payload.to_string().as_bytes());
    let digest = hex::encode(hasher.finalize());
    format!("sport_history:{sport}:h{}", &digest[..16])
}

/// 一个每日事件窗口的响应 → 每个 UTC 日一条原始报文。
///
/// 空响应、认不出形状的响应、以及取不出时间戳的那几条，照旧按窗口存一条：
/// 「这个窗口是空的」本身也是要留下的事实。它的键终点取当天最后一毫秒，同一天
/// 里重拉是覆盖。
fn event_day_records(
    event_type: &str,
    sub_type: &str,
    from: i64,
    to: i64,
    payload: Value,
) -> Vec<FetchedRecord> {
    let record = |source_key: String, start_utc, end_utc, payload| {
        FetchedRecord::from_raw(RawRecord {
            stream: "daily_summary".into(),
            source_key,
            source_scope: SourceScope::UserFused,
            device_id: None,
            start_utc,
            end_utc: Some(end_utc),
            payload,
            capability: CapabilityStatus::Verified,
        })
    };
    let whole = |payload| {
        let start = DateTime::<Utc>::from_timestamp_millis(from).unwrap_or_default();
        let end = DateTime::<Utc>::from_timestamp_millis(to.saturating_add(1)).unwrap_or(start);
        let key_to = crate::event_days::end_of_utc_day_millis(to);
        record(
            format!("events:{event_type}:{sub_type}:{from}:{key_to}"),
            start,
            end,
            payload,
        )
    };
    let Some(split) = crate::event_days::split_by_utc_day(&payload) else {
        return vec![whole(payload)];
    };
    let mut records: Vec<FetchedRecord> = split
        .days
        .into_iter()
        .map(|(day, payload)| {
            let (start, end) = crate::event_days::day_bounds(day);
            record(
                crate::event_days::day_source_key(event_type, sub_type, day),
                start,
                end,
                payload,
            )
        })
        .collect();
    if let Some(residual) = split.residual {
        records.push(whole(residual));
    }
    records
}

#[cfg(test)]
mod tests;
