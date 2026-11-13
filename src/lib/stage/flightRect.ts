/**
 * 窗口飞行的矩形插值（纯函数，stageFlight 用）。舞台内换位 / 换大小时，外框从旧矩形插到新矩形，
 * 途中可见范围永远在两个槽之间（不过冲时在两槽的外接矩形内），不会盖到第三张卡。
 */
export interface Box { x: number; y: number; w: number; h: number }

export const lerpBox = (a: Box, b: Box, p: number): Box => ({
  x: a.x + (b.x - a.x) * p,
  y: a.y + (b.y - a.y) * p,
  w: Math.max(1, a.w + (b.w - a.w) * p),
  h: Math.max(1, a.h + (b.h - a.h) * p),
});

export const unionBox = (boxes: readonly Box[]): Box => {
  const l = Math.min(...boxes.map((b) => b.x));
  const t = Math.min(...boxes.map((b) => b.y));
  const r = Math.max(...boxes.map((b) => b.x + b.w));
  const d = Math.max(...boxes.map((b) => b.y + b.h));
  return { x: l, y: t, w: r - l, h: d - t };
};

export const sameBox = (a: Box, b: Box, eps = 0.5): boolean =>
  Math.abs(a.x - b.x) < eps && Math.abs(a.y - b.y) < eps && Math.abs(a.w - b.w) < eps && Math.abs(a.h - b.h) < eps;

/** CSS cubic-bezier 的数值版（逐帧采样关键帧用：WAAPI 里各层只能线性插，曲线由采样点带）。 */
export const cubicBezier = (x1: number, y1: number, x2: number, y2: number) => {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const X = (u: number) => ((ax * u + bx) * u + cx) * u;
  const Y = (u: number) => ((ay * u + by) * u + cy) * u;
  const dX = (u: number) => (3 * ax * u + 2 * bx) * u + cx;
  return (t: number): number => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    let u = t;
    for (let i = 0; i < 8; i++) {
      const e = X(u) - t;
      if (Math.abs(e) < 1e-6) return Y(u);
      const d = dX(u);
      if (Math.abs(d) < 1e-6) break;
      u -= e / d;
    }
    let [lo, hi] = [0, 1];
    u = t;
    for (let i = 0; i < 40; i++) {
      const x = X(u);
      if (Math.abs(x - t) < 1e-6) break;
      if (x < t) lo = u; else hi = u;
      u = (lo + hi) / 2;
    }
    return Y(u);
  };
};
export const easeOf = (css: string): ((t: number) => number) => {
  const m = css.match(/cubic-bezier\(([^)]+)\)/);
  if (!m) return (t) => t;
  const [a, b, c, d] = m[1].split(',').map((v) => Number(v.trim()));
  return cubicBezier(a, b, c, d);
};
