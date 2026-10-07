/**
 * 牌桌的牌从哪来（精修批次 7.2）：一项指标（指标卡），或一整类（「你的过去」的某一行、睡眠详情）。
 * 两种都只回答「这一天有没有记录、读数是多少」，牌桌不管数据从哪个接口来。
 */
import { backend } from '../bridge';
import type { AiTaskCategory } from '../bridge/types';
import { dayKey, daysBetween } from '../aiTask/bridgeScale';
import { daysBetweenInclusive } from './deck';
import type { DeckDay } from './deck';

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
  /** 取 `[start, end]` 每一天（旧 → 新），没有记录的日子照样给一格（has: false），不补 0。 */
  loadDays: (start: string, end: string) => Promise<DeckDay[]>;
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
  loadDays: async (start, end) => {
    // 指标序列只能「从今天往回 N 天」地取：取到 start 为止，再截到 end。
    const [series] = await backend.getMetricSeries([options.metric], daysBetween(start, deckToday()) + 1);
    const byDate = new Map((series?.points ?? []).filter((p) => Number.isFinite(p.value)).map((p) => [p.date, p.value]));
    return daysBetweenInclusive(start, end, (date) => (byDate.has(date) ? { value: byDate.get(date)!, has: true } : null));
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
  loadDays: async (start, end) => {
    const rows = await backend.aiTaskDayStrip(daysBetween(start, end) + 1, end);
    const cells = rows.find((row) => row.category === options.category)?.cells ?? [];
    const byDate = new Map(cells.map((cell) => [cell.date, cell]));
    return daysBetweenInclusive(start, end, (date) => {
      const cell = byDate.get(date);
      return cell ? { value: cell.value, has: cell.has || cell.value !== null } : null;
    });
  },
});

/** 牌桌的「今天」：和条带一样用本地日。 */
export const deckToday = (): string => dayKey();
