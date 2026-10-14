//! 不在桌面进程里的起草与发布（MCP 的 `draft_training_plan` / `publish_training_plan`）。
//!
//! 和桌面 `commands/training_plan.rs::publish` 是同一个三段式（见 [`super::publish`]）：
//! 写锁内准备并记账 → 放开写锁联网 → 写锁内记结果。区别只在写库的方式：这里没有常驻
//! 连接，每段各开一条可写连接、拿跨进程写锁，写完就放。联网时两样都不拿。
//!
//! 和桌面不同的两条，都是刻意的：
//!
//! - **永远不清空窗口**（`confirm_clear` 恒为 false）。清空只能由用户在 ZeppBridge 里
//!   确认；会清空的草稿回 `NeedsClearConfirmation`，什么都不改。
//! - 同步入口：调用方（MCP）是同步代码，这里自建一个单线程运行时跑联网那段。

use super::publish::{ensure_connected, send_window};
use super::{check_plan, PlanCheck, PlanContext, PlanDocument};
use crate::models::{error::Result, ZeppBridgeError};
use crate::official::{OfficialClient, OfficialStore};
use crate::storage::training_plan::{
    DraftOrigin, DraftPreview, Prepared, PublishRecord, PublishRequest, SendOutcome,
};
use crate::storage::write_lock::{self, WritePurpose};
use crate::storage::{Database, CURRENT_SCHEMA_VERSION};
use chrono::NaiveDate;
use serde::Serialize;
use std::path::Path;
use std::time::Duration;

/// 短写入等锁的上限，与桌面的短写入一致。
const LOCK_WAIT: Duration = Duration::from_secs(5);

/// 拿写锁、开一条可写连接、做一件事、全部放掉。
pub fn write_once<T>(data_dir: &Path, mutation: impl FnOnce(&Database) -> Result<T>) -> Result<T> {
    let _guard = write_lock::acquire_with_timeout(data_dir, WritePurpose::Metadata, LOCK_WAIT)
        .map_err(|error| ZeppBridgeError::Busy(error.to_string()))?;
    let db = Database::open_without_migration(data_dir.join("zepp.db"))?;
    let version: i64 = db
        .conn
        .query_row("PRAGMA user_version", [], |row| row.get(0))?;
    if version != CURRENT_SCHEMA_VERSION {
        return Err(ZeppBridgeError::Busy(format!(
            "本地库版本是 v{version}，这个程序需要 v{CURRENT_SCHEMA_VERSION}；打开一次 ZeppBridge 完成升级后再试"
        )));
    }
    mutation(&db)
}

/// 起草的结果：没通过校验时 `draft_id` 为空、什么都没存。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DraftResult {
    pub draft_id: Option<String>,
    pub check: PlanCheck,
    /// 存下来之后的逐日「发之前 / 发之后」；没存就没有。
    pub preview: Option<DraftPreview>,
}

/// 校验并存一份 MCP 起草的计划。有阻断级问题就不存，原样把问题交回去让 AI 改。
pub fn draft_plan(
    data_dir: &Path,
    document: &PlanDocument,
    today: NaiveDate,
) -> Result<DraftResult> {
    write_once(data_dir, |db| {
        let check = check_plan(
            document,
            PlanContext {
                today,
                max_hr: db.training_plan_max_hr()?,
            },
        );
        if !check.publishable() {
            return Ok(DraftResult {
                draft_id: None,
                check,
                preview: None,
            });
        }
        let id = db.save_plan_draft(DraftOrigin::Mcp, document)?;
        let preview = db.preview_plan_draft(&id, today)?;
        Ok(DraftResult {
            draft_id: Some(id),
            check,
            preview: Some(preview),
        })
    })
}

/// 发布的结局，形状与桌面 `PublishResult` 一致。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StandalonePublish {
    pub outcome: Prepared,
    pub record: Option<PublishRecord>,
    pub records: Vec<PublishRecord>,
}

fn finished(db: &Database, outcome: Prepared) -> Result<StandalonePublish> {
    let (record, records) = match &outcome {
        Prepared::Send { batch_id, .. } => {
            (db.plan_batch_summary(*batch_id)?, db.plan_batch(*batch_id)?)
        }
        _ => (None, Vec::new()),
    };
    Ok(StandalonePublish {
        outcome,
        record,
        records,
    })
}

/// 把一份草稿发到手表。调用方负责先确认「允许 AI 直接发布」已打开。
pub fn publish_draft_blocking(
    data_dir: &Path,
    draft_id: &str,
    today: NaiveDate,
) -> Result<StandalonePublish> {
    let request = PublishRequest::Draft {
        id: draft_id.to_string(),
    };
    // 演示库没有凭据也不联网：和桌面一样，直接记成送达。
    let demo = data_dir.join(".demo-library").is_file()
        && Database::open_read_only(data_dir.join("zepp.db"))?.is_demo_library()?;
    if demo {
        return write_once(data_dir, |db| {
            let outcome = db.prepare_plan_publish(&request, today, false)?;
            if let Prepared::Send { sends, .. } = &outcome {
                for send in sends {
                    db.finish_plan_publish(send.publish_id, &SendOutcome::Delivered)?;
                }
            }
            finished(db, outcome)
        });
    }
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .map_err(|error| ZeppBridgeError::ConfigError(format!("无法启动网络运行时：{error}")))?;
    runtime.block_on(publish_draft(data_dir, request, today))
}

async fn publish_draft(
    data_dir: &Path,
    request: PublishRequest,
    today: NaiveDate,
) -> Result<StandalonePublish> {
    let store = OfficialStore::new(data_dir);
    let client = OfficialClient::new()?;
    // 没有能用的令牌就别动账本。
    ensure_connected(&store, &client).await?;
    let prepared = write_once(data_dir, |db| {
        db.prepare_plan_publish(&request, today, false)
    })?;
    let Prepared::Send { sends, .. } = &prepared else {
        return Ok(StandalonePublish {
            outcome: prepared,
            record: None,
            records: Vec::new(),
        });
    };
    // 顺序与记账规矩同桌面：按账本排好的顺序逐窗发，每发完一个记一次；授权失效就不再
    // 往下发，剩下的窗口记成同样的拒绝。
    let mut abort: Option<SendOutcome> = None;
    for send in sends {
        let outcome = match &abort {
            Some(outcome) => outcome.clone(),
            None => send_window(&store, &client, &send.body).await,
        };
        if matches!(&outcome, SendOutcome::Rejected { error_code, .. }
            if error_code == "err.core.needs_reauth")
        {
            abort = Some(outcome.clone());
        }
        write_once(data_dir, |db| {
            db.finish_plan_publish(send.publish_id, &outcome)
        })?;
    }
    if abort.is_some() {
        return Err(ZeppBridgeError::NeedsReauth(
            "认证已失效，请在 ZeppBridge 里重新连接 Zepp".into(),
        ));
    }
    write_once(data_dir, |db| finished(db, prepared.clone()))
}
