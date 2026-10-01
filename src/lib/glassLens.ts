/**
 * 玻璃的折射（第三版，2026-10-01，照 iOS 26 的 Liquid Glass 重做）。用在所有能拖的胶囊和滚轮上
 * （composables/useGlassLens.ts）。
 *
 * 对着苹果 App Store 标签栏的录屏逐帧核对过：
 * - 凸玻璃的斜面把**外面**的东西折进来——透镜上下沿里是胶囊外的暗底，胶囊边线被搬进透镜一截，
 *   字刚出透镜边就被拉长、镜像。所以位移是往外取样（scripts/assets/build-glass-lens-maps.py）。
 * - 斜面很窄，中间不弯、不糊、不铺色。
 * - 边上有一点色散：红、绿、蓝三路各按略不同的强度折，透镜两端泛出彩边。
 *
 * 实现是浏览器现成的 `backdrop-filter: url(#滤镜)` + SVG feDisplacementMap，由合成器按帧重做。
 * 两个 Chromium 的实测前提（2026-10-01 在无头 Chrome 上量过）：
 * - backdrop-filter 取不到元素框外面的像素（越界的取样按边镜像）。往外取样就得让元素四周多出一圈
 *   `margin`，再用 clip-path 裁回胶囊形状（clip-path 同时裁掉背景滤镜的输出）。
 * - 祖先只要有 backdrop-filter / opacity / filter / mask，透镜就只看得见那个祖先里面的东西。
 *   所以浮动导航的毛玻璃底不再画在轨道本身，而是轨道里的一层（SegmentTrack 的 .segment-glass）。
 *
 * 位移图是构建时生成的实体 PNG：左端帽、中段、右端帽三张，运行时按元素真实宽高摆好拼起来，
 * 任何长宽比都是正确的半圆端（第二版把一张 3:1 的图硬拉伸，端头是扁的）。
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

/** `thumb`：拖动时浮起来的透镜；`rim`：整条胶囊外沿那一圈。 */
export type LensKind = 'thumb' | 'rim';

interface LensSpec {
  maps: { capL: string; mid: string; capR: string };
  /** 斜面最外缘的取样位移，占胶囊高度的比例（录屏里约 0.15：胶囊边线被搬进透镜约一成半高）。 */
  strength: number;
  /** 色散：红、蓝两路比绿路多折 / 少折这么多。 */
  dispersion: number;
}

const SPEC: Record<LensKind, LensSpec> = {
  thumb: { maps: { capL: lensCapL, mid: lensMid, capR: lensCapR }, strength: 0.15, dispersion: 0.2 },
  rim: { maps: { capL: rimCapL, mid: rimMid, capR: rimCapR }, strength: 0.07, dispersion: 0.15 },
};

/** 元素四周要多留多少像素给往外的取样（按胶囊高度算）。组件据此把元素往外撑、再用 clip-path 裁回。 */
export const lensMargin = (kind: LensKind, height: number): number => {
  const spec = SPEC[kind];
  return Math.ceil(height * spec.strength * (1 + spec.dispersion)) + 2;
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

const node = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string>): SVGElementTagNameMap[K] => {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
  return el;
};

/** 只留一个颜色通道（其余清零、透明度保留）。 */
const CHANNEL: Record<'R' | 'G' | 'B', string> = {
  R: '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0',
  G: '0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0',
  B: '0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0',
};

export interface LensFilter {
  /** 用在 `backdrop-filter` 里的那一段：`url(#…)`。 */
  ref: string;
  /** 元素尺寸变了（含四周的 margin）：位移图按里面那块胶囊重新摆。 */
  resize: (width: number, height: number, margin: number) => void;
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
  const map = node('feMerge', { result: 'map' });
  for (const input of ['neutral', 'mid', 'capL', 'capR']) map.appendChild(node('feMergeNode', { in: input }));

  // 三路位移：绿路是标准强度，红路多折一点、蓝路少折一点——边上泛出彩边，中间三路都是 0、完全重合。
  const channels = (['R', 'G', 'B'] as const).flatMap((channel) => [
    node('feDisplacementMap', { in: 'SourceGraphic', in2: 'map', xChannelSelector: 'R', yChannelSelector: 'G', result: `d${channel}` }),
    node('feColorMatrix', { in: `d${channel}`, type: 'matrix', values: CHANNEL[channel], result: `c${channel}` }),
  ]);
  const displacers = channels.filter((el) => el.tagName === 'feDisplacementMap');
  const sumRG = node('feComposite', { in: 'cR', in2: 'cG', operator: 'arithmetic', k1: '0', k2: '1', k3: '1', k4: '0', result: 'rg' });
  const sumRGB = node('feComposite', { in: 'rg', in2: 'cB', operator: 'arithmetic', k1: '0', k2: '1', k3: '1', k4: '0', result: 'split' });
  // 斜面上的玻璃本来就不是完全清楚的：轻轻糊一点，彩边也不再是一刀切的红蓝错位。
  const soften = node('feGaussianBlur', { in: 'split', stdDeviation: '0.35', result: 'bent' });
  // 位移图的蓝通道是「在斜面上」：拿它当透明度，只输出斜面那一圈折射结果，再按位移图的透明度裁成胶囊。
  // 中间和胶囊外一律透明——背景滤镜的透明输出就是原样的背景，中间一个像素都不重采样、也不会重画一遍。
  // （以前中间叠一份 SourceGraphic：放在毛玻璃按钮组里时，透镜只看得见组里半透明的内容，叠一份就暗一块；
  // 那种情况下 Chromium 也不拿 clip-path 裁背景滤镜，暗块是方的。）
  const edge = node('feColorMatrix', { in: 'map', type: 'matrix', values: '0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 1 0 0', result: 'edge' });
  const rim = node('feComposite', { in: 'bent', in2: 'edge', operator: 'in', result: 'rim' });
  const shaped = node('feComposite', { in: 'rim', in2: 'map', operator: 'in' });

  filter.append(neutral, capL, mid, capR, map, ...channels, sumRG, sumRGB, soften, edge, rim, shaped);
  ensureHost().appendChild(filter);

  const place = (el: SVGElement, x: number, y: number, width: number, height: number) => {
    el.setAttribute('x', String(x));
    el.setAttribute('y', String(y));
    el.setAttribute('width', String(Math.max(0, width)));
    el.setAttribute('height', String(Math.max(0, height)));
  };

  let last = '';
  const resize = (width: number, height: number, margin: number) => {
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    const m = Math.max(0, Math.round(margin));
    const key = `${w}x${h}+${m}`;
    if (key === last) return;
    last = key;
    // 里面那块胶囊：去掉四周的 margin；端帽是半高见方（比高还窄的就是个圆）。
    const iw = Math.max(1, w - 2 * m);
    const ih = Math.max(1, h - 2 * m);
    const r = Math.min(ih / 2, iw / 2);
    place(filter, 0, 0, w, h);
    place(neutral, 0, 0, w, h);
    place(capL, m, m, r, ih);
    place(capR, m + iw - r, m, r, ih);
    place(mid, m + r - 1, m, iw - 2 * r + 2, ih);
    place(map, 0, 0, w, h);
    // feDisplacementMap 的 (C − .5) 在 ±.5 之间，所以 scale 取最外缘位移的两倍。
    const reach = ih * spec.strength * 2;
    const [dR, dG, dB] = displacers;
    dR!.setAttribute('scale', (reach * (1 + spec.dispersion)).toFixed(2));
    dG!.setAttribute('scale', reach.toFixed(2));
    dB!.setAttribute('scale', (reach * (1 - spec.dispersion)).toFixed(2));
  };

  return { ref: `url(#${id})`, resize, dispose: () => filter.remove() };
};
