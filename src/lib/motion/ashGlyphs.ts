import { REVEAL_MS } from './timing';

/** 换语言「响指」的取样：把可视区的旧文字和图表线条变成一粒粒灰（lib/motion/ashSwitch.ts）。 */

/** 灰粒寿命：圆扫过以后再各自飘一阵。 */
export const LIFE_MIN = 600;
export const LIFE_SPAN = 500;
/** 灰粒上限：超过就按网格隔点取样。 */
export const MAX_GRAINS = 36000;
/** 像素多实才算墨：图表要更实（面积填充是半透明渐变，只取线条）。 */
export const TEXT_INK = 48;
export const CHART_INK = 150;

/** OPEN_EASE（cubic-bezier(.4, .6, .2, 1)）的反函数：圆的半径走到 y（0–1）时，时间走到了几成。 */
const bezier = (p1: number, p2: number) => (s: number) => 3 * (1 - s) * (1 - s) * s * p1 + 3 * (1 - s) * s * s * p2 + s * s * s;
const bx = bezier(0.4, 0.2);
const by = bezier(0.6, 1);
const timeAt = (y: number) => {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 22; i += 1) {
    const mid = (lo + hi) / 2;
    if (by(mid) < y) lo = mid;
    else hi = mid;
  }
  return bx((lo + hi) / 2);
};

export type AshOrigin = { x: number; y: number };

/* ── 取字形 ─────────────────────────────── */

const LETTER = /\p{L}/u;
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'OPTION', 'TITLE']);

type Paint = { font: string; color: string; spacing: string; transform: string; clip: DOMRect | null };

/** 把可视区里看得见的文字按原样画到一张 CSS 像素大小的画布上。 */
export const drawVisibleText = (width: number, height: number): CanvasRenderingContext2D | null => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.textBaseline = 'alphabetic';
  // 浏览器预览里界面缩放走根元素的 CSS zoom：位置量到的是缩放后的，字号要自己乘上。桌面端走 webview 原生缩放，这里是 1。
  const zoom = Number.parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
  const styles = new Map<Element, Paint | null>();
  const paintOf = (el: Element): Paint | null => {
    if (styles.has(el)) return styles.get(el)!;
    let paint: Paint | null = null;
    const visible = typeof el.checkVisibility === 'function'
      ? el.checkVisibility({ opacityProperty: true, visibilityProperty: true })
      : true;
    if (visible && !el.closest('[data-ash-skip]')) {
      const cs = getComputedStyle(el);
      const size = Number.parseFloat(cs.fontSize) * zoom;
      if (size > 0 && cs.color !== 'rgba(0, 0, 0, 0)' && cs.color !== 'transparent') {
        const clips = cs.overflowX !== 'visible' || cs.overflowY !== 'visible';
        paint = {
          font: `${cs.fontStyle} ${cs.fontWeight} ${size}px ${cs.fontFamily}`,
          color: cs.color,
          spacing: cs.letterSpacing === 'normal' ? '0px' : `${Number.parseFloat(cs.letterSpacing) * zoom}px`,
          transform: cs.textTransform,
          clip: clips ? el.getBoundingClientRect() : null,
        };
      }
    }
    styles.set(el, paint);
    return paint;
  };
  const shape = (text: string, transform: string) =>
    (transform === 'uppercase' ? text.toUpperCase() : transform === 'lowercase' ? text.toLowerCase() : text);
  const onScreen = (r: DOMRect) => r.width > 0 && r.height > 0 && r.right > 0 && r.bottom > 0 && r.left < width && r.top < height;
  const drawAt = (text: string, r: DOMRect) => {
    const m = ctx.measureText(text);
    const asc = m.fontBoundingBoxAscent || r.height * 0.8;
    const desc = m.fontBoundingBoxDescent || r.height * 0.2;
    ctx.fillText(text, r.left, r.top + (r.height - asc - desc) / 2 + asc);
  };

  const range = document.createRange();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    const raw = node.data;
    // 只有带字的才化灰：纯数字、日期、符号换了语言也还是那个样子，碎掉再原样出现反而怪。
    if (!LETTER.test(raw)) continue;
    const el = node.parentElement;
    if (!el || SKIP_TAGS.has(el.tagName)) continue;
    range.selectNodeContents(node);
    const rects = [...range.getClientRects()].filter(onScreen);
    if (!rects.length) continue;
    const paint = paintOf(el);
    if (!paint) continue;
    ctx.save();
    if (paint.clip) {
      ctx.beginPath();
      ctx.rect(paint.clip.left, paint.clip.top, paint.clip.width, paint.clip.height);
      ctx.clip();
    }
    ctx.font = paint.font;
    ctx.fillStyle = paint.color;
    ctx.letterSpacing = paint.spacing;
    if (range.getClientRects().length === 1) {
      // 一行：整段画在那一行的位置上（开头被折叠掉的空白不占位置）。
      drawAt(shape(raw.replace(/\s+/g, ' ').trim(), paint.transform), rects[0]!);
    } else {
      // 折行的段落：逐字量位置（只有这种节点才逐字量，量一次就是一次排版查询）。
      for (let i = 0; i < raw.length && i < 2000; i += 1) {
        const ch = raw[i]!;
        if (!ch.trim()) continue;
        range.setStart(node, i);
        range.setEnd(node, i + 1);
        const r = range.getBoundingClientRect();
        if (onScreen(r)) drawAt(shape(ch, paint.transform), r);
      }
    }
    ctx.restore();
  }
  range.detach();
  return ctx;
};


/** 小于这个尺寸的 SVG 是图标（换语言前后一模一样，碎掉再原样出现反而怪），不取。 */
const CHART_MIN_W = 120;
const CHART_MIN_H = 48;

const visibleBox = (el: Element, width: number, height: number): DOMRect | null => {
  const r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0 || r.right <= 0 || r.bottom <= 0 || r.left >= width || r.top >= height) return null;
  if (typeof el.checkVisibility === 'function' && !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return null;
  return r;
};

/** polyline 的 points 换成 path 的 d。 */
const pathData = (el: SVGElement): string | null => {
  if (el instanceof SVGPathElement) return el.getAttribute('d');
  const n = el.getAttribute('points')?.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi);
  if (!n || n.length < 4) return null;
  let d = `M${n[0]} ${n[1]}`;
  for (let i = 2; i + 1 < n.length; i += 2) d += ` L${n[i]} ${n[i + 1]}`;
  return d;
};

/**
 * 看得见的图表线条画到一张同尺寸的画布上：SVG 图表（概览的心率、趋势线）按屏幕坐标重描它们的描边，
 * Canvas 图表（ECharts）直接 drawImage。只取描边：面积填充是半透明渐变，碎成灰是一片雾。
 */
export const drawCharts = (width: number, height: number, skip: HTMLCanvasElement | null): CanvasRenderingContext2D | null => {
  let ctx: CanvasRenderingContext2D | null = null;
  const surface = () => {
    if (ctx) return ctx;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    ctx = canvas.getContext('2d', { willReadFrequently: true });
    return ctx;
  };
  for (const source of document.querySelectorAll('canvas')) {
    if (source === skip || !source.width || source.closest('[data-ash-skip]')) continue;
    const r = visibleBox(source, width, height);
    if (!r || !surface()) continue;
    try {
      ctx!.drawImage(source, r.left, r.top, r.width, r.height);
    } catch {
      // 读不了的画布跳过：它跟着涟漪直接换。
    }
  }
  for (const svg of document.querySelectorAll('svg')) {
    if (svg.closest('[data-ash-skip]')) continue;
    const box = visibleBox(svg, width, height);
    if (!box || box.width < CHART_MIN_W || box.height < CHART_MIN_H) continue;
    for (const el of svg.querySelectorAll<SVGGeometryElement>('path, polyline')) {
      const cs = getComputedStyle(el);
      if (cs.stroke === 'none' || cs.display === 'none' || cs.visibility === 'hidden') continue;
      const d = pathData(el);
      const matrix = el.getScreenCTM();
      const sw = Number.parseFloat(cs.strokeWidth) || 0;
      if (!d || !matrix || sw <= 0 || !surface()) continue;
      const path = new Path2D();
      path.addPath(new Path2D(d), matrix);
      const scale = cs.vectorEffect === 'non-scaling-stroke' ? 1 : Math.sqrt(Math.abs(matrix.a * matrix.d - matrix.b * matrix.c));
      const g = ctx!;
      g.save();
      g.beginPath();
      g.rect(box.left, box.top, box.width, box.height);
      g.clip();
      g.strokeStyle = cs.stroke;
      g.globalAlpha = (Number.parseFloat(cs.strokeOpacity) || 1) * (Number.parseFloat(cs.opacity) || 1);
      g.lineWidth = sw * scale;
      g.lineCap = cs.strokeLinecap as CanvasLineCap;
      g.lineJoin = cs.strokeLinejoin as CanvasLineJoin;
      if (cs.strokeDasharray !== 'none') g.setLineDash(cs.strokeDasharray.split(/[\s,]+/).map((v) => Number.parseFloat(v) * scale));
      g.stroke(path);
      g.restore();
    }
  }
  return ctx;
};

export type Grains = { data: Float32Array; count: number; size: number };

/** 文字和图表的像素 → 灰粒：位置、颜色、两枚随机数、起飞时刻和寿命（每粒 10 个 float）。 */
export const grainsOf = (
  layers: Array<[CanvasRenderingContext2D | null, number]>,
  width: number,
  height: number,
  origin: AshOrigin,
  reach: number,
): Grains | null => {
  const sources = layers.flatMap(([ctx, ink]) => (ctx ? [{ data: ctx.getImageData(0, 0, width, height).data, ink }] : []));
  let inked = 0;
  for (const { data, ink } of sources) for (let i = 3; i < data.length; i += 4) if (data[i]! > ink) inked += 1;
  if (!inked) return null;
  const step = Math.max(1, Math.ceil(Math.sqrt(inked / MAX_GRAINS)));
  // 隔点取样落在网格上，实际取到的粒数会比 inked / step² 略多：每张来源按一行的量留余地。
  const capacity = Math.ceil(inked / (step * step) + sources.length * (width / step + 2));
  const out = new Float32Array(capacity * 10);
  let n = 0;
  for (const { data, ink } of sources) {
    for (let y = 0; y < height; y += step) {
      for (let x = 0; x < width; x += step) {
        const i = (y * width + x) * 4;
        const a = data[i + 3]!;
        if (a <= ink || n >= capacity) continue;
        const o = n * 10;
        out[o] = x + 0.5;
        out[o + 1] = y + 0.5;
        out[o + 2] = data[i]! / 255;
        out[o + 3] = data[i + 1]! / 255;
        out[o + 4] = data[i + 2]! / 255;
        out[o + 5] = a / 255;
        out[o + 6] = Math.random();
        out[o + 7] = Math.random();
        // 圆扫到这一点的时刻，往后错开一点：同一圈上的字不是齐刷刷一起碎；只往后不往前——圆还没到就先冒灰，
        // 会和还清清楚楚的原字叠在一起。
        out[o + 8] = REVEAL_MS * timeAt(Math.hypot(x - origin.x, y - origin.y) / reach) + Math.random() * 50;
        out[o + 9] = LIFE_MIN + Math.random() * LIFE_SPAN;
        n += 1;
      }
    }
  }
  return { data: out.subarray(0, n * 10), count: n, size: Math.max(1.2, step * 0.9) };
};
