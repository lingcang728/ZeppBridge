import { ref, watch, type Ref } from 'vue';
import { SERIES_RANGE_DAYS, type SeriesRangeDays } from '../lib/metricSeries';

/**
 * 心率 / 日常活动 / 身体 / 训练四页共用的趋势范围（U11，用户 2026-09-30 定：全局记、默认 1 个月）。
 *
 * 以前四页各有各的默认值（7 天、7 天、1 个月、6 个月），离开再回来又重置。现在是一个
 * 模块级 ref：在任何一页选了 6 个月，另外三页也是 6 个月；下次打开应用还记得。
 * 各页是 keep-alive 缓存的，隐藏着的页会跟着在后台换好数据，回到场上不重画。
 */
const STORAGE_KEY = 'zeppbridge.trend.range';
const DEFAULT_RANGE: SeriesRangeDays = 30;

const read = (): SeriesRangeDays => {
  try {
    const saved = Number(window.localStorage.getItem(STORAGE_KEY));
    return (SERIES_RANGE_DAYS as readonly number[]).includes(saved) ? (saved as SeriesRangeDays) : DEFAULT_RANGE;
  } catch {
    return DEFAULT_RANGE;
  }
};

let shared: Ref<SeriesRangeDays> | null = null;

export const useTrendRange = (): Ref<SeriesRangeDays> => {
  if (shared) return shared;
  shared = ref<SeriesRangeDays>(read());
  watch(shared, (value) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, String(value));
    } catch {
      // 隐私模式写不进就不记——本次会话里四页仍然同步。
    }
  });
  return shared;
};

/**
 * 正在看哪一天（U13）：指针停在任何一张趋势图的某一天上，同页每张趋势卡都写出那天自己的值，
 * 没有记录就明说没有——不用在图间来回记数。移开就清掉。
 */
const focusDate = ref<string | null>(null);
export const useTrendFocus = () => focusDate;
