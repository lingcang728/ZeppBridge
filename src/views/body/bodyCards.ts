import { metricColor } from '../../lib/metricTone';
import { isFiniteNumber } from '../../lib/format';
import {
  bodyHeightUnitLabel,
  bodyMassUnitLabel,
  toBodyHeight,
  toBodyMass,
} from '../../lib/units';
import type { MetricSeries, MetricSeriesPoint } from '../../types';
import type { bodyStatusMessages } from '../BodyStatus.i18n';

/* 身体状态页的卡片清单与分组（从 BodyStatus.vue 搬出来，内容不变）。 */
type BodyStatusText = typeof bodyStatusMessages.zh;

export interface BodyCard {
  metric: string;
  label: string;
  hint: string;
  color: string;
  unit: string;
  decimals?: number;
  showSpread?: boolean;
  emptyText?: string;
  chart?: 'line' | 'bar';
  calendarAxis?: boolean;
  /**
   * 显示前的换算。只有体重系需要：库里一律是千克和厘米（导出契约不变），
   * 界面按用户选的单位制显示。返回 `undefined` 表示不换算。
   */
  convert?: (value: number) => number;
}

/**
 * Everything on this screen already sits in the local library — this page is
 * presentation, not collection. The list is fixed so the backend can refuse
 * any name it does not have a unit for.
 */
const VITALS_METRICS = [
  'readiness',
  'stress',
  'spo2',
  'spo2_odi',
  'hrv',
  'hrv_rmssd',
  'respiratory_rate',
  'resting_hr',
];

/**
 * 体重与体成分。前三项在真实账号上核对过；后面几项要有体脂秤才会有值。
 *
 * 没有秤的账号**不会**在这里看到九张空卡片。这一版之前是那样的，理由是
 * 「空卡片是事实，不是故障」——事实没错，但九张一模一样的「近 180 天无记录」
 * 只是噪音，把真正有数据的东西挤到了屏幕外。现在没有数据的卡片直接不渲染，
 * 整组都空时留一句话说明为什么。**这不是补 0，也不是隐藏缺失**：缺的值仍然
 * 是缺的，只是不再用一张卡片来复述一遍。
 */
const BODY_METRICS = [
  'weight',
  'bmi',
  'body_fat_rate',
  'muscle_mass',
  'body_water_rate',
  'bone_mass',
  'visceral_fat',
  'bmr',
  'height',
];

/**
 * 饮食。手动记录，所以天然是稀疏的——同样遵守上面那条：没有就不显示。
 *
 * 字段名（`calories` / `protein` / `fat` / `carbohydrate`）来自生态而不是我们
 * 见过的真实报文，所以「一条都没有」在这里是常态，不代表出错。
 */
const INTAKE_METRICS = ['intake_calories', 'intake_protein_g', 'intake_fat_g', 'intake_carbs_g'];

export const METRICS = [...VITALS_METRICS, ...BODY_METRICS, ...INTAKE_METRICS];

export type CardGroup = 'vitals' | 'body' | 'intake';

export const groupOf = (metric: string): CardGroup => {
  if (INTAKE_METRICS.includes(metric)) return 'intake';
  if (BODY_METRICS.includes(metric)) return 'body';
  return 'vitals';
};

export const buildBodyCards = (t: BodyStatusText): BodyCard[] => [
  {
    metric: 'readiness',
    label: t.readinessLabel,
    hint: t.readinessHint,
    color: metricColor('readiness'),
    unit: t.unitScore,
  },
  {
    metric: 'stress',
    label: t.stressLabel,
    hint: t.stressHint,
    color: metricColor('stress'),
    unit: t.unitScore,
    showSpread: true,
  },
  {
    metric: 'spo2',
    label: t.spo2Label,
    hint: t.spo2Hint,
    color: metricColor('spo2'),
    unit: '%',
    showSpread: true,
    emptyText: t.spo2Empty,
  },
  {
    metric: 'spo2_odi',
    label: t.odiLabel,
    hint: t.odiHint,
    color: metricColor('spo2_odi'),
    unit: t.unitPerHour,
    decimals: 1,
  },
  {
    metric: 'hrv',
    label: 'HRV (SDNN)',
    hint: t.hrvHint,
    color: metricColor('hrv'),
    unit: 'ms',
    showSpread: true,
  },
  {
    metric: 'hrv_rmssd',
    label: 'HRV (RMSSD)',
    hint: t.rmssdHint,
    color: metricColor('hrv_rmssd'),
    unit: 'ms',
    showSpread: true,
  },
  {
    metric: 'respiratory_rate',
    label: t.respiratoryLabel,
    hint: t.respiratoryHint,
    color: metricColor('respiratory_rate'),
    unit: t.unitBreathsPerMinute,
    decimals: 1,
    showSpread: true,
  },
  {
    metric: 'resting_hr',
    label: t.restingLabel,
    hint: t.restingHint,
    color: metricColor('resting_hr'),
    unit: 'bpm',
  },
  {
    metric: 'weight',
    label: t.weightLabel,
    hint: t.weightHint,
    color: metricColor('weight'),
    unit: bodyMassUnitLabel(),
    decimals: 1,
    showSpread: true,
    emptyText: t.scaleEmpty,
    convert: toBodyMass,
  },
  {
    metric: 'bmi',
    label: t.bmiLabel,
    hint: t.bmiHint,
    color: metricColor('bmi'),
    // BMI 是个比值，两种单位制下是同一个数，不换算。
    unit: '',
    decimals: 1,
    emptyText: t.scaleEmpty,
  },
  {
    metric: 'body_fat_rate',
    label: t.fatLabel,
    hint: t.fatHint,
    color: metricColor('body_fat_rate'),
    unit: '%',
    decimals: 1,
    showSpread: true,
  },
  {
    metric: 'muscle_mass',
    label: t.muscleLabel,
    hint: t.muscleHint,
    color: metricColor('muscle_mass'),
    unit: bodyMassUnitLabel(),
    decimals: 1,
    convert: toBodyMass,
  },
  {
    metric: 'body_water_rate',
    label: t.waterLabel,
    hint: t.waterHint,
    color: metricColor('body_water_rate'),
    unit: '%',
    decimals: 1,
  },
  {
    metric: 'bone_mass',
    label: t.boneLabel,
    hint: t.boneHint,
    color: metricColor('bone_mass'),
    unit: bodyMassUnitLabel(),
    decimals: 2,
    convert: toBodyMass,
  },
  {
    metric: 'visceral_fat',
    label: t.visceralLabel,
    hint: t.visceralHint,
    color: metricColor('visceral_fat'),
    unit: t.unitGrade,
  },
  {
    metric: 'bmr',
    label: t.bmrLabel,
    hint: t.bmrHint,
    color: metricColor('bmr'),
    unit: t.unitKcalPerDay,
  },
  {
    metric: 'height',
    label: t.heightLabel,
    hint: t.heightHint,
    color: metricColor('height'),
    unit: bodyHeightUnitLabel(),
    decimals: 1,
    convert: toBodyHeight,
  },
  // 摄入。柱状而不是折线，而且轴上保留没记的日子：手动记录一周漏两天是常态，
  // 折线会把中间那两天连成一条看不出断点的线，读起来像天天都记了。
  {
    metric: 'intake_calories',
    label: t.intakeCaloriesLabel,
    hint: t.intakeCaloriesHint,
    color: metricColor('intake_calories'),
    unit: t.unitKcal,
    chart: 'bar',
    calendarAxis: true,
  },
  {
    metric: 'intake_protein_g',
    label: t.proteinLabel,
    hint: t.macroHint,
    color: metricColor('intake_protein_g'),
    unit: t.unitGram,
    chart: 'bar',
    calendarAxis: true,
  },
  {
    metric: 'intake_fat_g',
    label: t.fatIntakeLabel,
    hint: t.macroHint,
    color: metricColor('intake_fat_g'),
    unit: t.unitGram,
    chart: 'bar',
    calendarAxis: true,
  },
  {
    metric: 'intake_carbs_g',
    label: t.carbsLabel,
    hint: t.macroHint,
    color: metricColor('intake_carbs_g'),
    unit: t.unitGram,
    chart: 'bar',
    calendarAxis: true,
  },
];

/**
 * 换算整条序列，包括 min/max/latest 和那三个汇总值。
 *
 * 漏掉其中任何一个都会出现「曲线是磅、下面的平均值还是千克」这种同一张卡上
 * 自相矛盾的读数，而那比只有公制要糟得多——用户不会怀疑它，只会照着用。
 */
export const convertSeries = (
  source: MetricSeries | null,
  convert?: (value: number) => number,
): MetricSeries | null => {
  if (!source || !convert) return source;
  const num = (value: number | null | undefined): number | null | undefined =>
    isFiniteNumber(value) ? convert(value) : value;
  const point = (item: MetricSeriesPoint): MetricSeriesPoint => ({
    ...item,
    value: convert(item.value),
    min: num(item.min),
    max: num(item.max),
  });
  return {
    ...source,
    points: source.points.map(point),
    latest: source.latest ? point(source.latest) : source.latest,
    average: num(source.average) ?? null,
    minimum: num(source.minimum) ?? null,
    maximum: num(source.maximum) ?? null,
  };
};

