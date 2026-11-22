import { ref, watch, type Ref } from 'vue';
import { SERIES_RANGE_DAYS, type SeriesRangeDays } from '../lib/metricSeries';
import { customRange, setCustomRange, spanDays, type CustomRange } from '../lib/trendWindow';

/**
 * 心率 / 日常活动 / 身体 / 训练 / 睡眠几页共用的趋势范围（全局记、默认 1 个月）。
 *
 * 以前四页各有各的默认值（7 天、7 天、1 个月、6 个月），离开再回来又重置。现在是一个
 * 模块级 ref：在任何一页选了 6 个月，另外几页也是 6 个月；下次打开应用还记得。
 * 各页是 keep-alive 缓存的，隐藏着的页会跟着在后台换好数据，回到场上不重画。
 *
 * 值永远是「天数」。选了自定义范围时，天数是那段日期的跨度，终点另存在 lib/trendWindow.ts
 * （切序列的函数用它当终点），所以各页仍然只认天数。
 */
const STORAGE_KEY = 'zeppbridge.trend.range';
const DEFAULT_RANGE: SeriesRangeDays = 30;

const read = (): number => {
  if (customRange.value) return spanDays(customRange.value);
  try {
    const saved = Number(window.localStorage.getItem(STORAGE_KEY));
    return (SERIES_RANGE_DAYS as readonly number[]).includes(saved) ? saved : DEFAULT_RANGE;
  } catch {
    return DEFAULT_RANGE;
  }
};

let shared: Ref<number> | null = null;

export const useTrendRange = (): Ref<number> => {
  if (shared) return shared;
  shared = ref<number>(read());
  watch(shared, (value) => {
    // 自定义范围的天数不是预设档，不写进「预设」那一格。
    if (customRange.value) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, String(value));
    } catch {
      // 隐私模式写不进就不记——本次会话里各页仍然同步。
    }
  });
  return shared;
};

/** 选一个预设档（同时清掉自定义范围）。 */
export const selectPresetRange = (days: SeriesRangeDays): void => {
  setCustomRange(null);
  useTrendRange().value = days;
};

/** 用一段起止日期当范围（调用方先用 `validCustomRange` 校验）。 */
export const selectCustomRange = (range: CustomRange): void => {
  setCustomRange(range);
  useTrendRange().value = spanDays(range);
};
