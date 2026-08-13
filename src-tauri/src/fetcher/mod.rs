use crate::connectors::ZeppConnector;
use crate::models::{error::*, *};
use chrono::{DateTime, Duration, Utc};
use serde_json::{json, Value};

#[derive(Debug, Clone, Copy)]
pub struct FetchWindow {
    pub start_utc: DateTime<Utc>,
    pub end_utc: DateTime<Utc>,
}

impl FetchWindow {
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

    pub fn start_day(&self) -> String {
        self.start_utc.format("%Y-%m-%d").to_string()
    }

    pub fn end_day(&self) -> String {
        self.end_utc.format("%Y-%m-%d").to_string()
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
}

/// A fetch result keeps endpoint/source identity beside its raw payload. This
/// is what allows sync to retain provenance before normalization.
#[derive(Debug, Clone)]
pub struct FetchedRecord {
    pub raw: RawRecord,
}

pub struct DataFetcher {
    connector: ZeppConnector,
}

impl DataFetcher {
    pub fn new(connector: ZeppConnector) -> Self {
        Self { connector }
    }

    #[allow(dead_code)]
    pub fn connector(&self) -> &ZeppConnector {
        &self.connector
    }

    #[allow(dead_code)]
    pub async fn fetch_heart_rate(
        &self,
        start_timestamp: i64,
        end_timestamp: i64,
    ) -> Result<Value> {
        self.connector
            .fetch_heart_rate(start_timestamp, end_timestamp)
            .await
    }

    pub async fn fetch_heart_rate_records(
        &self,
        window: FetchWindow,
    ) -> Result<Vec<FetchedRecord>> {
        let mut records = Vec::new();
        let mut last_error = None;
        for chunk in window.chunks(7) {
            match self.fetch_heart_rate_record(chunk).await {
                Ok(record) => records.push(record),
                Err(error) if error.is_unavailable() => last_error = Some(error),
                Err(error) => return Err(error),
            }
        }
        if records.is_empty() {
            return Err(last_error
                .unwrap_or_else(|| ZeppBridgeError::Unavailable("心率窗口没有可识别记录".into())));
        }
        Ok(records)
    }

    pub async fn fetch_heart_rate_record(&self, window: FetchWindow) -> Result<FetchedRecord> {
        let payload = self
            .connector
            .fetch_heart_rate(window.start_utc.timestamp(), window.end_utc.timestamp())
            .await?;
        Ok(FetchedRecord {
            raw: RawRecord {
                stream: "heart_rate".into(),
                source_key: format!(
                    "heart_rate:{}:{}",
                    window.start_utc.timestamp(),
                    window.end_utc.timestamp()
                ),
                source_scope: SourceScope::UserFused,
                device_id: None,
                start_utc: window.start_utc,
                end_utc: Some(window.end_utc),
                payload,
                capability: CapabilityStatus::Verified,
            },
        })
    }

    #[allow(dead_code)]
    pub async fn fetch_band_data(
        &self,
        from_date: &str,
        to_date: &str,
        query_type: &str,
        byte_length: i64,
        device_type: i64,
    ) -> Result<Value> {
        self.connector
            .fetch_band_data(from_date, to_date, query_type, byte_length, device_type)
            .await
    }

    #[allow(dead_code)]
    pub async fn fetch_sport_history(
        &self,
        sport: &str,
        start_track_id: i64,
        stop_track_id: i64,
        need_sub_data: i64,
    ) -> Result<Value> {
        self.connector
            .fetch_sport_history(sport, start_track_id, stop_track_id, need_sub_data)
            .await
    }

    #[allow(dead_code)]
    pub async fn fetch_watch_statistics(
        &self,
        statistic: &str,
        start_day: &str,
        end_day: &str,
    ) -> Result<Value> {
        self.connector
            .fetch_watch_statistics(statistic, start_day, end_day, 900, true)
            .await
    }

    #[allow(dead_code)]
    pub async fn fetch_events(
        &self,
        event_type: &str,
        sub_type: &str,
        from_ms: i64,
        to_ms: i64,
        limit: i64,
        reverse: bool,
    ) -> Result<Value> {
        self.connector
            .fetch_events(event_type, sub_type, from_ms, to_ms, limit, reverse)
            .await
    }

    /// Fetch the supported core streams for a shared time window. Optional
    /// capabilities are represented as unavailable errors by their endpoint;
    /// callers can retain the successful records and report the missing stream.
    #[allow(dead_code)]
    pub async fn fetch_core_window(&self, window: FetchWindow) -> Result<Vec<FetchedRecord>> {
        let heart_rate = self.fetch_heart_rate_record(window).await?;
        Ok(vec![heart_rate])
    }

    /// Compatibility helper used by the original Tauri command.
    #[allow(dead_code)]
    pub async fn fetch_heart_rate_range(&self, days: i64) -> Result<Value> {
        let window = FetchWindow::days(days)?;
        self.fetch_heart_rate(window.start_utc.timestamp(), window.end_utc.timestamp())
            .await
    }

    #[allow(dead_code)]
    pub async fn fetch_sleep_range(&self, days: i64) -> Result<Value> {
        let window = FetchWindow::days(days)?;
        self.connector
            .fetch_sleep(&window.start_day(), &window.end_day())
            .await
    }

    pub async fn fetch_sleep_records(&self, window: FetchWindow) -> Result<Vec<FetchedRecord>> {
        let mut records = Vec::new();
        let mut last_error = None;
        for chunk in window.chunks(7) {
            match self.fetch_sleep_record(chunk).await {
                Ok(record) => records.push(record),
                Err(error) if error.is_unavailable() => last_error = Some(error),
                Err(error) => return Err(error),
            }
        }
        if records.is_empty() {
            return Err(last_error
                .unwrap_or_else(|| ZeppBridgeError::Unavailable("睡眠窗口没有可识别记录".into())));
        }
        Ok(records)
    }

    pub async fn fetch_sleep_record(&self, window: FetchWindow) -> Result<FetchedRecord> {
        let payload = self
            .connector
            .fetch_band_data(&window.start_day(), &window.end_day(), "detail", 8, 0)
            .await?;
        let capability = crate::normalizer::Normalizer::band_capability(&payload);
        Ok(FetchedRecord {
            raw: RawRecord {
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
            },
        })
    }

    /// Sport history uses track IDs, not timestamps. The range helper uses the
    /// UTC epoch as a conservative cursor window because no local track index is
    /// known yet; a server response with no structured records is reported as
    /// unavailable rather than as a successful empty workout stream.
    pub async fn fetch_workout_records(&self, window: FetchWindow) -> Result<Vec<FetchedRecord>> {
        let start = window.start_utc.timestamp();
        let end = window.end_utc.timestamp();
        let mut records = Vec::new();
        let sports = [
            "run",
            "walking",
            "ride",
            "swimming",
            "indoor_run",
            "treadmill",
            "trail",
            "hiking",
            "strength",
            "elliptical",
            "rowing",
            "yoga",
            "climb",
        ];
        let mut last_optional_error = None;
        for sport in sports {
            match self
                .connector
                .fetch_sport_history(sport, start, end, 1)
                .await
            {
                Ok(payload) => records.push(FetchedRecord {
                    raw: RawRecord {
                        stream: "workouts".into(),
                        source_key: format!("sport_history:{sport}:{start}:{end}"),
                        source_scope: SourceScope::Device,
                        device_id: None,
                        start_utc: window.start_utc,
                        end_utc: Some(window.end_utc),
                        payload,
                        capability: CapabilityStatus::Verified,
                    },
                }),
                Err(error) if error.is_unavailable() => last_optional_error = Some(error),
                Err(error) => return Err(error),
            }
        }
        if records.is_empty() {
            return Err(last_optional_error.unwrap_or_else(|| {
                ZeppBridgeError::Unavailable("sport history 没有可用种类".into())
            }));
        }
        Ok(records)
    }

    #[allow(dead_code)]
    pub async fn fetch_workouts_range(&self, days: i64) -> Result<Value> {
        let window = FetchWindow::days(days)?;
        let records = self.fetch_workout_records(window).await?;
        let mut items = Vec::new();
        for record in records {
            items.extend(payload_items(&record.raw.payload));
        }
        if items.is_empty() {
            return Err(ZeppBridgeError::Unavailable(
                "sport history payload 未提供结构化 workout items".into(),
            ));
        }
        Ok(json!({"items": items}))
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
                Ok(payload) => records.push(FetchedRecord {
                    raw: RawRecord {
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
                    },
                }),
                Err(error) if error.is_unavailable() => last_error = Some(error),
                Err(error) => return Err(error),
            }
        }
        if records.is_empty() {
            return Err(last_error
                .unwrap_or_else(|| ZeppBridgeError::Unavailable("HRV 窗口没有可识别记录".into())));
        }
        Ok(records)
    }

    #[allow(dead_code)]
    pub async fn fetch_daily_summary_range(&self, days: i64) -> Result<Value> {
        let window = FetchWindow::days(days)?;
        self.connector
            .fetch_daily_summary(&window.start_day(), &window.end_day())
            .await
    }

    pub async fn fetch_daily_statistics_records(
        &self,
        window: FetchWindow,
    ) -> Result<Vec<FetchedRecord>> {
        let mut records = Vec::new();
        let from = window.start_utc.timestamp_millis();
        let to = window.end_utc.timestamp_millis();
        let event = self
            .connector
            .fetch_events("DailyHealth", "summary", from, to, 2000, true)
            .await?;
        records.push(FetchedRecord {
            raw: RawRecord {
                stream: "daily_summary".into(),
                source_key: format!("events:DailyHealth:summary:{from}:{to}"),
                source_scope: SourceScope::UserFused,
                device_id: None,
                start_utc: window.start_utc,
                end_utc: Some(window.end_utc),
                payload: event,
                capability: CapabilityStatus::Verified,
            },
        });
        for (event_type, sub_type) in [("Charge", "real_data"), ("readiness", "watch_score")] {
            match self
                .connector
                .fetch_events(event_type, sub_type, from, to, 2000, true)
                .await
            {
                Ok(payload) => records.push(FetchedRecord {
                    raw: RawRecord {
                        stream: "daily_summary".into(),
                        source_key: format!("events:{event_type}:{sub_type}:{from}:{to}"),
                        source_scope: SourceScope::UserFused,
                        device_id: None,
                        start_utc: window.start_utc,
                        end_utc: Some(window.end_utc),
                        payload,
                        capability: CapabilityStatus::Verified,
                    },
                }),
                Err(error) if error.is_unavailable() => {}
                Err(error) => return Err(error),
            }
        }
        for statistic in ["SPORT_LOAD", "VO2_MAX"] {
            match self
                .connector
                .fetch_watch_statistics(
                    statistic,
                    &window.start_day(),
                    &window.end_day(),
                    900,
                    true,
                )
                .await
            {
                Ok(payload) => records.push(FetchedRecord {
                    raw: RawRecord {
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
                    },
                }),
                Err(error) if error.is_unavailable() => {}
                Err(error) => return Err(error),
            }
        }
        Ok(records)
    }
}

#[allow(dead_code)]
fn payload_items(payload: &Value) -> Vec<Value> {
    if let Some(items) = payload.get("items").and_then(Value::as_array) {
        return items.clone();
    }
    if let Some(items) = payload.get("data").and_then(Value::as_array) {
        return items.clone();
    }
    if let Some(items) = payload
        .get("data")
        .and_then(Value::as_object)
        .and_then(|object| object.get("items"))
        .and_then(Value::as_array)
    {
        return items.clone();
    }
    Vec::new()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn window_bounds_are_limited() {
        assert!(FetchWindow::days(0).is_err());
        assert!(FetchWindow::days(366).is_err());
        let window = FetchWindow::days(1).unwrap();
        assert!(window.end_utc > window.start_utc);
        assert_eq!(FetchWindow::days(30).unwrap().chunks(7).len(), 5);
    }

    #[test]
    fn payload_items_only_accept_structured_wrappers() {
        assert_eq!(payload_items(&json!({"items": [1, 2]})).len(), 2);
        assert_eq!(payload_items(&json!({"data": "encoded"})).len(), 0);
    }
}
