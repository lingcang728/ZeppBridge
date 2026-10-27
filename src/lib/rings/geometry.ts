/**
 * 年轮的几何（纯函数），树木年轮（tree.ts）和履历页的日历用：
 * - 日期 → 角度：1 月 1 日在正上方，顺时针；
 * - 每周的起伏：按每周运动分钟数，那一周一天数据都没有就是 null——留白，不当成 0；
 * - 树的横截面：所有年份从里往外一圈一圈，宽窄看那年运动了多少，整年没数据的圈最窄。
 */
import type { RingYear } from '../../types/rings';

const TAU = Math.PI * 2;
export const WEEKS = 53;

const isLeap = (year: number) => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
export const daysInYear = (year: number) => (isLeap(year) ? 366 : 365);

/** `YYYY-MM-DD` 是这一年的第几天（0 起）。不经过 Date 的时区换算。 */
export const dayOfYear = (date: string): number => {
  const [y, m, d] = date.split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 86_400_000);
};

/** 第 `day` 天（0 起，可以带小数）的角度：1 月 1 日在正上方，顺时针。 */
export const angleOfDay = (day: number, days: number): number => -Math.PI / 2 + (TAU * day) / days;

/**
 * 每周的「形状」0–1：开方压一压，按这一年有数据的周里最少到最多拉开（起伏看得出来），
 * 再和前后两周做一次平滑（只和有数据的周平滑，环绕年头年尾）。
 * 没数据的周仍是 null。各周一样多（含全年都没运动）时整圈在正中——平的，但画得出来。
 */
export const weekShape = (weeks: (number | null)[]): (number | null)[] => {
  const roots = weeks.map(w => (w === null ? null : Math.sqrt(Math.max(0, w))));
  const present = roots.filter((v): v is number => v !== null);
  const lo = Math.min(...present);
  const hi = Math.max(...present);
  const root = roots.map(v => (v === null ? null : hi > lo ? (v - lo) / (hi - lo) : 0.5));
  const kernel = [0.12, 0.22, 0.32, 0.22, 0.12];
  return root.map((value, i) => {
    if (value === null) return null;
    let sum = 0;
    let weight = 0;
    kernel.forEach((k, j) => {
      const v = root[(i + j - 2 + root.length) % root.length];
      if (v !== null) { sum += v * k; weight += k; }
    });
    return weight > 0 ? sum / weight : value;
  });
};

export interface TreeRing {
  year: number;
  inner: number;
  outer: number;
  blank: boolean;
  in_progress: boolean;
  weeks: (number | null)[];
}

/** 一年运动了多少分钟（宽窄用）。 */
const yearMinutes = (year: RingYear) => year.weeks.reduce<number>((sum, w) => sum + (w ?? 0), 0);

/**
 * 树的横截面：最早的年份在中心。圈宽按全年运动分钟数开方（最窄也有基准的一半），
 * 整年没数据的圈只有基准的四成，画成虚线。合起来正好铺到 `radius`，中心留 `pith` 做髓心。
 */
export const treeRings = (years: RingYear[], radius: number, pith = radius * 0.1): TreeRing[] => {
  if (!years.length) return [];
  const minutes = years.map(yearMinutes);
  const max = Math.max(1, ...minutes);
  const weights = years.map((y, i) => (y.data_days === 0 ? 0.4 : 0.5 + 0.8 * Math.sqrt(minutes[i] / max)));
  const total = weights.reduce((a, b) => a + b, 0);
  const unit = (radius - pith) / total;
  let r = pith;
  return years.map((y, i) => {
    const inner = r;
    r += weights[i] * unit;
    return { year: y.year, inner, outer: r, blank: y.data_days === 0, in_progress: y.in_progress, weeks: y.weeks };
  });
};
