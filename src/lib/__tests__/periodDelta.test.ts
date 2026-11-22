import { describe, expect, it } from 'vitest';
import { periodDelta, trailingMean } from '../periodDelta';

describe('periodDelta', () => {
  it('给方向和幅度', () => {
    expect(periodDelta(110, 100)).toBe('↑ +10%');
    expect(periodDelta(95, 100)).toBe('↓ −5.0%');
    expect(periodDelta(100.2, 100)).toBe('→ 0%');
  });
  it('前一段没有或为 0 时不比', () => {
    expect(periodDelta(10, null)).toBeNull();
    expect(periodDelta(10, 0)).toBeNull();
    expect(periodDelta(undefined, 5)).toBeNull();
  });
});

describe('trailingMean', () => {
  it('取往前窗口内有值的平均，不到 3 个读数不给', () => {
    const result = trailingMean([1, 2, 3, 4, null, 6], 3);
    expect(result[0]).toBeNull();
    expect(result[1]).toBeNull();
    expect(result[2]).toBe(2);
    expect(result[3]).toBe(3);
    expect(result[4]).toBeNull();
  });
});
