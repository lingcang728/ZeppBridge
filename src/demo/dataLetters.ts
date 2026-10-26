/**
 * 演示里的信匣数据来信：三封每周来信、一个封着的胶囊、一个已经开封的胶囊、那年今天。
 * 数据全是合成的，沿用 dataset 的指标；没有一年前数据的项就不给，和真实现一样不编 0。
 */
import type { DemoData } from './dataset';
import { demoWeeklyReport } from './facts';
import { demoText } from './texts';
import { at, dayKey, iso, round } from './rng';
import type { DataLetter, LetterSnapshot, OnThisDayYear } from '../types/letters';

type DemoHandler = (args: Record<string, unknown>) => unknown;

export const createDemoDataLetters = (data: DemoData): Record<string, DemoHandler> => {
  const day = (offset: number) => dayKey(at(data.now, offset));
  const mean = (values: number[]) => (values.length ? round(values.reduce((s, v) => s + v, 0) / values.length, 1) : null);
  const snapshot = (end: number): LetterSnapshot => {
    const from = day(end - 27), to = day(end);
    const pick = (name: string) => (data.metrics[name] ?? []).filter(p => p.date >= from && p.date <= to).map(p => p.value);
    const sleeps = data.sleeps.filter(s => dayKey(new Date(s.end_time)) >= from && dayKey(new Date(s.end_time)) <= to).map(s => s.duration_minutes);
    const runs = data.workouts.filter(w => dayKey(new Date(w.start_time)) >= from && dayKey(new Date(w.start_time)) <= to);
    const value = (metric: string, unit: string, values: number[]) => ({ metric, unit, value: mean(values), days: values.length });
    return { start: from, end: to, values: [
      value('resting_hr', 'bpm', pick('resting_hr')), value('hrv', 'ms', pick('hrv')),
      value('sleep_duration', 'min', sleeps), value('steps', 'steps', pick('steps')),
      { metric: 'workout_count', unit: 'per_week', value: runs.length ? round(runs.length / 4, 1) : null, days: runs.length },
      { metric: 'training_load', unit: 'load', value: mean(runs.map(w => w.training_load ?? 0)), days: runs.length },
    ] };
  };
  const weekly = (weeksBack: number, id: number): DataLetter => {
    const report = demoWeeklyReport(data);
    const shift = (text: string) => dayKey(at(new Date(`${text}T12:00:00`), -7 * weeksBack));
    return { id, kind: 'weekly', written_at: iso(at(data.now, -7 * weeksBack, 8)), open_on: null, opened_at: null, sealed: false, note: null,
      weekly: { ...report, recent_start: shift(report.recent_start), recent_end: shift(report.recent_end), baseline_start: shift(report.baseline_start), baseline_end: shift(report.baseline_end) } as DataLetter['weekly'],
      written_snapshot: null, opened_snapshot: null };
  };
  let capsules: DataLetter[] = [
    { id: 10, kind: 'capsule', written_at: iso(at(data.now, -20, 21)), open_on: day(345), opened_at: null, sealed: true, note: null, weekly: null, written_snapshot: null, opened_snapshot: null },
    { id: 11, kind: 'capsule', written_at: iso(at(data.now, -330, 22)), open_on: day(-1), opened_at: null, sealed: true, note: null, weekly: null, written_snapshot: null, opened_snapshot: null },
  ];
  const letters = () => [...capsules, weekly(0, 1), weekly(1, 2), weekly(2, 3)]
    .sort((a, b) => b.written_at.localeCompare(a.written_at));
  const yearAgo = (): OnThisDayYear[] => {
    const date = new Date(data.now); date.setFullYear(date.getFullYear() - 1);
    const steps = (data.metrics.steps ?? [])[0]?.value ?? null;
    const resting = (data.metrics.resting_hr ?? [])[0]?.value ?? null;
    const run = data.workouts[data.workouts.length - 1];
    return [{ date: dayKey(date), years_ago: 1,
      values: [
        ...(steps === null ? [] : [{ metric: 'steps', unit: 'steps', value: round(steps), days: 1 }]),
        { metric: 'sleep_duration', unit: 'min', value: 402, days: 1 },
        ...(resting === null ? [] : [{ metric: 'resting_hr', unit: 'bpm', value: round(resting + 3), days: 1 }]),
      ],
      workouts: run ? [{ workout_id: run.workout_id, workout_type: run.effective_type, start_time: run.start_time, distance_meters: run.distance_meters ?? null, duration_seconds: run.moving_seconds ?? null }] : [],
    }];
  };
  return {
    data_letters_state: () => ({ letters: letters(), on_this_day: yearAgo() }),
    data_letters_seal_capsule: a => {
      const id = 100 + capsules.length;
      capsules = [{ id, kind: 'capsule', written_at: iso(new Date()), open_on: String(a.openOn), opened_at: null, sealed: true, note: null, weekly: null, written_snapshot: null, opened_snapshot: null }, ...capsules];
      return id;
    },
    data_letters_open_capsule: a => {
      const found = capsules.find(c => c.id === Number(a.id));
      if (!found) throw Object.assign(new Error('Unknown capsule'), { code: 'err.core.config' });
      Object.assign(found, { sealed: false, opened_at: iso(new Date()), note: found.id === 11 ? demoText().capsuleNote : '…', written_snapshot: snapshot(-330), opened_snapshot: snapshot(0) });
      return found;
    },
  };
};
