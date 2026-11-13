import { describe, expect, it } from 'vitest';
import { kgIn, splitSetDuration, volumeUnitFor } from '../strengthFormat';
import { expectsRoute } from '../workoutGps';

describe('splitSetDuration', () => {
  it('整数秒不带小数', () => {
    expect(splitSetDuration(38_000)).toEqual({ minutes: 0, seconds: 38, digits: 0 });
    expect(splitSetDuration(72_000)).toEqual({ minutes: 1, seconds: 12, digits: 0 });
    expect(splitSetDuration(60_000)).toEqual({ minutes: 1, seconds: 0, digits: 0 });
  });
  it('有零头才带小数，尾零去掉、截断不进位', () => {
    expect(splitSetDuration(22_467)).toEqual({ minutes: 0, seconds: 22.46, digits: 2 });
    expect(splitSetDuration(22_500)).toEqual({ minutes: 0, seconds: 22.5, digits: 1 });
  });
  it('没有用时不编一个出来', () => {
    expect(splitSetDuration(null)).toBeNull();
    expect(splitSetDuration(0)).toBeNull();
    expect(splitSetDuration(-5)).toBeNull();
  });
});

describe('volumeUnitFor', () => {
  it('各组同一单位就用它，混用才按设置', () => {
    expect(volumeUnitFor(['kg', 'kg', null], 'lb')).toBe('kg');
    expect(volumeUnitFor(['lb', 'lb'], 'kg')).toBe('lb');
    expect(volumeUnitFor(['kg', 'lb'], 'lb')).toBe('lb');
    expect(volumeUnitFor([], 'kg')).toBe('kg');
  });
  it('换算', () => {
    expect(kgIn(100, 'kg')).toBe(100);
    expect(kgIn(0.45359237, 'lb')).toBeCloseTo(1, 6);
  });
});

describe('expectsRoute', () => {
  it('没有距离的运动不该有轨迹', () => {
    expect(expectsRoute('strength', null)).toBe(false);
    expect(expectsRoute('strength', 0)).toBe(false);
  });
  it('带距离的户外运动该有', () => {
    expect(expectsRoute('outdoor_running', 5000)).toBe(true);
    expect(expectsRoute('outdoor_cycling', 20000)).toBe(true);
  });
  it('室内 / 跑步机 / 泳池有距离也不会有 GPS', () => {
    expect(expectsRoute('indoor_cycling', 20000)).toBe(false);
    expect(expectsRoute('treadmill', 5000)).toBe(false);
    expect(expectsRoute('pool_swimming', 1500)).toBe(false);
  });
});
