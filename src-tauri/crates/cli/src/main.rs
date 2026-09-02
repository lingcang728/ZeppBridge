//! ZeppBridge 命令行。
//!
//! 存在的理由只有一个：让同步和导出可以被 Task Scheduler、cron 或者别的
//! agent 调起来，而不必开着桌面窗口。因此全程无交互——不会提问、不会等按键、
//! 不会弹窗；所有需要人来决定的事情（登录、授权、删数据）都不在这里做。
//!
//! 三条硬性约定：
//!
//! * **退出码是契约**。调度器只看退出码，所以 `busy`（另一个进程在写）
//!   和 `failed`（真的出错了）必须是两个不同的码，否则重试逻辑没法写。
//! * **`--json` 的输出可被解析**。人读的提示走 stderr，机器读的 JSON 独占
//!   stdout，中间不夹杂进度行。
//! * **写库一律走跨进程写锁**。桌面应用开着的时候跑 `sync`，这里会拿不到锁
//!   并以 `EXIT_BUSY` 退出，而不是和 GUI 抢着写同一个库。

use std::collections::BTreeMap;
use std::path::Path;
use std::process::ExitCode;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use std::time::{Duration, Instant};

use zeppbridge_core::auth::AuthManager;
use zeppbridge_core::connectors::ZeppConnector;
use zeppbridge_core::contract;
use zeppbridge_core::export_fit;
use zeppbridge_core::export_formats;
use zeppbridge_core::fetcher::DataFetcher;
use zeppbridge_core::models::{error::ZeppBridgeError, ExportDetail, ExportScope, ExportSelection};
use zeppbridge_core::paths;
use zeppbridge_core::storage::write_lock::{self, WriteLockError, WritePurpose};
use zeppbridge_core::storage::{Database, ReplayPlan, NORMALIZER_REVISION};
use zeppbridge_core::sync::{SyncManager, SyncReport};

const VERSION: &str = env!("CARGO_PKG_VERSION");

/* --------------------------- 退出码契约 ---------------------------
 * 这几个数字是对调度脚本的承诺，只能新增，不能改含义。 */

/// 一切正常。
const EXIT_OK: u8 = 0;
/// 命令本身写错了（未知子命令、缺参数、参数非法）。
const EXIT_USAGE: u8 = 2;
/// 还没有连接 Zepp 账号，或者凭据已失效。需要人去桌面应用里重新登录。
const EXIT_NOT_CONFIGURED: u8 = 3;
/// 另一个 ZeppBridge 进程正在写库。稍后重试即可，不是错误。
const EXIT_BUSY: u8 = 4;
/// 云端请求失败（网络、鉴权、限流）。
const EXIT_CLOUD: u8 = 5;
/// 本机数据库出问题。
const EXIT_DATABASE: u8 = 6;
/// 本机数据库的 schema 版本和这个程序对不上。需要先升级其中一边。
const EXIT_SCHEMA: u8 = 7;
/// 其他失败。
const EXIT_FAILED: u8 = 1;

const HELP: &str = "\
zeppbridge-cli —— ZeppBridge 的无交互命令行入口

用法:
  zeppbridge-cli <命令> [选项]

命令:
  status              打印本机数据库与账号状态（不联网）
  sync                从 Zepp 云端同步到本机 SQLite
  reprocess           用当前解析器重放本地原始报文（不联网）
  export              把本机数据导出为 JSON / CSV / GPX
  contract            打印只读读取契约（单位、时区、来源、缺失值）
  version             打印版本
  help                打印本帮助

sync 选项:
  --mode <incremental|initial|history>   默认 incremental
  --days <N>                             仅 history 模式；1–3650
  --no-reprocess                         跳过同步前的解析器重放
  --json                                 输出机器可读的同步报告

reprocess 选项:
  --all                     重放全部报文，而不是只补解析器升级欠下的那些
  --json                    输出机器可读的重放报告

export 选项:
  --format <json|csv|gpx|fit>  默认 json；fit 需要 --out 指向一个目录
  --from <YYYY-MM-DD>       与 --to 成对使用
  --to <YYYY-MM-DD>
  --workout <id>            导出单条运动；与 --from/--to 互斥
  --types <a,b,c>           默认 workouts,daily,sleep
  --detail <summary|full>   默认 summary
  --out <文件路径>          默认写到 stdout

通用选项:
  --json                    机器可读输出走 stdout，人读的提示走 stderr

退出码:
  0 成功   1 失败   2 用法错误   3 未连接账号   4 另有进程在写库
  5 云端请求失败   6 本机数据库错误   7 数据库版本与本程序不匹配

解析器升级:
  解析器规则改版后（新的运动编号、睡眠阶段修正、全天压力曲线等），已经存在
  本机的历史记录仍然是旧规则产出的，要重放一次才会跟上。桌面应用在启动时自动
  做这件事；无头环境没有那次启动，所以：`sync` 会在同步前自动补上（可用
  --no-reprocess 关掉），`status` 只提示不执行，`reprocess` 是随时可以手动跑的
  那一条。重放不联网，也不会改写「上次云端同步」的时间。

隐私:
  只读写本机数据目录，不监听任何端口，不打印 token、Cookie 或完整账号。
";

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let code = run(&args);
    ExitCode::from(code)
}

fn run(args: &[String]) -> u8 {
    let Some(command) = args.first().map(String::as_str) else {
        eprint!("{HELP}");
        return EXIT_USAGE;
    };
    let rest = &args[1..];
    match command {
        "help" | "--help" | "-h" => {
            print!("{HELP}");
            EXIT_OK
        }
        "version" | "--version" | "-V" => {
            println!("zeppbridge-cli {VERSION}");
            EXIT_OK
        }
        "contract" => {
            print_contract();
            EXIT_OK
        }
        "status" => cmd_status(rest),
        "sync" => cmd_sync(rest),
        "reprocess" => cmd_reprocess(rest),
        "export" => cmd_export(rest),
        other => {
            eprintln!("未知命令：{other}\n");
            eprint!("{HELP}");
            EXIT_USAGE
        }
    }
}

/* ------------------------------ 参数解析 ------------------------------
 * 手写而不是引入 clap：三个子命令十来个开关，换来的是零新增依赖和
 * 完全可控的退出码与帮助文案。 */

struct Flags {
    values: Vec<(String, Option<String>)>,
}

impl Flags {
    fn parse(args: &[String]) -> Result<Self, String> {
        let mut values = Vec::new();
        let mut index = 0;
        while index < args.len() {
            let arg = &args[index];
            let Some(name) = arg.strip_prefix("--") else {
                return Err(format!("多余的参数：{arg}"));
            };
            if let Some((key, value)) = name.split_once('=') {
                values.push((key.to_string(), Some(value.to_string())));
                index += 1;
                continue;
            }
            let next = args.get(index + 1);
            match next {
                Some(value) if !value.starts_with("--") => {
                    values.push((name.to_string(), Some(value.clone())));
                    index += 2;
                }
                _ => {
                    values.push((name.to_string(), None));
                    index += 1;
                }
            }
        }
        Ok(Self { values })
    }

    fn get(&self, key: &str) -> Option<&str> {
        self.values
            .iter()
            .find(|(name, _)| name == key)
            .and_then(|(_, value)| value.as_deref())
    }

    fn has(&self, key: &str) -> bool {
        self.values.iter().any(|(name, _)| name == key)
    }

    /// 未知开关一律报错。静默忽略拼错的开关，会让 `--form json` 悄悄跑出
    /// 一个默认格式的结果，而调度脚本毫无察觉。
    fn reject_unknown(&self, known: &[&str]) -> Result<(), String> {
        for (name, _) in &self.values {
            if !known.contains(&name.as_str()) {
                return Err(format!("未知选项：--{name}"));
            }
        }
        Ok(())
    }
}

/* ------------------------------ 输出 ------------------------------ */

fn emit(json_mode: bool, value: serde_json::Value, human: &str) {
    if json_mode {
        println!(
            "{}",
            serde_json::to_string_pretty(&value).unwrap_or_else(|_| "{}".into())
        );
    } else {
        println!("{human}");
    }
}

fn fail(json_mode: bool, code: u8, kind: &str, message: &str) -> u8 {
    if json_mode {
        println!(
            "{}",
            serde_json::json!({ "ok": false, "errorKind": kind, "message": message })
        );
    } else {
        eprintln!("{message}");
    }
    code
}

fn print_contract() {
    println!(
        "{}",
        serde_json::to_string_pretty(&serde_json::json!({
            "contractVersion": contract::CONTRACT_VERSION,
            "time": contract::TIME_CONVENTION,
            "missingValues": contract::MISSING_VALUE_CONVENTION,
            "source": contract::SOURCE_CONVENTION,
            "privacy": contract::PRIVACY_NOTE,
            "metrics": contract::METRICS.iter().map(|item| serde_json::json!({
                "metric": item.metric,
                "unit": item.unit,
                "description": item.description,
            })).collect::<Vec<_>>(),
        }))
        .unwrap_or_default()
    );
}

/// 把 core 的错误映射到退出码。
///
/// 分类是为了让调度脚本能写出「busy 就等五分钟重试，云端失败就退避，
/// 数据库错误就报警」这种逻辑，而不是对着同一个 1 猜。
fn exit_code_for(error: &ZeppBridgeError) -> (u8, &'static str) {
    match error {
        ZeppBridgeError::AuthError(_) | ZeppBridgeError::NeedsReauth(_) => {
            (EXIT_NOT_CONFIGURED, "auth")
        }
        ZeppBridgeError::NetworkError(_)
        | ZeppBridgeError::RetryExhausted { .. }
        | ZeppBridgeError::HttpStatus { .. }
        | ZeppBridgeError::Unavailable(_)
        | ZeppBridgeError::DataUnavailable(_) => (EXIT_CLOUD, "cloud"),
        ZeppBridgeError::Busy(_) => (EXIT_BUSY, "busy"),
        ZeppBridgeError::DatabaseError(_) => (EXIT_DATABASE, "database"),
        ZeppBridgeError::ConfigError(_) | ZeppBridgeError::InvalidHost(_) => (EXIT_USAGE, "usage"),
        _ => (EXIT_FAILED, "failed"),
    }
}

/// 退出码对应的机器可读错误类型，供 `--json` 输出使用。
fn error_kind_for(code: u8) -> &'static str {
    match code {
        EXIT_NOT_CONFIGURED => "not_configured",
        EXIT_BUSY => "busy",
        EXIT_CLOUD => "cloud",
        EXIT_DATABASE => "database",
        EXIT_SCHEMA => "schema_mismatch",
        EXIT_USAGE => "usage",
        _ => "failed",
    }
}

/* ------------------------------ 公共装配 ------------------------------ */

fn data_dir() -> Result<std::path::PathBuf, String> {
    paths::resolve_data_dir().map_err(|error| format!("无法确定数据目录：{error}"))
}

fn open_read_only() -> Result<Database, (u8, String)> {
    let dir = data_dir().map_err(|message| (EXIT_FAILED, message))?;
    let db_path = dir.join("zepp.db");
    if !db_path.exists() {
        return Err((
            EXIT_NOT_CONFIGURED,
            "本机还没有数据库。请先在 ZeppBridge 桌面应用里连接账号并同步一次。".into(),
        ));
    }
    // 只读连接：CLI 的查询路径不拿写锁，也就不会在一次长同步期间被挡住。
    Database::open_read_only(db_path).map_err(|error| match error {
        // schema 对不上是「先去升级」，不是「数据库坏了」。两种情况给调度
        // 脚本的应对完全不同，所以退出码必须分开。
        ZeppBridgeError::ConfigError(message) => (EXIT_SCHEMA, message),
        other => {
            let (code, _) = exit_code_for(&other);
            (code, other.user_message())
        }
    })
}

/* ---------------------------- 解析器重放 ----------------------------
 * 解析器每升一版，本机历史都要重放一遍才跟得上：新的运动编号只对重放过的
 * 记录生效，此前存成 `unknown:211` 的那些不会自己变。桌面应用在启动的后台
 * 线程里做这件事，而无头用户按定义永远不会启动桌面应用——于是他们的历史
 * 会永远停在第一次同步时那一版规则上，升级看起来却是成功的。
 *
 * 这里的分工是刻意的：
 *
 * * `sync` 在同步前自动补上。它是无头环境里唯一一条本来就长、本来就写库、
 *   本来就挂在定时器上的命令，把重放放进去，用户什么都不用做。
 * * `status`、`export` 只提示，绝不执行。一条本该秒回的命令突然跑上几分钟，
 *   比它报出旧数据更糟。
 * * `reprocess` 是显式入口：想现在就做、或者想整库重来的人跑它。
 *
 * 打开数据库时不做重放，理由同上——那会让**每一条**命令都可能突然停几分钟。 */

/// 一次重放的结果，供两个调用方拼各自的输出。
struct ReplayOutcome {
    from_revision: Option<String>,
    raw_records: i64,
    streams: BTreeMap<String, i64>,
    elapsed: Duration,
}

impl ReplayOutcome {
    fn total_records(&self) -> i64 {
        self.streams.values().sum()
    }

    fn to_json(&self) -> serde_json::Value {
        serde_json::json!({
            "fromRevision": self.from_revision,
            "toRevision": NORMALIZER_REVISION,
            "rawRecords": self.raw_records,
            "streams": self.streams,
            "totalRecords": self.total_records(),
            "elapsedSeconds": (self.elapsed.as_millis() as f64) / 1000.0,
        })
    }

    fn human(&self) -> String {
        format!(
            "已用当前解析器重放本地报文 {} 条，得到 {} 条派生记录，用时 {:.1} 秒",
            self.raw_records,
            self.total_records(),
            self.elapsed.as_secs_f64()
        )
    }
}

/// 重放前把要做的事说出来。几分钟的静默和卡死在终端里长得一模一样。
fn announce_replay(plan: &ReplayPlan) {
    let scope = if plan.streams.is_empty() {
        "全部流".to_string()
    } else {
        plan.streams.join("、")
    };
    // `--all` 可以在修订号没变的时候跑。那时候说「已从 X 升到 X」是句假话，
    // 用户会以为自己刚错过了一次升级。
    let reason = if plan.stored_revision.as_deref() == Some(plan.target_revision.as_str()) {
        format!("正在按当前解析器（{}）重放", plan.target_revision)
    } else {
        format!(
            "解析器已从 {} 升到 {}，正在重放",
            plan.stored_revision.as_deref().unwrap_or("更早的版本"),
            plan.target_revision
        )
    };
    eprintln!(
        "{reason}本机 {} 条原始报文（{scope}）。不联网，请勿中断。",
        plan.raw_records
    );
}

/// 执行一次重放，全程持有跨进程写锁。
///
/// 锁在这里取、在这里放：同步自己还要再取一次同一把锁，嵌套会死锁。
///
/// 返回 `None` = 拿到锁的时候已经没事可做了。等锁的这二十秒里，桌面应用或者
/// 另一个 `zeppbridge-cli` 完全可能刚把同一次重放做完；那时候报一句「已重放
/// N 条报文，得到 0 条派生记录」，是在拿一个自相矛盾的数字糊弄人。
fn run_replay(
    dir: &Path,
    db: &Database,
    plan: &ReplayPlan,
    force_all: bool,
) -> Result<Option<ReplayOutcome>, (u8, &'static str, String)> {
    // 重放重写全部派生数据，必须和同步、迁移、恢复互斥。等 20 秒，等不到
    // 就报 busy 而不是失败——调度脚本据此重试，不该为此报警。
    let _guard =
        write_lock::acquire_with_timeout(dir, WritePurpose::Reprocess, Duration::from_secs(20))
            .map_err(|error| {
                let code = write_lock_exit(&error);
                (code, error_kind_for(code), error.to_string())
            })?;
    let started = Instant::now();
    let streams = if force_all {
        let streams = db
            .reprocess_raw_records()
            .map_err(|error| replay_failure(&error))?;
        // 手动重新解析记在自己的时间线上，云端同步时间原样不动。
        db.record_local_replay(true)
            .map_err(|error| replay_failure(&error))?;
        Some(streams)
    } else {
        db.reprocess_raw_records_if_needed()
            .map_err(|error| replay_failure(&error))?
    };
    Ok(streams.map(|streams| ReplayOutcome {
        from_revision: plan.stored_revision.clone(),
        raw_records: plan.raw_records,
        streams,
        elapsed: started.elapsed(),
    }))
}

fn replay_failure(error: &ZeppBridgeError) -> (u8, &'static str, String) {
    let (code, kind) = exit_code_for(error);
    (code, kind, error.user_message())
}

/// 只读地问一句「这个库欠不欠重放」，欠就给一句提示。
///
/// 一次 SELECT，短命令加得起。它绝不代替重放：说出来和自作主张跑上四分钟
/// 是两回事。
fn pending_replay_notice(plan: Option<&ReplayPlan>) -> Option<String> {
    let plan = plan?;
    if plan.raw_records == 0 {
        return None;
    }
    Some(format!(
        "本机派生数据还是 {} 产出的，当前解析器是 {}；{} 条历史报文需要重放。跑 `zeppbridge-cli reprocess`，或者等下一次 sync 自动补上。",
        plan.stored_revision.as_deref().unwrap_or("更早的版本"),
        plan.target_revision,
        plan.raw_records
    ))
}

/// 打开一条可写连接，顺带完成 schema 迁移。
///
/// 无头环境没有「先启动一次桌面应用」这一步，迁移只能发生在这里。
fn open_writable() -> Result<(std::path::PathBuf, Database), (u8, String)> {
    let dir = data_dir().map_err(|message| (EXIT_FAILED, message))?;
    let db_path = dir.join("zepp.db");
    if !db_path.exists() {
        return Err((
            EXIT_NOT_CONFIGURED,
            "本机还没有数据库。请先在 ZeppBridge 桌面应用里连接账号并同步一次。".into(),
        ));
    }
    let db = Database::open_migrated(&db_path).map_err(|error| {
        let (code, _) = exit_code_for(&error);
        (code, error.user_message())
    })?;
    Ok((dir, db))
}

/* ---------------------------- reprocess ---------------------------- */

fn cmd_reprocess(args: &[String]) -> u8 {
    let flags = match Flags::parse(args) {
        Ok(flags) => flags,
        Err(message) => return fail(false, EXIT_USAGE, "usage", &message),
    };
    if let Err(message) = flags.reject_unknown(&["json", "all"]) {
        return fail(false, EXIT_USAGE, "usage", &message);
    }
    let json_mode = flags.has("json");
    let force_all = flags.has("all");

    let (dir, db) = match open_writable() {
        Ok(value) => value,
        Err((code, message)) => return fail(json_mode, code, error_kind_for(code), &message),
    };
    let plan = match db.pending_replay_plan() {
        Ok(plan) => plan,
        Err(error) => {
            let (code, kind) = exit_code_for(&error);
            return fail(json_mode, code, kind, &error.user_message());
        }
    };

    // 不加 --all 时，修订号已经对上就什么都不做。这条命令要能安全地写进
    // 定时任务：每小时跑一次不该每小时重放一次整个库。
    if plan.is_none() && !force_all {
        emit(
            json_mode,
            serde_json::json!({
                "ok": true,
                "replayed": false,
                "reason": "up_to_date",
                "revision": NORMALIZER_REVISION,
            }),
            &format!("本机派生数据已经是当前解析器（{NORMALIZER_REVISION}）产出的，无需重放"),
        );
        return EXIT_OK;
    }

    // --all 时也要有一份计划：报告里要说清楚从哪一版来、过了多少条报文。
    let plan = plan.unwrap_or_else(|| ReplayPlan {
        stored_revision: Some(NORMALIZER_REVISION.to_string()),
        target_revision: NORMALIZER_REVISION.to_string(),
        streams: Vec::new(),
        raw_records: 0,
    });
    let effective = if force_all {
        let mut forced = plan.clone();
        forced.streams = Vec::new();
        forced.raw_records = match db.raw_record_count() {
            Ok(count) => count,
            Err(error) => {
                let (code, kind) = exit_code_for(&error);
                return fail(json_mode, code, kind, &error.user_message());
            }
        };
        forced
    } else {
        plan
    };
    announce_replay(&effective);

    match run_replay(&dir, &db, &effective, force_all) {
        Ok(Some(outcome)) => {
            let mut payload = outcome.to_json();
            payload["ok"] = serde_json::Value::Bool(true);
            payload["replayed"] = serde_json::Value::Bool(true);
            payload["reason"] = serde_json::Value::String(
                if force_all {
                    "forced"
                } else {
                    "revision_changed"
                }
                .into(),
            );
            emit(json_mode, payload, &outcome.human());
            EXIT_OK
        }
        Ok(None) => {
            emit(
                json_mode,
                serde_json::json!({
                    "ok": true,
                    "replayed": false,
                    "reason": "already_done",
                    "revision": NORMALIZER_REVISION,
                }),
                "等写锁的这段时间里，另一个 ZeppBridge 已经把这次重放做完了",
            );
            EXIT_OK
        }
        Err((code, kind, message)) => fail(json_mode, code, kind, &message),
    }
}

/* ------------------------------ status ------------------------------ */

fn cmd_status(args: &[String]) -> u8 {
    let flags = match Flags::parse(args) {
        Ok(flags) => flags,
        Err(message) => return fail(false, EXIT_USAGE, "usage", &message),
    };
    if let Err(message) = flags.reject_unknown(&["json"]) {
        return fail(false, EXIT_USAGE, "usage", &message);
    }
    let json_mode = flags.has("json");

    let dir = match data_dir() {
        Ok(dir) => dir,
        Err(message) => return fail(json_mode, EXIT_FAILED, "failed", &message),
    };
    let auth_status = AuthManager::new(dir.clone()).status();
    let connected = auth_status
        .as_ref()
        .map(|status| status.configured)
        .unwrap_or(false);

    let db = match open_read_only() {
        Ok(db) => db,
        Err((code, message)) => {
            // 没有库也要能打印出原因，否则调度脚本连状态都查不到。
            return fail(json_mode, code, error_kind_for(code), &message);
        }
    };

    let database_bytes = std::fs::metadata(dir.join("zepp.db"))
        .map(|meta| meta.len())
        .unwrap_or(0);
    let health = match db.data_health(30, database_bytes) {
        Ok(health) => health,
        Err(error) => {
            let (code, kind) = exit_code_for(&error);
            return fail(json_mode, code, kind, &error.user_message());
        }
    };
    // 只读的一问：这个库欠不欠一次重放。status 说出来，但绝不代跑——
    // 一条调度脚本每分钟都在调的命令，不能因为解析器升级就突然跑四分钟。
    let replay_plan = db.pending_replay_plan().ok().flatten();
    let replay_notice = pending_replay_notice(replay_plan.as_ref());
    let ledger = db.coverage_ledger().ok();
    let workouts = db.get_recent_workouts(1).unwrap_or_default();
    // 「本机有多少历史」是所有出口都要能回答的问题，不只是桌面应用：
    // 一个调度脚本同样需要在导出半年之前知道本机是不是只有 30 天。
    let coverage = db.local_coverage().unwrap_or_default();

    let payload = serde_json::json!({
        "ok": true,
        "version": VERSION,
        "connected": connected,
        "databaseBytes": database_bytes,
        "schemaVersion": health.database.schema_version,
        // 库里实际记着的修订号，不是这个程序自己的常量。两者可以不相等，
        // 而不相等正是这里唯一值得报告的事。
        "normalizerRevision": health.database.stored_normalizer_revision,
        "normalizerRevisionExpected": NORMALIZER_REVISION,
        "normalizerReplayPending": health.database.normalizer_replay_pending,
        "normalizerReplayRawRecords": replay_plan
            .as_ref()
            .map(|plan| plan.raw_records)
            .unwrap_or(0),
        "lastCloudSyncAt": health.timings.last_cloud_sync_at,
        "latestWorkoutAt": workouts.first().map(|workout| workout.start_time.to_rfc3339()),
        "streams": health.streams.iter().map(|stream| serde_json::json!({
            "stream": stream.stream,
            "fetch": stream.fetch.state,
            "parse": stream.parse.state,
            "write": stream.write.state,
            "rawRecords": stream.raw_records,
            "canonicalRecords": stream.canonical_records,
        })).collect::<Vec<_>>(),
        "historyPlanned": ledger.as_ref().map(|value| value.total_chunks > 0),
        "historyComplete": ledger.as_ref().map(|value| value.complete),
        "historyPendingChunks": ledger
            .as_ref()
            .map(|value| value.total_chunks - value.completed_chunks),
        "coverageEarliestDay": coverage.earliest_day,
        "coverageLatestDay": coverage.latest_day,
        "coverageDays": coverage.covered_days,
    });

    let human = format!(
        "ZeppBridge {VERSION}\n账号：{}\n数据库：{} 字节，schema v{}\n本机覆盖：{}\n上次云端同步：{}\n历史账本：{}{}",
        if connected { "已连接" } else { "未连接" },
        database_bytes,
        health.database.schema_version,
        // JSON 里早就有这三个字段，纯文本却漏了一行——同一个命令的两种
        // 输出对「本机有多少历史」给出不同的答案，是这个项目最不该出现的事。
        match coverage.earliest_day.as_deref() {
            Some(day) => format!("{} 天，最早 {}", coverage.covered_days, day),
            None => "本机还没有任何数据".to_string(),
        },
        health
            .timings
            .last_cloud_sync_at
            .as_deref()
            .unwrap_or("从未"),
        // 「一块都没排过」和「排了还没做完」不是一回事。前者不是进度落后，
        // 是根本还没开始规划补拉。
        match ledger.as_ref() {
            Some(value) if value.total_chunks == 0 => "尚未规划补拉".to_string(),
            Some(value) if value.complete => "每个月份块都有结论".to_string(),
            Some(value) => format!(
                "还有 {} 个月份块没有结论",
                value.total_chunks - value.completed_chunks
            ),
            None => "读不到账本".to_string(),
        },
        match replay_notice.as_deref() {
            Some(notice) => format!("\n解析器：{notice}"),
            None => String::new(),
        }
    );
    emit(json_mode, payload, &human);
    EXIT_OK
}

/* ------------------------------ sync ------------------------------ */

fn cmd_sync(args: &[String]) -> u8 {
    let flags = match Flags::parse(args) {
        Ok(flags) => flags,
        Err(message) => return fail(false, EXIT_USAGE, "usage", &message),
    };
    if let Err(message) = flags.reject_unknown(&["json", "mode", "days", "no-reprocess"]) {
        return fail(false, EXIT_USAGE, "usage", &message);
    }
    let json_mode = flags.has("json");
    let mode = flags.get("mode").unwrap_or("incremental");
    if !matches!(mode, "incremental" | "initial" | "history") {
        return fail(
            json_mode,
            EXIT_USAGE,
            "usage",
            "--mode 只能是 incremental、initial 或 history",
        );
    }
    let days = match flags.get("days") {
        Some(raw) => match raw.parse::<i64>() {
            Ok(value) if (1..=3650).contains(&value) => Some(value),
            _ => return fail(json_mode, EXIT_USAGE, "usage", "--days 必须是 1 到 3650"),
        },
        None => None,
    };
    if mode != "history" && days.is_some() {
        return fail(
            json_mode,
            EXIT_USAGE,
            "usage",
            "--days 只在 --mode history 下有意义",
        );
    }

    let dir = match data_dir() {
        Ok(dir) => dir,
        Err(message) => return fail(json_mode, EXIT_FAILED, "failed", &message),
    };
    let auth = match AuthManager::new(dir.clone()).load_auth() {
        Ok(Some(auth)) => auth,
        Ok(None) => {
            return fail(
                json_mode,
                EXIT_NOT_CONFIGURED,
                "not_configured",
                "还没有连接 Zepp 账号。请先在桌面应用里登录——命令行不做登录。",
            )
        }
        Err(error) => {
            let (code, kind) = exit_code_for(&error);
            return fail(json_mode, code, kind, &error.user_message());
        }
    };

    let cancel = Arc::new(AtomicBool::new(false));
    let connector = match ZeppConnector::with_cancel(auth, cancel.clone()) {
        Ok(connector) => connector,
        Err(error) => {
            let (code, kind) = exit_code_for(&error);
            return fail(json_mode, code, kind, &error.user_message());
        }
    };
    let db = match Database::open_migrated(&dir.join("zepp.db")) {
        Ok(db) => db,
        Err(error) => {
            let (code, kind) = exit_code_for(&error);
            return fail(json_mode, code, kind, &error.user_message());
        }
    };

    // 解析器升级欠下的重放在这里补。这是无头环境里唯一一条本来就长、本来
    // 就写库、本来就挂在定时器上的命令——把它放在这儿，用户什么都不用做，
    // 而 `status` 那种秒回的命令一秒都不会变慢。
    //
    // 必须在同步之前、并且在同步取写锁之前做完：`sync_report` 自己还要取
    // 同一把跨进程写锁，套在一起就是死锁。
    let replay = if flags.has("no-reprocess") {
        None
    } else {
        match db.pending_replay_plan() {
            Ok(Some(plan)) if plan.raw_records > 0 => {
                announce_replay(&plan);
                match run_replay(&dir, &db, &plan, false) {
                    Ok(Some(outcome)) => {
                        eprintln!("{}", outcome.human());
                        Some(outcome)
                    }
                    Ok(None) => None,
                    // 重放失败不该连累同步：拉新数据仍然是有意义的，历史
                    // 记录晚一轮再对齐也比这次什么都不做强。说出来即可。
                    Err((_, _, message)) => {
                        eprintln!("本地报文重放失败，继续同步：{message}");
                        None
                    }
                }
            }
            Ok(_) => None,
            Err(error) => {
                eprintln!("读不到解析器修订号，跳过重放：{}", error.user_message());
                None
            }
        }
    };

    let manager =
        SyncManager::new(DataFetcher::new(connector), db, cancel).with_data_dir(dir.clone());

    let runtime = match tokio::runtime::Runtime::new() {
        Ok(runtime) => runtime,
        Err(error) => {
            return fail(
                json_mode,
                EXIT_FAILED,
                "failed",
                &format!("无法启动异步运行时：{error}"),
            )
        }
    };
    let result: Result<SyncReport, ZeppBridgeError> = runtime.block_on(async {
        match mode {
            "initial" => manager.initial_sync_report().await,
            "history" => manager.history_sync_report(days.unwrap_or(180)).await,
            _ => manager.incremental_sync_report().await,
        }
    });

    match result {
        Ok(report) => {
            let payload = serde_json::json!({
                "ok": true,
                "mode": mode,
                "success": report.success,
                "recordsWritten": report.records_written,
                "message": report.message,
                // 同步前有没有补过重放。null = 没做（不欠，或者 --no-reprocess）。
                // 调度脚本据此知道这一轮为什么跑了十分钟。
                "replay": replay.as_ref().map(ReplayOutcome::to_json),
                "streams": report.streams.iter().map(|stream| serde_json::json!({
                    "stream": stream.stream,
                    "status": stream.status,
                    "recordsWritten": stream.records_written,
                    "rawRecords": stream.raw_records,
                    "message": stream.message,
                })).collect::<Vec<_>>(),
            });
            let human = format!(
                "同步{}：写入 {} 条。{}",
                if report.success {
                    "完成"
                } else {
                    "部分失败"
                },
                report.records_written,
                report.message.as_deref().unwrap_or("")
            );
            emit(json_mode, payload, &human);
            EXIT_OK
        }
        Err(error) => {
            // 写锁冲突不是失败：桌面应用正开着同步，调度脚本稍后重试即可。
            // 靠类型判断，不靠匹配错误文案——文案是会改的。
            let (code, kind) = exit_code_for(&error);
            fail(json_mode, code, kind, &error.user_message())
        }
    }
}

/* ------------------------------ export ------------------------------ */

fn cmd_export(args: &[String]) -> u8 {
    let flags = match Flags::parse(args) {
        Ok(flags) => flags,
        Err(message) => return fail(false, EXIT_USAGE, "usage", &message),
    };
    if let Err(message) = flags.reject_unknown(&[
        "json", "format", "from", "to", "workout", "types", "detail", "out",
    ]) {
        return fail(false, EXIT_USAGE, "usage", &message);
    }
    let json_mode = flags.has("json");
    let format = flags.get("format").unwrap_or("json");
    if !matches!(format, "json" | "csv" | "gpx" | "fit") {
        return fail(
            json_mode,
            EXIT_USAGE,
            "usage",
            "--format 只能是 json、csv、gpx 或 fit",
        );
    }

    // 范围互斥：同时给日期和单条运动是矛盾请求，不定优先级，直接报错。
    let scope = match (flags.get("from"), flags.get("to"), flags.get("workout")) {
        (Some(_), _, Some(_)) | (_, Some(_), Some(_)) => {
            return fail(
                json_mode,
                EXIT_USAGE,
                "usage",
                "--from/--to 和 --workout 是互斥的范围，只能给一个",
            )
        }
        (Some(from), Some(to), None) => ExportScope::date_range(from, to),
        (Some(_), None, None) | (None, Some(_), None) => {
            return fail(
                json_mode,
                EXIT_USAGE,
                "usage",
                "--from 和 --to 必须成对给出",
            )
        }
        (None, None, Some(workout)) => ExportScope::Workout {
            workout_id: workout.to_string(),
        },
        (None, None, None) => {
            return fail(
                json_mode,
                EXIT_USAGE,
                "usage",
                "必须给出导出范围：--from/--to 或 --workout",
            )
        }
    };

    let types: Vec<String> = flags
        .get("types")
        .unwrap_or("workouts,daily,sleep")
        .split(',')
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .collect();
    let detail = match flags.get("detail").unwrap_or("summary") {
        "summary" => ExportDetail::Summary,
        "full" => ExportDetail::Full,
        _ => {
            return fail(
                json_mode,
                EXIT_USAGE,
                "usage",
                "--detail 只能是 summary 或 full",
            )
        }
    };

    let db = match open_read_only() {
        Ok(db) => db,
        Err((code, message)) => return fail(json_mode, code, error_kind_for(code), &message),
    };
    // 导出的是派生数据。它们要是旧解析器产出的，用户有权在文件生成之前知道
    // 这件事——提示走 stderr，`export > a.csv` 拿到的文件仍然是干净的。
    if let Some(notice) = db
        .pending_replay_plan()
        .ok()
        .flatten()
        .as_ref()
        .and_then(|plan| pending_replay_notice(Some(plan)))
    {
        eprintln!("提示：{notice}");
    }
    let selection = ExportSelection {
        scope: Some(scope),
        start_date: None,
        end_date: None,
        data_types: types,
        detail,
    };
    // 和 GUI 走同一个 builder：导出语义只在 core 里实现一次。
    let (json_text, records) = match db.build_ai_export(&selection) {
        Ok(value) => value,
        Err(error) => {
            let (code, kind) = exit_code_for(&error);
            return fail(json_mode, code, kind, &error.user_message());
        }
    };

    if format == "fit" {
        return export_fit_files(json_mode, &json_text, flags.get("out"));
    }

    let (body, count) = match format {
        "json" => (json_text, records),
        other => {
            let parsed: serde_json::Value = match serde_json::from_str(&json_text) {
                Ok(value) => value,
                Err(error) => {
                    return fail(
                        json_mode,
                        EXIT_FAILED,
                        "failed",
                        &format!("导出结果无法解析：{error}"),
                    )
                }
            };
            let converted = if other == "csv" {
                export_formats::to_csv(&parsed)
            } else {
                export_formats::to_gpx(&parsed)
            };
            match converted {
                Ok(value) => value,
                Err(message) => return fail(json_mode, EXIT_FAILED, "failed", &message),
            }
        }
    };

    match flags.get("out") {
        Some(path) => {
            if let Err(error) = std::fs::write(path, &body) {
                return fail(
                    json_mode,
                    EXIT_FAILED,
                    "failed",
                    &format!("写文件失败：{error}"),
                );
            }
            // 只回显用户自己给的路径，不去解析成绝对路径打印出来。
            emit(
                json_mode,
                serde_json::json!({ "ok": true, "format": format, "records": count, "out": path }),
                &format!("已导出 {count} 条到 {path}"),
            );
        }
        None => {
            // 没有 --out 时正文独占 stdout，条数提示走 stderr，
            // 这样 `zeppbridge-cli export > a.csv` 得到的是干净的文件。
            print!("{body}");
            eprintln!("已导出 {count} 条（{format}）");
        }
    }
    EXIT_OK
}

/// 让 `WriteLockError` 也能落到 busy 码上。
fn write_lock_exit(error: &WriteLockError) -> u8 {
    match error {
        WriteLockError::Busy { .. } => EXIT_BUSY,
        WriteLockError::Unavailable(_) => EXIT_FAILED,
    }
}

/// FIT 导出：一次运动一个文件，全部写进 `out` 指向的目录。
///
/// 为什么不支持 stdout：FIT 是二进制，而且一次导出通常是多份文件——把它们拼
/// 进一条流没有任何一端能再拆开。所以这里要求 `--out`，而不是默默写出一个没
/// 人能用的东西。
fn export_fit_files(json_mode: bool, json_text: &str, out: Option<&str>) -> u8 {
    let Some(directory) = out else {
        return fail(
            json_mode,
            EXIT_FAILED,
            "failed",
            "--format fit 需要 --out 指向一个目录：FIT 是二进制，且一次运动一个文件，没法写到标准输出",
        );
    };

    let parsed: serde_json::Value = match serde_json::from_str(json_text) {
        Ok(value) => value,
        Err(error) => {
            return fail(
                json_mode,
                EXIT_FAILED,
                "failed",
                &format!("导出结果无法解析：{error}"),
            )
        }
    };

    let (files, points) = match export_fit::to_fit(&parsed) {
        Ok(value) => value,
        Err(message) => return fail(json_mode, EXIT_FAILED, "failed", &message),
    };

    if let Err(error) = std::fs::create_dir_all(directory) {
        return fail(
            json_mode,
            EXIT_FAILED,
            "failed",
            &format!("创建目录失败：{error}"),
        );
    }
    for (name, bytes) in &files {
        let target = std::path::Path::new(directory).join(name);
        if let Err(error) = std::fs::write(&target, bytes) {
            return fail(
                json_mode,
                EXIT_FAILED,
                "failed",
                &format!("写文件失败：{error}"),
            );
        }
    }

    emit(
        json_mode,
        serde_json::json!({
            "ok": true,
            "format": "fit",
            "files": files.len(),
            "records": points,
            "out": directory
        }),
        &format!(
            "已导出 {} 个 FIT 文件（共 {points} 个采样点）到 {directory}",
            files.len()
        ),
    );
    EXIT_OK
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(values: &[&str]) -> Vec<String> {
        values.iter().map(|value| value.to_string()).collect()
    }

    #[test]
    fn a_misspelled_flag_is_a_usage_error_not_a_silent_default() {
        let flags = Flags::parse(&args(&["--form", "csv"])).unwrap();
        assert!(flags.reject_unknown(&["format"]).is_err());
    }

    #[test]
    fn export_refuses_to_pick_a_winner_between_date_range_and_single_workout() {
        // 两种范围同时给出是矛盾请求。定一个优先级只会让人写出
        // 「我以为传了 --workout 就只导这一条」的脚本。
        let code = cmd_export(&args(&[
            "--from",
            "2026-01-01",
            "--to",
            "2026-01-31",
            "--workout",
            "run-1",
            "--json",
        ]));
        assert_eq!(code, EXIT_USAGE);
    }

    #[test]
    fn sync_days_only_makes_sense_for_history_mode() {
        assert_eq!(
            cmd_sync(&args(&["--mode", "incremental", "--days", "30", "--json"])),
            EXIT_USAGE
        );
        assert_eq!(cmd_sync(&args(&["--mode", "nope", "--json"])), EXIT_USAGE);
        assert_eq!(
            cmd_sync(&args(&["--mode", "history", "--days", "99999", "--json"])),
            EXIT_USAGE
        );
    }

    #[test]
    fn reprocess_rejects_flags_it_does_not_understand() {
        // `--force` 看起来很像 `--all`。默默忽略它，用户会以为自己刚做了
        // 一次整库重放，而实际上什么都没做。
        let flags = Flags::parse(&args(&["--force"])).unwrap();
        assert!(flags.reject_unknown(&["json", "all"]).is_err());
        assert_eq!(cmd_reprocess(&args(&["--force", "--json"])), EXIT_USAGE);
    }

    #[test]
    fn sync_accepts_the_escape_hatch_that_skips_the_replay() {
        // 库大、cron 窗口小的人要有办法把重放挪到别的时间去做。开关拼错了
        // 必须报错，否则「我明明关掉了」和「它又跑了四分钟」会同时成立。
        let flags = Flags::parse(&args(&["--no-reprocess"])).unwrap();
        assert!(flags
            .reject_unknown(&["json", "mode", "days", "no-reprocess"])
            .is_ok());
        assert!(flags.has("no-reprocess"));
        let typo = Flags::parse(&args(&["--no-reprocesss"])).unwrap();
        assert!(typo
            .reject_unknown(&["json", "mode", "days", "no-reprocess"])
            .is_err());
    }

    #[test]
    fn the_help_text_names_every_command_that_can_be_run() {
        // 帮助漏掉一条命令，等于那条命令不存在——无交互的程序没有别的
        // 地方能让人发现它。
        for command in ["status", "sync", "reprocess", "export", "contract"] {
            assert!(HELP.contains(command), "帮助里没有 {command}");
        }
    }

    #[test]
    fn unknown_command_and_empty_invocation_both_report_usage() {
        assert_eq!(run(&args(&["frobnicate"])), EXIT_USAGE);
        assert_eq!(run(&[]), EXIT_USAGE);
        assert_eq!(run(&args(&["version"])), EXIT_OK);
        assert_eq!(run(&args(&["contract"])), EXIT_OK);
    }

    #[test]
    fn every_documented_exit_code_is_distinct() {
        // 退出码是对调度脚本的契约：两个不同含义撞到同一个数字，
        // 重试逻辑就没法写。
        let codes = [
            EXIT_OK,
            EXIT_FAILED,
            EXIT_USAGE,
            EXIT_NOT_CONFIGURED,
            EXIT_BUSY,
            EXIT_CLOUD,
            EXIT_DATABASE,
            EXIT_SCHEMA,
        ];
        let mut unique = codes.to_vec();
        unique.sort_unstable();
        unique.dedup();
        assert_eq!(unique.len(), codes.len(), "退出码不能重复");
    }

    #[test]
    fn help_text_documents_every_exit_code_the_binary_can_return() {
        for code in [
            EXIT_OK,
            EXIT_FAILED,
            EXIT_USAGE,
            EXIT_NOT_CONFIGURED,
            EXIT_BUSY,
            EXIT_CLOUD,
            EXIT_DATABASE,
            EXIT_SCHEMA,
        ] {
            assert!(
                HELP.contains(&code.to_string()),
                "退出码 {code} 没有写进 --help"
            );
        }
        // 隐私边界要出现在 help 里，用户不该为了知道它去读源码。
        assert!(HELP.contains("不监听任何端口"));
    }
}
