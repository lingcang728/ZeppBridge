/**
 * 履历页年轮区块用的一年小结：都从那一年的运动（`stars`）现算，只陈述事实——
 * 没有的就是 null（界面显示「—」），不拿 0 顶。
 */
import { dayOfYear } from './geometry';
import type { RingStar, RingYear } from '../../types/rings';

/** 按运动类型数次数：最多的 `top` 种单列，其余并成「其他」（`kind: null`）。 */
export function kindLegend(stars: RingStar[], top = 3): { kind: string | null; count: number }[] {
  const counts = new Map<string, number>();
  for (const star of stars) counts.set(star.kind, (counts.get(star.kind) ?? 0) + 1);
  const sorted = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const rest = sorted.slice(top).reduce((sum, [, n]) => sum + n, 0);
  return [...sorted.slice(0, top).map(([kind, count]) => ({ kind, count })), ...(rest ? [{ kind: null, count: rest }] : [])];
}

/**
 * 和去年比：今年还没过完时只拿去年到同一天为止的那一段比（「比去年同期」），不拿半年去比整年。
 * 去年没有数据、或者去年那一段是 0 时没法比，返回 null。
 */
export function versusLastYear(year: RingYear, previous: RingYear | undefined, today: string) {
  if (!previous?.stars.length) return null;
  const cutoff = year.in_progress && today.startsWith(`${year.year}-`) ? dayOfYear(today) : Infinity;
  const span = previous.stars.filter(s => dayOfYear(s.date) <= cutoff);
  const change = (now: number, before: number) => (before > 0 ? (now - before) / before : null);
  const km = (list: RingStar[]) => list.reduce((sum, s) => sum + (s.distance_m ?? 0), 0);
  return {
    sameSpan: Number.isFinite(cutoff),
    workouts: change(year.stars.length, span.length),
    distance: change(km(year.stars), km(span)),
  };
}

/** 有运动的日子连成的段，最长的在前；一样长的早的在前。 */
export function streaks(stars: RingStar[]): { from: string; to: string; days: number }[] {
  const days = [...new Set(stars.map(s => s.date))].sort();
  const runs: { from: string; to: string; days: number }[] = [];
  const next = (date: string) => {
    const [y, m, d] = date.split('-').map(Number);
    const day = new Date(y, m - 1, d + 1);
    return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
  };
  for (const date of days) {
    const last = runs[runs.length - 1];
    if (last && next(last.to) === date) { last.to = date; last.days += 1; } else runs.push({ from: date, to: date, days: 1 });
  }
  return runs.sort((a, b) => b.days - a.days || a.from.localeCompare(b.from));
}

/** 十二个月各练了几次、多少米。 */
export function monthTotals(stars: RingStar[]): { month: number; count: number; distance: number }[] {
  const months = Array.from({ length: 12 }, (_, month) => ({ month, count: 0, distance: 0 }));
  for (const star of stars) {
    const month = months[Number(star.date.slice(5, 7)) - 1];
    if (!month) continue;
    month.count += 1;
    month.distance += star.distance_m ?? 0;
  }
  return months;
}

/** 这一年里有手表数据的日子占已经过去的日子多少（今年按到今天为止算）。 */
export function coverageShare(year: RingYear, today: string, days: number): number {
  const elapsed = year.in_progress && today.startsWith(`${year.year}-`) ? dayOfYear(today) + 1 : days;
  return Math.min(1, year.data_days / Math.max(1, elapsed));
}
