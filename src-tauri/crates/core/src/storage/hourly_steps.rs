//! 每小时步数：旧通道的逐分钟记录为主，官方授权的按小时汇总补缺。
//!
//! 为什么旧通道优先：拿真实库逐日核对过，旧通道 `band_data` 明细里每分钟一条记录，按小时
//! 加起来**逐日等于**当天的总步数（`summary.stp.ttl`）；官方的 `interval=hourly` 却只回
//! 零星几个小时（9/29 那天官方各小时合计 770 步，当天实际 1727 步），而且它只从授权那天
//! 往回拉了一个月——日常活动页切到 6 个月只剩二十来天，就是这么来的。
//!
//! 旧通道报文本来就留在 `raw_records` 里（心率也是从同一份报文解出来的），这里在读的时候
//! 现解，不改归一化、不需要重放（和 `food_entries` 同一个做法）。只认已经核对过的格式：
//! 一天 1440 分钟、每分钟 8 字节、第 3 个字节是这一分钟的步数。别的长度一律不猜。

use super::*;
use base64::{engine::general_purpose::STANDARD, Engine as _};

/// 旧通道明细报文的键：`band_data:detail:<首日>:<末日>`。
const LEGACY_KEY_PREFIX: &str = "band_data:detail:";
const MINUTES: usize = 1440;
const BYTES_PER_MINUTE: usize = 8;
const STEP_BYTE: usize = 2;

/// 一条旧通道日记录解出的 24 小时步数。不是这个格式（长度不对、没有日期）就返回 None。
pub(super) fn legacy_hourly_steps(item: &serde_json::Value) -> Option<(String, String, [f64; 24])> {
    let object = item.as_object()?;
    let date = object.get("date_time")?.as_str()?;
    NaiveDate::parse_from_str(date, "%Y-%m-%d").ok()?;
    let encoded = object.get("data")?.as_str()?;
    let bytes = STANDARD.decode(encoded.trim()).ok()?;
    if bytes.len() != MINUTES * BYTES_PER_MINUTE {
        return None;
    }
    let mut hours = [0.0; 24];
    for minute in 0..MINUTES {
        hours[minute / 60] += f64::from(bytes[minute * BYTES_PER_MINUTE + STEP_BYTE]);
    }
    let device = object
        .get("device_id")
        .and_then(|value| value.as_str())
        .unwrap_or_default()
        .to_string();
    Some((date.to_string(), device, hours))
}

/// 键里的首末日；不是预期格式时返回 None（调用方照样解，只是没法按日期跳过）。
fn key_span(source_key: &str) -> Option<(NaiveDate, NaiveDate)> {
    let rest = source_key.strip_prefix(LEGACY_KEY_PREFIX)?;
    let (start, end) = rest.split_once(':')?;
    Some((
        NaiveDate::parse_from_str(start, "%Y-%m-%d").ok()?,
        NaiveDate::parse_from_str(end, "%Y-%m-%d").ok()?,
    ))
}

impl Database {
    /// 一段本地日（含首尾）里逐日的每小时步数。某一天旧通道有逐分钟记录就用旧通道
    /// （同一天有好几份报文时取最新拉到的那份；几块表同一天都有时每小时取最大，不相加——
    /// 同一段路不能算两遍）；旧通道没有的日子才用官方的按小时汇总。
    /// 没有步数的小时不在结果里——界面画成空，不画 0。
    pub fn hourly_steps(&self, start: &str, end: &str) -> Result<Vec<HourlySteps>> {
        let parse = |value: &str| {
            NaiveDate::parse_from_str(value, "%Y-%m-%d")
                .map_err(|_| ZeppBridgeError::ConfigError("日期需要 YYYY-MM-DD".into()))
        };
        let (first, last) = (parse(start)?, parse(end)?);
        if first > last {
            return Err(ZeppBridgeError::ConfigError("开始日期晚于结束日期".into()));
        }

        let legacy = self.legacy_hourly_steps(first, last)?;
        let mut by_day: BTreeMap<String, BTreeMap<i64, f64>> = BTreeMap::new();
        for (date, hours) in &legacy {
            let slot = by_day.entry(date.clone()).or_default();
            for (hour, steps) in hours.iter().enumerate() {
                if *steps > 0.0 {
                    slot.insert(hour as i64, *steps);
                }
            }
        }

        let (utc_lower, utc_upper) = utc_bounds_or_unbounded(start, end);
        let mut stmt = self.conn.prepare(
            "SELECT date(timestamp, 'localtime'), CAST(strftime('%H', timestamp, 'localtime') AS INTEGER), MAX(value)
             FROM metric_samples
             WHERE metric = 'steps_hourly' AND timestamp >= ?3 AND timestamp < ?4
               AND date(timestamp, 'localtime') BETWEEN ?1 AND ?2
             GROUP BY 1, 2 ORDER BY 1, 2",
        )?;
        let official = stmt
            .query_map(params![start, end, utc_lower, utc_upper], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, i64>(1)?,
                    row.get::<_, f64>(2)?,
                ))
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        for (date, hour, steps) in official {
            if legacy.contains_key(&date) {
                continue;
            }
            by_day.entry(date).or_default().insert(hour, steps);
        }

        Ok(by_day
            .into_iter()
            .flat_map(|(date, hours)| {
                hours.into_iter().map(move |(hour, steps)| HourlySteps {
                    date: date.clone(),
                    hour,
                    steps,
                })
            })
            .collect())
    }

    /// 旧通道每天的 24 小时步数（`[first, last]` 以内）。报文按拉取时间从新到旧读，
    /// 一天一旦有了就不再被更旧的报文覆盖；一条报文覆盖的日子都已经有了就整条跳过，不解压。
    fn legacy_hourly_steps(
        &self,
        first: NaiveDate,
        last: NaiveDate,
    ) -> Result<BTreeMap<String, [f64; 24]>> {
        let mut stmt = self.conn.prepare(
            "SELECT source_key, payload, payload_zip FROM raw_records
             WHERE source_key LIKE 'band_data:detail:%'
             ORDER BY fetched_at DESC, id DESC",
        )?;
        let mut rows = stmt.query([])?;
        let mut days: BTreeMap<String, [f64; 24]> = BTreeMap::new();
        // 同一天、同一块表只取最新那份；不同的表每小时取最大。
        let mut seen: BTreeSet<(String, String)> = BTreeSet::new();
        while let Some(row) = rows.next()? {
            let key: String = row.get(0)?;
            if let Some((span_start, span_end)) = key_span(&key) {
                if span_end < first || span_start > last {
                    continue;
                }
                let mut day = span_start.max(first);
                let mut covered = true;
                while day <= span_end.min(last) {
                    if !days.contains_key(&day.format("%Y-%m-%d").to_string()) {
                        covered = false;
                        break;
                    }
                    day += Duration::days(1);
                }
                if covered {
                    continue;
                }
            }
            let Ok(payload) = decode_raw_payload(row.get(1)?, row.get(2)?) else {
                continue;
            };
            let Ok(payload) = serde_json::from_str::<serde_json::Value>(&payload) else {
                continue;
            };
            let Some(items) = payload.get("data").and_then(|value| value.as_array()) else {
                continue;
            };
            for item in items {
                let Some((date, device, hours)) = legacy_hourly_steps(item) else {
                    continue;
                };
                let Ok(day) = NaiveDate::parse_from_str(&date, "%Y-%m-%d") else {
                    continue;
                };
                if day < first || day > last || !seen.insert((date.clone(), device)) {
                    continue;
                }
                let slot = days.entry(date).or_insert([0.0; 24]);
                for (hour, steps) in hours.iter().enumerate() {
                    slot[hour] = slot[hour].max(*steps);
                }
            }
        }
        Ok(days)
    }
}
