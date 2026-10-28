/**
 * 贴着按钮的玻璃浮层（components/GlassPopover.vue）的几何与手感（2026-10-28 录屏后用户拍板「胶囊形变 + 弹回」）：
 *
 * - **开 / 关是同一个窗口形变**（lib/motion/window.ts）：浮层的裁切框从按钮的矩形长到面板的矩形，圆角整段不变
 *   （22px；30px 高的胶囊、圆钮会被浏览器自动夹成半圆，所以起点就是按钮的形状，动画留在合成器上）。
 *   面板 1:1 不缩放，左上角跟着窗口从按钮的左上角滑到原位；字不会被压扁。
 * - **最后一成把裁切推出板外**（`SHADOW_BLEED`）：窗口长到九成多以后，四边越过面板、把投影也放出来——
 *   不然裁切一撤掉，投影「啪」地出现。面板自己的 border-radius 管圆角。
 * - **拖开会弹回**：越出窗口的部分按橡皮筋收着（`rubberBand`）；松手按最后一小段的速度放一根弹簧回到 0
 *   （`springBack`，带初速度的 SPRINGS.settle）；往下拖得够远、甩得够快就关掉（`shouldDismiss`）。
 *
 * 都是纯函数，方便测；DOM 那一侧留在组件里。
 */
import { springCurve, type Spring, type SpringCurve } from './cards/spring';
import { windowInset, windowPoses, WINDOW_OFFSETS, type WindowRect } from './window';

/** 浮层的圆角（和 .pop-panel 的 border-radius 一致）。 */
export const POPOVER_RADIUS = 22;
/** 最后一帧裁切框往外多放这么多：盖得住面板的投影（0 30px 60px -30px 往下最多伸 60px）。 */
export const SHADOW_BLEED = 64;

/**
 * 窗口形变的关键帧：`from` 是窗口起点（按钮的矩形，或者此刻看得见的那个框），`panel` 是面板的布局框
 * （含拖开的 translate、不含动画的 transform）。`grow` 为真时最后一帧把裁切推出板外（开）；
 * 关的时候反过来调：`from` = 面板此刻的框、`to` = 按钮。
 *
 * 面板左上角跟着窗口左上角走（transform: translate），终点那一端的锚点是面板自己的左上角。
 */
export function popoverFrames(from: WindowRect, to: WindowRect, panel: WindowRect, radius = POPOVER_RADIUS, bleed = 0): Keyframe[] {
  const poses = windowPoses({ rect: from, anchor: { x: from.left, y: from.top } }, { rect: to, anchor: { x: to.left, y: to.top } });
  const last = poses.length - 1;
  return poses.map((pose, i) => {
    const dx = pose.anchor.x - panel.left;
    const dy = pose.anchor.y - panel.top;
    const rect = i === last && bleed > 0
      ? { left: pose.rect.left - bleed, top: pose.rect.top - bleed, width: pose.rect.width + bleed * 2, height: pose.rect.height + bleed * 2 }
      : pose.rect;
    return {
      offset: WINDOW_OFFSETS[i],
      transform: `translate(${r2(dx)}px, ${r2(dy)}px)`,
      clipPath: windowInset(rect, { left: panel.left + dx, top: panel.top + dy, width: panel.width, height: panel.height }, radius, true),
    };
  });
}

/** 面板开好以后（没有裁切）看得见的那个框：整块面板往外放 SHADOW_BLEED，关的时候从这里收（投影先跟着收进来）。 */
export const bleedInset = (bleed = SHADOW_BLEED, radius = POPOVER_RADIUS): string =>
  `inset(${-bleed}px ${-bleed}px ${-bleed}px ${-bleed}px round ${radius}px)`;

/** 按钮此刻还看得见（连着、有盒子、和视口相交）才能缩回去；看不见就在原地缩小淡出。 */
export function reachable(rect: WindowRect | null, view: { width: number; height: number }): rect is WindowRect {
  if (!rect || rect.width <= 0 || rect.height <= 0) return false;
  return rect.left + rect.width > 0 && rect.top + rect.height > 0 && rect.left < view.width && rect.top < view.height;
}

const r2 = (value: number) => Number(value.toFixed(2));

/* ---------- 拖 ---------- */

/** 橡皮筋：越界 `over` 像素只显示 `over / (1 + over / c)`——越拉越沉，最多逼近 c。正负对称。 */
export const rubberBand = (over: number, c = 120): number => {
  const a = Math.abs(over);
  return Math.sign(over) * (a / (1 + a / c));
};

/** 一个轴上的跟手位置：`raw` 是手指拖出来的偏移，[min, max] 是面板整块留在窗口里允许的偏移；越出去的部分走橡皮筋。 */
export const elastic = (raw: number, min: number, max: number, c = 120): number => {
  if (raw < min) return min + rubberBand(raw - min, c);
  if (raw > max) return max + rubberBand(raw - max, c);
  return raw;
};

export interface DragSample { t: number; x: number; y: number }

/**
 * 松手时的速度（px/ms）：取最后 `window` 毫秒里最早的一个点到最后一个点。点太少或间隔太短算 0。
 * `releasedAt`：松手的时刻。手指停住超过 `stale` 毫秒才松开，速度就是 0——不凭停手前的那一下冲出去。
 */
export function releaseVelocity(samples: readonly DragSample[], releasedAt = Number.NaN, window = 80, stale = 60): { x: number; y: number } {
  const end = samples[samples.length - 1];
  if (!end || releasedAt - end.t > stale) return { x: 0, y: 0 };
  let first = end;
  for (let i = samples.length - 2; i >= 0; i -= 1) {
    if (end.t - samples[i]!.t > window) break;
    first = samples[i]!;
  }
  const dt = end.t - first.t;
  if (dt < 8) return { x: 0, y: 0 };
  return { x: (end.x - first.x) / dt, y: (end.y - first.y) / dt };
}

/** 往下拖过这么远就关。 */
export const DISMISS_DISTANCE = 140;
/** 往下甩得比这快（px/ms）就关。 */
export const DISMISS_VELOCITY = 0.9;

export const shouldDismiss = (offsetY: number, velocityY: number): boolean =>
  offsetY > DISMISS_DISTANCE || velocityY > DISMISS_VELOCITY;

const springCache = new Map<string, SpringCurve>();

/**
 * 从偏移 `offset` 弹回 0 的缓动：一根从 0 走到 1 的弹簧，带上松手时沿偏移方向的初速度。
 * 归一化：进度 p = 1 − 位置/偏移，p 的初速度 = −(v·d)/|d|²（往外甩 → 先冲出去一点再回来）。
 * 没有初速度时就是 springCurve 本身。
 */
export function springBack(spring: Spring, offset: { x: number; y: number }, velocity: { x: number; y: number }, samples = 40): SpringCurve {
  const d2 = offset.x * offset.x + offset.y * offset.y;
  // px/ms → 每秒的归一化进度；夹住，免得一下极快的甩把曲线冲飞。
  const v0 = d2 < 1 ? 0 : Math.max(-24, Math.min(24, (-(velocity.x * offset.x + velocity.y * offset.y) / d2) * 1000));
  const rounded = Math.round(v0 * 4) / 4;
  if (rounded === 0) return springCurve(spring, samples);
  const key = `${spring.stiffness}/${spring.damping}/${spring.mass ?? 1}/${rounded}/${samples}`;
  const hit = springCache.get(key);
  if (hit) return hit;
  const mass = spring.mass ?? 1;
  const dt = 1 / 1000;
  const trace: number[] = [];
  let x = 0;
  let v = rounded;
  let t = 0;
  // 最多 600ms：再往后离终点不到千分之几，几十像素的偏移里看不出来（「松手 600ms 内回到 0」）。
  while (t < 0.6) {
    const a = (-spring.stiffness * (x - 1) - spring.damping * v) / mass;
    v += a * dt;
    x += v * dt;
    t += dt;
    trace.push(x);
    if (Math.abs(1 - x) < 0.001 && Math.abs(v) < 0.01) break;
  }
  const points: string[] = [];
  for (let i = 0; i <= samples; i += 1) {
    const index = Math.min(trace.length - 1, Math.round((i / samples) * (trace.length - 1)));
    const value = i === 0 ? 0 : i === samples ? 1 : trace[index]!;
    points.push(String(Math.round(value * 1000) / 1000));
  }
  const curve = { easing: `linear(${points.join(', ')})`, duration: Math.round(trace.length * dt * 1000) };
  springCache.set(key, curve);
  return curve;
}
