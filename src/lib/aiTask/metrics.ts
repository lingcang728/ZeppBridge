/**
 * 关系网二级节点（指标）与覆盖明细的界面文案。
 *
 * 指标名、单位都是后端给的稳定键（`AiTaskCoverage.units` 的键与值），
 * 界面按键取自己语言的说法——覆盖表里不再直接出现内部码。来源范围用
 * `labels.ts` 的 `dataScopeLabel`。认不出的键原样返回：新指标在翻译
 * 跟上之前显示键名，总比空白强。
 */
import { defineMessages, messagesOf } from '../../i18n';
import type { AiTaskCategory } from '../bridge/types';

const metricMessages = defineMessages(
  {
    resting_hr: '静息心率', readiness: '准备度', physical_readiness: '身体准备度', mental_readiness: '精神准备度',
    hybrid_charge: 'Hybrid Charge', physical_charge: '身体 Charge', mental_charge: '精神 Charge', stress: '压力',
    respiratory_rate: '呼吸率', sleep_hrv: '睡眠 HRV', sleep_rhr: '睡眠静息心率', hrv_baseline: 'HRV 基线',
    rhr_baseline: '静息心率基线', ahi_baseline: 'AHI 基线', spo2_odi: '血氧 ODI', spo2_night_score: '夜间血氧评分',
    spo2_measured_minutes: '血氧测量时长', hrv: 'HRV', hrv_rmssd: 'HRV（RMSSD）', spo2: '血氧',
    heart_rate: '全天心率',
    training_load: '训练负荷', vo2max: '最大摄氧量', lactate_threshold_hr: '乳酸阈心率', lactate_threshold_pace: '乳酸阈配速',
    pai_daily: '每日 PAI', pai_total: 'PAI 总值', steps: '步数', active_calories: '活动消耗', active_minutes: '活动时长',
    weight: '体重', bmi: 'BMI', height: '身高', body_fat_rate: '体脂率', body_water_rate: '水分率', muscle_mass: '肌肉量',
    bone_mass: '骨量', protein_rate: '蛋白质率', visceral_fat: '内脏脂肪', bmr: '基础代谢', body_balance_score: '身体平衡评分',
    distance_meters: '距离', moving_seconds: '运动时长', calories: '消耗', avg_hr: '平均心率', max_hr: '最高心率',
    min_hr: '最低心率', total_steps: '步数', elevation_gain_m: '累计爬升', elevation_loss_m: '累计下降',
    duration_minutes: '睡眠时长', score: '睡眠评分', deep_minutes: '深睡', light_minutes: '浅睡', rem_minutes: 'REM',
    awake_minutes: '清醒', wake_count: '醒来次数',
    unit_min: '分钟', unit_s: '秒', unit_score: '分', unit_count: '次', unit_kcal: '千卡', unit_m: '米',
    unit_load: '负荷值', unit_steps: '步',
  },
  {
    resting_hr: 'Resting HR', readiness: 'Readiness', physical_readiness: 'Physical readiness', mental_readiness: 'Mental readiness',
    hybrid_charge: 'Hybrid Charge', physical_charge: 'Physical Charge', mental_charge: 'Mental Charge', stress: 'Stress',
    respiratory_rate: 'Respiratory rate', sleep_hrv: 'Sleep HRV', sleep_rhr: 'Sleep resting HR', hrv_baseline: 'HRV baseline',
    rhr_baseline: 'Resting HR baseline', ahi_baseline: 'AHI baseline', spo2_odi: 'SpO₂ ODI', spo2_night_score: 'Night SpO₂ score',
    spo2_measured_minutes: 'SpO₂ measured time', hrv: 'HRV', hrv_rmssd: 'HRV (RMSSD)', spo2: 'SpO₂',
    heart_rate: 'All-day heart rate',
    training_load: 'Training load', vo2max: 'VO₂max', lactate_threshold_hr: 'Lactate threshold HR', lactate_threshold_pace: 'Lactate threshold pace',
    pai_daily: 'Daily PAI', pai_total: 'Total PAI', steps: 'Steps', active_calories: 'Active calories', active_minutes: 'Active minutes',
    weight: 'Weight', bmi: 'BMI', height: 'Height', body_fat_rate: 'Body fat', body_water_rate: 'Body water', muscle_mass: 'Muscle mass',
    bone_mass: 'Bone mass', protein_rate: 'Protein', visceral_fat: 'Visceral fat', bmr: 'BMR', body_balance_score: 'Body balance score',
    distance_meters: 'Distance', moving_seconds: 'Moving time', calories: 'Calories', avg_hr: 'Avg HR', max_hr: 'Max HR',
    min_hr: 'Min HR', total_steps: 'Steps', elevation_gain_m: 'Elevation gain', elevation_loss_m: 'Elevation loss',
    duration_minutes: 'Sleep duration', score: 'Sleep score', deep_minutes: 'Deep', light_minutes: 'Light', rem_minutes: 'REM',
    awake_minutes: 'Awake', wake_count: 'Wake-ups',
    unit_min: 'min', unit_s: 's', unit_score: 'pts', unit_count: 'times', unit_kcal: 'kcal', unit_m: 'm',
    unit_load: 'load', unit_steps: 'steps',
  },
  {
    resting_hr: 'FC en reposo', readiness: 'Disposición', stress: 'Estrés', respiratory_rate: 'Frecuencia respiratoria',
    spo2: 'SpO₂', heart_rate: 'FC de todo el día', training_load: 'Carga de entrenamiento', steps: 'Pasos',
    weight: 'Peso', body_fat_rate: 'Grasa corporal', muscle_mass: 'Masa muscular', distance_meters: 'Distancia',
    moving_seconds: 'Tiempo en movimiento', calories: 'Calorías', avg_hr: 'FC media', max_hr: 'FC máx.',
    duration_minutes: 'Duración del sueño', score: 'Puntuación del sueño', deep_minutes: 'Profundo', light_minutes: 'Ligero',
    awake_minutes: 'Despierto', wake_count: 'Despertares',
    unit_score: 'pts', unit_count: 'veces', unit_load: 'carga', unit_steps: 'pasos',
  },
  'lib/aiTask/metrics',
);

const lookup = (table: unknown, key: string): string | undefined => {
  const value = (table as Record<string, unknown>)[key];
  return typeof value === 'string' && value ? value : undefined;
};

export const metricLabel = (metric: string): string => lookup(messagesOf(metricMessages), metric) ?? metric;

/** 后端单位键 → 界面单位。`步` 是后端的固定写法，也按键换掉。 */
const UNIT_KEYS: Record<string, string> = {
  min: 'unit_min', s: 'unit_s', score: 'unit_score', count: 'unit_count', kcal: 'unit_kcal',
  m: 'unit_m', load: 'unit_load', '步': 'unit_steps',
};

export const unitLabel = (unit: string): string => {
  const key = UNIT_KEYS[unit];
  return (key && lookup(messagesOf(metricMessages), key)) || unit;
};

/**
 * 每个窗口类别的指标清单，与后端 `category_metric_specs` / 固定字段表同序。
 * 只在预览还没回来时当占位用——预览到了以后以 `coverage.units` 的键为准
 * （后端只列真正注册过的指标）。
 */
export const CATEGORY_METRICS: Readonly<Partial<Record<AiTaskCategory, readonly string[]>>> = {
  workout: ['distance_meters', 'moving_seconds', 'calories', 'avg_hr', 'max_hr', 'min_hr', 'training_load', 'vo2max', 'total_steps', 'elevation_gain_m', 'elevation_loss_m'],
  sleep: ['duration_minutes', 'score', 'deep_minutes', 'light_minutes', 'rem_minutes', 'awake_minutes', 'wake_count'],
  recovery: ['resting_hr', 'readiness', 'stress', 'respiratory_rate', 'sleep_hrv', 'hrv', 'hrv_rmssd', 'spo2'],
  heart_rate: ['heart_rate', 'resting_hr'],
  training: ['training_load', 'vo2max', 'lactate_threshold_hr', 'lactate_threshold_pace', 'pai_daily', 'steps', 'active_calories', 'active_minutes'],
  body: ['weight', 'bmi', 'body_fat_rate', 'body_water_rate', 'muscle_mass', 'bone_mass', 'visceral_fat', 'bmr'],
};
