/**
 * 金继月历（3.1）：覆盖账本按月摆成一年一行，空缺是裂缝，补拉补上的月份用金线接起来。
 *
 * 只排版，不编数据：哪个月是什么全听后端的 `MonthSeam`；账本和本机都没有的月份
 * 就是「还没问过云端」，画成裂缝、旁边给「补上它」。云端明确说没有的月份不是裂缝，
 * 只留一圈虚线——那段时间本来就没有数据，补不出来。
 */
import type { MonthSeam } from '../types';

export type SeamCell = MonthSeam['state'] | 'unasked' | 'out';

export interface KintsugiCell {
  /** `YYYY-MM`。 */
  month: string;
  state: SeamCell;
}

/** 一段连续的金线或裂缝，按格子下标 `[from, to]`（含两头）。 */
export interface SeamRun {
  kind: 'gold' | 'gap';
  from: number;
  to: number;
  /** 折线点，横坐标以格为单位（0–12），纵坐标 0–1。 */
  points: Array<[number, number]>;
}

export interface KintsugiYear {
  year: number;
  cells: KintsugiCell[];
  runs: SeamRun[];
  /** 这一年最早的一个缺口月，「补上它」从这里开始补；没有缺口为 null。 */
  firstGap: string | null;
}

/** 还能补的空缺：失败、排着没问、从没问过。 */
export const isGap = (state: SeamCell): boolean => state === 'crack' || state === 'pending' || state === 'unasked';

/** 最少摆几年：本机只有几个月时，也要让人看见前面还有好几年能补（「以为最多 6 个月」）。 */
const MIN_YEARS = 3;

const pad = (value: number) => String(value).padStart(2, '0');

/** 同一个字符串永远落在同一个 [0, 1)：同一道缝每次画出来都一样，不随刷新抖。 */
export const seamHash = (text: string): number => {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 10_000) / 10_000;
};

/** 一段连续格子的折线：每条格边一个点、格子中间再拐一下，高低按月份做种子。 */
const runPoints = (cells: KintsugiCell[], from: number, to: number, kind: SeamRun['kind']): Array<[number, number]> => {
  const amplitude = kind === 'gold' ? 0.22 : 0.3;
  const y = (key: string) => 0.5 + (seamHash(`${kind}:${key}`) - 0.5) * 2 * amplitude;
  const points: Array<[number, number]> = [[from + 0.12, y(`${cells[from].month}<`)]];
  for (let index = from; index <= to; index += 1) {
    points.push([index + 0.5, y(`${cells[index].month}|`)]);
    if (index < to) points.push([index + 1, y(`${cells[index].month}>`)]);
  }
  points.push([to + 0.88, y(`${cells[to].month}>>`)]);
  return points;
};

const runsOf = (cells: KintsugiCell[]): SeamRun[] => {
  const runs: SeamRun[] = [];
  let index = 0;
  while (index < cells.length) {
    const state = cells[index].state;
    const kind: SeamRun['kind'] | null = state === 'gold' ? 'gold' : isGap(state) ? 'gap' : null;
    if (!kind) { index += 1; continue; }
    let end = index;
    while (end + 1 < cells.length) {
      const next = cells[end + 1].state;
      if (kind === 'gold' ? next !== 'gold' : !isGap(next)) break;
      end += 1;
    }
    runs.push({ kind, from: index, to: end, points: runPoints(cells, index, end, kind) });
    index = end + 1;
  }
  return runs;
};

/**
 * 摆出月历。`earliest` 是补拉最早能补到的那天（`YYYY-MM-DD`），更早的月份画成空白；
 * 今天以后的月份也是空白。年份从新到旧排，最近的一年在最上面。
 */
export const kintsugiYears = (months: MonthSeam[], today: Date, earliest: string): KintsugiYear[] => {
  const byMonth = new Map(months.map((item) => [item.month, item.state]));
  const thisYear = today.getFullYear();
  const thisMonth = `${thisYear}-${pad(today.getMonth() + 1)}`;
  const floorMonth = earliest.slice(0, 7);
  const floorYear = Number(earliest.slice(0, 4)) || thisYear;
  const known = months.map((item) => Number(item.month.slice(0, 4))).filter(Number.isFinite);
  const firstYear = Math.max(floorYear, Math.min(thisYear - (MIN_YEARS - 1), ...known));
  const years: KintsugiYear[] = [];
  for (let year = thisYear; year >= firstYear; year -= 1) {
    const cells: KintsugiCell[] = [];
    for (let m = 1; m <= 12; m += 1) {
      const month = `${year}-${pad(m)}`;
      const state: SeamCell = month > thisMonth || month < floorMonth ? 'out' : byMonth.get(month) ?? 'unasked';
      cells.push({ month, state });
    }
    const gap = cells.find((cell) => isGap(cell.state));
    years.push({ year, cells, runs: runsOf(cells), firstGap: gap?.month ?? null });
  }
  return years;
};

/** 折线点 → SVG 的 `points` 属性。 */
export const seamPolyline = (points: Array<[number, number]>): string =>
  points.map(([x, y]) => `${x.toFixed(3)},${y.toFixed(3)}`).join(' ');
