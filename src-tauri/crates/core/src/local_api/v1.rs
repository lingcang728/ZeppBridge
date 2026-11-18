//! `/v1/records`：按类型和日期区间读记录，游标分页。给拉取方（SparkyFitness、Home
//! Assistant 一类自托管服务）用，契约写在 docs/guides/self-hosted-pull.md。
//!
//! 只读。记录来自 [`crate::records::query_records`]，和 CLI 导出同一个入口。
//! GPS 默认不返回，要 `include_gps=true`（且 `detail=full`）才带运动轨迹。

use super::*;
use crate::models::{ExportDetail, ExportScope};
use crate::records::{self, RecordQuery, DEFAULT_RECORD_TYPES, RECORDS_VERSION};
use base64::Engine as _;
use chrono::{DateTime, NaiveDate, Utc};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::time::Instant;

/// 一次请求的日期区间最多跨多少天（含两端）。更长的区间请拆成多次。
pub const MAX_RANGE_DAYS: i64 = 92;

pub const DEFAULT_PAGE_SIZE: usize = 500;

pub const MAX_PAGE_SIZE: usize = 2000;

/// 活跃翻页共享快照，过期后必须从第一页重新开始。
const CACHE_TTL: Duration = Duration::from_secs(30);
const CACHE_ENTRIES: usize = 4;

const MAX_QUERY_BYTES: usize = 2048;

/// 解析好的 `/v1/records` 查询。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RecordsRequest {
    pub types: Vec<String>,
    pub from: String,
    pub to: String,
    pub since: Option<DateTime<Utc>>,
    pub detail: ExportDetail,
    pub include_gps: bool,
    pub limit: usize,
    pub offset: usize,
    generation: Option<String>,
}

impl RecordsRequest {
    /// 查询本身（不含分页）的指纹。游标里带着它，换了查询条件的旧游标会被拒绝。
    pub fn fingerprint(&self) -> String {
        let mut types = self.types.clone();
        types.sort();
        let text = format!(
            "{}|{}|{}|{}|{}|{}",
            types.join(","),
            self.from,
            self.to,
            self.since
                .map(|value| value.to_rfc3339())
                .unwrap_or_default(),
            if self.detail.is_full() {
                "full"
            } else {
                "summary"
            },
            self.include_gps
        );
        hex::encode(&Sha256::digest(text.as_bytes())[..12])
    }

    fn to_query(&self) -> RecordQuery {
        RecordQuery {
            types: self.types.clone(),
            scope: ExportScope::DateRange {
                start: self.from.clone(),
                end: self.to.clone(),
            },
            since: self.since,
            detail: self.detail,
            include_gps: self.include_gps,
        }
    }
}

/// 查询参数错误：稳定的错误码 + 一句英文说明（拉取方多是英文环境的服务）。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct QueryError {
    pub code: &'static str,
    pub message: String,
}

fn bad(code: &'static str, message: impl Into<String>) -> QueryError {
    QueryError {
        code,
        message: message.into(),
    }
}

pub fn parse_records_query(raw_query: &str) -> Result<RecordsRequest, QueryError> {
    if raw_query.len() > MAX_QUERY_BYTES {
        return Err(bad("invalid_query", "query string is too long"));
    }
    let mut seen: Vec<String> = Vec::new();
    let mut types: Option<String> = None;
    let mut from = None;
    let mut to = None;
    let mut since = None;
    let mut cursor = None;
    let mut limit = None;
    let mut detail = None;
    let mut include_gps = None;
    for pair in raw_query.split('&').filter(|pair| !pair.is_empty()) {
        let (name, value) = pair.split_once('=').unwrap_or((pair, ""));
        let name = percent_decode(name).ok_or_else(|| bad("invalid_query", "bad encoding"))?;
        let value = percent_decode(value)
            .ok_or_else(|| bad("invalid_query", format!("bad encoding in {name}")))?;
        if seen.contains(&name) {
            return Err(bad("invalid_query", format!("{name} must not be repeated")));
        }
        seen.push(name.clone());
        match name.as_str() {
            "types" => types = Some(value),
            "from" => from = Some(value),
            "to" => to = Some(value),
            "since" => since = Some(value),
            "cursor" => cursor = Some(value),
            "limit" => limit = Some(value),
            "detail" => detail = Some(value),
            "include_gps" => include_gps = Some(value),
            other => return Err(bad("invalid_query", format!("unknown parameter {other}"))),
        }
    }

    let (Some(from), Some(to)) = (from, to) else {
        return Err(bad(
            "invalid_range",
            "from and to (YYYY-MM-DD, local days, inclusive) are required",
        ));
    };
    let parse_day = |value: &str| {
        NaiveDate::parse_from_str(value, "%Y-%m-%d")
            .map_err(|_| bad("invalid_range", format!("{value} is not a YYYY-MM-DD date")))
    };
    let (start, end) = (parse_day(&from)?, parse_day(&to)?);
    if end < start {
        return Err(bad("invalid_range", "to is before from"));
    }
    if (end - start).num_days() + 1 > MAX_RANGE_DAYS {
        return Err(bad(
            "range_too_long",
            format!("a request covers at most {MAX_RANGE_DAYS} days; split the range"),
        ));
    }

    let requested: Vec<&str> = match types.as_deref() {
        Some(list) => list.split(',').collect(),
        None => DEFAULT_RECORD_TYPES.to_vec(),
    };
    let types = records::expand_types(requested).map_err(|unknown| {
        bad(
            "invalid_types",
            format!("unknown types: {}", unknown.join(", ")),
        )
    })?;
    if types.is_empty() {
        return Err(bad("invalid_types", "select at least one type"));
    }

    let since = match since {
        Some(value) => Some(
            DateTime::parse_from_rfc3339(&value)
                .map_err(|_| bad("invalid_since", "since must be an RFC 3339 timestamp"))?
                .with_timezone(&Utc),
        ),
        None => None,
    };
    let detail = match detail.as_deref() {
        None | Some("summary") => ExportDetail::Summary,
        Some("full") => ExportDetail::Full,
        Some(_) => return Err(bad("invalid_detail", "detail must be summary or full")),
    };
    let include_gps = match include_gps.as_deref() {
        None | Some("false") | Some("0") => false,
        Some("true") | Some("1") => true,
        Some(_) => return Err(bad("invalid_query", "include_gps must be true or false")),
    };
    let limit = match limit {
        None => DEFAULT_PAGE_SIZE,
        Some(value) => match value.parse::<usize>() {
            Ok(n) if (1..=MAX_PAGE_SIZE).contains(&n) => n,
            _ => {
                return Err(bad(
                    "invalid_limit",
                    format!("limit must be 1-{MAX_PAGE_SIZE}"),
                ))
            }
        },
    };

    let mut request = RecordsRequest {
        types,
        from,
        to,
        since,
        detail,
        include_gps,
        limit,
        offset: 0,
        generation: None,
    };
    if let Some(cursor) = cursor {
        let (offset, generation) = decode_cursor(&cursor, &request.fingerprint())?;
        request.offset = offset;
        request.generation = Some(generation);
    }
    Ok(request)
}

fn encode_cursor(offset: usize, fingerprint: &str, generation: &str) -> String {
    base64::engine::general_purpose::URL_SAFE_NO_PAD
        .encode(format!("v2:{fingerprint}:{offset}:{generation}"))
}

fn decode_cursor(cursor: &str, fingerprint: &str) -> Result<(usize, String), QueryError> {
    let invalid = || {
        bad(
            "invalid_cursor",
            "cursor is malformed or belongs to another query",
        )
    };
    let bytes = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(cursor.trim())
        .map_err(|_| invalid())?;
    let text = String::from_utf8(bytes).map_err(|_| invalid())?;
    let mut parts = text.split(':');
    let version = parts.next();
    if parts.next() != Some(fingerprint) {
        return Err(invalid());
    }
    let offset = parts
        .next()
        .and_then(|offset| offset.parse().ok())
        .ok_or_else(invalid)?;
    match (version, parts.next(), parts.next()) {
        (Some("v1"), None, None) => Ok((offset, String::new())),
        (Some("v2"), Some(generation), None) if !generation.is_empty() => {
            Ok((offset, generation.into()))
        }
        _ => Err(invalid()),
    }
}

fn percent_decode(raw: &str) -> Option<String> {
    let bytes = raw.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        match bytes[index] {
            b'%' => {
                let high = hex_value(*bytes.get(index + 1)?)?;
                let low = hex_value(*bytes.get(index + 2)?)?;
                out.push((high << 4) | low);
                index += 3;
            }
            // 表单编码里 `+` 是空格。时间戳里的 `+00:00` 要写成 `%2B00:00`，或者用 `Z`。
            b'+' => {
                out.push(b' ');
                index += 1;
            }
            byte => {
                out.push(byte);
                index += 1;
            }
        }
    }
    String::from_utf8(out).ok()
}

/// 一次算好的结果：摊平的记录，加上整份导出里给读者的上下文。
#[derive(Debug)]
pub struct Computed {
    pub records: Vec<Value>,
    pub devices: Value,
    pub capabilities: Value,
}

struct CacheEntry {
    fingerprint: String,
    generation: String,
    at: Instant,
    computed: Arc<Computed>,
}

/// A bounded set of snapshots lets independent queries page concurrently.
#[derive(Default)]
pub struct RecordsCache {
    entries: Mutex<std::collections::VecDeque<CacheEntry>>,
}

impl RecordsCache {
    fn get(&self, fingerprint: &str, generation: Option<&str>) -> Option<(Arc<Computed>, String)> {
        let mut entries = self.entries.lock().unwrap_or_else(|e| e.into_inner());
        entries.retain(|entry| entry.at.elapsed() < CACHE_TTL);
        let index = entries.iter().rposition(|entry| {
            entry.fingerprint == fingerprint && generation.is_none_or(|id| id == entry.generation)
        })?;
        let entry = entries.remove(index)?;
        let result = (entry.computed.clone(), entry.generation.clone());
        entries.push_back(entry);
        Some(result)
    }

    fn put(&self, fingerprint: String, computed: Arc<Computed>) -> String {
        let mut entries = self.entries.lock().unwrap_or_else(|e| e.into_inner());
        entries.retain(|entry| entry.at.elapsed() < CACHE_TTL);
        if entries.len() >= CACHE_ENTRIES {
            entries.pop_front();
        }
        let generation = crate::unique_suffix();
        entries.push_back(CacheEntry {
            fingerprint,
            generation: generation.clone(),
            at: Instant::now(),
            computed,
        });
        generation
    }
}

/// 读库并算出整个查询的记录。没有库（还没同步过）就是空列表，不是错误。
pub fn compute_records(data_dir: &Path, request: &RecordsRequest) -> Result<Computed, String> {
    let db_path = data_dir.join("zepp.db");
    if !db_path.exists() {
        return Ok(Computed {
            records: Vec::new(),
            devices: Value::Array(Vec::new()),
            capabilities: Value::Object(Default::default()),
        });
    }
    let db = Database::open_read_only(db_path).map_err(|error| error.to_string())?;
    let set =
        records::query_records(&db, &request.to_query()).map_err(|error| error.to_string())?;
    let devices = set.value.get("devices").cloned().unwrap_or(Value::Null);
    let capabilities = set
        .value
        .get("capabilities")
        .cloned()
        .unwrap_or(Value::Null);
    Ok(Computed {
        records: records::flatten(&set)
            .into_iter()
            .map(|record| record.value)
            .collect(),
        devices,
        capabilities,
    })
}

/// `GET /v1/records?...` 的响应。`compute` 只在缓存没命中时调用。
pub fn records_response<F>(
    raw_query: &str,
    cache: &RecordsCache,
    compute: F,
) -> (HttpResponse, Option<usize>)
where
    F: FnOnce(&RecordsRequest) -> Result<Computed, String>,
{
    let request = match parse_records_query(raw_query) {
        Ok(request) => request,
        Err(error) => return (HttpResponse::bad_request(error.code, &error.message), None),
    };
    let fingerprint = request.fingerprint();
    let (computed, generation) = match cache.get(&fingerprint, request.generation.as_deref()) {
        Some(hit) => hit,
        None if request.generation.is_some() => {
            return (
                HttpResponse::json(
                    409,
                    "Conflict",
                    json!({ "error": {
                        "code": "cursor_expired",
                        "message": "The result snapshot expired. Restart the query without a cursor."
                    }}),
                ),
                None,
            );
        }
        None => match compute(&request) {
            Ok(computed) => {
                let computed = Arc::new(computed);
                let generation = cache.put(fingerprint.clone(), computed.clone());
                (computed, generation)
            }
            Err(error) => {
                // 原因只进本机日志，响应里不带路径或数据库细节。
                eprintln!("local API: reading records failed: {error}");
                return (
                    HttpResponse::json(
                        500,
                        "Internal Server Error",
                        json!({ "error": {
                            "code": "local_data_unavailable",
                            "message": "local data could not be read right now"
                        }}),
                    ),
                    None,
                );
            }
        },
    };
    let total = computed.records.len();
    let start = request.offset.min(total);
    let end = (start + request.limit).min(total);
    let page: Vec<&Value> = computed.records[start..end].iter().collect();
    let next_cursor = (end < total).then(|| encode_cursor(end, &fingerprint, &generation));
    let count = page.len();
    let body = json!({
        "records_version": RECORDS_VERSION,
        "query": {
            "types": request.types,
            "from": request.from,
            "to": request.to,
            "since": request.since.map(|value| value.to_rfc3339()),
            "detail": if request.detail.is_full() { "full" } else { "summary" },
            "include_gps": request.include_gps,
            "timezone": "system_local",
        },
        "count": count,
        "total": total,
        "next_cursor": next_cursor,
        "records": page,
        "devices": computed.devices,
        "capabilities": computed.capabilities,
    });
    (HttpResponse::json(200, "OK", body), Some(count))
}

/// `GET /v1`：接口目录，给人和脚本看有哪些路由与参数。
pub fn v1_index() -> HttpResponse {
    HttpResponse::json(
        200,
        "OK",
        json!({
            "service": "ZeppBridge read-only API",
            "version": env!("CARGO_PKG_VERSION"),
            "records_version": RECORDS_VERSION,
            "authentication": "Authorization: Bearer <token>",
            "endpoints": {
                "records": "/v1/records?from=YYYY-MM-DD&to=YYYY-MM-DD[&types=a,b][&since=RFC3339][&detail=summary|full][&include_gps=true][&limit=N][&cursor=...]",
                "health": "/health"
            },
            "types": DEFAULT_RECORD_TYPES,
            "max_range_days": MAX_RANGE_DAYS,
            "max_page_size": MAX_PAGE_SIZE,
            "gps": "off by default; include_gps=true together with detail=full returns workout routes"
        }),
    )
}
