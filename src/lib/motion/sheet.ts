/**
 * 交给 AI 的玻璃大卡（components/ai/AiSheet.vue，10-08 H18）收起来的那一段：父层 <Transition :css="false" @leave> 调它。
 * 先读此刻的样子（开到一半就关也是从此刻原路收）——内容先淡掉、卡缩回那枚胶囊、身后的毛玻璃同时淡掉。只动 transform / opacity。
 */
import { flightTransform } from './dialogFlight';
import { CLOSE_EASE } from './timing';

const CLOSE_MS = 340;

/** 这张大卡是从哪枚胶囊长出来的（胶囊上写着 `data-sheet="名字"`）。 */
export const sheetOrigin = (name: string): DOMRect | null => {
  const el = document.querySelector<HTMLElement>(`[data-sheet="${CSS.escape(name)}"]`);
  return el && el.getClientRects().length ? el.getBoundingClientRect() : null;
};

export const leaveSheet = (el: Element, done: () => void) => {
  const root = el as HTMLElement;
  const panel = root.querySelector<HTMLElement>('.sheet-panel');
  const body = root.querySelector<HTMLElement>('.sheet-body');
  const veil = root.querySelector<HTMLElement>('.sheet-veil');
  if (!panel || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { done(); return; }
  root.style.pointerEvents = 'none';
  const now = getComputedStyle(panel).transform;
  const bodyNow = body ? Number(getComputedStyle(body).opacity) : 1;
  const veilNow = veil ? Number(getComputedStyle(veil).opacity) : 1;
  for (const animation of root.getAnimations({ subtree: true })) animation.cancel();
  const to = sheetOrigin(root.dataset.sheetName ?? '');
  const end = to ? flightTransform(to, panel.getBoundingClientRect()) : 'scale(.94)';
  body?.animate([{ opacity: bodyNow }, { opacity: 0, offset: 0.35 }, { opacity: 0 }], { duration: CLOSE_MS, fill: 'forwards' });
  veil?.animate([{ opacity: veilNow }, { opacity: 0 }], { duration: CLOSE_MS, easing: 'ease-in', fill: 'forwards' });
  const shrink = panel.animate(
    [{ transform: now === 'none' ? 'none' : now, opacity: 1 }, { opacity: 1, offset: 0.75 }, { transform: end, opacity: 0 }],
    { duration: CLOSE_MS, easing: CLOSE_EASE, fill: 'forwards' },
  );
  shrink.finished.then(done, done);
};
