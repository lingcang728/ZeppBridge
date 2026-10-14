import type { PlanIntensity } from '../../types/trainingPlan';

/** 强度 → 色块颜色（取应用已有的类别色，深浅两套主题自动换）。 */
export const INTENSITY_COLOR: Record<PlanIntensity, string> = {
  warmup: 'var(--altitude)',
  active: 'var(--training)',
  interval: 'var(--heart)',
  recovery: 'var(--activity)',
  rest: 'var(--subtle)',
  cooldown: 'var(--sleep-light)',
};

/** 图例里出现的顺序。 */
export const INTENSITY_ORDER: readonly PlanIntensity[] = ['warmup', 'active', 'interval', 'recovery', 'cooldown', 'rest'];

/** 一条训练里用到了哪些强度（按图例顺序），图例只列用到的。 */
export const usedIntensities = (segments: { intensity: PlanIntensity }[]): PlanIntensity[] => {
  const used = new Set(segments.map((segment) => segment.intensity));
  return INTENSITY_ORDER.filter((intensity) => used.has(intensity));
};
