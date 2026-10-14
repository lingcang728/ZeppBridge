//! 打开数据库、按需重放、reprocess 子命令（从 main.rs 拆出，逻辑不变）。

use super::*;

pub(super) fn open_read_only() -> Result<Database, (u8, String)> {
    let dir = data_dir().map_err(|message| (EXIT_FAILED, message))?;
    let db_path = dir.join("zepp.db");
    if !db_path.exists() {
        return Err((
            EXIT_NOT_CONFIGURED,
            format!(
                "No local database yet. Connect an account in the ZeppBridge desktop app \
                 and sync once first, or copy an existing zepp.db here. {}",
                where_it_looked(&dir)
            ),
        ));
    }
    // 只读连接：CLI 的查询路径不拿写锁，也就不会在一次长同步期间被挡住。
    Database::open_read_only(db_path).map_err(|error| match error {
        // schema 对不上是「先去升级」，不是「数据库坏了」。两种情况给调度
        // 脚本的应对完全不同，所以退出码必须分开。
        ZeppBridgeError::ConfigError(message) => (EXIT_SCHEMA, message),
        other => {
            let (code, _) = exit_code_for(&other);
            (code, user_text(&other))
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
pub(super) struct ReplayOutcome {
    pub(super) from_revision: Option<String>,
    pub(super) raw_records: i64,
    pub(super) streams: BTreeMap<String, i64>,
    pub(super) elapsed: Duration,
}

impl ReplayOutcome {
    pub(super) fn total_records(&self) -> i64 {
        self.streams.values().sum()
    }

    pub(super) fn to_json(&self) -> serde_json::Value {
        serde_json::json!({
            "fromRevision": self.from_revision,
            "toRevision": NORMALIZER_REVISION,
            "rawRecords": self.raw_records,
            "streams": self.streams,
            "totalRecords": self.total_records(),
            "elapsedSeconds": (self.elapsed.as_millis() as f64) / 1000.0,
        })
    }

    pub(super) fn human(&self) -> String {
        format!(
            "Replayed {} stored payloads with the current parser: {} derived records in {:.1}s",
            self.raw_records,
            self.total_records(),
            self.elapsed.as_secs_f64()
        )
    }
}

/// 重放前把要做的事说出来。几分钟的静默和卡死在终端里长得一模一样。
pub(super) fn announce_replay(plan: &ReplayPlan) {
    let scope = if plan.streams.is_empty() {
        "every stream".to_string()
    } else {
        plan.streams.join("、")
    };
    // `--all` 可以在修订号没变的时候跑。那时候说「已从 X 升到 X」是句假话，
    // 用户会以为自己刚错过了一次升级。
    let reason = if plan.stored_revision.as_deref() == Some(plan.target_revision.as_str()) {
        format!(
            "Replaying with the current parser ({})",
            plan.target_revision
        )
    } else {
        format!(
            "Parser upgraded from {} to {}; replaying",
            plan.stored_revision
                .as_deref()
                .unwrap_or("an earlier revision"),
            plan.target_revision
        )
    };
    eprintln!(
        "{reason}: {} stored payloads ({scope}). No network is used. Do not interrupt.",
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
pub(super) fn run_replay(
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

pub(super) fn replay_failure(error: &ZeppBridgeError) -> (u8, &'static str, String) {
    let (code, kind) = exit_code_for(error);
    (code, kind, user_text(error))
}

/// 只读地问一句「这个库欠不欠重放」，欠就给一句提示。
///
/// 一次 SELECT，短命令加得起。它绝不代替重放：说出来和自作主张跑上四分钟
/// 是两回事。
pub(super) fn pending_replay_notice(plan: Option<&ReplayPlan>) -> Option<String> {
    let plan = plan?;
    if plan.raw_records == 0 {
        return None;
    }
    Some(format!(
        "Derived data here still comes from {}; the current parser is {}. {} stored payloads need a replay. Run `zeppbridge-cli reprocess`, or let the next sync do it.",
        plan.stored_revision.as_deref().unwrap_or("an earlier revision"),
        plan.target_revision,
        plan.raw_records
    ))
}

/// 打开一条可写连接，顺带完成 schema 迁移。
///
/// 无头环境没有「先启动一次桌面应用」这一步，迁移只能发生在这里。
pub(super) fn open_writable() -> Result<(std::path::PathBuf, Database), (u8, String)> {
    let dir = data_dir().map_err(|message| (EXIT_FAILED, message))?;
    let db_path = dir.join("zepp.db");
    if !db_path.exists() {
        return Err((
            EXIT_NOT_CONFIGURED,
            format!(
                "No local database yet. Connect an account in the ZeppBridge desktop app \
                 and sync once first, or copy an existing zepp.db here. {}",
                where_it_looked(&dir)
            ),
        ));
    }
    let db = Database::open_migrated(&db_path).map_err(|error| {
        let (code, _) = exit_code_for(&error);
        (code, user_text(&error))
    })?;
    Ok((dir, db))
}

/* ---------------------------- reprocess ---------------------------- */

pub(super) fn cmd_reprocess(args: &[String]) -> u8 {
    let json_mode = scan_json_flag(args);
    let flags = match Flags::parse(args) {
        Ok(flags) => flags,
        Err(message) => return fail(json_mode, EXIT_USAGE, "usage", &message),
    };
    if let Err(message) = flags.reject_unknown(&["json", "all"]) {
        return fail(json_mode, EXIT_USAGE, "usage", &message);
    }
    if let Err(message) = flags.reject_duplicates() {
        return fail(json_mode, EXIT_USAGE, "usage", &message);
    }
    let force_all = flags.has("all");

    let (dir, db) = match open_writable() {
        Ok(value) => value,
        Err((code, message)) => return fail(json_mode, code, error_kind_for(code), &message),
    };
    let plan = match db.pending_replay_plan() {
        Ok(plan) => plan,
        Err(error) => {
            let (code, kind) = exit_code_for(&error);
            return fail(json_mode, code, kind, &user_text(&error));
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
            &format!("Derived data already comes from the current parser ({NORMALIZER_REVISION}); nothing to replay"),
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
                return fail(json_mode, code, kind, &user_text(&error));
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
                "Another ZeppBridge finished this replay while we waited for the write lock",
            );
            EXIT_OK
        }
        Err((code, kind, message)) => fail(json_mode, code, kind, &message),
    }
}

/* ------------------------------ status ------------------------------ */
