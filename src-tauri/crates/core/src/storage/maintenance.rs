//! 数据状态、保留期清理、原始报文压缩与隔离（从 storage/mod.rs 按领域拆出，逻辑不变）。

use super::*;

impl Database {
    pub fn list_data_status(&self) -> Result<Vec<DataStatus>> {
        let mut stmt = self.conn.prepare(
            "SELECT stream, status, last_sync, records_written, capability,
                    needs_reauth, message FROM sync_state ORDER BY stream",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Option<String>>(2)?,
                row.get::<_, i64>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, i64>(5)?,
                row.get::<_, Option<String>>(6)?,
            ))
        })?;
        let mut statuses = Vec::new();
        for row in rows {
            let (stream, status, last_sync, records_written, capability, needs_reauth, message) =
                row?;
            statuses.push(DataStatus {
                stream,
                status,
                last_sync: last_sync
                    .as_deref()
                    .map(|value| parse_datetime(value, "sync_state.last_sync"))
                    .transpose()?,
                records_written,
                capability,
                needs_reauth: needs_reauth != 0,
                message,
            });
        }
        Ok(statuses)
    }

    #[allow(clippy::too_many_arguments)]
    pub fn update_sync_state_details(
        &self,
        stream: &str,
        cursor: Option<&str>,
        status: &str,
        error: Option<&str>,
        needs_reauth: bool,
        records_written: i64,
        capability: CapabilityStatus,
        message: Option<String>,
    ) -> Result<()> {
        let now = Utc::now().to_rfc3339();
        self.conn.execute(
            "INSERT INTO sync_state
                (stream, last_sync, cursor, status, error, needs_reauth,
                 records_written, capability, message, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?2)
             ON CONFLICT(stream) DO UPDATE SET
                last_sync = excluded.last_sync,
                cursor = excluded.cursor,
                status = excluded.status,
                error = excluded.error,
                needs_reauth = excluded.needs_reauth,
                records_written = excluded.records_written,
                capability = excluded.capability,
                message = excluded.message,
                updated_at = excluded.updated_at",
            params![
                stream,
                now,
                cursor,
                status,
                error,
                if needs_reauth { 1 } else { 0 },
                records_written,
                capability.as_str(),
                message,
            ],
        )?;
        Ok(())
    }

    #[allow(dead_code)]
    pub fn get_sync_state(&self, stream: &str) -> Result<Option<SyncStateInfo>> {
        let row = self
            .conn
            .query_row(
                "SELECT stream, last_sync, cursor, status, error, needs_reauth,
                        records_written, capability, message, updated_at
                 FROM sync_state WHERE stream = ?1",
                [stream],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, Option<String>>(1)?,
                        row.get::<_, Option<String>>(2)?,
                        row.get::<_, String>(3)?,
                        row.get::<_, Option<String>>(4)?,
                        row.get::<_, i64>(5)?,
                        row.get::<_, i64>(6)?,
                        row.get::<_, String>(7)?,
                        row.get::<_, Option<String>>(8)?,
                        row.get::<_, String>(9)?,
                    ))
                },
            )
            .optional()?;
        row.map(
            |(
                stream,
                last_sync,
                cursor,
                status,
                error,
                needs_reauth,
                records_written,
                capability,
                message,
                updated_at,
            )| {
                Ok(SyncStateInfo {
                    stream,
                    last_sync: last_sync
                        .as_deref()
                        .map(|value| parse_datetime(value, "sync_state.last_sync"))
                        .transpose()?,
                    cursor,
                    status,
                    error,
                    needs_reauth: needs_reauth != 0,
                    records_written,
                    capability,
                    message,
                    updated_at: parse_datetime(&updated_at, "sync_state.updated_at")?,
                })
            },
        )
        .transpose()
    }

    /// 把还没压缩的历史报文压掉，返回压缩前后的字节数。
    ///
    /// 先把 3.0 之前攒下的整窗每日事件报文整理成按日报文（见 `event_windows`），
    /// 那是老库里最大的一块；再压还没压缩的明文报文。
    ///
    /// 新写入的报文一进库就是压缩的，这个方法只管**装这一版之前**攒下来的
    /// 存量。它是一次性的维护动作，不在同步路径上跑：老库里可能有上千条、
    /// 上 GB 的报文，压一遍要读写一整轮，不该让一次普通同步顺手做这件事。
    ///
    /// 安全边界：**先解压回来比对，一模一样才落库**。原始报文是重放的唯一
    /// 依据，压坏一条就等于永久丢一条——宁可这一条不压。
    pub fn compact_raw_payloads(&self) -> Result<RawPayloadCompaction> {
        let _guard = CompactionGuard::enter();
        let mut report = RawPayloadCompaction::default();
        self.consolidate_event_windows(&mut report)?;
        let mut last_id: i64 = 0;
        loop {
            // 和重放同一个退出信号：批边界收手，把写锁尽快交还。
            if background_write_abort_requested() {
                break;
            }
            let pending: Vec<(i64, String)> = {
                let mut stmt = self.conn.prepare(
                    "SELECT id, payload FROM raw_records
                     WHERE id > ?1
                       AND (payload_zip IS NULL OR LENGTH(payload_zip) = 0)
                       AND LENGTH(payload) > ?2
                     ORDER BY id
                     LIMIT ?3",
                )?;
                let rows = stmt.query_map(
                    params![
                        last_id,
                        MIN_COMPRESSIBLE_PAYLOAD_BYTES,
                        COMPACTION_BATCH_RECORDS as i64
                    ],
                    |row| Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?)),
                )?;
                rows.collect::<std::result::Result<Vec<_>, _>>()?
            };
            if pending.is_empty() {
                break;
            }
            last_id = pending.last().map(|(id, _)| *id).unwrap_or(last_id);
            let transaction = self.conn.unchecked_transaction()?;
            for (id, payload) in pending {
                let original = payload.len() as u64;
                let Ok(compressed) = compress_payload(&payload) else {
                    report.skipped += 1;
                    continue;
                };
                // 压不小就别费这个事，也别冒风险。
                if compressed.len() as u64 >= original {
                    report.skipped += 1;
                    continue;
                }
                match decompress_payload(&compressed) {
                    Ok(round_tripped) if round_tripped == payload => {}
                    _ => {
                        report.skipped += 1;
                        continue;
                    }
                }
                transaction.execute(
                    "UPDATE raw_records SET payload = '', payload_zip = ?2 WHERE id = ?1",
                    params![id, compressed],
                )?;
                report.compacted += 1;
                report.bytes_before += original;
                report.bytes_after += compressed.len() as u64;
            }
            transaction.commit()?;
        }

        // 压缩腾出来的是**数据库内部**的空闲页：不 VACUUM 的话，磁盘上的文件
        // 一个字节都不会小，用户看不到任何变化。VACUUM 会重建整个文件，过程中
        // 需要差不多一倍的临时空间，所以只在真的压过东西时才做，而且失败不算
        // 整件事失败——数据已经压好了，文件没缩只是没拿到那份收益。
        // 退出中止时也跳过：VACUUM 在大库上是最久的一段，而此刻唯一的目标
        // 是让进程快点走完。
        if report.compacted > 0 && !background_write_abort_requested() {
            if let Err(error) = self.conn.execute_batch("VACUUM") {
                tracing::warn!("压缩后 VACUUM 失败，磁盘占用暂时不会下降: {error}");
            }
            let _ = self.bump_payload_stats_generation();
            let _ = self.persist_raw_payload_stats();
        }
        Ok(report)
    }

    /// 还有多少条**值得压**的历史报文。用来决定要不要在启动后台跑一次。
    ///
    /// 门槛必须和 [`compact_raw_payloads`] 用的是同一个，否则会出现这样的循环：
    /// 计数说「还有 10 条待压」→ 界面弹出「正在压缩」→ 压缩函数发现这 10 条
    /// 压完反而更大、全部跳过 → 下次启动同样的 10 条又被算成待压。
    /// 实测就踩了：库里十条 `{"items":[]}`（12 字节的空响应）让横幅每次启动
    /// 都要闪一下。
    pub fn pending_raw_payload_count(&self) -> Result<i64> {
        let uncompressed: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM raw_records
             WHERE (payload_zip IS NULL OR LENGTH(payload_zip) = 0)
               AND LENGTH(payload) > ?1",
            [MIN_COMPRESSIBLE_PAYLOAD_BYTES],
            |row| row.get(0),
        )?;
        Ok(uncompressed + self.pending_event_window_count()?)
    }

    pub fn cleanup_old_data(&self, days: i64) -> Result<()> {
        if !(1..=365).contains(&days) {
            return Err(ZeppBridgeError::ConfigError(
                "retention 天数必须在 1..=365".into(),
            ));
        }
        let cutoff_timestamp = (Utc::now() - Duration::days(days)).to_rfc3339();
        // daily_metrics.date 是本地日历日，切不能拿 UTC 的「今天」去比。
        let cutoff_date = (Local::now().date_naive() - Duration::days(days))
            .format("%Y-%m-%d")
            .to_string();
        self.conn.execute_batch("BEGIN IMMEDIATE;")?;
        let deleted = (|| -> Result<()> {
            self.conn.execute(
                "DELETE FROM metric_samples WHERE timestamp < ?1",
                [&cutoff_timestamp],
            )?;
            self.conn
                .execute("DELETE FROM daily_metrics WHERE date < ?1", [&cutoff_date])?;
            self.conn.execute(
                "DELETE FROM sleep_sessions WHERE start_time < ?1",
                [&cutoff_timestamp],
            )?;
            self.conn.execute(
                "DELETE FROM workout_hr_zones
                 WHERE workout_id IN (SELECT workout_id FROM workouts WHERE start_time < ?1)",
                [&cutoff_timestamp],
            )?;
            self.conn.execute(
                "DELETE FROM workouts WHERE start_time < ?1",
                [&cutoff_timestamp],
            )?;
            self.conn.execute(
                "DELETE FROM workout_samples WHERE timestamp < ?1",
                [&cutoff_timestamp],
            )?;
            self.conn.execute(
                "DELETE FROM route_points WHERE timestamp < ?1",
                [&cutoff_timestamp],
            )?;
            self.conn.execute(
                "DELETE FROM workout_pauses WHERE start_time < ?1",
                [&cutoff_timestamp],
            )?;
            self.conn.execute(
                "DELETE FROM workout_laps WHERE start_time < ?1",
                [&cutoff_timestamp],
            )?;
            self.conn.execute(
                "DELETE FROM workout_splits WHERE start_time < ?1",
                [&cutoff_timestamp],
            )?;
            // Raw responses are retained from their fetch time, not their query
            // window start. A 30-day request naturally starts near the retention
            // cutoff and must not be deleted seconds after it is fetched.
            self.conn.execute(
                "DELETE FROM raw_records
                 WHERE fetched_at < ?1
                   AND NOT EXISTS (SELECT 1 FROM metric_samples m WHERE m.raw_record_id = raw_records.id)
                   AND NOT EXISTS (SELECT 1 FROM daily_metrics d WHERE d.raw_record_id = raw_records.id)
                   AND NOT EXISTS (SELECT 1 FROM sleep_sessions s WHERE s.raw_record_id = raw_records.id)
                   AND NOT EXISTS (SELECT 1 FROM workouts w WHERE w.raw_record_id = raw_records.id)",
                [&cutoff_timestamp],
            )?;
            Ok(())
        })();
        match deleted {
            Ok(()) => {
                if self.conn.is_autocommit() {
                    return Err(ZeppBridgeError::DataUnavailable(
                        "清理被中断，没有任何改动写入。".into(),
                    ));
                }
                self.conn.execute_batch("COMMIT;")?;
            }
            Err(error) => {
                if !self.conn.is_autocommit() {
                    let _ = self.conn.execute_batch("ROLLBACK;");
                }
                return Err(error);
            }
        }
        if let Err(error) = self
            .conn
            .execute_batch("PRAGMA wal_checkpoint(TRUNCATE); PRAGMA incremental_vacuum;")
        {
            tracing::warn!("清理后 WAL checkpoint 失败，数据已删除: {error}");
        }
        let _ = self.bump_payload_stats_generation();
        let _ = self.persist_raw_payload_stats();
        Ok(())
    }

    pub(super) fn insert_raw_quarantine(
        &self,
        raw_record_id: i64,
        stream: &str,
        source_key: &str,
        error: &ZeppBridgeError,
    ) -> Result<()> {
        self.conn.execute(
            "INSERT INTO raw_quarantine(
                 raw_record_id, stream, source_key, error, revision, quarantined_at
             )
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT(raw_record_id) DO UPDATE SET
                stream = excluded.stream,
                source_key = excluded.source_key,
                error = excluded.error,
                revision = excluded.revision,
                quarantined_at = excluded.quarantined_at",
            params![
                raw_record_id,
                stream,
                source_key,
                error.to_string(),
                NORMALIZER_REVISION,
                Utc::now().to_rfc3339(),
            ],
        )?;
        Ok(())
    }

    pub(super) fn clear_raw_quarantine(&self, raw_record_id: i64) -> Result<()> {
        self.conn.execute(
            "DELETE FROM raw_quarantine WHERE raw_record_id = ?1",
            [raw_record_id],
        )?;
        Ok(())
    }

    /// 先提交 raw，再在单独事务里归一化。
    ///
    /// 归一化失败会回滚派生行并把 raw 写入隔离表，但云端已经拿到的报文必须留
    /// 在 `raw_records` 里——以前两者同事务，失败把 raw 一起 ROLLBACK 了。
    pub fn persist_fetched_record(&self, record: &RawRecord) -> Result<(i64, NormalizationCounts)> {
        let serialized = SerializedPayload::of(record)?;
        if let Some((raw_id, records_written)) = self.touch_unchanged_raw(record, &serialized)? {
            return Ok((
                raw_id,
                NormalizationCounts {
                    primary_records: records_written,
                    ..NormalizationCounts::default()
                },
            ));
        }
        let raw_id = self.insert_serialized_raw(record, &serialized, &Utc::now().to_rfc3339())?;
        let normalized = (|| {
            let transaction = ReplayBatch::begin(&self.conn)?;
            let counts = self.normalize_and_persist_raw(
                raw_id,
                &record.stream,
                &record.source_key,
                &record.payload,
            )?;
            self.clear_raw_quarantine(raw_id)?;
            transaction.commit()?;
            Ok(counts)
        })();
        match normalized {
            Ok(counts) => Ok((raw_id, counts)),
            Err(error) => {
                let _ =
                    self.insert_raw_quarantine(raw_id, &record.stream, &record.source_key, &error);
                Err(error)
            }
        }
    }

    #[cfg(test)]
    pub fn count_metric_samples(&self) -> Result<i64> {
        self.conn
            .query_row("SELECT COUNT(*) FROM metric_samples", [], |row| row.get(0))
            .map_err(Into::into)
    }

    #[cfg(test)]
    #[allow(dead_code)]
    pub fn count_raw_records(&self) -> Result<i64> {
        self.conn
            .query_row("SELECT COUNT(*) FROM raw_records", [], |row| row.get(0))
            .map_err(Into::into)
    }
}
