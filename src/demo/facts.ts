/**
 * 演示里「账号、设备、概览、一周对比、设置页各卡」要的数据。形状照真实后端返回的来，数值合成。
 */
import { at, dayKey, iso, round } from './rng';
import { DEMO_DEVICE_ID, type DemoData } from './dataset';

const average = (values: number[]): number => (values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : 0);

export const demoStatus = (data: DemoData) => {
  const synced = iso(new Date(data.now.getTime() - 8 * 60_000));
  return {
    configured: true, auth_state: 'ok', connection_state: 'connected', data_source: 'both', masked_user_id: '****0000',
    region_host: 'api-mifit.zepp.com', last_sync: synced, last_cloud_sync_at: synced, last_cloud_sync_outcome: 'updated',
    streams: [], capabilities: [], retention_days: 365, history_sync_days: 365, incremental_sync_days: 30, auto_sync_days: 3,
    coverage: { earliest_day: dayKey(at(data.now, -89)), latest_day: dayKey(data.now), covered_days: 86 },
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
  const midnight = at(data.now, 0).getTime();
  const share = Math.min(1, (data.now.getTime() - midnight) / (20 * 3_600_000));
  const steps = Math.round(9800 * share * 0.9);
  const latest = data.heart[data.heart.length - 1];
  return {
    current_hr: latest?.value, resting_hr: 54, hrv: last('hrv'), last_sleep_score: data.sleeps[0]?.score, readiness: last('readiness'),
    hybrid_charge: null, bio_charge: null, training_load: last('training_load'), vo2max: last('vo2max'), steps_today: steps, steps_goal: 10000,
    active_calories_today: Math.round(steps * 0.038), latest_heart_rate_at: latest?.timestamp, last_updated: iso(data.now),
    coverage: { days: 90, start: dayKey(at(data.now, -89)), end: dayKey(data.now), streams: 9 }, source_scope: 'device',
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
      fact('resting_hr', 'bpm', 54.6, 56.1, 26),
      fact('hrv', 'ms', average(pick('hrv', recentFrom, dayKey(data.now))), average(pick('hrv', baseFrom, baseTo)), 26),
      fact('stress', 'score', average(pick('stress', recentFrom, dayKey(data.now))), average(pick('stress', baseFrom, baseTo)), 27),
      fact('sleep_duration', 'min', average(sleepMinutes(recentFrom, dayKey(data.now))), average(sleepMinutes(baseFrom, baseTo)), 25),
      fact('sleep_start_regularity', 'min', 11.2, 13.9, 25),
      fact('workout_count', '次', workoutsIn(recentFrom, dayKey(data.now)), perWeek(workoutsIn(baseFrom, baseTo)), 4),
      fact('training_load', 'load', pick('training_load', recentFrom, dayKey(data.now)).reduce((s, v) => s + v, 0), perWeek(pick('training_load', baseFrom, baseTo).reduce((s, v) => s + v, 0)), 4),
    ],
  };
};

/* —— 设置页各卡 —— */
const STREAMS: Array<[string, number, number]> = [
  ['heart_rate', 30, 31200], ['sleep', 30, 26], ['workouts', 90, 41], ['steps', 30, 30], ['daily_activity', 30, 30], ['stress', 30, 1840],
  ['spo2', 30, 27], ['respiratory_rate', 30, 29], ['hrv', 30, 28], ['hrv_rmssd', 30, 28], ['recovery', 30, 30], ['training_load', 30, 30],
  ['vo2max', 365, 88], ['lactate_threshold', 365, 4], ['pai', 30, 30],
];
export const demoCapabilities = (data: DemoData) => ({
  probedAt: iso(data.now),
  items: [
    ...STREAMS.map(([stream, windowDays, records]) => ({
      stream, status: 'available', ingested: true, source: 'derived', windowDays, records, recordsUnit: '条', recordsUnitCode: 'records', latestDate: dayKey(data.now), note: null,
    })),
    ...['weight', 'food'].map((stream) => ({
      stream, status: 'no_records', ingested: true, source: 'derived', windowDays: 365, records: 0, recordsUnit: '条', recordsUnitCode: 'records', latestDate: null, note: null,
    })),
    ...['blood_pressure', 'emotion'].map((stream) => ({
      stream, status: 'no_records', ingested: false, source: 'probed', windowDays: 365, records: 0, recordsUnit: '条', recordsUnitCode: 'records', latestDate: null, note: null,
    })),
  ],
});

export const demoLedger = (data: DemoData) => ({
  complete: true, completed_chunks: 36, total_chunks: 36, needs_manual_retry: false, failed_chunks_detail: [],
  requested_from: dayKey(at(data.now, -365)), requested_to: dayKey(data.now),
  streams: ['daily_summary', 'heart_rate', 'hrv', 'sleep', 'wellness', 'workouts'].map((stream) => ({
    stream, requested_chunks: 6, persisted_chunks: 6, empty_chunks: 0, failed_chunks: 0, pending_chunks: 0, records: 800,
    persisted_from: dayKey(at(data.now, -365)), persisted_to: dayKey(data.now), empty_months: [],
  })),
});

export const demoLocalApi = () => ({
  enabled: false, running: false, base_url: 'http://127.0.0.1:43921', address: '127.0.0.1:43921',
  workout_series_path: '/workouts/{id}/series', token_present: false,
});

export const demoPrefs = () => ({ archive_enabled: true, history_sync_days: 365, retention_days: 365 });
