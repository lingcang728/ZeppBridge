//! 心率区间：基准、模型、偏好与报告（从 storage/mod.rs 按领域拆出，逻辑不变）。

use super::*;

/// The three ways Zepp itself splits heart rate into zones.
///
/// The percentages are not invented: the workout summary carries the device's
/// own boundaries (`heart_range`) alongside `heartrate_setting_type`, and for
/// this account's threshold model those boundaries are
/// 113/141/154/162/173/190 against a lactate threshold of 175 bpm — exactly
/// floor(175 x 65/81/88/93/99/109%). The other two models use Zepp's published
/// splits for the same five zones.
/// `(zone, label, low percent, high percent)`.
pub(super) type ZoneBandSpec = (i32, &'static str, f64, f64);

/// `(id, label, formula, required basis kinds, five bands)`.
pub(super) type ZoneModelSpec = (
    &'static str,
    &'static str,
    &'static str,
    &'static [&'static str],
    [ZoneBandSpec; 5],
);

pub(super) const ZONE_MODELS: [ZoneModelSpec; 3] = [
    (
        "max_hr",
        "最大心率区间",
        "区间下界 = 最大心率 x 百分比",
        &["max_hr"],
        [
            (1, "热身", 0.50, 0.60),
            (2, "燃脂", 0.60, 0.70),
            (3, "有氧耐力", 0.70, 0.80),
            (4, "无氧耐力", 0.80, 0.90),
            (5, "极限", 0.90, 1.00),
        ],
    ),
    (
        "hr_reserve",
        "储备心率区间",
        "区间下界 = 静息心率 + (最大心率 - 静息心率) x 百分比",
        &["max_hr", "resting_hr"],
        [
            (1, "热身", 0.50, 0.60),
            (2, "燃脂", 0.60, 0.70),
            (3, "有氧耐力", 0.70, 0.80),
            (4, "无氧耐力", 0.80, 0.90),
            (5, "极限", 0.90, 1.00),
        ],
    ),
    (
        "lactate_threshold",
        "乳酸阈值区间",
        "区间下界 = 乳酸阈值心率 x 百分比",
        &["threshold_hr"],
        [
            (1, "轻松", 0.65, 0.81),
            (2, "耐力", 0.81, 0.88),
            (3, "节奏", 0.88, 0.93),
            (4, "阈值", 0.93, 0.99),
            (5, "无氧", 0.99, 1.09),
        ],
    ),
];

/// The IPC structs are camelCase for the frontend, but an export file is
/// snake_case throughout. Rendering these two shapes by hand keeps one file
/// from carrying both conventions.
pub(super) fn basis_json(basis: &HeartRateBasis) -> serde_json::Value {
    serde_json::json!({
        "id": basis.id,
        "kind": basis.kind,
        "label": basis.label,
        "value": basis.value,
        "unit": basis.unit,
        "source": basis.source,
        "measured_at": basis.measured_at,
        "note": basis.note,
    })
}

pub(super) fn zone_json(zone: &HeartRateZoneRow) -> serde_json::Value {
    serde_json::json!({
        "zone": zone.zone,
        "label": zone.label,
        "min_bpm": zone.min_bpm,
        "max_bpm": zone.max_bpm,
        "seconds": zone.seconds,
    })
}

/// Turn one model plus its chosen bases into five zones and the time spent in
/// each.
///
/// Boundaries are floored, matching the device: a lactate threshold of 175 bpm
/// produces 113/141/154/162/173/190 on the watch, and 175 x 0.65 = 113.75 only
/// lands on 113 by flooring.
pub(super) fn zone_report(
    model: &HeartRateZoneModel,
    used: Vec<HeartRateBasis>,
    histogram: &BTreeMap<i32, i64>,
    window_days: i64,
) -> HeartRateZoneReport {
    let value_of = |kind: &str| -> f64 {
        used.iter()
            .find(|basis| basis.kind == kind)
            .map(|basis| basis.value)
            .unwrap_or_default()
    };
    let boundary = |percent: f64| -> i32 {
        let raw = match model.id.as_str() {
            "hr_reserve" => {
                let max = value_of("max_hr");
                let rest = value_of("resting_hr");
                rest + (max - rest) * percent
            }
            "lactate_threshold" => value_of("threshold_hr") * percent,
            _ => value_of("max_hr") * percent,
        };
        raw.floor() as i32
    };

    let zones = model
        .bands
        .iter()
        .map(|band| {
            let low = boundary(band.low_percent);
            let high = boundary(band.high_percent);
            HeartRateZoneRow {
                zone: band.zone,
                label: band.label.clone(),
                min_bpm: low,
                max_bpm: (high - 1).max(low),
                seconds: histogram.range(low..high).map(|(_, count)| *count).sum(),
            }
        })
        .collect::<Vec<_>>();

    let floor_bpm = zones.first().map(|zone| zone.min_bpm).unwrap_or_default();
    let ceiling_bpm = zones
        .last()
        .map(|zone| zone.max_bpm + 1)
        .unwrap_or_default();
    HeartRateZoneReport {
        model: model.id.clone(),
        model_label: model.label.clone(),
        formula: model.formula.clone(),
        bases: used,
        below_zone_1_seconds: histogram.range(..floor_bpm).map(|(_, count)| *count).sum(),
        above_zone_5_seconds: histogram
            .range(ceiling_bpm..)
            .map(|(_, count)| *count)
            .sum(),
        total_seconds: histogram.values().sum(),
        zones,
        window_days,
        source: "workout_samples".into(),
    }
}

impl Database {
    /// Every heart-rate number this library actually measured.
    ///
    /// Five entries at most, each naming its table, its column and the day it
    /// was recorded. There is no age-based estimate here on purpose: 220−age
    /// would be a fabricated basis in a product that promises not to fabricate.
    pub fn heart_rate_bases(&self) -> Result<Vec<HeartRateBasis>> {
        let mut bases = Vec::new();

        let observed: Option<(i32, String)> = self
            .conn
            .query_row(
                "SELECT max_hr, start_time FROM workouts
                 WHERE max_hr IS NOT NULL AND max_hr > 0
                 ORDER BY max_hr DESC, start_time DESC LIMIT 1",
                [],
                |row| Ok((row.get::<_, i32>(0)?, row.get::<_, String>(1)?)),
            )
            .optional()?;
        if let Some((value, observed_at)) = observed {
            bases.push(HeartRateBasis {
                id: "observed_max".into(),
                kind: "max_hr".into(),
                label: "实测最高心率".into(),
                value: f64::from(value),
                unit: "bpm".into(),
                source: "max(workouts.max_hr)".into(),
                measured_at: observed_at.get(..10).map(str::to_owned),
                note: Some("本地记录到的最高心率。没跑到真正的极限时，区间会整体偏窄。".into()),
                note_count: None,
            });
        }

        for (id, metric, label, source, note) in [
            (
                "device_max",
                "device_max_hr",
                "手表自报最大心率",
                "daily_metrics.device_max_hr",
                "手表在 PAI 报文里自报的最大心率，通常来自 Zepp App 的个人设置。",
            ),
            (
                "device_resting",
                "device_resting_hr",
                "手表自报静息心率",
                "daily_metrics.device_resting_hr",
                "手表在 PAI 报文里自报的静息心率。",
            ),
            (
                "lactate_threshold",
                "lactate_threshold_hr",
                "乳酸阈值心率",
                "daily_metrics.lactate_threshold_hr",
                "手表在一次高强度跑步后测出的乳酸阈值心率。",
            ),
        ] {
            let latest: Option<(String, f64)> = self
                .conn
                .query_row(
                    "SELECT date, value FROM daily_metrics
                     WHERE metric = ?1 AND value > 0
                     ORDER BY date DESC LIMIT 1",
                    [metric],
                    |row| Ok((row.get::<_, String>(0)?, row.get::<_, f64>(1)?)),
                )
                .optional()?;
            if let Some((date, value)) = latest {
                bases.push(HeartRateBasis {
                    id: id.into(),
                    kind: if id == "lactate_threshold" {
                        "threshold_hr".into()
                    } else if id == "device_max" {
                        "max_hr".into()
                    } else {
                        "resting_hr".into()
                    },
                    label: label.into(),
                    value: round1(value),
                    unit: "bpm".into(),
                    source: source.into(),
                    measured_at: Some(date),
                    note: Some(note.into()),
                    note_count: None,
                });
            }
        }

        // The rolling resting heart rate ZeppBridge computes itself. It is an
        // average of measured days, not a model, so it carries the window it
        // was taken over instead of a single measurement date.
        let computed: Option<(f64, i64, Option<String>)> = self
            .conn
            .query_row(
                "SELECT AVG(value), COUNT(*), MAX(date) FROM daily_metrics
                 WHERE metric = 'resting_hr' AND value > 0
                   AND date >= date('now', 'localtime', '-30 day')",
                [],
                |row| {
                    Ok((
                        row.get::<_, Option<f64>>(0)?.unwrap_or_default(),
                        row.get::<_, i64>(1)?,
                        row.get::<_, Option<String>>(2)?,
                    ))
                },
            )
            .optional()?;
        if let Some((average, count, latest)) = computed {
            if count > 0 {
                bases.push(HeartRateBasis {
                    id: "computed_resting".into(),
                    kind: "resting_hr".into(),
                    label: "本地统计静息心率".into(),
                    value: average.round(),
                    unit: "bpm".into(),
                    source: "avg(daily_metrics.resting_hr)".into(),
                    measured_at: latest,
                    note: Some(format!("近 30 天里有数据的 {count} 天的平均值。")),
                    note_count: Some(count),
                });
            }
        }

        Ok(bases)
    }

    pub fn heart_rate_zone_preference(&self) -> Result<HeartRateZonePreference> {
        let Some(stored) = self.get_app_meta(HEART_RATE_ZONE_PREF_KEY)? else {
            return Ok(HeartRateZonePreference::default());
        };
        // A preference written by an older build must never block the picker.
        Ok(serde_json::from_str(&stored).unwrap_or_default())
    }

    pub fn set_heart_rate_zone_preference(
        &self,
        preference: &HeartRateZonePreference,
    ) -> Result<HeartRateZonePreference> {
        let encoded = serde_json::to_string(preference)
            .map_err(|error| ZeppBridgeError::ParseError(error.to_string()))?;
        self.set_app_meta(HEART_RATE_ZONE_PREF_KEY, &encoded)?;
        Ok(preference.clone())
    }

    /// The zone picker's whole state: measured bases, the models they can
    /// support, the user's choice, and the zones that choice produces.
    ///
    /// No model is preselected. Until someone picks one, `report` is `None`
    /// and the screen shows the choice rather than a number.
    pub fn heart_rate_zone_options(&self, days: i64) -> Result<HeartRateZoneOptions> {
        let window_days = days.clamp(1, 1825);
        let bases = self.heart_rate_bases()?;
        let has_kind = |kind: &str| bases.iter().any(|basis| basis.kind == kind);

        let models = ZONE_MODELS
            .iter()
            .map(|(id, label, formula, requires, bands)| HeartRateZoneModel {
                id: (*id).to_string(),
                label: (*label).to_string(),
                formula: (*formula).to_string(),
                requires: requires.iter().map(|kind| (*kind).to_string()).collect(),
                bands: bands
                    .iter()
                    .map(|(zone, name, low, high)| HeartRateZoneBand {
                        zone: *zone,
                        label: (*name).to_string(),
                        low_percent: *low,
                        high_percent: *high,
                    })
                    .collect(),
                available: requires.iter().all(|kind| has_kind(kind)),
            })
            .collect::<Vec<_>>();

        let preference = self.heart_rate_zone_preference()?;
        let report = self.heart_rate_zone_report(&bases, &models, &preference, window_days)?;
        Ok(HeartRateZoneOptions {
            bases,
            models,
            preference,
            report,
            window_days,
        })
    }

    pub(super) fn heart_rate_zone_report(
        &self,
        bases: &[HeartRateBasis],
        models: &[HeartRateZoneModel],
        preference: &HeartRateZonePreference,
        window_days: i64,
    ) -> Result<Option<HeartRateZoneReport>> {
        let Some(model_id) = preference.model.as_deref() else {
            return Ok(None);
        };
        let Some(model) = models.iter().find(|model| model.id == model_id) else {
            return Ok(None);
        };
        let pick = |kind: &str| -> Option<&HeartRateBasis> {
            let chosen = match kind {
                "max_hr" => preference.max_basis.as_deref(),
                "resting_hr" => preference.resting_basis.as_deref(),
                "threshold_hr" => preference.threshold_basis.as_deref(),
                _ => None,
            }?;
            bases
                .iter()
                .find(|basis| basis.id == chosen && basis.kind == kind)
        };
        let mut used = Vec::new();
        for kind in &model.requires {
            let Some(basis) = pick(kind) else {
                return Ok(None);
            };
            used.push(basis.clone());
        }

        let end = Local::now().date_naive();
        let start = end - Duration::days(window_days - 1);
        let histogram = self.workout_heart_rate_histogram(
            &start.format("%Y-%m-%d").to_string(),
            &end.format("%Y-%m-%d").to_string(),
            None,
        )?;

        Ok(Some(zone_report(model, used, &histogram, window_days)))
    }

    /// Every way this library's measured numbers can be turned into zones.
    ///
    /// The export cannot silently pick one: which model a runner trains by is
    /// their decision, and this account holds two candidate maxima and two
    /// candidate resting rates. So every combination that the stored numbers
    /// support is written out, each stating the bases behind it, and
    /// `selected_model` says which one the user actually chose — `null` when
    /// they have not chosen yet.
    pub(super) fn heart_rate_zone_variants(
        &self,
        start_text: &str,
        end_text: &str,
        workout_id: Option<&str>,
    ) -> Result<Option<serde_json::Value>> {
        let bases = self.heart_rate_bases()?;
        if bases.is_empty() {
            return Ok(None);
        }
        let preference = self.heart_rate_zone_preference()?;
        let histogram = self.workout_heart_rate_histogram(start_text, end_text, workout_id)?;
        let options = self.heart_rate_zone_options(1)?;

        let of_kind = |kind: &str| -> Vec<&HeartRateBasis> {
            bases.iter().filter(|basis| basis.kind == kind).collect()
        };

        let mut variants = Vec::new();
        for model in &options.models {
            if !model.available {
                continue;
            }
            let maxima = if model.requires.iter().any(|kind| kind == "max_hr") {
                of_kind("max_hr")
            } else {
                vec![]
            };
            let restings = if model.requires.iter().any(|kind| kind == "resting_hr") {
                of_kind("resting_hr")
            } else {
                vec![]
            };
            let thresholds = if model.requires.iter().any(|kind| kind == "threshold_hr") {
                of_kind("threshold_hr")
            } else {
                vec![]
            };
            let combinations: Vec<Vec<HeartRateBasis>> = match model.id.as_str() {
                "hr_reserve" => maxima
                    .iter()
                    .flat_map(|max| {
                        restings
                            .iter()
                            .map(|rest| vec![(*max).clone(), (*rest).clone()])
                            .collect::<Vec<_>>()
                    })
                    .collect(),
                "lactate_threshold" => thresholds
                    .iter()
                    .map(|threshold| vec![(*threshold).clone()])
                    .collect(),
                _ => maxima.iter().map(|max| vec![(*max).clone()]).collect(),
            };
            for used in combinations {
                let report = zone_report(model, used, &histogram, 0);
                let selected = preference.model.as_deref() == Some(model.id.as_str())
                    && report.bases.iter().all(|basis| {
                        let chosen = match basis.kind.as_str() {
                            "max_hr" => preference.max_basis.as_deref(),
                            "resting_hr" => preference.resting_basis.as_deref(),
                            _ => preference.threshold_basis.as_deref(),
                        };
                        chosen == Some(basis.id.as_str())
                    });
                variants.push(serde_json::json!({
                    "model": report.model,
                    "label": report.model_label,
                    "formula": report.formula,
                    "selected": selected,
                    "bases": report.bases.iter().map(basis_json).collect::<Vec<_>>(),
                    "zones": report.zones.iter().map(zone_json).collect::<Vec<_>>(),
                    "below_zone_1_seconds": report.below_zone_1_seconds,
                    "above_zone_5_seconds": report.above_zone_5_seconds,
                }));
            }
        }
        if variants.is_empty() {
            return Ok(None);
        }

        Ok(Some(serde_json::json!({
            "unit": "seconds",
            "source": "workout_samples",
            "selected_model": preference.model,
            "measured_bases": bases.iter().map(basis_json).collect::<Vec<_>>(),
            "note": "区间边界一律向下取整，与手表一致（乳酸阈值 175 bpm 在表上就是 113/141/154/162/173/190）。不使用 220−年龄 之类的估算，所有基准都取自本地实测值。用户没有指定模型时 selected 全为 false，这里列出的是全部可算的组合，而不是替他挑一个。",
            "models": variants,
        })))
    }

    /// Seconds spent at each recorded heart rate during workouts in a range.
    pub(super) fn workout_heart_rate_histogram(
        &self,
        start: &str,
        end: &str,
        workout_id: Option<&str>,
    ) -> Result<BTreeMap<i32, i64>> {
        // start_time 的 UTC 宽限界让 v33 的 idx_workouts_start 先把运动切到
        // 范围内再 JOIN；date() 仍是本地日的精修。
        let (utc_lower, utc_upper) = utc_bounds_or_unbounded(start, end);
        let mut stmt = self.conn.prepare(
            "SELECT workout_samples.heart_rate, COUNT(*)
             FROM workout_samples
             JOIN workouts ON workouts.workout_id = workout_samples.workout_id
             WHERE workout_samples.heart_rate IS NOT NULL
               AND workout_samples.heart_rate > 0
               AND workouts.start_time >= ?4 AND workouts.start_time < ?5
               AND date(workouts.start_time, 'localtime') BETWEEN ?1 AND ?2
               AND (?3 IS NULL OR workout_samples.workout_id = ?3)
             GROUP BY workout_samples.heart_rate",
        )?;
        let rows = stmt.query_map(
            params![start, end, workout_id, utc_lower, utc_upper],
            |row| Ok((row.get::<_, i32>(0)?, row.get::<_, i64>(1)?)),
        )?;
        let mut histogram = BTreeMap::new();
        for row in rows {
            let (heart_rate, seconds) = row?;
            *histogram.entry(heart_rate).or_default() += seconds;
        }
        Ok(histogram)
    }
}
