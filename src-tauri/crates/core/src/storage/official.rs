//! 官方开放平台报文的落库。
//!
//! 入口在 `ingest.rs` 的 `normalize_and_persist_raw`：`source_key` 以 `official:` 开头的
//! 报文走这里。写法和旧通道一样——先清掉这条报文以前产出的行，再按自然键 upsert——
//! 只是写完以后把这些行（和报文本身）的 `provider` 标成 `official`。
//!
//! 同一晚两边都有时两份都存：官方睡眠的 `sleep_id` 是 `official:<开始秒>`，和旧通道的
//! `band:...` 不撞键；界面读 `sleep_sessions_shown` 视图，同一晚只显示官方那份（v34）。
//! 心率、每日步数、运动、PAI、体重只在没有旧通道时才拉（`sync/official.rs`），所以不会
//! 和旧通道同键互相覆盖。

use super::*;

/// 失败计数表里官方明细的来源名。旧通道用运动自己的 `zepp_source`，不会撞上。
const OFFICIAL_DETAIL_SOURCE: &str = "official";
use crate::official::fetch::{OfficialKind, PROVIDER};

impl Database {
    pub(super) fn normalize_official_raw(
        &self,
        raw_record_id: i64,
        source_key: &str,
        payload: &serde_json::Value,
    ) -> Result<NormalizationCounts> {
        let kind = OfficialKind::from_source_key(source_key).ok_or_else(|| {
            ZeppBridgeError::ConfigError(format!("认不出的官方报文: {source_key}"))
        })?;
        let mut counts = NormalizationCounts::default();
        match kind {
            OfficialKind::Sleep => {
                let nights = Normalizer::normalize_official_sleep(payload);
                self.conn.execute(
                    "DELETE FROM sleep_sessions WHERE raw_record_id = ?1",
                    [raw_record_id],
                )?;
                for night in &nights {
                    self.insert_sleep_session_with_raw(&night.session, Some(raw_record_id))?;
                    self.conn.execute(
                        "UPDATE sleep_sessions SET rem_seconds = ?2, nap_total_seconds = ?3 WHERE sleep_id = ?1",
                        params![night.session.sleep_id, night.rem_seconds, night.nap_total_seconds],
                    )?;
                }
                counts.primary_records = nights.len() as i64;
            }
            OfficialKind::HeartRate | OfficialKind::ActivityHourly => {
                let rows = if kind == OfficialKind::HeartRate {
                    Normalizer::normalize_official_heart_rate(payload)
                } else {
                    Normalizer::normalize_official_activity_hourly(payload)
                };
                self.conn.execute(
                    "DELETE FROM metric_samples WHERE raw_record_id = ?1",
                    [raw_record_id],
                )?;
                for row in &rows {
                    self.insert_metric_sample_with_raw(row, Some(raw_record_id))?;
                }
                counts.primary_records = rows.len() as i64;
            }
            OfficialKind::ActivityDaily => {
                let rows = Normalizer::normalize_official_activity_daily(payload);
                self.conn.execute(
                    "DELETE FROM daily_metrics WHERE raw_record_id = ?1",
                    [raw_record_id],
                )?;
                for row in &rows {
                    self.insert_daily_metric_with_raw(row, Some(raw_record_id))?;
                }
                counts.primary_records = rows.len() as i64;
            }
            OfficialKind::Pai => {
                let batch = Normalizer::normalize_wellness("wellness:pai", payload);
                self.conn.execute(
                    "DELETE FROM daily_metrics WHERE raw_record_id = ?1",
                    [raw_record_id],
                )?;
                for row in &batch.daily_metrics {
                    self.insert_daily_metric_with_raw(row, Some(raw_record_id))?;
                }
                counts.primary_records = batch.daily_metrics.len() as i64;
            }
            OfficialKind::Body => {
                let batch =
                    Normalizer::normalize_weight(&Normalizer::official_body_as_legacy(payload));
                self.conn.execute(
                    "DELETE FROM metric_samples WHERE raw_record_id = ?1",
                    [raw_record_id],
                )?;
                for row in &batch.metric_samples {
                    self.insert_metric_sample_with_raw(row, Some(raw_record_id))?;
                }
                counts.primary_records = batch.metric_samples.len() as i64;
            }
            OfficialKind::Sports => {
                let legacy = Normalizer::official_sports_as_legacy(payload);
                let rows = Normalizer::normalize_workouts_with_sport(&legacy, None)?;
                let keep: Vec<String> = rows.iter().map(|row| row.workout_id.clone()).collect();
                // 和旧通道一样只删「不再产出」的：先删再插会级联带走逐秒序列和轨迹。
                self.clear_workouts_for_raw_except(raw_record_id, &keep)?;
                for row in &rows {
                    self.insert_workout_with_raw(row, Some(raw_record_id))?;
                }
                counts.primary_records = rows.len() as i64;
            }
            OfficialKind::SportDetail => {
                let workout_id = source_key
                    .rsplit(':')
                    .next()
                    .filter(|id| !id.is_empty())
                    .ok_or_else(|| {
                        ZeppBridgeError::ConfigError("官方运动明细的 source_key 无效".into())
                    })?
                    .to_string();
                if !self.workout_exists(&workout_id)? {
                    return Err(ZeppBridgeError::DataUnavailable(
                        "明细对应的运动汇总还不存在".into(),
                    ));
                }
                // 高级通道已经有这条运动的明细：以它为准，官方这份不再整份替换逐秒序列（#143）。
                // 报文照样算处理过（下面记 raw_normalization），不会被反复重放。
                if self.has_legacy_workout_detail(&workout_id)? {
                    counts.primary_records = 0;
                } else {
                    let summary_end = self.workout_end_time(&workout_id)?;
                    let summary_distance = self.workout_distance_meters(&workout_id)?;
                    let mut decoded = decode_workout_detail(
                        &Normalizer::official_detail_as_legacy(payload),
                        summary_end,
                        summary_distance,
                    )?;
                    drop_unreconciled_distance(&mut decoded, summary_distance);
                    // 用户导入过修正 .fit 的运动，云端明细只留在 raw_records 里（#140）。
                    self.apply_cloud_series(&workout_id, &decoded)?;
                    counts.primary_records =
                        (decoded.samples.len() + decoded.route.len() + decoded.pauses.len()) as i64;
                }
            }
        }
        self.mark_official_rows(raw_record_id)?;
        self.conn.execute(
            "INSERT INTO raw_normalization(raw_record_id, revision, records_written)
             VALUES (?1, ?2, ?3)
             ON CONFLICT(raw_record_id) DO UPDATE SET
                revision = excluded.revision, records_written = excluded.records_written",
            params![raw_record_id, NORMALIZER_REVISION, counts.primary_records],
        )?;
        Ok(counts)
    }

    /// 报文和它产出的行都标上来源。归一化写的是通用列，来源列在这里补。
    fn mark_official_rows(&self, raw_record_id: i64) -> Result<()> {
        self.conn.execute(
            "UPDATE raw_records SET provider = ?2, channel = 'official_pull',
                received_at = COALESCE(received_at, fetched_at), parsed_at = ?3
             WHERE id = ?1",
            params![raw_record_id, PROVIDER, Utc::now().to_rfc3339()],
        )?;
        for table in [
            "sleep_sessions",
            "metric_samples",
            "daily_metrics",
            "workouts",
        ] {
            self.conn.execute(
                &format!("UPDATE {table} SET provider = ?2 WHERE raw_record_id = ?1"),
                params![raw_record_id, PROVIDER],
            )?;
        }
        Ok(())
    }

    /// 这些官方运动里还没有逐秒序列的那些（下一步去拉明细）。只看官方来源的行：
    /// 旧通道的运动由旧通道自己的明细队列补。
    /// 还没有逐秒明细的官方运动。连续失败 [`MAX_WORKOUT_DETAIL_ATTEMPTS`] 次
    /// （或官方明确说没有）的先放下，[`WORKOUT_DETAIL_ATTEMPT_DECAY`] 之后再试
    /// 一次——和旧通道同一张失败计数表、同一套衰减（来源记为 `official`）。
    pub fn official_workouts_missing_detail(&self, limit: usize) -> Result<Vec<(String, String)>> {
        let decay_before = (Utc::now() - WORKOUT_DETAIL_ATTEMPT_DECAY).to_rfc3339();
        let mut stmt = self.conn.prepare(
            "SELECT w.workout_id, w.start_time FROM workouts w
             LEFT JOIN workout_detail_fetch_attempts a
               ON a.workout_id = w.workout_id AND a.source = ?2
             WHERE w.provider = 'official'
               AND NOT EXISTS (SELECT 1 FROM workout_samples s WHERE s.workout_id = w.workout_id)
               AND NOT EXISTS (SELECT 1 FROM route_points r WHERE r.workout_id = w.workout_id)
               AND NOT EXISTS (
                   SELECT 1 FROM raw_records r
                   WHERE r.stream = 'workout_detail' AND r.source_key = 'official:sport_detail:' || w.workout_id)
               AND (a.attempts IS NULL OR a.attempts < ?3 OR a.updated_at < ?4)
             ORDER BY COALESCE(a.attempts, 0) ASC, w.start_time DESC LIMIT ?1",
        )?;
        let rows = stmt
            .query_map(
                rusqlite::params![
                    limit as i64,
                    OFFICIAL_DETAIL_SOURCE,
                    MAX_WORKOUT_DETAIL_ATTEMPTS,
                    decay_before
                ],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    /// 记一次官方明细拉取的结果；返回这条运动现在是不是被放下了。
    /// `gone`：官方明确说没有（不可用），不用再失败两次，直接放下。
    pub fn record_official_detail_result(
        &self,
        workout_id: &str,
        ok: bool,
        gone: bool,
    ) -> Result<bool> {
        self.record_workout_detail_fetch_result(workout_id, OFFICIAL_DETAIL_SOURCE, ok)?;
        if ok {
            return Ok(false);
        }
        if gone {
            self.conn.execute(
                "UPDATE workout_detail_fetch_attempts SET attempts = MAX(attempts, ?3)
                 WHERE workout_id = ?1 AND source = ?2",
                rusqlite::params![
                    workout_id,
                    OFFICIAL_DETAIL_SOURCE,
                    MAX_WORKOUT_DETAIL_ATTEMPTS
                ],
            )?;
        }
        let attempts: i64 = self.conn.query_row(
            "SELECT attempts FROM workout_detail_fetch_attempts WHERE workout_id = ?1 AND source = ?2",
            [workout_id, OFFICIAL_DETAIL_SOURCE],
            |row| row.get(0),
        )?;
        Ok(attempts >= MAX_WORKOUT_DETAIL_ATTEMPTS)
    }
}

/// 官方明细的逐点距离（`distanceInCentimeter`，接成 `currentDistance` 解码）要和汇总距离对得上才留。
///
/// 这串的单位只在合成样例里见过（形状是「秒差, 累计厘米」，和高级通道的 `currentDistance` 一样），
/// 没拿真实报文核过。对账：逐秒距离的末值和汇总距离相差超过 3%、或者没有汇总距离可对，
/// 就把逐秒距离整列清掉——宁缺不编，和 laps / kilo_pace 的对账同一态度（#143）。
pub(super) fn drop_unreconciled_distance(
    decoded: &mut DecodedWorkout,
    summary_distance_m: Option<f64>,
) {
    let last = decoded
        .samples
        .iter()
        .filter_map(|sample| sample.distance_m)
        .fold(None, |best: Option<f64>, value| {
            Some(best.map_or(value, |b| b.max(value)))
        });
    let Some(last) = last else { return };
    let agrees = summary_distance_m
        .filter(|total| total.is_finite() && *total > 0.0)
        .is_some_and(|total| ((last - total) / total).abs() <= 0.03);
    if !agrees {
        for sample in &mut decoded.samples {
            sample.distance_m = None;
        }
    }
}
