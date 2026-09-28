//! 把旧的「整窗」每日事件报文整理成按日报文（见 `crate::event_days`）。
//!
//! 3.0 之前每次同步都把最近 30 天的 Charge / readiness / DailyHealth 整窗存成一条
//! 新报文。那些报文的派生行早已被后来的报文接管，但报文本身一直留着：一个真实库
//! 里 719 条 Charge 窗口报文占 525 MB，其中 694 条已经没有任何派生行指向。
//!
//! 整理的规则只有一条：**每一天只留最新拿到的那个版本**。
//!
//! 1. 同一族（`events:<type>:<sub>`）的窗口报文从新到旧过一遍；
//! 2. 每一天第一次见到时，把那天的条目原样写成一条按日报文，`fetched_at` 沿用原报文
//!    的云端拉取时间，并用当前解析器归一化——派生行随之指向新报文；已经有更新的
//!    按日报文的那一天跳过；
//! 3. 窗口报文此后若没有任何派生行指向、也没有取不出时间戳的条目，删掉。
//!
//! 按日拆开后归一化的结果与整窗完全一致（真实库里 2161 条逐条比对过），所以派生
//! 数据不会变；变的只有报文的存放方式。删之前总是先确认没有派生行指向它，外键
//! 本身也会拦住误删。

use super::*;
use crate::event_days::{self, EventDays};

/// 已经整理到哪条报文（`raw_records.id`）。之后新来的窗口报文——比如 2.x 还在同一
/// 个库上同步——下次启动会再整理一轮。
const EVENT_WINDOW_MARKER_KEY: &str = "event_window_consolidated_id";

/// 小于这个字节数的窗口报文不算「待整理」：空窗口 `{"items":[]}` 只有 12 字节，
/// 为它在启动时弹一次「正在压缩」不值得；带一条条目的就远不止这个数。整理的
/// 时候空窗口照样会被一起清掉。
const EVENT_WINDOW_MIN_PENDING_BYTES: i64 = 64;

/// 一个事务里处理几条窗口报文。Charge 一条解开有 4.7 MB，这里决定的是内存峰值
/// 和 WAL 峰值，不是速度。
const EVENT_WINDOW_BATCH: usize = 8;

struct WindowRaw {
    id: i64,
    family: String,
    fetched_at: String,
    fetched: DateTime<Utc>,
    stored_bytes: u64,
}

impl Database {
    /// 还没整理的、有内容的窗口形态每日事件报文条数。
    pub(crate) fn pending_event_window_count(&self) -> Result<i64> {
        let marker = self.event_window_marker()?;
        let mut stmt = self.conn.prepare(
            "SELECT source_key FROM raw_records
             WHERE stream = 'daily_summary' AND source_key GLOB 'events:*' AND id > ?1
               AND LENGTH(payload) + COALESCE(LENGTH(payload_zip), 0) > ?2",
        )?;
        let keys = stmt.query_map(params![marker, EVENT_WINDOW_MIN_PENDING_BYTES], |row| {
            row.get::<_, String>(0)
        })?;
        let mut count = 0;
        for key in keys {
            if event_days::window_key_family(&key?).is_some() {
                count += 1;
            }
        }
        Ok(count)
    }

    /// 整理一轮。删掉的窗口报文计进 `report.compacted`，腾出和新写的字节数计进
    /// `bytes_before` / `bytes_after`。退出请求会在批边界上打断它，标记不前进，
    /// 下次启动接着做。
    pub(super) fn consolidate_event_windows(
        &self,
        report: &mut RawPayloadCompaction,
    ) -> Result<()> {
        let marker = self.event_window_marker()?;
        let windows = self.window_raws_after(marker)?;
        let Some(max_id) = windows.iter().map(|raw| raw.id).max() else {
            return Ok(());
        };
        let mut families: BTreeMap<String, Vec<WindowRaw>> = BTreeMap::new();
        for raw in windows {
            families.entry(raw.family.clone()).or_default().push(raw);
        }
        for (family, raws) in families {
            if !self.consolidate_family(&family, raws, report)? {
                return Ok(());
            }
        }
        self.set_app_meta(EVENT_WINDOW_MARKER_KEY, &max_id.to_string())
    }

    fn event_window_marker(&self) -> Result<i64> {
        Ok(self
            .get_app_meta(EVENT_WINDOW_MARKER_KEY)?
            .and_then(|value| value.parse().ok())
            .unwrap_or(0))
    }

    /// 标记之后的全部窗口报文，每族内从新到旧。
    fn window_raws_after(&self, marker: i64) -> Result<Vec<WindowRaw>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, source_key, fetched_at,
                    LENGTH(payload) + COALESCE(LENGTH(payload_zip), 0)
             FROM raw_records
             WHERE stream = 'daily_summary' AND source_key GLOB 'events:*' AND id > ?1",
        )?;
        let rows = stmt.query_map([marker], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, i64>(3)?,
            ))
        })?;
        let mut out = Vec::new();
        for row in rows {
            let (id, key, fetched_at, bytes) = row?;
            let Some(family) = event_days::window_key_family(&key) else {
                continue;
            };
            let Ok(fetched) = parse_datetime(&fetched_at, "raw_records.fetched_at") else {
                continue;
            };
            out.push(WindowRaw {
                id,
                family: family.to_string(),
                fetched_at,
                fetched,
                stored_bytes: bytes.max(0) as u64,
            });
        }
        out.sort_by(|a, b| b.fetched.cmp(&a.fetched).then(b.id.cmp(&a.id)));
        Ok(out)
    }

    /// 每一天已有的按日报文是什么时候拉到的。
    fn family_day_fetches(&self, family: &str) -> Result<HashMap<NaiveDate, DateTime<Utc>>> {
        let prefix = format!("{family}:day:");
        let mut stmt = self.conn.prepare(
            "SELECT source_key, fetched_at FROM raw_records
             WHERE stream = 'daily_summary' AND substr(source_key, 1, ?2) = ?1",
        )?;
        let rows = stmt.query_map(params![prefix, prefix.len() as i64], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?;
        let mut out = HashMap::new();
        for row in rows {
            let (key, fetched_at) = row?;
            let Some(day) = key
                .strip_prefix(&prefix)
                .and_then(|day| NaiveDate::parse_from_str(day, "%Y-%m-%d").ok())
            else {
                continue;
            };
            if let Ok(at) = parse_datetime(&fetched_at, "raw_records.fetched_at") {
                out.insert(day, at);
            }
        }
        Ok(out)
    }

    /// 返回 `false` = 被退出请求打断。
    fn consolidate_family(
        &self,
        family: &str,
        raws: Vec<WindowRaw>,
        report: &mut RawPayloadCompaction,
    ) -> Result<bool> {
        let mut parts = family.splitn(3, ':').skip(1);
        let (Some(event_type), Some(sub_type)) = (parts.next(), parts.next()) else {
            return Ok(true);
        };
        let mut days = self.family_day_fetches(family)?;
        // 这一族里最新一次拉取的时间：空窗口只有在「后来又拉过」时才能删，
        // 否则它是「最近一次拉回来是空的」这件事唯一的证据。
        let mut newest = days.values().max().copied();
        for batch in raws.chunks(EVENT_WINDOW_BATCH) {
            if background_write_abort_requested() {
                return Ok(false);
            }
            let transaction = ReplayBatch::begin(&self.conn)?;
            for raw in batch {
                let has_newer = newest.is_some_and(|at| at > raw.fetched);
                newest = Some(newest.map_or(raw.fetched, |at| at.max(raw.fetched)));
                let Some((payload, zip)) = self.raw_payload(raw.id)? else {
                    continue;
                };
                // 读不出来的报文原样留着：它是重放的唯一依据，整理不该替它做决定。
                let Ok(text) = decode_raw_payload(payload, zip) else {
                    continue;
                };
                let Ok(value) = serde_json::from_str::<serde_json::Value>(&text) else {
                    continue;
                };
                let deletable = match event_days::split_by_utc_day(&value) {
                    None => has_newer,
                    Some(EventDays {
                        days: split,
                        residual,
                    }) => {
                        for (day, day_payload) in split {
                            if days.get(&day).is_some_and(|at| *at >= raw.fetched) {
                                continue;
                            }
                            report.bytes_after += self.write_consolidated_day(
                                event_type,
                                sub_type,
                                day,
                                day_payload,
                                &raw.fetched_at,
                            )?;
                            days.insert(day, raw.fetched);
                        }
                        residual.is_none()
                    }
                };
                if deletable && self.delete_unreferenced_raw(raw.id)? {
                    report.compacted += 1;
                    report.bytes_before += raw.stored_bytes;
                }
            }
            transaction.commit()?;
        }
        Ok(true)
    }

    /// 写一天的按日报文并归一化，返回它压缩后占的字节数。
    fn write_consolidated_day(
        &self,
        event_type: &str,
        sub_type: &str,
        day: NaiveDate,
        payload: serde_json::Value,
        fetched_at: &str,
    ) -> Result<u64> {
        let (start_utc, end_utc) = event_days::day_bounds(day);
        let record = RawRecord {
            stream: "daily_summary".into(),
            source_key: event_days::day_source_key(event_type, sub_type, day),
            source_scope: SourceScope::UserFused,
            device_id: None,
            start_utc,
            end_utc: Some(end_utc),
            payload,
            capability: CapabilityStatus::Verified,
        };
        let serialized = SerializedPayload::of(&record)?;
        let id = self.insert_serialized_raw(&record, &serialized, fetched_at)?;
        // 和重放一样：一条报文的「清旧行 + 插新行」单独包一层，失败只退这一条。
        self.conn.execute("SAVEPOINT consolidate_day", [])?;
        match self.normalize_and_persist_raw(
            id,
            &record.stream,
            &record.source_key,
            &record.payload,
        ) {
            Ok(_) => {
                self.conn.execute("RELEASE consolidate_day", [])?;
                self.clear_raw_quarantine(id)?;
            }
            Err(error) => {
                self.conn.execute("ROLLBACK TO consolidate_day", [])?;
                self.conn.execute("RELEASE consolidate_day", [])?;
                self.insert_raw_quarantine(id, &record.stream, &record.source_key, &error)?;
            }
        }
        Ok(self
            .conn
            .query_row(
                "SELECT LENGTH(payload) + COALESCE(LENGTH(payload_zip), 0)
                 FROM raw_records WHERE id = ?1",
                [id],
                |row| row.get::<_, i64>(0),
            )?
            .max(0) as u64)
    }

    /// 没有任何派生行指向它时才删。返回删没删。
    fn delete_unreferenced_raw(&self, id: i64) -> Result<bool> {
        let deleted = self.conn.execute(
            "DELETE FROM raw_records
             WHERE id = ?1
               AND NOT EXISTS (SELECT 1 FROM metric_samples m WHERE m.raw_record_id = ?1)
               AND NOT EXISTS (SELECT 1 FROM daily_metrics d WHERE d.raw_record_id = ?1)
               AND NOT EXISTS (SELECT 1 FROM sleep_sessions s WHERE s.raw_record_id = ?1)
               AND NOT EXISTS (SELECT 1 FROM workouts w WHERE w.raw_record_id = ?1)",
            [id],
        )?;
        Ok(deleted > 0)
    }
}
