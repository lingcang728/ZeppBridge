/**
 * 概览「我的指标」：用户自己固定 3–4 个最关心的指标（评审 U10，用户 2026-09-29 定）。
 *
 * 顺序由用户定——概览不替所有人排一套顺序，只提供「固定哪几项」的能力。选择记在本机
 * （localStorage）：这是看的偏好，不是数据，不进库、不进导出。
 *
 * 候选只放「一个数就能说清今天状态」的日指标；取值走 `getMetricSeries`，和各详情页
 * 同一份口径。没有记录就显示「—」和「近 N 天无记录」，不补 0、不沿用旧值。
 */
import type { MetricSeries } from '../types';
import type { ZeppSemanticColors } from './echartsTheme';
import { formatMetric } from './format';

export type PinGroup = 'recovery' | 'activity' | 'body';

export interface PinnableMetric {
  id: string;
  group: PinGroup;
  /** 点开去哪个详情页。 */
  route: string;
  /** 详情页里对应那张趋势卡的指标名（默认就是 id）；没有对应卡的（睡眠分）写 null。 */
  focus?: string | null;
  /** 小数位：体重、体脂这类要一位，其余取整。 */
  digits: number;
  /** 界面单位码（见 PinnedMetrics 的文案表）；空串 = 不写单位。 */
  unit: 'bpm' | 'ms' | 'score' | 'percent' | 'steps' | 'kcal' | 'min' | 'kg' | 'vo2' | '';
  /** 类别色：和它详情页里那张图同一种颜色（睡眠蓝紫、心率红、压力橙……），磁贴不再一律绿。 */
  tone: PinTone;
}

export type PinTone = Exclude<keyof ZeppSemanticColors, 'sleep'> | 'sleepDeep' | 'sleepLight' | 'sleepRem';

/** 类别色在当前主题色板里的实际值。 */
export const pinToneColor = (tone: PinTone, colors: ZeppSemanticColors): string => {
  if (tone === 'sleepDeep') return colors.sleep.deep;
  if (tone === 'sleepLight') return colors.sleep.light;
  if (tone === 'sleepRem') return colors.sleep.rem;
  return colors[tone];
}

export const MAX_PINS = 4;

export const PINNABLE_METRICS: readonly PinnableMetric[] = [
  { id: 'resting_hr', group: 'recovery', route: '/heart', digits: 0, unit: 'bpm', tone: 'heart' },
  { id: 'hrv_rmssd', group: 'recovery', route: '/heart', digits: 0, unit: 'ms', tone: 'sleepLight' },
  { id: 'sleep_hrv', group: 'recovery', route: '/body', focus: 'hrv', digits: 0, unit: 'ms', tone: 'sleepDeep' },
  { id: 'sleep_score', group: 'recovery', route: '/sleep', focus: null, digits: 0, unit: 'score', tone: 'sleepRem' },
  { id: 'readiness', group: 'recovery', route: '/body', digits: 0, unit: 'score', tone: 'readiness' },
  { id: 'stress', group: 'recovery', route: '/body', digits: 0, unit: 'score', tone: 'calories' },
  { id: 'spo2', group: 'recovery', route: '/body', digits: 0, unit: 'percent', tone: 'pace' },
  { id: 'steps', group: 'activity', route: '/activity', digits: 0, unit: 'steps', tone: 'brand' },
  { id: 'active_calories', group: 'activity', route: '/activity', digits: 0, unit: 'kcal', tone: 'calories' },
  { id: 'active_minutes', group: 'activity', route: '/activity', digits: 0, unit: 'min', tone: 'altitude' },
  { id: 'training_load', group: 'activity', route: '/training', digits: 0, unit: '', tone: 'training' },
  { id: 'vo2max', group: 'activity', route: '/training', digits: 0, unit: 'vo2', tone: 'vo2' },
  { id: 'pai_total', group: 'activity', route: '/training', focus: 'pai_daily', digits: 0, unit: '', tone: 'power' },
  { id: 'weight', group: 'body', route: '/body', digits: 1, unit: 'kg', tone: 'distance' },
  { id: 'body_fat_rate', group: 'body', route: '/body', digits: 1, unit: 'percent', tone: 'altitude' },
  { id: 'bmi', group: 'body', route: '/body', digits: 1, unit: '', tone: 'stride' },
];

const BY_ID = new Map(PINNABLE_METRICS.map((metric) => [metric.id, metric]));

/**
 * 磁贴点开的地址：详情页 + 要定位的那张卡（`?focus=指标名`）。点「训练负荷」进训练状态页，页面直接停在
 * 训练负荷那张卡上并圈一下（用户 2026-10-03：以前只是进了那一页，还得自己找）。
 */
export const pinHref = (metric: PinnableMetric): string => {
  const focus = metric.focus === undefined ? metric.id : metric.focus;
  return focus ? `${metric.route}?focus=${encodeURIComponent(focus)}` : metric.route;
};
export const pinnableMetric = (id: string): PinnableMetric | undefined => BY_ID.get(id);

/** 只留认识的、去重、最多四个；顺序保持用户点选的顺序。 */
export const normalizePins = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string' || !BY_ID.has(item) || out.includes(item)) continue;
    out.push(item);
    if (out.length === MAX_PINS) break;
  }
  return out;
};

const STORAGE_KEY = 'zeppbridge-overview-pins';

export const readPins = (): string[] => {
  try {
    return normalizePins(JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]'));
  } catch {
    return [];
  }
};

export const writePins = (pins: string[]): void => {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizePins(pins)));
  } catch {
    // 记不住只影响下次打开，这次照样显示。
  }
};

/** 最新一个点的数值文本；没有就是「—」。 */
export const pinValueText = (metric: PinnableMetric, series?: MetricSeries | null): string => {
  const value = series?.latest?.value;
  return typeof value === 'number' && Number.isFinite(value) ? formatMetric(value, metric.digits) : '—';
};

/** 最新一个点是哪天（本地日历日 YYYY-MM-DD），没有就是 null。 */
export const pinLatestDate = (series?: MetricSeries | null): string | null => series?.latest?.date ?? null;

/** 点序列（只有有数的日子）：迷你曲线只画真有的点，不插值。 */
export const pinSparkValues = (series?: MetricSeries | null): number[] =>
  (series?.points ?? []).map((point) => point.value).filter((value) => Number.isFinite(value));
