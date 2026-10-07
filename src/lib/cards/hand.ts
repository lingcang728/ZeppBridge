/**
 * 收集箱铺开的版式（第四轮 1A·A4 / A9，用户 10-07 拍板「按周分行的扇形」，取代第三轮那一道压在屏幕最底下的弧）。
 *
 * - 按项分组（指标 / 整类 / 运动），一组一块；组内**一周一排**（周一 → 周日七列，对齐星期），
 *   排与排上下错开、后一排压住前一排的下半截，像蜘蛛纸牌——每张牌露出的上沿正好是星期和日期。
 * - 某一项在一个自然月里挑了很多天（≥ `MONTH_FOLD_DAYS`）时，那个月折成**一张月牌**（点阵点亮挑了的日子），
 *   点开（`expanded` 里有它的 id）才摊成周排。运动一次一张，不折。
 * - 几组从左到右排，一行放不下就换行；整体在「顶部」与「底部按钮 + 箱子」之间垂直居中（A9：给底部留安全区）。
 * - 组标签画在这一组上方、牌之外（标签不被牌盖住，牌也不压标签）。
 * - 牌宽从大往小试，取放得下的最大一档；实在放不下就只摆前 `MAX_SHOWN` 张，其余写「还有 N 张」。
 * 纯函数：颜色、文案从外面传进来（`tintOf` / `labelOf` / `groupText`），这里只算位置。
 */
import { addDays } from '../aiTask/bridgeScale';
import type { AiTaskCategory } from '../bridge/types';

export interface HandGroup { key: string; category: AiTaskCategory; dates: string[]; items: Array<{ key: string; date: string }> }

/** 一个月里挑了这么多天就折成一张月牌。 */
export const MONTH_FOLD_DAYS = 15;
const MAX_SHOWN = 60;
const GAP = 8;
/** 下一排压住上一排，露出上一排的这么多（牌高的比例）。 */
const CASCADE = 0.36;
const LABEL_H = 34;
const GROUP_GAP_X = 36;
const GROUP_GAP_Y = 26;
const CARD_WIDTHS = [124, 112, 100, 92, 84, 76, 68, 60, 54];

export interface HandOptions {
  groupText: (key: string, days: number) => string;
  tintOf: (group: HandGroup) => string;
  labelOf: (key: string) => string;
  /** 已经点开的月牌 id。 */
  expanded?: ReadonlySet<string>;
  /** 顶部、底部各让出多少（底部 = 按钮 + 箱子）。 */
  insets?: { top: number; bottom: number; side: number };
}

export interface HandCardBox {
  /** `key@date`，删除时就用它。 */
  id: string;
  /** 所属组（指标 / `cat:…` / `workout`）。 */
  key: string;
  date: string;
  tint: string;
  label: string;
  group: number;
  style: Record<string, string>;
}

export interface HandMonthBox {
  /** `month:<组>@YYYY-MM`。 */
  id: string;
  key: string;
  month: string;
  /** 这个月里挑了的那些 `key@date`（拖走 / × 时整月一起拿出去）。 */
  ids: string[];
  /** 7 列日历点阵：前面补 `null` 对齐星期；true = 挑了。 */
  cells: Array<boolean | null>;
  count: number;
  tint: string;
  label: string;
  group: number;
  style: Record<string, string>;
}

export interface HandLabelBox { key: string; text: string; tint: string; style: Record<string, string> }

export interface HandLayout { cards: HandCardBox[]; months: HandMonthBox[]; labels: HandLabelBox[]; more: number; cardW: number }

/** 星期几（周一 = 0），本地日历。 */
export const weekdayOf = (date: string): number => {
  const [y, m, d] = date.split('-').map(Number);
  return (new Date(y!, m! - 1, d!).getDay() + 6) % 7;
};
const mondayOf = (date: string) => addDays(date, -weekdayOf(date));
const daysInMonth = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return new Date(y!, m!, 0).getDate();
};

type Slot = { kind: 'card'; item: { key: string; date: string }; col: number } | { kind: 'month'; month: string; dates: string[]; ids: string[]; col: number };

/** 一组摆成几排：按日期先后，折起来的月牌落在它那个月的位置，其余按周一排、同一天第二张（运动）落到下一排的同一列。 */
export const groupRows = (group: HandGroup, expanded: ReadonlySet<string> = new Set()): Slot[][] => {
  const items = [...group.items].sort((a, b) => a.date.localeCompare(b.date));
  const foldable = group.key !== 'workout';
  const byMonth = new Map<string, Array<{ key: string; date: string }>>();
  for (const item of items) {
    const month = item.date.slice(0, 7);
    byMonth.set(month, [...(byMonth.get(month) ?? []), item]);
  }
  const folded = new Set([...byMonth].filter(([month, list]) => foldable && list.length >= MONTH_FOLD_DAYS && !expanded.has(monthId(group.key, month))).map(([month]) => month));
  // 按日期从早到晚排：折起来的月牌落在它那个月的位置上（相邻几个月的月牌并成一排），其余一周一排。
  const rows: Slot[][] = [];
  let week = '';
  let weekRows: Slot[][] = [];
  let monthRow: Slot[] | null = null;
  const seenMonths = new Set<string>();
  for (const item of items) {
    const month = item.date.slice(0, 7);
    if (folded.has(month)) {
      if (seenMonths.has(month)) continue;
      seenMonths.add(month);
      rows.push(...weekRows);
      weekRows = [];
      week = '';
      if (!monthRow || monthRow.length >= 7) { monthRow = []; rows.push(monthRow); }
      const list = byMonth.get(month)!;
      monthRow.push({ kind: 'month', month, dates: list.map((one) => one.date), ids: list.map((one) => `${one.key}@${one.date}`), col: monthRow.length });
      continue;
    }
    monthRow = null;
    const monday = mondayOf(item.date);
    if (monday !== week) { rows.push(...weekRows); weekRows = []; week = monday; }
    const col = weekdayOf(item.date);
    let row = weekRows.find((r) => !r.some((slot) => slot.col === col));
    if (!row) { row = []; weekRows.push(row); }
    row.push({ kind: 'card', item, col });
  }
  rows.push(...weekRows);
  return rows;
};

export const monthId = (key: string, month: string) => `month:${key}@${month}`;

/** 这一组用宽 w 的牌摆出来有多宽、多高（含标签）。 */
const blockSize = (rows: number, w: number) => {
  const h = w * 1.4;
  return { width: 7 * w + 6 * GAP, height: LABEL_H + (rows > 0 ? (rows - 1) * h * CASCADE + h : 0) };
};

/** 一组组从左到右排，放不下换行。返回每组的左上角和整体大小。 */
const shelve = (sizes: Array<{ width: number; height: number }>, maxWidth: number) => {
  const shelves: Array<{ items: number[]; width: number; height: number }> = [];
  sizes.forEach((size, i) => {
    const last = shelves[shelves.length - 1];
    if (last && last.width + GROUP_GAP_X + size.width <= maxWidth) {
      last.items.push(i);
      last.width += GROUP_GAP_X + size.width;
      last.height = Math.max(last.height, size.height);
    } else {
      shelves.push({ items: [i], width: size.width, height: size.height });
    }
  });
  const height = shelves.reduce((sum, shelf) => sum + shelf.height, 0) + Math.max(0, shelves.length - 1) * GROUP_GAP_Y;
  const width = Math.max(0, ...shelves.map((shelf) => shelf.width));
  return { shelves, width, height };
};

export const handLayout = (groups: HandGroup[], viewport: { width: number; height: number }, options: HandOptions): HandLayout => {
  const insets = options.insets ?? { top: 72, bottom: 168, side: 24 };
  const expanded = options.expanded ?? new Set<string>();
  // 摆多少：月牌算一张；超过 MAX_SHOWN 的从最后一组往前截掉。
  let budget = MAX_SHOWN;
  let hidden = 0;
  const rowsOf = groups.map((group) => {
    const rows = groupRows(group, expanded);
    const kept: Slot[][] = [];
    for (const row of rows) {
      if (budget <= 0) { hidden += row.reduce((n, slot) => n + (slot.kind === 'month' ? slot.dates.length : 1), 0); continue; }
      const take = row.slice(0, budget);
      for (const slot of row.slice(budget)) hidden += slot.kind === 'month' ? slot.dates.length : 1;
      budget -= take.length;
      kept.push(take);
    }
    return kept;
  });
  const maxWidth = Math.max(240, viewport.width - insets.side * 2);
  const maxHeight = Math.max(200, viewport.height - insets.top - insets.bottom);
  let w = CARD_WIDTHS[CARD_WIDTHS.length - 1]!;
  let placed = shelve(rowsOf.map((rows) => blockSize(rows.length, w)), maxWidth);
  for (const candidate of CARD_WIDTHS) {
    const tried = shelve(rowsOf.map((rows) => blockSize(rows.length, candidate)), maxWidth);
    if (tried.width <= maxWidth && tried.height <= maxHeight) { w = candidate; placed = tried; break; }
  }
  const h = Math.round(w * 1.4);
  const top0 = insets.top + Math.max(0, (maxHeight - placed.height) / 2);
  const cards: HandCardBox[] = [];
  const months: HandMonthBox[] = [];
  const labels: HandLabelBox[] = [];
  let z = 1;
  let y = top0;
  for (const shelf of placed.shelves) {
    let x = (viewport.width - shelf.width) / 2;
    for (const g of shelf.items) {
      const group = groups[g]!;
      const rows = rowsOf[g]!;
      const tint = options.tintOf(group);
      const label = options.labelOf(group.key);
      const size = blockSize(rows.length, w);
      labels.push({ key: group.key, text: options.groupText(group.key, group.dates.length), tint, style: { left: `${x.toFixed(1)}px`, top: `${y.toFixed(1)}px` } });
      rows.forEach((row, r) => {
        const rowTop = y + LABEL_H + r * h * CASCADE;
        for (const slot of row) {
          const style = {
            left: `${(x + slot.col * (w + GAP)).toFixed(1)}px`, top: `${rowTop.toFixed(1)}px`, width: `${w}px`, height: `${h}px`,
            '--tint': tint, zIndex: String(z++),
          };
          if (slot.kind === 'card') {
            cards.push({ id: `${slot.item.key}@${slot.item.date}`, key: group.key, date: slot.item.date, tint, label, group: g, style });
          } else {
            const lead = weekdayOf(`${slot.month}-01`);
            const picked = new Set(slot.dates.map((date) => Number(date.slice(8))));
            const cells: Array<boolean | null> = [...Array<null>(lead).fill(null), ...Array.from({ length: daysInMonth(slot.month) }, (_, d) => picked.has(d + 1))];
            months.push({ id: monthId(group.key, slot.month), key: group.key, month: slot.month, ids: slot.ids, cells, count: slot.dates.length, tint, label, group: g, style });
          }
        }
      });
      x += size.width + GROUP_GAP_X;
    }
    y += shelf.height + GROUP_GAP_Y;
  }
  return { cards, months, labels, more: hidden, cardW: w };
};
