/**
 * 「交给 AI」舞台中间的线（2026-10-08 横向舞台）：门锁散出去、牵着左边每一张牌的思维树。
 *
 * - 不做中心化的星形：锁的左沿出 1–3 根主干（按牌的上下位置分组），主干走到半路分叉，每张牌一根枝；
 *   另外每张牌再配两根很淡的「杂线」直接从锁连过去，控制点按序号确定性地错开——左边看上去像噪波。
 * - 右边是一束平直的平行线连到右牌的左沿（滤过以后的干净波形）。
 * - 纯函数、确定性：同一布局每次算出来一样（牌只在浮动，线不跟着抖；只有被拖的那张重算）。
 * 坐标是舞台内的像素。`sampleStrand` 把一张牌那根线按「牌 → 锁」取点，给汇聚动画当关键帧。
 */
export interface Pt { x: number; y: number }
export interface Cubic { a: Pt; b: Pt; c: Pt; d: Pt }
export interface Port { id: string; x: number; y: number }
export interface Strand { id: string; trunk: number; branch: Cubic }
export interface ThreadTree {
  /** 锁左沿的出口。 */
  origin: Pt;
  trunks: Cubic[];
  /** 每张牌一根枝（接在它那根主干的末端）。 */
  strands: Strand[];
  /** 每张牌两根淡杂线。 */
  noise: Array<{ id: string; path: Cubic }>;
  /** 右边那一束平行线。 */
  right: Cubic[];
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** 按序号取一个 [-1, 1) 的确定性小数（不用随机数：每次渲染同一张图）。 */
const wobble = (n: number) => {
  const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return (s - Math.floor(s)) * 2 - 1;
};

export const trunkCount = (n: number): number => (n <= 2 ? 1 : n <= 5 ? 2 : 3);

/** 横向的一段三次曲线：两头水平进出，弯在中间。 */
const ease = (a: Pt, d: Pt, pull = 0.45): Cubic => {
  const dx = d.x - a.x;
  return { a, b: { x: a.x + dx * pull, y: a.y }, c: { x: d.x - dx * pull, y: d.y }, d };
};

export const threadTree = (lock: Pt, radius: number, ports: Port[], target: { x: number; y: number; h: number } | null): ThreadTree => {
  const origin = { x: lock.x - radius, y: lock.y };
  const sorted = [...ports].sort((p, q) => p.y - q.y || p.x - q.x);
  const groups = trunkCount(sorted.length);
  const size = Math.ceil(sorted.length / Math.max(1, groups));
  const trunks: Cubic[] = [];
  const strands: Strand[] = [];
  for (let g = 0; g * size < sorted.length; g += 1) {
    const members = sorted.slice(g * size, (g + 1) * size);
    const reach = Math.max(...members.map((p) => p.x));
    const meanY = members.reduce((sum, p) => sum + p.y, 0) / members.length;
    const fork = { x: lerp(origin.x, reach, 0.42), y: lerp(origin.y, meanY, 0.72) };
    trunks.push(ease(origin, fork, 0.5));
    for (const port of members) strands.push({ id: port.id, trunk: trunks.length - 1, branch: ease(fork, { x: port.x, y: port.y }) });
  }
  const noise = ports.flatMap((port, i) => [0, 1].map((k) => {
    const seed = i * 2 + k + 1;
    const lift = (18 + Math.abs(wobble(seed)) * 26) * (k ? -1 : 1);
    const path = ease(origin, { x: port.x, y: port.y }, 0.3 + Math.abs(wobble(seed * 3)) * 0.3);
    return { id: port.id, path: { ...path, b: { ...path.b, y: path.b.y + lift }, c: { ...path.c, y: path.c.y - lift * 0.6 } } };
  }));
  const right = target
    ? [-2, -1, 0, 1, 2].map((k) => {
      const from = { x: lock.x + radius, y: lock.y + k * 3 };
      const to = { x: target.x, y: target.y + k * Math.min(26, target.h * 0.09) };
      return ease(from, to, 0.5);
    })
    : [];
  return { origin, trunks, strands, noise, right };
};

export const cubicPoint = ({ a, b, c, d }: Cubic, t: number): Pt => {
  const u = 1 - t;
  const w0 = u * u * u, w1 = 3 * u * u * t, w2 = 3 * u * t * t, w3 = t * t * t;
  return { x: w0 * a.x + w1 * b.x + w2 * c.x + w3 * d.x, y: w0 * a.y + w1 * b.y + w2 * c.y + w3 * d.y };
};

const r1 = (n: number) => Math.round(n * 10) / 10;
export const pathD = (cubics: Cubic[]): string => cubics.map((q, i) => `${i ? '' : `M${r1(q.a.x)} ${r1(q.a.y)}`}C${r1(q.b.x)} ${r1(q.b.y)} ${r1(q.c.x)} ${r1(q.c.y)} ${r1(q.d.x)} ${r1(q.d.y)}`).join('');

/** 一张牌那根线（枝 + 主干）从牌到锁取 `n` 个点（含两端）。 */
export const sampleStrand = (tree: ThreadTree, id: string, n = 12): Pt[] => {
  const strand = tree.strands.find((s) => s.id === id);
  if (!strand) return [];
  const trunk = tree.trunks[strand.trunk]!;
  const half = Math.max(2, Math.ceil(n / 2));
  const branch = Array.from({ length: half }, (_, i) => cubicPoint(strand.branch, 1 - i / (half - 1)));
  const stem = Array.from({ length: n - half }, (_, i) => cubicPoint(trunk, 1 - (i + 1) / (n - half)));
  return [...branch, ...stem];
};
