import { drawVisibleText, timeAt, type AshOrigin } from './ashGlyphs';
import { LOCALE_REVEAL_MS } from './timing';

/**
 * 换语言涟漪里「新的那一边」怎么出现（lib/motion/ashSwitch.ts）。两件事，都只动合成属性：
 *
 * 1. **新字由糊到清**：换上新语言之后，把可视区的新字画一遍、整张模糊一次（静态的，不逐帧模糊），按到语言轮的
 *    距离切成四环，各放一张画布盖在页面上。它们在新快照里，所以只在圆里面看得见；圆扫到哪一环，那一环稍后
 *    淡掉——看上去就是新字先蒙着一层雾、再落清楚，像卡片展开时内容的渐显。底下的清楚字一直在，所以不会
 *    出现「一片空白再冒字」。
 * 2. **图表呼吸一下**：线和柱子不化灰；圆扫过图表时它轻轻糊一下再变清楚（一次 320ms 的 filter 动画，
 *    只在图表这一块上，不重画图表）。
 */

const RINGS = 4;
/** 新字那层雾有多糊（CSS 像素）。 */
const SETTLE_BLUR = 3;
/** 每一环被圆扫到以后，雾再停留多久、用多久散掉。 */
const SETTLE_HOLD = 90;
const SETTLE_FADE = 380;

type Settle = { start: () => void; dispose: () => void };

/** 画新字的雾层（换场的 update 回调里调，这时页面已经是新语言）。没有字就返回 null。 */
export const settleNewText = (
  width: number,
  height: number,
  origin: AshOrigin,
  reach: number,
  skip: HTMLCanvasElement | null,
): Settle | null => {
  const text = drawVisibleText(width, height);
  if (!text) return null;
  const canvases: HTMLCanvasElement[] = [];
  for (let ring = 0; ring < RINGS; ring += 1) {
    // 这一环：从语言轮量起的一圈圆环，按它裁出新字，再整张模糊一次。画布只取这一环和视口相交的外框，
    // 靠近语言轮的几环很小，合成的时候少铺几张整屏的层。
    const inner = (reach * ring) / RINGS;
    const outer = (reach * (ring + 1)) / RINGS;
    const left = Math.max(0, Math.floor(origin.x - outer));
    const top = Math.max(0, Math.floor(origin.y - outer));
    const right = Math.min(width, Math.ceil(origin.x + outer));
    const bottom = Math.min(height, Math.ceil(origin.y + outer));
    if (right <= left || bottom <= top) continue;
    const canvas = document.createElement('canvas');
    canvas.width = right - left;
    canvas.height = bottom - top;
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;
    ctx.translate(-left, -top);
    ctx.save();
    ctx.beginPath();
    ctx.arc(origin.x, origin.y, outer, 0, Math.PI * 2);
    if (ring > 0) ctx.arc(origin.x, origin.y, inner, 0, Math.PI * 2, true);
    ctx.clip('evenodd');
    ctx.filter = `blur(${SETTLE_BLUR}px)`;
    ctx.drawImage(text.canvas, 0, 0);
    ctx.restore();
    canvas.setAttribute('aria-hidden', 'true');
    canvas.dataset.ashSkip = '';
    canvas.dataset.ring = String(ring);
    Object.assign(canvas.style, {
      position: 'fixed', left: `${left}px`, top: `${top}px`, width: `${right - left}px`, height: `${bottom - top}px`,
      zIndex: '2147482000', pointerEvents: 'none',
    });
    if (skip) canvas.style.zIndex = String(Number(skip.style.zIndex || 0) - 1);
    document.body.appendChild(canvas);
    canvases.push(canvas);
  }
  const dispose = () => { for (const canvas of canvases) canvas.remove(); };
  return {
    start: () => {
      canvases.forEach((canvas) => {
        const ring = Number(canvas.dataset.ring);
        // 圆的边走到这一环中线的时刻。
        const at = LOCALE_REVEAL_MS * timeAt((ring + 0.5) / RINGS);
        const fade = canvas.animate([{ opacity: 1 }, { opacity: 0 }], {
          duration: SETTLE_FADE, delay: at + SETTLE_HOLD, easing: 'cubic-bezier(.4, .6, .2, 1)', fill: 'both',
        });
        fade.finished.then(() => canvas.remove(), () => canvas.remove());
      });
    },
    dispose,
  };
};

/** 小于这个尺寸的 SVG 是图标，不呼吸。 */
const CHART_MIN_W = 120;
const CHART_MIN_H = 48;

/** 圆扫到每张图表时让它轻轻糊一下再清楚（不重画）。 */
export const breatheCharts = (
  width: number,
  height: number,
  origin: AshOrigin,
  reach: number,
  skip: HTMLCanvasElement | null,
): void => {
  const charts = [...document.querySelectorAll<HTMLElement | SVGSVGElement>('canvas, svg')].filter((el) => {
    if (el === skip || el.closest('[data-ash-skip]')) return false;
    const r = el.getBoundingClientRect();
    return r.width >= CHART_MIN_W && r.height >= CHART_MIN_H && r.right > 0 && r.bottom > 0 && r.left < width && r.top < height;
  });
  for (const chart of charts) {
    const r = chart.getBoundingClientRect();
    const distance = Math.hypot(r.left + r.width / 2 - origin.x, r.top + r.height / 2 - origin.y);
    chart.animate(
      [{ filter: 'blur(0px)' }, { filter: 'blur(1.6px)', offset: 0.35 }, { filter: 'blur(0px)' }],
      { duration: 320, delay: LOCALE_REVEAL_MS * timeAt(Math.min(1, distance / reach)), easing: 'ease-in-out' },
    );
  }
};
