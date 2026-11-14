/**
 * 界面缩放落定那一下的幽灵板：一份冻结的旧画面，盖在重排后的真页面上淡出（composables/useUiScale.ts）。
 *
 * 原生缩放生效的那一帧，真页面按新视口重排，换行、栅格列数和 transform 放大出来的近似画面不一样；
 * 直接撤 transform 就是一跳。幽灵板按旧视口宽度排版（ghostBox），所以它和放大动画最后一帧逐像素一致，
 * 再用 ZOOM_SETTLE_MS 的 opacity 淡出，底下的新排版就是「化开」出来的。只动 opacity。
 *
 * 克隆在改倍率之前做（那时滚动位置、画布内容都还是旧的），落定时才挂进文档：
 * - 挂在 <html> 上、body 外面：body 正被 transform，幽灵板不能跟着再缩一次；
 * - 滚动位置、2D 画布像素、输入框的值、正被 WAAPI 定住的样式都抄过去（cloneNode 不带这些）；
 * - CSS 动画一律暂停在终点，不然入场动画会在幽灵板里从头再放一遍（整块透明一下）；
 * - iframe / video / audio 拿掉：不重新加载、不重复出声。
 */
import { ghostBox, ZOOM_SETTLE_MS } from '../uiZoom';

const FREEZE_STYLE_ID = 'zb-zoom-ghost-style';
const FREEZE_CSS = `[data-zoom-ghost], [data-zoom-ghost] *, [data-zoom-ghost] *::before, [data-zoom-ghost] *::after {
  animation-delay: -60s !important; animation-play-state: paused !important; transition: none !important; caret-color: transparent !important;
}`;

const ensureFreezeStyle = () => {
  if (document.getElementById(FREEZE_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = FREEZE_STYLE_ID;
  style.textContent = FREEZE_CSS;
  document.head.appendChild(style);
};

/** 正被 WAAPI 定住（在放或 forwards 停着）的属性：克隆不带动画，抄成内联样式。 */
const animatedStyles = (source: Element): Array<[string, string]> => {
  const animations = source.getAnimations?.() ?? [];
  if (!animations.length) return [];
  const computed = getComputedStyle(source);
  const props = new Set<string>();
  for (const animation of animations) {
    const effect = animation.effect as KeyframeEffect | null;
    if (!effect || effect.pseudoElement || effect.target !== source) continue;
    for (const frame of effect.getKeyframes()) {
      for (const key of Object.keys(frame)) {
        if (key === 'offset' || key === 'easing' || key === 'composite' || key === 'computedOffset') continue;
        props.add(key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`));
      }
    }
  }
  return [...props].map((prop) => [prop, computed.getPropertyValue(prop)] as [string, string]).filter(([, value]) => value !== '');
};

export interface ZoomGhost {
  /** 挂进文档并开始淡出；淡完自己拆掉。 */
  reveal(): void;
  /** 没用上就丢掉（或淡到一半被打断）。 */
  dispose(): void;
}

/**
 * 在改倍率之前拍下当前画面。`ratio` = 新倍率 / 旧倍率。
 * 拍不了（没有 body）返回 null，调用方就直接落定。
 */
export const captureZoomGhost = (ratio: number): ZoomGhost | null => {
  const body = document.body;
  if (!body) return null;
  const clone = body.cloneNode(true) as HTMLElement;
  const sources = body.getElementsByTagName('*');
  const copies = clone.getElementsByTagName('*');
  const scrolls: Array<[HTMLElement, number, number]> = [];
  if (body.scrollTop || body.scrollLeft) scrolls.push([clone, body.scrollTop, body.scrollLeft]);
  const count = Math.min(sources.length, copies.length);
  for (let i = 0; i < count; i += 1) {
    const source = sources[i] as HTMLElement;
    const copy = copies[i] as HTMLElement;
    if (source.scrollTop || source.scrollLeft) scrolls.push([copy, source.scrollTop, source.scrollLeft]);
    if (source instanceof HTMLCanvasElement && copy instanceof HTMLCanvasElement) {
      try { copy.getContext('2d')?.drawImage(source, 0, 0); } catch { /* WebGL / 跨源：留空，淡出期间那一块直接是新画面 */ }
    } else if (source instanceof HTMLInputElement || source instanceof HTMLTextAreaElement) {
      (copy as HTMLInputElement).value = source.value;
    }
    for (const [prop, value] of animatedStyles(source)) copy.style.setProperty(prop, value, 'important');
  }
  for (const el of Array.from(clone.querySelectorAll('iframe, video, audio, script'))) el.remove();

  const box = ghostBox(ratio);
  clone.removeAttribute('id');
  clone.setAttribute('data-zoom-ghost', '');
  clone.setAttribute('aria-hidden', 'true');
  clone.inert = true;
  Object.assign(clone.style, {
    position: 'fixed',
    top: '0',
    left: '50%',
    right: 'auto',
    bottom: 'auto',
    width: box.width,
    height: box.height,
    minWidth: '0',
    margin: '0',
    marginLeft: box.marginLeft,
    transform: 'none',
    zIndex: '2147483647',
    pointerEvents: 'none',
    overflow: 'hidden',
  } satisfies Partial<CSSStyleDeclaration>);

  let fade: Animation | null = null;
  const dispose = () => {
    fade?.cancel();
    fade = null;
    clone.remove();
  };
  return {
    reveal() {
      ensureFreezeStyle();
      document.documentElement.appendChild(clone);
      for (const [el, top, left] of scrolls) {
        el.scrollTop = top;
        el.scrollLeft = left;
      }
      fade = clone.animate([{ opacity: 1 }, { opacity: 0 }], { duration: ZOOM_SETTLE_MS, easing: 'ease-out', fill: 'forwards' });
      fade.finished.then(() => clone.remove(), () => undefined);
    },
    dispose,
  };
};
