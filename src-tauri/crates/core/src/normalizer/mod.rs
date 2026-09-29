use crate::models::{error::*, *};

use base64::{engine::general_purpose::STANDARD, Engine as _};

use chrono::{DateTime, Datelike, Duration, NaiveDate, Utc};

use serde_json::{Map, Value};

use std::collections::BTreeMap;

mod band;
mod band_items;
mod device;
mod food;
mod metrics;
mod official;
mod parse;
#[cfg(test)]
mod tests;
mod wellness;

use band_items::*;
use device::*;
use food::*;
use metrics::*;
pub use official::{official_stage_anchor, official_workout_type, OfficialSleep};
use parse::*;
pub use wellness::*;

/// Normalization output with diagnostics and an explicit capability state.
/// The compatibility helpers below return only `records`, but never turn an
/// empty or unrecognised response into a successful empty result.
#[derive(Debug, Clone)]
pub struct NormalizedBatch<T> {
    pub records: Vec<T>,
    pub diagnostics: Vec<String>,
    pub capability: CapabilityStatus,
}

#[derive(Debug, Clone)]
pub struct BandNormalizedData {
    pub sleep_sessions: Vec<SleepSession>,
    pub heart_rate_samples: Vec<MetricSample>,
    pub daily_metrics: Vec<DailyMetric>,
    pub diagnostics: Vec<String>,
    pub capability: CapabilityStatus,
}

impl<T> NormalizedBatch<T> {
    fn into_result(self, stream: &str) -> Result<Vec<T>> {
        let NormalizedBatch {
            records,
            diagnostics,
            capability,
        } = self;
        let _capability = capability;
        if records.is_empty() {
            let detail = if diagnostics.is_empty() {
                "响应没有可识别记录".to_owned()
            } else {
                diagnostics.join("; ")
            };
            return Err(ZeppBridgeError::DataUnavailable(format!(
                "{stream}: {detail}"
            )));
        }
        Ok(records)
    }
}

pub struct Normalizer;
