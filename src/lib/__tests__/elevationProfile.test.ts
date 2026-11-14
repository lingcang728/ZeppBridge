import { describe, expect, it } from 'vitest';
import { slopeShare } from '../elevationProfile';
import type { WorkoutSeriesSample } from '../../types';

const T0 = Date.parse('2026-11-14T08:00:00Z');
/** 每秒一个点，速度 m/s，海拔由 altAt(秒) 给。 */
const ride = (seconds: number, speed: number, altAt: (s: number) => number | null): WorkoutSeriesSample[] =>
  Array.from({ length: seconds }, (_, s) => ({ timestamp: new Date(T0 + s * 1000).toISOString(), speed, altitude_m: altAt(s) }));

describe('slopeShare', () => {
  it('calls a sea-level ride with metre-level wobble flat', () => {
    const share = slopeShare(ride(600, 6, (s) => 6 + Math.sin(s / 7) * 1.5))!;
    expect(share.flat / share.total).toBeGreaterThan(0.95);
  });

  it('splits a climb and a descent by time', () => {
    // 前 300 秒 5% 上坡（5 m/s → 0.25 m/s 爬升），后 300 秒同坡下坡。
    const share = slopeShare(ride(600, 5, (s) => (s < 300 ? s * 0.25 : 75 - (s - 300) * 0.25)))!;
    expect(share.up).toBeGreaterThan(250);
    expect(share.down).toBeGreaterThan(250);
    expect(share.flat).toBeLessThan(60);
  });

  it('leaves out time standing still', () => {
    const samples = ride(400, 5, () => 10);
    for (let s = 100; s < 300; s += 1) samples[s]!.speed = 0;
    expect(slopeShare(samples)!.total).toBeLessThan(210);
  });

  it('falls back to pace when speed is missing', () => {
    const samples = ride(300, 4, () => 10).map(({ speed: _, ...rest }) => ({ ...rest, pace: 5 }));
    expect(slopeShare(samples)?.flat).toBeGreaterThan(250);
  });

  it('draws nothing without altitude, speed or enough moving time', () => {
    expect(slopeShare(ride(600, 5, () => null))).toBeNull();
    expect(slopeShare(ride(600, 0, () => 10))).toBeNull();
    expect(slopeShare(ride(30, 5, () => 10))).toBeNull();
    expect(slopeShare(undefined)).toBeNull();
  });
});
