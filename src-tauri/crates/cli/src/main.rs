use chrono::Local;

use std::collections::{BTreeMap, BTreeSet};

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

use zeppbridge_core::models::error::{sanitize_user_text, HeadlessProblem};

use zeppbridge_core::models::{error::ZeppBridgeError, ExportDetail, ExportScope, ExportSelection};

use zeppbridge_core::paths;

use zeppbridge_core::storage::write_lock::{self, WriteLockError, WritePurpose};

use zeppbridge_core::storage::{Database, ReplayPlan, EXPORT_DATA_TYPES, NORMALIZER_REVISION};

use zeppbridge_core::sync::{SyncManager, SyncReport};

mod args;
mod cmd_export;
mod cmd_probe;
mod cmd_reprocess;
mod cmd_status;
mod cmd_sync;
mod exit;
#[cfg(test)]
mod tests;

use args::*;
use cmd_export::*;
use cmd_probe::*;
use cmd_reprocess::*;
use cmd_status::*;
use cmd_sync::*;
use exit::*;

const VERSION: &str = env!("CARGO_PKG_VERSION");

/* --------------------------- 退出码契约 ---------------------------
 * 这几个数字是对调度脚本的承诺，只能新增，不能改含义。 */

/// 一切正常。
const EXIT_OK: u8 = 0;

/// 命令本身写错了（未知子命令、缺参数、参数非法）。
const EXIT_USAGE: u8 = 2;

/// 还没有连接 Zepp 账号，或者凭据已失效。
///
/// 最常见的两种：从没登录过；以及把另一台机器的 `data` 文件夹整个拷了过来
/// ——库和 `auth.json` 都在，令牌却从来不在文件里（issue #40）。两种都要人
/// 出面：在桌面应用里登录，或者用 `ZEPPBRIDGE_CREDENTIAL_STORE` 把令牌交进
/// 来。见 docs/guides/linux.md。
const EXIT_NOT_CONFIGURED: u8 = 3;

/// 另一个 ZeppBridge 进程正在写库。稍后重试即可，不是错误。
const EXIT_BUSY: u8 = 4;

/// 云端请求失败（网络、鉴权、限流）。
const EXIT_CLOUD: u8 = 5;

/// 本机数据库出问题。
const EXIT_DATABASE: u8 = 6;

/// 本机数据库的 schema 版本和这个程序对不上。需要先升级其中一边。
const EXIT_SCHEMA: u8 = 7;

/// Sync returned a report with one or more failed streams.
const EXIT_INCOMPLETE_SYNC: u8 = 8;

/// 其他失败。
const EXIT_FAILED: u8 = 1;

/// The CLI ships inside the installer, so its human-readable output is English.
///
/// 注释保持中文，这里只是发出去给用户看的那一层。理由见仓库约定：随安装包
/// 发出去的说明用英文，而 issue #40 那位 Linux 用户撞上的正是一句他读不懂的
/// 中文提示。`--json` 的字段名和退出码是契约，一个字都没动。
///
/// **边界在哪：** 这个文件里的每一句人读文案都是英文了。从 `zeppbridge-core`
/// 冒上来的错误由 `exit.rs` 的 `user_text()` 按变体出英文；带自由文本的变体，
/// 原话是中文时换成错误码，不把中英文混在同一句里（core 那七百多处中文原话是
/// 桌面端的兜底，桌面端按码查本地文案、根本不显示它们）。
const HELP: &str = "\
zeppbridge-cli — the non-interactive command line for ZeppBridge

Usage:
  zeppbridge-cli <command> [options]

Commands:
  status              Print local database and account status (no network)
  sync                Sync from the Zepp cloud into the local SQLite database
  probe               Check candidate health endpoints without importing data
  reprocess           Replay stored payloads with the current parser (no network)
  export              Export local data as JSON / CSV / GPX / FIT
  contract            Print the read contract (units, time zone, source, missing values)
  version             Print the version
  help                Print this help

sync options:
  --mode <incremental|initial|history>   Default: incremental
  --days <N>                             history mode only; 1-3650
  --no-reprocess                         Skip the parser replay before syncing
  --json                                 Emit a machine-readable sync report

reprocess options:
  --all                     Replay every payload, not only what a parser upgrade owes
  --json                    Emit a machine-readable replay report

probe options:
  --streams <a,b,c>          Default: blood_pressure; also heart_rate,daily_summary
  --days <N>                Heart rate / daily summary window; 1-365 (default 7)
  --json                    Emit counts, field names and errors only; no readings

export options:
  --format <json|csv|gpx|fit>  Default: json; fit needs --out to point at a directory
                               (csv, gpx and fit always export full detail)
  --from <YYYY-MM-DD>       Use together with --to
  --to <YYYY-MM-DD>
  --workout <id>            Export one workout; mutually exclusive with --from/--to
  --types <a,b,c>           Default: workouts,daily_activity,sleep
                            Allowed: heart_rate, hrv, hrv_rmssd, respiratory_rate,
                            pai, lactate_threshold, daily_activity, sleep, workouts,
                            recovery, steps, spo2, stress, training_load, vo2max,
                            weight, food, blood_pressure
  --detail <summary|full>   Default: summary
  --out <path>              Default: write to stdout

Common options:
  --json                    Machine-readable output on stdout, human notes on stderr

Exit codes:
  0 success        1 failure          2 usage error   3 no account connected
  4 another process is writing        5 cloud request failed
  6 local database error             7 database version does not match this binary
  8 sync incomplete (one or more streams failed)

Parser upgrades:
  When the parser rules change (new workout codes, sleep-stage corrections, the
  all-day stress curve), records already stored locally were produced by the old
  rules and only catch up after a replay. The desktop app does this on launch; a
  headless install never has that launch, so: `sync` runs it automatically before
  syncing (turn it off with --no-reprocess), `status` only reports it, and
  `reprocess` is the one you can run at any time. A replay uses no network and
  does not touch the \"last cloud sync\" timestamp.

Privacy:
  Reads and writes the local data directory only. Listens on no port. Never
  prints tokens, cookies or a full account name.
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
        "probe" => cmd_probe(rest),
        "reprocess" => cmd_reprocess(rest),
        "export" => cmd_export(rest),
        other => {
            eprintln!("Unknown command: {other}\n");
            eprint!("{HELP}");
            EXIT_USAGE
        }
    }
}

/* ------------------------------ 参数解析 ------------------------------
 * 手写而不是引入 clap：三个子命令十来个开关，换来的是零新增依赖和
 * 完全可控的退出码与帮助文案。 */
