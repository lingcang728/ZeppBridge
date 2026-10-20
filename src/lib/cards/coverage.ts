/**
 * 一叠牌没有记录时，说清是哪一种没有（3.0.4）：
 *
 * - **还没补拉**：这段时间早于本机最早的一天，云端也还没问过——补拉一下可能就有了；
 * - **云端没有**：覆盖账本里这几个月都问过云端，云端明确说没有这一类数据。
 *
 * 两样都对不上就不下结论（照旧是「没有记录」）。读的是账本，不编数据。
 */
import type { CoverageLedger } from '../../types';
import type { AiTaskCategory } from '../bridge/types';
import type { DeckGroup, GroupCoverage } from './deck';

/** 每一类数据靠哪几条补拉流取回来（storage/coverage.rs 的 BACKFILL_STREAMS）。体重不在补拉里，不判「云端没有」。 */
const STREAMS: Partial<Record<AiTaskCategory, readonly string[]>> = {
  sleep: ['sleep'],
  heart_rate: ['heart_rate'],
  resting_hr: ['heart_rate', 'daily_summary'],
  recovery: ['daily_summary', 'hrv', 'wellness'],
  workout: ['workouts'],
  training: ['workouts'],
};

export interface CoverageContext {
  category: AiTaskCategory;
  /** 本机最早一天（AppStatus.coverage.earliest_day）。 */
  earliestLocal: string | null;
  ledger: CoverageLedger | null;
}

/** `[start, end]` 覆盖到的每个月，写成账本里的样子（`YYYY-MM-01`）。 */
export const monthsIn = (start: string, end: string): string[] => {
  const out: string[] = [];
  let [y, m] = start.split('-').map(Number) as [number, number];
  const last = end.slice(0, 7);
  for (;;) {
    const key = `${y}-${String(m).padStart(2, '0')}`;
    if (key > last) break;
    out.push(`${key}-01`);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
};

export const groupCoverage = (group: DeckGroup, ctx: CoverageContext | null): GroupCoverage => {
  if (!ctx || group.days.some((day) => day.has)) return null;
  const streams = STREAMS[ctx.category] ?? [];
  if (ctx.ledger && streams.length) {
    const empty = streams.map((name) => new Set(ctx.ledger!.streams.find((item) => item.stream === name)?.empty_months ?? []));
    const months = monthsIn(group.start, group.end);
    if (months.length && months.every((month) => empty.every((set) => set.has(month)))) return 'cloud_empty';
  }
  if (!ctx.earliestLocal || group.end >= ctx.earliestLocal) return null;
  return 'not_backfilled';
};
