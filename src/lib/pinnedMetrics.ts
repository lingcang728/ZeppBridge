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
import { formatMetric } from './format';
import { bodyMassUnitLabel, toBodyMass } from './units';

export type PinGroup = 'recovery' | 'activity' | 'body';

/**
 * 磁贴上的单位码（文案见 PinnedMetrics.i18n.ts，和详情页那张卡写的单位一样）；空串 = 不写单位。
 * `mass` 跟着用户选的单位制走（kg / lb），和身体页同一个换算。
 */
export type PinUnit = 'bpm' | 'ms' | 'score' | 'percent' | 'steps' | 'kcal' | 'min' | 'mass' | 'vo2' | 'pai' | '';

export interface PinnableMetric {
  id: string;
  group: PinGroup;
  /** 点开去哪个详情页。 */
  route: string;
  /** 详情页里对应那张趋势卡的指标名（默认就是 id）；没有对应卡的（睡眠分）写 null。 */
  focus?: string | null;
  /** 小数位：和详情页那张卡一样（体重、VO₂max 一位，其余取整）。 */
  digits: number;
  unit: PinUnit;
}

/*
 * 名字、颜色、数值都跟详情页那张卡**是同一个东西**（用户 2026-10-04：首页和点进去不一致，不知道信哪个）：
 * - 名字：PinnedMetrics.i18n.ts 的 names，和详情页卡片标题逐字一致（tests 里有门禁比对）；
 * - 颜色：lib/metricTone.ts，详情页也从那里取；
 * - 数值和曲线：同一个指标、同一个范围（页面顶上的 7 天 / 1 个月 / 6 个月），同样的切法。
 *
 * 「睡眠 HRV」不再单列：库里的 sleep_hrv 就是夜里逐分钟 RMSSD 的日均（真实库逐日核对过，差不到 1 ms），
 * 和「HRV (RMSSD)」是同一个数，点进去也没有自己的卡。存着的旧选择会换成 HRV (RMSSD)，候选里补上
 * 真正是另一个口径的 HRV (SDNN)。
 */
export const PINNABLE_METRICS: readonly PinnableMetric[] = [
  { id: 'resting_hr', group: 'recovery', route: '/heart', digits: 0, unit: 'bpm' },
  { id: 'hrv_rmssd', group: 'recovery', route: '/heart', digits: 0, unit: 'ms' },
  { id: 'hrv', group: 'recovery', route: '/heart', digits: 0, unit: 'ms' },
  { id: 'sleep_score', group: 'recovery', route: '/sleep', focus: null, digits: 0, unit: 'score' },
  { id: 'readiness', group: 'recovery', route: '/body', digits: 0, unit: 'score' },
  { id: 'stress', group: 'recovery', route: '/body', digits: 0, unit: 'score' },
  { id: 'spo2', group: 'recovery', route: '/body', digits: 0, unit: 'percent' },
  { id: 'steps', group: 'activity', route: '/activity', digits: 0, unit: 'steps' },
  { id: 'active_calories', group: 'activity', route: '/activity', digits: 0, unit: 'kcal' },
  { id: 'active_minutes', group: 'activity', route: '/activity', digits: 0, unit: 'min' },
  { id: 'training_load', group: 'activity', route: '/training', digits: 0, unit: '' },
  { id: 'vo2max', group: 'activity', route: '/training', digits: 1, unit: 'vo2' },
  { id: 'pai_total', group: 'activity', route: '/training', digits: 0, unit: 'pai' },
  { id: 'weight', group: 'body', route: '/body', digits: 1, unit: 'mass' },
  { id: 'body_fat_rate', group: 'body', route: '/body', digits: 1, unit: 'percent' },
  { id: 'bmi', group: 'body', route: '/body', digits: 1, unit: '' },
];

/** 以前能选、现在并进别的指标的：读到旧选择时换过去。 */
const RENAMED: Record<string, string> = { sleep_hrv: 'hrv_rmssd' };

export const MAX_PINS = 4;

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
    const id = typeof item === 'string' ? RENAMED[item] ?? item : null;
    if (!id || !BY_ID.has(id) || out.includes(id)) continue;
    out.push(id);
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

/** 显示前的换算：只有体重跟着单位制换（库里一律千克，和身体页同一个换算）。 */
const shown = (metric: PinnableMetric, value: number) => (metric.unit === 'mass' ? toBodyMass(value) : value);

/** 最新一个点的数值文本；没有就是「—」。 */
export const pinValueText = (metric: PinnableMetric, series?: MetricSeries | null): string => {
  const value = series?.latest?.value;
  return typeof value === 'number' && Number.isFinite(value) ? formatMetric(shown(metric, value), metric.digits) : '—';
};

/** 质量单位此刻写 kg 还是 lb。 */
export const pinMassUnit = (): string => bodyMassUnitLabel();

/** 最新一个点是哪天（本地日历日 YYYY-MM-DD），没有就是 null。 */
export const pinLatestDate = (series?: MetricSeries | null): string | null => series?.latest?.date ?? null;

/** 点序列（只有有数的日子）：迷你曲线只画真有的点，不插值。 */
export const pinSparkValues = (series?: MetricSeries | null): number[] =>
  (series?.points ?? []).map((point) => point.value).filter((value) => Number.isFinite(value));
