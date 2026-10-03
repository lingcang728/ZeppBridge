import { computed, ref } from 'vue';

/**
 * 「形变进行中」的全局信号：卡 ↔ 页的形变放着的时候，主线程要空出来给它。
 *
 * 以前点开一张卡，新页在同一个任务里挂载十几张 ECharts、跑完布局，形变的第一帧要等这些做完才上屏——
 * 那时进度已经到了八九成，用户看到的就是「卡 → 一下变黑 → 新页」。现在图表这类重活等形变放完再做
 * （lib/echartsSetup.ts 的 VChart 外壳），数据请求照常马上发（它们本来就是异步的）。
 *
 * usePageMorph 在决定要形变时 `holdMotion()`，落地 / 撤回后调它返回的释放函数；
 * 万一漏了释放，`maxMs` 以后自己放开，不会让图表永远不挂。
 */
const holds = ref(0);
let waiters: Array<() => void> = [];

export const motionBusy = computed(() => holds.value > 0);

const flush = () => {
  if (holds.value > 0) return;
  const ready = waiters;
  waiters = [];
  for (const resolve of ready) resolve();
};

/** 登记一段形变；返回的释放函数可以重复调用，只生效一次。 */
export const holdMotion = (maxMs = 1200): (() => void) => {
  holds.value += 1;
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    clearTimeout(timer);
    holds.value = Math.max(0, holds.value - 1);
    flush();
  };
  const timer = setTimeout(release, maxMs);
  return release;
};

/** 没有形变在放时立刻 resolve，否则等最后一段放完。 */
export const whenMotionIdle = (): Promise<void> =>
  holds.value > 0 ? new Promise((resolve) => { waiters.push(resolve); }) : Promise.resolve();

/**
 * 等「这一次切页的形变」放完：新页挂载时形变还没开跑（它要先等新页第一帧画好，见 usePageMorph），
 * 所以先让过三帧，再等它放完。页面用先前读好的数据画了第一帧以后，重读放在这之后——晚到的结果
 * 不在形变途中改页面。
 */
export const afterMotion = (run: () => void): void => {
  const frames = (left: number) => {
    if (left <= 0) {
      void whenMotionIdle().then(run);
      return;
    }
    requestAnimationFrame(() => frames(left - 1));
  };
  frames(3);
};

/** 测试用：清空状态。 */
export const resetMotionBudget = () => {
  holds.value = 0;
  flush();
};
