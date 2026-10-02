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

/** 大圈「表圈」一圈最多画这么多格：圈大，九十天也能一天一格。 */
export const WINDOW_DIAL_MAX_CELLS = 120;

export interface WindowDial {
  /** 每格 0..1：圈里任一类别这一格有数据的天数占比；有一行缺逐日数据时为 null（只画刻度，不点亮）。 */
  cells: number[] | null;
  /** 刻度格数（cells 为 null 时也有）。 */
  count: number;
  perCell: number;
  /** 窗口最后一天（12 点方向那一格）。 */
  endDate: string;
}

/**
 * 交给 AI 的大圈：整个分析窗口（各类别窗口的并集跨度）一天一格，从 12 点顺时针排到最后一天。
 * 哪一天「圈里任一类别有数据」就亮。任一行缺逐日数据或不相连时 cells 给 null——只画刻度。
 */
export const windowDial = (
  rows: Pick<AiTaskCoverage, 'start_date' | 'end_date' | 'days_in_range' | 'covered_dates'>[],
  maxCells = WINDOW_DIAL_MAX_CELLS,
): WindowDial | null => {
  let start: number | null = null;
  let end: number | null = null;
  let endDate = '';
  for (const row of rows) {
    const from = dayIndex(row.start_date);
    const to = dayIndex(row.end_date);
    if (from === null || to === null || to < from) return null;
    if (start === null || from < start) start = from;
    if (end === null || to > end) { end = to; endDate = row.end_date; }
  }
  if (start === null || end === null) return null;
  const span = end - start + 1;
  const perCell = Math.max(1, Math.ceil(span / Math.max(1, maxCells)));
  const count = Math.ceil(span / perCell);

  const exact = rows.every((row) => {
    const from = dayIndex(row.start_date)!;
    return row.covered_dates && dayIndex(row.end_date)! - from + 1 === row.days_in_range;
  });
  if (!exact) return { cells: null, count, perCell, endDate };

  const have = new Set<number>();
  for (const row of rows) {
    for (const date of row.covered_dates ?? []) {
      const index = dayIndex(date);
      if (index !== null && index >= start && index <= end) have.add(index - start);
    }
  }
  // 从最后一天往前分格：今天永远单独落在最后一格（12 点），零头并进最早的那一格。
  const cells: number[] = [];
  for (let cell = 0; cell < count; cell += 1) {
    const to = span - (count - 1 - cell) * perCell;
    const from = Math.max(0, to - perCell);
    let covered = 0;
    for (let day = from; day < to; day += 1) if (have.has(day)) covered += 1;
    cells.push(covered / (to - from));
  }
  return { cells, count, perCell, endDate };
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
