/**
 * 年轮的木头（2026-10-27 第六版：用户要「正常树木的年轮颜色」，给了真树桩横截面和木头风格界面的参考图）：
 * 一块实心的木片——中间偏红偏深（心材）、外面浅黄（边材），每圈里有一道道细密的木纹、靠外沿深一层（晚材），
 * 几道很淡的木射线，最外一圈粗糙的深色树皮。木头的颜色不跟界面主题走（深色 / 浅色下都是同一块木头），
 * 只有木片下面的投影和外面的月份刻度跟着主题（tokens.css 的 `--wood-shadow` / `--wood-guide`）。
 * 这里只出几何和颜色；页面（TreeRings.vue）、履历卡缩略（RingsCard.vue）、分享图（treeSnapshot.ts）共用。
 */
import { loopPath, pointAt, SAMPLES, type RingBand, type TreeLayout } from './tree';

type Rgb = [number, number, number];
const css = ([r, g, b]: Rgb, alpha = 1) => `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${alpha})`;

/** 从髓心（0）到最外一圈（1）的木色：心材红褐 → 一圈深的过渡带 → 边材浅黄。 */
const STOPS: [number, Rgb][] = [
  [0, [200, 140, 82]], [0.2, [186, 118, 62]], [0.48, [166, 96, 46]], [0.68, [206, 156, 98]], [0.86, [234, 207, 158]], [1, [226, 192, 140]],
];
export function woodAt(f: number, shade = 1): string {
  const x = Math.min(1, Math.max(0, f));
  const j = STOPS.findIndex(([at]) => at >= x);
  const [a0, c0] = STOPS[Math.max(0, j - 1)], [a1, c1] = STOPS[Math.max(0, j)];
  const t = a1 === a0 ? 0 : (x - a0) / (a1 - a0);
  return css(c0.map((v, i) => Math.min(255, (v + (c1[i] - v) * t) * shade)) as Rgb);
}

/** 固定的木头颜色（不分深浅主题）。 */
export const WOOD = {
  late: 'rgba(112, 54, 18, .30)',
  grain: 'rgba(124, 66, 26, .16)',
  grainDark: 'rgba(98, 46, 14, .28)',
  line: 'rgba(92, 44, 14, .5)',
  ray: 'rgba(255, 238, 210, .13)',
  bark: '#4A2F1C',
  barkSide: '#22140A',
  fleck: 'rgba(160, 120, 86, .5)',
  barkCrack: 'rgba(20, 10, 4, .6)',
  cambium: '#9C5826',
  lit: 'rgba(255, 244, 218, .24)',
  selected: 'rgba(255, 240, 204, .42)',
  halo: 'rgba(255, 244, 214, .55)',
  mark: '#5E2C0C',
  tick: 'rgba(80, 36, 10, .6)',
  tickHot: '#2E1404',
  label: 'rgba(74, 36, 12, .8)',
  labelHalo: 'rgba(250, 232, 200, .55)',
  pith: '#5A2E12',
  sheen: 'rgba(255, 250, 232, .2)',
};

const hash = (n: number) => { const x = Math.sin(n * 12.9898) * 43758.5453; return x - Math.floor(x); };
const mean = (radii: number[]) => radii.reduce((a, b) => a + b, 0) / radii.length;

/** 这一圈的底色：取它在整块木头里的位置，每年再有一点点深浅不同。 */
export const bandWood = (band: RingBand, radius: number) =>
  woodAt((mean(band.inner) + mean(band.outer)) / 2 / radius, 1 + 0.05 * Math.sin(band.year * 2.1 + 0.6));

/** 这一圈里从 `a` 到 `b`（0 = 内沿，1 = 外沿）的那一层（配 `fill-rule: evenodd`）。 */
export function slicePath(band: RingBand, a: number, b: number) {
  const at = (k: number) => band.inner.map((r, s) => r + (band.outer[s] - r) * k);
  return `${loopPath(at(b))}${loopPath(at(a))}`;
}

/** 圈里一道道细密的木纹：越靠外沿越密越深（晚材）。圈越宽纹越多。 */
export function grainPaths(band: RingBand) {
  const width = mean(band.outer) - mean(band.inner);
  const count = Math.max(3, Math.min(14, Math.round(width / 4.5)));
  const light: string[] = [], dark: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const t = Math.pow((i + 0.5 + 0.35 * (hash(i + band.year) - 0.5)) / count, 0.75);
    const loop = loopPath(band.inner.map((r, s) => r + (band.outer[s] - r) * t * (1 + 0.012 * Math.sin(s * 0.31 + i))));
    (t > 0.7 ? dark : light).push(loop);
  }
  return { light: light.join(''), dark: dark.join('') };
}

/** 树皮：贴着最外一圈，外沿一块块粗糙地起伏；上面是一道道深色裂纹和浅色斑点。 */
export function barkOf(layout: TreeLayout, width: number) {
  const edge = layout.bands[layout.bands.length - 1]?.outer ?? Array<number>(SAMPLES).fill(layout.pith);
  const bump = edge.map((_, s) => 0.5 * hash(Math.floor(s / 3)) + 0.25 * Math.sin(s * 0.17 + 0.4) + 0.25 * hash(s));
  const rough = edge.map((r, s) => r + width * (0.82 + 0.4 * bump[s]));
  const cracks: string[] = [], flecks: string[] = [];
  for (let s = 0; s < SAMPLES; s += 1) {
    const h = hash(s * 1.7 + 3);
    const f = (s + h) / SAMPLES;
    if (h > 0.45) {
      const a = pointAt(edge[s] + width * 0.25, f), b = pointAt(rough[s] - width * 0.05, f + (h - 0.7) * 0.004);
      cracks.push(`M${a.x.toFixed(1)} ${a.y.toFixed(1)}L${b.x.toFixed(1)} ${b.y.toFixed(1)}`);
    }
    if (h < 0.3) {
      const r = edge[s] + width * (0.35 + 0.5 * hash(s * 5.1));
      const a = pointAt(r, f), b = pointAt(r, f + 0.003);
      flecks.push(`M${a.x.toFixed(1)} ${a.y.toFixed(1)}L${b.x.toFixed(1)} ${b.y.toFixed(1)}`);
    }
  }
  return {
    outer: loopPath(rough),
    ring: `${loopPath(rough)}${loopPath(edge)}`,
    cambium: loopPath(edge.map(r => r + 1.2)),
    cracks: cracks.join(''),
    flecks: flecks.join(''),
    radius: Math.max(...rough),
  };
}

/** 几道很淡的木射线：从髓心附近往外，长短不一。 */
export function raysOf(layout: TreeLayout, count = 22) {
  const reach = layout.radius;
  return Array.from({ length: count }, (_, i) => {
    const f = (i + 0.8 * (hash(i * 2.3) - 0.5)) / count;
    const from = layout.pith * 1.6 + reach * 0.1 * hash(i * 4.1);
    const to = reach * (0.5 + 0.48 * hash(i * 7.7));
    const a = pointAt(from, f), b = pointAt(to, f);
    return `M${a.x.toFixed(1)} ${a.y.toFixed(1)}L${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
  }).join('');
}
