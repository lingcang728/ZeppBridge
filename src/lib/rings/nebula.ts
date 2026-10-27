/**
 * 年轮的星云：履历卡上那一小团、点进去时飞成整屏的那一团，和 /rings 舞台开场时镜头前的星海是同一种分布
 * （shapes.ts 的 fillIdle：半径 6–56 的扁球，z 压到 0.7；金黄色，暖金、琥珀、淡金三档）。
 *
 * 用固定种子，卡上和飞行层画的是同一批星；转角按墙上时钟算（`nebulaAngle()`），
 * 所以卡上那团飞起来、或者缩回卡上时，交接那一帧两边的星一颗不差。
 * 投影照舞台的相机：镜头在 z = 110、垂直视角 60°——星云半径画成舞台高度的 0.441 倍时，正好叠在舞台开场第一帧上。
 */
export const NEBULA_RADIUS = 56;
const CAMERA = 110;
/** 舞台开场第一帧里星云的半径 / 舞台高度：56 / (110 · tan 30°) / 2。 */
export const STAGE_NEBULA_RATIO = NEBULA_RADIUS / (CAMERA * Math.tan(Math.PI / 6)) / 2;
/** 每秒转多少弧度（舞台里环境星一秒 0.025，这里小一号的要看得出在动，快一倍）。 */
const SPIN = 0.05;

export interface Nebula { count: number; pos: Float32Array; tone: Uint8Array; light: Float32Array }

const random = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

let shared: Nebula | null = null;
/** 全应用一份（卡片和飞行层共用）。 */
export function nebula(): Nebula {
  if (shared) return shared;
  const count = 1500;
  const next = random(2026);
  const pos = new Float32Array(count * 3);
  const tone = new Uint8Array(count);
  const light = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const r = 6 + next() * 50;
    const t = next() * Math.PI * 2;
    const p = Math.acos(2 * next() - 1);
    pos[i * 3] = r * Math.sin(p) * Math.cos(t);
    pos[i * 3 + 1] = r * Math.sin(p) * Math.sin(t);
    pos[i * 3 + 2] = r * Math.cos(p) * 0.7;
    light[i] = 0.45 + next() * 0.5;
    const roll = next();
    tone[i] = roll > 0.72 ? 1 : roll > 0.3 ? 0 : 2;
  }
  shared = { count, pos, tone, light };
  return shared;
}

export const nebulaAngle = (now = performance.now()) => (now / 1000) * SPIN;

/* 每种颜色一张发光点的小贴图（和 fillIdle 的三档一样），画的时候只调透明度。 */
/* 星云是金黄的（用户 2026-10-27：「应该是黄色的，像一团星云」）：暖金、琥珀、淡金三档。 */
const TONES = ['255,204,112', '255,164,70', '255,234,180'];
let sprites: HTMLCanvasElement[] | null = null;
const spriteSet = () => sprites ??= TONES.map(rgb => {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 32;
  const ctx = canvas.getContext('2d')!;
  const glow = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  glow.addColorStop(0, `rgba(${rgb},1)`);
  glow.addColorStop(0.18, `rgba(${rgb},.85)`);
  glow.addColorStop(0.45, `rgba(${rgb},.18)`);
  glow.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 32, 32);
  return canvas;
});

export interface NebulaView { cx: number; cy: number; radius: number; angle: number; alpha?: number }

/** 把星云画到 `ctx` 上（CSS 像素坐标，调用方自己处理 DPR）。`radius`：星云最外一圈在屏幕上的半径。 */
export function drawNebula(ctx: CanvasRenderingContext2D, view: NebulaView) {
  const { count, pos, tone, light } = nebula();
  const images = spriteSet();
  const k = view.radius / NEBULA_RADIUS;
  const cos = Math.cos(view.angle), sin = Math.sin(view.angle);
  // 点的大小跟着星云的尺寸走，但小卡上不至于糊成一片、整屏时也不至于成了大圆斑；
  // 小卡上一千多颗挤在一起，叠加混合会把中心烧成一团白，按尺寸压暗。
  const base = Math.min(3.2, Math.max(1.8, k * 0.6));
  const alpha = (view.alpha ?? 1) * Math.min(1, Math.max(0.38, k / 3.5));
  // 中心一层很淡的暖光：舞台上是泛光（bloom）给的，2D 里补一层。
  const core = ctx.createRadialGradient(view.cx, view.cy, 0, view.cx, view.cy, view.radius * 0.55);
  core.addColorStop(0, `rgba(255,214,150,${0.16 * alpha})`);
  core.addColorStop(1, 'rgba(255,214,150,0)');
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = core;
  ctx.fillRect(view.cx - view.radius, view.cy - view.radius, view.radius * 2, view.radius * 2);
  for (let i = 0; i < count; i++) {
    const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
    const xr = x * cos + z * sin;
    const zr = -x * sin + z * cos;
    const near = CAMERA / (CAMERA - zr);
    const size = base * near;
    ctx.globalAlpha = Math.min(1, light[i] * alpha * near);
    ctx.drawImage(images[tone[i]], view.cx + xr * k * near - size, view.cy - y * k * near - size, size * 2, size * 2);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

/** 深空：以星云为圆心、半径 `space` 的软边圆。卡上的星云也画一圈（半径是星云的 1.15 倍）——
    飞行层缩回卡上时最后一帧就是它，两边像素对得上。 */
export const SPACE_RATIO = 1.15;
export function drawSpace(ctx: CanvasRenderingContext2D, cx: number, cy: number, space: number) {
  const edge = Math.max(24, space * 0.18);
  const fill = ctx.createRadialGradient(cx, cy, Math.max(0, space - edge), cx, cy, space);
  fill.addColorStop(0, '#050510');
  fill.addColorStop(1, 'rgba(5,5,16,0)');
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(cx, cy, space, 0, Math.PI * 2);
  ctx.fill();
  return space - edge;
}

/** 让 canvas 的像素尺寸跟上它的 CSS 尺寸和 DPR，返回 CSS 宽高。 */
export function fitCanvas(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) {
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  const width = canvas.clientWidth, height = canvas.clientHeight;
  if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
  }
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  return { width, height };
}
