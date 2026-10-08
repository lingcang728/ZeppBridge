/**
 * 舞台左边那把牌的「力」（10-08 H16，用户：拖牌时线在乱动，没有 Obsidian 那种力导向的感觉）。
 *
 * 每张牌有一个本来的位置（牌位 + 用户拖过的偏移），挂在一根看不见的弹簧上；牌和牌之间互相推开——
 * 拖着一张牌靠近别的牌，别的牌被轻轻挤开；松手以后各自弹回本来的位置（被压住的那张停在推力和弹簧平衡的地方，
 * 不再两张叠在一起）。线接在牌此刻的位置上，于是也跟着轻轻晃。
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
}

/** 弹簧、阻尼（接近临界阻尼，弹回去不来回晃）、推力。 */
export const SPRING = 140;
export const DAMPING = 24;
export const PUSH = 120000;
/** 两张牌的中心在这个椭圆里（按牌宽、牌高的倍数）就互相推。 */
const REACH_X = 1.16;
const REACH_Y = 1.08;
const MAX_DT = 1 / 30;

export const positionOf = (body: CloudBody) => (body.pinned && body.at ? body.at : { x: body.rest.x + body.d.x, y: body.rest.y + body.d.y });

/** 推进一帧；返回这一帧以后是不是已经停稳（全部速度、受力都很小）。 */
export const stepCloud = (bodies: CloudBody[], card: { width: number; height: number }, dtSeconds: number): boolean => {
  const dt = Math.min(MAX_DT, Math.max(0, dtSeconds));
  const fx = new Map<string, number>();
  const fy = new Map<string, number>();
  for (const b of bodies) {
    fx.set(b.id, -SPRING * b.d.x - DAMPING * b.v.x);
    fy.set(b.id, -SPRING * b.d.y - DAMPING * b.v.y);
  }
  const rx = card.width * REACH_X;
  const ry = card.height * REACH_Y;
  for (let i = 0; i < bodies.length; i += 1) {
    for (let j = i + 1; j < bodies.length; j += 1) {
      const a = bodies[i]!;
      const b = bodies[j]!;
      const pa = positionOf(a);
      const pb = positionOf(b);
      let nx = (pa.x - pb.x) / rx;
      let ny = (pa.y - pb.y) / ry;
      let r = Math.hypot(nx, ny);
      if (r >= 1) continue;
      // 完全重合：按 id 定一个方向，别算出 NaN。
      if (r < 1e-3) { nx = a.id < b.id ? -1 : 1; ny = 0; r = 1e-3; }
      const push = PUSH * (1 - r);
      const ux = (nx / r) * push * REACH_X;
      const uy = (ny / r) * push * REACH_Y;
      // 被拿着的那张不动，另一张吃满推力；都没拿着就各让一半。
      const shareA = a.pinned ? 0 : b.pinned ? 1 : 0.5;
      const shareB = b.pinned ? 0 : a.pinned ? 1 : 0.5;
      fx.set(a.id, fx.get(a.id)! + ux * shareA);
      fy.set(a.id, fy.get(a.id)! + uy * shareA);
      fx.set(b.id, fx.get(b.id)! - ux * shareB);
      fy.set(b.id, fy.get(b.id)! - uy * shareB);
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
