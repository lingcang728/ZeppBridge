import { describe, expect, it } from 'vitest';
import { elevationAxis, niceStep, paceAxis } from '../chartAxis';

describe('niceStep', () => {
  it('rounds to 1 / 2 / 2.5 / 5 × 10ⁿ', () => {
    expect(niceStep(0.7)).toBe(1);
    expect(niceStep(4.2)).toBe(5);
    expect(niceStep(162)).toBe(200);
    expect(niceStep(23)).toBe(25);
  });
});

describe('elevationAxis', () => {
  it('never dips below sea level for a flat ride above it (user 2026-11-14: 1–12 m drew -14..26)', () => {
    expect(elevationAxis([1, 7, 12], 20)).toEqual({ min: 0, max: 20, interval: 5 });
  });

  it('matches what Zepp draws for the same kind of route', () => {
    expect(elevationAxis([6, 10, 17], 20)).toEqual({ min: 0, max: 20, interval: 5 });
  });

  it('keeps flat ground flat on high ground', () => {
    const axis = elevationAxis([502, 506], 20)!;
    expect(axis.max - axis.min).toBeGreaterThanOrEqual(20);
    expect(axis.min).toBeGreaterThan(470);
    expect(axis.max).toBeLessThan(540);
  });

  it('fits a real climb with headroom on round ticks', () => {
    const axis = elevationAxis([300, 550, 800], 20)!;
    expect(axis.min).toBeLessThanOrEqual(300);
    expect(axis.max).toBeGreaterThanOrEqual(800);
    expect(axis.min % axis.interval).toBe(0);
    expect(axis.max % axis.interval).toBe(0);
  });

  it('still draws below sea level when the data is there', () => {
    const axis = elevationAxis([-28, -20, -15], 20)!;
    expect(axis.min).toBeLessThan(-28);
    expect(axis.max).toBeGreaterThanOrEqual(-15);
  });

  it('has nothing to say without data', () => {
    expect(elevationAxis([], 20)).toBeNull();
  });
});

describe('paceAxis', () => {
  it('frames the moving range on round seconds instead of the red-light spike', () => {
    // 3'20"–4'10"（200–250 秒）：轴应在几分钟内，不是 0–58 分钟。
    const axis = paceAxis(200, 250)!;
    expect(axis.min).toBeLessThanOrEqual(200);
    expect(axis.max).toBeGreaterThanOrEqual(250);
    expect(axis.max).toBeLessThan(330);
    expect(axis.min % axis.interval).toBe(0);
  });

  it('never goes below zero', () => {
    expect(paceAxis(3, 8)!.min).toBeGreaterThanOrEqual(0);
  });
});
