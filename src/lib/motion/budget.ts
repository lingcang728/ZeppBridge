import { computed, ref } from 'vue';

/**
 * 「形变进行中」的全局信号：卡 ↔ 页的形变放着的时候，主线程要空出来给它。
 *
 * 以前点开一张卡，新页在同一个任务里挂载十几张 ECharts、跑完布局，形变的第一帧要等这些做完才上屏——
 * 那时进度已经到了八九成，用户看到的就是「卡 → 一下变黑 → 新页」。现在图表这类重活在 `motionBusy` 期间只放一个壳
 * （lib/echartsSetup.ts 的 VChart 外壳），数据请求照常马上发（它们本来就是异步的）。
 *
 * 展开分两段占（2026-11-12 第二轮）：
 * 1. usePageMorph 在决定要形变时（router.beforeEach，新页挂载之前）`holdMotion()`——新页挂得轻，一两帧就上屏，
 *    背后的模糊马上开始糊；
 * 2. 新页一上屏就放开（composables/pageMorph/expand.ts）：图表一帧一张地挂（nextSlot），窗口停在卡上等它们挂完
 *    （whenSlotsDrained，有上限）再起飞；起飞时再 `holdMotion()` 一次，落地 / 撤回后释放。
 * 上午那一版从 1 一直占到落地：图表落地以后才挂，每次点开都是「空卡 → 图表淡入」重画一遍，用户当天否了。
 * 万一漏了释放，`maxMs` 以后自己放开，不会让图表永远不挂。
 */
const holds = ref(0);
let waiters: Array<() => void> = [];

export const motionBusy = computed(() => holds.value > 0);

/**
 * 同时挂到 `<html data-motion>` 上，给 CSS 用（shell.css）：形变途中页面里的悬停过渡不放。
 * 窗口缩放时内容在静止的指针底下滑过，一行接一行地触发悬停的底色过渡——每帧重画、整页重新分层，
 * 4K 下收回掉到三十帧（2026-11-12 第四轮实测：睡眠列表收回每帧分层 14ms，关掉过渡减半）。
 */
const mark = () => {
  if (typeof document === 'undefined') return;
  if (holds.value > 0) document.documentElement.dataset.motion = 'busy';
  else delete document.documentElement.dataset.motion;
};

const flush = () => {
  if (holds.value > 0) return;
  const ready = waiters;
  waiters = [];
  for (const resolve of ready) resolve();
};

/** 登记一段形变；返回的释放函数可以重复调用，只生效一次。 */
export const holdMotion = (maxMs = 1200): (() => void) => {
  holds.value += 1;
  mark();
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    clearTimeout(timer);
    holds.value = Math.max(0, holds.value - 1);
    mark();
    flush();
  };
  const timer = setTimeout(release, maxMs);
  return release;
};

/** 没有形变在放时立刻 resolve，否则等最后一段放完。 */
export const whenMotionIdle = (): Promise<void> =>
  holds.value > 0 ? new Promise((resolve) => { waiters.push(resolve); }) : Promise.resolve();

/**
 * 「形变摆好了、还没起飞」：展开先停在起点等新页第一帧画好（composables/pageMorph/expand.ts），这段时间图表照常挂
 * （所以不算 holdMotion），但 afterMotion 排着的重读不能趁这个空当先跑——结果会落在形变途中，把刚画好的图表再重画一遍。
 * 起飞时先 holdMotion 再调这里返回的释放函数；漏了释放，`maxMs` 以后自己放开。
 */
let staging = 0;
let stagingWaiters: Array<() => void> = [];
export const stageMotion = (maxMs = 600): (() => void) => {
  staging += 1;
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    clearTimeout(timer);
    staging = Math.max(0, staging - 1);
    if (staging > 0) return;
    const ready = stagingWaiters;
    stagingWaiters = [];
    for (const resolve of ready) resolve();
  };
  const timer = setTimeout(release, maxMs);
  return release;
};
const whenStaged = (): Promise<void> =>
  staging > 0 ? new Promise((resolve) => { stagingWaiters.push(resolve); }) : Promise.resolve();

/**
 * 等「这一次切页的形变」放完：新页挂载时形变可能还没登记上（展开在 Vue 的进场钩子里才建），
 * 所以先让过三帧，再等它起飞（stageMotion）、放完。页面用先前读好的数据画了第一帧以后，重读放在这之后——晚到的结果
 * 不在形变途中改页面。
 */
export const afterMotion = (run: () => void): void => {
  const frames = (left: number) => {
    if (left <= 0) {
      void whenStaged().then(whenMotionIdle).then(run);
      return;
    }
    requestAnimationFrame(() => frames(left - 1));
  };
  frames(3);
};

/**
 * 一帧一件的重活（图表挂载）：形变让路时攒下的图表从这里挨个挂，主线程每帧都还有空。
 * 放在这里而不是 lib/echartsSetup.ts：展开要等这一队排空才起飞（whenSlotsDrained），而图表引擎不该被形变的代码拖进首屏包。
 */
const slots: Array<() => void> = [];
let slotFrame = 0;
let slotWaiters: Array<() => void> = [];
const pumpSlots = () => {
  slotFrame = 0;
  slots.shift()?.();
  if (slots.length) {
    slotFrame = requestAnimationFrame(pumpSlots);
    return;
  }
  const ready = slotWaiters;
  slotWaiters = [];
  for (const resolve of ready) resolve();
};
export const nextSlot = (job: () => void): void => {
  slots.push(job);
  if (!slotFrame) slotFrame = requestAnimationFrame(pumpSlots);
};
/** 等排着的重活做完（先让过一帧：刚放开的那批这时才排进来），最多等 `maxMs`——图表特别多的页不让窗口一直停着。 */
export const whenSlotsDrained = (maxMs = 260): Promise<void> =>
  new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(finish, maxMs);
    requestAnimationFrame(() => {
      if (slots.length) slotWaiters.push(finish);
      else finish();
    });
  });

/** 测试用：清空状态。 */
export const resetMotionBudget = () => {
  holds.value = 0;
  slots.length = 0;
  staging = 0;
  const ready = stagingWaiters;
  stagingWaiters = [];
  for (const resolve of ready) resolve();
  flush();
};
