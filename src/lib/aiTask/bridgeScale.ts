/** 「全部」= 十年（3.0.4）：和补拉、后端回溯的上限一致。 */
export const ALL_RANGE_DAYS = 3650;
/** 一类数据回溯多久。3.0.4 起加了 1 年和全部（以前最长 90 天）。 */
export const BRIDGE_RANGES = [7, 14, 30, 90, 365, ALL_RANGE_DAYS] as const;
/** 从这么长起算「长范围」：卡背面给体积估算，本机不够长时问要不要补拉。 */
export const LONG_RANGE_DAYS = 365;
export const dayKey = (date = new Date()): string => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export const addDays = (day: string, offset: number): string => {
  const [y, m, d] = day.split('-').map(Number);
  return dayKey(new Date(y, m - 1, d + offset));
};
export const daysBetween = (from: string, to: string): number => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
export const perCell = (days: number): number => days > 30 ? 3 : 1;
export const snapRange = (days: number): number => BRIDGE_RANGES.reduce<number>((best, next) => Math.abs(next - days) < Math.abs(best - days) ? next : best, 7);
export const futureSpan = (today: string, last?: string | null): number => Math.max(7, Math.min(57, last ? daysBetween(today, last) + 1 : 7));
export const todayPosition = (pastDays: number, futureDays: number): number => pastDays / (pastDays + futureDays);
