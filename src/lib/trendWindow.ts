import { ref } from 'vue';
import { today as currentToday } from './currentDay';

/**
 * 趋势范围的「终点」。
 *
 * 预设范围（7 天 / 1 个月 / 6 个月 / 1 年）永远是「今天往回数 N 天」；自定义范围可以止于过去的某一天。
 * 所有按范围切序列的地方（lib/metricSeries.ts、lib/hourlySteps.ts）都用 `trendToday()` 当终点：
 * 没选自定义时它就是今天，选了自定义时是那个范围的最后一天，所以各页不用各自知道「自定义」这回事，
 * 只要照旧传「天数」。
 *
 * 状态放在这个小模块里（只依赖 currentDay），免得 metricSeries 和 useTrendRange 互相引用。
 */
export interface CustomRange {
  /** 起止日期（含），本地 YYYY-MM-DD。 */
  from: string;
  to: string;
}

const STORAGE_KEY = 'zeppbridge.trend.custom';
const DAY_MS = 86_400_000;
/** 页面一次最多取这么多天（lib/metricSeries.ts 的 SERIES_FETCH_DAYS）：自定义起点不能比它更早。 */
export const CUSTOM_MAX_DAYS = 365;

export const parseDay = (value: string): Date => {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y!, m! - 1, d!);
};

const pad = (value: number) => String(value).padStart(2, '0');
export const formatDay = (date: Date): string => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** 两个日期之间含首尾的天数（按本地日期算，不受夏令时影响）。 */
export const spanDays = (range: CustomRange): number => {
  const from = parseDay(range.from);
  const to = parseDay(range.to);
  return Math.round((Date.UTC(to.getFullYear(), to.getMonth(), to.getDate()) - Date.UTC(from.getFullYear(), from.getMonth(), from.getDate())) / DAY_MS) + 1;
};

/** 自定义范围是否站得住：格式对、起不晚于止、止不晚于今天、起不早于能取到的最早一天、至少两天。 */
export const validCustomRange = (range: CustomRange, now: Date = currentToday()): boolean => {
  const shape = /^\d{4}-\d{2}-\d{2}$/;
  if (!shape.test(range.from) || !shape.test(range.to)) return false;
  const todayText = formatDay(now);
  const earliest = formatDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - (CUSTOM_MAX_DAYS - 1)));
  return range.from <= range.to && range.to <= todayText && range.from >= earliest && spanDays(range) >= 2;
};

const read = (): CustomRange | null => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CustomRange>;
    const range = { from: String(parsed.from ?? ''), to: String(parsed.to ?? '') };
    return validCustomRange(range) ? range : null;
  } catch {
    return null;
  }
};

export const customRange = ref<CustomRange | null>(read());

export const setCustomRange = (range: CustomRange | null): void => {
  customRange.value = range;
  try {
    if (range) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(range));
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 写不进（隐私模式）就不记，本次会话里照常生效。
  }
};

/** 趋势范围的终点：自定义范围的最后一天，没有自定义就是今天。在 computed 里调用会订阅自定义范围的变化。 */
export const trendToday = (): Date => {
  const custom = customRange.value;
  return custom ? parseDay(custom.to) : currentToday();
};
