import { describe, expect, it } from 'vitest';
import { periodChange } from '../periodDelta';

describe('periodChange 的颜色', () => {
  it('越高越好的指标：涨是 good，跌是 bad', () => {
    expect(periodChange(110, 100, 'steps')?.tone).toBe('good');
    expect(periodChange(90, 100, 'steps')?.tone).toBe('bad');
    expect(periodChange(120, 100, 'hrv_rmssd')?.tone).toBe('good');
  });

  it('越低越好的指标：跌是 good，涨是 bad', () => {
    expect(periodChange(55, 60, 'resting_hr')?.tone).toBe('good');
    expect(periodChange(65, 60, 'resting_hr')?.tone).toBe('bad');
    expect(periodChange(8, 10, 'awake')?.tone).toBe('good');
  });

  it('不判断好坏的指标保持中性', () => {
    expect(periodChange(120, 100, 'training_load')?.tone).toBe('neutral');
    expect(periodChange(120, 100, 'weight')?.tone).toBe('neutral');
    expect(periodChange(120, 100)?.tone).toBe('neutral');
  });

  it('变化不到 0.5% 算持平（不上色），再小的变化也按方向上色', () => {
    expect(periodChange(100.2, 100, 'steps')?.tone).toBe('flat');
    expect(periodChange(99.8, 100, 'resting_hr')?.tone).toBe('flat');
    expect(periodChange(101, 100, 'steps')?.tone).toBe('good');
    expect(periodChange(101, 100, 'resting_hr')?.tone).toBe('bad');
  });

  it('没有前一段或前一段为 0 时不比', () => {
    expect(periodChange(10, null, 'steps')).toBeNull();
    expect(periodChange(10, 0, 'steps')).toBeNull();
  });
});
