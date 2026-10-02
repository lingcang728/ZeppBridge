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
use zeppbridge_core::official::{OfficialClient, OfficialStore};
use zeppbridge_core::storage::training_plan::{
    DraftOrigin, DraftPreview, PlanDraft, PlanOverview, Prepared, PublishRecord, PublishRequest,
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
    /// 真的发了一次时，这次推送在账本里的样子（`sent` / `rejected` / `unknown`）。
    pub record: Option<PublishRecord>,
}

#[tauri::command]
pub async fn training_plan_publish(
    state: tauri::State<'_, AppState>,
    action: PublishAction,
    confirm_clear: bool,
) -> Result<PublishResult, AppError> {
    let request = match action {
        PublishAction::Draft { id } => PublishRequest::Draft { id },
        PublishAction::Undo => PublishRequest::UndoLast,
        PublishAction::Clear => PublishRequest::Clear,
    };
    publish(&state.data_dir, &state.db, request, confirm_clear).await
}

async fn publish(
    data_dir: &Path,
    database: &tokio::sync::Mutex<Database>,
    request: PublishRequest,
    confirm_clear: bool,
) -> Result<PublishResult, AppError> {
    let store = OfficialStore::new(data_dir);
    let client = OfficialClient::new()?;
    // 没有能用的令牌就别动账本。
    ensure_connected(&store, &client).await?;
    let day = today();
    let prepared = with_write(data_dir, database, WritePurpose::Metadata, |db| {
        db.prepare_plan_publish(&request, day, confirm_clear)
    })
    .await?;
    let Prepared::Send { publish_id, body } = &prepared else {
        return Ok(PublishResult {
            outcome: prepared,
            record: None,
        });
    };
    let outcome = send_window(&store, &client, body).await;
    let publish_id = *publish_id;
    let record = with_write(data_dir, database, WritePurpose::Metadata, move |db| {
        db.finish_plan_publish(publish_id, &outcome)?;
        Ok(db
            .plan_publishes(1)?
            .into_iter()
            .find(|record| record.id == publish_id))
    })
    .await?;
    if let Some(record) = record.as_ref().filter(|r| r.state == "rejected") {
        if record.error_code.as_deref() == Some("err.core.needs_reauth") {
            return Err(AppError::new(
                "err.core.needs_reauth",
                "认证已失效，请重新连接 Zepp",
            ));
        }
    }
    Ok(PublishResult {
        outcome: prepared,
        record,
    })
}

/// 同步之后的滚动推送：窗口往前挪了一天，把新进窗口的训练发出去。尽力而为，
/// 只写日志；没连官方、窗口为空或内容没变都不发。
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
    match publish(&state.data_dir, &state.db, PublishRequest::Roll, false).await {
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
