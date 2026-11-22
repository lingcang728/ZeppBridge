import { ref, watch, type Ref } from 'vue';

/**
 * 趋势图上要不要叠一条 7 天移动平均（全局记，和 useTrendRange 一样：任何一页切了，四页一起变）。
 * 默认关：先看原始的逐日读数，需要看走向时再打开。
 */
const STORAGE_KEY = 'zeppbridge.trend.smooth7';

const read = (): boolean => {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
};

let shared: Ref<boolean> | null = null;

export const useTrendSmoothing = (): Ref<boolean> => {
  if (shared) return shared;
  shared = ref(read());
  watch(shared, (value) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, value ? '1' : '0');
    } catch {
      // 写不进就不记，本次会话里各页仍然同步。
    }
  });
  return shared;
};
