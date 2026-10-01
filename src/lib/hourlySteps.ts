import type { HourlySteps } from '../types';
import { localDateString } from './format';
import { today as currentToday } from './currentDay';

/**
 * 每小时步数按范围摊开：一行是一天（范围长时一行是一周），一行 24 格。
 *
 * 官方只回「有步数的小时」。所以：
 *   - 一天里有记录、某个小时没回 → 那一小时没走路；按天看画成空格（没有记录，不写 0），
 *     求平均时按 0 计入（那天确实有数据，只是那一小时没有步数）；
 *   - 一整天都没回 → 这一天不算「有记录的天」，不参与平均，整行空着。
 * 某个小时在所有有记录的天里都没出现过 → 平均也是空（null），不画成 0。
 */
export interface HourRow {
  /** 这一行覆盖的第一天 / 最后一天（按天时两者相同）。 */
  start: string;
  end: string;
  /** 这一行里有记录的天数。 */
  covered: number;
  /** 24 格；按天是那一小时的步数，按周是有记录的天里的日均；没有记录是 null。 */
  cells: Array<number | null>;
}

const addDays = (date: string, days: number): string => {
  const [y, m, d] = date.split('-').map(Number);
  return localDateString(new Date(y!, m! - 1, d! + days));
};

/** 从 start 到 end（含）的每一天。 */
export const dateSpan = (start: string, end: string): string[] => {
  const out: string[] = [];
  for (let day = start; day <= end && out.length < 1000; day = addDays(day, 1)) out.push(day);
  return out;
};

/** 范围的首尾：今天往回数 `days` 天（含今天）。 */
export const rangeBounds = (days: number, today = currentToday()): { start: string; end: string } => {
  const end = localDateString(today);
  return { start: addDays(end, -(Math.max(1, days) - 1)), end };
};

const indexByDate = (rows: HourlySteps[]) => {
  const byDate = new Map<string, Map<number, number>>();
  for (const row of rows) {
    const hours = byDate.get(row.date) ?? new Map<number, number>();
    hours.set(row.hour, row.steps);
    byDate.set(row.date, hours);
  }
  return byDate;
};

/** 若干天合成一行：有记录的天里各小时的日均；只有一天时就是那一天本身。 */
const rowOf = (dates: string[], byDate: Map<string, Map<number, number>>): HourRow => {
  const days = dates.map((date) => byDate.get(date)).filter((hours): hours is Map<number, number> => Boolean(hours?.size));
  const cells = Array.from({ length: 24 }, (_, hour) => {
    if (!days.some((hours) => hours.has(hour))) return null;
    return days.reduce((sum, hours) => sum + (hours.get(hour) ?? 0), 0) / days.length;
  });
  return { start: dates[0]!, end: dates[dates.length - 1]!, covered: days.length, cells };
};

/**
 * 摊成行，最新的在最上面。`perWeek` 时七天一行，从最后一天往回切（最上面那行以今天结尾）。
 */
export const hourRows = (rows: HourlySteps[], start: string, end: string, perWeek: boolean): HourRow[] => {
  const byDate = indexByDate(rows);
  const dates = dateSpan(start, end).reverse();
  const size = perWeek ? 7 : 1;
  const out: HourRow[] = [];
  for (let index = 0; index < dates.length; index += size) {
    out.push(rowOf(dates.slice(index, index + size).reverse(), byDate));
  }
  return out;
};

/** 整段范围的日均分布（只算有记录的天）。 */
export const averageRow = (rows: HourlySteps[], start: string, end: string): HourRow =>
  rowOf(dateSpan(start, end), indexByDate(rows));
