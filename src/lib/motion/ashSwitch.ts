import { nextTick } from 'vue';
import { ensureLocalePack, locale, setLocale, type Locale } from '../../i18n';
import { whenFramesSteady } from './steady';

/**
 * 换语言的「响指」（用户 2026-10-04 提的点子：像《复联 4》灭霸打响指，旧语言的字化成灰被风吹走，底下露出新语言）。
 *
 * 一道风从左往右扫过整屏（像刷新，用户定的方向）：风过之处，旧语言的每个字碎成灰、顺风往右上飘散，
 * 底下同一处已经是新语言；风的前沿带一条很淡的光，空白处也看得出「正在换」。
 *
 * 做法（不碰页面代码，所有页面自动生效）：
 * 1. **取字形**：换之前扫一遍可视区里看得见的文字（TreeWalker + Range 量每行 / 每个字的位置），按它们的字体、
 *    字号、颜色画到一张看不见的 2D 画布上，读出像素——灰烬就是旧文字真实的笔画，不是方块。只扫可视区，几十毫秒。
 * 2. **换场**：View Transitions 给新旧整页各拍一张（新的那张是活的）。新快照套一道从左往右推进的 inset 裁切，
 *    裁切的边就是风的前沿：前沿后面是新语言，前面仍是旧语言。只动 clip-path，合成器上跑。
 * 3. **吹散**：每个文字像素是一粒灰，交给 WebGL 一次画完（几万个点）。每粒的「起飞时刻」= 前沿扫到它的时刻，
 *    位置、透明度、大小全在顶点着色器里按时间算，CPU 每帧只更新一个时间。画布带 view-transition-name，
 *    换场期间作为独立的一层画在两张快照上面。
 *
 * 扫不到的：图表画布里的字（坐标轴多是数字和日期）、输入框里的字、图标——它们跟着前沿直接换。
 * 系统要求减少动效、内核没有 View Transitions 或 WebGL 时直接换，不放动画。
 */

/** 前沿扫过整屏的时长。灰烬再各自飘一阵（LIFE_MIN–LIFE_MAX），全程约两秒。 */
const SWEEP_MS = 1000;
const LIFE_MIN = 650;
const LIFE_SPAN = 550;
/** 灰粒上限：超过就按网格隔点取样。 */
const MAX_GRAINS = 70000;
/** 前沿的缓动（ease-in-out sine），新快照的裁切、灰粒的起飞时刻、光带三处用同一条。 */
const ease = (p: number) => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, p)));
const easeInverse = (e: number) => Math.acos(1 - 2 * Math.min(1, Math.max(0, e))) / Math.PI;

type ViewTransitionHandle = { ready: Promise<void>; finished: Promise<void>; skipTransition: () => void };
type ViewTransitionDocument = Document & { startViewTransition?: (update: () => Promise<void> | void) => ViewTransitionHandle };

/* ── 取字形 ─────────────────────────────── */

const LETTER = /\p{L}/u;
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'OPTION', 'TITLE']);

type Paint = { font: string; color: string; spacing: string; transform: string; clip: DOMRect | null };

/** 把可视区里看得见的文字按原样画到一张 CSS 像素大小的画布上。 */
const drawVisibleText = (width: number, height: number): CanvasRenderingContext2D | null => {
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

/** 画布上的文字像素 → 灰粒：位置、颜色、两枚随机数、起飞时刻和寿命（每粒 10 个 float）。 */
const grainsOf = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
  const data = ctx.getImageData(0, 0, width, height).data;
  let inked = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i]! > 48) inked += 1;
  if (!inked) return null;
  const step = Math.max(1, Math.ceil(Math.sqrt(inked / MAX_GRAINS)));
  const out = new Float32Array(Math.ceil(inked / (step * step)) * 10 + 10);
  let n = 0;
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * 4;
      const a = data[i + 3]!;
      if (a <= 48 || n * 10 + 10 > out.length) continue;
      const o = n * 10;
      out[o] = x + 0.5;
      out[o + 1] = y + 0.5;
      out[o + 2] = data[i]! / 255;
      out[o + 3] = data[i + 1]! / 255;
      out[o + 4] = data[i + 2]! / 255;
      out[o + 5] = a / 255;
      out[o + 6] = Math.random();
      out[o + 7] = Math.random();
      // 前沿扫到这一列的时刻，往后错开一点：同一列的字不是齐刷刷一起碎；只往后不往前——前沿没到就先冒灰，
      // 会和还清清楚楚的原字叠在一起。
      out[o + 8] = SWEEP_MS * easeInverse(x / width) + Math.random() * 60;
      out[o + 9] = LIFE_MIN + Math.random() * LIFE_SPAN;
      n += 1;
    }
  }
  return { grains: out.subarray(0, n * 10), count: n, size: Math.max(1.2, step * 0.9) };
};

/* ── 画灰 ──────────────────────────────── */

const GRAIN_VS = `
attribute vec2 a_pos; attribute vec4 a_color; attribute vec2 a_seed; attribute vec2 a_time;
uniform vec2 u_view; uniform float u_now; uniform float u_dpr; uniform float u_size;
varying vec4 v_color;
void main() {
  float age = (u_now - a_time.x) / a_time.y;
  if (age < 0.0 || age > 1.0) { gl_Position = vec4(2.0, 2.0, 0.0, 1.0); gl_PointSize = 0.0; v_color = vec4(0.0); return; }
  float out_ = 1.0 - (1.0 - age) * (1.0 - age);
  // 风从左往右：往右飘、带一点上扬，越飘越散；再叠一点打旋。
  vec2 wind = vec2(150.0 + 280.0 * a_seed.x, -(30.0 + 130.0 * a_seed.y)) * out_;
  wind.y -= 50.0 * age * age * a_seed.x;
  vec2 swirl = vec2(sin(age * 7.0 + a_seed.y * 31.0), cos(age * 6.0 + a_seed.x * 29.0)) * (3.0 + 12.0 * a_seed.y) * age;
  vec2 p = a_pos + wind + swirl;
  gl_Position = vec4(p.x / u_view.x * 2.0 - 1.0, 1.0 - p.y / u_view.y * 2.0, 0.0, 1.0);
  gl_PointSize = max(1.0, mix(u_size * (0.9 + 0.8 * a_seed.x), 0.5, age) * u_dpr);
  float grey = dot(a_color.rgb, vec3(0.3, 0.59, 0.11));
  vec3 ash = mix(a_color.rgb, vec3(grey * 0.85 + 0.08), smoothstep(0.05, 0.6, age));
  v_color = vec4(ash, a_color.a * (1.0 - smoothstep(0.3, 1.0, age)));
}`;
const GRAIN_FS = `
precision mediump float;
varying vec4 v_color;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r = dot(d, d);
  if (r > 0.25) discard;
  float a = v_color.a * (1.0 - smoothstep(0.1, 0.25, r));
  gl_FragColor = vec4(v_color.rgb * a, a);
}`;
/** 风的前沿：一条很淡的光，前沿处最亮，往后（左边）拖一段尾巴慢慢淡掉。 */
const BAND_VS = `attribute vec2 a_quad; void main() { gl_Position = vec4(a_quad, 0.0, 1.0); }`;
const BAND_FS = `
precision mediump float;
uniform float u_front; uniform float u_dpr; uniform vec3 u_tint; uniform float u_alpha;
void main() {
  float d = gl_FragCoord.x / u_dpr - u_front;
  float glow = d < 0.0 ? exp(d / 180.0) * 0.5 + exp(-(d * d) / 2400.0) * 0.5 : exp(-(d * d) / 1800.0);
  float a = glow * u_alpha;
  gl_FragColor = vec4(u_tint * a, a);
}`;

const compile = (gl: WebGLRenderingContext, vs: string, fs: string): WebGLProgram | null => {
  const program = gl.createProgram();
  if (!program) return null;
  for (const [type, source] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]] as const) {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return null;
    gl.attachShader(program, shader);
  }
  gl.linkProgram(program);
  return gl.getProgramParameter(program, gl.LINK_STATUS) ? program : null;
};

/** 光带的颜色：品牌色。 */
const tintOf = (): [number, number, number] => {
  const probe = document.createElement('span');
  probe.style.color = 'var(--accent)';
  document.body.appendChild(probe);
  const match = getComputedStyle(probe).color.match(/[\d.]+/g)?.map(Number) ?? [140, 200, 90];
  probe.remove();
  return [match[0]! / 255, match[1]! / 255, match[2]! / 255];
};

type Dust = { canvas: HTMLCanvasElement; draw: (now: number) => boolean; dispose: () => void };

const makeDust = (grains: Float32Array, count: number, size: number, width: number, height: number): Dust | null => {
  const dpr = window.devicePixelRatio || 1;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, {
    position: 'fixed', inset: '0', width: `${width}px`, height: `${height}px`, zIndex: '2147483000', pointerEvents: 'none',
    viewTransitionName: 'ash-dust',
  });
  const gl = canvas.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: false });
  if (!gl) return null;
  const grain = compile(gl, GRAIN_VS, GRAIN_FS);
  const band = compile(gl, BAND_VS, BAND_FS);
  if (!grain || !band) return null;
  const grainBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, grainBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, grains, gl.STATIC_DRAW);
  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.viewport(0, 0, canvas.width, canvas.height);
  const tint = tintOf();
  const dark = document.documentElement.dataset.theme !== 'light';

  const attrs = (['a_pos', 'a_color', 'a_seed', 'a_time'] as const).map((name) => gl.getAttribLocation(grain, name));
  const sizes = [2, 4, 2, 2];
  const offsets = [0, 2, 6, 8];
  const u = (program: WebGLProgram, name: string) => gl.getUniformLocation(program, name);
  const end = SWEEP_MS + 80 + LIFE_MIN + LIFE_SPAN;

  const draw = (now: number) => {
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    // 光带：前沿还在屏内时画，两头淡入淡出。
    const p = now / SWEEP_MS;
    if (p > 0 && p < 1.15) {
      gl.useProgram(band);
      gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      const loc = gl.getAttribLocation(band, 'a_quad');
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      gl.uniform1f(u(band, 'u_front'), ease(p) * width);
      gl.uniform1f(u(band, 'u_dpr'), dpr);
      gl.uniform3f(u(band, 'u_tint'), tint[0], tint[1], tint[2]);
      gl.uniform1f(u(band, 'u_alpha'), (dark ? 0.08 : 0.12) * Math.sin(Math.PI * Math.min(1, p)) ** 0.5);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.disableVertexAttribArray(loc);
    }
    gl.useProgram(grain);
    gl.bindBuffer(gl.ARRAY_BUFFER, grainBuffer);
    attrs.forEach((loc, i) => {
      if (loc < 0) return;
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, sizes[i]!, gl.FLOAT, false, 40, offsets[i]! * 4);
    });
    gl.uniform2f(u(grain, 'u_view'), width, height);
    gl.uniform1f(u(grain, 'u_now'), now);
    gl.uniform1f(u(grain, 'u_dpr'), dpr);
    gl.uniform1f(u(grain, 'u_size'), size);
    gl.drawArrays(gl.POINTS, 0, count);
    return now < end;
  };
  const dispose = () => {
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    canvas.remove();
  };
  return { canvas, draw, dispose };
};

/* ── 换场 ──────────────────────────────── */

let running: { finish: () => void } | null = null;

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/**
 * 换语言并放「响指」。上一次还没放完又换：上一次直接收尾，这一次照常放。
 * 放不了（减少动效、内核不支持、扫不到字）就直接换。
 */
export const switchLocaleWithAsh = async (value: Locale): Promise<void> => {
  if (value === locale.value) return;
  running?.finish();
  const doc = document as ViewTransitionDocument;
  if (!doc.startViewTransition || reducedMotion()) {
    setLocale(value);
    return;
  }
  // 语言包先到：换上去的第一帧就是新语言，不会先露出英文兜底、过一会儿再变（那又是一跳）。
  await Promise.race([ensureLocalePack(value), new Promise((resolve) => window.setTimeout(resolve, 600))]);
  if (value === locale.value) return;

  const width = window.innerWidth;
  const height = window.innerHeight;
  const ctx = drawVisibleText(width, height);
  const picked = ctx ? grainsOf(ctx, width, height) : null;
  const dust = picked ? makeDust(picked.grains, picked.count, picked.size, width, height) : null;
  if (!dust) {
    setLocale(value);
    return;
  }

  const root = document.documentElement;
  root.dataset.ashMorph = '';
  let raf = 0;
  let done = false;
  let sweep: Animation | null = null;
  const finish = () => {
    if (done) return;
    done = true;
    cancelAnimationFrame(raf);
    transition.skipTransition();
    dust.dispose();
    delete root.dataset.ashMorph;
    if (running?.finish === finish) running = null;
  };
  running = { finish };

  // 灰的画布在新的一侧才出现：换场期间它是独立的一层（view-transition-name），画在两张快照上面。
  const transition = doc.startViewTransition(async () => {
    setLocale(value);
    document.body.appendChild(dust.canvas);
    await nextTick();
  });
  void transition.finished.catch(() => undefined).finally(() => { delete root.dataset.ashMorph; });

  try {
    await transition.ready;
  } catch {
    finish();
    return;
  }
  // 新快照套一道从左往右推进的裁切（和灰粒起飞、光带同一条缓动，逐点采样后线性插值）。
  const frames: Keyframe[] = Array.from({ length: 31 }, (_, i) => ({
    // 起点留 2px 的一条缝而不是零宽：零宽时新快照整张被跳过、不上 GPU，开扫后第一帧才现传，卡 100ms（和主题扩散的 2px 同理）。
    clipPath: `inset(0 max(0px, calc(${((1 - ease(i / 30)) * 100).toFixed(2)}% - 2px)) 0 0)`,
    offset: i / 30,
  }));
  sweep = root.animate(frames, { duration: SWEEP_MS, easing: 'linear', fill: 'both', pseudoElement: '::view-transition-new(root)' });
  // 和主题扩散一样：先停在起点（画面上还是旧语言），等两张整屏快照上了 GPU、帧节奏平稳再扫。
  sweep.pause();
  await whenFramesSteady();
  if (done) return;
  sweep.play();
  let base: number | null = null;
  const tick = (ts: number) => {
    if (done) return;
    // 用扫描动画自己的时间：光带、灰粒和裁切的边严丝合缝。动画结束（换场收尾）以后接着按同一个起点走。
    if (base === null && sweep?.startTime != null) base = Number(sweep.startTime);
    const now = base === null ? 0 : ts - base;
    if (!dust.draw(now)) {
      finish();
      return;
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
};
