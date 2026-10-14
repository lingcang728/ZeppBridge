import { LOCALE_REVEAL_MS } from './timing';

/** 换语言「响指」的取样：把可视区的旧文字变成一粒粒灰（lib/motion/ashSwitch.ts）。
 *
 * 2026-10-06 起图表的线和柱子不再化灰（用户：「线和柱子不化灰，涟漪扫过时轻微模糊一次再变清晰」），
 * 只有坐标轴上的字跟着文字一起碎——SVG 图表的轴标签本来就是文本节点，TreeWalker 会取到。
 * 图表那一下「呼吸」见 ashReveal.ts。 */

/** 灰粒寿命：圆扫过以后再各自飘一阵（放慢后飘得更久、更远，收尾减速）。 */
export const LIFE_MIN = 900;
export const LIFE_SPAN = 700;
/** 灰粒上限：超过就按网格隔点取样。 */
export const MAX_GRAINS = 36000;
/** 像素多实才算墨。 */
export const TEXT_INK = 48;

/** OPEN_EASE（cubic-bezier(.4, .6, .2, 1)）的反函数：圆的半径走到 y（0–1）时，时间走到了几成。 */
const bezier = (p1: number, p2: number) => (s: number) => 3 * (1 - s) * (1 - s) * s * p1 + 3 * (1 - s) * s * s * p2 + s * s * s;
const bx = bezier(0.4, 0.2);
const by = bezier(0.6, 1);
export const timeAt = (y: number) => {
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

/**
 * 涟漪的柔边（10-12）：以前是一刀切的硬圆，两种语言排版高低不同（西语卡片多折一行、下面整排往下挪一截）时，
 * 圆边两侧的卡沿、卡底阴影错开一截，像一根斜着的条从屏幕上飞过去（用户：「断层的飞条」）。
 * 现在新语言那张快照用一圈渐隐的遮罩露出来，柔边宽约半径的 14%（140–280px）：错开的卡沿在这一圈里慢慢交融。
 * 圆的外沿从 0 长到 reach + 柔边宽；某一处「被扫到」按柔边中线算。
 */
export const featherOf = (reach: number) => Math.round(Math.min(280, Math.max(140, reach * 0.14)));
/** 柔边中线扫到离起点 distance 处的时刻（ms，相对涟漪开跑）。 */
export const sweepAt = (distance: number, reach: number) => {
  const feather = featherOf(reach);
  return LOCALE_REVEAL_MS * timeAt(Math.min(1, (distance + feather / 2) / (reach + feather)));
};

/* ── 取字形 ─────────────────────────────── */

const LETTER = /\p{L}/u;
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'OPTION', 'TITLE']);

type Paint = { font: string; color: string; spacing: string; transform: string; clip: DOMRect | null; alpha: number };

/** 把可视区里看得见的文字按原样画到一张 CSS 像素大小的画布上。`scope` 给了就只取它里面的字（盖满整屏的浮层）。 */
export const drawVisibleText = (width: number, height: number, scope: Element = document.body): CanvasRenderingContext2D | null => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.textBaseline = 'alphabetic';
  // 浏览器预览里界面缩放走根元素的 CSS zoom：位置量到的是缩放后的，字号要自己乘上。桌面端走 webview 原生缩放，这里是 1。
  const zoom = Number.parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
  const styles = new Map<Element, Paint | null>();
  /* 有效不透明度：沿祖先连乘。卡组里退到后面、压暗到 0.12 的那排卡，以前按全亮的字色画进雾层和灰里，
     换场时大卡上下冒出一排亮白的糊字（10-09 录屏「白边残影」）。 */
  const alphas = new Map<Element, number>();
  const alphaOf = (el: Element | null): number => {
    if (!el) return 1;
    const known = alphas.get(el);
    if (known !== undefined) return known;
    const value = (Number.parseFloat(getComputedStyle(el).opacity) || 0) * alphaOf(el.parentElement);
    alphas.set(el, value);
    return value;
  };
  const paintOf = (el: Element): Paint | null => {
    if (styles.has(el)) return styles.get(el)!;
    let paint: Paint | null = null;
    const visible = typeof el.checkVisibility === 'function'
      ? el.checkVisibility({ opacityProperty: true, visibilityProperty: true })
      : true;
    const alpha = visible ? alphaOf(el) : 0;
    if (visible && alpha >= 0.2 && !el.closest('[data-ash-skip]')) {
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
          alpha,
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

  /*
   * 被盖住的字不画（10-09 录屏：设置里开着「显示与语言」大卡换语言，压在它下面的卡组标题「Display and language」
   * 「Show all」也化成灰、还被画成糊字，大卡上和卡外冒出错位的白色残影；遍历这些看不见的字也拖慢了整次换场）。
   * 取字所在点的层叠列表：在它所在的那张卡（第一个包含它的元素）之前，只要有一层不透明的东西，就算被盖住。
   * 透明的点击层（.cover-hit）、玻璃浮层这类半透明的不算。
   */
  const opaque = new Map<Element, boolean>();
  const isOpaque = (el: Element) => {
    if (opaque.has(el)) return opaque.get(el)!;
    const cs = getComputedStyle(el);
    // rgb(…) 不透明；rgba(…, a) 与 color-mix 算出来的 color(srgb … / a) 看 a。
    const bg = cs.backgroundColor;
    const alpha = bg.startsWith('rgb(') ? 1 : Number(/(?:,|\/)\s*([\d.]+)\)$/.exec(bg)?.[1] ?? 0);
    const solid = (alpha >= 0.6 || cs.backgroundImage !== 'none')
      && Number.parseFloat(cs.opacity) >= 0.6;
    opaque.set(el, solid);
    return solid;
  };
  const covered = (el: Element, r: DOMRect) => {
    const x = Math.min(width - 1, Math.max(0, r.left + r.width / 2));
    const y = Math.min(height - 1, Math.max(0, r.top + r.height / 2));
    for (const hit of document.elementsFromPoint(x, y)) {
      if (hit === el || hit.contains(el)) return false;
      if (!el.contains(hit) && isOpaque(hit)) return true;
    }
    return false;
  };

  const range = document.createRange();
  const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
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
    if (covered(el, rects[0]!) && covered(el, rects[rects.length - 1]!)) continue;
    ctx.save();
    if (paint.clip) {
      ctx.beginPath();
      ctx.rect(paint.clip.left, paint.clip.top, paint.clip.width, paint.clip.height);
      ctx.clip();
    }
    ctx.font = paint.font;
    ctx.fillStyle = paint.color;
    ctx.globalAlpha = paint.alpha;
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
        out[o + 8] = sweepAt(Math.hypot(x - origin.x, y - origin.y), reach) + Math.random() * 50;
        out[o + 9] = LIFE_MIN + Math.random() * LIFE_SPAN;
        n += 1;
      }
    }
  }
  return { data: out.subarray(0, n * 10), count: n, size: Math.max(1.2, step * 0.9) };
};
