//! 导出范围与选择、交给 AI 的结果（从 models/types.rs 按领域拆出，形状不变）。

use super::*;

/// How much of each stream an export carries.
///
/// The per-second workout series and per-minute heart rate are 99% of an
/// export's bytes; a 30-day `Full` export is ~9 MB, which no model will read.
/// `Summary` aggregates those two and keeps every structured metric intact, so
/// the same window fits in a context window. `Full` stays available for
/// archival and is what the CSV/GPX converters always use.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ExportDetail {
    #[default]
    Summary,
    Full,
}

impl ExportDetail {
    pub fn is_full(self) -> bool {
        matches!(self, ExportDetail::Full)
    }
}

/// 一次导出覆盖什么。
///
/// 两个变体互斥，不是「都传了谁优先」：一个既带日期范围又带 workout id 的
/// 请求，调用方自己都说不清想要什么，与其替他选一个，不如直接拒绝。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum ExportScope {
    DateRange {
        start: String,
        end: String,
    },
    // 枚举上的 rename_all 只改变体名，不改变体内字段名，所以这里要再标一次，
    // 否则前端发的 `workoutId` 会被当成缺字段。
    #[serde(rename_all = "camelCase")]
    Workout {
        workout_id: String,
    },
}

/// 单次导出的最大跨度。365 天之外的历史请走数据库快照，不要塞进一个
/// 要交给 AI 的 JSON。
pub const MAX_EXPORT_RANGE_DAYS: i64 = 365;

impl ExportScope {
    pub fn date_range(start: impl Into<String>, end: impl Into<String>) -> Self {
        ExportScope::DateRange {
            start: start.into(),
            end: end.into(),
        }
    }

    /// 校验并归一化。日期必须是 `YYYY-MM-DD`，结束不能早于开始，跨度有上限，
    /// workout id 不能为空。
    pub fn validated(&self) -> std::result::Result<ExportScope, String> {
        match self {
            ExportScope::DateRange { start, end } => {
                let parsed_start = chrono::NaiveDate::parse_from_str(start.trim(), "%Y-%m-%d")
                    .map_err(|_| "导出开始日期无效".to_string())?;
                let parsed_end = chrono::NaiveDate::parse_from_str(end.trim(), "%Y-%m-%d")
                    .map_err(|_| "导出结束日期无效".to_string())?;
                if parsed_end < parsed_start {
                    return Err("导出结束日期不能早于开始日期".into());
                }
                if (parsed_end - parsed_start).num_days() > MAX_EXPORT_RANGE_DAYS {
                    return Err("单次导出范围不能超过 366 天".into());
                }
                Ok(ExportScope::DateRange {
                    start: parsed_start.format("%Y-%m-%d").to_string(),
                    end: parsed_end.format("%Y-%m-%d").to_string(),
                })
            }
            ExportScope::Workout { workout_id } => {
                let trimmed = workout_id.trim();
                if trimmed.is_empty() {
                    return Err("workout id 不能为空".into());
                }
                Ok(ExportScope::Workout {
                    workout_id: trimmed.to_string(),
                })
            }
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportSelection {
    /// 新调用方传这个。
    #[serde(default)]
    pub scope: Option<ExportScope>,
    /// 旧调用方的日期范围。短期兼容用，内部一律先转成 `ExportScope`。
    #[serde(default)]
    pub start_date: Option<String>,
    #[serde(default)]
    pub end_date: Option<String>,
    pub data_types: Vec<String>,
    /// Absent means `Summary`; older callers keep working.
    #[serde(default)]
    pub detail: ExportDetail,
}

impl ExportSelection {
    /// 把新旧两种写法收敛成唯一的范围。
    ///
    /// 同时给了 `scope` 和 `startDate/endDate` 是矛盾请求，直接报错而不是
    /// 定一个优先级——优先级规则只会让下一个人写出「我以为传了 workoutId
    /// 就只导这一条」的 bug。
    pub fn resolve_scope(&self) -> std::result::Result<ExportScope, String> {
        let legacy = match (self.start_date.as_deref(), self.end_date.as_deref()) {
            (Some(start), Some(end)) => Some(ExportScope::date_range(start, end)),
            (None, None) => None,
            _ => return Err("导出日期范围必须同时提供开始和结束".into()),
        };
        match (self.scope.as_ref(), legacy) {
            (Some(_), Some(_)) => {
                Err("导出范围只能二选一：日期范围或单次运动，不能同时提供".into())
            }
            (Some(scope), None) => scope.validated(),
            (None, Some(scope)) => scope.validated(),
            (None, None) => Err("导出请求缺少范围：需要日期范围或 workout id".into()),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportEstimate {
    pub record_count: usize,
    pub estimated_bytes: u64,
    pub scope_kind: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub start_time: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub end_time: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportResult {
    pub path: String,
    pub record_count: usize,
    pub bytes: usize,
    pub generated_at: String,
    /// 这次导出写了几个文件。
    ///
    /// 只有 FIT 会给出它：FIT 的 activity 文件按约定装一次活动，所以一个日期
    /// 范围导出的是一个目录下的多份文件，而 `path` 指向那个目录。其余格式一次
    /// 只写一个文件，这里是 `None`，界面也就不会去说「共 1 个文件」这种废话。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub file_count: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiHandoffMetadata {
    pub precise_route_included: bool,
    pub authentication_fields_removed: bool,
    pub identity_fields_removed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiHandoffResult {
    pub mode: String,
    pub clipboard_text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_path: Option<String>,
    pub bytes: usize,
    pub records: usize,
    pub redactions: Vec<String>,
    pub metadata: AiHandoffMetadata,
}

#[cfg(test)]
mod export_scope_tests {
    use super::*;

    fn selection(
        scope: Option<ExportScope>,
        start: Option<&str>,
        end: Option<&str>,
    ) -> ExportSelection {
        ExportSelection {
            scope,
            start_date: start.map(str::to_string),
            end_date: end.map(str::to_string),
            data_types: vec!["workouts".into()],
            detail: ExportDetail::default(),
        }
    }

    #[test]
    fn a_request_that_names_both_a_range_and_a_workout_is_refused() {
        // 这是矛盾请求。定一个优先级只会让下一个人写出「我以为传了 workoutId
        // 就只导这一条」的 bug，所以直接拒绝。
        let both = selection(
            Some(ExportScope::Workout {
                workout_id: "run-1".into(),
            }),
            Some("2026-08-01"),
            Some("2026-08-07"),
        );
        let error = both.resolve_scope().unwrap_err();
        assert!(error.contains("二选一"), "{error}");
    }

    #[test]
    fn a_request_with_no_range_at_all_is_refused() {
        let error = selection(None, None, None).resolve_scope().unwrap_err();
        assert!(error.contains("缺少范围"), "{error}");
    }

    #[test]
    fn half_a_legacy_range_is_refused_rather_than_guessed() {
        assert!(selection(None, Some("2026-08-01"), None)
            .resolve_scope()
            .is_err());
        assert!(selection(None, None, Some("2026-08-07"))
            .resolve_scope()
            .is_err());
    }

    #[test]
    fn legacy_date_fields_still_work_on_their_own() {
        let resolved = selection(None, Some("2026-08-01"), Some("2026-08-07"))
            .resolve_scope()
            .unwrap();
        assert_eq!(
            resolved,
            ExportScope::date_range("2026-08-01", "2026-08-07")
        );
    }

    #[test]
    fn a_reversed_range_is_refused() {
        let error = ExportScope::date_range("2026-08-07", "2026-08-01")
            .validated()
            .unwrap_err();
        assert!(error.contains("不能早于"), "{error}");
    }

    #[test]
    fn an_oversized_range_is_refused_at_the_documented_boundary() {
        // 恰好 365 天之差（366 天含头尾）仍然允许；再多一天就拒绝。
        assert!(ExportScope::date_range("2025-08-01", "2026-08-01")
            .validated()
            .is_ok());
        assert!(ExportScope::date_range("2025-08-01", "2026-08-02")
            .validated()
            .is_err());
    }

    #[test]
    fn a_malformed_date_is_refused_rather_than_silently_clamped() {
        assert!(ExportScope::date_range("not-a-date", "2026-08-01")
            .validated()
            .is_err());
        assert!(ExportScope::date_range("2026-08-01", "2026-13-45")
            .validated()
            .is_err());
    }

    #[test]
    fn an_empty_workout_id_is_refused() {
        let error = ExportScope::Workout {
            workout_id: "   ".into(),
        }
        .validated()
        .unwrap_err();
        assert!(error.contains("不能为空"), "{error}");
    }

    #[test]
    fn scope_round_trips_through_the_ipc_shape_the_frontend_sends() {
        let workout: ExportScope =
            serde_json::from_str(r#"{"kind":"workout","workoutId":"run-1"}"#).unwrap();
        assert_eq!(
            workout,
            ExportScope::Workout {
                workout_id: "run-1".into()
            }
        );
        let range: ExportScope =
            serde_json::from_str(r#"{"kind":"dateRange","start":"2026-08-01","end":"2026-08-07"}"#)
                .unwrap();
        assert_eq!(range, ExportScope::date_range("2026-08-01", "2026-08-07"));
    }
}
