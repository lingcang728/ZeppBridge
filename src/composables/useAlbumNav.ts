import { nextTick, onActivated, onBeforeUnmount, onDeactivated, onMounted, type Ref } from 'vue';
import { levelDepth, stretchAtEdge, wheelFactor, zoomStep, type AlbumDensity, type AlbumLevel } from '../lib/album/album';
import { collapseToCard, expandFromCard, headLine, scroller, zoomSwap } from '../lib/album/albumMotion';
import { lessMotion } from '../lib/motion/lessMotion';

/**
 * 相册的手势和层级切换（运动、睡眠列表共用）：
 *
 * - **Ctrl + 滚轮 / 触控板捏合**（Chromium 里捏合就是带 ctrlKey 的 wheel）：页面本身一律不缩放（passive: false + preventDefault）；
 *   在「日」这一层、没在选择 / 看已隐藏时，跟手把列表放大缩小一点，累计够一档就换密度（lib/album/albumMotion.ts 的 zoomSwap），
 *   手停下来还没够一档就弹回原样。
 * - **层级**：点年卡 → 月、点月卡 → 那个月的日列表，从被点的卡展开；胶囊上切到更浅的一层，当前这一层缩回到对应的卡里。
 */
export function useAlbumNav(options: {
  stage: Ref<HTMLElement | null>;
  level: Ref<AlbumLevel>;
  density: Ref<AlbumDensity>;
  /** 此刻能不能换密度（选择中、看已隐藏时不能）。 */
  zoomable: () => boolean;
  /** 日列表里把这个月读进来（分页列表要先往下读到那个月）。 */
  ensureMonth: (month: string) => Promise<void>;
  /** 月 / 年卡的汇总读好（第一次切过去时才读）。 */
  loadPeriods: () => Promise<void>;
}) {
  const { stage, level, density } = options;
  const body = () => stage.value?.querySelector<HTMLElement>(':scope > [data-album-body]') ?? null;
  const main = () => scroller();
  const scrollTo = (el: Element | null, gap = 12) => {
    const box = main();
    if (!el || !box) return;
    box.scrollTop += el.getBoundingClientRect().top - (headLine() + gap);
  };

  /* ---------- 层级 ---------- */

  /** 视口顶上那一条属于哪个月（YYYY-MM）。 */
  const monthAtTop = (): string | null => {
    const line = headLine() + 8;
    const items = stage.value?.querySelectorAll<HTMLElement>('[data-timeline]') ?? [];
    for (const item of items) {
      const box = item.getBoundingClientRect();
      if (box.bottom > line) return item.dataset.timeline ?? null;
    }
    return items.length ? items[items.length - 1].dataset.timeline ?? null : null;
  };
  const periodKey = (month: string, at: AlbumLevel) => (at === 'year' ? month.slice(0, 4) : month);
  const cardFor = (key: string) => stage.value?.querySelector<HTMLElement>(`[data-period="${CSS.escape(key)}"]`) ?? null;
  /** 切到 `next` 之后，把 `key` 那一段滚到顶栏下面。 */
  const landOn = async (next: AlbumLevel, key: string | null) => {
    if (next === 'day' && key) await options.ensureMonth(key.length === 4 ? `${key}-12` : key);
    level.value = next;
    await nextTick();
    if (!key) return;
    if (next === 'day') {
      scrollTo(stage.value?.querySelector(`[data-timeline^="${CSS.escape(key)}"]`) ?? null);
    } else if (next === 'month') {
      scrollTo(stage.value?.querySelector(`[data-period-group="${CSS.escape(key.slice(0, 4))}"]`) ?? cardFor(key));
    } else {
      scrollTo(cardFor(key.slice(0, 4)));
    }
  };

  let busy = false;
  const go = async (next: AlbumLevel, from?: { key: string; card: HTMLElement }) => {
    if (busy || next === level.value) return;
    busy = true;
    const prev = level.value;
    const before = main()?.scrollTop ?? 0;
    const switchBack = async () => { level.value = prev; await nextTick(); const box = main(); if (box) box.scrollTop = before; };
    try {
      if (next !== 'day') await options.loadPeriods();
      if (levelDepth(next) > levelDepth(prev)) {
        // 往深处：从被点的卡（胶囊上切的话，就是视口顶上那张卡）展开。
        const top = monthAtTop();
        const key = from?.key ?? (top ? periodKey(top, prev) : null);
        const card = from?.card ?? (key ? cardFor(key) : null);
        await expandFromCard({ card, body, switchBack, switchTo: () => landOn(next, key) });
      } else {
        // 往浅处：当前这一层缩回到对应的那张卡。
        const top = monthAtTop();
        const key = top ? periodKey(top, next) : null;
        await collapseToCard({
          body, switchBack,
          switchTo: async () => {
            level.value = next;
            await nextTick();
            const card = key ? cardFor(key) : null;
            if (card) {
              const box = main();
              if (box) box.scrollTop += card.getBoundingClientRect().top - (headLine() + Math.max(24, (box.clientHeight - card.offsetHeight) / 3));
            }
            return card;
          },
        });
      }
    } finally {
      busy = false;
    }
  };
  const openPeriod = (key: string, card: HTMLElement) => { void go(key.length === 4 ? 'month' : 'day', { key, card }); };

  /* ---------- 捏合换密度 ---------- */

  let scale = 1;
  let anchor: HTMLElement | null = null;
  let anchorKey: { id?: string; day?: string; month?: string } = {};
  let idle = 0;
  let swapping = false;

  const pick = (x: number, y: number): HTMLElement | null => {
    const hit = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-album-item], [data-album-day]');
    if (hit && stage.value?.contains(hit)) return hit;
    // 指针在空白处：取离指针最近的那一条。
    let best: HTMLElement | null = null;
    let distance = Infinity;
    stage.value?.querySelectorAll<HTMLElement>('[data-album-item]').forEach((el) => {
      const box = el.getBoundingClientRect();
      if (box.bottom < headLine() || box.top > window.innerHeight) return;
      const d = Math.abs(box.top + box.height / 2 - y) + Math.abs(box.left + box.width / 2 - x) * 0.2;
      if (d < distance) { distance = d; best = el; }
    });
    return best;
  };
  const keyOf = (el: HTMLElement | null) => ({
    id: el?.dataset.albumId,
    day: el?.dataset.albumDay,
    month: el?.dataset.albumMonth ?? el?.dataset.albumDay?.slice(0, 7) ?? el?.closest<HTMLElement>('[data-timeline]')?.dataset.timeline,
  });
  const find = (): HTMLElement | null => {
    const root = stage.value;
    if (!root) return null;
    const q = (selector: string) => root.querySelector<HTMLElement>(selector);
    return (anchorKey.id && q(`[data-album-id="${CSS.escape(anchorKey.id)}"]`))
      || (anchorKey.day && (q(`[data-album-item][data-album-day="${anchorKey.day}"]`) || q(`[data-album-day="${anchorKey.day}"]`)))
      || (anchorKey.month && (q(`[data-album-month="${anchorKey.month}"]`) || q(`[data-timeline="${anchorKey.month}"]`)))
      || null;
  };
  const live = (value: number) => {
    const el = body();
    if (!el) return;
    el.style.transform = value === 1 ? '' : `scale(${value.toFixed(4)})`;
  };
  const settle = () => {
    idle = 0;
    const el = body();
    const from = stretchAtEdge(scale, density.value);
    scale = 1;
    anchor = null;
    if (!el || from === 1) { live(1); return; }
    el.style.transform = '';
    if (!lessMotion()) el.animate([{ transform: `scale(${from})` }, { transform: 'scale(1)' }], { duration: 320, easing: 'cubic-bezier(.32,.72,.24,1)' })
      .finished.then(() => el.style.removeProperty('transform-origin'), () => undefined);
  };
  const commit = async (step: -1 | 1) => {
    const el = body();
    if (!el) return;
    swapping = true;
    const next = (density.value + step) as AlbumDensity;
    try {
      await zoomSwap(el, anchor, async () => { density.value = next; await nextTick(); }, find, body);
    } finally {
      swapping = false;
      scale = 1;
      anchor = null;
    }
  };
  const onWheel = (event: WheelEvent) => {
    if (!event.ctrlKey) return;
    // 页面本身不缩放：列表页上 Ctrl + 滚轮 / 捏合只给相册用。
    event.preventDefault();
    if (swapping || level.value !== 'day' || !options.zoomable() || !stage.value) return;
    const el = body();
    if (!el) return;
    if (!anchor) {
      anchor = pick(event.clientX, event.clientY);
      anchorKey = keyOf(anchor);
      const box = el.getBoundingClientRect();
      el.style.transformOrigin = `${event.clientX - box.left}px ${event.clientY - box.top}px`;
    }
    scale *= wheelFactor(event.deltaY, event.deltaMode);
    const step = zoomStep(scale, density.value);
    window.clearTimeout(idle);
    if (step) { idle = 0; void commit(step); return; }
    // 到头了（最疏还在放大 / 最密还在缩小）只给一点橡皮筋，累计也别越攒越多。
    if ((density.value === 0 && scale > 1.6) || (density.value === 2 && scale < 0.6)) scale = density.value === 0 ? 1.6 : 0.6;
    live(stretchAtEdge(scale, density.value));
    idle = window.setTimeout(settle, 160);
  };

  let bound = false;
  const bind = () => { if (!bound) { window.addEventListener('wheel', onWheel, { passive: false }); bound = true; } };
  const unbind = () => { if (bound) { window.removeEventListener('wheel', onWheel); bound = false; } window.clearTimeout(idle); };
  onMounted(bind);
  onActivated(bind);
  onDeactivated(unbind);
  onBeforeUnmount(unbind);

  return { go, openPeriod };
}
