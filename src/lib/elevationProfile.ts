import type { WorkoutSeriesSample } from '../types';

/* 坡度分布：这次运动在上坡 / 平地 / 下坡各花了多少时间（2026-11-14 用户：爬升卡平路时只剩一句话）。纯函数。
   只用真实采样：逐点海拔 + 逐点速度（没有速度就用配速换算）。缺任一样，或者能用的移动时间不到一分钟，就返回 null，不画。

   做法（和「怎么算的」里写的一致）：
   1. 海拔按 SMOOTH_S 秒滑动平均，压掉气压计 / GPS 的抖动；
   2. 相邻两点之间的距离 = 平均速度 × 时间差；速度低于 MOVING_M_S 的时间（停着）不算，间隔超过 MAX_GAP_S 的断档不算；
   3. 每攒够 STEP_M 米算一次坡度 = 落差 ÷ 距离，超过 ±GRADE_PCT% 记上坡 / 下坡，否则记平地，这一段的时间记进去。 */

export const SLOPE_METHOD = { SMOOTH_S: 30, STEP_M: 50, GRADE_PCT: 2, MOVING_M_S: 0.5, MAX_GAP_S: 60 } as const;

export interface SlopeShare {
  /** 秒。 */
  up: number;
  flat: number;
  down: number;
  total: number;
}

type Point = { t: number; alt: number; speed: number };

const speedOf = (sample: WorkoutSeriesSample): number | null => {
  if (sample.speed != null && Number.isFinite(sample.speed) && sample.speed >= 0) return sample.speed;
  // 配速是「分钟 / 公里」。
  if (sample.pace != null && Number.isFinite(sample.pace) && sample.pace > 0 && sample.pace < 60) return 1000 / (sample.pace * 60);
  return null;
};

const smooth = (points: Point[], windowMs: number): number[] => {
  const half = windowMs / 2;
  const out: number[] = [];
  let lo = 0;
  let hi = 0;
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const t = points[i]!.t;
    while (hi < points.length && points[hi]!.t <= t + half) { sum += points[hi]!.alt; hi += 1; }
    while (points[lo]!.t < t - half) { sum -= points[lo]!.alt; lo += 1; }
    out.push(sum / (hi - lo));
  }
  return out;
};

export const slopeShare = (samples: WorkoutSeriesSample[] | undefined): SlopeShare | null => {
  const { SMOOTH_S, STEP_M, GRADE_PCT, MOVING_M_S, MAX_GAP_S } = SLOPE_METHOD;
  const points: Point[] = [];
  for (const sample of samples ?? []) {
    const t = Date.parse(sample.timestamp);
    const alt = sample.altitude_m;
    const speed = speedOf(sample);
    if (!Number.isFinite(t) || alt == null || !Number.isFinite(alt) || alt < -500 || alt > 10_000 || speed === null) continue;
    points.push({ t, alt, speed });
  }
  points.sort((a, b) => a.t - b.t);
  if (points.length < 3) return null;
  const alt = smooth(points, SMOOTH_S * 1000);
  const share = { up: 0, flat: 0, down: 0 };
  let dist = 0;
  let rise = 0;
  let time = 0;
  const flush = () => {
    const grade = (rise / dist) * 100;
    share[grade > GRADE_PCT ? 'up' : grade < -GRADE_PCT ? 'down' : 'flat'] += time;
    dist = 0; rise = 0; time = 0;
  };
  for (let i = 1; i < points.length; i += 1) {
    const dt = (points[i]!.t - points[i - 1]!.t) / 1000;
    if (dt <= 0 || dt > MAX_GAP_S) continue;
    const speed = (points[i]!.speed + points[i - 1]!.speed) / 2;
    if (speed < MOVING_M_S) continue;
    dist += speed * dt;
    rise += alt[i]! - alt[i - 1]!;
    time += dt;
    if (dist >= STEP_M) flush();
  }
  // 末尾不够一段的零头：够一半才算，免得最后十几米的抖动决定一段坡。
  if (dist >= STEP_M / 2) flush();
  const total = share.up + share.flat + share.down;
  return total >= 60 ? { ...share, total } : null;
};
