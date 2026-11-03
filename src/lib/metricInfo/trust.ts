/*
 * 每个指标是怎么来的（用户反馈 2026-10：「哪些数据可信、哪些不可信，比如 VO₂max」）。
 *
 * 只说来历，不打「准 / 不准」的分：那是判断，我们可能判断错、反而误导人。排不排除
 * 由用户自己在「?」浮层里拨（useMetricExclusions）。
 *
 * - measured：传感器直接读数（心率、步数、血氧、体重、血压）。
 * - computed：由读数或你自己的记录按公开的固定算式换算（BMI、负荷平衡、ODI、饮食合计）。
 * - inferred：常识推算——大家都知道是手表推出来的，做法也人人熟悉（从体动和心率判断睡眠、从步数推距离、
 *   从心率算热量和 PAI）。界面不另外标，免得满屏记号（用户 2026-10-28：「睡眠时长没必要特意标算法」）。
 * - modeled：黑盒估算——Zepp 用自己的模型估出来，方法和误差范围都没公布，和实验室测量可能差得远
 *   （VO₂max、准备度、体脂……）。只有这一档在「?」按钮角上挂一粒琥珀点。
 *
 * 认不出的 id 返回 null：不贴标签，比贴错强。
 */
export type MetricTrust = 'measured' | 'computed' | 'inferred' | 'modeled';

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

  pai_total: 'inferred',
  stress: 'inferred',
  respiratory_rate: 'inferred',
  distance: 'inferred',
  active_calories: 'inferred',
  active_minutes: 'inferred',
  sleep_duration: 'inferred',
  sleep_score: 'inferred',
  sleep_stages: 'inferred',

  vo2max: 'modeled',
  lactate_threshold: 'modeled',
  training_load: 'modeled',
  readiness: 'modeled',
  body_fat_rate: 'modeled',
  muscle_mass: 'modeled',
  body_water_rate: 'modeled',
  bone_mass: 'modeled',
  visceral_fat: 'modeled',
};

export const metricTrust = (metric: string): MetricTrust | null => TRUST[metric] ?? null;
