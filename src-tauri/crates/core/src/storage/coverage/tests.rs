use super::*;

fn db() -> Database {
    Database::in_memory().unwrap()
}

fn date(text: &str) -> NaiveDate {
    NaiveDate::parse_from_str(text, "%Y-%m-%d").unwrap()
}

/// issue #10 的回归门。
///
/// 旧实现每轮取 `pending_backfill_chunks(1)`，失败块写回 `failed` 之后仍
/// 满足待办条件、排序也没变，于是下一轮又是它——同月其余的流和更早的月份
/// 永远轮不上。这里断言：一块反复失败时，队列仍然把其余的块交出来。
#[test]
fn a_failing_chunk_does_not_starve_the_rest_of_the_queue() {
    let db = db();
    db.plan_backfill(date("2026-07-01"), date("2026-08-31"))
        .unwrap();

    // heart_rate 在最新的那个月一直失败。stream ASC 排序下它排得很靠前
    // （daily_summary 之后），正是最容易挡住别人的位置。
    for round in 1..=MAX_AUTO_ATTEMPTS {
        let queue = db.pending_backfill_chunks(24).unwrap();
        assert!(
            queue
                .iter()
                .any(|chunk| chunk.stream == "heart_rate" && chunk.chunk_start == "2026-08-01"),
            "第 {round} 轮里失败块还应该可以重试"
        );
        // 一轮里每个 (stream, 月份) 只出现一次——这是不饿死别人的前提。
        let mut seen: Vec<(String, String)> = queue
            .iter()
            .map(|chunk| (chunk.stream.clone(), chunk.chunk_start.clone()))
            .collect();
        let before = seen.len();
        seen.sort();
        seen.dedup();
        assert_eq!(before, seen.len(), "同一块不该在一轮里重复出现");

        // 其余的流和更早的月份必须都在这一轮的队列里。
        assert!(queue
            .iter()
            .any(|chunk| chunk.stream == "sleep" && chunk.chunk_start == "2026-08-01"));
        assert!(queue
            .iter()
            .any(|chunk| chunk.stream == "heart_rate" && chunk.chunk_start == "2026-07-01"));

        db.record_backfill_chunk(
            "heart_rate",
            "2026-08-01",
            ChunkStatus::Failed,
            0,
            Some("网络中断"),
            Some("err.core.network"),
        )
        .unwrap();
    }

    // 自动重试用尽之后，这一块退出自动队列，但别人照旧前进。
    let queue = db.pending_backfill_chunks(24).unwrap();
    assert!(
        !queue
            .iter()
            .any(|chunk| chunk.stream == "heart_rate" && chunk.chunk_start == "2026-08-01"),
        "重试次数用尽的块不该继续占据队首"
    );
    assert!(
        queue.len() >= (BACKFILL_STREAMS.len() * 2) - 1,
        "其余的块必须仍然可做"
    );
}

#[test]
fn attempts_accumulate_on_failure_and_reset_on_success() {
    let db = db();
    db.plan_backfill(date("2026-08-01"), date("2026-08-31"))
        .unwrap();

    for _ in 0..2 {
        db.record_backfill_chunk(
            "hrv",
            "2026-08-01",
            ChunkStatus::Failed,
            0,
            Some("超时"),
            Some("err.backfill.no_canonical_records"),
        )
        .unwrap();
    }
    let failed = db.failed_backfill_chunks().unwrap();
    let entry = failed
        .iter()
        .find(|chunk| chunk.stream == "hrv")
        .expect("失败块应该带明细");
    assert_eq!(entry.attempts, 2);
    assert_eq!(entry.error.as_deref(), Some("超时"));
    assert!(!entry.exhausted);

    // 后来成功了，就不该再背着历史包袱。
    db.record_backfill_chunk("hrv", "2026-08-01", ChunkStatus::Persisted, 42, None, None)
        .unwrap();
    assert!(db
        .failed_backfill_chunks()
        .unwrap()
        .iter()
        .all(|chunk| chunk.stream != "hrv"));
}

#[test]
fn manual_retry_only_revives_failed_chunks() {
    let db = db();
    db.plan_backfill(date("2026-08-01"), date("2026-08-31"))
        .unwrap();
    db.record_backfill_chunk(
        "sleep",
        "2026-08-01",
        ChunkStatus::Persisted,
        30,
        None,
        None,
    )
    .unwrap();
    db.record_backfill_chunk(
        "wellness",
        "2026-08-01",
        ChunkStatus::EmptyFromCloud,
        0,
        None,
        None,
    )
    .unwrap();
    for _ in 0..MAX_AUTO_ATTEMPTS {
        db.record_backfill_chunk(
            "heart_rate",
            "2026-08-01",
            ChunkStatus::Failed,
            0,
            Some("解析失败"),
            Some("err.backfill.no_canonical_records"),
        )
        .unwrap();
    }

    let ledger = db.coverage_ledger().unwrap();
    assert!(ledger.needs_manual_retry, "用尽重试的块要提示用户");
    assert_eq!(ledger.failed_chunks_detail.len(), 1);
    assert_eq!(ledger.failed_chunks_detail[0].chunk_start, "2026-08-01");

    assert_eq!(db.reset_failed_backfill_chunks().unwrap(), 1);
    assert!(db
        .pending_backfill_chunks(24)
        .unwrap()
        .iter()
        .any(|chunk| chunk.stream == "heart_rate"));

    // 已写入和云端确认为空的块不该被「重试失败项」打回重来。
    let after = db.coverage_ledger().unwrap();
    let sleep = after
        .streams
        .iter()
        .find(|item| item.stream == "sleep")
        .unwrap();
    assert_eq!(sleep.persisted_chunks, 1);
    let wellness = after
        .streams
        .iter()
        .find(|item| item.stream == "wellness")
        .unwrap();
    assert_eq!(wellness.empty_chunks, 1);
}

/// 送到界面的中文必须带一个码。
///
/// 这是这一类 bug 的通用门禁，不是某几句话的补丁。后端仍然带中文原文当
/// 兜底（CLI 和日志要用），但只要某个字段可能是中文，界面就必须能从
/// 兄弟字段 `<字段>_code` 拿到码去查自己语言的说法。
///
/// 会漏的历史：`StorageEstimate.message`、`CoverageLedger` 里失败块的
/// `error`——它们都不是「错误」，所以上一轮给错误加码时没被覆盖到，
/// 于是英文界面上照样是中文。
fn assert_chinese_carries_a_code(value: &serde_json::Value, path: &str) {
    fn has_chinese(text: &str) -> bool {
        text.chars().any(|c| ('\u{4e00}'..='\u{9fff}').contains(&c))
    }
    match value {
        serde_json::Value::Object(map) => {
            for (key, child) in map {
                if let serde_json::Value::String(text) = child {
                    if has_chinese(text) {
                        let code_key = format!("{key}_code");
                        let code = map.get(&code_key);
                        assert!(
                                matches!(code, Some(serde_json::Value::String(c)) if !c.is_empty()),
                                "{path}.{key} 是中文却没有 {code_key}：英文界面会原样显示这句中文\n值：{text}"
                            );
                    }
                }
                assert_chinese_carries_a_code(child, &format!("{path}.{key}"));
            }
        }
        serde_json::Value::Array(items) => {
            for (index, child) in items.iter().enumerate() {
                assert_chinese_carries_a_code(child, &format!("{path}[{index}]"));
            }
        }
        _ => {}
    }
}

#[test]
fn the_ledger_never_sends_chinese_without_a_code() {
    let db = db();
    db.plan_backfill(date("2026-08-01"), date("2026-08-31"))
        .unwrap();
    // 三种失败来源都走一遍：core 错误、确定性解析失败、以及没有码的旧行。
    db.record_backfill_chunk(
        "heart_rate",
        "2026-08-01",
        ChunkStatus::Failed,
        0,
        Some("云端返回了报文，但没有解析出可用记录"),
        Some("err.backfill.no_canonical_records"),
    )
    .unwrap();
    db.record_backfill_chunk(
        "sleep",
        "2026-08-01",
        ChunkStatus::Failed,
        0,
        Some("无法连接 Zepp 区域，请检查网络后重试"),
        Some("err.core.network"),
    )
    .unwrap();

    let ledger = db.coverage_ledger().unwrap();
    let json = serde_json::to_value(&ledger).unwrap();
    assert_chinese_carries_a_code(&json, "ledger");
}

/// 「云端没有」和「我们没看懂」必须分开记。
///
/// 现场：某个账号的心率接口对整段历史都返回 `{"items": []}`——它明确
/// 在说「这段时间没有心率」。旧实现把「解析出 0 行」一律当失败，于是
/// 界面上排出一长串红色的「失败」，用户以为自己丢了几个月的数据；
/// 而这些块又永远排在待办队首，把后面的块全挡住（issue #10 的现场）。
///
/// 这里钉住账本这一侧的语义：`empty_from_cloud` 不算失败，也不再重试，
/// 但仍然算「有结论」，所以不影响完整性判断。
#[test]
fn a_month_the_cloud_has_nothing_for_is_not_a_failure() {
    let db = db();
    db.plan_backfill(date("2026-08-01"), date("2026-08-31"))
        .unwrap();

    db.record_backfill_chunk(
        "heart_rate",
        "2026-08-01",
        ChunkStatus::EmptyFromCloud,
        0,
        None,
        None,
    )
    .unwrap();

    // 不出现在失败清单里——界面不该把它画成红色。
    assert!(db
        .failed_backfill_chunks()
        .unwrap()
        .iter()
        .all(|chunk| chunk.stream != "heart_rate"));

    // 也不再回到待办队列——它没有失败，重试没有意义。
    assert!(db
        .pending_backfill_chunks(24)
        .unwrap()
        .iter()
        .all(|chunk| !(chunk.stream == "heart_rate" && chunk.chunk_start == "2026-08-01")));

    // 但它是一个「结论」，会计入完成数。
    let ledger = db.coverage_ledger().unwrap();
    let heart_rate = ledger
        .streams
        .iter()
        .find(|item| item.stream == "heart_rate")
        .unwrap();
    assert_eq!(heart_rate.empty_chunks, 1);
    assert_eq!(heart_rate.failed_chunks, 0);
    assert!(!ledger.needs_manual_retry);
}

#[test]
fn chunks_align_to_calendar_months_and_cover_both_ends() {
    let chunks = month_chunks(date("2026-01-15"), date("2026-03-02"));
    assert_eq!(chunks.len(), 3, "1 月、2 月、3 月各一块");
    assert_eq!(chunks[0].0, date("2026-01-01"));
    assert_eq!(chunks[2].1, date("2026-04-01"));

    // 跨年不能算错。
    let across = month_chunks(date("2025-12-20"), date("2026-01-05"));
    assert_eq!(across.len(), 2);
    assert_eq!(across[1].0, date("2026-01-01"));

    // 反向区间不产生任何块，而不是产生一个空块。
    assert!(month_chunks(date("2026-03-01"), date("2026-01-01")).is_empty());
}

#[test]
fn planning_the_same_range_twice_does_not_reopen_finished_chunks() {
    let db = db();
    let planned = db
        .plan_backfill(date("2026-01-01"), date("2026-02-28"))
        .unwrap();
    assert_eq!(planned, (BACKFILL_STREAMS.len() * 2) as i64);

    db.record_backfill_chunk(
        "sleep",
        "2026-01-01",
        ChunkStatus::Persisted,
        31,
        None,
        None,
    )
    .unwrap();

    // 再排一次同样的范围：已完成的块不该被打回待办。
    let replanned = db
        .plan_backfill(date("2026-01-01"), date("2026-02-28"))
        .unwrap();
    assert_eq!(replanned, 0, "重复排计划不该新增任何块");

    let ledger = db.coverage_ledger().unwrap();
    let sleep = ledger
        .streams
        .iter()
        .find(|stream| stream.stream == "sleep")
        .unwrap();
    assert_eq!(sleep.persisted_chunks, 1);
    assert_eq!(sleep.records, 31);
}

#[test]
fn a_month_the_cloud_had_nothing_for_is_not_a_failure_and_is_not_retried() {
    let db = db();
    db.plan_backfill(date("2026-01-01"), date("2026-01-31"))
        .unwrap();
    db.record_backfill_chunk(
        "hrv",
        "2026-01-01",
        ChunkStatus::EmptyFromCloud,
        0,
        None,
        None,
    )
    .unwrap();

    let pending = db.pending_backfill_chunks(100).unwrap();
    assert!(
        !pending
            .iter()
            .any(|chunk| chunk.stream == "hrv" && chunk.chunk_start == "2026-01-01"),
        "云端确认为空的块不该被反复重试"
    );

    let ledger = db.coverage_ledger().unwrap();
    let hrv = ledger
        .streams
        .iter()
        .find(|stream| stream.stream == "hrv")
        .unwrap();
    assert_eq!(hrv.empty_chunks, 1);
    assert_eq!(hrv.failed_chunks, 0, "没有数据不是失败");
    assert_eq!(hrv.empty_months, vec!["2026-01-01"]);
}

#[test]
fn a_failed_chunk_stays_retryable_and_keeps_its_reason() {
    let db = db();
    db.plan_backfill(date("2026-01-01"), date("2026-01-31"))
        .unwrap();
    db.record_backfill_chunk(
        "workouts",
        "2026-01-01",
        ChunkStatus::Failed,
        0,
        Some("网络超时"),
        Some("err.core.network"),
    )
    .unwrap();

    let pending = db.pending_backfill_chunks(100).unwrap();
    let failed = pending
        .iter()
        .find(|chunk| chunk.stream == "workouts")
        .expect("失败的块应当还在待办里");
    assert_eq!(failed.error.as_deref(), Some("网络超时"));

    // 重试成功之后错误要被清掉，不能一直挂着。
    db.record_backfill_chunk(
        "workouts",
        "2026-01-01",
        ChunkStatus::Persisted,
        5,
        None,
        None,
    )
    .unwrap();
    let ledger = db.coverage_ledger().unwrap();
    let workouts = ledger
        .streams
        .iter()
        .find(|stream| stream.stream == "workouts")
        .unwrap();
    assert_eq!(workouts.failed_chunks, 0);
    assert_eq!(workouts.persisted_chunks, 1);
}

#[test]
fn the_ledger_only_calls_itself_complete_when_every_chunk_has_an_answer() {
    let db = db();
    assert!(
        !db.coverage_ledger().unwrap().complete,
        "什么都没做不等于做完了"
    );

    db.plan_backfill(date("2026-01-01"), date("2026-01-31"))
        .unwrap();
    assert!(!db.coverage_ledger().unwrap().complete);

    for stream in BACKFILL_STREAMS {
        db.record_backfill_chunk(stream, "2026-01-01", ChunkStatus::Persisted, 1, None, None)
            .unwrap();
    }
    let ledger = db.coverage_ledger().unwrap();
    assert!(ledger.complete);
    assert_eq!(ledger.completed_chunks, ledger.total_chunks);
    assert_eq!(ledger.requested_from.as_deref(), Some("2026-01-01"));
}

#[test]
fn pending_chunks_come_back_newest_first() {
    let db = db();
    db.plan_backfill(date("2026-01-01"), date("2026-03-31"))
        .unwrap();
    let pending = db.pending_backfill_chunks(3).unwrap();
    assert_eq!(pending.len(), 3);
    assert!(
        pending
            .iter()
            .all(|chunk| chunk.chunk_start == "2026-03-01"),
        "补拉随时可能被取消，最近的月份要先拿回来"
    );
}

#[test]
fn chunk_status_round_trips_including_partial() {
    for status in [
        ChunkStatus::Pending,
        ChunkStatus::Persisted,
        ChunkStatus::EmptyFromCloud,
        ChunkStatus::Partial,
        ChunkStatus::Failed,
    ] {
        assert_eq!(ChunkStatus::parse(status.as_str()), status);
    }
    assert!(ChunkStatus::Partial.needs_work());
    assert!(ChunkStatus::Failed.needs_work());
    assert!(!ChunkStatus::Persisted.needs_work());
    assert!(!ChunkStatus::EmptyFromCloud.needs_work());
}

/// 子切片 404 / 解析失败后仍写出过数据：库里的行要留着，但不能把这个月
/// 画成「已经完整落盘」。
#[test]
fn a_partial_write_is_not_a_complete_local_copy() {
    let db = db();
    db.plan_backfill(date("2026-01-01"), date("2026-01-31"))
        .unwrap();
    db.record_backfill_chunk(
        "heart_rate",
        "2026-01-01",
        ChunkStatus::Partial,
        12,
        Some("这一块只写入了部分数据，还需要重试"),
        Some("err.backfill.partial_window"),
    )
    .unwrap();

    let pending = db.pending_backfill_chunks(100).unwrap();
    let chunk = pending
        .iter()
        .find(|chunk| chunk.stream == "heart_rate")
        .expect("部分写入的块还要再拉");
    assert_eq!(chunk.records, 12);
    assert!(chunk.persisted_at.is_none(), "部分写入不能记 persisted_at");
    assert!(ChunkStatus::parse(&chunk.status).needs_work());

    let ledger = db.coverage_ledger().unwrap();
    assert!(!ledger.complete, "有洞的月份不能叫完整副本");
    let heart_rate = ledger
        .streams
        .iter()
        .find(|stream| stream.stream == "heart_rate")
        .unwrap();
    assert_eq!(heart_rate.persisted_chunks, 0);
    assert_eq!(heart_rate.failed_chunks, 1);
    assert_eq!(heart_rate.records, 12);
    assert_eq!(
        ledger.failed_chunks_detail[0].error_code.as_deref(),
        Some("err.backfill.partial_window")
    );

    let json = serde_json::to_value(&ledger).unwrap();
    assert_chinese_carries_a_code(&json, "ledger");
}
