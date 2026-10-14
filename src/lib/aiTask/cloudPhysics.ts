/**
 * 舞台左边那把牌的「力」（10-08 H16，用户：拖牌时线在乱动，没有 Obsidian 那种力导向的感觉）。
 *
 * 每张牌有一个本来的位置（牌位 + 用户拖过的偏移），挂在一根看不见的弹簧上；牌和牌之间互相推开——
 * 拖着一张牌靠近别的牌，别的牌被挤开；松手以后各自弹回本来的位置（被压住的那张停在推力和弹簧平衡的地方，
 * 不再两张叠在一起）。线接在牌此刻的位置上，于是也跟着轻轻晃。
 *
 * 10-09 第二轮（用户：扰动幅度不够、没有规律；聚在一起互相重叠；回弹力度不够）：
 * - 「离得多近」按超椭圆量（p = 4，几乎是圆角矩形）：以前按椭圆量，两张牌斜着挨在一起时角还叠着。
 * - 被拿着的那张推得更远（DRAG_REACH）：周围的牌整齐地让出一圈，而不是只有碰到的那张被顶开一点。
 * - 推的方向混入「从牌心指出去」和「沿着重叠最深的那条轴」两份：牌沿着一条看得懂的方向让开，不乱转。
 * - 撒牌区四边是软墙（`bounds`）：被挤开的牌不会被推进中间的锁和右边的牌里。
 *   正被弹回去的那张（`bounce`）不吃这堵墙——它要从松手的地方整段弹回原位，墙会把这段行程掐掉。
 * - 松手被弹回的那张阻尼小一些：拖得越远，弹回来时越过头、再落回去的幅度越大。
 *
 * 纯函数：`stepCloud` 按时间步长推进一帧，调用方在 rAF 里循环，直到 `settled`。被拖着的牌 `pinned`（跟手，不受力）。
 * 半隐式欧拉，步长夹在 1/30 秒以内，掉帧也不会炸开。
 */
export interface CloudBody {
  id: string;
  /** 本来的位置（左上角，舞台坐标）。 */
  rest: { x: number; y: number };
  /** 相对本来位置的位移和速度（px、px/s）。 */
  d: { x: number; y: number };
  v: { x: number; y: number };
  /** 被手拿着：位置由手决定（`at`），不受力，但会推别的牌。 */
  pinned?: boolean;
  at?: { x: number; y: number };
  /** 刚松手、正被弹回去：阻尼小一些，带一点回弹。停稳后由调用方清掉。 */
  bounce?: boolean;
}

export interface CloudBounds { x: number; y: number; width: number; height: number }

/** 弹簧、阻尼（接近临界阻尼，弹回去不来回晃）、推力。 */
export const SPRING = 150;
export const DAMPING = 24;
/** 松手弹回那张的阻尼：约 0.45 倍临界阻尼，越过头大约一成半。 */
export const BOUNCE_DAMPING = 11;
export const PUSH = 120000;
const WALL = 900;
/** 两张都没被拿着：牌心在这个范围里（按牌宽、牌高的倍数）就互相推开，牌和牌之间至少留一道缝。 */
const REACH = { x: 1.14, y: 1.1 };
/** 一张被拿着：推得更远，周围让出一圈。 */
export const DRAG_REACH = { x: 1.62, y: 1.5 };
const P = 4;
const MAX_DT = 1 / 30;

export const positionOf = (body: CloudBody) => (body.pinned && body.at ? body.at : { x: body.rest.x + body.d.x, y: body.rest.y + body.d.y });

/** 两个牌心之间的超椭圆距离（1 = 正好碰到推的边界）和推开的方向（单位向量，从 b 指向 a）。 */
export const separation = (dx: number, dy: number, rx: number, ry: number, tie: number) => {
  let nx = dx / rx;
  let ny = dy / ry;
  // 完全重叠时只给一个极小的方向：长度若取 1，r 正好落在边界上，两张牌反而不推。
  if (Math.abs(nx) < 1e-6 && Math.abs(ny) < 1e-6) { nx = tie * 1e-3; ny = 0; }
  const r = Math.max(1e-3, (Math.abs(nx) ** P + Math.abs(ny) ** P) ** (1 / P));
  // 超椭圆在这一点的法线 ∝ (nx³, ny³)：沿重叠最深的那条轴推；再混一半径向，方向连续、不突然转向。
  const gx = Math.sign(nx) * Math.abs(nx) ** (P - 1);
  const gy = Math.sign(ny) * Math.abs(ny) ** (P - 1);
  const gl = Math.hypot(gx, gy) || 1;
  const rl = Math.hypot(nx, ny) || 1;
  const ux = gx / gl + nx / rl;
  const uy = gy / gl + ny / rl;
  const ul = Math.hypot(ux, uy) || 1;
  return { r, ux: ux / ul, uy: uy / ul };
};

/** 推进一帧；返回这一帧以后是不是已经停稳（全部速度、受力都很小）。 */
export const stepCloud = (bodies: CloudBody[], card: { width: number; height: number }, dtSeconds: number, bounds?: CloudBounds): boolean => {
  const dt = Math.min(MAX_DT, Math.max(0, dtSeconds));
  const fx = new Map<string, number>();
  const fy = new Map<string, number>();
  for (const b of bodies) {
    const damping = b.bounce ? BOUNCE_DAMPING : DAMPING;
    fx.set(b.id, -SPRING * b.d.x - damping * b.v.x);
    fy.set(b.id, -SPRING * b.d.y - damping * b.v.y);
  }
  for (let i = 0; i < bodies.length; i += 1) {
    for (let j = i + 1; j < bodies.length; j += 1) {
      const a = bodies[i]!;
      const b = bodies[j]!;
      const reach = a.pinned || b.pinned ? DRAG_REACH : REACH;
      const pa = positionOf(a);
      const pb = positionOf(b);
      const { r, ux, uy } = separation(pa.x - pb.x, pa.y - pb.y, card.width * reach.x, card.height * reach.y, a.id < b.id ? -1 : 1);
      if (r >= 1) continue;
      // 推力在边界处为零、往里线性变大：足够硬，弹簧拉不回重叠里去（平衡点离边界只差几个百分点）。
      const push = PUSH * (1 - r);
      const shareA = a.pinned ? 0 : b.pinned ? 1 : 0.5;
      const shareB = b.pinned ? 0 : a.pinned ? 1 : 0.5;
      fx.set(a.id, fx.get(a.id)! + ux * push * shareA);
      fy.set(a.id, fy.get(a.id)! + uy * push * shareA);
      fx.set(b.id, fx.get(b.id)! - ux * push * shareB);
      fy.set(b.id, fy.get(b.id)! - uy * push * shareB);
    }
  }
  if (bounds) {
    for (const b of bodies) {
      if (b.pinned || b.bounce) continue;
      const p = positionOf(b);
      const right = bounds.x + Math.max(0, bounds.width - card.width);
      const bottom = bounds.y + Math.max(0, bounds.height - card.height);
      if (p.x < bounds.x) fx.set(b.id, fx.get(b.id)! + WALL * (bounds.x - p.x));
      else if (p.x > right) fx.set(b.id, fx.get(b.id)! - WALL * (p.x - right));
      if (p.y < bounds.y) fy.set(b.id, fy.get(b.id)! + WALL * (bounds.y - p.y));
      else if (p.y > bottom) fy.set(b.id, fy.get(b.id)! - WALL * (p.y - bottom));
    }
  }
  let calm = true;
  for (const b of bodies) {
    if (b.pinned) { b.v = { x: 0, y: 0 }; continue; }
    b.v = { x: b.v.x + fx.get(b.id)! * dt, y: b.v.y + fy.get(b.id)! * dt };
    b.d = { x: b.d.x + b.v.x * dt, y: b.d.y + b.v.y * dt };
    if (Math.abs(b.v.x) > 2 || Math.abs(b.v.y) > 2 || Math.abs(fx.get(b.id)!) > 40 || Math.abs(fy.get(b.id)!) > 40) calm = false;
  }
  return calm && !bodies.some((b) => b.pinned);
};
