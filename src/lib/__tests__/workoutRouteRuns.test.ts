import { describe, expect, it } from 'vitest';
import { buildRouteCanvas, buildRouteRuns } from '../workoutRoute';
import type { WorkoutSeries } from '../../types';

const at = (second: number) => new Date(Date.UTC(2026, 9, 1, 6, 0, second)).toISOString();

const series = (points: Array<[number, number, number]>, paces: Array<[number, number]>): WorkoutSeries => ({
  route: points.map(([second, latitude, longitude]) => ({ timestamp: at(second), latitude, longitude })),
  samples: paces.map(([second, pace]) => ({ timestamp: at(second), pace })),
  pauses: [],
} as unknown as WorkoutSeries);

describe('buildRouteRuns', () => {
  it('merges adjacent same-colour segments and keeps gaps as separate runs', () => {
    // 0–30 秒连续；30→400 秒跳点（超过两分钟）不画；400–430 秒又连续。
    const canvas = buildRouteCanvas(series(
      [[0, 30.0, 120.0], [10, 30.0001, 120.0], [20, 30.0002, 120.0], [30, 30.0003, 120.0], [400, 30.0004, 120.0], [410, 30.0005, 120.0], [420, 30.0006, 120.0]],
      [],
    ));
    expect(canvas).not.toBeNull();
    const runs = buildRouteRuns(canvas!.segments);
    expect(runs).toHaveLength(2);
    expect(runs[0].points).toHaveLength(4);
    expect(runs[1].points).toHaveLength(3);
    expect(runs[0].points[0]).toEqual([30.0, 120.0]);
    // 跳点那一段不会被并进来，宁可断开也不画假的连线。
    expect(runs[0].points[runs[0].points.length - 1]).toEqual([30.0003, 120.0]);
    expect(runs[1].points[0]).toEqual([30.0004, 120.0]);
  });

  it('splits where the pace colour changes but keeps the shared point', () => {
    const canvas = buildRouteCanvas(series(
      [[0, 30.0, 120.0], [10, 30.0001, 120.0], [20, 30.0002, 120.0], [30, 30.0003, 120.0], [40, 30.0004, 120.0]],
      [[0, 4], [10, 4], [20, 4], [30, 9], [40, 9]],
    ));
    const runs = buildRouteRuns(canvas!.segments);
    expect(runs.length).toBeGreaterThan(1);
    for (let index = 1; index < runs.length; index += 1) {
      expect(runs[index].points[0]).toEqual(runs[index - 1].points[runs[index - 1].points.length - 1]);
      expect(runs[index].color).not.toBe(runs[index - 1].color);
    }
  });
});
