/**
 * 边缘避让：悬浮提示、说明浮层显示出来时，不许被窗口或任何会裁切它的祖先截掉半截。
 *
 * 2026-10-01 截图：交给 AI 页订阅档位旁边的「?」说明往左展开，左半截被画布（overflow: hidden）切掉。
 * 这类浮层大多是纯 CSS 的（悬停 / 聚焦时把透明度打开），各自写死 `right: -8px` 一类的位置，
 * 放在别的宽度、别的语言下就出界。这里不改它们的定位写法，只在显示时量一次：
 * 找出真正裁它的那个框（窗口 ∩ 每个 overflow 不是 visible、且是它包含块或包含块祖先的元素），
 * 超出就用 margin 往里挪（margin 不和它们的 transform / translate 动画打架），太宽就先收窄。
 *
 * 用法：组件里 `import { vEdgeSafe }`，模板里 `v-edge-safe` 挂在浮层上。浮层一直挂在 DOM 里、靠悬停显示的，
 * 指针进入 / 聚焦它的父元素时量；跟着指针走的（v-if + left%），每次更新后量。
 */
import type { Directive } from 'vue';

const MARGIN = 8;

interface Box { left: number; right: number; top: number; bottom: number }

const clips = (style: CSSStyleDeclaration) =>
  style.overflowX !== 'visible' || style.overflowY !== 'visible';

/** 真正能裁到 el 的框：窗口与沿途每个裁切祖先的交集。 */
export function clipBox(el: HTMLElement): Box {
  const box: Box = { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
  const fixed = getComputedStyle(el).position === 'fixed';
  if (fixed) return box;
  const absolute = getComputedStyle(el).position === 'absolute';
  // 绝对定位的元素只被「包含块及其祖先」裁切：包含块和它之间的那些不定位的 overflow 元素裁不到它。
  let reachedContainer = !absolute;
  const container = el.offsetParent;
  for (let node = el.parentElement; node && node !== document.documentElement; node = node.parentElement) {
    if (!reachedContainer && node === container) reachedContainer = true;
    if (!reachedContainer) continue;
    const style = getComputedStyle(node);
    if (!clips(style)) continue;
    const rect = node.getBoundingClientRect();
    box.left = Math.max(box.left, rect.left);
    box.top = Math.max(box.top, rect.top);
    box.right = Math.min(box.right, rect.right);
    box.bottom = Math.min(box.bottom, rect.bottom);
  }
  return box;
}

/** 横向需要挪多少（屏幕像素）：放得下就往里推到留出 margin，放不下就左对齐。 */
export function shiftInto(left: number, right: number, box: Pick<Box, 'left' | 'right'>, margin = MARGIN): number {
  const lo = box.left + margin;
  const hi = box.right - margin;
  if (right - left > hi - lo) return lo - left;
  if (left < lo) return lo - left;
  if (right > hi) return hi - right;
  return 0;
}

/** 量一次、挪一次。不在显示中的（display: none）跳过。 */
export function nudgeInside(el: HTMLElement): void {
  el.style.marginLeft = '';
  el.style.marginRight = '';
  el.style.maxWidth = '';
  if (!el.offsetWidth) return;
  const box = clipBox(el);
  const room = box.right - box.left - MARGIN * 2;
  let rect = el.getBoundingClientRect();
  const scale = rect.width / el.offsetWidth || 1;
  if (room > 0 && rect.width > room) {
    el.style.maxWidth = `${Math.floor(room / scale)}px`;
    rect = el.getBoundingClientRect();
  }
  const dx = shiftInto(rect.left, rect.right, box);
  if (Math.abs(dx) < 0.5) return;
  // 靠左定位的浮层用 margin-left 推；靠右定位（left: auto）的 margin-left 不起作用，换 margin-right 反着推。
  el.style.marginLeft = `${(dx / scale).toFixed(1)}px`;
  if (Math.abs(el.getBoundingClientRect().left - rect.left - dx) < 1) return;
  el.style.marginLeft = '';
  el.style.marginRight = `${(-dx / scale).toFixed(1)}px`;
}

type Guarded = HTMLElement & { __edgeSafe?: { run: () => void; host: HTMLElement | null } };

export const vEdgeSafe: Directive<HTMLElement> = {
  mounted(el) {
    const node = el as Guarded;
    let frame = 0;
    const run = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => nudgeInside(el));
    };
    const host = el.parentElement;
    host?.addEventListener('pointerenter', run);
    host?.addEventListener('focusin', run);
    window.addEventListener('resize', run);
    node.__edgeSafe = { run, host };
    run();
  },
  updated(el) {
    (el as Guarded).__edgeSafe?.run();
  },
  unmounted(el) {
    const state = (el as Guarded).__edgeSafe;
    if (!state) return;
    state.host?.removeEventListener('pointerenter', state.run);
    state.host?.removeEventListener('focusin', state.run);
    window.removeEventListener('resize', state.run);
  },
};
