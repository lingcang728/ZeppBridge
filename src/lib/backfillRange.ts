/**
 * 历史补拉的起点怎么算（issue #136）。
 *
 * 后端只认「起点到今天（UTC 日）不超过 3650 天」。以前「全部」按日历年往回退
 * 10 年，算出来是 3652–3653 天，撞上上限却显示成「日期无效，需要 YYYY-MM-DD」。
 * 现在「全部」按天数对齐上限，再留两天余量：界面用的是本地日期，后端用的是
 * UTC 日期，西半球晚上的本地「今天」比 UTC 早一天，正好差在边界上。
 */
import { localDateString } from './format';

export type BackfillChoice = '1y' | '2y' | '3y' | 'all' | 'custom';

/** 和后端 `UserPrefs::MAX_HISTORY_SYNC_DAYS` 一致。 */
export const HISTORY_LIMIT_DAYS = 3650;

/** 「全部」往回取多少天：上限减去本地日与 UTC 日之间可能差的那一天，再多留一天。 */
export const ALL_HISTORY_DAYS = HISTORY_LIMIT_DAYS - 2;

/** 「全部」在界面上说成几年（3648 天就是十年少两天）。 */
export const ALL_HISTORY_YEARS = 10;

const daysBefore = (today: Date, days: number): string => {
  const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - days);
  return localDateString(date);
};

const yearsBefore = (today: Date, years: number): string => {
  const date = new Date(today);
  date.setFullYear(date.getFullYear() - years);
  // 纯日历日期：用本地年月日，`toISOString()` 会在东八区把清晨推到前一天。
  return localDateString(date);
};

/** 自定义起点最早能选到哪天（滚轮的 min）。 */
export const earliestBackfillDate = (today: Date): string => daysBefore(today, ALL_HISTORY_DAYS);

/** 自定义起点的默认值：一年前。空字符串会让滚轮三列全空（#136）。 */
export const defaultCustomFrom = (today: Date): string => yearsBefore(today, 1);

/** 选项 → 起点日期（YYYY-MM-DD）。自定义起点不合法时给空串，由调用方提示先选日期。 */
export const backfillStartDate = (choice: BackfillChoice, today: Date, custom: string): string => {
  switch (choice) {
    case '1y': return yearsBefore(today, 1);
    case '2y': return yearsBefore(today, 2);
    case '3y': return yearsBefore(today, 3);
    case 'all': return earliestBackfillDate(today);
    default: {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(custom)) return '';
      const earliest = earliestBackfillDate(today);
      return custom < earliest ? earliest : custom;
    }
  }
};
