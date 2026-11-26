import { nextTick, onActivated, onBeforeUnmount, onDeactivated, onMounted, type Ref } from 'vue';
import { useRouter } from 'vue-router';
import { wheelFactor, ZOOM_STEP_OUT, type AlbumKind, type AlbumZoom } from '../lib/album/album';
import { headLine, scroller } from '../lib/album/albumMotion';
import { focusOffset, holdZoomGesture, requestRecordFocus, takeRecordFocus } from '../lib/album/recordZoom';
import { isMac } from '../lib/platformKeys';
import { steerReturnScroll } from '../lib/returnScroll';

const rowSelector = (id: string) => `[data-album-item][data-album-id="${CSS.escape(id)}"]`;

/**
 * 详情页（列表缩放的第四档，lib/album/recordZoom.ts）：Ctrl + 滚轮往外 / 触控板捏合，退回列表的日档、停在这一条上。
 * 往里没有更细的一档，只把页面缩放挡掉。一次手势只退一层：退过以后要等手停下来才再认。
 */
export function useRecordZoomOut(options: { kind: AlbumKind; listName: string; listPath: string; id: () => string; day: () => string | null }) {
  const router = useRouter();
  let scale = 1;
  let idle = 0;
  let fired = false;

  const leave = () => {
    const id = options.id();
    if (!id) return false;
    const back = (window.history.state as { back?: unknown } | null)?.back;
    const steered = typeof back === 'string' && back.split(/[?#]/)[0] === options.listPath;
    requestRecordFocus({ kind: options.kind, id, day: options.day(), steered });
    if (steered) {
      // 后退回列表：不回到离开时（月档）的位置，而是让这一行停在固定的高度上，卡 ↔ 页形变缩回的就是它。
      steerReturnScroll(() => {
        const row = document.querySelector<HTMLElement>(`.page-host > :not([class*="-leave"]) ${rowSelector(id)}`);
        const root = scroller();
        if (!row || !root) return null;
        return root.scrollTop + row.getBoundingClientRect().top - headLine() - focusOffset(root.clientHeight);
      });
      router.back();
    } else {
      void router.push({ name: options.listName });
    }
    return true;
  };

  const onWheel = (event: WheelEvent) => {
    if (!event.ctrlKey && !(event.metaKey && isMac())) return;
    event.preventDefault();
    window.clearTimeout(idle);
    idle = window.setTimeout(() => { scale = 1; fired = false; }, 180);
    if (fired) return;
    scale = Math.min(1.1, scale * wheelFactor(event.deltaY, event.deltaMode));
    if (scale <= ZOOM_STEP_OUT) { fired = leave(); scale = 1; if (fired) holdZoomGesture(event.timeStamp); }
  };
  let bound = false;
  const bind = () => { if (!bound) { window.addEventListener('wheel', onWheel, { passive: false }); bound = true; } };
  const unbind = () => { if (bound) { window.removeEventListener('wheel', onWheel); bound = false; } window.clearTimeout(idle); scale = 1; fired = false; };
  onMounted(bind);
  onActivated(bind);
  onDeactivated(unbind);
  onBeforeUnmount(unbind);
}

/**
 * 列表那一侧：从详情页往外缩回来时，切到日档、把这一行接成卡 ↔ 页形变的落点（详情页是从月档那一格长出来的，
 * 那一格带着 data-morph-source；换成日档后标记挪到这一行上），没走后退的话自己滚到这一行。
 */
export function useRecordFocusLanding(options: {
  kind: AlbumKind;
  zoom: Ref<AlbumZoom>;
  stage: Ref<HTMLElement | null>;
  /** 列表读好了没有（首页还在读时先等）。 */
  ready: () => boolean;
  /** 把这一天所在的月读进来、画出来。 */
  ensureDay: (day: string) => Promise<void>;
}) {
  const until = (test: () => boolean, ms: number) => new Promise<void>((resolve) => {
    const started = performance.now();
    const look = () => (test() || performance.now() - started > ms ? resolve() : requestAnimationFrame(look));
    look();
  });
  const land = async () => {
    const focus = takeRecordFocus(options.kind);
    if (!focus) return;
    const source = options.stage.value?.querySelector<HTMLElement>(`[data-album-id="${CSS.escape(focus.id)}"][data-morph-source]`)?.dataset.morphSource;
    options.zoom.value = 'day';
    await nextTick();
    const row = () => options.stage.value?.querySelector<HTMLElement>(rowSelector(focus.id)) ?? null;
    const mark = () => { const found = row(); if (found && source) found.dataset.morphSource = source; return found; };
    if (!(mark() && focus.steered)) {
      await until(options.ready, 3000);
      if (focus.day) await options.ensureDay(focus.day);
      await nextTick();
      mark();
    }
    pin(row);
  };
  /* 钉住这一行：上面还没画过的行按估计高度占位（content-visibility），一画出来真高度不一样，这一行就被顶走；
     后退时 returnScroll 也只追到它自己停下为止。所以这里再跟一小段，每帧把偏差补回去；用户一动（滚动、点、按键）就放手。 */
  const pin = (row: () => HTMLElement | null) => {
    const root = scroller();
    if (!root) return;
    let stop = false;
    const quit = (event: Event) => { if (!(event instanceof WheelEvent && (event.ctrlKey || event.metaKey))) stop = true; };
    const events = ['wheel', 'pointerdown', 'keydown', 'touchstart'] as const;
    events.forEach((name) => window.addEventListener(name, quit, { capture: true, passive: true }));
    const started = performance.now();
    const step = () => {
      const found = row();
      if (!stop && found && found.isConnected) {
        const delta = found.getBoundingClientRect().top - headLine() - focusOffset(root.clientHeight);
        if (Math.abs(delta) > 1) root.scrollTop += delta;
      }
      if (!stop && performance.now() - started < 1400) requestAnimationFrame(step);
      else events.forEach((name) => window.removeEventListener(name, quit, { capture: true }));
    };
    step();
  };
  onMounted(() => { void land(); });
  onActivated(() => { void land(); });
}
