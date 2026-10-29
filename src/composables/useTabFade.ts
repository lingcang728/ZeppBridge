import { ref } from 'vue';
import { onMotionSkip } from '../lib/motion/interrupt';
import { lessMotion } from '../lib/motion/lessMotion';
import { whenFramesSteady } from '../lib/motion/steady';
import { fadeLayers, TAB_FADE, type FadeRect } from '../lib/motion/tabFade';

/**
 * 换入口淡入淡出的 Vue 过渡钩子（取层在 lib/motion/tabFade.ts，那里写了涟漪为什么推倒）。
 * AppShell 的切页 <Transition> 在换入口（概览 / 交给 AI / 设置，或从二级页直接点顶栏）时挂上它。
 *
 * 一次切页：旧页的几层一起淡出（out）；淡完，新页的几层一起淡入（in）。页面一概不位移、不缩放。
 *
 * 仍然保留的两处（涟漪那版修过的「卡一下」）：
 * - 离场页什么时候撤，等它自己的动画真放完再交给 Vue（done），不用 Vue 的墙钟——「等帧稳」暂停的时候计时器会先到；
 * - 滚下去以后切页，滚动区一归零顶栏下沿的模糊就要退，而旧页还垫在原来的滚动位置上：等旧页淡完再按新页的位置退。
 *
 * 动画都是 fill: both，放完一律 cancel：概览这些页在 KeepAlive 里缓存着，留下的「透明」下次回来还压着整页
 * （涟漪那版回到概览整屏空就是它）。
 */
interface Side {
  el: HTMLElement; done: () => void; enter: boolean; animations: Animation[]; layers: Set<Element>;
  clock?: Animation; observer?: MutationObserver; over?: boolean;
}

/** 每一页身上还挂着的切页动画：同一页刚进场、半路又离场时，先从它此刻的样子接着淡，再撤掉旧的。 */
const onPage = new WeakMap<Element, Side>();

export function useTabFade(o: { viewport: () => HTMLElement | null }) {
  /** 顶栏下沿的模糊先别动（AppShell 的滚动监听看它）。 */
  const holdEdge = ref(false);
  let batch: Side[] = [];
  let frame = 0;
  let edgeTimer = 0;

  const viewRect = (): FadeRect => {
    const box = o.viewport()?.getBoundingClientRect();
    return box ? { left: box.left, top: box.top, width: box.width, height: box.height } : { left: 0, top: 0, width: innerWidth, height: innerHeight };
  };

  const releaseEdge = (ms: number) => {
    window.clearTimeout(edgeTimer);
    edgeTimer = window.setTimeout(() => { holdEdge.value = false; }, ms);
  };

  /** 一层的淡入 / 淡出。都跟着这一侧的时钟走（晚挂上来的层也对得上同一时刻）。 */
  const fadeLayer = (side: Side, layer: HTMLElement, from?: number) => {
    side.layers.add(layer);
    const opacity = Number(getComputedStyle(layer).opacity);
    const animation = side.enter
      ? layer.animate([{ opacity: 0 }, { opacity }], { duration: TAB_FADE.in, delay: TAB_FADE.out, easing: 'ease-out', fill: 'both' })
      : layer.animate([{ opacity: from ?? opacity }, { opacity: 0 }], { duration: TAB_FADE.out, easing: 'ease-in', fill: 'both' });
    animation.pause();
    if (side.clock) {
      animation.currentTime = side.clock.currentTime;
      if (side.clock.playState === 'running') animation.play();
    }
    side.animations.push(animation);
  };

  /* 新页第一次进来时，有的层是数据到了才挂上去的——比开跑那一帧晚。晚到的直属层照样按同一个时钟淡入，
     不会一下子整块冒出来。 */
  const watchLate = (side: Side, view: FadeRect) => {
    side.observer = new MutationObserver(() => {
      if (side.over) return;
      for (const layer of fadeLayers(side.el, view)) if (!side.layers.has(layer)) fadeLayer(side, layer);
    });
    side.observer.observe(side.el, { childList: true });
  };

  const finish = (side: Side) => {
    if (side.over) return;
    side.over = true;
    side.observer?.disconnect();
    if (onPage.get(side.el) === side) onPage.delete(side.el);
    // 先交给 Vue（离场页这一步就从文档里撤走 / 收进 KeepAlive），再撤动画：撤掉以后页面回到本来的样子，
    // 进场页本来就是淡完的样子，离场页已经不在屏上，都不会闪。
    side.done();
    for (const animation of side.animations) animation.cancel();
    side.clock?.cancel();
  };

  const whenSideDone = async (side: Side) => {
    for (let seen = -1; seen !== side.animations.length;) {
      seen = side.animations.length;
      await Promise.all([side.clock, ...side.animations].map((animation) => animation?.finished.catch(() => undefined)));
    }
    finish(side);
  };

  const start = () => {
    frame = 0;
    const sides = batch;
    batch = [];
    const view = viewRect();
    for (const side of sides) {
      if (!side.el.isConnected) { finish(side); continue; }
      // 同一页刚进场、半路又被换走：从它此刻的透明度接着淡出，再撤掉进场那一份。
      const before = onPage.get(side.el);
      const now = before ? new Map(fadeLayers(side.el, view).map((layer) => [layer, Number(getComputedStyle(layer).opacity)])) : null;
      if (before && before !== side) { before.over = true; before.observer?.disconnect(); for (const animation of before.animations) animation.cancel(); before.clock?.cancel(); }
      onPage.set(side.el, side);
      // 计时用的空动画：空关键帧不碰样式（页面根上哪怕是 1→1 的透明度动画也会让页里的毛玻璃失去取样）。
      side.clock = side.el.animate([], { duration: side.enter ? TAB_FADE.out + TAB_FADE.in : TAB_FADE.out });
      side.clock.pause();
      for (const layer of fadeLayers(side.el, view)) fadeLayer(side, layer, now?.get(layer));
      if (side.enter) {
        side.el.style.opacity = '';
        watchLate(side, view);
      }
    }
    // 新页第一次上屏要整屏光栅化（滚到页底再切更是），先停在第一帧（旧页还在、新页透明，看不出在等），
    // 帧节奏恢复再一起放；按 Esc / 又切页（settleMotion）就不等了。最多等 320ms。
    let go: () => void = () => {};
    const skipped = new Promise<void>((resolve) => { go = resolve; });
    const forget = onMotionSkip(() => go());
    void Promise.race([whenFramesSteady(320), skipped]).then(() => {
      forget();
      for (const side of sides) {
        if (side.over) continue;
        side.clock?.play();
        for (const animation of side.animations) if (animation.playState === 'paused') animation.play();
        void whenSideDone(side);
      }
      releaseEdge(TAB_FADE.out);
    });
  };

  const queue = (side: Side) => {
    batch.push(side);
    if (!frame) frame = requestAnimationFrame(start);
  };

  /** 导航开始时（router.beforeEach）：顶栏的模糊先按住。 */
  const arm = () => {
    window.clearTimeout(edgeTimer);
    holdEdge.value = !lessMotion();
  };

  const onEnter = (el: Element, done: () => void) => {
    if (!(el instanceof HTMLElement) || lessMotion()) { holdEdge.value = false; done(); return; }
    // 取层要等下一帧（滚动区那一帧才归零）：这一帧先整页藏住，不让新页原样闪一下。整页透明时什么都看不见，
    // 毛玻璃取不取样无所谓；下一帧换成逐层淡入就撤掉。
    el.style.opacity = '0';
    queue({ el, done, enter: true, animations: [], layers: new Set() });
  };

  const onLeave = (el: Element, done: () => void) => {
    if (!(el instanceof HTMLElement) || lessMotion()) { done(); return; }
    queue({ el, done, enter: false, animations: [], layers: new Set() });
  };

  const dispose = () => {
    if (frame) cancelAnimationFrame(frame);
    window.clearTimeout(edgeTimer);
  };

  return { holdEdge, arm, onEnter, onLeave, dispose };
}
