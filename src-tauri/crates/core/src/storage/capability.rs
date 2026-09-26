//! 能力看板：哪些数据流有证据、哪些被云端拒绝（从 storage/mod.rs 按领域拆出，逻辑不变）。

use super::*;

/// Where a capability's evidence lives, so the overview can count it without
/// a network request.
pub(super) enum CapabilityEvidence {
    /// Distinct days in `daily_metrics` whose metric matches a prefix.
    DailyPrefix(&'static str),
    /// Rows in `metric_samples` for one metric name.
    Samples(&'static str),
    /// Rows in a table with a timestamp column.
    Table(&'static str, &'static str),
}

/// The capability list, in display order.
///
/// Nine of these are answered entirely from stored data — the strongest
/// evidence available, since "you have 32 days of stress readings" beats any
/// probe. Only the three with no local trace need a request, and those are the
/// ones where silence is genuinely ambiguous.
pub(super) const CAPABILITY_ROWS: [(&str, CapabilityEvidence, i64); 17] = [
    ("heart_rate", CapabilityEvidence::Samples("heart_rate"), 30),
    (
        "sleep",
        CapabilityEvidence::Table("sleep_sessions", "start_time"),
        30,
    ),
    (
        "workouts",
        CapabilityEvidence::Table("workouts", "start_time"),
        90,
    ),
    ("steps", CapabilityEvidence::DailyPrefix("steps"), 30),
    (
        "daily_activity",
        CapabilityEvidence::DailyPrefix("distance"),
        30,
    ),
    ("stress", CapabilityEvidence::DailyPrefix("stress"), 30),
    ("spo2", CapabilityEvidence::DailyPrefix("spo2"), 30),
    (
        "respiratory_rate",
        CapabilityEvidence::DailyPrefix("respiratory"),
        30,
    ),
    ("hrv", CapabilityEvidence::Samples("hrv"), 30),
    ("hrv_rmssd", CapabilityEvidence::Samples("hrv_rmssd"), 30),
    ("recovery", CapabilityEvidence::DailyPrefix("readiness"), 30),
    (
        "training_load",
        CapabilityEvidence::DailyPrefix("training_load"),
        30,
    ),
    ("vo2max", CapabilityEvidence::DailyPrefix("vo2max"), 365),
    (
        "lactate_threshold",
        CapabilityEvidence::DailyPrefix("lactate_threshold"),
        365,
    ),
    ("pai", CapabilityEvidence::DailyPrefix("pai"), 30),
    // 体重不再是「只能靠探针」的一条。它现在真的入库，所以证据就是库里的
    // 样本本身——而这正是四个人报的那件事的终点：以前这一行永远显示探针
    // 的结论「最近 365 天没有测量记录」，因为探针打的是一个对谁都空的面。
    ("weight", CapabilityEvidence::Samples("weight"), 365),
    // 饮食记录同理。窗口给 365 天：手动记录是间断的，一周没记不说明这个
    // 账号没有这个功能。
    ("food", CapabilityEvidence::DailyPrefix("intake_"), 365),
];

/// The metric names one weigh-in produces.
///
/// Exports select by *type* (`--types weight`) while `metric_samples` stores by
/// *metric*, and unlike heart rate the two do not share a name — a weigh-in
/// yields eleven differently-named rows. Kept in step with `BODY_METRICS` in
/// the normalizer: a name added there and forgotten here is written to the
/// database and then silently missing from every export.
pub const BODY_COMPOSITION_METRICS: [&str; 11] = [
    "weight",
    "bmi",
    "height",
    "body_fat_rate",
    "body_water_rate",
    "muscle_mass",
    "bone_mass",
    "protein_rate",
    "visceral_fat",
    "bmr",
    "body_balance_score",
];

/// Streams with no local trace at all. Only these cost a request.
///
/// `weight` 和 `food` 都已经不在里面了：两条现在都真的入库，证据是库里的行
/// 而不是一句探针结论。留下的是仍然只能靠探针回答的那两条。
pub const PROBE_ONLY_CAPABILITIES: [&str; 2] = ["blood_pressure", "emotion"];

/// 探测覆盖多久。和探测本身用的范围一致，界面拿它写「过去 N 天没有测量记录」。
pub(super) const PROBE_WINDOW_DAYS: i64 = 365;

pub(super) const CAPABILITY_PROBE_RESULT_KEY: &str = "capability_probe_result";

pub(super) const CAPABILITY_PROBE_AT_KEY: &str = "capability_probe_at";

impl Database {
    /// Build the capability overview: read what the library already proves,
    /// then fold in the stored result of the last probe for the rest.
    pub fn capability_overview(&self, today: NaiveDate) -> Result<CapabilityOverview> {
        let probed: BTreeMap<String, CapabilityProbe> = self
            .get_app_meta(CAPABILITY_PROBE_RESULT_KEY)?
            .and_then(|raw| serde_json::from_str::<Vec<CapabilityProbe>>(&raw).ok())
            .unwrap_or_default()
            .into_iter()
            .map(|probe| (probe.stream.clone(), probe))
            .collect();
        let mut items = Vec::new();
        for (stream, evidence, window_days) in CAPABILITY_ROWS {
            // Inclusive local calendar window of exactly `window_days`:
            // `today - (window_days - 1)` .. `today`.
            let start = today - Duration::days(window_days - 1);
            let start_text = start.to_string();
            let end_text = today.to_string();
            // UTC 宽限界先让索引把范围切出来，date() 只做精修：metric_samples
            // 走 uq 前导 (metric, timestamp)，workouts 走 v33 的
            // idx_workouts_start。sleep_sessions 还没有 start_time 索引，界对
            // 它只是无害的附加谓词——形状保持一致，等它有索引那天自动受益。
            let (utc_lower, utc_upper) = utc_bounds_or_unbounded(&start_text, &end_text);
            let (records, latest, unit) = match evidence {
                CapabilityEvidence::DailyPrefix(prefix) => {
                    let pattern = format!("{prefix}%");
                    let row = self.conn.query_row(
                        "SELECT COUNT(DISTINCT date), MAX(date) FROM daily_metrics
                         WHERE metric LIKE ?1 AND date BETWEEN ?2 AND ?3",
                        params![pattern, start_text, end_text],
                        |row| Ok((row.get::<_, i64>(0)?, row.get::<_, Option<String>>(1)?)),
                    )?;
                    (row.0, row.1, ("天", "days"))
                }
                CapabilityEvidence::Samples(metric) => {
                    let row = self.conn.query_row(
                        "SELECT COUNT(*), MAX(date(timestamp, 'localtime')) FROM metric_samples
                         WHERE metric = ?1
                           AND timestamp >= ?4 AND timestamp < ?5
                           AND date(timestamp, 'localtime') BETWEEN ?2 AND ?3",
                        params![metric, start_text, end_text, utc_lower, utc_upper],
                        |row| Ok((row.get::<_, i64>(0)?, row.get::<_, Option<String>>(1)?)),
                    )?;
                    (row.0, row.1, ("条", "records"))
                }
                CapabilityEvidence::Table(table, column) => {
                    let sql = format!(
                        "SELECT COUNT(*), MAX(date({column}, 'localtime')) FROM {table}
                         WHERE {column} >= ?1 AND {column} < ?2
                           AND date({column}, 'localtime') BETWEEN ?3 AND ?4"
                    );
                    let row = self.conn.query_row(
                        &sql,
                        params![utc_lower, utc_upper, start_text, end_text],
                        |row| Ok((row.get::<_, i64>(0)?, row.get::<_, Option<String>>(1)?)),
                    )?;
                    (row.0, row.1, ("条", "records"))
                }
            };
            let (unit_label, unit_code) = unit;
            // A positive Food probe proves records exist even when their
            // shape is not yet understood. Never turn a parser gap into
            // "nothing recorded", or present cloud records as local data.
            if stream == "food" && records == 0 {
                if let Some(probe) = probed.get(stream).filter(|probe| {
                    probe.status == "available"
                        && probe.records > 0
                        && probe.latest_date.as_deref().is_some_and(|date| {
                            date >= start_text.as_str() && date <= end_text.as_str()
                        })
                }) {
                    items.push(CapabilityItem {
                        stream: stream.to_string(),
                        status: "available".to_string(),
                        records: probe.records as i64,
                        records_unit: "条".to_string(),
                        records_unit_code: "records".to_string(),
                        window_days: probe.window_days,
                        latest_date: probe.latest_date.clone(),
                        note: Some("云端有记录，但本机尚无可用数据。请同步或补拉；若仍未收录，可能需要补充报文格式支持。".to_string()),
                        source: "probed".to_string(),
                        ingested: false,
                    });
                    continue;
                }
            }
            items.push(CapabilityItem {
                stream: stream.to_string(),
                status: if records > 0 {
                    "available"
                } else {
                    "no_records"
                }
                .to_string(),
                records,
                records_unit: unit_label.to_string(),
                records_unit_code: unit_code.to_string(),
                window_days,
                latest_date: latest,
                note: (records == 0).then(|| format!("最近 {window_days} 天没有记录")),
                source: "derived".to_string(),
                // 这些行的证据本来就是库里的数据，所以按定义已收录。
                ingested: true,
            });
        }

        // Streams that leave no local trace: report the last probe, or say
        // plainly that they have not been checked yet.
        for stream in PROBE_ONLY_CAPABILITIES {
            let item = match probed.get(stream) {
                Some(probe) if probe.status == "available" => CapabilityItem {
                    stream: stream.to_string(),
                    status: "available".to_string(),
                    records: probe.records as i64,
                    records_unit: "条".to_string(),
                    records_unit_code: "records".to_string(),
                    window_days: PROBE_WINDOW_DAYS,
                    latest_date: probe.latest_date.clone(),
                    // 说清楚这是云端的数量，不是本机的。
                    note: Some(
                        "云端有记录，但 ZeppBridge 还没有收录这条流：缺少可核对的报文样本，贸然归一化只会产出没人能验证的数字。"
                            .to_string(),
                    ),
                    source: "probed".to_string(),
                    ingested: false,
                },
                // Only an outright rejection licenses "your device does not
                // provide this"; an empty answer does not, because this API
                // answers that way for names that cannot exist.
                Some(probe) if probe.status == "unavailable" => CapabilityItem {
                    stream: stream.to_string(),
                    status: "unsupported".to_string(),
                    records: 0,
                    records_unit: "条".to_string(),
                    records_unit_code: "records".to_string(),
                    window_days: PROBE_WINDOW_DAYS,
                    latest_date: None,
                    note: Some("你的账号或设备不提供这项数据".to_string()),
                    source: "probed".to_string(),
                    ingested: false,
                },
                Some(_) => CapabilityItem {
                    stream: stream.to_string(),
                    status: "no_records".to_string(),
                    records: 0,
                    records_unit: "条".to_string(),
                    records_unit_code: "records".to_string(),
                    window_days: PROBE_WINDOW_DAYS,
                    latest_date: None,
                    note: Some("过去一年没有测量记录".to_string()),
                    source: "probed".to_string(),
                    ingested: false,
                },
                None => CapabilityItem {
                    stream: stream.to_string(),
                    status: "unknown".to_string(),
                    records: 0,
                    records_unit: "条".to_string(),
                    records_unit_code: "records".to_string(),
                    window_days: PROBE_WINDOW_DAYS,
                    latest_date: None,
                    note: Some("尚未检测".to_string()),
                    source: "probed".to_string(),
                    ingested: false,
                },
            };
            items.push(item);
        }

        Ok(CapabilityOverview {
            items,
            probed_at: self.get_app_meta(CAPABILITY_PROBE_AT_KEY)?,
        })
    }

    pub fn save_capability_probe(&self, probes: &[CapabilityProbe]) -> Result<()> {
        // The scheduled sync probes only request-only streams, while the
        // diagnostics button probes every stream. Replacing the whole list
        // here used to erase a positive Food result on the next sync.
        let mut merged: BTreeMap<String, CapabilityProbe> = self
            .get_app_meta(CAPABILITY_PROBE_RESULT_KEY)?
            .and_then(|raw| serde_json::from_str::<Vec<CapabilityProbe>>(&raw).ok())
            .unwrap_or_default()
            .into_iter()
            .map(|probe| (probe.stream.clone(), probe))
            .collect();
        let mut updated = false;
        for probe in probes {
            // A transient request failure does not refute an earlier result.
            if probe.status != "error" {
                let mut saved = probe.clone();
                // Field names are useful in the immediate diagnostic result,
                // but the board needs only the count and date. Do not retain
                // schema from a user's health response unnecessarily.
                saved.fields.clear();
                merged.insert(probe.stream.clone(), saved);
                updated = true;
            }
        }
        if !updated {
            return Ok(());
        }
        let encoded = serde_json::to_string(&merged.into_values().collect::<Vec<_>>())
            .map_err(|error| ZeppBridgeError::ParseError(error.to_string()))?;
        self.set_app_meta(CAPABILITY_PROBE_RESULT_KEY, &encoded)?;
        self.set_app_meta(CAPABILITY_PROBE_AT_KEY, &Utc::now().to_rfc3339())
    }

    /// Whether the request-only streams are due a re-check.
    ///
    /// A first answer is not a permanent one: someone may start measuring
    /// blood pressure, or connect a scale, long after install.
    pub fn capability_probe_is_stale(&self, max_age_days: i64) -> Result<bool> {
        let Some(raw) = self.get_app_meta(CAPABILITY_PROBE_AT_KEY)? else {
            return Ok(true);
        };
        let Ok(probed_at) = DateTime::parse_from_rfc3339(&raw) else {
            return Ok(true);
        };
        Ok((Utc::now() - probed_at.with_timezone(&Utc)).num_days() >= max_age_days)
    }
}
