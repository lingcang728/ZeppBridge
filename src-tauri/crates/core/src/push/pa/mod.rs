//! 推到用户自己的 PA 站点（ZeppBridge-Cloud 的 Worker）。移植自
//! `ZeppBridge-Cloud/uploader/upload.mjs`：只读取数 → 去轨迹 → 拆分 → gzip → 加密 → PUT。
//!
//! 对象布局和组件一致：`days/<日>.json`、`workouts/<id>.json`（15 秒采样）和可选的
//! `.full.json`、`summary.json`、`contract.json`、`index.json`、`status.json`（**最后传**，
//! 读的人看到新的 status 时其余对象已经到了）。滑出保留窗口的、本机已删除或隐藏的运动，
//! 在云端也删掉。
//!
//! 和组件不同的一处：清单里记每个对象的内容哈希（不含 `generated_at` 一类时间戳），
//! **内容没变就不重发**；所有对象都没变就一个请求都不发。
//!
//! 还没移植的：profile / context / plan /
//! baselines / data-health 五个档案对象、live 令牌交接、UI 快照。

pub mod crypto;
pub mod summary;

use super::client::{self, SiteUrl};
use crate::models::error::{Result, ZeppBridgeError};
use crate::models::ExportDetail;
use crate::records::{self, RecordQuery};
use crate::storage::{Database, EXPORT_DATA_TYPES};
use chrono::{DateTime, Duration as ChronoDuration, Local, NaiveDate, Utc};
use flate2::{write::GzEncoder, Compression};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{BTreeMap, BTreeSet};
use std::io::Write as _;

const SAMPLE_INTERVAL_MS: i64 = 15_000;

const SUMMARY_TYPES: [&str; 13] = [
    "daily_activity",
    "sleep",
    "workouts",
    "heart_rate",
    "hrv",
    "pai",
    "recovery",
    "steps",
    "stress",
    "training_load",
    "vo2max",
    "respiratory_rate",
    "spo2",
];

/// 用户给的选项（不含密钥）。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PaOptions {
    pub retention_days: u32,
    pub summary_days: u32,
    pub full_resolution_workouts: bool,
}

/// 凭据库里存的三样东西（JSON）。只在内存里用，不落盘、不进日志。
#[derive(Clone, Deserialize, Serialize)]
pub struct PaSecrets {
    pub tenant: Option<String>,
    pub dk: String,
    #[serde(rename = "writeKey")]
    pub write_key: String,
}

impl std::fmt::Debug for PaSecrets {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("PaSecrets(<redacted>)")
    }
}

/// 解开并校验过的密钥。
pub struct PaKeys {
    pub tenant: String,
    pub dk: Vec<u8>,
    pub write_key: String,
}

impl PaSecrets {
    pub fn validate(&self) -> std::result::Result<PaKeys, &'static str> {
        let (kind, tenant) =
            crypto::parse_key(&self.write_key).ok_or("err.push.pa_write_key_malformed")?;
        if kind != crypto::KeyKind::Write {
            return Err("err.push.pa_write_key_malformed");
        }
        if self.tenant.as_deref().is_some_and(|given| given != tenant) {
            return Err("err.push.pa_tenant_mismatch");
        }
        let dk = crypto::from_b64url(&self.dk).ok_or("err.push.pa_data_key_malformed")?;
        if dk.len() != 32 {
            return Err("err.push.pa_data_key_malformed");
        }
        Ok(PaKeys {
            tenant,
            dk,
            write_key: self.write_key.clone(),
        })
    }
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct WorkoutEntry {
    pub date: String,
    pub workout_type: Option<String>,
    pub start_time: Option<String>,
    pub has_full: bool,
}

/// 推送清单：`data/push/<目标>.manifest.json`。字段沿用组件的 manifest，另加 `objects`。
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct Manifest {
    #[serde(default = "manifest_version")]
    pub version: u32,
    #[serde(default)]
    pub destination: Option<String>,
    /// 日 → 第一次传上去的时刻。
    #[serde(default)]
    pub days: BTreeMap<String, String>,
    #[serde(default)]
    pub workouts: BTreeMap<String, WorkoutEntry>,
    #[serde(default)]
    pub full_resolution: bool,
    /// 相对路径 → 上次传上去的内容哈希。
    #[serde(default)]
    pub objects: BTreeMap<String, String>,
    #[serde(default)]
    pub last_seen_cloud_sync_at: Option<String>,
}

fn manifest_version() -> u32 {
    1
}

/// 这一轮要发的东西。
#[derive(Debug, Default)]
pub struct Plan {
    /// 要 PUT 的对象：相对路径和明文 JSON。`status.json` 永远排在最后。
    pub outgoing: Vec<(String, String)>,
    pub deletes: BTreeSet<String>,
    /// 内容没变、这轮跳过的对象数。
    pub unchanged: usize,
    /// 成功后写回的清单。
    pub manifest: Manifest,
    pub days_considered: usize,
}

impl Plan {
    pub fn is_empty(&self) -> bool {
        self.outgoing.is_empty() && self.deletes.is_empty()
    }
}

/// 本机状态里 `status.json` 要用的几项（和 `zeppbridge-cli status --json` 同源）。
#[derive(Debug, Clone, Default)]
pub struct LocalStatus {
    pub last_cloud_sync_at: Option<String>,
    pub latest_day: Option<String>,
    pub latest_workout_at: Option<String>,
}

impl LocalStatus {
    pub fn read(db: &Database) -> Self {
        let health = db.data_health(30, 0).ok();
        let coverage = db
            .local_coverage(Local::now().date_naive())
            .unwrap_or_default();
        let latest = db.get_recent_workouts(1).unwrap_or_default();
        Self {
            last_cloud_sync_at: health.and_then(|health| health.timings.last_cloud_sync_at),
            latest_day: coverage.latest_day,
            latest_workout_at: latest
                .first()
                .map(|workout| workout.start_time.to_rfc3339()),
        }
    }
}

/// 从今天往回数 `n` 天（含今天），升序。
pub fn days_back(today: NaiveDate, n: u32) -> Vec<String> {
    (0..i64::from(n))
        .rev()
        .map(|offset| {
            (today - ChronoDuration::days(offset))
                .format("%Y-%m-%d")
                .to_string()
        })
        .collect()
}

/// 每 15 秒留一个真实采样点（不取平均、不插值）。
pub fn every_15s(samples: &[Value]) -> Vec<Value> {
    let mut out = Vec::new();
    let mut next = i64::MIN;
    for sample in samples {
        let Some(moment) = sample
            .get("timestamp")
            .and_then(Value::as_str)
            .and_then(|text| DateTime::parse_from_rfc3339(text).ok())
        else {
            continue;
        };
        let at = moment.timestamp_millis();
        if at < next {
            continue;
        }
        out.push(sample.clone());
        next = at + SAMPLE_INTERVAL_MS;
    }
    out
}

fn workout_object(
    envelope: &Value,
    workout: &Value,
    samples: Vec<Value>,
    resolution: &str,
) -> Value {
    let mut rest = workout.clone();
    if let Some(object) = rest.as_object_mut() {
        object.remove("route");
        object.insert("samples".into(), Value::Array(samples));
    }
    json!({
        "schema_version": envelope.get("schema_version"),
        "records_version": envelope.get("records_version"),
        "generated_at": envelope.get("generated_at"),
        "provenance": envelope.get("provenance"),
        "devices": envelope.get("devices"),
        "resolution": resolution,
        "samples_note": if resolution == "15s" {
            "One real sample kept every 15 s (not averaged, not interpolated). sample_count is the original per-second count."
        } else {
            "Every stored sample at original resolution."
        },
        "route_note": "GPS routes are never uploaded.",
        "workout": rest,
    })
}

/// 内容哈希：去掉每次都会变的时间戳字段，剩下的才算「内容」。
pub fn content_hash(value: &Value) -> String {
    let mut stripped = value.clone();
    if let Some(object) = stripped.as_object_mut() {
        for key in ["generated_at", "last_upload_at"] {
            object.remove(key);
        }
    }
    crypto::sha256_hex(&serde_json::to_string(&stripped).unwrap_or_default())
}

fn day_query(types: &[&str], from: &str, to: &str, detail: ExportDetail) -> RecordQuery {
    let mut query = RecordQuery::range(types, from, to, None);
    query.detail = detail;
    // PA 永不收轨迹；这里不开，出门前还有一道坐标硬检查。
    query.include_gps = false;
    query
}

/// 读本机库，算出这一轮要发什么。只读：不拿写锁、不改库。
pub fn build_plan(
    db: &Database,
    options: &PaOptions,
    previous: &Manifest,
    today: NaiveDate,
    status: &LocalStatus,
    now: DateTime<Utc>,
    time_zone: &str,
) -> Result<Plan> {
    let mut manifest = previous.clone();
    manifest.version = 1;
    let window = days_back(today, options.retention_days);
    // One snapshot covers the whole retention window, including historical imports
    // and local edits. Hash each object immediately and retain only changed payloads.
    let snapshot = db.conn.unchecked_transaction()?;
    let mut plan = Plan {
        days_considered: window.len(),
        ..Default::default()
    };
    let mut objects = std::mem::take(&mut manifest.objects);
    let mut queue = |rel: String, value: Value| -> Result<()> {
        let hash = content_hash(&value);
        if objects.get(&rel) == Some(&hash) {
            plan.unchanged += 1;
        } else {
            let text = serde_json::to_string(&value)
                .map_err(|error| ZeppBridgeError::ParseError(error.to_string()))?;
            objects.insert(rel.clone(), hash);
            plan.outgoing.push((rel, text));
        }
        Ok(())
    };
    let mut deletes: BTreeSet<String> = BTreeSet::new();
    let now_text = now.to_rfc3339();

    let all_types: Vec<&str> = EXPORT_DATA_TYPES.to_vec();
    let mut seen = BTreeSet::new();
    let mut workout_days = Vec::new();
    for day in &window {
        let set =
            records::query_records(db, &day_query(&all_types, day, day, ExportDetail::Summary))?;
        if set.value["data"]["workouts"]
            .as_array()
            .is_some_and(|records| !records.is_empty())
        {
            workout_days.push(day);
        }
        queue(format!("days/{day}.json"), set.value)?;
    }

    for day in workout_days {
        let envelope =
            records::query_records(db, &day_query(&["workouts"], day, day, ExportDetail::Full))?
                .value;
        let empty = Vec::new();
        let workouts = envelope
            .get("data")
            .and_then(|data| data.get("workouts"))
            .and_then(Value::as_array)
            .unwrap_or(&empty);
        for workout in workouts {
            let id = match workout.get("workout_id") {
                Some(Value::String(text)) => text.clone(),
                Some(other) => other.to_string(),
                None => continue,
            };
            seen.insert(id.clone());
            let samples = workout
                .get("samples")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default();
            queue(
                format!("workouts/{id}.json"),
                workout_object(&envelope, workout, every_15s(&samples), "15s"),
            )?;
            let has_full = options.full_resolution_workouts && !samples.is_empty();
            if has_full {
                queue(
                    format!("workouts/{id}.full.json"),
                    workout_object(&envelope, workout, samples, "full"),
                )?;
            } else if manifest
                .workouts
                .get(&id)
                .is_some_and(|entry| entry.has_full)
            {
                // 先看旧清单再覆盖：否则关掉逐秒后，最近几天重导的运动会漏删逐秒版。
                deletes.insert(format!("workouts/{id}.full.json"));
            }
            manifest.workouts.insert(
                id,
                WorkoutEntry {
                    date: day.clone(),
                    workout_type: workout
                        .get("workout_type")
                        .and_then(Value::as_str)
                        .map(str::to_string),
                    start_time: workout
                        .get("start_time")
                        .and_then(Value::as_str)
                        .map(str::to_string),
                    has_full,
                },
            );
        }
    }

    // 逐秒选项关掉：云端已有的逐秒版要删，不只是停止上传。
    if !options.full_resolution_workouts {
        for (id, entry) in manifest.workouts.iter_mut() {
            if entry.has_full {
                deletes.insert(format!("workouts/{id}.full.json"));
                entry.has_full = false;
            }
        }
    }

    // 滑出保留窗口的删掉。
    let stale_days: Vec<String> = manifest
        .days
        .keys()
        .filter(|day| window.binary_search(day).is_err())
        .cloned()
        .collect();
    for day in stale_days {
        deletes.insert(format!("days/{day}.json"));
        manifest.days.remove(&day);
    }
    let stale_workouts: Vec<String> = manifest
        .workouts
        .iter()
        .filter(|(id, _)| !seen.contains(*id))
        .map(|(id, _)| id.clone())
        .collect();
    for id in stale_workouts {
        deletes.insert(format!("workouts/{id}.json"));
        deletes.insert(format!("workouts/{id}.full.json"));
        manifest.workouts.remove(&id);
    }

    // 给助手的只读接口：近 N 天每日摘要 + 读数契约。
    let summary_count = options.summary_days.min(options.retention_days) as usize;
    let summary_days: Vec<String> = window[window.len().saturating_sub(summary_count)..].to_vec();
    if let (Some(first), Some(last)) = (summary_days.first(), summary_days.last()) {
        let envelope = records::query_records(
            db,
            &day_query(&SUMMARY_TYPES, first, last, ExportDetail::Summary),
        )?
        .value;
        queue(
            "summary.json".into(),
            summary::build_summary(&envelope, &summary_days, time_zone, &now_text),
        )?;
    }
    queue("contract.json".into(), crate::contract::contract_json())?;

    for day in &window {
        manifest
            .days
            .entry(day.clone())
            .or_insert_with(|| now_text.clone());
    }
    manifest.full_resolution = options.full_resolution_workouts;
    manifest.last_seen_cloud_sync_at = status.last_cloud_sync_at.clone();

    let mut index: Vec<Value> = manifest
        .workouts
        .iter()
        .map(|(id, entry)| {
            json!({
                "workout_id": id,
                "date": entry.date,
                "workout_type": entry.workout_type,
                "start_time": entry.start_time,
                "has_full": entry.has_full,
            })
        })
        .collect();
    index.sort_by(|a, b| {
        let key = |value: &Value| value["start_time"].as_str().unwrap_or_default().to_string();
        key(b).cmp(&key(a))
    });
    queue(
        "index.json".into(),
        json!({
            "retention_days": options.retention_days,
            "days": manifest.days.keys().collect::<Vec<_>>(),
            "workouts": index,
        }),
    )?;
    snapshot.commit()?;
    let status_value = json!({
        "schema": "zeppbridge-cloud/1",
        "last_upload_at": now_text,
        "last_cloud_sync_at": status.last_cloud_sync_at,
        "latest_day": status.latest_day,
        "latest_workout_at": status.latest_workout_at,
        "sync_error": Value::Null,
        "sync": { "skipped": true, "note": "pushed by ZeppBridge itself after its own sync" },
        "full_resolution_workouts": options.full_resolution_workouts,
        "retention_days": options.retention_days,
        "summary_days": summary_count,
        "time_zone": time_zone,
        "app_version": env!("CARGO_PKG_VERSION"),
        "uploader": "zeppbridge",
        "time_note": "last_upload_at = when this computer uploaded; last_cloud_sync_at = when it last pulled from the Zepp cloud; each record carries its own sample time.",
    });

    for rel in &deletes {
        objects.remove(rel);
    }
    manifest.objects = objects;
    // 有内容变了（或要删东西）才附上 status.json，放在最后；什么都没变就一个请求都不发。
    if !plan.outgoing.is_empty() || !deletes.is_empty() {
        let text = serde_json::to_string(&status_value)
            .map_err(|error| ZeppBridgeError::ParseError(error.to_string()))?;
        manifest
            .objects
            .insert("status.json".into(), content_hash(&status_value));
        plan.outgoing.push(("status.json".into(), text));
    }
    plan.deletes = deletes;
    plan.manifest = manifest;
    Ok(plan)
}

/// 出门前硬检查：任何坐标字段 → 整次中止，一个字节都不传。
pub fn check_no_coordinates(plan: &Plan) -> std::result::Result<(), String> {
    for (rel, text) in &plan.outgoing {
        if let Some(field) = crypto::find_coordinate_field(text) {
            return Err(format!(
                "coordinate field \"{field}\" found in {rel}; aborted, nothing uploaded"
            ));
        }
    }
    Ok(())
}

pub fn gzip(text: &str) -> Vec<u8> {
    let mut encoder = GzEncoder::new(Vec::new(), Compression::best());
    // 写进 Vec 不会失败。
    let _ = encoder.write_all(text.as_bytes());
    encoder.finish().unwrap_or_default()
}

/// 一轮上传的结果（只有条数和字节数）。
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
pub struct UploadStats {
    pub objects: usize,
    pub deleted: usize,
    pub unchanged: usize,
    pub bytes_plain: usize,
    pub bytes_sent: usize,
}

/// 压缩 → 加密 → 发送。先删后传，`status.json` 最后。
pub async fn upload(
    site: &SiteUrl,
    keys: &PaKeys,
    plan: &Plan,
) -> std::result::Result<UploadStats, String> {
    let client = client::build_client()?;
    let mut stats = UploadStats {
        unchanged: plan.unchanged,
        ..Default::default()
    };
    for rel in &plan.deletes {
        client::send(
            &client,
            reqwest::Method::DELETE,
            &format!("{}/objects/{rel}", site.api),
            &keys.write_key,
            "application/octet-stream",
            None,
            &format!("DELETE {rel}"),
        )
        .await?;
        stats.deleted += 1;
    }
    for (rel, text) in &plan.outgoing {
        let gz = gzip(text);
        let sealed = crypto::encrypt_object(&keys.dk, &crypto::object_key(&keys.tenant, rel), &gz)
            .map_err(|_| "encryption failed".to_string())?;
        stats.bytes_plain += text.len();
        stats.bytes_sent += sealed.len();
        client::send(
            &client,
            reqwest::Method::PUT,
            &format!("{}/objects/{rel}", site.api),
            &keys.write_key,
            "application/octet-stream",
            Some(sealed),
            &format!("PUT {rel}"),
        )
        .await?;
        stats.objects += 1;
    }
    Ok(stats)
}

#[cfg(test)]
mod tests;
