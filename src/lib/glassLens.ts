/**
 * 玻璃胶囊的折射（原型，2026-09-30）。借 liquidGL（MIT）的思路：胶囊是一块边缘带斜面的玻璃，
 * 边上把背后的内容往里拉、中间略微放大。
 *
 * liquidGL 自己把整页 DOM 光栅化成纹理再用 WebGL 画——我们的 CSP 拦 data: 图片和 blob: Worker，
 * 动态内容还要每 250ms 重拍一次整页。这里改用浏览器现成的：`backdrop-filter: url(#滤镜)` +
 * SVG feDisplacementMap，只在元素那一小块上折射，由合成器按帧重做。
 *
 * - 位移图是构建时生成的实体 PNG（scripts/assets/build-glass-lens-maps.py），运行时拉伸到元素大小。
 * - `backdrop-filter` 里的 `url()` 目前只有 Chromium 真的画（Windows 的 WebView2 就是）；别的内核
 *   认不出整条声明会作废、连模糊都没了，所以只在 Chromium 上开，其余照旧。
 * - 系统要求减少透明度时不开。
 * - 开关：地址里 `?lens=1` 打开、`?lens=0` 关掉，记在本机（原型阶段先不进设置页）。
 */
import { ref } from 'vue';
import thumbMap from '../assets/glass/lens-thumb.png';
import rimMap from '../assets/glass/lens-rim.png';

const SVG_NS = 'http://www.w3.org/2000/svg';
const FLAG_KEY = 'zeppbridge.glassLens';

const readFlag = (): boolean => {
  try {
    const fromQuery = new URLSearchParams(window.location.search).get('lens');
    if (fromQuery === '1' || fromQuery === '0') {
      window.localStorage.setItem(FLAG_KEY, fromQuery);
      return fromQuery === '1';
    }
    return window.localStorage.getItem(FLAG_KEY) === '1';
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

export type LensKind = 'thumb' | 'rim';

/** 每种透镜的位移强度（占元素高度的比例）：滑块弯得明显，外沿只是一圈。 */
const SCALE: Record<LensKind, number> = { thumb: 0.4, rim: 0.5 };
const MAPS: Record<LensKind, string> = { thumb: thumbMap, rim: rimMap };

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

export interface LensFilter {
  /** 用在 `backdrop-filter` 里的那一段：`url(#…)`。 */
  ref: string;
  /** 元素尺寸变了：位移图和滤镜区域跟着拉到新尺寸。 */
  resize: (width: number, height: number) => void;
  dispose: () => void;
}

export const createLensFilter = (kind: LensKind): LensFilter => {
  const id = `zb-lens-${kind}-${(seq += 1)}`;
  const filter = document.createElementNS(SVG_NS, 'filter');
  filter.setAttribute('id', id);
  filter.setAttribute('filterUnits', 'userSpaceOnUse');
  filter.setAttribute('primitiveUnits', 'userSpaceOnUse');
  filter.setAttribute('color-interpolation-filters', 'sRGB');
  const image = document.createElementNS(SVG_NS, 'feImage');
  image.setAttribute('href', MAPS[kind]);
  image.setAttribute('preserveAspectRatio', 'none');
  image.setAttribute('result', 'map');
  const displace = document.createElementNS(SVG_NS, 'feDisplacementMap');
  displace.setAttribute('in', 'SourceGraphic');
  displace.setAttribute('in2', 'map');
  displace.setAttribute('xChannelSelector', 'R');
  displace.setAttribute('yChannelSelector', 'G');
  displace.setAttribute('result', 'bent');
  // 折弯以后很轻地抹一下：8 位位移图的台阶在字的边上会显出锯齿。
  const smooth = document.createElementNS(SVG_NS, 'feGaussianBlur');
  smooth.setAttribute('in', 'bent');
  smooth.setAttribute('stdDeviation', '0.35');
  filter.append(image, displace, smooth);
  ensureHost().appendChild(filter);

  let last = '';
  const resize = (width: number, height: number) => {
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    const key = `${w}x${h}`;
    if (key === last) return;
    last = key;
    for (const el of [filter, image]) {
      el.setAttribute('x', '0');
      el.setAttribute('y', '0');
      el.setAttribute('width', String(w));
      el.setAttribute('height', String(h));
    }
    displace.setAttribute('scale', String(Math.round(h * SCALE[kind])));
  };

  return { ref: `url(#${id})`, resize, dispose: () => filter.remove() };
};
