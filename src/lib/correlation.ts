import type { MetricSeriesPoint } from '../types';

/**
 * 两条逐日序列的相关：x 往后挪 `lagDays` 天再和 y 配对（lag = 1 即「前一天的 x」对「今天的 y」）。
 * 只用两边都有读数的日子；配出来的日子不到 `MIN_PAIRS` 就不给结果，宁可说「数据不够」也不报一个靠几天撑起来的 r。
 * 相关不是因果：卡片上要写明。
 */
export const MIN_PAIRS = 10;

export interface Correlation {
  r: number;
  pairs: number;
}

const addDays = (date: string, days: number): string => {
  const [y, m, d] = date.split('-').map(Number);
  const next = new Date(y!, m! - 1, d! + days);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`;
};

export const correlate = (
  x: MetricSeriesPoint[],
  y: MetricSeriesPoint[],
  lagDays = 0,
): Correlation | null => {
  const yByDate = new Map(y.map((point) => [point.date, point.value]));
  const xs: number[] = [];
  const ys: number[] = [];
  for (const point of x) {
    const other = yByDate.get(addDays(point.date, lagDays));
    if (typeof other === 'number' && Number.isFinite(other) && Number.isFinite(point.value)) {
      xs.push(point.value);
      ys.push(other);
    }
  }
  if (xs.length < MIN_PAIRS) return null;
  const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const mx = mean(xs);
  const my = mean(ys);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let index = 0; index < xs.length; index += 1) {
    const dx = xs[index]! - mx;
    const dy = ys[index]! - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  // 有一边是常数就没有相关可言。
  if (sxx === 0 || syy === 0) return null;
  return { r: sxy / Math.sqrt(sxx * syy), pairs: xs.length };
};

export type Strength = 'none' | 'weak' | 'moderate' | 'strong';

/** |r| 的口语分档：不到 0.2 几乎无关，到 0.4 弱，到 0.7 中等，之后强。 */
export const strengthOf = (r: number): Strength => {
  const size = Math.abs(r);
  if (size < 0.2) return 'none';
  if (size < 0.4) return 'weak';
  if (size < 0.7) return 'moderate';
  return 'strong';
};
