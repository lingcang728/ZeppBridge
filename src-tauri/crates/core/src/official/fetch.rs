//! 官方数据接口的拉取：按 ≤90 天分块、从新到旧，检测静默截断，按天拆成原始报文。
//!
//! 三条实测过的事实决定了这里的形状（2026-09-29，用户本人账号）：
//!
//! - **长区间会被静默截断**：服务端把 endDate 截到 startDate 之后约 500 天，照样回 200、
//!   不给分页提示，丢掉的是**最新**那一段。所以每块不超过 [`MAX_CHUNK_DAYS`]，而且一块
//!   回来以后看最后一天：离请求的结束日还差一截，就从断处再要一次（[`needs_tail`]）。
//! - 日期参数两端都含（`startDate=09-22&endDate=09-29&interval=daily` 回 8 天）。
//! - 报文按「天 / 条」拆开存：键是 `official:<种类>:<那一天或那一条>`。按请求窗口存的话，
//!   窗口每天往后挪一格，键就每天变一次，同一天的数据会越存越多份。
//!
//! 原始报文里顺手带上请求时用的时区：每小时步数只给「几点」，把它换成绝对时刻要知道
//! 是哪个时区的几点。报文自己说清楚，重放时就不用猜。

use super::OfficialClient;
use crate::models::{error::Result, CapabilityStatus, RawRecord, SourceScope, ZeppBridgeError};
use chrono::{DateTime, Datelike, Duration, NaiveDate, Utc};
use serde_json::{json, Value};
use std::collections::BTreeMap;

/// 一块最多这么多天。官方的截断发生在约 500 天，90 天离它很远，也让一次响应不至于太大。
pub const MAX_CHUNK_DAYS: i64 = 90;
/// 心率是逐分钟的，一天 1440 条：一块一周。
pub const HEART_RATE_CHUNK_DAYS: i64 = 7;
/// 一块回来的最后一天离请求结束日还差这么多天以上，就怀疑被截断了，从断处再要一次。
/// 真的没有数据（表没戴、没同步）时多出来的那次请求回空，也就停了。
pub const TRUNCATION_GAP_DAYS: i64 = 7;
/// 一块最多续要几次，防止服务端行为变了以后原地打转。
const MAX_TAIL_REQUESTS: usize = 3;

/// `raw_records.source_key` 的前缀：看到它就知道这是官方报文（`storage/official.rs`）。
pub const SOURCE_PREFIX: &str = "official:";
pub const PROVIDER: &str = "official";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OfficialKind {
    Sleep,
    HeartRate,
    ActivityDaily,
    ActivityHourly,
    Sports,
    SportDetail,
    Pai,
    Body,
}

impl OfficialKind {
    /// 落进哪条同步流。沿用旧通道的流名：进度、数据健康、重放都按流名走，
    /// 官方报文靠 `source_key` 前缀和 `provider` 列区分，不另起一套流。
    pub fn stream(self) -> &'static str {
        match self {
            Self::Sleep => "sleep",
            Self::HeartRate => "heart_rate",
            Self::ActivityDaily | Self::ActivityHourly => "daily_summary",
            Self::Sports => "workouts",
            Self::SportDetail => "workout_detail",
            Self::Pai => "wellness",
            Self::Body => "weight",
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Self::Sleep => "sleep",
            Self::HeartRate => "heart_rate",
            Self::ActivityDaily => "activity_daily",
            Self::ActivityHourly => "activity_hourly",
            Self::Sports => "sports",
            Self::SportDetail => "sport_detail",
            Self::Pai => "pai",
            Self::Body => "body",
        }
    }

    pub fn from_label(label: &str) -> Option<Self> {
        [
            Self::Sleep,
            Self::HeartRate,
            Self::ActivityDaily,
            Self::ActivityHourly,
            Self::Sports,
            Self::SportDetail,
            Self::Pai,
            Self::Body,
        ]
        .into_iter()
        .find(|kind| kind.label() == label)
    }

    /// 从 `official:<label>:...` 里认出种类。
    pub fn from_source_key(source_key: &str) -> Option<Self> {
        let rest = source_key.strip_prefix(SOURCE_PREFIX)?;
        Self::from_label(rest.split(':').next()?)
    }

    pub fn chunk_days(self) -> i64 {
        match self {
            Self::HeartRate => HEART_RATE_CHUNK_DAYS,
            _ => MAX_CHUNK_DAYS,
        }
    }

    fn path(self) -> &'static str {
        match self {
            Self::Sleep => "/users/-/sleep",
            Self::HeartRate => "/users/-/heartrates",
            Self::ActivityDaily | Self::ActivityHourly => "/users/-/activities",
            Self::Sports => "/users/-/sports",
            Self::SportDetail => "/users/-/sportDetail",
            Self::Pai => "/users/-/openData/PaiSummary",
            Self::Body => "/users/-/body",
        }
    }

    fn extra_query(self, time_zone: &str) -> Vec<(&'static str, String)> {
        match self {
            Self::Sleep | Self::ActivityDaily => vec![("interval", "daily".into())],
            Self::ActivityHourly => vec![("interval", "hourly".into())],
            Self::HeartRate => vec![("timezone", time_zone.into()), ("type", "ALL".into())],
            Self::Sports | Self::Body => vec![("timezone", time_zone.into())],
            Self::SportDetail | Self::Pai => Vec::new(),
        }
    }
}

/// `[start, end]`（两端都含）切成不超过 `days` 天的块，最新的一块排在最前。
pub fn date_chunks_newest_first(
    start: NaiveDate,
    end: NaiveDate,
    days: i64,
) -> Vec<(NaiveDate, NaiveDate)> {
    let days = days.max(1);
    let mut chunks = Vec::new();
    let mut chunk_end = end;
    while chunk_end >= start {
        let chunk_start = (chunk_end - Duration::days(days - 1)).max(start);
        chunks.push((chunk_start, chunk_end));
        let Some(next) = chunk_start.pred_opt() else {
            break;
        };
        chunk_end = next;
    }
    chunks
}

/// 一块回来的最后一天离结束日太远：从最后一天的下一天起再要一次。
///
/// 回空（`last = None`）不续：那是真的没有数据，不是截断。
pub fn needs_tail(requested_end: NaiveDate, last: Option<NaiveDate>) -> Option<NaiveDate> {
    let last = last?;
    ((requested_end - last).num_days() > TRUNCATION_GAP_DAYS)
        .then(|| last.succ_opt())
        .flatten()
}

fn day_prefix(text: &str) -> Option<NaiveDate> {
    NaiveDate::parse_from_str(text.get(..10)?, "%Y-%m-%d").ok()
}

/// 某个时区里某一刻是哪一天。
fn local_date(timestamp: i64, time_zone: &str) -> Option<NaiveDate> {
    let zone = jiff::tz::TimeZone::get(time_zone).ok()?;
    let instant = jiff::Timestamp::from_second(timestamp).ok()?;
    NaiveDate::parse_from_str(&instant.to_zoned(zone).date().to_string(), "%Y-%m-%d").ok()
}

/// 这台电脑的 IANA 时区名；认不出来时用 UTC。只连官方时没有手表报的时区可用，退到这里。
pub fn system_time_zone() -> String {
    jiff::tz::TimeZone::system()
        .iana_name()
        .map(str::to_string)
        .unwrap_or_else(|| "UTC".to_string())
}

/// 某个时区里的今天。时区认不出来时用 UTC 的今天。
pub fn local_today(time_zone: &str) -> NaiveDate {
    local_date(Utc::now().timestamp(), time_zone).unwrap_or_else(|| Utc::now().date_naive())
}
/// 某个时区里某一天零点的 UTC 时刻。时区认不出来时退回 UTC 零点（只用作报文的起止标注）。
pub fn local_midnight_utc(date: NaiveDate, time_zone: &str) -> DateTime<Utc> {
    let fallback =
        || DateTime::from_naive_utc_and_offset(date.and_hms_opt(0, 0, 0).unwrap_or_default(), Utc);
    let Ok(zone) = jiff::tz::TimeZone::get(time_zone) else {
        return fallback();
    };
    let Ok(civil) =
        jiff::civil::Date::new(date.year() as i16, date.month() as i8, date.day() as i8)
    else {
        return fallback();
    };
    civil
        .to_zoned(zone)
        .ok()
        .and_then(|zoned| DateTime::from_timestamp(zoned.timestamp().as_second(), 0))
        .unwrap_or_else(fallback)
}

fn number(item: &Value, key: &str) -> Option<i64> {
    match item.get(key)? {
        Value::Number(number) => number
            .as_i64()
            .or_else(|| number.as_f64().map(|value| value as i64)),
        Value::String(text) => text.trim().parse().ok(),
        _ => None,
    }
}

fn text(item: &Value, key: &str) -> Option<String> {
    match item.get(key)? {
        Value::String(text) if !text.is_empty() => Some(text.clone()),
        Value::Number(number) => Some(number.to_string()),
        _ => None,
    }
}

/// 官方逐分钟心率里最新一条真读数的时刻。没戴表的分钟官方给 0，和 normalizer 一样只认 25–250。
pub fn newest_heart_rate_at(items: &[Value]) -> Option<DateTime<Utc>> {
    items
        .iter()
        .filter(|item| {
            number(item, "heartRateData").is_some_and(|value| (25..=250).contains(&value))
        })
        .filter_map(|item| number(item, "timestamp"))
        .max()
        .and_then(|seconds| DateTime::from_timestamp(seconds, 0))
}

/// 一条记录属于哪一天。
pub fn item_day(kind: OfficialKind, item: &Value, time_zone: &str) -> Option<NaiveDate> {
    match kind {
        OfficialKind::Pai => item
            .get("calendarDay")
            .and_then(Value::as_str)
            .and_then(day_prefix),
        OfficialKind::Sports => local_date(number(item, "startTime")?, time_zone),
        OfficialKind::Body => local_date(number(item, "timestamp")?, time_zone),
        OfficialKind::SportDetail => local_date(number(item, "startTime")?, time_zone),
        _ => item
            .get("date")
            .and_then(Value::as_str)
            .and_then(day_prefix),
    }
}

/// 一组记录拆成按天（运动按条、体重按次）的原始报文。
pub fn split_records(kind: OfficialKind, items: Vec<Value>, time_zone: &str) -> Vec<RawRecord> {
    split_records_counted(kind, items, time_zone).0
}

/// 同 [`split_records`]，另外数出因为缺日期 / 编号而丢下的条目——它们不能
/// 悄悄消失，要进这一块的完整性结果（代码审查 R09）。
pub fn split_records_counted(
    kind: OfficialKind,
    items: Vec<Value>,
    time_zone: &str,
) -> (Vec<RawRecord>, usize) {
    let mut groups: BTreeMap<String, (NaiveDate, Vec<Value>)> = BTreeMap::new();
    let mut skipped = 0usize;
    for item in items {
        let Some(day) = item_day(kind, &item, time_zone) else {
            skipped += 1;
            continue;
        };
        let key = match kind {
            OfficialKind::Sports => match text(&item, "trackId") {
                Some(track) => track,
                None => {
                    skipped += 1;
                    continue;
                }
            },
            OfficialKind::Body => match number(&item, "timestamp") {
                Some(timestamp) => timestamp.to_string(),
                None => {
                    skipped += 1;
                    continue;
                }
            },
            _ => format!("day:{day}"),
        };
        groups
            .entry(key)
            .or_insert_with(|| (day, Vec::new()))
            .1
            .push(item);
    }
    let records = groups
        .into_iter()
        .map(|(key, (day, items))| {
            raw_record(kind, &key, day, json!({ "items": items }), time_zone)
        })
        .collect();
    (records, skipped)
}

/// 一份官方原始报文。`payload` 里补上 `timeZone`（见文件头）。
pub fn raw_record(
    kind: OfficialKind,
    key: &str,
    day: NaiveDate,
    mut payload: Value,
    time_zone: &str,
) -> RawRecord {
    if let Value::Object(map) = &mut payload {
        map.insert("timeZone".into(), Value::String(time_zone.into()));
    }
    let start_utc = local_midnight_utc(day, time_zone);
    RawRecord {
        stream: kind.stream().into(),
        source_key: format!("{SOURCE_PREFIX}{}:{key}", kind.label()),
        source_scope: SourceScope::UserFused,
        device_id: None,
        start_utc,
        end_utc: Some(start_utc + Duration::days(1)),
        payload,
        capability: CapabilityStatus::Verified,
    }
}

/// 官方列表接口的成功形状只有一种：`{"items": [...]}`（实测，空就是
/// `items: []`）。别的形状一律不是「没有数据」（代码审查 R09）：
/// - 带非零 `code` 的是业务错误（HTTP 200 也可能这么回）；
/// - 没有 `items`、`items` 是 null 或不是数组、顶层不是对象，都是认不出的响应。
fn items_of(body: Value) -> Result<Vec<Value>> {
    let Value::Object(mut map) = body else {
        return Err(ZeppBridgeError::ParseError(
            "官方响应不是对象，认不出来".into(),
        ));
    };
    if let Some(code) = map
        .get("code")
        .and_then(Value::as_i64)
        .filter(|code| *code != 0)
    {
        let message = map
            .get("message")
            .and_then(Value::as_str)
            .unwrap_or("(云端没有给出说明)")
            .to_string();
        return Err(ZeppBridgeError::CloudRejected { code, message });
    }
    match map.remove("items") {
        Some(Value::Array(items)) => Ok(items),
        Some(_) => Err(ZeppBridgeError::ParseError(
            "官方响应的 items 不是数组".into(),
        )),
        None => Err(ZeppBridgeError::ParseError(
            "官方响应里没有 items，认不出来".into(),
        )),
    }
}

/// 一块拉下来的结果。`gap` 说明这块哪里没拉全（截断续取到上限、续取没有
/// 进展、有条目缺日期或编号被丢下）；已经拿到的记录照常入库（代码审查 R08）。
#[derive(Debug)]
pub struct ChunkOutcome {
    pub records: Vec<RawRecord>,
    pub gap: Option<String>,
}

pub struct OfficialFetcher<'a> {
    pub client: &'a OfficialClient,
    pub access_token: &'a str,
    /// IANA 时区名：心率、运动、体重接口要它，每小时步数靠它换算成绝对时刻。
    pub time_zone: String,
}

impl OfficialFetcher<'_> {
    /// 拉一块（两端都含），按天拆成原始报文。块回来有截断迹象时从断处续要；
    /// 续到上限还截断、或续取没有进展时，已拿到的照常返回，缺口写进 `gap`。
    pub async fn fetch_chunk(
        &self,
        kind: OfficialKind,
        start: NaiveDate,
        end: NaiveDate,
    ) -> Result<ChunkOutcome> {
        let mut items = Vec::new();
        let mut cursor = start;
        let mut gap = None;
        for attempt in 0..=MAX_TAIL_REQUESTS {
            let mut query = vec![
                ("startDate", cursor.format("%Y-%m-%d").to_string()),
                ("endDate", end.format("%Y-%m-%d").to_string()),
            ];
            query.extend(kind.extra_query(&self.time_zone));
            let batch = items_of(
                self.client
                    .get_json(self.access_token, kind.path(), &query)
                    .await?,
            )?;
            let last = batch
                .iter()
                .filter_map(|item| item_day(kind, item, &self.time_zone))
                .max();
            items.extend(batch);
            match needs_tail(end, last) {
                Some(next) if next > cursor && next <= end => {
                    if attempt == MAX_TAIL_REQUESTS {
                        gap = Some(format!(
                            "官方 {} 续取 {MAX_TAIL_REQUESTS} 次后仍在 {next} 前截断，{next} 至 {end} 没有拉到",
                            kind.label()
                        ));
                        break;
                    }
                    tracing::info!(
                        "官方 {} 在 {:?} 之后可能被截断，从 {next} 续要",
                        kind.label(),
                        last
                    );
                    cursor = next;
                }
                Some(next) if next <= cursor => {
                    gap = Some(format!(
                        "官方 {} 从 {cursor} 续取没有新的记录，{cursor} 至 {end} 没有拉到",
                        kind.label()
                    ));
                    break;
                }
                _ => break,
            }
        }
        let (records, skipped) = split_records_counted(kind, items, &self.time_zone);
        if skipped > 0 {
            let note = format!(
                "有 {skipped} 条官方 {} 记录缺日期或编号，没有入库",
                kind.label()
            );
            gap = Some(match gap {
                Some(previous) => format!("{previous}；{note}"),
                None => note,
            });
        }
        Ok(ChunkOutcome { records, gap })
    }

    /// 同步前探云端（`sync/probe.rs`）：这一天官方心率里最新的那一刻。不落库、不留报文。
    pub async fn newest_heart_rate(&self, day: NaiveDate) -> Result<Option<DateTime<Utc>>> {
        let kind = OfficialKind::HeartRate;
        let date = day.format("%Y-%m-%d").to_string();
        let mut query = vec![("startDate", date.clone()), ("endDate", date)];
        query.extend(kind.extra_query(&self.time_zone));
        let items = items_of(
            self.client
                .get_json(self.access_token, kind.path(), &query)
                .await?,
        )?;
        Ok(newest_heart_rate_at(&items))
    }

    /// 一条运动的明细（逐秒序列、轨迹、暂停）。
    pub async fn fetch_sport_detail(&self, track_id: &str, day: NaiveDate) -> Result<RawRecord> {
        let body = self
            .client
            .get_json(
                self.access_token,
                OfficialKind::SportDetail.path(),
                &[("trackId", track_id.to_string())],
            )
            .await?;
        if !body.is_object() {
            return Err(ZeppBridgeError::ParseError("官方运动明细不是对象".into()));
        }
        Ok(raw_record(
            OfficialKind::SportDetail,
            track_id,
            day,
            body,
            &self.time_zone,
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn day(text: &str) -> NaiveDate {
        NaiveDate::parse_from_str(text, "%Y-%m-%d").unwrap()
    }

    #[test]
    fn chunks_cover_the_range_newest_first_without_gaps_or_overlap() {
        let chunks = date_chunks_newest_first(day("2026-01-01"), day("2026-09-29"), 90);
        assert_eq!(chunks.first().unwrap().1, day("2026-09-29"));
        assert_eq!(chunks.last().unwrap().0, day("2026-01-01"));
        for pair in chunks.windows(2) {
            assert_eq!(pair[1].1.succ_opt().unwrap(), pair[0].0);
        }
        assert!(chunks
            .iter()
            .all(|(start, end)| (*end - *start).num_days() < 90));
    }

    #[test]
    fn a_short_tail_is_not_truncation_but_a_long_one_is() {
        let end = day("2026-09-29");
        assert_eq!(needs_tail(end, Some(day("2026-09-28"))), None);
        assert_eq!(needs_tail(end, None), None);
        assert_eq!(
            needs_tail(end, Some(day("2026-07-01"))),
            Some(day("2026-07-02"))
        );
    }

    #[test]
    fn records_split_per_day_with_stable_keys_and_the_request_zone() {
        let items = vec![
            json!({"date": "2026-09-28", "hour": 11, "steps": 208}),
            json!({"date": "2026-09-28", "hour": 12, "steps": 20}),
            json!({"date": "2026-09-29", "hour": 8, "steps": 5}),
        ];
        let records = split_records(OfficialKind::ActivityHourly, items, "Asia/Shanghai");
        assert_eq!(records.len(), 2);
        assert_eq!(
            records[0].source_key,
            "official:activity_hourly:day:2026-09-28"
        );
        assert_eq!(records[0].stream, "daily_summary");
        assert_eq!(records[0].payload["items"].as_array().unwrap().len(), 2);
        assert_eq!(records[0].payload["timeZone"], "Asia/Shanghai");
        // 上海零点 = 前一天 16:00Z。
        assert_eq!(
            records[0].start_utc.to_rfc3339(),
            "2026-09-27T16:00:00+00:00"
        );
        assert_eq!(
            OfficialKind::from_source_key(&records[0].source_key),
            Some(OfficialKind::ActivityHourly)
        );
    }

    #[test]
    fn workouts_split_per_track_and_skip_items_without_an_id() {
        let items = vec![
            json!({"trackId": "1789908976", "startTime": 1789908976}),
            json!({"startTime": 1789908976}),
        ];
        let records = split_records(OfficialKind::Sports, items, "Asia/Shanghai");
        assert_eq!(records.len(), 1);
        assert_eq!(records[0].source_key, "official:sports:1789908976");
    }
}
