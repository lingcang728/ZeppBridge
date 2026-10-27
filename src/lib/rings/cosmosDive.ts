/**
 * 履历卡 ↔ 年轮页的「进星云」过场（用户 2026-10-27：从小星云展开成大星云，界面逐渐过渡成宇宙，然后逐渐进入星云）。
 *
 * 一块盖在整个窗口上的 2D 画布，不接指针：
 * - **进去**：卡上那团星云飞起来，一边长大一边移到舞台中间；它四周的深空跟着一圈圈铺开，把界面盖成宇宙，
 *   远处的背景星慢慢亮起。长到舞台开场第一帧的大小时，等舞台说一声「画好了」（`stageReady()`），
 *   画布淡掉，底下正好是同一片星海，舞台的镜头接着往里飞。
 * - **回来**：反过来——深空先盖上年轮页，星云从舞台缩回卡上那一格，深空收进星云里，最后一帧就是卡上的那团。
 *
 * 换页本身还是路由的普通切页，在画布底下进行；终点（舞台、卡上的星云）每帧现找，页面晚挂上也能跟上。
 */
import { drawNebula, drawSpace, fitCanvas, nebulaAngle, SPACE_RATIO, STAGE_NEBULA_RATIO } from './nebula';
import { lessMotion } from '../motion/lessMotion';

const GROW_MS = 1150;
const WAIT_MS = 1500;
const FADE_MS = 700;
const SHRINK_MS = 1000;
const LAND_MS = 200;
const inOutCubic = (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** 尺寸按比例插值：从 70px 长到 300px，每一帧看上去长得一样快（线性插值会前快后慢）。 */
const grow = (a: number, b: number, t: number) => a * (b / a) ** t;

export interface NebulaSpot { cx: number; cy: number; radius: number }

let current: { stop: () => void } | null = null;
let arrival: (() => void) | null = null;
let diving = false;

/** 舞台问：是不是刚从卡上飞进来（是的话要从头放开场）。 */
export const diveActive = () => diving;
/** 舞台画好第一帧以后调用。 */
export const stageReady = () => { const done = arrival; arrival = null; done?.(); };

/** 舞台开场第一帧里那团星云在屏幕上的位置。舞台还没挂上就按窗口正中估。 */
const stageSpot = (): NebulaSpot => {
  const el = document.querySelector<HTMLElement>('.rings-stage .stage-canvas');
  const box = el?.getBoundingClientRect();
  if (box && box.width > 0) return { cx: box.left + box.width / 2, cy: box.top + box.height / 2, radius: box.height * STAGE_NEBULA_RATIO };
  return { cx: innerWidth / 2, cy: innerHeight / 2, radius: Math.min(innerWidth, innerHeight) * 0.38 };
};
/** 卡上那团星云的位置（卡还没挂上返回 null）。 */
export const cardSpot = (): NebulaSpot | null => {
  const el = document.querySelector<HTMLCanvasElement>('[data-rings-nebula]');
  const box = el?.getBoundingClientRect();
  return box && box.width > 0 ? { cx: box.left + box.width / 2, cy: box.top + box.height / 2, radius: box.width * Number(el!.dataset.ringsNebula) } : null;
};

/** 背景星：撒在整个窗口上，和舞台 1.7 号的远景星差不多稀。 */
const scatter = (count: number) => Array.from({ length: count }, () => ({ x: Math.random(), y: Math.random(), a: 0.25 + Math.random() * 0.45, warm: Math.random() > 0.9 }));

function overlay() {
  current?.stop();
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;z-index:2147483000;pointer-events:none';
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d')!;
  const stars = scatter(260);
  let frame = 0;
  const stop = () => {
    cancelAnimationFrame(frame); canvas.remove();
    if (current?.stop === stop) current = null;
  };
  current = { stop };
  /** 画一帧：深空是以星云为圆心、半径 `space` 的软边圆；`starsAlpha` 是背景星的亮度。 */
  const paint = (spot: NebulaSpot, space: number, starsAlpha: number) => {
    const { width, height } = fitCanvas(canvas, ctx);
    ctx.clearRect(0, 0, width, height);
    const solid = drawSpace(ctx, spot.cx, spot.cy, space);
    if (starsAlpha > 0) {
      for (const star of stars) {
        const x = star.x * width, y = star.y * height;
        // 只亮在深空里面：还没铺到的地方不该有星。
        if (Math.hypot(x - spot.cx, y - spot.cy) > solid) continue;
        ctx.globalAlpha = star.a * starsAlpha;
        ctx.fillStyle = star.warm ? '#ffe2b0' : '#d6e2ff';
        ctx.fillRect(x, y, 1.2, 1.2);
      }
      ctx.globalAlpha = 1;
    }
    drawNebula(ctx, { ...spot, angle: nebulaAngle() });
  };
  const run = (step: (now: number) => boolean) => {
    // 用 performance.now() 而不是 rAF 给的帧时间：起点也是它量的，两边同一把尺子。
    const tick = () => { if (step(performance.now())) frame = requestAnimationFrame(tick); else stop(); };
    frame = requestAnimationFrame(tick);
  };
  return { canvas, paint, run, stop };
}

/** 进去：从卡上那团（`from`）长成舞台开场时的那一大团。 */
export function diveIn(from: NebulaSpot, onLift?: () => void) {
  if (lessMotion()) return;
  const { canvas, paint, run } = overlay();
  diving = true;
  let arrived: number | null = null;
  arrival = () => { arrived ??= performance.now(); };
  const start = performance.now();
  const diagonal = Math.hypot(innerWidth, innerHeight);
  onLift?.();
  run(now => {
    const t = now - start;
    const g = inOutCubic(clamp01(t / GROW_MS));
    const to = stageSpot();
    const spot = { cx: lerp(from.cx, to.cx, g), cy: lerp(from.cy, to.cy, g), radius: grow(from.radius, to.radius, g) };
    // 深空比星云先铺开一步：前八成时间里从星云边铺满整个窗口。
    const space = lerp(from.radius * SPACE_RATIO, diagonal * 1.2, inOutCubic(clamp01(t / (GROW_MS * 0.8))));
    paint(spot, space, clamp01((t - GROW_MS * 0.35) / (GROW_MS * 0.5)));
    if (t < GROW_MS) return true;
    const fadeFrom = Math.max(start + GROW_MS, arrived ?? (t > GROW_MS + WAIT_MS ? now : Infinity));
    if (!Number.isFinite(fadeFrom)) return true;
    const f = clamp01((now - fadeFrom) / FADE_MS);
    canvas.style.opacity = String(1 - inOutCubic(f));
    if (f < 1) return true;
    diving = false; arrival = null;
    return false;
  });
}

/** 回来：从舞台（`from`，离开前量好的）缩回卡上那一格。卡要等履历页挂上才找得到，找不到就缩到窗口正中淡掉。 */
export function diveOut(from: NebulaSpot) {
  if (lessMotion()) return;
  const { canvas, paint, run } = overlay();
  diving = false; arrival = null;
  const start = performance.now();
  const diagonal = Math.hypot(innerWidth, innerHeight);
  let target: NebulaSpot | null = null;
  run(now => {
    const t = now - start;
    target = cardSpot() ?? target;
    const to = target ?? { cx: innerWidth / 2, cy: innerHeight / 2, radius: 24 };
    const g = inOutCubic(clamp01(t / SHRINK_MS));
    const spot = { cx: lerp(from.cx, to.cx, g), cy: lerp(from.cy, to.cy, g), radius: grow(from.radius, to.radius, g) };
    // 深空先在前两成时间里从舞台四周盖满，后面跟着星云一起收回去，收在星云边上。
    const cover = inOutCubic(clamp01(t / (SHRINK_MS * 0.2)));
    const space = lerp(diagonal * 1.2, to.radius * SPACE_RATIO, inOutCubic(clamp01((t - SHRINK_MS * 0.2) / (SHRINK_MS * 0.8))));
    canvas.style.opacity = String(cover);
    paint(spot, space, 1 - g);
    if (t < SHRINK_MS) return true;
    const f = clamp01((t - SHRINK_MS) / LAND_MS);
    canvas.style.opacity = String(1 - f);
    return f < 1;
  });
}
