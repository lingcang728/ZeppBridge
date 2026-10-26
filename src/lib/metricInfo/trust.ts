/*
 * 每个指标是怎么来的（用户反馈 2026-10：「哪些数据可信、哪些不可信，比如 VO₂max」）。
 *
 * 只说来历，不打「准 / 不准」的分：那是判断，我们可能判断错、反而误导人。排不排除
 * 由用户自己在「?」浮层里拨（useMetricExclusions）。
 *
 * - measured：传感器直接读数（心率、步数、血氧、体重、血压）。
 * - computed：由读数或你自己的记录按公开的固定算式换算（BMI、负荷平衡、ODI、饮食合计）。
 * - estimated：Zepp 的算法推断，方法和误差范围都没公布（VO₂max、准备度、体脂……）。
 *
 * 认不出的 id 返回 null：不贴标签，比贴错强。
 */
export type MetricTrust = 'measured' | 'computed' | 'estimated';

const TRUST: Record<string, MetricTrust> = {
  steps: 'measured',
  heart_rate_24h: 'measured',
  daily_max_hr: 'measured',
  resting_hr: 'measured',
  spo2: 'measured',
  hrv: 'measured',
  weight: 'measured',
  height: 'measured',
  blood_pressure_systolic: 'measured',
  blood_pressure_diastolic: 'measured',
  blood_pressure_pulse: 'measured',

  bmi: 'computed',
  bmr: 'computed',
  hrv_rmssd: 'computed',
  spo2_odi: 'computed',
  training_balance: 'computed',
  sleep_weekly: 'computed',
  intake_calories: 'computed',
  intake_protein_g: 'computed',
  intake_fat_g: 'computed',
  intake_carbs_g: 'computed',

  vo2max: 'estimated',
  lactate_threshold: 'estimated',
  training_load: 'estimated',
  pai_total: 'estimated',
  readiness: 'estimated',
  stress: 'estimated',
  respiratory_rate: 'estimated',
  distance: 'estimated',
  active_calories: 'estimated',
  active_minutes: 'estimated',
  body_fat_rate: 'estimated',
  muscle_mass: 'estimated',
  body_water_rate: 'estimated',
  bone_mass: 'estimated',
  visceral_fat: 'estimated',
  sleep_duration: 'estimated',
  sleep_score: 'estimated',
  sleep_stages: 'estimated',
};

export const metricTrust = (metric: string): MetricTrust | null => TRUST[metric] ?? null;
