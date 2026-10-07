import type { DemoData } from './dataset';
import type { AiTaskCategory } from '../lib/bridge/types';
import type { DayStripRow } from '../types/timeBridge';
import { addDays } from '../lib/aiTask/bridgeScale';
import { dayKey } from './rng';

/** Browser demo adapter: derive the same seven rows from its existing synthetic dataset. */
export const demoDayStrip = (data: DemoData, count: number, end: string): DayStripRow[] => {
  const specs: [AiTaskCategory, string, string][] = [
    ['sleep','duration_minutes','min'], ['recovery','readiness','score'],
    ['resting_hr','resting_hr','bpm'], ['heart_rate','heart_rate','bpm'], ['workout','moving_seconds','min'],
    ['training','training_load','load'], ['body','weight','kg'],
  ];
  return specs.map(([category,metric,unit]) => ({ category, metric, cells: Array.from({ length: Math.min(90,Math.max(1,count)) },(_,i) => {
    const date = addDays(end,1-count+i);
    const workouts = data.workouts.filter(w => dayKey(new Date(w.start_time)) === date);
    const sleeps = data.sleeps.filter(s => dayKey(new Date(s.end_time)) === date);
    const reading = data.metrics[metric]?.find(p => p.date === date);
    const value = category === 'sleep' ? sleeps.length ? sleeps.reduce((n,s) => n + (s.duration_minutes ?? 0),0) : null
      : category === 'workout' ? workouts.length && workouts.every(w => w.moving_seconds != null) ? workouts.reduce((n,w) => n + w.moving_seconds! / 60,0) : null
      : reading?.value ?? null;
    return { date, has: category === 'workout' ? workouts.length > 0 : category === 'sleep' ? sleeps.length > 0 : reading != null, value, unit: value === null ? null : unit, workout_ids: category === 'workout' ? workouts.map(w => w.workout_id) : [] };
  }) }));
};
