/**
 * 节点外圈的「日环」：窗口里每一天（或每几天）一格，有数据的亮、缺的灰。
 *
 * 以前外圈只有一段连续的覆盖弧，只告诉人「覆盖了 87%」，看不出缺的是哪几天、
 * 是中间断了还是最近几天没同步。这里把后端给的 `covered_dates` 摊成格子。
 *
 * 缺失不补造：没有 `covered_dates`（旧载荷）、或窗口是不相连的几段（天数对不上跨度）
 * 一律给 null，界面退回连续弧，不去猜哪几天有。
 */
import type { AiTaskCoverage } from '../bridge/types';

/** 一圈最多画这么多格；窗口更长时几天并成一格。 */
export const DAY_RING_MAX_CELLS = 30;

export interface DayRing {
  /** 每格 0..1：这一格里有数据的天数占比。一天一格时只有 0 和 1。 */
  cells: number[];
  /** 每格代表几天。 */
  perCell: number;
}

const dayIndex = (date: string): number | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return null;
  return Math.floor(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / 86_400_000);
};

export const dayRing = (
  row: Pick<AiTaskCoverage, 'start_date' | 'end_date' | 'days_in_range' | 'covered_dates'>,
  maxCells = DAY_RING_MAX_CELLS,
): DayRing | null => {
  if (!row.covered_dates) return null;
  const start = dayIndex(row.start_date);
  const end = dayIndex(row.end_date);
  if (start === null || end === null || end < start) return null;
  const span = end - start + 1;
  // 多个运动窗口合并时 days_in_range 是并集天数、跨度可能更长：不相连就画不成一圈。
  if (span !== row.days_in_range) return null;

  const have = new Set<number>();
  for (const date of row.covered_dates) {
    const index = dayIndex(date);
    if (index !== null && index >= start && index <= end) have.add(index - start);
  }

  const perCell = Math.max(1, Math.ceil(span / Math.max(1, maxCells)));
  const count = Math.ceil(span / perCell);
  const cells: number[] = [];
  for (let cell = 0; cell < count; cell += 1) {
    const from = cell * perCell;
    const to = Math.min(span, from + perCell);
    let covered = 0;
    for (let day = from; day < to; day += 1) if (have.has(day)) covered += 1;
    cells.push(covered / (to - from));
  }
  return { cells, perCell };
};
