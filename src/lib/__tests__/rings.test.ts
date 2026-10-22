import { describe, expect, it } from 'vitest';
import { angleOfDay, dayOfYear, treeRings, weekShape, WEEKS } from '../rings/geometry';
import { fillRings } from '../rings/lumina/shapes';
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

describe('rings particles', () => {
  const count = 6000;
  const pc = () => ({ pos: new Float32Array(count * 3), col: new Float32Array(count * 3) });
  /** 撤掉造型的后仰，量出每颗粒子在切面上的半径和第几天。 */
  const flat = (pos: Float32Array, i: number, days: number) => {
    const tilt = -0.5;
    const x = pos[i * 3];
    const y = pos[i * 3 + 1] * Math.cos(tilt) + pos[i * 3 + 2] * Math.sin(tilt);
    const angle = Math.atan2(-y, x);
    const day = (((angle + Math.PI / 2) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2) * days;
    return { r: Math.hypot(x, y), day };
  };

  it('leaves the weeks without data empty on the ring', () => {
    const weeks = Array<number | null>(WEEKS).fill(120);
    for (let w = 26; w <= 30; w += 1) weeks[w] = null;
    const target = pc();
    const focal = fillRings(target, count, [year(2023, weeks)], 2023);
    expect(focal.count).toBe(0);
    const bark = Math.round(count * 0.08);
    for (let i = 0; i < count - bark; i += 1) {
      const { r, day } = flat(target.pos, i, 365);
      if (r <= 1.05) continue; // 髓心
      expect(day < 26 * 7 || day >= 31 * 7).toBe(true);
    }
    expect(target.pos.every(Number.isFinite)).toBe(true);
  });

  it('gives each workout of the selected year its own glowing stars and none for other years', () => {
    const stars: RingStar[] = [
      { workout_id: 'a', date: '2024-03-04', kind: 'run', is_run: true, distance_m: 10000, duration_s: 3300 },
      { workout_id: 'b', date: '2024-07-06', kind: 'yoga', is_run: false, distance_m: null, duration_s: null },
    ];
    const years = [year(2023, Array(WEEKS).fill(60)), year(2024, Array(WEEKS).fill(60), 200, stars)];
    const target = pc();
    const focal = fillRings(target, count, years, 2024);
    expect(focal.count).toBeGreaterThan(0);
    expect(focal.base).toHaveLength(focal.count * 3);
    expect(fillRings(pc(), count, years, 2023).count).toBe(0);
  });
});
