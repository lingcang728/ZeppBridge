/**
 * 扑克牌动效的弹簧（精修批次 7.1）：把一根阻尼弹簧从 0 走到 1 的过程采样成 CSS `linear()` 缓动，
 * 交给 WAAPI 在合成器上放——不逐帧跑 JS，也就不会因为主线程忙而掉帧。
 *
 * 只给 transform / opacity 用。可以略微冲过头（> 1）再回来，像牌落在桌上。
 */
export interface Spring {
  stiffness: number;
  damping: number;
  mass?: number;
}

/** 牌桌上用到的几根弹簧：发牌稍软、翻面利落、落定很稳（不回弹太多，iOS 那种节奏）。 */
export const SPRINGS = {
  deal: { stiffness: 210, damping: 22 },
  flip: { stiffness: 420, damping: 32 },
  settle: { stiffness: 170, damping: 24 },
  pop: { stiffness: 520, damping: 26 },
  /** 理牌：利落地叠齐，几乎不回弹（第三轮 A1）。 */
  stack: { stiffness: 340, damping: 34 },
} as const satisfies Record<string, Spring>;

export interface SpringCurve {
  /** CSS 缓动，如 `linear(0, 0.21, …, 1)`。 */
  easing: string;
  /** 走到停稳要多少毫秒。 */
  duration: number;
}

const cache = new Map<string, SpringCurve>();

/** 采样一根弹簧。`samples` 个点等时间间隔；停稳 = 离终点不到 0.1% 且几乎不动。 */
export const springCurve = (spring: Spring, samples = 40): SpringCurve => {
  const key = `${spring.stiffness}/${spring.damping}/${spring.mass ?? 1}/${samples}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const mass = spring.mass ?? 1;
  const dt = 1 / 1000;
  const trace: number[] = [];
  let x = 0;
  let v = 0;
  let t = 0;
  // 半隐式欧拉：1ms 一步，最多 3 秒。
  while (t < 3) {
    const a = (-spring.stiffness * (x - 1) - spring.damping * v) / mass;
    v += a * dt;
    x += v * dt;
    t += dt;
    trace.push(x);
    if (Math.abs(1 - x) < 0.001 && Math.abs(v) < 0.01) break;
  }
  const points: string[] = [];
  for (let i = 0; i <= samples; i += 1) {
    const index = Math.min(trace.length - 1, Math.round((i / samples) * (trace.length - 1)));
    const value = i === 0 ? 0 : i === samples ? 1 : trace[index]!;
    points.push(String(Math.round(value * 1000) / 1000));
  }
  const curve = { easing: `linear(${points.join(', ')})`, duration: Math.round(trace.length * dt * 1000) };
  cache.set(key, curve);
  return curve;
};

/** 用户要求减少动效。 */
export const reducedMotion = (): boolean => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/** 等一组动画放完（被取消的不算报错）。 */
export const settled = (animations: Animation[]): Promise<void> =>
  Promise.all(animations.map((animation) => animation.finished.catch(() => undefined))).then(() => undefined);

/** 元素中心点。 */
export const centerOf = (rect: DOMRect): { x: number; y: number } => ({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
