import { describe, expect, it } from 'vitest';
import { metricTone } from '../metricTone';
import { PAIRED_METRICS } from '../cards/sources';

/* 牌、收集箱、图表必须同色（用户 10-07 核对的那几项）。颜色只从 metricTone 取，这里钉住映射。 */
describe('指标色', () => {
  it('用户核对过的几项', () => {
    expect(metricTone('stress')).toBe('calories'); // 压力橙
    expect(metricTone('spo2_odi')).toBe('altitude'); // 夜间血氧 ODI 黄
    expect(metricTone('training_load')).toBe('training'); // 训练负荷绿
    expect(metricTone('resting_hr')).toBe('heart'); // 静息心率红
    expect(metricTone('hrv')).toBe('stride'); // SDNN 青蓝
    expect(metricTone('hrv_rmssd')).toBe('sleepLight'); // RMSSD 紫蓝
  });

  it('乳酸阈值是一对：心率红、配速蓝；全天心率是心率页那条红线', () => {
    expect(PAIRED_METRICS.lactate_threshold_hr).toBe('lactate_threshold_pace');
    expect(metricTone('lactate_threshold_hr')).toBe('heart');
    expect(metricTone('lactate_threshold_pace')).toBe('pace');
    expect(metricTone('heart_rate')).toBe('heart');
  });
});
