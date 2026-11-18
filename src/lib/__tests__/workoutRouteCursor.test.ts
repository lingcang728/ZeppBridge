import { describe, expect, it } from 'vitest';
import { TRACK_CURSOR_MAX_GAP_MS, buildRouteCanvas, trackPointAt, type TrackPoint } from '../workoutRoute';

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

  it('shares the rendered route breaks for short pauses and GPS jumps', () => {
    const start = Date.UTC(2026, 0, 1);
    const at = (seconds: number) => new Date(start + seconds * 1000).toISOString();
    const route = [0, 10, 20, 30, 40, 50].map((time, i) => ({
      timestamp: at(time), latitude: 0, longitude: (i > 3 ? 1 : 0) + i * 0.0001,
    }));
    const canvas = buildRouteCanvas({
      route, samples: [], pauses: [{ start_time: at(11), end_time: at(19), kind: 'pause' }],
    })!;
    expect(canvas.segments).toHaveLength(3);
    expect(canvas.glow.match(/M/g)).toHaveLength(3);
    expect(trackPointAt(canvas.track, start + 15_000)).toBeNull();
    expect(trackPointAt(canvas.track, start + 35_000)).toBeNull();
    expect(trackPointAt(canvas.track, start + 45_000)).not.toBeNull();
  });

  it('does not draw across a long gap (a pause or lost signal)', () => {
    const gapped = [point(0, 0), point(600_000, 100)];
    // 正中间：两头都远，不标。
    expect(trackPointAt(gapped, 300_000)).toBeNull();
    // 贴着一头：标那个真实的点，而不是插值到没走过的直线上。
    expect(trackPointAt(gapped, 10_000)?.x).toBe(0);
  });
});
