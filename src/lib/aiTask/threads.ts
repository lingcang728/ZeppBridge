/**
 * 「交给 AI」舞台中间的线（2026-10-08 横向舞台；同日第二轮按用户反馈收拾）：门锁牵着左边每一张牌。
 *
 * - 不做中心化的星形：锁的左沿出 1–3 根主干（按牌的上下位置分组），主干走到牌堆和锁之间那片空地里分叉，
 *   每张牌一根枝，接在牌的右沿。
 * - **枝不斜穿牌堆**：先在牌堆右沿外的空地里弯到牌心那一行，再水平穿过牌缝进去（牌按砖缝错开摆，cloud.ts）；
 *   被拖过的牌挡住了就换到最近的空走廊，到牌跟前再接上。确定性，拖牌时只是重算一遍。
 * - 第一轮那些「杂线」去掉了（用户：左边的线太乱）；右边那一束收成一把丝——三根几乎贴在一起，
 *   到右牌那头才微微散开。
 * 坐标是舞台内的像素。`sampleStrand` 把一张牌那根线按「牌 → 锁」取点，给汇聚动画当关键帧。
 */
export interface Pt { x: number; y: number }
export interface Cubic { a: Pt; b: Pt; c: Pt; d: Pt }
export interface Port { id: string; x: number; y: number }
/** 牌的矩形（舞台坐标）：枝要绕开的东西。 */
export interface Obstacle { id: string; x: number; y: number; width: number; height: number }
export interface Strand { id: string; trunk: number; branch: Cubic[] }
export interface ThreadTree {
  /** 锁左沿的出口。 */
  origin: Pt;
  trunks: Cubic[];
  /** 每张牌一根枝（接在它那根主干的末端）。 */
  strands: Strand[];
  /** 右边那一把丝。 */
  right: Cubic[];
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export const trunkCount = (n: number): number => (n <= 2 ? 1 : n <= 5 ? 2 : 3);

/** 横向的一段三次曲线：两头水平进出，弯在中间。 */
const ease = (a: Pt, d: Pt, pull = 0.45): Cubic => {
  const dx = d.x - a.x;
  return { a, b: { x: a.x + dx * pull, y: a.y }, c: { x: d.x - dx * pull, y: d.y }, d };
};

export const cubicPoint = ({ a, b, c, d }: Cubic, t: number): Pt => {
  const u = 1 - t;
  const w0 = u * u * u, w1 = 3 * u * u * t, w2 = 3 * u * t * t, w3 = t * t * t;
  return { x: w0 * a.x + w1 * b.x + w2 * c.x + w3 * d.x, y: w0 * a.y + w1 * b.y + w2 * c.y + w3 * d.y };
};

const PAD = 8;
/** 一段直线（写成三次曲线，好和别的段拼在一起）。 */
const line = (a: Pt, d: Pt): Cubic => ({ a, b: { x: lerp(a.x, d.x, 1 / 3), y: lerp(a.y, d.y, 1 / 3) }, c: { x: lerp(a.x, d.x, 2 / 3), y: lerp(a.y, d.y, 2 / 3) }, d });

/**
 * 从分叉点到牌（第二轮，像电路板 / 神经元的走线，不再斜穿牌堆）：
 * 先在牌堆右沿外面那片空地里弯到一条水平的「走廊」上，再沿走廊水平进牌堆，到牌跟前再接到牌的右沿。
 * 走廊默认就是牌心那一行（牌按砖缝错开摆，见 cloud.ts，这一行在别的牌的缝里）；
 * 被拖过的牌挡住了，就换到最近的一条不压牌的走廊（某张牌的上沿 / 下沿外面）。
 */
const route = (fork: Pt, port: Port, edge: number, obstacles: Obstacle[]): Cubic[] => {
  const end = { x: port.x, y: port.y };
  const entry = Math.max(port.x + 1, edge);
  const blocked = (y: number) => obstacles.some((o) => o.id !== port.id && o.x < entry && o.x + o.width > port.x + 2 && y > o.y - PAD && y < o.y + o.height + PAD);
  const lanes = [port.y, ...obstacles.flatMap((o) => [o.y - PAD * 1.5, o.y + o.height + PAD * 1.5])]
    .sort((a, b) => Math.abs(a - port.y) - Math.abs(b - port.y));
  const lane = lanes.find((y) => !blocked(y)) ?? port.y;
  if (entry <= port.x + 1) return [ease(fork, end, 0.5)];
  if (Math.abs(lane - port.y) < 0.5) return [ease(fork, { x: entry, y: lane }, 0.5), line({ x: entry, y: lane }, end)];
  const near = { x: Math.min(entry, port.x + 26), y: lane };
  return [ease(fork, { x: entry, y: lane }, 0.5), line({ x: entry, y: lane }, near), ease(near, end, 0.5)];
};

export const threadTree = (lock: Pt, radius: number, ports: Port[], target: { x: number; y: number; h: number } | null, obstacles: Obstacle[] = []): ThreadTree => {
  const origin = { x: lock.x - radius, y: lock.y };
  const sorted = [...ports].sort((p, q) => p.y - q.y || p.x - q.x);
  const groups = trunkCount(sorted.length);
  const size = Math.ceil(sorted.length / Math.max(1, groups));
  const reachAll = ports.length ? Math.max(...ports.map((p) => p.x), ...obstacles.map((o) => o.x + o.width)) : origin.x;
  const trunks: Cubic[] = [];
  const strands: Strand[] = [];
  for (let g = 0; g * size < sorted.length; g += 1) {
    const members = sorted.slice(g * size, (g + 1) * size);
    const meanY = members.reduce((sum, p) => sum + p.y, 0) / members.length;
    // 分叉点落在牌堆右沿和锁之间的空地里，不压在牌上。
    const fork = { x: lerp(Math.min(reachAll + 24, origin.x - 20), origin.x, 0.3), y: lerp(origin.y, meanY, 0.72) };
    trunks.push(ease(origin, fork, 0.5));
    for (const port of members) strands.push({ id: port.id, trunk: trunks.length - 1, branch: route(fork, port, reachAll + 12, obstacles) });
  }
  const right = target
    ? [-1, 0, 1].map((k) => {
      const from = { x: lock.x + radius, y: lock.y };
      const to = { x: target.x, y: target.y + k * 3 };
      const q = ease(from, to, 0.5);
      // 一把丝：中段微微下垂、彼此错开一两个像素，两头收拢。
      return { ...q, b: { ...q.b, y: q.b.y + 6 + k }, c: { ...q.c, y: q.c.y + 6 - k } };
    })
    : [];
  return { origin, trunks, strands, right };
};

const r1 = (n: number) => Math.round(n * 10) / 10;
export const pathD = (cubics: Cubic[]): string => cubics.map((q, i) => `${i ? '' : `M${r1(q.a.x)} ${r1(q.a.y)}`}C${r1(q.b.x)} ${r1(q.b.y)} ${r1(q.c.x)} ${r1(q.c.y)} ${r1(q.d.x)} ${r1(q.d.y)}`).join('');

/** 一张牌那根线（枝 + 主干）从牌到锁取 `n` 个点（含两端）。 */
export const sampleStrand = (tree: ThreadTree, id: string, n = 12): Pt[] => {
  const strand = tree.strands.find((s) => s.id === id);
  if (!strand) return [];
  const trunk = tree.trunks[strand.trunk]!;
  // 牌 → 锁：枝倒着走，再走主干（主干本身是锁 → 分叉，也倒着走）。
  const reversed = [...strand.branch].reverse().map((q) => ({ a: q.d, b: q.c, c: q.b, d: q.a }));
  const path = [...reversed, { a: trunk.d, b: trunk.c, c: trunk.b, d: trunk.a }];
  const points: Pt[] = [];
  for (let i = 0; i < n; i += 1) {
    const t = (i / (n - 1)) * path.length;
    const k = Math.min(path.length - 1, Math.floor(t));
    points.push(cubicPoint(path[k]!, t - k));
  }
  return points;
};
