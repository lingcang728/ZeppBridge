/**
 * 收集箱铺开成「手里的一把牌」的版式（精修批次 7.3，第三轮从 CollectionBox.vue 拆出来）。
 *
 * 圆心在屏幕下方很远处，牌沿一段平缓的圆弧排开、各自转到圆弧的切向；一把与一把之间空半张牌。
 * 牌少时一张张摊开（几乎不压），牌多了才像手里那样压成一把、牌也缩小。每一把头上一枚标签。
 */
import { AI_TASK_CATEGORY_META, categoryLabel } from '../aiTask/categories';
import { metricLabel } from '../aiTask/metrics';
import type { AiTaskCategory } from '../bridge/types';

export interface HandGroup { key: string; category: AiTaskCategory; dates: string[]; items: Array<{ key: string; date: string }> }

const MAX_SHOWN = 40;

/** 箱子里一项的名字：`cat:<类别>` 是整类，`workout:<id>` / `workout` 是运动，其余是指标名。 */
export const labelOfPick = (key: string): string => {
  if (key === 'workout' || key.startsWith('workout:')) return categoryLabel('workout');
  if (key.startsWith('cat:')) return categoryLabel(key.slice(4) as AiTaskCategory);
  return metricLabel(key);
};
const tintOf = (category: AiTaskCategory) => AI_TASK_CATEGORY_META[category]?.tint ?? 'var(--accent)';

export const handLayout = (groups: HandGroup[], viewport: { width: number; height: number }, groupText: (key: string, days: number) => string) => {
  const shown: Array<{ id: string; key: string; date: string; tint: string; label: string; group: number }> = [];
  groups.forEach((group, g) => {
    for (const item of group.items) {
      if (shown.length >= MAX_SHOWN) break;
      shown.push({ id: `${item.key}@${item.date}`, key: group.key, date: item.date, tint: tintOf(group.category), label: labelOfPick(group.key), group: g });
    }
  });
  const n = shown.length;
  const { width, height } = viewport;
  const w = Math.round(Math.max(76, Math.min(132, (width - 200) / Math.max(5, n * 0.62))));
  const h = Math.round(w * 1.4);
  const R = Math.max(900, width * 0.9);
  const overlap = Math.max(0.58, Math.min(1.06, 1.12 - n * 0.035));
  const step = (w * overlap) / R;
  const gaps = new Set<number>();
  shown.forEach((card, i) => { if (i > 0 && shown[i - 1]!.group !== card.group) gaps.add(i); });
  const units = Math.max(0, n - 1) + gaps.size * 0.6;
  let at = -(units * step) / 2;
  const cx = width / 2;
  const topY = height - 150 - h / 2 - Math.min(80, height * 0.08);
  const pivotY = topY + R;
  const cards = shown.map((card, i) => {
    if (i > 0) at += step * (gaps.has(i) ? 1.6 : 1);
    const x = cx + R * Math.sin(at);
    const y = pivotY - R * Math.cos(at);
    const deg = (at * 180) / Math.PI;
    return {
      ...card, angle: at,
      style: {
        left: `${(x - w / 2).toFixed(1)}px`, top: `${(y - h / 2).toFixed(1)}px`, width: `${w}px`, height: `${h}px`,
        transform: `rotate(${deg.toFixed(2)}deg)`, '--tint': card.tint,
        '--lx': `${(Math.sin(at) * 30).toFixed(1)}px`, '--ly': `${(-Math.cos(at) * 30).toFixed(1)}px`, zIndex: String(i + 1),
      } as Record<string, string>,
    };
  });
  const labels = groups.map((group, g) => {
    const mine = cards.filter((card) => card.group === g);
    if (!mine.length) return null;
    const mid = (mine[0]!.angle + mine[mine.length - 1]!.angle) / 2;
    const r = R + h / 2 + 30;
    return {
      key: group.key, text: groupText(group.key, group.dates.length), tint: tintOf(group.category),
      style: { left: `${(cx + r * Math.sin(mid)).toFixed(1)}px`, top: `${(pivotY - r * Math.cos(mid)).toFixed(1)}px` },
    };
  }).filter((label): label is NonNullable<typeof label> => label !== null);
  return { cards, labels, more: groups.reduce((sum, group) => sum + group.items.length, 0) - shown.length, cardW: w };
};
