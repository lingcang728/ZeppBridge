/**
 * 玻璃的折射（第四版，2026-10-01）。用在所有能拖的胶囊和滚轮上（composables/useGlassLens.ts）。
 *
 * iOS 26 Liquid Glass 的边是三样东西叠起来的：
 * - **放大**：斜面往里取样、越靠边位移越大，边上那一圈的内容被拉开（scripts/assets/build-glass-lens-maps.py）。
 *   第三版往外取样、位移往里递减，结果是缩小，同一段字还被画两遍——方向反了。
 * - **模糊**：越靠边越糊，正中一个像素都不重采样。
 * - **散射**：玻璃边缘本身把光散开，泛一层很淡的乳白；外加一点色散（红、绿、蓝三路折得略不一样）。
 * 强度都跟着位移图里的位移大小走，所以三样是一起从边上往里淡掉的，没有分界线。
 *
 * 实现是浏览器现成的 `backdrop-filter: url(#滤镜)` + SVG 滤镜，由合成器按帧重做。往里取样不会越出元素，
 * 所以不用像第三版那样把元素四周撑大。Chromium 的一个实测前提（2026-10-01）：祖先只要有
 * backdrop-filter / filter / mask，透镜就只看得见那个祖先里面的东西、输出还会把原图换掉（发暗的方块），
 * 这种情况 useGlassLens 检测到就不挂；浮动导航的毛玻璃因此画在轨道里的一层（SegmentTrack 的 .segment-glass），
 * 顶栏图标组用 .glass-control.is-lens-host。
 *
 * 位移图是构建时生成的实体 PNG：左端帽、中段、右端帽三张，运行时按元素真实宽高摆好拼起来，
 * 任何长宽比都是正确的半圆端。
 *
 * 滤镜按元素尺寸摆，尺寸一变就要重摆（Chromium 会重建整条滤镜），所以组件让浮起来的透镜在运动中**保持同一尺寸**，
 * 只用 transform 移动（SegmentTrack）。
 *
 * - `backdrop-filter` 里的 `url()` 目前只有 Chromium 真的画（Windows 的 WebView2 就是）；别的内核
 *   认不出整条声明会作废、连模糊都没了，所以只在 Chromium 上开，其余照旧。
 * - 系统要求减少透明度时不开。
 * - 默认开。地址里 `?lens=0` 关掉、`?lens=1` 打开，记在本机（对比用；还没进设置页）。
 */
import { ref } from 'vue';
import lensCapL from '../assets/glass/lens-cap-l.png';
import lensCapR from '../assets/glass/lens-cap-r.png';
import lensMid from '../assets/glass/lens-mid.png';
import rimCapL from '../assets/glass/rim-cap-l.png';
import rimCapR from '../assets/glass/rim-cap-r.png';
import rimMid from '../assets/glass/rim-mid.png';

const SVG_NS = 'http://www.w3.org/2000/svg';
const FLAG_KEY = 'zeppbridge.glassLens';

const readFlag = (): boolean => {
  try {
    const fromQuery = new URLSearchParams(window.location.search).get('lens');
    if (fromQuery === '1' || fromQuery === '0') {
      window.localStorage.setItem(FLAG_KEY, fromQuery);
      return fromQuery === '1';
    }
    // 默认开（用户 2026-09-30 看过第二版后定）；`?lens=0` 关掉并记住。
    return window.localStorage.getItem(FLAG_KEY) !== '0';
  } catch {
    return false;
  }
};

/** 这台机器画得出来：Chromium 内核、认得 url() 形式的 backdrop-filter、没要求减少透明度。 */
export const lensSupported = (): boolean => {
  if (typeof window === 'undefined' || typeof CSS === 'undefined') return false;
  if (!/Chrome\//.test(navigator.userAgent)) return false;
  if (!CSS.supports('backdrop-filter', 'url(#zb) blur(2px)')) return false;
  return !window.matchMedia('(prefers-reduced-transparency: reduce)').matches;
};

export const lensEnabled = ref(typeof window !== 'undefined' && readFlag());

/** `thumb`：浮起来的透镜和滚轮的镜片；`rim`：整条胶囊外沿那一圈。 */
export type LensKind = 'thumb' | 'rim';

interface LensSpec {
  maps: { capL: string; mid: string; capR: string };
  /** 最外缘的取样位移，占胶囊高度的比例（= 0.45 × 斜面宽，和位移图的生成参数对应）。 */
  strength: number;
  /** 色散：红路比绿路多折、蓝路少折这么多。 */
  dispersion: number;
  /** 最外缘的模糊半径，占胶囊高度的比例（往里按位移大小减弱）。 */
  blur: number;
  /** 最外缘那层乳白散射光的不透明度。 */
  scatter: number;
}

const SPEC: Record<LensKind, LensSpec> = {
  thumb: { maps: { capL: lensCapL, mid: lensMid, capR: lensCapR }, strength: 0.135, dispersion: 0.1, blur: 0.024, scatter: 0.06 },
  rim: { maps: { capL: rimCapL, mid: rimMid, capR: rimCapR }, strength: 0.0675, dispersion: 0.08, blur: 0.02, scatter: 0.05 },
};

let host: SVGSVGElement | null = null;
let seq = 0;

const ensureHost = (): SVGSVGElement => {
  if (host?.isConnected) return host;
  host = document.createElementNS(SVG_NS, 'svg');
  host.setAttribute('aria-hidden', 'true');
  host.setAttribute('width', '0');
  host.setAttribute('height', '0');
  host.style.position = 'absolute';
  host.style.width = '0';
  host.style.height = '0';
  host.style.pointerEvents = 'none';
  document.body.appendChild(host);
  return host;
};

const node = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string>, children: SVGElement[] = []): SVGElementTagNameMap[K] => {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
  el.append(...children);
  return el;
};

/** 只留一个颜色通道（其余清零、透明度保留）。 */
const CHANNEL: Record<'R' | 'G' | 'B', string> = {
  R: '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0',
  G: '0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0',
  B: '0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0',
};
/** 只改透明度的一条传递函数。 */
const alphaOnly = (func: Record<string, string>) => node('feComponentTransfer', {}, [
  node('feFuncA', func),
]);

export interface LensFilter {
  /** 用在 `backdrop-filter` 里的那一段：`url(#…)`。 */
  ref: string;
  /** 元素尺寸变了：位移图按新尺寸重摆。 */
  resize: (width: number, height: number) => void;
  dispose: () => void;
}

export const createLensFilter = (kind: LensKind): LensFilter => {
  const spec = SPEC[kind];
  const id = `zb-lens-${kind}-${(seq += 1)}`;
  const filter = node('filter', {
    id,
    filterUnits: 'userSpaceOnUse',
    primitiveUnits: 'userSpaceOnUse',
    'color-interpolation-filters': 'sRGB',
  });
  // 位移图：按真实几何摆左帽、中段、右帽，胶囊外透明（透明度就是胶囊形状，最后拿它裁输出）。
  // 中段左右各多伸 1px 垫在端帽下面，免得接缝处漏出一条不动的细线。
  const neutral = node('feFlood', { 'flood-color': 'rgb(128,128,0)', 'flood-opacity': '0', result: 'neutral' });
  const capL = node('feImage', { href: spec.maps.capL, preserveAspectRatio: 'none', result: 'capL' });
  const mid = node('feImage', { href: spec.maps.mid, preserveAspectRatio: 'none', result: 'mid' });
  const capR = node('feImage', { href: spec.maps.capR, preserveAspectRatio: 'none', result: 'capR' });
  const map = node('feMerge', { result: 'map' }, ['neutral', 'mid', 'capL', 'capR'].map((input) => node('feMergeNode', { in: input })));

  // 放大：三路位移（色散），绿路是标准强度，红路多折一点、蓝路少折一点；中间三路都是 0、完全重合。
  const displacers = (['R', 'G', 'B'] as const).map((channel) =>
    node('feDisplacementMap', { in: 'SourceGraphic', in2: 'map', xChannelSelector: 'R', yChannelSelector: 'G', result: `d${channel}` }));
  const isolate = (['R', 'G', 'B'] as const).map((channel) =>
    node('feColorMatrix', { in: `d${channel}`, type: 'matrix', values: CHANNEL[channel], result: `c${channel}` }));
  const sumRG = node('feComposite', { in: 'cR', in2: 'cG', operator: 'arithmetic', k1: '0', k2: '1', k3: '1', k4: '0', result: 'rg' });
  const sharp = node('feComposite', { in: 'rg', in2: 'cB', operator: 'arithmetic', k1: '0', k2: '1', k3: '1', k4: '0', result: 'sharp' });

  // 位移图的蓝通道是位移大小 m（0 = 正中，1 = 最外缘），挪到透明度上当各种权重用。
  const magnitude = node('feColorMatrix', { in: 'map', type: 'matrix', values: '0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 1 0 0', result: 'm' });
  // 模糊：糊过的那份按 m^1.6 叠在清楚的那份上面（集中在最外缘，不在透镜里留出一圈发白的环）——越靠边越糊，往里平滑过渡到清楚。
  const soft = node('feGaussianBlur', { in: 'sharp', result: 'soft' });
  const blurWeight = alphaOnly({ type: 'gamma', amplitude: '1', exponent: '1.6', offset: '0' });
  blurWeight.setAttribute('in', 'm');
  blurWeight.setAttribute('result', 'bw');
  const softIn = node('feComposite', { in: 'soft', in2: 'bw', operator: 'in', result: 'softIn' });
  const lensed = node('feMerge', { result: 'lensed' }, ['sharp', 'softIn'].map((input) => node('feMergeNode', { in: input })));
  // 散射：一层很淡的乳白，同样按 m 从边上往里淡掉。
  // 颜色走主题 token（tokens.css 的 --lens-scatter）：深色底上同样的白要淡一半，不然边上一圈发灰。
  const veilColor = node('feFlood', { 'flood-color': '#FFFFFF', result: 'white' });
  veilColor.style.setProperty('flood-color', 'var(--lens-scatter, #FFFFFF)');
  const veilWeight = alphaOnly({ type: 'linear', slope: String(spec.scatter), intercept: '0' });
  veilWeight.setAttribute('in', 'm');
  veilWeight.setAttribute('result', 'vw');
  const veil = node('feComposite', { in: 'white', in2: 'vw', operator: 'in', result: 'veil' });
  const glowed = node('feMerge', { result: 'glowed' }, ['lensed', 'veil'].map((input) => node('feMergeNode', { in: input })));
  // 只在位移明显的地方用折射结果（m 乘 12 截到 1：位移不到最大值的十二分之一就是原图），中间一个像素都不重采样。
  const rimWeight = alphaOnly({ type: 'linear', slope: '12', intercept: '0' });
  rimWeight.setAttribute('in', 'm');
  rimWeight.setAttribute('result', 'rw');
  const rim = node('feComposite', { in: 'glowed', in2: 'rw', operator: 'in', result: 'rim' });
  const shaped = node('feComposite', { in: 'rim', in2: 'map', operator: 'in', result: 'shaped' });
  // 底下垫一份原图：中间和胶囊外就是原样（背景滤镜的透明输出在 Chromium 里不总是「原样」）。
  const out = node('feMerge', {}, ['SourceGraphic', 'shaped'].map((input) => node('feMergeNode', { in: input })));

  filter.append(neutral, capL, mid, capR, map, ...displacers, ...isolate, sumRG, sharp, magnitude, soft, blurWeight, softIn, lensed,
    veilColor, veilWeight, veil, glowed, rimWeight, rim, shaped, out);
  ensureHost().appendChild(filter);

  const place = (el: SVGElement, x: number, y: number, width: number, height: number) => {
    el.setAttribute('x', String(x));
    el.setAttribute('y', String(y));
    el.setAttribute('width', String(Math.max(0, width)));
    el.setAttribute('height', String(Math.max(0, height)));
  };

  let last = '';
  const resize = (width: number, height: number) => {
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    const key = `${w}x${h}`;
    if (key === last) return;
    last = key;
    // 端帽是半高见方（比高还窄的就是个圆）。
    const r = Math.min(h / 2, w / 2);
    place(filter, 0, 0, w, h);
    place(neutral, 0, 0, w, h);
    place(capL, 0, 0, r, h);
    place(capR, w - r, 0, r, h);
    place(mid, r - 1, 0, w - 2 * r + 2, h);
    place(map, 0, 0, w, h);
    place(veilColor, 0, 0, w, h);
    // feDisplacementMap 的 (C − .5) 在 ±.5 之间，所以 scale 取最外缘位移的两倍。
    const reach = h * spec.strength * 2;
    const [dR, dG, dB] = displacers;
    dR!.setAttribute('scale', (reach * (1 + spec.dispersion)).toFixed(2));
    dG!.setAttribute('scale', reach.toFixed(2));
    dB!.setAttribute('scale', (reach * (1 - spec.dispersion)).toFixed(2));
    soft.setAttribute('stdDeviation', Math.max(0.5, h * spec.blur).toFixed(2));
  };

  return { ref: `url(#${id})`, resize, dispose: () => filter.remove() };
};
