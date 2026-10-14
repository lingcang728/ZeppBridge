import { watch, type Ref } from 'vue';

/**
 * 「这次换数据是切范围」的信号，给 SwapChart 用。
 *
 * 图表的 option 会因为很多原因变：切 7 天 / 1 个月 / 6 个月、换深浅主题、换语言、同步来了
 * 新数据。只有切范围值得做一段过渡——换主题时整页已经在做圆形揭开，图再自己淡一遍就是
 * 「换个主题图表又重画了一次」；换语言、同步落地也一样，原地换掉最安静。
 *
 * 所以页面在范围变化的那一刻（同步 watch，早于任何图表重算）记一笔，SwapChart 只在
 * 这一笔还新鲜时做交叉溶解。各图是排队一帧一张换的（useQueuedOption），十来张图排完
 * 也就几百毫秒，窗口给得宽一点。
 */
const FRESH_MS = 1500;

export interface ChartSwapIntent {
  /** 1 = 范围变长（看得更远），-1 = 变短，0 = 不知道。 */
  direction: -1 | 0 | 1;
}

let last: { at: number; direction: -1 | 0 | 1 } | null = null;

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export const announceChartSwap = (from: number, to: number): void => {
  last = { at: now(), direction: to > from ? 1 : to < from ? -1 : 0 };
};

export const chartSwapIntent = (): ChartSwapIntent | null =>
  last && now() - last.at < FRESH_MS ? { direction: last.direction } : null;

/** 页面的范围 ref 一变就记一笔（flush: 'sync'：赶在图表 option 重算之前）。 */
export const trackRangeSwap = (range: Ref<number>): void => {
  watch(range, (to, from) => announceChartSwap(from, to), { flush: 'sync' });
};

/** 测试用。 */
export const resetChartSwap = (): void => { last = null; };
