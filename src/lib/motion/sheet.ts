/**
 * 交给 AI 的玻璃大卡（components/ai/AiSheet.vue，10-08 H18）从哪枚胶囊长出来、收回哪枚胶囊。
 *
 * 10-09（用户：退出时卡片是直接缩回去的，缺少形变）：以前只用一个非等比缩放把大卡压成胶囊的大小——字被压扁、
 * 圆角被压成椭圆，看上去是一张卡「被挤没了」。现在是形变：大卡**等比**缩放到胶囊那么宽，同时用 clip-path 把
 * 看得见的部分裁成胶囊的形状（上下一起收、圆角从大卡的 28px 变成胶囊的半圆）。开的时候原路反过来。
 * 只动 transform / clip-path / opacity；面板自己不带 backdrop-filter（模糊在身后的 .sheet-veil 上），裁切不会让模糊重算。
 *
 * 开好以后 clip-path 要撤掉，不然大卡的投影被裁掉；最后一小段把裁切框放到卡外（同心圆角），投影是一点点亮出来的，不在动画结束时「啪」地出现。
 */
import { CLOSE_EASE } from './timing';

const CLOSE_MS = 380;
const BLEED = 90;

export interface SheetOrigin { rect: DOMRect; radius: number }

/** 这张大卡是从哪枚胶囊长出来的（胶囊上写着 `data-sheet="名字"`）。 */
export const sheetOrigin = (name: string): SheetOrigin | null => {
  const el = document.querySelector<HTMLElement>(`[data-sheet="${CSS.escape(name)}"]`);
  if (!el || !el.getClientRects().length) return null;
  const rect = el.getBoundingClientRect();
  return { rect, radius: Math.min(rect.height / 2, parseFloat(getComputedStyle(el).borderTopLeftRadius) || rect.height / 2) };
};

type Rect = { left: number; top: number; width: number; height: number };

/**
 * 大卡缩成胶囊时的样子：等比缩放（取宽、高两个比例里大的那个，胶囊一定被盖满），再把多出来的那一截裁掉。
 * 裁切写在大卡自己的坐标里（transform 之前），所以圆角也要除以缩放比。
 */
export const sheetPose = (from: Rect, panel: Rect, radius: number) => {
  const s = Math.max(from.width / Math.max(1, panel.width), from.height / Math.max(1, panel.height));
  const ix = Math.max(0, (panel.width - from.width / s) / 2);
  const iy = Math.max(0, (panel.height - from.height / s) / 2);
  const dx = from.left + from.width / 2 - (panel.left + panel.width / 2);
  const dy = from.top + from.height / 2 - (panel.top + panel.height / 2);
  const r = Math.min(radius, from.height / 2, from.width / 2) / s;
  return {
    transform: `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) scale(${s.toFixed(4)})`,
    clipPath: `inset(${iy.toFixed(1)}px ${ix.toFixed(1)}px round ${r.toFixed(1)}px)`,
  };
};

/** 开好时的裁切（正好是卡的轮廓）和放到卡外、露出投影的裁切（同心圆角）。 */
export const sheetClip = (radius: number) => ({
  flush: `inset(0px round ${radius}px)`,
  bleed: `inset(${-BLEED}px round ${radius + BLEED}px)`,
});

const panelRadius = (panel: HTMLElement) => parseFloat(getComputedStyle(panel).borderTopLeftRadius) || 28;

/** 开：从胶囊形变成大卡。没有胶囊（键盘直达、链接打开）就从正中略小一点淡入。 */
export const openSheet = (panel: HTMLElement, origin: SheetOrigin | null, duration: number, easing: string) => {
  const clip = sheetClip(panelRadius(panel));
  if (!origin) {
    return panel.animate([{ transform: 'scale(.94)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration, easing, fill: 'backwards' });
  }
  const pose = sheetPose(origin.rect, panel.getBoundingClientRect(), origin.radius);
  return panel.animate(
    [{ ...pose, opacity: 1 }, { transform: 'none', clipPath: clip.flush, offset: 0.86 }, { transform: 'none', clipPath: clip.bleed, opacity: 1 }],
    { duration, easing, fill: 'backwards' },
  );
};

/** 收：父层 <Transition :css="false" @leave> 调它。先读此刻的样子（开到一半就关也是从此刻原路收）。 */
export const leaveSheet = (el: Element, done: () => void) => {
  const root = el as HTMLElement;
  const panel = root.querySelector<HTMLElement>('.sheet-panel');
  const body = root.querySelector<HTMLElement>('.sheet-body');
  const veil = root.querySelector<HTMLElement>('.sheet-veil');
  if (!panel || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { done(); return; }
  root.style.pointerEvents = 'none';
  const style = getComputedStyle(panel);
  const now = style.transform;
  const clipNow = style.clipPath;
  const bodyNow = body ? Number(getComputedStyle(body).opacity) : 1;
  const veilNow = veil ? Number(getComputedStyle(veil).opacity) : 1;
  for (const animation of root.getAnimations({ subtree: true })) animation.cancel();
  const clip = sheetClip(panelRadius(panel));
  const to = sheetOrigin(root.dataset.sheetName ?? '');
  body?.animate([{ opacity: bodyNow }, { opacity: 0, offset: 0.3 }, { opacity: 0 }], { duration: CLOSE_MS, fill: 'forwards' });
  veil?.animate([{ opacity: veilNow }, { opacity: 0 }], { duration: CLOSE_MS, easing: 'ease-in', fill: 'forwards' });
  const transform = now === 'none' ? 'none' : now;
  // 开好的卡没有裁切：先把裁切框从卡外收到卡沿（投影跟着收掉），再开始形变。
  const lead: Keyframe[] = clipNow && clipNow !== 'none'
    ? [{ transform, clipPath: clipNow, opacity: 1 }]
    : [{ transform, clipPath: clip.bleed, opacity: 1 }, { transform, clipPath: clip.flush, opacity: 1, offset: 0.08 }];
  const pose = to ? sheetPose(to.rect, panel.getBoundingClientRect(), to.radius) : null;
  const shrink = pose
    ? panel.animate([...lead, { ...pose, opacity: 1, offset: 0.88 }, { ...pose, opacity: 0 }], { duration: CLOSE_MS, easing: CLOSE_EASE, fill: 'forwards' })
    : panel.animate([...lead, { transform: 'scale(.94)', clipPath: clip.flush, opacity: 0 }], { duration: CLOSE_MS, easing: CLOSE_EASE, fill: 'forwards' });
  shrink.finished.then(done, done);
};
