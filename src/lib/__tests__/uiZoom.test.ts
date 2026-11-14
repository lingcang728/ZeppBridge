import { describe, expect, it } from 'vitest';
import { ghostBox, sameZoom, scaleFromTransform, ZOOM_MIN_MS, ZOOM_MS, zoomLeg } from '../uiZoom';

describe('scaleFromTransform', () => {
  it('reads the scale back from computed transforms', () => {
    expect(scaleFromTransform('none')).toBe(1);
    expect(scaleFromTransform('')).toBe(1);
    expect(scaleFromTransform(undefined)).toBe(1);
    expect(scaleFromTransform('matrix(1.25, 0, 0, 1.25, 0, 0)')).toBeCloseTo(1.25);
    expect(scaleFromTransform('matrix(0.8, 0, 0, 0.8, 12, -3)')).toBeCloseTo(0.8);
    expect(scaleFromTransform('matrix3d(1.1, 0, 0, 0, 0, 1.1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)')).toBeCloseTo(1.1);
    expect(scaleFromTransform('scale(0.9)')).toBeCloseTo(0.9);
  });

  it('falls back to 1 on garbage instead of collapsing the page', () => {
    expect(scaleFromTransform('matrix(0, 0, 0, 0, 0, 0)')).toBe(1);
    expect(scaleFromTransform('matrix(nan, x)')).toBe(1);
    expect(scaleFromTransform('rotate(10deg)')).toBe(1);
  });
});

describe('zoomLeg', () => {
  it('scales body by target / applied from rest', () => {
    const leg = zoomLeg(0.8, 1, 1.25);
    expect(leg.from).toBe(1);
    expect(leg.to).toBeCloseTo(1.5625);
    expect(leg.durationMs).toBe(ZOOM_MS);
  });

  it('continues from the mid-flight position when retargeted (no restart)', () => {
    // 100% → 125% halfway (visual 1.12), then the user presses again towards 80%.
    const leg = zoomLeg(1, 1.12, 0.8);
    expect(leg.from).toBeCloseTo(1.12);
    expect(leg.to).toBeCloseTo(0.8);
  });

  it('reversing back to the applied zoom retraces to scale(1)', () => {
    const leg = zoomLeg(1, 1.05, 1);
    expect(leg.from).toBeCloseTo(1.05);
    expect(leg.to).toBe(1);
    expect(leg.durationMs).toBeGreaterThanOrEqual(ZOOM_MIN_MS);
    expect(leg.durationMs).toBeLessThan(ZOOM_MS);
  });

  it('shorter distances take less time but never less than the floor', () => {
    const small = zoomLeg(1, 1, 1.1).durationMs;
    const big = zoomLeg(0.8, 1, 1.25).durationMs;
    expect(small).toBeLessThan(big);
    expect(small).toBeGreaterThanOrEqual(ZOOM_MIN_MS);
    expect(zoomLeg(1, 1, 1).durationMs).toBe(0);
  });

  it('treats a broken current value as rest', () => {
    expect(zoomLeg(1, Number.NaN, 1.1).from).toBe(1);
    expect(zoomLeg(1, 0, 1.1).from).toBe(1);
  });
});

describe('ghostBox', () => {
  it('lays the frozen frame out at the old viewport, centred, top aligned', () => {
    expect(ghostBox(1.25)).toEqual({ width: 'calc(100% * 1.25)', height: 'calc(100% * 1.25)', marginLeft: 'calc(-50% * 1.25)' });
    expect(ghostBox(0.8 / 1.25).width).toBe('calc(100% * 0.64)');
  });
});

describe('sameZoom', () => {
  it('ignores float noise', () => {
    expect(sameZoom(1.1, 110 / 100)).toBe(true);
    expect(sameZoom(0.9, 0.8)).toBe(false);
  });
});
