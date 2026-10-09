/** Mutable operations are isolated in this iframe's memory. No disk, account or network access. */
import type { DemoData } from './dataset';
import { DAYS } from './dataset';
import { demoCapabilities, demoDevices, demoLedger, demoLocalApi, demoPrefs, demoStorageEstimate } from './facts';
import { demoTemplates, demoTaskList } from './ai';
import { newTaskDraft } from '../lib/aiTask/draft';
import { demoText } from './texts';
import { at, dayKey, iso } from './rng';
import { FALLBACK_APP_VERSION } from '../lib/appVersion';
import type { AiTask, AiTaskTemplate } from '../lib/bridge/types';
import type { BackupManifest, LifeEvent, PendingRestore, DataHealth } from '../types';
import type { AiExchange } from '../types/timeBridge';
import type { DemoPlan } from './plan';

export type DemoHandler = (args: Record<string, unknown>) => unknown;
export const createDemoOperations = (data: DemoData, plan: DemoPlan) => {
  const now = () => iso(data.now), first = dayKey(at(data.now, 1 - DAYS));
  let prefs = { ...demoPrefs(), ai_profile_note: '' }, localApi = demoLocalApi(), token = 'demo-only-not-a-real-token';
  let pending: PendingRestore | null = null;
  const devices = demoDevices(data);
  const initial = { ...newTaskDraft(), id: 'demo-task-1', title: demoTaskList(data)[0].title, created_at: now(), updated_at: now() };
  const tasks = new Map<string, AiTask>([[initial.id, initial]]), pinned = new Set<string>([initial.id]);
  const templates = new Map<string, AiTaskTemplate>();
  const events: LifeEvent[] = [
    { id: 1, title: demoText().lifeEvent, category: 'training', startDate: dayKey(at(data.now, -24)), endDate: null, notes: '', createdAt: now(), updatedAt: now() },
  ];
  const exchanges: AiExchange[] = [{ id: 'demo-exchange-1', task_id: initial.id, provider: 'ChatGPT', question: initial.title, days_before: 14,
    categories: initial.categories, workout_ids: [], personal_note: '', sent_at: now(), md_path: 'ZeppBridge.md',
    plan_draft_id: 'demo-draft', received_at: now(), publish_id: null, publish_state: null, undone: false,
    document: plan.state().drafts[0]?.document ?? null, plan: plan.preview().check }];
  const counts = { sleep_sessions: data.sleeps.length, workouts: data.workouts.length, heart_rate: data.heart.length,
    daily_metrics: Object.values(data.metrics).reduce((s, p) => s + p.length, 0) };
  const makeBackup = (id: string, offset: number): BackupManifest => ({ id, created_at: iso(at(data.now, offset)), app_version: FALLBACK_APP_VERSION,
    schema_version: 35, normalizer_revision: 'demo-1', kind: 'manual', coverage: { earliest_sample_at: iso(at(data.now, 1 - DAYS)), latest_sample_at: now(), last_cloud_sync_at: now() },
    table_counts: { ...counts }, bytes: 28_431_360, sha256: 'd'.repeat(64), integrity_ok: true, pinned: false });
  const backups = [makeBackup('demo-backup-2', -1), makeBackup('demo-backup-1', -8)];
  const getBackup = (id: unknown) => { const b = backups.find(b => b.id === id); if (!b) throw new Error('Unknown sample backup'); return b; };
  const verification = (id: unknown) => ({ id: getBackup(id).id, file_present: true, bytes_match: true, sha256_match: true, integrity_ok: true, problem: null });
  const health = (): DataHealth => ({ generated_at: now(),
    database: { schema_version: 35, normalizer_revision: 'demo-1', replay_in_progress: false, database_bytes: 28_431_360,
      raw_records: counts.heart_rate, canonical_records: Object.values(counts).reduce((a, b) => a + b, 0), pending_normalization: 0,
      last_integrity_check: { checked_at: now(), ok: true } },
    timings: { last_cloud_sync_at: now(), last_cloud_sync_outcome: 'updated', newest_sample_at: now() },
    streams: Object.entries(counts).map(([stream, count]) => ({ stream, label: stream, cadence: 'daily', fetch: { state: 'ok', at: now() }, parse: { state: 'ok', at: now() }, write: { state: 'ok', at: now() },
      raw_records: count, canonical_records: count, last_written_records: count, sources: [{ source: 'device', records: count }],
      coverage: { kind: 'observations', window_days: DAYS, observed_days: stream === 'sleep_sessions' ? data.sleeps.length : DAYS, gap_dates: [], gap_total: 0, first_observed_at: first, latest_observed_at: now(), note: '' } })), occasional_metrics: [], actions: [] });
  const handlers: Record<string, DemoHandler> = {
    get_user_prefs: () => ({ ...prefs }),
    set_user_prefs: a => { prefs = { ...prefs, retention_days: Number(a.retentionDays), history_sync_days: Number(a.historySyncDays), archive_enabled: a.archiveEnabled === undefined ? prefs.archive_enabled : !!a.archiveEnabled }; return { ...prefs }; },
    ai_profile_save: a => { prefs.ai_profile_note = String(a.note ?? ''); },
    list_life_events: a => events.filter(e => (!a.start || (e.endDate ?? e.startDate) >= String(a.start)) && (!a.end || e.startDate <= String(a.end))),
    save_life_event: a => { const input = a.input as LifeEvent, id = input.id ?? Math.max(0, ...events.map(e => e.id)) + 1; const old = events.findIndex(e => e.id === id); const value = { ...input, id, createdAt: now(), updatedAt: now() }; if (old < 0) events.push(value); else events[old] = value; return id; },
    delete_life_event: a => { const i = events.findIndex(e => e.id === a.id); if (i >= 0) events.splice(i, 1); },
    ai_task_list: () => [...tasks.values()].map(t => ({ id: t.id, title: t.title, template_id: t.template_id, workout_count: t.workout_ids.length, updated_at: t.updated_at, mcp_shared: t.mcp_shared, pinned: pinned.has(t.id) })),
    ai_task_get: a => { const t = tasks.get(String(a.id)); if (!t) throw new Error('Unknown sample task'); return structuredClone(t); },
    ai_task_save: a => { const t = structuredClone(a.task as AiTask); t.id ||= `demo-task-${tasks.size + 2}`; t.updated_at = now(); tasks.set(t.id, t); return structuredClone(t); },
    ai_task_delete: a => { tasks.delete(String(a.id)); },
    ai_task_delete_many: a => (a.ids as string[]).flatMap(id => { const task = tasks.get(id); tasks.delete(id); return task ? [{ task, pinned: pinned.has(id) }] : []; }),
    ai_task_set_pinned: a => { if (a.pinned) pinned.add(String(a.id)); else pinned.delete(String(a.id)); },
    ai_template_list: () => [...demoTemplates(), ...templates.values()],
    ai_template_save: a => { const t = structuredClone(a.template as AiTaskTemplate); t.id ||= `demo-template-${templates.size + 1}`; templates.set(t.id, t); return t; },
    ai_template_delete: a => { templates.delete(String(a.id)); },
    ai_task_attachment_stat: () => [],
    ai_exchange_list: () => exchanges.map(e => ({ ...e, document: e.plan_draft_id ? plan.state().drafts[0]?.document ?? e.document : null, publish_state: plan.state().drafts.length ? null : 'sent' })),
    get_device_profile: () => devices.profiles[0], get_device_profiles: () => devices,
    set_device_model_override: a => { devices.profiles[0].catalog_id = String(a.catalogId ?? 'amazfit-balance-2'); },
    get_local_api_status: () => ({ ...localApi }),
    get_mcp_sidecar: () => ({ path: 'C:\\Demo\\ZeppBridge\\zeppbridge-mcp.exe', data_dir_env: null }),
    save_mcp_bundle: () => 'Demo/ZeppBridge.mcpb',
    set_local_api_enabled: a => { localApi = { ...localApi, enabled: !!a.enabled, running: !!a.enabled, token_present: !!a.enabled }; return { ...localApi }; },
    reveal_local_api_token: () => token, rotate_local_api_token: () => { token += '-rotated'; return token; },
    get_storage_estimate: a => demoStorageEstimate(data, Number(a.days ?? DAYS)),
    get_data_health: health, run_database_integrity_check: () => ({ checked_at: now(), ok: true, detail: 'ok' }),
    compact_raw_payloads: () => ({ compacted: counts.heart_rate, skipped: 0, bytesBefore: 28_431_360, bytesAfter: 20_431_360 }),
    reprocess_local_data: () => ({ total_records: Object.values(counts).reduce((a, b) => a + b, 0), streams: { ...counts }, message: '' }),
    get_coverage_ledger: () => demoLedger(data), reset_coverage_ledger: () => demoLedger(data), retry_failed_backfill_chunks: () => demoLedger(data), start_history_backfill: () => demoLedger(data),
    probe_data_capabilities: () => demoCapabilities(data).items.filter(i => i.records > 0).map(i => ({ ...i, surface: 'v2_events', cadence: 'continuous', eventType: i.stream, subType: '', fields: ['timestamp', 'value'] })),
    list_backups: () => backups, create_manual_backup: () => { const b = makeBackup(`demo-backup-${backups.length + 1}`, 0); backups.unshift(b); return b; },
    verify_backup: a => verification(a.backupId), set_backup_pinned: a => { const b = getBackup(a.backupId); b.pinned = !!a.pinned; return b; },
    get_restore_preview: a => ({ manifest: getBackup(a.backupId), verification: verification(a.backupId), compatibility: 'same_schema', current_schema_version: 35, current_table_counts: counts, can_restore: true, blocker: null }),
    stage_restore: a => { pending = { backup_id: getBackup(a.backupId).id, staged_at: now(), rollback_backup_id: backups[0].id }; return pending; },
    get_pending_restore: () => pending, cancel_pending_restore: () => { pending = null; },
    cleanup_old_data: () => ({ deleted: 0 }), open_data_folder: () => null,
    save_fit_export: () => ({ path: 'Demo/ZeppBridge', record_count: data.workouts.length, bytes: 284_320, generated_at: now(), file_count: data.workouts.length }),
    prepare_ai_handoff: () => ({ mode: 'attachment', clipboardText: '', filePath: 'Demo/ZeppBridge.md', bytes: 24320, records: data.sleeps.length, redactions: [], metadata: { preciseRouteIncluded: false, authenticationFieldsRemoved: true, identityFieldsRemoved: true } }),
    submit_diagnostic_report: () => ({ status: 'simulated', report_id: 'demo-local', submitted: false }),
    submit_device_model_assignment: () => ({ status: 'simulated', report_id: 'demo-local', submitted: false }),
  };
  return { handlers, exchanges };
};
