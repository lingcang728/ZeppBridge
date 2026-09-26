//! 可作为序列读取的指标清单与来源（从 storage/mod.rs 按领域拆出，逻辑不变）。

/// The daily metrics the body/training screens can chart, and the unit each
/// carries. Charting is limited to this list so a caller cannot ask for an
/// arbitrary metric name and have the UI invent a label for it.
///
/// `metric_samples` metrics are aggregated to one point per local day; the
/// spread of that day's samples becomes `min` / `max`, which is real rather
/// than derived.
pub(super) const SERIES_METRICS: [(&str, MetricSource, &str); 57] = [
    ("sleep_score", MetricSource::SleepScores, "score"),
    ("readiness", MetricSource::Daily(None), "score"),
    ("physical_readiness", MetricSource::Daily(None), "score"),
    ("mental_readiness", MetricSource::Daily(None), "score"),
    ("hybrid_charge", MetricSource::Daily(None), "score"),
    ("physical_charge", MetricSource::Daily(None), "score"),
    ("mental_charge", MetricSource::Daily(None), "score"),
    (
        "stress",
        MetricSource::Daily(Some(("stress_min", "stress_max"))),
        "score",
    ),
    (
        "respiratory_rate",
        MetricSource::Daily(Some(("respiratory_rate_min", "respiratory_rate_max"))),
        "次/分",
    ),
    ("resting_hr", MetricSource::Daily(None), "bpm"),
    // 首页那四张卡要有能点进去的二级页，日活动这几项就得能按天成序列。
    // 它们本来就在 daily_metrics 里，这里只是允许查询它们。
    ("steps", MetricSource::Daily(None), "步"),
    ("distance", MetricSource::Daily(None), "米"),
    ("active_calories", MetricSource::Daily(None), "千卡"),
    ("active_minutes", MetricSource::Daily(None), "分钟"),
    ("spo2_odi", MetricSource::Daily(None), "events/h"),
    ("spo2_night_score", MetricSource::Daily(None), "score"),
    ("spo2_measured_minutes", MetricSource::Daily(None), "分钟"),
    ("training_load", MetricSource::Daily(None), "load"),
    ("vo2max", MetricSource::Daily(None), "ml/kg/min"),
    ("lactate_threshold_hr", MetricSource::Daily(None), "bpm"),
    (
        "lactate_threshold_pace",
        MetricSource::Daily(None),
        "秒/公里",
    ),
    ("pai_daily", MetricSource::Daily(None), "pai"),
    ("pai_low_zone", MetricSource::Daily(None), "pai"),
    ("pai_medium_zone", MetricSource::Daily(None), "pai"),
    ("pai_high_zone", MetricSource::Daily(None), "pai"),
    // v20 取回的那批。全部落在 `daily_metrics` 里，这里只是允许按天查询。
    ("pai_total", MetricSource::Daily(None), "pai"),
    ("pai_low_zone_minutes", MetricSource::Daily(None), "分钟"),
    ("pai_medium_zone_minutes", MetricSource::Daily(None), "分钟"),
    ("pai_high_zone_minutes", MetricSource::Daily(None), "分钟"),
    ("pai_low_zone_lower_hr", MetricSource::Daily(None), "bpm"),
    ("pai_medium_zone_lower_hr", MetricSource::Daily(None), "bpm"),
    ("pai_high_zone_lower_hr", MetricSource::Daily(None), "bpm"),
    ("sleep_hrv", MetricSource::Daily(None), "ms"),
    ("sleep_rhr", MetricSource::Daily(None), "bpm"),
    ("hrv_baseline", MetricSource::Daily(None), "ms"),
    ("rhr_baseline", MetricSource::Daily(None), "bpm"),
    ("ahi_baseline", MetricSource::Daily(None), "events/h"),
    ("step_goal", MetricSource::Daily(None), "步"),
    ("calorie_goal", MetricSource::Daily(None), "千卡"),
    ("active_minutes_goal", MetricSource::Daily(None), "分钟"),
    ("hrv", MetricSource::Samples, "ms"),
    ("hrv_rmssd", MetricSource::Samples, "ms"),
    // 体重与体成分。一天可能称好几次，所以存在 `metric_samples` 里，按天折成
    // 一个点由这里完成。
    //
    // **这张表和归一化那边是两份名单，两份都要有。** 只写进库、忘了登记在
    // 这里，`metric_series` 会在那个 `continue` 上悄悄跳过它——导出和契约都
    // 正常，唯独界面上是一张空卡片，而且什么都不报错。
    ("weight", MetricSource::Samples, "kg"),
    ("bmi", MetricSource::Samples, "kg/m2"),
    ("height", MetricSource::Samples, "cm"),
    ("body_fat_rate", MetricSource::Samples, "%"),
    ("body_water_rate", MetricSource::Samples, "%"),
    ("muscle_mass", MetricSource::Samples, "kg"),
    ("bone_mass", MetricSource::Samples, "kg"),
    ("protein_rate", MetricSource::Samples, "%"),
    ("visceral_fat", MetricSource::Samples, "grade"),
    ("bmr", MetricSource::Samples, "kcal/day"),
    ("body_balance_score", MetricSource::Samples, "score"),
    // 饮食记录。按天汇总，落在 `daily_metrics`。
    ("intake_calories", MetricSource::Daily(None), "kcal"),
    ("intake_protein_g", MetricSource::Daily(None), "g"),
    ("intake_fat_g", MetricSource::Daily(None), "g"),
    ("intake_carbs_g", MetricSource::Daily(None), "g"),
];

/// Sample-backed metrics that are not in `SERIES_METRICS` above because they
/// share a name with a daily metric; charted from `metric_samples`.
pub(super) const SAMPLE_ONLY_SERIES_METRICS: [(&str, &str); 1] = [("spo2", "%")];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum MetricSource {
    /// One row per day in `daily_metrics`, optionally with companion metrics
    /// carrying that day's measured minimum and maximum.
    Daily(Option<(&'static str, &'static str)>),
    /// Individual readings in `metric_samples`, folded to one point per day.
    Samples,
    /// Sleep scores are stored with sessions rather than daily_metrics.
    SleepScores,
}

/// `(source, unit)` of a series metric known to `metric_series`.
///
/// `ai_tasks` 的类别→指标展开从这里取「这张指标存在哪张表、单位是什么」，
/// 同一指标的来源表与单位只允许有一份定义。`heart_rate` 不在表里——它走
/// `heart_rate_series` 的专用语义，ai_tasks 自己给它登记 Samples/bpm。
pub(crate) fn series_metric_spec(metric: &str) -> Option<(MetricSource, &'static str)> {
    SERIES_METRICS
        .iter()
        .find(|(name, _, _)| *name == metric)
        .map(|(_, source, unit)| (*source, *unit))
        .or_else(|| {
            SAMPLE_ONLY_SERIES_METRICS
                .iter()
                .find(|(name, _)| *name == metric)
                .map(|(_, unit)| (MetricSource::Samples, *unit))
        })
}
