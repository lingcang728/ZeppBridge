import { describe, expect, it } from 'vitest';
import {
  coveredWindowValue,
  finiteOrNull,
  minutesToHours,
  stageMinutesForBar,
} from '../missingValues';

/*
 * 产品硬约束：没有采样就不画，缺失显示 — / 未提供，绝不用 0 填空。
 * 0 分钟 REM 和「云端没给 REM」是两件事，下面把这条钉死。
 */

describe('缺失不能被断言成 0', () => {
  it('null / undefined / NaN 都是 null，合法的 0 留下', () => {
    expect(finiteOrNull(null)).toBeNull();
    expect(finiteOrNull(undefined)).toBeNull();
    expect(finiteOrNull(Number.NaN)).toBeNull();
    expect(finiteOrNull(Number.POSITIVE_INFINITY)).toBeNull();
    expect(finiteOrNull(0)).toBe(0);
    expect(finiteOrNull(12)).toBe(12);
  });

  it('REM 未提供不会变成 0 分钟去画色条', () => {
    expect(stageMinutesForBar(null)).toBeNull();
    expect(stageMinutesForBar(undefined)).toBeNull();
    expect(stageMinutesForBar(0)).toBe(0);
    expect(stageMinutesForBar(48)).toBe(48);
  });

  it('未提供的分钟数不会变成 0.0 小时', () => {
    expect(minutesToHours(null)).toBeNull();
    expect(minutesToHours(undefined)).toBeNull();
    expect(minutesToHours(Number.NaN)).toBeNull();
    // 真的是 0 分钟：0.0 小时，不是「未提供」。
    expect(minutesToHours(0)).toBe(0);
    expect(minutesToHours(90)).toBe(1.5);
    expect(minutesToHours(6)).toBe(0.1);
  });

  it('窗口里 0 天有数据时不把 0.0 负荷拿去连线', () => {
    expect(coveredWindowValue(0, 0)).toBeNull();
    expect(coveredWindowValue(12.4, 0)).toBeNull();
    expect(coveredWindowValue(0, 3)).toBe(0);
    expect(coveredWindowValue(18, 7)).toBe(18);
  });
});
