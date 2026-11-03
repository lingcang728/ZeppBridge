/**
 * 树木年轮（纯函数，2026-10-27 第五版；用户把星系整套否了，选的是「真·树木年轮」）：
 * - 一年长一圈，最早那年在最里面，外面是新的；圈是一层一层长出来的，所以这一圈的内沿就是上一圈的外沿。
 * - 圈的宽窄顺着一年走（1 月 1 日在正上方、顺时针）：那周练得多就鼓出来，练得少就收窄。
 *   整体粗细看那年一共练了多少（geometry.ts 的 `treeRings`），起伏看每周（`weekShape`）。
 * - 没数据的周不当成 0：那段只长一点点，外沿的线画成断开的（`present` 为假）。
 * - 选中那年的圈里，每次运动一条径向刻线，长短看时长；同一天几次稍微错开一点角度。
 *
 * 坐标：圆心在 (0, 0)，y 朝下（SVG / canvas 的方向），单位是调用方给的 `radius` 的单位。
 */
import { dayOfYear, daysInYear, treeRings, weekShape, WEEKS } from './geometry';
import type { RingStar, RingYear } from '../../types/rings';

const TAU = Math.PI * 2;
/** 一圈取多少个点：一周 7 个（大约一天一个），够圆也够细。 */
export const SAMPLES = WEEKS * 7;
/** 每周起伏的幅度：最少的周是平均宽度的 1 − WOBBLE，最多的周是 1 + WOBBLE。 */
const WOBBLE = 0.42;
/** 时长到这么久，刻线就满格了（4 小时）。 */
const LONG_S = 4 * 3600;

export interface RingBand {
  year: number;
  index: number;
  /** 每个取样点上的内沿 / 外沿半径（SAMPLES 个，从 1 月 1 日顺时针）。 */
  inner: number[];
  outer: number[];
  /** 每个取样点那周有没有数据。 */
  present: boolean[];
  blank: boolean;
  in_progress: boolean;
}

export interface TreeLayout {
  radius: number;
  pith: number;
  bands: RingBand[];
}

/** 一年里的第几成（0–1）→ 角度：1 月 1 日在正上方，顺时针。 */
export const angleOf = (f: number) => -Math.PI / 2 + TAU * f;
export const pointAt = (r: number, f: number) => ({ x: r * Math.cos(angleOf(f)), y: r * Math.sin(angleOf(f)) });
/** 那一天在这一年里的第几成（取那天的正中）。 */
export const fractionOfDate = (date: string) => {
  const days = daysInYear(Number(date.slice(0, 4)));
  return Math.min(1, Math.max(0, (dayOfYear(date) + 0.5) / days));
};
const weekAt = (f: number, days: number) => Math.min(WEEKS - 1, Math.floor((f * days) / 7));

/** 环形平滑（年头年尾接上，圈是闭合的）。 */
function smooth(values: number[], reach: number) {
  const n = values.length;
  return values.map((_, i) => {
    let sum = 0, weight = 0;
    for (let d = -reach; d <= reach; d += 1) {
      const k = reach + 1 - Math.abs(d);
      sum += values[(i + d + n) % n] * k;
      weight += k;
    }
    return sum / weight;
  });
}

/** 树的横截面：`years` 旧的在前，铺到 `radius`，中心留一点髓心。 */
export function treeLayout(years: RingYear[], radius: number): TreeLayout {
  const pith = radius * 0.05;
  const base = treeRings(years, radius, pith);
  const widths = years.map((year, i) => {
    const days = daysInYear(year.year);
    const mean = base[i].outer - base[i].inner;
    const shape = weekShape(year.weeks.length === WEEKS ? year.weeks : Array(WEEKS).fill(null));
    const present: boolean[] = [];
    const width: number[] = [];
    for (let s = 0; s < SAMPLES; s += 1) {
      const value = shape[weekAt(s / SAMPLES, days)];
      present.push(value !== null);
      // 木头本身的一点不匀（确定的，同一年每次一样），让线不像尺子画的。
      const grain = 1 + 0.035 * Math.sin(s * 0.41 + year.year * 1.7) + 0.02 * Math.sin(s * 1.13 + year.year);
      width.push((value === null ? mean * (1 - WOBBLE) * 0.5 : mean * (1 - WOBBLE + 2 * WOBBLE * value)) * grain);
    }
    return { width: smooth(width, 5), present };
  });
  let inner = Array<number>(SAMPLES).fill(pith);
  const bands = years.map((year, index): RingBand => {
    const outer = inner.map((r, s) => r + widths[index].width[s]);
    const band = { year: year.year, index, inner, outer, present: widths[index].present, blank: year.data_days === 0, in_progress: year.in_progress };
    inner = outer;
    return band;
  });
  // 起伏让最外一圈的某些地方超出 radius：整体按比例收回来。
  const max = Math.max(pith + 1e-6, ...(bands[bands.length - 1]?.outer ?? [pith]));
  const k = (radius - pith) / (max - pith);
  const fit = (r: number) => pith + (r - pith) * k;
  for (const band of bands) { band.inner = band.inner.map(fit); band.outer = band.outer.map(fit); }
  // 内外沿共用同一组数（上一圈的外沿就是这一圈的内沿）。
  for (let i = 1; i < bands.length; i += 1) bands[i].inner = bands[i - 1].outer;
  return { radius, pith, bands };
}

/** 第 `f` 成处的半径（取样点之间线性插值，绕回年头）。 */
export function radiusAt(radii: number[], f: number) {
  const x = (((f % 1) + 1) % 1) * SAMPLES;
  const i = Math.floor(x) % SAMPLES, j = (i + 1) % SAMPLES, t = x - Math.floor(x);
  return radii[i] + (radii[j] - radii[i]) * t;
}

const fmt = (n: number) => (Math.round(n * 10) / 10).toString();
const at = (r: number, s: number) => { const p = pointAt(r, s / SAMPLES); return `${fmt(p.x)} ${fmt(p.y)}`; };
/** 一条闭合的边（SVG path）。 */
export const loopPath = (radii: number[]) => `M${radii.map((r, s) => at(r, s)).join('L')}Z`;
/** 一圈本身（外沿 + 反着走的内沿，配 `fill-rule: evenodd`）。 */
export const bandPath = (band: RingBand) => `${loopPath(band.outer)}${loopPath(band.inner)}`;
/** 圈里的木纹：在内外沿之间 `at` 处（0–1）的一条闭合线。 */
export const grainPath = (band: RingBand, t: number) => loopPath(band.inner.map((r, s) => r + (band.outer[s] - r) * t));

/** 外沿按「那周有没有数据」切成几段：有数据的实线、没数据的断开。 */
export function edgeSegments(band: RingBand) {
  const segments: { d: string; present: boolean }[] = [];
  let start = 0;
  for (let s = 1; s <= SAMPLES; s += 1) {
    if (s < SAMPLES && band.present[s] === band.present[start]) continue;
    const points: string[] = [];
    for (let k = start; k <= Math.min(s, SAMPLES); k += 1) points.push(at(band.outer[k % SAMPLES], k));
    segments.push({ d: `M${points.join('L')}`, present: band.present[start] });
    start = s;
  }
  // 一整圈都是同一种：首尾接上成闭合的。
  if (segments.length === 1) segments[0].d += 'Z';
  return segments;
}

/** 一段（`from`–`to`，成）的扇形：悬停那一周时铺一层。 */
export function wedgePath(band: RingBand, from: number, to: number) {
  const steps = Math.max(2, Math.ceil((to - from) * SAMPLES));
  const outer: string[] = [], inner: string[] = [];
  for (let k = 0; k <= steps; k += 1) {
    const f = from + ((to - from) * k) / steps;
    const o = pointAt(radiusAt(band.outer, f), f), i = pointAt(radiusAt(band.inner, f), f);
    outer.push(`${fmt(o.x)} ${fmt(o.y)}`);
    inner.unshift(`${fmt(i.x)} ${fmt(i.y)}`);
  }
  return `M${outer.join('L')}L${inner.join('L')}Z`;
}

export interface RingTick { index: number; f: number; x1: number; y1: number; x2: number; y2: number }

/** 选中那年的刻线：一次运动一条，从内沿往外，长短看时长（没有时长的按最短的画，不编一个出来）。 */
export function ringTicks(band: RingBand, stars: Pick<RingStar, 'date' | 'duration_s'>[]): RingTick[] {
  const sameDay = new Map<string, number>();
  return stars.map((star, index) => {
    const k = sameDay.get(star.date) ?? 0;
    sameDay.set(star.date, k + 1);
    const f = fractionOfDate(star.date) + (k === 0 ? 0 : (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.0011);
    const ri = radiusAt(band.inner, f), ro = radiusAt(band.outer, f), w = ro - ri;
    const length = (0.3 + 0.55 * Math.sqrt(Math.min(1, (star.duration_s ?? 0) / LONG_S))) * w;
    const a = pointAt(ri + w * 0.1, f), b = pointAt(ri + w * 0.1 + length, f);
    return { index, f, x1: a.x, y1: a.y, x2: b.x, y2: b.y };
  });
}

/** 某一点落在哪一圈、一年里的第几成。圈外 / 髓心里返回 null。 */
export function hitRing(layout: TreeLayout, x: number, y: number): { band: RingBand; f: number } | null {
  const r = Math.hypot(x, y);
  if (r < layout.pith) return null;
  const f = (((Math.atan2(y, x) + Math.PI / 2) / TAU) % 1 + 1) % 1;
  const band = layout.bands.find(b => r >= radiusAt(b.inner, f) && r < radiusAt(b.outer, f));
  return band ? { band, f } : null;
}

/** 第 `f` 成落在那一年的第几周、这周的头尾（`YYYY-MM-DD`）和它在圈上占的那一段。 */
export function weekAtFraction(year: number, f: number) {
  const days = daysInYear(year);
  const week = weekAt(f, days);
  const first = week * 7, last = Math.min(days - 1, first + 6);
  const date = (day: number) => new Date(Date.UTC(year, 0, 1 + day)).toISOString().slice(0, 10);
  return { week, from: date(first), to: date(last), start: first / days, end: (last + 1) / days };
}

/** 每月 1 日在圈上的位置（月份刻度）。 */
export const monthStarts = (year: number) => {
  const days = daysInYear(year);
  return Array.from({ length: 12 }, (_, month) => dayOfYear(`${year}-${String(month + 1).padStart(2, '0')}-01`) / days);
};

/** 沿时间的前一次 / 后一次。`stars` 本来就按日期排好。 */
export const neighborStar = (stars: Pick<RingStar, 'date'>[], index: number, step: 1 | -1) => {
  const next = index + step;
  return next >= 0 && next < stars.length ? next : null;
};
