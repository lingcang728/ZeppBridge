import { ref } from 'vue';

/**
 * 「今天」是会变的。
 *
 * 概览、最近记录、置顶指标都缓存在 KeepAlive 里，应用又常年挂在托盘：以前各处在
 * computed 里直接 `new Date()`，computed 只在别的依赖变化时重算，于是第二天早上
 * 页头还写着昨天的日期、「今天 / 昨天」也错一格。
 *
 * 这里给一个响应式的日期戳：本地午夜和窗口重新可见时更新。`today()` 在 computed
 * 里调用就会订阅它——日期一变，所有按「今天」切的东西一起重算；同一天里不触发。
 */
const stamp = (date = new Date()): string => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

const day = ref(stamp());
let started = false;
let timer = 0;

const sync = () => {
  const next = stamp();
  if (next !== day.value) day.value = next;
};

const scheduleMidnight = () => {
  window.clearTimeout(timer);
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
  timer = window.setTimeout(() => {
    sync();
    scheduleMidnight();
  }, Math.max(1_000, midnight.getTime() - now.getTime()));
};

const start = () => {
  if (started || typeof window === 'undefined') return;
  started = true;
  scheduleMidnight();
  // 睡眠唤醒后 setTimeout 可能晚到很久：窗口回到前台时直接对一次表。
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    sync();
    scheduleMidnight();
  });
};

/** 现在（Date）。在 computed / 模板里调用会随本地日期变化重算。 */
export const today = (): Date => {
  start();
  void day.value;
  return new Date();
};
