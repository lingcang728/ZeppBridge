//! 训练计划：草稿、预览、发到手表、撤销、清空。
//!
//! 发布分三段（见 `zeppbridge_core::training_plan::publish`）：写锁内准备并记账 →
//! 放开写锁联网 → 写锁内记结果。联网的那段不占写锁，同步和别的短写入不用等它。

use super::{spawn_independent_read, with_write};
use crate::app_state::AppState;
use crate::ipc_error::AppError;
use chrono::NaiveDate;
use serde::{Deserialize, Serialize};
use std::path::Path;
use zeppbridge_core::models::error::Result as CoreResult;
use zeppbridge_core::official::{OfficialClient, OfficialStore};
use zeppbridge_core::storage::training_plan::{
    DraftOrigin, DraftPreview, PlanDraft, PlanOverview, Prepared, PublishRecord, PublishRequest,
    SendOutcome,
};
use zeppbridge_core::storage::write_lock::WritePurpose;
use zeppbridge_core::storage::Database;
use zeppbridge_core::training_plan::publish::{ensure_connected, send_window};
use zeppbridge_core::training_plan::PlanDocument;

/// 计划日期按这台电脑的日历算：用户在界面上看到的「明天」就是这台电脑的明天。
fn today() -> NaiveDate {
    chrono::Local::now().date_naive()
}

#[derive(Debug, Serialize)]
pub struct TrainingPlanState {
    #[serde(flatten)]
    pub overview: PlanOverview,
    pub drafts: Vec<PlanDraft>,
    pub ai_may_publish: bool,
}

#[tauri::command]
pub async fn training_plan_state(
    state: tauri::State<'_, AppState>,
) -> Result<TrainingPlanState, AppError> {
    spawn_independent_read(state.data_dir.clone(), |db| {
        Ok(TrainingPlanState {
            overview: db.plan_overview(today())?,
            drafts: db.open_plan_drafts()?,
            ai_may_publish: db.ai_may_publish_plans()?,
        })
    })
    .await
}

/// 存一份草稿。界面只能存「你写的」和「粘贴的 AI 回复」；MCP 走它自己的进程。
#[tauri::command]
pub async fn training_plan_save_draft(
    state: tauri::State<'_, AppState>,
    document: PlanDocument,
    pasted: bool,
) -> Result<String, AppError> {
    let origin = if pasted {
        DraftOrigin::AiPaste
    } else {
        DraftOrigin::User
    };
    with_write(
        &state.data_dir,
        &state.db,
        WritePurpose::Metadata,
        move |db| db.save_plan_draft(origin, &document),
    )
    .await
}

#[tauri::command]
pub async fn training_plan_preview(
    state: tauri::State<'_, AppState>,
    id: String,
) -> Result<DraftPreview, AppError> {
    spawn_independent_read(state.data_dir.clone(), move |db| {
        db.preview_plan_draft(&id, today())
    })
    .await
}

#[tauri::command]
pub async fn training_plan_discard(
    state: tauri::State<'_, AppState>,
    id: String,
) -> Result<bool, AppError> {
    with_write(
        &state.data_dir,
        &state.db,
        WritePurpose::Metadata,
        move |db| db.discard_plan_draft(&id),
    )
    .await
}

#[tauri::command]
pub async fn training_plan_set_ai_publish(
    state: tauri::State<'_, AppState>,
    allowed: bool,
) -> Result<bool, AppError> {
    with_write(
        &state.data_dir,
        &state.db,
        WritePurpose::Metadata,
        move |db| {
            db.set_ai_may_publish_plans(allowed)?;
            db.ai_may_publish_plans()
        },
    )
    .await
}

/// 界面能发起的三种推送。滚动推送只在同步之后自动跑，不从界面发。
#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case", tag = "kind")]
pub enum PublishAction {
    Draft { id: String },
    Undo,
    Clear,
}

/// 推送的结局。`outcome` 与 core 的 `Prepared` 一致，`send` 时多一份账本结果。
#[derive(Debug, Serialize)]
pub struct PublishResult {
    pub outcome: Prepared,
    /// 真的发了时，这一批在账本里的汇总（`sent` / `partial` / `rejected` / `unknown`）。
    pub record: Option<PublishRecord>,
    /// 这一批的逐窗口结果：哪一周送到了、哪一周没有。
    pub records: Vec<PublishRecord>,
}

#[tauri::command]
pub async fn training_plan_publish(
    state: tauri::State<'_, AppState>,
    action: PublishAction,
    confirm_clear: bool,
    locale: Option<String>,
) -> Result<PublishResult, AppError> {
    let request = match action {
        PublishAction::Draft { id } => PublishRequest::Draft { id },
        PublishAction::Undo => PublishRequest::UndoLast,
        PublishAction::Clear => PublishRequest::Clear,
    };
    publish(&state.data_dir, &state.db, request, confirm_clear, locale).await
}

fn batch_result(db: &Database, outcome: Prepared) -> CoreResult<PublishResult> {
    let (record, records) = match &outcome {
        Prepared::Send { batch_id, .. } => {
            (db.plan_batch_summary(*batch_id)?, db.plan_batch(*batch_id)?)
        }
        _ => (None, Vec::new()),
    };
    Ok(PublishResult {
        outcome,
        record,
        records,
    })
}

async fn publish(
    data_dir: &Path,
    database: &tokio::sync::Mutex<Database>,
    request: PublishRequest,
    confirm_clear: bool,
    locale: Option<String>,
) -> Result<PublishResult, AppError> {
    // An isolated, explicitly seeded demo has no credentials and cannot send HTTP.
    let demo = database.lock().await.is_demo_library()? && data_dir.join(".demo-library").is_file();
    if demo {
        return with_write(data_dir, database, WritePurpose::Metadata, |db| {
            let outcome = db.prepare_plan_publish(&request, today(), confirm_clear)?;
            if let Prepared::Send { sends, .. } = &outcome {
                for send in sends {
                    db.finish_plan_publish(send.publish_id, &SendOutcome::Delivered)?;
                }
            }
            batch_result(db, outcome)
        })
        .await;
    }
    let store = OfficialStore::new(data_dir);
    let client = OfficialClient::new()?;
    // 没有能用的令牌就别动账本。
    ensure_connected(&store, &client).await?;
    let day = today();
    let prepared = with_write(data_dir, database, WritePurpose::Metadata, |db| {
        if let Some(tag) = locale.as_deref() {
            db.set_plan_watch_locale(tag)?;
        }
        db.prepare_plan_publish(&request, day, confirm_clear)
    })
    .await?;
    let Prepared::Send { batch_id, sends } = &prepared else {
        return Ok(PublishResult {
            outcome: prepared,
            record: None,
            records: Vec::new(),
        });
    };
    // 按账本排好的顺序逐个窗口发（远的先、占位之后紧跟前一个窗口），每发完一个
    // 记一次结果；联网时不拿写锁。授权失效就不再往下发，剩下的窗口记成同样的拒绝。
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
        let publish_id = send.publish_id;
        with_write(data_dir, database, WritePurpose::Metadata, move |db| {
            db.finish_plan_publish(publish_id, &outcome)
        })
        .await?;
    }
    if abort.is_some() {
        return Err(AppError::new(
            "err.core.needs_reauth",
            "认证已失效，请重新连接 Zepp",
        ));
    }
    let batch_id = *batch_id;
    let (record, records) = with_write(data_dir, database, WritePurpose::Metadata, move |db| {
        Ok((db.plan_batch_summary(batch_id)?, db.plan_batch(batch_id)?))
    })
    .await?;
    Ok(PublishResult {
        outcome: prepared,
        record,
        records,
    })
}

/// 同步之后的滚动推送：窗口往前挪了一天，把账本和生效计划对不上的窗口补发
/// （包括上次没送达的那一周）。尽力而为，只写日志；没连官方、内容没变都不发，
/// 也永远不清空窗口。
pub(crate) async fn roll_after_sync(state: &AppState) {
    let store = OfficialStore::new(&state.data_dir);
    if !store
        .meta()
        .ok()
        .flatten()
        .is_some_and(|meta| !meta.needs_reauth)
    {
        return;
    }
    match publish(
        &state.data_dir,
        &state.db,
        PublishRequest::Roll,
        false,
        None,
    )
    .await
    {
        Ok(PublishResult {
            record: Some(record),
            ..
        }) if record.state != "sent" => {
            eprintln!("训练计划滚动推送没有确认送达: {}", record.state);
        }
        Ok(_) => {}
        Err(error) => eprintln!("训练计划滚动推送失败: {}", error.code),
    }
}

/// 断开官方授权之后：官方会删掉已同步的计划，本地账本跟着清零。
pub(crate) async fn forget_after_revoke(state: &AppState) {
    let result = with_write(&state.data_dir, &state.db, WritePurpose::Metadata, |db| {
        db.forget_plans_after_revoke(today())
    })
    .await;
    if let Err(error) = result {
        eprintln!("断开授权后清理训练计划账本失败: {}", error.code);
    }
}

#[tauri::command]
pub async fn training_plan_adherence(
    state: tauri::State<'_, AppState>,
    from: String,
    to: String,
) -> Result<Vec<zeppbridge_core::storage::plan_adherence::AdherenceDay>, AppError> {
    let from = NaiveDate::parse_from_str(&from, "%Y-%m-%d")
        .map_err(|_| AppError::new("err.ai_task.invalid", "日期无效"))?;
    let to = NaiveDate::parse_from_str(&to, "%Y-%m-%d")
        .map_err(|_| AppError::new("err.ai_task.invalid", "日期无效"))?;
    spawn_independent_read(state.data_dir.clone(), move |db| {
        db.plan_adherence(from, to)
    })
    .await
}
#[tauri::command]
pub async fn training_plan_update_draft(
    state: tauri::State<'_, AppState>,
    id: String,
    document: PlanDocument,
) -> Result<bool, AppError> {
    with_write(&state.data_dir, &state.db, WritePurpose::Metadata, |db| {
        db.update_plan_draft(&id, &document)
    })
    .await
}
