import { describe, expect, it } from 'vitest';
import { rateOf, routePath, shortestArc, starBadge, starCells, zoneShares } from '../starCard';

describe('rings workout card', () => {
  it('shows only the cells it has data for', () => {
    const run = starCells({ kind: 'running', isRun: true, distanceM: 10000, seconds: 3000, avgHr: 151.4 });
    expect(run.map(c => c.key)).toEqual(['distance', 'duration', 'pace', 'hr']);
    expect(run[2].secondsPerKm).toBe(300);
    expect(run[3].bpm).toBe(151);
    // 力量训练：没有距离也不出配速，更不拿 0 填空。
    expect(starCells({ kind: 'strength', isRun: false, distanceM: null, seconds: 2400, avgHr: null }).map(c => c.key)).toEqual(['duration']);
    expect(starCells({ kind: 'outdoor_cycling', isRun: false, distanceM: 30000, seconds: 3600, avgHr: 0 }).map(c => [c.key, c.kmh ?? c.meters ?? c.seconds])).toEqual([
      ['distance', 30000], ['duration', 3600], ['speed', 30],
    ]);
  });

  it('picks pace or speed by sport', () => {
    expect(rateOf('hiking', false)).toBe('pace');
    expect(rateOf('indoor_cycling', false)).toBe('speed');
    expect(rateOf('pool_swim', false)).toBeNull();
  });

  it('draws the zone bar only when there was heart rate', () => {
    expect(zoneShares([])).toBeNull();
    expect(zoneShares([{ index: 1, upper_bound_bpm: 150, seconds: 300 }, { index: 0, upper_bound_bpm: 120, seconds: 100 }, { index: 2, upper_bound_bpm: 170, seconds: 0 }]))
      .toEqual([{ index: 0, share: 0.25 }, { index: 1, share: 0.75 }]);
  });

  it('only badges a real best of the year', () => {
    const year = { longest_run: { workout_id: 'a', date: '', kind: 'running', distance_m: 1, duration_s: 1 }, longest_workout: null };
    expect(starBadge({ workout_id: 'a' }, year)).toBe('farthestRun');
    expect(starBadge({ workout_id: 'b' }, year)).toBeNull();
  });

  it('fits a route into the silhouette box and skips empty tracks', () => {
    expect(routePath([{ latitude: 0, longitude: 0 }, { latitude: 31.2, longitude: 121.4 }])).toBeNull();
    const d = routePath([{ latitude: 31.2, longitude: 121.4 }, { latitude: 31.21, longitude: 121.41 }, { latitude: 31.2, longitude: 121.42 }])!;
    const nums = d.match(/-?\d+(\.\d+)?/g)!.map(Number);
    expect(Math.min(...nums)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...nums.filter((_, i) => i % 2 === 0))).toBeLessThanOrEqual(64);
  });

  it('turns the needle the short way round', () => {
    expect(shortestArc(0.95, 0.05)).toBeCloseTo(0.1);
    expect(shortestArc(0.05, 0.95)).toBeCloseTo(-0.1);
  });
});
