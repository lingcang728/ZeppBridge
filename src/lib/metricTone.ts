/**
 * 每项指标在界面上用哪种类别色——**只有这一份**。
 *
 * 概览置顶磁贴和点进去的那张趋势卡必须同色（用户 2026-10-04：静息心率封面红、点进去绿；
 * HRV (RMSSD) 封面蓝紫、点进去橙；活动时长封面黄、点进去绿）。以前磁贴、心率页、身体页、
 * 日常活动页各写各的颜色，同一个指标在不同地方是不同的颜色。现在它们都从这里取。
 *
 * 取的是当前主题色板里的值（深浅两套色相一致），在 computed / 模板里调用会跟着主题重算。
 */
import { resolvedTheme } from '../composables/useTheme';
import { chartPalettes, type ZeppSemanticColors } from './echartsTheme';

export type MetricTone = Exclude<keyof ZeppSemanticColors, 'sleep'> | 'sleepDeep' | 'sleepLight' | 'sleepRem';

const TONES: Record<string, MetricTone> = {
  // 睡眠与恢复
  resting_hr: 'heart',
  hrv: 'stride',
  hrv_rmssd: 'sleepLight',
  sleep_score: 'sleepRem',
  readiness: 'readiness',
  stress: 'calories',
  spo2: 'pace',
  spo2_odi: 'altitude',
  respiratory_rate: 'sleepRem',
  // 活动与训练
  steps: 'brand',
  distance: 'distance',
  active_calories: 'calories',
  active_minutes: 'altitude',
  training_load: 'training',
  vo2max: 'vo2',
  pai_total: 'calories',
  // 身体
  weight: 'distance',
  bmi: 'stride',
  body_fat_rate: 'calories',
  muscle_mass: 'stride',
  body_water_rate: 'pace',
  bone_mass: 'altitude',
  visceral_fat: 'calories',
  bmr: 'calories',
  height: 'altitude',
  // 饮食
  intake_calories: 'calories',
  intake_protein_g: 'stride',
  intake_fat_g: 'altitude',
  intake_carbs_g: 'pace',
};

export const metricTone = (metric: string): MetricTone => TONES[metric] ?? 'brand';

/** 类别色在给定色板里的实际值。 */
export const toneColor = (tone: MetricTone, colors: ZeppSemanticColors): string => {
  if (tone === 'sleepDeep') return colors.sleep.deep;
  if (tone === 'sleepLight') return colors.sleep.light;
  if (tone === 'sleepRem') return colors.sleep.rem;
  return colors[tone];
};

/** 这项指标在当前主题下的颜色。 */
export const metricColor = (metric: string): string =>
  toneColor(metricTone(metric), chartPalettes[resolvedTheme.value].series);
