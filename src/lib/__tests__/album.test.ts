import { describe, expect, it, vi } from 'vitest';
import {
  byMonth, clockFromNoon, heatDays, monthCells, monthsBetween, readAlbumPrefs, sleepYearPeriods, stretchAtEdge,
  wheelFactor, workoutYearPeriods, writeAlbumPrefs, zoomStep, type AlbumTile,
} from '../album/album';
import type { SleepMonth, WorkoutMonth } from '../../types/album';

const shape = (id: string) => ({ workout_id: id, width: 1, height: 0.5, points: [[0, 0], [1, 0.5]] as [number, number][] });
const month = (key: string, count: number, cover: number | null): WorkoutMonth => ({
  month: key, count, distance_m: count * 1000, duration_s: count * 600,
  cover: cover === null ? null : shape(`w-${key}`), cover_distance_m: cover,
});
const tile = (id: string, day: string, weight: number, strength = 0.4): AlbumTile => ({
  id, day, month: day.slice(0, 7), to: {}, label: id, reading: '', color: 'red', strength, weight,
});

describe('album zoom gesture', () => {
  it('one mouse wheel notch is a whole step, a touchpad pinch accumulates', () => {
    expect(zoomStep(wheelFactor(100), 0)).toBe(1);
    expect(zoomStep(wheelFactor(-100), 2)).toBe(-1);
    expect(zoomStep(wheelFactor(4), 0)).toBe(0);
    let scale = 1;
    for (let i = 0; i < 40 && !zoomStep(scale, 1); i += 1) scale *= wheelFactor(4);
    expect(zoomStep(scale, 1)).toBe(1);
  });

  it('stops at the densest and the sparsest level with only a little stretch', () => {
    expect(zoomStep(0.5, 2)).toBe(0);
    expect(zoomStep(2, 0)).toBe(0);
    expect(stretchAtEdge(1.6, 0)).toBeLessThan(1.1);
    expect(stretchAtEdge(0.6, 2)).toBeGreaterThan(0.9);
    expect(stretchAtEdge(1.1, 1)).toBe(1.1);
  });
});

describe('album periods', () => {
  it('adds months into years and keeps the longest cover of the year', () => {
    const years = workoutYearPeriods([month('2026-02', 3, 5000), month('2026-01', 2, 9000), month('2025-12', 1, null)]);
    expect(years.map((y) => y.key)).toEqual(['2026', '2025']);
    expect(years[0]).toMatchObject({ count: 5, distance_m: 5000, duration_s: 3000 });
    expect(years[0].cover?.workout_id).toBe('w-2026-01');
    expect(years[1].cover).toBeNull();
  });

  it('weights sleep averages by nights', () => {
    const night = (key: string, nights: number, avg: number): SleepMonth => ({
      month: key, nights, avg_duration_min: avg, avg_onset_min: 600, deep_min: 1, light_min: 2, rem_min: 3, awake_min: 4,
    });
    const [year] = sleepYearPeriods([night('2026-02', 3, 400), night('2026-01', 1, 480)]);
    expect(year.nights).toBe(4);
    expect(year.avg_duration_min).toBe(420);
    expect(year.stages).toEqual({ deep: 2, light: 4, rem: 6, awake: 8 });
  });

  it('writes bedtimes on either side of midnight', () => {
    expect(clockFromNoon(660)).toBe('23:00');
    expect(clockFromNoon(750)).toBe('00:30');
  });
});

describe('album calendar', () => {
  it('starts a month on its weekday with Monday first', () => {
    const november = monthCells('2026-11');
    expect(november.lead).toBe(6);
    expect(november.days).toHaveLength(30);
    expect(monthCells('2026-06').lead).toBe(0);
  });

  it('lists every month between the newest and the oldest', () => {
    expect(monthsBetween('2026-02', '2025-11')).toEqual(['2026-02', '2026-01', '2025-12', '2025-11']);
  });

  it('folds a day with several records into one cell led by the longest', () => {
    const days = heatDays([tile('a', '2026-11-02', 30), tile('b', '2026-11-02', 70), tile('c', '2026-11-03', 10)]);
    expect(days.get('2026-11-02')).toMatchObject({ count: 2, strength: 0.8 });
    expect(days.get('2026-11-02')?.lead.id).toBe('b');
    expect(days.get('2026-11-03')?.count).toBe(1);
  });

  it('groups by month keeping the order', () => {
    const groups = byMonth([tile('a', '2026-11-02', 1), tile('b', '2026-11-01', 1), tile('c', '2026-10-30', 1)]);
    expect(groups.map((g) => [g.month, g.items.length])).toEqual([['2026-11', 2], ['2026-10', 1]]);
  });
});

describe('album prefs', () => {
  it('remembers level and density per list and falls back on bad values', () => {
    const values = new Map<string, string>();
    vi.stubGlobal('window', { localStorage: { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => { values.set(k, v); } } });
    writeAlbumPrefs('sleep', { level: 'month', density: 2 });
    expect(readAlbumPrefs('sleep')).toEqual({ level: 'month', density: 2 });
    window.localStorage.setItem('zeppbridge-album-workouts', '{"level":"week","density":7}');
    expect(readAlbumPrefs('workouts')).toEqual({ level: 'day', density: 0 });
    vi.unstubAllGlobals();
    // 存储不可用（没有 window）：照样给默认值。
    expect(readAlbumPrefs('sleep')).toEqual({ level: 'day', density: 0 });
  });
});
