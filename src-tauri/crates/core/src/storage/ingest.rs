//! 原始报文入库与归一化落库（从 storage/mod.rs 按领域拆出，逻辑不变）。

use super::*;

impl Database {
    pub(super) fn ensure_table_columns(&self, table: &str, columns: &[(&str, &str)]) -> Result<()> {
        let mut stmt = self.conn.prepare(&format!("PRAGMA table_info({table})"))?;
        let existing = stmt
            .query_map([], |row| row.get::<_, String>(1))?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        for (name, definition) in columns {
            if !existing.iter().any(|value| value == name) {
                self.conn.execute(
                    &format!("ALTER TABLE {table} ADD COLUMN {name} {definition}"),
                    [],
                )?;
            }
        }
        Ok(())
    }

    pub fn insert_raw_record(&self, record: &RawRecord) -> Result<i64> {
        let payload = serde_json::to_string(&record.payload)
            .map_err(|error| ZeppBridgeError::ParseError(error.to_string()))?;
        let mut hasher = Sha256::new();
        hasher.update(payload.as_bytes());
        // 校验和永远针对**未压缩**的 JSON。压缩是存储细节，不该改变
        // 「这份报文是什么」的身份。
        let payload_hash = hex::encode(hasher.finalize());
        let fetched_at = Utc::now().to_rfc3339();
        let payload_zip = compress_payload(&payload)?;
        self.conn.execute(
            "INSERT INTO raw_records
                (stream, source_key, source_scope, device_id, start_utc, end_utc,
                 payload, payload_zip, payload_hash, fetched_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, '', ?7, ?8, ?9)
             ON CONFLICT(stream, source_key) DO UPDATE SET
                source_scope = excluded.source_scope,
                device_id = excluded.device_id,
                start_utc = excluded.start_utc,
                end_utc = excluded.end_utc,
                payload = '',
                payload_zip = excluded.payload_zip,
                payload_hash = excluded.payload_hash,
                fetched_at = excluded.fetched_at",
            params![
                record.stream,
                record.source_key,
                record.source_scope.as_str(),
                record.device_id,
                record.start_utc.to_rfc3339(),
                record.end_utc.map(|value| value.to_rfc3339()),
                payload_zip,
                payload_hash,
                fetched_at,
            ],
        )?;
        self.conn
            .query_row(
                "SELECT id FROM raw_records WHERE stream = ?1 AND source_key = ?2",
                params![record.stream, record.source_key],
                |row| row.get(0),
            )
            .map_err(Into::into)
    }

    pub fn normalize_and_persist_raw(
        &self,
        raw_record_id: i64,
        stream: &str,
        source_key: &str,
        payload: &serde_json::Value,
    ) -> Result<NormalizationCounts> {
        let mut counts = NormalizationCounts::default();
        match stream {
            "heart_rate" => {
                let rows = Normalizer::normalize_heart_rate(payload)?;
                counts.primary_records = rows.len() as i64;
                self.clear_normalized_for_raw(raw_record_id, stream)?;
                for row in rows {
                    self.insert_metric_sample_with_raw(&row, Some(raw_record_id))?;
                }
            }
            "hrv" => {
                let rows = Normalizer::normalize_hrv(payload)?;
                counts.primary_records = rows.len() as i64;
                self.clear_normalized_for_raw(raw_record_id, stream)?;
                for row in rows {
                    self.insert_metric_sample_with_raw(&row, Some(raw_record_id))?;
                }
            }
            // Optional wellness streams. Their payload shapes are not verified
            // field by field yet, so normalization is best-effort and must
            // never fail. Raw is already committed before this runs; a later
            // persist error no longer deletes the response.
            "wellness" => {
                let batch = Normalizer::normalize_wellness(source_key, payload);
                counts.primary_records =
                    (batch.daily_metrics.len() + batch.metric_samples.len()) as i64;
                self.clear_normalized_for_raw(raw_record_id, "daily_summary")?;
                self.clear_normalized_for_raw(raw_record_id, "heart_rate")?;
                for row in batch.daily_metrics {
                    self.insert_daily_metric_with_raw(&row, Some(raw_record_id))?;
                }
                for row in batch.metric_samples {
                    self.insert_metric_sample_with_raw(&row, Some(raw_record_id))?;
                }
            }
            // 体重 / 体成分。和 wellness 一样是尽力而为：`summary` 的字段随
            // 记录来源变，认不出来的只写进 diagnostics，不让整条流失败。
            // 原始报文已先提交，归一化失败也不会把它回滚掉。
            "weight" => {
                let batch = Normalizer::normalize_weight(payload);
                counts.primary_records = batch.metric_samples.len() as i64;
                self.clear_normalized_for_raw(raw_record_id, stream)?;
                for row in batch.metric_samples {
                    self.insert_metric_sample_with_raw(&row, Some(raw_record_id))?;
                }
            }
            "daily_summary" => {
                let rows = Normalizer::normalize_daily_summary(payload)?;
                counts.primary_records = rows.len() as i64;
                self.clear_normalized_for_raw(raw_record_id, stream)?;
                for row in rows {
                    self.insert_daily_metric_with_raw(&row, Some(raw_record_id))?;
                }
            }
            "sleep" => {
                let band = Normalizer::normalize_band_data(payload)?;
                if band.sleep_sessions.is_empty()
                    && band.heart_rate_samples.is_empty()
                    && band.daily_metrics.is_empty()
                {
                    let detail = if band.diagnostics.is_empty() {
                        "band_data 没有可识别记录".to_string()
                    } else {
                        band.diagnostics.join("; ")
                    };
                    return Err(ZeppBridgeError::DataUnavailable(detail));
                }
                counts.primary_records = band.sleep_sessions.len() as i64;
                counts.band_heart_rate_records = band.heart_rate_samples.len() as i64;
                counts.supplemental_daily_records = band.daily_metrics.len() as i64;
                self.clear_normalized_for_raw(raw_record_id, stream)?;
                for row in band.sleep_sessions {
                    self.insert_sleep_session_with_raw(&row, Some(raw_record_id))?;
                }
                for row in band.heart_rate_samples {
                    self.insert_metric_sample_with_raw(&row, Some(raw_record_id))?;
                }
                for row in band.daily_metrics {
                    self.insert_daily_metric_with_raw(&row, Some(raw_record_id))?;
                }
                self.harvest_device_identities(payload)?;
            }
            "workouts" => {
                let sport = source_key
                    .strip_prefix("sport_history:")
                    .and_then(|value| value.split(':').next());
                let rows = Normalizer::normalize_workouts_with_sport(payload, sport)?;
                counts.primary_records = rows.len() as i64;
                // 先算出新行，再只删「这条报文以前产出、现在不再产出」的那些。
                // 别的流是「先清空，再插」；workouts 不能那么做，见
                // `clear_workouts_for_raw_except`。
                let keep: Vec<String> = rows.iter().map(|row| row.workout_id.clone()).collect();
                self.clear_workouts_for_raw_except(raw_record_id, &keep)?;
                for row in rows {
                    self.insert_workout_with_raw(&row, Some(raw_record_id))?;
                }
                self.harvest_device_identities(payload)?;
            }
            "workout_detail" => {
                let workout_id = workout_id_from_detail_key(source_key).ok_or_else(|| {
                    ZeppBridgeError::ConfigError("workout_detail source_key 无效".into())
                })?;
                if !self.workout_exists(&workout_id)? {
                    return Err(ZeppBridgeError::DataUnavailable(
                        "detail 对应的训练摘要还不存在".into(),
                    ));
                }
                let summary_end = self.workout_end_time(&workout_id)?;
                let summary_distance = self.workout_distance_meters(&workout_id)?;
                let decoded = decode_workout_detail(payload, summary_end, summary_distance)?;
                self.replace_workout_series(&workout_id, &decoded)?;
                counts.primary_records =
                    (decoded.samples.len() + decoded.route.len() + decoded.pauses.len()) as i64;
            }
            other => return Err(ZeppBridgeError::ConfigError(format!("未知同步流: {other}"))),
        }
        // Keep the processing result even when another raw payload later
        // replaces all canonical rows through their natural-key upserts.
        self.conn.execute(
            "INSERT INTO raw_normalization(raw_record_id, revision, records_written)
             VALUES (?1, ?2, ?3)
             ON CONFLICT(raw_record_id) DO UPDATE SET
                revision = excluded.revision, records_written = excluded.records_written",
            params![
                raw_record_id,
                NORMALIZER_REVISION,
                counts.primary_records
                    + counts.band_heart_rate_records
                    + counts.supplemental_daily_records
            ],
        )?;
        Ok(counts)
    }

    pub(super) fn clear_normalized_for_raw(&self, raw_record_id: i64, stream: &str) -> Result<()> {
        match stream {
            "heart_rate" | "hrv" | "weight" => {
                self.conn.execute(
                    "DELETE FROM metric_samples WHERE raw_record_id = ?1",
                    [raw_record_id],
                )?;
            }
            "daily_summary" => {
                self.conn.execute(
                    "DELETE FROM daily_metrics WHERE raw_record_id = ?1",
                    [raw_record_id],
                )?;
            }
            "sleep" => {
                self.conn.execute(
                    "DELETE FROM metric_samples WHERE raw_record_id = ?1",
                    [raw_record_id],
                )?;
                self.conn.execute(
                    "DELETE FROM daily_metrics WHERE raw_record_id = ?1",
                    [raw_record_id],
                )?;
                self.conn.execute(
                    "DELETE FROM sleep_sessions WHERE raw_record_id = ?1",
                    [raw_record_id],
                )?;
            }
            // workouts 的清理不在这里：它必须先知道哪些行马上会被重新插回来。
            // 见 `clear_workouts_for_raw_except`。
            "workouts" => {}
            "workout_detail" => {}
            _ => {}
        }
        Ok(())
    }

    /// 删掉这条报文以前产出、而这一次归一化不再产出的运动汇总行。
    ///
    /// 为什么不能像别的流那样「先全删再插」：`workout_samples`、`route_points`、
    /// `workout_pauses`、`workout_splits` 四张表都以 `ON DELETE CASCADE` 挂在
    /// `workouts` 上。删掉一条马上就要插回来的汇总行，级联会把这条运动的逐秒
    /// 序列和 GPS 轨迹一起带走——而它们来自 `workout_detail`，那条流在一次
    /// 局部重放里根本不会被重放（v17→v18 就只重放 workouts 和 sleep）。结果是
    /// 升级报告成功，用户的历史轨迹全没了。
    ///
    /// 汇总行本身不需要先删：`insert_workout_with_raw` 是 upsert，而且它读旧行
    /// 是有意的——`merge_workout_type` 靠那一行才能在纠正旧的归一化结果的同时
    /// 保住用户自己改过的类型。先删一遍恰恰把这个机制废掉了。
    pub(super) fn clear_workouts_for_raw_except(
        &self,
        raw_record_id: i64,
        keep: &[String],
    ) -> Result<()> {
        if keep.is_empty() {
            self.conn.execute(
                "DELETE FROM workouts WHERE raw_record_id = ?1",
                [raw_record_id],
            )?;
            return Ok(());
        }
        // 参数个数跟着这次产出的运动条数走，不手拼 IN 列表——这些值来自
        // 云端报文，不是编译期常量。
        let placeholders = (2..=keep.len() + 1)
            .map(|index| format!("?{index}"))
            .collect::<Vec<_>>()
            .join(", ");
        let mut parameters: Vec<&dyn rusqlite::ToSql> = Vec::with_capacity(keep.len() + 1);
        parameters.push(&raw_record_id);
        for workout_id in keep {
            parameters.push(workout_id);
        }
        self.conn.execute(
            &format!(
                "DELETE FROM workouts
                 WHERE raw_record_id = ?1 AND workout_id NOT IN ({placeholders})"
            ),
            parameters.as_slice(),
        )?;
        Ok(())
    }
}
