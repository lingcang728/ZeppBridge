//! 本地 AI 的两个动作（3.1.2）：触发一次云端同步、把一段日子导出成文件。
//!
//! 它们不改用户写的记录，所以不进改动账本。
//!
//! - **同步**和计划任务里的 `zeppbridge-cli sync` 是同一条路径：直接启动旁边那份 CLI，
//!   写锁、同步租约、取消、云端探测全由它管，MCP 不加网络和异步运行时。本地还欠着重解析时
//!   回 `deferred`（让桌面端先把派生数据对齐），不算失败。客户端的工具超时常见是 60 秒，
//!   所以最多等 [`SYNC_WAIT`]，还没完就回 `running`，CLI 自己接着跑完。
//! - **导出**和桌面端、CLI 同一个 builder（`build_ai_export`），只出摘要（没有轨迹），
//!   写进数据目录的 `exports\`，只回相对数据目录的文件名和条数（契约：不返回本机绝对路径）。

use super::*;
use std::process::{Command, Stdio};
use std::time::{Duration as StdDuration, Instant};
use zeppbridge_core::models::{ExportDetail, ExportScope, ExportSelection};

pub(super) const ACTION_TOOLS: [&str; 2] = ["sync_now", "export_data"];

const SYNC_WAIT: StdDuration = StdDuration::from_secs(45);

fn cli_path() -> Option<std::path::PathBuf> {
    let exe = std::env::current_exe().ok()?;
    let path = exe
        .parent()?
        .join(format!("zeppbridge-cli{}", std::env::consts::EXE_SUFFIX));
    path.is_file().then_some(path)
}

/// CLI 的退出码契约（`docs/reference/cli-and-mcp.md`）→ 给 AI 看的状态。
fn sync_state(code: Option<i32>) -> &'static str {
    match code {
        Some(0) => "done",
        Some(3) => "not_configured",
        Some(4) => "busy",
        Some(5) => "cloud_error",
        Some(7) => "schema_mismatch",
        Some(8) => "incomplete",
        _ => "failed",
    }
}

pub(super) fn run_sync(db: &Database) -> Result<Value, CallFailure> {
    if db
        .pending_replay_plan()
        .ok()
        .flatten()
        .is_some_and(|plan| plan.raw_records > 0)
    {
        return Ok(json!({
            "state": "deferred",
            "note": "本机还欠着一次重解析（解析器升级后要把本地报文重算一遍）。请让用户打开一次 ZeppBridge，等它整理完再同步；这不是失败。",
        }));
    }
    let Some(cli) = cli_path() else {
        return Err(CallFailure::coded(
            "err.mcp.cli_missing",
            "这份 zeppbridge-mcp 旁边没有 zeppbridge-cli，无法触发同步。请让用户在 ZeppBridge 里点同步。".into(),
        ));
    };
    let mut command = Command::new(cli);
    command
        .args(["sync", "--json", "--no-reprocess"])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // CREATE_NO_WINDOW：MCP 本身可能挂在没有控制台的 GUI 客户端下，别弹黑框。
        command.creation_flags(0x0800_0000);
    }
    let mut child = command
        .spawn()
        .map_err(|error| CallFailure::plain(format!("启动 zeppbridge-cli 失败：{error}")))?;
    let started = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                let mut out = String::new();
                if let Some(mut stdout) = child.stdout.take() {
                    use std::io::Read;
                    let _ = stdout.read_to_string(&mut out);
                }
                let report: Value = serde_json::from_str(out.trim()).unwrap_or(Value::Null);
                return Ok(json!({
                    "state": sync_state(status.code()),
                    "exitCode": status.code(),
                    "report": report,
                    "note": "同步拉的是云端已有的数据；手表还没把数据传到 Zepp App 时，云端没有新东西是正常的。",
                }));
            }
            Ok(None) if started.elapsed() < SYNC_WAIT => {
                std::thread::sleep(StdDuration::from_millis(250));
            }
            Ok(None) => {
                // 不杀它：CLI 自己会跑完。之后用 get_data_health 看最近一次同步。
                return Ok(json!({
                    "state": "running",
                    "note": "同步还在后台进行（大段历史可能要几分钟）。稍后用 get_data_health 看最近一次同步的时间和结果，不要重复触发。",
                }));
            }
            Err(error) => {
                return Err(CallFailure::plain(format!("等待同步结果失败：{error}")));
            }
        }
    }
}

pub(super) fn run_export(db: &Database, args: &Value) -> Result<Value, CallFailure> {
    let (start, end) = match date_args(args).map_err(CallFailure::plain)? {
        (Some(start), Some(end)) => (start, end),
        _ => {
            return Err(CallFailure::plain(
                "startDate 和 endDate 都要给（YYYY-MM-DD，最多 366 天）",
            ))
        }
    };
    let start = start.format("%Y-%m-%d").to_string();
    let end = end.format("%Y-%m-%d").to_string();
    let scope = ExportScope::date_range(&start, &end)
        .validated()
        .map_err(CallFailure::plain)?;
    let types: Vec<String> = match args.get("types") {
        None | Some(Value::Null) => ["workouts", "daily_activity", "sleep"]
            .map(str::to_string)
            .to_vec(),
        Some(Value::Array(items)) => items
            .iter()
            .filter_map(Value::as_str)
            .map(str::to_ascii_lowercase)
            .collect(),
        Some(_) => return Err(CallFailure::plain("types 是数据类型的数组")),
    };
    let unknown: Vec<&str> = types
        .iter()
        .map(String::as_str)
        .filter(|kind| !zeppbridge_core::storage::EXPORT_DATA_TYPES.contains(kind))
        .collect();
    if types.is_empty() || !unknown.is_empty() {
        return Err(CallFailure::plain(format!(
            "types 只能从这些里选：{}",
            zeppbridge_core::storage::EXPORT_DATA_TYPES.join(", ")
        )));
    }
    let selection = ExportSelection {
        scope: Some(scope),
        start_date: None,
        end_date: None,
        data_types: types.clone(),
        detail: ExportDetail::Summary,
    };
    let (text, records) = db
        .build_ai_export(&selection)
        .map_err(|error| CallFailure::coded(error.code(), error.user_message()))?;
    let dir = db
        .data_dir()
        .ok_or_else(|| CallFailure::plain("找不到本机数据目录，无法写出导出文件。"))?
        .join("exports");
    std::fs::create_dir_all(&dir)
        .map_err(|error| CallFailure::plain(format!("无法创建导出目录：{error}")))?;
    let stamp = Local::now().format("%Y%m%d-%H%M%S");
    let name = format!("zeppbridge-{start}_{end}-{stamp}.json");
    paths::write_file_atomically(&dir.join(&name), text.as_bytes())
        .map_err(|error| CallFailure::plain(format!("写出导出文件失败：{error}")))?;
    // 契约：不返回本机绝对路径。只给数据目录里的相对位置，用户在桌面端打开数据目录就能看到。
    Ok(json!({
        "file": format!("exports/{name}"),
        "records": records,
        "bytes": text.len(),
        "types": types,
        "range": { "start": start, "end": end },
        "note": "文件在用户本机 ZeppBridge 数据目录的 exports 文件夹里（桌面端设置里能打开数据目录）。这是摘要导出（不含运动轨迹）。要具体数据请直接用读工具，不必读这个文件。",
    }))
}
