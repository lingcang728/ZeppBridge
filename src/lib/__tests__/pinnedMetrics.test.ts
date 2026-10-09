import { describe, expect, it } from 'vitest';
import { DEFAULT_PINS, MAX_PINS, normalizePins, pinnableMetric, pinsFromStored, pinSparkValues, pinValueText } from '../pinnedMetrics';

describe('pinnedMetrics', () => {
  it('从没挑过时给一套默认的四块；自己清空过就保持空', () => {
    expect(pinsFromStored(null)).toEqual([...DEFAULT_PINS]);
    expect(DEFAULT_PINS).toHaveLength(MAX_PINS);
    expect(normalizePins(DEFAULT_PINS)).toEqual([...DEFAULT_PINS]);
    expect(pinsFromStored('[]')).toEqual([]);
    expect(pinsFromStored('["steps"]')).toEqual(['steps']);
  });

  it('只留认识的指标、去重、最多四个，顺序照用户点选的来', () => {
    expect(normalizePins(['weight', 'nope', 'resting_hr', 'weight', 'steps', 'stress', 'spo2'])).toEqual(['weight', 'resting_hr', 'steps', 'stress']);
    expect(normalizePins('weight')).toEqual([]);
    expect(normalizePins(null)).toHaveLength(0);
    expect(MAX_PINS).toBe(4);
  });

  it('旧的「睡眠 HRV」换成同一个数的 HRV (RMSSD)，不重复', () => {
    expect(normalizePins(['sleep_hrv', 'steps'])).toEqual(['hrv_rmssd', 'steps']);
    expect(normalizePins(['hrv_rmssd', 'sleep_hrv'])).toEqual(['hrv_rmssd']);
  });

  it('没有记录就是「—」，不补 0', () => {
    const metric = pinnableMetric('resting_hr')!;
    expect(pinValueText(metric, null)).toBe('—');
    expect(pinValueText(metric, { latest: null } as never)).toBe('—');
    expect(pinSparkValues(undefined)).toEqual([]);
  });

  it('体重保留一位小数', () => {
    const metric = pinnableMetric('weight')!;
    expect(pinValueText(metric, { latest: { date: '2026-09-27', value: 68.25 } } as never)).toMatch(/^68[.,]3$/);
  });
});
