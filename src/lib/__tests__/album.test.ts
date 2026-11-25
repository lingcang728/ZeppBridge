import { describe, expect, it, vi } from 'vitest';
import {
  byMonth, clockFromNoon, heatDays, periodDelta, previousMonth, readAlbumZoom, sleepMonthPeriods, sleepYearAnalysis, stageRing, stretchAtEdge,
  trayZoomAt, wheelFactor, workoutMonthPeriods, writeAlbumZoom, zoomStep, type AlbumTile,
} from '../album/album';
import type { SleepMonth, WorkoutMonth } from '../../types/album';

const workoutMonth = (key: string, count: number, km: number): WorkoutMonth => ({
  month: key, count, distance_m: km * 1000, duration_s: count * 600, cover: null, cover_distance_m: null,
});
const sleepMonth = (key: string, over: Partial<SleepMonth> = {}): SleepMonth => ({
  month: key, nights: 10, avg_duration_min: 420, avg_onset_min: 660, onset_nights: 10, onset_sd_min: 20,
  avg_score: 75, score_nights: 10, deep_min: 1, light_min: 2, rem_min: 3, awake_min: 4, ...over,
});
const tile = (id: string, day: string, weight: number, strength = 0.4): AlbumTile => ({
  id, day, month: day.slice(0, 7), to: {}, label: id, reading: '', color: 'red', strength, weight,
});

describe('album zoom gesture', () => {
  it('one mouse wheel notch is a whole step, a touchpad pinch accumulates', () => {
    // 缩小（deltaY > 0）往粗走：日 → 月。
    expect(zoomStep(wheelFactor(100), 0)).toBe(1);
    expect(zoomStep(wheelFactor(-100), 2)).toBe(-1);
    expect(zoomStep(wheelFactor(4), 0)).toBe(0);
    let scale = 1;
    for (let i = 0; i < 40 && !zoomStep(scale, 1); i += 1) scale *= wheelFactor(4);
    expect(zoomStep(scale, 1)).toBe(1);
  });

  it('stops at day and year with only a little stretch', () => {
    expect(zoomStep(0.5, 2)).toBe(0);
    expect(zoomStep(2, 0)).toBe(0);
    expect(stretchAtEdge(1.6, 0)).toBeLessThan(1.1);
    expect(stretchAtEdge(0.6, 2)).toBeGreaterThan(0.9);
    expect(stretchAtEdge(1.1, 1)).toBe(1.1);
  });

  it('snaps a tray drag to the nearest level, up is coarser', () => {
    expect(trayZoomAt(0, -14, 30)).toBe(0);
    expect(trayZoomAt(0, -16, 30)).toBe(1);
    expect(trayZoomAt(0, -200, 30)).toBe(2);
    expect(trayZoomAt(2, 61, 30)).toBe(0);
    expect(trayZoomAt(1, 400, 30)).toBe(0);
  });
});

describe('album months', () => {
  it('compares a month with the calendar month before it, never with a gap', () => {
    const periods = workoutMonthPeriods([workoutMonth('2026-11', 6, 181.8), workoutMonth('2026-10', 5, 219.4), workoutMonth('2026-08', 2, 10)]);
    expect(periodDelta(periods, '2026-11', (p) => p.distance_m)).toBeCloseTo(-37_600);
    // 九月没有记录：十月不和八月比。
    expect(periodDelta(periods, '2026-10', (p) => p.distance_m)).toBeNull();
    expect(previousMonth('2026-01')).toBe('2025-12');
  });

  it('keeps missing sleep readings as null instead of zero', () => {
    const [month] = sleepMonthPeriods([sleepMonth('2026-11', { avg_score: null, score_nights: 0, avg_duration_min: 0 })]);
    expect(month.avg_score).toBeNull();
    expect(month.avg_duration_min).toBeNull();
    expect(periodDelta(sleepMonthPeriods([sleepMonth('2026-11'), sleepMonth('2026-10', { avg_duration_min: 0 })]), '2026-11', (p) => p.avg_duration_min)).toBeNull();
  });
});

describe('sleep year analysis', () => {
  it('weights by nights, pools the bedtime spread and picks the best and worst month', () => {
    const months = [
      sleepMonth('2026-02', { nights: 3, avg_duration_min: 400, avg_onset_min: 600, onset_nights: 3, onset_sd_min: 0, avg_score: 70 }),
      sleepMonth('2026-01', { nights: 1, avg_duration_min: 480, avg_onset_min: 680, onset_nights: 1, onset_sd_min: 0, avg_score: 82 }),
      sleepMonth('2025-06', { nights: 4, avg_duration_min: 400 }),
    ];
    const year = sleepYearAnalysis(months, '2026')!;
    expect(year.nights).toBe(4);
    expect(year.avg_duration_min).toBe(420);
    expect(year.duration_delta_min).toBe(20);
    // 四晚入睡：600 ×3、680 ×1 → 均值 620，标准差 √(3·20² + 60²)/4 = √1200 ≈ 34.6。
    expect(year.onset_sd_min).toBeCloseTo(Math.sqrt(1200));
    expect(year.best).toEqual({ month: '2026-01', score: 82 });
    expect(year.worst).toEqual({ month: '2026-02', score: 70 });
    expect(year.stages).toEqual({ deep: 2, light: 4, rem: 6, awake: 8 });
  });

  it('says nothing it cannot back up', () => {
    const year = sleepYearAnalysis([sleepMonth('2026-03', { avg_score: null, score_nights: 0, onset_nights: 1 })], '2026')!;
    expect(year.duration_delta_min).toBeNull();
    expect(year.onset_sd_min).toBeNull();
    expect(year.best).toBeNull();
    expect(year.worst).toBeNull();
    expect(sleepYearAnalysis([sleepMonth('2026-03')], '2024')).toBeNull();
    // 只有一个月有评分：只写最好，不写最差。
    const single = sleepYearAnalysis([sleepMonth('2026-03')], '2026')!;
    expect(single.best?.month).toBe('2026-03');
    expect(single.worst).toBeNull();
  });

  it('draws a stage ring only when there are stages', () => {
    expect(stageRing({ deep: 0, light: 0, rem: 0, awake: 0 })).toEqual([]);
    const ring = stageRing({ deep: 1, light: 1, rem: 0, awake: 0 });
    expect(ring.map((arc) => arc.stage)).toEqual(['deep', 'light']);
    expect(ring[1]!.offset).toBe(-25);
  });

  it('writes bedtimes on either side of midnight', () => {
    expect(clockFromNoon(660)).toBe('23:00');
    expect(clockFromNoon(750)).toBe('00:30');
  });
});

describe('album calendar', () => {
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

describe('album zoom prefs', () => {
  it('remembers the level per list and reads the old level + density format', () => {
    const values = new Map<string, string>();
    vi.stubGlobal('window', { localStorage: { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => { values.set(k, v); } } });
    writeAlbumZoom('sleep', 'month');
    expect(readAlbumZoom('sleep')).toBe('month');
    const old = (value: object) => { window.localStorage.setItem('zeppbridge-album-workouts', JSON.stringify(value)); return readAlbumZoom('workouts'); };
    expect(old({ level: 'day', density: 0 })).toBe('day');
    expect(old({ level: 'day', density: 1 })).toBe('month');
    expect(old({ level: 'day', density: 2 })).toBe('year');
    expect(old({ level: 'month', density: 0 })).toBe('year');
    expect(old({ level: 'week', density: 7 })).toBe('day');
    vi.unstubAllGlobals();
    // 存储不可用（没有 window）：照样给默认值。
    expect(readAlbumZoom('sleep')).toBe('day');
  });
});
