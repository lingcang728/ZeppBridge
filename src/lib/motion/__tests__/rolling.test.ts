import { describe, expect, it } from 'vitest';
import { rollDirection, rollingSlots, rollTarget, sameShape } from '../rolling';

describe('rollingSlots', () => {
  it('数字段逐位拆开、按从右数第几位配对，别的字整段一格', () => {
    expect(rollingSlots('243.8 km')).toEqual([
      { key: 'n0.4', digit: 2, text: '2' }, { key: 'n0.3', digit: 4, text: '4' }, { key: 'n0.2', digit: 3, text: '3' },
      { key: 'n0.1', digit: null, text: '.' }, { key: 'n0.0', digit: 8, text: '8' }, { key: 't0', digit: null, text: ' km' },
    ]);
    expect(rollingSlots('—')).toEqual([{ key: 't0', digit: null, text: '—' }]);
    expect(rollingSlots('1:58:11').map(s => s.text).join('')).toBe('1:58:11');
  });

  it('格子对得上、单位不变才逐位滚', () => {
    expect(sameShape(rollingSlots('1:58:11'), rollingSlots('2:03:45'))).toBe(true);
    expect(sameShape(rollingSlots('15 次'), rollingSlots('12 次'))).toBe(true);
    expect(sameShape(rollingSlots('9 次'), rollingSlots('10 次'))).toBe(false);
    expect(sameShape(rollingSlots('1 day'), rollingSlots('2 days'))).toBe(false);
    expect(sameShape(rollingSlots('243.8'), rollingSlots('1,024.5'))).toBe(false);
  });
});

describe('rollDirection', () => {
  it('只比数字：位数多的大，位数一样逐位比', () => {
    expect(rollDirection('243.8 km', '1,024.5 km')).toBe(1);
    expect(rollDirection('2:03:45', '1:58:11')).toBe(-1);
    expect(rollDirection('15 次', '15 次')).toBe(0);
  });
});

describe('rollTarget', () => {
  it('往上滚只往后找：9 → 1 经过 0', () => {
    expect(rollTarget(19, 1, 1)).toEqual({ from: 19, to: 21 });
    expect(rollTarget(13, 7, 1)).toEqual({ from: 13, to: 17 });
  });

  it('往下滚只往前找：1 → 9 经过 0', () => {
    expect(rollTarget(11, 9, -1)).toEqual({ from: 11, to: 9 });
    expect(rollTarget(17, 3, -1)).toEqual({ from: 17, to: 13 });
  });

  it('滚到一半接着滚：先挪进中间那遍，目标总在 0–29 之内', () => {
    expect(rollTarget(24.5, 8, 1)).toEqual({ from: 14.5, to: 18 });
    expect(rollTarget(4.5, 2, -1)).toEqual({ from: 14.5, to: 12 });
    for (const now of [0, 3.3, 9.99, 10, 19.9, 25, 29]) {
      for (const digit of [0, 5, 9]) {
        for (const dir of [1, -1] as const) {
          const { to } = rollTarget(now, digit, dir);
          expect(to).toBeGreaterThanOrEqual(0);
          expect(to).toBeLessThan(30);
          expect(((to % 10) + 10) % 10).toBe(digit);
        }
      }
    }
  });
});
