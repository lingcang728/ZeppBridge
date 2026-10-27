import { describe, expect, it } from 'vitest';
import { angleOfDay, dayOfYear, treeRings, weekShape, WEEKS } from '../rings/geometry';
import { edgeSegments, hitRing, radiusAt, ringTicks, SAMPLES, treeLayout, weekAtFraction } from '../rings/tree';
import type { RingStar, RingYear } from '../../types/rings';

const year = (y: number, weeks: (number | null)[], dataDays = 100, stars: RingStar[] = []): RingYear => ({
  year: y, in_progress: false, data_days: dataDays, workouts: stars.length, active_days: 0, duration_s: 0, distance_m: 0, runs: 0,
  run_distance_m: 0, weeks, busiest_month: null, busiest_month_workouts: 0, longest_run: null, longest_workout: null,
  steps_total: null, steps_days: 0, sleep_avg_minutes: null, sleep_nights: 0, personal_records: [], races: [], stars,
});

describe('rings geometry', () => {
  it('puts January 1 at the top and counts days without time-zone drift', () => {
    expect(dayOfYear('2024-01-01')).toBe(0);
    expect(dayOfYear('2024-12-31')).toBe(365);
    expect(angleOfDay(0, 365)).toBeCloseTo(-Math.PI / 2);
  });

  it('keeps weeks without data as gaps instead of zero', () => {
    const weeks = Array<number | null>(WEEKS).fill(60);
    weeks[10] = null;
    weeks[11] = 0;
    const shape = weekShape(weeks);
    expect(shape[10]).toBeNull();
    expect(shape[11]).not.toBeNull();
    expect(weekShape(Array(WEEKS).fill(30)).every(v => v === 0.5)).toBe(true);
  });

  it('gives a blank year a thin ring and fills the radius exactly', () => {
    const rings = treeRings([year(2021, Array(WEEKS).fill(30)), year(2022, Array(WEEKS).fill(null), 0), year(2023, Array(WEEKS).fill(90))], 200, 10);
    expect(rings[0].inner).toBe(10);
    expect(rings[rings.length - 1]!.outer).toBeCloseTo(200);
    expect(rings[1].blank).toBe(true);
    const width = (i: number) => rings[i].outer - rings[i].inner;
    expect(width(1)).toBeLessThan(width(0));
    expect(width(0)).toBeLessThan(width(2));
  });
});

describe('tree rings', () => {
  const run = (id: string, date: string, duration_s: number | null = 1800): RingStar => ({ workout_id: id, date, kind: 'running', is_run: true, distance_m: 5000, duration_s });
  const busy = Array<number | null>(WEEKS).fill(120);

  it('grows ring on ring: each inner edge is the previous outer edge, and it fits the radius', () => {
    const quiet = Array<number | null>(WEEKS).fill(20);
    quiet[30] = 400;
    const layout = treeLayout([year(2022, busy), year(2023, quiet), year(2024, busy)], 300);
    expect(layout.bands.map(b => b.year)).toEqual([2022, 2023, 2024]);
    expect(layout.bands[1].inner).toBe(layout.bands[0].outer);
    expect(Math.max(...layout.bands[2].outer)).toBeCloseTo(300);
    for (const band of layout.bands) expect(band.outer.every((r, s) => r > band.inner[s])).toBe(true);
    // 那一周练得多，那里就鼓出来。
    const width = (f: number) => radiusAt(layout.bands[1].outer, f) - radiusAt(layout.bands[1].inner, f);
    expect(width(weekAtFraction(2023, 30.5 * 7 / 365).start + 0.004)).toBeGreaterThan(width(0.1));
  });

  it('breaks the line where a week has no data instead of drawing it as zero', () => {
    const weeks = [...busy];
    for (let w = 26; w <= 30; w += 1) weeks[w] = null;
    const [band] = treeLayout([year(2023, weeks)], 300).bands;
    expect(band.present.filter(p => !p).length).toBeGreaterThan(0);
    expect(band.present[0]).toBe(true);
    expect(band.present[Math.round(28.5 * 7 / 365 * SAMPLES)]).toBe(false);
    const gaps = edgeSegments(band).filter(seg => !seg.present);
    expect(gaps).toHaveLength(1);
  });

  it('draws one tick per workout inside its ring, longer for longer workouts, and never invents a duration', () => {
    const stars = [run('a', '2024-03-02', 600), run('b', '2024-03-02', 3 * 3600), run('c', '2024-09-10', null)];
    const layout = treeLayout([year(2024, busy, 300, stars)], 300);
    const ticks = ringTicks(layout.bands[0], stars);
    expect(ticks).toHaveLength(3);
    const length = (i: number) => Math.hypot(ticks[i].x2 - ticks[i].x1, ticks[i].y2 - ticks[i].y1);
    expect(length(0)).toBeLessThan(length(1));
    expect(length(2)).toBeGreaterThan(0);
    // 同一天两次不叠成一条。
    expect(ticks[0].f).not.toBe(ticks[1].f);
    for (const tick of ticks) expect(hitRing(layout, (tick.x1 + tick.x2) / 2, (tick.y1 + tick.y2) / 2)?.band.year).toBe(2024);
  });

  it('finds the ring and the week under the pointer', () => {
    const layout = treeLayout([year(2023, busy), year(2024, busy)], 300);
    expect(hitRing(layout, 0, 0)).toBeNull();
    expect(hitRing(layout, 0, -0.97 * radiusAt(layout.bands[1].outer, 0))?.band.year).toBe(2024);
    expect(hitRing(layout, 0, -1.01 * radiusAt(layout.bands[1].outer, 0))).toBeNull();
    const week = weekAtFraction(2024, 0.5);
    expect(week.from <= '2024-07-02' && week.to >= '2024-07-02').toBe(true);
    expect(weekAtFraction(2024, 0.999).to).toBe('2024-12-31');
  });
});
