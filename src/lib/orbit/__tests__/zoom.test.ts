import { describe, expect, it } from 'vitest';
import {
  WHEEL_ZOOM_FACTOR,
  ZOOM_MAX,
  ZOOM_MIN,
  clampZoom,
  clientToView,
  panForZoom,
  pointerToWorld,
  viewToWorld,
  worldToView,
  zoomFromWheel,
} from '../zoom';

describe('orbit zoom', () => {
  it('clamps to the contract range [0.6, 1.8]', () => {
    expect(clampZoom(0.1)).toBe(ZOOM_MIN);
    expect(clampZoom(1)).toBe(1);
    expect(clampZoom(99)).toBe(ZOOM_MAX);
    expect(ZOOM_MIN).toBe(0.6);
    expect(ZOOM_MAX).toBe(1.8);
  });

  it('wheel zoom follows z·exp(-deltaY·0.0015)', () => {
    expect(WHEEL_ZOOM_FACTOR).toBe(0.0015);
    expect(zoomFromWheel(1, -100)).toBeCloseTo(Math.exp(0.15), 6); // scroll up = in
    expect(zoomFromWheel(1, 100)).toBeCloseTo(Math.exp(-0.15), 6);
    expect(zoomFromWheel(1, 0)).toBe(1);
    expect(zoomFromWheel(0.61, 10_000)).toBe(ZOOM_MIN); // clamps
    expect(zoomFromWheel(1.79, -10_000)).toBe(ZOOM_MAX);
  });

  it('keeps the world point under the pointer fixed across a zoom step', () => {
    const center = { x: 400, y: 300 };
    const pan = { x: 12, y: -7 };
    const pointer = { x: 520, y: 210 }; // viewBox coords
    const zoom = 1.0;
    const next = 1.3;
    const worldBefore = viewToWorld(pointer, center, pan, zoom);
    const nextPan = panForZoom(pan, pointer, center, zoom, next);
    const worldAfter = viewToWorld(pointer, center, nextPan, next);
    expect(worldAfter.x).toBeCloseTo(worldBefore.x, 10);
    expect(worldAfter.y).toBeCloseTo(worldBefore.y, 10);
  });

  it('clientToView divides by the rect so CSS zoom cancels out', () => {
    // UI scale 125%: getBoundingClientRect returns the scaled rect, and
    // clientX arrives in the same scaled space — the ratio is unaffected.
    const viewW = 800;
    const viewH = 600;
    const rect = { left: 50, top: 40, width: 800 * 1.25, height: 600 * 1.25 };
    const view = clientToView(50 + 400 * 1.25, 40 + 300 * 1.25, rect, viewW, viewH);
    expect(view.x).toBeCloseTo(400, 6);
    expect(view.y).toBeCloseTo(300, 6);
  });

  it('pointerToWorld round-trips through worldToView', () => {
    const rect = { left: 10, top: 20, width: 800, height: 600 };
    const pan = { x: -30, y: 15 };
    const world = { x: 120, y: -85 };
    const view = worldToView(world, { x: 400, y: 300 }, pan, 1.4);
    const client = { x: rect.left + view.x, y: rect.top + view.y };
    const back = pointerToWorld(client.x, client.y, rect, 800, 600, pan, 1.4);
    expect(back.x).toBeCloseTo(world.x, 10);
    expect(back.y).toBeCloseTo(world.y, 10);
  });
});
