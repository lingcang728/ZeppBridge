import { ref } from 'vue';
import { onMotionSkip } from '../lib/motion/interrupt';
import { lessMotion } from '../lib/motion/lessMotion';
import { whenFramesSteady } from '../lib/motion/steady';
import { OPEN_EASE } from '../lib/motion/timing';
import {
  coversView, isTile, pickTiles, RIPPLE, RIPPLE_FADE_AT, RIPPLE_SCALE_IN, RIPPLE_SCALE_OUT, rippleDelay, rippleShift,
  type RipplePoint, type RippleRect, type RippleTile,
} from '../lib/motion/tabRipple';

/**
 * 顶栏涟漪切页的 Vue 过渡钩子（几何和拆块在 lib/motion/tabRipple.ts）。AppShell 的切页 <Transition> 在
 * 换入口（概览 / 交给 AI / 设置，或从二级页直接点顶栏）时挂上它。
 *
 * 10-29 修的两处「卡一下」：
 * - 以前换入口走 CSS animation + 「等帧稳了再放」（.page-host.holding 暂停动画），但离场页什么时候撤由 Vue 按
 *   **墙钟**算（animation 时长 + 1ms 的 setTimeout）：滚到页底再切，等帧稳那 200–300ms 里计时器先到，旧页一口
 *   没淡就整块没了、新页还停在透明——整屏空一下，然后新页硬切出来。现在两页的块都是 WAAPI 动画，等的时候一起暂停，
 *   旧页等它自己的动画真放完才交给 Vue 撤走（done）。
 * - 滚下去以后切页，滚动区一归零顶栏下沿的模糊（.shell-head.is-scrolled）就开始退，而旧页还垫在原来的滚动位置上、
 *   正从顶栏下面经过：模糊「啪」地掉了。现在涟漪开跑以前顶栏的模糊不动，等顶栏底下那几块旧的淡完再按新页的位置退。
 *
 * 量块要等滚动区归零以后（lib/returnScroll.ts 在那一帧的 rAF 里恢复位置，先登记先跑）：所以钩子里先只把新页
 * 藏住，下一帧再拆块、建动画。
 */
interface Side {
  el: HTMLElement; done: () => void; enter: boolean; animations: Animation[];
  tiles: Set<Element>; origin?: RipplePoint; view?: RippleRect; playedAt?: number; observer?: MutationObserver; over?: boolean;
}

export function useTabRipple(o: { viewport: () => HTMLElement | null; origin: () => RipplePoint | null }) {
  /** 顶栏下沿的模糊先别动（AppShell 的滚动监听看它）。 */
  const holdEdge = ref(false);
  let batch: Side[] = [];
  let frame = 0;
  let edgeTimer = 0;

  const viewRect = (): RippleRect => {
    const box = o.viewport()?.getBoundingClientRect();
    return box ? { left: box.left, top: box.top, width: box.width, height: box.height } : { left: 0, top: 0, width: innerWidth, height: innerHeight };
  };

  const releaseEdge = (ms: number) => {
    window.clearTimeout(edgeTimer);
    edgeTimer = window.setTimeout(() => { holdEdge.value = false; }, ms);
  };

  /** 一块的动画，记在这一侧身上（同一页可能先进场、半路又离场：两份各管各的）。`late`：涟漪已经放了这么久才出现的块。 */
  const animateTile = (side: Side, tile: RippleTile, late = 0) => {
    const { origin, view } = side;
    if (!origin || !view) return;
    side.tiles.add(tile);
    const rect = tile.getBoundingClientRect();
    const delay = rippleDelay(rect, origin, view);
    const shift = rippleShift(rect, origin);
    const opacity = Number(getComputedStyle(tile).opacity);
    const made: Animation[] = [];
    if (coversView(rect, view)) {
      const whole = RIPPLE.spread + (side.enter ? RIPPLE.lag + RIPPLE.in : RIPPLE.out);
      made.push(tile.animate(side.enter ? [{ opacity: 0.001 }, { opacity }] : [{ opacity }, { opacity: 0 }], { duration: whole, easing: 'ease-in-out', fill: 'both' }));
    } else if (side.enter) {
      const timing = { duration: RIPPLE.in, delay: Math.max(0, delay + RIPPLE.lag - late), fill: 'both' as const };
      made.push(
        tile.animate([{ opacity: 0.001 }, { opacity }], { ...timing, easing: 'ease-out' }),
        tile.animate([
          { translate: `${-shift.x}px ${-shift.y}px`, scale: `${RIPPLE_SCALE_IN}` },
          { translate: '0px 0px', scale: '1' },
        ], { ...timing, easing: OPEN_EASE }),
      );
    } else {
      const timing = { duration: RIPPLE.out, delay, fill: 'both' as const };
      made.push(
        tile.animate([{ opacity }, { opacity: 0, offset: RIPPLE_FADE_AT }, { opacity: 0 }], { ...timing, easing: 'ease-in' }),
        tile.animate([
          { translate: '0px 0px', scale: '1' },
          { translate: `${shift.x}px ${shift.y}px`, scale: `${RIPPLE_SCALE_OUT}` },
        ], { ...timing, easing: 'cubic-bezier(.4, 0, .7, .4)' }),
      );
    }
    if (side.playedAt === undefined) for (const animation of made) animation.pause();
    side.animations.push(...made);
  };

  /* 新页第一次进来时，内容多半是数据到了才挂上去的（骨架换成卡片）——比量块那一帧晚。晚到的块也跟着涟漪：
     波前已经扫过它的位置就从现在起浮上来，还没扫到就照常等。已经在某一块里面的不算（它跟着那一块走）。 */
  const watchLate = (side: Side) => {
    const inTile = (node: Node) => {
      for (let at: Node | null = node; at && at !== side.el; at = at.parentNode) if (side.tiles.has(at as Element)) return true;
      return false;
    };
    side.observer = new MutationObserver((records) => {
      if (side.over || !side.view) return;
      const late = side.playedAt === undefined ? 0 : performance.now() - side.playedAt;
      for (const record of records) {
        for (const node of Array.from(record.addedNodes)) {
          if (!isTile(node) || !node.isConnected || inTile(node)) continue;
          for (const tile of pickTiles(node, side.view, 24, true)) animateTile(side, tile, late);
        }
      }
    });
    side.observer.observe(side.el, { childList: true, subtree: true });
  };

  const finish = (side: Side) => {
    if (side.over) return;
    side.over = true;
    side.observer?.disconnect();
    // 新页落定：撤掉自己的动画（fill: both 留着会压住块以后的悬停、入场）；旧页交给 Vue 撤走以后它们跟着节点一起没了。
    if (side.enter) for (const animation of side.animations) animation.cancel();
    side.done();
  };

  /** 这一侧的动画（包括放的途中晚到的块）全放完。 */
  const whenSideDone = async (side: Side) => {
    for (let seen = -1; seen !== side.animations.length;) {
      seen = side.animations.length;
      await Promise.all(side.animations.map((animation) => animation.finished.catch(() => undefined)));
    }
    finish(side);
  };

  const start = () => {
    frame = 0;
    const sides = batch;
    batch = [];
    const origin = o.origin();
    const view = viewRect();
    for (const side of sides) {
      if (side.enter) side.el.style.opacity = '';
      if (!origin || !side.el.isConnected) continue;
      side.origin = origin;
      side.view = view;
      for (const tile of pickTiles(side.el, view)) animateTile(side, tile);
      if (side.enter) watchLate(side);
    }
    // 新页第一次上屏要整屏光栅化（滚到页底再切更是），先停在第一帧（旧页还在、新页的块都还透明，看不出在等），
    // 帧节奏恢复再一起放；按 Esc / 又切页（settleMotion）就不等了。最多等 320ms，和以前的切页一样。
    let go: () => void = () => {};
    const skipped = new Promise<void>((resolve) => { go = resolve; });
    const forget = onMotionSkip(() => go());
    void Promise.race([whenFramesSteady(320), skipped]).then(() => {
      forget();
      const now = performance.now();
      for (const side of sides) {
        side.playedAt = now;
        if (!side.animations.length && !side.observer) { finish(side); continue; }
        for (const animation of side.animations) if (animation.playState === 'paused') animation.play();
        // 新页即使一块都还没有（数据还没到），也等满一圈涟漪：这段时间里到的块照样浮上来。空关键帧只计时，不碰样式
        // （页面根上哪怕是 1→1 的透明度动画也会让页里的毛玻璃失去取样）。
        if (side.enter) side.animations.push(side.el.animate([], { duration: RIPPLE.spread + RIPPLE.lag }));
        void whenSideDone(side);
      }
      // 顶栏底下那一圈旧块最先被扫到，它们淡完（out 的前五成多）顶栏的模糊就按新页的位置退。
      releaseEdge(RIPPLE.out * RIPPLE_FADE_AT);
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
    // 量块要等下一帧：这一帧先整页藏住，不让新页原样闪一下。第一次进这页的卡片自己的入场浮起（material.css 的
    // card-enter）不用停：涟漪是脚本动画，同一属性上压过它，等涟漪放完它早就落定了。
    el.style.opacity = '0';
    queue({ el, done, enter: true, animations: [], tiles: new Set() });
  };

  const onLeave = (el: Element, done: () => void) => {
    if (!(el instanceof HTMLElement) || lessMotion()) { done(); return; }
    queue({ el, done, enter: false, animations: [], tiles: new Set() });
  };

  const dispose = () => {
    if (frame) cancelAnimationFrame(frame);
    window.clearTimeout(edgeTimer);
  };

  return { holdEdge, arm, onEnter, onLeave, dispose };
}
