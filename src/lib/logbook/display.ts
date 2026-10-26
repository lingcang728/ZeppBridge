/** 履历里的日期与公里数显示（跟界面语言和地区设置走）。 */
import { displayDateTimeFormatter, parseDisplayDate } from '../dateTime';
import { locale } from '../../i18n';

export const journalShortDay = (date: string): string => locale.value === 'zh'
  ? date.replace(/-/g, '.')
  : displayDateTimeFormatter({ dateStyle: 'medium' }).format(parseDisplayDate(date));

/** `2026-10-22` → 「2026年10月22日」/ "Oct 22, 2026"。 */
export const journalDay = (date: string): string =>
  displayDateTimeFormatter({ year: 'numeric', month: 'short', day: 'numeric' }).format(parseDisplayDate(date));

/** 公里数：一位小数，整数不带 `.0`。 */
export const kmText = (km: number): string => (Math.abs(km - Math.round(km)) < 0.05 ? String(Math.round(km)) : km.toFixed(1));

/** 今天（本地日历日）。 */
export const todayKey = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};
