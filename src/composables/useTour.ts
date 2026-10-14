/*
 * 新手引导的状态机（全局单例）。章节和步骤是 lib/tour/chapters.ts 的数据，界面是
 * components/tour/TourOverlay.vue（聚光框 + 玻璃说明卡）和 TourWelcome.vue（第一屏语言轮）。
 *
 * 一步 = 收起上一步摊开的东西（牌桌）→ 必要时换页 → 等目标元素出现（最多几秒，等不到就退成居中说明卡，
 * 不卡住）→ 滚到视野里 → **等它停稳**（设置卡的形变、牌的发牌都在动，10-13 录屏里聚光框量在半路，
 * 说明卡跟着跳、点「下一步」点空）→ 量出位置交给聚光框。窗口尺寸变化、滚动时重量；位置没变就不动。
 */
import { computed, getCurrentInstance, ref, shallowRef } from 'vue';
import router from '../router';
import { FULL_TOUR, INLINE_CHAPTERS, TOUR_STEPS, type TourChapterId, type TourStep } from '../lib/tour/chapters';
import { enterSandbox, leaveSandbox, markSeen, sandboxFlags, seenChapters } from '../lib/tour/sandbox';
import { locale } from '../i18n';
import { useTheme } from './useTheme';

export type TourMode = 'sandbox' | 'inline';

interface ActiveTour {
  chapters: TourChapterId[];
  chapter: number;
  step: number;
  mode: TourMode;
  /** 就地提示是在哪一页出的：换了页就收起（它说的那样东西已经不在眼前了）。 */
  path: string;
}

export interface TargetBox { x: number; y: number; width: number; height: number }

const active = shallowRef<ActiveTour | null>(null);
/** 当前这一步圈住的地方；null = 没有目标（居中说明卡）。换步途中保留上一步的，新的量好再挪过去。 */
const box = shallowRef<TargetBox | null>(null);
/** 正在换页 / 找目标 / 等目标停稳：说明卡先藏起来。 */
const settling = ref(false);
/** 沙盒的第一屏（语言轮）还开着。 */
const welcomeOpen = ref(false);

const WAIT_MS = 4000;
/** 有 `fallback` 的步骤先在本页找这么久，找不到再去后备那一页。 */
const FALLBACK_WAIT_MS = 900;
/** 等目标停稳：连续这么多帧外接框不动（< 0.5px）才算，最多等 STEADY_MAX_MS。 */
const STEADY_FRAMES = 6;
const STEADY_MAX_MS = 1600;
const PAD = 8;
let token = 0;
/** 当前这一步圈住的元素（`all` 的步骤是一组）。 */
let targets: Element[] = [];
/** 圈住它们用的选择器：元素被重渲染换掉时就地再找一次。 */
let selector: { css: string; all: boolean } | null = null;
let refinding = false;
let measureFrame = 0;

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

const findTargets = (css: string, all: boolean, run: number, wait = WAIT_MS): Promise<Element[]> => new Promise((resolve) => {
  const started = performance.now();
  const tick = () => {
    if (run !== token) return resolve([]);
    // 换页时旧页面在离场动画里还挂着（KeepAlive + Transition），上面也可能有同名元素：跳过它们。
    const visible = [...document.querySelectorAll(css)]
      .filter((element) => element.getClientRects().length > 0 && !element.closest('[class*="-leave-active"]'));
    const found = all ? visible : visible.slice(0, 1);
    if (found.length || performance.now() - started > wait) return resolve(found);
    window.setTimeout(tick, 80);
  };
  tick();
});

const boxOf = (elements: Element[]): TargetBox | null => {
  const rects = elements.map((element) => element.getBoundingClientRect()).filter((r) => r.width || r.height);
  if (!rects.length) return null;
  const rect = {
    left: Math.min(...rects.map((r) => r.left)), top: Math.min(...rects.map((r) => r.top)),
    right: Math.max(...rects.map((r) => r.right)), bottom: Math.max(...rects.map((r) => r.bottom)),
  };
  // 比视口还大的（整张大卡）收到视口里，聚光框不画到屏幕外面去。
  const x = Math.max(rect.left - PAD, 4);
  const y = Math.max(rect.top - PAD, 4);
  const right = Math.min(rect.right + PAD, window.innerWidth - 4);
  const bottom = Math.min(rect.bottom + PAD, window.innerHeight - 4);
  return { x, y, width: Math.max(right - x, 0), height: Math.max(bottom - y, 0) };
};
const sameBox = (a: TargetBox | null, b: TargetBox | null) => !!a && !!b
  && Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5 && Math.abs(a.width - b.width) < 0.5 && Math.abs(a.height - b.height) < 0.5;

/** 等目标停稳：形变、发牌、弹簧都放完（外接框连续几帧不动），或者到点。 */
const waitSteady = (elements: Element[], run: number): Promise<void> => new Promise((resolve) => {
  const started = performance.now();
  let last: TargetBox | null = null;
  let still = 0;
  const tick = () => {
    if (run !== token) return resolve();
    const now = boxOf(elements.filter((element) => element.isConnected));
    still = sameBox(now, last) ? still + 1 : 0;
    last = now;
    if (still >= STEADY_FRAMES || performance.now() - started > STEADY_MAX_MS) return resolve();
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});

const measure = () => {
  measureFrame = 0;
  const live = targets.filter((element) => element.isConnected);
  if (!live.length) {
    // 圈住的东西被换掉了（页面重渲染）：就地按同一个选择器再找一次（不换页、不重放这一步）；
    // 真找不到才重走这一步，那时也不会反复来。
    if (refinding || !active.value || settling.value || !selector) return;
    refinding = true;
    const run = token;
    const { css, all } = selector;
    void findTargets(css, all, run, 600).then((found) => {
      refinding = false;
      if (run !== token) return;
      if (found.length) { targets = found; scheduleMeasure(); return; }
      targets = [];
      void show();
    });
    return;
  }
  const next = boxOf(live);
  // 没变就不碰：每次赋新对象都会让聚光框和说明卡重新排一次。
  if (next && !sameBox(next, box.value)) box.value = next;
};
function scheduleMeasure() {
  if (!measureFrame && (targets.length || selector)) measureFrame = requestAnimationFrame(measure);
}

const listen = (on: boolean) => {
  const method = on ? 'addEventListener' : 'removeEventListener';
  window[method]('resize', scheduleMeasure);
  document[method]('scroll', scheduleMeasure, { capture: true, passive: true } as AddEventListenerOptions);
};

const stepOf = (tour: ActiveTour): TourStep | undefined => TOUR_STEPS[tour.chapters[tour.chapter]]?.[tour.step];

/** 这一步摊开过的牌桌：离开这一步时收回去（点它自己的 ×，走它原本的收牌动画）。 */
let openedTable = false;
const closeOpened = async () => {
  if (!openedTable) return;
  openedTable = false;
  const close = document.querySelector<HTMLElement>('.card-table [data-table-close]');
  if (!close) return;
  close.click();
  await sleep(reducedMotion() ? 120 : 620);
};
const openPickDays = async (run: number) => {
  if (document.querySelector('.card-table')) { openedTable = true; return; }
  const [button] = await findTargets('.pick-days', false, run);
  if (run !== token || !(button instanceof HTMLElement)) return;
  button.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' });
  button.click();
  openedTable = true;
};

async function show() {
  const tour = active.value;
  const step = tour && stepOf(tour);
  if (!tour || !step) return;
  const run = ++token;
  // 上一步的聚光框先留着：新的量好以后从旧的样子平滑挪过去（不再先清空、说明卡跳到正中再跳回来）。
  settling.value = true;
  targets = [];
  selector = null;
  if (!step.open) await closeOpened();
  if (run !== token) return;
  if (step.route && router.currentRoute.value.path !== step.route) await router.push(step.route).catch(() => undefined);
  if (run !== token) return;
  if (step.open === 'pickDays') await openPickDays(run);
  let css = step.target;
  let found = css ? await findTargets(css, step.all === true, run, step.fallback ? FALLBACK_WAIT_MS : WAIT_MS) : [];
  if (run !== token) return;
  if (!found.length && step.fallback) {
    if (router.currentRoute.value.path !== step.fallback.route) await router.push(step.fallback.route).catch(() => undefined);
    css = step.fallback.target;
    found = await findTargets(css, false, run);
    if (run !== token) return;
  }
  if (found.length && css) {
    found[0]!.scrollIntoView({ block: 'center', inline: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' });
    // 平滑滚动大约 300ms，换页、形变、发牌也还在放：等它们停稳再量，聚光框一次落到位，不追着跑。
    await sleep(reducedMotion() ? 0 : 200);
    if (run !== token) return;
    await waitSteady(found, run);
    if (run !== token) return;
    // 牌是一张张落下的：停稳后再按选择器取一遍，圈住全部。
    if (step.all) {
      const again = await findTargets(css, true, run, 0);
      if (run !== token) return;
      if (again.length) found = again;
    }
    targets = found;
    selector = { css, all: step.all === true };
    measure();
  } else {
    box.value = null;
  }
  settling.value = false;
}

const finish = (completed: boolean) => {
  const tour = active.value;
  if (!tour) return;
  // 跳过整套引导：就地的首次提示也一并算看过（不想被打扰）；跳过单章、某个就地提示只算它自己。
  const wholeTour = FULL_TOUR.every((id) => tour.chapters.includes(id));
  const ids: string[] = !completed && wholeTour ? [...tour.chapters, ...INLINE_CHAPTERS] : [...tour.chapters];
  // 看完训练计划那一章，第一次进计划页就不必再圈一遍。
  if (tour.chapters.includes('plan')) ids.push('planFirst');
  markSeen(ids);
  token += 1;
  targets = [];
  selector = null;
  box.value = null;
  active.value = null;
  settling.value = false;
  listen(false);
  void closeOpened();
  if (tour.mode === 'sandbox') leaveSandbox(sandboxFlags()?.ret ?? '/');
};

router.afterEach((to) => {
  const tour = active.value;
  if (tour?.mode === 'inline' && to.path !== tour.path) finish(false);
});

export const startTour = (chapters: TourChapterId[], mode: TourMode): void => {
  const list = chapters.filter((id) => TOUR_STEPS[id]?.length);
  if (!list.length) return;
  if (!active.value) listen(true);
  active.value = { chapters: list, chapter: 0, step: 0, mode, path: router.currentRoute.value.path };
  void show();
};

/** 进示例沙盒看这几章（整页重新载入，见 lib/tour/sandbox.ts）。`ret`：看完回哪一页。 */
export const launchSandbox = (chapters: TourChapterId[], options: { welcome?: boolean; ret?: string } = {}): void => {
  const first = chapters.map((id) => TOUR_STEPS[id]?.[0]?.route).find(Boolean);
  enterSandbox({
    chapters,
    welcome: options.welcome,
    ret: options.ret ?? router.currentRoute.value.fullPath,
    route: first ?? '/',
    theme: useTheme().themeMode.value,
    locale: locale.value,
  });
};

/** 第一次碰到某个功能：没看过就就地圈一下。沙盒里、别的引导正在跑时不插队；落地页的演示
    （也是演示模式）不出——整屏的引导层会挡住那边自己编排的演示。 */
export const offerInline = (chapter: TourChapterId): void => {
  if (active.value || window.__ZB_DEMO__?.demo || welcomeOpen.value) return;
  if (seenChapters().has(chapter)) return;
  startTour([chapter], 'inline');
};

/** 等界面摊开（`delay` 毫秒）再提示；到点时调用它的组件已经卸载 / 被 KeepAlive 收起，或者
    `stillThere()` 说那样东西已经关了，就不出——免得提示浮在别的页面上。 */
export const offerInlineSoon = (chapter: TourChapterId, delay: number, stillThere: () => boolean = () => true): void => {
  const instance = getCurrentInstance();
  window.setTimeout(() => {
    if (instance && (instance.isUnmounted || instance.isDeactivated)) return;
    if (stillThere()) offerInline(chapter);
  }, delay);
};

const move = (delta: 1 | -1) => {
  const tour = active.value;
  if (!tour) return;
  let { chapter, step } = tour;
  step += delta;
  if (step >= TOUR_STEPS[tour.chapters[chapter]].length) { chapter += 1; step = 0; }
  if (step < 0) {
    if (chapter === 0) return;
    chapter -= 1;
    step = TOUR_STEPS[tour.chapters[chapter]].length - 1;
  }
  if (chapter >= tour.chapters.length) { finish(true); return; }
  active.value = { ...tour, chapter, step };
  void show();
};

export const useTour = () => ({
  active,
  box,
  settling,
  welcomeOpen,
  current: computed(() => {
    const tour = active.value;
    if (!tour) return null;
    const steps = TOUR_STEPS[tour.chapters[tour.chapter]];
    const total = tour.chapters.reduce((sum, id) => sum + TOUR_STEPS[id].length, 0);
    const done = tour.chapters.slice(0, tour.chapter).reduce((sum, id) => sum + TOUR_STEPS[id].length, 0) + tour.step;
    return {
      chapter: tour.chapters[tour.chapter],
      step: tour.step,
      stepsInChapter: steps.length,
      index: done,
      total,
      first: done === 0,
      last: done === total - 1,
      mode: tour.mode,
      /** 圈住的那一块可以直接上手。 */
      interactive: steps[tour.step]?.interactive === true,
    };
  }),
  next: () => move(1),
  prev: () => move(-1),
  /** 跳过：这几章连同就地的首次提示都算看过，别再打扰。 */
  skip: () => finish(false),
});
