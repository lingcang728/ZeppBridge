use crate::{app_state::AppState, ipc_error::AppError};
use zeppbridge_core::storage::life_events::{LifeEvent, LifeEventInput};
use zeppbridge_core::storage::{write_lock, Database};

async fn with_life_event_write<T>(
    data_dir: &std::path::Path,
    database: &tokio::sync::Mutex<Database>,
    mutation: impl FnOnce(&Database) -> zeppbridge_core::models::error::Result<T>,
) -> Result<T, AppError> {
    // Wait briefly (without blocking a runtime worker) for a sync's short write
    // window; a long maintenance still reports the retryable busy error and
    // leaves the user's draft intact.
    let _write_guard =
        super::acquire_quick_write(data_dir, write_lock::WritePurpose::LifeEvent).await?;
    let db = database.lock().await;
    Ok(mutation(&db)?)
}

#[tauri::command]
pub async fn list_life_events(
    state: tauri::State<'_, AppState>,
    start: Option<String>,
    end: Option<String>,
) -> Result<Vec<LifeEvent>, AppError> {
    super::spawn_independent_read(state.data_dir.clone(), move |db| {
        db.list_life_events(start.as_deref(), end.as_deref())
    })
    .await
}

#[tauri::command]
pub async fn save_life_event(
    state: tauri::State<'_, AppState>,
    input: LifeEventInput,
) -> Result<i64, AppError> {
    with_life_event_write(&state.data_dir, &state.db, |db| db.save_life_event(&input)).await
}

#[tauri::command]
pub async fn delete_life_event(state: tauri::State<'_, AppState>, id: i64) -> Result<(), AppError> {
    with_life_event_write(&state.data_dir, &state.db, |db| db.delete_life_event(id)).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn life_event_writes_respect_an_existing_writer_and_resume_after_release() {
        let dir = std::env::temp_dir().join(format!("zepp-life-event-lock-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let database =
            tokio::sync::Mutex::new(Database::open_migrated(&dir.join("zepp.db")).unwrap());
        let input = LifeEventInput {
            id: None,
            title: "Trip".into(),
            category: "travel".into(),
            start_date: "2026-09-12".into(),
            end_date: None,
            notes: String::new(),
        };
        let id = with_life_event_write(&dir, &database, |db| db.save_life_event(&input))
            .await
            .unwrap();
        let guard = write_lock::try_acquire(&dir, write_lock::WritePurpose::Backup).unwrap();
        let mut update = input.clone();
        update.id = Some(id);
        update.title = "Changed".into();
        for event in [&input, &update] {
            let error = with_life_event_write(&dir, &database, |db| db.save_life_event(event))
                .await
                .unwrap_err();
            assert_eq!(error.code, "err.storage.write_busy");
        }
        let error = with_life_event_write(&dir, &database, |db| db.delete_life_event(id))
            .await
            .unwrap_err();
        assert_eq!(error.code, "err.storage.write_busy");
        let events = database.lock().await.list_life_events(None, None).unwrap();
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].input.title, "Trip");
        drop(guard);
        with_life_event_write(&dir, &database, |db| db.save_life_event(&update))
            .await
            .unwrap();
        with_life_event_write(&dir, &database, |db| db.delete_life_event(id))
            .await
            .unwrap();
        // 同步落库的那一小段只占写锁几百毫秒：撞上了等一会儿就能写上，不报错。
        let held = write_lock::try_acquire(&dir, write_lock::WritePurpose::Sync).unwrap();
        let release = std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(200));
            drop(held);
        });
        let saved = with_life_event_write(&dir, &database, |db| db.save_life_event(&input))
            .await
            .unwrap();
        release.join().unwrap();
        with_life_event_write(&dir, &database, |db| db.delete_life_event(saved))
            .await
            .unwrap();
        assert!(database
            .lock()
            .await
            .list_life_events(None, None)
            .unwrap()
            .is_empty());
        drop(database);
        std::fs::remove_dir_all(dir).unwrap();
    }
}
