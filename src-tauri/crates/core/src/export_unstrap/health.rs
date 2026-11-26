//! 给 unstrap 的健康表：逐点心率、HRV、压力、血氧、逐分钟活动、静息 / 最大心率、PAI、
//! 准备度、呼吸率、睡眠（含分期和小睡）。
//!
//! 表名、列名照 unstrap 的 `CsvTables.kt`，它的恢复只补手机上没有的行，所以导几次都一样。
//! 只写库里真有的值：没有的格子留空。同一时刻 / 同一天几台设备都有时只写一条（unstrap
//! 按时刻 / 日为键），日值取界面上显示的那条（和总览同一个挑法）。
//!
//! 按天的表写日期列（`date`），零点那一列按本机时区算，和 unstrap 老备份的写法一样。

use std::collections::{BTreeMap, HashMap};

use chrono::{DateTime, Local, NaiveDate, SecondsFormat, TimeZone, Utc};

use crate::models::error::Result;
use crate::storage::Database;

/// 一张写好的表。
pub(super) struct Table {
    pub name: &'static str,
    pub text: String,
    pub rows: usize,
}

impl Table {
    fn new(name: &'static str, header: &str) -> Self {
        Table {
            name,
            text: format!("{header}\n"),
            rows: 0,
        }
    }

    fn push(&mut self, cells: &[String]) {
        self.text.push_str(&cells.join(","));
        self.text.push('\n');
        self.rows += 1;
    }
}

fn iso(epoch: i64) -> String {
    Utc.timestamp_opt(epoch, 0)
        .single()
        .map(|t| t.to_rfc3339_opts(SecondsFormat::Secs, true))
        .unwrap_or_default()
}

fn epoch_of(text: &str) -> Option<i64> {
    DateTime::parse_from_rfc3339(text)
        .ok()
        .map(|t| t.timestamp())
}

/// 本地日的零点（本机时区）。
fn local_midnight(date: NaiveDate) -> Option<i64> {
    Local
        .from_local_datetime(&date.and_hms_opt(0, 0, 0)?)
        .earliest()
        .map(|t| t.timestamp())
}

fn local_date(epoch: i64) -> Option<NaiveDate> {
    Local
        .timestamp_opt(epoch, 0)
        .single()
        .map(|t| t.date_naive())
}

fn opt<T: ToString>(value: Option<T>) -> String {
    value.map(|v| v.to_string()).unwrap_or_default()
}

/// 导出范围：`since` 起（含），和本机的「今天」。
///
/// unstrap 按天为键的表（静息心率、当天最大心率、准备度）手机上有了就不再改，所以还没过完的
/// 今天不写：写进去的半天值会被钉住，后面再导也换不掉。
#[derive(Clone, Copy)]
pub(super) struct Since {
    epoch: Option<i64>,
    date: Option<NaiveDate>,
    today: NaiveDate,
}

impl Since {
    pub(super) fn new(since: Option<DateTime<Utc>>, today: NaiveDate) -> Self {
        Since {
            epoch: since.map(|t| t.timestamp()),
            date: since.map(|t| t.with_timezone(&Local).date_naive()),
            today,
        }
    }

    fn keeps(&self, epoch: i64) -> bool {
        self.epoch.is_none_or(|since| epoch >= since)
    }

    fn keeps_day(&self, date: NaiveDate) -> bool {
        self.date.is_none_or(|since| date >= since)
    }

    /// 过完了的一天（不含今天）。
    fn keeps_finished_day(&self, date: NaiveDate) -> bool {
        self.keeps_day(date) && date < self.today
    }

    /// SQL 里按文本时间粗筛的下限（ISO 文本按字典序比较）：比 `since` 早两天，跨时区、跨夜的
    /// 都留得住，准不准由 [`Since::keeps`] 再定。没有 `since` 就是空串，全要。
    fn floor(&self) -> String {
        self.date
            .and_then(|date| date.checked_sub_days(chrono::Days::new(2)))
            .map(|date| date.to_string())
            .unwrap_or_default()
    }
}

/// 一个逐点指标：按时刻去重（先读到的留下），超出范围的不要。
fn samples(
    db: &Database,
    metric: &str,
    range: std::ops::RangeInclusive<f64>,
    since: Since,
) -> Result<BTreeMap<i64, f64>> {
    let mut stmt = db.conn.prepare(
        "SELECT timestamp, value FROM metric_samples WHERE metric = ?1 AND timestamp >= ?2
         ORDER BY timestamp, id",
    )?;
    let mut rows = stmt.query(rusqlite::params![metric, since.floor()])?;
    let mut out = BTreeMap::new();
    while let Some(row) = rows.next()? {
        let (text, value): (String, f64) = (row.get(0)?, row.get(1)?);
        let Some(epoch) = epoch_of(&text) else {
            continue;
        };
        if value.is_finite() && range.contains(&value) && since.keeps(epoch) {
            out.entry(epoch).or_insert(value);
        }
    }
    Ok(out)
}

/// 一个日指标：一天一条，取总览显示的那条（融合的优先，再取大的）。
fn daily(db: &Database, metric: &str, since: Since) -> Result<BTreeMap<NaiveDate, f64>> {
    let mut stmt = db.conn.prepare(
        "SELECT date, value FROM daily_metrics WHERE metric = ?1
         ORDER BY date, (source_scope = 'user_fused') DESC, value DESC, id DESC",
    )?;
    let mut rows = stmt.query([metric])?;
    let mut out = BTreeMap::new();
    while let Some(row) = rows.next()? {
        let (text, value): (String, f64) = (row.get(0)?, row.get(1)?);
        let Ok(date) = NaiveDate::parse_from_str(&text, "%Y-%m-%d") else {
            continue;
        };
        if value.is_finite() && since.keeps_day(date) {
            out.entry(date).or_insert(value);
        }
    }
    Ok(out)
}

fn point_table(
    name: &'static str,
    header: &str,
    points: &BTreeMap<i64, f64>,
    value: impl Fn(f64) -> String,
    tail: &[&str],
) -> Table {
    let mut table = Table::new(name, header);
    for (epoch, v) in points {
        let mut cells = vec![iso(*epoch), epoch.to_string(), value(*v)];
        cells.extend(tail.iter().map(|s| s.to_string()));
        table.push(&cells);
    }
    table
}

fn rounded(v: f64) -> String {
    (v.round() as i64).to_string()
}

/// 按天的值写成 `day,epoch,<列>,date`（静息心率、当天最大心率）。今天不写（见 [`Since`]）。
fn day_table(
    name: &'static str,
    header: &str,
    days: &BTreeMap<NaiveDate, f64>,
    since: Since,
) -> Table {
    let mut table = Table::new(name, header);
    for (date, value) in days
        .iter()
        .filter(|(date, _)| since.keeps_finished_day(**date))
    {
        let Some(midnight) = local_midnight(*date) else {
            continue;
        };
        table.push(&[
            iso(midnight),
            midnight.to_string(),
            rounded(*value),
            date.to_string(),
        ]);
    }
    table
}

/// 一段睡眠（主睡或小睡），和它的分期。
struct Night {
    start: i64,
    end: i64,
    nap: bool,
    score: Option<i64>,
    deep: Option<i64>,
    light: Option<i64>,
    rem: Option<i64>,
    awake: Option<i64>,
    wake_count: Option<i64>,
    stages: Vec<(i64, i64, String)>,
}

fn overlaps(a: &Night, b: &Night) -> bool {
    a.start < b.end && b.start < a.end
}

fn stage_name(stage: &str) -> Option<&'static str> {
    match stage {
        "awake" => Some("awake"),
        "light" => Some("light"),
        "deep" => Some("deep"),
        "rem" => Some("rem"),
        _ => None,
    }
}

/// 库里的睡眠：几台设备同一晚都有时留最长的那条（unstrap 也不收重叠的）。小睡是主睡上挂的
/// 小睡分期，连着的（间隔不到 5 分钟）算一次。
fn nights(db: &Database, since: Since) -> Result<Vec<Night>> {
    let mut stages: HashMap<String, Vec<(i64, i64, String)>> = HashMap::new();
    let mut naps: HashMap<String, Vec<(i64, i64, String)>> = HashMap::new();
    for (table, into) in [
        ("sleep_stages", &mut stages),
        ("sleep_nap_stages", &mut naps),
    ] {
        let mut stmt = db.conn.prepare(&format!(
            "SELECT sleep_id, stage, start_time, end_time FROM {table}
             WHERE start_time >= ?1 ORDER BY start_time"
        ))?;
        let mut rows = stmt.query([since.floor()])?;
        while let Some(row) = rows.next()? {
            let (id, stage, start, end): (String, String, String, String) =
                (row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?);
            let (Some(name), Some(start), Some(end)) =
                (stage_name(&stage), epoch_of(&start), epoch_of(&end))
            else {
                continue;
            };
            if end > start {
                into.entry(id)
                    .or_default()
                    .push((start, end, name.to_string()));
            }
        }
    }

    let mut candidates = Vec::new();
    let mut stmt = db.conn.prepare(
        "SELECT sleep_id, start_time, end_time, score, deep_minutes, light_minutes, rem_minutes,
                awake_minutes, wake_count
         FROM sleep_sessions",
    )?;
    let mut rows = stmt.query([])?;
    while let Some(row) = rows.next()? {
        let id: String = row.get(0)?;
        let (Some(start), Some(end)) = (
            epoch_of(&row.get::<_, String>(1)?),
            epoch_of(&row.get::<_, String>(2)?),
        ) else {
            continue;
        };
        if end <= start || !since.keeps(start) {
            continue;
        }
        let minutes = |i: usize| -> rusqlite::Result<Option<i64>> {
            Ok(row.get::<_, Option<i64>>(i)?.filter(|m| *m >= 0))
        };
        candidates.push(Night {
            start,
            end,
            nap: false,
            score: row.get::<_, Option<i64>>(3)?.filter(|s| *s > 0),
            deep: minutes(4)?,
            light: minutes(5)?,
            rem: minutes(6)?,
            awake: minutes(7)?,
            wake_count: minutes(8)?,
            stages: stages.remove(&id).unwrap_or_default(),
        });
        for run in nap_runs(naps.remove(&id).unwrap_or_default()) {
            if since.keeps(run.start) {
                candidates.push(run);
            }
        }
    }
    // 长的先占位：同一晚留最完整的那条。
    candidates.sort_by_key(|n| std::cmp::Reverse(n.end - n.start));
    let mut kept: Vec<Night> = Vec::new();
    for night in candidates {
        if !kept.iter().any(|k| overlaps(k, &night)) {
            kept.push(night);
        }
    }
    kept.sort_by_key(|n| n.start);
    Ok(kept)
}

/// 小睡分期 → 一次次小睡（连着的分期并成一次），各阶段分钟数从分期加。
fn nap_runs(mut segments: Vec<(i64, i64, String)>) -> Vec<Night> {
    segments.sort_by_key(|s| s.0);
    let mut runs: Vec<Vec<(i64, i64, String)>> = Vec::new();
    for segment in segments {
        match runs.last_mut() {
            Some(run) if segment.0 - run.last().map(|s| s.1).unwrap_or(segment.0) <= 300 => {
                run.push(segment)
            }
            _ => runs.push(vec![segment]),
        }
    }
    runs.into_iter()
        .filter_map(|run| {
            let start = run.first()?.0;
            let end = run.iter().map(|s| s.1).max()?;
            let minutes = |name: &str| {
                Some(
                    run.iter()
                        .filter(|s| s.2 == name)
                        .map(|s| s.1 - s.0)
                        .sum::<i64>()
                        / 60,
                )
            };
            Some(Night {
                start,
                end,
                nap: true,
                score: None,
                deep: minutes("deep"),
                light: minutes("light"),
                rem: minutes("rem"),
                awake: minutes("awake"),
                wake_count: None,
                stages: run,
            })
        })
        .collect()
}

/// 睡眠算哪一天：主睡是醒来那天，小睡是开始那天（和 unstrap 一样）。
fn night_day(night: &Night) -> Option<NaiveDate> {
    local_date(if night.nap { night.start } else { night.end })
}

fn sleep_tables(nights: &[Night]) -> (Table, Table) {
    let mut sessions = Table::new(
        "sleep_session.csv",
        "start,end,start_epoch,end_epoch,nap,score,avg_hr,deep_min,light_min,rem_min,awake_min,wake_count,day_epoch,date,source",
    );
    let mut stages = Table::new("sleep_stage.csv", "session_start_epoch,start,end,stage");
    for night in nights {
        let Some(day) = night_day(night) else {
            continue;
        };
        sessions.push(&[
            iso(night.start),
            iso(night.end),
            night.start.to_string(),
            night.end.to_string(),
            night.nap.to_string(),
            opt(night.score),
            String::new(),
            opt(night.deep),
            opt(night.light),
            opt(night.rem),
            opt(night.awake),
            opt(night.wake_count),
            opt(local_midnight(day)),
            day.to_string(),
            "0".to_string(),
        ]);
        for (start, end, stage) in &night.stages {
            stages.push(&[
                night.start.to_string(),
                iso(*start),
                iso(*end),
                stage.clone(),
            ]);
        }
    }
    (sessions, stages)
}

/// 呼吸率：Zepp 一晚一个值，unstrap 取睡眠里的样本求平均，所以记在那晚主睡的正中间。
fn breath_table(db: &Database, nights: &[Night], since: Since) -> Result<Table> {
    let rates = daily(db, "respiratory_rate", since)?;
    let mut table = Table::new("breath_rate.csv", "time,epoch,breaths_per_minute");
    for night in nights.iter().filter(|n| !n.nap) {
        let Some(rate) = night_day(night).and_then(|day| rates.get(&day)) else {
            continue;
        };
        if !(4.0..=60.0).contains(rate) {
            continue;
        }
        let middle = night.start + (night.end - night.start) / 2;
        table.push(&[iso(middle), middle.to_string(), rounded(*rate)]);
    }
    Ok(table)
}

/// PAI：一天一条，记在当天最后一分钟（unstrap 取一天里最后那条当这天的值）。四个值缺一个就不写。
/// 今天还没过完：记在今天最后一个心率样本那一刻。之后再导，新样本带来更晚的一条，手机上就换成
/// 新值；没有新样本时内容不变，推送也就不重发。
fn pai_table(db: &Database, since: Since, heart: &BTreeMap<i64, f64>) -> Result<Table> {
    let daily_pai = daily(db, "pai_daily", since)?;
    let total = daily(db, "pai_total", since)?;
    let resting = daily(db, "device_resting_hr", since)?;
    let max = daily(db, "device_max_hr", since)?;
    let mut table = Table::new(
        "pai.csv",
        "time,epoch,daily,total,resting_hr,max_hr,tomorrow_total",
    );
    for (date, value) in &daily_pai {
        let (Some(total), Some(resting), Some(max), Some(next)) = (
            total.get(date),
            resting.get(date),
            max.get(date),
            date.succ_opt().and_then(local_midnight),
        ) else {
            continue;
        };
        let mut at = next - 60;
        if *date >= since.today {
            let Some(latest) = heart.range(..next).next_back().map(|(epoch, _)| *epoch) else {
                continue;
            };
            if local_date(latest) != Some(*date) {
                continue;
            }
            at = latest;
        }
        table.push(&[
            iso(at),
            at.to_string(),
            value.to_string(),
            total.to_string(),
            rounded(*resting),
            rounded(*max),
            String::new(),
        ]);
    }
    Ok(table)
}

/// 准备度：Zepp 的准备度就是带子自己的那套（总分 + HRV / 静息心率 / 皮温 / 呼吸紊乱四项），
/// 正好对上 unstrap 留给带子准备度的表。没有总分的天不写。
fn readiness_table(db: &Database, since: Since) -> Result<Table> {
    let score = daily(db, "readiness", since)?;
    let parts = [
        "hrv_readiness",
        "rhr_readiness",
        "skin_temp_readiness",
        "ahi_readiness",
        "sleep_hrv",
        "sleep_rhr",
    ]
    .map(|metric| daily(db, metric, since));
    let mut maps = Vec::with_capacity(parts.len());
    for part in parts {
        maps.push(part?);
    }
    let mut table = Table::new(
        "strap_readiness.csv",
        "day_epoch,updated_epoch,score,hrv_score,resting_hr_score,skin_temperature_score,breathing_score,sleep_hrv,sleep_resting_hr,algorithm_version,date",
    );
    for (date, value) in score
        .iter()
        .filter(|(date, _)| since.keeps_finished_day(**date))
    {
        let Some(midnight) = local_midnight(*date) else {
            continue;
        };
        let mut cells = vec![midnight.to_string(), midnight.to_string(), rounded(*value)];
        cells.extend(
            maps.iter()
                .map(|m| opt(m.get(date).map(|v| v.round() as i64))),
        );
        cells.push("zepp".to_string());
        cells.push(date.to_string());
        table.push(&cells);
    }
    Ok(table)
}

/// 逐分钟活动：Zepp 旧通道明细和带子的类型 1 是同一种 8 字节记录（类型、强度、步数、心率……），
/// 原样换成 unstrap 的列。全 0xFF 的分钟是带子还没写的，跳过；类型取低 4 位（和 unstrap 一样）；
/// 心率 30–220 以外是没测到。
fn activity_table(db: &Database, since: Since) -> Result<Table> {
    const BLANK_MODE: u8 = 126;
    let mut table = Table::new(
        "activity_minute.csv",
        "time,epoch,steps,intensity,kind,heart_rate",
    );
    for (date, bytes) in db.legacy_minute_records(since.date.and_then(|d| d.pred_opt()))? {
        let Some(midnight) = local_midnight(date) else {
            continue;
        };
        for (minute, record) in bytes.as_chunks::<8>().0.iter().enumerate() {
            if record.iter().all(|b| *b == 0xFF) {
                continue;
            }
            let epoch = midnight + minute as i64 * 60;
            if !since.keeps(epoch) {
                continue;
            }
            let kind = if record[0] == BLANK_MODE {
                record[0]
            } else {
                record[0] & 0x0F
            };
            let heart = Some(record[3]).filter(|hr| (30..=220).contains(hr));
            table.push(&[
                iso(epoch),
                epoch.to_string(),
                record[2].to_string(),
                record[1].to_string(),
                kind.to_string(),
                opt(heart),
            ]);
        }
    }
    Ok(table)
}

/// 全部健康表，按 unstrap 的表名。
pub(super) fn health_tables(
    db: &Database,
    since: Option<DateTime<Utc>>,
    today: NaiveDate,
) -> Result<Vec<Table>> {
    let since = Since::new(since, today);
    let heart = samples(db, "heart_rate", 25.0..=250.0, since)?;
    let rmssd = samples(db, "hrv_rmssd", 1.0..=400.0, since)?;
    let sdnn = samples(db, "hrv", 1.0..=400.0, since)?;
    let stress = samples(db, "stress", 0.0..=100.0, since)?;
    let spo2 = samples(db, "spo2", 50.0..=100.0, since)?;
    let nights = nights(db, since)?;
    let (sessions, stages) = sleep_tables(&nights);
    Ok(vec![
        point_table(
            "heart_rate.csv",
            "time,epoch,bpm,source",
            &heart,
            rounded,
            &["0"],
        ),
        point_table("hrv.csv", "time,epoch,milliseconds", &rmssd, rounded, &[]),
        point_table(
            "hrv_sdnn.csv",
            "time,epoch,milliseconds",
            &sdnn,
            |v| v.to_string(),
            &[],
        ),
        point_table("stress.csv", "time,epoch,value", &stress, rounded, &[]),
        point_table("spo2.csv", "time,epoch,percent", &spo2, rounded, &[]),
        day_table(
            "resting_hr.csv",
            "day,epoch,bpm,date",
            &daily(db, "resting_hr", since)?,
            since,
        ),
        day_table(
            "daily_max_hr.csv",
            "day,epoch,bpm,date",
            &daily(db, "device_max_hr", since)?,
            since,
        ),
        sessions,
        stages,
        breath_table(db, &nights, since)?,
        pai_table(db, since, &heart)?,
        readiness_table(db, since)?,
        activity_table(db, since)?,
    ])
}

#[cfg(test)]
pub(super) fn midnight(date: NaiveDate) -> Option<i64> {
    local_midnight(date)
}
