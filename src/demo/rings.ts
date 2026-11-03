/**
 * 演示里的年轮：最近一年用演示数据集本身，更早的几年按同一个种子合成。刻意留了缺口——
 * 五年前 9 月才戴上表、三年前整年没戴（那圈留白）、两年前夏天断了四周——年轮「缺了就留白」要看得见。
 * 汇总口径和后端 `storage/rings.rs` 一致。
 */
import type { DemoData } from './dataset';
import { at, dayKey, makeRng } from './rng';
import type { AnnualRings, RingHighlight, RingStar, RingYear } from '../types/rings';

interface Item { id: string; date: string; kind: string; km: number | null; seconds: number | null }

const WEEKS = 53;
const isRun = (kind: string) => kind.includes('run');
const weekOf = (date: string) => {
  const [y, m, d] = date.split('-').map(Number);
  return Math.min(WEEKS - 1, Math.floor((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 86_400_000 / 7));
};

/** 更早几年的合成运动：每周 2–5 次，跑步为主；`skip` 里的日子没戴表。 */
const synthesize = (from: Date, to: Date, skip: (date: Date) => boolean, volume: number, seed: number) => {
  const rng = makeRng(seed);
  const items: Item[] = [];
  const days = new Set<string>();
  for (let day = new Date(from); day < to; day = at(day, 1)) {
    if (skip(day)) continue;
    const key = dayKey(day);
    days.add(key);
    if (!rng.chance(0.42 * volume)) continue;
    const kind = rng.chance(0.68) ? 'running' : rng.chance(0.5) ? 'cycling' : rng.chance(0.5) ? 'strength' : 'walking';
    const km = kind === 'strength' ? null : kind === 'cycling' ? rng.between(18, 46) : kind === 'walking' ? rng.between(3, 7) : rng.between(4, rng.chance(0.08) ? 21.5 : 13);
    const pace = kind === 'cycling' ? 150 : kind === 'walking' ? 660 : 330;
    const seconds = km === null ? rng.int(30, 55) * 60 : Math.round(km * pace * rng.between(0.9, 1.12));
    items.push({ id: `demo-ring-${key}`, date: key, kind, km, seconds });
  }
  return { items, days };
};

const highlight = (item: Item): RingHighlight => ({
  workout_id: item.id, date: item.date, kind: item.kind, distance_m: item.km === null ? null : Math.round(item.km * 1000), duration_s: item.seconds,
});

const ringYear = (year: number, today: string, items: Item[], days: Set<string>, steps: Map<string, number>, sleep: Map<string, number>): RingYear => {
  const mine = items.filter(i => i.date.startsWith(`${year}-`) && i.date <= today);
  const covered = new Set([...days].filter(d => d.startsWith(`${year}-`) && d <= today));
  mine.forEach(i => covered.add(i.date));
  const weeks: (number | null)[] = Array(WEEKS).fill(null);
  covered.forEach(d => { weeks[weekOf(d)] ??= 0; });
  const months = Array(12).fill(0);
  let longestRun: Item | null = null;
  let longestWorkout: Item | null = null;
  for (const i of mine) {
    months[Number(i.date.slice(5, 7)) - 1] += 1;
    if (i.seconds !== null) {
      weeks[weekOf(i.date)] = (weeks[weekOf(i.date)] ?? 0) + i.seconds / 60;
      if (!longestWorkout || (longestWorkout.seconds ?? 0) < i.seconds) longestWorkout = i;
    }
    if (isRun(i.kind) && i.km !== null && (!longestRun || (longestRun.km ?? 0) < i.km)) longestRun = i;
  }
  const busiest = months.reduce((best, n, i) => (n > (best === null ? 0 : months[best]) ? i : best), null as number | null);
  const inYear = <T,>(map: Map<string, T>) => [...map].filter(([d]) => d.startsWith(`${year}-`) && d <= today).map(([, v]) => v);
  const stepList = inYear(steps);
  const sleepList = inYear(sleep);
  const runs = mine.filter(i => isRun(i.kind));
  const stars: RingStar[] = mine.map(i => ({
    workout_id: i.id, date: i.date, kind: i.kind, is_run: isRun(i.kind), distance_m: i.km === null ? null : Math.round(i.km * 1000), duration_s: i.seconds,
  }));
  return {
    year,
    in_progress: year >= Number(today.slice(0, 4)),
    data_days: covered.size,
    workouts: mine.length,
    active_days: new Set(mine.map(i => i.date)).size,
    duration_s: mine.reduce((s, i) => s + (i.seconds ?? 0), 0),
    distance_m: Math.round(mine.reduce((s, i) => s + (i.km ?? 0) * 1000, 0)),
    runs: runs.length,
    run_distance_m: Math.round(runs.reduce((s, i) => s + (i.km ?? 0) * 1000, 0)),
    weeks,
    busiest_month: busiest === null ? null : busiest + 1,
    busiest_month_workouts: busiest === null ? 0 : months[busiest],
    longest_run: longestRun ? highlight(longestRun) : null,
    longest_workout: longestWorkout ? highlight(longestWorkout) : null,
    steps_total: stepList.length ? stepList.reduce((a, b) => a + b, 0) : null,
    steps_days: stepList.length,
    sleep_avg_minutes: sleepList.length ? sleepList.reduce((a, b) => a + b, 0) / sleepList.length : null,
    sleep_nights: sleepList.length,
    personal_records: [],
    races: [],
    stars,
  };
};

export const demoAnnualRings = (data: DemoData, raceResults: { name: string; date: string; seconds: number }[], recordDates: [RingYear['personal_records'][number], string][]): AnnualRings => {
  const now = data.now;
  const today = dayKey(now);
  const year = now.getFullYear();
  const windowStart = at(now, -364);
  const old = synthesize(new Date(year - 5, 8, 6), windowStart, day => {
    const y = day.getFullYear();
    if (y === year - 3) return true; // 整年没戴
    return y === year - 2 && day.getMonth() === 6 && day.getDate() > 2; // 七月断了四周
  }, 1, 20261222);
  const recent: Item[] = data.workouts.map(w => ({
    id: w.workout_id,
    date: dayKey(new Date(w.start_time)),
    kind: w.effective_type,
    km: w.distance_meters ? w.distance_meters / 1000 : null,
    seconds: Math.round((Date.parse(w.end_time) - Date.parse(w.start_time)) / 1000) || null,
  }));
  const items = [...old.items, ...recent];
  const days = new Set([...old.days, ...data.sleepDays, ...data.workoutDays, ...(data.metrics.steps ?? []).map(p => p.date.slice(0, 10))]);
  const steps = new Map((data.metrics.steps ?? []).map(p => [p.date.slice(0, 10), Math.round(p.value)] as [string, number]));
  const sleep = new Map(data.sleeps.map(s => [dayKey(new Date(s.end_time)), s.duration_minutes] as [string, number]));
  const years: RingYear[] = [];
  for (let y = year - 5; y <= year; y += 1) {
    const ring = ringYear(y, today, items, days, steps, sleep);
    ring.races = raceResults.filter(r => r.date.startsWith(`${y}-`)).map(r => ({ name: r.name, date: r.date, result_seconds: r.seconds }));
    ring.personal_records = recordDates.filter(([, d]) => d.startsWith(`${y}-`)).map(([key]) => key);
    years.push(ring);
  }
  return { years, today };
};
