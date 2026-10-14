//! 诊断报告用到的只读查询（从 storage/mod.rs 按领域拆出，逻辑不变）。

use super::*;

impl Database {
    pub fn diagnostic_schema_version(&self) -> Result<i64> {
        self.conn
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .map_err(Into::into)
    }

    /// 最近一次「HTTP 200，但云端说不成功」。
    ///
    /// 只取三样东西：哪条流、哪个 code、什么时候。**不取云端的原话**
    /// ——那是服务端给的自由文本，里面可能带账号信息，而这份报告对用户
    /// 的承诺是只发白名单字段。一个整数就够把「凭据失效长什么样」定下来。
    ///
    /// 为什么需要它：`classify_business_code` 目前把所有非 1 的 code 都归成
    /// `CloudRejected`，而不敎定为「需要重新登录」——因为本机那 1075 条留存
    /// 报文全是 `code = 1`，一个失败码都没观测到。拿到真实的失败码之前，
    /// 把用户踢去重新扫码登录是拿一个确定的坏体验去换一个猜测。
    /// （对得上的真实反馈：D1 `c1f03eb2`「All my readings are showing empty」。）
    pub fn diagnostic_cloud_rejection(&self) -> Result<Option<DiagnosticCloudRejection>> {
        let mut stmt = self.conn.prepare(
            "SELECT stream, last_error_code,
                    COALESCE(last_fetch_error_at, last_parse_error_at, last_write_error_at)
             FROM stream_provenance
             WHERE last_error_code IS NOT NULL
               AND 'cloud_rejected' IN (
                   COALESCE(last_fetch_error_kind, ''),
                   COALESCE(last_parse_error_kind, ''),
                   COALESCE(last_write_error_kind, '')
               )
             ORDER BY updated_at DESC
             LIMIT 1",
        )?;
        let mut rows = stmt.query_map([], |row| {
            Ok(DiagnosticCloudRejection {
                stream: row.get(0)?,
                code: row.get(1)?,
                at: row.get(2)?,
            })
        })?;
        match rows.next() {
            Some(row) => Ok(Some(row?)),
            None => Ok(None),
        }
    }

    pub fn diagnostic_unknown_workout_codes(&self) -> Result<Vec<DiagnosticWorkoutCode>> {
        let mut stmt = self.conn.prepare(
            "SELECT zepp_type, COUNT(*)
             FROM workouts
             WHERE workout_type_source = 'unknown_code' AND zepp_type IS NOT NULL
             GROUP BY zepp_type ORDER BY zepp_type",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(DiagnosticWorkoutCode {
                code: row.get(0)?,
                records: row.get(1)?,
            })
        })?;
        rows.collect::<std::result::Result<Vec<_>, _>>()
            .map_err(Into::into)
    }

    /// 用户做过的运动类型纠正，按「编号 → 我们的解释 → 用户的解释」聚合。
    ///
    /// 只取有 `zepp_type` 的行：没有原始编号的纠正对补目录没有帮助，而这份
    /// 报告存在的唯一理由就是补目录。按三元组分组而不是按记录列出，是为了
    /// 让报告的大小跟「有几种错法」走，而不是跟「用户改了多少条」走。
    pub fn diagnostic_workout_type_corrections(&self) -> Result<Vec<DiagnosticWorkoutCorrection>> {
        let mut stmt = self.conn.prepare(
            "SELECT zepp_type, workout_type, workout_type_override, COUNT(*)
             FROM workouts
             WHERE workout_type_override IS NOT NULL
               AND zepp_type IS NOT NULL
               AND workout_type_override <> workout_type
             GROUP BY zepp_type, workout_type, workout_type_override
             ORDER BY COUNT(*) DESC, zepp_type",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(DiagnosticWorkoutCorrection {
                code: row.get(0)?,
                interpreted: row.get(1)?,
                corrected: row.get(2)?,
                records: row.get(3)?,
            })
        })?;
        rows.collect::<std::result::Result<Vec<_>, _>>()
            .map_err(Into::into)
    }

    pub fn diagnostic_workout_type_conflicts(&self) -> Result<i64> {
        self.conn
            .query_row(
                "SELECT COUNT(*) FROM workouts WHERE workout_type_conflict IS NOT NULL",
                [],
                |row| row.get(0),
            )
            .map_err(Into::into)
    }
}
