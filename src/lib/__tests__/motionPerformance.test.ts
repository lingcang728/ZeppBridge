import { afterEach, describe, expect, it } from 'vitest';
import {
  autoLite, claimHeavy, effectWasJanky, frameFloorMs, grainBudget, motionTier, noteEffect, power,
  resetMotionPerformance, tierFromCores, tierFromFrames,
} from '../motion/performance';

const frames = (ms: number, n = 40) => Array.from({ length: n }, () => ms);

describe('motion performance budget', () => {
  afterEach(() => resetMotionPerformance());

  it('guesses a ceiling from cores, then lets measured frames only lower it', () => {
    expect(tierFromCores(16)).toBe('high');
    expect(tierFromCores(4)).toBe('mid');
    expect(tierFromCores(2)).toBe('low');
    expect(tierFromCores(undefined)).toBe('mid');
    expect(tierFromFrames(frames(16.7), 'high')).toBe('high');
    expect(tierFromFrames(frames(16.7), 'mid')).toBe('mid');
    expect(tierFromFrames(frames(30), 'high')).toBe('mid');
    expect(tierFromFrames(frames(50), 'high')).toBe('low');
    // 窗口被拖走那种几百毫秒的一帧不算；样本太少不下结论。
    expect(tierFromFrames([...frames(16.7), 900, 1200, 800], 'high')).toBe('high');
    expect(tierFromFrames(frames(50, 5), 'high')).toBe('high');
  });

  it('lets one heavy effect run at a time, re-entrant for the same owner', () => {
    const locale = claimHeavy('ash-locale');
    expect(locale).not.toBeNull();
    expect(claimHeavy('ash-dissolve')).toBeNull();
    const again = claimHeavy('ash-locale');
    expect(again).not.toBeNull();
    locale!();
    expect(claimHeavy('ash-dissolve')).toBeNull();
    again!();
    expect(claimHeavy('ash-dissolve')).not.toBeNull();
  });

  it('drops a tier only after two janky effects in a row', () => {
    resetMotionPerformance('high');
    expect(effectWasJanky(frames(40))).toBe(true);
    expect(effectWasJanky(frames(17))).toBe(false);
    noteEffect(frames(40));
    noteEffect(frames(17));
    noteEffect(frames(40));
    expect(motionTier.value).toBe('high');
    noteEffect(frames(40));
    expect(motionTier.value).toBe('mid');
  });

  it('draws fewer grains and frames on battery, and auto effects go lite on low battery or a low tier', () => {
    resetMotionPerformance('high');
    expect(grainBudget()).toBe(36000);
    expect(frameFloorMs()).toBe(0);
    expect(autoLite.value).toBe(false);
    power.value = { onBattery: true, low: false };
    expect(grainBudget()).toBeCloseTo(21600);
    expect(frameFloorMs()).toBeGreaterThan(25);
    expect(autoLite.value).toBe(false);
    power.value = { onBattery: true, low: true };
    expect(autoLite.value).toBe(true);
    resetMotionPerformance('low');
    expect(autoLite.value).toBe(true);
  });
});
