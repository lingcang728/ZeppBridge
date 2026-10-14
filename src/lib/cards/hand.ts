/**
 * 收集箱铺开的版式（10-08 H4 重做，取代 10-07 的「按周分行的扇形」）。
 *
 * 用户 10-08：按周二、周三、周四分天排完全没必要——挑的时候不是按星期挑的，直接排在一处就好；
 * 一周一排还让下一排压住上一排的下半截，组标签挂在每组左上角，整体很乱。
 *
 * - 所有牌按「组（指标 / 整类 / 运动）→ 日期」排成**一条**，从左到右流下去，一行放不下就换行；每行居中，
 *   行与行之间留空，**牌不互相压**。组与组之间在同一行里多空一截，看得出换了一项。
 * - 某一项在一个自然月里挑了很多天（≥ `MONTH_FOLD_DAYS`）时，那个月折成**一张月牌**（点阵点亮挑了的日子），
 *   落在它那个月的位置；点开（`expanded` 里有它的 id）才摊开。运动一次一张，不折。
 * - 组标签不再挂在牌堆左上角：整排放在牌堆正上方居中（`labelTop`），不和任何牌重叠。
 * - 整体在「顶部」与「底部按钮 + 箱子」之间垂直居中；牌宽从大往小试，取放得下的最大一档；
 *   实在放不下就只摆前 `MAX_SHOWN` 张，其余写「还有 N 张」。
 * 纯函数：颜色、文案从外面传进来（`tintOf` / `labelOf` / `groupText`），这里只算位置。
 */
import type { AiTaskCategory } from '../bridge/types';

export interface HandGroup { key: string; category: AiTaskCategory; dates: string[]; items: Array<{ key: string; date: string }> }

/** 一个月里挑了这么多天就折成一张月牌。 */
export const MONTH_FOLD_DAYS = 15;
const MAX_SHOWN = 60;
const GAP_X = 12;
const GAP_Y = 16;
/** 同一行里换了一组：多空这么一截。 */
const GROUP_GAP = 26;
/** 牌堆上方那一排组标签的高度（含和牌之间的空）。 */
const LABEL_BAR = 50;
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

export interface HandLabelBox { key: string; text: string; tint: string }

export interface HandLayout { cards: HandCardBox[]; months: HandMonthBox[]; labels: HandLabelBox[]; labelTop: number; more: number; cardW: number }

/** 星期几（周一 = 0），本地日历。月牌的点阵用它对齐。 */
export const weekdayOf = (date: string): number => {
  const [y, m, d] = date.split('-').map(Number);
  return (new Date(y!, m! - 1, d!).getDay() + 6) % 7;
};
const daysInMonth = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return new Date(y!, m!, 0).getDate();
};

export type Slot = { kind: 'card'; item: { key: string; date: string } } | { kind: 'month'; month: string; dates: string[]; ids: string[] };

export const monthId = (key: string, month: string) => `month:${key}@${month}`;

/** 一组排成一条：按日期先后；挑满一个月的那个月折成一张月牌，落在那个月的位置。 */
export const groupSlots = (group: HandGroup, expanded: ReadonlySet<string> = new Set()): Slot[] => {
  const items = [...group.items].sort((a, b) => a.date.localeCompare(b.date));
  const foldable = group.key !== 'workout';
  const byMonth = new Map<string, Array<{ key: string; date: string }>>();
  for (const item of items) {
    const month = item.date.slice(0, 7);
    byMonth.set(month, [...(byMonth.get(month) ?? []), item]);
  }
  const folded = new Set([...byMonth].filter(([month, list]) => foldable && list.length >= MONTH_FOLD_DAYS && !expanded.has(monthId(group.key, month))).map(([month]) => month));
  const slots: Slot[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const month = item.date.slice(0, 7);
    if (!folded.has(month)) { slots.push({ kind: 'card', item }); continue; }
    if (seen.has(month)) continue;
    seen.add(month);
    const list = byMonth.get(month)!;
    slots.push({ kind: 'month', month, dates: list.map((one) => one.date), ids: list.map((one) => `${one.key}@${one.date}`) });
  }
  return slots;
};

type Placed = { slot: Slot; group: number };

/** 按宽 w 从左到右流：返回每一行（每行里的牌和这一行的宽）。 */
const flow = (items: Placed[], w: number, maxWidth: number) => {
  const rows: Array<{ items: Array<Placed & { x: number }>; width: number }> = [];
  let row: { items: Array<Placed & { x: number }>; width: number } | null = null;
  for (const item of items) {
    const prev = row?.items[row.items.length - 1];
    const gap = prev ? GAP_X + (prev.group !== item.group ? GROUP_GAP : 0) : 0;
    if (!row || row.width + gap + w > maxWidth) {
      row = { items: [], width: 0 };
      rows.push(row);
      row.items.push({ ...item, x: 0 });
      row.width = w;
      continue;
    }
    row.items.push({ ...item, x: row.width + gap });
    row.width += gap + w;
  }
  return rows;
};

export const handLayout = (groups: HandGroup[], viewport: { width: number; height: number }, options: HandOptions): HandLayout => {
  const insets = options.insets ?? { top: 72, bottom: 168, side: 24 };
  const expanded = options.expanded ?? new Set<string>();
  // 摆多少：月牌算一张；超过 MAX_SHOWN 的从后面截掉，写「还有 N 张」。
  const all: Placed[] = groups.flatMap((group, g) => groupSlots(group, expanded).map((slot) => ({ slot, group: g })));
  const shown = all.slice(0, MAX_SHOWN);
  const more = all.slice(MAX_SHOWN).reduce((n, { slot }) => n + (slot.kind === 'month' ? slot.dates.length : 1), 0);
  const maxWidth = Math.max(240, viewport.width - insets.side * 2);
  const maxHeight = Math.max(200, viewport.height - insets.top - insets.bottom - LABEL_BAR);
  const heightOf = (rows: number, w: number) => rows * Math.round(w * 1.4) + Math.max(0, rows - 1) * GAP_Y;
  let w = CARD_WIDTHS[CARD_WIDTHS.length - 1]!;
  let rows = flow(shown, w, maxWidth);
  for (const candidate of CARD_WIDTHS) {
    const tried = flow(shown, candidate, maxWidth);
    if (heightOf(tried.length, candidate) <= maxHeight) { w = candidate; rows = tried; break; }
  }
  const h = Math.round(w * 1.4);
  const blockH = heightOf(rows.length, w);
  const top0 = insets.top + LABEL_BAR + Math.max(0, (maxHeight - blockH) / 2);
  const cards: HandCardBox[] = [];
  const months: HandMonthBox[] = [];
  let z = 1;
  rows.forEach((row, r) => {
    const left0 = (viewport.width - row.width) / 2;
    const top = top0 + r * (h + GAP_Y);
    for (const { slot, group: g, x } of row.items) {
      const group = groups[g]!;
      const tint = options.tintOf(group);
      const label = options.labelOf(group.key);
      const style = {
        left: `${(left0 + x).toFixed(1)}px`, top: `${top.toFixed(1)}px`, width: `${w}px`, height: `${h}px`,
        '--tint': tint, zIndex: String(z++),
      };
      if (slot.kind === 'card') {
        cards.push({ id: `${slot.item.key}@${slot.item.date}`, key: group.key, date: slot.item.date, tint, label, group: g, style });
        continue;
      }
      const lead = weekdayOf(`${slot.month}-01`);
      const picked = new Set(slot.dates.map((date) => Number(date.slice(8))));
      const cells: Array<boolean | null> = [...Array<null>(lead).fill(null), ...Array.from({ length: daysInMonth(slot.month) }, (_, d) => picked.has(d + 1))];
      months.push({ id: monthId(group.key, slot.month), key: group.key, month: slot.month, ids: slot.ids, cells, count: slot.dates.length, tint, label, group: g, style });
    }
  });
  const labels = groups.map((group) => ({ key: group.key, text: options.groupText(group.key, group.dates.length), tint: options.tintOf(group) }));
  return { cards, months, labels, labelTop: top0 - LABEL_BAR, more, cardW: w };
};
