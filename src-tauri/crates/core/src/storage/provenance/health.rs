//! 数据健康报告：逐流三阶段、覆盖解释与建议动作（从 storage/provenance.rs 拆出，逻辑不变）。

use super::*;

impl Database {
    /// 记录某个 stream 某一阶段的结果。
    ///
    /// 每次调用只动一个阶段的列，所以 fetch 成功、parse 失败这种组合能被如实
    /// 保留下来，而不是被最后一次写入抹平成一个状态。
    pub fn record_stream_stage(
        &self,
        stream: &str,
        stage: Stage,
        outcome: &StageOutcome,
    ) -> Result<()> {
        let now = Utc::now().to_rfc3339();
        let prefix = stage.column_prefix();
        self.conn.execute(
            "INSERT OR IGNORE INTO stream_provenance(stream, updated_at) VALUES(?1, ?2)",
            rusqlite::params![stream, now],
        )?;
        match outcome {
            StageOutcome::Ok => {
                let sql = format!(
                    "UPDATE stream_provenance
                     SET last_{prefix}_ok_at = ?2,
                         last_{prefix}_error_at = NULL,
                         last_{prefix}_error_kind = NULL,
                         last_{prefix}_error_message = NULL,
                         updated_at = ?2
                     WHERE stream = ?1"
                );
                self.conn.execute(&sql, rusqlite::params![stream, now])?;
            }
            StageOutcome::Failed { kind, message } => {
                // 业务码单独存一列。它也在 `message` 里，但那是一句给人看的
                // 中文，而诊断报告只能发白名单字段——从一句散文里把数字
                // 正则抠出来，等于把文案变成协议。
                let code = match kind {
                    StageErrorKind::CloudRejected { code } => Some(*code),
                    _ => None,
                };
                let sql = format!(
                    "UPDATE stream_provenance
                     SET last_{prefix}_error_at = ?2,
                         last_{prefix}_error_kind = ?3,
                         last_{prefix}_error_message = ?4,
                         last_error_code = ?5,
                         updated_at = ?2
                     WHERE stream = ?1"
                );
                self.conn.execute(
                    &sql,
                    rusqlite::params![stream, now, kind.as_str(), message.as_deref(), code],
                )?;
            }
        }
        Ok(())
    }

    /// 记录这一轮写入了多少条 canonical 行。与阶段状态分开，因为「写成功但
    /// 是 0 条」和「写失败」是两件事。
    pub fn record_stream_written(&self, stream: &str, records: i64) -> Result<()> {
        let now = Utc::now().to_rfc3339();
        self.conn.execute(
            "INSERT INTO stream_provenance(stream, last_written_records, updated_at)
             VALUES(?1, ?2, ?3)
             ON CONFLICT(stream) DO UPDATE SET
                 last_written_records = excluded.last_written_records,
                 updated_at = excluded.updated_at",
            rusqlite::params![stream, records, now],
        )?;
        Ok(())
    }

    /// 本地重放完成的时间。**不改写云端同步时间。**
    pub fn record_local_replay(&self, manual: bool) -> Result<()> {
        let now = Utc::now().to_rfc3339();
        self.set_app_meta(LAST_LOCAL_REPLAY_AT_KEY, &now)?;
        if manual {
            self.set_app_meta(LAST_MANUAL_REPROCESS_AT_KEY, &now)?;
        }
        Ok(())
    }

    /// 显式跑一次 `PRAGMA integrity_check` 并记录结果。
    ///
    /// 大库上这是一次全表扫描，所以它是用户主动触发的动作，不在打开页面时
    /// 自动执行；页面平时显示的是上一次的结论和时间。
    pub fn run_integrity_check(&self) -> Result<IntegrityCheckResult> {
        let first: String = self
            .conn
            .query_row("PRAGMA integrity_check(1)", [], |row| row.get(0))?;
        let ok = first.eq_ignore_ascii_case("ok");
        let result = IntegrityCheckResult {
            checked_at: Utc::now().to_rfc3339(),
            ok,
            detail: (!ok).then(|| first.clone()),
        };
        if let Ok(encoded) = serde_json::to_string(&result) {
            self.set_app_meta(LAST_INTEGRITY_CHECK_KEY, &encoded)?;
        }
        Ok(result)
    }

    pub(super) fn last_integrity_check(&self) -> Result<Option<IntegrityCheckResult>> {
        Ok(self
            .get_app_meta(LAST_INTEGRITY_CHECK_KEY)?
            .and_then(|value| serde_json::from_str(&value).ok()))
    }

    #[allow(clippy::type_complexity)]
    pub(super) fn stage_states(
        &self,
    ) -> Result<(BTreeMap<String, [StageState; 3]>, BTreeMap<String, i64>)> {
        let mut states = BTreeMap::new();
        let mut stmt = self.conn.prepare(
            "SELECT stream,
                    last_fetch_ok_at, last_fetch_error_at, last_fetch_error_kind, last_fetch_error_message,
                    last_parse_ok_at, last_parse_error_at, last_parse_error_kind, last_parse_error_message,
                    last_write_ok_at, last_write_error_at, last_write_error_kind, last_write_error_message,
                    last_written_records
             FROM stream_provenance",
        )?;
        let rows = stmt.query_map([], |row| {
            let stream: String = row.get(0)?;
            let mut stages = [
                StageState::never(),
                StageState::never(),
                StageState::never(),
            ];
            for (index, base) in [1usize, 5, 9].into_iter().enumerate() {
                let ok_at: Option<String> = row.get(base)?;
                let error_at: Option<String> = row.get(base + 1)?;
                let error_kind: Option<String> = row.get(base + 2)?;
                let error_message: Option<String> = row.get(base + 3)?;
                // 最近一次事件决定当前状态：失败之后又成功一次就该显示成功。
                let failed_is_newer = match (&ok_at, &error_at) {
                    (_, None) => false,
                    (None, Some(_)) => true,
                    (Some(ok), Some(err)) => err.as_str() > ok.as_str(),
                };
                stages[index] = if failed_is_newer {
                    StageState {
                        state: "failed".into(),
                        at: error_at,
                        last_ok_at: ok_at,
                        error_kind,
                        message: error_message,
                    }
                } else if ok_at.is_some() {
                    StageState {
                        state: "ok".into(),
                        at: ok_at.clone(),
                        last_ok_at: ok_at,
                        error_kind: None,
                        message: None,
                    }
                } else {
                    StageState::never()
                };
            }
            let written: i64 = row.get(13)?;
            Ok((stream, stages, written))
        })?;
        let mut written = BTreeMap::new();
        for row in rows {
            let (stream, stages, count) = row?;
            written.insert(stream.clone(), count);
            states.insert(stream, stages);
        }
        Ok((states, written))
    }

    pub(super) fn scalar_i64(&self, sql: &str) -> Result<i64> {
        Ok(self.conn.query_row(sql, [], |row| row.get(0))?)
    }

    pub(super) fn source_breakdown(
        &self,
        table: &str,
        filter: &str,
    ) -> Result<Vec<SourceBreakdown>> {
        let sql = format!(
            "SELECT COALESCE(NULLIF(TRIM(source_scope), ''), 'unknown') AS scope, COUNT(*)
             FROM {table} {filter}
             GROUP BY scope ORDER BY COUNT(*) DESC"
        );
        let mut stmt = self.conn.prepare(&sql)?;
        let rows = stmt.query_map([], |row| {
            Ok(SourceBreakdown {
                source: normalize_source(&row.get::<_, String>(0)?),
                records: row.get(1)?,
            })
        })?;
        // 归一化之后可能出现重复的 key（例如两种拼写都落到 unknown），
        // 合并计数而不是显示两行。
        let mut merged: BTreeMap<String, i64> = BTreeMap::new();
        for row in rows {
            let row = row?;
            *merged.entry(row.source).or_default() += row.records;
        }
        let mut out: Vec<SourceBreakdown> = merged
            .into_iter()
            .map(|(source, records)| SourceBreakdown { source, records })
            .collect();
        out.sort_by(|a, b| b.records.cmp(&a.records).then(a.source.cmp(&b.source)));
        Ok(out)
    }

    /// 数据健康中心的完整后端契约。
    ///
    /// 这个调用不跑 `integrity_check`，也不触网：打开页面必须是便宜的。
    pub fn data_health(&self, window_days: i64, database_bytes: u64) -> Result<DataHealth> {
        let window_days = window_days.clamp(7, 3650);
        let (stages, written) = self.stage_states()?;
        let freshness = self.stream_freshness()?;

        let mut streams = Vec::new();
        for (stream, label, cadence) in STREAM_CATALOG {
            let raw_records = self.conn.query_row(
                "SELECT COUNT(*) FROM raw_records WHERE stream = ?1",
                [stream],
                |row| row.get::<_, i64>(0),
            )?;
            let (canonical_records, sources, observed) = self.stream_facts(stream, window_days)?;
            let stage = stages.get(stream);
            let mut fetch = stage.map_or_else(StageState::never, |s| s[0].clone());
            let parse = stage.map_or_else(StageState::never, |s| s[1].clone());
            let write = stage.map_or_else(StageState::never, |s| s[2].clone());
            // 旧库升级上来时 provenance 表是空的，但 raw_records 里明摆着有
            // 报文。把「从来没拉过」写成 never 会误导用户，所以用已有的
            // fetched_at 作为最近一次成功 fetch 的下界。
            if fetch.state == "never" {
                if let Some(at) = freshness
                    .get(stream)
                    .and_then(|value| value.last_cloud_sync_at.clone())
                {
                    fetch = StageState {
                        state: "ok".into(),
                        at: Some(at.clone()),
                        last_ok_at: Some(at),
                        error_kind: None,
                        message: None,
                    };
                }
            }
            streams.push(StreamHealth {
                stream: stream.to_string(),
                label: label.to_string(),
                cadence,
                fetch,
                parse,
                write,
                raw_records,
                canonical_records,
                last_written_records: written.get(stream).copied().unwrap_or(0),
                sources,
                coverage: explain_coverage(cadence, window_days, observed),
            });
        }

        let occasional_metrics = self.metric_health(window_days)?;

        let raw_total = self.scalar_i64("SELECT COUNT(*) FROM raw_records")?;
        let canonical_total = self.scalar_i64(
            "SELECT (SELECT COUNT(*) FROM metric_samples)
                  + (SELECT COUNT(*) FROM daily_metrics)
                  + (SELECT COUNT(*) FROM sleep_sessions)
                  + (SELECT COUNT(*) FROM workouts)",
        )?;
        // Canonical rows are upserted by natural keys: losing ownership does
        // not undo a successful normalization attempt.
        let normalization_by_stream = self.normalization_health()?;
        let pending_normalization = normalization_by_stream
            .iter()
            .filter(|row| row.state == "pending")
            .map(|row| row.records)
            .sum();

        let (last_cloud_sync_at, last_cloud_sync_outcome) = self.cloud_sync_metadata()?;
        let newest_sample_at = freshness
            .values()
            .filter_map(|value| value.newest_sample_at.clone())
            .max();

        // 空库不欠重放：修订号没记过只是因为还没有东西可重放，对它说
        // 「历史停在旧解析器上」是句没有内容的警告。
        let replay_plan = self.pending_replay_plan()?;
        let database = DatabaseHealth {
            schema_version: self.diagnostic_schema_version()?,
            normalizer_revision: NORMALIZER_REVISION.to_string(),
            stored_normalizer_revision: self.stored_normalizer_revision()?,
            normalizer_replay_pending: replay_plan
                .as_ref()
                .map(|plan| plan.raw_records > 0)
                .unwrap_or(false),
            replay_in_progress: super::super::replay_in_progress(),
            database_bytes,
            raw_records: raw_total,
            canonical_records: canonical_total,
            pending_normalization,
            normalization_by_stream,
            last_integrity_check: self.last_integrity_check()?,
        };
        let timings = HealthTimings {
            last_cloud_sync_at,
            last_cloud_sync_outcome,
            last_local_replay_at: self.get_app_meta(LAST_LOCAL_REPLAY_AT_KEY)?,
            last_manual_reprocess_at: self.get_app_meta(LAST_MANUAL_REPROCESS_AT_KEY)?,
            newest_sample_at,
        };
        let actions = suggested_actions(&database, &timings, &streams);

        Ok(DataHealth {
            generated_at: Utc::now().to_rfc3339(),
            database,
            timings,
            streams,
            occasional_metrics,
            actions,
        })
    }

    /// canonical 计数、来源拆分和观察到的日期集合。
    pub(super) fn stream_facts(
        &self,
        stream: &str,
        window_days: i64,
    ) -> Result<(i64, Vec<SourceBreakdown>, Observed)> {
        let cutoff = (Utc::now() - Duration::days(window_days))
            .date_naive()
            .format("%Y-%m-%d")
            .to_string();
        match stream {
            "heart_rate" | "hrv" => {
                let metric = if stream == "heart_rate" {
                    "heart_rate"
                } else {
                    "hrv"
                };
                let count = self.conn.query_row(
                    "SELECT COUNT(*) FROM metric_samples WHERE metric = ?1",
                    [metric],
                    |row| row.get(0),
                )?;
                let sources =
                    self.source_breakdown("metric_samples", &format!("WHERE metric = '{metric}'"))?;
                let observed = self.observed_days_for(
                    &format!(
                        "SELECT DISTINCT substr(timestamp, 1, 10) FROM metric_samples
                         WHERE metric = '{metric}' AND substr(timestamp, 1, 10) >= ?1"
                    ),
                    &cutoff,
                )?;
                Ok((count, sources, observed))
            }
            "daily_summary" | "wellness" => {
                let count = self.scalar_i64("SELECT COUNT(*) FROM daily_metrics")?;
                let sources = self.source_breakdown("daily_metrics", "")?;
                let observed = self.observed_days_for(
                    "SELECT DISTINCT date FROM daily_metrics WHERE date >= ?1",
                    &cutoff,
                )?;
                Ok((count, sources, observed))
            }
            "sleep" => {
                let count = self.scalar_i64("SELECT COUNT(*) FROM sleep_sessions")?;
                let sources = self.source_breakdown("sleep_sessions", "")?;
                let observed = self.observed_days_for(
                    "SELECT DISTINCT substr(end_time, 1, 10) FROM sleep_sessions
                     WHERE substr(end_time, 1, 10) >= ?1",
                    &cutoff,
                )?;
                Ok((count, sources, observed))
            }
            "workouts" | "workout_detail" => {
                let count = self.scalar_i64("SELECT COUNT(*) FROM workouts")?;
                let sources = self.source_breakdown("workouts", "")?;
                let observed = self.observed_days_for(
                    "SELECT DISTINCT substr(start_time, 1, 10) FROM workouts
                     WHERE substr(start_time, 1, 10) >= ?1",
                    &cutoff,
                )?;
                Ok((count, sources, observed))
            }
            _ => Ok((0, Vec::new(), Observed::default())),
        }
    }

    pub(super) fn observed_days_for(&self, sql: &str, cutoff: &str) -> Result<Observed> {
        let mut stmt = self.conn.prepare(sql)?;
        let rows = stmt.query_map([cutoff], |row| row.get::<_, Option<String>>(0))?;
        let mut days: Vec<String> = rows
            .collect::<std::result::Result<Vec<_>, _>>()?
            .into_iter()
            .flatten()
            .collect();
        days.sort();
        days.dedup();
        Ok(Observed { days })
    }

    /// 每个指标一行。偶发指标（VO₂max、乳酸阈值等）只报告观察到的日期，
    /// 不参与缺口判定。
    pub(super) fn metric_health(&self, window_days: i64) -> Result<Vec<StreamHealth>> {
        let mut metrics: Vec<String> = Vec::new();
        for sql in [
            "SELECT DISTINCT metric FROM metric_samples",
            "SELECT DISTINCT metric FROM daily_metrics",
        ] {
            let mut stmt = self.conn.prepare(sql)?;
            let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
            for row in rows {
                metrics.push(row?);
            }
        }
        metrics.sort();
        metrics.dedup();

        let cutoff = (Utc::now() - Duration::days(window_days))
            .date_naive()
            .format("%Y-%m-%d")
            .to_string();
        let mut out = Vec::new();
        for metric in metrics {
            let cadence = metric_cadence(&metric);
            if cadence != StreamCadence::Occasional {
                continue;
            }
            let sample_count: i64 = self.conn.query_row(
                "SELECT COUNT(*) FROM metric_samples WHERE metric = ?1",
                [&metric],
                |row| row.get(0),
            )?;
            let daily_count: i64 = self.conn.query_row(
                "SELECT COUNT(*) FROM daily_metrics WHERE metric = ?1",
                [&metric],
                |row| row.get(0),
            )?;
            let mut days: Vec<String> = Vec::new();
            for sql in [
                "SELECT DISTINCT substr(timestamp, 1, 10) FROM metric_samples
                 WHERE metric = ?1 AND substr(timestamp, 1, 10) >= ?2",
                "SELECT DISTINCT date FROM daily_metrics WHERE metric = ?1 AND date >= ?2",
            ] {
                let mut stmt = self.conn.prepare(sql)?;
                let rows =
                    stmt.query_map([&metric, &cutoff], |row| row.get::<_, Option<String>>(0))?;
                for row in rows {
                    if let Some(day) = row? {
                        days.push(day);
                    }
                }
            }
            days.sort();
            days.dedup();
            let sources = if sample_count >= daily_count {
                self.source_breakdown("metric_samples", &format!("WHERE metric = '{metric}'"))?
            } else {
                self.source_breakdown("daily_metrics", &format!("WHERE metric = '{metric}'"))?
            };
            out.push(StreamHealth {
                label: metric_label(&metric),
                stream: metric,
                cadence,
                fetch: StageState::never(),
                parse: StageState::never(),
                write: StageState::never(),
                raw_records: 0,
                canonical_records: sample_count + daily_count,
                last_written_records: 0,
                sources,
                coverage: explain_coverage(cadence, window_days, Observed { days }),
            });
        }
        Ok(out)
    }
}

#[derive(Debug, Default, Clone)]
pub(super) struct Observed {
    pub(super) days: Vec<String>,
}

pub(super) fn normalize_source(raw: &str) -> String {
    match raw.trim().to_ascii_lowercase().as_str() {
        "device" => "device".into(),
        "user_fused" | "user" | "fused" => "user_fused".into(),
        "" => "unknown".into(),
        "unknown" => "unknown".into(),
        // 不认识的 scope 一律标成 unknown，而不是猜成设备数据。
        _ => "unknown".into(),
    }
}

pub(super) fn explain_coverage(
    cadence: StreamCadence,
    window_days: i64,
    observed: Observed,
) -> CoverageExplanation {
    let observed_days = observed.days.len() as i64;
    let first = observed.days.first().cloned();
    let latest = observed.days.last().cloned();

    if !cadence.has_expected_days() {
        let note = match cadence {
            StreamCadence::PerEvent => {
                "按事件产生：没有记录代表这段时间没有对应活动，不是缺口。".into()
            }
            _ => "手表偶尔才给一次：空白日期是正常的，不代表数据丢失。".into(),
        };
        return CoverageExplanation {
            kind: "observations".into(),
            window_days,
            observed_days,
            gap_dates: Vec::new(),
            gap_total: 0,
            first_observed_at: first,
            latest_observed_at: latest,
            note,
        };
    }

    // 只在「已经观察到数据」的区间里算缺口。第一次有数据之前的空白是
    // 「还没开始同步」，把它算成缺失会让每个新用户一打开就看到一片红。
    let (gap_dates, gap_total) = match (&first, &latest) {
        (Some(first), Some(latest)) => {
            let present: std::collections::HashSet<&str> =
                observed.days.iter().map(String::as_str).collect();
            let mut gaps = Vec::new();
            let mut total = 0i64;
            if let (Some(start), Some(end)) = (parse_day(first), parse_day(latest)) {
                let mut cursor = start;
                while cursor <= end {
                    let key = cursor.format("%Y-%m-%d").to_string();
                    if !present.contains(key.as_str()) {
                        total += 1;
                        if gaps.len() < MAX_REPORTED_GAPS {
                            gaps.push(key);
                        }
                    }
                    cursor += Duration::days(1);
                }
            }
            (gaps, total)
        }
        _ => (Vec::new(), 0),
    };

    let note = if observed_days == 0 {
        "这段时间还没有任何本地数据；先做一次同步再看。".into()
    } else if gap_total == 0 {
        "从第一天有数据起，没有观察到缺口。".into()
    } else {
        format!("从第一天有数据起，有 {gap_total} 天没有观察到数据。手表没戴、没同步或云端未返回都会造成缺口。")
    };

    CoverageExplanation {
        kind: "gaps".into(),
        window_days,
        observed_days,
        gap_dates,
        gap_total,
        first_observed_at: first,
        latest_observed_at: latest,
        note,
    }
}

pub(super) fn parse_day(value: &str) -> Option<NaiveDate> {
    NaiveDate::parse_from_str(value, "%Y-%m-%d").ok()
}

/// 只在确实有事可做时给动作，不做「永远显示一排按钮」的装饰。
pub(super) fn suggested_actions(
    database: &DatabaseHealth,
    timings: &HealthTimings,
    streams: &[StreamHealth],
) -> Vec<HealthAction> {
    let mut actions = Vec::new();
    if streams
        .iter()
        .any(|stream| stream.fetch.error_kind.as_deref() == Some("auth"))
    {
        actions.push(HealthAction {
            id: "reauth".into(),
            code: "reauth".into(),
            label: "重新连接 Zepp 账号".into(),
            reason: "有数据流因为认证失效而拉不到数据。".into(),
            destructive: false,
        });
    }
    if database.pending_normalization > 0
        || database.replay_in_progress
        || database.normalizer_replay_pending
    {
        // 两个理由要分开说。「有报文没产出记录」和「记录是旧规则产出的」
        // 对用户是两件不同的事，混成一句话会让第二种情况看起来像数据丢了。
        let reason = if database.normalizer_replay_pending
            && database.stored_normalizer_revision.as_deref() != Some(NORMALIZER_REVISION)
        {
            format!(
                "本机派生数据还是 {} 产出的，当前解析器是 {}。重放不触网，也不会改写云端同步时间。",
                database
                    .stored_normalizer_revision
                    .as_deref()
                    .unwrap_or("更早的版本"),
                database.normalizer_revision
            )
        } else {
            format!(
                "有 {} 份已保留的报文尚未完成归一化处理。重放不触网，也不会改写云端同步时间。",
                database.pending_normalization
            )
        };
        actions.push(HealthAction {
            id: "reprocess".into(),
            code: "reprocess".into(),
            label: "用当前解析器重放本地报文".into(),
            reason,
            destructive: false,
        });
    }
    if streams.iter().any(|stream| {
        stream.fetch.state == "failed" && stream.fetch.error_kind.as_deref() != Some("auth")
    }) {
        actions.push(HealthAction {
            id: "sync".into(),
            code: "sync_retry".into(),
            label: "再同步一次".into(),
            reason: "上一次有数据流没能从云端取回数据。".into(),
            destructive: false,
        });
    }
    if timings.last_cloud_sync_at.is_none() {
        actions.push(HealthAction {
            id: "sync".into(),
            code: "sync_first".into(),
            label: "做第一次同步".into(),
            reason: "本机还没有任何一次成功的云端同步记录。".into(),
            destructive: false,
        });
    }
    actions.push(HealthAction {
        id: "integrity_check".into(),
        code: "integrity_check".into(),
        label: "检查数据库完整性".into(),
        reason: "对整库做一次 SQLite integrity_check，大库上需要一点时间。".into(),
        destructive: false,
    });
    actions.push(HealthAction {
        id: "open_data_folder".into(),
        code: "open_data_folder".into(),
        label: "打开数据文件夹".into(),
        reason: "本机数据库、备份和导出都在这里。".into(),
        destructive: false,
    });
    actions.dedup_by(|a, b| a.id == b.id);
    actions
}
