/**
 * 牌桌的牌从哪来（精修批次 7.2）：一项指标（二级页的指标卡），或一整类（「你的过去」的某一类）。
 * 两种都只回答「这一天有没有记录、读数是多少」，牌桌不管数据从哪个接口来。
 */
import { backend } from '../bridge';
import type { AiTaskCategory } from '../bridge/types';
import { dayKey, daysBetween } from '../aiTask/bridgeScale';
import { daysBetweenInclusive, rangeStart, type DeckDay, type DeckRange } from './deck';

export interface DeckSource {
  /** 收集箱里的项：指标名，或 `cat:<类别>`。 */
  key: string;
  category: AiTaskCategory;
  label: string;
  /** 牌面数值的颜色（和这一项在别处的颜色一致）。 */
  tint: string;
  /** 读数怎么写（跟卡片自己的格式一致）；没有就只说「有记录」。 */
  format: ((value: number) => string) | null;
  unit?: string;
  /** 取 `[这一档的起点, today]` 每一天。 */
  load: (range: DeckRange, today: string) => Promise<DeckDay[]>;
}

export const metricSource = (options: {
  metric: string; category: AiTaskCategory; label: string; tint: string; format: (value: number) => string; unit?: string;
}): DeckSource => ({
  key: options.metric,
  category: options.category,
  label: options.label,
  tint: options.tint,
  format: options.format,
  unit: options.unit,
  load: async (range, today) => {
    const start = rangeStart(today, range);
    const [series] = await backend.getMetricSeries([options.metric], daysBetween(start, today) + 1);
    const byDate = new Map((series?.points ?? []).filter((p) => Number.isFinite(p.value)).map((p) => [p.date, p.value]));
    return daysBetweenInclusive(start, today, (date) => (byDate.has(date) ? { value: byDate.get(date)!, has: true } : null));
  },
});

export const categorySource = (options: {
  category: AiTaskCategory; label: string; tint: string; format: ((value: number) => string) | null; unit?: string;
}): DeckSource => ({
  key: `cat:${options.category}`,
  category: options.category,
  label: options.label,
  tint: options.tint,
  format: options.format,
  unit: options.unit,
  load: async (range, today) => {
    const start = rangeStart(today, range);
    const rows = await backend.aiTaskDayStrip(daysBetween(start, today) + 1, today);
    const cells = rows.find((row) => row.category === options.category)?.cells ?? [];
    const byDate = new Map(cells.map((cell) => [cell.date, cell]));
    return daysBetweenInclusive(start, today, (date) => {
      const cell = byDate.get(date);
      return cell ? { value: cell.value, has: cell.has || cell.value !== null } : null;
    });
  },
});

/** 牌桌的「今天」：和条带一样用本地日。 */
export const deckToday = (): string => dayKey();
