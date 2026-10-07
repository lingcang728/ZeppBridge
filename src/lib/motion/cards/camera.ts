/**
 * 镜头推进（精修批次 7.1 / 7.2）：往下一层时，上一层朝被点的那叠缩小退到后面、换成一份**预先模糊好的**
 * 静态拷贝；返回时原路拉回来。
 *
 * 模糊只做一次：拷贝挂上时就带着 `filter: blur()`，之后只交叉淡化两份的 opacity、一起缩放——不逐帧改 blur
 * （逐帧 blur / mask 会让风扇狂转，见动效只动合成属性的约定）。
 * 拉回时从「此刻的计算样式」起放，而不是 reverse() 旧动画：倒放一段已经放完的动画，Chromium 会闪一帧。
 */
import { CLOSE_EASE, OPEN_EASE } from '../timing';
import { reducedMotion, settled } from './spring';

const PUSH_MS = 460;
const PULL_MS = 420;
const RECEDE_SCALE = 0.82;
const BLURRED_OPACITY = 0.42;

export interface Receded {
  /** 原路拉回来（拷贝淡掉、移除，这一层恢复可点）。 */
  restore: () => Promise<void>;
  /** 不放动画，直接复原（牌桌整个关掉时用）。 */
  drop: () => void;
}

/** 让 `layer` 朝 `focus` 退到后面。`layer` 必须是定位祖先里的绝对定位层。 */
export const recedeLayer = (layer: HTMLElement, focus: DOMRect | null): Receded => {
  const box = layer.getBoundingClientRect();
  const origin = focus
    ? `${(focus.left + focus.width / 2 - box.left).toFixed(1)}px ${(focus.top + focus.height / 2 - box.top).toFixed(1)}px`
    : '50% 50%';
  const blurred = layer.cloneNode(true) as HTMLElement;
  blurred.removeAttribute('id');
  blurred.setAttribute('aria-hidden', 'true');
  blurred.inert = true;
  blurred.classList.add('is-blurred-copy');
  Object.assign(blurred.style, { pointerEvents: 'none', filter: 'blur(9px)', transformOrigin: origin, opacity: '0' });
  layer.after(blurred);
  layer.style.transformOrigin = origin;
  layer.inert = true;
  const reduced = reducedMotion();
  const shrink = reduced ? 'none' : `scale(${RECEDE_SCALE})`;
  const timing: KeyframeAnimationOptions = { duration: reduced ? 160 : PUSH_MS, easing: OPEN_EASE, fill: 'forwards' };
  let sharp = layer.animate([{ transform: 'none', opacity: 1 }, { transform: shrink, opacity: 0 }], timing);
  let soft = blurred.animate([{ transform: 'none', opacity: 0 }, { transform: shrink, opacity: BLURRED_OPACITY }], timing);

  const drop = () => {
    sharp.cancel(); soft.cancel();
    blurred.remove();
    layer.inert = false;
    layer.style.transformOrigin = '';
  };
  const restore = async () => {
    const pull: KeyframeAnimationOptions = { duration: reduced ? 160 : PULL_MS, easing: CLOSE_EASE, fill: 'forwards' };
    const now = (element: HTMLElement) => {
      const style = getComputedStyle(element);
      return { transform: style.transform === 'none' ? 'none' : style.transform, opacity: style.opacity };
    };
    const sharpFrom = now(layer);
    const softFrom = now(blurred);
    const nextSharp = layer.animate([sharpFrom, { transform: 'none', opacity: 1 }], pull);
    const nextSoft = blurred.animate([softFrom, { transform: 'none', opacity: 0 }], pull);
    sharp.cancel(); soft.cancel();
    sharp = nextSharp; soft = nextSoft;
    await settled([nextSharp, nextSoft]);
    drop();
  };
  return { restore, drop };
};
