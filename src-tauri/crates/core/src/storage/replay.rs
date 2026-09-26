//! 按 NORMALIZER_REVISION 重放本地原始报文（从 storage/mod.rs 按领域拆出，逻辑不变）。

use super::*;

#[derive(Debug, Clone, Default)]
pub struct NormalizationCounts {
    pub primary_records: i64,
    pub band_heart_rate_records: i64,
    pub supplemental_daily_records: i64,
}

/// 这个库欠着的一次重放：从哪一版升到哪一版、要过几条报文。
///
/// 存在的理由是「先说清楚再做」。重放是分钟级的动作，而 `status` 这种命令
/// 必须秒回，所以计算计划（只读、两条 SELECT）和执行计划必须能分开调用：
/// 短命令拿它去说一句「你的历史还停在旧解析器上」，`reprocess` 拿它去干活。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ReplayPlan {
    /// 库里派生数据是哪一版解析器产出的。`None` = 从没重放过。
    pub stored_revision: Option<String>,
    /// 这个程序会把它升到哪一版。
    pub target_revision: String,
    /// 要重放的流。空 = 全部流。
    pub streams: Vec<String>,
    /// 这次重放要过一遍的原始报文条数。0 = 库是空的，重放是瞬间的事。
    pub raw_records: i64,
}

impl Database {
    /// 库里记着的解析器修订号。`None` = 这个库从来没有重放过。
    ///
    /// 和 `NORMALIZER_REVISION` 是两件事：后者说**这个程序**按哪一版规则解析，
    /// 前者说**库里的派生数据**是哪一版规则产出的。两者不相等，就意味着历史
    /// 记录还挂在旧规则上——只有重放能把它们对齐。
    pub fn stored_normalizer_revision(&self) -> Result<Option<String>> {
        self.conn
            .query_row(
                "SELECT value FROM app_meta WHERE key = 'normalizer_revision'",
                [],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .map_err(Into::into)
    }

    /// 这个库现在欠着的重放，`None` = 不欠。
    ///
    /// 只读：两条 SELECT，只读连接也能调。`status`、MCP 的健康报告都要能说出
    /// 「你的历史还停在旧解析器上」，而它们一个字节都不该写库，更不该在一条
    /// 本该秒回的命令里默默跑上几分钟。
    pub fn pending_replay_plan(&self) -> Result<Option<ReplayPlan>> {
        let stored = self.stored_normalizer_revision()?;
        if stored.as_deref() == Some(NORMALIZER_REVISION) {
            let pending: i64 = self.conn.query_row(
                "SELECT COUNT(*) FROM raw_records r
                 WHERE NOT EXISTS (SELECT 1 FROM raw_normalization n
                                   WHERE n.raw_record_id = r.id AND n.revision = ?1)
                   AND NOT EXISTS (SELECT 1 FROM raw_quarantine q
                                   WHERE q.raw_record_id = r.id AND q.revision = ?1)",
                [NORMALIZER_REVISION],
                |row| row.get(0),
            )?;
            if pending == 0 {
                return Ok(None);
            }
        }
        // Revisit all streams: date parsing is shared, and older upgrades
        // still need readiness repair and per-raw attempt history.
        let streams: Vec<String> = Vec::new();
        let raw_records = self.count_raw_records_for_streams(&streams)?;
        Ok(Some(ReplayPlan {
            stored_revision: stored,
            target_revision: NORMALIZER_REVISION.to_string(),
            streams,
            raw_records,
        }))
    }

    /// 库里一共存着多少条原始报文。整库重放前用它把「要过多少条」说清楚。
    pub fn raw_record_count(&self) -> Result<i64> {
        self.count_raw_records_for_streams(&[])
    }

    /// 空的 `streams` 表示全部流，和 `ReplayPlan::streams` 同一个约定。
    pub(super) fn count_raw_records_for_streams(&self, streams: &[String]) -> Result<i64> {
        if streams.is_empty() {
            return self
                .conn
                .query_row("SELECT COUNT(*) FROM raw_records", [], |row| row.get(0))
                .map_err(Into::into);
        }
        let placeholders = (1..=streams.len())
            .map(|index| format!("?{index}"))
            .collect::<Vec<_>>()
            .join(", ");
        self.conn
            .query_row(
                &format!("SELECT COUNT(*) FROM raw_records WHERE stream IN ({placeholders})"),
                rusqlite::params_from_iter(streams.iter()),
                |row| row.get(0),
            )
            .map_err(Into::into)
    }

    pub fn reprocess_raw_records_if_needed(&self) -> Result<Option<BTreeMap<String, i64>>> {
        let Some(plan) = self.pending_replay_plan()? else {
            return Ok(None);
        };
        let counts = if plan.streams.is_empty() {
            self.reprocess_raw_records_for_stream(None)?
        } else {
            let streams: Vec<&str> = plan.streams.iter().map(String::as_str).collect();
            self.reprocess_raw_records_for_stream(Some(&streams))?
        };
        // 本地重放有自己的时间线。它绝不改写云端同步时间：用户问「数据新
        // 不新」和「你什么时候连过云」是两个问题。
        self.record_local_replay(false)?;
        Ok(Some(counts))
    }

    pub fn reprocess_raw_records(&self) -> Result<BTreeMap<String, i64>> {
        self.reprocess_raw_records_for_stream(None)
    }

    /// 重放 `raw_records`。`stream_filter` 为 `None` 时重放全部。
    ///
    /// 过滤条件是一组流名而不是一个：一次修订往往同时动到不止一条流的归一化
    /// 规则（v18 就同时改了 workouts 和 sleep），只能传一个的话，第二条流要么
    /// 被漏掉，要么只能退回全量重放。
    pub(super) fn reprocess_raw_records_for_stream(
        &self,
        stream_filter: Option<&[&str]>,
    ) -> Result<BTreeMap<String, i64>> {
        let _replay_guard = ReplayGuard::enter();
        // 先只取 id 和归一化要用的那两个短字段，报文留到循环里一条一条读。
        // 从前是连 payload 一起收进 Vec 的——那等于重放开始之前先把库里全部
        // 报文读进内存，而这段代码恰恰要在 NAS 和有内存上限的容器里跑 842 MB
        // 的库。
        let plan: Vec<(i64, String, String)> = if let Some(streams) = stream_filter {
            // 参数个数跟着流的条数走。手拼 IN 列表是这类代码最容易留下 SQL
            // 注入口子的地方，即使这里的值全是编译期常量。
            // ?1 是当前修订号：已经按这一版隔离过的 raw 不再进计划，否则每次
            // 启动都会把它们再扫一遍，而盖不了章就会无限重放。
            let placeholders = (2..=streams.len() + 1)
                .map(|index| format!("?{index}"))
                .collect::<Vec<_>>()
                .join(", ");
            let mut stmt = self.conn.prepare(&format!(
                "SELECT r.id, r.stream, r.source_key
                 FROM raw_records r
                 WHERE NOT EXISTS (
                     SELECT 1 FROM raw_quarantine q
                     WHERE q.raw_record_id = r.id AND q.revision = ?1
                 )
                   AND r.stream IN ({placeholders})
                 ORDER BY r.id"
            ))?;
            let mut bind: Vec<&str> = Vec::with_capacity(streams.len() + 1);
            bind.push(NORMALIZER_REVISION);
            bind.extend(streams.iter().copied());
            let rows = stmt.query_map(rusqlite::params_from_iter(bind.iter()), |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                ))
            })?;
            rows.collect::<std::result::Result<Vec<_>, _>>()?
        } else {
            let mut stmt = self.conn.prepare(
                "SELECT r.id, r.stream, r.source_key
                 FROM raw_records r
                 WHERE NOT EXISTS (
                     SELECT 1 FROM raw_quarantine q
                     WHERE q.raw_record_id = r.id AND q.revision = ?1
                 )
                 ORDER BY r.id",
            )?;
            let rows = stmt.query_map(params![NORMALIZER_REVISION], |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                ))
            })?;
            rows.collect::<std::result::Result<Vec<_>, _>>()?
        };

        let mut counts = BTreeMap::<String, i64>::new();
        let mut band_heart_rate = 0i64;
        let mut failures = 0i64;
        // 一批一个事务。批的边界落在报文之间，所以「先删掉这条报文的派生行、
        // 再照新规则插一遍」始终在同一个事务里——中途失败不会留下一条被清空
        // 却没被重建的记录。单条 decode / 解析 / 归一化失败写入隔离表后继续，
        // 不能用 `?` 把整轮打掉；隔离 INSERT 跟这批派生行一起提交。
        for batch in plan.chunks(REPLAY_BATCH_RECORDS) {
            // 退出请求举着旗就收手：这一批之前的事务都已提交，修订号不
            // 推进，下一轮启动从断点继续。直接返回 Ok 而不是 Err——这不是
            // 失败，不该被当成「重放失败」记一笔。
            if background_write_abort_requested() {
                return Ok(counts);
            }
            let transaction = ReplayBatch::begin(&self.conn)?;
            for (id, stream, source_key) in batch {
                // 报文可能在这次重放开始之后被清理掉，跳过即可，不是错误。
                let Some((stored_payload, payload_zip)) = self.raw_payload(*id)? else {
                    continue;
                };
                let encoded_payload = match decode_raw_payload(stored_payload, payload_zip) {
                    Ok(value) => value,
                    Err(error) => {
                        failures += 1;
                        self.insert_raw_quarantine(*id, stream, source_key, &error)?;
                        continue;
                    }
                };
                let payload: serde_json::Value = match serde_json::from_str(&encoded_payload) {
                    Ok(value) => value,
                    Err(error) => {
                        failures += 1;
                        self.insert_raw_quarantine(
                            *id,
                            stream,
                            source_key,
                            &ZeppBridgeError::ParseError(error.to_string()),
                        )?;
                        continue;
                    }
                };
                // `normalize_and_persist_raw` 先清空这条报文的旧派生行、再按新
                // 规则一条条插回去——中间可能有好几条 INSERT。它本身不是一条
                // 语句，插到一半失败时，之前已经执行的清空/插入不能留在这批
                // 事务里跟着一起提交，否则就是「删了没建全」。单开一个内层
                // savepoint 把这一条报文的写入独立出来，失败就只回滚这一条，
                // 这一批里其它已经处理成功的报文不受影响。
                self.conn.execute("SAVEPOINT reprocess_record", [])?;
                match self.normalize_and_persist_raw(*id, stream, source_key, &payload) {
                    Ok(result) => {
                        self.conn.execute("RELEASE reprocess_record", [])?;
                        self.clear_raw_quarantine(*id)?;
                        *counts.entry(stream.clone()).or_default() += result.primary_records;
                        band_heart_rate += result.band_heart_rate_records;
                    }
                    Err(error) => {
                        self.conn.execute("ROLLBACK TO reprocess_record", [])?;
                        self.conn.execute("RELEASE reprocess_record", [])?;
                        failures += 1;
                        self.insert_raw_quarantine(*id, stream, source_key, &error)?;
                    }
                }
            }
            transaction.commit()?;
        }
        if band_heart_rate > 0 {
            counts.insert("heart_rate".to_string(), band_heart_rate);
        }

        // 有自己那张表的流，报库里现在的总数（比这一趟的增量更有意义）。
        // 没有自己那张表的流保留这一趟的实测值：`wellness` 的产物落在
        // daily_metrics 和 metric_samples 里，问「wellness 表有多少行」只会
        // 得到 0，而把 0 报给用户，等于说这条流一条都没解出来。
        for stream in counts.keys().cloned().collect::<Vec<_>>() {
            if let Some(total) = self.normalized_stream_count(&stream)? {
                counts.insert(stream.clone(), total);
            }
        }

        self.set_app_meta(REPLAY_LAST_FAILURES_KEY, &failures.to_string())?;
        // 有新失败就不推进修订号，下次启动还会再走一遍（已隔离的会被跳过）。
        // 空库 0 条 0 失败仍盖章，避免第一次同步之后平白重放。
        if failures == 0 {
            self.conn.execute(
                "INSERT INTO app_meta(key, value, updated_at)
                 VALUES('normalizer_revision', ?1, ?2)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
                params![NORMALIZER_REVISION, Utc::now().to_rfc3339()],
            )?;
        }
        self.set_app_meta(LAST_LOCAL_REPROCESS_AT_KEY, &Utc::now().to_rfc3339())?;
        Ok(counts)
    }

    /// 单条原始报文的存储表示（可能是压缩过的）。
    pub(super) fn raw_payload(
        &self,
        raw_record_id: i64,
    ) -> Result<Option<(String, Option<Vec<u8>>)>> {
        self.conn
            .query_row(
                "SELECT payload, payload_zip FROM raw_records WHERE id = ?1",
                [raw_record_id],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, Option<Vec<u8>>>(1)?)),
            )
            .optional()
            .map_err(Into::into)
    }

    /// `None` = 这条流没有属于自己的规范表，数不出一个只属于它的总数。
    pub(super) fn normalized_stream_count(&self, stream: &str) -> Result<Option<i64>> {
        let (query, parameter): (&str, Option<&str>) = match stream {
            "heart_rate" => (
                "SELECT COUNT(*) FROM metric_samples WHERE metric = ?1",
                Some("heart_rate"),
            ),
            "hrv" => (
                "SELECT COUNT(*) FROM metric_samples WHERE metric = ?1",
                Some("hrv"),
            ),
            // 按流数，不是整表数：wellness 也往 daily_metrics 里写日行，
            // 而 v20 这次升级两条流都要重放。整表 COUNT(*) 会把 wellness 的
            // 行算进 daily_summary 的账上，用户看到的两个数字加起来大于真实
            // 写入量。
            "daily_summary" => (
                "SELECT COUNT(*) FROM daily_metrics d
                   JOIN raw_records r ON r.id = d.raw_record_id
                  WHERE r.stream = 'daily_summary'",
                None,
            ),
            "sleep" => ("SELECT COUNT(*) FROM sleep_sessions", None),
            "workouts" => ("SELECT COUNT(*) FROM workouts", None),
            "workout_detail" => ("SELECT COUNT(*) FROM workout_samples", None),
            // wellness 没有自己的表，它写进 daily_metrics 和 metric_samples。
            // 不数它的话，一次只重放 wellness 的升级会向用户报「0 条」，而
            // 那次升级的全部意义恰恰就是这条流。
            "wellness" => (
                "SELECT (SELECT COUNT(*) FROM metric_samples s
                           JOIN raw_records r ON r.id = s.raw_record_id
                          WHERE r.stream = 'wellness')
                      + (SELECT COUNT(*) FROM daily_metrics d
                           JOIN raw_records r ON r.id = d.raw_record_id
                          WHERE r.stream = 'wellness')",
                None,
            ),
            // 体重同样没有自己的表，它写进 metric_samples。不数它的话，一次
            // 只重放 weight 的升级会向用户报「0 条」，而那次升级的全部意义
            // 恰恰就是这条流。
            "weight" => (
                "SELECT COUNT(*) FROM metric_samples s
                   JOIN raw_records r ON r.id = s.raw_record_id
                  WHERE r.stream = 'weight'",
                None,
            ),
            _ => return Ok(None),
        };
        let total = if let Some(parameter) = parameter {
            self.conn.query_row(query, [parameter], |row| row.get(0))?
        } else {
            self.conn.query_row(query, [], |row| row.get(0))?
        };
        Ok(Some(total))
    }
}
