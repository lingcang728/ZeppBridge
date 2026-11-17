import { describe, expect, it } from 'vitest';
import { TRACK_CURSOR_MAX_GAP_MS, trackPointAt, type TrackPoint } from '../workoutRoute';

const point = (t: number, x: number): TrackPoint => ({ t, x, y: x * 2, latitude: 30 + x / 1000, longitude: 120 });

describe('trackPointAt', () => {
  const track = [point(0, 0), point(10_000, 10), point(20_000, 20)];

  it('interpolates between the two neighbouring points by time', () => {
    const hit = trackPointAt(track, 15_000);
    expect(hit?.x).toBeCloseTo(15);
    expect(hit?.y).toBeCloseTo(30);
    expect(hit?.latitude).toBeCloseTo(30.015);
  });

  it('marks nothing when there is no hover or no track', () => {
    expect(trackPointAt(track, null)).toBeNull();
    expect(trackPointAt([], 5_000)).toBeNull();
  });

  it('does not invent a position far outside the recorded track', () => {
    expect(trackPointAt(track, -TRACK_CURSOR_MAX_GAP_MS - 1)).toBeNull();
    expect(trackPointAt(track, 20_000 + TRACK_CURSOR_MAX_GAP_MS + 1)).toBeNull();
    expect(trackPointAt(track, 25_000)?.x).toBe(20);
  });

  it('does not draw across a long gap (a pause or lost signal)', () => {
    const gapped = [point(0, 0), point(600_000, 100)];
    // 正中间：两头都远，不标。
    expect(trackPointAt(gapped, 300_000)).toBeNull();
    // 贴着一头：标那个真实的点，而不是插值到没走过的直线上。
    expect(trackPointAt(gapped, 10_000)?.x).toBe(0);
  });
});
