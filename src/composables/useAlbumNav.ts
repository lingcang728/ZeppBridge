import { nextTick, onActivated, onBeforeUnmount, onDeactivated, onMounted, type Ref } from 'vue';
import { stretchAtEdge, wheelFactor, zoomIndex, zoomStep, ZOOMS, type AlbumZoom } from '../lib/album/album';
import { headLine, scroller, zoomSwap } from '../lib/album/albumMotion';
import { isMac } from '../lib/platformKeys';
import { holdZoomGesture, zoomGestureHeld } from '../lib/album/recordZoom';

/**
 * 列表三档缩放（运动、睡眠列表共用）。入口只有两条，走同一个 `go()`：
 *
 * - **Ctrl + 滚轮 / 触控板捏合**（Chromium 里捏合就是带 ctrlKey 的 wheel）：页面本身一律不缩放（passive: false + preventDefault）；
 *   跟手把列表放大缩小一点，累计够一档就换（lib/album/albumMotion.ts 的 zoomSwap），手停下来还没够一档就弹回原样。
 *   放大 = 往细（年 → 月 → 日），缩小 = 往粗。
 * - **左下托盘**（components/album/AlbumTray.vue）：把手上下拖吸附到某一档，面板里点某一档。
 * - **一次手势只走一档**：换过一档以后，要等手停一下（滚轮 / 捏合停 180ms）才接着认，不会一下子从日冲到年。
 * - **不朝指针漂**：缩放的原点和钉住的那一条都取视口正中，不取指针（指针在边上时整块往那边飘，用户看着像在滑走）。
 */
export function useAlbumNav(options: {
  stage: Ref<HTMLElement | null>;
  zoom: Ref<AlbumZoom>;
  /** 此刻能不能换档（选择中、看已隐藏时不能）。 */
  zoomable: () => boolean;
  /** 换到 `next` 之前要读好的东西（按月汇总、热图要的更多记录）。 */
  prepare: (next: AlbumZoom) => Promise<void>;
  /** 日列表里把这一天所在的月读进来并画出来（分页列表要先往下读到那个月）。 */
  ensureDay?: (day: string) => Promise<void>;
}) {
  const { stage, zoom } = options;
  const body = () => stage.value?.querySelector<HTMLElement>(':scope > [data-album-body]') ?? null;
  const main = () => scroller();

  /* ---------- 锚点：换档前后钉在同一高度的那一条 ---------- */

  let anchorKey: { id?: string; day?: string; month?: string } = {};
  /** 视口正中（顶栏以下那一块的中线）。 */
  const viewCenter = () => {
    const box = main()?.getBoundingClientRect();
    const top = headLine();
    const bottom = box ? box.bottom : window.innerHeight;
    return { x: box ? box.left + box.width / 2 : window.innerWidth / 2, y: (top + bottom) / 2 };
  };
  const pick = (x: number, y: number): HTMLElement | null => {
    // 取离 (x, y) 最近的那一条（竖直方向为主）；没有条目（运动的年档是整页履历）就取最近的月份标记。
    let best: HTMLElement | null = null;
    let distance = Infinity;
    const scan = (selector: string) => stage.value?.querySelectorAll<HTMLElement>(selector).forEach((el) => {
      const box = el.getBoundingClientRect();
      if (box.bottom < headLine() || box.top > window.innerHeight) return;
      const d = Math.abs(box.top + box.height / 2 - y) + Math.abs(box.left + box.width / 2 - x) * 0.2;
      if (d < distance) { distance = d; best = el; }
    });
    scan('[data-album-item]');
    if (!best) scan('[data-timeline]');
    return best;
  };
  const keyOf = (el: HTMLElement | null) => ({
    id: el?.dataset.albumId,
    day: el?.dataset.albumDay,
    month: el?.dataset.albumMonth ?? el?.dataset.albumDay?.slice(0, 7) ?? el?.closest<HTMLElement>('[data-timeline]')?.dataset.timeline ?? el?.dataset.timeline,
  });
  const find = (): HTMLElement | null => {
    const root = stage.value;
    if (!root) return null;
    const q = (selector: string) => root.querySelector<HTMLElement>(selector);
    return (anchorKey.id && q(`[data-album-id="${CSS.escape(anchorKey.id)}"]`))
      || (anchorKey.day && (q(`[data-album-item][data-album-day="${anchorKey.day}"]`) || q(`[data-album-day="${anchorKey.day}"]`)))
      || (anchorKey.month && (q(`[data-album-month="${anchorKey.month}"]`) || q(`[data-timeline="${anchorKey.month}"]`) || q(`[data-timeline^="${anchorKey.month.slice(0, 4)}"]`)))
      || null;
  };

  /* ---------- 换档 ---------- */

  let busy = false;
  /** 日 ↔ 月换完以后，那个月顶上离顶栏下沿留多少。 */
  const PIN_GAP = 16;
  /**
   * 换到 `next`。`day`：落到日档的这一天（年档热图 / 履历日历上点了某天）——锚点就是那一天，换完滚到它。
   * 返回是否真的换了。
   */
  const go = async (next: AlbumZoom, target?: { day?: string; anchor?: HTMLElement | null }): Promise<boolean> => {
    if (busy || next === zoom.value || !options.zoomable()) return false;
    const el = body();
    busy = true;
    try {
      await options.prepare(next);
      if (target?.day && next === 'day') await options.ensureDay?.(target.day);
      let anchor = target?.anchor ?? null;
      if (!anchor) { const center = viewCenter(); anchor = pick(center.x, center.y); }
      anchorKey = target?.day ? { day: target.day, month: target.day.slice(0, 7) } : keyOf(anchor);
      // 日 ↔ 月：落点固定——视口正中那个月的第一条（最新的一条）落到顶栏下面，月档连同这个月的组头一起露出来。
      // 以前钉的是正中那一条的高度，那一条在新排版里离月头多远就差多远，每次换完停的地方都不一样，常常要往上翻一大段。
      const between = !target?.day && (next === 'day' || zoom.value === 'day') && next !== 'year' && zoom.value !== 'year';
      let pinTop: ((landed: HTMLElement) => number) | undefined;
      const month = anchorKey.month;
      if (between && month) {
        const first = stage.value?.querySelector<HTMLElement>(`[data-album-item][data-album-day^="${month}"]`) ?? null;
        if (first?.dataset.albumId) { anchor = first; anchorKey = { id: first.dataset.albumId, day: first.dataset.albumDay, month }; }
        pinTop = (landed) => {
          // 最新的那个月：整页回到顶上（页头、睡前因素都在），不为了贴顶把它们滚走。
          if (stage.value?.querySelector('[data-album-item]') === landed) return landed.getBoundingClientRect().top + (main()?.scrollTop ?? 0);
          const head = landed.closest<HTMLElement>('.tile-month');
          // 月档：组头（月度分析）露在顶栏下面；日档：这一行上面留一点空。
          return headLine() + (head ? PIN_GAP + landed.getBoundingClientRect().top - head.getBoundingClientRect().top : PIN_GAP);
        };
      }
      const dir = zoomIndex(next) > zoomIndex(zoom.value) ? 1 : -1;
      const swap = async () => { zoom.value = next; await nextTick(); };
      if (el) await zoomSwap(el, anchor, swap, find, body, { dir, pinTop });
      else await swap();
      if (target?.day) {
        const landed = find();
        const box = main();
        if (landed && box) box.scrollTop += landed.getBoundingClientRect().top - (headLine() + Math.max(24, box.clientHeight / 4));
      }
      return true;
    } finally {
      busy = false;
      scale = 1;
      holdUntilIdle();
    }
  };

  /* ---------- 捏合 ---------- */

  let scale = 1;
  /** 换过一档以后锁住，等手停下来才放开（一次手势只走一档）。 */
  let locked = false;
  let unlock = 0;
  const holdUntilIdle = () => { locked = true; window.clearTimeout(unlock); unlock = window.setTimeout(() => { locked = false; }, 180); };
  let gesture = false;
  let idle = 0;

  const live = (value: number) => {
    const el = body();
    if (el) el.style.transform = value === 1 ? '' : `scale(${value.toFixed(4)})`;
  };
  const settle = () => {
    idle = 0;
    gesture = false;
    const el = body();
    const from = stretchAtEdge(scale, zoomIndex(zoom.value));
    scale = 1;
    if (!el || from === 1) { live(1); return; }
    el.style.transform = '';
    el.animate([{ transform: `scale(${from})` }, { transform: 'scale(1)' }], { duration: 320, easing: 'cubic-bezier(.32,.72,.24,1)' })
      .finished.then(() => el.style.removeProperty('transform-origin'), () => undefined);
  };
  const onWheel = (event: WheelEvent) => {
    // Mac 上托盘提示写的是 ⌘ + 滚轮（触控板捏合仍是带 ctrlKey 的 wheel）。
    if (!event.ctrlKey && !(event.metaKey && isMac())) return;
    // 页面本身不缩放：列表页上 Ctrl + 滚轮 / 捏合只给列表用。
    event.preventDefault();
    // 详情页刚往外退回来（第四档 → 日档）：这串手势剩下的事件不再往外缩。
    if (zoomGestureHeld(event.timeStamp)) { holdZoomGesture(event.timeStamp); return; }
    if (locked) { holdUntilIdle(); return; }
    if (busy || !options.zoomable() || !stage.value) return;
    const el = body();
    if (!el) return;
    const index = zoomIndex(zoom.value);
    if (!gesture) {
      gesture = true;
      const center = viewCenter();
      const box = el.getBoundingClientRect();
      el.style.transformOrigin = `${box.width / 2}px ${center.y - box.top}px`;
    }
    scale *= wheelFactor(event.deltaY, event.deltaMode);
    window.clearTimeout(idle);
    const step = zoomStep(scale, index);
    if (step) {
      idle = 0;
      gesture = false;
      void go(ZOOMS[index + step]!);
      return;
    }
    // 到头了（最细还在放大 / 最粗还在缩小）只给一点橡皮筋，累计也别越攒越多。
    if (index === 0 && scale > 1.6) scale = 1.6;
    if (index === ZOOMS.length - 1 && scale < 0.6) scale = 0.6;
    live(stretchAtEdge(scale, index));
    idle = window.setTimeout(settle, 160);
  };

  let bound = false;
  const bind = () => { if (!bound) { window.addEventListener('wheel', onWheel, { passive: false }); bound = true; } };
  const unbind = () => { if (bound) { window.removeEventListener('wheel', onWheel); bound = false; } window.clearTimeout(idle); window.clearTimeout(unlock); locked = false; gesture = false; };
  onMounted(bind);
  onActivated(bind);
  onDeactivated(unbind);
  onBeforeUnmount(unbind);

  return { go, busy: () => busy };
}
