/**
 * 回信寄出：写好的那页折成一只纸飞机飞走（2026-10-29 用户定；以前只是卡一下、变灰）。
 *
 *   ① 那页往里折、压扁成一条（transform / opacity，外面的 ReplySheet 放）；
 *   ② 折痕中间展开出一只纸飞机：先是一条扁扁的纸，再撑开成机身和两翼；
 *   ③ 先往下一沉（像手一推），再顺着一条往右上抬的弧线飞出窗口，机头始终朝着前进的方向，越飞越小。
 *
 * 飞机挂在 body 上（fixed，压在弹窗遮罩之上）：信纸的格子是裁切的，飞不出去。放完就拆掉。
 * 只动 transform / opacity；路径按三次贝塞尔采样成关键帧，机头角度取切线方向。
 */

export type Point = { x: number; y: number };

/* 机头在纸飞机图里的朝向：从机尾 (0, 24) 指向机头 (64, 0)。 */
const NOSE_DEG = (Math.atan2(-24, 64) * 180) / Math.PI;
const W = 64;
const H = 48;

/** 从起点飞出窗口右上角的那条弧：先沉一下，再抬头。 */
export function flightPath(from: Point, viewport: { width: number; height: number }): [Point, Point, Point, Point] {
  const to = { x: viewport.width + W * 2, y: -H * 2 };
  return [
    from,
    { x: from.x + 70, y: from.y + 70 },
    { x: from.x + (to.x - from.x) * 0.55, y: Math.min(from.y, to.y) + (from.y - to.y) * 0.15 },
    to,
  ];
}

const cubic = (a: number, b: number, c: number, d: number, t: number) => {
  const u = 1 - t;
  return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
};
const slope = (a: number, b: number, c: number, d: number, t: number) => {
  const u = 1 - t;
  return 3 * u * u * (b - a) + 6 * u * t * (c - b) + 3 * t * t * (d - c);
};

/** 沿路径采样：位置、机头角度（相对图里的朝向）、大小（越远越小）。 */
export function flightFrames(path: [Point, Point, Point, Point], steps = 28): Array<Point & { angle: number; scale: number; t: number }> {
  const [p0, p1, p2, p3] = path;
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps;
    const dx = slope(p0.x, p1.x, p2.x, p3.x, t);
    const dy = slope(p0.y, p1.y, p2.y, p3.y, t);
    const heading = (Math.atan2(dy, dx) * 180) / Math.PI;
    return { t, x: cubic(p0.x, p1.x, p2.x, p3.x, t), y: cubic(p0.y, p1.y, p2.y, p3.y, t), angle: heading - NOSE_DEG, scale: 1.25 - 0.6 * t };
  });
}

const PLANE = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true">
  <path d="M0 24L64 0L24 34Z" fill="#fbf7ee"/>
  <path d="M24 34L64 0L32 48Z" fill="#ddd3c1"/>
  <path d="M24 34L32 48L28 37Z" fill="#b9ad97"/>
  <path d="M0 24L64 0L24 34" fill="none" stroke="rgb(90 70 40 / .35)" stroke-width=".8" stroke-linejoin="round"/>
</svg>`;

/** 在 rect 的中心折出一只纸飞机、飞走；飞走后 resolve。 */
export async function flyPaperPlane(rect: DOMRect): Promise<void> {
  const plane = document.createElement('div');
  plane.setAttribute('aria-hidden', 'true');
  plane.innerHTML = PLANE;
  Object.assign(plane.style, {
    position: 'fixed', left: '0', top: '0', width: `${W}px`, height: `${H}px`, zIndex: '2300', pointerEvents: 'none',
    filter: 'drop-shadow(0 10px 12px rgb(0 0 0 / .35))', willChange: 'transform, opacity',
  });
  document.body.appendChild(plane);
  const from = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  const at = (p: Point, rest: string) => `translate(${p.x - W / 2}px, ${p.y - H / 2}px) ${rest}`;
  const frames = flightFrames(flightPath(from, { width: window.innerWidth, height: window.innerHeight }));
  try {
    /* ② 一条扁扁的纸撑开成飞机（从页面的宽度收拢到飞机大小），停下时机头已经对着要飞的方向。 */
    const wide = Math.max(1.5, Math.min(6, rect.width / W));
    await plane.animate([
      { transform: at(from, `rotate(0deg) scale(${wide}, .06)`), opacity: 0.4 },
      { transform: at(from, `rotate(${frames[0]!.angle * 0.4}deg) scale(1.5, .5)`), opacity: 1, offset: 0.55 },
      { transform: at(from, `rotate(${frames[0]!.angle}deg) scale(${frames[0]!.scale})`), opacity: 1 },
    ], { duration: 380, easing: 'cubic-bezier(.3, .7, .3, 1)', fill: 'forwards' }).finished;
    /* ③ 沿弧线飞出去。 */
    await plane.animate(frames.map((frame) => ({
      offset: frame.t,
      transform: at(frame, `rotate(${frame.angle}deg) scale(${frame.scale})`),
      opacity: frame.t > 0.85 ? 1 - (frame.t - 0.85) / 0.15 : 1,
    })), { duration: 1050, easing: 'cubic-bezier(.45, 0, .35, 1)', fill: 'forwards' }).finished;
  } catch { /* 被打断（弹窗关了）也要收拾掉 */ } finally {
    plane.remove();
  }
}
