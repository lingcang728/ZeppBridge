/*
 * 新手引导的状态机（全局单例）。章节和步骤是 lib/tour/chapters.ts 的数据，界面是
 * components/tour/TourOverlay.vue（聚光框 + 玻璃说明卡）和 TourWelcome.vue（第一屏语言轮）。
 * 什么时候算看过见 lib/tour/progress.ts：走完才算；跳过只记当前章；就地讲解离开页面只是暂停。
 *
 * 一步 = 收起上一步摊开的东西（牌桌）→ 必要时换页 → 等目标元素出现（最多几秒，等不到就退成居中说明卡，
 * 不卡住）→ 滚到视野里 → **等它停稳**（设置卡的形变、牌的发牌都在动，10-13 录屏里聚光框量在半路，
 * 说明卡跟着跳、点「下一步」点空）→ 量出位置交给聚光框。窗口尺寸变化、滚动时重量；位置没变就不动。
 */
import { computed, getCurrentInstance, onActivated, onMounted, ref, shallowRef } from 'vue';
import router from '../router';
import { TOUR_STEPS, type SectionId, type TourChapterId, type TourStep } from '../lib/tour/chapters';
import { chaptersToMark, presentSteps, type TourEnd } from '../lib/tour/progress';
import {
  enterSandbox, introPending, leaveSandbox, letterPillSeen, markLetterPillSeen, markSeen, sandboxFlags, seenChapters,
} from '../lib/tour/sandbox';
import { updateNotice } from '../services/updateNotice';
import { locale } from '../i18n';
import { useTheme } from './useTheme';
import { lessMotion } from '../lib/motion/lessMotion';

export type TourMode = 'sandbox' | 'inline';

interface ActiveTour {
  chapters: TourChapterId[];
  /** 每章要走的步骤（TOUR_STEPS 里的下标）：沙盒是全部，就地讲解只留眼前出现了的。 */
  keys: number[][];
  chapter: number;
  /** keys[chapter] 里的位置。 */
  step: number;
  mode: TourMode;
  /** 就地讲解是在哪一页出的：换了页就暂停（它说的那样东西已经不在眼前了）。 */
  path: string;
  /** 单步轻量提示用：结束时不把所属章节记进 seenChapters，改走 onDone 自己记。 */
  keepUnseen?: boolean;
  onDone?: (end: TourEnd) => void;
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
/** 就地讲解开讲前目标都在；讲到某一步时它没了，不久等，跳过。 */
const INLINE_WAIT_MS = 1200;
/** 就地讲解开讲前等页面摊开、目标出现，最多这么久；一个都没等到就不讲。 */
const OFFER_WAIT_MS = 3000;
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
/** 换步的方向：圈不到的步骤顺着这个方向跳过。 */
let direction: 1 | -1 = 1;
/** 这一趟真的讲出来了几步：一步都没讲就走到头，不算看过。 */
let shownSteps = 0;

const reducedMotion = () => lessMotion();
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

const keyOf = (tour: ActiveTour): number | undefined => tour.keys[tour.chapter]?.[tour.step];
const stepOf = (tour: ActiveTour): TourStep | undefined => {
  const key = keyOf(tour);
  return key === undefined ? undefined : TOUR_STEPS[tour.chapters[tour.chapter]!]?.[key];
};

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
  const sandbox = tour.mode === 'sandbox';
  if (!step.open) await closeOpened();
  if (run !== token) return;
  // 就地讲解不换页：讲的就是眼前这一页。
  if (sandbox && step.route && router.currentRoute.value.path !== step.route) await router.push(step.route).catch(() => undefined);
  if (run !== token) return;
  if (step.open === 'pickDays') await openPickDays(run);
  let css = step.target;
  const wait = !sandbox ? INLINE_WAIT_MS : step.fallback ? FALLBACK_WAIT_MS : WAIT_MS;
  let found = css ? await findTargets(css, step.all === true, run, wait) : [];
  if (run !== token) return;
  if (!found.length && step.fallback && sandbox) {
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
  } else if (css) {
    // 圈不到（示例数据里没有、页面变了）：不出一张对着空气说话的卡，顺着方向跳过这一步。
    skipMissing();
    return;
  } else {
    box.value = null;
  }
  shownSteps += 1;
  settling.value = false;
}

function skipMissing() {
  const tour = active.value;
  if (!tour) return;
  const atStart = tour.chapter === 0 && tour.step === 0;
  move(direction === -1 && !atStart ? -1 : 1);
}

const finish = (end: TourEnd) => {
  const tour = active.value;
  if (!tour) return;
  if (!tour.keepUnseen) markSeen(chaptersToMark(end, tour.chapters, tour.chapter));
  token += 1;
  targets = [];
  selector = null;
  box.value = null;
  active.value = null;
  settling.value = false;
  listen(false);
  void closeOpened();
  tour.onDone?.(end);
  if (tour.mode === 'sandbox') leaveSandbox(sandboxFlags()?.ret ?? '/');
};

// 就地讲解时离开了这一页：只是暂停，不记看过，下次打开再讲。
router.afterEach((to) => {
  const tour = active.value;
  if (tour?.mode === 'inline' && to.path !== tour.path) finish('pause');
});

const begin = (
  chapters: TourChapterId[],
  keys: number[][],
  mode: TourMode,
  options: { keepUnseen?: boolean; onDone?: (end: TourEnd) => void } = {},
) => {
  if (!chapters.length) return;
  if (!active.value) listen(true);
  direction = 1;
  shownSteps = 0;
  active.value = {
    chapters,
    keys,
    chapter: 0,
    step: 0,
    mode,
    path: router.currentRoute.value.path,
    keepUnseen: options.keepUnseen,
    onDone: options.onDone,
  };
  void show();
};

/** 沙盒里按顺序走这几章的全部步骤。 */
export const startTour = (chapters: TourChapterId[], mode: TourMode): void => {
  const list = chapters.filter((id) => TOUR_STEPS[id]?.length);
  begin(list, list.map((id) => TOUR_STEPS[id].map((_, index) => index)), mode);
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

const isVisible = (css: string) => [...document.querySelectorAll(css)]
  .some((element) => element.getClientRects().length > 0 && !element.closest('[class*="-leave-active"]'));

let offering = 0;
/** 某个板块第一次打开：没看过就就地讲一遍，只讲眼前已经出现的那几步；一步都没有就不讲（空页不讲）。
    沙盒里、别的引导正在跑时不插队；落地页的演示（也是演示模式）不出——整屏的引导层会挡住那边自己编排的演示。
    更新后的作者来信还开着、或马上要载入进总览时也不出（下次打开这一页再讲）。 */
export const offerInline = async (chapter: SectionId): Promise<void> => {
  if (active.value || window.__ZB_DEMO__?.demo || welcomeOpen.value) return;
  if (updateNotice.receipt || introPending() || seenChapters().has(chapter)) return;
  const run = ++offering;
  const path = router.currentRoute.value.path;
  const steps = TOUR_STEPS[chapter];
  const filterSeenPill = (indices: number[]) => (chapter === 'letters' && letterPillSeen()
    ? indices.filter((idx) => steps[idx]?.target !== '[data-tour="letter-pill"]')
    : indices);
  const started = performance.now();
  let keys = filterSeenPill(presentSteps(steps, isVisible));
  while (!keys.length && performance.now() - started < OFFER_WAIT_MS) {
    await sleep(120);
    if (run !== offering || router.currentRoute.value.path !== path) return;
    keys = filterSeenPill(presentSteps(steps, isVisible));
  }
  if (!keys.length || active.value || router.currentRoute.value.path !== path) return;
  begin([chapter], [keys], 'inline');
};

/** 老用户首次见到改版后的右上角信件圆钮时，单步聚光提示一次（「知道了」收起，不影响信匣章节本体）。 */
export const offerLetterPillTip = async (): Promise<boolean> => {
  if (active.value || window.__ZB_DEMO__?.demo || welcomeOpen.value) return false;
  if (updateNotice.receipt || introPending() || letterPillSeen()) return false;
  const started = performance.now();
  while (!isVisible('[data-tour="letter-pill"]') && performance.now() - started < OFFER_WAIT_MS) {
    await sleep(120);
    if (active.value || welcomeOpen.value || updateNotice.receipt || letterPillSeen()) return false;
  }
  if (!isVisible('[data-tour="letter-pill"]') || active.value || welcomeOpen.value || updateNotice.receipt || letterPillSeen()) {
    return false;
  }
  if (document.querySelector('[data-modal-dialog], [role="dialog"][aria-modal="true"]')) return false;
  begin(['letters'], [[0]], 'inline', {
    keepUnseen: true,
    onDone: (end) => {
      if (end === 'done' || end === 'skip') markLetterPillSeen();
    },
  });
  return true;
};

/** 等界面摊开（`delay` 毫秒）再提示；到点时调用它的组件已经卸载 / 被 KeepAlive 收起，或者
    `stillThere()` 说那样东西已经关了，就不出——免得提示浮在别的页面上。 */
export const offerInlineSoon = (chapter: SectionId, delay: number, stillThere: () => boolean = () => true): void => {
  const instance = getCurrentInstance();
  window.setTimeout(() => {
    if (instance && (instance.isUnmounted || instance.isDeactivated)) return;
    if (stillThere()) void offerInline(chapter);
  }, delay);
};

/** 板块页面的根组件里调一次：挂上和（KeepAlive 下）再回到这一页时都问一句，中途离开过的下次接着讲。 */
export const useSectionTour = (chapter: SectionId, stillThere?: () => boolean, delay = 900): void => {
  const offer = () => offerInlineSoon(chapter, delay, stillThere);
  onMounted(offer);
  onActivated(offer);
};

function move(delta: 1 | -1) {
  const tour = active.value;
  if (!tour) return;
  direction = delta;
  let { chapter, step } = tour;
  step += delta;
  if (step >= tour.keys[chapter]!.length) { chapter += 1; step = 0; }
  if (step < 0) {
    if (chapter === 0) return;
    chapter -= 1;
    step = tour.keys[chapter]!.length - 1;
  }
  if (chapter >= tour.chapters.length) { finish(shownSteps ? 'done' : 'abort'); return; }
  active.value = { ...tour, chapter, step };
  void show();
}

export const useTour = () => ({
  active,
  box,
  settling,
  welcomeOpen,
  current: computed(() => {
    const tour = active.value;
    if (!tour) return null;
    const keys = tour.keys[tour.chapter]!;
    const total = tour.keys.reduce((sum, list) => sum + list.length, 0);
    const done = tour.keys.slice(0, tour.chapter).reduce((sum, list) => sum + list.length, 0) + tour.step;
    return {
      chapter: tour.chapters[tour.chapter]!,
      /** 这一步在 TOUR_STEPS 里的下标：文案按它取（s1、s2…），筛掉的步骤不改序号。 */
      step: keys[tour.step]!,
      stepsInChapter: keys.length,
      index: done,
      total,
      first: done === 0,
      last: done === total - 1,
      mode: tour.mode,
      /** 圈住的那一块可以直接上手。 */
      interactive: stepOf(tour)?.interactive === true,
    };
  }),
  next: () => move(1),
  prev: () => move(-1),
  /** 跳过：只把当前这一章记为看过（跳过总览不连带各板块）。 */
  skip: () => finish('skip'),
});
