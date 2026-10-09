import type { DemoData } from './dataset';
import { at, dayKey, round } from './rng';
import type { MetricBaseline } from '../lib/bridge/types';
import type { DailyHeartRateExtreme, HeartRateZoneOptions, HeartRateZonePreference, HourlySteps, TrainingBalancePoint, Workout, WorkoutInsight, WorkoutSeries } from '../types';

/** All detail views derive from the same sample records, never an unrelated set of totals. */
export const demoWorkoutSeries = (workout: Workout): WorkoutSeries => {
  const start = Date.parse(workout.start_time), seconds = workout.moving_seconds ?? 1;
  const distance = workout.distance_meters ?? 1, pace = seconds / distance * 1000;
  const running = workout.effective_type === 'running';
  const samples = Array.from({ length: Math.floor(seconds / 10) + 1 }, (_, i) => ({
    timestamp: new Date(start + i * 10_000).toISOString(),
    heart_rate: Math.round((workout.avg_hr ?? 140) + Math.sin(i / 13) * 6 - Math.max(0, 12 - i)),
    speed: distance / seconds * (1 + Math.sin(i / 15) * .035),
    pace: pace / 60 * (1 - Math.sin(i / 15) * .035),
    cadence: running ? Math.round((workout.avg_cadence_spm ?? 172) + Math.sin(i / 8) * 3) : null,
    stride_cm: running ? round(workout.avg_stride_cm ?? 98, 1) : null,
    altitude_m: round(38 + Math.sin(i / 38) * 14, 1),
    power_watts: running ? Math.round(234 + Math.sin(i / 12) * 16) : null,
    ground_contact_ms: running ? Math.round(241 + Math.sin(i / 8) * 8) : null,
    vertical_oscillation_mm: running ? round(79 + Math.sin(i / 15) * 4, 1) : null,
    vertical_ratio_pct: running ? 8.1 : null,
    equivalent_pace_s_per_km: pace,
  }));
  const splits = Array.from({ length: Math.ceil(distance / 1000) }, (_, i) => {
    const meters = Math.min(1000, distance - i * 1000);
    const from = round(seconds * i * 1000 / distance, 1), to = round(seconds * Math.min(distance, (i + 1) * 1000) / distance, 1);
    return { index: i + 1, start_time: new Date(start + seconds * i * 1000 / distance * 1000).toISOString(),
      end_time: new Date(start + seconds * Math.min(distance, (i + 1) * 1000) / distance * 1000).toISOString(),
      distance_m: meters, duration_seconds: round(to - from, 1), pace_min_per_km: pace / 60,
      avg_hr: workout.avg_hr, max_hr: workout.max_hr, partial: meters < 1000 };
  });
  // A clearly synthetic loop, never a person's location history.
  const radius = distance / (2 * Math.PI * 111320);
  const route = workout.gps_available ? samples.map((sample, i) => {
    const angle = i / Math.max(1, samples.length - 1) * Math.PI * 2;
    return { timestamp: sample.timestamp, latitude: 25.035 + radius * Math.sin(angle), longitude: 121.535 + radius * Math.cos(angle) / Math.cos(25.035 * Math.PI / 180), altitude_m: sample.altitude_m };
  }) : [];
  return { workout_id: workout.workout_id, samples, route, pauses: [], splits,
    laps: splits.map(s => ({ ...s, avg_hr: s.avg_hr ?? null, max_hr: s.max_hr ?? null })),
    summary: { average_pace: pace / 60, average_cadence: workout.avg_cadence_spm, max_cadence: workout.max_cadence_spm,
      average_stride_cm: workout.avg_stride_cm, elevation_gain_m: workout.elevation_gain_m, elevation_loss_m: workout.elevation_loss_m,
      average_power_watts: running ? 234 : null, max_power_watts: running ? 250 : null,
      average_ground_contact_ms: running ? 241 : null, average_vertical_oscillation_mm: running ? 79 : null,
      average_vertical_ratio_pct: running ? 8.1 : null, best_equivalent_pace_s_per_km: pace },
    climbs: { method: { smoothing_window_s: 30, reversal_m: 8, min_change_m: 10, min_grade_pct: 1, moving_speed_m_s: 1 }, segments: [] } };
};

export const demoBaselines = (data: DemoData, names: string[]): MetricBaseline[] => names.flatMap(metric => {
  const points = data.metrics[metric]?.slice(-29) ?? [], latest = points[points.length - 1];
  if (!latest || points.length < 15) return [];
  const values = points.slice(0, -1).map(p => p.value).sort((a, b) => a - b);
  const median = values[Math.floor(values.length / 2)], spread = Math.max(.1, values[values.length - 1] - values[0]);
  const delta = round(latest.value - median, 2), direction = delta > spread * .3 ? 'above' : delta < -spread * .3 ? 'below' : 'usual';
  return [{ metric, latest_date: latest.date, latest: latest.value, median, spread, days: values.length, delta, direction, message_code: `ui.metric_baseline.${direction}` }];
});

export const demoHourlySteps = (data: DemoData, start: string, end: string): HourlySteps[] => data.metrics.steps
  .filter(p => p.date >= start && p.date <= end).flatMap(p => {
    const hours = p.date === dayKey(data.now) ? data.now.getHours() + 1 : 24;
    const weights = Array.from({ length: hours }, (_, h) => h < 6 ? 0 : h === 7 || h === 18 ? 5 : 1);
    const sum = weights.reduce<number>((a, b) => a + b, 0) || 1;
    let cumulative = 0;
    return weights.map((weight, hour) => {
      const before = Math.round(cumulative / sum * p.value); cumulative += weight;
      return { date: p.date, hour, steps: Math.round(cumulative / sum * p.value) - before };
    });
  });

export const demoHeartExtremes = (data: DemoData, days: number): DailyHeartRateExtreme[] => {
  const from = dayKey(at(data.now, 1 - days)), buckets = new Map<string, number[]>();
  for (const p of data.heart) { const date = dayKey(new Date(p.timestamp)); if (date >= from) { const values = buckets.get(date) ?? []; values.push(p.value); buckets.set(date, values); } }
  return [...buckets].map(([date, v]) => ({ date, min: Math.min(...v), max: Math.max(...v), average: round(v.reduce((a, b) => a + b, 0) / v.length, 1), samples: v.length }));
};

export const demoTrainingBalance = (data: DemoData, days: number): TrainingBalancePoint[] => {
  const loads = new Map<string, number>();
  for (const w of data.workouts) { const date = dayKey(new Date(w.start_time)); loads.set(date, (loads.get(date) ?? 0) + (w.training_load ?? 0)); }
  return Array.from({ length: Math.min(days, 337) }, (_, i, ) => {
    const end = at(data.now, i - Math.min(days, 337) + 1);
    const sum = (n: number) => Array.from({ length: n }, (_, j) => loads.get(dayKey(at(end, -j))) ?? 0).reduce((a, b) => a + b, 0);
    const acute = sum(7), chronic = sum(28) / 4;
    return { date: dayKey(end), acute_7d: acute, chronic_28d: chronic, acute_days_with_data: 7, chronic_days_with_data: 28, acute_chronic_ratio: chronic ? round(acute / chronic, 2) : null };
  });
};

export const demoZones = (data: DemoData, preference: HeartRateZonePreference, days: number): HeartRateZoneOptions => {
  const maximum = Math.max(...data.workouts.map(w => w.max_hr ?? 0));
  const resting = Math.round(data.metrics.resting_hr.slice(-28).reduce((s, p) => s + p.value, 0) / 28);
  const bases = [
    { id: 'workout_max', kind: 'max_hr', label: 'Workout maximum', value: maximum, unit: 'bpm', source: 'workouts', measuredAt: data.now.toISOString() },
    { id: 'resting_28d', kind: 'resting_hr', label: 'Resting HR', value: resting, unit: 'bpm', source: 'daily_metrics', noteCount: 28 },
    { id: 'lactate_threshold', kind: 'threshold_hr', label: 'Lactate threshold', value: 168, unit: 'bpm', source: 'daily_metrics' },
  ];
  const bands = Array.from({ length: 5 }, (_, i) => ({ zone: i + 1, label: `Z${i + 1}`, lowPercent: 50 + i * 10, highPercent: 60 + i * 10 }));
  const models = ['max_hr', 'hr_reserve', 'lactate_threshold'].map(id => ({ id, label: id, formula: id, requires: id === 'hr_reserve' ? ['max_hr', 'resting_hr'] : [id === 'max_hr' ? 'max_hr' : 'threshold_hr'], bands, available: true }));
  const zones = bands.map(b => ({ zone: b.zone, label: b.label,
    minBpm: Math.round((preference.model === 'hr_reserve' ? resting : 0) + (preference.model === 'hr_reserve' ? maximum - resting : preference.model === 'lactate_threshold' ? 168 : maximum) * b.lowPercent / 100),
    maxBpm: Math.round((preference.model === 'hr_reserve' ? resting : 0) + (preference.model === 'hr_reserve' ? maximum - resting : preference.model === 'lactate_threshold' ? 168 : maximum) * b.highPercent / 100), seconds: 0 }));
  const from = Date.parse(at(data.now, -days).toISOString()); let below = 0, above = 0;
  for (const w of data.workouts.filter(w => Date.parse(w.start_time) >= from)) for (const s of demoWorkoutSeries(w).samples) {
    const zone = zones.find(z => s.heart_rate! >= z.minBpm && s.heart_rate! < z.maxBpm);
    if (zone) zone.seconds += 10; else if (s.heart_rate! < zones[0].minBpm) below += 10; else above += 10;
  }
  return { bases, models, preference, windowDays: days, report: preference.model ? { model: preference.model, modelLabel: preference.model, formula: preference.model, bases, zones, belowZone1Seconds: below, aboveZone5Seconds: above, totalSeconds: zones.reduce((s, z) => s + z.seconds, below + above), windowDays: days, source: 'workouts' } : null };
};

export const demoInsight = (data: DemoData, workout: Workout): WorkoutInsight => {
  if (workout.effective_type !== 'running') return { workout_id: workout.workout_id, workout_type: workout.effective_type, supported: false, unsupported_reason: null, unsupported_code: 'unsupported_workout_type', facts: [], baseline_included: [], baseline_excluded: [] };
  const peers = data.workouts.filter(w => w.workout_id !== workout.workout_id && w.effective_type === workout.effective_type && w.start_time < workout.start_time).slice(0, 8);
  return { workout_id: workout.workout_id, workout_type: workout.effective_type, supported: true, unsupported_reason: null,
    baseline_included: peers.map(w => ({ workout_id: w.workout_id, start_time: w.start_time, distance_meters: w.distance_meters ?? 0 })), baseline_excluded: [],
    heart_rate_drift: null, heart_rate_drift_unavailable: 'not_enough_samples',
    facts: ['avg_hr', 'distance', 'duration'].map(metric => {
      const key = metric === 'distance' ? 'distance_meters' : metric === 'duration' ? 'moving_seconds' : metric;
      const read = (w: Workout) => Number(w[key as keyof Workout]);
      const value = read(workout), baseline = peers.length ? peers.reduce((sum, w) => sum + read(w), 0) / peers.length : null;
      return { fact_id: `run.${metric}`, metric, value, unit: metric === 'avg_hr' ? 'bpm' : metric === 'distance' ? 'm' : 's',
        comparison: baseline ? { baseline_value: baseline, delta: value - baseline, delta_percent: (value - baseline) / baseline * 100, direction: value > baseline ? 'higher' : 'lower' } : null,
        baseline_window: { kind: 'comparable_runs', days: 90, min_samples: 3, max_samples: 8 }, baseline_count: peers.length,
        evidence_count: peers.length, source: 'device', confidence: 'high', reason: null, evidence_refs: peers.map(w => w.workout_id) };
    }) };
};
