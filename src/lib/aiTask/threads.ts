/**
 * 「交给 AI」舞台中间的线（2026-10-08 横向舞台；第三轮 10-08 晚按录屏反馈重做）：门锁牵着左边每一张牌。
 *
 * - 不做中心化的星形：锁的左沿出 1–3 根主干（按牌**本来的**上下位置分组），主干走到锁左边一段固定距离处分叉，
 *   每张牌一根枝。
 * - 枝是**一整段平滑的斜曲线**，从分叉点直接弯到牌上朝着锁的那一边（牌在锁左边接右沿、被拖到右边接左沿）。
 *   第二轮的直角走廊（先弯到牌心那一行、再水平穿牌缝、挡住了换走廊）去掉了：用户说「路径是直角拐角、不能斜切」，
 *   而且拖一张牌时走廊一换、分叉点一挪，所有的线一起乱跳。线画在牌下面，从牌后面穿过去不碍事。
 * - **分叉点只看锁和牌的本来位置**（`Port.ry`），不看被拖着的那张此刻在哪：拖牌时只有那一根枝跟着动，
 *   别的线只随被挤开的牌（cloudPhysics.ts）轻轻晃一下，像 Obsidian 的关系图。
 * - 右边那一束收成一把丝——三根几乎贴在一起，到右牌那头才微微散开。
 * 坐标是舞台内的像素。`sampleStrand` 把一张牌那根线按「牌 → 锁」取点，给汇聚动画当关键帧。
 */
export interface Pt { x: number; y: number }
export interface Cubic { a: Pt; b: Pt; c: Pt; d: Pt }
/** 牌上接线的那一点；`side` 是这一点在牌的哪一边（right = 牌在锁左边）；`ry` 是牌本来的高度，分组只看它。 */
export interface Port { id: string; x: number; y: number; side?: 'left' | 'right'; ry?: number }
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

/**
 * 从分叉点到牌：一整段三次曲线。从分叉点**朝牌的方向**水平出发，到牌那头**从牌外侧**水平接进来，
 * 中间自然斜过去（`stiff` 越大两头越平、中段越斜）。
 */
export const branchCurve = (fork: Pt, port: Port, stiff = 0.5): Cubic => {
  const end = { x: port.x, y: port.y };
  const span = Math.max(36, Math.abs(end.x - fork.x));
  const outward = end.x < fork.x ? -1 : 1;
  const into = port.side === 'left' ? -1 : 1;
  return { a: fork, b: { x: fork.x + outward * span * stiff, y: fork.y }, c: { x: end.x + into * span * stiff, y: end.y }, d: end };
};

/** 分叉点离锁左沿多远：锁和牌堆之间那段空地的三成，至少 40、至多 120。只看版式，拖牌时不变。 */
const forkGap = (origin: Pt, edge: number) => Math.max(40, Math.min(120, (origin.x - edge) * 0.3));

/**
 * `edge`：牌堆（撒牌区）的右沿，算分叉点的固定位置用；不给就按各牌本来位置里最靠右的那张估。
 * 第五个参数以前是要绕开的牌（直角走廊），现在线从牌后面斜着穿过去，不再需要；留着签名只为兼容老调用。
 */
export const threadTree = (lock: Pt, radius: number, ports: Port[], target: { x: number; y: number; h: number } | null, _obstacles: Obstacle[] = [], edge?: number): ThreadTree => {
  const origin = { x: lock.x - radius, y: lock.y };
  const restY = (p: Port) => p.ry ?? p.y;
  const sorted = [...ports].sort((p, q) => restY(p) - restY(q) || p.id.localeCompare(q.id));
  const groups = trunkCount(sorted.length);
  const size = Math.ceil(sorted.length / Math.max(1, groups));
  const right = edge ?? (ports.length ? Math.max(...ports.map((p) => p.x)) : origin.x - 200);
  const forkX = origin.x - forkGap(origin, Math.min(right, origin.x - 60));
  const trunks: Cubic[] = [];
  const strands: Strand[] = [];
  for (let g = 0; g * size < sorted.length; g += 1) {
    const members = sorted.slice(g * size, (g + 1) * size);
    const meanY = members.reduce((sum, p) => sum + restY(p), 0) / members.length;
    const fork = { x: forkX, y: lerp(origin.y, meanY, 0.62) };
    trunks.push(ease(origin, fork, 0.5));
    for (const port of members) strands.push({ id: port.id, trunk: trunks.length - 1, branch: [branchCurve(fork, port)] });
  }
  const bundle = target
    ? [-1, 0, 1].map((k) => {
      const from = { x: lock.x + radius, y: lock.y };
      const to = { x: target.x, y: target.y + k * 3 };
      const q = ease(from, to, 0.5);
      // 一把丝：中段微微下垂、彼此错开一两个像素，两头收拢。
      return { ...q, b: { ...q.b, y: q.b.y + 6 + k }, c: { ...q.c, y: q.c.y + 6 - k } };
    })
    : [];
  return { origin, trunks, strands, right: bundle };
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

/* ---------- 交出动画的路线（2026-10-28「加附件」）：按弧长等距取点，牌和收线的虚线才对得上 ---------- */

/** 直线写成三次曲线，好和别的段拼成一条路线。 */
const line = (a: Pt, d: Pt): Cubic => ({ a, b: { x: lerp(a.x, d.x, 1 / 3), y: lerp(a.y, d.y, 1 / 3) }, c: { x: lerp(a.x, d.x, 2 / 3), y: lerp(a.y, d.y, 2 / 3) }, d });
const backwards = (q: Cubic): Cubic => ({ a: q.d, b: q.c, c: q.b, d: q.a });

/** 一张牌飞进锁的路线：枝倒着走（牌 → 分叉）、主干倒着走（分叉 → 锁左沿），再钻进锁心 `center`。 */
export const strandRoute = (tree: ThreadTree, id: string, center: Pt): Cubic[] => {
  const strand = tree.strands.find((s) => s.id === id);
  if (!strand) return [];
  return [...[...strand.branch].reverse().map(backwards), backwards(tree.trunks[strand.trunk]!), line(tree.origin, center)];
};

/** 附件的路线：从锁心出来，沿右边那束线的中间一根走到右牌左沿，再弯进托盘里它那一格 `slot`。 */
export const slotRoute = (tree: ThreadTree, center: Pt, radius: number, slot: Pt): Cubic[] => {
  const mid = tree.right[1] ?? tree.right[0];
  if (!mid) return [line(center, { x: center.x + radius, y: center.y }), ease({ x: center.x + radius, y: center.y }, slot)];
  return [line(center, mid.a), mid, ease(mid.d, slot, 0.5)];
};

/** 一条路线按弧长等距取的 `n` 个点（含两端）；`marks[k]` 是第 k 段走完时的弧长占比（0–1）。 */
export interface Trace { points: Pt[]; marks: number[] }

export const traceEven = (route: Cubic[], n = 24): Trace => {
  if (!route.length) return { points: [], marks: [] };
  const STEPS = 48;
  const dense: Array<{ p: Pt; s: number }> = [{ p: route[0]!.a, s: 0 }];
  const ends: number[] = [];
  let s = 0;
  for (const q of route) {
    let last = q.a;
    for (let i = 1; i <= STEPS; i += 1) {
      const p = cubicPoint(q, i / STEPS);
      s += Math.hypot(p.x - last.x, p.y - last.y);
      dense.push({ p, s });
      last = p;
    }
    ends.push(s);
  }
  const total = s || 1;
  const points: Pt[] = [];
  let j = 0;
  for (let i = 0; i < n; i += 1) {
    const at = (i / Math.max(1, n - 1)) * total;
    while (j < dense.length - 2 && dense[j + 1]!.s < at) j += 1;
    const a = dense[j]!;
    const b = dense[j + 1] ?? a;
    const f = b.s > a.s ? Math.min(1, (at - a.s) / (b.s - a.s)) : 0;
    points.push({ x: lerp(a.p.x, b.p.x, f), y: lerp(a.p.y, b.p.y, f) });
  }
  return { points, marks: ends.map((e) => e / total) };
};
