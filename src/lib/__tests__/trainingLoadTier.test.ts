import { beforeEach, describe, expect, it } from 'vitest';
import { setLocale } from '../../i18n';
import {
  DEFAULT_TRAINING_LOAD_SCALE,
  effectiveLoadScale,
  isReferenceLoadScale,
  trainingLoadTier,
  trainingLoadTierLabel,
  trainingLoadTierText,
} from '../trainingLoadTier';

/*
 * 训练负荷分档（从 Overview.vue 抽出来的唯一一份）：比值口径与原来的一字不差——
 * < 1/6 偏低，< 1/2 中等，< 1 较高，其余很高；600 是参考刻度，后端没给正数
 * scale 就用它，且档位要标「参考」，不标会让人以为手表给过分级。
 */

describe('trainingLoadTier', () => {
  beforeEach(() => setLocale('zh'));

  it('null load has no tier', () => {
    expect(trainingLoadTier(null)).toBeNull();
    expect(trainingLoadTier(undefined)).toBeNull();
    expect(trainingLoadTier(Number.NaN)).toBeNull();
    expect(trainingLoadTierText(null)).toBeNull();
  });

  it('boundaries on the default reference scale of 600', () => {
    expect(trainingLoadTier(99, 600)).toBe('low');
    expect(trainingLoadTier(100, 600)).toBe('medium'); // 100 = 600/6，不再是偏低
    expect(trainingLoadTier(299, 600)).toBe('medium');
    expect(trainingLoadTier(300, 600)).toBe('high'); // 300 = 600/2
    expect(trainingLoadTier(599, 600)).toBe('high');
    expect(trainingLoadTier(600, 600)).toBe('veryHigh'); // 1.0 不小于 1
    expect(trainingLoadTier(2400, 600)).toBe('veryHigh');
  });

  it('a personal scale moves the same cut points', () => {
    expect(trainingLoadTier(49, 300)).toBe('low');
    expect(trainingLoadTier(50, 300)).toBe('medium'); // 50 = 300/6
    expect(trainingLoadTier(150, 300)).toBe('high');
    expect(trainingLoadTier(300, 300)).toBe('veryHigh');
  });

  it('a bad scale falls back to the reference 600', () => {
    expect(trainingLoadTier(100, 0)).toBe('medium'); // 落回 600：100/600 ≥ 1/6
    expect(trainingLoadTier(100, -5)).toBe('medium');
    expect(trainingLoadTier(100, undefined)).toBe('medium');
    expect(trainingLoadTier(100, null)).toBe('medium');
    expect(effectiveLoadScale(undefined)).toBe(DEFAULT_TRAINING_LOAD_SCALE);
    expect(effectiveLoadScale(0)).toBe(DEFAULT_TRAINING_LOAD_SCALE);
    expect(effectiveLoadScale(720)).toBe(720);
    expect(isReferenceLoadScale(undefined)).toBe(true);
    expect(isReferenceLoadScale(720)).toBe(false);
  });

  it('tier text carries the reference mark only on the reference scale', () => {
    expect(trainingLoadTierText(50)).toBe('偏低（参考）');
    expect(trainingLoadTierText(100)).toBe('中等（参考）');
    expect(trainingLoadTierText(700)).toBe('很高（参考）');
    expect(trainingLoadTierText(100, 300)).toBe('中等'); // 个人刻度不带「参考」
    expect(trainingLoadTierText(null)).toBeNull();
  });

  it('tier labels follow the interface language (zh / en / es)', () => {
    const tiers = ['low', 'medium', 'high', 'veryHigh'] as const;
    for (const tier of tiers) {
      setLocale('zh');
      expect(trainingLoadTierLabel(tier).length).toBeGreaterThan(0);
      setLocale('en');
      expect(trainingLoadTierLabel(tier), tier).not.toMatch(/[一-鿿]/);
      setLocale('es');
      expect(trainingLoadTierLabel(tier), tier).not.toMatch(/[一-鿿]/);
    }
    // 英文说法和概览抽出来之前一字不差，换文案必须是有意的。
    setLocale('en');
    expect(trainingLoadTierLabel('low')).toBe('low');
    expect(trainingLoadTierLabel('medium')).toBe('moderate');
    expect(trainingLoadTierLabel('high')).toBe('high');
    expect(trainingLoadTierLabel('veryHigh')).toBe('very high');
    expect(trainingLoadTierText(100)).toBe('moderate (reference)');
    setLocale('es');
    expect(trainingLoadTierText(700)).toBe('muy alta (referencia)');
  });
});
