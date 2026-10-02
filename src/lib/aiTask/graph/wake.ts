/**
 * 表圈的「尾迹」：照着 iOS 相机里色调 / 色温那把刻度尺做的。
 *
 * 那把尺的指针不动、刻度在下面滑；刚从指针下面滑过去的刻度会**竖起来**，再很快落回原长，
 * 滑得越快，身后竖着的刻度越多、越高——一串由高到低的尾迹，停手以后几帧内收干净。
 *
 * 搬到圆上：拖着一个节点绕着圆心走，节点的方位就是指针；指针扫过的每一根刻度（天刻度和
 * 分刻度一视同仁，整圈是一把等距的尺）被注入一份能量，能量按指数衰减，画的时候刻度
 * 加长 `能量 × 额外长度`。注入量随角速度增长，所以慢拖只翘一两根，快甩拖出一长串。
 *
 * 纯状态 + 纯函数，测试可以直接喂位置序列。
 */

export const WAKE = {
  /** 能量半衰期（毫秒）。iOS 那把尺大约 40ms；圆上一根刻度间距更宽、人拖得也更慢，放长一点才看得见尾迹。 */
  halfLifeMs: 85,
  /** 扫过一根刻度至少给这么多能量，慢慢挪也能看见它翘一下。 */
  minDeposit: 0.72,
  /** 每帧扫过 1 根刻度时再加多少（封顶 1）。 */
  gain: 0.6,
  /** 能量低于它就当作 0（停止逐帧推进）。 */
  floor: 0.015,
} as const;

export interface DialWake {
  energy: Float32Array;
  /** 指针上一帧在尺上的连续位置（第几根刻度，可带小数）；指针不在时为 null。 */
  pos: number | null;
}

export const createWake = (total: number): DialWake => ({ energy: new Float32Array(Math.max(1, total)), pos: null });

/** 方位角 → 尺上的连续位置：第 j 根刻度在 `-π/2 + (j+1)·2π/total`。 */
export const wakePosition = (angle: number, total: number): number => {
  const turn = (angle + Math.PI / 2) / (2 * Math.PI);
  const raw = turn * total - 1;
  return ((raw % total) + total) % total;
};

/** 两个位置之间走了多少根（取绕圈最短的那个方向，带符号）。 */
const delta = (from: number, to: number, total: number) => {
  let d = to - from;
  if (d > total / 2) d -= total;
  if (d < -total / 2) d += total;
  return d;
};

/**
 * 推进一帧：先整体衰减，再给这一帧指针扫过的刻度注入能量。
 * `pos` 为 null = 指针不在（没在拖、或者拖到圆心附近方位不可靠）。
 * `strength` 0..1：离圆心越近越弱，避免在圆心附近一抖就扫过半圈。
 * 返回是否还有刻度在动（调用方据此决定要不要继续逐帧画）。
 */
export const stepWake = (wake: DialWake, pos: number | null, dtMs: number, strength = 1): boolean => {
  const { energy } = wake;
  const total = energy.length;
  const dt = Math.min(Math.max(dtMs, 0), 50);
  const decay = Math.pow(0.5, dt / WAKE.halfLifeMs);
  let live = false;
  for (let j = 0; j < total; j += 1) {
    const value = energy[j] * decay;
    energy[j] = value < WAKE.floor ? 0 : value;
    if (energy[j] > 0) live = true;
  }

  if (pos !== null && wake.pos !== null && strength > 0) {
    const d = delta(wake.pos, pos, total);
    const steps = Math.abs(d);
    if (steps > 0) {
      const perFrame = steps / Math.max(dt / 16.7, 0.25);
      const deposit = Math.min(1, WAKE.minDeposit + WAKE.gain * perFrame) * strength;
      const dir = Math.sign(d);
      // 这一帧扫过的整数刻度：先扫到的稍弱（它已经在身后走了一小段），最后扫到的最强。
      const first = dir > 0 ? Math.floor(wake.pos) + 1 : Math.ceil(wake.pos) - 1;
      for (let mark = first; dir > 0 ? mark <= wake.pos + d : mark >= wake.pos + d; mark += dir) {
        const along = Math.abs(mark - wake.pos) / steps;
        const index = ((mark % total) + total) % total;
        energy[index] = Math.max(energy[index], deposit * Math.pow(decay, 1 - along));
        live = true;
      }
    }
  }
  wake.pos = pos;
  return live;
};
