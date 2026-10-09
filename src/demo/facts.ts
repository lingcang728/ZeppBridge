/**
 * 演示里「账号、设备、概览、一周对比、设置页各卡」要的数据。形状照真实后端返回的来，数值合成。
 */
import { at, dayKey, iso, round } from './rng';
import { DAYS, DEMO_DEVICE_ID, type DemoData } from './dataset';
import type { StorageEstimate } from '../types';

const average = (values: number[]): number => (values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : 0);

export const demoStorageEstimate = (data: DemoData, days = DAYS): StorageEstimate => ({
  free_bytes: 128_000_000_000, database_bytes: 28_431_360, estimated_add_bytes: Math.max(0, days - DAYS) * 78_000,
  requested_days: days, measured: true, allow_long_history: true, warn_tight_space: false,
  message: '', message_code: 'ui.estimate.measured', stop_reason: null,
  streams: Object.entries({ heart_rate: data.heart.length, sleep: data.sleeps.length, workouts: data.workouts.length,
    daily_metrics: Object.values(data.metrics).reduce((sum, points) => sum + points.length, 0) })
    .map(([stream, count]) => ({ stream, observed_days: DAYS, observed_bytes: count * 128,
      bytes_per_day: count * 128 / DAYS, measured: true, estimated_add_bytes: 0 })),
});

export const demoStatus = (data: DemoData) => {
  const synced = iso(new Date(data.now.getTime() - 8 * 60_000));
  return {
    configured: true, auth_state: 'ok', connection_state: 'connected', data_source: 'both', masked_user_id: '****0000',
    region_host: 'api-mifit.zepp.com', last_sync: synced, last_cloud_sync_at: synced, last_cloud_sync_outcome: 'updated',
    streams: [], capabilities: [], retention_days: 365, history_sync_days: 365, incremental_sync_days: 30, auto_sync_days: 3,
    storage: demoStorageEstimate(data),
    coverage: { earliest_day: dayKey(at(data.now, 1 - DAYS)), latest_day: dayKey(data.now), covered_days: DAYS },
    region_confidence: 'identified', compacting: false,
  };
};

export const demoDevices = (data: DemoData) => ({
  profiles: [{
    name: 'Amazfit Balance 2', canonical_name: 'Amazfit Balance 2', display_name: 'Amazfit Balance 2', catalog_id: 'amazfit-balance-2',
    image_key: 'amazfit-balance-2', kind: 'watch', match_status: 'exact', has_local_data: true,
    last_data_at: iso(new Date(data.now.getTime() - 8 * 60_000)), firmware: '3.8.2.1', serial: 'DEMO-0000', device_id: DEMO_DEVICE_ID,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  }],
  cache: { status: 'fresh', cached_at: iso(data.now), age_seconds: 120, refreshed: false },
});

export const demoOverview = (data: DemoData) => {
  const last = (name: string) => data.metrics[name][data.metrics[name].length - 1]?.value;
  const steps = last('steps') ?? 0;
  const latest = data.heart[data.heart.length - 1];
  return {
    current_hr: latest?.value, resting_hr: last('resting_hr'), hrv: last('hrv'), last_sleep_score: data.sleeps[0]?.score, readiness: last('readiness'),
    hybrid_charge: null, bio_charge: null, training_load: last('training_load'), vo2max: last('vo2max'), steps_today: steps, steps_goal: 10000,
    active_calories_today: Math.round(steps * 0.038), latest_heart_rate_at: latest?.timestamp, last_updated: iso(data.now),
    coverage: { days: DAYS, start: dayKey(at(data.now, 1 - DAYS)), end: dayKey(data.now), streams: 9 }, source_scope: 'device',
  };
};

/* —— 这一周 vs 前四周 —— */
export const demoWeeklyReport = (data: DemoData) => {
  const recentFrom = dayKey(at(data.now, -6));
  const baseFrom = dayKey(at(data.now, -34));
  const baseTo = dayKey(at(data.now, -7));
  const pick = (name: string, from: string, to: string) => data.metrics[name].filter((p) => p.date >= from && p.date <= to).map((p) => p.value);
  const sleepMinutes = (from: string, to: string) => data.sleeps.filter((s) => dayKey(new Date(s.end_time)) >= from && dayKey(new Date(s.end_time)) <= to).map((s) => s.duration_minutes);
  const workoutsIn = (from: string, to: string) => data.workouts.filter((w) => dayKey(new Date(w.start_time)) >= from && dayKey(new Date(w.start_time)) <= to).length;
  const loadIn = (from: string, to: string) => data.workouts.filter(w => dayKey(new Date(w.start_time)) >= from && dayKey(new Date(w.start_time)) <= to).reduce((sum, workout) => sum + (workout.training_load ?? 0), 0);
  const refs = Array.from({ length: 6 }, (_, i) => dayKey(at(data.now, -i)));
  const fact = (metric: string, unit: string, value: number, baseline: number, count: number) => {
    const delta = round(value - baseline, 1);
    return {
      fact_id: `weekly.${metric}`, metric, unit, value: round(value, 1), source: 'device', confidence: 'high', evidence_count: refs.length, evidence_refs: refs,
      baseline_count: count, baseline_window: { days: 28, distance_tolerance_percent: null, kind: 'previous_days', max_samples: 28, min_samples: 7 },
      comparison: { baseline_value: round(baseline, 1), delta, delta_percent: baseline ? round((delta / baseline) * 100, 1) : null, direction: delta > 0 ? 'higher' : delta < 0 ? 'lower' : 'same' },
      reason: null, reason_code: null,
    };
  };
  const perWeek = (n: number) => (n / 4);
  return {
    generated_at: iso(data.now), recent_start: recentFrom, recent_end: dayKey(data.now), baseline_start: baseFrom, baseline_end: baseTo,
    facts: [
      fact('resting_hr', 'bpm', average(pick('resting_hr', recentFrom, dayKey(data.now))), average(pick('resting_hr', baseFrom, baseTo)), pick('resting_hr', baseFrom, baseTo).length),
      fact('hrv', 'ms', average(pick('hrv', recentFrom, dayKey(data.now))), average(pick('hrv', baseFrom, baseTo)), 26),
      fact('stress', 'score', average(pick('stress', recentFrom, dayKey(data.now))), average(pick('stress', baseFrom, baseTo)), 27),
      fact('sleep_duration', 'min', average(sleepMinutes(recentFrom, dayKey(data.now))), average(sleepMinutes(baseFrom, baseTo)), 25),
      fact('sleep_start_regularity', 'min', 11.2, 13.9, 25),
      fact('workout_count', '次', workoutsIn(recentFrom, dayKey(data.now)), perWeek(workoutsIn(baseFrom, baseTo)), 4),
      fact('training_load', 'load', loadIn(recentFrom, dayKey(data.now)), perWeek(loadIn(baseFrom, baseTo)), 4),
    ],
  };
};

/* —— 设置页各卡 —— */
const STREAMS: Array<[string, number]> = [
  ['heart_rate', 30], ['sleep', 30], ['workouts', 90], ['steps', 30], ['daily_activity', 30], ['stress', 30],
  ['spo2', 30], ['respiratory_rate', 30], ['hrv', 30], ['hrv_rmssd', 30], ['recovery', 30], ['training_load', 30],
  ['vo2max', 365], ['lactate_threshold', 365], ['pai', 30],
];
export const demoStreamDates = (data: DemoData): Record<string, string[]> => ({
  ...Object.fromEntries(Object.entries(data.metrics).map(([name, points]) => [name, points.map(p => p.date)])),
  heart_rate: data.heart.map(p => dayKey(new Date(p.timestamp))),
  sleep: data.sleeps.map(p => dayKey(new Date(p.end_time))),
  workouts: data.workouts.map(p => dayKey(new Date(p.start_time))),
  daily_activity: data.metrics.steps.map(p => p.date),
  stress: data.stress.map(p => dayKey(new Date(p.timestamp))),
  recovery: data.metrics.readiness.map(p => p.date),
  lactate_threshold: data.metrics.lactate_threshold_hr.map(p => p.date),
  pai: data.metrics.pai_total.map(p => p.date),
});
export const demoCapabilities = (data: DemoData) => {
  const byStream = demoStreamDates(data);
  return {
  probedAt: iso(data.now),
  items: [
    ...STREAMS.map(([stream, windowDays]) => {
      const from = dayKey(at(data.now, 1 - windowDays));
      const dates = byStream[stream].filter(date => date >= from).sort();
      return { stream, status: dates.length ? 'available' : 'no_records', ingested: true, source: 'derived', windowDays,
        records: dates.length, recordsUnit: '条', recordsUnitCode: 'records', latestDate: dates[dates.length - 1] ?? null, note: null };
    }),
    ...['food'].map((stream) => ({
      stream, status: 'no_records', ingested: true, source: 'derived', windowDays: 365, records: 0, recordsUnit: '条', recordsUnitCode: 'records', latestDate: null, note: null,
    })),
    ...['blood_pressure', 'emotion'].map((stream) => ({
      stream, status: 'no_records', ingested: false, source: 'probed', windowDays: 365, records: 0, recordsUnit: '条', recordsUnitCode: 'records', latestDate: null, note: null,
    })),
  ],
  };
};

export const demoLedger = (data: DemoData) => {
  const dates = demoStreamDates(data), first = dayKey(at(data.now, 1 - DAYS));
  const months = new Set(data.metrics.steps.map(p => p.date.slice(0, 7))).size;
  const streams = [['daily_summary', 'steps'], ['heart_rate', 'heart_rate'], ['hrv', 'hrv'], ['sleep', 'sleep'], ['wellness', 'readiness'], ['workouts', 'workouts']];
  return { complete: true, completed_chunks: months * streams.length, total_chunks: months * streams.length,
    needs_manual_retry: false, failed_chunks_detail: [], requested_from: first, requested_to: dayKey(data.now),
    streams: streams.map(([stream, metric]) => ({ stream, requested_chunks: months, persisted_chunks: months,
      empty_chunks: 0, failed_chunks: 0, pending_chunks: 0, records: dates[metric].length,
      persisted_from: first, persisted_to: dayKey(data.now), empty_months: [] })),
  };
};

export const demoLocalApi = () => ({
  enabled: false, running: false, base_url: 'http://127.0.0.1:43921', address: '127.0.0.1:43921',
  workout_series_path: '/workouts/{id}/series', token_present: false,
});

export const demoPrefs = () => ({ archive_enabled: true, history_sync_days: 365, retention_days: 365 });
