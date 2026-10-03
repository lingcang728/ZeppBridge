/**
 * 卡片 ↔ 整页的「窗口」形变的几何（2026-10-03 起和设置卡叠同一种做法，见 composables/usePageMorph.ts）：
 *
 * - **从哪里来回哪里去**：窗口从那张卡的矩形长出来，收回时落回同一张卡的矩形，宽高比一路从卡变成页。
 * - **轻微的抛物线**：竖直方向先走、水平方向稍晚（关键帧中点竖直走了六成多、水平刚过一半），
 *   窗口的中心走的是一段弧，而不是直线平移。曲线先快后慢、没有回弹（ColorOS 17 录屏逐帧看过）。
 * - **窗口里是真的新页**，1:1 不缩放：页面的左上角跟着窗口从卡的左上角滑到原位，页头天然落在卡所在处，
 *   像设置大卡的卡头；卡的拷贝叠在上面跟着走、淡掉（lib/motion/replica.ts）。垫底和拷贝都是页面的子元素，
 *   一道裁切动画管三样（pageBackdrop）。
 *
 * **clip-path 的圆角在一段动画里必须是同一个值**（2026-10-01 在 Chrome / WebView2 154 上实测）：
 * inset() 的四边怎么变、关键帧有几个都能交给合成器，但只要 round 的半径在关键帧之间变了，整段动画就退回
 * 主线程——新页挂载占着主线程时窗口就停在原地、等主线程空了再一下跳过去。所以整段只用卡那一端的圆角；
 * 整页那一端（圆角 0）把裁切矩形往外多放一个圆角半径，圆弧落到板外面，四个角自然就方了，不用改半径。
 *
 * 逐帧改的只有 transform / clip-path（定圆角）/ opacity，见记忆「动效只动合成属性」。
 */

export interface WindowRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

const r2 = (value: number) => Number(value.toFixed(2));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** `rect` 在 `frame` 上的 inset 裁切（纯函数，方便测）。`bleed`：矩形比板大时允许负的 inset（往板外伸）。 */
export function windowInset(rect: WindowRect, frame: WindowRect, radius: number, bleed = false): string {
  const clamp = (value: number) => (bleed ? value : Math.max(0, value));
  const top = clamp(rect.top - frame.top);
  const left = clamp(rect.left - frame.left);
  const right = clamp(frame.left + frame.width - (rect.left + rect.width));
  const bottom = clamp(frame.top + frame.height - (rect.top + rect.height));
  return `inset(${r2(top)}px ${r2(right)}px ${r2(bottom)}px ${r2(left)}px round ${r2(radius)}px)`;
}

/**
 * 整段形变用的那一个圆角：卡那一端的圆角（另一端是整页、圆角 0 时）；两端都是卡（设置的小卡 ↔ 大卡）时
 * 取小的那一端——形变落在小卡上时要严丝合缝地接上真卡，大卡那一端有交叉淡入盖着。纯函数，方便测。
 */
export function steadyRadius(from: WindowRect, fromRadius: number, to: WindowRect, toRadius: number): number {
  if (fromRadius <= 0) return Math.max(0, toRadius);
  if (toRadius <= 0) return fromRadius;
  return from.width * from.height <= to.width * to.height ? fromRadius : toRadius;
}

/** 圆角为 0 的那一端：矩形往外多放一个圆角半径，圆弧落到板外，四个角就是方的。 */
export function bleedRect(rect: WindowRect, radius: number): WindowRect {
  return { left: rect.left - radius, top: rect.top - radius, width: rect.width + radius * 2, height: rect.height + radius * 2 };
}

/** 弧线的中点：竖直方向走得快一些（t 是中点处的整体进度）。纯函数，方便测。 */
export function arcMidpoint(from: WindowRect, to: WindowRect, t = 0.5, lead = 0.14): WindowRect {
  const tv = Math.min(1, t + lead);
  return {
    left: lerp(from.left, to.left, t),
    width: lerp(from.width, to.width, t),
    top: lerp(from.top, to.top, tv),
    height: lerp(from.height, to.height, tv),
  };
}

/** 形变的关键帧位置（缓动后的进度）：0.9 那一帧窗口已经长到九成多，之后才把圆弧推出板外。 */
export const WINDOW_OFFSETS = [0, 0.5, 0.9, 1] as const;

/** 那张卡的拷贝（带着祖先、身后的底和此刻的样子，和真卡一个像素都不差）：见 lib/motion/replica.ts。 */
export { cardReplica } from './replica';

/** 窗口形变的一个时刻：屏幕上看得见的矩形，以及页面（或卡拷贝）左上角此刻在屏幕上的位置。 */
export interface WindowPose {
  rect: WindowRect;
  anchor: { x: number; y: number };
}

/** WINDOW_OFFSETS 各关键帧上，水平 / 竖直方向各走了多少（竖直先走：弧线）。和 windowRects 一一对应。 */
const PROGRESS: ReadonlyArray<readonly [number, number]> = [[0, 0], [0.5, 0.64], [0.94, 0.96], [1, 1]];

/**
 * 窗口在 WINDOW_OFFSETS 各关键帧上的矩形和锚点（纯函数，方便测）。矩形和锚点按同一组进度插值：
 * 页面、垫在它下面的底板、叠在上面的卡拷贝都用这一组，三层逐帧严丝合缝。
 */
export function windowPoses(from: WindowPose, to: WindowPose): WindowPose[] {
  return PROGRESS.map(([px, py]) => ({
    rect: {
      left: lerp(from.rect.left, to.rect.left, px),
      width: lerp(from.rect.width, to.rect.width, px),
      top: lerp(from.rect.top, to.rect.top, py),
      height: lerp(from.rect.height, to.rect.height, py),
    },
    anchor: { x: lerp(from.anchor.x, to.anchor.x, px), y: lerp(from.anchor.y, to.anchor.y, py) },
  }));
}

/**
 * 垫在形变中页面底下的底：页面本身是透明的，没有它，窗口里会透出正在退后的来处页。
 *
 * 它是**页面自己的子元素**（层次 -1），和页面内容、卡拷贝吃同一道 clip-path 动画。以前底板是另一块 fixed 的板、
 * 自己做一条一样的裁切动画：那条动画上不了合成器（2026-10-03 无头 Chrome 逐帧：页面已经滑出去一大截，
 * 板还停在卡上），新页挂载一占主线程它就停住——改前录屏里「一下变成整屏黑板」也是它。
 *
 * 范围是页面的盒子并上整个可视区（四边各多放一个圆角半径）：形变途中窗口始终落在它里面。
 * 底色分两层：实色 --canvas 铺满；环境光 --ambient 按 `glow`（应用骨架，即 .app-body::before 那一块）的大小和
 * 位置摆——光晕是按盒子大小算的，摆错了落地那一帧颜色会跳。
 */
export function pageBackdrop(page: HTMLElement, box: WindowRect, view: WindowRect, glow: WindowRect, radius: number): HTMLElement {
  const bleed = bleedRect(view, radius);
  const left = Math.min(0, bleed.left - box.left);
  const top = Math.min(0, bleed.top - box.top);
  const right = Math.max(box.width, bleed.left + bleed.width - box.left);
  const bottom = Math.max(box.height, bleed.top + bleed.height - box.top);
  const backdrop = document.createElement('div');
  backdrop.setAttribute('aria-hidden', 'true');
  backdrop.dataset.morphLayer = '';
  Object.assign(backdrop.style, {
    position: 'absolute',
    left: `${r2(left)}px`,
    top: `${r2(top)}px`,
    width: `${r2(right - left)}px`,
    height: `${r2(bottom - top)}px`,
    zIndex: '-1',
    pointerEvents: 'none',
    background: 'var(--canvas)',
  });
  const ambient = document.createElement('div');
  Object.assign(ambient.style, {
    position: 'absolute',
    left: `${r2(glow.left - box.left - left)}px`,
    top: `${r2(glow.top - box.top - top)}px`,
    width: `${r2(glow.width)}px`,
    height: `${r2(glow.height)}px`,
    background: 'var(--ambient)',
  });
  backdrop.appendChild(ambient);
  page.appendChild(backdrop);
  return backdrop;
}
