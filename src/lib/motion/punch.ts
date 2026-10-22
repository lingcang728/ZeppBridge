/**
 * 落定的那一拳：年轮舞台「拳击式切换」的 DOM 版（用户 2026-10-22：「这是我最得意的设计，合理地扩大到全局」）。
 *
 * 舞台里换年份是「先收缩、再弹开过冲、冲击波、镜头一抖」（lib/rings/lumina/engine.ts）；页面上的东西到位时
 * 补一下同样的手感：先往里缩一点、往下沉一点，再 easeOutBack 似地弹回来、过冲一点点，最后落定。
 * 可选一圈从元素边缘扩散出去的描边（冲击波）。
 *
 * 只在「到位」的那一刻用，而且要克制：弹窗展开到位、卡片 ⇄ 页面形变落地、切页落定。悬停、滚动、输入都不加。
 *
 * 只动 `scale` / `translate` 这两个独立属性（不碰 `transform`）：和元素上已有的 transform 动画（弹窗飞行、
 * 页面形变）互不覆盖。减弱动态 / 低特效时什么都不做。
 */
import { lessMotion } from './lessMotion';
import { paced } from './timing';

export interface PunchOptions {
  /** 力度，1 是弹窗那一下；整页用 0.3–0.5。 */
  strength?: number;
  /** 一圈从元素边缘扩散出去的描边。 */
  wave?: boolean;
}

const PUNCH_MS = paced(360);
const WAVE_MS = paced(560);

/** 缩放和下沉随元素大小收着点：整页缩 3% 太晃，按钮缩 3% 才看得出。 */
const amountFor = (el: HTMLElement, strength: number) => {
  const size = Math.max(el.offsetWidth, el.offsetHeight, 1);
  const big = Math.min(1, size / 900);
  return { squash: (0.045 - 0.03 * big) * strength, sink: (2 + 2 * big) * strength };
};

export function punch(el: Element | null | undefined, { strength = 1, wave = false }: PunchOptions = {}): Animation | null {
  if (!(el instanceof HTMLElement) || !el.isConnected || lessMotion()) return null;
  const { squash, sink } = amountFor(el, strength);
  const animation = el.animate([
    { scale: '1', translate: '0 0', easing: 'cubic-bezier(.4, 0, .6, 1)' },
    { scale: String(1 - squash), translate: `0 ${sink.toFixed(1)}px`, offset: 0.28, easing: 'cubic-bezier(.2, 1.4, .4, 1)' },
    { scale: String(1 + squash * 0.35), translate: `0 ${(-sink * 0.3).toFixed(1)}px`, offset: 0.66, easing: 'ease-out' },
    { scale: '1', translate: '0 0' },
  ], { duration: PUNCH_MS });
  if (wave) shockwave(el);
  return animation;
}

/** 冲击波：在元素上面叠一圈同样圆角的描边，往外扩、淡掉，放完就摘掉。挂在 body 上，不影响元素自己的排版。 */
function shockwave(el: HTMLElement) {
  const box = el.getBoundingClientRect();
  if (!box.width || !box.height) return;
  const ring = document.createElement('div');
  const radius = getComputedStyle(el).borderTopLeftRadius || '24px';
  ring.setAttribute('aria-hidden', 'true');
  ring.style.cssText = `position:fixed;left:${box.left}px;top:${box.top}px;width:${box.width}px;height:${box.height}px;`
    + `border-radius:${radius};border:1.5px solid color-mix(in srgb, var(--kintsugi, #e8c27a) 70%, transparent);`
    + 'pointer-events:none;z-index:2200;box-sizing:border-box;';
  document.body.appendChild(ring);
  const grow = 1 + Math.min(0.08, 36 / Math.max(box.width, box.height));
  const animation = ring.animate([
    { opacity: 0.55, scale: '1' },
    { opacity: 0, scale: String(grow) },
  ], { duration: WAVE_MS, easing: 'cubic-bezier(.2, .8, .3, 1)' });
  const remove = () => ring.remove();
  animation.finished.then(remove, remove);
}
