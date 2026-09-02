mod auth;
mod backup;
mod data;
mod login;
mod status;
mod sync;

pub(crate) use auth::{clear_auth, import_from_har, manual_auth, save_auth, verify_auth};
pub(crate) use backup::{
    cancel_pending_restore, create_manual_backup, get_pending_restore, get_restore_preview,
    list_backups, set_backup_pinned, stage_restore, verify_backup,
};
pub(crate) use data::{
    cleanup_old_data, compact_raw_payloads, get_capability_overview, get_daily_heart_rate_extremes,
    get_data_health, get_device_catalog_options, get_device_profile, get_device_profiles,
    get_diagnostic_report, get_export_json, get_health_overview, get_heart_rate_series,
    get_heart_rate_zones, get_metric_series, get_recent_sleep, get_recent_workouts,
    get_sleep_detail, get_sleep_page, get_storage_estimate, get_training_balance,
    get_training_load_series, get_unknown_workout_codes, get_user_prefs, get_weekly_report,
    get_workout_detail, get_workout_insight, get_workout_page, get_workout_series,
    get_workout_type_options, open_data_folder, prepare_ai_handoff, publish_ai_export,
    reprocess_local_data, run_database_integrity_check, save_csv_export, save_fit_export,
    save_gpx_export,
    save_json_export, set_device_model_override, set_heart_rate_zone_preference, set_user_prefs,
    set_workout_code_label, set_workout_type_override, submit_device_model_assignment,
    submit_diagnostic_report,
};
pub(crate) use login::{cancel_web_login, get_login_status, start_web_login};
pub(crate) use status::get_app_status;
pub(crate) use sync::{
    cancel_sync, get_coverage_ledger, probe_data_capabilities, reset_coverage_ledger,
    retry_failed_backfill_chunks, start_history_backfill, start_history_sync,
    start_incremental_sync, start_initial_sync,
};
