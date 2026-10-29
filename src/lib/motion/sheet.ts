/**
 * 交给 AI 的玻璃大卡（components/ai/AiSheet.vue，10-08 H18）从哪枚胶囊长出来、收回哪枚胶囊。
 *
 * 10-29（用户：「这个『已保存』就弹得生硬，完全不像我们其他界面那样有过渡，和其他界面的缩放动画对齐」）：
 * 以前是自己的一套——大卡等比缩到胶囊那么宽再裁成胶囊，起点是一块**空的**玻璃框（内容四成以后才淡入），
 * 胶囊本身原地不动，形变还要先停 220ms 等画面跟上（背景也跟着停）：录屏里是点下去胶囊先发暗、隔一拍
 * 一块空框从胶囊旁边跳出来；收回时缩成一块空框，背景还糊着，最后一下才清。
 * 现在和履历页弹窗（lib/motion/dialogFlight.ts 的 windowOpen / windowClose，用户 10-28「那些动画太好了」）是同一套：
 * - 窗口形变：内容 1:1 不缩放，裁切框从胶囊的矩形沿一段弧长成大卡（dialogWindowFrames），收回原路落回胶囊；
 * - 第一帧就是那枚胶囊：胶囊的拷贝叠在窗口里，前三成淡掉，真的胶囊这段时间藏着；收回时拷贝在四成到八成亮回来，
 *   落地那一帧拷贝和真胶囊逐像素一致，撤掉拷贝、露出真胶囊，不多弹一下；
 * - 背景的模糊点下去就开始淡入（不等），跟着窗口慢慢糊上；收回时前四成几乎不退、落地时才散；
 * - 大卡里的字等窗口长到一半以后才淡入，收回时前三成先淡掉：不在小框里切字。
 * 只动 transform / clip-path（整段同一个圆角）/ opacity，见记忆「动效只动合成属性」。
 */
import { dialogWindowFrames } from './dialogFlight';
import { exemptFromSettle } from './interrupt';
import { lessMotion } from './lessMotion';
import { cardReplica } from './replica';
import { whenFramesSteady } from './steady';
import { OPEN_EASE, paced } from './timing';
import { visibleWindow, type WindowRect } from './window';

/** 和弹窗的窗口形变同长（dialogFlight 的 windowDuration）。 */
export const SHEET_MS = paced(480);
const NEARLY_HIDDEN = 0.001;
/** 开好以后把裁切框推到卡外露出投影的那一小段。 */
const SHADOW_MS = paced(140);
const BLEED = 90;

/** 这张大卡是从哪枚胶囊长出来的（胶囊上写着 `data-sheet="名字"`）。 */
export const sheetSource = (name: string): HTMLElement | null => {
  const el = document.querySelector<HTMLElement>(`[data-sheet="${CSS.escape(name)}"]`);
  return el && el.getClientRects().length ? el : null;
};

/** 整段形变用的圆角：胶囊那一端的圆角（不超过半高，最多 24，和弹窗一样）。纯函数，方便测。 */
export const sheetRadius = (source: WindowRect, sourceRadius: number): number =>
  Math.max(0, Math.min(sourceRadius || source.height / 2, source.height / 2, source.width / 2, 24));

/** 开好时的裁切（正好是卡的轮廓）和放到卡外、露出投影的裁切（同心圆角）。纯函数，方便测。 */
export const sheetClip = (radius: number) => ({
  flush: `inset(0px round ${radius}px)`,
  bleed: `inset(${-BLEED}px round ${radius + BLEED}px)`,
});

/** 打开：从胶囊这一帧起步（拷贝盖在胶囊上）；内容晚一点淡入；背景不等。 */
export const SHEET_BODY_IN: Keyframe[] = [{ opacity: NEARLY_HIDDEN }, { opacity: NEARLY_HIDDEN, offset: 0.45 }, { opacity: 1 }];
export const SHEET_REPLICA_OUT: Keyframe[] = [{ opacity: 1 }, { opacity: 0, offset: 0.3 }, { opacity: 0 }];
export const SHEET_REPLICA_IN: Keyframe[] = [{ opacity: 0 }, { opacity: 0, offset: 0.4 }, { opacity: 1, offset: 0.8 }, { opacity: 1 }];
export const sheetVeilOut = (from: number): Keyframe[] => [{ opacity: from }, { opacity: from * 0.88, offset: 0.4 }, { opacity: 0 }];

const radiusOf = (el: HTMLElement) => parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
const rectOf = (el: Element): WindowRect => {
  const box = el.getBoundingClientRect();
  return { left: box.left, top: box.top, width: box.width, height: box.height };
};

/* 大卡开着、收回还没落地时，胶囊藏起来：不然窗口里的拷贝和背后的真胶囊叠成两份字（同 dialogFlight 的 hideSource）。
   用属性不用类名：RouterLink 的 class 由 Vue 绑着，补丁时会被冲掉（样式见 AiSheet.vue 的全局一条）。 */
const hideSource = (el: HTMLElement | null) => el?.setAttribute('data-sheet-source', '');
const showSource = (name: string) => {
  document.querySelectorAll(`[data-sheet="${CSS.escape(name)}"][data-sheet-source]`).forEach((el) => el.removeAttribute('data-sheet-source'));
};

const attachReplica = (panel: HTMLElement, source: HTMLElement | null, frames: Keyframe[], duration: number) => {
  if (!source?.isConnected) return null;
  const replica = cardReplica(source).el;
  replica.querySelectorAll('[data-sheet-source]').forEach((node) => node.removeAttribute('data-sheet-source'));
  replica.dataset.sheetReplica = '';
  Object.assign(replica.style, { position: 'absolute', left: '0', top: '0', zIndex: '4', pointerEvents: 'none' });
  panel.appendChild(replica);
  replica.animate(frames, { duration, fill: 'both', easing: 'linear' });
  return replica;
};

/** 第一次打开：大卡的子页刚懒加载完，GPU 正忙，先停在胶囊那一帧等画面跟上（最多 160ms）；背景不等。之后都不等。 */
let firstOpen = true;

/**
 * 开：从胶囊形变成大卡（胶囊的拷贝摆在窗口左上角，窗口的锚点就是胶囊的左上角）。
 * 没有胶囊（键盘直达、链接打开）就从正中略小一点淡入。
 */
export const openSheet = (root: HTMLElement, name: string): void => {
  const panel = root.querySelector<HTMLElement>('.sheet-panel');
  const body = root.querySelector<HTMLElement>('.sheet-body');
  const veil = root.querySelector<HTMLElement>('.sheet-veil');
  if (!panel || lessMotion()) return;
  const final = rectOf(panel);
  const source = sheetSource(name);
  veil?.animate([{ opacity: NEARLY_HIDDEN }, { opacity: 1 }], { duration: SHEET_MS * 0.7, easing: 'ease-out', fill: 'backwards' });
  if (!source) {
    panel.animate([{ transform: 'scale(.96)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: paced(220), easing: OPEN_EASE, fill: 'backwards' });
    return;
  }
  const from = rectOf(source);
  const radius = sheetRadius(from, radiusOf(source));
  const replica = attachReplica(panel, source, SHEET_REPLICA_OUT, SHEET_MS);
  // 拷贝已经盖在胶囊上了，真的那一份这一帧就藏起来。
  hideSource(source);
  const flight = panel.animate(dialogWindowFrames(from, final, final, radius), { duration: SHEET_MS, easing: OPEN_EASE, fill: 'both' });
  body?.animate(SHEET_BODY_IN, { duration: SHEET_MS, easing: 'ease-out', fill: 'both' });
  if (firstOpen) {
    firstOpen = false;
    const held = panel.getAnimations({ subtree: true });
    held.forEach((animation) => animation.pause());
    void whenFramesSteady(160).then(() => held.forEach((animation) => { if (animation.playState === 'paused') animation.play(); }));
  }
  const settle = () => {
    replica?.remove();
    body?.getAnimations().forEach((animation) => animation.cancel());
    // 开好了：裁切框从卡沿推到卡外，投影一点点亮出来，不在动画结束时「啪」地出现。
    const clip = sheetClip(radiusOf(panel) || 28);
    const shadow = panel.animate([{ clipPath: clip.flush }, { clipPath: clip.bleed }], { duration: SHADOW_MS, easing: 'ease-out' });
    flight.cancel();
    const clear = () => shadow.cancel();
    shadow.finished.then(clear, clear);
  };
  flight.finished.then(() => { if (root.isConnected) settle(); }, () => {});
};

/** 收：父层 <Transition :css="false" @leave> 调它。先读此刻的样子（开到一半就关也是从此刻原路收）。 */
export const leaveSheet = (el: Element, done: () => void) => {
  const root = el as HTMLElement;
  const name = root.dataset.sheetName ?? '';
  const panel = root.querySelector<HTMLElement>('.sheet-panel');
  const body = root.querySelector<HTMLElement>('.sheet-body');
  const veil = root.querySelector<HTMLElement>('.sheet-veil');
  if (!panel || lessMotion()) { showSource(name); done(); return; }
  root.style.pointerEvents = 'none';
  const style = getComputedStyle(panel);
  const now = { transform: style.transform, clipPath: style.clipPath };
  const seen = visibleWindow(panel);
  const bodyNow = body ? Number(getComputedStyle(body).opacity) : 1;
  const veilNow = veil ? Number(getComputedStyle(veil).opacity) : 1;
  for (const animation of root.getAnimations({ subtree: true })) animation.cancel();
  panel.querySelectorAll('[data-sheet-replica]').forEach((node) => node.remove());
  const final = rectOf(panel);
  const source = sheetSource(name);
  const timing = { duration: SHEET_MS, easing: OPEN_EASE, fill: 'forwards' as const };
  if (veil) exemptFromSettle(veil.animate(sheetVeilOut(veilNow), { ...timing, easing: 'linear' }));
  if (body) exemptFromSettle(body.animate([{ opacity: bodyNow }, { opacity: 0, offset: 0.3 }, { opacity: 0 }], { ...timing, easing: 'linear' }));
  let flight: Animation;
  if (source) {
    const to = rectOf(source);
    const frames = dialogWindowFrames(seen, to, final, sheetRadius(to, radiusOf(source)));
    // 第一帧接着此刻的样子（`none` 和 inset() 插不了值，开好的卡没有裁切就用形变自己的第一帧）。
    frames[0] = { ...frames[0], transform: now.transform, ...(now.clipPath === 'none' ? {} : { clipPath: now.clipPath }) };
    attachReplica(panel, source, SHEET_REPLICA_IN, SHEET_MS);
    flight = exemptFromSettle(panel.animate(frames, timing));
  } else {
    flight = exemptFromSettle(panel.animate([{ transform: now.transform, opacity: 1 }, { transform: 'scale(.96)', opacity: 0 }], { ...timing, duration: paced(220) }));
  }
  // 落地那一帧：真胶囊露出来、拷贝和大卡一起撤掉。
  const end = () => { showSource(name); done(); };
  flight.finished.then(end, end);
};
